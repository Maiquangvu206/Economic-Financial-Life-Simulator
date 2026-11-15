import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapCanvas2D, ZONE_CONFIG } from '../game/map/MapCanvas2D';
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
import type { MapProperty, ZoneType } from '../game/map/MapData';
import {
  clusterContaining,
  constructionOptionsFor,
  findOwnedClusters,
  projectedValue,
} from '@efls/domain';

interface SelectedPlot {
  col: number;
  row: number;
  isFiller?: boolean;
  property?: MapProperty;
  /** Giá đất nền do admin đặt (VNĐ minor). 0 = chưa rao bán. */
  landPriceMinor: number;
  /** Vùng đất */
  zoneType?: ZoneType;
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

  // Phiên đấu giá đang mở theo từng tỉnh/thành (server-authoritative)
  const { data: auctionOverview, refetch: refetchAuctions } = useQuery<AuctionOverviewDto>({
    queryKey: ['auctions', 'overview', activeProvince],
    queryFn: () =>
      apiRequest<AuctionOverviewDto>(
        `/api/v1/auctions/overview?province=${encodeURIComponent(activeProvince)}`,
      ),
    refetchInterval: 10_000,
  });

  const [selected, setSelected] = useState<SelectedPlot | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseOk, setPurchaseOk] = useState<string | null>(null);
  const [movingProvince, setMovingProvince] = useState<string | null>(null);

  // Bộ lọc tỉnh thành
  const [provinceSearch, setProvinceSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'Bắc' | 'Trung' | 'Nam'>('all');

  const ownerName = selected?.property?.ownerCharacterId
    ? character?.id === selected.property.ownerCharacterId
      ? `${character.fullName} (bạn)`
      : `Mã ${selected.property.ownerCharacterId.slice(0, 8)}…`
    : null;

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
    setSelected({
      col,
      row,
      isFiller: false,
      property,
      zoneType: node?.zoneType,
      landPriceMinor: node?.landPriceMinor ?? 0,
    });
  };

  const activeAuction = auctionOverview?.auctions[0] ?? null;

  const auctionTilePos = useMemo(() => {
    if (!activeAuction) return null;
    if (activeAuction.location) return { x: activeAuction.location.x, y: activeAuction.location.y };
    if (activeAuction.propertyId && realEstate && activeProvince === '001') {
      const property = realEstate.properties.find((p) => p.id === activeAuction.propertyId);
      if (property) return { x: property.location.x, y: property.location.y };
    }
    return null;
  }, [activeAuction, realEstate, activeProvince]);

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

    async function handlePlaceBid(customAmount?: number) {
      if (!activeAuction) return;
      const amount = customAmount ?? Math.floor(Number(bidInput) || 0);
      if (amount <= 0) {
        setBidError('Nhập số tiền đặt giá hợp lệ.');
        return;
      }
      setBidding(true);
      setBidError(null);
      try {
        await apiRequest(`/api/v1/auctions/${activeAuction.id}/bid`, {
          method: 'POST',
          body: JSON.stringify({ auctionId: activeAuction.id, amount: { amount, currency: 'VND' } }),
        });
        setBidInput('');
        await refetchAuctions();
      } catch (caught) {
        setBidError(caught instanceof Error ? caught.message : 'Không thể đặt giá đấu giá.');
      } finally {
        setBidding(false);
      }
    }

    const handleSelectFill = (tile: { wx: number; wy: number; zone: string }) => {
      setPurchaseError(null);
      setPurchaseOk(null);
      setSelected({
        col: -1,
        row: -1,
        isFiller: true,
        landPriceMinor: 0,
        fillerZone: tile.zone,
      });
    };

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

    const selectedCluster = selected
      ? clusterContaining(ownedClusters, selected.col, selected.row)
      : null;
    const buildOptions = selectedCluster ? constructionOptionsFor(selectedCluster) : [];
    const [buildChoice, setBuildChoice] = useState<string | null>(null);

    const filteredProvinces = useMemo(() => {
      return (provinces ?? []).filter((p) => {
        const matchSearch =
          p.name.toLowerCase().includes(provinceSearch.toLowerCase()) || p.code.includes(provinceSearch);
        const matchRegion = regionFilter === 'all' || p.region === regionFilter;
        return matchSearch && matchRegion;
      });
    }, [provinces, provinceSearch, regionFilter]);

    if (characterLoading || mapLoading || reLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
            <p className="mt-3 text-xs text-slate-600 font-medium">Đang tải bản đồ đô thị...</p>
          </div>
          );
  }

          if (!character) {
    return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 min-h-[400px]">
              <p>Chưa có nhân vật. Vui lòng tạo nhân vật để tham gia thành phố.</p>
            </div>
            );
  }

            return (
            <div className="space-y-4">
              {/* 4 Chỉ số tài chính & xã hội trên đầu trang */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Tiền mặt"
                  value={formatMoney(character.cash?.amount ?? character.netWorth.amount)}
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
                  hint={character.creditScore >= 700 ? 'Tín nhiệm cao' : 'Cần cải thiện'}
                />
                <StatCard
                  label="Heat Level"
                  value={`${character.heatLevel} / 100`}
                  hint="Mức truy nã ngầm"
                />
              </div>

                    {/* Bố cục chính: Cột Bản đồ lớn bên trái + Cột Tiện ích bên phải */}
                    <div className="flex flex-col xl:flex-row gap-4 items-start">
                      {/* Cột trái: Chiếm toàn bộ không gian trung tâm */}
                      <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
                        {/* Thanh hiển thị thông tin ô đất được chọn (Plot Inspector) */}
                        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition">
                          {selected ? (
                                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                      <span className="rounded-lg bg-amber-500/15 text-amber-800 font-bold px-2 py-0.5 text-[11px] uppercase tracking-wider">
                                        Ô ĐẤT
                                      </span>

                                        {
                                          selected.isFiller ? (
                                            <span className="font-semibold text-slate-700">
                                              Vùng đệm ngoại vi: <span className="text-emerald-700 font-bold">{selected.fillerZone}</span>
                                            </span>
                                          ) : (
                    <>
                                                <span className="font-mono font-bold text-slate-900 text-sm">
                                                  [{selected.col}, {selected.row}]
                                                </span>

                                                  <span className="font-medium text-slate-600">
                                                    {mapDto?.provinceName ?? 'Đô thị'}
                                                  </span>

                                                      {selected.zoneType && (
                                                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                                                          {ZONE_CONFIG[selected.zoneType]?.icon} {ZONE_CONFIG[selected.zoneType]?.nameVi}
                                                        </span>
                      )}

                                                      {selected.property ? (
                                                        <>
                                                            <span className="font-bold text-slate-900">{selected.property.name}</span>
                                                            <span
                                                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected.property.isMine
                                                                  ? 'bg-emerald-100 text-emerald-800'
                                                                  : selected.property.status === 'listed'
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : 'bg-slate-100 text-slate-700'
                                                                }`}
                                                            >
                                                              {selected.property.isMine
                                                                ? '⭐ CỦA BẠN'
                                                                : selected.property.status === 'listed'
                                                                  ? 'ĐANG RAO BÁN'
                                                                  : 'ĐÃ CÓ CÔNG TRÌNH'}
                                                            </span>
                                                              <span className="text-slate-500">
                                                                Chủ: <b>{ownerName}</b>
                                                              </span>
                                                            </>
                                                            ) : (
                                                            <span className="text-slate-500 font-medium">
                                                              {selectedTileAuctioning ? (
                                                                <span className="rounded-md bg-rose-100 text-rose-700 font-bold px-2 py-0.5">
                                                                  🔨 ĐANG TRONG PHIÊN ĐẤU GIÁ
                                                                </span>
                                                              ) : (
                                                                'Đất trống — Chờ đấu giá'
                                                              )}
                                                            </span>
                      )}

                                                              {
                                                                selected.landPriceMinor > 0 && (
                                                                  <span className="text-slate-600">
                                                                      Đơn giá:{' '}
                                                                      <span className="font-mono font-bold text-emerald-700">
                                                                        {formatMoney(selected.landPriceMinor)}
                                                                      </span>
                                                                    </span>
                      )}
                                                                  </>
                                                                )
                                                              }
                                                                </div>

                {/* Hành động trên ô đất */}
                                                            <div className="flex items-center gap-2">
                                                              {selectedTileAuctioning && activeAuction && (
                                                                <button
                                                                  type="button"
                                                                  onClick={() => handlePlaceBid(Math.round(activeAuction.currentBid.amount * 1.05))}
                                                                  className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-500"
                                                                >
                                                                  🔨 Đặt giá nhanh (+5%)
                                                                </button>
                                                              )}

                                                              {selected.property?.isMine && selectedCluster && (
                                                                <div className="flex items-center gap-1.5">
                                                                  <span className="font-semibold text-orange-700">
                                                                    Hợp thửa {selectedCluster.size} ô:
                                                                  </span>
                      {buildOptions.map((opt) => (
                                                                      <button
                                                                        key={opt.id}
                                                                        type="button"
                                                                        onClick={() => setBuildChoice(opt.id)}
                                                                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${buildChoice === opt.id
                                                                            ? 'bg-orange-600 text-white'
                                                                            : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                                                                          }`}
                                                                      >
                                                                        {opt.label}
                                                                      </button>
                                                                    ))}
                                                                </div>
                                                              )}

                                                              <button
                                                                type="button"
                                                                onClick={() => setSelected(null)}
                                                                className="text-slate-400 hover:text-slate-600 px-1.5 text-sm font-bold"
                                                                title="Đóng thông tin"
                                                              >
                                                                ✕
                                                              </button>
                                                            </div>
                                                        </div>
                                                      ) : (
                                                      <div className="flex items-center justify-between text-xs text-slate-500">
                                                        <span className="flex items-center gap-2">
                                                          <span className="text-sm">🗺️</span>
                                                          <span>
                                                            Nhấp vào bất kỳ ô đất nào trên bản đồ để tra cứu quy hoạch, chủ sở hữu hoặc tham gia đấu giá.
                                                          </span>
                                                        </span>
                                                        <span className="text-[11px] font-mono text-slate-400">
                                                          {mapDto?.provinceName ?? 'Đô thị'} ({mapDto?.meta.cols ?? 32} × {mapDto?.meta.rows ?? 20})
                                                        </span>
                                                      </div>
            )}
                                                    </div>

          {mapError && (
                                                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                                        Lỗi tải bản đồ tỉnh {activeProvince}: {String(mapError)}
                                                      </div>
          )}

                                                        {/* Bản đồ 2D Canvas mở rộng sắc nét, chiếm trọn khung hình */}
                                                        <div className="w-full">
                                                          <MapCanvas2D
                                                            mapData={mapData ?? undefined}
                                                            selected={selected ? { col: selected.col, row: selected.row } : null}
                                                            auctioningTile={auctionTilePos}
                                                            mergedClusters={ownedClusters
                                                              .filter((c) => c.size > 1)
                                                              .map((c) => ({
                                                                cells: c.cells,
                                                                label: `Hợp thửa ${c.size} ô`,
                                                              }))}
                                                            onSelectPlot={handleSelectPlot}
                                                            onSelectFill={handleSelectFill}
                                                          />
                                                        </div>

                                                        {/* Dải chú giải phân khu đô thị */}
                                                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 p-2.5 text-[11px] text-slate-600 shadow-2xs">
                                                          <span className="font-semibold text-slate-700 mr-1">Quy hoạch phân khu:</span>
                                                          {Object.entries(ZONE_CONFIG).map(([key, cfg]) => (
                                                            <span
                                                              key={key}
                                                              className="flex items-center gap-1 rounded-md px-2 py-0.5"
                                                              style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
                                                            >
                                                              <span>{cfg.icon}</span>
                                                              <span className="font-medium text-slate-800">{cfg.nameVi}</span>
                                                            </span>
                                                          ))}
                                                        </div>
                                                      </div>

                                                                    {/* Cột tiện ích bên phải: Đấu giá & Danh sách Tỉnh thành */}
                                                                    <aside className="w-full xl:w-[360px] flex-shrink-0 flex flex-col gap-4">
                                                                      {/* Widget 1: Phiên Đấu Giá Đất */}
                                                                      <Panel title="Phiên Đấu Giá Đất (AI Game Master)" borderColor="rose">
                                                                        <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                                                                          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                                                                            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                                                                            Phiên đang mở
                                                                          </span>
                                                                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 font-mono text-xs font-bold text-rose-700">
                                                                            {activeAuction ? `⏱ ${countdownLabel}` : '—'}
                                                                          </span>
                                                                        </div>

                                                                        {activeAuction ? (
                                                                          <div className="mt-3 space-y-2.5 text-xs">
                                                                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                              <span className="text-slate-600 font-medium">Vị trí ô đất:</span>
                                                                              <div className="flex items-center gap-2">
                                                                                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                                                  [{auctionTilePos?.x ?? '?'}, {auctionTilePos?.y ?? '?'}]
                                                                                </span>
                                                                                <button
                                                                                  type="button"
                                                                                  onClick={() => auctionTilePos && handleSelectPlot(auctionTilePos.x, auctionTilePos.y)}
                                                                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold underline"
                                                                                >
                                                                                  Xem ô
                                                                                </button>
                                                                              </div>
                                                                            </div>

                                                                            <div className="flex justify-between items-center">
                                                                              <span className="text-slate-500">Giá khởi điểm:</span>
                                                                              <span className="font-mono font-semibold text-slate-700">
                                                                                {formatMoney(activeAuction.startingPrice.amount)}
                                                                              </span>
                                                                            </div>

                                                                            <div className="flex justify-between items-center">
                                                                              <span className="text-slate-500">Giá hiện tại:</span>
                                                                              <span className="font-mono font-bold text-rose-600 text-sm">
                                                                                {formatMoney(activeAuction.currentBid.amount)}
                                                                              </span>
                                                                            </div>

                                                                            {/* Các nút đặt giá nhanh */}
                                                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                                                              <button
                                                                                type="button"
                                                                                disabled={bidding}
                                                                                onClick={() => handlePlaceBid(Math.round(activeAuction.currentBid.amount * 1.05))}
                                                                                className="rounded-xl border border-rose-200 bg-rose-50 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                                                              >
                                                                                +5% ({formatMoney(Math.round(activeAuction.currentBid.amount * 1.05))})
                                                                              </button>
                                                                              <button
                                                                                type="button"
                                                                                disabled={bidding}
                                                                                onClick={() => handlePlaceBid(Math.round(activeAuction.currentBid.amount * 1.1))}
                                                                                className="rounded-xl border border-rose-300 bg-rose-50 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
                                                                              >
                                                                                +10% ({formatMoney(Math.round(activeAuction.currentBid.amount * 1.1))})
                                                                              </button>
                                                                            </div>

                                                                            {/* Nhập số tiền tùy ý */}
                                                                            <div className="space-y-1.5 pt-1">
                                                                              <input
                                                                                type="number"
                                                                                min="0"
                                                                                step="1000000"
                                                                                value={bidInput}
                                                                                onChange={(e) => setBidInput(e.target.value)}
                                                                                placeholder="Nhập số tiền khác (VNĐ)..."
                                                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs focus:border-rose-400 focus:bg-white focus:outline-none"
                                                                              />
                                                                              <button
                                                                                type="button"
                                                                                disabled={bidding || !bidInput}
                                                                                onClick={() => void handlePlaceBid()}
                                                                                className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 py-2 text-xs font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                                                                              >
                                                                                {bidding ? 'Đang gửi lệnh đặt giá…' : 'Xác nhận Đặt Giá'}
                                                                              </button>
                                                                            </div>

                                                                              { bidError && <p className="text-[11px] text-rose-600 font-medium">⚠️ {bidError}</p> }
              </div>
                                                                          ) : (
                                                                          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                                                                            Hiện chưa có phiên đấu giá nào đang mở cho tỉnh/thành này. Hãy cấu hình giá đất (admin) và thử tải lại sau ít phút.
                                                                          </p>
            )}
                                                                        </Panel>

                                                                        {/* Widget 2: Chọn Tỉnh / Thành Phố */}
                                                                        <Panel title="Chọn Tỉnh / Thành Phố (34 Tỉnh)" borderColor="emerald">
                                                                          <div className="space-y-2">
                                                                            {/* Thanh tìm kiếm nhanh */}
                                                                            <input
                                                                              type="text"
                                                                              placeholder="Tìm tỉnh/thành (Hà Nội, Hải Phòng...)"
                                                                              value={provinceSearch}
                                                                              onChange={(e) => setProvinceSearch(e.target.value)}
                                                                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:outline-none"
                                                                            />

                                                                            {/* Tabs lọc miền */}
                                                                            <div className="flex gap-1 text-[11px] font-semibold">
                                                                              {(['all', 'Bắc', 'Trung', 'Nam'] as const).map((r) => (
                                                                                <button
                                                                                  key={r}
                                                                                  type="button"
                                                                                  onClick={() => setRegionFilter(r)}
                                                                                  className={`flex-1 rounded-lg py-1 transition ${regionFilter === r
                                                                                      ? 'bg-emerald-600 text-white'
                                                                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                                    }`}
                                                                                >
                                                                                  {r === 'all' ? 'Tất cả' : `Miền ${r}`}
                                                                                </button>
                                                                              ))}
                                                                            </div>

              {/* Danh sách các tỉnh */}
              <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {filteredProvinces.map((p, index) => {
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
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left transition hover:brightness-105 disabled:opacity-60 ${
                        isBrowsing
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : isHere
                            ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
                            : isHome
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400 font-bold">{p.code}</span>
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
                            Quê hương
                          </span>
                        )}
                        {isBrowsing && (
                          <span className="text-[9px] font-bold text-indigo-700">Đang xem</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                Nhấn vào tỉnh để di chuyển nhân vật đến khu vực đó.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
