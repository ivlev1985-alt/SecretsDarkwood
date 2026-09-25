import { drawButton, drawPanel, hit } from './widgets.js';
import { ShopSystem } from '../systems/ShopSystem.js';

// Предметный магазин: вкладка «Магазин» (6 офферов, обновление раз в час / за рекламу)
// и «Инвентарь» (8 слотов, выбор → характеристики + Продать).
export class ShopMenu {
  constructor() {
    this.tab = 'shop';
    this.scroll = 0;
    this.selected = null; // slot id в инвентаре
    this.confirmIdx = -1; // индекс оффера в stock.offers
    this.toast = null;
    this.PER_PAGE = 3;
  }
  open(game) {
    this.tab = 'shop';
    this.scroll = 0;
    this.selected = null;
    this.confirmIdx = -1;
    this.toast = null;
    void game;
  }
  draw(ctx, game, W, H) {
    void H;
    const t = (k, p) => game._t(k, p);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 30, y: 120, w: W - 60, h: 540 }, t('shop_title'));
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🪙 ' + game.save.data.coins, W / 2, 185);
    // вкладки
    const tabW = (356 - 6) / 2;
    this._tabShop = { x: 50, y: 195, w: tabW, h: 36 };
    this._tabInv = { x: 50 + tabW + 6, y: 195, w: tabW, h: 36 };
    drawButton(ctx, this._tabShop, t('shop_tab_shop'), { primary: this.tab === 'shop' });
    drawButton(ctx, this._tabInv, t('shop_tab_inventory'), { primary: this.tab === 'inv' });
    if (this.tab === 'shop') this._drawShop(ctx, game, W, t);
    else this._drawInv(ctx, game, W, t);
    // тост
    if (this.toast) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(W / 2 - 130, 560, 260, 30);
      ctx.fillStyle = '#8f8';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.toast.text, W / 2, 580);
    }
    drawButton(ctx, { x: W / 2 - 90, y: 604, w: 180, h: 40 }, t('close'), { primary: true });
    this._close = { x: W / 2 - 90, y: 604, w: 180, h: 40 };
    ctx.textAlign = 'center';
  }

  // ---------- вкладка Магазин ----------
  _drawShop(ctx, game, W, t) {
    // офферы: колонка карточек 50..406, справа колонка скролла 414..442
    const offers = game.save.data.stock.offers;
    const maxScroll = Math.max(0, offers.length - this.PER_PAGE);
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll));
    const cardX = 50, cardW = 356, cardH = 92, step = 100;
    let y = 245;
    this._buyRects = [];
    for (let i = this.scroll; i < Math.min(offers.length, this.scroll + this.PER_PAGE); i++) {
      this._drawOffer(ctx, game, t, offers[i], i, cardX, y, cardW, cardH);
      y += step;
    }
    const listTop = 245, listH = this.PER_PAGE * step - 8;
    const colX = 414, colW = 28;
    this._upRect = { x: colX, y: listTop, w: colW, h: 40 };
    this._downRect = { x: colX, y: listTop + listH - 40, w: colW, h: 40 };
    this._trackRect = { x: colX, y: listTop + 44, w: colW, h: listH - 88 };
    this._thumb = null;
    if (offers.length > this.PER_PAGE) {
      drawButton(ctx, this._upRect, '▲');
      drawButton(ctx, this._downRect, '▼');
      const tr = this._trackRect;
      ctx.fillStyle = '#333';
      ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
      const th = Math.max(24, (tr.h * this.PER_PAGE) / offers.length);
      const ty = tr.y + ((tr.h - th) * this.scroll) / maxScroll;
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(tr.x, ty, tr.w, th);
      this._thumb = { x: tr.x, y: ty, w: tr.w, h: th };
    } else {
      this._upRect = null; this._downRect = null; this._trackRect = null;
    }
    // низ: таймер + «Обновить» (правая грань под правой гранью карточек),
    // при подтверждении покупки строку занимает «Отмена»
    const rowY = 548, rowH = 26;
    if (this.confirmIdx >= 0) {
      drawButton(ctx, { x: cardX, y: rowY, w: cardW, h: rowH }, t('cancel'));
      this._cancelRect = { x: cardX, y: rowY, w: cardW, h: rowH };
      this._refreshRect = null;
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.fillText(t('shop_refresh_in', { time: game.stockRemain() }), cardX, rowY + 17);
      const adReady = game.stockAdReady();
      const rw = 176;
      const rr = { x: cardX + cardW - rw, y: rowY, w: rw, h: rowH };
      drawButton(ctx, rr, '📺 ' + t('shop_refresh'), { primary: adReady, disabled: !adReady });
      this._refreshRect = rr;
      this._cancelRect = null;
    }
  }

  _drawOffer(ctx, game, t, offer, idx, x, y, w, h) {
    const rar = game.shop.rarityOf(offer);
    const slot = game.shop.slotById.get(offer.slot);
    ctx.fillStyle = '#1c1c34';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rar ? rar.color : '#ffd34d';
    ctx.strokeRect(x, y, w, h);
    // иконка-заглушка: буква слота в рамке цвета редкости
    ctx.fillStyle = '#888';
    ctx.fillRect(x + 8, y + 10, 36, 36);
    ctx.strokeStyle = rar ? rar.color : '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 10, 36, 36);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(slot ? slot.icon_letter : '?', x + 26, y + 33);
    // название цветом редкости
    ctx.textAlign = 'left';
    ctx.fillStyle = rar ? rar.color : '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(game.itemName(offer).slice(0, 30), x + 52, y + 22);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    if (offer.slot === 'staff') {
      ctx.fillStyle = '#ff9d4d';
      ctx.fillText((game.weaponName(offer.spell) + ' · Lv.' + (offer.spell_level || 1)).slice(0, 40), x + 52, y + 40);
      ctx.fillStyle = '#aaa';
      ctx.fillText((rar ? game._t(rar.name_key) : '').slice(0, 40), x + 52, y + 56);
    } else {
      const lines = this._statLines(game, offer);
      ctx.fillText(lines[0] || '', x + 52, y + 40);
      ctx.fillText(lines[1] || '', x + 52, y + 56);
    }
    const chk = game.shop.checkBuy(offer, game.save.data.gear, game.save.data.coins);
    let label;
    if (!chk.ok && chk.reason === 'occupied') label = t('shop_occupied');
    else label = t('buy') + ' · ' + t('shop_price_format', { price: offer.price });
    const r = { x: x + 12, y: y + h - 28, w: w - 24, h: 22 };
    const confirming = this.confirmIdx === idx;
    drawButton(ctx, r, confirming ? t('confirm') + '?' : label, { disabled: !confirming && !chk.ok });
    (this._buyRects = this._buyRects || []).push({ idx, r });
  }

  _statLines(game, offer) {
    const parts = (offer.stats || []).map((st) => ShopSystem.statText(st, (k) => game._t(k)));
    const l1 = (parts[0] || '') + (parts[1] ? ' · ' + parts[1] : '');
    const l2 = (parts[2] || '') + (parts[3] ? ' · ' + parts[3] : '');
    return [l1.slice(0, 40), l2.slice(0, 40)];
  }

  // ---------- вкладка Инвентарь ----------
  _drawInv(ctx, game, W, t) {
    const slots = game.shop.cfg.slots;
    const cell = 82, gap = 8;
    const x0 = 50 + ((364 - (4 * cell + 3 * gap)) / 2);
    let y0 = 245;
    this._slotRects = [];
    ctx.textAlign = 'center';
    slots.forEach((s, i) => {
      const cx = x0 + (i % 4) * (cell + gap);
      const cy = y0 + Math.floor(i / 4) * (cell + gap);
      const item = game.save.data.gear[s.id];
      const rar = item ? game.shop.rarityOf(item) : null;
      ctx.fillStyle = this.selected === s.id ? '#3a3a1c' : '#1c1c34';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.strokeStyle = rar ? rar.color : '#555';
      ctx.lineWidth = this.selected === s.id ? 3 : 2;
      ctx.strokeRect(cx, cy, cell, cell);
      ctx.fillStyle = item ? (rar ? rar.color : '#fff') : '#555';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(item ? game.itemName(item).slice(0, 6) : s.icon_letter, cx + cell / 2, cy + 40);
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(game._t(s.name_key).slice(0, 14), cx + cell / 2, cy + 62);
      this._slotRects.push({ id: s.id, r: { x: cx, y: cy, w: cell, h: cell } });
    });
    // низ: характеристики выбранного + Продать
    const dy = 435;
    const sel = this.selected ? game.save.data.gear[this.selected] : null;
    ctx.textAlign = 'left';
    if (!sel) {
      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.fillText(t('inv_empty'), 60, dy + 20);
    } else {
      const rar = game.shop.rarityOf(sel);
      ctx.fillStyle = rar ? rar.color : '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(game.itemName(sel).slice(0, 34), 60, dy + 20);
      // кнопка продажи сразу под названием, характеристики ниже — без наложений
      const sp = game.shop.sellPrice(sel);
      const r = { x: 60, y: dy + 32, w: W - 120, h: 30 };
      drawButton(ctx, r, t('inv_sell') + ' · ' + t('shop_price_format', { price: sp }), { primary: true });
      this._sellRect = r;
      ctx.font = '12px monospace';
      ctx.fillStyle = '#fff';
      let yy = dy + 84;
      if (sel.slot === 'staff') {
        ctx.fillText((game.weaponName(sel.spell) + ' · Lv.' + (sel.spell_level || 1)).slice(0, 40), 60, yy);
      } else {
        for (const st of (sel.stats || []).slice(0, 4)) {
          ctx.fillText(ShopSystem.statText(st, (k) => game._t(k)).slice(0, 40), 60, yy);
          yy += 20;
        }
      }
    }
    if (!sel) this._sellRect = null;
    ctx.textAlign = 'center';
  }

  click(game, x, y) {
    const t = (k) => game._t(k);
    if (this._close && hit(x, y, this._close)) { this.confirmIdx = -1; return 'close'; }
    if (this._tabShop && hit(x, y, this._tabShop)) { this.tab = 'shop'; this.confirmIdx = -1; return true; }
    if (this._tabInv && hit(x, y, this._tabInv)) { this.tab = 'inv'; this.confirmIdx = -1; return true; }
    if (this.tab === 'shop') return this._clickShop(game, x, y, t);
    // инвентарь
    for (const s of (this._slotRects || [])) {
      if (hit(x, y, s.r)) { this.selected = (this.selected === s.id) ? null : s.id; return true; }
    }
    if (this._sellRect && hit(x, y, this._sellRect) && this.selected) {
      const item = game.save.data.gear[this.selected];
      if (item) {
        game.save.addCoins(game.shop.sellPrice(item));
        game.save.data.gear[this.selected] = null;
        if (!Object.values(game.save.data.gear).some(Boolean)) game.save.data.gear = {};
        // заклинание посоха остаётся открытым
        game.save.save();
        this.toast = { text: t('shop_toast_purchased'), t: 1.5 };
        try { game.audio.playSfx(game.shop.shop.sfx_success); } catch (e) {}
        this.selected = null;
      }
      return true;
    }
    return false;
  }

  _clickShop(game, x, y, t) {
    if (this._refreshRect && hit(x, y, this._refreshRect)) { game.refreshStockAd(); return true; }
    if (this._upRect && hit(x, y, this._upRect)) { this.scroll--; return true; }
    if (this._downRect && hit(x, y, this._downRect)) { this.scroll++; return true; }
    if (this._trackRect && hit(x, y, this._trackRect)) {
      const mid = this._thumb ? this._thumb.y + this._thumb.h / 2 : 0;
      this.scroll += y > mid ? 1 : -1;
      return true;
    }
    if (this._cancelRect && hit(x, y, this._cancelRect)) { this.confirmIdx = -1; return true; }
    const offers = game.save.data.stock.offers;
    for (const b of (this._buyRects || [])) {
      if (!hit(x, y, b.r)) continue;
      const offer = offers[b.idx];
      if (!offer) return true;
      const chk = game.shop.checkBuy(offer, game.save.data.gear, game.save.data.coins);
      if (!chk.ok) {
        this.toast = { text: chk.reason === 'occupied' ? t('shop_occupied') : t('shop_price_format', { price: chk.price }), t: 1.5 };
        try { game.audio.playSfx(game.shop.shop.sfx_fail); } catch (e) {}
        return true;
      }
      if (game.shop.shop.confirm_purchase && this.confirmIdx !== b.idx) {
        this.confirmIdx = b.idx;
        return true;
      }
      // покупка: предмет в слот, посох открывает заклинание навсегда
      game.save.spendCoins(offer.price);
      game.save.data.gear[offer.slot] = JSON.parse(JSON.stringify(offer));
      if (offer.slot === 'staff' && offer.spell && !game.save.data.unlockedSpells.includes(offer.spell)) {
        game.save.data.unlockedSpells.push(offer.spell);
      }
      offers.splice(b.idx, 1);
      game.save.save();
      this.confirmIdx = -1;
      this.toast = { text: t('shop_toast_purchased'), t: 1.5 };
      try { game.audio.playSfx(game.shop.shop.sfx_success); } catch (e) {}
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
  }
}

// Заглушки попапов переехали в отдельные классы ниже (Daily/Stats/Leaders — без изменений API)
export class DailyBonusPopup {
  draw(ctx, game, W, H) {
    void H;
    const t = (k, p) => game._t(k, p);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 60, y: 250, w: W - 120, h: 230 }, t('daily_bonus_title'));
    const ready = game.dailyReady();
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    if (ready) {
      ctx.fillStyle = '#8f8';
      ctx.fillText(t('daily_bonus_available'), W / 2, 320);
      ctx.fillStyle = '#ffd34d';
      ctx.font = '15px monospace';
      ctx.fillText(t('daily_bonus_reward'), W / 2, 348);
      drawButton(ctx, { x: W / 2 - 110, y: 370, w: 220, h: 44 }, '🎁 ' + t('claim'), { primary: true });
    } else {
      ctx.fillStyle = '#aaa';
      ctx.fillText(t('daily_bonus_claimed'), W / 2, 312);
      ctx.fillStyle = '#ffd34d';
      ctx.font = '14px monospace';
      ctx.fillText(t('daily_bonus_next_in', { time: game.daily.fmtRemain(game.save.data.dailyLast) }), W / 2, 336);
      drawButton(ctx, { x: W / 2 - 110, y: 362, w: 220, h: 40 }, '📺 ' + t('claim'), { primary: true, disabled: !game.dailyAdReady() });
    }
    this._claim = { x: W / 2 - 110, y: ready ? 370 : 362, w: 220, h: ready ? 44 : 40 };
    drawButton(ctx, { x: W / 2 - 90, y: 424, w: 180, h: 36 }, t('close'));
    this._close = { x: W / 2 - 90, y: 424, w: 180, h: 36 };
  }
  click(game, x, y) {
    if (this._claim && hit(x, y, this._claim)) {
      if (game.dailyReady()) {
        game.claimDaily();
        return 'close';
      }
      game.claimDailyAd(); // async: закроется сам при успехе
      return true;
    }
    if (this._close && hit(x, y, this._close)) return 'close';
    return false;
  }
}

export class StatsPopup {
  draw(ctx, game, W, H) {
    void H;
    const t = (k) => game._t(k);
    const st = game.save.data.stats;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 50, y: 220, w: W - 100, h: 260 }, t('stats'));
    const fav = game.save.favoriteWeapon();
    const rows = [
      t('stat_total_time') + ': ' + game.fmtTime(st.totalTime),
      t('stat_total_kills') + ': ' + st.totalKills,
      t('stat_best_time') + ': ' + game.fmtTime(st.bestTime),
      t('stat_total_runs') + ': ' + st.totalRuns,
      t('stat_favorite_weapon') + ': ' + (fav ? game.weaponName(fav.id) : '—')
    ];
    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    let y = 280;
    for (const r of rows) {
      ctx.fillStyle = '#fff';
      ctx.fillText(r.slice(0, 42), 70, y);
      y += 28;
    }
    ctx.textAlign = 'center';
    drawButton(ctx, { x: W / 2 - 90, y: 424, w: 180, h: 40 }, t('close'), { primary: true });
    this._close = { x: W / 2 - 90, y: 424, w: 180, h: 40 };
  }
  click(game, x, y) {
    void game;
    if (this._close && hit(x, y, this._close)) return 'close';
    return false;
  }
}

export class LeadersPopup {
  draw(ctx, game, W, H) {
    void H;
    const t = (k) => game._t(k);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 50, y: 220, w: W - 100, h: 260 }, t('leaderboard'));
    ctx.textAlign = 'center';
    ctx.font = '13px monospace';
    const list = game.leaderEntries;
    if (!list) {
      ctx.fillStyle = '#888';
      ctx.fillText('...', W / 2, 320);
    } else if (!list.length) {
      ctx.fillStyle = '#fff';
      ctx.fillText('🏆 ' + game.fmtTime(game.save.data.stats.bestTime), W / 2, 320);
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.fillText('(local)', W / 2, 344);
    } else {
      let y = 290;
      list.slice(0, 5).forEach((e, i) => {
        ctx.fillStyle = '#fff';
        ctx.fillText((i + 1) + '. ' + (e.name || '?') + ' — ' + game.fmtTime(e.score || 0), W / 2, y);
        y += 26;
      });
    }
    drawButton(ctx, { x: W / 2 - 90, y: 424, w: 180, h: 40 }, t('close'), { primary: true });
    this._close = { x: W / 2 - 90, y: 424, w: 180, h: 40 };
  }
  click(game, x, y) {
    void game;
    if (this._close && hit(x, y, this._close)) return 'close';
    return false;
  }
}
