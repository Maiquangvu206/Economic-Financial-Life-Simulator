import { provinceByCode } from './cccd.js';

/**
 * SINH DỮ LIỆU BẢN ĐỒ TỈNH/THÀNH (PROCEDURAL MAP GENERATOR / SEEDER) — v3
 *
 * Bản đồ 50x38 cho 33 tỉnh/thành (trừ Hà Nội 001 — bản đồ lõi lưu trong DB, KHÔNG đụng tới).
 *
 * Nguyên tắc:
 * 1) SEEDED PROCEDURAL: seed = hash(mã tỉnh) → PRNG + Multi-octave Perlin noise với
 *    offset tọa độ và góc xoay riêng theo tỉnh → hình thái địa hình độc lập, không tỉnh
 *    nào trùng hình dáng/vị trí khu vực với tỉnh nào.
 * 2) NHÓM HÌNH THÁI ĐỊA LÝ (theo địa lý thực tế):
 *    - mountain  (núi/cao nguyên): không biển, đồi núi (park) uốn lượn bao quanh thung
 *      lũng đô thị, 1 dòng sông/suối nhỏ uốn khúc ~5-8% bản đồ.
 *    - delta     (đồng bằng nội địa): đất liền 90-95%, sông lớn chia cắt 2-3 bờ phát triển.
 *    - coastal_east (ven biển - bờ Đông/Đông Nam: Quảng Ninh, Hải Phòng, Đà Nẵng, Khánh Hòa...)
 *    - coastal_west (ven biển - bờ Tây/Tây Nam: Cà Mau, An Giang)
 *    - riverine  (sông nước: TP.HCM, Cần Thơ, Đồng Tháp, Vĩnh Long - mạng sông rạch chằng chịt).
 * 3) CBD ANCHOR ngẫu nhiên có kiểm soát: tâm đô thị lệch theo tỉnh (có tỉnh 2 cực phát triển).
 * 4) WEIGHTED ZONING: phần đất liền luôn đủ 7 phân khu với tỉ lệ cân đối
 *    (CBD 10-15%, dân cư 25-30%, hành chính 10-15%, công nghiệp 15-20%, ngoại ô/tự phát
 *    15-20%, công viên/đồi núi 10-15%, cảng & ven biển 15-25% với tỉnh giáp biển;
 *    tỉnh nội địa có sông ngòi ~5-8% tổng bản đồ).
 *
 * Ánh xạ phân khu theo Ma trận giá Admin (id khớp hệ thống hiện hành):
 *   cbd → commercial · residential → residential · administrative → civic
 *   industrial → industrial · suburban → slum · park_mountain → park
 *   coastal_port → port · nước → water
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
  roadType: 'highway' | 'arterial' | 'local' | 'bridge';
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

// ---------------------------------------------------------------------------
// Nhóm hình thái địa lý (33 tỉnh, trừ 001 Hà Nội)
// ---------------------------------------------------------------------------

export type ProvinceMapGroup = 'mountain' | 'delta' | 'coastal_east' | 'coastal_west' | 'riverine';

export const PROVINCE_MAP_GROUPS: Record<string, ProvinceMapGroup> = {
  // Nhóm 1 — miền núi & cao nguyên (không biển, sông suối nhỏ)
  '004': 'mountain', // Cao Bằng
  '008': 'mountain', // Tuyên Quang
  '011': 'mountain', // Điện Biên
  '012': 'mountain', // Lai Châu
  '014': 'mountain', // Sơn La
  '015': 'mountain', // Lào Cai
  '020': 'mountain', // Lạng Sơn
  '052': 'mountain', // Gia Lai
  '066': 'mountain', // Đắk Lắk
  '068': 'mountain', // Lâm Đồng
  // Nhóm 2 — đồng bằng nội địa (sông lớn chia cắt, đất phủ 90-95%)
  '019': 'delta', // Thái Nguyên
  '024': 'delta', // Bắc Ninh
  '025': 'delta', // Phú Thọ
  '033': 'delta', // Hưng Yên
  '075': 'delta', // Đồng Nai
  '080': 'delta', // Tây Ninh
  // Nhóm 3 — ven biển & cảng biển, bờ biển phía Đông/Đông Nam
  '022': 'coastal_east', // Quảng Ninh
  '031': 'coastal_east', // Hải Phòng
  '037': 'coastal_east', // Ninh Bình
  '038': 'coastal_east', // Thanh Hóa
  '040': 'coastal_east', // Nghệ An
  '042': 'coastal_east', // Hà Tĩnh
  '044': 'coastal_east', // Quảng Trị
  '046': 'coastal_east', // Huế
  '048': 'coastal_east', // Đà Nẵng
  '051': 'coastal_east', // Quảng Ngãi
  '056': 'coastal_east', // Khánh Hòa
  // Ven biển — bờ biển phía Tây/Tây Nam
  '091': 'coastal_west', // An Giang
  '096': 'coastal_west', // Cà Mau
  // Sông nước — mạng lưới sông rạch chằng chịt
  '079': 'riverine', // TP. Hồ Chí Minh
  '082': 'riverine', // Đồng Tháp
  '086': 'riverine', // Vĩnh Long
  '092': 'riverine', // Cần Thơ
};

// ---------------------------------------------------------------------------
// PRNG & noise (deterministic, không phụ thuộc thư viện ngoài)
// ---------------------------------------------------------------------------

/** Hash chuỗi → uint32 (xmur3). */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** PRNG mulberry32 — chuỗi số giả ngẫu nhiên xác định theo seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Multi-octave Perlin noise (fBm) — bảng hoán vị riêng theo rand → mỗi tỉnh một trường noise. */
class PerlinField {
  private readonly perm: Int32Array;

  constructor(rand: () => number) {
    const base: number[] = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = base[i]!;
      base[i] = base[j]!;
      base[j] = tmp;
    }
    const p = new Int32Array(512);
    for (let i = 0; i < 512; i += 1) p[i] = base[i & 255]!;
    this.perm = p;
  }

  private grad(hash: number, x: number, y: number): number {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  /** Perlin 2D cơ bản, giá trị ~[-1, 1]. */
  noise2(x: number, y: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const X = fx & 255;
    const Y = fy & 255;
    const xf = x - fx;
    const yf = y - fy;
    const u = fade(xf);
    const v = fade(yf);
    const aa = this.perm[this.perm[X]! + Y]!;
    const ab = this.perm[this.perm[X]! + Y + 1]!;
    const ba = this.perm[this.perm[X + 1]! + Y]!;
    const bb = this.perm[this.perm[X + 1]! + Y + 1]!;
    const x1 = lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
    const x2 = lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  /** fBm đa octave (mặc định 4 octave), giá trị ~[-1, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

// ---------------------------------------------------------------------------
// Tiện ích lưới
// ---------------------------------------------------------------------------

const COLS = PROVINCE_MAP_COLS;
const ROWS = PROVINCE_MAP_ROWS;
const TOTAL_CELLS = COLS * ROWS;

type LandZone = Exclude<ProvinceMapZone, 'water'>;

const LAND_ZONES: LandZone[] = ['residential', 'commercial', 'industrial', 'civic', 'port', 'slum', 'park'];

interface Pt {
  x: number;
  y: number;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** Chọn N phần tử có score nhỏ nhất từ danh sách (không làm mất danh sách gốc). */
function takeLowest(items: number[], scores: number[], count: number): number[] {
  return items
    .map((v, i) => ({ v, s: scores[i]! }))
    .sort((a, b) => a.s - b.s)
    .slice(0, Math.max(0, count))
    .map((e) => e.v);
}

/** Tìm ô đất liền gần nhất với một điểm (vòng lan toả). */
function nearestLand(land: boolean[], px: number, py: number): Pt {
  const sx = clamp(Math.round(px), 0, COLS - 1);
  const sy = clamp(Math.round(py), 0, ROWS - 1);
  if (land[sy * COLS + sx]!) return { x: sx, y: sy };
  for (let r = 1; r < Math.max(COLS, ROWS); r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (land[ny * COLS + nx]!) return { x: nx, y: ny };
      }
    }
  }
  return { x: sx, y: sy };
}

// ---------------------------------------------------------------------------
// Cân bằng tỉ lệ phân khu (weighted zoning)
// ---------------------------------------------------------------------------

interface ZoneTargets {
  commercial: number;
  residential: number;
  civic: number;
  industrial: number;
  slum: number;
  park: number;
  port: number;
}

/**
 * Tỉ lệ mục tiêu trên PHẦN ĐẤT LIỀN, jitter nhẹ theo tỉnh (mỗi tỉnh một bộ tỉ lệ riêng)
 * rồi chuẩn hoá về tổng 1. Cửa sổ chuẩn:
 *   CBD 10-15% · dân cư 25-30% · hành chính 10-15% · công nghiệp 15-20% ·
 *   ngoại ô/tự phát 15-20% · công viên/đồi núi 10-15% · cảng 15-25% (giáp biển).
 * Với tỉnh giáp biển, cảng chiếm 15-25% đất nên các nhóm khác dồn về ngưỡng dưới
 * (toán học: tổng 7 nhóm = 100%); luôn ưu tiên dân cư ≥ ~24%.
 */
function computeZoneTargets(group: ProvinceMapGroup, rand: () => number): ZoneTargets {
  const j = (a: number, b: number) => a + rand() * (b - a);
  let t: ZoneTargets;
  if (group === 'coastal_east' || group === 'coastal_west') {
    t = {
      commercial: j(0.10, 0.13),
      residential: j(0.23, 0.27),
      civic: j(0.10, 0.13),
      industrial: j(0.14, 0.18),
      slum: j(0.13, 0.17),
      park: j(0.08, 0.12),
      port: j(0.15, 0.22),
    };
  } else if (group === 'riverine') {
    // Cảng sông nhỏ hơn cảng biển, mạng nước lớn nằm ngoài phần đất
    t = {
      commercial: j(0.11, 0.15),
      residential: j(0.25, 0.30),
      civic: j(0.10, 0.14),
      industrial: j(0.15, 0.19),
      slum: j(0.14, 0.19),
      park: j(0.10, 0.14),
      port: j(0.07, 0.13),
    };
  } else {
    // mountain / delta — không có vùng cảng, jitter full cửa sổ để khác biệt tối đa
    t = {
      commercial: j(0.10, 0.15),
      residential: j(0.25, 0.30),
      civic: j(0.10, 0.15),
      industrial: j(0.15, 0.20),
      slum: j(0.15, 0.20),
      park: j(0.10, 0.15),
      port: 0,
    };
  }
  const sum = LAND_ZONES.reduce((acc, z) => acc + t[z], 0);
  for (const z of LAND_ZONES) t[z] = t[z]! / sum;
  return t;
}

/** Phân bổ số ô nguyên cho từng vùng (largest remainder, phần dư dồn vào residential). */
function allocateZoneCounts(t: ZoneTargets, landCount: number): Record<LandZone, number> {
  const raw = LAND_ZONES.map((z) => ({ z, c: t[z] * landCount }));
  const counts = {} as Record<LandZone, number>;
  let assigned = 0;
  for (const { z, c } of raw) {
    counts[z] = Math.floor(c);
    assigned += counts[z]!;
  }
  // Rounding residuals theo phần thập phân lớn nhất (trừ residential làm nơi gánh phần cuối)
  const order = raw
    .filter((e) => e.z !== 'residential')
    .map((e) => ({ z: e.z, frac: e.c - Math.floor(e.c) }))
    .sort((a, b) => b.frac - a.frac);
  let remaining = landCount - assigned;
  for (const e of order) {
    if (remaining <= 0) break;
    counts[e.z] = counts[e.z]! + 1;
    remaining -= 1;
  }
  counts.residential = counts.residential! + Math.max(0, remaining);
  return counts;
}

// ---------------------------------------------------------------------------
// Sinh bản đồ
// ---------------------------------------------------------------------------

export function generateProvinceMap(code: string): ProvinceMap {
  const province = provinceByCode(code);
  const name = province?.name ?? `Tỉnh ${code}`;
  const group: ProvinceMapGroup = PROVINCE_MAP_GROUPS[code] ?? 'delta';
  const rand = mulberry32(hashString(`efls-map-v3:${code}`));

  // ---- Trường noise riêng của tỉnh: bảng hoán vị + offset + góc xoay mẫu ----
  const terrain = new PerlinField(rand);
  const detail = new PerlinField(rand);
  const parkField = new PerlinField(rand);
  const terrainOff = { x: rand() * 1024, y: rand() * 1024 };
  const detailOff = { x: rand() * 1024, y: rand() * 1024 };
  const parkOff = { x: rand() * 1024, y: rand() * 1024 };
  const sampleRot = (rand() - 0.5) * Math.PI * 2;
  const sCos = Math.cos(sampleRot);
  const sSin = Math.sin(sampleRot);
  const terrainScale = 0.055 + rand() * 0.05; // cỡ đặc trưng địa hình theo tỉnh

  function sampleTerrain(x: number, y: number): number {
    const xr = (x * sCos - y * sSin) * terrainScale + terrainOff.x;
    const yr = (x * sSin + y * sCos) * terrainScale + terrainOff.y;
    return terrain.fbm(xr, yr, 4);
  }
  function sampleDetail(x: number, y: number): number {
    const xr = (x * sCos - y * sSin) * 0.16 + detailOff.x;
    const yr = (x * sSin + y * sCos) * 0.16 + detailOff.y;
    return detail.fbm(xr, yr, 3);
  }
  function samplePark(x: number, y: number): number {
    const xr = (x * sCos - y * sSin) * (0.07 + rand0Static * 0.04) + parkOff.x;
    const yr = (x * sSin + y * sCos) * (0.07 + rand0Static * 0.04) + parkOff.y;
    return parkField.fbm(xr, yr, 4);
  }
  const rand0Static = rand(); // mật độ đặc trưng xanh/đồi núi riêng của tỉnh

  // ---- 1) KHỐI ĐẤT LIỀN THEO NHÓM HÌNH THÁI ----
  const idx = (x: number, y: number) => y * COLS + x;
  const land = new Array<boolean>(TOTAL_CELLS).fill(false);

  const blobCx = COLS * (0.5 + (rand() - 0.5) * 0.1);
  const blobCy = ROWS * (0.5 + (rand() - 0.5) * 0.1);
  const landRot = (rand() - 0.5) * 0.9;
  const lCos = Math.cos(landRot);
  const lSin = Math.sin(landRot);

  // Tham số riêng theo nhóm
  const coastBase = 0.58 + rand() * 0.14; // vị trí đường bờ biển (tỉ lệ trục)
  const coastTilt = (rand() - 0.5) * 0.55; // nghiêng đường bờ
  const coastPhase = rand() * Math.PI * 2;
  const coastAmp = 3 + rand() * 4; // biên độ meander đường bờ (ô)
  const isCoastal = group === 'coastal_east' || group === 'coastal_west';

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const n = sampleTerrain(x, y); // ~[-1, 1]
      if (isCoastal) {
        // Bờ biển: đường cong meander + nhiễu địa hình; đất nằm về một phía.
        // coastal_east: biển phía Đông/Đông Nam (đất phía Tây) — coastal_west: ngược lại.
        const along = y + Math.tan(coastTilt) * x;
        const coastAbs =
          COLS * coastBase +
          Math.sin(coastPhase + (along / ROWS) * Math.PI * 2) * coastAmp +
          n * (2.5 + rand0Static * 2);
        const edgeAbs = group === 'coastal_east' ? coastAbs : COLS - coastAbs;
        land[idx(x, y)] = group === 'coastal_east' ? x < edgeAbs : x > edgeAbs;
      } else {
        // Khối đất gần phủ hết bản đồ (tỉnh nội địa — đất liền khắp nơi, chỉ sông/ngòi/góc
        // gồ ghề là nước); ellipse xoay + nhiễu tạo hình dáng riêng từng tỉnh.
        const rx = COLS * (0.72 + rand0Static * 0.06);
        const ry = ROWS * (0.72 + rand0Static * 0.06);
        const rxp = ((x - blobCx) * lCos + (y - blobCy) * lSin) / rx;
        const ryp = (-(x - blobCx) * lSin + (y - blobCy) * lCos) / ry;
        const ellipse = Math.sqrt(rxp * rxp + ryp * ryp);
        const edge = group === 'mountain' ? 0.10 : 0.05; // miền núi mép gồ ghề hơn
        land[idx(x, y)] = ellipse <= 1.0 + n * edge + sampleDetail(x, y) * 0.05;
      }
    }
  }

  // ---- 2) SÔNG / SUỐT / MẠNG NƯỚC ----
  const water = new Set<number>();
  for (let i = 0; i < TOTAL_CELLS; i += 1) if (!land[i]!) water.add(i);

  function riverPath(
    orientation: 'h' | 'v',
    widthCells: number,
    ampBase: number,
    phase: number,
    freq: number,
  ): Set<number> {
    const path = new Set<number>();
    const len = orientation === 'h' ? COLS + 2 : ROWS + 2;
    const mid = orientation === 'h' ? ROWS / 2 : COLS / 2;
    for (let t = -1; t <= len; t += 1) {
      const meander =
        Math.sin(phase + (t / len) * Math.PI * 2 * freq) * ampBase +
        Math.sin(phase * 1.7 + (t / len) * Math.PI * 2 * (freq * 2.3)) * ampBase * 0.45 +
        sampleTerrain(orientation === 'h' ? t : mid * 2, orientation === 'h' ? mid * 2 : t) * ampBase * 0.6;
      const main = clamp(Math.round(mid + meander), 1, (orientation === 'h' ? ROWS : COLS) - 2);
      for (let w = 0; w < widthCells; w += 1) {
        const x = orientation === 'h' ? t : main + w;
        const y = orientation === 'h' ? main + w : t;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        path.add(idx(x, y));
      }
    }
    return path;
  }

  const riverPhase = rand() * Math.PI * 2;
  const riverFreq = 0.7 + rand() * 0.9;
  const riverOrientation: 'h' | 'v' = rand() > 0.5 ? 'h' : 'v';

  if (group === 'mountain') {
    // 1 dòng sông/suối nhỏ uốn khúc (~5-8% bản đồ) + nhánh suối phụ
    const stream = riverPath(riverOrientation, 2, 3.2 + rand() * 2.4, riverPhase, riverFreq);
    for (const i of stream) water.add(i);
    {
      const trib = riverPath(riverOrientation === 'h' ? 'v' : 'h', 1, 2.4 + rand() * 1.6, riverPhase + 2.1, riverFreq + 0.4);
      let cut = 0;
      for (const i of trib) {
        if (rand() > 0.62) {
          water.add(i);
          cut += 1;
        }
        if (cut > 40) break;
      }
    }
  } else if (group === 'delta') {
    // Sông lớn chia cắt bản đồ thành 2-3 bờ + nhánh
    const main = riverPath(riverOrientation, 2, 4.2 + rand() * 2.6, riverPhase, riverFreq);
    for (const i of main) water.add(i);
    const branch = riverPath(riverOrientation === 'h' ? 'v' : 'h', 1, 3.2 + rand() * 2.0, riverPhase + 2.6, riverFreq + 0.3);
    let cut = 0;
    for (const i of branch) {
      if (rand() > 0.35) {
        water.add(i);
        cut += 1;
      }
      if (cut > 90) break;
    }
  } else if (group === 'riverine') {
    // Mạng sông rạch chằng chịt: trục chính + nhiều nhánh + kênh nhỏ
    const main = riverPath(riverOrientation, 2, 3.6 + rand() * 2.2, riverPhase, riverFreq);
    for (const i of main) water.add(i);
    const branches = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < branches; b += 1) {
      const branch = riverPath(rand() > 0.5 ? 'h' : 'v', 1, 2.6 + rand() * 2.6, riverPhase + b * 1.9 + rand(), riverFreq + b * 0.35);
      let cut = 0;
      for (const i of branch) {
        if (rand() > 0.30 + b * 0.06) {
          water.add(i);
          cut += 1;
        }
        if (cut > 34 + Math.floor(rand() * 20)) break;
      }
    }
  } else {
    // Ven biển: một số tỉnh có thêm sông nhỏ/lagune dẫn ra biển
    if (rand() > 0.4) {
      const river = riverPath(riverOrientation, 1, 2.6 + rand() * 2.0, riverPhase, riverFreq);
      let cut = 0;
      for (const i of river) {
        if (rand() > 0.5) {
          water.add(i);
          cut += 1;
        }
        if (cut > 40) break;
      }
    }
    if (rand() > 0.6) {
      // hồ/vịnh nhỏ trong lục địa
      const lx = 6 + rand() * (COLS - 12);
      const ly = 5 + rand() * (ROWS - 10);
      const lr = 1.6 + rand() * 1.8;
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          if (dist(x, y, lx, ly) < lr && sampleDetail(x, y) > -0.2) water.add(idx(x, y));
        }
      }
    }
  }

  // Cập nhật mặt đất sau khi carve nước
  for (const i of water) land[i] = false;

  let landCount = 0;
  for (let i = 0; i < TOTAL_CELLS; i += 1) if (land[i]!) landCount += 1;

  // Bảo đảm tối thiểu đất liền (safeguard — rất hiếm khi kích hoạt)
  const minLand =
    group === 'mountain'
      ? Math.floor(TOTAL_CELLS * 0.85)
      : group === 'delta' || group === 'riverine'
        ? Math.floor(TOTAL_CELLS * 0.86)
        : Math.floor(TOTAL_CELLS * 0.52);
  if (landCount < minLand) {
    const candidates: number[] = [];
    for (let i = 0; i < TOTAL_CELLS; i += 1) if (!land[i]!) candidates.push(i);
    const scores = candidates.map((i) => {
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      return dist(x, y, blobCx, blobCy);
    });
    for (const i of takeLowest(candidates, scores, minLand - landCount)) {
      land[i] = true;
      water.delete(i);
      landCount += 1;
    }
  }

  const landIndices: number[] = [];
  for (let i = 0; i < TOTAL_CELLS; i += 1) if (land[i]!) landIndices.push(i);

  // ---- 3) CBD ANCHOR (tâm đô thị) — ngẫu nhiên có kiểm soát theo nhóm ----
  const anchors: Pt[] = [];
  const anchorBudgets: number[] = [];
  const twoPoles = group !== 'mountain' && rand() < 0.42; // một số tỉnh có 2 cực phát triển

  function pickUrbanAnchor(): Pt {
    if (group === 'mountain') {
      // Thung lũng: chọn điểm đất có trường "đồi núi" thấp nhất trong các ứng viên
      let best: Pt | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let k = 0; k < 40; k += 1) {
        const x = 6 + Math.floor(rand() * (COLS - 12));
        const y = 4 + Math.floor(rand() * (ROWS - 8));
        if (!land[idx(x, y)]!) continue;
        const score = samplePark(x, y) + dist(x, y, blobCx, blobCy) / (COLS + ROWS);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
      return nearestLand(land, best?.x ?? blobCx, best?.y ?? blobCy);
    }
    if (group === 'coastal_east') {
      return nearestLand(land, COLS * (0.28 + rand() * 0.24), ROWS * (0.26 + rand() * 0.48));
    }
    if (group === 'coastal_west') {
      return nearestLand(land, COLS * (0.48 + rand() * 0.24), ROWS * (0.26 + rand() * 0.48));
    }
    if (group === 'riverine') {
      // Gần mạng sông: chọn 1 ô đất cạnh nước ngẫu nhiên
      const waterside = landIndices.filter((i) => {
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        return (
          water.has(idx(clamp(x - 1, 0, COLS - 1), y)) ||
          water.has(idx(clamp(x + 1, 0, COLS - 1), y)) ||
          water.has(idx(x, clamp(y - 1, 0, ROWS - 1))) ||
          water.has(idx(x, clamp(y + 1, 0, ROWS - 1)))
        );
      });
      if (waterside.length > 0) {
        const pick = waterside[Math.floor(rand() * waterside.length)]!;
        return { x: pick % COLS, y: Math.floor(pick / COLS) };
      }
      return nearestLand(land, blobCx, blobCy);
    }
    // delta: lệch quanh tâm khối đất
    return nearestLand(land, blobCx + (rand() - 0.5) * COLS * 0.3, blobCy + (rand() - 0.5) * ROWS * 0.3);
  }

  const primary = pickUrbanAnchor();
  anchors.push(primary);
  if (twoPoles) {
    // Cực thứ hai: đủ xa cực thứ nhất, trên đất liền
    const angle = rand() * Math.PI * 2;
    const dd = 11 + rand() * 7;
    const second = nearestLand(land, primary.x + Math.cos(angle) * dd, primary.y + Math.sin(angle) * dd);
    if (dist(second.x, second.y, primary.x, primary.y) >= 8) {
      anchors.push(second);
      anchorBudgets.push(0.55, 0.45);
    } else {
      anchorBudgets.push(1);
    }
  } else {
    anchorBudgets.push(1);
  }

  // ---- 4) TÂM CÁC CỤM KHÁC (công nghiệp, công viên, tự phát, cảng) ----
  // Công nghiệp: 1-2 cụm ở rìa, cách CBD đủ xa
  const indCenters: Pt[] = [];
  const indClusterCount = rand() < 0.55 ? 2 : 1;
  for (let k = 0; k < indClusterCount; k += 1) {
    const angle = rand() * Math.PI * 2;
    const dd = (0.30 + rand() * 0.22) * (COLS + ROWS) * 0.5;
    const cand = nearestLand(land, primary.x + Math.cos(angle) * dd, primary.y + Math.sin(angle) * dd);
    if (dist(cand.x, cand.y, primary.x, primary.y) >= 9 && !indCenters.some((c) => dist(c.x, c.y, cand.x, cand.y) < 8)) {
      indCenters.push(cand);
    }
  }
  if (indCenters.length === 0) indCenters.push(nearestLand(land, blobCx + COLS * 0.3, blobCy + ROWS * 0.3));

  // Công viên (phi miền núi): 2-3 mảng xanh rải
  const parkCenters: Pt[] = [];
  if (group !== 'mountain') {
    const pc = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < pc; k += 1) {
      parkCenters.push(nearestLand(land, 5 + rand() * (COLS - 10), 4 + rand() * (ROWS - 8)));
    }
  }

  // Ngoại ô/tự phát: 2-3 cụm vành đai ngoài
  const slumCenters: Pt[] = [];
  const sc = 2 + Math.floor(rand() * 2);
  for (let k = 0; k < sc; k += 1) {
    const angle = rand() * Math.PI * 2;
    const dd = (0.34 + rand() * 0.26) * (COLS + ROWS) * 0.5;
    slumCenters.push(nearestLand(land, primary.x + Math.cos(angle) * dd, primary.y + Math.sin(angle) * dd));
  }

  // Cảng: ven bờ biển (coastal) hoặc ven sông (riverine) — vị trí riêng theo tỉnh
  let portAnchor: Pt | null = null;
  if (isCoastal) {
    const sideSign = group === 'coastal_east' ? 1 : -1;
    const px = primary.x + sideSign * (5 + rand() * 8);
    portAnchor = nearestLand(land, clamp(px, 1, COLS - 2), ROWS * (0.2 + rand() * 0.6));
  } else if (group === 'riverine') {
    const waterside = landIndices.filter((i) => water.has(i));
    if (waterside.length > 0) {
      const nearIdx = landIndices[Math.floor(rand() * landIndices.length)]!;
      const nx = nearIdx % COLS;
      const ny = Math.floor(nearIdx / COLS);
      let best: Pt | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const i of waterside) {
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const d = dist(x, y, nx, ny);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
      portAnchor = best;
    }
  }

  // ---- 5) PHÂN BỔ VÙNG THEO TỈ LỆ MỤC TIÊU ----
  const targets = computeZoneTargets(group, rand);
  const counts = allocateZoneCounts(targets, landCount);

  const zones = new Array<ProvinceMapZone | null>(TOTAL_CELLS).fill(null);
  for (const i of water) zones[i] = 'water';

  const dTo = (i: number, p: Pt) => {
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    return dist(x, y, p.x, p.y);
  };
  const dToMin = (i: number, pts: Pt[]) => Math.min(...pts.map((p) => dTo(i, p)));

  // Danh sách ô chưa phân bổ; sau mỗi lượt sẽ lọc bỏ ô đã có vùng → giữ đúng tỉ lệ mục tiêu
  let open = landIndices.slice();

  function assign(zone: LandZone, picked: number[]): void {
    for (const i of picked) {
      if (zones[i] !== null) continue;
      zones[i] = zone;
    }
    open = open.filter((i) => zones[i] === null);
  }

  // 5a. CBD: các cực thương mại — Sort theo khoảng cách tới anchor + nhiễu → lõi hữu cơ
  for (let a = 0; a < anchors.length; a += 1) {
    const budget = Math.round(counts.commercial * anchorBudgets[a]!);
    const scores = open.map((i) => dTo(i, anchors[a]!) + sampleDetail(i % COLS, Math.floor(i / COLS)) * 2.6);
    assign('commercial', takeLowest(open, scores, budget));
  }

  // 5b. Hành chính/dịch vụ (civic): vành liền kề CBD
  {
    const ringR = Math.sqrt(counts.commercial / Math.PI) + 2.2;
    const scores = open.map((i) => {
      const d = dToMin(i, anchors);
      return Math.abs(d - ringR) * 1.0 + sampleTerrain(i % COLS, Math.floor(i / COLS)) * 2.0;
    });
    assign('civic', takeLowest(open, scores, counts.civic));
  }

  // 5c. Cảng & ven biển: ô đất liền kề nước (biển/sông), quanh điểm neo cảng
  if (counts.port > 0) {
    const waterside = open.filter((i) => {
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      return (
        water.has(idx(clamp(x - 1, 0, COLS - 1), y)) ||
        water.has(idx(clamp(x + 1, 0, COLS - 1), y)) ||
        water.has(idx(x, clamp(y - 1, 0, ROWS - 1))) ||
        water.has(idx(x, clamp(y + 1, 0, ROWS - 1)))
      );
    });
    const anchor = portAnchor ?? nearestLand(land, COLS / 2, ROWS / 2);
    const pool = waterside.length >= counts.port ? waterside : open;
    const scores = pool.map((i) => dTo(i, anchor) + sampleDetail(i % COLS, Math.floor(i / COLS)) * 2.2);
    assign('port', takeLowest(pool, scores, counts.port));
  }

  // 5d. Công nghiệp: cụm quanh các tâm công nghiệp
  {
    const scores = open.map((i) => dToMin(i, indCenters) + sampleTerrain(i % COLS, Math.floor(i / COLS)) * 2.8);
    assign('industrial', takeLowest(open, scores, counts.industrial));
  }

  // 5e. Công viên/đồi núi:
  //  - mountain: theo trường đồi núi (dải núi uốn lượn) + ưu tiên xa CBD (thung lũng đô thị ở giữa)
  //  - nhóm khác: mảng xanh quanh các tâm công viên + ven sông
  {
    const scores = open.map((i) => {
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      if (group === 'mountain') {
        return -samplePark(x, y) * 5.5 + dToMin(i, anchors) * 0.28 + sampleDetail(x, y) * 1.2;
      }
      return dToMin(i, parkCenters) + samplePark(x, y) * 2.4;
    });
    assign('park', takeLowest(open, scores, counts.park));
  }

  // 5f. Ngoại ô/tự phát (suburban): vành đai chuyển tiếp quanh cụm tự phát
  {
    const scores = open.map((i) => dToMin(i, slumCenters) + sampleDetail(i % COLS, Math.floor(i / COLS)) * 2.4);
    assign('slum', takeLowest(open, scores, counts.slum));
  }

  // 5g. Dân cư: toàn bộ phần còn lại (bao quanh CBD/hành chính) — luôn đủ 25-30%
  for (const i of open) {
    if (zones[i] === null) zones[i] = 'residential';
  }

  const nodes: ProvinceMapNode[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const zone = zones[idx(x, y)] ?? 'residential';
      nodes.push({ x, y, zone, name: `Ô [${x},${y}] ${name}` });
    }
  }

  // ---- 6) ĐƯỜNG: lưới trục theo tâm đô thị + vành đai CBD + cầu qua sông/biển ----
  const zoneAt = (x: number, y: number) => zones[idx(clamp(x, 0, COLS - 1), clamp(y, 0, ROWS - 1))];
  const roadMap = new Map<string, ProvinceMapRoad['roadType']>();

  function layHorizontal(yLine: number, baseType: ProvinceMapRoad['roadType']): void {
    if (yLine < 0 || yLine >= ROWS) return;
    for (let x = 0; x < COLS; x += 1) {
      const z = zoneAt(x, yLine);
      const key = `${x}-${yLine}`;
      if (z === 'water') {
        // chỉ đặt cầu khi có đất ở hai đầu đoạn (tránh cầu "mù")
        if (zoneAt(x - 1, yLine) !== 'water' || zoneAt(x + 1, yLine) !== 'water') {
          roadMap.set(key, 'bridge');
        }
      } else if (z !== null) {
        roadMap.set(key, baseType);
      }
    }
  }
  function layVertical(xLine: number, baseType: ProvinceMapRoad['roadType']): void {
    if (xLine < 0 || xLine >= COLS) return;
    for (let y = 0; y < ROWS; y += 1) {
      const z = zoneAt(xLine, y);
      const key = `${xLine}-${y}`;
      if (z === 'water') {
        if (zoneAt(xLine, y - 1) !== 'water' || zoneAt(xLine, y + 1) !== 'water') {
          roadMap.set(key, 'bridge');
        }
      } else if (z !== null) {
        roadMap.set(key, baseType);
      }
    }
  }

  // Trục đường chính đi qua các cực đô thị (highway), thêm trục phụ (arterial) riêng theo tỉnh
  for (const a of anchors) {
    layHorizontal(Math.round(a.y), 'highway');
    layVertical(Math.round(a.x), 'highway');
  }
  const extraH = [
    clamp(Math.round(rand() * ROWS), 2, ROWS - 3),
    clamp(Math.round(rand() * ROWS), 2, ROWS - 3),
  ];
  const extraV = [
    clamp(Math.round(rand() * COLS), 2, COLS - 3),
    clamp(Math.round(rand() * COLS), 2, COLS - 3),
  ];
  for (const yLine of extraH) layHorizontal(yLine, 'arterial');
  for (const xLine of extraV) layVertical(xLine, 'arterial');

  // Vành đai CBD (arterial) quanh cực chính
  {
    const ringR = Math.sqrt(counts.commercial / Math.PI) + 3;
    const steps = Math.max(24, Math.round(ringR * 8));
    for (let s = 0; s < steps; s += 1) {
      const ang = (s / steps) * Math.PI * 2;
      const x = Math.round(primary.x + Math.cos(ang) * ringR);
      const y = Math.round(primary.y + Math.sin(ang) * ringR * 0.85);
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      if (zoneAt(x, y) === 'water' || zoneAt(x, y) === null) continue;
      const key = `${x}-${y}`;
      if (!roadMap.has(key)) roadMap.set(key, 'arterial');
    }
  }

  // Đường local lưới dày nhẹ quanh khu dân cư (vài trục ngắn riêng theo tỉnh)
  const localH = clamp(Math.round(primary.y + (rand() - 0.5) * 10), 2, ROWS - 3);
  const localV = clamp(Math.round(primary.x + (rand() - 0.5) * 12), 2, COLS - 3);
  layHorizontal(localH, 'local');
  layVertical(localV, 'local');

  const roads: ProvinceMapRoad[] = [];
  for (const [key, roadType] of roadMap) {
    const [x, y] = key.split('-').map(Number);
    roads.push({ x: x!, y: y!, roadType });
  }
  roads.sort((a, b) => a.y - b.y || a.x - b.x);

  return { code, name, cols: COLS, rows: ROWS, nodes, roads };
}

// ---------------------------------------------------------------------------
// Thống kê (dùng cho kiểm tra tỉ lệ & seeder)
// ---------------------------------------------------------------------------

export interface ProvinceMapStats {
  total: number;
  land: number;
  water: number;
  /** Số ô theo từng vùng. */
  counts: Record<ProvinceMapZone, number>;
  /** Tỉ lệ trên phần đất liền (0-1), water = tỉ lệ trên tổng bản đồ. */
  landRatios: Record<LandZone, number>;
  waterRatio: number;
}

export function provinceMapZoneStats(map: ProvinceMap): ProvinceMapStats {
  const counts = {
    residential: 0,
    commercial: 0,
    industrial: 0,
    civic: 0,
    port: 0,
    slum: 0,
    water: 0,
    park: 0,
  } as Record<ProvinceMapZone, number>;
  for (const n of map.nodes) counts[n.zone] += 1;
  const total = map.nodes.length;
  const land = total - counts.water;
  const landRatios = {} as Record<LandZone, number>;
  for (const z of LAND_ZONES) landRatios[z] = land > 0 ? counts[z] / land : 0;
  return {
    total,
    land,
    water: counts.water,
    counts,
    landRatios,
    waterRatio: total > 0 ? counts.water / total : 0,
  };
}
