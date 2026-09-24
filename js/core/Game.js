import { ConfigLoader } from './ConfigLoader.js';
import { AssetLoader } from './AssetLoader.js';
import { Animator } from './SpriteSheetParser.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { StateManager } from './StateManager.js';
import { Camera } from './Camera.js';
import { fmtTime } from '../utils/math.js';

// Реестры поведения (GDD п.3.4). Новый тип = 1-2 строки здесь, конфиги не ломаются.
export const MovementRegistry = { chase: 'chase', patrol: 'patrol', ranged: 'ranged', teleport: 'teleport' };
export const WeaponRegistry = { to_target: 'to_target', around_player: 'around_player', area: 'area' };
export const EffectRegistry = { oneshot: 'oneshot', looping: 'looping', attached: 'attached' };
export const ChestRewardRegistry = { coins: 'coins', spell: 'spell', levelup: 'levelup', mixed: 'mixed' };

const CONFIG_NAMES = ['game_config', 'balance_config', 'skills_config', 'effects_config', 'ui_config', 'shop_config', 'localization'];

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
    this.playerPos = { x: 0, y: 0 };
    this.heroAnim = null;
    this.heroFacing = 1;
    this.ready = false;
  }

  async boot() {
    this.onStatus('Загрузка конфигов...');
    const loader = new ConfigLoader();
    this.config = await loader.loadAll(CONFIG_NAMES);

    const errors = ConfigLoader.validateAll(this.config, {
      movement: MovementRegistry, weapon: WeaponRegistry, effect: EffectRegistry, chest: ChestRewardRegistry
    });
    if (errors.length) throw new Error('Валидация конфигов:\n' + errors.join('\n'));
    console.log('[Этап 1] Валидация конфигов OK');

    const g = this.config.game_config;
    this.input = new InputManager(this.canvas, { joystickSide: g.controls.joystick_position_default || 'left' });
    this.audio.applyVolumes(g.audio.music_volume_default, g.audio.sfx_volume_default, g.audio.pause_on_blur);
    this.camera = new Camera(g.camera);
    this.camera.snap(0, 0);
    this.heroAnim = new Animator(g.hero.frames, 'idle');

    this.onStatus('Загрузка ассетов...');
    const paths = AssetLoader.collectPaths(this.config);
    const res = await this.assets.loadAllImages(paths.images, (d, total) => {
      this.onStatus('Ассеты ' + d + '/' + total);
    });
    if (res.missing.length) console.warn('[Этап 1] Нет файлов, серые плейсхолдеры:', res.missing);

    this.states.set('menu');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    try { if (window.ysdk?.features?.LoadingAPI) window.ysdk.features.LoadingAPI.ready(); } catch (e) {}
    this.ready = true;
    this.onStatus('OK');
    window.__game = this;
  }

  frame(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt >= 0) || dt > 0.05) dt = Math.min(Math.max(dt || 0.016, 0), 0.05);

    // FPS
    this._fpsAcc += dt; this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0; }

    // Пауза при blur: игру не крутим, но кадр рисуем (freeze)
    const paused = this.states.is('paused') || document.hidden;
    if (!paused) this.update(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    this.time += dt;
    const speed = this.config.balance_config.player.base_speed;
    const v = this.input.getVector();
    this.playerPos.x += v.x * speed * dt;
    this.playerPos.y += v.y * speed * dt;
    if (Math.abs(v.x) > 0.05) this.heroFacing = v.x > 0 ? 1 : -1;

    const moving = Math.hypot(v.x, v.y) > 0.15;
    this.heroAnim.setAnimation(moving ? 'run' : 'idle');
    this.heroAnim.update(dt);

    this.camera.update(dt, this.playerPos.x, this.playerPos.y, this.canvas.width, this.canvas.height);
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.config.game_config;
    ctx.save();
    ctx.fillStyle = g.visuals.background_color;
    ctx.fillRect(0, 0, W, H);

    // --- мир с камерой ---
    ctx.save();
    this.camera.apply(ctx, W, H);
    this._drawGrid(ctx, W, H);
    this._drawHero(ctx);
    ctx.restore();

    // --- оверлей ---
    this._drawTopBar(ctx, W);
    this.input.drawJoystick(ctx);

    if (g.ui.show_fps) {
      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(this.fps + ' fps', 8, H - 8);
    }
    ctx.restore();
  }

  _drawGrid(ctx, W, H) {
    const step = 64;
    const x0 = Math.floor((this.camera.x - W / 2) / step) * step;
    const y0 = Math.floor((this.camera.y - H / 2) / step) * step;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x < this.camera.x + W / 2 + step; x += step) { ctx.moveTo(x, this.camera.y - H / 2); ctx.lineTo(x, this.camera.y + H / 2); }
    for (let y = y0; y < this.camera.y + H / 2 + step; y += step) { ctx.moveTo(this.camera.x - W / 2, y); ctx.lineTo(this.camera.x + W / 2, y); }
    ctx.stroke();
    // центр мира
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(-8, -8, 16, 16);
  }

  _drawHero(ctx) {
    const g = this.config.game_config;
    const img = this.assets.get(g.hero.sprite);
    const rect = this.heroAnim.getRect();
    const scale = (g.visuals.global_sprite_scale || 1);
    const dw = rect.sw * scale, dh = rect.sh * scale;
    const x = this.playerPos.x, y = this.playerPos.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.heroFacing, 1);
    if (img) {
      try {
        // img может быть canvas-плейсхолдером — рисуем целиком
        if (img.tagName === 'CANVAS') ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        else ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, -dw / 2, -dh / 2, dw, dh);
      } catch (e) {
        ctx.fillStyle = '#888'; ctx.fillRect(-16, -16, 32, 32);
      }
    } else {
      ctx.fillStyle = '#888'; ctx.fillRect(-16, -16, 32, 32);
    }
    ctx.restore();
  }

  _drawTopBar(ctx, W) {
    const g = this.config.game_config;
    if (!g.ui.show_timer && !g.ui.show_level) return;
    const flip = g.controls.hud_flip_with_joystick && this.input.getJoystickSide() === 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = '#fff'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    const timer = fmtTime(this.time);
    // При джойстике слева HUD справа и наоборот (п.6: шкалы с противоположной стороны)
    if (g.ui.show_timer) ctx.fillText(timer, flip ? W - 60 : 60, 20);
    if (g.ui.show_level) ctx.fillText('STAGE-1 · CORE OK', W / 2, 20);
    ctx.fillStyle = '#8f8'; ctx.font = '11px monospace';
    ctx.fillText('joy:' + this.input.getJoystickSide() + (flip ? ' (HUD→right)' : ' (HUD→left)'), W / 2, 36);
  }
}
