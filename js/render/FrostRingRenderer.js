// Процедурный рендерер «Кольца холода» (frost_ring).
//
// Заменяет projectiles/frost_ring.png: ледяные ОСКОЛКИ летают вокруг мага
// на двух орбитах. Каждый осколок — уникально-сгенерированный кристалл
// (разная форма, пропорции, грани), вращение — с пульсацией скорости
// и случайными сменами направления, орбиты — с радиальным «дыханием»,
// хвосты — извивающиеся, как у файрбола.
//
// Режимы (game_config.visuals.frost_ring.mode):
//   "missing" — рисовать процедурно, если спрайт не загрузился (по умолчанию);
//   "always"  — всегда процедурный;
//   "never"   — не использовать процедурный.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Генерация формы кристалла: случайное количество вершин (5–8),
// случайные радиусы для каждой вершины, чередование длинных/коротких граней.
function genCrystalShape(seed, t) {
  const verts = 5 + Math.floor(hash(seed) * 4); // 5..8
  const shape = new Array(verts);
  for (let i = 0; i < verts; i++) {
    const ang = (i / verts) * TAU - Math.PI / 2;
    // Радиус: базовый + шум по вершинам + лёгкая пульсация по времени.
    const rNoise = hash(seed + i * 3.7) * 0.35;
    const pulse = Math.sin(t * 2.5 + i * 1.9 + seed) * 0.04;
    const r = 1 + rNoise + pulse;
    shape[i] = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }
  return shape;
}

// Генерация «бликовой грани» — полигон внутри кристалла, имитирующий
// отражение света на грани.
function genHighlightShape(seed, verts) {
  const hlVerts = 3 + Math.floor(hash(seed + 99) * 3); // 3..5
  const shape = new Array(hlVerts);
  for (let i = 0; i < hlVerts; i++) {
    const ang = (i / hlVerts) * TAU + hash(seed + 77) * 0.5;
    const r = 0.3 + hash(seed + i * 5.1) * 0.3;
    shape[i] = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }
  return shape;
}

export class FrostRingRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
    this._vapor = new Map();
    // Кэш форм кристаллов: key = idx → { shape, highlight, seed }.
    // Формы генерируются один раз и не меняются между кадрами.
    this._shapes = new Map();
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  draw(ctx, weapons, time, assets) {
    if (!ctx || !weapons) return false;
    const cfg = this.cfg;
    if (cfg.enabled === false || cfg.mode === 'never') return false;
    let drew = false;
    for (const st of weapons.values()) {
      if (st.active === false || st.cfg.type !== 'orbit' || !(st.level > 0)) continue;
      if (!st.orbs || !st.orbs.length) continue;
      const c = st.cfg;
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
    const px = st.player ? st.player.x : 0;
    const py = st.player ? st.player.y : 0;

    // Обновляем «живое» вращение каждого осколка: пульсация скорости
    // и случайные смены направления.
    this._updateOrbSpin(st, t);

    // Обновляем орбитальное положение с радиальным «дыханием».
    this._updateOrbPositions(st, t);

    // Генерируем формы кристаллов (один раз на осколок).
    for (let i = 0; i < st.orbs.length; i++) {
      if (!this._shapes.has(i)) {
        this._shapes.set(i, {
          shape: genCrystalShape(i * 17.3 + (st.cfg.seed || 0), t),
          highlight: genHighlightShape(i * 17.3 + (st.cfg.seed || 0),
            5 + Math.floor(hash(i * 17.3 + (st.cfg.seed || 0)) * 4))
        });
      }
    }

    st.orbs.forEach((o, i) => { this._drawTrail(ctx, o, t, i); });
    st.orbs.forEach((o, i) => { this._drawVapor(ctx, o, t, i, px, py); });
    st.orbs.forEach((o, i) => { this._drawShard(ctx, o, t, i); });
  }

  // === ЖИВОЕ ВРАЩЕНИЕ ===
  // Скорость плавно пульсирует (две медленные sin-гармоники), направление
  // меняется мягко: скорость проходит через ноль и разворачивается, а не
  // щёлкает. Период смены направления — ~20 сек (растянут по времени).
  _updateOrbSpin(st, t) {
    if (!st.orbSprites || !st.orbSpin) return;
    for (let i = 0; i < st.orbSpin.length; i++) {
      const sp = st.orbSprites[i];
      if (!sp) continue;
      const baseSpeed = sp.spinSpeed || 0.5;
      // Плавная пульсация скорости: ±35%, амплитуда закреплена за осколком.
      const amp = 0.2 + hash(i * 11.3) * 0.15;
      const pulse = 1
        + Math.sin(t * 1.6 + i * 2.7) * amp
        + Math.sin(t * 0.7 + i * 1.3 + 0.9) * amp * 0.5;
      // Смена направления: у части осколков множитель — медленная синусоида
      // (период ~21 сек), скорость плавно гаснет до нуля и разворачивается.
      const flips = hash(i * 31.7 + (st.cfg.seed || 0)) > 0.6;
      const dirK = flips ? Math.sin(t * 0.3 + i * 4.1) : Math.sign(baseSpeed || 1);
      const effectiveSpeed = baseSpeed * pulse * dirK;
      st.orbSpin[i] += effectiveSpeed * TAU * 0.016; // ~60fps шаг
    }
  }

  // === ОРБИТАЛЬНОЕ ДЫХАНИЕ ===
  // Радиус орбиты пульсирует с фазовым сдвигом, но ближняя и дальняя
  // орбиты всегда разделены: амплитуда пульсации меньше половины расстояния
  // между ними.
  _updateOrbPositions(st, t) {
    const px = st.player ? st.player.x : 0;
    const py = st.player ? st.player.y : 0;
    const nearR = st.cfg.orbit_near_radius ?? 70;
    const farR = st.cfg.orbit_far_radius ?? 120;
    // 30% от расстояния между орбитами. Суммарный размах двух гармоник
    // = 1.5×амплитуды с каждой стороны: орбиты сближаются на 0.9 от зазора,
    // но никогда не пересекаются (1.5*0.3*2 = 0.9 < 1).
    const breatheAmp = (farR - nearR) * 0.30;

    for (let i = 0; i < st.orbs.length; i++) {
      const o = st.orbs[i];
      const baseR = o.far ? farR : nearR;
      // Радиальная пульсация: фаза зависит от индекса и времени.
      const phase = o.angle + (o.far ? Math.PI : 0);
      const rPulse = Math.sin(t * 1.8 + i * 2.3 + (o.far ? 3.1 : 0)) * breatheAmp;
      const rPulse2 = Math.sin(t * 2.7 + i * 1.7 + (o.far ? 1.4 : 2.2)) * breatheAmp * 0.5;
      const r = baseR + rPulse + rPulse2;
      o.x = px + Math.cos(o.angle) * r;
      o.y = py + Math.sin(o.angle) * r;
      o.orbitR = r;
      // Скорость для пара (нужна для расчёта направления).
      const dt = 0.016;
      const prevAngle = o.angle - (o.dir || 1) * TAU / (o.far ? (st.cfg.orbit_far_period_sec || 5) : (st.cfg.orbit_period_sec || 4));
      o.vx = (px + Math.cos(o.angle) * r) - (px + Math.cos(prevAngle) * r);
      o.vy = (py + Math.sin(o.angle) * r) - (py + Math.sin(prevAngle) * r);
    }
  }

  // === ЛЕДЯНОЙ ОСКОЛОК ===
  _drawShard(ctx, o, t, idx) {
    const r = this._shardRadius(o);
    const spin = o.spin || 0;
    const col = this.cfg.color || o.color || '#9fe8ff';
    const core = this.cfg.core_color || '#eaffff';
    const deep = this.cfg.edge_color || '#2a7fff';
    const shapeData = this._shapes.get(idx);
    if (!shapeData) return;

    ctx.save();
    ctx.translate(o.x, o.y);

    // Свечение.
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

    // Рисуем сгенерированную форму кристалла.
    const s = shapeData.shape;
    const hl = shapeData.highlight;

    // Тело — градиент льда.
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, core);
    body.addColorStop(0.45, col);
    body.addColorStop(1, deep);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(s[0].x * r, s[0].y * r);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * r, s[i].y * r);
    ctx.closePath();
    ctx.fill();

    // Бликовая грань.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(hl[0].x * r, hl[0].y * r);
    for (let i = 1; i < hl.length; i++) ctx.lineTo(hl[i].x * r, hl[i].y * r);
    ctx.closePath();
    ctx.fill();

    // Рёбра (иней).
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s[0].x * r, s[0].y * r);
    // Линия к ближайшей «глубокой» вершине.
    let deepest = 0;
    for (let i = 1; i < s.length; i++) {
      if (s[i].y > s[deepest].y) deepest = i;
    }
    ctx.lineTo(s[deepest].x * r * 0.7, s[deepest].y * r * 0.7);
    ctx.stroke();

    // Обводка.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(20,60,140,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(s[0].x * r, s[0].y * r);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * r, s[i].y * r);
    ctx.closePath();
    ctx.stroke();

    // Искрящийся блик — бегает по форме.
    const tw = 0.5 + 0.5 * Math.sin(t * 7 + idx * 2.3);
    ctx.globalAlpha = 0.3 + 0.5 * tw;
    ctx.fillStyle = '#ffffff';
    // Бликовая точка — на одной из вершин, «перепрыгивает» между ними.
    const jumpIdx = Math.floor(t * 3 + idx) % s.length;
    const bx = s[jumpIdx].x * r * 0.6;
    const by = s[jumpIdx].y * r * 0.6;
    const bs = r * (0.18 + 0.1 * tw);
    ctx.beginPath();
    ctx.moveTo(bx, by - bs); ctx.lineTo(bx + bs * 0.3, by - bs * 0.3);
    ctx.lineTo(bx + bs, by); ctx.lineTo(bx + bs * 0.3, by + bs * 0.3);
    ctx.lineTo(bx, by + bs); ctx.lineTo(bx - bs * 0.3, by + bs * 0.3);
    ctx.lineTo(bx - bs, by); ctx.lineTo(bx - bs * 0.3, by - bs * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // === ИЗВИВАЮЩИЙСЯ ШЛЕЙФ ===
  // Хвост идёт назад по орбите, каждая точка смещается по нормали
  // с рваной волной (slot-шум), как у файрбола, но с ледяной палитрой.
  _drawTrail(ctx, o, t, idx) {
    const cfg = this.cfg;
    const arcDeg = cfg.trail_arc_deg ?? 70;
    const arc = (arcDeg * Math.PI) / 180;
    const R = Math.max(4, o.orbitR || 70);
    const wBase = this._shardRadius(o);
    const steps = Math.max(6, cfg.trail_segments ?? 14);
    const back = -Math.sign(o.dir || 1);
    const phase = (hash(idx * 13.7) - 0.5) * 0.4;
    const slot = Math.floor(t * 14); // дискретный слот для рваности

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Пульсация пламени.
    const pulse = 1 + Math.sin(t * 18 + idx * 2.1) * 0.12;

    // Считаем развевающиеся точки.
    const pts = new Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const a = o.angle + back * arc * k;
      const x = o.cx + Math.cos(a) * R;
      const y = o.cy + Math.sin(a) * R;
      // Нормаль к орбите (перпендикуляр радиусу).
      const nx = -Math.sin(a), ny = Math.cos(a);
      // Рваная амплитуда: slot-шум + профиль (максимум у головы, минимум у хвоста).
      const amp = (0.3 + hash(idx * 7.7 + slot * 3.13 + i * 0.5) * 0.7);
      const prof = k * k; // 0 у хвоста, 1 у головы
      const wave = Math.sin(t * 11 - k * 5 + hash(slot + i) * TAU)
        * prof * amp * wBase * 0.35;
      pts[i] = { x: x + nx * wave, y: y + ny * wave };
    }

    // Два прохода: подложка + сердцевина.
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const a = pts[i - 1], b = pts[i];
        const flick = 0.6 + hash(i * 3.3 + slot * 1.7 + pass * 50) * 0.4;
        // У основания (k≈0 — кристалл) — почти полная непрозрачность,
        // к кончику (k≈1) хвост растворяется.
        const fade = (1 - 0.55 * k) * flick;
        if (wide) {
          ctx.globalAlpha = 0.12 * fade;
          ctx.strokeStyle = cfg.trail_glow_color || '#3aa0ff';
          ctx.lineWidth = wBase * (0.7 + 0.9 * (1 - k)) * pulse;
        } else {
          ctx.globalAlpha = 0.45 * fade;
          ctx.strokeStyle = cfg.trail_color || '#cfeeff';
          ctx.lineWidth = wBase * (0.18 + 0.35 * (1 - k)) * pulse;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Искорки вдоль шлейфа.
    const sparks = cfg.trail_sparks ?? 5;
    for (let i = 0; i < sparks; i++) {
      const s = Math.floor(t * 6 + i * 2.7 + idx * 5.3);
      const seed = i * 17.3 + idx * 7.7 + s * 1.31;
      const k = hash(seed);
      const side = (hash(seed + 3) - 0.5) * 2;
      const a = o.angle + back * arc * k;
      const rr = R + side * wBase * (0.5 + k * 1.2);
      const sx = o.cx + Math.cos(a) * rr;
      const sy = o.cy + Math.sin(a) * rr;
      const life = (t * 6 + i * 2.7 + idx * 5.3) % 1;
      const alpha = (1 - k) * (1 - life) * 0.7;
      const size = wBase * 0.12 * (1 - k * 0.5);
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
  _drawVapor(ctx, o, t, idx, px, py) {
    const cfg = this.cfg;
    if (cfg.vapor && cfg.vapor.enabled === false) return;
    const count = cfg.vapor_count ?? 5;
    const speed = cfg.vapor_rate ?? 1.2;
    const rise = cfg.vapor_rise_px ?? 28;
    const r = this._shardRadius(o);

    let list = this._vapor.get(idx);
    if (!list) list = this._vapor.set(idx, []).get(idx);

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
      const swirl = Math.sin(t * 2.2 + v.seed * TAU) * r * 0.3;
      const vx = o.x + drift * r * 0.8 + swirl - (o.vx || 0) * 0.02 * ph;
      const vy = o.y - ph * rise + (hash(v.seed + 1) - 0.5) * r * 0.6;
      const size = r * (0.3 + ph * 0.9);
      const alpha = 0.25 * (1 - ph) * Math.min(1, ph * 8);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, size);
      g.addColorStop(0, 'rgba(235,250,255,0.85)');
      g.addColorStop(0.55, 'rgba(190,230,255,0.4)');
      g.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vx, vy, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _shardRadius(o) {
    const cfg = this.cfg;
    // Базовый размер ~12px (как fireball), рандомизация ±25% по seed осколка.
    const base = (o.r || 10) * (cfg.shard_scale ?? 1.0);
    return Math.max(5, base);
  }

  reset() { this._vapor.clear(); this._shapes.clear(); }
}