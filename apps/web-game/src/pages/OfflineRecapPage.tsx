import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { Badge } from '../shared/ui/Badge';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type TickerDto } from '@efls/contracts';

export function OfflineRecapPage() {
  const { data: tickers, isLoading } = useQuery<TickerDto[]>({
    queryKey: ['offline-recap', 'tickers'],
    queryFn: () => apiRequest<TickerDto[]>('/api/v1/stock-market/tickers'),
  });

  // Dữ liệu mẫu để minh họa báo cáo offline (sẽ kết nối action_log/tick worker sau này).
  const income = 3_500_000;
  const expense = 1_200_000;
  const offlineTicks = 42;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader
          title="Báo cáo Offline Recap"
          description="Tóm tắt thu nhập, chi phí và sự kiện trong thời gian bạn offline."
        />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tổng hợp báo cáo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo Offline Recap"
        description="Tóm tắt thu nhập, chi phí, biến động cổ phiếu và sự kiện trong thời gian bạn offline."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Thu nhập" value={formatMoney(income)} tone="positive" />
        <StatCard label="Chi phí" value={formatMoney(expense)} tone="negative" />
        <StatCard
          label="Dòng tiền ròng"
          value={formatMoney(income - expense)}
          tone={income >= expense ? 'positive' : 'negative'}
        />
        <StatCard label="Số tick offline" value={offlineTicks} />
      </div>

      <div className="grid gap-4">
        {/* Biến động giá trong khi offline */}
        <Panel title="Biến động giá chứng khoán" borderColor="emerald">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="text-left pb-2">Mã</th>
                  <th className="text-left pb-2">Công ty</th>
                  <th className="text-right pb-2">Giá hiện tại</th>
                  <th className="text-right pb-2">Thay đổi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(tickers ?? []).map((ticker) => (
                  <tr key={ticker.id} className="hover:bg-slate-50/50">
                    <td className="pb-2 font-mono font-semibold">{ticker.symbol}</td>
                    <td className="pb-2 text-slate-600">{ticker.companyName}</td>
                    <td className="pb-2 text-right font-mono text-emerald-700">
                      {formatMoney(ticker.currentPrice.amount)}
                    </td>
                    <td className="pb-2 text-right font-mono">
                      <span
                        className={`${ticker.change24hPct >= 0 ? 'text-emerald-600' : 'text-rose-600'} font-semibold`}
                      >
                        {ticker.change24hPct >= 0 ? '+' : ''}
                        {ticker.change24hPct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Sự kiện trong khi offline */}
        <Panel title="Sự kiện trong thời gian offline" borderColor="default">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">Không có sự kiện mới</div>
                <div className="mt-1 text-xs text-slate-500">
                  Hệ thống sẽ ghi nhận tin tức, cảnh báo nợ và pháp lý tại đây.
                </div>
              </div>
              <Badge variant="default">Bình thường</Badge>
            </div>
          </div>
        </Panel>

        {/* Tóm tắt tài sản */}
        <Panel title="Tóm tắt tài sản" borderColor="default">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="text-[10px] uppercase text-slate-500">Tiền mặt (ví)</div>
              <div className="font-mono text-slate-800">{formatMoney(500_000)}</div>
            </div>
            <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="text-[10px] uppercase text-slate-500">Tiết kiệm</div>
              <div className="font-mono text-slate-800">{formatMoney(0)}</div>
            </div>
            <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="text-[10px] uppercase text-slate-500">Tổng nợ</div>
              <div className="font-mono text-slate-800 text-rose-600">{formatMoney(0)}</div>
            </div>
            <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="text-[10px] uppercase text-slate-500">Tài sản ròng</div>
              <div className="font-mono text-emerald-700">{formatMoney(500_000)}</div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Số liệu được tổng hợp từ các tick worker khi bạn offline. Chi tiết chi tiêu và thu nhập
            sẽ được nối vào nhật ký hành động sau này.
          </p>
        </Panel>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-500">
        <strong>Lưu ý:</strong> Tính năng Offline Recap đang ở bản démontrasi. Dòng tiền, tick
        worker và nhật ký sự kiện sẽ được kết nối hoàn chỉnh trong đợt phát triển kế tiếp.
      </div>
    </div>
  );
}
