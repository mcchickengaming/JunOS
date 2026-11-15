// Hide / Unhide Jun (#29) and the plan for her house cube. NO electron in here: main.js passes in what it
// needs, so .github/scripts/js/presence.test.mjs runs all of it in plain node.
//
//   instant hide   one hotkey (desk.hideKey, default Ctrl+Alt+J): gone in a frame, no animation, no sound, no
//                  popup. The same key brings her back. She never sulks about it (it may be an emergency).
//   polite hide    the same key with Shift (or the tray): she waves and walks off the edge of the screen, then hides.
//   auto-hide      fullscreen apps (games, videos, presentations: desk.autoHide, default on) while she's on the
//                  desktop or compact. She comes back by herself when it ends, unless he hid her on purpose.
//   screen shares  desk.shareHide (default on): her desktop windows are left out of screen shares and recordings
//                  (Windows "exclude from capture"), so she stays on HIS screen and never shows on a call.
//   while hidden   she keeps living (her needs and feelings move on by the clock, feel/store.js); she starts
//                  nothing (the page reads `hidden` and its initiative ticks stop).
//   coming back    how long and why she was hidden decide her welcome (webapp/js/desktop/welcome-back.js); never upset.
'use strict';

// the hotkeys he can pick (Electron accelerator names). Shift + the same key = the polite one
const HIDE_KEYS = [
  ['Ctrl+Alt+J', 'Ctrl + Alt + J'],
  ['Ctrl+Alt+H', 'Ctrl + Alt + H'],
  ['Ctrl+Alt+Space', 'Ctrl + Alt + Space'],
  ['Pause', 'Pause / Break'],
  ['Ctrl+Alt+F12', 'Ctrl + Alt + F12'],
  ['off', 'No hotkey'],
];
const politeKey = (key) => (key && key !== 'off' ? (key.includes('+') ? key.replace(/^((?:Ctrl|Alt)\+)+/, (m) => m + 'Shift+') : 'Shift+' + key) : null);

// why she's hidden: the words for "Why is she hidden?" and how the welcome reads it
const WHY = {
  hotkey: 'you pressed the hide key',
  polite: 'she waved goodbye',
  tray: 'you hid her from the tray',
  menu: 'you hid her from a menu',
  fullscreen: 'something was fullscreen',
  close: 'you closed her window',
};
const DESK_MODES = ['stepout', 'compact'];

// the hide state. now() is injectable for the tests
function create({ now = () => Date.now() } = {}) {
  let hidden = null;          // { why, at, mode }
  let fsOverride = false;     // he brought her back DURING a fullscreen app: no auto-hide until it ends
  return {
    get hidden() { return hidden; },
    isHidden: () => !!hidden,
    // returns true if this changed anything
    hide(why = 'hotkey', mode = null) {
      if (hidden) { if (why !== 'fullscreen' && hidden.why === 'fullscreen') hidden.why = why; return false; }
      hidden = { why: WHY[why] ? why : 'menu', at: now(), mode };
      return true;
    },
    // → { awayMs, why, by } for her welcome, or null if she wasn't hidden
    unhide(by = 'hotkey', { fullscreen = false } = {}) {
      if (!hidden) return null;
      const out = { awayMs: Math.max(0, now() - hidden.at), why: hidden.why, by };
      if (fullscreen && by !== 'fullscreen') fsOverride = true;
      hidden = null;
      return out;
    },
    // the fullscreen watcher's answer → 'hide' | 'show' | null
    autoDecide({ fullscreen, mode, autoOn }) {
      if (!fullscreen) fsOverride = false;
      if (hidden && hidden.why === 'fullscreen') return !fullscreen || !autoOn || !DESK_MODES.includes(mode) ? 'show' : null;
      if (hidden || !autoOn || fsOverride || !fullscreen || !DESK_MODES.includes(mode)) return null;
      return 'hide';
    },
    words() { return hidden ? WHY[hidden.why] || 'she is hidden' : null; },
  };
}

// ---------------------------------------------------------------
// the fullscreen watcher (Windows): a small PowerShell loop asks Windows, every 1.5 s, two things it answers without
// looking at anything on screen: "is a fullscreen app / presentation / game running?" (SHQueryUserNotificationState)
// and "does the window in front cover its whole monitor?" (its size only). Never window titles, never pixels.
// It prints "<state> <covers 0|1> <pid>" when that changes, and quits when the app does.
const WATCH_PS = (parentPid) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class JunFs {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT mon; public RECT work; public uint flags; }
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Read() {
    int s = 0; SHQueryUserNotificationState(out s);
    IntPtr h = GetForegroundWindow(); uint pid = 0; int covers = 0;
    if (h != IntPtr.Zero) {
      GetWindowThreadProcessId(h, out pid);
      var c = new StringBuilder(64); GetClassName(h, c, 64); string cls = c.ToString();
      bool desk = cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd";
      RECT r; MI mi = new MI(); mi.cb = Marshal.SizeOf(typeof(MI));
      if (!desk && GetWindowRect(h, out r) && GetMonitorInfo(MonitorFromWindow(h, 2), ref mi))
        covers = (r.L <= mi.mon.L && r.T <= mi.mon.T && r.R >= mi.mon.R && r.B >= mi.mon.B) ? 1 : 0;
    }
    return s + " " + covers + " " + pid;
  }
}
"@
$last = ''
while ($true) {
  if (-not (Get-Process -Id ${Number(parentPid) || 0} -ErrorAction SilentlyContinue)) { exit }
  $now = [JunFs]::Read()
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  Start-Sleep -Milliseconds 1500
}
`;
// one line of the watcher → is something fullscreen that isn't her? ourPids = the app's own processes
// QUNS: 2 busy (a fullscreen app), 3 a Direct3D fullscreen game, 4 presentation mode
function readWatchLine(line, ourPids = []) {
  const txt = String(line || '').trim();
  if (!/^\d+ [01] \d+$/.test(txt)) return null;
  const [s, covers, pid] = txt.split(' ').map(Number);
  if (pid && ourPids.includes(pid)) return { fullscreen: false, state: s, pid, mine: true };
  return { fullscreen: s === 2 || s === 3 || s === 4 || covers === 1, state: s, pid };
}
function startWatcher({ spawn, parentPid, onLine, log = () => {} }) {
  if (process.platform !== 'win32' || !spawn) return null;
  const cmd = Buffer.from(WATCH_PS(parentPid), 'utf16le').toString('base64');
  let p;
  try {
    p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-EncodedCommand', cmd], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { log('fullscreen watcher did not start: ' + e.message); return null; }
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onLine(line); }
  });
  p.on('exit', (code) => log('fullscreen watcher stopped (' + code + ')'));
  return p;
}

// ---------------------------------------------------------------
// the house cube (going inside / coming out from the desktop): where the house goes and how long each beat takes.
// She tosses her house (packed into a little cube, data/house-cube in webapp/js/desktop/house-cube.js) beside her, it
// bounces, lights up, shows a hologram of the house, the house materializes, she opens the door and walks in, and her
// window opens out of the door. Coming out plays it the other way round.
const HOUSE = {
  w: 1.15, h: 1.0,           // the house, in her heights
  gap: 0.15,                 // how far past her side the door is, in her heights
  door: { x: 0.5, w: 0.2, h: 0.42 },   // the door: middle of the house, share of the house
  beats: { toss: 650, bounce: 700, light: 450, holo: 900, build: 1100, open: 450, walk: 0, enter: 500, grow: 520, fade: 450 },
  minSpace: 1.1,             // the room it needs beside her, in her heights (else she just goes in)
};
// her = her window bounds, herPx = her height, wa = the work area of her monitor → { house, door, side, overlay } or
// null when there's no room (she goes in the plain way)
function housePlan({ her, herPx, wa, prefer = 0 }) {
  const w = Math.round(herPx * HOUSE.w), h = Math.round(herPx * HOUSE.h), gap = Math.round(herPx * HOUSE.gap);
  const herMid = her.x + her.width / 2;
  const leftRoom = herMid - herPx * 0.3 - wa.x, rightRoom = wa.x + wa.width - (herMid + herPx * 0.3);
  const need = herPx * HOUSE.minSpace;
  let side = prefer || (rightRoom >= leftRoom ? 1 : -1);
  if ((side > 0 ? rightRoom : leftRoom) < need) side = -side;
  if ((side > 0 ? rightRoom : leftRoom) < need) return null;
  const floor = wa.y + wa.height;
  // the door a short walk from her (the house may stand partly behind her: she's drawn in front of it)
  const doorMid = herMid + side * herPx * (0.3 + HOUSE.gap);
  const x = Math.round(doorMid - w * HOUSE.door.x);
  const house = { x, y: floor - h, width: w, height: h };
  const dw = Math.round(w * HOUSE.door.w), dh = Math.round(h * HOUSE.door.h);
  const door = { x: Math.round(x + w * HOUSE.door.x - dw / 2), y: floor - dh, width: dw, height: dh };
  // one see-through, click-through window over her and the house, for the cube's flight and the hologram
  const left = Math.min(her.x, house.x) - 20, right = Math.max(her.x + her.width, house.x + w) + 20;
  const top = Math.min(her.y, house.y - Math.round(herPx * 0.35));
  const overlay = { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(floor - top) };
  // where her hand is when she throws, and where she stands at the door (her window's x)
  const hand = { x: Math.round(herMid + side * herPx * 0.18), y: Math.round(her.y + her.height - herPx * 0.55) };
  const standX = Math.round(door.x + door.width / 2 - her.width / 2);
  return { side, house, door, overlay, hand, standX };
}
// the beats in order with their start times (ms from the toss), so main.js and the page agree
function houseTimeline(dir = 'in', speed = 1, walkMs = 0) {
  const b = HOUSE.beats, k = Math.max(0.4, Math.min(2.5, Number(speed) || 1));
  const order = dir === 'in' ? ['toss', 'bounce', 'light', 'holo', 'build', 'open', 'walk', 'enter', 'grow', 'fade'] : ['shrink', 'build', 'open', 'out', 'close', 'pack', 'catch'];
  const len = { ...b, shrink: b.grow, out: b.enter, close: b.open, pack: b.build * 0.8, catch: b.toss };
  // the drawing waits at the end of these beats until main.js says the next window is up ("resume")
  const wait = dir === 'in' ? 'enter' : 'out';
  let t = 0;
  const out = [];
  for (const id of order) {
    // her walk to the door goes at her own pace, whatever the speed setting
    const ms = id === 'walk' ? Math.max(0, Math.round(Number(walkMs) || 0)) : Math.round(len[id] / k);
    out.push({ id, at: t, ms, ...(id === wait ? { wait: true } : {}) });
    t += ms;
  }
  return { beats: out, total: t };
}
// easing a window open out of the door: the bounds at f = 0..1
function growBounds(from, to, f) {
  const e = f <= 0 ? 0 : f >= 1 ? 1 : 1 - Math.pow(1 - f, 3);
  const lerp = (a, b) => Math.round(a + (b - a) * e);
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), width: Math.max(1, lerp(from.width, to.width)), height: Math.max(1, lerp(from.height, to.height)) };
}

module.exports = { HIDE_KEYS, politeKey, WHY, DESK_MODES, create, WATCH_PS, readWatchLine, startWatcher, HOUSE, housePlan, houseTimeline, growBounds };
