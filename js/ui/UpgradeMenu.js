import { drawButton, hit } from './widgets.js';

// Окно levelup (GDD 6.8): 3 карточки, пауза мира.
export class UpgradeMenu {
  constructor() { this.R = { cards: [] }; }
  layout(W) {
    const cw = W - 60, ch = 84, x0 = 30;
    let y0 = 200;
    const cards = [];
    for (let i = 0; i < 3; i++) { cards.push({ x: x0, y: y0, w: cw, h: ch }); y0 += ch + 12; }
    this.R = { cards };
    return this.R;
  }
  draw(ctx, game, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(game._t('upgrade_title'), W / 2, 170);
    const { cards } = this.layout(W);
    ctx.textAlign = 'left';
    game.choices.forEach((c, i) => {
      const r = cards[i];
      if (!r) return;
      ctx.fillStyle = '#222';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ffd34d';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(c.title, r.x + 12, r.y + 24);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText((c.desc || '').slice(0, 48), r.x + 12, r.y + 44);
      ctx.fillStyle = '#8f8';
      ctx.fillText(c.info || '', r.x + 12, r.y + 64);
    });
  }
  click(game, x, y) {
    const { cards } = this.R;
    for (let i = 0; i < game.choices.length; i++) {
      if (cards[i] && hit(x, y, cards[i])) {
        game.applyUpgrade(i);
        return true;
      }
    }
    return false;
  }
}
