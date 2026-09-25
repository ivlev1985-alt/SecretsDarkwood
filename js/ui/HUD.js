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
  // Короткий код оружия для иконки-заглушки: magic_bolt -> MB.
  // Как персонаж/монстры без арта — серая плашка с подписью; заменится картинкой.
  static skillCode(id) {
    return String(id).split('_').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  }
  static skillColor(type) {
    if (type === 'around_player') return '#00ccff';
    if (type === 'area') return '#ff4400';
    return '#ffd34d';
  }
  drawBottom(ctx, game, W, H) {
    const R = this.layout(W, H);
    drawButton(ctx, R.pause, '⏸');
    drawButton(ctx, R.inv, '🎒');
    // Умения СТРОГО между кнопками: иконка-плашка как у сущностей, уровень ПОД иконкой
    const owned = game.skills.ownedList();
    const left = R.pause.x + R.pause.w + 8;
    const right = R.inv.x - 8;
    const avail = right - left;
    let s = 32, cellW = 46;
    let perRow = Math.max(1, Math.floor(avail / cellW));
    if (owned.length > perRow) { s = 24; cellW = 34; perRow = Math.max(1, Math.floor(avail / cellW)); }
    const baseY = H - 56; // иконка s px + подпись 12px в полосе кнопок
    owned.forEach((st, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const inRow = Math.min(perRow, owned.length - row * perRow);
      const y = baseY - row * (s + 16);
      const x = left + ((avail - inRow * cellW) / 2) + col * cellW + (cellW - s) / 2;
      // плашка как у сущностей без арта
      ctx.fillStyle = '#888';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = HUD.skillColor(st.cfg.type);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, s, s);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + (st.cfg.type === 'to_target' ? s - 10 : 4), y + s / 2 - 4, 6, 8);
      ctx.fillStyle = '#000';
      ctx.font = 'bold ' + (s > 24 ? 11 : 9) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(HUD.skillCode(st.cfg.id), x + s / 2, y + s / 2 + 4);
      ctx.fillStyle = '#fff';
      ctx.font = (s > 24 ? 11 : 9) + 'px monospace';
      ctx.fillText('Lv.' + st.level, x + s / 2, y + s + 12);
    });
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
    if (R.pause && hit(x, y, R.pause)) { game.pauseGame(); return true; }
    if (R.inv && hit(x, y, R.inv)) { game.uiInventory = true; return true; }
    void W;
    return false;
  }
}
