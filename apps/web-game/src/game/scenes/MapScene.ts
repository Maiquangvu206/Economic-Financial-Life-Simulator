import Phaser from 'phaser';
import { TerrainLayer } from '../layers/TerrainLayer';
import { RoadLayer } from '../layers/RoadLayer';
import { BuildingLayer } from '../layers/BuildingLayer';
import { DecorationLayer } from '../layers/DecorationLayer';
import { SelectionLayer } from '../layers/SelectionLayer';
import { MapData, ZoneType } from '../map/MapData';

const TILE = 48;
const COLS = 40;
const ROWS = 24;

export class MapScene extends Phaser.Scene {
  private terrain!: TerrainLayer;
  private roads!: RoadLayer;
  private buildings!: BuildingLayer;
  private decos!: DecorationLayer;
  private selection!: SelectionLayer;

  private nodePosMap: Map<string, { x: number; y: number }> = new Map();
  private zoneMap: Map<string, ZoneType> = new Map();

  constructor() {
    super('MapScene');
  }

  init(data: { mapData?: MapData }): void {
    this.nodePosMap.clear();
    this.zoneMap.clear();

    if (data?.mapData) {
      for (const node of data.mapData.nodes) {
        this.nodePosMap.set(node.id, { x: node.x, y: node.y });
        this.zoneMap.set(`${node.x}-${node.y}`, node.zoneType);
      }
    } else {
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const zone = this.protoZone(col, row);
          this.zoneMap.set(`${col}-${row}`, zone);
        }
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#020617');
    this.cameras.main.setBounds(0, 0, COLS * TILE, ROWS * TILE);
    this.cameras.main.setZoom(1);

    // Zoom bằng chuột
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _gameObjects: any[], deltaX: number, deltaY: number) => {
        const zoom = this.cameras.main.zoom;
        const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.5, 2);
        this.cameras.main.setZoom(newZoom);
      },
    );

    // Pan bằng phím mũi tên
    this.input.keyboard?.on('keydown-UP', () => {
      this.cameras.main.scrollY -= 20;
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      this.cameras.main.scrollY += 20;
    });
    this.input.keyboard?.on('keydown-LEFT', () => {
      this.cameras.main.scrollX -= 20;
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      this.cameras.main.scrollX += 20;
    });

    // Khởi tạo layers
    this.terrain = new TerrainLayer(this);
    this.roads = new RoadLayer(this);
    this.buildings = new BuildingLayer(this);
    this.decos = new DecorationLayer(this);
    this.selection = new SelectionLayer(this);

    this.renderMap();

    // Input click chọn ô
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const col = Math.floor(world.x / TILE);
      const row = Math.floor(world.y / TILE);
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
      this.selection.select(col, row);
    });

    // Hover highlight
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const col = Math.floor(world.x / TILE);
      const row = Math.floor(world.y / TILE);
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) {
        this.selection.hide();
        return;
      }
      this.selection.hoverTile(col, row);
    });
  }

  private renderMap(): void {
    const cols = COLS;
    const rows = ROWS;

    this.terrain.render({
      cols,
      rows,
      zoneAt: (col: number, row: number) => this.zoneMap.get(`${col}-${row}`) ?? 'residential',
    });

    this.decos.render({
      trees: this.protoTrees(),
      lights: this.protoLights(),
    });

    this.roads.render({
      roads: this.getRoads(),
      nodePos: (nodeId: string) => this.nodePosMap.get(nodeId) ?? null,
    });

    this.buildings.render({
      properties: this.getProperties(),
      nodePos: (nodeId: string) => this.nodePosMap.get(nodeId) ?? null,
    });
  }

  // ---------- Prototype helpers (thay bằng server data khi có) ----------
  private protoZone(col: number, row: number): ZoneType {
    const centerBias = Math.abs(col - COLS / 2) + Math.abs(row - ROWS / 2);
    if (col > COLS - 3 && row > ROWS - 5) return 'water';
    if (centerBias < 5) return 'commercial';
    if (centerBias < 11) return 'residential';
    if (row < 3) return 'civic';
    if (col > COLS - 5) return 'slum';
    return 'industrial';
  }

  private protoTrees(): { x: number; y: number }[] {
    const trees: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i += 1) {
      trees.push({
        x: Phaser.Math.Between(0, COLS - 1),
        y: Phaser.Math.Between(0, ROWS - 1),
      });
    }
    return trees;
  }

  private protoLights(): { x: number; y: number }[] {
    const lights: { x: number; y: number }[] = [];
    for (let col = 0; col < COLS; col += 5) {
      lights.push({ x: col, y: 0 });
      lights.push({ x: col, y: ROWS - 1 });
    }
    for (let row = 0; row < ROWS; row += 4) {
      lights.push({ x: 0, y: row });
      lights.push({ x: COLS - 1, y: row });
    }
    return lights;
  }

  private getRoads(): any[] {
    return [];
  }

  private getProperties(): any[] {
    return [];
  }

  setMapData(mapData: MapData): void {
    this.nodePosMap.clear();
    this.zoneMap.clear();
    for (const node of mapData.nodes) {
      this.nodePosMap.set(node.id, { x: node.x, y: node.y });
      this.zoneMap.set(`${node.x}-${node.y}`, node.zoneType);
    }
    this.renderMap();
  }
}
