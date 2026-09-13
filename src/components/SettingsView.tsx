import React, { useState } from 'react';
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
import { NotificationConfig, SecuritySettings } from '../types';

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

  React.useEffect(() => {
    fetch('/api/accounts/config-status')
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
                checked={securitySettings.autoQuarantine}
                onChange={(e) =>
                  onUpdateSecurity({ ...securitySettings, autoQuarantine: e.target.checked })
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
              onClick={() =>
                onUpdateNotifications({
                  ...notifications,
                  pushEnabled: !notifications.pushEnabled,
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                notifications.pushEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {notifications.pushEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Receive native desktop notifications for Critical emails, imminent deadlines, and high-risk security threats.
          </p>
        </div>

        {/* WhatsApp Business Cloud API */}
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">WhatsApp Business Cloud API</span>
            </div>
            <button
              onClick={() =>
                onUpdateNotifications({
                  ...notifications,
                  whatsappEnabled: !notifications.whatsappEnabled,
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                notifications.whatsappEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {notifications.whatsappEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Dispatches urgent security and priority alerts directly to your verified phone number using official Meta WhatsApp Cloud templates.
          </p>

          {waConfigured === false && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>WhatsApp notifications are not configured.</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                To activate real outbound WhatsApp dispatching, define the following variables in environment secrets:
              </p>
              <ul className="list-disc list-inside font-mono text-[10px] text-cyan-300 space-y-0.5">
                <li>WHATSAPP_PHONE_NUMBER_ID</li>
                <li>WHATSAPP_ACCESS_TOKEN</li>
                <li>WHATSAPP_BUSINESS_ACCOUNT_ID</li>
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="block text-slate-400 mb-1">Destination Phone Number</label>
              <input
                type="text"
                value={notifications.whatsappPhone || ''}
                onChange={(e) =>
                  onUpdateNotifications({
                    ...notifications,
                    whatsappPhone: e.target.value,
                  })
                }
                placeholder="+1 (555) 019-2834"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Template Identifier</label>
              <input
                type="text"
                readOnly
                value="mailsentinel_critical_alert_v1"
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 font-mono"
              />
            </div>
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
                onUpdateNotifications({
                  ...notifications,
                  quietHours: {
                    ...notifications.quietHours,
                    enabled: !notifications.quietHours.enabled,
                  },
                })
              }
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                notifications.quietHours.enabled
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {notifications.quietHours.enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Start Time</label>
              <input
                type="time"
                value={notifications.quietHours.start}
                onChange={(e) =>
                  onUpdateNotifications({
                    ...notifications,
                    quietHours: { ...notifications.quietHours, start: e.target.value },
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">End Time</label>
              <input
                type="time"
                value={notifications.quietHours.end}
                onChange={(e) =>
                  onUpdateNotifications({
                    ...notifications,
                    quietHours: { ...notifications.quietHours, end: e.target.value },
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={notifications.quietHours.allowCriticalSecurity}
              onChange={(e) =>
                onUpdateNotifications({
                  ...notifications,
                  quietHours: {
                    ...notifications.quietHours,
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
                  checked={(notifications.triggers as any)[trig.key]}
                  onChange={(e) =>
                    onUpdateNotifications({
                      ...notifications,
                      triggers: {
                        ...notifications.triggers,
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
