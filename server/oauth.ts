import crypto from 'crypto';
import express from 'express';
import { db } from './db';
import { AuthenticatedRequest, authMiddleware } from './auth';

export const oauthRouter = express.Router();

/**
 * Returns OAuth readiness status for providers
 */
oauthRouter.get('/config-status', (req, res) => {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const microsoftConfigured = Boolean(
    (process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID) &&
    (process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET)
  );
  const whatsappConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

  res.json({
    gmail: {
      configured: googleConfigured,
      mode: googleConfigured ? 'production_oauth' : 'demo_mode',
      requiredVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    },
    outlook: {
      configured: microsoftConfigured,
      mode: microsoftConfigured ? 'production_oauth' : 'demo_mode',
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

oauthRouter.post('/gmail/connect', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/accounts/gmail/callback`;

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      configured: false,
      mode: 'demo_mode',
      message: 'Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured.',
      requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      instruction: 'To enable real Gmail synchronization, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment settings. In the meantime, you can add a demo mailbox.',
    });
  }

  // Check account limit
  const currentAccounts = db.getAccounts(user.id);
  if (currentAccounts.length >= 10) {
    return res.status(400).json({
      error: { code: 'ACCOUNT_LIMIT_REACHED', message: 'Maximum limit of 10 connected email accounts reached.' },
    });
  }

  // 1. Generate secure random state
  const state = crypto.randomBytes(32).toString('hex');
  db.saveOAuthState({
    state,
    userId: user.id,
    provider: 'gmail',
    createdAt: Date.now(),
    redirectUri,
  });

  // 2. Build Google authorization URL with minimum read-only scope
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
  });
});

oauthRouter.get('/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth callback returned error:', error);
    return res.redirect(`/?oauth_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state parameter.' } });
  }

  // 5. Validate OAuth state
  const oauthRecord = db.consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'gmail') {
    return res.status(403).json({ error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state token.' } });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = oauthRecord.redirectUri;

  try {
    // 6. Exchange authorization code for tokens
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
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Fetch user profile from Gmail API
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return res.redirect(`/?oauth_error=profile_fetch_failed`);
    }

    const profileData = await profileRes.json();
    const emailAddress = profileData.emailAddress;

    // 8. Create or update account record (tokens stored securely in server DB, never exposed to frontend)
    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find((a) => a.emailAddress.toLowerCase() === emailAddress.toLowerCase());

    const accountId = existingAcc ? existingAcc.id : `acc-gmail-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'gmail' as const,
      emailAddress,
      displayName: emailAddress.split('@')[0],
      status: 'active' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: profileData.messagesTotal || 0,
      threatsDetected: 0,
      accessTokenEncrypted: accessToken,
      refreshTokenEncrypted: refreshToken,
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

    // 9. Redirect back to frontend with success notice
    res.redirect(`/?oauth_success=gmail&email=${encodeURIComponent(emailAddress)}`);
  } catch (err: any) {
    console.error('Fatal error during Gmail OAuth callback:', err);
    res.redirect(`/?oauth_error=internal_server_error`);
  }
});

// ============================================================================
// 2. OUTLOOK / MICROSOFT 365 OAUTH 2.0 FLOW
// ============================================================================

oauthRouter.post('/outlook/connect', authMiddleware, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${appUrl}/api/accounts/outlook/callback`;

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      configured: false,
      mode: 'demo_mode',
      message: 'Microsoft OAuth credentials (MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET) are not configured.',
      requiredEnvVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
      instruction: 'To enable real Outlook / Microsoft 365 synchronization, configure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in environment settings.',
    });
  }

  // Check account limit
  const currentAccounts = db.getAccounts(user.id);
  if (currentAccounts.length >= 10) {
    return res.status(400).json({
      error: { code: 'ACCOUNT_LIMIT_REACHED', message: 'Maximum limit of 10 connected email accounts reached.' },
    });
  }

  const state = crypto.randomBytes(32).toString('hex');
  db.saveOAuthState({
    state,
    userId: user.id,
    provider: 'outlook',
    createdAt: Date.now(),
    redirectUri,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'offline_access User.Read Mail.Read',
    state,
  });

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

  res.json({
    configured: true,
    authUrl,
    state,
  });
});

oauthRouter.get('/outlook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('Microsoft OAuth callback error:', error, error_description);
    return res.redirect(`/?oauth_error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: { code: 'INVALID_CALLBACK', message: 'Missing authorization code or state.' } });
  }

  const oauthRecord = db.consumeOAuthState(String(state));
  if (!oauthRecord || oauthRecord.provider !== 'outlook') {
    return res.status(403).json({ error: { code: 'INVALID_STATE', message: 'Invalid or expired OAuth state.' } });
  }

  const clientId = (process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID)!;
  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET)!;
  const redirectUri = oauthRecord.redirectUri;

  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'offline_access User.Read Mail.Read',
        code: String(code),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Microsoft token error:', errBody);
      return res.redirect(`/?oauth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Fetch user profile from Microsoft Graph
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return res.redirect(`/?oauth_error=profile_fetch_failed`);
    }

    const profile = await profileRes.json();
    const emailAddress = profile.mail || profile.userPrincipalName;

    const existingAccounts = db.getAccounts(oauthRecord.userId);
    const existingAcc = existingAccounts.find((a) => a.emailAddress.toLowerCase() === emailAddress.toLowerCase());

    const accountId = existingAcc ? existingAcc.id : `acc-outlook-${Date.now()}`;
    const accountRecord = {
      id: accountId,
      provider: 'outlook' as const,
      emailAddress,
      displayName: profile.displayName || emailAddress.split('@')[0],
      status: 'active' as const,
      lastSyncedAt: new Date().toISOString(),
      totalEmails: 0,
      threatsDetected: 0,
      accessTokenEncrypted: accessToken,
      refreshTokenEncrypted: refreshToken,
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
      description: `Connected Microsoft Outlook account: ${emailAddress}`,
    });

    res.redirect(`/?oauth_success=outlook&email=${encodeURIComponent(emailAddress)}`);
  } catch (err: any) {
    console.error('Fatal error during Microsoft callback:', err);
    res.redirect(`/?oauth_error=internal_server_error`);
  }
});
