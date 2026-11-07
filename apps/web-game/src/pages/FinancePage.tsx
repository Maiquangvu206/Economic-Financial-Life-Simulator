import { ModulePlaceholder } from '../shared/ui/ModulePlaceholder';
import { StatCard } from '../shared/ui/StatCard';
import { formatMoney } from '../shared/lib/format';

export function FinancePage() {
  return (
    <ModulePlaceholder
      title="Trung tâm Tài chính & Ngân hàng"
      description="Bảng cân đối tài sản/nợ, dòng tiền, gửi tiết kiệm, vay thế chấp và cầm cố P2P."
      capabilities={[
        { title: 'Bảng cân đối', body: 'Tài sản, nợ phải trả, tài sản ròng theo từng kỳ tick.' },
        { title: 'Dòng tiền', body: 'Thu nhập, chi phí cố định, lãi vay và lịch trả nợ.' },
        { title: 'Tín dụng', body: 'Credit score, hạn mức vay và lãi suất theo rủi ro.' },
        { title: 'Grace period', body: 'Cảnh báo nợ xấu, phí phạt và tiến trình phát mại.' },
        { title: 'P2P lending', body: 'Cho vay giữa người chơi với tài sản bảo đảm.' },
        { title: 'Tiết kiệm', body: 'Gửi/rút, lãi kép và kỳ hạn.' },
      ]}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng tài sản" value={formatMoney(0)} />
        <StatCard label="Tổng nợ" value={formatMoney(0)} tone="negative" />
        <StatCard label="Tài sản ròng" value={formatMoney(0)} tone="positive" />
        <StatCard label="Credit Score" value="650" hint="Fair" />
      </div>
    </ModulePlaceholder>
  );
}
