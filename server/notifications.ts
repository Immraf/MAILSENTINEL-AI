import { db, NotificationDeliveryRecord } from './db';
import { Email, NotificationSettings } from '../src/types';

export interface NotificationEvaluationResult {
  shouldNotifyPush: boolean;
  shouldNotifyWhatsApp: boolean;
  shouldNotifyBrowser: boolean;
  suppressionReason?: string;
  channelsDelivered: string[];
  channelsFailed: string[];
}

/**
 * Checks whether the current local time falls within configured Quiet Hours
 */
export function isInQuietHours(settings: NotificationSettings): boolean {
  if (!settings.quietHours?.enabled && !settings.quietHoursEnabled) return false;

  const start = settings.quietHours?.start || settings.quietHoursStart || '22:00';
  const end = settings.quietHours?.end || settings.quietHoursEnd || '07:00';

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Single-day span e.g. 13:00 to 17:00
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight span e.g. 22:00 to 07:00
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Evaluates whether an incoming email event should trigger push, WhatsApp, or browser alerts
 */
export async function evaluateAndDispatchNotification(
  userId: string,
  email: Email
): Promise<NotificationEvaluationResult> {
  const settings = db.getNotificationSettings(userId);
  const priority = email.aiAnalysis.priority;
  const securityClassification = email.securityAnalysis.classification;
  const riskScore = email.securityAnalysis.riskScore;
  const isCriticalSecurity = securityClassification === 'PHISHING' || securityClassification === 'MALICIOUS' || riskScore >= 80;

  const result: NotificationEvaluationResult = {
    shouldNotifyPush: false,
    shouldNotifyWhatsApp: false,
    shouldNotifyBrowser: false,
    channelsDelivered: [],
    channelsFailed: [],
  };

  // 1. Check Deduplication: Avoid duplicate alerts for the same thread within 60 minutes
  const recentDeliveries = db.getDeliveries(userId, { threadId: email.threadId, withinMs: 60 * 60 * 1000 });
  if (recentDeliveries.length > 0) {
    result.suppressionReason = `Suppressed due to thread deduplication (alert already dispatched within 60 minutes).`;
    db.recordDelivery({
      id: `deliv-${Date.now()}`,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'push',
      status: 'suppressed_dedup',
      reason: result.suppressionReason,
      payload: { subject: email.subject },
      createdAt: new Date().toISOString(),
    });
    return result;
  }

  // 2. Check Quiet Hours
  const inQuiet = isInQuietHours(settings);
  if (inQuiet) {
    const allowCritical = settings.quietHours?.allowCriticalSecurity ?? true;
    if (!isCriticalSecurity || !allowCritical) {
      result.suppressionReason = `Suppressed due to active Quiet Hours (${settings.quietHours?.start || '22:00'} - ${settings.quietHours?.end || '07:00'}).`;
      db.recordDelivery({
        id: `deliv-${Date.now()}`,
        userId,
        emailId: email.id,
        threadId: email.threadId,
        channel: 'push',
        status: 'suppressed_quiet_hours',
        reason: result.suppressionReason,
        payload: { priority, subject: email.subject },
        createdAt: new Date().toISOString(),
      });
      return result;
    }
  }

  // 3. Priority & Trigger Rules
  const triggers = settings.triggers || {};
  const isCritical = priority === 'Critical';
  const isHigh = priority === 'High';
  const hasDeadline = Boolean(email.aiAnalysis.deadline);

  // Push Decision
  if (settings.pushEnabled) {
    if (isCriticalSecurity && (triggers.threats ?? true)) {
      result.shouldNotifyPush = true;
    } else if (isCritical && (triggers.critical ?? true)) {
      result.shouldNotifyPush = true;
    } else if (isHigh && (triggers.high ?? true)) {
      result.shouldNotifyPush = true;
    } else if (hasDeadline && (triggers.deadlines ?? true)) {
      result.shouldNotifyPush = true;
    }
  }

  // WhatsApp Decision (Reserved for High / Critical)
  if (settings.whatsappEnabled && (settings.whatsappPhone || settings.whatsappNumber)) {
    if (isCriticalSecurity || isCritical) {
      result.shouldNotifyWhatsApp = true;
    } else if (isHigh && settings.minimumPriorityForWhatsApp !== 'Critical') {
      result.shouldNotifyWhatsApp = true;
    }
  }

  // Browser Alert
  result.shouldNotifyBrowser = result.shouldNotifyPush;

  // 4. Dispatch Push Notification (Record delivery)
  if (result.shouldNotifyPush) {
    db.recordDelivery({
      id: `deliv-push-${Date.now()}`,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'push',
      status: 'delivered',
      payload: {
        title: isCriticalSecurity ? `⚠️ Security Alert: ${securityClassification}` : `📬 ${priority} Priority Email`,
        body: `${email.senderName}: ${email.subject}`,
      },
      createdAt: new Date().toISOString(),
    });
    result.channelsDelivered.push('push');
  }

  // 5. Dispatch Official WhatsApp Notification
  if (result.shouldNotifyWhatsApp) {
    const waPhone = settings.whatsappPhone || settings.whatsappNumber;
    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      // Configuration missing: Do NOT pretend it was sent!
      db.recordDelivery({
        id: `deliv-wa-${Date.now()}`,
        userId,
        emailId: email.id,
        threadId: email.threadId,
        channel: 'whatsapp',
        status: 'unconfigured',
        reason: 'WhatsApp credentials not configured on server (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN).',
        payload: { recipient: waPhone },
        createdAt: new Date().toISOString(),
      });
      result.channelsFailed.push('whatsapp (unconfigured)');
    } else {
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${waToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: waPhone,
            type: 'text',
            text: {
              body: isCriticalSecurity
                ? `🚨 *MailSentinel Security Alert*\n*Threat*: ${securityClassification} detected in message from ${email.senderName}.\n*Subject*: ${email.subject}\n*Action*: Email quarantined safely.`
                : `📬 *MailSentinel ${priority} Alert*\n*From*: ${email.senderName}\n*Subject*: ${email.subject}\n*Action Required*: ${email.aiAnalysis.recommendedAction}`,
            },
          }),
        });

        if (waRes.ok) {
          db.recordDelivery({
            id: `deliv-wa-${Date.now()}`,
            userId,
            emailId: email.id,
            threadId: email.threadId,
            channel: 'whatsapp',
            status: 'delivered',
            payload: { recipient: waPhone },
            createdAt: new Date().toISOString(),
          });
          result.channelsDelivered.push('whatsapp');
        } else {
          const errText = await waRes.text();
          console.warn('WhatsApp delivery failed:', errText);
          db.recordDelivery({
            id: `deliv-wa-${Date.now()}`,
            userId,
            emailId: email.id,
            threadId: email.threadId,
            channel: 'whatsapp',
            status: 'failed',
            reason: `API error: ${waRes.status}`,
            payload: { recipient: waPhone },
            createdAt: new Date().toISOString(),
          });
          result.channelsFailed.push('whatsapp');
        }
      } catch (waErr: any) {
        console.error('WhatsApp API request error:', waErr);
        result.channelsFailed.push('whatsapp');
      }
    }
  }

  return result;
}
