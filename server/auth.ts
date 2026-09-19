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

  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    const name = decodedToken.name || (email ? email.split('@')[0] : 'User');
    const emailVerified = Boolean(decodedToken.email_verified);
    const picture = decodedToken.picture;

    // Isolate auxiliary database synchronization so auth NEVER depends on database.json
    try {
      let userRecord = db.getUserById(uid);
      if (!userRecord) {
        db.createUser({
          id: uid,
          email: email.toLowerCase(),
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDemo: false,
        });
      }
    } catch (dbErr) {
      // Non-blocking: Authentication does NOT depend on local database storage
    }

    // Attach verified user to request object (req.user.uid = verified Firebase UID)
    (req as AuthenticatedRequest).user = {
      uid,
      id: uid,
      email,
      name,
      emailVerified,
      picture,
      isDemo: false,
    };

    next();
  } catch (err: any) {
    // CRITICAL: Return structured JSON 401 without exposing tokens or internal traces
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
