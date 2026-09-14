import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  ShieldCheck,
  ExternalLink,
  Bot,
  User,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { ChatMessage, Email } from '../types';

interface AskMailSentinelViewProps {
  emails: Email[];
  onOpenEmail: (id: string) => void;
}

export const AskMailSentinelView: React.FC<AskMailSentinelViewProps> = ({ emails, onOpenEmail }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: `Hello! I am **Ask MailSentinel**, your cross-account email intelligence and security assistant.

I analyze messages across all your connected Gmail and Outlook mailboxes with strict **Zero-Trust Prompt Injection Defense**.

You can ask me to find deadlines, track financial invoices, compare threads, or explain why security alerts were triggered. How can I assist you today?`,
      timestamp: new Date().toISOString(),
      citedEmailIds: [],
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const suggestedQuestions = [
    'What deadlines do I have this week?',
    'Find emails about unpaid invoices or wires.',
    'What did Prof. Henderson say about my project?',
    'Which emails require an urgent reply?',
    'Explain why the Microsoft 365 email was quarantined.',
  ];

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || inputPrompt;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/gemini/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend }),
      });
      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: data.answer || 'No response provided.',
        timestamp: new Date().toISOString(),
        citedEmailIds: data.citedEmailIds || [],
        isSecurityWarning: data.isSecurityWarning,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.warn('Ask MailSentinel query notice:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          text: 'MailSentinel encountered an error connecting to the intelligence server. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 max-w-5xl mx-auto p-4 md:p-6">
      {/* Header & Prompt Injection Defense Notice */}
      <div className="pb-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Ask MailSentinel</h2>
              <p className="text-xs text-slate-400">Conversational RAG Assistant with Multi-Account Grounding</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-800/60 text-[11px] text-cyan-300 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>PROMPT INJECTION DEFENSE ACTIVE</span>
          </div>
        </div>

        {/* Defense Notice Banner */}
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Isolated Sandbox:</strong> Email contents are treated strictly as untrusted raw data. Unsanitized instructions, prompt injections, or malicious tool requests contained inside email text are neutralised and will not execute.
          </span>
        </div>
      </div>

      {/* Message Chat Feed */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          const citedEmails = (m.citedEmailIds || [])
            .map((id) => emails.find((e) => e.id === id))
            .filter(Boolean) as Email[];

          return (
            <div key={m.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed space-y-3 ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-xs'
                    : m.isSecurityWarning
                    ? 'bg-rose-950/30 border border-rose-800/60 text-slate-200 rounded-bl-xs'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans text-xs space-y-2">
                  {m.text}
                </div>

                {/* Grounded Source Citations */}
                {citedEmails.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 block">
                      Grounded Sources ({citedEmails.length} messages cited):
                    </span>
                    <div className="space-y-1">
                      {citedEmails.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => onOpenEmail(c.id)}
                          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 cursor-pointer transition flex items-center justify-between text-[11px]"
                        >
                          <div className="truncate pr-2">
                            <span className="font-semibold text-slate-200">{c.subject}</span>
                            <span className="text-slate-400 text-[10px] ml-1.5">({c.senderName})</span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 font-mono text-right">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 items-center text-xs text-slate-400 italic">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>MailSentinel is searching connected mailboxes and reasoning with Gemini...</span>
          </div>
        )}
      </div>

      {/* Suggested Starter Prompts */}
      <div className="py-2 border-t border-slate-800">
        <span className="text-[11px] text-slate-400 font-medium block mb-1.5">Suggested Questions:</span>
        <div className="flex flex-wrap gap-1.5">
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              id={`suggested-question-${idx}`}
              onClick={() => handleSendMessage(q)}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="pt-2 flex items-center gap-2"
      >
        <input
          id="ask-mailsentinel-chat-input"
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Ask a question about your emails, tasks, invoices, or security threats..."
          className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-500"
        />
        <button
          id="send-ask-mailsentinel-prompt-btn"
          type="submit"
          disabled={!inputPrompt.trim() || isLoading}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition disabled:opacity-40"
        >
          <span>Ask</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
