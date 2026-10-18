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
        const isCanvas = img.tagName === 'CANVAS';
        const r = isCanvas ? null : this.anim.getRect();

        // Без подсветки — рисуем напрямую
        if (this.hitFlash <= 0) {
          if (isCanvas) {
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          } else {
            ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -dw / 2, -dh / 2, dw, dh);
          }
        } else {
          // С подсветкой — через offscreen-канвас, чтобы source-atop
          // применялся только к пикселям спрайта, а не к фону уровня.
          const off = document.createElement('canvas');
          off.width = Math.max(1, Math.ceil(dw));
          off.height = Math.max(1, Math.ceil(dh));
          const o = off.getContext('2d');

          // 1) Рисуем спрайт в offscreen
          if (isCanvas) {
            o.drawImage(img, 0, 0, dw, dh);
          } else {
            o.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, dw, dh);
          }

          // 2) Мягкая светлая заливка строго по непрозрачным пикселям спрайта
          o.globalCompositeOperation = 'source-atop';
          o.globalAlpha = Math.min(0.35, this.hitFlash * 2.5);
          o.fillStyle = this.flashColor || '#ff6666';
          o.fillRect(0, 0, dw, dh);

          // 3) Выводим результат на основной холст
          ctx.drawImage(off, -dw / 2, -dh / 2);
        }
      } catch (e) {
        ctx.fillStyle = placeholderColor;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      }
    } else {
      // Плейсхолдер
      ctx.fillStyle = placeholderColor;
      ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.facing > 0 ? 4 : -10, -4, 6, 8);
    }

    ctx.restore();
  }
}
