// Магазин меты (GDD п.5.5, shop_config): цены, уровни, применение бонусов.
export class ShopSystem {
  constructor(shopCfg) {
    this.cfg = shopCfg;
  }

  get items() { return this.cfg.items || []; }
  get categories() { return [...(this.cfg.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0)); }

  itemsOf(cat) {
    return this.items.filter((i) => i.category === cat).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  price(item, level) {
    return Math.floor(item.base_price * Math.pow(item.price_multiplier || 1, level));
  }

  // { ok, reason: 'max' | 'funds' | null, price }
  check(item, level, coins) {
    if (level >= (item.max_level || 1)) return { ok: false, reason: 'max', price: 0 };
    const price = this.price(item, level);
    if (coins < price) return { ok: false, reason: 'funds', price };
    return { ok: true, reason: null, price };
  }

  // Стартовые модификаторы из купленных upgrade-товаров
  statMods(levels) {
    const m = { hpAdd: 0, speedMul: 1, dmgMul: 1, atkMul: 1, pickupMul: 1, critAdd: 0, regenAdd: 0, xpMul: 1 };
    for (const it of this.items) {
      if (it.type !== 'upgrade') continue;
      const lv = levels[it.id] || 0;
      if (!lv) continue;
      const v = (it.value_per_level || 0) * lv;
      switch (it.target) {
        case 'player.base_hp': m.hpAdd += v; break;
        case 'player.base_speed': m.speedMul *= (1 + (it.value_per_level || 0) * lv); break;
        case 'player.damage_multiplier': m.dmgMul *= (1 + (it.value_per_level || 0) * lv); break;
        case 'player.attack_speed_multiplier': m.atkMul *= (1 + (it.value_per_level || 0) * lv); break;
        case 'player.pickup_radius_multiplier': m.pickupMul *= (1 + (it.value_per_level || 0) * lv); break;
        case 'player.crit_chance': m.critAdd += v; break;
        case 'player.hp_regen_per_sec': m.regenAdd += v; break;
        case 'player.xp_multiplier': m.xpMul *= (1 + (it.value_per_level || 0) * lv); break;
        default: break;
      }
    }
    return m;
  }

  // ID оружий, разблокированных покупками unlock
  unlockedWeapons(levels) {
    const out = [];
    for (const it of this.items) {
      if (it.type !== 'unlock') continue;
      if ((levels[it.id] || 0) <= 0) continue;
      const m = /^weapon\.(.+)\.unlocked$/.exec(it.target || '');
      if (m) out.push(m[1]);
    }
    return out;
  }
}
