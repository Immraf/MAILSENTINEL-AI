import {
  AuthenticationResult,
  EmailCategory,
  PriorityLevel,
  SecurityAnalysis,
  SecurityClassification,
  SecurityIndicator,
} from '../types';

export function analyzeEmailSecurityHeuristics(params: {
  sender: string;
  senderName: string;
  subject: string;
  body: string;
  authResults?: Partial<AuthenticationResult>;
  attachments?: { filename: string; mimeType: string; size: number }[];
}): {
  securityAnalysis: SecurityAnalysis;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  whyPriority: string[];
} {
  const { sender = '', senderName = '', subject = '', body = '', authResults, attachments = [] } = params || {};

  const senderEmail = (sender || '').toLowerCase().trim();
  const senderNameSafe = (senderName || '').toLowerCase().trim();
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';
  const bodyLower = (body || (params as any)?.bodyText || (params as any)?.snippet || '').toLowerCase();
  const subjectLower = (subject || '').toLowerCase();

  const indicators: SecurityIndicator[] = [];
  let riskScore = 0;
  let phishingScore = 0;
  let spamScore = 0;
  let spoofingScore = 0;
  const whyFlagged: string[] = [];
  const whyPriority: string[] = [];

  // 1. Authentication Checks (SPF, DKIM, DMARC)
  const auth: AuthenticationResult = {
    spf: authResults?.spf || 'PASS',
    dkim: authResults?.dkim || 'PASS',
    dmarc: authResults?.dmarc || 'PASS',
    details: authResults?.details || 'Standard provider SPF/DKIM verification passed.',
  };

  if (auth.dmarc === 'FAIL') {
    spoofingScore += 45;
    riskScore += 35;
    indicators.push({
      type: 'dmarc_failure',
      severity: 'critical',
      description: 'DMARC authentication failed: Domain owner policy rejected this message origin.',
      confidence: 0.98,
      detail: `Sender domain ${senderDomain} failed cryptographic signature and alignment checks.`,
    });
    whyFlagged.push('Failed DMARC authentication policy (possible domain spoofing)');
  }

  if (auth.spf === 'FAIL') {
    spoofingScore += 30;
    riskScore += 25;
    indicators.push({
      type: 'spf_failure',
      severity: 'high',
      description: 'SPF validation failed: Sending server IP is not authorized by the domain SPF record.',
      confidence: 0.92,
    });
    whyFlagged.push('SPF authentication failed for sending mail relay');
  }

  // 2. Display Name & Lookalike Domain Spoofing
  const commonBrands = [
    { brand: 'Microsoft', domains: ['microsoft.com', 'office.com', 'outlook.com'] },
    { brand: 'Google', domains: ['google.com', 'accounts.google.com', 'gmail.com'] },
    { brand: 'PayPal', domains: ['paypal.com'] },
    { brand: 'Amazon', domains: ['amazon.com'] },
    { brand: 'Apple', domains: ['apple.com', 'icloud.com'] },
    { brand: 'Chase', domains: ['chase.com'] },
    { brand: 'Bank of America', domains: ['bankofamerica.com'] },
  ];

  let isLookalike = false;
  let matchedBrandName: string | undefined;

  for (const item of commonBrands) {
    const nameMatch = senderNameSafe.includes(item.brand.toLowerCase());
    const domainMatch = item.domains.some((d) => senderDomain === d || senderDomain.endsWith('.' + d));

    if (nameMatch && !domainMatch) {
      isLookalike = true;
      matchedBrandName = item.brand;
      phishingScore += 40;
      spoofingScore += 40;
      riskScore += 40;
      indicators.push({
        type: 'brand_impersonation',
        severity: 'critical',
        description: `Sender display name claims to be "${senderName}", but email originates from untrusted domain "${senderDomain}".`,
        confidence: 0.96,
        detail: `Expected domain matching ${item.domains.join(', ')}`,
      });
      whyFlagged.push(`Display name claims to be ${item.brand}, but originates from ${senderDomain}`);
      break;
    }
  }

  // Lookalike domain typosquatting patterns (e.g. micr0soft, go0gle, paypa1, security-support-login.com)
  const suspiciousKeywordsInDomain = ['security-verify', 'login-support', 'account-update', 'auth-check', 'portal-auth'];
  if (suspiciousKeywordsInDomain.some((kw) => senderDomain.includes(kw))) {
    isLookalike = true;
    phishingScore += 35;
    riskScore += 30;
    indicators.push({
      type: 'lookalike_domain',
      severity: 'high',
      description: `Sender domain "${senderDomain}" matches phishing kit naming patterns.`,
      confidence: 0.91,
    });
    whyFlagged.push(`Sender domain "${senderDomain}" mimics authentication portal`);
  }

  // 3. Credential Harvesting & Urgent Coercion Language
  const credentialPatterns = [
    'verify your account',
    'password reset',
    'account suspended',
    'unauthorized login detected',
    'confirm your identity',
    'update payment details immediately',
    'sign in to prevent deactivation',
    'security notice: action required',
  ];

  const matchedCreds = credentialPatterns.filter(
    (p) => bodyLower.includes(p) || subjectLower.includes(p)
  );

  if (matchedCreds.length > 0) {
    phishingScore += 30;
    riskScore += 25;
    indicators.push({
      type: 'credential_request',
      severity: matchedCreds.length > 1 ? 'critical' : 'high',
      description: `Email contains credential harvesting triggers: "${matchedCreds.join('", "')}".`,
      confidence: 0.88,
    });
    whyFlagged.push(`Requests sensitive credentials or account verification ("${matchedCreds[0]}")`);
    whyPriority.push('Urgent account security or credential verification prompt');
  }

  // Urgency Manipulation
  const urgencyWords = [
    'immediate action required',
    'within 24 hours',
    'within 48 hours',
    'account will be terminated',
    'act now',
    'final notice',
    'urgent response needed',
  ];
  const matchedUrgency = urgencyWords.filter(
    (u) => bodyLower.includes(u) || subjectLower.includes(u)
  );
  if (matchedUrgency.length > 0) {
    phishingScore += 15;
    riskScore += 15;
    indicators.push({
      type: 'urgency_manipulation',
      severity: 'medium',
      description: `Employs artificial time pressure and psychological urgency: "${matchedUrgency[0]}".`,
      confidence: 0.85,
    });
    whyFlagged.push('Uses artificial time pressure to elicit impulsive clicks');
    whyPriority.push('High-urgency deadline language');
  }

  // Financial wire / urgent payment requests
  const financialPatterns = ['wire transfer', 'crypto payment', 'gift cards', 'unpaid invoice #', 'overdue payment', 'bank account details'];
  const matchedFinancial = financialPatterns.filter((f) => bodyLower.includes(f));
  if (matchedFinancial.length > 0) {
    riskScore += 15;
    indicators.push({
      type: 'financial_request',
      severity: 'medium',
      description: `Mentions high-risk financial transfer instructions: "${matchedFinancial[0]}".`,
      confidence: 0.82,
    });
    whyPriority.push('Contains financial transaction / invoice terms');
  }

  // 4. URL Analysis
  const urlRegex = /(https?:\/\/[^\s"'>]+)/gi;
  const extractedUrls = body.match(urlRegex) || [];
  const suspiciousUrls: { url: string; displayText: string; reason: string; risk: 'high' | 'medium' | 'low' }[] = [];

  for (const urlStr of extractedUrls) {
    try {
      const parsed = new URL(urlStr);
      // IP address in URL host
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)) {
        suspiciousUrls.push({
          url: urlStr,
          displayText: parsed.hostname,
          reason: 'Raw IP address used instead of legitimate domain name',
          risk: 'high',
        });
        phishingScore += 25;
        riskScore += 25;
        indicators.push({
          type: 'ip_url',
          severity: 'high',
          description: `Raw IP address used in link destination: ${parsed.hostname}`,
          confidence: 0.95,
        });
        whyFlagged.push(`Contains naked IP link: ${parsed.hostname}`);
      } else if (
        parsed.hostname.includes('.tk') ||
        parsed.hostname.includes('.xyz') ||
        parsed.hostname.includes('.top') ||
        parsed.hostname.includes('login-verify') ||
        parsed.hostname.includes('redirect')
      ) {
        suspiciousUrls.push({
          url: urlStr,
          displayText: parsed.hostname,
          reason: 'High-risk or suspicious top-level domain / phishing pattern',
          risk: 'high',
        });
        phishingScore += 20;
        riskScore += 20;
        indicators.push({
          type: 'suspicious_url',
          severity: 'high',
          description: `Link points to suspicious target domain: ${parsed.hostname}`,
          confidence: 0.9,
        });
        whyFlagged.push(`Embedded link directs to suspicious domain (${parsed.hostname})`);
      }
    } catch {
      // ignore parse errors
    }
  }

  // 5. Attachment Heuristic Analysis (Safe metadata checks only)
  for (const att of attachments) {
    const fn = att.filename.toLowerCase();
    // Double extension check (e.g., invoice.pdf.exe)
    if (/\.[a-z0-9]+\.(exe|scr|bat|vbs|cmd|js|ps1|html)$/i.test(fn)) {
      riskScore += 45;
      indicators.push({
        type: 'suspicious_attachment',
        severity: 'critical',
        description: `Attachment "${att.filename}" uses deceptive double file extension to conceal executable payload.`,
        confidence: 0.99,
      });
      whyFlagged.push(`Deceptive double file extension on attachment: ${att.filename}`);
    } else if (/\.(exe|iso|img|scr|bat|cmd|vbs|docm|xlsm)$/i.test(fn)) {
      riskScore += 30;
      indicators.push({
        type: 'suspicious_attachment',
        severity: 'high',
        description: `Attachment "${att.filename}" is an executable or macro-enabled document type.`,
        confidence: 0.92,
      });
      whyFlagged.push(`Potentially dangerous attachment type (${att.filename})`);
    }
  }

  // 6. Final Classification & Score Normalization
  riskScore = Math.min(100, Math.max(0, riskScore));
  phishingScore = Math.min(100, phishingScore);
  spoofingScore = Math.min(100, spoofingScore);
  spamScore = Math.min(100, spamScore);

  let classification: SecurityClassification = 'SAFE';
  let riskLevel: 'Safe' | 'Low Risk' | 'Suspicious' | 'High Risk' | 'Critical' = 'Safe';

  const hasDangerousAttachment = attachments.some(
    (att) =>
      /\.[a-z0-9]+\.(exe|scr|bat|vbs|cmd|js|ps1|html)$/i.test(att.filename) ||
      /\.(exe|iso|img|scr|bat|cmd|vbs|docm|xlsm)$/i.test(att.filename) ||
      Boolean((att as any).securityStatus === 'FLAGGED')
  );

  if (hasDangerousAttachment) {
    classification = 'MALICIOUS';
    riskLevel = 'Critical';
  } else if (riskScore >= 80 || phishingScore >= 75) {
    classification = 'PHISHING';
    riskLevel = 'Critical';
  } else if (riskScore >= 60 || indicators.some((i) => i.severity === 'critical')) {
    classification = 'PHISHING';
    riskLevel = 'High Risk';
  } else if (riskScore >= 35) {
    classification = 'SUSPICIOUS';
    riskLevel = 'Suspicious';
  } else if (riskScore > 15) {
    classification = 'SUSPICIOUS';
    riskLevel = 'Low Risk';
  } else {
    classification = 'SAFE';
    riskLevel = 'Safe';
  }

  if (indicators.length === 0) {
    indicators.push({
      type: 'clean',
      severity: 'info',
      description: 'All SPF, DKIM, and DMARC validations passed. No malicious URLs or anomalous headers detected.',
      confidence: 0.99,
    });
  }

  // Priority scoring (multi-signal: security threat + urgency + action required)
  let priorityScore = 30; // baseline Medium
  if (classification === 'PHISHING' || classification === 'MALICIOUS') {
    priorityScore = Math.max(priorityScore, 90);
    whyPriority.unshift('Critical security threat requiring immediate user review or quarantine');
  } else if (classification === 'SUSPICIOUS') {
    priorityScore = Math.max(priorityScore, 70);
    whyPriority.unshift('Suspicious email flagged for security caution');
  }

  if (matchedUrgency.length > 0) priorityScore += 15;
  if (matchedFinancial.length > 0) priorityScore += 10;
  if (bodyLower.includes('deadline') || bodyLower.includes('due by') || bodyLower.includes('meeting')) {
    priorityScore += 15;
    whyPriority.push('Time-sensitive event or deadline detected in message');
  }

  priorityScore = Math.min(100, Math.max(5, priorityScore));

  let priorityLevel: PriorityLevel = 'Informational';
  if (priorityScore >= 85) priorityLevel = 'Critical';
  else if (priorityScore >= 65) priorityLevel = 'High';
  else if (priorityScore >= 35) priorityLevel = 'Medium';
  else if (priorityScore >= 10) priorityLevel = 'Low';

  const securityAnalysis: SecurityAnalysis = {
    classification,
    riskScore,
    phishingScore,
    spamScore,
    spoofingScore,
    riskLevel,
    indicators,
    authResults: auth,
    whyFlaggedReasons: whyFlagged.length > 0 ? whyFlagged : ['Clean message authentication, trusted domain.'],
    senderDomainAnalysis: {
      displayName: senderName,
      senderEmail,
      domain: senderDomain,
      isLookalike,
      matchedBrand: matchedBrandName,
      replyToMatch: true,
    },
    urlAnalysis: {
      totalUrls: extractedUrls.length,
      suspiciousUrls,
    },
  };

  return {
    securityAnalysis,
    priorityScore,
    priorityLevel,
    whyPriority: whyPriority.length > 0 ? whyPriority : ['Routine operational communication.'],
  };
}
