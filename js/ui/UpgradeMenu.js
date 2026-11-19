import { hit } from './widgets.js';
import { drawSkillIcon, iconKey, hexPath } from './hexIcons.js';

// Окно levelup (GDD 6.8): 3 карточки, пауза мира.
// Плюс кинематографичное появление: затемнение, два фиолетовых вихря,
// взрыв с числом уровня, перенос круга наверх и поочерёдный выезд карточек.
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const smoothstep = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

const T = {
  dark: 0.5,          // затемнение до 85% за 0,5 с
  vortexStart: 0.08,  // вихри выходят из-за краёв
  vortexEnd: 0.9,     // свернулись в общее кольцо
  explode: 0.9,       // взрыв и появление числа
  explodeLife: 0.55,  // всплески полностью рассеиваются
  moveStart: 1.45,    // круг с числом уезжает наверх
  moveEnd: 2.0,
  cardsStart: 2.02,   // карточки начинают выезжать по очереди
  cardStagger: 0.11,
  cardDur: 0.35,
  flightDur: 0.7,     // полёт иконки к HUD
  impactHold: 0.36,   // искры догорают
  fadeDur: 0.25
};
const RING_R = 56;

export class UpgradeMenu {
  constructor() {
    this.R = { cards: [] };
    this.mode = 'spell'; // 'levelup' | 'spell'
    this.t = 0;
    this.level = 1;
    this.full = false;
    this.flight = null;
    this.selected = -1;
    this.done = false;
    this._seed = 12345;
    this.vortexSeeds = [];
    this.explosionSeeds = [];
  }

  _rand() {
    this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  startLevelUp(level, full, W, H) {
    this.mode = 'levelup';
    this.level = level || 1;
    this.full = !!full;
    // Повторный выбор за тот же «пакет» уровней показываем сразу с кругом
    // наверху, без повторного вихря.
    this.t = this.full ? 0 : T.moveEnd;
    this.flight = null;
    this.selected = -1;
    this.done = false;
    this._seed = 12345;
    this._buildVortex();
    this._buildExplosion();
    this.layout(W, H, true);
  }

  startSpell(W, H) {
    this.mode = 'spell';
    this.t = 0;
    this.level = 1;
    this.full = false;
    this.flight = null;
    this.selected = -1;
    this.done = false;
    this.layout(W, H, false);
  }

  _buildVortex() {
    this.vortexSeeds = [];
    for (let i = 0; i < 48; i++) {
      this.vortexSeeds.push({
        u: this._rand(),
        arm: (this._rand() * 3) | 0,
        side: i % 2 ? 1 : -1,
        size: 1 + this._rand() * 2.5,
        a: this._rand() * Math.PI * 2,
        sp: 0.6 + this._rand() * 1.4,
        col: this._rand() < 0.5 ? '#b46cff' : (this._rand() < 0.5 ? '#e0c3ff' : '#7a2cff')
      });
    }
  }

  _buildExplosion() {
    this.explosionSeeds = [];
    const colors = ['#e0c3ff', '#b46cff', '#ffffff', '#ffd34d'];
    for (let i = 0; i < 40; i++) {
      this.explosionSeeds.push({
        a: (i / 40) * Math.PI * 2 + (this._rand() - 0.5) * 0.18,
        sp: 70 + this._rand() * 210,
        life: 0.32 + this._rand() * 0.23,
        size: 1.2 + this._rand() * 2.8,
        col: colors[(this._rand() * colors.length) | 0]
      });
    }
  }

  layout(W, H, lower = false) {
    const cw = W - 60, ch = 84, x0 = 30;
    let y0 = lower ? Math.max(Math.round(H / 2 + 24), 424) : 200;
    const cards = [];
    for (let i = 0; i < 3; i++) { cards.push({ x: x0, y: y0, w: cw, h: ch }); y0 += ch + 12; }
    this.R = { cards };
    return this.R;
  }

  // Готовность к клику: карточки уже выехали, полёта ещё нет.
  isInteractive(game) {
    if (this.flight || this.done) return false;
    if (this.mode === 'spell') return true;
    const n = Math.max(0, (game.choices || []).length - 1);
    return this.t >= T.cardsStart + n * T.cardStagger + T.cardDur;
  }

  update(dt, game, W, H) {
    if (this.done) return;
    this.t += dt;
    const f = this.flight;
    if (!f) return;

    if (f.phase === 'fly') {
      f.t += dt;
      const p = clamp01(f.t / T.flightDur);
      const pos = this._pathPoint(f, p);
      f.p = p;
      f.x = pos.x;
      f.y = pos.y;
      f.trail.push({ x: pos.x, y: pos.y, life: 0.26, maxLife: 0.26, size: 3 + 3 * (1 - p) });
      this._updateTrail(f, dt);
      if (p >= 1) {
        f.phase = 'impact';
        f.impactT = 0;
        game._hiddenHudUpgrade = null;
        this._spawnImpact(f);
      }
      return;
    }

    if (f.phase === 'impact') {
      f.impactT += dt;
      this._updateTrail(f, dt);
      this._updateSparks(f, dt);
      if (f.impactT >= T.impactHold) { f.phase = 'fade'; f.fadeT = 0; }
      return;
    }

    if (f.phase === 'fade') {
      f.fadeT += dt;
      this._updateTrail(f, dt);
      this._updateSparks(f, dt);
      if (f.fadeT >= T.fadeDur) {
        this.done = true;
        this.flight = null;
        game._finishUpgradeChoice();
      }
    }
  }

  _pathPoint(f, p) {
    const e = easeInOutCubic(clamp01(p));
    const u = 1 - e;
    return {
      x: u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * f.to.x,
      y: u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * f.to.y
    };
  }

  _updateTrail(f, dt) {
    for (let i = f.trail.length - 1; i >= 0; i--) {
      f.trail[i].life -= dt;
      if (f.trail[i].life <= 0) f.trail.splice(i, 1);
    }
  }

  _spawnImpact(f) {
    f.sparks = [];
    const colors = ['#ffd34d', '#e0c3ff', '#ffffff', '#b46cff'];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + (this._rand() - 0.5) * 0.3;
      const sp = 65 + this._rand() * 235;
      const life = 0.32 + this._rand() * 0.26;
      f.sparks.push({
        x: f.to.x, y: f.to.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 26,
        life, maxLife: life,
        size: 1.4 + this._rand() * 2.6,
        col: colors[(this._rand() * colors.length) | 0]
      });
    }
  }

  _updateSparks(f, dt) {
    for (const s of f.sparks) {
      s.life -= dt;
      s.vy += 240 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    f.sparks = f.sparks.filter((s) => s.life > 0);
  }

  draw(ctx, game, W, H) {
    const dark = this._darkAlpha();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + dark.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);

    const uiA = this._uiAlpha();
    if (this.mode === 'levelup') this._drawIntro(ctx, game, W, H, uiA);

    const { cards } = this.layout(W, H, this.mode === 'levelup');
    const titleKey = game.choiceMode === 'spell' ? 'spell_reward_title' : 'upgrade_title';
    const titleY = this.mode === 'levelup' ? cards[0].y - 34 : 170;
    const titleReveal = this.mode === 'levelup'
      ? smoothstep((this.t - T.cardsStart) / 0.3) * this._cardsAlpha()
      : 1;
    if (titleReveal > 0) {
      ctx.save();
      ctx.globalAlpha = uiA * titleReveal;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game._t(titleKey), W / 2, titleY);
      ctx.restore();
    }

    const cardsA = this._cardsAlpha();
    if (cardsA > 0) {
      game.choices.forEach((c, i) => {
        const r = cards[i];
        if (!r) return;
        const reveal = this.mode === 'spell'
          ? 1
          : clamp01((this.t - (T.cardsStart + i * T.cardStagger)) / T.cardDur);
        if (reveal <= 0) return;
        this._drawCard(ctx, game, c, r, uiA * cardsA * reveal, reveal);
      });
    }

    if (this.flight) this._drawFlight(ctx, game, W, H, uiA);
    ctx.restore();
  }

  _drawCard(ctx, game, c, r, alpha, reveal) {
    const dy = (1 - reveal) * 36;
    const dx = (1 - reveal) * 24;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, dy);
    if (reveal < 1) {
      ctx.shadowColor = '#b46cff';
      ctx.shadowBlur = 18 * (1 - reveal);
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd34d';
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const key = iconKey(c);
    const iconSize = 48;
    const iconCx = r.x + 34;
    drawSkillIcon(ctx, game, key, iconCx, r.y + r.h / 2, iconSize, {
      borderColor: '#ffd34d',
      label: false
    });

    // Текст справа от иконки: отступ справа от иконки равен отступу
    // слева от иконки до края карточки (симметрия).
    const pad = iconCx - iconSize / 2 - r.x;
    const textX = iconCx + iconSize / 2 + pad;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(c.title, textX, r.y + 28);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    const maxW = r.x + r.w - 8 - textX;
    let desc = c.desc || '';
    if (ctx.measureText(desc).width > maxW) {
      while (desc.length > 1 && ctx.measureText(desc + '…').width > maxW) desc = desc.slice(0, -1);
      desc += '…';
    }
    ctx.fillText(desc, textX, r.y + 48);
    ctx.fillStyle = '#8f8';
    ctx.fillText(c.info || '', textX, r.y + 68);
    ctx.restore();
  }

  _drawIntro(ctx, game, W, H, uiA) {
    const t = this.t;
    const p = clamp01((t - T.vortexStart) / (T.vortexEnd - T.vortexStart));
    const moveP = easeInOutCubic(clamp01((t - T.moveStart) / (T.moveEnd - T.moveStart)));
    const ringY = lerp(H / 2, H * 0.27, moveP);
    const ringA = smoothstep((p - 0.55) / 0.45) * uiA;

    if (t < T.vortexEnd + 0.25) this._drawVortices(ctx, W, H, p, uiA);
    if (t >= T.explode) this._drawExplosion(ctx, W, H, uiA);

    // Лёгкий шлейф при переносе круга наверх.
    if (moveP > 0 && ringA > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k <= 3; k++) {
        ctx.globalAlpha = ringA * 0.08 / k;
        ctx.strokeStyle = '#b46cff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W / 2, ringY + k * 9 * moveP, RING_R, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (ringA > 0) this._drawRing(ctx, W / 2, ringY, ringA, t);

    const numP = clamp01((t - T.explode) / 0.35);
    if (numP > 0 && uiA > 0) {
      ctx.save();
      ctx.translate(W / 2, ringY);
      const sc = easeOutBack(numP);
      ctx.scale(sc, sc);
      ctx.globalAlpha = uiA * clamp01(numP * 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 54px monospace';
      ctx.shadowColor = '#b46cff';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(this.level), 0, 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e0c3ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('LV', 0, -34);
      ctx.restore();
    }
  }

  _drawVortices(ctx, W, H, p, uiA) {
    const alpha = smoothstep(p / 0.12) * (1 - smoothstep((p - 0.9) / 0.1)) * uiA;
    if (alpha <= 0) return;
    const cxTarget = W / 2, cyTarget = H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      const edgeX = side < 0 ? -50 : W + 50;
      const e = easeInOutCubic(p);
      const cx = lerp(edgeX, cxTarget, e);
      const cy = cyTarget + Math.sin(p * Math.PI * 2 + (side > 0 ? Math.PI : 0)) * 12 * (1 - p);
      const spin = side * (p * 8 + this.t * 2.2);
      const R0 = 160, R1 = RING_R;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        const N = 34;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const ang = spin + side * u * Math.PI * 2 * 1.75 + arm * Math.PI * 2 / 3;
          const rad = R1 + (R0 - R1) * (1 - u) * (1 - p);
          const x = cx + Math.cos(ang) * rad;
          const y = cy + Math.sin(ang) * rad * 0.85;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = alpha * (arm === 0 ? 0.75 : 0.42);
        ctx.strokeStyle = arm === 0 ? '#c58cff' : '#7a2cff';
        ctx.lineWidth = 2 + 2 * (1 - p);
        ctx.shadowColor = '#8a2cff';
        ctx.shadowBlur = 12;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (const s of this.vortexSeeds) {
        if (s.side !== side) continue;
        const u = (s.u + this.t * s.sp * 0.2) % 1;
        const ang = spin + side * u * Math.PI * 2 * 1.75 + s.arm * Math.PI * 2 / 3 + s.a * 0.1;
        const rad = R1 + (R0 - R1) * (1 - u) * (1 - p);
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad * 0.85;
        ctx.globalAlpha = alpha * (0.32 + 0.68 * (1 - u));
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(x, y, s.size * (0.6 + 0.4 * (1 - p)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawExplosion(ctx, W, H, uiA) {
    const et = this.t - T.explode;
    if (et < 0 || et > T.explodeLife) return;
    const cx = W / 2, cy = H / 2;
    const k = clamp01(et / T.explodeLife);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (et < 0.18) {
      ctx.globalAlpha = uiA * (1 - et / 0.18);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 24 + 44 * easeOutCubic(et / 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
    if (et < 0.4) {
      ctx.globalAlpha = uiA * (1 - et / 0.4);
      ctx.strokeStyle = '#b46cff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 20 + 120 * easeOutCubic(et / 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const s of this.explosionSeeds) {
      if (et > s.life) continue;
      const a = clamp01(et / s.life);
      const r = s.sp * easeOutCubic(a);
      ctx.globalAlpha = uiA * (1 - a);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(s.a) * r, cy + Math.sin(s.a) * r * 0.9, s.size * (1 - a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    // Общий мягкий ореол, чтобы взрыв не был «точками на чёрном».
    ctx.globalAlpha = uiA * (1 - k) * 0.18;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130);
    grd.addColorStop(0, '#b46cff');
    grd.addColorStop(1, 'rgba(80,0,140,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawRing(ctx, x, y, alpha, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,2,32,0.76)';
    ctx.beginPath();
    ctx.arc(0, 0, RING_R - 2, 0, Math.PI * 2);
    ctx.fill();

    const pulse = 1 + 0.045 * Math.sin(t * 8);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#b46cff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#8a2cff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, RING_R * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.32;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, RING_R * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = '#e0c3ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 6; i++) {
      const a = t * 1.6 + i * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(0, 0, RING_R - 8, a, a + 0.38);
      ctx.stroke();
    }
    ctx.restore();
  }

  _cardsAlpha() {
    if (this.selected < 0 || !this.flight) return 1;
    return Math.max(0, 1 - this.flight.t / 0.15);
  }

  _uiAlpha() {
    const f = this.flight;
    if (f && f.phase === 'fade') return Math.max(0, 1 - f.fadeT / T.fadeDur);
    return 1;
  }

  _darkAlpha() {
    if (this.mode === 'spell') {
      if (this.flight && this.flight.phase === 'fade') {
        return 0.7 * Math.max(0, 1 - this.flight.fadeT / T.fadeDur);
      }
      return 0.7;
    }
    if (this.flight && this.flight.phase === 'fade') {
      return 0.85 * Math.max(0, 1 - this.flight.fadeT / T.fadeDur);
    }
    if (this.t < T.dark) return 0.85 * easeOutCubic(this.t / T.dark);
    return 0.85;
  }

  click(game, x, y) {
    if (!this.isInteractive(game)) return false;
    const W = game.canvas.width, H = game.canvas.height;
    const { cards } = this.layout(W, H, this.mode === 'levelup');
    for (let i = 0; i < game.choices.length; i++) {
      if (cards[i] && hit(x, y, cards[i])) {
        this._beginFlight(game, i, cards[i], W, H);
        return true;
      }
    }
    return false;
  }

  _beginFlight(game, i, card, W, H) {
    const choice = game.choices[i];
    if (!choice) return;
    const applied = game.applyUpgrade(i, { deferClose: true });
    if (!applied) return;

    const from = { x: card.x + 34, y: card.y + card.h / 2, size: 48 };
    const slot = game._hudSlotForChoice(choice, W, H);
    const to = slot || { x: W / 2, y: H - 80, size: 48, kind: 'none' };
    const isHudSlot = slot && (slot.kind === 'weapon' || slot.kind === 'passive');
    game._hiddenHudUpgrade = isHudSlot ? { kind: slot.kind, id: choice.id } : null;

    const dx = to.x - from.x, dy = to.y - from.y;
    const bend = from.x < W / 2 ? 34 : -34;
    this.selected = i;
    this.flight = {
      choice, from, to,
      ctrl: { x: from.x + dx * 0.35 + bend, y: from.y + dy * 0.55 },
      t: 0, p: 0,
      x: from.x, y: from.y,
      trail: [], sparks: [],
      phase: 'fly', impactT: 0, fadeT: 0,
      sparkSeeds: Array.from({ length: 16 }, () => ({
        lag: 0.015 + this._rand() * 0.12,
        off: (this._rand() - 0.5) * 14,
        size: 1.4 + this._rand() * 2.4,
        col: this._rand() < 0.5 ? '#ffd34d' : (this._rand() < 0.5 ? '#e0c3ff' : '#ffffff')
      }))
    };
  }

  _drawFlight(ctx, game, W, H, uiA) {
    const f = this.flight;
    if (!f) return;

    // Пустой слот-приёмник, пока иконка летит.
    if (f.phase === 'fly') {
      ctx.save();
      ctx.globalAlpha = uiA * (0.5 + 0.3 * Math.sin(this.t * 18));
      ctx.strokeStyle = '#b46cff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      if (f.to.kind === 'pet') {
        ctx.beginPath();
        ctx.arc(f.to.x, f.to.y, f.to.size / 2 + 8, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        hexPath(ctx, f.to.x, f.to.y, f.to.size + 6);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Хвост и догоняющие искры — аддитивно.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Непрерывная светящаяся нить хвоста, поверх неё — искры.
    if (f.trail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < f.trail.length; i++) {
        const tr = f.trail[i];
        if (i === 0) ctx.moveTo(tr.x, tr.y);
        else ctx.lineTo(tr.x, tr.y);
      }
      ctx.globalAlpha = uiA * 0.22;
      ctx.strokeStyle = '#b46cff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    for (const tr of f.trail) {
      const a = clamp01(tr.life / tr.maxLife);
      ctx.globalAlpha = uiA * a * 0.55;
      ctx.fillStyle = '#b46cff';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    if (f.phase === 'fly') {
      for (const s of f.sparkSeeds) {
        const sp = clamp01(f.p - s.lag);
        if (sp <= 0) continue;
        const pos = this._pathPoint(f, sp);
        const a = clamp01(1 - (f.p - sp) / 0.2);
        ctx.globalAlpha = uiA * a;
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(pos.x + s.off, pos.y + s.off * 0.3, s.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (f.phase === 'fly') {
      const size = lerp(f.from.size, f.to.size, f.p);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(f.p * 9) * 0.08);
      ctx.globalAlpha = uiA;
      ctx.shadowColor = '#b46cff';
      ctx.shadowBlur = 20;
      drawSkillIcon(ctx, game, iconKey(f.choice), 0, 0, size, {
        borderColor: '#d9a6ff',
        label: false
      });
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const it = f.impactT;
    if (it < 0.22) {
      // Короткая вспышка-ореол, но не «закрашиваем» прилетевшую иконку.
      ctx.globalAlpha = uiA * (1 - it / 0.22) * 0.42;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(f.to.x, f.to.y, 10 + 22 * easeOutCubic(it / 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
    if (it < 0.4) {
      ctx.globalAlpha = uiA * (1 - it / 0.4);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.to.x, f.to.y, 10 + 46 * easeOutCubic(it / 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const s of f.sparks) {
      const a = clamp01(s.life / s.maxLife);
      ctx.globalAlpha = uiA * a;
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
