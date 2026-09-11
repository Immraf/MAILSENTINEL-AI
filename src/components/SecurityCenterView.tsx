import React, { useState } from 'react';
import {
  ShieldAlert,
  Archive,
  Sliders,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Lock,
  Unlock,
  Plus,
  Search,
  ExternalLink,
  Shield,
  ShieldCheck,
  FileWarning,
  Eye,
  Check,
} from 'lucide-react';
import {
  AuditLogEntry,
  AutomationRule,
  Email,
  QuarantineItem,
  SecurityAlert,
  SecuritySettings,
} from '../types';

interface SecurityCenterViewProps {
  emails: Email[];
  quarantineItems: QuarantineItem[];
  alerts: SecurityAlert[];
  auditLogs: AuditLogEntry[];
  automationRules: AutomationRule[];
  settings: SecuritySettings;
  onOpenEmail: (id: string) => void;
  onReleaseQuarantine: (emailId: string) => void;
  onDeleteQuarantined: (id: string) => void;
  onAddWhitelist: (val: string, type: 'domain' | 'email') => void;
  onRemoveWhitelist: (id: string) => void;
  onAddBlacklist: (val: string, type: 'domain' | 'email') => void;
  onRemoveBlacklist: (id: string) => void;
  onToggleRule: (ruleId: string) => void;
  onAddRule: (rule: Partial<AutomationRule>) => void;
  onRequestConfirm: (params: {
    title: string;
    description: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }) => void;
  initialSubTab?: 'quarantine' | 'telemetry' | 'rules' | 'audit';
}

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({
  emails,
  quarantineItems,
  alerts,
  auditLogs,
  automationRules,
  settings,
  onOpenEmail,
  onReleaseQuarantine,
  onDeleteQuarantined,
  onAddWhitelist,
  onRemoveWhitelist,
  onAddBlacklist,
  onRemoveBlacklist,
  onToggleRule,
  onAddRule,
  onRequestConfirm,
  initialSubTab = 'quarantine',
}) => {
  const [activeTab, setActiveTab] = useState<'quarantine' | 'telemetry' | 'rules' | 'audit'>(initialSubTab);

  // Whitelist / Blacklist state
  const [newWhiteVal, setNewWhiteVal] = useState('');
  const [newBlackVal, setNewBlackVal] = useState('');

  // New Rule state
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleCondition, setRuleCondition] = useState<'high_risk' | 'domain_mismatch' | 'macro_attachment' | 'financial_urgency'>('high_risk');
  const [ruleAction, setRuleAction] = useState<'quarantine' | 'notify_urgent' | 'flag_suspicious'>('quarantine');

  const totalScanned = emails.length;
  const safeCount = emails.filter((e) => e.securityAnalysis.classification === 'SAFE').length;
  const phishingCount = emails.filter((e) => e.securityAnalysis.classification === 'PHISHING').length;
  const suspiciousCount = emails.filter((e) => e.securityAnalysis.classification === 'SUSPICIOUS').length;
  const maliciousCount = emails.filter((e) => e.securityAnalysis.classification === 'MALICIOUS').length;

  const spfPassCount = emails.filter((e) => e.securityAnalysis.authResults.spf === 'PASS').length;
  const dkimPassCount = emails.filter((e) => e.securityAnalysis.authResults.dkim === 'PASS').length;
  const dmarcPassCount = emails.filter((e) => e.securityAnalysis.authResults.dmarc === 'PASS').length;

  const handleCreateRule = () => {
    if (!ruleName.trim()) return;
    onAddRule({
      name: ruleName,
      condition: ruleCondition,
      action: ruleAction,
      isActive: true,
      description: `Automatically trigger ${ruleAction} when condition ${ruleCondition} is met`,
    });
    setRuleName('');
    setShowNewRuleModal(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-100">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            <span>Security Center & Threat Quarantine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero-trust heuristics, heuristic quarantine isolation, automation rules, and live telemetry audit
          </p>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <button
            id="sec-tab-quarantine"
            onClick={() => setActiveTab('quarantine')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'quarantine' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Quarantine</span>
            {quarantineItems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {quarantineItems.length}
              </span>
            )}
          </button>

          <button
            id="sec-tab-telemetry"
            onClick={() => setActiveTab('telemetry')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'telemetry' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Telemetry</span>
          </button>

          <button
            id="sec-tab-rules"
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'rules' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Rules & Lists</span>
          </button>

          <button
            id="sec-tab-audit"
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'audit' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>
      </div>

      {/* 1. Quarantine Tab */}
      {activeTab === 'quarantine' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Quarantined Messages ({quarantineItems.length})</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Isolated messages flagged as Phishing, Malicious attachments, or high-risk lookalike domains.
              </p>
            </div>
            <span className="text-xs font-mono text-rose-400 bg-rose-950/40 px-2 py-1 rounded border border-rose-800/40">
              STRICT ZERO-TRUST ENFORCED
            </span>
          </div>

          <div className="space-y-3">
            {quarantineItems.length === 0 ? (
              <div className="py-16 text-center text-slate-500 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="text-sm font-medium text-slate-300">Quarantine is currently empty.</p>
                <p className="text-xs text-slate-500">No active high-risk threats detected or isolated.</p>
              </div>
            ) : (
              quarantineItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        {item.threatType}
                      </span>
                      <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        Risk: {item.riskScore}/100
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Target: {item.accountEmail}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-200 truncate">{item.subject}</h4>
                    <p className="text-xs text-slate-400">
                      From: <span className="text-slate-300 font-medium">{item.sender}</span>
                    </p>
                    <p className="text-xs text-rose-400/90 font-medium">Flag Reason: {item.threatReason}</p>
                  </div>

                  {/* Quarantine Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onOpenEmail(item.emailId)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Investigate</span>
                    </button>

                    <button
                      onClick={() => {
                        onRequestConfirm({
                          title: `Release "${item.subject}" from Quarantine?`,
                          description:
                            'This will restore the message to the active inbox. Verify the sender before taking action.',
                          onConfirm: () => onReleaseQuarantine(item.emailId),
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Release</span>
                    </button>

                    <button
                      onClick={() => {
                        onRequestConfirm({
                          title: `Permanently Delete Quarantined Message?`,
                          description: 'This will permanently remove this isolated threat from local telemetry.',
                          isDestructive: true,
                          onConfirm: () => onDeleteQuarantined(item.id),
                        });
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                      title="Delete Permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Telemetry Tab */}
      {activeTab === 'telemetry' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">SPF Authentication Rate</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {Math.round((spfPassCount / (totalScanned || 1)) * 100)}%
              </div>
              <p className="text-[11px] text-slate-400">{spfPassCount} passed out of {totalScanned} messages</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">DKIM Signature Validity</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {Math.round((dkimPassCount / (totalScanned || 1)) * 100)}%
              </div>
              <p className="text-[11px] text-slate-400">{dkimPassCount} cryptographic signatures verified</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">DMARC Policy Compliance</span>
              <div className="text-2xl font-bold font-mono text-cyan-400">
                {Math.round((dmarcPassCount / (totalScanned || 1)) * 100)}%
              </div>
              <p className="text-[11px] text-slate-400">{dmarcPassCount} passed alignment and enforcement</p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Cumulative Detection Telemetry</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400">Safe Scans</span>
                <p className="text-xl font-bold text-emerald-400 font-mono mt-1">{safeCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400">Suspicious Anomaly</span>
                <p className="text-xl font-bold text-amber-400 font-mono mt-1">{suspiciousCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400">Phishing Attempts</span>
                <p className="text-xl font-bold text-rose-400 font-mono mt-1">{phishingCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400">Malicious Payloads</span>
                <p className="text-xl font-bold text-purple-400 font-mono mt-1">{maliciousCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Rules & Whitelist Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Automation Rules */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Automated Security & Handling Rules</h3>
                <p className="text-xs text-slate-400">Autonomous processing triggers based on risk heuristics</p>
              </div>
              <button
                id="add-custom-rule-btn"
                onClick={() => setShowNewRuleModal(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Rule</span>
              </button>
            </div>

            <div className="space-y-2">
              {automationRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{rule.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-cyan-400">
                        IF: {rule.condition} → THEN: {rule.action}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{rule.description}</p>
                  </div>

                  <button
                    onClick={() => onToggleRule(rule.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      rule.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {rule.isActive ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Whitelist and Blacklist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Whitelist */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Whitelisted Senders & Domains</span>
                </h4>
                <span className="text-xs text-slate-400">{settings.whitelist.length} entries</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWhiteVal}
                  onChange={(e) => setNewWhiteVal(e.target.value)}
                  placeholder="e.g. partner-corp.com or ceo@safe.com"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden"
                />
                <button
                  onClick={() => {
                    if (!newWhiteVal.trim()) return;
                    onAddWhitelist(newWhiteVal.trim(), newWhiteVal.includes('@') ? 'email' : 'domain');
                    setNewWhiteVal('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {settings.whitelist.map((w) => (
                  <div
                    key={w.id}
                    className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-slate-200">{w.value}</span>
                    <button
                      onClick={() => onRemoveWhitelist(w.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Blacklist */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                  <FileWarning className="w-4 h-4" />
                  <span>Blocked Domains & Senders</span>
                </h4>
                <span className="text-xs text-slate-400">{settings.blacklist.length} entries</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlackVal}
                  onChange={(e) => setNewBlackVal(e.target.value)}
                  placeholder="e.g. evil-phish.biz or spammer@bad.org"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden"
                />
                <button
                  onClick={() => {
                    if (!newBlackVal.trim()) return;
                    onAddBlacklist(newBlackVal.trim(), newBlackVal.includes('@') ? 'email' : 'domain');
                    setNewBlackVal('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
                >
                  Block
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {settings.blacklist.map((b) => (
                  <div
                    key={b.id}
                    className="p-2 rounded-lg bg-rose-950/20 border border-rose-800/40 flex items-center justify-between text-xs font-mono text-rose-300"
                  >
                    <span>{b.value}</span>
                    <button
                      onClick={() => onRemoveBlacklist(b.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">System Security & Operation Audit Trail</h3>
              <p className="text-xs text-slate-400">Immutable ledger of scans, quarantine actions, and sync events</p>
            </div>
            <span className="text-xs font-mono text-cyan-400">{auditLogs.length} events logged</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 flex items-start justify-between gap-4 text-xs"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{log.action}</span>
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.2 rounded ${
                        log.severity === 'critical'
                          ? 'bg-rose-500/20 text-rose-300'
                          : log.severity === 'high'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {log.severity}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">{log.details}</p>
                </div>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Rule Modal Dialog */}
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-5 space-y-4 text-slate-100 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create Security Automation Rule</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Isolate High-Risk Invoices"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Trigger Condition</label>
                <select
                  value={ruleCondition}
                  onChange={(e) => setRuleCondition(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="high_risk">Risk Score &gt; 80 / 100</option>
                  <option value="domain_mismatch">Sender Display Name Lookalike Mismatch</option>
                  <option value="macro_attachment">Executable / Script Attachment Present</option>
                  <option value="financial_urgency">Urgent Wire / Bank Transfer Request</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Autonomous Action</label>
                <select
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="quarantine">Move Directly to Quarantine</option>
                  <option value="notify_urgent">Dispatch Urgent Security Alert</option>
                  <option value="flag_suspicious">Mark with Amber Suspicious Flag</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowNewRuleModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRule}
                disabled={!ruleName.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
