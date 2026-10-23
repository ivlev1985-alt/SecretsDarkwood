import { Entity } from './Entity.js';

// Декор/препятствие из balance.environment_props.
// collidable=false — только картинка (+опционально slowdown), true — блок движения.
// variability — сколько вариантов внешности в одном спрайт-листе (строк).
// variability:1 — один вариант (строка 0); variability:5 — 5 разных камешков
// в одном PNG в едином стиле, при спавне строка выбирается случайно.
export class Prop extends Entity {
  constructor(cfg, x, y, variant = 0) {
    super(x, y, cfg.collision_radius || 32);
    this.cfg = cfg;
    this.variant = variant | 0;
    if (cfg.frames) {
      try { this.makeAnim(Prop.shiftedFrames(cfg.frames, this.variant), 'idle'); } catch (e) { this.anim = null; }
    }
  }

  // Сколько строк занимает один вариант (= макс. используемый row + 1).
  // Обычно у пропса только idle в row 0 → 1 строка на вариант.
  static rowsPerVariant(frames) {
    let maxRow = 0;
    const anims = (frames && frames.animations) || {};
    for (const a of Object.values(anims)) {
      if (a && typeof a.row === 'number' && a.row > maxRow) maxRow = a.row;
    }
    return maxRow + 1;
  }

  // Случайный вариант 0..variability-1. Чистая функция — тестируется в node.
  static pickVariant(cfg, rand = Math.random) {
    const v = Math.max(1, Math.floor(cfg.variability || 1));
    if (v <= 1) return 0;
    return Math.min(v - 1, Math.floor(rand() * v));
  }

  // Копия frames со сдвигом всех анимаций на variant*rowsPerVariant строк.
  static shiftedFrames(frames, variant) {
    if (!variant || !frames) return frames;
    const per = Prop.rowsPerVariant(frames);
    const clone = JSON.parse(JSON.stringify(frames));
    for (const a of Object.values(clone.animations || {})) {
      if (a && typeof a.row === 'number') a.row += variant * per;
    }
    return clone;
  }
  get w() { return this.cfg.frames ? this.cfg.frames.frame_width : this.radius * 2; }
  get h() { return this.cfg.frames ? this.cfg.frames.frame_height : this.radius * 2; }
}
