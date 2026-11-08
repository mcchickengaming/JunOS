// her body on the desktop: the walk cycle, being carried, landing,
// watching the cursor, headpats and the little things she does while
// she stands around. desktop.js decides WHEN, this file is HOW.
//
// the rig is front-facing art only, there is no side view to switch
// to. the walk sells direction with what it has: the whole figure
// turns in 3D like a paper cutout (CSS on the canvas), body and head
// angle the same way, legs alternate, arms swing against them, hips
// roll, the body bobs twice per stride and the tail swings.
//
// every number that shapes a move is in TUNE, so a walk that looks
// off on the real rig is a one-line change.

import * as Actions from '../live2d/actions.js?v=99';
import * as Live2D from '../live2d/live2d.js?v=90';

export const TUNE = {
  turnDeg: 8,         // how far the figure turns toward where she walks
  turnMs: 320,        // how long the turn takes
  strideMs: 1100,     // one full stride, left step + right step
  leg: 0.35,          // ParamLegL/R swing
  arm: 0.2,           // ParamArmLRot/RRot swing
  bob: 0.15,          // ParamBodyY bounce (the hop itself is the window, desktop/main.js HOP_PX)
  roll: 0.05,         // ParamBodyZ hip roll
  bodyTurn: 0.3,      // ParamBodyX toward the walk
  headTurn: 0.45,     // ParamHeadX toward the walk
  tail: 0.7,          // ParamTailWiggle while walking
  kick: 0.18,         // legs kicking a little on their own while carried
  kickMs: 700,
  // carried: arms and legs are a pendulum. moving her swings them
  // the other way, they overshoot and settle when she stops
  swingGain: 0.0016,  // how much speed turns into swing
  swingSpring: 38,    // how fast they swing back (higher = snappier)
  swingDamp: 3.2,     // how quickly the swinging dies down (lower = swings longer)
  swingArm: 0.9,      // ParamArmLRot/RRot per unit of swing
  swingLeg: 0.6,      // ParamLegL/R per unit of swing
  liftGain: 0.0009,   // moving her up/down lifts/drops the arms
  lookEyes: 0.9,      // how far her eyes turn toward what she's looking at
  lookHead: 0.45,     // and her head
  // attention: she doesn't track every twitch of the mouse. she
  // NOTICES it now and then, looks for a few seconds, gets bored
  noticeNear: 220,        // px from her head that counts as "right next to me"
  noticeNearChance: 0.6,  // chance she looks when it's that close
  noticeBigMove: 300,     // px travelled in half a second that counts as "something happening"
  noticeBigChance: 0.3,   // chance she looks at that
  noticeEveryMs: 700,     // she rolls those chances at most this often
  attendMs: [1800, 5000], // how long she keeps looking once she noticed
  boredMs: [6000, 18000], // then ignores the cursor for this long
  saccadePx: 90,          // her eyes jump to the cursor only once it's this far from where she's looking
  fixateMs: 400,          // and not more often than this
  glanceAwayChance: 0.5,  // when she stops looking, chance she glances off at something of her own
};

let canvas = null;
let anchor = () => null;
let walkDir = 0;          // -1 left, 1 right, 0 standing
let carried = false;
let ramp = 0;             // 0..1, eases the cycle in and out
let phase = 0;
let turn = 0;             // current turn, degrees
let lastT = 0;
let look = null;          // { x, y, at } the cursor, last we heard
// what she's looking at: { x, y, until, why } in window px, or null
let gaze = null;
const att = { cursorUntil: 0, boredUntil: 0, lastRoll: 0, gazeAt: 0 };
const trail = [];
let pat = null;           // headpat in progress
let onPat = null;
let emote = () => {};
let mood = 'neutral';     // happy / neutral / upset / nervous / scared (core/mood-tier.js)
let part = 'day';         // morning / day / evening / night
let watch = 1;            // "Looks at your mouse": 0 never .. 1.6 often
let busyMove = 0;         // an idle move is playing until this time
let asleep = false;
let lastMoving = 'walk';  // what the ease-out is easing out of
// carried: the pendulum, and this pick-up's own arm pose so it isn't
// the same every time
const swing = { x: 0, v: 0, lift: 0, lv: 0 };
let carry = null;       // { lastX, lastY, lastT, vx, vy, base }

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function setHeld(param, value, ms = 300) {
  Live2D.setNow(param, value);
  Live2D.hold(param, ms);
}

export function init({ stageEl, faceAnchor, onHeadpat, onEmote }) {
  anchor = faceAnchor;
  onPat = onHeadpat;
  if (onEmote) emote = onEmote;
  // the rig's canvas, or the placeholder art when the game files aren't extracted
  const find = () => { canvas = stageEl.querySelector('canvas, img.l2d-placeholder'); };
  find();
  if (!canvas) new MutationObserver((_, obs) => { find(); if (canvas) obs.disconnect(); }).observe(stageEl, { childList: true });
  requestAnimationFrame(frame);
}

export function walking(dir) {
  const was = walkDir;
  walkDir = dir ? Math.sign(dir) : 0;
  if (walkDir) {
    Live2D.startLoop('ParamTailWiggle', TUNE.tail, TUNE.strideMs / 2);
  } else {
    Live2D.stopLoop('ParamTailWiggle');
    // stopping: her body carries on a little and sways back, the tail
    // and hair follow through (the rig's physics ride on BodyZ/X)
    if (was) {
      setTimeout(() => Live2D.playSequence([
        { dt_ms: 0, params: { ParamBodyZ: 0.25 * was, ParamBodyX: 0.15 * was } },
        { dt_ms: 220, params: { ParamBodyZ: -0.12 * was, ParamBodyX: -0.05 * was } },
        { dt_ms: 260, params: { ParamBodyZ: 0, ParamBodyX: 0 } },
      ]), 260);
      Live2D.startLoop('ParamTailWiggle', 0.6, 500);
      setTimeout(() => { if (!walkDir && !carried) Live2D.stopLoop('ParamTailWiggle'); }, 1100);
    }
  }
}

export function setCarried(on) {
  if (on === carried) return;
  carried = on;
  if (on) {
    walking(0);
    const rnd = (a, b) => a + Math.random() * (b - a);
    carry = { lastX: null, lastY: null, lastT: 0, vx: 0, vy: 0, base: {
      upL: rnd(0.05, 0.4), upR: rnd(0.05, 0.4), rotL: rnd(-0.25, 0.25), rotR: rnd(-0.25, 0.25),
      kickSpeed: rnd(0.7, 1.3),
    } };
    swing.x = swing.v = swing.lift = swing.lv = 0;
    for (const a of Actions.parseActions('[A:emote|surprised]')) Actions.applyAction(a);
    emote('bang');
    Live2D.startLoop('ParamTailWiggle', 1, 380);
  } else {
    Live2D.stopLoop('ParamTailWiggle');
  }
}

// the pointer while she's being carried, in screen px. her window
// moves with it, so screen coordinates are what tell how fast
export function carryMove(sx, sy) {
  if (!carry) return;
  const now = performance.now();
  if (carry.lastX != null) {
    const dt = Math.max(8, now - carry.lastT) / 1000;
    // smoothed, one jittery event shouldn't fling her arms
    carry.vx = carry.vx * 0.6 + ((sx - carry.lastX) / dt) * 0.4;
    carry.vy = carry.vy * 0.6 + ((sy - carry.lastY) / dt) * 0.4;
  }
  carry.lastX = sx;
  carry.lastY = sy;
  carry.lastT = now;
}

// thrown or falling (desktop/main.js): the window's speed in px/s
export function flyVelocity(vx, vy) {
  if (!carry) return;
  carry.vx = vx;
  carry.vy = vy;
  carry.lastT = performance.now();
}

export function setMood(m, daypart) {
  mood = m || 'neutral';
  part = daypart || 'day';
  // a happy walk is quicker on its feet, an upset one drags
  const stride = { happy: 950, neutral: 1100, nervous: 1000, upset: 1350, scared: 1250 }[mood] || 1100;
  TUNE.strideMs = stride;
}

export function currentMood() { return mood; }

// in one of her spots (desktop/props.js): settled down, legs tucked,
// the spot's front hides the rest
let sitting = null;
export function sit(kind) { sitting = kind || null; }
export function sittingIn() { return sitting; }

// the ball: a little run-up kick
export function kick() {
  busyMove = performance.now() + 1200;
  act('[A:emote|excited]');
  Live2D.playSequence([
    { dt_ms: 0, params: { ParamLegR: -0.5, ParamBodyZ: -0.15, ParamArmLRot: 0.3 } },
    { dt_ms: 180, params: { ParamLegR: 0.8, ParamBodyZ: 0.2, ParamArmLRot: -0.3 } },
    { dt_ms: 300, params: { ParamLegR: 0, ParamBodyZ: 0, ParamArmLRot: 0 } },
  ]);
}

// landed half off the screen: she leans back in to look at where she is
export function peek(edge) {
  const s = -Math.sign(edge);
  busyMove = performance.now() + 1800;
  Live2D.playSequence([
    { dt_ms: 0, params: { ParamHeadX: 0.8 * s, ParamBodyX: 0.35 * s, ParamHeadZ: 0.25 * s, ParamEyeballLX: s, ParamEyeballRX: s } },
    { dt_ms: 1500, params: { ParamHeadX: 0, ParamBodyX: 0, ParamHeadZ: 0, ParamEyeballLX: 0, ParamEyeballRX: 0 } },
  ]);
}

export function setWatch(factor) { watch = Math.max(0, Number(factor) || 0); }

// feet hit the taskbar: a squash, a little bounce, ears shake it off
export function landed() {
  setCarried(false);
  Live2D.playSequence([
    { dt_ms: 0, params: { ParamBodyY: -0.8, ParamEyeOpen: -0.6 } },
    { dt_ms: 160, params: { ParamBodyY: 0.25, ParamEyeOpen: 0 } },
    { dt_ms: 200, params: { ParamBodyY: 0 } },
  ]);
  for (const a of Actions.parseActions('[A:ear_wiggle]')) Actions.applyAction(a);
}

// the cursor, anywhere on the screen, in this window's coordinates
export function cursor(x, y) {
  if (look && Math.abs(look.x - x) < 2 && Math.abs(look.y - y) < 2) return;
  const now = performance.now();
  look = { x, y, at: now };
  trail.push({ x, y, t: now });
  while (trail.length && now - trail[0].t > 500) trail.shift();
  if (asleep || carried || walkDir) return;
  if (now < att.cursorUntil) {
    // already watching it: her eyes jump to it in steps, not glued on
    if (gaze && Math.hypot(x - gaze.x, y - gaze.y) > TUNE.saccadePx && now - att.gazeAt > TUNE.fixateMs) {
      gaze = { x, y, until: att.cursorUntil, why: 'cursor' };
      att.gazeAt = now;
    }
    return;
  }
  if (now < att.boredUntil || now - att.lastRoll < TUNE.noticeEveryMs) return;
  att.lastRoll = now;
  const a = anchor();
  if (!a) return;
  let travel = 0;
  for (let i = 1; i < trail.length; i++) travel += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
  const near = Math.hypot(x - a.x, y - a.y) < TUNE.noticeNear;
  const chance = watch * (near ? TUNE.noticeNearChance : (travel > TUNE.noticeBigMove ? TUNE.noticeBigChance : 0));
  if (Math.random() >= chance) return;
  att.cursorUntil = now + rand(TUNE.attendMs);
  gaze = { x, y, until: att.cursorUntil, why: 'cursor' };
  att.gazeAt = now;
}

const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);

// something else wants her eyes for a moment (later: what's on the
// screen). window px, like the cursor
export function lookAtPoint(x, y, ms = 2000) {
  gaze = { x, y, until: performance.now() + ms, why: 'point' };
}

function loseInterest(now) {
  att.cursorUntil = 0;
  att.boredUntil = now + rand(TUNE.boredMs);
  gaze = null;
  if (Math.random() < TUNE.glanceAwayChance) {
    // off at something of her own, somewhere across the screen
    const a = anchor();
    const w = window.screen?.availWidth || 1600, h = window.screen?.availHeight || 900;
    if (a) gaze = { x: a.x + (Math.random() - 0.5) * w, y: a.y - Math.random() * h * 0.5, until: now + rand([900, 2200]), why: 'own' };
  }
}
export function setAsleep(on) { asleep = !!on; }
export function cursorMovedWithin(ms) {
  return !!look && performance.now() - look.at < ms;
}

// ---------------------------------------------------------------
// headpats: rub the top of her head back and forth with the mouse


// hovering (no button): a rub back and forth. on her head it's a
// headpat, on an ear an ear rub, on her side (fast) a tickle.
// returns the kind of rub going on, or null
export function pointerMove(x, y) {
  if (carried) return null;
  const now = performance.now();
  const region = regionAt(x, y);
  const kind = region && ['head', 'ear', 'side'].includes(region.kind) ? region.kind : null;
  if (!kind || (pat && pat.kind !== kind)) {
    if (pat && now - pat.last > 500) endPat();
    if (!kind) return null;
  }
  if (!pat || pat.kind !== kind || now - pat.last > 600) {
    pat = { kind, started: 0, last: now, lastX: x, dir: 0, flips: [], travel: 0 };
    return null;
  }
  const dx = x - pat.lastX;
  pat.travel += Math.abs(dx);
  const dir = Math.sign(dx);
  if (dir && pat.dir && dir !== pat.dir) pat.flips.push(now);
  pat.flips = pat.flips.filter(t => now - t < 1200);
  if (dir) pat.dir = dir;
  pat.lastX = x;
  pat.last = now;
  // two turns back and forth is a rub, not a fly-by. a tickle wants
  // it quick: four turns inside a bit over a second
  const need = kind === 'side' ? 4 : 2;
  if (!pat.started && pat.flips.length >= need && pat.travel > 40) {
    pat.started = now;
    if (kind === 'head') {
      emote('heart');
      Actions.applyAction({ name: 'receive_headpat', kwargs: {} });
    } else if (kind === 'ear') {
      emote('heart');
    }
  }
  if (!pat.started) return null;
  if (kind === 'head') {
    const a = anchor();
    setHeld('ParamHeadpat', 1, 700);
    setHeld('ParamHeadpatY', clamp((x - a.x) / (a.headW * 0.5), -1, 1) * 0.35, 700);
    setHeld('ParamEyesHappy', 1, 900);
    setHeld('ParamBlush', 0.6, 1500);
    if (onPat) onPat(now - pat.started);
  } else if (kind === 'ear') {
    earRub();
  } else {
    tickle();
  }
  return kind;
}

function endPat() {
  pat = null;
}
// a rub counts as going on for a moment after the pointer last moved
const rubLive = () => !!(pat && pat.started && performance.now() - pat.last < 400);
export function patting() { return rubLive() && pat.kind === 'head'; }
export function rubbing() { return rubLive(); }

// ---------------------------------------------------------------
// touch: where on her the pointer is, and what each spot does.
//   click        a poke: head, cheek, nose, ear, shoulder, tail, hand
//   hold         hold her hand (on a hand), a hug (on her body)
//   rub          headpat (head), ear rub (ear), tickle (her side, fast)
//   drag         pick her up (desktop.js)
// on the real rig head, face and hands come from its own hit areas
// (same ones live2d/touch.js uses), the rest from her proportions.
// only these spots exist here, anything else on her is "body".

// every spot except the head is a circle placed relative to her face:
// dx/dy/r as fractions of her height from the face anchor (her width
// can include hair and tail, her height can't lie), the right-hand one
// of a pair (the left is its mirror). the owner drags them into place
// (desktop.js calibrate), saved in localStorage['desktop.touchSpots'].
// the head is a circle too (high on her head, clear of the ears, so
// headpat and ear rub don't fight), adjustable like the rest.
export const SPOT_DEFAULTS = {
  // w: how much wider than tall (an oval); the head is wide so a rub fits
  head: { dx: 0, dy: -0.05, r: 0.035, w: 2.4, pair: false, label: 'Headpat' },
  // hold here for a hug: her torso only, not her head, hands or legs
  hug: { dx: 0, dy: 0.3, r: 0.07, w: 1.15, pair: false, label: 'Hug' },
  nose: { dx: 0, dy: 0.085, r: 0.016, pair: false, label: 'Nose' },
  cheek: { dx: 0.05, dy: 0.1, r: 0.026, pair: true, label: 'Cheek' },
  ear: { dx: 0.115, dy: 0.05, r: 0.03, pair: true, label: 'Ear' },
  shoulder: { dx: 0.12, dy: 0.22, r: 0.035, pair: true, label: 'Shoulder' },
  side: { dx: 0.1, dy: 0.33, r: 0.035, pair: true, label: 'Side (tickle)' },
  hand: { dx: 0.135, dy: 0.47, r: 0.035, pair: true, label: 'Hand' },
  tail: { dx: 0.17, dy: 0.5, r: 0.04, pair: false, label: 'Tail' },
};
// v2: units changed from head widths to her height, older saves don't fit
const SPOTS_KEY = 'desktop.touchSpots.v2';
let spotCfg = null;
export function touchSpots() {
  if (!spotCfg) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SPOTS_KEY) || '{}') || {}; } catch (e) {}
    spotCfg = {};
    for (const [k, d] of Object.entries(SPOT_DEFAULTS)) {
      const o = saved[k] || {};
      spotCfg[k] = { ...d, dx: Number.isFinite(o.dx) ? o.dx : d.dx, dy: Number.isFinite(o.dy) ? o.dy : d.dy, r: Number.isFinite(o.r) ? o.r : d.r,
        w: Number.isFinite(o.w) ? o.w : (d.w || 1) };
      // a pair can be unlinked: then the left one has its own place
      // (dx signed, as it is on screen) instead of mirroring the right.
      // nothing here assumes she's symmetrical
      const l = o.left;
      if (d.pair && l && [l.dx, l.dy, l.r].every(Number.isFinite)) spotCfg[k].left = { dx: l.dx, dy: l.dy, r: l.r, w: Number.isFinite(l.w) ? l.w : (d.w || 1) };
    }
  }
  return spotCfg;
}
export function saveTouchSpots(next) {
  const out = {};
  const round = (v) => ({ dx: +v.dx.toFixed(3), dy: +v.dy.toFixed(3), r: +v.r.toFixed(3), w: +(v.w || 1).toFixed(2) });
  for (const [k, v] of Object.entries(next || {})) {
    out[k] = round(v);
    if (v.left) out[k].left = round(v.left);
  }
  try {
    if (next) localStorage.setItem(SPOTS_KEY, JSON.stringify(out)); else localStorage.removeItem(SPOTS_KEY);
  } catch (e) {}
  spotCfg = null;
}
window.addEventListener('storage', (e) => { if (e.key === SPOTS_KEY) spotCfg = null; });

// a spot's circle in window px. side: 1 right (her left as we look), -1 the other
export function spotCircle(kind, side = 1) {
  const a = anchor();
  const c = touchSpots()[kind];
  if (!a || !c) return null;
  const u = a.modelH;
  // r is the height radius, rx the width radius (w times wider for an oval)
  if (c.pair && side < 0 && c.left) {
    const r = Math.max(8, c.left.r * u);
    return { x: a.x + c.left.dx * u, y: a.y + c.left.dy * u, r, rx: r * (c.left.w || 1) };
  }
  const r = Math.max(8, c.r * u);
  return { x: a.x + (c.pair ? side : 1) * c.dx * u, y: a.y + c.dy * u, r, rx: r * (c.w || 1) };
}

export function regionAt(x, y) {
  const a = anchor();
  if (!a) return null;
  // the circles first, closest center wins where two overlap
  let best = null;
  for (const [kind, c] of Object.entries(touchSpots())) {
    for (const side of c.pair ? [1, -1] : [1]) {
      const p = spotCircle(kind, side);
      const d = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.r);
      if (d <= 1 && (!best || d < best.d)) best = { d, kind, side };
    }
  }
  if (best) {
    const side = best.kind === 'hand' ? (best.side < 0 ? 'left' : 'right') : best.kind === 'head' ? 0 : best.side;
    return { kind: best.kind, side };
  }
  const dx = x - a.x;
  if (Live2D.isOverModel(x, y)) return { kind: 'body', side: Math.sign(dx) || 1 };
  return null;
}


// what the pointer looks like over each spot, so he can SEE what he
// can do. an emoji drawn into an svg cursor, hotspot in the middle
const CURSOR_ICON = { head: '✋', ear: '✋', cheek: '👆', nose: '👆', shoulder: '👆', hand: '🤝', side: '🤏', tail: '👆', hug: '🤗', body: '💬' };
const cursorCache = {};
// a few more for what's going on, not where: holding hands, a hug
CURSOR_ICON.holding = '🤝';
CURSOR_ICON.hugging = '🤗';
export function cursorFor(kind) {
  if (!kind || !CURSOR_ICON[kind]) return '';
  if (!cursorCache[kind]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="16" y="24" font-size="22" text-anchor="middle">${CURSOR_ICON[kind]}</text></svg>`;
    cursorCache[kind] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, pointer`;
  }
  return cursorCache[kind];
}

// a soft glow on the spot under the pointer: center + size, window px
export function regionGlow(region) {
  const a = anchor();
  if (!a || !region || region.kind === 'body') return null;
  const side = region.side === 'left' ? -1 : region.side === 'right' ? 1 : (region.side || 1);
  return spotCircle(region.kind, side);
}

let pokes = [];
let tickles = 0;
let lastWave = 0;

// a click on one spot. true when she's had enough poking for now
export function poke(region) {
  const now = performance.now();
  pokes = pokes.filter(t => now - t < 5000);
  pokes.push(now);
  busyMove = now + 1500;
  if (pokes.length >= 5) {
    pokes = [];
    act('[A:emote|angry] [A:look_at|user]');
    setHeld('ParamBlush', 0.5, 2500);
    emote('anger');
    return true;
  }
  const s = region.side === 'left' ? -1 : region.side === 'right' ? 1 : (region.side || 1);
  switch (region.kind) {
    case 'head':
      act('[A:emote|happy] [A:ear_wiggle]');
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamHeadY: -0.35, ParamEyeOpen: -0.7 } },
        { dt_ms: 260, params: { ParamHeadY: 0, ParamEyeOpen: 0 } },
      ]);
      emote('note');
      break;
    case 'cheek':
      act('[A:emote|pout] [A:look_at|user]');
      setHeld('ParamBlush', 0.8, 2000);
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamHeadZ: -0.25 * s, ParamHeadX: -0.2 * s } },
        { dt_ms: 900, params: { ParamHeadZ: 0, ParamHeadX: 0 } },
      ]);
      emote('bang');
      break;
    case 'nose':
      // boop: eyes cross, a squint, then a giggle
      act('[A:shocked]');
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamEyeballLX: 0.6, ParamEyeballRX: -0.6, ParamHeadY: -0.2 } },
        { dt_ms: 450, params: { ParamEyeballLX: 0, ParamEyeballRX: 0, ParamHeadY: 0, ParamEyesHappy: 1 } },
        { dt_ms: 900, params: { ParamEyesHappy: 0 } },
      ]);
      emote('sparkle');
      break;
    case 'ear':
      Live2D.playSequence([
        { dt_ms: 0, params: { [s < 0 ? 'ParamEarL' : 'ParamEarR']: -1, ParamHeadZ: 0.15 * s } },
        { dt_ms: 220, params: { [s < 0 ? 'ParamEarL' : 'ParamEarR']: 0.6 } },
        { dt_ms: 200, params: { [s < 0 ? 'ParamEarL' : 'ParamEarR']: 0, ParamHeadZ: 0 } },
      ]);
      emote('question');
      break;
    case 'tail':
      act('[A:emote|surprised]');
      Live2D.playSequence([
        { dt_ms: 0, params: { Param_Angle_Rotation_1_TailMain: 25, ParamBodyY: 0.4, ParamHeadX: 0.6 } },
        { dt_ms: 300, params: { Param_Angle_Rotation_1_TailMain: -15, ParamBodyY: 0 } },
        { dt_ms: 400, params: { Param_Angle_Rotation_1_TailMain: 0, ParamHeadX: 0 } },
      ]);
      Live2D.startLoop('ParamTailWiggle', 1, 300);
      setTimeout(() => { if (!walkDir && !carried) Live2D.stopLoop('ParamTailWiggle'); }, 1500);
      emote('bang');
      break;
    case 'hand':
      // a quick squeeze
      handhold(region.side, true);
      setTimeout(() => handhold(region.side, false), 700);
      emote('heart');
      break;
    case 'side':
      tickle();
      break;
    default:
      // shoulder: she turns to see who it is
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamHeadX: 0.7 * s, ParamBodyX: 0.25 * s, ParamEyeballLX: s, ParamEyeballRX: s } },
        { dt_ms: 1400, params: { ParamHeadX: 0, ParamBodyX: 0, ParamEyeballLX: 0, ParamEyeballRX: 0 } },
      ]);
      emote('question');
  }
  return false;
}

function act(tags) { for (const a of Actions.parseActions(tags)) Actions.applyAction(a); }

// hold her hand: the rig's own hand-holding, as long as he holds on
let holdingHand = null;
export function handhold(side, on) {
  const s = side === 'left' ? 'left' : 'right';
  Actions.applyAction({ name: 'handhold', kwargs: { side: s, enable: on ? 'true' : 'false' } });
  if (on) {
    holdingHand = s;
    setHeld('ParamBlush', 0.5, 2500);
    setHeld('ParamEyesHappy', 0.8, 2500);
  } else if (holdingHand === s) {
    holdingHand = null;
  }
}

// a hug: she closes her eyes, blushes, leans into it. desktop.js
// keeps calling hugTick() while the button is held
let hugging = false;
export function hug(on) {
  hugging = on;
  if (on) {
    act('[A:emote|happy]');
    emote('heart');
  } else {
    Live2D.playSequence([
      { dt_ms: 0, params: { ParamBodyY: 0.3, ParamEyesHappy: 1 } },
      { dt_ms: 500, params: { ParamBodyY: 0, ParamEyesHappy: 0.5 } },
      { dt_ms: 900, params: { ParamEyesHappy: 0 } },
    ]);
  }
}
export function hugTick() {
  if (!hugging) return;
  setHeld('ParamEyeOpen', -0.9, 600);
  setHeld('ParamEyesHappy', 1, 600);
  setHeld('ParamBlush', 0.9, 900);
  setHeld('ParamHeart', 1, 600);
  setHeld('ParamHeadZ', 0.18, 600);
  setHeld('ParamBodyY', -0.25, 600);
}

// tickled: she squirms and laughs. three in a row and she's had enough
let tickleUntil = 0;
export function tickle() {
  const now = performance.now();
  if (now < tickleUntil) return;
  tickleUntil = now + 1200;
  tickles = now - lastTickle < 8000 ? tickles + 1 : 1;
  lastTickle = now;
  busyMove = now + 1500;
  if (tickles >= 4) {
    tickles = 0;
    act('[A:emote|pout]');
    emote('anger');
    return;
  }
  act('[A:emote|laughing]');
  Live2D.startLoop('ParamBodyZ', 0.3, 180);
  Live2D.startLoop('ParamHeadZ', 0.15, 230);
  setTimeout(() => { Live2D.stopLoop('ParamBodyZ'); Live2D.stopLoop('ParamHeadZ'); }, 1100);
  emote('laugh');
}
let lastTickle = 0;

// rubbing her ear: ears flutter, eyes go soft
export function earRub() {
  const now = performance.now();
  busyMove = now + 800;
  setHeld('ParamEarsWiggle', 1, 500);
  setHeld('ParamEyesHappy', 1, 900);
  setHeld('ParamEyeOpen', -0.5, 700);
  setHeld('ParamBlush', 0.4, 1200);
}

// she waved; if he waves back (wiggles the pointer near her) she lights up
export function waved() { lastWave = performance.now(); }
export function waveBackWindow() { return performance.now() - lastWave < 5000; }
export function wavedBack() {
  lastWave = 0;
  act('[A:heart_eyes] [A:emote|excited]');
  emote('hearts');
}

// ---------------------------------------------------------------
// the things she does while standing around

const MOVES = {
  lookAround: [
    { dt_ms: 0, params: { ParamHeadX: -0.6, ParamEyeballLX: -0.9, ParamEyeballRX: -0.9, ParamBodyX: -0.2 } },
    { dt_ms: 1100, params: { ParamHeadX: 0.6, ParamEyeballLX: 0.9, ParamEyeballRX: 0.9, ParamBodyX: 0.2 } },
    { dt_ms: 1300, params: { ParamHeadX: 0, ParamEyeballLX: 0, ParamEyeballRX: 0, ParamBodyX: 0 } },
  ],
  stretch: [
    { dt_ms: 0, params: { ParamArmLUp: 0.9, ParamArmRUp: 0.9, ParamBodyY: 0.5, ParamEyeOpen: -1, ParamMouthOpen: 0.5, ParamHeadY: 0.3 } },
    { dt_ms: 1700, params: { ParamArmLUp: 0, ParamArmRUp: 0, ParamBodyY: -0.1, ParamEyeOpen: 0, ParamMouthOpen: 0, ParamHeadY: 0 } },
    { dt_ms: 500, params: { ParamBodyY: 0 } },
  ],
  yawn: [
    { dt_ms: 0, params: { ParamMouthOpen: 1.4, ParamEyeOpen: -0.85, ParamHeadY: 0.35, ParamEarL: -0.5, ParamEarR: -0.5 } },
    { dt_ms: 1500, params: { ParamMouthOpen: 0, ParamEyeOpen: -0.2, ParamHeadY: 0, ParamEarL: 0, ParamEarR: 0 } },
    { dt_ms: 600, params: { ParamEyeOpen: 0 } },
  ],
  rest: [
    { dt_ms: 0, params: { ParamBodyY: -0.9, ParamLegL: 0.35, ParamLegR: 0.35, ParamHeadY: -0.15 } },
    { dt_ms: 7000, params: { ParamBodyY: 0, ParamLegL: 0, ParamLegR: 0, ParamHeadY: 0 } },
  ],
  lookAway: [
    { dt_ms: 0, params: { ParamHeadX: -0.7, ParamHeadY: -0.25, ParamEyeballLX: -1, ParamEyeballRX: -1, ParamEyeballLY: -0.4, ParamEyeballRY: -0.4, ParamBodyX: -0.25 } },
    { dt_ms: 2600, params: { ParamHeadX: 0, ParamHeadY: 0, ParamEyeballLX: 0, ParamEyeballRX: 0, ParamEyeballLY: 0, ParamEyeballRY: 0, ParamBodyX: 0 } },
  ],
  sway: [
    { dt_ms: 0, params: { ParamBodyZ: 0.3, ParamHeadZ: -0.2, ParamLegL: 0.3 } },
    { dt_ms: 900, params: { ParamBodyZ: -0.3, ParamHeadZ: 0.2, ParamLegL: 0, ParamLegR: 0.3 } },
    { dt_ms: 900, params: { ParamBodyZ: 0, ParamHeadZ: 0, ParamLegR: 0 } },
  ],
};
const MOVE_MS = { lookAround: 2600, stretch: 2400, yawn: 2300, rest: 7500, sway: 2000, tail: 2000, wave: 1200, ears: 900, lookAway: 2900 };
// the thought icon that goes with a move, if any
const MOVE_EMOTE = { lookAround: 'question', yawn: 'dots', rest: 'dots', sway: 'note', wave: 'heart', lookAway: 'dots' };

export function idleMove() {
  if (asleep || walkDir || carried || patting() || performance.now() < busyMove) return null;
  // what she feels like doing depends on her mood and the hour
  const pool = ['lookAround', 'lookAround', 'stretch', 'yawn', 'rest', 'sway', 'tail', 'ears'];
  const friendly = mood === 'happy' || mood === 'neutral';
  if (friendly && cursorMovedWithin(4000)) pool.push('wave', 'wave');
  if (mood === 'happy') pool.push('sway', 'sway', 'tail', 'tail', 'wave');
  if (mood === 'upset') pool.push('lookAway', 'lookAway', 'lookAway', 'rest');
  if (mood === 'nervous' || mood === 'scared') pool.push('lookAround', 'lookAround', 'ears', 'lookAway');
  if (part === 'night') pool.push('yawn', 'yawn', 'yawn', 'rest', 'rest');
  if (part === 'morning') pool.push('stretch', 'stretch');
  const kind = pool[Math.floor(Math.random() * pool.length)];
  play(kind);
  return kind;
}

export function play(kind) {
  busyMove = performance.now() + (MOVE_MS[kind] || 1500);
  if (MOVE_EMOTE[kind] && Math.random() < 0.6) emote(MOVE_EMOTE[kind]);
  if (MOVES[kind]) Live2D.playSequence(MOVES[kind]);
  else if (kind === 'wave') { for (const a of Actions.parseActions('[A:wave] [A:emote|happy]')) Actions.applyAction(a); waved(); }
  else if (kind === 'tail') { Live2D.startLoop('ParamTailWiggle', 1, 600); setTimeout(() => { if (!walkDir && !carried) Live2D.stopLoop('ParamTailWiggle'); }, 1800); }
  else if (kind === 'ears') { for (const a of Actions.parseActions('[A:ear_wiggle]')) Actions.applyAction(a); }
}

// ---------------------------------------------------------------
// the frame loop

function frame(t) {
  requestAnimationFrame(frame);
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  const moving = !!walkDir || carried;
  if (moving) lastMoving = carried ? 'carry' : 'walk';

  ramp = clamp(ramp + (moving ? dt / 0.3 : -dt / 0.25), 0, 1);

  // the paper-cutout turn toward where she's going
  const want = walkDir * TUNE.turnDeg;
  const step = (TUNE.turnDeg / (TUNE.turnMs / 1000)) * dt;
  turn = Math.abs(want - turn) <= step ? want : turn + Math.sign(want - turn) * step;
  if (canvas) {
    canvas.style.transform = turn ? `perspective(1100px) rotateY(${turn.toFixed(2)}deg)` : '';
    canvas.style.transformOrigin = '50% 60%';
  }

  if (ramp > 0) {
    const r = ramp;
    if (carried && carry) {
      // no new pointer event for a bit means the hand stopped
      if (performance.now() - carry.lastT > 60) { carry.vx *= 0.7; carry.vy *= 0.7; }
      // the pendulum: speed pushes the limbs back, a spring pulls them
      // home, they overshoot and swing until the damping wins
      const push = clamp(-carry.vx * TUNE.swingGain, -1.2, 1.2);
      swing.v += (TUNE.swingSpring * (push - swing.x) - TUNE.swingDamp * swing.v) * dt;
      swing.x = clamp(swing.x + swing.v * dt, -1.5, 1.5);
      // lifted fast the arms trail down, falling they float up
      const liftPush = clamp(carry.vy * TUNE.liftGain, -0.6, 0.6);
      swing.lv += (TUNE.swingSpring * (liftPush - swing.lift) - TUNE.swingDamp * swing.lv) * dt;
      swing.lift = clamp(swing.lift + swing.lv * dt, -0.8, 0.8);

      const b = carry.base;
      phase += (2 * Math.PI * dt * 1000 * b.kickSpeed) / TUNE.kickMs;
      const sw = swing.x;
      setHeld('ParamArmLRot', (b.rotL + sw * TUNE.swingArm) * r);
      setHeld('ParamArmRRot', (b.rotR + sw * TUNE.swingArm) * r);
      setHeld('ParamArmLUp', clamp(b.upL + swing.lift + 0.05 * Math.sin(phase * 0.6), 0, 1) * r);
      setHeld('ParamArmRUp', clamp(b.upR + swing.lift + 0.05 * Math.sin(phase * 0.6 + 1), 0, 1) * r);
      setHeld('ParamLegL', (sw * TUNE.swingLeg + TUNE.kick * Math.sin(phase)) * r);
      setHeld('ParamLegR', (sw * TUNE.swingLeg + TUNE.kick * Math.sin(phase + Math.PI * 0.7)) * r);
      setHeld('ParamBodyZ', sw * 0.25 * r);
      setHeld('ParamHeadZ', -sw * 0.15 * r);
    } else if (!carried && lastMoving === 'walk') {
      const d = walkDir || Math.sign(turn) || 1;
      phase += (2 * Math.PI * dt * 1000) / TUNE.strideMs;
      const s = Math.sin(phase);
      setHeld('ParamLegL', TUNE.leg * s * r);
      setHeld('ParamLegR', -TUNE.leg * s * r);
      setHeld('ParamArmLRot', TUNE.arm * s * r);
      setHeld('ParamArmRRot', TUNE.arm * s * r);
      // two bounces per stride, highest as each leg passes under her
      setHeld('ParamBodyY', TUNE.bob * (Math.abs(Math.cos(phase)) - 0.5) * r);
      setHeld('ParamBodyZ', TUNE.roll * s * r);
      setHeld('ParamHeadZ', -TUNE.roll * 0.5 * s * r);
      setHeld('ParamBodyX', TUNE.bodyTurn * d * r);
      setHeld('ParamHeadX', TUNE.headTurn * d * r);
      setHeld('ParamEyeballLX', 0.6 * d * r);
      setHeld('ParamEyeballRX', 0.6 * d * r);
      const ear = 0.2 * Math.abs(s) * r;
      setHeld('ParamEarL', ear);
      setHeld('ParamEarR', ear);
    }
    // eased out, the 300 ms holds lapse and idle takes everything back
    return;
  }

  // in a spot: keep her settled (the idle would straighten her up)
  if (sitting) {
    const deep = sitting === 'bed' || sitting === 'beanbag';
    setHeld('ParamBodyY', deep ? -1 : -0.7, 400);
    setHeld('ParamLegL', 0.35, 400);
    setHeld('ParamLegR', 0.35, 400);
  }

  // standing: whatever has her attention right now, if anything
  const now = performance.now();
  if (gaze && gaze.why === 'cursor' && now > att.cursorUntil) loseInterest(now);
  if (gaze && now > gaze.until) gaze = null;
  if (!asleep && gaze && !patting() && now > busyMove) {
    const a = anchor();
    if (!a) return;
    const dx = clamp((gaze.x - a.x) / Math.max(300, window.innerWidth * 1.2), -1, 1);
    const dy = clamp((a.y - gaze.y) / Math.max(300, window.innerHeight * 1.2), -1, 1);
    for (const p of ['ParamEyeballLX', 'ParamEyeballRX']) { Live2D.setTarget(p, dx * TUNE.lookEyes); Live2D.hold(p, 400); }
    for (const p of ['ParamEyeballLY', 'ParamEyeballRY']) { Live2D.setTarget(p, dy * TUNE.lookEyes * 0.8); Live2D.hold(p, 400); }
    Live2D.setTarget('ParamHeadX', dx * TUNE.lookHead); Live2D.hold('ParamHeadX', 400);
    Live2D.setTarget('ParamHeadY', dy * TUNE.lookHead * 0.7); Live2D.hold('ParamHeadY', 400);
  }
}
