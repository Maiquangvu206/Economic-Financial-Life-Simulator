import type Phaser from 'phaser';
import { LayerBase } from './LayerBase';
import type { MapRoad } from '../map/MapData';

const TILE = 48;

const ROAD_STYLE: Record<string, { color: number; alpha: number }> = {
  highway: { color: 0xfbbf24, alpha: 0.95 },
  arterial: { color: 0x34d399, alpha: 0.9 },
  local: { color: 0xcbd5e1, alpha: 0.85 },
  bridge: { color: 0xfdba74, alpha: 0.9 },
};

export class RoadLayer extends LayerBase {
  private roads: Phaser.GameObjects.Rectangle[] = [];

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
      if (road.roadType === 'none') continue;
      const pos = nodePos(road.nodeId);
      if (!pos) continue;

      const style = ROAD_STYLE[road.roadType];
      if (!style) continue;

      const roadTile = this.scene.add
        .rectangle(
          pos.x * TILE + TILE / 2,
          pos.y * TILE + TILE / 2,
          TILE - 4,
          TILE - 4,
          style.color,
        )
        .setOrigin(0.5, 0.5)
        .setAlpha(style.alpha);

      this.container.add(roadTile);
      this.roads.push(roadTile);
    }
  }

  clear(): void {
    this.roads.forEach((road) => road.destroy());
    this.roads = [];
    this.container.removeAll(true);
  }
}
