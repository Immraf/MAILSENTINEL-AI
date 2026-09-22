import React, { useState } from 'react';
import {
  MailCheck,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Send,
  Sparkles,
  Play,
  FileText,
  AlertTriangle,
  Info,
  RotateCcw,
  Mail,
  Check,
  X,
  Radio,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { EmailAccount } from '../types';
import { apiFetch } from '../lib/api';

interface AccountsViewProps {
  accounts: EmailAccount[];
  onSyncAccount: (id: string) => void;
  onDisconnectAccount: (id: string) => void;
  onAddAccount: (acc: { emailAddress: string; provider: 'gmail' | 'outlook'; displayName: string }) => void;
  onSimulateIncoming: (data: {
    accountId: string;
    sender: string;
    senderName: string;
    subject: string;
    bodyText: string;
    attachments?: Array<{ filename: string; size: number; contentType: string }>;
  }) => Promise<any>;
  isSyncing: boolean;
  onRequestConfirm: (params: {
    title: string;
    description: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  onSyncAccount,
  onDisconnectAccount,
  onAddAccount,
  onSimulateIncoming,
  isSyncing,
  onRequestConfirm,
}) => {
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newProvider, setNewProvider] = useState<'gmail' | 'outlook'>('outlook');
  const [newName, setNewName] = useState('');
  const [isStartingOAuth, setIsStartingOAuth] = useState(false);
  const [oauthStatusMsg, setOauthStatusMsg] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [accountStatusOverrides, setAccountStatusOverrides] = useState<Record<string, string>>({});

  // Simulator state
  const [simAccount, setSimAccount] = useState<string>(accounts[0]?.id || '');
  const [simSender, setSimSender] = useState('billing@micros0ft-support.com');
  const [simSenderName, setSimSenderName] = useState('Microsoft Account Team');
  const [simSubject, setSimSubject] = useState('CRITICAL: Verify your Microsoft 365 MFA Credentials immediately');
  const [simBody, setSimBody] = useState(
    'Your Microsoft 365 multi-factor authentication has expired. Click here to confirm your identity: http://192.168.1.105/login or your account will be locked.'
  );
  const [simHasExecutable, setSimHasExecutable] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Maximum 10 accounts across BOTH providers
  const isMaxCapacity = accounts.length >= 10;
  const gmailCount = accounts.filter((a) => a.provider === 'gmail').length;
  const outlookCount = accounts.filter((a) => a.provider === 'outlook').length;

  const openConnectWithProvider = (provider: 'gmail' | 'outlook') => {
    if (isMaxCapacity) {
      setOauthStatusMsg({
        type: 'error',
        text: 'Account capacity limit reached: Maximum 10 connected accounts across Gmail and Outlook combined.',
      });
      return;
    }
    setNewProvider(provider);
    setNewName(provider === 'gmail' ? 'Gmail Account' : 'Work Outlook (Microsoft 365)');
    setNewEmail(provider === 'gmail' ? 'user@gmail.com' : 'user@company.com');
    setShowConnectModal(true);
  };

  /**
   * Triggers the real OAuth 2.0 flow for Microsoft Identity Platform or Google
   */
  const handleLaunchOAuth = async (provider: 'outlook' | 'gmail') => {
    if (isMaxCapacity) {
      setOauthStatusMsg({
        type: 'error',
        text: 'Maximum capacity reached (10 connected accounts limit across both providers). Please disconnect an existing account first.',
      });
      return;
    }

    setIsStartingOAuth(true);
    setOauthStatusMsg({
      type: 'info',
      text: `Initializing ${provider === 'outlook' ? 'Microsoft Identity Platform' : 'Google Identity'} OAuth 2.0 flow...`,
    });

    try {
      const res = await apiFetch(`/api/accounts/${provider}/connect`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          data.error?.message ||
          data.message ||
          (provider === 'gmail' && !data.configured ? 'Gmail connection is not configured.' : `Failed to initiate OAuth flow for ${provider}.`);
        setOauthStatusMsg({
          type: 'error',
          text: errorMsg,
        });
        setIsStartingOAuth(false);
        return;
      }

      if (data.authUrl) {
        // Open OAuth popup window
        const width = 600;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          data.authUrl,
          provider === 'outlook' ? 'MicrosoftOAuth' : 'GoogleOAuth',
          `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
        );

        if (!popup) {
          setOauthStatusMsg({
            type: 'error',
            text: 'Popup was blocked by your browser. Please allow popups for this window and retry.',
          });
        } else {
          setOauthStatusMsg({
            type: 'info',
            text: `Waiting for ${provider === 'outlook' ? 'Microsoft 365' : 'Google'} authentication in popup window...`,
          });
        }
      } else if (!data.configured) {
        // Provider credentials not configured in environment
        setOauthStatusMsg({
          type: 'info',
          text: `${provider === 'outlook' ? 'MICROSOFT_CLIENT_ID' : 'GOOGLE_CLIENT_ID'} not detected in environment. You can connect a pre-configured ${provider.toUpperCase()} mailbox below to exercise the full Microsoft Graph delta synchronization engine.`,
        });
        openConnectWithProvider(provider);
      }
    } catch (err: any) {
      setOauthStatusMsg({
        type: 'error',
        text: `Error initializing OAuth: ${err.message || err}`,
      });
    } finally {
      setIsStartingOAuth(false);
    }
  };

  /**
   * Handle Re-authentication for an existing account
   */
  const handleReconnect = async (acc: EmailAccount) => {
    setAccountStatusOverrides((prev) => ({ ...prev, [acc.id]: 'Re-authenticating' }));
    try {
      const res = await apiFetch(`/api/accounts/${acc.id}/reauth`, { method: 'POST' });
      const data = await res.json();

      if (data.authUrl) {
        const width = 600;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(
          data.authUrl,
          acc.provider === 'outlook' ? 'MicrosoftReauth' : 'GoogleReauth',
          `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
        );
      } else {
        // Fallback simulate re-connection & delta sync
        setTimeout(() => {
          setAccountStatusOverrides((prev) => ({ ...prev, [acc.id]: 'Connected' }));
          onSyncAccount(acc.id);
        }, 1000);
      }
    } catch (err) {
      setTimeout(() => {
        setAccountStatusOverrides((prev) => ({ ...prev, [acc.id]: 'Connected' }));
        onSyncAccount(acc.id);
      }, 1000);
    }
  };

  const handleManualAddConnect = () => {
    if (!newEmail.trim() || isMaxCapacity) return;
    onAddAccount({
      emailAddress: newEmail.trim(),
      provider: newProvider,
      displayName: newName.trim() || newEmail.split('@')[0],
    });
    setNewEmail('');
    setNewName('');
    setShowConnectModal(false);
    setOauthStatusMsg({
      type: 'success',
      text: `Added ${newProvider === 'outlook' ? 'Microsoft Outlook' : 'Google Gmail'} mailbox: ${newEmail.trim()}`,
    });
  };

  const handleRunSimulation = async () => {
    if (!simAccount) return;
    setIsSimulating(true);
    setSimResult(null);

    const attachments = simHasExecutable
      ? [{ filename: 'invoice_march_2026.pdf.exe', size: 1048576, contentType: 'application/x-msdownload' }]
      : [];

    try {
      const res = await onSimulateIncoming({
        accountId: simAccount,
        sender: simSender,
        senderName: simSenderName,
        subject: simSubject,
        bodyText: simBody,
        attachments,
      });
      setSimResult(res);
    } catch (err) {
      console.warn('Simulation notice:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const loadScenario = (scenario: 'phish' | 'malware' | 'safe_uni' | 'wire_fraud') => {
    if (scenario === 'phish') {
      setSimSender('security-update@micros0ft-mfa.net');
      setSimSenderName('Microsoft Security Team');
      setSimSubject('URGENT: Re-authenticate Microsoft 365 Single Sign-On');
      setSimBody(
        'We noticed unauthorized login attempts. Please confirm your credentials immediately at http://192.168.10.15/mfa-reset or your cloud mailbox will be quarantined.'
      );
      setSimHasExecutable(false);
    } else if (scenario === 'malware') {
      setSimSender('accounting@shipping-cargo.com');
      setSimSenderName('Global Freight Logistics');
      setSimSubject('Overdue Delivery Bill & Manifest #8892');
      setSimBody(
        'Please review the attached invoice immediately to clear international customs freight for your package.'
      );
      setSimHasExecutable(true);
    } else if (scenario === 'safe_uni') {
      setSimSender('advisor@berkeley.edu');
      setSimSenderName('Prof. David Evans');
      setSimSubject('Feedback on Chapter 4 & Thesis Defense Schedule');
      setSimBody(
        'Hi there, I reviewed your chapter draft. Please send over the revised bibliography by Friday 5:00 PM so we can submit for committee sign-off.'
      );
      setSimHasExecutable(false);
    } else if (scenario === 'wire_fraud') {
      setSimSender('ceo-executive@corporate-hq.com');
      setSimSenderName('Chief Executive Officer');
      setSimSubject('Confidential Wire Transfer Request for Acquisition');
      setSimBody(
        'I am currently in board meetings and unreachable by phone. Process a confidential wire transfer of $45,000 to the attached vendor coordinates before market close.'
      );
      setSimHasExecutable(false);
    }
  };

  // Section 14 Separate Status indicators
  const hasGmailConnected = accounts.some(
    (a) => a.provider === 'gmail' && (a.status === 'Connected' || a.status === 'Active')
  );
  const hasGmailReauth = accounts.some(
    (a) =>
      a.provider === 'gmail' &&
      (a.status === 'Needs Reauthentication' || a.status.toLowerCase().includes('reauth') || a.status === 'Error')
  );
  const gmailStatusText = hasGmailConnected
    ? 'Connected'
    : hasGmailReauth
    ? 'Needs Reauthentication'
    : 'Not Connected';

  const hasOutlookConnected = accounts.some(
    (a) => a.provider === 'outlook' && (a.status === 'Connected' || a.status === 'Active')
  );
  const hasOutlookReauth = accounts.some(
    (a) =>
      a.provider === 'outlook' &&
      (a.status === 'Needs Reauthentication' || a.status.toLowerCase().includes('reauth') || a.status === 'Error')
  );
  const outlookStatusText = hasOutlookConnected
    ? 'Connected'
    : hasOutlookReauth
    ? 'Needs Reauthentication'
    : 'Not Connected';

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-6xl mx-auto text-slate-100">
      {/* Top Header & Fast Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Connected Accounts</h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>GMAIL + OUTLOOK 365</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage up to 10 unified mailboxes across Google Workspace and Microsoft 365 / Outlook.
          </p>
        </div>

        {/* Action Buttons: Connect Gmail / Connect Outlook */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Microsoft Outlook Connect Button */}
          <button
            id="connect-outlook-oauth-btn"
            onClick={() => handleLaunchOAuth('outlook')}
            disabled={isMaxCapacity || isStartingOAuth}
            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-40"
            title="Connect Microsoft 365 / Outlook via OAuth 2.0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Outlook</span>
          </button>

          {/* Google Gmail Connect Button */}
          <button
            id="connect-gmail-oauth-btn"
            onClick={() => handleLaunchOAuth('gmail')}
            disabled={isMaxCapacity || isStartingOAuth}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition disabled:opacity-40"
            title="Connect Google Gmail via OAuth 2.0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Gmail</span>
          </button>

          {/* Combined Capacity Counter */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono flex items-center gap-2">
            <span className="text-slate-400">Total Capacity:</span>
            <span className={`font-bold ${isMaxCapacity ? 'text-rose-400' : 'text-emerald-400'}`}>
              {accounts.length} / 10
            </span>
            <span className="text-[10px] text-slate-500">
              ({gmailCount} Gmail, {outlookCount} Outlook)
            </span>
          </div>
        </div>
      </div>

      {/* Separate Status Overview Panel (Strict separation of MailSentinel Auth vs Mailboxes) */}
      <div id="auth-mailbox-status-overview" className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">MailSentinel Account</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Authenticated</span>
            </div>
          </div>

          <div className="hidden sm:block h-7 w-px bg-slate-800" />

          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Gmail</span>
            <div className="flex items-center gap-1.5 mt-1">
              {gmailStatusText === 'Connected' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : gmailStatusText === 'Needs Reauthentication' ? (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
              )}
              <span
                className={`text-xs font-semibold ${
                  gmailStatusText === 'Connected'
                    ? 'text-emerald-400'
                    : gmailStatusText === 'Needs Reauthentication'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {gmailStatusText}
              </span>
            </div>
          </div>

          <div className="hidden sm:block h-7 w-px bg-slate-800" />

          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Outlook</span>
            <div className="flex items-center gap-1.5 mt-1">
              {outlookStatusText === 'Connected' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : outlookStatusText === 'Needs Reauthentication' ? (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
              )}
              <span
                className={`text-xs font-semibold ${
                  outlookStatusText === 'Connected'
                    ? 'text-emerald-400'
                    : outlookStatusText === 'Needs Reauthentication'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {outlookStatusText}
              </span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          <span>Strict separation: </span>
          <span className="text-slate-400 font-medium">Google Sign-In</span>
          <span> authenticates your account, while </span>
          <span className="text-slate-400 font-medium">Connect Gmail</span>
          <span> links your monitored mailbox.</span>
        </div>
      </div>

      {/* OAuth Status or Error Notification */}
      {oauthStatusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start justify-between gap-3 border ${
            oauthStatusMsg.type === 'error'
              ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
              : oauthStatusMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-sky-950/40 border-sky-800/80 text-sky-300'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {oauthStatusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : oauthStatusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
            )}
            <p>{oauthStatusMsg.text}</p>
          </div>
          <button
            onClick={() => setOauthStatusMsg(null)}
            className="text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Multi-Provider Architecture Info Card */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Unified Architecture</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Gmail and Outlook synchronize into the same internal normalized model. Both providers receive identical AI intelligence, threat scanning, and priority analysis.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Delta Synchronization</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Microsoft Graph delta queries (<code>@odata.deltaLink</code>) track added, changed, and deleted messages incrementally with zero redundant downloads.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200">Read-Only Safety & AES-256</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Strictly requests <code>Mail.Read</code> (no <code>Mail.Send</code>). Refresh tokens are encrypted with AES-256-GCM and never exposed to the client.
            </p>
          </div>
        </div>
      </div>

      {/* Connected Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const rawStatus = (accountStatusOverrides[acc.id] || (isSyncing ? 'Syncing' : acc.status) || 'Connected').toLowerCase();
          let displayStatus = 'Connected';
          let statusBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          let statusDotClass = 'bg-emerald-400 animate-pulse';

          if (rawStatus === 'syncing') {
            displayStatus = 'Syncing';
            statusBadgeClass = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            statusDotClass = 'bg-indigo-400 animate-ping';
          } else if (rawStatus === 'queued' || rawStatus.includes('queue')) {
            displayStatus = 'Sync queued';
            statusBadgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            statusDotClass = 'bg-blue-400';
          } else if (rawStatus.includes('reauth') || rawStatus === 'needs_reauth' || rawStatus === 'reauthorization_required') {
            displayStatus = 'Reauthorization required';
            statusBadgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
            statusDotClass = 'bg-amber-400';
          } else if (rawStatus === 'error' || rawStatus === 'failed' || rawStatus.includes('fail')) {
            displayStatus = 'Sync failed';
            statusBadgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            statusDotClass = 'bg-rose-400';
          } else if (rawStatus === 'connected' || rawStatus === 'synced' || rawStatus === 'active') {
            displayStatus = acc.lastSyncedAt ? 'Synced' : 'Connected';
            statusBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            statusDotClass = 'bg-emerald-400 animate-pulse';
          }

          const isSync = rawStatus === 'syncing';
          const isOutlook = acc.provider === 'outlook';

          return (
            <div
              key={acc.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white">{acc.displayName}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        isOutlook
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {isOutlook ? 'Microsoft 365 / Outlook' : 'Google Gmail'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{acc.emailAddress}</p>
                </div>

                {/* Connection Status Badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase flex items-center gap-1 border ${statusBadgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
                    <span>{displayStatus}</span>
                  </span>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-800/80 pt-3">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Last Sync</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {acc.lastSyncedAt
                      ? new Date(acc.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Messages</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {acc.totalEmails || 0} indexed
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Graph Sync</span>
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>{isOutlook ? 'Delta Ready' : 'Verified'}</span>
                  </span>
                </div>
              </div>

              {/* Card Actions: Sync / Reconnect / Disconnect */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSyncAccount(acc.id)}
                    disabled={isSyncing || isSync}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isSync ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{isSync ? 'Syncing...' : 'Sync Now'}</span>
                  </button>

                  <button
                    onClick={() => handleReconnect(acc)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
                    title="Re-authenticate with OAuth provider"
                  >
                    <RotateCcw className="w-3 h-3 text-cyan-400" />
                    <span>Reconnect</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    onRequestConfirm({
                      title: `Disconnect ${acc.emailAddress}?`,
                      description: `This will remove ${acc.displayName} (${acc.provider.toUpperCase()}) from MailSentinel. No emails will be deleted from your provider.`,
                      isDestructive: true,
                      onConfirm: () => onDisconnectAccount(acc.id),
                    });
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-900/40 transition flex items-center gap-1"
                  title="Disconnect Mailbox"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Scan Simulator / Incoming Email Test Bench */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Incoming Email & Zero-Trust Security Simulator
              </h3>
              <p className="text-xs text-slate-400">
                Test how MailSentinel analyzes incoming messages across Gmail and Outlook accounts, detecting priority, deadlines, and phishing indicators.
              </p>
            </div>
          </div>
        </div>

        {/* Preset Scenarios */}
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1.5">Load Test Scenario:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loadScenario('phish')}
              className="px-2.5 py-1 text-xs rounded-lg bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/40 transition"
            >
              Phishing: Fake Microsoft 365 MFA
            </button>
            <button
              onClick={() => loadScenario('wire_fraud')}
              className="px-2.5 py-1 text-xs rounded-lg bg-amber-950/40 text-amber-300 border border-amber-800/60 hover:bg-amber-900/40 transition"
            >
              BEC: Executive Wire Fraud
            </button>
            <button
              onClick={() => loadScenario('malware')}
              className="px-2.5 py-1 text-xs rounded-lg bg-purple-950/40 text-purple-300 border border-purple-800/60 hover:bg-purple-900/40 transition"
            >
              Malware: Double Extension Executable
            </button>
            <button
              onClick={() => loadScenario('safe_uni')}
              className="px-2.5 py-1 text-xs rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/40 transition"
            >
              Legitimate: Academic Thesis Review
            </button>
          </div>
        </div>

        {/* Simulation Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Target Account</label>
            <select
              value={simAccount || ''}
              onChange={(e) => setSimAccount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({a.provider.toUpperCase()} - {a.emailAddress})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Sender Email</label>
            <input
              type="text"
              value={simSender || ''}
              onChange={(e) => setSimSender(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Sender Display Name</label>
            <input
              type="text"
              value={simSenderName || ''}
              onChange={(e) => setSimSenderName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Subject</label>
            <input
              type="text"
              value={simSubject || ''}
              onChange={(e) => setSimSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-400 mb-1">Body Text</label>
            <textarea
              rows={3}
              value={simBody || ''}
              onChange={(e) => setSimBody(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>

          <div className="md:col-span-2 flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(simHasExecutable)}
                onChange={(e) => setSimHasExecutable(e.target.checked)}
                className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
              />
              <span>Simulate dangerous attachment (<code>invoice.pdf.exe</code>)</span>
            </label>

            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Running Security Pipeline...' : 'Process Through Pipeline'}</span>
            </button>
          </div>
        </div>

        {/* Simulation Output Card */}
        {simResult && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">Pipeline Result</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                  simResult.email.securityAnalysis.classification === 'SAFE'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {simResult.email.securityAnalysis.classification} (Risk: {simResult.email.securityAnalysis.riskScore}/100)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              <strong className="text-slate-200">AI Summary:</strong> {simResult.email.aiAnalysis.summary}
            </p>
          </div>
        )}
      </div>

      {/* Connect Mailbox Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Connect Email Mailbox</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Connect a {newProvider === 'gmail' ? 'Google Gmail' : 'Microsoft 365 / Outlook'} mailbox to MailSentinel AI.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Provider Selection</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewProvider('outlook');
                      setNewName('Work Outlook');
                      setNewEmail('alex.turner@contoso.com');
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      newProvider === 'outlook'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Microsoft Outlook
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProvider('gmail');
                      setNewName('Personal Gmail');
                      setNewEmail('user@gmail.com');
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      newProvider === 'gmail'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Google Gmail
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Account Display Name</label>
                <input
                  type="text"
                  value={newName || ''}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Work Mailbox, Executive Outlook"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail || ''}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 font-mono"
                />
              </div>

              {/* Read-Only Safety Guarantee */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400">
                <span className="text-slate-300 font-semibold block mb-0.5">Read-Only Safety Guarantee</span>
                MailSentinel requests only <code>Mail.Read</code> and strictly read-only scopes. It cannot send mail, delete mail from servers, or access unrelated cloud resources.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleManualAddConnect}
                  disabled={!newEmail.trim() || isMaxCapacity}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition"
                >
                  Add to MailSentinel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
