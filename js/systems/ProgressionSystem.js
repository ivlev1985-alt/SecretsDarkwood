import { xpForLevel } from '../utils/math.js';

// XP и уровни забега: xp_needed = xp_base * (level ^ xp_exponent).
export class ProgressionSystem {
  constructor(cfg) {
    this.base = cfg.xp_base || 10;
    this.exp = cfg.xp_exponent || 1.5;
    // Ограничения уровня убраны: все умения могут достичь 5 уровня,
    // а дальше игрок качается хоть бесконечно (умения уже на максимуме,
    // выбор апгрейдов просто перестанет предлагаться).
    this.maxLevel = Infinity;
    this.level = 1;
    this.xp = 0;
    this.totalXp = 0;
  }

  needFor(level = this.level) {
    return xpForLevel(this.base, this.exp, level);
  }

  get need() { return this.needFor(this.level); }
  get progress() { return Math.min(1, this.xp / this.need); }

  // Возвращает сколько уровней апнулось (0+). Мульти-ап за сундук учтён.
  addXP(amount) {
    this.xp += amount;
    this.totalXp += amount;
    let ups = 0;
    while (this.xp >= this.need) {
      this.xp -= this.need;
      this.level++;
      ups++;
    }
    return ups;
  }

  // Мгновенные уровни от сундука (без XP)
  grantLevels(n) {
    let ups = 0;
    for (let i = 0; i < n; i++) { this.level++; ups++; }
    return ups;
  }

  reset() { this.level = 1; this.xp = 0; this.totalXp = 0; }
}
