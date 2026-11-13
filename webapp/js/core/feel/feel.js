// core feel (#27): the one door to her inside state. Pages tell it what happens (a touch began or
// ended, a poke, a combo, a message, a toss, she's resting) and ask it how she is (needs, how tired
// she is of each thing, the session phase, what she just did). moods.js routes every touch here
// and every reaction through the composer (compose.js).
//
//   store.js   the shared state (localStorage 'jun.feel'), lazy, no ticking
//   tune.js    every number (the feel lab changes them live)
//   needs.js   attention, affection, play, rest, something new
//   tired.js   getting tired of things + her own favorites
//   repeat.js  the repeat watcher
//   shape.js   session shape: greeting → warm-up → peak → wind-down → afterglow
//   compose.js the reaction composer: everything above → one reaction, and how it plays out
//   manner.js  how a touch is done (slow and gentle, fast and scrubby)
//   approach.js she sees his hand coming
//
// Switches (Settings > Touch & feelings > Inside her): feature:needs, feature:tiring,
// feature:favorites, feature:repeat, feature:manner, feature:anticipate, and local:jun.feel.tirePct. Off is always safe: she just
// reacts the way moods.js does on its own.

import * as Store from './store.js?v=3';
import * as Tune from './tune.js?v=3';
import { TUNE } from './tune.js?v=3';
import * as Needs from './needs.js?v=3';
import * as Tired from './tired.js?v=3';
import * as Repeat from './repeat.js?v=3';
import * as Session from './shape.js?v=3';
import * as Compose from './compose.js?v=3';
import * as Manner from './manner.js?v=2';
import * as Approach from './approach.js?v=2';
import * as K from './kinds.js?v=2';
import * as Features from '../features.js?v=3';

export { Store, Tune, Needs, Tired, Repeat, Session, Compose, Manner, Approach, K as Kinds };

export const PACE_KEY = 'jun.feel.tirePct';
const HIST_MAX = 240;

// the switches: feature:<id> in jun.features (Features.isOn honors "new things after an update")
let isOn = (id) => { try { return Features.isOn(id); } catch (e) { return true; } };
let on = { needs: true, tiring: true, favorites: true, repeat: true, manner: true, anticipate: true };
// read the switches (pages pass Features.isOn; tests and the lab leave it all on)
export function configure({ isOn: fn } = {}) {
  if (fn) isOn = fn;
  refresh();
}
export function refresh() {
  on = { needs: isOn('needs'), tiring: isOn('tiring'), favorites: isOn('favorites'), repeat: isOn('repeat'), manner: isOn('manner'), anticipate: isOn('anticipate') };
  let pace = 50;
  try { const v = Number(globalThis.localStorage?.getItem(PACE_KEY)); if (globalThis.localStorage?.getItem(PACE_KEY) != null && Number.isFinite(v)) pace = v; } catch (e) { /* default */ }
  Tired.setOptions({ tiring: on.tiring, favorites: on.favorites, pace });
  Repeat.setEnabled(on.repeat);
  // the variety in how a reaction plays out is part of "She mixes it up"
  Compose.setOptions({ needs: on.needs, manner: on.manner, variety: on.repeat });
}
export const switches = () => ({ ...on, pace: Tired.options().pace });
try {
  globalThis.addEventListener?.('storage', (e) => { if (e.key === PACE_KEY || e.key === 'jun.features') refresh(); });
} catch (e) { /* not a browser */ }

// someone wants to know when she's had plenty / enough of something
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(ev) { for (const fn of listeners) { try { fn(ev); } catch (e) { console.warn('feel listener', e); } } }

function log(type, kind = null, ms = 0) {
  const t = Store.now();
  Store.change(s => {
    s.hist.push([t, type, kind, Math.round(ms)]);
    if (s.hist.length > HIST_MAX) s.hist.splice(0, s.hist.length - HIST_MAX);
    const old = t - 24 * 3600e3;
    while (s.hist.length && s.hist[0][0] < old) s.hist.shift();
  });
}
function hadRecently(kind, min) {
  const from = Store.now() - min * 60e3;
  const h = Store.get().hist;
  for (let i = h.length - 1; i >= 0 && h[i][0] >= from; i--) if (h[i][2] === kind) return true;
  return false;
}
function ctxNow(m = moodNow()) { return { mood: m, needs: on.needs ? Needs.levels() : {} }; }
// her mood (from her gauges, desktop.js via moods.js setContext), kept in the shared state so every
// window (her window, the feel lab) sees the same one
let mood = 'neutral';
export function setMood(m) {
  mood = m || 'neutral';
  if (Store.get().mood !== mood) Store.change(s => { s.mood = mood; });
}
const moodNow = () => Store.get().mood || mood;

function afterTouch(kind) {
  const st = Tired.crossed(kind, ctxNow());
  if (st) emit({ type: 'tired', kind, state: st, words: K.wordsOf(kind) });
}
function newness(kind) {
  if (!on.needs) return;
  if (!hadRecently(kind, TUNE.needs.newKindAfterMin)) Needs.satisfy({ stimulation: TUNE.needs.newKind });
  else Needs.satisfy({ stimulation: -TUNE.needs.sameAgain });
}

// ---------------------------------------------------------------------------------------------
// what happens (moods.js calls these for touches; desktop.js for the rest)

const going = new Map(); // slot -> { kind, t0, rough }
export function touchBegin(slot, kind, t0 = Store.now()) { going.set(slot, { kind, t0, rough: 0 }); }
// how the touch on this hand is being done (moods.js, from manner.js): the share of it that was
// fast and scrubby wears on her quicker
export function touchManner(slot, m) { const g = going.get(slot); if (g && m) g.rough = on.manner ? (m.roughShare || 0) : 0; }
export function touchKind(slot, kind) { const g = going.get(slot); if (g) g.kind = kind; }
export function touchMove(from, to) { const g = going.get(from); if (g) { going.delete(from); going.set(to, g); } }
export function touchEnd(slot) {
  const g = going.get(slot);
  if (!g) return;
  going.delete(slot);
  held(g.kind, Store.now() - g.t0, g.rough);
}
// a hold or rub of ms milliseconds is over (rough: the share of it that was fast and scrubby)
export function held(kind, ms, rough = 0) {
  if (!K.info(kind) || ms < 150) return;
  newness(kind);
  log('touch', kind, ms);
  Tired.add(kind, Tired.loadFor(kind, ms, rough));
  if (on.needs) {
    const secs = ms / 1000;
    if (K.isWarm(kind)) Needs.satisfy(TUNE.needs.warmPerSec, secs);
    else if (K.isPlay(kind)) Needs.satisfy(TUNE.needs.playPerSec, secs);
    else Needs.satisfy({ attention: TUNE.needs.warmPerSec.attention }, secs);
  }
  afterTouch(kind);
}
export function poke(region) {
  const kind = 'poke.' + region;
  if (!K.info(kind)) return;
  newness(kind);
  log('touch', kind, 0);
  Tired.add(kind, TUNE.tired.poke);
  if (on.needs) Needs.satisfy(TUNE.needs.poke);
  afterTouch(kind);
}
export function combo(id) {
  const kind = 'combo.' + id;
  newness(kind);
  log('combo', kind, 0);
  Tired.add(kind, TUNE.tired.combo);
  if (on.needs) Needs.satisfy(TUNE.needs.combo);
  afterTouch(kind);
}
// he talked to her (his own message, not her idle nudges)
export function message() { log('message'); if (on.needs) Needs.satisfy(TUNE.needs.message); }
// thrown across the screen (a toss or two is play), carried, fetch
export function toss() { newness('toss'); log('toss', 'toss'); Tired.add('toss', TUNE.tired.toss); if (on.needs) Needs.satisfy(TUNE.needs.toss); afterTouch('toss'); }
export function fetch() { newness('fetch'); log('fetch', 'fetch'); if (on.needs) Needs.satisfy(TUNE.needs.toss); }
export function resting(isResting) { Needs.setResting(isResting); }

// ---------------------------------------------------------------------------------------------
// how she is

// the composer, for moods.js (null = "as it was"). The last real reaction is kept for a moment,
// so a line about this touch can take its tone from it (lineHint)
let lastReaction = null;
export function compose(input) {
  const r = Compose.compose(input);
  if (r && !input.dry) lastReaction = { at: Store.now(), kind: input.kind, feeling: r.feeling, line: r.line, moment: r.moment, variant: r.variant, manner: r.manner };
  return r;
}
export const lastComposed = () => lastReaction;
// she's about to say something about a touch: the tone it should have, from how she just took it
// ({ type, words } or null). Remembered, so her next line takes another tone
export function lineHint(withinMs = 8000) {
  if (!on.repeat || !lastReaction || Store.now() - lastReaction.at > withinMs || !lastReaction.line) return null;
  const type = lastReaction.line;
  Repeat.note('linetype', type);
  return { type, words: Compose.LINE_WORDS[type] || type };
}

// she sees his hand coming (approach.js). desktop.js measures, this decides; null = nothing
// this time. input: { spot, dist, closing, side, ctx: { stage }, busy }
export function approach(input) {
  if (!on.anticipate) return null;
  let lastTouchMs = Infinity;
  const h = Store.get().hist;
  for (let i = h.length - 1; i >= 0; i--) if (h[i][1] === 'touch' || h[i][1] === 'combo') { lastTouchMs = Store.now() - h[i][0]; break; }
  return Approach.decide({
    ...input, lastTouchMs, busy: input.busy || going.size > 0,
    needs: on.needs ? Needs.levels() : {}, ctx: { mood: moodNow(), ...(input.ctx || {}) },
  });
}

// what her needs ask for in her idle moves and thought icons: extra entries for the pools
export function idleExtras() {
  if (!on.needs) return [];
  const n = Needs.levels(), out = [];
  if (n.rest >= 0.5) out.push('yawn', 'rest', ...(n.rest >= 0.75 ? ['yawn', 'rest'] : []));
  if (n.play >= 0.5) out.push('sway', 'tail', ...(n.play >= 0.75 ? ['tail', 'ears'] : []));
  if (n.attention >= 0.5) out.push('wave', 'lookAround', ...(n.attention >= 0.75 ? ['wave'] : []));
  if (n.stimulation >= 0.6) out.push('lookAround', 'lookAround');
  return out;
}
export function thoughtExtras() {
  if (!on.needs) return [];
  const n = Needs.levels(), out = [];
  if (n.rest >= 0.5) out.push('sleepy', 'zzz', 'a_load');
  if (n.play >= 0.5) out.push('game', 'star', 'a_owo');
  if (n.attention >= 0.5) out.push('question', 'a_beep');
  if (n.affection >= 0.6) out.push('heart', 'a_heart');
  if (n.stimulation >= 0.6) out.push('dots', 'idea', 'a_flat');
  return out;
}

// a small summary for her prompt (api/lib/feel.php turns it into words). Nothing when the
// needs and tiring are both off
export function forChat() {
  const out = {};
  if (on.needs) {
    const n = Needs.levels();
    out.needs = Object.fromEntries(Needs.NEEDS.map(k => [k, Math.round(n[k] * 100) / 100]));
  }
  if (on.tiring) {
    out.tired = Tired.list(ctxNow()).filter(x => ['plenty', 'enough', 'sore'].includes(x.state)).slice(0, 4).map(x => [x.kind, x.state]);
  }
  out.phase = Session.phase();
  const st = Session.start();
  out.away_min = Math.round(st.awayMs / 60000);
  return out;
}

// everything, for the feel lab and jun.feel()
export function snapshot() {
  const ctx = ctxNow();
  const n = Needs.levels();
  return {
    switches: switches(),
    mood: moodNow(),
    needs: n,
    top: Needs.top(n),
    phase: Session.phase(),
    engagement: Session.engagement(),
    session: Session.start(),
    tired: Tired.list(ctx),
    repeat: Object.fromEntries(Repeat.channels().map(c => [c, Repeat.recent(c, 10)])),
    building: Repeat.isBuilding(),
    hist: Store.get().hist.slice(-25),
    going: [...going.entries()].map(([slot, g]) => ({ slot, kind: g.kind, ms: Store.now() - g.t0 })),
    last: lastReaction,
  };
}

refresh();
