import { xpForLevel } from '../utils/math.js';

// XP и уровни забега: xp_needed = xp_base * (level ^ xp_exponent).
export class ProgressionSystem {
  constructor(cfg) {
    this.base = cfg.xp_base || 10;
    this.exp = cfg.xp_exponent || 1.5;
    this.maxLevel = cfg.max_level_per_run || 50;
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
    if (this.level >= this.maxLevel) return 0;
    this.xp += amount;
    this.totalXp += amount;
    let ups = 0;
    while (this.xp >= this.need && this.level < this.maxLevel) {
      this.xp -= this.need;
      this.level++;
      ups++;
    }
    if (this.level >= this.maxLevel) this.xp = Math.min(this.xp, this.need);
    return ups;
  }

  // Мгновенные уровни от сундука (без XP)
  grantLevels(n) {
    let ups = 0;
    for (let i = 0; i < n && this.level < this.maxLevel; i++) { this.level++; ups++; }
    return ups;
  }

  reset() { this.level = 1; this.xp = 0; this.totalXp = 0; }
}
