import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact, formatMoney } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import type { MacroSnapshotDto, StateFundSnapshotDto, SupportCompaniesFromStateFundResponse } from '@efls/contracts';

export function MacroDashboardPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<MacroSnapshotDto>({
    queryKey: ['admin', 'macro', 'snapshot'],
    queryFn: () => adminRequest<MacroSnapshotDto>('/api/v1/admin/macro/snapshot'),
    refetchInterval: 15000,
  });

  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const [supportScope, setSupportScope] = useState<'all' | 'selected'>('all');
  const [supportTickers, setSupportTickers] = useState('');
  const [supportAmount, setSupportAmount] = useState('');
  const [supportReason, setSupportReason] = useState('');
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  const adjustFund = useMutation({
    mutationFn: (body: { deltaMinor: number; reason: string }) =>
      adminRequest<StateFundSnapshotDto>('/api/v1/admin/state-fund/adjust', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async (res) => {
      setMsg(`Đã cập nhật quỹ. Số dư hiện tại: ${formatMoney(res.balance.amount)} ₫`);
      setDelta('');
      setReason('');
      await qc.invalidateQueries({ queryKey: ['admin', 'macro', 'snapshot'] });
    },
    onError: (e: any) => {
      setMsg(e?.problem?.detail || e?.message || 'Không thể điều chỉnh quỹ đất nước.');
    },
  });

  const supportCompanies = useMutation({
    mutationFn: (body: { scope: 'all' | 'selected'; tickers?: string[]; amountPerCompanyMinor: number; reason: string }) =>
      adminRequest<SupportCompaniesFromStateFundResponse>('/api/v1/admin/state-fund/support-companies', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async (res) => {
      setSupportMsg(`Đã hỗ trợ ${res.supportedCompanies} công ty (${formatMoney(res.amountPerCompanyMinor)} ₫/CT), tổng ${formatMoney(res.totalSpentMinor)} ₫. Mã CK: ${res.tickers?.length ? res.tickers.join(', ') : '—'} (tác động ${res.boostedTickers} ticker). Số dư quỹ: ${formatMoney(res.balanceAfter.amount)} ₫`);
      setSupportAmount('');
      setSupportReason('');
      await qc.invalidateQueries({ queryKey: ['admin', 'macro', 'snapshot'] });
    },
    onError: (e: any) => {
      setSupportMsg(e?.problem?.detail || e?.message || 'Không thể hỗ trợ công ty từ quỹ đất nước.');
    },
  });

  const moneySupply = Number(data?.moneySupply?.amount ?? 0);
  const marketCap = Number(data?.marketCap?.amount ?? 0);
  const inflation = Number(data?.inflationPct ?? 0);
  const cpi = Number(data?.cpi ?? 100);
  const ccu = Number(data?.concurrentUsers ?? 0);
  const cases = Number(data?.activeCourtCases ?? 0);
  const year = data?.inGameYear ?? 1;
  const tick = data?.tick ?? 0;
  const stateFund = Number(data?.stateFundBalance?.amount ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tổng quan hệ thống"
        actions={
          <button type="button" onClick={() => refetch()} className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">Làm mới</button>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Không tải được dữ liệu vĩ mô: {(error as any)?.message || 'Lỗi'}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Quỹ đất nước" value={isLoading ? '…' : formatCompact(stateFund)} />
        <AdminStat label="Tổng tiền lưu thông" value={isLoading ? '…' : formatCompact(moneySupply)} />
        <AdminStat label="Lạm phát" value={isLoading ? '…' : `${inflation.toFixed(2)}%`} />
        <AdminStat label="Chỉ số giá tiêu dùng" value={isLoading ? '…' : cpi.toFixed(1)} />
        <AdminStat label="Nhân vật người chơi" value={isLoading ? '…' : String(ccu)} />
        <AdminStat label="Vốn hóa sàn" value={isLoading ? '…' : formatCompact(marketCap)} />
        <AdminStat label="Vụ án đang mở" value={isLoading ? '…' : String(cases)} tone={cases > 0 ? 'warning' : 'default'} />
        <AdminStat label="NGÀY GAME HIỆN TẠI" value={isLoading ? '…' : String(tick)} />
      </div>

      <div className="space-y-4">
        <section className="panel space-y-3">
          <h2 className="panel-title">Quỹ đất nước</h2>
          <div className="text-sm text-slate-700">
            Số dư hiện tại: <b className="text-emerald-700">{isLoading ? '…' : `${formatMoney(stateFund)} ₫`}</b>
          </div>

          <form
            className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Math.trunc(Number(delta));
              if (!Number.isFinite(v) || v === 0 || reason.trim().length < 3) {
                setMsg('Nhập số tiền điều chỉnh (khác 0, VNĐ) và lý do (≥ 3 ký tự).');
                return;
              }
              adjustFund.mutate({ deltaMinor: v, reason: reason.trim() });
            }}
          >
            <div className="text-xs font-semibold text-slate-700">Điều chỉnh quỹ</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-700">
                Số tiền điều chỉnh
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="VD: 100000000 hoặc -50000000"
                />
              </label>
              <label className="text-xs text-slate-700 sm:col-span-2">
                Lý do
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Lý do điều chỉnh quỹ đất nước..."
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={adjustFund.isPending}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {adjustFund.isPending ? 'Đang cập nhật...' : 'Cập nhật quỹ'}
            </button>
            {msg && <div className="text-xs text-slate-700">{msg}</div>}
          </form>

          <form
            className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = Math.trunc(Number(supportAmount));
              if (!Number.isFinite(amount) || amount <= 0 || supportReason.trim().length < 3) {
                setSupportMsg('Nhập số tiền hỗ trợ mỗi công ty (> 0) và lý do (≥ 3 ký tự).');
                return;
              }
              const tickers = supportTickers
                .split(/[,\s;]+/)
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
              if (supportScope === 'selected' && tickers.length === 0) {
                setSupportMsg('Nhập ít nhất một Mã chứng khoán (phân tách bằng dấu phẩy) hoặc chọn "Toàn bộ".');
                return;
              }
              supportCompanies.mutate({
                scope: supportScope,
                tickers: supportScope === 'selected' ? tickers : undefined,
                amountPerCompanyMinor: amount,
                reason: supportReason.trim(),
              });
            }}
          >
            <div className="text-xs font-semibold text-slate-700">Hỗ trợ công ty từ quỹ</div>
            
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-700">
                Phạm vi
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  value={supportScope}
                  onChange={(e) => setSupportScope(e.target.value as 'all' | 'selected')}
                >
                  <option value="all">Toàn bộ công ty đang hoạt động</option>
                  <option value="selected">Chỉ định công ty</option>
                </select>
              </label>
              <label className="text-xs text-slate-700">
                Số tiền mỗi công ty (VNĐ)
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  value={supportAmount}
                  onChange={(e) => setSupportAmount(e.target.value)}
                  placeholder="VD: 50000000"
                />
              </label>
              {supportScope === 'selected' && (
                <label className="text-xs text-slate-700 sm:col-span-2">
                  Mã chứng khoán công ty (phân tách bằng dấu phẩy)
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono uppercase"
                    rows={2}
                    value={supportTickers}
                    onChange={(e) => setSupportTickers(e.target.value)}
                    placeholder="VCB, FPT, ..."
                  />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    Chỉ áp dụng cho công ty đã niêm yết (có mã CK). Hỗ trợ sẽ cộng tiền vào quỹ công ty và tác động giá/khối lượng ticker tương ứng.
                  </span>
                </label>
              )}
              <label className="text-xs text-slate-700 sm:col-span-2">
                Lý do
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  placeholder="Lý do hỗ trợ doanh nghiệp / kích hoạt biến động..."
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={supportCompanies.isPending}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {supportCompanies.isPending ? 'Đang hỗ trợ...' : 'Hỗ trợ công ty từ quỹ'}
            </button>
            {supportMsg && <div className="text-xs text-slate-700">{supportMsg}</div>}
          </form>
        </section>
      </div>
    </div>
  );
}
