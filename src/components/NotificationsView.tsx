import React, { useState, useEffect } from 'react';
import {
  Bell,
  Smartphone,
  MessageSquare,
  Clock,
  Shield,
  Save,
  Check,
  Send,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Volume2,
  VolumeX,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  XCircle,
  Info,
  Radio,
  Zap,
  CheckCheck,
  Laptop,
  Trash2,
  Copy,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Cpu,
  UserCheck,
  FileText,
  CornerDownLeft,
  Activity,
} from 'lucide-react';
import {
  NotificationConfig,
  PriorityLevel,
  NotificationItem,
  NotificationDeliveryItem,
  NotificationChannel,
  normalizeNotificationConfig,
} from '../types';
import { apiFetch, apiRequest } from '../lib/api';
import {
  RegisteredDeviceItem,
  FcmServerStatus,
  fetchFcmServerStatus,
  fetchUserDevices,
  registerCurrentDevice,
  refreshCurrentDeviceToken,
  unregisterDevice,
  toggleDeviceEnabled,
  sendTestFcmPush,
} from '../utils/fcmClient';

interface NotificationsViewProps {
  config: NotificationConfig;
  onUpdateConfig: (config: NotificationConfig) => void;
  onTestNotification?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'preferences' | 'devices' | 'whatsapp' | 'ledger' | 'simulator'>('preferences');
  const [localConfig, setLocalConfig] = useState<NotificationConfig>(() => normalizeNotificationConfig(config));
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Live notifications & delivery states
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>([]);
  const [deliveriesList, setDeliveriesList] = useState<NotificationDeliveryItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [confirmingDeliveryId, setConfirmingDeliveryId] = useState<string | null>(null);

  // FCM Device Management State
  const [devicesList, setDevicesList] = useState<RegisteredDeviceItem[]>([]);
  const [fcmStatus, setFcmStatus] = useState<FcmServerStatus | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isRegisteringDevice, setIsRegisteringDevice] = useState(false);
  const [registerFeedback, setRegisterFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingFcm, setIsTestingFcm] = useState(false);
  const [fcmTestOutput, setFcmTestOutput] = useState<{ success: boolean; configured: boolean; message: string; results?: any[] } | null>(null);
  const [refreshingDeviceId, setRefreshingDeviceId] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // WhatsApp Cloud API State (Step 10)
  const [waStatus, setWaStatus] = useState<{
    configured: boolean;
    phoneNumberIdMasked?: string;
    businessAccountIdMasked?: string;
    templateName: string;
    defaultThreshold: PriorityLevel;
    statusMessage: string;
    userOptIn?: {
      optedIn: boolean;
      optInTimestamp?: string;
      phoneNumber: string;
      threshold: PriorityLevel;
      enabled: boolean;
    };
  } | null>(null);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waOptInChecked, setWaOptInChecked] = useState(false);
  const [waThreshold, setWaThreshold] = useState<PriorityLevel>('Critical');
  const [isSavingWaOptIn, setIsSavingWaOptIn] = useState(false);
  const [waOptInFeedback, setWaOptInFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingWa, setIsTestingWa] = useState(false);
  const [waTestOutput, setWaTestOutput] = useState<any>(null);
  const [isSimulatingWaWebhook, setIsSimulatingWaWebhook] = useState(false);
  const [simTargetWamid, setSimTargetWamid] = useState('');
  const [simTargetStatus, setSimTargetStatus] = useState<'delivered' | 'read' | 'failed'>('delivered');
  const [simErrorCode, setSimErrorCode] = useState(131026);
  const [simErrorMessage, setSimErrorMessage] = useState('Message undeliverable to handset');
  const [simWebhookOutput, setSimWebhookOutput] = useState<any>(null);

  // Simulator state
  const [simChannel, setSimChannel] = useState<NotificationChannel>('browser_push');
  const [simPriority, setSimPriority] = useState<PriorityLevel>('High');
  const [simSubject, setSimSubject] = useState('Urgent: Security Audit Confirmation Required');
  const [simBody, setSimBody] = useState('Immediate action is required to verify SPF/DKIM authentication and access permissions.');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Digest trigger state
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [digestSuccess, setDigestSuccess] = useState<string | null>(null);

  // Sync when prop updates
  useEffect(() => {
    setLocalConfig(normalizeNotificationConfig(config));
  }, [config]);

  // Fetch notifications and deliveries
  const fetchFeedData = async () => {
    setIsLoadingFeed(true);
    try {
      const notifData = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotificationsList(notifData.notifications || []);

      const delivData = await apiRequest<{ deliveries: NotificationDeliveryItem[] }>('/api/notifications/deliveries');
      setDeliveriesList(delivData.deliveries || []);
    } catch (err) {
      console.error('Failed to load notifications or deliveries:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const fetchDevicesData = async () => {
    setIsLoadingDevices(true);
    try {
      const [status, devices] = await Promise.all([
        fetchFcmServerStatus(),
        fetchUserDevices(),
      ]);
      setFcmStatus(status);
      setDevicesList(devices);
    } catch (err) {
      console.error('Failed to load FCM status or devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const fetchWhatsAppStatus = async () => {
    try {
      const data = await apiRequest<any>('/api/notifications/whatsapp/status');
      setWaStatus(data);
      if (data?.userOptIn) {
        setWaPhoneInput(data.userOptIn.phoneNumber || '');
        setWaOptInChecked(Boolean(data.userOptIn.optedIn));
        setWaThreshold(data.userOptIn.threshold || 'Critical');
      }
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
    }
  };

  useEffect(() => {
    fetchFeedData();
    fetchDevicesData();
    fetchWhatsAppStatus();
  }, []);

  const handleRegisterDevice = async (platformType?: 'web' | 'android') => {
    setIsRegisteringDevice(true);
    setRegisterFeedback(null);
    try {
      const res = await registerCurrentDevice();
      setRegisterFeedback({
        success: res.success,
        message: res.message || (res.success ? 'Device registered successfully.' : 'Push notifications are not configured.'),
      });
      if (res.success) {
        await fetchDevicesData();
      }
    } catch (err: any) {
      setRegisterFeedback({
        success: false,
        message: 'Push notifications are not configured.',
      });
    } finally {
      setIsRegisteringDevice(false);
    }
  };

  const handleRegisterDemoAndroidDevice = async () => {
    setIsRegisteringDevice(true);
    setRegisterFeedback(null);
    try {
      const testToken = `fcm-android-token-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const res = await apiRequest<{ success: boolean; device: RegisteredDeviceItem }>('/api/notifications/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: `android-dev-${Date.now()}`,
          platform: 'android',
          pushToken: testToken,
          enabled: true,
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
        }),
      });
      setRegisterFeedback({
        success: true,
        message: 'Enrolled Android device registered successfully in FCM registry.',
      });
      await fetchDevicesData();
    } catch (err: any) {
      setRegisterFeedback({
        success: false,
        message: 'Push notifications are not configured.',
      });
    } finally {
      setIsRegisteringDevice(false);
    }
  };

  const handleRefreshToken = async (deviceId: string) => {
    setRefreshingDeviceId(deviceId);
    try {
      const res = await refreshCurrentDeviceToken();
      setRegisterFeedback({
        success: res.success,
        message: res.message,
      });
      await fetchDevicesData();
    } catch (err: any) {
      setRegisterFeedback({
        success: false,
        message: err.message || 'Token refresh failed.',
      });
    } finally {
      setRefreshingDeviceId(null);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const res = await unregisterDevice(deviceId);
      setRegisterFeedback({
        success: res.success,
        message: res.message,
      });
      await fetchDevicesData();
    } catch (err: any) {
      setRegisterFeedback({
        success: false,
        message: 'Failed to unregister device.',
      });
    }
  };

  const handleToggleDevice = async (deviceId: string, currentEnabled: boolean) => {
    const res = await toggleDeviceEnabled(deviceId, !currentEnabled);
    if (res.success && res.device) {
      setDevicesList((prev) => prev.map((d) => (d.deviceId === deviceId ? res.device! : d)));
    }
  };

  const handleTestFcm = async (deviceId?: string) => {
    setIsTestingFcm(true);
    setFcmTestOutput(null);
    try {
      const res = await sendTestFcmPush({
        deviceId,
        title: 'MailSentinel Security Priority Alert',
        body: 'Real Firebase Cloud Messaging notification dispatch test.',
        priority: 'Critical',
      });
      setFcmTestOutput(res);
      await fetchFeedData();
      await fetchDevicesData();
    } catch (err: any) {
      setFcmTestOutput({
        success: false,
        configured: false,
        message: 'Push notifications are not configured.',
      });
    } finally {
      setIsTestingFcm(false);
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onUpdateConfig(localConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // WhatsApp Explicit Opt-In & Threshold Handler
  const handleSaveWhatsAppOptIn = async () => {
    setIsSavingWaOptIn(true);
    setWaOptInFeedback(null);
    try {
      if (!waPhoneInput || waPhoneInput.trim().length < 7) {
        setWaOptInFeedback({
          success: false,
          message: 'Please provide a valid destination phone number with country code (e.g. +14155552671).',
        });
        setIsSavingWaOptIn(false);
        return;
      }

      const res = await apiRequest<{ success: boolean; optedIn: boolean; message: string; settings: any }>(
        '/api/notifications/whatsapp/opt-in',
        {
          method: 'POST',
          body: JSON.stringify({
            optedIn: waOptInChecked,
            phoneNumber: waPhoneInput,
            threshold: waThreshold,
          }),
        }
      );

      setWaOptInFeedback({
        success: res.success,
        message: res.message || 'WhatsApp preferences updated successfully.',
      });

      const updatedConfig = {
        ...localConfig,
        whatsappEnabled: waOptInChecked,
        whatsappOptIn: waOptInChecked,
        whatsappPhone: waPhoneInput,
        whatsappNumber: waPhoneInput,
        whatsappThreshold: waThreshold,
      };
      setLocalConfig(updatedConfig);
      onUpdateConfig(updatedConfig);

      await fetchWhatsAppStatus();
      await fetchFeedData();
    } catch (err: any) {
      setWaOptInFeedback({
        success: false,
        message: err.message || 'Failed to update WhatsApp opt-in.',
      });
    } finally {
      setIsSavingWaOptIn(false);
    }
  };

  // Test Outbound WhatsApp Cloud API Dispatch
  const handleTestWhatsApp = async () => {
    setIsTestingWa(true);
    setWaTestOutput(null);
    try {
      const res = await apiRequest<{
        success: boolean;
        configured: boolean;
        message?: string;
        deliveryId?: string;
        wamid?: string;
        status?: string;
      }>('/api/notifications/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({
          priority: waThreshold,
          phoneOverride: waPhoneInput,
          subject: 'Critical Security Alert: Immediate Action Required',
          summary: 'High-risk credential harvesting attempt detected originating from untrusted origin domain.',
        }),
      });

      setWaTestOutput(res);
      if (res.wamid) {
        setSimTargetWamid(res.wamid);
      }
      await fetchFeedData();
    } catch (err: any) {
      setWaTestOutput({
        success: false,
        configured: false,
        message: err.message || 'WhatsApp Cloud API is not configured.',
      });
    } finally {
      setIsTestingWa(false);
    }
  };

  // Simulate Meta Webhook Callback (sent -> delivered -> read -> failed)
  const handleSimulateWhatsAppWebhook = async () => {
    if (!simTargetWamid) {
      alert('Please provide or select a Meta Message ID (wamid) to simulate webhook status callback.');
      return;
    }
    setIsSimulatingWaWebhook(true);
    setSimWebhookOutput(null);
    try {
      const res = await apiRequest<any>('/api/notifications/whatsapp/simulate-webhook', {
        method: 'POST',
        body: JSON.stringify({
          wamid: simTargetWamid,
          status: simTargetStatus,
          errorDetails: simTargetStatus === 'failed' ? { code: simErrorCode, message: simErrorMessage } : undefined,
        }),
      });
      setSimWebhookOutput(res);
      await fetchFeedData();
    } catch (err: any) {
      setSimWebhookOutput({ error: err.message || 'Webhook simulation failed.' });
    } finally {
      setIsSimulatingWaWebhook(false);
    }
  };

  // Confirm / Ack a delivery receipt
  const handleConfirmDelivery = async (deliveryId: string) => {
    setConfirmingDeliveryId(deliveryId);
    try {
      const res = await apiRequest<{ success: boolean; delivery: NotificationDeliveryItem }>(
        `/api/notifications/deliveries/${deliveryId}/ack`,
        {
          method: 'POST',
          body: JSON.stringify({ userAgent: navigator.userAgent }),
        }
      );
      if (res.success && res.delivery) {
        setDeliveriesList((prev) =>
          prev.map((d) => (d.id === deliveryId ? res.delivery : d))
        );
      }
    } catch (err) {
      console.error('Failed to acknowledge delivery:', err);
    } finally {
      setConfirmingDeliveryId(null);
    }
  };

  // Mark notification as read
  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      await apiRequest(`/api/notifications/${notifId}/read`, { method: 'POST' });
      setNotificationsList((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  // Run Test Dispatch in Simulator
  const handleRunSimulation = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const data = await apiRequest<{ success: boolean; channel: string; decision: any; deliveries: NotificationDeliveryItem[] }>(
        '/api/notifications/test',
        {
          method: 'POST',
          body: JSON.stringify({
            channel: simChannel,
            priority: simPriority,
            subject: simSubject,
            bodyText: simBody,
          }),
        }
      );
      setSimResult(data);
      // Refresh feed
      fetchFeedData();
    } catch (err: any) {
      console.error('Simulation error:', err);
      setSimResult({ error: err.message || 'Test failed' });
    } finally {
      setSimulating(false);
    }
  };

  // Trigger Executive Digest
  const handleTriggerDigest = async () => {
    setIsSendingDigest(true);
    setDigestSuccess(null);
    try {
      const res = await apiRequest<{ success: boolean; aggregatedCount: number; digestNotification: NotificationItem }>(
        '/api/notifications/digest/send',
        { method: 'POST' }
      );
      setDigestSuccess(`Compiled & dispatched Executive Digest with ${res.aggregatedCount} aggregated items.`);
      fetchFeedData();
      setTimeout(() => setDigestSuccess(null), 5000);
    } catch (err: any) {
      console.error('Failed to send digest:', err);
      setDigestSuccess(`Error: ${err.message || 'Digest trigger failed'}`);
    } finally {
      setIsSendingDigest(false);
    }
  };

  const getChannelBadge = (ch: NotificationChannel) => {
    switch (ch) {
      case 'browser_push':
        return { label: 'Browser Push', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', icon: Bell };
      case 'mobile_push':
        return { label: 'Mobile Push', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: Smartphone };
      case 'desktop':
        return { label: 'Desktop OS', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Radio };
      case 'whatsapp':
        return { label: 'WhatsApp', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: MessageSquare };
      case 'daily_digest':
        return { label: 'Daily Digest', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: Calendar };
      default:
        return { label: ch, color: 'bg-slate-800 text-slate-300 border-slate-700', icon: Bell };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'read':
        return {
          label: 'Read (Handset)',
          color: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
          icon: CheckCheck,
        };
      case 'delivered':
        return {
          label: 'Delivered (ACK)',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          icon: CheckCheck,
        };
      case 'sent':
        return {
          label: 'Sent (Awaiting ACK)',
          color: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
          icon: Send,
        };
      case 'queued':
        return {
          label: 'Queued',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          icon: Clock,
        };
      case 'suppressed':
        return {
          label: 'Suppressed',
          color: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: VolumeX,
        };
      case 'failed':
        return {
          label: 'Failed',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          icon: XCircle,
        };
      case 'pending':
        return {
          label: 'Pending',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          icon: Clock,
        };
      default:
        return {
          label: status,
          color: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: Info,
        };
    }
  };

  const unconfirmedDeliveriesCount = deliveriesList.filter((d) => d.status === 'sent').length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 text-indigo-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Notification Engine</span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  REAL DECISION ENGINE
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Intelligent multi-channel routing, Quiet Hours overrides, thread deduplication, and verified delivery receipts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFeedData}
            disabled={isLoadingFeed}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
            title="Refresh Live Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoadingFeed ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-sm transition"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedSuccess ? 'Saved' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'preferences'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Rules & Preferences</span>
        </button>

        <button
          onClick={() => setActiveTab('devices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'devices'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>FCM Push Devices</span>
          {devicesList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] border border-cyan-500/40">
              {devicesList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'whatsapp'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          <span>WhatsApp Cloud API</span>
          {waStatus?.userOptIn?.optedIn ? (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[9px] border border-emerald-500/40">
              OPTED IN
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono text-[9px] border border-slate-700">
              OFFICIAL
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'ledger'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Live Delivery Ledger</span>
          {unconfirmedDeliveriesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/40">
              {unconfirmedDeliveriesCount} unconfirmed
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'simulator'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>Dispatch & Decision Simulator</span>
        </button>
      </div>

      {/* TAB 1: PREFERENCES & RULES */}
      {activeTab === 'preferences' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Channels & Triggers */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span>Cross-Channel Delivery Matrix</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Toggle and configure available delivery notification pathways.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {/* Browser Push */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Browser Web Push</span>
                  </span>
                  <p className="text-slate-400 text-[11px]">Real-time system banner notifications while browser is active or backgrounded.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.browserPushEnabled ?? localConfig.pushEnabled ?? true)}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, browserPushEnabled: e.target.checked, pushEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              {/* Mobile Push */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Mobile Push (FCM / PWA)</span>
                  </span>
                  <p className="text-slate-400 text-[11px]">Dispatches push payloads directly to enrolled user smartphone devices.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.mobilePushEnabled)}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, mobilePushEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              {/* Desktop / System */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-400" />
                    <span>Desktop Native OS Notifications</span>
                  </span>
                  <p className="text-slate-400 text-[11px]">Integrated system tray alerts on macOS, Windows, and Linux.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.desktopEnabled ?? true)}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, desktopEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              {/* WhatsApp Direct (Official WhatsApp Cloud API) */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp Business Platform Cloud API</span>
                    </span>
                    <p className="text-slate-400 text-[11px]">Official Meta Cloud API only. Unofficial automation is prohibited.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('whatsapp')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition"
                  >
                    <span>Manage</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Explicit Opt-In */}
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/80 space-y-1.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(localConfig.whatsappOptIn ?? localConfig.whatsappEnabled)}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          whatsappOptIn: e.target.checked,
                          whatsappEnabled: e.target.checked,
                          whatsappOptInTimestamp: e.target.checked ? new Date().toISOString() : undefined,
                        })
                      }
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-800 border-slate-600 cursor-pointer"
                    />
                    <div className="text-[11px] space-y-0.5">
                      <span className="font-semibold text-slate-200">Explicit User Opt-In (Mandatory)</span>
                      <p className="text-slate-400 text-[10px] leading-tight">
                        I explicitly consent to receive automated priority alerts via WhatsApp. Utility templates used outside 24h service window. Reply STOP to revoke.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                  <div>
                    <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Destination Phone (E.164)</label>
                    <input
                      type="tel"
                      placeholder="+14155552671"
                      value={localConfig.whatsappPhone || localConfig.whatsappNumber || ''}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          whatsappPhone: e.target.value,
                          whatsappNumber: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                      Threshold <span className="text-emerald-400">(Default: Critical)</span>
                    </label>
                    <select
                      value={localConfig.whatsappThreshold || 'Critical'}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          whatsappThreshold: e.target.value as any,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                    >
                      <option value="Critical">Critical (Default - Security alerts)</option>
                      <option value="High">High (Urgent actions)</option>
                      <option value="Medium">Medium (Actionable emails)</option>
                      <option value="Low">Low (All qualifying emails)</option>
                    </select>
                  </div>
                </div>

                {waStatus?.configured === false && (
                  <p className="text-[10px] text-amber-300 font-mono flex items-center gap-1 bg-amber-950/20 p-1.5 rounded border border-amber-800/30">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>WhatsApp notifications are not configured.</span>
                  </p>
                )}
              </div>

              {/* Daily Executive Digest */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>Executive Daily Digest</span>
                    </span>
                    <p className="text-slate-400 text-[11px]">Batches low and informational emails into an actionable morning brief.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localConfig.dailyDigestEnabled ?? true}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, dailyDigestEnabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </div>

                {localConfig.dailyDigestEnabled && (
                  <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Scheduled Dispatch Time</span>
                    <input
                      type="time"
                      value={localConfig.dailyDigestTime || '08:00'}
                      onChange={(e) =>
                        setLocalConfig({ ...localConfig, dailyDigestTime: e.target.value })
                      }
                      className="px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Anti-Fatigue & Quiet Hours */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Fatigue Protection & Priority Thresholds</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Fine-tune deduplication rules and emergency security override policies.</p>
            </div>

            <div className="space-y-4 text-xs">
              {/* Minimum Priority Selector */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Minimum Notification Threshold</span>
                  <span className="text-[10px] font-mono text-cyan-400">Current: {localConfig.minPriorityLevel || 'High'}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Emails below this threshold are routed to the Daily Digest or suppressed:
                </p>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() =>
                        setLocalConfig({
                          ...localConfig,
                          minPriorityLevel: level as any,
                          minimumPriorityForPush: level as any,
                        })
                      }
                      className={`py-2 rounded-lg text-center font-bold transition ${
                        (localConfig.minPriorityLevel || 'High') === level
                          ? level === 'Critical'
                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500'
                            : level === 'High'
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500'
                            : level === 'Medium'
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-500'
                            : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500'
                          : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Thread Deduplication Window */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Thread Deduplication Window</span>
                  </span>
                  <span className="text-[10px] font-mono text-indigo-300">
                    {localConfig.threadDeduplicationWindowMinutes || 60} minutes
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Prevents alert spamming: Do not send 5 alerts for 5 rapid replies in the same thread. Subsequent messages are suppressed unless escalated to Critical threat.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        setLocalConfig({
                          ...localConfig,
                          threadDeduplicationWindowMinutes: mins,
                        })
                      }
                      className={`py-1.5 rounded-lg text-center font-mono text-xs transition ${
                        (localConfig.threadDeduplicationWindowMinutes || 60) === mins
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Hours & Security Override */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      {(localConfig.quietHours?.enabled ?? localConfig.quietHoursEnabled) ? (
                        <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Quiet Hours Schedule</span>
                    </span>
                    <p className="text-slate-400 text-[11px]">Suppress notifications during focus or sleep periods.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(localConfig.quietHours?.enabled ?? localConfig.quietHoursEnabled ?? false)}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setLocalConfig({
                        ...localConfig,
                        quietHoursEnabled: enabled,
                        quietHours: {
                          enabled,
                          start: localConfig.quietHours?.start || localConfig.quietHoursStart || '22:00',
                          end: localConfig.quietHours?.end || localConfig.quietHoursEnd || '07:00',
                          allowCriticalSecurity: localConfig.quietHours?.allowCriticalSecurity ?? true,
                        },
                      });
                    }}
                    className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </div>

                {(localConfig.quietHours?.enabled ?? localConfig.quietHoursEnabled) && (
                  <div className="pt-2 border-t border-slate-700/60 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={localConfig.quietHours?.start || localConfig.quietHoursStart || '22:00'}
                        onChange={(e) => {
                          const start = e.target.value;
                          setLocalConfig({
                            ...localConfig,
                            quietHoursStart: start,
                            quietHours: {
                              ...(localConfig.quietHours || { enabled: true, end: '07:00', allowCriticalSecurity: true }),
                              start,
                            },
                          });
                        }}
                        className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">End Time</label>
                      <input
                        type="time"
                        value={localConfig.quietHours?.end || localConfig.quietHoursEnd || '07:00'}
                        onChange={(e) => {
                          const end = e.target.value;
                          setLocalConfig({
                            ...localConfig,
                            quietHoursEnd: end,
                            quietHours: {
                              ...(localConfig.quietHours || { enabled: true, start: '22:00', allowCriticalSecurity: true }),
                              end,
                            },
                          });
                        }}
                        className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Critical Security Quiet Hours Override */}
              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Security Alert Quiet Hours Override</span>
                  </span>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Strict rule enforcement: Security alerts can override Quiet Hours <strong className="text-slate-200">only when the user has enabled that behavior</strong>. If unchecked, all alerts including phishing attacks will be muted during Quiet Hours.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(localConfig.quietHours?.allowCriticalSecurity ?? true)}
                  onChange={(e) => {
                    const allowCriticalSecurity = e.target.checked;
                    setLocalConfig({
                      ...localConfig,
                      quietHours: {
                        ...(localConfig.quietHours || { enabled: false, start: '22:00', end: '07:00' }),
                        allowCriticalSecurity,
                      },
                    });
                  }}
                  className="w-4 h-4 mt-0.5 rounded-sm text-rose-600 focus:ring-rose-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FCM PUSH DEVICES */}
      {activeTab === 'devices' && (
        <div className="space-y-6">
          {/* FCM Status Banner */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${fcmStatus?.configured ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">Firebase Cloud Messaging Registry</h2>
                    {fcmStatus?.configured ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>FCM ACTIVE</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>CONFIGURATION REQUIRED</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real Web &amp; Android push token registration, device management, and automatic invalid token removal.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchDevicesData}
                  disabled={isLoadingDevices}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                  <span>Refresh Registry</span>
                </button>
              </div>
            </div>

            {/* If FCM is not configured, explicitly display the exact requirement banner */}
            {!fcmStatus?.configured && (
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Push notifications are not configured.</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Firebase Cloud Messaging server-side credentials are not active or the Cloud Messaging API has not been granted message creation permissions (<code className="text-amber-300/90 font-mono">cloudmessaging.messages.create</code>). 
                  MailSentinel accurately surfaces this status rather than falsely claiming delivery. Device registration, token lifecycle, and local device registry persistence remain fully functional.
                </p>
              </div>
            )}

            {/* Quick Actions Panel */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleRegisterDevice('web')}
                disabled={isRegisteringDevice}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition"
              >
                <Laptop className="w-3.5 h-3.5 text-indigo-200" />
                <span>{isRegisteringDevice ? 'Enrolling...' : 'Register This Browser / Web Device'}</span>
              </button>

              <button
                type="button"
                onClick={handleRegisterDemoAndroidDevice}
                disabled={isRegisteringDevice}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-medium text-xs flex items-center gap-2 transition"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>Enroll Android Push Device</span>
              </button>

              <button
                type="button"
                onClick={() => handleTestFcm()}
                disabled={isTestingFcm || devicesList.length === 0}
                className="px-4 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 disabled:opacity-50 text-cyan-300 font-medium text-xs flex items-center gap-2 transition"
                title={devicesList.length === 0 ? 'Register a device first' : 'Test dispatch'}
              >
                <Send className={`w-3.5 h-3.5 ${isTestingFcm ? 'animate-pulse' : ''}`} />
                <span>{isTestingFcm ? 'Dispatching...' : 'Dispatch FCM Test Alert'}</span>
              </button>
            </div>

            {/* Feedback message banner */}
            {registerFeedback && (
              <div className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                registerFeedback.success
                  ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {registerFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{registerFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRegisterFeedback(null)}
                  className="text-slate-400 hover:text-white text-xs px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* FCM Test Output Box */}
            {fcmTestOutput && (
              <div className={`p-4 rounded-xl border space-y-2 text-xs ${
                fcmTestOutput.success
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>FCM Dispatch Test Telemetry</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                    fcmTestOutput.configured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {fcmTestOutput.configured ? 'FCM CONFIGURED' : 'PUSH UNCONFIGURED'}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-white">{fcmTestOutput.message}</p>
                  {fcmTestOutput.results && fcmTestOutput.results.length > 0 && (
                    <div className="mt-2 space-y-1.5 font-mono text-[11px]">
                      {fcmTestOutput.results.map((res: any, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">Device: {res.deviceId} ({res.platform})</span>
                          <span className={res.status === 'delivered' ? 'text-emerald-400' : res.status === 'sent' ? 'text-sky-400' : 'text-rose-400'}>
                            {res.status.toUpperCase()} {res.error ? `(${res.error})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Registered Devices List */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>Enrolled FCM Devices ({devicesList.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Devices actively receiving MailSentinel Critical/High priority push notifications.
                </p>
              </div>
            </div>

            {devicesList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-3">
                <Smartphone className="w-10 h-10 mx-auto text-slate-600" />
                <p>No push notification devices enrolled yet.</p>
                <button
                  type="button"
                  onClick={() => handleRegisterDevice('web')}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition inline-flex items-center gap-1.5"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Register This Browser</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {devicesList.map((dev) => {
                  const isWeb = dev.platform === 'web';
                  const isAndroid = dev.platform === 'android';
                  const PlatformIcon = isWeb ? Laptop : Smartphone;

                  return (
                    <div
                      key={dev.id || dev.deviceId}
                      className="p-4 rounded-xl bg-slate-800/70 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-slate-600"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl border mt-0.5 ${
                          dev.enabled
                            ? isAndroid
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                        }`}>
                          <PlatformIcon className="w-4 h-4" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-xs">{dev.deviceId}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-900 text-slate-300 border border-slate-700">
                              {dev.platform}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              dev.enabled
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {dev.enabled ? 'ACTIVE' : 'DISABLED'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-slate-500">Token:</span>
                            <span className="font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded text-[10px] max-w-[240px] truncate">
                              {dev.pushToken}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(dev.pushToken);
                                setCopiedTokenId(dev.deviceId);
                                setTimeout(() => setCopiedTokenId(null), 2000);
                              }}
                              className="text-slate-400 hover:text-white transition"
                              title="Copy Token"
                            >
                              {copiedTokenId === dev.deviceId ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            <span>Enrolled: {new Date(dev.createdAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>Last Seen: {new Date(dev.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {dev.userAgent && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[200px]" title={dev.userAgent}>
                                  {dev.userAgent.split(' ')[0]}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Device Row Action Buttons */}
                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleDevice(dev.deviceId, dev.enabled)}
                          className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                            dev.enabled
                              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                          title={dev.enabled ? 'Disable Notifications' : 'Enable Notifications'}
                        >
                          {dev.enabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                          <span className="text-[10px] hidden sm:inline">{dev.enabled ? 'Enabled' : 'Disabled'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRefreshToken(dev.deviceId)}
                          disabled={refreshingDeviceId === dev.deviceId}
                          className="px-2.5 py-1 text-xs rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                          title="Refresh Push Token"
                        >
                          <RefreshCw className={`w-3 h-3 text-cyan-400 ${refreshingDeviceId === dev.deviceId ? 'animate-spin' : ''}`} />
                          <span className="text-[11px] hidden sm:inline">Refresh</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTestFcm(dev.deviceId)}
                          disabled={isTestingFcm || !dev.enabled}
                          className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition disabled:opacity-50"
                          title="Test Direct FCM Push"
                        >
                          <Send className="w-3 h-3 text-indigo-400" />
                          <span className="text-[11px]">Test</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDevice(dev.deviceId)}
                          className="p-1.5 text-xs rounded-lg bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 border border-rose-800/30 transition"
                          title="Remove Device & Revoke Token"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* FCM Architecture & Token Removal Assurance Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>MailSentinel FCM Dispatch Protocol</span>
            </h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              When a Critical or High priority email qualifies for notification:
              <span className="font-mono text-cyan-300 mx-1">Email → Notification Engine → FCM → User Device</span>.
              If Firebase returns an expired or unregistered token error (<code className="text-rose-300 font-mono">messaging/invalid-registration-token</code> or <code className="text-rose-300 font-mono">messaging/registration-token-not-registered</code>), the token and device are automatically pruned from the database to prevent stale attempts.
            </p>
          </div>
        </div>
      )}

      {/* TAB: WHATSAPP CLOUD API (STEP 10) */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          {/* Status & Compliance Banner */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>WhatsApp Business Platform Cloud API</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      META GRAPH API v21.0
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Official Meta Cloud API only. Unofficial WhatsApp automation or web scraping is strictly prohibited.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {waStatus?.configured ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Meta Cloud API Configured ({waStatus.phoneNumberIdMasked})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/30 border border-amber-600/40 text-amber-300 text-xs font-mono">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>WhatsApp Cloud API is not configured.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Architecture Guarantees & Credentials Safety */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Server-Side Credentials</span>
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  WhatsApp Access Tokens, Phone Number IDs, and App Secrets are never exposed to client browsers. All calls proxy through <code className="text-slate-300 font-mono">/server/whatsappService.ts</code>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Explicit User Opt-In</span>
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  User consent is recorded with explicit opt-in confirmation and timestamps. Default threshold is set strictly to <strong className="text-emerald-300">Critical only</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <CheckCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Strict Delivery Tracking</span>
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  HTTP 200 only confirms queued/sent status. Handset delivery and read states require verified Meta webhook callbacks.
                </p>
              </div>
            </div>
          </div>

          {/* Configuration & Explicit Opt-In Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Opt-In Card */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp Opt-In & Threshold Settings</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure your destination phone number, opt-in consent, and qualification priority threshold.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* Phone Number Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200">
                    Recipient WhatsApp Phone Number (E.164 Format)
                  </label>
                  <input
                    type="tel"
                    placeholder="+14155552671"
                    value={waPhoneInput}
                    onChange={(e) => setWaPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Must include international country code (e.g., <code className="text-slate-300 font-mono">+1</code> for US/Canada, <code className="text-slate-300 font-mono">+44</code> for UK).
                  </p>
                </div>

                {/* Threshold Configuration */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-200 flex items-center justify-between">
                    <span>Notification Threshold</span>
                    <span className="text-[11px] text-emerald-400 font-mono">Default: Critical only</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['Critical', 'High', 'Medium', 'Low'] as PriorityLevel[]).map((lvl) => {
                      const isSelected = waThreshold === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setWaThreshold(lvl)}
                          className={`px-3 py-2 rounded-xl text-center border font-medium transition ${
                            isSelected
                              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500'
                              : 'bg-slate-800/40 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                          }`}
                        >
                          <div className="font-bold text-xs">{lvl}</div>
                          <div className="text-[10px] opacity-70">
                            {lvl === 'Critical' ? 'Recommended' : lvl === 'High' ? 'Urgent' : lvl === 'Medium' ? 'Actionable' : 'All'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Only incoming emails evaluated at or above <strong className="text-slate-200">{waThreshold}</strong> priority will trigger an automated WhatsApp alert.
                  </p>
                </div>

                {/* Explicit Opt-In Consent Statement */}
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-emerald-500/30 space-y-2.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(waOptInChecked)}
                      onChange={(e) => setWaOptInChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-600 cursor-pointer"
                    />
                    <div className="space-y-1 text-xs">
                      <span className="font-bold text-white block">Explicit Consent Declaration</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        I explicitly consent to receive automated MailSentinel security and priority email alerts via WhatsApp at this phone number. I understand utility templates will be used for notifications outside the Meta 24-hour service window. I can revoke consent at any time by unchecking this box or replying <strong>STOP</strong> in WhatsApp.
                      </p>
                    </div>
                  </label>

                  {waStatus?.userOptIn?.optInTimestamp && (
                    <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Opt-In Confirmed At:</span>
                      <span className="text-emerald-400">{new Date(waStatus.userOptIn.optInTimestamp).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {waOptInFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      waOptInFeedback.success
                        ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {waOptInFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{waOptInFeedback.message}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveWhatsAppOptIn}
                    disabled={isSavingWaOptIn}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-50"
                  >
                    {isSavingWaOptIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{waOptInChecked ? 'Save & Confirm Opt-In' : 'Save WhatsApp Preferences'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={isTestingWa || !waOptInChecked}
                    className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-40"
                    title={!waOptInChecked ? 'Must opt in first to dispatch test' : 'Send test message via WhatsApp'}
                  >
                    {isTestingWa ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>Test Dispatch</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Utility Template Preview & Compliance Card */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span>Meta Utility Template (Outside 24h Window)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proactive notifications outside the 24-hour customer service window require pre-approved utility templates.
                  </p>
                </div>
              </div>

              {/* Template Specification */}
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Template Identifier:</span>
                    <code className="text-cyan-300 font-mono font-semibold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
                      {waStatus?.templateName || 'mailsentinel_critical_alert_v1'}
                    </code>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Category / Language:</span>
                    <span className="text-slate-200 font-mono">UTILITY / en_US</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Policy Rules:</span>
                    <span className="text-emerald-400">Meta WhatsApp Business Policy Compliant</span>
                  </div>
                </div>

                {/* Simulated WhatsApp Chat Bubble */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
                    <span>Template Render Preview:</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live Spec
                    </span>
                  </div>

                  <div className="max-w-sm ml-auto p-3.5 rounded-2xl rounded-tr-xs bg-[#005c4b] text-slate-100 shadow-md space-y-2 text-xs">
                    <p className="leading-relaxed">
                      🚨 New <strong className="text-amber-300">{waThreshold}</strong> email from <strong className="text-white">security@company.com</strong>: Urgent security audit verification requested for production cluster credentials.
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-emerald-200/70 pt-1 border-t border-emerald-600/30">
                      <span>MailSentinel Sentinel</span>
                      <div className="flex items-center gap-1">
                        <span>10:42 AM</span>
                        <CheckCheck className="w-3.5 h-3.5 text-cyan-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inbound Keyword Handling */}
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1.5">
                  <h5 className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                    <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Inbound Keyword Webhook Handling</span>
                  </h5>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Users can reply with standard opt-out keywords directly in WhatsApp. Replying <code className="text-rose-300 font-mono">STOP</code> or <code className="text-rose-300 font-mono">UNSUBSCRIBE</code> immediately revokes consent via our webhook. Replying <code className="text-emerald-300 font-mono">START</code> or <code className="text-emerald-300 font-mono">OPTIN</code> restores consent.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Test Dispatch Result Output (if any) */}
          {waTestOutput && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                waTestOutput.success
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                  : 'bg-amber-950/20 border-amber-500/30 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  {waTestOutput.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>WhatsApp Dispatch Test Result</span>
                </span>
                <span className="font-mono text-[10px] uppercase">
                  Status: {waTestOutput.status || (waTestOutput.success ? 'Queued / Sent' : 'Failed')}
                </span>
              </div>
              <p className="text-slate-300 text-[11px]">{waTestOutput.message}</p>

              {waTestOutput.wamid && (
                <div className="p-2.5 rounded-lg bg-slate-900 font-mono text-[11px] text-cyan-300 flex items-center justify-between">
                  <span>Meta Message ID (wamid):</span>
                  <span className="select-all font-bold">{waTestOutput.wamid}</span>
                </div>
              )}

              {!waTestOutput.configured && (
                <p className="text-amber-300 text-[11px] font-mono">
                  &quot;WhatsApp Cloud API is not configured.&quot; Delivery was recorded as failed rather than claiming fake delivery.
                </p>
              )}
            </div>
          )}

          {/* Meta Webhook Simulator & Delivery State Transitions */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-400" />
                  <span>Meta Webhook Callback Simulator (Diagnostic Engine)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulate official Meta webhook callbacks to verify lifecycle status transitions (<code className="text-slate-300 font-mono">queued → sent → delivered → read → failed</code>).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400 font-medium">Meta Message ID (wamid)</label>
                <input
                  type="text"
                  placeholder="wamid.HBgL..."
                  value={simTargetWamid || ''}
                  onChange={(e) => setSimTargetWamid(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white font-mono placeholder-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400 font-medium">Target Webhook Status Event</label>
                <select
                  value={simTargetStatus || 'delivered'}
                  onChange={(e) => setSimTargetStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-slate-700 text-white"
                >
                  <option value="delivered">delivered (Handset delivery receipt)</option>
                  <option value="read">read (User opened & read message)</option>
                  <option value="failed">failed (Handset unreachable / error)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSimulateWhatsAppWebhook}
                  disabled={isSimulatingWaWebhook || !simTargetWamid}
                  className="w-full py-2 px-4 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                >
                  {isSimulatingWaWebhook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Simulate Meta Callback</span>
                </button>
              </div>
            </div>

            {simWebhookOutput && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1">
                <div className="text-slate-400">Webhook Simulation Response:</div>
                <pre className="text-teal-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(simWebhookOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* WhatsApp Deliveries Table */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>WhatsApp Delivery Lifecycle Ledger ({deliveriesList.filter((d) => d.channel === 'whatsapp').length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time status transitions. Deliveries are never claimed based only on HTTP 200.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchFeedData}
                className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync</span>
              </button>
            </div>

            {deliveriesList.filter((d) => d.channel === 'whatsapp').length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-3">
                <MessageSquare className="w-10 h-10 mx-auto text-slate-600" />
                <p>No WhatsApp dispatches recorded yet.</p>
                <p className="text-slate-500 text-[11px]">
                  Dispatch a test alert or send an incoming email matching the configured threshold to see the lifecycle.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Message ID (wamid)</th>
                      <th className="py-2.5 px-3">Priority</th>
                      <th className="py-2.5 px-3">Summary / Details</th>
                      <th className="py-2.5 px-3">Timestamps</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {deliveriesList
                      .filter((d) => d.channel === 'whatsapp')
                      .map((d) => {
                        const statusBadge = getStatusBadge(d.status);
                        const StatusIcon = statusBadge.icon;
                        return (
                          <tr key={d.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadge.color}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                <span>{statusBadge.label}</span>
                              </span>
                            </td>

                            <td className="py-3 px-3 font-mono text-[11px]">
                              {d.whatsappMessageId ? (
                                <button
                                  type="button"
                                  onClick={() => setSimTargetWamid(d.whatsappMessageId!)}
                                  className="text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                                  title="Click to populate simulator"
                                >
                                  <span>{d.whatsappMessageId.slice(0, 16)}...</span>
                                  <Copy className="w-2.5 h-2.5 text-slate-500" />
                                </button>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  d.priority === 'Critical'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : d.priority === 'High'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-blue-500/20 text-blue-300'
                                }`}
                              >
                                {d.priority}
                              </span>
                            </td>

                            <td className="py-3 px-3 max-w-xs">
                              <div className="font-semibold text-white truncate">{d.subject}</div>
                              {d.failureReason && (
                                <div className="text-[10px] text-rose-400 truncate mt-0.5">
                                  Err: {d.failureReason}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-[10px] text-slate-400 font-mono space-y-0.5">
                              <div>Sent: {new Date(d.sentAt).toLocaleTimeString()}</div>
                              {d.deliveredAt && (
                                <div className="text-emerald-400">Delivered: {new Date(d.deliveredAt).toLocaleTimeString()}</div>
                              )}
                              {d.readAt && (
                                <div className="text-teal-400">Read: {new Date(d.readAt).toLocaleTimeString()}</div>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right">
                              {d.whatsappMessageId && d.status !== 'read' && d.status !== 'failed' && (
                                <div className="flex items-center justify-end gap-1">
                                  {d.status === 'sent' && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        setSimTargetWamid(d.whatsappMessageId!);
                                        await apiRequest('/api/notifications/whatsapp/simulate-webhook', {
                                          method: 'POST',
                                          body: JSON.stringify({ wamid: d.whatsappMessageId, status: 'delivered' }),
                                        });
                                        await fetchFeedData();
                                      }}
                                      className="px-2 py-1 text-[10px] rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/40 transition"
                                      title="Simulate Handset Delivered"
                                    >
                                      ACK Delivered
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setSimTargetWamid(d.whatsappMessageId!);
                                      await apiRequest('/api/notifications/whatsapp/simulate-webhook', {
                                        method: 'POST',
                                        body: JSON.stringify({ wamid: d.whatsappMessageId, status: 'read' }),
                                      });
                                      await fetchFeedData();
                                    }}
                                    className="px-2 py-1 text-[10px] rounded bg-teal-950/40 text-teal-300 border border-teal-500/30 hover:bg-teal-900/40 transition"
                                    title="Simulate Handset Read"
                                  >
                                    ACK Read
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Meta Developer Webhook Ingestion Guide Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Meta Webhook Integration Architecture</span>
            </h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Meta Webhook endpoint: <code className="text-slate-200 font-mono">/api/webhooks/whatsapp</code>.
              During verification, handles Meta challenge queries (<code className="text-slate-200 font-mono">hub.challenge</code>) with configured <code className="text-slate-200 font-mono">WHATSAPP_VERIFY_TOKEN</code>.
              Payload events are signed with HMAC SHA-256 using <code className="text-slate-200 font-mono">WHATSAPP_APP_SECRET</code> in the <code className="text-slate-200 font-mono">X-Hub-Signature-256</code> header.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE DELIVERY LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Multi-Channel Delivery Ledger</h3>
                <p className="text-[11px] text-slate-400">
                  Records all dispatches across browser push, mobile, desktop, WhatsApp, and daily digests. Deliveries remain &apos;sent&apos; until cryptographically or client confirmed.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTriggerDigest}
                disabled={isSendingDigest}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isSendingDigest ? 'Dispatching...' : 'Dispatch Daily Digest Now'}</span>
              </button>
            </div>
          </div>

          {digestSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{digestSuccess}</span>
            </div>
          )}

          {/* Delivery Records Table / Feed */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Recent Channel Deliveries ({deliveriesList.length})</h3>
              <span className="text-[10px] text-slate-400 font-mono">Real-time status tracking</span>
            </div>

            {deliveriesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-slate-600" />
                <p>No delivery records yet. Trigger a test dispatch in the Simulator to inspect live decision logs.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {deliveriesList.slice(0, 50).map((deliv) => {
                  const channelInfo = getChannelBadge(deliv.channel);
                  const statusInfo = getStatusBadge(deliv.status);
                  const ChannelIcon = channelInfo.icon;
                  const StatusIcon = statusInfo.icon;

                  return (
                    <div key={deliv.id} className="p-4 hover:bg-slate-800/30 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Channel Badge */}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] border ${channelInfo.color}`}>
                            <ChannelIcon className="w-3 h-3" />
                            <span>{channelInfo.label}</span>
                          </span>

                          {/* Status Badge */}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] border ${statusInfo.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            <span>{statusInfo.label}</span>
                          </span>

                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(deliv.createdAt).toLocaleString()}
                          </span>

                          {deliv.threadId && (
                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                              Thread: {deliv.threadId}
                            </span>
                          )}
                        </div>

                        {/* Reason / Payload summary */}
                        {deliv.reason && (
                          <p className="text-[11px] text-amber-300/90 font-mono bg-amber-950/20 px-2 py-1 rounded border border-amber-800/30">
                            <strong>Reason:</strong> {deliv.reason}
                          </p>
                        )}

                        {deliv.error && (
                          <p className="text-[11px] text-rose-300/90 font-mono bg-rose-950/20 px-2 py-1 rounded border border-rose-800/30">
                            <strong>Error:</strong> {deliv.error}
                          </p>
                        )}

                        {deliv.payload?.title && (
                          <p className="text-[11px] text-slate-300 truncate">
                            <span className="text-slate-400 font-medium">Payload:</span> {deliv.payload.title}
                          </p>
                        )}
                      </div>

                      {/* Interactive ACK confirmation action */}
                      <div className="shrink-0 flex items-center gap-2">
                        {deliv.status === 'sent' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmDelivery(deliv.id)}
                            disabled={confirmingDeliveryId === deliv.id}
                            className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition"
                            title="Confirm client received notification and record ACK"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>{confirmingDeliveryId === deliv.id ? 'Confirming...' : 'Confirm Delivery (ACK)'}</span>
                          </button>
                        )}

                        {deliv.status === 'delivered' && deliv.deliveredAt && (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Confirmed {new Date(deliv.deliveredAt).toLocaleTimeString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* In-App Notifications List */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">In-App Notification Ledger ({notificationsList.length})</h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {notificationsList.filter((n) => !n.read).length} unread
              </span>
            </div>

            {notificationsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <Bell className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                No in-app notifications generated yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {notificationsList.slice(0, 30).map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 transition flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs ${
                      item.read ? 'bg-slate-900/50 opacity-80' : 'bg-slate-850'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.isSecurityAlert ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>SECURITY ALERT: {item.securityClassification || 'THREAT'}</span>
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              item.priority === 'Critical'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : item.priority === 'High'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {item.priority}
                          </span>
                        )}

                        <span className="font-semibold text-white">{item.title}</span>

                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-normal">{item.body}</p>

                      {/* Decision Engine Reasons */}
                      {item.decisionReasons && item.decisionReasons.length > 0 && (
                        <div className="pt-1 space-y-0.5">
                          <span className="text-[10px] font-mono uppercase text-slate-400">Evaluation Logic:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.decisionReasons.map((reason, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-cyan-300/90 border border-slate-700 font-mono"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => handleMarkNotificationRead(item.id)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0 transition"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DISPATCH & DECISION SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Simulator Form */}
          <div className="lg:col-span-1 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>Decision Engine Diagnostic</span>
              </h2>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Dispatch an email through the decision engine to verify channel qualification, Quiet Hours, and delivery statuses.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Target Channel</label>
                <select
                  value={simChannel || 'browser_push'}
                  onChange={(e) => setSimChannel(e.target.value as NotificationChannel)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono"
                >
                  <option value="browser_push">Browser Push</option>
                  <option value="mobile_push">Mobile Push</option>
                  <option value="desktop">Desktop / OS</option>
                  <option value="whatsapp">WhatsApp Direct</option>
                  <option value="daily_digest">Daily Digest</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Simulated Priority</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Critical', 'High', 'Medium', 'Low'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSimPriority(p)}
                      className={`py-1.5 rounded-lg text-center font-bold text-[11px] transition ${
                        simPriority === p
                          ? p === 'Critical'
                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500'
                            : p === 'High'
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500'
                            : p === 'Medium'
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-500'
                            : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Email Subject</label>
                <input
                  type="text"
                  value={simSubject || ''}
                  onChange={(e) => setSimSubject(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Email Body</label>
                <textarea
                  rows={3}
                  value={simBody || ''}
                  onChange={(e) => setSimBody(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                />
              </div>

              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating}
                className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 font-semibold text-white flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Send className={`w-3.5 h-3.5 ${simulating ? 'animate-pulse' : ''}`} />
                <span>{simulating ? 'Evaluating...' : 'Dispatch Diagnostic Test'}</span>
              </button>
            </div>
          </div>

          {/* Simulator Result View */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Telemetry & Decision Analysis</span>
                </h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Real-time breakdown of the engine&apos;s channel selection and rules.</p>
              </div>

              {simResult && (
                <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  EVALUATED
                </span>
              )}
            </div>

            {!simResult ? (
              <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                <Radio className="w-8 h-8 mx-auto text-slate-600" />
                <p>Run a diagnostic dispatch from the left panel to observe live telemetry.</p>
              </div>
            ) : simResult.error ? (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{simResult.error}</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Decision Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">Effective Priority</span>
                    <span className="font-bold text-sm text-white">{simResult.decision?.effectivePriority}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">Security Alert</span>
                    <span className={`font-bold text-sm ${simResult.decision?.isSecurityAlert ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {simResult.decision?.isSecurityAlert ? 'FLAGGED' : 'SAFE'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">Channels Attempted</span>
                    <span className="font-bold text-sm text-cyan-400 font-mono">
                      {simResult.decision?.channelsAttempted?.length || 0} channels
                    </span>
                  </div>
                </div>

                {/* Decision Reasons */}
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2">
                  <span className="font-semibold text-slate-200 block text-[11px]">Evaluation Decision Factors:</span>
                  <div className="space-y-1">
                    {simResult.decision?.decisionReasons?.map((r: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Generated Deliveries */}
                <div className="space-y-2">
                  <span className="font-semibold text-slate-200 block text-[11px]">Generated Deliveries:</span>
                  <div className="space-y-2">
                    {simResult.deliveries?.map((d: NotificationDeliveryItem) => {
                      const chInfo = getChannelBadge(d.channel);
                      const stInfo = getStatusBadge(d.status);
                      const ChIcon = chInfo.icon;
                      const StIcon = stInfo.icon;

                      return (
                        <div key={d.id} className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${chInfo.color} flex items-center gap-1`}>
                              <ChIcon className="w-3 h-3" />
                              <span>{chInfo.label}</span>
                            </span>

                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${stInfo.color} flex items-center gap-1`}>
                              <StIcon className="w-3 h-3" />
                              <span>{stInfo.label}</span>
                            </span>
                          </div>

                          {d.status === 'sent' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmDelivery(d.id)}
                              className="px-2.5 py-1 text-[11px] rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Confirm Delivery (ACK)</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
