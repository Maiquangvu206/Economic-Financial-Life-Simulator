/**
 * Quy tắc hợp thửa & xây dựng bất động sản (multi-tile construction & merging).
 *
 * Khi người chơi sở hữu nhiều ô đất liền kề (4 hướng), hệ thống gom các ô
 * thành một khối hợp thửa và mở các phương án xây dựng theo quy mô khối:
 * - 1 ô đơn        → Nhà cấp 4 / Cửa hàng nhỏ / Gara
 * - 2–3 ô liền kề  → Chung cư mini / Khách sạn boutique
 * - 4+ ô (khối 2×2)→ Trung tâm thương mại / Tòa tháp văn phòng (giá trị ×2–×4)
 */

export interface OwnedCell {
  x: number;
  y: number;
}

export interface OwnedCluster {
  /** Các ô tọa thành khối (đã sắp xếp theo y rồi x). */
  cells: OwnedCell[];
  /** Kích thước khối (số ô). */
  size: number;
  /** Phân loại quy mô. */
  tier: 'single' | 'small' | 'large';
}

export interface ConstructionOption {
  id: string;
  label: string;
  /** Hệ số nhân giá trị BĐS (dòng tiền cho thuê ước tính). */
  valueMultiplier: number;
  /** Số ô tối thiểu cần có trong khối. */
  minTiles: number;
}

export const CONSTRUCTION_OPTIONS: Record<OwnedCluster['tier'], ConstructionOption[]> = {
  single: [
    { id: 'house4', label: 'Nhà cấp 4', valueMultiplier: 1.2, minTiles: 1 },
    { id: 'shop', label: 'Cửa hàng nhỏ', valueMultiplier: 1.5, minTiles: 1 },
    { id: 'garage', label: 'Gara kinh doanh', valueMultiplier: 1.1, minTiles: 1 },
  ],
  small: [
    { id: 'mini-apartment', label: 'Chung cư mini', valueMultiplier: 2, minTiles: 2 },
    { id: 'company_hq', label: 'Xây dựng công ty (trụ sở)', valueMultiplier: 1.8, minTiles: 2 },
    { id: 'boutique-hotel', label: 'Khách sạn boutique', valueMultiplier: 2.5, minTiles: 3 },
  ],
  large: [
    { id: 'shopping-center', label: 'Trung tâm thương mại', valueMultiplier: 3, minTiles: 4 },
    { id: 'office-tower', label: 'Tòa tháp văn phòng tập đoàn', valueMultiplier: 4, minTiles: 4 },
    { id: 'company_hq', label: 'Xây dựng công ty (trụ sở)', valueMultiplier: 2.2, minTiles: 2 },
  ],
};

/** Phân loại quy mô khối theo số ô. */
export function clusterTier(size: number): OwnedCluster['tier'] {
  if (size >= 4) return 'large';
  if (size >= 2) return 'small';
  return 'single';
}

/**
 * Gom các ô thuộc sở hữu thành các khối liền kề (4 hướng: lên/xuống/trái/phải).
 * Deterministic: duyệt theo thứ tự y, x; mỗi khối sắp xếp theo y, x.
 */
export function findOwnedClusters(owned: OwnedCell[]): OwnedCluster[] {
  const remaining = new Set(owned.map((c) => `${c.x}-${c.y}`));
  const clusters: OwnedCluster[] = [];

  for (const cell of owned) {
    const key = `${cell.x}-${cell.y}`;
    if (!remaining.has(key)) continue;
    const cells: OwnedCell[] = [];
    const queue: OwnedCell[] = [cell];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentKey = `${current.x}-${current.y}`;
      if (!remaining.has(currentKey)) continue;
      remaining.delete(currentKey);
      cells.push(current);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nextKey = `${current.x + dx}-${current.y + dy}`;
        if (remaining.has(nextKey)) {
          queue.push({ x: current.x + dx, y: current.y + dy });
        }
      }
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    clusters.push({ cells, size: cells.length, tier: clusterTier(cells.length) });
  }

  return clusters;
}

/** Khối chứa tọa độ cho trước (nếu ô đó thuộc sở hữu). */
export function clusterContaining(clusters: OwnedCluster[], x: number, y: number) {
  return clusters.find((cluster) => cluster.cells.some((c) => c.x === x && c.y === y)) ?? null;
}

/** Phương án xây dựng khả dụng cho một khối (lọc theo số ô tối thiểu). */
export function constructionOptionsFor(cluster: OwnedCluster): ConstructionOption[] {
  return CONSTRUCTION_OPTIONS[cluster.tier].filter((option) => option.minTiles <= cluster.size);
}

/** Giá trị BĐS ước tính sau xây dựng = giá trị hiện tại × hệ số. */
export function projectedValue(currentValueMinor: number, multiplier: number): number {
  return Math.round(currentValueMinor * multiplier);
}
