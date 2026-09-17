import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Bell,
  BellOff,
  Flame,
  ArrowDown,
  ArrowUp,
  Tag,
  Search,
  X,
  Check,
} from 'lucide-react';
import { AutomationRule } from '../types';

interface RulesViewProps {
  rules: AutomationRule[];
  onToggleRule: (id: string) => void;
  onAddRule: (rule: Partial<AutomationRule>) => void;
  onUpdateRule?: (rule: AutomationRule) => void;
  onDeleteRule?: (id: string) => void;
  onRequestConfirm: (params: {
    title: string;
    description: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmLabel?: string;
  }) => void;
}

export const RulesView: React.FC<RulesViewProps> = ({
  rules,
  onToggleRule,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onRequestConfirm,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [ruleName, setRuleName] = useState('');
  const [conditionType, setConditionType] = useState<'sender' | 'domain' | 'keyword' | 'subject'>('sender');
  const [conditionValue, setConditionValue] = useState('');
  const [actionType, setActionType] = useState<
    'increase_priority' | 'decrease_priority' | 'mark_important' | 'notify' | 'do_not_notify' | 'security_warning'
  >('mark_important');
  const [ruleDescription, setRuleDescription] = useState('');

  const resetForm = () => {
    setRuleName('');
    setConditionType('sender');
    setConditionValue('');
    setActionType('mark_important');
    setRuleDescription('');
    setEditingRuleId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');

    // Parse condition
    if (typeof rule.condition === 'object' && rule.condition?.field) {
      if (rule.condition.field === 'sender') setConditionType('sender');
      else if (rule.condition.field === 'senderDomain' || rule.condition.field === 'domain') setConditionType('domain');
      else if (rule.condition.field === 'subject') setConditionType('subject');
      else setConditionType('keyword');
      setConditionValue(rule.condition.value || '');
    } else if (typeof rule.condition === 'string') {
      setConditionType('keyword');
      setConditionValue(rule.condition);
    }

    // Parse action
    const act = typeof rule.action === 'string' ? rule.action : rule.action?.type || '';
    if (act.includes('priority_up') || act === 'increase_priority') setActionType('increase_priority');
    else if (act.includes('priority_down') || act === 'decrease_priority') setActionType('decrease_priority');
    else if (act.includes('notify') && !act.includes('do_not')) setActionType('notify');
    else if (act.includes('do_not_notify') || act.includes('suppress')) setActionType('do_not_notify');
    else if (act.includes('security') || act.includes('flag')) setActionType('security_warning');
    else setActionType('mark_important');

    setShowModal(true);
  };

  const handleSubmitRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !conditionValue.trim()) return;

    const conditionObj = {
      field: conditionType === 'domain' ? 'senderDomain' : conditionType,
      operator: conditionType === 'keyword' ? 'contains' : 'equals',
      value: conditionValue.trim(),
    };

    if (editingRuleId && onUpdateRule) {
      const updated: AutomationRule = {
        id: editingRuleId,
        name: ruleName.trim(),
        description: ruleDescription.trim() || `If ${conditionType} matches "${conditionValue}", apply ${actionType.replace(/_/g, ' ')}.`,
        condition: conditionObj,
        action: actionType,
        isEnabled: true,
      };
      onUpdateRule(updated);
    } else {
      onAddRule({
        name: ruleName.trim(),
        description: ruleDescription.trim() || `If ${conditionType} matches "${conditionValue}", apply ${actionType.replace(/_/g, ' ')}.`,
        condition: conditionObj,
        action: actionType,
        isEnabled: true,
      });
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (id: string, name: string) => {
    onRequestConfirm({
      title: 'Delete Rule',
      description: `Are you sure you want to delete rule "${name}"? This action cannot be undone.`,
      confirmLabel: 'Delete Rule',
      isDestructive: true,
      onConfirm: () => {
        if (onDeleteRule) onDeleteRule(id);
      },
    });
  };

  const filteredRules = rules.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const condStr = JSON.stringify(r.condition).toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      condStr.includes(q)
    );
  });

  const getActionBadge = (action: any) => {
    const actStr = typeof action === 'string' ? action : action?.type || '';
    if (actStr === 'increase_priority' || actStr.includes('priority_up')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          <span>Increase Priority</span>
        </span>
      );
    }
    if (actStr === 'decrease_priority' || actStr.includes('priority_down')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
          <ArrowDown className="w-3 h-3" />
          <span>Decrease Priority</span>
        </span>
      );
    }
    if (actStr === 'mark_important' || actStr.includes('important')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
          <Flame className="w-3 h-3" />
          <span>Mark Important</span>
        </span>
      );
    }
    if (actStr === 'notify' || actStr.includes('notify_urgent')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
          <Bell className="w-3 h-3" />
          <span>Notify Immediately</span>
        </span>
      );
    }
    if (actStr === 'do_not_notify' || actStr.includes('suppress')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
          <BellOff className="w-3 h-3" />
          <span>Do Not Notify</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
        <Shield className="w-3 h-3" />
        <span>Security Warning</span>
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <span>Inbox Rules & Automation</span>
            </h1>
            <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {rules.length} RULES
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure custom conditions to prioritize, notify, or flag incoming emails automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rules..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            id="create-rule-btn"
            onClick={handleOpenAdd}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Rule</span>
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {filteredRules.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800 space-y-2">
            <Sliders className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm font-medium">No rules match your search.</p>
            <p className="text-xs text-slate-500">Click &quot;Create Rule&quot; to set up an automated email behavior.</p>
          </div>
        ) : (
          filteredRules.map((rule) => {
            const isEnabled = rule.isEnabled ?? rule.isActive ?? true;
            const cond = rule.condition || {};
            const condField = cond.field || 'sender';
            const condVal = cond.value || (typeof cond === 'string' ? cond : 'Any');

            return (
              <div
                key={rule.id}
                id={`rule-card-${rule.id}`}
                className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isEnabled
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                }`}
              >
                {/* Left: Info & Badges */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-white">{rule.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                        isEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isEnabled ? 'Active' : 'Disabled'}
                    </span>
                    {getActionBadge(rule.action)}
                  </div>

                  <p className="text-xs text-slate-300">
                    <span className="text-slate-400">Condition:</span>{' '}
                    <span className="font-mono text-cyan-300 bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                      {condField}: &quot;{condVal}&quot;
                    </span>
                  </p>

                  {rule.description && (
                    <p className="text-[11px] text-slate-400 leading-normal">{rule.description}</p>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Enable/Disable switch */}
                  <button
                    id={`toggle-rule-${rule.id}`}
                    onClick={() => onToggleRule(rule.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      isEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(rule)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Edit Rule"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(rule.id, rule.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Rule Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>{editingRuleId ? 'Edit Automation Rule' : 'Create Automation Rule'}</span>
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRule} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. VIP Priority for Thesis Advisor"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Condition Type</label>
                  <select
                    value={conditionType}
                    onChange={(e) => setConditionType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden"
                  >
                    <option value="sender">Sender Email</option>
                    <option value="domain">Sender Domain</option>
                    <option value="keyword">Body Keyword</option>
                    <option value="subject">Subject Pattern</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Condition Match</label>
                  <input
                    type="text"
                    required
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    placeholder={
                      conditionType === 'sender'
                        ? 'advisor@university.edu'
                        : conditionType === 'domain'
                        ? 'apextech.io'
                        : conditionType === 'subject'
                        ? '[Urgent Project]'
                        : 'invoice, payment'
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Action to Take</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-hidden"
                >
                  <option value="increase_priority">Increase Priority (Elevate to High/Critical)</option>
                  <option value="decrease_priority">Decrease Priority (Demote to Low)</option>
                  <option value="mark_important">Mark Important</option>
                  <option value="notify">Notify (Dispatch Push / WhatsApp)</option>
                  <option value="do_not_notify">Do Not Notify (Mute Alerts)</option>
                  <option value="security_warning">Security Warning (Flag Suspicious)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  placeholder="Explain why this rule exists..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                >
                  {editingRuleId ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
