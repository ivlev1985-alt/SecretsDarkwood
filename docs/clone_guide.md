# Clone Guide (кратко, Этап 0)

1. Скопировать папку игры целиком.
2. Заменить PNG/MP3 в `assets/` (имена сохранить ИЛИ переименовать + поправить `sprite` в конфигах).
3. Править `config/game_config.json`: meta.*, hero.sprite+frames, visuals, audio.
4. Править `config/balance_config.json`: monsters[], chests.types[], waves, loot, environment_props.
5. Править `config/skills_config.json`: weapons[] (type только из WeaponRegistry), enemy_projectiles, passive_skills.
6. Править `config/effects_config.json`: effects[] (behavior только из EffectRegistry).
7. Править `config/shop_config.json`: items (target вида player.* или weapon.<id>.unlocked).
8. Править `config/localization.json`: тексты. Отсутствующий ключ = fallback en -> ru (не падает).
9. Код в `js/` не трогать. Новый тип поведения = 1-2 строки в реестр в `js/core/Game.js`.

Формат frames един для всех (GDD п.3.2):
`{ frame_width, frame_height, columns, animations: { name: { row, frames, fps, loop } } }`
