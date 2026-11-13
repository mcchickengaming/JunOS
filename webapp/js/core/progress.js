// The progression service's client (foundations #31 item 8): skills for her AND the player.
// The engine lives on her server (api/lib/progress.php, data in data/progress.json); this is the
// one door every page uses, so an activity (a delve, cooking, the focus timer) only ever does:
//
//   await Progress.begin('sample_fishing', { together: true });   // her server starts the clock
//   const r = await Progress.finish({ quality: 0.7 });            // → xp, level-ups, credits, drops
//
// Off switch: feature `progress` (Settings > Her > Skills). Off = nothing is asked or gained, and
// every call answers { off: true } so no caller has to care.

import { api, apiJson } from './api.js?v=1';
import * as F from './features.js?v=3';

const listeners = new Set();
let last = null;

export const isOn = () => F.isOn('progress');
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const cached = () => last;

function tell(state) {
  if (!state) return;
  last = state;
  for (const fn of listeners) { try { fn(state); } catch (e) { /* a listener's problem */ } }
}

async function post(body, { evenIfOff = false } = {}) {
  if (!evenIfOff && !isOn()) return { off: true };
  try {
    const res = await apiJson('progress.php', body);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: j.error || 'failed' };
    if (j.state) tell(j.state);
    return j.result || j;
  } catch (e) {
    return { error: 'offline' };
  }
}

// everything a page shows: { state: { owners: { player, jun }, credits, buffs, … }, data, tune, away, collected }
// peek: just look (nothing settled or saved), which also works with the feature off: the lab uses it
export async function load({ peek = false } = {}) {
  if (!peek && !isOn()) return { off: true };
  try {
    const res = await api('progress.php' + (peek ? '?peek=1' : ''));
    if (!res.ok) return { error: 'failed' };
    const j = await res.json();
    tell(j.state);
    return peek && !isOn() ? { ...j, off: true } : j;
  } catch (e) {
    return { error: 'offline' };
  }
}

const tz = () => -new Date().getTimezoneOffset();

export const begin = (activity, { together = false } = {}) => post({ action: 'begin', activity, together });
export const finish = ({ quality = 0.5, minutes, worn } = {}) => post({ action: 'finish', quality, minutes, worn, tz: tz() });
export const cancel = () => post({ action: 'cancel' });
export const setGoing = (activity) => post({ action: 'going', activity });
export const master = (owner, skill) => post({ action: 'master', owner, skill });
export const story = (id) => post({ action: 'story', id });
export const opt = (what) => post({ action: 'opt', ...what });
// the lab: nothing is saved, so these work with the feature off too
export const simulate = (activity, hours, o = {}) => post({ action: 'sim', activity, hours, ...o }, { evenIfOff: true });
export const curve = (tune) => post({ action: 'curve', tune }, { evenIfOff: true });

// words for a level, the same bands her prompt uses (lib/progress.php progress_band)
export function band(level) {
  return level >= 90 ? 'a master' : level >= 60 ? 'very good' : level >= 30 ? 'good' : level >= 10 ? 'getting the hang of it' : 'new at it';
}
