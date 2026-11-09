// Шестиугольные иконки скиллов (атлас ui_config.icons_hex, pointy-top).
// Ключ иконки — часть после '#' из поля icon конфига ("ui/icons.png#fireball" -> "fireball").

export function iconKey(cfg) {
  const icon = (cfg && cfg.icon) || '';
  const i = icon.indexOf('#');
  return i >= 0 ? icon.slice(i + 1) : (cfg && cfg.id) || '';
}

// Точка-в-шестиугольнике (pointy-top): x,y — центр, size — высота.
export function hexPath(ctx, x, y, size) {
  const r = size / 2;
  const w = r * Math.sqrt(3);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w / 2, y - r / 2);
  ctx.lineTo(x + w / 2, y + r / 2);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w / 2, y + r / 2);
  ctx.lineTo(x - w / 2, y - r / 2);
  ctx.closePath();
}

// Иконка скилла: кадр из hex-атласа, обрезанный по шестиугольнику.
// Если атласа/ключа нет — шестиугольник-заглушка с кодом скилла (как раньше).
// Возвращает true, если удалось нарисовать арт.
export function drawSkillIcon(ctx, game, key, x, y, size, opts = {}) {
  const hexCfg = game.config.ui_config && game.config.ui_config.icons_hex;
  const anim = hexCfg && hexCfg.frames && hexCfg.frames.animations[key];
  const img = hexCfg ? game.assets.get(hexCfg.sprite) : null;
  const hasArt = img && img.tagName === 'IMG' && anim;
  if (hasArt) {
    const f = hexCfg.frames;
    // Поддержка col: если есть — используем, иначе row = col (для старых конфигов)
    const col = anim.col !== undefined ? anim.col : anim.row % f.columns;
    const row = anim.row;
    ctx.save();
    hexPath(ctx, x, y, size);
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, col * f.frame_width, row * f.frame_height, f.frame_width, f.frame_height,
      x - size / 2, y - size / 2, size, size);
    ctx.restore();
    ctx.strokeStyle = opts.borderColor || '#ffd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    return true;
  }
  // Заглушка: серый шестиугольник + код (magic_bolt -> MB)
  ctx.save();
  hexPath(ctx, x, y, size);
  ctx.fillStyle = '#888';
  ctx.fill();
  ctx.strokeStyle = opts.borderColor || '#555';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (opts.label !== false) {
    const code = String(key).split('_').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(9, Math.round(size * 0.3)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, x, y + size * 0.12);
  }
  ctx.restore();
  return false;
}

// Индикатор перезарядки поверх иконки: progress 0 (только что скастовано) .. 1 (готово).
// Иконка затемнена, светлый слой заполняет шестиугольник снизу вверх.
export function drawCooldown(ctx, x, y, size, progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return;
  const r = size / 2;
  ctx.save();
  hexPath(ctx, x, y, size);
  ctx.clip();
  // Тёмная маска поверх всей иконки
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - r, y - r, r * 2, size);
  // Светлое заполнение снизу вверх на высоту p
  const h = size * p;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x - r, y + r - h, r * 2, h);
  ctx.restore();
}

// Раскладка «олимпийские кольца»: 2 ряда со смещением нижнего на полшага вправо.
// Распределение по рядам:
//   1 → [1,0]  2 → [1,1]  3 → [1,2]  4 → [2,2]  5 → [2,3]  6 → [3,3]  7 → [3,4]
// cx — центр зоны по X, bottomY — нижняя граница нижнего ряда.
// Возвращает [{ x, y }] в порядке: сначала верхний ряд, затем нижний.
export function hexRingLayout(count, size, cx, bottomY, gap = 4) {
  const r = size / 2;
  const stepX = r * Math.sqrt(3) + gap; // горизонтальный шаг (pointy-top)
  const stepY = r * 1.5 + gap * 0.5;   // вертикальный шаг со сцепкой
  const pos = [];

  // Распределение: [верхний, нижний]
  const dist = { 1: [1, 0], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [3, 4] };
  const [topN, botN] = dist[count] || [Math.ceil(count / 2), Math.floor(count / 2)];

  if (botN === 0) {
    // Один ряд — по центру
    const y = bottomY - r;
    for (let i = 0; i < topN; i++) {
      pos.push({ x: cx + (i - (topN - 1) / 2) * stepX, y });
    }
    return pos;
  }

  const yBot = bottomY - r;
  const yTop = yBot - stepY;

  // Верхний ряд — центрирован
  for (let i = 0; i < topN; i++) {
    pos.push({ x: cx + (i - (topN - 1) / 2) * stepX, y: yTop });
  }

  // Нижний ряд:
  //  - если иконок столько же, сколько сверху (2/4/6) — сдвиг на полшага вправо;
  //  - если на одну больше (3/5/7) — центрирован: иконки встают в пазы верхнего ряда (влево/вправо).
  const shift = botN === topN ? stepX / 2 : 0;
  for (let i = 0; i < botN; i++) {
    pos.push({ x: cx + (i - (botN - 1) / 2) * stepX + shift, y: yBot });
  }

  return pos;
}
