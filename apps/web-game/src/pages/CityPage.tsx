import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapCanvas2D } from '../game/map/MapCanvas2D';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import {
  type AuctionOverviewDto,
  type CharacterDto,
  type MapDto,
  type ProvinceDto,
  type RealEstateOverviewDto,
} from '@efls/contracts';
import type { MapProperty } from '../game/map/MapData';
import {
  clusterContaining,
  constructionOptionsFor,
  findOwnedClusters,
  projectedValue,
} from '@efls/domain';

interface SelectedPlot {
  col: number;
  row: number;
  property?: MapProperty;
  /** Giá đất nền do admin đặt (VNĐ minor). 0 = chưa rao bán. */
  landPriceMinor: number;
  /** Ô filler ngoài ô dữ liệu server (đất hoang visual). */
  fillerZone?: string;
}

export function CityPage() {
  const {
    data: character,
    isLoading: characterLoading,
    refetch: refetchCharacter,
  } = useQuery<CharacterDto>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
  });

  const { data: provinces } = useQuery<ProvinceDto[]>({
    queryKey: ['characters', 'provinces'],
    queryFn: () => apiRequest<ProvinceDto[]>('/api/v1/characters/provinces'),
  });

  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const activeProvince = selectedProvince ?? character?.birthplace ?? '001';

  const {
    data: mapDto,
    isLoading: mapLoading,
    error: mapError,
    refetch: refetchMap,
  } = useQuery<MapDto>({
    queryKey: ['map', activeProvince],
    queryFn: () =>
      apiRequest<MapDto>(
        activeProvince === '001' ? '/api/v1/map' : `/api/v1/map?province=${activeProvince}`,
      ),
  });

  const { data: realEstate, isLoading: reLoading } = useQuery<RealEstateOverviewDto>({
    queryKey: ['real-estate', 'overview'],
    queryFn: () => apiRequest<RealEstateOverviewDto>('/api/v1/real-estate/overview'),
  });

  // Phiên đấu giá đang mở (AI Game Master) — highlight ô đất trên bản đồ.
  const { data: auctionOverview, refetch: refetchAuctions } = useQuery<AuctionOverviewDto>({
    queryKey: ['auctions', 'overview'],
    queryFn: () => apiRequest<AuctionOverviewDto>('/api/v1/auctions/overview'),
    refetchInterval: 10_000,
  });

  const [selected, setSelected] = useState<SelectedPlot | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseOk, setPurchaseOk] = useState<string | null>(null);
  const [movingProvince, setMovingProvince] = useState<string | null>(null);

  // Tên chủ sở hữu hiển thị từ mã nhân vật (server không trả tên trong bản đồ tỉnh).
  const ownerName = selected?.property?.ownerCharacterId
    ? character?.id === selected.property.ownerCharacterId
      ? `${character.fullName} (bạn)`
      : `Mã ${selected.property.ownerCharacterId.slice(0, 8)}…`
    : null;
  // Thuế BĐS hàng tháng = giá trị × 5%/năm ÷ 12.
  const monthlyTax = (priceMinor: number) => Math.round((priceMinor * 5) / 100 / 12);

  async function handleMoveProvince(province: ProvinceDto, index: number) {
    setSelectedProvince(province.code);
    const anchor = { x: (index % 16) * 2, y: Math.floor(index / 16) * 6 + 2 };
    setMovingProvince(province.code);
    try {
      await apiRequest('/api/v1/characters/me/location', {
        method: 'PUT',
        body: JSON.stringify(anchor),
      });
      void refetchCharacter();
      void refetchMap();
    } catch {
      // lỗi đã xử lý bởi httpClient
    } finally {
      setMovingProvince(null);
    }
  }

  const mapData = useMemo(() => {
    if (!mapDto) return null;
    // Bất động sản chỉ thuộc bản đồ Hà Nội (001); các tỉnh khác không gắn bất động sản.
    const properties =
      activeProvince === '001' && realEstate
        ? realEstate.properties.map((p) => ({
            id: p.id,
            nodeId: p.nodeId,
            ownerId: p.ownerCharacterId,
            ownerCharacterId: p.ownerCharacterId,
            name: p.name,
            type: p.propertyType,
            status: p.status,
            purchasePriceMinor: p.purchasePrice.amount,
            askingPriceMinor: p.askingPrice?.amount ?? null,
            isMine: p.isMine,
            valueMinor: p.currentValue.amount,
          }))
        : [];
    return { ...mapDto, properties };
  }, [mapDto, realEstate, activeProvince]);

  const handleSelectPlot = (col: number, row: number) => {
    setPurchaseError(null);
    setPurchaseOk(null);
    if (!mapData) return;
    const node = mapData.nodes.find((n) => n.x === col && n.y === row);
    const property = node ? mapData.properties.find((p) => p.nodeId === node.id) : undefined;
    setSelected({ col, row, property, landPriceMinor: node?.landPriceMinor ?? 0 });
  };

  /** Ô đất đang đấu giá: đối chiếu propertyId với BĐS trên bản đồ để lấy tọa độ.
   *  Chỉ áp dụng ở tỉnh 001 (nơi chứa BĐS trong DB) — các tỉnh khác không highlight. */
  const auctioningTile = useMemo(() => {
    if (!auctionOverview || !realEstate || activeProvince !== '001') return null;
    for (const auction of auctionOverview.auctions) {
      const property = realEstate.properties.find((p) => p.id === auction.propertyId);
      if (property) return { x: property.location.x, y: property.location.y };
    }
    return null;
  }, [auctionOverview, realEstate, activeProvince]);

  /** Phiên đấu giá sớm nhất (AI Game Master) cho widget nổi. */
  const realAuction = auctionOverview?.auctions[0] ?? null;
  /** Mock phiên tự sinh khi server chưa có phiên thật: ô đất hoang ngẫu nhiên + đếm ngược. */
  const [mockAuction, setMockAuction] = useState<{
    id: string;
    x: number;
    y: number;
    endsAt: string;
    startingPriceMinor: number;
  } | null>(null);
  const [mockBid, setMockBid] = useState<number | null>(null);
  useEffect(() => {
    if (realAuction) {
      setMockAuction(null);
      setMockBid(null);
      return;
    }
    if (mockAuction && new Date(mockAuction.endsAt).getTime() > Date.now()) return;
    const priced =
      mapData?.nodes.filter((n) => n.landPriceMinor > 0 && n.zoneType !== 'water') ?? [];
    const pick = priced[Math.floor(Math.random() * priced.length)];
    setMockAuction({
      id: 'mock-auction',
      x: pick?.x ?? 5,
      y: pick?.y ?? 5,
      endsAt: new Date(Date.now() + 105_000).toISOString(),
      startingPriceMinor: pick?.landPriceMinor ?? 50_000_000,
    });
    setMockBid(null);
  }, [realAuction, mapData]);
  const activeAuction =
    realAuction ??
    (mockAuction
      ? {
          id: mockAuction.id,
          propertyId: 'mock',
          propertyName: 'Đất hoang',
          sellerCharacterId: 'gm',
          sellerName: 'AI Game Master',
          startingPrice: { amount: mockAuction.startingPriceMinor, currency: 'VND' },
          currentBid: {
            amount: mockBid ?? mockAuction.startingPriceMinor,
            currency: 'VND',
          },
          highestBidderId: null,
          highestBidderName: null,
          endsAt: mockAuction.endsAt,
          status: 'open',
          createdAt: new Date().toISOString(),
          isMine: false,
          isHighestBidder: false,
        }
      : null);
  const isMockAuction = !!mockAuction && !realAuction;

  /** Vị trí ô đấu giá hiển thị trên Canvas (kể cả phiên mock tự sinh). */
  const auctionTilePos =
    auctioningTile ??
    (isMockAuction && mockAuction ? { x: mockAuction.x, y: mockAuction.y } : null);
  /** Ô đang chọn có phải ô đấu giá không. */
  const selectedTileAuctioning =
    !!auctionTilePos &&
    selected != null &&
    auctionTilePos.x === selected.col &&
    auctionTilePos.y === selected.row;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const auctionCountdown = activeAuction
    ? Math.max(0, Math.floor((new Date(activeAuction.endsAt).getTime() - now) / 1000))
    : 0;
  const countdownLabel = `${String(Math.floor(auctionCountdown / 60)).padStart(2, '0')}:${String(auctionCountdown % 60).padStart(2, '0')}`;
  const [bidInput, setBidInput] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  async function handlePlaceBid() {
    if (!activeAuction) return;
    const amount = Math.floor(Number(bidInput) || 0);
    if (amount <= 0) {
      setBidError('Nhập số tiền đặt giá hợp lệ.');
      return;
    }
    // Phiên mock: cập nhật giá hiển thị ngay (phiên thật gửi lên server).
    if (isMockAuction) {
      setMockBid(amount);
      setBidInput('');
      setBidError(null);
      return;
    }
    setBidding(true);
    setBidError(null);
    try {
      await apiRequest(`/api/v1/auctions/${activeAuction.id}/bid`, {
        method: 'POST',
        body: JSON.stringify({ amount: { amount, currency: 'VND' } }),
      });
      setBidInput('');
      await refetchAuctions();
    } catch (caught) {
      setBidError(caught instanceof Error ? caught.message : 'Không thể đặt giá đấu giá.');
    } finally {
      setBidding(false);
    }
  }

  /** Click ô đất hoang (filler): hiển thị thông tin vùng. */
  const handleSelectFill = (tile: { wx: number; wy: number; zone: string }) => {
    setPurchaseError(null);
    setPurchaseOk(null);
    setSelected({
      col: Math.round(tile.wx),
      row: Math.round(tile.wy),
      landPriceMinor: 0,
      fillerZone: tile.zone,
    });
  };

  /**
   * Các khối hợp thửa của tôi — gắn provinceId: chỉ tỉnh 001 (bản đồ DB chứa BĐS)
   * mới có dữ kiện sở hữu; chuyển tỉnh khác → reset, hiển thị đất hoang bình thường.
   */
  const ownedClusters = useMemo(() => {
    if (!realEstate || activeProvince !== '001') return [];
    const ownedKeys = realEstate.properties
      .filter((p) => p.isMine)
      .map((p) => `${activeProvince}_${p.location.x}_${p.location.y}`);
    const ownedCells = ownedKeys.map((key) => {
      const [, x, y] = key.split('_');
      return { x: Number(x), y: Number(y) };
    });
    return findOwnedClusters(ownedCells);
  }, [realEstate, activeProvince]);

  /** Khối hợp thửa chứa ô đang chọn (nếu thuộc sở hữu). */
  const selectedCluster = selected
    ? clusterContaining(ownedClusters, selected.col, selected.row)
    : null;
  const buildOptions = selectedCluster ? constructionOptionsFor(selectedCluster) : [];
  const [buildChoice, setBuildChoice] = useState<string | null>(null);

  if (characterLoading || mapLoading || reLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        <p className="mt-4 text-sm text-slate-600">Đang tải thành phố...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>Chưa có nhân vật. Vui lòng tạo nhân vật.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiền mặt"
          value={formatMoney(character.netWorth.amount)}
          hint="Ví cá nhân"
          tone="positive"
        />
        <StatCard
          label="Tài sản ròng"
          value={formatMoney(character.netWorth.amount)}
          hint="Tổng tài sản − tổng nợ"
        />
        <StatCard
          label="Credit Score"
          value={character.creditScore}
          hint={character.creditScore >= 700 ? 'Tốt' : 'Cần cải thiện'}
        />
        <StatCard
          label="Heat Level"
          value={`${character.heatLevel} / 100`}
          hint="Mức truy nã ngầm"
        />
      </div>

      {/* 2 cột: trái = thanh ngang thông tin ô + bản đồ 2D, phải = menu tỉnh dọc */}
      <div className="flex flex-1 min-h-0 gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Thanh ngang: Thông tin ô đất (100% cột trái, trên bản đồ) */}
          <div className="flex w-full flex-row items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3 shadow-sm">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-600">
                    Thông tin ô đất
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    [{selected.col}, {selected.row}]
                  </span>
                  <span className="text-slate-600">
                    {mapDto?.provinceName ??
                      provinces?.find((p) => p.code === activeProvince)?.name ??
                      activeProvince}
                  </span>
                  {selected.property && (
                    <>
                      <span className="truncate font-semibold text-slate-900">
                        {selected.property.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          selected.property.status === 'unowned'
                            ? 'bg-slate-100 text-slate-600'
                            : selected.property.status === 'listed'
                              ? 'bg-amber-100 text-amber-700'
                              : selected.property.isMine
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {selected.property.status === 'unowned'
                          ? 'Đất trống'
                          : selected.property.status === 'listed'
                            ? 'Đang bán'
                            : selected.property.isMine
                              ? 'Của bạn'
                              : 'Đã có công trình'}
                      </span>
                      <span className="text-slate-600">
                        Loại: <span className="font-semibold">{selected.property.type}</span>
                      </span>
                      {selected.property.ownerCharacterId ? (
                        <span className="text-slate-600">
                          Chủ sở hữu: <span className="font-semibold">{ownerName}</span>
                        </span>
                      ) : (
                        <>
                          <span className="text-slate-600">
                            Giá:{' '}
                            <span className="font-mono font-bold text-emerald-700">
                              {formatMoney(selected.property.purchasePriceMinor)}
                            </span>
                          </span>
                          <span className="text-slate-600">
                            Thuế/tháng:{' '}
                            <span className="font-mono font-bold text-rose-600">
                              {formatMoney(monthlyTax(selected.property.purchasePriceMinor))}
                            </span>
                          </span>
                        </>
                      )}
                      {selected.property.askingPriceMinor != null && (
                        <span className="text-slate-600">
                          Giá bán:{' '}
                          <span className="font-mono font-bold text-amber-700">
                            {formatMoney(selected.property.askingPriceMinor)}
                          </span>
                        </span>
                      )}
                      {selected.property.isMine && selectedCluster && (
                        <span className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs">
                          <span className="font-bold text-orange-700">
                            🏗 Khối hợp thửa {selectedCluster.size} ô — chọn hạng mục:
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {buildOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setBuildChoice(option.id)}
                                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                                  buildChoice === option.id
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-white text-orange-700 ring-1 ring-orange-300 hover:bg-orange-100'
                                }`}
                              >
                                {option.label} (×{option.valueMultiplier})
                              </button>
                            ))}
                          </span>
                          {buildChoice && (
                            <span className="mt-1 block font-mono text-[11px] text-orange-800">
                              Ước tính sau xây:{' '}
                              {formatMoney(
                                projectedValue(
                                  selected.property.valueMinor,
                                  buildOptions.find((o) => o.id === buildChoice)?.valueMultiplier ??
                                    1,
                                ),
                              )}
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  )}
                  {!selected.property &&
                    (selectedTileAuctioning ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">
                        🔨 Đang đấu giá — đặt giá ở Widget Đấu Giá trong sidebar
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Đất hoang — Đang chờ AI Game Master mở phiên đấu giá
                      </span>
                    ))}
                  {selected.fillerZone && !selected.property && (
                    <span className="text-slate-600">
                      Đất hoang · Vùng: <span className="font-semibold">{selected.fillerZone}</span>
                    </span>
                  )}
                  {purchaseError && (
                    <span className="text-[11px] text-rose-600">{purchaseError}</span>
                  )}
                  {purchaseOk && (
                    <span className="text-[11px] font-semibold text-emerald-600">{purchaseOk}</span>
                  )}
                </div>
                {/* Đất chỉ mua trong phiên đấu giá — không còn mua trực tiếp. */}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Nhấp vào một ô đất trên bản đồ 2D để xem thông tin. Đất chỉ sở hữu qua phiên đấu
                giá.
              </p>
            )}
          </div>

          {mapError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Lỗi tải bản đồ tỉnh {activeProvince}: {String(mapError)}
            </div>
          )}
          {/* Bản đồ 2D Canvas 1000×1000 (zoom/pan) theo tỉnh + widget đấu giá nổi (~60% diện tích) */}
          <div className="relative mx-auto w-[48%]">
            <MapCanvas2D
              mapData={mapData ?? undefined}
              selected={selected ? { col: selected.col, row: selected.row } : null}
              auctioningTile={auctionTilePos}
              mergedClusters={ownedClusters
                .filter((c) => c.size > 1)
                .map((c) => ({
                  cells: c.cells,
                  label: c.tier === 'large' ? `Hợp thửa ${c.size} ô` : `Hợp thửa ${c.size} ô`,
                }))}
              onSelectPlot={handleSelectPlot}
              onSelectFill={handleSelectFill}
            />
          </div>
        </div>

        <aside className="grid w-[620px] flex-shrink-0 grid-cols-2 gap-3">
          <div className="h-full">
            <Panel title="Phiên Đấu Giá Đất (AI Game Master)" borderColor="rose">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-600">🔨 Phiên đang mở</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-xs font-bold text-red-600">
                  {activeAuction ? `⏱ ${countdownLabel}` : '—'}
                </span>
              </div>
              {activeAuction ? (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Ô đấu giá</span>
                    <span className="font-mono font-bold text-slate-900">
                      [{auctionTilePos?.x ?? '?'}, {auctionTilePos?.y ?? '?'}]
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Giá khởi điểm</span>
                    <span className="font-mono font-semibold">
                      {formatMoney(activeAuction.startingPrice.amount)} đ
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Giá đặt hiện tại</span>
                    <span className="font-mono font-bold text-red-600">
                      {formatMoney(activeAuction.currentBid.amount)} đ
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1000000"
                    value={bidInput}
                    onChange={(e) => setBidInput(e.target.value)}
                    placeholder="Số tiền đặt giá (VNĐ)"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 font-mono text-xs focus:border-red-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={bidding}
                    onClick={() => void handlePlaceBid()}
                    className="w-full rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-60 hover:brightness-110"
                  >
                    {bidding ? 'Đang đặt…' : 'Đặt giá nhanh (+5%)'}
                  </button>
                  {bidError && <p className="text-[10px] text-rose-600">{bidError}</p>}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Không có phiên đấu giá nào đang mở. AI Game Master sẽ mở phiên theo bảng giá đất
                  gốc của Admin.
                </p>
              )}
            </Panel>
          </div>
          <div className="h-full">
            <Panel title="Chọn tỉnh / thành phố" borderColor="emerald">
              <div className="max-h-[420px] space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {(provinces ?? []).map((p, index) => {
                  const isHome = character?.birthplace === p.code;
                  const anchorX = (index % 16) * 2;
                  const anchorY = Math.floor(index / 16) * 6 + 2;
                  const isHere =
                    character != null &&
                    character.location?.x === anchorX &&
                    character.location?.y === anchorY;
                  const isBrowsing = activeProvince === p.code;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      disabled={movingProvince === p.code}
                      onClick={() => void handleMoveProvince(p, index)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition hover:brightness-105 disabled:opacity-60 ${
                        isBrowsing
                          ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300'
                          : isHere
                            ? 'border-emerald-400 bg-emerald-100 ring-2 ring-emerald-300'
                            : isHome
                              ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200'
                              : p.isCity
                                ? 'border-amber-200 bg-amber-50/70'
                                : 'border-slate-200 bg-white/60'
                      }`}
                      title={isHere ? 'Nơi ở hiện tại' : 'Nhấn để di chuyển'}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{p.code}</span>
                        <span className="truncate text-xs font-semibold text-slate-800">
                          {p.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[10px] text-slate-500">
                          {p.isCity ? '🏙 ' : ''}Miền {p.region}
                        </span>
                        {isHome && (
                          <span className="text-[9px] font-bold text-emerald-700">
                            Quê hương của bạn
                          </span>
                        )}
                        {isHere && !isBrowsing && (
                          <span className="text-[9px] font-bold text-emerald-700">
                            Bạn đang ở đây
                          </span>
                        )}
                        {isBrowsing && (
                          <span className="text-[9px] font-bold text-sky-700">Bản đồ đang xem</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Nhấn vào một tỉnh/thành để di chuyển nơi ở hiện tại (nơi sinh trên CCCD vẫn cố
                định).
              </p>
            </Panel>
          </div>
        </aside>
      </div>
    </div>
  );
}
