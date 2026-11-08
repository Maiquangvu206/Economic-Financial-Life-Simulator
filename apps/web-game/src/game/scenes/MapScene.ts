import Phaser from 'phaser';
import { TerrainLayer } from '../layers/TerrainLayer';
import { RoadLayer } from '../layers/RoadLayer';
import { BuildingLayer } from '../layers/BuildingLayer';
import { DecorationLayer } from '../layers/DecorationLayer';
import { SelectionLayer } from '../layers/SelectionLayer';
import { FireworksLayer } from '../layers/FireworksLayer';
import type { MapData, MapProperty, MapRoad, ZoneType } from '../map/MapData';

const TILE = 48;

export class MapScene extends Phaser.Scene {
  private terrain!: TerrainLayer;
  private roads!: RoadLayer;
  private buildings!: BuildingLayer;
  private decos!: DecorationLayer;
  private selection!: SelectionLayer;
  private fireworks!: FireworksLayer;

  private nodePosMap: Map<string, { x: number; y: number }> = new Map();
  private zoneMap: Map<string, ZoneType> = new Map();

  private cols = 40;
  private rows = 24;

  private mapData: MapData | null = null;

  constructor() {
    super('MapScene');
  }

  init(data: { mapData?: MapData }): void {
    this.nodePosMap.clear();
    this.zoneMap.clear();
    this.mapData = data?.mapData ?? null;

    if (this.mapData) {
      this.cols = this.mapData.meta.cols || this.cols;
      this.rows = this.mapData.meta.rows || this.rows;
      for (const node of this.mapData.nodes) {
        this.nodePosMap.set(node.id, { x: node.x, y: node.y });
        this.zoneMap.set(`${node.x}-${node.y}`, node.zoneType);
      }
    } else {
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = 0; col < this.cols; col += 1) {
          this.zoneMap.set(`${col}-${row}`, this.protoZone(col, row));
        }
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#f8fafc');
    this.cameras.main.setBounds(0, 0, this.cols * TILE, this.rows * TILE);
    this.cameras.main.setZoom(1);

    // Zoom bằng chuột
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _gameObjects: unknown[], deltaX: number, deltaY: number) => {
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
    this.fireworks = new FireworksLayer(this);

    // Lắng nghe sự kiện bật/tắt pháo hoa từ React Store
    this.game.events.on('holiday:fireworks', (enabled: boolean) => {
      if (enabled) {
        this.fireworks.start();
      } else {
        this.fireworks.stop();
      }
    });

    this.renderMap();

    // Input click chọn ô
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const col = Math.floor(world.x / TILE);
      const row = Math.floor(world.y / TILE);
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
      this.selection.select(col, row);
      this.game.events.emit('tile:selected', { col, row });
    });

    // Hover highlight
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const col = Math.floor(world.x / TILE);
      const row = Math.floor(world.y / TILE);
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
        this.selection.hide();
        return;
      }
      this.selection.hoverTile(col, row);
    });
  }

  private renderMap(): void {
    this.terrain.render({
      cols: this.cols,
      rows: this.rows,
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

  // ---------- Dữ liệu bản đồ từ server (hoặc prototype khi chưa có) ----------
  private protoZone(col: number, row: number): ZoneType {
    const centerBias = Math.abs(col - this.cols / 2) + Math.abs(row - this.rows / 2);
    if (col > this.cols - 3 && row > this.rows - 5) return 'water';
    if (centerBias < 5) return 'commercial';
    if (centerBias < 11) return 'residential';
    if (row < 3) return 'civic';
    if (col > this.cols - 5) return 'slum';
    return 'industrial';
  }

  private protoTrees(): { x: number; y: number }[] {
    const trees: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i += 1) {
      trees.push({
        x: Phaser.Math.Between(0, this.cols - 1),
        y: Phaser.Math.Between(0, this.rows - 1),
      });
    }
    return trees;
  }

  private protoLights(): { x: number; y: number }[] {
    const lights: { x: number; y: number }[] = [];
    for (let col = 0; col < this.cols; col += 5) {
      lights.push({ x: col, y: 0 });
      lights.push({ x: col, y: this.rows - 1 });
    }
    for (let row = 0; row < this.rows; row += 4) {
      lights.push({ x: 0, y: row });
      lights.push({ x: this.cols - 1, y: row });
    }
    return lights;
  }

  private getRoads(): MapRoad[] {
    return this.mapData?.roads ?? [];
  }

  private getProperties(): MapProperty[] {
    return this.mapData?.properties ?? [];
  }

  override update(): void {
    this.fireworks?.update();
  }

  /** Cập nhật bản đồ từ server và vẽ lại (dùng khi sau khi mua/bán đất). */
  setMapData(mapData: MapData): void {
    this.nodePosMap.clear();
    this.zoneMap.clear();
    this.mapData = mapData;
    this.cols = mapData.meta.cols || this.cols;
    this.rows = mapData.meta.rows || this.rows;
    for (const node of mapData.nodes) {
      this.nodePosMap.set(node.id, { x: node.x, y: node.y });
      this.zoneMap.set(`${node.x}-${node.y}`, node.zoneType);
    }
    this.cameras.main.setBounds(0, 0, this.cols * TILE, this.rows * TILE);
    this.renderMap();
  }
}
