import { clamp } from '../utils/math.js';

// Камера: follow_player + lerp follow_speed + offset + clamp_to_bounds (GDD п.game_config.camera)
export class Camera {
  constructor(cfg) {
    this.follow = cfg.follow_player !== false;
    this.speed = cfg.follow_speed ?? 0.1;
    this.ox = (cfg.offset && cfg.offset.x) || 0;
    this.oy = (cfg.offset && cfg.offset.y) || 0;
    this.clamp = cfg.clamp_to_bounds !== false;
    this.x = 0; this.y = 0;
    this.world = null; // { w, h } — задаётся в Этапе 2+ (размер карты), пока null = без клампа
    // Тряска мира (Армагеддон). HUD и screen-space слой не трясутся.
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeMag = 0;
    this.shakePulse = 0;
    this.shakePhase = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
  snap(px, py) {
    this.x = px + this.ox;
    this.y = py + this.oy;
    this.resetShake();
  }
  resetShake() {
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeMag = 0;
    this.shakePulse = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
  shake(mag, dur) {
    if (!(mag > 0) || !(dur > 0)) return;
    if (this.shakeT <= 0) {
      this.shakeMag = mag;
      this.shakeDur = dur;
      this.shakeT = dur;
    } else {
      this.shakeMag = Math.max(this.shakeMag, mag);
      this.shakeDur = Math.max(this.shakeDur, dur);
      this.shakeT = Math.max(this.shakeT, dur);
    }
  }
  pulseShake(mag) {
    if (mag > 0) this.shakePulse = Math.max(this.shakePulse, mag);
  }
  updateShake(dt) {
    this.shakePhase += dt * 38;
    if (this.shakePulse > 0) this.shakePulse = Math.max(0, this.shakePulse - dt * 14);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      if (this.shakeT <= 0) { this.shakeMag = 0; this.shakeDur = 0; }
    }
    const baseK = this.shakeT > 0 && this.shakeDur > 0 ? this.shakeT / this.shakeDur : 0;
    const mag = this.shakeMag * baseK + this.shakePulse;
    if (mag <= 0.05) {
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    this.shakeX = Math.sin(this.shakePhase) * mag;
    this.shakeY = Math.cos(this.shakePhase * 1.37) * mag * 0.65;
  }
  update(dt, px, py, viewW, viewH) {
    void dt;
    if (!this.follow) return;
    const k = clamp(this.speed, 0, 1);
    // frame-based lerp (скорость из конфига 0..1); dt-независимый минимум для стабильности
    this.x += ((px + this.ox) - this.x) * Math.max(k, 0.02);
    this.y += ((py + this.oy) - this.y) * Math.max(k, 0.02);
    if (this.clamp && this.world) {
      const hw = viewW / 2, hh = viewH / 2;
      if (this.world.w > viewW) this.x = clamp(this.x, hw, this.world.w - hw);
      else this.x = this.world.w / 2;
      if (this.world.h > viewH) this.y = clamp(this.y, hh, this.world.h - hh);
      else this.y = this.world.h / 2;
    }
  }
  // world -> screen
  apply(ctx, viewW, viewH) {
    ctx.translate(
      Math.round(viewW / 2 - this.x + this.shakeX),
      Math.round(viewH / 2 - this.y + this.shakeY)
    );
  }
}
