import type Phaser from 'phaser';
import { LayerBase } from './LayerBase';

const TILE = 48;

export class SelectionLayer extends LayerBase {
  private selector?: Phaser.GameObjects.Rectangle;
  private hover?: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 'SelectionLayer');
    this.setDepth(4);

    this.selector = this.scene.add
      .rectangle(0, 0, TILE - 4, TILE - 4, 0x10b981, 0)
      .setStrokeStyle(2, 0x10b981, 0.8)
      .setVisible(false);
    this.container.add(this.selector);

    this.hover = this.scene.add
      .rectangle(0, 0, TILE - 4, TILE - 4, 0x64748b, 0.15)
      .setStrokeStyle(1, 0x94a3b8, 0.5)
      .setVisible(false);
    this.container.add(this.hover);
  }

  render(): void {
    // Selection layer không render gì tĩnh, chỉ hiển thị khi chọn/höver
  }

  clear(): void {
    this.hide();
  }

  select(col: number, row: number): void {
    if (!this.selector) return;
    this.selector.setPosition(col * TILE + TILE / 2, row * TILE + TILE / 2);
    this.selector.setVisible(true);
    this.scene.events.emit('tile:selected', { col, row });
  }

  hide(): void {
    if (this.selector) this.selector.setVisible(false);
    if (this.hover) this.hover.setVisible(false);
  }

  hoverTile(col: number, row: number): void {
    if (!this.hover) return;
    this.hover.setPosition(col * TILE + TILE / 2, row * TILE + TILE / 2);
    this.hover.setVisible(true);
  }
}
