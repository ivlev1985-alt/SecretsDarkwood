import { Enemy } from './Enemy.js';

// Босс: тот же Enemy + имя + флаг предупреждения. Оверлей и бар — в Game.
export class Boss extends Enemy {
  constructor(cfg, x, y, name = '') {
    super(cfg, x, y);
    this.name = name;
    this.warned = false;
  }
}
