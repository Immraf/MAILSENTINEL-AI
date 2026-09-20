import React, { useState } from 'react';
import {
  Activity,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Shield,
  Bell,
  UserCheck,
  RefreshCw,
  Sparkles,
  Sliders,
  Clock,
} from 'lucide-react';
import { AuditLog } from '../types';

interface ActivityViewProps {
  logs: AuditLog[];
  onRefresh?: () => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({ logs, onRefresh }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getActivityBadge = (actionType: string) => {
    switch (actionType) {
      case 'OAUTH_CONNECT':
      case 'ACCOUNT_CONNECTED':
        return {
          label: 'Account Connected',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          icon: UserCheck,
        };
      case 'OAUTH_DISCONNECT':
      case 'ACCOUNT_DISCONNECTED':
        return {
          label: 'Account Disconnected',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          icon: AlertTriangle,
        };
      case 'ACCOUNT_SYNC':
      case 'EMAIL_SYNCHRONIZED':
        return {
          label: 'Email Synchronized',
          color: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
          icon: RefreshCw,
        };
      case 'EMAIL_SCANNED':
      case 'AI_ANALYSIS':
        return {
          label: 'AI Analysis Completed',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          icon: Sparkles,
        };
      case 'SECURITY_ALERT':
      case 'QUARANTINE_ACTION':
        return {
          label: 'Security Alert',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          icon: Shield,
        };
      case 'NOTIFICATION_SENT':
      case 'NOTIFICATION_GENERATED':
        return {
          label: 'Notification Generated',
          color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
          icon: Bell,
        };
      case 'USER_ACTION':
      case 'ACTION_CONFIRMED':
      case 'RULE_UPDATED':
        return {
          label: 'User Action',
          color: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Activity,
        };
      default:
        return {
          label: actionType.replace(/_/g, ' '),
          color: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Activity,
        };
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterType !== 'all') {
      const typeStr = (log.actionType || log.action || '').toUpperCase();
      if (filterType === 'account' && !typeStr.includes('ACCOUNT') && !typeStr.includes('OAUTH')) return false;
      if (filterType === 'sync' && !typeStr.includes('SYNC')) return false;
      if (filterType === 'ai' && !typeStr.includes('SCANNED') && !typeStr.includes('AI')) return false;
      if (filterType === 'security' && !typeStr.includes('SECURITY') && !typeStr.includes('QUARANTINE')) return false;
      if (filterType === 'notification' && !typeStr.includes('NOTIFICATION')) return false;
      if (filterType === 'user' && !typeStr.includes('ACTION') && !typeStr.includes('RULE') && !typeStr.includes('LOGIN')) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.description.toLowerCase().includes(q) ||
        (log.actionType || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <span>Activity & Intelligence Log</span>
            </h1>
            <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {logs.length} EVENTS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Audit trail of email synchronization, AI triage events, security classifications, and system actions.
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Log</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'account', label: 'Accounts' },
            { id: 'sync', label: 'Syncs' },
            { id: 'ai', label: 'AI Intelligence' },
            { id: 'security', label: 'Security' },
            { id: 'notification', label: 'Notifications' },
            { id: 'user', label: 'User Actions' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterType === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event descriptions..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800 space-y-2">
            <Activity className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm font-medium">No activity records match your criteria.</p>
            <p className="text-xs text-slate-500">Events will populate here as emails are received, analyzed, and managed.</p>
          </div>
        ) : (
          filteredLogs.map((item) => {
            const badge = getActivityBadge(item.actionType || item.action || '');
            const Icon = badge.icon;
            const dateStr = new Date(item.timestamp).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${badge.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badge.color}`}>
                        {badge.label}
                      </span>
                      {item.severity && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                            item.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : item.severity === 'high'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-200 font-medium leading-relaxed break-words">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] shrink-0 sm:self-center">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{dateStr}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
