import { Chest } from '../entities/Chest.js';

// Сундуки: интервал, лимит на карте, время жизни, автооткрытие в pickup_radius.
// Клетки (cages): отдельный вид «сундука» с питомцем внутри — появляются из
// того же таймера спавна по весам (чем лучше питомец, тем реже).
export class ChestSystem {
  constructor(chestsCfg, cagesCfg = null) {
    this.cfg = chestsCfg;
    this.cageCfg = cagesCfg || {};
    this.chests = [];
    this.cages = [];
    this.timer = chestsCfg.spawn_interval_sec || 60;
    this.openRadius = chestsCfg.open_radius || 60;
  }

  // Взвешенный выбор: обычный сундук или клетка. Чистая функция для тестов.
  // Возвращает { cfg, cage:boolean, weight } или null.
  static pickSpawn(chestTypes, cageTypes, allowCage, rand = Math.random) {
    const pool = [];
    for (const t of (chestTypes || [])) pool.push({ cfg: t, cage: false, weight: t.drop_weight || 0 });
    if (allowCage) for (const t of (cageTypes || [])) pool.push({ cfg: t, cage: true, weight: t.drop_weight || 0 });
    const total = pool.reduce((s, p) => s + p.weight, 0);
    if (total <= 0) return null;
    let r = rand() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p;
    }
    return pool[pool.length - 1];
  }

  _spawn(dt, ctx) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.spawn_interval_sec || 60;
    const aliveChests = this.chests.filter((c) => c.alive && !c.opened).length;
    const aliveCages = this.cages.filter((c) => c.alive && !c.opened).length;
    const roomForChest = aliveChests < (this.cfg.max_chests_on_map || 3);
    const canCage = this.cageCfg.enabled !== false
      && Array.isArray(this.cageCfg.types) && this.cageCfg.types.length > 0
      && aliveCages < (this.cageCfg.max_cages_on_map || 1);
    // Если сундуки уже на лимите — выбираем только из клеток (если можно).
    const chestTypes = roomForChest ? (this.cfg.types || []) : [];
    const pick = ChestSystem.pickSpawn(chestTypes, this.cageCfg.types, canCage, Math.random);
    if (!pick) return;
    if (pick.cage) {
      const p = ctx.spawnPoint();
      const c = ctx.makeCage ? ctx.makeCage(pick.cfg, p.x, p.y) : null;
      if (c) this.cages.push(c);
    } else {
      const p = ctx.spawnPoint();
      this.chests.push(new Chest(pick.cfg, p.x, p.y));
    }
  }

  update(dt, ctx) {
    // ctx: { player, pickupRadius, onOpen(chest, reward), onCageOpen(cage),
    //        makeCage(typeCfg, x, y), spawnPoint() }
    if (this.cfg.enabled === false) return;
    this._spawn(dt, ctx);
    const pr = ctx.pickupRadius || this.openRadius;
    const holdMs = this.cfg.open_hold_ms ?? 150;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (!c.alive) { this.chests.splice(i, 1); continue; }
      c.update(dt, c.opened ? c.fadeDuration : (this.cfg.chest_lifetime_sec || 120), holdMs);
      if (!c.alive) { this.chests.splice(i, 1); continue; }
      if (!c.opened) {
        const dx = ctx.player.x - c.x, dy = ctx.player.y - c.y;
        if (dx * dx + dy * dy < pr * pr) {
          c.open();
          const reward = Chest.rollReward(c.typeCfg);
          if (ctx.onOpen) ctx.onOpen(c, reward);
        }
      } else if (c.done) {
        c.alive = false;
        this.chests.splice(i, 1);
      }
    }
    // клетки: у открытой сначала проигрывается анимация разрушения,
    // и только после неё открывается окно выбора питомца.
    const cg = this.cageCfg;
    if (cg.enabled !== false && this.cages.length) {
      const life = cg.chest_lifetime_sec || this.cfg.chest_lifetime_sec || 120;
      const openR = cg.open_radius || this.openRadius;
      for (let i = this.cages.length - 1; i >= 0; i--) {
        const c = this.cages[i];
        if (!c.alive) { this.cages.splice(i, 1); continue; }
        c.update(dt, life);
        if (!c.alive) { this.cages.splice(i, 1); continue; }
        if (!c.opened) {
          const dx = ctx.player.x - c.x, dy = ctx.player.y - c.y;
          if (dx * dx + dy * dy < openR * openR) c.startBreak();
        } else if (c.done) {
          if (ctx.onCageOpen) ctx.onCageOpen(c);
          this.cages.splice(i, 1);
        }
      }
    }
  }

  clear() {
    this.chests.length = 0;
    this.cages.length = 0;
    this.timer = this.cfg.spawn_interval_sec || 60;
  }
}
