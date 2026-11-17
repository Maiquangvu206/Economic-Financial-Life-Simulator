import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@efls/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';
import { useDialog } from '../shared/ui/DialogContext';

type OpenAiEndpoint = { baseUrl: string; apiKey: string; model: string };

type AiConfig = {
  provider: string;
  failoverChain: string;
  cooldownSec: number;
  timeoutMs: number;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
  openaiEndpoints: OpenAiEndpoint[];
  geminiModel: string;
  geminiApiKey: string;
  geminiApiKeys: string[];
  updatedAt?: string | null;
  note?: string;
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
  lastUsedAt?: number | null;
};

type AiStatus = {
  ready: boolean;
  mode?: string;
  provider?: string;
  configuredProvider?: string;
  failoverChain?: string[];
  timeoutMs?: number;
  cooldownSec?: number;
  totals?: { requests?: number | null; successes?: number | null; failures?: number | null };
  providers?: ProviderStatus[];
  error?: string;
  detail?: any;
  fetchedAt?: string;
};

const DEFAULT_CONFIG: AiConfig = {
  provider: 'fake',
  failoverChain: 'openai,gemini,fake',
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

function fmtTime(ts?: number | null) {
  if (!ts) return '—';
  try { return new Date(ts * 1000).toLocaleString('vi-VN'); } catch { return '—'; }
}

export function AiProvidersPage() {
  const { alert } = useDialog();
  const qc = useQueryClient();
  const [config, setConfig] = useState<AiConfig>(DEFAULT_CONFIG);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['admin', 'ai', 'config'],
    queryFn: () => adminRequest<{ config: AiConfig; note?: string }>('/api/v1/admin/ai/config'),
  });

  const statusQuery = useQuery({
    queryKey: ['admin', 'ai', 'status'],
    queryFn: () => adminRequest<AiStatus>('/api/v1/admin/ai/status'),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (configQuery.data?.config) setConfig({ ...DEFAULT_CONFIG, ...configQuery.data.config });
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (cfg: AiConfig) => adminRequest('/api/v1/admin/ai/config', { method: 'PUT', body: JSON.stringify({ config: cfg }) }),
    onSuccess: async () => {
      setSaveMsg('Đã lưu cấu hình AI vào hệ thống (DB). Lưu ý: runtime AI service hiện tại có thể cần cập nhật biến môi trường và khởi động lại để áp dụng.');
      await qc.invalidateQueries({ queryKey: ['admin', 'ai', 'config'] });
    },
    onError: (err: any) => {
      setSaveMsg(err?.problem?.detail || err?.message || 'Lưu cấu hình thất bại.');
    },
  });

  const status = statusQuery.data;
  const totals = status?.totals;

  function update<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function addEndpoint() {
    update('openaiEndpoints', [...(config.openaiEndpoints || []), { baseUrl: 'https://', apiKey: '', model: '' }]);
  }
  function updateEndpoint(i: number, patch: Partial<OpenAiEndpoint>) {
    const next = [...(config.openaiEndpoints || [])];
    next[i] = { ...next[i], ...patch } as OpenAiEndpoint;
    update('openaiEndpoints', next);
  }
  function removeEndpoint(i: number) {
    const next = [...(config.openaiEndpoints || [])];
    next.splice(i, 1);
    update('openaiEndpoints', next);
  }

  function addGeminiKey() { update('geminiApiKeys', [...(config.geminiApiKeys || []), '']); }
  function updateGeminiKey(i: number, v: string) { const next = [...(config.geminiApiKeys || [])]; next[i] = v; update('geminiApiKeys', next); }
  function removeGeminiKey(i: number) { const next = [...(config.geminiApiKeys || [])]; next.splice(i, 1); update('geminiApiKeys', next); }

  const providerRows = status?.providers || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cấu hình & Giám sát AI Local/Free"
        description="Thiết lập chuỗi provider (luân phiên/failover, nhiều key/endpoint miễn phí) và theo dõi trạng thái hoạt động của AI service."
      />

      {saveMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{saveMsg}</div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="panel-title">Trạng thái runtime (AI Service)</h2>
            <button type="button" onClick={() => void statusQuery.refetch()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Làm mới</button>
          </div>

          {statusQuery.isLoading ? <p className="text-sm text-slate-500">Đang tải trạng thái...</p> : null}
          {statusQuery.error ? <p className="text-sm text-rose-600">Không tải được trạng thái: {(statusQuery.error as any)?.message || 'Lỗi'}</p> : null}

          {status && (
            <div className="space-y-3">
              <div className={`rounded-xl border p-3 text-sm ${status.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
                <div className="font-semibold">{status.ready ? 'AI service sẵn sàng' : 'AI service chưa sẵn sàng / không kết nối được'}</div>
                {status.error ? <div className="mt-1 text-xs">{status.error}</div> : null}
                <div className="mt-1 text-xs opacity-80">Mode: {status.mode || '—'} · Provider: {status.provider || status.configuredProvider || '—'} · Timeout: {status.timeoutMs ?? '—'}ms · Cooldown: {status.cooldownSec ?? '—'}s</div>
                {Array.isArray(status.failoverChain) && status.failoverChain.length > 0 ? <div className="mt-1 text-xs opacity-80">Chain: {status.failoverChain.join(' → ')}</div> : null}
                {status.fetchedAt ? <div className="mt-1 text-[11px] opacity-70">Cập nhật: {new Date(status.fetchedAt).toLocaleString('vi-VN')}</div> : null}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Tổng request</div><div className="mt-0.5 font-mono text-slate-800">{totals?.requests ?? '—'}</div></div>
                <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Thành công</div><div className="mt-0.5 font-mono text-emerald-700">{totals?.successes ?? '—'}</div></div>
                <div className="rounded-lg border border-slate-200 p-2"><div className="text-slate-500">Thất bại</div><div className="mt-0.5 font-mono text-rose-700">{totals?.failures ?? '—'}</div></div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Req/OK/Fail</th>
                      <th className="px-3 py-2">Latency</th>
                      <th className="px-3 py-2">Cooldown</th>
                      <th className="px-3 py-2">Lỗi gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-3 text-slate-500">Không có dữ liệu provider (có thể đang dùng provider đơn hoặc chưa kết nối được AI service).</td></tr>
                    ) : providerRows.map((p) => (
                      <tr key={p.key} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2 font-medium text-slate-800">{p.key}<div className="text-[11px] font-normal text-slate-500">{p.type}</div></td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.available ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.available ? 'Sẵn sàng' : 'Cooldown'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono">{p.requests ?? '—'}/{p.successes ?? '—'}/{p.failures ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{p.lastLatencyMs != null ? `${p.lastLatencyMs} ms` : '—'}</td>
                        <td className="px-3 py-2 font-mono">{p.cooldownSecRemaining ? `${p.cooldownSecRemaining}s` : '0s'}</td>
                        <td className="px-3 py-2 max-w-[260px] text-slate-600 break-words">{p.lastError || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            Mẹo: với server yếu, nên chạy model AI trên máy khác trong Tailscale/LAN và trỏ endpoint OpenAI-compatible. Dùng <b>router</b> để luân phiên nhiều API miễn phí và luôn giữ <b>fake</b> làm chốt an toàn.
          </div>
        </section>

        <section className="panel space-y-4">
          <h2 className="panel-title">Cấu hình AI (lưu vào hệ thống)</h2>
          <p className="text-xs text-slate-600">Cấu hình được lưu vào DB (macro) để quản lý tập trung. Runtime AI service hiện đọc biến môi trường khi khởi động; sau khi lưu, cập nhật env và khởi động lại AI service để áp dụng (hoặc triển khai đồng bộ động sau).</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-600">Chế độ provider
              <select value={config.provider} onChange={(e) => update('provider', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                <option value="fake">fake (an toàn, không gọi AI ngoài)</option>
                <option value="openai">openai (1 endpoint)</option>
                <option value="gemini">gemini (1 key)</option>
                <option value="router">router/failover (luân phiên nhiều nguồn)</option>
              </select>
            </label>
            <label className="block text-xs text-slate-600">Chuỗi failover (router)
              <input value={config.failoverChain} onChange={(e) => update('failoverChain', e.target.value)} placeholder="openai,gemini,fake" className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600">Timeout (ms)
              <input type="number" value={config.timeoutMs} onChange={(e) => update('timeoutMs', Number(e.target.value) || 15000)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600">Cooldown khi lỗi/quota (giây)
              <input type="number" value={config.cooldownSec} onChange={(e) => update('cooldownSec', Number(e.target.value) || 60)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800">OpenAI-compatible (1 endpoint mặc định)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">Base URL<input value={config.openaiBaseUrl} onChange={(e) => update('openaiBaseUrl', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="block text-xs text-slate-600">Model<input value={config.openaiModel} onChange={(e) => update('openaiModel', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" /></label>
            </div>
            <label className="block text-xs text-slate-600">API Key (để trống nếu endpoint local không cần)<input value={config.openaiApiKey} onChange={(e) => update('openaiApiKey', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" /></label>

            <div className="mt-2 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">Danh sách endpoint xoay vòng (router)</div><button type="button" onClick={addEndpoint} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">+ Thêm endpoint</button></div>
            <div className="space-y-2">
              {(config.openaiEndpoints || []).map((ep, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-3">
                  <input value={ep.baseUrl} onChange={(e) => updateEndpoint(i, { baseUrl: e.target.value })} placeholder="Base URL" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                  <input value={ep.apiKey} onChange={(e) => updateEndpoint(i, { apiKey: e.target.value })} placeholder="API Key (hoặc ********)" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                  <div className="flex gap-2"><input value={ep.model} onChange={(e) => updateEndpoint(i, { model: e.target.value })} placeholder="Model" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" /><button type="button" onClick={() => removeEndpoint(i)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs text-rose-700">Xóa</button></div>
                </div>
              ))}
              {(config.openaiEndpoints || []).length === 0 ? <div className="text-[11px] text-slate-500">Chưa có endpoint xoay vòng. Router sẽ dùng endpoint mặc định ở trên (nếu hợp lệ).</div> : null}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800">Gemini</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">Model<input value={config.geminiModel} onChange={(e) => update('geminiModel', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="block text-xs text-slate-600">API Key mặc định<input value={config.geminiApiKey} onChange={(e) => update('geminiApiKey', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-2 flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">Nhiều Gemini key (router)</div><button type="button" onClick={addGeminiKey} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50">+ Thêm key</button></div>
            <div className="space-y-2">
              {(config.geminiApiKeys || []).map((k, i) => (
                <div key={i} className="flex gap-2"><input value={k} onChange={(e) => updateGeminiKey(i, e.target.value)} placeholder="Gemini API Key (hoặc ********)" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" /><button type="button" onClick={() => removeGeminiKey(i)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs text-rose-700">Xóa</button></div>
              ))}
              {(config.geminiApiKeys || []).length === 0 ? <div className="text-[11px] text-slate-500">Chưa có danh sách key xoay vòng. Router sẽ dùng key mặc định ở trên (nếu có).</div> : null}
            </div>
          </div>

          <label className="block text-xs text-slate-600">Ghi chú vận hành
            <textarea value={config.note || ''} onChange={(e) => update('note', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(config)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60">
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
            <button type="button" onClick={() => setConfig(configQuery.data?.config ? { ...DEFAULT_CONFIG, ...configQuery.data.config } : DEFAULT_CONFIG)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Hoàn tác</button>
            {config.updatedAt ? <span className="text-[11px] text-slate-500">Lần lưu DB gần nhất: {new Date(config.updatedAt).toLocaleString('vi-VN')}</span> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
