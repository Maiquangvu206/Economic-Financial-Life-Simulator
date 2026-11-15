import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type {
  AuctionDto,
  AuctionOverviewDto,
  PropertyDto,
  PropertySaleOfferDto,
  RealEstateOverviewDto,
} from '@efls/contracts';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney, formatCompact } from '../shared/lib/format';
import { apiRequest, ApiError } from '../shared/api/httpClient';
import { useToast } from '../shared/ui/Toast';

function statusBadge(status: PropertyDto['status']) {
  switch (status) {
    case 'unowned':
      return <Badge variant="default">Chưa có chủ</Badge>;
    case 'owned':
      return <Badge variant="success">Đã sở hữu</Badge>;
    case 'listed':
      return <Badge variant="warning">Đang bán</Badge>;
    case 'auction':
      return <Badge variant="error">Đấu giá</Badge>;
  }
}

function propertyTypeLabel(type: PropertyDto['propertyType']) {
  const map: Record<PropertyDto['propertyType'], string> = {
    apartment: 'Căn hộ',
    house: 'Nhà ở',
    office: 'Văn phòng',
    warehouse: 'Kho hàng',
    port_berth: 'Bến cảng',
    land: 'Đất nền',
    shop: 'Cửa hàng',
    garage: 'Gara',
    mini_apartment: 'Chung cư mini',
    boutique_hotel: 'Khách sạn boutique',
    shopping_center: 'Trung tâm thương mại',
    office_tower: 'Tòa tháp văn phòng',
  };
  return map[type];
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.problem?.detail || err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function RealEstatePage() {
  const { toast } = useToast();
  const {
    data: overview,
    isLoading,
    refetch,
  } = useQuery<RealEstateOverviewDto>({
    queryKey: ['real-estate', 'overview'],
    queryFn: () => apiRequest<RealEstateOverviewDto>('/api/v1/real-estate/overview'),
  });

  const {
    data: auctionOverview,
    isLoading: auctionsLoading,
    refetch: refetchAuctions,
  } = useQuery<AuctionOverviewDto>({
    queryKey: ['auctions'],
    queryFn: () => apiRequest<AuctionOverviewDto>('/api/v1/auctions'),
  });

  const auctions = auctionOverview?.auctions ?? [];

  const [buyTarget, setBuyTarget] = useState<PropertyDto | null>(null);
  const [listTarget, setListTarget] = useState<PropertyDto | null>(null);
  const [rentTermsTarget, setRentTermsTarget] = useState<PropertyDto | null>(null);
  const [offerTarget, setOfferTarget] = useState<PropertyDto | null>(null);
  const [bidTarget, setBidTarget] = useState<AuctionDto | null>(null);

  const [listPrice, setListPrice] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [rentPrice, setRentPrice] = useState('');
  const [rentDeposit, setRentDeposit] = useState('');
  const [rentNotes, setRentNotes] = useState('');
  const [rentActive, setRentActive] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const owned = useMemo(() => overview?.properties.filter((p) => p.isMine) ?? [], [overview]);
  const forSale = useMemo(
    () =>
      overview?.properties.filter(
        (p) => !p.isMine && (p.status === 'unowned' || p.status === 'listed'),
      ) ?? [],
    [overview],
  );
  const forRent = useMemo(
    () =>
      overview?.properties.filter(
        (p) => !p.isMine && p.rentListingActive && p.monthlyRent.amount > 0 && p.status !== 'auction',
      ) ?? [],
    [overview],
  );

  const isBusy = (id: string) => loadingAction === id;

  async function runAction(id: string, fn: () => Promise<void>, success?: string) {
    setLoadingAction(id);
    try {
      await fn();
      if (success) toast({ title: 'Thành công', description: success, variant: 'success' });
      void refetch();
      void refetchAuctions();
    } catch (e) {
      const msg = errorMessage(e, 'Có lỗi xảy ra.');
      toast({ title: 'Không thực hiện được', description: msg, variant: 'error' });
      console.error('real-estate action failed', e);
    } finally {
      setLoadingAction(null);
    }
  }

  function openList(p: PropertyDto) {
    setListTarget(p);
    setListPrice(String(p.askingPrice?.amount ?? p.currentValue.amount));
    setSaleNotes(p.saleNotes ?? '');
  }
  function openRentTerms(p: PropertyDto) {
    setRentTermsTarget(p);
    setRentPrice(String(p.monthlyRent.amount || 0));
    setRentDeposit(String(p.rentDeposit.amount || 0));
    setRentNotes(p.rentNotes ?? '');
    setRentActive(p.rentListingActive);
  }
  function openOffer(p: PropertyDto) {
    setOfferTarget(p);
    setOfferAmount(String(p.askingPrice?.amount ?? p.currentValue.amount));
    setOfferMsg('');
  }
  function openBid(a: AuctionDto) {
    setBidTarget(a);
    setBidAmount(String(a.currentBid.amount + 1000));
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader title="Bất động sản" description="Quản lý nhà đất, cho thuê và đấu giá tại Việt Nam." />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải danh sách bất động sản...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bất động sản"
        description="Mua bán, cho thuê, trao đổi/chốt giá và đấu giá nhà đất. Giao dịch được kiểm tra số dư và xác thực bằng VNĐ."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Tài sản của bạn" value={overview?.ownedCount ?? 0} hint="Số bất động sản sở hữu" tone="positive" />
        <StatCard label="Giá trị danh mục" value={formatMoney(overview?.portfolioValue.amount ?? 0)} hint="Tổng giá trị hiện tại" />
        <StatCard label="Thu thuê tháng" value={formatMoney(overview?.monthlyRentIncome.amount ?? 0)} hint="Tiền thuê đang nhận (ước tính)" />
      </div>

      {owned.length > 0 && (
        <Panel title="Bất động sản của bạn (quản lý)">
          <div className="space-y-3">
            {owned.map((p) => (
              <div key={p.id} className="p-3 rounded-xl border border-slate-200 bg-white/50 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                      {statusBadge(p.status)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Lô:</span> {p.lotNumber || '—'} · <span className="font-medium">Tỉnh/TP:</span> {p.province || '—'}
                    </div>
                    <div className="text-xs text-slate-500">Tọa độ ({p.location.x}, {p.location.y}) · Vùng: {p.zoneType}</div>
                    <div className="mt-1 text-sm font-mono text-emerald-700">Giá trị: {formatCompact(p.currentValue.amount)}</div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                      <span>Giá thuê niêm yết: <span className="font-mono">{formatMoney(p.monthlyRent.amount)}</span>/tháng</span>
                      {p.rentListingActive ? <Badge variant="success">Đang mở cho thuê</Badge> : <Badge variant="default">Chưa mở cho thuê</Badge>}
                      {p.rentDeposit.amount > 0 && <span>Cọc: {formatMoney(p.rentDeposit.amount)}</span>}
                      {p.activeLease ? <Badge variant="warning">Đang có người thuê</Badge> : null}
                    </div>
                    {p.activeLease && (
                      <div className="text-[11px] text-emerald-700">
                        Hợp đồng thuê: {p.activeLease.tenantName || 'Người thuê'} · {formatMoney(p.activeLease.monthlyRent.amount)}/tháng · bắt đầu {new Date(p.activeLease.startedAt).toLocaleDateString('vi-VN')} · kỳ tới {new Date(p.activeLease.nextDueAt).toLocaleDateString('vi-VN')}
                      </div>
                    )}
                    {p.rentNotes && <div className="text-[11px] text-slate-500">Ghi chú thuê: {p.rentNotes}</div>}
                    {(p.status === 'listed' || p.askingPrice) && (
                      <div className="text-xs text-amber-700">
                        Đang đăng bán: {formatMoney(p.askingPrice?.amount ?? p.currentValue.amount)} {p.saleNotes ? `· ${p.saleNotes}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <GameButton variant="outline" size="sm" onClick={() => openRentTerms(p)}>Bảng giá thuê</GameButton>
                    {(p.status === 'owned' || p.status === 'listed') && (
                      <GameButton variant="outline" size="sm" onClick={() => openList(p)}>
                        {p.status === 'listed' ? 'Cập nhật đăng bán' : 'Đặt bán/rao giá'}
                      </GameButton>
                    )}
                  </div>
                </div>
                {(p.offers ?? []).length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                    <p className="text-xs font-semibold text-amber-900 mb-1">Đề nghị mua / trao đổi giá (chờ xử lý)</p>
                    <div className="space-y-1">
                      {(p.offers ?? []).map((o) => (
                        <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>{o.buyerName || 'Người mua'} đề nghị <span className="font-mono font-semibold">{formatMoney(o.amount.amount)}</span>{o.message ? ` — "${o.message}"` : ''}</span>
                          <div className="flex gap-1">
                            <GameButton size="sm" variant="primary" disabled={isBusy(o.id)} onClick={() => runAction(o.id, () => apiRequest(`/api/v1/real-estate/offers/respond`, { method: 'POST', body: JSON.stringify({ offerId: o.id, action: 'accept' }) }).then(()=>{}), 'Đã chấp nhận đề nghị và chốt giá bán.')}>Chấp nhận (chốt giá)</GameButton>
                            <GameButton size="sm" variant="outline" disabled={isBusy(o.id)} onClick={() => runAction(o.id, () => apiRequest(`/api/v1/real-estate/offers/respond`, { method: 'POST', body: JSON.stringify({ offerId: o.id, action: 'reject' }) }).then(()=>{}), 'Đã từ chối đề nghị.')}>Từ chối</GameButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Sẵn sàng mua / trao đổi giá">
        <div className="space-y-3">
          {forSale.length > 0 ? forSale.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white/50">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-1 text-xs text-slate-600">Lô: {p.lotNumber || '—'} · Tỉnh/TP: {p.province || '—'} · ({p.location.x},{p.location.y}) · {p.zoneType}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-lg font-bold text-emerald-700">{formatMoney((p.askingPrice?.amount ?? p.purchasePrice.amount))}</span>
                  {p.askingPrice && <span className="text-xs text-slate-500">Giá niêm yết {formatMoney(p.askingPrice.amount)}</span>}
                </div>
                {p.saleNotes && <p className="text-[11px] text-slate-500 mt-1">Ghi chú bán: {p.saleNotes}</p>}
                {(p.offers ?? []).some((o) => o.isMine && o.status === 'pending') && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs items-center">
                    <span className="text-amber-700">Bạn đã gửi đề nghị, chờ người bán phản hồi.</span>
                    {(p.offers ?? []).filter((o) => o.isMine && o.status === 'pending').map((o) => (
                      <GameButton key={o.id} size="sm" variant="outline" disabled={isBusy(o.id)} onClick={() => runAction(o.id, () => apiRequest(`/api/v1/real-estate/offers/respond`, { method: 'POST', body: JSON.stringify({ offerId: o.id, action: 'cancel' }) }).then(()=>{}), 'Đã hủy đề nghị.')}>Hủy đề nghị</GameButton>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <GameButton variant="primary" size="sm" disabled={isBusy(p.id)} onClick={() => setBuyTarget(p)}>Mua</GameButton>
                {p.status === 'listed' && p.ownerCharacterId && (
                  <GameButton variant="outline" size="sm" onClick={() => openOffer(p)}>Gửi đề nghị giá</GameButton>
                )}
              </div>
            </div>
          )) : <div className="text-center py-4 text-xs text-slate-500">Không có bất động sản nào đang sẵn sàng mua.</div>}
        </div>
      </Panel>

      <Panel title="Bảng giá cho thuê" borderColor="emerald">
        <div className="space-y-3">
          {forRent.length > 0 ? forRent.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white/50">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                  {p.status === 'listed' && <Badge variant="warning">Đang rao bán</Badge>}
                  {p.activeLease && <Badge variant="success">Đã có người thuê</Badge>}
                </div>
                <div className="text-xs text-slate-600">Lô: {p.lotNumber || '—'} · {p.province || '—'}</div>
                <div className="mt-1 text-sm"><span className="text-slate-600">Giá thuê:</span> <span className="font-mono font-semibold">{formatMoney(p.monthlyRent.amount)}/tháng</span>{p.rentDeposit.amount > 0 && <span className="text-xs text-slate-500"> · Cọc {formatMoney(p.rentDeposit.amount)}</span>}</div>
                {p.rentNotes && <div className="text-[11px] text-slate-500">Điều khoản: {p.rentNotes}</div>}
                {p.activeLease && !p.leasedByMe && <div className="text-[11px] text-slate-500">Hiện đang được thuê bởi {p.activeLease.tenantName || 'người khác'}.</div>}
              </div>
              <GameButton variant="primary" size="sm" disabled={isBusy(p.id) || p.leasedByMe || !!p.activeLease} onClick={() => runAction(p.id, async () => { await apiRequest(`/api/v1/real-estate/rent`, { method: 'POST', body: JSON.stringify({ propertyId: p.id }) }); }, `Thuê thành công: đã thanh toán ${formatMoney(p.monthlyRent.amount + p.rentDeposit.amount)} (thuê ${formatMoney(p.monthlyRent.amount)}${p.rentDeposit.amount > 0 ? ` + cọc ${formatMoney(p.rentDeposit.amount)}` : ''}).`)}>
                {isBusy(p.id) ? 'Đang xử lý…' : p.leasedByMe ? 'Bạn đang thuê' : p.activeLease ? 'Đã có người thuê' : 'Thuê theo bảng giá'}
              </GameButton>
            </div>
          )) : <div className="text-center py-4 text-xs text-slate-500">Chưa có bất động sản nào mở cho thuê với bảng giá.</div>}
        </div>
      </Panel>

      <Panel title="Đấu giá phát mãi (bất động sản đang được đấu giá thực tế)" borderColor="amber">
        <div className="space-y-3">
          {auctionsLoading ? (
            <div className="text-center py-4 text-xs text-slate-500 animate-pulse">Đang tải phiên đấu giá…</div>
          ) : auctions.length > 0 ? auctions.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{a.propertyName}</span>
                  <Badge variant="warning">Đang đấu giá phát mãi</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">Người bán: {a.sellerName} · Kết thúc: {new Date(a.endsAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-bold text-emerald-700">{formatMoney(a.currentBid.amount)}</span>
                  <span className="text-xs text-slate-500">(khởi điểm {formatMoney(a.startingPrice.amount)})</span>
                </div>
                {a.highestBidderName && <div className="mt-1 text-xs text-slate-500">Cao nhất: {a.highestBidderName}</div>}
              </div>
              <GameButton variant="primary" size="sm" disabled={isBusy(a.id) || a.isHighestBidder} onClick={() => openBid(a)}>
                {a.isHighestBidder ? 'Bạn đang giữ giá' : 'Đặt giá'}
              </GameButton>
            </div>
          )) : (
            <div className="text-center py-4 text-xs text-slate-500">
              Hiện không có bất động sản nào đang được đấu giá phát mãi (không có phiên đấu giá mở thực tế).
            </div>
          )}
        </div>
      </Panel>

      {/* Buy */}
      <Modal open={!!buyTarget} onClose={() => setBuyTarget(null)} title="Mua bất động sản">
        {buyTarget && (
          <div className="space-y-3">
            <div className="text-sm"><span className="text-slate-600">Tài sản:</span> <span className="font-medium">{buyTarget.name}</span></div>
            <div className="text-xs text-slate-600">Lô {buyTarget.lotNumber || '—'} · {buyTarget.province || '—'} · ({buyTarget.location.x},{buyTarget.location.y})</div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Giá mua</span><span className="font-mono text-emerald-700 font-semibold">{formatMoney((buyTarget.askingPrice?.amount ?? buyTarget.purchasePrice.amount))}</span></div>
            <p className="text-[11px] text-slate-500">Hệ thống sẽ kiểm tra số dư. Nếu không đủ tiền, bạn sẽ nhận thông báo.</p>
            <GameButton variant="primary" loading={isBusy(buyTarget.id)} disabled={isBusy(buyTarget.id)} onClick={() => runAction(buyTarget.id, async () => { await apiRequest('/api/v1/real-estate/buy', { method: 'POST', body: JSON.stringify({ propertyId: buyTarget.id }) }); setBuyTarget(null); }, 'Mua bất động sản thành công.')}>Xác nhận mua</GameButton>
          </div>
        )}
      </Modal>

      {/* List / sale */}
      <Modal open={!!listTarget} onClose={() => setListTarget(null)} title="Đăng bán / trao đổi giá">
        {listTarget && (
          <div className="space-y-3">
            <div className="text-sm font-medium">{listTarget.name} · Lô {listTarget.lotNumber || '—'} · {listTarget.province || '—'}</div>
            <GameInput label="Giá bán niêm yết (VNĐ)" type="number" value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
            <GameInput label="Ghi chú/điều khoản trao đổi" value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} placeholder="VD: có thương lượng, bao gồm nội thất..." />
            <p className="text-[11px] text-slate-500">Người mua có thể mua đúng giá hoặc gửi đề nghị để trao đổi/chốt giá với bạn.</p>
            <GameButton variant="primary" loading={isBusy(listTarget.id)} disabled={isBusy(listTarget.id)} onClick={() => { const v = Number(listPrice); if (!Number.isFinite(v) || v <= 0) { toast({ title: 'Giá không hợp lệ', variant: 'error' }); return; } runAction(listTarget.id, async () => { await apiRequest('/api/v1/real-estate/list', { method: 'POST', body: JSON.stringify({ propertyId: listTarget.id, askingPrice: { amount: Math.round(v), currency: 'VND' }, saleNotes: saleNotes || undefined }) }); setListTarget(null); }, 'Đã đăng bán/rao giá bất động sản.'); }}>Đăng bán</GameButton>
          </div>
        )}
      </Modal>

      {/* Rent terms management */}
      <Modal open={!!rentTermsTarget} onClose={() => setRentTermsTarget(null)} title="Bảng giá & quản lý cho thuê">
        {rentTermsTarget && (
          <div className="space-y-3">
            <div className="text-sm font-medium">{rentTermsTarget.name} · Lô {rentTermsTarget.lotNumber || '—'}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rentActive} onChange={(e) => setRentActive(e.target.checked)} /> Mở cho thuê (hiển thị bảng giá)</label>
            <GameInput label="Giá thuê/tháng (VNĐ)" type="number" value={rentPrice} onChange={(e) => setRentPrice(e.target.value)} />
            <GameInput label="Tiền đặt cọc (VNĐ)" type="number" value={rentDeposit} onChange={(e) => setRentDeposit(e.target.value)} />
            <GameInput label="Ghi chú/điều khoản thuê" value={rentNotes} onChange={(e) => setRentNotes(e.target.value)} placeholder="VD: tối thiểu 3 tháng, không nuôi thú..." />
            <GameButton variant="primary" loading={isBusy(rentTermsTarget.id)} disabled={isBusy(rentTermsTarget.id)} onClick={() => { const mr = Number(rentPrice)||0; const dep = Number(rentDeposit)||0; runAction(rentTermsTarget.id, async () => { await apiRequest('/api/v1/real-estate/rent-terms', { method: 'POST', body: JSON.stringify({ propertyId: rentTermsTarget.id, monthlyRentMinor: Math.round(mr), rentDepositMinor: Math.round(dep), rentListingActive: rentActive, rentNotes: rentNotes || null }) }); setRentTermsTarget(null); }, 'Đã cập nhật bảng giá/điều khoản cho thuê.'); }}>Lưu bảng giá</GameButton>
          </div>
        )}
      </Modal>

      {/* Offer */}
      <Modal open={!!offerTarget} onClose={() => setOfferTarget(null)} title="Gửi đề nghị mua / trao đổi giá">
        {offerTarget && (
          <div className="space-y-3">
            <div className="text-sm">BĐS: <span className="font-medium">{offerTarget.name}</span> · Giá niêm yết: {formatMoney(offerTarget.askingPrice?.amount ?? offerTarget.currentValue.amount)}</div>
            <GameInput label="Số tiền đề nghị (VNĐ)" type="number" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} />
            <GameInput label="Lời nhắn trao đổi" value={offerMsg} onChange={(e) => setOfferMsg(e.target.value)} placeholder="VD: đề nghị chốt giá..." />
            <p className="text-[11px] text-slate-500">Người bán sẽ xem và có thể chấp nhận (chốt giá), từ chối hoặc tiếp tục trao đổi.</p>
            <GameButton variant="primary" loading={isBusy(offerTarget.id)} disabled={isBusy(offerTarget.id)} onClick={() => { const v = Number(offerAmount); if (!Number.isFinite(v) || v <= 0) { toast({ title: 'Số tiền không hợp lệ', variant: 'error' }); return; } runAction(offerTarget.id, async () => { await apiRequest('/api/v1/real-estate/offers', { method: 'POST', body: JSON.stringify({ propertyId: offerTarget.id, amount: { amount: Math.round(v), currency: 'VND' }, message: offerMsg || undefined }) }); setOfferTarget(null); }, 'Đã gửi đề nghị. Chờ người bán phản hồi/chốt giá.'); }}>Gửi đề nghị</GameButton>
          </div>
        )}
      </Modal>

      {/* Bid */}
      <Modal open={!!bidTarget} onClose={() => setBidTarget(null)} title="Đặt giá đấu">
        {bidTarget && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-slate-600">Tài sản</span><span className="font-medium">{bidTarget.propertyName}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Giá hiện tại</span><span className="font-mono text-emerald-700">{formatMoney(bidTarget.currentBid.amount)}</span></div>
            <GameInput label="Giá bạn đặt (VNĐ)" type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
            <p className="text-[11px] text-slate-500">Tiền được khóa trong escrow; nếu bị vượt giá sẽ hoàn trả. Cần đủ số dư để đặt giá.</p>
            <GameButton variant="primary" loading={isBusy(bidTarget.id)} disabled={isBusy(bidTarget.id)} onClick={() => { const v = Math.round(Number(bidAmount)); if (!Number.isFinite(v) || v <= bidTarget.currentBid.amount) { toast({ title: 'Giá đặt không hợp lệ', description: `Giá phải lớn hơn giá hiện tại (${formatMoney(bidTarget.currentBid.amount)}).`, variant: 'error' }); return; } runAction(bidTarget.id, async () => { await apiRequest(`/api/v1/auctions/${bidTarget.id}/bid`, { method: 'POST', body: JSON.stringify({ auctionId: bidTarget.id, amount: { amount: v, currency: 'VND' } }) }); setBidTarget(null); }, `Đã đặt giá ${formatMoney(v)} cho "${bidTarget.propertyName}". Tiền đã được giữ trong escrow; nếu bị vượt giá sẽ được hoàn trả.`); }}>Đặt giá</GameButton>
          </div>
        )}
      </Modal>
    </div>
  );
}
