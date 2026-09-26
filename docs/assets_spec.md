# Спецификация ассетов Secrets of the Darkwood

> Сгенерировано из `config/*.json`. Один PNG = один спрайт-лист. Формат кадров един:
> `frame_width × frame_height, columns, animations: имя → { row, frames, fps, loop }`.

## Герой

- `assets/hero/hero_main.png` — кадр 64×64, в строке 6: idle: ряд 0, кадров 6, 6fps; run: ряд 1, кадров 6, 12fps; death: ряд 2, кадров 8, 8fps, БЕЗ цикла
- `assets/hero/hero_portrait.png` — портрет для UI (одиночный PNG)

## Монстры

- `assets/monsters/goblin.png` — кадр 64×64, в строке 5: walk: ряд 0, кадров 5, 8fps; attack: ряд 1, кадров 3, 10fps, БЕЗ цикла; death: ряд 2, кадров 5, 8fps, БЕЗ цикла
- `assets/monsters/pixie.png` — кадр 48×48, в строке 4: walk: ряд 0, кадров 4, 12fps; attack: ряд 1, кадров 3, 10fps, БЕЗ цикла; death: ряд 2, кадров 4, 8fps, БЕЗ цикла
- `assets/monsters/troll.png` — кадр 96×96, в строке 5: walk: ряд 0, кадров 5, 5fps; attack: ряд 1, кадров 4, 6fps, БЕЗ цикла; death: ряд 2, кадров 6, 6fps, БЕЗ цикла
- `assets/monsters/dark_elf_archer.png` — кадр 64×64, в строке 5: walk: ряд 0, кадров 5, 8fps; attack: ряд 1, кадров 4, 10fps, БЕЗ цикла; death: ряд 2, кадров 4, 8fps, БЕЗ цикла
- `assets/monsters/boss_dragon.png` — кадр 128×128, в строке 6: walk: ряд 0, кадров 6, 6fps; attack: ряд 1, кадров 6, 8fps, БЕЗ цикла; death: ряд 2, кадров 8, 6fps, БЕЗ цикла

## Снаряды игрока

- `assets/projectiles/magic_bolt.png` — кадр 32×32, в строке 4: fly: ряд 0, кадров 4, 16fps; impact: ряд 1, кадров 4, 12fps, БЕЗ цикла
- `assets/projectiles/arcane_nova.png` — кадр 32×32, в строке 4: fly: ряд 0, кадров 4, 16fps; impact: ряд 1, кадров 4, 12fps, БЕЗ цикла
- `assets/projectiles/fireball.png` — кадр 48×48, в строке 6: fly: ряд 0, кадров 6, 12fps; impact: ряд 1, кадров 6, 15fps, БЕЗ цикла
- frost_ring (around_player): без спрайта, рисуется кодом
- `assets/projectiles/fire_wall.png` — кадр 64×64, в строке 4: idle: ряд 0, кадров 4, 12fps
- `assets/projectiles/tornado.png` — кадр 64×64, в строке 6: idle: ряд 0, кадров 6, 14fps
- `assets/projectiles/lightning_chain.png` — кадр 32×32, в строке 4: fly: ряд 0, кадров 4, 20fps; impact: ряд 1, кадров 4, 15fps, БЕЗ цикла

## Снаряды врагов

- `assets/projectiles/arrow_basic.png` — кадр 32×32, в строке 4: fly: ряд 0, кадров 4, 12fps; impact: ряд 1, кадров 4, 12fps, БЕЗ цикла
- `assets/projectiles/fireball_boss.png` — кадр 48×48, в строке 6: fly: ряд 0, кадров 6, 12fps; impact: ряд 1, кадров 6, 15fps, БЕЗ цикла

## Эффекты

- `assets/effects/hit.png` — кадр 48×48, в строке 5: play: ряд 0, кадров 5, 20fps, БЕЗ цикла
- `assets/effects/explosion.png` — кадр 96×96, в строке 6: play: ряд 0, кадров 6, 18fps, БЕЗ цикла
- `assets/effects/levelup.png` — кадр 128×128, в строке 6: play: ряд 0, кадров 6, 15fps, БЕЗ цикла
- `assets/effects/pickup_xp.png` — кадр 32×32, в строке 4: play: ряд 0, кадров 4, 20fps, БЕЗ цикла
- `assets/effects/boss_spawn.png` — кадр 256×256, в строке 8: play: ряд 0, кадров 8, 12fps, БЕЗ цикла
- `assets/effects/chest_burst.png` — кадр 128×128, в строке 6: play: ряд 0, кадров 6, 18fps, БЕЗ цикла
- `assets/effects/levelup.png` — кадр 128×128, в строке 6: play: ряд 0, кадров 6, 15fps, БЕЗ цикла

## Окружение: пропсы и сундуки

- `assets/environment/prop_small_rock.png` — кадр 64×64, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/prop_puddle.png` — кадр 64×64, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/prop_grass_patch.png` — кадр 64×64, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/prop_big_boulder.png` — кадр 96×96, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/prop_stone_wall.png` — кадр 128×128, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/prop_lake.png` — кадр 256×256, в строке 1: idle: ряд 0, кадров 1, 1fps
- `assets/environment/chest_wooden.png` — кадр 48×48, в строке 4: idle: ряд 0, кадров 4, 6fps; open: ряд 1, кадров 6, 12fps, БЕЗ цикла
- `assets/environment/chest_silver.png` — кадр 48×48, в строке 4: idle: ряд 0, кадров 4, 8fps; open: ряд 1, кадров 6, 12fps, БЕЗ цикла
- `assets/environment/chest_golden.png` — кадр 64×64, в строке 4: idle: ряд 0, кадров 4, 8fps; open: ряд 1, кадров 8, 12fps, БЕЗ цикла
- `assets/environment/chest_legendary.png` — кадр 64×64, в строке 4: idle: ряд 0, кадров 6, 10fps; open: ряд 1, кадров 10, 15fps, БЕЗ цикла
- `assets/environment/tiles.png` — тайлы земли 128×128 или 256×256 (упомянуты в GDD §4, в конфигах пока не используются — повтор-пэттерн)

## UI

- `assets/ui/buttons.png` — кадр 200×64, в строке 3: normal: ряд 0, кадров 1, 1fps, БЕЗ цикла; hover: ряд 1, кадров 1, 1fps, БЕЗ цикла; pressed: ряд 2, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/panels.png` — кадр 512×384, в строке 6: pause: ряд 0, кадров 1, 1fps, БЕЗ цикла; gameover: ряд 1, кадров 1, 1fps, БЕЗ цикла; upgrade: ряд 2, кадров 1, 1fps, БЕЗ цикла; settings: ряд 3, кадров 1, 1fps, БЕЗ цикла; shop: ряд 4, кадров 1, 1fps, БЕЗ цикла; daily_bonus: ряд 5, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/icons.png` — кадр 32×32, в строке 16: hp: ряд 0, кадров 1, 1fps, БЕЗ цикла; xp: ряд 0, кадров 1, 1fps, БЕЗ цикла; coin: ряд 0, кадров 1, 1fps, БЕЗ цикла; kill_counter: ряд 0, кадров 1, 1fps, БЕЗ цикла; timer: ряд 0, кадров 1, 1fps, БЕЗ цикла; level: ряд 0, кадров 1, 1fps, БЕЗ цикла; pause: ряд 0, кадров 1, 1fps, БЕЗ цикла; chest_indicator: ряд 0, кадров 1, 1fps, БЕЗ цикла; boss_warning: ряд 0, кадров 1, 1fps, БЕЗ цикла; daily_bonus: ряд 0, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/hp_bar.png` — кадр 200×24, в строке 3: background: ряд 0, кадров 1, 1fps, БЕЗ цикла; fill: ряд 1, кадров 1, 1fps, БЕЗ цикла; border: ряд 2, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/xp_bar.png` — кадр 300×16, в строке 3: background: ряд 0, кадров 1, 1fps, БЕЗ цикла; fill: ряд 1, кадров 1, 1fps, БЕЗ цикла; border: ряд 2, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/boss_bar.png` — кадр 240×32, в строке 3: background: ряд 0, кадров 1, 1fps, БЕЗ цикла; fill: ряд 1, кадров 1, 1fps, БЕЗ цикла; border: ряд 2, кадров 1, 1fps, БЕЗ цикла
- `assets/ui/main_menu_bg.png` — фон меню (статичный)
- `assets/ui/fonts/main_font.ttf`, `assets/ui/fonts/damage_font.ttf` — шрифты

## Предметы и питомцы (иконки-заглушки → сюда же лягут PNG)

- Слоты: staff, hat, robe, boots, gloves, bracelet, amulet, pet
- Шаблоны: staff_fire, staff_frost, staff_wall, staff_storm, staff_thunder, hat_mage, robe_mage, boots_mage, gloves_mage, bracelet_power, bracelet_swift, amulet_wisdom, amulet_luck, pet_owl, pet_bat, pet_fairy, pet_raven

## Аудио/видео

- Музыка: `assets/audio/music/bgm_menu.mp3`, `assets/audio/music/bgm_battle.mp3`
- SFX (`assets/audio/sfx/`): shoot.mp3, hit.mp3, explosion.mp3, chest_open.mp3, boss_roar.mp3, gameover.mp3, button_click.mp3, levelup.mp3
- Видео: `assets/video/intro.mp4` (упомянуто в GDD §4, кодом пока не используется)
