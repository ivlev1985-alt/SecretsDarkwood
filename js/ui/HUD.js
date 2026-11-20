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
  // Прямоугольник шкалы HP на верхней панели (учитывает flip джойстика).
  hpBarRect(game, W) {
    const g = game.config.game_config;
    const flip = g.controls.hud_flip_with_joystick && game.input.getJoystickSide() === 'left';
    // Оставляем место в правом верхнем углу панели под счётчик FPS.
    const fpsPad = game.settings && game.settings.showFps ? 58 : 0;
    return { x: flip ? W - 196 - fpsPad : 12, y: 8, w: 184, h: 20 };
  }
  // Иконки аптечек, летящие из мира к шкале HP (экранные координаты).
  drawHealthFlyers(ctx, game, W, H) {
    const list = game.potionFlyers || [];
    if (!list.length) return;
    const cfg = (game.config.balance_config || {}).health_ui || {};
    const rad = cfg.potion_icon_radius || 8;
    const arcH = cfg.potion_fly_arc || 60;
    for (const f of list) {
      const k = f.dur > 0 ? Math.max(0, Math.min(1, f.t / f.dur)) : 1;
      const e = k * k * (3 - 2 * k); // ease-in-out по пути
      const sx = f.wx - game.camera.x + W / 2;
      const sy = f.wy - game.camera.y + H / 2;
      const x = sx + (f.tx - sx) * e;
      const y = sy + (f.ty - sy) * e - Math.sin(k * Math.PI) * arcH;
      ctx.save();
      // красная «аптечка» с белым крестом
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.max(10, Math.round(rad * 1.4)) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+', x, y + Math.round(rad * 0.45));
      ctx.restore();
    }
  }
  drawTop(ctx, game, W) {
    const g = game.config.game_config;
    const flip = g.controls.hud_flip_with_joystick && game.input.getJoystickSide() === 'left';
    const p = game.player;
    const fpsOn = !!(game.settings && game.settings.showFps);
    const fpsPad = fpsOn ? 58 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 78);
    // HP слева / уровень справа (или наоборот при flip)
    const bar = this.hpBarRect(game, W);
    const lvX = flip ? 12 : W - 84 - fpsPad;
    // HP-бар с числом внутри. Ширина берётся из hpDisplay — она плавно
    // догоняет реальное HP после прилёта иконки аптечки (см. Game._updateHealthUI).
    const shownHp = (typeof game.hpDisplay === 'number') ? game.hpDisplay : p.hp;
    ctx.fillStyle = '#400';
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    ctx.fillStyle = '#f00';
    ctx.fillRect(bar.x, bar.y, bar.w * Math.max(0, Math.min(1, shownHp / p.maxHp)), bar.h);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('❤ ' + Math.ceil(shownHp) + ' / ' + p.maxHp, bar.x + bar.w / 2, bar.y + 15);
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
    // Счётчик FPS — правый верхний угол верхней панели.
    if (fpsOn) {
      const label = game.fps + ' FPS';
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(W - 16 - tw, 5, tw + 12, 16);
      ctx.fillStyle = '#0f0';
      ctx.fillText(label, W - 10, 18);
    }
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
  // Раскладка иконок умений внизу: активные — верхний ряд, пассивные — нижний.
  // Возвращает и позиции, и общий размер — этим же пользуется полёт апгрейда.
  skillSlots(game, W, H) {
    const R = this.layout(W, H);
    const actives = game.skills.ownedList();
    const passives = [];
    const pl = game.player.passiveLevels || {};
    const passivesCfg = (game.config.skills_config && game.config.skills_config.passive_skills) || [];
    for (const p of passivesCfg) if ((pl[p.id] || 0) > 0) passives.push(p);

    const left = R.menu.x + R.menu.w + 8;
    const right = W - 12;
    const avail = Math.max(60, right - left);
    const cx = (left + right) / 2;
    const topN = actives.length, botN = passives.length;
    // Шахматный порядок: нижний ряд смещён на полшага относительно верхнего.
    // Если разница количества иконок нечётная, они и так попадают в пазы
    // верхнего ряда, поэтому дополнительный сдвиг не нужен.
    const rowShiftFor = (step) => (topN > 0 && (topN - botN) % 2 === 0) ? step / 2 : 0;
    // Подбор размера: учитываем и сдвиг нижнего ряда, чтобы он не вылез за край.
    let s = 24;
    for (const cand of [64, 48, 32, 24]) {
      const step = (cand / 2) * Math.sqrt(3) + 4;
      const shift = rowShiftFor(step);
      const halfTop = topN > 0 ? ((topN - 1) * step + cand) / 2 : 0;
      const halfBot = botN > 0 ? ((botN - 1) * step + cand) / 2 + shift : 0;
      s = cand;
      if (Math.max(halfTop, halfBot) * 2 <= avail) break;
    }
    const r = s / 2;
    const stepX = r * Math.sqrt(3) + 4;
    const stepY = r * 1.5 + 4;
    const yBot = H - 8 - r;
    const yTop = yBot - stepY;
    const rowShift = rowShiftFor(stepX);
    const mkSlots = (items, y, isPassive, shiftX) => items.map((it, i) => ({
      item: it,
      isPassive,
      x: cx + (i - (items.length - 1) / 2) * stepX + shiftX,
      y
    }));
    return {
      menu: R.menu,
      actives: mkSlots(actives, yTop, false, 0),
      passives: mkSlots(passives, yBot, true, rowShift),
      size: s
    };
  }
  drawBottom(ctx, game, W, H) {
    const L = this.skillSlots(game, W, H);
    drawButton(ctx, L.menu, game._t('menu_btn'));
    // Во время полёта выбранного апгрейда его будущая иконка временно скрыта,
    // чтобы не было дубля под летящей иконкой.
    const hide = game._hiddenHudUpgrade;
    const drawSlot = (slot) => {
      const cfg = slot.isPassive ? slot.item : slot.item.cfg;
      const id = slot.isPassive ? slot.item.id : slot.item.cfg.id;
      if (hide && hide.kind === (slot.isPassive ? 'passive' : 'weapon') && hide.id === id) return;
      drawSkillIcon(ctx, game, iconKey(cfg), slot.x, slot.y, L.size, {
        borderColor: slot.isPassive ? '#8f8' : HUD.skillColor(cfg.type),
        label: false
      });
      if (!slot.isPassive) {
        // Перезарядка: затемнение + светлое заполнение снизу вверх.
        // waiting — оружие ждёт цель (короткий ретрай), показываем как "готово".
        const cdMax = game.skills.weaponCooldown(slot.item, game.player);
        const prog = (cdMax > 0 && !slot.item.waiting) ? 1 - Math.max(0, slot.item.cd) / cdMax : 1;
        drawCooldown(ctx, slot.x, slot.y, L.size, prog);
      }
    };
    L.actives.forEach(drawSlot);
    L.passives.forEach(drawSlot);
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
