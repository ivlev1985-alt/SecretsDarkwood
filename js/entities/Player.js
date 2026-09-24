import { Entity } from './Entity.js';

// Игрок: статы из balance.player (+ бонусы магазина на Этапе 5).
export class Player extends Entity {
  constructor(cfg, x = 0, y = 0) {
    super(x, y, cfg.collision_radius || 16);
    this.cfg = cfg;
    this.maxHp = cfg.base_hp;
    this.hp = this.maxHp;
    this.speed = cfg.base_speed;
    this.pickupRadius = cfg.pickup_radius;
    this.damageMul = cfg.damage_multiplier ?? 1;
    this.attackSpeedMul = cfg.attack_speed_multiplier ?? 1;
    this.pickupMul = cfg.pickup_radius_multiplier ?? 1;
    this.critChance = cfg.crit_chance ?? 0.05;
    this.critMul = cfg.crit_multiplier ?? 2;
    this.regen = cfg.hp_regen_per_sec ?? 0;
    this.xpMul = cfg.xp_multiplier ?? 1;
    this.invT = 0; // неуязвимость после урона
    this.level = 1;
    this.anim = null; // задаёт Game.attachHeroAnim после загрузки hero.frames
  }

  attachHeroAnim(animator) { this.anim = animator; }

  get invincible() { return this.invT > 0; }

  update(dt, moveVec) {
    this.x += moveVec.x * this.speed * dt;
    this.y += moveVec.y * this.speed * dt;
    if (Math.abs(moveVec.x) > 0.05) this.facing = moveVec.x > 0 ? 1 : -1;
    const moving = Math.hypot(moveVec.x, moveVec.y) > 0.15;
    if (this.anim) {
      this.anim.setAnimation(moving ? 'run' : 'idle');
      this.anim.update(dt);
    }
    if (this.invT > 0) this.invT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.regen > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }

  // Возвращает фактически нанесённый урон (0 если неуязвим/ мёртв)
  takeContactDamage(amount) {
    if (this.invT > 0 || this.hp <= 0) return 0;
    this.hp -= amount;
    this.invT = (this.cfg.invincibility_ms || 500) / 1000;
    this.hitFlash = 0.25;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return amount;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const h = Math.min(amount, this.maxHp - this.hp);
    this.hp += h;
    return h;
  }

  // Крит-бросок: чистая функция для тестов
  static rollCrit(chance, mul, base, rand = Math.random) {
    const crit = rand() < chance;
    return { damage: base * (crit ? mul : 1), crit };
  }
}
