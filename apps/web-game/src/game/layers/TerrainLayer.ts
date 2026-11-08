import type Phaser from 'phaser';
import { LayerBase } from './LayerBase';
import type { ZoneType } from '../map/MapData';

const TILE = 48;

/** Bảng màu pastel: bản đồ sáng, dễ nhìn, vẫn phân biệt rõ từng vùng. */
const ZONE_COLORS: Record<ZoneType, number> = {
  residential: 0xd1fae5,
  commercial: 0xdbeafe,
  industrial: 0xfef3c7,
  civic: 0xede9fe,
  port: 0xcffafe,
  slum: 0xe2e8f0,
  water: 0xbae6fd,
  park: 0xccfbf1,
};

export class TerrainLayer extends LayerBase {
  private tiles: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  constructor(scene: Phaser.Scene) {
    super(scene, 'TerrainLayer');
    this.setDepth(0);
  }

  render(data: {
    cols: number;
    rows: number;
    zoneAt: (col: number, row: number) => ZoneType;
  }): void {
    this.clear();
    const { cols, rows, zoneAt } = data;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const zone = zoneAt(col, row);
        const color = ZONE_COLORS[zone] ?? ZONE_COLORS.residential;

        const tile = this.scene.add
          .rectangle(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE - 2, TILE - 2, color, 0.9)
          .setStrokeStyle(1, 0xffffff, 0.9);

        this.container.add(tile);
        this.tiles.set(`${col}-${row}`, tile);
      }
    }
  }

  clear(): void {
    this.tiles.forEach((tile) => tile.destroy());
    this.tiles.clear();
    this.container.removeAll(true);
  }

  highlightZone(col: number, row: number, zone: ZoneType): void {
    const key = `${col}-${row}`;
    const tile = this.tiles.get(key);
    if (tile) {
      tile.setFillStyle(ZONE_COLORS[zone] ?? ZONE_COLORS.residential, 1);
    }
  }
}
