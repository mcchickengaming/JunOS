# Jun OS (personal fork)

A personal fork of [efficiencyx/JunOS](https://github.com/efficiencyx/JunOS) (Apache 2.0), a self-hosted AI
companion of Jun from *My Dystopian Robot Girlfriend*. This fork adds features from the owner's design doc
("Jun OS — Capabilities & Framework" in the claude.ai project "MDRG Prototype"). Keep `LICENSE` and `NOTICE`.

## The owner
- Not a programmer. Explain steps in plain words, give exact commands to paste, one step at a time.
- PowerShell commands: each command in its OWN code block (the update is 3 blocks: `git pull`,
  `.\start.ps1 stop`, `.\start.ps1`), nothing else inside a block, so each copies cleanly on its own.
- Runs Windows. Install: `E:\MDRG Proto\JunOS 1.3.2`. GPU RTX 4060 (8 GB VRAM), 16 GB RAM.
- Brain: llama.cpp with the E4B Q4_K_M fine-tune. Don't add anything that needs more VRAM at the same time
  as the brain; load heavy tools on demand and unload after.

## Workflow
- All work goes on branch **`jun-dev`**. `main` mirrors upstream and stays untouched.
- Commit as `mcchickengaming <mcchickengaming@users.noreply.github.com>`, push to `origin jun-dev`.
- The owner updates his PC with, in the install folder, one block each:
  ```
  git pull
  ```
  ```
  .\start.ps1 stop
  ```
  ```
  .\start.ps1
  ```
  then Ctrl+F5 in the browser. Never tell him to use the Jun OS app's **Update** button: it switches the
  install back to upstream release tags.

## Rules that bite
- **Cache-busters.** Webapp JS/CSS is served `immutable` by its `?v=` URL. After changing any JS/CSS file run
  `python3 tools/bump-versions.py webapp <path relative to webapp>...` (cascades to every importer), then
  `bash .github/scripts/check-cache-busters.sh`. Small new styles can go inline in `webapp/index.html`
  (never cached) to avoid renumbering stylesheets.
- **New `.env` knobs** go in `.env.example` AND `docs/configuration.md`, or `check-consistency.sh` fails.
- **Migrations**: `webapp/api/migrations/NNN_name.sql`, next free number, ending with
  `INSERT INTO schema_version(v) VALUES (NNN);`. They run automatically on the next request.
- **Factory reset**: a new per-user table must be added to the delete list in `webapp/api/auth.php`.
- **Game art never enters git** (`webapp/assets/` is ignored; it's rebuilt from the owner's game copy).
- Her prompt: persona in `webapp/system_prompt.txt`; per-turn live context in
  `webapp/api/lib/chat/context.php` (`chat_live_context`). New behavior usually belongs in the live context,
  behind an `.env` switch that defaults on.

## Before every push
```
for f in $(git diff --name-only origin/jun-dev -- '*.php'); do php -l "$f"; done
bash .github/scripts/check-cache-busters.sh
bash .github/scripts/check-consistency.sh
python3 .github/scripts/check-refs.py
php .github/scripts/lib.test.php
php .github/scripts/migrations.test.php
php .github/scripts/bond.test.php
```
New backend features get their own `.github/scripts/<feature>.test.php` (see `bond.test.php` for the pattern:
temp sqlite, real migrations, stubbed app functions) and a step in `.github/workflows/ci.yml`.

## Fork features so far
- **Bond stages** (`webapp/api/lib/bond.php`, migration 028): Stranger → Familiar → Friend → Close → Partner →
  Devoted. XP from his messages, outings, daily return and warm replies; daily cap; never lost. Stage-ups are
  a moment in her reply, a memory note, a history event and a toast. Affection/trust are capped per stage in
  `relationship_get()` (35/50/65/80/90/100). Meter in Settings > Memory.
- **Desktop window** (`desktop/` Electron app, `webapp/desktop.html` + `js/desktop.js`): start.ps1 opens it
  instead of a browser tab (`JUN_DESKTOP`, default on). `desktop/launch.ps1` downloads a pinned Electron
  (version + SHA-256 in that file) into `runtime\electron`. Modes from the tray and her window's "Jun" menu bar (Ctrl+Shift+S steps out): her window (index.html),
  compact (frameless, on top), stepped out (on the taskbar: walks, dozes after 5 idle min, drag and drop,
  click-through except over her). Desktop chat goes into her latest conversation; desktop reactions are
  ephemeral OOC turns. Her moves on the desktop (walk cycle + 3D paper turn, carried/landing, cursor
  attention, headpats, pokes, mood/time-of-day idles, thought icons) live in `webapp/js/desktop/body.js`,
  every number in its `TUNE`. Touch spots (`regionAt`): head/ear/cheek/nose/shoulder/hand/side/tail/body; click
  = poke, hold = hand-hold or hug, rub = headpat/ear rub/tickle, drag = carry; cursor icon + glow show the spot.
  main.js does throwing (momentum, bounces, part-off-screen + peek), side-by-side monitors as one strip, and
  the "On the desktop" settings (quiet, walk/doze/watch, sounds). `desktop/props.js`: her spots (cushion,
  dog bed, beanbag, armchair; back+front windows so she sits IN them; "stay" keeps her there) and the fetch
  ball. Settings window `webapp/desktop-settings.html` (how to play, colors, spots). Settings in `runtime\desktop\desktop.json`. Writes Start menu/Startup `Jun.lnk`.
  `start.ps1 stop` closes it, `start.ps1 desktop` opens it alone. Never run Electron in the cloud sandbox
  (binary downloads are blocked); test the page with Playwright + Chrome and a mocked `window.junDesktop`.

## Everything is customizable
The owner wants every visible piece recolorable. New UI: colors as CSS variables, and a row in the settings
page using the closet's picker (`makeItemColorButton` from `js/wardrobe/color-picker.js`), like
`desktop-settings.js` GROUPS. Desktop colors live in `localStorage['desktop.theme']`.

## Content
Claude builds engines, systems and regular content. Adult/rated content is out of scope for Claude: systems
that could carry it (content packs, image tools) support a rating tag the owner controls, and the rated
content itself is the owner's to make.
