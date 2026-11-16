import { provinceByCode } from './cccd.js';

/**
 * Sinh bản đồ tỉnh/thành (50x38), xác định theo mã tỉnh (deterministic).
 * Không phụ thuộc địa giới thực tế: mỗi tỉnh có ma trận vùng khác nhau,
 * nhưng luôn có đầy đủ 7 vùng chức năng (dân cư, thương mại, công nghiệp,
 * hành chính/dịch vụ, cảng, khu khó khăn, công viên) và khu nước, với tỉ lệ hợp lý.
 *
 * Bản đồ Hà Nội (001) lấy từ cơ sở dữ liệu; 33 tỉnh còn lại sinh động bằng hàm này.
 */

export type ProvinceMapZone =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'civic'
  | 'port'
  | 'slum'
  | 'water'
  | 'park';

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
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Nhiễu giá trị mượt (bilinear). */
function makeNoise(rand: () => number, cols: number, rows: number): (x: number, y: number) => number {
  const gw = 8;
  const gh = 6;
  const grid: number[][] = [];
  for (let gy = 0; gy <= gh; gy += 1) {
    grid.push([]);
    for (let gx = 0; gx <= gw; gx += 1) {
      grid[gy]!.push(rand());
    }
  }
  return (x: number, y: number) => {
    const fx = (x / Math.max(1, cols - 1)) * gw;
    const fy = (y / Math.max(1, rows - 1)) * gh;
    const x0 = clamp(Math.floor(fx), 0, gw - 1);
    const y0 = clamp(Math.floor(fy), 0, gh - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = grid[y0]![x0]!;
    const b = grid[y0]![x0 + 1]!;
    const c = grid[y0 + 1]![x0]!;
    const d = grid[y0 + 1]![x0 + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

function distNorm(ax: number, ay: number, bx: number, by: number): number {
  const dx = (ax - bx) / PROVINCE_MAP_COLS;
  const dy = (ay - by) / PROVINCE_MAP_ROWS;
  return Math.sqrt(dx * dx + dy * dy);
}

export function generateProvinceMap(code: string): ProvinceMap {
  const province = provinceByCode(code);
  const name = province?.name ?? `Tỉnh ${code}`;
  const seed = hashSeed(code);
  const rand = rng(seed);
  const n1 = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);
  const n2 = makeNoise(rand, PROVINCE_MAP_COLS, PROVINCE_MAP_ROWS);

  // Tâm và hình dáng tổng thể khác nhau theo tỉnh (không theo địa giới thực tế)
  const cx = PROVINCE_MAP_COLS * (0.38 + rand() * 0.24);
  const cy = PROVINCE_MAP_ROWS * (0.34 + rand() * 0.28);
  const rx = PROVINCE_MAP_COLS * (0.28 + rand() * 0.1);
  const ry = PROVINCE_MAP_ROWS * (0.24 + rand() * 0.12);
  const rot = (rand() - 0.5) * 0.9;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // Mặt nước: một dải ven theo hướng riêng của tỉnh + (tuỳ tỉnh) hồ nội địa
  const waterSide = Math.floor(rand() * 4); // 0: trái, 1: phải, 2: trên, 3: dưới
  const waterBandBase = 2 + Math.floor(rand() * 3); // bề rộng dải nước ven
  const lakeCx = 6 + rand() * (PROVINCE_MAP_COLS - 12);
  const lakeCy = 5 + rand() * (PROVINCE_MAP_ROWS - 10);
  const lakeR = 1.4 + rand() * 2.2;
  const hasLake = rand() > 0.25;

  // Tâm các vùng chức năng (khác nhau theo tỉnh) để bản đồ đa dạng nhưng đủ vùng
  const commercialC = { x: cx + (rand() - 0.5) * 8, y: cy + (rand() - 0.5) * 6 };
  const civicC = { x: clamp(cx + (rand() - 0.5) * 14, 4, PROVINCE_MAP_COLS - 5), y: clamp(cy + (rand() - 0.5) * 10, 4, PROVINCE_MAP_ROWS - 5) };
  const industrialC = { x: clamp(cx + (rand() > 0.5 ? 1 : -1) * (8 + rand() * 8), 4, PROVINCE_MAP_COLS - 5), y: clamp(cy + (rand() - 0.2) * 10, 4, PROVINCE_MAP_ROWS - 5) };
  const parkC = { x: clamp(cx + (rand() - 0.5) * 16, 4, PROVINCE_MAP_COLS - 5), y: clamp(cy + (rand() - 0.5) * 12, 4, PROVINCE_MAP_ROWS - 5) };
  const slumC = { x: clamp(cx + (rand() - 0.5) * 18, 4, PROVINCE_MAP_COLS - 5), y: clamp(cy + (rand() - 0.5) * 12, 4, PROVINCE_MAP_ROWS - 5) };
  const portC = (() => {
    if (waterSide === 0) return { x: 4 + rand() * 4, y: 8 + rand() * (PROVINCE_MAP_ROWS - 16) };
    if (waterSide === 1) return { x: PROVINCE_MAP_COLS - 5 - rand() * 4, y: 8 + rand() * (PROVINCE_MAP_ROWS - 16) };
    if (waterSide === 2) return { x: 10 + rand() * (PROVINCE_MAP_COLS - 20), y: 4 + rand() * 4 };
    return { x: 10 + rand() * (PROVINCE_MAP_COLS - 20), y: PROVINCE_MAP_ROWS - 5 - rand() * 4 };
  })();

  const idx = (x: number, y: number) => y * PROVINCE_MAP_COLS + x;
  const zones: ProvinceMapZone[] = new Array(PROVINCE_MAP_COLS * PROVINCE_MAP_ROWS).fill('water');

  // 1) Xác định đất liền và nước
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const rxp = (dx * cos + dy * sin) / rx;
      const ryp = (-dx * sin + dy * cos) / ry;
      const ellipse = Math.sqrt(rxp * rxp + ryp * ryp);
      const edgeNoise = (n1(x, y) - 0.5) * 0.22;
      let land = ellipse <= 1.02 + edgeNoise;

      // Cắt dải nước ven biển/ven sông (đảm bảo luôn có khu nước rõ rệt)
      let band = 0;
      if (waterSide === 0) band = waterBandBase - x;
      else if (waterSide === 1) band = waterBandBase - (PROVINCE_MAP_COLS - 1 - x);
      else if (waterSide === 2) band = waterBandBase - y;
      else band = waterBandBase - (PROVINCE_MAP_ROWS - 1 - y);
      if (band > 0 && n2(x, y) > 0.18 - band * 0.05) land = false;

      // Hồ nội địa (nếu có)
      if (hasLake) {
        const dl = Math.sqrt((x - lakeCx) ** 2 + (y - lakeCy) ** 2);
        if (dl < lakeR && n2(x, y) > 0.3) land = false;
      }

      zones[idx(x, y)] = land ? 'residential' : 'water';
    }
  }

  const landIndices: number[] = [];
  for (let i = 0; i < zones.length; i += 1) if (zones[i] !== 'water') landIndices.push(i);

  // Bảo đảm có đủ đất liền để đặt đủ 7 vùng
  const needLand = 350;
  if (landIndices.length < needLand) {
    // Mở rộng đất liền từ trung tâm nếu bị thiếu
    const byDist: number[] = [];
    for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
      for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) byDist.push(idx(x, y));
    }
    byDist.sort((a, b) => {
      const ax = a % PROVINCE_MAP_COLS, ay = Math.floor(a / PROVINCE_MAP_COLS);
      const bx = b % PROVINCE_MAP_COLS, by = Math.floor(b / PROVINCE_MAP_COLS);
      return distNorm(ax, ay, cx, cy) - distNorm(bx, by, cx, cy);
    });
    for (const i of byDist) {
      if (landIndices.length >= needLand) break;
      if (zones[i] === 'water') {
        zones[i] = 'residential';
        landIndices.push(i);
      }
    }
  }

  const setZone = (x: number, y: number, z: ProvinceMapZone) => {
    if (x < 0 || y < 0 || x >= PROVINCE_MAP_COLS || y >= PROVINCE_MAP_ROWS) return;
    const i = idx(x, y);
    if (zones[i] === 'water') return;
    zones[i] = z;
  };

  // 2) Đặt các vùng chức năng với tỉ lệ hợp lý (và đảm bảo luôn có mặt)
  // Trung tâm thương mại (gần lõi)
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (zones[idx(x, y)] === 'water') continue;
      const d = distNorm(x, y, commercialC.x, commercialC.y);
      if (d < 0.075 + n1(x, y) * 0.02) setZone(x, y, 'commercial');
      else if (d < 0.12 && n2(x, y) > 0.62) setZone(x, y, 'commercial');
    }
  }

  // Khu hành chính/dịch vụ (civic)
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (zones[idx(x, y)] === 'water') continue;
      const d = distNorm(x, y, civicC.x, civicC.y);
      if (d < 0.085 + n2(x, y) * 0.02) setZone(x, y, 'civic');
    }
  }

  // Khu công nghiệp (cụm rõ)
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (zones[idx(x, y)] === 'water') continue;
      const d = distNorm(x, y, industrialC.x, industrialC.y);
      if (d < 0.11 + n1(x, y) * 0.03) setZone(x, y, 'industrial');
    }
  }

  // Công viên/cây xanh
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (zones[idx(x, y)] === 'water') continue;
      const d = distNorm(x, y, parkC.x, parkC.y);
      if (d < 0.095 + n2(x, y) * 0.025) setZone(x, y, 'park');
    }
  }

  // Khu khó khăn (slum) - quy mô nhỏ, tập trung
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (zones[idx(x, y)] === 'water') continue;
      const d = distNorm(x, y, slumC.x, slumC.y);
      if (d < 0.07 + n1(x, y) * 0.015) setZone(x, y, 'slum');
    }
  }

  // Cảng (đặt gần mép nước) - mọi tỉnh đều có khu cảng theo yêu cầu
  const placePort = () => {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = 1; y < PROVINCE_MAP_ROWS - 1; y += 1) {
      for (let x = 1; x < PROVINCE_MAP_COLS - 1; x += 1) {
        if (zones[idx(x, y)] === 'water') continue;
        const nearWater =
          zones[idx(x - 1, y)] === 'water' ||
          zones[idx(x + 1, y)] === 'water' ||
          zones[idx(x, y - 1)] === 'water' ||
          zones[idx(x, y + 1)] === 'water';
        if (!nearWater) continue;
        const d = distNorm(x, y, portC.x, portC.y);
        const score = -d + n1(x, y) * 0.05;
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    return best;
  };
  const portSeed = placePort();
  if (portSeed) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        setZone(portSeed.x + dx, portSeed.y + dy, 'port');
      }
    }
  }

  // Rải thêm một số cụm nhỏ để tỉ lệ vùng hợp lý và đa dạng
  const sprinkle = (zone: ProvinceMapZone, attempts: number, radius: number, center: { x: number; y: number }) => {
    for (let i = 0; i < attempts; i += 1) {
      const ang = rand() * Math.PI * 2;
      const rr = rand() * radius;
      const x = Math.round(center.x + Math.cos(ang) * rr);
      const y = Math.round(center.y + Math.sin(ang) * rr);
      if (x < 0 || y < 0 || x >= PROVINCE_MAP_COLS || y >= PROVINCE_MAP_ROWS) continue;
      if (zones[idx(x, y)] === 'water') continue;
      zones[idx(x, y)] = zone;
    }
  };
  sprinkle('residential', 90, 16, { x: cx, y: cy });
  sprinkle('commercial', 35, 10, commercialC);
  sprinkle('civic', 30, 10, civicC);
  sprinkle('industrial', 45, 12, industrialC);
  sprinkle('park', 40, 12, parkC);
  sprinkle('slum', 18, 9, slumC);

  // 3) Đảm bảo đủ hiện diện tất cả 7 vùng chức năng (phòng trường hợp hiếm)
  const required: ProvinceMapZone[] = ['residential', 'commercial', 'industrial', 'civic', 'port', 'slum', 'park'];
  const hasZone = (z: ProvinceMapZone) => zones.some((v) => v === z);
  for (const z of required) {
    if (hasZone(z)) continue;
    const pick = landIndices[Math.floor(rand() * landIndices.length)] ?? landIndices[0];
    if (pick != null) zones[pick] = z;
  }
  // Đảm bảo có nước (luôn đúng do dải ven, nhưng an toàn)
  if (!zones.some((v) => v === 'water')) {
    zones[0] = 'water';
    zones[1] = 'water';
  }

  const nodes: ProvinceMapNode[] = [];
  for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      const zone = zones[idx(x, y)]!;
      nodes.push({ x, y, zone, name: `Ô [${x},${y}] ${name}` });
    }
  }

  // Đường: lưới trục thay đổi theo tỉnh, chỉ đi qua đất liền
  const byCoord = new Map<string, ProvinceMapNode>();
  for (const n of nodes) byCoord.set(`${n.x}-${n.y}`, n);
  const roads: ProvinceMapRoad[] = [];
  const roadYs = Array.from(
    new Set([
      clamp(Math.round(cy - 8 + (rand() - 0.5) * 4), 3, PROVINCE_MAP_ROWS - 4),
      clamp(Math.round(cy + (rand() - 0.5) * 4), 3, PROVINCE_MAP_ROWS - 4),
      clamp(Math.round(cy + 8 + (rand() - 0.5) * 4), 3, PROVINCE_MAP_ROWS - 4),
    ]),
  );
  const roadXs = Array.from(
    new Set([
      clamp(Math.round(cx - 10 + (rand() - 0.5) * 4), 4, PROVINCE_MAP_COLS - 5),
      clamp(Math.round(cx + (rand() - 0.5) * 4), 4, PROVINCE_MAP_COLS - 5),
      clamp(Math.round(cx + 10 + (rand() - 0.5) * 4), 4, PROVINCE_MAP_COLS - 5),
    ]),
  );
  for (const ry of roadYs) {
    for (let x = 0; x < PROVINCE_MAP_COLS; x += 1) {
      if (byCoord.get(`${x}-${ry}`)?.zone !== 'water') {
        roads.push({ x, y: ry, roadType: x % 12 === 0 ? 'highway' : 'arterial' });
      }
    }
  }
  for (const rx of roadXs) {
    for (let y = 0; y < PROVINCE_MAP_ROWS; y += 1) {
      if (byCoord.get(`${rx}-${y}`)?.zone !== 'water') {
        roads.push({ x: rx, y, roadType: y % 10 === 0 ? 'arterial' : 'local' });
      }
    }
  }

  return { code, name, cols: PROVINCE_MAP_COLS, rows: PROVINCE_MAP_ROWS, nodes, roads };
}
