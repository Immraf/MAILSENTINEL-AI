/**
 * MailSentinel AI - Server-Side Firestore Repository
 * Powered by Firebase Admin SDK.
 * 
 * Implements strict per-user UID isolation under /users/{userId}/...
 * Production-ready persistent storage for all 20 MailSentinel collections.
 */

import { getAdminFirestore } from './firebaseAdmin';
import {
  FirestoreUserDoc,
  FirestoreEmailAccountDoc,
  FirestoreEmailSyncStateDoc,
  FirestoreEmailDoc,
  FirestoreEmailThreadDoc,
  FirestoreAttachmentDoc,
  FirestoreAiAnalysisDoc,
  FirestoreExtractedEntityDoc,
  FirestoreSecurityAnalysisDoc,
  FirestoreSecurityIndicatorDoc,
  FirestoreTaskDoc,
  FirestoreDeadlineDoc,
  FirestoreNotificationDoc,
  FirestoreNotificationDeliveryDoc,
  FirestoreNotificationDeviceDoc,
  FirestoreNotificationPreferencesDoc,
  FirestoreSecurityRuleDoc,
  FirestoreUserRuleDoc,
  FirestoreQuarantineItemDoc,
  FirestoreAuditLogDoc,
} from '../src/types/firestore';
import {
  Email,
  EmailAccount,
  NotificationSettings,
  QuarantineItem,
  SecurityAlert,
  SecurityRule,
  SecuritySettings,
  WhitelistBlacklistEntry,
} from '../src/types';
import {
  initialNotificationSettings,
  initialSecuritySettings,
  initialRules,
} from '../src/mockData';

export class FirestoreDb {
  private static get db() {
    return getAdminFirestore();
  }

  // ==========================================================================
  // 1. Users (/users/{userId})
  // ==========================================================================
  static async getUser(userId: string): Promise<FirestoreUserDoc | null> {
    const snap = await this.db.doc(`users/${userId}`).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreUserDoc;
  }

  static async createUser(user: FirestoreUserDoc): Promise<FirestoreUserDoc> {
    const userRef = this.db.doc(`users/${user.id}`);
    const now = new Date().toISOString();
    const docData: FirestoreUserDoc = {
      ...user,
      createdAt: user.createdAt || now,
      updatedAt: now,
    };
    await userRef.set(docData, { merge: true });

    // Initialize default preferences & security rules if not existing
    await this.initUserDefaults(user.id);
    return docData;
  }

  static async updateUser(userId: string, patch: Partial<FirestoreUserDoc>): Promise<FirestoreUserDoc | null> {
    const userRef = this.db.doc(`users/${userId}`);
    const snap = await userRef.get();
    if (!snap.exists) return null;
    const now = new Date().toISOString();
    const updated = { ...snap.data(), ...patch, updatedAt: now };
    await userRef.set(updated, { merge: true });
    return updated as FirestoreUserDoc;
  }

  private static async initUserDefaults(userId: string): Promise<void> {
    try {
      const notifPrefRef = this.db.doc(`users/${userId}/notificationPreferences/default`);
      const notifSnap = await notifPrefRef.get();
      if (!notifSnap.exists) {
        await notifPrefRef.set({
          id: 'default',
          userId,
          pushEnabled: true,
          whatsappEnabled: false,
          whatsappPhone: '',
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '07:00',
            allowCriticalSecurity: true,
          },
          triggers: {
            critical: true,
            high: true,
            threats: true,
            deadlines: true,
            quarantine: true,
            summary: true,
          },
          updatedAt: new Date().toISOString(),
        });
      }

      // Initialize default security settings
      const secSettingsRef = this.db.doc(`users/${userId}/settings/security`);
      const secSnap = await secSettingsRef.get();
      if (!secSnap.exists) {
        await secSettingsRef.set({
          ...initialSecuritySettings,
          userId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`Could not initialize defaults for user ${userId}:`, err);
    }
  }

  // ==========================================================================
  // 2. Email Accounts (/users/{userId}/emailAccounts/{accountId})
  // ==========================================================================
  static async getAccounts(userId: string): Promise<FirestoreEmailAccountDoc[]> {
    const snap = await this.db.collection(`users/${userId}/emailAccounts`).get();
    return snap.docs.map((doc) => doc.data() as FirestoreEmailAccountDoc);
  }

  static async getAccountById(userId: string, accountId: string): Promise<FirestoreEmailAccountDoc | null> {
    const snap = await this.db.doc(`users/${userId}/emailAccounts/${accountId}`).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreEmailAccountDoc;
  }

  static async addAccount(userId: string, account: EmailAccount): Promise<FirestoreEmailAccountDoc> {
    const existing = await this.getAccounts(userId);
    if (existing.length >= 10) {
      throw new Error('Account limit reached. Maximum 10 connected email accounts permitted.');
    }
    const docData: FirestoreEmailAccountDoc = {
      id: account.id,
      userId,
      provider: account.provider,
      emailAddress: account.emailAddress,
      displayName: account.displayName,
      status: account.status || 'active',
      lastSyncedAt: account.lastSyncedAt || new Date().toISOString(),
      totalEmails: account.totalEmails || 0,
      threatsDetected: account.threatsDetected || 0,
      isPrimary: account.isPrimary || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.doc(`users/${userId}/emailAccounts/${account.id}`).set(docData, { merge: true });

    // Initialize sync state
    await this.updateSyncState(userId, account.id, {
      status: 'idle',
      lastSyncedAt: docData.lastSyncedAt,
      progressPercent: 100,
      syncedCount: docData.totalEmails,
    });

    return docData;
  }

  static async updateAccount(userId: string, accountId: string, patch: Partial<FirestoreEmailAccountDoc>): Promise<FirestoreEmailAccountDoc | null> {
    const ref = this.db.doc(`users/${userId}/emailAccounts/${accountId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updated = {
      ...snap.data(),
      ...patch,
      updatedAt: new Date().toISOString(),
    } as FirestoreEmailAccountDoc;
    await ref.set(updated, { merge: true });
    return updated;
  }

  static async deleteAccount(userId: string, accountId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/emailAccounts/${accountId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;

    // Remove the account
    await ref.delete();

    // Cascade delete sync state
    await this.db.doc(`users/${userId}/emailSyncState/${accountId}`).delete().catch(() => {});

    // Cascade remove emails belonging to this account
    try {
      const emailSnaps = await this.db.collection(`users/${userId}/emails`)
        .where('accountId', '==', accountId)
        .get();
      const batch = this.db.batch();
      emailSnaps.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (e) {
      console.warn('Error deleting associated emails for account:', e);
    }

    return true;
  }

  // ==========================================================================
  // 3. Email Sync State (/users/{userId}/emailSyncState/{accountId})
  // ==========================================================================
  static async getSyncState(userId: string, accountId: string): Promise<FirestoreEmailSyncStateDoc | null> {
    const snap = await this.db.doc(`users/${userId}/emailSyncState/${accountId}`).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreEmailSyncStateDoc;
  }

  static async updateSyncState(userId: string, accountId: string, patch: Partial<FirestoreEmailSyncStateDoc>): Promise<void> {
    const ref = this.db.doc(`users/${userId}/emailSyncState/${accountId}`);
    const now = new Date().toISOString();
    const existing = await this.getSyncState(userId, accountId);
    const data: FirestoreEmailSyncStateDoc = {
      id: accountId,
      accountId,
      userId,
      status: patch.status || existing?.status || 'idle',
      lastSyncedAt: patch.lastSyncedAt || existing?.lastSyncedAt || now,
      progressPercent: patch.progressPercent ?? existing?.progressPercent ?? 100,
      syncedCount: patch.syncedCount ?? existing?.syncedCount ?? 0,
      errorMessage: patch.errorMessage ?? existing?.errorMessage,
      providerHistoryId: patch.providerHistoryId ?? existing?.providerHistoryId,
      deltaToken: patch.deltaToken ?? existing?.deltaToken,
      updatedAt: now,
    };
    await ref.set(data, { merge: true });
  }

  // ==========================================================================
  // 4. Emails (/users/{userId}/emails/{emailId})
  // ==========================================================================
  static async getEmails(userId: string, options?: { accountId?: string; limitCount?: number }): Promise<FirestoreEmailDoc[]> {
    let queryRef: FirebaseFirestore.Query = this.db.collection(`users/${userId}/emails`);
    if (options?.accountId) {
      queryRef = queryRef.where('accountId', '==', options.accountId);
    }
    if (options?.limitCount) {
      queryRef = queryRef.limit(options.limitCount);
    }
    const snap = await queryRef.get();
    const emails = snap.docs.map((d) => d.data() as FirestoreEmailDoc);
    // Sort descending by receivedAt
    return emails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  static async getEmailById(userId: string, emailId: string): Promise<FirestoreEmailDoc | null> {
    const snap = await this.db.doc(`users/${userId}/emails/${emailId}`).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreEmailDoc;
  }

  static async saveEmail(userId: string, email: Email): Promise<FirestoreEmailDoc> {
    const ref = this.db.doc(`users/${userId}/emails/${email.id}`);
    const now = new Date().toISOString();
    const docData: FirestoreEmailDoc = {
      ...email,
      userId,
      createdAt: (email as any).createdAt || email.receivedAt || now,
      updatedAt: now,
    };
    await ref.set(docData, { merge: true });

    // Also persist associated sub-items if present
    if (email.aiAnalysis) {
      await this.saveAiAnalysis(userId, {
        id: `ai-${email.id}`,
        userId,
        emailId: email.id,
        threadId: email.threadId,
        summary: email.aiAnalysis.summary,
        priority: email.aiAnalysis.priority,
        priorityScore: email.aiAnalysis.priorityScore,
        category: email.aiAnalysis.category,
        sentiment: email.aiAnalysis.sentiment,
        actionRequired: email.aiAnalysis.actionRequired,
        recommendedAction: email.aiAnalysis.recommendedAction,
        deadline: email.aiAnalysis.deadline,
        confidence: email.aiAnalysis.confidence,
        whyPriorityReasons: email.aiAnalysis.whyPriorityReasons || [],
        analyzedAt: (email.aiAnalysis as any).analyzedAt || now,
      });
    }

    if (email.securityAnalysis) {
      await this.saveSecurityAnalysis(userId, {
        id: `sec-${email.id}`,
        userId,
        emailId: email.id,
        classification: email.securityAnalysis.classification,
        riskScore: email.securityAnalysis.riskScore,
        riskLevel: email.securityAnalysis.riskLevel,
        phishingScore: email.securityAnalysis.phishingScore,
        spamScore: email.securityAnalysis.spamScore,
        spoofingScore: email.securityAnalysis.spoofingScore,
        confidenceScore: (email.securityAnalysis as any).confidenceScore || 95,
        explanation: (email.securityAnalysis as any).explanation || email.securityAnalysis.whyFlaggedReasons?.join('. ') || '',
        authResults: email.securityAnalysis.authResults,
        senderDomainAnalysis: email.securityAnalysis.senderDomainAnalysis,
        urlAnalysis: email.securityAnalysis.urlAnalysis,
        whyFlaggedReasons: email.securityAnalysis.whyFlaggedReasons || [],
        scannedAt: (email.securityAnalysis as any).scannedAt || now,
      });
    }

    return docData;
  }

  static async updateEmail(userId: string, emailId: string, patch: Partial<Email>): Promise<FirestoreEmailDoc | null> {
    const ref = this.db.doc(`users/${userId}/emails/${emailId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updated: FirestoreEmailDoc = {
      ...(snap.data() as FirestoreEmailDoc),
      ...patch,
      userId,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(updated, { merge: true });
    return updated;
  }

  static async deleteEmail(userId: string, emailId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/emails/${emailId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  // ==========================================================================
  // 5. Email Threads (/users/{userId}/emailThreads/{threadId})
  // ==========================================================================
  static async getThreads(userId: string): Promise<FirestoreEmailThreadDoc[]> {
    const snap = await this.db.collection(`users/${userId}/emailThreads`).get();
    return snap.docs.map((d) => d.data() as FirestoreEmailThreadDoc);
  }

  static async saveThread(userId: string, thread: FirestoreEmailThreadDoc): Promise<void> {
    await this.db.doc(`users/${userId}/emailThreads/${thread.id}`).set({
      ...thread,
      userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ==========================================================================
  // 6. Attachments (/users/{userId}/attachments/{attachmentId})
  // ==========================================================================
  static async getAttachments(userId: string, emailId?: string): Promise<FirestoreAttachmentDoc[]> {
    let q: FirebaseFirestore.Query = this.db.collection(`users/${userId}/attachments`);
    if (emailId) q = q.where('emailId', '==', emailId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as FirestoreAttachmentDoc);
  }

  static async saveAttachment(userId: string, attachment: FirestoreAttachmentDoc): Promise<void> {
    await this.db.doc(`users/${userId}/attachments/${attachment.id}`).set({
      ...attachment,
      userId,
    }, { merge: true });
  }

  // ==========================================================================
  // 7. AI Analysis (/users/{userId}/aiAnalysis/{analysisId})
  // ==========================================================================
  static async getAiAnalysis(userId: string, emailId: string): Promise<FirestoreAiAnalysisDoc | null> {
    const snap = await this.db.collection(`users/${userId}/aiAnalysis`)
      .where('emailId', '==', emailId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as FirestoreAiAnalysisDoc;
  }

  static async saveAiAnalysis(userId: string, analysis: FirestoreAiAnalysisDoc): Promise<void> {
    await this.db.doc(`users/${userId}/aiAnalysis/${analysis.id}`).set({
      ...analysis,
      userId,
    }, { merge: true });
  }

  // ==========================================================================
  // 8. Extracted Entities (/users/{userId}/extractedEntities/{entityId})
  // ==========================================================================
  static async getExtractedEntities(userId: string, emailId?: string): Promise<FirestoreExtractedEntityDoc[]> {
    let q: FirebaseFirestore.Query = this.db.collection(`users/${userId}/extractedEntities`);
    if (emailId) q = q.where('emailId', '==', emailId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as FirestoreExtractedEntityDoc);
  }

  static async saveExtractedEntity(userId: string, entity: FirestoreExtractedEntityDoc): Promise<void> {
    await this.db.doc(`users/${userId}/extractedEntities/${entity.id}`).set({
      ...entity,
      userId,
    }, { merge: true });
  }

  // ==========================================================================
  // 9. Security Analysis (/users/{userId}/securityAnalysis/{analysisId})
  // ==========================================================================
  static async getSecurityAnalysis(userId: string, emailId: string): Promise<FirestoreSecurityAnalysisDoc | null> {
    const snap = await this.db.collection(`users/${userId}/securityAnalysis`)
      .where('emailId', '==', emailId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as FirestoreSecurityAnalysisDoc;
  }

  static async saveSecurityAnalysis(userId: string, analysis: FirestoreSecurityAnalysisDoc): Promise<void> {
    await this.db.doc(`users/${userId}/securityAnalysis/${analysis.id}`).set({
      ...analysis,
      userId,
    }, { merge: true });
  }

  // ==========================================================================
  // 10. Security Indicators (/users/{userId}/securityIndicators/{indicatorId})
  // ==========================================================================
  static async getSecurityIndicators(userId: string, emailId?: string): Promise<FirestoreSecurityIndicatorDoc[]> {
    let q: FirebaseFirestore.Query = this.db.collection(`users/${userId}/securityIndicators`);
    if (emailId) q = q.where('emailId', '==', emailId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as FirestoreSecurityIndicatorDoc);
  }

  static async saveSecurityIndicator(userId: string, indicator: FirestoreSecurityIndicatorDoc): Promise<void> {
    await this.db.doc(`users/${userId}/securityIndicators/${indicator.id}`).set({
      ...indicator,
      userId,
    }, { merge: true });
  }

  // ==========================================================================
  // 11. Tasks (/users/{userId}/tasks/{taskId})
  // ==========================================================================
  static async getTasks(userId: string): Promise<FirestoreTaskDoc[]> {
    const snap = await this.db.collection(`users/${userId}/tasks`).get();
    return snap.docs.map((d) => d.data() as FirestoreTaskDoc);
  }

  static async saveTask(userId: string, task: FirestoreTaskDoc): Promise<FirestoreTaskDoc> {
    const docData: FirestoreTaskDoc = {
      ...task,
      userId,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.doc(`users/${userId}/tasks/${task.id}`).set(docData, { merge: true });
    return docData;
  }

  static async updateTask(userId: string, taskId: string, patch: Partial<FirestoreTaskDoc>): Promise<FirestoreTaskDoc | null> {
    const ref = this.db.doc(`users/${userId}/tasks/${taskId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updated = { ...snap.data(), ...patch, updatedAt: new Date().toISOString() } as FirestoreTaskDoc;
    await ref.set(updated, { merge: true });
    return updated;
  }

  static async deleteTask(userId: string, taskId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/tasks/${taskId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  // ==========================================================================
  // 12. Deadlines (/users/{userId}/deadlines/{deadlineId})
  // ==========================================================================
  static async getDeadlines(userId: string): Promise<FirestoreDeadlineDoc[]> {
    const snap = await this.db.collection(`users/${userId}/deadlines`).get();
    return snap.docs.map((d) => d.data() as FirestoreDeadlineDoc);
  }

  static async saveDeadline(userId: string, deadline: FirestoreDeadlineDoc): Promise<void> {
    await this.db.doc(`users/${userId}/deadlines/${deadline.id}`).set({
      ...deadline,
      userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ==========================================================================
  // 13. In-App Notifications (/users/{userId}/notifications/{notificationId})
  // ==========================================================================
  static async getNotifications(userId: string): Promise<FirestoreNotificationDoc[]> {
    const snap = await this.db.collection(`users/${userId}/notifications`).get();
    const notifs = snap.docs.map((d) => d.data() as FirestoreNotificationDoc);
    return notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async addNotification(userId: string, notif: FirestoreNotificationDoc): Promise<void> {
    await this.db.doc(`users/${userId}/notifications/${notif.id}`).set({
      ...notif,
      userId,
      createdAt: notif.createdAt || new Date().toISOString(),
    }, { merge: true });
  }

  static async markNotificationRead(userId: string, notifId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/notifications/${notifId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.update({ read: true });
    return true;
  }

  // ==========================================================================
  // 14. Notification Deliveries (/users/{userId}/notificationDeliveries/{deliveryId})
  // ==========================================================================
  static async getDeliveries(userId: string, options?: { threadId?: string; withinMs?: number }): Promise<FirestoreNotificationDeliveryDoc[]> {
    let q: FirebaseFirestore.Query = this.db.collection(`users/${userId}/notificationDeliveries`);
    if (options?.threadId) {
      q = q.where('threadId', '==', options.threadId);
    }
    const snap = await q.get();
    let deliveries = snap.docs.map((d) => d.data() as FirestoreNotificationDeliveryDoc);
    if (options?.withinMs) {
      const cutoff = Date.now() - options.withinMs;
      deliveries = deliveries.filter((d) => new Date(d.createdAt).getTime() > cutoff);
    }
    return deliveries;
  }

  static async recordDelivery(userId: string, delivery: FirestoreNotificationDeliveryDoc): Promise<void> {
    await this.db.doc(`users/${userId}/notificationDeliveries/${delivery.id}`).set({
      ...delivery,
      userId,
      createdAt: delivery.createdAt || new Date().toISOString(),
    }, { merge: true });
  }

  static async updateDelivery(userId: string, deliveryId: string, patch: Partial<FirestoreNotificationDeliveryDoc>): Promise<void> {
    await this.db.doc(`users/${userId}/notificationDeliveries/${deliveryId}`).set({
      ...patch,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ==========================================================================
  // 15. Notification Devices (/users/{userId}/notificationDevices/{deviceId})
  // ==========================================================================
  static async getNotificationDevices(userId: string): Promise<FirestoreNotificationDeviceDoc[]> {
    const snap = await this.db.collection(`users/${userId}/notificationDevices`).get();
    return snap.docs.map((d) => d.data() as FirestoreNotificationDeviceDoc);
  }

  static async registerNotificationDevice(userId: string, device: FirestoreNotificationDeviceDoc): Promise<void> {
    const docId = device.deviceId || device.id;
    const now = new Date().toISOString();
    await this.db.doc(`users/${userId}/notificationDevices/${docId}`).set({
      ...device,
      id: docId,
      deviceId: docId,
      userId,
      createdAt: device.createdAt || now,
      lastSeenAt: now,
      lastActiveAt: now,
      enabled: device.enabled ?? true,
    }, { merge: true });
  }

  static async deleteNotificationDevice(userId: string, deviceId: string): Promise<void> {
    await this.db.doc(`users/${userId}/notificationDevices/${deviceId}`).delete();
  }

  // ==========================================================================
  // 16. Notification Preferences (/users/{userId}/notificationPreferences/{prefId})
  // ==========================================================================
  static async getNotificationPreferences(userId: string): Promise<NotificationSettings> {
    const snap = await this.db.doc(`users/${userId}/notificationPreferences/default`).get();
    if (!snap.exists) {
      return { ...initialNotificationSettings };
    }
    const data = snap.data() as FirestoreNotificationPreferencesDoc;
    return {
      pushEnabled: data.pushEnabled ?? true,
      whatsappEnabled: data.whatsappEnabled ?? false,
      whatsappPhone: data.whatsappPhone ?? '',
      quietHours: data.quietHours ?? initialNotificationSettings.quietHours,
      triggers: data.triggers ?? initialNotificationSettings.triggers,
    };
  }

  static async updateNotificationPreferences(userId: string, patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const ref = this.db.doc(`users/${userId}/notificationPreferences/default`);
    const current = await this.getNotificationPreferences(userId);
    const updated = { ...current, ...patch };
    await ref.set({
      id: 'default',
      userId,
      ...updated,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return updated;
  }

  static async saveNotificationSettings(userId: string, patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
    return this.updateNotificationPreferences(userId, patch);
  }

  // ==========================================================================
  // 17. Security Rules (/users/{userId}/securityRules/{ruleId})
  // ==========================================================================
  static async getSecurityRules(userId: string): Promise<SecurityRule[]> {
    const snap = await this.db.collection(`users/${userId}/securityRules`).get();
    if (snap.empty) {
      // Seed default rules for new user
      const defaultRules = initialRules.map((r) => ({ ...r, userId }));
      const batch = this.db.batch();
      defaultRules.forEach((rule) => {
        const ref = this.db.doc(`users/${userId}/securityRules/${rule.id}`);
        batch.set(ref, rule);
      });
      await batch.commit().catch(() => {});
      return defaultRules;
    }
    return snap.docs.map((d) => d.data() as SecurityRule);
  }

  static async addSecurityRule(userId: string, rule: SecurityRule): Promise<SecurityRule> {
    const docData = {
      ...rule,
      userId,
      createdAt: (rule as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.doc(`users/${userId}/securityRules/${rule.id}`).set(docData, { merge: true });
    return docData;
  }

  static async updateSecurityRule(userId: string, ruleId: string, patch: Partial<SecurityRule>): Promise<SecurityRule | null> {
    const ref = this.db.doc(`users/${userId}/securityRules/${ruleId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updated = {
      ...snap.data(),
      ...patch,
      userId,
      updatedAt: new Date().toISOString(),
    } as SecurityRule;
    await ref.set(updated, { merge: true });
    return updated;
  }

  static async deleteSecurityRule(userId: string, ruleId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/securityRules/${ruleId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  // ==========================================================================
  // 18. User Rules (/users/{userId}/userRules/{ruleId})
  // ==========================================================================
  static async getUserRules(userId: string): Promise<FirestoreUserRuleDoc[]> {
    const snap = await this.db.collection(`users/${userId}/userRules`).get();
    return snap.docs.map((d) => d.data() as FirestoreUserRuleDoc);
  }

  static async addUserRule(userId: string, rule: FirestoreUserRuleDoc): Promise<FirestoreUserRuleDoc> {
    const docData: FirestoreUserRuleDoc = {
      ...rule,
      userId,
      createdAt: rule.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.doc(`users/${userId}/userRules/${rule.id}`).set(docData, { merge: true });
    return docData;
  }

  // ==========================================================================
  // 19. Quarantine Items (/users/{userId}/quarantineItems/{itemId})
  // ==========================================================================
  static async getQuarantine(userId: string): Promise<QuarantineItem[]> {
    const snap = await this.db.collection(`users/${userId}/quarantineItems`).get();
    const items = snap.docs.map((d) => d.data() as QuarantineItem);
    return items.sort((a, b) => new Date(b.quarantinedAt).getTime() - new Date(a.quarantinedAt).getTime());
  }

  static async saveQuarantineItem(userId: string, item: QuarantineItem): Promise<QuarantineItem> {
    const docData = { ...item, userId };
    await this.db.doc(`users/${userId}/quarantineItems/${item.id}`).set(docData, { merge: true });
    return item;
  }

  static async updateQuarantineItem(userId: string, itemId: string, patch: Partial<QuarantineItem>): Promise<QuarantineItem | null> {
    const ref = this.db.doc(`users/${userId}/quarantineItems/${itemId}`);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updated = { ...snap.data(), ...patch, userId } as QuarantineItem;
    await ref.set(updated, { merge: true });
    return updated;
  }

  static async deleteQuarantineItem(userId: string, itemId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/quarantineItems/${itemId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  // ==========================================================================
  // 20. Audit Logs (/users/{userId}/auditLogs/{logId})
  // ==========================================================================
  static async getAuditLogs(userId: string, limitCount = 100): Promise<FirestoreAuditLogDoc[]> {
    const snap = await this.db.collection(`users/${userId}/auditLogs`)
      .limit(limitCount)
      .get();
    const logs = snap.docs.map((d) => d.data() as FirestoreAuditLogDoc);
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  static async addAuditLog(userId: string, log: Omit<FirestoreAuditLogDoc, 'userId'>): Promise<FirestoreAuditLogDoc> {
    const logData: FirestoreAuditLogDoc = {
      ...log,
      userId,
      id: log.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: log.timestamp || new Date().toISOString(),
    };
    await this.db.doc(`users/${userId}/auditLogs/${logData.id}`).set(logData, { merge: true });
    return logData;
  }

  // ==========================================================================
  // Security Alerts (/users/{userId}/alerts/{alertId})
  // ==========================================================================
  static async getAlerts(userId: string): Promise<SecurityAlert[]> {
    const snap = await this.db.collection(`users/${userId}/alerts`).get();
    const alerts = snap.docs.map((d) => d.data() as SecurityAlert);
    return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  static async addAlert(userId: string, alert: SecurityAlert): Promise<SecurityAlert> {
    const docData = { ...alert, userId };
    await this.db.doc(`users/${userId}/alerts/${alert.id}`).set(docData, { merge: true });
    return alert;
  }

  static async acknowledgeAlert(userId: string, alertId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/alerts/${alertId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.update({ acknowledged: true });
    return true;
  }

  // ==========================================================================
  // Security Settings (/users/{userId}/settings/security)
  // ==========================================================================
  static async getSecuritySettings(userId: string): Promise<SecuritySettings> {
    const snap = await this.db.doc(`users/${userId}/settings/security`).get();
    if (!snap.exists) {
      return { ...initialSecuritySettings };
    }
    return snap.data() as SecuritySettings;
  }

  static async updateSecuritySettings(userId: string, patch: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const ref = this.db.doc(`users/${userId}/settings/security`);
    const current = await this.getSecuritySettings(userId);
    const updated = { ...current, ...patch };
    await ref.set({ ...updated, userId, updatedAt: new Date().toISOString() }, { merge: true });
    return updated;
  }

  // ==========================================================================
  // Whitelist / Blacklist (/users/{userId}/whitelistBlacklist/{entryId})
  // ==========================================================================
  static async getWhitelistBlacklist(userId: string): Promise<WhitelistBlacklistEntry[]> {
    const snap = await this.db.collection(`users/${userId}/whitelistBlacklist`).get();
    return snap.docs.map((d) => d.data() as WhitelistBlacklistEntry);
  }

  static async addWhitelistBlacklist(userId: string, entry: WhitelistBlacklistEntry): Promise<WhitelistBlacklistEntry> {
    const docData = { ...entry, userId };
    await this.db.doc(`users/${userId}/whitelistBlacklist/${entry.id}`).set(docData, { merge: true });
    return entry;
  }

  static async removeWhitelistBlacklist(userId: string, entryId: string): Promise<boolean> {
    const ref = this.db.doc(`users/${userId}/whitelistBlacklist/${entryId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
}

export { FirestoreDb as FirestoreService };
