import { useEffect, useRef, useState } from 'react';
import type { MapData, ZoneType } from './MapData';

/** Kích thước nội bộ bản đồ 2D (canvas 1000×1000, hiển thị responsive). */
export const MAP_CANVAS_SIZE = 1000;

const ZONE_HEX: Record<ZoneType, string> = {
  // Soft Modern Pastel Palette — chuyển dốc mượt mà, tinh tế.
  commercial: '#DDD6FE', // Trung tâm CBD (tím tím nhạt / hồng tím sang)
  residential: '#FEF3C7', // Đất dân cư (vàng kem nhạt)
  industrial: '#E5E7EB', // Công nghiệp (nâu xám nhạt)
  civic: '#A7F3D0', // Hành chính / Ngoại ô (xanh lá mạ mềm)
  port: '#60A5FA', // Cảng & ven biển (xanh navy dịu)
  slum: '#D1D5DB', // Ngoại ô / Tự phát (xám nhạt)
  water: '#3B82F6', // Đất sông/biển (xanh navy)
  park: '#A7F3D0', // Công viên / Đồi núi (xanh lá mạ mềm)
};

/** Style ô đất theo loại phân khu: màu nền + viền mờ tinh tế (rgba 0.05). */
export function getTileStyle(zoneType: ZoneType): { bg: string; border: string } {
  const bg = ZONE_HEX[zoneType] ?? ZONE_HEX.residential;
  return { bg, border: 'rgba(0,0,0,0.05)' };
}

/** Lưới filler dày đặc: 250×250 ô × 4px phủ toàn khung 1000×1000. */
const FILL_GRID = 250;
const FILL_CELL = MAP_CANVAS_SIZE / FILL_GRID;

function seedFromCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeNoise(seed: number): (wx: number, wy: number) => number {
  let a = seed | 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const GW = 10;
  const grid: number[][] = [];
  for (let gy = 0; gy <= GW; gy += 1) {
    grid.push([]);
    for (let gx = 0; gx <= GW; gx += 1) grid[gy]!.push(rand());
  }
  return (wx: number, wy: number) => {
    const fx = (wx / MAP_CANVAS_SIZE) * GW;
    const fy = (wy / MAP_CANVAS_SIZE) * GW;
    const x0 = Math.max(0, Math.min(GW - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(GW - 1, Math.floor(fy)));
    const tx = fx - x0;
    const ty = fy - y0;
    const va = grid[y0]![x0]!;
    const vb = grid[y0]![x0 + 1]!;
    const vc = grid[y0 + 1]![x0]!;
    const vd = grid[y0 + 1]![x0 + 1]!;
    return va + (vb - va) * tx + (vc - va) * ty + (va - vb - vc + vd) * tx * ty;
  };
}

/** Vùng đất tại điểm world (1000×1000) — nhiễu mượt + CBD theo seed mã tỉnh.
 *  Lưới phủ KÍN 100% khung: không còn biển/nước (hết rãnh hở), mọi ô đều là đất liền. */
function createZoneSampler(seed: number): (wx: number, wy: number) => ZoneType {
  const cbdR = 140 + (seed % 220);
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed ^ 0x9e3779b9);
  return (wx: number, wy: number) => {
    const dx = wx - MAP_CANVAS_SIZE / 2;
    const dy = wy - MAP_CANVAS_SIZE / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < cbdR) return 'commercial';
    const n = noise(wx, wy);
    const radial = dist / (MAP_CANVAS_SIZE / 2);
    if (radial > 0.82 && noise2(wx, wy) > 0.55) return 'port';
    if (n > 0.72) return 'park';
    if (n > 0.62) return 'industrial';
    if (n > 0.54 && radial < 0.6) return 'civic';
    if (n > 0.5 && radial > 0.7) return 'slum';
    return 'residential';
  };
}

export interface FillTileInfo {
  wx: number;
  wy: number;
  zone: ZoneType;
}

export interface AuctioningTile {
  x: number;
  y: number;
}

/** Một khối hợp thửa: gom các ô liền kề thành công trình lớn trên bản đồ. */
export interface MergedCluster {
  cells: Array<{ x: number; y: number }>;
  label: string;
}

interface MapCanvas2DProps {
  mapData?: MapData;
  /** Tọa độ ô đang chọn (col, row) để tô viền. */
  selected?: { col: number; row: number } | null;
  /** Ô đất đang đấu giá — phủ đỏ nhấp nháy (#EF4444, opacity 0.6–1.0). */
  auctioningTile?: AuctioningTile | null;
  /** Các khối hợp thửa (ô liền kề cùng chủ) — phủ cam + nhãn công trình. */
  mergedClusters?: MergedCluster[];
  /** Click ô đất hoang (filler) ngoài ô dữ liệu server. */
  onSelectFill?: (tile: FillTileInfo) => void;
  onSelectPlot?: (col: number, row: number) => void;
}

interface ViewTransform {
  panX: number;
  panY: number;
}

/**
 * Bản đồ 2D Canvas 1000×1000 (fit-to-container):
 * không zoom — chuột chỉ kéo di chuyển (Pan Drag) và click chọn ô đất.
 * Ô đấu giá: overlay đỏ #EF4444 nhấp nháy + viền đỏ + nhãn "BĐS ĐẦU GIÁ".
 */
export function MapCanvas2D({
  mapData,
  selected,
  auctioningTile,
  mergedClusters = [],
  onSelectFill,
  onSelectPlot,
}: MapCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState<ViewTransform>({ panX: 0, panY: 0 });
  const viewRef = useRef(pan);
  viewRef.current = pan;
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const cols = mapData?.meta.cols ?? 32;
  const rows = mapData?.meta.rows ?? 20;
  const seed = seedFromCode(mapData?.provinceCode ?? '001');

  // Chuẩn hóa ô vuông 1:1 — cellWidth == cellHeight (lấy cạnh nhỏ nhất, căn giữa).
  const cellWidth = MAP_CANVAS_SIZE / cols;
  const cellHeight = MAP_CANVAS_SIZE / rows;
  const cell = Math.min(cellWidth, cellHeight);
  const originX = (MAP_CANVAS_SIZE - cell * cols) / 2;
  const originY = (MAP_CANVAS_SIZE - cell * rows) / 2;

  function draw(now: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, MAP_CANVAS_SIZE, MAP_CANVAS_SIZE);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, MAP_CANVAS_SIZE, MAP_CANVAS_SIZE);
    // Khung chứa vừa khít toàn bộ ma trận (fit-to-container), chuột chỉ Pan + Click.
    ctx.setTransform(1, 0, 0, 1, v.panX, v.panY);

    // Lưới filler dày đặc 250×250 (ô 4px) phủ nền dưới ô dữ liệu.
    const zoneAt = createZoneSampler(seed);
    for (let fy = 0; fy < FILL_GRID; fy += 1) {
      for (let fx = 0; fx < FILL_GRID; fx += 1) {
        const wx = fx * FILL_CELL;
        const wy = fy * FILL_CELL;
        ctx.fillStyle = getTileStyle(zoneAt(wx + FILL_CELL / 2, wy + FILL_CELL / 2)).bg;
        ctx.fillRect(wx, wy, FILL_CELL, FILL_CELL);
      }
    }

    const nodeById = new Map((mapData?.nodes ?? []).map((n) => [n.id, n]));
    const propertyKeys = new Set<string>();
    for (const p of mapData?.properties ?? []) {
      const node = nodeById.get(p.nodeId);
      if (node) propertyKeys.add(`${node.x}-${node.y}`);
    }

    for (const node of mapData?.nodes ?? []) {
      const px = originX + node.x * cell;
      const py = originY + node.y * cell;
      const style = getTileStyle(node.zoneType);
      ctx.fillStyle = style.bg;
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      if (propertyKeys.has(`${node.x}-${node.y}`)) {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, Math.max(2, cell * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Khối hợp thửa: phủ cam liền khối + viền cam đậm + nhãn công trình.
    for (const cluster of mergedClusters) {
      if (cluster.cells.length === 0) continue;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.28)';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      for (const c of cluster.cells) {
        const px = originX + c.x * cell;
        const py = originY + c.y * cell;
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
      }
      const centroid = cluster.cells.reduce(
        (acc, c) => ({
          sx: acc.sx + originX + c.x * cell + cell / 2,
          sy: acc.sy + originY + c.y * cell + cell / 2,
        }),
        { sx: 0, sy: 0 },
      );
      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      const lx = centroid.sx / cluster.cells.length;
      const ly = centroid.sy / cluster.cells.length;
      ctx.strokeText(cluster.label, lx, ly);
      ctx.fillStyle = '#ea580c';
      ctx.fillText(cluster.label, lx, ly);
      ctx.restore();
    }

    // Ô đang đấu giá: phủ đỏ nhấp nháy + viền đỏ đậm + nhãn.
    if (auctioningTile) {
      const px = originX + auctioningTile.x * cell;
      const py = originY + auctioningTile.y * cell;
      const alpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now / 300));
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      const label = 'BĐS ĐẦU GIÁ';
      const labelY = py - 6;
      ctx.strokeText(label, px + cell / 2, labelY);
      ctx.fillStyle = '#EF4444';
      ctx.fillText(label, px + cell / 2, labelY);
      ctx.restore();
    }

    // Ô đang chọn: viền hổ phách.
    if (selected) {
      const px = originX + selected.col * cell;
      const py = originY + selected.row * cell;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
    }
  }

  // Vẽ lại theo trạng thái; rAF liên tục chỉ khi có ô đấu giá (hiệu ứng pulse).
  useEffect(() => {
    if (!auctioningTile) {
      draw(0);
      return;
    }
    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mapData, selected, auctioningTile, mergedClusters, pan, cols, rows]);

  function screenToWorld(clientX: number, clientY: number): { wx: number; wy: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const v = viewRef.current;
    return {
      wx: (clientX - rect.left) * scaleX - v.panX,
      wy: (clientY - rect.top) * scaleY - v.panY,
    };
  }

  // Zoom đã tắt hoàn toàn: wheel không đổi view, không có nút +/- / % nào.
  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * MAP_CANVAS_SIZE;
    const dy = ((e.clientY - drag.startY) / rect.height) * MAP_CANVAS_SIZE;
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) {
      drag.moved = true;
    }
    if (drag.moved) {
      setPan((v) => ({ panX: v.panX + dx, panY: v.panY + dy }));
      drag.startX = e.clientX;
      drag.startY = e.clientY;
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const world = screenToWorld(e.clientX, e.clientY);
      if (world) {
        const col = Math.floor((world.wx - originX) / cell);
        const row = Math.floor((world.wy - originY) / cell);
        if (col >= 0 && col < cols && row >= 0 && row < rows) {
          onSelectPlot?.(col, row);
        } else if (
          world.wx >= 0 &&
          world.wx < MAP_CANVAS_SIZE &&
          world.wy >= 0 &&
          world.wy < MAP_CANVAS_SIZE
        ) {
          onSelectFill?.({
            wx: world.wx,
            wy: world.wy,
            zone: createZoneSampler(seed)(world.wx, world.wy),
          });
        }
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          width={MAP_CANVAS_SIZE}
          height={MAP_CANVAS_SIZE}
          className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        <span>
          {mapData?.provinceName ?? 'Bản đồ'} ({cols}×{rows}) · Kéo để di chuyển · Nhấn ô để xem
          {auctioningTile && <span className="ml-2 font-bold text-red-500">🔨 ĐANG ĐẤU GIÁ</span>}
        </span>
        <span className="font-mono text-slate-600">Fit 100%</span>
      </div>
    </div>
  );
}
