import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type Ticker = { id: string; companyId: string; symbol: string; companyName: string; currentPrice: { amount: number } };
type MarketLog = {
  id: string;
  adminId: string | null;
  scope: 'ALL_MARKET' | 'SPECIFIC_COMPANIES';
  targetIds: string[];
  mode: 'INSTANT_SHOCK' | 'TREND_BIAS';
  deltaPct: number;
  durationHours: number | null;
  reason: string;
  createdAt: string;
};

function fmtMoney(n: number) {
  return `${Math.trunc(Number(n || 0)).toLocaleString('vi-VN')} ₫`;
}

export function StockMarketControlPage() {
  const qc = useQueryClient();
  const { data: tickers = [], isLoading: loadingTickers } = useQuery<Ticker[]>({
    queryKey: ['admin', 'stock-tickers'],
    queryFn: () => adminRequest<Ticker[]>('/api/v1/stock-market/tickers'),
  });
  const { data: logs = [], isLoading: loadingLogs } = useQuery<MarketLog[]>({
    queryKey: ['admin', 'stock-market-logs'],
    queryFn: () => adminRequest<MarketLog[]>('/api/v1/admin/stock-market/logs?limit=100'),
  });

  const [mode, setMode] = useState<'INSTANT_SHOCK' | 'TREND_BIAS'>('INSTANT_SHOCK');
  const [scope, setScope] = useState<'ALL_MARKET' | 'SPECIFIC_COMPANIES'>('ALL_MARKET');
  const [deltaPct, setDeltaPct] = useState('5');
  const [durationHours, setDurationHours] = useState('24');
  const [reason, setReason] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [q, setQ] = useState('');

  const filteredTickers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return tickers;
    return tickers.filter((t) => t.symbol.toLowerCase().includes(qq) || t.companyName.toLowerCase().includes(qq));
  }, [tickers, q]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      adminRequest('/api/v1/admin/stock-market/adjust-price', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async (res: any) => {
      setStatus({ type: 'ok', text: `Đã thực thi ${res?.mode || mode}. Ảnh hưởng ${res?.affectedTickers ?? 0} mã.` });
      setReason('');
      await qc.invalidateQueries({ queryKey: ['admin', 'stock-market-logs'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'stock-tickers'] });
      setTimeout(() => setStatus(null), 3500);
    },
    onError: (e: any) => setStatus({ type: 'err', text: e?.problem?.detail || e?.message || 'Thao tác thất bại.' }),
  });

  function toggleCompany(id: string) {
    setSelectedCompanyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const d = Number(deltaPct);
    if (!Number.isFinite(d) || d < -50 || d > 50) return setStatus({ type: 'err', text: 'delta_pct phải trong khoảng -50 đến +50.' });
    if (!reason.trim()) return setStatus({ type: 'err', text: 'Vui lòng nhập lý do.' });
    if (scope === 'SPECIFIC_COMPANIES' && selectedCompanyIds.length === 0) return setStatus({ type: 'err', text: 'Chọn ít nhất một công ty.' });
    if (mode === 'TREND_BIAS' && (!Number(durationHours) || Number(durationHours) <= 0)) return setStatus({ type: 'err', text: 'TREND_BIAS cần thời lượng (giờ) > 0.' });

    mutation.mutate({
      mode,
      scope,
      deltaPct: d,
      companyIds: scope === 'SPECIFIC_COMPANIES' ? selectedCompanyIds : [],
      durationHours: mode === 'TREND_BIAS' ? Math.max(1, Math.trunc(Number(durationHours))) : undefined,
      reason: reason.trim(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Điều chỉnh giá thị trường chứng khoán</h1>
      </div>

      {status && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${status.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {status.type === 'ok' ? '✓ ' : '⚠ '}{status.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Thao tác điều chỉnh</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-700">
              Chế độ
              <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                <option value="INSTANT_SHOCK">Điều chỉnh tức thời</option>
                <option value="TREND_BIAS">Xu hướng kéo dài</option>
              </select>
            </label>
            <label className="block text-xs text-slate-700">
              Phạm vi
              <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" value={scope} onChange={(e) => setScope(e.target.value as any)}>
                <option value="ALL_MARKET">Toàn thị trường</option>
                <option value="SPECIFIC_COMPANIES">SPECIFIC_COMPANIES (mã cụ thể)</option>
              </select>
            </label>
            <label className="block text-xs text-slate-700">
              Mức điều chỉnh (%)
              <input type="number" step="0.1" min={-50} max={50} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" value={deltaPct} onChange={(e) => setDeltaPct(e.target.value)} />
            </label>
            <label className="block text-xs text-slate-700">
              Thời lượng (giờ — áp dụng cho Xu hướng kéo dài)
              <input type="number" min={1} step={1} disabled={mode !== 'TREND_BIAS'} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-slate-700">
            Lý do
            <textarea className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Điều chỉnh do sự kiện vĩ mô..." />
          </label>

          {scope === 'SPECIFIC_COMPANIES' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Chọn mã/công ty ({selectedCompanyIds.length} đã chọn)</p>
                <input className="rounded-lg border border-slate-300 px-2 py-1 text-xs" placeholder="Tìm mã/tên..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {loadingTickers ? (
                  <div className="p-3 text-xs text-slate-500">Đang tải mã...</div>
                ) : filteredTickers.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">Không có mã IPO phù hợp.</div>
                ) : filteredTickers.map((t) => (
                  <label key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={selectedCompanyIds.includes(t.companyId)} onChange={() => toggleCompany(t.companyId)} />
                      <span className="font-mono font-semibold text-slate-800">{t.symbol}</span>
                      <span className="truncate text-slate-600">{t.companyName}</span>
                    </span>
                    <span className="text-slate-500 whitespace-nowrap">{fmtMoney(t.currentPrice?.amount ?? 0)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60">
              {mutation.isPending ? 'Đang thực thi...' : mode === 'INSTANT_SHOCK' ? 'Áp dụng điều chỉnh tức thời' : 'Tạo trend bias'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">NHẬT KÝ ĐIỀU CHỈNH</h2>
            <button type="button" onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'stock-market-logs'] })} className="text-xs text-slate-600 hover:text-slate-900">Tải lại</button>
          </div>
          {loadingLogs ? (
            <div className="text-sm text-slate-500">Đang tải log...</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-slate-500">Chưa có thao tác điều chỉnh nào.</div>
          ) : (
            <div className="max-h-[560px] overflow-auto space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 font-semibold ${l.mode === 'INSTANT_SHOCK' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>{l.mode === 'INSTANT_SHOCK' ? 'Điều chỉnh tức thời' : 'Xu hướng kéo dài'}</span>
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700">{l.scope === 'ALL_MARKET' ? 'Toàn thị trường' : 'Mã cụ thể'}</span>
                      <span className={`font-mono font-bold ${l.deltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{l.deltaPct >= 0 ? '+' : ''}{l.deltaPct}%</span>
                      {l.durationHours != null && <span className="text-slate-600">{l.durationHours}h</span>}
                    </div>
                    <span className="text-slate-500">{new Date(l.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="text-slate-700"><b>Lý do:</b> {l.reason.replace('?i?u ch?nh th? nghi?m', 'Điều chỉnh thử nghiệm')}</div>
                  <div className="text-slate-500">Phạm vi: {l.scope === 'ALL_MARKET' ? 'Toàn thị trường' : `${l.targetIds?.length ?? 0} công ty`} · Quản trị viên</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
