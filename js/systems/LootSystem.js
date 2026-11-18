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
    if (xp > 0) out.push(this._make('xp', enemy.x, enemy.y, xp));
    // монеты: фиксированные + шанс
    const fixed = enemy.cfg.coin_drop || 0;
    for (let i = 0; i < fixed; i++) out.push(this._make('coin', enemy.x, enemy.y, 1));
    if ((enemy.cfg.coin_drop_chance || 0) > 0 && rand() < enemy.cfg.coin_drop_chance) {
      out.push(this._make('coin', enemy.x, enemy.y, 1));
    }
    if (rand() < (this.cfg.health_potion_chance || 0)) out.push(this._make('potion', enemy.x, enemy.y, 1));
    if (rand() < (this.cfg.magnet_chance || 0)) out.push(this._make('magnet', enemy.x, enemy.y, 1));
    if (rand() < (this.cfg.bomb_chance || 0)) out.push(this._make('bomb', enemy.x, enemy.y, 1));
    return out;
  }

  // Создаёт Pickup и навешивает спрайт из loot.pickup_sprites (если задан).
  _make(kind, x, y, value) {
    const p = new Pickup(kind, x, y, value);
    this.applySprite(p);
    return p;
  }

  // Навешивает спрайт/атлас на произвольный Pickup (используется и для лута из сундуков).
  // Анимации у дропа нет — при создании выбирается случайный кадр атласа.
  applySprite(p) {
    // Единый параметр плавного исчезновения для всех источников лута.
    const fade = this.cfg.fade_out_ms;
    if (Number.isFinite(fade) && fade >= 0) p.fadeMs = fade;
    const s = (this.cfg.pickup_sprites || {})[p.kind];
    if (s && s.sprite) {
      p.sprite = s.sprite;
      p.sprite_frames = s;
      const total = s.frames || (s.columns || 1) * (s.rows || 1);
      p.animFrame = Math.floor(Math.random() * total);
    }
    return p;
  }
}
