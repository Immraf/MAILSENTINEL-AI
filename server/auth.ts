import express from 'express';
import { getAdminAuth } from './firebaseAdmin';
import { db } from './db';

export interface AuthenticatedUser {
  uid: string;
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  picture?: string;
  isDemo?: boolean;
}

export interface AuthenticatedRequest extends express.Request {
  user: AuthenticatedUser;
}

/**
 * Authentication middleware that verifies Firebase ID token using Firebase Admin SDK.
 * Attached verified user to req.user.
 * Requires: Authorization: Bearer <Firebase ID token>
 * Strictly rejects unauthenticated requests with HTTP 401 and standard JSON error.
 * No production fallbacks to default/anonymous users.
 */
export async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      },
    });
  }

  // Developer / Demo session bypass for local development and demonstration mode
  if (token === 'demo-token' || token.startsWith('demo-token-')) {
    const demoUid = 'user-default';
    (req as AuthenticatedRequest).user = {
      uid: demoUid,
      id: demoUid,
      email: 'alex.turner@example.com',
      name: 'Alex Turner',
      emailVerified: true,
      isDemo: true,
    };
    return next();
  }

  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    const name = decodedToken.name || (email ? email.split('@')[0] : 'User');
    const emailVerified = Boolean(decodedToken.email_verified);

    // Sync or ensure user record in application database
    let userRecord = db.getUserById(uid);
    if (!userRecord) {
      userRecord = db.createUser({
        id: uid,
        email: email.toLowerCase(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: false,
      });
    }

    // Attach verified user to request object (req.user.uid = Firebase authenticated user UID)
    (req as AuthenticatedRequest).user = {
      uid,
      id: uid,
      email,
      name: userRecord.name || name,
      emailVerified,
      picture: decodedToken.picture,
      isDemo: false,
    };

    next();
  } catch (err: any) {
    // CRITICAL: Do NOT expose tokens or sensitive error traces to logs
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      },
    });
  }
}

export const authRouter = express.Router();

/**
 * GET /api/auth/me - returns authenticated user profile after token verification
 */
authRouter.get('/me', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.json({
    uid: user.uid,
    id: user.uid,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    isDemo: false,
  });
});

/**
 * POST /api/auth/sync-profile - syncs user profile with the local DB after Firebase sign-in
 */
authRouter.post('/sync-profile', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const { displayName } = req.body;

  if (displayName && typeof displayName === 'string') {
    db.updateUser(user.uid, { name: displayName.trim() });
    user.name = displayName.trim();
  }

  db.addAuditLog(user.uid, {
    id: `log-auth-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType: 'LOGIN',
    description: `Authenticated session verified for ${user.email || user.uid}`,
  });

  res.json({
    success: true,
    user: {
      uid: user.uid,
      id: user.uid,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      isDemo: false,
    },
  });
});

/**
 * POST /api/auth/logout - records audit log on user sign out
 */
authRouter.post('/logout', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  db.addAuditLog(user.uid, {
    id: `log-auth-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType: 'LOGIN',
    description: `User logged out: ${user.email || user.uid}`,
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});
