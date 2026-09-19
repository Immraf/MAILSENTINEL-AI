/**
 * User-friendly authentication error handling for Firebase Authentication
 * Strictly eliminates raw stack traces and provides actionable messages.
 */
export function formatAuthError(error: any): string {
  if (!error) return 'Authentication failed. Please try again.';

  const code = error?.code || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in popup was closed before completing authentication. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'The sign-in request was cancelled. Please try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with the same email address using different sign-in credentials. Please sign in using your original method.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled in Firebase Authentication. Please enable the Google provider in Firebase Console > Authentication > Sign-in method.';
    case 'auth/unauthorized-domain':
      return `This domain (${currentHost}) is not authorized for OAuth operations in Firebase. Please add "${currentHost}" to Authorized Domains in Firebase Console > Authentication > Settings.`;
    case 'auth/network-request-failed':
      return 'Network request failed. Please check your internet connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password. Please check your credentials and try again.';
    case 'auth/user-disabled':
      return 'This user account has been disabled by an administrator.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access to this account has been temporarily disabled. Please wait a moment or reset your password.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      if (error?.message) {
        // Strip raw Firebase error codes like "Firebase: Error (auth/invalid-credential)."
        const cleanMsg = error.message.replace(/^Firebase:\s*(Error\s*)?(\(auth\/[^)]+\)\.?\s*)?/i, '').trim();
        return cleanMsg || 'Authentication failed. Please try again.';
      }
      return 'Authentication failed. Please try again.';
  }
}
