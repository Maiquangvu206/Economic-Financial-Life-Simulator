import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import type { MacroSnapshotDto } from '@efls/contracts';

export function MacroDashboardPage() {
  const { data, isLoading, error, refetch } = useQuery<MacroSnapshotDto>({
    queryKey: ['admin', 'macro', 'snapshot'],
    queryFn: () => adminRequest<MacroSnapshotDto>('/api/v1/admin/macro/snapshot'),
    refetchInterval: 15000,
  });

  const moneySupply = Number(data?.moneySupply?.amount ?? 0);
  const marketCap = Number(data?.marketCap?.amount ?? 0);
  const inflation = Number(data?.inflationPct ?? 0);
  const cpi = Number(data?.cpi ?? 100);
  const ccu = Number(data?.concurrentUsers ?? 0);
  const cases = Number(data?.activeCourtCases ?? 0);
  const year = data?.inGameYear ?? 1;
  const tick = data?.tick ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard vĩ mô Việt Nam"
        description="Dữ liệu tổng hợp từ hệ thống (game_state, ledger, công ty niêm yết, nhân vật)."
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
        <AdminStat label="Tổng tiền lưu thông (ước tính)" value={isLoading ? '…' : formatCompact(moneySupply)} hint="Cộng số dư ledger (nhân vật/DN/quỹ…)" />
        <AdminStat label="Lạm phát" value={isLoading ? '…' : `${inflation.toFixed(2)}%`} hint="Theo macro game_state" />
        <AdminStat label="Chỉ số giá tiêu dùng (CPI)" value={isLoading ? '…' : cpi.toFixed(1)} hint="Năm gốc = 100" />
        <AdminStat label="Nhân vật sống (có user)" value={isLoading ? '…' : String(ccu)} hint="Số nhân vật còn sống gắn tài khoản" />
        <AdminStat label="Vốn hóa sàn (niêm yết)" value={isLoading ? '…' : formatCompact(marketCap)} hint="Tổng market cap công ty niêm yết" />
        <AdminStat label="Vụ án đang mở" value={isLoading ? '…' : String(cases)} tone={cases > 0 ? 'warning' : 'default'} hint="Court cases (nếu có)" />
        <AdminStat label="Tick (ngày game)" value={isLoading ? '…' : String(tick)} hint="Theo game_state.current_day" />
        <AdminStat label="Năm trong game" value={isLoading ? '…' : String(year)} hint="Theo game_state.current_year" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
            Các thay đổi cấu hình từ admin (phúc lợi, bầu cử, giáo dục, bản đồ, broadcast, cấu hình mùa) được lưu vào CSDL dùng chung và ảnh hưởng/hiển thị cho người dùng qua API & giao diện web-game.
          </p>
        </section>
      </div>
    </div>
  );
}
