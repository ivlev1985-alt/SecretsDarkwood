// Нарезка PNG по блоку frames (GDD п.3.2). Чистые функции — тестируются в node.
export class SpriteSheetParser {
  static validate(frames) {
    if (!frames || typeof frames !== 'object') throw new Error('frames not an object');
    if (!(frames.frame_width > 0) || !(frames.frame_height > 0)) throw new Error('bad frame size');
    if (!(frames.columns > 0)) throw new Error('bad columns');
    if (!frames.animations) throw new Error('missing animations');
    return true;
  }

  // frameIndex — номер кадра ВНУТРИ анимации (0..anim.frames-1).
  // Поддерживает переполнение на следующие строки, если frames > columns.
  static getFrameRect(frames, animName, frameIndex) {
    const anim = frames.animations[animName];
    if (!anim) throw new Error('Нет анимации ' + animName);
    const i = Math.max(0, Math.min(anim.frames - 1, frameIndex | 0));
    const col = i % frames.columns;
    const rowOffset = Math.floor(i / frames.columns);
    return {
      sx: col * frames.frame_width,
      sy: (anim.row + rowOffset) * frames.frame_height,
      sw: frames.frame_width,
      sh: frames.frame_height
    };
  }

  static animLength(frames, animName) {
    return frames.animations[animName].frames;
  }
}

// Покадровый аниматор: fps из конфига, loop / once.
export class Animator {
  constructor(frames, animName) {
    SpriteSheetParser.validate(frames);
    if (!frames.animations[animName]) throw new Error('Нет анимации ' + animName);
    this.frames = frames;
    this.animName = animName;
    this.t = 0;
    this.index = 0;
    this.finished = false;
  }
  setAnimation(name, reset = true) {
    if (!this.frames.animations[name]) throw new Error('Нет анимации ' + name);
    if (this.animName !== name) {
      this.animName = name;
      if (reset) { this.t = 0; this.index = 0; this.finished = false; }
    }
  }
  update(dt) {
    const anim = this.frames.animations[this.animName];
    if (this.finished && !anim.loop) return;
    this.t += dt;
    const frameDur = 1 / anim.fps;
    while (this.t >= frameDur) {
      this.t -= frameDur;
      this.index++;
      if (this.index >= anim.frames) {
        if (anim.loop) this.index = 0;
        else { this.index = anim.frames - 1; this.finished = true; break; }
      }
    }
  }
  getRect() {
    return SpriteSheetParser.getFrameRect(this.frames, this.animName, this.index);
  }
  isFinished() { return this.finished; }
}
