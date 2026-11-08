import type Phaser from 'phaser';
import { LayerBase } from './LayerBase';
import type { MapRoad } from '../map/MapData';

const TILE = 48;

const ROAD_STYLE: Record<string, { color: number; alpha: number; lineWidth: number }> = {
  arterial: { color: 0x34d399, alpha: 0.9, lineWidth: 6 },
  collector: { color: 0x94a3b8, alpha: 0.9, lineWidth: 4 },
  local: { color: 0xcbd5e1, alpha: 1, lineWidth: 3 },
};

export class RoadLayer extends LayerBase {
  private roads: Phaser.GameObjects.Line[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 'RoadLayer');
    this.setDepth(1);
  }

  render(data: {
    roads: MapRoad[];
    nodePos: (nodeId: string) => { x: number; y: number } | null;
  }): void {
    this.clear();
    const { roads, nodePos } = data;

    for (const road of roads) {
      const from = nodePos(road.fromNodeId);
      const to = nodePos(road.toNodeId);
      if (!from || !to) continue;

      const style = ROAD_STYLE[road.type] ?? ROAD_STYLE.local;
      if (!style) continue;

      const line = this.scene.add
        .line(
          from.x * TILE + TILE / 2,
          from.y * TILE + TILE / 2,
          to.x * TILE + TILE / 2,
          to.y * TILE + TILE / 2,
          0,
          0,
          style.color,
        )
        .setOrigin(0.5, 0.5)
        .setLineWidth(style.lineWidth)
        .setAlpha(style.alpha);

      this.container.add(line);
      this.roads.push(line);
    }
  }

  clear(): void {
    this.roads.forEach((road) => road.destroy());
    this.roads = [];
    this.container.removeAll(true);
  }
}
