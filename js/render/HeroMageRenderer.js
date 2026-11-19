// Процедурный маг-герой. Рисуется векторно в виртуальном кадре 64×64,
// поэтому спрайт hero_main.png можно убрать/переименовать — вместо серого
// квадрата появится полноценный анимированный персонаж.
//
// Режимы (game_config.hero.procedural.mode):
//   "missing" — рисовать мага только если спрайт не загрузился (по умолчанию);
//   "always"  — всегда рисовать процедурного мага;
//   "never"   — не использовать процедурного мага.
//
// Анимации: idle, ходьба в 4 стороны, каст (поднимает посох + свечение),
// смерть (падение + душа). Все константы — в game_config.hero.procedural.

const TAU = Math.PI * 2;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class HeroMageRenderer {
  constructor(cfg = {}) {
    this.cfg = cfg || {};
    this.off = null;
    this.offCtx = null;
  }

  setConfig(cfg) { this.cfg = cfg || {}; }

  draw(ctx, player, time, opts = {}) {
    if (!ctx || !player) return;
    const cfg = this.cfg || {};
    const scale = Math.max(0.01, opts.scale || 1);
    const w = Math.max(1, opts.w || 64);
    const h = Math.max(1, opts.h || 64);
    const artScale = Math.min(w / 64, h / 64);
    const pad = Math.max(0, cfg.frame_padding_px ?? 26);
    const pw = Math.max(1, Math.ceil((w + pad * 2) * scale));
    const ph = Math.max(1, Math.ceil((h + pad * 2) * scale));
    const off = this._offscreen(pw, ph);
    if (!off) return;
    const o = this.offCtx;

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, pw, ph);
    o.save();
    o.translate(pw / 2, ph / 2);
    o.scale(scale * artScale, scale * artScale);

    const dir = this._dir(player);
    const side = dir === 'left' || dir === 'right';
    if (side && dir === 'left') o.scale(-1, 1);

    const pose = this._pose(player, time, dir);
    this._paint(o, pose, cfg);
    o.restore();

    // Подсветка урона: тонируем только непрозрачные пиксели магова холста.
    const flash = Math.max(0, player.hitFlash || 0);
    if (flash > 0) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = 'source-atop';
      o.globalAlpha = Math.min(0.35, flash * 2.5);
      o.fillStyle = player.flashColor || '#ff5555';
      o.fillRect(0, 0, pw, ph);
      o.globalCompositeOperation = 'source-over';
      o.globalAlpha = 1;
    }

    const alpha = Math.max(0, 1 - pose.deathK * (cfg.death_fade ?? 0.45));
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.tilt) ctx.rotate(player.tilt);
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.off, -pw / 2, -ph / 2, pw, ph);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _offscreen(pw, ph) {
    if (typeof document === 'undefined') return null;
    if (!this.off) {
      this.off = document.createElement('canvas');
      this.offCtx = this.off.getContext('2d');
    }
    if (this.off.width !== pw || this.off.height !== ph) {
      this.off.width = pw;
      this.off.height = ph;
    }
    return this.off;
  }

  _dir(player) {
    if (player.heroDir) return player.heroDir;
    return player.facing < 0 ? 'left' : 'right';
  }

  _pose(player, time, dir) {
    const cfg = this.cfg || {};
    const moving = !!player.moving && player.alive !== false;
    const cycles = moving ? (cfg.walk_cycles_per_sec ?? 2.4) : (cfg.idle_cycles_per_sec ?? 0.85);
    const phase = (time || 0) * cycles * TAU;
    const step = moving ? Math.sin(phase) : 0;
    const bob = moving
      ? Math.abs(Math.sin(phase)) * (cfg.walk_bob_px ?? 2.2)
      : Math.sin(phase) * (cfg.idle_bob_px ?? 0.7);
    const sway = moving
      ? Math.sin(phase) * (cfg.walk_sway_px ?? 1.7)
      : Math.sin(phase + 0.7) * (cfg.idle_sway_px ?? 0.55);

    const castDur = Math.max(0.001, player.castDuration ?? 0.43);
    const castK = player.castT > 0
      ? Math.sin(Math.PI * clamp01(1 - player.castT / castDur))
      : 0;

    const deathDur = Math.max(0.001, player.deathDuration ?? 1.1);
    const deathK = player.alive === false
      ? clamp01(player.deathT > 0 ? 1 - player.deathT / deathDur : 1)
      : 0;
    const fall = easeInOutCubic(deathK);

    return {
      dir,
      side: dir === 'left' || dir === 'right',
      back: dir === 'up',
      front: dir === 'down',
      moving, phase, step, bob, sway,
      castK, deathK, fall,
      trail: moving && (dir === 'left' || dir === 'right') ? -(cfg.side_trail_px ?? 1.8) : 0,
      deathRot: -fall * (cfg.death_fall_rad ?? 1.15),
      deathX: -fall * (cfg.death_slide_px ?? 5),
      deathY: fall * (cfg.death_sink_px ?? 6)
    };
  }

  _paint(o, pose, C) {
    this._drawShadow(o, pose, C);
    if (pose.castK > 0.01) this._drawCastRing(o, pose, C);

    o.save();
    if (pose.fall > 0) {
      o.translate(pose.deathX, pose.deathY);
      o.translate(0, 26);
      o.rotate(pose.deathRot);
      o.translate(0, -26);
    }
    // Лёгкое покачивание всего тела; тень остаётся на земле.
    o.translate(pose.sway * 0.25, -pose.bob * 0.8);

    this._drawBoots(o, pose, C);
    this._drawRobe(o, pose, C);
    this._drawArms(o, pose, C);
    this._drawHead(o, pose, C);
    this._drawHat(o, pose, C);
    this._drawStaff(o, pose, C);
    this._drawStaffHand(o, pose, C);
    o.restore();

    if (pose.fall > 0.04) this._drawSoul(o, pose, C);
  }

  _drawShadow(o, pose, C) {
    o.save();
    o.globalAlpha = 0.30 * (1 - pose.fall * 0.45);
    o.fillStyle = C.shadow_color || 'rgba(0,0,0,0.30)';
    o.beginPath();
    o.ellipse(0, 28, C.shadow_rx ?? 15, C.shadow_ry ?? 5, 0, 0, TAU);
    o.fill();
    o.restore();
  }

  _drawCastRing(o, pose, C) {
    const a = (C.cast_ring_alpha ?? 0.22) * pose.castK;
    if (a <= 0) return;
    o.save();
    o.globalCompositeOperation = 'lighter';
    o.strokeStyle = C.staff_glow || '#7f5cff';
    o.globalAlpha = a;
    o.lineWidth = 1.1;
    o.beginPath();
    o.ellipse(0, 27, 18, 6, 0, 0, TAU);
    o.stroke();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + (pose.phase || 0) * 0.25;
      const x = Math.cos(ang) * 18;
      const y = 27 + Math.sin(ang) * 6;
      o.beginPath();
      o.moveTo(x * 0.9, 27 + Math.sin(ang) * 6 * 0.9);
      o.lineTo(x, y);
      o.stroke();
    }
    o.restore();
  }

  _drawBoots(o, pose, C) {
    const y = 26;
    const step = pose.step;
    const lift = C.walk_boot_lift_px ?? 2.2;
    const stride = C.walk_boot_stride_px ?? 3.2;
    o.save();
    o.fillStyle = C.boot || '#2b1a16';
    const boot = (x, yy, w, h, rot) => {
      o.save();
      o.translate(x, yy);
      o.rotate(rot);
      this._roundRect(o, -w / 2, -h / 2, w, h, 1.8);
      o.fill();
      o.restore();
    };
    if (pose.side) {
      boot(2.2 + step * stride, y + 1, 7.2, 5, 0.05);
      boot(-3.2 - step * stride, y, 7, 5, -0.05);
    } else {
      boot(-4.6, y - Math.max(0, step) * lift, 6, 5, -0.05);
      boot(4.6, y - Math.max(0, -step) * lift, 6, 5, 0.05);
    }
    o.restore();
  }

  _drawRobe(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;
    const sway = pose.sway;
    const hem = 23;
    const left = -13 + shift;
    const right = 13 + shift;

    o.save();
    if (side && pose.moving) {
      o.translate(0, 26);
      o.rotate((C.walk_lean_rad ?? 0.035) * (0.5 + 0.5 * Math.cos(pose.phase)));
      o.translate(0, -26);
    }

    o.beginPath();
    o.moveTo(-7 + shift, -5);
    o.quadraticCurveTo(left - 1, 7, left + sway * 0.7, hem);
    o.quadraticCurveTo(shift, hem + 4, right + sway * 0.7, hem);
    o.quadraticCurveTo(right + 1, 7, 7 + shift, -5);
    o.closePath();
    o.fillStyle = this._lin(o, 0, -6, 0, hem + 4, [
      [0, C.robe_light || '#6b4ad6'],
      [0.45, C.robe_mid || '#4a2a9c'],
      [1, C.robe_dark || '#2a135c']
    ]);
    o.fill();
    o.lineWidth = 1.2;
    o.strokeStyle = C.robe_trim || '#1b0b3f';
    o.stroke();

    // Внутренняя тёмная часть робы / спинной шов.
    if (!pose.back) {
      o.beginPath();
      o.moveTo(-4.5 + shift, -3);
      o.quadraticCurveTo(-2.5 + shift, 8, -3.5 + shift + sway * 0.3, 19);
      o.quadraticCurveTo(shift, 21, 3.5 + shift + sway * 0.3, 19);
      o.quadraticCurveTo(2.5 + shift, 8, 4.5 + shift, -3);
      o.closePath();
      o.fillStyle = 'rgba(16,6,40,0.28)';
      o.fill();
    } else {
      o.beginPath();
      o.moveTo(shift, -4);
      o.quadraticCurveTo(shift + sway * 0.4, 10, shift + sway * 0.5, hem);
      o.strokeStyle = 'rgba(20,8,50,0.55)';
      o.lineWidth = 1;
      o.stroke();
      o.beginPath();
      o.moveTo(-6 + shift, 5);
      o.quadraticCurveTo(-2 + shift, 9, -3 + shift, 17);
      o.moveTo(6 + shift, 5);
      o.quadraticCurveTo(2 + shift, 9, 3 + shift, 17);
      o.strokeStyle = 'rgba(20,8,50,0.35)';
      o.lineWidth = 0.9;
      o.stroke();
    }

    // Блики складок.
    o.beginPath();
    o.moveTo(-5 + shift, -2);
    o.quadraticCurveTo(-8 + shift, 10, -9 + shift + sway * 0.4, 20);
    o.strokeStyle = 'rgba(170,140,255,0.35)';
    o.lineWidth = 1.2;
    o.stroke();
    o.beginPath();
    o.moveTo(6 + shift, -2);
    o.quadraticCurveTo(9 + shift, 10, 9 + shift + sway * 0.4, 18);
    o.strokeStyle = 'rgba(170,140,255,0.22)';
    o.lineWidth = 1;
    o.stroke();

    // Подол.
    o.beginPath();
    o.moveTo(left + 1 + sway * 0.7, hem - 1.5);
    o.quadraticCurveTo(shift, hem + 2.5, right - 1 + sway * 0.7, hem - 1.5);
    o.strokeStyle = C.robe_trim || '#1b0b3f';
    o.lineWidth = 1.4;
    o.stroke();

    // Пояс + пряжка + сумка.
    const beltY = 8;
    o.fillStyle = 'rgba(24,10,55,0.78)';
    o.fillRect(-9 + shift, beltY, 18, 3);
    o.fillStyle = C.hat_star || '#ffd34d';
    o.fillRect(-1.5 + shift, beltY + 0.8, 3, 1.5);
    if (!pose.back) {
      o.beginPath();
      o.ellipse(-7.5 + shift + (side ? 2.5 : 0), beltY + 3.5, 3.2, 3.8, -0.2, 0, TAU);
      o.fillStyle = C.pouch || '#6b4423';
      o.fill();
      o.strokeStyle = 'rgba(30,15,5,0.6)';
      o.lineWidth = 0.8;
      o.stroke();
    }

    // Воротник.
    o.beginPath();
    o.moveTo(-7 + shift, -4);
    o.quadraticCurveTo(shift, -1, 7 + shift, -4);
    o.quadraticCurveTo(shift, 1, -7 + shift, -4);
    o.fillStyle = C.robe_trim || '#1b0b3f';
    o.fill();
    o.restore();
  }

  _drawArms(o, pose, C) {
    const side = pose.side;
    const shift = side ? 1.5 : 0;

    // Свободная рука (слева от зрителя). При ходьбе покачивается в такт шагам.
    const swing = pose.moving ? pose.step * (C.walk_arm_swing_px ?? 1.8) : 0;
    const handX = (side ? -9.5 + shift : -11) + (side ? swing : 0);
    const handY = 7 - pose.castK * 1.5 + (side ? 0 : swing);
    o.save();
    o.strokeStyle = C.robe_mid || '#4a2a9c';
    o.lineWidth = 5;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(-7 + shift, -2);
    o.quadraticCurveTo(handX - 1, 2, handX, handY);
    o.stroke();
    o.strokeStyle = C.robe_trim || '#1b0b3f';
    o.lineWidth = 1.2;
    o.beginPath();
    o.moveTo(handX - 2, handY - 2);
    o.lineTo(handX + 2, handY - 2);
    o.stroke();
    o.fillStyle = C.skin || '#d7a578';
    o.beginPath();
    o.arc(handX, handY + 1, 2.3, 0, TAU);
    o.fill();
    o.strokeStyle = C.skin_shadow || '#b97f53';
    o.lineWidth = 0.5;
    o.stroke();
    o.restore();

    // Рука с посохом: рукав до кисти, кисть рисуется поверх посоха.
    const s = this._staffPose(pose, C);
    o.save();
    o.strokeStyle = C.robe_mid || '#4a2a9c';
    o.lineWidth = 5.2;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(7 + shift, -2);
    o.quadraticCurveTo((7 + shift + s.gx) / 2 + 2, (-2 + s.gy) / 2, s.gx, s.gy);
    o.stroke();
    o.strokeStyle = C.robe_trim || '#1b0b3f';
    o.lineWidth = 1.2;
    o.beginPath();
    o.moveTo(s.gx - 2.5, s.gy - 3);
    o.lineTo(s.gx + 2.5, s.gy - 3);
    o.stroke();
    o.restore();
  }

  _drawHead(o, pose, C) {
    const side = pose.side;
    const hx = (side ? 1.5 : 0) + pose.sway * 0.15;
    const hy = -8 + pose.bob * 0.2;

    // Шея.
    o.fillStyle = C.skin_shadow || '#b97f53';
    o.fillRect(hx - 2, -2, 4, 4);

    if (pose.back) {
      // Затылок: волосы под шляпой, без лица.
      o.fillStyle = C.skin_shadow || '#b97f53';
      o.beginPath();
      o.ellipse(hx, hy, 6.1, 6.6, 0, 0, TAU);
      o.fill();
      o.fillStyle = C.beard || '#ece8f2';
      o.beginPath();
      o.moveTo(hx - 6, hy + 1);
      o.quadraticCurveTo(hx - 5, hy + 6, hx - 2, hy + 6);
      o.quadraticCurveTo(hx, hy + 4, hx + 2, hy + 6);
      o.quadraticCurveTo(hx + 5, hy + 6, hx + 6, hy + 1);
      o.quadraticCurveTo(hx, hy - 1, hx - 6, hy + 1);
      o.closePath();
      o.fill();
      return;
    }

    // Лицо.
    o.fillStyle = C.skin || '#d7a578';
    o.beginPath();
    o.ellipse(hx, hy, 6.2, 6.8, 0, 0, TAU);
    o.fill();
    o.strokeStyle = 'rgba(90,50,30,0.35)';
    o.lineWidth = 0.6;
    o.stroke();

    if (side) {
      // Ухо.
      o.fillStyle = C.skin_shadow || '#b97f53';
      o.beginPath();
      o.ellipse(hx - 4.5, hy + 0.5, 1.8, 2.2, 0, 0, TAU);
      o.fill();
    }

    // Глаза (в смерти — закрытые дуги).
    const eyeY = hy - 1.4;
    o.strokeStyle = C.eye || '#241633';
    o.fillStyle = C.eye || '#241633';
    o.lineWidth = 0.9;
    const drawEye = (x) => {
      if (pose.deathK > 0.35) {
        o.beginPath();
        o.arc(x, eyeY + 0.6, 1.2, Math.PI * 1.1, Math.PI * 1.9);
        o.stroke();
      } else {
        o.beginPath();
        o.arc(x, eyeY, 0.85, 0, TAU);
        o.fill();
      }
    };
    if (side) {
      drawEye(hx + 3.4);
    } else {
      drawEye(hx - 2.4);
      drawEye(hx + 2.4);
    }

    // Брови.
    o.strokeStyle = C.beard || '#ece8f2';
    o.lineWidth = 1.1;
    o.lineCap = 'round';
    if (side) {
      o.beginPath();
      o.moveTo(hx + 1.8, eyeY - 2.4);
      o.quadraticCurveTo(hx + 3.6, eyeY - 3.2, hx + 5, eyeY - 2.4);
      o.stroke();
    } else {
      o.beginPath();
      o.moveTo(hx - 4.2, eyeY - 2.4);
      o.quadraticCurveTo(hx - 2.4, eyeY - 3.2, hx - 0.8, eyeY - 2.4);
      o.moveTo(hx + 0.8, eyeY - 2.4);
      o.quadraticCurveTo(hx + 2.4, eyeY - 3.2, hx + 4.2, eyeY - 2.4);
      o.stroke();
    }

    // Нос.
    o.fillStyle = C.skin_shadow || '#b97f53';
    if (side) {
      o.beginPath();
      o.moveTo(hx + 5.4, hy - 1);
      o.lineTo(hx + 7.2, hy + 1.2);
      o.lineTo(hx + 5.1, hy + 1.3);
      o.closePath();
      o.fill();
    } else {
      o.beginPath();
      o.ellipse(hx, hy + 1.4, 1.2, 0.9, 0, 0, TAU);
      o.fill();
    }

    // Борода.
    o.fillStyle = C.beard || '#ece8f2';
    o.beginPath();
    if (side) {
      o.moveTo(hx - 4.2, hy + 1.2);
      o.quadraticCurveTo(hx - 1.5, hy + 11.5, hx + 2.5, hy + 14);
      o.quadraticCurveTo(hx + 7.5, hy + 10, hx + 6.2, hy + 1.8);
      o.quadraticCurveTo(hx + 3.2, hy + 5.2, hx - 0.2, hy + 3.4);
      o.quadraticCurveTo(hx - 2.6, hy + 5.6, hx - 4.2, hy + 1.2);
    } else {
      o.moveTo(hx - 6, hy + 2);
      o.quadraticCurveTo(hx - 8, hy + 10.5, hx - 3, hy + 14.5);
      o.quadraticCurveTo(hx, hy + 16.5, hx + 3, hy + 14.5);
      o.quadraticCurveTo(hx + 8, hy + 10.5, hx + 6, hy + 2);
      o.quadraticCurveTo(hx + 3, hy + 6, hx, hy + 4.2);
      o.quadraticCurveTo(hx - 3, hy + 6, hx - 6, hy + 2);
    }
    o.closePath();
    o.fill();
    o.strokeStyle = C.beard_shadow || '#b9b2c8';
    o.lineWidth = 0.7;
    o.stroke();

    // Пряди/усы.
    o.strokeStyle = C.beard_shadow || '#b9b2c8';
    o.lineWidth = 0.8;
    o.lineCap = 'round';
    o.beginPath();
    if (side) {
      o.moveTo(hx + 1.8, hy + 5.2);
      o.quadraticCurveTo(hx + 2.4, hy + 9.5, hx + 4.2, hy + 11.5);
      o.moveTo(hx + 1, hy + 7);
      o.quadraticCurveTo(hx + 1.4, hy + 10, hx + 2.6, hy + 12.2);
    } else {
      o.moveTo(hx - 4.4, hy + 3.4);
      o.quadraticCurveTo(hx - 3.2, hy + 5.4, hx - 1.4, hy + 5.2);
      o.moveTo(hx + 4.4, hy + 3.4);
      o.quadraticCurveTo(hx + 3.2, hy + 5.4, hx + 1.4, hy + 5.2);
      o.moveTo(hx - 2.2, hy + 7);
      o.quadraticCurveTo(hx - 1.2, hy + 11, hx, hy + 13);
      o.moveTo(hx + 2.2, hy + 7);
      o.quadraticCurveTo(hx + 1.2, hy + 11, hx, hy + 13);
    }
    o.stroke();

    // Небольшой румянец.
    o.fillStyle = 'rgba(210,110,110,0.18)';
    if (side) {
      o.beginPath(); o.arc(hx + 4.2, hy + 2.2, 1.5, 0, TAU); o.fill();
    } else {
      o.beginPath(); o.arc(hx - 3.8, hy + 2.2, 1.4, 0, TAU); o.fill();
      o.beginPath(); o.arc(hx + 3.8, hy + 2.2, 1.4, 0, TAU); o.fill();
    }
  }

  _drawHat(o, pose, C) {
    const side = pose.side;
    const hx = (side ? 1.5 : 0) + pose.sway * 0.15;
    const hy = -15 + pose.bob * 0.25;
    const trail = pose.trail || 0;
    const tipX = hx + pose.sway * 0.7 + trail * 0.5 + (side ? 2.2 : 0);
    const tipY = hy - 16 - pose.bob * 0.2 + pose.castK * 0.7;

    o.save();
    // Поля шляпы.
    o.translate(hx, hy);
    o.rotate((side ? 0.04 : 0) + pose.sway * 0.006);
    o.beginPath();
    o.ellipse(0, 0, 15, 4.5, 0, 0, TAU);
    o.fillStyle = C.hat_dark || '#2a135c';
    o.fill();
    o.strokeStyle = C.hat_band || '#1b0b3f';
    o.lineWidth = 0.8;
    o.stroke();
    o.beginPath();
    o.ellipse(0, -0.8, 13.5, 3.2, 0, 0, TAU);
    o.fillStyle = C.hat_mid || '#4a2a9c';
    o.fill();
    o.restore();

    // Конус.
    o.beginPath();
    o.moveTo(hx - 11, hy - 1);
    o.quadraticCurveTo(hx - 7, hy - 9, tipX, tipY);
    o.quadraticCurveTo(hx + 7, hy - 9, hx + 11, hy - 1);
    o.closePath();
    o.fillStyle = this._lin(o, hx, hy, hx, tipY, [
      [0, C.hat_light || '#6b4ad6'],
      [0.5, C.hat_mid || '#4a2a9c'],
      [1, C.hat_dark || '#2a135c']
    ]);
    o.fill();
    o.strokeStyle = C.hat_band || '#1b0b3f';
    o.lineWidth = 1.1;
    o.stroke();

    // Блик на левой грани.
    o.beginPath();
    o.moveTo(hx - 9, hy - 3);
    o.quadraticCurveTo(hx - 5, hy - 12, tipX - 1, tipY + 2);
    o.strokeStyle = 'rgba(160,130,255,0.35)';
    o.lineWidth = 1.2;
    o.stroke();

    // Лента.
    o.beginPath();
    o.moveTo(hx - 11, hy - 1);
    o.quadraticCurveTo(hx, hy + 2, hx + 11, hy - 1);
    o.strokeStyle = C.hat_band || '#1b0b3f';
    o.lineWidth = 2.2;
    o.stroke();

    // Задний шов.
    if (pose.back) {
      o.beginPath();
      o.moveTo(hx, hy - 2);
      o.quadraticCurveTo(hx + pose.sway * 0.5, hy - 9, tipX, tipY);
      o.strokeStyle = 'rgba(20,8,50,0.45)';
      o.lineWidth = 0.9;
      o.stroke();
    }

    // Звёздочка-руна.
    if (!pose.back) {
      this._star(o, hx + (side ? 2.6 : 0), hy - 6.2, side ? 2 : 2.3, C.hat_star || '#ffd34d');
    }
  }

  _staffPose(pose, C) {
    const lift = pose.castK * (C.cast_staff_lift_px ?? 9);
    const gx = (pose.side ? 12.5 : 13.5) + (pose.side ? pose.castK * 1.5 : 0);
    const gy = 3 - lift + pose.bob * 0.15;
    const tilt = pose.castK * (C.cast_staff_tilt_rad ?? 0.16) + pose.fall * 0.9;
    return { gx, gy, lift, tilt };
  }

  _drawStaff(o, pose, C) {
    const s = this._staffPose(pose, C);
    const fallK = pose.fall;
    o.save();
    o.translate(s.gx + fallK * 4, s.gy + fallK * 5);
    o.rotate(s.tilt);

    const topY = -29 - s.lift * 0.2;
    const bottomY = 24 - s.lift * 0.1;

    // Древко.
    const grad = this._lin(o, -1.8, 0, 1.8, 0, [
      [0, C.staff_wood_light || '#b07a3f'],
      [0.45, C.staff_wood || '#8b5a2b'],
      [1, C.staff_wood_dark || '#5a3518']
    ]);
    o.strokeStyle = grad;
    o.lineWidth = 3.2;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(0, bottomY);
    o.lineTo(0, topY);
    o.stroke();

    // Засечки-сучки.
    o.strokeStyle = 'rgba(60,32,12,0.55)';
    o.lineWidth = 0.8;
    o.beginPath();
    o.moveTo(-1.5, 14);
    o.quadraticCurveTo(0, 13, 1.5, 14);
    o.moveTo(-1.5, 4);
    o.quadraticCurveTo(0, 3, 1.5, 4);
    o.moveTo(-1.5, -8);
    o.quadraticCurveTo(0, -9, 1.5, -8);
    o.stroke();

    // Навершие.
    o.fillStyle = C.staff_wood_dark || '#5a3518';
    o.beginPath();
    o.arc(0, topY - 1, 3.4, 0, TAU);
    o.fill();
    o.fillStyle = C.staff_wood || '#8b5a2b';
    o.beginPath();
    o.arc(0, topY - 2, 2.6, 0, TAU);
    o.fill();

    const crystalY = topY - 5;
    const glow = (C.cast_glow_alpha ?? 0.55) * pose.castK + 0.10 + Math.sin(pose.phase || 0) * 0.02;
    const glowR = Math.max(1, (C.cast_glow_radius ?? 17) * (0.55 + pose.castK * 0.75));

    // Свечение кристалла.
    o.save();
    o.globalCompositeOperation = 'lighter';
    const gr = o.createRadialGradient(0, crystalY, 0, 0, crystalY, glowR);
    gr.addColorStop(0, `rgba(240,232,255,${Math.min(0.85, glow)})`);
    gr.addColorStop(0.25, `rgba(155,108,255,${Math.min(0.55, glow * 0.8)})`);
    gr.addColorStop(1, 'rgba(90,50,200,0)');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(0, crystalY, glowR, 0, TAU);
    o.fill();
    o.restore();

    // Кристалл.
    o.beginPath();
    o.moveTo(0, crystalY - 4.5);
    o.lineTo(2.8, crystalY - 0.5);
    o.lineTo(0, crystalY + 4);
    o.lineTo(-2.8, crystalY - 0.5);
    o.closePath();
    o.fillStyle = C.staff_crystal || '#b98cff';
    o.fill();
    o.strokeStyle = 'rgba(255,255,255,0.65)';
    o.lineWidth = 0.6;
    o.stroke();
    o.beginPath();
    o.moveTo(-1.2, crystalY - 1.5);
    o.lineTo(0, crystalY - 3.5);
    o.lineTo(1.2, crystalY - 1.5);
    o.lineTo(0, crystalY + 0.5);
    o.closePath();
    o.fillStyle = C.staff_crystal_core || '#f4ecff';
    o.fill();

    // Искры вокруг кристалла при касте.
    if (pose.castK > 0.05) {
      o.save();
      o.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = (pose.phase || 0) * 1.8 + (i * Math.PI) / 2;
        const r = 6 + pose.castK * 5;
        const sx = Math.cos(a) * r;
        const sy = crystalY + Math.sin(a) * r * 0.7;
        o.globalAlpha = 0.25 + 0.65 * pose.castK;
        o.fillStyle = C.staff_crystal_core || '#fff';
        o.beginPath();
        o.arc(sx, sy, 0.9 + pose.castK * 0.7, 0, TAU);
        o.fill();
      }
      o.restore();
    }

    o.restore();
  }

  _drawStaffHand(o, pose, C) {
    const s = this._staffPose(pose, C);
    o.save();
    o.translate(s.gx, s.gy);
    o.rotate(s.tilt);
    o.fillStyle = C.skin || '#d7a578';
    o.beginPath();
    o.arc(0, 0, 2.6, 0, TAU);
    o.fill();
    o.strokeStyle = C.skin_shadow || '#b97f53';
    o.lineWidth = 0.5;
    o.stroke();
    o.strokeStyle = C.skin_shadow || '#b97f53';
    o.lineWidth = 0.6;
    o.beginPath();
    o.moveTo(-2, -0.5);
    o.quadraticCurveTo(0, 1.2, 2, -0.5);
    o.stroke();
    o.restore();
  }

  _drawSoul(o, pose, C) {
    const k = clamp01((pose.deathK - 0.12) / 0.88);
    if (k <= 0) return;
    const rise = (C.soul_rise_px ?? 34) * easeOutCubic(k);
    const x = pose.deathX * 0.5 + Math.sin(k * 6 + (pose.phase || 0)) * 1.5;
    const y = -6 - rise + pose.deathY * 0.4;
    const r = (C.soul_size ?? 4.5) * (0.6 + k * 0.6);

    o.save();
    o.globalCompositeOperation = 'lighter';
    const gr = o.createRadialGradient(x, y, 0, x, y, r * 2.6);
    gr.addColorStop(0, `rgba(255,255,255,${0.75 * k})`);
    gr.addColorStop(0.35, `rgba(185,140,255,${0.55 * k})`);
    gr.addColorStop(1, 'rgba(120,70,220,0)');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(x, y, r * 2.6, 0, TAU);
    o.fill();
    o.fillStyle = `rgba(245,240,255,${0.8 * k})`;
    o.beginPath();
    o.arc(x, y, r * 0.45, 0, TAU);
    o.fill();

    for (let i = 0; i < 5; i++) {
      const mk = clamp01(k - i * 0.08);
      if (mk <= 0) continue;
      const mx = x + Math.sin((pose.phase || 0) + i * 1.7) * (2 + i * 1.2);
      const my = y + 6 + i * 5 + Math.cos((pose.phase || 0) * 0.7 + i) * 1.5;
      o.globalAlpha = 0.35 * mk;
      o.fillStyle = C.soul || '#c7a6ff';
      o.beginPath();
      o.arc(mx, my, Math.max(0.5, 1.4 - i * 0.15), 0, TAU);
      o.fill();
    }
    o.restore();
  }

  _star(o, x, y, r, color) {
    o.save();
    o.translate(x, y);
    o.fillStyle = color;
    o.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.38;
      if (i === 0) o.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else o.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    o.closePath();
    o.fill();
    o.restore();
  }

  _roundRect(o, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    o.beginPath();
    o.moveTo(x + rr, y);
    o.arcTo(x + w, y, x + w, y + h, rr);
    o.arcTo(x + w, y + h, x, y + h, rr);
    o.arcTo(x, y + h, x, y, rr);
    o.arcTo(x, y, x + w, y, rr);
    o.closePath();
  }

  _lin(o, x0, y0, x1, y1, stops) {
    const g = o.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(Math.max(0, Math.min(1, t)), c);
    return g;
  }
}
