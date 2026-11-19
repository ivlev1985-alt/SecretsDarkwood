// Визуал заклинания «Смерч».
//
// Пока спрайта нет — рисуется процедурный магический торнадо: воронка,
// спиральные ленты, пыль/частицы, произвольные молнии внутри и рунное кольцо
// на земле. Когда появится assets/projectiles/tornado.png, режим "auto"
// автоматически начнёт рисовать спрайт (area_sprite + area_frames), а молнии
// можно оставить поверх него.
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

    this._drawGround(ctx, area, visual, geom, life, age);

    if (img) {
      this._drawSprite(ctx, area, img, visual, life, age);
      if (this._lightningEnabled(visual, true)) {
        this._drawLightning(ctx, area, visual, geom, life, age);
      }
      if (visual.particles && visual.particles.enabled !== false && visual.particles.with_sprite) {
        this._drawParticles(ctx, area, visual, geom, life, age);
      }
    } else {
      this._drawFunnel(ctx, area, visual, geom, life, age);
      if (this._lightningEnabled(visual, false)) {
        this._drawLightning(ctx, area, visual, geom, life, age);
      }
      if (!visual.particles || visual.particles.enabled !== false) {
        this._drawParticles(ctx, area, visual, geom, life, age);
      }
    }

    ctx.restore();
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
    const height = Math.max(1, visual.height_px ?? radius * 1.8);
    const baseHalf = Math.max(1, (visual.base_width_px ?? radius * 0.58) / 2);
    const topHalf = Math.max(1, (visual.top_width_px ?? radius * 1.32) / 2);
    const sway = visual.sway_px ?? radius * 0.1;
    const swaySpeed = visual.sway_speed ?? 1.7;
    const spin = visual.spin_speed ?? 2.8;
    const turbulence = visual.turbulence_px ?? 1.5;

    const centerAt = (t) => {
      const tt = clamp01(t);
      return Math.sin(age * swaySpeed + tt * 2.4) * sway * Math.pow(tt, 1.35);
    };
    const halfAt = (t) => {
      const tt = clamp01(t);
      const base = lerp(baseHalf, topHalf, tt);
      const ripple = Math.sin(age * 4.2 + tt * 9.3) * turbulence * (0.25 + 0.75 * tt);
      return Math.max(1, base + ripple);
    };

    return { radius, height, baseHalf, topHalf, sway, spin, age, centerAt, halfAt };
  }

  _spriteImage(area, visual, assets) {
    if (!assets || !area.spritePath) return null;
    const mode = visual.mode || 'auto';
    if (mode === 'procedural') return null;
    const img = assets.get(area.spritePath);
    if (!img || img.tagName !== 'IMG') return null;
    return img;
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
    const steps = Math.max(4, Math.floor(visual.silhouette_segments ?? 14));

    // Магическое свечение за воронкой — помогает читаться на тёмном фоне.
    const glowAlpha = visual.glow_alpha ?? 0;
    if (glowAlpha > 0) {
      const gx = centerAt(0.55);
      const gy = -height * 0.55;
      const gr = Math.max(topHalf * 1.4, height * 0.55);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life.alpha * glowAlpha;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, visual.glow_color || '#8f7bff');
      gg.addColorStop(0.55, visual.glow_color || '#8f7bff');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // «Облачная» шапка.
    const topX = centerAt(1);
    const topY = -height;
    ctx.save();
    ctx.globalAlpha *= (visual.top_cloud_alpha ?? 0.18);
    ctx.fillStyle = visual.funnel_top || '#a8e8ff';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + age * 0.3;
      const dx = Math.cos(a) * topHalf * 0.45;
      const dy = Math.sin(a) * topHalf * 0.08;
      ctx.beginPath();
      ctx.ellipse(
        topX + dx, topY + dy,
        topHalf * (0.58 + 0.15 * Math.sin(a)),
        Math.max(2, topHalf * 0.18),
        0, 0, TAU
      );
      ctx.fill();
    }
    ctx.restore();

    // Внешний силуэт воронки.
    ctx.save();
    ctx.globalAlpha *= (visual.funnel_alpha ?? 0.22);
    const grad = ctx.createLinearGradient(0, 0, 0, -height);
    grad.addColorStop(0, visual.funnel_bottom || '#2a1a6a');
    grad.addColorStop(0.55, visual.funnel_mid || '#6b4ad6');
    grad.addColorStop(1, visual.funnel_top || '#a8e8ff');
    ctx.fillStyle = grad;
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

    // Мягкая кромка.
    ctx.globalAlpha *= 0.75;
    ctx.strokeStyle = visual.funnel_top || '#a8e8ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Внутренняя, более светлая воронка.
    ctx.save();
    ctx.globalAlpha *= (visual.inner_alpha ?? 0.12);
    const inner = ctx.createLinearGradient(0, 0, 0, -height);
    inner.addColorStop(0, visual.funnel_mid || '#6b4ad6');
    inner.addColorStop(1, visual.core_color || '#eaffff');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(centerAt(0) - baseHalf * 0.55, 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) - halfAt(t) * 0.62, -t * height);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(centerAt(t) + halfAt(t) * 0.62, -t * height);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Кольца-вихри: создают ощущение вращения.
    const bands = Math.max(2, Math.floor(visual.bands ?? 12));
    ctx.save();
    for (let i = 0; i < bands; i++) {
      const t = (i + 0.5) / bands;
      const y = -t * height;
      const half = halfAt(t);
      const ry = Math.max(1, half * 0.18);
      const cx = centerAt(t);
      const fade = 0.35 + 0.65 * (1 - t);
      ctx.globalAlpha = life.alpha * (visual.band_alpha ?? 0.16) * fade;
      ctx.strokeStyle = i % 2 === 0
        ? (visual.band_color || '#c9b6ff')
        : (visual.band_color_alt || visual.funnel_top || '#a8e8ff');
      ctx.lineWidth = 1.1 + 1.6 * (1 - t);
      ctx.beginPath();
      ctx.ellipse(cx, y, half, ry, 0, 0, TAU);
      ctx.stroke();

      // Яркая дуга на кольце.
      ctx.globalAlpha *= 0.9;
      ctx.strokeStyle = visual.core_color || '#eaffff';
      ctx.lineWidth = 0.8 + 0.8 * (1 - t);
      const a0 = age * spin + i * 0.9;
      ctx.beginPath();
      ctx.ellipse(cx, y, half, ry, 0, a0, a0 + 1.1);
      ctx.stroke();
    }
    ctx.restore();

    // Спиральные ленты, обвивающие воронку.
    const ribbons = Math.max(0, Math.floor(visual.ribbons ?? 3));
    if (ribbons > 0) {
      const segs = 32;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < ribbons; k++) {
        ctx.globalAlpha = life.alpha * (visual.ribbon_alpha ?? 0.35);
        ctx.strokeStyle = visual.ribbon_color || '#d8f1ff';
        ctx.lineWidth = visual.ribbon_width_px ?? 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const ang = age * spin * 1.25 + (k * TAU) / ribbons + t * TAU * 1.7;
          const half = halfAt(t);
          const x = centerAt(t) + Math.cos(ang) * half * 0.9;
          const y = -t * height + Math.sin(ang) * half * 0.18;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Светящееся ядро.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= (visual.core_alpha ?? 0.35);
    const core = ctx.createLinearGradient(0, 0, 0, -height);
    core.addColorStop(0, 'rgba(255,255,255,0)');
    core.addColorStop(0.45, visual.core_color || '#eaffff');
    core.addColorStop(1, visual.funnel_top || '#a8e8ff');
    ctx.fillStyle = core;
    const coreCx = centerAt(0.55);
    ctx.beginPath();
    ctx.ellipse(coreCx, -height * 0.55, Math.max(2, baseHalf * 0.55), height * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
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
      ctx.globalAlpha = life.alpha * (l.flash_alpha ?? 0.12);
      const fg = ctx.createRadialGradient(mx, my, 0, mx, my, flashR);
      fg.addColorStop(0, l.glow_color || '#8f7bff');
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
        l.glow_color || '#8f7bff',
        life.alpha
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
    for (let i = 0; i < count; i++) {
      const s = seed + i * 37.1;
      const t = (hash(s) + age * rise * (0.7 + hash(s + 1) * 0.6)) % 1;
      const ang = age * spinMul + i * 2.1 + t * 5.5;
      const half = halfAt(t);
      const x = centerAt(t) + Math.cos(ang) * half * (0.72 + hash(s + 2) * 0.22);
      const y = -t * height + Math.sin(ang) * half * 0.17;
      const twinkle = 0.55 + 0.45 * Math.sin(age * 9 + i * 1.7);
      const a = life.alpha * alphaMul * (1 - t) * twinkle;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = (i % 4 === 0)
        ? (p.debris_color || '#b08a6a')
        : (p.color || '#d8f1ff');
      ctx.beginPath();
      ctx.arc(x, y, baseSize * (0.6 + (1 - t) * 0.7), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
