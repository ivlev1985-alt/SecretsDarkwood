# Changelog — Secrets of the Darkwood

## [3.0.0] — 2026-05-14
- Этап 0: правильная структура `game_root/` (index.html, sdk.js, config/, assets/, js/, docs/)
- Исправлены JSON: валидный JSON без `//`-комментариев, лежат в `config/`
- `skills_config`: добавлены `unlocked/unlocked_by_default` для всех оружий, добавлен блок `enemy_projectiles` (arrow_basic, fireball_boss), добавлены пассивки crit_chance/hp_regen
- `balance_config`: `environment_props` исправлены — убран формат `props.png#id`, у каждого пропса свой `sprite` + `frames`
- `effects_config`: добавлено поле `behavior` (oneshot/looping/attached) под EffectRegistry
- `localization`: добавлены ключи инвентаря/новых пассивок, заглушки tr/de/es/fr (fallback на en в коде)
- Решения по п.6 GDD: Инвентарь = read-only попап активных билдов; Лидеры = ysdk + локальный fallback; Любимое заклинание = счётчик kills по weapon_id
- Каркас ядра: Game/ConfigLoader/AssetLoader/SpriteSheetParser/Input/Audio/State + серый прототип

## [Этап 1] — Core полностью
- ConfigLoader: loadAll + validateAll(реестры) + validateFrames + t() с fallback lang->en->ru
- AssetLoader: collectPaths() только из конфига (35 img / 9 audio), normalizeSfx, плейсхолдеры при отсутствии файлов, без хардкода имён
- SpriteSheetParser + Animator: getFrameRect с переполнением строк, fps/loop/once, death финиширует
- InputManager: WASD/стрелки + мышь + динамический тач-джойстик, setSide left/right, отрисовка, без контекстного меню
- AudioManager: музыка/sfx по путям из конфига, volumes, mute при blur/hidden (pause_on_blur)
- StateManager: boot/menu/playing/paused/upgrade/gameover, pause/resume, валидация
- Camera: follow + lerp follow_speed + offset + clamp_to_bounds
- Game: dt-кламп 0.05, FPS-счётчик (show_fps), камера следует, hero idle/run по движению, HUD flip при джойстике слева, LoadingAPI.ready, window.__game
