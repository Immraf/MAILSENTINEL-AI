/**
 * MailSentinel AI - Real Gmail Synchronization Engine (Step 5)
 * 
 * Features:
 * - Real Gmail REST API v1 integration
 * - Initial synchronization with 90-day configurable window
 * - Gmail History API incremental synchronization
 * - Pagination cursor handling & HistoryId tracking
 * - Strict Deduplication & Idempotency
 * - AES-256-GCM encrypted token usage (tokens never sent to client)
 * - Automatic token refresh on expiration
 * - Resilient exponential backoff retry handler
 * - Security analysis & DOM-sanitized HTML preview
 */

import { db } from './db';
import { FirestoreDb } from './firestoreDb';
import { decryptToken, encryptToken } from './encryption';
import { sanitizeEmailHtml } from './htmlSanitizer';
import { analyzeEmailSecurityHeuristics } from '../src/utils/securityEngine';
import { Email, EmailAccount, AttachmentInfo } from '../src/types';
import { processEmailThroughIntelligencePipeline } from './aiPipeline';

export interface GmailSyncOptions {
  fullSync?: boolean;
  maxDays?: number; // default: 90
  maxPages?: number; // default: 5 (up to 250 messages per batch)
}

export interface GmailSyncResult {
  accountId: string;
  userId: string;
  emailsProcessed: number;
  emailsPersisted: number;
  duplicatesSkipped: number;
  newHistoryId?: string;
  durationMs: number;
  status: 'success' | 'error' | 'needs_reauth';
  error?: string;
}

// In-memory mutex map to ensure background sync jobs are single-flight per account
const runningSyncJobs = new Map<string, { startedAt: number; cancelRequested?: boolean }>();

/**
 * Executes an HTTP fetch with jittered exponential backoff for transient errors
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      // Return immediately on success, auth errors, or client bad requests
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return res;
      }
      // Retry on 429 Too Many Requests or 5xx server errors
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        attempt++;
        if (attempt >= maxRetries) return res;
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`Exceeded max retries for ${url}`);
}

/**
 * Decodes Gmail base64url encoded strings
 */
function decodeBase64Url(data: string): string {
  if (!data) return '';
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Recursively extracts plain text, sanitized HTML, and attachment metadata from a Gmail message payload
 */
function extractGmailPayloadContent(payload: any): {
  bodyText: string;
  bodyHtml: string;
  attachments: AttachmentInfo[];
} {
  let bodyText = '';
  let bodyHtml = '';
  const attachments: AttachmentInfo[] = [];

  function walk(part: any) {
    if (!part) return;

    // Check for attachment
    if (part.filename && part.filename.length > 0) {
      const filename = part.filename;
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const dangerousExtensions = ['exe', 'bat', 'cmd', 'vbs', 'js', 'hta', 'iso', 'scr', 'ps1', 'jar'];
      const isDangerous = dangerousExtensions.includes(ext);

      attachments.push({
        id: part.body?.attachmentId || part.partId || `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body?.size || 0,
        securityStatus: isDangerous ? 'SUSPICIOUS' : 'SAFE',
        flagReason: isDangerous ? `Potentially executable file format (.${ext})` : undefined,
      });
    }

    // Extract text content
    if (part.mimeType === 'text/plain' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (!bodyText) bodyText = decoded;
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (!bodyHtml) bodyHtml = decoded;
    }

    // Recurse child parts
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);

  // If only HTML was found, generate a simple plain text fallback
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Sanitize the HTML payload using defense-in-depth sanitizer
  const sanitizedHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : '';

  return { bodyText, bodyHtml: sanitizedHtml, attachments };
}

/**
 * Retrieves or refreshes a valid access token for the given account
 */
export async function getValidGmailAccessToken(
  userId: string,
  account: EmailAccount & { accessTokenEncrypted?: string; refreshTokenEncrypted?: string }
): Promise<{ accessToken: string } | null> {
  const encAccess = account.accessTokenEncrypted;
  const encRefresh = account.refreshTokenEncrypted;

  let accessToken = encAccess ? decryptToken(encAccess) : '';
  const refreshToken = encRefresh ? decryptToken(encRefresh) : '';

  // Test current access token
  if (accessToken) {
    try {
      const testRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (testRes.ok) {
        return { accessToken };
      }
    } catch {
      // Network test failed, try refresh
    }
  }

  // If no refresh token is available, mark account as needing re-authentication
  if (!refreshToken) {
    db.updateAccount(userId, account.id, {
      status: 'Needs Reauthentication',
      errorMessage: 'OAuth session expired. Please reauthenticate your Gmail account.',
    });
    db.updateSyncState(userId, account.id, {
      status: 'needs_reauth',
      errorMessage: 'Missing refresh token. Reauthentication required.',
    });
    return null;
  }

  // Perform token refresh using Google OAuth 2.0 token endpoint
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // If environment secrets are not populated, cannot perform server-to-server token refresh
    db.updateAccount(userId, account.id, {
      status: 'Needs Reauthentication',
      errorMessage: 'Google OAuth client secret required for token refresh.',
    });
    return null;
  }

  try {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!refreshRes.ok) {
      console.error('Failed to refresh Google OAuth token:', await refreshRes.text());
      db.updateAccount(userId, account.id, {
        status: 'Needs Reauthentication',
        errorMessage: 'Gmail grant has been revoked or expired. Please reauthenticate.',
      });
      db.updateSyncState(userId, account.id, {
        status: 'needs_reauth',
        errorMessage: 'Invalid refresh token.',
      });
      return null;
    }

    const tokenData = await refreshRes.json();
    const newAccessToken = tokenData.access_token;
    const newEncAccessToken = encryptToken(newAccessToken);

    // Save refreshed token encrypted to database
    db.updateAccount(userId, account.id, {
      accessTokenEncrypted: newEncAccessToken,
    } as any);

    return { accessToken: newAccessToken };
  } catch (err: any) {
    console.error('Error during Google token refresh:', err);
    return null;
  }
}

/**
 * Executes a full or incremental synchronization for a Gmail account
 */
export async function syncGmailAccount(
  userId: string,
  accountId: string,
  options: GmailSyncOptions = {}
): Promise<GmailSyncResult> {
  const startTime = Date.now();
  const jobKey = `${userId}:${accountId}`;

  if (runningSyncJobs.has(jobKey)) {
    return {
      accountId,
      userId,
      emailsProcessed: 0,
      emailsPersisted: 0,
      duplicatesSkipped: 0,
      durationMs: 0,
      status: 'success',
    };
  }

  runningSyncJobs.set(jobKey, { startedAt: startTime });

  // 1. Validate account presence
  const rawAccounts = (db as any).getAccounts(userId) as any[];
  const account = rawAccounts.find((a) => a.id === accountId);

  if (!account || account.provider !== 'gmail') {
    runningSyncJobs.delete(jobKey);
    return {
      accountId,
      userId,
      emailsProcessed: 0,
      emailsPersisted: 0,
      duplicatesSkipped: 0,
      durationMs: Date.now() - startTime,
      status: 'error',
      error: 'Gmail account not found.',
    };
  }

  // Update status to Syncing
  db.updateAccount(userId, accountId, { status: 'Syncing' });
  db.updateSyncState(userId, accountId, { status: 'syncing', progressPercent: 10, errorMessage: undefined });

  try {
    // 2. Obtain valid decrypted access token
    const tokenResult = await getValidGmailAccessToken(userId, account);
    if (!tokenResult) {
      runningSyncJobs.delete(jobKey);
      return {
        accountId,
        userId,
        emailsProcessed: 0,
        emailsPersisted: 0,
        duplicatesSkipped: 0,
        durationMs: Date.now() - startTime,
        status: 'needs_reauth',
        error: 'Authentication failed or reauthentication required.',
      };
    }

    const { accessToken } = tokenResult;
    const syncState = db.getSyncState(userId, accountId);
    const existingHistoryId = syncState?.providerHistoryId;

    let emailsProcessed = 0;
    let emailsPersisted = 0;
    let duplicatesSkipped = 0;
    let latestHistoryId = existingHistoryId;

    // 3. Determine synchronization strategy: Incremental (History API) vs Initial (Windowed query)
    const canUseHistoryApi = Boolean(existingHistoryId && !options.fullSync);

    if (canUseHistoryApi) {
      // Incremental Sync via Gmail History API
      const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${existingHistoryId}&maxResults=100`;
      const historyRes = await fetchWithRetry(historyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (historyRes.status === 404) {
        // History ID is too old/expired (Gmail typically purges history after ~30 days).
        // Fallback cleanly to recent window query!
        console.log(`History ID ${existingHistoryId} expired for account ${accountId}. Falling back to windowed query.`);
        const windowResult = await runWindowedGmailSync(userId, account, accessToken, options);
        emailsProcessed += windowResult.emailsProcessed;
        emailsPersisted += windowResult.emailsPersisted;
        duplicatesSkipped += windowResult.duplicatesSkipped;
        latestHistoryId = windowResult.latestHistoryId;
      } else if (historyRes.ok) {
        const historyData = await historyRes.json();
        latestHistoryId = historyData.historyId || latestHistoryId;

        const historyRecords = historyData.history || [];
        const addedMessageIds = new Set<string>();

        for (const record of historyRecords) {
          if (Array.isArray(record.messagesAdded)) {
            for (const item of record.messagesAdded) {
              if (item.message?.id) addedMessageIds.add(item.message.id);
            }
          }
          // Handle labels added/removed (e.g. read status change)
          if (Array.isArray(record.labelsAdded)) {
            for (const item of record.labelsAdded) {
              if (item.message?.id && item.labelIds?.includes('UNREAD')) {
                updateEmailReadStatus(userId, item.message.id, false);
              }
            }
          }
          if (Array.isArray(record.labelsRemoved)) {
            for (const item of record.labelsRemoved) {
              if (item.message?.id && item.labelIds?.includes('UNREAD')) {
                updateEmailReadStatus(userId, item.message.id, true);
              }
            }
          }
        }

        // Fetch and persist added messages
        for (const msgId of addedMessageIds) {
          emailsProcessed++;
          const persisted = await fetchAndPersistGmailMessage(userId, account, accessToken, msgId);
          if (persisted) {
            emailsPersisted++;
          } else {
            duplicatesSkipped++;
          }
        }
      }
    } else {
      // Initial Sync with 90-Day Configurable Window
      const windowResult = await runWindowedGmailSync(userId, account, accessToken, options);
      emailsProcessed += windowResult.emailsProcessed;
      emailsPersisted += windowResult.emailsPersisted;
      duplicatesSkipped += windowResult.duplicatesSkipped;
      latestHistoryId = windowResult.latestHistoryId;
    }

    // 4. Update sync cursor, account statistics and state
    const allUserEmails = db.getEmails(userId).filter((e) => e.accountId === account.id);
    const totalEmails = allUserEmails.length;
    const unreadCount = allUserEmails.filter((e) => !e.isRead).length;
    const threatsDetected = allUserEmails.filter(
      (e) => e.securityAnalysis?.classification === 'PHISHING' || e.securityAnalysis?.classification === 'MALICIOUS'
    ).length;

    const now = new Date().toISOString();

    db.updateSyncState(userId, account.id, {
      status: 'idle',
      progressPercent: 100,
      syncedCount: totalEmails,
      lastSyncedAt: now,
      providerHistoryId: latestHistoryId || undefined,
    });

    db.updateAccount(userId, account.id, {
      status: 'Connected',
      totalEmails,
      unreadCount,
      threatsDetected,
      lastSyncedAt: now,
    });

    // Also mirror to Firestore if active
    try {
      await FirestoreDb.updateSyncState(userId, account.id, {
        status: 'idle',
        progressPercent: 100,
        syncedCount: totalEmails,
        lastSyncedAt: now,
        providerHistoryId: latestHistoryId,
      });
      await FirestoreDb.updateAccount(userId, account.id, {
        status: 'Connected',
        totalEmails,
        unreadCount,
        threatsDetected,
        lastSyncedAt: now,
      });
    } catch {
      // Offline/local fallback
    }

    return {
      accountId,
      userId,
      emailsProcessed,
      emailsPersisted,
      duplicatesSkipped,
      newHistoryId: latestHistoryId,
      durationMs: Date.now() - startTime,
      status: 'success',
    };
  } catch (err: any) {
    console.error(`Gmail sync error for account ${accountId}:`, err);
    db.updateSyncState(userId, account.id, {
      status: 'error',
      errorMessage: err.message || 'Gmail sync failed',
    });
    db.updateAccount(userId, account.id, {
      status: 'Error',
      errorMessage: err.message || 'Gmail sync failed',
    });

    return {
      accountId,
      userId,
      emailsProcessed: 0,
      emailsPersisted: 0,
      duplicatesSkipped: 0,
      durationMs: Date.now() - startTime,
      status: 'error',
      error: err.message,
    };
  } finally {
    runningSyncJobs.delete(jobKey);
  }
}

/**
 * Runs windowed initial synchronization with pagination
 */
async function runWindowedGmailSync(
  userId: string,
  account: EmailAccount,
  accessToken: string,
  options: GmailSyncOptions
): Promise<{ emailsProcessed: number; emailsPersisted: number; duplicatesSkipped: number; latestHistoryId?: string }> {
  const maxDays = options.maxDays || 90;
  const maxPages = options.maxPages || 5;
  const secondsAgo = Math.floor((Date.now() - maxDays * 24 * 60 * 60 * 1000) / 1000);
  const query = `after:${secondsAgo}`;

  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  let emailsProcessed = 0;
  let emailsPersisted = 0;
  let duplicatesSkipped = 0;
  let latestHistoryId: string | undefined = undefined;

  // Retrieve user profile to establish initial historyId
  try {
    const profRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profRes.ok) {
      const prof = await profRes.json();
      latestHistoryId = prof.historyId;
    }
  } catch {
    // Non-blocking
  }

  while (pageCount < maxPages) {
    pageCount++;
    const params = new URLSearchParams({
      q: query,
      maxResults: '25',
    });
    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const listRes = await fetchWithRetry(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      console.error('Gmail messages.list failed:', await listRes.text());
      break;
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    // Calculate dynamic progress
    const progress = Math.min(20 + Math.round((pageCount / maxPages) * 70), 90);
    db.updateSyncState(userId, account.id, { progressPercent: progress });

    for (const msgRef of messages) {
      emailsProcessed++;
      const persisted = await fetchAndPersistGmailMessage(userId, account, accessToken, msgRef.id);
      if (persisted) {
        emailsPersisted++;
      } else {
        duplicatesSkipped++;
      }
    }

    pageToken = listData.nextPageToken;
    if (!pageToken) break;
  }

  return { emailsProcessed, emailsPersisted, duplicatesSkipped, latestHistoryId };
}

/**
 * Fetches an individual Gmail message, parses all required fields, sanitizes HTML,
 * executes security analysis, and idempotently stores in DB.
 * Returns true if newly created or updated, false if skipped/error.
 */
async function fetchAndPersistGmailMessage(
  userId: string,
  account: EmailAccount,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  const canonicalId = `gmail-${messageId}`;

  // Check deduplication in database
  const existingEmails = db.getEmails(userId);
  const alreadyExists = existingEmails.some(
    (e) => e.accountId === account.id && (e.id === canonicalId || e.providerMessageId === messageId)
  );

  // Fetch full message structure
  const msgRes = await fetchWithRetry(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgRes.ok) {
    return false;
  }

  const msg = await msgRes.json();
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string): string =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('subject') || '(No Subject)';
  const fromHeader = getHeader('from') || 'unknown@sender.com';
  const toHeader = getHeader('to') || account.emailAddress;
  const ccHeader = getHeader('cc') || '';
  const replyToHeader = getHeader('reply-to') || '';
  const dateHeader = getHeader('date') || '';
  const authResults = getHeader('authentication-results') || '';

  // Parse sender name & email
  let senderName = fromHeader;
  let senderEmail = fromHeader;
  if (fromHeader.includes('<')) {
    senderName = fromHeader.split('<')[0].replace(/"/g, '').trim();
    senderEmail = fromHeader.split('<')[1].replace('>', '').trim();
  }

  // Parse recipients & cc
  const recipients = toHeader.split(',').map((s) => s.trim()).filter(Boolean);
  const cc = ccHeader ? ccHeader.split(',').map((s) => s.trim()).filter(Boolean) : [];

  // Parse SPF/DKIM/DMARC from authentication-results
  const spf = authResults.toLowerCase().includes('spf=pass')
    ? 'PASS'
    : authResults.toLowerCase().includes('spf=fail')
    ? 'FAIL'
    : 'NONE';
  const dkim = authResults.toLowerCase().includes('dkim=pass')
    ? 'PASS'
    : authResults.toLowerCase().includes('dkim=fail')
    ? 'FAIL'
    : 'NONE';
  const dmarc = authResults.toLowerCase().includes('dmarc=pass')
    ? 'PASS'
    : authResults.toLowerCase().includes('dmarc=fail')
    ? 'FAIL'
    : 'NONE';

  // Extract body, sanitized HTML, and attachment metadata
  const { bodyText, bodyHtml, attachments } = extractGmailPayloadContent(msg.payload);
  const bodySnippet = msg.snippet || bodyText.substring(0, 160) || '';

  // Received timestamp
  let receivedAt = new Date().toISOString();
  if (msg.internalDate) {
    receivedAt = new Date(parseInt(msg.internalDate, 10)).toISOString();
  } else if (dateHeader) {
    const parsedDate = new Date(dateHeader);
    if (!isNaN(parsedDate.getTime())) receivedAt = parsedDate.toISOString();
  }

  const labels: string[] = msg.labelIds || [];
  const isRead = !labels.includes('UNREAD');

  // Run MailSentinel Security Heuristics
  const heuristic = analyzeEmailSecurityHeuristics({
    subject,
    body: bodyText,
    sender: senderEmail,
    senderName,
    attachments,
    authResults: { spf, dkim, dmarc },
  });

  const emailRecord: Email = {
    id: canonicalId,
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    accountId: account.id,
    accountEmail: account.emailAddress,
    userId,
    provider: 'gmail',
    threadId: msg.threadId || msg.id,
    sender: senderEmail,
    senderName: senderName || senderEmail.split('@')[0],
    senderDomain: senderEmail.includes('@') ? senderEmail.split('@')[1] : 'unknown',
    recipients,
    cc: cc.length > 0 ? cc : undefined,
    replyTo: replyToHeader || undefined,
    subject,
    bodySnippet,
    bodyText,
    bodyHtml,
    receivedAt,
    labels,
    isRead,
    isArchived: false,
    isQuarantined:
      heuristic.securityAnalysis.classification === 'PHISHING' ||
      heuristic.securityAnalysis.classification === 'MALICIOUS',
    hasAttachment: attachments.length > 0,
    attachments,
    aiAnalysis: {
      category: 'business',
      priority: heuristic.priorityLevel,
      priorityScore: heuristic.priorityScore,
      summary: bodySnippet.substring(0, 180),
      sentiment: 'neutral',
      actionRequired: false,
      recommendedAction: 'Review email context',
      deadline: null,
      extractedEntities: [],
      whyPriorityReasons: heuristic.whyPriority,
      confidence: 0.9,
    },
    securityAnalysis: heuristic.securityAnalysis,
  };

  // Run through end-to-end AI Intelligence Pipeline (AI analysis, priority scoring, task/entity extraction, separate persistence, notifications)
  try {
    const pipelineResult = await processEmailThroughIntelligencePipeline(emailRecord, userId);
    return !alreadyExists;
  } catch (pipeErr) {
    console.warn(`AI Intelligence Pipeline error for message ${messageId}:`, pipeErr);
    // Fallback persist base record
    db.saveEmail(userId, emailRecord);
    try {
      await FirestoreDb.saveEmail(userId, emailRecord);
    } catch {
      // Non-blocking fallback
    }
    return !alreadyExists;
  }
}

/**
 * Updates read status of an email when modified in Gmail History
 */
function updateEmailReadStatus(userId: string, messageId: string, isRead: boolean): void {
  const canonicalId = `gmail-${messageId}`;
  db.updateEmail(userId, canonicalId, { isRead });
  FirestoreDb.updateEmail(userId, canonicalId, { isRead }).catch(() => {});
}
