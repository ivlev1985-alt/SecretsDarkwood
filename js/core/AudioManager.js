// Звук: музыка меню/боя + sfx по путям из конфига. Без ассетов — тихий no-op.
export class AudioManager {
  constructor() {
    this.musicVolume = 0.5;
    this.sfxVolume = 0.8;
    this.pauseOnBlur = true;
    this.muted = false;
    this.musicEl = null;
    this.currentMusic = null;
    this.sfxEls = new Map();

    window.addEventListener('blur', () => {
      if (this.pauseOnBlur) this.setMuted(true);
    });
    window.addEventListener('focus', () => {
      if (this.pauseOnBlur) this.setMuted(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (this.pauseOnBlur) this.setMuted(document.hidden);
    });
  }

  applyVolumes(music, sfx, pauseOnBlur = true) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.pauseOnBlur = pauseOnBlur;
    this._apply();
  }
  setMusicVolume(v) { this.musicVolume = v; this._apply(); }
  setSfxVolume(v) { this.sfxVolume = v; this._apply(); }

  setMuted(m) {
    this.muted = m;
    this._apply();
  }

  _apply() {
    if (this.musicEl) {
      this.musicEl.volume = this.muted ? 0 : this.musicVolume;
      if (this.muted) { try { this.musicEl.pause(); } catch (e) {} }
      else if (this.currentMusic) { try { this.musicEl.play().catch(() => {}); } catch (e) {} }
    }
  }

  playMusic(path) {
    if (!path) return;
    if (this.currentMusic === path && this.musicEl) return;
    try {
      if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
      const el = new Audio('./assets/' + path);
      el.loop = true;
      el.volume = this.muted ? 0 : this.musicVolume;
      el.play().catch(() => {});
      this.musicEl = el;
      this.currentMusic = path;
    } catch (e) { /* нет ассета — молча */ }
  }

  stopMusic() {
    try { if (this.musicEl) this.musicEl.pause(); } catch (e) {}
    this.musicEl = null; this.currentMusic = null;
  }

  playSfx(path) {
    if (!path) return;
    const full = path.includes('/') ? './assets/' + path : './assets/audio/sfx/' + path;
    try {
      const el = new Audio(full);
      el.volume = this.muted ? 0 : this.sfxVolume;
      el.play().catch(() => {});
    } catch (e) { /* нет ассета — молча */ }
  }
}
