import { Entity } from './Entity.js';

// Декор/препятствие из balance.environment_props.
// collidable=false — только картинка (+опционально slowdown), true — блок движения.
export class Prop extends Entity {
  constructor(cfg, x, y) {
    super(x, y, cfg.collision_radius || 32);
    this.cfg = cfg;
    if (cfg.frames) {
      try { this.makeAnim(cfg.frames, 'idle'); } catch (e) { this.anim = null; }
    }
  }
  get w() { return this.cfg.frames ? this.cfg.frames.frame_width : this.radius * 2; }
  get h() { return this.cfg.frames ? this.cfg.frames.frame_height : this.radius * 2; }
}
