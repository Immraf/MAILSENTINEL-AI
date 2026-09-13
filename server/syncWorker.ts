import { db } from './db';
import { Email, EmailAccount } from '../src/types';
import { analyzeEmailSecurityHeuristics } from '../src/utils/securityEngine';

interface ActiveJob {
  accountId: string;
  userId: string;
  startedAt: number;
}

const activeJobs: Map<string, ActiveJob> = new Map();

/**
 * Triggers background email synchronization for an account.
 * Does not block the caller HTTP request.
 */
export async function startAccountSync(userId: string, accountId: string): Promise<void> {
  const jobKey = `${userId}:${accountId}`;
  if (activeJobs.has(jobKey)) {
    return; // Already running
  }

  activeJobs.set(jobKey, { accountId, userId, startedAt: Date.now() });

  // Update DB status to syncing
  db.updateSyncState(userId, accountId, {
    status: 'syncing',
    progressPercent: 15,
  });
  db.updateAccount(userId, accountId, { status: 'syncing' });

  // Run asynchronously
  setTimeout(async () => {
    try {
      await executeSync(userId, accountId);
    } catch (err: any) {
      console.error(`Sync error for account ${accountId}:`, err);
      db.updateSyncState(userId, accountId, {
        status: 'error',
        errorMessage: err?.message || 'Sync failed',
      });
      db.updateAccount(userId, accountId, { status: 'error' });
    } finally {
      activeJobs.delete(jobKey);
    }
  }, 100);
}

async function executeSync(userId: string, accountId: string): Promise<void> {
  const account = db.getAccountById(userId, accountId);
  if (!account) return;

  // Check if real OAuth tokens are present for this account
  const rawAccounts = (db as any).getAccounts(userId) as any[];
  const rawAcc = rawAccounts.find((a) => a.id === accountId);
  const accessToken = rawAcc?.accessTokenEncrypted;

  if (accessToken && account.provider === 'gmail') {
    await syncRealGmailAccount(userId, account, accessToken);
  } else if (accessToken && account.provider === 'outlook') {
    await syncRealOutlookAccount(userId, account, accessToken);
  } else {
    // Demo Mode Synchronization
    await syncDemoAccount(userId, account);
  }
}

/**
 * Real Gmail Sync using Gmail REST API v1
 */
async function syncRealGmailAccount(userId: string, account: EmailAccount, accessToken: string): Promise<void> {
  try {
    db.updateSyncState(userId, account.id, { progressPercent: 35 });

    // 1. Fetch message list
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (listRes.status === 401) {
      db.updateAccount(userId, account.id, { status: 'needs_reauth' });
      db.updateSyncState(userId, account.id, { status: 'needs_reauth', errorMessage: 'OAuth token expired.' });
      return;
    }

    if (!listRes.ok) {
      throw new Error(`Gmail API error: ${listRes.statusText}`);
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    db.updateSyncState(userId, account.id, { progressPercent: 60, syncedCount: messages.length });

    // Fetch individual messages
    for (const msgRef of messages.slice(0, 10)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) continue;

        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const subject = getHeader('subject') || '(No Subject)';
        const from = getHeader('from') || 'unknown@example.com';
        const date = getHeader('date') || new Date().toISOString();
        const authResults = getHeader('authentication-results') || '';

        // Extract body snippet
        const bodySnippet = msg.snippet || '';

        // Parse SPF/DKIM/DMARC from headers
        const parsedSpf = authResults.includes('spf=pass')
          ? 'PASS'
          : authResults.includes('spf=fail')
          ? 'FAIL'
          : 'NONE';
        const parsedDkim = authResults.includes('dkim=pass')
          ? 'PASS'
          : authResults.includes('dkim=fail')
          ? 'FAIL'
          : 'NONE';
        const parsedDmarc = authResults.includes('dmarc=pass')
          ? 'PASS'
          : authResults.includes('dmarc=fail')
          ? 'FAIL'
          : 'NONE';

        const senderName = from.includes('<') ? from.split('<')[0].replace(/"/g, '').trim() : from;
        const senderEmail = from.includes('<') ? from.split('<')[1].replace('>', '').trim() : from;

        // Run Heuristic Security Engine
        const heuristic = analyzeEmailSecurityHeuristics({
          subject,
          body: bodySnippet,
          sender: senderEmail,
          senderName,
          attachments: [],
          authResults: { spf: parsedSpf, dkim: parsedDkim, dmarc: parsedDmarc },
        });

        const emailRecord: Email = {
          id: `gmail-${msg.id}`,
          accountId: account.id,
          accountEmail: account.emailAddress,
          provider: 'gmail',
          threadId: msg.threadId || msg.id,
          sender: senderEmail,
          senderName,
          senderDomain: senderEmail.includes('@') ? senderEmail.split('@')[1] : 'gmail.com',
          recipients: [account.emailAddress],
          subject,
          bodySnippet,
          bodyText: bodySnippet,
          receivedAt: new Date(date).toISOString(),
          isRead: !msg.labelIds?.includes('UNREAD'),
          isArchived: false,
          isQuarantined:
            heuristic.securityAnalysis.classification === 'PHISHING' ||
            heuristic.securityAnalysis.classification === 'MALICIOUS',
          hasAttachment: Boolean(msg.payload?.parts?.some((p: any) => p.filename && p.filename.length > 0)),
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

        db.saveEmail(userId, emailRecord);
      } catch (msgErr) {
        console.warn(`Error parsing message ${msgRef.id}:`, msgErr);
      }
    }

    db.updateSyncState(userId, account.id, {
      status: 'idle',
      progressPercent: 100,
      lastSyncedAt: new Date().toISOString(),
    });
    db.updateAccount(userId, account.id, {
      status: 'active',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    db.updateSyncState(userId, account.id, { status: 'error', errorMessage: err.message });
    db.updateAccount(userId, account.id, { status: 'error' });
  }
}

/**
 * Real Outlook Sync using Microsoft Graph API
 */
async function syncRealOutlookAccount(userId: string, account: EmailAccount, accessToken: string): Promise<void> {
  try {
    db.updateSyncState(userId, account.id, { progressPercent: 30 });

    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=15&$select=id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (graphRes.status === 401) {
      db.updateAccount(userId, account.id, { status: 'needs_reauth' });
      db.updateSyncState(userId, account.id, { status: 'needs_reauth', errorMessage: 'Microsoft token expired.' });
      return;
    }

    if (!graphRes.ok) {
      throw new Error(`Microsoft Graph error: ${graphRes.statusText}`);
    }

    const data = await graphRes.json();
    const messages = data.value || [];

    db.updateSyncState(userId, account.id, { progressPercent: 70, syncedCount: messages.length });

    for (const msg of messages) {
      const senderName = msg.from?.emailAddress?.name || 'Unknown';
      const senderEmail = msg.from?.emailAddress?.address || 'unknown@outlook.com';

      const heuristic = analyzeEmailSecurityHeuristics({
        subject: msg.subject || '(No Subject)',
        body: msg.bodyPreview || '',
        sender: senderEmail,
        senderName,
        attachments: [],
        authResults: { spf: 'PASS', dkim: 'PASS', dmarc: 'PASS' },
      });

      const emailRecord: Email = {
        id: `ms-${msg.id}`,
        accountId: account.id,
        accountEmail: account.emailAddress,
        provider: 'outlook',
        threadId: msg.conversationId || msg.id,
        sender: senderEmail,
        senderName,
        senderDomain: senderEmail.includes('@') ? senderEmail.split('@')[1] : 'outlook.com',
        recipients: [account.emailAddress],
        subject: msg.subject || '(No Subject)',
        bodySnippet: msg.bodyPreview || '',
        bodyText: msg.bodyPreview || '',
        receivedAt: msg.receivedDateTime || new Date().toISOString(),
        isRead: Boolean(msg.isRead),
        isArchived: false,
        isQuarantined:
          heuristic.securityAnalysis.classification === 'PHISHING' ||
          heuristic.securityAnalysis.classification === 'MALICIOUS',
        hasAttachment: Boolean(msg.hasAttachments),
        aiAnalysis: {
          category: 'business',
          priority: heuristic.priorityLevel,
          priorityScore: heuristic.priorityScore,
          summary: (msg.bodyPreview || '').substring(0, 180),
          sentiment: 'neutral',
          actionRequired: false,
          recommendedAction: 'Review incoming message',
          deadline: null,
          extractedEntities: [],
          whyPriorityReasons: heuristic.whyPriority,
          confidence: 0.9,
        },
        securityAnalysis: heuristic.securityAnalysis,
      };

      db.saveEmail(userId, emailRecord);
    }

    db.updateSyncState(userId, account.id, {
      status: 'idle',
      progressPercent: 100,
      lastSyncedAt: new Date().toISOString(),
    });
    db.updateAccount(userId, account.id, {
      status: 'active',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    db.updateSyncState(userId, account.id, { status: 'error', errorMessage: err.message });
    db.updateAccount(userId, account.id, { status: 'error' });
  }
}

/**
 * Demo Mode Simulated Synchronization
 */
async function syncDemoAccount(userId: string, account: EmailAccount): Promise<void> {
  // Step 1: Connecting
  await new Promise((r) => setTimeout(r, 300));
  db.updateSyncState(userId, account.id, { progressPercent: 50 });

  // Step 2: Indexing & Analysis
  await new Promise((r) => setTimeout(r, 400));
  db.updateSyncState(userId, account.id, { progressPercent: 85 });

  // Step 3: Finalize
  const now = new Date().toISOString();
  db.updateAccount(userId, account.id, {
    status: 'active',
    lastSyncedAt: now,
  });
  db.updateSyncState(userId, account.id, {
    status: 'idle',
    lastSyncedAt: now,
    progressPercent: 100,
  });

  db.addAuditLog(userId, {
    id: `log-sync-${Date.now()}`,
    timestamp: now,
    actionType: 'ACCOUNT_SYNC',
    description: `Synchronized mailbox: ${account.emailAddress} (Demo Mode).`,
  });
}
