export type EmailProvider = 'gmail' | 'outlook';

export type AccountStatus =
  | 'Connected'
  | 'Syncing'
  | 'Needs Reauthentication'
  | 'Error'
  | 'Disconnected'
  | 'active'
  | 'needs_reauth'
  | 'syncing'
  | 'error'
  | 'disconnected';

export interface EmailAccount {
  id: string;
  provider: EmailProvider;
  emailAddress: string;
  displayName: string;
  status: AccountStatus;
  lastSyncedAt: string;
  totalEmails: number;
  threatsDetected: number;
  isPrimary?: boolean;
  unreadCount?: number;
  errorMessage?: string;
}

export type EmailCategory =
  | 'financial'
  | 'academic'
  | 'career'
  | 'business'
  | 'personal'
  | 'security'
  | 'government'
  | 'shopping'
  | 'travel'
  | 'marketing'
  | 'newsletter'
  | 'social'
  | 'notification'
  | 'spam'
  | 'other';

export type SecurityClassification = 'SAFE' | 'SUSPICIOUS' | 'PHISHING' | 'SPAM' | 'MALICIOUS';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';

export interface SecurityIndicator {
  type:
    | 'sender_domain_mismatch'
    | 'reply_to_mismatch'
    | 'spf_failure'
    | 'dkim_failure'
    | 'dmarc_failure'
    | 'suspicious_url'
    | 'lookalike_domain'
    | 'credential_request'
    | 'financial_request'
    | 'urgency_manipulation'
    | 'brand_impersonation'
    | 'suspicious_attachment'
    | 'ip_url'
    | 'clean';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  confidence: number;
  detail?: string;
}

export interface AuthenticationResult {
  spf: 'PASS' | 'FAIL' | 'NEUTRAL' | 'NONE';
  dkim: 'PASS' | 'FAIL' | 'NONE';
  dmarc: 'PASS' | 'FAIL' | 'NONE';
  details?: string;
}

export interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  securityStatus: 'SAFE' | 'SUSPICIOUS' | 'FLAGGED';
  flagReason?: string;
}

export interface ExtractedEntity {
  type:
    | 'deadline'
    | 'meeting'
    | 'task'
    | 'amount'
    | 'person'
    | 'organization'
    | 'phone'
    | 'location'
    | 'url'
    | 'invoice_number'
    | 'tracking_number';
  value: string;
  context?: string;
}

export interface EventInformation {
  title: string;
  summary?: string;
  description?: string;
  startTime: string; // ISO 8601 string or valid date string
  endTime?: string;   // ISO 8601 string or valid date string
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
}

export interface AIAnalysis {
  category: EmailCategory;
  priority: PriorityLevel;
  priorityScore: number; // 0 - 100
  summary: string;
  sentiment: 'positive' | 'neutral' | 'urgent' | 'negative';
  actionRequired: boolean;
  recommendedAction: string;
  deadline: string | null;
  extractedEntities: ExtractedEntity[];
  whyPriorityReasons: string[];
  confidence: number;
  eventInformation?: EventInformation | null;
  urgency?: 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
  tasks?: Array<{ id: string; title: string; dueDate?: string | null; completed: boolean }>;
  version?: string;
  processedAt?: string;
  notificationDecision?: {
    shouldNotify: boolean;
    channel: 'urgent' | 'standard' | 'silent';
    reason: string;
  };
}

export interface SecurityAnalysis {
  classification: SecurityClassification;
  riskScore: number; // 0 - 100
  phishingScore: number;
  spamScore: number;
  spoofingScore: number;
  riskLevel: 'Safe' | 'Low Risk' | 'Suspicious' | 'High Risk' | 'Critical';
  indicators: SecurityIndicator[];
  authResults: AuthenticationResult;
  whyFlaggedReasons: string[];
  senderDomainAnalysis: {
    displayName: string;
    senderEmail: string;
    domain: string;
    isLookalike: boolean;
    matchedBrand?: string;
    replyToMatch: boolean;
    replyTo?: string;
  };
  urlAnalysis: {
    totalUrls: number;
    suspiciousUrls: {
      url: string;
      displayText: string;
      reason: string;
      risk: 'high' | 'medium' | 'low';
    }[];
  };
}

export interface Email {
  id: string;
  providerMessageId?: string;
  providerThreadId?: string;
  accountId: string;
  accountEmail?: string;
  userId?: string;
  provider?: EmailProvider;
  threadId: string;
  sender: string;
  senderName: string;
  senderDomain: string;
  recipients?: string[];
  recipient?: string;
  cc?: string[];
  replyTo?: string;
  subject: string;
  bodySnippet?: string;
  snippet?: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  labels?: string[];
  isRead: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  isQuarantined: boolean;
  hasAttachment?: boolean;
  hasAttachments?: boolean;
  attachments?: AttachmentInfo[];
  aiAnalysis?: AIAnalysis;
  securityAnalysis?: SecurityAnalysis;
  tags?: string[];
  category?: string;
  priority?: string;
}

export interface QuarantineItem {
  id: string;
  emailId: string;
  email: Email;
  quarantinedAt: string;
  reason: string;
  riskScore: number;
  status: 'quarantined' | 'released' | 'deleted' | 'reported';
}

export interface WhitelistBlacklistEntry {
  id: string;
  type: 'email' | 'domain';
  value: string;
  listType: 'whitelist' | 'blacklist';
  addedAt: string;
  reason?: string;
}

export interface SecurityRule {
  id: string;
  name: string;
  condition: any;
  action: any;
  actionValue?: string;
  isEnabled?: boolean;
  isActive?: boolean;
  enabled?: boolean;
  description?: string;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
  actionType?: string;
}

export type AutomationRule = SecurityRule;

export interface SecurityAlert {
  id: string;
  timestamp: string;
  emailId?: string;
  emailSubject?: string;
  accountEmail?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  threatType?: 'phishing' | 'spoofing' | 'malicious_link' | 'dmarc_fail' | 'credential_harvesting' | 'suspicious_attachment' | string;
  acknowledged: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actionType:
    | 'LOGIN'
    | 'LOGOUT'
    | 'LOGIN_FAILED'
    | 'PROFILE_CREATED'
    | 'PROFILE_UPDATED'
    | 'OAUTH_CONNECT'
    | 'OAUTH_DISCONNECT'
    | 'ACCOUNT_SYNC'
    | 'EMAIL_SCANNED'
    | 'QUARANTINE_ACTION'
    | 'RULE_UPDATED'
    | 'WHITELIST_UPDATED'
    | 'BLACKLIST_UPDATED'
    | 'SECURITY_SETTING_CHANGED'
    | 'NOTIFICATION_SENT'
    | 'NOTIFICATION_DELIVERED'
    | 'WHATSAPP_OPT_IN_CONFIRMED'
    | 'WHATSAPP_OPT_IN_REVOKED'
    | 'AI_QUERY'
    | 'ACTION_CONFIRMED';
  description: string;
  action?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details?: any;
  ipAddress?: string;
}

export type AuditLogEntry = AuditLog;

export type NotificationChannel =
  | 'browser_push'
  | 'mobile_push'
  | 'desktop'
  | 'whatsapp'
  | 'daily_digest';

export type NotificationDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'suppressed';

export interface NotificationItem {
  id: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  title: string;
  body: string;
  priority: PriorityLevel;
  securityClassification?: string;
  securityRiskScore?: number;
  isSecurityAlert: boolean;
  actionRequired: boolean;
  deadline?: string | null;
  category?: string;
  decisionReasons: string[];
  read: boolean;
  createdAt: string;
}

export interface NotificationDeliveryItem {
  id: string;
  notificationId: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  createdAt: string;
  wamid?: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureCode?: number | string;
  failureReason?: string;
  error?: string;
  reason?: string;
  payload?: any;
}

export interface NotificationSettings {
  pushEnabled?: boolean;
  browserPushEnabled?: boolean;
  mobilePushEnabled?: boolean;
  desktopEnabled?: boolean;
  whatsappEnabled?: boolean;
  channels?: {
    browser?: boolean;
    desktop?: boolean;
    mobilePush?: boolean;
    whatsapp?: boolean;
    dailyDigest?: boolean;
  };
  priorityThreshold?: PriorityLevel;
  whatsappOptIn?: boolean;
  whatsappOptInTimestamp?: string;
  whatsappOptInSource?: string;
  whatsappThreshold?: PriorityLevel;
  whatsappNumber?: string;
  whatsappPhone?: string;
  whatsappVerified?: boolean;
  whatsappTemplateName?: string;
  webPushEnabled?: boolean;
  dailyDigestEnabled?: boolean;
  dailyDigestTime?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    allowCriticalSecurity: boolean;
  };
  triggers?: {
    critical?: boolean;
    high?: boolean;
    medium?: boolean;
    low?: boolean;
    threats?: boolean;
    deadlines?: boolean;
    actionRequired?: boolean;
    quarantine?: boolean;
    summary?: boolean;
  };
  minPriorityLevel?: PriorityLevel;
  minimumPriorityForPush?: PriorityLevel;
  minimumPriorityForWhatsApp?: PriorityLevel;
  minimumPriorityForDesktop?: PriorityLevel;
  threadDeduplicationWindowMinutes?: number;
}

export type NotificationConfig = NotificationSettings;

export function normalizeNotificationConfig(raw?: Partial<NotificationConfig> | null): NotificationConfig {
  const quietEnabled = raw?.quietHours?.enabled ?? raw?.quietHoursEnabled ?? false;
  const quietStart = raw?.quietHours?.start || raw?.quietHoursStart || '22:00';
  const quietEnd = raw?.quietHours?.end || raw?.quietHoursEnd || '07:00';
  const allowCritical = raw?.quietHours?.allowCriticalSecurity ?? true;

  const rawThreshold = raw?.whatsappThreshold || raw?.minimumPriorityForWhatsApp || 'Critical';
  const validThreshold: PriorityLevel =
    rawThreshold === 'Critical' || rawThreshold === 'High' || rawThreshold === 'Medium' || rawThreshold === 'Low'
      ? rawThreshold
      : 'Critical';

  return {
    pushEnabled: raw?.pushEnabled ?? true,
    browserPushEnabled: raw?.browserPushEnabled ?? raw?.pushEnabled ?? raw?.webPushEnabled ?? true,
    mobilePushEnabled: raw?.mobilePushEnabled ?? false,
    desktopEnabled: raw?.desktopEnabled ?? true,
    whatsappEnabled: raw?.whatsappEnabled ?? false,
    whatsappOptIn: raw?.whatsappOptIn ?? false,
    whatsappOptInTimestamp: raw?.whatsappOptInTimestamp,
    whatsappOptInSource: raw?.whatsappOptInSource || 'web_ui',
    whatsappThreshold: validThreshold,
    whatsappPhone: raw?.whatsappPhone || raw?.whatsappNumber || '',
    whatsappNumber: raw?.whatsappNumber || raw?.whatsappPhone || '',
    whatsappVerified: raw?.whatsappVerified ?? false,
    whatsappTemplateName: raw?.whatsappTemplateName,
    webPushEnabled: raw?.webPushEnabled ?? raw?.browserPushEnabled ?? raw?.pushEnabled ?? true,
    dailyDigestEnabled: raw?.dailyDigestEnabled ?? true,
    dailyDigestTime: raw?.dailyDigestTime || '08:00',
    quietHoursEnabled: quietEnabled,
    quietHoursStart: quietStart,
    quietHoursEnd: quietEnd,
    quietHours: {
      enabled: quietEnabled,
      start: quietStart,
      end: quietEnd,
      allowCriticalSecurity: allowCritical,
    },
    triggers: {
      critical: raw?.triggers?.critical ?? true,
      high: raw?.triggers?.high ?? true,
      medium: raw?.triggers?.medium ?? false,
      low: raw?.triggers?.low ?? false,
      threats: raw?.triggers?.threats ?? true,
      deadlines: raw?.triggers?.deadlines ?? true,
      actionRequired: raw?.triggers?.actionRequired ?? true,
      quarantine: raw?.triggers?.quarantine ?? true,
      summary: raw?.triggers?.summary ?? false,
    },
    minPriorityLevel: raw?.minPriorityLevel || raw?.minimumPriorityForPush || 'High',
    minimumPriorityForPush: raw?.minimumPriorityForPush || 'High',
    minimumPriorityForWhatsApp: raw?.minimumPriorityForWhatsApp || 'Critical',
    minimumPriorityForDesktop: raw?.minimumPriorityForDesktop || 'High',
    threadDeduplicationWindowMinutes: raw?.threadDeduplicationWindowMinutes ?? 60,
  };
}

export interface SecuritySettings {
  sensitivity: 'Low' | 'Balanced' | 'High' | 'Maximum' | 'low' | 'balanced' | 'high' | 'maximum';
  autoQuarantinePhishing?: boolean;
  autoQuarantine?: boolean;
  blockDoubleExtensions?: boolean;
  alertOnDmarcFail?: boolean;
  checkLookalikeDomains?: boolean;
  whitelist?: Array<{ id: string; value: string; type: 'domain' | 'email' }>;
  blacklist?: Array<{ id: string; value: string; type: 'domain' | 'email' }>;
}

export interface ExtractedTask {
  id: string;
  emailId: string;
  title: string;
  dueDate: string | null;
  sourceEmailSubject: string;
  sourceAccount: string;
  priority: PriorityLevel;
  completed: boolean;
  category: string;
}

export interface GroundedCitation {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  accountEmail: string;
  date: string;
  priority: PriorityLevel;
  securityClassification: SecurityClassification;
  securityRiskScore?: number;
  snippet: string;
  relevanceScore: number;
  whyMatched: string;
  actionRequired: boolean;
  deadline?: string | null;
  recommendedAction?: string;
  category?: string;
}

export interface RAGRetrievalMetadata {
  totalSearched: number;
  matchedCount: number;
  rerankedCount: number;
  intentCategory: string;
  executionTimeMs: number;
  modelUsed: string;
  embeddingsUsed: boolean;
  userAuthenticated: boolean;
  userEmail: string;
  promptInjectionDefended?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citedEmailIds?: string[];
  citedEmails?: GroundedCitation[];
  isSecurityWarning?: boolean;
  retrievalMetadata?: RAGRetrievalMetadata;
  suggestedFollowUps?: string[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
  sourceEmailId?: string;
  sourceEmailSubject?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
  updated?: string;
  sourceEmailId?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  size?: number;
  description?: string;
}

export interface EmailDriveAttachment {
  id: string;
  emailId: string;
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  addedAt: string;
}

export type PriorityQuadrant =
  | 'IMPORTANT_AND_URGENT'
  | 'IMPORTANT_NOT_URGENT'
  | 'URGENT_NOT_IMPORTANT'
  | 'NORMAL';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  isDemo?: boolean;
}

export * from './types/firestore';

