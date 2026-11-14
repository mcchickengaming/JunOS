// THE ENCOUNTER ENGINE (#32). Decided Nov 13: ONE engine, several paces.
//
// Everyone has a meter that fills with their speed; a full meter is a go. The pace only says how
// time moves:
//   'turn'  (default): time jumps straight to the next full meter and waits for you as long as you like
//   'timed': meters fill in real time; while you choose, everyone else's runs slow (tune.fight.timedWait)
//   'real' : meters fill in real time and nothing waits for you
// So a place can pick the pace that suits it and the player can override it; "no timers"
// (accessibility) is simply 'turn' everywhere. Optional action moments from the minigames (#23) plug
// in later as a × on one hit: act(…, { skill: 0..1 }) is the door, nothing calls it yet.
//
// A fight is plain data (it can be saved mid-fight) and takes its dice from its own seed, so the
// time-lapse and the tests replay it exactly. No DOM, no storage, no clock: advance(enc, ms) is told
// how much time passed.
//
// Kind danger (decided Nov 13): backing off always works and costs nothing. You going down ends the
// fight as 'ko' (the care scene takes over; nothing is lost). Her going down is never an ending: she
// sits the rest out and is back on her feet afterwards.

import { next } from './rng.js?v=1';
import { tune as getTune } from './delve-tune.js?v=2';

export const PACES = [['turn', 'Turn-based'], ['timed', 'Timed turns'], ['real', 'Real-time']];
export const PACE_IDS = PACES.map(p => p[0]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const alive = (enc, side) => enc.units.filter(u => u.side === side && !u.out);
const unit = (enc, id) => enc.units.find(u => u.id === id);
const other = (side) => (side === 'us' ? 'them' : 'us');

// us: fighters from abilities.js build() (ctl: 'you' = waits for input, 'her' / 'auto' = picks her own go)
// them: creatures from abilities.js foe()
export function create(data, { us, them, pace = 'turn', seed = 1, herRole = 'decides', tune } = {}) {
  const fresh = (u, i) => ({ ...u, meter: 0, cd: {}, st: {}, out: u.hp <= 0, order: i });
  const enc = {
    v: 1, pace: PACE_IDS.includes(pace) ? pace : 'turn', rs: { s: seed >>> 0 }, t: 0, acts: 0, herRole,
    units: [...us.map(u => ({ ctl: u.who === 'jun' ? 'her' : 'you', ...u })), ...them.map(u => ({ ctl: 'foe', ...u }))].map(fresh),
    waiting: null, over: null, log: [],
  };
  // a small head start by speed so the first go isn't always the same
  for (const u of enc.units) u.meter = clamp(u.spd / 40 + next(enc.rs) * 0.25, 0, 0.9);
  return enc;
}

export const isOver = (enc) => enc.over;
export const waitingFor = (enc) => (enc.waiting ? unit(enc, enc.waiting) : null);

// what this fighter may do right now: [{ id, name, ready, cd, targets: [unit ids] }]
export function options(data, enc, id) {
  const u = unit(enc, id);
  if (!u || u.out) return [];
  const list = u.abilities.filter(a => a !== 'shove' || !u.abilities.some(b => b !== 'shove' && data.abilities[b]?.kind === 'hit'));
  return list.map(a => {
    const A = data.abilities[a];
    return { id: a, name: (u.who === 'jun' && A.nameHer) || A.name, line: A.line || '', kind: A.kind, cd: u.cd[a] || 0, ready: !(u.cd[a] > 0), targets: targetsOf(data, enc, u, A) };
  });
}

function targetsOf(data, enc, u, A) {
  if (A.target === 'self') return [u.id];
  if (A.kind === 'cover') return alive(enc, u.side).filter(x => x.id !== u.id).map(x => x.id);
  if (A.target === 'ally') return alive(enc, u.side).map(x => x.id);
  let foes = alive(enc, other(u.side));
  if (A.only) foes = foes.filter(x => x.kind === A.only);
  return foes.map(x => x.id);
}

function fillRate(enc, u, t) {
  return (u.spd / 10) / t.fight.meterSec;
}

// time passes. Returns what happened: [{ type, … }] (also kept in enc.log, newest last)
export function advance(data, enc, ms = 0, tune) {
  const t = tune || getTune();
  const out = [];
  let guard = 0;
  while (!enc.over && guard++ < 200) {
    if (enc.waiting) {
      if (enc.pace === 'turn' || ms <= 0) break;
    }
    const live = enc.units.filter(u => !u.out);
    if (enc.pace === 'turn') {
      // jump to the next full meter
      let dt = Infinity;
      for (const u of live) dt = Math.min(dt, Math.max(0, (1 - u.meter) / fillRate(enc, u, t)));
      for (const u of live) u.meter += dt * fillRate(enc, u, t);
      enc.t += dt * 1000;
    } else {
      if (ms <= 0) break;
      const step = Math.min(ms, 50);
      ms -= step;
      const k = enc.pace === 'real' ? t.fight.realSpeed : 1;
      const slow = enc.pace === 'timed' && enc.waiting ? t.fight.timedWait : 1;
      for (const u of live) if (u.id !== enc.waiting) u.meter = Math.min(1, u.meter + (step / 1000) * fillRate(enc, u, t) * k * slow);
      enc.t += step;
    }
    // whoever is full goes: the fullest first, then the quickest
    const ready = enc.units.filter(u => !u.out && u.meter >= 1 - 1e-9 && u.id !== enc.waiting).sort((a, b) => b.meter - a.meter || b.spd - a.spd || a.order - b.order);
    for (const u of ready) {
      if (enc.over || u.out) continue;
      if (u.st.stun > 0) { u.st.stun--; u.meter = 0; tickOwn(u); push(enc, out, { type: 'skip', who: u.id, name: u.name }); continue; }
      if (u.ctl === 'you') { if (!enc.waiting) { enc.waiting = u.id; push(enc, out, { type: 'ready', who: u.id }); } continue; }
      const pick = choose(data, enc, u);
      out.push(...act(data, enc, u.id, pick.ability, pick.target, { tune: t }));
    }
  }
  return out;
}

function push(enc, out, ev) { out.push(ev); enc.log.push(ev); if (enc.log.length > 60) enc.log.shift(); }

// a fighter's own go begins: their guard drops, their cooldowns and timed effects count down
function tickOwn(u) {
  u.st.guard = 0; u.st.cover = null;
  for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
  for (const k of ['taunt', 'rally', 'exposed']) if (u.st[k] && --u.st[k].n <= 0) u.st[k] = null;
}

// a go. Returns the events, or [{ type: 'no', why }] if it can't be done (nothing changes then).
// o.skill 0..1: an action moment's result (#23), × on a hit: 0.5 = no moment played
export function act(data, enc, id, abilityId, targetId, o = {}) {
  const t = o.tune || getTune();
  const u = unit(enc, id);
  const A = data.abilities[abilityId];
  const out = [];
  if (enc.over) return [{ type: 'no', why: 'over' }];
  if (!u || u.out || !A || !u.abilities.includes(abilityId)) return [{ type: 'no', why: 'unknown' }];
  if (u.meter < 1 - 1e-9) return [{ type: 'no', why: 'not_ready' }];
  if (u.cd[abilityId] > 0) return [{ type: 'no', why: 'cooldown' }];
  const targets = targetsOf(data, enc, u, A);
  if (!targets.length) return [{ type: 'no', why: 'no_target' }];
  if (!targets.includes(targetId)) targetId = targets[0];
  const target = unit(enc, targetId);

  tickOwn(u);
  u.meter = 0;
  enc.acts++;
  if (enc.waiting === u.id) enc.waiting = null;
  if (A.cd) u.cd[abilityId] = A.cd + 1; // +1: it counts down at the start of their next go
  const base = { who: u.id, name: u.name, side: u.side, ability: abilityId, label: (u.who === 'jun' && A.nameHer) || A.name };

  if (A.kind === 'hit') {
    const list = A.all ? alive(enc, other(u.side)) : [target];
    for (const first of list) {
      for (let h = 0; h < (A.hits || 1); h++) {
        if (enc.over) break;
        // drawn in, or someone stepped in front
        let tg = first;
        if (!A.all && u.st.taunt && unit(enc, u.st.taunt.by) && !unit(enc, u.st.taunt.by).out) tg = unit(enc, u.st.taunt.by);
        let covered = false;
        const cover = alive(enc, tg.side).find(x => x.st.cover === tg.id);
        if (cover) { tg = cover; covered = true; }
        if (tg.out) continue;
        const chance = clamp(t.fight.hit + u.acc + (A.acc || 0) - tg.eva, t.fight.hitMin, t.fight.hitMax);
        if (next(enc.rs) * 100 >= chance) { push(enc, out, { ...base, type: 'miss', to: tg.id, toName: tg.name }); continue; }
        let dmg = u.atk * A.power * (u.st.rally ? u.st.rally.k : 1) - tg.def * t.fight.defWorth;
        dmg *= 1 + (next(enc.rs) * 2 - 1) * t.fight.spread;
        if (Number.isFinite(o.skill)) dmg *= 0.75 + 0.5 * clamp(o.skill, 0, 1);
        if (tg.st.exposed) dmg *= tg.st.exposed.k;
        if (tg.st.guard) dmg *= t.fight.guard;
        if (covered) dmg *= t.fight.cover;
        dmg = Math.max(1, Math.round(dmg));
        tg.hp = Math.max(0, tg.hp - dmg);
        push(enc, out, { ...base, type: 'hit', to: tg.id, toName: tg.name, dmg, left: tg.hp, covered });
        if (tg.hp <= 0) down(enc, out, tg);
      }
    }
  } else if (A.kind === 'guard') {
    u.st.guard = 1;
    push(enc, out, { ...base, type: 'guard' });
  } else if (A.kind === 'cover') {
    u.st.cover = target.id; u.st.guard = 0;
    push(enc, out, { ...base, type: 'cover', to: target.id, toName: target.name });
  } else if (A.kind === 'taunt') {
    for (const f of alive(enc, other(u.side))) f.st.taunt = { by: u.id, n: (A.turns || 2) + 1 }; // +1: it counts down as their go begins
    push(enc, out, { ...base, type: 'taunt' });
  } else if (A.kind === 'heal') {
    const amount = Math.max(1, Math.round(target.max * A.power * (1 + u.mend / 10)));
    const before = target.hp;
    target.hp = Math.min(target.max, target.hp + amount);
    push(enc, out, { ...base, type: 'heal', to: target.id, toName: target.name, amount: target.hp - before, left: target.hp });
  } else if (A.kind === 'rally') {
    target.st.rally = { k: A.power, n: (A.turns || 2) + 1 };
    push(enc, out, { ...base, type: 'rally', to: target.id, toName: target.name });
  } else if (A.kind === 'expose') {
    for (const f of A.all ? alive(enc, other(u.side)) : [target]) f.st.exposed = { k: A.power, n: A.turns || 2 };
    push(enc, out, { ...base, type: 'expose', to: A.all ? null : target.id, toName: A.all ? 'all of them' : target.name });
  } else if (A.kind === 'stun') {
    const chance = clamp(t.fight.hackBase + u.tech - (target.big ? 25 : 0), 10, 98);
    if (next(enc.rs) * 100 < chance) { target.st.stun = (target.st.stun || 0) + 1; push(enc, out, { ...base, type: 'stun', to: target.id, toName: target.name }); }
    else push(enc, out, { ...base, type: 'miss', to: target.id, toName: target.name });
  }
  if (!enc.over && enc.acts >= t.fight.maxActs) finish(enc, out, 'draw');
  return out;
}

function down(enc, out, u) {
  u.out = true; u.meter = 0; u.st = {};
  if (enc.waiting === u.id) enc.waiting = null;
  push(enc, out, { type: 'down', who: u.id, name: u.name, side: u.side });
  if (!alive(enc, 'them').length) return finish(enc, out, 'won');
  // you going down ends it (the care scene); her going down never does. With nobody left standing it's also 'ko'.
  const you = enc.units.find(x => x.ctl === 'you' || x.ctl === 'auto');
  if ((you && you.out) || !alive(enc, 'us').length) finish(enc, out, 'ko');
}

function finish(enc, out, how) {
  enc.over = how; enc.waiting = null;
  push(enc, out, { type: 'over', how });
}

// backing off: always works, costs nothing, the creatures stay where they were
export function flee(enc) {
  if (enc.over) return [];
  const out = [];
  finish(enc, out, 'fled');
  return out;
}

// what the fight left behind, for the delve: health carried on, how hard it was
export function result(enc, tune) {
  const t = tune || getTune();
  const you = enc.units.find(u => u.ctl === 'you' || u.ctl === 'auto');
  const her = enc.units.find(u => u.ctl === 'her');
  return {
    how: enc.over, acts: enc.acts, ms: enc.t,
    you: you ? { hp: you.hp, max: you.max } : null,
    // she's never left down: back on her feet with a share of her health
    her: her ? { hp: her.out ? Math.max(1, Math.round(her.max * t.fight.herDownHp)) : her.hp, max: her.max, wentDown: her.out } : null,
    hard: !!you && enc.over === 'won' && you.hp / you.max < 0.3,
    big: enc.units.some(u => u.big),
  };
}

// ---------------------------------------------------------------
// who does what on their own: creatures, her, and a stand-in player for the time-lapse

const hpShare = (u) => u.hp / u.max;

export function choose(data, enc, u) {
  const opts = options(data, enc, u.id).filter(o => o.ready && o.targets.length);
  if (!opts.length) return { ability: 'shove', target: (alive(enc, other(u.side))[0] || u).id };
  const rnd = () => next(enc.rs);
  const foes = alive(enc, other(u.side));
  const weakest = (list) => list.slice().sort((a, b) => a.hp - b.hp)[0];
  const strongest = (list) => list.slice().sort((a, b) => b.hp * b.atk - a.hp * a.atk)[0];

  if (u.ctl === 'foe') {
    const list = opts.map(o => [o, u.weights?.[o.id] ?? 1]);
    let r = rnd() * list.reduce((a, x) => a + x[1], 0);
    let pick = list[0][0];
    for (const [o, w] of list) { r -= w; if (r <= 0) { pick = o; break; } }
    // creatures mostly go for whoever is in front of them, sometimes for whoever looks hurt
    const tg = rnd() < 0.3 ? weakest(foes) : foes[Math.floor(rnd() * foes.length)];
    return { ability: pick.id, target: pick.targets.includes(tg.id) ? tg.id : pick.targets[0] };
  }

  // score every go by what the fight needs; her role (or the stand-in player) weighs the kinds
  const mates = alive(enc, u.side);
  const hurt = mates.slice().sort((a, b) => hpShare(a) - hpShare(b))[0];
  const want = u.ctl === 'her' ? (data.roles[enc.herRole]?.want || null) : null; // null = she decides / the stand-in: need only
  let best = null;
  for (const o of opts) {
    const A = data.abilities[o.id];
    const tag = (A.tags || ['dps'])[0];
    let score = 0, target = o.targets[0];
    if (A.kind === 'heal') {
      const tg = o.targets.map(id => unit(enc, id)).sort((a, b) => hpShare(a) - hpShare(b))[0];
      target = tg.id;
      const s = hpShare(tg);
      score = s < 0.35 ? 9 : s < 0.6 ? 4 : s < 0.8 ? 0.6 : -5;
    } else if (A.kind === 'hit') {
      const tg = A.all ? foes[0] : (weakest(foes.filter(f => o.targets.includes(f.id))) || foes[0]);
      target = tg.id;
      score = 2 * A.power * (A.hits || 1) * (A.all ? Math.min(foes.length, 2) * 0.8 : 1) * (tg.st.exposed ? 1.2 : 1);
    } else if (A.kind === 'expose') {
      const list = foes.filter(f => !f.st.exposed && o.targets.includes(f.id));
      const tg = strongest(list);
      if (tg) { target = tg.id; score = (A.all ? 1.2 * list.length : 1) * (tg.hp > tg.max * 0.4 ? 3.2 : 0.5); } else score = -5;
    } else if (A.kind === 'stun') {
      const list = foes.filter(f => !f.st.stun && o.targets.includes(f.id));
      const tg = strongest(list);
      if (tg) { target = tg.id; score = 2.6 + (tg.big ? 0.8 : 0) + (hpShare(hurt) < 0.5 ? 1.5 : 0); } else score = -5;
    } else if (A.kind === 'taunt') {
      score = foes.some(f => !f.st.taunt) && mates.length > 1 && hpShare(u) > 0.5 ? 2.4 : -5;
    } else if (A.kind === 'cover') {
      const tg = unit(enc, o.targets[0]);
      score = tg && hpShare(tg) < 0.5 && hpShare(u) > 0.5 ? 3.4 : 0.2;
    } else if (A.kind === 'guard') {
      score = hpShare(u) < 0.3 ? 2.2 : 0.2;
    } else if (A.kind === 'rally') {
      const tg = o.targets.map(id => unit(enc, id)).find(x => x.id !== u.id && !x.st.rally);
      if (tg) { target = tg.id; score = 2.2; } else score = -5;
    }
    // her role leans her toward its kind; real need (someone badly hurt) still wins
    if (want) score *= score > 0 ? (want[tag] ?? 0.5) : 1;
    score += rnd() * 0.6; // never quite the same fight twice
    if (!best || score > best.score) best = { ability: o.id, target, score };
  }
  return best;
}

// a whole fight played out by the stand-ins (the time-lapse and the tests)
export function autoplay(data, enc, tune) {
  const t = tune || getTune();
  const events = [];
  let guard = 0;
  while (!enc.over && guard++ < 5000) {
    events.push(...advance(data, enc, enc.pace === 'turn' ? 0 : 50, t));
    const w = waitingFor(enc);
    if (w) { const pick = choose(data, enc, w); events.push(...act(data, enc, w.id, pick.ability, pick.target, { tune: t })); }
  }
  return events;
}
