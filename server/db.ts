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
} from '../src/types';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  sessionToken?: string;
  createdAt: string;
  updatedAt: string;
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

export interface NotificationDeliveryRecord {
  id: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  channel: 'push' | 'whatsapp' | 'browser' | 'digest';
  status: 'delivered' | 'failed' | 'suppressed_quiet_hours' | 'suppressed_dedup' | 'unconfigured';
  reason?: string;
  payload: any;
  createdAt: string;
}

export interface OAuthStateRecord {
  state: string;
  userId: string;
  provider: 'gmail' | 'outlook';
  createdAt: number;
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
  notificationDeliveries: NotificationDeliveryRecord[];
  notificationDevices: Array<{ id: string; userId: string; pushToken: string; platform: string; registeredAt: string }>;
  oauthStates: OAuthStateRecord[];
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
    notificationDeliveries: [],
    notificationDevices: [],
    oauthStates: [],
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
    return user;
  },

  updateUser(userId: string, patch: Partial<UserRecord>): UserRecord | null {
    const data = loadDatabase();
    const idx = data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...patch, updatedAt: new Date().toISOString() };
    saveDatabase();
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
    return account;
  },

  updateAccount(userId: string, accountId: string, patch: Partial<EmailAccount>): EmailAccount | null {
    const data = loadDatabase();
    const idx = data.emailAccounts.findIndex((a) => a.userId === userId && a.id === accountId);
    if (idx === -1) return null;
    data.emailAccounts[idx] = { ...data.emailAccounts[idx], ...patch };
    saveDatabase();
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
    const existingIdx = data.emails.findIndex((e) => e.userId === userId && e.id === email.id);
    if (existingIdx !== -1) {
      data.emails[existingIdx] = { ...email, userId };
    } else {
      data.emails.unshift({ ...email, userId });
    }
    saveDatabase();
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

  // Deliveries & Deduplication
  getDeliveries(userId: string, options?: { threadId?: string; withinMs?: number }): NotificationDeliveryRecord[] {
    const data = loadDatabase();
    let res = data.notificationDeliveries.filter((d) => d.userId === userId);
    if (options?.threadId) {
      res = res.filter((d) => d.threadId === options.threadId);
    }
    if (options?.withinMs) {
      const cutoff = Date.now() - options.withinMs;
      res = res.filter((d) => new Date(d.createdAt).getTime() > cutoff);
    }
    return res;
  },

  recordDelivery(record: NotificationDeliveryRecord): void {
    const data = loadDatabase();
    data.notificationDeliveries.unshift(record);
    // Keep max 500 deliveries
    if (data.notificationDeliveries.length > 500) {
      data.notificationDeliveries.pop();
    }
    saveDatabase();
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
};
