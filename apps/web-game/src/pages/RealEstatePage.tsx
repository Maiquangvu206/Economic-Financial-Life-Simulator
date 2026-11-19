import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@efls/ui';
import type {
  AuctionDto,
  AuctionOverviewDto,
  PropertyDto,
  PropertySaleOfferDto,
  ProvinceDto,
  RealEstateOverviewDto,
} from '@efls/contracts';
import { Panel } from '../shared/ui/Panel';
import { StatCard } from '../shared/ui/StatCard';
import { GameButton } from '../shared/ui/GameButton';
import { Modal } from '../shared/ui/Modal';
import { Badge } from '../shared/ui/Badge';
import { GameInput } from '../shared/ui/GameInput';
import { formatMoney, formatCompact } from '../shared/lib/format';
import { apiRequest, ApiError, createIdempotencyKey } from '../shared/api/httpClient';
import { TransactionConfirmModal } from '../shared/ui/TransactionConfirmModal';
import { useToast } from '../shared/ui/Toast';
import { useDialog } from '../shared/ui/DialogContext';

type UnifiedProperty = PropertyDto & {
  __source: 'core' | 'province-land';
  __provinceCode?: string;
  __provinceName?: string;
};

type RealEstateTab = 'assets' | 'market' | 'rent' | 'auctions';

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

function MergedMembersInfo({ members }: { members?: PropertyDto['mergedMembers'] }) {
  if (!members || members.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
      <div className="text-[11px] font-semibold text-slate-700 mb-1">
        Ô thành viên trong cụm ({members.length} ô) — bán/cho thuê/thao tác áp dụng cho cả cụm
      </div>
      <ul className="space-y-0.5 text-[11px] text-slate-600">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="font-medium text-slate-700">{m.name}</span>
            <span>· Lô: {m.lotNumber || '—'}</span>
            <span>· ({m.location?.x ?? '?'},{m.location?.y ?? '?'})</span>
            <span>· {m.zoneType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function propertyTypeLabel(t: PropertyDto['propertyType']): string {
  const map: Record<string, string> = {
    apartment: 'Căn hộ',
    house: 'Nhà phố',
    office: 'Văn phòng',
    warehouse: 'Kho bãi',
    port_berth: 'Bến cảng',
    land: 'Đất nền',
    shop: 'Cửa hàng',
    garage: 'Nhà để xe',
    mini_apartment: 'Chung cư mini',
    boutique_hotel: 'Khách sạn mini',
    shopping_center: 'Trung tâm thương mại',
    office_tower: 'Tòa nhà văn phòng',
  };
  return map[t] ?? t;
}

function isBuilt(p: PropertyDto): boolean {
  return !!(p.constructionOption || p.mergedIntoPropertyId || p.constructionBuiltAt);
}

export function RealEstatePage() {
  const { confirm } = useDialog();
  const [activeTab, setActiveTab] = useState<RealEstateTab>('assets');
  const [buyTarget, setBuyTarget] = useState<UnifiedProperty | null>(null);
  const [listTarget, setListTarget] = useState<UnifiedProperty | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [rentTermsTarget, setRentTermsTarget] = useState<UnifiedProperty | null>(null);
  const [rentPrice, setRentPrice] = useState('');
  const [rentDeposit, setRentDeposit] = useState('');
  const [rentNotes, setRentNotes] = useState('');
  const [rentActive, setRentActive] = useState(false);
  const [offerTarget, setOfferTarget] = useState<UnifiedProperty | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [bidTarget, setBidTarget] = useState<AuctionDto | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [confirmBuy, setConfirmBuy] = useState<{ target: UnifiedProperty; amount: number; idempotencyKey: string } | null>(null);
  const [confirmBid, setConfirmBid] = useState<{ auction: AuctionDto; amount: number; idempotencyKey: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();

  const { data: banking } = useQuery<{ cash: { amount: number } }>({
    queryKey: ['banking', 'overview'],
    queryFn: () => apiRequest('/api/v1/banking/overview'),
  });
  const cash = banking?.cash?.amount ?? 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    queryKey: ['auctions', 'overview'],
    queryFn: () => apiRequest<AuctionOverviewDto>('/api/v1/auctions'),
  });

  const { data: provinces = [] } = useQuery<ProvinceDto[]>({
    queryKey: ['characters', 'provinces'],
    queryFn: () => apiRequest<ProvinceDto[]>('/api/v1/characters/provinces'),
  });

  const provinceNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of provinces) m.set(p.code, p.name);
    return m;
  }, [provinces]);

  const {
    data: provinceLandAll = [],
    isLoading: provinceLandLoading,
    refetch: refetchProvinceLandAll,
  } = useQuery<UnifiedProperty[]>({
    queryKey: ['province-land', 'all', provinces.map((p) => p.code).join(',')],
    enabled: provinces.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        provinces.map(async (prov) => {
          try {
            const res = await apiRequest<{ provinceCode: string; properties: PropertyDto[] }>(
              `/api/v1/province-land/properties?province=${encodeURIComponent(prov.code)}`,
            );
            return (res.properties ?? []).map((p) => ({
              ...p,
              province: prov.name || p.province || prov.code,
              __source: 'province-land' as const,
              __provinceCode: prov.code,
              __provinceName: prov.name,
            }));
          } catch {
            return [] as UnifiedProperty[];
          }
        }),
      );
      return results.flat();
    },
  });

  const auctions = auctionOverview?.auctions ?? [];

  async function runAction(key: string, action: () => Promise<void>, successMsg: string) {
    setActionLoading(key);
    try {
      await action();
      await Promise.all([refetch(), refetchAuctions(), refetchProvinceLandAll()]);
      toast({ title: successMsg, variant: 'success' });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.problem?.detail ?? err.problem?.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Đã có lỗi xảy ra';
      toast({ title: msg, variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  function isBusy(key: string) {
    return actionLoading === key;
  }

  const coreProperties: UnifiedProperty[] = useMemo(
    () => (overview?.properties ?? []).map((p) => ({ ...p, __source: 'core' as const })),
    [overview],
  );

  const allProperties: UnifiedProperty[] = useMemo(() => {
    const merged = [...coreProperties, ...provinceLandAll];
    const seen = new Set<string>();
    return merged.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      if (p.mergedIntoPropertyId) return false;
      return true;
    });
  }, [coreProperties, provinceLandAll]);

  const owned = useMemo(() => allProperties.filter((p) => p.isMine), [allProperties]);
  const forSale = useMemo(
    () => allProperties.filter((p) => !p.isMine && (p.status === 'unowned' || p.status === 'listed')),
    [allProperties],
  );
  const forRent = useMemo(
    () =>
      allProperties.filter(
        (p) => !p.isMine && p.rentListingActive && p.monthlyRent.amount > 0 && p.status !== 'auction',
      ),
    [allProperties],
  );
  const leasedByMe = useMemo(() => allProperties.filter((p) => p.leasedByMe && p.activeLease), [allProperties]);
  const builtOfferable = useMemo(
    () =>
      allProperties.filter((p) => {
        if (p.isMine) return false;
        if (!p.ownerCharacterId) return false;
        if (p.status === 'auction') return false;
        return isBuilt(p);
      }),
    [allProperties],
  );

  const incomingOffers = useMemo(() => {
    const items: Array<{ offer: PropertySaleOfferDto; property: UnifiedProperty }> = [];
    for (const p of allProperties) {
      if (!p.isMine) continue;
      for (const o of p.offers ?? []) {
        if (o.status === 'pending' && o.sellerCharacterId) items.push({ offer: o, property: p });
      }
    }
    return items;
  }, [allProperties]);

  const portfolioValue = useMemo(() => owned.reduce((sum, p) => sum + (p.currentValue?.amount ?? 0), 0), [owned]);
  const monthlyRentIncome = useMemo(
    () =>
      owned.reduce(
        (sum, p) => sum + (p.activeLease ? (p.activeLease.monthlyRent?.amount ?? p.monthlyRent?.amount ?? 0) : 0),
        0,
      ),
    [owned],
  );

  const openList = (p: UnifiedProperty) => {
    setListTarget(p);
    setListPrice(String(p.askingPrice?.amount ?? p.currentValue.amount));
    setSaleNotes(p.saleNotes ?? '');
  };
  const openRentTerms = (p: UnifiedProperty) => {
    setRentTermsTarget(p);
    setRentPrice(String(p.monthlyRent.amount || 0));
    setRentDeposit(String(p.rentDeposit.amount || 0));
    setRentNotes(p.rentNotes ?? '');
    setRentActive(p.rentListingActive || p.monthlyRent.amount > 0);
  };
  const openOffer = (p: UnifiedProperty) => {
    setOfferTarget(p);
    setOfferAmount(String(p.askingPrice?.amount ?? p.currentValue.amount));
    setOfferMsg('');
  };
  const openBid = (a: AuctionDto) => {
    const suggested = a.currentBid.amount + Math.max(1, Math.round(a.currentBid.amount * 0.05));
    setBidTarget(a);
    setBidAmount(String(suggested));
  };

  const provinceLabel = (p: UnifiedProperty) =>
    p.__provinceName || provinceNameByCode.get(p.__provinceCode ?? '') || p.province || '—';

  const auctionTimeLeftLabel = (endsAt: string) => {
    const sec = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
    if (sec <= 0) return 'Đang chốt phiên';
    const totalGameMinutes = sec * 24;
    const gDays = Math.floor(totalGameMinutes / (24 * 60));
    const gHours = Math.floor((totalGameMinutes % (24 * 60)) / 60);
    const gMinutes = Math.floor(totalGameMinutes % 60);
    if (gDays > 0) return `${gDays} ngày ${gHours} giờ ${gMinutes} phút (game)`;
    return `${gHours} giờ ${gMinutes} phút (game)`;
  };

  async function respondOfferUnified(offerId: string, action: 'accept' | 'reject' | 'cancel', property: UnifiedProperty) {
    if (property.__source === 'province-land') {
      const prov = property.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/offers/respond?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({ offerId, action, provinceCode: prov }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/offers/respond', {
        method: 'POST',
        body: JSON.stringify({ offerId, action }),
      });
    }
  }

  async function demolishUnified(property: UnifiedProperty) {
    if (property.__source === 'province-land') {
      const prov = property.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/demolish?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id, provinceCode: prov }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/demolish', {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id }),
      });
    }
  }

  async function makeOfferUnified(property: UnifiedProperty, amount: number, message?: string) {
    if (property.__source === 'province-land') {
      const prov = property.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/offers?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id, amount: { amount, currency: 'VND' }, message, provinceCode: prov }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/offers', {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id, amount: { amount, currency: 'VND' }, message }),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500 animate-pulse">
        Đang tải dữ liệu bất động sản…
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        Không thể tải dữ liệu bất động sản.
      </div>
    );
  }

  const tabs: Array<{ key: RealEstateTab; label: string; badge?: number }> = [
    { key: 'assets', label: 'Tài sản của tôi', badge: incomingOffers.length || undefined },
    { key: 'market', label: 'Mua bán & đề xuất' },
    { key: 'rent', label: 'Cho thuê & hợp đồng' },
    { key: 'auctions', label: 'Đấu giá', badge: auctions.length || undefined },
  ];

  async function listPropertyUnified(p: UnifiedProperty, askingAmount: number, notes?: string) {
    if (p.__source === 'province-land') {
      const prov = p.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/list?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({
          propertyId: p.id,
          askingPrice: { amount: askingAmount, currency: 'VND' },
          saleNotes: notes || undefined,
          provinceCode: prov,
        }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/list', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: p.id,
          askingPrice: { amount: askingAmount, currency: 'VND' },
          saleNotes: notes || undefined,
        }),
      });
    }
  }

  async function unlistPropertyUnified(p: UnifiedProperty) {
    if (p.__source === 'province-land') {
      const prov = p.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/unlist?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({ propertyId: p.id, provinceCode: prov }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/unlist', {
        method: 'POST',
        body: JSON.stringify({ propertyId: p.id }),
      });
    }
  }

  async function updateRentTermsUnified(
    p: UnifiedProperty,
    input: { monthlyRentMinor: number; rentDepositMinor: number; rentListingActive: boolean; rentNotes?: string | null },
  ) {
    if (p.__source === 'province-land') {
      const prov = p.__provinceCode ?? '001';
      await apiRequest(`/api/v1/province-land/rent-terms?province=${encodeURIComponent(prov)}`, {
        method: 'POST',
        body: JSON.stringify({
          propertyId: p.id,
          monthlyRentMinor: input.monthlyRentMinor,
          rentDepositMinor: input.rentDepositMinor,
          rentListingActive: input.rentListingActive,
          rentNotes: input.rentNotes ?? null,
          provinceCode: prov,
        }),
      });
    } else {
      await apiRequest('/api/v1/real-estate/rent-terms', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: p.id,
          monthlyRentMinor: input.monthlyRentMinor,
          rentDepositMinor: input.rentDepositMinor,
          rentListingActive: input.rentListingActive,
          rentNotes: input.rentNotes ?? null,
        }),
      });
    }
  }

  const renderOwnedActions = (p: UnifiedProperty) => (
    <div className="flex flex-col gap-2 shrink-0 sm:min-w-[180px]">
      <GameButton variant="outline" size="sm" onClick={() => openRentTerms(p)}>Bảng giá thuê</GameButton>
      {(p.status === 'owned' || p.status === 'listed') && (
        <GameButton variant="outline" size="sm" onClick={() => openList(p)}>
          {p.status === 'listed' ? 'Cập nhật đăng bán' : 'Đặt bán/rao giá'}
        </GameButton>
      )}
      {p.status === 'listed' && (
        <GameButton
          variant="outline"
          size="sm"
          disabled={isBusy(`unlist-${p.__source}-${p.id}`)}
          onClick={() =>
            runAction(
              `unlist-${p.__source}-${p.id}`,
              () => unlistPropertyUnified(p),
              'Đã ngưng bán bất động sản.',
            )
          }
        >
          Ngưng bán
        </GameButton>
      )}

      {p.__source === 'province-land' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 text-right">
          <div className="font-medium text-slate-700">Tài sản tỉnh/thành</div>
          <div className="mt-0.5">
            Xây dựng/hợp thửa và quản lý chi tiết lô đất thực hiện trên{' '}
            <Link to="/" className="font-semibold text-emerald-700 underline">
              Bản đồ Thành phố
            </Link>{' '}
            (chọn tỉnh tương ứng).
          </div>
        </div>
      )}

      {(p.constructionOption || p.mergedIntoPropertyId || p.mergeGroupId) && p.status === 'owned' && (
        <GameButton
          variant="outline"
          size="sm"
          disabled={isBusy(`demolish-${p.__source}-${p.id}`)}
          onClick={async () => {
            const ok = await confirm({
              title: 'Phá dỡ công trình / Hủy hợp thửa?',
              type: 'danger',
              confirmText: 'Phá dỡ',
              message: 'Công trình sẽ bị phá dỡ / hủy hợp thửa để trả về đất nền.',
            });
            if (!ok) return;
            void runAction(
              `demolish-${p.__source}-${p.id}`,
              () => demolishUnified(p),
              'Đã phá dỡ công trình/hủy hợp thửa. Tài sản đã trở về đất nền.',
            );
          }}
        >
          Phá dỡ / Đất nền
        </GameButton>
      )}

      {p.__source === 'core' && p.activeLease && p.isMine && (
        <GameButton
          variant="outline"
          size="sm"
          disabled={isBusy(`terminate-${p.id}`)}
          onClick={async () => {
            const ok = await confirm({
              title: 'Hủy hợp đồng thuê trước hạn (chủ sở hữu)?',
              type: 'warning',
              confirmText: 'Hủy hợp đồng',
              message: [
                'Bạn sẽ MẤT CỌC (hoàn lại cọc cho người thuê).',
                'Bạn phải thanh toán 50% số tiền thuê còn lại tính đến khi hết hợp đồng.',
              ],
            });
            if (!ok) return;
            void runAction(
              `terminate-${p.id}`,
              async () => {
                await apiRequest('/api/v1/real-estate/lease/terminate', {
                  method: 'POST',
                  body: JSON.stringify({ propertyId: p.id }),
                });
              },
              'Đã hủy hợp đồng thuê trước hạn (chủ sở hữu).',
            );
          }}
        >
          Hủy hợp đồng thuê
        </GameButton>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Bất động sản" />
      {provinceLandLoading ? <div className="text-xs text-slate-500">Đang tải thêm dữ liệu tỉnh…</div> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tài sản sở hữu" value={String(owned.length)} />
        <StatCard label="Giá trị danh mục" value={formatCompact(portfolioValue)} />
        <StatCard
          label="Thu nhập thuê/tháng"
          value={formatMoney(monthlyRentIncome)}
          tone={monthlyRentIncome > 0 ? 'positive' : 'default'}
        />
        <StatCard label="Đang bán" value={String(forSale.filter((p) => p.status === 'listed').length)} tone="warning" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
        Trang này tổng hợp tài sản lõi và tài sản tỉnh/thành. Một số thao tác chi tiết của <b>tài sản tỉnh/thành</b>{' '}
        (xây dựng/hợp thửa, quản lý theo lô trên bản đồ) thực hiện tại{' '}
        <Link to="/" className="font-semibold text-emerald-700 underline">
          Bản đồ Thành phố
        </Link>
        .
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
            {tab.badge ? (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'assets' && (
        <div className="space-y-4">
          {incomingOffers.length > 0 && (
            <Panel title="Đề nghị mua cần xử lý (người bán)" borderColor="amber">
              <div className="space-y-3">
                {incomingOffers.map(({ offer, property: p }) => (
                  <div
                    key={offer.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">
                        {p.name} <span className="text-xs text-slate-500">({provinceLabel(p)})</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Đề nghị từ {offer.buyerName || 'Người mua'} ·{' '}
                        <span className="font-mono font-semibold">{formatMoney(offer.amount.amount)}</span>
                      </div>
                      {offer.message && <div className="text-xs text-slate-500 mt-1">"{offer.message}"</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <GameButton
                        size="sm"
                        variant="primary"
                        disabled={isBusy(offer.id)}
                        onClick={() =>
                          runAction(
                            offer.id,
                            () => respondOfferUnified(offer.id, 'accept', p),
                            'Đã chấp nhận đề nghị. Quyền sở hữu/cụm đã được chuyển.',
                          )
                        }
                      >
                        Chấp nhận
                      </GameButton>
                      <GameButton
                        size="sm"
                        variant="outline"
                        disabled={isBusy(offer.id)}
                        onClick={() =>
                          runAction(offer.id, () => respondOfferUnified(offer.id, 'reject', p), 'Đã từ chối đề nghị.')
                        }
                      >
                        Từ chối
                      </GameButton>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Bất động sản của bạn (tất cả tỉnh/thành)" borderColor="emerald">
            {owned.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                Bạn chưa sở hữu bất động sản nào. Hãy mua đất hoặc thắng đấu giá trên{' '}
                <Link to="/" className="text-emerald-700 underline font-medium">
                  Bản đồ Thành phố
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {owned.map((p) => (
                  <div
                    key={`${p.__source}-${p.id}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{p.name}</span>
                        <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                        {statusBadge(p.status)}
                        {p.__source === 'province-land' && <Badge variant="default">Tỉnh: {provinceLabel(p)}</Badge>}
                        {isBuilt(p) && <Badge variant="success">Có công trình</Badge>}
                        {p.rentListingActive && <Badge variant="success">Đang cho thuê (niêm yết)</Badge>}
                        {p.leasedByMe && <Badge variant="success">Bạn đang thuê</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Lô: {p.lotNumber || '—'} · Tỉnh/TP: {provinceLabel(p)} · ({p.location.x},{p.location.y}) · {p.zoneType}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>
                          Giá trị:{' '}
                          <span className="font-mono text-emerald-700">{formatMoney(p.currentValue.amount)}</span>
                        </span>
                        {p.__source === 'core' && (
                          <span>
                            Giá thuê/tháng: <span className="font-mono">{formatMoney(p.monthlyRent.amount)}</span>
                          </span>
                        )}
                        {p.askingPrice && (
                          <span>
                            Giá bán: <span className="font-mono text-amber-700">{formatMoney(p.askingPrice.amount)}</span>
                          </span>
                        )}
                        {p.rentDeposit.amount > 0 && <span>Cọc: {formatMoney(p.rentDeposit.amount)}</span>}
                        {p.activeLease ? <Badge variant="warning">Đang có người thuê</Badge> : null}
                      </div>
                      {p.activeLease && (
                        <div className="text-[11px] text-emerald-700 space-y-0.5 mt-1">
                          <div>
                            Hợp đồng thuê: {p.activeLease.tenantName || 'Người thuê'} ·{' '}
                            {formatMoney(p.activeLease.monthlyRent.amount)}/tháng · bắt đầu{' '}
                            {new Date(p.activeLease.startedAt).toLocaleDateString('vi-VN')} · kỳ tới{' '}
                            {new Date(p.activeLease.nextDueAt).toLocaleDateString('vi-VN')}
                            {p.activeLease.endsAt
                              ? ` · hết hạn ${new Date(p.activeLease.endsAt).toLocaleDateString('vi-VN')}`
                              : ''}
                          </div>
                          {typeof p.activeLease.deposit?.amount === 'number' && (
                            <div>Cọc: {formatMoney(p.activeLease.deposit.amount)}</div>
                          )}
                        </div>
                      )}
                      {p.rentNotes && <div className="text-[11px] text-slate-500">Ghi chú thuê: {p.rentNotes}</div>}
                      {p.saleNotes && <div className="text-[11px] text-slate-500">Ghi chú bán: {p.saleNotes}</div>}
                      {(p.offers ?? []).some((o) => o.status === 'pending') && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          {(p.offers ?? []).filter((o) => o.status === 'pending').length} đề nghị mua đang chờ (xem mục "Đề nghị
                          mua cần xử lý").
                        </div>
                      )}
                      <MergedMembersInfo members={p.mergedMembers} />
                    </div>
                    {renderOwnedActions(p)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="space-y-4">
          <Panel title="Bất động sản đang rao bán" borderColor="amber">
            {forSale.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Hiện không có bất động sản nào đang rao bán.</p>
            ) : (
              <div className="space-y-3">
                {forSale.map((p) => (
                  <div
                    key={`${p.__source}-sale-${p.id}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{p.name}</span>
                        <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                        {statusBadge(p.status)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Lô: {p.lotNumber || '—'} · Tỉnh/TP: {provinceLabel(p)} · ({p.location.x},{p.location.y}) · {p.zoneType}
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-lg font-bold text-emerald-700">
                          {formatMoney(p.askingPrice?.amount ?? p.purchasePrice.amount)}
                        </span>
                        {p.askingPrice && (
                          <span className="text-xs text-slate-500">(niêm yết; giá gốc {formatMoney(p.purchasePrice.amount)})</span>
                        )}
                        {p.status === 'unowned' && <span className="text-xs text-slate-500">(chưa có chủ)</span>}
                      </div>
                      {p.saleNotes && <div className="mt-1 text-xs text-slate-500">Ghi chú: {p.saleNotes}</div>}
                      <MergedMembersInfo members={p.mergedMembers} />
                      {(p.offers ?? []).some((o) => o.isMine && o.status === 'pending') && (
                        <div className="mt-1 flex flex-wrap gap-2 text-xs items-center">
                          <span className="text-amber-700">Bạn đã gửi đề nghị, chờ người bán phản hồi.</span>
                          {(p.offers ?? [])
                            .filter((o) => o.isMine && o.status === 'pending')
                            .map((o) => (
                              <GameButton
                                key={o.id}
                                size="sm"
                                variant="outline"
                                disabled={isBusy(o.id)}
                                onClick={() =>
                                  runAction(o.id, () => respondOfferUnified(o.id, 'cancel', p), 'Đã hủy đề nghị.')
                                }
                              >
                                Hủy đề nghị
                              </GameButton>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {p.__source === 'core' ? (
                        <GameButton variant="primary" size="sm" onClick={() => setBuyTarget(p)} disabled={isBusy(p.id)}>
                          Mua ngay
                        </GameButton>
                      ) : (
                        <div className="text-[11px] text-slate-500 max-w-[220px] text-right">
                          Mua trực tiếp (mua ngay) tài sản tỉnh/thành chưa hỗ trợ tại trang này; bạn có thể dùng <b>Đề nghị giá</b> để giao dịch với chủ sở hữu.
                        </div>
                      )}
                      {p.ownerCharacterId && p.status !== 'auction' && (
                        <GameButton variant="outline" size="sm" onClick={() => openOffer(p)}>
                          Đề nghị giá
                        </GameButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {builtOfferable.length > 0 && (
            <Panel title="Công trình đã xây dựng (có thể đề xuất mua)" borderColor="emerald">
              <div className="space-y-3">
                {builtOfferable.map((p) => (
                  <div
                    key={`built-${p.__source}-${p.id}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{p.name}</span>
                        <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                        {statusBadge(p.status)}
                        <Badge variant="success">Đã có công trình</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Lô: {p.lotNumber || '—'} · Tỉnh/TP: {provinceLabel(p)} · ({p.location.x},{p.location.y}) · {p.zoneType}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Công trình: <span className="font-medium">{p.constructionLabel || p.constructionOption || '—'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-lg font-bold text-emerald-700">{formatMoney(p.currentValue.amount)}</span>
                        <span className="text-xs text-slate-500">Giá trị hiện tại (tham chiếu)</span>
                      </div>
                      {(p.offers ?? []).some((o) => o.isMine && o.status === 'pending') && (
                        <div className="mt-1 flex flex-wrap gap-2 text-xs items-center">
                          <span className="text-amber-700">Bạn đã gửi đề xuất mua, chờ chủ sở hữu phản hồi.</span>
                          {(p.offers ?? [])
                            .filter((o) => o.isMine && o.status === 'pending')
                            .map((o) => (
                              <GameButton
                                key={o.id}
                                size="sm"
                                variant="outline"
                                disabled={isBusy(o.id)}
                                onClick={() =>
                                  runAction(o.id, () => respondOfferUnified(o.id, 'cancel', p), 'Đã hủy đề xuất mua.')
                                }
                              >
                                Hủy đề xuất
                              </GameButton>
                            ))}
                        </div>
                      )}
                      <MergedMembersInfo members={p.mergedMembers} />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {p.ownerCharacterId && p.status !== 'auction' && (
                        <GameButton variant="outline" size="sm" onClick={() => openOffer(p)}>
                          Đề xuất mua
                        </GameButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {activeTab === 'rent' && (
        <div className="space-y-4">
          {leasedByMe.length > 0 && (
            <Panel title="Bất động sản bạn đang thuê (hợp đồng thuê)" borderColor="emerald">
              <div className="space-y-3">
                {leasedByMe.map((p) => (
                  <div
                    key={`leased-${p.__source}-${p.id}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{p.name}</span>
                        <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                        <Badge variant="success">Đang thuê</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Lô: {p.lotNumber || '—'} · {provinceLabel(p)} · ({p.location.x},{p.location.y})
                      </div>
                      {p.activeLease && (
                        <div className="mt-1 text-xs text-slate-700 space-y-0.5">
                          <div>
                            Thuê: <span className="font-mono font-semibold">{formatMoney(p.activeLease.monthlyRent.amount)}</span>
                            /tháng · bắt đầu {new Date(p.activeLease.startedAt).toLocaleDateString('vi-VN')} · kỳ tới{' '}
                            {new Date(p.activeLease.nextDueAt).toLocaleDateString('vi-VN')}
                            {p.activeLease.endsAt ? ` · hết hạn ${new Date(p.activeLease.endsAt).toLocaleDateString('vi-VN')}` : ''}
                          </div>
                          {typeof p.activeLease.deposit?.amount === 'number' && (
                            <div>Tiền cọc đã đặt: {formatMoney(p.activeLease.deposit.amount)}</div>
                          )}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-amber-700">
                        Hủy trước hạn: bên hủy sẽ <b>mất cọc</b> và phải <b>thanh toán 50% số tiền thuê còn lại</b> tính đến khi
                        hết hợp đồng.
                      </div>
                      <MergedMembersInfo members={p.mergedMembers} />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {p.__source === 'core' ? (
                        <GameButton
                          variant="outline"
                          size="sm"
                          disabled={isBusy(`terminate-tenant-${p.id}`)}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Hủy hợp đồng thuê trước hạn (người thuê)?',
                              type: 'warning',
                              confirmText: 'Hủy hợp đồng',
                              message: [
                                'Bạn sẽ MẤT CỌC.',
                                'Bạn phải thanh toán 50% số tiền thuê còn lại tính đến khi hết hợp đồng.',
                              ],
                            });
                            if (!ok) return;
                            void runAction(
                              `terminate-tenant-${p.id}`,
                              async () => {
                                await apiRequest('/api/v1/real-estate/lease/terminate', {
                                  method: 'POST',
                                  body: JSON.stringify({ propertyId: p.id }),
                                });
                              },
                              'Đã hủy hợp đồng thuê trước hạn (người thuê).',
                            );
                          }}
                        >
                          Hủy hợp đồng thuê
                        </GameButton>
                      ) : (
                        <div className="text-[11px] text-slate-500 max-w-[220px] text-right">
                          Hợp đồng/thuê tài sản tỉnh có thể được quản lý theo luồng riêng (bản đồ/tỉnh).
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Bảng giá cho thuê" borderColor="emerald">
            <div className="space-y-3">
              {forRent.length > 0 ? (
                forRent.map((p) => (
                  <div
                    key={`${p.__source}-rent-${p.id}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{p.name}</span>
                        <Badge variant="default">{propertyTypeLabel(p.propertyType)}</Badge>
                        {p.status === 'listed' && <Badge variant="warning">Đang rao bán</Badge>}
                        {p.activeLease && <Badge variant="success">Đã có người thuê</Badge>}
                      </div>
                      <div className="text-xs text-slate-600">Lô: {p.lotNumber || '—'} · {provinceLabel(p)}</div>
                      <div className="mt-1 text-sm">
                        <span className="text-slate-600">Giá thuê:</span>{' '}
                        <span className="font-mono font-semibold">{formatMoney(p.monthlyRent.amount)}/tháng</span>
                        {p.rentDeposit.amount > 0 && (
                          <span className="text-xs text-slate-500"> · Cọc {formatMoney(p.rentDeposit.amount)}</span>
                        )}
                      </div>
                      <MergedMembersInfo members={p.mergedMembers} />
                      {p.rentNotes && <div className="text-[11px] text-slate-500">Điều khoản: {p.rentNotes}</div>}
                      {p.activeLease && !p.leasedByMe && (
                        <div className="text-[11px] text-slate-500">
                          Hiện đang được thuê bởi {p.activeLease.tenantName || 'người khác'}.
                        </div>
                      )}
                    </div>
                    {p.__source === 'core' ? (
                      <GameButton
                        variant="primary"
                        size="sm"
                        disabled={isBusy(p.id) || p.leasedByMe || !!p.activeLease}
                        onClick={() =>
                          runAction(
                            p.id,
                            async () => {
                              await apiRequest(`/api/v1/real-estate/rent`, {
                                method: 'POST',
                                body: JSON.stringify({ propertyId: p.id }),
                              });
                            },
                            `Thuê thành công: đã thanh toán ${formatMoney(p.monthlyRent.amount + p.rentDeposit.amount)} (thuê ${formatMoney(p.monthlyRent.amount)}${p.rentDeposit.amount > 0 ? ` + cọc ${formatMoney(p.rentDeposit.amount)}` : ''}).`,
                          )
                        }
                      >
                        {isBusy(p.id)
                          ? 'Đang xử lý…'
                          : p.leasedByMe
                            ? 'Bạn đang thuê'
                            : p.activeLease
                              ? 'Đã có người thuê'
                              : 'Thuê theo bảng giá'}
                      </GameButton>
                    ) : (
                      <span className="text-[11px] text-slate-500 max-w-[220px] text-right">Tạo hợp đồng thuê (thuê theo bảng giá) cho tài sản tỉnh/thành chưa hỗ trợ; chủ sở hữu có thể đặt bảng giá niêm yết.</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có bất động sản nào mở cho thuê với bảng giá.
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'auctions' && (
        <div className="space-y-4">
          <Panel title="Đấu giá phát mãi (tất cả phiên đang mở)" borderColor="amber">
            <div className="space-y-3">
              {auctionsLoading ? (
                <div className="text-center py-4 text-xs text-slate-500 animate-pulse">Đang tải phiên đấu giá…</div>
              ) : auctions.length > 0 ? (
                auctions.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl border border-slate-200 bg-white/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{a.propertyName}</span>
                        <Badge variant="warning">Đang đấu giá phát mãi</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Người bán: {a.sellerName} · Thời lượng: <b>3 ngày game</b> (3 phút thực)
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Còn lại (giờ game):{' '}
                        <span className="font-mono font-semibold text-rose-700">{auctionTimeLeftLabel(a.endsAt)}</span>
                        {' · '}Mốc kết thúc thực:{' '}
                        {new Date(a.endsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-mono text-lg font-bold text-emerald-700">{formatMoney(a.currentBid.amount)}</span>
                        <span className="text-xs text-slate-500">(khởi điểm {formatMoney(a.startingPrice.amount)})</span>
                      </div>
                      {a.highestBidderName && (
                        <div className="mt-1 text-xs text-slate-500">Cao nhất: {a.highestBidderName}</div>
                      )}
                    </div>
                    <GameButton variant="primary" size="sm" disabled={isBusy(a.id) || a.isHighestBidder} onClick={() => openBid(a)}>
                      {a.isHighestBidder ? 'Bạn đang giữ giá' : 'Đặt giá'}
                    </GameButton>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  Hiện không có bất động sản nào đang được đấu giá phát mãi (không có phiên đấu giá mở thực tế).
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Buy (core only) */}
      <Modal open={!!buyTarget} onClose={() => setBuyTarget(null)} title="Mua bất động sản">
        {buyTarget && (
          <div className="space-y-3">
            <div className="text-sm">
              <span className="text-slate-600">Tài sản:</span> <span className="font-medium">{buyTarget.name}</span>
            </div>
            <div className="text-xs text-slate-600">
              Lô {buyTarget.lotNumber || '—'} · {provinceLabel(buyTarget)} · ({buyTarget.location.x},{buyTarget.location.y})
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Giá mua</span>
              <span className="font-mono text-emerald-700 font-semibold">
                {formatMoney(buyTarget.askingPrice?.amount ?? buyTarget.purchasePrice.amount)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Hệ thống sẽ kiểm tra số dư. Nếu không đủ tiền, bạn sẽ nhận thông báo.</p>
            <GameButton
              variant="primary"
              disabled={isBusy(buyTarget.id) || buyTarget.__source !== 'core'}
              onClick={() => {
                const amount = buyTarget.askingPrice?.amount ?? buyTarget.purchasePrice.amount;
                setConfirmBuy({ target: buyTarget, amount, idempotencyKey: createIdempotencyKey() });
              }}
            >
              Xác nhận mua
            </GameButton>
          </div>
        )}
      </Modal>

      {/* List / sale (core only) */}
      <Modal open={!!listTarget} onClose={() => setListTarget(null)} title="Đăng bán / trao đổi giá">
        {listTarget && (
          <div className="space-y-3">
            <div className="text-sm font-medium">
              {listTarget.name} · Lô {listTarget.lotNumber || '—'} · {provinceLabel(listTarget)}
            </div>
            <GameInput label="Giá bán niêm yết (VNĐ)" type="number" value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
            <GameInput
              label="Ghi chú/điều khoản trao đổi"
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              placeholder="VD: có thương lượng, bao gồm nội thất..."
            />
            <p className="text-[11px] text-slate-500">
              Người mua có thể mua đúng giá hoặc gửi đề nghị để trao đổi/chốt giá với bạn.
            </p>
            <GameButton
              variant="primary"
              loading={isBusy(listTarget.id)}
              disabled={isBusy(listTarget.id)}
              onClick={() => {
                const v = Number(listPrice);
                if (!Number.isFinite(v) || v <= 0) {
                  toast({ title: 'Giá không hợp lệ', variant: 'error' });
                  return;
                }
                runAction(
                  listTarget.id,
                  async () => {
                    await listPropertyUnified(listTarget, Math.round(v), saleNotes || undefined);
                    setListTarget(null);
                  },
                  'Đã đăng bán/rao giá bất động sản.',
                );
              }}
            >
              Đăng bán
            </GameButton>
          </div>
        )}
      </Modal>

      {/* Rent terms management (core only) */}
      <Modal open={!!rentTermsTarget} onClose={() => setRentTermsTarget(null)} title="Bảng giá & quản lý cho thuê">
        {rentTermsTarget && (
          <div className="space-y-3">
            <div className="text-sm font-medium">
              {rentTermsTarget.name} · Lô {rentTermsTarget.lotNumber || '—'}
            </div>
            {rentTermsTarget.activeLease && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Bất động sản đang có hợp đồng thuê hoạt động. Tắt "Mở cho thuê" chỉ ngưng niêm yết/nhận khách thuê mới,{' '}
                <b>không kết thúc</b> hợp đồng hiện tại. Để ngưng cho thuê ngay, hãy dùng nút <b>"Hủy hợp đồng thuê"</b> (áp dụng
                điều kiện/phạt bồi thường theo quy định và cần đủ số dư nếu phải thanh toán).
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rentActive} onChange={(e) => setRentActive(e.target.checked)} /> Mở cho thuê (hiển
              thị bảng giá)
            </label>
            <GameInput label="Giá thuê/tháng (VNĐ)" type="number" value={rentPrice} onChange={(e) => setRentPrice(e.target.value)} />
            <GameInput label="Tiền đặt cọc (VNĐ)" type="number" value={rentDeposit} onChange={(e) => setRentDeposit(e.target.value)} />
            <GameInput
              label="Ghi chú/điều khoản thuê"
              value={rentNotes}
              onChange={(e) => setRentNotes(e.target.value)}
              placeholder="VD: tối thiểu 3 tháng, không nuôi thú..."
            />
            <GameButton
              variant="primary"
              loading={isBusy(rentTermsTarget.id)}
              disabled={isBusy(rentTermsTarget.id)}
              onClick={() => {
                const mr = Number(rentPrice) || 0;
                const dep = Number(rentDeposit) || 0;
                runAction(
                  rentTermsTarget.id,
                  async () => {
                    await updateRentTermsUnified(rentTermsTarget, {
                      monthlyRentMinor: Math.round(mr),
                      rentDepositMinor: Math.round(dep),
                      rentListingActive: rentActive,
                      rentNotes: rentNotes || null,
                    });
                    setRentTermsTarget(null);
                  },
                  'Đã cập nhật bảng giá/điều khoản cho thuê.',
                );
              }}
            >
              Lưu bảng giá
            </GameButton>
          </div>
        )}
      </Modal>

      {/* Offer */}
      <Modal open={!!offerTarget} onClose={() => setOfferTarget(null)} title="Gửi đề nghị mua / trao đổi giá">
        {offerTarget && (
          <div className="space-y-3">
            <div className="text-sm">
              BĐS: <span className="font-medium">{offerTarget.name}</span> · Giá niêm yết:{' '}
              {formatMoney(offerTarget.askingPrice?.amount ?? offerTarget.currentValue.amount)}
            </div>
            <div className="text-xs text-slate-600">
              Tỉnh/TP: {provinceLabel(offerTarget)} {offerTarget.__source === 'province-land' ? '(đất/công trình tỉnh)' : '(lõi)'}
            </div>
            <GameInput label="Số tiền đề nghị (VNĐ)" type="number" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} />
            <GameInput
              label="Lời nhắn trao đổi"
              value={offerMsg}
              onChange={(e) => setOfferMsg(e.target.value)}
              placeholder="VD: đề nghị chốt giá..."
            />
            <p className="text-[11px] text-slate-500">
              Người bán sẽ xem và có thể chấp nhận (chốt giá), từ chối hoặc tiếp tục trao đổi.
            </p>
            <GameButton
              variant="primary"
              loading={isBusy(offerTarget.id)}
              disabled={isBusy(offerTarget.id)}
              onClick={() => {
                const v = Number(offerAmount);
                if (!Number.isFinite(v) || v <= 0) {
                  toast({ title: 'Số tiền không hợp lệ', variant: 'error' });
                  return;
                }
                runAction(
                  offerTarget.id,
                  async () => {
                    await makeOfferUnified(offerTarget, Math.round(v), offerMsg || undefined);
                    setOfferTarget(null);
                  },
                  'Đã gửi đề nghị. Chờ người bán phản hồi/chốt giá.',
                );
              }}
            >
              Gửi đề nghị
            </GameButton>
          </div>
        )}
      </Modal>

      {/* Bid */}
      <Modal open={!!bidTarget} onClose={() => setBidTarget(null)} title="Đặt giá đấu">
        {bidTarget && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tài sản</span>
              <span className="font-medium">{bidTarget.propertyName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Giá hiện tại</span>
              <span className="font-mono text-emerald-700">{formatMoney(bidTarget.currentBid.amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Còn lại (giờ game)</span>
              <span className="font-mono text-rose-700">{auctionTimeLeftLabel(bidTarget.endsAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Mốc kết thúc thực</span>
              <span className="font-mono text-slate-700">
                {new Date(bidTarget.endsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">Thời lượng phiên: 3 ngày game (3 phút thực), hiển thị theo giờ game.</div>
            <GameInput id="auction-bid-amount" label="Giá bạn đặt (đ)" type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
            <p className="text-[11px] text-slate-500">
              Tiền được khóa trong escrow; nếu bị vượt giá sẽ hoàn trả. Cần đủ số dư để đặt giá.
            </p>
            <GameButton
              variant="primary"
              disabled={isBusy(bidTarget.id)}
              onClick={() => {
                const v = Math.round(Number(bidAmount));
                if (!Number.isFinite(v) || v <= bidTarget.currentBid.amount) {
                  toast({
                    title: 'Giá đặt không hợp lệ',
                    description: `Giá phải lớn hơn giá hiện tại (${formatMoney(bidTarget.currentBid.amount)}).`,
                    variant: 'error',
                  });
                  return;
                }
                setConfirmBid({ auction: bidTarget, amount: v, idempotencyKey: createIdempotencyKey() });
              }}
            >
              Tiếp tục xác nhận
            </GameButton>
          </div>
        )}
      </Modal>

      <TransactionConfirmModal
        open={!!confirmBuy}
        onClose={() => {
          if (confirmBuy && !isBusy(confirmBuy.target.id)) setConfirmBuy(null);
        }}
        onConfirm={async () => {
          if (!confirmBuy) return;
          await runAction(
            confirmBuy.target.id,
            async () => {
              await apiRequest('/api/v1/real-estate/buy', {
                method: 'POST',
                headers: { 'X-Idempotency-Key': confirmBuy.idempotencyKey },
                body: JSON.stringify({ propertyId: confirmBuy.target.id }),
              });
              setConfirmBuy(null);
              setBuyTarget(null);
            },
            'Mua bất động sản thành công.',
          );
        }}
        loading={!!(confirmBuy && isBusy(confirmBuy.target.id))}
        title="Xác nhận mua bất động sản"
        transactionType="Mua đất / Mua bất động sản"
        targetLabel="Bất động sản"
        targetValue={
          confirmBuy ? `${confirmBuy.target.name} · Lô ${confirmBuy.target.lotNumber || '—'} · ${provinceLabel(confirmBuy.target)}` : ''
        }
        amountMinor={confirmBuy?.amount}
        feeOrRateValue="Phí: 0 đ (nếu có phí khác, hệ thống sẽ áp dụng theo quy định)"
        projectedBalanceMinor={confirmBuy ? cash - confirmBuy.amount : undefined}
        warning="Hành động mua bất động sản không thể hoàn tác. Hệ thống sẽ kiểm tra số dư tại thời điểm thực hiện."
      />

      <TransactionConfirmModal
        open={!!confirmBid}
        onClose={() => {
          if (confirmBid && !isBusy(confirmBid.auction.id)) setConfirmBid(null);
        }}
        onConfirm={async () => {
          if (!confirmBid) return;
          await runAction(
            confirmBid.auction.id,
            async () => {
              await apiRequest(`/api/v1/auctions/${confirmBid.auction.id}/bid`, {
                method: 'POST',
                headers: { 'X-Idempotency-Key': confirmBid.idempotencyKey },
                body: JSON.stringify({ auctionId: confirmBid.auction.id, amount: { amount: confirmBid.amount, currency: 'VND' } }),
              });
              setConfirmBid(null);
              setBidTarget(null);
            },
            `Đã đặt giá ${formatMoney(confirmBid.amount)} cho "${confirmBid.auction.propertyName}". Tiền đã được giữ trong escrow; nếu bị vượt giá sẽ được hoàn trả.`,
          );
        }}
        loading={!!(confirmBid && isBusy(confirmBid.auction.id))}
        title="Xác nhận đặt giá đấu"
        transactionType="Đặt giá đấu giá đất / bất động sản"
        targetLabel="Phiên đấu giá"
        targetValue={confirmBid ? confirmBid.auction.propertyName : ''}
        amountLabel="Giá đặt"
        amountMinor={confirmBid?.amount}
        feeOrRateValue="Phí: 0 đ · Tiền giữ trong escrow (hoàn nếu bị vượt giá)"
        projectedBalanceLabel="Số dư tiền mặt dự kiến (ước tính sau khi giữ tiền)"
        projectedBalanceMinor={confirmBid ? cash - confirmBid.amount : undefined}
        warning="Giá đặt phải hợp lệ tại thời điểm thực hiện. Hệ thống sẽ kiểm tra số dư và điều kiện phiên đấu giá."
      />
    </div>
  );
}
