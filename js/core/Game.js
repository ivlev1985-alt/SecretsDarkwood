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
    this.bossWarn = null; // { text, t }
    this.lang = 'ru';
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
    this.lang = (g.localization.default_lang || 'ru');
    try {
      const nav = (window.ysdk?.environment?.i18n?.lang) || (navigator.language || 'ru').slice(0, 2);
      if (g.localization.auto_detect && (g.localization.supported_langs || []).includes(nav)) this.lang = nav;
    } catch (e) {}
    this.input = new InputManager(this.canvas, { joystickSide: g.controls.joystick_position_default || 'left' });
    this.audio.applyVolumes(g.audio.music_volume_default, g.audio.sfx_volume_default, g.audio.pause_on_blur);
    this.camera = new Camera(g.camera);
    this.camera.snap(0, 0);

    this.onStatus('Загрузка ассетов...');
    const paths = AssetLoader.collectPaths(this.config);
    await this.assets.loadAllImages(paths.images, (d, total) => this.onStatus('Ассеты ' + d + '/' + total));

    this._initRun();
    this.canvas.addEventListener('mousedown', (e) => this._onClick(e));

    this.states.set('playing');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    try { if (window.ysdk?.features?.LoadingAPI) window.ysdk.features.LoadingAPI.ready(); } catch (e) {}
    this.ready = true;
    this.onStatus('OK');
    window.__game = this;
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
    this.upgrades = new UpgradeSystem(s, this.config.localization, this.lang);
    this.chestSys = new ChestSystem(b.chests);
    this.loot = new LootSystem(b.loot);
    for (const p of (s.enemy_projectiles || [])) this.enemyProjById.set(p.id, p);
    this.time = 0;
    this.pendingLevels = 0;
    this.choices = [];
    this.bossWarn = null;
    // first_spawn_trigger_on_chest: стартовый деревянный сундук рядом (GDD 8.x + waves)
    if (b.waves.first_spawn_trigger_on_chest && b.chests.enabled) {
      const wood = b.chests.types.find((t) => t.id === 'wooden') || b.chests.types[0];
      if (wood) this.chestSys.chests.push(new Chest(wood, 150, 0));
    }
    this.camera.snap(0, 0);
  }

  _t(key, params) { return ConfigLoader.t(this.config.localization, this.lang, key, params); }

  // Лут с убийства (снаряды/аура/зоны/бомба — единый путь)
  _onKill(e) {
    for (const p of this.loot.dropFor(e)) this.pickups.push(p);
  }

  _chestSpawnPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 400 + Math.random() * 400; // GDD 8.3: 400–800 px
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

  _onClick(e) {
    if (!this.states.is('upgrade') || !this.choices.length) return;
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (this.canvas.width / r.width);
    const y = (e.clientY - r.top) * (this.canvas.height / r.height);
    const W = this.canvas.width;
    const cw = W - 60, ch = 84, x0 = 30;
    let y0 = 200;
    for (let i = 0; i < this.choices.length; i++) {
      if (x >= x0 && x <= x0 + cw && y >= y0 && y <= y0 + ch) {
        this.upgrades.apply(this.choices[i], this.skills, this.player);
        this.pendingLevels--;
        this.player.level = this.progression.level;
        if (this.pendingLevels > 0) {
          this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3);
          if (!this.choices.length) { this.pendingLevels = 0; this.states.set('playing'); }
        } else {
          this.states.set('playing');
        }
        return;
      }
      y0 += ch + 12;
    }
  }

  frame(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt >= 0) || dt > 0.05) dt = Math.min(Math.max(dt || 0.016, 0), 0.05);
    this._fpsAcc += dt; this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0; }
    const paused = this.states.is('paused') || document.hidden;
    if (!paused && (this.states.is('playing') || this.states.is('upgrade'))) this.update(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    if (this.states.is('upgrade')) {
      // Пауза мира, но цифры/анимации тексов тикают для живости
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
      // Боссов оборачиваем для оверлея
      if (raw.isBoss) {
        const b = new Boss(raw.cfg, raw.x, raw.y, this._t(raw.cfg.name_key));
        b.hp = raw.hp; b.maxHp = raw.maxHp;
        this.enemies.push(b);
        this.bossWarn = { text: this._t('boss_warning', { name: b.name || 'BOSS' }), t: 2 };
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

    // подбор
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

    // сундуки
    this.chestSys.update(dt, {
      player: this.player,
      pickupRadius: pr,
      spawnPoint: () => this._chestSpawnPoint(),
      onOpen: (c, r) => this._openChest(c, r)
    });

    // levelup -> окно выбора (пауза)
    if (this.pendingLevels > 0 && this.states.is('playing')) {
      this.choices = this.upgrades.buildChoices(this.skills, this.player, this.config.balance_config.progression.upgrade_options_count || 3);
      if (this.choices.length) this.states.set('upgrade');
      else this.pendingLevels = 0;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    if (!this.player.alive) {
      this.deaths++;
      this._initRun();
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
    // подбор
    for (const p of this.pickups) {
      ctx.fillStyle = p.color();
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      const letter = { xp: 'X', coin: '$', potion: '+', magnet: 'M', bomb: 'B' }[p.kind] || '?';
      ctx.fillText(letter, p.x, p.y + 3);
    }
    // сундуки
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
      const w = 44;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.player.x - w / 2, this.player.y - 34, w, 5);
      ctx.fillStyle = '#0f0'; ctx.fillRect(this.player.x - w / 2, this.player.y - 34, w * (this.player.hp / this.player.maxHp), 5);
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

    this._drawTopBar(ctx, W, H);
    // босс-бар снизу (GDD 6.4)
    const bosses = this.enemies.filter((e) => e.alive && e.isBoss);
    if (bosses.length) {
      const b = bosses[0];
      const bw = W - 60, bx = 30, by = H - 120;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 26);
      ctx.fillStyle = '#f00'; ctx.fillRect(bx + 2, by + 2, (bw - 4) * (b.hp / b.maxHp), 22);
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText((b.name || 'BOSS') + '  ' + Math.ceil(b.hp) + ' / ' + b.maxHp, W / 2, by + 18);
    }
    // оверлей босса 2с
    if (this.bossWarn) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H / 2 - 40, W, 60);
      ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
      ctx.fillText(this.bossWarn.text, W / 2, H / 2);
    }
    // окно levelup
    if (this.states.is('upgrade')) this._drawUpgrade(ctx, W, H);

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

  _drawTopBar(ctx, W, H) {
    const g = this.config.game_config;
    const flip = g.controls.hud_flip_with_joystick && this.input.getJoystickSide() === 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 62);
    ctx.fillStyle = '#fff'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(fmtTime(this.time), flip ? W - 60 : 60, 18);
    ctx.fillText('Lv.' + this.progression.level + '  KILLS ' + this.combat.kills + '  $' + this.player.coins, W / 2, 18);
    // XP-полоска (число внутри, GDD 6.2)
    const xw = W - 120, xx = 60, xy = 26, xh = 16;
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(xx, xy, xw, xh);
    ctx.fillStyle = '#4da6ff'; ctx.fillRect(xx, xy, xw * this.progression.progress, xh);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText(Math.floor(this.progression.xp) + ' / ' + this.progression.need, W / 2, xy + 12);
    // HP-полоска (число внутри)
    const hw = W - 120, hx = 60, hy = 44, hh = 14;
    void H;
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#f00'; ctx.fillRect(hx, hy, hw * (this.player.hp / this.player.maxHp), hh);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText(Math.ceil(this.player.hp) + ' / ' + this.player.maxHp, W / 2, hy + 11);
  }

  _drawUpgrade(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    ctx.fillText(this._t('upgrade_title'), W / 2, 170);
    const cw = W - 60, ch = 84, x0 = 30;
    let y0 = 200;
    ctx.textAlign = 'left';
    for (const c of this.choices) {
      ctx.fillStyle = '#222'; ctx.fillRect(x0, y0, cw, ch);
      ctx.strokeStyle = '#ffd34d'; ctx.strokeRect(x0, y0, cw, ch);
      ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 14px monospace';
      ctx.fillText(c.title, x0 + 12, y0 + 24);
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
      ctx.fillText((c.desc || '').slice(0, 48), x0 + 12, y0 + 44);
      ctx.fillStyle = '#8f8'; ctx.font = '12px monospace';
      ctx.fillText(c.info || '', x0 + 12, y0 + 64);
      y0 += ch + 12;
    }
  }
}
