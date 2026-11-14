// the first-person grid view (#32), PLACEHOLDER ART: flat shaded walls, a floor and a ceiling, and
// plain shapes for creatures and things. Drawn with PixiJS so the real art (painted tiles, sprites,
// light) drops into the same places later: walls are quads in perspective, things are billboards.
// It draws ONLY when asked (no ticker running), so an open delve costs nothing while you stand still.
//
// The view knows nothing about rules. scene = { pos: { x, y, d }, cell(x, y) → WALL | FLOOR | DOOR,
// hinted(x, y) → a wall she pointed out, thing(x, y) → { kind, state, big, shape, color } | null,
// colors: the area's }.
//
// Also here: drawMap(), the map you fill in as you go (a plain 2D canvas).

const WALL = 0, DOOR = 2;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

const hex = (s) => parseInt(String(s || '#000000').replace('#', ''), 16);
function lerp(a, b, k) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255, br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}

export const VIEW = { depth: 5, side: 3, near: 0.14, back: 0.15, focal: 0.6, fog: 0.85 };

export function createView(PIXI, canvas, { width = 640, height = 400 } = {}) {
  const app = new PIXI.Application({ view: canvas, width, height, antialias: true, backgroundColor: 0x0d0b14, autoStart: false, resolution: Math.min(2, globalThis.devicePixelRatio || 1), autoDensity: true });
  const g = new PIXI.Graphics();
  app.stage.addChild(g);
  const W = width, H = height, cx = W / 2, cy = H / 2, Fp = W * VIEW.focal;
  const px = (x, z) => cx + (x / z) * Fp;
  const top = (z) => cy - (0.5 / z) * Fp;
  const bot = (z) => cy + (0.5 / z) * Fp;
  const zn = (d) => Math.max(VIEW.near, d - VIEW.back);       // the near edge of the cell d steps ahead
  const zf = (d) => d + 1 - VIEW.back;                         // its far edge
  const fogK = (z) => Math.min(1, Math.pow(Math.max(0, z - 0.4) / (VIEW.depth + 0.6), 0.8)) * VIEW.fog;

  function quad(color, alpha, pts) { g.beginFill(color, alpha); g.drawPolygon(pts); g.endFill(); }

  function thingShape(th, x, z, C) {
    const u = Fp / z, fy = bot(z), sx = px(x, z);
    const fog = fogK(z);
    const col = (c) => lerp(hex(c), C.fog, fog);
    const a = th.state === 'fled' ? 0.4 : 1;
    if (th.kind === 'foe') {
      if (th.state === 'won') { quad(col('#55506a'), 0.8, [sx - u * 0.2, fy, sx + u * 0.2, fy, sx + u * 0.12, fy - u * 0.06, sx - u * 0.14, fy - u * 0.05]); return; }
      const c = col(th.color || '#ff8a7a'), k = th.big ? 1.5 : 1;
      const w = u * 0.26 * k, h = u * 0.5 * k, by = fy - u * 0.12;
      if (th.shape === 'diamond') quad(c, a, [sx, by - h, sx + w * 0.8, by - h / 2, sx, by, sx - w * 0.8, by - h / 2]);
      else if (th.shape === 'wide') { g.beginFill(c, a); g.drawEllipse(sx, fy - u * 0.14, w * 1.4, u * 0.14); g.endFill(); }
      else if (th.shape === 'tall') quad(c, a, [sx - w * 0.6, fy, sx + w * 0.6, fy, sx + w * 0.45, fy - u * 0.7, sx - w * 0.45, fy - u * 0.7]);
      else if (th.shape === 'big') quad(c, a, [sx - w, fy, sx + w, fy, sx + w * 0.8, fy - h * 1.1, sx, fy - h * 1.3, sx - w * 0.8, fy - h * 1.1]);
      else { g.beginFill(c, a); g.drawRoundedRect(sx - w, fy - u * 0.34, w * 2, u * 0.34, u * 0.04); g.endFill(); }
      // one "eye" so it reads as something looking at you
      g.beginFill(th.state === 'fled' ? 0x8880a0 : 0xffffff, a); g.drawCircle(sx, th.shape === 'wide' ? fy - u * 0.16 : th.shape === 'box' || !th.shape ? fy - u * 0.2 : by - h * 0.55, Math.max(1.5, u * 0.035 * k)); g.endFill();
    } else if (th.kind === 'chest' || th.kind === 'vault') {
      const big = th.kind === 'vault', w = u * (big ? 0.3 : 0.2), h = u * (big ? 0.3 : 0.2);
      const c = col(big ? '#e8c35a' : '#a8743a');
      g.beginFill(th.state ? lerp(c, C.fog, 0.45) : c); g.drawRect(sx - w, fy - h, w * 2, h); g.endFill();
      g.lineStyle(Math.max(1, u * 0.012), col('#2a1d10'), 1); g.moveTo(sx - w, fy - h * (th.state ? 0.95 : 0.6)); g.lineTo(sx + w, fy - h * (th.state ? 0.95 : 0.6)); g.lineStyle(0);
    } else if (th.kind === 'terminal') {
      g.beginFill(col('#3a3550')); g.drawRect(sx - u * 0.14, fy - u * 0.62, u * 0.28, u * 0.62); g.endFill();
      g.beginFill(th.state ? col('#2a2740') : col(C.trimRaw), th.state ? 1 : 0.95); g.drawRect(sx - u * 0.1, fy - u * 0.56, u * 0.2, u * 0.16); g.endFill();
    } else if (th.kind === 'trap') {
      if (!th.state) return; // you don't see a trap nobody has noticed
      const c = col(th.state === 'known' ? '#ff6b81' : '#6a5560');
      quad(c, 0.9, [sx - u * 0.22, fy - u * 0.02, sx + u * 0.22, fy - u * 0.02, sx + u * 0.16, fy - u * 0.1, sx - u * 0.16, fy - u * 0.1]);
    } else if (th.kind === 'camp') {
      g.beginFill(col('#ffb86a'), 0.25); g.drawCircle(sx, fy - u * 0.12, u * 0.3); g.endFill();
      quad(col('#ff9a4a'), 1, [sx - u * 0.08, fy - u * 0.03, sx + u * 0.08, fy - u * 0.03, sx, fy - u * 0.26]);
    } else if (th.kind === 'stairs' || th.kind === 'exit') {
      const c = col(th.kind === 'stairs' ? '#0a0810' : '#cfe6ff');
      quad(c, th.kind === 'stairs' ? 1 : 0.5, [sx - u * 0.3, fy - u * 0.01, sx + u * 0.3, fy - u * 0.01, sx + u * 0.22, fy - u * 0.13, sx - u * 0.22, fy - u * 0.13]);
      g.lineStyle(Math.max(1, u * 0.01), col(C.trimRaw), 0.8);
      for (let i = 1; i <= 3; i++) { const yy = fy - u * 0.01 - u * 0.03 * i; g.moveTo(sx - u * (0.3 - 0.02 * i), yy); g.lineTo(sx + u * (0.3 - 0.02 * i), yy); }
      g.lineStyle(0);
    } else if (th.kind === 'odd') {
      const c = col(C.trimRaw);
      quad(c, th.state ? 0.5 : 0.95, [sx, fy - u * 0.5, sx + u * 0.1, fy - u * 0.32, sx, fy - u * 0.14, sx - u * 0.1, fy - u * 0.32]);
    }
  }

  function draw(scene) {
    const C = { wall: hex(scene.colors.wall), dark: hex(scene.colors.wallDark), floor: hex(scene.colors.floor), ceil: hex(scene.colors.ceil), door: hex(scene.colors.door), fog: hex(scene.colors.fog), trim: hex(scene.colors.trim), trimRaw: scene.colors.trim };
    const { x: X, y: Y, d: D } = scene.pos;
    const fx = DX[D], fy = DY[D], rx = DX[(D + 1) % 4], ry = DY[(D + 1) % 4];
    const at = (d, i) => [X + fx * d + rx * i, Y + fy * d + ry * i];
    const solid = (d, i) => scene.cell(...at(d, i)) === WALL;
    g.clear();
    g.beginFill(C.fog); g.drawRect(0, 0, W, H); g.endFill();
    // floor and ceiling: one band per row of cells, fading into the dark, with the tile lines
    for (let d = VIEW.depth; d >= 0; d--) {
      const a = zn(d), b = zf(d), k = fogK((a + b) / 2);
      g.beginFill(lerp(C.floor, C.fog, k)); g.drawRect(0, bot(b), W, bot(a) - bot(b) + 1); g.endFill();
      g.beginFill(lerp(C.ceil, C.fog, k)); g.drawRect(0, top(a), W, top(b) - top(a) + 1); g.endFill();
      g.lineStyle(1, lerp(C.dark, C.fog, k), 0.6); g.moveTo(0, bot(b)); g.lineTo(W, bot(b)); g.moveTo(0, top(b)); g.lineTo(W, top(b)); g.lineStyle(0);
    }
    for (let d = VIEW.depth; d >= 0; d--) {
      const a = zn(d), b = zf(d);
      const order = [];
      for (let i = VIEW.side; i >= 1; i--) order.push(-i, i);
      order.push(0);
      // the sides of walls that face the open cells next to them
      for (const i of order) {
        if (!solid(d, i) || i === 0) continue;
        const inner = i > 0 ? i - 0.5 : i + 0.5;
        if (solid(d, i > 0 ? i - 1 : i + 1)) continue;
        const k = fogK((a + b) / 2);
        quad(lerp(C.dark, C.fog, k), 1, [px(inner, a), top(a), px(inner, b), top(b), px(inner, b), bot(b), px(inner, a), bot(a)]);
      }
      // what stands in the open cells of this row
      for (const i of order) {
        if (solid(d, i)) continue;
        const [wx, wy] = at(d, i);
        const th = scene.thing(wx, wy);
        if (th && !(d === 0 && i === 0 && th.kind !== 'trap')) thingShape(th, i, Math.max(VIEW.near * 2, d + 0.5 - VIEW.back), C);
      }
      // the faces of this row's walls that look back at you, and its door frames
      if (d >= 1) for (const i of order) {
        const [wx, wy] = at(d, i);
        const kind = scene.cell(wx, wy);
        const k = fogK(a);
        const l = px(i - 0.5, a), r = px(i + 0.5, a), t = top(a), bt = bot(a);
        if (kind === WALL) {
          if (solid(d - 1, i)) continue;
          quad(lerp(C.wall, C.fog, k), 1, [l, t, r, t, r, bt, l, bt]);
          g.lineStyle(1, lerp(C.dark, C.fog, k), 0.8); g.drawRect(l, t, r - l, bt - t); g.lineStyle(0);
          if (scene.hinted(wx, wy)) { // a wall she pointed out: a faint outline where the door is
            g.lineStyle(Math.max(1, (r - l) * 0.012), lerp(C.trim, C.fog, k), 0.9);
            g.drawRect(l + (r - l) * 0.22, t + (bt - t) * 0.2, (r - l) * 0.56, (bt - t) * 0.8); g.lineStyle(0);
          }
        } else if (kind === DOOR && !solid(d - 1, i)) {
          const c = lerp(C.door, C.fog, k), w = (r - l) * 0.13, h = (bt - t) * 0.14;
          g.beginFill(c); g.drawRect(l, t, w, bt - t); g.drawRect(r - w, t, w, bt - t); g.drawRect(l, t, r - l, h); g.endFill();
        }
      }
    }
    app.render();
  }

  return { app, draw, destroy: () => app.destroy(false) };
}

// the map you fill in. o: { w, h, pos, seen(x, y), cell(x, y), hinted(x, y), thing(x, y), colors }
export function drawMap(canvas, o) {
  const ctx = canvas.getContext('2d');
  const s = Math.max(3, Math.floor(Math.min(canvas.width / o.w, canvas.height / o.h)));
  const ox = Math.floor((canvas.width - s * o.w) / 2), oy = Math.floor((canvas.height - s * o.h) / 2);
  ctx.fillStyle = o.colors.fog; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dot = { foe: '#ff6b81', chest: '#e0a050', vault: '#ffd76a', terminal: o.colors.trim, trap: '#ff6b81', camp: '#ffb86a', stairs: '#ffffff', exit: '#cfe6ff', odd: o.colors.trim };
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    if (!o.seen(x, y)) continue;
    const c = o.cell(x, y);
    ctx.fillStyle = c === WALL ? (o.hinted(x, y) ? o.colors.trim : o.colors.wallDark) : c === DOOR ? o.colors.door : o.colors.wall;
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    const th = c === WALL ? null : o.thing(x, y);
    if (th && !(th.kind === 'trap' && !th.state) && !(th.kind === 'foe' && th.state === 'won')) {
      ctx.fillStyle = dot[th.kind] || '#fff';
      ctx.globalAlpha = th.state && th.kind !== 'trap' && th.kind !== 'camp' ? 0.4 : 1;
      const m = Math.max(1, Math.floor(s * 0.25));
      ctx.fillRect(ox + x * s + m, oy + y * s + m, s - 2 * m, s - 2 * m);
      ctx.globalAlpha = 1;
    }
  }
  // you: an arrow the way you face
  const { x, y, d } = o.pos, px = ox + x * s + s / 2, py = oy + y * s + s / 2, r = s * 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + DX[d] * r, py + DY[d] * r);
  ctx.lineTo(px + DX[(d + 1) % 4] * r * 0.7 - DX[d] * r * 0.7, py + DY[(d + 1) % 4] * r * 0.7 - DY[d] * r * 0.7);
  ctx.lineTo(px + DX[(d + 3) % 4] * r * 0.7 - DX[d] * r * 0.7, py + DY[(d + 3) % 4] * r * 0.7 - DY[d] * r * 0.7);
  ctx.closePath(); ctx.fill();
}
