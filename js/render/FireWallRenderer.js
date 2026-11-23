// Процедурная «Стена огня» — стиль файрбола.
//
// Каждый из 7 сегментов стены рисуется как мини-файрбол: ядро с пульсацией,
// огненная оболочка, «живые» радиальные языки, дым и искры. Сегменты
// соединены огненными хвостами с тем же slot-шумом и рваной амплитудой,
// что и у летящего снаряда.
//
// Режимы (game_config.visuals.fire_wall.mode):
//   "always"  — всегда процедурно (текущая настройка);
//   "auto"    — спрайт, если загружен, иначе процедурно;
//   "missing" — процедурно только без спрайта;
//   "never"   — старый путь Game (спрайт/кружки).

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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

    // 1. Дым — позади всего (source-over).
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawSmoke(ctx, fl, i, C, now, alpha);
    }

    // 2. Хвосты-связки между сегментами (lighter).
    this._drawWallTrails(ctx, w, C, now);

    // 3. Ядра сегментов (файрбол-стиль).
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawSegment(ctx, fl, i, C, now, alpha);
    }

    return true;
  }

  _flameAlpha(fl, w) {
    let alpha = 1;
    if (fl.dying && fl.dieT !== undefined) {
      alpha = Math.max(0, 1 - fl.dieT / w.spawnMs);
    }
    const ageMs = (w.age || 0) * 1000;
    const born = ageMs - (fl.spawnT || 0) * w.spawnMs;
    if (born < 120) alpha *= born / 120;
    return clamp01(alpha);
  }

  // === МИНИ-ФАЙРБОЛ (сегмент стены) ===

  _drawSegment(ctx, fl, idx, C, t, alpha) {
    const baseR = (C.segment_radius_px ?? 14) * (0.7 + hash(idx * 13.7) * 0.6);
    const r = baseR * alpha;
    if (r < 1) return;

    ctx.save();
    ctx.translate(fl.x, fl.y);

    // --- Свечение ---
    const glowR = r * 3.5;
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
    glow.addColorStop(0, `rgba(255,140,0,${0.35 * alpha})`);
    glow.addColorStop(0.5, `rgba(255,60,0,${0.12 * alpha})`);
    glow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();

    // --- Ядро ---
    const coreR = r * 0.55;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
    core.addColorStop(0.3, `rgba(255,244,204,${0.9 * alpha})`);
    core.addColorStop(0.7, `rgba(255,204,0,${0.85 * alpha})`);
    core.addColorStop(1, `rgba(255,102,0,${0.7 * alpha})`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fill();

    // --- Огненная оболочка (пульсирует) ---
    const pulse = 1 + Math.sin(t * 18 + idx) * 0.08 + Math.sin(t * 27 + idx * 2) * 0.04;
    const shellR = r * pulse;
    const shell = ctx.createRadialGradient(0, 0, coreR * 0.8, 0, 0, shellR);
    shell.addColorStop(0, 'rgba(255,100,0,0)');
    shell.addColorStop(0.4, `rgba(255,80,0,${0.6 * alpha})`);
    shell.addColorStop(0.7, `rgba(255,40,0,${0.8 * alpha})`);
    shell.addColorStop(1, 'rgba(200,20,0,0)');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, shellR, 0, TAU);
    ctx.fill();

    // --- «Живые» языки пламени (радиальные линии) ---
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const flameCount = 8;
    for (let i = 0; i < flameCount; i++) {
      const ang = (i / flameCount) * TAU + t * 2.5 + idx;
      const len = r * (0.35 + hash(i + t * 3 + idx) * 0.35);
      const x1 = Math.cos(ang) * coreR * 0.9;
      const y1 = Math.sin(ang) * coreR * 0.9;
      const x2 = Math.cos(ang) * (coreR + len);
      const y2 = Math.sin(ang) * (coreR + len);
      const a2 = (0.4 + hash(i + t * 5 + idx) * 0.4) * alpha;
      ctx.strokeStyle = `rgba(255,${80 + Math.floor(hash(i) * 60)},0,${a2})`;
      ctx.lineWidth = 1.5 + hash(i + t * 2 + idx) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // --- Искры (слетают назад — вверх по Y) ---
    this._drawSegmentSparks(ctx, r, t, idx, alpha);

    ctx.restore();
  }

  // === ХВОСТЫ-СВЯЗКИ МЕЖДУ СЕГМЕНТАМИ ===
  // Тот же паттерн, что в FireballRenderer._drawTrail: slot-шум, рваная
  // амплитуда, профиль k² (максимум у «головы» — следующего сегмента).

  _drawWallTrails(ctx, w, C, t) {
    const flames = w.flames;
    const n = flames.length;
    if (n < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const slot = Math.floor(t * 14);
    const pulse = 1 + Math.sin(t * 22) * 0.14 + Math.sin(t * 35 + 1.7) * 0.08;

    // Считаем точки с рваным извиванием.
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const fl = flames[i];
      if (!fl.alive || fl.dead) { pts[i] = null; continue; }
      const k = i / (n - 1);
      // Нормаль к направлению хвоста.
      const a = flames[Math.max(0, i - 1)];
      const b = flames[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const amp = 0.35 + hash(i * 7.7 + slot * 3.13) * 0.65;
      const prof = k * k;
      const wave = Math.sin(t * 13 - k * 5.5 + hash(slot + i) * TAU)
        * prof * amp * 14 * 0.4;
      pts[i] = { x: fl.x + nx * wave, y: fl.y + ny * wave };
    }

    // Рисуем сегменты хвоста.
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!a || !b) continue;
      const k = i / (n - 1);
      if (k < 0.3) continue;
      const f = (k - 0.3) / 0.7;
      const flick = 0.65 + hash(i * 3.3 + slot * 1.7) * 0.35;

      // Тёмный подложечный слой.
      ctx.globalAlpha = (0.2 + f * 0.4) * flick;
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 14 * (0.3 + f * 0.85) * pulse;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Яркая сердцевина.
      ctx.globalAlpha = (0.25 + f * 0.55) * flick;
      ctx.strokeStyle = f > 0.6 ? '#ffcc44' : '#ff8800';
      ctx.lineWidth = 14 * (0.12 + f * 0.35) * pulse;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // === ДЫМ СЕГМЕНТА ===
  // Вызывается из draw() до отрисовки огня — клубы остаются позади пламени.
  _drawSmoke(ctx, fl, idx, C, t, alpha) {
    const baseR = (C.segment_radius_px ?? 14) * (0.7 + hash(idx * 13.7) * 0.6);
    const r = baseR * alpha;
    if (r < 1) return;
    ctx.save();
    ctx.translate(fl.x, fl.y);
    this._drawSegmentSmoke(ctx, r, t, idx, alpha);
    ctx.restore();
  }

  _drawSegmentSmoke(ctx, r, t, idx, alpha) {
    const count = 3;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 1.6 + i * 1.9 + idx * 5);
      const seed = i * 23.7 + slot * 1.31 + idx * 17;
      const phase = (t * 1.6 + i * 1.9 + idx * 5) % 1;
      const jitter = (hash(seed) - 0.5) * 1.2;
      const dist = r * (1.5 + phase * 4.5);
      const sx = Math.sin(phase * 3 + seed) * r * 0.5;
      const sy = -phase * r * 5; // дым поднимается вверх
      const size = r * (0.35 + phase * 0.9);
      const a2 = (1 - phase) * 0.45 * Math.min(1, phase * 10) * alpha;

      if (size > 2 && a2 > 0.02) {
        ctx.globalAlpha = a2;
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
        sg.addColorStop(0, '#8a7a66');
        sg.addColorStop(0.55, '#5a4c3e');
        sg.addColorStop(1, 'rgba(40,30,22,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // === ИСКРЫ СЕГМЕНТА ===
  _drawSegmentSparks(ctx, r, t, idx, alpha) {
    const count = 5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 9 + i * 3.7 + idx * 11);
      const seed = i * 17.3 + slot * 0.71;
      const phase = (t * 9 + i * 3.7 + idx * 11) % 1;
      const jitter = (hash(seed) - 0.5) * 1.6;
      // Направление: вверх + боковой разброс.
      const dx = Math.cos(jitter) * 0.6;
      const dy = -1 + Math.sin(jitter) * 0.4;
      const dist = r * (0.6 + phase * 3.2);
      const sx = dx * dist + Math.sin(phase * 9 + seed) * r * 0.3;
      const sy = dy * dist + Math.cos(phase * 7 + seed) * r * 0.3;
      const size = r * 0.16 * (1 - phase * 0.7);
      const a2 = (1 - phase) * 0.9 * alpha;

      if (size > 0.3 && a2 > 0.05) {
        ctx.globalAlpha = a2;
        ctx.fillStyle = phase < 0.35 ? '#ffdd44' : '#ff6600';
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}