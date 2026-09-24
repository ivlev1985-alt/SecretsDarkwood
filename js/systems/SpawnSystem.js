import { Enemy } from '../entities/Enemy.js';

// Спавн волн (balance.waves): задержка, затухание интервала, веса, оффскрин.
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
        const e = new Enemy(type, p.x, p.y);
        out.push(e); this.count++;
      }
    }
    // босс по интервалу
    const bossEvery = this.cfg.boss_wave_interval_sec || 120;
    if (this.bosses.length && this.bossTimer >= bossEvery) {
      this.bossTimer = 0;
      const type = this.bosses[0];
      const p = this.spawnPoint(ctx.player.x, ctx.player.y, ctx.viewW, ctx.viewH, rand);
      out.push(new Enemy(type, p.x, p.y));
      this.count++;
    }
    return out;
  }
}
