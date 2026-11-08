import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney, formatCompact } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type TickerDto, type OrderDto, type PortfolioDto, type TradeDto } from '@efls/contracts';

function changeColor(pct: number) {
  return pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-rose-600' : 'text-slate-500';
}

interface PlaceOrderModalProps {
  open: boolean;
  onClose: () => void;
  ticker: TickerDto;
  onPlace: (side: 'buy' | 'sell', price: number, amount: number) => void;
  loading: boolean;
}

function PlaceOrderModal({ open, onClose, ticker, onPlace, loading }: PlaceOrderModalProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState(String(ticker.currentPrice.amount));
  const [amount, setAmount] = useState('1');

  return (
    <Modal open={open} onClose={onClose} title={`Đặt lệnh ${side === 'buy' ? 'Mua' : 'Bán'}`}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Mã chứng khoán</span>
          <span className="font-medium">{ticker.symbol}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Tên công ty</span>
          <span className="font-medium">{ticker.companyName}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Phương hướng</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSide('buy')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                side === 'buy'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Mua
            </button>
            <button
              onClick={() => setSide('sell')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                side === 'sell'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Bán
            </button>
          </div>
        </div>
        <GameInput
          label="Giá (VNĐ)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          placeholder="0"
        />
        <GameInput
          label="Số lượng cổ phiếu"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          placeholder="0"
        />
        <p className="text-[11px] text-slate-500">
          Tổng:{' '}
          <span className="font-mono text-emerald-700">
            {formatMoney(Number(price) * Number(amount))}
          </span>
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
          >
            Hủy
          </button>
          <GameButton
            variant="primary"
            onClick={() => onPlace(side, Number(price), Number(amount))}
            loading={loading}
            disabled={loading}
          >
            Đặt lệnh
          </GameButton>
        </div>
      </div>
    </Modal>
  );
}

export function StockMarketPage() {
  const [placeModal, setPlaceModal] = useState<TickerDto | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: tickers, isLoading: tickersLoading } = useQuery<TickerDto[]>({
    queryKey: ['stock-market', 'tickers'],
    queryFn: () => apiRequest<TickerDto[]>('/api/v1/stock-market/tickers'),
  });

  const {
    data: orders,
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useQuery<OrderDto[]>({
    queryKey: ['stock-market', 'orders'],
    queryFn: () => apiRequest<OrderDto[]>('/api/v1/stock-market/orders'),
  });

  const {
    data: portfolio,
    isLoading: portfolioLoading,
    refetch: refetchPortfolio,
  } = useQuery<PortfolioDto>({
    queryKey: ['stock-market', 'portfolio'],
    queryFn: () => apiRequest<PortfolioDto>('/api/v1/stock-market/portfolio'),
  });

  const { data: trades, isLoading: tradesLoading } = useQuery<TradeDto[]>({
    queryKey: ['stock-market', 'trades'],
    queryFn: () => apiRequest<TradeDto[]>('/api/v1/stock-market/trades'),
  });

  const isLoadingAny = tickersLoading || ordersLoading || portfolioLoading || tradesLoading;

  const myOrders = orders ?? [];
  const myHoldings = portfolio?.holdings ?? [];
  const myTrades = trades ?? [];

  async function handlePlaceOrder(side: 'buy' | 'sell', price: number, amount: number) {
    if (!placeModal) return;
    setLoading(true);
    try {
      await apiRequest<unknown>('/api/v1/stock-market/orders', {
        method: 'POST',
        body: JSON.stringify({
          tickerId: placeModal.id,
          side,
          price: { amount: price, currency: 'VND' },
          amount,
        }),
      });
      setPlaceModal(null);
      await refetchOrders();
      await refetchPortfolio();
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setLoading(true);
    try {
      await apiRequest<unknown>(`/api/v1/stock-market/orders/${orderId}`, {
        method: 'DELETE',
      });
      await refetchOrders();
      await refetchPortfolio();
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }

  if (isLoadingAny) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader
          title="Sàn Chứng khoán"
          description="Đồ thị nến, sổ lệnh, đặt lệnh và danh mục đầu tư."
        />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải dữ liệu thị trường...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sàn Chứng khoán"
        description="Đồ thị nến, sổ lệnh, đặt lệnh mua/bán và danh mục đầu tư. Tất cả giá tính bằng VNĐ."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng giá trị danh mục"
          value={formatMoney(portfolio?.totalMarketValue.amount ?? 0)}
          hint="Giá trị cổ phiếu nắm giữ"
          tone="positive"
        />
        <StatCard
          label="Lãi/Lỗ chưa thực hiện"
          value={formatMoney(portfolio?.totalUnrealizedPnl.amount ?? 0)}
          hint="Tổng lãi/lỗ của các cổ phiếu sở hữu"
          tone={(portfolio?.totalUnrealizedPnl.amount ?? 0 >= 0) ? 'positive' : 'negative'}
        />
        <StatCard
          label="Lệnh mở"
          value={portfolio?.openOrders.length ?? 0}
          hint="Đơn mua/bán đang chờ khớp"
        />
        <StatCard label="Giao dịch gần đây" value={myTrades.length} hint="Lịch sử mua/bán" />
      </div>

      <div className="grid gap-4">
        {/* Danh sách mã */}
        <Panel title="Danh sách mã chứng khoán" borderColor="emerald">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="text-left pb-2">Mã</th>
                  <th className="text-left pb-2">Công ty</th>
                  <th className="text-right pb-2">Giá (VNĐ)</th>
                  <th className="text-right pb-2">Thay đổi 24h</th>
                  <th className="text-right pb-2">Khối lượng</th>
                  <th className="text-right pb-2">Hành động</th>
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
                      <span className={`${changeColor(ticker.change24hPct)} font-semibold`}>
                        {ticker.change24hPct >= 0 ? '+' : ''}
                        {ticker.change24hPct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="pb-2 text-right font-mono text-slate-500">
                      {formatCompact(ticker.totalVolume)}
                    </td>
                    <td className="pb-2 text-right">
                      <div className="flex gap-1">
                        <GameButton
                          variant="outline"
                          size="sm"
                          onClick={() => setPlaceModal(ticker)}
                        >
                          Mua
                        </GameButton>
                        <GameButton
                          variant="outline"
                          size="sm"
                          onClick={() => setPlaceModal(ticker)}
                        >
                          Bán
                        </GameButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Danh mục sở hữu */}
        <Panel title="Danh mục cổ phiếu của bạn" borderColor="default">
          <div className="space-y-3">
            {myHoldings.length > 0 ? (
              myHoldings.map((holding) => (
                <div
                  key={holding.tickerId}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{holding.symbol}</span>
                      <Badge variant="default">{holding.companyName}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">
                      {holding.shares} cổ phiếu
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-slate-800">
                      {formatMoney(holding.marketValue.amount)}
                    </div>
                    <div
                      className={`text-[10px] ${changeColor((holding.unrealizedPnl.amount / holding.marketValue.amount) * 100)}`}
                    >
                      {holding.unrealizedPnl.amount >= 0 ? '+' : ''}
                      {formatMoney(holding.unrealizedPnl.amount)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa sở hữu cổ phiếu nào.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4">
        {/* Lệnh mở */}
        <Panel title="Lệnh mua/bán đang mở" borderColor="amber">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="text-left pb-2">Mã</th>
                  <th className="text-left pb-2">Loại</th>
                  <th className="text-right pb-2">Giá</th>
                  <th className="text-right pb-2">Số lượng</th>
                  <th className="text-right pb-2">Trạng thái</th>
                  <th className="text-right pb-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myOrders.length > 0 ? (
                  myOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/50">
                      <td className="pb-2 font-mono">{order.symbol}</td>
                      <td className="pb-2 text-slate-600">{order.side}</td>
                      <td className="pb-2 text-right font-mono">
                        {formatMoney(order.price.amount)}
                      </td>
                      <td className="pb-2 text-right">{order.amount}</td>
                      <td className="pb-2 text-right">
                        <Badge variant="default">{order.status}</Badge>
                      </td>
                      <td className="pb-2 text-right">
                        <GameButton
                          variant="danger"
                          size="sm"
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={loading}
                        >
                          Hủy
                        </GameButton>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="pb-4 text-center text-xs text-slate-500">
                      Không có lệnh mở nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Lịch sử giao dịch */}
        <Panel title="Lịch sử giao dịch" borderColor="default">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="text-left pb-2">Mã</th>
                  <th className="text-right pb-2">Giá</th>
                  <th className="text-right pb-2">Số lượng</th>
                  <th className="text-left pb-2">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myTrades.length > 0 ? (
                  myTrades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-slate-50/50">
                      <td className="pb-2 font-mono">{trade.tickerId}</td>
                      <td className="pb-2 text-right font-mono">
                        {formatMoney(trade.price.amount)}
                      </td>
                      <td className="pb-2 text-right">{trade.amount}</td>
                      <td className="pb-2 text-left text-[10px] text-slate-500">
                        {new Date(trade.executedAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="pb-4 text-center text-xs text-slate-500">
                      Chưa có giao dịch nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <PlaceOrderModal
        open={!!placeModal}
        onClose={() => setPlaceModal(null)}
        ticker={placeModal!}
        onPlace={handlePlaceOrder}
        loading={loading}
      />
    </div>
  );
}
