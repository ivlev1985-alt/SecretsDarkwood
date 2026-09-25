import { drawButton, drawPanel, drawSlider, hit, sliderSet } from './widgets.js';

// Настройки (GDD 5.2/5.8): музыка, звуки, язык, джойстик, сброс прогресса.
export class SettingsMenu {
  constructor() { this.R = {}; this.drag = null; this.confirmReset = false; }
  layout(W) {
    const bw = 260, bx = (W - bw) / 2;
    this.R = {
      panel: { x: (W - 360) / 2, y: 150, w: 360, h: 470 },
      music: { x: bx, y: 240, w: bw, h: 20 },
      sfx: { x: bx, y: 300, w: bw, h: 20 },
      lang: { x: bx, y: 350, w: bw, h: 40 },
      joy: { x: bx, y: 400, w: bw, h: 40 },
      reset: { x: bx, y: 450, w: bw, h: 40 },
      back: { x: bx, y: 560, w: bw, h: 44 }
    };
    return this.R;
  }
  draw(ctx, game, W, H) {
    void H;
    const R = this.layout(W);
    const t = (k) => game._t(k);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawPanel(ctx, R.panel, t('settings'));
    drawSlider(ctx, R.music, t('settings_music'), game.settings.music);
    drawSlider(ctx, R.sfx, t('settings_sfx'), game.settings.sfx);
    drawButton(ctx, R.lang, t('settings_lang') + ': ' + game.settings.lang.toUpperCase());
    const joyLabel = game.settings.joystick === 'left' ? t('settings_joystick_left') : t('settings_joystick_right');
    drawButton(ctx, R.joy, t('settings_joystick') + ': ' + joyLabel);
    drawButton(ctx, R.reset, this.confirmReset ? t('settings_reset_confirm') : '🗑 ' + t('settings_reset'));
    drawButton(ctx, R.back, t('back'), { primary: true });
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
    if (hit(x, y, R.lang)) { game.cycleLang(); return true; }
    if (hit(x, y, R.joy)) { game.toggleJoystick(); return true; }
    if (hit(x, y, R.reset)) {
      if (!this.confirmReset) this.confirmReset = true;
      else { this.confirmReset = false; game.resetProgress(); }
      return true;
    }
    if (hit(x, y, R.back)) { this.confirmReset = false; game.closeSettings(); return true; }
    return false;
  }
}
