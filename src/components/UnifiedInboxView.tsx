import React, { useState } from 'react';
import {
  Search,
  Filter,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  Clock,
  Mail,
  Archive,
  Eye,
  Check,
  ChevronDown,
  X,
} from 'lucide-react';
import { Email, EmailAccount, EmailCategory, PriorityLevel, SecurityClassification } from '../types';

interface UnifiedInboxViewProps {
  emails: Email[];
  accounts: EmailAccount[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  onOpenEmail: (id: string) => void;
  onToggleRead: (id: string, current: boolean) => void;
  onArchive: (id: string) => void;
  onQuarantine: (id: string) => void;
  filterMode?: 'all' | 'needs_attention' | 'unread' | 'threats' | 'important';
}

export const UnifiedInboxView: React.FC<UnifiedInboxViewProps> = ({
  emails,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onOpenEmail,
  onToggleRead,
  onArchive,
  onQuarantine,
  filterMode = 'all',
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [securityFilter, setSecurityFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [hasAttachmentOnly, setHasAttachmentOnly] = useState(false);
  const [actionRequiredOnly, setActionRequiredOnly] = useState(false);
  const [subView, setSubView] = useState<'all' | 'needs_attention' | 'unread' | 'threats' | 'important'>(filterMode);

  // Filter pipeline
  const filtered = emails.filter((e) => {
    // 1. Account
    if (selectedAccountId !== 'all' && e.accountId !== selectedAccountId) return false;

    // 2. Subview filter
    if (subView === 'needs_attention' && !e.aiAnalysis.actionRequired) return false;
    if (subView === 'unread' && e.isRead) return false;
    if (subView === 'threats' && e.securityAnalysis.classification === 'SAFE') return false;
    if (subView === 'important' && e.aiAnalysis.priority !== 'Critical' && e.aiAnalysis.priority !== 'High')
      return false;

    // 3. Dropdowns
    if (categoryFilter !== 'all' && e.aiAnalysis.category !== categoryFilter) return false;
    if (securityFilter !== 'all' && e.securityAnalysis.classification !== securityFilter) return false;
    if (priorityFilter !== 'all' && e.aiAnalysis.priority !== priorityFilter) return false;
    if (hasAttachmentOnly && !e.hasAttachment) return false;
    if (actionRequiredOnly && !e.aiAnalysis.actionRequired) return false;

    // 4. Search
    if (localSearch.trim() !== '') {
      const q = localSearch.toLowerCase();
      const matches =
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.senderName.toLowerCase().includes(q) ||
        e.bodySnippet.toLowerCase().includes(q) ||
        e.aiAnalysis.summary.toLowerCase().includes(q);
      if (!matches) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
      {/* Top Filter and Search Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* SubView Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Mail' },
              { id: 'needs_attention', label: 'Needs Attention' },
              { id: 'unread', label: 'Unread' },
              { id: 'threats', label: 'Threats & Phishing' },
              { id: 'important', label: 'Important' },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`subview-tab-${tab.id}`}
                onClick={() => setSubView(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                  subView === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search sender, subject, summary..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-500"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2 top-2 text-xs text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Multi-Dimensional Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            Filters:
          </span>

          {/* Account Filter */}
          <select
            id="filter-account-select"
            value={selectedAccountId}
            onChange={(e) => onSelectAccount(e.target.value)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
          >
            <option value="all">All Accounts ({accounts.length})</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.provider.toUpperCase()})
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            id="filter-category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="financial">Financial</option>
            <option value="academic">Academic</option>
            <option value="career">Career</option>
            <option value="business">Business</option>
            <option value="personal">Personal</option>
            <option value="security">Security</option>
            <option value="newsletter">Newsletter</option>
          </select>

          {/* Security Status Filter */}
          <select
            id="filter-security-select"
            value={securityFilter}
            onChange={(e) => setSecurityFilter(e.target.value)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
          >
            <option value="all">All Security Statuses</option>
            <option value="SAFE">Safe</option>
            <option value="SUSPICIOUS">Suspicious</option>
            <option value="PHISHING">Phishing</option>
            <option value="MALICIOUS">Malicious</option>
          </select>

          {/* Priority Filter */}
          <select
            id="filter-priority-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-hidden"
          >
            <option value="all">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Attachments toggle */}
          <button
            id="filter-has-attachment-btn"
            onClick={() => setHasAttachmentOnly(!hasAttachmentOnly)}
            className={`px-2 py-1 rounded text-xs border transition flex items-center gap-1 ${
              hasAttachmentOnly
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Paperclip className="w-3 h-3" />
            <span>Has Attachment</span>
          </button>

          {/* Reset Filters */}
          {(categoryFilter !== 'all' ||
            securityFilter !== 'all' ||
            priorityFilter !== 'all' ||
            hasAttachmentOnly ||
            localSearch) && (
            <button
              onClick={() => {
                setCategoryFilter('all');
                setSecurityFilter('all');
                setPriorityFilter('all');
                setHasAttachmentOnly(false);
                setLocalSearch('');
              }}
              className="text-[11px] text-rose-400 hover:underline px-2 py-0.5"
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto text-[11px] text-slate-400 font-mono">
            Showing {filtered.length} of {emails.length} messages
          </div>
        </div>
      </div>

      {/* Email List Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Mail className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm font-medium">No messages matched the specified criteria.</p>
            <p className="text-xs text-slate-400">Try loosening your search filters or selected mailbox.</p>
          </div>
        ) : (
          filtered.map((e) => {
            const isPhishing = e.securityAnalysis.classification === 'PHISHING';
            const isMalicious = e.securityAnalysis.classification === 'MALICIOUS';
            const isSuspicious = e.securityAnalysis.classification === 'SUSPICIOUS';

            return (
              <div
                key={e.id}
                id={`email-item-${e.id}`}
                onClick={() => onOpenEmail(e.id)}
                className={`p-4 transition cursor-pointer hover:bg-slate-900/80 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  !e.isRead ? 'bg-slate-900/40 font-medium' : 'bg-transparent'
                } ${isPhishing || isMalicious ? 'border-l-4 border-l-rose-500' : ''} ${
                  isSuspicious ? 'border-l-4 border-l-amber-500' : ''
                }`}
              >
                {/* Left: Sender & Metadata */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Read / Unread bullet */}
                  <button
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onToggleRead(e.id, e.isRead);
                    }}
                    title={e.isRead ? 'Mark unread' : 'Mark read'}
                    className="mt-1 p-0.5 text-slate-400 hover:text-cyan-400 transition shrink-0"
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        !e.isRead ? 'bg-cyan-400 shadow-sm shadow-cyan-400/50' : 'border border-slate-600'
                      }`}
                    />
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Sender Name */}
                      <span className="font-bold text-slate-100 truncate max-w-[200px]">
                        {e.senderName || e.sender}
                      </span>

                      {/* Account badge */}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60">
                        {e.provider.toUpperCase()} • {e.accountEmail}
                      </span>

                      {/* Priority Badge */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          e.aiAnalysis.priority === 'Critical'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : e.aiAnalysis.priority === 'High'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : e.aiAnalysis.priority === 'Medium'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {e.aiAnalysis.priority}
                      </span>

                      {/* Category Badge */}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-cyan-300 border border-slate-700">
                        {e.aiAnalysis.category}
                      </span>

                      {/* Security Badge */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          isPhishing || isMalicious
                            ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 animate-pulse'
                            : isSuspicious
                            ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        <span>{e.securityAnalysis.classification}</span>
                      </span>

                      {/* Attachment indicator */}
                      {e.hasAttachment && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono bg-slate-800 px-1 py-0.5 rounded border border-slate-700">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>ATTACHMENT</span>
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h3 className="text-sm font-semibold text-slate-200 truncate">{e.subject}</h3>

                    {/* AI Summary / Snippet */}
                    <p className="text-xs text-slate-400 line-clamp-1 leading-normal">
                      <span className="text-slate-500 font-medium">AI Summary:</span> {e.aiAnalysis.summary}
                    </p>

                    {/* Recommended Action / Deadline pill */}
                    {e.aiAnalysis.actionRequired && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                        <span className="text-amber-400 font-medium">
                          Action: {e.aiAnalysis.recommendedAction}
                        </span>
                        {e.aiAnalysis.deadline && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Due: {e.aiAnalysis.deadline}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Timestamp & Controlled Actions */}
                <div className="flex items-center gap-2 md:flex-col md:items-end justify-between shrink-0">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(e.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onArchive(e.id);
                      }}
                      title="Archive Email"
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    {!e.isQuarantined && (
                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          onQuarantine(e.id);
                        }}
                        title="Move to Quarantine"
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
