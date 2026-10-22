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
    this.dashSpd = 0; // скорость рывка (пересчитывается под дистанцию — долететь ровно до игрока)
    this.dashHitDone = false; // удар уже нанесён в этом рывке
  }

  bossDashCfg() {
    return this.cfg.dash || null;
  }

  // Запустить телеграф рывка, если босс умеет рывок и кулдаун прошёл.
  // Возвращает true если рывок стартовал.
  // Дистанция НЕ фиксируется здесь — она фиксируется на старте рывка
  // (конец замаха, по текущей позиции игрока), чтобы рывок долетал
  // ровно до персонажа и заканчивался ударом.
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
  // mode 'hold' — стоим на месте (телеграф/замах), 'dash' — летим.
  // Тик фаз рывка. Принимает позицию игрока — направление и скорость
  // фиксируются по ТЕКУЩЕЙ позиции в моменты переходов:
  //   telegraph -> charge: обновить направление (следим за игроком);
  //   charge -> dashing: зафиксировать направление и подобрать скорость
  //     dashSpd = max(speed*speed_mul, dist/duration), чтобы долететь
  //     ровно до персонажа и закончить рывок ударом в его точке.
  // Возвращает { mode, dmgMul, finished }:
  //   'hold' — стоим (телеграф/замах), 'dash' — летим,
  //   finished=true — рывок только что закончился (пора бить).
  bossDashTick(dt, px, py) {
    const d = this.bossDashCfg();
    if (!d) return { mode: 'walk', dmgMul: 1, finished: false };
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashState === 'telegraph') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashState = 'charge';
        this.dashT = (d.charge_ms ?? 300) / 1000;
        try { this.setAnim('dash'); } catch (e) {}
      } else if (px !== undefined) {
        // Следим за игроком во время телеграфа
        const dx = px - this.x, dy = py - this.y;
        const dd = Math.hypot(dx, dy) || 1;
        this.dashDx = dx / dd; this.dashDy = dy / dd;
      }
      return { mode: 'hold', dmgMul: 1, finished: false };
    }
    if (this.dashState === 'charge') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        // Старт рывка: фиксируем по текущей позиции игрока
        if (px !== undefined) {
          const dx = px - this.x, dy = py - this.y;
          const dd = Math.hypot(dx, dy) || 1;
          this.dashDx = dx / dd; this.dashDy = dy / dd;
          const dur = (d.duration_ms || 600) / 1000;
          this.dashSpd = Math.max(this.speed * (d.speed_mul || 4), dd / Math.max(dur, 0.05));
        } else if (!(this.dashSpd > 0)) {
          this.dashSpd = this.speed * (d.speed_mul || 4);
        }
        this.dashState = 'dashing';
        this.dashT = (d.duration_ms || 600) / 1000;
        this.dashHitDone = false; // удар по площади — в конце рывка, в точке игрока
      }
      return { mode: 'hold', dmgMul: 1, finished: false };
    }
    if (this.dashState === 'dashing') {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashState = 'idle';
        this.dashCd = (d.cooldown_ms || 4000) / 1000;
        this.dashSpd = 0;
        try { this.setAnim('walk'); } catch (e) {}
        return { mode: 'dash', dmgMul: (d.contact_mul ?? 1.5), finished: true };
      }
      return { mode: 'dash', dmgMul: (d.contact_mul ?? 1.5), finished: false };
    }
    return { mode: 'walk', dmgMul: 1, finished: false };
  }

  get isDashing() { return this.dashState === 'dashing'; }
  get isWindingUp() { return this.dashState === 'telegraph' || this.dashState === 'charge'; }
}
