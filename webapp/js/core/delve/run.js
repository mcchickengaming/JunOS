// one delve, as plain data (#32): where you are, what you've seen, what's been opened, beaten or
// slipped past. Movement is the first-person grid kind: a step or a quarter turn at a time.
// The floor itself is never saved: it comes back from (area, depth, seed) every time (floor.js).
//
// Kind danger (decided Nov 13), all enforced here and tested:
//   · you can leave at any time; nothing is ever lost
//   · a trap never takes your last bit of health
//   · backing off from a fight always works; afterwards the creatures let you slip past
//   · knocked out = the care scene (scenes.js), then you go on from the camp or you're home
//   · a delve that went badly still counts (tune.run.qualityFloor)
// She's in it, never in the way: every function here returns EVENTS; her words and face come from
// party.js reading those events. Nothing in a delve waits for her or for a touch.
//
// No DOM, no storage, no clock in here.

import { generate, WALL, FLOOR, DOOR, SECRET, DX, DY } from './floor.js?v=1';
import { next, mix } from './rng.js?v=1';
import { tune as getTune } from './delve-tune.js?v=1';
import * as Ab from './abilities.js?v=1';
import * as Enc from './encounter.js?v=1';
import * as Party from './party.js?v=1';

const SOLID = ['chest', 'vault', 'terminal'];
const floors = new Map();

let lastRun = null, lastDepth = 0, lastFloor = null;
export function floorOf(data, run, tune) {
  if (run === lastRun && run.depth === lastDepth && lastFloor.seed === run.seed && lastFloor.area === run.area) return lastFloor;
  lastRun = run; lastDepth = run.depth;
  return (lastFloor = floorFor(data, run, tune));
}
function floorFor(data, run, tune) {
  const key = run.area + '|' + run.depth + '|' + run.seed;
  if (!floors.has(key)) {
    if (floors.size > 12) floors.clear();
    floors.set(key, generate(data, { area: run.area, depth: run.depth, seed: run.seed, tune }));
  }
  return floors.get(key);
}

// o: { area, seed, together, role, pace, levels: { player: {…}, jun: {…} }, effects, kits: { player, jun },
//      courage: her courage setting ('grows' | 'timid' | 'steady' | 'brave'), stage: bond stage (words only) }
export function start(data, o = {}, tune) {
  const t = tune || getTune();
  const area = data.areas[o.area] ? o.area : Object.keys(data.areas)[0];
  const A = data.areas[area];
  const levels = { player: { delving: 1, ...(o.levels?.player || {}) }, jun: { delving: 1, ...(o.levels?.jun || {}) } };
  const together = o.together !== false;
  const pace = Enc.PACE_IDS.includes(o.pace) ? o.pace : (Enc.PACE_IDS.includes(A.pace) ? A.pace : 'turn');
  const run = {
    v: 1, area, seed: (o.seed ?? 1) >>> 0, depth: 1, floors: A.floors, together, pace,
    role: data.roles[o.role] ? o.role : 'decides',
    setup: { levels, effects: o.effects || {}, kits: { player: o.kits?.player || data.defaultKits.player, jun: o.kits?.jun || data.defaultKits.jun }, courage: o.courage || 'grows', stage: o.stage || 1 },
    pos: null, hp: null, seen: {}, done: {}, found: {}, hint: {}, rolled: {},
    rs: { s: mix('run', area, o.seed ?? 1) }, state: 'walk', enc: null, fightAt: null,
    queue: [], said: { recent: [] }, wish: null, emptyTold: {},
    stats: { steps: 0, turns: 0, met: 0, won: 0, fled: 0, ko: 0, chests: 0, secrets: 0, traps: 0, camps: 0, vault: false, floorsDone: 0, acts: 0 },
    outcome: null,
  };
  const you = Ab.build(data, 'player', { levels: levels.player, effects: run.setup.effects, kits: run.setup.kits.player, tune: t });
  const her = together ? Ab.build(data, 'jun', { levels: levels.jun, kits: run.setup.kits.jun, tune: t }) : null;
  run.hp = { you: { hp: you.max, max: you.max }, her: her ? { hp: her.max, max: her.max } : null };
  const f = floorOf(data, run, t);
  run.pos = { ...f.start };
  const events = [{ type: 'entered', area, name: A.name }];
  // she stayed home: now and then she asks you to bring something back
  if (!together && next(run.rs) < t.run.wishChance) { run.wish = { got: false }; events.push({ type: 'wish' }); }
  events.push(...look(data, run, t));
  return { run, events };
}

// ---------------------------------------------------------------
// the floor as the player knows it

const key = (run, at) => run.depth + ':' + at;
export function cellAt(data, run, x, y) {
  const f = floorOf(data, run);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return WALL;
  const c = f.cells[y * f.w + x];
  if (c === SECRET) return run.found[key(run, y * f.w + x)] ? DOOR : WALL;
  return c;
}
export const isSecretHinted = (data, run, x, y) => { const f = floorOf(data, run); return f.cells[y * f.w + x] === SECRET && !!run.hint[key(run, y * f.w + x)] && !run.found[key(run, y * f.w + x)]; };
export function thingAt(data, run, x, y) {
  const f = floorOf(data, run);
  return (x >= 0 && y >= 0 && x < f.w && y < f.h && f.index.get(y * f.w + x)) || null;
}
export const stateOf = (run, thing) => run.done[thing.id] || null;
const solid = (run, th) => !!th && (SOLID.includes(th.kind) || (th.kind === 'foe' && !run.done[th.id]));
export const ahead = (run, n = 1) => ({ x: run.pos.x + DX[run.pos.d] * n, y: run.pos.y + DY[run.pos.d] * n });
export function seenAt(data, run, x, y) {
  const f = floorOf(data, run);
  return !!(run.seen[run.depth] && run.seen[run.depth][y * f.w + x]);
}

function mark(run, f, x, y) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
  (run.seen[run.depth] ||= new Array(f.w * f.h).fill(0))[y * f.w + x] = 1;
}

// what you (and her scanner) take in from where you stand
function look(data, run, t) {
  const f = floorOf(data, run, t);
  const { x, y, d } = run.pos;
  const events = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(run, f, x + dx, y + dy);
  for (let n = 1; n <= t.walk.sight; n++) {
    const cx = x + DX[d] * n, cy = y + DY[d] * n;
    mark(run, f, cx, cy);
    // the walls beside the cell ahead, so a corridor draws as a corridor on the map
    mark(run, f, cx + DX[(d + 1) % 4], cy + DY[(d + 1) % 4]);
    mark(run, f, cx + DX[(d + 3) % 4], cy + DY[(d + 3) % 4]);
    if (cellAt(data, run, cx, cy) === WALL || solid(run, thingAt(data, run, cx, cy))) break;
  }
  // her scanner: it maps a little around you, and may notice what's hidden (each thing gets one chance)
  const scan = run.together ? (run.setup.levels.jun.scanning || 0) : 0;
  if (scan > 0) {
    const r = t.walk.scanBase + Math.floor(scan / t.walk.scanPerLevels);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) mark(run, f, x + dx, y + dy);
    const chance = t.walk.senseBase + (t.walk.senseTop - t.walk.senseBase) * (scan - 1) / 98;
    const once = (id) => { if (run.rolled[id]) return false; run.rolled[id] = 1; return next(run.rs) < chance; };
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const cx = x + dx, cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= f.w || cy >= f.h) continue;
      const at = cy * f.w + cx;
      if (f.cells[at] === SECRET && !run.found[key(run, at)] && !run.hint[key(run, at)] && once('s' + key(run, at))) {
        run.hint[key(run, at)] = 1; mark(run, f, cx, cy);
        events.push({ type: 'sensed', what: 'secret', x: cx, y: cy });
      }
      const th = thingAt(data, run, cx, cy);
      if (th && th.kind === 'trap' && !run.done[th.id] && once('t' + th.id)) {
        run.done[th.id] = 'known';
        events.push({ type: 'sensed', what: 'trap', x: cx, y: cy });
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------
// moving

export function turn(data, run, k, tune) {
  if (run.state !== 'walk') return [];
  run.pos.d = (run.pos.d + (k > 0 ? 1 : 3)) % 4;
  run.stats.turns++;
  return [{ type: 'turned', d: run.pos.d }, ...look(data, run, tune || getTune())];
}

// rel: 0 forward, 1 step right, 2 back, 3 step left (you keep facing the same way)
export function step(data, run, rel = 0, tune) {
  const t = tune || getTune();
  if (run.state !== 'walk') return [];
  const d = (run.pos.d + rel) % 4;
  const nx = run.pos.x + DX[d], ny = run.pos.y + DY[d];
  const f = floorOf(data, run, t);
  const th = thingAt(data, run, nx, ny);
  if (cellAt(data, run, nx, ny) === WALL) {
    // a wall she pointed out opens when you lean on it
    if (isSecretHinted(data, run, nx, ny)) return openSecret(data, run, nx, ny, t);
    return [{ type: 'bump', what: 'wall' }];
  }
  if (th && th.kind === 'foe' && !run.done[th.id]) return beginFight(data, run, th, t);
  if (th && SOLID.includes(th.kind)) return [{ type: 'bump', what: th.kind, done: !!run.done[th.id] }];
  run.pos.x = nx; run.pos.y = ny;
  run.stats.steps++;
  const events = [{ type: 'moved', x: nx, y: ny }];
  events.push(...look(data, run, t));
  if (th && !run.done[th.id]) {
    if (th.kind === 'trap') {
      const h = run.hp.you;
      const dmg = Math.min(Math.max(0, h.hp - 1), Math.round(h.max * t.walk.trapHurt)); // never the last of it
      h.hp -= dmg; run.done[th.id] = 'sprung'; run.stats.traps++;
      events.push({ type: 'trap', dmg });
    } else if (th.kind === 'odd') { run.done[th.id] = 'seen'; events.push({ type: 'odd' }); }
    else if (th.kind === 'camp') events.push({ type: 'camp' });
    else if (th.kind === 'stairs') events.push({ type: 'stairs' });
  } else if (th && th.kind === 'trap' && run.done[th.id] === 'known') {
    run.done[th.id] = 'avoided';
    events.push({ type: 'trap_avoided' });
  } else if (th && (th.kind === 'camp' || th.kind === 'stairs')) events.push({ type: th.kind });
  if (th && th.kind === 'exit' && run.stats.steps > 1) events.push({ type: 'exit' });
  if (run.stats.steps % t.walk.corridorEvery === 0 && events.length === 1) events.push({ type: 'quiet' }); // a passing remark, only when nothing else happened
  return events;
}

function openSecret(data, run, x, y, t) {
  const f = floorOf(data, run, t);
  run.found[key(run, y * f.w + x)] = 1; run.stats.secrets++;
  mark(run, f, x, y);
  return [{ type: 'secret', x, y }, ...look(data, run, t)];
}

// feel along the wall ahead for a hidden door (your own Scavenging helps; a wall she pointed out always gives)
export function search(data, run, tune) {
  const t = tune || getTune();
  if (run.state !== 'walk') return [];
  const { x, y } = ahead(run);
  const f = floorOf(data, run, t);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return [{ type: 'nothing' }];
  const at = y * f.w + x;
  if (f.cells[at] !== SECRET || run.found[key(run, at)]) return [{ type: 'nothing' }];
  const sc = run.setup.levels.player.scavenging || 1;
  const luck = (run.setup.effects.luck || 0) * 0.02;
  const chance = run.hint[key(run, at)] ? 1 : t.walk.searchBase + (t.walk.searchTop - t.walk.searchBase) * (sc - 1) / 98 + luck;
  if (next(run.rs) < chance) return openSecret(data, run, x, y, t);
  return [{ type: 'nothing', maybe: true }];
}

// Space: what's under your feet first, then what's in front of you, then the wall
export function use(data, run, tune) {
  const t = tune || getTune();
  if (run.state !== 'walk') return [];
  const here = thingAt(data, run, run.pos.x, run.pos.y);
  const a = ahead(run);
  const front = thingAt(data, run, a.x, a.y);
  if (here && here.kind === 'camp') return rest(data, run, here, t);
  if (here && here.kind === 'stairs') return descend(data, run, t);
  if (here && here.kind === 'exit') return leave(data, run, 'home', t);
  if (front && !run.done[front.id]) {
    if (front.kind === 'chest') {
      run.done[front.id] = 'open'; run.stats.chests++;
      const ev = [{ type: 'chest' }];
      if (run.wish && !run.wish.got) { run.wish.got = true; ev.push({ type: 'wish_got' }); }
      return [...ev, ...emptyCheck(data, run, t)];
    }
    if (front.kind === 'vault') {
      run.done[front.id] = 'open'; run.stats.vault = true; run.stats.chests++; run.stats.floorsDone = run.floors;
      return [{ type: 'vault' }];
    }
    if (front.kind === 'terminal') {
      const hack = run.together ? (run.setup.levels.jun.hacking || 0) : 0;
      if (hack <= 0) return [{ type: 'terminal', hacked: false }];
      run.done[front.id] = 'used';
      // an old terminal knows its floor: the whole map, and where the walls are hollow
      const f = floorOf(data, run, t);
      run.seen[run.depth] = new Array(f.w * f.h).fill(1);
      for (let at = 0; at < f.cells.length; at++) if (f.cells[at] === SECRET && !run.found[key(run, at)]) run.hint[key(run, at)] = 1;
      for (const th of f.things) if (th.kind === 'trap' && !run.done[th.id]) run.done[th.id] = 'known';
      return [{ type: 'terminal', hacked: true }];
    }
    if (front.kind === 'foe') return beginFight(data, run, front, t);
  }
  return search(data, run, t);
}

function emptyCheck(data, run, t) {
  if (run.emptyTold[run.depth]) return [];
  const f = floorOf(data, run, t);
  const left = f.things.some(th => (th.kind === 'foe' || th.kind === 'chest') && !run.done[th.id] && seenAt(data, run, th.x, th.y));
  if (left) return [];
  const any = f.things.some(th => (th.kind === 'foe' || th.kind === 'chest') && run.done[th.id]);
  if (!any) return [];
  run.emptyTold[run.depth] = 1;
  return [{ type: 'empty' }];
}

function rest(data, run, camp, t) {
  for (const h of [run.hp.you, run.hp.her]) if (h) h.hp = Math.max(h.hp, Math.round(h.max * t.run.campHeal));
  const first = !run.done[camp.id];
  run.done[camp.id] = 'rested';
  if (first) run.stats.camps++;
  return [{ type: 'rested', first }];
}

function descend(data, run, t) {
  if (run.depth >= run.floors) return [];
  run.stats.floorsDone = Math.max(run.stats.floorsDone, run.depth);
  run.depth++;
  const f = floorOf(data, run, t);
  run.pos = { ...f.start };
  return [{ type: 'descended', depth: run.depth, last: f.last }, ...look(data, run, t)];
}

// leaving: any time, from anywhere (the "Head home" button), or by walking out the way you came
export function leave(data, run, how = 'home', tune) {
  if (run.state === 'over') return [];
  run.state = 'over'; run.enc = null;
  run.outcome = outcome(data, run, how, tune || getTune());
  return [{ type: 'left', how, outcome: run.outcome }];
}

// ---------------------------------------------------------------
// meeting something

export function fighters(data, run, t) {
  const s = run.setup;
  const you = Ab.build(data, 'player', { levels: s.levels.player, effects: s.effects, kits: s.kits.player, tune: t });
  you.hp = Math.max(1, Math.min(you.max, run.hp.you.hp));
  const us = [you];
  if (run.together) {
    const her = Ab.build(data, 'jun', { levels: s.levels.jun, kits: s.kits.jun, tune: t });
    her.hp = Math.max(1, Math.min(her.max, run.hp.her.hp));
    us.push(her);
  }
  return us;
}

function beginFight(data, run, thing, t) {
  const level = Ab.placeLevel(data.areas[run.area], run.depth, run.setup.levels.player.delving, t);
  const them = Ab.foesFor(data, thing.foes, level, { alone: !run.together, tune: t });
  run.enc = Enc.create(data, { us: fighters(data, run, t), them, pace: run.pace, seed: mix('fight', run.seed, thing.id, run.stats.met), herRole: run.role, tune: t });
  run.state = 'fight'; run.fightAt = thing.id; run.stats.met++;
  return [{ type: 'fight', big: !!thing.big, foes: them.map(f => f.name) }];
}

// the fight is over (won, backed off, a draw, or you went down): carry it into the delve
export function endFight(data, run, tune) {
  const t = tune || getTune();
  if (run.state !== 'fight' || !run.enc || !run.enc.over) return [];
  const r = Enc.result(run.enc, t);
  run.stats.acts += r.acts;
  if (r.you) run.hp.you.hp = Math.max(r.how === 'ko' ? 0 : 1, r.you.hp);
  if (r.her && run.hp.her) run.hp.her.hp = r.her.hp;
  const id = run.fightAt;
  run.enc = null; run.fightAt = null;
  const ev = { type: 'fight_over', how: r.how, hard: r.hard, big: r.big, herDown: !!r.her?.wentDown };
  if (r.how === 'won') {
    run.done[id] = 'won'; run.stats.won++; run.state = 'walk';
    if (!run.together) run.hp.you.hp = Math.min(run.hp.you.max, run.hp.you.hp + Math.round(run.hp.you.max * t.run.aloneBreather));
    return [ev, ...emptyCheck(data, run, t)];
  }
  if (r.how === 'ko') { run.stats.ko++; run.state = 'ko'; return [ev, { type: 'ko' }]; }
  // backed off (or nobody could finish it): they lose interest and you can slip past
  run.done[id] = 'fled'; run.stats.fled++; run.state = 'walk';
  return [ev];
}

// where the care scene can happen: at this floor's camp if you've rested there, else home.
// She stayed home: she comes down for you ('alone').
export function careWhere(data, run) {
  if (!run.together) return 'alone';
  const camp = floorOf(data, run).things.find(th => th.kind === 'camp' && run.done[th.id] === 'rested');
  return camp ? 'camp' : 'home';
}

// after the care scene. where 'camp': patched up, you go on from the camp. Otherwise you're home.
// Nothing is taken either way.
export function afterCare(data, run, where, tune) {
  const t = tune || getTune();
  if (run.state !== 'ko') return [];
  const camp = where === 'camp' ? floorOf(data, run, t).things.find(th => th.kind === 'camp' && run.done[th.id] === 'rested') : null;
  if (camp) {
    run.hp.you.hp = Math.max(1, Math.round(run.hp.you.max * t.run.wakeHp));
    if (run.hp.her) run.hp.her.hp = Math.max(run.hp.her.hp, Math.round(run.hp.her.max * t.run.wakeHp));
    run.pos.x = camp.x; run.pos.y = camp.y;
    run.state = 'walk';
    return [{ type: 'woke', where: 'camp' }, ...look(data, run, t)];
  }
  run.hp.you.hp = Math.max(1, Math.round(run.hp.you.max * t.run.wakeHp));
  run.state = 'walk';
  return leave(data, run, 'carried', t);
}

// ---------------------------------------------------------------
// what the delve was worth. quality 0..1 goes to the progression service (Progress.finish), which
// turns real minutes × quality into xp and rolls the finds with its ONE reward roller: a delve has
// no reward numbers of its own, on purpose (rewards stay fair across activities). Chests, fights
// and floors only lift the quality; a bad delve never drops under the floor.
export function outcome(data, run, how, tune) {
  const t = (tune || getTune()).run;
  const s = run.stats;
  const floorsDone = s.vault ? run.floors : Math.max(s.floorsDone, run.depth - 1);
  const fights = s.met ? s.won / s.met : 0.5;
  const finds = Math.min(1, s.chests / Math.max(1, run.floors * 1.5));
  let seen = 0, all = 0;
  for (const list of Object.values(run.seen)) { all += list.length; seen += list.reduce((a, b) => a + b, 0); }
  const map = all ? Math.min(1, (seen / all) / 0.6) : 0;
  const core = (t.qFloors * (floorsDone / run.floors) + t.qFights * fights + t.qFinds * finds + t.qMap * map) / (t.qFloors + t.qFights + t.qFinds + t.qMap);
  const quality = Math.max(t.qualityFloor, Math.min(1, t.qualityFloor + t.qCore * core + (s.vault ? t.qVault : 0) + (s.ko ? 0 : t.qNoKo) + (s.secrets ? t.qSecret : 0)));
  return {
    how, quality: Math.round(quality * 100) / 100, cleared: !!s.vault, floors: floorsDone, of: run.floors,
    together: run.together, ko: s.ko, won: s.won, fled: s.fled, chests: s.chests, secrets: s.secrets,
    wish: run.wish ? (run.wish.got ? 'got' : 'missed') : null,
    carried: run.queue.slice(), // what she kept and never got to say: it rides home with her
  };
}

export { Party, Enc, Ab, WALL, FLOOR, DOOR, SECRET, DX, DY };
