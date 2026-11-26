// ⚠️ ПЕРЕД ЛЮБЫМИ ПРАВКАМИ ПРОЧТИ pathx/README.md — там архитектура утилиты,
// правила независимости от игры и известные особенности рендереров (§4).
//
// PathX — реестр процедурных «моделек» игры.
//
// Запись описывает рендерер и то, КАК его правильно вызвать. Все
// расхождения API собраны здесь, а не размазаны по утилите.
//
//   ctor: 'section' — new Renderer(cfg), cfg = секция конфига
//   ctor: 'visuals' — new Renderer({ [visualKey]: cfg }), т.к. рендерер
//                     сам читает this.visuals[...] (MagicProjectile, FireWall)
//
//   draw: 'entity'  — draw(ctx, entity, time, 4-й арг)
//   draw: 'weapons' — draw(ctx, Map<id,state>, time, assets) (FrostRing)
//   draw: 'skill'   — рисует система, не рендерер (lightning_chain)
//
//   extent — сколько пикселей мира должно влезть в кадр по ширине.
//            По нему считается zoom = canvasSize / extent.

export const PROCEDURAL = [
  {
    id: 'hero_mage',
    label: 'Маг-герой',
    type: 'hero',
    module: '../js/render/HeroMageRenderer.js',
    cls: 'HeroMageRenderer',
    ctor: 'section',
    cfgFile: 'game_config',
    cfgPath: 'hero.procedural',
    draw: 'entity',
    entity: 'hero',
    extent: 122,
    force: { cache_fps: 240 },
    states: ['idle', 'walk', 'cast', 'cast_crit', 'death'],
    dirs: ['down', 'up', 'left', 'right'],
    desc: 'Векторный маг: роба, загнутая шляпа, посох с кристаллом. idle — дыхание; walk — шаг с пылью из-под ног; cast — подъём посоха, кольцо на земле, свечение кристалла; cast_crit — золотая вспышка; death — падение с растворением и поднимающейся душой. 4 направления, зеркалирование по X.'
  },
  {
    id: 'skeleton_archer',
    label: 'Скелет-лучник',
    type: 'monster',
    module: '../js/render/SkeletonArcherRenderer.js',
    cls: 'SkeletonArcherRenderer',
    ctor: 'section',
    cfgFile: 'game_config',
    cfgPath: 'visuals.skeleton_archer',
    draw: 'entity',
    entity: 'skeleton',
    extent: 126,
    force: { cache_fps: 240 },
    states: ['idle', 'walk', 'aim', 'shoot', 'death'],
    dirs: ['down', 'up', 'left', 'right'],
    desc: 'Скелет в рваном капюшоне с костяным луком и колчаном. idle — дыхание и поворот головы; walk — походка с пылью; aim — натяжение тетивы; shoot — вспышка выстрела; death — рассыпание на кости с физикой разлёта.'
  },
  {
    id: 'fireball',
    label: 'Огненный шар',
    type: 'projectile',
    module: '../js/render/FireballRenderer.js',
    cls: 'FireballRenderer',
    ctor: 'section',
    cfgFile: 'game_config',
    cfgPath: 'visuals.fireball',
    draw: 'entity',
    entity: 'fireball',
    extent: 280,
    states: ['flying', 'exploding'],
    dirs: ['right', 'left', 'up-right', 'down-right'],
    desc: 'Огненный снаряд: двухслойный шар, извивающийся хвост, дым и искры. exploding — эллиптическая ударная волна 2:1 с тремя вторичными хлопками и разлётом частиц.'
  },
  {
    id: 'magic_bolt',
    label: 'Магический снаряд',
    type: 'projectile',
    module: '../js/render/MagicProjectileRenderer.js',
    cls: 'MagicProjectileRenderer',
    ctor: 'visuals',
    visualKey: 'magic_bolt',
    cfgFile: 'game_config',
    cfgPath: 'visuals.magic_bolt',
    draw: 'entity',
    entity: 'bolt',
    extent: 150,
    states: ['flying', 'impact'],
    dirs: ['right', 'left', 'up-right', 'down-right'],
    desc: 'Вытянутое фиолетовое ядро с пульсацией и двойным хвостом (широкое свечение + яркая сердцевина). impact — вспышка, два расходящихся кольца и 14 искр.'
  },
  {
    id: 'arcane_nova',
    label: 'Тайная нова',
    type: 'projectile',
    module: '../js/render/MagicProjectileRenderer.js',
    cls: 'MagicProjectileRenderer',
    ctor: 'visuals',
    visualKey: 'arcane_nova',
    cfgFile: 'game_config',
    cfgPath: 'visuals.arcane_nova',
    draw: 'entity',
    entity: 'nova',
    extent: 170,
    states: ['flying', 'nova'],
    dirs: ['right', 'left', 'up-right', 'down-right'],
    desc: 'Снаряд с трёхслойным светящимся шлейфом-лентой. nova — расширяющаяся сфера-волна с ярким фронтом и вращающимся ореолом.'
  },
  {
    id: 'lightning_chain',
    label: 'Цепная молния',
    type: 'projectile',
    module: '../js/systems/SkillSystem.js',
    cls: 'SkillSystem',
    ctor: 'none',
    cfgFile: 'game_config',
    cfgPath: 'visuals.lightning_chain',
    draw: 'skill',
    extent: 250,
    states: ['arc'],
    dirs: ['horizontal', 'vertical', 'diagonal'],
    desc: 'Молнию рисует не рендерер снаряда, а SkillSystem.drawLightning: два провода (синий + жёлтый) со смещением, короткие ветки и белая сердцевина. Снаряд в полёте невидим, в кадре показан разряд между двумя точками.'
  },
  {
    id: 'frost_ring',
    label: 'Кольцо холода',
    type: 'projectile',
    module: '../js/render/FrostRingRenderer.js',
    cls: 'FrostRingRenderer',
    ctor: 'section',
    cfgFile: 'game_config',
    cfgPath: 'visuals.frost_ring',
    draw: 'weapons',
    weaponFile: 'skills_config',
    weaponPath: 'weapons',
    weaponPick: 'frost_ring',
    extent: 300,
    states: ['orbit'],
    dirs: [],
    desc: 'Ледяные осколки летают вокруг мага на двух орбитах. Каждый кристалл — уникально сгенерированная форма с гранями и бликом; орбиты «дышат» по радиусу, осколки пульсируют скоростью и меняют направление вращения.'
  },
  {
    id: 'tornado',
    label: 'Смерч',
    type: 'area',
    module: '../js/render/TornadoRenderer.js',
    cls: 'TornadoRenderer',
    ctor: 'section',
    cfgFile: 'skills_config',
    cfgPath: 'weapons',
    cfgPick: 'tornado',
    cfgSub: 'area_visual',
    draw: 'entity',
    entity: 'tornado',
    weaponFile: 'skills_config',
    weaponPath: 'weapons',
    weaponPick: 'tornado',
    extent: 330,
    states: ['spawn', 'alive', 'fading'],
    dirs: [],
    desc: 'Воронка из 58 колец по 40 сегментов, спиральные ленты, камни, пыль и редкие молнии внутри. Силуэт «дышит» и наклоняется по ходу движения.'
  },
  {
    id: 'fire_wall',
    label: 'Огненная стена',
    type: 'area',
    module: '../js/render/FireWallRenderer.js',
    cls: 'FireWallRenderer',
    ctor: 'visuals',
    visualKey: 'fire_wall',
    cfgFile: 'game_config',
    cfgPath: 'visuals.fire_wall',
    draw: 'entity',
    entity: 'wall',
    weaponFile: 'skills_config',
    weaponPath: 'weapons',
    weaponPick: 'fire_wall',
    extent: 380,
    states: ['spawning', 'alive', 'dying'],
    dirs: [],
    desc: '7 сегментов по 3–6 вертикальных хвостов. Основание шире и зафиксировано на земле, дышит высотой по двум гармоникам. Языки прорастают асинхронно от центра к краям. Искры и клубы дыма позади.'
  }
];

export const TYPE_META = {
  hero: { label: 'Герой', color: '#ffd34d' },
  monster: { label: 'Монстры', color: '#ff4d6d' },
  projectile: { label: 'Снаряды', color: '#b98cff' },
  area: { label: 'Зоны', color: '#ff8a3d' },
  effect: { label: 'Эффекты', color: '#4ec9e8' },
  environment: { label: 'Окружение', color: '#7fbf5a' },
  item: { label: 'Предметы', color: '#e8c060' },
  pet: { label: 'Питомцы', color: '#c7a6ff' },
  ui: { label: 'Интерфейс', color: '#6f9fe8' }
};