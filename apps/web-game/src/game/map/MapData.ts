export type ZoneType =
  'residential' | 'commercial' | 'industrial' | 'civic' | 'port' | 'slum' | 'water' | 'park';

export interface MapNode {
  id: string;
  x: number;
  y: number;
  zoneType: ZoneType;
  name: string;
  /** Giá đất theo m² (VNĐ minor units). 0 = đất công cộng/không bán. */
  landPriceMinor: number;
}

export interface MapRoad {
  nodeId: string;
  roadType: 'highway' | 'arterial' | 'local' | 'bridge' | 'none';
}

export interface MapProperty {
  id: string;
  nodeId: string;
  ownerId?: string | null;
  ownerCharacterId?: string | null;
  name: string;
  type:
    | 'apartment'
    | 'house'
    | 'office'
    | 'warehouse'
    | 'port_berth'
    | 'land'
    | 'shop'
    | 'garage'
    | 'mini_apartment'
    | 'boutique_hotel'
    | 'shopping_center'
    | 'office_tower';
  propertyType?: string;
  status: 'unowned' | 'owned' | 'listed' | 'auction' | string;
  /** Giá mua (VNĐ minor units). */
  purchasePriceMinor: number;
  /** Giá bán nếu đang listing (VNĐ minor units). */
  askingPriceMinor?: number | null;
  /** Hiện tại người chơi đang xem có sở hữu không. */
  isMine: boolean;
  valueMinor?: number;
  location?: { x: number; y: number } | null;
  provinceSource?: 'core' | 'province-land';
  constructionOption?: string | null;
  constructionLabel?: string | null;
  constructionTier?: 'single' | 'small' | 'large' | string | null;
  constructionMultiplier?: number;
  constructionCostMinor?: number;
  constructionBuiltAt?: string | null;
  mergedIntoPropertyId?: string | null;
  mergeGroupId?: string | null;
  mergedMembers?: any[];
  offers?: any[];
  isMergedMember?: boolean;
  mergedPrimaryId?: string | null;
}

export interface MapMeta {
  version: number;
  cols: number;
  rows: number;
}

export interface MapData {
  nodes: MapNode[];
  roads: MapRoad[];
  properties: MapProperty[];
  meta: MapMeta;
  /** Tỉnh/thành của bản đồ đang hiển thị. */
  provinceCode?: string;
  provinceName?: string;
}
