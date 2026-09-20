import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  Bell,
  MessageSquare,
  Shield,
  Moon,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Smartphone,
  Check,
  Zap,
} from 'lucide-react';
import { NotificationConfig, SecuritySettings, normalizeNotificationConfig } from '../types';

interface SettingsViewProps {
  notifications: NotificationConfig;
  securitySettings: SecuritySettings;
  onUpdateNotifications: (updated: NotificationConfig) => void;
  onUpdateSecurity: (updated: SecuritySettings) => void;
  onSendTestNotification: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  notifications,
  securitySettings,
  onUpdateNotifications,
  onUpdateSecurity,
  onSendTestNotification,
}) => {
  const [testSent, setTestSent] = useState(false);
  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);

  const safeNotif = normalizeNotificationConfig(notifications);
  const quietHours = safeNotif.quietHours!;
  const triggers = safeNotif.triggers!;

  const updateNotif = (patch: Partial<NotificationConfig>) => {
    onUpdateNotifications(normalizeNotificationConfig({ ...safeNotif, ...patch }));
  };

  React.useEffect(() => {
    apiFetch('/api/accounts/config-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.whatsapp) {
          setWaConfigured(Boolean(data.whatsapp.configured));
        }
      })
      .catch(() => setWaConfigured(false));
  }, []);

  const handleTestNotification = () => {
    onSendTestNotification();

    // Trigger browser notification if supported and permitted
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('MailSentinel AI Security Alert', {
          body: 'Test alert: High-priority threat intercept verified.',
          icon: '/favicon.ico',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification('MailSentinel AI Security Alert', {
              body: 'Test alert: High-priority threat intercept verified.',
              icon: '/favicon.ico',
            });
          }
        });
      }
    }

    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto text-slate-100">
      {/* Top Header */}
      <div className="pb-3 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <span>Notification Channels & Security Heuristics</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure real-time push alerts, WhatsApp Business Cloud integration, quiet hours, and AI sensitivity
        </p>
      </div>

      {/* 1. Security Sensitivity Settings */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Zero-Trust Heuristic Sensitivity</h3>
          </div>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 uppercase">
            Current: {securitySettings.sensitivity}
          </span>
        </div>

        <div className="space-y-3">
          <label className="text-xs text-slate-300 font-medium block">Detection Threshold Profile:</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['low', 'balanced', 'high', 'maximum'] as const).map((level) => (
              <button
                key={level}
                onClick={() => onUpdateSecurity({ ...securitySettings, sensitivity: level })}
                className={`p-3 rounded-xl border text-xs font-medium capitalize text-left transition ${
                  securitySettings.sensitivity === level
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-xs'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold text-white capitalize">{level}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {level === 'low' && 'Only flags verified malware and hard DMARC fails.'}
                  {level === 'balanced' && 'Standard industry heuristics and lookalike checks.'}
                  {level === 'high' && 'Strict link scanning, aggressive double extensions.'}
                  {level === 'maximum' && 'Isolates any unverified domain or external attachment.'}
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 space-y-2 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(securitySettings.autoQuarantine ?? securitySettings.autoQuarantinePhishing ?? true)}
                onChange={(e) =>
                  onUpdateSecurity({
                    ...securitySettings,
                    autoQuarantine: e.target.checked,
                    autoQuarantinePhishing: e.target.checked,
                  })
                }
                className="rounded bg-slate-800 border-slate-700 text-indigo-600"
              />
              <span>Automatically isolate messages with Risk Score &gt; 80 into Quarantine</span>
            </label>
          </div>
        </div>
      </div>

      {/* 2. Notification Channels */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Alert Dispatch Channels</h3>
          </div>

          <button
            id="send-test-notification-btn"
            onClick={handleTestNotification}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition"
          >
            {testSent ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Send className="w-3.5 h-3.5" />}
            <span>{testSent ? 'Test Alert Dispatched!' : 'Send Test Notification'}</span>
          </button>
        </div>

        {/* Web / Push Notifications */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white">Web Push Notifications</span>
            </div>
            <button
              onClick={() => updateNotif({ pushEnabled: !safeNotif.pushEnabled })}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                safeNotif.pushEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {safeNotif.pushEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Receive native desktop notifications for Critical emails, imminent deadlines, and high-risk security threats.
          </p>
        </div>

        {/* WhatsApp Business Cloud API (Official Cloud API Only) */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">WhatsApp Business Platform Cloud API</span>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    OFFICIAL META API ONLY
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Direct encrypted WhatsApp messages for urgent priority and security alerts. Unofficial automation is strictly prohibited.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const nextEnabled = !safeNotif.whatsappEnabled;
                updateNotif({
                  whatsappEnabled: nextEnabled,
                  whatsappOptIn: nextEnabled ? (safeNotif.whatsappOptIn ?? true) : false,
                  whatsappOptInTimestamp: nextEnabled ? new Date().toISOString() : undefined,
                });
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                safeNotif.whatsappEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {safeNotif.whatsappEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {waConfigured === false && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>WhatsApp notifications are not configured.</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                To activate official Meta WhatsApp Cloud dispatching, configure server environment secrets:
              </p>
              <ul className="list-disc list-inside font-mono text-[10px] text-cyan-300 space-y-0.5">
                <li>WHATSAPP_PHONE_NUMBER_ID</li>
                <li>WHATSAPP_ACCESS_TOKEN</li>
                <li>WHATSAPP_BUSINESS_ACCOUNT_ID</li>
                <li>WHATSAPP_APP_SECRET</li>
                <li>WHATSAPP_VERIFY_TOKEN</li>
              </ul>
            </div>
          )}

          {/* Explicit User Opt-In (MANDATORY REQUIREMENT) */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/80 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(safeNotif.whatsappOptIn)}
                onChange={(e) =>
                  updateNotif({
                    whatsappOptIn: e.target.checked,
                    whatsappEnabled: e.target.checked ? true : safeNotif.whatsappEnabled,
                    whatsappOptInTimestamp: e.target.checked ? new Date().toISOString() : undefined,
                    whatsappOptInSource: 'settings_view_consent',
                  })
                }
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-800 border-slate-600 cursor-pointer"
              />
              <div className="text-xs space-y-1">
                <span className="font-semibold text-slate-200">
                  Explicit User Opt-In (Required for Outbound Dispatch)
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  I explicitly authorize MailSentinel to transmit critical email alerts to my registered WhatsApp number. For alerts outside the 24-hour customer service window, official Meta-approved utility templates will be utilized. Reply STOP at any time to revoke consent.
                </p>
                {safeNotif.whatsappOptIn && safeNotif.whatsappOptInTimestamp && (
                  <p className="text-[10px] text-emerald-400 font-mono">
                    Consent recorded: {new Date(safeNotif.whatsappOptInTimestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="block text-slate-400 mb-1">Destination Phone Number (E.164 Format)</label>
              <input
                type="tel"
                value={safeNotif.whatsappPhone || safeNotif.whatsappNumber || ''}
                onChange={(e) =>
                  updateNotif({
                    whatsappPhone: e.target.value,
                    whatsappNumber: e.target.value,
                  })
                }
                placeholder="+14155552671"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                WhatsApp Dispatch Threshold <span className="text-emerald-400">(Default: Critical only)</span>
              </label>
              <select
                value={safeNotif.whatsappThreshold || 'Critical'}
                onChange={(e) => updateNotif({ whatsappThreshold: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              >
                <option value="Critical">Critical (Default - Recommended: Phishing, security breaches, leaks)</option>
                <option value="High">High (Deadlines, executive escalation, wire requests)</option>
                <option value="Medium">Medium (Actionable projects, key team updates)</option>
                <option value="Low">Low (All emails qualifying for notifications)</option>
              </select>
            </div>
          </div>

          {/* Proactive Template Spec */}
          <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
            <div>
              <span className="text-slate-300 font-mono">Meta Approved Utility Template: </span>
              <span className="font-mono text-cyan-300">&quot;🚨 New {`{{priority}}`} email from {`{{sender}}`}: {`{{summary}}`}&quot;</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Template: mailsentinel_critical_alert_v1</span>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-white">Quiet Hours Suppression</span>
            </div>
            <button
              onClick={() =>
                updateNotif({
                  quietHours: {
                    ...quietHours,
                    enabled: !quietHours.enabled,
                  },
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                quietHours.enabled
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {quietHours.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Start Time</label>
              <input
                type="time"
                value={quietHours.start || '22:00'}
                onChange={(e) =>
                  updateNotif({
                    quietHours: { ...quietHours, start: e.target.value },
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">End Time</label>
              <input
                type="time"
                value={quietHours.end || '07:00'}
                onChange={(e) =>
                  updateNotif({
                    quietHours: { ...quietHours, end: e.target.value },
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={Boolean(quietHours.allowCriticalSecurity ?? true)}
              onChange={(e) =>
                updateNotif({
                  quietHours: {
                    ...quietHours,
                    allowCriticalSecurity: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-indigo-600"
            />
            <span className="text-slate-300">
              Override quiet hours for <strong>Critical security threats</strong> (credential theft, malware)
            </span>
          </label>
        </div>

        {/* Triggers Checklist */}
        <div className="space-y-2 pt-2 text-xs">
          <span className="font-semibold text-slate-300 block">Dispatch Notification On:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: 'critical', label: 'Critical priority email received' },
              { key: 'high', label: 'High priority email received' },
              { key: 'threats', label: 'High-risk threat detected' },
              { key: 'deadlines', label: 'Imminent deadline within 24 hours' },
              { key: 'quarantine', label: 'Email quarantined' },
              { key: 'summary', label: 'Daily AI briefing generated' },
            ].map((trig) => (
              <label key={trig.key} className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean((triggers as any)[trig.key])}
                  onChange={(e) =>
                    updateNotif({
                      triggers: {
                        ...triggers,
                        [trig.key]: e.target.checked,
                      },
                    })
                  }
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                />
                <span>{trig.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
