export class Pool {
  constructor(factory, size = 64) { this.factory = factory; this.free = []; this.used = new Set(); for (let i = 0; i < size; i++) this.free.push(factory()); }
  acquire() { const o = this.free.pop() || this.factory(); this.used.add(o); return o; }
  release(o) { this.used.delete(o); this.free.push(o); }
}
