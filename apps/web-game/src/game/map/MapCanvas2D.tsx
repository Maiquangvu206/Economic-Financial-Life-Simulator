import { useEffect, useRef, useState } from 'react';
import type { MapData, ZoneType } from './MapData';

  export const ZONE_CONFIG: Record<
    ZoneType,
  { bg: string; border: string; nameVi: string; icon: string }
> = {
    commercial: {
      bg: '#E0E7FF',
      border: '#A5B4FC',
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
    const fx = (wx / 1600) * GW;
    const fy = (wy / 1000) * GW;
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

  function createZoneSampler(
    seed: number,
    width: number,
    height: number,
  ): (wx: number, wy: number) => ZoneType {
    const cbdR = 180 + (seed % 160);
    const noise = makeNoise(seed);
    const noise2 = makeNoise(seed ^ 0x9e3779b9);
    return (wx: number, wy: number) => {
      const dx = wx - width / 2;
      const dy = wy - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < cbdR) return 'commercial';
      const n = noise(wx, wy);
      const radial = dist / (Math.min(width, height) / 2);
      if (radial > 0.85 && noise2(wx, wy) > 0.52) return 'port';
      if (n > 0.72) return 'park';
      if (n > 0.6) return 'industrial';
      if (n > 0.52 && radial < 0.65) return 'civic';
      if (n > 0.48 && radial > 0.72) return 'slum';
      return 'residential';
    };
  }

  export interface FillTileInfo {
    wx: number;
    wy: number;
    zone: ZoneType;
    label?: string;
  }

  export interface AuctioningTile {
    x: number;
    y: number;
  }

  export interface MergedCluster {
    cells: Array<{ x: number; y: number }>;
    label: string;
  }

  interface MapCanvas2DProps {
    mapData?: MapData;
    selected?: { col: number; row: number } | null;
    auctioningTile?: AuctioningTile | null;
    mergedClusters?: MergedCluster[];
    onSelectFill?: (tile: FillTileInfo) => void;
    onSelectPlot?: (col: number, row: number) => void;
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
    onSelectFill,
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

    const cols = mapData?.meta.cols ?? 32;
    const rows = mapData?.meta.rows ?? 20;
    const seed = seedFromCode(mapData?.provinceCode ?? '001');

    // Kích thước chuẩn ô đất trong không gian thế giới
    const CELL_SIZE = 48;
    const MARGIN_X = 48;
    const MARGIN_Y = 48;

    const canvasWidth = cols * CELL_SIZE + MARGIN_X * 2;
    const canvasHeight = rows * CELL_SIZE + MARGIN_Y * 2;
    const originX = MARGIN_X;
    const originY = MARGIN_Y;

    const zoneSampler = createZoneSampler(seed, canvasWidth, canvasHeight);

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

          // Nền ngoài cùng
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Áp dụng Ma trận Transform: Pan + Zoom quanh tâm viewport
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.translate(centerX + panX, centerY + panY);
          ctx.scale(zoom, zoom);
          ctx.translate(-centerX, -centerY);

          // 1. Vẽ nền tự nhiên (Vùng đệm cảnh quan bao quanh thành phố)
          const FILL_STEP = 32;
          for (let py = 0; py < canvasHeight; py += FILL_STEP) {
            for (let px = 0; px < canvasWidth; px += FILL_STEP) {
              // Chỉ vẽ vùng ngoài biên thành phố
              const inCity =
                px >= originX &&
                px < originX + cols * CELL_SIZE &&
                py >= originY &&
                py < originY + rows * CELL_SIZE;

              if (!inCity) {
                const z = zoneSampler(px + FILL_STEP / 2, py + FILL_STEP / 2);
                ctx.fillStyle = ZONE_CONFIG[z]?.bg ?? '#FEF3C7';
                ctx.fillRect(px, py, FILL_STEP, FILL_STEP);
                ctx.strokeStyle = 'rgba(0,0,0,0.03)';
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, FILL_STEP, FILL_STEP);
              }
            }
          }

          // 2. Viền phân ranh đô thị
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 2;
          ctx.strokeRect(originX, originY, cols * CELL_SIZE, rows * CELL_SIZE);

          // 3. Chuẩn bị bảng tra cứu Nodes & Properties
          const nodeByCoord = new Map<string, NonNullable<MapData['nodes']>[number]>();
          for (const node of mapData?.nodes ?? []) {
            nodeByCoord.set(`${node.x}-${node.y}`, node);
          }

          const propByCoord = new Map<string, NonNullable<MapData['properties']>[number]>();
          for (const p of mapData?.properties ?? []) {
            const n = (mapData?.nodes ?? []).find((node) => node.id === p.nodeId);
            if (n) propByCoord.set(`${n.x}-${n.y}`, p);
          }

              // 4. Vẽ từng ô đất đô thị
              for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                  const px = originX + c * CELL_SIZE;
                  const py = originY + r * CELL_SIZE;
                  const key = `${c}-${r}`;
                  const node = nodeByCoord.get(key);
                  const prop = propByCoord.get(key);

                  const zone = node?.zoneType ?? zoneSampler(px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                  const zoneInfo = ZONE_CONFIG[zone] ?? ZONE_CONFIG.residential;

                  // Màu nền ô
                  ctx.fillStyle = zoneInfo.bg;
                  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

                  // Đường lưới
                  if (showGridLines) {
                    ctx.strokeStyle = zoneInfo.border;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
                  }

                  // Icon phân khu khi zoom đủ lớn
                  if (zoom >= 0.9) {
                    ctx.save();
                    ctx.font = `${Math.round(14 * Math.min(1.4, zoom))}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.globalAlpha = prop ? 0.35 : 0.65;
                    ctx.fillText(zoneInfo.icon, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                    ctx.restore();
                  }

                  // Có công trình BĐS đã xây dựng
                  if (prop) {
                    if (prop.isMine) {
                      // Đất của chính người chơi: viền xanh ngọc nổi bật
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

              // 5. Khối hợp thửa (Merged Clusters)
              for (const cluster of mergedClusters) {
                if (cluster.cells.length === 0) continue;
                ctx.fillStyle = 'rgba(249, 115, 22, 0.28)';
                  ctx.strokeStyle = '#EA580C';
                  ctx.lineWidth = 2.5;

                  for (const cell of cluster.cells) {
                    const px = originX + cell.x * CELL_SIZE;
                    const py = originY + cell.y * CELL_SIZE;
                    ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                    ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                  }

                  // Nhãn khối hợp thửa
                  const centroid = cluster.cells.reduce(
                    (acc, c) => ({
                      sx: acc.sx + originX + c.x * CELL_SIZE + CELL_SIZE / 2,
                      sy: acc.sy + originY + c.y * CELL_SIZE + CELL_SIZE / 2,
                    }),
                    { sx: 0, sy: 0 },
                  );
                  const lx = centroid.sx / cluster.cells.length;
                  const ly = centroid.sy / cluster.cells.length;

                  ctx.save();
                  ctx.font = 'bold 11px sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.lineWidth = 3;
                  ctx.strokeStyle = '#FFFFFF';
                  ctx.strokeText(cluster.label, lx, ly);
                  ctx.fillStyle = '#EA580C';
                  ctx.fillText(cluster.label, lx, ly);
                  ctx.restore();
                }

                // 6. Ô đang đấu giá (Pulse animation rực rỡ)
                if (auctioningTile) {
                  const px = originX + auctioningTile.x * CELL_SIZE;
                  const py = originY + auctioningTile.y * CELL_SIZE;
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

                // 7. Ô đang hover
                if (hoveredPlot && (hoveredPlot.col !== selected?.col || hoveredPlot.row !== selected?.row)) {
                  const px = originX + hoveredPlot.col * CELL_SIZE;
                  const py = originY + hoveredPlot.row * CELL_SIZE;
                  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                  ctx.strokeStyle = '#3B82F6';
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                }

                // 8. Ô đang chọn (Selected Tile Outline)
                if (selected) {
                  const px = originX + selected.col * CELL_SIZE;
                  const py = originY + selected.row * CELL_SIZE;

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

              // Viewport center
              const centerX = canvas.width / 2;
              const centerY = canvas.height / 2;
              const { panX, panY, zoom } = viewRef.current;

              // Tọa độ tương đối so với canvas
              const cx = (clientX - rect.left) * scaleX;
              const cy = (clientY - rect.top) * scaleY;

              // Đảo ngược ma trận: translate(-centerX, -centerY) -> scale(zoom) -> translate(centerX + panX, centerY + panY)
              const wx = (cx - (centerX + panX)) / zoom + centerX;
              const wy = (cy - (centerY + panY)) / zoom + centerY;

              return { wx, wy };
            }

            // Smooth Zoom on Mouse Wheel
            function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
              e.preventDefault();
              const canvas = canvasRef.current;
              if (!canvas) return;

              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const mouseX = (e.clientX - rect.left) * scaleX;
              const mouseY = (e.clientY - rect.top) * scaleY;

              const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
              setView((v) => {
                const nextZoom = Math.min(2.6, Math.max(0.65, v.zoom * zoomFactor));
                if (nextZoom === v.zoom) return v;

                // Giữ vị trí chuột không bị dịch chuyển khi zoom
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;

                const wx = (mouseX - (centerX + v.panX)) / v.zoom;
                const wy = (mouseY - (centerY + v.panY)) / v.zoom;

                const newPanX = mouseX - centerX - wx * nextZoom;
                const newPanY = mouseY - centerY - wy * nextZoom;

                return {
                  panX: Math.max(-canvasWidth, Math.min(canvasWidth, newPanX)),
                  panY: Math.max(-canvasHeight, Math.min(canvasHeight, newPanY)),
                  zoom: nextZoom,
                };
              });
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
                const col = Math.floor((world.wx - originX) / CELL_SIZE);
                const row = Math.floor((world.wy - originY) / CELL_SIZE);
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
                    panX: Math.max(-canvasWidth * 0.8, Math.min(canvasWidth * 0.8, drag.initialPanX + dx)),
                    panY: Math.max(-canvasHeight * 0.8, Math.min(canvasHeight * 0.8, drag.initialPanY + dy)),
                  }));
                }
              }

              function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
                const drag = dragRef.current;
                dragRef.current = null;

                if (drag && !drag.moved) {
                  const world = screenToWorld(e.clientX, e.clientY);
                  if (world) {
                    const col = Math.floor((world.wx - originX) / CELL_SIZE);
                    const row = Math.floor((world.wy - originY) / CELL_SIZE);

                    if (col >= 0 && col < cols && row >= 0 && row < rows) {
                      onSelectPlot?.(col, row);
                    } else {
                      const z = zoneSampler(world.wx, world.wy);
                      onSelectFill?.({
                        wx: world.wx,
                        wy: world.wy,
                        zone: z,
                        label: 'Vùng đệm ngoại vi thành phố',
                      });
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
                setView((v) => ({ ...v, zoom: Math.max(0.65, Number((v.zoom - 0.25).toFixed(2))) }));
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

                      {/* Vùng hiển thị Canvas chính */}
                      <div
                        ref={wrapRef}
                        className="relative flex w-full items-center justify-center bg-slate-50/50"
                      >
                        <canvas
                          ref={canvasRef}
                          width={canvasWidth}
                          height={canvasHeight}
                          className="block aspect-[16/10] w-full max-h-[640px] cursor-grab touch-none select-none active:cursor-grabbing"
                          onWheel={handleWheel}
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
                            <span>Kéo chuột để di chuyển · Lăn chuột để zoom</span>
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
