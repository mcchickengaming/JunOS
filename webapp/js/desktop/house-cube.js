// her house cube (#29 with the house, Nov 15): going inside from the desktop, she tosses her house, packed into a
// little glowing cube (her "Hearth Drive"), beside her. It bounces, lights up, projects a hologram of the house, the
// house materializes from the bottom up, she opens the door and walks in, and her window opens out of the door.
// Coming out plays it backwards: the window shrinks into the door, she steps out, the house packs itself back into
// the cube and she catches it.
//
// This file draws it, in a see-through, click-through window over her and the house (webapp/house-cube.html,
// opened by desktop/main.js with the plan from desktop/presence.js housePlan + houseTimeline). The page that plays
// HER (desktop.html) does her part; main.js does the windows. Everything here is placeholder art drawn in code:
//   - the house is a stand-in drawing until the game's house (#11) exists; then it shows a picture of THE house:
//     localStorage['jun.house.look'] = { img: <data url>, v: 1 } (whoever takes that picture writes it; nothing does yet)
//   - every color is the player's (Visuals > Her house cube: --house-cube, --house-glow, --house-holo, --house-wall,
//     --house-roof, --house-light), see-through via desktop.fx `hAlpha`
//   - the "unpacking home.zip" label follows the robot-faces taste (desktop.fx `hLabel`: auto / on / off)
// Pure helpers (beatAt, ease, label) are exported for .github/scripts/js/house.test.mjs.

export const WORDS = {
  name: 'her Hearth Drive',
  unpack: ['unpacking home.zip', 'extracting home…', 'rebuilding home', 'decompressing house.dat'],
  pack: ['packing home.zip', 'compressing home…', 'saving house.dat'],
};
export const COLORS = {
  '--house-cube': '#2a2347', '--house-glow': '#7ef9ff', '--house-holo': '#5ad8ff',
  '--house-wall': '#e9dcc9', '--house-roof': '#6b3a5a', '--house-light': '#ffd27a',
};

export const ease = (f) => (f <= 0 ? 0 : f >= 1 ? 1 : 1 - Math.pow(1 - f, 3));
export const easeIn = (f) => (f <= 0 ? 0 : f >= 1 ? 1 : f * f);
// which beat is playing at t (ms from the start) → { id, f (0..1 inside it), done }
export function beatAt(timeline, t) {
  const beats = timeline?.beats || [];
  for (const b of beats) if (t < b.at + b.ms) return { id: b.id, f: Math.max(0, Math.min(1, (t - b.at) / Math.max(1, b.ms))), done: false };
  return { id: beats.length ? beats[beats.length - 1].id : null, f: 1, done: true };
}
export const passed = (timeline, id, t) => { const b = timeline?.beats?.find(x => x.id === id); return !!b && t >= b.at + b.ms; };
export const startOf = (timeline, id) => timeline?.beats?.find(x => x.id === id) || null;
// the little label: words + a percent that only goes up
export function label(dir, f, seed = 0) {
  const list = dir === 'in' ? WORDS.unpack : WORDS.pack;
  const w = list[Math.abs(Math.floor(seed)) % list.length];
  return `${w} ${Math.min(100, Math.floor(ease(f) * 100))}%`;
}
export function readTheme(storage) {
  let t = {};
  try { t = JSON.parse(storage?.getItem('desktop.theme') || '{}') || {}; } catch (e) {}
  const out = {};
  for (const [k, d] of Object.entries(COLORS)) out[k] = /^#[0-9a-f]{6}$/i.test(t[k] || '') ? t[k] : d;
  return out;
}
export function readFx(storage) {
  let fx = {};
  try { fx = JSON.parse(storage?.getItem('desktop.fx') || '{}') || {}; } catch (e) {}
  const a = Number(fx.hAlpha);
  return { alpha: Number.isFinite(a) ? Math.max(0.2, Math.min(1, a)) : 1, label: ['on', 'off', 'auto'].includes(fx.hLabel) ? fx.hLabel : 'auto', ascii: fx.eAscii };
}

// ---------------------------------------------------------------
// the drawing (canvas 2D). p = the plan in this window's coordinates: { house, door, hand, side, herPx }

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// the stand-in house: a small prefab home with a pitched roof, a warm window, a round attic vent and an antenna
function houseShape(ctx, h, C, { solid = true, wire = false, alpha = 1, look = null }) {
  const { x, y, width: w, height: H } = h;
  const roofH = H * 0.38, wallTop = y + roofH;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (look && solid) {
    ctx.drawImage(look, x, y, w, H);
    ctx.restore();
    return;
  }
  const roof = new Path2D();
  roof.moveTo(x - w * 0.06, wallTop); roof.lineTo(x + w / 2, y); roof.lineTo(x + w * 1.06, wallTop); roof.closePath();
  const wall = new Path2D();
  wall.rect(x + w * 0.04, wallTop, w * 0.92, H - roofH);
  if (solid) {
    ctx.fillStyle = C['--house-wall']; ctx.fill(wall);
    ctx.fillStyle = rgba('#000000', 0.08); ctx.fillRect(x + w * 0.04, wallTop, w * 0.92, (H - roofH) * 0.12);
    ctx.fillStyle = C['--house-roof']; ctx.fill(roof);
    // the window, lit from inside
    ctx.fillStyle = C['--house-light'];
    ctx.fillRect(x + w * 0.14, wallTop + (H - roofH) * 0.22, w * 0.2, (H - roofH) * 0.3);
    ctx.fillStyle = C['--house-roof'];
    ctx.fillRect(x + w * 0.235, wallTop + (H - roofH) * 0.22, w * 0.012, (H - roofH) * 0.3);
    // the attic vent and her antenna (a nod to her own)
    ctx.beginPath(); ctx.arc(x + w / 2, y + roofH * 0.55, w * 0.05, 0, Math.PI * 2); ctx.fillStyle = C['--house-light']; ctx.fill();
    ctx.strokeStyle = C['--house-roof']; ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath(); ctx.moveTo(x + w * 0.72, y + roofH * 0.44); ctx.lineTo(x + w * 0.78, y - H * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w * 0.78, y - H * 0.1, w * 0.018, 0, Math.PI * 2); ctx.fillStyle = C['--house-glow']; ctx.fill();
  }
  if (wire) {
    ctx.strokeStyle = C['--house-holo']; ctx.lineWidth = Math.max(1, w * 0.008);
    ctx.stroke(roof); ctx.stroke(wall);
    ctx.strokeRect(x + w * 0.14, wallTop + (H - roofH) * 0.22, w * 0.2, (H - roofH) * 0.3);
  }
  ctx.restore();
}
function doorShape(ctx, d, C, open, glow) {
  ctx.save();
  // the inside, warm, then the door swinging open (narrower as it turns toward us)
  ctx.fillStyle = C['--house-light'];
  ctx.globalAlpha *= 0.35 + 0.65 * Math.max(open, glow);
  ctx.fillRect(d.x, d.y, d.width, d.height);
  ctx.globalAlpha = 1;
  const w = d.width * (1 - 0.85 * ease(open));
  ctx.fillStyle = C['--house-roof'];
  ctx.fillRect(d.x, d.y, w, d.height);
  ctx.fillStyle = C['--house-glow'];
  if (w > 3) { ctx.beginPath(); ctx.arc(d.x + w * 0.82, d.y + d.height * 0.55, Math.max(1.5, d.width * 0.06), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function cube(ctx, cx, cy, s, C, { spin = 0, glow = 0 }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  const h = s / 2;
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * (1.4 + glow));
    g.addColorStop(0, rgba(C['--house-glow'], 0.55 * glow)); g.addColorStop(1, rgba(C['--house-glow'], 0));
    ctx.fillStyle = g; ctx.fillRect(-s * 3, -s * 3, s * 6, s * 6);
  }
  // an isometric-ish cube: top, left and right faces
  const top = [[0, -h], [h, -h / 2], [0, 0], [-h, -h / 2]];
  const left = [[-h, -h / 2], [0, 0], [0, h], [-h, h / 2]];
  const right = [[h, -h / 2], [0, 0], [0, h], [h, h / 2]];
  const face = (pts, shade) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = C['--house-cube']; ctx.fill(); ctx.fillStyle = rgba('#000000', shade); ctx.fill(); ctx.strokeStyle = rgba(C['--house-glow'], 0.35 + 0.65 * glow); ctx.lineWidth = Math.max(1, s * 0.06); ctx.stroke(); };
  face(top, 0); face(left, 0.18); face(right, 0.32);
  // a tiny house glyph on the top face
  ctx.fillStyle = rgba(C['--house-glow'], 0.5 + 0.5 * glow);
  ctx.beginPath(); ctx.moveTo(-h * 0.3, -h * 0.45); ctx.lineTo(0, -h * 0.72); ctx.lineTo(h * 0.3, -h * 0.45); ctx.lineTo(0, -h * 0.22); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// one frame. t = ms since start, tl = the timeline, p = the plan, C = colors, o = { alpha, label, dir, seed, look }
export function draw(ctx, t, tl, p, C, o) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = o.alpha;
  const { house, door, hand, herPx } = p;
  const s = Math.max(10, herPx * 0.085);
  const ground = house.y + house.height - s / 2;
  const cx = house.x + house.width / 2;
  const b = beatAt(tl, t);
  const at = (id) => { const x = startOf(tl, id); return x ? Math.max(0, Math.min(1, (t - x.at) / Math.max(1, x.ms))) : 0; };
  const showLabel = o.label === 'on' || (o.label === 'auto' && Number(o.ascii ?? 50) > 0);
  if (o.dir === 'in') {
    // the cube: tossed, bounced, lit
    const toss = at('toss'), bounce = at('bounce'), light = at('light'), holo = at('holo'), build = at('build');
    let x = cx, y = ground, spin = 0;
    if (toss < 1) {
      x = hand.x + (cx - hand.x) * toss;
      y = hand.y + (ground - hand.y) * toss - Math.sin(toss * Math.PI) * herPx * 0.35;
      spin = toss * Math.PI * 2.5;
    } else if (bounce < 1) {
      y = ground - Math.abs(Math.sin(bounce * Math.PI * 2)) * herPx * 0.12 * (1 - bounce);
      spin = Math.PI * 2.5 + bounce * 0.6;
    }
    const lit = Math.min(1, light + holo);
    const gone = build > 0.85;
    if (!gone) cube(ctx, x, y, s * (build > 0.6 ? 1 - (build - 0.6) * 2 : 1), C, { spin: toss < 1 || bounce < 1 ? spin : 0, glow: lit });
    // the hologram: a cone of light up from the cube, the house in lines, scan lines through it
    if (holo > 0 || build > 0) {
      const a = holo < 1 ? ease(holo) : 1 - ease(build);
      ctx.save();
      ctx.globalAlpha *= a * (0.75 + 0.25 * Math.sin(t / 37));
      const cone = ctx.createLinearGradient(0, ground, 0, house.y);
      cone.addColorStop(0, rgba(C['--house-holo'], 0.35)); cone.addColorStop(1, rgba(C['--house-holo'], 0.04));
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.3, ground); ctx.lineTo(house.x - house.width * 0.05, house.y); ctx.lineTo(house.x + house.width * 1.05, house.y); ctx.lineTo(cx + s * 0.3, ground); ctx.closePath(); ctx.fill();
      houseShape(ctx, house, C, { solid: false, wire: true });
      ctx.fillStyle = rgba(C['--house-holo'], 0.12);
      for (let ly = house.y + ((t / 18) % 6); ly < house.y + house.height; ly += 6) ctx.fillRect(house.x, ly, house.width, 1);
      ctx.restore();
    }
    // materializing from the bottom up: solid under the scan line, a bright line, a few bits flying off it
    if (build > 0) {
      const line = house.y + house.height * (1 - ease(build)) - house.height * 0.12;
      ctx.save();
      ctx.beginPath(); ctx.rect(house.x - house.width * 0.1, line, house.width * 1.2, house.y + house.height - line + 2); ctx.clip();
      houseShape(ctx, house, C, { solid: true, look: o.look });
      doorShape(ctx, door, C, at('open'), at('enter'));
      ctx.restore();
      if (build < 1) {
        ctx.fillStyle = C['--house-glow'];
        ctx.fillRect(house.x - house.width * 0.06, line - 1, house.width * 1.12, 2);
        for (let i = 0; i < 10; i++) {
          const r = Math.sin(i * 91.7 + Math.floor(t / 60)) * 0.5 + 0.5;
          ctx.globalAlpha = o.alpha * (1 - r);
          ctx.fillRect(house.x + house.width * ((i * 0.137 + r * 0.3) % 1), line - r * herPx * 0.12, Math.max(2, s * 0.12), Math.max(2, s * 0.12));
        }
        ctx.globalAlpha = o.alpha;
      }
    }
    // the house fades once her window has taken over
    if (at('fade') > 0) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${ease(at('fade'))})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    if (showLabel && (holo > 0 || build > 0) && build < 1) {
      ctx.font = `${Math.max(10, Math.round(herPx * 0.03))}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = C['--house-glow']; ctx.textAlign = 'center';
      ctx.fillText(label('in', holo * 0.4 + build * 0.6, o.seed), cx, house.y - herPx * 0.14);
    }
  } else {
    // coming out: the house is there, the door opens, she steps out, the door closes, it packs back into the cube
    const appear = at('shrink'), build = at('build'), open = at('open'), out = at('out'), close = at('close'), pack = at('pack'), ctch = at('catch');
    if (pack < 1) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, appear * 2 + build);
      const line = house.y + house.height * ease(pack) - house.height * 0.12;
      if (pack > 0) { ctx.beginPath(); ctx.rect(house.x - house.width * 0.1, line, house.width * 1.2, house.height * 1.4); ctx.clip(); }
      houseShape(ctx, house, C, { solid: true, look: o.look });
      doorShape(ctx, door, C, Math.max(0, open - close), out);
      ctx.restore();
      if (pack > 0) {
        ctx.save(); ctx.globalAlpha *= 0.6 * (1 - pack);
        houseShape(ctx, house, C, { solid: false, wire: true });
        ctx.fillStyle = C['--house-glow']; ctx.fillRect(house.x - house.width * 0.06, line - 1, house.width * 1.12, 2);
        ctx.restore();
      }
    }
    if (pack > 0.5 && ctch < 1) {
      const f = ease(ctch);
      const x = cx + (hand.x - cx) * f, y = ground + (hand.y - ground) * f - Math.sin(f * Math.PI) * herPx * 0.25;
      cube(ctx, x, y, s * (1 - 0.3 * f), C, { spin: f * Math.PI * 2, glow: 1 - f * 0.7 });
    }
    if (showLabel && pack > 0 && pack < 1) {
      ctx.font = `${Math.max(10, Math.round(herPx * 0.03))}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = C['--house-glow']; ctx.textAlign = 'center';
      ctx.fillText(label('out', pack, o.seed), cx, house.y - herPx * 0.14);
    }
  }
  ctx.restore();
  return b;
}

// play one: canvas, the message from main.js ({ dir, plan, timeline, herPx }) → { done (a promise), resume() }.
// A beat with `wait: true` holds at its end until resume() (main.js: the next window is up), so the house never fades
// before her window has opened out of the door, however long that window takes to load.
export function play(canvas, msg, { storage = globalThis.localStorage, now = () => performance.now(), raf = (f) => requestAnimationFrame(f), loadLook = null } = {}) {
  const ctx = canvas.getContext('2d');
  const C = readTheme(storage), fx = readFx(storage);
  const p = { ...msg.plan, herPx: msg.herPx };
  const o = { ...fx, dir: msg.dir === 'out' ? 'out' : 'in', seed: Math.floor(Math.random() * 97), look: null };
  if (loadLook) loadLook().then((img) => { o.look = img; }).catch(() => {});
  const hold = (msg.timeline?.beats || []).find(b => b.wait);
  let resumed = !hold, paused = 0, pauseAt = null;
  const t0 = now();
  let finish;
  const done = new Promise((r) => { finish = r; });
  const clock = () => {
    const raw = now() - t0 - paused;
    if (!resumed && hold && raw >= hold.at + hold.ms) { if (pauseAt == null) pauseAt = now(); return hold.at + hold.ms; }
    return raw;
  };
  const frame = () => {
    const b = draw(ctx, clock(), msg.timeline, p, C, o);
    if (b.done) { ctx.clearRect(0, 0, canvas.width, canvas.height); finish(); } else raf(frame);
  };
  raf(frame);
  return { done, resume() { if (resumed) return; resumed = true; if (pauseAt != null) paused += now() - pauseAt; pauseAt = null; } };
}
// the picture of THE house, once the game's house can take one
export function lookLoader(storage = globalThis.localStorage) {
  return () => new Promise((ok, no) => {
    let v = null;
    try { v = JSON.parse(storage.getItem('jun.house.look') || 'null'); } catch (e) {}
    if (!v || typeof v.img !== 'string' || !v.img.startsWith('data:image/')) { no(new Error('none')); return; }
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = no;
    img.src = v.img;
  });
}
