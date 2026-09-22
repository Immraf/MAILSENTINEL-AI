/**
 * MailSentinel AI - Background Account Synchronization Worker
 * 
 * Orchestrates background synchronization jobs per account.
 * Routes Gmail accounts directly to the Step 4 Firestore Gmail sync engine.
 */

import { FirestoreDb } from './firestoreDb';
import { syncGmailAccount, isSyncJobRunning } from './gmailSync';
import { syncOutlookAccount } from './outlookSync';
import { EmailAccount } from '../src/types';

interface ActiveJob {
  accountId: string;
  userId: string;
  startedAt: number;
}

const activeJobs: Map<string, ActiveJob> = new Map();

/**
 * Checks if a background sync job is currently running for an account
 */
export function isAccountSyncRunning(userId: string, accountId: string): boolean {
  return activeJobs.has(`${userId}:${accountId}`) || isSyncJobRunning(userId, accountId);
}

/**
 * Triggers background email synchronization for an account.
 * Does not block the caller HTTP request.
 */
export async function startAccountSync(userId: string, accountId: string): Promise<void> {
  const jobKey = `${userId}:${accountId}`;
  if (activeJobs.has(jobKey) || isSyncJobRunning(userId, accountId)) {
    return; // Already running
  }

  activeJobs.set(jobKey, { accountId, userId, startedAt: Date.now() });

  // Update sync state to syncing in Firestore
  await FirestoreDb.updateSyncState(userId, accountId, {
    status: 'syncing',
    progressPercent: 15,
  }).catch(() => {});
  await FirestoreDb.updateAccount(userId, accountId, { status: 'Syncing' }).catch(() => {});

  // Run asynchronously without blocking
  setTimeout(async () => {
    try {
      await executeSync(userId, accountId);
    } catch (err: any) {
      console.error(`Sync error for account ${accountId}:`, err);
      await FirestoreDb.updateSyncState(userId, accountId, {
        status: 'error',
        errorMessage: err?.message || 'Sync failed',
      }).catch(() => {});
      await FirestoreDb.updateAccount(userId, accountId, { status: 'Error' }).catch(() => {});
    } finally {
      activeJobs.delete(jobKey);
    }
  }, 50);
}

/**
 * Executes synchronization depending on provider
 */
async function executeSync(userId: string, accountId: string): Promise<void> {
  // 1. Fetch account from Firestore
  const account = await FirestoreDb.getAccountById(userId, accountId);
  if (!account) return;

  if (account.provider === 'gmail') {
    // Route directly to real Step 4 Firestore Gmail Sync Engine
    await syncGmailAccount(userId, accountId);
    return;
  }

  if (account.provider === 'outlook') {
    await syncOutlookAccount(userId, accountId);
    return;
  }

  // Demo or simulated account fallback
  await syncDemoAccount(userId, account as any);
}

/**
 * Demo Mode Simulated Synchronization
 */
async function syncDemoAccount(userId: string, account: EmailAccount): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  await FirestoreDb.updateSyncState(userId, account.id, { progressPercent: 50 });

  await new Promise((r) => setTimeout(r, 300));
  await FirestoreDb.updateSyncState(userId, account.id, { progressPercent: 85 });

  const now = new Date().toISOString();
  await FirestoreDb.updateAccount(userId, account.id, {
    status: 'Connected',
    lastSyncedAt: now,
  });
  await FirestoreDb.updateSyncState(userId, account.id, {
    status: 'idle',
    lastSyncedAt: now,
    progressPercent: 100,
  });

  await FirestoreDb.addAuditLog(userId, {
    id: `log-sync-${Date.now()}`,
    timestamp: now,
    action: 'ACCOUNT_SYNC',
    actionType: 'ACCOUNT_SYNC',
    details: `Synchronized mailbox: ${account.emailAddress} (Demo Mode).`,
    description: `Synchronized mailbox: ${account.emailAddress} (Demo Mode).`,
  });
}
