// Этап 1+: загрузка PNG/MP3 только по путям из конфига. Этап 0: заглушка.
export class AssetLoader {
  constructor() { this.images = new Map(); this.audio = new Map(); }
  resolve(path) { return './assets/' + path; }
  async loadImage(path) {
    if (this.images.has(path)) return this.images.get(path);
    // Этап 0: ассетов может не быть — возвращаем null (серая заглушка в Game.js)
    return null;
  }
}
