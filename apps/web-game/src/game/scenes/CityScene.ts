import Phaser from 'phaser';

const TILE = 48;
const COLS = 24;
const ROWS = 14;

const ZONE_COLORS: Record<string, number> = {
  road: 0x1e293b,
  residential: 0x064e3b,
  commercial: 0x1e3a8a,
  industrial: 0x78350f,
  civic: 0x581c87,
  water: 0x0c4a6e,
  slum: 0x334155,
};

/**
 * Thành phố 2D top-down prototype.
 * Dữ liệu bản đồ thật (map_nodes, roads, properties) sẽ từ server ánh xạ vào
 * các ô này; Phaser chỉ điều khiển render và input, không mô phỏng kinh tế.
 */
export class CityScene extends Phaser.Scene {
  private plotGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super('CityScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#020617');
    this.drawGrid();
    this.drawZones();
    this.drawBuildings();
    this.drawWater();
    this.drawNeonStreets();
    this.drawLegend();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const col = Math.floor(pointer.worldX / TILE);
      const row = Math.floor(pointer.worldY / TILE);
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
      this.game.events.emit('plot:selected', {
        col,
        row,
        plotId: `plot-${col}-${row}`,
      });
    });
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x1e293b, 0.5);
    for (let col = 0; col <= COLS; col += 1) {
      g.lineBetween(col * TILE, 0, col * TILE, ROWS * TILE);
    }
    for (let row = 0; row <= ROWS; row += 1) {
      g.lineBetween(0, row * TILE, COLS * TILE, row * TILE);
    }
  }

  private drawZones(): void {
    this.plotGraphics = this.add.graphics();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const zone = this.zoneFor(col, row);

        this.plotGraphics
          .fillStyle((ZONE_COLORS[zone] ?? ZONE_COLORS.residential) as number, 0.18)
          .fillRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2);

        // Zone label (subtle)
        if ((col + row) % 5 === 0) {
          this.add
            .text(col * TILE + 6, row * TILE + 6, zone.toUpperCase(), {
              fontFamily: 'monospace',
              fontSize: '8px',
              color: '#64748b',
            })
            .setDepth(1);
        }
      }
    }
  }

  private drawBuildings(): void {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const isRoad = row % 4 === 0 || col % 5 === 0;
        if (isRoad || (col + row) % 3 === 0) continue;

        const height = 14 + ((col * 11 + row * 17) % 30);
        const bx = col * TILE + TILE / 2;
        const by = row * TILE + TILE / 2;

        // Building body
        this.add
          .rectangle(bx, by - height / 2, TILE - 14, height, 0x94a3b8, 0.22)
          .setStrokeStyle(1, 0x334155, 0.3);

        // Windows (glow dots)
        const windowRows = Math.max(1, Math.floor(height / 10));
        for (let wr = 0; wr < windowRows; wr += 1) {
          const wy = by - height / 2 + 6 + wr * 10;
          if (wr % 2 === 0) {
            this.add
              .rectangle(
                bx - (TILE - 14) / 2 + 6,
                wy,
                4,
                4,
                0xfbbf24,
                Math.random() > 0.7 ? 1 : 0.35,
              )
              .setDepth(2);
          }
        }
      }
    }
  }

  private drawWater(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0c4a6e, 0.25);
    for (let col = COLS - 3; col < COLS; col += 1) {
      for (let row = ROWS - 5; row < ROWS; row += 1) {
        g.fillRect(col * TILE + 2, row * TILE + 2, TILE - 4, TILE - 4);
      }
    }
  }

  private drawNeonStreets(): void {
    const g = this.add.graphics();
    g.lineStyle(2, 0x10b981, 0.15);
    for (let col = 0; col <= COLS; col += 5) {
      g.lineBetween(col * TILE, 0, col * TILE, ROWS * TILE);
    }
    for (let row = 0; row <= ROWS; row += 4) {
      g.lineBetween(0, row * TILE, COLS * TILE, row * TILE);
    }
  }

  private drawLegend(): void {
    this.add
      .text(12, ROWS * TILE - 28, 'Thành phố prototype · map_nodes/roads từ server', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#64748b',
      })
      .setDepth(10);
  }

  private zoneFor(col: number, row: number): string {
    const centerBias = Math.abs(col - COLS / 2) + Math.abs(row - ROWS / 2);
    const isWater = col > COLS - 3 && row > ROWS - 5;
    if (isWater) return 'water';
    if (centerBias < 5) return 'commercial';
    if (centerBias < 11) return 'residential';
    if (row < 3) return 'civic';
    if (col > COLS - 5) return 'slum';
    return 'industrial';
  }
}
