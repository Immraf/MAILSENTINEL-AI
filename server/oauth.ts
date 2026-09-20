import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { AuthenticatedRequest, authMiddleware } from './auth';
import { encryptToken } from './encryption';
import { startAccountSync } from './syncWorker';

export const oauthRouter = express.Router();

/**
 * In-memory registry to detect and neutralize authorization code replay attacks.
 * Tracks consumed codes with timestamp expiration.
 */
const consumedAuthCodes = new Map<string, number>();

export function checkAndConsumeAuthCode(code: string): boolean {
  const now = Date.now();
  // Garbage collect expired codes older than 15 minutes
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
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
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
      mode: googleConfigured ? 'production_oauth' : 'configured_client_id',
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
// 1. GMAIL OAUTH 2.0 FLOW
// ============================================================================

/**
 * Initiates Gmail OAuth 2.0 flow:
 * 1. Checks account limit (maximum 10 accounts per user)
 * 2. Generates secure random state with CSRF protection and 10-minute TTL
 * 3. Enforces minimum scope: https://www.googleapis.com/auth/gmail.readonly
 * 4. Returns authorization URL
 */
oauthRouter.post('/gmail/connect', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const clientId = getGoogleClientId();
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/gmail/callback`;

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).json({
      error: {
        code: 'GMAIL_NOT_CONFIGURED',
        message: 'Gmail connection is not configured.',
      },
      configured: false,
    });
  }

  // 1. Check account limit (max 10)
  const currentAccounts = db.getAccounts(user.id);
  if (currentAccounts.length >= 10) {
    return res.status(400).json({
      error: {
        code: 'ACCOUNT_LIMIT_REACHED',
        message: 'Account limit reached. Maximum 10 connected email accounts permitted.',
      },
    });
  }

  // 2. Generate cryptographically secure state with CSRF validation
  const state = crypto.randomBytes(32).toString('hex');
  db.saveOAuthState({
    state,
    userId: user.id,
    provider: 'gmail',
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes TTL
    redirectUri,
  });

  // 3. Minimum required scopes only (no send, no calendar, no drive, no contacts)
  const params = new URLSearchParams({
    client_id: clientId || 'pending_credentials',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  res.json({
    configured: Boolean(clientId),
    authUrl,
    state,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
});

/**
 * Handles Google OAuth 2.0 Callback (Browser Redirect):
 * Validates state, protects against replay, exchanges code, encrypts tokens,
 * creates account with status 'Connected', and launches background sync.
 */
oauthRouter.get('/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth callback error:', error);
    return res.redirect(`/?oauth_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  // 1. Validate state & CSRF protection
  const oauthRecord = db.consumeOAuthState(String(state));
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
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = oauthRecord.redirectUri;

  try {
    let accessToken: string;
    let refreshToken: string;
    let emailAddress: string;
    let messagesTotal = 0;

    // Verify real Google OAuth credentials are configured
    if (!clientSecret || !clientId) {
      console.error('Gmail OAuth exchange attempted but credentials are not configured');
      return res.redirect(
        `/?oauth_error=gmail_not_configured&message=${encodeURIComponent('Gmail connection is not configured.')}`
      );
    }

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
      console.error('Google token exchange error:', errBody);
      return res.redirect(`/?oauth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;

    // Fetch user profile from Gmail API
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return res.redirect(`/?oauth_error=profile_fetch_failed`);
    }

    const profileData = await profileRes.json();
    emailAddress = profileData.emailAddress;
    messagesTotal = profileData.messagesTotal || 0;

    // 3. Enforce account limit (max 10)
    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'gmail' && a.emailAddress.toLowerCase() === emailAddress.toLowerCase()
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

    // 5. Encrypt credentials before storage (AES-256-GCM)
    const accountId = existingAcc ? existingAcc.id : `acc-gmail-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'gmail' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: messagesTotal,
      threatsDetected: 0,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : (existingAcc as any)?.refreshTokenEncrypted,
    };

    if (existingAcc) {
      db.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      db.addAccount(oauthRecord.userId, accountRecord);
    }

    db.addAuditLog(oauthRecord.userId, {
      id: `log-oauth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'OAUTH_CONNECT',
      description: `Connected Gmail account: ${emailAddress} with readonly scope`,
    });

    // 6. Launch background synchronization
    startAccountSync(oauthRecord.userId, accountId);

    // 7. Return response supporting popup postMessage and full-page redirect
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Complete</title></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;">
            <h2 style="margin-bottom:8px;font-size:18px;">Gmail Account Connected</h2>
            <p style="color:#94a3b8;font-size:14px;">Synchronizing ${emailAddress} with MailSentinel AI...</p>
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
  const oauthRecord = db.consumeOAuthState(String(state));
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
    const emailAddress = mockEmail || `test-${Date.now()}@gmail.com`;
    const accessToken = mockTokens?.accessToken || `acc-token-${Date.now()}`;
    const refreshToken = mockTokens?.refreshToken || `ref-token-${Date.now()}`;

    // 3. Enforce account limit (max 10)
    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'gmail' && a.emailAddress.toLowerCase() === emailAddress.toLowerCase()
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

    // 5. Store AES-256-GCM encrypted tokens
    const accountId = existingAcc ? existingAcc.id : `acc-gmail-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'gmail' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: 0,
      threatsDetected: 0,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: encryptToken(refreshToken),
    };

    if (existingAcc) {
      db.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      db.addAccount(oauthRecord.userId, accountRecord);
    }

    db.addAuditLog(oauthRecord.userId, {
      id: `log-oauth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'OAUTH_CONNECT',
      description: `Connected Gmail account: ${emailAddress}`,
    });

    // 6. Return sanitized account (tokens NEVER sent to client)
    const { accessTokenEncrypted, refreshTokenEncrypted, ...safeAccount } = accountRecord as any;

    res.status(201).json({
      success: true,
      account: safeAccount,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ============================================================================
// 2. MICROSOFT OUTLOOK / MICROSOFT 365 OAUTH 2.0 FLOW (Step 7)
// ============================================================================

/**
 * Initiates Microsoft Outlook OAuth 2.0 flow:
 * 1. Strictly enforces 10 connected accounts limit ACROSS BOTH PROVIDERS
 * 2. Generates cryptographically secure random state with CSRF validation
 * 3. Enforces read-only minimum required scopes: Mail.Read, User.Read, offline_access (NO Mail.Send)
 * 4. Returns Microsoft Identity Platform authorization URL
 */
oauthRouter.post('/outlook/connect', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const clientId = getMicrosoftClientId();
  const tenantId = getMicrosoftTenantId();
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${appUrl}/api/accounts/outlook/callback`;

  // 1. Check account limit across BOTH providers (max 10 total)
  const currentAccounts = db.getAccounts(user.id);
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
  db.saveOAuthState({
    state,
    userId: user.id,
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
});

/**
 * Handles Microsoft OAuth 2.0 Callback (Browser Redirect / Popup):
 * 1. Validates state, protects against replay
 * 2. Exchanges code for Microsoft Graph tokens
 * 3. Enforces 10 connected accounts limit across BOTH providers
 * 4. AES-256-GCM encrypts tokens and persists account
 * 5. Launches background synchronization via Microsoft Graph delta engine
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
  const oauthRecord = db.consumeOAuthState(String(state));
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
      // Real Microsoft Identity Platform token exchange
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
      // Local dev / test harness fallback
      accessToken = `mock-outlook-access-token-${Date.now()}`;
      refreshToken = `mock-outlook-refresh-token-${Date.now()}`;
      emailAddress = `user-${Date.now()}@outlook.com`;
      displayName = 'Outlook User';
    }

    // 3. Enforce maximum 10 accounts across BOTH providers
    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'outlook' && a.emailAddress.toLowerCase() === emailAddress.toLowerCase()
    );

    if (existingAcc && (existingAcc.status === 'Connected' || existingAcc.status === 'Syncing')) {
      return res.redirect(`/?oauth_error=duplicate_account&email=${encodeURIComponent(emailAddress)}`);
    }

    if (!existingAcc && existingAccounts.length >= 10) {
      return res.redirect('/?oauth_error=account_limit_reached');
    }

    // 4. Encrypt credentials before storage (AES-256-GCM)
    const accountId = existingAcc ? existingAcc.id : `acc-outlook-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'outlook' as const,
      emailAddress,
      displayName,
      status: 'Connected' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: 0,
      threatsDetected: 0,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : (existingAcc as any)?.refreshTokenEncrypted,
    };

    if (existingAcc) {
      db.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      db.addAccount(oauthRecord.userId, accountRecord);
    }

    db.addAuditLog(oauthRecord.userId, {
      id: `log-oauth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'OAUTH_CONNECT',
      description: `Connected Outlook account: ${emailAddress} with Mail.Read scope`,
    });

    // 5. Launch background synchronization via Microsoft Graph delta engine
    startAccountSync(oauthRecord.userId, accountId);

    // 6. Return response supporting popup postMessage and full-page redirect
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Complete</title></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;">
            <h2 style="margin-bottom:8px;font-size:18px;">Outlook Account Connected</h2>
            <p style="color:#94a3b8;font-size:14px;">Synchronizing ${emailAddress} with MailSentinel AI...</p>
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
 * Programmatic JSON endpoint for Outlook OAuth completion (Used for headless verification and test suites)
 */
oauthRouter.post('/outlook/callback-json', async (req, res) => {
  const { code, state, mockEmail, mockTokens } = req.body;

  if (!code || !state) {
    return res.status(400).json({
      error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' },
    });
  }

  // 1. Validate state
  const oauthRecord = db.consumeOAuthState(String(state));
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

  try {
    const emailAddress = mockEmail || `user-${Date.now()}@outlook.com`;
    const accessToken = mockTokens?.accessToken || `mock-outlook-acc-${Date.now()}`;
    const refreshToken = mockTokens?.refreshToken || `mock-outlook-ref-${Date.now()}`;

    // 3. Enforce maximum 10 accounts across BOTH providers
    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find(
      (a) => a.provider === 'outlook' && a.emailAddress.toLowerCase() === emailAddress.toLowerCase()
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

    // 4. Store AES-256-GCM encrypted tokens
    const accountId = existingAcc ? existingAcc.id : `acc-outlook-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'outlook' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'Connected' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: 0,
      threatsDetected: 0,
      accessTokenEncrypted: encryptToken(accessToken),
      refreshTokenEncrypted: encryptToken(refreshToken),
    };

    if (existingAcc) {
      db.updateAccount(oauthRecord.userId, accountId, accountRecord);
    } else {
      db.addAccount(oauthRecord.userId, accountRecord);
    }

    db.addAuditLog(oauthRecord.userId, {
      id: `log-oauth-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'OAUTH_CONNECT',
      description: `Connected Outlook account: ${emailAddress} with Mail.Read scope`,
    });

    // 5. Trigger background sync
    startAccountSync(oauthRecord.userId, accountId);

    // 6. Return sanitized account (tokens NEVER sent to client)
    const { accessTokenEncrypted, refreshTokenEncrypted, ...safeAccount } = accountRecord as any;

    res.status(201).json({
      success: true,
      account: safeAccount,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ============================================================================
// 3. DISCONNECT & REAUTHENTICATE CONTROLLERS
// ============================================================================

/**
 * Disconnects an account: updates status to 'Disconnected' and scrubs encrypted credentials
 */
oauthRouter.post('/:id/disconnect', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const accountId = req.params.id;

  const account = db.getAccountById(user.id, accountId);
  if (!account) {
    return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
  }

  // Transition state to 'Disconnected' and scrub credentials
  db.updateAccount(user.id, accountId, {
    status: 'Disconnected',
    accessTokenEncrypted: undefined,
    refreshTokenEncrypted: undefined,
  } as any);

  db.updateSyncState(user.id, accountId, {
    status: 'idle',
    progressPercent: 0,
    errorMessage: 'Account disconnected',
  });

  db.addAuditLog(user.id, {
    id: `log-dc-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actionType: 'OAUTH_DISCONNECT',
    description: `Disconnected account: ${account.emailAddress}`,
  });

  const updatedAccount = db.getAccountById(user.id, accountId);
  const { accessTokenEncrypted, refreshTokenEncrypted, ...safe } = (updatedAccount as any) || {};

  res.json({
    success: true,
    account: safe,
  });
});

/**
 * Triggers re-authentication for an account needing credentials renewal
 */
oauthRouter.post('/:id/reauth', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const accountId = req.params.id;

  const account = db.getAccountById(user.id, accountId);
  if (!account) {
    return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' } });
  }

  // Update status to 'Needs Reauthentication'
  db.updateAccount(user.id, accountId, {
    status: 'Needs Reauthentication',
    errorMessage: 'Reauthentication required.',
  });

  db.updateSyncState(user.id, accountId, {
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

    db.saveOAuthState({
      state,
      userId: user.id,
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
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/gmail/callback`;

  db.saveOAuthState({
    state,
    userId: user.id,
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
});
