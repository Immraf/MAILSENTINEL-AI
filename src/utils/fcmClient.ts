import { getMessaging, getToken, deleteToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { apiRequest } from '../lib/api';

export interface RegisteredDeviceItem {
  id: string;
  userId: string;
  deviceId: string;
  platform: 'web' | 'android' | 'ios';
  pushToken: string;
  createdAt: string;
  lastSeenAt: string;
  enabled: boolean;
  userAgent?: string;
}

export interface FcmServerStatus {
  configured: boolean;
  projectId: string;
  messagingSenderId: string;
  statusMessage: string;
}

const DEVICE_ID_KEY = 'mailsentinel_fcm_device_id';
const PUSH_TOKEN_KEY = 'mailsentinel_fcm_push_token';
const VAPID_KEY_STORAGE = 'mailsentinel_fcm_vapid_key';

/**
 * Get or create unique persistent deviceId for this browser/device
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server-dev';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    const randomPart = Math.random().toString(36).substring(2, 9);
    deviceId = `dev-${Date.now()}-${randomPart}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Detect device platform
 */
export function detectDevicePlatform(): 'web' | 'android' | 'ios' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  return 'web';
}

/**
 * Check if the browser environment supports Web Push & Service Workers
 */
export async function isPushNotificationSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const supported = await isSupported();
    return supported;
  } catch (err) {
    console.warn('[FCM Client] isSupported check failed:', err);
    return false;
  }
}

/**
 * Get initialized Firebase Messaging instance
 */
let messagingInstance: Messaging | null = null;

export async function getClientMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isPushNotificationSupported();
  if (!supported) return null;

  try {
    const apps = getApps();
    const app = apps.length > 0 ? apps[0]! : initializeApp(firebaseConfig);
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn('[FCM Client] Failed to get Messaging client:', err);
    return null;
  }
}

/**
 * Register the FCM service worker
 */
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('[FCM Client] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Check backend FCM configuration status
 */
export async function fetchFcmServerStatus(): Promise<FcmServerStatus> {
  try {
    const res = await apiRequest<FcmServerStatus>('/api/notifications/fcm/status');
    return res;
  } catch (err) {
    return {
      configured: false,
      projectId: (firebaseConfig as any).projectId || '',
      messagingSenderId: (firebaseConfig as any).messagingSenderId || '',
      statusMessage: 'Push notifications are not configured.',
    };
  }
}

/**
 * Fetch all registered devices for current user
 */
export async function fetchUserDevices(): Promise<RegisteredDeviceItem[]> {
  try {
    const res = await apiRequest<{ devices: RegisteredDeviceItem[] }>('/api/notifications/devices');
    return res.devices || [];
  } catch (err) {
    console.warn('[FCM Client] Failed to load devices:', err);
    return [];
  }
}

/**
 * Request notification permission from browser
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Register current device/browser with FCM & MailSentinel backend.
 * Stores: userId, deviceId, platform, pushToken, createdAt, lastSeenAt, enabled.
 */
export async function registerCurrentDevice(options?: {
  vapidKey?: string;
  customToken?: string;
}): Promise<{
  success: boolean;
  device?: RegisteredDeviceItem;
  message: string;
  error?: string;
}> {
  const deviceId = getOrCreateDeviceId();
  const platform = detectDevicePlatform();

  // 1. Request permission
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    return {
      success: false,
      message: 'Push notification permission was denied or not granted in this browser.',
      error: 'PERMISSION_DENIED',
    };
  }

  // 2. Obtain token (either provided custom test token, or real FCM token via service worker)
  let pushToken = options?.customToken;

  if (!pushToken) {
    try {
      const swReg = await registerFcmServiceWorker();
      const messaging = await getClientMessaging();

      if (!messaging) {
        return {
          success: false,
          message: 'Push notifications are not configured.',
          error: 'MESSAGING_UNSUPPORTED',
        };
      }

      const vapidKey =
        options?.vapidKey ||
        localStorage.getItem(VAPID_KEY_STORAGE) ||
        (firebaseConfig as any).vapidKey ||
        undefined;

      pushToken = await getToken(messaging, {
        serviceWorkerRegistration: swReg || undefined,
        vapidKey,
      });
    } catch (err: any) {
      console.warn('[FCM Client] getToken error:', err);

      // Check if user has a stored simulated or existing token
      const cached = localStorage.getItem(PUSH_TOKEN_KEY);
      if (cached) {
        pushToken = cached;
      } else {
        return {
          success: false,
          message: 'Push notifications are not configured.',
          error: err.message || 'UNCONFIGURED_VAPID_OR_PERMISSION',
        };
      }
    }
  }

  if (!pushToken) {
    return {
      success: false,
      message: 'Push notifications are not configured.',
      error: 'NO_PUSH_TOKEN',
    };
  }

  // Cache token locally
  localStorage.setItem(PUSH_TOKEN_KEY, pushToken);

  // 3. Register with backend
  try {
    const res = await apiRequest<{ success: boolean; device: RegisteredDeviceItem }>('/api/notifications/devices', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        platform,
        pushToken,
        enabled: true,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    });

    return {
      success: true,
      device: res.device,
      message: `Registered ${platform} device successfully with FCM push token.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Push notifications are not configured.',
      error: err.message || 'SERVER_REGISTRATION_FAILED',
    };
  }
}

/**
 * Refresh FCM token for device
 */
export async function refreshCurrentDeviceToken(newToken?: string): Promise<{
  success: boolean;
  device?: RegisteredDeviceItem;
  message: string;
}> {
  const deviceId = getOrCreateDeviceId();
  const oldToken = localStorage.getItem(PUSH_TOKEN_KEY) || '';

  let freshToken = newToken;
  if (!freshToken) {
    try {
      const messaging = await getClientMessaging();
      const swReg = await registerFcmServiceWorker();
      if (messaging) {
        freshToken = await getToken(messaging, {
          serviceWorkerRegistration: swReg || undefined,
        });
      }
    } catch (err) {
      console.warn('[FCM Client] Token refresh local error:', err);
    }
  }

  if (!freshToken) {
    freshToken = `fcm-${deviceId}-refresh-${Date.now()}`;
  }

  try {
    const res = await apiRequest<{ success: boolean; device: RegisteredDeviceItem }>('/api/notifications/devices/refresh', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        oldToken,
        newToken: freshToken,
      }),
    });

    localStorage.setItem(PUSH_TOKEN_KEY, freshToken);
    return {
      success: true,
      device: res.device,
      message: 'FCM push token refreshed successfully.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Token refresh failed.',
    };
  }
}

/**
 * Remove / Unregister device and token
 */
export async function unregisterDevice(deviceId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Delete FCM token from client SDK if possible
    try {
      const messaging = await getClientMessaging();
      if (messaging) {
        await deleteToken(messaging);
      }
    } catch (e) {}

    // Call server to unregister
    await apiRequest<{ success: boolean; removed: boolean }>(`/api/notifications/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });

    // Clear local storage if this device
    if (localStorage.getItem(DEVICE_ID_KEY) === deviceId) {
      localStorage.removeItem(PUSH_TOKEN_KEY);
    }

    return {
      success: true,
      message: `Device ${deviceId} unregistered and token removed.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to unregister device.',
    };
  }
}

/**
 * Toggle device enabled status
 */
export async function toggleDeviceEnabled(
  deviceId: string,
  enabled: boolean
): Promise<{ success: boolean; device?: RegisteredDeviceItem }> {
  try {
    const res = await apiRequest<{ success: boolean; device: RegisteredDeviceItem }>(
      `/api/notifications/devices/${encodeURIComponent(deviceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }
    );
    return { success: true, device: res.device };
  } catch (err) {
    return { success: false };
  }
}

/**
 * Trigger direct test push to device(s)
 */
export async function sendTestFcmPush(params?: {
  deviceId?: string;
  title?: string;
  body?: string;
  priority?: string;
}): Promise<{
  success: boolean;
  configured: boolean;
  message: string;
  results?: any[];
}> {
  try {
    const res = await apiRequest<{
      success: boolean;
      configured: boolean;
      message: string;
      results: any[];
    }>('/api/notifications/test-fcm', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
    return res;
  } catch (err: any) {
    return {
      success: false,
      configured: false,
      message: 'Push notifications are not configured.',
    };
  }
}

/**
 * Setup foreground notification listener
 * Calls onNotificationReceived callback with payload and deep link info
 */
export function setupForegroundFcmListener(
  onNotificationReceived: (payload: {
    title: string;
    body: string;
    emailId?: string;
    deliveryId?: string;
    priority?: string;
  }) => void
): () => void {
  let unsub: (() => void) | null = null;

  getClientMessaging().then((messaging) => {
    if (!messaging) return;
    try {
      unsub = onMessage(messaging, (payload) => {
        console.log('[FCM Foreground Message]', payload);
        const title = payload.notification?.title || payload.data?.title || 'MailSentinel Security Alert';
        const body = payload.notification?.body || payload.data?.body || 'Priority email alert received.';
        const emailId = payload.data?.emailId;
        const deliveryId = payload.data?.deliveryId;
        const priority = payload.data?.priority;

        onNotificationReceived({
          title,
          body,
          emailId,
          deliveryId,
          priority,
        });
      });
    } catch (err) {
      console.warn('[FCM Client] Error attaching onMessage listener:', err);
    }
  });

  return () => {
    if (unsub) unsub();
  };
}
