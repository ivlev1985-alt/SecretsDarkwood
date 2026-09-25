// Ежедневный бонус (GDD п.5.4/5.8): +N монет раз в cooldown_hours.
export class DailyBonusSystem {
  constructor(cfg) {
    this.cooldownMs = (cfg.cooldown_hours || 24) * 3600 * 1000;
    this.reward = cfg.reward_coins || 50;
    this.enabled = cfg.enabled !== false;
  }

  ready(lastTs, now = Date.now()) {
    if (!this.enabled) return false;
    return now - (lastTs || 0) >= this.cooldownMs;
  }

  remainMs(lastTs, now = Date.now()) {
    return Math.max(0, this.cooldownMs - (now - (lastTs || 0)));
  }

  fmtRemain(lastTs, now = Date.now()) {
    let s = Math.floor(this.remainMs(lastTs, now) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h + ':' + m + ':' + ss;
  }
}
