import React from 'react';
import {
  Shield,
  Sparkles,
  CheckCircle2,
  Mail,
  Lock,
  ArrowRight,
  X,
  Layers,
  Inbox,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectGmail: () => void;
  onConnectOutlook: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onConnectGmail,
  onConnectOutlook,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        id="onboarding-modal"
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 flex flex-col"
      >
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Welcome to MailSentinel AI</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  PRODUCTIVITY & PROTECTION
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Your AI-powered personal multi-account email intelligence and management platform.
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Main Proposition */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 space-y-2">
            <p className="text-sm font-semibold text-white">
              Connect your email accounts and let MailSentinel organize, summarize and protect your inbox.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              MailSentinel uses your email data to summarize messages, identify important information, detect security risks, and notify you about messages that need attention.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 pt-1">
              <Layers className="w-4 h-4" />
              <span>You can connect up to 10 email accounts (Gmail & Outlook).</span>
            </div>
          </div>

          {/* Core Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-1.5">
              <div className="p-1.5 w-fit rounded-md bg-indigo-500/20 text-indigo-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Productivity First</h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                Instant AI briefings, deadline extraction, and needs-attention prioritization.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-1.5">
              <div className="p-1.5 w-fit rounded-md bg-emerald-500/20 text-emerald-300">
                <Inbox className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Unified Inbox</h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                Seamlessly read, search, and manage work, academic, and personal mail in one view.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-1.5">
              <div className="p-1.5 w-fit rounded-md bg-cyan-500/20 text-cyan-300">
                <Shield className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Zero-Friction Safety</h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                Phishing detection, SPF/DKIM verification, and isolated quarantine safety.
              </p>
            </div>
          </div>

          {/* Privacy Assurance */}
          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <span className="font-semibold text-emerald-300">Privacy & Security Commitment</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                MailSentinel never requests or stores your account passwords. Authentication is handled via industry-standard OAuth tokens with minimal required permissions.
              </p>
            </div>
          </div>

          {/* Quick Connect Options */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Connect Your First Mailbox</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                id="onboarding-connect-gmail-btn"
                onClick={() => {
                  onConnectGmail();
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs">
                    G
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-cyan-300">Connect Gmail</span>
                    <p className="text-[10px] text-slate-400">Google Workspace & Personal</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition" />
              </button>

              <button
                id="onboarding-connect-outlook-btn"
                onClick={() => {
                  onConnectOutlook();
                  onClose();
                }}
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-xs">
                    O
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-cyan-300">Connect Outlook</span>
                    <p className="text-[10px] text-slate-400">Microsoft 365 & Exchange</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">DEMO MODE ACTIVE</span>
          <button
            id="onboarding-start-exploring-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition"
          >
            Explore Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
