export class StateManager {
  constructor(initial = 'menu') { this.state = initial; this.listeners = []; }
  set(s) { this.state = s; this.listeners.forEach((fn) => fn(s)); }
  get() { return this.state; }
  onChange(fn) { this.listeners.push(fn); }
}
