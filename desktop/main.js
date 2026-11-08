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
const HEADROOM = 76;
const WALK_PX_PER_S = 70;
const DOZE_AFTER_S = 5 * 60;

app.setName('Jun');
try { app.setPath('userData', path.join(JUN_HOME, 'runtime', 'desktop')); } catch (e) {}
if (process.platform === 'win32') app.setAppUserModelId('JunOS.Desktop');

const CFG_FILE = () => path.join(app.getPath('userData'), 'desktop.json');
const DEFAULTS = {
  mode: 'window', inside: 'window', onTop: false, size: 'medium',
  window: null, compact: null, stepX: null, displayId: null, tipShown: false,
};
let cfg = { ...DEFAULTS };
function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
  if (!SIZES[cfg.size]) cfg.size = 'medium';
  if (!['window', 'compact', 'stepout'].includes(cfg.mode)) cfg.mode = 'window';
  if (!['window', 'compact'].includes(cfg.inside)) cfg.inside = 'window';
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

function stepoutSize() {
  const h = SIZES[cfg.size];
  return { width: Math.round(Math.max(380, h * 0.9)), height: h + HEADROOM };
}

function floorY(display, height) {
  const wa = display.workArea;
  const feet = feetPx == null ? Math.round(SIZES[cfg.size] * 0.04) : feetPx;
  return wa.y + wa.height - height + feet;
}

function clampX(display, x, width) {
  // her body is the middle third of the window, keep THAT on screen
  const wa = display.workArea;
  return Math.max(wa.x - width * 0.3, Math.min(x, wa.x + wa.width - width * 0.7));
}

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
    w = new BrowserWindow({ ...common, ...b, minWidth: 420, minHeight: 480, backgroundColor: '#0f0d1f', autoHideMenuBar: true });
    w.setMenuBarVisibility(false);
    w.setAlwaysOnTop(!!cfg.onTop);
    if (cfg.windowMax) w.maximize();
    w.loadURL(JUN_URL + '/index.html');
  } else if (mode === 'compact') {
    const size = { width: 380, height: 600 };
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
  });
  // a server that went away mid-session: keep trying, don't leave
  // a dead white window
  w.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;
    setTimeout(() => { if (!w.isDestroyed()) w.loadURL(url); }, 3000);
  });
  guardNavigation(w, mode);
  if (mode !== 'window') setClickThrough(w, true);

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
    // the X hides her to the tray. Quit is in the tray menu
    if (quitting || w !== win) return;
    e.preventDefault();
    w.hide();
    if (!cfg.tipShown && tray && process.platform === 'win32') {
      cfg.tipShown = true;
      saveCfg();
      tray.displayBalloon({ iconType: 'info', title: 'Jun is still here',
        content: 'She stays in the tray by the clock. Click it to bring her back.' });
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
  if (winMode === 'stepout') win.showInactive(); else { win.show(); win.focus(); }
}

function hideJun() {
  stopWalk();
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
  if (!win || win.isDestroyed() || winMode === 'window') return;
  stopWalk();
  stopFall();
  const c = screen.getCursorScreenPoint();
  const b = win.getBounds();
  drag = { dx: c.x - b.x, dy: c.y - b.y, timer: setInterval(() => {
    if (!win || win.isDestroyed()) { stopDrag(); return; }
    const p = screen.getCursorScreenPoint();
    win.setPosition(p.x - drag.dx, p.y - drag.dy);
  }, 16) };
}

function stopDrag() {
  if (!drag) return false;
  clearInterval(drag.timer);
  drag = null;
  return true;
}

function endDrag() {
  if (!stopDrag() || !win || win.isDestroyed()) return;
  const b = win.getBounds();
  if (winMode === 'compact') { cfg.compact = { x: b.x, y: b.y }; saveCfg(); return; }
  // let go of her anywhere and she drops back down to the taskbar
  const display = displayFor(b);
  cfg.displayId = display.id;
  const x = Math.round(clampX(display, b.x, b.width));
  const target = floorY(display, b.height);
  let y = b.y, v = 0;
  stopFall();
  if (Math.abs(target - y) < 3) { win.setPosition(x, target); landed(x); return; }
  fall = setInterval(() => {
    if (!win || win.isDestroyed()) { stopFall(); return; }
    v += 2.2;
    y = y < target ? Math.min(target, y + v) : Math.max(target, y - 18);
    win.setPosition(x, Math.round(y));
    if (y === target) { stopFall(); landed(x); }
  }, 16);
}

function stopFall() { if (fall) { clearInterval(fall); fall = null; } }

function landed(x) {
  cfg.stepX = x;
  saveCfg();
  send('jun:walk-state', { state: 'landed' });
}

function startWander() {
  if (!win || win.isDestroyed() || winMode !== 'stepout' || drag || fall) return;
  const b = win.getBounds();
  const display = displayFor(b);
  const wa = display.workArea;
  const lo = clampX(display, -Infinity, b.width), hi = clampX(display, Infinity, b.width);
  // a stroll, not a sprint across three monitors
  const span = Math.min(hi - lo, Math.max(180, wa.width * 0.35));
  let to = b.x + (Math.random() < 0.5 ? -1 : 1) * (span * (0.4 + Math.random() * 0.6));
  if (to < lo || to > hi) to = b.x - (to - b.x);
  to = Math.max(lo, Math.min(hi, to));
  if (Math.abs(to - b.x) < 40) { send('jun:walk-state', { state: 'stopped' }); return; }
  stopWalk();
  const dir = to > b.x ? 1 : -1;
  const baseY = floorY(display, b.height);
  let x = b.x, t = 0, last = Date.now();
  send('jun:walk-state', { state: 'walking', dir });
  walk = setInterval(() => {
    if (!win || win.isDestroyed()) { stopWalk(); return; }
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    x += dir * WALK_PX_PER_S * dt;
    const done = dir > 0 ? x >= to : x <= to;
    if (done) x = to;
    // a little bounce in each step
    const bob = Math.round(Math.abs(Math.sin(t * Math.PI * 2.4)) * -3);
    win.setPosition(Math.round(x), baseY + (done ? 0 : bob));
    if (done) {
      stopWalk();
      cfg.stepX = Math.round(x);
      saveCfg();
      send('jun:walk-state', { state: 'stopped' });
    }
  }, 33);
}

function stopWalk() {
  if (!walk) return;
  clearInterval(walk);
  walk = null;
  if (win && !win.isDestroyed() && winMode === 'stepout') {
    const b = win.getBounds();
    win.setPosition(b.x, floorY(displayFor(b), b.height));
  }
}

// ---------------------------------------------------------------
// idle: she dozes off when he's been away from the keyboard

let lastIdle = 0;
function pollIdle() {
  let s = 0;
  try { s = powerMonitor.getSystemIdleTime(); } catch (e) { return; }
  if (s >= DOZE_AFTER_S || lastIdle >= DOZE_AFTER_S || Math.abs(s - lastIdle) > 20) sendIdle(s);
  lastIdle = s;
}
function sendIdle(s) { send('jun:idle', { seconds: s, dozeAfter: DOZE_AFTER_S }); }

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
    win.setPosition(b.x, floorY(displayFor(b), b.height));
  }
});
ipcMain.on('jun:walk', (e, what) => {
  if (!fromWin(e)) return;
  if (what === 'wander') startWander(); else stopWalk();
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
// tray

function trayIcon() {
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
  if (fromHer) items.push({ type: 'separator' }, { label: 'Hide her', click: hideJun });
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
    { label: 'Keep her window on top', type: 'checkbox', checked: !!cfg.onTop, click: (i) => {
      cfg.onTop = i.checked;
      saveCfg();
      if (win && winMode === 'window') win.setAlwaysOnTop(cfg.onTop);
    } },
    { label: 'Her size on the desktop', submenu: Object.keys(SIZES).map(k => ({
      label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: cfg.size === k, click: () => {
        cfg.size = k;
        saveCfg();
        if (winMode === 'stepout') openMode('stepout', '');
      },
    })) },
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
