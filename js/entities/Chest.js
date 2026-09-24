import { Entity } from './Entity.js';

// Сундук: idle-мерцание, auto-open в pickup_radius, награда через ChestRewardRegistry.
export class Chest extends Entity {
  constructor(typeCfg, x, y) {
    super(x, y, 20);
    this.typeCfg = typeCfg;
    this.opened = false;
    this.age = 0;
    this.openT = 0;
    this.makeAnim(typeCfg.frames, 'idle');
  }

  update(dt, lifetime) {
    this.age += dt;
    if (this.opened) {
      this.openT += dt;
      this.updateAnim(dt);
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

  get done() {
    if (!this.opened) return false;
    const a = this.typeCfg.frames.animations.open;
    const dur = a ? a.frames / a.fps : 0.5;
    return this.openT >= dur + 0.15;
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
