import Phaser from 'phaser';
import { LayerBase } from './LayerBase';

const TILE = 48;

export class DecorationLayer extends LayerBase {
  private decos: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 'DecorationLayer');
    this.setDepth(3);
  }

  render(data: { trees: { x: number; y: number }[]; lights: { x: number; y: number }[] }): void {
    this.clear();
    const { trees, lights } = data;

    for (const t of trees) {
      const tree = this.scene.add.circle(
        t.x * TILE + TILE / 2,
        t.y * TILE + TILE / 2,
        10,
        0x14532d,
        0.6,
      );
      tree.setStrokeStyle(1, 0x064e3b, 0.8);
      this.container.add(tree);
      this.decos.push(tree);
    }

    for (const l of lights) {
      const light = this.scene.add.circle(
        l.x * TILE + TILE / 2,
        l.y * TILE + TILE / 2 - 16,
        4,
        0xfbbf24,
        0.5,
      );
      light.setStrokeStyle(1, 0xf59e0b, 0.6);
      this.container.add(light);
      this.decos.push(light);
    }
  }

  clear(): void {
    this.decos.forEach((d) => d.destroy());
    this.decos = [];
    this.container.removeAll(true);
  }
}
