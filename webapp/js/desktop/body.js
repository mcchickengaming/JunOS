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
  turnDeg: 26,        // how far the figure turns toward where she walks
  turnMs: 320,        // how long the turn takes
  strideMs: 1100,     // one full stride, left step + right step
  leg: 0.45,          // ParamLegL/R swing
  arm: 0.3,           // ParamArmLRot/RRot swing
  bob: 0.35,          // ParamBodyY bounce
  roll: 0.22,         // ParamBodyZ hip roll
  bodyTurn: 0.55,     // ParamBodyX toward the walk
  headTurn: 0.6,      // ParamHeadX toward the walk
  tail: 0.7,          // ParamTailWiggle while walking
  kick: 0.55,         // legs flailing while carried
  kickMs: 520,
  lookEyes: 0.9,      // how far her eyes follow the cursor
  lookHead: 0.45,     // and her head
};

let canvas = null;
let anchor = () => null;
let walkDir = 0;          // -1 left, 1 right, 0 standing
let carried = false;
let ramp = 0;             // 0..1, eases the cycle in and out
let phase = 0;
let turn = 0;             // current turn, degrees
let lastT = 0;
let look = null;          // { x, y, at }
let pat = null;           // headpat in progress
let onPat = null;
let busyMove = 0;         // an idle move is playing until this time
let asleep = false;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function setHeld(param, value, ms = 300) {
  Live2D.setNow(param, value);
  Live2D.hold(param, ms);
}

export function init({ stageEl, faceAnchor, onHeadpat }) {
  anchor = faceAnchor;
  onPat = onHeadpat;
  // the rig's canvas, or the placeholder art when the game files aren't extracted
  const find = () => { canvas = stageEl.querySelector('canvas, img.l2d-placeholder'); };
  find();
  if (!canvas) new MutationObserver((_, obs) => { find(); if (canvas) obs.disconnect(); }).observe(stageEl, { childList: true });
  requestAnimationFrame(frame);
}

export function walking(dir) {
  walkDir = dir ? Math.sign(dir) : 0;
  if (walkDir) {
    Live2D.startLoop('ParamTailWiggle', TUNE.tail, TUNE.strideMs / 2);
  } else {
    Live2D.stopLoop('ParamTailWiggle');
  }
}

export function setCarried(on) {
  if (on === carried) return;
  carried = on;
  if (on) {
    walking(0);
    for (const a of Actions.parseActions('[A:emote|surprised]')) Actions.applyAction(a);
    Live2D.startLoop('ParamTailWiggle', 1, 380);
  } else {
    Live2D.stopLoop('ParamTailWiggle');
  }
}

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
  look = { x, y, at: performance.now() };
}
export function setAsleep(on) { asleep = !!on; }
export function cursorMovedWithin(ms) {
  return !!look && performance.now() - look.at < ms;
}

// ---------------------------------------------------------------
// headpats: rub the top of her head back and forth with the mouse

function overHead(x, y) {
  const a = anchor();
  if (!a) return false;
  const top = a.y - a.modelH * 0.09;
  return Math.abs(x - a.x) < a.headW * 0.55 && y > top - 10 && y < a.y + a.modelH * 0.05;
}

export function pointerMove(x, y) {
  if (carried) return false;
  const now = performance.now();
  if (!overHead(x, y)) {
    if (pat && now - pat.last > 500) endPat();
    return false;
  }
  if (!pat || now - pat.last > 600) {
    pat = { started: 0, last: now, lastX: x, dir: 0, flips: 0, flipAt: now, travel: 0 };
    return false;
  }
  const dx = x - pat.lastX;
  pat.travel += Math.abs(dx);
  const dir = Math.sign(dx);
  if (dir && pat.dir && dir !== pat.dir) { pat.flips++; pat.flipAt = now; }
  if (dir) pat.dir = dir;
  pat.lastX = x;
  pat.last = now;
  // two turns back and forth over her head is a pat, not a fly-by
  if (!pat.started && pat.flips >= 2 && pat.travel > 40) {
    pat.started = now;
    Actions.applyAction({ name: 'receive_headpat', kwargs: {} });
  }
  if (pat.started) {
    const a = anchor();
    setHeld('ParamHeadpat', 1, 700);
    setHeld('ParamHeadpatY', clamp((x - a.x) / (a.headW * 0.5), -1, 1) * 0.35, 700);
    setHeld('ParamEyesHappy', 1, 900);
    setHeld('ParamBlush', 0.6, 1500);
    if (onPat) onPat(now - pat.started);
  }
  return !!pat.started;
}

function endPat() {
  pat = null;
}
export function patting() { return !!(pat && pat.started); }

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
  sway: [
    { dt_ms: 0, params: { ParamBodyZ: 0.3, ParamHeadZ: -0.2, ParamLegL: 0.3 } },
    { dt_ms: 900, params: { ParamBodyZ: -0.3, ParamHeadZ: 0.2, ParamLegL: 0, ParamLegR: 0.3 } },
    { dt_ms: 900, params: { ParamBodyZ: 0, ParamHeadZ: 0, ParamLegR: 0 } },
  ],
};
const MOVE_MS = { lookAround: 2600, stretch: 2400, yawn: 2300, rest: 7500, sway: 2000, tail: 2000, wave: 1200, ears: 900 };

export function idleMove() {
  if (asleep || walkDir || carried || patting() || performance.now() < busyMove) return null;
  const pool = ['lookAround', 'lookAround', 'stretch', 'yawn', 'rest', 'sway', 'tail', 'ears'];
  if (cursorMovedWithin(4000)) pool.push('wave', 'wave');
  const kind = pool[Math.floor(Math.random() * pool.length)];
  play(kind);
  return kind;
}

export function play(kind) {
  busyMove = performance.now() + (MOVE_MS[kind] || 1500);
  if (MOVES[kind]) Live2D.playSequence(MOVES[kind]);
  else if (kind === 'wave') { for (const a of Actions.parseActions('[A:wave] [A:emote|happy]')) Actions.applyAction(a); }
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
    if (carried) {
      phase += (2 * Math.PI * dt * 1000) / TUNE.kickMs;
      setHeld('ParamLegL', TUNE.kick * Math.sin(phase) * r);
      setHeld('ParamLegR', TUNE.kick * Math.sin(phase + Math.PI * 0.6) * r);
      setHeld('ParamArmLUp', 0.25 * r);
      setHeld('ParamArmRUp', 0.25 * r);
      setHeld('ParamArmLRot', 0.3 * Math.sin(phase * 0.7) * r);
      setHeld('ParamArmRRot', -0.3 * Math.sin(phase * 0.7) * r);
      setHeld('ParamBodyZ', 0.15 * Math.sin(phase * 0.5) * r);
    } else {
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

  // standing: eyes (and a bit of head) follow the cursor while it moves
  if (!asleep && look && performance.now() - look.at < 6000 && !patting() && performance.now() > busyMove) {
    const a = anchor();
    if (!a) return;
    const dx = clamp((look.x - a.x) / Math.max(300, window.innerWidth * 1.2), -1, 1);
    const dy = clamp((a.y - look.y) / Math.max(300, window.innerHeight * 1.2), -1, 1);
    for (const p of ['ParamEyeballLX', 'ParamEyeballRX']) { Live2D.setTarget(p, dx * TUNE.lookEyes); Live2D.hold(p, 400); }
    for (const p of ['ParamEyeballLY', 'ParamEyeballRY']) { Live2D.setTarget(p, dy * TUNE.lookEyes * 0.8); Live2D.hold(p, 400); }
    Live2D.setTarget('ParamHeadX', dx * TUNE.lookHead); Live2D.hold('ParamHeadX', 400);
    Live2D.setTarget('ParamHeadY', dy * TUNE.lookHead * 0.7); Live2D.hold('ParamHeadY', 400);
  }
}
