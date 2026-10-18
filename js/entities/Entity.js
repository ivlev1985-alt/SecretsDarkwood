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
        // 1. Рисуем спрайт во временный канвас нужного размера
        const off = document.createElement('canvas');
        off.width = Math.ceil(dw);
        off.height = Math.ceil(dh);
        const octx = off.getContext('2d');

        if (img.tagName === 'CANVAS') {
          octx.drawImage(img, 0, 0, dw, dh);
        } else {
          const r = this.anim.getRect();
          octx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, dw, dh);
        }

        // 2. Подсветка только по непрозрачным пикселям спрайта
        if (this.hitFlash > 0) {
          octx.save();
          octx.globalCompositeOperation = 'source-atop';
          octx.globalAlpha = Math.min(0.7, this.hitFlash * 4);
          octx.fillStyle = this.flashColor || '#ff0000';
          octx.fillRect(0, 0, dw, dh);
          octx.restore();
        }

        // 3. Выводим результат на основной контекст
        ctx.drawImage(off, -dw / 2, -dh / 2);
      } catch (e) {
        ctx.fillStyle = placeholderColor;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      }
    } else {
      ctx.fillStyle = placeholderColor;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.facing > 0 ? 4 : -10, -4, 6, 8);
    }

    ctx.restore();
  }
}
