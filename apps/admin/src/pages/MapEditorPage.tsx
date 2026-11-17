import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../shared/lib/format';
import { adminRequest } from '../shared/api/httpClient';
import type { MapDto, ProvinceDto, PutMapResponse } from '@efls/contracts';

interface ApiProblem {
  status?: number;
  message?: string;
  title?: string;
}

function errorMessage(caught: unknown): { status?: number; message: string } {
  if (caught && typeof caught === 'object') {
    const e = caught as ApiProblem;
    return { status: e.status, message: e.message ?? e.title ?? String(caught) };
  }
  return { message: String(caught ?? 'lỗi không xác định') };
}

const ZONE_PRICE_ROWS: Array<{ id: string; label: string }> = [
  { id: 'commercial', label: 'Trung tâm CBD / Thương mại' },
  { id: 'residential', label: 'Đất dân cư' },
  { id: 'industrial', label: 'Công nghiệp' },
  { id: 'civic', label: 'Hành chính / Ngoại ô' },
  { id: 'port', label: 'Cảng & ven biển' },
  { id: 'slum', label: 'Ngoại ô / Tự phát' },
  { id: 'park', label: 'Công viên / Đồi núi' },
];

/** Form cấu hình giá đất nền: chọn thành phố/tỉnh và thiết lập giá (lưu CSDL). */
export function MapEditorPage() {
  const [provinces, setProvinces] = useState<ProvinceDto[]>([]);
  const [provinceCode, setProvinceCode] = useState('001');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [map, setMap] = useState<MapDto | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [zonePrices, setZonePrices] = useState<Record<string, string>>({
    commercial: '120000000',
    residential: '45000000',
    industrial: '25000000',
    civic: '80000000',
    port: '60000000',
    slum: '12000000',
    park: '0',
  });

  useEffect(() => {
    adminRequest<ProvinceDto[]>('/api/v1/characters/provinces')
      .then(setProvinces)
      .catch(() => setProvinces([]));
  }, []);

  async function loadMap(code: string = provinceCode) {
    setLoading(true);
    setError(null);
    try {
      const data = await adminRequest<MapDto>(`/api/v1/map?province=${encodeURIComponent(code)}`);
      setMap(data);
      const next: Record<string, number> = {};
      for (const node of data.nodes) next[`${node.x}-${node.y}`] = node.landPriceMinor;
      setPrices(next);
      setNotice(`Đã tải cấu hình giá đất: ${data.provinceName ?? code} (${data.nodes.length} ô, v${data.meta.version}).`);
    } catch (caught) {
      setError(`Không tải được dữ liệu: ${errorMessage(caught).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMap(provinceCode);
  }, [provinceCode]);

  function handleApplyZonePrices() {
    if (!map) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const node of map.nodes) {
        next[`${node.x}-${node.y}`] = Math.max(0, Math.floor(Number(zonePrices[node.zoneType] ?? '0') || 0));
      }
      return next;
    });
    setNotice(`Đã áp ma trận giá theo loại đất cho ${map.nodes.length} ô (chưa lưu).`);
  }

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
        body: JSON.stringify({ version: map.meta.version, provinceCode, nodes }),
      });
      setMap({ ...map, meta: { ...map.meta, version: result.version } });
      setNotice(`Đã lưu cấu hình giá đất cho ${map.provinceName ?? provinceCode} (phiên bản ${result.version}).`);
    } catch (caught) {
      const { status, message } = errorMessage(caught);
      setError(status === 409 ? 'Dữ liệu đã thay đổi. Vui lòng tải lại rồi lưu.' : `Không lưu được: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const provinceList =
    provinces.length > 0 ? provinces : ([{ code: '001', name: 'Thành phố Hà Nội', region: 'Bắc', isCity: true }] as ProvinceDto[]);
  const filteredProvinceList = useMemo(() => {
    const q = provinceSearch.trim().toLowerCase();
    if (!q) return provinceList;
    return provinceList.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q));
  }, [provinceList, provinceSearch]);

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
  const labelCls = 'mb-1.5 block text-xs font-semibold text-slate-600';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        {/* Header */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Cấu hình giá đất nền</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Chọn thành phố/tỉnh và thiết lập đơn giá đất gốc (base_land_price). Lưu trực tiếp vào CSDL.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadMap()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {loading ? 'Đang tải…' : 'Tải lại'}
              </button>
              <button
                type="button"
                disabled={saving || !map}
                onClick={() => void handleSave()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : 'Lưu CSDL'}
              </button>
            </div>
          </div>

          {(error || notice) && (
            <div className="mt-4 space-y-2">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">⚠️ {error}</div>
              )}
              {notice && !error && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">✓ {notice}</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-8 px-6 py-6 sm:px-8 sm:py-8">
          {/* 1. Chọn thành phố/tỉnh */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">1. Thành phố / Tỉnh thành cần cấu hình</h2>
              {map && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {map.provinceName ?? provinceCode} · {map.nodes.length} ô · v{map.meta.version}
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={labelCls}>Tìm nhanh tỉnh/thành</span>
                <input
                  type="text"
                  value={provinceSearch}
                  onChange={(e) => setProvinceSearch(e.target.value)}
                  placeholder="Nhập mã hoặc tên (vd: 092, Cần Thơ)..."
                  className={inputCls}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelCls}>Khu vực</span>
                <select value={provinceCode} onChange={(e) => setProvinceCode(e.target.value)} className={inputCls}>
                  {filteredProvinceList.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                  {filteredProvinceList.length === 0 && (
                    <option value={provinceCode} disabled>
                      Không tìm thấy tỉnh/thành phù hợp
                    </option>
                  )}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Chọn khu vực để tải và cấu hình giá đất. Mọi tỉnh/thành đều có thể lưu cấu hình giá vào CSDL.
            </p>
          </section>

          {/* 2. Ma trận giá theo loại đất */}
          <section className="border-t border-slate-100 pt-8">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-900">2. Ma trận giá gốc theo loại đất</h2>
              <p className="mt-1 text-xs text-slate-500">
                Đặt mốc giá khởi điểm (VNĐ/ô) theo từng loại đất. Áp dụng cho toàn bộ ô thuộc loại tương ứng.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ZONE_PRICE_ROWS.map((row) => {
                const val = Number(zonePrices[row.id] ?? '0') || 0;
                return (
                  <label
                    key={row.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-slate-300 hover:bg-white"
                  >
                    <span className="block text-xs font-semibold text-slate-700">{row.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="1000000"
                      value={zonePrices[row.id] ?? '0'}
                      disabled={!map}
                      onChange={(e) => setZonePrices((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-emerald-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100"
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">{formatMoney(val)}/ô</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!map}
                onClick={handleApplyZonePrices}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                Áp ma trận giá theo loại đất
              </button>
              <span className="text-xs text-slate-500">
                Thay đổi áp dụng tạm thời, nhấn <b>Lưu CSDL</b> để ghi nhận.
              </span>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
