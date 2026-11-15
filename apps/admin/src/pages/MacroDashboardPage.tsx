import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact, formatMoney } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import type { MacroSnapshotDto, StateFundSnapshotDto } from '@efls/contracts';

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
        title="Dashboard vĩ mô Việt Nam"
        description="Dữ liệu tổng hợp từ hệ thống (game_state, ledger, công ty niêm yết, nhân vật) và quỹ đất nước."
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Đơn vị: VNĐ (₫)
            </span>
            <span className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600">
              Tick {tick} · Năm {year}
            </span>
            <button type="button" onClick={() => refetch()} className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">Làm mới</button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Không tải được dữ liệu vĩ mô: {(error as any)?.message || 'Lỗi'}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Quỹ đất nước" value={isLoading ? '…' : formatCompact(stateFund)} hint="Nguồn thu/chi phạt, thuế, đấu giá đất, phúc lợi, hỗ trợ thị trường" />
        <AdminStat label="Tổng tiền lưu thông (ước tính)" value={isLoading ? '…' : formatCompact(moneySupply)} hint="Cộng số dư ledger (nhân vật/DN/quỹ…)" />
        <AdminStat label="Lạm phát" value={isLoading ? '…' : `${inflation.toFixed(2)}%`} hint="Theo macro game_state" />
        <AdminStat label="Chỉ số giá tiêu dùng (CPI)" value={isLoading ? '…' : cpi.toFixed(1)} hint="Năm gốc = 100" />
        <AdminStat label="Nhân vật sống (có user)" value={isLoading ? '…' : String(ccu)} hint="Số nhân vật còn sống gắn tài khoản" />
        <AdminStat label="Vốn hóa sàn (niêm yết)" value={isLoading ? '…' : formatCompact(marketCap)} hint="Tổng market cap công ty niêm yết" />
        <AdminStat label="Vụ án đang mở" value={isLoading ? '…' : String(cases)} tone={cases > 0 ? 'warning' : 'default'} hint="Court cases (nếu có)" />
        <AdminStat label="Tick (ngày game)" value={isLoading ? '…' : String(tick)} hint="Theo game_state.current_day" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-3">
          <h2 className="panel-title">Quỹ đất nước (State Fund)</h2>
          <div className="text-sm text-slate-700">
            Số dư hiện tại: <b className="text-emerald-700">{isLoading ? '…' : `${formatMoney(stateFund)} ₫`}</b>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Quỹ nhận: tiền phạt, thuế (cá nhân/kiểm toán, giấy phép), phí tranh cử & quyên góp, tiền đấu giá đất nền chưa chủ, phí/thuế xây dựng (theo các luồng đã tích hợp).
            Quỹ chi: phúc lợi cố định và gói phúc lợi do thị trưởng ban hành, cùng các khoản hỗ trợ thị trường (khi được cấu hình).
          </p>
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
            <div className="text-xs font-semibold text-slate-700">Điều chỉnh quỹ (admin)</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-700">
                Số tiền điều chỉnh (VNĐ, âm để trừ)
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
        </section>

        <div className="space-y-4">
          <section className="panel">
            <h2 className="panel-title">Trạng thái dữ liệu</h2>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Bảng điều khiển đang đọc dữ liệu thực từ hệ thống. Một số chỉ số (lạm phát/CPI) lấy từ `game_state.macro` nếu đã được worker/GM cập nhật; nếu chưa có sẽ hiển thị mặc định.
              {data?.generatedAt ? ` Cập nhật: ${new Date(data.generatedAt).toLocaleString('vi-VN')}.` : ''}
            </p>
          </section>
          <section className="panel">
            <h2 className="panel-title">Ghi chú vận hành</h2>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Các thay đổi cấu hình từ admin (phúc lợi, bầu cử, giáo dục, bản đồ, broadcast, cấu hình mùa, quỹ đất nước) được lưu vào CSDL dùng chung và ảnh hưởng/hiển thị cho người dùng qua API & giao diện web-game.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
