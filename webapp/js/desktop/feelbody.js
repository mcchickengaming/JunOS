// how she feels, in her body (desktop only): her ears, tail, eyes, blush
// and a soft lean, driven by the feeling moods.js picks for a touch.
//
//   not ready  ears flatten, tail stiff and up with a shiver, small pupils,
//              a little start; after the touch a SOFT lean away from the
//              hand (owner: never aggressive), ears slowly come back
//   flustered  blush builds, ears twitch and flicker, quick tail flicks,
//              eyes look away and down
//   likes it   relaxed ears, tail low and slow, soft happy eyes
//   loves it   ears up, a fast happy wag, happy eyes, full blush, heart
//              eyes now and then on a strong one
//   giggly     bouncing ears, a very fast wiggle, squinty eyes
//
// every number is in TUNE. show() runs every tick of moods.js while a
// feeling is on; after() once when the touch ends; pulse() for a poke.
// the owner's picks (desktop.fx): mBody on/off, mBodyStr strength,
// mBodyEars / mBodyTail / mBodyEyes / mBodyLean.

import * as Live2D from '../live2d/live2d.js?v=94';
import { targetParams } from '../live2d/state.js?v=75';

export const TUNE = {
  hold: 360,                 // ms each show() keeps its params
  // not ready
  nrEars: -0.85, nrIris: -0.45, nrShockMs: 650,
  nrTail: { amp: 0.15, period: 0.55, rest: 0.3 }, nrTremble: [0.45, 1],
  awayMs: 2600, awayBody: 0.12, awayHead: 0.1, awayTurn: 0.28, awayEyes: 0.45,
  // flustered
  flBlush: [0.45, 0.95], flTail: { amp: 0.8, period: 0.8, rest: 0.9 },
  flEarEvery: [900, 300], flFlickEvery: [1500, 550], flLookAway: 0.6, flLookDown: -0.25,
  // likes it
  lkEars: 0.25, lkHappy: [0.3, 0.7], lkBlush: [0.15, 0.4], lkTail: { amp: 0.6, period: 2.1, rest: 1.45 },
  // loves it
  lvEars: 0.6, lvHappy: [0.7, 1], lvBlush: [0.55, 0.95], lvTail: { amp: 1.6, period: 0.2, rest: 1 },
  lvHeartAt: 0.65, lvHeartEvery: [5500, 3500], lvHeartMs: 1700,
  // giggly
  ggEars: [0.5, 0.4], ggEarMs: 90, ggHappy: 1, ggBlush: 0.3, ggTail: { amp: 1.8, period: 0.11, rest: 0.9 },
};

// while she leans away, her "look at the cursor" must not turn her
// head right back to him (desktop.js wires this to Body.busyFor)
let onAway = () => {};
export function setOnAway(fn) { onAway = fn || (() => {}); }

let prefs = { on: true, str: 1, ears: true, tail: true, eyes: true, lean: true };
export function setPrefs(fx) {
  prefs = {
    on: fx.mBody !== false, str: Math.max(0, Number(fx.mBodyStr ?? 1)),
    ears: fx.mBodyEars !== false, tail: fx.mBodyTail !== false, eyes: fx.mBodyEyes !== false, lean: fx.mBodyLean !== false,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const range = (r, p) => (Array.isArray(r) ? lerp(r[0], r[1], p) : r);
const set = (p, v, ms = TUNE.hold) => { Live2D.setTarget(p, v); Live2D.hold(p, ms); };
// only ever adds to what a touch's own reaction already does (a blush
// that's higher stays)
const raise = (p, v, ms = TUNE.hold) => { if ((targetParams.get(p) ?? -Infinity) < v) set(p, v, ms); };
// the owner's strength: a value moves that much of the way from rest
const k = (v, rest = 0) => rest + (v - rest) * prefs.str;
function tail(m, ms = TUNE.hold + 200, extra = {}) {
  if (!prefs.tail) return;
  const t = {};
  for (const key of ['amp', 'period', 'rest']) t[key] = k(m[key], 1);
  Live2D.setTailMood({ ...t, ...extra }, ms);
}

// the moment-to-moment state: when the feeling started, the next ear
// twitch / tail flick / heart eyes, where her eyes look away to
let cur = null, since = 0, nextEar = 0, nextFlick = 0, nextHeart = 0, lookSide = 1, nextLook = 0;

function earTwitch(power) {
  // one ear (now and then both) snaps back and springs up: a flicker
  const both = Math.random() < 0.25;
  const ears = both ? ['ParamEarL', 'ParamEarR'] : [Math.random() < 0.5 ? 'ParamEarL' : 'ParamEarR'];
  for (const e of ears) {
    set(e, k(-0.9), 110);
    setTimeout(() => set(e, k(0.5), 130), 110);
    setTimeout(() => set(e, k(0.05), 200), 240);
  }
  // a fast double flick sometimes, when she's very flustered
  if (power > 0.6 && Math.random() < 0.35) setTimeout(() => earTwitch(0), 420);
}

export function show(feeling, power, now = performance.now()) {
  if (!prefs.on || !Live2D.hasModel()) return;
  if (feeling !== cur) {
    cur = feeling;
    since = now;
    nextEar = nextFlick = now + 120;
    nextHeart = now + 1500;
    lookSide = Math.random() < 0.5 ? -1 : 1;
    nextLook = now + 1500 + Math.random() * 1500;
  }
  const t = now - since;
  switch (feeling) {
    case 'notready':
      if (prefs.ears) { set('ParamEarL', k(TUNE.nrEars)); set('ParamEarR', k(TUNE.nrEars)); }
      tail(TUNE.nrTail, undefined, { tremble: k(range(TUNE.nrTremble, power)) });
      if (prefs.eyes) {
        set('ParamIrisZoom', k(TUNE.nrIris * (0.6 + power * 0.4)));
        // a little start right as she realizes
        if (t < TUNE.nrShockMs) { set('ParamEyeLShock', k(0.8), 200); set('ParamEyeRShock', k(0.8), 200); }
      }
      break;
    case 'flustered':
      if (prefs.eyes) {
        raise('ParamBlush', k(range(TUNE.flBlush, power)));
        if (now > nextLook) { lookSide = -lookSide; nextLook = now + 1400 + Math.random() * 1800; }
        set('ParamEyeballLX', k(TUNE.flLookAway * lookSide));
        set('ParamEyeballRX', k(TUNE.flLookAway * lookSide));
        set('ParamEyeballLY', k(TUNE.flLookDown));
        set('ParamEyeballRY', k(TUNE.flLookDown));
      }
      if (prefs.ears && now > nextEar) {
        earTwitch(power);
        nextEar = now + range(TUNE.flEarEvery, power) * (0.7 + Math.random() * 0.6);
      }
      tail(TUNE.flTail);
      if (prefs.tail && now > nextFlick) {
        Live2D.tailFlickOnce(k(0.6 + power * 0.7));
        nextFlick = now + range(TUNE.flFlickEvery, power) * (0.7 + Math.random() * 0.6);
      }
      break;
    case 'likes':
      if (prefs.ears) { set('ParamEarL', k(TUNE.lkEars)); set('ParamEarR', k(TUNE.lkEars)); }
      tail(TUNE.lkTail);
      if (prefs.eyes) { raise('ParamEyesHappy', k(range(TUNE.lkHappy, power))); raise('ParamBlush', k(range(TUNE.lkBlush, power))); }
      break;
    case 'loves':
      if (prefs.ears) { set('ParamEarL', k(TUNE.lvEars)); set('ParamEarR', k(TUNE.lvEars)); }
      tail(TUNE.lvTail);
      if (prefs.eyes) {
        raise('ParamEyesHappy', k(range(TUNE.lvHappy, power)));
        raise('ParamBlush', k(range(TUNE.lvBlush, power)));
        // heart eyes now and then on a strong one, never all the time
        if (power >= TUNE.lvHeartAt && now > nextHeart) {
          set('ParamHeart', 1, TUNE.lvHeartMs);
          set('ParamIrisZoom', 0.5, TUNE.lvHeartMs);
          nextHeart = now + TUNE.lvHeartMs + range(TUNE.lvHeartEvery, power) * (0.8 + Math.random() * 0.5);
        }
      }
      break;
    case 'giggly':
      if (prefs.ears) {
        const b = Math.sin(now / TUNE.ggEarMs);
        set('ParamEarL', k(TUNE.ggEars[0] + TUNE.ggEars[1] * b), 200);
        set('ParamEarR', k(TUNE.ggEars[0] - TUNE.ggEars[1] * b), 200);
      }
      tail(TUNE.ggTail);
      if (prefs.eyes) { raise('ParamEyesHappy', k(TUNE.ggHappy)); raise('ParamBlush', k(TUNE.ggBlush)); }
      break;
  }
}

// the touch is over: how she comes out of it. side: where his hand was,
// -1 left of her face, 1 right (0 unknown)
export function after(feeling, power, side = 0) {
  cur = null;
  if (!prefs.on || !Live2D.hasModel()) return;
  switch (feeling) {
    case 'notready': {
      // a soft lean AWAY from his hand, ears staying down a moment,
      // then everything eases back
      if (prefs.lean) {
        const s = side ? -Math.sign(side) : (Math.random() < 0.5 ? -1 : 1);
        const p = 0.6 + power * 0.4;
        onAway(TUNE.awayMs + 300);
        Live2D.playSequence([
          { dt_ms: 0, params: {
            ParamBodyZ: k(TUNE.awayBody * s * p), ParamHeadZ: k(TUNE.awayHead * s * p), ParamHeadX: k(TUNE.awayTurn * s * p),
            ParamEyeballLX: k(TUNE.awayEyes * s), ParamEyeballRX: k(TUNE.awayEyes * s) } },
          { dt_ms: TUNE.awayMs, params: { ParamBodyZ: 0, ParamHeadZ: 0, ParamHeadX: 0, ParamEyeballLX: 0, ParamEyeballRX: 0 } },
        ]);
      }
      if (prefs.ears) Live2D.playSequence([
        { dt_ms: 0, params: { ParamEarL: k(TUNE.nrEars * 0.8), ParamEarR: k(TUNE.nrEars * 0.8) } },
        { dt_ms: TUNE.awayMs * 0.8, params: { ParamEarL: 0, ParamEarR: 0 } },
      ]);
      tail(TUNE.nrTail, 1600, { tremble: k(0.3) });
      break;
    }
    case 'flustered':
      if (prefs.eyes) raise('ParamBlush', k(0.5), 2000);
      if (prefs.ears) setTimeout(() => earTwitch(0), 300);
      if (prefs.tail) setTimeout(() => Live2D.tailFlickOnce(k(0.8)), 500);
      break;
    case 'likes':
      tail(TUNE.lkTail, 1800);
      break;
    case 'loves':
      // she stays happy a little while
      if (prefs.eyes) raise('ParamEyesHappy', k(0.6), 1500);
      tail({ amp: 1.2, period: 0.6, rest: 1 }, 2500);
      break;
    case 'giggly':
      tail(TUNE.ggTail, 900);
      break;
  }
}

// a single moment (a poke, a combo, wriggling free): the feeling for a
// short while, then the way out of it
const pulses = new Set();
export function pulse(feeling, power, side = 0, ms = 750) {
  if (!prefs.on) return;
  const t0 = performance.now();
  const id = setInterval(() => {
    const now = performance.now();
    if (now - t0 > ms) { clearInterval(id); pulses.delete(id); after(feeling, power, side); return; }
    show(feeling, power, now);
  }, 120);
  pulses.add(id);
  show(feeling, power, t0);
}
