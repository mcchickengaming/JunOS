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

import * as Actions from '../live2d/actions.js?v=104';
import * as Live2D from '../live2d/live2d.js?v=94';

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
  // hold-to-pat (press on her head and move the mouse): the hand follows
  // the mouse and her head goes with it. reach = how far (in head widths)
  // the mouse moves for the hand to reach the end of its range
  patReach: 0.55,
  patHandX: 1,        // ParamHeadpatX at the end of the range (the hand, sideways)
  patHandY: 0.6,      // ParamHeadpatY (the hand, up and down)
  patTilt: 0.5,       // ParamHeadZ: her head tilts with the hand
  patTurn: 0.25,      // ParamHeadX: and turns a little with it
  patBody: 0.09,      // ParamBodyZ: her body sways along (owner: 25% less than 0.12, Nov 8)
  // the hover headpat (rubbing over her head, no click): how far the hand
  // slides sideways, which is also what leans her (owner: half of 0.6, Nov 8)
  // a hover headpat keeps going this long when the mouse slips off her head
  // (onto an ear, her face, off her), so he has time to find the spot again
  // before it turns into an ear rub or she goes back to idle
  patGraceMs: 600,
  // thigh squish, wriggling free. a period is one full side-to-side
  // squirm in ms, [at the start, right before she's out]: smaller = faster.
  // stranger/familiar: squirms right away and is out after wriggleStrangerMs.
  // friend: holds still until wriggleFriendFrom, squirms, out at wriggleFriendMs
  wriggleStrangerMs: 1400,
  wriggleStrangerPeriod: [360, 170],
  wriggleFriendFrom: 3200,
  wriggleFriendMs: 6000,
  wriggleFriendPeriod: [620, 300],
  rubPatX: 0.45,      // (owner: 0.3 felt a little small, Nov 8; halfway back toward 0.6)
  rubPatSmoothMs: 0,  // extra easing on the hover hand. 0 = off: 140 lagged so far behind a quick rub
                      // that the hand looked like it went the opposite way (owner, Nov 8)
  patDip: 0.15,       // ParamHeadY: her head dips a little under the hand
  patEase: 0.35,      // 0..1 how quickly her head catches up with the hand (lower = softer, lazier)
  // the middle of her head: while the hand stays in this middle part of
  // its range (0..1) her head barely leans, so he can rub the top of her
  // head; past it she leans with the hand, all the way at the ends
  patCenter: 0.45,
  patCenterLean: 0.15, // how much she still leans inside the middle (0 = not at all)
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

// how close they are, for touches she isn't fond of yet: 1 = Stranger/
// Familiar, 2 = Friend, 3 = Close and up (desktop.js from the bond stage)
let close = 2;
export function setCloseness(c) { close = c; }
// keep her idle moves and cursor-watching out of the way for a while
// (her body showing a feeling, desktop/feelbody.js: leaning away)
export function busyFor(ms) { busyMove = Math.max(busyMove, performance.now() + ms); }

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
  let kind = region && ['head', 'ear', 'side', 'thigh', 'feet', 'tail'].includes(region.kind) ? region.kind : null;
  if (kind && !rubAllowed(kind)) kind = null;
  if (kind === 'head' && pat && pat.kind === 'head') pat.onAt = now;
  // slipped off her head mid-pat: for a moment it's still the headpat
  if (kind !== 'head' && pat && pat.kind === 'head' && pat.started && now - (pat.onAt || 0) < TUNE.patGraceMs) kind = 'head';
  // his hand on her tail: it stays put under it
  if (kind === 'tail') Live2D.holdTail(700);
  if (!kind || (pat && pat.kind !== kind)) {
    if (pat && now - pat.last > (pat.kind === 'head' ? Math.max(500, TUNE.patGraceMs) : 500)) endPat();
    if (!kind) return null;
  }
  // a short pause on her head carries on the same pat (no new back-and-forth needed)
  const pause = kind === 'head' ? patLinger() : 600;
  if (!pat || pat.kind !== kind || now - pat.last > pause) {
    pat = { kind, started: 0, last: now, onAt: now, lastX: x, dir: 0, flips: [], travel: 0 };
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
    } else if (kind === 'thigh') {
      emote('bang');
    } else if (kind === 'feet') {
      emote('note');
    } else if (kind === 'tail') {
      emote('heart');
    }
  }
  if (!pat.started) return null;
  // her feet: quick little back-and-forths are a tickle (a foot rub is
  // a press and hold, see desktop.js). it takes a few quick turns to switch over, and a calm
  // moment to switch back, so it doesn't flicker between the two
  if (kind === 'feet') {
    if (now < feetAway) { endPat(); return null; }
    // five turns inside 0.6 s (a jiggle) is a tickle; a normal rub is
    // a few hundred ms per stroke
    const quick = pat.flips.filter(t => now - t < 600).length;
    if (!pat.tickly && quick >= 5) { pat.tickly = true; pat.tickleAt = now; }
    else if (pat.tickly && quick <= 1) pat.tickly = false;
    if (pat.tickly) {
      feetTickle(now - pat.tickleAt);
      return now < feetAway ? null : 'feettickle';
    }
    // a slow hover does nothing here: a foot rub is press and hold
    // (desktop.js), easier than rubbing back and forth
    return null;
  }
  rubEffect(kind, now - pat.started, x);
  return kind === 'feet' && now < feetAway ? null : kind;
}

const hoverHand = { x: 0, t: 0 };
// how long the hover pat's hand stays on her head after the mouse stops
const patLinger = () => Math.max(700, TUNE.patGraceMs + 300);
// what a rub does to her, each moment it goes on. also used by a
// hand left in place (desktop.js "two hands"), which rubs by itself
export function rubEffect(kind, ms, x) {
  if (kind === 'head') {
    const a = anchor();
    if (!a) return;
    setHeld('ParamHeadpat', 1, patLinger());
    // the hand eases toward the mouse, so small twitches don't tug her head
    const want = clamp((x - a.x) / (a.headW * 0.5), -1, 1) * TUNE.rubPatX;
    const now = performance.now();
    const dt = hoverHand.t ? Math.min(200, now - hoverHand.t) : 0;
    hoverHand.t = now;
    hoverHand.x = TUNE.rubPatSmoothMs > 0
      ? hoverHand.x + (want - hoverHand.x) * (1 - Math.exp(-dt / TUNE.rubPatSmoothMs))
      : want;
    Live2D.setTarget('ParamHeadpatX', hoverHand.x);
    Live2D.hold('ParamHeadpatX', 700);
    setHeld('ParamEyesHappy', 1, 900);
    setHeld('ParamBlush', 0.6, 1500);
    if (onPat) onPat(ms);
  } else if (kind === 'ear') {
    earRub();
  } else if (kind === 'thigh') {
    thighRub(ms);
  } else if (kind === 'feet') {
    feetRub(ms);
  } else if (kind === 'feettickle') {
    feetTickle(ms);
  } else if (kind === 'tail') {
    Live2D.holdTail(700);
    tailRub(ms);
  } else {
    tickle();
  }
}

function endPat() {
  pat = null;
  hoverHand.x = 0;
  hoverHand.t = 0;
}
// a rub counts as going on for a moment after the pointer last moved
const rubLive = () => !!(pat && pat.started && performance.now() - pat.last < 400);
export function patting() { return !!hp || (rubLive() && pat.kind === 'head'); }

// ---------------------------------------------------------------
// hold-to-pat, like the game: press on her head, the petting hand
// comes down on it, and while the button stays down the hand follows
// the mouse left and right (and a bit up and down). her head tilts
// and turns with the hand, her body sways along, she melts the longer
// it goes. letting go lifts the hand and her head settles back.
// desktop.js decides when it starts and ends, this is how it looks.

let hp = null;            // hold-pat in progress
let patFollow = 1;        // "Headpat: her head follows your hand" (0 = only the hand moves)
export function setPatFollow(f) { patFollow = Math.max(0, Number(f) || 0); }

export function patHoldStart(x, y) {
  if (hp) patHoldEnd();
  const now = performance.now();
  hp = { x0: x, y0: y, ox: 0, oy: 0, hx: 0, hy: 0, started: now, lastMove: now, timer: null };
  Live2D.cancelPending('ParamHeadpat');
  Live2D.setTarget('ParamHeadpat', 1);
  Live2D.hold('ParamHeadpat', 600);
  Actions.applyAction({ name: 'receive_headpat', kwargs: {} });
  emote('heart');
  hp.timer = setInterval(patHoldTick, 60);
  patHoldTick();
}

export function patHoldMove(x, y) {
  if (!hp) return;
  const a = anchor();
  if (!a) return;
  const reach = Math.max(20, a.headW * TUNE.patReach);
  // the hand stops at the end of its range; the range slides along with
  // the mouse so turning back moves the hand again right away
  let ox = (x - hp.x0) / reach;
  if (ox > 1) { hp.x0 = x - reach; ox = 1; } else if (ox < -1) { hp.x0 = x + reach; ox = -1; }
  let oy = (hp.y0 - y) / reach;
  if (oy > 1) { hp.y0 = y + reach; oy = 1; } else if (oy < -1) { hp.y0 = y - reach; oy = -1; }
  hp.ox = ox;
  hp.oy = oy;
  hp.lastMove = performance.now();
}

// how far she leans for where the hand is: barely in the middle, then
// with the hand out to the full lean at the ends (no jump at the edge)
function patLean(h) {
  const c = clamp(TUNE.patCenter, 0, 0.95), k = clamp(TUNE.patCenterLean, 0, 1);
  const a = Math.abs(h);
  if (a <= c) return h * k;
  return Math.sign(h) * (c * k + ((a - c) / (1 - c)) * (1 - c * k));
}

function patHoldTick() {
  if (!hp) return;
  const now = performance.now();
  const ms = now - hp.started;
  // the hand goes where the mouse is; her head eases after it, so it
  // reads as being pushed gently, not glued on
  hp.hx += (hp.ox - hp.hx) * clamp(TUNE.patEase, 0.02, 1);
  hp.hy += (hp.oy - hp.hy) * clamp(TUNE.patEase, 0.02, 1);
  const f = patFollow;
  const lean = patLean(hp.hx);
  const set = (p, v, ms = 300) => { Live2D.setTarget(p, v); Live2D.hold(p, ms); };
  // keep the hand down every tick, whatever else touched the param
  set('ParamHeadpat', 1, 600);
  set('ParamHeadpatX', hp.ox * TUNE.patHandX);
  set('ParamHeadpatY', hp.oy * TUNE.patHandY);
  set('ParamHeadZ', lean * TUNE.patTilt * f);
  set('ParamHeadX', lean * TUNE.patTurn * f);
  set('ParamBodyZ', lean * TUNE.patBody * f);
  set('ParamHeadY', (-TUNE.patDip + hp.hy * TUNE.patDip) * f);
  // she looks up toward the hand a little, happy eyes, the blush builds
  for (const p of ['ParamEyeballLY', 'ParamEyeballRY']) set(p, 0.35);
  for (const p of ['ParamEyeballLX', 'ParamEyeballRX']) set(p, lean * 0.3);
  setHeld('ParamEyesHappy', 1, 400);
  setHeld('ParamBlush', Math.min(0.9, 0.35 + ms / 6000), 600);
  if (onPat) onPat(ms);
}

export function patHoldEnd() {
  if (!hp) return;
  clearInterval(hp.timer);
  const s = Math.sign(hp.hx) || 1;
  const big = Math.abs(patLean(hp.hx)) > 0.3;
  hp = null;
  // the hand lifts off. ParamHeadpat rests at -1 (at 0 it's half there)
  Live2D.cancelPending('ParamHeadpat');
  Live2D.setNow('ParamHeadpat', -1);
  for (const p of ['ParamHeadpatX', 'ParamHeadpatY', 'ParamHeadX', 'ParamHeadY', 'ParamBodyZ',
    'ParamEyeballLX', 'ParamEyeballRX', 'ParamEyeballLY', 'ParamEyeballRY']) Live2D.setTarget(p, 0);
  // her head settles back with a little follow-through
  Live2D.playSequence([
    { dt_ms: 0, params: { ParamHeadZ: big ? -0.08 * s : 0 } },
    { dt_ms: 260, params: { ParamHeadZ: 0 } },
  ]);
  setHeld('ParamEyesHappy', 0.7, 1200);
}
export function patHolding() { return !!hp; }
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
  // the owner's own placement on her real rig (Nov 8), so a fresh
  // install starts with spots that fit her.
  // w: how much wider than tall (an oval); the head is wide so a rub fits
  head: { dx: 0, dy: -0.011, r: 0.035, w: 2.4, pair: false, label: 'Headpat' },
  // hold here for a hug: her torso only, not her head, hands or legs
  hug: { dx: 0.004, dy: 0.365, r: 0.061, w: 1.15, pair: false, label: 'Hug' },
  nose: { dx: -0.002, dy: 0.163, r: 0.016, pair: false, label: 'Nose' },
  cheek: { dx: 0.066, dy: 0.138, r: 0.026, pair: true, label: 'Cheek' },
  ear: { dx: 0.054, dy: 0.055, r: 0.03, pair: true, label: 'Ear' },
  shoulder: { dx: 0.082, dy: 0.218, r: 0.026, pair: true, label: 'Shoulder' },
  side: { dx: 0.116, dy: 0.307, r: 0.03, pair: true, label: 'Side (tickle)' },
  hand: { dx: 0.118, dy: 0.464, r: 0.035, pair: true, label: 'Hand' },
  tail: { dx: 0.134, dy: 0.556, r: 0.04, pair: false, label: 'Tail' },
  thigh: { dx: 0.047, dy: 0.544, r: 0.035, w: 0.9, pair: true, label: 'Thigh' },
  feet: { dx: 0.05, dy: 0.82, r: 0.028, w: 1.3, pair: true, label: 'Foot' },
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
      // switched off in Adjust touch spots: that spot catches nothing
      if (o.off === true) spotCfg[k].off = true;
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
    if (v.off) out[k].off = true;
  }
  try {
    if (next) localStorage.setItem(SPOTS_KEY, JSON.stringify(out)); else localStorage.removeItem(SPOTS_KEY);
  } catch (e) {}
  spotCfg = null;
}
window.addEventListener('storage', (e) => { if (e.key === SPOTS_KEY) spotCfg = null; });

// a spot's circle in window px. side: 1 right (her left as we look), -1 the other
// her tail swings from one side of her to the other and stands up past
// her shoulders, so its spot is the tail itself (the rig's TailMain
// meshes), not a fixed circle. the circle is only the fallback when the
// rig has none
let tailIds = new Set();
let tailLooked = 0;
function tailMeshes() {
  // looked up once the model is in (a rig without a tail: tried again
  // now and then, not on every mouse move)
  if (!tailIds.size && Live2D.hasModel() && performance.now() - tailLooked > 3000) {
    tailLooked = performance.now();
    tailIds = new Set(Live2D.findDrawables(['tailmain'], ['hitarea']));
  }
  return tailIds;
}
export function tailFollows() { return tailMeshes().size > 0; }
function tailSpot() {
  const ids = tailMeshes();
  if (!ids.size) return null;
  const b = Live2D.drawablesSpot([...ids]);
  if (!b) return null;
  const w = b.right - b.left, h = b.bottom - b.top;
  // the glow and the adjusting circle: on the tail, about as wide as it is
  const r = Math.max(10, Math.min(w, h) / 2 + 4);
  return { x: b.x, y: b.y, r, rx: r };
}
// is the pointer on the tail? the visible tail under it (nothing drawn
// over it there), or close to it: pad px for the thin tip, more while
// he's already rubbing it, since it swishes under his hand
function onTail(x, y, pad) {
  const ids = tailMeshes();
  if (!ids.size) return false;
  if (Live2D.drawableAt(x, y, ids, 0)) {
    const top = Live2D.drawableAt(x, y, null, 0);
    return !top || ids.has(top);
  }
  return pad > 0 && !!Live2D.drawableAt(x, y, ids, pad);
}

export function spotCircle(kind, side = 1) {
  if (kind === 'tail') { const t = tailSpot(); if (t) return t; }
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

// the spot his hand is nearest to, and how far outside it (px; 0 = on it). core feel uses it to
// let her see the hand coming (desktop.js → core/feel/approach.js). null when there's no rig
export function nearestSpot(x, y) {
  const a = anchor();
  if (!a) return null;
  let best = null;
  for (const [kind, c] of Object.entries(touchSpots())) {
    if (c.off) continue;
    for (const side of c.pair ? [1, -1] : [1]) {
      const p = spotCircle(kind, side);
      if (!p) continue;
      const d = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.r);
      const dist = Math.max(0, d - 1) * Math.min(p.r, p.rx);
      if (!best || dist < best.dist) best = { kind, side, dist, x: p.x, y: p.y };
    }
  }
  return best && { ...best, unit: a.modelH, faceX: a.x };
}

// which rubs may happen: desktop.js asks the consent + ratings gate (js/core/gate.js), e.g. a
// thigh rub is flirty (owner, Nov 12: only the rub; the poke and the squish are everyday). a rub
// that may not happen is just the mouse passing over her
let rubAllowed = () => true;
export function setRubGate(fn) { rubAllowed = typeof fn === 'function' ? fn : () => true; }

export function regionAt(x, y) {
  const a = anchor();
  if (!a) return null;
  // the tail first, where you can see it: pointing at it means it
  const rubbingTail = pat && pat.kind === 'tail' && performance.now() - pat.last < 600;
  const following = tailFollows() && !touchSpots().tail?.off;
  if (following && onTail(x, y, 0)) return { kind: 'tail', side: 1 };
  // then the circles, closest center wins where two overlap
  let best = null;
  for (const [kind, c] of Object.entries(touchSpots())) {
    if (c.off || (kind === 'tail' && following)) continue;
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
  // just off the tail (its thin tip), or it swished away mid-rub
  if (following && onTail(x, y, rubbingTail ? 24 : 6)) return { kind: 'tail', side: 1 };
  const dx = x - a.x;
  if (Live2D.isOverModel(x, y)) return { kind: 'body', side: Math.sign(dx) || 1 };
  return null;
}


// what the pointer looks like over each spot, so he can SEE what he
// can do. an emoji drawn into an svg cursor, hotspot in the middle
const CURSOR_ICON = { head: '✋', ear: '✋', cheek: '👆', nose: '👆', shoulder: '👆', hand: '🤝', side: '🤏', tail: '✋', hug: '🤗', thigh: '👆', feet: '✋', body: '💬' };
CURSOR_ICON.tailgrab = '✊';
const cursorCache = {};
// a few more for what's going on, not where: holding hands, a hug
CURSOR_ICON.holding = '🤝';
CURSOR_ICON.hugging = '🤗';
CURSOR_ICON.squishing = '🤏';
CURSOR_ICON.feettickle = '🪶';
// the icons grow and shrink with her size. Windows only takes cursor
// pictures up to 128 px, so they stop well before that
let cursorPx = 32;
export function setCursorScale(k) {
  const px = Math.max(22, Math.min(96, Math.round(32 * (Number(k) || 1))));
  if (px === cursorPx) return;
  cursorPx = px;
  for (const k2 of Object.keys(cursorCache)) delete cursorCache[k2];
}
export function cursorFor(kind) {
  if (!kind || !CURSOR_ICON[kind]) return '';
  if (!cursorCache[kind]) {
    const n = cursorPx, h = Math.round(n / 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><text x="${h}" y="${Math.round(n * 0.75)}" font-size="${Math.round(n * 0.69)}" text-anchor="middle">${CURSOR_ICON[kind]}</text></svg>`;
    cursorCache[kind] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${h} ${h}, pointer`;
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
    case 'thigh':
      // a poke on the thigh: a jump, a look down at it, a pout
      act('[A:emote|surprised]');
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamBodyY: 0.35, ParamHeadY: -0.4, ParamEyeballLY: -0.8, ParamEyeballRY: -0.8 } },
        { dt_ms: 350, params: { ParamBodyY: 0 } },
        { dt_ms: 600, params: { ParamHeadY: 0, ParamEyeballLY: 0, ParamEyeballRY: 0 } },
      ]);
      setHeld('ParamBlush', 0.5, 1600);
      setTimeout(() => act('[A:emote|pout]'), 500);
      emote('bang');
      break;
    case 'feet':
      // ticklish feet: she pulls the foot back with a giggle. from a
      // stranger it's a startled flinch, no giggle
      act(close <= 1 ? '[A:emote|surprised]' : '[A:emote|laughing]');
      Live2D.playSequence([
        { dt_ms: 0, params: { [s < 0 ? 'ParamLegL' : 'ParamLegR']: -0.6, ParamBodyZ: 0.12 * s } },
        { dt_ms: 400, params: { [s < 0 ? 'ParamLegL' : 'ParamLegR']: 0, ParamBodyZ: 0 } },
      ]);
      emote('laugh');
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
  // side is his: 'left' is the hand on the left of the screen. the rig's
  // L and R are hers, and she faces him, so they're mirrored
  const s = side === 'left' ? 'right' : 'left';
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

// rubbing her thigh: she gets flustered, looks down and away, blushes,
// and after a while pushes the hand off with a pout
let thighWarned = 0;
export function thighRub(ms) {
  const now = performance.now();
  busyMove = now + 800;
  setHeld('ParamBlush', Math.min(1, 0.4 + ms / 3000), 1500);
  setHeld('ParamHeadY', -0.3, 600);
  setHeld('ParamHeadX', -0.35, 600);
  setHeld('ParamEyeballLX', -0.7, 600);
  setHeld('ParamEyeballRX', -0.7, 600);
  if (ms > 2500 && now - thighWarned > 6000) {
    thighWarned = now;
    act('[A:emote|pout]');
    emote('sweat');
  }
}

// squishing her thigh (a hold, like the hand and the hug). how she takes
// it depends on how close they are (close: 1 = Stranger/Familiar,
// 2 = Friend, 3 = Close and up): a stranger tenses and scoots away fast,
// a friend holds still, flustered; close, the blush builds the longer
// he holds on, her knees press together and she pouts like she means it
// (she doesn't). desktop.js keeps calling thighSquishTick() while held.
// true from the tick = she's had enough, let go
let squish = null;

// a wriggle: she squirms side to side, smoothly, every frame (the hold
// ticks are too slow for that). setWriggle changes the speed and size on
// the fly; the phase carries on, so speeding up never jumps
let wrig = null;
function setWriggle(periodMs, amp) {
  if (!wrig) {
    wrig = { phase: 0, last: performance.now(), periodMs, amp, raf: 0 };
    const step = (now) => {
      if (!wrig) return;
      // the squish ended some other way: never squirm on by herself
      if (!squish) { stopWriggle(); return; }
      wrig.phase += ((now - wrig.last) / wrig.periodMs) * Math.PI * 2;
      wrig.last = now;
      const w = Math.sin(wrig.phase), a = wrig.amp;
      setHeld('ParamBodyZ', a * w, 120);
      setHeld('ParamBodyX', a * 0.7 * Math.sin(wrig.phase - 0.6), 120);
      setHeld('ParamHeadZ', -a * 0.5 * w, 120);
      // the legs kick with it once she really means it
      if (a > 0.16) setHeld(w > 0 ? 'ParamLegL' : 'ParamLegR', -0.25 * Math.abs(w), 120);
      wrig.raf = requestAnimationFrame(step);
    };
    wrig.raf = requestAnimationFrame(step);
  }
  wrig.periodMs = Math.max(80, periodMs);
  wrig.amp = amp;
}
function stopWriggle() {
  if (!wrig) return;
  cancelAnimationFrame(wrig.raf);
  wrig = null;
}

export function thighSquish(on, side, close = 2) {
  if (on) {
    const s = side === 'left' ? -1 : 1;
    squish = { s, close, warned: false };
    busyMove = performance.now() + 1500;
    act(close <= 1 ? '[A:emote|surprised]' : '[A:emote|embarrassed]');
    Live2D.playSequence([
      { dt_ms: 0, params: { ParamBodyY: 0.35, ParamHeadY: -0.2 } },
      { dt_ms: 220, params: { ParamBodyY: 0.05 } },
    ]);
    emote(close <= 1 ? 'bang' : 'sweat');
  } else if (squish) {
    const s = squish.s;
    squish = null;
    stopWriggle();
    Live2D.playSequence([
      { dt_ms: 0, params: { [s < 0 ? 'ParamLegR' : 'ParamLegL']: -0.3, ParamBodyZ: -0.08 * s } },
      { dt_ms: 350, params: { ParamLegL: 0, ParamLegR: 0, ParamBodyZ: 0, ParamHeadY: 0 } },
    ]);
  }
}
export function thighSquishTick(ms) {
  if (!squish) return false;
  const { s, close } = squish;
  busyMove = performance.now() + 800;
  // the squished leg: hers is mirrored, his left is her right
  const leg = s < 0 ? 'ParamLegR' : 'ParamLegL';
  setHeld(leg, close <= 1 ? -0.5 : -0.25, 500);
  setHeld('ParamHeadY', -0.35, 500);
  setHeld('ParamHeadX', 0.3 * s, 500);
  setHeld('ParamEyeballLY', -0.6, 500);
  setHeld('ParamEyeballRY', -0.6, 500);
  if (close <= 1) {
    setHeld('ParamBlush', 0.5, 800);
    // she wriggles free quickly: side to side, faster and harder until she's out
    const t = Math.min(1, ms / TUNE.wriggleStrangerMs);
    setWriggle(TUNE.wriggleStrangerPeriod[0] + (TUNE.wriggleStrangerPeriod[1] - TUNE.wriggleStrangerPeriod[0]) * t, 0.2 + 0.12 * t);
    if (ms > TUNE.wriggleStrangerMs) { act('[A:emote|angry]'); emote('anger'); return true; }
    return false;
  }
  setHeld('ParamBlush', Math.min(1, (close >= 3 ? 0.55 : 0.45) + ms / 3500), 900);
  if (close >= 3) {
    // knees together, a little squirm now and then
    setHeld(s < 0 ? 'ParamLegL' : 'ParamLegR', -0.15, 500);
    if (Math.floor(ms / 2200) !== Math.floor((ms - 260) / 2200)) {
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamBodyZ: 0.1 * s } },
        { dt_ms: 300, params: { ParamBodyZ: 0 } },
      ]);
    }
  }
  if (!squish.warned && ms > (close >= 3 ? 3500 : 2400)) {
    squish.warned = true;
    act('[A:emote|pout]');
    emote(close >= 3 ? 'heart' : 'sweat');
  }
  // a friend holds still, then starts squirming, slow at first, quicker
  // as she gets ready to pull away
  if (close === 2 && ms > TUNE.wriggleFriendFrom) {
    const t = Math.min(1, (ms - TUNE.wriggleFriendFrom) / (TUNE.wriggleFriendMs - TUNE.wriggleFriendFrom));
    setWriggle(TUNE.wriggleFriendPeriod[0] + (TUNE.wriggleFriendPeriod[1] - TUNE.wriggleFriendPeriod[0]) * t, 0.08 + 0.12 * t);
  }
  // a friend has had enough after a while; close, she lets him
  if (close === 2 && ms > TUNE.wriggleFriendMs) { act('[A:emote|pout]'); return true; }
  return false;
}

// rubbing her tail: it sways happily under the hand, eyes soft, ears flick
export function tailRub(ms) {
  const now = performance.now();
  busyMove = now + 800;
  setHeld('ParamTailWiggle', 0.6 * Math.sin(now / 160), 300);
  setHeld('ParamEyesHappy', 1, 900);
  setHeld('ParamEyeOpen', -0.4, 700);
  setHeld('ParamBlush', Math.min(0.8, 0.3 + ms / 5000), 1200);
  if (Math.random() < 0.01) act('[A:ear_wiggle]');
}

// grabbing her tail and holding on: she stiffens, ears up, eyes wide,
// a blush; the tail tries to wriggle free now and then
let tailHeld = false;
export function tailGrab(on) {
  tailHeld = on;
  if (on) {
    Live2D.holdTail(600);
    act('[A:emote|surprised]');
    Live2D.playSequence([
      { dt_ms: 0, params: { ParamBodyY: 0.45, ParamEarL: 1, ParamEarR: 1 } },
      { dt_ms: 300, params: { ParamBodyY: 0.1 } },
    ]);
    emote('bang');
  } else {
    Live2D.playSequence([
      { dt_ms: 0, params: { Param_Angle_Rotation_1_TailMain: -20, ParamBodyY: 0 } },
      { dt_ms: 250, params: { Param_Angle_Rotation_1_TailMain: 10 } },
      { dt_ms: 250, params: { Param_Angle_Rotation_1_TailMain: 0, ParamEarL: 0, ParamEarR: 0 } },
    ]);
  }
}
export function tailGrabTick(ms) {
  if (!tailHeld) return;
  Live2D.holdTail(600);
  setHeld('Param_Angle_Rotation_1_TailMain', 18, 500);
  setHeld('ParamEarL', 0.8, 500);
  setHeld('ParamEarR', 0.8, 500);
  setHeld('ParamBlush', Math.min(1, 0.5 + ms / 4000), 800);
  setHeld('ParamIrisZoom', 0.4, 500);
  // every couple of seconds a wriggle
  if (Math.floor(ms / 1800) !== Math.floor((ms - 260) / 1800)) {
    Live2D.startLoop('ParamTailWiggle', 1, 160);
    setTimeout(() => { if (!walkDir && !carried) Live2D.stopLoop('ParamTailWiggle'); }, 500);
  }
}

// combos: two or three touches in a row that mean more together
// (desktop.js COMBOS decides when). each is its own little moment
export function combo(id) {
  busyMove = performance.now() + 2500;
  switch (id) {
    case 'melt':
      // tail held, then a headpat: she melts
      act('[A:heart_eyes] [A:emote|happy]');
      setHeld('ParamBlush', 1, 3000);
      setHeld('ParamEyesHappy', 1, 3000);
      Live2D.playSequence([
        { dt_ms: 0, params: { ParamBodyY: -0.5, ParamHeadZ: 0.2 } },
        { dt_ms: 1800, params: { ParamBodyY: 0, ParamHeadZ: 0 } },
      ]);
      emote('hearts');
      break;
    case 'patboop':
      act('[A:emote|laughing]');
      emote('sparkle');
      break;
    case 'handhug':
      act('[A:heart_eyes]');
      setHeld('ParamHeart', 1, 2500);
      setHeld('ParamBlush', 0.9, 2500);
      emote('hearts');
      break;
    case 'cozy':
      // ear rub then headpat: drowsy and content
      setHeld('ParamEyeOpen', -0.85, 2500);
      setHeld('ParamEyesHappy', 1, 2500);
      setHeld('ParamHeadZ', 0.2, 2500);
      Live2D.startLoop('ParamTailWiggle', 0.4, 700);
      setTimeout(() => { if (!walkDir && !carried) Live2D.stopLoop('ParamTailWiggle'); }, 2500);
      emote('note');
      break;
    case 'tickleattack':
      act('[A:emote|laughing]');
      Live2D.startLoop('ParamBodyZ', 0.45, 150);
      Live2D.startLoop('ParamHeadZ', 0.25, 190);
      setTimeout(() => { Live2D.stopLoop('ParamBodyZ'); Live2D.stopLoop('ParamHeadZ'); act('[A:emote|pout]'); }, 1800);
      emote('laugh');
      break;
    case 'bothhands':
      // both her hands held at once
      act('[A:heart_eyes] [A:emote|happy]');
      setHeld('ParamBlush', 1, 3500);
      setHeld('ParamHeart', 1, 3500);
      emote('hearts');
      break;
    case 'hugpat':
      // a hug and a headpat at the same time
      setHeld('ParamEyeOpen', -1, 3000);
      setHeld('ParamEyesHappy', 1, 3000);
      setHeld('ParamBlush', 1, 3000);
      setHeld('ParamHeart', 1, 3000);
      emote('hearts');
      break;
    case 'bothears':
      setHeld('ParamEarsWiggle', 1, 2500);
      setHeld('ParamEyeOpen', -0.9, 2500);
      setHeld('ParamEyesHappy', 1, 2500);
      emote('note');
      break;
    case 'tailtease':
      act('[A:emote|pout]');
      setHeld('ParamBlush', 1, 2500);
      emote('anger');
      break;
    default:
      emote('heart');
  }
}

// a foot rub: she relaxes, eyes closed, a happy little sway
// her feet, by how close they are. a stranger pulls her foot away; a
// friend lets a foot rub happen, a tickle makes her giggle until it's
// too much; close, a foot rub melts her and she takes a long tickle
// fight before she begs off. pulling away keeps her feet out of reach
// for a few seconds (feetAway)
let feetAway = 0;
function pullFootAway(ms, mad) {
  feetAway = performance.now() + ms;
  act(mad ? '[A:emote|angry]' : '[A:emote|pout]');
  emote(mad ? 'anger' : 'sweat');
  Live2D.playSequence([
    { dt_ms: 0, params: { ParamLegL: -0.6, ParamLegR: -0.6, ParamBodyY: 0.25 } },
    { dt_ms: 450, params: { ParamLegL: 0, ParamLegR: 0, ParamBodyY: 0 } },
  ]);
}
export function feetPulledAway() { return performance.now() < feetAway; }

export function feetRub(ms) {
  const now = performance.now();
  busyMove = now + 800;
  if (close <= 1) {
    // not from him, not yet
    setHeld('ParamBlush', 0.4, 900);
    setHeld('ParamHeadY', -0.3, 600);
    if (ms > 1000) pullFootAway(4000, false);
    return;
  }
  setHeld('ParamEyesHappy', 1, 900);
  setHeld('ParamEyeOpen', close >= 3 ? -0.85 : -0.5, 700);
  setHeld('ParamHeadZ', close >= 3 ? 0.18 : 0.1, 700);
  setHeld('ParamBlush', close >= 3 ? 0.5 : 0.3, 1200);
  if (ms > 3000 && Math.random() < (close >= 3 ? 0.04 : 0.02)) emote(close >= 3 ? 'heart' : 'note');
}

// a quick tickle on her feet: she squirms, giggles, kicks a little
let feetTickleLaughAt = 0;
export function feetTickle(ms) {
  const now = performance.now();
  busyMove = now + 1000;
  if (close <= 1) {
    // she jerks the foot back right away
    if (now >= feetAway) pullFootAway(5000, ms > 300);
    return;
  }
  setHeld('ParamEyesHappy', 1, 600);
  setHeld('ParamBlush', Math.min(1, 0.4 + ms / 4000), 900);
  setHeld('ParamBodyZ', 0.2 * Math.sin(now / 90), 250);
  setHeld('ParamHeadZ', 0.12 * Math.sin(now / 120), 250);
  setHeld(Math.sin(now / 150) > 0 ? 'ParamLegL' : 'ParamLegR', -0.35, 250);
  if (now - feetTickleLaughAt > 1400) {
    feetTickleLaughAt = now;
    act('[A:emote|laughing]');
    emote('laugh');
  }
  // too much: a friend begs off sooner, close she can take a real tickle fight
  if (ms > (close >= 3 ? 6000 : 3000)) pullFootAway(close >= 3 ? 3000 : 5000, false);
}

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

// core feel (#27): her needs add to the pool (sleepy → yawns, playful → sways), and the repeat
// watcher picks from it so she doesn't do the same move again and again. desktop.js sets it
let idleHook = null;
export function setIdleHook(h) { idleHook = h || null; }

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
  if (idleHook?.extras) pool.push(...idleHook.extras().filter(k => k !== 'wave' || friendly));
  const kind = (idleHook?.pick && idleHook.pick(pool)) || pool[Math.floor(Math.random() * pool.length)];
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
