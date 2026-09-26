import { drawButton, drawPanel, hit } from './widgets.js';

// Особый питомец из сундука: слева текущий (иконка + характеристики),
// справа выпавший, внизу Закрыть / Поменять. Мир на паузе.
export class PetSwapPopup {
  constructor() { this.R = {}; }
  drawCard(ctx, game, t, item, x, y, w, h, label) {
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
    // иконка-заглушка на rarity-подложке
    const s = 56, ix = x + (w - s) / 2, iy = y + 30;
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
    if (item) {
      ctx.fillStyle = rar ? rar.color : '#fff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(game.itemName(item).slice(0, 16), x + w / 2, iy + s + 22);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      const r = (item.stats || []).find((st) => st.id === 'radius');
      ctx.fillText((t('stat_radius') + ': ' + (r ? r.value : '?')).slice(0, 24), x + w / 2, iy + s + 42);
      ctx.fillStyle = item.fetch_potions ? '#8f8' : '#666';
      ctx.fillText(t('pet_fetches_potions'), x + w / 2, iy + s + 60);
    } else {
      ctx.fillStyle = '#555';
      ctx.font = '13px monospace';
      ctx.fillText(t('inventory_empty'), x + w / 2, iy + s + 30);
    }
    ctx.textAlign = 'center';
  }
  draw(ctx, game, W, H) {
    void H;
    const t = (k, p) => game._t(k, p);
    const d = game.uiPetSwap;
    if (!d) return;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, { x: 30, y: 150, w: W - 60, h: 360 }, t('pet_swap_title'));
    this.drawCard(ctx, game, t, d.old, 50, 215, 178, 190, t('pet_swap_current'));
    this.drawCard(ctx, game, t, d.new, 232, 215, 178, 190, t('pet_swap_new'));
    drawButton(ctx, { x: 50, y: 450, w: 178, h: 44 }, t('close'));
    drawButton(ctx, { x: 232, y: 450, w: 178, h: 44 }, t('pet_swap_swap'), { primary: true });
    this._close = { x: 50, y: 450, w: 178, h: 44 };
    this._swap = { x: 232, y: 450, w: 178, h: 44 };
  }
  click(game, x, y) {
    void game;
    if (this._close && hit(x, y, this._close)) return 'close';
    if (this._swap && hit(x, y, this._swap)) return 'swap';
    return false;
  }
}
