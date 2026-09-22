/**
 * MailSentinel AI - Firestore Document Models & TypeScript Types
 * Production-ready Firestore schema with complete User UID scoping.
 */

import {
  Email,
  QuarantineItem,
  SecurityAlert,
  AutomationRule,
  WhitelistBlacklistEntry,
  PriorityLevel,
  EmailCategory,
  SecurityClassification,
  AuthenticationResult,
  AccountStatus,
} from '../types';

/**
 * 1. User Profile Document
 * Path: /users/{userId}
 */
export interface FirestoreUserDoc {
  id: string; // Firebase Auth UID
  uid?: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  photoURL?: string;
  role?: string;
  emailVerified?: boolean;
  provider?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/**
 * 2. Connected Email Account Document
 * Path: /users/{userId}/emailAccounts/{accountId}
 */
export interface FirestoreEmailAccountDoc {
  id: string;
  userId: string;
  provider: 'gmail' | 'outlook' | 'demo';
  emailAddress: string;
  displayName: string;
  status: AccountStatus | 'idle';
  lastSyncedAt: string;
  totalEmails: number;
  threatsDetected: number;
  isPrimary: boolean;
  unreadCount?: number;
  errorMessage?: string;
  connectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 2b. Server-Only Provider Credentials Document
 * Path: /users/{userId}/providerCredentials/{accountId}
 * SERVER-ONLY. Strictly inaccessible to client SDK.
 */
export interface FirestoreProviderCredentialDoc {
  id: string; // accountId
  accountId: string;
  userId: string;
  provider: 'gmail' | 'outlook';
  emailAddress: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  expiresAt?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 3. Email Sync State Document (Server-managed only, client read-only)
 * Path: /users/{userId}/emailSyncState/{accountId}
 */
export interface FirestoreEmailSyncStateDoc {
  id: string; // accountId
  accountId: string;
  userId: string;
  status: 'idle' | 'queued' | 'syncing' | 'completed' | 'failed' | 'error' | 'needs_reauth' | 'reauthorization_required';
  lastSyncedAt: string;
  progressPercent: number;
  syncedCount: number;
  messagesSynced?: number;
  pagesProcessed?: number;
  startedAt?: string;
  completedAt?: string;
  lastSuccessfulSyncAt?: string;
  lastHistoryId?: string;
  retryCount?: number;
  error?: string;
  errorMessage?: string;
  providerHistoryId?: string;
  deltaToken?: string;
  updatedAt: string;
}

/**
 * Step 4 Attachment Metadata
 */
export interface AttachmentMetadata {
  id: string;
  attachmentId?: string;
  gmailAttachmentId?: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Step 4 Normalized Email Schema
 * Path: /users/{uid}/emailAccounts/{accountId}/emails/{emailId}
 */
export interface NormalizedEmail {
  id: string;
  userId: string;
  accountId: string;

  provider: 'gmail';
  providerMessageId: string;
  providerThreadId: string;

  from: { name: string; email: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;

  subject: string;
  snippet: string;

  textBody: string;
  htmlBody: string;

  receivedAt: string; // ISO 8601
  sentAt?: string;    // ISO 8601

  labels: string[];

  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;

  hasAttachments: boolean;
  attachments: AttachmentMetadata[];

  headers?: Record<string, string>;

  createdAt: string;
  updatedAt: string;
}

/**
 * Step 4 Email Thread Schema
 * Path: /users/{uid}/emailAccounts/{accountId}/threads/{threadId}
 */
export interface EmailThread {
  id: string;
  userId: string;
  accountId: string;
  provider: 'gmail';
  providerThreadId: string;

  subject: string;
  messageCount: number;
  participants: string[];
  latestMessageAt: string;
  snippet: string;
  messageIds: string[];

  createdAt: string;
  updatedAt: string;
}

export type SyncStatusType = 'idle' | 'queued' | 'syncing' | 'completed' | 'failed' | 'reauthorization_required';

export interface SyncState {
  status: SyncStatusType;
  startedAt?: string;
  completedAt?: string;
  lastSuccessfulSyncAt?: string;
  lastHistoryId?: string;
  messagesSynced: number;
  pagesProcessed: number;
  retryCount?: number;
  error?: string;
}

export interface SyncResult {
  accountId: string;
  userId: string;
  emailsProcessed: number;
  emailsPersisted: number;
  duplicatesSkipped: number;
  newHistoryId?: string;
  durationMs: number;
  status: 'success' | 'error' | 'reauthorization_required';
  error?: string;
}

export interface SyncJob {
  accountId: string;
  userId: string;
  status: 'queued' | 'syncing' | 'completed' | 'failed';
  startedAt: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: GmailHeader[];
    body?: {
      attachmentId?: string;
      size?: number;
      data?: string;
    };
    parts?: any[];
  };
  sizeEstimate?: number;
  raw?: string;
}

/**
 * 4. Stored Email Document
 * Path: /users/{userId}/emails/{emailId}
 */
export interface FirestoreEmailDoc extends Email {
  userId: string;
  from?: { name: string; email: string };
  to?: string[];
  isStarred?: boolean;
  isImportant?: boolean;
  textBody?: string;
  htmlBody?: string;
  headers?: Record<string, string>;
  hasAttachments?: boolean;
  sentAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 5. Email Thread Document
 * Path: /users/{userId}/emailThreads/{threadId}
 */
export interface FirestoreEmailThreadDoc {
  id: string; // threadId
  userId: string;
  accountId: string;
  provider?: string;
  providerThreadId?: string;
  subject: string;
  messageCount: number;
  snippet: string;
  lastMessageDate: string;
  latestMessageAt?: string;
  participants: string[];
  messageIds?: string[];
  hasActionRequired?: boolean;
  urgency?: 'low' | 'normal' | 'urgent' | 'critical';
  createdAt: string;
  updatedAt: string;
}

/**
 * 6. Attachment Document
 * Path: /users/{userId}/attachments/{attachmentId}
 */
export interface FirestoreAttachmentDoc {
  id: string;
  userId: string;
  emailId: string;
  threadId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;
  driveFileId?: string;
  isSafe: boolean;
  scanResult?: string;
  createdAt: string;
}

/**
 * 7. AI Analysis Document
 * Path: /users/{userId}/aiAnalysis/{analysisId}
 */
export interface FirestoreAiAnalysisDoc {
  id: string;
  userId: string;
  emailId: string;
  threadId?: string;
  summary: string;
  priority: PriorityLevel | 'Low' | 'Medium' | 'High' | 'Critical';
  priorityScore: number;
  category: EmailCategory | string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  actionRequired: boolean;
  recommendedAction?: string;
  deadline?: string | null;
  confidence: number;
  whyPriorityReasons: string[];
  analyzedAt: string;
}

/**
 * 8. Extracted Entity Document
 * Path: /users/{userId}/extractedEntities/{entityId}
 */
export interface FirestoreExtractedEntityDoc {
  id: string;
  userId: string;
  emailId: string;
  entityType: 'person' | 'organization' | 'date' | 'amount' | 'deadline' | 'location' | 'tracking_number';
  value: string;
  context: string;
  confidence: number;
  createdAt: string;
}

/**
 * 9. Security Analysis Document
 * Path: /users/{userId}/securityAnalysis/{analysisId}
 */
export interface FirestoreSecurityAnalysisDoc {
  id: string;
  userId: string;
  emailId: string;
  classification: SecurityClassification | 'SAFE' | 'SUSPICIOUS' | 'PHISHING' | 'MALICIOUS';
  riskScore: number;
  riskLevel: 'Safe' | 'Low Risk' | 'Suspicious' | 'High Risk' | 'Critical' | 'Low' | 'Medium' | 'High';
  phishingScore: number;
  spamScore: number;
  spoofingScore: number;
  confidenceScore?: number;
  explanation?: string;
  authResults: AuthenticationResult | {
    spf: string;
    dkim: string;
    dmarc: string;
  };
  senderDomainAnalysis: {
    displayName: string;
    senderEmail: string;
    domain: string;
    isLookalike: boolean;
    replyToMatch: boolean;
    matchedBrand?: string;
    replyTo?: string;
  };
  urlAnalysis: {
    totalUrls: number;
    suspiciousUrls: any[];
  };
  whyFlaggedReasons: string[];
  scannedAt: string;
}

/**
 * 10. Security Indicator Document
 * Path: /users/{userId}/securityIndicators/{indicatorId}
 */
export interface FirestoreSecurityIndicatorDoc {
  id: string;
  userId: string;
  emailId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: string;
}

/**
 * 11. Task Document
 * Path: /users/{userId}/tasks/{taskId}
 */
export interface FirestoreTaskDoc {
  id: string;
  userId: string;
  emailId?: string;
  title: string;
  description?: string;
  due?: string | null;
  status: 'needsAction' | 'completed';
  priority: 'low' | 'medium' | 'high';
  googleTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 12. Deadline Document
 * Path: /users/{userId}/deadlines/{deadlineId}
 */
export interface FirestoreDeadlineDoc {
  id: string;
  userId: string;
  emailId: string;
  title: string;
  deadline: string;
  status: 'pending' | 'completed' | 'missed';
  urgency: 'normal' | 'urgent' | 'critical';
  createdAt: string;
  updatedAt: string;
}

/**
 * 13. In-App Notification / Alert Document
 * Path: /users/{userId}/notifications/{notificationId}
 */
export interface FirestoreNotificationDoc {
  id: string;
  userId: string;
  emailId?: string;
  threadId?: string;
  title: string;
  description?: string;
  body?: string;
  severity?: 'info' | 'warning' | 'high' | 'critical' | string;
  priority?: string;
  isSecurityAlert?: boolean;
  securityRiskScore?: number;
  securityClassification?: string;
  actionRequired?: boolean;
  deadline?: string | null;
  decisionReasons?: string[];
  channel?: string;
  read: boolean;
  createdAt: string;
}

/**
 * 14. Notification Delivery Record (Server-managed only, client read-only)
 * Path: /users/{userId}/notificationDeliveries/{deliveryId}
 */
export interface FirestoreNotificationDeliveryDoc {
  id: string;
  userId: string;
  notificationId?: string;
  emailId?: string;
  threadId?: string;
  channel: 'browser_push' | 'mobile_push' | 'desktop' | 'whatsapp' | 'daily_digest' | 'push' | 'browser' | 'digest' | string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'suppressed' | string;
  reason?: string;
  error?: string;
  payload?: Record<string, any>;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

/**
 * 15. Notification Device Document
 * Path: /users/{userId}/notificationDevices/{deviceId}
 */
export interface FirestoreNotificationDeviceDoc {
  id: string;
  userId: string;
  deviceId?: string;
  platform: 'web' | 'ios' | 'android';
  pushToken: string;
  createdAt?: string;
  lastSeenAt?: string;
  registeredAt?: string;
  lastActiveAt?: string;
  enabled?: boolean;
  userAgent?: string;
}

/**
 * 16. Notification Preferences Document
 * Path: /users/{userId}/notificationPreferences/{prefId}
 */
export interface FirestoreNotificationPreferencesDoc {
  id: string;
  userId: string;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappPhone: string;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    allowCriticalSecurity: boolean;
  };
  triggers: {
    critical: boolean;
    high: boolean;
    threats: boolean;
    deadlines: boolean;
    quarantine: boolean;
    summary: boolean;
  };
  updatedAt: string;
}

/**
 * 17. Security Rule Document
 * Path: /users/{userId}/securityRules/{ruleId}
 */
export interface FirestoreSecurityRuleDoc {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: 'heuristic' | 'domain_reputation' | 'content_pattern' | 'auth_check' | 'ai_behavior';
  action: 'quarantine' | 'flag_high_risk' | 'strip_links' | 'alert_user' | 'allow';
  isEnabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 18. User Automation Rule Document
 * Path: /users/{userId}/userRules/{ruleId}
 */
export interface FirestoreUserRuleDoc {
  id: string;
  userId: string;
  name: string;
  condition: {
    field: 'sender' | 'subject' | 'domain' | 'priority' | 'category';
    operator: 'contains' | 'equals' | 'startsWith' | 'endsWith';
    value: string;
  };
  action: {
    type: 'tag' | 'archive' | 'quarantine' | 'mark_read' | 'priority';
    target?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 19. Quarantine Item Document
 * Path: /users/{userId}/quarantineItems/{itemId}
 */
export interface FirestoreQuarantineItemDoc extends QuarantineItem {
  userId: string;
}

/**
 * 20. Audit Log Document (Immutable, server-managed/read-only)
 * Path: /users/{userId}/auditLogs/{logId}
 */
export interface FirestoreAuditLogDoc {
  id: string;
  userId: string;
  action?: string;
  actionType?: string;
  details?: string;
  description?: string;
  category?: 'security' | 'sync' | 'rule' | 'account' | 'quarantine' | 'user';
  severity?: 'info' | 'warning' | 'critical';
  timestamp: string;
}
