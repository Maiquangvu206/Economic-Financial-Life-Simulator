import Phaser from 'phaser';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  alpha: number;
  size: number;
  decay: number;
}

export class FireworksLayer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private active = false;
  private timer?: Phaser.Time.TimerEvent;

  private colors = [
    0xff3366, // Đỏ hồng Tết
    0xffcc00, // Vàng kim may mắn
    0x33ff66, // Xanh lộc xuân
    0x00ffff, // Xanh ngọc
    0xff6600, // Cam rực rỡ
    0xffffff, // Trắng lấp lánh
  ];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100); // Nổi trên các layer bản đồ
  }

  public start(): void {
    if (this.active) return;
    this.active = true;

    // Bắn pháo hoa mỗi 600ms - 1.2s
    this.timer = this.scene.time.addEvent({
      delay: 750,
      callback: () => this.launchRocket(),
      loop: true,
    });
  }

  public stop(): void {
    this.active = false;
    this.timer?.destroy();
    this.particles = [];
    this.graphics.clear();
  }

  private launchRocket(): void {
    const x = Phaser.Math.Between(150, 40 * 48 - 150);
    const y = Phaser.Math.Between(100, 24 * 48 - 300);
    this.explode(x, y);
  }

  private explode(x: number, y: number): void {
    const count = Phaser.Math.Between(45, 75);
    const baseColor = Phaser.Utils.Array.GetRandom(this.colors);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.1, 0.1);
      const speed = Phaser.Math.FloatBetween(2, 6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.3 ? baseColor : 0xffffff,
        alpha: 1,
        size: Phaser.Math.FloatBetween(2, 4),
        decay: Phaser.Math.FloatBetween(0.015, 0.03),
      });
    }
  }

  public update(): void {
    this.graphics.clear();
    if (this.particles.length === 0) return;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // Trọng lực nhẹ
      p.vx *= 0.98; // Lực cản không khí
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.graphics.fillStyle(p.color, p.alpha);
      this.graphics.fillCircle(p.x, p.y, p.size);
    }
  }
}

