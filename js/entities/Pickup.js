import { Entity } from './Entity.js';

// Подбор: xp / coin / potion / magnet / bomb. Магнитится в pickup_radius.
export class Pickup extends Entity {
  constructor(kind = 'xp', x = 0, y = 0, value = 1) {
    super(x, y, kind === 'xp' ? 8 : 10);
    this.kind = kind;
    this.value = value;
    this.age = 0;
    this.life = kind === 'xp' || kind === 'coin' ? 30 : 20;
    // Сколько миллисекунд длится плавное исчезновение перед end of life.
    // Реальное значение приходит из balance.loot.fade_out_ms через LootSystem.
    this.fadeMs = 7000;
    // разброс при выпадении
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.magnetized = false;
    this.anim = null;
    // спрайт дропа (пока null — рисуется заглушка); анимации нет,
    // случайный кадр выбирается при навешивании спрайта (LootSystem.applySprite)
    this.sprite = null;
    this.sprite_frames = null;
    this.animFrame = 0;
  }

  // Задать вылет из сундука: старт со сдвигом от центра + скорость по углу.
  // Все цифры (радиус/скорость) — из chests.loot_scatter, здесь только применение.
  launchFrom(x, y, angle, speed, radius = 12) {
    this.x = x + Math.cos(angle) * radius;
    this.y = y + Math.sin(angle) * radius;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    return this;
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

  // 1 — предмет полностью виден; плавно уходит к 0 за fadeMs до исчезновения.
  get fadeAlpha() {
    if (!(this.fadeMs > 0)) return 1;
    const fadeSec = this.fadeMs / 1000;
    const remain = this.life - this.age;
    if (remain >= fadeSec) return 1;
    return Math.max(0, Math.min(1, remain / fadeSec));
  }

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
