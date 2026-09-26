// PC: WASD/стрелки + мышь. Mobile: виртуальный джойстик left/right (GDD п.2.2, 6.x).
export class InputManager {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.joySide = opts.joystickSide || 'left';
    // подсказка-круг нужна только на тачскринах, на ПК с клавиатурой — нет
    this.isTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);
    // Активный джойстик: база (где палец встал) + вектор -1..1
    this.joy = { active: false, baseX: 0, baseY: 0, x: 0, y: 0, id: null };
    this.JOY_RADIUS = 60;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this._updateMouse(e);
      this._pressJoy(e.clientX, e.clientY, 'mouse');
    });
    window.addEventListener('mousemove', (e) => this._updateMouse(e));
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
      if (this.joy.id === 'mouse') this._releaseJoy();
    });

    canvas.addEventListener('touchstart', (e) => {
      this.isTouch = true;
      for (const t of e.changedTouches) {
        const p = this._toCanvas(t.clientX, t.clientY);
        // Нижние 55% экрана — зона джойстика, верх — для UI-кликов (Этап 4)
        if (p.y > this.canvas.height * 0.45 && !this.joy.active) this._pressJoy(t.clientX, t.clientY, t.identifier);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) this._moveJoy(t.clientX, t.clientY);
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.joy.active && t.identifier === this.joy.id) this._releaseJoy();
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  setJoystickSide(side) { this.joySide = side === 'right' ? 'right' : 'left'; }
  getJoystickSide() { return this.joySide; }

  _toCanvas(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (cx - r.left) * (this.canvas.width / r.width), y: (cy - r.top) * (this.canvas.height / r.height) };
  }
  _updateMouse(e) {
    const p = this._toCanvas(e.clientX, e.clientY);
    this.mouse.x = p.x; this.mouse.y = p.y;
  }
  _pressJoy(clientX, clientY, id) {
    const p = this._toCanvas(clientX, clientY);
    this.joy.active = true;
    this.joy.baseX = p.x; this.joy.baseY = p.y;
    this.joy.x = 0; this.joy.y = 0; this.joy.id = id;
  }
  _moveJoy(clientX, clientY) {
    const p = this._toCanvas(clientX, clientY);
    const r = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / r.width;
    let dx = p.x - this.joy.baseX, dy = p.y - this.joy.baseY;
    const max = this.JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    this.joy.x = dx / max; this.joy.y = dy / max;
    void scale;
  }
  _releaseJoy() {
    this.joy.active = false; this.joy.x = 0; this.joy.y = 0; this.joy.id = null;
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

  isMoving() {
    const v = this.getVector();
    return Math.hypot(v.x, v.y) > 0.15;
  }

  // Отрисовка джойстика поверх мира (серая, конфиг-независимая).
  // Ненажатая подсказка-круг — только на мобильных; на ПК её нет.
  drawJoystick(ctx) {
    if (!this.joy.active && !this.isTouch) return;
    if (!this.joy.active) {
      // подсказка позиции по умолчанию
      const bx = this.joySide === 'left' ? 80 : ctx.canvas.width - 80;
      const by = ctx.canvas.height - 120;
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, this.JOY_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.joy.baseX, this.joy.baseY, this.JOY_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.joy.baseX + this.joy.x * this.JOY_RADIUS, this.joy.baseY + this.joy.y * this.JOY_RADIUS, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
