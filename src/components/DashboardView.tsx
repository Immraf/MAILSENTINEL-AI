import React, { useState } from 'react';
import {
  ShieldAlert,
  Inbox,
  AlertTriangle,
  MailCheck,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
  FileWarning,
  Flame,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Email, EmailAccount, SecurityAlert } from '../types';

interface DashboardViewProps {
  emails: Email[];
  accounts: EmailAccount[];
  alerts: SecurityAlert[];
  dailySummary: string;
  onRefreshSummary: () => void;
  isLoadingSummary: boolean;
  onOpenEmail: (id: string) => void;
  onNavigateToView: (view: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  emails,
  accounts,
  alerts,
  dailySummary,
  onRefreshSummary,
  isLoadingSummary,
  onOpenEmail,
  onNavigateToView,
}) => {
  const totalEmails = emails.length;
  const unreadEmails = emails.filter((e) => !e.isRead).length;
  const criticalEmails = emails.filter((e) => e.aiAnalysis.priority === 'Critical').length;
  const highPriorityEmails = emails.filter((e) => e.aiAnalysis.priority === 'High').length;
  const actionRequiredEmails = emails.filter((e) => e.aiAnalysis.actionRequired);
  const threats = emails.filter(
    (e) =>
      e.securityAnalysis.classification === 'PHISHING' ||
      e.securityAnalysis.classification === 'MALICIOUS' ||
      e.securityAnalysis.classification === 'SUSPICIOUS'
  );
  const safeEmails = emails.filter((e) => e.securityAnalysis.classification === 'SAFE').length;
  const phishingCount = emails.filter((e) => e.securityAnalysis.classification === 'PHISHING').length;
  const suspiciousCount = emails.filter((e) => e.securityAnalysis.classification === 'SUSPICIOUS').length;
  const maliciousCount = emails.filter((e) => e.securityAnalysis.classification === 'MALICIOUS').length;

  const emailsWithDeadlines = emails
    .filter((e) => e.aiAnalysis.deadline)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Welcome & Health Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>MailSentinel Intelligence & Telemetry</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
              ALL SYSTEMS SECURE
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time unified synthesis across {accounts.length} active mailboxes. Autonomous zero-trust heuristics enabled.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="view-all-inbox-btn"
            onClick={() => onNavigateToView('inbox')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Inbox className="w-3.5 h-3.5 text-indigo-400" />
            <span>Open Unified Inbox</span>
          </button>
          <button
            id="view-security-center-btn"
            onClick={() => onNavigateToView('security_center')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-950/50 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-800/60 flex items-center gap-1.5 transition"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span>Security Center</span>
          </button>
        </div>
      </div>

      {/* 4 Primary High-Level Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Scanned */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Scanned Messages</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{totalEmails}</span>
            <span className="text-[11px] text-slate-400">({unreadEmails} unread)</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{safeEmails} verified safe</span>
          </div>
        </div>

        {/* Needs Attention */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Needs Attention</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-300 font-mono">{actionRequiredEmails.length}</span>
            <span className="text-[11px] text-slate-400">emails with actions</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400/90 flex items-center gap-1">
            <span>{criticalEmails} Critical • {highPriorityEmails} High Priority</span>
          </div>
        </div>

        {/* Threats Neutralized */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Threats Neutralized</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">{threats.length}</span>
            <span className="text-[11px] text-slate-400">quarantined</span>
          </div>
          <div className="mt-2 text-[11px] text-rose-400 flex items-center gap-1">
            <FileWarning className="w-3 h-3" />
            <span>{phishingCount} Phishing • {maliciousCount} Malware</span>
          </div>
        </div>

        {/* Connected Mailboxes */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Connected Accounts</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <MailCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{accounts.length} / 10</span>
            <span className="text-[11px] text-slate-400">max capacity</span>
          </div>
          <div className="mt-2 text-[11px] text-cyan-400 flex items-center gap-1">
            <span>Gmail ({accounts.filter((a) => a.provider === 'gmail').length}) • Outlook ({accounts.filter((a) => a.provider === 'outlook').length})</span>
          </div>
        </div>
      </div>

      {/* AI Daily Executive Briefing */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/20 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">AI Daily Intelligence & Security Briefing</h3>
              <p className="text-[11px] text-slate-400">Multi-mailbox synthesis generated by Gemini</p>
            </div>
          </div>
          <button
            id="refresh-daily-summary-btn"
            onClick={onRefreshSummary}
            disabled={isLoadingSummary}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/40 rounded-lg border border-indigo-800/40 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSummary ? 'animate-spin' : ''}`} />
            <span>{isLoadingSummary ? 'Regenerating...' : 'Refresh Briefing'}</span>
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-300 leading-relaxed space-y-2">
          {dailySummary ? (
            <p className="whitespace-pre-line">{dailySummary}</p>
          ) : (
            <p className="text-slate-400 italic">Synthesizing cross-account intelligence and threat signals...</p>
          )}
        </div>
      </div>

      {/* Split Section: Security Telemetry Breakdown & Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Security Telemetry Breakdown */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Security Telemetry & Heuristic Classification</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Sensitivity: Balanced</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Phishing Intercepts</span>
              <div className="mt-1 text-lg font-bold text-rose-400 font-mono">{phishingCount}</div>
              <span className="text-[10px] text-slate-400">Credential scams</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Suspicious Links</span>
              <div className="mt-1 text-lg font-bold text-amber-400 font-mono">{suspiciousCount}</div>
              <span className="text-[10px] text-slate-400">Domain anomalies</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Executables / Macros</span>
              <div className="mt-1 text-lg font-bold text-rose-300 font-mono">{maliciousCount}</div>
              <span className="text-[10px] text-slate-400">Double extensions</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Clean Messages</span>
              <div className="mt-1 text-lg font-bold text-emerald-400 font-mono">{safeEmails}</div>
              <span className="text-[10px] text-slate-400">SPF/DKIM/DMARC Pass</span>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Threat Distribution</span>
              <span>{Math.round(((phishingCount + maliciousCount + suspiciousCount) / (totalEmails || 1)) * 100)}% Flagged</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div
                style={{ width: `${(safeEmails / (totalEmails || 1)) * 100}%` }}
                className="bg-emerald-500 h-full"
                title={`Safe: ${safeEmails}`}
              />
              <div
                style={{ width: `${(suspiciousCount / (totalEmails || 1)) * 100}%` }}
                className="bg-amber-500 h-full"
                title={`Suspicious: ${suspiciousCount}`}
              />
              <div
                style={{ width: `${(phishingCount / (totalEmails || 1)) * 100}%` }}
                className="bg-rose-500 h-full"
                title={`Phishing: ${phishingCount}`}
              />
              <div
                style={{ width: `${(maliciousCount / (totalEmails || 1)) * 100}%` }}
                className="bg-purple-500 h-full"
                title={`Malicious: ${maliciousCount}`}
              />
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Safe ({safeEmails})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Suspicious ({suspiciousCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Phishing ({phishingCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Malicious ({maliciousCount})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Deadlines Radar */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Upcoming Deadlines</h3>
              </div>
              <button
                onClick={() => onNavigateToView('deadlines')}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-0.5"
              >
                <span>View all</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {emailsWithDeadlines.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center">No upcoming deadlines detected.</div>
              ) : (
                emailsWithDeadlines.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={() => onOpenEmail(e.id)}
                    className="p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 cursor-pointer transition"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold uppercase">
                        {e.aiAnalysis.category}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(e.receivedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-xs text-slate-200 truncate">{e.subject}</p>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300/90 font-medium">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span className="truncate">{e.aiAnalysis.deadline}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Deadlines automatically synced</span>
            <span className="font-mono text-cyan-400">{emailsWithDeadlines.length} scheduled</span>
          </div>
        </div>
      </div>

      {/* Needs Attention & Live Threats Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention List */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-white">Needs Immediate Attention</h3>
            </div>
            <span className="text-[11px] text-slate-400">{actionRequiredEmails.length} messages</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {actionRequiredEmails.slice(0, 4).map((e) => (
              <div
                key={e.id}
                onClick={() => onOpenEmail(e.id)}
                className="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 cursor-pointer transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                        e.aiAnalysis.priority === 'Critical'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {e.aiAnalysis.priority}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">{e.accountEmail}</span>
                  </div>
                  <h4 className="mt-1 text-xs font-semibold text-slate-200 truncate">{e.subject}</h4>
                  <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">{e.aiAnalysis.summary}</p>
                  <p className="mt-1 text-[11px] text-cyan-400 font-medium">→ {e.aiAnalysis.recommendedAction}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Live Threat Intercept Stream */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Live Threat Stream</h3>
            </div>
            <button
              onClick={() => onNavigateToView('quarantine')}
              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-0.5"
            >
              <span>Quarantine Manager</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {alerts.slice(0, 4).map((al) => (
              <div
                key={al.id}
                className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/30 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px] text-rose-300 uppercase tracking-wide">
                    {al.title}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(al.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">{al.description}</p>
                <div className="pt-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Target: {al.accountEmail}</span>
                  {al.emailId && (
                    <button
                      onClick={() => onOpenEmail(al.emailId!)}
                      className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-0.5"
                    >
                      <span>Investigate</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
