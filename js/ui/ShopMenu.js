import { drawButton, drawPanel, hit } from './widgets.js';

// Магазин меты (GDD п.5.5): вкладки, карточки, подтверждение, тост.
// Раскладка: карточки слева, справа отдельная колонка ▲/▼ + скроллбар между ними.
export class ShopMenu {
  constructor() {
    this.tab = 'stats';
    this.scroll = 0;
    this.confirmId = null;
    this.toast = null; // { text, t }
  }
  open(game) {
    this.tab = 'stats';
    this.scroll = 0;
    this.confirmId = null;
    this.toast = null;
    void game;
  }
  _items(game) {
    return game.shop.itemsOf(this.tab);
  }
  _perPage() { return 3; }
  _cardH() { return 92; }
  _step() { return this._cardH() + 8; }
  // Строка урона/кд для unlock-товара из skills_config
  _spellStats(game, item) {
    const m = /^weapon\.(.+)\.unlocked$/.exec(item.target || '');
    if (!m) return '';
    const w = (game.config.skills_config.weapons || []).find((x) => x.id === m[1]);
    if (!w) return '';
    let s = 'Урон: ' + (w.damage ?? '?');
    if (w.cooldown_ms) s += ' · КД ' + (w.cooldown_ms / 1000) + 'с';
    if (w.type === 'around_player' && w.aura_radius) s += ' · R' + w.aura_radius;
    if (w.type === 'area' && w.area_radius) s += ' · R' + w.area_radius;
    return s;
  }
  draw(ctx, game, W, H) {
    void H;
    const t = (k, p) => game._t(k, p);
    const shop = game.shop;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 30, y: 120, w: W - 60, h: 540 }, t('shop_title'));
    // баланс
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🪙 ' + game.save.data.coins, W / 2, 185);
    // вкладки
    const cats = shop.cfg.categories || [];
    let tx = 50;
    this._tabRects = [];
    const tabW = (356 - 6) / Math.max(1, cats.length);
    for (const c of cats) {
      const r = { x: tx, y: 195, w: tabW, h: 36 };
      drawButton(ctx, r, game._t(c.name_key), { primary: this.tab === c.id });
      this._tabRects.push({ id: c.id, r });
      tx += tabW + 6;
    }
    // товары: колонка карточек 50..406, справа колонка скролла 414..442 (внутри панели 30..450)
    const cardX = 50, cardW = 356;
    const items = this._items(game);
    const perPage = this._perPage();
    const maxScroll = Math.max(0, items.length - perPage);
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll));
    const cardH = this._cardH(), step = this._step();
    let y = 245;
    this._buyRects = [];
    for (let i = this.scroll; i < Math.min(items.length, this.scroll + perPage); i++) {
      const it = items[i];
      const lv = game.save.shopLevel(it.id);
      const maxed = lv >= (it.max_level || 1);
      ctx.fillStyle = '#1c1c34';
      ctx.fillRect(cardX, y, cardW, cardH);
      ctx.strokeStyle = '#ffd34d';
      ctx.strokeRect(cardX, y, cardW, cardH);
      // ВАЖНО: выравнивание влево для каждой карточки (drawButton ниже ставит center)
      // Заголовок + уровень в одной строке (уровень не перекрывается кнопкой)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(game._t(it.name_key), cardX + 12, y + 22);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8f8';
      ctx.font = '11px monospace';
      ctx.fillText(maxed ? t('shop_max_level') : ('Lv. ' + lv + ' / ' + (it.max_level || 1)), cardX + cardW - 12, y + 22);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#aaa';
      ctx.font = '11px monospace';
      ctx.fillText((game._t(it.desc_key) || '').slice(0, 42), cardX + 12, y + 40);
      if (this.tab === 'spells') {
        ctx.fillStyle = '#ff9d4d';
        ctx.font = '11px monospace';
        ctx.fillText(this._spellStats(game, it).slice(0, 42), cardX + 12, y + 56);
      }
      const chk = shop.check(it, lv, game.save.data.coins);
      const label = maxed ? t('shop_max_level') : (t('buy') + ' · ' + t('shop_price_format', { price: chk.price }));
      const r = { x: cardX + 12, y: y + cardH - 28, w: cardW - 24, h: 22 };
      const confirming = this.confirmId === it.id;
      drawButton(ctx, r, confirming ? t('confirm') + '?' : label, { disabled: maxed || (!confirming && !chk.ok) });
      this._buyRects.push({ id: it.id, r });
      y += step;
    }
    const listTop = 245, listH = perPage * step - 8;
    // правая колонка: ▲ / скроллбар / ▼ — всё одной ширины, с отступом от края панели
    const colX = 414, colW = 28;
    this._upRect = { x: colX, y: listTop, w: colW, h: 40 };
    this._downRect = { x: colX, y: listTop + listH - 40, w: colW, h: 40 };
    this._trackRect = { x: colX, y: listTop + 44, w: colW, h: listH - 88 };
    this._thumb = null;
    if (items.length > perPage) {
      drawButton(ctx, this._upRect, '▲');
      drawButton(ctx, this._downRect, '▼');
      const tr = this._trackRect;
      ctx.fillStyle = '#333';
      ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
      const th = Math.max(24, (tr.h * perPage) / items.length);
      const ty = tr.y + ((tr.h - th) * this.scroll) / maxScroll;
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(tr.x, ty, tr.w, th);
      this._thumb = { x: tr.x, y: ty, w: tr.w, h: th };
    } else {
      this._upRect = null;
      this._downRect = null;
      this._trackRect = null;
    }
    // отмена подтверждения
    const afterList = listTop + listH + 4;
    if (this.confirmId) {
      const r = { x: cardX, y: afterList, w: cardW, h: 26 };
      drawButton(ctx, r, t('cancel'));
      this._cancelRect = r;
    } else this._cancelRect = null;
    drawButton(ctx, { x: W / 2 - 90, y: 600, w: 180, h: 44 }, t('close'), { primary: true });
    this._close = { x: W / 2 - 90, y: 600, w: 180, h: 44 };
    // тост
    if (this.toast) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(W / 2 - 110, 560, 220, 30);
      ctx.fillStyle = '#8f8';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.toast.text, W / 2, 580);
    }
    ctx.textAlign = 'center';
  }
  click(game, x, y) {
    const t = (k) => game._t(k);
    if (this._close && hit(x, y, this._close)) { this.confirmId = null; return 'close'; }
    for (const tb of (this._tabRects || [])) {
      if (hit(x, y, tb.r)) { this.tab = tb.id; this.scroll = 0; this.confirmId = null; return true; }
    }
    if (this._upRect && hit(x, y, this._upRect)) { this.scroll--; return true; }
    if (this._downRect && hit(x, y, this._downRect)) { this.scroll++; return true; }
    if (this._trackRect && hit(x, y, this._trackRect)) {
      // клик по треку — страница к месту клика
      const mid = this._thumb ? this._thumb.y + this._thumb.h / 2 : 0;
      this.scroll += y > mid ? 1 : -1;
      return true;
    }
    if (this._cancelRect && hit(x, y, this._cancelRect)) { this.confirmId = null; return true; }
    for (const b of (this._buyRects || [])) {
      if (!hit(x, y, b.r)) continue;
      const it = game.shop.cfg.items.find((i) => i.id === b.id);
      const lv = game.save.shopLevel(it.id);
      const chk = game.shop.check(it, lv, game.save.data.coins);
      if (!chk.ok) {
        try { game.audio.playSfx(game.shop.cfg.shop.sfx_fail); } catch (e) {}
        return true;
      }
      if (game.shop.cfg.shop.confirm_purchase && this.confirmId !== it.id) {
        this.confirmId = it.id;
        return true;
      }
      // покупка
      game.save.spendCoins(chk.price);
      game.save.data.shop[it.id] = lv + 1;
      game.save.save();
      this.confirmId = null;
      this.toast = { text: t('shop_toast_purchased'), t: 1.5 };
      try {
        game.audio.playSfx(game.shop.cfg.shop.sfx_success);
      } catch (e) {}
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

// Ежедневный бонус: забрать бесплатно / за рекламу / обратный отсчёт.
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

// Статистика меты.
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

// Лидеры: Yandex entries или локальный рекорд.
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
