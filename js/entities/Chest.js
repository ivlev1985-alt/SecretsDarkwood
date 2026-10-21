import { Entity } from './Entity.js';

// Сундук: idle-мерцание, auto-open в pickup_radius, награда через ChestRewardRegistry.
export class Chest extends Entity {
  constructor(typeCfg, x, y) {
    super(x, y, 20);
    this.typeCfg = typeCfg;
    this.opened = false;
    this.age = 0;
    this.openT = 0;
    this.holdMs = 150; // задержка после open-анимации — задаётся из chests.open_hold_ms
    this.fadeDuration = 5; // секунды на плавное исчезновение после открытия
    this.makeAnim(typeCfg.frames, 'idle');
  }

  update(dt, lifetime, holdMs) {
    if (holdMs !== undefined) this.holdMs = holdMs;
    this.age += dt;
    if (this.opened) {
      this.openT += dt;
      this.updateAnim(dt);
      if (this.openT >= this.fadeDuration) this.alive = false; // исчез через fadeDuration сек
    } else {
      this.updateAnim(dt);
      if (this.age >= lifetime) this.alive = false; // исчез
    }
  }

  open() {
    if (this.opened) return false;
    this.opened = true;
    this.openT = 0;
    try { this.setAnim('open'); } catch (e) {}
    return true;
  }

  get rw() { return this.typeCfg.frames.frame_width; }
  get rh() { return this.typeCfg.frames.frame_height; }

  get done() {
    if (!this.opened) return false;
    return this.openT >= this.fadeDuration;
  }

  // Разлёт лута вокруг сундука. Чистая функция для тестов.
  // Возвращает [{ kind, value, angle }] — угол разлёта, скорость/радиус берёт вызывающий код из loot_scatter.
  static scatterLoot(reward, scatterCfg, rand = Math.random) {
    const out = [];
    const coins = Math.max(0, Math.round(reward.coins || 0));
    if (coins > 0) {
      const per = Math.max(1, Math.round(scatterCfg.coin_value_per_pickup || 5));
      const maxN = Math.max(1, Math.round(scatterCfg.max_coin_pickups || 12));
      let n = Math.ceil(coins / per);
      n = Math.min(n, maxN);
      const val = Math.ceil(coins / n);
      for (let i = 0; i < n; i++) {
        // равномерное кольцо + джиттер чтобы не ложились строго по кругу
        const angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
        out.push({ kind: 'coin', value: i === n - 1 ? coins - val * (n - 1) : val, angle });
      }
    }
    const potions = Math.max(0, Math.round(reward.potions || 0));
    for (let i = 0; i < potions; i++) {
      out.push({ kind: 'potion', value: 1, angle: rand() * Math.PI * 2 });
    }
    return out;
  }

  // Взвешенный выбор типа. Чистая функция для тестов.
  static pickType(types, rand = Math.random) {
    const total = types.reduce((s, t) => s + (t.drop_weight || 0), 0);
    let r = rand() * total;
    for (const t of types) {
      r -= t.drop_weight || 0;
      if (r <= 0) return t;
    }
    return types[types.length - 1];
  }

  // Ролл награды. Чистая функция для тестов.
  static rollReward(typeCfg, rand = Math.random) {
    const coins = typeCfg.coins_min + Math.floor(rand() * ((typeCfg.coins_max - typeCfg.coins_min) + 1));
    const spell = rand() < (typeCfg.spell_drop_chance || 0) ? (typeCfg.spell_count || 0) : 0;
    return {
      coins,
      potions: typeCfg.health_potions || 0,
      spells: spell,
      levels: typeCfg.level_up_bonus || 0,
      rewardType: typeCfg.reward_type || 'mixed'
    };
  }
}
