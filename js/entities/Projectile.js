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
    // точка назначения (земля под целью на момент вылета) для взрывных снарядов
    this.destX = 0;
    this.destY = 0;
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
    // арочная траектория (magic_bolt): фаза up -> turn -> dive
    this.arc = null; // { phase, upH, t, turnMs, accelMs, tx, ty }
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
    this.destX = o.destX ?? 0;
    this.destY = o.destY ?? 0;
    this.slowFactor = o.slowFactor ?? 1;
    this.slowDuration = o.slowDuration || 0;
    this.burnDps = o.burnDps || 0;
    this.burnDuration = o.burnDuration || 0;
    this.chainRange = o.chainRange || 0;
    this.chainTarget = o.chainTarget || null;
    this.weaponId = o.weaponId || '';
    this.friendly = o.friendly !== false;
    this.spritePath = o.spritePath || '';
    this.arc = o.arc || null;
    if (this.arc) this.arc.t = 0;
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
    if (this.arc) this._updateArc(dt);
    else this.x += this.vx * dt, this.y += this.vy * dt;
    this.life += dt;
    if (this.anim) this.anim.update(dt);
    if (this.life >= this.maxLife) { this.active = false; this.alive = false; }
  }

  // Арочная траектория: up (вертикальный вылет над головой) ->
  // turn (плавный разворот к цели с ростом скорости) -> dive (самонаведение
  // с резким ускорением до попадания/истечения жизни).
  _updateArc(dt) {
    const a = this.arc;
    a.t += dt;
    // живая цель (если ещё жива), иначе — точка на момент вылета
    const tx = (a.target && a.target.alive) ? a.target.x : a.tx;
    const ty = (a.target && a.target.alive) ? a.target.y : a.ty;
    if (a.phase === 'up') {
      this.vx = 0; this.vy = -a.upH / a.upMs;
      if (a.t >= a.upMs) { a.phase = 'turn'; a.t = 0; }
    } else if (a.phase === 'turn') {
      const k = Math.min(1, a.t / a.turnMs);
      const s = k * k * (3 - 2 * k); // smoothstep — мягкий вход/выход из радиуса
      const want = Math.atan2(ty - this.y, tx - this.x);
      let delta = want - (-Math.PI / 2); // от «вверх» к направлению на цель
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const ang = -Math.PI / 2 + delta * s;
      const sp = a.baseSpeed * (0.5 + 1.0 * s); // в развороте даже медленнее — видна «дуга»
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
      if (k >= 1) { a.phase = 'dive'; a.t = 0; }
    } else { // dive: самонаведение + резкое ускорение
      const k = Math.min(1, a.t / a.accelMs);
      const want = Math.atan2(ty - this.y, tx - this.x);
      const sp = a.baseSpeed * (1.5 + 1.5 * k); // до 3x скорости — туннелирование терпимо
      this.vx = Math.cos(want) * sp;
      this.vy = Math.sin(want) * sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  get expired() { return !this.active; }
}
