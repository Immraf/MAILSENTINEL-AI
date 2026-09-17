import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  ExternalLink,
  Filter,
  Check,
  AlertTriangle,
  FileText,
  User,
  ArrowRight,
  Flame,
  Search,
} from 'lucide-react';
import { Email, ExtractedEntity } from '../types';

interface DeadlinesTasksViewProps {
  emails: Email[];
  onOpenEmail: (id: string) => void;
}

interface ItemRecord {
  id: string;
  type: 'task' | 'deadline';
  title: string;
  context: string;
  emailId: string;
  sender: string;
  receivedAt: string;
  priority: string;
  deadlineText?: string;
  deadlineDate?: Date | null;
  actionRequired?: string;
}

export const DeadlinesTasksView: React.FC<DeadlinesTasksViewProps> = ({ emails, onOpenEmail }) => {
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'upcoming' | 'completed'>('today');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract tasks and deadlines from all emails
  const allItems: ItemRecord[] = useMemo(() => {
    const records: ItemRecord[] = [];

    emails.forEach((e) => {
      // 1. Explicit Deadline
      if (e.aiAnalysis.deadline) {
        const rawDl = e.aiAnalysis.deadline;
        let parsedDate: Date | null = null;
        if (!isNaN(Date.parse(rawDl))) {
          parsedDate = new Date(rawDl);
        } else {
          // If relative like "Tomorrow", approximate
          if (rawDl.toLowerCase().includes('tomorrow') || rawDl.toLowerCase().includes('24 hours')) {
            parsedDate = new Date(Date.now() + 86400000);
          } else if (rawDl.toLowerCase().includes('friday') || rawDl.toLowerCase().includes('week')) {
            parsedDate = new Date(Date.now() + 86400000 * 3);
          } else {
            parsedDate = new Date(Date.now() + 86400000 * 5);
          }
        }

        records.push({
          id: `dl-${e.id}`,
          type: 'deadline',
          title: `Deadline: ${e.aiAnalysis.deadline}`,
          context: e.subject,
          emailId: e.id,
          sender: e.senderName,
          receivedAt: e.receivedAt,
          priority: e.aiAnalysis.priority,
          deadlineText: e.aiAnalysis.deadline,
          deadlineDate: parsedDate,
          actionRequired: e.aiAnalysis.recommendedAction,
        });
      }

      // 2. Action Required as a task
      if (e.aiAnalysis.actionRequired && e.aiAnalysis.recommendedAction) {
        records.push({
          id: `act-${e.id}`,
          type: 'task',
          title: e.aiAnalysis.recommendedAction,
          context: e.subject,
          emailId: e.id,
          sender: e.senderName,
          receivedAt: e.receivedAt,
          priority: e.aiAnalysis.priority,
          deadlineText: e.aiAnalysis.deadline,
          deadlineDate: e.aiAnalysis.deadline ? new Date(Date.now() + 86400000) : null,
          actionRequired: e.aiAnalysis.recommendedAction,
        });
      }

      // 3. Extracted Task Entities
      e.aiAnalysis.extractedEntities
        ?.filter((ent) => ent.type === 'task')
        .forEach((ent, idx) => {
          records.push({
            id: `task-${e.id}-${idx}`,
            type: 'task',
            title: ent.value,
            context: ent.context || e.subject,
            emailId: e.id,
            sender: e.senderName,
            receivedAt: e.receivedAt,
            priority: e.aiAnalysis.priority,
            deadlineText: e.aiAnalysis.deadline,
            deadlineDate: e.aiAnalysis.deadline ? new Date(Date.now() + 86400000 * 2) : null,
          });
        });
    });

    return records;
  }, [emails]);

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Categorize items into Today, This Week, Upcoming, Completed
  const categorized = useMemo(() => {
    const today: ItemRecord[] = [];
    const week: ItemRecord[] = [];
    const upcoming: ItemRecord[] = [];
    const completed: ItemRecord[] = [];

    allItems.forEach((item) => {
      if (completedTaskIds[item.id]) {
        completed.push(item);
        return;
      }

      const text = (item.deadlineText || '').toLowerCase();
      const isToday = text.includes('today') || text.includes('24 hour') || text.includes('immediate') || text.includes('urgent');
      const isWeek = text.includes('tomorrow') || text.includes('friday') || text.includes('this week') || text.includes('days');

      if (isToday) {
        today.push(item);
      } else if (isWeek) {
        week.push(item);
      } else {
        upcoming.push(item);
      }
    });

    return { today, week, upcoming, completed };
  }, [allItems, completedTaskIds]);

  const activeItems = useMemo(() => {
    let list = categorized[activeTab];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.context.toLowerCase().includes(q) ||
          i.sender.toLowerCase().includes(q)
      );
    }
    return list;
  }, [categorized, activeTab, searchQuery]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Tasks & Deadlines</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically extracted deliverables, dates, and actionable tasks from all your email accounts.
              </p>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'today', label: 'Today', count: categorized.today.length },
            { id: 'week', label: 'This Week', count: categorized.week.length },
            { id: 'upcoming', label: 'Upcoming', count: categorized.upcoming.length },
            { id: 'completed', label: 'Completed', count: categorized.completed.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === tab.id ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search and Summary bar */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="text-xs text-slate-400 font-mono">
          Showing <span className="text-white font-bold">{activeItems.length}</span> items in{' '}
          <span className="capitalize text-indigo-300 font-semibold">{activeTab}</span>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks and deadlines..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Task & Deadline Cards */}
      <div className="space-y-3">
        {activeItems.length === 0 ? (
          <div className="py-20 text-center rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <h3 className="text-base font-bold text-white">No items in this section</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {activeTab === 'completed'
                ? 'Check off tasks as you finish them to see them archived here.'
                : 'All tasks and deadlines for this period are complete or not yet scheduled.'}
            </p>
          </div>
        ) : (
          activeItems.map((item) => {
            const isDone = Boolean(completedTaskIds[item.id]);

            return (
              <div
                key={item.id}
                id={`task-card-${item.id}`}
                className={`p-4 rounded-2xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isDone
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Left: Checkbox + Title + Meta */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <button
                    onClick={() => toggleTask(item.id)}
                    className={`p-1 rounded-lg mt-0.5 transition ${
                      isDone
                        ? 'text-emerald-400 bg-emerald-500/20'
                        : 'text-slate-500 hover:text-slate-300 bg-slate-800'
                    }`}
                    title={isDone ? 'Mark Incomplete' : 'Mark Complete'}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isDone ? 'line-through text-slate-400' : 'text-white'
                        }`}
                      >
                        {item.title}
                      </span>

                      {/* Type Pill */}
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${
                          item.type === 'deadline'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        }`}
                      >
                        {item.type}
                      </span>

                      {/* Priority Pill */}
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          item.priority === 'Critical'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : item.priority === 'High'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    {/* Source Email link */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>From:</span>
                      <button
                        onClick={() => onOpenEmail(item.emailId)}
                        className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline flex items-center gap-1 truncate max-w-md"
                        title="Open Source Email"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="truncate">&quot;{item.context}&quot; ({item.sender})</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </button>
                    </div>

                    {/* Deadline detail if available */}
                    {item.deadlineText && (
                      <div className="flex items-center gap-1.5 text-xs text-cyan-300 pt-0.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Deadline: {item.deadlineText}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => onOpenEmail(item.emailId)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    <span>View Source Email</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
