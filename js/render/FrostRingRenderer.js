// Процедурный рендерер «Кольца холода» (frost_ring).
//
// Заменяет projectiles/frost_ring.png: вместо шара из спрайтшита вокруг мага
// летают ледяные ОСКОЛКИ (2..6 — количество по уровням в skills_config.
// orbit_levels). Каждый осколок — гранёный кристалл, который кружится вместе
// с орбитой и дополнительно вращается вокруг собственной оси.
//
// Эффекты (всё рисовалось программно до появления арта):
//   • ШЛЕЙФ — за осколком тянется дуга по его орбите: широкая холодная
//     подложка + яркая сердцевина + отдельные искорки;
//   • ЛЕДЯНОЙ ПАР — белые полупрозрачные клубы, которые отрываются от
//     осколка, поднимаются вверх и растворяются (аналог дыма файрбола);
//   • мягкое свечение, блик и иней на гранях кристалла.
//
// Режимы (game_config.visuals.frost_ring.mode) — как у fireball:
//   "missing" — рисовать процедурно, если спрайт не загрузился (по умолчанию);
//   "always"  — всегда процедурный;
//   "never"   — не использовать процедурный (тогда SkillSystem сам нарисует
//               спрайт/заглушку).
//
// Вызывается из Game перед skills.drawOrbits(ctx); когда рендерер берёт орбы
// на себя, SkillSystem их пропускает (skills.orbitsHandled = true).

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class FrostRingRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
    // Пар — «живые» частицы: порождаются по времени, живут свою фазу.
    // Ключ — индекс осколка (шары стабильны между кадрами).
    this._vapor = new Map();
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  // Главный метод: вызывается из Game.render для активных орбит.
  // Возвращает true, если осколки нарисованы процедурно
  // (Game тогда говорит SkillSystem не рисовать свои шары).
  draw(ctx, weapons, time, assets) {
    if (!ctx || !weapons) return false;
    const cfg = this.cfg;
    if (cfg.enabled === false || cfg.mode === 'never') return false;
    let drew = false;
    for (const st of weapons.values()) {
      if (st.active === false || st.cfg.type !== 'orbit' || !(st.level > 0)) continue;
      if (!st.orbs || !st.orbs.length) continue;
      const c = st.cfg;
      // mode 'always' — рисуем процедурно даже при наличии арта;
      // mode 'missing' (по умолчанию) — только если спрайт не загрузился
      // (файл переименован в *.png.off → AssetLoader помечает путь missing).
      if (cfg.mode !== 'always') {
        const hasArt = c.orb_sprite && assets && !assets.isMissing(c.orb_sprite)
          && assets.get(c.orb_sprite) && assets.get(c.orb_sprite).tagName === 'IMG';
        if (hasArt) continue;
      }
      this._drawWeapon(ctx, st, time);
      drew = true;
    }
    return drew;
  }

  _drawWeapon(ctx, st, time) {
    const t = time || 0;
    const c = st.cfg;
    const cx = c.orbit_center_x ?? st.orbs[0].playerX ?? 0;
    // Центр кольца — позиция игрока (её передаёт Game через st.player).
    const px = st.player ? st.player.x : cx;
    const py = st.player ? st.player.y : 0;
    st.orbs.forEach((o, i) => {
      this._drawTrail(ctx, o, t, i);
    });
    st.orbs.forEach((o, i) => {
      this._drawVapor(ctx, o, t, i, px, py);
    });
    st.orbs.forEach((o, i) => {
      this._drawShard(ctx, o, t, i);
    });
  }

  // Геометрия осколка: радиус кристалла и параметры орбиты (для шлейфа-дуги).
  _shardRadius(o) {
    const cfg = this.cfg;
    const base = (o.r || 10) * (cfg.shard_scale ?? 1.6);
    return Math.max(6, base);
  }

  // === ЛЕДЯНОЙ ОСКОЛКОВ ===
  // Кристалл: удлинённый шестиугольник с двумя скруглёнными «огранками».
  // Вращение вокруг своей оси — st.orbSpin[i] (уже считает SkillSystem),
  // плюс лёгкий «фасеточный» блеск граней.
  _drawShard(ctx, o, t, idx) {
    const r = this._shardRadius(o);
    const spin = o.spin || 0;
    const col = this.cfg.color || o.color || '#9fe8ff';
    const core = this.cfg.core_color || '#eaffff';
    const deep = this.cfg.edge_color || '#2a7fff';

    ctx.save();
    ctx.translate(o.x, o.y);

    // Внешнее холодное свечение (пульсирует).
    const glowR = r * (this.cfg.glow_scale ?? 2.6);
    const pulse = 1 + Math.sin(t * 6 + idx * 1.7) * 0.08;
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, glowR * pulse);
    glow.addColorStop(0, 'rgba(160,230,255,0.35)');
    glow.addColorStop(0.5, 'rgba(60,160,255,0.12)');
    glow.addColorStop(1, 'rgba(20,80,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR * pulse, 0, TAU);
    ctx.fill();

    ctx.rotate(spin);

    // Контур кристалла: 6 точек (вытянут по Y — «осколок»).
    const L = r * 1.35; // полуlength продольный
    const Wd = r * 0.62; // полуширина
    const pts = [
      { x: 0, y: -L },            // остриё
      { x: Wd, y: -L * 0.35 },
      { x: Wd * 0.85, y: L * 0.45 },
      { x: 0, y: L * 0.8 },       // тупое основание
      { x: -Wd * 0.85, y: L * 0.45 },
      { x: -Wd, y: -L * 0.35 }
    ];
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    };

    // Тело — градиент льда.
    const body = ctx.createLinearGradient(-Wd, -L, Wd, L);
    body.addColorStop(0, core);
    body.addColorStop(0.45, col);
    body.addColorStop(1, deep);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = body;
    path();
    ctx.fill();

    // Грань-блик: светлая половина кристалла.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x * 0.55, pts[1].y * 0.6);
    ctx.lineTo(pts[2].x * 0.4, pts[2].y * 0.6);
    ctx.lineTo(0, pts[3].y * 0.7);
    ctx.lineTo(-pts[4].x * 0.15, pts[4].y * 0.6);
    ctx.closePath();
    ctx.fill();

    // Рёбра (иней) — тонкие светлые линии по огранке.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(0, pts[3].y * 0.9);
    ctx.stroke();

    // Обводка тёмно-синяя — кристалл читается на любом фоне.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(20,60,140,0.9)';
    ctx.lineWidth = Math.max(1, r * 0.08);
    path();
    ctx.stroke();

    // Искрящийся блик-звёздочка у острия («бегает» по грани).
    const tw = 0.5 + 0.5 * Math.sin(t * 7 + idx * 2.3);
    ctx.globalAlpha = 0.35 + 0.55 * tw;
    ctx.fillStyle = '#ffffff';
    const bx = Wd * 0.15, by = -L * 0.55;
    const bs = r * (0.22 + 0.12 * tw);
    ctx.beginPath();
    ctx.moveTo(bx, by - bs); ctx.lineTo(bx + bs * 0.3, by - bs * 0.3);
    ctx.lineTo(bx + bs, by); ctx.lineTo(bx + bs * 0.3, by + bs * 0.3);
    ctx.lineTo(bx, by + bs); ctx.lineTo(bx - bs * 0.3, by + bs * 0.3);
    ctx.lineTo(bx - bs, by); ctx.lineTo(bx - bs * 0.3, by - bs * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // === ШЛЕЙФ ===
  // Осколок движется по окружности, поэтому хвост — дуга НАЗАД по орбите
  // (против знака dir). Три слоя: широкая холодная подложка, яркая
  // сердцевина, редкие искорки. Затухание к концу дуги.
  _drawTrail(ctx, o, t, idx) {
    const cfg = this.cfg;
    const arcDeg = cfg.trail_arc_deg ?? 70;
    const arc = (arcDeg * Math.PI) / 180;
    const R = Math.max(4, o.orbitR || 70);
    const wBase = this._shardRadius(o);
    const steps = Math.max(6, cfg.trail_segments ?? 16);
    const back = -Math.sign(o.dir || 1); // назад по ходу орбиты
    const phase = (hash(idx * 13.7) - 0.5) * 0.4;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Подложка + сердцевина одним проходом по сегментам дуги.
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      for (let i = 0; i < steps; i++) {
        const k0 = i / steps, k1 = (i + 1) / steps;
        const a0 = o.angle + back * arc * k0;
        const a1 = o.angle + back * arc * k1;
        const x0 = o.cx + Math.cos(a0) * R, y0 = o.cy + Math.sin(a0) * R;
        const x1 = o.cx + Math.cos(a1) * R, y1 = o.cy + Math.sin(a1) * R;
        // мерцание языка шлейфа (как всполохи пламени у файрбола)
        const flick = 0.7 + 0.3 * Math.sin(t * 16 - k0 * 9 + idx * 2.1 + phase * TAU);
        const fade = (1 - k0) * flick;
        if (wide) {
          ctx.globalAlpha = 0.10 * fade;
          ctx.strokeStyle = cfg.trail_glow_color || '#3aa0ff';
          ctx.lineWidth = wBase * (0.9 + 0.9 * (1 - k0));
        } else {
          ctx.globalAlpha = 0.32 * fade;
          ctx.strokeStyle = cfg.trail_color || '#cfeeff';
          ctx.lineWidth = wBase * (0.22 + 0.4 * (1 - k0));
        }
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }

    // Искорки вдоль шлейфа — мелкие точки, «срезаемые» потоком.
    const sparks = cfg.trail_sparks ?? 5;
    for (let i = 0; i < sparks; i++) {
      const slot = Math.floor(t * 6 + i * 2.7 + idx * 5.3);
      const seed = i * 17.3 + idx * 7.7 + slot * 1.31;
      const k = hash(seed); // положение вдоль дуги 0..1
      const side = (hash(seed + 3) - 0.5) * 2;
      const a = o.angle + back * arc * k;
      const rr = R + side * wBase * (0.5 + k * 1.2);
      const sx = o.cx + Math.cos(a) * rr;
      const sy = o.cy + Math.sin(a) * rr;
      const life = (t * 6 + i * 2.7 + idx * 5.3) % 1;
      const alpha = (1 - k) * (1 - life) * 0.8;
      const size = wBase * 0.14 * (1 - k * 0.5);
      if (alpha <= 0.03 || size <= 0.3) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = k < 0.4 ? '#ffffff' : (cfg.color || '#9fe8ff');
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // === ЛЕДЯНОЙ ПАР ===
  // Холод осколка конденсирует пар: белые клубы отрываются от кристалла,
  // поднимаются вверх (в экранных координатах Y меньше) и растворяются.
  // source-over — lighter «съел» бы полупрозрачный белый.
  _drawVapor(ctx, o, t, idx) {
    const cfg = this.cfg;
    if (cfg.vapor && cfg.vapor.enabled === false) return;
    const count = cfg.vapor_count ?? 6;
    const speed = cfg.vapor_rate ?? 1.4; // клубов в секунду на осколок
    const rise = cfg.vapor_rise_px ?? 34; // насколько поднимается за жизнь
    const r = this._shardRadius(o);

    let list = this._vapor.get(idx);
    if (!list) list = this._vapor.set(idx, []).get(idx);

    // Порождение: детерминированные «слоты» времени — без накопления state
    // между забегями список чистим по размеру.
    while (list.length && list[0].born + list[0].life < t) list.shift();
    const wantN = Math.min(count, Math.floor(t * speed) % (count + 1) + Math.min(count, 2));
    while (list.length < count) {
      const j = list.length;
      const born = t - (j / count) * (1 / speed) * count * 0.5;
      list.push({
        born: Math.max(0, born),
        life: (0.9 + hash(idx * 31.7 + j * 7.1) * 0.7),
        seed: idx * 13.3 + j * 5.7
      });
    }
    void wantN;

    ctx.save();
    for (const v of list) {
      const ph = clamp01((t - v.born) / v.life);
      if (ph >= 1) continue;
      const drift = (hash(v.seed) - 0.5) * 2;
      const swirl = Math.sin(t * 2.2 + v.seed * TAU) * r * 0.35;
      // Пар живёт у осколка и уплывает вверх, слегка раскачиваясь.
      const vx = o.x + drift * r * 0.8 + swirl - (o.vx || 0) * 0.02 * ph;
      const vy = o.y - ph * rise + (hash(v.seed + 1) - 0.5) * r * 0.6;
      const size = r * (0.35 + ph * 1.1);
      const alpha = 0.28 * (1 - ph) * Math.min(1, ph * 8);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, size);
      g.addColorStop(0, 'rgba(235,250,255,0.9)');
      g.addColorStop(0.55, 'rgba(190,230,255,0.45)');
      g.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vx, vy, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Сброс состояния при рестарте забега (пар привязан к игровому времени).
  reset() { this._vapor.clear(); }
}
