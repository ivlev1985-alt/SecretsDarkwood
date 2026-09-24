import { Entity } from './Entity.js';

// Враг из balance.monsters[]. Поведение — через movement_type (реестр в Game).
export class Enemy extends Entity {
  constructor(cfg, x, y) {
    super(x, y, cfg.collision_radius || 14);
    this.cfg = cfg;
    this.id = cfg.id;
    this.maxHp = cfg.hp; this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.damage;
    this.scale = cfg.scale || 1;
    this.knockResist = cfg.knockback_resist ?? 0;
    this.isBoss = !!cfg.is_boss;
    this.attackCd = 0; // для ranged
    this.wanderT = Math.random() * Math.PI * 2; // для patrol
    this.flashColor = cfg.hit_flash_color || '#ffffff';
    this.makeAnim(cfg.frames, 'walk');
    this.deathT = 0; // время проигрывания death перед удалением
  }

  get rw() { return this.cfg.frames.frame_width; }
  get rh() { return this.cfg.frames.frame_height; }

  takeDamage(amount, kx = 0, ky = 0) {
    if (!this.alive || this.deathT > 0) return 0;
    this.hp -= amount;
    this.hitFlash = 0.12;
    const k = 1 - this.knockResist;
    this.knockX += kx * k; this.knockY += ky * k;
    if (this.hp <= 0) {
      this.hp = 0;
      this.deathT = 0.0001; // начать death-анимацию
      try { this.setAnim('death'); } catch (e) {}
    }
    return amount;
  }

  // Возвращает true когда труп можно удалять
  updateDeath(dt) {
    if (this.deathT <= 0) return false;
    this.deathT += dt;
    this.updateAnim(dt);
    // длительность death = frames/fps
    const a = this.cfg.frames.animations.death;
    const dur = a ? a.frames / a.fps : 0.4;
    if (this.deathT >= dur + 0.1) { this.alive = false; return true; }
    return false;
  }

  // Движение. Возвращает желаемый вектор (без нормализации вне).
  // ranged-атака создаётся SpawnSystem/CombatSystem через attackCd — здесь только движение.
  steer(dt, px, py) {
    const type = this.cfg.movement_type;
    const dx = px - this.x, dy = py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let mx = dx / d, my = dy / d;

    if (type === 'chase') {
      // прямо к игроку
    } else if (type === 'ranged') {
      const range = this.cfg.attack_range || 300;
      if (d < range * 0.7) { mx = -mx; my = -my; } // отойти
      else if (d < range) { mx = 0; my = 0; } // держать дистанцию
    } else if (type === 'patrol') {
      this.wanderT += dt * 2;
      mx = mx * 0.7 + Math.cos(this.wanderT) * 0.5;
      my = my * 0.7 + Math.sin(this.wanderT) * 0.5;
      const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
    } else if (type === 'teleport') {
      // дальний — рывок-телепорт handled в системе (флаг), здесь chase
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    return { mx, my, dist: d };
  }

  applyKnock(dt) {
    this.x += this.knockX * dt; this.y += this.knockY * dt;
    this.knockX *= Math.pow(0.001, dt); this.knockY *= Math.pow(0.001, dt);
    if (Math.abs(this.knockX) < 1) this.knockX = 0;
    if (Math.abs(this.knockY) < 1) this.knockY = 0;
  }
}
