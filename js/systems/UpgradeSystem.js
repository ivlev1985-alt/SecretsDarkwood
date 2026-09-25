import { ConfigLoader } from '../core/ConfigLoader.js';

// Выбор 1 из N при levelup: апгрейды оружия, новое оружие, пассивки, апгрейды питомца.
export class UpgradeSystem {
  constructor(skillsCfg, locCfg, lang = 'ru', petDefs = null) {
    this.weaponsCfg = skillsCfg.weapons || [];
    this.passivesCfg = skillsCfg.passive_skills || [];
    this.petDefs = petDefs || [];
    this.loc = locCfg;
    this.lang = lang;
  }

  t(key) { return ConfigLoader.t(this.loc, this.lang, key); }

  setLang(l) { this.lang = l; }

  // Пул кандидатов: { kind, id, levelFrom, levelTo }
  // Новое оружие предлагается и из закрытых (discovery в забеге):
  // магазинный unlock даёт его сразу на старте, levelup — находит в бою.
  // petCtx: { hasPet, levels } — апгрейды питомца только при наличии питомца.
  candidates(skills, player, petCtx) {
    const out = [];
    for (const [id, st] of skills.weapons) {
      const owned = (st.level || 0) > 0 && st.active !== false;
      if (owned && st.cfg.upgradeable !== false && st.level < (st.cfg.max_level || 5)) {
        out.push({ kind: 'weapon', id, levelFrom: st.level, levelTo: st.level + 1 });
      } else if (!owned) {
        out.push({ kind: 'newWeapon', id, levelFrom: 0, levelTo: 1 });
      }
    }
    const pl = player.passiveLevels || {};
    for (const p of this.passivesCfg) {
      const cur = pl[p.id] || 0;
      if (cur < (p.max_level || 5)) out.push({ kind: 'passive', id: p.id, levelFrom: cur, levelTo: cur + 1 });
    }
    if (petCtx && petCtx.hasPet) {
      const lv = petCtx.levels || {};
      for (const d of this.petDefs) {
        const cur = lv[d.id] || 0;
        if (cur < (d.max_level || 5)) out.push({ kind: 'pet', id: d.id, levelFrom: cur, levelTo: cur + 1 });
      }
    }
    return out;
  }

  buildChoices(skills, player, n = 3, rand = Math.random, petCtx) {
    const pool = this.candidates(skills, player, petCtx);
    // перемешать
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n).map((c) => this.describe(c, skills));
  }

  describe(c, skills) {
    if (c.kind === 'pet') {
      const d = this.petDefs.find((x) => x.id === c.id);
      return {
        ...c,
        title: this.t(d.name_key),
        desc: this.t(d.desc_key),
        info: 'Lv. ' + c.levelFrom + ' → Lv. ' + c.levelTo
      };
    }
    if (c.kind === 'passive') {
      const p = this.passivesCfg.find((x) => x.id === c.id);
      return {
        ...c,
        title: this.t(p.name_key),
        desc: this.t(p.desc_key),
        info: 'Lv. ' + c.levelFrom + ' → Lv. ' + c.levelTo
      };
    }
    const st = skills.weapons.get(c.id);
    const w = st ? st.cfg : this.weaponsCfg.find((x) => x.id === c.id);
    return {
      ...c,
      title: this.t(w.name_key),
      desc: this.t(w.desc_key),
      info: c.kind === 'newWeapon' ? 'NEW' : ('Lv. ' + c.levelFrom + ' → Lv. ' + c.levelTo)
    };
  }

  apply(choice, skills, player) {
    if (choice.kind === 'passive') {
      player.applyPassive(choice.id, this.passivesCfg);
      return true;
    }
    if (choice.kind === 'newWeapon') {
      const st = skills.weapons.get(choice.id);
      if (st) { st.level = 1; st.active = true; st.cd = 0; return true; }
      return false;
    }
    // weapon upgrade
    const st = skills.weapons.get(choice.id);
    if (st && st.level < (st.cfg.max_level || 5)) { st.level++; st.cd = Math.min(st.cd, 0.2); return true; }
    return false;
  }
}
