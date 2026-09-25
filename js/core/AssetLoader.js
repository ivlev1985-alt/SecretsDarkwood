// Загрузка ассетов ТОЛЬКО по путям из конфига (GDD п.3.3). Хардкода имён нет.
export class AssetLoader {
  constructor(base = './assets/') {
    this.base = base;
    this.images = new Map(); // path -> HTMLImageElement | HTMLCanvasElement (плейсхолдер)
    this.missing = new Set();
  }

  resolve(path) { return this.base + path; }

  // Нормализация коротких sfx имён: "shoot.mp3" -> "audio/sfx/shoot.mp3"
  static normalizeSfx(p) {
    if (!p) return p;
    if (p.includes('/')) return p;
    return 'audio/sfx/' + p;
  }

  // Собрать ВСЕ пути картинок/аудио из конфигов — единый источник для предзагрузки.
  static collectPaths(cfg) {
    const img = new Set(), audio = new Set();
    const g = cfg.game_config, b = cfg.balance_config, s = cfg.skills_config;
    const e = cfg.effects_config, ui = cfg.ui_config, items = cfg.items_config;
    if (g.hero.sprite) img.add(g.hero.sprite);
    if (g.hero.portrait) img.add(g.hero.portrait);
    if (g.audio.music_menu) audio.add(g.audio.music_menu);
    if (g.audio.music_battle) audio.add(g.audio.music_battle);
    if (g.ui) for (const k of ['main_menu_bg', 'buttons_sprite', 'panels_sprite', 'icons_sprite']) if (g.ui[k]) img.add(g.ui[k]);
    for (const m of (b.monsters || [])) if (m.sprite) img.add(m.sprite);
    for (const p of (b.environment_props || [])) if (p.sprite) img.add(p.sprite);
    for (const c of (((b.chests || {}).types) || [])) if (c.sprite) img.add(c.sprite);
    if (b.chests.open_effect) img.add(b.chests.open_effect);
    if (b.chests.sfx_open) audio.add(b.chests.sfx_open);
    for (const w of (s.weapons || [])) {
      if (w.projectile_sprite) img.add(w.projectile_sprite);
      if (w.area_sprite) img.add(w.area_sprite);
      if (w.sfx_shoot) audio.add(AssetLoader.normalizeSfx(w.sfx_shoot));
      if (w.sfx_hit) audio.add(AssetLoader.normalizeSfx(w.sfx_hit));
    }
    for (const p of (s.enemy_projectiles || [])) if (p.sprite) img.add(p.sprite);
    for (const fx of ((e && e.effects) || [])) if (fx.sprite) img.add(fx.sprite);
    // магазин предметов: иконок-файлов нет (буквы-заглушки), только звуки
    if (items && items.shop) {
      for (const k of ['sfx_purchase', 'sfx_fail', 'sfx_success']) {
        const v = items.shop[k];
        if (v) audio.add(AssetLoader.normalizeSfx(v));
      }
    }
    return { images: [...img], audio: [...audio] };
  }

  makePlaceholder(path, w = 64, h = 64) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#666'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#f0f'; x.strokeRect(1, 1, w - 2, h - 2);
    x.fillStyle = '#fff'; x.font = '9px monospace'; x.textAlign = 'center';
    const short = String(path).split('/').pop().slice(0, 12);
    x.fillText(short, w / 2, h / 2);
    return c;
  }

  loadImage(path) {
    if (this.images.has(path)) return Promise.resolve(this.images.get(path));
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => { this.images.set(path, im); resolve(im); };
      im.onerror = () => {
        const ph = this.makePlaceholder(path);
        this.images.set(path, ph);
        this.missing.add(path);
        resolve(ph);
      };
      im.src = this.resolve(path);
    });
  }

  async loadAllImages(paths, onProgress) {
    let done = 0;
    for (const p of paths) {
      await this.loadImage(p);
      done++;
      if (onProgress) onProgress(done, paths.length);
    }
    return { loaded: paths.length, missing: [...this.missing] };
  }

  get(path) { return this.images.get(path) || null; }
  missingList() { return [...this.missing]; }
}
