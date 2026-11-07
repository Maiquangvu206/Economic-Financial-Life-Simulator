import { PageHeader } from '@efls/ui';
import { AdminStat } from '../shared/ui/AdminStat';

export function MacroDashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard vĩ mô"
        description="Tổng tiền lưu thông, lạm phát, CPI, vốn hóa thị trường và CCU."
        actions={
          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">
            Tick 0 · Năm 1
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Tổng tiền lưu thông" value="$0" hint="Money supply" />
        <AdminStat label="Lạm phát" value="0.00%" hint="Theo năm in-game" />
        <AdminStat label="CPI" value="100.0" />
        <AdminStat label="CCU" value="0" hint="Concurrent users" />
        <AdminStat label="Vốn hóa sàn CK" value="$0" />
        <AdminStat label="Vụ án đang mở" value="0" tone="warning" />
        <AdminStat label="Tỷ lệ nợ xấu" value="0.00%" tone="negative" />
        <AdminStat label="Heat trung bình" value="0 / 100" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <h2 className="panel-title">Sự kiện vĩ mô gần đây</h2>
          <p className="mt-2 text-xs text-slate-500">
            Chưa có sự kiện. GM AI và admin có thể kích hoạt khủng hoảng ngân hàng, dịch bệnh hoặc
            càn quét tội phạm.
          </p>
        </section>
        <section className="panel">
          <h2 className="panel-title">Hàng đợi tick</h2>
          <p className="mt-2 text-xs text-slate-500">
            Worker đang chờ cấu hình Redis/BullMQ. Tick mặc định 24 giờ thực = 1 năm trong game.
          </p>
        </section>
      </div>
    </div>
  );
}
