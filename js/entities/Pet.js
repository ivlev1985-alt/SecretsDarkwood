import { Entity } from './Entity.js';

// Питомец: летает, подбирает ОДИН дроп (монета/XP) в радиусе сбора и несёт хозяину.
// Монстры питомца не бьют (коллизий с ним нет ни у кого).
export class Pet extends Entity {
  constructor(x, y, radius, speed) {
    super(x, y, 10);
    this.radius = radius; // радиус поиска/сбора
    this.speed = speed || 260;
    this.mode = 'follow'; // follow | fetch | deliver
    this.target = null; // Pickup
    this.carrying = null; // { kind, value }
    this.bob = Math.random() * 6;
    this.anim = null;
  }

  update(dt, px, py, pickups, grabR, deliverR) {
    this.bob += dt * 6;
    let tx = px, ty = py - 40; // точка следования над хозяином
    if (this.mode === 'follow') {
      const best = this._nearest(pickups, px, py);
      if (best) { this.mode = 'fetch'; this.target = best; }
    } else if (this.mode === 'fetch') {
      if (!this.target || !this.target.alive) { this.mode = 'follow'; this.target = null; }
      else { tx = this.target.x; ty = this.target.y; }
    } else if (this.mode === 'deliver') {
      tx = px; ty = py;
    }
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const sp = this.mode === 'follow' && d < 8 ? 0 : this.speed * (this.mode === 'fetch' ? 1.15 : 1);
    if (d > 1 && sp > 0) {
      const step = Math.min(d, sp * dt);
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    this.facing = dx >= 0 ? 1 : -1;
    // захват
    if (this.mode === 'fetch' && this.target && this.target.alive) {
      const gx = this.target.x - this.x, gy = this.target.y - this.y;
      if (gx * gx + gy * gy < grabR * grabR) {
        this.carrying = { kind: this.target.kind, value: this.target.value };
        this.target.alive = false;
        this.target = null;
        this.mode = 'deliver';
      }
    }
    // доставка
    if (this.mode === 'deliver') {
      const hx = px - this.x, hy = py - this.y;
      if (hx * hx + hy * hy < deliverR * deliverR) {
        const c = this.carrying;
        this.carrying = null;
        this.mode = 'follow';
        return c; // Game засчитывает как подбор
      }
    }
    return null;
  }

  _nearest(pickups, px, py) {
    let best = null, bd = this.radius * this.radius;
    for (const p of pickups) {
      if (!p.alive || (p.kind !== 'coin' && p.kind !== 'xp')) continue;
      const dx = p.x - px, dy = p.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best;
  }
}
