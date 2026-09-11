import {
  AuditLog,
  Email,
  EmailAccount,
  NotificationSettings,
  QuarantineItem,
  SecurityAlert,
  SecurityRule,
  SecuritySettings,
  WhitelistBlacklistEntry,
} from './types';

export const initialAccounts: EmailAccount[] = [
  {
    id: 'acc-1',
    provider: 'gmail',
    emailAddress: 'personal.alex@gmail.com',
    displayName: 'Alex Carter (Personal)',
    status: 'active',
    lastSyncedAt: '2026-09-11T07:45:00Z',
    totalEmails: 124,
    threatsDetected: 3,
    isPrimary: true,
  },
  {
    id: 'acc-2',
    provider: 'gmail',
    emailAddress: 'alex.carter@university.edu',
    displayName: 'Alex Carter (Academic)',
    status: 'active',
    lastSyncedAt: '2026-09-11T07:42:00Z',
    totalEmails: 89,
    threatsDetected: 1,
  },
  {
    id: 'acc-3',
    provider: 'outlook',
    emailAddress: 'alex.carter@apextech.io',
    displayName: 'Alex Carter (Apex Work)',
    status: 'active',
    lastSyncedAt: '2026-09-11T07:48:00Z',
    totalEmails: 312,
    threatsDetected: 5,
  },
  {
    id: 'acc-4',
    provider: 'outlook',
    emailAddress: 'corp.advisory@synergycorp.com',
    displayName: 'Alex Advisory (Consulting)',
    status: 'active',
    lastSyncedAt: '2026-09-11T07:30:00Z',
    totalEmails: 67,
    threatsDetected: 0,
  },
];

export const initialEmails: Email[] = [
  {
    id: 'email-1',
    accountId: 'acc-3',
    accountEmail: 'alex.carter@apextech.io',
    provider: 'outlook',
    threadId: 'th-101',
    sender: 'security-notice@m1crosoft-auth-verify.xyz',
    senderName: 'Microsoft Security Team',
    senderDomain: 'm1crosoft-auth-verify.xyz',
    recipients: ['alex.carter@apextech.io'],
    subject: 'URGENT: Microsoft 365 Password Expiration & Suspended Account Verification Required',
    bodySnippet:
      'Your Microsoft 365 enterprise account access will be terminated within 24 hours due to unverified multi-factor authentication credentials. Click here to confirm identity immediately...',
    bodyText: `Dear Alex Carter,

We detected anomalous login attempts from an unrecognized IP address (185.220.101.5) targeting your ApexTech enterprise Microsoft 365 suite.

To maintain continuous access to your OneDrive, Outlook, and Teams, you must verify your account credentials within 24 hours. Failure to confirm will result in immediate mailbox suspension according to corporate IT compliance.

Please click the secure link below to authenticate your single sign-on credentials:
https://m1crosoft-auth-verify.xyz/portal/apextech-login?session=938f4201a

IP Address: 185.220.101.5
Browser: Mozilla/5.0 (Windows NT 10.0; Win64; x64)

Microsoft Cloud Identity Protection Services`,
    receivedAt: '2026-09-11T07:15:00Z',
    isRead: false,
    isArchived: false,
    isQuarantined: true,
    hasAttachment: false,
    aiAnalysis: {
      category: 'security',
      priority: 'Critical',
      priorityScore: 98,
      summary:
        'Deceptive credential phishing attempt masquerading as a Microsoft 365 security alert claiming impending account suspension.',
      sentiment: 'urgent',
      actionRequired: true,
      recommendedAction: 'Do not click the embedded link. Keep quarantined and block the sending domain.',
      deadline: '2026-09-12T07:15:00Z (Artificial 24h deadline)',
      confidence: 0.99,
      whyPriorityReasons: [
        'Critical security threat: Credential harvesting link detected',
        'Impersonates Microsoft 365 security notifications',
        'Employs urgent psychological coercion (24h suspension threat)',
        'DMARC authentication failed with domain mismatch',
      ],
      extractedEntities: [
        { type: 'organization', value: 'Microsoft 365 / ApexTech IT' },
        { type: 'deadline', value: 'Within 24 hours (Coercion)', context: 'Account suspension threat' },
        { type: 'url', value: 'https://m1crosoft-auth-verify.xyz/portal/apextech-login' },
        { type: 'task', value: 'Verify credentials (MALICIOUS CALL TO ACTION)' },
      ],
    },
    securityAnalysis: {
      classification: 'PHISHING',
      riskScore: 96,
      phishingScore: 98,
      spamScore: 35,
      spoofingScore: 94,
      riskLevel: 'Critical',
      indicators: [
        {
          type: 'brand_impersonation',
          severity: 'critical',
          description:
            'Display name claims to be "Microsoft Security Team", but email originates from unauthorized domain "m1crosoft-auth-verify.xyz".',
          confidence: 0.98,
          detail: 'Legitimate Microsoft communications originate from microsoft.com or office.com.',
        },
        {
          type: 'dmarc_failure',
          severity: 'critical',
          description: 'DMARC validation failed: Domain signature missing and SPF alignment rejected.',
          confidence: 0.99,
        },
        {
          type: 'credential_request',
          severity: 'critical',
          description: 'Demands urgent sign-in to prevent account deactivation.',
          confidence: 0.95,
        },
        {
          type: 'suspicious_url',
          severity: 'high',
          description: 'Embedded link points to known typosquatting phishing domain (.xyz TLD).',
          confidence: 0.94,
        },
        {
          type: 'urgency_manipulation',
          severity: 'medium',
          description: 'Uses artificial 24-hour urgency countdown.',
          confidence: 0.89,
        },
      ],
      authResults: {
        spf: 'FAIL',
        dkim: 'FAIL',
        dmarc: 'FAIL',
        details: 'The message failed DMARC authentication, indicating sender-domain spoofing.',
      },
      whyFlaggedReasons: [
        'Failed DMARC & SPF authentication checks',
        'Display name mismatch: Claims to be Microsoft from an unregistered .xyz domain',
        'Credential harvesting language and deceptive login destination',
        'Artificial 24-hour urgency manipulation',
      ],
      senderDomainAnalysis: {
        displayName: 'Microsoft Security Team',
        senderEmail: 'security-notice@m1crosoft-auth-verify.xyz',
        domain: 'm1crosoft-auth-verify.xyz',
        isLookalike: true,
        matchedBrand: 'Microsoft',
        replyToMatch: false,
        replyTo: 'collector99@proton.me',
      },
      urlAnalysis: {
        totalUrls: 1,
        suspiciousUrls: [
          {
            url: 'https://m1crosoft-auth-verify.xyz/portal/apextech-login?session=938f4201a',
            displayText: 'm1crosoft-auth-verify.xyz',
            reason: 'Phishing login credential portal imitating Microsoft Single Sign-On',
            risk: 'high',
          },
        ],
      },
    },
  },
  {
    id: 'email-2',
    accountId: 'acc-2',
    accountEmail: 'alex.carter@university.edu',
    provider: 'gmail',
    threadId: 'th-102',
    sender: 'prof.henderson@university.edu',
    senderName: 'Prof. Marcus Henderson',
    senderDomain: 'university.edu',
    recipients: ['alex.carter@university.edu'],
    cc: ['lab-assistants@university.edu'],
    subject: 'Final-Year Capstone Project Submission Deadline & Review Schedule',
    bodySnippet:
      'Dear Alex, please remember that your final-year research thesis draft and dataset archive must be submitted to the academic portal before Friday, Sept 18 at 17:00...',
    bodyText: `Dear Alex,

Hope your semester is progressing smoothly.

This is a reminder regarding the deliverables for your Final-Year Capstone Project (CS-499: Distributed Cloud Resilience):

1. Research Thesis Draft: Must be uploaded to the university portal before Friday, September 18, 2026, at 17:00 UTC.
2. Dataset & GitHub repository link: Include all benchmarking scripts and evaluation metrics.
3. Oral Committee Defense: Scheduled for Tuesday, September 22, 2026, from 14:00 to 15:30 in Turing Hall Room 402.

Please confirm that your experimental evaluations are complete and let me know if you require any specialized GPU compute quota.

Best regards,
Prof. Marcus Henderson
Department of Computer Science
University of Technology`,
    receivedAt: '2026-09-11T06:30:00Z',
    isRead: false,
    isArchived: false,
    isQuarantined: false,
    hasAttachment: false,
    aiAnalysis: {
      category: 'academic',
      priority: 'High',
      priorityScore: 82,
      summary:
        'Reminder from supervisor Prof. Henderson regarding final-year thesis submission due Sept 18 at 17:00 and committee defense on Sept 22.',
      sentiment: 'neutral',
      actionRequired: true,
      recommendedAction: 'Upload thesis draft before Sept 18, prepare oral presentation, and reply confirming experimental evaluations.',
      deadline: '2026-09-18T17:00:00Z',
      confidence: 0.98,
      whyPriorityReasons: [
        'Official academic supervisor with impending graduation milestone',
        'Contains strict submission deadline (Sept 18 at 17:00)',
        'Oral defense scheduling details requiring student preparation',
      ],
      extractedEntities: [
        { type: 'person', value: 'Prof. Marcus Henderson', context: 'Academic advisor' },
        { type: 'organization', value: 'Department of Computer Science' },
        { type: 'deadline', value: '2026-09-18T17:00:00Z', context: 'Final-year research thesis draft submission' },
        { type: 'meeting', value: '2026-09-22T14:00:00Z', context: 'Oral Committee Defense in Turing Hall 402' },
        { type: 'task', value: 'Submit research thesis draft and dataset archive to university portal' },
        { type: 'task', value: 'Confirm with Prof. Henderson if GPU compute quota is needed' },
      ],
    },
    securityAnalysis: {
      classification: 'SAFE',
      riskScore: 4,
      phishingScore: 0,
      spamScore: 2,
      spoofingScore: 0,
      riskLevel: 'Safe',
      indicators: [
        {
          type: 'clean',
          severity: 'info',
          description: 'Institutional domain cryptographic verification passed. SPF, DKIM, and DMARC aligned.',
          confidence: 0.99,
        },
      ],
      authResults: {
        spf: 'PASS',
        dkim: 'PASS',
        dmarc: 'PASS',
        details: 'Institutional cryptographic key validated by university.edu DNS.',
      },
      whyFlaggedReasons: ['Clean institutional message. Authentication valid.'],
      senderDomainAnalysis: {
        displayName: 'Prof. Marcus Henderson',
        senderEmail: 'prof.henderson@university.edu',
        domain: 'university.edu',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 0,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-3',
    accountId: 'acc-1',
    accountEmail: 'personal.alex@gmail.com',
    provider: 'gmail',
    threadId: 'th-103',
    sender: 'notifications@chase.com',
    senderName: 'Chase Bank Alerts',
    senderDomain: 'chase.com',
    recipients: ['personal.alex@gmail.com'],
    subject: 'Your Monthly Checking Account Statement is Ready (Account ending in 4109)',
    bodySnippet:
      'Your Chase Premier Checking statement for the period ending September 10, 2026, is now available to download. Total closing balance: $14,820.40...',
    bodyText: `Dear Alex Carter,

Your electronic statement for Chase Premier Checking (...4109) is now available in your Chase Mobile app or Chase Online.

Summary for August 11, 2026 - September 10, 2026:
- Starting Balance: $12,450.00
- Total Deposits & Credits: $6,500.00
- Total Withdrawals & Debits: $4,129.60
- Ending Balance: $14,820.40

To view your full statement and review any transactions, log into your Chase Mobile app or visit chase.com.

Security Tip: Chase will never call, text, or email you asking for your one-time passcodes or full password.

JPMorgan Chase Bank, N.A. Member FDIC.`,
    receivedAt: '2026-09-11T05:10:00Z',
    isRead: true,
    isArchived: false,
    isQuarantined: false,
    hasAttachment: true,
    attachments: [
      {
        id: 'att-1',
        filename: 'statement_sep_2026_4109.pdf',
        mimeType: 'application/pdf',
        size: 142800,
        securityStatus: 'SAFE',
      },
    ],
    aiAnalysis: {
      category: 'financial',
      priority: 'Medium',
      priorityScore: 55,
      summary:
        'Chase Premier Checking monthly statement ending Sept 10. Ending balance $14,820.40.',
      sentiment: 'neutral',
      actionRequired: false,
      recommendedAction: 'Archive after reviewing transaction summary.',
      deadline: null,
      confidence: 0.99,
      whyPriorityReasons: ['Routine financial statement notification from authorized bank.'],
      extractedEntities: [
        { type: 'organization', value: 'JPMorgan Chase Bank' },
        { type: 'amount', value: '$14,820.40', context: 'Ending checking balance' },
        { type: 'amount', value: '$6,500.00', context: 'Total deposits' },
        { type: 'invoice_number', value: 'Account ...4109' },
      ],
    },
    securityAnalysis: {
      classification: 'SAFE',
      riskScore: 2,
      phishingScore: 0,
      spamScore: 1,
      spoofingScore: 0,
      riskLevel: 'Safe',
      indicators: [
        {
          type: 'clean',
          severity: 'info',
          description: 'Official banking domain cryptographically signed with strict DMARC enforcement.',
          confidence: 0.99,
        },
      ],
      authResults: {
        spf: 'PASS',
        dkim: 'PASS',
        dmarc: 'PASS',
      },
      whyFlaggedReasons: ['Clean banking statement.'],
      senderDomainAnalysis: {
        displayName: 'Chase Bank Alerts',
        senderEmail: 'notifications@chase.com',
        domain: 'chase.com',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 1,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-4',
    accountId: 'acc-3',
    accountEmail: 'alex.carter@apextech.io',
    provider: 'outlook',
    threadId: 'th-104',
    sender: 'david.sterling.ceo@consulting-direct-wire.top',
    senderName: 'David Sterling (ApexTech CEO)',
    senderDomain: 'consulting-direct-wire.top',
    recipients: ['alex.carter@apextech.io'],
    subject: 'CONFIDENTIAL: Urgent Wire Transfer for International Acquisition Closing Today',
    bodySnippet:
      'Alex, are you at your desk right now? I am currently in closed-door M&A negotiations in Zurich and need you to execute an expedited vendor wire of $42,500 immediately...',
    bodyText: `Alex,

Are you at your desk right now?

I am currently in an all-day closed-door executive session in Zurich finalizing our regional partner acquisition. Our primary legal counsel requires an immediate escrow deposit of $42,500 to lock in the contractual valuation before the close of European banking hours (16:00 CET today).

Because I am in the negotiation room, I cannot take phone calls. 

Wire Details:
Beneficiary: Helvetia Escrow Advisory S.A.
IBAN: CH93 0076 2011 6238 5291 0
Amount: $42,500.00 USD
Reference: APEX-M&A-SERIES-C

Please process this through the corporate banking portal immediately and send me the wire confirmation slip via reply to this email. Do not discuss this with the rest of the finance team until the official press release on Monday.

David Sterling
Chief Executive Officer | ApexTech Inc.`,
    receivedAt: '2026-09-11T04:20:00Z',
    isRead: false,
    isArchived: false,
    isQuarantined: true,
    hasAttachment: false,
    aiAnalysis: {
      category: 'financial',
      priority: 'Critical',
      priorityScore: 99,
      summary:
        'Classic Business Email Compromise (BEC / CEO Fraud): Impersonates ApexTech CEO requesting an urgent $42,500 wire transfer while claiming to be unreachable.',
      sentiment: 'urgent',
      actionRequired: true,
      recommendedAction: 'DO NOT EXECUTE WIRE. Report to Information Security and notify CEO via verified internal channel.',
      deadline: '2026-09-11T14:00:00Z (European banking close)',
      confidence: 0.99,
      whyPriorityReasons: [
        'Critical security threat: High-value Business Email Compromise ($42,500 wire fraud)',
        'Display-name spoofing targeting executive leadership (CEO)',
        'Claims executive is unreachable by phone to bypass verification protocol',
        'Demands secrecy ("Do not discuss with finance team")',
      ],
      extractedEntities: [
        { type: 'person', value: 'David Sterling (Spoofed CEO)', context: 'Impersonated sender' },
        { type: 'amount', value: '$42,500.00 USD', context: 'Fraudulent wire demand' },
        { type: 'organization', value: 'Helvetia Escrow Advisory S.A.' },
        { type: 'invoice_number', value: 'APEX-M&A-SERIES-C' },
        { type: 'task', value: 'Execute expedited wire transfer (CRITICAL FRAUD TRAP)' },
      ],
    },
    securityAnalysis: {
      classification: 'PHISHING',
      riskScore: 98,
      phishingScore: 99,
      spamScore: 10,
      spoofingScore: 99,
      riskLevel: 'Critical',
      indicators: [
        {
          type: 'brand_impersonation',
          severity: 'critical',
          description:
            'Executive Impersonation (CEO Fraud): Display name matches company CEO "David Sterling", but originating domain is untrusted "consulting-direct-wire.top".',
          confidence: 0.99,
        },
        {
          type: 'dmarc_failure',
          severity: 'critical',
          description: 'Sending domain is not authorized for apextech.io.',
          confidence: 0.98,
        },
        {
          type: 'financial_request',
          severity: 'critical',
          description: 'Requests irreversible $42,500 bank wire transfer to overseas offshore account.',
          confidence: 0.99,
        },
        {
          type: 'urgency_manipulation',
          severity: 'high',
          description: 'Demands immediate execution before bank closure and explicitly prohibits verbal verification.',
          confidence: 0.96,
        },
      ],
      authResults: {
        spf: 'PASS', // Pass on rogue domain, but DMARC alignment fails
        dkim: 'NONE',
        dmarc: 'FAIL',
        details: 'Domain consulting-direct-wire.top does not align with company identity apextech.io.',
      },
      whyFlaggedReasons: [
        'Executive Impersonation / CEO Fraud',
        'Demands emergency $42,500 wire transfer without out-of-band verification',
        'Sender domain registered under high-risk .top TLD',
        'Coercive isolation tactic ("Do not discuss with the rest of the finance team")',
      ],
      senderDomainAnalysis: {
        displayName: 'David Sterling (ApexTech CEO)',
        senderEmail: 'david.sterling.ceo@consulting-direct-wire.top',
        domain: 'consulting-direct-wire.top',
        isLookalike: true,
        matchedBrand: 'ApexTech',
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 0,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-5',
    accountId: 'acc-3',
    accountEmail: 'alex.carter@apextech.io',
    provider: 'outlook',
    threadId: 'th-105',
    sender: 'sarah.lin@apextech.io',
    senderName: 'Sarah Lin',
    senderDomain: 'apextech.io',
    recipients: ['alex.carter@apextech.io', 'core-engineering@apextech.io'],
    subject: 'Q3 Cloud Infrastructure Architecture Review — Meeting Agenda & Action Items',
    bodySnippet:
      'Hi team, attached is the revised agenda for our architectural review this Thursday at 11:00 AM PST. Please complete your Kubernetes cluster cost audit before the sync...',
    bodyText: `Hi Alex and Core Engineering,

We will be conducting our quarterly Cloud Infrastructure Architecture Review this Thursday, September 17, 2026, from 11:00 AM to 12:30 PM PST.

Agenda:
1. Multi-region failover and SLA metrics (Alex Carter - 25 mins)
2. Database migration to Cloud Spanner (David Chen - 20 mins)
3. Cost optimization and reserved instance commitment (Sarah Lin - 15 mins)

Action Items Prior to Meeting:
- Alex: Please finalize the benchmark charts comparing PostgreSQL read-replicas with Spanner.
- Team: Review the attached slide deck and leave comments on Section 3.

Meeting Link: https://meet.apextech.internal/cloud-q3-sync

Thanks,
Sarah Lin | VP of Engineering`,
    receivedAt: '2026-09-11T03:45:00Z',
    isRead: true,
    isArchived: false,
    isQuarantined: false,
    hasAttachment: true,
    attachments: [
      {
        id: 'att-2',
        filename: 'Q3_Architecture_Review_Deck_v2.pdf',
        mimeType: 'application/pdf',
        size: 3840000,
        securityStatus: 'SAFE',
      },
    ],
    aiAnalysis: {
      category: 'business',
      priority: 'High',
      priorityScore: 78,
      summary:
        'Sarah Lin scheduled Q3 Cloud Architecture Review for Thursday, Sept 17 at 11:00 AM PST. Alex must finalize database benchmark charts before the sync.',
      sentiment: 'neutral',
      actionRequired: true,
      recommendedAction: 'Finalize Spanner benchmark charts and review meeting slide deck before Sept 17.',
      deadline: '2026-09-17T11:00:00Z',
      confidence: 0.97,
      whyPriorityReasons: [
        'Direct internal management communication from VP of Engineering',
        'Assigned specific speaking segment (25 mins) and required deliverable',
        'Upcoming scheduled meeting with actionable deadline',
      ],
      extractedEntities: [
        { type: 'person', value: 'Sarah Lin', context: 'VP of Engineering' },
        { type: 'person', value: 'David Chen' },
        { type: 'meeting', value: '2026-09-17T11:00:00Z', context: 'Q3 Architecture Review (90 mins)' },
        { type: 'task', value: 'Finalize benchmark charts comparing PostgreSQL read-replicas with Spanner' },
        { type: 'task', value: 'Review slide deck Section 3' },
        { type: 'url', value: 'https://meet.apextech.internal/cloud-q3-sync' },
      ],
    },
    securityAnalysis: {
      classification: 'SAFE',
      riskScore: 3,
      phishingScore: 0,
      spamScore: 1,
      spoofingScore: 0,
      riskLevel: 'Safe',
      indicators: [
        {
          type: 'clean',
          severity: 'info',
          description: 'Internal corporate domain authenticated via Microsoft 365 tenant DKIM key.',
          confidence: 0.99,
        },
      ],
      authResults: {
        spf: 'PASS',
        dkim: 'PASS',
        dmarc: 'PASS',
      },
      whyFlaggedReasons: ['Legitimate internal team correspondence.'],
      senderDomainAnalysis: {
        displayName: 'Sarah Lin',
        senderEmail: 'sarah.lin@apextech.io',
        domain: 'apextech.io',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 1,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-6',
    accountId: 'acc-1',
    accountEmail: 'personal.alex@gmail.com',
    provider: 'gmail',
    threadId: 'th-106',
    sender: 'recruiting@stripe-talent.com',
    senderName: 'Stripe Engineering Talent',
    senderDomain: 'stripe-talent.com',
    recipients: ['personal.alex@gmail.com'],
    subject: 'Staff Infrastructure Security Engineer Role at Stripe — Interview Availability',
    bodySnippet:
      'Hi Alex, our engineering leadership was very impressed with your open-source contributions to cloud security and distributed auth. We would love to chat regarding a Staff Security role...',
    bodyText: `Hi Alex,

I lead technical talent discovery for the Core Security & Infrastructure organization here at Stripe.

Our team has been following your public work on resilient email security pipelines and zero-trust authentication. We think your expertise aligns remarkably with our Staff Infrastructure Security Engineer opening in San Francisco (or remote within US/Europe).

Salary range: $240,000 - $310,000 base + equity + comprehensive benefits.

Would you be open to a 30-minute introductory conversation next week? Please let me know your availability for Tuesday, September 15, or Thursday, September 17.

Looking forward to connecting!

Warmly,
Elena Rostova
Principal Technical Recruiter | Stripe`,
    receivedAt: '2026-09-10T21:15:00Z',
    isRead: true,
    isArchived: false,
    isQuarantined: false,
    hasAttachment: false,
    aiAnalysis: {
      category: 'career',
      priority: 'High',
      priorityScore: 75,
      summary:
        'Recruiter Elena Rostova from Stripe reached out regarding a Staff Infrastructure Security Engineer role ($240k-$310k base), requesting 30-min intro chat availability for next week.',
      sentiment: 'positive',
      actionRequired: true,
      recommendedAction: 'Reply with preferred time slot (Sept 15 or 17) if interested in exploring the position.',
      deadline: '2026-09-14T23:59:00Z',
      confidence: 0.95,
      whyPriorityReasons: [
        'High-value career opportunity with competitive compensation ($240k-$310k)',
        'Direct recruiter inquiry awaiting interview availability response',
      ],
      extractedEntities: [
        { type: 'person', value: 'Elena Rostova', context: 'Principal Technical Recruiter' },
        { type: 'organization', value: 'Stripe' },
        { type: 'amount', value: '$240,000 - $310,000 base', context: 'Offered compensation range' },
        { type: 'task', value: 'Provide 30-min interview availability for Sept 15 or Sept 17' },
      ],
    },
    securityAnalysis: {
      classification: 'SAFE',
      riskScore: 8,
      phishingScore: 5,
      spamScore: 12,
      spoofingScore: 0,
      riskLevel: 'Safe',
      indicators: [
        {
          type: 'clean',
          severity: 'info',
          description: 'Valid SPF and DKIM signatures. No malicious payloads or credential harvesting.',
          confidence: 0.95,
        },
      ],
      authResults: {
        spf: 'PASS',
        dkim: 'PASS',
        dmarc: 'PASS',
      },
      whyFlaggedReasons: ['Legitimate career outreach.'],
      senderDomainAnalysis: {
        displayName: 'Stripe Engineering Talent',
        senderEmail: 'recruiting@stripe-talent.com',
        domain: 'stripe-talent.com',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 0,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-7',
    accountId: 'acc-4',
    accountEmail: 'corp.advisory@synergycorp.com',
    provider: 'outlook',
    threadId: 'th-107',
    sender: 'billing@overseas-freight-invoicing.online',
    senderName: 'Global Freight Logistics Billing',
    senderDomain: 'overseas-freight-invoicing.online',
    recipients: ['corp.advisory@synergycorp.com'],
    subject: 'Overdue Shipping Invoice #INV-993821 with Attached Payment Receipt',
    bodySnippet:
      'Please find attached the outstanding bill of lading and customs release invoice. Kindly review the attached invoice.pdf.exe to clear the delivery manifest...',
    bodyText: `Dear Valued Customer,

Your commercial shipment (#SHP-409188) is currently held at international customs depot awaiting final invoice clearance of $1,840.00.

Failure to remit customs clearance fees within 48 hours will trigger demurrage penalties of $250.00/day.

Please review the attached invoice documentation immediately to confirm payment routing:
Attachment: invoice_remittance_993821.pdf.exe

Logistics Dispatch Department`,
    receivedAt: '2026-09-10T18:40:00Z',
    isRead: false,
    isArchived: false,
    isQuarantined: true,
    hasAttachment: true,
    attachments: [
      {
        id: 'att-3',
        filename: 'invoice_remittance_993821.pdf.exe',
        mimeType: 'application/x-msdownload',
        size: 789000,
        securityStatus: 'FLAGGED',
        flagReason: 'Double extension detected (.pdf.exe) concealing executable binary payload.',
      },
    ],
    aiAnalysis: {
      category: 'financial',
      priority: 'Critical',
      priorityScore: 97,
      summary:
        'Malicious freight invoice scam containing a weaponized double-extension attachment (invoice_remittance_993821.pdf.exe).',
      sentiment: 'urgent',
      actionRequired: true,
      recommendedAction: 'DO NOT DOWNLOAD OR OPEN ATTACHMENT. Keep email quarantined.',
      deadline: '2026-09-12T18:40:00Z (Artificial 48h demurrage threat)',
      confidence: 0.99,
      whyPriorityReasons: [
        'Critical security threat: Weaponized executable attachment detected (.pdf.exe)',
        'Fabricated shipping invoice and customs fee extortion',
        'High malware delivery risk',
      ],
      extractedEntities: [
        { type: 'amount', value: '$1,840.00', context: 'Fraudulent customs fee' },
        { type: 'invoice_number', value: '#INV-993821' },
        { type: 'tracking_number', value: '#SHP-409188' },
        { type: 'task', value: 'DO NOT OPEN MALICIOUS ATTACHMENT' },
      ],
    },
    securityAnalysis: {
      classification: 'MALICIOUS',
      riskScore: 97,
      phishingScore: 90,
      spamScore: 40,
      spoofingScore: 60,
      riskLevel: 'Critical',
      indicators: [
        {
          type: 'suspicious_attachment',
          severity: 'critical',
          description:
            'Dangerous double extension on attachment "invoice_remittance_993821.pdf.exe" disguising Windows executable as a PDF document.',
          confidence: 0.99,
        },
        {
          type: 'dmarc_failure',
          severity: 'high',
          description: 'Sender domain overseas-freight-invoicing.online failed DMARC authentication.',
          confidence: 0.92,
        },
        {
          type: 'financial_request',
          severity: 'medium',
          description: 'Fabricated customs penalty fee to elicit panic payment.',
          confidence: 0.88,
        },
      ],
      authResults: {
        spf: 'NEUTRAL',
        dkim: 'NONE',
        dmarc: 'FAIL',
      },
      whyFlaggedReasons: [
        'Attachment disguised with deceptive double extension (.pdf.exe)',
        'Failed DMARC authentication',
        'Suspicious newly observed domain (.online)',
      ],
      senderDomainAnalysis: {
        displayName: 'Global Freight Logistics Billing',
        senderEmail: 'billing@overseas-freight-invoicing.online',
        domain: 'overseas-freight-invoicing.online',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 0,
        suspiciousUrls: [],
      },
    },
  },
  {
    id: 'email-8',
    accountId: 'acc-1',
    accountEmail: 'personal.alex@gmail.com',
    provider: 'gmail',
    threadId: 'th-108',
    sender: 'news@tldr.tech',
    senderName: 'TLDR Tech Newsletter',
    senderDomain: 'tldr.tech',
    recipients: ['personal.alex@gmail.com'],
    subject: 'TLDR Tech: Next-Gen AI Models, Rust Kernel Updates & Cloudflare Outage Post-Mortem',
    bodySnippet:
      'Daily curated tech news for software engineers. Today: new multimodal architectures, Linux 6.12 memory management, and why DNS remains the root of all outages...',
    bodyText: `TLDR Tech Daily Digest — September 11, 2026

HEADLINES:
1. Google DeepMind announces Gemini 3 architecture with hybrid reasoning capabilities.
2. Cloudflare publishes in-depth post-mortem regarding BGP routing anomaly in European datacenters.
3. Linux Kernel 6.12 merges expanded Rust device driver abstractions.

SPONSOR:
Build enterprise security architectures faster with automated zero-trust policy engines.

QUICK LINKS:
- https://tldr.tech/stories/ai-advances-2026
- https://tldr.tech/stories/linux-rust-drivers

To unsubscribe or change preferences, visit your account dashboard.`,
    receivedAt: '2026-09-10T14:00:00Z',
    isRead: true,
    isArchived: false,
    isQuarantined: false,
    hasAttachment: false,
    aiAnalysis: {
      category: 'newsletter',
      priority: 'Low',
      priorityScore: 22,
      summary:
        'Daily engineering newsletter covering Gemini 3 model developments, Cloudflare outage post-mortem, and Rust in Linux kernel.',
      sentiment: 'neutral',
      actionRequired: false,
      recommendedAction: 'Read when convenient or auto-archive according to newsletter rules.',
      deadline: null,
      confidence: 0.99,
      whyPriorityReasons: ['Informational curated newsletter with no urgent call to action.'],
      extractedEntities: [
        { type: 'organization', value: 'TLDR Tech' },
        { type: 'organization', value: 'Google DeepMind' },
        { type: 'organization', value: 'Cloudflare' },
      ],
    },
    securityAnalysis: {
      classification: 'SAFE',
      riskScore: 2,
      phishingScore: 0,
      spamScore: 10,
      spoofingScore: 0,
      riskLevel: 'Safe',
      indicators: [
        {
          type: 'clean',
          severity: 'info',
          description: 'Legitimate newsletter sender with valid DKIM and SPF signatures.',
          confidence: 0.99,
        },
      ],
      authResults: {
        spf: 'PASS',
        dkim: 'PASS',
        dmarc: 'PASS',
      },
      whyFlaggedReasons: ['Verified mass newsletter sender.'],
      senderDomainAnalysis: {
        displayName: 'TLDR Tech Newsletter',
        senderEmail: 'news@tldr.tech',
        domain: 'tldr.tech',
        isLookalike: false,
        replyToMatch: true,
      },
      urlAnalysis: {
        totalUrls: 2,
        suspiciousUrls: [],
      },
    },
  },
];

export const initialQuarantine: QuarantineItem[] = [
  {
    id: 'quar-1',
    emailId: 'email-1',
    email: initialEmails[0],
    quarantinedAt: '2026-09-11T07:16:00Z',
    reason: 'Critical Phishing: Impersonates Microsoft 365 credentials portal with DMARC failure.',
    riskScore: 96,
    status: 'quarantined',
  },
  {
    id: 'quar-2',
    emailId: 'email-4',
    email: initialEmails[3],
    quarantinedAt: '2026-09-11T04:21:00Z',
    reason: 'CEO Fraud / BEC: Unauthorized domain requesting $42,500 wire transfer.',
    riskScore: 98,
    status: 'quarantined',
  },
  {
    id: 'quar-3',
    emailId: 'email-7',
    email: initialEmails[6],
    quarantinedAt: '2026-09-10T18:41:00Z',
    reason: 'Weaponized Attachment: Double extension (.pdf.exe) concealing executable malware payload.',
    riskScore: 97,
    status: 'quarantined',
  },
];

export const initialAlerts: SecurityAlert[] = [
  {
    id: 'alt-1',
    timestamp: '2026-09-11T07:15:20Z',
    emailId: 'email-1',
    emailSubject: 'URGENT: Microsoft 365 Password Expiration...',
    accountEmail: 'alex.carter@apextech.io',
    severity: 'critical',
    threatType: 'phishing',
    title: 'Credential Harvesting Phishing Intercepted',
    description: 'Suspicious email from m1crosoft-auth-verify.xyz claiming to be Microsoft Security Team was automatically quarantined.',
    acknowledged: false,
  },
  {
    id: 'alt-2',
    timestamp: '2026-09-11T04:20:15Z',
    emailId: 'email-4',
    emailSubject: 'CONFIDENTIAL: Urgent Wire Transfer for International Acquisition...',
    accountEmail: 'alex.carter@apextech.io',
    severity: 'critical',
    threatType: 'spoofing',
    title: 'Executive BEC Impersonation Detected',
    description: 'High-risk CEO wire transfer request ($42,500) blocked. Originating domain: consulting-direct-wire.top.',
    acknowledged: false,
  },
  {
    id: 'alt-3',
    timestamp: '2026-09-10T18:40:30Z',
    emailId: 'email-7',
    emailSubject: 'Overdue Shipping Invoice #INV-993821...',
    accountEmail: 'corp.advisory@synergycorp.com',
    severity: 'critical',
    threatType: 'suspicious_attachment',
    title: 'Malicious Executable Attachment Neutralized',
    description: 'Dangerous file invoice_remittance_993821.pdf.exe detected with double extension technique.',
    acknowledged: true,
  },
];

export const initialWhitelistBlacklist: WhitelistBlacklistEntry[] = [
  {
    id: 'wl-1',
    type: 'domain',
    value: 'university.edu',
    listType: 'whitelist',
    addedAt: '2026-09-01T10:00:00Z',
    reason: 'Institutional academic correspondence',
  },
  {
    id: 'wl-2',
    type: 'domain',
    value: 'apextech.io',
    listType: 'whitelist',
    addedAt: '2026-09-01T10:00:00Z',
    reason: 'Primary employer corporate domain',
  },
  {
    id: 'bl-1',
    type: 'domain',
    value: 'm1crosoft-auth-verify.xyz',
    listType: 'blacklist',
    addedAt: '2026-09-11T07:16:00Z',
    reason: 'Confirmed credential harvesting campaign',
  },
  {
    id: 'bl-2',
    type: 'domain',
    value: 'consulting-direct-wire.top',
    listType: 'blacklist',
    addedAt: '2026-09-11T04:21:00Z',
    reason: 'Confirmed CEO fraud & wire solicitation',
  },
];

export const initialRules: SecurityRule[] = [
  {
    id: 'rule-1',
    name: 'Auto-Quarantine Phishing & Malicious Content',
    condition: {
      field: 'security',
      operator: 'equals',
      value: 'PHISHING',
    },
    action: 'quarantine',
    isEnabled: true,
  },
  {
    id: 'rule-2',
    name: 'Flag High-Value Financial Invoices',
    condition: {
      field: 'category',
      operator: 'equals',
      value: 'financial',
    },
    action: 'set_priority',
    actionValue: 'High',
    isEnabled: true,
  },
  {
    id: 'rule-3',
    name: 'Auto-Label Newsletters for Quiet Review',
    condition: {
      field: 'category',
      operator: 'equals',
      value: 'newsletter',
    },
    action: 'recommend_archive',
    isEnabled: true,
  },
  {
    id: 'rule-4',
    name: 'Prioritize University Academic Communications',
    condition: {
      field: 'domain',
      operator: 'contains',
      value: 'university.edu',
    },
    action: 'set_category',
    actionValue: 'academic',
    isEnabled: true,
  },
];

export const initialAuditLogs: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: '2026-09-11T07:48:10Z',
    actionType: 'ACCOUNT_SYNC',
    description: 'Synchronized 312 messages for account alex.carter@apextech.io via Outlook Graph API delta cursor.',
  },
  {
    id: 'log-2',
    timestamp: '2026-09-11T07:16:05Z',
    actionType: 'QUARANTINE_ACTION',
    description: 'Email "URGENT: Microsoft 365 Password Expiration..." automatically moved to quarantine based on Rule #1 (Auto-Quarantine Phishing).',
    details: { threatRiskScore: 96, indicatorsCount: 5 },
  },
  {
    id: 'log-3',
    timestamp: '2026-09-11T07:15:30Z',
    actionType: 'NOTIFICATION_SENT',
    description: 'Dispatched High-Priority Security Alert to Web Push & WhatsApp (+1-555-019-2834).',
    details: { channel: 'whatsapp_and_web_push', priority: 'Critical' },
  },
  {
    id: 'log-4',
    timestamp: '2026-09-11T04:21:12Z',
    actionType: 'BLACKLIST_UPDATED',
    description: 'Added rogue domain consulting-direct-wire.top to global blacklist.',
  },
  {
    id: 'log-5',
    timestamp: '2026-09-10T18:41:10Z',
    actionType: 'EMAIL_SCANNED',
    description: 'Heuristic attachment scanner detected deceptive double extension (.pdf.exe) in incoming mail.',
  },
];

export const initialNotificationSettings: NotificationSettings = {
  pushEnabled: true,
  whatsappEnabled: true,
  whatsappNumber: '+1 (555) 019-2834',
  webPushEnabled: true,
  dailyDigestEnabled: true,
  dailyDigestTime: '08:00',
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  minimumPriorityForPush: 'High',
  minimumPriorityForWhatsApp: 'Critical',
};

export const initialSecuritySettings: SecuritySettings = {
  sensitivity: 'Balanced',
  autoQuarantinePhishing: true,
  blockDoubleExtensions: true,
  alertOnDmarcFail: true,
  checkLookalikeDomains: true,
};
