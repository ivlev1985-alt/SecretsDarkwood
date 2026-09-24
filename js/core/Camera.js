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
  }
  snap(px, py) { this.x = px + this.ox; this.y = py + this.oy; }
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
    ctx.translate(Math.round(viewW / 2 - this.x), Math.round(viewH / 2 - this.y));
  }
}
