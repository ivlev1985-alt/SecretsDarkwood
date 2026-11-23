// Процедурная «Стена огня» — стиль файрбола, но как сплошная стена.
//
// Каждый из 7 сегментов = 3–6 вертикальных хвостов (как у летящего вниз
// файрбола). Хвосты пульсируют, покачиваются, заполняют сегмент и зоны
// между сегментами. Дым и искры — медленнее, хаотичнее. Свечение —
// минимальное, без «подсветки снизу».

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

    // 1. Дым — позади всего.
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawSmoke(ctx, fl, i, C, now, alpha);
    }

    // 2. Свечение — минимальное, только над сегментом.
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawGlow(ctx, fl, i, C, now, alpha);
    }

    // 3. Хвосты-стена — каждый сегмент = 3–6 вертикальных хвостов.
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawSegment(ctx, fl, i, C, now, alpha);
    }

    // 4. Искры — медленные, хаотичные.
    for (let i = 0; i < w.flames.length; i++) {
      const fl = w.flames[i];
      if (!fl.alive || fl.dead) continue;
      const alpha = this._flameAlpha(fl, w);
      if (alpha <= 0.01) continue;
      this._drawSparks(ctx, fl, i, C, now, alpha);
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

  // === МИНИМАЛЬНОЕ СВЕЧЕНИЕ (только над сегментом) ===
  _drawGlow(ctx, fl, idx, C, t, alpha) {
    const segH = C.segment_height_px ?? 100;
    const segW = C.segment_width_px ?? 50;
    const seed = idx * 13.7;
    const flick = 0.85 + 0.15 * Math.sin(t * 8 + seed);

    // Свечение над сегментом (не под ним).
    const cx = fl.x, cy = fl.y - segH * 0.3;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, segW * 1.2);
    glow.addColorStop(0, `rgba(255,120,0,${0.18 * alpha * flick})`);
    glow.addColorStop(0.5, `rgba(255,60,0,${0.06 * alpha * flick})`);
    glow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, segW * 1.2, segH * 0.6, 0, 0, TAU);
    ctx.fill();
  }

  // === СЕГМЕНТ = 3–6 ВЕРТИКАЛЬНЫХ ХВОСТОВ ===
  _drawSegment(ctx, fl, idx, C, t, alpha) {
    const segH = C.segment_height_px ?? 100;
    const segW = C.segment_width_px ?? 50;
    const numTrails = 3 + Math.floor(hash(idx * 7.1) * 4); // 3–6
    const seed = idx * 19.3;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let ti = 0; ti < numTrails; ti++) {
      const tSeed = seed + ti * 11.3;
      // Позиция хвоста по ширине сегмента.
      const tx = fl.x + (hash(tSeed + 2) - 0.5) * segW * 0.8;
      // Вертикальный диапазон: хвост занимает часть сегмента + немного
      // выходит за его пределы, заполняя пространство между сегментами.
      const topY = fl.y - segH * (0.15 + hash(tSeed + 3) * 0.35);
      const botY = fl.y + segH * (0.15 + hash(tSeed + 4) * 0.35);
      // Рандомная пульсация и покачивание.
      const pulsePhase = hash(tSeed + 5) * TAU;
      const swayPhase = hash(tSeed + 6) * TAU;
      const swayAmp = 4 + hash(tSeed + 7) * 8;
      const pulseAmp = 0.6 + hash(tSeed + 8) * 0.4; // 0.6–1.0

      this._drawVerticalTrail(ctx, tx, topY, botY, segW, t, tSeed,
        pulsePhase, swayPhase, swayAmp, pulseAmp, alpha, C);
    }

    ctx.restore();
  }

  // === ОДИН ВЕРТИКАЛЬНЫЙ ХВОСТ (стиль файрбола) ===
  _drawVerticalTrail(ctx, x, topY, botY, segW, t, seed,
    pulsePhase, swayPhase, swayAmp, pulseAmp, alpha, C) {

    const steps = 10;
    const slot = Math.floor(t * 14);
    const pulse = 1 + Math.sin(t * 18 + pulsePhase) * 0.14
      + Math.sin(t * 28 + pulsePhase * 2) * 0.08;

    // Строим точки хвоста.
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const k = i / steps; // 0 = верх, 1 = низ
      const y = topY + (botY - topY) * k;
      // Покачивание: синус по k, фаза зависит от времени.
      const sway = Math.sin(t * 3 + k * 4 + swayPhase) * swayAmp * (0.3 + k * 0.7);
      // Рваная амплитуда: slot-шум.
      const jitter = (hash(seed + i * 2.7 + slot * 3.13) - 0.5) * segW * 0.15;
      pts.push({ x: x + sway + jitter, y });
    }

    // Два слоя: тёмный подложечный + яркая сердцевина.
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const a = pts[i - 1], b = pts[i];
        const flick = 0.6 + hash(i * 3.3 + slot * 1.7 + seed) * 0.4;
        // Профиль: середина хвоста толще, кончики тоньше.
        const prof = Math.sin(k * Math.PI);
        const w2 = segW * (wide ? 0.55 : 0.25) * prof * pulse * pulseAmp;
        const a2 = (wide ? 0.25 : 0.55) * flick * alpha;

        if (wide) {
          ctx.globalAlpha = a2;
          ctx.strokeStyle = '#ff4400';
        } else {
          ctx.globalAlpha = a2 * 1.2;
          ctx.strokeStyle = k > 0.5 ? '#ffcc44' : '#ff8800';
        }
        ctx.lineWidth = Math.max(1, w2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  // === ДЫМ (медленнее, чем у файрбола) ===
  _drawSmoke(ctx, fl, idx, C, t, alpha) {
    const segH = C.segment_height_px ?? 100;
    const segW = C.segment_width_px ?? 50;
    const count = 4;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 1.0 + i * 2.3 + idx * 7); // медленнее: 1.0 вместо 1.6
      const seed = i * 29.3 + slot * 1.31 + idx * 23;
      const phase = (t * 1.0 + i * 2.3 + idx * 7) % 1;
      const jitter = (hash(seed) - 0.5) * 1.5;
      // Дым поднимается из центра сегмента.
      const sx = fl.x + Math.sin(phase * 2 + seed) * segW * 0.4;
      const sy = fl.y - segH * 0.2 - phase * segH * 1.8; // поднимается выше
      const size = segW * (0.4 + phase * 1.2);
      const a2 = (1 - phase) * 0.35 * Math.min(1, phase * 8) * alpha;

      if (size > 3 && a2 > 0.02) {
        ctx.globalAlpha = a2;
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
        sg.addColorStop(0, '#7a6a56');
        sg.addColorStop(0.55, '#4a3c2e');
        sg.addColorStop(1, 'rgba(30,20,12,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // === ИСКРЫ (медленные, хаотичные, по синусоиде) ===
  _drawSparks(ctx, fl, idx, C, t, alpha) {
    const segH = C.segment_height_px ?? 100;
    const segW = C.segment_width_px ?? 50;
    const count = 6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 5 + i * 4.1 + idx * 13); // медленнее: 5 вместо 9
      const seed = i * 21.7 + slot * 0.71 + idx * 31;
      const phase = (t * 5 + i * 4.1 + idx * 13) % 1;
      // Вектор: вверх, но плавно «гуляет» ±15° по/против часовой.
      const angJitter = Math.sin(phase * 6 + seed) * (Math.PI / 12); // ±15°
      const ang = -Math.PI / 2 + angJitter;
      // Полёт вверх по хаотичной синусоиде: боковое дрейфование +
      // синусоидальное покачивание вдоль траектории.
      const rise = phase * segH * 1.5;
      const drift = Math.sin(angJitter) * rise; // боковой снос от угла
      const wobble = Math.sin(phase * 9 + seed * TAU) * segW * 0.18 * phase;
      const sx = fl.x + (hash(seed + 9) - 0.5) * segW * 0.6 + drift + wobble;
      const sy = fl.y - segH * 0.2 - rise * Math.cos(angJitter);
      const size = segW * 0.08 * (1 - phase * 0.6);
      const a2 = (1 - phase) * 0.7 * alpha;

      if (size > 0.4 && a2 > 0.05) {
        ctx.globalAlpha = a2;
        ctx.fillStyle = phase < 0.3 ? '#ffdd44' : '#ff6600';
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
