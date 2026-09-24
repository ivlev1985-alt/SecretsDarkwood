export class AudioManager {
  constructor() { this.musicVolume = 0.5; this.sfxVolume = 0.8; }
  applyVolumes(m, s) { this.musicVolume = m; this.sfxVolume = s; }
  playSfx() {}
  playMusic() {}
}
