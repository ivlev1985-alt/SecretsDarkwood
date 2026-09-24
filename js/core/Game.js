import { ConfigLoader } from './ConfigLoader.js';
import { AssetLoader } from './AssetLoader.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { StateManager } from './StateManager.js';

// Реестры поведения (GDD п.3.4). Новые типы = 1-2 строки здесь.
export const MovementRegistry = {
  chase: 'chase',
  patrol: 'patrol',
  ranged: 'ranged',
  teleport: 'teleport'
};
export const WeaponRegistry = { to_target: 'to_target', around_player: 'around_player', area: 'area' };
export const EffectRegistry = { oneshot: 'oneshot', looping: 'looping', attached: 'attached' };
export const ChestRewardRegistry = { coins: 'coins', spell: 'spell', levelup: 'levelup', mixed: 'mixed' };

export class Game {
  constructor(canvas, onStatus) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onStatus = onStatus || (() => {});
    this.config = null;
    this.last = 0;
    this.playerPos = { x: 0, y: 0 };
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
    this.states = new StateManager('menu');
  }
  async boot() {
    this.onStatus('Загрузка конфигов...');
    const loader = new ConfigLoader();
    this.config = await loader.loadAll(['game_config', 'balance_config', 'skills_config', 'effects_config', 'ui_config', 'shop_config', 'localization']);
    this.validate();
    this.onStatus('OK: конфиги загружены. Этап 0');
    this.audio.applyVolumes(
      this.config.game_config.audio.music_volume_default,
      this.config.game_config.audio.sfx_volume_default
    );
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (window.ysdk && window.ysdk.features && window.ysdk.features.LoadingAPI) {
      try { window.ysdk.features.LoadingAPI.ready(); } catch (e) {}
    }
  }
  validate() {
    const errors = [];
    const g = this.config.game_config, b = this.config.balance_config, s = this.config.skills_config;
    if (!g.hero || !g.hero.frames) errors.push('game_config.hero.frames missing');
    for (const m of b.monsters) {
      if (!m.frames) errors.push('monster ' + m.id + ' missing frames');
      if (m.projectile_id) {
        const found = (s.enemy_projectiles || []).some((p) => p.id === m.projectile_id);
        if (!found) errors.push('monster ' + m.id + ' unknown projectile_id=' + m.projectile_id);
      }
      if (!MovementRegistry[m.movement_type]) errors.push('monster ' + m.id + ' unknown movement_type=' + m.movement_type);
    }
    for (const w of s.weapons) {
      if (!WeaponRegistry[w.type]) errors.push('weapon ' + w.id + ' unknown type=' + w.type);
      if (typeof w.unlocked !== 'boolean') errors.push('weapon ' + w.id + ' missing unlocked:boolean');
    }
    // shop targets
    const shopTargets = (this.config.shop_config.items || []).map((i) => i.target);
    for (const t of shopTargets) {
      if (t.startsWith('weapon.')) {
        const id = t.split('.')[1];
        if (!s.weapons.some((w) => w.id === id)) errors.push('shop target unknown weapon: ' + t);
      } else if (t.startsWith('player.')) {
        const key = t.split('.')[1];
        if (!(key in b.player)) errors.push('shop target unknown player key: ' + t);
      }
    }
    // props: запрещён формат с '#' (исправлено в Этапе 0)
    for (const p of b.environment_props) {
      if (String(p.sprite).includes('#')) errors.push('prop ' + p.id + ' sprite contains # (must be fixed)');
      if (!p.frames) errors.push('prop ' + p.id + ' missing frames');
    }
    if (errors.length) throw new Error('Валидация конфигов:\n' + errors.join('\n'));
    console.log('[Этап 0] Валидация конфигов OK');
  }
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }
  update(dt) {
    const v = this.input.getVector();
    this.playerPos.x += v.x * 200 * dt;
    this.playerPos.y += v.y * 200 * dt;
  }
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = this.config.game_config.visuals.background_color;
    ctx.fillRect(0, 0, W, H);
    // серая сетка-заглушка тайлов
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // серый герой-заглушка в центре + смещение от ввода
    const cx = W / 2 + Math.max(-120, Math.min(120, this.playerPos.x * 0.2));
    const cy = H / 2 + Math.max(-160, Math.min(160, this.playerPos.y * 0.2));
    ctx.fillStyle = '#888';
    ctx.fillRect(cx - 16, cy - 16, 32, 32);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Этап 0: каркас OK', W / 2, 40);
    ctx.fillText('WASD / джойстик (тач)', W / 2, 58);
    ctx.fillText('Конфиги: config/*.json', W / 2, H - 20);
  }
}
