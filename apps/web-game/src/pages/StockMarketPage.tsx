import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney, formatCompact } from '../shared/lib/format';
import { apiRequest, ApiError, createIdempotencyKey } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';
import { useGameStore } from '../store/game';
import { type TickerDto, type PortfolioDto, type TradeDto } from '@efls/contracts';
import { TransactionConfirmModal } from '../shared/ui/TransactionConfirmModal';

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
  ticker: TickerDto | null;
  cash: number;
  holdingShares: number;
  onSubmit: (side: 'buy' | 'sell', amount: number) => void;
}

function PlaceOrderModal({ open, onClose, ticker, cash, holdingShares, onSubmit }: PlaceOrderModalProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1');

  useEffect(() => {
    if (open) {
      setSide('buy');
      setAmount('1');
    }
  }, [open, ticker?.id]);

  if (!ticker) return null;
  const qty = Math.max(0, Math.trunc(Number(amount || 0)));
  const estimatedTotal = qty * ticker.currentPrice.amount;
  const projectedBalance = side === 'buy' ? cash - estimatedTotal : cash + estimatedTotal;
  const canProceed = qty > 0 && (side === 'buy' ? estimatedTotal <= cash : qty <= holdingShares);

  return (
    <Modal open={open} onClose={onClose} title={`Mua/Bán ${ticker.symbol} (khớp ngay)`}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm"><span className="text-slate-600">Mã</span><span className="font-medium">{ticker.symbol}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Công ty</span><span className="font-medium">{ticker.companyName}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Giá hiện tại (ước tính tại thời điểm hiển thị)</span><span className="font-mono">{formatMoney(ticker.currentPrice.amount)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Tiền mặt hiện có</span><span className="font-mono">{formatMoney(cash)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-600">Đang nắm giữ</span><span className="font-mono">{holdingShares.toLocaleString('vi-VN')} cổ phiếu</span></div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Thao tác</span>
          <div className="flex gap-2">
            <button onClick={() => setSide('buy')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${side === 'buy' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Mua</button>
            <button onClick={() => setSide('sell')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${side === 'sell' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Bán</button>
          </div>
        </div>
        <GameInput id="stock-order-amount" label="Số lượng cổ phiếu" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-slate-600">Tổng tạm tính (theo giá hiện tại)</span><span className="font-mono text-emerald-700">{formatMoney(estimatedTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Số dư dự kiến (ước tính)</span><span className={`font-mono font-semibold ${projectedBalance < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{formatMoney(projectedBalance)}</span></div>
        </div>
        <p className="text-[11px] text-amber-700">
          Không có lệnh chờ. Giao dịch khớp ngay tại <b>giá thị trường tại thời điểm xác nhận</b> (có thể khác giá hiển thị). Phí giao dịch: <b>Không có</b> (nếu hệ thống áp dụng, sẽ hiển thị khi khớp).
        </p>
        {!canProceed && qty > 0 ? (
          <p className="text-[11px] text-rose-700">
            {side === 'buy' ? 'Số dư tiền mặt ước tính không đủ để mua số lượng này.' : 'Bạn không đủ số lượng cổ phiếu để bán.'}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100">Hủy</button>
          <GameButton variant={side === 'buy' ? 'primary' : 'danger'} onClick={() => onSubmit(side, qty)} disabled={!canProceed}>
            Tiếp tục xác nhận
          </GameButton>
        </div>
      </div>
    </Modal>
  );
}

export function StockMarketPage() {
  const { toast } = useToast();
  const { year, month, day, hour } = useGameStore();
  const [placeModal, setPlaceModal] = useState<TickerDto | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<{ ticker: TickerDto; side: 'buy' | 'sell'; amount: number; idempotencyKey: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const lastHourKey = useRef<string>('');

  const { data: tickers, isLoading: tickersLoading, isError: tickersError, refetch: refetchTickers } = useQuery<TickerDto[]>({
    queryKey: ['stock-market', 'tickers'],
    queryFn: () => apiRequest<TickerDto[]>('/api/v1/stock-market/tickers'),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
  });

  const { data: portfolio, isLoading: portfolioLoading, isError: portfolioError, refetch: refetchPortfolio } = useQuery<PortfolioDto>({
    queryKey: ['stock-market', 'portfolio'],
    queryFn: () => apiRequest<PortfolioDto>('/api/v1/stock-market/portfolio'),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
  });

  const { data: trades, isLoading: tradesLoading, isError: tradesError, refetch: refetchTrades } = useQuery<TradeDto[]>({
    queryKey: ['stock-market', 'trades'],
    queryFn: () => apiRequest<TradeDto[]>('/api/v1/stock-market/trades'),
    staleTime: 15000,
  });

  const { data: banking, isError: bankingError, refetch: refetchBanking } = useQuery<{ cash: { amount: number } }>({
    queryKey: ['banking', 'overview'],
    queryFn: () => apiRequest('/api/v1/banking/overview'),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
  });

  const marketLoadError = tickersError || portfolioError || tradesError || bankingError;

  // Biến động giá theo từng giờ trong game (mô phỏng thị trường/AI)
  useEffect(() => {
    const key = `${year}-${month}-${day}-${hour}`;
    if (!key || key === lastHourKey.current) return;
    lastHourKey.current = key;
    apiRequest('/api/v1/stock-market/tick-hour', {
      method: 'POST',
      body: JSON.stringify({ gameYear: year, gameMonth: month, gameDay: day, gameHour: hour }),
    })
      .then(async () => { await Promise.all([refetchTickers(), refetchPortfolio(), refetchTrades()]); })
      .catch(() => {});
  }, [year, month, day, hour, refetchTickers, refetchPortfolio, refetchTrades]);

  const isLoadingAny = tickersLoading || portfolioLoading || tradesLoading;
  const myHoldings = portfolio?.holdings ?? [];
  const myTrades = trades ?? [];

  async function refreshAll() {
    await Promise.all([refetchTickers(), refetchPortfolio(), refetchTrades()]);
  }
  const cash = banking?.cash?.amount ?? 0;

  function handleSubmitOrder(side: 'buy' | 'sell', amount: number) {
    if (!placeModal) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Dữ liệu không hợp lệ', description: 'Số lượng phải lớn hơn 0.', variant: 'error' });
      return;
    }
    setConfirmOrder({ ticker: placeModal, side, amount: Math.trunc(amount), idempotencyKey: createIdempotencyKey() });
  }

  async function handleConfirmOrder() {
    if (!confirmOrder) return;
    const { ticker, side, amount, idempotencyKey } = confirmOrder;
    setLoading(true);
    try {
      const res = await apiRequest<{ message?: string; executedPrice?: { amount: number }; total?: { amount: number } }>('/api/v1/stock-market/orders', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ tickerId: ticker.id, side, amount }),
      });
      setConfirmOrder(null);
      setPlaceModal(null);
      toast({ title: side === 'buy' ? 'Mua cổ phiếu' : 'Bán cổ phiếu', description: res?.message || 'Giao dịch đã được thực hiện.', variant: 'success' });
      await refreshAll();
    } catch (e) {
      toast({ title: 'Không thực hiện được', description: errMsg(e, 'Giao dịch thất bại.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const confirmOrderSummary = useMemo(() => {
    if (!confirmOrder) return null;
    const { ticker, side, amount } = confirmOrder;
    const estTotal = amount * ticker.currentPrice.amount;
    const projected = side === 'buy' ? cash - estTotal : cash + estTotal;
    const holding = myHoldings.find((h) => h.tickerId === ticker.id)?.shares ?? 0;
    return { ticker, side, amount, estTotal, projected, holding };
  }, [confirmOrder, cash, myHoldings]);

  if (isLoadingAny) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Sàn Chứng khoán" description="Giá biến động theo giờ, mua/bán khớp ngay tại giá thị trường." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải dữ liệu thị trường...</p>
      </div>
    );
  }

  if (marketLoadError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sàn Chứng khoán" />
        <Panel title="Lỗi tải dữ liệu" borderColor="rose">
          <p className="text-sm text-rose-700">Không thể tải dữ liệu thị trường/chứng khoán. Vui lòng kiểm tra kết nối và thử lại.</p>
          <div className="mt-3">
            <GameButton
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchTickers();
                void refetchPortfolio();
                void refetchTrades();
                void refetchBanking();
              }}
            >
              Thử lại
            </GameButton>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Sàn Chứng khoán" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tiền mặt" value={formatMoney(cash)} tone="positive" />
        <StatCard label="Giá trị cổ phiếu" value={formatMoney(portfolio?.totalMarketValue.amount ?? 0)} tone="positive" />
        <StatCard label="Lãi/Lỗ chưa thực hiện" value={formatMoney(portfolio?.totalUnrealizedPnl.amount ?? 0)} tone={(portfolio?.totalUnrealizedPnl.amount ?? 0) >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Giao dịch gần đây" value={myTrades.length} />
      </div>

      <Panel title="Danh sách mã chứng khoán" borderColor="emerald">
        {(tickers ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 space-y-2">
            <p className="text-sm font-medium text-slate-800">Chưa có dữ liệu mã chứng khoán</p>
            <p className="text-xs text-slate-600">
              Hiện chưa có công ty niêm yết/phiên giao dịch mở để hiển thị. Hãy quay lại sau khi có mã trên sàn hoặc khi doanh nghiệp IPO.
            </p>
            <GameButton variant="outline" size="sm" onClick={() => void refreshAll()}>Làm mới</GameButton>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh] [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="text-left pb-2">Mã</th>
                  <th className="text-left pb-2">Công ty</th>
                  <th className="text-right pb-2">Giá (đ)</th>
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
                      <div className="flex justify-end gap-1">
                        <GameButton variant="primary" size="sm" onClick={() => setPlaceModal(ticker)}>Mua/Bán ngay</GameButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          )) : <div className="text-center py-4 text-xs text-slate-500">Chưa sở hữu cổ phiếu nào. Bấm "Mua/Bán ngay" để mua tại giá thị trường hiện tại và sở hữu ngay.</div>}
        </div>
      </Panel>

      <Panel title="Lịch sử giao dịch" borderColor="default">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <th className="text-left pb-2">Loại</th>
                <th className="text-left pb-2">Mã</th>
                <th className="text-right pb-2">Giá khớp</th>
                <th className="text-right pb-2">Số lượng</th>
                <th className="text-right pb-2">Tổng giá trị</th>
                <th className="text-right pb-2">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myTrades.length > 0 ? myTrades.map((trade) => {
                const isBuy = trade.side === 'buy';
                const total = trade.price.amount * trade.amount;
                return (
                  <tr key={trade.id} className="hover:bg-slate-50/50">
                    <td className="pb-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${isBuy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {isBuy ? 'Mua' : 'Bán'}
                      </span>
                    </td>
                    <td className="pb-2 font-mono font-semibold text-xs">{trade.symbol || `${trade.tickerId.slice(0, 8)}…`}</td>
                    <td className="pb-2 text-right font-mono">{formatMoney(trade.price.amount)}</td>
                    <td className={`pb-2 text-right font-mono ${isBuy ? 'text-emerald-700' : 'text-rose-700'}`}>{isBuy ? '+' : '-'}{trade.amount}</td>
                    <td className="pb-2 text-right font-mono text-slate-700 whitespace-nowrap">{formatMoney(total)}</td>
                    <td className="pb-2 text-right text-[10px] text-slate-500 whitespace-nowrap">{new Date(trade.executedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className="pb-4 text-center text-xs text-slate-500">Chưa có giao dịch nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <PlaceOrderModal
        open={!!placeModal}
        onClose={() => setPlaceModal(null)}
        ticker={placeModal}
        cash={cash}
        holdingShares={placeModal ? (myHoldings.find((h) => h.tickerId === placeModal.id)?.shares ?? 0) : 0}
        onSubmit={handleSubmitOrder}
      />

      <TransactionConfirmModal
        open={!!confirmOrderSummary}
        onClose={() => { if (!loading) setConfirmOrder(null); }}
        onConfirm={handleConfirmOrder}
        loading={loading}
        title="Xác nhận giao dịch cổ phiếu"
        transactionType={confirmOrderSummary?.side === 'buy' ? 'Đặt lệnh Mua cổ phiếu (khớp ngay)' : 'Đặt lệnh Bán cổ phiếu (khớp ngay)'}
        targetLabel="Mã/Công ty"
        targetValue={confirmOrderSummary ? `${confirmOrderSummary.ticker.symbol} — ${confirmOrderSummary.ticker.companyName}` : ''}
        amountLabel="Giá trị ước tính"
        amountMinor={confirmOrderSummary?.estTotal}
        feeOrRateValue="Không có (khớp theo giá thị trường tại thời điểm thực hiện)"
        projectedBalanceLabel="Số dư tiền mặt dự kiến (ước tính)"
        projectedBalanceMinor={confirmOrderSummary?.projected}
        details={confirmOrderSummary ? [
          { label: 'Số lượng', value: `${confirmOrderSummary.amount.toLocaleString('vi-VN')} cổ phiếu` },
          { label: 'Giá tham chiếu', value: formatMoney(confirmOrderSummary.ticker.currentPrice.amount) },
        ] : []}
        warning={confirmOrderSummary ? (confirmOrderSummary.side === 'buy' ? 'Giá khớp thực tế có thể thay đổi tại thời điểm xác nhận. Hệ thống sẽ kiểm tra số dư khi thực hiện.' : 'Giá khớp thực tế có thể thay đổi tại thời điểm xác nhận. Hệ thống sẽ kiểm tra số lượng nắm giữ khi thực hiện.') : undefined}
      />
    </div>
  );
}
