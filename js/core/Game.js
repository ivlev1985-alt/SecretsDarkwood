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
import { Cage } from '../entities/Cage.js';
import { Pickup } from '../entities/Pickup.js';
import { Prop } from '../entities/Prop.js';
import { Pet } from '../entities/Pet.js';
import { HeroMageRenderer } from '../render/HeroMageRenderer.js';
import { TornadoRenderer } from '../render/TornadoRenderer.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { ShopSystem } from '../systems/ShopSystem.js';
import { DailyBonusSystem } from '../systems/DailyBonusSystem.js';
import { EffectSystem } from '../systems/EffectSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { MainMenu } from '../ui/MainMenu.js';
import { HUD } from '../ui/HUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { GameOverScreen } from '../ui/GameOverScreen.js';
import { SettingsMenu } from '../ui/SettingsMenu.js';
import { UpgradeMenu } from '../ui/UpgradeMenu.js';
import { ShopMenu, DailyBonusPopup, StatsPopup, LeadersPopup } from '../ui/ShopMenu.js';
import { PetSwapPopup } from '../ui/PetSwapPopup.js';
import { fmtTime, pileOffset } from '../utils/math.js';
import { healEase, healFillDuration } from '../utils/healAnimation.js';

export const MovementRegistry = { chase: 'chase', patrol: 'patrol', ranged: 'ranged', teleport: 'teleport' };
export const WeaponRegistry = { to_target: 'to_target', around_player: 'around_player', orbit: 'orbit', area: 'area' };
export const EffectRegistry = { oneshot: 'oneshot', looping: 'looping', attached: 'attached' };
export const ChestRewardRegistry = { coins: 'coins', spell: 'spell', levelup: 'levelup', mixed: 'mixed' };

const CONFIG_NAMES = ['game_config', 'balance_config', 'skills_config', 'effects_config', 'ui_config', 'items_config', 'localization'];
const SETTINGS_KEY = 'sdw_settings_v1';

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
    this.heroMage = null; // процедурный визуал героя (если спрайт отсутствует)
    this.tornadoRenderer = new TornadoRenderer(); // визуал смерча / будущий спрайт
    this._deathPending = false; // короткая death-анимация перед gameover
    this._deathTimer = 0;
    this.enemies = [];
    this.pickups = [];
    this.props = [];
    this.pet = null;
    this.petLevels = {};
    this.fx = null;
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
    this.pendingSpellRewards = 0; // заклинания из сундуков, ждущие выбора карточки
    this.choiceMode = 'levelup'; // 'levelup' | 'spell'
    this.choices = [];
    this._hiddenHudUpgrade = null; // иконка, спрятанная под летящей иконкой апгрейда
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
    // банк _die: сколько времени/киллов/монет уже записано в мету
    // (нужно чтобы revive + повторная смерть не задваивали totals)
    this._bankedTime = 0;
    this._bankedKills = 0;
    this._bankedCoins = 0;
    this._bankedFav = {};
    this._dying = false; // _die уже выполняется (защита от повторного входа)
    // Этап 5: мета
    this.save = new SaveSystem('secrets_darkwood_save_v1');
    this.shop = null;
    this.daily = null;
    this.leaderEntries = null;
    this._autosaveT = 30;
    // Этап 7: реклама
    this._adBusy = false;
    this._lastInter = 0;
    // Клетка с питомцем (тестовая — в начале забега, см. balance_config.cages).
    this.uiPetSwap = null;
    this.petSwapPopup = new PetSwapPopup();
    // Аптечка: иконка летит к шкале HP, затем шкала плавно заполняется.
    this.hpDisplay = 0;
    this.potionFlyers = [];
    this.healQueue = [];
    this.healAnim = null;
    // Питомцы, улетающие «на свободу» после клетки/замены.
    this.fleeingPets = [];
    // Защита от «протухших» тапов на тачскринах: помним, где/когда палец лёг,
    // и когда открылась текущая модалка. Тап засчитывается только если палец
    // лёг УЖЕ на открытую модалку и почти не двигался (иначе это был джойстик
    // или палец, лежавший на экране до паузы/levelup).
    this._touchStarts = new Map(); // touchId -> { x, y, t }
    this._modalTs = 0; // performance.now() открытия текущей модалки
    this._wasModal = false;
    this.TAP_SLOP = 24; // макс. сдвиг пальца (px канваса) чтобы считаться тапом
    this.ready = false;
  }

  fmtTime(s) { return fmtTime(s); }
  _t(key, params) { return ConfigLoader.t(this.config.localization, this.settings.lang, key, params); }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
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
    if (this.save) this.save.reset();
    this.bestTime = 0;
    this.deaths = 0;
  }
  yandexLogin() {
    try { window.ysdk?.auth?.openAuthDialog?.(); } catch (e) {}
  }
  // --- реклама (только через SDK, никогда во время боя) ---
  dailyReady() { return this.daily ? this.daily.ready(this.save.data.dailyLast) : false; }
  async _showFullscreen() {
    try {
      await window.ysdk?.adv?.showFullscreenAdv?.({});
      return true;
    } catch (e) { return false; }
  }
  async _showRewarded() {
    try {
      await window.ysdk?.adv?.showRewardedVideo?.({});
      return true;
    } catch (e) { return false; }
  }
  // Interstitial ДО окна gameover: каждые N смертей, min-интервал, пропуск первого забега
  async _maybeInterstitial() {
    const m = this.config.game_config.monetization;
    if (m.interstitial_skip_first_run && (this.save.data.stats.totalRuns || 0) <= 1) return;
    if ((m.interstitial_ad_every_n_deaths || 3) <= 0) return;
    if (this.deaths % (m.interstitial_ad_every_n_deaths || 3) !== 0) return;
    if (Date.now() - this._lastInter < (m.interstitial_min_interval_sec || 60) * 1000) return;
    this._lastInter = Date.now();
    this.states.set('ads');
    await this._showFullscreen();
  }
  menuAdReady() {
    const cd = (this.config.game_config.monetization.rewarded_cooldown_sec || 600) * 1000;
    return !!this.daily && (Date.now() - (this.save.data.menuAdLast || 0) >= cd);
  }
  menuAdRemain() {
    const cd = (this.config.game_config.monetization.rewarded_cooldown_sec || 600) * 1000;
    const ms = Math.max(0, cd - (Date.now() - (this.save.data.menuAdLast || 0)));
    const m = String(Math.floor(ms / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return m + ':' + s;
  }
  async claimMenuAd() {
    if (!this.menuAdReady() || this._adBusy) return false;
    this._adBusy = true;
    const ok = await this._showRewarded();
    this._adBusy = false;
    if (!ok) return false;
    this.save.data.menuAdLast = Date.now();
    this.save.addCoins(this.daily.reward * 2); // 📺 ×2 в главном меню (ГДД п.10.2)
    this.save.save();
    try { this.audio.playSfx('levelup.mp3'); } catch (e) {}
    return true;
  }
  openPolicy(kind) {
    const url = kind === 'privacy'
      ? this.config.game_config.meta.privacy_url
      : this.config.game_config.meta.terms_url;
    if (!url) return;
    try {
      if (window.ysdk?.openUrl) window.ysdk.openUrl(url);
      else window.open(url, '_blank');
    } catch (e) {}
  }
  // Повторный забор после бесплатного — за рекламу (видео в Этапе 7, пока stub).
  // Кулдаун из monetization.rewarded_cooldown_sec.
  dailyAdReady() {
    const cd = (this.config.game_config.monetization.rewarded_cooldown_sec || 600) * 1000;
    return !!this.daily && (Date.now() - (this.save.data.dailyAdLast || 0) >= cd);
  }
  async claimDailyAd() {
    if (!this.dailyAdReady() || this._adBusy) return false;
    this._adBusy = true;
    const ok = await this._showRewarded(); // повторный забор — за видео
    this._adBusy = false;
    if (!ok) return false;
    this.save.data.dailyAdLast = Date.now();
    this.save.addCoins(this.daily.reward);
    this.save.save();
    if (this.fx && this.player) this.fx.play('daily_bonus_burst', this.player.x, this.player.y);
    try { this.audio.playSfx('levelup.mp3'); } catch (e) {}
    this.uiBonus = false;
    return true;
  }
  claimDaily() {
    if (!this.dailyReady()) return false;
    this.save.data.dailyLast = Date.now();
    this.save.addCoins(this.daily.reward);
    this.save.save();
    if (this.fx && this.player) this.fx.play('daily_bonus_burst', this.player.x, this.player.y);
    try { this.audio.playSfx('levelup.mp3'); } catch (e) {}
    return true;
  }
  weaponName(id) {
    const st = this.skills?.weapons.get(id);
    const cfg = st ? st.cfg : (this.config.skills_config.weapons || []).find((w) => w.id === id);
    if (!cfg) return id;
    return ConfigLoader.t(this.config.localization, this.settings.lang, cfg.name_key);
  }
  async openLeaders() {
    this.uiLeaders = true;
    this.leaderEntries = null;
    try {
      const lb = await window.ysdk?.getLeaderboards?.();
      if (lb) {
        const res = await lb.getEntries?.({ quantityTop: 5 });
        const arr = res?.entries || res || [];
        this.leaderEntries = arr.map((e) => ({ name: e.player?.publicName || '?', score: e.score || 0 }));
        return;
      }
    } catch (e) {}
    this.leaderEntries = [];
  }
  submitScore() {
    try {
      window.ysdk?.getLeaderboards?.().then((lb) => lb.setScore?.(Math.floor(this.bestTime))).catch(() => {});
    } catch (e) {}
  }

  async boot() {
    this.onStatus('Загрузка конфигов...');
    const loader = new ConfigLoader();
    this.config = await loader.loadAll(CONFIG_NAMES);

    const errors = ConfigLoader.validateAll(this.config, {
      movement: MovementRegistry, weapon: WeaponRegistry, effect: EffectRegistry, chest: ChestRewardRegistry
    });
    if (errors.length) throw new Error('Валидация конфигов:\n' + errors.join('\n'));

    const g = this.config.game_config, b = this.config.balance_config;
    // Этап 5: мета-сейв (SDK + localStorage)
    this.save = new SaveSystem(g.save.save_key);
    this.shop = new ShopSystem(this.config.items_config);
    this.daily = new DailyBonusSystem(g.daily_bonus);
    this.onStatus('Загрузка сейва...');
    await this.save.load();
    this.bestTime = this.save.data.stats.bestTime || 0;
    this._autosaveT = g.save.autosave_interval_sec || 30;
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
    // Трекинг начала касаний — нужен чтобы отличать свежий тап по модалке
    // от отпускания пальца, лежавшего на экране до её открытия (джойстик).
    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        this._touchStarts.set(t.identifier, {
          x: this._toX(t.clientX), y: this._toY(t.clientY), t: performance.now()
        });
      }
      // страховка от утечки карты
      if (this._touchStarts.size > 12) {
        const first = this._touchStarts.keys().next();
        if (!first.done) this._touchStarts.delete(first.value);
      }
    }, { passive: true });
    this.canvas.addEventListener('touchend', (e) => {
      // блокируем эмулированный mousedown: иначе один тап закрывает попап
      // И тут же кликает по меню под ним (авт. открытие магазина и т.п.)
      if (e.cancelable) e.preventDefault();
      for (const t of e.changedTouches) {
        const s = this._touchStarts.get(t.identifier);
        this._touchStarts.delete(t.identifier);
        if (Game.isFreshTap(s, this._toX(t.clientX), this._toY(t.clientY), this._modalTs, this.TAP_SLOP)) {
          this._tap(t.clientX, t.clientY);
        }
      }
    }, { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) this._touchStarts.delete(t.identifier);
    });
    // колесико — скролл магазина
    this.canvas.addEventListener('wheel', (e) => {
      if (this.uiShop) {
        e.preventDefault();
        this.shopMenu.scroll += e.deltaY > 0 ? 1 : -1;
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') {
        if (e.code === 'Space') e.preventDefault();
        if (this.uiInventory) { this.uiInventory = false; return; }
        if (this.states.is('playing')) this.pauseGame();
        else if (this.states.is('paused')) this.resumeGame();
      }
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.states.is('paused') && !this.uiInventory) this.pauseMenu.move(this, this._toX(e.clientX));
      if (this.uiSettings) this.settingsMenu.move(this, this._toX(e.clientX));
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.states.is('paused') && !this.uiInventory) this.pauseMenu.down(this, this._toX(e.clientX), this._toY(e.clientY));
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

  // Чистая функция-фильтр тапов (тестируется в node): тап засчитывается
  // только если палец лёг ПОСЛЕ открытия модалки и почти не двигался.
  // Отсекает: отпускание джойстика и пальца, лежавшего до паузы/levelup.
  static isFreshTap(start, endX, endY, modalTs, slop) {
    if (!start) return false; // начало неизвестно — протухшее касание
    if (start.t < modalTs) return false; // палец лёг до открытия модалки
    if (Math.hypot(endX - start.x, endY - start.y) > slop) return false; // свайп
    return true;
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
    if (this.uiPetSwap) {
      const r = this.petSwapPopup.click(this, x, y);
      if (r === 'close') this._closePetSwap(true);
      else if (r === 'swap') this.doPetSwap();
      return;
    }
    if (this.uiInventory) {
      const r = this.hud.invCloseRect(W);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) this.uiInventory = false;
      return;
    }
    if (this.uiSettings) { this.settingsMenu.click(this, x, y); return; }
    if (this.uiShop) {
      if (this.shopMenu.click(this, x, y) === 'close') { this.uiShop = false; this.save.save(); }
      return;
    }
    if (this.uiBonus) {
      if (this.bonusPopup.click(this, x, y) === 'close') this.uiBonus = false;
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

  // --- предметный магазин: ассортимент, обновление ---
  ensureStock() {
    const hours = (this.shop.shop.refresh_hours || 1) * 3600 * 1000;
    const st = this.save.data.stock;
    if (!st.offers.length || Date.now() - (st.ts || 0) >= hours) {
      this.save.data.stock = { ts: Date.now(), offers: this.shop.rollStock() };
      this.save.save();
    }
  }
  stockRemain() {
    const hours = (this.shop.shop.refresh_hours || 1) * 3600 * 1000;
    const ms = Math.max(0, hours - (Date.now() - (this.save.data.stock.ts || 0)));
    const m = String(Math.floor(ms / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return m + ':' + s;
  }
  stockAdReady() {
    const cd = (this.shop.shop.refresh_ad_cooldown_sec || 300) * 1000;
    return Date.now() - (this.save.data.stockAdLast || 0) >= cd;
  }
  async refreshStockAd() {
    if (!this.stockAdReady() || this._adBusy) return false;
    this._adBusy = true;
    const ok = await this._showRewarded();
    this._adBusy = false;
    if (!ok) return false;
    this.save.data.stockAdLast = Date.now();
    this.save.data.stock = { ts: Date.now(), offers: this.shop.rollStock() };
    this.save.save();
    return true;
  }
  openShop() {
    this.ensureStock();
    this.shopMenu.open(this);
    this.uiShop = true;
  }
  // имя предмета по шаблону из items_config
  itemName(item) {
    if (!item) return '—';
    const tpl = this.shop.tplById.get(item.tpl);
    if (!tpl) return item.tpl;
    return ConfigLoader.t(this.config.localization, this.settings.lang, tpl.name_key);
  }

  // --- переходы ---
  startRun() {
    // Если рестарт из паузы — сначала коммитим незаписанный прогресс
    // текущего забега (после _die дельта = 0, так что безопасно всегда).
    this._commitRunStats();
    this._initRun();
    this.save.data.stats.totalRuns++;
    this.save.save();
    this.states.set('playing');
    this.uiSettings = null;
    try { this.audio.playMusic(this.config.game_config.audio.music_battle); } catch (e) {}
  }
  // Коммит дельты забега в мету (время/киллы/монеты/любимое оружие).
  // Вызывается из _die, toMenu и startRun (рестарт). После _die дельта = 0,
  // поэтому повторные вызовы безопасны и не задваивают totals.
  _commitRunStats() {
    if (!this.player || !this.save || !this.combat) return { record: false };
    const dTime = Math.max(0, this.time - (this._bankedTime || 0));
    const dKills = Math.max(0, this.combat.kills - (this._bankedKills || 0));
    const dCoins = Math.max(0, this.player.coins - (this._bankedCoins || 0));
    const favMap = {};
    const bankedFav = this._bankedFav || {};
    for (const [id, k] of Object.entries(this.combat.killsByWeapon || {})) {
      const d = k - (bankedFav[id] || 0);
      if (d > 0) favMap[id] = d;
    }
    if (!dTime && !dKills && !dCoins && !Object.keys(favMap).length) return { record: false };
    if (dCoins) this.save.addCoins(dCoins);
    const { record } = this.save.recordRun({
      time: dTime, kills: dKills, favMap, fullTime: this.time
    });
    this._bankedTime = this.time;
    this._bankedKills = this.combat.kills;
    this._bankedCoins = this.player.coins;
    this._bankedFav = Object.assign({}, this.combat.killsByWeapon || {});
    this.bestTime = this.save.data.stats.bestTime || 0;
    this.save.save();
    return { record };
  }
  toMenu() {
    // Коммит дельты перед выходом (чтобы время/киллы/монеты не терялись
    // при выходе не через смерть и не задваивались при смерть->меню).
    const { record } = this._commitRunStats();
    this.runStats = {
      time: this.time || 0,
      level: this.progression ? this.progression.level : (this.player ? this.player.level : 1),
      kills: this.combat ? this.combat.kills : 0,
      coins: this.player ? this.player.coins : 0,
      record: !!record
    };
    if (record) this.submitScore();
    this.states.set('menu');
    this.uiSettings = null;
    try { this.audio.playMusic(this.config.game_config.audio.music_menu); } catch (e) {}
  }
  pauseGame() { if (this.states.is('playing')) this.states.set('paused'); }
  resumeGame() { if (this.states.is('paused')) this.states.set('playing'); }
  async revive() {
    if (this.reviveUsed || this._adBusy) return;
    this._adBusy = true;
    const ok = await this._showRewarded(); // воскрешение за видео (макс 1/забег)
    this._adBusy = false;
    if (!ok) return;
    this.reviveUsed = true;
    this._dying = false; // разрешить повторную смерть после revive (иначе _die заблокирован)
    this._deathPending = false;
    this._deathTimer = 0;
    this.player.hp = Math.ceil(this.player.maxHp * (this.config.game_config.monetization.revive_hp_percent || 50) / 100);
    this.player.reviveReset();
    this.player.invT = 2;
    this.hpDisplay = this.player.hp;
    this.potionFlyers = [];
    this.healQueue = [];
    this.healAnim = null;
    // раздвинуть врагов чтобы не умереть мгновенно
    for (const e of this.enemies) {
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 120) { e.x = this.player.x + (dx / (d || 1)) * 160; e.y = this.player.y + (dy / (d || 1)) * 160; }
    }
    this.states.set('playing');
  }
  // opts.deferClose=true — применить выбор сразу, но не закрывать окно:
  // так иконка успевает улететь в HUD, а окно закроется после её приземления.
  applyUpgrade(i, opts = {}) {
    const c = this.choices[i];
    if (!c) return null;
    const mode = this.choiceMode || 'levelup';
    if (c.kind === 'pet' && this.pet) {
      // апгрейд питомца: дальность полёта / радиус притяжения
      const def = (this.shop.cfg.pet_upgrades || []).find((d) => d.id === c.id);
      this.petLevels[c.id] = (this.petLevels[c.id] || 0) + 1;
      if (def) {
        if (c.id === 'pet_range') this.pet.radius += def.value;
        else if (c.id === 'pet_magnet') this.pet.magnetR += def.value;
      }
    } else {
      this.upgrades.apply(c, this.skills, this.player);
    }
    if (mode === 'spell') this.pendingSpellRewards = Math.max(0, this.pendingSpellRewards - 1);
    else this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.player.level = this.progression.level;
    if (this.config.game_config.save.save_on_important_events) this.save.save();
    if (opts.deferClose) return c;
    // Закрыть текущее окно и, если остались награды, открыть следующее.
    this._finishUpgradeChoice();
    return c;
  }

  _finishUpgradeChoice() {
    this._hiddenHudUpgrade = null;
    this.choices = [];
    this.choiceMode = 'levelup';
    this.states.set('playing');
    this._openNextPendingModal(false);
  }

  // Куда должна прилететь иконка выбранного апгрейда: в свой слот HUD
  // (существующий или только что добавленный) либо к питомцу.
  _hudSlotForChoice(choice, W, H) {
    if (!choice) return null;
    if (choice.kind === 'pet') {
      if (this.pet) {
        const x = this.pet.x - this.camera.x + W / 2;
        const y = this.pet.y - this.camera.y + H / 2;
        return {
          kind: 'pet',
          x: Math.max(24, Math.min(W - 24, x)),
          y: Math.max(90, Math.min(H - 90, y)),
          size: 44
        };
      }
      return { kind: 'pet', x: W / 2, y: H - 100, size: 44 };
    }
    const slots = this.hud.skillSlots(this, W, H);
    if (choice.kind === 'passive') {
      const s = slots.passives.find((slot) => slot.item.id === choice.id);
      return s ? { kind: 'passive', x: s.x, y: s.y, size: slots.size } : null;
    }
    if (choice.kind === 'weapon' || choice.kind === 'newWeapon') {
      const s = slots.actives.find((slot) => slot.item.cfg.id === choice.id);
      return s ? { kind: 'weapon', x: s.x, y: s.y, size: slots.size } : null;
    }
    return null;
  }

  // Открывает следующее окно выбора: сначала повышения уровня, затем
  // заклинания из сундуков. Каждая награда — отдельный выбор из 3 карточек.
  // announce=false — следующий выбор из пачки: без полного вихря и звука.
  _openNextPendingModal(announce = true) {
    if (this.states.is('upgrade')) return;
    // Попап замены питомца показываем первым; выбор наград откроется после него.
    if (this.uiPetSwap) return;
    if (this.pendingLevels > 0) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3, Math.random, this._petCtx());
      if (this.choices.length) {
        this.choiceMode = 'levelup';
        if (announce) {
          try { this.audio.playSfx('levelup.mp3'); } catch (e) {}
        }
        this.states.set('upgrade');
        this._startUpgradeModal(announce);
        this._modalTs = performance.now();
        return;
      }
      this.pendingLevels = 0;
    }
    if (this.pendingSpellRewards > 0) {
      this.choices = this.upgrades.buildWeaponChoices(this.skills, this.config.balance_config.progression.upgrade_options_count || 3, Math.random);
      if (this.choices.length) {
        this.choiceMode = 'spell';
        this.states.set('upgrade');
        this._startUpgradeModal(false);
        this._modalTs = performance.now();
        return;
      }
      this.pendingSpellRewards = 0;
    }
  }

  // Запуск визуальной части окна выбора. Полный кинематографичный вход —
  // только для первого уровня из пачки; следующие показываем сразу с карточками.
  _startUpgradeModal(announce) {
    this._hiddenHudUpgrade = null;
    const W = this.canvas ? this.canvas.width : 480;
    const H = this.canvas ? this.canvas.height : 800;
    if (this.choiceMode === 'levelup') {
      const shownLevel = Math.max(1, (this.progression.level || 1) - this.pendingLevels + 1);
      this.upgradeMenu.startLevelUp(shownLevel, announce, W, H);
    } else {
      this.upgradeMenu.startSpell(W, H);
    }
  }

  _petCtx() {
    return { hasPet: !!this.pet, levels: this.petLevels || {} };
  }

  // Замена питомца (клетка/сундук): лишний питомец улетает свободным за край
  // экрана, новый надевается на место старого. Без продажи за монеты.
  doPetSwap() {
    const d = this.uiPetSwap;
    if (!d || !d.new) return;
    // старый питомец становится лишним — улетает от игрока
    if (d.old) {
      const ox = this.pet ? this.pet.x : this.player.x;
      const oy = this.pet ? this.pet.y : this.player.y - 40;
      this._spawnFleeingPet(d.old, ox, oy);
    }
    this.save.data.gear.pet = JSON.parse(JSON.stringify(d.new));
    this.save.save();
    // обновить боевого питомца на месте (без рестарта забега)
    const pcfg = (this.shop.cfg.pet || {});
    this.pet = new Pet(this.player.x, this.player.y - 40,
      (d.new.stats[0] || {}).value || 200, pcfg.speed || 260, pcfg.magnet_radius || 60, {
        fetchPotions: !!d.new.fetch_potions,
        fetchCoins: d.new.fetch_coins !== false,
        fetchXp: d.new.fetch_xp !== false,
        carryLimit: d.new.carry_limit || 3
      });
    this.pet.tpl = d.new.tpl;
    // спрайт питомца из шаблона (как при старте забега)
    const tpl = this.shop.tplById.get(d.new.tpl);
    if (tpl && tpl.sprite) {
      this.pet.sprite = tpl.sprite;
      this.pet.sprite_frames = tpl.sprite_frames;
    }
    this.petLevels = {};
    this.uiPetSwap = null;
    this._openNextPendingModal(false);
  }

  // Игрок оставил своего питомца — питомец из клетки улетает свободным.
  _closePetSwap(keepOld = true) {
    const d = this.uiPetSwap;
    if (!d) return;
    if (keepOld && d.new) {
      const x = (typeof d.x === 'number') ? d.x : this.player.x;
      const y = (typeof d.y === 'number') ? d.y : this.player.y;
      this._spawnFleeingPet(d.new, x, y);
    }
    this.uiPetSwap = null;
    this._openNextPendingModal(false);
  }

  _initRun() {
    const g = this.config.game_config, b = this.config.balance_config, s = this.config.skills_config;
    // Банк уже записанной в мету части забега (защита от двойного учёта
    // при revive -> повторная смерть и при выходе в меню). Сбрасывается
    // каждый новый забег.
    this._bankedTime = 0;
    this._bankedKills = 0;
    this._bankedCoins = 0;
    this._bankedFav = {};
    this._dying = false;
    // Надетое снаряжение -> стартовые статы
    const gear = this.save.data.gear || {};
    const mods = this.shop ? this.shop.gearMods(gear) : null;
    const base = Object.assign({}, b.player);
    if (mods) {
      base.base_hp = Math.round(base.base_hp + mods.hpAdd);
      base.base_speed = Math.round(base.base_speed * mods.speedMul);
      base.damage_multiplier = base.damage_multiplier * mods.dmgMul;
      base.attack_speed_multiplier = base.attack_speed_multiplier * mods.atkMul;
      base.pickup_radius_multiplier = base.pickup_radius_multiplier * mods.pickupMul;
      base.crit_chance = Math.min(0.6, base.crit_chance + mods.critAdd);
      base.hp_regen_per_sec = base.hp_regen_per_sec + mods.regenAdd;
      base.xp_multiplier = base.xp_multiplier * mods.xpMul;
    }
    this.player = new Player(base, 0, 0);
    this.player.attachHeroAnim(new Animator(g.hero.frames, 'idle'));
    this.player.flashColor = g.visuals.hurt_flash_color || '#ff0000';
    this.player.hurtDur = (g.visuals.hurt_flash_duration_ms || 250) / 1000;
    const heroVisual = g.hero.procedural || {};
    this.player.castDuration = (heroVisual.cast_duration_ms ?? 430) / 1000;
    this.player.deathDuration = (heroVisual.death_duration_ms ?? 1100) / 1000;
    this.heroMage = new HeroMageRenderer(heroVisual);
    this._deathPending = false;
    this._deathTimer = 0;
    this.enemies = [];
    this.pickups = [];
    this.props = [];
    this.fx = new EffectSystem(this.config.effects_config, this.assets);
    const stFx = (b.status_effects || {});
    this.particles = new ParticleSystem(stFx.particle_budget || 300);
    // состояние UI аптечки/питомцев на новый забег
    this.hpDisplay = this.player.hp;
    this.potionFlyers = [];
    this.healQueue = [];
    this.healAnim = null;
    this.fleeingPets = [];
    this.uiPetSwap = null;
    // --- сброс прогресса забега: заклинания не переносятся между забегами ---
    // Оставляем только дефолтные (unlocked_by_default). Заклинания, полученные
    // в предыдущем забеге (сундуки, апгрейды), должны сбрасываться при "Заново".
    const defaultSpells = (s.weapons || [])
      .filter((w) => w.unlocked_by_default === true)
      .map((w) => w.id);
    this.save.data.unlockedSpells = defaultSpells;

    // Сбросить runtime-флаги unlocked на объектах конфига к дефолтным,
    // иначе флаги из прошлого забега (w.unlocked = true) переносятся.
    for (const w of (s.weapons || [])) {
      w.unlocked = !!w.unlocked_by_default;
    }

    // заклинания: дефолтные + купленные (сейв) + надетый посох (с его уровнем)
    const byId = new Map((s.weapons || []).map((w) => [w.id, w]));
    for (const id of (this.save.data.unlockedSpells || [])) {
      const w = byId.get(id);
      if (w) w.unlocked = true;
    }
    const staffLv = {};
    if (this.shop) {
      for (const { spell, level } of this.shop.staffSpells(gear)) {
        const w = byId.get(spell);
        if (w) {
          w.unlocked = true;
          staffLv[spell] = Math.max(staffLv[spell] || 0, level);
        }
        if (!this.save.data.unlockedSpells.includes(spell)) this.save.data.unlockedSpells.push(spell);
      }
    }
    this.combat = new CombatSystem(g, b);
    this.spawn = new SpawnSystem(b.waves, b.monsters);
    this.skills = new SkillSystem(s.weapons, this.combat, this.audio, this.assets);
    const active = (s.weapons || []).filter((w) => w.unlocked).map((w) => w.id);
    this.skills.setActive(active.length ? active : ['magic_bolt']);
    for (const [id, st] of this.skills.weapons) {
      if (staffLv[id]) st.level = Math.max(st.level, Math.min(staffLv[id], st.cfg.max_level || 5));
    }
    // питомец из слота (если куплен)
    this.pet = null;
    this.petLevels = {};
    const petItem = gear.pet;
    if (petItem && petItem.stats && petItem.stats[0] && petItem.stats[0].value > 0) {
      this.pet = new Pet(this.player.x, this.player.y - 40, petItem.stats[0].value,
        (this.shop.cfg.pet || {}).speed || 260, (this.shop.cfg.pet || {}).magnet_radius || 60,
        {
          fetchPotions: !!petItem.fetch_potions,
          fetchCoins: petItem.fetch_coins !== false,
          fetchXp: petItem.fetch_xp !== false,
          carryLimit: petItem.carry_limit || 3
        });
      this.pet.tpl = petItem.tpl;
      // спрайт питомца из шаблона
      const tpl = this.shop.tplById.get(petItem.tpl);
      if (tpl && tpl.sprite) {
        this.pet.sprite = tpl.sprite;
        this.pet.sprite_frames = tpl.sprite_frames;
      }
    }
    this.progression = new ProgressionSystem(b.progression);
    this.upgrades = new UpgradeSystem(s, this.config.localization, this.settings.lang, this.config.items_config.pet_upgrades);
    this.chestSys = new ChestSystem(b.chests, b.cages);
    this.loot = new LootSystem(b.loot);
    this.enemyProjById = new Map();
    for (const p of (s.enemy_projectiles || [])) this.enemyProjById.set(p.id, p);
    this.time = 0;
    this.pendingLevels = 0;
    this.pendingSpellRewards = 0;
    this.choiceMode = 'levelup';
    this.choices = [];
    this._hiddenHudUpgrade = null;
    this.bossWarn = null;
    this.reviveUsed = false;
    this.uiInventory = false;
    this.runStats = { time: 0, level: 1, kills: 0, coins: 0, record: false };
    if (b.waves.first_spawn_trigger_on_chest && b.chests.enabled) {
      // Стартовый сундук (тестовый): тип/позиция в balance_config.chests.start_chest.
      const sc = b.chests.start_chest || {};
      if (sc.enabled !== false) {
        const typeId = sc.type || 'wooden';
        const startType = b.chests.types.find((t) => t.id === typeId)
          || b.chests.types.find((t) => t.id === 'wooden')
          || b.chests.types[0];
        if (startType) this.chestSys.chests.push(new Chest(startType, sc.x ?? 150, sc.y ?? 0));
      }
    }
    // Тестовая клетка с вороном в начале забега (убрать: cages.test_cage.enabled=false)
    const cg = b.cages || {};
    if (cg.enabled !== false && cg.test_cage && cg.test_cage.enabled) {
      const type = (cg.types || []).find((t) => t.id === cg.test_cage.type);
      const cage = this._makeCage(type, cg.test_cage.x ?? -150, cg.test_cage.y ?? 0);
      if (cage) this.chestSys.cages.push(cage);
    }
    this.camera.snap(0, 0);
  }

  _onKill(e, weaponId) {
    // Босс при смерти сбрасывает рывок/залп (иначе тик по мёртвому)
    if (e && e.isBoss) {
      e.dashState = 'idle'; e.dashT = 0;
      e.volleyT = 0; e.volleyFired = false;
    }
    for (const p of this.loot.dropFor(e)) this.pickups.push(p);
    // эффект смерти по hit_effect оружия (дефолт — искра)
    let fxId = 'hit_spark';
    if (weaponId) {
      const st = this.skills.weapons.get(weaponId);
      if (st && st.cfg.hit_effect) fxId = st.cfg.hit_effect;
    }
    if (this.fx) this.fx.play(fxId, e.x, e.y);
  }

  // --- Логика боссов: стрельба / рывок + удар / залп ---
  // Паттерн из конфига (boss_pattern), выбор типа — в SpawnSystem по boss_order_min:
  //   волны 1–3: dendroid (shooter) — медленный, стреляет одиночными;
  //   волны 4–6: cyclops (dasher) — быстрее, рывок + удар по площади;
  //   волны 7+:  dragon (shooter_volley) — рывок + удар и веерный залп.
  // Возвращает override движения или null (идти как обычно):
  //   { hold:true } — стоять (телеграф/замах), { dash,dx,dy,spdOverride } — рывок.
  _updateBoss(e, dt, dist) {
    const pattern = e.cfg.boss_pattern || 'shooter';
    // 1) Одиночный выстрел (дендроид и дракон): как ranged-моб
    if (pattern === 'shooter' || pattern === 'shooter_volley') {
      if (e.attackCd <= 0 && dist < (e.cfg.attack_range || 400)) {
        const proj = this.enemyProjById.get(e.cfg.projectile_id);
        if (proj) {
          this.skills.enemyFire(e.x, e.y, this.player.x, this.player.y, proj, e.damage);
          e.attackCd = (e.cfg.attack_cooldown_ms || 1800) / 1000;
          e.playAttack();
          return null;
        }
      }
      // walk не перебиваем attack (attackT) и фазы рывка (dashState)
      if (e.attackT <= 0 && e.dashState === 'idle') {
        try { e.setAnim('walk'); } catch (err) {}
      }
    }
    // 2) Веерный залп дракона: count снарядов с разбросом spread_deg,
    // урон каждого = урон босса × volley.damage_mul (1.5)
    if (pattern === 'shooter_volley') {
      const v = e.cfg.volley || {};
      e.volleyT -= dt;
      if (e.volleyT <= 0 && dist < (e.cfg.attack_range || 400) + 100) {
        e.volleyT = (v.cooldown_ms || 2200) / 1000;
        const proj = this.enemyProjById.get(e.cfg.projectile_id);
        if (proj) {
          const n = v.count || 7;
          const spread = ((v.spread_deg ?? 50) * Math.PI) / 180;
          const dmg = Math.max(0, Math.round(e.damage * (v.damage_mul || 1.5)));
          const baseA = Math.atan2(this.player.y - e.y, this.player.x - e.x);
          for (let i = 0; i < n; i++) {
            const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
            const a = baseA + off;
            this.skills.enemyFireDir(e.x, e.y, Math.cos(a), Math.sin(a), proj, dmg);
          }
          try { this.audio.playSfx('explosion.mp3'); } catch (err) {}
        }
      }
    }
    // 3) Рывок + удар (циклоп и дракон): телеграф -> замах -> рывок до
    // игрока -> удар. Направление и скорость фиксируются в bossDashTick
    // по текущей позиции игрока на старте рывка (конец замаха).
    const dash = e.cfg.dash;
    if (dash && pattern !== 'shooter') {
      if (e.dashState === 'idle') {
        if ((e.dashCd || 0) > 0) e.dashCd -= dt;
        else e.tryStartDash(this.player.x, this.player.y);
        return null; // идём к игроку как обычно
      }
      const r = e.bossDashTick(dt, this.player.x, this.player.y);
      if (r.mode === 'hold') {
        // Телеграф/замах: стоим, мигаем
        e.hitFlash = Math.max(e.hitFlash || 0, 0.06);
        return { hold: true };
      }
      if (r.mode === 'dash') {
        e._bossDmgMul = r.dmgMul || 1;
        // Удар — в КОНЦЕ рывка (долетели до игрока), а не в начале
        if (r.finished) {
          if (!e.dashHitDone) {
            e.dashHitDone = true;
            this._bossSlam(e);
          }
          return null; // рывок окончен — дальше обычное движение
        }
        const spd = e.dashSpd > 0 ? e.dashSpd : e.speed * (dash.speed_mul || 4);
        // Во время рывка летим строго по зафиксированному направлению
        return { dash: true, dx: e.dashDx, dy: e.dashDy, spdOverride: spd };
      }
    }
    return null;
  }

  // Удар по площади в точке рывка: урон всем в hit_radius + отброс.
  // Один раз за рывок (флаг dashHitDone в _updateBoss).
  _bossSlam(e) {
    // strike_at_end (по умолчанию true): удар в конце рывка, в точке игрока.
    // Если выключен — удар в начале рывка (старое поведение).
    const dash = e.cfg.dash || {};
    const R = dash.hit_radius || 70;
    const mul = dash.contact_mul || 1.5;
    const dx = this.player.x - e.x, dy = this.player.y - e.y;
    if (dx * dx + dy * dy < (R + this.player.radius) * (R + this.player.radius)) {
      this.player.takeContactDamage(Math.max(0, Math.round(e.damage * mul)));
    }
    // Эффект + отброс мелочи рядом (визуальный акцент удара)
    if (this.fx) this.fx.play('explosion_burst', e.x, e.y);
    try { this.audio.playSfx('explosion.mp3'); } catch (err) {}
    for (const o of this.enemies) {
      if (o === e || !o.alive || o.deathT > 0 || o.isBoss) continue;
      const ox = o.x - e.x, oy = o.y - e.y;
      const d = Math.hypot(ox, oy) || 1;
      if (d < R + o.radius) {
        o.knockX += (ox / d) * 300; o.knockY += (oy / d) * 300;
      }
    }
  }

  // эффект попадания по hit_effect оружия + молния + следующий прыжок цепи
  _onHit(p, e) {
    this.skills.registerHitFx(p, e);
    // цепь прыгает дальше только если остались прыжки (pierce ещё не списан:
    // Combat уменьшает его сразу после onHit). Нет целей рядом — цепь гаснет.
    if (p.chainRange > 0 && p.pierce > 0) {
      this.skills.chainNext(p, this.enemies, e.x, e.y, Math.random);
    }
    if (p.weaponId) {
      const st = this.skills.weapons.get(p.weaponId);
      if (st && st.cfg.hit_effect && this.fx) this.fx.play(st.cfg.hit_effect, e.x, e.y);
    }
  }

  // --- пропсы окружения: плотность вокруг игрока, slowdown, push-out ---
  _updateProps(dt) {
    void dt;
    const defs = this.config.balance_config.environment_props || [];
    if (!defs.length) return;
    const P = this.player;
    // чистка далёких
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      if (Math.hypot(pr.x - P.x, pr.y - P.y) > 1200) this.props.splice(i, 1);
    }
    // плотность ~40 в кольце 500–950
    let guard = 0;
    while (this.props.length < 40 && guard++ < 12) {
      const a = Math.random() * Math.PI * 2;
      const r = 500 + Math.random() * 450;
      // collidable реже (30%)
      const solids = defs.filter((d) => d.collidable);
      const softs = defs.filter((d) => !d.collidable);
      const pool = (Math.random() < 0.3 && solids.length) ? solids : (softs.length ? softs : defs);
      const cfg = pool[(Math.random() * pool.length) | 0];
      // variability>1: случайный вариант внешности из N строк спрайта
      this.props.push(new Prop(cfg, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, Prop.pickVariant(cfg, Math.random)));
    }
  }

  _propSlow(x, y) {
    let f = 1;
    for (const pr of this.props) {
      if (pr.cfg.collidable || !pr.alive) continue;
      const s = pr.cfg.slowdown_factor || 1;
      if (s >= 1) continue;
      const dx = x - pr.x, dy = y - pr.y;
      const rr = pr.radius + 16;
      if (dx * dx + dy * dy < rr * rr && s < f) f = s;
    }
    return f;
  }

  // Раздвижка с непроходимыми пропсами (игрок / монстры — по collisions из конфига)
  _pushOut(ent, isPlayer) {
    const col = this.config.game_config.collisions;
    if (isPlayer && !col.player_collides_with_props) return;
    if (!isPlayer && !col.monsters_collide_with_props) return;
    for (const pr of this.props) {
      if (!pr.cfg.collidable || !pr.alive) continue;
      const dx = ent.x - pr.x, dy = ent.y - pr.y;
      const rr = ent.radius + pr.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        ent.x = pr.x + (dx / d) * rr;
        ent.y = pr.y + (dy / d) * rr;
      }
    }
  }

  // Тайловый пол из visuals.ground (world space, вызывается под камерой).
  // variability>1: вариант тайла детерминированно выбирается из координат ячейки,
  // чтобы мозаика не «мерцала» при движении камеры.
  _drawGround(ctx, W, H) {
    const gr = this.config.game_config.visuals.ground;
    if (!gr || !gr.sprite) return;
    const img = this.assets.get(gr.sprite);
    if (!img || img.tagName === 'CANVAS') return; // нет арта — остаётся background_color
    const ts = gr.tile_size || 736;
    const cx = this.camera.x, cy = this.camera.y;
    const x0 = Math.floor((cx - W / 2) / ts) * ts;
    const y0 = Math.floor((cy - H / 2) / ts) * ts;
    const x1 = cx + W / 2, y1 = cy + H / 2;
    const vars = Math.max(1, gr.variability || 1);
    for (let x = x0; x < x1; x += ts) {
      for (let y = y0; y < y1; y += ts) {
        let src = img;
        if (vars > 1) {
          // хеш ячейки -> вариант 0..vars-1 (строка v*ts в атласе)
          const h = ((x / ts) * 73856093 ^ (y / ts) * 19349663) >>> 0;
          const v = h % vars;
          src = this._groundVariant(v, img, ts, vars);
        }
        ctx.drawImage(src, x, y, ts, ts);
      }
    }
  }

  // Кэш нарезки варианта тайла из вертикального атласа (vars строк по ts).
  _groundVariant(v, img, ts, vars) {
    if (!this._groundCache) this._groundCache = new Map();
    const key = v + ':' + img.src;
    let c = this._groundCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = ts; c.height = ts;
      c.getContext('2d').drawImage(img, 0, v * ts, ts, ts, 0, 0, ts, ts);
      this._groundCache.set(key, c);
    }
    return c;
  }

  _drawProps(ctx) {
    for (const pr of this.props) {
      if (!pr.alive) continue;
      this._drawProp(ctx, pr);
    }
  }

  _drawProp(ctx, pr) {
    const img = this.assets.get(pr.cfg.sprite);
    if (img && img.tagName !== 'CANVAS') {
      pr.draw(ctx, this.assets, pr.cfg.sprite, pr.w, pr.h, 1, '#555');
    } else if (pr.cfg.collidable) {
      ctx.fillStyle = '#4a4a5e';
      ctx.fillRect(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2);
      ctx.strokeStyle = '#888';
      ctx.strokeRect(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _chestSpawnPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 400 + Math.random() * 400;
    return { x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r };
  }

  // Создать клетку по типу из balance_config.cages.types.
  // Питомец-оффер роллится как предмет (шаблон + фиксированная редкость).
  _makeCage(typeCfg, x, y) {
    if (!typeCfg || !this.shop) return null;
    const tpl = this.shop.tplById.get(typeCfg.pet_template);
    if (!tpl) return null;
    const offer = this.shop.rollOffer(tpl, Math.random, typeCfg.rarity);
    const rarity = this.shop.rarById.get(typeCfg.rarity);
    return new Cage(typeCfg, this.config.balance_config.cages || {}, x, y, {
      tpl: tpl.id,
      offer,
      sprite: tpl.sprite || '',
      frames: tpl.sprite_frames || null,
      rarityColor: rarity ? rarity.color : '#ffd34d'
    });
  }

  // Клетка сломана: окно выбора питомца (мир на паузе до решения игрока).
  _openCage(c) {
    if (!c || !c.petInfo || !c.petInfo.offer) return;
    this.uiPetSwap = {
      old: this.save.data.gear.pet || null,
      new: c.petInfo.offer,
      source: 'cage',
      x: c.x,
      y: c.y,
      titleKey: 'cage_swap_title'
    };
    const cfg = this.config.balance_config.cages || {};
    if (this.fx) this.fx.play(this.config.balance_config.chests.open_effect_id || 'chest_burst', c.x, c.y);
    try { this.audio.playSfx(cfg.sfx_break || this.config.balance_config.chests.sfx_open); } catch (e) {}
    this._modalTs = performance.now();
  }

  _openChest(c, reward) {
    // Лут вылетает вокруг сундука (кольцом) и подбирается как обычный дроп.
    // Все цифры разлёта — из balance.chests.loot_scatter.
    const ls = (this.config.balance_config.chests || {}).loot_scatter || {};
    const r0 = ls.scatter_radius ?? 12;
    const sMin = ls.scatter_speed_min ?? 140;
    const sMax = ls.scatter_speed_max ?? 320;
    const specs = Chest.scatterLoot(reward, ls, Math.random);
    for (const s of specs) {
      const p = new Pickup(s.kind, c.x, c.y, s.value);
      const speed = sMin + Math.random() * Math.max(0, sMax - sMin);
      p.launchFrom(c.x, c.y, s.angle, speed, r0);
      this.loot.applySprite(p);
      this.pickups.push(p);
    }
    // Заклинания из сундука — не выдаём автоматически: игрок выбирает
    // одну из 3 карточек (окно откроется в конце кадра). Уровни — сразу,
    // их апгрейды выберутся в следующих окнах.
    const spellRewards = Math.max(0, reward.spells || 0);
    if (spellRewards > 0) this.pendingSpellRewards += spellRewards;
    if (reward.levels > 0) {
      const ups = this.progression.grantLevels(reward.levels);
      this.pendingLevels += ups;
    }
    this.combat.pushText(c.x, c.y - 24, '+' + (reward.coins || 0), '#ffd34d');
    if (this.fx) this.fx.play(this.config.balance_config.chests.open_effect_id || 'chest_burst', c.x, c.y);
    try { this.audio.playSfx(this.config.balance_config.chests.sfx_open); } catch (e) {}
    if (this.config.game_config.save.save_on_important_events) this.save.save();
  }

  // Сколько HP восстанавливает одна аптечка (значение из balance.loot).
  _potionHealAmount() {
    const v = this.config.balance_config.loot.health_potion_heal_hp;
    return Number.isFinite(v) && v > 0 ? v : 20;
  }

  _collect(p) {
    p.alive = false;
    if (p.kind === 'xp') {
      const ups = this.progression.addXP(p.value * (this.player.xpMul || 1));
      this.player.level = this.progression.level;
      this.pendingLevels += ups;
      if (this.fx) this.fx.play('pickup_xp', p.x, p.y);
    } else if (p.kind === 'coin') {
      this.player.coins += p.value;
    } else if (p.kind === 'potion') {
      this._collectPotion(this._potionHealAmount(), p.x, p.y);
    } else if (p.kind === 'magnet') {
      for (const o of this.pickups) o.magnetized = true;
    } else if (p.kind === 'bomb') {
      for (const e of this.enemies) {
        if (!e.alive || e.deathT > 0) continue;
        const was = e.hp;
        e.takeDamage(150, 0, 0);
        if (e.hp <= 0 && was > 0) { this.combat.addKill(null); this._onKill(e, null); }
      }
      this.combat.pushText(this.player.x, this.player.y - 30, 'BOOM', '#ff8800');
    }
  }

  // Аптечка: HP применяется сразу (смерть из-за задержки невозможна),
  // а шкала догоняет: иконка летит к HUD, затем 5–6 с заполнения.
  _collectPotion(amount, wx, wy) {
    if (!this.player || !this.player.alive) return 0;
    const h = this.player.heal(amount);
    // В цифре всегда показываем номинальное значение аптечки из конфига,
    // а не фактический остаток до полного HP (иначе выходило «+17.999999996»).
    // Цифра появляется даже при полном HP; шкала заполняется только на h.
    const shown = Math.max(0, Math.round(Number(amount) || 0));
    if (this.combat) {
      this.combat.pushText(this.player.x, this.player.y - 30, '+' + shown, '#00ff88');
    }
    if (h <= 0) return 0;
    const hu = this.config.balance_config.health_ui || {};
    const W = this.canvas.width, H = this.canvas.height;
    const bar = this.hud.hpBarRect(this, W);
    const tx = bar.x + bar.w / 2, ty = bar.y + bar.h / 2;
    const sx = wx - this.camera.x + W / 2;
    const sy = wy - this.camera.y + H / 2;
    const dist = Math.hypot(tx - sx, ty - sy);
    const speed = hu.potion_fly_speed || 900;
    const minMs = hu.potion_fly_min_ms ?? 220;
    const maxMs = hu.potion_fly_max_ms ?? 700;
    const durMs = Math.max(minMs, Math.min(maxMs, (dist / speed) * 1000));
    this.potionFlyers.push({
      wx, wy, tx, ty, t: 0,
      dur: Math.max(0.001, durMs / 1000),
      amount: h
    });
    return h;
  }

  // Полёт иконок аптечек + плавное заполнение шкалы (профиль 15/70/15).
  _updateHealthUI(dt) {
    if (!this.player) return;
    const hu = this.config.balance_config.health_ui || {};
    for (let i = this.potionFlyers.length - 1; i >= 0; i--) {
      const f = this.potionFlyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        this.potionFlyers.splice(i, 1);
        if (f.amount > 0) this.healQueue.push(f.amount);
      }
    }
    // урон показываем сразу: шкала не должна опережать реальное HP
    if (this.player.hp < this.hpDisplay) {
      this.hpDisplay = this.player.hp;
      if (this.healAnim) {
        this.healAnim.end = Math.min(this.healAnim.end, this.player.hp);
        if (this.healAnim.end <= this.hpDisplay) this.healAnim = null;
      }
    }
    if (!this.healAnim && this.healQueue.length) {
      const amount = this.healQueue.shift();
      const start = this.hpDisplay;
      // Верхняя граница — и этот прирост, и реальное HP: урон, полученный
      // после подбора, не даёт шкале «дорисовать» уже потерянное здоровье.
      const end = Math.min(this.player.maxHp, this.player.hp, start + amount);
      const dur = healFillDuration(amount, this.player.maxHp, hu);
      this.healAnim = { start, end, t: 0, dur: Math.max(0.001, dur) };
    }
    if (this.healAnim) {
      const a = this.healAnim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      this.hpDisplay = a.start + (a.end - a.start) * healEase(k, hu);
      if (k >= 1) {
        this.hpDisplay = a.end;
        this.healAnim = null;
      }
    } else if (!this.potionFlyers.length && !this.healQueue.length && this.player.hp > this.hpDisplay) {
      // реген/бонусы вне аптечки: плавно догоняем (но не во время полёта иконки)
      this.hpDisplay += (this.player.hp - this.hpDisplay) * Math.min(1, dt * 6);
      if (this.player.hp - this.hpDisplay < 0.5) this.hpDisplay = this.player.hp;
    }
    // шкала никогда не показывает больше реального HP
    this.hpDisplay = Math.max(0, Math.min(this.player.maxHp, this.player.hp, this.hpDisplay));
  }

  // Лишний питомец улетает свободным за край экрана (визуал, без логики).
  _spawnFleeingPet(item, x, y) {
    if (!item || !this.shop) return;
    const tpl = this.shop.tplById.get(item.tpl);
    const cfg = this.config.balance_config.cages || {};
    let ax = x - this.camera.x;
    let ay = y - this.camera.y;
    if (Math.hypot(ax, ay) < 24) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      ax = Math.cos(a); ay = Math.sin(a);
    }
    const len = Math.hypot(ax, ay) || 1;
    ax /= len; ay /= len;
    const speed = cfg.fly_away_speed || 420;
    // Сколько лететь до края экрана по выбранному направлению (плюс запас).
    const W = this.canvas.width, H = this.canvas.height;
    const margin = cfg.fly_away_margin ?? 80;
    const sx = x - this.camera.x + W / 2;
    const sy = y - this.camera.y + H / 2;
    let tx = Infinity, ty = Infinity;
    if (ax > 1e-6) tx = (W + margin - sx) / ax;
    else if (ax < -1e-6) tx = (-margin - sx) / ax;
    if (ay > 1e-6) ty = (H + margin - sy) / ay;
    else if (ay < -1e-6) ty = (-margin - sy) / ay;
    const exitDist = Math.max(40, Math.min(tx, ty));
    const minDur = (cfg.fly_away_min_ms ?? 500) / 1000;
    const maxDur = (cfg.fly_away_max_ms ?? 2500) / 1000;
    const dur = Math.max(minDur, Math.min(maxDur, exitDist / speed));
    const rar = this.shop.rarById.get(item.rarity);
    this.fleeingPets.push({
      x, y,
      vx: ax * speed,
      vy: ay * speed,
      sprite: (tpl && tpl.sprite) || '',
      frames: (tpl && tpl.sprite_frames) || null,
      facing: ax >= 0 ? 1 : -1,
      t: 0,
      dur,
      size: cfg.pet_size || 44,
      rarityColor: rar ? rar.color : '#ffd34d'
    });
  }

  _updateFleeingPets(dt) {
    for (let i = this.fleeingPets.length - 1; i >= 0; i--) {
      const f = this.fleeingPets[i];
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.t >= f.dur) this.fleeingPets.splice(i, 1);
    }
  }

  // Не переключаем экран смерти мгновенно: сначала даём магу упасть.
  // Вызывается и в начале кадра (если смерть уже случилась), и в конце
  // (если игрок погиб именно в этом кадре от контактного урона).
  _beginDeathAnimation() {
    if (!this.player || this.player.alive || this._deathPending || this._dying) return false;
    this.player.startDeath();
    this._deathPending = true;
    this._deathTimer = this.player.deathDuration ?? 1.1;
    return true;
  }

  async _die() {
    if (this._dying) return; // защита от повторного входа (мир продолжает тикать до смены состояния)
    this._dying = true;
    // не оставляем модалку клетки/аптечку поверх экрана смерти
    this.uiPetSwap = null;
    this.potionFlyers.length = 0;
    this.healQueue.length = 0;
    this.healAnim = null;
    this.deaths++;
    // коммит дельты забега в мету (revive + повторная смерть не задваивают totals)
    const { record } = this._commitRunStats();
    this.runStats = {
      time: this.time,
      level: this.progression.level,
      kills: this.combat.kills,
      coins: this.player.coins,
      record
    };
    if (record) this.submitScore();
    await this._maybeInterstitial(); // реклама ДО окна (ГДД п.6.8)
    this.states.set('gameover');
    try { this.audio.stopMusic(); this.audio.playSfx('gameover.mp3'); } catch (e) {}
  }

  frame(t) {
    // Любое исключение в update/render не должно убивать игровой цикл:
    // иначе экран замирает на последнем кадре без HUD и без реакции на ввод.
    try {
      this._frameInner(t);
    } catch (e) {
      console.error('frame error:', e);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  _frameInner(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt >= 0) || dt > 0.05) dt = Math.min(Math.max(dt || 0.016, 0), 0.05);
    this._fpsAcc += dt; this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0; }
    const st = this.states.get();
    const paused = st === 'paused' || document.hidden;
    // Модалка могла открыться в прошлом кадре (levelup из update, попапы из
    // тапов): фиксируем момент ДО обработки новых тапов. JS однопоточен —
    // тач-события приходят только между кадрами, поэтому проверка до и после
    // update закрывает гонку полностью: палец, лёгший до модалки, протухает.
    this._syncModalTs();
    if (!paused && (st === 'playing' || st === 'upgrade')) this.update(dt);
    this._syncModalTs();
    if (this.uiShop) this.shopMenu.update(dt);
    this.render();
  }

  // Модалка = любое состояние/попап, перекрывающее мир и ловящее тапы.
  _isModal() {
    const st = this.states.get();
    return st === 'upgrade' || st === 'paused' || st === 'gameover' || st === 'ads'
      || !!this.uiPetSwap || !!this.uiInventory || !!this.uiSettings || !!this.uiShop
      || !!this.uiBonus || !!this.uiStats || !!this.uiLeaders;
  }

  _syncModalTs() {
    const m = this._isModal();
    if (m && !this._wasModal) this._modalTs = performance.now();
    this._wasModal = m;
  }

  update(dt) {
    // Пауза мира с живой анимацией цифр: levelup, инвентарь, модалка питомца
    if (this.states.is('upgrade') || (this.uiInventory && this.states.is('playing')) || this.uiPetSwap) {
      this.combat.updateTexts(dt);
      // аптечка/шкала HP продолжают анимацию и во время модалки
      this._updateHealthUI(dt);
      // levelup-кинематик и полёт иконки живут, пока мир на паузе
      if (this.states.is('upgrade') && this.upgradeMenu) {
        this.upgradeMenu.update(dt, this, this.canvas.width, this.canvas.height);
      }
      return;
    }
    this.time += dt;
    // Смерть: короткая кинематическая пауза (падение мага + душа), затем gameover.
    if (!this.player.alive) {
      this._beginDeathAnimation();
      this.player.updateDeath(dt);
      this.camera.update(dt, this.player.x, this.player.y, this.canvas.width, this.canvas.height);
      this.combat.updateTexts(dt);
      if (this.fx) this.fx.update(dt);
      if (this.particles) this.particles.update(dt);
      this._updateHealthUI(dt);
      this._deathTimer -= dt;
      if (this._deathTimer <= 0 && !this._dying) {
        this._deathPending = false;
        this._die();
      }
      return;
    }
    const v = this.input.getVector();
    const slow = this._propSlow(this.player.x, this.player.y);
    this.player.update(dt, { x: v.x * slow, y: v.y * slow });
    this.player.level = this.progression.level;
    // крит из статов игрока (снаряжение + пассивки), а не из базового конфига
    this.combat.critChance = this.player.critChance;
    this.combat.critMul = this.player.critMul;
    this.camera.update(dt, this.player.x, this.player.y, this.canvas.width, this.canvas.height);
    this._updateProps(dt);
    this._pushOut(this.player, true);
    if (this.fx) this.fx.update(dt);

    const fresh = this.spawn.update(dt, {
      player: this.player, enemies: this.enemies, viewW: this.canvas.width, viewH: this.canvas.height
    });
    for (const raw of fresh) {
      if (raw.isBoss) {
        const b = new Boss(raw.cfg, raw.x, raw.y, ConfigLoader.t(this.config.localization, this.settings.lang, raw.cfg.name_key));
        b.hp = raw.hp; b.maxHp = raw.maxHp;
        b.boss_wave_n = raw.boss_wave_n || 0;
        this.enemies.push(b);
        this.bossWarn = { text: ConfigLoader.t(this.config.localization, this.settings.lang, 'boss_warning', { name: b.name || 'BOSS' }), t: 2 };
        if (this.fx) this.fx.play('boss_spawn', b.x, b.y);
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
      let { mx, my, dist } = e.steer(dt, this.player.x, this.player.y);
      e.facing = (this.player.x >= e.x) ? 1 : -1;
      if (e.isBoss) {
        // Вся логика боссов (стрельба / рывок / залп) — в _updateBoss.
        // Возвращает override движения: { hold } — стоять (телеграф/замах),
        // { dash, dx, dy } — лететь по зафиксированному направлению.
        const bo = this._updateBoss(e, dt, dist);
        if (bo) {
          if (bo.hold) { mx = 0; my = 0; }
          else if (bo.dash) { mx = bo.dx; my = bo.dy; }
          if (bo.spdOverride > 0) {
            e.x += mx * bo.spdOverride * dt;
            e.y += my * bo.spdOverride * dt;
            e.applyKnock(dt);
            if (e.updateTilt) e.updateTilt(dt, mx * bo.spdOverride + e.knockX, my * bo.spdOverride + e.knockY);
            this._pushOut(e, false);
            e.updateAnim(dt);
            continue;
          }
        }
      } else if (e.cfg.movement_type === 'ranged' && e.attackCd <= 0 && dist < (e.cfg.attack_range || 300)) {
        const proj = this.enemyProjById.get(e.cfg.projectile_id);
        if (proj) {
          this.skills.enemyFire(e.x, e.y, this.player.x, this.player.y, proj, e.damage);
          e.attackCd = (e.cfg.attack_cooldown_ms || 2000) / 1000;
          e.playAttack();
        }
      } else if (e.attackT <= 0) {
        // walk не перебиваем, пока проигрывается attack
        try { e.setAnim('walk'); } catch (err) {}
      }
      if (e.attackT > 0) {
        e.attackT -= dt;
        if (e.attackT <= 0) { e.attackT = 0; try { e.setAnim('walk'); } catch (err) {} }
      }
      // Холод замедляет: скорость из effectiveSpeed (slowT/slowFactor из Enemy)
      const spd = (typeof e.effectiveSpeed === 'number') ? e.effectiveSpeed : e.speed;
      e.x += mx * spd * dt;
      e.y += my * spd * dt;
      e.applyKnock(dt);
      // наклон: фактическая скорость движения + отбрасывание
      if (e.updateTilt) e.updateTilt(dt, mx * spd + e.knockX, my * spd + e.knockY);
      this._pushOut(e, false);
      e.updateAnim(dt);
    }

    const onKill = (e, wid) => this._onKill(e, wid);
    const onHit = (p, e) => this._onHit(p, e);
    this.skills.update(dt, {
      player: this.player, enemies: this.enemies, onKill,
      onCast: () => this.player.playCast()
    });
    this.skills.updateProjectiles(dt);
    this.skills.updateChains(this.enemies, Math.random);
    this.skills.updateFx(dt);
    this.combat.projectilesVsEnemies(this.skills.projectiles, this.enemies, onKill, onHit);
    // огонь: тик поджигания после всех прямых попаданий (убийства — через onKill)
    // + живые частицы статусов: угольки на горящих, снежинки на замедленных
    // (частоты/виды — из status_effects.*.particles, бюджет ограничен пулом)
    const stFx = (this.config.balance_config && this.config.balance_config.status_effects) || {};
    const burnPs = stFx.burn && stFx.burn.particles;
    const slowPs = stFx.slow && stFx.slow.particles;
    for (const e of this.enemies) {
      if (!e.alive || e.deathT > 0 || typeof e.updateStatus !== 'function') continue;
      const was = e.hp;
      e.updateStatus(dt);
      if (e.hp <= 0 && was > 0) {
        const wid = e.burnWeaponId || null;
        this.combat.addKill(wid);
        onKill(e, wid);
      }
      if (this.particles && e.alive && e.deathT <= 0) {
        if (e.burnT > 0 && burnPs && burnPs.enabled && Math.random() < (burnPs.emission_per_sec || 0) * dt) {
          this.particles.emit(e.x, e.y, e.radius, burnPs, Math.random);
        }
        if (e.slowT > 0 && slowPs && slowPs.enabled && Math.random() < (slowPs.emission_per_sec || 0) * dt) {
          this.particles.emit(e.x, e.y, e.radius, slowPs, Math.random);
        }
      }
    }
    if (this.particles) this.particles.update(dt);
    this.combat.enemyProjectilesVsPlayer(this.skills.enemyShots, this.player);
    this.combat.separate(this.enemies);
    // Контактный урон: рывок босса бьёт сильнее (contact_mul из dash-конфига)
    this.combat.contactDamage(this.player, this.enemies, (e) => {
      if (e && e.isBoss && e.isDashing) {
        const d = (e.cfg && e.cfg.dash) || {};
        return d.contact_mul || 1.5;
      }
      return 1;
    });
    this.combat.updateTexts(dt);
    // Смертельный контакт: не даём в этом же кадре открыть level-up/клетку
    // поверх падения мага — сначала проигрываем death-анимацию.
    if (!this.player.alive) {
      this._beginDeathAnimation();
      this._updateHealthUI(dt);
      return;
    }

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

    // питомец: несёт дроп хозяину (может нести несколько предметов сразу)
    if (this.pet) {
      const pcfg = (this.shop.cfg.pet || {});
      const got = this.pet.update(dt, this.player.x, this.player.y, this.pickups,
        pcfg.grab_radius || 24, pcfg.deliver_radius || 28);
      if (got && got.length) {
        for (const g of got) {
          if (g.kind === 'xp') {
            const ups = this.progression.addXP(g.value * (this.player.xpMul || 1));
            this.player.level = this.progression.level;
            this.pendingLevels += ups;
            if (this.fx) this.fx.play('pickup_xp', this.player.x, this.player.y);
          } else if (g.kind === 'coin') {
            this.player.coins += g.value;
          } else if (g.kind === 'potion') {
            const wx = this.pet ? this.pet.x : this.player.x;
            const wy = this.pet ? this.pet.y : this.player.y;
            this._collectPotion(this._potionHealAmount(), wx, wy);
          }
        }
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        if (!this.pickups[i].alive) this.pickups.splice(i, 1);
      }
    }

    this.chestSys.update(dt, {
      player: this.player,
      pickupRadius: pr,
      spawnPoint: () => this._chestSpawnPoint(),
      onOpen: (c, r) => this._openChest(c, r),
      onCageOpen: (c) => this._openCage(c),
      makeCage: (t, x, y) => this._makeCage(t, x, y)
    });

    if (this.states.is('playing')) this._openNextPendingModal();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    // Если игрок погиб в этом кадре — запускаем падение; сам gameover
    // наступит на следующем кадре после death-анимации.
    this._beginDeathAnimation();
    if (this.skills.auraFlash > 0) this.skills.auraFlash -= dt;
    // питомцы «на свободе» + анимация шкалы HP
    this._updateFleeingPets(dt);
    this._updateHealthUI(dt);
    // Этап 5: автосейв + сохранение после важных событий (levelup-окно уже ставит паузу)
    this._autosaveT -= dt;
    if (this._autosaveT <= 0) {
      this._autosaveT = this.config.game_config.save.autosave_interval_sec || 30;
      this.save.save();
    }
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.config.game_config;
    const st = this.states.get();
    ctx.save();
    ctx.fillStyle = g.visuals.background_color;
    ctx.fillRect(0, 0, W, H);

    if (st === 'menu') {
      this.menu.draw(ctx, this, W, H);
    } else {
      // мир
      ctx.save();
      this.camera.apply(ctx, W, H);
      this._drawGround(ctx, W, H);
      this._drawProps(ctx);
      for (const a of this.skills.areas) {
        if (a.wall) this._drawWall(ctx, a);
        else if (a.shape === 'tornado' && this.tornadoRenderer) {
          this.tornadoRenderer.draw(ctx, a, this.time, this.assets);
        } else {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = a.color;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = a.color;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.stroke();
        }
      }
      if (this.skills.auraRadius) {
        ctx.globalAlpha = 0.25 + (this.skills.auraFlash > 0 ? 0.2 : 0);
        ctx.fillStyle = this.skills.auraColor || '#00ccff';
        ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.skills.auraRadius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const p of this.pickups) {
        // Плавное исчезновение: последние fade_out_ms жизнь дропа
        // становится всё прозрачнее и в конце полностью пропадает.
        ctx.save();
        ctx.globalAlpha = p.fadeAlpha;
        // Спрайт дропа (если назначен и ассет загружен), иначе — заглушка-кружок.
        const pImg = p.sprite ? this.assets.get(p.sprite) : null;
        const pf = p.sprite_frames;
        if (pImg && pImg.tagName === 'IMG' && pf) {
          const psize = pf.draw_size || pf.frame_width || 16;
          const pcol = (p.animFrame || 0) % (pf.columns || 1);
          const prow = Math.floor((p.animFrame || 0) / (pf.columns || 1));
          ctx.drawImage(pImg, pcol * pf.frame_width, prow * pf.frame_height, pf.frame_width, pf.frame_height,
            p.x - psize / 2, p.y - psize / 2, psize, psize);
        } else {
          ctx.fillStyle = p.color();
          ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
          const letter = { xp: 'X', coin: String.fromCharCode(36), potion: '+', magnet: 'M', bomb: 'B' }[p.kind] || '?';
          ctx.fillText(letter, p.x, p.y + 3);
        }
        ctx.restore();
      }
      for (const c of this.chestSys.chests) {
        if (!c.alive) continue;
        // Плавное исчезновение открытого сундука за fadeDuration сек
        if (c.opened && c.fadeDuration) {
          ctx.globalAlpha = Math.max(0, 1 - c.openT / c.fadeDuration);
        }
        // Смена спрайта: idle-мерцание -> open-анимация (кадры из chests.types[].frames).
        // Спрайт из конфига; плейсхолдер — только если ассета нет.
        const img = this.assets.get(c.typeCfg.sprite);
        if (img && c.anim) {
          const sc = g.visuals.global_sprite_scale || 1;
          c.draw(ctx, this.assets, c.typeCfg.sprite, c.rw, c.rh, sc, '#8B5A2B');
        } else {
          const col = { wooden: '#8B5A2B', silver: '#C0C0C0', golden: '#FFD700', legendary: '#B400FF' }[c.typeCfg.id] || '#8B5A2B';
          ctx.fillStyle = c.opened ? '#444' : col;
          ctx.fillRect(c.x - 14, c.y - 14, 28, 28);
          ctx.strokeStyle = '#000'; ctx.strokeRect(c.x - 14, c.y - 14, 28, 28);
        }
        ctx.globalAlpha = 1;
      }
      // клетки с питомцами: питомец гуляет внутри, клетка рисуется поверх
      for (const c of this.chestSys.cages) {
        if (!c.alive) continue;
        this._drawCage(ctx, c);
      }
      for (const e of this.enemies) {
        if (!e.alive || e.deathT > 0) continue;
        e.draw(ctx, this.assets, e.cfg.sprite, e.rw, e.rh, e.scale * (g.visuals.global_sprite_scale || 1), e.isBoss ? '#c0c' : '#a33');
        // статусы: цвета ТОЛЬКО из balance.status_effects (без хардкода в коде по смыслу)
        const stCfg = (this.config.balance_config && this.config.balance_config.status_effects) || {};
        if (e.slowT > 0) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = (stCfg.slow && stCfg.slow.tint) || '#00ccff';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        if (e.burnT > 0) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = (stCfg.burn && stCfg.burn.tint) || '#ff4400';
          const flick = 3 + Math.sin((this.time || 0) * 18 + e.x) * 1.5;
          ctx.beginPath(); ctx.arc(e.x, e.y - e.radius - 4, flick, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        if (e.isBoss || e.maxHp >= 100) {
          const w = 60 * e.scale;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w, 6);
          ctx.fillStyle = '#f00'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w * (e.hp / e.maxHp), 6);
        }
      }
      // трупы: проигрывают death-анимацию, но уже не участвуют в логике.
      // Плавное исчезновение ПОСЛЕ анимации (по аналогии с открытым сундуком).
      for (const e of this.enemies) {
        if (e.deathT <= 0) continue;
        const { dur, fade } = e.deathTiming();
        ctx.globalAlpha = Math.max(0, Math.min(1, (dur + fade - e.deathT) / fade));
        e.draw(ctx, this.assets, e.cfg.sprite, e.rw, e.rh, e.scale * (g.visuals.global_sprite_scale || 1), '#555');
        ctx.globalAlpha = 1;
      }
      if (this.player) {
        const hasAnim = !!(this.player.anim && this.player.anim.getRect);
        const fw = (g.hero.frames && g.hero.frames.frame_width) || 64;
        const fh = (g.hero.frames && g.hero.frames.frame_height) || 64;
        const r = hasAnim ? this.player.anim.getRect() : { sw: fw, sh: fh };
        const heroArt = g.hero.procedural || {};
        const spriteMissing = !!(this.assets && this.assets.isMissing && this.assets.isMissing(g.hero.sprite));
        const useMage = heroArt.enabled !== false && this.heroMage
          && (heroArt.mode === 'always' || (heroArt.mode !== 'never' && spriteMissing));
        if (useMage) {
          this.heroMage.draw(ctx, this.player, this.time, {
            scale: g.visuals.global_sprite_scale || 1,
            w: r.sw, h: r.sh
          });
        } else {
          this.player.draw(ctx, this.assets, g.hero.sprite, r.sw, r.sh, g.visuals.global_sprite_scale || 1, '#888');
        }
      }
      // орбитальная пассивная магия: ледяные шары вокруг игрока
      this.skills.drawOrbits(ctx);
      // питомец (монстры его не бьют — коллизий с ним нет)
      if (this.pet) {
        const pet = this.pet;
        const size = 48; // размер в игре
        // «живое» покачивание: только визуал, коллизии/логика по pet.x/pet.y
        const vo = pet.visualOffset ? pet.visualOffset() : { ox: 0, oy: 0 };
        const px = pet.x + vo.ox, py = pet.y + vo.oy;
        const img = pet.sprite ? this.assets.get(pet.sprite) : null;
        const f = pet.sprite_frames;
        const useArt = img && img.tagName === 'IMG' && f;
        if (useArt) {
          // Предметы — СЛОЕМ НИЖЕ питомца: кучей под центром, каждый со своим
          // спрайтом и стабильным (не дрожащим) смещением от центра кучи.
          if (pet.carrying && pet.carrying.length) {
            const cx = px, cy = py + size / 4;
            for (let ci = 0; ci < pet.carrying.length; ci++) {
              const item = pet.carrying[ci];
              const off = pileOffset(ci);
              const cImg = item.sprite ? this.assets.get(item.sprite) : null;
              const cf = item.sprite_frames;
              if (cImg && cImg.tagName === 'IMG' && cf) {
                const csize = cf.draw_size || cf.frame_width || 16;
                const ccol = (item.animFrame || 0) % (cf.columns || 1);
                const crow = Math.floor((item.animFrame || 0) / (cf.columns || 1));
                ctx.drawImage(cImg, ccol * cf.frame_width, crow * cf.frame_height, cf.frame_width, cf.frame_height,
                  cx + off.dx - csize / 2, cy + off.dy - csize / 2, csize, csize);
              } else {
                const cc = { coin: '#ffd34d', xp: '#4da6ff', potion: '#ff5a5a' }[item.kind] || '#fff';
                ctx.fillStyle = cc;
                ctx.beginPath();
                ctx.arc(cx + off.dx, cy + off.dy, 5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          const col = Math.floor(pet.animT * f.fps) % f.columns;
          const row = 0;
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(pet.facing, 1);
          // наклон в вираже: поворот ВНУТРИ отражения — завал зеркалится вместе
          // со спрайтом и всегда направлен в сторону поворота
          if (pet.tilt) ctx.rotate(pet.tilt);
          ctx.drawImage(img, col * f.frame_width, row * f.frame_height, f.frame_width, f.frame_height,
            -size / 2, -size / 2, size, size);
          ctx.restore();
        } else {
          // Фолбэк: программная отрисовка (жёлтый кружок)
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath();
          ctx.arc(px, py, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          if (pet.carrying && pet.carrying.length) {
            for (let ci = 0; ci < pet.carrying.length; ci++) {
              const item = pet.carrying[ci];
              const off = pileOffset(ci);
              const cc = { coin: '#ffd34d', xp: '#4da6ff', potion: '#ff5a5a' }[item.kind] || '#fff';
              ctx.fillStyle = cc;
              ctx.beginPath();
              ctx.arc(px + off.dx, py - 7 + off.dy, 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      // улетающие «лишние» питомцы (после клетки/замены)
      for (const f of this.fleeingPets) this._drawFleeingPet(ctx, f);
      for (const p of this.skills.projectiles) this._drawShot(ctx, p, '#ffd34d');
      for (const p of this.skills.enemyShots) this._drawShot(ctx, p, '#ff4d4d');
      this.skills.drawLightning(ctx);
      if (this.fx) this.fx.draw(ctx);
      if (this.particles) this.particles.draw(ctx);
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
        this.hud.drawHealthFlyers(ctx, this, W, H);
        this.hud.drawBossBar(ctx, this, W, H);
        this.hud.drawBottom(ctx, this, W, H);
      }
      if (this.bossWarn && st === 'playing') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H / 2 - 40, W, 60);
        ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.bossWarn.text, W / 2, H / 2);
      }
      if (st === 'upgrade') this.upgradeMenu.draw(ctx, this, W, H);
      if (this.uiPetSwap) this.petSwapPopup.draw(ctx, this, W, H);
      if (st === 'paused') this.pauseMenu.draw(ctx, this, W, H);
      if (st === 'gameover') this.gameover.draw(ctx, this, W, H);
      if (this.uiInventory && (st === 'playing' || st === 'paused')) this.hud.drawInventory(ctx, this, W, H);
    }

    // попапы поверх всего
    if (this.uiSettings) this.settingsMenu.draw(ctx, this, W, H);
    else if (this.uiShop) this.shopMenu.draw(ctx, this, W, H);
    else if (this.uiBonus) this.bonusPopup.draw(ctx, this, W, H);
    else if (this.uiStats) this.statsPopup.draw(ctx, this, W, H);
    else if (this.uiLeaders) this.leadersPopup.draw(ctx, this, W, H);
    // межстраничная реклама (SDK-оверлей поверх, игра заморожена)
    if (st === 'ads') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('📺', W / 2, H / 2);
    }

    if (st !== 'menu') this.input.drawJoystick(ctx);
    if (g.ui.show_fps) {
      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(this.fps + ' fps', 8, H - 8);
    }
    ctx.restore();
  }

  // Клетка: сначала питомец (спрайт/фолбэк), затем прутья поверх.
  // При разрушении прутья разлетаются в стороны и гаснут (breakProgress).
  _drawCage(ctx, c) {
    const g = this.config.game_config;
    const cfg = this.config.balance_config.cages || {};
    const scale = g.visuals.global_sprite_scale || 1;
    const k = c.breakProgress;
    const alpha = c.opened ? Math.max(0, 1 - k) : 1;
    const R = (cfg.cage_radius || 96) * scale;
    const Hh = R * 1.15;
    const cx = c.x, cy = c.y;
    // --- питомец внутри ---
    const pi = c.petInfo;
    const img = pi && pi.sprite ? this.assets.get(pi.sprite) : null;
    const f = pi && pi.frames;
    const size = (cfg.pet_size || 44) * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img && img.tagName === 'IMG' && f) {
      const col = Math.floor(c.animT * (f.fps || 12)) % Math.max(1, f.columns || 1);
      ctx.save();
      ctx.translate(c.petX, c.petY);
      ctx.scale(c.petFacing, 1);
      ctx.drawImage(img, col * f.frame_width, 0, f.frame_width, f.frame_height,
        -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = (pi && pi.rarityColor) || '#ffd34d';
      ctx.beginPath(); ctx.arc(c.petX, c.petY, size * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
    }
    // --- прутья клетки ---
    const bars = Math.max(2, cfg.bar_count || 9);
    const spread = k * (cfg.break_spread || 34);
    const topY = cy - Hh * 0.55;
    const botY = cy + Hh * 0.55;
    ctx.strokeStyle = cfg.bar_color || '#d9b25a';
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.lineCap = 'round';
    for (let i = 0; i < bars; i++) {
      const u = i / (bars - 1);
      const bx = cx - R + u * 2 * R;
      const edge = Math.abs(u - 0.5) * 2; // 0 в центре, 1 у краёв
      const ty = topY + edge * Hh * 0.10;
      const by = botY - edge * Hh * 0.04;
      const dir = u < 0.5 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx + dir * spread, 0);
      ctx.rotate(dir * k * 0.35);
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(0, by); ctx.stroke();
      ctx.restore();
    }
    // ободья сверху/снизу + колечко
    ctx.strokeStyle = cfg.frame_color || '#8a6a2a';
    ctx.lineWidth = Math.max(3, 5 * scale);
    ctx.beginPath(); ctx.ellipse(cx, topY - k * spread * 0.5, R * 1.02, R * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, botY + k * spread * 0.5, R * 1.02, R * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, topY - R * 0.22 - k * spread * 0.5, Math.max(4, R * 0.08), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Улетающий питомец: спрайт (или цветной кружок) с затуханием.
  _drawFleeingPet(ctx, f) {
    const k = f.dur > 0 ? Math.max(0, Math.min(1, f.t / f.dur)) : 1;
    const alpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    const size = f.size * (this.config.game_config.visuals.global_sprite_scale || 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    const img = f.sprite ? this.assets.get(f.sprite) : null;
    const frames = f.frames;
    if (img && img.tagName === 'IMG' && frames) {
      const col = Math.floor(f.t * (frames.fps || 12)) % Math.max(1, frames.columns || 1);
      ctx.translate(f.x, f.y);
      ctx.scale(f.facing, 1);
      ctx.drawImage(img, col * frames.frame_width, 0, frames.frame_width, frames.frame_height,
        -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = f.rarityColor || '#ffd34d';
      ctx.beginPath(); ctx.arc(f.x, f.y, size * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  _drawShot(ctx, p, color) {
    // Тайная нова: за снарядом тянется слабый шлейф, подчёркивающий спираль
    // и гиперболическую дугу. Рисуется и при наличии спрайта, и без него.
    if (p.nova && !p.exploding && p.trail && p.trail.length > 1) {
      const tr = p.trail;
      ctx.save();
      ctx.strokeStyle = p.color || color;
      ctx.lineWidth = Math.max(2, p.radius * 0.8);
      ctx.lineCap = 'round';
      // Шлейф гаснет к хвосту: голова ярче, хвост почти прозрачный.
      for (let i = 1; i < tr.length; i++) {
        ctx.globalAlpha = 0.08 + 0.32 * (i / tr.length);
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    const img = this.assets.get(p.spritePath);
    if (img && p.anim && img.tagName !== 'CANVAS') {
      try {
        const r = p.anim.getRect();
        ctx.save();
        ctx.translate(p.x, p.y);
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh / 2, r.sw, r.sh);
        ctx.restore();
        return;
      } catch (e) {}
    }
    const col = p.color || color;
    if (p.nova) {
      // мягкое свечение вокруг ядра (спрайт arcane_nova может отсутствовать)
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
  }

  // Отрисовка стены огня: огоньки из спрайтшита, появляются от центра к краям,
  // угасают от краёв к центру.
  _drawWall(ctx, a) {
    const w = a.wall;
    const img = a.spritePath ? this.assets.get(a.spritePath) : null;
    const f = a.cfg.area_frames;
    const useArt = img && img.tagName === 'IMG' && f;
    const size = a.cfg.flame_size || 128;
    const half = size / 2;
    for (const fl of w.flames) {
      if (!fl.alive || fl.dead) continue;
      // Прозрачность при угасании: от 1 до 0 за spawnMs
      let alpha = 1;
      if (fl.dying && fl.dieT !== undefined) {
        alpha = Math.max(0, 1 - fl.dieT / w.spawnMs);
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      if (useArt) {
        const col = fl.frame % f.columns;
        const row = Math.floor(fl.frame / f.columns);
        ctx.drawImage(img, col * f.frame_width, row * f.frame_height, f.frame_width, f.frame_height,
          fl.x - half, fl.y - half, size, size);
      } else {
        // Фолбэк: оранжевый кружок
        ctx.fillStyle = a.color;
        ctx.beginPath(); ctx.arc(fl.x, fl.y, half, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}
