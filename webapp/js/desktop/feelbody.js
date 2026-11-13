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
//   secretly   she won't admit it: looks away, blushing, ears twitching,
//   loves it   but her tail gives her away (a happy wag she can't stop),
//              and a stolen glance back now and then
//   comforted  ears soft and low, eyes half closed, a slow calm sway,
//              the blush of someone being looked after
//
// every number is in TUNE. show() runs every tick of moods.js while a
// feeling is on; after() once when the touch ends; pulse() for a poke.
//
// core feel (#27): the reaction composer (core/feel/compose.js) also
// says WHICH WAY she shows a feeling this time (style.variant, its
// VARIANTS list), so the same feeling doesn't look the same every
// time: loving it with bright eyes, or melting with her eyes closed.
// 'plain' (or no style) is the way described above. onset() is the
// instant a touch lands (her eyes, an ear, a blink), approach() what
// she does when she sees his hand coming (core/feel/approach.js).
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
  // secretly loves it
  scBlush: [0.6, 1], scTail: { amp: 1.3, period: 0.28, rest: 1 }, scLookAway: 0.7, scEarEvery: [1600, 800],
  scGlanceEvery: [3200, 2000], scGlanceMs: 450,
  // comforted
  cfEars: -0.25, cfHappy: [0.35, 0.6], cfBlush: [0.2, 0.4], cfTail: { amp: 0.45, period: 2.6, rest: 1.25 },
  // her other ways of showing a feeling (the composer picks one per touch)
  vShrinkEars: -1, vShrinkEyes: -0.45, vShrinkBody: -0.15,
  vFreezeEars: 0.7, vFreezeMs: 1100, vFreezeTail: { amp: 0.03, period: 0.6, rest: 0.6 },
  vDownEars: -0.4, vDownLook: -0.6, vDownTail: { amp: 0.4, period: 1.6, rest: 0.7 },
  vPeekEvery: [2600, 1600], vPeekMs: 350,
  vDrowsyEars: -0.05, vDrowsyEyes: [-0.35, -0.6], vDrowsyTail: { amp: 0.45, period: 2.8, rest: 1.4 },
  vBrightEars: 0.55, vBrightHappy: 0.5, vBrightTail: { amp: 0.9, period: 1.2, rest: 1.3 }, vBrightPerkEvery: 1500,
  vMeltEars: 0.1, vMeltEyes: -0.8, vMeltTail: { amp: 1.2, period: 0.9, rest: 1.2 },
  vSparkleEarMs: 220, vSparkleEars: [0.6, 0.25], vSparkleHeartAt: 0.45, vSparkleHeartEvery: 0.6,
  vSquirmEarMs: 200, vSquirmEars: [0.3, 0.6], vSquirmEyes: -0.7,
  vPoutEars: -0.5, vPoutLookUp: 0.3,
  vSlipEvery: 4200, vSlipMs: 900, vSlipHappy: 0.7,
  vNuzzleEars: -0.45, vNuzzleEyes: -0.75, vNuzzleTail: { amp: 0.4, period: 3.2, rest: 1.3 },
  // the instant a touch lands
  onsetGlance: 0.55, onsetGlanceMs: 240, onsetBlinkMs: 100, onsetShock: 0.6, onsetShockMs: 260,
  // she sees his hand coming
  apEyes: 0.6, apPerk: 0.7, apPerkMs: 260,
  apLeanBody: 0.1, apLeanHead: 0.12, apLeanHappy: 0.4, apLeanMs: 950,
  apFlinchShock: 0.7, apFlinchEars: -0.8, apFlinchBody: 0.06, apFlinchMs: 550,
  apBraceEars: -0.45, apBraceMs: 900, apBraceTail: { amp: 0.2, period: 0.6, rest: 0.5 },
  apGuardEyes: 0.7, apGuardTurn: 0.25, apGuardMs: 1200,
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
let cur = null, curV = 'plain', since = 0, nextEar = 0, nextFlick = 0, nextHeart = 0, lookSide = 1, nextLook = 0, glanceUntil = 0;

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

export function show(feeling, power, now = performance.now(), style = null) {
  if (!prefs.on || !Live2D.hasModel()) return;
  const v = style?.variant || 'plain';
  if (feeling !== cur || v !== curV) {
    cur = feeling;
    curV = v;
    since = now;
    nextEar = nextFlick = now + 120;
    nextHeart = now + 1500;
    lookSide = Math.random() < 0.5 ? -1 : 1;
    nextLook = now + 1500 + Math.random() * 1500;
  }
  const t = now - since;
  switch (feeling) {
    case 'notready':
      if (v === 'shrink') {
        // she makes herself small: ears pinned, eyes squeezed, a little duck
        if (prefs.ears) { set('ParamEarL', k(TUNE.vShrinkEars)); set('ParamEarR', k(TUNE.vShrinkEars)); }
        tail(TUNE.nrTail, undefined, { tremble: k(range(TUNE.nrTremble, power)) });
        if (prefs.eyes) set('ParamEyeOpen', k(TUNE.vShrinkEyes));
        if (prefs.lean) set('ParamBodyY', k(TUNE.vShrinkBody));
        break;
      }
      if (v === 'freeze') {
        // she goes stock-still: ears straight up, wide eyes, the tail stops dead
        if (prefs.ears) { set('ParamEarL', k(TUNE.vFreezeEars)); set('ParamEarR', k(TUNE.vFreezeEars)); }
        tail(TUNE.vFreezeTail);
        if (prefs.eyes) {
          set('ParamIrisZoom', k(TUNE.nrIris));
          if (t < TUNE.vFreezeMs) { set('ParamEyeLShock', k(0.9), 200); set('ParamEyeRShock', k(0.9), 200); }
        }
        break;
      }
      if (prefs.ears) { set('ParamEarL', k(TUNE.nrEars)); set('ParamEarR', k(TUNE.nrEars)); }
      tail(TUNE.nrTail, undefined, { tremble: k(range(TUNE.nrTremble, power)) });
      if (prefs.eyes) {
        set('ParamIrisZoom', k(TUNE.nrIris * (0.6 + power * 0.4)));
        // a little start right as she realizes
        if (t < TUNE.nrShockMs) { set('ParamEyeLShock', k(0.8), 200); set('ParamEyeRShock', k(0.8), 200); }
      }
      break;
    case 'flustered':
      if (v === 'down') {
        // eyes on the floor, ears drooping, the tail low: quietly flustered
        if (prefs.eyes) {
          raise('ParamBlush', k(range(TUNE.flBlush, power)));
          set('ParamEyeballLX', 0); set('ParamEyeballRX', 0);
          set('ParamEyeballLY', k(TUNE.vDownLook)); set('ParamEyeballRY', k(TUNE.vDownLook));
        }
        if (prefs.ears) { set('ParamEarL', k(TUNE.vDownEars)); set('ParamEarR', k(TUNE.vDownEars)); }
        tail(TUNE.vDownTail);
        break;
      }
      if (prefs.eyes) {
        raise('ParamBlush', k(range(TUNE.flBlush, power)));
        if (v === 'peek') {
          // looking away, but she keeps stealing looks at him
          if (now > nextLook) { glanceUntil = now + TUNE.vPeekMs; nextLook = now + range(TUNE.vPeekEvery, power) * (0.8 + Math.random() * 0.5); }
        } else if (now > nextLook) { lookSide = -lookSide; nextLook = now + 1400 + Math.random() * 1800; }
        const peeking = v === 'peek' && now < glanceUntil;
        set('ParamEyeballLX', k(peeking ? 0 : TUNE.flLookAway * lookSide));
        set('ParamEyeballRX', k(peeking ? 0 : TUNE.flLookAway * lookSide));
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
      if (v === 'drowsy') {
        // so nice her eyes go heavy
        if (prefs.ears) { set('ParamEarL', k(TUNE.vDrowsyEars)); set('ParamEarR', k(TUNE.vDrowsyEars)); }
        tail(TUNE.vDrowsyTail);
        if (prefs.eyes) { set('ParamEyeOpen', k(range(TUNE.vDrowsyEyes, power))); raise('ParamBlush', k(range(TUNE.lkBlush, power))); }
        break;
      }
      if (v === 'bright') {
        // ears up, eyes open and bright, a quicker tail, an ear perk now and then
        if (prefs.ears) {
          set('ParamEarL', k(TUNE.vBrightEars)); set('ParamEarR', k(TUNE.vBrightEars));
          if (now > nextEar) { earTwitch(0); nextEar = now + TUNE.vBrightPerkEvery * (0.7 + Math.random() * 0.8); }
        }
        tail(TUNE.vBrightTail);
        if (prefs.eyes) { raise('ParamEyesHappy', k(range(TUNE.lkHappy, power) * TUNE.vBrightHappy)); raise('ParamBlush', k(range(TUNE.lkBlush, power))); }
        break;
      }
      if (prefs.ears) { set('ParamEarL', k(TUNE.lkEars)); set('ParamEarR', k(TUNE.lkEars)); }
      tail(TUNE.lkTail);
      if (prefs.eyes) { raise('ParamEyesHappy', k(range(TUNE.lkHappy, power))); raise('ParamBlush', k(range(TUNE.lkBlush, power))); }
      break;
    case 'loves': {
      if (v === 'melt') {
        // she melts: eyes closed, ears gone soft, a slow, wide, contented wag
        if (prefs.ears) { set('ParamEarL', k(TUNE.vMeltEars)); set('ParamEarR', k(TUNE.vMeltEars)); }
        tail(TUNE.vMeltTail);
        if (prefs.eyes) { set('ParamEyeOpen', k(TUNE.vMeltEyes)); raise('ParamEyesHappy', k(1)); raise('ParamBlush', k(range(TUNE.lvBlush, power))); }
        break;
      }
      const sparkle = v === 'sparkle';
      if (prefs.ears) {
        if (sparkle) {
          // she can't hold still: ears bouncing
          const b = Math.sin(now / TUNE.vSparkleEarMs);
          set('ParamEarL', k(TUNE.vSparkleEars[0] + TUNE.vSparkleEars[1] * b), 200);
          set('ParamEarR', k(TUNE.vSparkleEars[0] + TUNE.vSparkleEars[1] * b), 200);
        } else { set('ParamEarL', k(TUNE.lvEars)); set('ParamEarR', k(TUNE.lvEars)); }
      }
      tail(TUNE.lvTail);
      if (prefs.eyes) {
        raise('ParamEyesHappy', k(range(TUNE.lvHappy, power)));
        raise('ParamBlush', k(range(TUNE.lvBlush, power)));
        // heart eyes now and then on a strong one, never all the time (sooner when she sparkles)
        if (power >= (sparkle ? TUNE.vSparkleHeartAt : TUNE.lvHeartAt) && now > nextHeart) {
          set('ParamHeart', 1, TUNE.lvHeartMs);
          set('ParamIrisZoom', 0.5, TUNE.lvHeartMs);
          nextHeart = now + TUNE.lvHeartMs + range(TUNE.lvHeartEvery, power) * (0.8 + Math.random() * 0.5) * (sparkle ? TUNE.vSparkleHeartEvery : 1);
        }
      }
      break;
    }
    case 'giggly':
      if (prefs.ears) {
        // squirm: bigger, slower flops, one ear then the other
        const sq = v === 'squirm';
        const b = Math.sin(now / (sq ? TUNE.vSquirmEarMs : TUNE.ggEarMs));
        const e = sq ? TUNE.vSquirmEars : TUNE.ggEars;
        set('ParamEarL', k(e[0] + e[1] * b), 200);
        set('ParamEarR', k(e[0] - e[1] * b), 200);
      }
      tail(TUNE.ggTail);
      if (prefs.eyes) {
        raise('ParamEyesHappy', k(TUNE.ggHappy)); raise('ParamBlush', k(TUNE.ggBlush));
        if (v === 'squirm') set('ParamEyeOpen', k(TUNE.vSquirmEyes));
      }
      break;
    case 'secret':
      if (prefs.eyes) {
        raise('ParamBlush', k(range(TUNE.scBlush, power)));
        // looking away... with a stolen glance back now and then
        // (pout: nose in the air, no looking back at all. slip: now and then the happy face
        // gets out before she catches it)
        const every = v === 'slip' ? TUNE.vSlipEvery : range(TUNE.scGlanceEvery, power);
        if (now > nextLook) { glanceUntil = v === 'pout' ? 0 : now + (v === 'slip' ? TUNE.vSlipMs : TUNE.scGlanceMs); nextLook = now + every * (0.8 + Math.random() * 0.5); }
        const back = now < glanceUntil;
        const look = back ? 0 : TUNE.scLookAway * lookSide;
        set('ParamEyeballLX', k(look));
        set('ParamEyeballRX', k(look));
        set('ParamEyeballLY', k(v === 'pout' ? TUNE.vPoutLookUp : -0.15));
        set('ParamEyeballRY', k(v === 'pout' ? TUNE.vPoutLookUp : -0.15));
        if (v === 'slip' && back) raise('ParamEyesHappy', k(TUNE.vSlipHappy));
      }
      if (prefs.ears && v === 'pout') { set('ParamEarL', k(TUNE.vPoutEars)); set('ParamEarR', k(TUNE.vPoutEars)); }
      else if (prefs.ears && now > nextEar) {
        earTwitch(power * 0.6);
        nextEar = now + range(TUNE.scEarEvery, power) * (0.7 + Math.random() * 0.6);
      }
      // the tail gives her away
      tail(TUNE.scTail);
      break;
    case 'comforted':
      if (v === 'nuzzle') {
        // eyes closed, ears all the way soft: she just lets herself be looked after
        if (prefs.ears) { set('ParamEarL', k(TUNE.vNuzzleEars)); set('ParamEarR', k(TUNE.vNuzzleEars)); }
        tail(TUNE.vNuzzleTail);
        if (prefs.eyes) { set('ParamEyeOpen', k(TUNE.vNuzzleEyes)); raise('ParamBlush', k(range(TUNE.cfBlush, power))); }
        break;
      }
      if (prefs.ears) { set('ParamEarL', k(TUNE.cfEars)); set('ParamEarR', k(TUNE.cfEars)); }
      tail(TUNE.cfTail);
      if (prefs.eyes) { raise('ParamEyesHappy', k(range(TUNE.cfHappy, power))); raise('ParamBlush', k(range(TUNE.cfBlush, power))); }
      break;
  }
}

// the ways show() knows for each feeling (a test keeps this equal to the composer's VARIANTS)
export const KNOWN_VARIANTS = {
  notready: ['shrink', 'freeze'], flustered: ['down', 'peek'], likes: ['drowsy', 'bright'], loves: ['melt', 'sparkle'],
  giggly: ['squirm'], secret: ['pout', 'slip'], comforted: ['nuzzle'],
};

// the instant a touch lands: one small thing to see right away, before any effect or word.
// her eyes dart to the hand, a blink, or the ear on that side flicks; never the same twice in
// a row. a touch out of nowhere makes her start. side: where the hand is (-1 left, 1 right)
let lastOnset = null;
export function onset(side = 0, style = null) {
  if (!prefs.on || !Live2D.hasModel()) return null;
  const s = Math.sign(side) || (Math.random() < 0.5 ? -1 : 1);
  if (style?.moment?.includes('surprise')) {
    if (prefs.eyes) { set('ParamEyeLShock', k(TUNE.onsetShock), TUNE.onsetShockMs); set('ParamEyeRShock', k(TUNE.onsetShock), TUNE.onsetShockMs); }
    if (prefs.ears) { set('ParamEarL', k(0.8), TUNE.onsetShockMs); set('ParamEarR', k(0.8), TUNE.onsetShockMs); }
    return (lastOnset = 'start');
  }
  // not ready has its own start
  if (style?.feeling === 'notready') return null;
  const pool = [prefs.eyes && 'glance', prefs.eyes && 'blink', prefs.ears && 'ear'].filter(x => x && x !== lastOnset);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (!pick) return null;
  if (pick === 'glance') { set('ParamEyeballLX', k(TUNE.onsetGlance * s), TUNE.onsetGlanceMs); set('ParamEyeballRX', k(TUNE.onsetGlance * s), TUNE.onsetGlanceMs); }
  else if (pick === 'blink') set('ParamEyeOpen', -1, TUNE.onsetBlinkMs);
  else {
    // the rig's L/R are hers, mirrored: his right is her left
    const e = s > 0 ? 'ParamEarL' : 'ParamEarR';
    set(e, k(-0.8), 100);
    setTimeout(() => set(e, k(0.4), 140), 100);
  }
  return (lastOnset = pick);
}

// she sees his hand coming (core/feel/approach.js decides which; desktop.js turns her eyes to
// the hand). type: notice / perk / leanin / flinch / blink / brace / guard. side: where the hand is
export function approach(type, power = 0.5, side = 0) {
  if (!prefs.on || !Live2D.hasModel()) return false;
  const s = Math.sign(side) || 1;
  const p = 0.6 + 0.4 * power;
  switch (type) {
    case 'notice':
      break; // her eyes only (desktop.js)
    case 'perk':
      if (prefs.ears) Live2D.playSequence([
        { dt_ms: 0, params: { ParamEarL: k(TUNE.apPerk), ParamEarR: k(TUNE.apPerk) } },
        { dt_ms: TUNE.apPerkMs, params: { ParamEarL: k(0.15), ParamEarR: k(0.15) } },
        { dt_ms: 500, params: { ParamEarL: 0, ParamEarR: 0 } },
      ]);
      break;
    case 'leanin':
      // toward his hand, a little, with soft eyes: go on then
      if (prefs.lean) {
        onAway(TUNE.apLeanMs + 200);
        Live2D.playSequence([
          { dt_ms: 0, params: { ParamBodyZ: k(TUNE.apLeanBody * s * p), ParamHeadZ: k(TUNE.apLeanHead * s * p) } },
          { dt_ms: TUNE.apLeanMs, params: { ParamBodyZ: 0, ParamHeadZ: 0 } },
        ]);
      }
      if (prefs.eyes) raise('ParamEyesHappy', k(TUNE.apLeanHappy * p), TUNE.apLeanMs);
      if (prefs.ears) { set('ParamEarL', k(0.3), TUNE.apLeanMs); set('ParamEarR', k(0.3), TUNE.apLeanMs); }
      tail(TUNE.lkTail, TUNE.apLeanMs);
      break;
    case 'flinch':
      // a small start away from the hand, gone in half a second (never a big recoil)
      if (prefs.eyes) { set('ParamEyeLShock', k(TUNE.apFlinchShock * p), 220); set('ParamEyeRShock', k(TUNE.apFlinchShock * p), 220); }
      if (prefs.ears) Live2D.playSequence([
        { dt_ms: 0, params: { ParamEarL: k(TUNE.apFlinchEars), ParamEarR: k(TUNE.apFlinchEars) } },
        { dt_ms: TUNE.apFlinchMs, params: { ParamEarL: 0, ParamEarR: 0 } },
      ]);
      if (prefs.lean) {
        onAway(TUNE.apFlinchMs + 200);
        Live2D.playSequence([
          { dt_ms: 0, params: { ParamBodyZ: k(-TUNE.apFlinchBody * s * p) } },
          { dt_ms: TUNE.apFlinchMs, params: { ParamBodyZ: 0 } },
        ]);
      }
      break;
    case 'blink':
      if (prefs.eyes) set('ParamEyeOpen', -1, 110);
      if (prefs.ears) setTimeout(() => earTwitch(0), 80);
      break;
    case 'brace':
      // ears half back, the tail held still: she lets it come, not sure yet
      if (prefs.ears) { set('ParamEarL', k(TUNE.apBraceEars), TUNE.apBraceMs); set('ParamEarR', k(TUNE.apBraceEars), TUNE.apBraceMs); }
      tail(TUNE.apBraceTail, TUNE.apBraceMs);
      break;
    case 'guard':
      // she's had enough of that for now: eyes and head turn from the hand, an ear flicks. playful
      onAway(TUNE.apGuardMs + 200);
      if (prefs.eyes) Live2D.playSequence([
        { dt_ms: 0, params: { ParamEyeballLX: k(-TUNE.apGuardEyes * s), ParamEyeballRX: k(-TUNE.apGuardEyes * s), ParamHeadX: k(-TUNE.apGuardTurn * s) } },
        { dt_ms: TUNE.apGuardMs, params: { ParamEyeballLX: 0, ParamEyeballRX: 0, ParamHeadX: 0 } },
      ]);
      if (prefs.ears) setTimeout(() => earTwitch(0), 150);
      break;
    default:
      return false;
  }
  return true;
}

// the touch is over: how she comes out of it. side: where his hand was,
// -1 left of her face, 1 right (0 unknown)
export function after(feeling, power, side = 0, style = null) {
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
      // she stays happy a little while (out of a melt her eyes open slowly)
      if (prefs.eyes) raise('ParamEyesHappy', k(0.6), 1500);
      if (prefs.eyes && style?.variant === 'melt') Live2D.playSequence([
        { dt_ms: 0, params: { ParamEyeOpen: k(TUNE.vMeltEyes * 0.6) } },
        { dt_ms: 1100, params: { ParamEyeOpen: 0 } },
      ]);
      tail({ amp: 1.2, period: 0.6, rest: 1 }, 2500);
      break;
    case 'giggly':
      tail(TUNE.ggTail, 900);
      break;
    case 'secret':
      // caught: one quick look back, then away again, blushing; the tail
      // still going
      if (prefs.eyes) {
        raise('ParamBlush', k(0.7), 2200);
        Live2D.playSequence([
          { dt_ms: 0, params: { ParamEyeballLX: 0, ParamEyeballRX: 0 } },
          { dt_ms: 500, params: { ParamEyeballLX: k(TUNE.scLookAway * lookSide), ParamEyeballRX: k(TUNE.scLookAway * lookSide) } },
          { dt_ms: 1500, params: { ParamEyeballLX: 0, ParamEyeballRX: 0 } },
        ]);
      }
      tail(TUNE.scTail, 2000);
      break;
    case 'comforted':
      if (prefs.eyes) raise('ParamEyesHappy', k(0.45), 2500);
      tail(TUNE.cfTail, 3000);
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
