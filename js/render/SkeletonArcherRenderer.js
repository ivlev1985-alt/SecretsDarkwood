// Процедурный скелет-лучник. Рисуется векторно в виртуальном кадре 64×64.
// Заменяет спрайт dark_elf (и других ranged-монстров) при включённом режиме.
//
// Режимы (game_config.visuals.skeleton_archer.mode):
//   "missing" — рисовать скелета только если спрайт не загрузился (по умолчанию);
//   "always"  — всегда рисовать процедурного скелета;
//   "never"   — не использовать процедурного скелета.
//
// Анимации: ходьба в 4 стороны, выстрел (подъём лука), смерть (падение + рассыпание).
// Все константы — в game_config.visuals.skeleton_archer.

const TAU = Math.PI * 2;
// Смещения для «наклеечного» контура (8 направлений, 1px в пикселях offscreen)
const OUTLINE_OFF = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class SkeletonArcherRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
    this.off = null; // финальная композиция: контур + арт
    this.offCtx = null;
    this.art = null; // скелет без контура
    this.artCtx = null;
    this.sil = null; // залитый silhouette для контура
    this.silCtx = null;
    this.dust = []; // пылинки из-под ног
    this.prevStep = 0;
    this.lastTime = 0;
    this._pxScale = 1;
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  draw(ctx, enemy, time, opts = {}) {
    if (!ctx || !enemy) return;
    const cfg = this.cfg || {};
    const scale = Math.max(0.01, opts.scale || 1);
    const w = Math.max(1, opts.w || 64);
    const h = Math.max(1, opts.h || 64);
    const artScale = Math.min(w / 64, h / 64);
    this._pxScale = scale * artScale;
    const pad = Math.max(0, cfg.frame_padding_px ?? 26);
    const pw = Math.max(1, Math.ceil((w + pad * 2) * scale));
    const ph = Math.max(1, Math.ceil((h + pad * 2) * scale));
    const off = this._canvas('off', pw, ph);
    const art = this._canvas('art', pw, ph);
    const sil = this._canvas('sil', pw, ph);
    if (!off || !art || !sil) return;
    const o = this.offCtx, a = this.artCtx, s = this.silCtx;

    // dt для частиц пыли
    let dt = (time || 0) - this.lastTime;
    if (!(dt > 0) || dt > 0.1) dt = 0.016;
    this.lastTime = time || 0;

    const dir = this._dir(enemy);
    const pose = this._pose(enemy, time, dir, dt);

    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, pw, ph);
    a.save();
    a.translate(pw / 2, ph / 2);
    a.scale(this._pxScale, this._pxScale);
    if ((dir === 'left')) a.scale(-1, 1);
    this._paint(a, pose, cfg);
    a.restore();

    // Подсветка урона
    const flash = Math.max(0, enemy.hitFlash || 0);
    if (flash > 0) {
      a.globalCompositeOperation = 'source-atop';
      a.globalAlpha = Math.min(0.35, flash * 2.5);
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
    s.fillStyle = cfg.outline || '#150a2e';
    s.fillRect(0, 0, pw, ph);
    s.globalCompositeOperation = 'source-over';

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, pw, ph);
    const k = Math.max(1, Math.round(1 * this._pxScale));
    for (let i = 0; i < OUTLINE_OFF.length; i += 2) {
      o.drawImage(sil, OUTLINE_OFF[i] * k, OUTLINE_OFF[i + 1] * k);
    }
    o.drawImage(art, 0, 0);

    const alpha = Math.max(0, 1 - pose.deathK * (cfg.death_fade ?? 0.45));
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.tilt) ctx.rotate(enemy.tilt);
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.off, -pw / 2, -ph / 2, pw, ph);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _canvas(key, pw, ph) {
    if (typeof document === 'undefined') return null;
    if (!this[key]) {
      this[key] = document.createElement('canvas');
      this[key + 'Ctx'] = this[key].getContext('2d');
    }
    if (this[key].width !== pw || this[key].height !== ph) {
      this[key].width = pw;
      this[key].height = ph;
    }
    return this[key];
  }

  _dir(enemy) {
    if (enemy.heroDir) return enemy.heroDir;
    return enemy.facing < 0 ? 'left' : 'right';
  }

  // Партиклы пыли
  _updateDust(dt, moving, step, cfg) {
    const d = this.dust;
    const crossed = moving && this.prevStep <= 0 && step > 0;
    this.prevStep = moving ? step : 0;
    if (crossed && d.length < 6) {
      const n = d.length < 4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        d.push({
          x: (i % 2 === 0 ? -3 : 3) + (Math.random() - 0.5) * 2,
          y: 27 + Math.random() * 1.5,
          vx: (i % 2 === 0 ? -1 : 1) * (3 + Math.random() * 4),
          vy: 3 + Math.random() * 4,
          r: 1 + Math.random() * 1.1,
          life: 0,
          max: 0.4 + Math.random() * 0.2
        });
      }
    }
    for (let i = d.length - 1; i >= 0; i--) {
      const p = d[i];
      p.life += dt;
      if (p.life >= p.max) { d.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3);
    }
    this._dustCfg = { alpha: cfg.dust_alpha ?? 0.22, color: cfg.dust || '#b6ab96' };
  }

  _pose(enemy, time, dir, dt = 0.016) {
    const cfg = this.cfg || {};
    // Монстры всегда в движении (нет idle); смерть — не движение
    const dying = enemy.deathT > 0 || enemy.alive === false;
    const moving = !dying;
    const cycles = cfg.walk_cycles_per_sec ?? 2.4;
    const phase = (time || 0) * cycles * TAU;
    const step = moving ? Math.sin(phase) : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) * (cfg.walk_bob_px ?? 2.2) : 0;
    const sway = moving ? Math.sin(phase) * (cfg.walk_sway_px ?? 1.7) : 0;

    this._updateDust(dt, moving, step, cfg);

    // Выстрел: подъём лука в направлении цели
    const shootDur = Math.max(0.001, enemy.shootDuration ?? 0.6);
    const shootK = (!dying && enemy.shootT > 0)
      ? Math.sin(Math.PI * clamp01(1 - enemy.shootT / shootDur))
      : 0;

    // Смерть: deathT растёт от 0 до dur (Enemy.updateDeath)
    let deathDur = enemy.deathDuration ?? 1.1;
    if (typeof enemy.deathTiming === 'function') {
      const t = enemy.deathTiming();
      deathDur = Math.max(0.001, t.dur + t.fade);
    }
    const deathK = dying
      ? clamp01((enemy.deathT || 0) / deathDur)
      : 0;
    const fall = easeInOutCubic(deathK);

    return {
      dir,
      side: dir === 'left' || dir === 'right',
      back: dir === 'up',
      front: dir === 'down',
      moving, phase, step, bob, sway,
      shootK,
      deathK, fall,
      trail: moving && (dir === 'left' || dir === 'right') ? -(cfg.side_trail_px ?? 1.8) : 0,
      deathRot: -fall * (cfg.death_fall_rad ?? 1.15),
      deathX: -fall * (cfg.death_slide_px ?? 5),
      deathY: fall * (cfg.death_sink_px ?? 6)
    };
  }

  _paint(o, pose, C) {
    this._drawShadow(o, pose, C);

    o.save();
    if (pose.fall > 0) {
      o.translate(pose.deathX, pose.deathY);
      o.translate(0, 26);
      o.rotate(pose.deathRot);
      o.translate(0, -26);
    }
    o.translate(pose.sway * 0.25, -pose.bob * 0.8);

    this._drawCloak(o, pose, C);
    this._drawLegs(o, pose, C);
    this._drawArms(o, pose, C);
    this._drawBow(o, pose, C);
    this._drawQuiver(o, pose, C);
    this._drawHead(o, pose, C);
    if (pose.shootK > 0.05) this._drawShootFX(o, pose, C);

    o.restore();

    // Пыль
    if (this.dust.length) {
      const dc = this._dustCfg || { alpha: 0.22, color: '#b6ab96' };
      o.save();
      o.fillStyle = dc.color;
      for (const p of this.dust) {
        o.globalAlpha = dc.alpha * (1 - p.life / p.max);
        o.beginPath();
        o.arc(p.x, p.y, p.r * (1 + p.life), 0, TAU);
        o.fill();
      }
      o.globalAlpha = 1;
      o.restore();
    }

    // Смерть: рассыпание костей
    if (pose.deathK > 0.1) this._drawDeathFX(o, pose, C);
  }

  _drawShadow(o, pose, C) {
    o.save();
    o.globalAlpha = 0.30 * (1 - pose.fall * 0.45);
    o.fillStyle = C.shadow_color || 'rgba(0,0,0,0.30)';
    o.beginPath();
    o.ellipse(0, 28, C.shadow_rx ?? 16, C.shadow_ry ?? 5, 0, 0, TAU);
    o.fill();
    o.restore();
  }

  // Плащ с капюшоном
  _drawCloak(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;
    const sway = pose.sway;
    const hem = 23;
    const left = -14 + shift;
    const right = 14 + shift;

    o.save();
    if (side && pose.moving) {
      o.translate(0, 26);
      o.rotate((C.walk_lean_rad ?? 0.035) * (0.5 + 0.5 * Math.cos(pose.phase)));
      o.translate(0, -26);
    }

    const wave = pose.moving ? Math.sin(pose.phase * 1.5) * (C.hem_wave_px ?? 1.3) : 0;

    o.beginPath();
    o.moveTo(-7 + shift, -5);
    o.quadraticCurveTo(left - 1, 7, left + sway * 0.7 + wave, hem);
    o.quadraticCurveTo(shift, hem + 4, right + sway * 0.7 - wave, hem);
    o.quadraticCurveTo(right + 1, 7, 7 + shift, -5);
    o.closePath();
    o.fillStyle = this._lin(o, 0, -6, 0, hem + 4, [
      [0, C.cloak_light || '#4a3548'],
      [0.45, C.cloak_mid || '#2d1f2e'],
      [1, C.cloak_dark || '#1a1018']
    ]);
    o.fill();
    o.lineWidth = 1.2;
    o.strokeStyle = C.cloak_trim || '#0f0a10';
    o.stroke();

    // Золотая кайма по подолу
    o.beginPath();
    o.moveTo(left + 1 + sway * 0.7 + wave, hem - 1.5);
    o.quadraticCurveTo(shift, hem + 2.5, right - 1 + sway * 0.7 - wave, hem - 1.5);
    o.strokeStyle = C.accent || '#c8a832';
    o.lineWidth = 1.4;
    o.stroke();

    // Капюшон (спадает на плечи)
    if (!pose.back) {
      o.beginPath();
      o.moveTo(-8 + shift, -4);
      o.quadraticCurveTo(-6 + shift, -12, 0 + shift, -14);
      o.quadraticCurveTo(6 + shift, -12, 8 + shift, -4);
      o.quadraticCurveTo(4 + shift, -8, 0 + shift, -9);
      o.quadraticCurveTo(-4 + shift, -8, -8 + shift, -4);
      o.closePath();
      o.fillStyle = C.cloak_mid || '#2d1f2e';
      o.fill();
      o.strokeStyle = C.accent || '#c8a832';
      o.lineWidth = 0.8;
      o.stroke();
    } else {
      // Задний шов капюшона
      o.beginPath();
      o.moveTo(shift, -13);
      o.quadraticCurveTo(shift + sway * 0.3, -5, shift + sway * 0.4, hem);
      o.strokeStyle = 'rgba(15,10,16,0.5)';
      o.lineWidth = 1;
      o.stroke();
    }

    o.restore();
  }

  // Костяные ноги
  _drawLegs(o, pose, C) {
    const side = pose.side;
    const step = pose.step;
    const lift = C.walk_boot_lift_px ?? 2.2;
    const stride = C.walk_boot_stride_px ?? 3.2;
    const bone = C.bone || '#e8dcc8';
    const boneShadow = C.bone_shadow || '#b0a088';
    const boot = C.boot || '#2b1a16';

    o.save();
    o.strokeStyle = bone;
    o.lineWidth = 3.5;
    o.lineCap = 'round';

    // Левая нога
    const lx = side ? -5 : -4;
    const ly = 18;
    const kneeLx = lx + step * stride * 0.3;
    const kneeLy = ly + 5 + Math.max(0, -step) * lift * 0.5;
    const footLx = lx - step * stride * 0.5;
    const footLy = ly + 10;

    o.beginPath();
    o.moveTo(lx, ly);
    o.lineTo(kneeLx, kneeLy);
    o.stroke();

    // Коленный сустав
    o.fillStyle = boneShadow;
    o.beginPath();
    o.arc(kneeLx, kneeLy, 2, 0, TAU);
    o.fill();

    o.strokeStyle = bone;
    o.beginPath();
    o.moveTo(kneeLx, kneeLy);
    o.lineTo(footLx, footLy);
    o.stroke();

    // Ботинок
    o.fillStyle = boot;
    o.beginPath();
    o.ellipse(footLx, footLy + 1, 3.5, 2, 0, 0, TAU);
    o.fill();

    // Правая нога
    const rx = side ? 5 : 4;
    const ry = 18;
    const kneeRx = rx - step * stride * 0.3;
    const kneeRy = ry + 5 + Math.max(0, step) * lift * 0.5;
    const footRx = rx + step * stride * 0.5;
    const footRy = ry + 10;

    o.strokeStyle = bone;
    o.lineWidth = 3.5;
    o.beginPath();
    o.moveTo(rx, ry);
    o.lineTo(kneeRx, kneeRy);
    o.stroke();

    o.fillStyle = boneShadow;
    o.beginPath();
    o.arc(kneeRx, kneeRy, 2, 0, TAU);
    o.fill();

    o.strokeStyle = bone;
    o.beginPath();
    o.moveTo(kneeRx, kneeRy);
    o.lineTo(footRx, footRy);
    o.stroke();

    o.fillStyle = boot;
    o.beginPath();
    o.ellipse(footRx, footRy + 1, 3.5, 2, 0, 0, TAU);
    o.fill();

    o.restore();
  }

  // Костяные руки
  _drawArms(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;
    const bone = C.bone || '#e8dcc8';
    const boneShadow = C.bone_shadow || '#b0a088';

    o.save();
    o.strokeStyle = bone;
    o.lineWidth = 3;
    o.lineCap = 'round';

    // Задняя рука (за спиной, держит лук у плеча)
    const backArmX = side ? -9 + shift : -11;
    const backArmY = 0;
    const elbowBackX = backArmX - 2;
    const elbowBackY = 6;
    const handBackX = backArmX - 3;
    const handBackY = 10;

    o.beginPath();
    o.moveTo(backArmX, backArmY);
    o.quadraticCurveTo(elbowBackX, elbowBackY, handBackX, handBackY);
    o.stroke();

    // Локтевой сустав
    o.fillStyle = boneShadow;
    o.beginPath();
    o.arc(elbowBackX, elbowBackY, 1.5, 0, TAU);
    o.fill();

    // Передняя рука (тянет лук)
    const frontArmX = side ? 9 + shift : 11;
    const frontArmY = 0;
    const elbowFrontX = frontArmX + 2;
    const elbowFrontY = 5;
    // При выстреле рука отходит назад
    const drawOffset = pose.shootK * 6;
    const handFrontX = frontArmX + 4 + drawOffset;
    const handFrontY = 3 - pose.shootK * 2;

    o.strokeStyle = bone;
    o.beginPath();
    o.moveTo(frontArmX, frontArmY);
    o.quadraticCurveTo(elbowFrontX, elbowFrontY, handFrontX, handFrontY);
    o.stroke();

    // Локтевой сустав
    o.fillStyle = boneShadow;
    o.beginPath();
    o.arc(elbowFrontX, elbowFrontY, 1.5, 0, TAU);
    o.fill();

    // Кисть
    o.fillStyle = bone;
    o.beginPath();
    o.arc(handFrontX, handFrontY, 1.8, 0, TAU);
    o.fill();

    o.restore();
  }

  // Лук (упрощённый: дуга + подъём при выстреле)
  _drawBow(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;
    const wood = C.bow_wood || '#5a3518';
    const woodLight = C.bow_wood_light || '#8b5a2b';

    o.save();

    // Позиция лука: в руках переднего плеча
    const bowX = side ? 13 + shift : 15 + shift;
    const bowY = 2;

    // При выстреле лук поднимается
    const lift = pose.shootK * 4;

    o.save();
    o.translate(bowX, bowY - lift);
    o.rotate(pose.shootK * (C.shoot_draw_rad ?? 0.4));

    // Дуга лука
    o.strokeStyle = this._lin(o, 0, -12, 0, 12, [
      [0, woodLight],
      [0.5, wood],
      [1, wood]
    ]);
    o.lineWidth = 2.5;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(0, -12);
    o.quadraticCurveTo(5, 0, 0, 12);
    o.stroke();

    // Тетива (прямая линия от конца до конца)
    o.strokeStyle = C.bow_string || '#c8b898';
    o.lineWidth = 0.8;
    o.beginPath();
    o.moveTo(0, -12);
    o.lineTo(0, 12);
    o.stroke();

    // Стрела (если выстрел)
    if (pose.shootK > 0.1) {
      const arrowAlpha = Math.min(1, pose.shootK * 2);
      o.save();
      o.globalAlpha = arrowAlpha;
      o.strokeStyle = C.arrow_wood || '#8b5a2b';
      o.lineWidth = 1.5;
      o.lineCap = 'round';
      o.beginPath();
      o.moveTo(-8, 0);
      o.lineTo(8, 0);
      o.stroke();

      // Наконечник
      o.fillStyle = C.arrow_head || '#888';
      o.beginPath();
      o.moveTo(8, 0);
      o.lineTo(11, -1.5);
      o.lineTo(11, 1.5);
      o.closePath();
      o.fill();

      // Перья
      o.fillStyle = C.arrow_fletching || '#c8a832';
      o.beginPath();
      o.moveTo(-8, 0);
      o.lineTo(-11, -2);
      o.lineTo(-9, 0);
      o.closePath();
      o.fill();
      o.beginPath();
      o.moveTo(-8, 0);
      o.lineTo(-11, 2);
      o.lineTo(-9, 0);
      o.closePath();
      o.fill();

      o.restore();
    }

    o.restore();
    o.restore();
  }

  // Колчан за спиной
  _drawQuiver(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;

    // Колчан виден только сзади (up) или сбоку
    if (!pose.back && !side) return; // спереди не виден

    const quiverX = side ? -10 + shift : -8 + shift;
    const quiverY = 2;

    o.save();
    o.translate(quiverX, quiverY);
    o.rotate(side ? -0.3 : 0.2);

    // Основа колчана
    o.fillStyle = C.quiver || '#3a2518';
    o.beginPath();
    o.rect(-2, -8, 4, 16);
    o.fill();
    o.strokeStyle = C.quiver_trim || '#1a0f08';
    o.lineWidth = 0.8;
    o.stroke();

    // Стрелы
    const arrowCount = 3;
    for (let i = 0; i < arrowCount; i++) {
      const ay = -6 + i * 5;
      o.strokeStyle = C.arrow_wood || '#8b5a2b';
      o.lineWidth = 1;
      o.beginPath();
      o.moveTo(0, ay);
      o.lineTo(0, ay + 10);
      o.stroke();

      // Наконечник
      o.fillStyle = C.arrow_head || '#888';
      o.beginPath();
      o.moveTo(0, ay - 2);
      o.lineTo(1, ay);
      o.lineTo(-1, ay);
      o.closePath();
      o.fill();
    }

    o.restore();
  }

  // Череп + капюшон. Вид зависит от направления:
  // up (back) — затылок капюшона, лица не видно;
  // left/right (side) — профиль: один глаз;
  // down (front) — полный череп с двумя глазами.
  _drawHead(o, pose, C) {
    const side = pose.side;
    const back = pose.back;
    const hx = (side ? 1.5 : 0) + pose.sway * 0.15;
    const hy = -8 + pose.bob * 0.2;

    // Капюшон (над черепом)
    o.save();
    o.fillStyle = C.cloak_mid || '#2d1f2e';
    o.beginPath();
    o.ellipse(hx, hy - 2, 8, 7, 0, Math.PI, TAU);
    o.fill();
    o.strokeStyle = C.accent || '#c8a832';
    o.lineWidth = 0.8;
    o.stroke();
    o.restore();

    // Вид сзади: капюшон полностью закрывает череп — только затылок и шов
    if (back) {
      o.save();
      o.fillStyle = C.cloak_mid || '#2d1f2e';
      o.beginPath();
      o.ellipse(hx, hy - 0.5, 7.5, 7, 0, 0, TAU);
      o.fill();
      o.strokeStyle = C.cloak_trim || '#0f0a10';
      o.lineWidth = 1;
      o.beginPath();
      o.moveTo(hx, hy - 6.5);
      o.lineTo(hx, hy + 5.5);
      o.stroke();
      o.restore();
      return;
    }

    // Череп
    o.fillStyle = C.bone || '#e8dcc8';
    o.beginPath();
    o.ellipse(hx, hy, 6, 6.5, 0, 0, TAU);
    o.fill();
    o.strokeStyle = C.bone_shadow || '#b0a088';
    o.lineWidth = 0.6;
    o.stroke();

    // Глазницы
    const eyeY = hy - 1.5;
    const eyePulse = 0.5 + 0.5 * Math.sin((pose.phase || 0) * 0.7);
    const eyeGlowAlpha = (C.eye_glow_alpha ?? 0.6) * eyePulse;

    if (side) {
      // Профиль: один глаз (справа — «лицом вперёд», left даёт зеркало)
      const ex = hx + 2.5;
      o.fillStyle = '#1a0a0a';
      o.beginPath();
      o.ellipse(ex, eyeY, 1.8, 2, 0, 0, TAU);
      o.fill();
      o.save();
      o.globalCompositeOperation = 'lighter';
      const gr = o.createRadialGradient(ex, eyeY, 0, ex, eyeY, 3.5);
      gr.addColorStop(0, `rgba(255,224,64,${eyeGlowAlpha})`);
      gr.addColorStop(1, 'rgba(255,224,64,0)');
      o.fillStyle = gr;
      o.beginPath();
      o.arc(ex, eyeY, 3.5, 0, TAU);
      o.fill();
      o.restore();
      o.fillStyle = C.eye_glow || '#ffe040';
      o.beginPath();
      o.arc(ex, eyeY, 0.8, 0, TAU);
      o.fill();

      // Челюсть в профиль
      o.fillStyle = C.bone || '#e8dcc8';
      o.strokeStyle = C.bone_shadow || '#b0a088';
      o.lineWidth = 0.5;
      o.beginPath();
      o.rect(hx + 0.5, hy + 3.5, 3.4, 2.2);
      o.fill();
      o.stroke();
      return;
    }

    o.fillStyle = '#1a0a0a';
    o.beginPath();
    o.ellipse(hx - 2.5, eyeY, 1.8, 2, 0, 0, TAU);
    o.fill();
    o.beginPath();
    o.ellipse(hx + 2.5, eyeY, 1.8, 2, 0, 0, TAU);
    o.fill();

    // Светящиеся глаза (пульсация)
    o.save();
    o.globalCompositeOperation = 'lighter';
    const gr = o.createRadialGradient(hx, eyeY, 0, hx, eyeY, 4);
    gr.addColorStop(0, `rgba(255,224,64,${eyeGlowAlpha})`);
    gr.addColorStop(1, 'rgba(255,224,64,0)');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(hx, eyeY, 4, 0, TAU);
    o.fill();
    o.restore();

    // Зрачки
    o.fillStyle = C.eye_glow || '#ffe040';
    o.beginPath();
    o.arc(hx - 2.5, eyeY, 0.8, 0, TAU);
    o.fill();
    o.beginPath();
    o.arc(hx + 2.5, eyeY, 0.8, 0, TAU);
    o.fill();

    // Нос (треугольная дырка)
    o.fillStyle = '#1a0a0a';
    o.beginPath();
    o.moveTo(hx, hy + 1);
    o.lineTo(hx - 1.2, hy + 2.5);
    o.lineTo(hx + 1.2, hy + 2.5);
    o.closePath();
    o.fill();

    // Зубы
    o.fillStyle = C.bone || '#e8dcc8';
    o.strokeStyle = C.bone_shadow || '#b0a088';
    o.lineWidth = 0.5;
    const teethY = hy + 3.5;
    for (let i = -2; i <= 2; i++) {
      o.beginPath();
      o.rect(hx + i * 1.8 - 0.6, teethY, 1.2, 2.5);
      o.fill();
      o.stroke();
    }
  }

  // Вспышка при выстреле
  _drawShootFX(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;
    const bowX = side ? 13 + shift : 15 + shift;
    const bowY = 2;
    const lift = pose.shootK * 4;

    o.save();
    o.globalCompositeOperation = 'lighter';
    const a = (C.shoot_flash_alpha ?? 0.5) * pose.shootK;
    const gr = o.createRadialGradient(bowX, bowY - lift, 0, bowX, bowY - lift, 8);
    gr.addColorStop(0, `rgba(255,240,190,${Math.min(0.9, a * 1.6)})`);
    gr.addColorStop(0.4, `rgba(255,211,77,${a})`);
    gr.addColorStop(1, 'rgba(255,180,40,0)');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(bowX, bowY - lift, 8, 0, TAU);
    o.fill();
    o.restore();
  }

  // Смерть: рассыпание костей
  _drawDeathFX(o, pose, C) {
    const k = clamp01((pose.deathK - 0.1) / 0.9);
    if (k <= 0) return;
    const bone = C.bone || '#e8dcc8';

    o.save();
    o.globalCompositeOperation = 'lighter';
    const boneCount = 4;
    for (let i = 0; i < boneCount; i++) {
      const mk = clamp01(k - i * 0.08);
      if (mk <= 0) continue;
      const angle = (i / boneCount) * TAU + (pose.phase || 0);
      const dist = 8 + i * 4;
      const bx = Math.cos(angle) * dist * mk;
      const by = Math.sin(angle) * dist * mk + 10;
      const rot = angle + mk * 2;

      o.save();
      o.translate(bx, by);
      o.rotate(rot);
      o.globalAlpha = mk * 0.7;
      o.fillStyle = bone;
      o.fillRect(-2, -1, 4, 2);
      o.restore();
    }
    o.restore();
  }

  _lin(o, x0, y0, x1, y1, stops) {
    const g = o.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(Math.max(0, Math.min(1, t)), c);
    return g;
  }
}
