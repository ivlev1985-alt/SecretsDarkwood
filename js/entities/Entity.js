import { Animator } from '../core/SpriteSheetParser.js';

export class Entity {
  constructor(x = 0, y = 0, radius = 16) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = radius;
    this.hp = 1; this.maxHp = 1;
    this.alive = true;
    this.anim = null;
    this.facing = 1;
    this.hitFlash = 0; // секунды подсветки при уроне
    this.knockX = 0; this.knockY = 0;
  }
  makeAnim(frames, name) {
    if (!frames) { this.anim = null; return null; }
    this.anim = new Animator(frames, name);
    return this.anim;
  }
  setAnim(name) {
    if (this.anim && this.anim.animName !== name) this.anim.setAnimation(name);
  }
  updateAnim(dt) { if (this.anim) this.anim.update(dt); }
  get dead() { return !this.alive || this.hp <= 0; }
  distanceTo(o) { return Math.hypot(o.x - this.x, o.y - this.y); }

  // Отрисовка: спрайт по frames ИЛИ серый плейсхолдер. Один путь для всех сущностей.
  draw(ctx, assets, spritePath, w, h, scale = 1, placeholderColor = '#888') {
    const dw = w * scale, dh = h * scale;
    const img = assets ? assets.get(spritePath) : null;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);
    if (img && this.anim) {
      try {
        if (img.tagName === 'CANVAS') ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        else {
          const r = this.anim.getRect();
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -dw / 2, -dh / 2, dw, dh);
        }
      } catch (e) { ctx.fillStyle = placeholderColor; ctx.fillRect(-dw / 2, -dh / 2, dw, dh); }
    } else {
      ctx.fillStyle = placeholderColor; ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      // направление взгляда
      ctx.fillStyle = '#fff'; ctx.fillRect(this.facing > 0 ? 4 : -10, -4, 6, 8);
    }
    // hit-flash цветом из конфига (hit_flash_color / hurt_flash_color)
    if (this.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.7, this.hitFlash * 4);
      ctx.fillStyle = this.flashColor || '#fff'; ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
