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

## [Этап 3] — Прогрессия
- ProgressionSystem: xp=base*lvl^exp (10/28/...), max 50, addXP с мульти-апом, grantLevels от сундуков
- UpgradeSystem: пул weapon-ап/новое/passive, buildChoices 1-из-3 с локализацией, apply; пауза в state upgrade, клик по карточке
- Player: passiveLevels, coins, applyPassive (7 пассивок), getPickupRadius
- LootSystem: xp/coin/potion/magnet/bomb по шансам; potion лечит %, magnet притягивает всё, bomb 150 по всем
- Pickup: разброс+трение, магнит в pickup_radius, время жизни, сбор в радиусе 20
- Chest/ChestSystem: 4 тира по весам 60/30/9/1, интервал 60с, лимит 3, жизнь 120с, автооткрытие, награды coins/potions/spells/levels; стартовый wooden рядом (first_spawn_trigger_on_chest)
- SkillSystem.grantRandomSpell: апгрейд owned (70%) или unlock нового
- Boss: обёртка с именем, оверлей «БОСС» 2с + звук, бар снизу; цифры боссов всегда
- HUD: XP и HP полоски с числами внутри, Lv/kills/coins/таймер

## [Этап 4] — UI
- widgets.js: кнопки/панели/слайдеры на canvas без DOM
- MainMenu: логотип, Играть/Бонус/Магазин/Статистика, ⚙/🏆 сверху, версия/вход/политики снизу; boot теперь в menu + музыка меню
- HUD: верх HP+Lv/XP с числами/таймер+kills+coins с flip при джойстике слева; низ список заклинаний Lv, босс-бар, ⏸/🎒; инвентарь read-only попап
- PauseMenu: Продолжить/Заново/В меню + слайдеры музыки/звуков (drag); Esc/P тоже ставит паузу
- GameOverScreen: время/уровень/киллы/монеты, Новый рекорд (best в localStorage), revive 1/забег 50% (stub под рекламу Этапа 7), снова/меню
- SettingsMenu: музыка/звуки, язык циклом ru/en/tr/de/es/fr, джойстик left/right (применяется сразу + HUD flip), сброс прогресса с подтверждением; всё в localStorage
- UpgradeMenu вынесен из Game; Shop/Bonus/Stats/Leaders — заглушки до Этапа 5
- Тапы: mousedown + touchend, роутинг по состояниям; смерть теперь ведёт в gameover, а не рестарт

## [Баланс] — скейлинг + иконки (до Этапа 5)
- Монстры: +2% HP/урона за каждые 30с + сила 1.1^N за N появившихся боссов (на новых спавнах)
- Босс: каждый следующий на 10% сильнее (1.1^(k-1)); при появлении босса все живые монстры +10% HP/урона
- Проверено: t60 ×1.04, boss1 2000, boss2 2200, живой монстр 100→110 / 5→5.5
- HUD низ: ВСЕ заклинания (без лимита 3/6), иконка-плашка как у сущностей + код (MB/FW/...) + Lv; цвет рамки по типу; >6 — мелкие 24px, перенос в ряды
- Убийства по оружию: Combat.killsByWeapon + favoriteWeapon() (снаряды/аура/зоны атрибутированы)

## [Этап 5] — Мета
- SaveSystem: Yandex player.setData + localStorage-fallback, монеты/уровни магазина/статистика/dailyLast; сейв при покупке/levelup/сундуке + автосейв 30с
- ShopSystem: цены base*mult^lvl (50→75...), check max/funds, statMods 8 статов, unlockedWeapons из unlock-товаров; UI: вкладки, 3 карточки, ▲▼, подтверждение, тост, звуки
- _initRun применяет покупки: HP/скорость/урон/атака/подбор/крит/реген/XP + разблокированные спеллы; старт — все unlocked (по умолчанию magic_bolt+arcane_nova)
- DailyBonus: 24ч кулдаун, claim +50, обратный отсчёт ЧЧ:ММ:СС
- Статистика: забеги/время/киллы/рекорд/любимое оружие; монеты забега -> мета; рекорд сабмитится в лидеборд
- Лидеры: ysdk entries + локальный fallback; resetProgress чистит весь сейв

## [UI-фиксы] — по скриншоту
- Магазин, съезжание текста: причина — drawButton ставит textAlign=center, карточки 2+ наследовали его. Теперь каждая карточка явно ставит left перед своими строками
- Магазин, скролл: карточки сужены (50..410), ▲▼ вынесены в отдельную колонку справа (421..448, внутри панели), между ними скроллбар с ползунком позиции
- Магазин, заклинания: у unlock-товаров строка «Урон: N · КД Xс · R» из skills_config (карточки вкладки выше: 96px)
- Главное меню, низ: футер в три строки без наложений — политики по центру на H-72, версия слева на H-24, «Войти» справа

## [UI-фиксы 2]
- Футер меню: политики переехали влево под «3.0.0 · K.O Studio» (две строки слева, вход справа)
- Магазин-заклинания: «Lv. 0/1» в строке заголовка справа (было перекрыто кнопкой «Купить»)
- Магазин-скролл: колонка ▲/трек/▼ одной ширины 28px с отступом 8px от края панели; клик по треку листает
- Levelup: в пул добавлены закрытые заклинания (discovery в забеге) — раньше новые спеллы давали только сундуки, за 12 уровней могло не выпасть ни одного. Магазинный unlock по-прежнему даёт спелл сразу на старте
- Низ экрана: умения строго между ⏸ и 🎒, уровень под иконкой по центру; влезает 7 в ряд (дальше мельче + второй ряд)

## [Мелочи]
- Магазин: скролл колесиком мыши (wheel над канвасом листает список)
- Цепь молнии: минимальный визуал — ломаная жёлто-белая молния от точки выстрела к цели и дальше по цепочке пробития (pierce), гаснет за ~0.2с. Проверено: сегменты 0→200→400

## [Фиксы 2]
- Меню: строка «Доступно! +50» теперь только когда бонус активен; иначе «📺 Бонус за рекламу» или «Следующий через ЧЧ:ММ:СС». Попутно найден и починен баг: t() в MainMenu не пробрасывал параметры ({time})
- Бонус за рекламу: после бесплатного забора повторный доступен за рекламу (stub видео до Этапа 7), кулдаун 10 мин из monetization; сейв dailyAdLast
- Кольцо холода: проверено симуляцией — урон идёт (100→80 за 2с на 1 ур.). Раньше его было почти не получить (levelup не давал новые спеллы — починено ранее); некрит-урон без цифр по ГДД
- Цепь молнии: pierce_per_level=1 в конфиге (3/4/5/6/7 по уровням, проверено 3→7); урон/кд росли и раньше

## [Этап 6] — Мир, эффекты, языки, баланс
- Пропсы: ~40 вокруг игрока (кольцо 500–950, 30% непроходимые), проходимые с slowdown (лужа 0.8), push-out игрока/монстров по collisions; серые заглушки до арта
- EffectSystem: play/update/draw по effects_config (спрайт-кадр или кольцо-заглушка); привязки: hit_effect оружия при попаданиях, вспышка при смерти, levelup_burst, pickup_xp, boss_spawn, chest_burst, daily_bonus_burst
- onKill теперь с weaponId (снаряды/аура/зоны/бомба) для правильного эффекта смерти
- hit-flash цветом из конфига (hit_flash_color монстров, hurt_flash_color/duration героя)
- Локализация: tr/de/es/fr дописаны до полных 115 ключей (6/6 языков, валидация 0 ошибок)
- Баланс цифрами: спавн 1/2с → 11/0.38с к 10 мин (×1.4), XP до 12 ур. 2202, весь магазин 109k, болт 12.5 DPS — правок не потребовалось

## [Этап 7] — SDK, реклама, релиз
- index.html: `<script src="/sdk.js">` по ГДД + fallback `./sdk.js` (stub no-op при настоящем SDK)
- main.js: `YaGames.init()` с таймаутом 4с до boot
- Interstitial: каждые 3 смерти, min 60с, пропуск первого забега, показ ДО gameover (состояние `ads` + заглушка-кадр)
- Rewarded: revive 1/забег 50% (блок двойных тапов, без видео = без награды), добивка daily (кулдаун 10 мин), 📺×2 в меню +100 монет (кулдаун 10 мин, сейв menuAdLast)
- Никогда во время боя: реклама только из меню/gameover/пауз-точек
- Политики: `meta.privacy_url/terms_url` → `ysdk.openUrl`, тап по половинам строки (пустые = некликабельно, проверено)
- yandex_checklist обновлён; размер проекта 0.26МБ / 52 файла (лимит 100МБ) — к заливке готов после финальных ассетов
