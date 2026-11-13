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
- Since Nov 8 he can also update with one click: tray (or Jun menu) > **Get the latest update** (or Saves & updates
  tab > Check now). It does the same `git pull` on `jun-dev`, saves her first and restarts everything. The three
  commands stay the fallback (e.g. when the desktop app itself won't start).

## Rules that bite
- **Cache-busters.** Webapp JS/CSS is served `immutable` by its `?v=` URL. After changing any JS/CSS file run
  `python3 tools/bump-versions.py webapp <path relative to webapp>...` (cascades to every importer), then
  `bash .github/scripts/check-cache-busters.sh`. Small new styles can go inline in `webapp/index.html`
  (never cached) to avoid renumbering stylesheets. Every `.html` page is served `no-cache` (nginx templates AND the
  Windows portable router `tools/php-router.php`), so a new page shows right after an update without a reload.
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
php .github/scripts/touch.test.php
php .github/scripts/quirks.test.php
```
New backend features get their own `.github/scripts/<feature>.test.php` (see `bond.test.php` for the pattern:
temp sqlite, real migrations, stubbed app functions) and a step in `.github/workflows/ci.yml`.

## Definition of done (the polish bar, agreed Nov 11; the owner adds items over time)
A feature is done only when ALL of these are true. Check them off in the chat before saying it's finished.
1. **Registry entry** in `webapp/data/features.json` FIRST (see "Feature registry" below): plain name, one line,
   section, tier, default, depends on, modes + fallback, privacy kind, where it's stored, profiles, search words.
2. **Defaults tuned to a natural Jun**: someone who never opens Settings gets the full, natural experience. Not 50% by
   habit.
3. **Settings rows** built from the standard controls (`webapp/js/home/controls.js`): switch, how-often (often.js,
   steps + %, plus "As she feels" where she does it on her own), choice (+ "she decides" where it fits), color (closet
   picker), size, slider. Nothing one-off. Text clean, short, calm; her name as the player set it, never a hard "Jun".
4. **How to play** entry if the player has to know how to use it.
5. **Colors + sizing**: every visible piece recolorable with the closet picker, see-through where it fits, scales with
   her size (`--fx-k`).
6. **Modes + fallback**: works in desktop / windowed / compact, or says what happens in the others.
7. **Her reactions to it**: she notices, feels something, shows it (body, icons, now-and-then lines), varied.
8. **Words, not numbers**: she talks like a person; exact numbers only when remarkable.
9. **Repeat-watcher tags** on lines/reactions (once the repeat watcher exists, #27): "OK to repeat while building up".
10. **Rated content goes through the gate** (`webapp/js/core/gate.js` / `webapp/api/lib/gate.php`): every
    interaction, line pack or scene has a tier (everyday / flirty / adult) and asks the gate. No feature does its own
    check. Claude never writes adult-tier content.
11. **Save points + profiles include it**: settings live under runtime\state, desktop.json or the app's storage, and
    the registry entry says where (`store`).
12. **Opt-out that never breaks her**: turning it off is safe; anything that depends on it is listed in `needs` so the
    settings can say it in plain words; storylines take another path.
13. **Tests** (`.github/scripts/<feature>.test.php` / `.github/scripts/js/<feature>.test.mjs`) + a CI step, and the
    "Before every push" checks pass.
14. **Docs**: a line in "Fork features so far" here and "Shipped" in the project's roadmap.

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
  every number in its `TUNE`. Touch spots (`regionAt`): circles in her-height units from the face anchor
  (`SPOT_DEFAULTS`, owner-adjustable via Jun menu > On the desktop > Adjust touch spots, saved in
  localStorage `desktop.touchSpots.v2`; pairs mirror unless unlinked, then `left` holds its own place, so
  nothing assumes she's symmetrical; `off: true` switches one off; Undo/Ctrl+Z; she's held in place while adjusting via `junDesktop.hold` → main.js `held`; "Show touch spots" desk setting draws outlines). The tail spot is the rig's TailMain meshes (geometry `drawablesSpot`), and anim.js `holdTail(ms)` stills its swing under a hand. Head on the rig's headpat area, else body; click
  = poke, hold = hand-hold / hug (torso) / tail grab / foot rub / thigh squish (body.js `thighSquish`/`thighSquishTick`, by bond:
  Stranger/Familiar wriggles free fast, Friend holds still then pulls away, Close+ blush builds and she lets him;
  the wriggle is a real side-to-side squirm every frame, `setWriggle(periodMs, amp)`, getting faster until she's out,
  numbers in TUNE `wriggle*`), rub = headpat/ear rub/tickle/thigh/foot/tail rub (on her feet: a foot rub is press and hold, owner's call, and a hover
  jiggle, 5 turns in 0.6 s, is a foot tickle `feettickle`; by bond she pulls her foot away: Stranger/Familiar right away, Friend after ~3 s of
  tickling, Close+ after ~6 s; `Body.setCloseness` from the bond stage), drag =
  carry; cursor icon + glow show the spot. Hold-to-pat (like the game): press on her head (160 ms or the first
  3 px of movement; a quick click stays a poke) and the petting hand follows the mouse (ParamHeadpatX/Y), her head
  tilts/turns and her body sways with it (body.js `patHoldStart/Move/End`, numbers in TUNE `pat*`; tray setting
  "Headpat: her head follows your hand" = desk `patFollow`). Pressing on her head never carries her; Shift turns it
  into a pinned head rub. Combos (`COMBOS` in js/desktop.js: steps in order + time window,
  effects in body.js `combo()`; `together: true` = both hands at once), spoken touch reactions by chance
  (`TOUCH_NOTES`/`TOUCH_CHANCE`, ephemeral OOC). Two hands: Shift or right-click during a hold/rub leaves that hand
  in place (`pin`, keeps going via `Body.rubEffect`), the mouse is free for a second touch.
  main.js does throwing (momentum, bounces, part-off-screen + peek), side-by-side monitors as one strip, and
  the "On the desktop" settings (quiet, walk/doze/watch, sounds). `desktop/props.js`: her spots (cushion,
  dog bed, beanbag, armchair; back+front windows so she sits IN them; "stay" keeps her there) and the fetch
  ball. Settings window `webapp/desktop-settings.html` (how to play, colors, spots). Settings in `runtime\desktop\desktop.json`. Writes Start menu/Startup `Jun.lnk`.
  `start.ps1 stop` closes it, `start.ps1 desktop` opens it alone. Never run Electron in the cloud sandbox
  (binary downloads are blocked); test the page with Playwright + Chrome and a mocked `window.junDesktop`.
- **The chat knows (touch tally)** (`webapp/api/lib/touch.php`, migration 029, `api/touch.php`,
  `js/core/touch-log.js`): the desktop and the main window log touches (`TouchLog.tap` for pokes, `begin/end` by
  slot for rubs and holds, `move` when a hand is pinned; kinds = `TOUCH_KINDS`, desktop names via `RUB_KIND` /
  `POKE_KIND`). Batches ride along with every chat turn (`touches`, `touch_now` in chat-api.js) or go alone every
  20 s / on pagehide. Per day per kind (his local day via `tz`), two weeks kept, all-time totals. Her live context
  (`touch_context`, after the bond block): today's and yesterday's touches in WORDS with the exact count in
  brackets for her eyes only, what his hands are doing right now as he talks, habits over two weeks (favorite
  touch, time of day), all-time milestones (100th headpat...: the one time she says the number, plus a memory
  note), and once a day at Friend+ after 3 pm a shy "not that I was waiting" slip on a day with no touches.
  Notable days become a memory note the next day. Warm touches nudge her mood a little (-1 tension per 45 s,
  +1 affection per 90 s, caps 4/3 a day; nothing at Stranger, only tension at Familiar). Settings > Memory:
  "Today's touches" in words + "Forget today's touches" + an "All-time" list with counts and the next milestone.
  Milestones go 1-5-10 (`TOUCH_MILESTONES`: 100, 500, 1,000, 5,000, 10,000...), owner's call: rare, never a scoreboard.
  Android quirk (`touch_count_line`, migration 030 `count_at`): past 1,000 of one touch, Friend+, right as he does it,
  3% of fitting replies and at least 3 days apart, she says the exact running count in a random flavor
  (`TOUCH_COUNT_STYLES`), her own words. `TOUCH_AWARE=off` leaves it out of her prompt and mood.
  Tests: `.github/scripts/touch.test.php`.
- **Touch feedback** (`webapp/js/desktop/fx.js`, shared by desktop.js and the settings window's "Touch feedback" tab,
  which previews with the same code): ripple shape (circle/heart/star/sparkle/paw/diamond), motion (expand, pulse,
  wavy, shaky, burst, spin), size/speed/rings/line; "Let her pick" (`reactionRipple`: shaky for touches she isn't
  ready for, heart burst for warm ones at Close+, a ripple on combos). Labels: box (rounded, pill, square, speech
  bubble, cloud, Jun style, none), font, size, animation (pop, bounce, float, wiggle, typewriter, glitch, fade),
  border, see-through. Picks in localStorage `desktop.fx` (applied as classes/vars on `<body>`), colors in the
  theme (`--ripple`, `--label`, `--label-edge`, `--label-ink`). The label and thought-bubble base CSS live in fx.js.
  Thought icons: `EMOTES` in fx.js (symbols, pictures, ASCII robot faces with a blinking caret); `pickEmote` says
  a basic icon a different way now and then by bond and mood, never the same icon twice in a row; idle thoughts by
  mood, hour and bond (`pickFromPool`); bubble pops in a mix of ways (`eAnim`); robot faces never/sometimes/often.

- **Touch moods** (`webapp/js/desktop/moods.js`, shared by js/desktop.js and the settings window's Touch feedback tab,
  section "How she feels"): every touch has a feeling, one of not ready / flustered / likes it / loves it / giggly,
  from tables per touch and closeness (`HOLDS`: [from ms, feeling] steps over the length of a hold or rub, so it
  follows body.js: a friend's foot tickle turns "not ready" at 2.6 s just before she pulls her foot away, a friend's
  thigh squish turns "not ready" when the wriggle starts; `POKES` for clicks). A bad mood takes the edge off
  (`byMood`). Power 0..1 = bond stage + length of the touch (+ a poke bonus, + happy). Effects round her head or near
  the touch (`puff`): sweat drops/"!"/shiver lines; blush lines/steam/swirls; sparkles/notes/glow dots; hearts/a heart
  ring; "hehe"/bubbles/stars; plus a robot face per feeling following the "Robot faces" setting. Never the same piece
  twice in a row; a change of heart puffs right away. A glow behind her (`.mood-aura`, inserted first in its box) in
  the feeling's color. Slots per hand (`begin(slot, kind, t0, at, stale)`: 'press' for holds/hold-to-pat, 'rub' for
  hover rubs with a 700 ms stale timeout since mousemoves stop when the mouse leaves her window, 'pin' for a hand left
  in place via `move()`); `poke`, `combo`, `burst` for one-off moments (wriggled free, foot pulled away, too many
  pokes). `rippleFor` gives "let her pick" a feeling-based ripple now and then. Settings in desktop.fx: `mAmount`
  off/some/lots, `mGlow`; colors `--mood-notready/-flustered/-likes/-loves/-giggly` in the theme. Context from
  refreshMood (`setContext({ stage: Gauges.bondStage, mood })`). The tab previews each feeling, a build-up, a
  friend's foot tickle (the real rules) and a headpat at every bond. Tests: `.github/scripts/js/moods.test.mjs`.
  The glow is fully the owner's (Touch feedback > How she feels > The glow, all in desktop.fx): `mGlow` on/off,
  `mGlowStr`/`mGlowSize` ×, `mGlowSoft` 0..1 (gradient stops, blur for shapes), `mGlowShape` round/ring/body (all round
  her)/heart/star (masked `.ma-shape` inside a blurred `.mood-aura`), `mGlowMove` feel (per feeling)/breathe/beat/spin/
  still, `mGlowSpeed` ×, `mGlowColor` feeling/one (`--mood-glow` in the theme)/rainbow, `mGlowLayer` behind/front,
  `mGlowFade` seconds; "Show the glow" previews it.
  Two more feelings: **secret** ("Secretly loves it", her tsundere side: `tsundere()` with a per-touch `seed` from
  `begin`; at Friend a touch she'd love is always hidden and 35% of the ones she likes; at Close 40% of loved touches
  start hidden and she gives up hiding after 3 s; Partner+ never; pieces: hearts that slip out and get shooed, a
  censored heart, "hmph"/"b-baka"/"whatever~", blush, `[DENIED]`/`[NOT FOUND]`; body: blush, looks away with a stolen
  glance back, ears twitch, and her tail wags anyway) and **comforted** (`byMood`: upset/scared + a WARM touch, Friend+;
  a tear that turns into a heart, "sniff…"/"thanks…", `[RESTORED]`; body: soft low ears, half-happy eyes, slow calm
  tail). Switches `mTsun`, `mComfort` (desktop.fx). Colors `--mood-secret`, `--mood-comforted`.
- **Things she picks up (quirks)** (`webapp/api/lib/quirks.php`, migration 031 `quirks`, `JUN_QUIRKS`): habits she
  catches from him over time, not part of her from the start. `QUIRKS` defines each: a `mention` regex on his messages
  (+1) and on watch-together titles (+`watch_points`), a daily cap, `need_points` over `need_days` days at `min_stage`
  or more → state `picked` (memory note + a one-time "this is new" line in her prompt, then a short standing line);
  `ask_on` / `ask_off` regexes → `asked` / `stopped` (stopped stays until he asks again). Hooked in chat.php after the
  bond award (his own turns and watch turns, never ephemeral ones), `quirks_context` after the touch block (a replay
  doesn't use up the one-time line), `relationship.php` GET carries `quirks` → speech-card.js `Gauges.quirks` →
  desktop `Moods.setContext({ animeTsun })`. The first quirk, `anime_tsundere` (owner, Nov 8: "baka" is out of
  character for Jun unless she caught it from anime with him or he asked): 12 points, 3 days, Friend+, 4 a day. On
  the desktop her "secretly loves it" lines are her own dry ones (`HMPH`); `HMPH_ANIME` ("b-baka") and `[BAKA.exe]`
  only once she has it, or per the owner's pick `mAnime` auto/on/off (Touch feedback > How she feels > Anime
  tsundere talk, which also shows where she is with it). In the factory-reset list. Tests: `quirks.test.php`.
- **Her body shows the feeling** (`webapp/js/desktop/feelbody.js`, desktop only, wired in js/desktop.js via
  `Moods.setBody(FeelBody)`): moods.js `tick` calls `show(feeling, power)` every 120 ms while a feeling is on (even with
  the effects amount off; the body has its own switch) and `after(feeling, power, side)` once when it ends (side = where
  his mouse IS then, `Moods.setPointer` from desktop.js). Not ready: ears flat, tail stiff and up with a shiver, small
  pupils, a start; after: a SOFT lean away from his hand (BodyZ/HeadZ/HeadX/eyes, 2.6 s, `Body.busyFor` keeps her
  cursor-watching from turning her back). Flustered: blush (only raised, `raise()` reads state.js `targetParams`), ears
  twitch/flicker (double flicks when strong), tail flicks (`Live2D.tailFlickOnce`), eyes look away and down. Likes: relaxed
  ears, tail low and slow, soft happy eyes. Loves: ears up, fast wag, happy eyes, blush, heart eyes now and then.
  Giggly: bouncing ears, very fast wiggle, squinty eyes. The tail mood lives in live2d/anim.js `setTailMood({ amp, period,
  rest, tremble }, ms)` (eased, back to normal by itself) on top of `driveTail`. Numbers in feelbody.js `TUNE`. Settings
  (Touch feedback > How she feels > Her body, desktop.fx): `mBody`, `mBodyStr`, `mBodyEars`, `mBodyTail`, `mBodyEyes`,
  `mBodyLean`. Testing in the cloud: a fake rig (state.js `setParamRanges` + `setRaw({ parameters: { values } })` + a PIXI
  container as model) and calling anim.js `tick()` by hand, then reading `raw.parameters.values`.
- **Her picture in the settings preview** (`webapp/js/desktop/snapshot.js`, served by BOTH her main window
  (js/app/main.js) and the desktop page, so it works without the desktop page ever opened): `take()` renders the model
  with `app.renderer.extract.canvas(model)`, then TRIMS to her visible pixels (columns/rows with too few of her pixels
  don't count, so stray specks from hidden parts are ignored; the face comes from the rig only if it lands in her top
  third, else from the middle of her head's pixels; the preview centers the picture on her face via `--pv-fx` and
  clamps every number, and the icon always stays inside the box) (the model's bounds are far bigger than
  her art: hidden parts count, which made her tiny in a corner at first), crops from the top of her head to her waist,
  cut from the FULL-size render (found on a small copy; she's a small part of the bounds, so cutting from the small copy
  made her blurry), up to 640 px tall, and stores `localStorage['desktop.snapshot']` = `{ v: 3, img (webp), fx (share of width), fy, headW,
  modelW, modelH (shares of height) }`; the face comes from the rig's face drawables (geometry.js `faceBox`). Taken
  2.5 s after she's dressed, every 15 min, and whenever the settings window writes `desktop.snapshot.want` (on opening
  the Touch feedback tab, so outfit changes show). The settings page shows it as `#pvHer` (breathing a little) instead
  of the stand-in head and ignores snapshots older than v 3; `pvFace()` gives the anchor for ripples, icons and moods.
  The preview box has `clip-path` so the fixed-position effects don't float out over the tabs. No rig = stand-in head.

- **Her size on the desktop** (`desktop/main.js` `setSize`, settings window "Her size" tab): `cfg.size` is a share of
  the screen's height (0.05–0.9, widened on the owner's request; at the big end the room over her head shrinks so her
  window still fits the screen, `headroom()`, never under 40 px; Small/Medium/Large = 0.31/0.425/0.54, old string values migrate), so she looks the
  same on every monitor; a monitor of another height re-fits her when she lands on it. She resizes live around her
  feet (no reload). Every px number in main.js is for her at `REF_PX` (440 px) and scales with `sizeK()`: headroom
  (never under 80%), walk speed (k^0.6), hop, throw/gravity/bounces. The page gets `size, herPx, k, headroom` with
  `jun:settings`; `applySize` in js/desktop.js sets `--headroom` and `--fx-k` on `<body>` (0.8–2.2, 1 when the desk
  setting `growFx` "Touch feedback grows with her" is off). fx.js CSS and desktop.html's ring/pin/cloud/particles/zzz
  multiply their px by `--fx-k`; `Fx.setScale` (ripple), `Body.setCursorScale` (cursor icons, 22–96 px). Jun menu >
  Her size on the desktop has the quick picks + "Any size you like…".

- **Save points + one-click update** (`desktop/saves.js`, `desktop/relaunch.js`, `tools/jun-save-db.php`, main.js
  "save points" section, settings window tab `saves`, Settings > Memory > Save points button via `junDesktop.openSettings`).
  A save is one `.junsave` file (a plain zip, `jun-save.json` manifest inside): `state/` = runtime\state (her db copied
  with sqlite `VACUUM INTO` through the portable php, so it's safe while she runs; memory files; caches `rl/`,
  `consolidating/`, `*.stamp` skipped), `desktop/` = runtime\desktop's `desktop.json`, `Local Storage`, `IndexedDB`
  (no chromium caches, no leveldb LOCK), `env/.env` for reference only (going back never writes .env). Written as
  `.part`, renamed when whole. Kinds: named (never auto-deleted), daily (one a day, a minute after start + hourly check,
  keep 3/7/14/30, default 7), before-restore / before-update (last 5 each). Settings in `runtime\saves.json` (outside
  everything a restore swaps): `dir` (default `runtime\saves`, git-ignored; `checkDir` refuses her own folders and
  anything in the Jun folder outside runtime\), `keep`, `lastDaily`. Going back: check the file (every entry's crc +
  sqlite integrity_check) → safety save → close her windows (`cfgFrozen` so desktop.json isn't written over) →
  `start.ps1 stop -Keep <app pid>` (new `-Keep` param: Stop-Strays spares that pid and its children, so the app stays
  up to show progress) → `restoreSave` swaps runtime\state (old one kept as `state.previous`, put back on failure) and
  unpacks the desktop part into `runtime\desktop-pending` → `relaunch()`: `relaunch.js` runs under the app's own
  electron.exe as node (`ELECTRON_RUN_AS_NODE`), waits for the old app to exit, `applyPendingDesktop`, starts the app
  again, whose normal boot wakes her server. A note (`runtime\jun-restart-note.json`, 30 min) tells the new start
  what happened (dialog). Update: branch must be `jun-dev` with an upstream, `git fetch`, refuses with local commits
  or hand-edited tracked files, lists up to 10 commit subjects, before-update save, `git merge --ff-only @{u}` (fails
  → nothing stopped), clear the http cache, stop, relaunch. If she doesn't wake within 4 min after an update the app
  offers `git reset --keep <old head>` and restarts. git runs with `GIT_TERMINAL_PROMPT=0`. Waking her server (main.js
  `wakeServer`, used by every start that finds her down, incl. after a restore/update) is NOT a detached spawn:
  detached = no console and start.ps1 silently did nothing (owner's first restore, Nov 8). A short powershell
  (`-EncodedCommand`) does `Start-Process powershell -File start.ps1 -NoBrowser -WindowStyle Hidden` with output in
  `runtime\logs\desktop-wake.log` / `.err.log` (relies on libuv's job allowing silent breakaway, so her server outlives
  the app), with start.ps1's own env vars, every `.env` key and PSModulePath removed (`freshEnv`). If she isn't up in
  4 min the dialog shows the log's last lines (`wakeTail`) and the app closes. Logs:
  `runtime\logs\desktop-saves.log`, `desktop-relaunch.log`. Tests: `.github/scripts/js/saves.test.mjs` (needs php).

- **Settings home** (tidy part A, in progress; map in the claude.ai project doc `claude/next-tidy-settings-and-habits.md`):
  `webapp/desktop-settings.html` is now ONE settings home with a sidebar (an icon row under 620 px) and a search box
  (Ctrl+F; every `.row` and h2/h3 in every section is searchable, a hit opens its section and flashes the row).
  Sections: her, talk, touch, desktop, visuals, saves, help (`SECTIONS`); old tab names map in `OLD_TABS`
  (colors → visuals, feedback → touch, spots/size → desktop + anchor), and main.js `SETTINGS_TABS` accepts both.
  The "On the desktop" switches that used to be menu-only (quiet, talk, patFollow, hints, showSpots, calibrate, walk,
  doze, watch, sounds, keep on top, open at start, start with Windows) are rows via `junDesktop.desk()` → main.js
  `jun:desk` (`DESK_KEYS` validates; `rebuildMenus` pushes `jun:desk-changed` so window and menus stay in step).
  Settings stay stored where they were (localStorage, desktop.json, .env, server).
  "How often / how much" settings are 0..100 (`webapp/js/desktop/often.js`: 8 named steps `OFTEN`/`MUCH`, `pct()` reads
  old words, `mul(v, top)` = 0 at 0 %, 1 at 50 % (the old default), `top` at 100 %): desk `walk`, `talk`, `watch`,
  `patFollow` (main.js `PCT_KEYS`, `pctOf` migrates old words on load) and desktop.fx `eAscii`. The settings page shows
  a dropdown of the steps plus a slider (`oftenControl`); menus show the steps + "Your own (N%)" + "Any amount you like…".
  "Settings…" is in the Jun menu (Ctrl+,), the tray and her right-click menu. Anime tsundere talk moved to
  Her > Habits she's picked up (`#habitRows`, part B's page).
  **Step 2 (her window's settings in the home):** names, chat (model/reasoning/think/reload prompt/notifications),
  idle nudges, voice (volume/TTS engine/language/voice + Play/speed) and mic rows are LIVE MIRRORS of her window's own
  drawer controls: `js/app/home-bridge.js` (in index.html, wired after wireVoice) describes the rows in its `MIRROR`
  list over BroadcastChannel 'jun-settings' and applies `{type:'set', id, value}` by setting the real control and
  firing input/change, so every existing handler still runs; `js/home/herwin.js` renders them into `[data-mirror]`
  hosts (structure change → rebuild, value change → patch, focused control untouched). Her window closed → "Open her
  window" (`junDesktop.desk('openWindow')`). To mirror a new row: add its control id to `MIRROR`. Native in the home:
  bond + gauges (read-only) + touches (relationship.php / touch.php), memories (the same `app/memory-graph.js` +
  `memory-actions.js`; "open the chat" asks her window), timeline (`app/timeline.js`), Account & advanced (password,
  game bridge, developer key, rated export, factory reset + sign out with a click-twice confirm, then `{type:'reload'}`
  to her window). Developer tools stay in her window's drawer (live logs): `{type:'drawer', panel}` or
  localStorage `jun.home.want` if her window has to open first. In the desktop app her gear and user chip open the
  home (capture-phase click in home-bridge.js); a plain browser/phone keeps the drawer. Settings > Dates became
  **"Do something together"** (`#togetherDrawer` in index.html, `js/app/together.js`, sidebar button next to
  Achievements): rows have `data-group` (out/play/in), buttons still wired by main.js `wireDatesPanel`; a new activity
  is one more row.
  **Step 3 (Nov 12):** tray and Jun menu = quick actions only (main.js `quickItems()`: quiet mode, her size, her spots,
  Save Jun now…, Get the latest update; plus show/hide, modes, Settings…, close). Everything else is in Settings.
  **Step 4 (Nov 12):** Simple / Everything layer (header pick), "More settings (N)" folds for a group's extra rows (one
  extra just shows), a "Reset this section" per section (talk, touch, desktop; click twice; via the registry), the same
  standard rows everywhere (js/home/controls.js), How she feels "How much" is now a percent (`mAmount` 0..100, old
  off/some/lots read as 0/50/85, moods.js `amountK()`), presets ("Start from a style" in On the desktop: The natural
  her, Cozy, Quiet worker, Playful; one-click Undo), the new-features policy (Saves & updates) and the what's-new card.
  New section **Comfort & ratings** (`comfort`, see the gate below).

- **Renderer layer + Inochi2D renderer** (Fable week step 2, Nov 12; spike, NOT wired into her pages yet):
  `webapp/js/rig/rig.js` is the one place that knows what her params drive. A rig = `{ kind, view, params, core,
  update(ms), parts, active }`; `live2dRig(model, raw)` wraps today's rig with nothing copied, `inochiRig(view, { map })`
  wraps an Inochi2D puppet, `linkRigs([main, closeup])` gives two rigs one set of numbers, `plugIntoJun(rig, state)`
  points live2d/state.js at it so params.js/anim.js/geometry.js drive it unchanged. For Inochi, `inochiCore` builds the
  rest of the Cubism-core shape Jun's code reads (`drawables` y-up with `canvasinfo`, `parts.opacities` fading groups);
  `checkRig(model, raw)` lists anything missing. Jun ids on an Inochi rig: name the params with her ids (a 2D param
  "ParamHead" gives ParamHead.x/.y, or map them), or pass a `map`. `webapp/js/rig/inochi/`: `inochi-format.js`
  (.inp/.inx read/write, TGA), `inochi-puppet.js` (params, deforms, transforms, mesh groups, pendulum physics; no DOM),
  `inochi-view.js` (PIXI v6 display object: blend modes, stencil masks, composites, mipmaps; UVs outside 0..1 are
  transparent, as on desktop Inochi2D), `inochi-doll.js` (a code-drawn test puppet with her ids, main + 4096 px close-up).
  `rig-fx.js`: `Crossfade` (two rigs, flattened, 300 ms) and `glitch()` (RGB split + scanlines, removes itself).
  Test page `webapp/rig-lab.html` (+ `js/rig-lab.js`): the doll or any dropped puppet, zoom/close-up, her light colours,
  glitch, "Run the checks" (11 checks for design sheet §7, incl. Jun's own params.js/anim.js/geometry.js on the new rig).
  Node tests: `.github/scripts/js/rig.test.mjs`. Licenses: NOTICE section 8. No puppets in git (example puppets are
  CC BY 4.0, credit seagetch if ever shown).

## Foundations (#31, Nov 12): registry, settings framework, the one gate
- **Feature registry** `webapp/data/features.json` (read by `js/core/features.js` and `api/lib/gate.php`
  `features_registry()`): every feature once: `id`, `name`, `line`, `section` (+ `anchor`, or `where` for
  `elsewhere`), `tier` (everyday / flirty / adult), `key` = its main setting as `kind:name` (stores listed in the json:
  fx, desk, size, app, mirror, theme, comfort, local, feature, env, server), `more` = its extra settings (shown under
  "More settings" in Simple), `default` (desk/comfort/fx defaults are tested against the code), `needs` (what it depends
  on, for "Off, this also pauses…" / "Paused: needs … on."), `modes` + `fallback`, `privacy` (none / pc / chats),
  `profile` (goes in a shared profile, #18), `words` (search), `since` (date). `presets`: bundles of `desk:`/`fx:`
  values. A NEW feature: add its entry first; if it has no store of its own, give it `key: "feature:<id>"` and ask
  `Features.isOn(id)` (honors the new-features policy: surprise me / ask me / keep off). Per-mode values:
  `Features.valueFor(key, base, mode)` (no UI yet; for compact #28 and later). Tests:
  `.github/scripts/js/features.test.mjs` (keys exist in FX_DEFAULTS / main.js DEFAULTS.desk / the gate, needs have no
  loops, presets valid).
- **Settings framework** `js/home/controls.js` (row, switchCtl, choiceCtl with `decide` for a "she decides" option,
  sliderCtl, oftenCtl, buttonCtl; `decorate(root)` = the registry pass over the page: tags rows by `data-fkey`, a
  `data-fx` control, or `data-key`) and `js/home/stores.js` (`peek/write/defaultOf/canWrite` for any key,
  `resetSection`, `applyPreset`/`undoPreset`). New rows: build them with Controls and pass the registry key as the
  4th argument of `row()`.
- **The one consent + ratings gate** `js/core/gate.js` = `api/lib/gate.php` (same rules, same cases:
  `.github/scripts/gate-cases.json`, run by `gate.test.php` and features.test.mjs, which also compares the constants).
  `check(item, ctx)` → `{ show, her: yes/ask/no, why, words }`: item `{ tier, flavors?, minStage?, minTrust? }`, ctx
  `{ comfort, mode, screenShare, lookAdult, stage, trust, tension, stop }`. Order: flavor fit → hard flavor locks
  (`LOCKED`: platonic and parent_daughter never flirty/adult, in code, never from a file) → siblings opt-in →
  Flirty switch → 18+ (on + confirmed) → the adult-look check (`lookAdult`, from the look itself; the creator #14 plugs
  it in) → screen share (hides flirty + adult; senses #3 fill it) → 18+ windowed-only unless `adultOutside`; then her
  say: stop signal → bond → trust (flirty/adult need ≥ `TUNE.trustNo`) → tension (ask/no) → just-reached stage = ask.
  Unknown tiers count as adult, unknown flavors as romantic. `canTag(flavor, tier)` for the makers. His settings:
  migration 032 `comfort` (in the factory-reset list), `api/comfort.php` (GET/PUT; 18+ needs `confirmAdult: true`
  the first time), cached in localStorage `jun.comfort` for the pages (`Gate.comfort()`, `loadComfort`, `saveComfort`,
  `onComfort`). Her prompt: `comfort_context` (after quirks) tells her what they are to each other when it isn't
  romantic, and "keep it sweet" when Flirty is off. First users: her thigh on the desktop is a flirty spot
  (desktop.js `FLIRTY_SPOTS` → body.js `setSpotGate`; not allowed = just her body). Rated content itself is never
  Claude's: the gate and the tags are the system, the owner makes the 18+ content in the makers.

## Everything is customizable
The owner wants every visible piece recolorable. New UI: colors as CSS variables, and a row in the settings
page using the closet's picker (`makeItemColorButton` from `js/wardrobe/color-picker.js`), like
`desktop-settings.js` GROUPS. Desktop colors live in `localStorage['desktop.theme']`.

## Content
Claude builds engines, systems and regular content. Adult/rated content is out of scope for Claude: systems
that could carry it (content packs, image tools) support a rating tag the owner controls, and the rated
content itself is the owner's to make.
