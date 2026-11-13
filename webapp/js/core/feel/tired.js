// getting tired of things (#27), and her own favorites ("no meta").
//
// Every touch leaves a little load on its kind (and some on related kinds: a head rub and an ear
// rub). The load fades by itself (halves every ~40 min, so she's fresh again in about 2-3 hours).
// The more load, the less a touch gives: diminishing returns first ("enjoying" → "plenty"), then
// she's had enough for now, playfully, never as a punishment. "Sore" is only for kinds that are
// marked for it (none yet: the Flirty butt swat will be one, through the gate) and fades the same
// way.
//
// Her favorites: each Jun has her own weight per touch (seeded per install), drifting a little
// week to week, and nudged by her mood and needs right now. A favorite takes longer to tire of
// and lands better (the composer uses fav()). So no single touch is "the best" for every Jun or
// every moment.
//
// The composer (compose.js) decides what all of this means for a reaction.

import * as Store from './store.js?v=3';
import { TUNE } from './tune.js?v=3';
import * as K from './kinds.js?v=2';

export const STATES = ['fresh', 'enjoying', 'plenty', 'enough', 'sore'];
export const STATE_WORDS = {
  fresh: 'Fresh', enjoying: 'Enjoying it', plenty: 'Had plenty', enough: 'Had enough for now', sore: 'A little sore',
};

// switches (feel.js sets them from the settings: Getting tired of things, Her own favorites,
// How quickly she's had enough)
let opts = { tiring: true, favorites: true, pace: 50 };
export function setOptions(o) { opts = { ...opts, ...o }; }
export const options = () => ({ ...opts });

// kinds she can get a little sore from (Flirty ones, through the gate; none yet)
const SORE = new Set();
export function setSoreKinds(list) { SORE.clear(); for (const k of list || []) SORE.add(k); }

const halfLifeMs = () => Math.max(1, TUNE.tired.halfLifeMin) * 60e3;
function decayed(e, t) { return e ? e.load * Math.pow(0.5, Math.max(0, t - e.at) / halfLifeMs()) : 0; }

// the raw load on a kind now
export function loadOf(kind, t = Store.now()) { return decayed(Store.get().tired[kind], t); }

// how many times in a row the last touches were this kind (0 = the last one was something else)
function streak(s, kind) {
  let n = 0;
  for (let i = s.hist.length - 1; i >= 0 && n < 8; i--) {
    if (s.hist[i][1] !== 'touch') continue;
    if (s.hist[i][2] !== kind) break;
    n++;
  }
  return n;
}

// what he's given her these days (fades over days): it shifts her favorites a little, so what
// works best keeps moving ("no meta")
const useHalfMs = () => Math.max(0.1, TUNE.tired.useHalfLifeDays) * 24 * 3600e3;
function usedNow(e, t) { return e ? e.n * Math.pow(0.5, Math.max(0, t - e.at) / useHalfMs()) : 0; }
export function usedOf(kind, t = Store.now()) { return usedNow((Store.get().use || {})[kind], t); }

// a touch happened: amount in "load" (feel.js works it out: seconds × rate, or a poke's bit)
export function add(kind, amount) {
  if (!(amount > 0)) return;
  const t = Store.now();
  // how quickly she's had enough: 0 % = never, 50 % = natural, 100 % = twice as quick
  const k = Math.max(0, opts.pace) / 50;
  if (k === 0) return;
  Store.change(s => {
    // the same touch again right away weighs a little more, more each time (up to a few times)
    // (feel.js writes the touch into her history first, so the streak counts this one too)
    const inARow = TUNE.tired.inARow * Math.min(Math.max(1, TUNE.tired.inARowMax), Math.max(0, streak(s, kind) - 1));
    const put = (kd, a) => { s.tired[kd] = { load: decayed(s.tired[kd], t) + a, at: t }; };
    put(kind, (amount + inARow) * k);
    if (!s.use) s.use = {};
    s.use[kind] = { n: usedNow(s.use[kind], t) + amount, at: t };
    for (const [kd, e] of Object.entries(s.use)) if (usedNow(e, t) < 0.02) delete s.use[kd];
    for (const o of K.sameGroup(kind)) put(o, amount * k * TUNE.tired.share);
    // forget kinds that are back to fresh (keeps the save small)
    for (const [kd, e] of Object.entries(s.tired)) if (decayed(e, t) < 0.01) delete s.tired[kd];
  });
}

// her weight for a touch: about 0.75..1.35, her own, drifting week to week, nudged by the moment.
// ctx: { mood, needs } (needs from needs.js levels())
export function fav(kind, ctx = {}) {
  if (!opts.favorites) return 1;
  const T = TUNE.tired;
  const base = T.favLow + (T.favHigh - T.favLow) * Store.hash01('fav', kind);
  // a smooth drift: one random point per week, eased between them
  const weeks = (Store.now() - Store.get().born) / (7 * 24 * 3600e3) + Store.hash01('phase', kind);
  const w = Math.floor(weeks), f = weeks - w, ease = f * f * (3 - 2 * f);
  const n = Store.hash01('drift', kind, w) * (1 - ease) + Store.hash01('drift', kind, w + 1) * ease;
  let v = base * (1 + T.favDrift * (2 * n - 1));
  // a lot of it these days = a little less keen; not in days = she misses it
  if (T.favMiss) v *= 1 + T.favMiss * (1 - 2 * Math.min(1, usedOf(kind) / Math.max(0.01, T.useFull)));
  // what works best depends on her mood and what she needs right now
  const m = ctx.mood, nd = ctx.needs || {};
  if (m === 'happy' && K.isPlay(kind)) v *= 1.1;
  if ((m === 'upset' || m === 'scared') && K.isWarm(kind)) v *= 1.15;
  if (m === 'nervous' && (kind === 'head' || kind === 'hand')) v *= 1.1;
  if ((nd.rest || 0) >= 0.6 && (kind === 'hug' || kind === 'head' || kind === 'hand')) v *= 1.15;
  if ((nd.rest || 0) >= 0.6 && K.isPlay(kind)) v *= 0.9;
  if ((nd.play || 0) >= 0.6 && K.isPlay(kind)) v *= 1.15;
  if ((nd.affection || 0) >= 0.6 && K.isWarm(kind)) v *= 1.1;
  return v;
}

// how tired of it she is, after her favorites (a favorite takes longer). ctx.pending: the load of
// a touch still going on (it's only added when it ends), so a long hug tires her as it goes
export function effective(kind, ctx = {}) {
  if (!opts.tiring) return 0;
  return (loadOf(kind) + Math.max(0, ctx.pending || 0) * (Math.max(0, opts.pace) / 50)) / fav(kind, ctx);
}
// the load a hold/rub of ms milliseconds leaves (feel.js adds it when the touch ends).
// rough: the share of it that was fast and scrubby (0..1), which wears on her quicker
export function loadFor(kind, ms, rough = 0) {
  return (Math.max(0, ms) / 1000) * TUNE.tired.perSec * (TUNE.tired.rate[kind] ?? 1)
    * (1 + TUNE.tired.roughLoad * Math.max(0, Math.min(1, rough || 0)));
}
export function state(kind, ctx = {}) {
  const e = effective(kind, ctx), T = TUNE.tired;
  if (SORE.has(kind) && e >= T.sore) return 'sore';
  if (e >= T.enough) return 'enough';
  if (e >= T.plenty) return 'plenty';
  if (e >= T.enjoying) return 'enjoying';
  return 'fresh';
}
// how much of a touch's power is left. One smooth curve, no steps: a little MORE as she gets
// into it (most at "enjoying"), easing down to the floor at "enough", then settling slowly
// toward a deeper floor far past it, so a very long session keeps fading gently instead of
// hitting a wall
const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
export function factor(kind, ctx = {}) {
  return factorAt(effective(kind, ctx));
}
export function factorAt(e) {
  const T = TUNE.tired;
  if (!(e > 0)) return 1;
  const peak = 1 + Math.max(0, T.warmUp);
  if (e <= T.enjoying) return 1 + (peak - 1) * smooth(e / Math.max(1e-6, T.enjoying));
  if (e <= T.enough) return peak - (peak - T.floor) * smooth((e - T.enjoying) / Math.max(1e-6, T.enough - T.enjoying));
  const deep = Math.min(T.floor, T.floorDeep);
  return deep + (T.floor - deep) * Math.exp(-(e - T.enough) / Math.max(1e-6, T.enough));
}

// did she just cross into "plenty" / "enough" / "sore" for this kind? (once per crossing; back to
// fresh or enjoying clears it). Returns the new state or null
export function crossed(kind, ctx = {}) {
  const st = state(kind, ctx);
  const rank = STATES.indexOf(st);
  const marks = Store.get().marks || {};
  const was = marks[kind] ? STATES.indexOf(marks[kind]) : 1;
  if (rank <= 1) { if (marks[kind]) Store.change(s => { delete s.marks[kind]; }); return null; }
  if (rank > was) { Store.change(s => { s.marks[kind] = st; }); return st; }
  return null;
}

// everything she's carrying right now, most tired first (the lab, her prompt)
export function list(ctx = {}) {
  const out = [];
  for (const kind of Object.keys(Store.get().tired)) {
    const load = loadOf(kind);
    if (load < 0.02) continue;
    out.push({ kind, load, fav: fav(kind, ctx), state: state(kind, ctx), factor: factor(kind, ctx) });
  }
  return out.sort((a, b) => b.load / b.fav - a.load / a.fav);
}
// for the lab: forget all of it
export function clear() { Store.change(s => { s.tired = {}; s.marks = {}; s.use = {}; }); }
