// Сейвы (GDD п.9): Yandex player.setData + localStorage-fallback для гостей.
// Автосейв по интервалу + после важных событий.
export class SaveSystem {
  constructor(saveKey) {
    this.key = saveKey || 'secrets_darkwood_save_v1';
    this.data = SaveSystem.defaultData();
    this.remote = null;
    this.ready = false;
  }

  static defaultData() {
    return {
      coins: 0,
      shop: {}, // itemId -> level
      stats: { totalTime: 0, totalKills: 0, bestTime: 0, totalRuns: 0, fav: {} },
      dailyLast: 0
    };
  }

  async load() {
    try {
      if (window.ysdk?.getPlayer) {
        const p = await window.ysdk.getPlayer();
        this.remote = p;
        const d = await p.getData();
        if (d && d[this.key]) this.data = Object.assign(SaveSystem.defaultData(), d[this.key]);
        else {
          // гость без записи: подхватить локальное
          const local = this._loadLocal();
          if (local) this.data = local;
        }
      } else {
        const local = this._loadLocal();
        if (local) this.data = local;
      }
    } catch (e) {
      const local = this._loadLocal();
      if (local) this.data = local;
    }
    // страховка формы
    this.data.stats = Object.assign({ totalTime: 0, totalKills: 0, bestTime: 0, totalRuns: 0, fav: {} }, this.data.stats);
    this.ready = true;
    return this.data;
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
    if (this.remote) {
      try { await this.remote.setData({ [this.key]: this.data }, true); } catch (e) {}
    }
  }

  reset() {
    this.data = SaveSystem.defaultData();
    return this.save();
  }

  // --- монеты меты ---
  addCoins(n) { this.data.coins = Math.max(0, this.data.coins + n); }
  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    return true;
  }

  // --- магазин ---
  shopLevel(id) { return this.data.shop[id] || 0; }

  // --- статистика забега ---
  // fav: { id, kills } любимое оружие забега. Возвращает { record }.
  recordRun({ time, kills, fav }) {
    const st = this.data.stats;
    st.totalRuns++;
    st.totalTime += Math.floor(time);
    st.totalKills += kills;
    const record = time > (st.bestTime || 0);
    if (record) st.bestTime = Math.floor(time);
    if (fav && fav.id) st.fav[fav.id] = (st.fav[fav.id] || 0) + fav.kills;
    return { record };
  }

  favoriteWeapon() {
    let best = null, n = 0;
    for (const [id, k] of Object.entries(this.data.stats.fav || {})) {
      if (k > n) { n = k; best = id; }
    }
    return best ? { id: best, kills: n } : null;
  }
}
