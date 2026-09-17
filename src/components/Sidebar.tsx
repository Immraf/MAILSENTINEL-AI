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
  Activity,
  MailCheck,
  Settings,
  Shield,
  Bell,
  HardDrive,
  Users,
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'inbox'
  | 'needs_attention'
  | 'deadlines'
  | 'ask_ai'
  | 'accounts'
  | 'security_center'
  | 'notifications'
  | 'rules'
  | 'rules_whitelist'
  | 'activity'
  | 'audit_logs'
  | 'quarantine'
  | 'workspace'
  | 'settings';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  unreadCount: number;
  needsAttentionCount: number;
  quarantineCount: number;
  activeAccountsCount: number;
  securityAlertsCount?: number;
  onCloseMobileDrawer?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  unreadCount,
  needsAttentionCount,
  quarantineCount,
  activeAccountsCount,
  securityAlertsCount = 0,
  onCloseMobileDrawer,
}) => {
  const handleNav = (view: NavView) => {
    onNavigate(view);
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  const navSections = [
    {
      title: 'PRODUCTIVITY',
      items: [
        {
          id: 'dashboard' as NavView,
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'inbox' as NavView,
          label: 'Inbox',
          icon: Inbox,
          badge: unreadCount > 0 ? `${unreadCount}` : null,
          badgeColor: 'bg-indigo-500/20 text-indigo-300',
        },
        {
          id: 'needs_attention' as NavView,
          label: 'Needs Attention',
          icon: AlertCircle,
          badge: needsAttentionCount > 0 ? `${needsAttentionCount}` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300 font-bold',
        },
        {
          id: 'deadlines' as NavView,
          label: 'Tasks & Deadlines',
          icon: CalendarCheck,
          badge: null,
        },
        {
          id: 'ask_ai' as NavView,
          label: 'Ask MailSentinel',
          icon: Sparkles,
          badge: 'AI',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 font-mono text-[9px]',
        },
      ],
    },
    {
      title: 'MANAGEMENT & PROTECTION',
      items: [
        {
          id: 'accounts' as NavView,
          label: 'Accounts',
          icon: MailCheck,
          badge: `${activeAccountsCount}/10`,
          badgeColor: 'bg-slate-800 text-slate-400 font-mono text-[10px]',
        },
        {
          id: 'security_center' as NavView,
          label: 'Security Center',
          icon: Shield,
          badge: securityAlertsCount > 0 ? `${securityAlertsCount} alerts` : null,
          badgeColor: 'bg-rose-500/20 text-rose-300',
        },
        {
          id: 'notifications' as NavView,
          label: 'Notifications',
          icon: Bell,
          badge: null,
        },
        {
          id: 'rules' as NavView,
          label: 'Rules',
          icon: Sliders,
          badge: null,
        },
        {
          id: 'activity' as NavView,
          label: 'Activity',
          icon: Activity,
          badge: null,
        },
      ],
    },
    {
      title: 'PREFERENCES',
      items: [
        {
          id: 'settings' as NavView,
          label: 'Settings',
          icon: Settings,
          badge: null,
        },
        {
          id: 'workspace' as NavView,
          label: 'Google Workspace',
          icon: HardDrive,
          badge: 'Live',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 font-mono text-[9px]',
        },
      ],
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800/80 flex flex-col h-full overflow-y-auto select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white tracking-tight">MailSentinel</span>
              <span className="text-[10px] px-1 rounded font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Personal Email Intelligence</p>
          </div>
        </div>

        {/* Demo Mode Badge */}
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
          DEMO
        </span>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 py-4 px-3 space-y-6">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              {section.title}
            </h3>

            <div className="space-y-0.5 pt-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  currentView === item.id ||
                  (item.id === 'rules' && currentView === 'rules_whitelist') ||
                  (item.id === 'activity' && currentView === 'audit_logs');

                return (
                  <button
                    key={item.id}
                    id={`nav-link-${item.id}`}
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                          item.badgeColor || 'bg-slate-800 text-slate-300'
                        }`}
                      >
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

      {/* Account Capacity Status */}
      <div className="p-3 m-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Mailboxes Connected</span>
          <span className="text-cyan-400 font-mono font-bold">{activeAccountsCount}/10</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${(activeAccountsCount / 10) * 100}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
