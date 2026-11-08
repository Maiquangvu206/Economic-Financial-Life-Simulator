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

export const PROVINCE_MAP_COLS = 32;
export const PROVINCE_MAP_ROWS = 20;

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

/** Sinh bản đồ tỉnh (deterministic). */
export function generateProvinceMap(code: string): ProvinceMap {
  const province = provinceByCode(code);
  const name = province?.name ?? `Tỉnh ${code}`;
  const rand = rng(hashSeed(code));
  const noise = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);
  const noise2 = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);

  // Mặt nạ địa giới thật (GADM). Không có (tỉnh mới: reload script) thì fallback ellipse.
  const shapeGrid = provinceShapeGrid(code);
  const cx = PROVINCE_MAP_COLS / 2;
  const cy = PROVINCE_MAP_ROWS / 2;
  const rx = 12 + rand() * 4;
  const ry = 6.5 + rand() * 2;
  const coastal = code === '079' || province?.isCity === true || noise2(cx, cy) > 0.45;

  const nodes: ProvinceMapNode[] = [];
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const edge = Math.sqrt(dx * dx + dy * dy);
      const n = noise(x, y);
      // Địa giới thật: đất = trong mặt nạ GADM; ngoài = nước.
      const inShape = shapeGrid ? shapeGrid[y * PROVINCE_MAP_COLS + x] : null;
      let zone: ProvinceMapZone;
      if (shapeGrid) {
        if (!inShape) {
          zone = 'water';
        } else {
          // Khoảng cách tới biên trung tâm chính quy hoá để gán vùng
          const dist = edge;
          if (dist < 0.18) zone = 'commercial';
          else if (noise2(x, y) > 0.78) zone = 'park';
          else if (dist < 0.45) zone = 'residential';
          else if (dist < 0.62 && noise2(x, y) > 0.55) zone = 'civic';
          else if (dist < 0.8) zone = 'residential';
          else if (coastal && x > cx) zone = 'port';
          else if (noise(x, y) > 0.6) zone = 'industrial';
          else zone = 'slum';
          if (coastal && y < 2 && x < 6) zone = 'water';
        }
      } else {
        // Fallback ellipse (chưa có dữ liệu shape)
        const boundary = 0.98 + (n - 0.5) * 0.28;
        if (edge > boundary) {
          zone = 'water';
        } else {
          const dist = edge;
          if (dist < 0.18) zone = 'commercial';
          else if (noise2(x, y) > 0.78) zone = 'park';
          else if (dist < 0.45) zone = 'residential';
          else if (dist < 0.62 && noise2(x, y) > 0.55) zone = 'civic';
          else if (dist < 0.8) zone = 'residential';
          else if (coastal && x > cx) zone = 'port';
          else if (noise(x, y) > 0.6) zone = 'industrial';
          else zone = 'slum';
          if (coastal && y < 2 && x < 6) zone = 'water';
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

  // Đường chính: theo vành đai (arterial) + trục highway dọc/gang.
  const roads: ProvinceMapRoad[] = [];
  for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
    const yMid = Math.round(cy);
    if (nodes.find((n) => n.x === x && n.y === yMid)?.zone !== 'water') {
      roads.push({ x, y: yMid, roadType: x % 8 === 0 ? 'highway' : 'arterial' });
    }
  }
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    const xMid = Math.round(cx);
    if (nodes.find((n) => n.x === xMid && n.y === y)?.zone !== 'water') {
      roads.push({ x: xMid, y, roadType: y % 5 === 0 ? 'arterial' : 'local' });
    }
  }

  return { code, name, cols: PROVINCE_MAP_COLS, rows: PROVINCE_MAP_ROWS, nodes, roads };
}
