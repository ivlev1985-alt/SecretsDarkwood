export class ConfigLoader {
  constructor(basePath = './config/') {
    this.basePath = basePath;
  }

  stripComments(text) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  }

  async loadOne(name) {
    const res = await fetch(this.basePath + name + '.json');
    if (!res.ok) throw new Error('Не найден конфиг ' + name);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      try {
        return JSON.parse(this.stripComments(text));
      } catch (e2) {
        throw new Error('Битый JSON ' + name + ': ' + e2.message);
      }
    }
  }

  async loadAll(names) {
    const out = {};
    for (const n of names) out[n] = await this.loadOne(n);
    return out;
  }

  // Чистая функция валидации — тестируется в node без DOM.
  // movementTypes / weaponTypes / effectTypes передаются из Game (реестры).
  static validateAll(cfg, registries) {
    const errors = [];
    const g = cfg.game_config, b = cfg.balance_config, s = cfg.skills_config;
    const e = cfg.effects_config, ui = cfg.ui_config, shop = cfg.shop_config;

    if (!g) errors.push('missing game_config');
    if (!b) errors.push('missing balance_config');
    if (!s) errors.push('missing skills_config');
    if (errors.length) return errors;

    if (!g.hero || !g.hero.frames) errors.push('game_config.hero.frames missing');
    else errors.push(...ConfigLoader.validateFrames(g.hero.frames, 'hero'));

    if (!g.hero.sprite) errors.push('game_config.hero.sprite missing');
    if (!g.camera || typeof g.camera.follow_speed !== 'number') errors.push('game_config.camera.follow_speed missing');

    for (const m of (b.monsters || [])) {
      if (!m.id) errors.push('monster without id');
      if (!m.frames) errors.push('monster ' + (m.id || '?') + ' missing frames');
      else errors.push(...ConfigLoader.validateFrames(m.frames, 'monster ' + m.id));
      if (!m.sprite) errors.push('monster ' + m.id + ' missing sprite');
      if (m.projectile_id) {
        const found = (s.enemy_projectiles || []).some((p) => p.id === m.projectile_id);
        if (!found) errors.push('monster ' + m.id + ' unknown projectile_id=' + m.projectile_id);
      }
      if (registries && registries.movement && !registries.movement[m.movement_type]) {
        errors.push('monster ' + m.id + ' unknown movement_type=' + m.movement_type);
      }
      // Боссы: паттерн + параметры рывка/залпа (всё из конфига, код не трогаем)
        if (m.is_boss) {
          const pat = m.boss_pattern || 'shooter';
          if (!['shooter', 'dasher', 'shooter_volley'].includes(pat)) {
            errors.push('monster ' + m.id + ' bad boss_pattern=' + pat);
          }
          if (m.boss_order_min !== undefined && !(m.boss_order_min >= 1)) {
            errors.push('monster ' + m.id + ' bad boss_order_min (must be >= 1)');
          }
          if (m.dash !== undefined) {
            const d = m.dash;
            for (const k of ['telegraph_ms', 'charge_ms', 'duration_ms', 'cooldown_ms']) {
              if (!(d[k] >= 0)) errors.push('monster ' + m.id + ' bad dash.' + k);
            }
            if (!(d.speed_mul > 1)) errors.push('monster ' + m.id + ' bad dash.speed_mul (must be > 1)');
            if (!(d.contact_mul >= 1)) errors.push('monster ' + m.id + ' bad dash.contact_mul (must be >= 1)');
            if (!(d.range > 0)) errors.push('monster ' + m.id + ' bad dash.range');
            if (!(d.hit_radius > 0)) errors.push('monster ' + m.id + ' bad dash.hit_radius');
            if (d.strike_at_end !== undefined && typeof d.strike_at_end !== 'boolean') {
              errors.push('monster ' + m.id + ' bad dash.strike_at_end (must be boolean)');
            }
          }
          if (m.volley !== undefined) {
            if (!(m.volley.count >= 1)) errors.push('monster ' + m.id + ' bad volley.count');
            if (!(m.volley.spread_deg >= 0)) errors.push('monster ' + m.id + ' bad volley.spread_deg');
            if (!(m.volley.cooldown_ms > 0)) errors.push('monster ' + m.id + ' bad volley.cooldown_ms');
            if (m.volley.damage_mul !== undefined && !(m.volley.damage_mul > 0)) {
              errors.push('monster ' + m.id + ' bad volley.damage_mul (must be > 0)');
            }
          }
        if (pat === 'dasher' && !m.dash) errors.push('monster ' + m.id + ' dasher needs dash{}');
        if (pat === 'shooter_volley' && (!m.volley || !m.dash)) {
          errors.push('monster ' + m.id + ' shooter_volley needs volley{} + dash{}');
        }
      }
      if (String(m.sprite || '').includes('#')) errors.push('monster ' + m.id + ' sprite contains #');
    }

    const st = (b.status_effects || {});
    if (st.slow) {
      if (!(st.slow.default_factor > 0 && st.slow.default_factor < 1)) errors.push('status_effects.slow.default_factor must be 0..1');
      if (!(st.slow.default_duration_ms > 0)) errors.push('status_effects.slow.default_duration_ms missing');
      if (typeof st.slow.tint !== 'string') errors.push('status_effects.slow.tint missing');
    }
    if (st.burn) {
      if (!(st.burn.default_dps > 0)) errors.push('status_effects.burn.default_dps missing');
      if (!(st.burn.default_duration_ms > 0)) errors.push('status_effects.burn.default_duration_ms missing');
      if (!(st.burn.tick_ms > 0)) errors.push('status_effects.burn.tick_ms missing');
      if (typeof st.burn.tint !== 'string') errors.push('status_effects.burn.tint missing');
    }
    if (st.particle_budget !== undefined && !(st.particle_budget >= 16)) errors.push('status_effects.particle_budget must be >= 16');
    for (const key of ['slow', 'burn']) {
      const ps = st[key] && st[key].particles;
      if (!ps) continue;
      if (typeof ps.enabled !== 'boolean') errors.push('status_effects.' + key + '.particles.enabled must be boolean');
      if (!(ps.emission_per_sec >= 0)) errors.push('status_effects.' + key + '.particles bad emission_per_sec');
      if (!(ps.size > 0)) errors.push('status_effects.' + key + '.particles bad size');
      if (!(ps.life_ms > 0)) errors.push('status_effects.' + key + '.particles bad life_ms');
      for (const vk of ['vx', 'vy']) {
        if (!Array.isArray(ps[vk]) || ps[vk].length !== 2 || !(ps[vk][0] <= ps[vk][1])) {
          errors.push('status_effects.' + key + '.particles bad ' + vk + ' range');
        }
      }
      if (!Array.isArray(ps.colors) || !ps.colors.length) errors.push('status_effects.' + key + '.particles.colors missing');
    }
    for (const m of (b.monsters || [])) {
      for (const k of ['slow_resist', 'burn_resist']) {
        if (m[k] !== undefined && !(m[k] >= 0 && m[k] <= 0.95)) errors.push('monster ' + m.id + ' bad ' + k);
      }
    }
    if (b.chests && b.chests.loot_scatter) {
      const ls = b.chests.loot_scatter;
      if (!(ls.scatter_speed_min >= 0) || !(ls.scatter_speed_max >= ls.scatter_speed_min)) errors.push('chests.loot_scatter bad speeds');
      if (!(ls.coin_value_per_pickup > 0)) errors.push('chests.loot_scatter.coin_value_per_pickup missing');
      if (!(ls.max_coin_pickups > 0)) errors.push('chests.loot_scatter.max_coin_pickups missing');
    }
    if (b.chests && b.chests.open_hold_ms !== undefined && !(b.chests.open_hold_ms >= 0)) {
      errors.push('chests.open_hold_ms bad');
    }

    for (const w of (s.weapons || [])) {
      if (!w.id) errors.push('weapon without id');
      if (registries && registries.weapon && !registries.weapon[w.type]) {
        errors.push('weapon ' + w.id + ' unknown type=' + w.type);
      }
      if (w.targeting !== undefined && w.targeting !== 'nearest' && w.targeting !== 'random') errors.push('weapon ' + w.id + ' bad targeting (nearest|random)');
      if (w.chain_range !== undefined && !(w.chain_range > 0)) errors.push('weapon ' + w.id + ' bad chain_range');
      if (w.slow_factor !== undefined && !(w.slow_factor > 0 && w.slow_factor < 1)) errors.push('weapon ' + w.id + ' bad slow_factor (0..1)');
      if (w.slow_duration_ms !== undefined && !(w.slow_duration_ms > 0)) errors.push('weapon ' + w.id + ' bad slow_duration_ms');
      if (w.burn_dps !== undefined && !(w.burn_dps > 0)) errors.push('weapon ' + w.id + ' bad burn_dps');
      if (w.burn_duration_ms !== undefined && !(w.burn_duration_ms > 0)) errors.push('weapon ' + w.id + ' bad burn_duration_ms');
      if (typeof w.unlocked !== 'boolean') errors.push('weapon ' + w.id + ' missing unlocked:boolean');
      const fr = w.projectile_frames || w.area_frames;
      if (fr) errors.push(...ConfigLoader.validateFrames(fr, 'weapon ' + w.id));
      else if (w.type === 'to_target' || w.type === 'area') errors.push('weapon ' + w.id + ' missing projectile_frames/area_frames');
      if (!w.sprite && !w.projectile_sprite && !w.area_sprite && w.type !== 'around_player') {
        errors.push('weapon ' + w.id + ' missing sprite');
      }
    }
    for (const p of (s.enemy_projectiles || [])) {
      if (!p.frames) errors.push('enemy_projectile ' + p.id + ' missing frames');
      else errors.push(...ConfigLoader.validateFrames(p.frames, 'enemy_projectile ' + p.id));
    }

    for (const fx of ((e && e.effects) || [])) {
      if (!fx.frames) errors.push('effect ' + fx.id + ' missing frames');
      else errors.push(...ConfigLoader.validateFrames(fx.frames, 'effect ' + fx.id));
      if (registries && registries.effect && fx.behavior && !registries.effect[fx.behavior]) {
        errors.push('effect ' + fx.id + ' unknown behavior=' + fx.behavior);
      }
    }

    for (const p of (b.environment_props || [])) {
      if (String(p.sprite || '').includes('#')) errors.push('prop ' + p.id + ' sprite contains # (must be fixed)');
      if (!p.frames) errors.push('prop ' + p.id + ' missing frames');
      else errors.push(...ConfigLoader.validateFrames(p.frames, 'prop ' + p.id));
    }

    for (const c of (((b.chests || {}).types) || [])) {
      if (!c.frames) errors.push('chest ' + c.id + ' missing frames');
      else errors.push(...ConfigLoader.validateFrames(c.frames, 'chest ' + c.id));
      if (registries && registries.chest && c.reward_type && !registries.chest[c.reward_type]) {
        errors.push('chest ' + c.id + ' unknown reward_type=' + c.reward_type);
      }
    }

    for (const t of ((shop && shop.items) || []).map((i) => i.target)) {
      // legacy shop_config (характеристики/разблокировки) — удалён, проверка пропущена
      void t;
    }

    // items_config: шаблоны ссылаются на слоты/редкости/статы/заклинания
    const items = cfg.items_config;
    if (!items) errors.push('missing items_config');
    else {
      const slotIds = new Set((items.slots || []).map((s) => s.id));
      const rarIds = new Set((items.rarities || []).map((r) => r.id));
      const statIds = new Set(Object.keys(items.stats || {}));
      const weaponIds = new Set((s.weapons || []).map((w) => w.id));
      for (const tp of (items.templates || [])) {
        if (!slotIds.has(tp.slot)) errors.push('item template ' + tp.id + ' unknown slot=' + tp.slot);
        if (!tp.name_key) errors.push('item template ' + tp.id + ' missing name_key');
        if (tp.slot === 'staff' && !weaponIds.has(tp.spell)) errors.push('staff ' + tp.id + ' unknown spell=' + tp.spell);
        if (tp.slot === 'pet' && !(tp.base_radius > 0)) errors.push('pet ' + tp.id + ' missing base_radius');
      }
      for (const sl of (items.slots || [])) {
        if (sl.fixed_stat && !statIds.has(sl.fixed_stat)) errors.push('slot ' + sl.id + ' unknown fixed_stat=' + sl.fixed_stat);
      }
      for (const r of (items.rarities || [])) {
        if (!(r.stats_count > 0)) errors.push('rarity ' + r.id + ' bad stats_count');
        if (!(r.weight > 0)) errors.push('rarity ' + r.id + ' bad weight');
      }
      for (const [sid, def] of Object.entries(items.stats || {})) {
        if (sid === 'radius') continue;
        for (const r of (items.rarities || [])) {
          const range = def.ranges && def.ranges[r.id];
          if (!range || !(range[0] <= range[1])) errors.push('stat ' + sid + ' bad range for ' + r.id);
        }
      }
    }

    if (!ui || !ui.buttons || !ui.panels || !ui.icons) errors.push('ui_config missing buttons/panels/icons');
    return errors;
  }

  static validateFrames(frames, label) {
    const errs = [];
    if (!frames || typeof frames !== 'object') return [label + ': frames not an object'];
    if (!(frames.frame_width > 0) || !(frames.frame_height > 0)) errs.push(label + ': bad frame_width/height');
    if (!(frames.columns > 0)) errs.push(label + ': bad columns');
    if (!frames.animations || typeof frames.animations !== 'object') errs.push(label + ': missing animations');
    else {
      for (const [name, a] of Object.entries(frames.animations)) {
        if (!(a.frames > 0)) errs.push(label + '.' + name + ': bad frames count');
        if (!(a.row >= 0)) errs.push(label + '.' + name + ': bad row');
        if (!(a.fps > 0)) errs.push(label + '.' + name + ': bad fps');
        if (typeof a.loop !== 'boolean') errs.push(label + '.' + name + ': loop must be boolean');
      }
    }
    return errs;
  }

  // Локализация с fallback: lang -> en -> ru -> key
  static t(localizationCfg, lang, key, params) {
    const table = localizationCfg || {};
    let s = (table[lang] && table[lang][key]) ?? (table.en && table.en[key]) ?? (table.ru && table.ru[key]) ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = String(s).replace('{' + k + '}', String(v));
    return s;
  }
}
