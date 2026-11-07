import Phaser from 'phaser';
import { useEffect, useRef, useState } from 'react';
import { CityScene } from './scenes/CityScene';

export interface PhaserGameProps {
  onSelectPlot?: (plotId: string) => void;
}

export function PhaserGame({ onSelectPlot }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 24 * 48,
      height: 14 * 48,
      backgroundColor: '#070b12',
      pixelArt: false,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [CityScene],
      audio: { noAudio: true },
    });

    gameRef.current = game;
    game.events.on('plot:selected', (payload: { plotId: string }) => {
      setSelectedPlot(payload.plotId);
      onSelectPlot?.(payload.plotId);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [onSelectPlot]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-surface-900">
      <div ref={containerRef} className="aspect-[24/14] w-full" />
      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
        <span>Click vào ô đất để xem chi tiết</span>
        <span className="font-mono text-slate-400">{selectedPlot ?? '—'}</span>
      </div>
    </div>
  );
}
