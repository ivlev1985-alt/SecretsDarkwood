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

## [Этап 2] — Бой
- Entity/Player/Enemy/Projectile: hp/speed/radius/invincibility/crit/regen/knockback_resist, death-анимация, hit-flash
- CombatSystem: контактный урон (блок выкл, урон вкл), снаряды vs враги + pierce + взрывы, снаряды врагов vs игрок, separation монстров, цифры только криты/боссы, kills
- SpawnSystem: first_delay 15с, затухание interval 2000->300 (x0.92/30с), perWave рост, веса (боссы excluded), оффскрин-кольцо 800+, босс каждые 120с
- SkillSystem: to_target (multishot+spread+auto_aim+pierce+взрыв), around_player (тик по радиусу + отброс), area (зона ttl+tick), кд с attack_speed, урон с damage_mul
- Демо: активны magic_bolt+frost_ring+fire_wall (гейт unlocked — в Этапе 5); ranged-враги стреляют arrow/fireball_boss
- Game: playing-цикл, чистка трупов, демо-рестарт при смерти (GameOver — Этап 4)
