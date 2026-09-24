import { ConfigLoader } from './ConfigLoader.js';
import { AssetLoader } from './AssetLoader.js';
import { Animator } from './SpriteSheetParser.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { StateManager } from './StateManager.js';
import { Camera } from './Camera.js';
import { Player } from '../entities/Player.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { SkillSystem } from '../systems/SkillSystem.js';
import { fmtTime } from '../utils/math.js';

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
    // Этап 2: сущности и системы боя
    this.player = null;
    this.enemies = [];
    this.combat = null;
    this.spawn = null;
    this.skills = null;
    this.enemyProjById = new Map();
    this.deaths = 0;
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

    const g = this.config.game_config, b = this.config.balance_config, s = this.config.skills_config;
    this.input = new InputManager(this.canvas, { joystickSide: g.controls.joystick_position_default || 'left' });
    this.audio.applyVolumes(g.audio.music_volume_default, g.audio.sfx_volume_default, g.audio.pause_on_blur);
    this.camera = new Camera(g.camera);
    this.camera.snap(0, 0);

    this.onStatus('Загрузка ассетов...');
    const paths = AssetLoader.collectPaths(this.config);
    await this.assets.loadAllImages(paths.images, (d, total) => this.onStatus('Ассеты ' + d + '/' + total));

    // --- Этап 2: инициализация боя ---
    this.player = new Player(b.player, 0, 0);
    this.player.attachHeroAnim(new Animator(g.hero.frames, 'idle'));
    this.combat = new CombatSystem(g, b);
    this.spawn = new SpawnSystem(b.waves, b.monsters);
    this.skills = new SkillSystem(s.weapons, this.combat, this.audio);
    // Демо Этапа 2: по одному оружию каждого типа (магазин-гейт будет в Этапе 5)
    this.skills.setActive(['magic_bolt', 'frost_ring', 'fire_wall']);
    for (const p of (s.enemy_projectiles || [])) this.enemyProjById.set(p.id, p);

    this.states.set('playing');
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
    this._fpsAcc += dt; this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0; }
    const paused = this.states.is('paused') || document.hidden;
    if (!paused && this.states.is('playing')) this.update(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    this.time += dt;
    const v = this.input.getVector();
    this.player.update(dt, v);
    this.camera.update(dt, this.player.x, this.player.y, this.canvas.width, this.canvas.height);

    // спавн
    const fresh = this.spawn.update(dt, {
      player: this.player, enemies: this.enemies, viewW: this.canvas.width, viewH: this.canvas.height
    });
    for (const e of fresh) this.enemies.push(e);

    // движение врагов
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.deathT > 0) { if (e.updateDeath(dt)) continue; else continue; }
      const { mx, my, dist } = e.steer(dt, this.player.x, this.player.y);
      e.facing = (this.player.x >= e.x) ? 1 : -1;
      // ranged: стрельба при дистанции и кд
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

    // скиллы + снаряды
    this.skills.update(dt, { player: this.player, enemies: this.enemies });
    this.skills.updateProjectiles(dt);
    this.combat.projectilesVsEnemies(this.skills.projectiles, this.enemies, null);
    this.combat.enemyProjectilesVsPlayer(this.skills.enemyShots, this.player);
    this.combat.separate(this.enemies);
    this.combat.contactDamage(this.player, this.enemies);
    this.combat.updateTexts(dt);

    // чистка мёртвых
    if (this.enemies.length > 400) this.enemies = this.enemies.filter((e) => e.alive);
    else {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (!this.enemies[i].alive) this.enemies.splice(i, 1);
      }
    }

    // смерть игрока — демо-рестарт (GameOver в Этапе 4)
    if (!this.player.alive) {
      this.deaths++;
      const b = this.config.balance_config.player;
      this.player = new Player(b, 0, 0);
      this.player.attachHeroAnim(new Animator(this.config.game_config.hero.frames, 'idle'));
      this.enemies.length = 0;
      this.skills.projectiles.length = 0;
      this.skills.enemyShots.length = 0;
      this.skills.areas.length = 0;
      this.camera.snap(0, 0);
    }
    if (this.skills.auraFlash > 0) this.skills.auraFlash -= dt;
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const g = this.config.game_config;
    ctx.save();
    ctx.fillStyle = g.visuals.background_color;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    this.camera.apply(ctx, W, H);
    this._drawGrid(ctx, W, H);
    // зоны под сущностями
    for (const a of this.skills.areas) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = a.color;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.stroke();
    }
    // аура вокруг игрока
    if (this.skills.auraRadius) {
      ctx.globalAlpha = 0.25 + (this.skills.auraFlash > 0 ? 0.2 : 0);
      ctx.fillStyle = this.skills.auraColor || '#00ccff';
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.skills.auraRadius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.draw(ctx, this.assets, e.cfg.sprite, e.rw, e.rh, e.scale * (g.visuals.global_sprite_scale || 1), '#a33');
      // полоска HP босса/толстых
      if (e.isBoss || e.maxHp >= 100) {
        const w = 60 * e.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w, 6);
        ctx.fillStyle = '#f00'; ctx.fillRect(e.x - w / 2, e.y - e.rh * e.scale / 2 - 12, w * (e.hp / e.maxHp), 6);
      }
    }
    // игрок
    if (this.player) {
      const hasAnim = !!(this.player.anim && this.player.anim.getRect);
      const r = hasAnim ? this.player.anim.getRect() : { sw: 32, sh: 32 };
      this.player.draw(ctx, this.assets, g.hero.sprite, r.sw, r.sh, g.visuals.global_sprite_scale || 1, '#888');
      // HP полоска над игроком
      const w = 44;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.player.x - w / 2, this.player.y - 34, w, 5);
      ctx.fillStyle = '#0f0'; ctx.fillRect(this.player.x - w / 2, this.player.y - 34, w * (this.player.hp / this.player.maxHp), 5);
    }
    // снаряды
    for (const p of this.skills.projectiles) {
      this._drawShot(ctx, p, '#ffd34d');
    }
    for (const p of this.skills.enemyShots) {
      this._drawShot(ctx, p, '#ff4d4d');
    }
    // цифры урона
    ctx.textAlign = 'center';
    for (const t of this.combat.texts) {
      ctx.globalAlpha = 1 - t.life / t.maxLife;
      ctx.fillStyle = t.color; ctx.font = 'bold 14px monospace';
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._drawTopBar(ctx, W);
    this.input.drawJoystick(ctx);
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
    if (p.explosionR > 0) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.explosionR * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
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
  }

  _drawTopBar(ctx, W) {
    const g = this.config.game_config;
    const flip = g.controls.hud_flip_with_joystick && this.input.getJoystickSide() === 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = '#fff'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(fmtTime(this.time), flip ? W - 60 : 60, 20);
    ctx.fillText('HP ' + Math.ceil(this.player.hp) + '/' + this.player.maxHp + '  KILLS ' + this.combat.kills + '  EN ' + this.enemies.filter((e) => e.alive).length, W / 2, 20);
    ctx.fillStyle = '#8f8'; ctx.font = '11px monospace';
    ctx.fillText('bolt+aura+wall · deaths:' + this.deaths, W / 2, 36);
  }
}
