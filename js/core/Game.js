import { ConfigLoader } from './ConfigLoader.js';
import { AssetLoader } from './AssetLoader.js';
import { Animator } from './SpriteSheetParser.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { StateManager } from './StateManager.js';
import { Camera } from './Camera.js';
import { Player } from '../entities/Player.js';
import { Boss } from '../entities/Boss.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { ChestSystem } from '../systems/ChestSystem.js';
import { LootSystem } from '../systems/LootSystem.js';
import { Chest } from '../entities/Chest.js';
import { MainMenu } from '../ui/MainMenu.js';
import { HUD } from '../ui/HUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { GameOverScreen } from '../ui/GameOverScreen.js';
import { SettingsMenu } from '../ui/SettingsMenu.js';
import { UpgradeMenu } from '../ui/UpgradeMenu.js';
import { ShopMenu, DailyBonusPopup, StatsPopup, LeadersPopup } from '../ui/ShopMenu.js';
import { fmtTime } from '../utils/math.js';

export const MovementRegistry = { chase: 'chase', patrol: 'patrol', ranged: 'ranged', teleport: 'teleport' };
export const WeaponRegistry = { to_target: 'to_target', around_player: 'around_player', area: 'area' };
export const EffectRegistry = { oneshot: 'oneshot', looping: 'looping', attached: 'attached' };
export const ChestRewardRegistry = { coins: 'coins', spell: 'spell', levelup: 'levelup', mixed: 'mixed' };

const CONFIG_NAMES = ['game_config', 'balance_config', 'skills_config', 'effects_config', 'ui_config', 'shop_config', 'localization'];
const SETTINGS_KEY = 'sdw_settings_v1';
const BEST_KEY = 'sdw_best_v1';

export class Game {
  constructor(canvas, onStatus) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStatus = onStatus || (() => {});
    this.config = null;
    this.assets = new AssetLoader();
    this.input = null;
    this.audio = new AudioManager();
    this.states = new StateManager('boot');
    this.camera = null;
    this.last = 0;
    this.time = 0;
    this.fps = 0;
    this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0;
    this.player = null;
    this.enemies = [];
    this.pickups = [];
    this.combat = null;
    this.spawn = null;
    this.skills = null;
    this.progression = null;
    this.upgrades = null;
    this.chestSys = null;
    this.loot = null;
    this.enemyProjById = new Map();
    this.deaths = 0;
    this.pendingLevels = 0;
    this.choices = [];
    this.bossWarn = null;
    this.lang = 'ru';
    // Этап 4: UI
    this.settings = { music: 0.5, sfx: 0.8, lang: 'ru', joystick: 'left' };
    this.menu = new MainMenu();
    this.hud = new HUD();
    this.pauseMenu = new PauseMenu();
    this.gameover = new GameOverScreen();
    this.settingsMenu = new SettingsMenu();
    this.upgradeMenu = new UpgradeMenu();
    this.shopMenu = new ShopMenu();
    this.bonusPopup = new DailyBonusPopup();
    this.statsPopup = new StatsPopup();
    this.leadersPopup = new LeadersPopup();
    this.uiSettings = null; // 'menu' | 'pause' | null
    this.uiShop = false; this.uiBonus = false; this.uiStats = false; this.uiLeaders = false;
    this.uiInventory = false;
    this.runStats = { time: 0, level: 1, kills: 0, coins: 0, record: false };
    this.reviveUsed = false;
    this.bestTime = 0;
    this.dailyTaken = false;
    this.ready = false;
  }

  fmtTime(s) { return fmtTime(s); }
  _t(key, params) { return ConfigLoader.t(this.config.localization, this.settings.lang, key, params); }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch (e) {}
    try {
      this.bestTime = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch (e) {}
  }
  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) {}
  }
  setMusic(v) { this.settings.music = v; this.audio.setMusicVolume(v); }
  setSfx(v) { this.settings.sfx = v; this.audio.setSfxVolume(v); }
  cycleLang() {
    const langs = this.config.game_config.localization.supported_langs || ['ru', 'en'];
    const i = langs.indexOf(this.settings.lang);
    this.settings.lang = langs[(i + 1) % langs.length];
    if (this.upgrades) this.upgrades.setLang(this.settings.lang);
    this.saveSettings();
  }
  toggleJoystick() {
    this.settings.joystick = this.settings.joystick === 'left' ? 'right' : 'left';
    if (this.input) this.input.setJoystickSide(this.settings.joystick);
    this.saveSettings();
  }
  closeSettings() {
    this.uiSettings = null;
    this.saveSettings();
  }
  resetProgress() {
    try { localStorage.removeItem(BEST_KEY); } catch (e) {}
    this.bestTime = 0;
    this.deaths = 0;
  }
  yandexLogin() {
    try { window.ysdk?.auth?.openAuthDialog?.(); } catch (e) {}
  }
  dailyReady() { return !this.dailyTaken && (this.config.game_config.daily_bonus.enabled !== false); }

  async boot() {
    this.onStatus('Загрузка конфигов...');
    const loader = new ConfigLoader();
    this.config = await loader.loadAll(CONFIG_NAMES);

    const errors = ConfigLoader.validateAll(this.config, {
      movement: MovementRegistry, weapon: WeaponRegistry, effect: EffectRegistry, chest: ChestRewardRegistry
    });
    if (errors.length) throw new Error('Валидация конфигов:\n' + errors.join('\n'));

    const g = this.config.game_config, b = this.config.balance_config;
    // язык: настройки -> автоопределение
    this.loadSettings();
    if (!localStorage.getItem(SETTINGS_KEY)) {
      try {
        const nav = (window.ysdk?.environment?.i18n?.lang) || (navigator.language || 'ru').slice(0, 2);
        if (g.localization.auto_detect && (g.localization.supported_langs || []).includes(nav)) this.settings.lang = nav;
      } catch (e) {}
      this.settings.joystick = g.controls.joystick_position_default || 'left';
      this.settings.music = g.audio.music_volume_default;
      this.settings.sfx = g.audio.sfx_volume_default;
    }
    this.input = new InputManager(this.canvas, { joystickSide: this.settings.joystick });
    this.audio.applyVolumes(this.settings.music, this.settings.sfx, g.audio.pause_on_blur);
    this.camera = new Camera(g.camera);
    this.camera.snap(0, 0);

    this.onStatus('Загрузка ассетов...');
    const paths = AssetLoader.collectPaths(this.config);
    await this.assets.loadAllImages(paths.images, (d, total) => this.onStatus('Ассеты ' + d + '/' + total));

    this._initRun();
    this.canvas.addEventListener('mousedown', (e) => this._tap(e.clientX, e.clientY));
    this.canvas.addEventListener('touchend', (e) => {
      if (e.changedTouches.length) {
        const t = e.changedTouches[0];
        this._tap(t.clientX, t.clientY);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.states.is('playing')) this.pauseGame();
        else if (this.states.is('paused')) this.resumeGame();
      }
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.states.is('paused')) this.pauseMenu.move(this, this._toX(e.clientX));
      if (this.uiSettings) this.settingsMenu.move(this, this._toX(e.clientX));
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.states.is('paused')) this.pauseMenu.down(this, this._toX(e.clientX), this._toY(e.clientY));
      if (this.uiSettings) this.settingsMenu.down(this, this._toX(e.clientX), this._toY(e.clientY));
    });

    this.states.set('menu');
    try { this.audio.playMusic(g.audio.music_menu); } catch (e) {}
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    try { if (window.ysdk?.features?.LoadingAPI) window.ysdk.features.LoadingAPI.ready(); } catch (e) {}
    this.ready = true;
    this.onStatus('OK');
    window.__game = this;
  }

  _toX(cx) {
    const r = this.canvas.getBoundingClientRect();
    return (cx - r.left) * (this.canvas.width / r.width);
  }
  _toY(cy) {
    const r = this.canvas.getBoundingClientRect();
    return (cy - r.top) * (this.canvas.height / r.height);
  }
  _tap(cx, cy) {
    const x = this._toX(cx), y = this._toY(cy);
    const W = this.canvas.width;
    // попапы поверх всего
    if (this.uiInventory) {
      const r = this.hud.invCloseRect(W);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this.uiInventory = false;
      return;
    }
    if (this.uiSettings) { this.settingsMenu.click(this, x, y); return; }
    if (this.uiShop) { if (this.shopMenu.click(this, x, y) === 'close') this.uiShop = false; return; }
    if (this.uiBonus) {
      if (this.bonusPopup.click(this, x, y) === 'close') this.uiBonus = false;
      else if (this.dailyReady()) { /* Этап 5 выдаст монеты */ }
      return;
    }
    if (this.uiStats) { if (this.statsPopup.click(this, x, y) === 'close') this.uiStats = false; return; }
    if (this.uiLeaders) { if (this.leadersPopup.click(this, x, y) === 'close') this.uiLeaders = false; return; }

    const st = this.states.get();
    if (st === 'menu') { this.menu.click(this, x, y); return; }
    if (st === 'playing') { this.hud.click(this, x, y, W); return; }
    if (st === 'paused') { this.pauseMenu.click(this, x, y); return; }
    if (st === 'upgrade') { this.upgradeMenu.click(this, x, y); return; }
    if (st === 'gameover') { this.gameover.click(this, x, y); return; }
  }

  // --- переходы ---
  startRun() {
    this._initRun();
    this.states.set('playing');
    this.uiSettings = null;
    try { this.audio.playMusic(this.config.game_config.audio.music_battle); } catch (e) {}
  }
  toMenu() {
    this.states.set('menu');
    this.uiSettings = null;
    try { this.audio.playMusic(this.config.game_config.audio.music_menu); } catch (e) {}
  }
  pauseGame() { if (this.states.is('playing')) this.states.set('paused'); }
  resumeGame() { if (this.states.is('paused')) this.states.set('playing'); }
  revive() {
    if (this.reviveUsed) return;
    this.reviveUsed = true; // Этап 7: rewarded-видео перед этим
    this.player.hp = Math.ceil(this.player.maxHp * (this.config.game_config.monetization.revive_hp_percent || 50) / 100);
    this.player.alive = true;
    this.player.invT = 2;
    // раздвинуть врагов чтобы не умереть мгновенно
    for (const e of this.enemies) {
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 120) { e.x = this.player.x + (dx / (d || 1)) * 160; e.y = this.player.y + (dy / (d || 1)) * 160; }
    }
    this.states.set('playing');
  }
  applyUpgrade(i) {
    const c = this.choices[i];
    if (!c) return;
    this.upgrades.apply(c, this.skills, this.player);
    this.pendingLevels--;
    this.player.level = this.progression.level;
    if (this.pendingLevels > 0) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3);
      if (!this.choices.length) { this.pendingLevels = 0; this.states.set('playing'); }
    } else {
      this.states.set('playing');
    }
  }

  _initRun() {
    const g = this.config.game_config, b = this.config.balance_config, s = this.config.skills_config;
    this.player = new Player(b.player, 0, 0);
    this.player.attachHeroAnim(new Animator(g.hero.frames, 'idle'));
    this.enemies = [];
    this.pickups = [];
    this.combat = new CombatSystem(g, b);
    this.spawn = new SpawnSystem(b.waves, b.monsters);
    this.skills = new SkillSystem(s.weapons, this.combat, this.audio);
    this.skills.setActive(['magic_bolt', 'frost_ring', 'fire_wall']);
    this.progression = new ProgressionSystem(b.progression);
    this.upgrades = new UpgradeSystem(s, this.config.localization, this.settings.lang);
    this.chestSys = new ChestSystem(b.chests);
    this.loot = new LootSystem(b.loot);
    this.enemyProjById = new Map();
    for (const p of (s.enemy_projectiles || [])) this.enemyProjById.set(p.id, p);
    this.time = 0;
    this.pendingLevels = 0;
    this.choices = [];
    this.bossWarn = null;
    this.reviveUsed = false;
    this.uiInventory = false;
    if (b.waves.first_spawn_trigger_on_chest && b.chests.enabled) {
      const wood = b.chests.types.find((t) => t.id === 'wooden') || b.chests.types[0];
      if (wood) this.chestSys.chests.push(new Chest(wood, 150, 0));
    }
    this.camera.snap(0, 0);
  }

  _onKill(e) {
    for (const p of this.loot.dropFor(e)) this.pickups.push(p);
  }

  _chestSpawnPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 400 + Math.random() * 400;
    return { x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r };
  }

  _openChest(c, reward) {
    this.player.coins += reward.coins || 0;
    if (reward.potions > 0) {
      const pct = (this.config.balance_config.loot.health_potion_heal_percent || 25) / 100;
      this.player.heal(this.player.maxHp * pct * reward.potions);
    }
    for (let i = 0; i < (reward.spells || 0); i++) this.skills.grantRandomSpell();
    if (reward.levels > 0) {
      const ups = this.progression.grantLevels(reward.levels);
      this.pendingLevels += ups;
    }
    this.combat.pushText(c.x, c.y - 24, '+' + reward.coins, '#ffd34d');
    try { this.audio.playSfx(this.config.balance_config.chests.sfx_open); } catch (e) {}
  }

  _collect(p) {
    p.alive = false;
    if (p.kind === 'xp') {
      const ups = this.progression.addXP(p.value * (this.player.xpMul || 1));
      this.player.level = this.progression.level;
      this.pendingLevels += ups;
    } else if (p.kind === 'coin') {
      this.player.coins += p.value;
    } else if (p.kind === 'potion') {
      const pct = (this.config.balance_config.loot.health_potion_heal_percent || 25) / 100;
      const h = Math.round(this.player.maxHp * pct);
      this.player.heal(h);
      this.combat.pushText(this.player.x, this.player.y - 30, '+' + h, '#00ff88');
    } else if (p.kind === 'magnet') {
      for (const o of this.pickups) o.magnetized = true;
    } else if (p.kind === 'bomb') {
      for (const e of this.enemies) {
        if (!e.alive || e.deathT > 0) continue;
        const was = e.hp;
        e.takeDamage(150, 0, 0);
        if (e.hp <= 0 && was > 0) { this.combat.kills++; this._onKill(e); }
      }
      this.combat.pushText(this.player.x, this.player.y - 30, 'BOOM', '#ff8800');
    }
  }

  _die() {
    this.deaths++;
    const t = this.time;
    const record = t > this.bestTime;
    if (record) {
      this.bestTime = t;
      try { localStorage.setItem(BEST_KEY, String(Math.floor(t))); } catch (e) {}
    }
    this.runStats = {
      time: t,
      level: this.progression.level,
      kills: this.combat.kills,
      coins: this.player.coins,
      record
    };
    this.states.set('gameover');
    try { this.audio.stopMusic(); this.audio.playSfx('gameover.mp3'); } catch (e) {}
  }

  frame(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt >= 0) || dt > 0.05) dt = Math.min(Math.max(dt || 0.016, 0), 0.05);
    this._fpsAcc += dt; this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0; }
    const st = this.states.get();
    const paused = st === 'paused' || document.hidden;
    if (!paused && (st === 'playing' || st === 'upgrade')) this.update(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    if (this.states.is('upgrade')) {
      this.combat.updateTexts(dt);
      return;
    }
    this.time += dt;
    const v = this.input.getVector();
    this.player.update(dt, v);
    this.player.level = this.progression.level;
    this.camera.update(dt, this.player.x, this.player.y, this.canvas.width, this.canvas.height);

    const fresh = this.spawn.update(dt, {
      player: this.player, enemies: this.enemies, viewW: this.canvas.width, viewH: this.canvas.height
    });
    for (const raw of fresh) {
      if (raw.isBoss) {
        const b = new Boss(raw.cfg, raw.x, raw.y, ConfigLoader.t(this.config.localization, this.settings.lang, raw.cfg.name_key));
        b.hp = raw.hp; b.maxHp = raw.maxHp;
        this.enemies.push(b);
        this.bossWarn = { text: ConfigLoader.t(this.config.localization, this.settings.lang, 'boss_warning', { name: b.name || 'BOSS' }), t: 2 };
        try { this.audio.playSfx('boss_roar.mp3'); } catch (e) {}
      } else this.enemies.push(raw);
    }
    if (this.bossWarn) {
      this.bossWarn.t -= dt;
      if (this.bossWarn.t <= 0) this.bossWarn = null;
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.deathT > 0) { e.updateDeath(dt); continue; }
      const { mx, my, dist } = e.steer(dt, this.player.x, this.player.y);
      e.facing = (this.player.x >= e.x) ? 1 : -1;
      if (e.cfg.movement_type === 'ranged' && e.attackCd <= 0 && dist < (e.cfg.attack_range || 300)) {
        const proj = this.enemyProjById.get(e.cfg.projectile_id);
        if (proj) {
          this.skills.enemyFire(e.x, e.y, this.player.x, this.player.y, proj, e.damage);
          e.attackCd = (e.cfg.attack_cooldown_ms || 2000) / 1000;
          try { e.setAnim('attack'); } catch (err) {}
        }
      } else {
        try { e.setAnim('walk'); } catch (err) {}
      }
      e.x += mx * e.speed * dt;
      e.y += my * e.speed * dt;
      e.applyKnock(dt);
      e.updateAnim(dt);
    }

    const onKill = (e) => this._onKill(e);
    this.skills.update(dt, { player: this.player, enemies: this.enemies, onKill });
    this.skills.updateProjectiles(dt);
    this.combat.projectilesVsEnemies(this.skills.projectiles, this.enemies, onKill);
    this.combat.enemyProjectilesVsPlayer(this.skills.enemyShots, this.player);
    this.combat.separate(this.enemies);
    this.combat.contactDamage(this.player, this.enemies);
    this.combat.updateTexts(dt);

    const pr = this.player.getPickupRadius();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p.alive) { this.pickups.splice(i, 1); continue; }
      p.update(dt, this.player.x, this.player.y, pr);
      if (!p.alive) { this.pickups.splice(i, 1); continue; }
      const dx = p.x - this.player.x, dy = p.y - this.player.y;
      if (dx * dx + dy * dy < 20 * 20) this._collect(p);
      if (!p.alive) this.pickups.splice(i, 1);
    }

    this.chestSys.update(dt, {
      player: this.player,
      pickupRadius: pr,
      spawnPoint: () => this._chestSpawnPoint(),
      onOpen: (c, r) => this._openChest(c, r)
    });

    if (this.pendingLevels > 0 && this.states.is('playing')) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3);
      if (this.choices.length) this.states.set('upgrade');
      else this.pendingLevels = 0;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    if (!this.player.alive) this._die();
    if (this.skills.auraFlash > 0) this.skills.auraFlash -= dt;
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.config.game_config;
    const st = this.states.get();
    ctx.save();
    ctx.fillStyle = g.visuals.background_color;
    ctx.fillRect(0, 0, W, H);

    if (st === 'menu') {
      this._drawGrid(ctx, W, H);
      this.menu.draw(ctx, this, W, H);
    } else {
      // мир
      ctx.save();
      this.camera.apply(ctx, W, H);
      this._drawGrid(ctx, W, H);
      for (const a of this.skills.areas) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = a.color;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = a.color;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.stroke();
      }
      if (this.skills.auraRadius) {
        ctx.globalAlpha = 0.25 + (this.skills.auraFlash > 0 ? 0.2 : 0);
        ctx.fillStyle = this.skills.auraColor || '#00ccff';
        ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.skills.auraRadius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const p of this.pickups) {
        ctx.fillStyle = p.color();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        const letter = { xp: 'X', coin: '$', potion: '+', magnet: 'M', bomb: 'B' }[p.kind] || '?';
        ctx.fillText(letter, p.x, p.y + 3);
      }
      for (const c of this.chestSys.chests) {
        if (!c.alive) continue;
        const col = { wooden: '#8B5A2B', silver: '#C0C0C0', golden: '#FFD700', legendary: '#B400FF' }[c.typeCfg.id] || '#8B5A2B';
        ctx.fillStyle = c.opened ? '#444' : col;
        ctx.fillRect(c.x - 14, c.y - 14, 28, 28);
        ctx.strokeStyle = '#000'; ctx.strokeRect(c.x - 14, c.y - 14, 28, 28);
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.draw(ctx, this.assets, e.cfg.sprite, e.rw, e.rh, e.scale * (g.visuals.global_sprite_scale || 1), e.isBoss ? '#c0c' : '#a33');
        if (e.isBoss || e.maxHp >= 100) {
          const w = 60 * e.scale;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w, 6);
          ctx.fillStyle = '#f00'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w * (e.hp / e.maxHp), 6);
        }
      }
      if (this.player) {
        const hasAnim = !!(this.player.anim && this.player.anim.getRect);
        const r = hasAnim ? this.player.anim.getRect() : { sw: 32, sh: 32 };
        this.player.draw(ctx, this.assets, g.hero.sprite, r.sw, r.sh, g.visuals.global_sprite_scale || 1, '#888');
      }
      for (const p of this.skills.projectiles) this._drawShot(ctx, p, '#ffd34d');
      for (const p of this.skills.enemyShots) this._drawShot(ctx, p, '#ff4d4d');
      ctx.textAlign = 'center';
      for (const t of this.combat.texts) {
        ctx.globalAlpha = 1 - t.life / t.maxLife;
        ctx.fillStyle = t.color; ctx.font = 'bold 14px monospace';
        ctx.fillText(t.txt, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // HUD только в игре
      if (st === 'playing' || st === 'paused' || st === 'upgrade') {
        this.hud.drawTop(ctx, this, W);
        this.hud.drawBossBar(ctx, this, W, H);
        this.hud.drawBottom(ctx, this, W, H);
      }
      if (this.bossWarn && st === 'playing') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H / 2 - 40, W, 60);
        ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.bossWarn.text, W / 2, H / 2);
      }
      if (st === 'upgrade') this.upgradeMenu.draw(ctx, this, W, H);
      if (st === 'paused') this.pauseMenu.draw(ctx, this, W, H);
      if (st === 'gameover') this.gameover.draw(ctx, this, W, H);
      if (this.uiInventory && st === 'playing') this.hud.drawInventory(ctx, this, W, H);
    }

    // попапы поверх всего
    if (this.uiSettings) this.settingsMenu.draw(ctx, this, W, H);
    else if (this.uiShop) this.shopMenu.draw(ctx, this, W, H);
    else if (this.uiBonus) this.bonusPopup.draw(ctx, this, W, H);
    else if (this.uiStats) this.statsPopup.draw(ctx, this, W, H);
    else if (this.uiLeaders) this.leadersPopup.draw(ctx, this, W, H);

    if (st !== 'menu') this.input.drawJoystick(ctx);
    if (g.ui.show_fps) {
      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(this.fps + ' fps', 8, H - 8);
    }
    ctx.restore();
  }

  _drawShot(ctx, p, color) {
    const img = this.assets.get(p.spritePath);
    if (img && p.anim) {
      try {
        if (img.tagName === 'CANVAS') { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); }
        else {
          const r = p.anim.getRect();
          ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, p.x - r.sw / 2, p.y - r.sh / 2, r.sw, r.sh);
        }
        return;
      } catch (e) {}
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
  }

  _drawGrid(ctx, W, H) {
    const step = 64;
    const cx = this.camera ? this.camera.x : 0, cy = this.camera ? this.camera.y : 0;
    const x0 = Math.floor((cx - W / 2) / step) * step;
    const y0 = Math.floor((cy - H / 2) / step) * step;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x < cx + W / 2 + step; x += step) { ctx.moveTo(x, cy - H / 2); ctx.lineTo(x, cy + H / 2); }
    for (let y = y0; y < cy + H / 2 + step; y += step) { ctx.moveTo(cx - W / 2, y); ctx.lineTo(cx + W / 2, y); }
    ctx.stroke();
  }
}
