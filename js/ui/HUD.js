import { drawButton, drawPanel, hit } from './widgets.js';

// HUD по ГДД п.6.2–6.5: всё сверху/снизу, портрет. + попап инвентаря (read-only билд).
export class HUD {
  constructor() {
    this.R = {};
  }
  layout(W, H) {
    this.R = {
      pause: { x: 12, y: H - 60, w: 56, h: 48 },
      inv: { x: W - 68, y: H - 60, w: 56, h: 48 }
    };
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
  drawBottom(ctx, game, W, H) {
    const R = this.layout(W, H);
    // активные заклинания (иконка-заглушка + Lv)
    const owned = game.skills.ownedList();
    let sx = 84;
    ctx.textAlign = 'left';
    for (let i = 0; i < Math.min(owned.length, 6); i++) {
      const st = owned[i];
      const small = owned.length > 6;
      const s = small ? 24 : 32;
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(sx, H - 104, s, s);
      ctx.strokeStyle = '#ffd34d';
      ctx.strokeRect(sx, H - 104, s, s);
      ctx.fillStyle = '#fff';
      ctx.font = (small ? 10 : 12) + 'px monospace';
      ctx.fillText('Lv.' + st.level, sx + s + 6, H - 104 + s - 4);
      sx += s + 52;
      if (sx > W - 140) break;
    }
    drawButton(ctx, R.pause, '⏸');
    drawButton(ctx, R.inv, '🎒');
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
    drawPanel(ctx, { x: 40, y: 180, w: W - 80, h: 340 }, game._t('inventory_title'));
    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    let y = 230;
    const owned = game.skills.ownedList();
    if (!owned.length) {
      ctx.fillStyle = '#888';
      ctx.fillText(game._t('inventory_empty'), 70, y);
    }
    for (const st of owned) {
      ctx.fillStyle = '#fff';
      ctx.fillText(game.upgrades.t(st.cfg.name_key) + '  Lv.' + st.level, 70, y);
      y += 24;
      if (y > 470) break;
    }
    ctx.fillStyle = '#8f8';
    for (const [id, lv] of Object.entries(game.player.passiveLevels || {})) {
      if (y > 470) break;
      ctx.fillText(id + '  Lv.' + lv, 70, y);
      y += 22;
    }
    drawButton(ctx, { x: W / 2 - 90, y: 470, w: 180, h: 40 }, game._t('close'));
  }
  invCloseRect(W) { return { x: W / 2 - 90, y: 470, w: 180, h: 40 }; }
  click(game, x, y, W) {
    const R = this.R;
    if (R.pause && hit(x, y, R.pause)) { game.pauseGame(); return true; }
    if (R.inv && hit(x, y, R.inv)) { game.uiInventory = true; return true; }
    void W;
    return false;
  }
}
