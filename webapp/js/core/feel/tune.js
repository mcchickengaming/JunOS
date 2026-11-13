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
    wave: { attention: 0.05 },
    // something she hasn't had for a while is new again; doing the same thing is a little boring
    newKind: 0.07, newKindAfterMin: 12, sameAgain: 0.004,
  },
  tired: {
    // load per second of a hold/rub (about 1 = "plenty", after ~80 s of one touch)
    perSec: 0.0125,
    // some touches tire faster (tickles) or slower (a hug)
    rate: { side: 2.0, feettickle: 2.2, tailgrab: 1.4, thighsquish: 1.3, hug: 0.6, hand: 0.6, head: 0.8 },
    poke: 0.08, combo: 0.22, toss: 0.18,
    // the same touch again right away weighs a little more (and more each time, see inARowMax)
    inARow: 0.03,
    // related touches share part of it (a head rub and an ear rub)
    share: 0.3,
    // the load halves every this many minutes: about 2-3 hours back to fresh
    halfLifeMin: 40,
    // where the states start (her favorites push these up)
    enjoying: 0.35, plenty: 0.85, enough: 1.35, sore: 1.8,
    // how much power is left at "enough", and where it settles far past it (it eases down, no cliff)
    floor: 0.45, floorDeep: 0.3,
    // getting into it: a touch gives a little MORE as she warms to it, most right at "enjoying"
    warmUp: 0.06,
    // the same touch again and again in a row weighs more each time, up to this many times
    inARowMax: 3,
    // a fast, scrubby rub wears on her quicker: up to this much more load when it's all rough
    roughLoad: 0.6,
    // her favorites: each touch gets her own weight in this range, drifting week to week
    favLow: 0.75, favHigh: 1.35, favDrift: 0.15,
    // what he's given her a lot of these days she's a little less keen on, and what she hasn't had
    // in days she misses: up to ± this much. useFull = this much load over the last days is "a lot",
    // and it fades with this half-life (days)
    favMiss: 0.08, useFull: 6, useHalfLifeDays: 3,
  },
  // how it's done: a rub's speed, steadiness and area (manner.js). Speeds and sizes are in
  // "her heights" (1 = as tall as she is on screen), so they hold at any size
  manner: {
    windowMs: 1200,     // how far back a rub is looked at
    minMs: 350,         // this much of it before she can tell how it's done
    stillSpeed: 0.04,   // slower than this (her heights a second) = a hand resting on her
    gentleSpeed: 0.55,  // up to this = slow and gentle
    roughSpeed: 1.5,    // from this = fast and scrubby
    roughTurns: 5,      // ...or this many changes of direction a second
    steadyMin: 0.45,    // gentle also needs it this steady (0 jerky .. 1 even)
    tooMuchMs: 3500,    // this long of rough in one go = too much: a pout
    tooMuchLowBondMs: 1400, // sooner when she barely knows him
    meltAfterMs: 2500,  // this long of slow and gentle and she melts (Close and up)
    gentlePower: 0.1, roughPlayPower: 0.08, tooMuchPower: 0.75,
  },
  // what just happened, and how the time together is going
  moment: {
    changeWithinSec: 90, changePower: 0.06,      // a change of touch is a little fresh air
    comboGlowSec: 8, comboPower: 0.1,            // still glowing from a combo
    surpriseAfterMin: 4, surprisePower: 0.08,    // nothing for this long, then a sudden poke
    sawItComingMs: 1800,                         // she noticed the hand: no surprise
    insistSec: 180,                              // doing it again this soon after "enough"
    greetingPower: 0.12, greetingFullAwayH: 6,   // glad he's back: more the longer he was away
    peakPower: 0.05, windDownTempo: 1.25, afterglowTempo: 1.35, afterglowPower: 0.05,
    favLovesAt: 1.2,                             // a favorite this strong can tip likes → loves
    wantedPower: 0.1, sleepyPlay: 0.85,
  },
  // variety: how she plays a reaction out
  variety: {
    plainChance: 0.45,   // how often a reaction is just her usual way (the rest: one of her other ways)
    rippleChance: 0.25,  // "let her pick": how often she changes the ripple
    tempoSpread: 0.15,   // each touch runs a little quicker or calmer than the last, ± this
    pokeDelayMs: 90,     // a shy or surprised beat before a poke's effects, up to this
  },
  // she sees his hand coming (approach.js)
  approach: {
    near: 0.3,          // within this far of a spot (her heights) she can notice
    minClosing: 0.25,   // the hand has to be coming closer at least this fast (her heights a second)
    fast: 2.2,          // from this speed it's sudden: a flinch or a blink
    everyMs: 2600,      // at most one of these in this long
    afterTouchMs: 1500, // and not right after a touch ended
    chance: 0.8,        // she doesn't notice every single time
    leanInChance: 0.6,  // how often a welcome hand gets a lean in (the rest: her eyes and an ear)
  },
  // the initiative engine (#4, initiative.js): what she starts on her own
  init: {
    tickSec: 4,          // how often she thinks about it (cheap; most ticks end in nothing)
    // how fast each want grows, per hour, when her needs fit it about halfway
    rise: { headpat: 0.2, wave: 0.2, fetch: 0.15 },
    startAt: 0.4,        // a want under this stays inside her
    meanSec: 230,        // a strong want and a free him: about one start in this long
    gapMin: 5,           // at least this long between two things she starts...
    gapLoud: 3,          // ...times this after something loud (she came over, spoke up or asked)
    // not the same thing again for this many minutes, by how the last one went
    againYes: 12, againIgnored: 20, againNo: 45, againHint: 8,
    // how long she waits for an answer on each step of the ladder (seconds; step 3 = she came over)
    wait1: 12, wait2: 14, wait3: 24, wait4: 22, wait5: 30,
    // what each step costs of her day's attention budget, and the budget itself
    cost1: 0.2, cost2: 0.5, cost3: 1.5, cost4: 2.5, cost5: 3.5,
    budget: 45,
    climbMax: 2,         // at most this many steps up in one go
    persist: 0.45,       // ignored: how often she tries harder (the rest: she lets it go)
    // how strong a want has to be before she'd go up to step 3, 4, 5
    urge3: 0.5, urge4: 0.66, urge5: 0.76,
    strongWant: 0.72,    // told no while wanting it this much: a pout, "pretty please", an offer...
    keepAfterYes: 0.12, keepAfterNo: 0.7, keepAfterIgnored: 0.85, // how much of the want is left
    learnSpan: 0.35, learnHalfLifeDays: 12, // what she learns he likes: up to ± this much, fading
    backWave: 0.9,       // he's just back: she wants to wave this much
    promiseHours: 6, promiseBoost: 2.2, // "later, promise?": she remembers this long
    sulkMinLo: 2, sulkMinHi: 5, // a sulk is short (minutes) and melts with a kind touch
    moodSwing: 0.4,      // how much her mood of the day moves things (As she feels)
    oneMore: 0.55,       // fetch: how often she wants "one more!" while she still feels like playing
    waveBackMs: 9000,    // she waved on her own: he has this long to wave back
    hisWaveEveryMs: 9000, hisWaveNear: 1.1, // he waves at her: not more often; this close (her heights)
    hisWaveFlips: 3, hisWaveWindowMs: 1500, hisWaveSweep: 0.07, hisWaveTurn: 5.2, // the gesture itself
  },
  // reading the room (room.js): how free he looks, 0..1, and how loud she may be (ladder step)
  room: {
    awaySec: 180,        // no input for this long: nobody's there to see it
    stillSec: 45,        // quiet this long (reading? watching?): hints only
    typingMs: 8000,      // keys without the mouse for this long: he's typing
    backSec: 90,         // "just came back" lasts this long
    busyShare: 0.75,     // the mouse moving this much of the last half minute: he's busy
    afterIgnored: 0.6,   // right after she was ignored she holds back this much
    afterIgnoredMin: 10,
  },
  repeat: {
    keep: 24,
    // how long something counts as "just did that", in seconds, per kind of thing
    forget: { line: 1800, emote: 180, idle: 300, piece: 20, reaction: 120, thought: 240, variant: 90, linetype: 600, approach: 45, hint: 240, ask: 3600, lit: 600, letgo: 1200, toldno: 7200, hiswave: 120 },
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
