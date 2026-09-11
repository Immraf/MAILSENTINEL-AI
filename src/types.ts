export type EmailProvider = 'gmail' | 'outlook';

export interface EmailAccount {
  id: string;
  provider: EmailProvider;
  emailAddress: string;
  displayName: string;
  status: 'active' | 'needs_reauth' | 'syncing' | 'error';
  lastSyncedAt: string;
  totalEmails: number;
  threatsDetected: number;
  isPrimary?: boolean;
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
  accountId: string;
  accountEmail: string;
  provider: EmailProvider;
  threadId: string;
  sender: string;
  senderName: string;
  senderDomain: string;
  recipients: string[];
  cc?: string[];
  subject: string;
  bodySnippet: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  isRead: boolean;
  isArchived: boolean;
  isQuarantined: boolean;
  hasAttachment: boolean;
  attachments?: AttachmentInfo[];
  aiAnalysis: AIAnalysis;
  securityAnalysis: SecurityAnalysis;
  tags?: string[];
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
  description?: string;
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
    | 'AI_QUERY'
    | 'ACTION_CONFIRMED';
  description: string;
  action?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details?: any;
  ipAddress?: string;
}

export type AuditLogEntry = AuditLog;

export interface NotificationSettings {
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber?: string;
  whatsappPhone?: string;
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
    threats?: boolean;
    deadlines?: boolean;
    quarantine?: boolean;
    summary?: boolean;
  };
  minimumPriorityForPush?: 'Critical' | 'High' | 'Medium';
  minimumPriorityForWhatsApp?: 'Critical' | 'High';
}

export type NotificationConfig = NotificationSettings;

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

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citedEmailIds?: string[];
  isSecurityWarning?: boolean;
}
