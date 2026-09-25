import { drawButton, drawPanel, hit } from './widgets.js';

// Заглушки Этапа 5: магазин, бонус, статистика, лидеры. Открываются из меню, закрываются.
function stub(text) {
  return class {
    draw(ctx, game, W, H) {
      void H;
      drawPanel(ctx, { x: 60, y: 250, w: W - 120, h: 220 }, text);
      ctx.fillStyle = '#888';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Этап 5', W / 2, 330);
      drawButton(ctx, { x: W / 2 - 90, y: 380, w: 180, h: 44 }, game._t('close'), { primary: true });
      this._close = { x: W / 2 - 90, y: 380, w: 180, h: 44 };
    }
    click(game, x, y) {
      if (this._close && hit(x, y, this._close)) return 'close';
      return false;
    }
  };
}

export const ShopMenu = stub('🛒 SHOP');
export const DailyBonusPopup = stub('🎁 BONUS');
export const StatsPopup = stub('📊 STATS');
export const LeadersPopup = stub('🏆 LEADERS');
