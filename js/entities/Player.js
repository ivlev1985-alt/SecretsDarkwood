import { Entity } from './Entity.js';

// Игрок: статы из balance.player (+ бонусы магазина на Этапе 5).
export class Player extends Entity {
  constructor(cfg, x = 0, y = 0) {
    super(x, y, cfg.collision_radius || 16);
    this.cfg = cfg;
    this.maxHp = cfg.base_hp;
    this.hp = this.maxHp;
    this.speed = cfg.base_speed;
    this.pickupRadius = cfg.pickup_radius;
    this.damageMul = cfg.damage_multiplier ?? 1;
    this.attackSpeedMul = cfg.attack_speed_multiplier ?? 1;
    this.pickupMul = cfg.pickup_radius_multiplier ?? 1;
    this.critChance = cfg.crit_chance ?? 0.05;
    this.critMul = cfg.crit_multiplier ?? 2;
    this.regen = cfg.hp_regen_per_sec ?? 0;
    this.xpMul = cfg.xp_multiplier ?? 1;
    this.invT = 0; // неуязвимость после урона
    this.level = 1;
    this.anim = null; // задаёт Game.attachHeroAnim после загрузки hero.frames
    this.passiveLevels = {};
    this.coins = 0;
    this.flashColor = '#ff0000'; // переопределяется из visuals.hurt_flash_color
    this.hurtDur = 0.25; // переопределяется из visuals.hurt_flash_duration_ms
    // Визуальное состояние процедурного мага (спрайт может отсутствовать).
    this.heroDir = 'down'; // down/up/left/right — последнее направление движения
    this.moving = false;
    this.castT = 0; // остаток анимации каста, сек
    this.castCrit = false; // каст был критическим — золотая вспышка мага
    this.castDuration = 0.43; // переопределяется из game_config.hero.procedural
    this.deathT = 0; // остаток анимации смерти, сек
    this.deathDuration = 1.1; // переопределяется из game_config.hero.procedural
  }

  getPickupRadius() { return this.pickupRadius * (this.pickupMul || 1); }

  // Пассивка из skills_config.passive_skills. Возвращает новый уровень.
  applyPassive(id, passivesCfg) {
    const def = (passivesCfg || []).find((p) => p.id === id);
    if (!def) return 0;
    const cur = this.passiveLevels[id] || 0;
    if (cur >= (def.max_level || 5)) return cur;
    const nv = cur + 1;
    this.passiveLevels[id] = nv;
    const v = def.value_per_level || 0;
    switch (id) {
      case 'max_hp': this.maxHp += v; this.hp = Math.min(this.maxHp, this.hp + v); break;
      case 'speed': this.speed *= (1 + v); break;
      case 'damage': this.damageMul *= (1 + v); break;
      case 'attack_speed': this.attackSpeedMul *= (1 + v); break;
      case 'pickup_radius': this.pickupMul *= (1 + v); break;
      case 'crit_chance': this.critChance += v; break;
      case 'hp_regen': this.regen += v; break;
      default: break;
    }
    return nv;
  }

  attachHeroAnim(animator) { this.anim = animator; }

  get invincible() { return this.invT > 0; }

  // Каст: поднимаем посох. Не перезапускаем анимацию, если она уже идёт —
  // иначе несколько заклинаний подряд дёргали бы её в начало каждый кадр.
  // crit=true — золотая вспышка у процедурного мага (HeroMageRenderer).
  playCast(crit = false) {
    if (!this.alive || this.deathT > 0) return;
    if (this.castT <= 0) {
      this.castCrit = !!crit;
      this.castT = this.castDuration ?? 0.43;
    }
  }

  // Смерть: отдельный таймер для процедурного мага и death-анимации спрайта.
  startDeath() {
    if (this.deathT > 0) return;
    this.alive = false;
    this.moving = false;
    this.castT = 0;
    this.castCrit = false;
    this.deathT = this.deathDuration ?? 1.1;
    if (this.anim) { try { this.anim.setAnimation('death'); } catch (e) {} }
  }

  updateDeath(dt) {
    if (this.deathT > 0) this.deathT = Math.max(0, this.deathT - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.anim) {
      try { this.anim.setAnimation('death'); this.anim.update(dt); } catch (e) {}
    }
  }

  // Воскрешение: возвращаем визуал в живое состояние (deathT не должен
  // оставлять мага в позе падения после rewarded-revive).
  reviveReset() {
    this.alive = true;
    this.deathT = 0;
    this.castT = 0;
    this.castCrit = false;
    this.moving = false;
    this.heroDir = 'down';
    this.tilt = 0;
    if (this.anim) { try { this.anim.setAnimation('idle'); } catch (e) {} }
  }

  update(dt, moveVec) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.x += moveVec.x * this.speed * dt;
    this.y += moveVec.y * this.speed * dt;
    if (Math.abs(moveVec.x) > 0.05) this.facing = moveVec.x > 0 ? 1 : -1;
    const moving = Math.hypot(moveVec.x, moveVec.y) > 0.15;
    this.moving = moving;
    // Направление для процедурного мага: доминирующая ось движения.
    // При остановке сохраняем последнее направление — нет резкого разворота.
    if (moving) {
      if (Math.abs(moveVec.x) >= Math.abs(moveVec.y)) {
        this.heroDir = moveVec.x >= 0 ? 'right' : 'left';
      } else {
        this.heroDir = moveVec.y < 0 ? 'up' : 'down';
      }
    }
    // Наклон при движении по вертикали: вниз — завал «на зрителя», вверх — «от себя».
    // Значение маленькое (до ~0.12 рад), сглаженное — лёгкий живый крен, не карикатура.
    const targetTilt = moving ? moveVec.y * 0.12 : 0;
    this.tilt = (this.tilt || 0) + (targetTilt - (this.tilt || 0)) * Math.min(1, dt * 8);
    if (this.anim) {
      this.anim.setAnimation(moving ? 'run' : 'idle');
      this.anim.update(dt);
    }
    if (this.castT > 0) {
      this.castT = Math.max(0, this.castT - dt);
      if (this.castT === 0) this.castCrit = false;
    }
    if (this.invT > 0) this.invT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.regen > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }

  // Возвращает фактически нанесённый урон (0 если неуязвим/мёртв/округлился до 0).
  // Урон монстров всегда целочисленный: contact_mul, volley.damage_mul и
  // скейлинг волн могут дать дробь — округляем в одной точке для всех путей.
  takeContactDamage(amount) {
    if (this.invT > 0 || this.hp <= 0) return 0;
    const dmg = Math.max(0, Math.round(Number(amount) || 0));
    if (dmg <= 0) return 0;
    this.hp -= dmg;
    this.invT = (this.cfg.invincibility_ms || 500) / 1000;
    this.hitFlash = this.hurtDur || 0.25;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return dmg;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const h = Math.min(amount, this.maxHp - this.hp);
    this.hp += h;
    return h;
  }

  // Крит-бросок: чистая функция для тестов
  static rollCrit(chance, mul, base, rand = Math.random) {
    const crit = rand() < chance;
    return { damage: base * (crit ? mul : 1), crit };
  }
}
