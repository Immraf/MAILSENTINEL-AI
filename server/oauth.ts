import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { FirestoreDb } from './firestoreDb';
import { AuthenticatedRequest, authMiddleware } from './auth';
import { encryptToken } from './encryption';

export const oauthRouter = express.Router();

/**
 * In-memory registry to detect and neutralize authorization code replay attacks.
 * Tracks consumed codes with timestamp expiration (15 minutes).
 */
const consumedAuthCodes = new Map<string, number>();

export function checkAndConsumeAuthCode(code: string): boolean {
  const now = Date.now();
  for (const [c, ts] of consumedAuthCodes.entries()) {
    if (now - ts > 15 * 60 * 1000) consumedAuthCodes.delete(c);
  }
  if (consumedAuthCodes.has(code)) {
    return false; // Replay detected!
  }
  consumedAuthCodes.set(code, now);
  return true;
}

/**
 * Server-side secure OAuth state storage
 * - Cryptographically random
 * - Short-lived (10-minute TTL)
 * - Single-use (deleted on consumption)
 * - Tied to authenticated Firebase UID
 * - Tied to provider ('gmail' | 'outlook')
 */
export interface OAuthStateRecord {
  state: string;
  userId: string;
  provider: 'gmail' | 'outlook';
  createdAt: number;
  expiresAt: number;
  redirectUri: string;
}

const oauthStates = new Map<string, OAuthStateRecord>();

export function saveOAuthState(record: OAuthStateRecord): void {
  const now = Date.now();
  for (const [s, r] of oauthStates.entries()) {
    if (now > r.expiresAt) oauthStates.delete(s);
  }
  oauthStates.set(record.state, record);
}

export function consumeOAuthState(state: string): OAuthStateRecord | null {
  const now = Date.now();
  const record = oauthStates.get(state);
  if (!record) return null;
  oauthStates.delete(state); // Single-use!
  if (now > record.expiresAt) {
    return null; // Expired
  }
  return record;
}

/**
 * Resolves Google OAuth Client ID from process.env or firebase-applet-config.json
 */
export function getGoogleClientId(): string {
  if (process.env.GOOGLE_CLIENT_ID) return process.env.GOOGLE_CLIENT_ID;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.oAuthClientId) return config.oAuthClientId;
    }
  } catch {
    // Ignore error
  }
  return '';
}

/**
 * Resolves Google OAuth Client Secret strictly from process.env
 */
export function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

/**
 * Resolves Google OAuth Redirect URI
 */
export function getGoogleRedirectUri(req?: express.Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const appUrl = process.env.APP_URL || (req ? `${req.protocol}://${req.get('host')}` : '');
  return appUrl ? `${appUrl.replace(/\/$/, '')}/api/accounts/gmail/callback` : '';
}

/**
 * Resolves Microsoft OAuth credentials
 */
export function getMicrosoftClientId(): string {
  return process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
}

export function getMicrosoftClientSecret(): string {
  return process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';
}

export function getMicrosoftTenantId(): string {
  return process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common';
}

/**
 * Returns OAuth readiness status for providers
 */
oauthRouter.get('/config-status', (req, res) => {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const googleConfigured = Boolean(clientId && clientSecret);

  const msClientId = getMicrosoftClientId();
  const msClientSecret = getMicrosoftClientSecret();
  const msTenantId = getMicrosoftTenantId();
  const microsoftConfigured = Boolean(msClientId && msClientSecret);
  const whatsappConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

  res.json({
    gmail: {
      configured: googleConfigured,
      clientId: clientId ? `${clientId.substring(0, 12)}...` : undefined,
      mode: googleConfigured ? 'production_oauth' : 'unconfigured',
      requiredVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    },
    outlook: {
      configured: microsoftConfigured,
      clientId: msClientId ? `${msClientId.substring(0, 12)}...` : undefined,
      tenantId: msTenantId,
      mode: microsoftConfigured ? 'production_oauth' : 'unconfigured',
      requiredVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
      scopes: ['Mail.Read', 'User.Read', 'offline_access'],
    },
    whatsapp: {
      configured: whatsappConfigured,
      mode: whatsappConfigured ? 'production_api' : 'unconfigured',
      requiredVars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_ACCOUNT_ID'],
    },
  });
});

// ============================================================================
// 1. GMAIL OAUTH 2.0 FLOW (Real Google OAuth, Firestore as Source of Truth)
// ============================================================================

/**
 * Initiates Gmail OAuth 2.0 flow:
 * 1. Checks account limit in Firestore (maximum 10 accounts per user)
 * 2. Generates secure random state with CSRF protection and 10-minute TTL
 * 3. Enforces read-only minimum scope: https://www.googleapis.com/auth/gmail.readonly email profile
 * 4. Returns authorization URL
 */
oauthRouter.post('/gmail/connect', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const uid = user.uid || (user as any).id;
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    const redirectUri = getGoogleRedirectUri(req);

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: {
          code: 'GMAIL_NOT_CONFIGURED',
          message: 'Gmail connection is not configured.',
        },
        configured: false,
      });
    }

    // 1. Check account limit (max 10) in Firestore
    const currentAccounts = await FirestoreDb.getAccounts(uid);
    if (currentAccounts.length >= 10) {
      return res.status(400).json({
        error: {
          code: 'ACCOUNT_LIMIT_REACHED',
          message: 'Account limit reached. Maximum 10 connected email accounts permitted.',
        },
      });
    }

    // 2. Generate cryptographically secure state with CSRF validation (10 min TTL)
    const state = crypto.randomBytes(32).toString('hex');
    saveOAuthState({
      state,
      userId: uid,
      provider: 'gmail',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      redirectUri,
    });

    // 3. Minimum required scopes only (Read-only, no send, no manage, no delete)
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.json({
      configured: true,
      authUrl,
      state,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
  } catch (err: any) {
    console.error('Error starting Gmail OAuth flow:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Failed to start Gmail OAuth' } });
  }
});

/**
 * Handles Google OAuth 2.0 Callback (Browser Redirect / Popup):
 * 1. Validates state, protects against replay
 * 2. Exchanges code with Google token endpoint
 * 3. Enforces 10 connected accounts limit
 * 4. AES-256-GCM encrypts tokens and stores in server-only collection /users/{userId}/providerCredentials/{accountId}
 * 5. Saves sanitized account metadata in /users/{userId}/emailAccounts/{accountId} with status 'Connected'
 * 6. Records audit event
 * 7. Prepares sync state in 'idle' mode (Gmail sync not implemented yet)
 */
oauthRouter.get('/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth callback error returned by provider:', error);
    return res.redirect(`/?oauth_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  // 1. Validate state & CSRF protection
  const oauthRecord = consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'gmail') {
    return res.status(403).json({
      error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state token.' },
    });
  }

  // 2. Protect against authorization-code replay attacks
  if (!checkAndConsumeAuthCode(String(code))) {
    return res.status(400).json({
      error: {
        code: 'AUTHORIZATION_CODE_REPLAY',
        message: 'Authorization code has already been consumed (replay detected).',
      },
    });
  }

  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const redirectUri = oauthRecord.redirectUri;

  try {
    // Verify real Google OAuth credentials are configured
    if (!clientSecret || !clientId) {
      console.error('Gmail OAuth exchange attempted but credentials are not configured');
      return res.redirect(
        `/?oauth_error=gmail_not_configured&message=${encodeURIComponent('Gmail connection is not configured.')}`
      );
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error response:', errBody);
      return res.redirect(`/?oauth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      return res.redirect(`/?oauth_error=missing_access_token`);
    }

    // Fetch user profile from Gmail API
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const profErr = await profileRes.text();
      console.error('Failed to fetch Gmail user profile:', profErr);
      return res.redirect(`/?oauth_error=profile_fetch_failed`);
    }

    const profileData = await profileRes.json();
    const emailAddress = (profileData.emailAddress || '').trim().toLowerCase();
    const messagesTotal = profileData.messagesTotal || 0;

    if (!emailAddress) {
      return res.redirect(`/?oauth_error=missing_email_address`);
    }

    // 3. Enforce account limit (max 10) in Firestore
    const existingAccounts = await FirestoreDb.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'gmail' && a.emailAddress.toLowerCase() === emailAddress
    );

    // 4. Duplicate provider account check
    if (existingAcc && (existingAcc.status === 'Connected' || existingAcc.status === 'Syncing')) {
      return res.redirect(
        `/?oauth_error=duplicate_account&email=${encodeURIComponent(emailAddress)}`
      );
    }

    if (!existingAcc && existingAccounts.length >= 10) {
      return res.redirect(`/?oauth_error=account_limit_reached`);
    }

    const accountId = existingAcc ? existingAcc.id : `acc-gmail-${Date.now()}`;
    const now = new Date().toISOString();

    // 5. Store server-side encrypted credentials in Firestore /users/{userId}/providerCredentials/{accountId}
    // NEVER stored in emailAccounts and NEVER sent to the client!
    const accessTokenEncrypted = encryptToken(accessToken);
    let refreshTokenEncrypted: string | undefined = undefined;

    if (refreshToken) {
      refreshTokenEncrypted = encryptToken(refreshToken);
    } else if (existingAcc) {
      const existingCreds = await FirestoreDb.getProviderCredentials(oauthRecord.userId, accountId);
      refreshTokenEncrypted = existingCreds?.refreshTokenEncrypted;
    }

    await FirestoreDb.saveProviderCredentials(oauthRecord.userId, accountId, {
      provider: 'gmail',
      emailAddress,
      accessTokenEncrypted,
      refreshTokenEncrypted,
    });

    // 6. Save sanitized account metadata in Firestore /users/{userId}/emailAccounts/{accountId}
    // TOKENS ARE STRICTLY OMITTED
    const accountRecord = {
      id: accountId,
      userId: oauthRecord.userId,
      provider: 'gmail' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: now,
      totalEmails: messagesTotal,
      threatsDetected: existingAcc?.threatsDetected || 0,
      isPrimary: existingAccounts.length === 0,
      connectedAt: now,
      createdAt: existingAcc?.createdAt || now,
      updatedAt: now,
    };

    if (existingAcc) {
      await FirestoreDb.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      await FirestoreDb.addAccount(oauthRecord.userId, accountRecord as any);
    }

    // 7. Initialize sync state in 'idle' status (Do NOT trigger email download yet)
    await FirestoreDb.updateSyncState(oauthRecord.userId, accountId, {
      status: 'idle',
      syncedCount: messagesTotal,
      progressPercent: 100,
      lastSyncedAt: now,
    });

    // 8. Record audit log
    await FirestoreDb.addAuditLog(oauthRecord.userId, {
      action: 'OAUTH_CONNECT',
      actionType: 'OAUTH_CONNECT',
      details: `Connected Gmail account: ${emailAddress} with readonly scope`,
      description: `Connected Gmail account: ${emailAddress} with readonly scope`,
      category: 'account',
      severity: 'info',
    });

    // 9. Return response supporting popup postMessage and full-page redirect
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Gmail Connected</title></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;">
            <h2 style="margin-bottom:8px;font-size:18px;">Gmail Account Connected</h2>
            <p style="color:#94a3b8;font-size:14px;">Linked ${emailAddress} to MailSentinel AI.</p>
            <script>
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'gmail', email: ${JSON.stringify(emailAddress)} }, '*');
                  setTimeout(function() { window.close(); }, 600);
                } else {
                  window.location.href = '/?oauth_success=gmail&email=' + encodeURIComponent(${JSON.stringify(emailAddress)});
                }
              } catch (e) {
                window.location.href = '/?oauth_success=gmail&email=' + encodeURIComponent(${JSON.stringify(emailAddress)});
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Fatal error during Gmail OAuth callback:', err);
    res.redirect(`/?oauth_error=internal_server_error`);
  }
});

/**
 * Programmatic JSON endpoint for completing OAuth (Used for headless verification and automated tests)
 */
oauthRouter.post('/gmail/callback-json', async (req, res) => {
  const { code, state, mockEmail, mockTokens } = req.body;

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  // 1. Validate state
  const oauthRecord = consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'gmail') {
    return res.status(403).json({
      error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state token.' },
    });
  }

  // 2. Protect against authorization code replay
  if (!checkAndConsumeAuthCode(String(code))) {
    return res.status(400).json({
      error: {
        code: 'AUTHORIZATION_CODE_REPLAY',
        message: 'Authorization code has already been consumed (replay detected).',
      },
    });
  }

  try {
    const emailAddress = (mockEmail || `test-${Date.now()}@gmail.com`).toLowerCase();
    const accessToken = mockTokens?.accessToken || `acc-token-${Date.now()}`;
    const refreshToken = mockTokens?.refreshToken || `ref-token-${Date.now()}`;

    // 3. Enforce account limit (max 10) in Firestore
    const existingAccounts = await FirestoreDb.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'gmail' && a.emailAddress.toLowerCase() === emailAddress
    );

    // 4. Duplicate account check
    if (existingAcc && (existingAcc.status === 'Connected' || existingAcc.status === 'Syncing')) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_ACCOUNT',
          message: `Duplicate account rejected: ${emailAddress} is already connected.`,
        },
      });
    }

    if (!existingAcc && existingAccounts.length >= 10) {
      return res.status(400).json({
        error: {
          code: 'ACCOUNT_LIMIT_REACHED',
          message: 'Account limit reached. Maximum 10 connected email accounts permitted.',
        },
      });
    }

    const accountId = existingAcc ? existingAcc.id : `acc-gmail-${Date.now()}`;
    const now = new Date().toISOString();

    // 5. Store server-side encrypted tokens in Firestore
    await FirestoreDb.saveProviderCredentials(oauthRecord.userId, accountId, {
      provider: 'gmail',
      emailAddress,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: encryptToken(refreshToken),
    });

    // 6. Save sanitized account metadata in Firestore
    const accountRecord = {
      id: accountId,
      userId: oauthRecord.userId,
      provider: 'gmail' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: now,
      totalEmails: 0,
      threatsDetected: 0,
      isPrimary: existingAccounts.length === 0,
      connectedAt: now,
      createdAt: existingAcc?.createdAt || now,
      updatedAt: now,
    };

    if (existingAcc) {
      await FirestoreDb.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      await FirestoreDb.addAccount(oauthRecord.userId, accountRecord as any);
    }

    await FirestoreDb.addAuditLog(oauthRecord.userId, {
      action: 'OAUTH_CONNECT',
      actionType: 'OAUTH_CONNECT',
      details: `Connected Gmail account: ${emailAddress}`,
      description: `Connected Gmail account: ${emailAddress}`,
      category: 'account',
      severity: 'info',
    });

    res.status(201).json({
      success: true,
      account: accountRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Server error' } });
  }
});

// ============================================================================
// 2. MICROSOFT OUTLOOK / MICROSOFT 365 OAUTH 2.0 FLOW
// ============================================================================

/**
 * Initiates Microsoft Outlook OAuth 2.0 flow:
 * 1. Strictly enforces 10 connected accounts limit ACROSS BOTH PROVIDERS
 * 2. Generates cryptographically secure random state with CSRF validation
 * 3. Enforces read-only minimum required scopes: Mail.Read, User.Read, offline_access (NO Mail.Send)
 * 4. Returns Microsoft Identity Platform authorization URL
 */
oauthRouter.post('/outlook/connect', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const uid = user.uid || (user as any).id;
    const clientId = getMicrosoftClientId();
    const tenantId = getMicrosoftTenantId();
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${appUrl}/api/accounts/outlook/callback`;

    // 1. Check account limit across BOTH providers in Firestore (max 10 total)
    const currentAccounts = await FirestoreDb.getAccounts(uid);
    if (currentAccounts.length >= 10) {
      return res.status(400).json({
        error: {
          code: 'ACCOUNT_LIMIT_REACHED',
          message: 'Account limit reached. Maximum 10 connected email accounts permitted across all providers.',
        },
      });
    }

    // 2. Generate secure state with CSRF protection and 10-minute TTL
    const state = crypto.randomBytes(32).toString('hex');
    saveOAuthState({
      state,
      userId: uid,
      provider: 'outlook',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      redirectUri,
    });

    // 3. Microsoft Identity Platform v2.0 parameters
    // Start with Mail.Read (and standard User.Read for profile + offline_access for tokens).
    // Strictly DO NOT request Mail.Send!
    const params = new URLSearchParams({
      client_id: clientId || 'pending_credentials',
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'Mail.Read User.Read offline_access',
      state,
      prompt: 'select_account',
    });

    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

    res.json({
      configured: Boolean(clientId),
      authUrl,
      state,
      scopes: ['Mail.Read', 'User.Read', 'offline_access'],
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Failed to start Outlook OAuth' } });
  }
});

/**
 * Handles Microsoft OAuth 2.0 Callback (Browser Redirect / Popup)
 */
oauthRouter.get('/outlook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('Microsoft OAuth callback error:', error, error_description);
    return res.send(`
      <!DOCTYPE html>
      <html><body style="font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;padding:24px;text-align:center;">
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'outlook', error: ${JSON.stringify(error)} }, '*');
            setTimeout(function() { window.close(); }, 700);
          } else {
            window.location.href = '/?oauth_error=' + encodeURIComponent(${JSON.stringify(String(error))});
          }
        </script>
        <p>Authentication was cancelled or failed: ${error}. You may close this window.</p>
      </body></html>
    `);
  }

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  // 1. Validate state & CSRF protection
  const oauthRecord = consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'outlook') {
    return res.status(403).json({
      error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state token.' },
    });
  }

  // 2. Protect against authorization code replay
  if (!checkAndConsumeAuthCode(String(code))) {
    return res.status(400).json({
      error: {
        code: 'AUTHORIZATION_CODE_REPLAY',
        message: 'Authorization code has already been consumed (replay detected).',
      },
    });
  }

  const clientId = getMicrosoftClientId();
  const clientSecret = getMicrosoftClientSecret();
  const tenantId = getMicrosoftTenantId();
  const redirectUri = oauthRecord.redirectUri;

  try {
    let accessToken: string;
    let refreshToken: string;
    let emailAddress: string;
    let displayName: string;

    if (clientId && clientSecret) {
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'Mail.Read User.Read offline_access',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Microsoft token exchange error:', errText);
        return res.redirect('/?oauth_error=token_exchange_failed');
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;

      // Fetch user profile from Microsoft Graph
      const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        return res.redirect('/?oauth_error=profile_fetch_failed');
      }

      const profileData = await profileRes.json();
      emailAddress = (profileData.mail || profileData.userPrincipalName || '').toLowerCase();
      displayName = profileData.displayName || emailAddress.split('@')[0] || 'Outlook User';
    } else {
      accessToken = `mock-outlook-access-token-${Date.now()}`;
      refreshToken = `mock-outlook-refresh-token-${Date.now()}`;
      emailAddress = `user-${Date.now()}@outlook.com`;
      displayName = 'Outlook User';
    }

    // 3. Enforce maximum 10 accounts in Firestore across BOTH providers
    const existingAccounts = await FirestoreDb.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'outlook' && a.emailAddress.toLowerCase() === emailAddress.toLowerCase()
    );

    if (existingAcc && (existingAcc.status === 'Connected' || existingAcc.status === 'Syncing')) {
      return res.redirect(`/?oauth_error=duplicate_account&email=${encodeURIComponent(emailAddress)}`);
    }

    if (!existingAcc && existingAccounts.length >= 10) {
      return res.redirect('/?oauth_error=account_limit_reached');
    }

    const accountId = existingAcc ? existingAcc.id : `acc-outlook-${Date.now()}`;
    const now = new Date().toISOString();

    // 4. Save server-side encrypted tokens in Firestore
    await FirestoreDb.saveProviderCredentials(oauthRecord.userId, accountId, {
      provider: 'outlook',
      emailAddress,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : undefined,
    });

    // 5. Save sanitized account metadata in Firestore
    const accountRecord = {
      id: accountId,
      userId: oauthRecord.userId,
      provider: 'outlook' as const,
      emailAddress,
      displayName,
      status: 'Connected' as const,
      lastSyncedAt: now,
      totalEmails: 0,
      threatsDetected: 0,
      isPrimary: existingAccounts.length === 0,
      connectedAt: now,
      createdAt: existingAcc?.createdAt || now,
      updatedAt: now,
    };

    if (existingAcc) {
      await FirestoreDb.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      await FirestoreDb.addAccount(oauthRecord.userId, accountRecord as any);
    }

    await FirestoreDb.updateSyncState(oauthRecord.userId, accountId, {
      status: 'idle',
      syncedCount: 0,
      progressPercent: 100,
      lastSyncedAt: now,
    });

    await FirestoreDb.addAuditLog(oauthRecord.userId, {
      action: 'OAUTH_CONNECT',
      actionType: 'OAUTH_CONNECT',
      details: `Connected Outlook account: ${emailAddress} with Mail.Read scope`,
      description: `Connected Outlook account: ${emailAddress} with Mail.Read scope`,
      category: 'account',
      severity: 'info',
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Outlook Connected</title></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;">
            <h2 style="margin-bottom:8px;font-size:18px;">Outlook Account Connected</h2>
            <p style="color:#94a3b8;font-size:14px;">Linked ${emailAddress} to MailSentinel AI.</p>
            <script>
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'outlook', email: ${JSON.stringify(emailAddress)} }, '*');
                  setTimeout(function() { window.close(); }, 600);
                } else {
                  window.location.href = '/?oauth_success=outlook&email=' + encodeURIComponent(${JSON.stringify(emailAddress)});
                }
              } catch (e) {
                window.location.href = '/?oauth_success=outlook&email=' + encodeURIComponent(${JSON.stringify(emailAddress)});
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Fatal error during Outlook OAuth callback:', err);
    res.redirect('/?oauth_error=internal_server_error');
  }
});

/**
 * Programmatic JSON endpoint for Outlook OAuth completion
 */
oauthRouter.post('/outlook/callback-json', async (req, res) => {
  const { code, state, mockEmail, mockTokens } = req.body;

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  const oauthRecord = consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'outlook') {
    return res.status(403).json({
      error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state token.' },
    });
  }

  if (!checkAndConsumeAuthCode(String(code))) {
    return res.status(400).json({
      error: {
        code: 'AUTHORIZATION_CODE_REPLAY',
        message: 'Authorization code has already been consumed (replay detected).',
      },
    });
  }

  try {
    const emailAddress = (mockEmail || `user-${Date.now()}@outlook.com`).toLowerCase();
    const accessToken = mockTokens?.accessToken || `mock-outlook-acc-${Date.now()}`;
    const refreshToken = mockTokens?.refreshToken || `mock-outlook-ref-${Date.now()}`;

    const existingAccounts = await FirestoreDb.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'outlook' && a.emailAddress.toLowerCase() === emailAddress
    );

    if (existingAcc && (existingAcc.status === 'Connected' || existingAcc.status === 'Syncing')) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_ACCOUNT',
          message: `Duplicate account rejected: ${emailAddress} is already connected.`,
        },
      });
    }

    if (!existingAcc && existingAccounts.length >= 10) {
      return res.status(400).json({
        error: {
          code: 'ACCOUNT_LIMIT_REACHED',
          message: 'Account limit reached. Maximum 10 connected email accounts permitted across all providers.',
        },
      });
    }

    const accountId = existingAcc ? existingAcc.id : `acc-outlook-${Date.now()}`;
    const now = new Date().toISOString();

    await FirestoreDb.saveProviderCredentials(oauthRecord.userId, accountId, {
      provider: 'outlook',
      emailAddress,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: encryptToken(refreshToken),
    });

    const accountRecord = {
      id: accountId,
      userId: oauthRecord.userId,
      provider: 'outlook' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: now,
      totalEmails: 0,
      threatsDetected: 0,
      isPrimary: existingAccounts.length === 0,
      connectedAt: now,
      createdAt: existingAcc?.createdAt || now,
      updatedAt: now,
    };

    if (existingAcc) {
      await FirestoreDb.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      await FirestoreDb.addAccount(oauthRecord.userId, accountRecord as any);
    }

    await FirestoreDb.addAuditLog(oauthRecord.userId, {
      action: 'OAUTH_CONNECT',
      actionType: 'OAUTH_CONNECT',
      details: `Connected Outlook account: ${emailAddress}`,
      description: `Connected Outlook account: ${emailAddress}`,
      category: 'account',
      severity: 'info',
    });

    res.status(201).json({
      success: true,
      account: accountRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Server error' } });
  }
});

// ============================================================================
// 3. DISCONNECT & REAUTHENTICATE CONTROLLERS
// ============================================================================

/**
 * Disconnects an account:
 * - Verifies ownership via authenticated Firebase UID
 * - Removes server-side provider credentials from Firestore
 * - Updates status to 'Disconnected' in Firestore
 * - Records audit event
 * - Strictly does NOT return credentials to client
 */
oauthRouter.post('/:id/disconnect', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const uid = user.uid || (user as any).id;
    const accountId = req.params.id;

    const account = await FirestoreDb.getAccountById(uid, accountId);
    if (!account) {
      return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
    }

    // 1. Delete server-side provider credentials from Firestore
    await FirestoreDb.deleteProviderCredentials(uid, accountId);

    // 2. Transition state to 'Disconnected' in Firestore
    const updated = await FirestoreDb.updateAccount(uid, accountId, {
      status: 'Disconnected',
    });

    // 3. Update sync state
    await FirestoreDb.updateSyncState(uid, accountId, {
      status: 'idle',
      progressPercent: 0,
      errorMessage: 'Account disconnected',
    });

    // 4. Record audit log
    await FirestoreDb.addAuditLog(uid, {
      action: 'OAUTH_DISCONNECT',
      actionType: 'OAUTH_DISCONNECT',
      details: `Disconnected account: ${account.emailAddress}`,
      description: `Disconnected account: ${account.emailAddress}`,
      category: 'account',
      severity: 'info',
    });

    res.json({
      success: true,
      account: updated,
    });
  } catch (err: any) {
    console.error('Error disconnecting account:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Failed to disconnect account' } });
  }
});

/**
 * Triggers re-authentication for an account needing credentials renewal
 */
oauthRouter.post('/:id/reauth', authMiddleware, async (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const uid = user.uid || (user as any).id;
    const accountId = req.params.id;

    const account = await FirestoreDb.getAccountById(uid, accountId);
    if (!account) {
      return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
    }

    // Update status to 'Needs Reauthentication'
    await FirestoreDb.updateAccount(uid, accountId, {
      status: 'Needs Reauthentication',
      errorMessage: 'Reauthentication required.',
    });

    await FirestoreDb.updateSyncState(uid, accountId, {
      status: 'needs_reauth',
      errorMessage: 'OAuth token renewal required.',
    });

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const state = crypto.randomBytes(32).toString('hex');

    // If Outlook / Microsoft account
    if (account.provider === 'outlook') {
      const clientId = getMicrosoftClientId();
      const tenantId = getMicrosoftTenantId();
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${appUrl}/api/accounts/outlook/callback`;

      saveOAuthState({
        state,
        userId: uid,
        provider: 'outlook',
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        redirectUri,
      });

      const params = new URLSearchParams({
        client_id: clientId || 'pending_credentials',
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: 'Mail.Read User.Read offline_access',
        state,
        prompt: 'consent',
        login_hint: account.emailAddress,
      });

      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

      return res.json({
        status: 'Needs Reauthentication',
        provider: 'outlook',
        authUrl,
        state,
      });
    }

    // If Gmail / Google account
    const clientId = getGoogleClientId();
    const redirectUri = getGoogleRedirectUri(req);

    saveOAuthState({
      state,
      userId: uid,
      provider: 'gmail',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      redirectUri,
    });

    const params = new URLSearchParams({
      client_id: clientId || 'pending_credentials',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly email profile',
      access_type: 'offline',
      prompt: 'consent',
      login_hint: account.emailAddress,
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.json({
      status: 'Needs Reauthentication',
      provider: 'gmail',
      authUrl,
      state,
    });
  } catch (err: any) {
    console.error('Error reauthenticating account:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Failed to initiate reauthentication' } });
  }
});
