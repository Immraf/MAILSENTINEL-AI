import fs from 'fs';
import path from 'path';
import {
  initialAccounts,
  initialAlerts,
  initialAuditLogs,
  initialEmails,
  initialNotificationSettings,
  initialQuarantine,
  initialRules,
  initialSecuritySettings,
  initialWhitelistBlacklist,
} from '../src/mockData';
import {
  AuditLog,
  Email,
  EmailAccount,
  NotificationSettings,
  QuarantineItem,
  SecurityAlert,
  SecurityRule,
  SecuritySettings,
  WhitelistBlacklistEntry,
  AccountStatus,
  EmailCategory,
  PriorityLevel,
  SecurityClassification,
  SecurityIndicator,
  ExtractedEntity,
} from '../src/types';
import { encryptToken } from './encryption';
import { FirestoreDb } from './firestoreDb';

/**
 * Background synchronizer for Firestore cloud persistence.
 * For authenticated non-demo users, replicates records to Cloud Firestore.
 */
function syncToFirestore(fn: () => Promise<any>): void {
  fn().catch((err) => {
    if (process.env.DEBUG_FIRESTORE) {
      console.warn('[Firestore Sync] Non-blocking persistence notice:', err?.message || err);
    }
  });
}

export interface EmailAnalysisRecord {
  id: string; // analysis id, e.g. `analysis-${emailId}`
  emailId: string;
  userId: string;
  version: string;
  analyzedAt: string;
  summary: string;
  category: EmailCategory;
  priority: PriorityLevel;
  priorityScore: number;
  urgency: 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
  actionRequired: boolean;
  recommendedAction: string;
  deadline: string | null;
  tasks: Array<{ id: string; title: string; dueDate?: string | null; completed: boolean }>;
  extractedEntities: ExtractedEntity[];
  whyPriorityReasons: string[];
  securityClassification: SecurityClassification;
  securityRiskScore: number;
  securityIndicators: SecurityIndicator[];
  notificationDecision: {
    shouldNotify: boolean;
    channel: 'urgent' | 'standard' | 'silent';
    reason: string;
  };
}

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  displayName?: string;
  passwordHash?: string;
  sessionToken?: string;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

export interface SyncStateRecord {
  accountId: string;
  userId: string;
  status: 'idle' | 'syncing' | 'error' | 'needs_reauth';
  lastSyncedAt: string;
  progressPercent: number;
  syncedCount: number;
  errorMessage?: string;
  providerHistoryId?: string;
  deltaToken?: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  title: string;
  body: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  securityClassification?: string;
  securityRiskScore?: number;
  isSecurityAlert: boolean;
  actionRequired: boolean;
  deadline?: string | null;
  category?: string;
  decisionReasons: string[];
  read: boolean;
  createdAt: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  notificationId: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  channel: 'browser_push' | 'mobile_push' | 'desktop' | 'whatsapp' | 'daily_digest' | 'push' | 'browser' | 'digest';
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed';
  createdAt: string;
  wamid?: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureCode?: number | string;
  failureReason?: string;
  error?: string;
  reason?: string;
  payload?: any;
}

export interface OAuthStateRecord {
  state: string;
  userId: string;
  provider: 'gmail' | 'outlook';
  createdAt: number;
  expiresAt: number;
  used?: boolean;
  redirectUri: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  emailAccounts: (EmailAccount & { userId: string; accessTokenEncrypted?: string; refreshTokenEncrypted?: string })[];
  emailSyncState: SyncStateRecord[];
  emails: (Email & { userId: string })[];
  quarantineItems: (QuarantineItem & { userId: string })[];
  alerts: (SecurityAlert & { userId: string })[];
  securityRules: (SecurityRule & { userId: string })[];
  auditLogs: (AuditLog & { userId: string })[];
  whitelistBlacklist: (WhitelistBlacklistEntry & { userId: string })[];
  notificationSettings: Record<string, NotificationSettings>; // keyed by userId
  securitySettings: Record<string, SecuritySettings>; // keyed by userId
  notifications: (NotificationRecord & { userId: string })[];
  notificationDeliveries: NotificationDeliveryRecord[];
  notificationDevices: Array<{
    id: string;
    userId: string;
    deviceId: string;
    platform: 'web' | 'android' | 'ios';
    pushToken: string;
    createdAt: string;
    lastSeenAt: string;
    enabled: boolean;
    userAgent?: string;
  }>;
  oauthStates: OAuthStateRecord[];
  usedAuthCodes?: Array<{ code: string; usedAt: number }>;
  emailAnalyses: (EmailAnalysisRecord & { userId: string })[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Memory cache of the database
let dbCache: DatabaseSchema | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('Could not create data directory:', e);
    }
  }
}

function getInitialDatabase(): DatabaseSchema {
  const defaultUserId = 'user-default';

  return {
    users: [
      {
        id: defaultUserId,
        email: 'alex.carter@sentinel-demo.io',
        name: 'Alex Carter',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: true,
      },
    ],
    emailAccounts: initialAccounts.map((a) => ({ ...a, userId: defaultUserId })),
    emailSyncState: initialAccounts.map((a) => ({
      accountId: a.id,
      userId: defaultUserId,
      status: 'idle',
      lastSyncedAt: a.lastSyncedAt,
      progressPercent: 100,
      syncedCount: a.totalEmails,
    })),
    emails: initialEmails.map((e) => ({ ...e, userId: defaultUserId })),
    quarantineItems: initialQuarantine.map((q) => ({ ...q, userId: defaultUserId })),
    alerts: initialAlerts.map((alt) => ({ ...alt, userId: defaultUserId })),
    securityRules: initialRules.map((r) => ({ ...r, userId: defaultUserId })),
    auditLogs: initialAuditLogs.map((l) => ({ ...l, userId: defaultUserId })),
    whitelistBlacklist: initialWhitelistBlacklist.map((w) => ({ ...w, userId: defaultUserId })),
    notificationSettings: {
      [defaultUserId]: { ...initialNotificationSettings },
    },
    securitySettings: {
      [defaultUserId]: { ...initialSecuritySettings },
    },
    notifications: [],
    notificationDeliveries: [],
    notificationDevices: [],
    oauthStates: [],
    emailAnalyses: [],
  };
}

export function loadDatabase(): DatabaseSchema {
  if (dbCache) return dbCache;

  ensureDataDirectory();

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      dbCache = {
        ...getInitialDatabase(),
        ...parsed,
      };
      if (!dbCache!.emailAnalyses) {
        dbCache!.emailAnalyses = [];
      }
      if (!dbCache!.notifications) {
        dbCache!.notifications = [];
      }
      if (!dbCache!.notificationDeliveries) {
        dbCache!.notificationDeliveries = [];
      }
      return dbCache!;
    } catch (err) {
      console.error('Error reading database file, using initial data:', err);
    }
  }

  // If no DB file exists yet, create one
  dbCache = getInitialDatabase();
  saveDatabaseSync();
  return dbCache;
}

export function saveDatabaseSync(): void {
  if (!dbCache) return;
  ensureDataDirectory();
  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(dbCache, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed saving database to disk:', err);
  }
}

export function saveDatabase(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveDatabaseSync();
  }, 100);
}

// ============================================================================
// DATA ACCESS METHODS (User-Scoped & Isolated)
// ============================================================================

export const db = {
  // Users
  getUserById(userId: string): UserRecord | null {
    const data = loadDatabase();
    return data.users.find((u) => u.id === userId) || null;
  },

  getUserByEmail(email: string): UserRecord | null {
    const data = loadDatabase();
    return data.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  getUserBySession(token: string): UserRecord | null {
    const data = loadDatabase();
    return data.users.find((u) => u.sessionToken === token) || null;
  },

  createUser(user: UserRecord): UserRecord {
    const data = loadDatabase();
    data.users.push(user);
    // Initialize settings for new user
    if (!data.notificationSettings[user.id]) {
      data.notificationSettings[user.id] = { ...initialNotificationSettings };
    }
    if (!data.securitySettings[user.id]) {
      data.securitySettings[user.id] = { ...initialSecuritySettings };
    }
    saveDatabase();

    if (user.id !== 'user-default') {
      syncToFirestore(() => FirestoreDb.createUser(user as any));
    }
    return user;
  },

  updateUser(userId: string, patch: Partial<UserRecord>): UserRecord | null {
    const data = loadDatabase();
    const idx = data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...patch, updatedAt: new Date().toISOString() };
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.updateUser(userId, patch as any));
    }
    return data.users[idx];
  },

  // Accounts
  getAccounts(userId: string): EmailAccount[] {
    const data = loadDatabase();
    return data.emailAccounts.filter((a) => a.userId === userId);
  },

  getAccountById(userId: string, accountId: string): EmailAccount | null {
    const data = loadDatabase();
    return data.emailAccounts.find((a) => a.userId === userId && a.id === accountId) || null;
  },

  addAccount(userId: string, account: EmailAccount & { accessTokenEncrypted?: string; refreshTokenEncrypted?: string }): EmailAccount {
    const data = loadDatabase();
    const userAccounts = data.emailAccounts.filter((a) => a.userId === userId);
    if (userAccounts.length >= 10) {
      throw new Error('Account limit reached. Maximum 10 connected email accounts permitted.');
    }
    const duplicate = userAccounts.find(
      (a) =>
        a.provider === account.provider &&
        a.emailAddress.toLowerCase() === account.emailAddress.toLowerCase() &&
        a.status !== 'Disconnected'
    );
    if (duplicate) {
      throw new Error(`Duplicate account rejected: An account for ${account.emailAddress} is already connected.`);
    }
    const record = { ...account, userId };
    data.emailAccounts.push(record);
    // Initialize sync state
    data.emailSyncState.push({
      accountId: account.id,
      userId,
      status: 'idle',
      lastSyncedAt: new Date().toISOString(),
      progressPercent: 100,
      syncedCount: 0,
    });
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.addAccount(userId, account));
    }
    return account;
  },

  updateAccount(userId: string, accountId: string, patch: Partial<EmailAccount>): EmailAccount | null {
    const data = loadDatabase();
    const idx = data.emailAccounts.findIndex((a) => a.userId === userId && a.id === accountId);
    if (idx === -1) return null;
    data.emailAccounts[idx] = { ...data.emailAccounts[idx], ...patch };
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.updateAccount(userId, accountId, patch as any));
    }
    return data.emailAccounts[idx];
  },

  deleteAccount(userId: string, accountId: string): boolean {
    const data = loadDatabase();
    const initialLen = data.emailAccounts.length;
    data.emailAccounts = data.emailAccounts.filter((a) => !(a.userId === userId && a.id === accountId));
    // Cascade remove emails belonging to this account
    data.emails = data.emails.filter((e) => !(e.userId === userId && e.accountId === accountId));
    data.emailSyncState = data.emailSyncState.filter((s) => !(s.userId === userId && s.accountId === accountId));
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.deleteAccount(userId, accountId));
    }
    return data.emailAccounts.length < initialLen;
  },

  // Sync State
  getSyncState(userId: string, accountId: string): SyncStateRecord | null {
    const data = loadDatabase();
    return data.emailSyncState.find((s) => s.userId === userId && s.accountId === accountId) || null;
  },

  updateSyncState(userId: string, accountId: string, patch: Partial<SyncStateRecord>): void {
    const data = loadDatabase();
    const idx = data.emailSyncState.findIndex((s) => s.userId === userId && s.accountId === accountId);
    if (idx !== -1) {
      data.emailSyncState[idx] = { ...data.emailSyncState[idx], ...patch };
    } else {
      data.emailSyncState.push({
        accountId,
        userId,
        status: patch.status || 'idle',
        lastSyncedAt: patch.lastSyncedAt || new Date().toISOString(),
        progressPercent: patch.progressPercent ?? 100,
        syncedCount: patch.syncedCount ?? 0,
        ...patch,
      });
    }
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.updateSyncState(userId, accountId, patch as any));
    }
  },

  // Emails
  getEmails(userId: string): Email[] {
    const data = loadDatabase();
    return data.emails.filter((e) => e.userId === userId);
  },

  getEmailById(userId: string, emailId: string): Email | null {
    const data = loadDatabase();
    return data.emails.find((e) => e.userId === userId && e.id === emailId) || null;
  },

  saveEmail(userId: string, email: Email): Email {
    const data = loadDatabase();
    const existingIdx = data.emails.findIndex(
      (e) =>
        e.userId === userId &&
        (e.id === email.id ||
          (Boolean(email.providerMessageId) && e.providerMessageId === email.providerMessageId) ||
          (Boolean(email.threadId) &&
            e.threadId === email.threadId &&
            e.subject === email.subject &&
            e.sender === email.sender &&
            Math.abs(new Date(e.receivedAt).getTime() - new Date(email.receivedAt).getTime()) < 2000))
    );
    if (existingIdx !== -1) {
      data.emails[existingIdx] = { ...data.emails[existingIdx], ...email, userId };
    } else {
      data.emails.unshift({ ...email, userId });
    }
    saveDatabase();

    if (userId !== 'user-default') {
      syncToFirestore(() => FirestoreDb.saveEmail(userId, email));
    }
    return email;
  },

  updateEmail(userId: string, emailId: string, patch: Partial<Email>): Email | null {
    const data = loadDatabase();
    const idx = data.emails.findIndex((e) => e.userId === userId && e.id === emailId);
    if (idx === -1) return null;
    data.emails[idx] = { ...data.emails[idx], ...patch };
    saveDatabase();
    return data.emails[idx];
  },

  // Quarantine
  getQuarantine(userId: string): QuarantineItem[] {
    const data = loadDatabase();
    return data.quarantineItems.filter((q) => q.userId === userId);
  },

  saveQuarantineItem(userId: string, item: QuarantineItem): QuarantineItem {
    const data = loadDatabase();
    const idx = data.quarantineItems.findIndex((q) => q.userId === userId && q.id === item.id);
    if (idx !== -1) {
      data.quarantineItems[idx] = { ...item, userId };
    } else {
      data.quarantineItems.unshift({ ...item, userId });
    }
    saveDatabase();
    return item;
  },

  updateQuarantineItem(userId: string, itemId: string, patch: Partial<QuarantineItem>): QuarantineItem | null {
    const data = loadDatabase();
    const idx = data.quarantineItems.findIndex((q) => q.userId === userId && q.id === itemId);
    if (idx === -1) return null;
    data.quarantineItems[idx] = { ...data.quarantineItems[idx], ...patch };
    saveDatabase();
    return data.quarantineItems[idx];
  },

  deleteQuarantineItem(userId: string, itemId: string): boolean {
    const data = loadDatabase();
    const initialLen = data.quarantineItems.length;
    data.quarantineItems = data.quarantineItems.filter((q) => !(q.userId === userId && q.id === itemId));
    saveDatabase();
    return data.quarantineItems.length < initialLen;
  },

  // Alerts
  getAlerts(userId: string): SecurityAlert[] {
    const data = loadDatabase();
    return data.alerts.filter((a) => a.userId === userId);
  },

  addAlert(userId: string, alert: SecurityAlert): SecurityAlert {
    const data = loadDatabase();
    data.alerts.unshift({ ...alert, userId });
    saveDatabase();
    return alert;
  },

  acknowledgeAlert(userId: string, alertId: string): boolean {
    const data = loadDatabase();
    const alert = data.alerts.find((a) => a.userId === userId && a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      saveDatabase();
      return true;
    }
    return false;
  },

  // Rules
  getRules(userId: string): SecurityRule[] {
    const data = loadDatabase();
    return data.securityRules.filter((r) => r.userId === userId);
  },

  addRule(userId: string, rule: SecurityRule): SecurityRule {
    const data = loadDatabase();
    data.securityRules.unshift({ ...rule, userId });
    saveDatabase();
    return rule;
  },

  updateRule(userId: string, ruleId: string, patch: Partial<SecurityRule>): SecurityRule | null {
    const data = loadDatabase();
    const idx = data.securityRules.findIndex((r) => r.userId === userId && r.id === ruleId);
    if (idx === -1) return null;
    data.securityRules[idx] = { ...data.securityRules[idx], ...patch };
    saveDatabase();
    return data.securityRules[idx];
  },

  deleteRule(userId: string, ruleId: string): boolean {
    const data = loadDatabase();
    const initialLen = data.securityRules.length;
    data.securityRules = data.securityRules.filter((r) => !(r.userId === userId && r.id === ruleId));
    saveDatabase();
    return data.securityRules.length < initialLen;
  },

  // Audit Logs
  getAuditLogs(userId: string): AuditLog[] {
    const data = loadDatabase();
    return data.auditLogs.filter((l) => l.userId === userId);
  },

  addAuditLog(userId: string, log: AuditLog): AuditLog {
    const data = loadDatabase();
    data.auditLogs.unshift({ ...log, userId });
    // Keep max 200 logs per user
    const userLogs = data.auditLogs.filter((l) => l.userId === userId);
    if (userLogs.length > 200) {
      const oldestId = userLogs[userLogs.length - 1].id;
      data.auditLogs = data.auditLogs.filter((l) => l.id !== oldestId);
    }
    saveDatabase();
    return log;
  },

  // Whitelist / Blacklist
  getWhitelistBlacklist(userId: string): WhitelistBlacklistEntry[] {
    const data = loadDatabase();
    return data.whitelistBlacklist.filter((w) => w.userId === userId);
  },

  addWhitelistBlacklist(userId: string, entry: WhitelistBlacklistEntry): WhitelistBlacklistEntry {
    const data = loadDatabase();
    data.whitelistBlacklist.push({ ...entry, userId });
    saveDatabase();
    return entry;
  },

  removeWhitelistBlacklist(userId: string, entryId: string): boolean {
    const data = loadDatabase();
    const initialLen = data.whitelistBlacklist.length;
    data.whitelistBlacklist = data.whitelistBlacklist.filter((w) => !(w.userId === userId && w.id === entryId));
    saveDatabase();
    return data.whitelistBlacklist.length < initialLen;
  },

  // Settings
  getNotificationSettings(userId: string): NotificationSettings {
    const data = loadDatabase();
    return data.notificationSettings[userId] || { ...initialNotificationSettings };
  },

  updateNotificationSettings(userId: string, patch: Partial<NotificationSettings>): NotificationSettings {
    const data = loadDatabase();
    const current = data.notificationSettings[userId] || { ...initialNotificationSettings };
    data.notificationSettings[userId] = { ...current, ...patch };
    saveDatabase();
    return data.notificationSettings[userId];
  },

  getSecuritySettings(userId: string): SecuritySettings {
    const data = loadDatabase();
    return data.securitySettings[userId] || { ...initialSecuritySettings };
  },

  updateSecuritySettings(userId: string, patch: Partial<SecuritySettings>): SecuritySettings {
    const data = loadDatabase();
    const current = data.securitySettings[userId] || { ...initialSecuritySettings };
    data.securitySettings[userId] = { ...current, ...patch };
    saveDatabase();
    return data.securitySettings[userId];
  },

  // Notifications
  getNotifications(userId: string): NotificationRecord[] {
    const data = loadDatabase();
    return (data.notifications || [])
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  getNotification(userId: string, id: string): NotificationRecord | null {
    const data = loadDatabase();
    return (data.notifications || []).find((n) => n.userId === userId && n.id === id) || null;
  },

  saveNotification(userId: string, notif: NotificationRecord): NotificationRecord {
    const data = loadDatabase();
    if (!data.notifications) data.notifications = [];
    const idx = data.notifications.findIndex((n) => n.userId === userId && n.id === notif.id);
    const item = { ...notif, userId };
    if (idx >= 0) {
      data.notifications[idx] = item;
    } else {
      data.notifications.unshift(item);
      // Keep max 500 notifications
      if (data.notifications.length > 500) {
        data.notifications.pop();
      }
    }
    saveDatabase();
    return item;
  },

  markNotificationRead(userId: string, notifId: string): boolean {
    const data = loadDatabase();
    if (!data.notifications) return false;
    const notif = data.notifications.find((n) => n.userId === userId && n.id === notifId);
    if (notif) {
      notif.read = true;
      saveDatabase();
      return true;
    }
    return false;
  },

  // Deliveries & Deduplication
  getDeliveries(
    userId: string,
    options?: {
      notificationId?: string;
      threadId?: string;
      emailId?: string;
      channel?: string;
      status?: string;
      withinMs?: number;
    }
  ): NotificationDeliveryRecord[] {
    const data = loadDatabase();
    let res = (data.notificationDeliveries || []).filter((d) => d.userId === userId);
    if (options?.notificationId) {
      res = res.filter((d) => d.notificationId === options.notificationId);
    }
    if (options?.threadId) {
      res = res.filter((d) => d.threadId === options.threadId);
    }
    if (options?.emailId) {
      res = res.filter((d) => d.emailId === options.emailId);
    }
    if (options?.channel) {
      res = res.filter((d) => d.channel === options.channel);
    }
    if (options?.status) {
      res = res.filter((d) => d.status === options.status);
    }
    if (options?.withinMs) {
      const cutoff = Date.now() - options.withinMs;
      res = res.filter((d) => new Date(d.createdAt).getTime() > cutoff);
    }
    return res;
  },

  getDeliveryById(id: string): NotificationDeliveryRecord | null {
    const data = loadDatabase();
    return (data.notificationDeliveries || []).find((d) => d.id === id) || null;
  },

  recordDelivery(record: NotificationDeliveryRecord): void {
    const data = loadDatabase();
    if (!data.notificationDeliveries) data.notificationDeliveries = [];
    const idx = data.notificationDeliveries.findIndex((d) => d.id === record.id);
    if (idx >= 0) {
      data.notificationDeliveries[idx] = record;
    } else {
      data.notificationDeliveries.unshift(record);
      // Keep max 1000 deliveries
      if (data.notificationDeliveries.length > 1000) {
        data.notificationDeliveries.pop();
      }
    }
    saveDatabase();
  },

  updateDelivery(id: string, patch: Partial<NotificationDeliveryRecord>): NotificationDeliveryRecord | null {
    const data = loadDatabase();
    if (!data.notificationDeliveries) return null;
    const delivery = data.notificationDeliveries.find((d) => d.id === id);
    if (!delivery) return null;
    Object.assign(delivery, patch);
    saveDatabase();
    return delivery;
  },

  // Notification Devices
  getNotificationDevices(userId: string, onlyEnabled = true) {
    const data = loadDatabase();
    return (data.notificationDevices || []).filter((d) => {
      if (d.userId !== userId) return false;
      if (onlyEnabled && d.enabled === false) return false;
      return true;
    });
  },

  getAllNotificationDevices(userId: string) {
    const data = loadDatabase();
    return (data.notificationDevices || []).filter((d) => d.userId === userId);
  },

  registerNotificationDevice(
    userId: string,
    device: {
      deviceId: string;
      platform: 'web' | 'android' | 'ios';
      pushToken: string;
      createdAt?: string;
      lastSeenAt?: string;
      enabled?: boolean;
      userAgent?: string;
    }
  ) {
    const data = loadDatabase();
    if (!data.notificationDevices) data.notificationDevices = [];
    const existingIdx = data.notificationDevices.findIndex(
      (d) => d.userId === userId && (d.deviceId === device.deviceId || d.pushToken === device.pushToken)
    );
    const now = new Date().toISOString();
    const item = {
      id: device.deviceId,
      userId,
      deviceId: device.deviceId,
      platform: device.platform || 'web',
      pushToken: device.pushToken,
      createdAt: (existingIdx >= 0 && data.notificationDevices[existingIdx]?.createdAt) || device.createdAt || now,
      lastSeenAt: now,
      enabled: device.enabled ?? true,
      userAgent: device.userAgent,
    };
    if (existingIdx >= 0) {
      data.notificationDevices[existingIdx] = { ...data.notificationDevices[existingIdx], ...item };
    } else {
      data.notificationDevices.push(item);
    }
    saveDatabase();
    return item;
  },

  updateNotificationDevice(userId: string, deviceId: string, updates: Partial<{ enabled: boolean; pushToken: string; lastSeenAt: string }>) {
    const data = loadDatabase();
    if (!data.notificationDevices) return null;
    const idx = data.notificationDevices.findIndex((d) => d.userId === userId && (d.deviceId === deviceId || d.id === deviceId));
    if (idx >= 0 && data.notificationDevices[idx]) {
      data.notificationDevices[idx] = {
        ...data.notificationDevices[idx],
        ...updates,
        lastSeenAt: updates.lastSeenAt || new Date().toISOString(),
      };
      saveDatabase();
      return data.notificationDevices[idx];
    }
    return null;
  },

  removeNotificationDevice(userId: string, deviceIdOrId: string) {
    const data = loadDatabase();
    if (!data.notificationDevices) return false;
    const initialLen = data.notificationDevices.length;
    data.notificationDevices = data.notificationDevices.filter(
      (d) => !(d.userId === userId && (d.deviceId === deviceIdOrId || d.id === deviceIdOrId || d.pushToken === deviceIdOrId))
    );
    const removed = data.notificationDevices.length < initialLen;
    if (removed) {
      saveDatabase();
    }
    return removed;
  },

  removeNotificationDeviceByToken(pushToken: string) {
    const data = loadDatabase();
    if (!data.notificationDevices) return [];
    const removedDevices = data.notificationDevices.filter((d) => d.pushToken === pushToken);
    data.notificationDevices = data.notificationDevices.filter((d) => d.pushToken !== pushToken);
    if (removedDevices.length > 0) {
      saveDatabase();
    }
    return removedDevices;
  },

  // OAuth States
  saveOAuthState(record: OAuthStateRecord): void {
    const data = loadDatabase();
    // Clear states older than 15 minutes
    const cutoff = Date.now() - 15 * 60 * 1000;
    data.oauthStates = data.oauthStates.filter((s) => s.createdAt > cutoff);
    data.oauthStates.push(record);
    saveDatabase();
  },

  getOAuthState(state: string): OAuthStateRecord | null {
    const data = loadDatabase();
    return data.oauthStates.find((s) => s.state === state) || null;
  },

  consumeOAuthState(state: string): OAuthStateRecord | null {
    const data = loadDatabase();
    const idx = data.oauthStates.findIndex((s) => s.state === state);
    if (idx === -1) return null;
    const [found] = data.oauthStates.splice(idx, 1);
    saveDatabase();
    return found;
  },

  // AI Analyses (Separately Persisted)
  getAnalysis(userId: string, emailId: string): EmailAnalysisRecord | null {
    const data = loadDatabase();
    return (data.emailAnalyses || []).find((a) => a.userId === userId && a.emailId === emailId) || null;
  },

  saveAnalysis(userId: string, record: EmailAnalysisRecord): EmailAnalysisRecord {
    const data = loadDatabase();
    data.emailAnalyses = data.emailAnalyses || [];
    const idx = data.emailAnalyses.findIndex((a) => a.userId === userId && a.emailId === record.emailId);
    if (idx !== -1) {
      data.emailAnalyses[idx] = { ...record, userId };
    } else {
      data.emailAnalyses.unshift({ ...record, userId });
    }
    saveDatabase();
    return record;
  },

  deleteAnalysis(userId: string, emailId: string): boolean {
    const data = loadDatabase();
    if (!data.emailAnalyses) return false;
    const initialLen = data.emailAnalyses.length;
    data.emailAnalyses = data.emailAnalyses.filter((a) => !(a.userId === userId && a.emailId === emailId));
    saveDatabase();
    return data.emailAnalyses.length < initialLen;
  },

  getAllAnalyses(userId: string): EmailAnalysisRecord[] {
    const data = loadDatabase();
    return (data.emailAnalyses || []).filter((a) => a.userId === userId);
  },

  // Aliases and helpers for notification engine & WhatsApp service
  getUsers(): UserRecord[] {
    const data = loadDatabase();
    return data.users || [];
  },

  getAllUsers(): UserRecord[] {
    const data = loadDatabase();
    return data.users || [];
  },

  getNotificationDeliveries(
    userId?: string,
    options?: {
      notificationId?: string;
      threadId?: string;
      emailId?: string;
      channel?: string;
      status?: string;
      withinMs?: number;
    }
  ): NotificationDeliveryRecord[] {
    if (!userId) {
      const data = loadDatabase();
      return data.notificationDeliveries || [];
    }
    return this.getDeliveries(userId, options);
  },

  addNotificationDelivery(record: NotificationDeliveryRecord): void {
    this.recordDelivery(record);
  },

  updateNotificationDelivery(
    id: string,
    patch: Partial<NotificationDeliveryRecord>
  ): NotificationDeliveryRecord | null {
    return this.updateDelivery(id, patch);
  },

  saveNotificationSettings(
    userId: string,
    patch: Partial<NotificationSettings>
  ): NotificationSettings {
    return this.updateNotificationSettings(userId, patch);
  },
};
