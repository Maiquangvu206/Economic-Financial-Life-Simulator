import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapCanvas2D, ZONE_CONFIG } from '../game/map/MapCanvas2D';
import { StatCard } from '../shared/ui/StatCard';
import { Panel } from '../shared/ui/Panel';
import { Badge } from '../shared/ui/Badge';
import { useDialog } from '../shared/ui/DialogContext';
import { formatMoney } from '../shared/lib/format';
import { apiRequest } from '../shared/api/httpClient';
import { toast } from '../shared/ui/Toast';
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
  const { confirm } = useDialog();
  const qc = useQueryClient();
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

  const { data: realEstate, isLoading: reLoading, refetch: refetchRealEstate } = useQuery<RealEstateOverviewDto>({
    queryKey: ['real-estate', 'overview'],
    queryFn: () => apiRequest<RealEstateOverviewDto>('/api/v1/real-estate/overview'),
  });

  const { data: provinceLand, isLoading: provinceLandLoading, refetch: refetchProvinceLand } = useQuery<{ provinceCode: string; properties: any[] }>({
    queryKey: ['province-land', 'properties', activeProvince],
    queryFn: () => apiRequest<{ provinceCode: string; properties: any[] }>(`/api/v1/province-land/properties?province=${encodeURIComponent(activeProvince)}`),
    // 001 uses core real-estate; still fetch for province-land auctions/wins if any, but don't block UI on it
  });

  // Phiên đấu giá đang mở theo từng tỉnh/thành (server-authoritative)
  const { data: auctionOverview, refetch: refetchAuctions } = useQuery<AuctionOverviewDto>({
    queryKey: ['auctions', 'overview', activeProvince],
    queryFn: () =>
      apiRequest<AuctionOverviewDto>(
        `/api/v1/auctions?province=${encodeURIComponent(activeProvince)}`,
      ),
    refetchInterval: 10_000,
  });

  // Du lịch & Lưu trú
  const { data: travelOverview, isLoading: travelLoading, refetch: refetchTravel } = useQuery<any>({
    queryKey: ['travel', 'overview'],
    queryFn: () => apiRequest<any>('/api/v1/travel/overview'),
    refetchInterval: 15_000,
  });
  const [travelProvince, setTravelProvince] = useState<string>('');
  const [travelDays, setTravelDays] = useState<1 | 2 | 3>(1);
  const [lodgingOptions, setLodgingOptions] = useState<any[]>([]);
  const [lodgingLoading, setLodgingLoading] = useState(false);
  const [selectedLodgingId, setSelectedLodgingId] = useState<string>('');
  const [travelBusy, setTravelBusy] = useState(false);

  useEffect(() => {
    if (!travelProvince) setTravelProvince(activeProvince);
  }, [activeProvince, travelProvince]);

  const travelDestination = useMemo(() => {
    const list = (travelOverview?.destinations ?? []) as any[];
    return list.find((d) => d.provinceCode === (travelProvince || activeProvince)) ?? null;
  }, [travelOverview?.destinations, travelProvince, activeProvince]);

  async function refreshTravelState() {
    await Promise.all([
      refetchTravel(),
      refetchCharacter(),
    ]);
  }

  async function handleShortTrip() {
    const provinceCode = travelProvince || activeProvince;
    if (!provinceCode) return;
    setTravelBusy(true);
    try {
      const res = await apiRequest<any>('/api/v1/travel/short', {
        method: 'POST',
        body: JSON.stringify({ provinceCode }),
      });
      toast({ title: 'Du lịch ngắn', description: res?.message || 'Chuyến đi thành công.', variant: 'success' });
      await refreshTravelState();
    } catch (e: any) {
      toast({ title: 'Không thể du lịch', description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally {
      setTravelBusy(false);
    }
  }

  async function loadLodgingOptions() {
    const provinceCode = travelProvince || activeProvince;
    if (!provinceCode) return;
    setLodgingLoading(true);
    try {
      const res = await apiRequest<any>(`/api/v1/travel/lodging-options?provinceCode=${encodeURIComponent(provinceCode)}&days=${travelDays}`);
      const options = Array.isArray(res?.options) ? res.options : [];
      setLodgingOptions(options);
      if (options.length > 0) setSelectedLodgingId((prev) => options.some((o: any) => o.id === prev) ? prev : options[0].id);
      else setSelectedLodgingId('');
    } catch (e: any) {
      setLodgingOptions([]);
      setSelectedLodgingId('');
      toast({ title: 'Không thể tải lựa chọn lưu trú', description: e?.problem?.detail || e?.message, variant: 'error' });
    } finally {
      setLodgingLoading(false);
    }
  }

  async function handleStartRetreat() {
    const provinceCode = travelProvince || activeProvince;
    const option = lodgingOptions.find((o) => o.id === selectedLodgingId) ?? lodgingOptions[0];
    if (!provinceCode || !option) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng chọn điểm đến và nơi lưu trú.', variant: 'error' });
      return;
    }
    setTravelBusy(true);
    try {
      const res = await apiRequest<any>('/api/v1/travel/retreat', {
        method: 'POST',
        body: JSON.stringify({
          provinceCode,
          days: travelDays,
          lodgingType: option.type,
          lodgingOptionId: option.id,
          propertyId: option.propertyId ?? null,
          propertySource: option.propertySource ?? null,
        }),
      });
      toast({ title: 'Nghỉ dưỡng', description: res?.message || 'Đã bắt đầu chuyến nghỉ dưỡng.', variant: 'success' });
      await refreshTravelState();
    } catch (e: any) {
      toast({ title: 'Không thể bắt đầu nghỉ dưỡng', description: e?.problem?.detail || e?.message || 'Vui lòng thử lại.', variant: 'error' });
    } finally {
      setTravelBusy(false);
    }
  }

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
    let properties: any[] = [];
    if (activeProvince === '001' && realEstate) {
      properties = realEstate.properties.flatMap((p) => {
        const base = {
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
          location: p.location,
          constructionOption: p.constructionOption ?? null,
          constructionLabel: p.constructionLabel ?? null,
          constructionTier: p.constructionTier ?? null,
          constructionMultiplier: p.constructionMultiplier ?? 1,
          constructionCostMinor: p.constructionCostMinor ?? 0,
          constructionBuiltAt: p.constructionBuiltAt ?? null,
          mergedIntoPropertyId: p.mergedIntoPropertyId ?? null,
          mergeGroupId: p.mergeGroupId ?? null,
          mergedMembers: p.mergedMembers ?? [],
          offers: p.offers ?? [],
          provinceSource: 'core',
        };
        const members = (p.mergedMembers ?? []).map((m: any) => ({
          id: m.id,
          nodeId: m.nodeId,
          ownerId: p.ownerCharacterId,
          ownerCharacterId: p.ownerCharacterId,
          name: m.name ?? base.name,
          type: m.propertyType ?? base.type,
          status: m.status ?? base.status,
          purchasePriceMinor: m.purchasePrice?.amount ?? 0,
          askingPriceMinor: null,
          isMine: p.isMine,
          valueMinor: m.currentValue?.amount ?? 0,
          location: m.location ?? p.location,
          constructionOption: p.constructionOption ?? null,
          constructionLabel: p.constructionLabel ?? null,
          constructionTier: p.constructionTier ?? null,
          constructionMultiplier: p.constructionMultiplier ?? 1,
          constructionCostMinor: p.constructionCostMinor ?? 0,
          constructionBuiltAt: p.constructionBuiltAt ?? null,
          mergedIntoPropertyId: m.mergedIntoPropertyId ?? p.id,
          mergeGroupId: m.mergeGroupId ?? p.mergeGroupId ?? null,
          offers: [],
          provinceSource: 'core',
          isMergedMember: true,
          mergedPrimaryId: p.id,
        }));
        return [base, ...members];
      });
    } else if (provinceLand?.properties) {
      properties = provinceLand.properties.flatMap((p: any) => {
        const base = {
          id: p.id,
          nodeId: p.nodeId ?? p.id,
          ownerId: p.ownerCharacterId,
          ownerCharacterId: p.ownerCharacterId,
          name: p.name,
          type: p.propertyType,
          status: p.status,
          purchasePriceMinor: p.purchasePrice?.amount ?? 0,
          askingPriceMinor: p.askingPrice?.amount ?? null,
          isMine: !!p.isMine,
          valueMinor: p.currentValue?.amount ?? 0,
          constructionOption: p.constructionOption ?? null,
          constructionLabel: p.constructionLabel ?? null,
          constructionTier: p.constructionTier ?? null,
          constructionMultiplier: p.constructionMultiplier ?? 1,
          constructionCostMinor: p.constructionCostMinor ?? 0,
          constructionBuiltAt: p.constructionBuiltAt ?? null,
          mergedIntoPropertyId: p.mergedIntoPropertyId ?? null,
          mergeGroupId: p.mergeGroupId ?? null,
          mergedMembers: p.mergedMembers ?? [],
          offers: p.offers ?? [],
          provinceSource: 'province-land',
          location: p.location,
        };
        const members = (p.mergedMembers ?? []).map((m: any) => ({
          id: m.id,
          nodeId: m.nodeId ?? m.id,
          ownerId: p.ownerCharacterId,
          ownerCharacterId: p.ownerCharacterId,
          name: m.name ?? base.name,
          type: m.propertyType ?? base.type,
          status: m.status ?? base.status,
          purchasePriceMinor: m.purchasePrice?.amount ?? 0,
          askingPriceMinor: null,
          isMine: !!p.isMine,
          valueMinor: m.currentValue?.amount ?? 0,
          location: m.location ?? p.location,
          constructionOption: p.constructionOption ?? null,
          constructionLabel: p.constructionLabel ?? null,
          constructionTier: p.constructionTier ?? null,
          constructionMultiplier: p.constructionMultiplier ?? 1,
          constructionCostMinor: p.constructionCostMinor ?? 0,
          constructionBuiltAt: p.constructionBuiltAt ?? null,
          mergedIntoPropertyId: m.mergedIntoPropertyId ?? p.id,
          mergeGroupId: m.mergeGroupId ?? p.mergeGroupId ?? null,
          offers: [],
          provinceSource: 'province-land',
          isMergedMember: true,
          mergedPrimaryId: p.id,
        }));
        return [base, ...members];
      });
    }
    if (activeProvince === '001' && provinceLand?.properties?.length) {
      const knownCoords = new Set(properties.map((p: any) => `${p.location?.x}-${p.location?.y}`));
      const auctionLand = provinceLand.properties
        .filter((p: any) => !knownCoords.has(`${p.location?.x}-${p.location?.y}`))
        .flatMap((p: any) => {
          const base = {
            id: p.id,
            nodeId: p.nodeId ?? p.id,
            ownerId: p.ownerCharacterId,
            ownerCharacterId: p.ownerCharacterId,
            name: p.name,
            type: p.propertyType,
            propertyType: p.propertyType,
            status: p.status,
            purchasePriceMinor: p.purchasePrice?.amount ?? 0,
            askingPriceMinor: p.askingPrice?.amount ?? null,
            isMine: !!p.isMine,
            valueMinor: p.currentValue?.amount ?? 0,
            location: p.location,
            constructionOption: p.constructionOption ?? null,
            constructionLabel: p.constructionLabel ?? null,
            constructionTier: p.constructionTier ?? null,
            constructionMultiplier: p.constructionMultiplier ?? 1,
            constructionCostMinor: p.constructionCostMinor ?? 0,
            constructionBuiltAt: p.constructionBuiltAt ?? null,
            mergedIntoPropertyId: p.mergedIntoPropertyId ?? null,
            mergeGroupId: p.mergeGroupId ?? null,
            mergedMembers: p.mergedMembers ?? [],
            offers: p.offers ?? [],
            provinceSource: 'province-land',
          };
          return [base];
        });
      properties = [...properties, ...auctionLand];
    }
    return { ...mapDto, properties };
  }, [mapDto, realEstate, provinceLand, activeProvince]);

  const actualMergedClusters = useMemo(() => {
    const props = (mapData?.properties ?? []).filter((p: any) => !p.isMergedMember && (p.mergeGroupId || (p.mergedMembers?.length ?? 0) > 0 || p.mergedIntoPropertyId));
    return props
      .map((p: any) => {
        const cells = [
          p.location,
          ...((p.mergedMembers ?? []).map((m: any) => m.location).filter(Boolean)),
        ].filter((c: any) => c && Number.isFinite(c.x) && Number.isFinite(c.y));
        if (cells.length <= 1) return null;
        return {
          cells,
          label: p.constructionLabel || p.name || `Hợp thửa ${cells.length} ô`,
          constructionOption: p.constructionOption ?? null,
          constructionLabel: p.constructionLabel ?? null,
          isMine: !!p.isMine,
          propertyType: p.type ?? p.propertyType ?? null,
        };
      })
      .filter(Boolean) as Array<{ cells: Array<{ x: number; y: number }>; label: string; constructionOption?: string | null; constructionLabel?: string | null; isMine?: boolean; propertyType?: string | null }>;
  }, [mapData]);

  const handleSelectPlot = (col: number, row: number) => {
    setPurchaseError(null);
    setPurchaseOk(null);
    setConstructError(null);
    setConstructOk(null);
    setOfferError(null);
    setOfferOk(null);
    if (!mapData) return;
    const node = mapData.nodes.find((n) => n.x === col && n.y === row);
    let property = node ? mapData.properties.find((p: any) => p.nodeId === node.id) : undefined;
    if (!property) {
      // province land properties are keyed by tile coords (not map node id)
      property = (mapData.properties as any[]).find((p: any) => p.location?.x === col && p.location?.y === row);
    }
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
  const [constructing, setConstructing] = useState(false);
  const [constructError, setConstructError] = useState<string | null>(null);
  const [constructOk, setConstructOk] = useState<string | null>(null);

  const [offerAmount, setOfferAmount] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerOk, setOfferOk] = useState<string | null>(null);
  const [demolishing, setDemolishing] = useState(false);
  const [demolishError, setDemolishError] = useState<string | null>(null);
  const [demolishOk, setDemolishOk] = useState<string | null>(null);

  function isConnectedCells(cells: Array<{ x: number; y: number }>): boolean {
    if (cells.length <= 1) return true;
    const remaining = new Set(cells.map((c) => `${c.x}-${c.y}`));
    const queue = [cells[0]!];
    remaining.delete(`${cells[0]!.x}-${cells[0]!.y}`);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of cells) {
        const key = `${n.x}-${n.y}`;
        if (!remaining.has(key)) continue;
        if (Math.abs(cur.x - n.x) + Math.abs(cur.y - n.y) === 1) {
          remaining.delete(key);
          queue.push(n);
        }
      }
    }
    return remaining.size === 0;
  }

  const auctionCountdown = activeAuction
    ? Math.max(0, Math.floor((new Date(activeAuction.endsAt).getTime() - now) / 1000))
    : 0;
  const countdownLabel = (() => {
    // 1 giây thực = 24 phút game (1 ngày game = 1 phút thực)
    const totalGameMinutes = auctionCountdown * 24;
    const gDays = Math.floor(totalGameMinutes / (24 * 60));
    const gHours = Math.floor((totalGameMinutes % (24 * 60)) / 60);
    const gMinutes = Math.floor(totalGameMinutes % 60);
    if (auctionCountdown <= 0) return 'Đang chốt phiên';
    if (gDays > 0) return `${gDays} ngày ${gHours} giờ ${gMinutes} phút`;
    return `${gHours} giờ ${gMinutes} phút`;
  })();
  const [bidInput, setBidInput] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  async function handlePurchaseOffer() {
    if (!selected?.property) return;
    const p = selected.property as any;
    const isProvinceLand = p.provinceSource === 'province-land' || activeProvince !== '001';
    const amount = Math.round(Number(offerAmount) || 0);
    if (amount <= 0) {
      setOfferError('Nhập số tiền đề xuất hợp lệ.');
      return;
    }
    setOfferLoading(true);
    setOfferError(null);
    setOfferOk(null);
    try {
      if (isProvinceLand) {
        await apiRequest(`/api/v1/province-land/offers?province=${encodeURIComponent(activeProvince)}`, {
          method: 'POST',
          body: JSON.stringify({
            propertyId: p.id,
            amount: { amount, currency: 'VND' },
            message: offerMsg.trim() || undefined,
            provinceCode: activeProvince,
          }),
        });
      } else {
        await apiRequest('/api/v1/real-estate/offers', {
          method: 'POST',
          body: JSON.stringify({
            propertyId: p.id,
            amount: { amount, currency: 'VND' },
            message: offerMsg.trim() || undefined,
          }),
        });
      }
      setOfferOk('Đã gửi đề xuất mua. Chờ chủ sở hữu phản hồi.');
      setOfferAmount('');
      setOfferMsg('');
      await Promise.all([refetchProvinceLand(), refetchRealEstate()]);
    } catch (caught) {
      setOfferError(caught instanceof Error ? caught.message : 'Không thể gửi đề xuất mua.');
    } finally {
      setOfferLoading(false);
    }
  }

  async function handlePurchaseOfferRespond(offerId: string, action: 'accept' | 'reject' | 'cancel') {
    if (!selected?.property) return;
    const p = selected.property as any;
    const isProvinceLand = p.provinceSource === 'province-land' || activeProvince !== '001';
    setOfferLoading(true);
    setOfferError(null);
    setOfferOk(null);
    try {
      if (isProvinceLand) {
        await apiRequest(`/api/v1/province-land/offers/respond?province=${encodeURIComponent(activeProvince)}`, {
          method: 'POST',
          body: JSON.stringify({ offerId, action, provinceCode: activeProvince }),
        });
      } else {
        await apiRequest('/api/v1/real-estate/offers/respond', {
          method: 'POST',
          body: JSON.stringify({ offerId, action }),
        });
      }
      setOfferOk(action === 'accept' ? 'Đã chấp nhận đề xuất mua.' : action === 'reject' ? 'Đã từ chối đề xuất.' : 'Đã hủy đề xuất.');
      await Promise.all([refetchProvinceLand(), refetchCharacter(), refetchRealEstate(), refetchMap()]);
    } catch (caught) {
      setOfferError(caught instanceof Error ? caught.message : 'Không thể xử lý đề xuất mua.');
    } finally {
      setOfferLoading(false);
    }
  }

  async function handleConstruct() {
    if (!selected?.property || !buildChoice || !selectedCluster) return;
    const memberIds = effectiveMergeIds.filter((id) => id !== selected.property!.id);
    if (effectiveMergeIds.length === 0) return;
    if (!effectiveMergeConnected) {
      setConstructError('Các ô đã chọn phải liền kề nhau (4 hướng) và tạo thành một cụm liên thông.');
      return;
    }
    setConstructing(true);
    setConstructError(null);
    setConstructOk(null);
    try {
      const isProvinceLand = (selected.property as any).provinceSource === 'province-land' || activeProvince !== '001';
      const url = isProvinceLand
        ? `/api/v1/province-land/construct?province=${encodeURIComponent(activeProvince)}`
        : '/api/v1/real-estate/construct';
      await apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          propertyId: selected.property.id,
          optionId: buildChoice,
          memberPropertyIds: memberIds,
          provinceCode: activeProvince,
          constructionName: constructionName.trim() || undefined,
        }),
      });
      setConstructOk('Xây dựng/hợp thửa thành công.');
      setBuildChoice(null);
      setConstructionName('');
      await Promise.all([refetchRealEstate(), refetchProvinceLand(), refetchCharacter(), refetchMap()]);
    } catch (caught) {
      setConstructError(caught instanceof Error ? caught.message : 'Không thể xây dựng công trình.');
    } finally {
      setConstructing(false);
    }
  }

  async function handleDemolish() {
    if (!selected?.property) return;
    const p: any = selected.property;
    const ok = await confirm({
      title: 'Phá dỡ công trình / Hủy hợp thửa?',
      type: 'danger',
      confirmText: 'Phá dỡ',
      message: 'Công trình sẽ bị phá dỡ / hủy hợp thửa để trả về đất nền.',
    });
    if (!ok) return;
    setDemolishing(true);
    setDemolishError(null);
    setDemolishOk(null);
    try {
      const isProvinceLand = p.provinceSource === 'province-land' || activeProvince !== '001';
      const url = isProvinceLand
        ? `/api/v1/province-land/demolish?province=${encodeURIComponent(activeProvince)}`
        : '/api/v1/real-estate/demolish';
      await apiRequest(url, {
        method: 'POST',
        body: JSON.stringify({ propertyId: p.id, provinceCode: activeProvince }),
      });
      setDemolishOk('Đã phá dỡ công trình/hủy hợp thửa. Tài sản đã trở về đất nền.');
      setBuildChoice(null);
      setMergeSelectedIds([]);
      await Promise.all([refetchRealEstate(), refetchProvinceLand(), refetchCharacter(), refetchMap()]);
    } catch (caught) {
      setDemolishError(caught instanceof Error ? caught.message : 'Không thể phá dỡ công trình.');
    } finally {
      setDemolishing(false);
    }
  }

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

    const ownedClusterData = useMemo(() => {
      const props = (mapData?.properties ?? []).filter((p: any) => p.isMine && !p.mergedIntoPropertyId);
      if (props.length === 0) return { clusters: [] as ReturnType<typeof findOwnedClusters>, byCoord: new Map<string, string>() };
      const byCoord = new Map<string, string>();
      const cells = props.map((p: any) => {
        const key = `${p.location?.x ?? -1}-${p.location?.y ?? -1}`;
        byCoord.set(key, p.id);
        return { x: p.location?.x ?? -1, y: p.location?.y ?? -1 };
      });
      return { clusters: findOwnedClusters(cells), byCoord };
    }, [mapData]);

    const ownedClusters = ownedClusterData.clusters;
    const selectedCluster = selected
      ? clusterContaining(ownedClusters, selected.col, selected.row)
      : null;
    const selectedClusterMemberIds = useMemo(() => {
      if (!selectedCluster) return [] as string[];
      return selectedCluster.cells
        .map((c) => ownedClusterData.byCoord.get(`${c.x}-${c.y}`))
        .filter((id): id is string => !!id);
    }, [selectedCluster, ownedClusterData.byCoord]);

    const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
    const [constructionName, setConstructionName] = useState('');
    const [buildChoice, setBuildChoice] = useState<string | null>(null);

    // Mặc định chọn toàn bộ cụm khi đổi ô/cụm; người chơi có thể bỏ chọn để hợp thửa một phần.
    useEffect(() => {
      if (!selected?.property || !selectedCluster) {
        setMergeSelectedIds([]);
        setConstructionName('');
        setBuildChoice(null);
        return;
      }
      setMergeSelectedIds(selectedClusterMemberIds);
      setConstructionName('');
      setBuildChoice(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.property?.id, selectedCluster?.size, selectedClusterMemberIds.join(',')]);

    const selectedClusterProperties = useMemo(() => {
      const byId = new Map<string, any>((mapData?.properties ?? []).map((p: any) => [p.id, p]));
      return selectedClusterMemberIds.map((id) => byId.get(id)).filter(Boolean);
    }, [selectedClusterMemberIds, mapData?.properties]);

    const effectiveMergeIds = useMemo(() => {
      if (!selected?.property) return [] as string[];
      const allowed = new Set(selectedClusterMemberIds);
      const picked = mergeSelectedIds.filter((id) => allowed.has(id));
      if (!picked.includes(selected.property.id)) picked.unshift(selected.property.id);
      return Array.from(new Set(picked));
    }, [mergeSelectedIds, selectedClusterMemberIds, selected?.property?.id]);

    const effectiveMergeProps = useMemo(() => {
      const byId = new Map<string, any>((mapData?.properties ?? []).map((p: any) => [p.id, p]));
      return effectiveMergeIds.map((id) => byId.get(id)).filter(Boolean);
    }, [effectiveMergeIds, mapData?.properties]);

    const effectiveMergeCells = useMemo(
      () => effectiveMergeProps.map((p: any) => ({ x: p.location?.x ?? -1, y: p.location?.y ?? -1 })),
      [effectiveMergeProps],
    );
    const effectiveMergeConnected = useMemo(() => isConnectedCells(effectiveMergeCells), [effectiveMergeCells]);
    const effectiveMergeCluster = useMemo(() => {
      const size = effectiveMergeProps.length;
      const tier = size >= 4 ? 'large' : size >= 2 ? 'small' : 'single';
      const cells = [...effectiveMergeCells].sort((a, b) => a.y - b.y || a.x - b.x);
      return { cells, size, tier } as any;
    }, [effectiveMergeProps.length, effectiveMergeCells]);
    const buildOptions = effectiveMergeProps.length > 0 ? constructionOptionsFor(effectiveMergeCluster) : [];
    const effectiveMergeValue = useMemo(
      () => effectiveMergeProps.reduce((sum: number, p: any) => sum + (p?.valueMinor ?? p?.currentValue?.amount ?? 0), 0),
      [effectiveMergeProps],
    );
    const effectiveMergeCost = Math.round(effectiveMergeValue * 0.2);

    useEffect(() => {
      if (buildChoice && !buildOptions.some((o) => o.id === buildChoice)) {
        setBuildChoice(null);
      }
    }, [buildChoice, buildOptions]);

    const filteredProvinces = useMemo(() => {
      return (provinces ?? []).filter((p) => {
        const matchSearch =
          p.name.toLowerCase().includes(provinceSearch.toLowerCase()) || p.code.includes(provinceSearch);
        const matchRegion = regionFilter === 'all' || p.region === regionFilter;
        return matchSearch && matchRegion;
      });
    }, [provinces, provinceSearch, regionFilter]);

    if (characterLoading || mapLoading || reLoading || (activeProvince !== '001' && provinceLandLoading)) {
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
                  tone="positive"
                />
                <StatCard
                  label="Tài sản ròng"
                  value={formatMoney(character.netWorth.amount)}
                />
                <StatCard
                  label="ĐIỂM TÍN DỤNG"
                  value={character.creditScore}
                />
                <StatCard
                  label="MỨC TRUY NÃ NGẦM"
                  value={`${character.heatLevel} / 100`}
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
                                                                  onClick={() => {
                                                                    setBidInput(String(Math.round(activeAuction.currentBid.amount * 1.05)));
                                                                    setBidError(null);
                                                                  }}
                                                                  className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-500"
                                                                >
                                                                  🔨 Đặt giá nhanh (+5%)
                                                                </button>
                                                              )}

                                                              {selected.property?.isMine && selected.property.mergedIntoPropertyId && (
                                                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                                                  Đã hợp nhất vào công trình (ô thành viên)
                                                                </span>
                                                              )}
                                                              {selected.property?.isMine && selected.property.mergedIntoPropertyId && selected.property.status === 'owned' && !(selected.property.constructionOption || selected.property.mergeGroupId) && (
                                                                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2">
                                                                  <span className="text-[11px] text-rose-800">Ô này thuộc cụm đã hợp thửa/công trình. Bạn có thể phá dỡ để tách và trả về đất nền.</span>
                                                                  <button
                                                                    type="button"
                                                                    disabled={demolishing}
                                                                    onClick={() => void handleDemolish()}
                                                                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                  >
                                                                    {demolishing ? 'Đang phá dỡ…' : 'Phá dỡ / Trả về đất nền'}
                                                                  </button>
                                                                  {demolishError && <span className="text-[11px] text-rose-600">{demolishError}</span>}
                                                                  {demolishOk && <span className="text-[11px] font-semibold text-emerald-700">{demolishOk}</span>}
                                                                </div>
                                                              )}
                                                              {selected.property?.isMine && selected.property.constructionOption && !selected.property.mergedIntoPropertyId && (
                                                                <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                                                                  🏗 Công trình: {selected.property.constructionLabel ?? selected.property.constructionOption}
                                                                </span>
                                                              )}
                                                              {selected.property?.isMine && (selected.property.constructionOption || selected.property.mergedIntoPropertyId || selected.property.mergeGroupId) && selected.property.status === 'owned' && (
                                                                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2">
                                                                  <span className="text-[11px] text-rose-800">Có thể phá dỡ công trình/hủy hợp thửa để trả về đất nền.</span>
                                                                  <button
                                                                    type="button"
                                                                    disabled={demolishing}
                                                                    onClick={() => void handleDemolish()}
                                                                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                  >
                                                                    {demolishing ? 'Đang phá dỡ…' : 'Phá dỡ / Trả về đất nền'}
                                                                  </button>
                                                                  {demolishError && <span className="text-[11px] text-rose-600">{demolishError}</span>}
                                                                  {demolishOk && <span className="text-[11px] font-semibold text-emerald-700">{demolishOk}</span>}
                                                                </div>
                                                              )}
                                                              {selected.property?.isMine && selectedCluster && !selected.property.constructionOption && !selected.property.mergedIntoPropertyId && (
                                                                <div className="flex w-full flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50/60 p-2">
                                                                  <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-semibold text-orange-700">
                                                                      Hợp thửa {effectiveMergeIds.length}/{selectedCluster.size} ô
                                                                    </span>
                                                                    <span className="text-[11px] text-slate-600">
                                                                      Chi phí ~{formatMoney(effectiveMergeCost)} (20% giá trị cụm)
                                                                    </span>
                                                                    {!effectiveMergeConnected && (
                                                                      <span className="text-[11px] font-semibold text-rose-600">Cụm chọn chưa liền kề</span>
                                                                    )}
                                                                  </div>

                                                                  <div className="flex flex-wrap gap-1.5">
                                                                    {selectedClusterProperties.map((p: any) => {
                                                                      const checked = effectiveMergeIds.includes(p.id);
                                                                      const isPrimary = p.id === selected.property?.id;
                                                                      const label = `Ô [${p.location?.x ?? '?'},${p.location?.y ?? '?'}]`;
                                                                      return (
                                                                        <button
                                                                          key={p.id}
                                                                          type="button"
                                                                          disabled={constructing || isPrimary}
                                                                          onClick={() => {
                                                                            setMergeSelectedIds((prev) => {
                                                                              const set = new Set(prev.length ? prev : selectedClusterMemberIds);
                                                                              if (set.has(p.id)) set.delete(p.id); else set.add(p.id);
                                                                              if (selected.property?.id) set.add(selected.property.id);
                                                                              return selectedClusterMemberIds.filter((id) => set.has(id));
                                                                            });
                                                                            setConstructError(null);
                                                                            setConstructOk(null);
                                                                          }}
                                                                          className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                                                                            checked
                                                                              ? 'border-orange-500 bg-orange-500 text-white'
                                                                              : 'border-orange-200 bg-white text-orange-700 hover:bg-orange-100'
                                                                          } ${isPrimary ? 'opacity-80' : ''}`}
                                                                          title={isPrimary ? `${label} (ô đang chọn, bắt buộc)` : `Chọn/bỏ chọn ${label} để hợp thửa`}
                                                                        >
                                                                          {checked ? '✓ ' : ''}{label}{isPrimary ? ' • chính' : ''}
                                                                        </button>
                                                                      );
                                                                    })}
                                                                  </div>

                                                                  <div className="flex flex-wrap items-center gap-2">
                                                                    <input
                                                                      type="text"
                                                                      value={constructionName}
                                                                      onChange={(e) => setConstructionName(e.target.value)}
                                                                      maxLength={80}
                                                                      placeholder="Tên công trình (tuỳ chọn)"
                                                                      className="min-w-[220px] flex-1 rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-400"
                                                                    />
                                                                  </div>

                                                                  <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="text-[11px] font-medium text-slate-600">Công trình:</span>
                                                                    {buildOptions.map((opt) => (
                                                                      <button
                                                                        key={opt.id}
                                                                        type="button"
                                                                        disabled={constructing}
                                                                        onClick={() => { setBuildChoice(opt.id); setConstructError(null); setConstructOk(null); }}
                                                                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${buildChoice === opt.id
                                                                            ? 'bg-orange-600 text-white'
                                                                            : 'bg-white text-orange-700 border border-orange-200 hover:bg-orange-100'
                                                                          }`}
                                                                        title={`Yêu cầu tối thiểu ${opt.minTiles} ô • Hệ số giá trị x${opt.valueMultiplier}`}
                                                                      >
                                                                        {opt.label}
                                                                      </button>
                                                                    ))}
                                                                    {buildOptions.length === 0 && (
                                                                      <span className="text-[11px] text-slate-500">Chọn số ô hợp lệ để xem phương án xây dựng.</span>
                                                                    )}
                                                                  </div>

                                                                  <div className="flex flex-wrap items-center gap-2">
                                                                    <button
                                                                      type="button"
                                                                      disabled={constructing || !buildChoice || !effectiveMergeConnected || effectiveMergeIds.length === 0}
                                                                      onClick={() => void handleConstruct()}
                                                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                                    >
                                                                      {constructing ? 'Đang xây dựng…' : `Xác nhận xây dựng (${effectiveMergeIds.length} ô)`}
                                                                    </button>
                                                                    {constructError && <span className="text-[11px] text-rose-600">{constructError}</span>}
                                                                    {constructOk && <span className="text-[11px] font-semibold text-emerald-600">{constructOk}</span>}
                                                                  </div>
                                                                </div>
                                                              )}

                                                              {(() => {
                                                                const p: any = selected?.property;
                                                                if (!p) return null;
                                                                const isProvinceLand = p.provinceSource === 'province-land' || activeProvince !== '001';
                                                                const isBuilt = !!(p.constructionOption || p.constructionBuiltAt || p.mergedIntoPropertyId);
                                                                const myPendingOffers = (p.offers ?? []).filter((o: any) => o.isMine && o.status === 'pending');
                                                                const incomingPendingOffers = (p.offers ?? []).filter((o: any) => !o.isMine && o.status === 'pending' && p.isMine);
                                                                const canPropose = !p.isMine && !!p.ownerCharacterId && p.status !== 'auction' && isBuilt;
                                                                if (!canPropose && incomingPendingOffers.length === 0 && myPendingOffers.length === 0) return null;
                                                                return (
                                                                  <div className="flex w-full flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-2">
                                                                    <div className="text-[11px] font-semibold text-sky-800">
                                                                      {isProvinceLand ? 'Đề xuất mua (đất/công trình tỉnh)' : 'Đề xuất mua (công trình/BĐS)'}
                                                                    </div>
                                                                    {canPropose && (
                                                                      <div className="flex flex-wrap items-center gap-2">
                                                                        <input
                                                                          type="number"
                                                                          value={offerAmount}
                                                                          onChange={(e) => setOfferAmount(e.target.value)}
                                                                          placeholder="Số tiền đề xuất (VND)"
                                                                          className="w-44 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-400"
                                                                        />
                                                                        <input
                                                                          type="text"
                                                                          value={offerMsg}
                                                                          onChange={(e) => setOfferMsg(e.target.value)}
                                                                          maxLength={500}
                                                                          placeholder="Lời nhắn (tuỳ chọn)"
                                                                          className="min-w-[220px] flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-400"
                                                                        />
                                                                        <button
                                                                          type="button"
                                                                          disabled={offerLoading}
                                                                          onClick={() => void handlePurchaseOffer()}
                                                                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-60"
                                                                        >
                                                                          {offerLoading ? 'Đang gửi…' : 'Đề xuất mua'}
                                                                        </button>
                                                                      </div>
                                                                    )}
                                                                    {myPendingOffers.length > 0 && (
                                                                      <div className="space-y-1 text-[11px] text-slate-700">
                                                                        {myPendingOffers.map((o: any) => (
                                                                          <div key={o.id} className="flex flex-wrap items-center gap-2">
                                                                            <span>Bạn đã đề xuất <b>{formatMoney(o.amount?.amount ?? 0)}</b> (đang chờ).</span>
                                                                            <button
                                                                              type="button"
                                                                              disabled={offerLoading}
                                                                              onClick={() => void handlePurchaseOfferRespond(o.id, 'cancel')}
                                                                              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                                            >
                                                                              Hủy đề xuất
                                                                            </button>
                                                                          </div>
                                                                        ))}
                                                                      </div>
                                                                    )}
                                                                    {incomingPendingOffers.length > 0 && (
                                                                      <div className="space-y-1 text-[11px] text-slate-700">
                                                                        <div className="font-semibold text-slate-800">Đề xuất đang chờ bạn xử lý:</div>
                                                                        {incomingPendingOffers.map((o: any) => (
                                                                          <div key={o.id} className="flex flex-wrap items-center gap-2">
                                                                            <span>{o.buyerName || 'Người mua'} đề xuất <b>{formatMoney(o.amount?.amount ?? 0)}</b>{o.message ? ` — "${o.message}"` : ''}</span>
                                                                            <button
                                                                              type="button"
                                                                              disabled={offerLoading}
                                                                              onClick={() => void handlePurchaseOfferRespond(o.id, 'accept')}
                                                                              className="rounded-md bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                                            >
                                                                              Chấp nhận
                                                                            </button>
                                                                            <button
                                                                              type="button"
                                                                              disabled={offerLoading}
                                                                              onClick={() => void handlePurchaseOfferRespond(o.id, 'reject')}
                                                                              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                                            >
                                                                              Từ chối
                                                                            </button>
                                                                          </div>
                                                                        ))}
                                                                      </div>
                                                                    )}
                                                                    {offerError && <span className="text-[11px] text-rose-600">{offerError}</span>}
                                                                    {offerOk && <span className="text-[11px] font-semibold text-emerald-700">{offerOk}</span>}
                                                                  </div>
                                                                );
                                                              })()}

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
                  {mapDto?.provinceName ?? 'Đô thị'}
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
                                                            mergedClusters={actualMergedClusters}
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
                                                                      <Panel title="Phiên Đấu Giá Đất" borderColor="rose">
                                                                        <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                                                                          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                                                                            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                                                                            Phiên đang mở
                                                                          </span>
                                                                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 font-mono text-xs font-bold text-rose-700">
                                                                            {activeAuction ? `⏱ Còn ${countdownLabel}` : '—'}
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
                                                                                onClick={() => {
                                                                                  setBidInput(String(Math.round(activeAuction.currentBid.amount * 1.05)));
                                                                                  setBidError(null);
                                                                                }}
                                                                                className="rounded-xl border border-rose-200 bg-rose-50 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                                                              >
                                                                                +5% ({formatMoney(Math.round(activeAuction.currentBid.amount * 1.05))})
                                                                              </button>
                                                                              <button
                                                                                type="button"
                                                                                disabled={bidding}
                                                                                onClick={() => {
                                                                                  setBidInput(String(Math.round(activeAuction.currentBid.amount * 1.1)));
                                                                                  setBidError(null);
                                                                                }}
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
                                                                            Hiện chưa có phiên đấu giá nào đang mở cho tỉnh/thành này.
                                                                          </p>
            )}
                                                                        </Panel>

                                                                        {/* Du lịch & Lưu trú */}
                                                                        <Panel title="Du lịch & Lưu trú" borderColor="emerald">
                                                                          <div className="space-y-3 text-sm">
                                                                            {travelLoading ? (
                                                                              <p className="text-xs text-slate-500">Đang tải thông tin du lịch…</p>
                                                                            ) : travelOverview?.inActiveTrip && travelOverview?.activeTrip ? (
                                                                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                  <div className="font-semibold text-amber-900">Đang nghỉ dưỡng</div>
                                                                                  <Badge variant="warning">Đang diễn ra</Badge>
                                                                                </div>
                                                                                <div className="mt-1 text-xs text-amber-800">
                                                                                  {travelOverview.activeTrip.provinceName || travelOverview.activeTrip.provinceCode}
                                                                                  {` • ${travelOverview.activeTrip.durationDays} ngày`}
                                                                                </div>
                                                                                <div className="mt-1 text-xs text-amber-700">
                                                                                  Kết thúc: ngày {travelOverview.activeTrip.endGameDay + 1} (năm {travelOverview.activeTrip.endGameYear})
                                                                                </div>
                                                                                <p className="mt-2 text-[11px] text-amber-700">
                                                                                  Trong thời gian này, thao tác đi làm và chợ đen sẽ tạm khóa.
                                                                                </p>
                                                                              </div>
                                                                            ) : (
                                                                              <>
                                                                                <div className="space-y-2">
                                                                                  <label className="block text-xs font-medium text-slate-700">Điểm đến</label>
                                                                                  <select
                                                                                    value={travelProvince || activeProvince}
                                                                                    onChange={(e) => {
                                                                                      setTravelProvince(e.target.value);
                                                                                      setLodgingOptions([]);
                                                                                      setSelectedLodgingId('');
                                                                                    }}
                                                                                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                                                                                    disabled={travelBusy}
                                                                                  >
                                                                                    {(travelOverview?.destinations ?? provinces ?? []).map((d: any) => (
                                                                                      <option key={d.provinceCode || d.code} value={d.provinceCode || d.code}>
                                                                                        {(d.provinceName || d.name)}{d.isPeakSeason ? ' • Cao điểm' : ''}
                                                                                      </option>
                                                                                    ))}
                                                                                  </select>
                                                                                  {travelDestination && (
                                                                                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                                                                                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                                                                        Vé ngắn: {formatMoney(Number(travelDestination.shortTripTicket?.amount ?? 0))}
                                                                                      </span>
                                                                                      {travelDestination.isPeakSeason && (
                                                                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Mùa cao điểm x1.4</span>
                                                                                      )}
                                                                                    </div>
                                                                                  )}
                                                                                </div>

                                                                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                                                  <div className="font-medium text-slate-900">Du lịch ngắn</div>
                                                                                  <div className="mt-1 text-xs text-slate-600">Hoàn tất ngay, hồi phục thể lực tức thời.</div>
                                                                                  <button
                                                                                    type="button"
                                                                                    onClick={() => void handleShortTrip()}
                                                                                    disabled={travelBusy || !!travelOverview?.inActiveTrip}
                                                                                    className="mt-2 min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                                                                  >
                                                                                    {travelBusy ? 'Đang xử lý…' : 'Đi du lịch ngắn'}
                                                                                  </button>
                                                                                </div>

                                                                                <div className="rounded-xl border border-slate-200 p-3">
                                                                                  <div className="font-medium text-slate-900">Nghỉ dưỡng</div>
                                                                                  <div className="mt-1 text-xs text-slate-600">Chọn thời gian và nơi lưu trú tại điểm đến.</div>

                                                                                  <div className="mt-2 grid grid-cols-3 gap-2">
                                                                                    {[1, 2, 3].map((d) => (
                                                                                      <button
                                                                                        key={d}
                                                                                        type="button"
                                                                                        onClick={() => { setTravelDays(d as 1|2|3); setLodgingOptions([]); setSelectedLodgingId(''); }}
                                                                                        className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-semibold ${travelDays === d ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}
                                                                                        disabled={travelBusy}
                                                                                      >
                                                                                        {d} ngày
                                                                                      </button>
                                                                                    ))}
                                                                                  </div>

                                                                                  <button
                                                                                    type="button"
                                                                                    onClick={() => void loadLodgingOptions()}
                                                                                    disabled={lodgingLoading || travelBusy || !!travelOverview?.inActiveTrip}
                                                                                    className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                                                  >
                                                                                    {lodgingLoading ? 'Đang tải nơi lưu trú…' : 'Xem lựa chọn lưu trú'}
                                                                                  </button>

                                                                                  {lodgingOptions.length > 0 && (
                                                                                    <div className="mt-2 space-y-2">
                                                                                      {lodgingOptions.map((opt: any) => (
                                                                                        <label key={opt.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${selectedLodgingId === opt.id ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                                                                                          <input
                                                                                            type="radio"
                                                                                            name="lodging"
                                                                                            className="mt-1"
                                                                                            checked={selectedLodgingId === opt.id}
                                                                                            onChange={() => setSelectedLodgingId(opt.id)}
                                                                                          />
                                                                                          <div className="min-w-0 flex-1">
                                                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                                              <span className="text-xs font-semibold text-slate-900">{opt.name}</span>
                                                                                              <Badge variant={opt.type === 'player_property' ? 'success' : 'default'}>
                                                                                                {opt.type === 'player_property' ? 'BĐS người chơi' : 'Khách sạn'}
                                                                                              </Badge>
                                                                                            </div>
                                                                                            <div className="mt-0.5 text-[11px] text-slate-600">
                                                                                              {formatMoney(Number(opt.perDayCost?.amount ?? 0))}/ngày • Tổng {formatMoney(Number(opt.totalCost?.amount ?? 0))}
                                                                                            </div>
                                                                                          </div>
                                                                                        </label>
                                                                                      ))}
                                                                                      <button
                                                                                        type="button"
                                                                                        onClick={() => void handleStartRetreat()}
                                                                                        disabled={travelBusy || !selectedLodgingId || !!travelOverview?.inActiveTrip}
                                                                                        className="min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                                                                      >
                                                                                        {travelBusy ? 'Đang khởi hành…' : `Bắt đầu nghỉ dưỡng ${travelDays} ngày`}
                                                                                      </button>
                                                                                    </div>
                                                                                  )}
                                                                                </div>
                                                                              </>
                                                                            )}
                                                                          </div>
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
