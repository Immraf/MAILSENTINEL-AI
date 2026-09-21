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
  status: 'idle' | 'syncing' | 'error' | 'needs_reauth';
  lastSyncedAt: string;
  progressPercent: number;
  syncedCount: number;
  errorMessage?: string;
  providerHistoryId?: string;
  deltaToken?: string;
  updatedAt: string;
}

/**
 * 4. Stored Email Document
 * Path: /users/{userId}/emails/{emailId}
 */
export interface FirestoreEmailDoc extends Email {
  userId: string;
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
  subject: string;
  messageCount: number;
  snippet: string;
  lastMessageDate: string;
  participants: string[];
  hasActionRequired: boolean;
  urgency: 'low' | 'normal' | 'urgent' | 'critical';
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
  action: string;
  actionType?: string;
  details: string;
  description?: string;
  category?: 'security' | 'sync' | 'rule' | 'account' | 'quarantine' | 'user';
  severity?: 'info' | 'warning' | 'critical';
  timestamp: string;
}
