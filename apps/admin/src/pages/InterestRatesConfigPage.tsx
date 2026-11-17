import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminRequest } from '../shared/api/httpClient';

type SavingsTerm = {
  termMonths: number;
  annualRatePct: number;
  earlyWithdrawPenaltyPct: number;
  label: string;
};

type AccountTierThresholds = {
  standard: number;
  silver: number;
  gold: number;
  platinum: number;
  diamond: number;
};

type InterestRateConfig = {
  loanBaseRatePct: number;
  savingsTerms: SavingsTerm[];
  accountTierThresholds?: AccountTierThresholds;
};

function parseNum(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtVnd(n: number) {
  return `${Math.trunc(Number(n || 0)).toLocaleString('vi-VN')} ₫`;
}

export function InterestRatesConfigPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<InterestRateConfig>({
    queryKey: ['admin', 'interest-rates'],
    queryFn: () => adminRequest<InterestRateConfig>('/api/v1/admin/interest-rates'),
  });

  const [loanBaseRatePct, setLoanBaseRatePct] = useState<string>('5');
  const [terms, setTerms] = useState<SavingsTerm[]>([]);
  const [tier, setTier] = useState<AccountTierThresholds>({
    standard: 0,
    silver: 50_000_000,
    gold: 200_000_000,
    platinum: 1_000_000_000,
    diamond: 5_000_000_000,
  });
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setLoanBaseRatePct(String(data.loanBaseRatePct ?? 5));
    setTerms(
      (data.savingsTerms ?? [])
        .slice()
        .sort((a, b) => a.termMonths - b.termMonths)
        .map((t) => ({
          termMonths: Number(t.termMonths ?? 0),
          annualRatePct: Number(t.annualRatePct ?? 0),
          earlyWithdrawPenaltyPct: Number(t.earlyWithdrawPenaltyPct ?? 0),
          label: String(t.label ?? ''),
        })),
    );
    const th = data.accountTierThresholds;
    setTier({
      standard: 0,
      silver: Number(th?.silver ?? 50_000_000),
      gold: Number(th?.gold ?? 200_000_000),
      platinum: Number(th?.platinum ?? 1_000_000_000),
      diamond: Number(th?.diamond ?? 5_000_000_000),
    });
  }, [data]);

  const savingsPreview = useMemo(() => {
    const principal = 100_000_000;
    return terms
      .slice()
      .sort((a, b) => a.termMonths - b.termMonths)
      .map((t) => {
        const months = Math.max(0, t.termMonths);
        const interest = months === 0 ? 0 : Math.round(principal * (t.annualRatePct / 100) * (months / 12));
        return { ...t, interest };
      });
  }, [terms]);

  const mutation = useMutation({
    mutationFn: (payload: InterestRateConfig) =>
      adminRequest<InterestRateConfig>('/api/v1/admin/interest-rates', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      qc.setQueryData(['admin', 'interest-rates'], res);
      setStatus({ type: 'ok', text: 'Đã lưu cấu hình lãi suất, tiết kiệm và ngưỡng cấp bậc tài khoản.' });
      setTimeout(() => setStatus(null), 3500);
    },
    onError: (e: any) => {
      const msg = e?.problem?.detail || e?.message || 'Không thể lưu cấu hình.';
      setStatus({ type: 'err', text: msg });
    },
  });

  function updateTerm(idx: number, patch: Partial<SavingsTerm>) {
    setTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTerm() {
    const nextMonth = terms.length ? Math.max(...terms.map((t) => t.termMonths)) + 1 : 0;
    setTerms((prev) => [...prev, { termMonths: nextMonth, annualRatePct: 1, earlyWithdrawPenaltyPct: 0, label: `${nextMonth} tháng` }]);
  }

  function removeTerm(idx: number) {
    setTerms((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const loan = parseNum(loanBaseRatePct, NaN);
    if (!Number.isFinite(loan) || loan < 0 || loan > 100) {
      setStatus({ type: 'err', text: 'Lãi suất cơ sở cho vay phải từ 0 đến 100 (%/năm).' });
      return;
    }
    const normalized = terms.map((t) => ({
      termMonths: Math.max(0, Math.trunc(parseNum(String(t.termMonths), 0))),
      annualRatePct: Math.max(0, parseNum(String(t.annualRatePct), 0)),
      earlyWithdrawPenaltyPct: Math.max(0, parseNum(String(t.earlyWithdrawPenaltyPct), 0)),
      label: String(t.label ?? '').trim() || `${Math.max(0, Math.trunc(parseNum(String(t.termMonths), 0)))} tháng`,
    }));
    const seen = new Set<number>();
    for (const t of normalized) {
      if (seen.has(t.termMonths)) {
        setStatus({ type: 'err', text: `Kỳ hạn ${t.termMonths} tháng bị trùng. Vui lòng kiểm tra lại.` });
        return;
      }
      seen.add(t.termMonths);
    }
    if (normalized.length === 0) {
      setStatus({ type: 'err', text: 'Cần ít nhất một kỳ hạn tiết kiệm.' });
      return;
    }
    const tierPayload: AccountTierThresholds = {
      standard: 0,
      silver: Math.max(0, Math.trunc(parseNum(String(tier.silver), 0))),
      gold: Math.max(0, Math.trunc(parseNum(String(tier.gold), 0))),
      platinum: Math.max(0, Math.trunc(parseNum(String(tier.platinum), 0))),
      diamond: Math.max(0, Math.trunc(parseNum(String(tier.diamond), 0))),
    };
    mutation.mutate({ loanBaseRatePct: loan, savingsTerms: normalized, accountTierThresholds: tierPayload });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cấu hình lãi suất</h1>
      </div>

      {status && (
        <div className={`rounded-xl border p-3 text-xs font-semibold ${status.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {status.type === 'ok' ? '✓ ' : '⚠ '}{status.text}
        </div>
      )}
      {isLoading && <div className="text-sm text-slate-500">Đang tải cấu hình lãi suất...</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Không tải được cấu hình: {(error as any)?.problem?.detail || (error as any)?.message || 'Lỗi'}</div>}

      <form onSubmit={onSave} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">1. Lãi suất vay ngân hàng</h2>
          <div className="grid gap-3 sm:grid-cols-[260px,1fr] items-end">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Lãi suất cơ sở cho vay (%/năm)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={loanBaseRatePct}
                onChange={(e) => setLoanBaseRatePct(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
            <div className="text-xs text-slate-600">
              Giá trị hiện hành trong hệ thống: <b>{Number(data?.loanBaseRatePct ?? 5).toLocaleString('vi-VN')}%/năm</b>.
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-sky-700 uppercase tracking-wider">2. Cấp bậc tài khoản</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {([
              { key: 'standard', label: 'Thường', disabled: true },
              { key: 'silver', label: 'Bạc', disabled: false },
              { key: 'gold', label: 'Vàng', disabled: false },
              { key: 'platinum', label: 'Bạch Kim', disabled: false },
              { key: 'diamond', label: 'Kim Cương', disabled: false },
            ] as const).map((item) => (
              <label key={item.key} className="block rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.key === 'standard' ? 0 : tier[item.key]}
                  disabled={item.disabled}
                  onChange={(e) => {
                    if (item.key === 'standard') return;
                    setTier((prev) => ({ ...prev, [item.key]: Math.max(0, Math.trunc(parseNum(e.target.value, 0))) } as AccountTierThresholds));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:bg-slate-100"
                />
                <div className="mt-1 text-[10px] text-slate-500">≥ {fmtVnd(item.key === 'standard' ? 0 : tier[item.key])}</div>
              </label>
            ))}
          </div>
          <div className="text-[11px] text-slate-500">Gợi ý: giữ ngưỡng tăng dần (Thường ≤ Bạc ≤ Vàng ≤ Bạch Kim ≤ Kim Cương) để phân hạng rõ ràng.</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">3. Lãi suất gửi tiết kiệm</h2>
            </div>
            <button type="button" onClick={addTerm} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              + Thêm kỳ hạn
            </button>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Kỳ hạn (tháng)</th>
                  <th className="px-3 py-2 text-left font-semibold">Nhãn hiển thị</th>
                  <th className="px-3 py-2 text-left font-semibold">Lãi suất (%/năm)</th>
                  <th className="px-3 py-2 text-left font-semibold">Phạt rút trước hạn (%)</th>
                  <th className="px-3 py-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {terms.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">Chưa có kỳ hạn nào. Hãy thêm kỳ hạn tiết kiệm.</td></tr>
                ) : terms
                  .slice()
                  .sort((a, b) => a.termMonths - b.termMonths)
                  .map((t) => {
                    const idx = terms.indexOf(t);
                    return (
                      <tr key={`${t.termMonths}-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={360}
                            step={1}
                            value={t.termMonths}
                            onChange={(e) => updateTerm(idx, { termMonths: Math.max(0, Math.trunc(parseNum(e.target.value, 0))) })}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
                          />
                          <div className="text-[10px] text-slate-500 mt-0.5">{t.termMonths === 0 ? 'Không kỳ hạn' : `${t.termMonths} tháng`}</div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={t.label}
                            onChange={(e) => updateTerm(idx, { label: e.target.value })}
                            className="w-48 max-w-full rounded-lg border border-slate-300 px-2 py-1.5"
                            placeholder="VD: 6 tháng"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.001"
                            value={t.annualRatePct}
                            onChange={(e) => updateTerm(idx, { annualRatePct: parseNum(e.target.value, 0) })}
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.001"
                            value={t.earlyWithdrawPenaltyPct}
                            onChange={(e) => updateTerm(idx, { earlyWithdrawPenaltyPct: parseNum(e.target.value, 0) })}
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeTerm(idx)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-100">
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">Xem nhanh (ước tính lãi đơn cho 100.000.000 ₫ theo kỳ hạn)</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {savingsPreview.map((t, i) => (
                <div key={`${t.termMonths}-${i}`} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                  <div className="font-semibold text-slate-800">{t.label || `${t.termMonths} tháng`}</div>
                  <div className="text-slate-600 mt-0.5">Lãi suất: <b>{t.annualRatePct}%/năm</b></div>
                  <div className="text-slate-600">Phạt rút trước hạn: <b>{t.earlyWithdrawPenaltyPct}%</b></div>
                  <div className="text-emerald-700 mt-1">Lãi ước tính: <b>{t.interest.toLocaleString('vi-VN')} ₫</b>{t.termMonths === 0 ? ' (không kỳ hạn: tùy thời gian gửi thực tế)' : ''}</div>
                </div>
              ))}
              {savingsPreview.length === 0 && <div className="text-xs text-slate-500">Chưa có dữ liệu kỳ hạn.</div>}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (data) {
                setLoanBaseRatePct(String(data.loanBaseRatePct ?? 5));
                setTerms((data.savingsTerms ?? []).slice().sort((a,b)=>a.termMonths-b.termMonths));
                const th = data.accountTierThresholds;
                setTier({
                  standard: 0,
                  silver: Number(th?.silver ?? 50_000_000),
                  gold: Number(th?.gold ?? 200_000_000),
                  platinum: Number(th?.platinum ?? 1_000_000_000),
                  diamond: Number(th?.diamond ?? 5_000_000_000),
                });
              }
              setStatus(null);
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hoàn tác thay đổi
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {mutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </form>
    </div>
  );
}
