// Процедурная «Стена огня»: вместо спрайта firewall.png рисуем
// многослойное пламя с языками, угольной полосой, дымом и искрами.
//
// Режимы (game_config.visuals.fire_wall.mode):
//   "always"  — всегда процедурно (текущая настройка);
//   "auto"    — спрайт, если загружен, иначе процедурно;
//   "missing" — процедурно только без спрайта;
//   "never"   — старый путь Game (спрайт/кружки).
//
// Все параметры — в game_config.visuals.fire_wall.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

export class FireWallRenderer {
  constructor(visuals = {}) {
    this.visuals = visuals || {};
  }

  setVisuals(visuals) { this.visuals = visuals || {}; }

  draw(ctx, a, time, assets) {
    if (!ctx || !a || !a.wall) return false;
    const C = (this.visuals && this.visuals.fire_wall) || {};
    if (C.enabled === false || C.mode === 'never') return false;
    if (C.mode !== 'always' && assets && a.spritePath) {
      const missing = assets.isMissing ? assets.isMissing(a.spritePath) : true;
      if (!missing) return false;
    }

    const w = a.wall;
    const now = time || 0;
    const spawnMs = Math.max(1, w.spawnMs || 100);

    // Угольная полоса по линии стены — связывает отдельные огоньки.
    this._drawRidge(ctx, a, C, now);

    // Сначала дым (позади пламени), затем языки огня от краёв к центру.
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w, spawnMs);
      if (alpha <= 0.01) continue;
      this._drawSmoke(ctx, fl, i, C, now, alpha);
    }

    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w, spawnMs);
      if (alpha <= 0.01) continue;
      this._drawFlame(ctx, fl, i, C, now, alpha);
    }

    return true;
  }

  _flameAlpha(fl, w, spawnMs) {
    let alpha = 1;
    if (fl.dying && fl.dieT !== undefined) {
      alpha = Math.max(0, 1 - fl.dieT / spawnMs);
    }
    // Появление: центр раньше краёв.
    const ageMs = (w.age || 0) * 1000;
    const born = ageMs - (fl.spawnT || 0) * spawnMs;
    if (born < 120) alpha *= smoothstep(born / 120);
    return clamp01(alpha);
  }

  _drawRidge(ctx, a, C, t) {
    const w = a.wall;
    if (!w || !(w.totalLen > 1)) return;
    const x1 = a.x - Math.cos(w.angle) * w.halfLen;
    const y1 = a.y - Math.sin(w.angle) * w.halfLen;
    const x2 = a.x + Math.cos(w.angle) * w.halfLen;
    const y2 = a.y + Math.sin(w.angle) * w.halfLen;
    const flick = 0.85 + 0.15 * Math.sin(t * (C.flicker_speed ?? 12) * 0.5);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Широкое тёплое свечение по земле.
    ctx.globalAlpha = (C.ground_glow_alpha ?? 0.30) * flick;
    ctx.strokeStyle = C.ground_glow_color || '#ff7a1a';
    ctx.lineWidth = (C.ground_glow_scale ?? 1.5) * 34;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

    // Угольная подложка.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = C.ground_scorch_color || '#1a0d08';
    ctx.lineWidth = Math.max(8, C.ridge_width_px ?? 26);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

    // Раскалённая середина.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * flick;
    ctx.strokeStyle = C.mid_color || '#ff5a00';
    ctx.lineWidth = Math.max(2, (C.ridge_width_px ?? 26) * 0.25);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  _drawSmoke(ctx, fl, index, C, t, alpha) {
    const h = C.height_px ?? 94;
    const w = C.width_px ?? 44;
    const seed = index * 13.7 + fl.spawnT * 7.1;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 2; i++) {
      const ph = t * (0.75 + hash(seed + i) * 0.45) + hash(seed + i * 2.3) * TAU;
      const rise = (0.35 + 0.65 * hash(seed + i * 4.1));
      const y = fl.y - h * rise;
      const x = fl.x + Math.sin(ph) * w * 0.45 + (i - 0.5) * w * 0.35;
      const rr = w * (0.45 + 0.32 * hash(seed + i * 5.7));
      ctx.globalAlpha = alpha * (C.smoke_alpha ?? 0.20) * (0.45 + 0.55 * hash(seed + i + Math.floor(t)));
      ctx.fillStyle = C.smoke_color || '#3a2b24';
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.68, Math.sin(ph) * 0.25, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawFlame(ctx, fl, index, C, t, alpha) {
    const h = C.height_px ?? 94;
    const w = C.width_px ?? 44;
    const seed = index * 19.3 + fl.spawnT * 5.7;
    const flick = 0.86 + 0.14 * Math.sin(t * (C.flicker_speed ?? 12) + seed * 1.7);
    const sway = Math.sin(t * (C.sway_speed ?? 5) + seed) * w * 0.11;
    const height = h * flick;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;

    // Тёплое пятно у основания.
    const gr = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, w * (C.ground_glow_scale ?? 1.5));
    gr.addColorStop(0, C.ground_glow_color || '#ff7a1a');
    gr.addColorStop(0.35, C.glow_color || '#ff6a00');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (C.glow_alpha ?? 0.45);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(fl.x, fl.y, w * (C.ground_glow_scale ?? 1.5), w * 0.62, 0, 0, TAU);
    ctx.fill();

    // Языки пламени: внешний, средний и горячий.
    const layers = [
      { color: C.base_color || '#7a1500', scale: 1.00, alpha: 0.78, sway: 1.0 },
      { color: C.mid_color || '#ff5a00', scale: 0.73, alpha: 0.85, sway: 1.35 },
      { color: C.hot_color || '#ffc23a', scale: 0.46, alpha: 0.9, sway: 1.7 }
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      ctx.globalAlpha = alpha * L.alpha;
      this._flameShape(ctx, fl.x, fl.y, w * L.scale, height * (0.72 + L.scale * 0.28),
        sway * L.sway, seed + li * 3.1, L.color, Math.max(1, (C.flame_tongues ?? 4) - li));
    }

    // Белое ядро у основания.
    ctx.globalAlpha = alpha * 0.75;
    const core = ctx.createRadialGradient(fl.x, fl.y - height * 0.12, 0, fl.x, fl.y - height * 0.12, w * 0.32);
    core.addColorStop(0, C.core_color || '#fff3b0');
    core.addColorStop(0.5, C.hot_color || '#ffc23a');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(fl.x, fl.y - height * 0.12, w * 0.32, height * 0.22, 0, 0, TAU);
    ctx.fill();

    // Искры, поднимающиеся вверх.
    const n = Math.max(0, Math.floor(C.ember_count ?? 4));
    for (let i = 0; i < n; i++) {
      const ph = (t * (C.ember_speed ?? 22) / 30 + hash(seed + i * 7.7)) % 1;
      const ey = fl.y - ph * height * 1.05;
      const ex = fl.x + Math.sin(ph * 6.2 + seed + i) * w * (0.22 + 0.3 * hash(seed + i));
      const s = Math.max(0.5, w * 0.035 * (0.5 + hash(seed + i * 2.1)));
      ctx.globalAlpha = alpha * (1 - ph) * 0.85;
      ctx.fillStyle = i % 2 ? (C.ember_color || '#ffb347') : (C.core_color || '#fff3b0');
      ctx.beginPath();
      ctx.arc(ex, ey, s, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  // Один язык пламени — волнистый контур, сужающийся кверху.
  _flameShape(ctx, x, y, w, h, sway, seed, color, tongues) {
    const n = Math.max(3, Math.floor(tongues));
    ctx.fillStyle = color;
    for (let t = 0; t < n; t++) {
      const off = (t - (n - 1) / 2) * w * 0.42;
      const localH = h * (0.62 + hash(seed + t * 2.3) * 0.48);
      const side = (t - (n - 1) / 2) * w * 0.22;
      const tipX = x + off + sway + side;
      const tipY = y - localH;
      const baseW = w * (0.70 - Math.abs(t - (n - 1) / 2) * 0.12);
      const ph = hash(seed + t * 4.1) * TAU;

      ctx.beginPath();
      ctx.moveTo(x + off - baseW * 0.5, y);
      // Левая сторона языка с волной.
      ctx.bezierCurveTo(
        x + off - baseW * 0.62, y - localH * 0.28,
        tipX - baseW * 0.28 + Math.sin(ph) * w * 0.08, y - localH * 0.62,
        tipX, tipY
      );
      // Правая сторона.
      ctx.bezierCurveTo(
        tipX + baseW * 0.24 + Math.cos(ph) * w * 0.08, y - localH * 0.58,
        x + off + baseW * 0.58, y - localH * 0.24,
        x + off + baseW * 0.5, y
      );
      ctx.closePath();
      ctx.fill();
    }
  }
}
