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
} from 'lucide-react';
import { EmailAccount } from '../types';

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
  const [newProvider, setNewProvider] = useState<'gmail' | 'outlook'>('gmail');
  const [newName, setNewName] = useState('');

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

  const isMaxCapacity = accounts.length >= 10;

  const handleConnect = () => {
    if (!newEmail.trim() || isMaxCapacity) return;
    onAddAccount({
      emailAddress: newEmail.trim(),
      provider: newProvider,
      displayName: newName.trim() || newEmail.split('@')[0],
    });
    setNewEmail('');
    setNewName('');
    setShowConnectModal(false);
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
      console.error(err);
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

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto text-slate-100">
      {/* Header & Capacity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <MailCheck className="w-5 h-5 text-indigo-400" />
            <span>Connected Mailbox Accounts</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero-Trust multi-account integration. Up to 10 mailboxes with read-only cryptographic verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Mailbox Capacity: </span>
            <span className={`font-bold ${isMaxCapacity ? 'text-rose-400' : 'text-emerald-400'}`}>
              {accounts.length} / 10 Connected
            </span>
          </div>

          <button
            id="connect-new-account-btn"
            onClick={() => setShowConnectModal(true)}
            disabled={isMaxCapacity}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Account</span>
          </button>
        </div>
      </div>

      {/* Read-Only Safety Guarantee Card */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/20 flex items-start gap-3 text-xs">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0 mt-0.5">
          <Shield className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-slate-200">Strict Read-Only Permission Policy</h4>
          <p className="text-slate-400 leading-relaxed">
            MailSentinel operates solely with non-destructive read-only OAuth scopes (
            <code className="text-cyan-300 font-mono text-[11px]">gmail.readonly</code> and{' '}
            <code className="text-cyan-300 font-mono text-[11px]">Mail.Read</code>).
            MailSentinel <strong>cannot</strong> send emails on your behalf, modify emails in your provider, or delete messages from your cloud inbox.
          </p>
        </div>
      </div>

      {/* Connected Accounts Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-white">{acc.displayName}</h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                      acc.provider === 'gmail' ? 'bg-rose-500/20 text-rose-300' : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {acc.provider}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">{acc.emailAddress}</p>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-400 capitalize">{acc.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-3">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Last Sync</span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {new Date(acc.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Synchronized Messages</span>
                <span className="text-slate-300 font-mono text-[11px]">{acc.unreadCount + 12} messages</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
              <button
                onClick={() => onSyncAccount(acc.id)}
                disabled={isSyncing}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>

              <button
                onClick={() => {
                  onRequestConfirm({
                    title: `Disconnect ${acc.emailAddress}?`,
                    description: `This will remove ${acc.displayName} (${acc.provider.toUpperCase()}) from MailSentinel. Stored synchronization state will be purged.`,
                    isDestructive: true,
                    onConfirm: () => onDisconnectAccount(acc.id),
                  });
                }}
                className="text-slate-400 hover:text-rose-400 transition p-1"
                title="Disconnect Mailbox"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
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
                Live Incoming Email & Zero-Trust Security Simulator
              </h3>
              <p className="text-xs text-slate-400">
                Test the end-to-end pipeline: Heuristic triage, SPF/DKIM/DMARC checks, Gemini AI reasoning, and auto-quarantine.
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
              Phishing: Fake Microsoft SSO
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
              value={simAccount}
              onChange={(e) => setSimAccount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({a.emailAddress})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Sender Email</label>
            <input
              type="text"
              value={simSender}
              onChange={(e) => setSimSender(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Sender Display Name</label>
            <input
              type="text"
              value={simSenderName}
              onChange={(e) => setSimSenderName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Subject Line</label>
            <input
              type="text"
              value={simSubject}
              onChange={(e) => setSimSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
            />
          </div>
        </div>

        <div className="text-xs space-y-1">
          <label className="block text-slate-400">Email Body</label>
          <textarea
            rows={3}
            value={simBody}
            onChange={(e) => setSimBody(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-hidden"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={simHasExecutable}
              onChange={(e) => setSimHasExecutable(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600"
            />
            <span>Attach dangerous simulated executable (e.g. invoice_march_2026.pdf.exe)</span>
          </label>

          <button
            id="run-live-scan-btn"
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-indigo-900/30 transition disabled:opacity-50"
          >
            {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isSimulating ? 'Analyzing in Security Pipeline...' : 'Inject & Scan Email'}</span>
          </button>
        </div>

        {/* Live Simulation Result Display */}
        {simResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white">Pipeline Execution Verdict</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                  simResult.quarantined
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {simResult.quarantined ? 'QUARANTINED BY ZERO-TRUST' : 'DELIVERED TO INBOX'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Classification</span>
                <span className="font-bold text-white font-mono">{simResult.email.securityAnalysis.classification}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">Risk Score</span>
                <span className="font-bold text-rose-400 font-mono">{simResult.email.securityAnalysis.riskScore} / 100</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase">AI Priority</span>
                <span className="font-bold text-amber-400 font-mono">{simResult.email.aiAnalysis.priority}</span>
              </div>
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
            <h3 className="text-base font-bold text-white">Connect Email Mailbox</h3>
            <p className="text-xs text-slate-400">
              Add a personal, academic, or work inbox. (Mailbox {accounts.length + 1} of 10 limit)
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProvider('gmail')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      newProvider === 'gmail'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Google Gmail
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProvider('outlook')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      newProvider === 'outlook'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Microsoft Outlook
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. user@domain.com"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Display Label (Optional)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Work Mailbox, University Thesis"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">Requested OAuth Scopes:</span>
                <span className="font-mono text-cyan-400 block">
                  {newProvider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.readonly' : 'Mail.Read offline_access'}
                </span>
                <span>Requires no write or delete authority.</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={!newEmail.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-40"
              >
                Authorize Mailbox
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
