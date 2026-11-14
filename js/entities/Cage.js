import { Entity } from './Entity.js';

// Клетка с питомцем: питомец «живёт» внутри, рандомно гуляет в радиусе
// cages.wander_radius; клетка рисуется поверх. При подходе игрока клетка
// ломается (анимация), после чего открывается окно выбора питомца.
// Все цифры (радиус/скорость/время) — из balance_config.cages.
export class Cage extends Entity {
  constructor(typeCfg, cfg, x, y, petInfo) {
    super(x, y, (cfg && cfg.radius) || 26);
    this.typeCfg = typeCfg;
    this.cfg = cfg || {};
    this.petInfo = petInfo || null;
    this.opened = false;
    this.age = 0;
    this.breakT = 0;
    const ms = this.cfg.break_duration_ms;
    this.breakDur = Math.max(0.001, (ms > 0 ? ms : 500) / 1000);
    this.wanderR = this.cfg.wander_radius > 0 ? this.cfg.wander_radius : 96;
    this.petSpeed = this.cfg.pet_speed >= 0 ? this.cfg.pet_speed : 45;
    this.petX = x;
    this.petY = y;
    this.petFacing = 1;
    this.animT = Math.random() * 4;
    this.wt = 0;
    this.tx = x;
    this.ty = y;
    this._newTarget(Math.random);
  }

  // Новая случайная точка внутри круга wander_radius (равномерно по площади).
  _newTarget(rand = Math.random) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * this.wanderR;
    this.tx = this.x + Math.cos(a) * r;
    this.ty = this.y + Math.sin(a) * r;
    this.wt = 0.6 + rand() * 1.4;
  }

  update(dt, lifetime) {
    this.age += dt;
    this.animT += dt;
    if (this.opened) {
      // ломается: анимация до конца, удаление — в ChestSystem (onCageOpen)
      this.breakT += dt;
      return;
    }
    if (this.age >= lifetime) { this.alive = false; return; }
    this.wt -= dt;
    if (this.wt <= 0) this._newTarget(Math.random);
    const dx = this.tx - this.petX, dy = this.ty - this.petY;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const step = Math.min(d, this.petSpeed * dt);
      this.petX += (dx / d) * step;
      this.petY += (dy / d) * step;
      if (Math.abs(dx) > 0.5) this.petFacing = dx >= 0 ? 1 : -1;
    } else {
      this.wt = Math.min(this.wt, 0.1);
    }
  }

  startBreak() {
    if (this.opened) return false;
    this.opened = true;
    this.breakT = 0;
    return true;
  }

  get breakProgress() {
    return this.opened ? Math.max(0, Math.min(1, this.breakT / this.breakDur)) : 0;
  }

  get done() {
    return this.opened && this.breakT >= this.breakDur;
  }
}
