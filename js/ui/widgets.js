// Примитивы canvas-UI: кнопки, панели, слайдеры. Без DOM — один canvas (Yandex-friendly).
export function hit(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function drawPanel(ctx, r, title) {
  ctx.fillStyle = 'rgba(10,10,25,0.92)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  if (title) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, r.x + r.w / 2, r.y + 32);
  }
}

export function drawButton(ctx, r, label, opts = {}) {
  ctx.fillStyle = opts.disabled ? '#444' : (opts.primary ? '#7a5c00' : '#2a2a4a');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = opts.disabled ? '#666' : '#ffd34d';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = opts.disabled ? '#888' : '#fff';
  ctx.font = (opts.big ? 'bold 17px' : '14px') + ' monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 5);
}

export function drawSlider(ctx, r, label, value) {
  ctx.fillStyle = '#fff';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, r.x, r.y - 6);
  ctx.fillStyle = '#333';
  ctx.fillRect(r.x, r.y, r.w, 12);
  ctx.fillStyle = '#4da6ff';
  ctx.fillRect(r.x, r.y, r.w * Math.max(0, Math.min(1, value)), 12);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(r.x, r.y, r.w, 12);
  // knob
  const kx = r.x + r.w * Math.max(0, Math.min(1, value));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(kx, r.y + 6, 9, 0, Math.PI * 2); ctx.fill();
}

export function sliderSet(r, x) {
  return Math.max(0, Math.min(1, (x - r.x) / r.w));
}
