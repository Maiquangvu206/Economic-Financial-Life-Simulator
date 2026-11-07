import Phaser from 'phaser';
import { LayerBase } from './LayerBase';
import { MapProperty } from '../map/MapData';

const TILE = 48;

const BUILDING_COLORS: Record<string, number> = {
  apartment: 0x94a3b8,
  house: 0x6366f1,
  office: 0x10b981,
  warehouse: 0xf59e0b,
  port_berth: 0x0c4a6e,
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
      const color = BUILDING_COLORS[prop.type] ?? 0x94a3b8;

      const building = this.scene.add
        .rectangle(
          pos.x * TILE + TILE / 2,
          pos.y * TILE + TILE / 2 - height / 2,
          TILE - 14,
          height,
          color,
          0.35,
        )
        .setStrokeStyle(1, 0x334155, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.scene.events.emit('property:selected', prop);
        });

      // Cửa sổ glowing dots
      const windowRows = Math.max(1, Math.floor(height / 10));
      for (let wr = 0; wr < windowRows; wr += 1) {
        const wy = pos.y * TILE + TILE / 2 - height / 2 + 6 + wr * 10;
        const wx = pos.x * TILE + TILE / 2 - (TILE - 14) / 2 + 6;
        const win = this.scene.add.rectangle(
          wx,
          wy,
          4,
          4,
          0xfbbf24,
          Math.random() > 0.7 ? 1 : 0.35,
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
    b.setAlpha(ownerId ? 0.7 : 0.25);
    b.setStrokeStyle(1, ownerId ? 0x10b981 : 0x334155, ownerId ? 0.8 : 0.5);
  }
}
