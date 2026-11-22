// Визуал заклинания «Смерч».
//
// Пока спрайта нет — рисуется процедурный магический торнадо: светящийся
// синий вихрь из множества тонких колец, спиральные ленты, пыль/частицы,
// редкие молнии внутри и кольцо на земле. Силуэт плавно «дышит» и меняет
// форму во время движения. Когда появится assets/projectiles/tornado.png,
// режим "auto" автоматически начнёт рисовать спрайт (area_sprite +
// area_frames), а молнии можно оставить поверх него.
//
// Все параметры — в skills_config.weapons[].area_visual и .tornado_move.
// Режимы area_visual.mode:
//   "auto"       — спрайт, если он загружен, иначе процедурный смерч;
//   "procedural" — всегда процедурный (удобно, пока спрайта нет);
//   "sprite"     — спрайт, если загружен, иначе процедурный fallback.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Детерминированный «рандом»: молнии и частицы не должны дёргаться
// полностью случайно каждый кадр.
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Цвета в конфиге задаются hex-строками. Для колец нужен плавный переход
// снизу вверх, поэтому небольшой собственный mix без зависимостей.
function parseHexColor(hex) {
  if (typeof hex !== 'string') return [255, 255, 255];
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return [255, 255, 255];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(a, b, t) {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  const k = clamp01(t);
  const r = Math.round(lerp(ca[0], cb[0], k));
  const g = Math.round(lerp(ca[1], cb[1], k));
  const bl = Math.round(lerp(ca[2], cb[2], k));
  return `rgb(${r},${g},${bl})`;
}

export class TornadoRenderer {
  draw(ctx, area, time, assets) {
    if (!ctx || !area) return;
    const visual = area.visual || (area.cfg && area.cfg.area_visual) || {};
    const age = Number.isFinite(area.age) ? area.age : (time || 0);
    const life = this._life(area, visual, age);
    if (life.alpha <= 0.002) return;

    const geom = this._geometry(area, visual, age);
    const img = this._spriteImage(area, visual, assets);
    const groundY = visual.ground_offset_px ?? 6;

    ctx.save();
    ctx.translate(area.x, area.y + groundY);
    ctx.scale(life.scale, life.scale);
    ctx.globalAlpha = life.alpha;

    if (img) {
      this._drawGround(ctx, area, visual, geom, life, age);
      this._drawSprite(ctx, area, img, visual, life, age);
      if (this._lightningEnabled(visual, true)) {
        this._drawLightning(ctx, area, visual, geom, life, age);
      }
      if (visual.particles && visual.particles.enabled !== false && visual.particles.with_sprite) {
        this._drawParticles(ctx, area, visual, geom, life, age);
      }
      ctx.restore();
      return;
    }

    // Процедурный смерч: КЭШ ПОЗЫ. Полная перерисовка (58 колец × 40
    // сегментов + ленты + частицы) стоит десятки мс на слабом GPU/CPU,
    // поэтому рисуем её только при смене квантованного возраста
    // (cache_fps раз/сек), а каждый кадр отдаём один drawImage.
    // life.alpha и life.scale линейны (почти всё рисуется в 'lighter'),
    // поэтому применяются при выводе — появление/исчезновение остаются
    // плавными 60fps.
    const cacheFps = visual.cache_fps ?? 12;
    const qAge = Math.floor(age * cacheFps) / cacheFps;
    const moveAngQ = area.move ? Math.round((area.move.angle || 0) * 10) : 0;
    const seed = area.seed ?? 0;
    const radQ = Math.round(area.radius || 100);
    const key = qAge + '|' + radQ + '|' + seed + '|' + moveAngQ;
    let c = area._tornadoCache;
    if (!c || c.key !== key) {
      if (!c || !c.canvas) {
        if (typeof document === 'undefined') { ctx.restore(); return; }
        c = area._tornadoCache = { canvas: document.createElement('canvas') };
      }
      this._renderTornadoFrame(c, area, visual, qAge, key);
      if (!c.canvas) { ctx.restore(); return; }
    }
    if (c.canvas) {
      ctx.drawImage(c.canvas, c.ox, c.oy, c.w, c.h);
    }
    ctx.restore();
  }

  // Рендер одного кэшируемого кадра смерча (полный масштаб 1:1, alpha=1).
  _renderTornadoFrame(c, area, visual, qAge, key) {
    const geom = this._geometry(area, visual, qAge);
    const lifeFull = { alpha: 1, scale: 1, inK: 1, outK: 1 };
    const radius = area.radius || 100;
    // Границы кадра: воронка рисуется вверх от (0,0) до -height,
    // вниз — земля/тени, в стороны — sway + верхняя ширина.
    const sidePad = (visual.sway_px ?? radius * 0.12)
      + Math.abs(visual.lean_px ?? 0) + Math.abs(visual.move_lean_px ?? 0)
      + (visual.turbulence_px ?? 2) + 10;
    const w = Math.ceil(Math.max(geom.baseHalf, geom.topHalf) * 2 + sidePad * 2);
    const h = Math.ceil(geom.height + radius * 1.3 + 24);
    const ox = -Math.floor(w / 2);
    const oy = -(h - Math.ceil(radius * 0.9)); // (0,0) земли внутри кадра
    if (c.canvas.width !== w || c.canvas.height !== h) {
      c.canvas.width = w; c.canvas.height = h;
    }
    const x = c.canvas.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    x.save();
    x.translate(-ox, -oy);
    this._drawGround(x, area, visual, geom, lifeFull, qAge);
    this._drawFunnel(x, area, visual, geom, lifeFull, qAge);
    if (this._lightningEnabled(visual, false)) {
      this._drawLightning(x, area, visual, geom, lifeFull, qAge);
    }
    if (!visual.particles || visual.particles.enabled !== false) {
      this._drawParticles(x, area, visual, geom, lifeFull, qAge);
    }
    x.restore();
    c.key = key;
    c.w = w; c.h = h; c.ox = ox; c.oy = oy;
  }

  _life(area, visual, age) {
    const ageMs = Math.max(0, age * 1000);
    const ttl = Number.isFinite(area.ttl) ? Math.max(0, area.ttl) : 1e9;
    const inMs = Math.max(1, visual.spawn_ms ?? 260);
    const outMs = Math.max(1, visual.fade_out_ms ?? 900);
    const inK = clamp01(ageMs / inMs);
    const outK = clamp01(ttl / outMs);
    const alpha = (visual.alpha ?? 0.95) * smoothstep(inK) * smoothstep(outK);
    const spawnScale = visual.spawn_scale ?? 0.55;
    const fadeScale = visual.fade_out_scale ?? 0.8;
    const scale = (spawnScale + (1 - spawnScale) * easeOutCubic(inK))
      * (fadeScale + (1 - fadeScale) * smoothstep(outK));
    return {
      alpha: Math.max(0, Math.min(1, alpha)),
      scale: Math.max(0.01, scale),
      inK,
      outK
    };
  }

  _geometry(area, visual, age) {
    const radius = area.radius || 100;
    const morphSpeed = visual.morph_speed ?? 0.85;
    const heightWobble = visual.height_wobble ?? 0.06;
    const widthWobble = visual.width_wobble ?? 0.08;
    const seedPhase = ((area.seed ?? 0) % 997) * 0.013;

    // Силуэт «дышит»: высота и ширина меняются не синхронно, поэтому
    // воронка плавно перетекает из одной формы в другую.
    const heightBase = Math.max(1, visual.height_px ?? radius * 1.8);
    const heightK = 1
      + Math.sin(age * morphSpeed + seedPhase) * heightWobble
      + Math.sin(age * morphSpeed * 1.73 + 2.1 + seedPhase) * heightWobble * 0.45;
    const height = Math.max(1, heightBase * heightK);

    const baseBase = Math.max(1, (visual.base_width_px ?? radius * 0.58) / 2);
    const topBase = Math.max(1, (visual.top_width_px ?? radius * 1.32) / 2);
    const baseHalf = Math.max(1, baseBase * (
      1 + Math.sin(age * morphSpeed * 1.17 + 1.9 + seedPhase) * widthWobble
    ));
    const topHalf = Math.max(1, topBase * (
      1 + Math.sin(age * morphSpeed * 0.91 + 0.4 + seedPhase) * widthWobble
      + Math.sin(age * morphSpeed * 1.53 + 2.7 + seedPhase) * widthWobble * 0.42
    ));

    const sway = visual.sway_px ?? radius * 0.12;
    const swaySpeed = visual.sway_speed ?? 1.4;
    const lean = visual.lean_px ?? 0;
    const leanSpeed = visual.lean_speed ?? 0.55;
    const moveLean = visual.move_lean_px ?? 0;
    const moveAngle = area.move ? (area.move.angle || 0) : 0;
    const spin = visual.spin_speed ?? 2.6;
    const turbulence = visual.turbulence_px ?? 2.0;
    const profilePower = visual.profile_power ?? 0.74;

    const centerAt = (t) => {
      const tt = clamp01(t);
      const swayA = Math.sin(age * swaySpeed + tt * 2.35) * sway * Math.pow(tt, 1.28);
      const swayB = Math.sin(age * swaySpeed * 0.57 + tt * 4.6 + 1.7)
        * sway * 0.34 * Math.sin(Math.PI * tt);
      const leanA = (Math.sin(age * leanSpeed) + Math.sin(age * leanSpeed * 0.63 + 1.1) * 0.35)
        * lean * Math.pow(tt, 1.45);
      // Лёгкий наклон по направлению движения: при повороте смерча
      // его верхушка плавно перетекает в сторону.
      const moveA = Math.cos(moveAngle) * moveLean * Math.pow(tt, 1.55);
      return swayA + swayB + leanA + moveA;
    };
    const halfAt = (t) => {
      const tt = clamp01(t);
      const base = lerp(baseHalf, topHalf, Math.pow(tt, profilePower));
      const ripple = (
        Math.sin(age * 3.7 + tt * 8.4) * 0.62
        + Math.sin(age * 6.3 + tt * 15.1 + 1.3) * 0.38
      ) * turbulence * (0.18 + 0.82 * tt);
      return Math.max(1, base + ripple);
    };

    return {
      radius, height, baseHalf, topHalf, sway, spin, age,
      morphSpeed, profilePower, centerAt, halfAt
    };
  }

  _spriteImage(area, visual, assets) {
    if (!assets || !area.spritePath) return null;
    const mode = visual.mode || 'auto';
    if (mode === 'procedural') return null;
    const img = assets.get(area.spritePath);
    if (!img || img.tagName !== 'IMG') return null;
    return img;
  }

  // Точка кольца с мягкой волной радиуса. Небольшая неоднородность не даёт
  // кольцам выглядеть как идеальные геометрические эллипсы.
  _ringPoint(a, cx, cy, rx, ry, rot, phase, wobble) {
    const radial = 1
      + wobble * Math.sin(a * 3 + phase)
      + wobble * 0.55 * Math.sin(a * 5 - phase * 1.37);
    const px = Math.cos(a) * rx * radial;
    // Лёгкая вертикальная волна «заламывает» кольцо в плоскости экрана:
    // так верхние витки выглядят живыми, а не нарисованными циркулем.
    const py = Math.sin(a) * ry * (1 + wobble * 0.45 * Math.sin(a * 2 + phase * 1.7))
      + ry * wobble * 0.72 * Math.sin(a * 3 - phase * 0.83);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { x: cx + px * c - py * s, y: cy + px * s + py * c };
  }

  _ringPath(ctx, cx, cy, rx, ry, rot, phase, wobble, segments) {
    const n = Math.max(12, Math.floor(segments));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const p = this._ringPoint(a, cx, cy, rx, ry, rot, phase, wobble);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  _ringArc(ctx, cx, cy, rx, ry, rot, phase, wobble, segments, a0, a1) {
    const span = Math.max(0.001, a1 - a0);
    const steps = Math.max(8, Math.ceil(segments * (span / TAU) * 1.5));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (span * i) / steps;
      const p = this._ringPoint(a, cx, cy, rx, ry, rot, phase, wobble);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }

  _ringColor(visual, t) {
    const bottom = visual.ring_color_bottom || visual.funnel_bottom || '#0a4bff';
    const mid = visual.ring_color_mid || visual.funnel_mid || '#18b8ff';
    const top = visual.ring_color_top || visual.funnel_top || '#c8fbff';
    const k = clamp01(t);
    return k < 0.5
      ? mixColor(bottom, mid, k * 2)
      : mixColor(mid, top, (k - 0.5) * 2);
  }

  _lightningEnabled(visual, sprite) {
    const l = visual.lightning;
    if (!l || l.enabled === false) return false;
    if (sprite && l.with_sprite === false) return false;
    return true;
  }

  _drawGround(ctx, area, visual, geom, life, age) {
    const baseHalf = geom.baseHalf;
    const ringColor = visual.ground_ring_color || area.color || '#88ccff';

    // Тень у основания.
    ctx.save();
    ctx.globalAlpha *= 0.30;
    ctx.fillStyle = visual.shadow_color || 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 2, baseHalf * 2.2, Math.max(2, baseHalf * 0.55), 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (visual.ground_ring !== false) {
      const r = Math.max(2, geom.radius * (visual.ground_ring_radius_scale ?? 0.9));
      const ry = Math.max(1, r * (visual.ground_ring_aspect ?? 0.34));
      const ringAlpha = visual.ground_ring_alpha ?? 0.22;

      // Мягкая заливка земли под воронкой.
      ctx.save();
      ctx.globalAlpha *= ringAlpha * 0.35;
      ctx.fillStyle = ringColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, ry, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Внешнее пунктирное кольцо.
      ctx.save();
      ctx.globalAlpha *= ringAlpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = -age * 18;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, ry, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha *= 0.65;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.72, ry * 0.72, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // Рунические насечки по кольцу.
      ctx.save();
      ctx.globalAlpha *= ringAlpha * 0.8;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const a = age * 0.7 + (i * TAU) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * ry * 0.82);
        ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * ry * 0.95);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Пульс появления: кольцо разбегается в начале каста.
    const spawnSec = Math.max(0.001, (visual.spawn_ms ?? 260) / 1000);
    if (age < spawnSec) {
      const k = clamp01(age / spawnSec);
      ctx.save();
      ctx.globalAlpha *= (1 - k) * 0.40;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      const r = geom.radius * (0.2 + k * 1.05);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.34, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawFunnel(ctx, area, visual, geom, life, age) {
    const { height, baseHalf, topHalf, spin, centerAt, halfAt } = geom;
    const steps = Math.max(6, Math.floor(visual.silhouette_segments ?? 18));

    // Мягкое синее свечение за вихрем.
    const glowAlpha = visual.glow_alpha ?? 0;
    if (glowAlpha > 0) {
      const gx = centerAt(0.56);
      const gy = -height * 0.55;
      const gr = Math.max(topHalf * 1.45, height * 0.55);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life.alpha * glowAlpha;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, visual.glow_color || '#1a8cff');
      gg.addColorStop(0.42, visual.glow_mid_color || '#0a3dff');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Полупрозрачный объём воронки: не забивает кольца, но даёт глубину.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= (visual.funnel_alpha ?? 0.10);
    const body = ctx.createLinearGradient(0, 0, 0, -height);
    body.addColorStop(0, visual.funnel_bottom || '#031a6b');
    body.addColorStop(0.55, visual.funnel_mid || '#0066ff');
    body.addColorStop(1, visual.funnel_top || '#8ff4ff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(centerAt(0) - baseHalf, 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) - halfAt(t), -t * height);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) + halfAt(t), -t * height);
    }
    ctx.closePath();
    ctx.fill();

    // Едва заметная кромка, чтобы силуэт не был «пластиковым».
    ctx.globalAlpha *= 0.62;
    ctx.strokeStyle = visual.ring_color_top || visual.funnel_top || '#c8fbff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Светящаяся внутренняя дымка.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= (visual.inner_alpha ?? 0.10);
    const inner = ctx.createLinearGradient(0, 0, 0, -height);
    inner.addColorStop(0, 'rgba(0,0,0,0)');
    inner.addColorStop(0.35, visual.funnel_mid || '#0066ff');
    inner.addColorStop(0.75, visual.core_color || '#eaffff');
    inner.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(centerAt(0) - baseHalf * 0.36, 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) - halfAt(t) * 0.55, -t * height);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) + halfAt(t) * 0.55, -t * height);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Главная часть — множество тонких светящихся колец. Чем ближе к
    // основанию, тем плотнее: так вихрь читается как закрученная спираль.
    const ringCount = Math.max(4, Math.floor(visual.ring_count ?? visual.bands ?? 44));
    const segments = Math.max(12, Math.floor(visual.ring_segments ?? 36));
    const spacingPower = visual.ring_spacing_power ?? 1.32;
    const ringWidth = Math.max(0.4, visual.ring_width_px ?? 1.15);
    const ringGlowWidth = Math.max(0, visual.ring_glow_width_px ?? 6);
    const ringAlpha = visual.ring_alpha ?? visual.band_alpha ?? 0.5;
    const ringGlowAlpha = visual.ring_glow_alpha ?? 0.10;
    const highlightAlpha = visual.ring_highlight_alpha ?? 0.8;
    const highlightWidth = Math.max(0.4, visual.ring_highlight_width_px ?? 1.6);
    const wobble = Math.max(0.001, visual.ring_wobble ?? 0.035);
    const tiltBase = visual.ring_tilt ?? 0.14;
    const tiltSpeed = visual.ring_tilt_speed ?? 0.65;
    const squash = visual.ring_vertical_squash ?? 0.24;
    const offsetPx = visual.ring_offset_px ?? 2;
    const topBoost = visual.top_ring_boost ?? 1.07;
    const glowColor = visual.ring_glow_color || visual.glow_color || '#1a8cff';
    const highlightColor = visual.ring_highlight_color || '#f2ffff';
    const seed = area.seed ?? 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < ringCount; i++) {
      const u = (i + 0.5) / ringCount;
      const t = Math.pow(u, spacingPower);
      const y = -t * height;
      const topK = t > 0.92 ? lerp(1, topBoost, (t - 0.92) / 0.08) : 1;
      const half = Math.max(1, halfAt(t) * topK);
      const ry = Math.max(
        1,
        half * squash * (0.86 + 0.22 * Math.sin(age * 0.63 + t * 5.7 + seed * 0.001))
      );
      const cx = centerAt(t)
        + Math.sin(age * 0.9 + t * 3.1 + i * 0.23) * offsetPx * (0.2 + 0.8 * t);
      const rot = tiltBase * Math.sin(age * tiltSpeed + t * 4.2 + i * 0.07)
        * (0.35 + 0.65 * t);
      const phase = seed * 0.0007 + age * spin * 0.55 + t * 6.4 + i * 0.41;
      const alphaK = life.alpha
        * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t)))
        * (0.82 + 0.18 * hash(seed + i * 1.7));

      if (ringGlowWidth > 0 && ringGlowAlpha > 0) {
        ctx.globalAlpha = Math.min(1, alphaK * ringGlowAlpha * (0.55 + 0.45 * t));
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = ringGlowWidth * (0.72 + 0.42 * t);
        this._ringPath(ctx, cx, y, half, ry, rot, phase, wobble, segments);
        ctx.stroke();
      }

      ctx.globalAlpha = Math.min(1, alphaK * ringAlpha * (0.38 + 0.62 * t));
      ctx.strokeStyle = this._ringColor(visual, t);
      ctx.lineWidth = ringWidth * (0.82 + 0.35 * t);
      this._ringPath(ctx, cx, y, half, ry, rot, phase, wobble, segments);
      ctx.stroke();

      // Яркая дуга с одной стороны кольца — ощущение вращения и блика.
      if (highlightAlpha > 0 && (i % 2 === 0 || t > 0.82)) {
        const a0 = age * spin * 1.1 + i * 0.9 + t * 2.4;
        const span = 0.75 + 0.45 * hash(seed + i * 2.3);
        ctx.globalAlpha = Math.min(1, alphaK * highlightAlpha * (0.35 + 0.65 * t));
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = highlightWidth * (0.8 + 0.4 * t);
        this._ringArc(ctx, cx, y, half, ry, rot, phase, wobble, segments, a0, a0 + span);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Спиральные ленты, обвивающие вихрь.
    const ribbons = Math.max(0, Math.floor(visual.ribbons ?? 2));
    if (ribbons > 0) {
      const segs = Math.max(16, Math.floor(visual.ribbon_segments ?? 44));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let k = 0; k < ribbons; k++) {
        const phase0 = age * spin * 1.15 + (k * TAU) / ribbons;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = Math.min(
            1,
            life.alpha * (visual.ribbon_alpha ?? 0.18) * (pass === 0 ? 0.45 : 1)
          );
          ctx.strokeStyle = pass === 0
            ? glowColor
            : (visual.ribbon_color || '#bff6ff');
          ctx.lineWidth = pass === 0
            ? Math.max(1, visual.ribbon_glow_width_px ?? 4)
            : Math.max(0.5, visual.ribbon_width_px ?? 1.2);
          ctx.beginPath();
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const half = halfAt(t);
            const ry = Math.max(1, half * squash);
            const ang = phase0 + t * TAU * 1.35;
            const x = centerAt(t) + Math.cos(ang) * half * 0.96;
            const y = -t * height + Math.sin(ang) * ry * 0.95;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Светящееся ядро внутри воронки.
    const coreAlpha = visual.core_alpha ?? 0.22;
    if (coreAlpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= coreAlpha;
      const coreCx = centerAt(0.58);
      const coreCy = -height * 0.58;
      const coreR = Math.max(baseHalf * 1.4, topHalf * 0.55);
      const core = ctx.createRadialGradient(coreCx, coreCy, 0, coreCx, coreCy, coreR);
      core.addColorStop(0, 'rgba(255,255,255,0.85)');
      core.addColorStop(0.22, visual.core_color || '#eaffff');
      core.addColorStop(0.62, visual.glow_color || '#1a8cff');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(coreCx, coreCy, coreR, height * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Крупные верхние кольца вместо «облачной» шапки.
    const crownAlpha = visual.top_cloud_alpha ?? 0.24;
    if (crownAlpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const t = 1 - k * 0.018;
        const half = halfAt(1) * (1.02 + k * 0.045);
        const cy = -height + k * 1.5;
        const cx = centerAt(1) + Math.sin(age * 0.52 + k * 2.0) * topHalf * 0.045;
        const ry = Math.max(1, half * squash * (1.15 + k * 0.12));
        const rot = tiltBase * 1.35 * Math.sin(age * 0.45 + k * 1.6);
        const phase = seed * 0.0007 + age * spin * 0.4 + t * 5.1 + k * 1.2;
        ctx.globalAlpha = Math.min(1, life.alpha * crownAlpha * (0.55 - k * 0.12));
        ctx.strokeStyle = k === 0
          ? highlightColor
          : (visual.ring_color_top || visual.funnel_top || '#c8fbff');
        ctx.lineWidth = 2.2 - k * 0.45;
        this._ringPath(ctx, cx, cy, half, ry, rot, phase, wobble, segments);
        ctx.stroke();
        if (k === 0) {
          ctx.globalAlpha = Math.min(1, life.alpha * crownAlpha * 0.08);
          ctx.fillStyle = visual.ring_color_top || visual.funnel_top || '#c8fbff';
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  _drawSprite(ctx, area, img, visual, life, age) {
    const sizeW = Math.max(1, visual.sprite_width_px ?? visual.sprite_size_px ?? (area.radius || 100) * 1.9);
    const sizeH = Math.max(1, visual.sprite_height_px ?? visual.sprite_size_px ?? (area.radius || 100) * 1.9);
    const anchor = visual.sprite_anchor || 'center';
    const offsetY = visual.sprite_offset_y_px ?? 0;
    const dx = -sizeW / 2;
    const dy = anchor === 'bottom' ? -sizeH + offsetY : -sizeH / 2 + offsetY;

    // Мягкое свечение под спрайтом (если спрайт тёмный).
    const glowAlpha = visual.sprite_glow_alpha ?? 0;
    if (glowAlpha > 0) {
      const gx = 0;
      const gy = dy + sizeH * 0.55;
      const gr = Math.max(2, sizeW * 0.65);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life.alpha * glowAlpha;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, visual.core_color || '#eaffff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Кадр из area_frames (idle-анимация), чтобы будущий спрайт
    // заработал без правок кода.
    const f = area.frames || (area.cfg && area.cfg.area_frames) || null;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (f && f.animations) {
      const anim = f.animations.idle || null;
      const fw = Math.max(1, f.frame_width || img.width);
      const fh = Math.max(1, f.frame_height || img.height);
      const cols = Math.max(1, f.columns || 1);
      if (anim) {
        const frames = Math.max(1, anim.frames || 1);
        const fps = Math.max(0.01, anim.fps || 12);
        const frame = Math.floor(age * fps) % frames;
        const col = frame % cols;
        const rows = Math.max(1, f.rows || Math.floor(img.height / fh));
        const row = Math.min(rows - 1, (anim.row || 0) + Math.floor(frame / cols));
        sx = col * fw;
        sy = row * fh;
        sw = fw;
        sh = fh;
      } else {
        sw = fw;
        sh = fh;
      }
    }

    ctx.save();
    ctx.globalAlpha = life.alpha * (visual.sprite_alpha ?? 1);
    const rot = age * (visual.sprite_rotation_speed ?? 0);
    if (rot) {
      const cy = dy + sizeH / 2;
      ctx.translate(0, cy);
      ctx.rotate(rot);
      ctx.drawImage(img, sx, sy, sw, sh, -sizeW / 2, -sizeH / 2, sizeW, sizeH);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sizeW, sizeH);
    }
    ctx.restore();
  }

  _drawLightning(ctx, area, visual, geom, life, age) {
    const l = visual.lightning || {};
    const { height, centerAt, halfAt } = geom;
    const bolts = Math.max(1, Math.floor(l.bolts ?? 2));
    const interval = Math.max(20, l.interval_ms ?? 160);
    const chance = l.chance ?? 0.75;
    const boltAlpha = life.alpha * (l.alpha ?? 1);
    const seedBase = (area.seed ?? 1) + Math.floor((age * 1000) / interval) * 31.7;

    for (let j = 0; j < bolts; j++) {
      const s = seedBase + j * 101.3;
      if (hash(s) > chance) continue;

      const t0 = 0.12 + hash(s + 1) * 0.70;
      const t1 = Math.min(0.98, t0 + 0.06 + hash(s + 2) * 0.35);
      const y0 = -t0 * height;
      const y1 = -t1 * height;
      const half0 = halfAt(t0) * 0.72;
      const half1 = halfAt(t1) * 0.72;
      const x0 = centerAt(t0) + (hash(s + 3) * 2 - 1) * half0;
      const x1 = centerAt(t1) + (hash(s + 4) * 2 - 1) * half1;

      // Вспышка внутри воронки.
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const flashR = Math.max(6, l.flash_radius_px ?? 34);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = boltAlpha * (l.flash_alpha ?? 0.12);
      const fg = ctx.createRadialGradient(mx, my, 0, mx, my, flashR);
      fg.addColorStop(0, l.glow_color || '#2f9fff');
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(mx, my, flashR, 0, TAU);
      ctx.fill();
      ctx.restore();

      this._drawBolt(
        ctx, x0, y0, x1, y1,
        Math.max(3, Math.floor(l.segments ?? 7)),
        l.amp_px ?? 11,
        s + 5,
        l.color || '#f2fbff',
        l.width_px ?? 1.7,
        l.glow_width_px ?? 5.5,
        l.glow_color || '#2f9fff',
        boltAlpha
      );
    }
  }

  _drawBolt(ctx, x0, y0, x1, y1, segments, amp, seed, color, width, glowWidth, glowColor, alpha) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const pts = [{ x: x0, y: y0 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const off = (hash(seed + i * 1.73) * 2 - 1) * amp * Math.sin(Math.PI * t);
      pts.push({ x: x0 + dx * t + nx * off, y: y0 + dy * t + ny * off });
    }
    pts.push({ x: x1, y: y1 });

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    // Цветное свечение.
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = Math.max(1, glowWidth);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Белое ядро.
    ctx.globalAlpha = alpha * 0.95;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, width);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawParticles(ctx, area, visual, geom, life, age) {
    const p = visual.particles || {};
    if (p.enabled === false) return;
    const count = Math.max(0, Math.floor(p.count ?? 18));
    if (!count) return;
    const { height, centerAt, halfAt, spin } = geom;
    const seed = area.seed ?? 1;
    const baseSize = Math.max(0.4, p.size_px ?? 1.6);
    const rise = p.rise_speed ?? 0.22;
    const spinMul = p.spin_speed ?? 5.2;
    const alphaMul = p.alpha ?? 0.6;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const s = seed + i * 37.1;
      const t = (hash(s) + age * rise * (0.7 + hash(s + 1) * 0.6)) % 1;
      const ang = age * spinMul + i * 2.1 + t * 5.5;
      const half = halfAt(t);
      const x = centerAt(t) + Math.cos(ang) * half * (0.72 + hash(s + 2) * 0.22);
      const y = -t * height + Math.sin(ang) * half * 0.17;
      const twinkle = 0.55 + 0.45 * Math.sin(age * 9 + i * 1.7);
      const a = life.alpha * alphaMul * (0.25 + 0.75 * (1 - t)) * twinkle;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = (i % 5 === 0)
        ? (p.debris_color || '#4fd6ff')
        : (p.color || '#bff8ff');
      const size = baseSize * (0.6 + (1 - t) * 0.8);
      ctx.beginPath();
      ctx.arc(x, y, size * 1.9, 0, TAU);
      ctx.fillStyle = p.glow_color || '#1a8cff';
      ctx.globalAlpha *= 0.22;
      ctx.fill();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = (i % 5 === 0)
        ? (p.debris_color || '#4fd6ff')
        : (p.color || '#bff8ff');
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
