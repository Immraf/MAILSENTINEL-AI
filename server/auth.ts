import crypto from 'crypto';
import express from 'express';
import { db, UserRecord } from './db';

export interface AuthenticatedRequest extends express.Request {
  user: UserRecord;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(hash, 'hex'));
  } catch (err) {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Authentication middleware that attaches the verified user to req.user.
 * Falls back to default demo user if unauthenticated so initial preview remains accessible.
 */
export function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || (req.headers['x-session-token'] as string);
  let token = '';

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (token) {
    const user = db.getUserBySession(token);
    if (user) {
      (req as AuthenticatedRequest).user = user;
      return next();
    }
  }

  // Fallback to default demo user for seamless live preview exploration
  const defaultUser = db.getUserById('user-default');
  if (defaultUser) {
    (req as AuthenticatedRequest).user = defaultUser;
    return next();
  }

  // If even default user is missing, create a session
  const fallbackUser: UserRecord = {
    id: 'user-default',
    email: 'alex.carter@sentinel-demo.io',
    name: 'Alex Carter',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true,
  };
  db.createUser(fallbackUser);
  (req as AuthenticatedRequest).user = fallbackUser;
  next();
}

/**
 * Express router for authentication endpoints
 */
export const authRouter = express.Router();

authRouter.post('/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Email and password are required.' } });
    }

    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: { code: 'USER_EXISTS', message: 'An account with this email already exists.' } });
    }

    const userId = `user-${Date.now()}`;
    const token = generateSessionToken();
    const newUser: UserRecord = {
      id: userId,
      email: email.trim().toLowerCase(),
      name: name ? name.trim() : email.split('@')[0],
      passwordHash: hashPassword(password),
      sessionToken: token,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };

    db.createUser(newUser);
    db.addAuditLog(userId, {
      id: `log-auth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'LOGIN',
      description: `New user account created: ${newUser.email}`,
    });

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        isDemo: false,
      },
      token,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create user account.' } });
  }
});

authRouter.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Email and password are required.' } });
    }

    const user = db.getUserByEmail(email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    const token = generateSessionToken();
    db.updateUser(user.id, { sessionToken: token });
    db.addAuditLog(user.id, {
      id: `log-auth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'LOGIN',
      description: `User logged in: ${user.email}`,
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isDemo: Boolean(user.isDemo),
      },
      token,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to process login.' } });
  }
});

authRouter.post('/logout', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  if (user && !user.isDemo) {
    db.updateUser(user.id, { sessionToken: undefined });
    db.addAuditLog(user.id, {
      id: `log-auth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'LOGIN',
      description: `User logged out: ${user.email}`,
    });
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isDemo: Boolean(user.isDemo),
    createdAt: user.createdAt,
  });
});
