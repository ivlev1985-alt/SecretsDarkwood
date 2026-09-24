import { Entity } from './Entity.js';

// Подбор: xp / coin / potion / magnet / bomb. Магнитится в pickup_radius.
export class Pickup extends Entity {
  constructor(kind = 'xp', x = 0, y = 0, value = 1) {
    super(x, y, kind === 'xp' ? 8 : 10);
    this.kind = kind;
    this.value = value;
    this.age = 0;
    this.life = kind === 'xp' || kind === 'coin' ? 30 : 20;
    // разброс при выпадении
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.magnetized = false;
    this.anim = null;
  }

  update(dt, px, py, pickupRadius) {
    this.age += dt;
    // трение разброса
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
    // магнит
    const dx = px - this.x, dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (d < pickupRadius || this.magnetized) {
      const pull = this.magnetized ? 900 : 500;
      if (d > 1) { this.x += (dx / d) * pull * dt; this.y += (dy / d) * pull * dt; }
    }
    if (this.age >= this.life) this.alive = false;
  }

  get collected() { return !this.alive; }

  color() {
    switch (this.kind) {
      case 'xp': return '#4da6ff';
      case 'coin': return '#ffd34d';
      case 'potion': return '#ff5a5a';
      case 'magnet': return '#ff4dff';
      case 'bomb': return '#ff8800';
      default: return '#fff';
    }
  }
}
