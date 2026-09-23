/**
 * Safe Browser Notification Utility
 * Handles browser notifications defensively across iframes, mobile browsers (Chrome Android),
 * and restricted security contexts where calling `new Notification()` throws:
 * "TypeError: Illegal constructor".
 */

export interface SafeNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  silent?: boolean;
}

/**
 * Check if the browser environment supports notifications and is allowed
 * to display them without throwing an Illegal constructor error.
 */
export function isBrowserNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  return true;
}

/**
 * Safely request notification permission from the user.
 * Catches any SecurityError or permission denials in sandboxed iframes.
 */
export async function requestSafeNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) {
    return 'denied';
  }

  try {
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission;
    }

    // Modern browsers return a Promise; legacy browsers use a callback
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[SafeNotification] Notification permission request error:', err);
    return 'denied';
  }
}

/**
 * Safely dispatch a system notification without throwing "TypeError: Illegal constructor".
 * 1. Checks if permission is granted (or requests it).
 * 2. Tries ServiceWorkerRegistration.showNotification first (standard on Android/modern Web).
 * 3. Falls back to `new Notification()` inside a guarded try/catch block.
 * 4. Gracefully swallows Illegal constructor errors in iframes and sandboxes.
 */
export async function dispatchSafeBrowserNotification(
  title: string,
  options?: SafeNotificationOptions
): Promise<boolean> {
  if (!isBrowserNotificationSupported()) {
    return false;
  }

  try {
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await requestSafeNotificationPermission();
    }

    if (perm !== 'granted') {
      return false;
    }

    // 1. Prefer Service Worker showNotification if available (prevents Illegal constructor on Android & in iframes)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, {
            body: options?.body,
            icon: options?.icon || '/favicon.ico',
            badge: options?.badge || '/favicon.ico',
            tag: options?.tag,
            data: options?.data,
            silent: options?.silent,
          });
          return true;
        }
      } catch (swErr) {
        // Service worker showNotification not available or failed; continue to fallback
      }
    }

    // 2. Fallback to `new Notification(...)` wrapped in try/catch to neutralize "TypeError: Illegal constructor"
    try {
      // Test if Notification constructor is callable in this environment
      new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/favicon.ico',
        tag: options?.tag,
      });
      return true;
    } catch (ctorErr) {
      // In iframes or Android Chrome, new Notification() throws "TypeError: Illegal constructor"
      console.warn(
        '[SafeNotification] Notification constructor disallowed in this iframe/environment, suppressed safely:',
        ctorErr
      );
      return false;
    }
  } catch (err) {
    console.warn('[SafeNotification] Failed to dispatch notification safely:', err);
    return false;
  }
}
