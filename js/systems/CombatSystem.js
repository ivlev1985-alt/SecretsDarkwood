import { Player } from '../entities/Player.js';

// Контактный урон + попадания снарядов + криты + цифры (только криты/боссы, GDD 6.6).
export class CombatSystem {
  constructor(gameCfg, balanceCfg) {
    this.collideMonsterMonster = gameCfg.collisions.monsters_collide_with_monsters !== false;
    this.collidePlayerMonster = gameCfg.collisions.player_collides_with_monsters === true; // false по GDD
    this.showCritsOnly = gameCfg.ui.damage_text_show_crits_only !== false;
    this.showBossAlways = gameCfg.ui.damage_text_show_bosses_always !== false;
    this.critChance = balanceCfg.player.crit_chance ?? 0.05;
    this.critMul = balanceCfg.player.crit_multiplier ?? 2;
    this.texts = []; // {x,y,vy,txt,color,life,maxLife}
    this.kills = 0;
    this.killsByWeapon = {}; // weaponId -> kills (любимое заклинание, Этап 5)
  }

  addKill(weaponId) {
    this.kills++;
    if (weaponId) this.killsByWeapon[weaponId] = (this.killsByWeapon[weaponId] || 0) + 1;
  }

  favoriteWeapon() {
    let best = null, n = 0;
    for (const [id, k] of Object.entries(this.killsByWeapon)) {
      if (k > n) { n = k; best = id; }
    }
    return best ? { id: best, kills: n } : null;
  }

  rollDamage(base, rand = Math.random) {
    return Player.rollCrit(this.critChance, this.critMul, base, rand);
  }

  pushText(x, y, txt, color = '#ffcc00') {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, vy: -60, txt, color, life: 0, maxLife: 0.8 });
  }

  updateTexts(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt; t.y += t.vy * dt;
      if (t.life >= t.maxLife) this.texts.splice(i, 1);
    }
  }

  // Расталкивание монстров (чтобы не слипались в точку, GDD 6.6)
  separate(enemies) {
    if (!this.collideMonsterMonster) return;
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a.alive || a.deathT > 0) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b.alive || b.deathT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          a.x -= dx * push * 0.5; a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5; b.y += dy * push * 0.5;
        }
      }
    }
  }

  // Контакт: игрок проходит сквозь (блока нет), но урон при пересечении хитбоксов
  contactDamage(player, enemies) {
    if (!player.alive) return;
    for (const e of enemies) {
      if (!e.alive || e.deathT > 0) continue;
      const dx = player.x - e.x, dy = player.y - e.y;
      const rr = player.radius + e.radius;
      if (dx * dx + dy * dy < rr * rr) {
        player.takeContactDamage(e.damage);
        if (this.collidePlayerMonster) {
          // физический блок (выкл по GDD, ветка на будущее)
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          player.x = e.x + (dx / d) * rr;
          player.y = e.y + (dy / d) * rr;
        }
      }
    }
  }

  // Снаряды игрока по врагам. Возвращает число убийств за кадр.
  projectilesVsEnemies(projectiles, enemies, onKill) {
    let kills = 0;
    for (const p of projectiles) {
      if (!p.active) continue;
      for (const e of enemies) {
        if (!e.alive || e.deathT > 0) continue;
        if (p.hitIds.has(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.radius + p.radius;
        if (dx * dx + dy * dy < rr * rr) {
          const wasAlive = e.hp;
          e.takeDamage(p.damage, p.vx * 0.15, p.vy * 0.15);
          if (p.crit || (e.isBoss && this.showBossAlways)) {
            this.pushText(e.x, e.y - 20, Math.round(p.damage) + (p.crit ? '!' : ''), p.crit ? '#ffcc00' : '#fff');
          }
          if (e.hp <= 0 && wasAlive > 0) { kills++; this.addKill(p.weaponId); if (onKill) onKill(e); }
          // взрыв fireball
          if (p.explosionR > 0) {
            for (const o of enemies) {
              if (o === e || !o.alive || o.deathT > 0) continue;
              const ox = o.x - p.x, oy = o.y - p.y;
              if (ox * ox + oy * oy < p.explosionR * p.explosionR) {
                const w = o.hp;
                o.takeDamage(p.explosionDmg, 0, 0);
                if (o.hp <= 0 && w > 0) { kills++; this.addKill(p.weaponId); if (onKill) onKill(o); }
              }
            }
          }
          if (p.pierce > 0) { p.pierce--; p.hitIds.add(e); }
          else { p.active = false; p.alive = false; }
          break;
        }
      }
    }
    return kills;
  }

  // Снаряды врагов по игроку
  enemyProjectilesVsPlayer(projectiles, player) {
    for (const p of projectiles) {
      if (!p.active || p.friendly) continue;
      const dx = player.x - p.x, dy = player.y - p.y;
      const rr = player.radius + p.radius;
      if (dx * dx + dy * dy < rr * rr) {
        player.takeContactDamage(p.damage);
        p.active = false; p.alive = false;
      }
    }
  }
}
