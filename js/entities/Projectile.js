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
    this.color = ''; // цвет фолбэка, если спрайт не загружен
    // арочная траектория (magic_bolt): фаза up -> turn -> dive
    this.arc = null; // { phase, upH, t, turnMs, accelMs, tx, ty }
    // Тайная нова: спиральный вылет вокруг игрока + гиперболический полёт.
    // phase: spiral -> fly. Все параметры приходят из skills_config.nova.
    this.nova = null;
    this.trail = [];
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
    this.color = o.color || '';
    this.arc = o.arc || null;
    if (this.arc) this.arc.t = 0;
    this.nova = o.nova || null;
    if (this.nova) {
      this.nova.t = 0;
      this.nova.phase = 'spiral';
    }
    this.trail = [];
    this._fbTrail = []; // процедурный огненный хвост (FireballRenderer)
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
    if (this.nova) this._updateNova(dt);
    else if (this.arc) this._updateArc(dt);
    else this.x += this.vx * dt, this.y += this.vy * dt;
    this.life += dt;
    if (this.anim) this.anim.update(dt);
    if (this.life >= this.maxLife) { this.active = false; this.alive = false; }
  }

  // Тайная нова. Сначала снаряды раскручиваются вокруг игрока по спирали
  // (короткая фаза spiral), затем летят к своим целям по гиперболической
  // кривой (рациональная квадратичная кривая с весом > 1). Кривая
  // подправляется, пока цель жива, поэтому снаряды не промахиваются по
  // движущимся монстрам.
  _updateNova(dt) {
    const n = this.nova;
    n.t += dt;
    if (n.phase === 'spiral') {
      const k = Math.min(1, n.t / Math.max(0.001, n.spiralMs));
      const s = k * k * (3 - 2 * k); // плавный вход/выход
      const ang = n.a0 + n.dir * n.turns * Math.PI * 2 * s;
      const rad = n.r0 + (n.r1 - n.r0) * s;
      const px = this.x, py = this.y;
      this.x = n.ox + Math.cos(ang) * rad;
      this.y = n.oy + Math.sin(ang) * rad;
      if (dt > 0) { this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; }
      this._pushNovaTrail();
      if (k >= 1) {
        n.phase = 'fly';
        n.t = 0;
        n.sx = this.x; n.sy = this.y;
        n.p1x = this.x; n.p1y = this.y;
        if (n.target && n.target.alive) { n.tx = n.target.x; n.ty = n.target.y; }
        this._novaControl(1);
      }
      return;
    }

    const k = Math.min(1, n.t / Math.max(0.001, n.flightMs));
    if (n.target && n.target.alive) { n.tx = n.target.x; n.ty = n.target.y; }
    this._novaControl(dt);
    const iu = 1 - k;
    const w = n.weight;
    const den = iu * iu + 2 * k * iu * w + k * k;
    const px = this.x, py = this.y;
    this.x = (iu * iu * n.sx + 2 * k * iu * w * n.p1x + k * k * n.tx) / den;
    this.y = (iu * iu * n.sy + 2 * k * iu * w * n.p1y + k * k * n.ty) / den;
    if (dt > 0) { this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; }
    this._pushNovaTrail();
    if (k >= 1) {
      this.x = n.tx; this.y = n.ty;
      this.explode();
    }
  }

  // Контрольная точка гиперболы: середина отрезка start->target плюс
  // перпендикулярный выгиб. При движении цели точка плавно догоняет новую.
  _novaControl(dt) {
    const n = this.nova;
    const dx = n.tx - n.sx, dy = n.ty - n.sy;
    const d = Math.hypot(dx, dy) || 1;
    const mx = (n.sx + n.tx) / 2, my = (n.sy + n.ty) / 2;
    const bend = Math.min(n.bend, d * 0.45);
    const tx = mx - (dy / d) * bend * n.side;
    const ty = my + (dx / d) * bend * n.side;
    const s = dt >= 1 ? 1 : Math.min(1, Math.max(0, dt) * 14);
    n.p1x += (tx - n.p1x) * s;
    n.p1y += (ty - n.p1y) * s;
  }

  _pushNovaTrail() {
    const n = this.nova;
    if (!n || !(n.trailLength > 0)) return;
    this.trail.push({ x: this.x, y: this.y });
    while (this.trail.length > n.trailLength) this.trail.shift();
  }

  // Арочная траектория: up (вертикальный вылет над головой) ->
  // turn (плавный разворот к цели с ростом скорости) -> dive (самонаведение
  // с резким ускорением до попадания/истечения жизни).
  _updateArc(dt) {
    const a = this.arc;
    a.t += dt;
    // Цель «жива» по-настоящему только до старта death-анимации: Enemy при
    // смерти ставит deathT>0, а alive гаснет только после трупа. CombatSystem
    // таких врагов пропускает — если арка наводится на «смертельно раненую»
    // цель, снаряд зависает над трупом до конца жизни (как fireball: считаем
    // мёртвой и взрываемся в последней точке).
    const aliveT = a.target && a.target.alive && !(a.target.deathT > 0);
    if (aliveT) { a.tx = a.target.x; a.ty = a.target.y; } // помним последнюю позицию
    const tx = a.tx, ty = a.ty;
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
      // «Захват» цели: на 1500 px/s снаряд проскакивает хитбокс между кадрами
      // и осциллирует вокруг неё (спрайт «зависает» и вращается). Если шаг
      // долетает — встаём точно в точку, как fireball взрывается в dest.
      const dx = tx - this.x, dy = ty - this.y;
      const step = sp * dt + Math.max(8, this.radius);
      if (dx * dx + dy * dy <= step * step) {
        this.x = tx; this.y = ty;
        if (!aliveT) this.explode(); // цель уже добита — взрыв на пустом месте
        return; // живая — CombatSystem в этом же кадре нанесёт урон и взорвёт
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  get expired() { return !this.active; }
}
