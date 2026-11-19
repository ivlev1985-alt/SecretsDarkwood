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
    const hp = g.hero.procedural;
    if (hp !== undefined && hp !== null) {
      if (typeof hp !== 'object' || Array.isArray(hp)) {
        errors.push('game_config.hero.procedural must be an object');
      } else {
        if (hp.enabled !== undefined && typeof hp.enabled !== 'boolean') {
          errors.push('game_config.hero.procedural.enabled must be boolean');
        }
        if (hp.mode !== undefined && !['missing', 'always', 'never'].includes(hp.mode)) {
          errors.push('game_config.hero.procedural.mode must be missing|always|never');
        }
        for (const k of ['cast_duration_ms', 'death_duration_ms']) {
          if (hp[k] !== undefined && !(hp[k] >= 0)) errors.push('game_config.hero.procedural.' + k + ' must be >= 0');
        }
        for (const k of ['walk_cycles_per_sec', 'idle_cycles_per_sec']) {
          if (hp[k] !== undefined && !(hp[k] > 0)) errors.push('game_config.hero.procedural.' + k + ' must be > 0');
        }
        const nonNegative = ['frame_padding_px', 'shadow_rx', 'shadow_ry',
          'walk_bob_px', 'walk_sway_px', 'walk_boot_lift_px', 'walk_boot_stride_px',
          'walk_arm_swing_px', 'idle_bob_px', 'idle_sway_px', 'side_trail_px',
          'cast_staff_lift_px', 'cast_glow_radius', 'death_slide_px', 'death_sink_px',
          'soul_rise_px', 'soul_size'];
        for (const k of nonNegative) {
          if (hp[k] !== undefined && !(hp[k] >= 0)) {
            errors.push('game_config.hero.procedural.' + k + ' must be >= 0');
          }
        }
        for (const k of ['death_fade', 'cast_glow_alpha', 'cast_ring_alpha']) {
          if (hp[k] !== undefined && !(hp[k] >= 0 && hp[k] <= 1)) {
            errors.push('game_config.hero.procedural.' + k + ' must be 0..1');
          }
        }
      }
    }
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
    // Ближний бой (melee): монстры с movement_type chase бьют как только
    // дистанция <= melee_range, а не «внутри персонажа». Боссы — тем же полем.
    // melee_range = player.radius + enemy.radius + запас (~4-6px).
    for (const m of (b.monsters || [])) {
      if (m.melee_range !== undefined && !(m.melee_range > 0)) {
        errors.push('monster ' + m.id + ' bad melee_range (must be > 0)');
      }
      if ((m.movement_type === 'chase' || m.movement_type === 'teleport') && m.melee_range === undefined) {
        errors.push('monster ' + m.id + ' chase without melee_range (add melee_range: player.radius + enemy.radius + запас)');
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
    if (b.loot && b.loot.fade_out_ms !== undefined && !(b.loot.fade_out_ms >= 0)) {
      errors.push('loot.fade_out_ms bad');
    }
    if (b.chests && b.chests.start_chest) {
      const sc = b.chests.start_chest;
      if (sc.enabled !== undefined && typeof sc.enabled !== 'boolean') {
        errors.push('chests.start_chest.enabled must be boolean');
      }
      if (sc.enabled !== false) {
        if (!sc.type || !(b.chests.types || []).some((t) => t.id === sc.type)) {
          errors.push('chests.start_chest unknown type=' + sc.type);
        }
        if (sc.x !== undefined && !Number.isFinite(sc.x)) errors.push('chests.start_chest.x bad');
        if (sc.y !== undefined && !Number.isFinite(sc.y)) errors.push('chests.start_chest.y bad');
      }
    }

    // health_ui: полёт иконки аптечки + профиль заполнения шкалы HP
    const hu = b.health_ui;
    if (hu) {
      if (!(hu.potion_fly_speed > 0)) errors.push('health_ui.potion_fly_speed bad');
      if (!(hu.potion_fly_min_ms >= 0)) errors.push('health_ui.potion_fly_min_ms bad');
      if (!(hu.potion_fly_max_ms >= hu.potion_fly_min_ms)) errors.push('health_ui.potion_fly_max_ms bad');
      if (!(hu.fill_ms_min > 0)) errors.push('health_ui.fill_ms_min bad');
      if (!(hu.fill_ms_max >= hu.fill_ms_min)) errors.push('health_ui.fill_ms_max bad');
      for (const key of ['fill_phase_amounts', 'fill_phase_times']) {
        const arr = hu[key];
        if (!Array.isArray(arr) || arr.length !== 3 || arr.some((v) => !(v >= 0))) {
          errors.push('health_ui.' + key + ' must be 3 non-negative numbers');
        } else if (Math.abs(arr.reduce((s, v) => s + v, 0) - 1) > 0.01) {
          errors.push('health_ui.' + key + ' must sum to 1');
        }
      }
    }

    // cages: клетки с питомцем (спавн как у сундуков, анимация разрушения)
    const cages = b.cages;
    if (cages) {
      if (cages.enabled !== undefined && typeof cages.enabled !== 'boolean') errors.push('cages.enabled must be boolean');
      if (cages.enabled !== false) {
        for (const k of ['wander_radius', 'open_radius', 'cage_radius', 'break_duration_ms']) {
          if (!(cages[k] > 0)) errors.push('cages.' + k + ' bad');
        }
        if (!(cages.pet_speed >= 0)) errors.push('cages.pet_speed bad');
        if (!Array.isArray(cages.types) || !cages.types.length) errors.push('cages.types missing');
        if (cages.max_cages_on_map !== undefined && !(cages.max_cages_on_map > 0)) errors.push('cages.max_cages_on_map bad');
        if (cages.fly_away_speed !== undefined && !(cages.fly_away_speed > 0)) errors.push('cages.fly_away_speed bad');
        if (cages.fly_away_min_ms !== undefined && !(cages.fly_away_min_ms >= 0)) errors.push('cages.fly_away_min_ms bad');
        if (cages.fly_away_max_ms !== undefined && !(cages.fly_away_max_ms >= (cages.fly_away_min_ms || 0))) errors.push('cages.fly_away_max_ms bad');
        for (const t of (cages.types || [])) {
          if (!t.id) errors.push('cage type without id');
          if (!(t.drop_weight > 0)) errors.push('cage ' + t.id + ' bad drop_weight');
          if (!t.pet_template) errors.push('cage ' + t.id + ' missing pet_template');
        }
        if (cages.test_cage && cages.test_cage.enabled && !(cages.types || []).some((t) => t.id === cages.test_cage.type)) {
          errors.push('cages.test_cage unknown type=' + cages.test_cage.type);
        }
      }
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
      if (w.nova && w.nova.enabled !== false) {
        const nv = w.nova;
        if (nv.enabled !== undefined && typeof nv.enabled !== 'boolean') {
          errors.push('weapon ' + w.id + '.nova.enabled must be boolean');
        }
        for (const k of ['spawn_radius_min', 'spawn_radius_max', 'spiral_ms', 'spiral_turns',
          'release_growth', 'hyperbola_weight', 'hyperbola_bend', 'hyperbola_bend_ratio',
          'flight_curve_factor', 'flight_min_ms', 'flight_max_ms', 'trail_length']) {
          if (nv[k] !== undefined && !(nv[k] >= 0)) errors.push('weapon ' + w.id + '.nova.' + k + ' bad');
        }
        if (nv.spawn_radius_min !== undefined && nv.spawn_radius_max !== undefined && !(nv.spawn_radius_max >= nv.spawn_radius_min)) {
          errors.push('weapon ' + w.id + '.nova bad radius range');
        }
        if (nv.hyperbola_weight !== undefined && !(nv.hyperbola_weight >= 1)) {
          errors.push('weapon ' + w.id + '.nova.hyperbola_weight must be >= 1');
        }
        if (nv.flight_min_ms !== undefined && nv.flight_max_ms !== undefined && !(nv.flight_max_ms >= nv.flight_min_ms)) {
          errors.push('weapon ' + w.id + '.nova bad flight range');
        }
        if (nv.spiral_direction !== undefined && nv.spiral_direction !== 1 && nv.spiral_direction !== -1) {
          errors.push('weapon ' + w.id + '.nova.spiral_direction must be 1 or -1');
        }
      }
      if (w.area_shape !== undefined && !['circle', 'wall', 'tornado'].includes(w.area_shape)) {
        errors.push('weapon ' + w.id + ' bad area_shape (circle|wall|tornado)');
      }
      if (w.tornado_move) {
        const tm = w.tornado_move;
        for (const k of ['speed_px_per_sec', 'turn_rad_per_sec']) {
          if (tm[k] !== undefined && !Number.isFinite(tm[k])) errors.push('weapon ' + w.id + '.tornado_move.' + k + ' bad');
        }
        if (tm.speed_px_per_sec !== undefined && tm.speed_px_per_sec < 0) {
          errors.push('weapon ' + w.id + '.tornado_move.speed_px_per_sec must be >= 0');
        }
      }
      if (w.area_visual) {
        const av = w.area_visual;
        if (av.mode !== undefined && !['auto', 'procedural', 'sprite'].includes(av.mode)) {
          errors.push('weapon ' + w.id + '.area_visual.mode bad (auto|procedural|sprite)');
        }
        if (av.sprite_anchor !== undefined && !['center', 'bottom'].includes(av.sprite_anchor)) {
          errors.push('weapon ' + w.id + '.area_visual.sprite_anchor bad (center|bottom)');
        }
        for (const k of ['height_px', 'base_width_px', 'top_width_px', 'ground_offset_px',
          'silhouette_segments', 'bands', 'ribbons', 'ribbon_width_px', 'spin_speed',
          'sway_px', 'sway_speed', 'turbulence_px', 'spawn_ms', 'fade_out_ms',
          'spawn_scale', 'fade_out_scale', 'ground_ring_radius_scale', 'ground_ring_aspect',
          'sprite_size_px', 'sprite_width_px', 'sprite_height_px']) {
          if (av[k] !== undefined && !(Number.isFinite(av[k]) && av[k] >= 0)) {
            errors.push('weapon ' + w.id + '.area_visual.' + k + ' bad (>= 0)');
          }
        }
        for (const k of ['sprite_offset_y_px', 'sprite_rotation_speed']) {
          if (av[k] !== undefined && !Number.isFinite(av[k])) {
            errors.push('weapon ' + w.id + '.area_visual.' + k + ' bad');
          }
        }
        for (const k of ['alpha', 'glow_alpha', 'funnel_alpha', 'inner_alpha', 'band_alpha',
          'core_alpha', 'top_cloud_alpha', 'ribbon_alpha', 'ground_ring_alpha',
          'sprite_alpha', 'sprite_glow_alpha']) {
          if (av[k] !== undefined && !(Number.isFinite(av[k]) && av[k] >= 0 && av[k] <= 1)) {
            errors.push('weapon ' + w.id + '.area_visual.' + k + ' bad (0..1)');
          }
        }
        if (av.ground_ring !== undefined && typeof av.ground_ring !== 'boolean') {
          errors.push('weapon ' + w.id + '.area_visual.ground_ring must be boolean');
        }
        const groups = {
          lightning: ['bolts', 'chance', 'interval_ms', 'segments', 'amp_px', 'width_px',
            'glow_width_px', 'flash_alpha', 'flash_radius_px'],
          particles: ['count', 'rise_speed', 'spin_speed', 'size_px', 'alpha']
        };
        for (const [name, keys] of Object.entries(groups)) {
          const sub = av[name];
          if (!sub) continue;
          if (sub.enabled !== undefined && typeof sub.enabled !== 'boolean') {
            errors.push('weapon ' + w.id + '.area_visual.' + name + '.enabled must be boolean');
          }
          if (sub.with_sprite !== undefined && typeof sub.with_sprite !== 'boolean') {
            errors.push('weapon ' + w.id + '.area_visual.' + name + '.with_sprite must be boolean');
          }
          for (const k of keys) {
            if (sub[k] !== undefined && !(Number.isFinite(sub[k]) && sub[k] >= 0)) {
              errors.push('weapon ' + w.id + '.area_visual.' + name + '.' + k + ' bad (>= 0)');
            }
          }
          for (const k of ['chance', 'alpha', 'flash_alpha']) {
            if (sub[k] !== undefined && !(sub[k] >= 0 && sub[k] <= 1)) {
              errors.push('weapon ' + w.id + '.area_visual.' + name + '.' + k + ' bad (0..1)');
            }
          }
        }
      }
      if (typeof w.unlocked !== 'boolean') errors.push('weapon ' + w.id + ' missing unlocked:boolean');
      const fr = w.projectile_frames || w.area_frames;
      if (fr) errors.push(...ConfigLoader.validateFrames(fr, 'weapon ' + w.id));
      else if (w.type === 'to_target' || w.type === 'area') errors.push('weapon ' + w.id + ' missing projectile_frames/area_frames');
      if (!w.sprite && !w.projectile_sprite && !w.area_sprite && w.type !== 'around_player' && w.type !== 'orbit') {
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
      if (p.variability !== undefined && !(Number.isInteger(p.variability) && p.variability >= 1 && p.variability <= 16)) {
        errors.push('prop ' + p.id + ' bad variability (must be integer 1..16)');
      }
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
      // ссылки клеток на шаблоны питомцев и редкости
      if (b.cages && b.cages.enabled !== false) {
        const tplIds = new Set((items.templates || []).map((t) => t.id));
        for (const t of (b.cages.types || [])) {
          if (t.pet_template && !tplIds.has(t.pet_template)) {
            errors.push('cage ' + t.id + ' unknown pet_template=' + t.pet_template);
          }
          if (t.rarity && !rarIds.has(t.rarity)) {
            errors.push('cage ' + t.id + ' unknown rarity=' + t.rarity);
          }
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
