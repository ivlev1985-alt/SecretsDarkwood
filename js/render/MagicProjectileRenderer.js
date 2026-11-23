// Процедурная отрисовка магических снарядов: «Магический снаряд»,
// «Тайная нова» и «Цепная молния». Спрайты больше не используются, пока
// в game_config.visuals.<weapon>.mode стоит "always".
//
// Режимы:
//   "always"  — всегда рисовать процедурно (текущая настройка);
//   "auto"    — спрайт, если он загружен, иначе процедурно;
//   "missing" — процедурно только при отсутствии спрайта;
//   "never"   — не перехватывать отрисовку (используется старый путь Game).
//
// Все цвета, размеры, скорости и тайминги — в game_config.visuals.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class MagicProjectileRenderer {
  constructor(visuals = {}) {
    this.visuals = visuals || {};
  }

  setVisuals(visuals) { this.visuals = visuals || {}; }

  draw(ctx, p, time, assets) {
    if (!ctx || !p) return false;
    const cfg = this.visuals && this.visuals[p.weaponId];
    if (!cfg || cfg.enabled === false || cfg.mode === 'never') return false;

    // "auto"/"missing" оставляют возможность вернуть будущий спрайт через JSON.
    if (cfg.mode !== 'always' && assets && p.spritePath) {
      const missing = assets.isMissing ? assets.isMissing(p.spritePath) : true;
      if (!missing) return false;
    }

    if (p.weaponId === 'magic_bolt') this._drawMagicBolt(ctx, p, time || 0, cfg);
    else if (p.weaponId === 'arcane_nova' && p.nova) this._drawNova(ctx, p, time || 0, cfg);
    else if (p.weaponId === 'lightning_chain') this._drawLightning(ctx, p, time || 0, cfg);
    else return false;
    return true;
  }

  _trail(p, key, max) {
    let tr = p[key];
    if (!tr) tr = p[key] = [];
    const last = tr[tr.length - 1];
    if (!last || Math.abs(p.x - last.x) > 0.35 || Math.abs(p.y - last.y) > 0.35) {
      tr.push({ x: p.x, y: p.y });
      while (tr.length > Math.max(2, max)) tr.shift();
    }
    return tr;
  }

  _glow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // ===================== МАГИЧЕСКИЙ СНАРЯД =====================

  _drawMagicBolt(ctx, p, t, C) {
    const r = Math.max(3, (p.radius || 6) * (C.orb_scale ?? 1.1));
    if (p.exploding) {
      this._impact(ctx, p, C, C.impact_color || '#d8a6ff');
      return;
    }

    const tr = this._trail(p, '_mbTrail', C.trail_length ?? 12);
    const tw = Math.max(1, C.trail_width_px ?? 4);
    const ta = C.trail_alpha ?? 0.55;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Двойной хвост: широкое фиолетовое свечение + яркая сердцевина.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        const a = tr[i - 1], b = tr[i];
        const flick = 0.65 + 0.35 * Math.sin(t * 16 + i * 2.1);
        ctx.globalAlpha = ta * flick * (pass === 0 ? 0.32 : 0.75) * Math.pow(k, 1.3);
        ctx.strokeStyle = pass === 0 ? (C.glow_color || '#9b4dff') : (C.trail_color || '#b86bff');
        ctx.lineWidth = tw * (pass === 0 ? 2.4 : 0.85) * (0.35 + k * 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.translate(p.x, p.y);
    const ang = Math.atan2(p.vy, p.vx) || 0;
    ctx.rotate(ang);

    const pulse = 1 + Math.sin(t * (C.pulse_speed ?? 7)) * 0.07;
    const gr = r * (C.glow_scale ?? 3.2) * pulse;
    this._glow(ctx, 0, 0, gr, C.glow_color || '#9b4dff');

    // Вытянутое вперёд ядро — снаряд читается как «летящая искра».
    ctx.save();
    ctx.scale(1.35, 0.9);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
    core.addColorStop(0, C.core_color || '#fff4ff');
    core.addColorStop(0.42, C.inner_color || '#d38bff');
    core.addColorStop(0.8, C.mid_color || '#8a3cff');
    core.addColorStop(1, C.outer_color || '#3b0a78');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Вращающийся ободок из двух дуг.
    ctx.save();
    ctx.rotate(t * (C.halo_rotation_speed ?? 4));
    ctx.globalAlpha = C.halo_alpha ?? 0.55;
    ctx.strokeStyle = C.rune_color || C.inner_color || '#e7c8ff';
    ctx.lineWidth = Math.max(0.7, C.rune_width_px ?? 1.1);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (C.rune_radius_scale ?? 1.55), i * Math.PI, i * Math.PI + Math.PI * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // Короткие рунические насечки.
    const runes = Math.max(0, Math.floor(C.rune_arcs ?? 3));
    ctx.strokeStyle = C.rune_color || '#e7c8ff';
    ctx.lineWidth = Math.max(0.6, (C.rune_width_px ?? 1.1) * 0.85);
    for (let i = 0; i < runes; i++) {
      const a = t * 2.4 + (i / runes) * TAU;
      const rr = r * (C.rune_radius_scale ?? 1.55);
      ctx.globalAlpha = (C.halo_alpha ?? 0.55) * (0.45 + 0.55 * hash(i + 3));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr * 0.84, Math.sin(a) * rr * 0.84);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.stroke();
    }

    // Искры-спутники.
    const sparks = Math.max(0, Math.floor(C.spark_count ?? 5));
    for (let i = 0; i < sparks; i++) {
      const a = t * (C.spark_orbit_speed ?? 5) + (i / sparks) * TAU;
      const sr = (C.spark_orbit_radius_px ?? 8) * (0.6 + hash(i * 9.1) * 0.7);
      const s = Math.max(0.5, r * (0.1 + hash(i * 3.3) * 0.09));
      ctx.globalAlpha = 0.35 + 0.45 * hash(i + Math.floor(t * 12));
      ctx.fillStyle = i % 2 ? (C.core_color || '#fff4ff') : (C.inner_color || '#d38bff');
      ctx.beginPath();
      ctx.arc(Math.cos(a) * sr, Math.sin(a) * sr, s, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Нежный блик впереди — направление полёта.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = C.inner_color || '#d38bff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r * 1.1, 0);
    ctx.lineTo(r * 2.5, 0);
    ctx.stroke();
    ctx.restore();
  }

  // ===================== ТАЙНАЯ НОВА =====================

  _drawNova(ctx, p, t, C) {
    if (p.exploding) {
      this._impact(ctx, p, C, C.impact_ring_color || '#e0a6ff');
      return;
    }
    const r = Math.max(3, (p.radius || 5) * (C.orb_scale ?? 1.2));
    const tr = p.trail || [];
    const tw = Math.max(1, C.trail_width_px ?? 3.2);
    const ta = C.trail_alpha ?? 0.7;

    // Спиральный/гиперболический шлейф: три слоя, чтобы он выглядел как
    // светящаяся лента, а не как тонкая линия.
    if (tr.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const passes = [
        { w: tw * 3.2, a: ta * 0.20, c: C.glow_color || '#b45cff' },
        { w: tw * 1.25, a: ta * 0.55, c: C.trail_color || '#c77bff' },
        { w: Math.max(0.6, tw * 0.38), a: ta * 0.9, c: C.core_color || '#fff2ff' }
      ];
      for (const pass of passes) {
        for (let i = 1; i < tr.length; i++) {
          const k = i / tr.length;
          const a = tr[i - 1], b = tr[i];
          ctx.globalAlpha = pass.a * (0.12 + 0.88 * k);
          ctx.strokeStyle = pass.c;
          ctx.lineWidth = pass.w * (0.4 + 0.9 * k);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    const pulse = 1 + Math.sin(t * (C.pulse_speed ?? 8.5)) * 0.08;

    this._glow(ctx, 0, 0, r * (C.glow_scale ?? 4.2) * pulse, C.glow_color || '#b45cff');

    // Внешний «нимб» — медленно вращающиеся дуги.
    ctx.save();
    ctx.rotate(t * (C.rotation_speed ?? 3));
    ctx.globalAlpha = C.halo_alpha ?? 0.65;
    ctx.strokeStyle = C.rune_color || '#e7c8ff';
    ctx.lineWidth = Math.max(0.7, C.rune_width_px ?? 1.2);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (C.halo_scale ?? 1.85) * (0.78 + i * 0.12),
        i * 2.1, i * 2.1 + 1.2);
      ctx.stroke();
    }
    ctx.restore();

    // Внутреннее ядро с переливами.
    const core = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 1.3);
    core.addColorStop(0, C.core_color || '#fff2ff');
    core.addColorStop(0.32, C.inner_color || '#e08bff');
    core.addColorStop(0.7, C.mid_color || '#a43cff');
    core.addColorStop(1, C.outer_color || '#4b0a8c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.3, 0, TAU);
    ctx.fill();

    // Завихрение из двух тонких серпов.
    ctx.save();
    ctx.rotate(-t * (C.rotation_speed ?? 3) * 1.35);
    ctx.strokeStyle = C.core_color || '#fff2ff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(0.7, (C.rune_width_px ?? 1.2) * 0.8);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, i * Math.PI, i * Math.PI + Math.PI * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // Руны по орбите.
    const runes = Math.max(0, Math.floor(C.rune_arcs ?? 4));
    for (let i = 0; i < runes; i++) {
      const a = t * 2.8 + (i / runes) * TAU;
      const rr = r * (C.rune_radius_scale ?? 2.0);
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.globalAlpha = 0.45 + 0.4 * hash(i + Math.floor(t * 8));
      ctx.strokeStyle = C.rune_color || '#e7c8ff';
      ctx.lineWidth = Math.max(0.6, (C.rune_width_px ?? 1.2) * 0.8);
      ctx.beginPath();
      ctx.moveTo(ca * rr * 0.82, sa * rr * 0.82);
      ctx.lineTo(ca * rr, sa * rr);
      ctx.stroke();
    }

    // Искры.
    const sparks = Math.max(0, Math.floor(C.spark_count ?? 6));
    for (let i = 0; i < sparks; i++) {
      const a = t * (C.spark_orbit_speed ?? 4.5) + (i / sparks) * TAU;
      const rr = r * (C.spark_orbit_radius_px ?? 9) * (0.55 + hash(i * 5.7) * 0.6);
      const s = Math.max(0.5, r * (0.08 + hash(i * 2.1) * 0.09));
      ctx.globalAlpha = 0.3 + 0.5 * hash(i + Math.floor(t * 10));
      ctx.fillStyle = i % 2 ? (C.inner_color || '#e08bff') : (C.core_color || '#fff2ff');
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, s, 0, TAU);
      ctx.fill();
    }

    // Тонкий луч к цели в фазе полёта — читаемость направления.
    if (p.nova && p.nova.phase === 'fly' && p.nova.target && p.nova.target.alive) {
      const dx = p.nova.target.x - p.x, dy = p.nova.target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = C.trail_color || '#c77bff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo((dx / d) * Math.min(90, d), (dy / d) * Math.min(90, d));
      ctx.stroke();
    }

    ctx.restore();
  }

  // ===================== ЦЕПНАЯ МОЛНИЯ =====================

  _drawLightning(ctx, p, t, C) {
    if (p.exploding) {
      this._impact(ctx, p, C, C.impact_ring_color || '#bff6ff');
      return;
    }
    const r = Math.max(3, (p.radius || 8) * (C.orb_scale ?? 1));
    const tr = this._trail(p, '_lcTrail', C.trail_length ?? 12);
    const tick = Math.floor(t * 28);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Ломаная молния по хвосту.
    for (let i = 1; i < tr.length; i++) {
      const k = i / tr.length;
      const a = tr[i - 1], b = tr[i];
      this._jaggedLine(ctx, a, b, i + tick, k, C);
    }

    // Ветки от хвоста.
    const branchChance = C.branch_chance ?? 0.45;
    for (let i = 1; i < tr.length; i++) {
      const seed = i * 11.3 + tick * 0.71;
      if (hash(seed) > branchChance) continue;
      const a = tr[i - 1], b = tr[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ang = hash(seed + 1) * TAU;
      const len = (C.branch_length_px ?? 12) * (0.4 + hash(seed + 2) * 0.8);
      ctx.globalAlpha = 0.18 + 0.25 * hash(seed + 3);
      ctx.strokeStyle = C.trail_color || '#8fe8ff';
      ctx.lineWidth = Math.max(0.5, (C.bolt_width_px ?? 1.6) * 0.7);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(ang) * len, my + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Ядро снаряда.
    ctx.translate(p.x, p.y);
    const pulse = 1 + Math.sin(t * (C.pulse_speed ?? 10)) * 0.09;
    this._glow(ctx, 0, 0, r * (C.glow_scale ?? 3.4) * pulse, C.glow_color || '#2fa8ff');

    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
    core.addColorStop(0, C.core_color || '#f2ffff');
    core.addColorStop(0.35, C.inner_color || '#7fe8ff');
    core.addColorStop(0.75, C.outer_color || '#1a6eff');
    core.addColorStop(1, 'rgba(0,20,70,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, 0, TAU);
    ctx.fill();

    // Короткие разряды вокруг шара.
    const arcs = Math.max(2, Math.floor(C.spark_count ?? 6));
    for (let i = 0; i < arcs; i++) {
      const a = hash(i * 7.7 + tick * 0.37) * TAU;
      const rr = r * (1.1 + hash(i * 3.1) * 0.9);
      ctx.globalAlpha = 0.25 + 0.45 * hash(i + tick);
      ctx.strokeStyle = i % 2 ? (C.trail_color || '#8fe8ff') : (C.core_color || '#f2ffff');
      ctx.lineWidth = Math.max(0.5, (C.bolt_width_px ?? 1.6) * 0.65);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a + 0.45) * rr, Math.sin(a + 0.45) * rr);
      ctx.stroke();
    }

    ctx.restore();
  }

  _jaggedLine(ctx, a, b, seed, k, C) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const n = Math.max(2, Math.floor(C.bolt_segments ?? 7));
    const amp = (C.bolt_amp_px ?? 9) * (0.35 + k * 0.8);
    const pts = [{ x: a.x, y: a.y }];
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const off = (hash(seed + i * 1.73) * 2 - 1) * amp * Math.sin(Math.PI * u);
      pts.push({ x: a.x + dx * u + nx * off, y: a.y + dy * u + ny * off });
    }
    pts.push({ x: b.x, y: b.y });

    ctx.globalAlpha = 0.07 + 0.12 * k;
    ctx.strokeStyle = C.glow_color || '#2fa8ff';
    ctx.lineWidth = Math.max(2, C.bolt_glow_width_px ?? 5.5);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.45 + 0.5 * k;
    ctx.strokeStyle = C.trail_color || '#8fe8ff';
    ctx.lineWidth = Math.max(1, C.bolt_width_px ?? 1.6);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.65 + 0.3 * k;
    ctx.strokeStyle = C.core_color || '#f2ffff';
    ctx.lineWidth = Math.max(0.4, (C.bolt_width_px ?? 1.6) * 0.4);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  }

  // ===================== ПОПАДАНИЕ / ВЗРЫВ =====================

  _impact(ctx, p, C, ringColor) {
    const maxLife = Math.max(0.001, p.maxLife || 0.3);
    const k = clamp01((p.life || 0) / maxLife);
    const fade = 1 - k;
    const r = Math.max(4, p.radius || 6);
    const R = r * (C.impact_radius_scale ?? 2.4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Вспышка.
    if (fade > 0) {
      const flashR = R * (0.25 + k * 0.65);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, flashR);
      g.addColorStop(0, C.impact_flash_color || '#ffffff');
      g.addColorStop(0.24, ringColor || '#fff4ff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, flashR, 0, TAU);
      ctx.fill();

      // Расходящиеся кольца.
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = ringColor || '#fff4ff';
      ctx.lineWidth = Math.max(1, r * 0.28 * (1 - k * 0.4));
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (0.2 + 0.8 * k), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.35;
      ctx.lineWidth = Math.max(0.7, r * 0.16);
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (0.1 + 0.55 * k), 0, TAU);
      ctx.stroke();

      // Разлетающиеся искры.
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + hash(i * 9.3) * 0.6;
        const d = R * (0.15 + hash(i * 4.1) * 0.65) * (0.35 + 0.65 * k);
        const s = Math.max(0.5, r * 0.2 * (1 - k * 0.85));
        ctx.globalAlpha = fade * (0.3 + 0.55 * hash(i + 1));
        ctx.fillStyle = i % 3 === 0 ? (C.impact_flash_color || '#ffffff') : (C.trail_color || C.inner_color || ringColor);
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
