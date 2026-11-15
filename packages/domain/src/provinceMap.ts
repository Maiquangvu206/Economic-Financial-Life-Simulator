import { provinceByCode } from './cccd.js';
import { provinceShapeGrid } from './provinceShapes.js';

/**
 * Sinh bản đồ địa giới cho một tỉnh/thành, xác định (deterministic từ mã tỉnh).
 * Địa giới lấy từ mặt nạ địa giới thật 34 tỉnh (GADM 4.1 raster 32x20,
 * scripts/gen-province-shapes.mjs) — bên ngoài là nước.
 * Vùng: trung tâm thương mại, vành đai dân cư, công nghiệp rìa, công viên đồi núi,
 * cảng cho tỉnh biển, sông (civic) theo hạt giống.
 * Map Hà Nội (001) lưu trong DB; 33 tỉnh còn lại sinh động này.
 */

export type ProvinceMapZone =
  'residential' | 'commercial' | 'industrial' | 'civic' | 'port' | 'slum' | 'water' | 'park';

export interface ProvinceMapNode {
  x: number;
  y: number;
  zone: ProvinceMapZone;
  name: string;
}

export interface ProvinceMapRoad {
  x: number;
  y: number;
  roadType: 'highway' | 'arterial' | 'local';
}

export interface ProvinceMap {
  code: string;
  name: string;
  cols: number;
  rows: number;
  nodes: ProvinceMapNode[];
  roads: ProvinceMapRoad[];
}

export const PROVINCE_MAP_COLS = 40;
export const PROVINCE_MAP_ROWS = 28;

function hashSeed(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG xác định (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nhiễu giá trị mượt (bilinear) trên lưới hạt 6x4. */
function makeNoise(
  rand: () => number,
  cols: number,
  rows: number,
): (x: number, y: number) => number {
  const gw = 8;
  const gh = 5;
  const grid: number[][] = [];
  for (let gy = 0; gy <= gh; gy += 1) {
    grid.push([]);
    for (let gx = 0; gx <= gw; gx += 1) {
      grid[gy]!.push(rand());
    }
  }
  return (x: number, y: number) => {
    const fx = (x / cols) * gw;
    const fy = (y / rows) * gh;
    const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.max(0, Math.min(gh - 1, Math.floor(fy))));
    const tx = fx - x0;
    const ty = fy - y0;
    const a = grid[y0]![x0]!;
    const b = grid[y0]![x0 + 1]!;
    const c = grid[y0 + 1]![x0]!;
    const d = grid[y0 + 1]![x0 + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Sinh bản đồ tỉnh (deterministic) — mỗi tỉnh có địa lý riêng:
 *  tâm đô thị lệch, bán kính CBD, hồ nước/rừng, hướng cảng biển và trục đường khác nhau
 *  (không cần bản đồ thật, chỉ cần khác biệt rõ rệt giữa các tỉnh).
 */
export function generateProvinceMap(code: string): ProvinceMap {
  const province = provinceByCode(code);
  const name = province?.name ?? `Tỉnh ${code}`;
  const rand = rng(hashSeed(code));
  const noise = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);
  const noise2 = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);

  // Mặt nạ địa giới thật (GADM). Không có (tỉnh mới: reload script) thì fallback ellipse.
  const shapeGrid = provinceShapeGrid(code);
  const baseCx = PROVINCE_MAP_COLS / 2;
  const baseCy = PROVINCE_MAP_ROWS / 2;
  // Địa lý riêng từng tỉnh: tâm đô thị lệch, hình dạng & bán kính CBD khác nhau.
  const cx = baseCx + (rand() - 0.5) * 10;
  const cy = baseCy + (rand() - 0.5) * 8;
  const rx = 13 + rand() * 7;
  const ry = 8 + rand() * 5;
  const cbdR = 0.12 + rand() * 0.13;
  const parkT = 0.68 + rand() * 0.18;
  const civicT = 0.45 + rand() * 0.2;
  const industrialT = 0.5 + rand() * 0.2;
  const coastal = code === '079' || province?.isCity === true || noise2(baseCx, baseCy) > 0.45;
  // Hướng cảng biển riêng từng tỉnh: 0 đông, 1 tây, 2 bắc, 3 nam.
  const portSide = Math.floor(rand() * 4);
  // Hồ/rừng riêng: 0–2 cụm nước nội địa (khác vị trí & bán kính mỗi tỉnh).
  const lakes: Array<{ lx: number; ly: number; lr: number }> = [];
  const lakeCount = Math.floor(rand() * 3);
  for (let i = 0; i < lakeCount; i += 1) {
    lakes.push({
      lx: 4 + rand() * (PROVINCE_MAP_COLS - 8),
      ly: 3 + rand() * (PROVINCE_MAP_ROWS - 6),
      lr: 1 + rand() * 2.5,
    });
  }
  // Trục đường riêng: 2 hàng + 2 cột ngẫu nhiên (không nhất thiết giữa bản đồ).
  const roadYs = new Set<number>([
    Math.floor(rand() * PROVINCE_MAP_ROWS),
    Math.floor(rand() * PROVINCE_MAP_ROWS),
  ]);
  const roadXs = new Set<number>([
    Math.floor(rand() * PROVINCE_MAP_COLS),
    Math.floor(rand() * PROVINCE_MAP_COLS),
  ]);

  function isPort(x: number, y: number, dist: number): boolean {
    if (!coastal || dist < 0.6) return false;
    if (portSide === 0) return x > cx + 2;
    if (portSide === 1) return x < cx - 2;
    if (portSide === 2) return y < cy - 1;
    return y > cy + 1;
  }

  const nodes: ProvinceMapNode[] = [];
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const edge = Math.sqrt(dx * dx + dy * dy);
      const n = noise(x, y);
      // Hồ nội địa: trong vòng hồ & có hạt giống → nước (kể cả khi trong địa giới).
      const inLake = lakes.some((l) => {
        const d = Math.sqrt((x - l.lx) ** 2 + (y - l.ly) ** 2);
        return d < l.lr && noise2(x, y) > 0.35;
      });
      let zone: ProvinceMapZone;
      if (inLake) {
        zone = 'water';
      } else {
        // Địa giới thật: đất = trong mặt nạ GADM; ngoài = nước (ánh xạ tỷ lệ sang 40x28).
        const sx = Math.min(31, Math.floor((x / PROVINCE_MAP_COLS) * 32));
        const sy = Math.min(19, Math.floor((y / PROVINCE_MAP_ROWS) * 20));
        const inShape = shapeGrid ? shapeGrid[sy * 32 + sx] : null;
        if (shapeGrid) {
          if (!inShape) {
            zone = 'water';
          } else {
            if (edge < cbdR) zone = 'commercial';
            else if (noise2(x, y) > parkT) zone = 'park';
            else if (edge < 0.45) zone = 'residential';
            else if (edge < 0.62 && noise2(x, y) > civicT) zone = 'civic';
            else if (edge < 0.8) zone = 'residential';
            else if (isPort(x, y, edge)) zone = 'port';
            else if (noise(x, y) > industrialT) zone = 'industrial';
            else zone = 'slum';
            if (coastal && y < 2 && x < 6) zone = 'water';
          }
        } else {
          // Fallback ellipse (chưa có dữ liệu shape)
          const boundary = 0.98 + (n - 0.5) * 0.28;
          if (edge > boundary) {
            zone = 'water';
          } else {
            if (edge < cbdR) zone = 'commercial';
            else if (noise2(x, y) > parkT) zone = 'park';
            else if (edge < 0.45) zone = 'residential';
            else if (edge < 0.62 && noise2(x, y) > civicT) zone = 'civic';
            else if (edge < 0.8) zone = 'residential';
            else if (isPort(x, y, edge)) zone = 'port';
            else if (noise(x, y) > industrialT) zone = 'industrial';
            else zone = 'slum';
            if (coastal && y < 2 && x < 6) zone = 'water';
          }
        }
      }
      nodes.push({
        x,
        y,
        zone,
        name: `Ô [${x},${y}] ${name}`,
      });
    }
  }

  // Đường chính: theo các trục riêng của tỉnh (hàng ngang + cột dọc ngẫu nhiên).
  const roads: ProvinceMapRoad[] = [];
  for (const y of roadYs) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (nodes.find((n) => n.x === x && n.y === y)?.zone !== 'water') {
        roads.push({ x, y, roadType: x % 8 === 0 ? 'highway' : 'arterial' });
      }
    }
  }
  for (const x of roadXs) {
    for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
      if (nodes.find((n) => n.x === x && n.y === y)?.zone !== 'water') {
        roads.push({ x, y, roadType: y % 5 === 0 ? 'arterial' : 'local' });
      }
    }
  }

  return { code, name, cols: PROVINCE_MAP_COLS, rows: PROVINCE_MAP_ROWS, nodes, roads };
}
