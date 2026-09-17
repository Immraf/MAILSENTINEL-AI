import crypto from 'crypto';
import { PriorityLevel } from '../src/types';
import { db, NotificationDeliveryRecord } from './db';
import { FirestoreDb } from './firestoreDb';

export interface WhatsAppConfigStatus {
  configured: boolean;
  phoneNumberIdMasked?: string;
  businessAccountIdMasked?: string;
  templateName: string;
  defaultThreshold: PriorityLevel;
  statusMessage: string;
}

export interface SendWhatsAppAlertParams {
  userId: string;
  recipientPhone: string;
  emailId?: string;
  threadId?: string;
  notificationId: string;
  priority: PriorityLevel;
  sender: string;
  subject: string;
  summary: string;
  isSecurityAlert?: boolean;
}

export interface WhatsAppDispatchResult {
  success: boolean;
  deliveryId: string;
  wamid?: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed';
  error?: string;
  failureCode?: number | string;
  failureReason?: string;
  message: string;
}

const PRIORITY_SCORES: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Informational: 0,
};

/**
 * Validates if the email priority meets or exceeds the user's WhatsApp threshold.
 * Default WhatsApp threshold: Critical only.
 * Allowed user configurations: Critical, High, Medium, Low.
 */
export function qualifiesForWhatsApp(
  emailPriority: PriorityLevel,
  userThreshold?: PriorityLevel | null
): boolean {
  const threshold = userThreshold || 'Critical';
  const emailScore = PRIORITY_SCORES[emailPriority] ?? 1;
  const thresholdScore = PRIORITY_SCORES[threshold] ?? 4;
  return emailScore >= thresholdScore;
}

/**
 * Sanitizes and normalizes phone number to E.164 format (e.g. +14155552671)
 */
export function formatE164Phone(rawPhone: string): string {
  const cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // If leading 00, replace with +
    if (cleaned.startsWith('00')) {
      return `+${cleaned.substring(2)}`;
    }
    // If 10 digits US assumed or raw international
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Returns configuration status without exposing sensitive tokens to browser.
 */
export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const bizId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'mailsentinel_security_alert';

  const isConfigured = Boolean(token && phoneId);

  return {
    configured: isConfigured,
    phoneNumberIdMasked: phoneId ? `...${phoneId.slice(-4)}` : undefined,
    businessAccountIdMasked: bizId ? `...${bizId.slice(-4)}` : undefined,
    templateName,
    defaultThreshold: 'Critical',
    statusMessage: isConfigured
      ? 'WhatsApp Business Platform Cloud API active (Meta Graph API v21.0).'
      : 'WhatsApp Cloud API is not configured.',
  };
}

/**
 * Verifies webhook challenge from Meta Graph API during setup.
 */
export function verifyWhatsAppWebhook(
  mode?: string,
  verifyToken?: string,
  challenge?: string
): { valid: boolean; challenge?: string } {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'mailsentinel_wa_verify_token';
  if (mode === 'subscribe' && verifyToken === expectedToken) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

/**
 * Verifies Meta webhook X-Hub-Signature-256 HMAC
 */
export function verifyMetaSignature(rawBody: string, signatureHeader?: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // If no app secret configured in dev, signature check is skipped
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const signature = signatureHeader.substring(7);
  const hmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hmac, 'hex'));
}

/**
 * Dispatches an official WhatsApp Business Platform Cloud API notification.
 * 
 * Rules:
 * 1. Official WhatsApp Business Platform Cloud API only (v21.0).
 * 2. User must explicitly opt in.
 * 3. Default threshold: Critical only.
 * 4. Outside 24h service window, proactive notifications MUST use approved utility templates.
 * 5. Do NOT claim delivery based only on HTTP 200. HTTP 200 sets status to 'sent' with wamid.
 * 6. Tracks: queued -> sent -> delivered -> read -> failed.
 */
export async function sendWhatsAppAlert(params: SendWhatsAppAlertParams): Promise<WhatsAppDispatchResult> {
  const {
    userId,
    recipientPhone,
    emailId,
    threadId,
    notificationId,
    priority,
    sender,
    subject,
    summary,
    isSecurityAlert,
  } = params;

  const deliveryId = `deliv-wa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = new Date().toISOString();
  const normalizedPhone = formatE164Phone(recipientPhone);

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'mailsentinel_security_alert';

  // If WhatsApp credentials are not configured, record failure honestly.
  // Rule: Do not claim delivery if not configured!
  if (!token || !phoneId) {
    const failedRecord: NotificationDeliveryRecord = {
      id: deliveryId,
      notificationId,
      userId,
      emailId,
      threadId,
      channel: 'whatsapp',
      status: 'failed',
      createdAt,
      failedAt: createdAt,
      failureCode: 'UNCONFIGURED_CREDENTIALS',
      failureReason: 'WhatsApp Cloud API is not configured.',
      error: 'WhatsApp Cloud API is not configured.',
      payload: {
        recipient: normalizedPhone,
        priority,
        sender,
        subject,
      },
    };

    db.addNotificationDelivery(failedRecord);
    try {
      await FirestoreDb.recordDelivery(userId, failedRecord);
    } catch (e) {}

    return {
      success: false,
      deliveryId,
      status: 'failed',
      failureCode: 'UNCONFIGURED_CREDENTIALS',
      failureReason: 'WhatsApp Cloud API is not configured.',
      error: 'WhatsApp Cloud API is not configured.',
      message: 'WhatsApp Cloud API is not configured.',
    };
  }

  // 1. Initial State: Queued
  const queuedRecord: NotificationDeliveryRecord = {
    id: deliveryId,
    notificationId,
    userId,
    emailId,
    threadId,
    channel: 'whatsapp',
    status: 'queued',
    createdAt,
    queuedAt: createdAt,
    payload: {
      recipient: normalizedPhone,
      priority,
      sender,
      subject,
      templateName,
    },
  };
  db.addNotificationDelivery(queuedRecord);
  try {
    await FirestoreDb.recordDelivery(userId, queuedRecord);
  } catch (e) {}

  // 2. Prepare official Meta Graph API payload
  // Proactive notification utility template format:
  // "🚨 New {{priority}} email from {{sender}}: {{summary}}"
  const cleanSummary = (summary || subject || 'Important alert').substring(0, 160);
  const cleanSender = (sender || 'MailSentinel Security').substring(0, 60);

  const templatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone.replace('+', ''), // Meta accepts digits with country code without plus or with plus
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: 'en_US',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: priority },
            { type: 'text', text: cleanSender },
            { type: 'text', text: cleanSummary },
          ],
        },
      ],
    },
  };

  // Structured interactive text payload fallback for in-window or standard testing
  const textPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone.replace('+', ''),
    type: 'text',
    text: {
      preview_url: false,
      body: `🚨 *New ${priority} email from ${cleanSender}*: ${cleanSummary}`,
    },
  };

  try {
    // Attempt official Meta Cloud API call with template first
    let metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload),
    });

    let resData: any = null;
    try {
      resData = await metaRes.json();
    } catch (e) {
      resData = null;
    }

    // If template does not exist yet or fails with template error, fallback to structured text message
    if (!metaRes.ok && (resData?.error?.code === 100 || resData?.error?.code === 132000 || resData?.error?.code === 132001)) {
      console.warn('[WhatsApp Service] Template not found, falling back to structured utility text:', resData?.error?.message);
      metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(textPayload),
      });

      try {
        resData = await metaRes.json();
      } catch (e) {
        resData = null;
      }
    }

    // Handle Meta Graph API response
    if (metaRes.ok && resData?.messages?.[0]?.id) {
      const wamid = resData.messages[0].id;
      const sentAt = new Date().toISOString();

      // STRICT RULE: Do not claim delivery based only on HTTP 200!
      // Status is marked as 'sent' (awaiting delivery confirmation webhook from Meta).
      const sentUpdates: Partial<NotificationDeliveryRecord> = {
        status: 'sent',
        wamid,
        sentAt,
        payload: {
          recipient: normalizedPhone,
          wamid,
          metaResponse: resData,
        },
      };

      db.updateNotificationDelivery(deliveryId, sentUpdates);
      try {
        await FirestoreDb.updateDelivery(userId, deliveryId, sentUpdates);
      } catch (e) {}

      return {
        success: true,
        deliveryId,
        wamid,
        status: 'sent',
        message: `WhatsApp message dispatched to Meta queue. ID: ${wamid}. Awaiting delivery confirmation.`,
      };
    } else {
      // HTTP Error from Meta
      const failedAt = new Date().toISOString();
      const failureCode = resData?.error?.code || metaRes.status;
      const failureReason = resData?.error?.message || `HTTP ${metaRes.status}: Meta Graph API call failed.`;

      const failUpdates: Partial<NotificationDeliveryRecord> = {
        status: 'failed',
        failedAt,
        failureCode,
        failureReason,
        error: failureReason,
      };

      db.updateNotificationDelivery(deliveryId, failUpdates);
      try {
        await FirestoreDb.updateDelivery(userId, deliveryId, failUpdates);
      } catch (e) {}

      return {
        success: false,
        deliveryId,
        status: 'failed',
        failureCode,
        failureReason,
        error: failureReason,
        message: `WhatsApp dispatch failed: ${failureReason}`,
      };
    }
  } catch (networkErr: any) {
    const failedAt = new Date().toISOString();
    const failureReason = networkErr.message || 'Network error reaching WhatsApp Cloud API';

    const failUpdates: Partial<NotificationDeliveryRecord> = {
      status: 'failed',
      failedAt,
      failureCode: 'NETWORK_ERROR',
      failureReason,
      error: failureReason,
    };

    db.updateNotificationDelivery(deliveryId, failUpdates);
    try {
      await FirestoreDb.updateDelivery(userId, deliveryId, failUpdates);
    } catch (e) {}

    return {
      success: false,
      deliveryId,
      status: 'failed',
      failureCode: 'NETWORK_ERROR',
      failureReason,
      error: failureReason,
      message: `WhatsApp network failure: ${failureReason}`,
    };
  }
}

/**
 * Processes incoming webhook payloads from Meta WhatsApp Cloud API.
 * Tracks statuses: sent, delivered, read, failed.
 * Handles incoming STOP / START opt-in commands.
 */
export async function handleWhatsAppWebhookPayload(body: any): Promise<{
  processedStatuses: number;
  processedMessages: number;
  events: Array<{ wamid: string; status: string; recipient?: string }>;
}> {
  const events: Array<{ wamid: string; status: string; recipient?: string }> = [];
  let processedStatuses = 0;
  let processedMessages = 0;

  if (!body || body.object !== 'whatsapp_business_account') {
    return { processedStatuses: 0, processedMessages: 0, events };
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};

      // 1. Process Status Updates (sent, delivered, read, failed)
      const statuses = value.statuses || [];
      for (const st of statuses) {
        const wamid = st.id;
        const statusStr = st.status; // "sent" | "delivered" | "read" | "failed"
        const recipient = st.recipient_id;
        const timestamp = st.timestamp ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

        processedStatuses++;
        events.push({ wamid, status: statusStr, recipient });

        // Find matching delivery in database by wamid or id
        const deliveries = db.getNotificationDeliveries();
        const matched = deliveries.find((d) => d.wamid === wamid || d.id === wamid);

        if (matched) {
          const updates: Partial<NotificationDeliveryRecord> = {};

          if (statusStr === 'delivered') {
            updates.status = 'delivered';
            updates.deliveredAt = timestamp;
          } else if (statusStr === 'read') {
            updates.status = 'read';
            updates.readAt = timestamp;
            if (!matched.deliveredAt) {
              updates.deliveredAt = timestamp;
            }
          } else if (statusStr === 'sent') {
            updates.status = 'sent';
            updates.sentAt = timestamp;
          } else if (statusStr === 'failed') {
            updates.status = 'failed';
            updates.failedAt = timestamp;
            const errObj = st.errors?.[0];
            updates.failureCode = errObj?.code || 131026;
            updates.failureReason = errObj?.title || errObj?.message || 'Message undeliverable to handset';
            updates.error = updates.failureReason;
          }

          db.updateNotificationDelivery(matched.id, updates);
          try {
            await FirestoreDb.updateDelivery(matched.userId, matched.id, updates);
          } catch (e) {}
        }
      }

      // 2. Process Inbound Messages (e.g. STOP to revoke opt-in, START to opt back in)
      const messages = value.messages || [];
      for (const msg of messages) {
        processedMessages++;
        const fromNumber = msg.from;
        const textBody = msg.text?.body?.trim().toUpperCase();

        if (textBody === 'STOP' || textBody === 'UNSUBSCRIBE' || textBody === 'CANCEL') {
          // User opted out via WhatsApp
          console.log(`[WhatsApp Webhook] User ${fromNumber} sent ${textBody}: Revoking opt-in.`);
          revokeOptInByPhone(fromNumber);
        } else if (textBody === 'START' || textBody === 'OPTIN' || textBody === 'YES') {
          // User opted back in
          console.log(`[WhatsApp Webhook] User ${fromNumber} sent ${textBody}: Confirming opt-in.`);
          grantOptInByPhone(fromNumber);
        }
      }
    }
  }

  return { processedStatuses, processedMessages, events };
}

/**
 * Revokes WhatsApp opt-in for a phone number across user settings
 */
export function revokeOptInByPhone(phone: string): void {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const allUsers = db.getUsers();

  for (const user of allUsers) {
    const settings = db.getNotificationSettings(user.id);
    const userPhoneClean = (settings.whatsappPhone || settings.whatsappNumber || '').replace(/[^\d]/g, '');

    if (userPhoneClean.endsWith(cleanPhone) || cleanPhone.endsWith(userPhoneClean)) {
      const updated = {
        ...settings,
        whatsappOptIn: false,
        whatsappEnabled: false,
        whatsappOptInTimestamp: new Date().toISOString(),
      };
      db.saveNotificationSettings(user.id, updated);
      FirestoreDb.saveNotificationSettings(user.id, updated).catch(() => {});
    }
  }
}

/**
 * Grants WhatsApp opt-in for a phone number
 */
export function grantOptInByPhone(phone: string): void {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const allUsers = db.getUsers();

  for (const user of allUsers) {
    const settings = db.getNotificationSettings(user.id);
    const userPhoneClean = (settings.whatsappPhone || settings.whatsappNumber || '').replace(/[^\d]/g, '');

    if (userPhoneClean.endsWith(cleanPhone) || cleanPhone.endsWith(userPhoneClean)) {
      const updated = {
        ...settings,
        whatsappOptIn: true,
        whatsappEnabled: true,
        whatsappOptInTimestamp: new Date().toISOString(),
        whatsappOptInSource: 'inbound_whatsapp_message',
      };
      db.saveNotificationSettings(user.id, updated);
      FirestoreDb.saveNotificationSettings(user.id, updated).catch(() => {});
    }
  }
}

/**
 * Diagnostic helper: simulates Meta Webhook status updates (Sent -> Delivered -> Read -> Failed).
 * Demonstrates real status transitions without waiting for live carrier delivery.
 */
export async function simulateWebhookStatusTransition(
  wamid: string,
  targetStatus: 'delivered' | 'read' | 'failed',
  errorDetails?: { code: number; message: string }
): Promise<{ success: boolean; delivery?: NotificationDeliveryRecord }> {
  const deliveries = db.getNotificationDeliveries();
  const matched = deliveries.find((d) => d.wamid === wamid || d.id === wamid);

  if (!matched) {
    return { success: false };
  }

  const now = new Date().toISOString();
  const updates: Partial<NotificationDeliveryRecord> = {};

  if (targetStatus === 'delivered') {
    updates.status = 'delivered';
    updates.deliveredAt = now;
  } else if (targetStatus === 'read') {
    updates.status = 'read';
    updates.readAt = now;
    if (!matched.deliveredAt) updates.deliveredAt = now;
  } else if (targetStatus === 'failed') {
    updates.status = 'failed';
    updates.failedAt = now;
    updates.failureCode = errorDetails?.code || 131026;
    updates.failureReason = errorDetails?.message || 'Handset undeliverable or blocked';
    updates.error = updates.failureReason;
  }

  db.updateNotificationDelivery(matched.id, updates);
  try {
    await FirestoreDb.updateDelivery(matched.userId, matched.id, updates);
  } catch (e) {}

  const updatedRecord = db.getNotificationDeliveries().find((d) => d.id === matched.id);
  return { success: true, delivery: updatedRecord };
}
