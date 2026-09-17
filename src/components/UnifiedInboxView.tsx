import React, { useState, useMemo } from 'react';
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
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'personal', label: 'Personal' },
  { id: 'academic', label: 'Academic' },
  { id: 'career', label: 'Career' },
  { id: 'business', label: 'Business' },
  { id: 'financial', label: 'Financial' },
  { id: 'government', label: 'Government' },
  { id: 'travel', label: 'Travel' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'social', label: 'Social' },
  { id: 'notification', label: 'Notification' },
  { id: 'security', label: 'Security' },
  { id: 'other', label: 'Other' },
];

const SECURITY_LEVELS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Security' },
  { id: 'SAFE', label: 'Safe' },
  { id: 'SUSPICIOUS', label: 'Suspicious' },
  { id: 'PHISHING', label: 'Phishing' },
  { id: 'SPAM', label: 'Spam' },
  { id: 'MALICIOUS', label: 'Malicious' },
];

const PRIORITIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All Priorities' },
  { id: 'Critical', label: 'Critical' },
  { id: 'High', label: 'High' },
  { id: 'Medium', label: 'Medium' },
  { id: 'Low', label: 'Low' },
];

type SortOption = 'newest' | 'oldest' | 'highest_priority' | 'needs_attention';

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
  const [accountFilter, setAccountFilter] = useState<string>(selectedAccountId);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [securityFilter, setSecurityFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [hasAttachmentOnly, setHasAttachmentOnly] = useState(false);
  const [subView, setSubView] = useState<'all' | 'needs_attention' | 'unread' | 'threats' | 'important'>(filterMode);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reset to page 1 on filter change
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setLocalSearch('');
    setCategoryFilter('all');
    setSecurityFilter('all');
    setPriorityFilter('all');
    setAccountFilter('all');
    setHasAttachmentOnly(false);
    setSubView('all');
    setSortBy('newest');
    setCurrentPage(1);
  };

  // Filter pipeline
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      // 1. Account Filter
      if (accountFilter === 'gmail' && e.provider !== 'gmail') return false;
      if (accountFilter === 'outlook' && e.provider !== 'outlook') return false;
      if (accountFilter !== 'all' && accountFilter !== 'gmail' && accountFilter !== 'outlook' && e.accountId !== accountFilter) {
        return false;
      }

      // 2. Subview quick pill
      if (subView === 'needs_attention') {
        const isUrgent =
          e.aiAnalysis.priority === 'Critical' ||
          e.aiAnalysis.priority === 'High' ||
          Boolean(e.aiAnalysis.actionRequired) ||
          Boolean(e.aiAnalysis.deadline) ||
          e.securityAnalysis.classification === 'PHISHING' ||
          e.securityAnalysis.classification === 'MALICIOUS' ||
          e.securityAnalysis.classification === 'SUSPICIOUS';
        if (!isUrgent) return false;
      }
      if (subView === 'unread' && e.isRead) return false;
      if (subView === 'threats' && e.securityAnalysis.classification === 'SAFE') return false;
      if (subView === 'important' && e.aiAnalysis.priority !== 'Critical' && e.aiAnalysis.priority !== 'High') return false;

      // 3. Category Filter
      if (categoryFilter !== 'all' && e.aiAnalysis.category !== categoryFilter) return false;

      // 4. Security Filter
      if (securityFilter !== 'all' && e.securityAnalysis.classification !== securityFilter) return false;

      // 5. Priority Filter
      if (priorityFilter !== 'all' && e.aiAnalysis.priority !== priorityFilter) return false;

      // 6. Attachment checkbox
      if (hasAttachmentOnly && !e.hasAttachment) return false;

      // 7. Search text
      if (localSearch.trim()) {
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
  }, [
    emails,
    accountFilter,
    subView,
    categoryFilter,
    securityFilter,
    priorityFilter,
    hasAttachmentOnly,
    localSearch,
  ]);

  // Sorting pipeline
  const sortedEmails = useMemo(() => {
    const list = [...filteredEmails];
    switch (sortBy) {
      case 'newest':
        return list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
      case 'oldest':
        return list.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
      case 'highest_priority': {
        const score = (p: string) => (p === 'Critical' ? 4 : p === 'High' ? 3 : p === 'Medium' ? 2 : 1);
        return list.sort((a, b) => score(b.aiAnalysis.priority) - score(a.aiAnalysis.priority));
      }
      case 'needs_attention': {
        const weight = (e: Email) => {
          let pts = 0;
          if (e.securityAnalysis.classification === 'PHISHING' || e.securityAnalysis.classification === 'MALICIOUS') pts += 100;
          if (e.aiAnalysis.priority === 'Critical') pts += 50;
          if (e.aiAnalysis.deadline) pts += 40;
          if (e.aiAnalysis.actionRequired) pts += 30;
          if (!e.isRead) pts += 10;
          return pts;
        };
        return list.sort((a, b) => weight(b) - weight(a));
      }
      default:
        return list;
    }
  }, [filteredEmails, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(sortedEmails.length / pageSize));
  const paginatedEmails = sortedEmails.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeFiltersCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (securityFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (accountFilter !== 'all' ? 1 : 0) +
    (hasAttachmentOnly ? 1 : 0) +
    (localSearch ? 1 : 0);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100">
      {/* Top Filter and Controls Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md space-y-3.5">
        {/* Quick View Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                onClick={() => handleFilterChange(setSubView, tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  subView === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              id="inbox-search-input"
              value={localSearch}
              onChange={(e) => handleFilterChange(setLocalSearch, e.target.value)}
              placeholder="Search sender, subject, AI summary..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            {localSearch && (
              <button
                onClick={() => handleFilterChange(setLocalSearch, '')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dropdowns Row: Accounts, Priority, Category, Security, Sorting */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Account Filter */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2.5 py-1 border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400">Account:</span>
            <select
              value={accountFilter}
              onChange={(e) => handleFilterChange(setAccountFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-hidden text-xs cursor-pointer font-medium"
            >
              <option value="all">All Accounts</option>
              <option value="gmail">Gmail Only</option>
              <option value="outlook">Outlook Only</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2.5 py-1 border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => handleFilterChange(setPriorityFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-hidden text-xs cursor-pointer font-medium"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2.5 py-1 border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => handleFilterChange(setCategoryFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-hidden text-xs cursor-pointer font-medium"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Security Filter */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2.5 py-1 border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400">Security:</span>
            <select
              value={securityFilter}
              onChange={(e) => handleFilterChange(setSecurityFilter, e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-hidden text-xs cursor-pointer font-medium"
            >
              {SECURITY_LEVELS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg px-2.5 py-1 border border-slate-700 text-xs">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => handleFilterChange(setSortBy, e.target.value as SortOption)}
              className="bg-transparent text-slate-200 focus:outline-hidden text-xs cursor-pointer font-medium"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_priority">Highest Priority</option>
              <option value="needs_attention">Needs Attention First</option>
            </select>
          </div>

          {/* Attachments only toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 cursor-pointer hover:bg-slate-800">
            <input
              type="checkbox"
              checked={hasAttachmentOnly}
              onChange={(e) => handleFilterChange(setHasAttachmentOnly, e.target.checked)}
              className="w-3.5 h-3.5 rounded-sm text-indigo-600 bg-slate-900 border-slate-700"
            />
            <Paperclip className="w-3 h-3 text-slate-400" />
            <span>Has Attachments</span>
          </label>

          {/* Reset button if active filters */}
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 transition"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Reset</span>
            </button>
          )}

          {/* Total Count */}
          <div className="ml-auto text-xs text-slate-400 font-mono">
            Showing <span className="text-white font-bold">{sortedEmails.length}</span> emails
          </div>
        </div>
      </div>

      {/* Email List Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 sm:p-4 space-y-1">
        {paginatedEmails.length === 0 ? (
          <div className="py-24 text-center text-slate-400 space-y-3 bg-slate-900/30 rounded-2xl border border-slate-850 m-4">
            <Mail className="w-10 h-10 mx-auto text-slate-500" />
            <h3 className="text-base font-bold text-white">No emails found matching your filters</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search terms, clearing selected categories, or resetting active filters.
            </p>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition inline-flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        ) : (
          paginatedEmails.map((e) => {
            const isPhishing = e.securityAnalysis.classification === 'PHISHING';
            const isMalicious = e.securityAnalysis.classification === 'MALICIOUS';
            const isSuspicious = e.securityAnalysis.classification === 'SUSPICIOUS';

            return (
              <div
                key={e.id}
                id={`email-row-${e.id}`}
                onClick={() => onOpenEmail(e.id)}
                className={`p-3.5 sm:p-4 rounded-xl transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group ${
                  !e.isRead
                    ? 'bg-slate-900/90 hover:bg-slate-850 border border-slate-800'
                    : 'bg-slate-950/40 hover:bg-slate-900/50 border border-transparent hover:border-slate-800/60'
                }`}
              >
                {/* Left: Check / Unread circle + Sender Avatar + Details */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Read / Unread Indicator */}
                  <button
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onToggleRead(e.id, e.isRead);
                    }}
                    className="p-1 rounded text-slate-500 hover:text-indigo-400 mt-1 shrink-0"
                    title={e.isRead ? 'Mark as Unread' : 'Mark as Read'}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        !e.isRead ? 'bg-indigo-500 ring-2 ring-indigo-500/30' : 'bg-slate-700'
                      }`}
                    />
                  </button>

                  {/* Sender Initial Avatar */}
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                    {e.senderName ? e.senderName[0].toUpperCase() : 'M'}
                  </div>

                  {/* Middle Content */}
                  <div className="space-y-1 flex-1 min-w-0">
                    {/* Top Row: Sender Name + Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs truncate max-w-[180px] ${!e.isRead ? 'font-bold text-white' : 'font-semibold text-slate-300'}`}>
                        {e.senderName}
                      </span>

                      {/* Account / Provider Pill */}
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${
                          e.provider === 'gmail'
                            ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                            : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                        }`}
                      >
                        {e.provider === 'gmail' ? 'Gmail' : 'Outlook'}
                      </span>

                      {/* Priority Badge */}
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
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
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-800 text-cyan-300 border border-slate-700">
                        {e.aiAnalysis.category}
                      </span>

                      {/* Security Status Badge */}
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          isPhishing || isMalicious
                            ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 animate-pulse'
                            : isSuspicious
                            ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-600/10 text-emerald-300 border border-emerald-500/20'
                        }`}
                      >
                        <Shield className="w-2.5 h-2.5" />
                        <span>{e.securityAnalysis.classification}</span>
                      </span>

                      {/* Attachment indicator */}
                      {e.hasAttachment && (
                        <span className="flex items-center gap-1 text-[9px] text-slate-400 font-mono bg-slate-800 px-1 py-0.2 rounded border border-slate-700">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>ATTACHMENT</span>
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h3 className={`text-xs sm:text-sm truncate group-hover:text-cyan-300 transition ${!e.isRead ? 'font-bold text-white' : 'text-slate-200'}`}>
                      {e.subject}
                    </h3>

                    {/* AI Summary Snippet */}
                    <p className="text-[11px] text-slate-400 line-clamp-1 leading-normal">
                      <span className="text-slate-500 font-medium">AI Summary:</span> {e.aiAnalysis.summary}
                    </p>

                    {/* Action required / Deadline pill */}
                    {e.aiAnalysis.actionRequired && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px]">
                        <span className="text-amber-400 font-medium">
                          Action: {e.aiAnalysis.recommendedAction}
                        </span>
                        {e.aiAnalysis.deadline && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            <span>Due: {e.aiAnalysis.deadline}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Timestamp & Actions */}
                <div className="flex items-center gap-2 md:flex-col md:items-end justify-between shrink-0">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(e.receivedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
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

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedEmails.length)} of {sortedEmails.length} emails
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
              <button
                key={pg}
                onClick={() => setCurrentPage(pg)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition ${
                  currentPage === pg
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {pg}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
