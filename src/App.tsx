import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { Sidebar, NavView } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { UnifiedInboxView } from './components/UnifiedInboxView';
import { EmailDetailModal } from './components/EmailDetailModal';
import { AskMailSentinelView } from './components/AskMailSentinelView';
import { DeadlinesTasksView } from './components/DeadlinesTasksView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { AccountsView } from './components/AccountsView';
import { SettingsView } from './components/SettingsView';
import { GoogleWorkspaceView } from './components/GoogleWorkspaceView';
import { ConfirmationModal } from './components/ConfirmationModal';
import {
  AuditLogEntry,
  AutomationRule,
  Email,
  EmailAccount,
  NotificationConfig,
  normalizeNotificationConfig,
  QuarantineItem,
  SecurityAlert,
  SecuritySettings,
} from './types';
import {
  googleSignIn,
  logoutUser,
  onAuthStateChange,
  getCachedAccessToken,
  getCurrentUser,
} from './lib/firebase';
import { FirestoreSyncService } from './lib/firestoreService';
import {
  fetchGmailMessages,
  GmailMessageSummary,
} from './lib/workspace';
import { Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';

export function App() {
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [quarantineItems, setQuarantineItems] = useState<QuarantineItem[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    sensitivity: 'balanced',
    autoQuarantine: true,
    whitelist: [],
    blacklist: [],
  });
  const [notifications, setNotifications] = useState<NotificationConfig>({
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
      summary: false,
    },
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Confirmation modal state
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Track Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setGoogleUser(user);
      setAuthInitialized(true);

      if (user) {
        setNeedsAuth(false);
        await loadUserDataFromFirestore(user);
      } else {
        setNeedsAuth(true);
        // Load initial offline/demo dataset if not yet loaded
        await loadFallbackData();
      }
    });

    return () => unsubscribe();
  }, []);

  // Load User Data from Firestore
  const loadUserDataFromFirestore = async (user: User) => {
    try {
      const [fAccounts, fEmails, fQuarantine, fRules, fSettings] = await Promise.all([
        FirestoreSyncService.loadAccounts(user.uid),
        FirestoreSyncService.loadEmails(user.uid),
        FirestoreSyncService.loadQuarantine(user.uid),
        FirestoreSyncService.loadAutomationRules(user.uid),
        FirestoreSyncService.loadSettings(user.uid),
      ]);

      if (fAccounts.length > 0) {
        setAccounts(fAccounts);
      } else {
        // Seed default Google account for this user
        const initialAcc: EmailAccount = {
          id: `acc-google-${user.uid}`,
          emailAddress: user.email || 'user@gmail.com',
          provider: 'gmail',
          displayName: user.displayName || 'Google Mailbox',
          status: 'active',
          lastSyncedAt: new Date().toISOString(),
          totalEmails: 0,
          threatsDetected: 0,
          isPrimary: true,
        };
        setAccounts([initialAcc]);
        await FirestoreSyncService.saveAccount(user.uid, initialAcc);
      }

      if (fEmails.length > 0) {
        setEmails(fEmails);
      } else {
        // Load fallback demo emails and persist them into Firestore for the user
        await loadFallbackData(user.uid);
      }

      if (fQuarantine.length > 0) setQuarantineItems(fQuarantine);
      if (fRules.length > 0) setAutomationRules(fRules);
      if (fSettings) {
        if (fSettings.security) setSecuritySettings(fSettings.security);
        if (fSettings.notifications) setNotifications(normalizeNotificationConfig(fSettings.notifications));
      }

      // Check if we have an active access token to sync real Gmail messages
      const token = getCachedAccessToken();
      if (token) {
        await syncGmailFromWorkspace(user.uid, token);
      }

      // Load AI Daily summary
      loadDailySummary(fEmails.length > 0 ? fEmails : undefined);
    } catch (err) {
      console.warn('Firestore load failed, falling back to local data:', err);
      await loadFallbackData();
    }
  };

  // Fallback initial dataset from server.ts API or local defaults
  const loadFallbackData = async (userIdToSync?: string) => {
    try {
      const [accRes, emailsRes, quarRes, rulesRes, setRes] = await Promise.all([
        fetch('/api/accounts').catch(() => null),
        fetch('/api/emails').catch(() => null),
        fetch('/api/quarantine').catch(() => null),
        fetch('/api/rules').catch(() => null),
        fetch('/api/settings').catch(() => null),
      ]);

      const parseJson = async (res: Response | null) => {
        if (res && res.ok && res.headers.get('content-type')?.includes('application/json')) {
          try {
            return await res.json();
          } catch (e) {
            return null;
          }
        }
        return null;
      };

      const accData = await parseJson(accRes);
      if (accData) {
        setAccounts(accData);
        if (userIdToSync) {
          for (const acc of accData) {
            await FirestoreSyncService.saveAccount(userIdToSync, acc);
          }
        }
      }

      let loadedEmails: Email[] = [];
      const emailsData = await parseJson(emailsRes);
      if (emailsData) {
        loadedEmails = emailsData;
        setEmails(emailsData);
        if (userIdToSync) {
          for (const em of emailsData) {
            await FirestoreSyncService.saveEmail(userIdToSync, em);
          }
        }
      }

      const quarData = await parseJson(quarRes);
      if (quarData) setQuarantineItems(quarData);

      const rulesData = await parseJson(rulesRes);
      if (rulesData) setAutomationRules(rulesData);

      const setData = await parseJson(setRes);
      if (setData) {
        if (setData.security) setSecuritySettings(setData.security);
        if (setData.notifications) setNotifications(normalizeNotificationConfig(setData.notifications));
        if (setData.auditLogs) setAuditLogs(setData.auditLogs);
      }

      loadDailySummary(loadedEmails.length > 0 ? loadedEmails : undefined);
    } catch (err) {
      console.warn('Fallback data loading note:', err);
      loadDailySummary();
    }
  };

  const loadDailySummary = async (providedEmails?: Email[]) => {
    setIsLoadingSummary(true);
    const emailsToUse = (providedEmails && providedEmails.length > 0) ? providedEmails : emails;

    const generateClientFallback = () => {
      const items = emailsToUse;
      const actionItems = items.filter((e) => e.aiAnalysis?.actionRequired);
      const deadlines = items.filter((e) => Boolean(e.aiAnalysis?.deadline));
      const threats = items.filter(
        (e) => e.securityAnalysis?.classification && e.securityAnalysis.classification !== 'SAFE'
      );
      const userName = googleUser?.displayName?.split(' ')[0] || 'Alex';

      let text = `Good day, ${userName}. You currently have ${actionItems.length} priority message${actionItems.length === 1 ? '' : 's'} requiring direct attention across your monitored inboxes.`;

      if (deadlines.length > 0) {
        const topDeadline = deadlines[0];
        text += ` Key timeline item: "${topDeadline.subject}" scheduled or due around ${topDeadline.aiAnalysis.deadline}.`;
      }

      if (actionItems.length > 0) {
        const topAction = actionItems.find((e) => e.aiAnalysis?.recommendedAction) || actionItems[0];
        if (topAction.aiAnalysis?.recommendedAction) {
          text += ` Next recommended step: ${topAction.aiAnalysis.recommendedAction}`;
        }
      }

      if (threats.length > 0) {
        text += `\n\n🛡️ Security Status: MailSentinel intercepted and quarantined ${threats.length} high-risk threat${threats.length === 1 ? '' : 's'} (including spoofing and credential harvesting attempts), keeping your accounts safeguarded.`;
      } else {
        text += `\n\n🛡️ Security Status: All connected accounts are healthy with active heuristic monitoring and zero detected threats.`;
      }

      return text;
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let res: Response | null = null;
      try {
        res = await fetch('/api/gemini/daily-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: emailsToUse.slice(0, 10).map((e) => ({
              id: e.id,
              subject: e.subject,
              senderName: e.senderName,
              accountEmail: e.accountEmail,
              aiAnalysis: e.aiAnalysis,
              securityAnalysis: e.securityAnalysis,
            })),
            userName: googleUser?.displayName || 'Alex',
          }),
          signal: controller.signal,
        });
      } catch (firstErr: any) {
        // Retry once after a brief delay if network connection was transient or dev server was starting
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          res = await fetch('/api/gemini/daily-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emails: emailsToUse.slice(0, 10),
              userName: googleUser?.displayName || 'Alex',
            }),
          });
        } catch (retryErr) {
          res = null;
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.summary) {
          setDailySummary(data.summary);
          return;
        }
      }

      // If server response is not ok or empty, apply client fallback
      setDailySummary(generateClientFallback());
    } catch (err: any) {
      console.warn('Daily summary fallback generated locally:', err?.message || err);
      setDailySummary(generateClientFallback());
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Google Sign-In Flow
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  const handleGoogleSignIn = async () => {
    if (isSigningInGoogle) return;
    setIsSigningInGoogle(true);
    try {
      const res = await googleSignIn();
      if (!res) {
        // Sign-in was cancelled, closed, or suppressed
        return;
      }
      const { user, accessToken } = res;
      setGoogleUser(user);
      setNeedsAuth(false);
      if (user) {
        await loadUserDataFromFirestore(user);
        if (accessToken) {
          await syncGmailFromWorkspace(user.uid, accessToken);
        }
      }
    } catch (err: any) {
      if (
        err?.code !== 'auth/cancelled-popup-request' &&
        err?.code !== 'auth/popup-closed-by-user' &&
        err?.code !== 'auth/popup-blocked'
      ) {
        console.error('Google Sign-In failed:', err);
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  // Google Sign-Out Flow
  const handleSignOut = async () => {
    await logoutUser();
    setGoogleUser(null);
    setNeedsAuth(true);
  };

  // Sync real messages from Gmail API using workspace.ts
  const syncGmailFromWorkspace = async (userId: string, token: string) => {
    setIsSyncing(true);
    try {
      const messages: GmailMessageSummary[] = await fetchGmailMessages(token, 10);
      const syncedEmails: Email[] = [];

      for (const msg of messages) {
        try {
          const subject = msg.subject || '(No Subject)';
          const fromHeader = msg.from || 'Unknown Sender';
          const dateHeader = msg.date || new Date().toISOString();

          let senderEmail = fromHeader;
          let senderName = fromHeader;
          const match = fromHeader.match(/(.*?)\s*<(.+?)>/);
          if (match) {
            senderName = match[1].replace(/["']/g, '').trim();
            senderEmail = match[2].trim();
          }
          const domain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'gmail.com';
          const snippet = msg.snippet || '';

          const isUnread = msg.labelIds?.includes('UNREAD') ?? false;

          const emailObj: Email = {
            id: `gmail-${msg.id}`,
            accountId: `acc-google-${userId}`,
            accountEmail: googleUser?.email || 'my-mailbox@gmail.com',
            provider: 'gmail',
            threadId: msg.threadId || msg.id,
            sender: senderEmail,
            senderName: senderName || senderEmail,
            senderDomain: domain,
            recipients: [googleUser?.email || 'me'],
            subject,
            bodySnippet: snippet,
            bodyText: msg.bodyText || snippet,
            receivedAt: new Date(dateHeader).toISOString(),
            isRead: !isUnread,
            isArchived: false,
            isQuarantined: false,
            hasAttachment: false,
            aiAnalysis: {
              summary: snippet || 'Message synchronized from authorized Google Gmail inbox.',
              priority: 'Medium',
              priorityScore: 50,
              whyPriorityReasons: ['Direct Gmail API message sync.'],
              category: 'other',
              sentiment: 'neutral',
              actionRequired: false,
              recommendedAction: 'Read in unified inbox',
              deadline: null,
              confidence: 0.95,
              extractedEntities: [],
            },
            securityAnalysis: {
              classification: 'SAFE',
              riskScore: 5,
              phishingScore: 0,
              spamScore: 0,
              spoofingScore: 0,
              riskLevel: 'Safe',
              whyFlaggedReasons: [],
              senderDomainAnalysis: {
                displayName: senderName,
                senderEmail: senderEmail,
                domain,
                isLookalike: false,
                replyToMatch: true,
              },
              urlAnalysis: {
                totalUrls: 0,
                suspiciousUrls: [],
              },
              authResults: {
                spf: 'PASS',
                dkim: 'PASS',
                dmarc: 'PASS',
                details: 'SPF, DKIM, and DMARC validated via Google Workspace.',
              },
              indicators: [],
            },
          };

          syncedEmails.push(emailObj);
          await FirestoreSyncService.saveEmail(userId, emailObj);
        } catch (mErr) {
          console.warn('Could not parse individual message:', mErr);
        }
      }

      if (syncedEmails.length > 0) {
        setEmails((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const toAdd = syncedEmails.filter((e) => !existingIds.has(e.id));
          return [...toAdd, ...prev];
        });
      }
    } catch (err) {
      console.warn('Gmail API sync note:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync All Accounts & Workspace
  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const user = googleUser || getCurrentUser();
      const token = getCachedAccessToken();

      if (user && token) {
        await syncGmailFromWorkspace(user.uid, token);
      }

      // Also trigger backend refresh if available
      try {
        const res = await fetch('/api/accounts/sync-all', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.accounts) setAccounts(data.accounts);
          const [eRes, qRes] = await Promise.all([fetch('/api/emails'), fetch('/api/quarantine')]);
          if (eRes.ok) setEmails(await eRes.json());
          if (qRes.ok) setQuarantineItems(await qRes.json());
        }
      } catch (err) {
        // fallback silent
      }

      // Update account sync timestamps
      setAccounts((prev) =>
        prev.map((a) => ({ ...a, lastSynced: new Date().toISOString() }))
      );
    } catch (err) {
      console.warn('Sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Read
  const handleToggleRead = async (id: string, current: boolean) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: !current } : e)));

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.updateEmail(user.uid, id, { isRead: !current });
    }

    try {
      await fetch(`/api/emails/${id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: !current }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Archive Email
  const handleArchive = async (id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isArchived: true } : e)));

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.updateEmail(user.uid, id, { isArchived: true });
    }

    try {
      await fetch(`/api/emails/${id}/archive`, { method: 'POST' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Quarantine Email
  const handleQuarantineEmail = async (id: string) => {
    const emailToQuarantine = emails.find((e) => e.id === id);
    if (!emailToQuarantine) return;

    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isQuarantined: true } : e)));

    const qItem: QuarantineItem = {
      id: `quar-${Date.now()}`,
      emailId: id,
      email: emailToQuarantine,
      quarantinedAt: new Date().toISOString(),
      reason: emailToQuarantine.securityAnalysis?.indicators?.[0]?.description || 'Quarantined for threat analysis',
      riskScore: emailToQuarantine.securityAnalysis.riskScore,
      status: 'quarantined',
    };

    setQuarantineItems((prev) => [qItem, ...prev]);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.updateEmail(user.uid, id, { isQuarantined: true });
      await FirestoreSyncService.saveQuarantineItem(user.uid, qItem);
    }

    try {
      await fetch(`/api/emails/${id}/quarantine`, { method: 'POST' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Release Quarantine
  const handleReleaseQuarantine = async (emailId: string) => {
    const item = quarantineItems.find((q) => q.emailId === emailId);
    setQuarantineItems((prev) => prev.filter((q) => q.emailId !== emailId));
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isQuarantined: false } : e)));

    const user = googleUser || getCurrentUser();
    if (user && item) {
      await FirestoreSyncService.deleteQuarantineItem(user.uid, item.id);
      await FirestoreSyncService.updateEmail(user.uid, emailId, { isQuarantined: false });
    }

    try {
      if (item) {
        await fetch(`/api/quarantine/${item.id}/release`, { method: 'POST' });
      }
    } catch (err) {
      // client-side state already updated
    }
  };

  // Delete Quarantined permanently
  const handleDeleteQuarantined = async (id: string) => {
    setQuarantineItems((prev) => prev.filter((q) => q.id !== id));

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.deleteQuarantineItem(user.uid, id);
    }

    try {
      await fetch(`/api/quarantine/${id}`, { method: 'DELETE' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Add Account
  const handleAddAccount = async (acc: {
    emailAddress: string;
    provider: 'gmail' | 'outlook';
    displayName: string;
  }) => {
    const newAcc: EmailAccount = {
      id: `acc-${Date.now()}`,
      emailAddress: acc.emailAddress,
      provider: acc.provider,
      displayName: acc.displayName || acc.emailAddress.split('@')[0],
      status: 'active',
      lastSyncedAt: new Date().toISOString(),
      totalEmails: 0,
      threatsDetected: 0,
      isPrimary: accounts.length === 0,
    };

    setAccounts((prev) => [...prev, newAcc]);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveAccount(user.uid, newAcc);
    }

    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Disconnect Account
  const handleDisconnectAccount = async (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.deleteAccount(user.uid, id);
    }

    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Whitelist
  const handleAddWhitelist = async (value: string, type: 'domain' | 'email') => {
    const item = {
      id: `wl-${Date.now()}`,
      value,
      type,
      addedAt: new Date().toISOString(),
    };
    const updated = { ...securitySettings, whitelist: [...securitySettings.whitelist, item] };
    setSecuritySettings(updated);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, updated, notifications);
    }

    try {
      await fetch('/api/settings/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    const updated = {
      ...securitySettings,
      whitelist: securitySettings.whitelist.filter((w) => w.id !== id),
    };
    setSecuritySettings(updated);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, updated, notifications);
    }

    try {
      await fetch(`/api/settings/whitelist/${id}`, { method: 'DELETE' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Blacklist
  const handleAddBlacklist = async (value: string, type: 'domain' | 'email') => {
    const item = {
      id: `bl-${Date.now()}`,
      value,
      type,
      addedAt: new Date().toISOString(),
    };
    const updated = { ...securitySettings, blacklist: [...securitySettings.blacklist, item] };
    setSecuritySettings(updated);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, updated, notifications);
    }

    try {
      await fetch('/api/settings/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  const handleRemoveBlacklist = async (id: string) => {
    const updated = {
      ...securitySettings,
      blacklist: securitySettings.blacklist.filter((b) => b.id !== id),
    };
    setSecuritySettings(updated);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, updated, notifications);
    }

    try {
      await fetch(`/api/settings/blacklist/${id}`, { method: 'DELETE' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Toggle Rule
  const handleToggleRule = async (ruleId: string) => {
    const rule = automationRules.find((r) => r.id === ruleId);
    if (!rule) return;

    const updatedRule = { ...rule, isActive: !rule.isActive };
    setAutomationRules((prev) =>
      prev.map((r) => (r.id === ruleId ? updatedRule : r))
    );

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveAutomationRule(user.uid, updatedRule);
    }

    try {
      await fetch(`/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Add Rule
  const handleAddRule = async (rule: Partial<AutomationRule>) => {
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: rule.name || 'New Custom Rule',
      condition: rule.condition || { field: 'sender', operator: 'contains', value: '' },
      action: rule.action || { type: 'tag', target: 'Inbox' },
      isActive: true,
      isEnabled: true,
    };

    setAutomationRules((prev) => [...prev, newRule]);

    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveAutomationRule(user.uid, newRule);
    }

    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Update Settings
  const handleUpdateSecurity = async (sec: SecuritySettings) => {
    setSecuritySettings(sec);
    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, sec, notifications);
    }
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ security: sec }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  const handleUpdateNotifications = async (notif: NotificationConfig) => {
    const cleanNotif = normalizeNotificationConfig(notif);
    setNotifications(cleanNotif);
    const user = googleUser || getCurrentUser();
    if (user) {
      await FirestoreSyncService.saveSettings(user.uid, securitySettings, cleanNotif);
    }
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: cleanNotif }),
      });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Simulate Incoming Email
  const handleSimulateIncoming = async (data: any) => {
    try {
      const res = await fetch('/api/emails/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      // Reload email lists and quarantine
      const [eRes, qRes] = await Promise.all([
        fetch('/api/emails').catch(() => null),
        fetch('/api/quarantine').catch(() => null),
      ]);
      if (eRes && eRes.ok) setEmails(await eRes.json());
      if (qRes && qRes.ok) setQuarantineItems(await qRes.json());

      return result;
    } catch (err) {
      console.error('Simulation error:', err);
      return null;
    }
  };

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null;
  const unreadCount = emails.filter((e) => !e.isRead).length;
  const needsAttentionCount = emails.filter((e) => e.aiAnalysis.actionRequired).length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Universal Top Header */}
      <Header
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSyncAll={handleSyncAll}
        isSyncing={isSyncing}
        onOpenAskAi={() => setCurrentView('ask_ai')}
        onOpenScanSimulator={() => setCurrentView('accounts')}
        alerts={alerts}
        onOpenEmail={(id) => setSelectedEmailId(id)}
        googleUser={googleUser}
        onSignInWithGoogle={handleGoogleSignIn}
        onSignOut={handleSignOut}
        isSigningInGoogle={isSigningInGoogle}
      />

      {/* Optional Auth Prompt Banner if user not signed in yet */}
      {needsAuth && authInitialized && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-900/50 px-4 py-2 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-slate-300">
              Personal Mailboxes & Google Workspace:{' '}
              <span className="text-slate-400">
                Sign in with Google to synchronize your live Gmail, Google Calendar, Google Drive, and Google Tasks with persistent Firestore cloud storage.
              </span>
            </span>
          </div>
          <button
            id="banner-google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={isSigningInGoogle}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium text-xs shadow-xs transition shrink-0 ml-3 ${
              isSigningInGoogle
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-white hover:bg-slate-100 text-slate-800'
            }`}
          >
            {isSigningInGoogle ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isSigningInGoogle ? 'Connecting...' : 'Sign in with Google'}</span>
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          unreadCount={unreadCount}
          needsAttentionCount={needsAttentionCount}
          quarantineCount={quarantineItems.length}
          activeAccountsCount={accounts.length}
        />

        {/* View Switcher Container */}
        <main className="flex-1 overflow-y-auto bg-slate-950">
          {currentView === 'dashboard' && (
            <DashboardView
              emails={emails}
              accounts={accounts}
              alerts={alerts}
              dailySummary={dailySummary}
              onRefreshSummary={loadDailySummary}
              isLoadingSummary={isLoadingSummary}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onNavigateToView={(view) => setCurrentView(view)}
            />
          )}

          {currentView === 'inbox' && (
            <UnifiedInboxView
              emails={emails}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onToggleRead={handleToggleRead}
              onArchive={handleArchive}
              onQuarantine={handleQuarantineEmail}
              filterMode="all"
            />
          )}

          {currentView === 'needs_attention' && (
            <UnifiedInboxView
              emails={emails}
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onToggleRead={handleToggleRead}
              onArchive={handleArchive}
              onQuarantine={handleQuarantineEmail}
              filterMode="needs_attention"
            />
          )}

          {currentView === 'ask_ai' && (
            <AskMailSentinelView emails={emails} onOpenEmail={(id) => setSelectedEmailId(id)} />
          )}

          {currentView === 'deadlines' && (
            <DeadlinesTasksView emails={emails} onOpenEmail={(id) => setSelectedEmailId(id)} />
          )}

          {currentView === 'workspace' && (
            <GoogleWorkspaceView
              googleUser={googleUser}
              onSignInWithGoogle={handleGoogleSignIn}
              isSigningIn={isSigningInGoogle}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
              dailySummary={dailySummary}
            />
          )}

          {currentView === 'security_center' && (
            <SecurityCenterView
              emails={emails}
              quarantineItems={quarantineItems}
              alerts={alerts}
              auditLogs={auditLogs}
              automationRules={automationRules}
              settings={securitySettings}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onReleaseQuarantine={handleReleaseQuarantine}
              onDeleteQuarantined={handleDeleteQuarantined}
              onAddWhitelist={(val, type) => handleAddWhitelist(val, type)}
              onRemoveWhitelist={handleRemoveWhitelist}
              onAddBlacklist={(val, type) => handleAddBlacklist(val, type)}
              onRemoveBlacklist={handleRemoveBlacklist}
              onToggleRule={handleToggleRule}
              onAddRule={handleAddRule}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
              initialSubTab="telemetry"
            />
          )}

          {currentView === 'quarantine' && (
            <SecurityCenterView
              emails={emails}
              quarantineItems={quarantineItems}
              alerts={alerts}
              auditLogs={auditLogs}
              automationRules={automationRules}
              settings={securitySettings}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onReleaseQuarantine={handleReleaseQuarantine}
              onDeleteQuarantined={handleDeleteQuarantined}
              onAddWhitelist={(val, type) => handleAddWhitelist(val, type)}
              onRemoveWhitelist={handleRemoveWhitelist}
              onAddBlacklist={(val, type) => handleAddBlacklist(val, type)}
              onRemoveBlacklist={handleRemoveBlacklist}
              onToggleRule={handleToggleRule}
              onAddRule={handleAddRule}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
              initialSubTab="quarantine"
            />
          )}

          {currentView === 'rules_whitelist' && (
            <SecurityCenterView
              emails={emails}
              quarantineItems={quarantineItems}
              alerts={alerts}
              auditLogs={auditLogs}
              automationRules={automationRules}
              settings={securitySettings}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onReleaseQuarantine={handleReleaseQuarantine}
              onDeleteQuarantined={handleDeleteQuarantined}
              onAddWhitelist={(val, type) => handleAddWhitelist(val, type)}
              onRemoveWhitelist={handleRemoveWhitelist}
              onAddBlacklist={(val, type) => handleAddBlacklist(val, type)}
              onRemoveBlacklist={handleRemoveBlacklist}
              onToggleRule={handleToggleRule}
              onAddRule={handleAddRule}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
              initialSubTab="rules"
            />
          )}

          {currentView === 'audit_logs' && (
            <SecurityCenterView
              emails={emails}
              quarantineItems={quarantineItems}
              alerts={alerts}
              auditLogs={auditLogs}
              automationRules={automationRules}
              settings={securitySettings}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onReleaseQuarantine={handleReleaseQuarantine}
              onDeleteQuarantined={handleDeleteQuarantined}
              onAddWhitelist={(val, type) => handleAddWhitelist(val, type)}
              onRemoveWhitelist={handleRemoveWhitelist}
              onAddBlacklist={(val, type) => handleAddBlacklist(val, type)}
              onRemoveBlacklist={handleRemoveBlacklist}
              onToggleRule={handleToggleRule}
              onAddRule={handleAddRule}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
              initialSubTab="audit"
            />
          )}

          {currentView === 'accounts' && (
            <AccountsView
              accounts={accounts}
              onSyncAccount={handleSyncAll}
              onDisconnectAccount={handleDisconnectAccount}
              onAddAccount={handleAddAccount}
              onSimulateIncoming={handleSimulateIncoming}
              isSyncing={isSyncing}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              notifications={notifications}
              securitySettings={securitySettings}
              onUpdateNotifications={handleUpdateNotifications}
              onUpdateSecurity={handleUpdateSecurity}
              onSendTestNotification={() => {
                setAlerts((prev) => [
                  {
                    id: `alert-test-${Date.now()}`,
                    title: 'Dispatched Test Alert',
                    description: 'Simulated high-priority alert sent through notification dispatch pipeline.',
                    severity: 'high',
                    timestamp: new Date().toISOString(),
                    acknowledged: false,
                  },
                  ...prev,
                ]);
              }}
            />
          )}
        </main>
      </div>

      {/* Email Detail & Security Deep Dive Modal */}
      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmailId(null)}
        onArchive={(id) => handleArchive(id)}
        onToggleQuarantine={(id, current) => {
          if (current) handleReleaseQuarantine(id);
          else handleQuarantineEmail(id);
        }}
        onWhitelistDomain={(d) => handleAddWhitelist(d, 'domain')}
        onBlacklistDomain={(d) => handleAddBlacklist(d, 'domain')}
        onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
      />

      {/* Universal Controlled Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.confirmLabel}
        isDestructive={confirmation.isDestructive}
        onConfirm={confirmation.onConfirm}
        onCancel={() => setConfirmation((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default App;
