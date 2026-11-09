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

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, powerMonitor, screen, shell, session } = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const Props = require('./props');
const Saves = require('./saves');

const switchValue = (name) => app.commandLine.getSwitchValue(name) || '';
const JUN_URL = (switchValue('jun-url') || process.env.JUN_URL || 'https://127.0.0.1:8080').replace(/\/+$/, '');
const JUN_HOME = switchValue('jun-home') || process.env.JUN_HOME || path.resolve(__dirname, '..');
const ORIGIN = new URL(JUN_URL).origin;
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(JUN_URL).hostname);
const ICON_PNG = path.join(__dirname, 'jun.png');
const ICON_ICO = path.join(__dirname, 'jun.ico');

// her height on the desktop: a share of the screen's height (cfg.size),
// so the same setting looks right on every monitor. the quick picks
// match the old fixed sizes (320/440/560 px) on a 1080p screen
const SIZE_MIN = 0.15, SIZE_MAX = 0.7;
const SIZES = { small: 0.31, medium: 0.425, large: 0.54 };
// every px number below is for her at REF_PX tall (medium on 1080p);
// sizeK() scales them with her
const REF_PX = 440;
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
  mode: 'window', inside: 'window', onTop: false, size: 0.425,
  window: null, compact: null, stepX: null, displayId: null, tipShown: false,
  // "On the desktop" settings, the page reads them (jun:settings)
  desk: { walk: 'sometimes', doze: 5, watch: 'normal', quiet: false, sounds: false, hints: 'glow', talk: 'sometimes', showSpots: false, patFollow: 'normal', growFx: true },
};
const WALK_CHOICES = [['often', 'Often'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely'], ['never', 'Never']];
const DOZE_CHOICES = [[2, 'After 2 minutes'], [5, 'After 5 minutes'], [15, 'After 15 minutes'], [0, 'Never']];
const TALK_CHOICES = [['often', 'Often'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely'], ['never', 'Never']];
const WATCH_CHOICES = [['often', 'Often'], ['normal', 'Now and then'], ['rarely', 'Rarely'], ['never', 'Never']];
const PATFOLLOW_CHOICES = [['lots', 'A lot'], ['normal', 'Normal'], ['little', 'A little'], ['none', 'Not at all (only the hand moves)']];
let cfg = { ...DEFAULTS };
function clampSize(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(n * 1000) / 1000)) : SIZES.medium;
}
function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
  // old installs saved 'small' / 'medium' / 'large'
  if (typeof cfg.size === 'string') cfg.size = SIZES[cfg.size] || SIZES.medium;
  cfg.size = clampSize(cfg.size);
  if (!Array.isArray(cfg.spots)) cfg.spots = [];
  if (cfg.stay && !cfg.spots.some(s => s.id === cfg.stay)) cfg.stay = null;
  if (!['window', 'compact', 'stepout'].includes(cfg.mode)) cfg.mode = 'window';
  if (!['window', 'compact'].includes(cfg.inside)) cfg.inside = 'window';
  cfg.desk = { ...DEFAULTS.desk, ...(cfg.desk || {}) };
}
let saveTimer = null;
// set while she's going back to a save: the save's desktop.json goes
// in after this app closes, so nothing here may write over it
let cfgFrozen = false;
function saveCfg() {
  clearTimeout(saveTimer);
  if (cfgFrozen) return;
  saveTimer = setTimeout(() => {
    if (cfgFrozen) return;
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
  // a save's desktop part that relaunch.js couldn't put in place
  // (a file was still held): now, before anything opens the storage
  try { Saves.applyPendingDesktop(JUN_HOME); } catch (e) {}
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
    herHeight: () => herPx(),
    feet: () => (feetPx == null ? Math.round(herPx() * 0.04) : feetPx),
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

  // left by a restore or an update just before this start
  const note = Saves.takeNote(JUN_HOME);
  if (!await serverUp()) {
    showSplash(note && note.kind === 'restore' ? `Waking Jun up, back at “${note.name}”…`
      : note && note.kind === 'update' ? 'Waking Jun up with her update…' : 'Waking Jun up…');
    wakeServer();
    const t0 = Date.now();
    while (!await serverUp()) {
      if (Date.now() - t0 > 4 * 60 * 1000) {
        if (note && note.kind === 'update' && note.from && await offerUndoUpdate(note)) return;
        closeSplash();
        const tail = wakeTail();
        log("she didn't wake up" + (tail ? ':\n' + tail : ' (start.ps1 printed nothing)'));
        await ask({ type: 'warning', message: "Jun didn't wake up.",
          detail: (tail ? 'The last thing her start said:\n\n' + tail + '\n\n' : '') +
            'Open PowerShell in her folder and run .\\start.ps1 to start her by hand. Her full start log is runtime\\logs\\desktop-wake.log.' });
        app.exit(0);
        return;
      }
      await sleep(2000);
    }
  }
  openMode(cfg.mode, '');
  closeSplash();
  if (note) setTimeout(() => afterRestart(note), 1500);
  // the daily save: a minute after she's up, then checked every hour
  setTimeout(dailySave, 60 * 1000);
  setInterval(dailySave, 60 * 60 * 1000);
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
// down, or restarted after going back to a save / an update: run
// start.ps1 hidden, the same thing he'd type himself.
//
// NOT a detached spawn: that gives powershell no console at all, and
// start.ps1 then silently does nothing (Nov 8, the first "go back to a
// save"). a short powershell does a Start-Process instead, the same
// way start.ps1 starts her own services: its own hidden console,
// output in runtime\logs\desktop-wake.log, and it lives on by itself.
let woke = false;
let wakeFiles = null;
const WAKE_LOG = () => (wakeFiles || [])[0] || path.join(JUN_HOME, 'runtime', 'logs', 'desktop-wake.log');
const WAKE_ERR = () => (wakeFiles || [])[1] || path.join(JUN_HOME, 'runtime', 'logs', 'desktop-wake.err.log');
// fresh, empty log files. a wake that hung earlier can still hold the
// usual ones open, then this start gets its own names
function pickWakeFiles() {
  const dir = path.join(JUN_HOME, 'runtime', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  for (const tag of ['', '-' + process.pid]) {
    const files = [path.join(dir, `desktop-wake${tag}.log`), path.join(dir, `desktop-wake${tag}.err.log`)];
    try {
      for (const f of files) {
        if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.log$/, '.prev.log'));
        fs.writeFileSync(f, '');
      }
      return files;
    } catch (e) { log('wake log ' + files[0] + ' is busy: ' + e.message); }
  }
  return null;
}
// what start.ps1 sets for her services. an app it opened inherits
// them, and a start that finds them set would skip reading .env
const START_ENV = ['AI_PROVIDER', 'OLLAMA_URL', 'LLAMACPP_URL', 'TTS_URL', 'SIDECAR_SECRET', 'KARAOKE_URL',
  'OMEGA_STATE_DIR', 'JUN_CA_FILE', 'OMEGA_ALLOWED_HOSTS', 'OMEGA_ALLOWED_ORIGINS', 'OMEGA_GPU_VRAM_MB',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'MTP_AUTOTUNE_RUNNING', 'JUN_LINK_CHECKED', 'ELECTRON_RUN_AS_NODE',
  // a PowerShell 7 window's module path breaks Windows PowerShell 5.1
  'PSModulePath'];
function freshEnv() {
  const env = { ...process.env };
  let keys = START_ENV.slice();
  try {
    for (const line of fs.readFileSync(path.join(JUN_HOME, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) keys.push(m[1]);
    }
  } catch (e) {}
  keys = new Set(keys.map(k => k.toUpperCase()));
  for (const k of Object.keys(env)) if (keys.has(k.toUpperCase())) delete env[k];
  return env;
}
const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function wakeServer() {
  if (woke || process.platform !== 'win32') return;
  const script = path.join(JUN_HOME, 'start.ps1');
  if (!fs.existsSync(script)) return;
  woke = true;
  try {
    wakeFiles = pickWakeFiles();
    const cmd = `Start-Process -FilePath 'powershell.exe' -WorkingDirectory ${psQuote(JUN_HOME)} -WindowStyle Hidden ` +
      `-RedirectStandardOutput ${psQuote(WAKE_LOG())} -RedirectStandardError ${psQuote(WAKE_ERR())} ` +
      `-ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ${psQuote('"' + script + '"')}, '-NoBrowser')`;
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')],
      { cwd: JUN_HOME, env: freshEnv(), windowsHide: true, stdio: 'ignore' });
    p.on('error', (e) => log('wake failed to start: ' + e.message));
    p.on('exit', (code) => { if (code) log('wake: Start-Process exited with ' + code); });
  } catch (e) { log('wake failed: ' + e.message); }
}

// the last lines start.ps1 printed, for "she didn't wake up"
function wakeTail() {
  const out = [];
  for (const f of [WAKE_LOG(), WAKE_ERR()]) {
    try {
      // her ✓/ℹ marks and the color codes mean nothing in a dialog
      const t = fs.readFileSync(f, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      out.push(...t.slice(-8));
    } catch (e) {}
  }
  return out.join('\n').slice(-900);
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
  const h = herPx();
  return { width: Math.round(Math.max(460, h * 1.45)), height: h + headroom() };
}

// her height in px on the monitor she's on (or will step out onto)
function herPx(display) {
  if (!display) display = displayFor(win && !win.isDestroyed() && winMode === 'stepout' ? win.getBounds() : null);
  return Math.max(110, Math.round(cfg.size * display.workArea.height));
}
// how big she is next to the size every px number was made for
const sizeK = () => herPx() / REF_PX;
// the room over her head shrinks with her, but never so far that the
// chat line and her bubbles have nowhere to go
const headroom = () => Math.round(HEADROOM * Math.max(0.8, Math.min(1.8, sizeK())));

// half her body's width, what has to stay on screen
const herHalf = () => herPx() * 0.2;

function floorY(display, height) {
  const wa = display.workArea;
  const feet = feetPx == null ? Math.round(herPx(display) * 0.04) : feetPx;
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
    if (Math.hypot(vx, vy) > THROW_MIN * Math.sqrt(sizeK())) { fly(vx, vy); return; }
  }
  // let go of her anywhere and she drops back down to the taskbar
  const range = stripRange(displayFor(b), b.width);
  const x = Math.round(Math.max(range.lo, Math.min(range.hi, b.x)));
  const target = floorAt(range.strip, x, b.width, b.height);
  let y = b.y, v = 0;
  const fallK = sizeK();
  stopFall();
  if (Math.abs(target - y) < 3) { win.setPosition(x, target); landed(x); return; }
  fall = setInterval(() => {
    if (!win || win.isDestroyed()) { stopFall(); return; }
    v += 2.2 * fallK;
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
  // a bigger Jun flies a bigger arc, a tiny one a tiny one: the same
  // throw feels the same at every size
  const k = sizeK();
  const cap = (v) => Math.max(-THROW_MAX * k, Math.min(THROW_MAX * k, v));
  let x = b.x, y = b.y, last = Date.now(), bounces = 0, past = 0;
  vx = cap(vx); vy = cap(vy);
  stopFall();
  send('jun:walk-state', { state: 'flying' });
  fall = setInterval(() => {
    if (!win || win.isDestroyed()) { stopFall(); return; }
    const now = Date.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    vy += GRAVITY * k * dt;
    vx *= Math.pow(0.6, dt);         // air slows her a little
    x += vx * dt;
    y += vy * dt;
    // a hard enough throw carries her part way off the screen
    if (x < lo && !past && vx < -EDGE_THROW * k) past = -1;
    if (x > hi && !past && vx > EDGE_THROW * k) past = 1;
    const l = past < 0 ? lo - herHalf() * 1.3 : lo, h = past > 0 ? hi + herHalf() * 1.3 : hi;
    if (x < l) { x = l; vx = Math.abs(vx) * 0.45; send('jun:walk-state', { state: 'bonk' }); }
    if (x > h) { x = h; vx = -Math.abs(vx) * 0.45; send('jun:walk-state', { state: 'bonk' }); }
    if (y < top) { y = top; vy = Math.abs(vy) * 0.4; }
    const floor = floorAt(strip, x, b.width, b.height);
    if (y >= floor) {
      y = floor;
      if (vy > 650 * k && bounces < 2) {
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
  // flown onto a monitor that's taller or shorter: same share of THIS screen
  if (winMode === 'stepout' && win && !win.isDestroyed() && Math.abs(win.getBounds().height - stepoutSize().height) > 2) setSize(cfg.size, true);
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
  // her steps grow with her; her speed a little less than that, so a
  // giant Jun doesn't race across the taskbar
  const k = sizeK();
  const hopPx = Math.max(0, Math.min(10, Number(opts.hop) || HOP_PX)) * Math.max(0.4, k);
  const walkPx = WALK_PX_PER_S * Math.pow(k, 0.6);
  const b = win.getBounds();
  const display = displayFor(b);
  const wa = display.workArea;
  const { strip, lo, hi } = stripRange(display, b.width);
  // mostly a stroll; now and then a long walk, which on more than one
  // monitor can take her over to the next screen
  const far = strip.length > 1 && Math.random() < 0.2;
  const span = Math.min(hi - lo, far ? wa.width * 0.9 : Math.max(180 * Math.min(1, k), wa.width * 0.35));
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
    const speed = walkPx * pace * Math.max(0.25, Math.min(1, gone / EASE_PX + 0.25, left / EASE_PX + 0.15));
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
function sendSettings() { send('jun:settings', { ...cfg.desk, ...sizeInfo() }); }
function sizeInfo() {
  return { size: cfg.size, herPx: herPx(), k: Math.round(sizeK() * 1000) / 1000, headroom: headroom() };
}

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
// her main window's Settings > Memory has a button for the saves tab
ipcMain.on('jun:open-settings', (e, tab) => {
  if (!fromWin(e)) return;
  openSettings(['saves', 'help', 'colors', 'feedback', 'spots', 'size'].includes(tab) ? tab : 'help');
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

// her size, from the settings window's "Her size" tab
ipcMain.handle('jun:size', (e, action, value) => {
  if (!fromSettings(e)) return null;
  if (action === 'set' || action === 'done') setSize(value, action === 'done');
  else if (action === 'growFx') { cfg.desk.growFx = !!value; saveCfg(); sendSettings(); }
  const display = displayFor(win && !win.isDestroyed() && winMode === 'stepout' ? win.getBounds() : null);
  return { size: cfg.size, min: SIZE_MIN, max: SIZE_MAX, quick: SIZES, screenPx: display.workArea.height,
    herPx: herPx(display), growFx: cfg.desk.growFx !== false, outside: winMode === 'stepout' };
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
      savesMenu(),
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
    { label: 'Headpat: her head follows your hand', submenu: radio('patFollow', PATFOLLOW_CHOICES) },
    { type: 'separator' },
    { label: 'Little sounds (steps, landing, squeaks)', type: 'checkbox', checked: !!cfg.desk.sounds, click: (i) => set('sounds', i.checked) },
    { label: 'Touch hints', submenu: [
      { label: 'Cursor icon and a soft glow', type: 'radio', checked: cfg.desk.hints !== 'cursor', click: () => set('hints', 'glow') },
      { label: 'Cursor icon only', type: 'radio', checked: cfg.desk.hints === 'cursor', click: () => set('hints', 'cursor') },
    ] },
    { label: 'Show touch spots (outlines on her)', type: 'checkbox', checked: !!cfg.desk.showSpots, click: (i) => set('showSpots', i.checked) },
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
  const near = (v) => Math.abs(cfg.size - v) < 0.012;
  return { label: 'Her size on the desktop', submenu: [
    ...Object.keys(SIZES).map(k => ({
      label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: near(SIZES[k]), click: () => setSize(SIZES[k], true),
    })),
    ...(Object.values(SIZES).some(near) ? [] : [{ label: `Your own (${Math.round(cfg.size * 100)}% of the screen)`, type: 'radio', checked: true, enabled: false }]),
    { type: 'separator' },
    { label: 'Any size you like…', click: () => openSettings('size') },
  ] };
}

// a new size: her window grows or shrinks around her feet, right
// where she stands, no reload. live = the slider, still moving
let sizeMenuTimer = null;
function setSize(v, done) {
  cfg.size = clampSize(v);
  if (win && !win.isDestroyed() && winMode === 'stepout' && !drag && !fall) {
    stopWalk();
    const b = win.getBounds();
    const display = displayFor(b);
    const size = stepoutSize();
    const cx = b.x + b.width / 2;
    const x = clampX(display, Math.round(cx - size.width / 2), size.width);
    // her old feet offset is for her old size: guess the new one until the page reports it
    if (feetPx != null) feetPx = Math.round(feetPx * size.height / Math.max(1, b.height));
    win.setBounds({ x: Math.round(x), y: restYFor(display, size.height), width: size.width, height: size.height });
    cfg.stepX = Math.round(x);
  }
  sendSettings();
  // her spots, the menus and the saved file only once he lets go of the slider
  clearTimeout(sizeMenuTimer);
  sizeMenuTimer = setTimeout(() => { saveCfg(); Props.rebuild(); rebuildMenus(); }, done ? 0 : 400);
}
function restYFor(display, height) {
  const y = Props.onSpot() ? Props.restY() : null;
  return y != null ? y : floorY(display, height);
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
    savesMenu(),
    { label: 'Get the latest update', enabled: !busy, click: () => updateFlow() },
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

// ---------------------------------------------------------------
// save points and the one-click update (desktop/saves.js does the
// files; this does the windows, the questions and the restarts).
// Settings window "Saves & updates" tab, the tray, the Jun menu.

let busy = '';
const shortErr = (t) => String(t || '').trim().split(/\r?\n/).filter(Boolean).slice(-6).join('\n').slice(0, 600);
const askParent = () => (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible() ? settingsWin : win && !win.isDestroyed() && winMode === 'window' && win.isVisible() ? win : null);
async function ask(opts) {
  const o = { title: 'Jun', icon: ICON_PNG, noLink: true, ...opts };
  const parent = askParent();
  return parent ? dialog.showMessageBox(parent, o) : dialog.showMessageBox(o);
}
function sayWhen(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function setBusy(what) {
  busy = what;
  rebuildMenus();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('jun:saves-changed', { busy });
}

// never a password prompt nobody can see: a hidden git waiting for
// one would just hang
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
function git(args, timeout = 60000) { return Saves.run('git', args, { cwd: JUN_HOME, timeout, env: GIT_ENV }); }
async function gitHead() {
  const r = await git(['rev-parse', '--short', 'HEAD'], 10000);
  return r.code ? '' : r.stdout.trim();
}

// her page's storage lives in runtime\desktop too: written to disk
// before a save copies it
async function flushStorage() {
  try { session.defaultSession.flushStorageData(); } catch (e) {}
  await sleep(400);
}

async function savesInfo() {
  const st = Saves.loadSettings(JUN_HOME);
  return {
    ...st, defaultDir: Saves.paths(JUN_HOME).defaultDir, keepChoices: Saves.KEEP_CHOICES, busy,
    saves: await Saves.listSaves(st.dir), windows: process.platform === 'win32',
  };
}

// kind: named | daily | before-restore | before-update
async function saveNow(name, kind = 'named') {
  const st = Saves.loadSettings(JUN_HOME);
  await flushStorage();
  const r = await Saves.makeSave({ home: JUN_HOME, dir: st.dir, name, kind, gitHead: await gitHead() });
  if (r.ok) await Saves.prune(st.dir, kind, kind === 'daily' ? st.keep : Saves.KEEP_AUTO[kind] || 0);
  return r;
}

let dailyRunning = false;
async function dailySave() {
  if (busy || dailyRunning) return;
  const st = Saves.loadSettings(JUN_HOME);
  const today = Saves.localDay();
  if (st.lastDaily === today) return;
  dailyRunning = true;
  try {
    if (!(await Saves.listSaves(st.dir)).some(s => s.kind === 'daily' && s.day === today)) {
      const r = await saveNow('', 'daily');
      if (!r.ok) { log('daily save failed: ' + r.error); return; }
    }
    Saves.writeSettings(JUN_HOME, { lastDaily: today });
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('jun:saves-changed', { busy });
  } finally { dailyRunning = false; }
}

function log(m) {
  try {
    const dir = path.join(JUN_HOME, 'runtime', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'desktop-saves.log'), `${new Date().toISOString()} ${m}\n`);
  } catch (e) {}
}

// start.ps1 stop, leaving this app (and its windows' processes) up
function stopServer() {
  if (process.platform !== 'win32') return Promise.resolve({ code: 0 });
  return Saves.run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(JUN_HOME, 'start.ps1'), 'stop', '-Keep', String(process.pid)],
    { cwd: JUN_HOME, timeout: 120000 });
}

// close everything she shows, so nothing writes while files change
function putHerToSleep(text) {
  quitting = true;
  stopWalk();
  try { Props.hide(); } catch (e) {}
  for (const w of BrowserWindow.getAllWindows()) if (w !== splash && !w.isDestroyed()) w.destroy();
  win = null;
  settingsWin = null;
  showSplash(text);
}

// this app closes and relaunch.js opens it again (when it's really
// gone), then the new start wakes her server like any other start
function relaunch() {
  try {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    const job = { pid: process.pid, home: JUN_HOME, exe: process.execPath, args: process.argv.slice(1) };
    spawn(process.execPath, [path.join(__dirname, 'relaunch.js'), JSON.stringify(job)],
      { cwd: JUN_HOME, env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) { log('relaunch failed: ' + e.message); }
  quitting = true;
  setTimeout(() => app.exit(0), 300);
}

async function goBack(file) {
  if (busy) return { ok: false, error: 'Jun is busy with ' + busy + '. Try again in a moment.' };
  let man;
  try { ({ man } = await Saves.readManifest(file)); } catch (e) { return { ok: false, error: "That file isn't a Jun save, or it's damaged." }; }
  const { response } = await ask({
    type: 'question', buttons: ['Go back to this save', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Go back to “${man.name}”?`,
    detail: `Saved ${sayWhen(man.created)}.\n\nHer chats, memories, bond, touches and desktop settings go back to how they were then. ` +
      'First Jun saves how she is right now ("Before going back"), so you can always undo this.\n\n' +
      'She closes for a moment and wakes up again. Her memories are locked with your password: if she asks you to sign in, use the password you had back then.',
  });
  if (response !== 0) return { ok: false, cancelled: true };
  setBusy('going back to a save');
  showSplash('Checking the save…');
  const check = await Saves.checkSave(JUN_HOME, file);
  if (!check.ok) { closeSplash(); setBusy(''); return { ok: false, error: check.error }; }
  showSplash('Saving how she is right now…');
  const safety = await saveNow(`Before going back to “${man.name}”`.slice(0, 80), 'before-restore');
  if (!safety.ok) {
    closeSplash(); setBusy('');
    return { ok: false, error: "Jun didn't go back, because she couldn't save how she is now first: " + safety.error };
  }
  cfgFrozen = true;
  putHerToSleep('Jun is closing her eyes for a moment…');
  const stop = await stopServer();
  if (stop.code) log('stop said: ' + shortErr(stop.stderr || stop.stdout));
  showSplash(`Going back to “${man.name}”…`);
  try {
    await Saves.restoreSave(JUN_HOME, file);
    Saves.writeNote(JUN_HOME, { kind: 'restore', name: man.name, created: man.created, safety: safety.manifest.name });
    log('went back to ' + file);
  } catch (e) {
    // the old state is still in place (restoreSave puts it back)
    log('going back failed: ' + e.message);
    Saves.writeNote(JUN_HOME, { kind: 'restore-failed', name: man.name, error: e.message });
  }
  showSplash('Waking her up…');
  relaunch();
  return { ok: true };
}

// ---- the update

async function checkUpdate() {
  const r0 = await git(['rev-parse', '--abbrev-ref', 'HEAD'], 15000);
  if (r0.err && r0.err.code === 'ENOENT') return { state: 'error', error: "Git isn't installed on this PC, so Jun can't get updates this way." };
  if (r0.code) return { state: 'error', error: "Jun's folder isn't a git copy, so she can't update this way.\n\n" + shortErr(r0.stderr) };
  const branch = r0.stdout.trim();
  if (branch !== 'jun-dev') return { state: 'error', error: `Jun is on “${branch}”, not “jun-dev”, so the update stopped to be safe. Nothing was changed.` };
  const up = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], 15000);
  if (up.code) return { state: 'error', error: "jun-dev isn't linked to your copy on GitHub, so Jun doesn't know where to get updates from. Nothing was changed." };
  const fetch = await git(['fetch', '--quiet'], 3 * 60 * 1000);
  if (fetch.code) return { state: 'error', error: "Jun couldn't reach GitHub. Check the internet and try again.\n\n" + shortErr(fetch.stderr) };
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const behind = Number((await git(['rev-list', '--count', 'HEAD..@{u}'])).stdout.trim()) || 0;
  const ahead = Number((await git(['rev-list', '--count', '@{u}..HEAD'])).stdout.trim()) || 0;
  const subjects = behind ? (await git(['log', '--format=%s', '-n', '10', 'HEAD..@{u}'])).stdout.trim().split(/\r?\n/).filter(Boolean) : [];
  const dirty = (await git(['status', '--porcelain', '--untracked-files=no'])).stdout.split(/\r?\n/).filter(Boolean).map(l => l.slice(3));
  return { state: behind ? 'available' : 'uptodate', head, behind, ahead, subjects, dirty };
}

async function updateFlow() {
  if (busy) { await ask({ type: 'info', message: 'Jun is busy with ' + busy + '. Try again in a moment.' }); return; }
  setBusy('checking for an update');
  let c;
  try { c = await checkUpdate(); } finally { setBusy(''); }
  if (c.state === 'error') { await ask({ type: 'warning', message: "Jun couldn't update", detail: c.error }); return; }
  if (c.state === 'uptodate') { await ask({ type: 'info', message: "You're up to date.", detail: 'Jun already has the latest version.' }); return; }
  if (c.ahead) {
    await ask({ type: 'warning', message: "Jun couldn't update", detail: "This PC has changes of its own on jun-dev that aren't on GitHub, so the update stopped to keep them safe. Nothing was changed." });
    return;
  }
  if (c.dirty.length) {
    await ask({ type: 'warning', message: "Jun couldn't update",
      detail: "Some of Jun's files were changed on this PC, so the update stopped to keep them safe. Nothing was changed.\n\n" + c.dirty.slice(0, 8).join('\n') + (c.dirty.length > 8 ? '\n…' : '') });
    return;
  }
  const list = c.subjects.map(s => '• ' + s).join('\n') + (c.behind > c.subjects.length ? `\n…and ${c.behind - c.subjects.length} more` : '');
  const { response } = await ask({
    type: 'question', buttons: ['Update now', 'Not now'], defaultId: 0, cancelId: 1,
    message: c.behind === 1 ? 'There is 1 new change for Jun.' : `There are ${c.behind} new changes for Jun.`,
    detail: list + '\n\nJun saves herself first ("Before an update"), then gets the update and restarts. It takes about as long as starting her.',
  });
  if (response !== 0) return;
  setBusy('updating');
  showSplash('Saving her first…');
  const safety = await saveNow('', 'before-update');
  if (!safety.ok) {
    closeSplash(); setBusy('');
    await ask({ type: 'warning', message: "Jun didn't update", detail: "She couldn't save herself first, so nothing was changed.\n\n" + safety.error });
    return;
  }
  showSplash('Getting the update…');
  const m = await git(['merge', '--ff-only', '@{u}'], 3 * 60 * 1000);
  if (m.code) {
    closeSplash(); setBusy('');
    log('update merge failed: ' + shortErr(m.stderr || m.stdout));
    await ask({ type: 'warning', message: "Jun couldn't update", detail: 'Git said:\n\n' + shortErr(m.stderr || m.stdout) + "\n\nShe's still running as before." });
    return;
  }
  const to = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  log(`updated ${c.head} -> ${to}`);
  Saves.writeNote(JUN_HOME, { kind: 'update', from: c.head, to, count: c.behind });
  putHerToSleep('Restarting Jun with her update…');
  try { await session.defaultSession.clearCache(); } catch (e) {}
  const stop = await stopServer();
  if (stop.code) log('stop said: ' + shortErr(stop.stderr || stop.stdout));
  relaunch();
}

// the update went in but she doesn't wake up: offer the version before
async function offerUndoUpdate(note) {
  closeSplash();
  const { response } = await ask({
    type: 'warning', buttons: ['Go back to the version before', 'Keep waiting'], defaultId: 0, cancelId: 1,
    message: "Jun didn't wake up after the update.",
    detail: 'Go back to the version she had before the update? Her memories and everything else stay as they are.',
  });
  if (response !== 0) return false;
  showSplash('Going back to the version before…');
  // --keep refuses to touch a file that was changed by hand
  const r = await git(['reset', '--keep', note.from], 60000);
  if (r.code) {
    closeSplash();
    await ask({ type: 'error', message: "Jun couldn't go back", detail: shortErr(r.stderr || r.stdout) });
    return false;
  }
  Saves.writeNote(JUN_HOME, { kind: 'update-undone', from: note.to, to: note.from });
  await stopServer();
  relaunch();
  return true;
}

async function afterRestart(note) {
  if (note.kind === 'restore') {
    await ask({ type: 'info', message: `Jun is back to “${note.name}”.`,
      detail: `Saved ${sayWhen(note.created)}. Changed your mind? “${note.safety || 'Before going back'}” in Saves & updates has how she was just before.` +
        '\n\nIf she asks you to sign in, use the password you had back then.' });
  } else if (note.kind === 'restore-failed') {
    await ask({ type: 'warning', message: "Jun couldn't go back to that save.", detail: "She's just as she was before.\n\n" + shortErr(note.error) });
  } else if (note.kind === 'update') {
    await ask({ type: 'info', message: 'Jun is up to date.', detail: (note.count === 1 ? '1 new change' : `${note.count} new changes`) + ' went in. If a page looks odd, press Ctrl+F5 in it.' });
  } else if (note.kind === 'update-undone') {
    await ask({ type: 'info', message: 'Jun is back on the version she had before the update.', detail: 'Tell Claude what happened, the update can be fixed and tried again.' });
  }
}

function savesMenu() {
  return { label: 'Saves & updates', submenu: [
    { label: 'Save Jun now…', enabled: !busy, click: () => openSettings('saves') },
    { label: 'Her saves (go back to one)…', click: () => openSettings('saves') },
    { type: 'separator' },
    { label: 'Get the latest update', enabled: !busy, click: () => updateFlow() },
  ] };
}

// the settings window's "Saves & updates" tab
ipcMain.handle('jun:saves', async (e, action, a) => {
  if (!fromSettings(e)) return null;
  if (action === 'save') {
    if (busy) return { ok: false, error: 'Jun is busy with ' + busy + '.' };
    setBusy('saving');
    try {
      const r = await saveNow(String(a || ''), 'named');
      return r.ok ? { ok: true, info: await savesInfo(), saved: r.manifest } : { ok: false, error: r.error };
    } finally { setBusy(''); }
  }
  if (action === 'restore') return goBack(String(a || ''));
  if (action === 'delete') {
    const st = Saves.loadSettings(JUN_HOME);
    const s = (await Saves.listSaves(st.dir)).find(x => x.file === a);
    if (!s) return { ok: false, error: 'That save is gone already.' };
    const { response } = await ask({ type: 'question', buttons: ['Delete', 'Cancel'], defaultId: 1, cancelId: 1,
      message: `Delete “${s.name}”?`, detail: `Saved ${sayWhen(s.created)}. This can't be undone.` });
    if (response !== 0) return { ok: false, cancelled: true };
    await Saves.removeSave(st.dir, s.file);
  } else if (action === 'pickDir') {
    const parent = askParent();
    const opts = { title: 'Where should Jun keep her saves?', properties: ['openDirectory', 'createDirectory'], defaultPath: Saves.loadSettings(JUN_HOME).dir };
    const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true };
    const why = Saves.checkDir(JUN_HOME, r.filePaths[0]);
    if (why) return { ok: false, error: why };
    Saves.writeSettings(JUN_HOME, { dir: r.filePaths[0] });
  } else if (action === 'resetDir') {
    Saves.writeSettings(JUN_HOME, { dir: '' });
  } else if (action === 'keep') {
    Saves.writeSettings(JUN_HOME, { keep: Number(a) });
    const st = Saves.loadSettings(JUN_HOME);
    await Saves.prune(st.dir, 'daily', st.keep);
  } else if (action === 'openDir') {
    const dir = Saves.loadSettings(JUN_HOME).dir;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e2) {}
    shell.openPath(dir);
  } else if (action === 'update') {
    updateFlow();
  }
  return { ok: true, info: await savesInfo() };
});
