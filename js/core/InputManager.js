export class InputManager {
  constructor(canvas) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this._bindTouch(canvas);
  }
  _bindTouch(canvas) {
    let start = null;
    canvas.addEventListener('touchstart', (e) => { start = [e.touches[0].clientX, e.touches[0].clientY]; this.joy.active = true; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start[0], dy = e.touches[0].clientY - start[1];
      const len = Math.hypot(dx, dy) || 1, max = 60;
      const k = Math.min(1, len / max);
      this.joy.x = (dx / len) * k; this.joy.y = (dy / len) * k;
    }, { passive: true });
    const end = () => { start = null; this.joy.x = 0; this.joy.y = 0; this.joy.active = false; };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }
  getVector() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    x += this.joy.x; y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
}
