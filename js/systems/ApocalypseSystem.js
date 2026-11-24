// Полноэкранный «Армагеддон» при подборе бомбы: 3 секунды огненного дождя.
// Мобильно-безопасно: фиксированные пулы, кэшированный glow-спрайт,
// никаких градиентов/созданий объектов в кадре.
//
// Все числа — из balance_config.apocalypse, чтобы эффект можно было
// подкручивать без правок кода.
const DEFAULTS = {
  duration_ms: 3000,
  spawn_window_ms: 2400,
  meteor_count: 30,
  max_active_meteors: 12,
  fall_time_min_ms: 450,
  fall_time_max_ms: 600,
  impact_radius: 130,
  impact_ring_max_radius: 140,
  impact_ring_life_ms: 450,
  particles_per_impact: 6,
  particle_budget: 120,
  particle_life_min_ms: 260,
  particle_life_max_ms: 620,
  particle_speed_min: 80,
  particle_speed_max: 240,
  particle_gravity: 260,
  particle_size: 3,
  meteor_glow_size: 46,
  meteor_trail_length: 78,
  shake_magnitude: 5.5,
  shake_duration_ms: 3000,
  impact_shake: 2.2,
  overlay_alpha: 0.10,
  flash_alpha: 0.22,
  flash_decay_ms: 450,
  colors: {
    core: '#fff6c0',
    hot: '#ffd24a',
    flame: '#ff7a00',
    deep: '#ff3b00',
    ring: '#ffb347'
  }
};

export class ApocalypseSystem {
  constructor(cfg = {}) {
    const merged = Object.assign({}, DEFAULTS, cfg);
    merged.colors = Object.assign({}, DEFAULTS.colors, cfg.colors || {});
    this.cfg = merged;

    this.duration = Math.max(0.1, (merged.duration_ms || 0) / 1000);
    this.spawnWindow = Math.min(this.duration,
      Math.max(0.1, (merged.spawn_window_ms || 0) / 1000));
    this.meteorCount = Math.max(1, merged.meteor_count | 0);
    this.maxMeteors = Math.max(1, merged.max_active_meteors | 0);
    this.fallMin = Math.max(0.05, (merged.fall_time_min_ms || 0) / 1000);
    this.fallMax = Math.max(this.fallMin, (merged.fall_time_max_ms || 0) / 1000);
    this.impactRadius = Math.max(1, merged.impact_radius || 1);
    this.ringMax = Math.max(1, merged.impact_ring_max_radius || 1);
    this.ringLife = Math.max(0.05, (merged.impact_ring_life_ms || 0) / 1000);
    this.particleCount = Math.max(0, merged.particles_per_impact | 0);
    this.particleBudget = Math.max(16, merged.particle_budget | 0);
    this.particleLifeMin = Math.max(0.03, (merged.particle_life_min_ms || 0) / 1000);
    this.particleLifeMax = Math.max(this.particleLifeMin, (merged.particle_life_max_ms || 0) / 1000);
    this.particleSpeedMin = Math.max(0, merged.particle_speed_min || 0);
    this.particleSpeedMax = Math.max(this.particleSpeedMin, merged.particle_speed_max || 0);
    this.particleGravity = merged.particle_gravity || 0;
    this.particleSize = Math.max(1, merged.particle_size || 1);
    this.meteorGlowSize = Math.max(8, merged.meteor_glow_size || 8);
    this.trailLength = Math.max(8, merged.meteor_trail_length || 8);
    this.shakeMagnitude = Math.max(0, merged.shake_magnitude || 0);
    this.shakeDuration = Math.max(0.05, (merged.shake_duration_ms || 0) / 1000);
    this.impactShake = Math.max(0, merged.impact_shake || 0);
    this.overlayAlpha = Math.max(0, Math.min(1, merged.overlay_alpha || 0));
    this.flashAlpha = Math.max(0, Math.min(1, merged.flash_alpha || 0));
    this.flashDecay = Math.max(0.03, (merged.flash_decay_ms || 0) / 1000);
    this.colors = merged.colors;
    this.particleColors = [
      this.colors.core, this.colors.hot, this.colors.flame, this.colors.deep
    ];

    // Пулы создаются один раз на забег, в кадре только переиспользование.
    this.meteors = [];
    for (let i = 0; i < this.maxMeteors; i++) {
      this.meteors.push({
        active: false, sx: 0, sy: 0, tx: 0, ty: 0,
        t: 0, dur: 1, size: 1, angle: 0
      });
    }
    this.impacts = [];
    for (let i = 0; i < 20; i++) {
      this.impacts.push({ active: false, x: 0, y: 0, t: 0, life: 1, maxR: 1, aspect: 0.5 });
    }
    this.particles = [];
    for (let i = 0; i < this.particleBudget; i++) {
      this.particles.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        t: 0, life: 1, size: 1, grav: 0, color: '#fff'
      });
    }

    // Один маленький спрайт свечения на всё: дешевле, чем градиент в каждом кадре.
    this.glow = this._makeGlow();

    this.active = false;
    this.t = 0;
    this.spawnT = 0;
    this.spawned = 0;
    this.flash = 0;
    this.overlay = 0;
    this.impactCursor = 0;
    this.particleCursor = 0;
  }

  _makeGlow() {
    if (typeof document === 'undefined') return null;
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const h = size / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.18, 'rgba(255,245,170,0.98)');
    grd.addColorStop(0.42, 'rgba(255,170,40,0.85)');
    grd.addColorStop(0.72, 'rgba(255,80,0,0.38)');
    grd.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  clear() {
    this.active = false;
    this.t = 0;
    this.spawnT = 0;
    this.spawned = 0;
    this.flash = 0;
    this.overlay = 0;
    this.impactCursor = 0;
    this.particleCursor = 0;
    for (const m of this.meteors) m.active = false;
    for (const im of this.impacts) im.active = false;
    for (const p of this.particles) p.active = false;
  }

  start(game) {
    this.clear();
    this.active = true;
    this.flash = this.flashAlpha;
    this.overlay = this.overlayAlpha;
    if (game && game.camera) {
      game.camera.shake(this.shakeMagnitude, this.shakeDuration);
      game.camera.pulseShake(this.impactShake);
    }
  }

  _hasActive() {
    for (const m of this.meteors) if (m.active) return true;
    for (const im of this.impacts) if (im.active) return true;
    for (const p of this.particles) if (p.active) return true;
    return false;
  }

  _freeMeteor() {
    for (const m of this.meteors) if (!m.active) return m;
    return null;
  }

  _spawnMeteor(m, game) {
    const W = game && game.canvas ? game.canvas.width : 480;
    const H = game && game.canvas ? game.canvas.height : 800;
    const cam = (game && game.camera) || { x: 0, y: 0 };

    // Цели — по всей видимой области, но не по верхнему HUD.
    const xOff = (Math.random() * 2 - 1) * W * 0.48;
    const yOff = -H * 0.28 + Math.random() * H * 0.78;
    const tx = cam.x + xOff;
    const ty = cam.y + yOff;

    // Старт выше экрана; боковой снос даёт диагональный «метеорный» след.
    const fallH = H * (0.85 + Math.random() * 0.25);
    const side = (Math.random() * 2 - 1) * W * 0.22;
    m.sx = tx + side;
    m.sy = ty - fallH;
    m.tx = tx;
    m.ty = ty;
    m.t = 0;
    m.dur = this.fallMin + Math.random() * (this.fallMax - this.fallMin);
    m.size = this.meteorGlowSize * (0.85 + Math.random() * 0.35);
    m.angle = Math.atan2(m.ty - m.sy, m.tx - m.sx);
    m.active = true;
  }

  _emitParticle(x, y) {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
    const a = Math.random() * Math.PI * 2;
    const sp = this.particleSpeedMin
      + Math.random() * (this.particleSpeedMax - this.particleSpeedMin);
    p.active = true;
    p.x = x + Math.cos(a) * Math.random() * 12;
    p.y = y + Math.sin(a) * Math.random() * 8;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp - 60;
    p.t = 0;
    p.life = this.particleLifeMin
      + Math.random() * (this.particleLifeMax - this.particleLifeMin);
    p.size = this.particleSize * (0.7 + Math.random() * 0.8);
    p.grav = this.particleGravity;
    p.color = this.particleColors[(Math.random() * this.particleColors.length) | 0];
  }

  _impact(x, y, game) {
    // Визуал: переиспользуем слот, не создаём объект.
    const im = this.impacts[this.impactCursor];
    this.impactCursor = (this.impactCursor + 1) % this.impacts.length;
    im.active = true;
    im.x = x; im.y = y;
    im.t = 0; im.life = this.ringLife;
    // Ударная волна — эллипс (вид сбоку): ширина 100–150px, высота вдвое меньше.
    im.maxR = 100 + Math.random() * 50;
    im.aspect = 0.5;

    // Геймплей: умирают все обычные монстры в радиусе. Босс не получает урон.
    if (game && game.enemies) {
      const r2 = this.impactRadius * this.impactRadius;
      for (const e of game.enemies) {
        if (!e || !e.alive || e.deathT > 0 || e.isBoss) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r2 && typeof game._apocalypseKill === 'function') {
          game._apocalypseKill(e);
        }
      }
    }

    for (let i = 0; i < this.particleCount; i++) this._emitParticle(x, y);
    if (game && game.camera) game.camera.pulseShake(this.impactShake);
  }

  update(dt, game) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - this.flashAlpha * (dt / this.flashDecay));
    }
    const fadeStart = Math.max(0, this.duration - 0.4);
    if (this.t < fadeStart) {
      this.overlay = this.overlayAlpha;
    } else {
      this.overlay = this.overlayAlpha * Math.max(0, 1 - (this.t - fadeStart) / 0.4);
    }

    if (this.t <= this.spawnWindow && this.spawned < this.meteorCount) {
      this.spawnT -= dt;
      let guard = 0;
      const interval = this.spawnWindow / this.meteorCount;
      while (this.spawnT <= 0 && this.spawned < this.meteorCount && guard++ < 8) {
        const m = this._freeMeteor();
        if (!m) break;
        this._spawnMeteor(m, game);
        this.spawned++;
        this.spawnT += interval;
      }
    }

    for (const m of this.meteors) {
      if (!m.active) continue;
      m.t += dt;
      if (m.t >= m.dur) {
        m.active = false;
        this._impact(m.tx, m.ty, game);
      }
    }

    for (const im of this.impacts) {
      if (!im.active) continue;
      im.t += dt;
      if (im.t >= im.life) im.active = false;
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) { p.active = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (this.t >= this.duration + 0.8 && !this._hasActive()) this.clear();
  }

  draw(ctx, game) {
    if (!this.active && !this._hasActive()) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const im of this.impacts) {
      if (im.active) this._drawImpact(ctx, im);
    }
    for (const m of this.meteors) {
      if (m.active) this._drawMeteor(ctx, m);
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      const k = 1 - p.t / p.life;
      const s = Math.max(1, p.size * (0.4 + 0.6 * k));
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    ctx.restore();
  }

  _drawMeteor(ctx, m) {
    const k = Math.min(1, m.t / m.dur);
    const e = k * k; // ускорение к земле
    const x = m.sx + (m.tx - m.sx) * e;
    const y = m.sy + (m.ty - m.sy) * e;
    const dx = Math.cos(m.angle), dy = Math.sin(m.angle);
    const tx = x - dx * this.trailLength;
    const ty = y - dy * this.trailLength;

    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = this.colors.flame;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = this.colors.hot;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx + dx * 8, ty + dy * 8);
    ctx.lineTo(x, y);
    ctx.stroke();

    const s = m.size * (1 + 0.08 * Math.sin(this.t * 40 + m.tx));
    if (this.glow) {
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.glow, x - s / 2, y - s / 2, s, s);
    } else {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = this.colors.core;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawImpact(ctx, im) {
    const k = Math.min(1, im.t / im.life);
    const e = 1 - (1 - k) * (1 - k);
    // Эллипс «на земле» (вид сбоку): ry = rx * aspect.
    const rx = im.maxR * e;
    const ry = rx * (im.aspect ?? 0.5);

    if (this.glow) {
      const gw = im.maxR * 2 * (0.6 + 0.8 * e);
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.drawImage(this.glow, im.x - gw / 2, im.y - gw * (im.aspect ?? 0.5) / 2,
        gw, gw * (im.aspect ?? 0.5));
    }

    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = this.colors.ring;
    ctx.lineWidth = 1 + 4 * (1 - k);
    ctx.beginPath();
    ctx.ellipse(im.x, im.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.strokeStyle = this.colors.hot;
    ctx.lineWidth = 1 + 2 * (1 - k);
    ctx.beginPath();
    ctx.ellipse(im.x, im.y, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Красная вспышка/тинт поверх мира, но под HUD и модалками.
  drawOverlay(ctx, game, W, H) {
    const a = Math.min(0.22, this.overlay + this.flash);
    if (a <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.colors.deep;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
