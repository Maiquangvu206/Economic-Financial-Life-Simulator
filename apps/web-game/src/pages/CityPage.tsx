import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapCanvas2D } from '../game/map/MapCanvas2D';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { Modal } from '../shared/ui/Modal';
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

interface SelectedPlot {
  col: number;
  row: number;
  property?: MapProperty;
  /** Giá đất nền do admin đặt (VNĐ minor). 0 = chưa rao bán. */
  landPriceMinor: number;
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

  const {
    data: realEstate,
    isLoading: reLoading,
    refetch: refetchRealEstate,
  } = useQuery<RealEstateOverviewDto>({
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
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseOk, setPurchaseOk] = useState<string | null>(null);
  const [movingProvince, setMovingProvince] = useState<string | null>(null);
  const [buyLandOpen, setBuyLandOpen] = useState(false);

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

  /** Ô đất đang đấu giá: đối chiếu propertyId với BĐS trên bản đồ để lấy tọa độ. */
  const auctioningTile = useMemo(() => {
    if (!auctionOverview || !realEstate) return null;
    for (const auction of auctionOverview.auctions) {
      const property = realEstate.properties.find((p) => p.id === auction.propertyId);
      if (property) return { x: property.location.x, y: property.location.y };
    }
    return null;
  }, [auctionOverview, realEstate]);

  async function handleBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.property) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      await apiRequest<unknown>('/api/v1/real-estate/buy', {
        method: 'POST',
        body: JSON.stringify({ propertyId: selected.property.id }),
      });
      setPurchaseOk('Đã mua bất động sản thành công!');
      setPurchasing(false);
      await refetchMap();
      await refetchRealEstate();
      await refetchAuctions();
      setSelected(null);
    } catch (caught) {
      setPurchasing(false);
      setPurchaseError(caught instanceof Error ? caught.message : 'Không thể mua bất động sản.');
    }
  }

  /** Mua đất nền trên ô đất trống (giá = land_price_minor do admin đặt). */
  async function handleBuyLand() {
    if (!selected || selected.property || selected.landPriceMinor <= 0) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      await apiRequest<unknown>('/api/v1/real-estate/buy-land', {
        method: 'POST',
        body: JSON.stringify({ x: selected.col, y: selected.row }),
      });
      setPurchaseOk(`Đã mua đất nền ô [${selected.col}, ${selected.row}] thành công!`);
      setBuyLandOpen(false);
      await refetchMap();
      await refetchRealEstate();
      await refetchAuctions();
    } catch (caught) {
      setPurchaseError(caught instanceof Error ? caught.message : 'Không thể mua đất nền.');
    } finally {
      setPurchasing(false);
    }
  }

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
                    </>
                  )}
                  {!selected.property &&
                    (selected.landPriceMinor > 0 ? (
                      <span className="text-slate-600">
                        Giá:{' '}
                        <span className="font-mono font-bold text-emerald-700">
                          {formatMoney(selected.landPriceMinor)} đ
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Ô đất hoang — chưa rao bán</span>
                    ))}
                  {purchaseError && (
                    <span className="text-[11px] text-rose-600">{purchaseError}</span>
                  )}
                  {purchaseOk && (
                    <span className="text-[11px] font-semibold text-emerald-600">{purchaseOk}</span>
                  )}
                </div>
                {selected.property &&
                  !selected.property.ownerCharacterId &&
                  (selected.property.status === 'unowned' ||
                    selected.property.status === 'listed') &&
                  !selected.property.isMine && (
                    <form onSubmit={handleBuy} className="shrink-0">
                      <button
                        type="submit"
                        disabled={purchasing}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition disabled:opacity-60 hover:brightness-105"
                      >
                        {purchasing ? 'Đang xử lý…' : 'Mua BĐS'}
                      </button>
                    </form>
                  )}
                {!selected.property && selected.landPriceMinor > 0 && (
                  <button
                    type="button"
                    disabled={purchasing}
                    onClick={() => setBuyLandOpen(true)}
                    className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition disabled:opacity-60 hover:brightness-105"
                  >
                    Mua Đất
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Nhấp vào một ô đất trên bản đồ 2D để xem thông tin và mua BĐS.
              </p>
            )}
          </div>

          {mapError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Lỗi tải bản đồ tỉnh {activeProvince}: {String(mapError)}
            </div>
          )}
          {/* Bản đồ 2D Canvas 1000×1000 (zoom/pan) theo tỉnh */}
          <MapCanvas2D
            key={activeProvince}
            mapData={mapData ?? undefined}
            selected={selected ? { col: selected.col, row: selected.row } : null}
            auctioningTile={auctioningTile}
            onSelectPlot={handleSelectPlot}
          />
        </div>

        <aside className="w-[340px] flex-shrink-0 h-full flex flex-col">
          <Panel title="Chọn tỉnh / thành phố" borderColor="emerald">
            <div className="max-h-[400px] space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
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
              Nhấn vào một tỉnh/thành để di chuyển nơi ở hiện tại (nơi sinh trên CCCD vẫn cố định).
            </p>
          </Panel>
        </aside>
      </div>

      <Modal open={buyLandOpen} onClose={() => setBuyLandOpen(false)} title="Xác nhận mua đất nền">
        {selected && (
          <>
            <p className="text-sm text-slate-600">
              Bạn sắp mua đất nền tại ô{' '}
              <span className="font-mono font-bold text-slate-900">
                [{selected.col}, {selected.row}]
              </span>{' '}
              —{' '}
              {mapDto?.provinceName ??
                provinces?.find((p) => p.code === activeProvince)?.name ??
                activeProvince}
              .
            </p>
            <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">Đơn giá đất</span>
              <span className="font-mono font-bold text-emerald-700">
                {formatMoney(selected.landPriceMinor)} đ
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Số tiền sẽ trừ trực tiếp từ ví VNĐ của nhân vật. Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBuyLandOpen(false)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={purchasing}
                onClick={() => void handleBuyLand()}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition disabled:opacity-60 hover:brightness-105"
              >
                {purchasing ? 'Đang xử lý…' : 'Xác nhận Mua Đất'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
