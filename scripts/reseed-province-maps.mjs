#!/usr/bin/env node
/**
 * RESEED PROVINCE MAPS — sinh lại ma trận bản đồ 33 tỉnh/thành (giữ nguyên Hà Nội 001).
 *
 * Thuật toán: packages/domain/src/provinceMap.ts (v3 — seeded procedural, Perlin fBm đa octave,
 * nhóm hình thái núi/đồng bằng/ven biển/sông nước, CBD anchor riêng, weighted zoning 7 vùng).
 *
 * Việc script làm:
 *  1. Sinh bản đồ 33 tỉnh từ @efls/domain (build trước khi chạy: pnpm --filter @efls/domain build).
 *  2. Kiểm tra tỉ lệ 7 vùng trên đất liền + nước (cảnh báo nếu lệch cửa sổ chuẩn).
 *  3. Sinh giá đất nền theo ma trận vùng (mặc định admin) × hệ số tỉnh (deterministic).
 *  4. Ghi SQL upsert `map_province_land_prices` + bump `map_province_meta.version`
 *     (--apply để chạy thẳng vào DB qua docker exec psql; không chạm dữ liệu Hà Nội/map_nodes).
 *  5. Xuất preview trực quan: scripts/out/province-maps-preview.html (màu theo vùng)
 *     + báo cáo xác minh scripts/out/province-map-reseed-report.md.
 *
 * Chạy: node scripts/reseed-province-maps.mjs [--apply]
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'out');
const DOMAIN_DIST = join(ROOT, 'packages', 'domain', 'dist', 'index.js');

if (!existsSync(DOMAIN_DIST)) {
  console.error('✗ Chưa build @efls/domain. Chạy: pnpm --filter @efls/domain build');
  process.exit(1);
}

const { generateProvinceMap, provinceMapZoneStats, PROVINCE_MAP_GROUPS } = await import(
  pathToFileURL(DOMAIN_DIST).href
);

const APPLY = process.argv.includes('--apply');
mkdirSync(OUT_DIR, { recursive: true });

// Ma trận giá mặc định theo loại đất (khớp mặc định trang quản trị MapEditorPage, VNĐ/ô)
const ZONE_BASE_PRICE = {
  commercial: 120_000_000, // Trung tâm CBD / Thương mại
  residential: 45_000_000, // Đất dân cư
  industrial: 25_000_000, // Công nghiệp
  civic: 80_000_000, // Hành chính / Ngoại ô
  port: 60_000_000, // Cảng & ven biển
  slum: 12_000_000, // Ngoại ô / Tự phát
  park: 0, // Công viên / Đồi núi — đất công cộng, không bán
  water: 0,
};

// Hệ số giá riêng theo tỉnh (deterministic theo mã, dao động 0.85–1.25)
function provincePriceMultiplier(code) {
  let h = 2166136261;
  for (const ch of `price:${code}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) / 4294967296;
  return Number((0.85 + n * 0.4).toFixed(3));
}

const GROUP_LABEL = {
  mountain: 'Miền núi & cao nguyên',
  delta: 'Đồng bằng nội địa',
  coastal_east: 'Ven biển (Đông/ĐN)',
  coastal_west: 'Ven biển (Tây/TN)',
  riverine: 'Sông nước',
};

const ZONE_COLORS = {
  residential: { bg: '#FEF3C7', border: '#FDE68A', label: 'Dân cư' },
  commercial: { bg: '#E0E7FF', border: '#C7D2FE', label: 'CBD/Thương mại' },
  industrial: { bg: '#F3F4F6', border: '#E5E7EB', label: 'Công nghiệp' },
  civic: { bg: '#DCFCE7', border: '#BBF7D0', label: 'Hành chính/Dịch vụ' },
  port: { bg: '#BFDBFE', border: '#93C5FD', label: 'Cảng & ven biển' },
  slum: { bg: '#FECDD3', border: '#FDA4AF', label: 'Ngoại ô/Tự phát' },
  park: { bg: '#A7F3D0', border: '#6EE7B7', label: 'Công viên/Đồi núi' },
  water: { bg: '#7DD3FC', border: '#38BDF8', label: 'Nước' },
};

function fmtPct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

// --- 1) Sinh toàn bộ bản đồ ---
const codes = Object.keys(PROVINCE_MAP_GROUPS).sort();
const results = [];
for (const code of codes) {
  const map = generateProvinceMap(code);
  const stats = provinceMapZoneStats(map);
  const mult = provincePriceMultiplier(code);
  results.push({ code, map, stats, mult });
}

// --- 2) Kiểm tra tỉ lệ (cửa sổ chuẩn + dung sai) ---
const warnings = [];
for (const { code, stats } of results) {
  const g = PROVINCE_MAP_GROUPS[code];
  const r = stats.landRatios;
  const win = (z, lo, hi) => {
    if (r[z] < lo - 0.03 || r[z] > hi + 0.03) {
      warnings.push(`${code} ${z}: ${fmtPct(r[z])} ngoài [${lo * 100}%, ${hi * 100}%]`);
    }
  };
  win('commercial', 0.1, 0.15);
  win('residential', 0.23, 0.3);
  win('civic', 0.09, 0.15);
  win('industrial', 0.14, 0.2);
  win('slum', 0.13, 0.2);
  win('park', 0.08, 0.15);
  if (g === 'coastal_east' || g === 'coastal_west') win('port', 0.14, 0.24);
  if (g === 'riverine') win('port', 0.06, 0.15);
  if (g === 'mountain' && (stats.waterRatio < 0.03 || stats.waterRatio > 0.1)) {
    warnings.push(`${code} nước (sông suối): ${fmtPct(stats.waterRatio)} ngoài 3-10%`);
  }
  if (g === 'delta' && stats.land / stats.total < 0.86) {
    warnings.push(`${code} đất liền chỉ ${fmtPct(stats.land / stats.total)} (<86%)`);
  }
}

// --- 3) Sinh SQL ---
const sqlChunks = [];
sqlChunks.push(`-- RESEED PROVINCE MAPS v3 — ${new Date().toISOString()}`);
sqlChunks.push('-- Cập nhật giá đất nền 33 tỉnh theo ma trận vùng (giữ nguyên Hà Nội 001 / map_nodes).');
sqlChunks.push('BEGIN;');
const codeList = codes.map((c) => `'${c}'`).join(', ');
sqlChunks.push(
  `INSERT INTO map_province_meta (province_code, version) VALUES ${codes
    .map((c) => `('${c}', 1)`)
    .join(',')} ON CONFLICT (province_code) DO NOTHING;`,
);
sqlChunks.push(
  `UPDATE map_province_meta SET version = version + 1, updated_at = now() WHERE province_code IN (${codeList});`,
);

const priceRows = [];
for (const { code, map, mult } of results) {
  for (const n of map.nodes) {
    const base = ZONE_BASE_PRICE[n.zone] ?? 0;
    const price = base > 0 ? Math.round((base * mult) / 1000) * 1000 : 0;
    if (price === 0 && n.zone !== 'water') continue; // park/water: không cần row (mặc định 0)
    priceRows.push(`('${code}',${n.x},${n.y},${price})`);
  }
}
const CHUNK = 800;
for (let i = 0; i < priceRows.length; i += CHUNK) {
  const chunk = priceRows.slice(i, i + CHUNK);
  sqlChunks.push(
    `INSERT INTO map_province_land_prices (province_code, x, y, land_price_minor) VALUES\n  ${chunk.join(',\n  ')}\nON CONFLICT (province_code, x, y) DO UPDATE SET land_price_minor = EXCLUDED.land_price_minor, updated_at = now();`,
  );
}
sqlChunks.push('COMMIT;');
const sql = sqlChunks.join('\n\n') + '\n';
const sqlPath = join(OUT_DIR, 'reseed-province-maps.sql');
writeFileSync(sqlPath, sql, 'utf8');

// --- 4) Preview HTML (kiểm tra trực quan) ---
function renderGrid(map) {
  let cells = '';
  for (const n of map.nodes) {
    const c = ZONE_COLORS[n.zone];
    const road = map.roads.find((r) => r.x === n.x && r.y === n.y);
    const isBridge = road?.roadType === 'bridge';
    const hasRoad = !!road;
    const style = `background:${c.bg};${hasRoad ? 'box-shadow:inset 0 0 0 1px #78716c;' : ''}${isBridge ? 'outline:1px solid #1d4ed8;outline-offset:-1px;' : ''}`;
    cells += `<div class="cell" style="${style}" title="(${n.x},${n.y}) ${c.label}${hasRoad ? ' · ' + road.roadType : ''}"></div>`;
  }
  return cells;
}

const legend = Object.entries(ZONE_COLORS)
  .map(
    ([z, c]) =>
      `<span class="lg"><span class="sw" style="background:${c.bg}"></span>${c.label}</span>`,
  )
  .join('');

const sections = results
  .map(({ code, map, stats }) => {
    const r = stats.landRatios;
    const ratioLine = [
      `CBD ${fmtPct(r.commercial)}`,
      `Dân cư ${fmtPct(r.residential)}`,
      `Hành chính ${fmtPct(r.civic)}`,
      `CN ${fmtPct(r.industrial)}`,
      `Ngoại ô ${fmtPct(r.slum)}`,
      `Xanh/núi ${fmtPct(r.park)}`,
      `Cảng ${fmtPct(r.port)}`,
      `Nước ${fmtPct(stats.waterRatio)}`,
    ].join(' · ');
    return `<section><h2>${map.name} <small>(${code} · ${GROUP_LABEL[PROVINCE_MAP_GROUPS[code]]})</small></h2><p class="ratios">${ratioLine}</p><div class="grid">${renderGrid(map)}</div></section>`;
  })
  .join('\n');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Preview bản đồ 33 tỉnh (v3 procedural)</title><style>
body{font-family:system-ui,Segoe UI,Arial;background:#f8fafc;margin:24px;color:#0f172a}
h1{font-size:20px} h2{font-size:14px;margin:18px 0 4px} small{color:#64748b;font-weight:400}
.ratios{font-size:11px;color:#475569;margin:2px 0 6px}
.grid{display:grid;grid-template-columns:repeat(${50},12px);grid-auto-rows:12px;gap:1px;width:max-content;border:1px solid #cbd5e1;padding:3px;background:#fff}
.cell{width:12px;height:12px}
.lg{display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:12px}
.sw{display:inline-block;width:12px;height:12px;border:1px solid #94a3b8}
header{margin-bottom:12px}
</style></head><body><h1>Preview ma trận bản đồ 33 tỉnh/thành — v3 (seeded procedural, 50×38)</h1>
<header><div>${legend}</div><p style="font-size:12px;color:#64748b">Ô có viền xám đậm = đường (cầu = viền xanh đậm). Di chuột xem tọa độ/loại.</p></header>
${sections}</body></html>`;
const htmlPath = join(OUT_DIR, 'province-maps-preview.html');
writeFileSync(htmlPath, html, 'utf8');

// --- 5) Báo cáo MD ---
function asciiRender(map) {
  const sym = { residential: '.', commercial: 'C', industrial: 'I', civic: 'A', port: 'P', slum: 's', park: '^', water: '~' };
  let out = '    ' + Array.from({ length: 50 }, (_, i) => (i % 10 === 0 ? '|' : ' ')).join('') + '\n';
  for (let y = 0; y < 38; y += 1) {
    out += `${String(y).padStart(2)}  `;
    for (let x = 0; x < 50; x += 1) {
      const n = map.nodes[y * 50 + x];
      out += sym[n.zone] ?? '?';
    }
    out += '\n';
  }
  return out;
}

const samples = ['015', '024', '031', '096', '092']; // Lào Cai (núi), Bắc Ninh (đồng bằng), Hải Phòng (biển Đông), Cà Mau (biển Tây), Cần Thơ (sông nước)
const mdLines = [];
mdLines.push(`# Báo cáo reseed ma trận bản đồ 33 tỉnh (v3 — ${new Date().toISOString().slice(0, 10)})`);
mdLines.push('');
mdLines.push('- Thuật toán: seeded procedural (Perlin fBm đa octave + offset/xoay riêng theo mã tỉnh), nhóm hình thái thực tế, CBD anchor riêng, weighted zoning 7 vùng.');
mdLines.push('- Hà Nội (001): **không thay đổi** (bản đồ lõi lưu DB `map_nodes`).');
mdLines.push(`- SQL: \`scripts/out/reseed-province-maps.sql\` (${priceRows.length} ô giá đất) · Preview: \`scripts/out/province-maps-preview.html\`.`);
mdLines.push('');
mdLines.push('| Mã | Tỉnh/TP | Nhóm hình thái | Đất liền | Nước | CBD | Dân cư | Hành chính | CN | Ngoại ô | Xanh/Núi | Cảng | Hệ số giá |');
mdLines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { code, map, stats, mult } of results) {
  const r = stats.landRatios;
  mdLines.push(
    `| ${code} | ${map.name} | ${GROUP_LABEL[PROVINCE_MAP_GROUPS[code]]} | ${fmtPct(stats.land / stats.total)} | ${fmtPct(stats.waterRatio)} | ${fmtPct(r.commercial)} | ${fmtPct(r.residential)} | ${fmtPct(r.civic)} | ${fmtPct(r.industrial)} | ${fmtPct(r.slum)} | ${fmtPct(r.park)} | ${fmtPct(r.port)} | ×${mult} |`,
  );
}
mdLines.push('');
for (const code of samples) {
  const { map } = results.find((x) => x.code === code);
  mdLines.push(`## Mẫu trực quan (ASCII) — ${map.name} (${code})`);
  mdLines.push('```');
  mdLines.push(asciiRender(map));
  mdLines.push('```');
  mdLines.push('');
}
if (warnings.length > 0) {
  mdLines.push('## ⚠️ Cảnh báo tỉ lệ');
  warnings.forEach((w) => mdLines.push(`- ${w}`));
} else {
  mdLines.push('## ✓ Tỉ lệ phân khu');
  mdLines.push('- Toàn bộ 33 tỉnh nằm trong cửa sổ chuẩn (CBD 10–15%, dân cư 25–30%, hành chính 10–15%, CN 15–20%, ngoại ô 15–20%, xanh/núi 10–15%, cảng 15–25% tỉnh biển / cảng sông nhỏ, sông nội địa 5–8%).');
}
const mdPath = join(OUT_DIR, 'province-map-reseed-report.md');
writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

// --- 6) Áp dụng DB (tuỳ chọn) ---
if (APPLY) {
  console.log('→ Áp dụng SQL vào efls-postgres ...');
  const res = spawnSync(
    'docker',
    ['exec', '-i', 'efls-postgres', 'psql', '-U', 'efls', '-d', 'efls', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', shell: true },
  );
  if (res.status !== 0) {
    console.error('✗ psql thất bại:');
    console.error(res.stderr || res.stdout);
    process.exit(1);
  }
  console.log('✓ Đã áp dụng (transaction COMMIT).');
} else {
  console.log('(chưa --apply: chỉ ghi file SQL, không đụng DB)');
}

// --- Tổng kết console ---
console.log('\n===== TỔNG KẾT =====');
console.log(`Số tỉnh đã sinh: ${results.length}`);
for (const { code, map, stats } of results) {
  const r = stats.landRatios;
  console.log(
    `${code} ${map.name.padEnd(24)} ${GROUP_LABEL[PROVINCE_MAP_GROUPS[code]].padEnd(18)} đất ${fmtPct(stats.land / stats.total).padStart(6)} | CBD ${fmtPct(r.commercial).padStart(5)} | Dân ${fmtPct(r.residential).padStart(5)} | HC ${fmtPct(r.civic).padStart(5)} | CN ${fmtPct(r.industrial).padStart(5)} | Ngoại ${fmtPct(r.slum).padStart(5)} | Xanh ${fmtPct(r.park).padStart(5)} | Cảng ${fmtPct(r.port).padStart(5)} | Nước ${fmtPct(stats.waterRatio).padStart(5)}`,
  );
}
if (warnings.length > 0) {
  console.log(`\n⚠️ ${warnings.length} cảnh báo tỉ lệ:`);
  warnings.forEach((w) => console.log('  - ' + w));
}
console.log(`\nSQL: ${sqlPath}\nHTML preview: ${htmlPath}\nBáo cáo: ${mdPath}`);
