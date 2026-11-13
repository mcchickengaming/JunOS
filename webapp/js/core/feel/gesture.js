// waving at her (#1d (i), with the initiative engine): is the trail of his cursor a wave?
// Two gestures, his pick (Settings > Her > On her own): side to side, or a circle. Sizes are in
// "her heights", so it works the same at any size of her; "how big" scales what counts.
//
// No DOM. waveGesture(points, { unit, style, size }) → 'side' | 'circle' | null
//   points: [{ x, y, t }] oldest first (the page keeps the last second and a half)
//   unit: her height in px · style: 'either' | 'side' | 'circle' · size: 0..100 (50 = natural)

import { TUNE } from './tune.js?v=5';

const sizeK = (p) => { p = Number.isFinite(Number(p)) ? Math.max(0, Math.min(100, Number(p))) : 50; return p <= 50 ? 0.4 + 0.6 * p / 50 : 1 + (p - 50) / 50 * 1.5; };

export function waveGesture(points, { unit = 400, style = 'either', size = 50, now = null } = {}) {
  const T = TUNE.init;
  const t1 = now ?? (points.length ? points[points.length - 1].t : 0);
  const pts = points.filter(p => t1 - p.t <= T.hisWaveWindowMs);
  if (pts.length < 6) return null;
  const minSweep = T.hisWaveSweep * unit * sizeK(size);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);

  if (style !== 'circle') {
    // side to side: sweeps left and right, each long enough, flatter than it is wide
    let dir = 0, run = 0, sweeps = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      if (!dx) continue;
      const s = Math.sign(dx);
      if (!dir || s === dir) { run += Math.abs(dx); dir = s; continue; }
      // a turn: a tiny wobble back doesn't end a sweep
      if (Math.abs(dx) < minSweep * 0.15 && run >= minSweep * 0.5) continue;
      if (run >= minSweep) sweeps++;
      else sweeps = 0;
      run = Math.abs(dx); dir = s;
    }
    if (run >= minSweep) sweeps++;
    if (sweeps >= T.hisWaveFlips + 1 && h < w * 0.9) return 'side';
  }
  if (style !== 'side') {
    // a circle: the trail goes most of the way round its own middle, and it's round enough
    const cx = xs.reduce((a, b) => a + b, 0) / pts.length, cy = ys.reduce((a, b) => a + b, 0) / pts.length;
    let turned = 0, rSum = 0, prev = null;
    for (const p of pts) {
      const a = Math.atan2(p.y - cy, p.x - cx);
      rSum += Math.hypot(p.x - cx, p.y - cy);
      if (prev !== null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turned += d; }
      prev = a;
    }
    const r = rSum / pts.length;
    if (Math.abs(turned) >= T.hisWaveTurn && r >= minSweep * 0.5 && Math.min(w, h) >= Math.max(w, h) * 0.45) return 'circle';
  }
  return null;
}
