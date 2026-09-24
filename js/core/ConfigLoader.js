export class ConfigLoader {
  constructor(basePath = './config/') { this.basePath = basePath; }
  // Поддержка legacy JSON с // и /* */ комментариями (старые файлы в корне),
  // новые файлы в config/ — чистый JSON.
  stripComments(text) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  }
  async loadOne(name) {
    const res = await fetch(this.basePath + name + '.json');
    if (!res.ok) throw new Error('Не найден конфиг ' + name);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) {
      try { return JSON.parse(this.stripComments(text)); }
      catch (e2) { throw new Error('Битый JSON ' + name + ': ' + e2.message); }
    }
  }
  async loadAll(names) {
    const out = {};
    for (const n of names) out[n] = await this.loadOne(n);
    return out;
  }
}
