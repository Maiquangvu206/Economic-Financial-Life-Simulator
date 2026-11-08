#!/usr/bin/env node
/**
 * Raster hoá địa giới GADM (63 tỉnh cũ) thành mặt nạ 32x20 cho 34 tỉnh mới.
 * Đọc scripts/gadm41_VNM_1.json (GADM 4.1, KHÔNG commit vào git — tải lại
 * từ https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_VNM_1.json),
 * ghi packages/domain/src/provinceShapes.ts.
 *
 * Chạy: node scripts/gen-province-shapes.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'scripts', 'gadm41_VNM_1.json'), 'utf8');
const geo = JSON.parse(src);

// Tên GADM cũ (có dấu, không dấu cách) -> mã tỉnh mới (34 tỉnh 2025)
const NAME_TO_CODE = {
  HàNội: '001',
  HảiPhòng: '031',
  QuảngNinh: '022',
  HảiDương: '033',
  HưngYên: '033',
  BắcNinh: '024',
  BắcGiang: '024',
  LạngSơn: '020',
  CaoBằng: '004',
  HàGiang: '008',
  TuyênQuang: '008',
  LàoCai: '015',
  LaiChâu: '012',
  ĐiệnBiên: '011',
  SơnLa: '014',
  TháiNguyên: '019',
  BắcKạn: '019',
  PhúThọ: '025',
  HoàBình: '025',
  VĩnhPhúc: '025',
  ThanhHóa: '038',
  NghệAn: '040',
  HàTĩnh: '042',
  QuảngBình: '044',
  QuảngTrị: '044',
  ThừaThiênHuế: '046',
  ĐàNẵng: '048',
  QuảngNam: '048',
  QuảngNgãi: '051',
  KonTum: '051',
  GiaLai: '052',
  BìnhĐịnh: '052',
  ĐắkLắk: '066',
  PhúYên: '066',
  ĐắkNông: '068',
  KhánhHòa: '056',
  NinhThuận: '056',
  LâmĐồng: '068',
  BìnhThuận: '068',
  ĐồngNai: '075',
  HồChíMinh: '079',
  BìnhDương: '079',
  'BàRịa-VũngTàu': '079',
  TâyNinh: '080',
  LongAn: '080',
  ĐồngTháp: '082',
  TiềnGiang: '082',
  VĩnhLong: '086',
  BếnTre: '086',
  TràVinh: '086',
  AnGiang: '091',
  KiênGiang: '091',
  CầnThơ: '092',
  HậuGiang: '092',
  SócTrăng: '092',
  CàMau: '096',
  BạcLiêu: '096',
  NinhBình: '037',
  HàNam: '037',
  NamĐịnh: '037',
  TháiBình: '033',
  YênBái: '015',
  BìnhPhước: '080',
};

const NEW_CODES = [
  '001',
  '004',
  '008',
  '011',
  '012',
  '014',
  '015',
  '019',
  '020',
  '022',
  '024',
  '025',
  '031',
  '033',
  '037',
  '038',
  '040',
  '042',
  '044',
  '046',
  '048',
  '051',
  '052',
  '056',
  '066',
  '068',
  '075',
  '079',
  '080',
  '082',
  '086',
  '091',
  '092',
  '096',
];

const COLS = 32;
const ROWS = 20;

/** Gom polygon theo mã mới. */
const byCode = new Map();
for (const code of NEW_CODES) byCode.set(code, []);
let skipped = [];
for (const feature of geo.features ?? []) {
  const name = feature?.properties?.NAME_1;
  const code = NAME_TO_CODE[name];
  if (!code) {
    skipped.push(name);
    continue;
  }
  byCode.get(code).push(feature.geometry);
}
console.log('Skipped names:', skipped);

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, y, poly) {
  // poly: [outerRing, ...holeRings]
  if (!pointInRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k += 1) {
    if (pointInRing(x, y, poly[k])) return false;
  }
  return true;
}

function pointInGeometry(x, y, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInPolygon(x, y, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInPolygon(x, y, poly));
  }
  return false;
}

const shapes = {};
for (const code of NEW_CODES) {
  const geoms = byCode.get(code) ?? [];
  // BBox của tỉnh (hợp các vùng sáp nhập)
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const g of geoms) {
    const walk = (coords) => {
      for (const p of coords) {
        if (typeof p[0] === 'number') {
          minLon = Math.min(minLon, p[0]);
          maxLon = Math.max(maxLon, p[0]);
          minLat = Math.min(minLat, p[1]);
          maxLat = Math.max(maxLat, p[1]);
        } else {
          walk(p);
        }
      }
    };
    walk(g.coordinates);
  }
  let bits = '';
  if (isFinite(minLon)) {
    const padLon = (maxLon - minLon) * 0.06 + 0.05;
    const padLat = (maxLat - minLat) * 0.06 + 0.05;
    const w = maxLon - minLon + padLon * 2;
    const h = maxLat - minLat + padLat * 2;
    // Tỉ lệ giữ nguyên: ô vuông theo độ
    const cell = Math.max(w / COLS, h / ROWS);
    const cx = (minLon + maxLon) / 2;
    const cy = (minLat + maxLat) / 2;
    for (let row = 0; row < ROWS; row += 1) {
      const lat = cy + (ROWS / 2 - row - 0.5) * cell;
      for (let col = 0; col < COLS; col += 1) {
        const lon = cx + (col + 0.5 - COLS / 2) * cell;
        const hit = geoms.some((g) => pointInGeometry(lon, lat, g));
        bits += hit ? '1' : '0';
      }
    }
  } else {
    bits = '0'.repeat(COLS * ROWS);
  }
  shapes[code] = bits;
  const land = [...bits].filter((b) => b === '1').length;
  console.log(code, `land=${land}/${COLS * ROWS}`);
}

// Sơn lại nước: nếu tỉnh không có điểm nào (lỗi map), fallback 1
for (const code of NEW_CODES) {
  if (!shapes[code] || !shapes[code].includes('1')) {
    shapes[code] = '0'.repeat(COLS * ROWS);
  }
}

const lines = [];
for (const code of NEW_CODES) {
  lines.push(`  '${code}': '${shapes[code]}',`);
}

const out = `/**
 * Mặt nạ địa giới thật 34 tỉnh/thành (raster 32x20 từ GADM 4.1, gộp cũ -> mới).
 * '1' = đất của tỉnh, '0' = ngoài tỉnh (nước). Sinh bởi scripts/gen-province-shapes.mjs.
 */
export const PROVINCE_SHAPES: Record<string, string> = {
${lines.join('\n')}
};

export const PROVINCE_SHAPE_COLS = ${COLS};
export const PROVINCE_SHAPE_ROWS = ${ROWS};

/** Đổi chuỗi mặt nạ thành lưới boolean 32x20 (true = thuộc về tỉnh). */
export function provinceShapeGrid(code: string): boolean[] | null {
  const bits = PROVINCE_SHAPES[code];
  if (!bits || bits.length !== ${COLS} * ${ROWS}) return null;
  return [...bits].map((b) => b === '1');
}
`;

writeFileSync(join(root, 'packages', 'domain', 'src', 'provinceShapes.ts'), out);
console.log('Wrote packages/domain/src/provinceShapes.ts');
