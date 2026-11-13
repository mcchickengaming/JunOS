// every number of core feel (#27) in one place, so the feel lab can show and change them live.
// The lab's changes are saved as overrides in localStorage 'jun.feel.tune' ({ "needs.rise.play":
// 0.2, ... }) and reach every window of hers. Defaults are tuned to a natural Jun; nothing here
// needs changing for her to feel right.

export const TUNE_KEY = 'jun.feel.tune';

export const DEFAULTS = {
  needs: {
    // how fast each want grows, per hour (0 = content, 1 = she really wants it)
    rise: { attention: 0.2, affection: 0.12, play: 0.14, stimulation: 0.12 },
    // rest: sleepiness per hour by the time of day, and how fast resting takes it away
    restDay: 0.04, restEvening: 0.09, restNight: 0.22, restWhileResting: -0.6,
    // while he's away for hours she misses him, but it levels off (a big hello, never despair)
    awayCap: 0.85,
    // her own pace: each need's rise is scaled by up to ± this much, per install
    ownPace: 0.25,
    // what satisfies what. per second of a hold or rub
    warmPerSec: { affection: 0.012, attention: 0.008 },
    playPerSec: { play: 0.016, attention: 0.006, stimulation: 0.004 },
    // per event
    poke: { attention: 0.03, play: 0.01 },
    combo: { affection: 0.08, play: 0.06, stimulation: 0.05 },
    message: { attention: 0.12, stimulation: 0.03 },
    toss: { play: 0.07, stimulation: 0.04 },
    // something she hasn't had for a while is new again; doing the same thing is a little boring
    newKind: 0.07, newKindAfterMin: 12, sameAgain: 0.004,
  },
  tired: {
    // load per second of a hold/rub (about 1 = "plenty", after ~80 s of one touch)
    perSec: 0.0125,
    // some touches tire faster (tickles) or slower (a hug)
    rate: { side: 2.0, feettickle: 2.2, tailgrab: 1.4, thighsquish: 1.3, hug: 0.6, hand: 0.6, head: 0.8 },
    poke: 0.08, combo: 0.22, toss: 0.18,
    // the same touch again right away weighs a little more
    inARow: 0.05,
    // related touches share part of it (a head rub and an ear rub)
    share: 0.3,
    // the load halves every this many minutes: about 2-3 hours back to fresh
    halfLifeMin: 40,
    // where the states start (her favorites push these up)
    enjoying: 0.35, plenty: 0.85, enough: 1.35, sore: 1.8,
    // how much power is left at "enough" and past it
    floor: 0.45,
    // her favorites: each touch gets her own weight in this range, drifting week to week
    favLow: 0.75, favHigh: 1.35, favDrift: 0.15,
  },
  repeat: {
    keep: 24,
    // how long something counts as "just did that", in seconds, per kind of thing
    forget: { line: 1800, emote: 180, idle: 300, piece: 20, reaction: 120, thought: 240 },
    // how hard a repeat is pushed down (1 = never again while remembered)
    strength: 0.85,
  },
  session: {
    awayMin: 30,       // this long without anything = he's away
    greetingMin: 2,    // a hello lasts this long after he's back
    windowMin: 10,     // how far back "how much are we doing" looks
    peakAt: 6,         // this much going on in the window = the peak
    windDown: 0.35,    // dropping under this share of the peak = winding down
    afterglowMin: 6,   // the warm feeling after a long cuddle lasts this long
    afterglowAfterSec: 20,
  },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

export const TUNE = deepCopy(DEFAULTS);

function readOverrides() {
  try { return JSON.parse(globalThis.localStorage?.getItem(TUNE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeOverrides(o) {
  try { globalThis.localStorage?.setItem(TUNE_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
}

function at(path) {
  const parts = path.split('.');
  let o = TUNE, d = DEFAULTS;
  for (let i = 0; i < parts.length - 1; i++) { o = o?.[parts[i]]; d = d?.[parts[i]]; }
  return { o, d, k: parts[parts.length - 1] };
}

// apply the saved overrides on top of the defaults (and again when another window changes them)
export function load() {
  const fresh = deepCopy(DEFAULTS);
  for (const k of Object.keys(fresh)) TUNE[k] = fresh[k];
  for (const [path, v] of Object.entries(readOverrides())) {
    const { o, d, k } = at(path);
    if (isObj(o) && typeof d?.[k] === 'number' && Number.isFinite(v)) o[k] = v;
  }
}

export function get(path) { const { o, k } = at(path); return o?.[k]; }
export function defaultOf(path) { const { d, k } = at(path); return d?.[k]; }

// the feel lab: change one number (live, saved). null = back to the default
export function set(path, v) {
  const { o, d, k } = at(path);
  if (!isObj(o) || typeof d?.[k] !== 'number') return false;
  const ov = readOverrides();
  if (v === null || v === d[k]) { delete ov[path]; o[k] = d[k]; }
  else { if (!Number.isFinite(v)) return false; ov[path] = v; o[k] = v; }
  writeOverrides(ov);
  return true;
}
export function reset() { writeOverrides({}); load(); }
export function changed() { return readOverrides(); }

// every number with its path, for the lab's table
export function paths(o = DEFAULTS, pre = '') {
  const out = [];
  for (const [k, v] of Object.entries(o)) {
    if (isObj(v)) out.push(...paths(v, pre + k + '.'));
    else if (typeof v === 'number') out.push(pre + k);
  }
  return out;
}

load();
try { globalThis.addEventListener?.('storage', (e) => { if (e.key === TUNE_KEY) load(); }); } catch (e) { /* not a browser */ }
