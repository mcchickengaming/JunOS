// Jun's desktop app. one window at a time, in one of three modes:
//   window   her normal page (index.html) in a window of its own
//   compact  just her and a chat line, no frame, floats on top
//   stepout  she's out on the desktop, standing on the taskbar
// she always comes from the server start.ps1 runs on this PC, so
// chat, memory, mood and wardrobe are the same Jun as everywhere.
//
// launched by desktop/launch.ps1 (start.ps1 calls it) or by the
// "Jun" Start menu shortcut this file writes:
//   electron.exe <this folder> --jun-url=https://127.0.0.1:8080 --jun-home=<install>

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor, screen, shell, session } = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const Props = require('./props');

const switchValue = (name) => app.commandLine.getSwitchValue(name) || '';
const JUN_URL = (switchValue('jun-url') || process.env.JUN_URL || 'https://127.0.0.1:8080').replace(/\/+$/, '');
const JUN_HOME = switchValue('jun-home') || process.env.JUN_HOME || path.resolve(__dirname, '..');
const ORIGIN = new URL(JUN_URL).origin;
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(JUN_URL).hostname);
const ICON_PNG = path.join(__dirname, 'jun.png');
const ICON_ICO = path.join(__dirname, 'jun.ico');

// her height on the desktop, in screen px, per size setting
const SIZES = { small: 320, medium: 440, large: 560 };
// room above her head for the chat line
// room above her head for the chat line, her bubbles and drifting hearts
const HEADROOM = 110;
const WALK_PX_PER_S = 70;
// the hop in her walk: px high, seconds per step (matches strideMs / 2 in webapp/js/desktop/body.js)
const HOP_PX = 4;
const STEP_S = 0.55;
// throwing her: px/s of the hand that counts as a throw, the most she
// can fly, and gravity
const THROW_MIN = 650;
const THROW_MAX = 3200;
const GRAVITY = 2600;
// px/s at the screen edge that throws her part way past it
const EDGE_THROW = 1500;

app.setName('Jun');
try { app.setPath('userData', path.join(JUN_HOME, 'runtime', 'desktop')); } catch (e) {}
if (process.platform === 'win32') app.setAppUserModelId('JunOS.Desktop');

const CFG_FILE = () => path.join(app.getPath('userData'), 'desktop.json');
const DEFAULTS = {
  mode: 'window', inside: 'window', onTop: false, size: 'medium',
  window: null, compact: null, stepX: null, displayId: null, tipShown: false,
  // "On the desktop" settings, the page reads them (jun:settings)
  desk: { walk: 'sometimes', doze: 5, watch: 'normal', quiet: false, sounds: false, hints: 'glow', talk: 'sometimes' },
};
const WALK_CHOICES = [['often', 'Often'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely'], ['never', 'Never']];
const DOZE_CHOICES = [[2, 'After 2 minutes'], [5, 'After 5 minutes'], [15, 'After 15 minutes'], [0, 'Never']];
const TALK_CHOICES = [['often', 'Often'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely'], ['never', 'Never']];
const WATCH_CHOICES = [['often', 'Often'], ['normal', 'Now and then'], ['rarely', 'Rarely'], ['never', 'Never']];
let cfg = { ...DEFAULTS };
function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
  if (!SIZES[cfg.size]) cfg.size = 'medium';
  if (!Array.isArray(cfg.spots)) cfg.spots = [];
  if (cfg.stay && !cfg.spots.some(s => s.id === cfg.stay)) cfg.stay = null;
  if (!['window', 'compact', 'stepout'].includes(cfg.mode)) cfg.mode = 'window';
  if (!['window', 'compact'].includes(cfg.inside)) cfg.inside = 'window';
  cfg.desk = { ...DEFAULTS.desk, ...(cfg.desk || {}) };
}
let saveTimer = null;
function saveCfg() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true });
      fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2));
    } catch (e) {}
  }, 300);
}

let win = null;
let winMode = null;
let splash = null;
let tray = null;
let quitting = false;
let feetPx = null;
let walk = null;
let drag = null;
let fall = null;
let clickThrough = false;
let insideTimer = null;
// held in place while he adjusts her touch spots: no walks, no
// carrying, no fetch. she still breathes and fidgets
let held = false;

if (!app.requestSingleInstanceLock()) {
  // a second launch (the Start menu shortcut, start.ps1 again)
  // just brings the running one forward
  app.quit();
} else {
  app.on('second-instance', () => showJun());
  app.whenReady().then(boot);
}

app.on('window-all-closed', () => { /* she lives in the tray */ });
app.on('before-quit', () => { quitting = true; });

// her server signs with the local CA start.ps1 makes. Chromium
// trusts it once `start.ps1 trust` ran, this covers the boxes where
// it didn't, and ONLY for her own address on this machine.
app.on('certificate-error', (event, _wc, url, _err, _cert, callback) => {
  if (LOOPBACK && url.startsWith(ORIGIN + '/')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// ---------------------------------------------------------------
// boot: wait for her server (start it if it isn't up), then open
// whichever mode she was in last time

async function boot() {
  loadCfg();
  Props.init({
    cfg,
    saveCfg,
    getWin: () => (win && !win.isDestroyed() ? win : null),
    getMode: () => winMode,
    herHeight: () => SIZES[cfg.size],
    feet: () => (feetPx == null ? Math.round(SIZES[cfg.size] * 0.04) : feetPx),
    send,
    stopWalk,
    isBusy: () => !!(drag || fall),
    setHop: (t) => { stopFall(); fall = t; },
    menusChanged: () => rebuildMenus(),
    stripRange,
    floorAt,
    walkTo: (x, speed, done) => startWander({ to: x, speed, done }),
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const fromJun = wc.getURL().startsWith(ORIGIN + '/');
    cb(fromJun && ['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write'].includes(permission));
  });
  makeTray();
  // written every launch so the port and folder in them stay current
  writeShortcut(startMenuLink());
  if (fs.existsSync(startupLink())) writeShortcut(startupLink());
  powerMonitor.on('resume', () => sendIdle(0));
  setInterval(pollIdle, 10000);
  setInterval(pollCursor, 90);

  if (!await serverUp()) {
    showSplash('Waking Jun up…');
    wakeServer();
    const t0 = Date.now();
    while (!await serverUp()) {
      if (Date.now() - t0 > 4 * 60 * 1000) {
        showSplash("Jun didn't wake up. Open PowerShell in her folder and run .\\start.ps1 to see why.");
        return;
      }
      await sleep(2000);
    }
  }
  openMode(cfg.mode, '');
  closeSplash();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function serverUp() {
  return new Promise((resolve) => {
    const lib = JUN_URL.startsWith('https:') ? https : http;
    const req = lib.request(JUN_URL + '/favicon.png', { method: 'HEAD', timeout: 2500, rejectUnauthorized: !LOOPBACK }, (res) => {
      res.resume();
      resolve(res.statusCode > 0 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// started from the Start menu or Windows startup with her server
// down: run start.ps1 hidden, the same thing he'd type himself
let woke = false;
function wakeServer() {
  if (woke || process.platform !== 'win32') return;
  const script = path.join(JUN_HOME, 'start.ps1');
  if (!fs.existsSync(script)) return;
  woke = true;
  try {
    const logDir = path.join(JUN_HOME, 'runtime', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const out = fs.openSync(path.join(logDir, 'desktop-wake.log'), 'w');
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NoBrowser'], {
      cwd: JUN_HOME, detached: true, windowsHide: true, stdio: ['ignore', out, out],
    }).unref();
  } catch (e) {}
}

function showSplash(text) {
  const html = `<!doctype html><meta charset="utf-8"><title>Jun</title>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#15142e;color:#fff;font:600 15px Arial,Helvetica,sans-serif;border-left:5px solid #ec0054;padding:0 22px;box-sizing:border-box;-webkit-app-region:drag;user-select:none">
<div>${text.replace(/[<>&]/g, '')}</div></body>`;
  if (!splash || splash.isDestroyed()) {
    splash = new BrowserWindow({ width: 380, height: 120, frame: false, resizable: false, show: false, icon: ICON_PNG, backgroundColor: '#15142e', webPreferences: { sandbox: true } });
    splash.once('ready-to-show', () => splash.show());
  }
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}
function closeSplash() { if (splash && !splash.isDestroyed()) splash.destroy(); splash = null; }

// ---------------------------------------------------------------
// windows

function displayFor(bounds) {
  if (bounds) return screen.getDisplayMatching(bounds);
  if (cfg.displayId != null) {
    const d = screen.getAllDisplays().find(x => x.id === cfg.displayId);
    if (d) return d;
  }
  return screen.getPrimaryDisplay();
}

function onScreen(b) {
  return b && screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x + 80 > a.x && b.x < a.x + a.width - 80 && b.y + 40 > a.y && b.y < a.y + a.height - 40;
  });
}

// wide on purpose: everything around her (speech card, hearts, a
// swinging arm) needs see-through room, or the window edge cuts it
// off. the extra is click-through, so it costs nothing
function stepoutSize() {
  const h = SIZES[cfg.size];
  return { width: Math.round(Math.max(460, h * 1.45)), height: h + HEADROOM };
}

// half her body's width, what has to stay on screen
const herHalf = () => SIZES[cfg.size] * 0.2;

function floorY(display, height) {
  const wa = display.workArea;
  const feet = feetPx == null ? Math.round(SIZES[cfg.size] * 0.04) : feetPx;
  return wa.y + wa.height - height + feet;
}

function clampX(display, x, width) {
  // she's in the middle of a wide window: keep HER on screen, not the window
  const wa = display.workArea;
  return Math.max(wa.x - width / 2 + herHalf(), Math.min(x, wa.x + wa.width - width / 2 - herHalf()));
}

// monitors standing side by side, edges touching, are one long strip
// of taskbar she can walk and fly along. a monitor off on its own, or
// above another one, is a separate strip
function stripOf(display) {
  const all = screen.getAllDisplays().slice().sort((a, b) => a.bounds.x - b.bounds.x);
  const touches = (a, b) => Math.abs(a.bounds.x + a.bounds.width - b.bounds.x) <= 2
    && a.bounds.y < b.bounds.y + b.bounds.height && b.bounds.y < a.bounds.y + a.bounds.height;
  let l = all.findIndex(d => d.id === display.id);
  if (l < 0) return [display];
  let r = l;
  while (l > 0 && touches(all[l - 1], all[l])) l--;
  while (r < all.length - 1 && touches(all[r], all[r + 1])) r++;
  return all.slice(l, r + 1);
}

function stripRange(display, width) {
  const strip = stripOf(display);
  const first = strip[0].workArea, last = strip[strip.length - 1].workArea;
  return {
    strip,
    lo: first.x - width / 2 + herHalf(),
    hi: last.x + last.width - width / 2 - herHalf(),
    top: Math.min(...strip.map(d => d.workArea.y)),
  };
}

// the monitor under her middle, and its taskbar
function displayAtX(strip, x, width) {
  const cx = x + width / 2;
  return strip.find(d => cx >= d.workArea.x && cx < d.workArea.x + d.workArea.width)
    || strip.reduce((best, d) => {
      const dist = Math.min(Math.abs(cx - d.workArea.x), Math.abs(cx - d.workArea.x - d.workArea.width));
      return !best || dist < best.dist ? { d, dist } : best;
    }, null).d;
}
function floorAt(strip, x, width, height) { return floorY(displayAtX(strip, x, width), height); }

function openMode(mode, reason) {
  if (mode === 'inside') mode = cfg.inside;
  stopWalk();
  stopDrag();
  clearTimeout(insideTimer);
  const old = win;
  win = null;
  winMode = mode;
  feetPx = null;
  if (mode !== 'stepout') cfg.inside = mode;
  cfg.mode = mode;
  saveCfg();

  const common = {
    show: false,
    icon: ICON_PNG,
    title: 'Jun',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  };
  let w;
  if (mode === 'window') {
    const b = onScreen(cfg.window) ? cfg.window : { width: 1180, height: 820 };
    w = new BrowserWindow({ ...common, ...b, minWidth: 420, minHeight: 480, backgroundColor: '#0f0d1f' });
    // a real menu bar: Windows 11 tucks new tray icons away under the
    // ^ by the clock, so the tray alone is too easy to miss
    w.setMenu(windowMenu());
    w.setAlwaysOnTop(!!cfg.onTop);
    if (cfg.windowMax) w.maximize();
    w.loadURL(JUN_URL + '/index.html');
  } else if (mode === 'compact') {
    const size = { width: 440, height: 620 };
    let pos = onScreen(cfg.compact && { ...cfg.compact, ...size }) ? cfg.compact : null;
    if (!pos) {
      const wa = screen.getPrimaryDisplay().workArea;
      pos = { x: wa.x + wa.width - size.width - 24, y: wa.y + wa.height - size.height };
    }
    w = new BrowserWindow({ ...common, ...size, ...pos, frame: false, transparent: true, resizable: false,
      hasShadow: false, alwaysOnTop: true, backgroundColor: '#00000000' });
    w.loadURL(`${JUN_URL}/desktop.html?mode=compact&reason=${encodeURIComponent(reason)}`);
  } else {
    const size = stepoutSize();
    const display = displayFor(old && !old.isDestroyed() ? old.getBounds() : null);
    const wa = display.workArea;
    const x = clampX(display, cfg.stepX != null ? cfg.stepX : wa.x + wa.width - size.width - 60, size.width);
    w = new BrowserWindow({ ...common, ...size, x: Math.round(x), y: floorY(display, size.height),
      frame: false, transparent: true, resizable: false, hasShadow: false, skipTaskbar: true,
      alwaysOnTop: true, backgroundColor: '#00000000' });
    w.loadURL(`${JUN_URL}/desktop.html?mode=stepout&reason=${encodeURIComponent(reason)}`);
  }

  w.once('ready-to-show', () => {
    if (mode === 'stepout') w.showInactive(); else w.show();
    if (old && !old.isDestroyed()) old.destroy();
    closeSplash();
    if (mode === 'stepout') {
      Props.show();
      // back to her spot if she has one
      if (cfg.stay) setTimeout(() => Props.goTo(cfg.stay), 1200);
    }
  });
  if (mode !== 'stepout') Props.hide();
  // a server that went away mid-session: keep trying, don't leave
  // a dead white window
  w.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;
    setTimeout(() => { if (!w.isDestroyed()) w.loadURL(url); }, 3000);
  });
  guardNavigation(w, mode);
  if (mode !== 'window') {
    setClickThrough(w, true);
    w.webContents.on('did-finish-load', () => sendSettings());
  }
  // a fresh page never starts out held
  held = false;
  w.webContents.on('did-start-loading', () => { if (w === win) held = false; });

  const remember = () => {
    if (w.isDestroyed() || w !== win) return;
    const b = w.getBounds();
    if (mode === 'window') {
      cfg.windowMax = w.isMaximized();
      if (!w.isMaximized() && !w.isMinimized() && !w.isFullScreen()) cfg.window = b;
    } else if (mode === 'compact') {
      cfg.compact = { x: b.x, y: b.y };
    }
    saveCfg();
  };
  w.on('moved', remember);
  w.on('resized', remember);
  w.on('maximize', remember);
  w.on('unmaximize', remember);
  w.on('close', (e) => {
    // the X hides her to the tray. closing the app is in the Jun menu and the tray menu
    if (quitting || w !== win) return;
    e.preventDefault();
    w.hide();
    if (!cfg.tipShown && tray && process.platform === 'win32') {
      cfg.tipShown = true;
      saveCfg();
      tray.displayBalloon({ iconType: 'info', title: 'Jun is still here',
        content: "She's by the clock now. Don't see her? Click the ^ arrow next to the clock." });
    }
  });
  win = w;
  rebuildTrayMenu();
}

function guardNavigation(w, mode) {
  const wc = w.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN + '/') && mode === 'window') return { action: 'allow' };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN + '/')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
      return;
    }
    // the frameless pages stay on desktop.html. anything else she
    // links to opens in her proper window
    if (mode !== 'window' && !new URL(url).pathname.endsWith('/desktop.html')) {
      e.preventDefault();
      openMode('window', '');
      setTimeout(() => { if (win && winMode === 'window') win.loadURL(url); }, 50);
    }
  });
}

function showJun() {
  if (!win || win.isDestroyed()) { openMode(cfg.mode, ''); return; }
  if (win.isMinimized()) win.restore();
  if (winMode === 'stepout') { win.showInactive(); Props.show(); } else { win.show(); win.focus(); }
}

function hideJun() {
  stopWalk();
  Props.hide();
  if (win && !win.isDestroyed()) win.hide();
}

// going back in from the desktop: let her say her line first, the
// page calls goInside() when she's done. the timer is for a page
// that never answers
function requestInside() {
  if (winMode !== 'stepout' || !win || win.isDestroyed()) { openMode(cfg.inside, ''); return; }
  win.webContents.send('jun:command', 'go-inside');
  clearTimeout(insideTimer);
  insideTimer = setTimeout(() => openMode(cfg.inside, ''), 15000);
}

// ---------------------------------------------------------------
// click-through, dragging, walking, falling

function setClickThrough(w, on) {
  if (!w || w.isDestroyed()) return;
  clickThrough = on;
  // forward keeps mousemove coming while clicks pass through, that
  // is how the page knows the pointer is back over her
  w.setIgnoreMouseEvents(on, { forward: true });
}

function startDrag() {
  if (!win || win.isDestroyed() || winMode === 'window' || held) return;
  stopWalk();
  stopFall();
  Props.leave();
  const c = screen.getCursorScreenPoint();
  const b = win.getBounds();
  drag = { dx: c.x - b.x, dy: c.y - b.y, hist: [], timer: setInterval(() => {
    if (!win || win.isDestroyed()) { stopDrag(); return; }
    const p = screen.getCursorScreenPoint();
    win.setPosition(p.x - drag.dx, p.y - drag.dy);
    // the last tenth of a second of the hand, for a throw
    const now = Date.now();
    drag.hist.push({ x: p.x, y: p.y, t: now });
    while (drag.hist.length > 2 && now - drag.hist[0].t > 100) drag.hist.shift();
  }, 16) };
}

function stopDrag() {
  if (!drag) return false;
  clearInterval(drag.timer);
  drag = null;
  return true;
}

function endDrag() {
  const hist = drag ? drag.hist : [];
  if (!stopDrag() || !win || win.isDestroyed()) return;
  const b = win.getBounds();
  if (winMode === 'compact') { cfg.compact = { x: b.x, y: b.y }; saveCfg(); return; }
  // let go while the hand is still moving fast: she flies
  if (hist.length >= 2) {
    const a = hist[0], z = hist[hist.length - 1];
    const dt = Math.max(16, z.t - a.t) / 1000;
    const vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
    if (Math.hypot(vx, vy) > THROW_MIN) { fly(vx, vy); return; }
  }
  // let go of her anywhere and she drops back down to the taskbar
  const range = stripRange(displayFor(b), b.width);
  const x = Math.round(Math.max(range.lo, Math.min(range.hi, b.x)));
  const target = floorAt(range.strip, x, b.width, b.height);
  let y = b.y, v = 0;
  stopFall();
  if (Math.abs(target - y) < 3) { win.setPosition(x, target); landed(x); return; }
  fall = setInterval(() => {
    if (!win || win.isDestroyed()) { stopFall(); return; }
    v += 2.2;
    y = y < target ? Math.min(target, y + v) : Math.max(target, y - 18);
    win.setPosition(x, Math.round(y));
    send('jun:fly', { vx: 0, vy: v * 60 });
    if (y === target) { stopFall(); landed(x, v * 60); }
  }, 16);
}

function stopFall() { if (fall) { clearInterval(fall); fall = null; } }

// thrown: momentum, gravity, bounces off the screen edges and the
// taskbar, then lands. the page swings her limbs off jun:fly
function fly(vx, vy) {
  const b = win.getBounds();
  const { strip, lo, hi, top: roof } = stripRange(displayFor(b), b.width);
  const top = roof - b.height * 0.35;
  const cap = (v) => Math.max(-THROW_MAX, Math.min(THROW_MAX, v));
  let x = b.x, y = b.y, last = Date.now(), bounces = 0, past = 0;
  vx = cap(vx); vy = cap(vy);
  stopFall();
  send('jun:walk-state', { state: 'flying' });
  fall = setInterval(() => {
    if (!win || win.isDestroyed()) { stopFall(); return; }
    const now = Date.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    vy += GRAVITY * dt;
    vx *= Math.pow(0.6, dt);         // air slows her a little
    x += vx * dt;
    y += vy * dt;
    // a hard enough throw carries her part way off the screen
    if (x < lo && !past && vx < -EDGE_THROW) past = -1;
    if (x > hi && !past && vx > EDGE_THROW) past = 1;
    const l = past < 0 ? lo - herHalf() * 1.3 : lo, h = past > 0 ? hi + herHalf() * 1.3 : hi;
    if (x < l) { x = l; vx = Math.abs(vx) * 0.45; send('jun:walk-state', { state: 'bonk' }); }
    if (x > h) { x = h; vx = -Math.abs(vx) * 0.45; send('jun:walk-state', { state: 'bonk' }); }
    if (y < top) { y = top; vy = Math.abs(vy) * 0.4; }
    const floor = floorAt(strip, x, b.width, b.height);
    if (y >= floor) {
      y = floor;
      if (vy > 650 && bounces < 2) {
        bounces++;
        vy = -vy * 0.35;
        vx *= 0.7;
      } else {
        stopFall();
        win.setPosition(Math.round(x), floor);
        landed(Math.round(x), vy, x < lo ? -1 : x > hi ? 1 : 0);
        return;
      }
    }
    win.setPosition(Math.round(x), Math.round(y));
    send('jun:fly', { vx, vy });
  }, 16);
}

function landed(x, speed = 0, edge = 0) {
  cfg.stepX = x;
  if (win && !win.isDestroyed()) cfg.displayId = displayFor(win.getBounds()).id;
  saveCfg();
  send('jun:walk-state', { state: 'landed', speed: Math.round(speed), edge });
  // dropped onto a spot she sits in it; off it, she'll head back later
  if (winMode === 'stepout' && win && !win.isDestroyed()) setTimeout(() => Props.afterLanding(win.getBounds()), 400);
  Props.zOrder();
}

function startWander(opts = {}) {
  if (!win || win.isDestroyed() || winMode !== 'stepout' || drag || fall) return;
  if (held) { send('jun:walk-state', { state: 'stopped' }); return; }
  // a spot to stay on beats a stroll; sitting in it, she stays put
  if (opts.to == null && !opts.back) {
    if (Props.onSpot() || Props.wantsSpot()) { send('jun:walk-state', { state: 'stopped' }); return; }
  }
  if (Props.onSpot()) Props.leave();
  // her mood sets the pace (webapp/js/desktop.js)
  const pace = Math.max(0.5, Math.min(1.6, Number(opts.speed) || 1));
  const hopPx = Math.max(0, Math.min(10, Number(opts.hop) || HOP_PX));
  const b = win.getBounds();
  const display = displayFor(b);
  const wa = display.workArea;
  const { strip, lo, hi } = stripRange(display, b.width);
  // mostly a stroll; now and then a long walk, which on more than one
  // monitor can take her over to the next screen
  const far = strip.length > 1 && Math.random() < 0.2;
  const span = Math.min(hi - lo, far ? wa.width * 0.9 : Math.max(180, wa.width * 0.35));
  let to = b.x + (Math.random() < 0.5 ? -1 : 1) * (span * (0.4 + Math.random() * 0.6));
  if (to < lo || to > hi) to = b.x - (to - b.x);
  // back onto the screen after being thrown half off it
  if (opts.back) to = b.x < lo ? lo + 80 : b.x > hi ? hi - 80 : b.x;
  // a place to go (the ball)
  if (opts.to != null) to = Number(opts.to);
  to = Math.max(Math.min(lo, b.x), Math.min(Math.max(hi, b.x), to));
  if (Math.abs(to - b.x) < 40) {
    send('jun:walk-state', { state: 'stopped' });
    if (opts.done) opts.done();
    return;
  }
  stopWalk();
  const dir = to > b.x ? 1 : -1;
  // her floor, eased toward the taskbar of whichever monitor she's on
  let baseY = floorY(display, b.height);
  const from = b.x, dist = Math.abs(to - b.x);
  let t = 0, last = Date.now();
  // she turns first (the page does that), then sets off. speeds up
  // over her first steps and slows into the last ones, a little hop
  // in each step
  const TURN_S = 0.35, EASE_PX = Math.min(60, dist / 3);
  send('jun:walk-state', { state: 'walking', dir });
  walk = setInterval(() => {
    if (!win || win.isDestroyed()) { stopWalk(); return; }
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    if (t < TURN_S) return;
    // y wobbles with the hop, x is the only thing that walks
    const gone = Math.abs(win.getBounds().x - from);
    const left = dist - gone;
    const speed = WALK_PX_PER_S * pace * Math.max(0.25, Math.min(1, gone / EASE_PX + 0.25, left / EASE_PX + 0.15));
    let x = win.getBounds().x + dir * Math.max(1, speed * dt);
    const done = dir > 0 ? x >= to : x <= to;
    if (done) x = to;
    // the hop in each step, one per footfall (two per stride)
    const hop = done ? 0 : Math.round(Math.abs(Math.sin((t - TURN_S) * Math.PI * pace / STEP_S)) * -hopPx);
    const floorHere = floorAt(strip, x, b.width, b.height);
    baseY += Math.max(-12, Math.min(12, floorHere - baseY));
    win.setPosition(Math.round(x), Math.round(baseY) + hop);
    if (done) {
      stopWalk();
      cfg.stepX = Math.round(x);
      saveCfg();
      Props.zOrder();
      send('jun:walk-state', { state: 'stopped' });
      if (opts.done) opts.done();
    }
  }, 33);
}

// the cursor, for her eyes. only while it moves, and only in the
// frameless modes, her window has its own page
let lastCursor = null;
function pollCursor() {
  if (!win || win.isDestroyed() || winMode === 'window' || !win.isVisible() || drag) return;
  const c = screen.getCursorScreenPoint();
  if (lastCursor && lastCursor.x === c.x && lastCursor.y === c.y) return;
  lastCursor = c;
  const b = win.getBounds();
  send('jun:cursor', { x: c.x - b.x, y: c.y - b.y });
}

// where she rests: on her spot if she's in one, else the taskbar
function restY(b) {
  const y = Props.restY();
  return y != null ? y : floorY(displayFor(b), b.height);
}

function stopWalk() {
  if (!walk) return;
  clearInterval(walk);
  walk = null;
  if (win && !win.isDestroyed() && winMode === 'stepout') {
    const b = win.getBounds();
    win.setPosition(b.x, restY(b));
  }
}

// ---------------------------------------------------------------
// idle: she dozes off when he's been away from the keyboard

function pollIdle() {
  let s = 0;
  try { s = powerMonitor.getSystemIdleTime(); } catch (e) { return; }
  sendIdle(s);
}
function sendIdle(s) {
  const mins = Number(cfg.desk.doze);
  send('jun:idle', { seconds: s, dozeAfter: mins > 0 ? mins * 60 : Infinity });
}
function sendSettings() { send('jun:settings', { ...cfg.desk }); }

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ---------------------------------------------------------------
// the page's calls (preload.js is the whole list)

const fromWin = (e) => win && !win.isDestroyed() && e.sender === win.webContents;

ipcMain.on('jun:click-through', (e, on) => {
  if (!fromWin(e) || winMode === 'window' || drag) return;
  if (on !== clickThrough) setClickThrough(win, on);
});
ipcMain.on('jun:drag', (e, what) => {
  if (!fromWin(e)) return;
  if (what === 'start') startDrag(); else endDrag();
});
ipcMain.on('jun:feet', (e, px) => {
  if (!fromWin(e) || winMode !== 'stepout') return;
  const next = Math.max(0, Math.min(200, Math.round(px)));
  if (feetPx === next) return;
  feetPx = next;
  if (!drag && !fall && !walk) {
    const b = win.getBounds();
    win.setPosition(b.x, restY(b));
  }
});
ipcMain.on('jun:walk', (e, what) => {
  if (!fromWin(e)) return;
  if (what === 'wander' || (what && what.what === 'wander')) startWander(typeof what === 'object' ? what : {});
  else stopWalk();
});
ipcMain.on('jun:hold', (e, on) => {
  if (!fromWin(e)) return;
  held = !!on;
  if (held) stopWalk();
});
ipcMain.on('jun:mode', (e, mode) => {
  if (!fromWin(e)) return;
  if (mode === 'hide') hideJun();
  else if (mode === 'inside') { clearTimeout(insideTimer); openMode(cfg.inside, ''); }
  else if (['window', 'compact', 'stepout'].includes(mode)) openMode(mode, mode === 'stepout' ? 'stepout' : '');
});
ipcMain.on('jun:menu', (e) => {
  if (!fromWin(e)) return;
  Menu.buildFromTemplate(modeItems(true)).popup({ window: win });
});
ipcMain.on('jun:focus', (e, on) => {
  if (!fromWin(e)) return;
  if (on) win.focus();
});

// ---------------------------------------------------------------
// the settings window: how to play, colors, her spots
// (webapp/desktop-settings.html, from her server like everything else)

let settingsWin = null;
function openSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('jun:settings-tab', tab);
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 480, height: 700, minWidth: 380, minHeight: 420, title: 'Jun on the desktop', icon: ICON_PNG,
    backgroundColor: '#100d17', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  settingsWin.setMenu(null);
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.loadURL(`${JUN_URL}/desktop-settings.html#${encodeURIComponent(tab || 'help')}`);
  settingsWin.once('ready-to-show', () => settingsWin && settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}

const fromSettings = (e) => (settingsWin && !settingsWin.isDestroyed() && e.sender === settingsWin.webContents) || fromWin(e);
ipcMain.handle('jun:spots', (e, action, a, b, c) => {
  if (!fromSettings(e)) return null;
  if (action === 'add') Props.add(a);
  else if (action === 'remove') Props.remove(a);
  else if (action === 'color') Props.setColor(a, Number(b), c);
  else if (action === 'stay') Props.stay(a || null);
  if (action !== 'list') rebuildMenus();
  return { spots: Props.list(), types: Props.types(), stay: cfg.stay || null };
});

// the spot and ball windows (desktop/prop-preload.js)
const isProp = (wc) => !!Props.spotByContents(wc) || Props.ballContents() === wc;
ipcMain.on('prop:click-through', (e, on) => {
  if (!isProp(e.sender)) return;
  const bw = BrowserWindow.fromWebContents(e.sender);
  if (bw) bw.setIgnoreMouseEvents(!!on, { forward: true });
});
ipcMain.on('prop:drag', (e, what) => {
  if (!isProp(e.sender)) return;
  if (what === 'start') Props.dragStart(e.sender); else Props.dragEnd();
});
ipcMain.on('prop:menu', (e) => {
  if (!isProp(e.sender)) return;
  const spot = Props.spotByContents(e.sender);
  const bw = BrowserWindow.fromWebContents(e.sender);
  const items = spot ? [
    { label: 'Stay here', click: () => Props.stay(spot.id) },
    { label: 'Free to roam', enabled: cfg.stay === spot.id, click: () => Props.stay(null) },
    { type: 'separator' },
    { label: 'Colors…', click: () => openSettings('spots') },
    { label: 'Remove', click: () => Props.remove(spot.id) },
  ] : [
    { label: 'Put the ball away', click: () => { Props.removeBall(); rebuildMenus(); } },
  ];
  Menu.buildFromTemplate(items).popup({ window: bw });
});

// ---------------------------------------------------------------
// tray

// the menu bar of her window. same choices as the tray
function windowMenu() {
  return Menu.buildFromTemplate([
    { label: 'Jun', submenu: [
      { label: 'Step out onto the desktop', accelerator: 'CmdOrCtrl+Shift+S', click: () => openMode('stepout', 'stepout') },
      { label: 'Compact', accelerator: 'CmdOrCtrl+Shift+C', click: () => openMode('compact', '') },
      { type: 'separator' },
      { label: 'Keep her window on top', type: 'checkbox', checked: !!cfg.onTop, click: (i) => setOnTop(i.checked) },
      sizeMenu(),
      deskMenu(),
      spotsMenu(),
      { type: 'separator' },
      { label: 'How to play with her', click: () => openSettings('help') },
      { label: 'Customize colors…', click: () => openSettings('colors') },
      { type: 'separator' },
      { label: 'Hide (she stays by the clock)', accelerator: 'CmdOrCtrl+H', click: hideJun },
      { label: 'Close the desktop app', click: () => { quitting = true; app.quit(); } },
    ] },
    { label: 'View', submenu: [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: (_i, w) => w && w.webContents.reload() },
      { label: 'Reload fresh', accelerator: 'CmdOrCtrl+F5', click: (_i, w) => w && w.webContents.reloadIgnoringCache() },
      { label: 'Reload fresh', accelerator: 'CmdOrCtrl+Shift+R', visible: false, click: (_i, w) => w && w.webContents.reloadIgnoringCache() },
      { type: 'separator' },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' },
    ] },
  ]);
}

function setOnTop(on) {
  cfg.onTop = on;
  saveCfg();
  if (win && winMode === 'window') { win.setAlwaysOnTop(on); win.setMenu(windowMenu()); }
  rebuildTrayMenu();
}

// "On the desktop": how lively she is out there
function deskMenu() {
  const set = (k, v) => { cfg.desk[k] = v; saveCfg(); sendSettings(); rebuildMenus(); };
  const radio = (k, choices) => choices.map(([v, label]) => ({
    label, type: 'radio', checked: cfg.desk[k] === v, click: () => set(k, v),
  }));
  return { label: 'On the desktop', submenu: [
    { label: 'Quiet mode (no wandering, no talking on her own)', type: 'checkbox', checked: !!cfg.desk.quiet, click: (i) => set('quiet', i.checked) },
    { type: 'separator' },
    { label: 'Walks around', submenu: radio('walk', WALK_CHOICES) },
    { label: 'Dozes off when you are away', submenu: radio('doze', DOZE_CHOICES) },
    { label: 'Looks at your mouse', submenu: radio('watch', WATCH_CHOICES) },
    { label: 'Talks about your touches', submenu: radio('talk', TALK_CHOICES) },
    { type: 'separator' },
    { label: 'Little sounds (steps, landing, squeaks)', type: 'checkbox', checked: !!cfg.desk.sounds, click: (i) => set('sounds', i.checked) },
    { label: 'Touch hints', submenu: [
      { label: 'Cursor icon and a soft glow', type: 'radio', checked: cfg.desk.hints !== 'cursor', click: () => set('hints', 'glow') },
      { label: 'Cursor icon only', type: 'radio', checked: cfg.desk.hints === 'cursor', click: () => set('hints', 'cursor') },
    ] },
    { label: 'Adjust touch spots…', click: calibrate },
  ] };
}

// drag the touch spots onto her (desktop.js shows the circles). needs
// her out of her window, the page with the spots is desktop.html
function calibrate() {
  if (winMode === 'window') {
    openMode('stepout', '');
    setTimeout(() => send('jun:command', 'calibrate'), 2500);
  } else {
    showJun();
    send('jun:command', 'calibrate');
  }
}

// her spots and the ball
function spotsMenu() {
  const spots = Props.list();
  const seen = {};
  const stayItems = [{ label: 'Free to roam', type: 'radio', checked: !cfg.stay, click: () => Props.stay(null) }];
  for (const s of spots) {
    seen[s.type] = (seen[s.type] || 0) + 1;
    const n = spots.filter(x => x.type === s.type).length > 1 ? ` ${seen[s.type]}` : '';
    stayItems.push({ label: `Stay on the ${s.label.toLowerCase()}${n}`, type: 'radio', checked: s.stay, click: () => Props.stay(s.id) });
  }
  return { label: 'Her spots', submenu: [
    ...Props.types().map(t => ({ label: `Add a ${t.label.toLowerCase()}`, click: () => Props.add(t.type) })),
    { type: 'separator' },
    ...stayItems,
    { type: 'separator' },
    Props.hasBall()
      ? { label: 'Put the ball away', click: () => { Props.removeBall(); rebuildMenus(); } }
      : { label: 'Toss her a ball', enabled: winMode === 'stepout', click: () => { Props.spawnBall(); rebuildMenus(); } },
    { label: 'Spot colors…', click: () => openSettings('spots') },
  ] };
}

function rebuildMenus() {
  rebuildTrayMenu();
  if (win && !win.isDestroyed() && winMode === 'window') win.setMenu(windowMenu());
}

function sizeMenu() {
  return { label: 'Her size on the desktop', submenu: Object.keys(SIZES).map(k => ({
    label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: cfg.size === k, click: () => {
      cfg.size = k;
      saveCfg();
      if (winMode === 'stepout') openMode('stepout', '');
      Props.rebuild();
      rebuildTrayMenu();
    },
  })) };
}

function trayIcon() {
  // .ico on Windows, it has a real 16 px picture in it
  if (process.platform === 'win32' && fs.existsSync(ICON_ICO)) return nativeImage.createFromPath(ICON_ICO);
  const img = nativeImage.createFromPath(ICON_PNG);
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}

function makeTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Jun');
  tray.on('click', showJun);
  rebuildTrayMenu();
}

function modeItems(fromHer) {
  const out = winMode === 'stepout';
  const items = [];
  if (fromHer && out) items.push({ label: 'Talk to her', click: () => send('jun:command', 'talk') });
  items.push(
    { label: 'Her window', type: fromHer ? 'normal' : 'radio', checked: winMode === 'window', click: () => openMode('window', '') },
    { label: 'Compact', type: fromHer ? 'normal' : 'radio', checked: winMode === 'compact', click: () => openMode('compact', '') },
  );
  if (out) items.push({ label: 'Go back inside', click: requestInside });
  else items.push({ label: 'Step out onto the desktop', click: () => openMode('stepout', 'stepout') });
  if (fromHer) {
    items.push({ type: 'separator' });
    if (out) items.push(spotsMenu());
    items.push({ label: 'How to play with her', click: () => openSettings('help') }, { label: 'Hide her', click: hideJun });
  }
  return items;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Show Jun', click: showJun },
    { label: 'Hide Jun', click: hideJun },
    { type: 'separator' },
    ...modeItems(false),
    { type: 'separator' },
    { label: 'Keep her window on top', type: 'checkbox', checked: !!cfg.onTop, click: (i) => setOnTop(i.checked) },
    sizeMenu(),
    deskMenu(),
    spotsMenu(),
    { label: 'How to play with her', click: () => openSettings('help') },
    { label: 'Customize colors…', click: () => openSettings('colors') },
    { type: 'separator' },
    { label: 'Open her window when Jun starts', type: 'checkbox', checked: envDesktopOn(), click: (i) => setEnvDesktop(i.checked) },
    { label: 'Start Jun with Windows', type: 'checkbox', checked: fs.existsSync(startupLink()), enabled: process.platform === 'win32', click: (i) => {
      if (i.checked) writeShortcut(startupLink());
      else try { fs.unlinkSync(startupLink()); } catch (e) {}
    } },
    { type: 'separator' },
    { label: 'Close the desktop app', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------
// the .env switch start.ps1 reads, and the shortcuts

const ENV_FILE = () => path.join(JUN_HOME, '.env');
const ENV_RE = /^[ \t]*#?[ \t]*JUN_DESKTOP[ \t]*=.*$/m;

function envDesktopOn() {
  try {
    const m = fs.readFileSync(ENV_FILE(), 'utf8').match(/^[ \t]*JUN_DESKTOP[ \t]*=[ \t]*["']?([^"'\r\n]*)/m);
    return !m || !/^(off|0|false|no)$/i.test(m[1].trim());
  } catch (e) { return true; }
}

function setEnvDesktop(on) {
  const line = `JUN_DESKTOP=${on ? 'on' : 'off'}`;
  try {
    let text = fs.existsSync(ENV_FILE()) ? fs.readFileSync(ENV_FILE(), 'utf8') : '';
    if (ENV_RE.test(text)) text = text.replace(ENV_RE, line);
    else text += (text && !text.endsWith('\n') ? '\r\n' : '') + line + '\r\n';
    fs.writeFileSync(ENV_FILE(), text);
  } catch (e) {}
  rebuildTrayMenu();
}

function startMenuLink() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Jun.lnk');
}
function startupLink() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Jun.lnk');
}

function writeShortcut(file) {
  if (process.platform !== 'win32') return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    shell.writeShortcutLink(file, 'create', {
      target: process.execPath,
      args: `"${app.getAppPath()}" --jun-url=${JUN_URL} --jun-home="${JUN_HOME}"`,
      cwd: JUN_HOME,
      description: 'Jun',
      icon: fs.existsSync(ICON_ICO) ? ICON_ICO : process.execPath,
      iconIndex: 0,
      appUserModelId: 'JunOS.Desktop',
    });
  } catch (e) {}
}
