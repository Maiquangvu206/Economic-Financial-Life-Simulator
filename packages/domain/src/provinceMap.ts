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

export const PROVINCE_MAP_COLS = 50;
export const PROVINCE_MAP_ROWS = 38;

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
 *  tâm đô thị lệch, bán kính CBD, hồ/rừng, hướng cảng biển và trục đường khác nhau.
 *  Kích thước 50x38, tỉ lệ vùng được tái cân bằng nhưng vẫn khác biệt theo tỉnh.
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
  // Địa lý riêng từng tỉnh: tâm đô thị lệch, hình dạng & bán kính CBD khác nhau (scale theo 50x38).
  const cx = baseCx + (rand() - 0.5) * 12;
  const cy = baseCy + (rand() - 0.5) * 10;
  const rx = 16 + rand() * 8;
  const ry = 11 + rand() * 6;
  const cbdR = 0.11 + rand() * 0.07; // CBD gọn, rõ ràng
  // Ngưỡng tái cân bằng vùng (vẫn dao động theo tỉnh để bản đồ khác nhau)
  const parkT = 0.6 + rand() * 0.12;
  const civicT = 0.34 + rand() * 0.16;
  const industrialT = 0.58 + rand() * 0.12;
  const coastal = code === '079' || province?.isCity === true || noise2(baseCx, baseCy) > 0.45;
  // Hướng cảng biển riêng từng tỉnh: 0 đông, 1 tây, 2 bắc, 3 nam.
  const portSide = Math.floor(rand() * 4);
  // Hồ/rừng riêng: 0–2 cụm nước nội địa (khác vị trí & bán kính mỗi tỉnh).
  const lakes: Array<{ lx: number; ly: number; lr: number }> = [];
  const lakeCount = Math.floor(rand() * 3);
  for (let i = 0; i < lakeCount; i += 1) {
    lakes.push({
      lx: 5 + rand() * (PROVINCE_MAP_COLS - 10),
      ly: 4 + rand() * (PROVINCE_MAP_ROWS - 8),
      lr: 1.2 + rand() * 2.8,
    });
  }
  // Trục đường riêng: 2-3 hàng + 2-3 cột ngẫu nhiên (không nhất thiết giữa bản đồ).
  const roadYs = new Set<number>([
    6 + Math.floor(rand() * 8),
    16 + Math.floor(rand() * 8),
    Math.floor(rand() * PROVINCE_MAP_ROWS),
  ]);
  const roadXs = new Set<number>([
    8 + Math.floor(rand() * 10),
    28 + Math.floor(rand() * 10),
    Math.floor(rand() * PROVINCE_MAP_COLS),
  ]);

  function isPort(x: number, y: number, dist: number): boolean {
    if (!coastal || dist < 0.58) return false;
    if (portSide === 0) return x > cx + 3;
    if (portSide === 1) return x < cx - 3;
    if (portSide === 2) return y < cy - 2;
    return y > cy + 2;
  }

  const nodes: ProvinceMapNode[] = [];
  const idx = (x: number, y: number) => y * PROVINCE_MAP_COLS + x;
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const edge = Math.sqrt(dx * dx + dy * dy);
      const n = noise(x, y);
      // Hồ nội địa: trong vòng hồ & có hạt giống → nước (kể cả khi trong địa giới).
      const inLake = lakes.some((l) => {
        const d = Math.sqrt((x - l.lx) ** 2 + (y - l.ly) ** 2);
        return d < l.lr && noise2(x, y) > 0.38;
      });
      let zone: ProvinceMapZone;
      if (inLake) {
        zone = 'water';
      } else {
        // Địa giới thật: đất = trong mặt nạ GADM; ngoài = nước (ánh xạ tỷ lệ sang 50x38).
        const sx = Math.min(31, Math.floor((x / PROVINCE_MAP_COLS) * 32));
        const sy = Math.min(19, Math.floor((y / PROVINCE_MAP_ROWS) * 20));
        const inShape = shapeGrid ? shapeGrid[sy * 32 + sx] : null;
        const inside = shapeGrid ? !!inShape : edge <= (0.98 + (n - 0.5) * 0.24);
        if (!inside) {
          zone = 'water';
        } else {
          // Phân bổ vùng tái cân bằng: thương mại lõi, vành dân cư, civic/công viên xen kẽ,
          // công nghiệp theo cụm rìa, khu cảng (nếu ven biển), slum hạn chế.
          if (edge < cbdR) zone = 'commercial';
          else if (edge < 0.22 && noise2(x, y) > 0.55) zone = 'civic';
          else if (edge < 0.4) zone = 'residential';
          else if (noise2(x, y) > parkT) zone = 'park';
          else if (edge < 0.58 && n > civicT) zone = 'civic';
          else if (edge < 0.72) zone = 'residential';
          else if (isPort(x, y, edge) && noise(x, y) > 0.35) zone = 'port';
          else if (n > industrialT) zone = 'industrial';
          else if (edge > 0.82 && noise2(x, y) < 0.28) zone = 'slum';
          else zone = 'residential';
          // Góc ven biển giữ một dải nước nhỏ (đa dạng theo tỉnh)
          if (coastal && y < 2 && x < 7 && noise2(x, y) > 0.3) zone = 'water';
        }
      }
      nodes.push({ x, y, zone, name: `Ô [${x},${y}] ${name}` });
    }
  }

  // Đường chính: theo các trục riêng của tỉnh (hàng ngang + cột dọc ngẫu nhiên).
  const roads: ProvinceMapRoad[] = [];
  const byCoord = new Map<string, ProvinceMapNode>();
  for (const n of nodes) byCoord.set(`${n.x}-${n.y}`, n);
  for (const ryLine of roadYs) {
    if (ryLine < 0 || ryLine >= PROVINCE_MAP_ROWS) continue;
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (byCoord.get(`${x}-${ryLine}`)?.zone !== 'water') {
        roads.push({ x, y: ryLine, roadType: x % 10 === 0 ? 'highway' : 'arterial' });
      }
    }
  }
  for (const rxLine of roadXs) {
    if (rxLine < 0 || rxLine >= PROVINCE_MAP_COLS) continue;
    for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
      if (byCoord.get(`${rxLine}-${y}`)?.zone !== 'water') {
        roads.push({ x: rxLine, y, roadType: y % 7 === 0 ? 'arterial' : 'local' });
      }
    }
  }

  return { code, name, cols: PROVINCE_MAP_COLS, rows: PROVINCE_MAP_ROWS, nodes, roads };
}
