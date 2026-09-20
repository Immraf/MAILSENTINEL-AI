import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  Clock,
  Shield,
  Check,
  Flame,
  Eye,
  Search,
  Filter,
  CheckCircle2,
  Mail,
  ChevronRight,
  Sparkles,
  Inbox,
} from 'lucide-react';
import { Email, EmailAccount } from '../types';

interface NeedsAttentionViewProps {
  emails: Email[];
  accounts: EmailAccount[];
  onOpenEmail: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onMarkImportant?: (id: string) => void;
}

export const NeedsAttentionView: React.FC<NeedsAttentionViewProps> = ({
  emails,
  accounts,
  onOpenEmail,
  onMarkRead,
  onMarkImportant,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'Critical' | 'High' | 'Security'>('all');

  const getPriorityReason = (e: Email): string => {
    if (e.securityAnalysis.classification === 'PHISHING' || e.securityAnalysis.classification === 'MALICIOUS') {
      return 'Potential security threat detected';
    }
    if (e.securityAnalysis.classification === 'SUSPICIOUS') {
      return 'Suspicious sender or unverified domain';
    }
    if (e.aiAnalysis.deadline) {
      return `Target deadline: ${e.aiAnalysis.deadline}`;
    }
    if (e.aiAnalysis.actionRequired && e.aiAnalysis.recommendedAction) {
      return `Action required: ${e.aiAnalysis.recommendedAction}`;
    }
    if (e.aiAnalysis.priority === 'Critical') {
      return 'Immediate response requested by sender';
    }
    if (e.aiAnalysis.priority === 'High') {
      return 'High priority communication';
    }
    return 'Actionable item';
  };

  const attentionEmails = useMemo(() => {
    return emails.filter((e) => {
      if (e.isArchived) return false;
      const isUrgent =
        e.aiAnalysis.priority === 'Critical' ||
        e.aiAnalysis.priority === 'High' ||
        Boolean(e.aiAnalysis.actionRequired) ||
        Boolean(e.aiAnalysis.deadline) ||
        e.securityAnalysis.classification === 'PHISHING' ||
        e.securityAnalysis.classification === 'MALICIOUS' ||
        e.securityAnalysis.classification === 'SUSPICIOUS';

      if (!isUrgent) return false;

      if (priorityFilter === 'Critical' && e.aiAnalysis.priority !== 'Critical') return false;
      if (priorityFilter === 'High' && e.aiAnalysis.priority !== 'High') return false;
      if (priorityFilter === 'Security') {
        const isThreat =
          e.securityAnalysis.classification === 'PHISHING' ||
          e.securityAnalysis.classification === 'MALICIOUS' ||
          e.securityAnalysis.classification === 'SUSPICIOUS';
        if (!isThreat) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          e.subject.toLowerCase().includes(q) ||
          e.senderName.toLowerCase().includes(q) ||
          e.aiAnalysis.summary.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [emails, priorityFilter, searchQuery]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Needs Your Attention</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                AI-curated communications requiring a decision, answer, deadline response, or security review.
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          {(['all', 'Critical', 'High', 'Security'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setPriorityFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                priorityFilter === filter
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Total Count */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="text-xs text-slate-400 font-mono">
          Showing <span className="text-white font-bold">{attentionEmails.length}</span> items requiring attention
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search attention items..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Item List */}
      <div className="space-y-3">
        {attentionEmails.length === 0 ? (
          <div className="py-20 text-center rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <h3 className="text-base font-bold text-white">No items need your attention right now</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your inboxes are clear of pressing tasks, urgent requests, and unresolved security flags.
            </p>
          </div>
        ) : (
          attentionEmails.map((item) => {
            const reason = getPriorityReason(item);
            const isThreat =
              item.securityAnalysis.classification === 'PHISHING' ||
              item.securityAnalysis.classification === 'MALICIOUS' ||
              item.securityAnalysis.classification === 'SUSPICIOUS';

            return (
              <div
                key={item.id}
                id={`needs-attention-${item.id}`}
                onClick={() => onOpenEmail(item.id)}
                className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group ${
                  isThreat
                    ? 'bg-rose-950/10 border-rose-800/40 hover:border-rose-700/60'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Details */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-sm">
                    {item.senderName ? item.senderName[0].toUpperCase() : 'M'}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-xs text-white truncate max-w-[200px]">
                        {item.senderName}
                      </span>

                      {/* Account badge */}
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                        {item.accountEmail}
                      </span>

                      {/* Priority */}
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          item.aiAnalysis.priority === 'Critical'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {item.aiAnalysis.priority}
                      </span>

                      {/* Security Status */}
                      {isThreat && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5" />
                          <span>{item.securityAnalysis.classification}</span>
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition">
                      {item.subject}
                    </h4>

                    {/* AI Summary snippet */}
                    <p className="text-xs text-slate-400 line-clamp-1">
                      {item.aiAnalysis.summary}
                    </p>

                    {/* Reason pill & Deadline */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Reason: {reason}
                      </span>

                      {item.aiAnalysis.deadline && (
                        <span className="text-xs text-slate-300 flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                          <Clock className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Due: {item.aiAnalysis.deadline}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-2 shrink-0 self-end md:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onOpenEmail(item.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-xs transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Open Details</span>
                  </button>

                  {onMarkImportant && (
                    <button
                      onClick={() => onMarkImportant(item.id)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Mark as Important"
                    >
                      <Flame className="w-4 h-4 text-amber-400" />
                    </button>
                  )}

                  {onMarkRead && (
                    <button
                      onClick={() => onMarkRead(item.id)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Mark as Read"
                    >
                      <Check className="w-4 h-4 text-emerald-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
