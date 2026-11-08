import { PageHeader } from '@efls/ui';
import { AdminStat } from '../shared/ui/AdminStat';
import { formatCompact } from '../shared/lib/format';

export function MacroDashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard vĩ mô Việt Nam"
        description="Tổng tiền lưu thông (VNĐ), lạm phát, CPI, vốn hóa thị trường và CCU."
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Đơn vị: VNĐ (₫)
            </span>
            <span className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600">
              Tick 0 · Năm 1
            </span>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Tổng tiền lưu thông (M2)"
          value={formatCompact(0)}
          hint="Cung tiền toàn hệ thống VNĐ"
        />
        <AdminStat label="Lạm phát" value="0.00%" hint="Theo năm in-game (Mục tiêu 4%)" />
        <AdminStat label="Chỉ số giá tiêu dùng (CPI)" value="100.0" hint="Năm gốc = 100" />
        <AdminStat label="CCU" value="0" hint="Người chơi online đồng thời" />
        <AdminStat label="Vốn hóa sàn HOSE/HNX" value={formatCompact(0)} hint="Giá trị niêm yết" />
        <AdminStat
          label="Vụ án kinh tế / Trốn thuế"
          value="0"
          tone="warning"
          hint="Pháp lý cơ quan thuế"
        />
        <AdminStat
          label="Tỷ lệ nợ xấu ngân hàng"
          value="0.00%"
          tone="negative"
          hint="Ngưỡng kiểm soát < 3%"
        />
        <AdminStat label="Heat truy quét trung bình" value="0 / 100" hint="Mức độ rủi ro chợ đen" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <h2 className="panel-title">Sự kiện kinh tế & Mùa vụ gần đây</h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Chưa có biến động bất thường. Hệ thống sẵn sàng điều phối các đợt kích cầu mùa Tết, hỗ
            trợ lãi suất ngân hàng thương mại hoặc càn quét buôn lậu.
          </p>
        </section>
        <section className="panel">
          <h2 className="panel-title">Hàng đợi game tick & Lịch làm việc</h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Worker đang điều phối chu kỳ 24 giờ. Đang áp dụng tiêu chuẩn Luật Lao động: 8 giờ/ngày,
            nghỉ Lễ có hưởng lương và chế độ OT 150% - 300%.
          </p>
        </section>
      </div>
    </div>
  );
}
