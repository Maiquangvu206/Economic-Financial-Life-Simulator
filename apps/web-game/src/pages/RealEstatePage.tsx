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
import { type RealEstateOverviewDto, type PropertyDto, type AuctionDto } from '@efls/contracts';

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
  };
  return map[type];
}

interface BuyModalProps {
  open: boolean;
  onClose: () => void;
  property: PropertyDto;
  onBuy: () => void;
  loading: boolean;
}

function BuyModal({ open, onClose, property, onBuy, loading }: BuyModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Mua bất động sản">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Tài sản</span>
          <span className="font-medium">{property?.name ?? 'Không tên'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Giá mua</span>
          <span className="font-mono text-emerald-700">
            {formatMoney(property?.purchasePrice?.amount ?? 0)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Vùng</span>
          <span>{property?.zoneType}</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Tiền sẽ được trừ khỏi ví và quyền sở hữu chuyển về bạn ngay lập tức.
        </p>
        <GameButton variant="primary" onClick={onBuy} loading={loading} disabled={loading}>
          Mua ngay
        </GameButton>
      </div>
    </Modal>
  );
}

interface ListModalProps {
  open: boolean;
  onClose: () => void;
  property: PropertyDto;
  onList: (askingPriceMinor: number) => void;
  loading: boolean;
}

function ListModal({ open, onClose, property, onList, loading }: ListModalProps) {
  const [askingPrice, setAskingPrice] = useState(String(property?.purchasePrice?.amount ?? 0));

  return (
    <Modal open={open} onClose={onClose} title="Đặt bán bất động sản">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Tài sản</span>
          <span className="font-medium">{property?.name ?? 'Không tên'}</span>
        </div>
        <GameInput
          label="Giá bán đề xuất (VNĐ)"
          value={askingPrice}
          onChange={(e) => setAskingPrice(e.target.value)}
          type="number"
          placeholder="0"
        />
        <p className="text-[11px] text-slate-500">
          Tài sản sẽ hiện trên thị trường với giá trên. Có thể hủy đăng bán bất cứ lúc nào.
        </p>
        <GameButton
          variant="primary"
          onClick={() => onList(Number(askingPrice))}
          loading={loading}
          disabled={loading}
        >
          Đăng bán
        </GameButton>
      </div>
    </Modal>
  );
}

interface RentModalProps {
  open: boolean;
  onClose: () => void;
  property: PropertyDto;
  onRent: (monthlyRentMinor: number) => void;
  loading: boolean;
}

function RentModal({ open, onClose, property, onRent, loading }: RentModalProps) {
  const [monthlyRent, setMonthlyRent] = useState(String(property?.monthlyRent?.amount ?? 0));

  return (
    <Modal open={open} onClose={onClose} title="Cho thuê bất động sản">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Tài sản</span>
          <span className="font-medium">{property?.name ?? 'Không tên'}</span>
        </div>
        <GameInput
          label="Tiền thuê hàng tháng (VNĐ)"
          value={monthlyRent}
          onChange={(e) => setMonthlyRent(e.target.value)}
          type="number"
          placeholder="0"
        />
        <p className="text-[11px] text-slate-500">Bạn sẽ nhận tiền thuê định kỳ từ người thuê.</p>
        <GameButton
          variant="primary"
          onClick={() => onRent(Number(monthlyRent))}
          loading={loading}
          disabled={loading}
        >
          Đăng cho thuê
        </GameButton>
      </div>
    </Modal>
  );
}

interface BidModalProps {
  open: boolean;
  onClose: () => void;
  auction: AuctionDto;
  onBid: (auction: AuctionDto, amountMinor: number) => void;
  loading: boolean;
}

function BidModal({ open, onClose, auction, onBid, loading }: BidModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Đặt giá đấu">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Tài sản</span>
          <span className="font-medium">{auction?.propertyName ?? 'Không tên'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Giá hiện tại</span>
          <span className="font-mono text-emerald-700">
            {formatMoney(auction?.currentBid?.amount ?? 0)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Bước tối thiểu</span>
          <span className="font-mono text-slate-500">+1.000 ₫</span>
        </div>
        <GameInput
          label="Giá bạn đặt (VNĐ)"
          value={String((auction?.currentBid?.amount ?? 0) + 1)}
          type="number"
          placeholder="0"
        />
        <p className="text-[11px] text-slate-500">
          Tiền sẽ bị khóa trong escrow cho đến khi phiên kết thúc. Nếu bị vượt giá, tiền sẽ được
          hoàn trả.
        </p>
        <GameButton
          variant="primary"
          onClick={() => auction && onBid(auction, (auction?.currentBid?.amount ?? 0) + 1)}
          loading={loading}
          disabled={loading}
        >
          Đặt giá
        </GameButton>
      </div>
    </Modal>
  );
}

export function RealEstatePage() {
  const {
    data: overview,
    isLoading,
    refetch,
  } = useQuery<RealEstateOverviewDto>({
    queryKey: ['real-estate', 'overview'],
    queryFn: () => apiRequest<RealEstateOverviewDto>('/api/v1/real-estate/overview'),
  });

  const {
    data: auctions,
    isLoading: auctionsLoading,
    refetch: refetchAuctions,
  } = useQuery<AuctionDto[]>({
    queryKey: ['auctions'],
    queryFn: () => apiRequest<AuctionDto[]>('/api/v1/auctions'),
    enabled: !isLoading,
  });

  const [buyModal, setBuyModal] = useState<PropertyDto | null>(null);
  const [listModal, setListModal] = useState<PropertyDto | null>(null);
  const [rentModal, setRentModal] = useState<PropertyDto | null>(null);
  const [bidModal, setBidModal] = useState<AuctionDto | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const owned = overview?.properties.filter((p) => p.isMine) ?? [];
  const forSale =
    overview?.properties.filter(
      (p) => !p.isMine && (p.status === 'unowned' || p.status === 'listed'),
    ) ?? [];

  const ownedCount = overview?.ownedCount ?? 0;
  const portfolioValue = overview?.portfolioValue?.amount ?? 0;
  const monthlyRentIncome = overview?.monthlyRentIncome?.amount ?? 0;

  const isActionLoading = (id: string) => loadingAction === id;

  async function handleBuy(property: PropertyDto) {
    setLoadingAction(property.id);
    try {
      await apiRequest<unknown>('/api/v1/real-estate/buy', {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id }),
      });
      setBuyModal(null);
      void refetch();
      void refetchAuctions();
    } catch {
      // Lỗi đã được xử lý bởi apiRequest (ném ra)
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleList(property: PropertyDto, askingPriceMinor: number) {
    setLoadingAction(property.id);
    try {
      await apiRequest<unknown>('/api/v1/real-estate/list', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: property.id,
          askingPrice: { amount: askingPriceMinor, currency: 'VND' },
        }),
      });
      setListModal(null);
      void refetch();
      void refetchAuctions();
    } catch {
      //
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRent(property: PropertyDto, monthlyRentMinor: number) {
    setLoadingAction(property.id);
    try {
      await apiRequest<unknown>('/api/v1/real-estate/rent', {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id, monthlyRentMinor }),
      });
      setRentModal(null);
      void refetch();
      void refetchAuctions();
    } catch {
      //
    } finally {
      setLoadingAction(null);
    }
  }

  async function handlePlaceBid(auction: AuctionDto, amountMinor: number) {
    setLoadingAction(auction.id);
    try {
      await apiRequest<AuctionDto>(`/api/v1/auctions/${auction.id}/bid`, {
        method: 'POST',
        body: JSON.stringify({
          auctionId: auction.id,
          amount: { amount: amountMinor, currency: 'VND' },
        }),
      });
      setBidModal(null);
      void refetchAuctions();
      void refetch();
    } catch {
      //
    } finally {
      setLoadingAction(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <PageHeader
          title="Bất động sản"
          description="Quản lý nhà đất, cho thuê và đấu giá tại Việt Nam."
        />
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải danh sách bất động sản...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bất động sản"
        description="Mua bán, cho thuê và đấu giá nhà đất. Tất cả giao dịch được xác thực bằng VNĐ."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Tài sản của bạn"
          value={ownedCount}
          hint="Số bất động sản sở hữu"
          tone="positive"
        />
        <StatCard
          label="Giá trị danh mục"
          value={formatMoney(portfolioValue)}
          hint="Tổng giá trị hiện tại"
        />
        <StatCard
          label="Thu thuê tháng"
          value={formatMoney(monthlyRentIncome)}
          hint="Tiền thuê đang nhận"
        />
      </div>

      <div className="grid gap-4">
        {owned.length > 0 && (
          <Panel title="Bất động sản của bạn">
            <div className="space-y-3">
              {owned.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {property?.name ?? 'Không tên'}
                      </span>
                      <Badge variant="default">{propertyTypeLabel(property.propertyType)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      ({property.location.x}, {property.location.y}) · {property.zoneType}
                    </div>
                    <div className="mt-2 text-sm font-mono text-emerald-700">
                      {formatCompact(property.currentValue.amount)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {property.status === 'owned' && (
                      <GameButton
                        variant="outline"
                        size="sm"
                        onClick={() => setListModal(property)}
                        disabled={isActionLoading(property.id)}
                      >
                        Đặt bán
                      </GameButton>
                    )}
                    {property.status === 'owned' && (
                      <GameButton
                        variant="outline"
                        size="sm"
                        onClick={() => setRentModal(property)}
                        disabled={isActionLoading(property.id)}
                      >
                        Cho thuê
                      </GameButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Sẵn sàng mua">
          <div className="space-y-3">
            {forSale.length > 0 ? (
              forSale.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {property?.name ?? 'Không tên'}
                      </span>
                      <Badge variant="default">{propertyTypeLabel(property.propertyType)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {statusBadge(property.status)} &nbsp; ({property.location.x},{' '}
                      {property.location.y})
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-mono text-lg font-bold text-emerald-700">
                        {formatMoney(property?.purchasePrice?.amount ?? 0)}
                      </span>
                      {property.askingPrice != null && (
                        <span className="text-xs text-slate-500 ml-2">
                          (bán: {formatMoney(property?.askingPrice?.amount ?? 0)})
                        </span>
                      )}
                    </div>
                  </div>
                  <GameButton
                    variant="primary"
                    size="sm"
                    onClick={() => setBuyModal(property)}
                    disabled={isActionLoading(property.id)}
                  >
                    Mua
                  </GameButton>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Không có bất động sản nào đang sẵn sàng mua.
              </div>
            )}
          </div>
        </Panel>

        {/* Đấu giá */}
        <Panel title="Đấu giá tài sản phát mại" borderColor="amber">
          <div className="space-y-3">
            {auctionsLoading ? (
              <div className="text-center py-4 text-xs text-slate-500 animate-pulse">
                Đang tải phiên đấu giá…
              </div>
            ) : (auctions ?? []).length > 0 ? (
              (auctions ?? []).map((auction) => (
                <div
                  key={auction.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {auction?.propertyName ?? 'Không tên'}
                      </span>
                      <Badge variant="default">{auction?.sellerName ?? 'Không rõ'}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Kết thúc{' '}
                      <span className="font-mono">
                        {auction?.endsAt
                          ? new Date(auction.endsAt).toLocaleString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </span>
                      &nbsp;·&nbsp; {auction?.status}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-mono text-lg font-bold text-emerald-700">
                        {formatMoney(auction?.currentBid?.amount ?? 0)}
                      </span>
                      <span className="text-xs text-slate-500 ml-2">
                        (khởi điểm {formatMoney(auction?.startingPrice?.amount ?? 0)})
                      </span>
                    </div>
                    {auction?.highestBidderName && (
                      <div className="mt-1 text-xs text-slate-500">
                        Cao nhất: {auction.highestBidderName}
                      </div>
                    )}
                  </div>
                  <GameButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setBidModal(auction);
                    }}
                    disabled={loadingAction === auction?.id || auction?.isHighestBidder}
                  >
                    {loadingAction === auction?.id ? 'Đang xử lý…' : 'Đặt giá'}
                  </GameButton>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa có phiên đấu giá nào đang diễn ra.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <BidModal
        open={!!bidModal}
        onClose={() => setBidModal(null)}
        auction={bidModal!}
        onBid={(a, amt) => a && handlePlaceBid(a, amt)}
        loading={bidModal ? isActionLoading(bidModal.id) : false}
      />
      <BuyModal
        open={!!buyModal}
        onClose={() => setBuyModal(null)}
        property={buyModal!}
        onBuy={() => buyModal && handleBuy(buyModal)}
        loading={buyModal ? isActionLoading(buyModal.id) : false}
      />
      <ListModal
        open={!!listModal}
        onClose={() => setListModal(null)}
        property={listModal!}
        onList={(p) => listModal && handleList(listModal, p)}
        loading={listModal ? isActionLoading(listModal.id) : false}
      />
      <RentModal
        open={!!rentModal}
        onClose={() => setRentModal(null)}
        property={rentModal!}
        onRent={(p) => rentModal && handleRent(rentModal, p)}
        loading={rentModal ? isActionLoading(rentModal.id) : false}
      />
    </div>
  );
}
