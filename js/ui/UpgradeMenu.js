import { drawButton, hit } from './widgets.js';
import { drawSkillIcon, iconKey } from './hexIcons.js';

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
    const titleKey = game.choiceMode === 'spell' ? 'spell_reward_title' : 'upgrade_title';
    ctx.fillText(game._t(titleKey), W / 2, 170);
    const { cards } = this.layout(W);
    ctx.textAlign = 'left';
    game.choices.forEach((c, i) => {
      const r = cards[i];
      if (!r) return;
      ctx.fillStyle = '#222';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ffd34d';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // Иконка слева
      const key = iconKey(c);
      const iconSize = 48;
      const iconCx = r.x + 34;
      drawSkillIcon(ctx, game, key, iconCx, r.y + r.h / 2, iconSize, {
        borderColor: '#ffd34d',
        label: false
      });
      // Текст справа от иконки: отступ справа от иконки равен отступу
      // слева от иконки до края карточки (симметрия).
      const pad = iconCx - iconSize / 2 - r.x; // 10px
      const textX = iconCx + iconSize / 2 + pad;
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(c.title, textX, r.y + 28);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      // Не даём описанию вылезти за правый край карточки после сдвига.
      const maxW = r.x + r.w - 8 - textX;
      let desc = c.desc || '';
      if (ctx.measureText(desc).width > maxW) {
        while (desc.length > 1 && ctx.measureText(desc + '…').width > maxW) desc = desc.slice(0, -1);
        desc += '…';
      }
      ctx.fillText(desc, textX, r.y + 48);
      ctx.fillStyle = '#8f8';
      ctx.fillText(c.info || '', textX, r.y + 68);
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
