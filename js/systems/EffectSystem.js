import { Animator } from '../core/SpriteSheetParser.js';

// Визуальные эффекты из effects_config (поведение — EffectRegistry, GDD п.3.4).
export class EffectSystem {
  constructor(effectsCfg, assets) {
    this.defs = new Map(((effectsCfg && effectsCfg.effects) || []).map((e) => [e.id, e]));
    this.assets = assets;
    this.fx = [];
  }

  static colorFor(id) {
    switch (id) {
      case 'explosion_burst': return '#ff8800';
      case 'levelup_burst': return '#4da6ff';
      case 'pickup_xp': return '#4da6ff';
      case 'boss_spawn': return '#ff4dff';
      case 'chest_burst': return '#ffd34d';
      case 'daily_bonus_burst': return '#ffd34d';
      default: return '#ffffff';
    }
  }

  play(id, x, y) {
    const def = this.defs.get(id);
    if (!def) return null;
    if (this.fx.length > 60) this.fx.shift();
    let anim = null;
    try { anim = new Animator(def.frames, 'play'); } catch (e) { anim = null; }
    const f = { id, def, anim, x, y, t: 0 };
    this.fx.push(f);
    return f;
  }

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.anim) {
        f.anim.update(dt);
        if (f.anim.isFinished()) this.fx.splice(i, 1);
      } else if (f.t > ((f.def.lifetime_ms || 300) / 1000)) {
        this.fx.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const f of this.fx) {
      const img = this.assets ? this.assets.get(f.def.sprite) : null;
      if (img && img.tagName !== 'CANVAS' && f.anim) {
        const r = f.anim.getRect();
        const s = f.def.scale || 1;
        try {
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, f.x - (r.sw * s) / 2, f.y - (r.sh * s) / 2, r.sw * s, r.sh * s);
          continue;
        } catch (e) {}
      }
      // заглушка: расширяющееся кольцо (заменится спрайтом)
      const life = (f.def.lifetime_ms || 300) / 1000;
      const k = Math.min(1, f.t / life);
      const R = 10 + k * 40 * (f.def.scale || 1);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = EffectSystem.colorFor(f.id);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
