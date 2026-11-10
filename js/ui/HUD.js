import { drawButton, drawPanel, hit } from './widgets.js';
import { drawSkillIcon, iconKey, drawCooldown } from './hexIcons.js';

// HUD по ГДД п.6.2–6.5: всё сверху/снизу, портрет. + попап инвентаря (read-only билд).
export class HUD {
  constructor() {
    this.R = {};
  }
  layout(W, H) {
    this.R = {
      menu: { x: 12, y: H - 60, w: 64, h: 48 }
    };
    void W;
    return this.R;
  }
  drawTop(ctx, game, W) {
    const g = game.config.game_config;
    const flip = g.controls.hud_flip_with_joystick && game.input.getJoystickSide() === 'left';
    const p = game.player;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 78);
    // HP слева / уровень справа (или наоборот при flip)
    const hpX = flip ? W - 196 : 12, lvX = flip ? 12 : W - 84;
    // HP-бар с числом внутри
    ctx.fillStyle = '#400';
    ctx.fillRect(hpX, 8, 184, 20);
    ctx.fillStyle = '#f00';
    ctx.fillRect(hpX, 8, 184 * (p.hp / p.maxHp), 20);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('❤ ' + Math.ceil(p.hp) + ' / ' + p.maxHp, hpX + 92, 23);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Lv.' + game.progression.level, lvX, 23);
    // XP-бар центр ниже
    const xw = W - 24, xx = 12, xy = 32, xh = 14;
    ctx.fillStyle = '#112';
    ctx.fillRect(xx, xy, xw, xh);
    ctx.fillStyle = '#4da6ff';
    ctx.fillRect(xx, xy, xw * game.progression.progress, xh);
    ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(Math.floor(game.progression.xp) + ' / ' + game.progression.need, W / 2, xy + 11);
    // ряд: таймер слева / kills+coins справа
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
    ctx.fillText('⏱ ' + game.fmtTime(game.time), flip ? W - 120 : 12, 62);
    ctx.textAlign = 'right';
    ctx.fillText('💀 ' + game.combat.kills + '   🪙 ' + p.coins, flip ? 180 : W - 12, 62);
    ctx.textAlign = 'center';
  }
  // Короткий код оружия для иконки-заглушки: magic_bolt -> MB.
  // Как персонаж/монстры без арта — серая плашка с подписью; заменится картинкой.
  static skillCode(id) {
    return String(id).split('_').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  }
  static skillColor(type) {
    if (type === 'around_player' || type === 'orbit') return '#00ccff';
    if (type === 'area') return '#ff4400';
    return '#ffd34d';
  }
  drawBottom(ctx, game, W, H) {
    const R = this.layout(W, H);
    drawButton(ctx, R.menu, game._t('menu_btn'));
    // Активные заклинания — верхний ряд, пассивные умения — нижний.
    const actives = game.skills.ownedList();
    const passives = [];
    const pl = game.player.passiveLevels || {};
    const passivesCfg = (game.config.skills_config && game.config.skills_config.passive_skills) || [];
    for (const p of passivesCfg) if ((pl[p.id] || 0) > 0) passives.push(p);

    const left = R.menu.x + R.menu.w + 8;
    const right = W - 12;
    const avail = Math.max(60, right - left);
    const cx = (left + right) / 2;
    const maxN = Math.max(actives.length, passives.length, 1);
    // Подбор размера: самый длинный ряд должен влезать между кнопкой и краем.
    let s = 64;
    for (const cand of [64, 48, 32, 24]) {
      s = cand;
      if (maxN <= Math.max(1, Math.floor(avail / (cand * Math.sqrt(3) + 4)))) break;
    }
    const r = s / 2;
    const stepX = r * Math.sqrt(3) + 4;
    const stepY = r * 1.5 + 4;
    const yBot = H - 8 - r;
    const yTop = yBot - stepY;
    const drawRow = (items, y, isPassive) => {
      items.forEach((it, i) => {
        const x = cx + (i - (items.length - 1) / 2) * stepX;
        const cfg = isPassive ? it : it.cfg;
        drawSkillIcon(ctx, game, iconKey(cfg), x, y, s, {
          borderColor: isPassive ? '#8f8' : HUD.skillColor(cfg.type),
          label: false
        });
        if (!isPassive) {
          // Перезарядка: затемнение + светлое заполнение снизу вверх.
          // waiting — оружие ждёт цель (короткий ретрай), показываем как "готово".
          const cdMax = game.skills.weaponCooldown(it, game.player);
          const prog = (cdMax > 0 && !it.waiting) ? 1 - Math.max(0, it.cd) / cdMax : 1;
          drawCooldown(ctx, x, y, s, prog);
        }
      });
    };
    drawRow(actives, yTop, false);
    drawRow(passives, yBot, true);
    ctx.textAlign = 'center';
  }
  drawBossBar(ctx, game, W, H) {
    const bosses = game.enemies.filter((e) => e.alive && e.isBoss);
    if (!bosses.length) return;
    const b = bosses[0];
    const bw = W - 60, bx = 30, by = H - 150;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, bw, 26);
    ctx.fillStyle = '#f00';
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * Math.max(0, b.hp / b.maxHp), 22);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText((b.name || 'BOSS') + '  ' + Math.ceil(b.hp) + ' / ' + b.maxHp, W / 2, by + 18);
  }
  drawInventory(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, { x: 40, y: 180, w: W - 80, h: 340 }, game._t('inventory_title'));
    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    let y = 230;
    const gear = game.save.data.gear || {};
    const slots = game.shop.cfg.slots;
    let any = false;
    for (const s of slots) {
      if (y > 460) break;
      const item = gear[s.id];
      if (!item) continue;
      any = true;
      const rar = game.shop.rarityOf(item);
      ctx.fillStyle = rar ? rar.color : '#fff';
      ctx.fillText((game._t(s.name_key) + ': ' + game.itemName(item)).slice(0, 36), 70, y);
      y += 24;
    }
    if (!any) {
      ctx.fillStyle = '#888';
      ctx.fillText(game._t('inventory_empty'), 70, y);
      y += 24;
    }
    // активные заклинания забега
    ctx.fillStyle = '#8f8';
    for (const st of game.skills.ownedList()) {
      if (y > 460) break;
      ctx.fillText((game.weaponName(st.cfg.id) + '  Lv.' + st.level).slice(0, 36), 70, y);
      y += 22;
    }
    drawButton(ctx, { x: W / 2 - 90, y: 470, w: 180, h: 40 }, game._t('close'));
  }
  invCloseRect(W) { return { x: W / 2 - 90, y: 470, w: 180, h: 40 }; }
  click(game, x, y, W) {
    const R = this.R;
    if (R.menu && hit(x, y, R.menu)) { game.pauseGame(); return true; }
    void W;
    return false;
  }
}
