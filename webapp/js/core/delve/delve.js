// the delve framework's door for pages (#32): the data, the player's settings, the delve in progress
// (kept in this app's storage, so save points include it and a closed window loses nothing), and the
// hand-off to the progression service. A page only ever does:
//
//   const data = await Delve.loadData();
//   const { run, events } = await Delve.begin(data, { area: 'server_farm', together: true });
//   … Run.step / Run.use / the fight … Delve.save(run) …
//   const r = await Delve.end(data, run, activeMinutes);   // → what you both got (xp, finds)
//
// A delve is an activity of the progression service ('delve' in data/progress.json): her server keeps
// the clock, turns real minutes × the delve's quality into xp for both of you and rolls the finds with
// its ONE reward roller. A delve has no reward numbers of its own.
// Off switch: feature `delves`. Skills off (feature `progress`) = the delve plays the same, nothing is gained.

import * as F from '../features.js?v=3';
import * as Progress from '../progress.js?v=2';
import * as Gate from '../gate.js?v=3';
import * as Run from './run.js?v=1';
import * as Party from './party.js?v=1';
import { tune as getTune } from './delve-tune.js?v=1';
import { lastDelve } from './last.js?v=1';

export const KEY = 'jun.delve';
export const ACTIVITY = 'delve';
export const KEYS = {
  talk: 'jun.delve.talk', courage: 'jun.delve.courage',
  pace: 'jun.delve.pace', notimer: 'jun.delve.notimer', role: 'jun.delve.role',
};
// how she comes: she talks sometimes, her courage grows with her, the place picks the pace, she picks her role
export const SETTING_DEFAULTS = { talk: 50, courage: 'grows', pace: 'place', notimer: false, role: 'decides' };
// "As she feels" for how much she talks down there is its own switch: feature `delve_as_feels`
export const asFeels = () => F.isOn('delve_as_feels');
export const PACE_CHOICES = [['place', 'As the place suits'], ...Run.Enc.PACES];

let storage = null;
try { storage = globalThis.localStorage || null; } catch (e) { storage = null; }
export function setStorage(s) { storage = s; }

export const isOn = () => F.isOn('delves');

export function setting(name) {
  const d = SETTING_DEFAULTS[name];
  let v = null;
  try { v = storage ? storage.getItem(KEYS[name]) : null; } catch (e) { v = null; }
  if (v === null || v === undefined || v === '') return d;
  if (typeof d === 'boolean') return v === 'true' || v === '1';
  if (typeof d === 'number') { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : d; }
  return String(v);
}
export function setSetting(name, value) { try { storage?.setItem(KEYS[name], String(value)); } catch (e) { /* private mode */ } }

// the pace a fight in this place runs at: "no timers" always wins, then the player's pick, then the place's own
export function paceFor(data, area) {
  if (setting('notimer')) return 'turn';
  const p = setting('pace');
  if (Run.Enc.PACE_IDS.includes(p)) return p;
  const own = data.areas[area]?.pace;
  return Run.Enc.PACE_IDS.includes(own) ? own : 'turn';
}

let dataCache = null;
export async function loadData(url = 'data/delve.json') {
  if (!dataCache) dataCache = fetch(url, { cache: 'no-cache' }).then(r => r.json());
  return dataCache;
}

function read() { try { return JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
function write(v) { try { storage?.setItem(KEY, JSON.stringify(v)); } catch (e) { /* full or private: the delve still plays */ } }

export const saved = () => read().run || null;
export function save(run) { const s = read(); s.run = run; write(s); }
export function drop() { const s = read(); delete s.run; write(s); }
export const last = () => read().last || null;

// their levels, from the progression service ({ player: { delving: 3, … }, jun: { … } }); level 1s if it can't say
export async function levels() {
  const out = { player: {}, jun: {} };
  try {
    const j = await Progress.load({ peek: true });
    for (const o of ['player', 'jun']) for (const [id, k] of Object.entries(j.state?.owners?.[o]?.skills || {})) out[o][id] = k.level;
  } catch (e) { /* offline */ }
  return out;
}

// o: { area, seed, together, real (count it: default true), levels?, stage?, kits?, role?, pace?, courage? }
export async function begin(data, o = {}) {
  if (!isOn()) return { off: true };
  const real = o.real !== false && Progress.isOn();
  let effects = {};
  if (real) {
    const r = await Progress.begin(ACTIVITY, { together: o.together !== false });
    if (r && r.error) return { error: r.error };
    effects = (r && r.effects) || {};
  }
  const lv = o.levels || await levels();
  const { run, events } = Run.start(data, {
    area: o.area, seed: o.seed ?? (Date.now() % 1000000), together: o.together !== false,
    role: o.role || setting('role'), pace: o.pace || paceFor(data, o.area), levels: lv, effects,
    kits: o.kits, courage: o.courage || setting('courage'), stage: o.stage || 1,
  }, getTune());
  run.real = real;
  save(run);
  return { run, events };
}

// the delve is over (run.outcome is set by Run.leave): hand it to the progression service, keep a
// short summary for her prompt, forget the run. activeMinutes: time actually played (a paused window doesn't count)
export async function end(data, run, activeMinutes) {
  const o = run.outcome || Run.outcome(data, run, 'home', getTune());
  let got = null;
  if (run.real) got = await Progress.finish({ quality: o.quality, minutes: activeMinutes });
  const s = read();
  delete s.run;
  s.last = { at: Date.now(), area: run.area, name: data.areas[run.area]?.name || run.area, together: run.together, cleared: o.cleared, floors: o.floors, of: o.of,
    ko: o.ko, how: o.how, carried: o.carried, wish: o.wish, secrets: o.secrets, courage: Party.band(herCourage(run)) };
  write(s);
  return { outcome: o, got };
}

// walked away without finishing (window closed and the delve dropped): nothing gained, nothing lost
export async function abandon(run) {
  if (run && run.real) await Progress.cancel();
  drop();
}

export const herCourage = (run) => Party.courage({ setting: run.setup.courage, delving: run.setup.levels.jun.delving, stage: run.setup.stage });

// what her prompt hears about the last delve, for a day and a half: last.js (api/lib/delve.php puts it in words)
export const forChat = (now) => lastDelve(now, storage || undefined);

// the gate's context for scenes and safe-spot offers. rel = relationship.php's answer (or a lab override)
export function gateCtx(rel = {}) {
  return { comfort: Gate.comfort(), mode: 'windowed', stage: rel.stage ?? 1, trust: rel.trust ?? 50, tension: rel.tension ?? 0, stop: false, screenShare: false };
}

export { Run, Party, Gate };
