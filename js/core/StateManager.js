export const STATES = ['boot', 'menu', 'playing', 'paused', 'upgrade', 'gameover'];

export class StateManager {
  constructor(initial = 'boot') {
    if (!STATES.includes(initial)) throw new Error('Bad state ' + initial);
    this.state = initial;
    this.prev = null;
    this.listeners = [];
  }
  set(s) {
    if (!STATES.includes(s)) throw new Error('Bad state ' + s);
    this.prev = this.state;
    this.state = s;
    this.listeners.forEach((fn) => fn(s, this.prev));
  }
  get() { return this.state; }
  is(s) { return this.state === s; }
  isPlaying() { return this.state === 'playing'; }
  pause() { if (this.state === 'playing') this.set('paused'); }
  resume() { if (this.state === 'paused') this.set('playing'); }
  onChange(fn) { this.listeners.push(fn); }
}
