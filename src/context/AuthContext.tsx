import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  auth,
  onAuthStateChange,
  registerWithEmail,
  loginWithEmail,
  googleSignIn,
  resetPassword as firebaseResetPassword,
  logoutUser,
  getFirebaseIdToken,
} from '../lib/firebase';
import { apiFetch } from '../lib/api';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  isDemoMode: boolean;
  authError: string | null;
  clearAuthError: () => void;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetUserPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync profile to backend after login/registration
  const syncProfileWithBackend = async (fbUser: User) => {
    try {
      const idToken = await fbUser.getIdToken();
      await apiFetch('/api/auth/sync-profile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: fbUser.displayName || fbUser.email?.split('@')[0],
        }),
      }).catch((e) => console.warn('Could not sync profile to backend:', e));
    } catch (err) {
      console.warn('Backend profile sync error:', err);
    }
  };

  useEffect(() => {
    // Listen to Firebase Authentication state changes
    const unsubscribe = onAuthStateChange(async (fbUser) => {
      try {
        setFirebaseUser(fbUser);
        if (fbUser) {
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'User'),
            photoURL: fbUser.photoURL,
            emailVerified: fbUser.emailVerified,
            isDemo: false,
          });
          setIsDemoMode(false);
          // Sync profile to backend non-blockingly
          syncProfileWithBackend(fbUser);
        } else {
          setUser(null);
        }
      } catch (err: any) {
        console.error('Error in onAuthStateChanged:', err);
        setAuthError(err.message || 'Authentication error');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const register = async (email: string, password: string, displayName?: string) => {
    setAuthError(null);
    const createdUser = await registerWithEmail(email, password, displayName);
    if (createdUser) {
      await syncProfileWithBackend(createdUser);
    }
  };

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const loggedUser = await loginWithEmail(email, password);
    if (loggedUser) {
      await syncProfileWithBackend(loggedUser);
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    const result = await googleSignIn();
    if (result?.user) {
      await syncProfileWithBackend(result.user);
    }
  };

  const resetUserPassword = async (email: string) => {
    setAuthError(null);
    await firebaseResetPassword(email);
  };

  const logout = async () => {
    try {
      const idToken = await getFirebaseIdToken();
      if (idToken) {
        await apiFetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        }).catch(() => null);
      }
    } catch (e) {
      // Ignore network errors on logout
    }

    await logoutUser();
    setUser(null);
    setFirebaseUser(null);
    setIsDemoMode(false);
    setAuthError(null);
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
  };

  const getIdToken = async (forceRefresh = false) => {
    return getFirebaseIdToken(forceRefresh);
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        isDemoMode,
        authError,
        clearAuthError,
        enterDemoMode,
        exitDemoMode,
        register,
        login,
        loginWithGoogle,
        resetUserPassword,
        logout,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
