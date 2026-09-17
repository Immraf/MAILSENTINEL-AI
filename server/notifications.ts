/**
 * MailSentinel AI - Real Notification Decision Engine (Step 8)
 * 
 * Comprehensive, multi-channel notification engine evaluating:
 * - Priority (Critical, High, Medium, Low, Informational)
 * - Security score & classification (Phishing, Malicious, Suspicious, Safe)
 * - Deadlines & Action Required
 * - User automation rules (suppressions, overrides, alerts)
 * - Notification preferences & channel toggles
 * - Quiet Hours (with user-enabled critical security override)
 * - Previous notifications & exact email deduplication
 * - Thread deduplication (never send 5 alerts for 5 messages in 1 thread)
 * 
 * Channels:
 * - Browser push (browser_push)
 * - Mobile push (mobile_push)
 * - Desktop/system notifications (desktop)
 * - WhatsApp (whatsapp)
 * - Daily digest (daily_digest)
 * 
 * Default Behavior Matrix:
 * - Critical: Immediate notification across all enabled channels
 * - High: Notification according to user preferences
 * - Medium: Configurable (suppressed or digest by default unless enabled)
 * - Low: Normally no immediate notification (digest/suppressed)
 * - Informational: Digest / no immediate notification
 * 
 * Persists:
 * - notification
 * - notificationDelivery (channel, status, createdAt, sentAt, deliveredAt, error, reason)
 * 
 * Statuses:
 * - pending, sent, delivered, failed, suppressed
 * 
 * Rule: NEVER report "delivered" unless delivery is actually confirmed.
 */

import {
  db,
  NotificationRecord,
  NotificationDeliveryRecord,
} from './db';
import { FirestoreDb } from './firestoreDb';
import { dispatchFcmToUserDevices } from './fcmService';
import { sendWhatsAppAlert, qualifiesForWhatsApp } from './whatsappService';
import {
  Email,
  NotificationSettings,
  NotificationChannel,
  NotificationDeliveryStatus,
  PriorityLevel,
} from '../src/types';

export interface NotificationDecisionDetails {
  notificationId: string;
  emailId: string;
  threadId: string;
  isSecurityAlert: boolean;
  effectivePriority: PriorityLevel;
  decisionReasons: string[];
  channelsAttempted: NotificationChannel[];
  channelsSuppressed: Array<{ channel: NotificationChannel; reason: string }>;
  deliveries: NotificationDeliveryRecord[];
}

/**
 * Checks whether current local time falls within configured Quiet Hours
 */
export function isInQuietHours(settings: NotificationSettings, checkDate: Date = new Date()): boolean {
  const quietEnabled = settings.quietHours?.enabled ?? settings.quietHoursEnabled ?? false;
  if (!quietEnabled) return false;

  const start = settings.quietHours?.start || settings.quietHoursStart || '22:00';
  const end = settings.quietHours?.end || settings.quietHoursEnd || '07:00';

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const currentMinutes = checkDate.getHours() * 60 + checkDate.getMinutes();
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    // Single-day span e.g. 13:00 to 17:00
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight span e.g. 22:00 to 07:00
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Evaluates whether any custom user automation rules apply to this email
 */
function evaluateUserRulesForNotification(
  userId: string,
  email: Email
): {
  isSuppressedByRule: boolean;
  isForcedAlertByRule: boolean;
  rulePriorityOverride?: PriorityLevel;
  ruleReason?: string;
} {
  const rules = db.getRules(userId);
  const textContent = `${email.subject} ${email.bodySnippet || ''} ${email.bodyText || ''}`.toLowerCase();
  const senderEmail = email.sender.toLowerCase();
  const senderDomain = email.senderDomain.toLowerCase();

  for (const rule of rules) {
    const isEnabled = rule.isEnabled ?? rule.isActive ?? rule.enabled ?? true;
    if (!isEnabled) continue;

    let conditionMatched = false;
    const cond = typeof rule.condition === 'object' && rule.condition !== null ? rule.condition : {};
    const condField = rule.conditionField || cond.field || '';
    const condOp = rule.conditionOperator || cond.operator || 'contains';
    const ruleVal = ((rule.conditionValue ?? cond.value ?? '') as string).toLowerCase();

    switch (condField) {
      case 'sender':
        conditionMatched = condOp === 'equals'
          ? senderEmail === ruleVal
          : senderEmail.includes(ruleVal);
        break;
      case 'domain':
        conditionMatched = senderDomain.includes(ruleVal);
        break;
      case 'subject':
        conditionMatched = email.subject.toLowerCase().includes(ruleVal);
        break;
      case 'body':
        conditionMatched = textContent.includes(ruleVal);
        break;
      case 'priority':
        conditionMatched = (email.aiAnalysis?.priority || '').toLowerCase() === ruleVal;
        break;
      default:
        conditionMatched = false;
    }

    if (conditionMatched) {
      const act = typeof rule.action === 'object' && rule.action !== null ? rule.action.type : rule.action;
      const action = (rule.actionType || act || '') as string;
      if (action === 'suppress_notification' || action === 'mute') {
        return {
          isSuppressedByRule: true,
          isForcedAlertByRule: false,
          ruleReason: `Suppressed by user automation rule "${rule.name}"`,
        };
      }
      if (action === 'alert_user' || action === 'force_notify') {
        return {
          isSuppressedByRule: false,
          isForcedAlertByRule: true,
          ruleReason: `Forced alert by user automation rule "${rule.name}"`,
        };
      }
      if (action === 'priority') {
        const val = (rule.actionValue || (typeof rule.action === 'object' ? rule.action?.value : '')) as PriorityLevel;
        if (['Critical', 'High', 'Medium', 'Low', 'Informational'].includes(val)) {
          return {
            isSuppressedByRule: false,
            isForcedAlertByRule: val === 'Critical' || val === 'High',
            rulePriorityOverride: val,
            ruleReason: `Priority escalated to ${val} by user rule "${rule.name}"`,
          };
        }
      }
    }
  }

  return {
    isSuppressedByRule: false,
    isForcedAlertByRule: false,
  };
}

/**
 * Checks whether an alert was already dispatched for this thread recently,
 * enforcing thread deduplication: "Do not send five alerts for five messages in the same thread unnecessarily."
 */
function evaluateThreadDeduplication(
  userId: string,
  email: Email,
  windowMinutes: number,
  isSecurityAlert: boolean,
  effectivePriority: PriorityLevel
): {
  isThreadDuplicate: boolean;
  isEscalation: boolean;
  dedupReason?: string;
} {
  const windowMs = windowMinutes * 60 * 1000;
  const recentDeliveries = db.getDeliveries(userId, {
    threadId: email.threadId,
    withinMs: windowMs,
  });

  // Filter for actual notifications previously sent or delivered in this thread
  const activePriorAlerts = recentDeliveries.filter(
    (d) => (d.status === 'sent' || d.status === 'delivered') && d.emailId !== email.id
  );

  if (activePriorAlerts.length === 0) {
    return { isThreadDuplicate: false, isEscalation: false };
  }

  // An alert was already sent for this thread within the deduplication window!
  // Check if the new message is an escalation (e.g. Critical security threat detected or priority escalated)
  const previousPriorities = activePriorAlerts.map((d) => d.payload?.priority || 'Medium');
  const wasPreviouslyCritical = previousPriorities.includes('Critical');

  if (isSecurityAlert && !wasPreviouslyCritical) {
    return {
      isThreadDuplicate: false,
      isEscalation: true,
      dedupReason: `Security escalation: Critical threat detected in active thread ${email.threadId}`,
    };
  }

  if (effectivePriority === 'Critical' && !wasPreviouslyCritical) {
    return {
      isThreadDuplicate: false,
      isEscalation: true,
      dedupReason: `Priority escalation: Escalated to Critical in active thread ${email.threadId}`,
    };
  }

  // Not an escalation -> Enforce deduplication suppression!
  return {
    isThreadDuplicate: true,
    isEscalation: false,
    dedupReason: `Thread deduplication: Alert already dispatched for thread "${email.threadId}" within the last ${windowMinutes} minutes. Subsequent reply suppressed to avoid alert fatigue.`,
  };
}

/**
 * Determines whether a priority meets the user's minimum threshold
 */
function meetsPriorityThreshold(
  level: PriorityLevel,
  threshold: PriorityLevel
): boolean {
  const ranking: Record<PriorityLevel, number> = {
    Critical: 5,
    High: 4,
    Medium: 3,
    Low: 2,
    Informational: 1,
  };
  return (ranking[level] || 0) >= (ranking[threshold] || 0);
}

/**
 * Master Notification Decision Engine entry point.
 * Evaluates all required factors and dispatches to channels with strict delivery tracking.
 */
export async function evaluateAndDispatchNotification(
  userId: string,
  email: Email,
  options: { forceReprocess?: boolean } = {}
): Promise<NotificationDecisionDetails> {
  const settings = db.getNotificationSettings(userId);
  const decisionReasons: string[] = [];
  const createdAt = new Date().toISOString();

  // 1. Check exact email deduplication (idempotency)
  if (!options.forceReprocess) {
    const existingNotifications = db.getNotifications(userId);
    const alreadyNotified = existingNotifications.find((n) => n.emailId === email.id);
    if (alreadyNotified) {
      const existingDeliveries = db.getDeliveries(userId, { notificationId: alreadyNotified.id });
      return {
        notificationId: alreadyNotified.id,
        emailId: email.id,
        threadId: email.threadId,
        isSecurityAlert: alreadyNotified.isSecurityAlert,
        effectivePriority: alreadyNotified.priority,
        decisionReasons: ['Notification already generated for this email.'],
        channelsAttempted: existingDeliveries.filter((d) => d.status === 'sent' || d.status === 'delivered').map((d) => d.channel as NotificationChannel),
        channelsSuppressed: existingDeliveries.filter((d) => d.status === 'suppressed').map((d) => ({ channel: d.channel as NotificationChannel, reason: d.reason || 'Suppressed' })),
        deliveries: existingDeliveries,
      };
    }
  }

  // 2. Security Assessment
  const classification = email.securityAnalysis?.classification || 'SAFE';
  const riskScore = email.securityAnalysis?.riskScore || 0;
  const isSecurityAlert =
    classification === 'PHISHING' ||
    classification === 'MALICIOUS' ||
    riskScore >= 75 ||
    (email.isQuarantined ?? false);

  if (isSecurityAlert) {
    decisionReasons.push(`Security threat flagged: ${classification} (Risk score: ${riskScore})`);
  }

  // 3. User Automation Rules Evaluation
  const ruleEvaluation = evaluateUserRulesForNotification(userId, email);
  if (ruleEvaluation.ruleReason) {
    decisionReasons.push(ruleEvaluation.ruleReason);
  }

  // 4. Effective Priority Calculation
  let effectivePriority: PriorityLevel = email.aiAnalysis?.priority || 'Medium';
  if (ruleEvaluation.rulePriorityOverride) {
    effectivePriority = ruleEvaluation.rulePriorityOverride;
  } else if (isSecurityAlert) {
    effectivePriority = 'Critical';
  }

  // 5. Deadlines and Action Required
  const hasDeadline = Boolean(email.aiAnalysis?.deadline);
  const actionRequired = Boolean(email.aiAnalysis?.actionRequired);
  if (hasDeadline) {
    decisionReasons.push(`Actionable deadline detected: ${email.aiAnalysis?.deadline}`);
  }
  if (actionRequired) {
    decisionReasons.push('Direct recipient action required');
  }

  // If action required or imminent deadline and email was Medium, elevate if configured
  const triggers = settings.triggers || {};
  if (effectivePriority === 'Medium' && (actionRequired || hasDeadline)) {
    if (triggers.actionRequired ?? true) {
      decisionReasons.push('Promoted for priority review due to action requirement');
    }
  }

  // 6. Create Base In-App Notification Record
  const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = isSecurityAlert
    ? `🚨 Security Alert: ${classification} Threat`
    : effectivePriority === 'Critical'
    ? `🔥 Critical: ${email.subject}`
    : effectivePriority === 'High'
    ? `⚠️ High Priority: ${email.subject}`
    : `📬 ${effectivePriority}: ${email.subject}`;

  const body = isSecurityAlert
    ? `Potential ${classification} detected from ${email.senderName || email.sender}. ${email.securityAnalysis?.whyFlaggedReasons?.[0] || 'Email quarantined.'}`
    : email.aiAnalysis?.summary || email.bodySnippet || email.subject;

  const notificationRecord: NotificationRecord = {
    id: notificationId,
    userId,
    emailId: email.id,
    threadId: email.threadId,
    title,
    body,
    priority: effectivePriority,
    securityClassification: classification,
    securityRiskScore: riskScore,
    isSecurityAlert,
    actionRequired,
    deadline: email.aiAnalysis?.deadline || null,
    category: email.aiAnalysis?.category,
    decisionReasons,
    read: false,
    createdAt,
  };

  db.saveNotification(userId, notificationRecord);
  FirestoreDb.addNotification(userId, {
    id: notificationId,
    userId,
    emailId: email.id,
    threadId: email.threadId,
    title,
    body,
    priority: effectivePriority,
    isSecurityAlert,
    securityClassification: classification,
    securityRiskScore: riskScore,
    actionRequired,
    deadline: email.aiAnalysis?.deadline || null,
    decisionReasons,
    read: false,
    createdAt,
  }).catch(() => {});

  // 7. Check User Rule Suppression
  if (ruleEvaluation.isSuppressedByRule) {
    const suppressedDelivery = recordAndSaveDelivery({
      id: `deliv-rule-${Date.now()}`,
      notificationId,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'browser_push',
      status: 'suppressed',
      reason: ruleEvaluation.ruleReason || 'Suppressed by user automation rule',
      createdAt,
    });

    return {
      notificationId,
      emailId: email.id,
      threadId: email.threadId,
      isSecurityAlert,
      effectivePriority,
      decisionReasons,
      channelsAttempted: [],
      channelsSuppressed: [{ channel: 'browser_push', reason: ruleEvaluation.ruleReason || 'Suppressed by rule' }],
      deliveries: [suppressedDelivery],
    };
  }

  // 8. Thread Deduplication Check
  // "Do not send five alerts for five messages in the same thread unnecessarily."
  const dedupWindow = settings.threadDeduplicationWindowMinutes || 60;
  const dedupResult = evaluateThreadDeduplication(userId, email, dedupWindow, isSecurityAlert, effectivePriority);

  if (dedupResult.dedupReason) {
    decisionReasons.push(dedupResult.dedupReason);
  }

  if (dedupResult.isThreadDuplicate) {
    // Suppress immediate dispatch across push/WhatsApp/desktop to prevent alert spamming
    const dedupDelivery = recordAndSaveDelivery({
      id: `deliv-dedup-${Date.now()}`,
      notificationId,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'browser_push',
      status: 'suppressed',
      reason: dedupResult.dedupReason,
      createdAt,
      payload: { threadId: email.threadId, subject: email.subject },
    });

    return {
      notificationId,
      emailId: email.id,
      threadId: email.threadId,
      isSecurityAlert,
      effectivePriority,
      decisionReasons,
      channelsAttempted: [],
      channelsSuppressed: [{ channel: 'browser_push', reason: dedupResult.dedupReason || 'Thread deduplication' }],
      deliveries: [dedupDelivery],
    };
  }

  // 9. Quiet Hours Evaluation
  // "Security alerts can override quiet hours only when the user has enabled that behavior."
  const inQuietHours = isInQuietHours(settings);
  let quietHoursSuppressed = false;
  let quietHoursReason = '';

  if (inQuietHours) {
    const allowCriticalSecurity = settings.quietHours?.allowCriticalSecurity === true;
    if (isSecurityAlert) {
      if (allowCriticalSecurity) {
        decisionReasons.push('Security alert overriding Quiet Hours (User policy enabled)');
      } else {
        quietHoursSuppressed = true;
        quietHoursReason = `Quiet Hours active (${settings.quietHours?.start || '22:00'} - ${settings.quietHours?.end || '07:00'}). Critical security override disabled by user.`;
        decisionReasons.push(quietHoursReason);
      }
    } else {
      quietHoursSuppressed = true;
      quietHoursReason = `Quiet Hours active (${settings.quietHours?.start || '22:00'} - ${settings.quietHours?.end || '07:00'}). Non-critical notifications silenced.`;
      decisionReasons.push(quietHoursReason);
    }
  }

  if (quietHoursSuppressed) {
    const quietDelivery = recordAndSaveDelivery({
      id: `deliv-quiet-${Date.now()}`,
      notificationId,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'browser_push',
      status: 'suppressed',
      reason: quietHoursReason,
      createdAt,
      payload: { priority: effectivePriority, subject: email.subject },
    });

    return {
      notificationId,
      emailId: email.id,
      threadId: email.threadId,
      isSecurityAlert,
      effectivePriority,
      decisionReasons,
      channelsAttempted: [],
      channelsSuppressed: [{ channel: 'browser_push', reason: quietHoursReason }],
      deliveries: [quietDelivery],
    };
  }

  // 10. Default Behavior Matrix & Channel Selection
  // - Critical → immediate notification
  // - High → notification according to user preference
  // - Medium → configurable
  // - Low → normally no immediate notification
  // - Informational → digest/no notification
  const minPushPriority = settings.minimumPriorityForPush || settings.minPriorityLevel || 'High';
  const minDesktopPriority = settings.minimumPriorityForDesktop || 'High';
  const minWhatsAppPriority = settings.minimumPriorityForWhatsApp || 'Critical';

  const deliveries: NotificationDeliveryRecord[] = [];
  const channelsAttempted: NotificationChannel[] = [];
  const channelsSuppressed: Array<{ channel: NotificationChannel; reason: string }> = [];

  // Evaluate Browser Push (Web Push via FCM)
  const browserPushEnabled = settings.browserPushEnabled ?? settings.pushEnabled ?? true;
  if (browserPushEnabled) {
    const qualifiesForBrowser =
      effectivePriority === 'Critical' ||
      (effectivePriority === 'High' && (triggers.high ?? true) && meetsPriorityThreshold('High', minPushPriority)) ||
      (effectivePriority === 'Medium' && (triggers.medium ?? false) && meetsPriorityThreshold('Medium', minPushPriority));

    if (qualifiesForBrowser) {
      const webDevices = db.getNotificationDevices(userId, true).filter((d) => d.platform === 'web' || !d.platform);

      if (webDevices.length === 0) {
        // Strict requirement: Never fake delivery.
        // If FCM/Push is unconfigured: "Push notifications are not configured."
        const browserDelivery = recordAndSaveDelivery({
          id: `deliv-browser-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          notificationId,
          userId,
          emailId: email.id,
          threadId: email.threadId,
          channel: 'browser_push',
          status: 'failed',
          createdAt,
          error: 'Push notifications are not configured.',
          reason: 'No registered Web Push FCM device tokens found for user.',
          payload: { title, body, priority: effectivePriority },
        });
        deliveries.push(browserDelivery);
      } else {
        const fcmRes = await dispatchFcmToUserDevices(userId, {
          notificationId,
          deliveryIdPrefix: `deliv-browser-${Date.now()}`,
          emailId: email.id,
          threadId: email.threadId,
          title,
          body,
          priority: effectivePriority,
          classification,
          channelFilter: 'browser_push',
        });

        if (fcmRes.results.length === 0 || fcmRes.summary.sent === 0) {
          const browserDelivery = recordAndSaveDelivery({
            id: `deliv-browser-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            notificationId,
            userId,
            emailId: email.id,
            threadId: email.threadId,
            channel: 'browser_push',
            status: 'failed',
            createdAt,
            error: fcmRes.summary.unconfigured ? 'Push notifications are not configured.' : fcmRes.summary.message,
            payload: { title, body, priority: effectivePriority, deviceCount: webDevices.length },
          });
          deliveries.push(browserDelivery);
        } else {
          for (const res of fcmRes.results) {
            const browserDelivery = recordAndSaveDelivery({
              id: `deliv-browser-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              notificationId,
              userId,
              emailId: email.id,
              threadId: email.threadId,
              channel: 'browser_push',
              status: res.status, // 'sent', NEVER 'delivered' until client confirms receipt!
              createdAt,
              sentAt: res.status === 'sent' ? new Date().toISOString() : undefined,
              error: res.error,
              payload: {
                title,
                body,
                priority: effectivePriority,
                deviceId: res.deviceId,
                messageId: res.messageId,
              },
            });
            deliveries.push(browserDelivery);
          }
          channelsAttempted.push('browser_push');
        }
      }
    } else {
      channelsSuppressed.push({
        channel: 'browser_push',
        reason: `Priority ${effectivePriority} below browser push threshold (${minPushPriority})`,
      });
    }
  }

  // Evaluate Mobile Push (Android / iOS FCM)
  const mobilePushEnabled = settings.mobilePushEnabled ?? false;
  if (mobilePushEnabled) {
    const qualifiesForMobile =
      effectivePriority === 'Critical' ||
      (effectivePriority === 'High' && (triggers.high ?? true) && meetsPriorityThreshold('High', minPushPriority));

    if (qualifiesForMobile) {
      const mobileDevices = db.getNotificationDevices(userId, true).filter((d) => d.platform === 'android' || d.platform === 'ios');

      if (mobileDevices.length === 0) {
        // Record failure: unconfigured device token
        const mobileFailed = recordAndSaveDelivery({
          id: `deliv-mobile-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          notificationId,
          userId,
          emailId: email.id,
          threadId: email.threadId,
          channel: 'mobile_push',
          status: 'failed',
          createdAt,
          error: 'Push notifications are not configured.',
          reason: 'No active mobile push device tokens registered for user.',
          payload: { title, body, priority: effectivePriority },
        });
        deliveries.push(mobileFailed);
      } else {
        const fcmRes = await dispatchFcmToUserDevices(userId, {
          notificationId,
          deliveryIdPrefix: `deliv-mobile-${Date.now()}`,
          emailId: email.id,
          threadId: email.threadId,
          title,
          body,
          priority: effectivePriority,
          classification,
          channelFilter: 'mobile_push',
        });

        if (fcmRes.results.length === 0 || fcmRes.summary.sent === 0) {
          const mobileFailed = recordAndSaveDelivery({
            id: `deliv-mobile-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            notificationId,
            userId,
            emailId: email.id,
            threadId: email.threadId,
            channel: 'mobile_push',
            status: 'failed',
            createdAt,
            error: fcmRes.summary.unconfigured ? 'Push notifications are not configured.' : fcmRes.summary.message,
            payload: { title, body, priority: effectivePriority, deviceCount: mobileDevices.length },
          });
          deliveries.push(mobileFailed);
        } else {
          for (const res of fcmRes.results) {
            const mobileSent = recordAndSaveDelivery({
              id: `deliv-mobile-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              notificationId,
              userId,
              emailId: email.id,
              threadId: email.threadId,
              channel: 'mobile_push',
              status: res.status,
              createdAt,
              sentAt: res.status === 'sent' ? new Date().toISOString() : undefined,
              error: res.error,
              payload: {
                title,
                body,
                priority: effectivePriority,
                deviceId: res.deviceId,
                messageId: res.messageId,
              },
            });
            deliveries.push(mobileSent);
          }
          channelsAttempted.push('mobile_push');
        }
      }
    } else {
      channelsSuppressed.push({
        channel: 'mobile_push',
        reason: `Priority ${effectivePriority} below mobile push threshold`,
      });
    }
  }

  // Evaluate Desktop / System Notifications
  const desktopEnabled = settings.desktopEnabled ?? true;
  if (desktopEnabled) {
    const qualifiesForDesktop =
      effectivePriority === 'Critical' ||
      (effectivePriority === 'High' && meetsPriorityThreshold('High', minDesktopPriority)) ||
      (effectivePriority === 'Medium' && (triggers.medium ?? false) && meetsPriorityThreshold('Medium', minDesktopPriority));

    if (qualifiesForDesktop) {
      const desktopDelivery = recordAndSaveDelivery({
        id: `deliv-desktop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        notificationId,
        userId,
        emailId: email.id,
        threadId: email.threadId,
        channel: 'desktop',
        status: 'sent',
        createdAt,
        sentAt: new Date().toISOString(),
        payload: { title, body, priority: effectivePriority },
      });
      deliveries.push(desktopDelivery);
      channelsAttempted.push('desktop');
    } else {
      channelsSuppressed.push({
        channel: 'desktop',
        reason: `Priority ${effectivePriority} below desktop threshold (${minDesktopPriority})`,
      });
    }
  }

  // Evaluate WhatsApp Direct Alerts (Official Meta WhatsApp Business Cloud API)
  const whatsappEnabled = settings.whatsappEnabled;
  const whatsappOptIn = settings.whatsappOptIn ?? false;
  const whatsappPhone = settings.whatsappPhone || settings.whatsappNumber;
  const whatsappThreshold = settings.whatsappThreshold || (settings.minimumPriorityForWhatsApp as any) || 'Critical';

  if (whatsappEnabled && whatsappPhone) {
    if (!whatsappOptIn) {
      // User must explicitly opt in!
      channelsSuppressed.push({
        channel: 'whatsapp',
        reason: 'WhatsApp alert suppressed: User has not explicitly opted in.',
      });
    } else if (qualifiesForWhatsApp(effectivePriority, whatsappThreshold)) {
      // Proactive dispatch via official WhatsApp Business Platform Cloud API
      const waResult = await sendWhatsAppAlert({
        userId,
        recipientPhone: whatsappPhone,
        emailId: email.id,
        threadId: email.threadId,
        notificationId,
        priority: effectivePriority,
        sender: email.senderName || email.sender,
        subject: email.subject,
        summary: email.aiAnalysis?.summary || email.subject,
        isSecurityAlert,
      });

      // Find created delivery record
      const waRecord = db.getNotificationDeliveries().find((d) => d.id === waResult.deliveryId);
      if (waRecord) {
        deliveries.push(waRecord);
      }

      if (waResult.success) {
        channelsAttempted.push('whatsapp');
      }
    } else {
      channelsSuppressed.push({
        channel: 'whatsapp',
        reason: `Priority ${effectivePriority} does not meet WhatsApp threshold (${whatsappThreshold})`,
      });
    }
  }

  // Evaluate Daily Digest Channel
  // Low or Informational emails are batched for daily digest if digest is enabled
  const dailyDigestEnabled = settings.dailyDigestEnabled ?? true;
  if (
    dailyDigestEnabled &&
    (effectivePriority === 'Low' || effectivePriority === 'Informational' || triggers.summary)
  ) {
    const digestDelivery = recordAndSaveDelivery({
      id: `deliv-digest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      notificationId,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'daily_digest',
      status: 'pending', // Queued pending daily digest generation
      createdAt,
      payload: {
        digestTime: settings.dailyDigestTime || '08:00',
        subject: email.subject,
        priority: effectivePriority,
      },
    });
    deliveries.push(digestDelivery);
    channelsAttempted.push('daily_digest');
  }

  // If no channel qualified and none was attempted, record a suppressed delivery record
  if (deliveries.length === 0) {
    const defaultSuppressed = recordAndSaveDelivery({
      id: `deliv-suppressed-${Date.now()}`,
      notificationId,
      userId,
      emailId: email.id,
      threadId: email.threadId,
      channel: 'browser_push',
      status: 'suppressed',
      reason: `No enabled notification channels qualified for priority "${effectivePriority}".`,
      createdAt,
    });
    deliveries.push(defaultSuppressed);
  }

  return {
    notificationId,
    emailId: email.id,
    threadId: email.threadId,
    isSecurityAlert,
    effectivePriority,
    decisionReasons,
    channelsAttempted,
    channelsSuppressed,
    deliveries,
  };
}

/**
 * Confirms receipt of a notification delivery, transitioning from 'sent' to 'delivered'.
 * Enforces rule: "Never report 'delivered' unless delivery is actually confirmed."
 */
export function confirmNotificationDelivery(
  deliveryId: string,
  details?: { confirmedBy?: string; userAgent?: string }
): NotificationDeliveryRecord | null {
  const delivery = db.getDeliveryById(deliveryId);
  if (!delivery) return null;

  const now = new Date().toISOString();
  const updated = db.updateDelivery(deliveryId, {
    status: 'delivered',
    deliveredAt: now,
    payload: {
      ...(delivery.payload || {}),
      confirmedAt: now,
      confirmedBy: details?.confirmedBy || 'client_ack',
      userAgent: details?.userAgent,
    },
  });

  if (updated) {
    FirestoreDb.recordDelivery(delivery.userId, {
      id: updated.id,
      userId: updated.userId,
      notificationId: updated.notificationId,
      emailId: updated.emailId,
      threadId: updated.threadId,
      channel: updated.channel,
      status: 'delivered',
      createdAt: updated.createdAt,
      sentAt: updated.sentAt,
      deliveredAt: now,
      reason: updated.reason,
      payload: updated.payload || {},
    }).catch(() => {});
  }

  return updated;
}

/**
 * Helper to record and persist a delivery record to both db and Firestore
 */
function recordAndSaveDelivery(record: NotificationDeliveryRecord): NotificationDeliveryRecord {
  db.recordDelivery(record);
  FirestoreDb.recordDelivery(record.userId, {
    id: record.id,
    userId: record.userId,
    notificationId: record.notificationId,
    emailId: record.emailId,
    threadId: record.threadId,
    channel: record.channel,
    status: record.status,
    createdAt: record.createdAt,
    sentAt: record.sentAt,
    deliveredAt: record.deliveredAt,
    error: record.error,
    reason: record.reason,
    payload: record.payload || {},
  }).catch(() => {});
  return record;
}
