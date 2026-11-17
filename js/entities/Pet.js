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
    this.animT = Math.random() * 1; // E: случайная стартовая фаза взмахов (сек)
    this.animMul = 0.8 + Math.random() * 0.9; // E: индивидуальный темп крыльев (0.8..1.7)
    this.impulseT = 1 + Math.random() * 2; // F: таймер случайного «толчка»
    this.pauseT = 0;                       // G: микро-заминка перед пикированием
    this.noiseP = Math.random() * 100;     // D: индивидуальная фаза шума
    this.bob = Math.random() * 6;
    this.wob = Math.random() * 6; // фаза синусоиды полёта
    this.anim = null;
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

  // Визуальное смещение для отрисовки (на логику/коллизии не влияет).
  // D: три октавы с иррациональными соотношениями частот (1 : 1.618 : 2.718) —
  //    сумма никогда не повторяется, «идеальный цикл» не считывается глазом.
  // E: амплитуды гасятся на скорости — в быстром полёте птица собрана,
  //    «парит» только в спокойном следовании.
  visualOffset() {
    const sf = Math.min(1, Math.hypot(this.vx, this.vy) / this.speed);
    const calm = 1 - 0.65 * sf;
    const n = this.noiseP;
    return {
      ox: (Math.sin(this.float * 0.7) * 2 + Math.sin(this.float * 1.32 + n) * 1.5) * calm,
      oy: (Math.sin(this.bob) * this.bobAmp
        + Math.sin(this.bob * 1.618 + n) * this.bobAmp * 0.6
        + Math.sin(this.bob * 2.718 + n * 1.7) * this.bobAmp * 0.35) * calm
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
    // E: темп взмахов зависит от скорости — в парении крылья медленнее,
    // в быстром полёте чаще (индивидуальный множитель animMul — все птицы разные).
    const spd0 = Math.min(1, Math.hypot(this.vx, this.vy) / this.speed);
    this.animT += dt * this.animMul * (0.7 + 0.8 * spd0);
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
        if (best) {
          this.mode = 'fetch'; this.target = best;
          this.pauseT = 0.08 + Math.random() * 0.14; // G: «заметила» — и лишь затем пикирует
        }
        else if (this.carrying.length) { this.mode = 'deliver'; }
      }
    } else if (this.mode === 'fetch') {
      if (!this.target || !this.target.alive) { this.mode = 'follow'; this.target = null; }
      else {
        // G: микро-заминка — птица «замечает» предмет и лишь затем пикирует
        if (this.pauseT > 0) {
          this.pauseT -= dt;
          tx = this.x; ty = this.y;
        } else { tx = this.target.x; ty = this.target.y; }
      }
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
    // G: в финальной трети пикирования пружина жёстче — заметный «бросок» к предмету.
    let k = 14; // жёсткость пружины
    if (this.mode === 'fetch' && this.pauseT <= 0) {
      const dd = Math.hypot(tx - this.x, ty - this.y);
      if (dd < 80) k = 24;
    }
    const damp = Math.pow(0.86, dt * 60); // затухание скорости за кадр
    this.vx += (tx - this.x) * k * dt;
    this.vy += (ty - this.y) * k * dt;
    this.vx *= damp;
    this.vy *= damp;
    // ограничение скорости: в fetch чуть быстрее (пикирует за предметом)
    const maxSp = this.speed * (this.mode === 'fetch' ? 1.15 : 1);
    const v = Math.hypot(this.vx, this.vy);
    if (v > maxSp) { this.vx = (this.vx / v) * maxSp; this.vy = (this.vy / v) * maxSp; }
    // F: птичья нервозность — редкие слабые боковые импульсы с затуханием пружины
    this.impulseT -= dt;
    if (this.impulseT <= 0) {
      this.impulseT = 1 + Math.random() * 2.5;
      const a = Math.random() * Math.PI * 2;
      const imp = 20 + Math.random() * 35;
      this.vx += Math.cos(a) * imp;
      this.vy += Math.sin(a) * imp * 0.6;
    }
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
