import Phaser from 'phaser';

const TILE = 48;
const COLS = 24;
const ROWS = 14;

const ZONE_COLORS: Record<string, number> = {
  road: 0x1e293b,
  residential: 0x14532d,
  commercial: 0x1e3a8a,
  industrial: 0x78350f,
  civic: 0x4c1d95,
  water: 0x0c4a6e,
};

/**
 * Deterministic prototype city. Real map data arrives from the server
 * (map_nodes + roads) and is rendered by this scene, never simulated here.
 */
export class CityScene extends Phaser.Scene {
  constructor() {
    super('CityScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#070b12');
    this.drawGrid();
    this.drawBlocks();
    this.drawLegend();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const col = Math.floor(pointer.worldX / TILE);
      const row = Math.floor(pointer.worldY / TILE);
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
      this.emitPlotSelected(col, row);
    });
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x1e293b, 0.65);
    for (let col = 0; col <= COLS; col += 1) {
      g.lineBetween(col * TILE, 0, col * TILE, ROWS * TILE);
    }
    for (let row = 0; row <= ROWS; row += 1) {
      g.lineBetween(0, row * TILE, COLS * TILE, row * TILE);
    }
  }

  private drawBlocks(): void {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const isRoad = row % 4 === 0 || col % 5 === 0;
        const isWater = col > COLS - 3 && row > ROWS - 5;
        const zone = isWater ? 'water' : isRoad ? 'road' : this.zoneFor(col, row);
        const color = ZONE_COLORS[zone] ?? ZONE_COLORS.residential;

        this.add
          .rectangle(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE - 2, TILE - 2, color)
          .setStrokeStyle(1, 0x0f172a, 0.9);

        if (!isRoad && !isWater && (col + row) % 3 !== 0) {
          const height = 10 + ((col * 7 + row * 13) % 22);
          this.add
            .rectangle(
              col * TILE + TILE / 2,
              row * TILE + TILE / 2 - height / 2,
              TILE - 12,
              height,
              0x94a3b8,
              0.28,
            )
            .setStrokeStyle(1, 0xcbd5e1, 0.15);
        }
      }
    }
  }

  private zoneFor(col: number, row: number): string {
    const centerBias = Math.abs(col - COLS / 2) + Math.abs(row - ROWS / 2);
    if (centerBias < 6) return 'commercial';
    if (centerBias < 12) return 'residential';
    return row < 4 ? 'civic' : 'industrial';
  }

  private drawLegend(): void {
    this.add
      .text(12, ROWS * TILE - 26, 'Bản đồ prototype · dữ liệu thật do map_nodes/roads quyết định', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#64748b',
      })
      .setDepth(10);
  }

  private emitPlotSelected(col: number, row: number): void {
    this.game.events.emit('plot:selected', { col, row, plotId: `plot-${col}-${row}` });
  }
}
