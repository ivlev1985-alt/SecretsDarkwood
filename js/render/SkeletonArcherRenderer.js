// Процедурный скелет-лучник в духе референса: тёмный рваный капюшон,
// череп с горящими глазами, костяные руки, большой костяной лук,
// колчан, походка с пылью, натяжение/выстрел и рассыпание на кости.
//
// Рисуется векторно в виртуальном кадре 64×64. Заменяет спрайт dark_elf /
// skeleton_archer при включённом режиме.
//
// Режимы (game_config.visuals.skeleton_archer.mode):
//   "missing" — только если спрайт не загрузился (по умолчанию);
//   "always"  — всегда процедурный скелет;
//   "never"   — не использовать процедурного скелета.
//
// Все цвета, тайминги, размеры и траектории костей — в
// game_config.visuals.skeleton_archer.

const TAU = Math.PI * 2;
// Смещения для «наклеечного» контура (8 направлений, 1px в пикселях offscreen)
const OUTLINE_OFF = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class SkeletonArcherRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  draw(ctx, enemy, time, opts = {}) {
    if (!ctx || !enemy) return;
    const cfg = this.cfg || {};
    const scale = Math.max(0.01, opts.scale || 1);
    const w = Math.max(1, opts.w || 64);
    const h = Math.max(1, opts.h || 64);
    const artScale = Math.min(w / 64, h / 64);
    const pxScale = scale * artScale;
    const pad = Math.max(0, cfg.frame_padding_px ?? 28);
    const pw = Math.max(1, Math.ceil((w + pad * 2) * scale));
    const ph = Math.max(1, Math.ceil((h + pad * 2) * scale));

    // Кэш персональный (на враге): один renderer обслуживает всех скелетов.
    let c = enemy._skelCache;
    if (!c || c.pw !== pw || c.ph !== ph) {
      c = enemy._skelCache = {
        key: null, pw, ph, pxScale,
        dust: [], prevStep: 0, moveK: 0,
        bones: null, lastTime: 0,
        canvas: (typeof document !== 'undefined') ? document.createElement('canvas') : null,
        art: (typeof document !== 'undefined') ? document.createElement('canvas') : null,
        sil: (typeof document !== 'undefined') ? document.createElement('canvas') : null
      };
      if (c.canvas) { c.canvas.width = pw; c.canvas.height = ph; c.ctx = c.canvas.getContext('2d'); }
      if (c.art) { c.art.width = pw; c.art.height = ph; c.artCtx = c.art.getContext('2d'); }
      if (c.sil) { c.sil.width = pw; c.sil.height = ph; c.silCtx = c.sil.getContext('2d'); }
    }
    if (!c.canvas) return;
    c.pxScale = pxScale;

    if (enemy._skelSeed == null) {
      enemy._skelSeed = (enemy.x || 0) * 13.71 + (enemy.y || 0) * 7.37 + Math.random() * 999;
    }

    const cacheFps = cfg.cache_fps ?? 18;
    const qf = Math.floor((time || 0) * cacheFps);
    const dir = this._dir(enemy);
    const flashQ = Math.round(Math.max(0, enemy.hitFlash || 0) * 8);
    const shootQ = Math.round(Math.max(0, enemy.shootT || 0) * 20);
    const deathQ = Math.round(Math.max(0, enemy.deathT || 0) * 16);
    const movingQ = enemy.visualMoving ? 1 : 0;
    const key = dir + '|' + qf + '|' + shootQ + '|' + deathQ + '|' + flashQ
      + '|' + movingQ + '|' + (enemy.alive === false || enemy.deathT > 0 ? 1 : 0);

    if (key !== c.key) {
      c.key = key;
      const qt = qf / cacheFps;
      let dt = qt - (c.lastTime || 0);
      if (!(dt > 0) || dt > 0.5) dt = 1 / cacheFps;
      c.lastTime = qt;
      this._renderFrame(enemy, qt, dir, cfg, c, dt);
    }

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.tilt) ctx.rotate(enemy.tilt);
    ctx.drawImage(c.canvas, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
  }

  _renderFrame(enemy, time, dir, cfg, c, dt) {
    const o = c.ctx, a = c.artCtx, s = c.silCtx;
    const art = c.art, sil = c.sil;
    const pw = c.pw, ph = c.ph;

    // Плавный переход idle <-> walk (анимация обновляется квантованно).
    const targetMove = (enemy.deathT > 0 || !enemy.visualMoving) ? 0 : 1;
    c.moveK = lerp(c.moveK || 0, targetMove, Math.min(1, dt * (cfg.move_blend ?? 10)));

    const pose = this._pose(enemy, time, dir, cfg, c);
    if (!c.bones) c.bones = this._makeBones(enemy._skelSeed || 0);
    pose.bones = c.bones;
    this._updateDust(dt, pose, cfg, c);

    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, pw, ph);
    a.save();
    a.translate(pw / 2, ph / 2);
    a.scale(c.pxScale, c.pxScale);
    if (dir === 'left') a.scale(-1, 1);
    this._paint(a, pose, cfg, c);
    a.restore();

    // Подсветка урона
    const flash = Math.max(0, enemy.hitFlash || 0);
    if (flash > 0) {
      a.globalCompositeOperation = 'source-atop';
      a.globalAlpha = Math.min(0.38, flash * 2.5);
      a.fillStyle = enemy.flashColor || '#ff5555';
      a.fillRect(0, 0, pw, ph);
      a.globalCompositeOperation = 'source-over';
      a.globalAlpha = 1;
    }

    // Контур «наклейки»
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, pw, ph);
    s.drawImage(art, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = cfg.outline || '#0a0c09';
    s.fillRect(0, 0, pw, ph);
    s.globalCompositeOperation = 'source-over';

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, pw, ph);
    const k = Math.max(1, Math.round(c.pxScale));
    for (let i = 0; i < OUTLINE_OFF.length; i += 2) {
      o.drawImage(sil, OUTLINE_OFF[i] * k, OUTLINE_OFF[i + 1] * k);
    }
    o.drawImage(art, 0, 0);
  }

  _dir(enemy) {
    if (enemy.heroDir) return enemy.heroDir;
    return enemy.facing < 0 ? 'left' : 'right';
  }

  _pose(enemy, time, dir, cfg, c) {
    const moving = (enemy.deathT <= 0) && !!enemy.visualMoving;
    const moveK = c.moveK || 0;
    const cycle = cfg.walk_cycles_per_sec ?? 2.35;
    const phase = time * cycle * TAU;
    const step = Math.sin(phase);
    const breathe = Math.sin(time * (cfg.idle_breath_speed ?? 1.8)) * (cfg.idle_breath_px ?? 0.55);
    const bob = moving ? -Math.abs(step) * (cfg.walk_bob_px ?? 2.2) * 0.55 * moveK : breathe;
    const sway = moving ? step * (cfg.walk_sway_px ?? 1.7) * moveK : 0;
    const lean = step * (cfg.walk_lean_rad ?? 0.035) * moveK
      + Math.sin(time * 1.3) * 0.006;

    // Натяжение лука.
    const shootDur = Math.max(0.001, enemy.shootDuration
      || ((cfg.shoot_duration_ms ?? 600) / 1000));
    let aim = 0;
    let release = 0;
    if (enemy.shootT > 0) {
      const e = clamp01(1 - enemy.shootT / shootDur);
      if (e < 0.13) aim = smoothstep(e / 0.13);
      else if (e < 0.28) {
        aim = 1;
        release = Math.sin(Math.PI * clamp01((e - 0.13) / 0.15));
      } else {
        aim = 1 - smoothstep(clamp01((e - 0.28) / 0.55));
      }
    } else if (enemy.attackCd > 0 && enemy.attackCd < (cfg.aim_pre_ms ?? 350) / 1000) {
      // Лёгкий «замах» до выстрела: лук начинает подниматься заранее.
      const pre = smoothstep(1 - enemy.attackCd / ((cfg.aim_pre_ms ?? 350) / 1000));
      aim = pre * (cfg.aim_pre_max ?? 0.62);
    }

    const deathK = enemy.deathT > 0
      ? clamp01(enemy.deathT / Math.max(0.001, this._deathTotal(enemy)))
      : 0;
    const fallK = smoothstep(clamp01(deathK / 0.36));
    const dirName = dir;
    return {
      time, dir: dirName,
      side: dirName === 'left' || dirName === 'right',
      back: dirName === 'up',
      front: dirName === 'down',
      moving, moveK, step, bob, sway, lean,
      aim, release, pull: aim * (1 - release * 0.82),
      deathK, fallK,
      fallRot: fallK * (cfg.death_fall_rad ?? 1.15),
      deathSlide: fallK * (cfg.death_slide_px ?? 4),
      deathSink: fallK * (cfg.death_sink_px ?? 3),
      breathe
    };
  }

  _deathTotal(enemy) {
    if (typeof enemy.deathTiming === 'function') {
      const t = enemy.deathTiming();
      return Math.max(0.001, t.dur + t.fade);
    }
    return Math.max(0.001, enemy.deathDuration || 1.5);
  }

  _palette(cfg) {
    return {
      outline: cfg.outline || '#0a0c09',
      cloakDark: cfg.cloak_dark || '#171c17',
      cloakMid: cfg.cloak_mid || '#2b312a',
      cloakLight: cfg.cloak_light || '#454d3f',
      cloakTrim: cfg.cloak_trim || '#0c100d',
      accent: cfg.accent || '#8f7a4a',
      bone: cfg.bone || '#e6dfc8',
      boneShadow: cfg.bone_shadow || '#a89f84',
      boneDark: cfg.bone_dark || '#6e6754',
      leatherDark: cfg.leather_dark || '#2b2119',
      leather: cfg.leather || '#4a3626',
      leatherLight: cfg.leather_light || '#6b5038',
      metal: cfg.metal || '#8e8a7a',
      metalLight: cfg.metal_light || '#c8c2ae',
      boot: cfg.boot || '#241b16',
      eye: cfg.eye_glow || '#ffb02e',
      eyeCore: cfg.eye_core || '#fff0b0',
      bowWood: cfg.bow_wood || '#2d211a',
      bowWoodLight: cfg.bow_wood_light || '#5a4632',
      bowBone: cfg.bow_bone || '#c9bfa2',
      bowString: cfg.bow_string || '#d8cba8',
      arrowWood: cfg.arrow_wood || '#6a4b2c',
      arrowHead: cfg.arrow_head || '#a9a79e',
      arrowFletch: cfg.arrow_fletching || '#9a3b2c',
      dust: cfg.dust || '#b6ab96'
    };
  }

  // ===================== SCAFFOLD =====================

  _paint(ctx, pose, cfg, c) {
    const P = this._palette(cfg);
    this._drawDust(ctx, pose, cfg, P, c);
    this._drawShadow(ctx, pose, P);

    if (pose.deathK > 0) {
      const bodyAlpha = 1 - smoothstep(clamp01((pose.deathK - 0.12) / 0.40));
      if (bodyAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = bodyAlpha;
        this._drawBody(ctx, pose, cfg, P);
        ctx.restore();
      }
      this._drawBones(ctx, pose, cfg, P, c);
    } else {
      this._drawBody(ctx, pose, cfg, P);
    }
  }

  _drawBody(ctx, pose, cfg, P) {
    ctx.save();
    ctx.translate(pose.sway + pose.deathSlide, pose.bob + pose.deathSink);
    // Падение: вращаем вокруг области таза, а не вокруг центра кадра.
    ctx.translate(0, 18);
    ctx.rotate(pose.deathK > 0 ? pose.fallRot : pose.lean);
    ctx.translate(0, -18);

    this._drawBackCloak(ctx, pose, P);
    this._drawQuiver(ctx, pose, P);

    // Дальняя нога → таз/плащ → ближняя нога.
    this._drawLeg(ctx, pose, P, false);
    this._drawLeg(ctx, pose, P, true);

    this._drawTorso(ctx, pose, P);
    this._drawBelt(ctx, pose, P);

    // Рука, натягивающая тетиву — за корпусом.
    this._drawDrawingArm(ctx, pose, cfg, P);

    this._drawBow(ctx, pose, cfg, P);
    this._drawBowArm(ctx, pose, cfg, P);
    this._drawHead(ctx, pose, cfg, P);

    this._drawShootFx(ctx, pose, cfg, P);
    ctx.restore();
  }

  _drawShadow(ctx, pose, P) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    const sq = 1 - clamp01(pose.deathK) * 0.15;
    ctx.translate(pose.sway * 0.4 + pose.deathSlide * 0.5, 27);
    ctx.scale(1.1 * sq, 0.32 * sq);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ===================== CLOTHES =====================

  _drawBackCloak(ctx, pose, P) {
    const sway = pose.side ? pose.sway * 0.6 : 0;
    const hemWave = Math.sin(pose.time * 2.4 + 1.2) * 1.1;
    ctx.save();
    ctx.fillStyle = P.cloakDark;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-7, -7);
    ctx.quadraticCurveTo(-14, 1, -13 + sway, 16 + hemWave);
    ctx.lineTo(-10 + sway, 14 + hemWave);
    ctx.lineTo(-8 + sway, 20 + hemWave);
    ctx.lineTo(-5 + sway, 15 + hemWave);
    ctx.lineTo(-2 + sway, 22 + hemWave);
    ctx.lineTo(2 + sway, 16 + hemWave);
    ctx.lineTo(5 + sway, 21 + hemWave);
    ctx.lineTo(8 + sway, 15 + hemWave);
    ctx.lineTo(11 + sway, 18 + hemWave);
    ctx.quadraticCurveTo(12, 3, 7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Складки ткани.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = P.cloakMid;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-8, 9, -7 + sway, 17);
    ctx.moveTo(4, 3); ctx.quadraticCurveTo(5, 10, 6 + sway, 16);
    ctx.stroke();
    ctx.restore();
  }

  _drawTorso(ctx, pose, P) {
    const sway = pose.side ? pose.sway * 0.35 : 0;
    const hem = Math.sin(pose.time * 2.2) * 0.8;
    ctx.save();
    const g = ctx.createLinearGradient(0, -8, 0, 20);
    g.addColorStop(0, P.cloakLight);
    g.addColorStop(0.38, P.cloakMid);
    g.addColorStop(1, P.cloakDark);
    ctx.fillStyle = g;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.quadraticCurveTo(-9, 2, -7, 10);
    ctx.lineTo(-9 + sway, 19 + hem);
    ctx.lineTo(-6 + sway, 17 + hem);
    ctx.lineTo(-3 + sway, 21 + hem);
    ctx.lineTo(0 + sway, 17 + hem);
    ctx.lineTo(3 + sway, 21 + hem);
    ctx.lineTo(6 + sway, 17 + hem);
    ctx.lineTo(8 + sway, 19 + hem);
    ctx.quadraticCurveTo(8, 3, 6, -6);
    ctx.quadraticCurveTo(0, -9, -7, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Плечевая накидка с рваным краем.
    ctx.fillStyle = P.cloakMid;
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(-10, -2); ctx.lineTo(-7, -1); ctx.lineTo(-8, 2);
    ctx.lineTo(-4, 0); ctx.lineTo(-1, 3); ctx.lineTo(2, 0);
    ctx.lineTo(6, 2); ctx.lineTo(8, -2); ctx.lineTo(6, -6);
    ctx.quadraticCurveTo(0, -10, -8, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Пара ребер, проглядывающих сквозь прореху плаща.
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = 1.15;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(1.4, 1.2 + i * 1.9);
      ctx.quadraticCurveTo(4.6, 0.4 + i * 1.9, 6.0, 1.7 + i * 1.9);
      ctx.stroke();
    }
    ctx.restore();

    // Воротник и шов.
    ctx.strokeStyle = P.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-5, -5.5); ctx.quadraticCurveTo(0, -2.4, 5, -5.5);
    ctx.stroke();
    ctx.restore();
  }

  _drawBelt(ctx, pose, P) {
    const x = pose.side ? 1.0 : 0;
    ctx.save();
    ctx.fillStyle = P.leatherDark;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(-7 + x, 8, 13, 3.2, 1.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.leather;
    ctx.fillRect(-7 + x, 8.4, 13, 1.4);
    ctx.fillStyle = P.metal;
    ctx.fillRect(x - 0.8, 7.5, 2.4, 4.2);
    ctx.fillStyle = P.accent;
    ctx.fillRect(x - 0.2, 8.3, 1.2, 2.6);

    // Поясная сумка.
    ctx.fillStyle = P.leather;
    ctx.strokeStyle = P.leatherDark;
    ctx.beginPath();
    ctx.roundRect(-9 + x, 10.4, 4.8, 4.8, 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.leatherLight;
    ctx.fillRect(-9.1 + x, 10.6, 4.9, 1.2);
    ctx.restore();
  }

  _drawQuiver(ctx, pose, P) {
    ctx.save();
    ctx.translate(pose.side ? -8.5 : -5.5, -3.5);
    ctx.rotate(pose.side ? 0.28 : 0.16);
    ctx.fillStyle = P.leatherDark;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(-2.6, -5, 5.2, 15, 2.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.leather;
    ctx.fillRect(-2.3, -4.5, 1.1, 13.5);
    ctx.fillStyle = P.leatherLight;
    ctx.fillRect(-2.6, 1.8, 5.2, 1.0);

    // Стрелы в колчане.
    for (let i = 0; i < 3; i++) {
      const ax = -1.8 + i * 1.8;
      ctx.strokeStyle = P.arrowWood;
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(ax, -4); ctx.lineTo(ax + 0.5, -10); ctx.stroke();
      ctx.fillStyle = i % 2 ? P.arrowFletch : P.accent;
      ctx.beginPath();
      ctx.moveTo(ax + 0.5, -10);
      ctx.lineTo(ax - 0.7, -8.7);
      ctx.lineTo(ax + 0.8, -8.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ===================== BONES / LIMBS =====================

  _drawLimbBone(ctx, x1, y1, x2, y2, w, P, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = w + 1.1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = P.bone;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#fff7e6';
    ctx.globalAlpha *= 0.4;
    ctx.lineWidth = Math.max(0.4, w * 0.24);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  _joint(ctx, x, y, r, P, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = P.bone;
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  _drawLeg(ctx, pose, P, near) {
    const sign = near ? 1 : -1;
    const stride = (pose.moving ? 1 : 0) * (pose.moving ? (this.cfg.walk_boot_stride_px ?? 3.2) : 0);
    const lift = pose.moving ? (this.cfg.walk_boot_lift_px ?? 2.2) : 0;
    const ph = pose.step * sign;
    const hipX = near ? 2.5 : -2.5;
    const hipY = 10;
    const footX = hipX + ph * stride * 0.9;
    const footY = 26 - Math.max(0, ph) * lift;
    const kneeX = (hipX + footX) * 0.5 + (near ? 0.8 : -0.8);
    const kneeY = 18.0 - Math.max(0, ph) * lift * 0.28;

    const dark = near ? 1 : 0.72;
    this._drawLimbBone(ctx, hipX, hipY, kneeX, kneeY, 2.15, P, dark);
    this._joint(ctx, kneeX, kneeY, 1.35, P, dark);
    this._drawLimbBone(ctx, kneeX, kneeY, footX, footY - 2.2, 1.8, P, dark);
    this._drawBoot(ctx, footX, footY, pose.side, near, P, dark);
  }

  _drawBoot(ctx, x, y, side, near, P, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = P.boot;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.8;
    if (side) {
      // Профиль: носок смотрит вперёд (вправо до зеркалирования).
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y - 3.5);
      ctx.lineTo(x + 2.6, y - 3.5);
      ctx.quadraticCurveTo(x + 5.4, y - 1.4, x + 4.6, y + 1.1);
      ctx.lineTo(x - 2.4, y + 1.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.leatherDark;
      ctx.fillRect(x - 2.3, y - 0.4, 7.1, 1.7);
      ctx.fillStyle = P.metal;
      ctx.fillRect(x + 0.2, y - 2.5, 1.5, 1.4);
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y + 0.2, 3.1, 2.5, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.leatherDark;
      ctx.fillRect(x - 2.4, y + 0.4, 4.8, 1.2);
    }
    if (near) {
      ctx.globalAlpha *= 0.7;
      ctx.strokeStyle = P.leatherLight;
      ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.moveTo(x - 1.5, y - 2.8); ctx.lineTo(x + 1.5, y - 2.8); ctx.stroke();
    }
    ctx.restore();
  }

  _bowPose(pose, cfg) {
    const aim = pose.aim || 0;
    const cx = cfg.bow_hand_x ?? 15;
    const cy = (cfg.bow_hand_y ?? -1) + (1 - aim) * (cfg.bow_idle_drop_px ?? 2.5);
    const h = cfg.bow_height_px ?? 31;
    const pull = (cfg.string_pull_px ?? 8.5) * (pose.pull || 0);
    return { cx, cy, h, pull, nockX: cx - pull, nockY: cy };
  }

  _drawDrawingArm(ctx, pose, cfg, P) {
    const b = this._bowPose(pose, cfg);
    const aim = pose.aim || 0;
    const sx = -4.4, sy = -4.2;
    const ex = lerp(-6.5, -1.3, aim);
    const ey = lerp(1.4, 0.2, aim);
    const hx = lerp(-2.1, b.nockX - 1.2, aim);
    const hy = lerp(1.2, b.nockY + 0.1, aim);
    this._drawLimbBone(ctx, sx, sy, ex, ey, 1.85, P, 0.75);
    this._joint(ctx, ex, ey, 1.05, P, 0.75);
    this._drawLimbBone(ctx, ex, ey, hx, hy, 1.45, P, 0.7);
    this._drawHand(ctx, hx, hy, P, 0.78, aim > 0.4);
  }

  _drawBowArm(ctx, pose, cfg, P) {
    const b = this._bowPose(pose, cfg);
    const sx = 4.2, sy = -4.2;
    const ex = 9.3, ey = lerp(1.8, 0.1, pose.aim || 0);
    const hx = b.cx - 0.6, hy = b.cy;
    this._drawLimbBone(ctx, sx, sy, ex, ey, 2.0, P, 1);
    this._joint(ctx, ex, ey, 1.10, P, 1);
    this._drawLimbBone(ctx, ex, ey, hx, hy, 1.55, P, 1);
    this._drawHand(ctx, hx, hy, P, 1, true);
  }

  _drawHand(ctx, x, y, P, alpha, gripping) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = P.bone;
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = 0.45;
    for (let i = 0; i < 3; i++) {
      const a = -0.7 + i * 0.55;
      const fx = x + Math.cos(a) * (gripping ? 1.9 : 1.4);
      const fy = y + Math.sin(a) * (gripping ? 1.6 : 1.2);
      ctx.beginPath(); ctx.arc(fx, fy, 0.75, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, 1.0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ===================== BOW =====================

  _drawBow(ctx, pose, cfg, P) {
    const b = this._bowPose(pose, cfg);
    const aim = pose.aim || 0;
    const h = b.h;
    const topX = b.cx + h * 0.16;
    const topY = b.cy - h * 0.50;
    const botX = b.cx + h * 0.16;
    const botY = b.cy + h * 0.50;
    const shoulderTopX = b.cx - 2.4;
    const shoulderTopY = b.cy - h * 0.2;
    const shoulderBotX = b.cx - 2.4;
    const shoulderBotY = b.cy + h * 0.2;

    ctx.save();
    ctx.rotate((1 - aim) * -0.06);

    // Верхнее и нижнее плечо лука.
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? P.cloakTrim : P.bowWood;
      ctx.lineWidth = pass === 0 ? 4.4 : 2.9;
      ctx.beginPath();
      ctx.moveTo(b.cx, b.cy);
      ctx.bezierCurveTo(shoulderTopX, shoulderTopY, shoulderTopX + 1.8, topY + 4, topX, topY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.cx, b.cy);
      ctx.bezierCurveTo(shoulderBotX, shoulderBotY, shoulderBotX + 1.8, botY - 4, botX, botY);
      ctx.stroke();
    }
    // Светлая грань.
    ctx.strokeStyle = P.bowWoodLight;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(b.cx - 0.5, b.cy - 2);
    ctx.bezierCurveTo(shoulderTopX - 0.4, shoulderTopY, shoulderTopX + 1.2, topY + 4, topX, topY + 0.4);
    ctx.moveTo(b.cx - 0.5, b.cy + 2);
    ctx.bezierCurveTo(shoulderBotX - 0.4, shoulderBotY, shoulderBotX + 1.2, botY - 4, botX, botY - 0.4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Костяные наконечники плеч лука.
    ctx.fillStyle = P.bowBone;
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = 0.55;
    for (const [tx, ty, flip] of [[topX, topY, 1], [botX, botY, -1]]) {
      ctx.beginPath();
      ctx.moveTo(tx + 2.2, ty - 0.4 * flip);
      ctx.lineTo(tx - 1.8, ty - 2.5 * flip);
      ctx.lineTo(tx - 0.7, ty + 1.4 * flip);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Обмотка рукояти.
    ctx.strokeStyle = P.leather;
    ctx.lineWidth = 3.1;
    ctx.beginPath(); ctx.moveTo(b.cx - 0.5, b.cy - 3); ctx.lineTo(b.cx - 0.5, b.cy + 3); ctx.stroke();
    ctx.strokeStyle = P.leatherLight;
    ctx.lineWidth = 0.55;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(b.cx - 2.0, b.cy + i * 1.5); ctx.lineTo(b.cx + 1.0, b.cy + i * 1.5 - 0.4); ctx.stroke();
    }

    // Тетива (натянутая или прямая).
    const nockX = b.nockX;
    const nockY = b.nockY;
    ctx.strokeStyle = P.bowString;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(nockX, nockY);
    ctx.lineTo(botX, botY);
    ctx.stroke();

    // Стрела на тетиве.
    if (aim > 0.10) {
      const a = clamp01((aim - 0.1) / 0.9);
      ctx.save();
      ctx.globalAlpha *= a;
      const arrowLen = cfg.arrow_length_px ?? 21;
      const tipX = b.cx + arrowLen;
      ctx.strokeStyle = P.arrowWood;
      ctx.lineWidth = 1.25;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(nockX, nockY); ctx.lineTo(tipX, nockY); ctx.stroke();
      // Наконечник.
      ctx.fillStyle = P.arrowHead;
      ctx.beginPath();
      ctx.moveTo(tipX + 3.2, nockY);
      ctx.lineTo(tipX - 1.4, nockY - 1.7);
      ctx.lineTo(tipX - 1.4, nockY + 1.7);
      ctx.closePath(); ctx.fill();
      // Оперение.
      ctx.fillStyle = P.arrowFletch;
      ctx.beginPath();
      ctx.moveTo(nockX + 1.0, nockY);
      ctx.lineTo(nockX + 4.1, nockY - 2.0);
      ctx.lineTo(nockX + 4.6, nockY);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(nockX + 1.0, nockY);
      ctx.lineTo(nockX + 4.1, nockY + 2.0);
      ctx.lineTo(nockX + 4.6, nockY);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ===================== HEAD =====================

  _drawHead(ctx, pose, cfg, P) {
    const headSway = Math.sin(pose.time * 1.6) * (cfg.idle_head_turn_px ?? 1.0) * (1 - pose.moveK);
    ctx.save();
    ctx.translate(headSway, 0);

    // Задняя часть капюшона.
    ctx.fillStyle = P.cloakDark;
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-9, -5.5);
    ctx.quadraticCurveTo(-10.5, -15, -2.5, -23.5);
    ctx.quadraticCurveTo(6.6, -22.0, 9.1, -11.0);
    ctx.quadraticCurveTo(9.4, -4.0, 6.2, -2.0);
    ctx.lineTo(-7.2, -2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Тёмная внутренность капюшона.
    ctx.fillStyle = '#080a08';
    ctx.beginPath();
    ctx.ellipse(1.2, -11.0, 6.2, 7.0, 0.05, 0, TAU);
    ctx.fill();

    if (!pose.back) {
      // Череп.
      ctx.fillStyle = P.bone;
      ctx.strokeStyle = P.boneShadow;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.ellipse(1.6, -11.6, 4.15, 5.1, -0.03, 0, TAU);
      ctx.fill(); ctx.stroke();

      // Челюсть.
      ctx.beginPath();
      ctx.moveTo(-1.6, -7.7);
      ctx.quadraticCurveTo(1.4, -5.3, 4.9, -7.2);
      ctx.lineTo(3.8, -5.0);
      ctx.quadraticCurveTo(1.2, -4.0, -1.0, -5.6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      // Глазницы + свечение.
      const eyes = pose.front ? [[-1.8, -12.4], [2.6, -12.4]] : [[3.1, -12.3]];
      for (const [ex, ey] of eyes) {
        ctx.fillStyle = '#100c08';
        ctx.beginPath(); ctx.ellipse(ex, ey, 1.55, 1.9, 0, 0, TAU); ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 2.3);
        eg.addColorStop(0, P.eyeCore);
        eg.addColorStop(0.28, P.eye);
        eg.addColorStop(1, 'rgba(255,140,0,0)');
        ctx.globalAlpha = cfg.eye_glow_alpha ?? 0.8;
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(ex, ey, 2.3, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // Носовая впадина.
      ctx.fillStyle = P.boneDark;
      ctx.beginPath();
      ctx.moveTo(2.0, -10.2);
      ctx.lineTo(3.5, -8.6);
      ctx.lineTo(1.4, -8.5);
      ctx.closePath();
      ctx.fill();

      // Зубы.
      ctx.strokeStyle = P.boneShadow;
      ctx.lineWidth = 0.45;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-0.2 + i * 1.25, -6.8);
        ctx.lineTo(-0.1 + i * 1.25, -5.4);
        ctx.stroke();
      }

      // Трещина на черепе.
      ctx.strokeStyle = P.boneDark;
      ctx.globalAlpha *= 0.8;
      ctx.lineWidth = 0.38;
      ctx.beginPath();
      ctx.moveTo(0.1, -16.4);
      ctx.lineTo(1.1, -15.0);
      ctx.lineTo(0.5, -14.0);
      ctx.stroke();
    } else {
      // Вид со спины: складки капюшона, без лица.
      ctx.strokeStyle = P.cloakMid;
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2.5, -20.2);
      ctx.quadraticCurveTo(-4.5, -12, -3.2, -5.4);
      ctx.moveTo(4.2, -19.0);
      ctx.quadraticCurveTo(5.2, -12, 4.1, -5.8);
      ctx.stroke();
    }

    // Передний край капюшона.
    ctx.strokeStyle = P.cloakTrim;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-7.2, -6.0);
    ctx.quadraticCurveTo(-4.8, -20.3, 2.0, -22.1);
    ctx.quadraticCurveTo(8.2, -19.1, 8.3, -7.0);
    ctx.stroke();

    // Акцентная завязка капюшона.
    ctx.strokeStyle = P.accent;
    ctx.globalAlpha *= 0.75;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-4.0, -4.3);
    ctx.quadraticCurveTo(1.2, -1.8, 5.3, -4.7);
    ctx.stroke();
    ctx.restore();
  }

  _drawShootFx(ctx, pose, cfg, P) {
    if (!(pose.release > 0.04)) return;
    const b = this._bowPose(pose, cfg);
    const a = pose.release;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = (cfg.shoot_flash_radius_px ?? 8) * (0.5 + a * 0.8);
    const g = ctx.createRadialGradient(b.cx + 18, b.cy, 0, b.cx + 18, b.cy, r);
    g.addColorStop(0, '#fff9d8');
    g.addColorStop(0.35, '#ffd15c');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.globalAlpha = (cfg.shoot_flash_alpha ?? 0.55) * a;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.cx + 18, b.cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 0.7;
    ctx.globalAlpha *= 0.7;
    for (let i = 0; i < 3; i++) {
      const y = b.cy - 2.6 + i * 2.6;
      ctx.beginPath();
      ctx.moveTo(b.cx + 16 + i * 1.4, y);
      ctx.lineTo(b.cx + 26 + a * 5, y - 0.3 * (i - 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===================== DUST =====================

  _updateDust(dt, pose, cfg, c) {
    const moving = pose.moveK > 0.2;
    const step = pose.step;
    const crossed = moving && (c.prevStep <= 0) && (step > 0);
    c.prevStep = moving ? step : 0;
    if (crossed && c.dust.length < 7) {
      const n = c.dust.length < 4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        c.dust.push({
          x: (i % 2 === 0 ? -3 : 3) + (Math.random() - 0.5) * 2,
          y: 26.5 + Math.random() * 1.2,
          vx: (i % 2 === 0 ? -1 : 1) * (2.5 + Math.random() * 4),
          vy: 2 + Math.random() * 4,
          r: 1 + Math.random() * 1.2,
          life: 0,
          max: 0.35 + Math.random() * 0.25
        });
      }
    }
    for (let i = c.dust.length - 1; i >= 0; i--) {
      const p = c.dust[i];
      p.life += dt;
      if (p.life >= p.max) { c.dust.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3);
    }
  }

  _drawDust(ctx, pose, cfg, P, c) {
    const d = c.dust || [];
    if (!d.length) return;
    ctx.save();
    ctx.globalAlpha = cfg.dust_alpha ?? 0.22;
    ctx.fillStyle = P.dust;
    for (const p of d) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = (cfg.dust_alpha ?? 0.22) * k;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.7, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===================== DEATH BONES =====================

  _makeBones(seed) {
    const S = 1;
    const defs = [
      { kind: 'skull', sx: 1.0, sy: -12.0, tx: -2.5, ty: 20.0, size: 5.2, launch: 10, delay: 0.00, spin: -1.2, rest: -0.18 },
      { kind: 'jaw', sx: 1.4, sy: -7.0, tx: 2.2, ty: 23.0, size: 4.0, launch: 7, delay: 0.03, spin: 2.1, rest: 0.28 },
      { kind: 'ribcage', sx: 0.0, sy: 1.0, tx: 0.0, ty: 24.2, size: 7.6, launch: 9, delay: 0.06, spin: 1.0, rest: 0.05 },
      { kind: 'pelvis', sx: 0.0, sy: 9.0, tx: 6.2, ty: 24.4, size: 5.0, launch: 8, delay: 0.09, spin: -1.8, rest: 0.35 },
      { kind: 'femur', sx: -2.5, sy: 10.0, tx: -10.5, ty: 25.0, size: 6.4, launch: 11, delay: 0.04, spin: 3.0, rest: 1.30 },
      { kind: 'femur', sx: 2.5, sy: 10.0, tx: 9.6, ty: 25.2, size: 6.0, launch: 10, delay: 0.11, spin: -2.4, rest: -0.9 },
      { kind: 'shin', sx: -3.0, sy: 17.0, tx: -13.5, ty: 26.0, size: 5.6, launch: 8, delay: 0.12, spin: 2.6, rest: 1.1 },
      { kind: 'shin', sx: 3.0, sy: 17.0, tx: 12.0, ty: 26.0, size: 5.2, launch: 9, delay: 0.16, spin: -2.9, rest: -1.25 },
      { kind: 'arm', sx: -4.4, sy: -4.2, tx: -6.8, ty: 21.5, size: 5.4, launch: 12, delay: 0.02, spin: 2.5, rest: 0.7 },
      { kind: 'arm', sx: 4.2, sy: -4.2, tx: 7.0, ty: 22.0, size: 5.0, launch: 13, delay: 0.07, spin: -2.1, rest: -0.5 },
      { kind: 'hand', sx: -2.1, sy: 1.0, tx: -4.2, ty: 23.2, size: 2.4, launch: 6, delay: 0.17, spin: 3.7, rest: 0.0 },
      { kind: 'hand', sx: 14.0, sy: 0.0, tx: 4.8, ty: 22.6, size: 2.2, launch: 7, delay: 0.14, spin: -3.5, rest: 0.15 },
      { kind: 'boot', sx: 3.4, sy: 25.0, tx: -7.2, ty: 26.4, size: 4.2, launch: 6, delay: 0.18, spin: 1.7, rest: 0.2 },
      { kind: 'boot', sx: -3.4, sy: 25.0, tx: 8.4, ty: 26.4, size: 4.2, launch: 7, delay: 0.20, spin: -1.4, rest: -0.2 }
    ];
    return defs.map((d, i) => {
      const r = (n) => hash(seed + i * 17.7 + n * 3.11);
      const spread = 1.7;
      return {
        ...d,
        sx: d.sx * S,
        sy: d.sy * S,
        tx: d.tx + (r(1) - 0.5) * spread,
        ty: d.ty + (r(2) - 0.5) * 1.6,
        size: d.size * (0.88 + r(3) * 0.26),
        launch: d.launch * (0.75 + r(4) * 0.55),
        wx: (r(5) - 0.5) * 8,
        wy: (r(6) - 0.5) * 4,
        phase: r(7) * TAU,
        spin: d.spin * (0.8 + r(8) * 0.5),
        rest: d.rest + (r(9) - 0.5) * 0.5
      };
    });
  }

  _drawBones(ctx, pose, cfg, P, c) {
    const k = pose.deathK;
    if (k <= 0.01 || !pose.bones) return;
    ctx.save();
    ctx.globalAlpha = cfg.bone_alpha ?? 0.95;
    for (const b of pose.bones) {
      const start = 0.10 + b.delay * 0.45;
      const u = clamp01((k - start) / 0.58);
      if (u <= 0) continue;
      const fly = easeOutCubic(u);
      const arc = Math.sin(Math.PI * u) * b.launch;
      const wob = Math.sin(u * Math.PI * 2 + b.phase) * b.wx * (1 - u);
      let x = lerp(b.sx, b.tx, fly) + wob;
      let y = lerp(b.sy, b.ty, fly) - arc + b.wy * (1 - u);
      let rot = lerp(0, b.spin * TAU, fly);
      const settle = smoothstep(clamp01((k - 0.55) / 0.45));
      x = lerp(x, b.tx, settle);
      y = lerp(y, b.ty, settle);
      rot = lerp(rot, b.rest, settle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      this._drawBonePiece(ctx, b.kind, b.size, P);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawBonePiece(ctx, kind, size, P) {
    ctx.fillStyle = P.bone;
    ctx.strokeStyle = P.boneShadow;
    ctx.lineWidth = Math.max(0.45, size * 0.12);

    if (kind === 'skull') {
      ctx.beginPath(); ctx.ellipse(0, 0, size * 0.86, size * 0.72, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a140c';
      ctx.beginPath(); ctx.ellipse(-size * 0.28, -size * 0.10, size * 0.2, size * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.28, -size * 0.10, size * 0.2, size * 0.24, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = P.boneDark;
      ctx.beginPath(); ctx.moveTo(0, size * 0.15); ctx.lineTo(-size * 0.13, size * 0.38); ctx.lineTo(size * 0.13, size * 0.38); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.boneShadow;
      ctx.beginPath(); ctx.moveTo(-size * 0.55, size * 0.5); ctx.lineTo(size * 0.55, size * 0.5); ctx.stroke();
    } else if (kind === 'jaw') {
      ctx.beginPath();
      ctx.arc(0, -size * 0.3, size * 0.75, 0.12, Math.PI - 0.12);
      ctx.strokeStyle = P.bone;
      ctx.lineWidth = size * 0.26;
      ctx.stroke();
      ctx.fillStyle = P.boneDark;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(i * size * 0.18 - size * 0.04, size * 0.06, size * 0.08, size * 0.22);
      }
    } else if (kind === 'ribcage') {
      ctx.strokeStyle = P.boneShadow;
      ctx.lineWidth = Math.max(0.45, size * 0.12);
      ctx.beginPath(); ctx.moveTo(0, -size * 0.7); ctx.lineTo(0, size * 0.75); ctx.stroke();
      ctx.strokeStyle = P.bone;
      ctx.lineWidth = Math.max(0.55, size * 0.16);
      for (let i = 0; i < 4; i++) {
        const yy = -size * 0.45 + i * size * 0.33;
        const w = size * (0.78 - i * 0.06);
        ctx.beginPath();
        ctx.moveTo(-w * 0.12, yy);
        ctx.quadraticCurveTo(-w, yy - size * 0.1, -w * 0.85, yy + size * 0.35);
        ctx.moveTo(w * 0.12, yy);
        ctx.quadraticCurveTo(w, yy - size * 0.1, w * 0.85, yy + size * 0.35);
        ctx.stroke();
      }
    } else if (kind === 'pelvis') {
      ctx.beginPath();
      ctx.ellipse(-size * 0.3, 0, size * 0.42, size * 0.62, -0.35, 0, TAU);
      ctx.ellipse(size * 0.3, 0, size * 0.42, size * 0.62, 0.35, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.boneDark;
      ctx.beginPath(); ctx.ellipse(0, size * 0.18, size * 0.24, size * 0.3, 0, 0, TAU); ctx.fill();
    } else if (kind === 'femur' || kind === 'arm' || kind === 'shin') {
      const w = kind === 'arm' ? size * 0.22 : size * 0.27;
      ctx.strokeStyle = P.boneShadow;
      ctx.lineWidth = w + Math.max(0.8, size * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-size * 0.48, 0); ctx.lineTo(size * 0.48, 0); ctx.stroke();
      ctx.strokeStyle = P.bone;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(-size * 0.48, 0); ctx.lineTo(size * 0.48, 0); ctx.stroke();
      ctx.fillStyle = P.bone;
      ctx.strokeStyle = P.boneShadow;
      ctx.lineWidth = Math.max(0.45, size * 0.1);
      ctx.beginPath(); ctx.arc(-size * 0.48, 0, w * 0.9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(size * 0.48, 0, w * 0.9, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (kind === 'hand') {
      ctx.fillStyle = P.bone;
      ctx.strokeStyle = P.boneShadow;
      for (let i = 0; i < 4; i++) {
        const a = -0.8 + i * 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * size * 0.45, Math.sin(a) * size * 0.35, size * 0.22, 0, TAU);
        ctx.fill(); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (kind === 'boot') {
      ctx.fillStyle = P.boot;
      ctx.strokeStyle = P.cloakTrim;
      ctx.lineWidth = Math.max(0.55, size * 0.1);
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, -size * 0.4);
      ctx.lineTo(size * 0.52, -size * 0.4);
      ctx.quadraticCurveTo(size * 0.9, size * 0.1, size * 0.75, size * 0.45);
      ctx.lineTo(-size * 0.6, size * 0.45);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.leatherDark;
      ctx.fillRect(-size * 0.55, size * 0.2, size * 1.3, size * 0.22);
    }
  }
}
