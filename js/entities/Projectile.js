import { Entity } from './Entity.js';

// Снаряд: friendly=true — игрока, false — врага.
export class Projectile extends Entity {
  constructor() {
    super(0, 0, 6);
    this.active = false;
    this.friendly = true;
    this.damage = 0;
    this.crit = false;
    this.pierce = 0;
    this.hitIds = null; // Set Enemy для pierce
    this.life = 0;
    this.maxLife = 1;
    this.explosionR = 0;
    this.explosionDmg = 0;
    // статусы с оружия (все цифры — из skills_config): slow {factor, duration}, burn {dps, duration}
    this.slowFactor = 1;
    this.slowDuration = 0; // сек
    this.burnDps = 0;
    this.burnDuration = 0; // сек
    // цепная молния: радиус прыжка к следующей случайной цели + текущая цель-замок
    this.chainRange = 0;
    this.chainTarget = null;
    this.weaponId = '';
    this.spritePath = '';
  }

  fire(o) {
    this.active = true; this.alive = true;
    this.x = o.x; this.y = o.y;
    this.ox = o.x; this.oy = o.y; // точка выстрела (для эффектов типа молнии)
    this.lastX = null; this.lastY = null; // последняя поражённая цель (цепочка)
    this.vx = o.vx; this.vy = o.vy;
    this.damage = o.damage; this.crit = !!o.crit;
    this.pierce = o.pierce || 0;
    this.hitIds = new Set();
    this.radius = o.radius || 6;
    this.life = 0; this.maxLife = o.life || 1;
    this.explosionR = o.explosionR || 0;
    this.explosionDmg = o.explosionDmg || 0;
    this.slowFactor = o.slowFactor ?? 1;
    this.slowDuration = o.slowDuration || 0;
    this.burnDps = o.burnDps || 0;
    this.burnDuration = o.burnDuration || 0;
    this.chainRange = o.chainRange || 0;
    this.chainTarget = o.chainTarget || null;
    this.weaponId = o.weaponId || '';
    this.friendly = o.friendly !== false;
    this.spritePath = o.spritePath || '';
    this.hitFlash = 0;
    this.exploding = false;
    if (o.frames && o.animName) this.makeAnim(o.frames, o.animName);
    else this.anim = null;
  }

  // Переход на анимацию взрыва (второй ряд спрайт-листа) при попадании
  explode() {
    if (this.anim && this.anim.frames && this.anim.frames.animations.impact) {
      this.exploding = true;
      this.vx = 0;
      this.vy = 0;
      this.anim.setAnimation('impact');
      this.life = 0;
      this.maxLife = this.anim.frames.animations.impact.frames / this.anim.frames.animations.impact.fps;
    } else {
      this.active = false; this.alive = false;
    }
  }

  update(dt) {
    if (this.exploding) {
      if (this.anim) this.anim.update(dt);
      this.life += dt;
      if (this.life >= this.maxLife) { this.active = false; this.alive = false; }
      return;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life += dt;
    if (this.anim) this.anim.update(dt);
    if (this.life >= this.maxLife) { this.active = false; this.alive = false; }
  }

  get expired() { return !this.active; }
}
