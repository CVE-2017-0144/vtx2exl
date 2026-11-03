# vtx2exl

Переносит моды Cyberpunk 2077 из Vortex в сборку ExLauncher. Только Windows.

Файлы Vortex только читаются. Без `--apply` утилита показывает план и ничего не пишет. Перед записью делает бэкап json сборки и создаёт новый профиль, старый не трогает, откат через `--undo`.

```
vtx2exl <игра> <папка сборки> [--apply] [--keep|--take|--vortex] [--check] [--extra <папка>] [--name имя] [--json] [--decisions файл]
vtx2exl --undo <сборка> [--apply]
vtx2exl --purge <игра> [--apply]
vtx2exl --selftest
```

- `--keep` при конфликте оставляет сборку, `--take` берёт Vortex
- `--vortex` тоже отдаёт приоритет Vortex, но ядро остаётся из сборки
- `--check` компилирует скрипты redscript до и после переноса, при `--apply` включён всегда
- `--purge` убирает файлы Vortex из папки игры в карантин
- запускать, пока Vortex задеплоен: нужен `vortex.deployment.json` в папке игры

Формат `--json` описан в `src/events.txt`.

`VTX2EXL-UI.exe` это то же самое в консольном интерфейсе с мышью, плюс карта конфликтов модов.

## Скачать

Готовые exe лежат в [релизах](https://github.com/CVE-2017-0144/vtx2exl/releases). Они без цифровой подписи, поэтому SmartScreen может предупредить при первом запуске. Контрольные суммы в `SHA256SUMS.txt`.

## Сборка

Нужны Visual Studio 2022 и Bun.

```
ui\build.cmd
```

Соберёт `vtx2exl.exe` и `VTX2EXL-UI.exe` в корне. Только ядро: `src\build.bat`.

## Лицензия

GPL-3.0, см. [LICENSE](LICENSE).

Автор ExLauncher и автор сборки Exposition могут использовать код на условиях MIT, см. [LICENSE-MIT](LICENSE-MIT).

Чужое в репозитории: `analyzer/paths.data.mjs` собран из данных [WolvenKit](https://github.com/WolvenKit/WolvenKit) (GPL-3.0), рендер китов в `proto/whales` адаптирован из [ascii-sharks](https://github.com/stackedlol/ascii-sharks) (MIT).

Проект не связан с CD PROJEKT RED, Nexus Mods, ExLauncher и авторами сборок.
