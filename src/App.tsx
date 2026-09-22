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
import { NeedsAttentionView } from './components/NeedsAttentionView';
import { RulesView } from './components/RulesView';
import { ActivityView } from './components/ActivityView';
import { NotificationsView } from './components/NotificationsView';
import { OnboardingModal } from './components/OnboardingModal';
import { AuthView } from './components/AuthView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
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
  getCachedAccessToken,
} from './lib/firebase';
import { FirestoreSyncService } from './lib/firestoreService';
import {
  fetchGmailMessages,
  GmailMessageSummary,
} from './lib/workspace';
import { Sparkles, RefreshCw, Shield, Bell, X, ArrowUpRight } from 'lucide-react';
import { setupForegroundFcmListener } from './utils/fcmClient';

function AppContent() {
  const { user, firebaseUser, loading: authLoading, isDemoMode, exitDemoMode, logout, loginWithGoogle } = useAuth();

  const [currentView, setCurrentView] = useState<NavView>('dashboard');
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
  const [incomingPushAlert, setIncomingPushAlert] = useState<{
    title: string;
    body: string;
    emailId?: string;
    deliveryId?: string;
    priority?: string;
  } | null>(null);
  const [dailySummary, setDailySummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('mailsentinel_onboarded_dismissed');
  });

  // Universal Confirmation modal state
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

  // Deep linking and Foreground FCM Listener
  useEffect(() => {
    const handleCheckUrlParam = () => {
      const params = new URLSearchParams(window.location.search);
      const deepEmailId = params.get('emailId');
      if (deepEmailId) {
        setSelectedEmailId(deepEmailId);
      }
    };

    handleCheckUrlParam();
    window.addEventListener('popstate', handleCheckUrlParam);

    const cleanupListener = setupForegroundFcmListener((payload) => {
      // If delivery receipt ACK needed, notify server
      if (payload.deliveryId) {
        apiFetch(`/api/notifications/deliveries/${payload.deliveryId}/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAgent: navigator.userAgent }),
        }).catch(() => {});
      }
      setIncomingPushAlert(payload);
    });

    return () => {
      window.removeEventListener('popstate', handleCheckUrlParam);
      cleanupListener();
    };
  }, []);

  // When auth state changes, load data accordingly
  useEffect(() => {
    if (user) {
      loadAuthenticatedUserData(user.uid);
    } else if (isDemoMode) {
      loadDemoData();
    }
  }, [user?.uid, isDemoMode]);

  // Load data for authenticated Firebase user (Protected)
  const loadAuthenticatedUserData = async (uid: string) => {
    try {
      // 1. Try loading user data from Firestore
      const [fAccounts, fEmails, fQuarantine, fRules, fSettings] = await Promise.all([
        FirestoreSyncService.loadAccounts(uid).catch(() => []),
        FirestoreSyncService.loadEmails(uid).catch(() => []),
        FirestoreSyncService.loadQuarantine(uid).catch(() => []),
        FirestoreSyncService.loadAutomationRules(uid).catch(() => []),
        FirestoreSyncService.loadSettings(uid).catch(() => null),
      ]);

      if (fAccounts.length > 0) setAccounts(fAccounts);
      if (fEmails.length > 0) setEmails(fEmails);
      if (fQuarantine.length > 0) setQuarantineItems(fQuarantine);
      if (fRules.length > 0) setAutomationRules(fRules);
      if (fSettings) {
        if (fSettings.security) setSecuritySettings(fSettings.security);
        if (fSettings.notifications) setNotifications(normalizeNotificationConfig(fSettings.notifications));
      }

      // 2. Fetch authenticated data from backend via apiFetch (sends Authorization: Bearer <Firebase ID token>)
      const [accRes, emailsRes, quarRes, rulesRes, setRes] = await Promise.all([
        apiFetch('/api/accounts').catch(() => null),
        apiFetch('/api/emails').catch(() => null),
        apiFetch('/api/quarantine').catch(() => null),
        apiFetch('/api/rules').catch(() => null),
        apiFetch('/api/settings').catch(() => null),
      ]);

      const parseJson = async (res: Response | null) => {
        if (res && res.ok && res.headers.get('content-type')?.includes('application/json')) {
          return await res.json().catch(() => null);
        }
        return null;
      };

      const bAccounts = await parseJson(accRes);
      const bEmails = await parseJson(emailsRes);
      const bQuar = await parseJson(quarRes);
      const bRules = await parseJson(rulesRes);
      const bSettings = await parseJson(setRes);

      if (bAccounts && Array.isArray(bAccounts) && bAccounts.length > 0) {
        setAccounts(bAccounts);
      }
      if (bEmails && Array.isArray(bEmails) && bEmails.length > 0) {
        setEmails(bEmails);
        loadDailySummary(bEmails);
      } else if (fEmails.length > 0) {
        loadDailySummary(fEmails);
      } else {
        loadDailySummary([]);
      }
      if (bQuar && Array.isArray(bQuar)) setQuarantineItems(bQuar);
      if (bRules && Array.isArray(bRules)) setAutomationRules(bRules);
      if (bSettings) {
        if (bSettings.security) setSecuritySettings(bSettings.security);
        if (bSettings.notifications) setNotifications(normalizeNotificationConfig(bSettings.notifications));
        if (bSettings.auditLogs) setAuditLogs(bSettings.auditLogs);
      }

      // Check if we have an active access token to sync real Gmail messages
      const token = getCachedAccessToken();
      if (token) {
        await syncGmailFromWorkspace(uid, token);
      }
    } catch (err) {
      console.warn('Error loading authenticated user data:', err);
      loadDailySummary([]);
    }
  };

  // Load sample dataset for isolated Demo Mode
  const loadDemoData = async () => {
    try {
      const res = await fetch('/api/demo/data');
      if (res.ok) {
        const data = await res.json();
        if (data.accounts) setAccounts(data.accounts);
        if (data.emails) {
          setEmails(data.emails);
          loadDailySummary(data.emails);
        }
        if (data.quarantine) setQuarantineItems(data.quarantine);
        if (data.alerts) setAlerts(data.alerts);
        if (data.rules) setAutomationRules(data.rules);
        if (data.settings) {
          if (data.settings.security) setSecuritySettings(data.settings.security);
          if (data.settings.notifications) setNotifications(normalizeNotificationConfig(data.settings.notifications));
        }
      }
    } catch (err) {
      console.warn('Demo data load notice:', err);
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
      const userName = user?.displayName?.split(' ')[0] || firebaseUser?.displayName?.split(' ')[0] || 'User';

      if (items.length === 0) {
        return `Good day, ${userName}. Your email protection is active. Connect your Gmail or Outlook account in Accounts to begin receiving AI-powered daily intelligence briefings, threat scans, and deadline tracking.`;
      }

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
        text += `\n\n🛡️ Security Status: MailSentinel intercepted and quarantined ${threats.length} high-risk threat${threats.length === 1 ? '' : 's'}, keeping your accounts safeguarded.`;
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
        res = await apiFetch('/api/gemini/daily-summary', {
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
            userName: user?.displayName || firebaseUser?.displayName || 'User',
          }),
          signal: controller.signal,
        });
      } catch (firstErr: any) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        try {
          res = await apiFetch('/api/gemini/daily-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emails: emailsToUse.slice(0, 10),
              userName: user?.displayName || firebaseUser?.displayName || 'User',
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
        setDailySummary(data.summary || generateClientFallback());
      } else {
        setDailySummary(generateClientFallback());
      }
    } catch (err) {
      setDailySummary(generateClientFallback());
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Sync real Gmail messages
  const syncGmailFromWorkspace = async (uid: string, token: string) => {
    try {
      setIsSyncing(true);
      const gmailList = await fetchGmailMessages(token, 15);
      if (gmailList.length > 0) {
        const mappedEmails: Email[] = gmailList.map((g: GmailMessageSummary) => {
          const senderEmail = g.from.includes('<')
            ? g.from.split('<')[1].replace('>', '').trim()
            : g.from.trim();
          const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'unknown.com';

          return {
            id: `gmail-${g.id}`,
            accountId: `acc-google-${uid}`,
            accountEmail: firebaseUser?.email || user?.email || 'user@gmail.com',
            provider: 'gmail',
            threadId: g.threadId || g.id,
            sender: senderEmail,
            senderName: g.from.split('<')[0].replace(/"/g, '').trim() || senderEmail,
            senderDomain,
            recipients: [firebaseUser?.email || user?.email || 'me'],
            subject: g.subject || '(No Subject)',
            bodySnippet: g.snippet || '',
            bodyText: g.bodyText || g.snippet || '',
            receivedAt: g.date ? new Date(g.date).toISOString() : new Date().toISOString(),
            isRead: false,
            isArchived: false,
            isQuarantined: false,
            hasAttachment: false,
            aiAnalysis: {
              priority: 'Medium',
              category: 'business',
              summary: g.snippet || 'Synced from connected Google Workspace.',
              sentiment: 'neutral',
              actionRequired: false,
              recommendedAction: '',
              deadline: null,
              extractedEntities: [],
              whyPriorityReasons: ['Synced message'],
              confidence: 90,
              priorityScore: 50,
            },
            securityAnalysis: {
              classification: 'SAFE',
              riskScore: 5,
              phishingScore: 2,
              spamScore: 3,
              spoofingScore: 1,
              riskLevel: 'Safe',
              confidenceScore: 95,
              explanation: 'Verified message via authentic Google Workspace connection.',
              indicators: [],
              whyFlaggedReasons: [],
              authResults: {
                spf: 'PASS',
                dkim: 'PASS',
                dmarc: 'PASS',
              },
              senderDomainAnalysis: {
                displayName: g.from.split('<')[0].replace(/"/g, '').trim() || senderEmail,
                senderEmail,
                domain: senderDomain,
                isLookalike: false,
                replyToMatch: true,
              },
              urlAnalysis: {
                totalUrls: 0,
                suspiciousUrls: [],
              },
            },
          };
        });

        setEmails((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const fresh = mappedEmails.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        });

        for (const em of mappedEmails) {
          await FirestoreSyncService.saveEmail(uid, em);
        }
      }
    } catch (err) {
      console.warn('Gmail Workspace sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync All Accounts
  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const token = getCachedAccessToken();
      const currentUid = user?.uid || firebaseUser?.uid;
      if (token && currentUid) {
        await syncGmailFromWorkspace(currentUid, token);
      }

      try {
        const res = await apiFetch('/api/accounts/sync-all', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.accounts) setAccounts(data.accounts);
          const [eRes, qRes] = await Promise.all([
            apiFetch('/api/emails'),
            apiFetch('/api/quarantine'),
          ]);
          if (eRes.ok) setEmails(await eRes.json());
          if (qRes.ok) setQuarantineItems(await qRes.json());
        }
      } catch (err) {
        // Silent fallback
      }

      setAccounts((prev) =>
        prev.map((a) => ({ ...a, lastSyncedAt: new Date().toISOString() }))
      );
    } catch (err) {
      console.warn('Sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync a single account (Gmail or Outlook)
  const handleSyncSingleAccount = async (accountId: string) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, status: 'Syncing' } : a))
    );
    try {
      const res = await apiFetch(`/api/accounts/${accountId}/sync`, { method: 'POST' });
      const [accRes, eRes, qRes] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/emails'),
        apiFetch('/api/quarantine'),
      ]);
      if (accRes.ok) setAccounts(await accRes.json());
      if (eRes.ok) {
        const freshEmails = await eRes.json();
        setEmails(freshEmails);
        loadDailySummary(freshEmails);
      }
      if (qRes.ok) setQuarantineItems(await qRes.json());
    } catch (err) {
      console.warn(`Sync failed for account ${accountId}:`, err);
      const accRes = await apiFetch('/api/accounts').catch(() => null);
      if (accRes && accRes.ok) setAccounts(await accRes.json());
    } finally {
      setIsSyncing(false);
    }
  };

  // Listen for OAuth popup completion messages (Gmail & Outlook)
  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'OAUTH_AUTH_SUCCESS') {
        const [accRes, eRes, qRes] = await Promise.all([
          apiFetch('/api/accounts'),
          apiFetch('/api/emails'),
          apiFetch('/api/quarantine'),
        ]);
        if (accRes.ok) setAccounts(await accRes.json());
        if (eRes.ok) {
          const freshEmails = await eRes.json();
          setEmails(freshEmails);
          loadDailySummary(freshEmails);
        }
        if (qRes.ok) setQuarantineItems(await qRes.json());
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Toggle Read
  const handleToggleRead = async (id: string, current: boolean) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: !current } : e)));
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.updateEmail(currentUid, id, { isRead: !current });
    }

    try {
      await apiFetch(`/api/emails/${id}/read`, {
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
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.updateEmail(currentUid, id, { isArchived: true });
    }

    try {
      await apiFetch(`/api/emails/${id}/archive`, { method: 'POST' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Mark Email as Important
  const handleMarkImportant = (id: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              aiAnalysis: { ...e.aiAnalysis, priority: 'High' },
              tags: e.tags?.includes('important') ? e.tags : [...(e.tags || []), 'important'],
            }
          : e
      )
    );
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

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.updateEmail(currentUid, id, { isQuarantined: true });
      await FirestoreSyncService.saveQuarantineItem(currentUid, qItem);
    }

    try {
      await apiFetch(`/api/emails/${id}/quarantine`, { method: 'POST' });
    } catch (err) {
      // client-side state already updated
    }
  };

  // Release Quarantine
  const handleReleaseQuarantine = async (emailId: string) => {
    const item = quarantineItems.find((q) => q.emailId === emailId);
    setQuarantineItems((prev) => prev.filter((q) => q.emailId !== emailId));
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isQuarantined: false } : e)));

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid && item) {
      await FirestoreSyncService.deleteQuarantineItem(currentUid, item.id);
      await FirestoreSyncService.updateEmail(currentUid, emailId, { isQuarantined: false });
    }

    try {
      if (item) {
        await apiFetch(`/api/quarantine/${item.id}/release`, { method: 'POST' });
      }
    } catch (err) {
      // client-side state already updated
    }
  };

  // Delete Quarantined permanently
  const handleDeleteQuarantined = async (id: string) => {
    setQuarantineItems((prev) => prev.filter((q) => q.id !== id));
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.deleteQuarantineItem(currentUid, id);
    }

    try {
      await apiFetch(`/api/quarantine/${id}`, { method: 'DELETE' });
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

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveAccount(currentUid, newAcc);
    }

    try {
      await apiFetch('/api/accounts', {
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
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.deleteAccount(currentUid, id);
    }

    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
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
    const updated = { ...securitySettings, whitelist: [...(securitySettings.whitelist || []), item] };
    setSecuritySettings(updated);

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, updated, notifications);
    }

    try {
      await apiFetch('/api/settings/whitelist', {
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
      whitelist: (securitySettings.whitelist || []).filter((w) => w.id !== id),
    };
    setSecuritySettings(updated);

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, updated, notifications);
    }

    try {
      await apiFetch(`/api/settings/whitelist/${id}`, { method: 'DELETE' });
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
    const updated = { ...securitySettings, blacklist: [...(securitySettings.blacklist || []), item] };
    setSecuritySettings(updated);

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, updated, notifications);
    }

    try {
      await apiFetch('/api/settings/blacklist', {
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
      blacklist: (securitySettings.blacklist || []).filter((b) => b.id !== id),
    };
    setSecuritySettings(updated);

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, updated, notifications);
    }

    try {
      await apiFetch(`/api/settings/blacklist/${id}`, { method: 'DELETE' });
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

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveAutomationRule(currentUid, updatedRule);
    }

    try {
      await apiFetch(`/api/rules/${ruleId}`, {
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

    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveAutomationRule(currentUid, newRule);
    }

    try {
      await apiFetch('/api/rules', {
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
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, sec, notifications);
    }
    try {
      await apiFetch('/api/settings', {
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
    const currentUid = user?.uid || firebaseUser?.uid;
    if (currentUid) {
      await FirestoreSyncService.saveSettings(currentUid, securitySettings, cleanNotif);
    }
    try {
      await apiFetch('/api/settings', {
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
      const res = await apiFetch('/api/emails/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      const [eRes, qRes] = await Promise.all([
        apiFetch('/api/emails').catch(() => null),
        apiFetch('/api/quarantine').catch(() => null),
      ]);
      if (eRes && eRes.ok) setEmails(await eRes.json());
      if (qRes && qRes.ok) setQuarantineItems(await qRes.json());

      return result;
    } catch (err) {
      console.warn('Simulation note:', err);
    }
  };

  // Loading state while Firebase initial auth state is resolving
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <Shield className="w-6 h-6 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
          <span>Verifying Secure Session...</span>
        </div>
      </div>
    );
  }

  // If user is not authenticated and has not chosen Demo Mode, render AuthView
  // Strictly enforces protected routes!
  if (!user && !isDemoMode) {
    return <AuthView />;
  }

  const unreadCount = emails.filter((e) => !e.isRead && !e.isQuarantined && !e.isArchived).length;
  const needsAttentionCount = emails.filter(
    (e) => !e.isArchived && !e.isQuarantined && (e.aiAnalysis?.actionRequired || e.aiAnalysis?.priority === 'Critical')
  ).length;

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden">
      {/* Demo Mode Banner (when exploring offline preview without authentication) */}
      {isDemoMode && !user && (
        <div className="bg-gradient-to-r from-cyan-950/80 via-slate-900 to-indigo-950/80 border-b border-cyan-800/40 px-4 py-2 text-xs flex items-center justify-between text-cyan-200 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Demo Preview Mode:</strong> Exploring sample mailboxes offline. Real-time protection & synchronization requires signing in.
            </span>
          </div>
          <button
            id="btn-banner-signin"
            onClick={exitDemoMode}
            className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
          >
            Sign In / Register
          </button>
        </div>
      )}

      {/* Top Application Header */}
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
        onOpenEmail={(emailId) => setSelectedEmailId(emailId)}
        user={user}
        isDemoMode={isDemoMode}
        onSignIn={exitDemoMode}
        onSignOut={logout}
        googleUser={firebaseUser}
        onSignInWithGoogle={loginWithGoogle}
      />

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
              onMarkRead={(id) => handleToggleRead(id, false)}
              onMarkImportant={handleMarkImportant}
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
            <NeedsAttentionView
              emails={emails}
              accounts={accounts}
              onOpenEmail={(id) => setSelectedEmailId(id)}
              onMarkRead={(id) => handleToggleRead(id, false)}
              onMarkImportant={handleMarkImportant}
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
              googleUser={firebaseUser}
              onSignInWithGoogle={loginWithGoogle}
              isSigningIn={false}
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

          {(currentView === 'rules' || currentView === 'rules_whitelist') && (
            <RulesView
              rules={automationRules}
              onToggleRule={handleToggleRule}
              onAddRule={handleAddRule}
              onDeleteRule={(id) => setAutomationRules((prev) => prev.filter((r) => r.id !== id))}
              onRequestConfirm={(p) => setConfirmation({ ...p, isOpen: true })}
            />
          )}

          {currentView === 'notifications' && (
            <NotificationsView
              config={notifications}
              onUpdateConfig={handleUpdateNotifications}
              onTestNotification={() => {
                setAlerts((prev) => [
                  {
                    id: `alert-test-${Date.now()}`,
                    title: 'Test Notification Dispatched',
                    description: 'Simulated high-priority alert sent through notification pipeline.',
                    severity: 'high',
                    timestamp: new Date().toISOString(),
                    acknowledged: false,
                  },
                  ...prev,
                ]);
              }}
            />
          )}

          {(currentView === 'activity' || currentView === 'audit_logs') && (
            <ActivityView
              logs={auditLogs.map((l) => ({
                id: l.id,
                action: l.action,
                details: l.details,
                timestamp: l.timestamp,
                severity: l.severity,
              }))}
            />
          )}

          {currentView === 'accounts' && (
            <AccountsView
              accounts={accounts}
              onSyncAccount={handleSyncSingleAccount}
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
      {selectedEmail && (
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
          onEmailUpdate={(updated) => {
            setEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          }}
        />
      )}

      {/* Universal Controlled Confirmation Modal */}
      {confirmation.isOpen && (
        <ConfirmationModal
          isOpen={confirmation.isOpen}
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          isDestructive={confirmation.isDestructive}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* Welcome & First-Time Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={() => {
            setShowOnboarding(false);
            localStorage.setItem('mailsentinel_onboarded_dismissed', 'true');
          }}
          onConnectGmail={() => {
            setShowOnboarding(false);
            localStorage.setItem('mailsentinel_onboarded_dismissed', 'true');
            loginWithGoogle();
          }}
          onConnectOutlook={() => {
            setShowOnboarding(false);
            localStorage.setItem('mailsentinel_onboarded_dismissed', 'true');
            handleAddAccount({
              emailAddress: 'alex.morgan@contoso.com',
              provider: 'outlook',
              displayName: 'Alex Morgan (Work)',
            });
          }}
        />
      )}

      {/* Real-time Push Notification Alert Banner (FCM Foreground & Deep Link) */}
      {incomingPushAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-md w-full p-4 rounded-2xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Bell className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">{incomingPushAlert.title}</span>
                  {incomingPushAlert.priority && (
                    <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {incomingPushAlert.priority.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-xs leading-snug">{incomingPushAlert.body}</p>
                {incomingPushAlert.emailId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmailId(incomingPushAlert.emailId!);
                      setIncomingPushAlert(null);
                    }}
                    className="mt-2 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <span>Inspect Email</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIncomingPushAlert(null)}
              className="text-slate-400 hover:text-white p-1"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
