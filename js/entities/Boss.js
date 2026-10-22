import { Enemy } from './Enemy.js';

// Босс: тот же Enemy + имя + флаг предупреждения. Оверлей и бар — в Game.
// Порядковый номер волны босса (boss_wave_n) проставляется SpawnSystem при
// спавне и используется для выбора паттерна (shooter/dasher/volley).
export class Boss extends Enemy {
  constructor(cfg, x, y, name = '') {
    super(cfg, x, y);
    this.name = name;
    this.warned = false;
    this.boss_wave_n = 0; // номер появления в забеге (1,2,3…)
    // Состояние рывка: 'idle' | 'telegraph' | 'charge' | 'dashing'
    this.dashState = 'idle';
    this.dashT = 0; // остаток текущей фазы, сек
    this.dashCd = 0; // кулдаун до следующего рывка, сек
    this.dashDx = 0; // направление рывка (фиксируется на старте)
    this.dashDy = 0;
    this.volleyT = 0; // таймер залпа (shooter_volley), сек
    this.volleyFired = false; // залп на текущей волне уже дан (для персист-флага)
  }

  bossDashCfg() {
    return this.cfg.dash || null;
  }

  // Запустить телеграф рывка, если босс умеет рывок и кулдаун прошёл
  // Возвращает true если рывок стартовал
  tryStartDash(px, py) {
    const d = this.bossDashCfg();
    if (!d || this.dashState !== 'idle') return false;
    if ((this.dashCd || 0) > 0) return false;
    const dx = px - this.x, dy = py - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > (d.range || 520)) return false; // далеко — просто идём
    this.dashDx = dx / dist;
    this.dashDy = dy / dist;
    this.dashState = 'telegraph';
    this.dashT = (d.telegraph_ms || 800) / 1000;
    try { this.setAnim('attack'); } catch (e) {}
    return true;
  }

  // Тик фаз рывка. Возвращает { mode, dmgMul }:
  // mode 'hold' — стоим на месте (телеграф/замах), 'dash' — летим
  bossDashTick(dt) {
    const d = this.bossDashCfg();
    if (!d) return { mode: 'walk', dmgMul: 1 };
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashState === 'telegraph') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashState = 'charge';
        this.dashT = (d.charge_ms ?? 500) / 1000;
        try { this.setAnim('dash'); } catch (e) {}
        // Фиксируем направление на игрока в момент конца телеграфа —
        // уклониться можно, но нужно двигаться, а не стоять
        // (пересчёт делается в Game, здесь только фаза)
      }
      return { mode: 'hold', dmgMul: 1 };
    }
    if (this.dashState === 'charge') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashState = 'dashing';
        this.dashT = (d.duration_ms || 600) / 1000;
        this.dashHitDone = false; // удар по площади — один раз за рывок
      }
      return { mode: 'hold', dmgMul: 1 };
    }
    if (this.dashState === 'dashing') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashState = 'idle';
        this.dashCd = (d.cooldown_ms || 4000) / 1000;
        try { this.setAnim('walk'); } catch (e) {}
      }
      return { mode: 'dash', dmgMul: (d.contact_mul ?? 1.5) };
    }
    return { mode: 'walk', dmgMul: 1 };
  }

  get isDashing() { return this.dashState === 'dashing'; }
  get isWindingUp() { return this.dashState === 'telegraph' || this.dashState === 'charge'; }
}
