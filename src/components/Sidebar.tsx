import React from 'react';
import {
  LayoutDashboard,
  Inbox,
  AlertCircle,
  Sparkles,
  CalendarCheck,
  ShieldAlert,
  Archive,
  Sliders,
  FileText,
  MailCheck,
  Settings,
  Shield,
  ChevronRight,
  HardDrive,
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'inbox'
  | 'needs_attention'
  | 'ask_ai'
  | 'deadlines'
  | 'workspace'
  | 'security_center'
  | 'quarantine'
  | 'rules_whitelist'
  | 'audit_logs'
  | 'accounts'
  | 'settings';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  unreadCount: number;
  needsAttentionCount: number;
  quarantineCount: number;
  activeAccountsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  unreadCount,
  needsAttentionCount,
  quarantineCount,
  activeAccountsCount,
}) => {
  const navSections = [
    {
      title: 'CORE INBOX',
      items: [
        {
          id: 'dashboard' as NavView,
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'inbox' as NavView,
          label: 'Unified Inbox',
          icon: Inbox,
          badge: unreadCount > 0 ? `${unreadCount}` : null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300',
        },
        {
          id: 'needs_attention' as NavView,
          label: 'Needs Attention',
          icon: AlertCircle,
          badge: needsAttentionCount > 0 ? `${needsAttentionCount}` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300',
        },
      ],
    },
    {
      title: 'AI INTELLIGENCE',
      items: [
        {
          id: 'ask_ai' as NavView,
          label: 'Ask MailSentinel',
          icon: Sparkles,
          badge: 'RAG',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 font-mono text-[9px]',
        },
        {
          id: 'deadlines' as NavView,
          label: 'Deadlines & Tasks',
          icon: CalendarCheck,
          badge: null,
        },
      ],
    },
    {
      title: 'GOOGLE WORKSPACE',
      items: [
        {
          id: 'workspace' as NavView,
          label: 'Calendar, Drive & Tasks',
          icon: HardDrive,
          badge: 'Sync',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 font-mono text-[9px]',
        },
      ],
    },
    {
      title: 'SECURITY ENGINE',
      items: [
        {
          id: 'security_center' as NavView,
          label: 'Security Center',
          icon: ShieldAlert,
          badge: null,
        },
        {
          id: 'quarantine' as NavView,
          label: 'Quarantine',
          icon: Archive,
          badge: quarantineCount > 0 ? `${quarantineCount}` : null,
          badgeColor: 'bg-rose-500/20 text-rose-300',
        },
        {
          id: 'rules_whitelist' as NavView,
          label: 'Rules & Whitelist',
          icon: Sliders,
          badge: null,
        },
        {
          id: 'audit_logs' as NavView,
          label: 'Audit & Scan Logs',
          icon: FileText,
          badge: null,
        },
      ],
    },
    {
      title: 'CONFIGURATION',
      items: [
        {
          id: 'accounts' as NavView,
          label: 'Connected Accounts',
          icon: MailCheck,
          badge: `${activeAccountsCount}/10`,
          badgeColor: 'bg-slate-700 text-slate-300 font-mono text-[10px]',
        },
        {
          id: 'settings' as NavView,
          label: 'Notifications & Safety',
          icon: Settings,
          badge: null,
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none overflow-y-auto">
      <div className="p-4 space-y-6">
        {navSections.map((sec, idx) => (
          <div key={idx} className="space-y-1">
            <h4 className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{sec.title}</h4>
            <div className="space-y-0.5 mt-1">
              {sec.items.map((item) => {
                const isActive = currentView === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600/30 to-cyan-600/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComponent
                        className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-300'}`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Security Engine Health Footer Banner */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-200">Zero-Trust Guard</span>
              <span className="text-[9px] px-1 rounded-sm bg-emerald-500/20 text-emerald-300 font-mono">ACTIVE</span>
            </div>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">DMARC, Links & Executables checked</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
