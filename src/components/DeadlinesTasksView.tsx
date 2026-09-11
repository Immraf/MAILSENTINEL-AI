import React, { useState } from 'react';
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
} from 'lucide-react';
import { Email, ExtractedEntity } from '../types';

interface DeadlinesTasksViewProps {
  emails: Email[];
  onOpenEmail: (id: string) => void;
}

export const DeadlinesTasksView: React.FC<DeadlinesTasksViewProps> = ({ emails, onOpenEmail }) => {
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<'all' | 'deadlines' | 'tasks'>('all');

  // Collect all deadlines and tasks from emails
  const deadlineItems = emails
    .filter((e) => e.aiAnalysis.deadline)
    .map((e) => ({
      id: `deadline-${e.id}`,
      type: 'deadline' as const,
      title: e.aiAnalysis.deadline!,
      context: e.subject,
      emailId: e.id,
      sender: e.senderName,
      receivedAt: e.receivedAt,
      priority: e.aiAnalysis.priority,
      actionRequired: e.aiAnalysis.recommendedAction,
    }));

  const taskItems: Array<{
    id: string;
    type: 'task';
    title: string;
    context: string;
    emailId: string;
    sender: string;
    receivedAt: string;
    priority: string;
    actionRequired?: string;
  }> = [];

  emails.forEach((e) => {
    e.aiAnalysis.extractedEntities
      .filter((ent) => ent.type === 'task')
      .forEach((ent, idx) => {
        taskItems.push({
          id: `task-${e.id}-${idx}`,
          type: 'task',
          title: ent.value,
          context: ent.context || e.subject,
          emailId: e.id,
          sender: e.senderName,
          receivedAt: e.receivedAt,
          priority: e.aiAnalysis.priority,
          actionRequired: e.aiAnalysis.recommendedAction,
        });
      });
  });

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            <span>Extracted Deadlines & Actionable Tasks</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automated temporal parsing and entity extraction across all connected mailboxes
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {(['all', 'deadlines', 'tasks'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterType(mode)}
              className={`px-3 py-1.5 rounded-lg capitalize font-medium transition ${
                filterType === mode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deadlines Section */}
        {(filterType === 'all' || filterType === 'deadlines') && (
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Upcoming Target Deadlines</h3>
              </div>
              <span className="text-xs font-mono text-amber-400">{deadlineItems.length} Extracted</span>
            </div>

            <div className="space-y-3">
              {deadlineItems.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">No explicit deadlines detected.</div>
              ) : (
                deadlineItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-2 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-amber-500/20 text-amber-300">
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs font-bold text-amber-300 font-mono">{item.title}</span>
                      </div>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                          item.priority === 'Critical'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 font-medium">{item.context}</p>
                    <p className="text-[11px] text-cyan-400">Action: {item.actionRequired}</p>

                    <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/40">
                      <span>Source: {item.sender}</span>
                      <button
                        onClick={() => onOpenEmail(item.emailId)}
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                      >
                        <span>View Original Email</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Actionable Tasks Checklist */}
        {(filterType === 'all' || filterType === 'tasks') && (
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Actionable Tasks Checklist</h3>
              </div>
              <span className="text-xs font-mono text-purple-400">
                {Object.values(completedTaskIds).filter(Boolean).length} / {taskItems.length} Completed
              </span>
            </div>

            <div className="space-y-3">
              {taskItems.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">No actionable tasks found.</div>
              ) : (
                taskItems.map((task) => {
                  const isDone = !!completedTaskIds[task.id];
                  return (
                    <div
                      key={task.id}
                      className={`p-3.5 rounded-lg border transition space-y-2 ${
                        isDone
                          ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleTask(task.id)}
                          className={`mt-0.5 p-0.5 rounded transition ${
                            isDone ? 'text-emerald-400' : 'text-slate-400 hover:text-cyan-400'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${isDone ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                            {task.title}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{task.context}</p>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/40">
                        <span>From: {task.sender}</span>
                        <button
                          onClick={() => onOpenEmail(task.emailId)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                        >
                          <span>Review Email</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
