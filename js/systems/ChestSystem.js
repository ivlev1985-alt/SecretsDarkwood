import { Chest } from '../entities/Chest.js';

// Сундуки: интервал, лимит на карте, время жизни, автооткрытие в pickup_radius.
export class ChestSystem {
  constructor(chestsCfg) {
    this.cfg = chestsCfg;
    this.chests = [];
    this.timer = chestsCfg.spawn_interval_sec || 60;
    this.openRadius = chestsCfg.open_radius || 60;
  }

  update(dt, ctx) {
    // ctx: { player, pickupRadius, onOpen(chest, reward), spawnPoint() }
    if (this.cfg.enabled === false) return;
    this.timer -= dt;
    const alive = this.chests.filter((c) => c.alive && !c.opened).length;
    if (this.timer <= 0) {
      this.timer = this.cfg.spawn_interval_sec || 60;
      if (alive < (this.cfg.max_chests_on_map || 3)) {
        const type = Chest.pickType(this.cfg.types);
        const p = ctx.spawnPoint();
        const c = new Chest(type, p.x, p.y);
        this.chests.push(c);
      }
    }
    const pr = ctx.pickupRadius || this.openRadius;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (!c.alive) { this.chests.splice(i, 1); continue; }
      c.update(dt, this.cfg.chest_lifetime_sec || 120);
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
  }

  clear() { this.chests.length = 0; this.timer = this.cfg.spawn_interval_sec || 60; }
}
