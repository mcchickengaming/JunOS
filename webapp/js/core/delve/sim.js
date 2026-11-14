// "a hundred delves in a moment" (#32): a stand-in player walks whole delves with the real rules
// (run.js, encounter.js), so the lab and the tests can see how long a delve takes, how often it
// goes wrong and what it's worth, before anyone has played one. Seeded: the same seed, the same story.
// The stand-in explores what it can see a way to, opens what she points out, rests when hurt, fights
// everything in its way and takes the stairs when the floor is done.

import * as Run from './run.js?v=2';
import { tune as getTune } from './delve-tune.js?v=2';

const { WALL, DX, DY } = Run;
const SOLID = ['chest', 'vault', 'terminal'];

// the first step toward the nearest cell where `goal(x, y)` is true (walking only where the player could)
function pathTo(data, run, goal) {
  const f = Run.floorOf(data, run);
  const start = run.pos.y * f.w + run.pos.x;
  const prev = new Map([[start, -1]]);
  const q = [start];
  while (q.length) {
    const at = q.shift();
    const x = at % f.w, y = (at - x) / f.w;
    if (at !== start && goal(x, y)) { let c = at; const path = []; while (c !== start) { path.push(c); c = prev.get(c); } return path.reverse(); }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], n = ny * f.w + nx;
      if (prev.has(n)) continue;
      const th = Run.thingAt(data, run, nx, ny);
      const wall = Run.cellAt(data, run, nx, ny) === WALL;
      const hinted = wall && Run.isSecretHinted(data, run, nx, ny);
      if (wall && !hinted) continue;
      prev.set(n, at);
      // things you face rather than walk through are an end, not a way through
      if (th && SOLID.includes(th.kind)) { if (goal(nx, ny)) { let c = n; const path = []; while (c !== start) { path.push(c); c = prev.get(c); } return path.reverse(); } continue; }
      q.push(n);
    }
  }
  return null;
}

function walkOne(data, run, at, t) {
  const f = Run.floorOf(data, run);
  const x = at % f.w, y = (at - x) / f.w;
  const d = [0, 1, 2, 3].find(k => run.pos.x + DX[k] === x && run.pos.y + DY[k] === y);
  let guard = 0;
  while (run.pos.d !== d && guard++ < 4) Run.turn(data, run, ((d - run.pos.d + 4) % 4) === 3 ? -1 : 1, t);
  const th = Run.thingAt(data, run, x, y);
  if (th && SOLID.includes(th.kind)) return Run.use(data, run, t);
  return Run.step(data, run, 0, t);
}

// one whole delve. o: Run.start options (+ seed). Returns { outcome, stats, minutes, events }
export function delve(data, o = {}, tune) {
  const t = tune || getTune();
  const { run } = Run.start(data, o, t);
  const count = {};
  const note = (evs) => { for (const e of evs) count[e.type] = (count[e.type] || 0) + 1; return evs; };
  let guard = 0, stuck = 0;
  while (run.state !== 'over' && guard++ < 6000) {
    if (run.state === 'fight') {
      for (const u of run.enc.units) if (u.ctl === 'you') u.ctl = 'auto';
      Run.Enc.autoplay(data, run.enc, t);
      note(Run.endFight(data, run, t));
      continue;
    }
    if (run.state === 'ko') { note(Run.afterCare(data, run, Run.careWhere(data, run), t)); continue; }
    const f = Run.floorOf(data, run);
    const todo = (th) => th && !run.done[th.id] && ['chest', 'vault', 'terminal', 'foe', 'odd'].includes(th.kind) && !(th.kind === 'terminal' && !(run.together && run.setup.levels.jun.hacking > 0));
    const hurt = run.hp.you.hp / run.hp.you.max < 0.55;
    const here = Run.thingAt(data, run, run.pos.x, run.pos.y);
    if (here && here.kind === 'camp' && (hurt || !run.done[here.id])) { note(Run.use(data, run, t)); continue; }
    let path = hurt ? pathTo(data, run, (x, y) => { const th = Run.thingAt(data, run, x, y); return th && th.kind === 'camp' && Run.seenAt(data, run, x, y); }) : null;
    path = path
      || pathTo(data, run, (x, y) => Run.isSecretHinted(data, run, x, y))
      || pathTo(data, run, (x, y) => todo(Run.thingAt(data, run, x, y)) && Run.seenAt(data, run, x, y))
      || pathTo(data, run, (x, y) => !Run.seenAt(data, run, x, y) && Run.cellAt(data, run, x, y) !== WALL)
      || pathTo(data, run, (x, y) => { const th = Run.thingAt(data, run, x, y); return th && th.kind === 'stairs'; });
    if (!path) {
      if (here && here.kind === 'stairs') { note(Run.use(data, run, t)); continue; }
      note(Run.leave(data, run, 'home', t)); break; // nothing left to do down here
    }
    const before = run.pos.x + ',' + run.pos.y + ',' + run.depth + ',' + Object.keys(run.done).length + ',' + Object.keys(run.found).length + ',' + run.state;
    note(walkOne(data, run, path[0], t));
    if (run.state === 'walk') {
      const th = Run.thingAt(data, run, run.pos.x, run.pos.y);
      if (th && th.kind === 'stairs' && !pathTo(data, run, (x, y) => todo(Run.thingAt(data, run, x, y)) && Run.seenAt(data, run, x, y))
        && !pathTo(data, run, (x, y) => !Run.seenAt(data, run, x, y) && Run.cellAt(data, run, x, y) !== WALL)) note(Run.use(data, run, t));
    }
    const after = run.pos.x + ',' + run.pos.y + ',' + run.depth + ',' + Object.keys(run.done).length + ',' + Object.keys(run.found).length + ',' + run.state;
    stuck = before === after ? stuck + 1 : 0;
    if (stuck > 8) { note(Run.leave(data, run, 'home', t)); break; }
  }
  if (run.state !== 'over') note(Run.leave(data, run, 'home', t));
  const s = run.stats;
  const minutes = ((s.steps + s.turns * 0.4) * t.walk.stepSec + s.acts * t.walk.turnSec * (run.together ? 0.6 : 1)) / 60;
  return { outcome: run.outcome, stats: s, minutes, count, run };
}

// many delves, averaged. Returns plain numbers for the lab's table and the tests.
export function many(data, o = {}, n = 100, tune) {
  const t = tune || getTune();
  const sum = { minutes: 0, quality: 0, cleared: 0, ko: 0, anyKo: 0, won: 0, met: 0, fled: 0, chests: 0, secrets: 0, steps: 0, acts: 0, floors: 0, traps: 0, carried: 0 };
  let lo = Infinity, hi = 0;
  for (let i = 0; i < n; i++) {
    const r = delve(data, { ...o, seed: (o.seed ?? 1) * 7919 + i }, t);
    sum.minutes += r.minutes; sum.quality += r.outcome.quality; sum.cleared += r.outcome.cleared ? 1 : 0;
    sum.ko += r.stats.ko; sum.anyKo += r.stats.ko ? 1 : 0; sum.won += r.stats.won; sum.met += r.stats.met; sum.fled += r.stats.fled;
    sum.chests += r.stats.chests; sum.secrets += r.stats.secrets; sum.steps += r.stats.steps; sum.acts += r.stats.acts;
    sum.floors += r.outcome.floors; sum.traps += r.stats.traps; sum.carried += r.outcome.how === 'carried' ? 1 : 0;
    lo = Math.min(lo, r.minutes); hi = Math.max(hi, r.minutes);
  }
  const avg = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / n]));
  return { n, ...avg, minMinutes: lo, maxMinutes: hi };
}
