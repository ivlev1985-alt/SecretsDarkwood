import { Projectile } from '../entities/Projectile.js';
import { Pool } from '../utils/pool.js';

// Автоатака 3 типов из WeaponRegistry: to_target / around_player / area.
export class SkillSystem {
  constructor(weaponsCfg, combat, audio) {
    this.combat = combat;
    this.audio = audio;
    this.weapons = new Map(); // id -> { cfg, level, cd }
    this.projectiles = [];
    this.enemyShots = [];
    this.areas = []; // { cfg, level, x, y, ttl, tickT, color, weaponId }
    this.auraTick = 0;
    this.pool = new Pool(() => new Projectile(), 128);
    for (const w of weaponsCfg) {
      this.weapons.set(w.id, { cfg: w, level: 0, active: false, cd: Math.random() * 0.5 });
    }
  }

  // Для Этапа 2: какие оружия активны (в Этапе 5 — по unlocked из сейва)
  setActive(ids) {
    for (const [id, st] of this.weapons) {
      if (ids.includes(id)) { st.active = true; if (!(st.level > 0)) st.level = 1; }
      else st.active = false;
    }
  }

  ownedList() {
    return [...this.weapons.values()].filter((s) => (s.level || 0) > 0 && s.active !== false);
  }

  // Награда сундука "заклинание": сначала апгрейд случайного owned, иначе unlock нового.
  grantRandomSpell(rand = Math.random) {
    const owned = [...this.weapons.values()].filter((s) => (s.level || 0) > 0 && s.active !== false && s.level < (s.cfg.max_level || 5));
    if (owned.length && rand() < 0.7) {
      const st = owned[Math.floor(rand() * owned.length)];
      st.level++;
      return { kind: 'weapon', id: st.cfg.id, level: st.level };
    }
    const locked = [...this.weapons.values()].filter((s) => !((s.level || 0) > 0) && s.cfg.unlocked === false);
    // разблокируем через флаг unlocked конфига runtime (не пишем в файл)
    const pool = locked.length ? locked : [...this.weapons.values()].filter((s) => !((s.level || 0) > 0));
    if (!pool.length) return null;
    const st = pool[Math.floor(rand() * pool.length)];
    st.cfg.unlocked = true;
    st.level = 1; st.active = true; st.cd = 0;
    return { kind: 'newWeapon', id: st.cfg.id, level: 1 };
  }

  weaponDamage(st, player) {
    const c = st.cfg;
    const base = (c.damage || 0) + (c.damage_per_level || 0) * (st.level - 1);
    return base * (player ? player.damageMul : 1);
  }

  weaponCooldown(st, player) {
    const c = st.cfg;
    const red = (c.cooldown_reduction_per_level || 0) * (st.level - 1);
    const cd = (c.cooldown_ms / 1000) * (1 - Math.min(0.7, red));
    return player ? cd / (player.attackSpeedMul || 1) : cd;
  }

  nearest(px, py, enemies, range) {
    let best = null, bd = range * range;
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      const dx = e.x - px, dy = e.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  update(dt, ctx) {
    // ctx: { player, enemies, onKill }
    const { player, enemies, onKill } = ctx;
    if (!player.alive) return;

    for (const st of this.weapons.values()) {
      if (st.active === false) continue;
      st.cd -= dt;
      if (st.cd > 0) continue;
      const c = st.cfg;
      if (c.type === 'to_target') this._fireToTarget(st, ctx);
      else if (c.type === 'around_player') this._fireAura(st, ctx);
      else if (c.type === 'area') this._fireArea(st, ctx);
      st.cd = this.weaponCooldown(st, player);
    }

    // аура-ти idle не нужен; урон ауры — тиком
    this.auraTick -= dt;

    // зоны: тик-урон + время жизни
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      a.ttl -= dt * 1000; a.tickT -= dt * 1000;
      if (a.tickT <= 0) {
        a.tickT = a.cfg.area_tick_ms || 500;
        for (const e of enemies) {
          if (!e.alive || e.deathT > 0) continue;
          const dx = e.x - a.x, dy = e.y - a.y;
          if (dx * dx + dy * dy < a.radius * a.radius) {
            const was = e.hp;
            const { damage, crit } = this.combat.rollDamage(a.damage);
            e.takeDamage(damage, 0, 0);
            if (crit) this.combat.pushText(e.x, e.y - 20, Math.round(damage) + '!');
            if (e.hp <= 0 && was > 0) { this.combat.addKill(a.weaponId); if (onKill) onKill(e); }
          }
        }
      }
      if (a.ttl <= 0) this.areas.splice(i, 1);
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.expired) { this.pool.release(p); this.projectiles.splice(i, 1); }
    }
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const p = this.enemyShots[i];
      p.update(dt);
      if (p.expired) { this.pool.release(p); this.enemyShots.splice(i, 1); }
    }
  }

  _fireToTarget(st, ctx) {
    const c = st.cfg, { player, enemies } = ctx;
    const target = c.auto_aim === false ? null : this.nearest(player.x, player.y, enemies, c.auto_aim_range || 400);
    if (!target) return;
    const n = c.projectiles_per_shot || 1;
    const spread = ((c.spread_angle || 0) * Math.PI) / 180;
    const baseA = Math.atan2(target.y - player.y, target.x - player.x);
    const { damage, crit } = this.combat.rollDamage(this.weaponDamage(st, player));
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const a = baseA + off;
      const p = this.pool.acquire();
      p.fire({
        x: player.x, y: player.y,
        vx: Math.cos(a) * (c.projectile_speed || 400),
        vy: Math.sin(a) * (c.projectile_speed || 400),
        damage, crit,
        pierce: c.pierce_count || 0,
        radius: c.projectile_radius || 6,
        life: (c.projectile_lifetime_ms || 1000) / 1000,
        explosionR: (c.explosion_radius || 0) + (c.explosion_radius_per_level || 0) * (st.level - 1),
        explosionDmg: c.explosion_damage || 0,
        weaponId: c.id, friendly: true,
        spritePath: c.projectile_sprite,
        frames: c.projectile_frames, animName: 'fly'
      });
      this.projectiles.push(p);
    }
    if (c.sfx_shoot && this.audio) this.audio.playSfx(c.sfx_shoot);
  }

  _fireAura(st, ctx) {
    const c = st.cfg, { player, enemies } = ctx;
    const radius = (c.aura_radius || 150) + (c.aura_radius_per_level || 0) * (st.level - 1);
    const { damage } = this.combat; // noop guard
    void damage;
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx * dx + dy * dy < radius * radius) {
        const was = e.hp;
        const r = this.combat.rollDamage(this.weaponDamage(st, player));
        e.takeDamage(r.damage, (dx / (Math.hypot(dx, dy) || 1)) * 120, (dy / (Math.hypot(dx, dy) || 1)) * 120);
        if (r.crit) this.combat.pushText(e.x, e.y - 20, Math.round(r.damage) + '!');
        if (e.hp <= 0 && was > 0) { this.combat.addKill(c.id); if (ctx.onKill) ctx.onKill(e); }
      }
    }
    this.auraRadius = radius;
    this.auraColor = c.aura_color || '#00ccff';
    this.auraFlash = 0.2;
  }

  _fireArea(st, ctx) {
    const c = st.cfg, { player, enemies } = ctx;
    const target = c.auto_aim === false ? null : this.nearest(player.x, player.y, enemies, c.auto_aim_range || 400);
    const cx = target ? target.x : player.x + 100;
    const cy = target ? target.y : player.y;
    const radius = (c.area_radius || 120) + (c.area_radius_per_level || 0) * (st.level - 1);
    this.areas.push({
      cfg: c, weaponId: c.id, x: cx, y: cy, radius,
      damage: this.weaponDamage(st, player),
      ttl: c.area_duration_ms || 4000, tickT: 0,
      color: c.area_color || '#ff4400',
      spritePath: c.area_sprite, frames: c.area_frames
    });
    if (c.sfx_hit && this.audio) this.audio.playSfx(c.sfx_hit);
  }

  // Выстрел врага (ranged): чистая логика, без поиска цели вне
  enemyFire(x, y, tx, ty, projCfg, damage) {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    const p = this.pool.acquire();
    p.fire({
      x, y,
      vx: (dx / d) * (projCfg.speed || 250),
      vy: (dy / d) * (projCfg.speed || 250),
      damage, crit: false, pierce: 0,
      radius: projCfg.radius || 6,
      life: (projCfg.lifetime_ms || 2000) / 1000,
      weaponId: projCfg.id, friendly: false,
      spritePath: projCfg.sprite, frames: projCfg.frames, animName: 'fly'
    });
    this.enemyShots.push(p);
  }
}
