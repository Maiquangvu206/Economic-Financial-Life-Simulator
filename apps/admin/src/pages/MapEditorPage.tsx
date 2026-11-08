import { PageHeader } from '@efls/ui';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import { MapCanvas2D } from '../game/map/MapCanvas2D';
import type { MapDto, ProvinceDto, PutMapResponse } from '@efls/contracts';
import type { MapData } from '../game/map/MapData';

interface ApiProblem {
  status?: number;
  message?: string;
  title?: string;
}

function errorMessage(caught: unknown): { status?: number; message: string } {
  if (caught && typeof caught === 'object') {
    const e = caught as ApiProblem;
    return {
      status: e.status,
      message: e.message ?? e.title ?? String(caught),
    };
  }
  return { message: String(caught ?? 'lỗi không xác định') };
}

type PriceMode = 'single' | 'radius';

/** Các loại đất (zone) trong ma trận giá gốc: mốc giá khởi điểm cho đấu giá AI GM. */
const ZONE_PRICE_ROWS: Array<{ id: string; label: string }> = [
  { id: 'commercial', label: 'Trung tâm CBD / Thương mại' },
  { id: 'residential', label: 'Đất dân cư' },
  { id: 'industrial', label: 'Công nghiệp' },
  { id: 'civic', label: 'Hành chính / Ngoại ô' },
  { id: 'port', label: 'Cảng & ven biển' },
  { id: 'slum', label: 'Ngoại ô / Tự phát' },
  { id: 'park', label: 'Công viên / Đồi núi' },
];

/**
 * Bảng quản trị giá đất nền (Land Price Setting).
 * Admin chọn tỉnh + ô/tọa độ (hoặc bán kính) + nhập đơn giá đất gốc (base_land_price),
 * rồi lưu trực tiếp vào map_nodes.land_price_minor qua PUT /api/v1/map.
 * Người chơi click ô đất trên client sẽ thấy đúng mức giá này khi mua đất.
 */
export function MapEditorPage() {
  const [provinces, setProvinces] = useState<ProvinceDto[]>([]);
  const [provinceCode, setProvinceCode] = useState('001');
  const [map, setMap] = useState<MapDto | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const [mode, setMode] = useState<PriceMode>('single');
  const [xInput, setXInput] = useState('0');
  const [yInput, setYInput] = useState('0');
  const [radiusInput, setRadiusInput] = useState('2');
  const [basePriceInput, setBasePriceInput] = useState('50000000');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Danh sách 34 tỉnh/thành cho dropdown.
  useEffect(() => {
    adminRequest<ProvinceDto[]>('/api/v1/characters/provinces')
      .then(setProvinces)
      .catch(() => setProvinces([]));
  }, []);

  async function loadMap(code: string = provinceCode) {
    setLoading(true);
    setError(null);
    try {
      const data = await adminRequest<MapDto>(
        code === '001' ? '/api/v1/map' : `/api/v1/map?province=${code}`,
      );
      setMap(data);
      const next: Record<string, number> = {};
      for (const node of data.nodes) {
        next[`${node.x}-${node.y}`] = node.landPriceMinor;
      }
      setPrices(next);
      setNotice(
        code === '001'
          ? `Đã tải bảng giá đất (${data.nodes.length} ô, phiên bản ${data.meta.version}).`
          : `Đã tải bản đồ ${data.provinceName ?? code} (sinh động, ${data.nodes.length} ô) — chỉ xem, chưa lưu được giá.`,
      );
    } catch (caught) {
      setError(`Không tải được bản đồ: ${errorMessage(caught).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMap(provinceCode);
  }, [provinceCode]);

  const x = Math.max(0, Number(xInput) || 0);
  const y = Math.max(0, Number(yInput) || 0);
  const radius = Math.max(0, Math.min(20, Number(radiusInput) || 0));
  const basePrice = Math.max(0, Math.floor(Number(basePriceInput) || 0));

  /** Các ô bị ảnh hưởng bởi chế độ hiện tại (ô đơn hoặc bán kính). */
  const affectedKeys = useMemo(() => {
    if (!map) return [];
    const keys: string[] = [];
    for (const node of map.nodes) {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      if (mode === 'single' ? dist === 0 : dist <= radius) {
        keys.push(`${node.x}-${node.y}`);
      }
    }
    return keys;
  }, [map, mode, x, y, radius]);

  function handleCellClick(cx: number, cy: number) {
    setXInput(String(cx));
    setYInput(String(cy));
    setNotice(null);
  }

  /** Bản đồ 3D giống hệt client: đảo tròn R=100 + lưới ô 100×100 cắt tròn, riêng từng tỉnh. */
  const mapData: MapData | undefined = useMemo(() => {
    if (!map) return undefined;
    return {
      nodes: map.nodes,
      roads: map.roads,
      meta: map.meta,
      provinceCode: map.provinceCode ?? provinceCode,
      provinceName: map.provinceName ?? provinces.find((p) => p.code === provinceCode)?.name,
      properties: [],
    };
  }, [map, provinceCode, provinces]);

  const [zonePrices, setZonePrices] = useState<Record<string, string>>({
    commercial: '120000000',
    residential: '45000000',
    industrial: '25000000',
    civic: '80000000',
    port: '60000000',
    slum: '12000000',
    park: '0',
  });

  /** Áp giá đất gốc theo loại đất: gán cho mọi ô thuộc zone đó (rồi Lưu CSDL). */
  function handleApplyZonePrices() {
    if (!map) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const node of map.nodes) {
        const zonePrice = Math.max(0, Math.floor(Number(zonePrices[node.zoneType] ?? '0') || 0));
        next[`${node.x}-${node.y}`] = zonePrice;
      }
      return next;
    });
    setNotice(
      `Đã áp ma trận giá đất theo loại đất cho ${map.nodes.length} ô. Nhấn "Lưu CSDL" để AI GM dùng làm giá khởi điểm đấu giá.`,
    );
  }

  /** Áp dụng giá vào các ô ảnh hưởng (chưa lưu DB). */
  function handleApplyPreview() {
    setPrices((prev) => {
      const next = { ...prev };
      for (const key of affectedKeys) next[key] = basePrice;
      return next;
    });
    setNotice(
      `Đã đặt giá ${formatMoney(basePrice)}/ô cho ${affectedKeys.length} ô (chưa lưu). Nhấn "Lưu CSDL" để ghi vào database.`,
    );
  }

  /** Lưu toàn bộ bảng giá lên server (PUT /map, kiểm soát phiên bản). */
  async function handleSave() {
    if (!map || saving) return;
    setSaving(true);
    setError(null);
    try {
      const nodes = Object.entries(prices).map(([key, landPriceMinor]) => {
        const [nx, ny] = key.split('-').map(Number);
        return { x: nx, y: ny, landPriceMinor };
      });
      const result = await adminRequest<PutMapResponse>('/api/v1/map', {
        method: 'PUT',
        body: JSON.stringify({ version: map.meta.version, nodes }),
      });
      setMap({ ...map, meta: { ...map.meta, version: result.version } });
      setNotice(`Đã lưu bảng giá đất vào CSDL! Phiên bản mới: ${result.version}.`);
    } catch (caught) {
      const { status, message } = errorMessage(caught);
      setError(
        status === 409
          ? 'Bản đồ đã được người khác cập nhật. Nhấn "Tải lại" rồi lưu lại.'
          : `Không lưu được: ${message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  const editable = provinceCode === '001';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bảng giá đất nền — Land Price Setting"
        description="Đặt đơn giá đất gốc (base_land_price) cho từng ô đất. Giá này được lưu trực tiếp vào database và dùng để hiển thị/tính giao dịch khi người chơi mua đất trên bản đồ."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMap()}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition disabled:opacity-60 hover:bg-slate-200"
            >
              {loading ? 'Đang tải…' : 'Tải lại từ server'}
            </button>
            <button
              type="button"
              disabled={saving || !editable}
              onClick={() => void handleSave()}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-60 ${
                saving
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-emerald-500 text-white hover:brightness-105 shadow-md shadow-emerald-500/20'
              }`}
            >
              {saving ? 'Đang lưu…' : 'Lưu CSDL'}
            </button>
            {map && (
              <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">
                Phiên bản: {map.meta.version}
              </span>
            )}
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-semibold text-rose-700">
          ⚠️ {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-700">
          ✓ {notice}
        </div>
      )}

      {/* Ma trận giá đất gốc theo loại đất (base land price matrix) */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">
            Ma trận giá đất gốc theo loại đất (base_land_price)
          </h2>
          <span className="text-[11px] text-slate-500">
            AI GM căn cứ mốc này tính Giá Khởi Điểm các phiên đấu giá.
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ZONE_PRICE_ROWS.map((row) => (
            <label key={row.id} className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-slate-700">{row.label}</span>
              <input
                type="number"
                min="0"
                step="1000000"
                value={zonePrices[row.id] ?? '0'}
                disabled={!editable}
                onChange={(e) =>
                  setZonePrices((prev) => ({ ...prev, [row.id]: e.target.value }))
                }
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono font-bold text-emerald-700 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
              />
              <span className="font-mono text-[10px] text-slate-500">
                VNĐ / ô ({formatMoney(Number(zonePrices[row.id] ?? '0') || 0)})
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!editable}
          onClick={handleApplyZonePrices}
          className="mt-3 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition disabled:opacity-60 hover:brightness-105"
        >
          Áp ma trận giá theo loại đất
        </button>
      </div>

      {/* Form: chọn tỉnh + vùng + giá đất */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleApplyPreview();
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4"
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-700">Thành phố / Tỉnh thành</span>
          <select
            value={provinceCode}
            onChange={(e) => setProvinceCode(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
          >
            {(provinces.length > 0
              ? provinces
              : [{ code: '001', name: 'Thành phố Hà Nội', region: 'Bắc', isCity: true }]
            ).map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-700">Phạm vi áp giá</span>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`rounded-lg px-3 py-1.5 font-bold transition ${
                mode === 'single'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🎯 Ô đơn [X, Y]
            </button>
            <button
              type="button"
              onClick={() => setMode('radius')}
              className={`rounded-lg px-3 py-1.5 font-bold transition ${
                mode === 'radius'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⭕ Bán kính (Radius)
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-700">Tọa độ X</span>
          <input
            type="number"
            min="0"
            value={xInput}
            onChange={(e) => setXInput(e.target.value)}
            className="w-20 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-slate-900 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-700">Tọa độ Y</span>
          <input
            type="number"
            min="0"
            value={yInput}
            onChange={(e) => setYInput(e.target.value)}
            className="w-20 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-slate-900 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        {mode === 'radius' && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-700">Bán kính</span>
            <input
              type="number"
              min="0"
              max="20"
              value={radiusInput}
              onChange={(e) => setRadiusInput(e.target.value)}
              className="w-20 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-slate-900 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-700">
            Đơn giá đất gốc (base_land_price, VNĐ)
          </span>
          <input
            type="number"
            min="0"
            step="1000000"
            value={basePriceInput}
            onChange={(e) => setBasePriceInput(e.target.value)}
            className="w-44 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono font-bold text-emerald-700 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={!editable}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 hover:brightness-125"
        >
          Áp dụng vào {affectedKeys.length} ô
        </button>
      </form>

      {!editable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-800">
          Bản đồ có thể lưu giá trong CSDL hiện chỉ gồm Thành phố Hà Nội (001). Tỉnh/thành khác đang
          dùng bản đồ địa giới sinh động, chưa hỗ trợ lưu giá đất.
        </div>
      )}

      {/* Bản đồ 2D theo tỉnh (chấm đỏ = ô có BĐS, viền vàng = tâm đang chọn) */}
      <div className="space-y-2">
        <MapCanvas2D
          key={provinceCode}
          mapData={mapData}
          selected={{ col: x, row: y }}
          onSelectPlot={(col, row) => handleCellClick(col, row)}
        />
        <p className="text-[11px] text-slate-500">
          Nhấn vào một ô đất trên bản đồ 2D để chọn tọa độ [X, Y] tâm. Nhấn "Áp dụng" để đặt giá cho{' '}
          {affectedKeys.length} ô theo phạm vi, sau đó nhấn "Lưu CSDL" để ghi bảng giá vào database.
        </p>
      </div>
    </div>
  );
}
