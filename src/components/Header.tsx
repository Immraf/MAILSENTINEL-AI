import React, { useState } from 'react';
import {
  Shield,
  Search,
  RefreshCw,
  Bell,
  Sparkles,
  Mail,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { EmailAccount, SecurityAlert } from '../types';
import { User } from 'firebase/auth';

interface HeaderProps {
  accounts: EmailAccount[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSyncAll: () => void;
  isSyncing: boolean;
  onOpenAskAi: () => void;
  onOpenScanSimulator: () => void;
  alerts: SecurityAlert[];
  onOpenEmail: (emailId: string) => void;
  googleUser?: User | null;
  onSignInWithGoogle?: () => void;
  onSignOut?: () => void;
  isSigningInGoogle?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  searchQuery,
  onSearchChange,
  onSyncAll,
  isSyncing,
  onOpenAskAi,
  onOpenScanSimulator,
  alerts,
  onOpenEmail,
  googleUser,
  onSignInWithGoogle,
  onSignOut,
  isSigningInGoogle = false,
}) => {
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);
  const unreadAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
      {/* Brand & Multi-Account Switcher */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md shadow-cyan-900/20">
            <Shield className="w-5 h-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">MailSentinel</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-sm bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Unified Intelligence & Security</p>
          </div>
        </div>

        {/* Account Selector Pill */}
        <div className="relative">
          <button
            id="account-selector-dropdown-btn"
            onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 transition"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="max-w-[140px] truncate">
              {selectedAccountId === 'all'
                ? `All Accounts (${accounts.length}/10)`
                : activeAccount?.displayName || 'Select Account'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isAccountMenuOpen && (
            <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 flex justify-between items-center">
                <span>CONNECTED MAILBOXES</span>
                <span className="text-[10px] text-cyan-400 font-mono">{accounts.length}/10 ACTIVE</span>
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  id="select-all-accounts-opt"
                  onClick={() => {
                    onSelectAccount('all');
                    setIsAccountMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition ${
                    selectedAccountId === 'all' ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>All Accounts</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{accounts.length} boxes</span>
                </button>

                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    id={`account-opt-${acc.id}`}
                    onClick={() => {
                      onSelectAccount(acc.id);
                      setIsAccountMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition ${
                      selectedAccountId === acc.id ? 'bg-indigo-600/20 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex flex-col items-start truncate pr-2">
                      <span className="truncate">{acc.displayName}</span>
                      <span className="text-[10px] text-slate-400 truncate">{acc.emailAddress}</span>
                    </div>
                    <span
                      className={`text-[9px] uppercase px-1 py-0.5 rounded font-mono ${
                        acc.provider === 'gmail' ? 'bg-rose-500/10 text-rose-300' : 'bg-sky-500/10 text-sky-300'
                      }`}
                    >
                      {acc.provider}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Natural Language Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            id="global-email-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search across all connected inboxes, threads, entities, or threats..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Quick Action Tools & Alerts */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Sync Now button */}
        <button
          id="sync-all-accounts-btn"
          onClick={onSyncAll}
          disabled={isSyncing}
          title="Synchronize connected accounts"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700/80 rounded-lg border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
          <span className="hidden lg:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
        </button>

        {/* Scan Simulator / Incoming Email tester */}
        <button
          id="open-scan-simulator-btn"
          onClick={onOpenScanSimulator}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/50 rounded-lg transition"
          title="Simulate incoming emails and test live AI & security detection"
        >
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Scan Simulator</span>
        </button>

        {/* Ask MailSentinel AI quick trigger */}
        <button
          id="quick-ask-mailsentinel-btn"
          onClick={onOpenAskAi}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 rounded-lg shadow-sm shadow-indigo-900/30 transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>

        {/* Security Alerts Dropdown */}
        <div className="relative">
          <button
            id="security-alerts-bell-btn"
            onClick={() => setIsAlertsOpen(!isAlertsOpen)}
            className="relative p-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            title="Threat alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                {unreadAlerts.length}
              </span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 text-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-bold tracking-wide">SECURITY THREAT TELEMETRY</span>
                </div>
                <span className="text-[11px] text-slate-400">{alerts.length} events</span>
              </div>

              <div className="mt-2 space-y-2 max-h-80 overflow-y-auto pr-1">
                {alerts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                    No active threat alerts. All mailboxes protected.
                  </div>
                ) : (
                  alerts.map((al) => (
                    <div
                      key={al.id}
                      className={`p-2.5 rounded-lg border text-xs transition ${
                        al.severity === 'critical'
                          ? 'bg-rose-950/30 border-rose-800/40 text-rose-200'
                          : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[11px] uppercase tracking-wider">{al.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(al.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300 leading-normal">{al.description}</p>
                      {al.emailId && (
                        <button
                          onClick={() => {
                            setIsAlertsOpen(false);
                            onOpenEmail(al.emailId!);
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-400 hover:text-cyan-300 transition"
                        >
                          <span>Review Flagged Email</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Google Account Profile / Sign In */}
        {googleUser ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            {googleUser.photoURL ? (
              <img
                src={googleUser.photoURL}
                alt={googleUser.displayName || 'Google Account'}
                className="w-8 h-8 rounded-full border border-slate-700 shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs border border-indigo-500">
                {(googleUser.email || 'G')[0].toUpperCase()}
              </div>
            )}
            <div className="hidden lg:block text-left text-xs">
              <p className="font-semibold text-slate-200 leading-tight truncate max-w-[120px]">
                {googleUser.displayName || googleUser.email}
              </p>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-[10px] text-slate-400 hover:text-rose-400 transition"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        ) : (
          onSignInWithGoogle && (
            <button
              id="header-google-signin-btn"
              onClick={onSignInWithGoogle}
              disabled={isSigningInGoogle}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg shadow-sm border transition ${
                isSigningInGoogle
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'text-slate-700 bg-white hover:bg-slate-100 border-slate-300'
              }`}
            >
              {isSigningInGoogle ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{isSigningInGoogle ? 'Connecting...' : 'Sign in'}</span>
            </button>
          )
        )}
      </div>
    </header>
  );
};
