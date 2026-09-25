import { drawButton, drawPanel, hit } from './widgets.js';

// GameOver (GDD 6.8): статистика + revive за рекламу (stub до Этапа 7) / снова / меню.
export class GameOverScreen {
  constructor() { this.R = {}; }
  layout(W) {
    const bw = 260, bx = (W - bw) / 2;
    this.R = {
      panel: { x: (W - 360) / 2, y: 170, w: 360, h: 420 },
      revive: { x: bx, y: 400, w: bw, h: 48 },
      again: { x: bx, y: 456, w: bw, h: 44 },
      menu: { x: bx, y: 508, w: bw, h: 40 }
    };
    return this.R;
  }
  draw(ctx, game, W, H) {
    void H;
    const R = this.layout(W);
    const t = (k) => game._t(k);
    const s = game.runStats;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, R.panel, t('game_over'));
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⏱ ' + game.fmtTime(s.time) + '   Lv.' + s.level, W / 2, 250);
    ctx.fillText('💀 ' + s.kills + '   🪙 ' + s.coins, W / 2, 276);
    if (s.record) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(t('new_record'), W / 2, 306);
    }
    // смерть героя
    if (game.player && game.player.anim) {
      try { game.player.anim.setAnimation('death'); } catch (e) {}
    }
    const canRevive = !game.reviveUsed && (game.config.game_config.monetization.rewarded_revive_enabled !== false);
    drawButton(ctx, R.revive, '📺 ' + t('revive_for_ad'), { primary: true, disabled: !canRevive });
    drawButton(ctx, R.again, '🔄 ' + t('play_again'));
    drawButton(ctx, R.menu, '🏠 ' + t('to_menu'));
  }
  click(game, x, y) {
    const R = this.R;
    if (hit(x, y, R.revive)) { game.revive(); return true; }
    if (hit(x, y, R.again)) { game.startRun(); return true; }
    if (hit(x, y, R.menu)) { game.toMenu(); return true; }
    return false;
  }
}
