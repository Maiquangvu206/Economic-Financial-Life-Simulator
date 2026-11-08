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

/** Độ cao giả-3D theo vùng + jitter xác định theo ô (relief địa giới). */
const ZONE_HEIGHT: Record<ZoneType, number> = {
  commercial: 30,
  civic: 22,
  residential: 15,
  industrial: 11,
  park: 10,
  slum: 8,
  port: 4,
  water: 0,
};

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

function jitter(col: number, row: number): number {
  let h = (col * 374761393 + row * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Render bản đồ dạng relief giả-3D: mỗi ô là một khối nổi
 * (mặt trên sáng + cạnh sườn tối + bóng đổ) mô phỏng địa hình/địa giới.
 */
export class TerrainLayer extends LayerBase {
  private tiles: Map<string, Phaser.GameObjects.Container> = new Map();

  constructor(scene: Phaser.Scene) {
    super(scene, 'TerrainLayer');
    this.setDepth(0);
  }

  render(data: {
    cols: number;
    rows: number;
    zoneAt: (col: number, row: number) => ZoneType;
    label?: string;
  }): void {
    this.clear();
    const { cols, rows, zoneAt, label } = data;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const zone = zoneAt(col, row);
        const color = ZONE_COLORS[zone] ?? ZONE_COLORS.residential;
        const height = (ZONE_HEIGHT[zone] ?? 6) + jitter(col, row) * 5;

        const cy = row * TILE + TILE / 2;
        const cx = col * TILE + TILE / 2;
        const w = TILE - 3;
        const h = TILE - 3;

        const container = this.scene.add.container(0, 0);
        // Bóng đổ lệch phải-dưới
        const shadow = this.scene.add.ellipse(cx + 2, cy + 2 + height, w, h * 0.55, 0x0f172a, 0.08);
        // Sườn khối (tối hơn mặt trên)
        const side = this.scene.add.rectangle(cx, cy + height / 2, w, height, shade(color, 0.55));
        // Mặt trên (sáng hơn)
        const top = this.scene.add
          .rectangle(cx, cy, w, h, shade(color, 1.08), 0.95)
          .setStrokeStyle(1, 0xffffff, 0.9);

        container.add([shadow, side, top]);
        this.container.add(container);
        this.tiles.set(`${col}-${row}`, container);
      }
    }

    if (label) {
      const text = this.scene.add
        .text(16, 14, label, {
          fontFamily: 'Outfit, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#065f46',
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: { x: 10, y: 6 },
        })
        .setDepth(10)
        .setScrollFactor(0);
      this.container.add(text);
    }
  }

  clear(): void {
    this.tiles.clear();
    this.container.removeAll(true);
  }

  highlightZone(col: number, row: number, zone: ZoneType): void {
    const key = `${col}-${row}`;
    const container = this.tiles.get(key);
    if (container) {
      const top = container.getAt(2) as Phaser.GameObjects.Rectangle | undefined;
      if (top) top.setFillStyle(ZONE_COLORS[zone] ?? ZONE_COLORS.residential, 1);
    }
  }
}
