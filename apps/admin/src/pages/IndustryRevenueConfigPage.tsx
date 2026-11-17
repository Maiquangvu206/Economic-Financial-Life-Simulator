import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type IndustryRevenueConfig = {
  industryType: string;
  monthlyRatePct: number;
  minRevenueMinor: number;
  maxRevenueMinor: number;
  updatedAt?: string | null;
};

const INDUSTRY_LABELS: Record<string, string> = {
  real_estate: 'Bất động sản',
  finance_banking: 'Tài chính - Ngân hàng',
  technology_ai: 'Công nghệ & AI',
  agritech: 'Nông nghiệp công nghệ cao',
  healthcare_pharma: 'Y tế & Dược phẩm',
  entertainment_media: 'Giải trí & Truyền thông',
  logistics: 'Logistics & Vận tải',
  energy_mining: 'Năng lượng & Khai khoáng',
  education: 'Giáo dục',
  underworld_services: 'Dịch vụ thế giới ngầm',
};

function toNum(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function IndustryRevenueConfigPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<IndustryRevenueConfig[]>({
    queryKey: ['admin', 'industry-revenue-configs'],
    queryFn: () => adminRequest<IndustryRevenueConfig[]>('/api/v1/admin/industry-revenue-configs'),
  });

  const [rows, setRows] = useState<IndustryRevenueConfig[]>([]);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setRows(
      [...data]
        .sort((a, b) => (INDUSTRY_LABELS[a.industryType] || a.industryType).localeCompare(INDUSTRY_LABELS[b.industryType] || b.industryType, 'vi'))
        .map((r) => ({
          industryType: r.industryType,
          monthlyRatePct: Number(r.monthlyRatePct ?? 0),
          minRevenueMinor: Math.max(0, Math.trunc(Number(r.minRevenueMinor ?? 0))),
          maxRevenueMinor: Math.max(0, Math.trunc(Number(r.maxRevenueMinor ?? 0))),
          updatedAt: r.updatedAt ?? null,
        })),
    );
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: { configs: Array<{ industryType: string; monthlyRatePct: number; minRevenueMinor: number; maxRevenueMinor: number }> }) =>
      adminRequest<IndustryRevenueConfig[]>('/api/v1/admin/industry-revenue-configs', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      qc.setQueryData(['admin', 'industry-revenue-configs'], res);
      setStatus({ type: 'ok', text: 'Đã lưu cấu hình doanh thu tự động 30 ngày theo ngành.' });
      setTimeout(() => setStatus(null), 3500);
    },
    onError: (e: any) => {
      setStatus({ type: 'err', text: e?.problem?.detail || e?.message || 'Không thể lưu cấu hình.' });
    },
  });

  const preview = useMemo(() => {
    const base = 100_000_000;
    return rows.map((r) => {
      const raw = Math.round(base * (Number(r.monthlyRatePct || 0) / 100));
      let clamped = raw;
      if (r.minRevenueMinor > 0) clamped = Math.max(clamped, r.minRevenueMinor);
      if (r.maxRevenueMinor > 0) clamped = Math.min(clamped, r.maxRevenueMinor);
      return { industryType: r.industryType, raw, clamped };
    });
  }, [rows]);

  function updateRow(idx: number, patch: Partial<IndustryRevenueConfig>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    for (const r of rows) {
      if (!Number.isFinite(r.monthlyRatePct) || r.monthlyRatePct < 0) {
        setStatus({ type: 'err', text: `Tỉ lệ % không hợp lệ cho ${INDUSTRY_LABELS[r.industryType] || r.industryType}.` });
        return;
      }
      if (r.maxRevenueMinor > 0 && r.maxRevenueMinor < r.minRevenueMinor) {
        setStatus({ type: 'err', text: `Max phải >= Min cho ${INDUSTRY_LABELS[r.industryType] || r.industryType}.` });
        return;
      }
    }
    mutation.mutate({
      configs: rows.map((r) => ({
        industryType: r.industryType,
        monthlyRatePct: Number(r.monthlyRatePct),
        minRevenueMinor: Math.max(0, Math.trunc(Number(r.minRevenueMinor))),
        maxRevenueMinor: Math.max(0, Math.trunc(Number(r.maxRevenueMinor))),
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Doanh thu công ty</h1>
      </div>

      {status && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${status.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {status.type === 'ok' ? '✓ ' : '⚠ '}{status.text}
        </div>
      )}
      {isLoading && <div className="text-sm text-slate-500">Đang tải cấu hình...</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được cấu hình: {(error as any)?.problem?.detail || (error as any)?.message || 'Lỗi'}</div>}

      <form onSubmit={onSave} className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Ngành</th>
                  <th className="px-3 py-2 text-left font-semibold">Tỉ lệ % / 30 ngày</th>
                  <th className="px-3 py-2 text-left font-semibold">Min doanh thu (₫)</th>
                  <th className="px-3 py-2 text-left font-semibold">Max doanh thu (₫, 0 = không giới hạn)</th>
                  <th className="px-3 py-2 text-left font-semibold">Ước tính (base 100tr, chưa tính mùa)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const p = preview.find((x) => x.industryType === r.industryType);
                  return (
                    <tr key={r.industryType} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {INDUSTRY_LABELS[r.industryType] || r.industryType}
                        <div className="text-[10px] font-mono text-slate-500">{r.industryType}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.monthlyRatePct}
                          onChange={(e) => updateRow(idx, { monthlyRatePct: toNum(e.target.value, 0) })}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={r.minRevenueMinor}
                          onChange={(e) => updateRow(idx, { minRevenueMinor: Math.max(0, Math.trunc(toNum(e.target.value, 0))) })}
                          className="w-40 rounded-lg border border-slate-300 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={r.maxRevenueMinor}
                          onChange={(e) => updateRow(idx, { maxRevenueMinor: Math.max(0, Math.trunc(toNum(e.target.value, 0))) })}
                          className="w-40 rounded-lg border border-slate-300 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        <div>Raw: <b>{(p?.raw ?? 0).toLocaleString('vi-VN')} ₫</b></div>
                        <div className="text-emerald-700">Sau clamp: <b>{(p?.clamped ?? 0).toLocaleString('vi-VN')} ₫</b></div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">Chưa có cấu hình ngành.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={mutation.isPending || rows.length === 0} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60">
              {mutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình ngành'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
