// things on the desktop that aren't her: her spots (a cushion, a dog
// bed, a beanbag, a little armchair) and a ball to play fetch with.
// each is its own small see-through window, like her.
//
// a spot is TWO windows over the same box: the back part sits behind
// her and the front part in front of her, so she looks like she's IN
// the bed rather than pasted over it. the front one never takes clicks.
//
// "stay" is the point of a spot: while she has one she goes there and
// stays put, out of the way of whatever he's doing, until he picks her
// up or sets her free. main.js asks props before it lets her wander.

const { BrowserWindow, screen } = require('electron');
const path = require('path');

// sizes are fractions of her height on the desktop. seat: how deep
// her feet sink into it (0 top .. 1 bottom); the front part hides
// what's below that line
const TYPES = {
  cushion: { label: 'Cushion', w: 0.62, h: 0.16, sink: 0.82, back: false, colors: ['#e86aa6', '#ffd1e6'] },
  bed: { label: 'Dog bed', w: 0.8, h: 0.27, sink: 0.86, back: true, colors: ['#6a5acd', '#d9d2ff'] },
  beanbag: { label: 'Beanbag', w: 0.7, h: 0.34, sink: 0.9, back: true, colors: ['#ff9f43', '#ffe0b8'] },
  chair: { label: 'Little armchair', w: 0.66, h: 0.5, sink: 0.93, back: true, colors: ['#2e86de', '#cfe6ff'] },
};

let ctx = null;
const live = new Map();      // spot id -> { back, front }
let onSpotId = null;         // the spot she's sitting on right now
let ball = null;             // { win, x, y, vx, vy, timer, chases }
let zTimer = null;
let returnTimer = null;
let shown = false;

function init(context) {
  ctx = context;
  ctx.cfg.spots = Array.isArray(ctx.cfg.spots) ? ctx.cfg.spots.filter(s => TYPES[s.type]) : [];
  zTimer = setInterval(zOrder, 1500);
}

const unit = () => ctx.herHeight();
function boxOf(spot) {
  const t = TYPES[spot.type];
  return { x: Math.round(spot.x), y: Math.round(spot.y), width: Math.round(unit() * t.w), height: Math.round(unit() * t.h) };
}

function pageUrl(file, q) {
  return 'file://' + path.join(__dirname, file).replace(/\\/g, '/') + '?' + new URLSearchParams(q).toString();
}

function makeWindow(box, file, q, clickable) {
  const w = new BrowserWindow({
    ...box, frame: false, transparent: true, resizable: false, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: true, focusable: clickable, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'prop-preload.js'), contextIsolation: true, sandbox: true },
  });
  w.setIgnoreMouseEvents(true, clickable ? { forward: true } : undefined);
  w.loadURL(pageUrl(file, q));
  w.once('ready-to-show', () => { if (shown) w.showInactive(); zOrder(); });
  return w;
}

function spotQuery(spot, part) {
  const t = TYPES[spot.type];
  return { type: spot.type, part, main: spot.colors?.[0] || t.colors[0], trim: spot.colors?.[1] || t.colors[1] };
}

function build(spot) {
  destroy(spot.id);
  const box = boxOf(spot);
  const t = TYPES[spot.type];
  // the back takes the clicks (drag it, right-click it). a cushion has
  // no back, its front does that job and still sits in front of her
  const grab = t.back ? makeWindow(box, 'spot.html', spotQuery(spot, 'back'), true) : null;
  const front = makeWindow(box, 'spot.html', spotQuery(spot, 'front'), !t.back);
  live.set(spot.id, { back: grab, front, handle: grab || front });
}

function destroy(id) {
  const l = live.get(id);
  if (!l) return;
  for (const w of [l.back, l.front]) if (w && !w.isDestroyed()) w.destroy();
  live.delete(id);
}

function spotById(id) { return ctx.cfg.spots.find(s => s.id === id); }
function spotByContents(wc) {
  for (const [id, l] of live) if ((l.back && l.back.webContents === wc) || (l.front && l.front.webContents === wc)) return spotById(id);
  return null;
}

// ---------------------------------------------------------------
// showing and stacking

function show() {
  shown = true;
  for (const s of ctx.cfg.spots) if (!live.has(s.id)) build(s);
  for (const l of live.values()) for (const w of [l.back, l.front]) if (w && !w.isDestroyed()) w.showInactive();
  if (ball && !ball.win.isDestroyed()) ball.win.showInactive();
  zOrder();
}

// her size changed: the spots scale with her
function rebuild() {
  for (const id of [...live.keys()]) destroy(id);
  if (shown) show();
  const s = onSpotId && spotById(onSpotId);
  if (s) setTimeout(() => seat(s), 300);
}

function hide() {
  shown = false;
  onSpotId = null;
  for (const l of live.values()) for (const w of [l.back, l.front]) if (w && !w.isDestroyed()) w.hide();
  if (ball && !ball.win.isDestroyed()) ball.win.hide();
}

// back parts, then her, then front parts (all "on top" windows, so the
// last one raised is in front). Windows reshuffles them when she gets
// clicked, so this runs again every so often
function zOrder() {
  if (!shown) return;
  const her = ctx.getWin();
  for (const l of live.values()) if (l.back && !l.back.isDestroyed()) l.back.moveTop();
  if (her && !her.isDestroyed() && her.isVisible()) her.moveTop();
  for (const l of live.values()) if (l.front && !l.front.isDestroyed()) l.front.moveTop();
  if (ball && !ball.win.isDestroyed()) ball.win.moveTop();
}

// ---------------------------------------------------------------
// adding, moving, coloring, removing

function add(type) {
  if (!TYPES[type]) return;
  const her = ctx.getWin();
  const hb = her && !her.isDestroyed() ? her.getBounds() : null;
  const display = hb ? screen.getDisplayMatching(hb) : screen.getPrimaryDisplay();
  const wa = display.workArea;
  const t = TYPES[type];
  const w = unit() * t.w, h = unit() * t.h;
  // a free bit of taskbar, away from her
  let x = hb && hb.x + hb.width / 2 > wa.x + wa.width / 2 ? wa.x + 40 : wa.x + wa.width - w - 40;
  x += (ctx.cfg.spots.length % 3) * (w + 20) * (x < wa.x + wa.width / 2 ? 1 : -1);
  const spot = { id: 's' + Date.now().toString(36), type, x, y: wa.y + wa.height - h, colors: [...t.colors] };
  ctx.cfg.spots.push(spot);
  ctx.saveCfg();
  if (shown) build(spot);
  ctx.menusChanged();
}

function remove(id) {
  if (onSpotId === id) leave();
  destroy(id);
  ctx.cfg.spots = ctx.cfg.spots.filter(s => s.id !== id);
  if (ctx.cfg.stay === id) ctx.cfg.stay = null;
  ctx.saveCfg();
  ctx.menusChanged();
}

function setColor(id, index, hex) {
  const spot = spotById(id);
  if (!spot || (index !== 0 && index !== 1)) return;
  const t = TYPES[spot.type];
  spot.colors = spot.colors || [...t.colors];
  spot.colors[index] = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : t.colors[index];
  ctx.saveCfg();
  const l = live.get(id);
  if (l) for (const [w, part] of [[l.back, 'back'], [l.front, 'front']]) {
    if (w && !w.isDestroyed()) w.webContents.send('prop:colors', spotQuery(spot, part));
  }
}

function list() {
  return ctx.cfg.spots.map(s => ({ id: s.id, type: s.type, label: TYPES[s.type].label, colors: s.colors || TYPES[s.type].colors,
    defaults: TYPES[s.type].colors, stay: ctx.cfg.stay === s.id }));
}
function types() { return Object.entries(TYPES).map(([k, t]) => ({ type: k, label: t.label })); }

// dragging a spot (or the ball) around, same cursor polling as her
let propDrag = null;
function dragStart(wc) {
  const spot = spotByContents(wc);
  const target = spot ? live.get(spot.id) : (ball && ball.win.webContents === wc ? ball : null);
  if (!target) return;
  const handle = spot ? target.handle : ball.win;
  if (!spot) stopBall();
  const c = screen.getCursorScreenPoint();
  const b = handle.getBounds();
  const hist = [];
  propDrag = { spot, dx: c.x - b.x, dy: c.y - b.y, hist, timer: setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const x = p.x - propDrag.dx, y = p.y - propDrag.dy;
    const now = Date.now();
    hist.push({ x: p.x, y: p.y, t: now });
    while (hist.length > 2 && now - hist[0].t > 100) hist.shift();
    if (spot) moveSpot(spot, x, y); else ball.win.setPosition(Math.round(x), Math.round(y));
  }, 16) };
}

function dragEnd() {
  if (!propDrag) return;
  clearInterval(propDrag.timer);
  const { spot, hist } = propDrag;
  propDrag = null;
  if (spot) { ctx.saveCfg(); return; }
  // the ball: let go while moving and it flies
  let vx = 0, vy = 0;
  if (hist.length >= 2) {
    const a = hist[0], z = hist[hist.length - 1];
    const dt = Math.max(16, z.t - a.t) / 1000;
    vx = (z.x - a.x) / dt;
    vy = (z.y - a.y) / dt;
  }
  throwBall(vx, vy, true);
}

function moveSpot(spot, x, y) {
  spot.x = x;
  spot.y = y;
  const l = live.get(spot.id);
  const box = boxOf(spot);
  if (l) for (const w of [l.back, l.front]) if (w && !w.isDestroyed()) w.setBounds(box);
  // she rides along when it's her spot
  if (onSpotId === spot.id) seat(spot);
}

// ---------------------------------------------------------------
// sitting on a spot

function seatPos(spot) {
  const her = ctx.getWin();
  const hb = her.getBounds();
  const box = boxOf(spot);
  const t = TYPES[spot.type];
  return {
    x: Math.round(box.x + box.width / 2 - hb.width / 2),
    y: Math.round(box.y + box.height * t.sink - hb.height + ctx.feet()),
  };
}

function seat(spot) {
  const her = ctx.getWin();
  if (!her || her.isDestroyed()) return;
  const p = seatPos(spot);
  her.setPosition(p.x, p.y);
}

// she hops over in an arc and settles in
function goTo(id) {
  const spot = spotById(id);
  const her = ctx.getWin();
  if (!spot || !her || her.isDestroyed() || ctx.getMode() !== 'stepout' || ctx.isBusy()) return false;
  if (onSpotId === id) return true;
  ctx.stopWalk();
  const from = her.getBounds();
  const to = seatPos(spot);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const T = Math.max(450, Math.min(1100, dist * 0.9));
  const arc = 70 + Math.min(160, dist * 0.12);
  const t0 = Date.now();
  let lastX = from.x, lastY = from.y, lastT = t0;
  onSpotId = null;
  ctx.send('jun:walk-state', { state: 'flying' });
  ctx.setHop(setInterval(() => {
    if (!her || her.isDestroyed()) { ctx.setHop(null); return; }
    const now = Date.now();
    const k = Math.min(1, (now - t0) / T);
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * arc;
    her.setPosition(Math.round(x), Math.round(y));
    const dt = Math.max(1, now - lastT) / 1000;
    ctx.send('jun:fly', { vx: (x - lastX) / dt, vy: (y - lastY) / dt });
    lastX = x; lastY = y; lastT = now;
    if (k >= 1) {
      ctx.setHop(null);
      onSpotId = id;
      seat(spot);
      zOrder();
      ctx.send('jun:walk-state', { state: 'onspot', kind: spot.type });
    }
  }, 16));
  return true;
}

function leave() {
  if (!onSpotId) return;
  onSpotId = null;
  ctx.send('jun:walk-state', { state: 'offspot' });
}

function stay(id) {
  ctx.cfg.stay = id && spotById(id) ? id : null;
  ctx.saveCfg();
  clearTimeout(returnTimer);
  if (ctx.cfg.stay) goTo(ctx.cfg.stay);
  else leave();
  ctx.menusChanged();
}

// she was picked up off her spot and put down somewhere else. if she
// has a spot to stay on, she heads back after a while
function afterLanding(bounds) {
  clearTimeout(returnTimer);
  // dropped right onto a spot: she sits in it, and it becomes hers
  const cx = bounds.x + bounds.width / 2, feetY = bounds.y + bounds.height - ctx.feet();
  for (const s of ctx.cfg.spots) {
    const b = boxOf(s);
    if (cx > b.x && cx < b.x + b.width && feetY > b.y - 60 && feetY < b.y + b.height + 30) {
      ctx.cfg.stay = s.id;
      ctx.saveCfg();
      ctx.menusChanged();
      goTo(s.id);
      return true;
    }
  }
  if (ctx.cfg.stay) returnTimer = setTimeout(() => goTo(ctx.cfg.stay), 20000);
  return false;
}

// main.js: may she wander off? and the y she rests at
function onSpot() { return !!onSpotId; }
function wantsSpot() {
  if (ctx.cfg.stay && !onSpotId && spotById(ctx.cfg.stay)) { goTo(ctx.cfg.stay); return true; }
  return false;
}
function restY() {
  const s = onSpotId && spotById(onSpotId);
  return s ? seatPos(s).y : null;
}

// ---------------------------------------------------------------
// the ball

function spawnBall() {
  const her = ctx.getWin();
  if (!her || her.isDestroyed()) return;
  const size = Math.round(Math.max(28, unit() * 0.08));
  const hb = her.getBounds();
  const c = screen.getCursorScreenPoint();
  if (!ball || ball.win.isDestroyed()) {
    const win = makeWindow({ x: c.x - size / 2, y: c.y - size / 2, width: size, height: size }, 'ball.html', {}, true);
    ball = { win, size, chases: 0, timer: null };
    win.on('closed', () => { if (ball && ball.win === win) ball = null; });
  }
  ball.win.setPosition(Math.round(c.x - size / 2), Math.round(c.y - size / 2));
  if (shown) ball.win.showInactive();
  // tossed toward her side of the screen
  const dir = hb.x + hb.width / 2 > c.x ? 1 : -1;
  throwBall(dir * (500 + Math.random() * 400), -700, true);
}

function removeBall() {
  stopBall();
  if (ball && !ball.win.isDestroyed()) ball.win.destroy();
  ball = null;
}

function stopBall() { if (ball && ball.timer) { clearInterval(ball.timer); ball.timer = null; } }

function throwBall(vx, vy, byHim) {
  if (!ball || ball.win.isDestroyed()) return;
  stopBall();
  if (byHim) ball.chases = 0;
  const b = ball.win.getBounds();
  const display = screen.getDisplayMatching(b);
  const range = ctx.stripRange(display, b.width);
  // the ball can go right to the edges, it's not her
  const lo = range.strip[0].workArea.x, hi = range.strip[range.strip.length - 1].workArea.x
    + range.strip[range.strip.length - 1].workArea.width - b.width;
  let x = b.x, y = b.y, last = Date.now();
  vx = Math.max(-3000, Math.min(3000, vx));
  vy = Math.max(-3000, Math.min(3000, vy));
  ball.timer = setInterval(() => {
    if (!ball || ball.win.isDestroyed()) { stopBall(); return; }
    const now = Date.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    // the taskbar under the ball (floorAt is for a window with feet, the ball has none)
    const ground = ctx.floorAt(range.strip, x, b.width, b.height) - ctx.feet();
    vy += 2400 * dt;
    x += vx * dt;
    y += vy * dt;
    if (x < lo) { x = lo; vx = Math.abs(vx) * 0.7; }
    if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.7; }
    if (y >= ground) {
      y = ground;
      if (Math.abs(vy) > 250) vy = -vy * 0.55;
      else vy = 0;
      vx *= 0.92; // rolling slows it
    }
    ball.win.setPosition(Math.round(x), Math.round(y));
    if (vy === 0 && Math.abs(vx) < 25) {
      stopBall();
      ballStopped(x + b.width / 2);
    }
  }, 16);
}

// the ball came to rest: she runs over and kicks it, a couple of
// times per throw of his
function ballStopped(cx) {
  if (!ball || ball.chases >= 3 || ctx.getMode() !== 'stepout' || ctx.isBusy() || onSpotId) return;
  ball.chases++;
  const her = ctx.getWin();
  const hb = her.getBounds();
  const side = cx > hb.x + hb.width / 2 ? -1 : 1;
  const to = cx + side * unit() * 0.28 - hb.width / 2;
  ctx.walkTo(to, 1.5, () => {
    if (!ball || ball.win.isDestroyed()) return;
    ctx.send('jun:command', 'kick');
    setTimeout(() => throwBall(-side * (400 + Math.random() * 500), -500 - Math.random() * 300, false), 250);
  });
}

module.exports = {
  TYPES, init, show, hide, rebuild, zOrder, add, remove, setColor, list, types, dragStart, dragEnd,
  goTo, leave, stay, afterLanding, onSpot, wantsSpot, restY, spawnBall, removeBall, hasBall: () => !!ball,
  spotByContents, ballContents: () => (ball && !ball.win.isDestroyed() ? ball.win.webContents : null),
};
