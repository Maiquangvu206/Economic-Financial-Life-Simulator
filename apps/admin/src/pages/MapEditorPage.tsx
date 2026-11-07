import { PageHeader } from '@efls/ui';
import { useState, useRef, type WheelEvent } from 'react';
import { formatCompact } from '../shared/lib/format';

export type LayerMode = 'zones' | 'roads' | 'facilities';

export const VIETNAM_ZONES = [
  { id: 'residential', label: 'Đất ở (Khu dân cư)', color: 'bg-emerald-600', border: 'border-emerald-500', basePrice: 45_000_000 },
  { id: 'commercial', label: 'Thương mại - Dịch vụ', color: 'bg-blue-600', border: 'border-blue-500', basePrice: 120_000_000 },
  { id: 'industrial', label: 'Khu công nghiệp (KCN)', color: 'bg-amber-600', border: 'border-amber-500', basePrice: 25_000_000 },
  { id: 'civic', label: 'Hành chính - Công cộng', color: 'bg-purple-600', border: 'border-purple-500', basePrice: 80_000_000 },
  { id: 'port', label: 'Cảng biển & Logistics', color: 'bg-cyan-600', border: 'border-cyan-500', basePrice: 60_000_000 },
  { id: 'slum', label: 'Khu tự phát / Xóm liều', color: 'bg-rose-700', border: 'border-rose-600', basePrice: 12_000_000 },
  { id: 'water', label: 'Mặt nước (Sông/Hồ)', color: 'bg-sky-500', border: 'border-sky-400', basePrice: 0 },
  { id: 'park', label: 'Công viên - Cây xanh', color: 'bg-teal-500', border: 'border-teal-400', basePrice: 0 },
] as const;

export const VIETNAM_ROADS = [
  { id: 'highway', label: 'Đại lộ / Cao tốc (4-6 làn)', color: 'bg-amber-400', icon: '🛣️', desc: 'Lưu lượng cực lớn, kết nối liên vùng' },
  { id: 'arterial', label: 'Đường trục chính đô thị', color: 'bg-slate-300', icon: '🚗', desc: 'Đường phố lớn, 2-4 làn xe, thương mại sầm uất' },
  { id: 'local', label: 'Đường nội bộ / Ngõ phố', color: 'bg-slate-500', icon: '🛵', desc: 'Ngõ ngách dân cư, tốc độ chậm' },
  { id: 'bridge', label: 'Cầu vượt / Cầu qua sông', color: 'bg-orange-500', icon: '🌉', desc: 'Bắc qua sông hoặc nút giao khác mức' },
  { id: 'none', label: 'Xóa đường giao thông', color: 'bg-rose-900', icon: '❌', desc: 'Không có đường đi qua ô này' },
] as const;

export type ZoneId = (typeof VIETNAM_ZONES)[number]['id'];
export type RoadId = (typeof VIETNAM_ROADS)[number]['id'];

interface CellData {
  zone: ZoneId;
  road?: RoadId;
  pricePerM2: number;
}

export function MapEditorPage() {
  const [editorMode, setEditorMode] = useState<LayerMode>('zones');
  const [activeZone, setActiveZone] = useState<ZoneId>('residential');
  const [activeRoad, setActiveRoad] = useState<RoadId>('arterial');

  // Bản đồ đại đô thị cực lớn: Admin có thể tùy ý cấu hình số Cột và Dòng
  const [gridCols, setGridCols] = useState(40);
  const [gridRows, setGridRows] = useState(25);

  // Input tạm để nhập kích thước mới
  const [inputCols, setInputCols] = useState('40');
  const [inputRows, setInputRows] = useState('25');

  // Zoom và Kích thước ô (Zoom Level)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  // Dữ liệu ô lưu theo key tọa độ cố định dạng `x-y`. Khi mở rộng lưới, toàn bộ dữ liệu ô cũ vẫn giữ nguyên vẹn 100%
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [customPrice, setCustomPrice] = useState<number>(45_000_000);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleApplyGridSize = (e: React.FormEvent) => {
    e.preventDefault();
    const cols = Math.min(100, Math.max(10, parseInt(inputCols, 10) || 40));
    const rows = Math.min(60, Math.max(10, parseInt(inputRows, 10) || 25));
    setGridCols(cols);
    setGridRows(rows);
    setInputCols(cols.toString());
    setInputRows(rows.toString());
    setSavedNotice(`Đã mở rộng bản đồ thành công: ${cols} Cột x ${rows} Dòng (${cols * rows} ô). Dữ liệu quy hoạch cũ được bảo toàn!`);
    setTimeout(() => setSavedNotice(null), 4000);
  };

  const [showZones, setShowZones] = useState(true);
  const [showRoads, setShowRoads] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom bằng lăn chuột khi hover trên bản đồ
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoomLevel((prev) => Math.min(2.5, Math.max(0.4, Number((prev + delta).toFixed(2)))));
    }
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(2.5, Number((prev + 0.2).toFixed(1))));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.4, Number((prev - 0.2).toFixed(1))));
  const handleZoomReset = () => setZoomLevel(1);

  const handleCellClick = (key: string) => {
    if (selectedCellKey === key) {
      applyCurrentTool(key);
    } else {
      setSelectedCellKey(key);
    }
  };

  const handleCellDoubleClick = (key: string) => {
    applyCurrentTool(key);
  };

  const applyCurrentTool = (key: string) => {
    setCells((prev) => {
      const current = prev[key] || {
        zone: 'residential',
        pricePerM2: customPrice,
      };

      if (editorMode === 'zones') {
        const defaultZone = VIETNAM_ZONES.find((z) => z.id === activeZone);
        return {
          ...prev,
          [key]: {
            ...current,
            zone: activeZone,
            pricePerM2: customPrice || defaultZone?.basePrice || 30_000_000,
          },
        };
      }

      if (editorMode === 'roads') {
        return {
          ...prev,
          [key]: {
            ...current,
            road: activeRoad === 'none' ? undefined : activeRoad,
          },
        };
      }

      return prev;
    });
    setSelectedCellKey(key);
  };

  const handleSaveMap = () => {
    const roadCount = Object.values(cells).filter((c) => c.road && c.road !== 'none').length;
    setSavedNotice(
      `Đã lưu bản đồ thành công! Quy mô: ${gridCols}x${gridRows} (${gridCols * gridRows} ô), gồm ${Object.keys(cells).length} ô quy hoạch và ${roadCount} cung đường giao thông.`,
    );
    setTimeout(() => setSavedNotice(null), 4000);
  };

  const selectedCell = selectedCellKey ? cells[selectedCellKey] : null;
  const currentRoadInfo = selectedCell?.road ? VIETNAM_ROADS.find((r) => r.id === selectedCell.road) : null;

  // Tính toán kích thước pixel cơ sở của ô theo tỷ lệ zoom
  const baseTilePx = Math.round(36 * zoomLevel);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Map Editor & Đại Đô thị Mở Rộng Việt Nam"
        description="Bản đồ quy mô lớn (50x30 = 1.500 ô) có thể zoom phóng to/thu nhỏ mượt mà, phân lớp giao thông & đơn giá đất theo m² VNĐ."
        actions={
          <div className="flex items-center gap-3">
            {/* Bộ điều khiển Zoom */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={handleZoomOut}
                className="w-7 h-7 flex items-center justify-center font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Thu nhỏ (-)"
              >
                −
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="px-2 font-mono font-bold text-amber-300 hover:bg-slate-800 rounded-lg text-xs"
                title="Khôi phục 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="w-7 h-7 flex items-center justify-center font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Phóng to (+)"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveMap}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 shadow-md shadow-amber-500/20"
            >
              Lưu bản đồ quy hoạch
            </button>
          </div>
        }
      />

      {savedNotice && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/70 p-3 text-xs font-semibold text-emerald-300">
          ✓ {savedNotice}
        </div>
      )}

      {/* Thanh điều khiển công cụ và chế độ vẽ */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-surface-900/80 p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">Chế độ:</span>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setEditorMode('zones')}
              className={`rounded-lg px-3 py-1.5 font-bold transition flex items-center gap-1.5 ${
                editorMode === 'zones'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏙️</span>
              <span>1. Quy hoạch Vùng (Zones)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('roads')}
              className={`rounded-lg px-3 py-1.5 font-bold transition flex items-center gap-1.5 ${
                editorMode === 'roads'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🛣️</span>
              <span>2. Mạng lưới Giao thông (Roads)</span>
            </button>
          </div>
        </div>

        {/* Form cấu hình kích thước bản đồ linh hoạt (Không làm mất dữ liệu ô cũ) */}
        <form onSubmit={handleApplyGridSize} className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <span className="font-semibold text-amber-300">Kích thước Map:</span>
          <div className="flex items-center gap-1 font-mono">
            <input
              type="number"
              min="10"
              max="100"
              value={inputCols}
              onChange={(e) => setInputCols(e.target.value)}
              className="w-12 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-white focus:border-amber-500 focus:outline-none"
              title="Số cột (Chiều ngang)"
            />
            <span className="text-slate-500">x</span>
            <input
              type="number"
              min="10"
              max="60"
              value={inputRows}
              onChange={(e) => setInputRows(e.target.value)}
              className="w-12 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-white focus:border-amber-500 focus:outline-none"
              title="Số dòng (Chiều dọc)"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-2.5 py-1 font-semibold text-amber-300 hover:bg-slate-700 transition"
          >
            Mở rộng
          </button>
        </form>

        {/* Lọc lớp hiển thị */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-400">Lớp:</span>
          <button
            type="button"
            onClick={() => setShowZones(!showZones)}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              showZones
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'bg-slate-800 text-slate-500 border border-slate-700 line-through'
            }`}
          >
            Vùng đất
          </button>
          <button
            type="button"
            onClick={() => setShowRoads(!showRoads)}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              showRoads
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'bg-slate-800 text-slate-500 border border-slate-700 line-through'
            }`}
          >
            Giao thông
          </button>
        </div>

        {/* Đơn vị giá đất theo m² */}
        {editorMode === 'zones' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Đơn giá đất:</span>
            <input
              type="number"
              step="1000000"
              value={customPrice}
              onChange={(e) => setCustomPrice(Number(e.target.value))}
              className="w-32 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-emerald-300 text-right font-bold focus:border-amber-500 focus:outline-none"
            />
            <span className="text-slate-400 text-[11px] font-mono">({formatCompact(customPrice)}/m²)</span>
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-mono">
          Kích thước: <b>{gridCols} x {gridRows}</b> ({gridCols * gridRows} ô) · Giữ Ctrl + Cuộn chuột để Zoom
        </div>
      </div>

      {/* Palette chọn loại vùng hoặc đường */}
      {editorMode === 'zones' ? (
        <div className="flex flex-wrap items-center gap-2 p-1">
          {VIETNAM_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => {
                setActiveZone(zone.id);
                setCustomPrice(zone.basePrice);
              }}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${
                activeZone === zone.id
                  ? 'border-amber-400 bg-surface-850 text-white shadow-md ring-1 ring-amber-400'
                  : 'border-slate-800 bg-surface-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full ${zone.color} border border-white/20`} />
              <span>{zone.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 p-1">
          {VIETNAM_ROADS.map((road) => (
            <button
              key={road.id}
              type="button"
              onClick={() => setActiveRoad(road.id as RoadId)}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${
                activeRoad === road.id
                  ? 'border-amber-400 bg-amber-950/40 text-amber-300 shadow-md ring-1 ring-amber-400'
                  : 'border-slate-800 bg-surface-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className="text-sm">{road.icon}</span>
              <span>{road.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Khung Bản đồ Grid 2D Siêu Lớn với Viewport Cuộn */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        <div
          ref={containerRef}
          className="relative overflow-auto max-h-[660px] p-5 select-none"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div
            className="inline-grid gap-1 transition-all duration-100 ease-out"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, ${baseTilePx}px)`,
            }}
          >
          {Array.from({ length: gridCols * gridRows }, (_, index) => {
            const x = index % gridCols;
            const y = Math.floor(index / gridCols);
            const key = `${x}-${y}`;
            const cell = cells[key];
            const zoneInfo = VIETNAM_ZONES.find((z) => z.id === cell?.zone);
            const roadInfo = cell?.road ? VIETNAM_ROADS.find((r) => r.id === cell.road) : null;
            const isSelected = selectedCellKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCellClick(key)}
                onDoubleClick={() => handleCellDoubleClick(key)}
                style={{ width: `${baseTilePx}px`, height: `${baseTilePx}px` }}
                className={`relative rounded-[3px] transition-all border text-[9px] flex items-center justify-center font-mono overflow-hidden ${
                  cell && showZones
                    ? `${zoneInfo?.color || 'bg-slate-800'} ${zoneInfo?.border || 'border-slate-700'} text-white`
                    : 'bg-slate-900/70 border-slate-800/80 text-slate-700 hover:bg-slate-800 hover:border-slate-600'
                } ${isSelected ? 'ring-2 ring-amber-400 z-20 scale-105 shadow-lg shadow-amber-400/30' : ''}`}
                title={`[${x}, ${y}] | ${zoneInfo?.label || 'Đất trống'} | ${roadInfo ? `Đường: ${roadInfo.label}` : 'Chưa có đường'} | ${cell ? formatCompact(cell.pricePerM2) : '0'}/m²`}
              >
                {/* Lớp Giao thông */}
                {cell?.road && showRoads && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    {cell.road === 'highway' && (
                      <div className="w-full h-2.5 bg-amber-400 border-y border-amber-600 flex items-center justify-center shadow-md">
                        <div className="w-full border-t border-dashed border-slate-900 h-0" />
                      </div>
                    )}
                    {cell.road === 'arterial' && (
                      <div className="w-full h-2 bg-slate-300 border-y border-slate-500 shadow-sm" />
                    )}
                    {cell.road === 'local' && (
                      <div className="w-full h-1 bg-slate-500/90 rounded-sm" />
                    )}
                    {cell.road === 'bridge' && (
                      <div className="w-full h-2.5 bg-orange-600 border-y-2 border-orange-300 flex items-center justify-center">
                        <span className="text-[6px] text-white font-black leading-none">CẦU</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Tọa độ hiển thị nếu mức zoom đủ lớn */}
                {zoomLevel >= 0.8 && (
                  <span className="opacity-40 text-[7px] pointer-events-none relative z-10 leading-none">
                    {x},{y}
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Thanh thông tin chi tiết ô đất & giao thông */}
      <div className="rounded-2xl border border-slate-800 bg-surface-900/80 p-4 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-4">
        {selectedCellKey ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-amber-300 font-mono">Tọa độ: [{selectedCellKey}]</span>
            <span className="text-slate-600">|</span>
            <span>
              Quy hoạch:{' '}
              <b className="text-white">
                {selectedCell
                  ? VIETNAM_ZONES.find((z) => z.id === selectedCell.zone)?.label
                  : 'Đất trống'}
              </b>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              Giao thông:{' '}
              <b className={currentRoadInfo ? 'text-amber-300' : 'text-slate-500'}>
                {currentRoadInfo ? `${currentRoadInfo.icon} ${currentRoadInfo.label}` : 'Không'}
              </b>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              Đơn vị giá:{' '}
              <b className="text-emerald-400 font-mono">
                {selectedCell ? formatCompact(selectedCell.pricePerM2) : '0 ₫'}/m²
              </b>
            </span>
          </div>
        ) : (
          <div className="text-slate-500">Chưa chọn ô đất nào.</div>
        )}
      </div>
    </div>
  );
}
