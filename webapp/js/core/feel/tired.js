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
// The math here is the baseline; the composer (compose.js) decides what it means for a reaction.

import * as Store from './store.js?v=2';
import { TUNE } from './tune.js?v=2';
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

function lastKind(s) {
  for (let i = s.hist.length - 1; i >= 0; i--) if (s.hist[i][1] === 'touch') return s.hist[i][2];
  return null;
}

// a touch happened: amount in "load" (feel.js works it out: seconds × rate, or a poke's bit)
export function add(kind, amount) {
  if (!(amount > 0)) return;
  const t = Store.now();
  // how quickly she's had enough: 0 % = never, 50 % = natural, 100 % = twice as quick
  const k = Math.max(0, opts.pace) / 50;
  if (k === 0) return;
  Store.change(s => {
    const inARow = lastKind(s) === kind ? TUNE.tired.inARow : 0;
    const put = (kd, a) => { s.tired[kd] = { load: decayed(s.tired[kd], t) + a, at: t }; };
    put(kind, (amount + inARow) * k);
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
// the load a hold/rub of ms milliseconds leaves (feel.js adds it when the touch ends)
export function loadFor(kind, ms) {
  return (Math.max(0, ms) / 1000) * TUNE.tired.perSec * (TUNE.tired.rate[kind] ?? 1);
}
export function state(kind, ctx = {}) {
  const e = effective(kind, ctx), T = TUNE.tired;
  if (SORE.has(kind) && e >= T.sore) return 'sore';
  if (e >= T.enough) return 'enough';
  if (e >= T.plenty) return 'plenty';
  if (e >= T.enjoying) return 'enjoying';
  return 'fresh';
}
// how much of a touch's power is left: 1 while it's fresh, down to the floor at "enough"
export function factor(kind, ctx = {}) {
  const e = effective(kind, ctx), T = TUNE.tired;
  if (e <= T.enjoying) return 1;
  if (e >= T.enough) return T.floor;
  return 1 - (1 - T.floor) * ((e - T.enjoying) / (T.enough - T.enjoying));
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
export function clear() { Store.change(s => { s.tired = {}; s.marks = {}; }); }
