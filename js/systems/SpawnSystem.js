import { Enemy } from '../entities/Enemy.js';

// Спавн волн (balance.waves): задержка, затухание интервала, веса, оффскрин.
// Скейлинг: +2% HP/урона за каждые wave_step_sec выживания И +10% всем за каждого
// появившегося босса (каждый следующий босс тоже на 10% сильнее предыдущего).
export class SpawnSystem {
  constructor(wavesCfg, monsters) {
    this.cfg = wavesCfg;
    // боссы (weight 0 / is_boss) — только по таймеру босса
    this.table = monsters.filter((m) => (m.spawn_weight || 0) > 0 && !m.is_boss);
    this.bosses = monsters.filter((m) => m.is_boss);
    this.totalWeight = this.table.reduce((s, m) => s + m.spawn_weight, 0);
    this.time = 0;
    this.timer = 0;
    this.bossTimer = 0;
    this.started = false;
    this.count = 0;
    this.bossesSpawned = 0;
    this.TIME_GROWTH_PER_STEP = 0.02; // +2% за шаг
    this.BOSS_GROWTH = 0.10; // +10% за босса
  }

  // Множитель от времени: 1 + 0.02 * шагов
  get timeScale() {
    const steps = Math.floor(this.time / (this.cfg.wave_step_sec || 30));
    return 1 + this.TIME_GROWTH_PER_STEP * steps;
  }

  // Множитель от боссов: 1.1^N
  get bossScale() {
    return Math.pow(1 + this.BOSS_GROWTH, this.bossesSpawned);
  }

  // Итоговая сила вновь спавнящихся (монстры и боссы)
  get powerScale() {
    return this.timeScale * this.bossScale;
  }

  applyScale(enemy, scale) {
    enemy.maxHp = Math.round(enemy.maxHp * scale);
    enemy.hp = enemy.maxHp;
    enemy.damage = Math.round(enemy.damage * scale * 10) / 10;
    enemy.powerScale = scale;
    return enemy;
  }

  get intervalSec() {
    const steps = Math.floor(this.time / (this.cfg.wave_step_sec || 30));
    const v = (this.cfg.spawn_interval_start_ms / 1000) * Math.pow(this.cfg.spawn_interval_multiplier || 0.92, steps);
    return Math.max(v, (this.cfg.spawn_interval_min_ms || 300) / 1000);
  }

  get perWave() {
    const t = this.time / (this.cfg.wave_step_sec || 30);
    return Math.max(1, Math.floor((this.cfg.enemies_per_wave_start || 1) + (this.cfg.enemies_per_wave_increment || 0.5) * t));
  }

  pickType(rand = Math.random) {
    let r = rand() * this.totalWeight;
    for (const m of this.table) {
      r -= m.spawn_weight;
      if (r <= 0) return m;
    }
    return this.table[this.table.length - 1];
  }

  // Точка за экраном: кольцо spawn_radius вокруг игрока
  spawnPoint(px, py, viewW, viewH, rand = Math.random) {
    const R = this.cfg.spawn_radius || 800;
    const a = rand() * Math.PI * 2;
    // чуть дальше диагонали экрана чтобы точно оффскрин
    const minR = Math.max(R, Math.hypot(viewW, viewH) / 2 + 60);
    return { x: px + Math.cos(a) * minR, y: py + Math.sin(a) * minR };
  }

  update(dt, ctx, rand = Math.random) {
    // ctx: { player, enemies, viewW, viewH, maxAlive, onSpawn }
    this.time += dt;
    if (this.time < (this.cfg.first_spawn_delay_sec || 15)) return [];
    this.started = true;
    const out = [];
    this.timer -= dt;
    this.bossTimer += dt;

    const alive = ctx.enemies.filter((e) => e.alive).length;
    if (this.timer <= 0 && alive < (this.cfg.max_enemies_on_screen || 200)) {
      this.timer = this.intervalSec;
      const n = Math.min(this.perWave, (this.cfg.max_enemies_on_screen || 200) - alive);
      for (let i = 0; i < n; i++) {
        const type = this.pickType(rand);
        const p = this.spawnPoint(ctx.player.x, ctx.player.y, ctx.viewW, ctx.viewH, rand);
        const e = this.applyScale(new Enemy(type, p.x, p.y), this.powerScale);
        out.push(e); this.count++;
      }
    }
    // босс по интервалу: сам на 10% сильнее предыдущего + все живые монстры +10%
    const bossEvery = this.cfg.boss_wave_interval_sec || 120;
    if (this.bosses.length && this.bossTimer >= bossEvery) {
      this.bossTimer = 0;
      this.bossesSpawned++;
      for (const e of ctx.enemies) {
        if (!e.alive || e.deathT > 0) continue;
        e.maxHp = Math.round(e.maxHp * (1 + this.BOSS_GROWTH));
        e.hp = Math.min(e.maxHp, Math.round(e.hp * (1 + this.BOSS_GROWTH)));
        e.damage = Math.round(e.damage * (1 + this.BOSS_GROWTH) * 10) / 10;
      }
      const type = this.bosses[(this.bossesSpawned - 1) % this.bosses.length];
      const p = this.spawnPoint(ctx.player.x, ctx.player.y, ctx.viewW, ctx.viewH, rand);
      // босс №k: сила 1.1^(k-1) от времени — каждый следующий на 10% сильнее
      const bossScale = this.timeScale * Math.pow(1 + this.BOSS_GROWTH, this.bossesSpawned - 1);
      out.push(this.applyScale(new Enemy(type, p.x, p.y), bossScale));
      this.count++;
    }
    return out;
  }
}
