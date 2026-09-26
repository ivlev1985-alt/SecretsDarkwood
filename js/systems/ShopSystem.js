// Предметный магазин (items_config): генерация ассортимента, покупка, продажа,
// бонусы надетого снаряжения. Роллы — через rand для тестов.
export class ShopSystem {
  constructor(itemsCfg) {
    this.cfg = itemsCfg;
    this.rarById = new Map(itemsCfg.rarities.map((r) => [r.id, r]));
    this.slotById = new Map(itemsCfg.slots.map((s) => [s.id, s]));
    this.tplById = new Map(itemsCfg.templates.map((t) => [t.id, t]));
  }

  get shop() { return this.cfg.shop || {}; }

  pickRarity(rand = Math.random) {
    const rs = this.cfg.rarities;
    const total = rs.reduce((s, r) => s + (r.weight || 0), 0);
    let x = rand() * total;
    for (const r of rs) {
      x -= r.weight || 0;
      if (x <= 0) return r;
    }
    return rs[0];
  }

  rollStatValue(statId, rarityId, rand = Math.random) {
    const def = this.cfg.stats[statId];
    const [mn, mx] = def.ranges[rarityId];
    let v = mn + rand() * (mx - mn);
    v = statId === 'regen' ? Math.round(v * 10) / 10 : Math.round(v);
    return v;
  }

  // Полная генерация одного товара: { tpl, slot, rarity, stats:[{id,value}], price, spell?, spell_level? }
  // forceRarityId — для особого дропа (питомец из сундука).
  rollOffer(tpl, rand = Math.random, forceRarityId = null) {
    const slot = this.slotById.get(tpl.slot);
    const rarity = forceRarityId ? this.rarById.get(forceRarityId) : this.pickRarity(rand);
    const offer = { tpl: tpl.id, slot: tpl.slot, rarity: rarity.id, stats: [], price: 0 };
    if (tpl.fetches_potions) offer.fetch_potions = true;
    if (tpl.slot === 'staff') {
      offer.spell = tpl.spell;
      offer.spell_level = rarity.spell_level || 1;
    } else if (tpl.slot === 'pet') {
      const radius = Math.round((tpl.base_radius || 150) * (rarity.pet_mult || 1));
      offer.stats = [{ id: 'radius', value: radius }];
    } else {
      const pool = Object.keys(this.cfg.stats).filter((id) => id !== 'radius');
      const first = slot.fixed_stat;
      const ids = first ? [first] : [];
      // остальные случайно без повторов
      const rest = pool.filter((id) => id !== first);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const need = Math.min(rarity.stats_count || 1, pool.length);
      while (ids.length < need && rest.length) ids.push(rest.pop());
      offer.stats = ids.map((id) => ({ id, value: this.rollStatValue(id, rarity.id, rand) }));
    }
    offer.price = Math.max(1, Math.round(rarity.price_base * (slot.price_mul || 1)));
    return offer;
  }

  // Ассортимент: offers_count товаров, слоты не повторяются.
  // Особые шаблоны (special: ворон) в магазине не продаются — только дроп.
  rollStock(rand = Math.random) {
    const n = this.shop.offers_count || 6;
    const slots = [...this.cfg.slots];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const out = [];
    for (const s of slots.slice(0, n)) {
      const tpls = this.cfg.templates.filter((t) => t.slot === s.id && !t.special);
      if (!tpls.length) continue;
      const tpl = tpls[Math.floor(rand() * tpls.length)];
      out.push(this.rollOffer(tpl, rand));
    }
    return out;
  }

  // Покупка: слот должен быть свободен (запрет до продажи). Возвращает { ok, reason }.
  // reason: 'occupied' | 'funds'
  checkBuy(offer, gear, coins) {
    if (gear && gear[offer.slot]) return { ok: false, reason: 'occupied', price: offer.price };
    if (coins < offer.price) return { ok: false, reason: 'funds', price: offer.price };
    return { ok: true, reason: null, price: offer.price };
  }

  sellPrice(offer) {
    return Math.floor((offer.price || 0) * (this.shop.sell_rate ?? 0.5));
  }

  // Суммарные модификаторы надетого снаряжения (без посохов/питомцев)
  gearMods(gear) {
    const sum = {};
    for (const item of Object.values(gear || {})) {
      if (!item || !item.stats) continue;
      for (const st of item.stats) {
        if (st.id === 'radius') continue;
        sum[st.id] = (sum[st.id] || 0) + st.value;
      }
    }
    const pct = (v) => 1 + (v || 0) / 100;
    return {
      hpAdd: Math.round(sum.max_hp || 0),
      speedMul: pct(sum.speed),
      dmgMul: pct(sum.damage),
      atkMul: pct(sum.attack_speed),
      pickupMul: pct(sum.pickup),
      critAdd: (sum.crit || 0) / 100,
      regenAdd: sum.regen || 0,
      xpMul: pct(sum.xp)
    };
  }

  // Заклинания от надетых посохов: [{ spell, level }]
  staffSpells(gear) {
    const out = [];
    const item = gear && gear.staff;
    if (item && item.spell) out.push({ spell: item.spell, level: item.spell_level || 1 });
    return out;
  }

  rarityOf(offer) { return this.rarById.get(offer.rarity); }

  static statText(stat, locT) {
    const names = {
      damage: locT('passive_damage'), max_hp: locT('passive_max_hp'),
      speed: locT('passive_speed'), attack_speed: locT('passive_attack_speed'),
      pickup: locT('passive_pickup_radius'), crit: locT('passive_crit_chance'),
      regen: locT('passive_hp_regen'), xp: locT('stat_xp'), radius: locT('stat_radius')
    };
    const unit = { damage: '%', speed: '%', attack_speed: '%', pickup: '%', xp: '%', crit: '', regen: '', max_hp: '', radius: '' }[stat.id] || '';
    const suffix = stat.id === 'crit' ? ' п.п.' : '';
    return '+' + stat.value + unit + suffix + ' ' + (names[stat.id] || stat.id);
  }
}
