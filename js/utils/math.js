export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function xpForLevel(base, exp, level) { return Math.floor(base * Math.pow(level, exp)); }
