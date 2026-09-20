import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with optional database ID
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Guarantee persistent session across page reloads and browser sessions
try {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Could not set Firebase auth persistence:', err);
  });
} catch (e) {
  // Ignore in environments without window/indexedDB
}

// Configure Google Auth Provider strictly for MailSentinel application authentication (NO mailbox scopes)
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
let activeSignInPromise: Promise<{ user: User } | null> | null = null;

// Test Firestore connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Please check your Firebase configuration or offline mode.');
    }
  }
}
testConnection();

/**
 * Register with Email and Password using Firebase Authentication
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName && credential.user) {
    try {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    } catch (err) {
      console.warn('Could not set displayName on registered user:', err);
    }
  }
  return credential.user;
}

/**
 * Login with Email and Password using Firebase Authentication
 */
export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

/**
 * Send Password Reset Email via Firebase Authentication
 */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Sign in using Google with Firebase Authentication Popup
 */
export const googleSignIn = async (): Promise<{ user: User } | null> => {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, googleProvider);
      return { user: result.user };
    } catch (error: any) {
      const code = error?.code || '';
      if (
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-closed-by-user'
      ) {
        console.warn('Google sign-in popup was closed or cancelled by user.');
        return null;
      }

      console.error('Google Sign In error:', error);
      throw error;
    } finally {
      isSigningIn = false;
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
};

/**
 * Retrieve fresh or cached Firebase ID Token for backend API authorization
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('Failed to retrieve Firebase ID token:', err);
    return null;
  }
}

/**
 * Log out user from Firebase Authentication
 */
export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};

export const logout = logoutUser;

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, null);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const getAccessToken = async (): Promise<string | null> => {
  return null;
};

export const getCachedAccessToken = (): string | null => {
  return null;
};

export const setCachedAccessToken = (_token: string | null) => {
  // No-op: client never caches access tokens
};

// Firestore Error Handler conforming to the Firebase Skill schema
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
