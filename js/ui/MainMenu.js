import { drawButton, hit } from './widgets.js';

// Главное меню (GDD п.5): логотип, Играть / Бонус / Магазин / Статистика, верх ⚙/🏆, низ версия/вход.
export class MainMenu {
  constructor() {
    this.R = {};
  }
  layout(W, H) {
    const bw = 280, bh = 52, bx = (W - bw) / 2;
    let y = 300;
    const R = {
      settings: { x: 12, y: 12, w: 120, h: 40 },
      leaders: { x: W - 132, y: 12, w: 120, h: 40 },
      play: { x: bx, y, w: bw, h: 60 },
      bonus: { x: bx, y: (y += 72), w: bw, h: bh },
      shop: { x: bx, y: (y += 64), w: bw, h: bh },
      stats: { x: bx, y: (y += 64), w: bw, h: bh },
      login: { x: W - 132, y: H - 52, w: 120, h: 40 }
    };
    this.R = R;
    return R;
  }
  draw(ctx, game, W, H) {
    const R = this.layout(W, H);
    const t = (k) => game._t(k);
    // фон: полупрозрачный оверлей поверх мира
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DARKWOOD', W / 2, 150);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(t('stat_best_time') + ': ' + (game.bestTime > 0 ? game.fmtTime(game.bestTime) : '--:--'), W / 2, 180);
    ctx.fillStyle = '#8f8';
    ctx.font = '13px monospace';
    ctx.fillText(t('daily_bonus_available') + ': +' + game.config.game_config.daily_bonus.reward_coins, W / 2, 205);
    drawButton(ctx, R.settings, '⚙ ' + t('settings'));
    drawButton(ctx, R.leaders, '🏆 ' + t('leaderboard'));
    drawButton(ctx, R.play, '▶ ' + t('play'), { primary: true, big: true });
    const bonusReady = game.dailyReady();
    drawButton(ctx, R.bonus, '🎁 ' + t('daily_bonus_title') + (bonusReady ? '!' : ''), { disabled: !bonusReady });
    drawButton(ctx, R.shop, '🛒 ' + t('shop'));
    drawButton(ctx, R.stats, '📊 ' + t('stats'));
    // низ: три строки без наложений — политики по центру выше, версия слева, вход справа
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(t('privacy_policy') + ' · ' + t('terms_of_use'), W / 2, H - 72);
    ctx.textAlign = 'left';
    ctx.fillText(game.config.game_config.meta.version + ' · ' + game.config.game_config.meta.studio, 12, H - 24);
    drawButton(ctx, R.login, t('login'));
  }
  click(game, x, y) {
    const R = this.R;
    const t = (k) => game._t(k);
    if (hit(x, y, R.play)) { game.startRun(); return true; }
    if (hit(x, y, R.bonus)) { game.uiBonus = true; return true; }
    if (hit(x, y, R.shop)) { game.shopMenu.open(game); game.uiShop = true; return true; }
    if (hit(x, y, R.stats)) { game.uiStats = true; return true; }
    if (hit(x, y, R.settings)) { game.uiSettings = 'menu'; return true; }
    if (hit(x, y, R.leaders)) { game.openLeaders(); return true; }
    if (hit(x, y, R.login)) { try { game.yandexLogin(); } catch (e) {} return true; }
    void t;
    return false;
  }
}
