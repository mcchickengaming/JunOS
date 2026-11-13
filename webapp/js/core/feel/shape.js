// session shape (#27, first version): greeting → warm-up → peak → wind-down → afterglow. Worked
// out from what happened lately (store.js hist), so every window agrees. The composer and her
// prompt use it; the full "she has a feel for how the time together is going" grows from here.

import * as Store from './store.js?v=3';
import { TUNE } from './tune.js?v=3';
import * as K from './kinds.js?v=2';

export const PHASES = ['away', 'greeting', 'warmup', 'peak', 'winddown', 'afterglow'];
export const PHASE_WORDS = {
  away: 'He\'s away', greeting: 'Saying hello', warmup: 'Warming up', peak: 'Really into it',
  winddown: 'Winding down', afterglow: 'Afterglow',
};

// how much one event counts toward "how much are we doing together"
export function weight([, type, kind, ms]) {
  if (type === 'touch') return ms ? Math.min(4, (ms / 1000) * 0.15) : 0.3;
  if (type === 'message') return 1;
  if (type === 'combo') return 1;
  if (type === 'toss' || type === 'fetch') return 0.5;
  return 0;
}

export function engagement(t = Store.now(), hist = Store.get().hist) {
  const from = t - TUNE.session.windowMin * 60e3;
  let e = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i][0] >= from; i--) e += weight(hist[i]);
  return e;
}

// where this session started (the first event after a gap), and how long he was away before it
export function start(t = Store.now(), hist = Store.get().hist) {
  const gap = TUNE.session.awayMin * 60e3;
  if (!hist.length) return { at: null, awayMs: 0 };
  let i = hist.length - 1;
  while (i > 0 && hist[i][0] - hist[i - 1][0] < gap) i--;
  const before = i > 0 ? hist[i - 1][0] : Store.get().born;
  return { at: hist[i][0], awayMs: hist[i][0] - before };
}

export function phase(t = Store.now()) {
  const s = Store.get(), T = TUNE.session, hist = s.hist;
  const last = hist.length ? hist[hist.length - 1][0] : 0;
  if (!last || t - last > T.awayMin * 60e3) return 'away';
  const st = start(t, hist);
  if (st.awayMs >= T.awayMin * 60e3 && t - st.at < T.greetingMin * 60e3) return 'greeting';
  // the warm feeling right after a long cuddle, while nothing else has happened
  const lastEv = hist[hist.length - 1];
  if (lastEv[1] === 'touch' && K.isWarm(lastEv[2]) && (lastEv[3] || 0) >= T.afterglowAfterSec * 1000
      && t - lastEv[0] < T.afterglowMin * 60e3) return 'afterglow';
  const e = engagement(t, hist);
  // the session's peak so far (from its start)
  let peak = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i][0] >= st.at; i--) peak = Math.max(peak, engagement(hist[i][0], hist));
  if (e >= T.peakAt) return 'peak';
  if (peak >= T.peakAt && e < T.windDown * peak) return 'winddown';
  return 'warmup';
}
