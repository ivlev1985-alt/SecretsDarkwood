import { Entity } from './Entity.js';

// Питомец: летает, притягивает дроп (монеты/XP) в своём радиусе как персонаж,
// подбирает ОДИН дроп и несёт хозяину. Монстры питомца не бьют.
export class Pet extends Entity {
  // opts: { fetchPotions, fetchCoins, fetchXp, carryLimit } — из шаблона питомца.
  constructor(x, y, radius, speed, magnetR = 60, opts = {}) {
    super(x, y, 10);
    this.radius = radius; // дальность полёта: поиск дропа вокруг хозяина
    this.speed = speed || 260;
    this.magnetR = magnetR; // радиус притяжения монет/XP к себе
    this.fetchPotions = !!opts.fetchPotions; // особый питомец таскает ещё и аптечки
    this.fetchCoins = opts.fetchCoins !== false;
    this.fetchXp = opts.fetchXp !== false;
    this.carryLimit = opts.carryLimit || 3; // сколько предметов может нести одновременно
    this.mode = 'follow'; // follow | fetch | deliver
    this.target = null; // Pickup
    this.carrying = []; // массив Pickup (с sprite/sprite_frames/animFrame)
    // Пружинная физика полёта: скорость копится и гаснет — инерция, плавные дуги.
    this.vx = 0;
    this.vy = 0;
    this.orbit = Math.random() * Math.PI * 2; // фаза орбиты вокруг хозяина
    this.tilt = 0;   // визуальный наклон в вираже (rad), сглаженный
    this.faceV = 1;  // сглаженная горизонтальная скорость для зеркалинга
    this.bob = Math.random() * 6;
    this.wob = Math.random() * 6; // фаза синусоиды полёта
    this.anim = null;
    this.animT = 0; // время для зацикленной спрайт-анимации
    // «Живой» полёт: уникальные амплитуды/периоды/фазы у каждого питомца,
    // чтобы два одинаковых питомца двигались по-разному (без механики).
    this.bobAmp = 3 + Math.random() * 3;                        // вертикальное покачивание, 3..6 px
    this.bobSpeed = (Math.PI * 2) / (2 + Math.random() * 2);    // период 2..4 c
    this.floatAmp = 4 + Math.random() * 4;                      // медленное «парение», 4..8 px
    this.floatSpeed = (Math.PI * 2) / (3 + Math.random() * 2);  // период 3..5 c
    this.float = Math.random() * Math.PI * 2;                   // фаза парения
    this.wobAmp = 15 + Math.random() * 10;                      // боковое колебание в полёте, 15..25 px/s
    this.wobSpeed = 5 + Math.random() * 3;                      // частота боковой синусоиды
  }

  // Визуальное смещение для отрисовки (на логику/коллизии не влияет):
  // сумма двух несинхронных синусоид по вертикали + лёгкий дрейф по горизонтали.
  visualOffset() {
    return {
      ox: Math.sin(this.float * 0.7) * 2,
      oy: Math.sin(this.bob) * this.bobAmp + Math.sin(this.float) * this.floatAmp
    };
  }

  static isLoot(p) {
    return p && p.alive && (p.kind === 'coin' || p.kind === 'xp');
  }

  canTake(p) {
    if (!p || !p.alive) return false;
    if (p.kind === 'coin') return this.fetchCoins;
    if (p.kind === 'xp') return this.fetchXp;
    if (p.kind === 'potion') return this.fetchPotions; // только особый питомец
    return false;
  }

  update(dt, px, py, pickups, grabR, deliverR, magnetPull = 380) {
    this.bob += dt * this.bobSpeed;
    this.float += dt * this.floatSpeed;
    this.animT += dt;
    // магнит: монеты и XP (и аптечки у особого) в радиусе притягиваются к питомцу
    for (const p of pickups) {
      if (!this.canTake(p)) continue;
      const mdx = p.x - this.x, mdy = p.y - this.y;
      const md = Math.hypot(mdx, mdy);
      if (md < this.magnetR && md > 1) {
        p.x -= (mdx / md) * magnetPull * dt;
        p.y -= (mdy / md) * magnetPull * dt;
      }
    }
    let tx = px, ty = py - 40; // точка следования (в follow — орбита вокруг хозяина)
    if (this.mode === 'follow') {
      // клюв полон — несём добычу хозяину
      if (this.carrying.length >= this.carryLimit) { this.mode = 'deliver'; }
      else {
        const best = this._nearest(pickups, px, py);
        if (best) { this.mode = 'fetch'; this.target = best; }
        else if (this.carrying.length) { this.mode = 'deliver'; }
      }
    } else if (this.mode === 'fetch') {
      if (!this.target || !this.target.alive) { this.mode = 'follow'; this.target = null; }
      else { tx = this.target.x; ty = this.target.y; }
    } else if (this.mode === 'deliver') {
      tx = px; ty = py;
    }
    // B: в follow точка назначения медленно кружит над хозяином — питомец
    // никогда не висит на месте, а «парит по кругу», как живая птица.
    if (this.mode === 'follow') {
      this.orbit += dt * 0.9;
      tx = px + Math.cos(this.orbit) * 34;
      ty = py - 44 + Math.sin(this.orbit) * 14;
    }
    // A: пружина + демпфирование вместо шага постоянной скорости.
    // Ускорение пропорционально дистанции -> разгон вдали, торможение у цели,
    // скруглённые дуги на разворотах и лёгкий overshoot.
    const k = 14;              // жёсткость пружины
    const damp = Math.pow(0.86, dt * 60); // затухание скорости за кадр
    this.vx += (tx - this.x) * k * dt;
    this.vy += (ty - this.y) * k * dt;
    this.vx *= damp;
    this.vy *= damp;
    // ограничение скорости: в fetch чуть быстрее (пикирует за предметом)
    const maxSp = this.speed * (this.mode === 'fetch' ? 1.15 : 1);
    const v = Math.hypot(this.vx, this.vy);
    if (v > maxSp) { this.vx = (this.vx / v) * maxSp; this.vy = (this.vy / v) * maxSp; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // боковая волна перпендикулярно вектору скорости (визуальная «рысканье»)
    if (v > 1) {
      this.wob += dt * this.wobSpeed;
      const w = Math.sin(this.wob) * this.wobAmp * dt;
      this.x += (-this.vy / v) * w;
      this.y += (this.vx / v) * w;
    }
    // C: плавное зеркалинге по сглаженной vx (без рывков на границе dx=0)
    this.faceV += (this.vx - this.faceV) * Math.min(1, dt * 8);
    if (Math.abs(this.faceV) > 12) this.facing = this.faceV >= 0 ? 1 : -1;
    // C: наклон в вираже — боковое ускорение заваливает спрайт (только визуал)
    const targetTilt = Math.max(-0.45, Math.min(0.45, -this.vy / this.speed * 0.5));
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 6);
    // захват: берём предмет в клюв и продолжаем искать следующий
    if (this.mode === 'fetch' && this.target && this.target.alive) {
      const gx = this.target.x - this.x, gy = this.target.y - this.y;
      if (gx * gx + gy * gy < grabR * grabR) {
        this.carrying.push(this.target); // сам Pickup — со спрайтом и кадром
        this.target.alive = false;       // убрать с земли
        this.target = null;
        this.mode = 'follow';            // follow сам решит: ещё искать или нести
      }
    }
    // доставка: отдаём всё, что накопили
    if (this.mode === 'deliver') {
      const hx = px - this.x, hy = py - this.y;
      if (hx * hx + hy * hy < deliverR * deliverR) {
        const out = this.carrying;
        this.carrying = [];
        this.mode = 'follow';
        return out; // Game засчитывает каждый предмет
      }
    }
    return null;
  }

  _nearest(pickups, px, py) {
    let best = null, bd = this.radius * this.radius;
    for (const p of pickups) {
      if (!this.canTake(p)) continue;
      const dx = p.x - px, dy = p.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best;
  }
}
