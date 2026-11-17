import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@efls/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type ProviderKind = 'gemini' | 'openai';
type UiMode = 'fake' | 'rotate' | 'priority';

type OpenAiEndpointCfg = { name?: string; baseUrl: string; apiKey: string; model: string; enabled?: boolean };
type GeminiKeyCfg = { key: string; name?: string; enabled?: boolean };

type AiConfig = {
  provider: string;
  failoverChain: string;
  cooldownSec: number;
  timeoutMs: number;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
  openaiEndpoints: OpenAiEndpointCfg[];
  geminiModel: string;
  geminiApiKey: string;
  geminiApiKeys: GeminiKeyCfg[];
  updatedAt?: string | null;
  note?: string;
};

type UnifiedEntry = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  sourceIndex: number;
};

type ProviderStatus = {
  key: string;
  type: string;
  requests?: number | null;
  successes?: number | null;
  failures?: number | null;
  cooldownSecRemaining?: number;
  available?: boolean;
  lastLatencyMs?: number | null;
  lastError?: string | null;
};

type AiStatus = {
  ready: boolean;
  mode?: string;
  provider?: string;
  configuredProvider?: string;
  totals?: { requests?: number | null; successes?: number | null; failures?: number | null };
  providers?: ProviderStatus[];
  error?: string;
  errorCode?: string;
  detail?: any;
  fetchedAt?: string;
  source?: string;
};

const DEFAULT_CONFIG: AiConfig = {
  provider: 'fake',
  failoverChain: 'gemini,openai,fake',
  cooldownSec: 60,
  timeoutMs: 15000,
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: '',
  openaiApiKey: '',
  openaiEndpoints: [],
  geminiModel: 'gemini-1.5-flash',
  geminiApiKey: '',
  geminiApiKeys: [],
  note: '',
};

function maskKey(key: string): string {
  const k = (key || '').trim();
  if (!k) return '—';
  if (k === '********') return '••••••••';
  if (k.length <= 8) return `${k.slice(0, 2)}••••${k.slice(-2)}`;
  return `${k.slice(0, 6)}...${k.slice(-4)}`;
}

function modeFromProvider(provider: string): UiMode {
  if (provider === 'fake') return 'fake';
  if (provider === 'router' || provider === 'failover' || provider === 'auto') return 'rotate';
  // legacy single providers -> treat as priority-like explicit choice
  return 'priority';
}

function providerFromMode(mode: UiMode): string {
  if (mode === 'fake') return 'fake';
  return 'router';
}

function normalizeEntriesFromConfig(cfg: AiConfig): UnifiedEntry[] {
  const gemini: UnifiedEntry[] = (cfg.geminiApiKeys || []).map((g, i) => ({
    id: `g-${i}-${g.name || g.key || 'k'}`,
    kind: 'gemini',
    name: g?.name || `Gemini ${i + 1}`,
    model: cfg.geminiModel || 'gemini-1.5-flash',
    apiKey: typeof g === 'string' ? g : (g?.key || ''),
    enabled: typeof g === 'string' ? true : g?.enabled !== false,
    sourceIndex: i,
  }));
  const openai: UnifiedEntry[] = (cfg.openaiEndpoints || []).map((e, i) => ({
    id: `o-${i}-${e.name || e.baseUrl || 'e'}`,
    kind: 'openai',
    name: e?.name || `OpenAI-compatible ${i + 1}`,
    baseUrl: e?.baseUrl || cfg.openaiBaseUrl || 'https://api.openai.com/v1',
    model: e?.model || cfg.openaiModel || '',
    apiKey: e?.apiKey || '',
    enabled: e?.enabled !== false,
    sourceIndex: i,
  }));
  return [...gemini, ...openai];
}

function applyEntriesToConfig(cfg: AiConfig, entries: UnifiedEntry[]): AiConfig {
  const geminiEntries = entries.filter((e) => e.kind === 'gemini');
  const openaiEntries = entries.filter((e) => e.kind === 'openai');
  return {
    ...cfg,
    geminiApiKeys: geminiEntries.map((e) => ({ key: e.apiKey, name: e.name, enabled: e.enabled })),
    openaiEndpoints: openaiEntries.map((e) => ({ name: e.name, baseUrl: e.baseUrl || 'https://api.openai.com/v1', apiKey: e.apiKey, model: e.model, enabled: e.enabled })),
  };
}

function friendlyStatusError(status?: AiStatus, queryError?: any): string | null {
  if (!status && !queryError) return null;
  if (status?.ready) return null;

  const body = (queryError?.problem ?? queryError?.response?.data ?? queryError?.data ?? {}) as any;
  const errorCode = status?.errorCode || body?.errorCode;
  const msg = String(status?.error || body?.error || queryError?.problem?.detail || queryError?.message || '');

  // Chuẩn hóa theo yêu cầu: 404 (Không tìm thấy dịch vụ AI), Timeout (AI phản hồi quá chậm), 5xx (Lỗi nội bộ AI Service)
  if (errorCode === 'timeout' || /Timeout \(AI phản hồi quá chậm\)|timeout/i.test(msg)) {
    return 'Timeout (AI phản hồi quá chậm)';
  }
  if (errorCode === 'ai_internal_error' || /5xx \(Lỗi nội bộ AI Service\)/.test(msg) || /AI service trả về 5\d\d/.test(msg)) {
    return '5xx (Lỗi nội bộ AI Service)';
  }
  if (
    errorCode === 'not_found' ||
    errorCode === 'unreachable' ||
    /404 \(Không tìm thấy dịch vụ AI\)/.test(msg) ||
    /AI service trả về 404/.test(msg)
  ) {
    return '404 (Không tìm thấy dịch vụ AI)';
  }

  if (/401|token|x-ai-token/i.test(msg)) return 'Không thể xác thực với dịch vụ AI. Vui lòng kiểm tra cấu hình hệ thống.';
  if (/503|AI_SERVICE_URL chưa được cấu hình/i.test(msg)) return '404 (Không tìm thấy dịch vụ AI)';
  if (!msg) return 'Không thể kết nối đến dịch vụ AI. Vui lòng kiểm tra hệ thống và thử lại.';
  return msg;
}

export function AiProvidersPage() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<AiConfig>(DEFAULT_CONFIG);
  const [uiMode, setUiMode] = useState<UiMode>('fake');
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // add form
  const [addKind, setAddKind] = useState<ProviderKind>('gemini');
  const [addName, setAddName] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('https://generativelanguage.googleapis.com');
  const [addModel, setAddModel] = useState('gemini-1.5-flash');
  const [addKey, setAddKey] = useState('');
  const [showAddKey, setShowAddKey] = useState(false);
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  const configQuery = useQuery({
    queryKey: ['admin', 'ai', 'config'],
    queryFn: () => adminRequest<{ config: AiConfig }>('/api/v1/admin/ai/config'),
    refetchOnWindowFocus: false,
  });

  const statusQuery = useQuery({
    queryKey: ['admin', 'ai', 'status'],
    queryFn: () => adminRequest<AiStatus>('/api/v1/admin/ai/status'),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (configQuery.data?.config && !isDirty) {
      const merged = { ...DEFAULT_CONFIG, ...configQuery.data.config };
      setConfig(merged);
      setUiMode(modeFromProvider(merged.provider));
      setEntries(normalizeEntriesFromConfig(merged));
    }
  }, [configQuery.data, isDirty]);

  useEffect(() => {
    if (addKind === 'gemini') {
      setAddBaseUrl('https://generativelanguage.googleapis.com');
      if (!addModel || addModel === 'gpt-4o-mini') setAddModel(config.geminiModel || 'gemini-1.5-flash');
    } else {
      if (addBaseUrl === 'https://generativelanguage.googleapis.com') setAddBaseUrl('https://openrouter.ai/api/v1');
      if (!addModel || addModel.startsWith('gemini-')) setAddModel(config.openaiModel || '');
    }
  }, [addKind]);

  const saveMutation = useMutation({
    mutationFn: (cfg: AiConfig) => adminRequest<any>('/api/v1/admin/ai/config', { method: 'PUT', body: JSON.stringify({ config: cfg }) }),
    onSuccess: async (data: any) => {
      if (data?.applied) {
        setSaveMsg('Đã lưu cấu hình và áp dụng thành công.');
      } else {
        const err = data?.applyError || 'Chưa thể áp dụng ngay. Cấu hình đã được lưu và sẽ được đồng bộ khi dịch vụ AI khả dụng.';
        setSaveMsg(`Đã lưu cấu hình. ${data?.applied === false ? err : ''}`.trim());
      }
      setIsDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin', 'ai', 'config'] }),
        qc.invalidateQueries({ queryKey: ['admin', 'ai', 'status'] }),
      ]);
    },
    onError: (err: any) => setSaveMsg(err?.problem?.detail || err?.message || 'Lưu cấu hình thất bại.'),
  });

  function updateConfig<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setIsDirty(true);
  }

  function buildConfigToSave(): AiConfig {
    const base = applyEntriesToConfig(config, entries);
    const provider = providerFromMode(uiMode);
    const chain = (base.failoverChain || 'gemini,openai,fake').trim() || 'gemini,openai,fake';
    // Ensure fake fallback exists for safety
    const normalizedChain = /(^|,)fake(,|$)/i.test(chain) ? chain : `${chain},fake`;
    return { ...base, provider, failoverChain: normalizedChain };
  }

  function handleSave() {
    setSaveMsg(null);
    saveMutation.mutate(buildConfigToSave());
  }

  function addEntry() {
    const key = addKey.trim();
    if (addKind === 'gemini' && !key) { setSaveMsg('Vui lòng nhập API Key cho Gemini.'); return; }
    if (addKind === 'openai' && !addBaseUrl.trim()) { setSaveMsg('Vui lòng nhập Base URL.'); return; }
    const entry: UnifiedEntry = {
      id: `${addKind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: addKind,
      name: addName.trim() || (addKind === 'gemini' ? 'Gemini' : 'OpenAI-compatible'),
      baseUrl: addKind === 'openai' ? addBaseUrl.trim() : undefined,
      model: addModel.trim() || (addKind === 'gemini' ? (config.geminiModel || 'gemini-1.5-flash') : ''),
      apiKey: key,
      enabled: true,
      sourceIndex: -1,
    };
    setEntries((prev) => [...prev, entry]);
    setAddName('');
    setAddKey('');
    setIsDirty(true);
    setSaveMsg('Đã thêm API vào danh sách. Bấm "Lưu cấu hình" để áp dụng.');
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setIsDirty(true);
    setTestMsg((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    setSaveMsg('Đã xóa API khỏi danh sách (chưa lưu). Bấm "Lưu cấu hình" để áp dụng.');
  }

  function toggleEntry(id: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
    setIsDirty(true);
  }

  function testEntry(id: string) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    if (!e.enabled) { setTestMsg((m) => ({ ...m, [id]: 'API đang tắt. Bật lại để sử dụng.' })); return; }
    if (e.apiKey === '********' || !e.apiKey) {
      setTestMsg((m) => ({ ...m, [id]: 'Chưa có khóa mới để kiểm tra trực tiếp. Khóa đã lưu sẽ được dùng khi gọi AI.' }));
      return;
    }
    // Không có endpoint kiểm tra từng khóa; phản hồi dựa trên trạng thái runtime hiện tại.
    const st = statusQuery.data;
    if (st?.ready) setTestMsg((m) => ({ ...m, [id]: 'Dịch vụ AI đang hoạt động. Lưu cấu hình rồi hệ thống sẽ dùng khóa này khi tới lượt.' }));
    else setTestMsg((m) => ({ ...m, [id]: friendlyStatusError(st, statusQuery.error) || 'Chưa kiểm tra được. Hãy làm mới trạng thái.' }));
  }

  const status = statusQuery.data;
  const totals = status?.totals;
  const totalReq = Number(totals?.requests ?? 0);
  const totalFail = Number(totals?.failures ?? 0);
  const errorRate = totalReq > 0 ? ((totalFail / totalReq) * 100).toFixed(1) : '0.0';
  const avgLatency = useMemo(() => {
    const rows = status?.providers || [];
    const vals = rows.map((p) => p.lastLatencyMs).filter((v): v is number => typeof v === 'number');
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [status]);

  const statusError = friendlyStatusError(status, statusQuery.error);
  const connected = !!status?.ready && !statusError;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cấu hình & Giám sát AI"
        description=""
      />

      {saveMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{saveMsg}</div>
      )}

      {/* BLOCK 1: full-width config + add */}
      <section className="panel space-y-4">
        <h2 className="panel-title">Cấu hình vận hành</h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="block text-xs text-slate-600">Chế độ hoạt động
            <select value={uiMode} onChange={(e) => { setUiMode(e.target.value as UiMode); setIsDirty(true); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
              <option value="fake">Giả lập an toàn (Fake)</option>
              <option value="rotate">Tự động luân phiên</option>
              <option value="priority">Ưu tiên theo thứ tự</option>
            </select>
          </label>
          <label className="block text-xs text-slate-600">Thứ tự ưu tiên
            <input value={config.failoverChain} onChange={(e) => updateConfig('failoverChain', e.target.value)} placeholder="gemini, openai, fake" className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-slate-600">Thời gian chờ tối đa (ms)
            <input type="number" value={config.timeoutMs} onChange={(e) => updateConfig('timeoutMs', Number(e.target.value) || 15000)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs text-slate-600">Thời gian nghỉ khi lỗi (giây)
            <input type="number" value={config.cooldownSec} onChange={(e) => updateConfig('cooldownSec', Number(e.target.value) || 60)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
          </label>
          <div className="flex">
            <button type="button" disabled={saveMutation.isPending} onClick={handleSave} className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Thêm API</h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <label className="block text-xs text-slate-600">Nhà cung cấp
              <select value={addKind} onChange={(e) => setAddKind(e.target.value as ProviderKind)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI-compatible / Local AI</option>
              </select>
            </label>
            <label className="block text-xs text-slate-600">Tên gợi nhớ
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={addKind === 'gemini' ? 'Gemini Free 1' : 'Local Ollama'} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600 md:col-span-1">Base URL
              <input value={addBaseUrl} onChange={(e) => setAddBaseUrl(e.target.value)} disabled={addKind === 'gemini'} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm disabled:opacity-70" />
            </label>
            <label className="block text-xs text-slate-600">Model
              <input value={addModel} onChange={(e) => setAddModel(e.target.value)} placeholder={addKind === 'gemini' ? 'gemini-1.5-flash' : 'llama3'} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600">API Key
              <div className="mt-1 flex items-center gap-2">
                <input type={showAddKey ? 'text' : 'password'} value={addKey} onChange={(e) => setAddKey(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
                <button type="button" onClick={() => setShowAddKey((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-600 hover:bg-slate-50" title={showAddKey ? 'Ẩn' : 'Hiện'}>
                  {showAddKey ? '🙈' : '👁'}
                </button>
              </div>
            </label>
            <div className="flex">
              <button type="button" onClick={addEntry} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Thêm API</button>
            </div>
          </div>
        </div>
      </section>

      {/* BLOCK 2 & 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: list */}
        <section className="panel lg:col-span-7 space-y-3">
          <h2 className="panel-title">Danh sách API đã cấu hình</h2>
          <div className="max-h-[420px] overflow-y-auto pr-2 space-y-2.5">
            {entries.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Chưa có API nào. Thêm API ở khối phía trên rồi bấm &quot;Lưu cấu hình&quot;.</div>
            ) : entries.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.kind === 'gemini' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                        {e.kind === 'gemini' ? 'Gemini' : 'OpenAI'}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 truncate">{e.name || 'Chưa đặt tên'}</span>
                      {e.model ? <span className="text-xs text-slate-600">Model: <span className="font-mono">{e.model}</span></span> : null}
                    </div>
                    <div className="text-xs text-slate-500">Key: <span className="font-mono">{maskKey(e.apiKey)}</span></div>
                    {testMsg[e.id] ? <div className="text-[11px] text-slate-600">{testMsg[e.id]}</div> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => toggleEntry(e.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border ${e.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {e.enabled ? 'Đang bật' : 'Tạm tắt'}
                    </button>
                    <button type="button" onClick={() => testEntry(e.id)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Test</button>
                    <button type="button" onClick={() => removeEntry(e.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100">Xóa</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: runtime status */}
        <section className="panel lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="panel-title">Trạng thái hoạt động AI</h2>
            <button type="button" onClick={() => void statusQuery.refetch()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Làm mới</button>
          </div>
          {isDirty ? <div className="text-[11px] text-amber-700">Có thay đổi chưa lưu. Bấm &quot;Lưu cấu hình&quot; để áp dụng.</div> : null}

          {statusQuery.isLoading ? <p className="text-sm text-slate-500">Đang tải trạng thái...</p> : null}

          <div className={`rounded-xl border p-3 text-sm ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
            <div className="font-semibold">{connected ? 'Đang hoạt động' : 'Mất kết nối'}</div>
            {!connected ? <div className="mt-1 text-xs">{statusError || 'Không thể kết nối đến dịch vụ AI. Vui lòng kiểm tra và thử lại.'}</div> : null}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Provider đang chạy</div><div className="mt-0.5 font-medium text-slate-800 truncate">{status?.provider || status?.configuredProvider || '—'}</div></div>
            <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Tổng số lượt gọi</div><div className="mt-0.5 font-mono text-slate-800">{totals?.requests ?? '—'}</div></div>
            <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Tỷ lệ lỗi</div><div className="mt-0.5 font-mono text-slate-800">{totalReq > 0 ? `${errorRate}%` : '—'}</div></div>
            <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Độ trễ trung bình</div><div className="mt-0.5 font-mono text-slate-800">{avgLatency != null ? `${avgLatency} ms` : '—'}</div></div>
          </div>

          {status?.providers && status.providers.length > 0 ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Nguồn</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Lỗi</th></tr></thead>
                <tbody>
                  {status.providers.map((p) => (
                    <tr key={p.key} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{p.key}</td>
                      <td className="px-3 py-2">{p.available ? 'Sẵn sàng' : 'Tạm nghỉ'}</td>
                      <td className="px-3 py-2 text-slate-600">{p.lastError ? 'Có lỗi gần đây' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {config.updatedAt ? <div className="text-[11px] text-slate-500">Lần lưu gần nhất: {new Date(config.updatedAt).toLocaleString('vi-VN')}</div> : null}
        </section>
      </div>
    </div>
  );
}
