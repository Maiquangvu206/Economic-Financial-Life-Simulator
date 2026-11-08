import type Phaser from 'phaser';
import { LayerBase } from './LayerBase';
import type { MapProperty } from '../map/MapData';

const TILE = 48;

const BUILDING_COLORS: Record<string, number> = {
  apartment: 0xc7d2fe,
  house: 0xa5b4fc,
  office: 0x6ee7b7,
  warehouse: 0xfcd34d,
  port_berth: 0x7dd3fc,
};

export class BuildingLayer extends LayerBase {
  private buildings: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  constructor(scene: Phaser.Scene) {
    super(scene, 'BuildingLayer');
    this.setDepth(2);
  }

  render(data: {
    properties: MapProperty[];
    nodePos: (nodeId: string) => { x: number; y: number } | null;
  }): void {
    this.clear();
    const { properties, nodePos } = data;

    for (const prop of properties) {
      const pos = nodePos(prop.nodeId);
      if (!pos) continue;

      const height = 20 + (prop.valueMinor % 40);
      const color = BUILDING_COLORS[prop.type] ?? 0xc7d2fe;

      const building = this.scene.add
        .rectangle(
          pos.x * TILE + TILE / 2,
          pos.y * TILE + TILE / 2 - height / 2,
          TILE - 14,
          height,
          color,
          0.95,
        )
        .setStrokeStyle(1, 0x94a3b8, 0.8)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.scene.events.emit('property:selected', prop);
        });

      // Cửa sổ phát sáng nhẹ
      const windowRows = Math.max(1, Math.floor(height / 10));
      for (let wr = 0; wr < windowRows; wr += 1) {
        const wy = pos.y * TILE + TILE / 2 - height / 2 + 6 + wr * 10;
        const wx = pos.x * TILE + TILE / 2 - (TILE - 14) / 2 + 6;
        const win = this.scene.add.rectangle(
          wx,
          wy,
          4,
          4,
          0xf59e0b,
          Math.random() > 0.7 ? 0.95 : 0.35,
        );
        win.setDepth(3);
        this.container.add(win);
      }

      this.container.add(building);
      this.buildings.set(prop.id, building);
    }
  }

  clear(): void {
    this.buildings.forEach((b) => b.destroy());
    this.buildings.clear();
    this.container.removeAll(true);
  }

  setOwnerHighlight(propId: string, ownerId: string | null): void {
    const b = this.buildings.get(propId);
    if (!b) return;
    b.setAlpha(ownerId ? 1 : 0.65);
    b.setStrokeStyle(1, ownerId ? 0x10b981 : 0x94a3b8, ownerId ? 1 : 0.7);
  }
}
