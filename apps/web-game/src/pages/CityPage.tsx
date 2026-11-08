import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CityCanvas } from '../game/three/CityCanvas';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import {
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

  const [selected, setSelected] = useState<SelectedPlot | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseOk, setPurchaseOk] = useState<string | null>(null);
  const [movingProvince, setMovingProvince] = useState<string | null>(null);

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
    setSelected({ col, row, property });
  };

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
      setSelected(null);
    } catch (caught) {
      setPurchasing(false);
      setPurchaseError(caught instanceof Error ? caught.message : 'Không thể mua bất động sản.');
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold tracking-tight">Thành phố trung tâm</h1>
          <p className="mt-1 text-sm text-slate-600">
            Bản đồ 2D từ server. Mọi thay đổi vị trí và giao dịch đất đều do server xác thực.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600">
          Tick kế tiếp: 23:59:59
        </div>
      </div>

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

      <Panel title="34 tỉnh & thành phố Việt Nam" borderColor="emerald">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
          {(provinces ?? []).map((p, index) => {
            const isHome = character?.birthplace === p.code;
            // Vị trí hiện tại: anchor theo thứ tự tỉnh trong danh sách (giống server provinceAnchor).
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
                className={`rounded-xl border px-2 py-1.5 text-center transition hover:brightness-105 disabled:opacity-60 ${
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
                <div className="font-mono text-[10px] text-slate-400">{p.code}</div>
                <div className="truncate text-xs font-semibold text-slate-800">{p.name}</div>
                <div className="text-[10px] text-slate-500">
                  {p.isCity ? '🏙 ' : ''}Miền {p.region}
                </div>
                {isHome && (
                  <div className="text-[10px] font-bold text-emerald-700">Quê hương của bạn</div>
                )}
                {isHere && !isBrowsing && (
                  <div className="text-[10px] font-bold text-emerald-700">Bạn đang ở đây</div>
                )}
                {isBrowsing && (
                  <div className="text-[10px] font-bold text-sky-700">Bản đồ đang xem</div>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Nhấn vào một tỉnh/thành để di chuyển nơi ở hiện tại (nơi sinh trên CCCD vẫn cố định). Bản
          đồ 2D bên dưới là thủ đô Hà Nội (mã 001) — trung tâm giao dịch.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {mapError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Lỗi tải bản đồ tỉnh {activeProvince}: {String(mapError)}
            </div>
          )}
          {/* Remount Canvas theo tỉnh để scene vẽ lại toàn bộ với địa giới mới. */}
          <CityCanvas
            key={activeProvince}
            mapData={mapData ?? undefined}
            onSelectPlot={handleSelectPlot}
          />
        </div>
        <aside className="space-y-3">
          <Panel title="Thông tin ô đất" borderColor="amber">
            {selected ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="font-mono text-xs text-slate-500">Tọa độ ô</div>
                  <div className="font-mono text-base font-bold text-slate-900">
                    [{selected.col}, {selected.row}]
                  </div>
                </div>
                {selected.property ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
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
                          ? 'Chưa có chủ'
                          : selected.property.status === 'listed'
                            ? 'Đang bán'
                            : selected.property.isMine
                              ? 'Của bạn'
                              : 'Đã sở hữu'}
                      </span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-white/70 px-3 py-2">
                      <span className="text-slate-600">Loại</span>
                      <span className="font-semibold">{selected.property.type}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-white/70 px-3 py-2">
                      <span className="text-slate-600">Giá mua</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {formatMoney(selected.property.purchasePriceMinor)}
                      </span>
                    </div>
                    {selected.property.askingPriceMinor != null && (
                      <div className="flex justify-between rounded-lg bg-white/70 px-3 py-2">
                        <span className="text-slate-600">Giá bán</span>
                        <span className="font-mono font-bold text-amber-700">
                          {formatMoney(selected.property.askingPriceMinor)}
                        </span>
                      </div>
                    )}
                    {(selected.property.status === 'unowned' ||
                      selected.property.status === 'listed') &&
                      !selected.property.isMine && (
                        <div className="pt-1">
                          <form onSubmit={handleBuy} className="flex gap-2">
                            <button
                              type="submit"
                              disabled={purchasing}
                              className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 hover:brightness-105"
                            >
                              {purchasing ? 'Đang xử lý…' : 'Mua ngay'}
                            </button>
                          </form>
                        </div>
                      )}
                    {purchaseError && <p className="text-[11px] text-rose-600">{purchaseError}</p>}
                    {purchaseOk && (
                      <p className="text-[11px] font-semibold text-emerald-600">{purchaseOk}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-white/70 px-3 py-3 text-center text-[11px] text-slate-500">
                    Không có bất động sản trên ô này.
                    <br />
                    Nhấn ô khác để xem chi tiết.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-white/70 px-3 py-8 text-center text-xs text-slate-500">
                Nhấn vào một ô đất trên bản đồ
                <br />
                để xem thông tin chi tiết tại đây.
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
