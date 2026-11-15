import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney, formatCompact } from '../shared/lib/format';
import { apiRequest, ApiError } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';
import { useGameStore } from '../store/game';
import { type TickerDto, type OrderDto, type PortfolioDto, type TradeDto } from '@efls/contracts';

function changeColor(pct: number) {
  return pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-rose-600' : 'text-slate-500';
}

function errMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.problem?.detail || e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
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
  const [price, setPrice] = useState(String(ticker?.currentPrice.amount ?? 0));
  const [amount, setAmount] = useState('1');

  useEffect(() => {
    if (ticker) setPrice(String(ticker.currentPrice.amount));
  }, [ticker]);

  if (!ticker) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Đặt lệnh ${side === 'buy' ? 'Mua' : 'Bán'}`}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm"><span className="text-slate-600">Mã</span><span className="font-medium">{ticker.symbol}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Công ty</span><span className="font-medium">{ticker.companyName}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Giá hiện tại</span><span className="font-mono">{formatMoney(ticker.currentPrice.amount)}</span></div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Loại lệnh</span>
          <div className="flex gap-2">
            <button onClick={() => setSide('buy')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${side === 'buy' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Mua</button>
            <button onClick={() => setSide('sell')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${side === 'sell' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Bán</button>
          </div>
        </div>
        <GameInput label="Giá đặt (VNĐ)" value={price} onChange={(e) => setPrice(e.target.value)} type="number" />
        <GameInput label="Số lượng cổ phiếu" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        <p className="text-[11px] text-slate-500">Tổng (ước tính): <span className="font-mono text-emerald-700">{formatMoney(Number(price || 0) * Number(amount || 0))}</span></p>
        <p className="text-[11px] text-slate-500">{side === 'buy' ? 'Hệ thống kiểm tra số dư tiền mặt trước khi mua. Đặt giá >= giá hiện tại để khớp ngay (cập nhật danh mục & lãi/lỗ); thấp hơn sẽ chờ khớp và giữ tiền escrow.' : 'Hệ thống kiểm tra số cổ phiếu sở hữu trước khi bán. Đặt giá <= giá hiện tại để khớp/bán ngay và cập nhật số dư.'}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100">Hủy</button>
          <GameButton variant={side === 'buy' ? 'primary' : 'danger'} onClick={() => onPlace(side, Math.round(Number(price)), Math.round(Number(amount)))} loading={loading} disabled={loading}>Xác nhận {side === 'buy' ? 'mua' : 'bán'}</GameButton>
        </div>
      </div>
    </Modal>
  );
}

export function StockMarketPage() {
  const { toast } = useToast();
  const { year, month, day, hour } = useGameStore();
  const [placeModal, setPlaceModal] = useState<TickerDto | null>(null);
  const [loading, setLoading] = useState(false);
  const lastHourKey = useRef<string>('');

  const { data: tickers, isLoading: tickersLoading, refetch: refetchTickers } = useQuery<TickerDto[]>({
    queryKey: ['stock-market', 'tickers'],
    queryFn: () => apiRequest<TickerDto[]>('/api/v1/stock-market/tickers'),
    refetchInterval: 15000,
  });

  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<OrderDto[]>({
    queryKey: ['stock-market', 'orders'],
    queryFn: () => apiRequest<OrderDto[]>('/api/v1/stock-market/orders'),
  });

  const { data: portfolio, isLoading: portfolioLoading, refetch: refetchPortfolio } = useQuery<PortfolioDto>({
    queryKey: ['stock-market', 'portfolio'],
    queryFn: () => apiRequest<PortfolioDto>('/api/v1/stock-market/portfolio'),
    refetchInterval: 15000,
  });

  const { data: trades, isLoading: tradesLoading, refetch: refetchTrades } = useQuery<TradeDto[]>({
    queryKey: ['stock-market', 'trades'],
    queryFn: () => apiRequest<TradeDto[]>('/api/v1/stock-market/trades'),
  });

  const { data: banking } = useQuery<{ cash: { amount: number } }>({
    queryKey: ['banking', 'overview'],
    queryFn: () => apiRequest('/api/v1/banking/overview'),
    refetchInterval: 15000,
  });

  // Biến động giá theo từng giờ trong game (mô phỏng thị trường/AI)
  useEffect(() => {
    const key = `${year}-${month}-${day}-${hour}`;
    if (!key || key === lastHourKey.current) return;
    lastHourKey.current = key;
    apiRequest('/api/v1/stock-market/tick-hour', {
      method: 'POST',
      body: JSON.stringify({ gameYear: year, gameMonth: month, gameDay: day, gameHour: hour }),
    })
      .then(async () => { await Promise.all([refetchTickers(), refetchPortfolio(), refetchOrders(), refetchTrades()]); })
      .catch(() => {});
  }, [year, month, day, hour, refetchTickers, refetchPortfolio, refetchOrders, refetchTrades]);

  const isLoadingAny = tickersLoading || ordersLoading || portfolioLoading || tradesLoading;
  const myOrders = orders ?? [];
  const myHoldings = portfolio?.holdings ?? [];
  const myTrades = trades ?? [];

  async function refreshAll() {
    await Promise.all([refetchTickers(), refetchOrders(), refetchPortfolio(), refetchTrades()]);
  }
  const cash = banking?.cash?.amount ?? 0;

  async function handlePlaceOrder(side: 'buy' | 'sell', price: number, amount: number) {
    if (!placeModal) return;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Dữ liệu không hợp lệ', description: 'Giá và số lượng phải lớn hơn 0.', variant: 'error' });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ message?: string; status?: string; filledAmount?: number }>('/api/v1/stock-market/orders', {
        method: 'POST',
        body: JSON.stringify({ tickerId: placeModal.id, side, price: { amount: price, currency: 'VND' }, amount }),
      });
      setPlaceModal(null);
      toast({ title: side === 'buy' ? 'Mua cổ phiếu' : 'Bán cổ phiếu', description: res?.message || 'Đã xử lý lệnh.', variant: 'success' });
      await refreshAll();
    } catch (e) {
      toast({ title: 'Không thực hiện được', description: errMsg(e, 'Đặt lệnh thất bại.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setLoading(true);
    try {
      await apiRequest<unknown>(`/api/v1/stock-market/orders/${orderId}`, { method: 'DELETE' });
      toast({ title: 'Đã hủy lệnh', description: 'Lệnh đã được hủy và hoàn tiền escrow (nếu có).', variant: 'success' });
      await refreshAll();
    } catch (e) {
      toast({ title: 'Không hủy được', description: errMsg(e, 'Hủy lệnh thất bại.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  if (isLoadingAny) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Sàn Chứng khoán" description="Đồ thị, sổ lệnh, đặt lệnh và danh mục đầu tư." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải dữ liệu thị trường...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Sàn Chứng khoán" description="Giá biến động theo từng giờ trong game (mô phỏng thị trường/AI). Mua/bán kiểm tra số dư/tài sản và cập nhật danh mục, lãi/lỗ, số dư ngay khi khớp." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Tiền mặt (khả dụng)" value={formatMoney(cash)} hint="Số dư dùng để mua cổ phiếu" tone="positive" />
        <StatCard label="Giá trị cổ phiếu" value={formatMoney(portfolio?.totalMarketValue.amount ?? 0)} hint="Giá trị danh mục theo giá hiện tại" tone="positive" />
        <StatCard label="Lãi/Lỗ chưa thực hiện" value={formatMoney(portfolio?.totalUnrealizedPnl.amount ?? 0)} hint="(Giá hiện tại - giá vốn TB) × số lượng" tone={(portfolio?.totalUnrealizedPnl.amount ?? 0) >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Lệnh mở" value={portfolio?.openOrders.length ?? 0} hint="Đơn mua/bán đang chờ khớp" />
        <StatCard label="Giao dịch gần đây" value={myTrades.length} hint="Lịch sử khớp lệnh" />
      </div>

      <Panel title="Danh sách mã chứng khoán (biến động theo giờ trong game)" borderColor="emerald">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <th className="text-left pb-2">Mã</th>
                <th className="text-left pb-2">Công ty</th>
                <th className="text-right pb-2">Giá (VNĐ)</th>
                <th className="text-right pb-2">Thay đổi</th>
                <th className="text-right pb-2">Khối lượng</th>
                <th className="text-right pb-2">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(tickers ?? []).map((ticker) => (
                <tr key={ticker.id} className="hover:bg-slate-50/50">
                  <td className="pb-2 font-mono font-semibold">{ticker.symbol}</td>
                  <td className="pb-2 text-slate-600">{ticker.companyName}</td>
                  <td className="pb-2 text-right font-mono text-emerald-700">{formatMoney(ticker.currentPrice.amount)}</td>
                  <td className="pb-2 text-right font-mono"><span className={`${changeColor(ticker.change24hPct)} font-semibold`}>{ticker.change24hPct >= 0 ? '+' : ''}{Number(ticker.change24hPct).toFixed(2)}%</span></td>
                  <td className="pb-2 text-right font-mono text-slate-500">{formatCompact(ticker.totalVolume)}</td>
                  <td className="pb-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <GameButton variant="primary" size="sm" onClick={() => setPlaceModal(ticker)}>Mua/Bán</GameButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Danh mục cổ phiếu của bạn" borderColor="default">
        <div className="space-y-3">
          {myHoldings.length > 0 ? myHoldings.map((holding) => (
            <div key={holding.tickerId} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{holding.symbol}</span><Badge variant="default">{holding.companyName}</Badge></div>
                <div className="mt-1 text-xs text-slate-500 font-mono">{holding.shares} cổ phiếu · Giá vốn TB {formatMoney(holding.averageCost.amount)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-800">{formatMoney(holding.marketValue.amount)}</div>
                <div className={`text-[10px] ${holding.unrealizedPnl.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{holding.unrealizedPnl.amount >= 0 ? '+' : ''}{formatMoney(holding.unrealizedPnl.amount)}</div>
              </div>
            </div>
          )) : <div className="text-center py-4 text-xs text-slate-500">Chưa sở hữu cổ phiếu nào. Đặt lệnh mua (giá ≥ giá hiện tại) để khớp ngay và cập nhật danh mục.</div>}
        </div>
      </Panel>

      <Panel title="Lệnh mua/bán đang mở" borderColor="amber">
        <div className="overflow-auto max-h-[60vh]">
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
              {myOrders.length > 0 ? myOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50">
                  <td className="pb-2 font-mono">{order.symbol}</td>
                  <td className="pb-2 text-slate-600">{order.side === 'buy' ? 'Mua' : 'Bán'}</td>
                  <td className="pb-2 text-right font-mono">{formatMoney(order.price.amount)}</td>
                  <td className="pb-2 text-right">{order.amount - order.filledAmount} / {order.amount}</td>
                  <td className="pb-2 text-right"><Badge variant="default">{order.status}</Badge></td>
                  <td className="pb-2 text-right"><GameButton variant="danger" size="sm" onClick={() => handleCancelOrder(order.id)} disabled={loading}>Hủy</GameButton></td>
                </tr>
              )) : <tr><td colSpan={6} className="pb-4 text-center text-xs text-slate-500">Không có lệnh mở nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Lịch sử giao dịch" borderColor="default">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <th className="text-left pb-2">Mã (ticker)</th>
                <th className="text-right pb-2">Giá</th>
                <th className="text-right pb-2">Số lượng</th>
                <th className="text-left pb-2">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myTrades.length > 0 ? myTrades.map((trade) => (
                <tr key={trade.id} className="hover:bg-slate-50/50">
                  <td className="pb-2 font-mono text-xs">{trade.tickerId.slice(0, 8)}…</td>
                  <td className="pb-2 text-right font-mono">{formatMoney(trade.price.amount)}</td>
                  <td className="pb-2 text-right">{trade.amount}</td>
                  <td className="pb-2 text-left text-[10px] text-slate-500">{new Date(trade.executedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              )) : <tr><td colSpan={4} className="pb-4 text-center text-xs text-slate-500">Chưa có giao dịch nào (giao dịch khớp sổ lệnh sẽ hiển thị tại đây).</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <PlaceOrderModal open={!!placeModal} onClose={() => setPlaceModal(null)} ticker={placeModal!} onPlace={handlePlaceOrder} loading={loading} />
    </div>
  );
}
