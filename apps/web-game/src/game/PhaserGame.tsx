import Phaser from 'phaser';
import { useEffect, useRef, useState } from 'react';
import { MapScene } from './scenes/MapScene';
import { useGameStore } from '../store/game';

export interface PhaserGameProps {
  onSelectPlot?: (plotId: string) => void;
}

export function PhaserGame({ onSelectPlot }: PhaserGameProps) {
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

    game.events.on('tile:selected', (payload: { col: number; row: number }) => {
      const plotId = `plot-${payload.col}-${payload.row}`;
      setSelectedPlot(plotId);
      onSelectPlot?.(plotId);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [onSelectPlot]);

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
