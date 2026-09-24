// Нарезает PNG по блоку frames из конфига (GDD п.3.2). Реализация в Этапе 1.
export class SpriteSheetParser {
  static getFrameRect(frames, animName, index) {
    const anim = frames.animations[animName];
    if (!anim) throw new Error('Нет анимации ' + animName);
    const col = index % frames.columns;
    return { sx: col * frames.frame_width, sy: anim.row * frames.frame_height, sw: frames.frame_width, sh: frames.frame_height };
  }
}
