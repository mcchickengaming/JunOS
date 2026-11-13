// how a touch is done (#27, the composer's "how it's done"): the speed, steadiness and area of a
// rub, read from where his hand has been. Slow and steady is gentle; fast and scrubby is rough;
// rough for too long is too much. A hand that isn't moving (a hug, holding hands) has no manner.
//
// Everything is measured in "her heights" (px / how tall she is on screen), so it reads the same
// at any size of hers. No DOM, no clock of its own: moods.js feeds it points and asks.

import { TUNE } from './tune.js?v=5';

export const PACES = ['still', 'gentle', 'even', 'rough'];
export const PACE_WORDS = { still: 'a hand resting on her', gentle: 'slow and gentle', even: 'an easy rub', rough: 'fast and scrubby' };

// one hand's trail. add(x, y, t) for every move; read(t, unit) says how it's being done
export function tracker() {
  let pts = [];
  let roughSince = 0, gentleSince = 0, roughMs = 0, totalMs = 0, lastRead = 0;
  return {
    add(x, y, t) {
      const last = pts[pts.length - 1];
      if (last && t <= last.t) return;
      pts.push({ x, y, t });
      const from = t - TUNE.manner.windowMs;
      while (pts.length > 2 && pts[0].t < from) pts.shift();
    },
    // unit: her height in px. → null (can't tell yet) or
    // { pace, speed, steady 0..1, area, turns (a second), roughFor ms, gentleFor ms, roughShare 0..1 }
    read(t, unit = 400) {
      const M = TUNE.manner;
      const from = t - M.windowMs;
      const p = pts.filter(q => q.t >= from);
      if (p.length < 2 || p[p.length - 1].t - p[0].t < M.minMs * 0.5 || !(unit > 0)) {
        // no news for a while: the hand is resting
        if (pts.length && t - pts[pts.length - 1].t > M.minMs) { tally('still', t); return out('still', 0, 1, 0, 0); }
        return null;
      }
      let dist = 0, turns = 0, prevDx = 0, prevDy = 0;
      const speeds = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < p.length; i++) {
        minX = Math.min(minX, p[i].x); maxX = Math.max(maxX, p[i].x);
        minY = Math.min(minY, p[i].y); maxY = Math.max(maxY, p[i].y);
        if (!i) continue;
        const dx = p[i].x - p[i - 1].x, dy = p[i].y - p[i - 1].y, dt = Math.max(1, p[i].t - p[i - 1].t);
        const d = Math.hypot(dx, dy);
        dist += d;
        speeds.push(d / dt);
        // a change of direction: this step goes against the last one
        if (d > 0.5 && (prevDx || prevDy) && dx * prevDx + dy * prevDy < 0) turns++;
        if (d > 0.5) { prevDx = dx; prevDy = dy; }
      }
      // the time since the hand last moved counts as standing still
      const span = Math.max(1, t - p[0].t);
      const speed = (dist / unit) / (span / 1000);
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const sd = Math.sqrt(speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length);
      const steady = mean > 0 ? Math.max(0, Math.min(1, 1 - sd / (mean * 1.6))) : 1;
      const area = Math.hypot(maxX - minX, maxY - minY) / unit;
      const tps = turns / (span / 1000);
      let pace = 'even';
      if (speed < M.stillSpeed) pace = 'still';
      else if (speed >= M.roughSpeed || tps >= M.roughTurns) pace = 'rough';
      else if (speed <= M.gentleSpeed && steady >= M.steadyMin) pace = 'gentle';
      tally(pace, t);
      return out(pace, speed, steady, area, tps);

      function out(pc, sp, st, ar, tp) {
        return {
          pace: pc, speed: sp, steady: st, area: ar, turns: tp,
          roughFor: pc === 'rough' && roughSince ? t - roughSince : 0,
          gentleFor: pc === 'gentle' && gentleSince ? t - gentleSince : 0,
          roughShare: totalMs > 0 ? Math.min(1, roughMs / totalMs) : 0,
        };
      }
    },
    reset() { pts = []; roughSince = gentleSince = roughMs = totalMs = lastRead = 0; },
  };
  // how long it has been rough / gentle in one go, and the share of rough over the whole touch
  function tally(pace, t) {
    const dt = lastRead ? Math.max(0, Math.min(500, t - lastRead)) : 0;
    lastRead = t;
    totalMs += dt;
    if (pace === 'rough') { roughMs += dt; if (!roughSince) roughSince = t; } else roughSince = 0;
    if (pace === 'gentle') { if (!gentleSince) gentleSince = t; } else if (pace !== 'still') gentleSince = 0;
  }
}

// a manner by its name, for the feel lab and tests ("what if it were rough for 4 s")
export function named(pace, forMs = 0) {
  const M = TUNE.manner;
  if (!pace || pace === 'none') return null;
  const speed = { still: 0, gentle: M.gentleSpeed * 0.6, even: (M.gentleSpeed + M.roughSpeed) / 2, rough: M.roughSpeed * 1.4 }[pace] ?? 0;
  return {
    pace, speed, steady: pace === 'rough' ? 0.3 : 0.8, area: pace === 'rough' ? 0.2 : 0.1, turns: pace === 'rough' ? 6 : 1,
    roughFor: pace === 'rough' ? forMs : 0, gentleFor: pace === 'gentle' ? forMs : 0, roughShare: pace === 'rough' ? 1 : 0,
  };
}
