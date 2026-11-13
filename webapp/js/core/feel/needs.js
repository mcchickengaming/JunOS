// her needs (#27): attention, affection, play, rest and stimulation (new things). Each is a
// want from 0 (content) to 1 (she really wants it). They grow by themselves over time, at her
// own pace (a little different for every Jun), and things you do together satisfy them. They
// drive what she does on her own ("As she feels", the initiative engine), color her replies,
// and give a natural reason to vary what you do with her.
//
// Lazy: kept with the time they were true and moved forward when read, so they keep going while
// no window is open (she misses you while you're away; she sleeps through the night).

import * as Store from './store.js?v=4';
import { TUNE } from './tune.js?v=5';

export const NEEDS = ['attention', 'affection', 'play', 'rest', 'stimulation'];
export const NAMES = { attention: 'Attention', affection: 'Affection', play: 'Play', rest: 'Rest', stimulation: 'Something new' };
const START = { attention: 0.35, affection: 0.3, play: 0.3, rest: 0.15, stimulation: 0.3 };
const STEP_MS = 10 * 60 * 1000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// her own pace for a need: the same every day for this Jun, different for another
function pace(need) {
  const p = TUNE.needs.ownPace;
  return 1 + p * (2 * Store.hash01('pace', need) - 1);
}
function restRate(hour) {
  if (hour >= 23 || hour < 6) return TUNE.needs.restNight;
  if (hour >= 19) return TUNE.needs.restEvening;
  return TUNE.needs.restDay;
}
function lastEventAt(s) { return s.hist.length ? s.hist[s.hist.length - 1][0] : s.born; }

// move the needs forward from when they were last true to t
function advance(s, t) {
  if (!s.needs) s.needs = { at: t, v: { ...START }, resting: false };
  const n = s.needs;
  for (const k of NEEDS) if (typeof n.v[k] !== 'number') n.v[k] = START[k];
  const quietSince = lastEventAt(s);
  let from = n.at;
  // a clock that went backwards, or a very old save: don't simulate more than two days
  if (t < from) { n.at = t; return n; }
  from = Math.max(from, t - 2 * 24 * 3600e3);
  while (from < t) {
    const dt = Math.min(STEP_MS, t - from);
    const h = dt / 3600e3;
    const hour = new Date(from).getHours();
    // hours without him, at night: she slept
    const slept = (hour >= 23 || hour < 7) && from - quietSince > 3 * 3600e3;
    for (const k of NEEDS) {
      let rate;
      if (k === 'rest') rate = n.resting || slept ? TUNE.needs.restWhileResting : restRate(hour) * pace(k);
      else rate = (TUNE.needs.rise[k] || 0) * pace(k);
      // missing him levels off: a big hello when he's back, never despair
      if (rate > 0 && n.v[k] > TUNE.needs.awayCap) rate *= 0.1;
      n.v[k] = clamp01(n.v[k] + rate * h);
    }
    from += dt;
  }
  n.at = t;
  return n;
}

// her needs now, 0..1 each
export function levels() {
  const t = Store.now();
  const s = Store.get();
  // reading moves them forward; only write when it's been a while
  if (!s.needs || t - s.needs.at > 60000) Store.change(st => advance(st, t));
  else advance(s, t);
  return { ...s.needs.v };
}

// something satisfied her: { affection: 0.1, ... }, times k. A negative amount makes her want
// it more (the same thing again and again leaves her wanting something new)
export function satisfy(map, k = 1) {
  const t = Store.now();
  Store.change(s => {
    advance(s, t);
    for (const [need, amt] of Object.entries(map || {})) {
      if (NEEDS.includes(need) && Number.isFinite(amt)) s.needs.v[need] = clamp01(s.needs.v[need] - amt * k);
    }
  });
}
// she's resting (dozing on the taskbar, curled up in one of her spots)
export function setResting(on) {
  const t = Store.now();
  Store.change(s => { advance(s, t); s.needs.resting = !!on; });
}
// the feel lab: set one directly
export function setLevel(need, v) {
  if (!NEEDS.includes(need)) return;
  const t = Store.now();
  Store.change(s => { advance(s, t); s.needs.v[need] = clamp01(v); });
}

// how much, in words (for the lab, the settings and her prompt)
export function band(v) { return v >= 0.75 ? 'really' : v >= 0.5 ? 'wants' : v >= 0.25 ? 'little' : 'content'; }
const WORDS = {
  attention: { little: 'would like a little attention', wants: 'wants your attention', really: 'really wants your attention' },
  affection: { little: 'would like a little affection', wants: 'wants some affection', really: 'is craving affection' },
  play: { little: 'feels a bit playful', wants: 'wants to play', really: 'really wants to play' },
  rest: { little: 'is a little tired', wants: 'is getting sleepy', really: 'is very sleepy' },
  stimulation: { little: 'could use something new', wants: 'is a bit bored', really: 'is really bored' },
};
export function words(need, v) { return WORDS[need]?.[band(v)] || null; }

// the strongest want right now (or null when she's content)
export function top(lv = levels()) {
  let best = null;
  for (const k of NEEDS) if (lv[k] >= 0.5 && (!best || lv[k] > lv[best])) best = k;
  return best;
}
