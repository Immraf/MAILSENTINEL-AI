/**
 * MailSentinel AI - Real Gmail Synchronization Engine (Step 4)
 * 
 * Architecture:
 * - Server-side only Gmail REST API v1 integration
 * - Firestore is the authoritative and exclusive storage (NO database.json)
 * - Initial synchronization with configurable window and pagination
 * - Gmail History API incremental synchronization
 * - AES-256-GCM encrypted token storage with automatic server-side refresh
 * - Reauthorization required state handling on token revocation
 * - Strict deduplication and idempotency using providerMessageId
 * - Normalization to Step 4 NormalizedEmail, EmailThread, and AttachmentMetadata
 * - Zero AI features activated during sync (data foundation only)
 */

import { FirestoreDb } from './firestoreDb';
import { decryptToken, encryptToken } from './encryption';
import { sanitizeEmailHtml } from './htmlSanitizer';
import {
  NormalizedEmail,
  EmailThread,
  AttachmentMetadata,
  FirestoreEmailAccountDoc,
} from '../src/types/firestore';
import { EmailAccount } from '../src/types';

export interface GmailSyncOptions {
  fullSync?: boolean;
  maxDays?: number; // default: 90
  maxPages?: number; // default: 5 (up to 125-250 messages per initial sync batch)
  pageSize?: number; // default: 25
}

export interface GmailSyncResult {
  accountId: string;
  userId: string;
  emailsProcessed: number;
  emailsPersisted: number;
  duplicatesSkipped: number;
  newHistoryId?: string;
  durationMs: number;
  status: 'success' | 'completed' | 'failed' | 'error' | 'in_progress' | 'reauthorization_required';
  error?: string;
  message?: string;
  syncState?: any;
}

// In-memory mutex map to ensure background sync jobs are single-flight per account
const runningSyncJobs = new Map<string, { startedAt: number; cancelRequested?: boolean }>();

/**
 * Checks if a sync job is currently running for an account
 */
export function isSyncJobRunning(userId: string, accountId: string): boolean {
  return runningSyncJobs.has(`${userId}:${accountId}`);
}

/**
 * Executes an HTTP fetch with jittered exponential backoff for transient errors (429, 5xx, network)
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      // Return immediately on success, auth errors, or client not found
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
 * Decodes Gmail base64url encoded strings safely
 */
function decodeBase64Url(data: string): string {
  if (!data) return '';
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Recursively extracts plain text, sanitized HTML, and attachment metadata from a Gmail message payload
 */
function extractGmailPayloadContent(payload: any, messageId: string): {
  bodyText: string;
  bodyHtml: string;
  attachments: AttachmentMetadata[];
} {
  let bodyText = '';
  let bodyHtml = '';
  const attachments: AttachmentMetadata[] = [];

  function walk(part: any) {
    if (!part) return;

    // Check for attachment
    if (part.filename && part.filename.length > 0) {
      const attId = part.body?.attachmentId || part.partId || `att-${messageId}-${attachments.length}`;
      attachments.push({
        id: attId,
        attachmentId: part.body?.attachmentId,
        gmailAttachmentId: part.body?.attachmentId,
        messageId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body?.size || 0,
      });
    }

    // Extract text content
    if ((!part.mimeType || part.mimeType.startsWith('text/plain') || part.mimeType === 'text') && part.body?.data) {
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

  // Fallback plain text from HTML if text body was empty
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Sanitize the HTML payload using security sanitizer
  const sanitizedHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : '';

  return { bodyText, bodyHtml: sanitizedHtml, attachments };
}

/**
 * Retrieves or refreshes a valid access token for the given account
 * Tokens are loaded from Firestore provider credentials, decrypted server-side,
 * and never sent to the browser or stored in email documents.
 */
export async function getValidGmailAccessToken(
  userId: string,
  accountId: string
): Promise<{ accessToken: string } | null> {
  const creds = await FirestoreDb.getProviderCredentials(userId, accountId);
  if (!creds) {
    await markReauthorizationRequired(userId, accountId, 'No OAuth credentials found. Please reconnect Gmail.');
    return null;
  }

  const encAccess = creds.accessTokenEncrypted;
  const encRefresh = creds.refreshTokenEncrypted;

  let accessToken = encAccess ? decryptToken(encAccess) : '';
  const refreshToken = encRefresh ? decryptToken(encRefresh) : '';

  // Test current access token against Gmail profile API
  if (accessToken) {
    try {
      const testRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (testRes.ok) {
        return { accessToken };
      }
    } catch {
      // Network test error, proceed to refresh token flow
    }
  }

  // If no refresh token is present, reauthorization is required
  if (!refreshToken) {
    await markReauthorizationRequired(userId, accountId, 'Session expired and missing refresh token. Please reconnect Gmail.');
    return null;
  }

  // Refresh token using Google OAuth 2.0 token endpoint
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Missing OAuth configuration
    await markReauthorizationRequired(userId, accountId, 'Google OAuth client secret required for token refresh.');
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
      const errText = await refreshRes.text();
      console.error(`Google OAuth token refresh failed for account ${accountId}:`, errText);
      await markReauthorizationRequired(userId, accountId, 'Gmail grant revoked or expired. Please reauthorize.');
      return null;
    }

    const tokenData = await refreshRes.json();
    const newAccessToken = tokenData.access_token;
    const newEncAccessToken = encryptToken(newAccessToken);

    // If Google issued a new refresh token, encrypt it; otherwise preserve existing encrypted refresh token
    const newEncRefreshToken = tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : encRefresh;

    // Save updated credentials securely to Firestore
    await FirestoreDb.saveProviderCredentials(userId, accountId, {
      ...creds,
      accessTokenEncrypted: newEncAccessToken,
      refreshTokenEncrypted: newEncRefreshToken,
      expiresAt: Date.now() + ((tokenData.expires_in || 3600) * 1000),
    });

    return { accessToken: newAccessToken };
  } catch (err: any) {
    console.error(`Error during token refresh for account ${accountId}:`, err);
    await markReauthorizationRequired(userId, accountId, 'Token refresh failed. Please reconnect Gmail.');
    return null;
  }
}

/**
 * Marks an account and its sync state as requiring reauthorization
 */
async function markReauthorizationRequired(userId: string, accountId: string, reason: string): Promise<void> {
  await FirestoreDb.updateAccount(userId, accountId, {
    status: 'Needs Reauthentication',
    errorMessage: reason,
  });
  await FirestoreDb.updateSyncState(userId, accountId, {
    status: 'reauthorization_required',
    errorMessage: reason,
    error: reason,
  });
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
    const existingState = await FirestoreDb.getSyncState(userId, accountId);
    return {
      accountId,
      userId,
      emailsProcessed: 0,
      emailsPersisted: 0,
      duplicatesSkipped: 0,
      durationMs: 0,
      status: 'in_progress' as any,
      error: 'A synchronization job is already running for this account.',
    };
  }

  runningSyncJobs.set(jobKey, { startedAt: startTime });

  // 1. Verify account ownership in Firestore
  const account = await FirestoreDb.getAccountById(userId, accountId);
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

  // Update status to Syncing in Firestore
  await FirestoreDb.updateAccount(userId, accountId, { status: 'Syncing' });
  await FirestoreDb.updateSyncState(userId, accountId, {
    status: 'syncing',
    startedAt: new Date().toISOString(),
    progressPercent: 10,
    errorMessage: undefined,
    error: undefined,
  });

  try {
    // 2. Obtain valid decrypted access token
    const tokenResult = await getValidGmailAccessToken(userId, accountId);
    if (!tokenResult) {
      runningSyncJobs.delete(jobKey);
      return {
        accountId,
        userId,
        emailsProcessed: 0,
        emailsPersisted: 0,
        duplicatesSkipped: 0,
        durationMs: Date.now() - startTime,
        status: 'reauthorization_required',
        error: 'Authentication failed or reauthorization required.',
      };
    }

    const { accessToken } = tokenResult;
    const syncState = await FirestoreDb.getSyncState(userId, accountId);
    const existingHistoryId = syncState?.providerHistoryId || syncState?.lastHistoryId;

    let emailsProcessed = 0;
    let emailsPersisted = 0;
    let duplicatesSkipped = 0;
    let latestHistoryId = existingHistoryId;
    let pagesCount = 1;

    // 3. Incremental vs Initial Sync Strategy
    const canUseHistoryApi = Boolean(existingHistoryId && !options.fullSync);

    if (canUseHistoryApi) {
      const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${existingHistoryId}&maxResults=100`;
      const historyRes = await fetchWithRetry(historyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (historyRes.status === 404) {
        // History ID is too old/expired (>30 days). Fall back to windowed sync.
        console.log(`History ID ${existingHistoryId} expired for account ${accountId}. Falling back to windowed sync.`);
        const windowResult = await runWindowedGmailSync(userId, account, accessToken, options);
        emailsProcessed += windowResult.emailsProcessed;
        emailsPersisted += windowResult.emailsPersisted;
        duplicatesSkipped += windowResult.duplicatesSkipped;
        latestHistoryId = windowResult.latestHistoryId;
        pagesCount = windowResult.pagesCount;
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
          // Process label additions
          if (Array.isArray(record.labelsAdded)) {
            for (const item of record.labelsAdded) {
              if (item.message?.id && item.labelIds) {
                for (const lbl of item.labelIds) {
                  await updateEmailLabelState(userId, account.id, item.message.id, lbl, true);
                }
              }
            }
          }
          // Process label removals
          if (Array.isArray(record.labelsRemoved)) {
            for (const item of record.labelsRemoved) {
              if (item.message?.id && item.labelIds) {
                for (const lbl of item.labelIds) {
                  await updateEmailLabelState(userId, account.id, item.message.id, lbl, false);
                }
              }
            }
          }
        }

        // Fetch and persist newly added messages
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
      // Initial Sync with 90-Day Configurable Window and Controlled Pagination
      const windowResult = await runWindowedGmailSync(userId, account, accessToken, options);
      emailsProcessed += windowResult.emailsProcessed;
      emailsPersisted += windowResult.emailsPersisted;
      duplicatesSkipped += windowResult.duplicatesSkipped;
      latestHistoryId = windowResult.latestHistoryId;
      pagesCount = windowResult.pagesCount;
    }

    // 4. Update sync cursor and statistics in Firestore
    const allAccountEmails = await FirestoreDb.getEmails(userId, { accountId: account.id });
    const totalEmails = allAccountEmails.length;
    const unreadCount = allAccountEmails.filter((e) => !e.isRead).length;

    const now = new Date().toISOString();

    await FirestoreDb.updateSyncState(userId, account.id, {
      status: 'completed',
      progressPercent: 100,
      syncedCount: totalEmails,
      messagesSynced: emailsPersisted,
      pagesProcessed: pagesCount,
      lastSyncedAt: now,
      completedAt: now,
      lastSuccessfulSyncAt: now,
      lastHistoryId: latestHistoryId,
      providerHistoryId: latestHistoryId,
      errorMessage: undefined,
      error: undefined,
    });

    await FirestoreDb.updateAccount(userId, account.id, {
      status: 'Connected',
      totalEmails,
      unreadCount,
      lastSyncedAt: now,
      errorMessage: undefined,
    });

    return {
      accountId,
      userId,
      emailsProcessed,
      emailsPersisted,
      duplicatesSkipped,
      newHistoryId: latestHistoryId,
      durationMs: Date.now() - startTime,
      status: 'completed',
    };
  } catch (err: any) {
    console.error(`Gmail sync error for account ${accountId}:`, err);
    await FirestoreDb.updateSyncState(userId, account.id, {
      status: 'failed',
      errorMessage: err.message || 'Gmail sync failed',
      error: err.message || 'Gmail sync failed',
    }).catch(() => {});
    await FirestoreDb.updateAccount(userId, account.id, {
      status: 'Error',
      errorMessage: err.message || 'Gmail sync failed',
    }).catch(() => {});

    return {
      accountId,
      userId,
      emailsProcessed: 0,
      emailsPersisted: 0,
      duplicatesSkipped: 0,
      durationMs: Date.now() - startTime,
      status: 'failed',
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
  account: FirestoreEmailAccountDoc | EmailAccount,
  accessToken: string,
  options: GmailSyncOptions
): Promise<{ emailsProcessed: number; emailsPersisted: number; duplicatesSkipped: number; latestHistoryId?: string; pagesCount: number }> {
  const maxDays = options.maxDays || 90;
  const maxPages = options.maxPages || 5;
  const pageSize = options.pageSize || 25;
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
      maxResults: String(pageSize),
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

    // Calculate dynamic progress percent
    const progress = Math.min(20 + Math.round((pageCount / maxPages) * 70), 90);
    await FirestoreDb.updateSyncState(userId, account.id, { progressPercent: progress });

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

  return { emailsProcessed, emailsPersisted, duplicatesSkipped, latestHistoryId, pagesCount: pageCount };
}

/**
 * Persists an already fetched or raw Gmail message object into Firestore.
 * Performs normalization, deduplication, HTML sanitization, thread and attachment metadata extraction.
 */
export async function persistGmailMessage(
  userId: string,
  account: FirestoreEmailAccountDoc | EmailAccount,
  msg: any
): Promise<{ success: boolean; email: any; duplicate: boolean }> {
  const messageId = msg.id;
  const canonicalId = `gmail-${messageId}`;

  // Check deduplication in Firestore
  const existingEmail = await FirestoreDb.getEmailById(userId, canonicalId, account.id);
  const alreadyExists = Boolean(existingEmail);

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string): string =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('subject') || '(No Subject)';
  const fromHeader = getHeader('from') || 'unknown@sender.com';
  const toHeader = getHeader('to') || account.emailAddress;
  const ccHeader = getHeader('cc') || '';
  const bccHeader = getHeader('bcc') || '';
  const replyToHeader = getHeader('reply-to') || '';
  const dateHeader = getHeader('date') || '';

  // Case-insensitive header dictionary
  const headersMap: Record<string, string> = {};
  for (const h of headers) {
    if (h.name && h.value) {
      headersMap[h.name.toLowerCase()] = h.value;
    }
  }

  // Parse sender name & email
  let senderName = fromHeader;
  let senderEmail = fromHeader;
  if (fromHeader.includes('<')) {
    senderName = fromHeader.split('<')[0].replace(/"/g, '').trim();
    senderEmail = fromHeader.split('<')[1].replace('>', '').trim();
  }

  // Parse recipients & cc & bcc
  const to = toHeader ? toHeader.split(',').map((s) => s.trim()).filter(Boolean) : [account.emailAddress];
  const cc = ccHeader ? ccHeader.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const bcc = bccHeader ? bccHeader.split(',').map((s) => s.trim()).filter(Boolean) : [];

  // Extract body, sanitized HTML, and attachment metadata
  const { bodyText, bodyHtml, attachments } = extractGmailPayloadContent(msg.payload, msg.id);
  const bodySnippet = msg.snippet || bodyText.substring(0, 160) || '';

  // ISO 8601 Received timestamp
  let receivedAt = new Date().toISOString();
  if (msg.internalDate) {
    receivedAt = new Date(parseInt(msg.internalDate, 10)).toISOString();
  } else if (dateHeader) {
    const parsedDate = new Date(dateHeader);
    if (!isNaN(parsedDate.getTime())) receivedAt = parsedDate.toISOString();
  }

  let sentAt: string | undefined = undefined;
  if (dateHeader) {
    const parsedSent = new Date(dateHeader);
    if (!isNaN(parsedSent.getTime())) sentAt = parsedSent.toISOString();
  }

  const labels: string[] = msg.labelIds || [];
  const isRead = !labels.includes('UNREAD');
  const isStarred = labels.includes('STARRED');
  const isImportant = labels.includes('IMPORTANT');
  const hasAttachments = attachments.length > 0;

  const now = new Date().toISOString();

  // Normalized Email Document
  const emailRecord: any = {
    id: canonicalId,
    userId,
    accountId: account.id,
    provider: 'gmail',
    providerMessageId: msg.id,
    providerThreadId: msg.threadId || msg.id,

    // Step 4 schema fields
    from: { name: senderName, email: senderEmail },
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    replyTo: replyToHeader || undefined,
    subject,
    snippet: bodySnippet,
    body: bodyText || bodySnippet,
    textBody: bodyText,
    htmlBody: bodyHtml,
    receivedAt,
    sentAt: sentAt || receivedAt,
    labels,
    isRead,
    isStarred,
    isImportant,
    hasAttachments,
    attachments,
    headers: headersMap,

    // Backward-compatible fields for existing UI components
    sender: senderEmail,
    senderName: senderName || senderEmail.split('@')[0],
    senderDomain: senderEmail.includes('@') ? senderEmail.split('@')[1] : 'unknown',
    recipients: to,
    bodySnippet,
    bodyText,
    bodyHtml,
    hasAttachment: hasAttachments,
    threadId: msg.threadId || msg.id,
    accountEmail: account.emailAddress,
    isArchived: labels.includes('ARCHIVED') || (!labels.includes('INBOX') && !labels.includes('SPAM') && !labels.includes('TRASH')),
    isQuarantined: false,

    createdAt: existingEmail?.createdAt || now,
    updatedAt: now,
  };

  // 1. Save normalized email to Firestore
  await FirestoreDb.saveEmail(userId, emailRecord);

  // 2. Save thread document to Firestore with strict thread consistency
  const threadId = msg.threadId || msg.id;
  const existingThread = (await FirestoreDb.getThreadById(userId, threadId, account.id)) as any;
  const messageIds: string[] = existingThread
    ? Array.from(new Set([...(existingThread.messageIds || []), canonicalId]))
    : [canonicalId];
  const participants: string[] = existingThread
    ? Array.from(new Set([...(existingThread.participants || []), senderEmail, ...to]))
    : Array.from(new Set([senderEmail, ...to]));
  const existingDate = existingThread?.latestMessageAt || existingThread?.lastMessageDate;
  const isNewer = !existingThread || !existingDate || new Date(receivedAt).getTime() >= new Date(existingDate).getTime();
  const latestMessageAt = isNewer ? receivedAt : existingDate;
  const snippet = isNewer ? bodySnippet : (existingThread.snippet || bodySnippet);

  const threadRecord: EmailThread = {
    id: threadId,
    userId,
    accountId: account.id,
    provider: 'gmail',
    providerThreadId: threadId,
    subject: existingThread?.subject || subject,
    messageCount: messageIds.length,
    participants,
    latestMessageAt,
    snippet,
    messageIds,
    createdAt: existingThread?.createdAt || now,
    updatedAt: now,
  };
  await FirestoreDb.saveThread(userId, account.id, threadRecord);

  // 3. Save attachment metadata to Firestore (no binary storage)
  for (const att of attachments) {
    await FirestoreDb.saveAttachment(userId, {
      id: att.id,
      userId,
      emailId: canonicalId,
      threadId: msg.threadId,
      fileName: att.filename,
      fileSize: att.size,
      mimeType: att.mimeType,
      isSafe: true,
      createdAt: now,
    });
  }

  return {
    success: true,
    email: emailRecord,
    duplicate: alreadyExists,
  };
}

/**
 * Fetches an individual Gmail message, parses all required fields, sanitizes HTML,
 * normalizes to NormalizedEmail and EmailThread schemas, and idempotently stores in Firestore.
 * Does NOT run AI analysis or trigger external notifications (Step 4 data foundation only).
 * Accepts either (userId, account, rawMsg) or (userId, account, accessToken, messageId).
 */
export async function fetchAndPersistGmailMessage(
  userId: string,
  account: FirestoreEmailAccountDoc | EmailAccount,
  accessTokenOrMsg: string | any,
  messageId?: string
): Promise<any> {
  if (typeof accessTokenOrMsg === 'object' && accessTokenOrMsg !== null) {
    return persistGmailMessage(userId, account, accessTokenOrMsg);
  }

  const accessToken = accessTokenOrMsg as string;
  const msgRes = await fetchWithRetry(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgRes.ok) {
    return false;
  }

  const msg = await msgRes.json();
  const res = await persistGmailMessage(userId, account, msg);
  return res.success && !res.duplicate;
}

/**
 * Updates label states (e.g. read/unread, starred, important) during incremental sync
 */
async function updateEmailLabelState(
  userId: string,
  accountId: string,
  messageId: string,
  label: string,
  added: boolean
): Promise<void> {
  const canonicalId = `gmail-${messageId}`;
  const current = await FirestoreDb.getEmailById(userId, canonicalId, accountId);
  if (current) {
    const labels = new Set(current.labels || []);
    if (added) labels.add(label);
    else labels.delete(label);
    const updatedLabels = Array.from(labels);
    await FirestoreDb.updateEmail(userId, canonicalId, {
      labels: updatedLabels,
      isRead: !updatedLabels.includes('UNREAD'),
      isStarred: updatedLabels.includes('STARRED'),
      isImportant: updatedLabels.includes('IMPORTANT'),
    }, accountId);
  }
}
