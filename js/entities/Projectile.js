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
    this.weaponId = o.weaponId || '';
    this.friendly = o.friendly !== false;
    this.spritePath = o.spritePath || '';
    this.hitFlash = 0;
    if (o.frames && o.animName) this.makeAnim(o.frames, o.animName);
    else this.anim = null;
  }

  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life += dt;
    if (this.anim) this.anim.update(dt);
    if (this.life >= this.maxLife) { this.active = false; this.alive = false; }
  }

  get expired() { return !this.active; }
}
