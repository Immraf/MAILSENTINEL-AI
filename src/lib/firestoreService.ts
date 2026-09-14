import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Email,
  EmailAccount,
  GoogleCalendarEvent,
  GoogleTaskItem,
  EmailDriveAttachment,
  QuarantineItem,
  AutomationRule,
  SecuritySettings,
  NotificationConfig,
} from '../types';

export class FirestoreSyncService {
  /**
   * Sync or save user profile
   */
  static async saveUserProfile(userId: string, email: string, displayName?: string, photoURL?: string) {
    const path = `users/${userId}`;
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(
        userRef,
        {
          id: userId,
          email,
          displayName: displayName || email.split('@')[0],
          photoURL: photoURL || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  /**
   * Email Accounts
   */
  static async loadEmailAccounts(userId: string): Promise<EmailAccount[]> {
    const path = `users/${userId}/emailAccounts`;
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'emailAccounts'));
      const accounts: EmailAccount[] = [];
      snap.forEach((d) => {
        const data = d.data();
        accounts.push({
          id: data.id || d.id,
          provider: data.provider || 'gmail',
          emailAddress: data.emailAddress || '',
          displayName: data.displayName || data.emailAddress,
          status: data.connectionStatus || data.status || 'active',
          lastSyncedAt: data.lastSuccessfulSync || data.lastSyncedAt || 'Never',
          totalEmails: data.totalEmails || 0,
          threatsDetected: data.threatsDetected || 0,
          isPrimary: data.isPrimary || false,
        });
      });
      return accounts;
    } catch (err) {
      console.warn('Could not load accounts from Firestore, using local cache', err);
      return [];
    }
  }

  static async loadAccounts(userId: string): Promise<EmailAccount[]> {
    return this.loadEmailAccounts(userId);
  }

  static async saveEmailAccount(userId: string, account: EmailAccount) {
    const path = `users/${userId}/emailAccounts/${account.id}`;
    try {
      const accRef = doc(db, 'users', userId, 'emailAccounts', account.id);
      await setDoc(
        accRef,
        {
          id: account.id,
          userId,
          provider: account.provider,
          emailAddress: account.emailAddress,
          displayName: account.displayName,
          accountLabel: account.displayName,
          connectionStatus: account.status,
          status: account.status,
          lastSuccessfulSync: account.lastSyncedAt,
          lastSyncedAt: account.lastSyncedAt,
          totalEmails: account.totalEmails || 0,
          threatsDetected: account.threatsDetected || 0,
          isPrimary: account.isPrimary || false,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  static async saveAccount(userId: string, account: EmailAccount) {
    return this.saveEmailAccount(userId, account);
  }

  static async deleteEmailAccount(userId: string, accountId: string) {
    const path = `users/${userId}/emailAccounts/${accountId}`;
    try {
      await deleteDoc(doc(db, 'users', userId, 'emailAccounts', accountId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  static async deleteAccount(userId: string, accountId: string) {
    return this.deleteEmailAccount(userId, accountId);
  }

  /**
   * Emails
   */
  static async loadEmails(userId: string): Promise<Email[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'emails'));
      const emails: Email[] = [];
      snap.forEach((d) => {
        const data = d.data();
        emails.push(data as Email);
      });
      return emails;
    } catch (err) {
      console.warn('Could not load emails from Firestore:', err);
      return [];
    }
  }

  static async saveEmail(userId: string, email: Email) {
    const path = `users/${userId}/emails/${email.id}`;
    try {
      const emailRef = doc(db, 'users', userId, 'emails', email.id);
      await setDoc(emailRef, email, { merge: true });
    } catch (err) {
      console.warn('Firestore email write error:', err);
    }
  }

  static async updateEmail(userId: string, emailId: string, updates: Partial<Email>) {
    const path = `users/${userId}/emails/${emailId}`;
    try {
      const emailRef = doc(db, 'users', userId, 'emails', emailId);
      await setDoc(emailRef, updates, { merge: true });
    } catch (err) {
      console.warn('Firestore email update error:', err);
    }
  }

  /**
   * Quarantine
   */
  static async loadQuarantine(userId: string): Promise<QuarantineItem[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'quarantine'));
      const items: QuarantineItem[] = [];
      snap.forEach((d) => {
        items.push(d.data() as QuarantineItem);
      });
      return items;
    } catch (err) {
      console.warn('Could not load quarantine items from Firestore:', err);
      return [];
    }
  }

  static async saveQuarantineItem(userId: string, item: QuarantineItem) {
    try {
      const ref = doc(db, 'users', userId, 'quarantine', item.id);
      await setDoc(ref, item, { merge: true });
    } catch (err) {
      console.warn('Firestore quarantine save error:', err);
    }
  }

  static async deleteQuarantineItem(userId: string, itemId: string) {
    try {
      await deleteDoc(doc(db, 'users', userId, 'quarantine', itemId));
    } catch (err) {
      console.warn('Firestore quarantine delete error:', err);
    }
  }

  /**
   * Automation & Security Rules
   */
  static async loadAutomationRules(userId: string): Promise<AutomationRule[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'rules'));
      const rules: AutomationRule[] = [];
      snap.forEach((d) => {
        rules.push(d.data() as AutomationRule);
      });
      return rules;
    } catch (err) {
      console.warn('Could not load rules from Firestore:', err);
      return [];
    }
  }

  static async saveAutomationRule(userId: string, rule: AutomationRule) {
    try {
      const ref = doc(db, 'users', userId, 'rules', rule.id);
      await setDoc(ref, rule, { merge: true });
    } catch (err) {
      console.warn('Firestore rule save error:', err);
    }
  }

  /**
   * User Settings (Security & Notifications)
   */
  static async loadSettings(userId: string): Promise<{ security?: SecuritySettings; notifications?: NotificationConfig } | null> {
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'settings', 'general'));
      if (snap.exists()) {
        return snap.data() as any;
      }
      return null;
    } catch (err) {
      console.warn('Could not load settings from Firestore:', err);
      return null;
    }
  }

  static async saveSettings(
    userId: string,
    security?: SecuritySettings,
    notifications?: NotificationConfig
  ) {
    try {
      const ref = doc(db, 'users', userId, 'settings', 'general');
      const payload: any = { updatedAt: new Date().toISOString() };
      if (security) payload.security = security;
      if (notifications) payload.notifications = notifications;
      await setDoc(ref, payload, { merge: true });
    } catch (err) {
      console.warn('Firestore settings save error:', err);
    }
  }

  /**
   * Google Calendar Events
   */
  static async loadCalendarEvents(userId: string): Promise<GoogleCalendarEvent[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'calendarEvents'));
      const events: GoogleCalendarEvent[] = [];
      snap.forEach((d) => {
        const data = d.data();
        events.push({
          id: data.id || d.id,
          summary: data.title || '(Untitled Event)',
          description: data.description || '',
          start: { dateTime: data.start },
          end: { dateTime: data.end },
          location: data.location || '',
        });
      });
      return events;
    } catch (err) {
      console.warn('Could not load calendar events from Firestore:', err);
      return [];
    }
  }

  static async saveCalendarEvent(userId: string, event: GoogleCalendarEvent) {
    const path = `users/${userId}/calendarEvents/${event.id}`;
    try {
      const ref = doc(db, 'users', userId, 'calendarEvents', event.id);
      await setDoc(
        ref,
        {
          id: event.id,
          userId,
          googleEventId: event.id,
          title: event.summary,
          description: event.description || '',
          start: event.start.dateTime || event.start.date || '',
          end: event.end.dateTime || event.end.date || '',
          location: event.location || '',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore calendar save error:', err);
    }
  }

  /**
   * Google Tasks
   */
  static async loadTasks(userId: string): Promise<GoogleTaskItem[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'tasks'));
      const tasks: GoogleTaskItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        tasks.push({
          id: data.id || d.id,
          title: data.title || '(Untitled Task)',
          notes: data.notes || '',
          due: data.due || '',
          status: data.status || 'needsAction',
          updated: data.createdAt,
        });
      });
      return tasks;
    } catch (err) {
      console.warn('Could not load tasks from Firestore:', err);
      return [];
    }
  }

  static async saveTask(userId: string, task: GoogleTaskItem) {
    const path = `users/${userId}/tasks/${task.id}`;
    try {
      const ref = doc(db, 'users', userId, 'tasks', task.id);
      await setDoc(
        ref,
        {
          id: task.id,
          userId,
          googleTaskId: task.id,
          title: task.title,
          notes: task.notes || '',
          due: task.due || '',
          status: task.status,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore task save error:', err);
    }
  }

  /**
   * Drive Attachments
   */
  static async loadDriveAttachments(userId: string, emailId?: string): Promise<EmailDriveAttachment[]> {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'driveAttachments'));
      const attachments: EmailDriveAttachment[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!emailId || data.emailId === emailId) {
          attachments.push({
            id: data.id || d.id,
            emailId: data.emailId || '',
            fileId: data.fileId || '',
            name: data.fileName || '(Unnamed File)',
            mimeType: data.mimeType || 'application/octet-stream',
            webViewLink: data.url || '',
            addedAt: data.createdAt || new Date().toISOString(),
          });
        }
      });
      return attachments;
    } catch (err) {
      console.warn('Could not load drive attachments from Firestore:', err);
      return [];
    }
  }

  static async saveDriveAttachment(userId: string, attachment: EmailDriveAttachment) {
    const path = `users/${userId}/driveAttachments/${attachment.id}`;
    try {
      const ref = doc(db, 'users', userId, 'driveAttachments', attachment.id);
      await setDoc(
        ref,
        {
          id: attachment.id,
          userId,
          emailId: attachment.emailId,
          fileId: attachment.fileId,
          fileName: attachment.name,
          mimeType: attachment.mimeType,
          url: attachment.webViewLink || '',
          createdAt: attachment.addedAt,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore drive attachment save error:', err);
    }
  }

  /**
   * Audit Logs
   */
  static async logAudit(userId: string, action: string, details: string, category = 'account') {
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const path = `users/${userId}/auditLogs/${logId}`;
    try {
      const ref = doc(db, 'users', userId, 'auditLogs', logId);
      await setDoc(ref, {
        id: logId,
        userId,
        action,
        category,
        details,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firestore audit log error:', err);
    }
  }
}
