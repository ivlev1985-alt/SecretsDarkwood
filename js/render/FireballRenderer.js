// Процедурный рендерер огненного шара (fireball).
//
// Заменяет projectiles/fireball.png: огненный шар с градиентом,
// огненный хвост (trail), искры, дым. При взрыве — сплэш с кольцом,
// вспышкой и разлетающимися частицами.
//
// Режимы (game_config.visuals.fireball.mode):
//   "missing" — рисовать процедурно, если спрайт не загрузился (по умолчанию);
//   "always"  — всегда процедурный;
//   "never"   — не использовать процедурный.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class FireballRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  // Главный метод: вызывается из Game._drawShot для каждого снаряда.
  // Возвращает true, если снаряд нарисован процедурно (Game не рисует сам).
  draw(ctx, p, time, assets) {
    if (!ctx || !p) return false;
    const cfg = this.cfg;
    if (cfg.enabled === false || cfg.mode === 'never') return false;
    if (cfg.mode !== 'always') {
      // mode === 'missing' — рисуем процедурно, если спрайт отсутствует.
      if (!p.spritePath || !assets || !assets.isMissing(p.spritePath)) return false;
    }
    this._draw(ctx, p, time);
    return true;
  }

  // Внутренний метод: мировые координаты (p.x, p.y).
  _draw(ctx, p, time) {
    const r = p.radius || 12;
    const t = time || 0;
    const cfg = this.cfg;

    if (p.exploding) {
      this._drawExplosion(ctx, p, t);
      return;
    }

    // Хвост ведём сами: fireball (в отличие от nova) trail не имеет.
    // Точки добавляем только при реальном перемещении, кольцевой лимит.
    const maxTrail = Math.max(4, this.cfg.trail_length ?? 14);
    let tr = p._fbTrail;
    if (!tr) tr = p._fbTrail = [];
    const last = tr[tr.length - 1];
    if (!last || Math.abs(p.x - last.x) > 0.5 || Math.abs(p.y - last.y) > 0.5) {
      tr.push({ x: p.x, y: p.y });
      while (tr.length > maxTrail) tr.shift();
    }

    // Направление назад (против скорости) — для хвоста/дыма/искр.
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const bx = -p.vx / sp, by = -p.vy / sp;

    // Огненный хвост (trail).
    if (tr.length > 1) this._drawTrail(ctx, tr, r, t);

    // Дым (позади шара, поднимается).
    this._drawSmoke(ctx, p.x, p.y, r, t, bx, by);

    // Искры вокруг шара.
    this._drawSparks(ctx, p.x, p.y, r, t);

    // Огненный шар.
    this._drawFireball(ctx, p.x, p.y, r, t);
  }

  // === ОГНЕННЫЙ ШАР ===

  _drawFireball(ctx, x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);

    // Внешнее свечение.
    const glowR = r * 3.5;
    const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
    glow.addColorStop(0, 'rgba(255,140,0,0.35)');
    glow.addColorStop(0.5, 'rgba(255,60,0,0.12)');
    glow.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();

    // Ядро шара — тёплый градиент.
    const coreR = r * 0.55;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#fff4cc');
    core.addColorStop(0.7, '#ffcc00');
    core.addColorStop(1, '#ff6600');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fill();

    // Огненная оболочка — пульсирует.
    const pulse = 1 + Math.sin(t * 18) * 0.08 + Math.sin(t * 27) * 0.04;
    const shellR = r * pulse;
    const shell = ctx.createRadialGradient(0, 0, coreR * 0.8, 0, 0, shellR);
    shell.addColorStop(0, 'rgba(255,100,0,0)');
    shell.addColorStop(0.4, 'rgba(255,80,0,0.6)');
    shell.addColorStop(0.7, 'rgba(255,40,0,0.8)');
    shell.addColorStop(1, 'rgba(200,20,0,0)');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, shellR, 0, TAU);
    ctx.fill();

    // «Живые» языки пламени — короткие радиальные линии.
    const flameCount = 8;
    ctx.lineCap = 'round';
    for (let i = 0; i < flameCount; i++) {
      const ang = (i / flameCount) * TAU + t * 2.5;
      const len = r * (0.35 + hash(i + t * 3) * 0.35);
      const x1 = Math.cos(ang) * coreR * 0.9;
      const y1 = Math.sin(ang) * coreR * 0.9;
      const x2 = Math.cos(ang) * (coreR + len);
      const y2 = Math.sin(ang) * (coreR + len);
      const alpha = 0.4 + hash(i + t * 5) * 0.4;
      ctx.strokeStyle = `rgba(255,${80 + Math.floor(hash(i) * 60)},0,${alpha})`;
      ctx.lineWidth = 1.5 + hash(i + t * 2) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // === ОГНЕННЫЙ ХВОСТ (trail) ===
  // trail[0] — самая старая точка (хвост), trail[n-1] — голова (шар).
  // Сегменты рисуем от хвоста к голове: дым -> огонь -> белое ядро.
  _drawTrail(ctx, tr, r, t) {
    const n = tr.length;
    if (n < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 1; i < n; i++) {
      const k = i / (n - 1);          // 0 — хвост, 1 — голова
      const a = tr[i - 1], b = tr[i];
      // Дымная часть (хвост) рисуется в source-over, огненная — в lighter.
      if (k < 0.45) continue;          // дым рисует _drawSmoke
      const f = (k - 0.45) / 0.55;     // 0..1 по огненной части
      // Широкий тёмно-оранжевый подложечный слой.
      ctx.globalAlpha = 0.25 + f * 0.45;
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = r * (0.4 + f * 1.1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Яркая сердцевина.
      ctx.globalAlpha = 0.3 + f * 0.6;
      ctx.strokeStyle = f > 0.6 ? '#ffcc44' : '#ff8800';
      ctx.lineWidth = r * (0.15 + f * 0.45);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // === ИСКРЫ ===
  // Слетают с головы шара и уносятся назад (против скорости).
  _drawSparks(ctx, x, y, r, t, bx, by) {
    const count = 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 9 + i * 3.7);
      const seed = i * 17.3 + slot * 0.71;
      const phase = (t * 9 + i * 3.7) % 1; // жизненная фаза 0..1
      const jitter = (hash(seed) - 0.5) * 1.6;
      // Направление: назад + боковой разброс.
      const dx = bx + Math.cos(jitter) * 0.6;
      const dy = by + Math.sin(jitter) * 0.6;
      const dist = r * (0.6 + phase * 3.2);
      const sx = x + dx * dist + Math.sin(phase * 9 + seed) * r * 0.3;
      const sy = y + dy * dist + Math.cos(phase * 7 + seed) * r * 0.3;
      const size = r * 0.16 * (1 - phase * 0.7);
      const alpha = (1 - phase) * 0.9;

      if (size > 0.3 && alpha > 0.05) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = phase < 0.35 ? '#ffdd44' : '#ff6600';
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // === ДЫМ ===
  // Клубы рождаются за шаром, расходятся в стороны, поднимаются вверх
  // и растворяются. source-over — дым тёмный, lighter его «съест».
  _drawSmoke(ctx, x, y, r, t, bx, by) {
    const count = 5;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const slot = Math.floor(t * 2.2 + i * 1.9);
      const seed = i * 23.7 + slot * 1.31;
      const phase = (t * 2.2 + i * 1.9) % 1;
      const jitter = (hash(seed) - 0.5) * 1.2;
      const dx = bx + Math.cos(jitter + TAU * hash(seed + 2)) * 0.5;
      const dy = by + Math.sin(jitter + TAU * hash(seed + 2)) * 0.5;
      const dist = r * (0.8 + phase * 2.6);
      const sx = x + dx * dist;
      const sy = y + dy * dist - phase * r * 1.6; // дым поднимается
      const size = r * (0.45 + phase * 1.5);
      const alpha = (1 - phase) * 0.22 * Math.min(1, phase * 6);

      if (size > 2 && alpha > 0.02) {
        ctx.globalAlpha = alpha;
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
        sg.addColorStop(0, '#6b5a48');
        sg.addColorStop(0.6, '#3d3126');
        sg.addColorStop(1, 'rgba(30,20,10,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // === ВЗРЫВ (сплэш) ===

  _drawExplosion(ctx, p, t) {
    const r = p.radius || 12;
    const explosionR = p.explosionR || 100;
    const maxLife = p.maxLife || 0.5;
    const life = p.life || 0;
    const k = clamp01(life / maxLife); // 0..1 за время взрыва

    ctx.save();

    // Фаза 0–0.15: яркая вспышка.
    if (k < 0.15) {
      const flashK = k / 0.15;
      const flashR = explosionR * (0.3 + flashK * 0.7);
      const flash = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, flashR);
      flash.addColorStop(0, `rgba(255,255,200,${1 - flashK})`);
      flash.addColorStop(0.3, `rgba(255,200,50,${(1 - flashK) * 0.7})`);
      flash.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(p.x, p.y, flashR, 0, TAU);
      ctx.fill();
    }

    // Фаза 0.05–0.6: расширяющееся огненное кольцо.
    if (k > 0.05 && k < 0.6) {
      const ringK = clamp01((k - 0.05) / 0.55);
      const ringR = explosionR * ringK;
      const ringAlpha = (1 - ringK) * 0.7;

      // Внешнее кольцо огня.
      ctx.lineWidth = r * 2 * (1 - ringK * 0.5);
      ctx.strokeStyle = `rgba(255,80,0,${ringAlpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, TAU);
      ctx.stroke();

      // Внутреннее кольцо (горячее).
      ctx.lineWidth = r * 1.2 * (1 - ringK * 0.3);
      ctx.strokeStyle = `rgba(255,180,0,${ringAlpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR * 0.85, 0, TAU);
      ctx.stroke();

      // Ядро кольца (белое).
      ctx.lineWidth = r * 0.5 * (1 - ringK * 0.2);
      ctx.strokeStyle = `rgba(255,255,150,${ringAlpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR * 0.7, 0, TAU);
      ctx.stroke();
    }

    // Фаза 0.1–0.8: разлетающиеся частицы (искры).
    if (k > 0.1 && k < 0.8) {
      const partK = clamp01((k - 0.1) / 0.7);
      const partCount = 24;
      for (let i = 0; i < partCount; i++) {
        const seed = i * 31.7;
        const baseAng = (i / partCount) * TAU + hash(seed + 99) * 0.5;
        const speed = 0.6 + hash(seed + 77) * 0.8;
        const dist = explosionR * partK * speed;
        const px = p.x + Math.cos(baseAng) * dist;
        const py = p.y + Math.sin(baseAng) * dist;
        const size = r * 0.3 * (1 - partK * 0.7);
        const alpha = (1 - partK) * 0.8;

        if (size > 0.5 && alpha > 0.05) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = hash(seed) > 0.5 ? '#ff8800' : '#ffcc00';
          ctx.beginPath();
          ctx.arc(px, py, size, 0, TAU);
          ctx.fill();
        }
      }
    }

    // Фаза 0.3–1.0: дым.
    if (k > 0.3 && k < 1.0) {
      const smokeK = clamp01((k - 0.3) / 0.7);
      const smokeCount = 5;
      for (let i = 0; i < smokeCount; i++) {
        const seed = i * 41.3;
        const ang = (i / smokeCount) * TAU + hash(seed) * 0.8;
        const dist = explosionR * smokeK * (0.5 + hash(seed + 1) * 0.5);
        const sx = p.x + Math.cos(ang) * dist;
        const sy = p.y + Math.sin(ang) * dist - smokeK * 20;
        const size = r * (1 + smokeK * 3);
        const alpha = (1 - smokeK) * 0.3;

        if (size > 3 && alpha > 0.02) {
          ctx.globalAlpha = alpha;
          const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
          sg.addColorStop(0, '#554433');
          sg.addColorStop(0.7, '#332211');
          sg.addColorStop(1, 'rgba(20,10,5,0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, TAU);
          ctx.fill();
        }
      }
    }

    // Фаза 0.5–1.0: тёмное ядро (остывающий пепел).
    if (k > 0.5 && k < 1.0) {
      const ashK = clamp01((k - 0.5) / 0.5);
      const ashR = explosionR * (0.3 + ashK * 0.5);
      const ashAlpha = (1 - ashK) * 0.2;
      const ash = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, ashR);
      ash.addColorStop(0, `rgba(80,60,40,${ashAlpha})`);
      ash.addColorStop(1, 'rgba(40,30,20,0)');
      ctx.fillStyle = ash;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ashR, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}
