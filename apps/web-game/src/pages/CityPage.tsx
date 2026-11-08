import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhaserGame } from '../game/PhaserGame';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { type MapDto, type RealEstateOverviewDto } from '@efls/contracts';
import type { MapProperty } from '../game/map/MapData';

interface SelectedPlot {
  col: number;
  row: number;
  property?: MapProperty;
}

export function CityPage() {
  const { data: character, isLoading: characterLoading } = useQuery<{
    fullName: string;
    age: number;
    healthEnergy: number;
    location: { x: number; y: number };
    creditScore: number;
    heatLevel: number;
    netWorth: { amount: number };
  }>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest('/api/v1/characters/me'),
  });

  const {
    data: mapDto,
    isLoading: mapLoading,
    refetch: refetchMap,
  } = useQuery<MapDto>({
    queryKey: ['map'],
    queryFn: () => apiRequest<MapDto>('/api/v1/map'),
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

  const mapData = useMemo(() => {
    if (!mapDto || !realEstate) return null;
    return {
      ...mapDto,
      properties: realEstate.properties.map((p) => ({
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
      })),
    };
  }, [mapDto, realEstate]);

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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <PhaserGame mapData={mapData ?? undefined} onSelectPlot={handleSelectPlot} />
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm">
              <div className="font-mono text-xs text-slate-500 mb-1">
                Ô [{selected.col}, {selected.row}]
              </div>
              {selected.property ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{selected.property.name}</span>
                    <span className="font-semibold">
                      {selected.property.status === 'unowned'
                        ? 'Chưa có chủ'
                        : selected.property.status === 'listed'
                          ? 'Đang bán'
                          : selected.property.isMine
                            ? 'Của bạn'
                            : 'Đã sở hữu'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Loại</span>
                    <span>{selected.property.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Giá mua</span>
                    <span className="font-mono text-emerald-700">
                      {formatMoney(selected.property.purchasePriceMinor)}
                    </span>
                  </div>
                  {selected.property.askingPriceMinor != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Giá bán</span>
                      <span className="font-mono text-amber-700">
                        {formatMoney(selected.property.askingPriceMinor)}
                      </span>
                    </div>
                  )}
                  {(selected.property.status === 'unowned' ||
                    selected.property.status === 'listed') &&
                    !selected.property.isMine && (
                      <div className="pt-2">
                        <p className="text-[10px] text-slate-500 mb-1">
                          Nhấn nút dưới để mua bằng VNĐ.
                        </p>
                        <form onSubmit={handleBuy} className="flex gap-2">
                          <button
                            type="submit"
                            disabled={purchasing}
                            className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-60 hover:brightness-105"
                          >
                            {purchasing ? 'Đang xử lý…' : 'Mua ngay'}
                          </button>
                        </form>
                      </div>
                    )}
                  {purchaseError && <p className="text-[11px] text-rose-600">{purchaseError}</p>}
                  {purchaseOk && (
                    <p className="text-[11px] text-emerald-600 font-semibold">{purchaseOk}</p>
                  )}
                </div>
              ) : (
                <div className="text-slate-500 text-[11px]">Không có bất động sản trên ô này.</div>
              )}
            </div>
          )}
        </div>
        <aside className="space-y-3">
          <Panel title="Nhân vật đang chơi" borderColor="emerald">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Họ tên</span>
                <span className="font-semibold">{character.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tuổi</span>
                <span>{character.age} tuổi</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Sức khỏe / Năng lượng</span>
                <span>{character.healthEnergy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Vị trí</span>
                <span>
                  ({character.location.x}, {character.location.y})
                </span>
              </div>
            </div>
          </Panel>
          <div className="panel">
            <h2 className="panel-title">Sự kiện gần đây</h2>
            <ul className="mt-2 space-y-2 text-xs text-slate-500">
              <li>Chưa có sự kiện trong phiên chơi này.</li>
              <li>Tin vĩ mô và tin phố sẽ xuất hiện tại đây.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
