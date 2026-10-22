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
import { Pickup } from '../entities/Pickup.js';
import { Prop } from '../entities/Prop.js';
import { Pet } from '../entities/Pet.js';
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
import { fmtTime } from '../utils/math.js';

export const MovementRegistry = { chase: 'chase', patrol: 'patrol', ranged: 'ranged', teleport: 'teleport' };
export const WeaponRegistry = { to_target: 'to_target', around_player: 'around_player', area: 'area' };
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
    // TEST (убрать позже): стартовый легендарный сундук + гарант. дроп питомца
    this.TEST_LEGENDARY_CHEST = true;
    this.TEST_PET_DROP = true;
    this.uiPetSwap = null;
    this.petSwapPopup = new PetSwapPopup();
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
      if (r === 'close') this.uiPetSwap = null;
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
    this.pendingLevels--;
    this.player.level = this.progression.level;
    if (this.config.game_config.save.save_on_important_events) this.save.save();
    if (this.pendingLevels > 0) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3, Math.random, this._petCtx());
      if (!this.choices.length) { this.pendingLevels = 0; this.states.set('playing'); }
    } else {
      this.states.set('playing');
    }
  }

  _petCtx() {
    return { hasPet: !!this.pet, levels: this.petLevels || {} };
  }

  // Замена питомца из сундука: старый автовыкупается за 50%, новый надевается
  doPetSwap() {
    const d = this.uiPetSwap;
    if (!d) return;
    if (d.old) this.save.addCoins(this.shop.sellPrice(d.old));
    this.save.data.gear.pet = JSON.parse(JSON.stringify(d.new));
    this.save.save();
    // обновить боевого питомца на месте (без рестарта забега)
    const pcfg = (this.shop.cfg.pet || {});
    this.pet = new Pet(this.player.x, this.player.y - 40,
      (d.new.stats[0] || {}).value || 200, pcfg.speed || 260, pcfg.magnet_radius || 60, !!d.new.fetch_potions);
    this.pet.tpl = d.new.tpl;
    this.petLevels = {};
    this.uiPetSwap = null;
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
    this.enemies = [];
    this.pickups = [];
    this.props = [];
    this.fx = new EffectSystem(this.config.effects_config, this.assets);
    const stFx = (b.status_effects || {});
    this.particles = new ParticleSystem(stFx.particle_budget || 300);
    // --- сброс прогресса забега: заклинания не переносятся между забегами ---
    // Оставляем только дефолтные (unlocked_by_default). Заклинания, полученные
    // в предыдущем забеге (сундуки, апгрейды), должны сбрасываться при "Заново".
    const defaultSpells = (s.weapons || [])
      .filter((w) => w.unlocked_by_default === true)
      .map((w) => w.id);
    this.save.data.unlockedSpells = defaultSpells;

    // Сбросить runtime-флаги unlocked на объектах конфига к дефолтным,
    // иначе grantRandomSpell из прошлого забега (w.unlocked = true) переносится.
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
    this.skills = new SkillSystem(s.weapons, this.combat, this.audio);
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
        !!petItem.fetch_potions);
      this.pet.tpl = petItem.tpl;
    }
    this.progression = new ProgressionSystem(b.progression);
    this.upgrades = new UpgradeSystem(s, this.config.localization, this.settings.lang, this.config.items_config.pet_upgrades);
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
    this.runStats = { time: 0, level: 1, kills: 0, coins: 0, record: false };
    if (b.waves.first_spawn_trigger_on_chest && b.chests.enabled) {
      const wood = b.chests.types.find((t) => t.id === 'wooden') || b.chests.types[0];
      if (wood) this.chestSys.chests.push(new Chest(wood, 150, 0));
    }
    // TEST: стартовый легендарный сундук рядом (убрать позже)
    if (this.TEST_LEGENDARY_CHEST && b.chests.enabled) {
      const leg = b.chests.types.find((t) => t.id === 'legendary');
      if (leg) this.chestSys.chests.push(new Chest(leg, -150, 0));
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
          try { e.setAnim('attack'); } catch (err) {}
          return null;
        }
      }
      try { e.setAnim('walk'); } catch (err) {}
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
          const dmg = e.damage * (v.damage_mul || 1.5);
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
      this.player.takeContactDamage(e.damage * mul);
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
      this.props.push(new Prop(cfg, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r));
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

  _drawProps(ctx) {
    for (const pr of this.props) {
      if (!pr.alive) continue;
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
  }

  _chestSpawnPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 400 + Math.random() * 400;
    return { x: this.player.x + Math.cos(a) * r, y: this.player.y + Math.sin(a) * r };
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
      this.pickups.push(p);
    }
    // заклинания и уровни — мгновенно (физического представления нет)
    for (let i = 0; i < (reward.spells || 0); i++) this.skills.grantRandomSpell();
    if (reward.levels > 0) {
      const ups = this.progression.grantLevels(reward.levels);
      this.pendingLevels += ups;
    }
    this.combat.pushText(c.x, c.y - 24, '+' + (reward.coins || 0), '#ffd34d');
    if (this.fx) this.fx.play(this.config.balance_config.chests.open_effect_id || 'chest_burst', c.x, c.y);
    // особый питомец из самого редкого сундука (10%) — модалка замены с паузой
    const sp = this.shop.cfg.special_pet;
    if (sp && sp.enabled && c.typeCfg.id === sp.chest_id) {
      const force = this.TEST_PET_DROP ? 1 : 0; // TEST: убрать позже
      if (Math.random() < (force ? 1 : sp.chance)) {
        const tpl = this.shop.tplById.get(sp.template);
        if (tpl) {
          const offer = this.shop.rollOffer(tpl, Math.random, sp.rarity);
          this.uiPetSwap = { old: this.save.data.gear.pet || null, new: offer };
        }
      }
    }
    try { this.audio.playSfx(this.config.balance_config.chests.sfx_open); } catch (e) {}
    if (this.config.game_config.save.save_on_important_events) this.save.save();
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
        if (e.hp <= 0 && was > 0) { this.combat.addKill(null); this._onKill(e, null); }
      }
      this.combat.pushText(this.player.x, this.player.y - 30, 'BOOM', '#ff8800');
    }
  }

  async _die() {
    if (this._dying) return; // защита от повторного входа (мир продолжает тикать до смены состояния)
    this._dying = true;
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
    requestAnimationFrame((tt) => this.frame(tt));
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
      return;
    }
    this.time += dt;
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
          try { e.setAnim('attack'); } catch (err) {}
        }
      } else {
        try { e.setAnim('walk'); } catch (err) {}
      }
      // Холод замедляет: скорость из effectiveSpeed (slowT/slowFactor из Enemy)
      const spd = (typeof e.effectiveSpeed === 'number') ? e.effectiveSpeed : e.speed;
      e.x += mx * spd * dt;
      e.y += my * spd * dt;
      e.applyKnock(dt);
      this._pushOut(e, false);
      e.updateAnim(dt);
    }

    const onKill = (e, wid) => this._onKill(e, wid);
    const onHit = (p, e) => this._onHit(p, e);
    this.skills.update(dt, { player: this.player, enemies: this.enemies, onKill });
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

    // питомец: несёт по одному дропу хозяину
    if (this.pet) {
      const pcfg = (this.shop.cfg.pet || {});
      const got = this.pet.update(dt, this.player.x, this.player.y, this.pickups,
        pcfg.grab_radius || 24, pcfg.deliver_radius || 28);
      if (got) {
        if (got.kind === 'xp') {
          const ups = this.progression.addXP(got.value * (this.player.xpMul || 1));
          this.player.level = this.progression.level;
          this.pendingLevels += ups;
          if (this.fx) this.fx.play('pickup_xp', this.player.x, this.player.y);
        } else if (got.kind === 'coin') {
          this.player.coins += got.value;
        } else if (got.kind === 'potion') {
          const pct = (this.config.balance_config.loot.health_potion_heal_percent || 25) / 100;
          this.player.heal(this.player.maxHp * pct);
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
      onOpen: (c, r) => this._openChest(c, r)
    });

    if (this.pendingLevels > 0 && this.states.is('playing')) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3, Math.random, this._petCtx());
      if (this.choices.length) {
        if (this.fx) this.fx.play('levelup_burst', this.player.x, this.player.y);
        try { this.audio.playSfx('levelup.mp3'); } catch (e) {}
        this.states.set('upgrade');
      }
      else this.pendingLevels = 0;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    if (!this.player.alive) this._die();
    if (this.skills.auraFlash > 0) this.skills.auraFlash -= dt;
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
      this._drawGrid(ctx, W, H);
      this.menu.draw(ctx, this, W, H);
    } else {
      // мир
      ctx.save();
      this.camera.apply(ctx, W, H);
      this._drawGrid(ctx, W, H);
      this._drawProps(ctx);
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
      for (const e of this.enemies) {
        if (!e.alive) continue;
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
      if (this.player) {
        const hasAnim = !!(this.player.anim && this.player.anim.getRect);
        const r = hasAnim ? this.player.anim.getRect() : { sw: 32, sh: 32 };
        this.player.draw(ctx, this.assets, g.hero.sprite, r.sw, r.sh, g.visuals.global_sprite_scale || 1, '#888');
      }
      // питомец (монстры его не бьют — коллизий с ним нет)
      if (this.pet) {
        const bobY = Math.sin(this.pet.bob) * 4;
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath();
        ctx.arc(this.pet.x, this.pet.y + bobY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        if (this.pet.carrying) {
          const cc = { coin: '#ffd34d', xp: '#4da6ff', potion: '#ff5a5a' }[this.pet.carrying.kind] || '#fff';
          ctx.fillStyle = cc;
          ctx.beginPath();
          ctx.arc(this.pet.x, this.pet.y + bobY - 14, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
      if (this.uiInventory && st === 'playing') this.hud.drawInventory(ctx, this, W, H);
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

  _drawShot(ctx, p, color) {
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
