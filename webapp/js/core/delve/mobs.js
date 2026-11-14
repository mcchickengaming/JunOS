// creatures that move (#32 tuning, owner Nov 13): every step you take is one turn for the floor, so
// if you move left, something down the hall may move too. How a creature moves is in its data
// (`moves` in data/delve.json foes):
//   · still : guards its spot (a sweeper parked across a corridor, a sentry, the boss). Never moves.
//   · wander: drifts around its home now and then, never far.
//   · hunt  : notices you when you come near, follows, and starts the fight if it reaches you.
//             It gives up when you get far enough away, or it strays too far from home, and goes back.
// A group moves as its stillest member: one still creature keeps the whole group in place; otherwise
// one hunter makes the group a hunter.
//
// Kind danger still holds: nothing moves within reach of a camp or the way in (you're safe there),
// creatures never stand on chests, stairs, traps or other things, one you backed off from stays where it
// is so you can slip past, and only a step costs a turn (turning on the spot to look around is free,
// tune `mobs.tickOnTurn`).
//
// Positions live in run.mob[depth][id] = { at, home, chase } (only for creatures that have moved), so a
// saved delve is still a few numbers. Seeded on its own stream (run.ms), so the scanner's and
// the search's luck never change because something wandered. No DOM, no storage, no clock in here.

import { next, mix } from './rng.js?v=1';
import { DX, DY } from './floor.js?v=2';

export const MOVES = ['still', 'wander', 'hunt'];

// how the group on this thing moves
export function movesOf(data, th) {
  if (!th || th.kind !== 'foe' || th.big) return 'still';
  const kinds = th.foes.map(id => (MOVES.includes(data.foes[id]?.moves) ? data.foes[id].moves : 'still'));
  if (kinds.includes('still')) return 'still';
  return kinds.includes('hunt') ? 'hunt' : 'wander';
}

const memo = (run) => ((run.mob ||= {})[run.depth] ||= {});

// where a creature is now (its own cell until it has moved)
export function posOf(run, f, th) {
  const m = run.mob && run.mob[run.depth] && run.mob[run.depth][th.id];
  return m ? m.at : th.y * f.w + th.x;
}

// the creature (thing) standing on a cell it moved to, if any
export function movedAt(run, f, at) {
  const m = run.mob && run.mob[run.depth];
  if (!m) return null;
  for (const id in m) if (m[id].at === at) return byId(f).get(id) || null;
  return null;
}
// a creature that has moved away from its own cell
export function movedAway(run, th) {
  const m = run.mob && run.mob[run.depth] && run.mob[run.depth][th.id];
  return !!m && m.at !== m.home;
}
function byId(f) { return (f.byId ||= new Map(f.things.map(th => [th.id, th]))); }

// cells within `r` of a camp or the way in: nothing comes in there
function safeCells(f, r) {
  if (f.safe && f.safe.r === r) return f.safe.set;
  const set = new Set();
  for (const th of f.things) if (th.kind === 'camp' || th.kind === 'exit') {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const x = th.x + dx, y = th.y + dy;
      if (x >= 0 && y >= 0 && x < f.w && y < f.h) set.add(y * f.w + x);
    }
  }
  f.safe = { r, set };
  return set;
}

// ctx: { f, run, open(x, y) = a floor or open door (from run.js), solidAt(at) = something already there }
function free(ctx, at) {
  const { f } = ctx;
  const x = at % f.w, y = (at - x) / f.w;
  if (!ctx.open(x, y)) return false;
  if (ctx.safe.has(at)) return false;
  if (ctx.taken.has(at)) return false;
  const th = f.index.get(at);
  // a creature you beat or slipped past leaves its cell walkable; any other thing is in the way
  if (th && !(th.kind === 'foe' && ctx.run.done[th.id])) return false;
  return true;
}

// the next cell from `from` toward `to` (breadth first, at most `max` steps), or -1.
// `to` itself may be "taken" (it's you); everything else on the way must be free.
function stepToward(ctx, from, to, max) {
  const { f } = ctx;
  if (from === to) return -1;
  const prev = new Map([[from, -1]]);
  let layer = [from];
  for (let d = 0; d < max && layer.length; d++) {
    const nextLayer = [];
    for (const at of layer) {
      const x = at % f.w, y = (at - x) / f.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const n = ny * f.w + nx;
        if (prev.has(n)) continue;
        if (n === to) {
          prev.set(n, at);
          let c = n;
          while (prev.get(c) !== from) c = prev.get(c);
          return c;
        }
        if (!free(ctx, n)) continue;
        prev.set(n, at);
        nextLayer.push(n);
      }
    }
    layer = nextLayer;
  }
  return -1;
}
// steps between two cells (walking only where creatures can), or Infinity past `max`
function distance(ctx, from, to, max) {
  if (from === to) return 0;
  const { f } = ctx;
  const seen = new Set([from]);
  let layer = [from];
  for (let d = 1; d <= max && layer.length; d++) {
    const nextLayer = [];
    for (const at of layer) {
      const x = at % f.w, y = (at - x) / f.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const n = ny * f.w + nx;
        if (n === to) return d;
        if (seen.has(n) || !free(ctx, n)) continue;
        seen.add(n); nextLayer.push(n);
      }
    }
    layer = nextLayer;
  }
  return Infinity;
}
const manhattan = (f, a, b) => Math.abs((a % f.w) - (b % f.w)) + Math.abs(Math.floor(a / f.w) - Math.floor(b / f.w));

// one turn for the floor. Returns events: { type: 'followed', id } when a hunter starts following
// you, { type: 'caught', thing } when one reaches you (run.js starts the fight).
// o: { f, open(x, y), t (the delve tune) }
export function tick(data, run, o) {
  const { f, t } = o;
  const T = t.mobs;
  if (!T || !T.on || run.state !== 'walk') return [];
  run.ms ||= { s: mix('mobs', run.area, run.seed) };
  const me = run.pos.y * f.w + run.pos.x;
  const here = f.index.get(me);
  const youSafe = !!here && (here.kind === 'camp' || here.kind === 'exit');
  const m = memo(run);
  const live = f.things.filter(th => th.kind === 'foe' && !run.done[th.id]);
  const taken = new Set(live.map(th => posOf(run, f, th)));
  taken.add(me);
  const ctx = { f, run, open: o.open, safe: safeCells(f, T.safeRadius), taken };
  const events = [];
  let caught = null;
  for (const th of live) {
    const how = movesOf(data, th);
    if (how === 'still') continue;
    const home = th.y * f.w + th.x;
    const st = m[th.id] || { at: home, home, chase: false };
    const at = st.at;
    let to = -1;
    if (how === 'hunt') {
      const d = youSafe ? Infinity : distance(ctx, at, me, T.giveUp);
      const strayed = manhattan(f, at, home) > T.leash;
      if (!st.chase && d <= T.notice && !strayed) { st.chase = true; events.push({ type: 'followed', id: th.id, foes: th.foes }); }
      else if (st.chase && (d > T.giveUp || strayed)) st.chase = false;
      if (st.chase) {
        if (d === 1) { caught = th; m[th.id] = st; break; }
        if (next(run.ms) < T.huntPace) to = stepToward(ctx, at, me, T.giveUp);
      } else if (at !== home && next(run.ms) < T.homePace) to = stepToward(ctx, at, home, T.leash * 3);
    } else if (next(run.ms) < T.wanderPace) {
      const x = at % f.w, y = (at - x) / f.w;
      const opts = [];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const n = ny * f.w + nx;
        if (free(ctx, n) && manhattan(f, n, home) <= T.wanderLeash) opts.push(n);
      }
      if (opts.length) to = opts[Math.floor(next(run.ms) * opts.length)];
    }
    if (to >= 0 && to !== me && free(ctx, to)) {
      taken.delete(at); taken.add(to);
      st.at = to;
      events.push({ type: 'foe_moved', id: th.id, from: at, to });
    }
    if (st.at !== home || st.chase) m[th.id] = st;
    else delete m[th.id];
  }
  if (caught) events.push({ type: 'caught', thing: caught });
  return events;
}
