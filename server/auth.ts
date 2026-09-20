import express from 'express';
import { getAdminAuth } from './firebaseAdmin';
import { FirestoreDb } from './firestoreDb';
import { FirestoreUserDoc } from '../src/types/firestore';

export interface AuthenticatedUser {
  uid: string;
  id: string;
  email: string;
  name: string;
  displayName?: string;
  emailVerified: boolean;
  picture?: string;
  photoURL?: string;
  provider?: string;
  isDemo?: boolean;
}

export interface AuthenticatedRequest extends express.Request {
  user: AuthenticatedUser;
}

/**
 * Authentication middleware that verifies Firebase ID token using Firebase Admin SDK.
 * Attaches verified user to req.user with verified UID as permanent identity.
 * Requires: Authorization: Bearer <Firebase ID token>
 * Strictly rejects unauthenticated requests with HTTP 401 and standard JSON error.
 * No fallbacks to database.json or anonymous users.
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
    const provider = decodedToken.firebase?.sign_in_provider === 'google.com' ? 'google' : 'password';

    // Attach verified user to request object
    (req as AuthenticatedRequest).user = {
      uid,
      id: uid,
      email,
      name,
      displayName: name,
      emailVerified,
      picture,
      photoURL: picture,
      provider,
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
 * GET /api/auth/me - returns verified user profile from Firestore (/users/{uid})
 * Never exposes passwords, access tokens, refresh tokens, or encryption keys.
 */
authRouter.get('/me', authMiddleware, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  try {
    const userDoc = await FirestoreDb.getUser(user.uid);
    res.json({
      uid: user.uid,
      id: user.uid,
      email: userDoc?.email || user.email,
      displayName: userDoc?.displayName || user.name,
      photoURL: userDoc?.photoURL || user.picture || '',
      emailVerified: userDoc?.emailVerified ?? user.emailVerified,
      provider: userDoc?.provider || user.provider || 'password',
      isDemo: false,
      createdAt: userDoc?.createdAt,
      lastLoginAt: userDoc?.lastLoginAt,
    });
  } catch (err: any) {
    console.warn(`Error retrieving profile for ${user.uid}:`, err?.message || err);
    res.json({
      uid: user.uid,
      id: user.uid,
      email: user.email,
      displayName: user.name,
      photoURL: user.picture || '',
      emailVerified: user.emailVerified,
      provider: user.provider || 'password',
      isDemo: false,
    });
  }
});

/**
 * POST /api/auth/sync-profile - syncs verified user profile into Firestore (/users/{uid})
 * Updates lastLoginAt and logs LOGIN audit event in Firestore.
 */
authRouter.post('/sync-profile', authMiddleware, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const { displayName, photoURL, provider } = req.body;

  try {
    const existingDoc = await FirestoreDb.getUser(user.uid);
    const now = new Date().toISOString();
    let finalProfile: FirestoreUserDoc;

    if (!existingDoc) {
      // Idempotent creation of new profile document in Firestore
      const newDoc: FirestoreUserDoc = {
        id: user.uid,
        uid: user.uid,
        email: user.email.toLowerCase(),
        displayName: (displayName && typeof displayName === 'string' ? displayName.trim() : user.name) || 'User',
        photoURL: (photoURL && typeof photoURL === 'string' ? photoURL : user.picture) || '',
        emailVerified: user.emailVerified,
        provider: (provider && typeof provider === 'string' ? provider : user.provider) || 'password',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };
      finalProfile = await FirestoreDb.createUser(newDoc);

      await FirestoreDb.addAuditLog(user.uid, {
        id: `log-auth-created-${Date.now()}`,
        timestamp: now,
        action: 'PROFILE_CREATED',
        actionType: 'PROFILE_CREATED',
        details: `Profile created in Firestore for ${user.email || user.uid}`,
        description: `Profile created in Firestore for ${user.email || user.uid}`,
        category: 'user',
        severity: 'info',
      });
    } else {
      // Idempotent update of existing profile on login
      const patch: Partial<FirestoreUserDoc> = {
        updatedAt: now,
        lastLoginAt: now,
      };
      if (displayName && typeof displayName === 'string' && displayName.trim()) {
        patch.displayName = displayName.trim();
      }
      if (photoURL && typeof photoURL === 'string') {
        patch.photoURL = photoURL;
      }
      if (user.emailVerified !== undefined) {
        patch.emailVerified = user.emailVerified;
      }
      if (provider && typeof provider === 'string') {
        patch.provider = provider;
      }
      const updated = await FirestoreDb.updateUser(user.uid, patch);
      finalProfile = updated || { ...existingDoc, ...patch };

      await FirestoreDb.addAuditLog(user.uid, {
        id: `log-auth-login-${Date.now()}`,
        timestamp: now,
        action: 'LOGIN',
        actionType: 'LOGIN',
        details: `Authenticated session verified for ${user.email || user.uid}`,
        description: `Authenticated session verified for ${user.email || user.uid}`,
        category: 'user',
        severity: 'info',
      });
    }

    res.json({
      success: true,
      user: {
        uid: user.uid,
        id: user.uid,
        email: finalProfile.email,
        displayName: finalProfile.displayName || user.name,
        photoURL: finalProfile.photoURL || user.picture || '',
        emailVerified: finalProfile.emailVerified ?? user.emailVerified,
        provider: finalProfile.provider || user.provider || 'password',
        isDemo: false,
        createdAt: finalProfile.createdAt,
        lastLoginAt: finalProfile.lastLoginAt,
      },
    });
  } catch (err: any) {
    console.error(`Profile sync error for ${user.uid}:`, err);
    res.status(500).json({
      error: {
        code: 'PROFILE_SYNC_FAILED',
        message: 'Failed to synchronize user profile in Firestore',
      },
    });
  }
});

/**
 * POST /api/auth/logout - records LOGOUT audit event in Firestore
 * Never records logout as LOGIN.
 */
authRouter.post('/logout', authMiddleware, async (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  try {
    await FirestoreDb.addAuditLog(user.uid, {
      id: `log-auth-logout-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'LOGOUT',
      actionType: 'LOGOUT',
      details: `User logged out: ${user.email || user.uid}`,
      description: `User logged out: ${user.email || user.uid}`,
      category: 'user',
      severity: 'info',
    });
  } catch (err) {
    console.warn('Could not record logout audit log to Firestore:', err);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});
