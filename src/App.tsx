import React, { useState, useEffect } from 'react';
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
import { ConfirmationModal } from './components/ConfirmationModal';
import {
  AuditLogEntry,
  AutomationRule,
  Email,
  EmailAccount,
  NotificationConfig,
  QuarantineItem,
  SecurityAlert,
  SecuritySettings,
} from './types';

export function App() {
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

  // Initial Load from API
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [accRes, emailsRes, quarRes, rulesRes, setRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/emails'),
        fetch('/api/quarantine'),
        fetch('/api/rules'),
        fetch('/api/settings'),
      ]);

      const parseJson = async (res: Response) => {
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          try {
            return await res.json();
          } catch (e) {
            console.warn(`Failed parsing JSON from ${res.url}:`, e);
          }
        }
        return null;
      };

      const accData = await parseJson(accRes);
      if (accData) setAccounts(accData);

      const emailsData = await parseJson(emailsRes);
      if (emailsData) setEmails(emailsData);

      const quarData = await parseJson(quarRes);
      if (quarData) setQuarantineItems(quarData);

      const rulesData = await parseJson(rulesRes);
      if (rulesData) setAutomationRules(rulesData);

      const setData = await parseJson(setRes);
      if (setData) {
        if (setData.security) setSecuritySettings(setData.security);
        if (setData.notifications) setNotifications(setData.notifications);
        if (setData.auditLogs) setAuditLogs(setData.auditLogs);
      }

      // Load initial Daily Summary
      loadDailySummary();
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  const loadDailySummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await fetch('/api/gemini/daily-summary', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDailySummary(data.summary || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Sync All
  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/accounts/sync-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        // Refresh emails and quarantine
        const [eRes, qRes] = await Promise.all([fetch('/api/emails'), fetch('/api/quarantine')]);
        if (eRes.ok) setEmails(await eRes.json());
        if (qRes.ok) setQuarantineItems(await qRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Read
  const handleToggleRead = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`/api/emails/${id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: !current }),
      });
      if (res.ok) {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: !current } : e)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Archive Email
  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/emails/${id}/archive`, { method: 'POST' });
      if (res.ok) {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isArchived: true } : e)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Quarantine Email
  const handleQuarantineEmail = async (id: string) => {
    try {
      const res = await fetch(`/api/emails/${id}/quarantine`, { method: 'POST' });
      if (res.ok) {
        setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isQuarantined: true } : e)));
        const qRes = await fetch('/api/quarantine');
        if (qRes.ok) setQuarantineItems(await qRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Release Quarantine
  const handleReleaseQuarantine = async (emailId: string) => {
    const item = quarantineItems.find((q) => q.emailId === emailId);
    if (!item) return;
    try {
      const res = await fetch(`/api/quarantine/${item.id}/release`, { method: 'POST' });
      if (res.ok) {
        setQuarantineItems((prev) => prev.filter((q) => q.id !== item.id));
        setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isQuarantined: false } : e)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Quarantined permanently
  const handleDeleteQuarantined = async (id: string) => {
    try {
      const res = await fetch(`/api/quarantine/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setQuarantineItems((prev) => prev.filter((q) => q.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Account
  const handleAddAccount = async (acc: { emailAddress: string; provider: 'gmail' | 'outlook'; displayName: string }) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc),
      });
      if (res.ok) {
        const newAcc = await res.json();
        setAccounts((prev) => [...prev, newAcc]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Disconnect Account
  const handleDisconnectAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Whitelist
  const handleAddWhitelist = async (value: string, type: 'domain' | 'email') => {
    try {
      const res = await fetch('/api/settings/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type }),
      });
      if (res.ok) {
        const item = await res.json();
        setSecuritySettings((prev) => ({ ...prev, whitelist: [...prev.whitelist, item] }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/whitelist/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSecuritySettings((prev) => ({
          ...prev,
          whitelist: prev.whitelist.filter((w) => w.id !== id),
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Blacklist
  const handleAddBlacklist = async (value: string, type: 'domain' | 'email') => {
    try {
      const res = await fetch('/api/settings/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type }),
      });
      if (res.ok) {
        const item = await res.json();
        setSecuritySettings((prev) => ({ ...prev, blacklist: [...prev.blacklist, item] }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveBlacklist = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/blacklist/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSecuritySettings((prev) => ({
          ...prev,
          blacklist: prev.blacklist.filter((b) => b.id !== id),
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Rule
  const handleToggleRule = async (ruleId: string) => {
    const rule = automationRules.find((r) => r.id === ruleId);
    if (!rule) return;
    try {
      const res = await fetch(`/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        setAutomationRules((prev) =>
          prev.map((r) => (r.id === ruleId ? { ...r, isActive: !r.isActive } : r))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Rule
  const handleAddRule = async (rule: Partial<AutomationRule>) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        const created = await res.json();
        setAutomationRules((prev) => [...prev, created]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update Settings
  const handleUpdateSecurity = async (sec: SecuritySettings) => {
    setSecuritySettings(sec);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ security: sec }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateNotifications = async (notif: NotificationConfig) => {
    setNotifications(notif);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: notif }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Simulate Incoming Email
  const handleSimulateIncoming = async (data: any) => {
    const res = await fetch('/api/emails/simulate-incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    // Reload email lists and quarantine
    const [eRes, qRes] = await Promise.all([fetch('/api/emails'), fetch('/api/quarantine')]);
    if (eRes.ok) setEmails(await eRes.json());
    if (qRes.ok) setQuarantineItems(await qRes.json());

    return result;
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
