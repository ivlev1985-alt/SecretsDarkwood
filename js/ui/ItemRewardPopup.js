import { drawButton, drawPanel, hit } from './widgets.js';
import { ShopSystem } from '../systems/ShopSystem.js';

// Предмет из сундука: слева текущий в слоте, справа найденный.
// «Надеть» заменяет предмет (старый продаётся за 50%), «Продать» — продаёт новый.
// Мир на паузе до выбора игрока.
export class ItemRewardPopup {
  constructor() { this.R = {}; }

  _drawCard(ctx, game, t, item, x, y, w, h, label) {
    const rar = item ? game.shop.rarityOf(item) : null;
    ctx.fillStyle = '#1c1c34';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rar ? rar.color : '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(label, x + w / 2, y + 20);

    const s = 56, ix = x + (w - s) / 2, iy = y + 32;
    ctx.fillStyle = item ? '#2e2e28' : '#111';
    ctx.fillRect(ix, iy, s, s);
    if (item && rar) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = rar.color;
      ctx.fillRect(ix, iy, s, s);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = rar ? rar.color : '#555';
    ctx.strokeRect(ix, iy, s, s);
    const slot = item ? game.shop.slotById.get(item.slot) : null;
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(slot ? slot.icon_letter : '?', ix + s / 2, iy + s / 2 + 6);

    if (!item) {
      ctx.fillStyle = '#555';
      ctx.font = '13px monospace';
      ctx.fillText(t('inventory_empty'), x + w / 2, iy + s + 30);
      return;
    }

    ctx.fillStyle = rar ? rar.color : '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(game.itemName(item).slice(0, 16), x + w / 2, iy + s + 22);

    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText(slot ? t(slot.name_key).slice(0, 20) : '', x + w / 2, iy + s + 38);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    let yy = iy + s + 58;
    const lines = item.slot === 'staff'
      ? [
        (game.weaponName(item.spell) + ' · Lv.' + (item.spell_level || 1)).slice(0, 24)
      ]
      : (item.stats || []).map((st) => ShopSystem.statText(st, t).slice(0, 24));
    for (const ln of lines) {
      if (yy > y + h - 12) break;
      ctx.fillText(ln, x + 12, yy);
      yy += 16;
    }
    ctx.textAlign = 'center';
  }

  draw(ctx, game, W, H) {
    void H;
    const t = (k, p) => game._t(k, p);
    const d = game.uiItemReward;
    if (!d) return;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 30, y: 140, w: W - 60, h: 500 }, t('item_found_title'));

    this._drawCard(ctx, game, t, d.old, 50, 205, 178, 310, t('item_found_current'));
    this._drawCard(ctx, game, t, d.new, 232, 205, 178, 310, t('item_found_new'));

    const sellNew = game.shop.sellPrice(d.new);
    const oldPrice = d.old ? game.shop.sellPrice(d.old) : 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    let noteY = 528;
    if (d.old && oldPrice > 0) {
      const oldText = t('shop_price_format', { price: oldPrice });
      ctx.fillText(t('item_equip_replace', { price: oldText }), W / 2, noteY);
      noteY += 16;
    }
    ctx.fillText(t('inv_sell') + ': ' + t('shop_price_format', { price: sellNew }), W / 2, noteY);

    drawButton(ctx, { x: 50, y: 566, w: 178, h: 46 }, t('item_equip'), { primary: true });
    drawButton(ctx, { x: 232, y: 566, w: 178, h: 46 }, t('inv_sell'));
    this._equip = { x: 50, y: 566, w: 178, h: 46 };
    this._sell = { x: 232, y: 566, w: 178, h: 46 };
  }

  click(game, x, y) {
    void game;
    if (this._equip && hit(x, y, this._equip)) return 'equip';
    if (this._sell && hit(x, y, this._sell)) return 'sell';
    return false;
  }
}
