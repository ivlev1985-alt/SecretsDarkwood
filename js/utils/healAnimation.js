// Чистые функции анимации заполнения шкалы здоровья (без DOM — тестируются в node).
// Профиль: сначала медленно 15% объёма, затем быстро 70%, затем снова медленно 15%.
// Длительность всего заполнения — 5–6 секунд в зависимости от количества HP (конфиг).

function phaseCfg(cfg = {}) {
  const amounts = Array.isArray(cfg.fill_phase_amounts) && cfg.fill_phase_amounts.length
    ? cfg.fill_phase_amounts : [0.15, 0.7, 0.15];
  const times = Array.isArray(cfg.fill_phase_times) && cfg.fill_phase_times.length
    ? cfg.fill_phase_times : [0.3, 0.4, 0.3];
  return { amounts, times };
}

// Сколько секунд длится заполнение добавленного объёма amount при maxHp.
// Чем больше добавлено (доля от максимума), тем ближе к fill_ms_max.
export function healFillDuration(amount, maxHp, cfg = {}) {
  const mn = cfg.fill_ms_min ?? 5000;
  const mx = Math.max(mn, cfg.fill_ms_max ?? 6000);
  const frac = Math.max(0, Math.min(1, amount / Math.max(1, maxHp)));
  return Math.max(0.001, (mn + (mx - mn) * frac) / 1000);
}

// Доля заполнения 0..1 по доле времени 0..1.
// Внутри фаз — линейно (скорости 0.5 / 1.75 / 0.5 от средней), без остановок на стыках.
export function healEase(k, cfg = {}) {
  const { amounts, times } = phaseCfg(cfg);
  const t = Math.max(0, Math.min(1, k));
  let accA = 0, accT = 0;
  const n = Math.min(amounts.length, times.length);
  for (let i = 0; i < n; i++) {
    const dt = times[i] || 0;
    if (dt <= 0) { accA += amounts[i] || 0; continue; }
    const endT = accT + dt;
    if (t <= endT || i === n - 1) {
      const local = Math.max(0, Math.min(1, (t - accT) / dt));
      const v = accA + (amounts[i] || 0) * local;
      return Math.max(0, Math.min(1, v));
    }
    accA += amounts[i] || 0;
    accT = endT;
  }
  return 1;
}
