import React, { useMemo } from 'react';
import {
  Inbox,
  AlertCircle,
  Clock,
  Sparkles,
  Shield,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Flame,
  Check,
  Eye,
  RefreshCw,
  Mail,
  AlertTriangle,
  ArrowRight,
  FileText,
  User,
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
  onMarkRead?: (id: string) => void;
  onMarkImportant?: (id: string) => void;
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
  onMarkRead,
  onMarkImportant,
}) => {
  // Determine time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Summary counts
  const criticalEmails = emails.filter((e) => e.aiAnalysis.priority === 'Critical');
  const importantEmails = emails.filter(
    (e) => e.aiAnalysis.priority === 'High' || e.tags?.includes('important')
  );
  const unreadEmails = emails.filter((e) => !e.isRead);
  const emailsWithDeadlines = emails.filter((e) => e.aiAnalysis.deadline);
  
  // Extract all task entities
  const allTasks: Array<{ task: string; emailId: string; subject: string; deadline?: string }> = [];
  emails.forEach((e) => {
    e.aiAnalysis.extractedEntities
      ?.filter((ent) => ent.type === 'task')
      .forEach((ent) => {
        allTasks.push({
          task: ent.value,
          emailId: e.id,
          subject: e.subject,
          deadline: e.aiAnalysis.deadline,
        });
      });
  });

  const securityAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  // Needs Attention items
  const needsAttentionList = useMemo(() => {
    return emails
      .filter((e) => {
        if (e.isArchived) return false;
        return (
          e.aiAnalysis.priority === 'Critical' ||
          e.aiAnalysis.priority === 'High' ||
          e.aiAnalysis.actionRequired ||
          e.aiAnalysis.deadline ||
          e.securityAnalysis.classification === 'PHISHING' ||
          e.securityAnalysis.classification === 'MALICIOUS' ||
          e.securityAnalysis.classification === 'SUSPICIOUS'
        );
      })
      .slice(0, 5);
  }, [emails]);

  // Helper to determine reason for priority
  const getPriorityReason = (e: Email): string => {
    if (e.securityAnalysis.classification === 'PHISHING' || e.securityAnalysis.classification === 'MALICIOUS') {
      return 'Potential security threat detected';
    }
    if (e.securityAnalysis.classification === 'SUSPICIOUS') {
      return 'Suspicious sender or link';
    }
    if (e.aiAnalysis.deadline) {
      return `Target deadline: ${e.aiAnalysis.deadline}`;
    }
    if (e.aiAnalysis.actionRequired && e.aiAnalysis.recommendedAction) {
      return `Action: ${e.aiAnalysis.recommendedAction}`;
    }
    if (e.aiAnalysis.priority === 'Critical') {
      return 'Critical sender or immediate response required';
    }
    if (e.aiAnalysis.priority === 'High') {
      return 'High priority communication';
    }
    return 'Requires review';
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto text-slate-100">
      {/* Top Welcome Header - Productivity First */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {greeting}, Alex
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
              DEMO MODE
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Here&apos;s what needs your attention across your {accounts.length} connected mailboxes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="dashboard-open-inbox-btn"
            onClick={() => onNavigateToView('inbox')}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-xs transition"
          >
            <Inbox className="w-4 h-4" />
            <span>Open Inbox</span>
          </button>
          <button
            id="dashboard-ask-ai-btn"
            onClick={() => onNavigateToView('ask_ai')}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Ask MailSentinel</span>
          </button>
        </div>
      </div>

      {/* 6 Clean Summary Productivity Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {/* Critical */}
        <button
          onClick={() => onNavigateToView('inbox')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-rose-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Critical</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 transition">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{criticalEmails.length}</span>
            <p className="text-[11px] text-rose-400 mt-0.5">High urgency</p>
          </div>
        </button>

        {/* Important */}
        <button
          onClick={() => onNavigateToView('inbox')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-amber-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Important</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{importantEmails.length}</span>
            <p className="text-[11px] text-amber-400 mt-0.5">Key updates</p>
          </div>
        </button>

        {/* Unread */}
        <button
          onClick={() => onNavigateToView('inbox')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-indigo-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Unread</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition">
              <Mail className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{unreadEmails.length}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">In mailboxes</p>
          </div>
        </button>

        {/* Upcoming Deadlines */}
        <button
          onClick={() => onNavigateToView('deadlines')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-cyan-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Deadlines</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{emailsWithDeadlines.length}</span>
            <p className="text-[11px] text-cyan-400 mt-0.5">Tracked dates</p>
          </div>
        </button>

        {/* Tasks */}
        <button
          onClick={() => onNavigateToView('deadlines')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-emerald-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Action Tasks</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{allTasks.length}</span>
            <p className="text-[11px] text-emerald-400 mt-0.5">To complete</p>
          </div>
        </button>

        {/* Security Alerts */}
        <button
          onClick={() => onNavigateToView('security_center')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-rose-500/40 hover:bg-slate-900 transition flex flex-col justify-between text-left group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Security Alerts</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 transition">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white font-mono">{securityAlertsCount}</span>
            <p className="text-[11px] text-rose-400 mt-0.5">Isolated threats</p>
          </div>
        </button>
      </div>

      {/* AI Daily Briefing Banner with Clickable Action Items */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/30 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">AI Daily Briefing</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              REAL-TIME SYNTHESIS
            </span>
          </div>

          <button
            onClick={onRefreshSummary}
            disabled={isLoadingSummary}
            className="self-start sm:self-auto px-2.5 py-1 text-xs text-indigo-300 hover:text-white flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSummary ? 'animate-spin' : ''}`} />
            <span>{isLoadingSummary ? 'Updating briefing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Dynamic Conversational Briefing */}
        <p className="text-xs text-slate-300 leading-relaxed">
          {dailySummary ||
            `You have ${needsAttentionList.length} emails requiring attention today, ${emailsWithDeadlines.length} upcoming deadlines, and ${securityAlertsCount} security alerts neutralized.`}
        </p>

        {/* Clickable Quick Jump Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[11px] text-slate-400 font-medium">Quick Jumps:</span>
          {needsAttentionList.slice(0, 3).map((item) => (
            <button
              key={item.id}
              onClick={() => onOpenEmail(item.id)}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 flex items-center gap-1.5 transition text-[11px]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="max-w-[160px] truncate">{item.senderName}: {item.subject}</span>
            </button>
          ))}
          {emailsWithDeadlines[0] && (
            <button
              onClick={() => onOpenEmail(emailsWithDeadlines[0].id)}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-cyan-300 flex items-center gap-1.5 transition text-[11px]"
            >
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Next Deadline: {emailsWithDeadlines[0].aiAnalysis.deadline}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Needs Your Attention & Tasks / Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Needs Your Attention (Primary Section) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">Needs Your Attention</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                {needsAttentionList.length}
              </span>
            </div>

            <button
              onClick={() => onNavigateToView('needs_attention')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* List of Needs Attention Items */}
          <div className="space-y-3">
            {needsAttentionList.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="text-sm font-medium text-white">All caught up!</p>
                <p className="text-xs">No emails currently require urgent attention.</p>
              </div>
            ) : (
              needsAttentionList.map((item) => {
                const priorityReason = getPriorityReason(item);
                const isThreat =
                  item.securityAnalysis.classification === 'PHISHING' ||
                  item.securityAnalysis.classification === 'MALICIOUS' ||
                  item.securityAnalysis.classification === 'SUSPICIOUS';

                return (
                  <div
                    key={item.id}
                    id={`attention-item-${item.id}`}
                    onClick={() => onOpenEmail(item.id)}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${
                      isThreat
                        ? 'bg-rose-950/10 border-rose-800/40 hover:border-rose-700/60'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Left details */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Avatar Circle */}
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs">
                        {item.senderName ? item.senderName[0].toUpperCase() : 'M'}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate max-w-[180px]">
                            {item.senderName}
                          </span>

                          {/* Account badge */}
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                            {item.provider === 'gmail' ? 'Gmail' : 'Outlook'}
                          </span>

                          {/* Priority badge */}
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              item.aiAnalysis.priority === 'Critical'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {item.aiAnalysis.priority}
                          </span>

                          {/* Security Status badge */}
                          {isThreat && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                              <Shield className="w-2.5 h-2.5" />
                              <span>{item.securityAnalysis.classification}</span>
                            </span>
                          )}
                        </div>

                        {/* Subject */}
                        <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition">
                          {item.subject}
                        </h4>

                        {/* AI Summary snippet */}
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {item.aiAnalysis.summary}
                        </p>

                        {/* Reason for Priority Pill */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                            <span>Why: {priorityReason}</span>
                          </span>

                          {item.aiAnalysis.deadline && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>Due: {item.aiAnalysis.deadline}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right action buttons */}
                    <div
                      className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onOpenEmail(item.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1"
                        title="Open email detail"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Open</span>
                      </button>

                      {onMarkImportant && (
                        <button
                          onClick={() => onMarkImportant(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Mark important"
                        >
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                      )}

                      {onMarkRead && (
                        <button
                          onClick={() => onMarkRead(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Upcoming Deadlines & Tasks & Accounts */}
        <div className="space-y-6">
          {/* Upcoming Deadlines & Tasks */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Upcoming Tasks & Deadlines</h3>
              </div>
              <button
                onClick={() => onNavigateToView('deadlines')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
              >
                View All
              </button>
            </div>

            <div className="space-y-2.5">
              {emailsWithDeadlines.length === 0 && allTasks.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  No upcoming deadlines detected in your inbox.
                </div>
              ) : (
                <>
                  {emailsWithDeadlines.slice(0, 3).map((item) => (
                    <div
                      key={`dl-${item.id}`}
                      onClick={() => onOpenEmail(item.id)}
                      className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 cursor-pointer transition space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white truncate max-w-[150px]">
                          {item.senderName}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.2 rounded border border-cyan-800/40">
                          {item.aiAnalysis.deadline}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">{item.subject}</p>
                    </div>
                  ))}

                  {allTasks.slice(0, 2).map((task, idx) => (
                    <div
                      key={`t-${task.emailId}-${idx}`}
                      onClick={() => onOpenEmail(task.emailId)}
                      className="p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 cursor-pointer transition flex items-start gap-2 text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-200 line-clamp-1">{task.task}</p>
                        <span className="text-[10px] text-slate-500 truncate block">From: {task.subject}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Connected Mailboxes Summary */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Connected Accounts</h3>
              </div>
              <button
                onClick={() => onNavigateToView('accounts')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
              >
                Manage
              </button>
            </div>

            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        acc.provider === 'gmail'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {acc.provider === 'gmail' ? 'G' : 'O'}
                    </div>
                    <div className="truncate">
                      <p className="font-medium text-white truncate">{acc.displayName}</p>
                      <p className="text-[10px] text-slate-400 truncate">{acc.emailAddress}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
