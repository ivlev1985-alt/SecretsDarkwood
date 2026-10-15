// Крошечный CPU-пул живых частиц (Фаза 2): угольки на горящих, снежинки на
// замедленных. Мобильно-безопасно: фиксированный предвыделенный пул (ноль
// аллокаций в кадре), квадраты вместо кругов, один batch с 'lighter'.
// ВСЕ цифры (частоты, скорости, цвета, бюджет) — из balance.status_effects.
export class ParticleSystem {
  constructor(budget = 300) {
    this.budget = Math.max(16, budget | 0);
    this.pool = [];
    for (let i = 0; i < this.budget; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, grav: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });
    }
    this.cursor = 0;
    this.count = 0;
  }

  get aliveCount() { return this.count; }

  // Одна частица в точке (x, y) ± radius. Скорость — из диапазонов спеки
  // (vx/vy: [min, max] px/s), цвет — случайный из spec.colors.
  emit(x, y, radius, spec, rand = Math.random) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.budget;
    if (!p.alive) this.count++;
    const vx = spec.vx || [0, 0], vy = spec.vy || [0, 0];
    const a = rand() * Math.PI * 2, r = rand() * (radius || 0);
    p.alive = true;
    p.x = x + Math.cos(a) * r; p.y = y + Math.sin(a) * r;
    p.vx = vx[0] + rand() * (vx[1] - vx[0]);
    p.vy = vy[0] + rand() * (vy[1] - vy[0]);
    p.grav = spec.gravity || 0;
    p.life = 0;
    p.maxLife = (spec.life_ms || 500) / 1000;
    p.size = spec.size || 3;
    const colors = (spec.colors && spec.colors.length) ? spec.colors : ['#ffffff'];
    p.color = colors[(rand() * colors.length) | 0];
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; this.count--; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    if (this.count <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = 1 - p.life / p.maxLife;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.count = 0;
    this.cursor = 0;
  }
}
