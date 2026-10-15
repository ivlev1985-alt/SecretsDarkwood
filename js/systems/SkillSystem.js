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
    this.lightningFx = []; // { x1, y1, x2, y2, t, max } — ломаные молний
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

  // Статус с оружия на текущем уровне. Все константы — из skills_config.
  // slow: factor (множитель скорости) + duration (сек). burn: dps + duration (сек).
  weaponSlow(st) {
    const c = st.cfg;
    if (!(c.slow_factor < 1) || !(c.slow_duration_ms > 0)) return null;
    const lvl = (st.level || 1) - 1;
    const factor = Math.min(0.95, Math.max(0.05,
      c.slow_factor + (c.slow_factor_per_level || 0) * lvl));
    const dur = (c.slow_duration_ms + (c.slow_duration_per_level_ms || 0) * lvl) / 1000;
    return { factor, duration: dur };
  }

  weaponBurn(st, player) {
    const c = st.cfg;
    if (!(c.burn_dps > 0) || !(c.burn_duration_ms > 0)) return null;
    const lvl = (st.level || 1) - 1;
    const dps = ((c.burn_dps || 0) + (c.burn_dps_per_level || 0) * lvl) * (player ? player.damageMul : 1);
    const dur = (c.burn_duration_ms + (c.burn_duration_per_level_ms || 0) * lvl) / 1000;
    return { dps, duration: dur };
  }

  // Нанести статусы оружия на врага (вызывается из Combat/ауры/зон).
  applyWeaponStatus(e, st, player) {
    const slow = this.weaponSlow(st);
    if (slow) e.applySlow(slow.factor, slow.duration);
    const burn = this.weaponBurn(st, player);
    if (burn) e.applyBurn(burn.dps, burn.duration, st.cfg.id);
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

  // Случайный живой враг в радиусе (для targeting:"random" и прыжков цепи).
  // exclude — Set уже поражённых (цепь не бьёт дважды). Чистая логика + rand.
  randomInRange(px, py, enemies, range, exclude, rand = Math.random) {
    const r2 = range * range;
    let n = 0;
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      if (exclude && exclude.has(e)) continue;
      const dx = e.x - px, dy = e.y - py;
      if (dx * dx + dy * dy <= r2) n++;
    }
    if (!n) return null;
    let k = (rand() * n) | 0;
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      if (exclude && exclude.has(e)) continue;
      const dx = e.x - px, dy = e.y - py;
      if (dx * dx + dy * dy <= r2) {
        if (k === 0) return e;
        k--;
      }
    }
    return null;
  }

  // Следующий прыжок цепи: случайная непоражённая цель в chainRange от точки
  // попадания. Доводит снаряд на неё; если целей нет — цепь гаснет.
  chainNext(p, enemies, fromX, fromY, rand = Math.random) {
    if (!p || !p.active || !(p.chainRange > 0)) return null;
    const next = this.randomInRange(fromX, fromY, enemies, p.chainRange, p.hitIds, rand);
    if (!next) { p.active = false; p.alive = false; return null; }
    p.chainTarget = next;
    const sp = Math.hypot(p.vx, p.vy) || 400;
    const dx = next.x - p.x, dy = next.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
    return next;
  }

  // Цель цепи могла умереть от другого оружия пока снаряд летел —
  // перенацеливаем в полёте, иначе цепь гаснет. Вызывается каждый кадр из Game.
  updateChains(enemies, rand = Math.random) {
    for (const p of this.projectiles) {
      if (!p.active || !(p.chainRange > 0) || !p.chainTarget) continue;
      const t = p.chainTarget;
      if (!t.alive || t.deathT > 0 || t.hp <= 0 || (p.hitIds && p.hitIds.has(t))) {
        this.chainNext(p, enemies, p.x, p.y, rand);
      }
    }
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
      // зоны (смерч, стена) не кастуются без монстров — короткий ретрай вместо полного кд
      if (c.type === 'area' && !enemies.some((e) => e.alive && !e.deathT)) {
        st.cd = 0.25;
        continue;
      }
      if (c.type === 'to_target') this._fireToTarget(st, ctx);
      else if (c.type === 'around_player') this._fireAura(st, ctx);
      else if (c.type === 'area') this._fireArea(st, ctx);
      st.cd = this.weaponCooldown(st, player);
    }

    // аура-ти idle не нужен; урон ауры — тиком
    this.auraTick -= dt;

    // зоны: тик-урон + статусы (burn/slow из конфига оружия) + время жизни
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
            if (a.slow) e.applySlow(a.slow.factor, a.slow.duration);
            if (a.burn) e.applyBurn(a.burn.dps, a.burn.duration, a.weaponId);
            if (crit) this.combat.pushText(e.x, e.y - 20, Math.round(damage) + '!');
            if (e.hp <= 0 && was > 0) { this.combat.addKill(a.weaponId); if (onKill) onKill(e, a.weaponId); }
          }
        }
      }
      if (a.ttl <= 0) this.areas.splice(i, 1);
    }
  }

  // Хук попаданий из Combat: цепочка молнии от предыдущей точки к цели.
  registerHitFx(p, e) {
    if (p.weaponId !== 'lightning_chain') return;
    this.lightningFx.push({
      x1: p.lastX ?? p.ox ?? p.x,
      y1: p.lastY ?? p.oy ?? p.y,
      x2: e.x, y2: e.y,
      t: 0.22, max: 0.22
    });
    if (this.lightningFx.length > 24) this.lightningFx.shift();
    p.lastX = e.x; p.lastY = e.y;
  }

  updateFx(dt) {
    for (let i = this.lightningFx.length - 1; i >= 0; i--) {
      this.lightningFx[i].t -= dt;
      if (this.lightningFx[i].t <= 0) this.lightningFx.splice(i, 1);
    }
  }

  // Ломаная молния: 6 сегментов со случайным смещением, гаснет за ~0.2с
  drawLightning(ctx) {
    for (const f of this.lightningFx) {
      const k = Math.max(0, f.t / f.max);
      const n = 6;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * k;
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      this._traceBolt(ctx, f, n, 14);
      ctx.stroke();
      ctx.strokeStyle = '#ffe94d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this._traceBolt(ctx, f, n, 14);
      ctx.stroke();
      ctx.restore();
    }
  }

  _traceBolt(ctx, f, n, amp) {
    ctx.moveTo(f.x1, f.y1);
    const dx = (f.x2 - f.x1) / n, dy = (f.y2 - f.y1) / n;
    const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1) || 1;
    const nx = -(f.y2 - f.y1) / len, ny = (f.x2 - f.x1) / len;
    for (let i = 1; i < n; i++) {
      const off = (Math.random() - 0.5) * 2 * amp;
      ctx.lineTo(f.x1 + dx * i + nx * off, f.y1 + dy * i + ny * off);
    }
    ctx.lineTo(f.x2, f.y2);
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

  _fireToTarget(st, ctx, rand = Math.random) {
    const c = st.cfg, { player, enemies } = ctx;
    // targeting:"random" (цепная молния) — первая цель случайная в радиусе
    // наводки, а не ближайшая; остальные типы — как раньше по ближайшей.
    const target = c.auto_aim === false ? null
      : (c.targeting === 'random'
        ? this.randomInRange(player.x, player.y, enemies, c.auto_aim_range || 400, null, rand)
        : this.nearest(player.x, player.y, enemies, c.auto_aim_range || 400));
    if (!target) return;
    const n = c.projectiles_per_shot || 1;
    const spread = ((c.spread_angle || 0) * Math.PI) / 180;
    const baseA = Math.atan2(target.y - player.y, target.x - player.x);
    const { damage, crit } = this.combat.rollDamage(this.weaponDamage(st, player));
    const slow = this.weaponSlow(st);
    const burn = this.weaponBurn(st, player);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const a = baseA + off;
      const p = this.pool.acquire();
      p.fire({
        x: player.x, y: player.y,
        vx: Math.cos(a) * (c.projectile_speed || 400),
        vy: Math.sin(a) * (c.projectile_speed || 400),
        damage, crit,
        pierce: (c.pierce_count || 0) + (c.pierce_per_level || 0) * (st.level - 1),
        radius: c.projectile_radius || 6,
        life: (c.projectile_lifetime_ms || 1000) / 1000,
        explosionR: (c.explosion_radius || 0) + (c.explosion_radius_per_level || 0) * (st.level - 1),
        explosionDmg: c.explosion_damage || 0,
        slowFactor: slow ? slow.factor : 1,
        slowDuration: slow ? slow.duration : 0,
        burnDps: burn ? burn.dps : 0,
        burnDuration: burn ? burn.duration : 0,
        chainRange: c.chain_range || 0,
        chainTarget: (c.chain_range > 0) ? target : null,
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
    const slow = this.weaponSlow(st);
    const burn = this.weaponBurn(st, player);
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      if (dx * dx + dy * dy < radius * radius) {
        const was = e.hp;
        const r = this.combat.rollDamage(this.weaponDamage(st, player));
        e.takeDamage(r.damage, (dx / (Math.hypot(dx, dy) || 1)) * 120, (dy / (Math.hypot(dx, dy) || 1)) * 120);
        if (slow) e.applySlow(slow.factor, slow.duration);
        if (burn) e.applyBurn(burn.dps, burn.duration, c.id);
        if (r.crit) this.combat.pushText(e.x, e.y - 20, Math.round(r.damage) + '!');
        if (e.hp <= 0 && was > 0) { this.combat.addKill(c.id); if (ctx.onKill) ctx.onKill(e, c.id); }
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
    const slow = this.weaponSlow(st);
    const burn = this.weaponBurn(st, player);
    this.areas.push({
      cfg: c, weaponId: c.id, x: cx, y: cy, radius,
      damage: this.weaponDamage(st, player),
      slow: slow || null, burn: burn || null,
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
