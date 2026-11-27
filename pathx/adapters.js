// ⚠️ ПЕРЕД ЛЮБЫМИ ПРАВКАМИ ПРОЧТИ pathx/README.md — там архитектура утилиты,
// правила независимости от игры и известные особенности рендереров (§4).
//
// PathX — адаптеры сущностей под конкретные рендереры.
//
// Каждый draw() в игре ждёт объект со своими полями. Здесь собраны фабрики
// «подделок», достаточных, чтобы draw() отработал так же, как в бою.
//
// Плюс симуляция (step): у снаряда есть хвост по истории позиций, у взрыва —
// p.life, у торнадо/стены — возраст.

const TAU = Math.PI * 2;

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function dirVec(dir) {
  switch (dir) {
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'up-right': return { x: 0.7071, y: -0.7071 };
    case 'down-right': return { x: 0.7071, y: 0.7071 };
    case 'up-left': return { x: -0.7071, y: -0.7071 };
    case 'down-left': return { x: -0.7071, y: 0.7071 };
    default: return { x: 1, y: 0 };
  }
}

function facing(dir) {
  return dir === 'left' || dir === 'up-left' || dir === 'down-left' ? -1 : 1;
}

// ===================== ПЕРСОНАЖИ =====================

export function makeHero(state, dir) {
  return {
    x: 0, y: 0,
    facing: facing(dir),
    heroDir: dir,
    moving: state === 'walk',
    alive: state !== 'death',
    castT: state === 'cast' ? 0.22 : (state === 'cast_crit' ? 0.2 : 0),
    castCrit: state === 'cast_crit',
    deathT: state === 'death' ? 0.45 : 0,
    hitFlash: 0,
    tilt: 0,
    castDuration: 0.43,
    deathDuration: 1.1
  };
}

export function makeSkeleton(state, dir) {
  return {
    x: 0, y: 0,
    facing: facing(dir),
    heroDir: dir,
    visualMoving: state === 'walk',
    alive: state !== 'death',
    shootT: state === 'shoot' ? 0.13 : (state === 'aim' ? 0.33 : 0),
    shootDuration: 0.6,
    attackCd: state === 'aim' ? 0.18 : 0,
    deathT: state === 'death' ? 0.5 : 0,
    deathDuration: 1.5,
    hitFlash: 0,
    tilt: 0,
    _skelSeed: 12345
  };
}

// ===================== СНАРЯДЫ =====================

function projectileBase(state, dir, speed, explodingStates) {
  const v = dirVec(dir);
  const exploding = explodingStates.includes(state);
  return {
    x: 0, y: 0,
    vx: v.x * speed,
    vy: v.y * speed,
    life: 0,
    // Для взрывных фаз maxLife обязан быть конечным: рендереры считают
    // k = life/maxLife (fireball сам поднимает его до boom_life_ms через
    // Math.max). С 1e9 взрыв навсегда замирает на k≈0.
    maxLife: exploding ? 0.3 : 1e9,
    exploding,
    spritePath: null
  };
}

export function makeFireball(state, dir) {
  const p = projectileBase(state, dir, 190, ['exploding']);
  p.radius = 12;
  p._fbTrail = [];
  p._fbBoomScaled = false;
  return p;
}

export function makeBolt(state, dir) {
  const p = projectileBase(state, dir, 260, ['impact']);
  p.radius = 6;
  p.weaponId = 'magic_bolt';
  p._mbTrail = [];
  return p;
}

export function makeNova(state, dir) {
  const p = projectileBase(state, dir, 200, ['nova']);
  p.radius = 7;
  p.weaponId = 'arcane_nova';
  p.nova = true;
  p.trail = [];
  return p;
}

// ===================== ЗОНЫ =====================

export function makeTornado(state, visual, weaponCfg) {
  const spawnMs = visual.spawn_ms ?? 260;
  const fadeMs = visual.fade_out_ms ?? 900;
  const ttlMs = weaponCfg?.area_duration_ms ?? 5000;
  // ВНИМАНИЕ: TornadoRenderer._life сравнивает ttl с fade_out_ms в
  // МИЛИСЕКУНДАХ, а age — в секундах. Единицы путать нельзя.
  let age, ttl;
  if (state === 'spawn') { age = spawnMs * 0.4 / 1000; ttl = ttlMs; }
  else if (state === 'fading') { age = 2.2; ttl = fadeMs * 0.3; }
  else { age = 2.2; ttl = ttlMs; }

  // Кэш позы ломает предпросмотр (квантование возраста). 0 давать нельзя —
  // деление на fps даст NaN; завышаем, чтобы кэш обновлялся каждый кадр.
  const vis = { ...visual, cache_fps: 240 };

  const mv = weaponCfg?.tornado_move || {};
  return {
    x: 0, y: 0,
    age,
    ttl,
    radius: weaponCfg?.area_radius ?? 120,
    seed: 4271,
    visual: vis,
    spritePath: null,
    move: {
      angle: -0.4,
      speed: mv.speed_px_per_sec ?? 44,
      turn: mv.turn_rad_per_sec ?? 0.2
    },
    cfg: { area_visual: vis }
  };
}

export function makeWall(state, visual, weaponCfg) {
  const n = weaponCfg?.flame_count_per_side ?? 3;
  const spacing = weaponCfg?.flame_spacing ?? 48;
  const spawnMs = weaponCfg?.flame_spawn_speed_ms ?? 100;
  const ttlMs = weaponCfg?.area_duration_ms ?? 4000;

  const flames = [];
  for (let i = -n; i <= n; i++) {
    const dying = state === 'dying';
    flames.push({
      x: i * spacing, y: 0,
      spawnT: Math.abs(i),
      alive: state !== 'spawning' || i === 0,
      dying,
      dead: false,
      dieT: dying ? spawnMs * 0.25 : 0,
      frame: 0,
      animT: 0
    });
  }

  return {
    x: 0, y: 0,
    spritePath: null,
    wall: {
      flames,
      spawnMs,
      size: weaponCfg?.flame_size ?? 128,
      hitbox: weaponCfg?.flame_hitbox ?? 96,
      angle: 0,
      totalLen: n * 2 * spacing,
      halfLen: n * spacing,
      age: state === 'spawning' ? spawnMs * 0.35 : ttlMs * 0.5,
      dying: state === 'dying',
      dieAge: state === 'dying' ? spawnMs * 0.4 : 0,
      done: false
    },
    cfg: { area_visual: visual }
  };
}

// ===================== ОРБИТА (frost_ring) =====================
// FrostRingRenderer.draw(ctx, weaponsMap, ...) читает:
//   st.active !== false, st.cfg.type === 'orbit', st.level > 0,
//   st.orbs[{angle,far,dir,spin,r}], st.orbSprites (может быть null),
//   st.orbSpin, st.player, st.cfg.{orbit_*, seed, color, ...}

export function makeFrostRing(visualCfg, weaponCfg) {
  const nearR = weaponCfg?.orbit_near_radius ?? 70;
  const farR = weaponCfg?.orbit_far_radius ?? 120;
  const count = 4;

  const orbs = [];
  for (let i = 0; i < count; i++) {
    const far = i >= count / 2;
    const angle = (i / count) * TAU;
    const r = far ? 11 : 9;
    orbs.push({
      angle,
      far,
      dir: i % 2 === 0 ? 1 : -1,
      spin: i * 1.5,
      r,
      x: Math.cos(angle) * (far ? farR : nearR),
      y: Math.sin(angle) * (far ? farR : nearR),
      orbitR: far ? farR : nearR,
      vx: 0, vy: 0
    });
  }

  // st.cfg — конфиг ОРУЖИЯ (skills_config), а не visuals-секция.
  // Но FrostRingRenderer.draw читает cfg.enabled/cfg.mode из visuals-секции.
  // Копируем их сюда.
  const stCfg = {
    ...weaponCfg,
    type: 'orbit',
    seed: 7,
    enabled: visualCfg?.enabled !== false,
    mode: visualCfg?.mode || 'always',
    color: visualCfg?.color || '#9fe8ff',
    core_color: visualCfg?.core_color || '#eaffff',
    edge_color: visualCfg?.edge_color || '#2a7fff',
    shard_scale: visualCfg?.shard_scale ?? 1,
    glow_scale: visualCfg?.glow_scale ?? 2.6,
    trail_segments: visualCfg?.trail_segments ?? 14
  };

  const map = new Map();
  map.set('frost_ring', {
    active: true,
    level: 1,
    cfg: stCfg,
    orbs,
    orbSprites: null,
    orbSpin: orbs.map((o) => o.spin),
    player: { x: 0, y: 0 }
  });
  return map;
}

// ===================== МОЛНИЯ =====================
// Молнию рисует SkillSystem.drawLightning. Импортировать сам класс в утилиту
// можно, но он тянет Projectile/Pool — проще повторить его проход отрисовки
// строго по тем же полям конфига. Внешний вид совпадает.

export function makeLightningScene(visualCfg, dir) {
  const C = visualCfg || {};
  const n = Math.max(3, Math.floor(C.bolt_segments ?? 7));
  const amp = Math.max(1, C.bolt_amp_px ?? 9);
  const coreW = Math.max(0.7, C.bolt_width_px ?? 1.6);
  const glowW = Math.max(coreW, C.bolt_glow_width_px ?? 5.5);
  const len = 190;
  const v = dir === 'vertical' ? { x: 0, y: 1 }
    : dir === 'diagonal' ? { x: 0.7071, y: 0.7071 }
      : { x: 1, y: 0 };

  const fx = {
    x1: -v.x * len / 2 - v.y * 26,
    y1: -v.y * len / 2 + v.x * 26,
    x2: v.x * len / 2 - v.y * 26,
    y2: v.y * len / 2 + v.x * 26,
    t: 0.22, max: 0.22, seed: 1234.5
  };

  const boltPoints = (f, seed) => {
    const pts = [];
    const dx = f.x2 - f.x1, dy = f.y2 - f.y1;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = (i === 0 || i === n) ? 0 : (hash(seed + i * 13.7) - 0.5) * 2 * amp;
      pts.push({ x: f.x1 + dx * t + nx * off, y: f.y1 + dy * t + ny * off });
    }
    return pts;
  };

  return {
    cfg: C,
    draw(ctx, time) {
      const tick = Math.floor((time || 0) * 30);
      const k = 1;
      const seed = fx.seed + tick;
      const pts = boltPoints(fx, seed);
      const ptsOff = boltPoints(fx, seed + 9999);
      const stroke = (list) => {
        ctx.beginPath();
        ctx.moveTo(list[0].x, list[0].y);
        for (let i = 1; i < list.length; i++) ctx.lineTo(list[i].x, list[i].y);
        ctx.stroke();
      };

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.globalAlpha = k * 0.22;
      ctx.strokeStyle = C.glow_color || '#2fa8ff';
      ctx.lineWidth = glowW;
      stroke(pts);

      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = C.trail_color || '#8fe8ff';
      ctx.lineWidth = coreW;
      stroke(pts);

      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = C.core_color || '#f2ffff';
      ctx.lineWidth = Math.max(0.35, coreW * 0.45);
      stroke(pts);

      const branches = Math.max(1, Math.floor((C.spark_count ?? 6) / 2));
      for (let i = 0; i < branches; i++) {
        const idx = 1 + ((i * 3 + Math.floor(seed)) % Math.max(1, pts.length - 2));
        const pt = pts[idx];
        const ang = hash(seed + i * 7.7) * TAU;
        const blen = (C.branch_length_px ?? 12) * (0.45 + hash(seed + i * 3.1) * 0.8);
        ctx.globalAlpha = k * (0.22 + hash(seed + i) * 0.3);
        ctx.strokeStyle = C.trail_color || '#8fe8ff';
        ctx.lineWidth = Math.max(0.4, coreW * 0.55);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x + Math.cos(ang) * blen, pt.y + Math.sin(ang) * blen);
        ctx.stroke();
      }

      ctx.globalAlpha = k * 0.75;
      ctx.strokeStyle = C.yellow_color || '#ffee66';
      ctx.lineWidth = coreW * 0.85;
      stroke(ptsOff);

      ctx.globalAlpha = k * 0.65;
      ctx.strokeStyle = C.yellow_color || '#ffee66';
      ctx.lineWidth = Math.max(0.35, coreW * 0.4);
      stroke(ptsOff);

      ctx.restore();
    }
  };
}

// ===================== ТИК =====================

export function stepEntity(entry, e, dt) {
  if (!e) return;

  // Персонажи: таймеры в игре — «остаток» анимации, они убывают к 0.
  // Каст/выстрел в превью зацикливаем, смерть — проигрывается один раз.
  if (entry.entity === 'hero') {
    if (e.castT > 0) {
      e.castT = Math.max(0, e.castT - dt);
      if (e.castT === 0) e.castT = e.castDuration; // луп каста
    }
    if (e.deathT > 0) e.deathT = Math.max(0, e.deathT - dt);
    return;
  }

  if (entry.entity === 'skeleton') {
    if (e.shootT > 0) {
      e.shootT = Math.max(0, e.shootT - dt);
      if (e.shootT === 0) e.shootT = e.shootDuration; // луп выстрела
    }
    if (e.attackCd > 0) e.attackCd = Math.max(0, e.attackCd - dt);
    if (e.deathT > 0) e.deathT = Math.max(0, e.deathT - dt);
    return;
  }

  // Орбиты frost_ring двигает SkillSystem в игре; здесь повторяем его модель:
  // угол растёт по dir, радиус «дышит», кристалл крутится вокруг своей оси.
  if (entry.entity === 'frost_ring') {
    const st = e.get('frost_ring');
    if (!st) return;
    const c = st.cfg;
    const nearR = c.orbit_near_radius ?? 70;
    const farR = c.orbit_far_radius ?? 120;
    const periodNear = c.orbit_period_sec ?? 4;
    const periodFar = c.orbit_far_period_sec ?? 5;
    st.orbTime = (st.orbTime || 0) + dt;
    for (const o of st.orbs) {
      const base = o.far ? farR : nearR;
      const period = o.far ? periodFar : periodNear;
      o.angle += o.dir * (TAU / Math.max(0.5, period)) * dt;
      // «дыхание» орбиты + пульсация скорости вращения (как в игре)
      const breath = 1 + 0.07 * Math.sin(st.orbTime * 1.3 + o.angle * 0.5);
      o.orbitR = base * breath;
      o.spin += dt * (2.2 + Math.sin(st.orbTime * 2 + o.angle) * 0.9) * o.dir;
      const px = o.x, py = o.y;
      o.x = Math.cos(o.angle) * o.orbitR;
      o.y = Math.sin(o.angle) * o.orbitR;
      o.vx = o.x - px; o.vy = o.y - py;
    }
    return;
  }

  if (entry.entity === 'tornado') {
    e.age += dt;
    const m = e.move;
    if (m) {
      m.angle += (m.turn || 0) * dt;
      e.x += Math.cos(m.angle) * (m.speed || 0) * dt;
      e.y += Math.sin(m.angle) * (m.speed || 0) * dt;
    }
    return;
  }

  if (entry.entity === 'wall') {
    // Порт SkillSystem._updateWall: появление от центра к краям, ttl,
    // затем угасание от краёв к центру + смена кадров атласа.
    const w = e.wall;
    const ms = dt * 1000;
    const n = Math.max(...w.flames.map((f) => f.spawnT)) || 3;
    if (!w.dying) {
      w.age += ms;
      for (const f of w.flames) {
        if (!f.alive && w.age >= f.spawnT * w.spawnMs) f.alive = true;
      }
      if (w.age >= e.ttl) { w.dying = true; w.dieAge = 0; }
    } else {
      w.dieAge += ms;
      for (const f of w.flames) {
        if (!f.dying && w.dieAge >= (n - f.spawnT) * w.spawnMs) f.dying = true;
        if (f.dying) {
          f.dieT = (f.dieT || 0) + ms;
          if (f.dieT >= w.spawnMs) f.dead = true;
        }
      }
      if (w.flames.every((f) => f.dead)) w.done = true;
    }
    for (const f of w.flames) {
      if (!f.alive || f.dead) continue;
      f.animT += dt;
      if (f.animT >= 1 / 12) { f.animT -= 1 / 12; f.frame = Math.floor(Math.random() * 18); }
    }
    return;
  }

  if (entry.entity === 'fireball' || entry.entity === 'bolt' || entry.entity === 'nova') {
    e.life += dt;
    if (!e.exploding) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      wrapProjectile(entry, e);
    }
    return;
  }
}

// «Тор»-обёртка: снаряд, вылетевший за кадр, возвращается с противоположной
// стороны. Хвост (история позиций) сдвигаем вместе с снарядом, иначе он
// растянется через весь экран.
function wrapProjectile(entry, e) {
  const R = (entry.extent || 200) * 0.75;
  let dx = 0, dy = 0;
  if (e.x > R) dx = -2 * R; else if (e.x < -R) dx = 2 * R;
  if (e.y > R) dy = -2 * R; else if (e.y < -R) dy = 2 * R;
  if (!dx && !dy) return;
  e.x += dx;
  e.y += dy;
  for (const key of ['_fbTrail', '_mbTrail', 'trail']) {
    const tr = e[key];
    if (Array.isArray(tr)) for (const p of tr) { p.x += dx; p.y += dy; }
  }
}

// Стартовое смещение: снаряд входит в кадр уже с набранным хвостом.
export function prepareEntity(entry, e) {
  if (!e || e.exploding) return;
  if (e.vx === undefined) return;
  const sp = Math.hypot(e.vx, e.vy) || 1;
  e.x = -(e.vx / sp) * 52;
  e.y = -(e.vy / sp) * 52;
}