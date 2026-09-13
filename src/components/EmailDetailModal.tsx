import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  X,
  Shield,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Sparkles,
  Calendar,
  Clock,
  User,
  Building,
  DollarSign,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Send,
  Archive,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { Email, ExtractedEntity, PriorityLevel } from '../types';

interface EmailDetailModalProps {
  email: Email | null;
  onClose: () => void;
  onArchive: (id: string) => void;
  onToggleQuarantine: (id: string, current: boolean) => void;
  onWhitelistDomain: (domain: string) => void;
  onBlacklistDomain: (domain: string) => void;
  onRequestConfirm: (params: { title: string; description: string; onConfirm: () => void; isDestructive?: boolean }) => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onArchive,
  onToggleQuarantine,
  onWhitelistDomain,
  onBlacklistDomain,
  onRequestConfirm,
}) => {
  if (!email) return null;

  const [activeTab, setActiveTab] = useState<'content' | 'security' | 'reply'>('content');
  const [replyTone, setReplyTone] = useState<'professional' | 'concise' | 'firm'>('professional');
  const [customReplyGuidance, setCustomReplyGuidance] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const isPhishing = email.securityAnalysis.classification === 'PHISHING';
  const isMalicious = email.securityAnalysis.classification === 'MALICIOUS';
  const isSuspicious = email.securityAnalysis.classification === 'SUSPICIOUS';
  const isSafe = email.securityAnalysis.classification === 'SAFE';

  const handleGenerateReply = async () => {
    setIsGeneratingReply(true);
    try {
      const res = await fetch('/api/gemini/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: email.id,
          tone: replyTone,
          customNotes: customReplyGuidance,
        }),
      });
      const data = await res.json();
      setGeneratedDraft(data.draft || '');
    } catch (err) {
      console.error(err);
      setGeneratedDraft('Failed to generate reply draft. Please try again.');
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-150">
      <div
        id="email-detail-dialog"
        className="w-full max-w-5xl h-[90vh] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Modal Top Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                isPhishing || isMalicious
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                  : isSuspicious
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{email.securityAnalysis.classification}</span>
            </span>

            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Risk Score: {email.securityAnalysis.riskScore}/100
            </span>

            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Priority: {email.aiAnalysis.priority} ({email.aiAnalysis.priorityScore} pts)
            </span>

            <span className="hidden sm:inline-block text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 uppercase">
              {email.aiAnalysis.category}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="close-email-detail-modal-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900 text-xs">
          <button
            onClick={() => setActiveTab('content')}
            className={`pb-3 font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'content'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Message & AI Intelligence</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`pb-3 font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'border-cyan-500 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span>Security Deep Dive & Verification</span>
            {email.securityAnalysis.indicators.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {email.securityAnalysis.indicators.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('reply');
              if (!generatedDraft && !isPhishing && !isMalicious) {
                handleGenerateReply();
              }
            }}
            className={`pb-3 font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'reply'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Reply Drafter</span>
          </button>
        </div>

        {/* Main Body Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'content' && (
            <div className="space-y-6">
              {/* AI Intelligence Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950/30 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">AI Intelligence Summary</h4>
                  </div>
                  {email.aiAnalysis.actionRequired && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Action Required
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                  {email.aiAnalysis.summary}
                </p>

                {/* Priority Rationale */}
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs space-y-1">
                  <span className="font-semibold text-slate-300">Why MailSentinel rated this {email.aiAnalysis.priority}:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                    {email.aiAnalysis.whyPriorityReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Next Step Callout */}
                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/50 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-cyan-400 font-semibold uppercase text-[10px] tracking-wider block">
                      Recommended Next Step:
                    </span>
                    <span className="text-slate-200 font-medium">{email.aiAnalysis.recommendedAction}</span>
                  </div>
                  {email.aiAnalysis.deadline && (
                    <div className="shrink-0 text-right">
                      <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-semibold">
                        Deadline:
                      </span>
                      <span className="text-amber-300 font-mono text-xs">{email.aiAnalysis.deadline}</span>
                    </div>
                  )}
                </div>

                {/* Extracted Entities Grid */}
                {email.aiAnalysis.extractedEntities.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                      Extracted Entities & Structured Signals:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {email.aiAnalysis.extractedEntities.map((ent, idx) => (
                        <div
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-xs text-slate-300 flex items-center gap-1.5"
                        >
                          {ent.type === 'person' && <User className="w-3 h-3 text-cyan-400" />}
                          {ent.type === 'organization' && <Building className="w-3 h-3 text-indigo-400" />}
                          {ent.type === 'amount' && <DollarSign className="w-3 h-3 text-emerald-400" />}
                          {ent.type === 'deadline' && <Calendar className="w-3 h-3 text-amber-400" />}
                          {ent.type === 'task' && <CheckCircle2 className="w-3 h-3 text-purple-400" />}
                          {ent.type === 'url' && <LinkIcon className="w-3 h-3 text-sky-400" />}
                          <span className="font-semibold text-slate-200">{ent.value}</span>
                          {ent.context && <span className="text-slate-400 text-[10px]">({ent.context})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Original Email Header Metadata */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800 text-xs">
                  <div>
                    <h2 className="text-base font-bold text-white">{email.subject}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-400">
                      <span>From:</span>
                      <span className="text-slate-200 font-semibold">{email.senderName}</span>
                      <span className="text-slate-400">&lt;{email.sender}&gt;</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                        {email.senderDomain}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-slate-400 text-[11px] font-mono">
                    {new Date(email.receivedAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-400">To: </span>
                    <span className="text-slate-300">{email.recipients.join(', ')}</span>
                  </div>
                  {email.cc && email.cc.length > 0 && (
                    <div>
                      <span className="text-slate-400">CC: </span>
                      <span className="text-slate-300">{email.cc.join(', ')}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400">Target Mailbox: </span>
                    <span className="text-slate-300">{email.accountEmail} ({email.provider.toUpperCase()})</span>
                  </div>
                </div>

                {/* Attachments list */}
                {email.hasAttachment && email.attachments && email.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                      Attachments ({email.attachments.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {email.attachments.map((att) => (
                        <div
                          key={att.id}
                          className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                            att.securityStatus === 'FLAGGED'
                              ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                              : 'bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span className="font-mono">{att.filename}</span>
                          <span className="text-[10px] text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                          {att.securityStatus === 'FLAGGED' && (
                            <span className="text-[10px] font-bold text-rose-400 bg-rose-900/50 px-1 py-0.5 rounded">
                              MALWARE RISK
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Security Banner if flagged */}
              {(isPhishing || isMalicious) && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3 text-xs text-rose-200">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold text-rose-300 uppercase tracking-wide">Threat Protection Shield Active</span>
                    <p className="text-rose-200/90 leading-relaxed">
                      MailSentinel intercepted this message due to suspected {email.securityAnalysis.classification.toLowerCase()}. Active scripts, tracking beacons, and interactive links have been quarantined and sanitized to prevent payload execution.
                    </p>
                  </div>
                </div>
              )}

              {/* Formatted Sanitized Email Body */}
              {email.bodyHtml ? (
                <div
                  className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm leading-relaxed font-sans email-content-sanitized prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(email.bodyHtml, {
                      ALLOWED_TAGS: [
                        'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'blockquote',
                        'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h1', 'h2',
                        'h3', 'h4', 'span', 'div', 'hr',
                      ],
                      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'title'],
                      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link'],
                      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
                    }),
                  }}
                />
              ) : (
                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {email.bodyText}
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Security Score Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Overall Security Risk</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span
                      className={`text-3xl font-extrabold font-mono ${
                        isPhishing || isMalicious
                          ? 'text-rose-400'
                          : isSuspicious
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {email.securityAnalysis.riskScore}
                    </span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                  <span className="text-xs text-slate-300 mt-1 font-semibold">{email.securityAnalysis.riskLevel}</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Sub-Scores</span>
                  <div className="space-y-1 mt-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Phishing Score:</span>
                      <span className="font-mono text-rose-400">{email.securityAnalysis.phishingScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Spoofing Score:</span>
                      <span className="font-mono text-amber-400">{email.securityAnalysis.spoofingScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Spam Score:</span>
                      <span className="font-mono text-slate-300">{email.securityAnalysis.spamScore}%</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Authentication Verdict</span>
                  <div className="space-y-1 mt-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">SPF Validation:</span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          email.securityAnalysis.authResults.spf === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {email.securityAnalysis.authResults.spf}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">DKIM Signature:</span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          email.securityAnalysis.authResults.dkim === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {email.securityAnalysis.authResults.dkim}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">DMARC Policy:</span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          email.securityAnalysis.authResults.dmarc === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {email.securityAnalysis.authResults.dmarc}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Why Flagged Reasons */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Why MailSentinel Flagged This Message
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {email.securityAnalysis.whyFlaggedReasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 flex items-start gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Indicators */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Detected Security Indicators ({email.securityAnalysis.indicators.length})
                </h4>
                <div className="space-y-2">
                  {email.securityAnalysis.indicators.map((ind, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        ind.severity === 'critical'
                          ? 'bg-rose-950/20 border-rose-800/40 text-rose-200'
                          : ind.severity === 'high'
                          ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] uppercase tracking-wider font-mono">
                          {ind.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-slate-900">
                          Severity: {ind.severity}
                        </span>
                      </div>
                      <p className="text-xs">{ind.description}</p>
                      {ind.detail && <p className="text-[11px] text-slate-400 italic font-mono">{ind.detail}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sender & Domain Analysis */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-slate-200">
                  Sender & Domain Origin Diagnostics
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase">Declared Display Name</span>
                    <span className="text-slate-200 font-semibold">{email.securityAnalysis.senderDomainAnalysis.displayName}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase">Originating Domain</span>
                    <span className="text-slate-200 font-semibold font-mono">{email.securityAnalysis.senderDomainAnalysis.domain}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase">Lookalike / Typosquatting</span>
                    <span
                      className={`font-semibold ${
                        email.securityAnalysis.senderDomainAnalysis.isLookalike ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {email.securityAnalysis.senderDomainAnalysis.isLookalike
                        ? `YES (Impersonates ${email.securityAnalysis.senderDomainAnalysis.matchedBrand})`
                        : 'No anomaly detected'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="text-slate-400 block text-[10px] uppercase">Reply-To Header Alignment</span>
                    <span
                      className={`font-semibold ${
                        email.securityAnalysis.senderDomainAnalysis.replyToMatch ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {email.securityAnalysis.senderDomainAnalysis.replyToMatch
                        ? 'Aligned with Sender'
                        : `MISMATCH (Replies route to: ${email.securityAnalysis.senderDomainAnalysis.replyTo})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* URL Analysis Table */}
              {email.securityAnalysis.urlAnalysis.totalUrls > 0 && (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                  <h4 className="font-bold uppercase tracking-wider text-slate-200">
                    Embedded Link Analysis ({email.securityAnalysis.urlAnalysis.totalUrls} extracted)
                  </h4>
                  {email.securityAnalysis.urlAnalysis.suspiciousUrls.length > 0 ? (
                    <div className="space-y-2">
                      {email.securityAnalysis.urlAnalysis.suspiciousUrls.map((u, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/50 space-y-1">
                          <div className="flex justify-between items-center font-mono text-[11px] text-rose-300">
                            <span className="truncate">{u.displayText}</span>
                            <span className="text-[10px] bg-rose-900 px-1 py-0.5 rounded font-bold uppercase">
                              {u.risk} RISK
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 break-all">{u.url}</p>
                          <p className="text-[11px] text-rose-400 italic">Threat Reason: {u.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-800 text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>All destination links verified safe. No phishing kits or raw IP addresses detected.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reply' && (
            <div className="space-y-4">
              {isPhishing || isMalicious ? (
                <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-800 text-center space-y-3">
                  <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
                  <h3 className="text-base font-bold text-rose-200">AI Reply Generation Blocked for Security</h3>
                  <p className="text-xs text-rose-300/90 max-w-lg mx-auto leading-relaxed">
                    MailSentinel prevents generating or sending replies to verified phishing or malicious campaigns.
                    Replying verifies your mailbox active status and invites further targeted credential exploitation.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300">Reply Tone:</span>
                      {(['professional', 'concise', 'firm'] as const).map((tone) => (
                        <button
                          key={tone}
                          onClick={() => setReplyTone(tone)}
                          className={`px-3 py-1 text-xs rounded-lg font-medium capitalize transition ${
                            replyTone === tone
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>

                    <button
                      id="regenerate-draft-btn"
                      onClick={handleGenerateReply}
                      disabled={isGeneratingReply}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isGeneratingReply ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingReply ? 'Drafting...' : 'Regenerate Draft'}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Custom Guidance (Optional):</label>
                    <input
                      type="text"
                      value={customReplyGuidance}
                      onChange={(e) => setCustomReplyGuidance(e.target.value)}
                      placeholder="e.g. Accept the meeting for Thursday, or decline and offer alternate time..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="relative">
                    <textarea
                      rows={10}
                      value={generatedDraft}
                      onChange={(e) => setGeneratedDraft(e.target.value)}
                      placeholder="Generating contextual reply draft with Gemini..."
                      className="w-full p-4 text-xs font-mono rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                    />

                    {generatedDraft && (
                      <button
                        id="copy-draft-btn"
                        onClick={() => copyToClipboard(generatedDraft)}
                        className="absolute right-3 top-3 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                      >
                        {copiedDraft ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDraft ? 'Copied' : 'Copy Draft'}</span>
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    Note: As per MailSentinel safety policy, replies are drafts for user copy/paste and are never sent autonomously.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar (Level 3 Confirmation Actions) */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {/* Whitelist / Blacklist Domain */}
            <button
              id="whitelist-domain-btn"
              onClick={() => {
                onRequestConfirm({
                  title: `Whitelist ${email.senderDomain}?`,
                  description: `Emails from "${email.senderDomain}" will be permitted, though critical authentication failures will still produce alerts.`,
                  onConfirm: () => onWhitelistDomain(email.senderDomain),
                });
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              Whitelist Domain
            </button>

            <button
              id="blacklist-domain-btn"
              onClick={() => {
                onRequestConfirm({
                  title: `Block & Blacklist ${email.senderDomain}?`,
                  description: `All future incoming messages originating from "${email.senderDomain}" will be automatically neutralized and placed into Quarantine.`,
                  isDestructive: true,
                  onConfirm: () => onBlacklistDomain(email.senderDomain),
                });
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/60 transition"
            >
              Block Domain
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Quarantine Toggle */}
            <button
              id="toggle-quarantine-btn"
              onClick={() => {
                onRequestConfirm({
                  title: email.isQuarantined ? 'Release from Quarantine?' : 'Quarantine this Email?',
                  description: email.isQuarantined
                    ? `Are you sure you want to release "${email.subject}" from quarantine back to normal inbox?`
                    : `This will isolate "${email.subject}" and prevent any interaction.`,
                  isDestructive: !email.isQuarantined,
                  onConfirm: () => onToggleQuarantine(email.id, email.isQuarantined),
                });
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                email.isQuarantined
                  ? 'bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
              }`}
            >
              {email.isQuarantined ? 'Release from Quarantine' : 'Move to Quarantine'}
            </button>

            {/* Archive */}
            <button
              id="archive-email-btn"
              onClick={() => {
                onArchive(email.id);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
