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

// Раскладка «олимпийские кольца»: 2 ряда со смещением нижнего на полшага.
// <=3 иконок — один ряд; иначе верхний ряд floor(n/2) ("чуть выше"), нижний — остальные.
// cx — центр зоны по X, bottomY — нижняя граница нижнего ряда.
// Возвращает [{ x, y }] в порядке: сначала верхний ряд, затем нижний.
export function hexRingLayout(count, size, cx, bottomY, gap = 4) {
  const r = size / 2;
  const stepX = r * Math.sqrt(3) + gap; // горизонтальный шаг (pointy-top)
  const stepY = r * 1.5 + gap * 0.5; // вертикальный шаг со сцепкой
  const pos = [];
  if (count <= 3) {
    const y = bottomY - r;
    for (let i = 0; i < count; i++) pos.push({ x: cx + (i - (count - 1) / 2) * stepX, y });
    return pos;
  }
  const topN = Math.floor(count / 2);
  const botN = count - topN;
  const yBot = bottomY - r;
  const yTop = yBot - stepY;
  for (let i = 0; i < topN; i++) pos.push({ x: cx + (i - (topN - 1) / 2) * stepX, y: yTop });
  for (let i = 0; i < botN; i++) pos.push({ x: cx + (i - (botN - 1) / 2) * stepX, y: yBot });
  return pos;
}
