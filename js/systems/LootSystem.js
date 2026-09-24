import { Pickup } from '../entities/Pickup.js';

// Лут с врагов: xp/coin всегда по таблице, potion/magnet/bomb — по шансам loot.
export class LootSystem {
  constructor(lootCfg) {
    this.cfg = lootCfg;
  }

  // Возвращает массив Pickup. Чистая логика + rand для тестов.
  dropFor(enemy, rand = Math.random) {
    const out = [];
    const xp = enemy.cfg.xp_drop || 0;
    if (xp > 0) out.push(new Pickup('xp', enemy.x, enemy.y, xp));
    // монеты: фиксированные + шанс
    const fixed = enemy.cfg.coin_drop || 0;
    for (let i = 0; i < fixed; i++) out.push(new Pickup('coin', enemy.x, enemy.y, 1));
    if ((enemy.cfg.coin_drop_chance || 0) > 0 && rand() < enemy.cfg.coin_drop_chance) {
      out.push(new Pickup('coin', enemy.x, enemy.y, 1));
    }
    if (rand() < (this.cfg.health_potion_chance || 0)) out.push(new Pickup('potion', enemy.x, enemy.y, 1));
    if (rand() < (this.cfg.magnet_chance || 0)) out.push(new Pickup('magnet', enemy.x, enemy.y, 1));
    if (rand() < (this.cfg.bomb_chance || 0)) out.push(new Pickup('bomb', enemy.x, enemy.y, 1));
    return out;
  }
}
