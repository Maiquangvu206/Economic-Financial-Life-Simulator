import type Phaser from 'phaser';

export abstract class LayerBase {
  protected scene: Phaser.Scene;
  protected container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, name: string) {
    this.scene = scene;
    this.container = this.scene.add.container(0, 0);
    this.container.setName(name);
    this.container.setDepth(0);
  }

  abstract render(data: unknown): void;

  abstract clear(): void;

  setDepth(depth: number): void {
    this.container.setDepth(depth);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy();
  }
}
