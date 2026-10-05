import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Zap,
  Pencil,
  Trash2,
  Plus,
  Globe,
  Key,
  Cpu,
  X,
  Check,
  Eye,
  EyeOff,
  Server,
  Star,
  Loader2,
} from 'lucide-react';
import { useAuthContext } from '~/hooks';
import { SystemRoles } from 'librechat-data-provider';

interface LLMProviderItem {
  _id: string;
  idNum: number;
  displayName: string;
  providerType: string;
  modelName: string;
  timeout: number;
  baseURL: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  status: boolean;
  isDefault: boolean;
  lastTestStatus: string;
  lastTestLatency?: number;
  lastTestTime?: string;
}

interface FormState {
  _id?: string;
  displayName: string;
  providerType: string;
  modelName: string;
  timeout: number;
  baseURL: string;
  apiKey: string;
  isDefault: boolean;
  status: boolean;
}

const DEFAULT_FORM: FormState = {
  displayName: '',
  providerType: 'openai',
  modelName: '',
  timeout: 600,
  baseURL: '',
  apiKey: '',
  isDefault: false,
  status: true,
};

export default function AdminLLMConfig({ onClose }: { onClose?: () => void } = {}) {
  const { user, token } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const [providers, setProviders] = useState<LLMProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviderItem | null>(null);
  const [formData, setFormData] = useState<FormState>(DEFAULT_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
    }),
    [token],
  );

  const fetchProviders = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const res = await fetch('/api/admin/llm-config', { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch providers');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err: unknown) {
      console.error('Error fetching LLM providers:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, getHeaders]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  if (!isAdmin) {
    return null;
  }

  const handleOpenAddModal = () => {
    setEditingProvider(null);
    setFormData(DEFAULT_FORM);
    setShowApiKey(false);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (provider: LLMProviderItem) => {
    setEditingProvider(provider);
    setFormData({
      _id: provider._id,
      displayName: provider.displayName,
      providerType: provider.providerType,
      modelName: provider.modelName,
      timeout: provider.timeout || 600,
      baseURL: provider.baseURL,
      apiKey: '',
      isDefault: provider.isDefault,
      status: provider.status,
    });
    setShowApiKey(false);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProvider(null);
    setFormData(DEFAULT_FORM);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const isEditing = Boolean(editingProvider && editingProvider._id);
      const url = isEditing
        ? `/api/admin/llm-config/${editingProvider?._id}`
        : '/api/admin/llm-config';
      const method = isEditing ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        apiKey:
          formData.apiKey.trim() === '' && isEditing
            ? 'KEEP_CURRENT_KEY'
            : formData.apiKey.trim(),
      };

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save provider');
      }

      await fetchProviders();
      handleCloseModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving provider';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (provider: LLMProviderItem) => {
    try {
      const newStatus = !provider.status;
      setProviders((prev) =>
        prev.map((p) => (p._id === provider._id ? { ...p, status: newStatus } : p)),
      );

      const res = await fetch(`/api/admin/llm-config/${provider._id}/toggle`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to toggle status');
    } catch (err) {
      console.error('Failed to toggle status:', err);
      fetchProviders();
    }
  };

  const handleSetDefault = async (provider: LLMProviderItem) => {
    try {
      setProviders((prev) =>
        prev.map((p) => ({
          ...p,
          isDefault: p._id === provider._id,
          status: p._id === provider._id ? true : p.status,
        })),
      );

      const res = await fetch(`/api/admin/llm-config/${provider._id}/toggle`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ isDefault: true, status: true }),
      });

      if (!res.ok) throw new Error('Failed to set active provider');
      await fetchProviders();
    } catch (err) {
      console.error('Failed to set default provider:', err);
      fetchProviders();
    }
  };

  const handleDelete = async (provider: LLMProviderItem) => {
    if (!window.confirm(`Are you sure you want to delete "${provider.displayName}"?`)) {
      return;
    }

    try {
      setProviders((prev) => prev.filter((p) => p._id !== provider._id));
      const res = await fetch(`/api/admin/llm-config/${provider._id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!res.ok) throw new Error('Failed to delete provider');
      await fetchProviders();
    } catch (err) {
      console.error('Failed to delete provider:', err);
      fetchProviders();
    }
  };

  const handleLiveTest = async (provider: LLMProviderItem) => {
    try {
      setTestingId(provider._id);
      const res = await fetch(`/api/admin/llm-config/${provider._id}/test`, {
        method: 'POST',
        headers: getHeaders(),
      });

      const data = await res.json();
      setProviders((prev) =>
        prev.map((p) =>
          p._id === provider._id
            ? {
                ...p,
                lastTestStatus: data.statusText || (data.success ? '200 OK' : 'Failed'),
                lastTestLatency: data.latency,
              }
            : p,
        ),
      );
    } catch (err) {
      console.error('Live test error:', err);
      setProviders((prev) =>
        prev.map((p) =>
          p._id === provider._id ? { ...p, lastTestStatus: 'Failed to connect' } : p,
        ),
      );
    } finally {
      setTestingId(null);
    }
  };

  const getProviderInitials = (provider: LLMProviderItem) => {
    const type = (provider.providerType || '').toLowerCase();
    if (type.includes('gemini')) return { text: 'GE', bg: 'bg-blue-500/10 text-blue-500 border-blue-500/30' };
    if (type.includes('mistral')) return { text: 'MI', bg: 'bg-orange-500/10 text-orange-500 border-orange-500/30' };
    if (type.includes('openai')) return { text: 'OA', bg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' };
    if (type.includes('ollama')) return { text: 'OL', bg: 'bg-purple-500/10 text-purple-500 border-purple-500/30' };
    return {
      text: (provider.displayName || 'AI').slice(0, 2).toUpperCase(),
      bg: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <Cpu className="size-5" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-base font-semibold text-text-primary">
              AI Providers & Endpoints (Database)
            </h2>
            <span className="text-xs text-text-secondary">
              Dynamic LLM configurations stored in MongoDB. Normal users automatically chat with the Active provider.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 active:scale-95"
          >
            <Plus className="size-4" />
            Add LLM Provider
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-light bg-surface-primary p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Providers Table (No horizontal scrollbar) */}
      <div className="w-full overflow-hidden rounded-xl border border-border-light bg-surface-secondary shadow-sm">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border-light bg-surface-tertiary text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              <th className="w-[50px] px-3 py-3 text-center">ID</th>
              <th className="w-[200px] px-3 py-3">PROVIDER & NAME</th>
              <th className="w-[220px] px-3 py-3">MODEL & ENDPOINT</th>
              <th className="w-[120px] px-3 py-3">API KEY</th>
              <th className="w-[80px] px-3 py-3 text-center">STATUS</th>
              <th className="w-[170px] px-3 py-3">LIVE TEST</th>
              <th className="w-[110px] px-3 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light text-text-primary">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-secondary">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin text-orange-500" />
                    <span>Loading LLM Providers from Database...</span>
                  </div>
                </td>
              </tr>
            ) : providers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-secondary">
                  No LLM providers configured yet. Click &quot;Add LLM Provider&quot; above to create one.
                </td>
              </tr>
            ) : (
              providers.map((p) => {
                const initials = getProviderInitials(p);
                const isTesting = testingId === p._id;

                return (
                  <tr
                    key={p._id}
                    className={`transition-colors hover:bg-surface-hover ${
                      p.isDefault ? 'bg-orange-500/[0.03]' : ''
                    }`}
                  >
                    {/* ID */}
                    <td className="whitespace-nowrap px-3 py-3.5 text-center font-mono font-medium text-text-secondary">
                      #{p.idNum}
                    </td>

                    {/* PROVIDER & NAME */}
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${initials.bg}`}
                        >
                          {initials.text}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-text-primary truncate">
                              {p.displayName}
                            </span>
                            {p.isDefault && (
                              <span className="flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                                <Star className="size-2.5 fill-current" />
                                Active Default
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] capitalize text-text-secondary truncate">
                            {p.providerType}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* MODEL & ENDPOINT */}
                    <td className="px-3 py-3.5">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md border border-border-light bg-surface-primary px-2 py-0.5 font-mono text-[11px] font-medium text-text-primary truncate">
                            {p.modelName}
                          </span>
                          <span className="flex items-center gap-1 rounded bg-surface-primary px-1.5 py-0.5 text-[10px] text-text-secondary shrink-0">
                            <Clock className="size-2.5" />
                            {p.timeout}s
                          </span>
                        </div>
                        <span
                          className="block truncate font-mono text-[11px] text-text-secondary"
                          title={p.baseURL}
                        >
                          {p.baseURL}
                        </span>
                      </div>
                    </td>

                    {/* API KEY */}
                    <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-text-secondary">
                      {p.maskedApiKey}
                    </td>

                    {/* STATUS TOGGLE */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(p)}
                        title={p.status ? 'Active (Click to disable)' : 'Disabled (Click to enable)'}
                        className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          p.status ? 'bg-emerald-500' : 'bg-rose-500/80 dark:bg-rose-600'
                        }`}
                      >
                        <span
                          className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                            p.status ? 'translate-x-6' : 'translate-x-1'
                          } flex items-center justify-center text-[10px] font-bold text-gray-700`}
                        >
                          {p.status ? (
                            <Check className="size-2.5 text-emerald-600" />
                          ) : (
                            <X className="size-2.5 text-rose-600" />
                          )}
                        </span>
                      </button>
                    </td>

                    {/* LIVE TEST */}
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleLiveTest(p)}
                          disabled={isTesting}
                          title="Run live connectivity test"
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 transition hover:bg-amber-500/20 active:scale-95 disabled:opacity-50 dark:text-amber-400"
                        >
                          {isTesting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Zap className="size-3.5" />
                          )}
                        </button>
                        <span
                          title={p.lastTestStatus}
                          className={`truncate max-w-[110px] text-[11px] ${
                            p.lastTestStatus.includes('200 OK') || p.lastTestStatus.includes('Online')
                              ? 'font-medium text-emerald-600 dark:text-emerald-400'
                              : p.lastTestStatus.startsWith('Failed')
                              ? 'font-medium text-rose-500'
                              : 'italic text-text-secondary'
                          }`}
                        >
                          {p.lastTestStatus}
                        </span>
                      </div>
                    </td>

                    {/* ACTIONS */}
                    <td className="whitespace-nowrap px-3 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!p.isDefault && p.status && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(p)}
                            title="Set as active default model for all users"
                            className="rounded-lg p-1.5 text-text-secondary transition hover:bg-orange-500/10 hover:text-orange-600"
                          >
                            <Star className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(p)}
                          title="Edit Provider"
                          className="rounded-lg border border-border-light bg-surface-primary p-1.5 text-blue-500 transition hover:bg-blue-500/10 active:scale-95"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          title="Delete Provider"
                          className="rounded-lg border border-border-light bg-surface-primary p-1.5 text-rose-500 transition hover:bg-rose-500/10 active:scale-95"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-2xl border border-border-light bg-surface-primary p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border-light pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
                  <Cpu className="size-5" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-base font-bold text-text-primary">
                    {editingProvider ? 'Edit LLM Provider' : 'Add LLM Provider'}
                  </h3>
                  <span className="text-xs text-text-secondary">
                    Enter direct credentials and endpoint for your AI engine.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Error banner */}
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-500/10 p-2.5 text-xs font-medium text-rose-500">
                {errorMsg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3.5 text-xs">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {/* DISPLAY NAME */}
                <div className="flex flex-col gap-1">
                  <label className="font-semibold uppercase tracking-wider text-text-secondary">
                    DISPLAY NAME <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="e.g. Gemini Flash / Mistral Local"
                    className="rounded-xl border border-border-light bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>

                {/* PROVIDER TYPE */}
                <div className="flex flex-col gap-1">
                  <label className="font-semibold uppercase tracking-wider text-text-secondary">
                    PROVIDER TYPE <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.providerType}
                    onChange={(e) => setFormData({ ...formData, providerType: e.target.value })}
                    placeholder="gemini / mistral / openai / ollama / mistral_local"
                    className="rounded-xl border border-border-light bg-surface-secondary px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {/* MODEL NAME */}
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-semibold uppercase tracking-wider text-text-secondary">
                    MODEL NAME <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Cpu className="absolute left-3 size-4 text-text-tertiary" />
                    <input
                      type="text"
                      required
                      value={formData.modelName}
                      onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                      placeholder="gemini-2.0-flash / mistral-small-latest / mistral:latest"
                      className="w-full rounded-xl border border-border-light bg-surface-secondary py-2.5 pl-9 pr-3.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* TIMEOUT */}
                <div className="flex flex-col gap-1">
                  <label className="font-semibold uppercase tracking-wider text-text-secondary">
                    TIMEOUT (SEC) <span className="font-normal text-text-tertiary">(def: 600)</span>
                  </label>
                  <div className="relative flex items-center">
                    <Zap className="absolute left-3 size-3.5 text-text-tertiary" />
                    <input
                      type="number"
                      value={formData.timeout}
                      onChange={(e) =>
                        setFormData({ ...formData, timeout: Number(e.target.value) || 600 })
                      }
                      placeholder="600"
                      className="w-full rounded-xl border border-border-light bg-surface-secondary py-2.5 pl-9 pr-3.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* BASE URL */}
              <div className="flex flex-col gap-1">
                <label className="font-semibold uppercase tracking-wider text-text-secondary">
                  BASE URL / FULL ENDPOINT <span className="font-normal text-text-tertiary">(optional - e.g. http://122.163.121.176:3041/api/chat)</span>
                </label>
                <div className="relative flex items-center">
                  <Globe className="absolute left-3 size-4 text-text-tertiary" />
                  <input
                    type="text"
                    required
                    value={formData.baseURL}
                    onChange={(e) => setFormData({ ...formData, baseURL: e.target.value })}
                    placeholder="http://122.163.121.176:3041/api/chat or https://api.mistral.ai/v1/chat/completions"
                    className="w-full rounded-xl border border-border-light bg-surface-secondary py-2.5 pl-9 pr-3.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* API KEY */}
              <div className="flex flex-col gap-1">
                <label className="font-semibold uppercase tracking-wider text-text-secondary">
                  API KEY <span className="font-normal text-text-tertiary">(blank for local models)</span>
                </label>
                <div className="relative flex items-center">
                  <Key className="absolute left-3 size-4 text-text-tertiary" />
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={
                      editingProvider?.hasApiKey
                        ? 'Leave blank to keep existing saved key...'
                        : 'Enter API Key...'
                    }
                    className="w-full rounded-xl border border-border-light bg-surface-secondary py-2.5 pl-9 pr-10 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 text-text-tertiary hover:text-text-primary"
                  >
                    {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Active Default Checkbox */}
              <label className="mt-1 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="size-4 rounded border-border-light text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs font-medium text-text-primary">
                  Set as Active Default model for all normal users
                </span>
              </label>

              {/* Modal Actions */}
              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-border-light pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-xl border border-border-light bg-surface-secondary px-4 py-2 text-xs font-semibold text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-700 active:scale-95 disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
