import { drawButton, drawPanel, drawSlider, hit, sliderSet } from './widgets.js';

// Пауза (GDD 6.8): Продолжить / Заново / В меню + громкости.
export class PauseMenu {
  constructor() {
    this.R = {};
    this.drag = null;
  }
  layout(W) {
    const bw = 240, bx = (W - bw) / 2;
    this.R = {
      panel: { x: (W - 340) / 2, y: 200, w: 340, h: 360 },
      music: { x: bx, y: 300, w: bw, h: 20 },
      sfx: { x: bx, y: 360, w: bw, h: 20 },
      resume: { x: bx, y: 410, w: bw, h: 44 },
      restart: { x: bx, y: 460, w: bw, h: 44 },
      menu: { x: bx, y: 510, w: bw, h: 40 }
    };
    return this.R;
  }
  draw(ctx, game, W, H) {
    void H;
    const R = this.layout(W);
    const t = (k) => game._t(k);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, R.panel, t('pause'));
    drawSlider(ctx, R.music, t('settings_music'), game.settings.music);
    drawSlider(ctx, R.sfx, t('settings_sfx'), game.settings.sfx);
    drawButton(ctx, R.resume, '▶ ' + t('resume'), { primary: true });
    drawButton(ctx, R.restart, '🔄 ' + t('restart'));
    drawButton(ctx, R.menu, '🏠 ' + t('to_menu'));
  }
  down(game, x, y) {
    const R = this.R;
    if (hit(x, y, { x: R.music.x - 10, y: R.music.y - 10, w: R.music.w + 20, h: 32 })) { this.drag = 'music'; game.setMusic(game.settings.music = sliderSet(R.music, x)); return true; }
    if (hit(x, y, { x: R.sfx.x - 10, y: R.sfx.y - 10, w: R.sfx.w + 20, h: 32 })) { this.drag = 'sfx'; game.setSfx(game.settings.sfx = sliderSet(R.sfx, x)); return true; }
    return false;
  }
  move(game, x) {
    if (this.drag === 'music') game.setMusic(game.settings.music = sliderSet(this.R.music, x));
    if (this.drag === 'sfx') game.setSfx(game.settings.sfx = sliderSet(this.R.sfx, x));
  }
  up(game) { this.drag = null; game.saveSettings(); void game; }
  click(game, x, y) {
    const R = this.R;
    if (hit(x, y, R.resume)) { game.resumeGame(); return true; }
    if (hit(x, y, R.restart)) { game.startRun(); return true; }
    if (hit(x, y, R.menu)) { game.toMenu(); return true; }
    return false;
  }
}
