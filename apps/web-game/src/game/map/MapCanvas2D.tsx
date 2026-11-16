import { useEffect, useRef, useState } from 'react';
import type { MapData, ZoneType } from './MapData';

export const ZONE_CONFIG: Record<
    ZoneType,
    { bg: string; border: string; nameVi: string; icon: string }
  > = {
commercial: {
  bg: '#E0E7FF',
    border: '#C7D2FE',
      nameVi: 'Thương mại & CBD',
        icon: '🏢',
  },
residential: {
  bg: '#FEF3C7',
    border: '#FDE68A',
      nameVi: 'Khu dân cư',
        icon: '🏡',
  },
industrial: {
  bg: '#F3F4F6',
    border: '#E5E7EB',
      nameVi: 'Khu công nghiệp',
        icon: '🏭',
  },
civic: {
  bg: '#DCFCE7',
    border: '#BBF7D0',
      nameVi: 'Hành chính & Dịch vụ',
        icon: '🏛️',
  },
port: {
  bg: '#BFDBFE',
    border: '#93C5FD',
      nameVi: 'Cảng & Logistics',
        icon: '⚓',
  },
slum: {
  bg: '#E5E7EB',
    border: '#D1D5DB',
      nameVi: 'Khu dân cư tự phát',
        icon: '🏚️',
  },
water: {
  bg: '#60A5FA',
    border: '#3B82F6',
      nameVi: 'Sông & Kênh nước',
        icon: '🌊',
  },
park: {
  bg: '#D1FAE5',
    border: '#A7F3D0',
      nameVi: 'Công viên & Đồi xanh',
        icon: '🌳',
  },
};

export function getTileStyle(zoneType: ZoneType): { bg: string; border: string } {
  const cfg = ZONE_CONFIG[zoneType] ?? ZONE_CONFIG.residential;
  return { bg: cfg.bg, border: cfg.border };
}

  export interface AuctioningTile {
    x: number;
    y: number;
  }

    export interface MergedCluster {
      cells: Array<{ x: number; y: number }>;
      label: string;
      constructionOption?: string | null;
      constructionLabel?: string | null;
      isMine?: boolean;
      propertyType?: string | null;
    }

    interface MapCanvas2DProps {
      mapData?: MapData;
      selected?: { col: number; row: number } | null;
      auctioningTile?: AuctioningTile | null;
      mergedClusters?: MergedCluster[];
      onSelectPlot?: (col: number, row: number) => void;
      onSelectFill?: (tile: { wx: number; wy: number; zone: string; label?: string }) => void;
    }

    interface ViewTransform {
      panX: number;
      panY: number;
      zoom: number;
    }

    export function MapCanvas2D({
      mapData,
      selected,
      auctioningTile,
      mergedClusters = [],
      onSelectPlot,
    }: MapCanvas2DProps) {
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const wrapRef = useRef<HTMLDivElement | null>(null);

      // View state
      const [view, setView] = useState<ViewTransform>({ panX: 0, panY: 0, zoom: 1 });
      const viewRef = useRef(view);
      viewRef.current = view;

      const [hoveredPlot, setHoveredPlot] = useState<{ col: number; row: number } | null>(null);
      const [showGridLines, setShowGridLines] = useState(true);

      const dragRef = useRef<{
        startX: number;
        startY: number;
        initialPanX: number;
        initialPanY: number;
        moved: boolean;
      } | null>(null);

    const cols = mapData?.meta.cols ?? 40;
    const rows = mapData?.meta.rows ?? 28;

        // Kích thước chuẩn ô đất trong không gian canvas: KHÔNG CÓ VIỀN THỪA NGOẠI VI
        const CELL_SIZE = 48;
        const canvasWidth = cols * CELL_SIZE;
        const canvasHeight = rows * CELL_SIZE;

        // Vẽ canvas
        function draw(now: number) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const { panX, panY, zoom } = viewRef.current;

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Nền trắng tinh khiết bên dưới
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Áp dụng Transform Pan + Zoom
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.translate(centerX + panX, centerY + panY);
          ctx.scale(zoom, zoom);
          ctx.translate(-centerX, -centerY);

          // Chuẩn bị bảng tra cứu Nodes & Properties
          const nodeByCoord = new Map<string, NonNullable<MapData['nodes']>[number]>();
          for (const node of mapData?.nodes ?? []) {
            nodeByCoord.set(`${node.x}-${node.y}`, node);
          }

            const propByCoord = new Map<string, NonNullable<MapData['properties']>[number]>();
            for (const p of mapData?.properties ?? []) {
              const n = (mapData?.nodes ?? []).find((node) => node.id === p.nodeId);
              if (n) {
                propByCoord.set(`${n.x}-${n.y}`, p);
              } else if (p.location && Number.isFinite(p.location.x) && Number.isFinite(p.location.y)) {
                propByCoord.set(`${p.location.x}-${p.location.y}`, p);
              }
            }

            // 1. Vẽ đúng 100% các ô đất trong bản đồ đô thị (từ [0,0] đến [cols-1, rows-1])
            for (let r = 0; r < rows; r += 1) {
              for (let c = 0; c < cols; c += 1) {
                const px = c * CELL_SIZE;
                const py = r * CELL_SIZE;
                const key = `${c}-${r}`;
                const node = nodeByCoord.get(key);
                const prop = propByCoord.get(key);

                const zone = node?.zoneType ?? 'residential';
                const zoneInfo = ZONE_CONFIG[zone] ?? ZONE_CONFIG.residential;

                // Màu nền ô
                ctx.fillStyle = zoneInfo.bg;
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

                // Đường lưới phân ô
                if (showGridLines) {
                  ctx.strokeStyle = zoneInfo.border;
                  ctx.lineWidth = 1;
                  ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
                }

                    // Icon phân khu khi zoom
                    if (zoom >= 0.85) {
                      ctx.save();
                      ctx.font = `${Math.round(15 * Math.min(1.4, zoom))}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.globalAlpha = prop ? 0.35 : 0.65;
                      ctx.fillText(zoneInfo.icon, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                      ctx.restore();
                    }

                // Có công trình BĐS đã xây dựng
                if (prop) {
                  if (prop.isMine) {
                    // Đất của người chơi: viền xanh ngọc emerald nổi bật
                    ctx.strokeStyle = '#059669';
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);

                      ctx.fillStyle = '#10B981';
                      ctx.beginPath();
                      ctx.arc(px + CELL_SIZE - 7, py + 7, 4.5, 0, Math.PI * 2);
                      ctx.fill();
                    } else if (prop.status === 'listed') {
                      // Đang rao bán
                      ctx.fillStyle = '#D97706';
                      ctx.beginPath();
                      ctx.arc(px + CELL_SIZE - 7, py + 7, 4, 0, Math.PI * 2);
                      ctx.fill();
                    } else {
                      // Đã có chủ khác
                      ctx.fillStyle = '#64748B';
                      ctx.beginPath();
                      ctx.arc(px + CELL_SIZE - 7, py + 7, 3, 0, Math.PI * 2);
                      ctx.fill();
                    }
                  }

                  // Tọa độ góc mờ khi zoom >= 1.3
                  if (zoom >= 1.3) {
                    ctx.save();
                    ctx.font = '8px monospace';
                    ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
                    ctx.fillText(`${c},${r}`, px + 3, py + 10);
                    ctx.restore();
                  }
                }
              }

                  // 2. Khối hợp thửa/công trình (Merged Clusters) - viền ngoài, không kẻ viền giữa các ô liền kề
                  for (const cluster of mergedClusters) {
                    if (cluster.cells.length === 0) continue;
                    const cellSet = new Set(cluster.cells.map((c) => `${c.x}-${c.y}`));
                    const opt = cluster.constructionOption ?? null;
                    const hasConstruction = !!opt || !!cluster.constructionLabel;
                    const style = (() => {
                      switch (opt) {
                        case 'company_hq': return { fill: 'rgba(59,130,246,0.22)', stroke: '#2563EB', text: '#1D4ED8', icon: '🏢' };
                        case 'house4': return { fill: 'rgba(34,197,94,0.20)', stroke: '#16A34A', text: '#15803D', icon: '🏠' };
                        case 'shop': return { fill: 'rgba(245,158,11,0.22)', stroke: '#D97706', text: '#B45309', icon: '🏪' };
                        case 'garage': return { fill: 'rgba(100,116,139,0.22)', stroke: '#475569', text: '#334155', icon: '🚗' };
                        case 'mini-apartment': return { fill: 'rgba(168,85,247,0.22)', stroke: '#9333EA', text: '#7E22CE', icon: '🏘️' };
                        case 'boutique-hotel': return { fill: 'rgba(236,72,153,0.22)', stroke: '#DB2777', text: '#BE185D', icon: '🏨' };
                        case 'shopping-center': return { fill: 'rgba(249,115,22,0.22)', stroke: '#EA580C', text: '#C2410C', icon: '🏬' };
                        case 'office-tower': return { fill: 'rgba(14,165,233,0.22)', stroke: '#0284C7', text: '#0369A1', icon: '🏙️' };
                        default: return { fill: hasConstruction ? 'rgba(99,102,241,0.20)' : 'rgba(249,115,22,0.24)', stroke: hasConstruction ? '#6366F1' : '#EA580C', text: hasConstruction ? '#4338CA' : '#C2410C', icon: hasConstruction ? '🏗️' : '🧩' };
                      }
                    })();

                    // Tô nền cụm
                    ctx.fillStyle = style.fill;
                    for (const cell of cluster.cells) {
                      ctx.fillRect(cell.x * CELL_SIZE, cell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }

                    // Viền ngoài cụm (chỉ cạnh không tiếp giáp ô cùng cụm)
                    ctx.strokeStyle = style.stroke;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    for (const cell of cluster.cells) {
                      const x = cell.x * CELL_SIZE;
                      const y = cell.y * CELL_SIZE;
                      if (!cellSet.has(`${cell.x}-${cell.y - 1}`)) { ctx.moveTo(x, y); ctx.lineTo(x + CELL_SIZE, y); }
                      if (!cellSet.has(`${cell.x + 1}-${cell.y}`)) { ctx.moveTo(x + CELL_SIZE, y); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); }
                      if (!cellSet.has(`${cell.x}-${cell.y + 1}`)) { ctx.moveTo(x, y + CELL_SIZE); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); }
                      if (!cellSet.has(`${cell.x - 1}-${cell.y}`)) { ctx.moveTo(x, y); ctx.lineTo(x, y + CELL_SIZE); }
                    }
                    ctx.stroke();

                    // Nhãn + icon công trình/cụm tại trọng tâm
                    const centroid = cluster.cells.reduce(
                      (acc, c) => ({
                        sx: acc.sx + c.x * CELL_SIZE + CELL_SIZE / 2,
                        sy: acc.sy + c.y * CELL_SIZE + CELL_SIZE / 2,
                      }),
                      { sx: 0, sy: 0 },
                    );
                    const lx = centroid.sx / cluster.cells.length;
                    const ly = centroid.sy / cluster.cells.length;
                    const shortLabel = (cluster.constructionLabel || cluster.label || '').toString();
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                    ctx.fillText(style.icon, lx, ly - 8);
                    if (shortLabel) {
                      ctx.font = 'bold 10px sans-serif';
                      ctx.lineWidth = 3;
                      ctx.strokeStyle = '#FFFFFF';
                      ctx.strokeText(shortLabel.slice(0, 22), lx, ly + 10);
                      ctx.fillStyle = style.text;
                      ctx.fillText(shortLabel.slice(0, 22), lx, ly + 10);
                    }
                    ctx.restore();
                  }

                  // 3. Ô đang đấu giá (Pulse animation)
                  if (auctioningTile) {
                    const px = auctioningTile.x * CELL_SIZE;
                    const py = auctioningTile.y * CELL_SIZE;
                    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
                    const alpha = 0.45 + 0.45 * pulse;

                        // Glow overlay
                        ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
                        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

                    ctx.strokeStyle = '#DC2626';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);

                // Icon búa & Nhãn đấu giá
                ctx.save();
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#FFFFFF';
                ctx.strokeText('🔨 ĐẤU GIÁ', px + CELL_SIZE / 2, py - 4);
                ctx.fillStyle = '#DC2626';
                ctx.fillText('🔨 ĐẤU GIÁ', px + CELL_SIZE / 2, py - 4);
                ctx.restore();
              }

                // 4. Ô đang hover
                if (hoveredPlot && (hoveredPlot.col !== selected?.col || hoveredPlot.row !== selected?.row)) {
                  const px = hoveredPlot.col * CELL_SIZE;
                  const py = hoveredPlot.row * CELL_SIZE;
                  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                  ctx.strokeStyle = '#3B82F6';
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                }

                // 5. Ô đang chọn (Selected Tile Outline)
                if (selected) {
                  const px = selected.col * CELL_SIZE;
                  const py = selected.row * CELL_SIZE;

                  ctx.strokeStyle = '#F59E0B';
                  ctx.lineWidth = 3.5;
                  ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);

                // 4 góc chỉ thị góc nhìn
                ctx.fillStyle = '#D97706';
                const sz = 5;
                ctx.fillRect(px, py, sz, sz);
                ctx.fillRect(px + CELL_SIZE - sz, py, sz, sz);
                ctx.fillRect(px, py + CELL_SIZE - sz, sz, sz);
                ctx.fillRect(px + CELL_SIZE - sz, py + CELL_SIZE - sz, sz, sz);
              }

                ctx.restore();
              }

              // Render loop
              useEffect(() => {
                let raf = 0;
                const loop = (t: number) => {
                  draw(t);
                  raf = requestAnimationFrame(loop);
                };
                raf = requestAnimationFrame(loop);
                return () => cancelAnimationFrame(raf);
              }, [
                mapData,
                selected,
                auctioningTile,
                mergedClusters,
                view,
                hoveredPlot,
                showGridLines,
                cols,
                rows,
              ]);

              // Screen to Canvas Coordinates
              function screenToWorld(clientX: number, clientY: number): { wx: number; wy: number } | null {
                const canvas = canvasRef.current;
                if (!canvas) return null;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;

              const centerX = canvas.width / 2;
              const centerY = canvas.height / 2;
              const { panX, panY, zoom } = viewRef.current;

              const cx = (clientX - rect.left) * scaleX;
              const cy = (clientY - rect.top) * scaleY;

                const wx = (cx - (centerX + panX)) / zoom + centerX;
                const wy = (cy - (centerY + panY)) / zoom + centerY;

                return { wx, wy };
              }

            // Vô hiệu hóa zoom bằng lăn chuột (chỉ zoom bằng nút +/-)
            function handleWheel(_e: React.WheelEvent<HTMLCanvasElement>) {
              // intentionally no-op
            }

        // Pointer Drag & Click
        function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialPanX: view.panX,
            initialPanY: view.panY,
            moved: false,
          };
        }

          function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Cập nhật ô hover
            const world = screenToWorld(e.clientX, e.clientY);
            if (world) {
              const col = Math.floor(world.wx / CELL_SIZE);
              const row = Math.floor(world.wy / CELL_SIZE);
              if (col >= 0 && col < cols && row >= 0 && row < rows) {
                if (hoveredPlot?.col !== col || hoveredPlot?.row !== row) {
                  setHoveredPlot({ col, row });
                }
              } else {
                if (hoveredPlot !== null) setHoveredPlot(null);
              }
            }

              // Xử lý Pan Drag
              const drag = dragRef.current;
              if (!drag) return;

              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;

              const dx = (e.clientX - drag.startX) * scaleX;
              const dy = (e.clientY - drag.startY) * scaleY;

              if (Math.abs(dx) + Math.abs(dy) > 4) {
                drag.moved = true;
              }

          if (drag.moved) {
            setView((v) => ({
              ...v,
              panX: Math.max(-canvasWidth * 0.7, Math.min(canvasWidth * 0.7, drag.initialPanX + dx)),
              panY: Math.max(-canvasHeight * 0.7, Math.min(canvasHeight * 0.7, drag.initialPanY + dy)),
            }));
          }
        }

        function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
          const drag = dragRef.current;
          dragRef.current = null;

            if (drag && !drag.moved) {
              const world = screenToWorld(e.clientX, e.clientY);
              if (world) {
                const col = Math.floor(world.wx / CELL_SIZE);
                const row = Math.floor(world.wy / CELL_SIZE);

                if (col >= 0 && col < cols && row >= 0 && row < rows) {
                  onSelectPlot?.(col, row);
                }
              }
            }
          }

          function handlePointerLeave() {
            setHoveredPlot(null);
          }

          // Zoom Helpers
          const handleZoomIn = () =>
            setView((v) => ({ ...v, zoom: Math.min(2.6, Number((v.zoom + 0.25).toFixed(2))) }));
          const handleZoomOut = () =>
            setView((v) => ({ ...v, zoom: Math.max(1, Number((v.zoom - 0.25).toFixed(2))) }));
          const handleReset = () => setView({ panX: 0, panY: 0, zoom: 1 });

          return (
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              {/* Thanh toolbar điều khiển nổi trên bản đồ */}
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Phóng to (+)"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 font-bold text-sm"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Thu nhỏ (−)"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 font-bold text-sm"
                >
                  −
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleReset}
                  title="Vừa khung nhìn (100%)"
                  className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {Math.round(view.zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setShowGridLines((v) => !v)}
                  title="Bật/Tắt đường lưới ô"
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${showGridLines
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-500 hover:bg-slate-100'
                    }`}
                >
                  Lưới
                </button>
              </div>

              {/* Vùng hiển thị Canvas chính: KHÔNG CÓ VIỀN ĐỆM DƯ THỪA */}
              <div
                ref={wrapRef}
                className="relative flex w-full items-center justify-center bg-white"
              >
                <canvas
                  ref={canvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  className="block aspect-[16/10] w-full max-h-[640px] cursor-grab touch-none select-none active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                />
              </div>

              {/* Footer bar thông tin trạng thái */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    {mapData?.provinceName ?? 'Đô thị'}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                    {cols} × {rows} ô ({cols * rows} lô đất)
                  </span>
                  {hoveredPlot && (
                    <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      Trỏ chuột: [{hoveredPlot.col}, {hoveredPlot.row}]
                    </span>
                  )}
                </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>Kéo chuột để di chuyển · Dùng nút +/- để phóng to</span>
                    {auctioningTile && (
                      <span className="flex items-center gap-1 font-bold text-rose-600">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                        Đang có phiên đấu giá
                      </span>
                    )}
                  </div>
              </div>
            </div>
          );
        }
