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
