import { useEffect, useRef, useState } from 'react';
import type { MapData, ZoneType } from './MapData';

/** Kích thước nội bộ bản đồ 2D (canvas 1000×1000, hiển thị responsive). */
export const MAP_CANVAS_SIZE = 1000;

const ZONE_HEX: Record<ZoneType, string> = {
  residential: '#d1fae5',
  commercial: '#bae6fd',
  industrial: '#fef3c7',
  civic: '#ede9fe',
  port: '#cffafe',
  slum: '#e2e8f0',
  water: '#60a5fa',
  park: '#ccfbf1',
};

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
  onSelectPlot?: (col: number, row: number) => void;
}

interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Bản đồ 2D Canvas 1000×1000 (thay hoàn toàn renderer 3D cũ):
 * zoom bằng cuộn chuột, pan bằng kéo thả; click chọn ô đất.
 * Ô đấu giá: overlay đỏ #EF4444 nhấp nháy + viền đỏ + nhãn "BĐS ĐẦU GIÁ".
 */
export function MapCanvas2D({
  mapData,
  selected,
  auctioningTile,
  mergedClusters = [],
  onSelectPlot,
}: MapCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const cols = mapData?.meta.cols ?? 32;
  const rows = mapData?.meta.rows ?? 20;

  // Ô đất vuông lớn nhất vừa khung 1000×1000, căn giữa.
  const cell = Math.min(MAP_CANVAS_SIZE / cols, MAP_CANVAS_SIZE / rows);
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
    // Apply zoom/pan (world 1000×1000 → canvas pixel).
    ctx.setTransform(v.zoom, 0, 0, v.zoom, v.panX, v.panY);

    const nodeById = new Map((mapData?.nodes ?? []).map((n) => [n.id, n]));
    const propertyKeys = new Set<string>();
    for (const p of mapData?.properties ?? []) {
      const node = nodeById.get(p.nodeId);
      if (node) propertyKeys.add(`${node.x}-${node.y}`);
    }

    for (const node of mapData?.nodes ?? []) {
      const px = originX + node.x * cell;
      const py = originY + node.y * cell;
      ctx.fillStyle = ZONE_HEX[node.zoneType] ?? ZONE_HEX.residential;
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
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
        (acc, c) => ({ sx: acc.sx + originX + c.x * cell + cell / 2, sy: acc.sy + originY + c.y * cell + cell / 2 }),
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
  }, [mapData, selected, auctioningTile, mergedClusters, cols, rows]);

  function screenToWorld(clientX: number, clientY: number): { wx: number; wy: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * MAP_CANVAS_SIZE;
    const sy = ((clientY - rect.top) / rect.height) * MAP_CANVAS_SIZE;
    const v = viewRef.current;
    return { wx: (sx - v.panX) / v.zoom, wy: (sy - v.panY) / v.zoom };
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * MAP_CANVAS_SIZE;
    const my = ((e.clientY - rect.top) / rect.height) * MAP_CANVAS_SIZE;
    setView((v) => {
      const nextZoom = Math.min(6, Math.max(1, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const panX = mx - ((mx - v.panX) / v.zoom) * nextZoom;
      const panY = my - ((my - v.panY) / v.zoom) * nextZoom;
      return { zoom: nextZoom, panX, panY };
    });
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
      setView((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
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
        }
      }
    }
  }

  function resetView() {
    setView({ zoom: 1, panX: 0, panY: 0 });
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
          {mapData?.provinceName ?? 'Bản đồ'} ({cols}×{rows}) · cuộn chuột để zoom · kéo để di
          chuyển · nhấn ô để xem
          {auctioningTile && <span className="ml-2 font-bold text-red-500">🔨 ĐANG ĐẤU GIÁ</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-slate-600">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            Đặt lại
          </button>
        </span>
      </div>
    </div>
  );
}
