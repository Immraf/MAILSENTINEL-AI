import { getMessaging, Messaging, Message } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './firebaseAdmin';
import { db } from './db';
import { FirestoreService } from './firestoreDb';

let cachedMessaging: Messaging | null = null;
let isFcmGloballyBroken = false;

export interface FcmDispatchResult {
  success: boolean;
  channel: 'browser_push' | 'mobile_push';
  token: string;
  deviceId?: string;
  platform?: string;
  messageId?: string;
  configured: boolean;
  status: 'sent' | 'failed';
  error?: string;
  tokenInvalidRemoved?: boolean;
}

export function getMessagingClient(): Messaging | null {
  if (cachedMessaging) return cachedMessaging;
  try {
    const adminApp = getFirebaseAdmin();
    cachedMessaging = getMessaging(adminApp);
    return cachedMessaging;
  } catch (err) {
    console.warn('[FCM Service] Unable to initialize Firebase Messaging admin client:', err);
    return null;
  }
}

/**
 * Checks whether Firebase Cloud Messaging is actively configured.
 */
export function getFcmConfigurationStatus(): {
  configured: boolean;
  projectId: string;
  messagingSenderId: string;
  statusMessage: string;
} {
  const adminApp = getFirebaseAdmin();
  const projectId = adminApp.options.projectId || 'project-fb6003fc-15d3-429a-b8d';
  const messagingSenderId = '445127289597';

  if (isFcmGloballyBroken) {
    return {
      configured: false,
      projectId,
      messagingSenderId,
      statusMessage: 'Push notifications are not configured.',
    };
  }

  const messaging = getMessagingClient();
  if (!messaging) {
    return {
      configured: false,
      projectId,
      messagingSenderId,
      statusMessage: 'Push notifications are not configured.',
    };
  }

  return {
    configured: true,
    projectId,
    messagingSenderId,
    statusMessage: 'Firebase Cloud Messaging client initialized and active.',
  };
}

/**
 * Send real FCM packet to a single device token.
 * Strictly adheres to rule:
 * - Never fake delivery.
 * - If FCM is unconfigured, display: "Push notifications are not configured."
 * - Remove invalid FCM tokens automatically.
 */
export async function sendFcmToDevice(
  userId: string,
  device: {
    deviceId: string;
    platform: 'web' | 'android' | 'ios';
    pushToken: string;
    enabled?: boolean;
  },
  payload: {
    notificationId: string;
    deliveryId: string;
    emailId: string;
    threadId?: string;
    title: string;
    body: string;
    priority: string;
    classification?: string;
  }
): Promise<FcmDispatchResult> {
  const messaging = getMessagingClient();
  const channel: 'browser_push' | 'mobile_push' = device.platform === 'android' ? 'mobile_push' : 'browser_push';

  if (!messaging || isFcmGloballyBroken) {
    return {
      success: false,
      channel,
      token: device.pushToken,
      deviceId: device.deviceId,
      platform: device.platform,
      configured: false,
      status: 'failed',
      error: 'Push notifications are not configured.',
    };
  }

  const emailDeepLink = `/?emailId=${encodeURIComponent(payload.emailId)}`;

  const message: Message = {
    token: device.pushToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      notificationId: payload.notificationId,
      deliveryId: payload.deliveryId,
      emailId: payload.emailId,
      threadId: payload.threadId || '',
      priority: payload.priority,
      classification: payload.classification || 'SAFE',
      url: emailDeepLink,
      click_action: emailDeepLink,
    },
    webpush: {
      headers: {
        Urgency: payload.priority === 'Critical' ? 'high' : 'normal',
      },
      fcmOptions: {
        link: emailDeepLink,
      },
      notification: {
        title: payload.title,
        body: payload.body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `mailsentinel-${payload.emailId}`,
        data: {
          emailId: payload.emailId,
          deliveryId: payload.deliveryId,
          url: emailDeepLink,
        },
      },
    },
    android: {
      priority: payload.priority === 'Critical' ? 'high' : 'normal',
      notification: {
        title: payload.title,
        body: payload.body,
        channelId: 'mailsentinel_alerts',
        clickAction: emailDeepLink,
      },
    },
  };

  try {
    const messageId = await messaging.send(message);

    // Update device lastSeenAt
    db.updateNotificationDevice(userId, device.deviceId, {
      lastSeenAt: new Date().toISOString(),
    });

    return {
      success: true,
      channel,
      token: device.pushToken,
      deviceId: device.deviceId,
      platform: device.platform,
      messageId,
      configured: true,
      status: 'sent', // NEVER 'delivered' until client confirms receipt!
    };
  } catch (err: any) {
    console.warn(`[FCM Service] Error sending to device ${device.deviceId}:`, err.code, err.message);

    const isCredentialError =
      err.code === 'messaging/mismatched-credential' ||
      err.code === 'app/invalid-credential' ||
      err.code === 'messaging/authentication-error' ||
      String(err.message || '').includes('Permission') ||
      String(err.message || '').includes('cloudmessaging.messages.create') ||
      String(err.message || '').includes('credential');

    if (isCredentialError) {
      isFcmGloballyBroken = true;
      return {
        success: false,
        channel,
        token: device.pushToken,
        deviceId: device.deviceId,
        platform: device.platform,
        configured: false,
        status: 'failed',
        error: 'Push notifications are not configured.',
      };
    }

    const isInvalidToken =
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/invalid-argument' ||
      String(err.message || '').includes('not registered') ||
      String(err.message || '').includes('invalid registration token') ||
      String(err.message || '').includes('The registration token is not a valid FCM registration token');

    if (isInvalidToken) {
      console.log(`[FCM Service] Automatically removing invalid FCM token for device ${device.deviceId}`);
      db.removeNotificationDevice(userId, device.deviceId);
      try {
        FirestoreService.deleteNotificationDevice(userId, device.deviceId).catch(() => {});
      } catch (e) {}

      db.addAuditLog(userId, {
        id: `log-fcm-clean-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actionType: 'NOTIFICATION_SENT',
        description: `Automatically removed invalid/unregistered FCM push token for device (${device.deviceId}).`,
        severity: 'medium',
      });

      return {
        success: false,
        channel,
        token: device.pushToken,
        deviceId: device.deviceId,
        platform: device.platform,
        configured: true,
        status: 'failed',
        tokenInvalidRemoved: true,
        error: 'Invalid registration token removed.',
      };
    }

    return {
      success: false,
      channel,
      token: device.pushToken,
      deviceId: device.deviceId,
      platform: device.platform,
      configured: true,
      status: 'failed',
      error: err.message || 'Push notifications are not configured.',
    };
  }
}

/**
 * Dispatch real FCM notification to all enabled registered devices for a user.
 */
export async function dispatchFcmToUserDevices(
  userId: string,
  payload: {
    notificationId: string;
    deliveryIdPrefix: string;
    emailId: string;
    threadId?: string;
    title: string;
    body: string;
    priority: string;
    classification?: string;
    channelFilter?: 'browser_push' | 'mobile_push';
  }
): Promise<{
  results: FcmDispatchResult[];
  summary: {
    attempted: number;
    sent: number;
    failed: number;
    unconfigured: boolean;
    message: string;
  };
}> {
  const devices = db.getNotificationDevices(userId, true);

  const eligibleDevices = devices.filter((d) => {
    if (!d.pushToken) return false;
    if (payload.channelFilter === 'mobile_push') {
      return d.platform === 'android' || d.platform === 'ios';
    }
    if (payload.channelFilter === 'browser_push') {
      return d.platform === 'web' || !d.platform;
    }
    return true;
  });

  if (eligibleDevices.length === 0) {
    return {
      results: [],
      summary: {
        attempted: 0,
        sent: 0,
        failed: 0,
        unconfigured: true,
        message: 'Push notifications are not configured.',
      },
    };
  }

  const results: FcmDispatchResult[] = [];
  let sentCount = 0;
  let failedCount = 0;
  let unconfigured = false;

  for (let i = 0; i < eligibleDevices.length; i++) {
    const dev = eligibleDevices[i]!;
    const deliveryId = `${payload.deliveryIdPrefix}-${dev.deviceId || i}`;
    const result = await sendFcmToDevice(
      userId,
      dev as any,
      {
        ...payload,
        deliveryId,
      }
    );
    results.push(result);
    if (result.success) {
      sentCount++;
    } else {
      failedCount++;
      if (!result.configured || result.error === 'Push notifications are not configured.') {
        unconfigured = true;
      }
    }
  }

  return {
    results,
    summary: {
      attempted: eligibleDevices.length,
      sent: sentCount,
      failed: failedCount,
      unconfigured,
      message: unconfigured
        ? 'Push notifications are not configured.'
        : sentCount > 0
        ? `Sent to ${sentCount} FCM devices.`
        : 'Push notification delivery failed.',
    },
  };
}
