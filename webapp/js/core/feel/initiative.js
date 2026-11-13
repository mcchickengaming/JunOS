// the initiative engine (#4): the part of her that decides, on her own, whether to do something,
// what, how loudly, and when. She has wants that fill up over time (faster when her needs fit),
// reads the room (room.js), picks something that makes sense or, most of the time, nothing,
// chooses a step on the ladder, and learns from how he answers.
//
//   the ladder   0 inner only · 1 a body hint · 2 a thought icon · 3 she comes over / does it
//                nearby · 4 says something short · 5 asks (a small yes/no bubble)
//                She starts low and climbs only while he's free and she still wants it.
//   answers      he took the hint (yes) · he said no · nothing (ignored). Never a penalty: by her
//                mood and a dice roll she tries harder, lets it go, pouts, pretends she didn't
//                care, takes it well, or offers something else.
//   an action    one row of ACTIONS: which needs feed it, how far she'd go at each bond stage,
//                which steps it has. A new thing she can start = one more row + how the page
//                plays its steps (js/desktop.js INIT_PLAY).
//
// Her brain (the LLM) is only asked for WORDS on step 4. Every decision here is plain arithmetic,
// so it's light enough to run all day next to a game.
//
// No DOM. step() / answer() / hisWave() are pure (state in, directives out) so the tests and the
// feel lab's time-lapse (simulate) run the very same code as the desktop. The "live" half at the
// bottom keeps the state in store.js ('jun.feel' → init) and reads his settings.

import * as Store from './store.js?v=4';
import { TUNE } from './tune.js?v=5';
import * as Needs from './needs.js?v=4';
import * as Repeat from './repeat.js?v=4';
import * as Room from './room.js?v=2';

export const RUNG_WORDS = ['keeps it to herself', 'a small hint', 'a thought bubble', 'comes over', 'says something', 'asks you'];
export const KINDS = { closeness: 'Closeness', play: 'Play' };
// how bold she may be (Settings): the highest step
export const BOLD = [[1, 'Just hints'], [2, 'Hints and thought bubbles'], [3, 'Comes over'], [4, 'Says something'], [5, 'Asks you']];

// cap: the highest step by bond stage (index 1 Stranger .. 6 Devoted; 0 = she'd never)
export const ACTIONS = {
  headpat: {
    name: 'a headpat', kind: 'closeness', needs: { affection: 0.7, attention: 0.3 },
    // a Stranger never asks, Familiar only glances at your hand, a Friend hints shyly, Close and up ask outright
    cap: [0, 0, 1, 3, 5, 5, 5], rungs: [1, 2, 3, 4, 5], touch: ['head'],
    icons: ['pat', 'heart', 'a_blush', 'a_happy'],
    ask: ['Headpat?', 'Pat my head?', '…headpat?', 'Head. Pat. Please?', 'One headpat?'],
    please: ['Just one?', 'Pretty please?', 'A tiny one?'], offer: 'Then… a headpat?',
    did: ['', 'glanced at your hand', 'thought about a headpat', 'came over for a headpat', 'said she\'d like a headpat', 'asked for a headpat'],
  },
  wave: {
    name: 'a wave', kind: 'closeness', needs: { attention: 1 },
    cap: [0, 3, 3, 3, 3, 3, 3], rungs: [3], cost: 0.5, again: 4, icons: ['wave'],
    did: ['', '', '', 'waved at you', '', ''],
  },
  fetch: {
    name: 'a game of fetch', kind: 'play', needs: { play: 0.8, stimulation: 0.2 },
    cap: [0, 0, 3, 5, 5, 5, 5], rungs: [1, 2, 3, 4, 5], needsBall: true,
    icons: ['ball', 'game', 'a_owo'],
    ask: ['Fetch?', 'Play fetch?', 'Throw it?', 'Ball?', 'One game?'],
    please: ['One throw?', 'Pretty please?', 'Just a quick one?'], offer: 'Then… fetch?',
    did: ['', 'looked around for her ball', 'thought about playing fetch', 'brought you her ball', 'said she wants to play', 'asked to play fetch'],
  },
};
export const IDS = Object.keys(ACTIONS);

// her mood of the day ("As she feels"): the same Jun leans a different way each day. x = how far
// each thing moves, times TUNE.init.moodSwing
export const DAY_MOODS = {
  easy: { words: 'easygoing', w: 3, play: 0, closeness: 0, persist: 0, all: 0 },
  playful: { words: 'playful', w: 2, play: 1, closeness: 0, persist: 0.5, all: 0.2 },
  cuddly: { words: 'cuddly', w: 2, play: -0.2, closeness: 1, persist: 0.3, all: 0.1 },
  quiet: { words: 'quiet', w: 1.5, play: -0.6, closeness: -0.3, persist: -1, all: -0.6 },
  clingy: { words: 'clingy', w: 1.5, play: 0.2, closeness: 0.6, persist: 1, all: 0.4 },
};
export function dayMood(u) {
  const list = Object.entries(DAY_MOODS);
  let r = u * list.reduce((a, [, m]) => a + m.w, 0);
  for (const [id, m] of list) { r -= m.w; if (r <= 0) return id; }
  return 'easy';
}
export const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// the settings' 0..100 as a multiplier (same curve as desktop/often.js: 0 → 0, 50 → 1, 100 → top)
export function mul(p, top = 2.2) {
  p = Number.isFinite(Number(p)) ? Math.max(0, Math.min(100, Number(p))) : 50;
  return p <= 50 ? p / 50 : 1 + (p - 50) / 50 * (top - 1);
}

export const fresh = () => ({ v: 1, wants: {}, learn: {}, day: { key: '', used: 0 }, log: [], cool: {}, lastEnd: 0, sulkUntil: 0,
  promise: null, ep: null, greetedAt: 0, hisWaves: [], room: null });
export function ensure(st) {
  const f = fresh();
  for (const k of Object.keys(f)) if (st[k] === undefined || st[k] === null && f[k] !== null) st[k] = f[k];
  return st;
}
export const DEFAULT_OPTS = { on: true, often: 50, asFeels: true, bold: 5, persist: 50, kinds: { closeness: 50, play: 50 }, talk: true };

// ---------------------------------------------------------------------------------------------
// small pieces

const needFit = (A, needs) => {
  if (!needs || !Object.keys(needs).length) return 0.5;
  let f = 0;
  for (const [k, w] of Object.entries(A.needs)) f += w * (needs[k] ?? 0.5);
  return clamp01(f);
};
function dayMul(inp, key) {
  if (inp.opts.asFeels === false) return 1;
  const m = DAY_MOODS[inp.day] || DAY_MOODS.easy;
  return Math.max(0.2, 1 + TUNE.init.moodSwing * ((m[key] || 0) + (key === 'persist' ? 0 : m.all)));
}
// how her mood right now sits with it: upset or scared she doesn't feel like playing; sleepy neither
function moodFit(A, inp) {
  let f = 1;
  const down = inp.mood === 'upset' || inp.mood === 'scared';
  if (A.kind === 'play') { if (down) f *= 0.4; if ((inp.needs?.rest || 0) >= 0.75) f *= 0.4; if (inp.mood === 'happy') f *= 1.2; }
  else if (inp.mood === 'upset' && (inp.stage || 3) < 4) f *= 0.6;
  return f;
}
// what she's learned he likes: a little more of what he takes up, a little less of what he turns down
function decayed(l, now) {
  if (!l) return { y: 0, i: 0, n: 0 };
  const k = Math.pow(0.5, Math.max(0, now - l.at) / (TUNE.init.learnHalfLifeDays * 24 * 3600e3));
  return { y: l.y * k, i: l.i * k, n: l.n * k };
}
export function learned(st, id, now) {
  const l = decayed(st.learn[id], now);
  return 1 + TUNE.init.learnSpan * (l.y - 0.5 * l.i - l.n) / (l.y + l.i + l.n + 3);
}
function learn(st, id, what, amount, now) {
  const l = decayed(st.learn[id], now);
  l[what] += amount;
  st.learn[id] = { ...l, at: now };
}
const lately = (st, id, now) => 1 / (1 + 0.5 * st.log.filter(e => e.id === id && now - e.at < 2 * 3600e3).length);
function budgetLeft(st, inp) {
  const total = TUNE.init.budget * Math.max(0.2, mul(inp.opts.often, 2));
  return clamp01(2 * (1 - st.day.used / total));
}
function urgeCap(w) { const T = TUNE.init; return w >= T.urge5 ? 5 : w >= T.urge4 ? 4 : w >= T.urge3 ? 3 : 2; }
function capFor(A, w, inp) {
  const stage = Math.max(1, Math.min(6, Math.round(inp.stage || 1)));
  return Math.min(A.cap[stage], inp.room.cap, inp.opts.bold ?? 5, urgeCap(w));
}
const rungsFor = (A, cap, inp) => A.rungs.filter(r => r <= cap && (r !== 4 || inp.opts.talk !== false));
const costOf = (A, rung) => A.cost ?? TUNE.init['cost' + rung] ?? 0;
const waitMs = (A, rung) => (A === ACTIONS.wave ? TUNE.init.waveBackMs : (TUNE.init['wait' + rung] || 15) * 1000);
const pickOf = (inp) => inp.pick || ((ch, list) => list[Math.floor(inp.rand() * list.length) % list.length]);
function weighted(pool, rand) {
  const list = pool.filter(x => x.w > 0);
  let r = rand() * list.reduce((a, x) => a + x.w, 0);
  for (const x of list) { r -= x.w; if (r <= 0) return x.id; }
  return list.length ? list[list.length - 1].id : null;
}
const NEED_WHY = { affection: 'she wanted some affection', attention: 'she wanted your attention', play: 'she felt like playing', stimulation: 'she was a bit bored' };
function whyOf(A, inp, extra = []) {
  const why = [...extra];
  const top = Object.keys(A.needs).sort((a, b) => (inp.needs?.[b] || 0) * A.needs[b] - (inp.needs?.[a] || 0) * A.needs[a])[0];
  if (top && (inp.needs?.[top] || 0) >= 0.4) why.push(NEED_WHY[top]);
  else why.push('just because');
  if (inp.opts.asFeels !== false && inp.day && inp.day !== 'easy') why.push('she\'s ' + DAY_MOODS[inp.day].words + ' today');
  if (Room.WHY[inp.room.why]) why.push(Room.WHY[inp.room.why]);
  return why;
}

function advance(st, inp) {
  const T = TUNE.init, now = inp.now;
  if (st.day.key !== dayKey(now)) st.day = { key: dayKey(now), used: 0 };
  for (const id of IDS) {
    const A = ACTIONS[id];
    const w = st.wants[id] || (st.wants[id] = { v: 0.2, at: now });
    const h = Math.max(0, Math.min(12, (now - w.at) / 3600e3));
    w.v = clamp01(w.v + (T.rise[id] || 0.1) * (0.4 + 1.2 * needFit(A, inp.needs)) * dayMul(inp, A.kind) * h);
    w.at = now;
  }
  // he's just back: she wants to wave hello (once per return)
  if (inp.room.justBack && now - st.greetedAt > TUNE.room.backSec * 2000) {
    st.greetedAt = now;
    st.wants.wave.v = Math.max(st.wants.wave.v, T.backWave);
    st.cool.wave = 0;
  }
  if (st.promise && now - st.promise.at > T.promiseHours * 3600e3) st.promise = null;
  st.hisWaves = st.hisWaves.filter(t => now - t < 120e3);
}

function finish(st, inp, out, how = null) {
  const T = TUNE.init, ep = st.ep, now = inp.now;
  if (!ep) return;
  st.log.push({ at: ep.t0, id: ep.id, from: ep.from, rung: ep.rung, why: ep.why, out, how });
  if (st.log.length > 24) st.log.splice(0, st.log.length - 24);
  // a quiet hint nobody saw costs nothing: the want keeps growing, and she'll be a little louder next time
  const quiet = out === 'ignored' && ep.rung <= 2;
  const mins = (out === 'yes' ? T.againYes : out === 'no' ? T.againNo : (quiet ? T.againHint : out === 'ignored' ? T.againIgnored : 0) * (1 + st.log.filter(e => e.id === ep.id && e.out === 'ignored' && now - e.at < 2 * 3600e3).length) || T.againIgnored) * (ACTIONS[ep.id].again || 1);
  st.cool[ep.id] = now + mins * 60e3;
  st.wants[ep.id].v *= out === 'yes' ? T.keepAfterYes : out === 'no' ? T.keepAfterNo : quiet ? 1 : T.keepAfterIgnored;
  st.lastEnd = now;
  // after something loud (she came over, spoke, asked) she leaves him be for longer
  st.gapUntil = now + T.gapMin * 60e3 * (ep.rung >= 3 ? T.gapLoud : 1);
  st.lastOut = out;
  st.ep = null;
}

// ---------------------------------------------------------------------------------------------
// one thought. step(st, inp) → [] (most of the time) or one directive:
//   { do: 'act', id, rung, how: 'start' | 'harder' | 'promised', icon, text, why, want }
//   { do: 'letgo', id, rung, how: 'own' | 'shrug' | 'pout' | 'fine' }
// inp: { now, rand, needs, mood, stage, day (a DAY_MOODS id), room (room.js read()), opts,
//        can: { fetch: false... }, busy (she can't start anything now), engaged (he's touching
//        or talking to her), pick(channel, list) }
export function step(st, inp) {
  const T = TUNE.init, now = inp.now;
  ensure(st);
  inp = { rand: Math.random, opts: DEFAULT_OPTS, can: {}, ...inp };
  inp.opts = { ...DEFAULT_OPTS, ...inp.opts, kinds: { ...DEFAULT_OPTS.kinds, ...(inp.opts.kinds || {}) } };
  advance(st, inp);
  if (!inp.opts.on) { if (st.ep) st.ep = null; return []; }

  const ep = st.ep;
  if (ep) {
    const A = ACTIONS[ep.id];
    if (!A || now - ep.t0 > 10 * 60e3) { st.ep = null; return []; }   // a stale one (the page was closed mid-ask)
    if (inp.engaged || inp.busy) { ep.rungAt = Math.max(ep.rungAt, now - waitMs(A, ep.rung) + 4000); return []; }
    if (now - ep.rungAt < waitMs(A, ep.rung)) return [];
    // no answer. try a step harder, or let it go?
    const w = st.wants[ep.id].v;
    const next = rungsFor(A, capFor(A, Math.min(1, w + 0.15), inp), inp).find(r => r > ep.rung);
    let p = T.persist * mul(inp.opts.persist, 2);
    if (inp.opts.asFeels !== false) p *= dayMul(inp, 'persist') * (0.5 + w);
    if (next && ep.climbs < T.climbMax && budgetLeft(st, inp) > 0 && inp.rand() < p) {
      ep.rung = next; ep.rungAt = now; ep.climbs++;
      st.day.used += costOf(A, next);
      return [{ do: 'act', id: ep.id, rung: next, how: 'harder', ...dress(A, next, inp, ep), why: ep.why, want: w }];
    }
    // she lets it go. a hint nobody saw barely counts as "ignored"
    learn(st, ep.id, 'i', ep.rung >= 3 ? 1 : 0.25, now);
    const stage = inp.stage || 1, strong = w >= T.strongWant;
    const how = inp.opts.asFeels === false ? 'fine' : weighted([
      { id: 'fine', w: ep.rung <= 2 ? 6 : 2 },
      { id: 'shrug', w: ep.rung >= 3 ? 3 : 0 },
      { id: 'pout', w: ep.rung >= 3 && stage >= 3 ? (strong ? 2.5 : 1) : 0 },
      { id: 'own', w: ep.rung >= 3 && ep.id !== 'wave' ? 3 * dayMul(inp, 'all') : 0 },
    ], inp.rand);
    const d = { do: 'letgo', id: ep.id, rung: ep.rung, how };
    finish(st, inp, 'ignored', how);
    return [d];
  }

  if (inp.busy || inp.room.cap <= 0 || now < st.sulkUntil) return [];
  if (now < (st.gapUntil || 0)) return [];

  const often = mul(inp.opts.often, 2.5) * (inp.opts.asFeels === false ? 1 : dayMul(inp, 'all'));
  const cands = [];
  for (const id of IDS) {
    const A = ACTIONS[id];
    if (inp.can[id] === false) continue;
    const kindMul = mul(inp.opts.kinds[A.kind], 2);
    const w = st.wants[id].v;
    if (!kindMul || w < T.startAt || (st.cool[id] || 0) > now) continue;
    const rungs = rungsFor(A, capFor(A, w, inp), inp);
    if (!rungs.length) continue;
    const promised = st.promise?.id === id && inp.room.a >= 0.6;
    const score = w * moodFit(A, inp) * learned(st, id, now) * lately(st, id, now) * (0.3 + 0.7 * inp.room.a)
      * budgetLeft(st, inp) * kindMul * (promised ? T.promiseBoost : 1);
    cands.push({ id, A, w, rungs, promised, p: Math.min(0.5, (T.tickSec / T.meanSec) * score * often) });
  }
  if (!cands.length) return [];
  const total = cands.reduce((a, c) => a + c.p, 0);
  if (inp.rand() >= Math.min(0.6, total)) return [];
  const c = cands.find(x => x.id === weighted(cands.map(x => ({ id: x.id, w: x.p })), inp.rand)) || cands[0];

  // where on the ladder she starts: low, never straight to the top (unless he promised "later")
  let rung = c.rungs[0];
  if (c.promised) rung = c.rungs[c.rungs.length - 1];
  else if (c.rungs.length > 1) {
    const bold = learned(st, c.id, now) > 1.08 ? 0.6 : (inp.stage || 1) <= 3 ? 0.25 : 0.42;
    // a want that has been building doesn't start with a glance any more
    let start = c.rungs.filter(r => r < 5);
    if (c.w >= T.urge4 && start.length > 1) start = start.slice(1);
    if (c.w >= T.urge5 && start.length > 1) start = start.slice(1);
    start = start.slice(0, 3);
    rung = weighted(start.map((r, i) => ({ id: r, w: Math.pow(bold, i) })), inp.rand) || start[0];
  }
  const why = whyOf(c.A, inp, c.promised ? ['you said "later"'] : []);
  st.ep = { id: c.id, rung, from: rung, rungAt: now, t0: now, climbs: 0, why, pleaded: false };
  if (c.promised) st.promise = null;
  st.day.used += costOf(c.A, rung);
  return [{ do: 'act', id: c.id, rung, how: c.promised ? 'promised' : 'start', ...dress(c.A, rung, inp, st.ep), why, want: c.w }];
}
// what goes with a step: the icon of a thought, the words of an ask
function dress(A, rung, inp, ep) {
  const pick = pickOf(inp);
  const out = {};
  if (rung === 2 || rung === 3) out.icon = pick('thought', A.icons);
  if (rung === 5 && A.ask) out.text = ep?.offered ? A.offer : pick('ask', A.ask);
  return out;
}

// he answered what she's asking for. answer(st, id, 'yes' | 'no', inp) → null (she wasn't asking:
// it just happened, which satisfies the want) or one directive:
//   { do: 'lit', id, power, how: 'bright' | 'bounce' | 'shy' | 'melt', asked }
//   { do: 'toldno', id, how: 'fine' | 'pout' | 'please' | 'sulk' | 'tsun' | 'later' | 'offer', text, offer }
export function answer(st, id, ans, inp) {
  const T = TUNE.init, now = inp.now;
  ensure(st);
  inp = { rand: Math.random, opts: DEFAULT_OPTS, can: {}, room: { a: 1, cap: 5, why: 'free' }, ...inp };
  inp.opts = { ...DEFAULT_OPTS, ...inp.opts };
  const A = ACTIONS[id];
  if (!A) return null;
  if (!st.wants[id]) st.wants[id] = { v: 0.2, at: now };
  const ep = st.ep && st.ep.id === id ? st.ep : null;
  const w = st.wants[id].v;
  if (ans === 'yes') {
    if (!ep) { st.wants[id].v = w * 0.3; return null; }
    learn(st, id, 'y', 1, now);
    const stage = inp.stage || 1;
    const how = weighted([
      { id: 'bright', w: 3 }, { id: 'bounce', w: A.kind === 'play' ? 4 : 1.5 },
      { id: 'shy', w: stage <= 3 ? 4 : stage === 4 ? 1.5 : 0.3 }, { id: 'melt', w: A.touch && stage >= 4 ? 2.5 : 0 },
    ], inp.rand);
    const d = { do: 'lit', id, power: clamp01(0.45 + 0.07 * ep.rung + 0.35 * w), how, asked: ep.rung >= 5, rung: ep.rung };
    finish(st, inp, 'yes', how);
    return d;
  }
  if (!ep) return null;
  // told no. by how much she wanted it, her mood and a dice roll. never a penalty
  learn(st, id, 'n', 1, now);
  const strong = w >= T.strongWant, stage = inp.stage || 1;
  const other = IDS.find(o => o !== id && ACTIONS[o].ask && inp.can[o] !== false && ACTIONS[o].cap[stage] >= 5
    && (st.cool[o] || 0) <= now && st.wants[o]?.v >= T.startAt * 0.75);
  let how = 'fine';
  if (inp.opts.asFeels !== false) {
    const clingy = dayMul(inp, 'persist');
    how = weighted(strong ? [
      { id: 'fine', w: 2 }, { id: 'pout', w: 3 }, { id: 'please', w: ep.pleaded ? 0 : 3 * clingy },
      { id: 'sulk', w: ep.pleaded ? 2 : 1.2 }, { id: 'tsun', w: stage <= 4 ? 2.5 : 0.6 },
      { id: 'later', w: 2 }, { id: 'offer', w: other && !ep.offered ? 3 : 0 },
    ] : [
      { id: 'fine', w: 6 }, { id: 'tsun', w: stage <= 4 ? 2 : 0.5 }, { id: 'later', w: 1 }, { id: 'pout', w: 0.8 },
    ], inp.rand) || 'fine';
  }
  if (how === 'please') {
    // one more try, cuter. the same ask stays open
    ep.pleaded = true; ep.rungAt = now;
    return { do: 'toldno', id, how, text: pickOf(inp)('ask', A.please || A.ask) };
  }
  const d = { do: 'toldno', id, how };
  finish(st, inp, 'no', how);
  if (how === 'sulk') st.sulkUntil = now + (T.sulkMinLo + inp.rand() * (T.sulkMinHi - T.sulkMinLo)) * 60e3;
  if (how === 'later') st.promise = { id, at: now };
  if (how === 'offer') {
    // "fine… then a headpat?": something else that makes both happy, asked right away
    const B = ACTIONS[other];
    st.ep = { id: other, rung: 5, from: 5, rungAt: now, t0: now, climbs: T.climbMax, why: ['you said no to ' + A.name + ', so she offered something else'], pleaded: true, offered: true };
    st.day.used += costOf(B, 5);
    d.offer = other; d.text = B.offer;
  }
  return d;
}

// something happened to her that one of her wants was about (a touch kind from moods.js, 'fetch').
// → null, an answer's directive (she was asking for exactly this), or { do: 'melt' } (a kind touch
// ends a sulk)
export function happened(st, what, inp) {
  ensure(st);
  if (inp.warm && inp.now < st.sulkUntil) { st.sulkUntil = 0; return { do: 'melt' }; }
  for (const id of IDS) {
    const A = ACTIONS[id];
    if (!(A.touch || []).includes(what) && what !== id) continue;
    return answer(st, id, 'yes', inp);
  }
  return null;
}

// he waved at her (the page saw the gesture). → null (not this time) or
//   { do: 'waveback', how: 'wave' | 'big' | 'shy' | 'look' | 'amused' }
export function hisWave(st, inp) {
  const T = TUNE.init, now = inp.now;
  ensure(st);
  inp = { rand: Math.random, opts: DEFAULT_OPTS, ...inp };
  if (inp.busy) return null;
  const last = st.hisWaves[st.hisWaves.length - 1] || 0;
  if (now - last < T.hisWaveEveryMs) return null;
  st.hisWaves = st.hisWaves.filter(t => now - t < 120e3);
  st.hisWaves.push(now);
  if (st.wants.wave) st.wants.wave.v *= 0.5;
  const n = st.hisWaves.length, stage = inp.stage || 1;
  // waving at her over and over: she finds it funny once, then just looks at him
  if (n === 4) return { do: 'waveback', how: 'amused' };
  if (n > 4) return inp.rand() < 0.5 ? { do: 'waveback', how: 'look' } : null;
  const down = inp.mood === 'upset' || inp.mood === 'scared';
  const keen = (inp.needs?.attention || 0) >= 0.5 || inp.room?.justBack;
  const how = now < st.sulkUntil ? 'look' : weighted([
    { id: 'wave', w: stage <= 1 ? 1 : 3 }, { id: 'big', w: stage >= 3 && !down ? (keen ? 3 : 1) + (stage >= 5 ? 1 : 0) : 0 },
    { id: 'shy', w: stage <= 2 ? 3 : stage <= 4 ? 1.2 : 0.3 }, { id: 'look', w: down ? 3 : stage <= 1 ? 1.5 : 0.2 },
  ], inp.rand);
  return { do: 'waveback', how };
}

// fetch: the ball came to rest after she chased it. does she want one more?
export function oneMore(st, inp) {
  ensure(st);
  const rand = inp.rand || Math.random;
  const play = inp.needs?.play ?? 0.4;
  const n = st.rounds = (st.roundsAt && inp.now - st.roundsAt < 5 * 60e3 ? st.rounds || 0 : 0) + 1;
  st.roundsAt = inp.now;
  // she still feels like playing, less each round: bored after a while
  return rand() < TUNE.init.oneMore * (0.5 + play) / (1 + 0.45 * (n - 1)) ? 'more' : 'done';
}

// ---------------------------------------------------------------------------------------------
// in plain words (Settings: the one line, and "Why did she do that?")

const OUT_WORDS = {
  yes: 'You took her up on it.', ignored: 'You were busy, so she let it go.',
  no: { fine: 'You said no and she took it well.', pout: 'You said no. A small pout.', sulk: 'You said no. She sulked for a few minutes.',
    tsun: 'You said no. She acted like she didn\'t care.', later: 'You said no. "Later, then."', offer: 'You said no, so she offered something else.' },
};
export function whyLine(e) {
  const A = ACTIONS[e.id];
  if (!A) return '';
  const did = A.did[e.rung] || 'wanted ' + A.name;
  const out = e.out === 'no' ? (OUT_WORDS.no[e.how] || OUT_WORDS.no.fine) : OUT_WORDS[e.out] || '';
  const why = (e.why || []).filter(Boolean);
  return 'She ' + did + (why.length ? ': ' + why.join(', ') : '') + '. ' + out;
}
// "Today she's playful and you've been busy, so she's mostly waiting for a break."
export function describe(st, { opts = DEFAULT_OPTS, day = 'easy', room = null, now = Date.now(), stage = 3 } = {}) {
  ensure(st);
  if (!opts.on) return 'She waits for you to start things.';
  const bits = [];
  if (opts.asFeels !== false) bits.push('Today she\'s ' + DAY_MOODS[day].words);
  const r = room || st.room;
  const fresh = r && now - (r.at || now) < 3 * 60e3;
  if (now < st.sulkUntil) return (bits.length ? bits[0] + '. ' : '') + 'She\'s sulking a little. A kind touch fixes it.';
  let tail;
  const top = IDS.filter(id => ACTIONS[id].cap[stage] > 0 && (st.wants[id]?.v || 0) >= TUNE.init.startAt)
    .sort((a, b) => st.wants[b].v - st.wants[a].v)[0];
  if (fresh && r.cap <= 0) tail = 'you\'re away, so she\'s keeping to herself';
  else if (fresh && r.cap <= 1) tail = Room.WHY[r.why] + ', so she\'s keeping quiet';
  else if (fresh && r.cap <= 2) tail = Room.WHY[r.why] + ', so she\'s mostly waiting for a break';
  else if (top) tail = 'she\'s thinking about ' + ACTIONS[top].name;
  else tail = 'she\'s content for now';
  return (bits.length ? bits[0] + (fresh && r.cap <= 2 ? ' and ' : ', and ') : '') + tail.replace(/^./, c => (bits.length ? c : c.toUpperCase())) + '.';
}

// ---------------------------------------------------------------------------------------------
// the time-lapse (feel lab): a day of her decisions in a moment, with a made-up him, to spot
// nagging, dead hours and repeats before anyone has to live with them. The same step()/answer()

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// what he's doing at a time of day: 'away' | 'typing' | 'busy' | 'still' | 'free'
export const HIM = {
  workday: { name: 'A work day at the PC', at: (h, m) => (h < 8 ? 'away' : h < 9 ? 'free' : h < 12 ? (m >= 50 ? 'free' : m % 20 < 14 ? 'typing' : 'busy')
    : h < 13 ? 'away' : h < 17 ? (m >= 52 ? 'free' : m % 15 < 10 ? 'typing' : 'busy') : h < 18 ? 'away' : h < 20 ? 'free' : h < 22 ? (m < 40 ? 'still' : 'free') : h < 23 ? 'free' : 'away') },
  free: { name: 'A lazy day, mostly free', at: (h, m) => (h < 9 ? 'away' : h >= 23 ? 'away' : m % 30 < 22 ? 'free' : 'still') },
  gaming: { name: 'Busy all day (games, mouse-heavy)', at: (h, m) => (h < 10 ? 'away' : h >= 23 ? 'away' : m >= 56 ? 'free' : 'busy') },
  inout: { name: 'In and out all day', at: (h, m) => (h < 8 || h >= 22 ? 'away' : h % 2 ? 'away' : m < 45 ? 'free' : 'typing') },
};
const HIM_ROOM = { away: { idleSec: 9999 }, typing: { typingMs: 60000 }, busy: { busyShare: 0.95 }, still: { idleSec: 70 }, free: {} };
const hhmm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

export function simulate({ hours = 16, startHour = 8, stage = 4, mood = 'neutral', opts = DEFAULT_OPTS, seed = 1, him = 'workday', day = null,
  yes = 0.55, no = 0.2 } = {}) {
  const rand = mulberry(seed);
  const T = TUNE.init;
  const base = new Date(2026, 0, 5, startHour, 0, 0).getTime();
  const st = fresh();
  const needs = { attention: 0.35, affection: 0.3, play: 0.3, rest: 0.15, stimulation: 0.3 };
  const dayId = day || dayMood(rand());
  let spent = 0;
  const events = [], counts = { starts: 0, yes: 0, no: 0, ignored: 0, byAction: {}, byRung: [0, 0, 0, 0, 0, 0] };
  const perHour = [];
  let backAt = -Infinity, wasAway = true, awayFrom = base - 8 * 3600e3, pendingAnswer = null, freeQuiet = 0, longestFreeQuiet = 0, longestFrom = 0, quietFrom = base;
  const say = (now, text) => events.push({ t: hhmm(now), text });
  for (let s = 0; s <= hours * 3600; s += T.tickSec) {
    const now = base + s * 1000, d = new Date(now), hi = Math.floor(s / 3600);
    perHour[hi] = perHour[hi] || { h: hhmm(base + hi * 3600e3), n: 0, loud: 0 };
    const state = (HIM[him] || HIM.workday).at(d.getHours(), d.getMinutes());
    if (state !== 'away' && wasAway) { backAt = now; }
    if (state === 'away' && !wasAway) awayFrom = now;
    const away = state === 'away';
    for (const k of Object.keys(TUNE.needs.rise)) needs[k] = clamp01(needs[k] + TUNE.needs.rise[k] * (needs[k] > TUNE.needs.awayCap ? 0.1 : 1) * T.tickSec / 3600);
    const room = Room.read({ ...HIM_ROOM[state], backAgoMs: now - backAt, awayMs: backAt - awayFrom, senses: null,
      lastOutcome: st.lastOut, lastTryAgoMs: now - st.lastEnd });
    wasAway = away;
    const inp = { now, rand, needs, mood, stage, day: dayId, room, opts, can: {} };
    // his answer to what she's doing, a few seconds after she does it
    if (pendingAnswer && now >= pendingAnswer.at && st.ep) {
      const { ans } = pendingAnswer;
      pendingAnswer = null;
      if (ans !== 'ignore') {
        const id = st.ep.id;
        const d2 = answer(st, id, ans, inp);
        if (d2?.do === 'lit') { counts.yes++; say(now, 'You took her up on it. She lit up (' + d2.how + ').');
          if (id === 'headpat') { needs.affection = clamp01(needs.affection - 0.35); needs.attention = clamp01(needs.attention - 0.25); }
          if (id === 'fetch') { needs.play = clamp01(needs.play - 0.45); needs.stimulation = clamp01(needs.stimulation - 0.15); }
          if (id === 'wave') needs.attention = clamp01(needs.attention - 0.08); }
        else if (d2?.do === 'toldno') { counts.no++; say(now, 'You said no → ' + d2.how + (d2.offer ? ' (' + ACTIONS[d2.offer].name + ')' : '') + '.');
          if (d2.how === 'please' || d2.how === 'offer') pendingAnswer = { at: now + 6000, ans: rand() < 0.6 ? 'yes' : 'no' }; }
      }
    }
    for (const dv of step(st, inp)) {
      if (dv.do === 'act') {
        const A = ACTIONS[dv.id];
        if (dv.how !== 'harder') { counts.starts++; counts.byAction[dv.id] = (counts.byAction[dv.id] || 0) + 1; }
        counts.byRung[dv.rung]++;
        spent += costOf(A, dv.rung);
        perHour[hi].n++;
        // one visit counts once, however many steps she climbs during it
        if (dv.rung >= 3 && st.ep && !st.ep.loud) { st.ep.loud = true; perHour[hi].loud++; }
        say(now, (dv.how === 'harder' ? 'Tries harder: she ' : 'She ') + (A.did[dv.rung] || A.name) + (dv.text ? ' ("' + dv.text + '")' : '')
          + (dv.how === 'harder' ? '' : ' — ' + dv.why.join(', ')) + '.');
        quietFrom = now;
        // a free him notices a loud step more often than a quiet hint; a busy him mostly doesn't
        const notice = (dv.rung >= 5 ? 0.9 : dv.rung >= 3 ? 0.75 : 0.25) * (0.35 + 0.65 * room.a);
        let ans = 'ignore';
        if (rand() < notice) ans = dv.rung >= 5 ? (rand() < yes / (yes + no) ? 'yes' : 'no') : (rand() < yes ? 'yes' : 'ignore');
        pendingAnswer = { at: now + 5000 + rand() * 6000, ans };
      } else if (dv.do === 'letgo') { counts.ignored++; say(now, 'No answer. She lets it go (' + dv.how + ').'); }
    }
    // the longest stretch where he was free and she showed nothing
    if (room.cap >= 5) { freeQuiet = now - quietFrom; if (freeQuiet > longestFreeQuiet) { longestFreeQuiet = freeQuiet; longestFrom = quietFrom; } }
    else quietFrom = now;
  }
  const flags = [];
  for (const h of perHour) if (h && h.loud >= 5) flags.push('Around ' + h.h + ' she came over or spoke up ' + h.loud + ' times in an hour. That may feel like nagging.');
  if (longestFreeQuiet > 75 * 60e3) flags.push('From ' + hhmm(longestFrom) + ' you were free for ' + Math.round(longestFreeQuiet / 60e3) + ' minutes and she showed nothing. A dead stretch.');
  let run = 1;
  for (let i = 1; i < st.log.length; i++) { run = st.log[i].id === st.log[i - 1].id ? run + 1 : 1; if (run === 4 && Object.keys(counts.byAction).length > 1) flags.push('She went for ' + ACTIONS[st.log[i].id].name + ' four times in a row.'); }
  if (!counts.starts) flags.push('She never started anything this day.');
  return { day: dayId, events, counts, perHour: perHour.filter(Boolean), flags, used: Math.round(spent * 10) / 10, budget: T.budget };
}

// ---------------------------------------------------------------------------------------------
// live: her real state (store.js) and his settings

export const KEYS = { often: 'jun.init.often', bold: 'jun.init.bold', persist: 'jun.init.persist', quietFrom: 'jun.init.quietFrom',
  quietTo: 'jun.init.quietTo', closeness: 'jun.init.closeness', play: 'jun.init.play', waveStyle: 'jun.init.waveStyle', waveSize: 'jun.init.waveSize' };
export const KEY_DEFAULTS = { often: 50, bold: 5, persist: 50, quietFrom: 0, quietTo: 6, closeness: 50, play: 50, waveStyle: 'either', waveSize: 50 };
export const WAVE_STYLES = [['either', 'Either one'], ['side', 'Side to side'], ['circle', 'A circle']];
let isOn = () => true;
export function configure({ isOn: fn } = {}) { if (fn) isOn = fn; }
function local(name) {
  const d = KEY_DEFAULTS[name];
  try {
    const raw = globalThis.localStorage?.getItem(KEYS[name]);
    if (raw == null || raw === '') return d;
    if (typeof d === 'string') return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? n : d;
  } catch (e) { return d; }
}
export const setting = (name) => local(name);
export function opts(extra = {}) {
  return { on: !!isOn('initiative'), often: local('often'), asFeels: !!isOn('as_she_feels'), bold: Math.max(1, Math.min(5, Math.round(local('bold')))),
    persist: local('persist'), kinds: { closeness: local('closeness'), play: local('play') }, talk: true, ...extra };
}
export const today = (now = Store.now()) => dayMood(Store.hash01('daymood', dayKey(now)));
const stNow = () => { const s = Store.get(); if (!s.init) s.init = fresh(); return ensure(s.init); };
const livePick = (ch, list) => Repeat.pick(ch, list);
let track = Room.tracker(), lastSave = 0, lastRoom = null;

function liveInp(live = {}) {
  const now = Store.now();
  const o = opts(live.opts);
  const hour = new Date(now).getHours();
  const seen = track.now(now, live.idleSec || 0);
  const st = stNow();
  const room = live.room || Room.read({ ...seen, quietMode: !!live.quietMode, quietHours: Room.inQuietHours(hour, local('quietFrom'), local('quietTo')),
    lastOutcome: st.lastOut, lastTryAgoMs: now - st.lastEnd });
  return { now, rand: live.rand || Math.random, needs: live.needs || Needs.levels(), mood: live.mood || Store.get().mood || 'neutral',
    stage: live.stage || 1, day: o.asFeels ? today(now) : 'easy', room, opts: o, can: live.can || {}, busy: !!live.busy, engaged: !!live.engaged, pick: livePick };
}
const commit = () => Store.change(() => {});

// the desktop page calls this every TUNE.init.tickSec: { idleSec, cursorAt, quietMode, stage,
// can, busy, engaged, opts: { talk } } → directives for it to play ([] most of the time)
export function tick(live = {}) {
  const now = Store.now();
  track.feed({ now, idleSec: live.idleSec || 0, cursorAt: live.cursorAt || 0 });
  const inp = liveInp(live);
  lastRoom = inp.room;
  const st = stNow();
  const out = step(st, inp);
  if (out.length || now - lastSave > 60e3) { st.room = { why: inp.room.why, cap: inp.room.cap, a: inp.room.a, at: now }; st.stage = inp.stage; lastSave = now; commit(); }
  return out;
}
export function answerLive(id, ans, live = {}) { const d = answer(stNow(), id, ans, liveInp(live)); commit(); return d; }
export function happenedLive(what, live = {}) {
  const st = stNow();
  if (!st.ep && !(Store.now() < st.sulkUntil) && !IDS.some(id => (ACTIONS[id].touch || []).includes(what) || what === id)) return null;
  const d = happened(st, what, { ...liveInp(live), warm: !!live.warm });
  commit();
  return d;
}
export function hisWaveLive(live = {}) { const d = hisWave(stNow(), liveInp(live)); if (d) commit(); return d; }
export function oneMoreLive(live = {}) { const r = oneMore(stNow(), liveInp(live)); commit(); return r; }
export const asking = () => stNow().ep;
export const roomNow = () => lastRoom || stNow().room;
export function describeLive(extra = {}) { const st = stNow(); return describe(st, { opts: opts(), day: today(), now: Store.now(), stage: st.stage || 3, ...extra }); }
export function whyLog(n = 8) { return stNow().log.slice(-n).reverse().map(e => ({ at: e.at, text: whyLine(e) })); }
export function forget() { Store.change(s => { const st = ensure(s.init || (s.init = fresh())); st.learn = {}; st.log = []; st.promise = null; st.cool = {}; }); }
// for her prompt: what she's been wanting but hasn't had (a word, never a number), and how her last ask went
export function forChat(stage = 3) {
  const st = stNow(), now = Store.now();
  const top = IDS.filter(id => id !== 'wave' && ACTIONS[id].cap[Math.max(1, Math.min(6, stage))] > 0 && (st.wants[id]?.v || 0) >= TUNE.init.urge4)
    .sort((a, b) => st.wants[b].v - st.wants[a].v)[0];
  const last = st.log[st.log.length - 1];
  const out = {};
  if (top) out.want = top;
  if (last && now - last.at < 20 * 60e3 && last.rung >= 3) out.last = [last.id, last.out];
  if (now < st.sulkUntil) out.sulk = true;
  return out;
}
export function snapshot() {
  const st = stNow(), now = Store.now();
  return { opts: opts(), day: today(now), wants: Object.fromEntries(IDS.map(id => [id, st.wants[id]?.v ?? 0])), ep: st.ep, room: roomNow(),
    used: st.day.used, budget: TUNE.init.budget * Math.max(0.2, mul(local('often'), 2)), sulking: now < st.sulkUntil, promise: st.promise,
    learned: Object.fromEntries(IDS.map(id => [id, learned(st, id, now)])), cool: Object.fromEntries(IDS.map(id => [id, Math.max(0, (st.cool[id] || 0) - now)])),
    log: st.log.slice(-10), stage: st.stage || null };
}
// the feel lab: set a want directly, or clear her cooldowns to try something now
export function setWant(id, v) { Store.change(s => { const st = ensure(s.init || (s.init = fresh())); st.wants[id] = { v: clamp01(v), at: Store.now() }; }); }
export function clearCooldowns() { Store.change(s => { const st = ensure(s.init || (s.init = fresh())); st.cool = {}; st.lastEnd = 0; st.gapUntil = 0; st.sulkUntil = 0; st.ep = null; }); }
export function resetTracker() { track = Room.tracker(); lastSave = 0; lastRoom = null; }
