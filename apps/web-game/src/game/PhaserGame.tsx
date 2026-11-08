import Phaser from 'phaser';
import { useEffect, useRef, useState } from 'react';
import { MapScene } from './scenes/MapScene';
import type { MapData } from './map/MapData';
import { useGameStore } from '../store/game';

export interface PhaserGameProps {
  mapData?: MapData;
  onSelectPlot?: (col: number, row: number) => void;
}

export function PhaserGame({ mapData, onSelectPlot }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<string | null>(null);
  const activeHoliday = useGameStore((state) => state.activeHoliday);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 40 * 48,
      height: 24 * 48,
      backgroundColor: '#f8fafc',
      pixelArt: false,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [MapScene],
      audio: { noAudio: true },
    });

    gameRef.current = game;

    const scene = game.scene.getScene('MapScene') as MapScene | null;

    // Áp dụng dữ liệu bản đồ từ server khi có (render lại bản đồ thật).
    if (scene && mapData) {
      scene.setMapData(mapData);
    }

    game.events.on('tile:selected', (payload: { col: number; row: number }) => {
      const plotId = `plot-${payload.col}-${payload.row}`;
      setSelectedPlot(plotId);
      onSelectPlot?.(payload.col, payload.row);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [onSelectPlot]);

  // Khi bản đồ từ server thay đổi (sau khi mua/bán đất), vẽ lại scene.
  useEffect(() => {
    const scene = gameRef.current?.scene.getScene('MapScene') as MapScene | undefined;
    if (scene && mapData) {
      scene.setMapData(mapData);
    }
  }, [mapData]);

  // Kích hoạt pháo hoa khi đến ngày Tết / Nghỉ Lễ
  useEffect(() => {
    if (!gameRef.current) return;
    const isHoliday = Boolean(activeHoliday);
    gameRef.current.events.emit('holiday:fireworks', isHoliday);
  }, [activeHoliday]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div ref={containerRef} className="aspect-[40/24] w-full" />
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        <span>Click vào ô đất để xem chi tiết</span>
        <span className="font-mono text-slate-600">{selectedPlot ?? '—'}</span>
      </div>
    </div>
  );
}
