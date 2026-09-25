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
      if (String(m.sprite || '').includes('#')) errors.push('monster ' + m.id + ' sprite contains #');
    }

    for (const w of (s.weapons || [])) {
      if (!w.id) errors.push('weapon without id');
      if (registries && registries.weapon && !registries.weapon[w.type]) {
        errors.push('weapon ' + w.id + ' unknown type=' + w.type);
      }
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
