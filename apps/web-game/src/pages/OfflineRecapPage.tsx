import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';
import { StatCard } from '../shared/ui/StatCard';
import { formatMoney } from '../shared/lib/format';

export function OfflineRecapPage() {
  return (
    <ModulePlaceholder
      title="Báo cáo Offline Recap"
      description="Tóm tắt thu nhập, chi phí, biến động cổ phiếu và sự kiện trong thời gian bạn offline."
      capabilities={[
        { title: 'Dòng tiền', body: 'Thu nhập và chi phí phát sinh theo từng tick.' },
        { title: 'Thị trường', body: 'Biến động giá cổ phiếu và chỉ số vĩ mô.' },
        { title: 'Sự kiện', body: 'Tin tức, cảnh báo nợ, đấu giá và pháp lý.' },
        { title: 'Tài sản', body: 'Thay đổi giá trị BĐS và doanh nghiệp.' },
      ]}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Thu nhập" value={formatMoney(0)} tone="positive" />
        <StatCard label="Chi phí" value={formatMoney(0)} tone="negative" />
        <StatCard label="Dòng tiền ròng" value={formatMoney(0)} />
        <StatCard label="Số tick offline" value="0" />
      </div>
    </ModulePlaceholder>
  );
}
