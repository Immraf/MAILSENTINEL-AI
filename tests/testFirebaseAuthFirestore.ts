import assert from 'assert';
import { FirestoreDb } from '../server/firestoreDb';
import { FirestoreUserDoc } from '../src/types/firestore';

async function runStep2BVerification() {
  console.log('--- Verifying Step 2B: Firebase Auth & Firestore Migration ---');

  const testUid = `test-user-${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Test User Creation in Firestore (/users/{userId})
  const testUser: FirestoreUserDoc = {
    id: testUid,
    uid: testUid,
    email: 'sentinel-test@mailsentinel.ai',
    displayName: 'Sentinel Test User',
    photoURL: 'https://example.com/avatar.png',
    emailVerified: true,
    provider: 'google',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  const created = await FirestoreDb.createUser(testUser);
  assert.strictEqual(created.id, testUid, 'User ID must match UID');
  assert.strictEqual(created.email, 'sentinel-test@mailsentinel.ai');

  // 2. Test User Retrieval
  const fetched = await FirestoreDb.getUser(testUid);
  assert(fetched !== null, 'User must exist in Firestore');
  assert.strictEqual(fetched?.displayName, 'Sentinel Test User');
  assert.strictEqual(fetched?.provider, 'google');

  // 3. Test Profile Update & lastLoginAt
  const updatedTime = new Date().toISOString();
  const updated = await FirestoreDb.updateUser(testUid, {
    displayName: 'Sentinel Updated Name',
    lastLoginAt: updatedTime,
  });
  assert.strictEqual(updated?.displayName, 'Sentinel Updated Name');

  // 4. Test Audit Logging for LOGIN and LOGOUT
  const loginAudit = await FirestoreDb.addAuditLog(testUid, {
    id: `log-login-${Date.now()}`,
    timestamp: now,
    action: 'LOGIN',
    actionType: 'LOGIN',
    details: 'User authenticated via Google Sign-In',
    category: 'user',
    severity: 'info',
  });
  assert.strictEqual(loginAudit.actionType, 'LOGIN');
  assert.strictEqual(loginAudit.userId, testUid);

  const logoutAudit = await FirestoreDb.addAuditLog(testUid, {
    id: `log-logout-${Date.now()}`,
    timestamp: now,
    action: 'LOGOUT',
    actionType: 'LOGOUT',
    details: 'User signed out',
    category: 'user',
    severity: 'info',
  });
  assert.strictEqual(logoutAudit.actionType, 'LOGOUT', 'Logout event must have actionType LOGOUT');

  // 5. Test Audit Log Retrieval
  const logs = await FirestoreDb.getAuditLogs(testUid);
  assert(logs.length >= 2, 'Audit logs must be saved and retrievable');
  const hasLogout = logs.some((l) => l.actionType === 'LOGOUT');
  assert(hasLogout, 'Audit logs must contain LOGOUT event');

  console.log('✓ All Step 2B Firestore authentication and audit tests passed successfully!');
}

runStep2BVerification().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
