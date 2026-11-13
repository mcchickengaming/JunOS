// the feature registry (foundations #31): every feature, big or small, declared once in
// data/features.json. this module reads it and answers the questions every page asks:
// what is this, what depends on it, what words find it, which layer it's in, is it new.
//
// keys are 'kind:name' ('desk:walk', 'fx:mGlow', 'comfort:flirty', 'feature:<id>'), the
// stores are listed in the json. reading/writing the stores themselves is js/home/stores.js
// (it needs the desktop app and the server); this file has no DOM and no network except load().
//
// small state of its own in localStorage 'jun.features':
//   { policy: 'surprise'|'ask'|'off', seen: [ids], on: { id: bool }, layer: 'simple'|'all',
//     modes: { desktop: { key: value }, windowed: {...}, compact: {...} } }

export const STATE_KEY = 'jun.features';
export const POLICIES = [['surprise', 'Surprise me (on, as she comes)'], ['ask', 'Ask me first'], ['off', 'Keep them off']];
export const LAYERS = [['simple', 'Simple'], ['all', 'Everything']];
export const MODES = ['desktop', 'windowed', 'compact'];

let reg = { sections: {}, features: [], presets: [] };
let byId = new Map();
let byKey = new Map(); // key -> { f, main }

export function use(data) {
  reg = data && Array.isArray(data.features) ? data : { sections: {}, features: [], presets: [] };
  byId = new Map(reg.features.map(f => [f.id, f]));
  byKey = new Map();
  for (const f of reg.features) {
    if (f.key) byKey.set(f.key, { f, main: true });
    for (const k of f.more || []) if (!byKey.has(k)) byKey.set(k, { f, main: false });
  }
  return reg;
}

let loading = null;
export function load(url = 'data/features.json') {
  if (!loading) {
    loading = fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => use(j))
      .catch(() => use(null));
  }
  return loading;
}

export const all = () => reg.features;
export const get = (id) => byId.get(id) || null;
export const sections = () => reg.sections || {};
export const presets = () => reg.presets || [];
export const inSection = (sec) => reg.features.filter(f => f.section === sec);
export const ofKey = (key) => byKey.get(key) || null;
export const kindOf = (key) => String(key || '').split(':')[0];
export const nameOfKey = (key) => String(key || '').slice(kindOf(key).length + 1);

// what plainly counts as "off" for any control
export function isOffValue(v) {
  return v === false || v === 0 || v === '0' || v === 'off' || v === 'never' || v === 'none' || v == null;
}

// the features that need this one (direct ones; their own dependents follow when they go off)
export function dependents(id) {
  return reg.features.filter(f => (f.needs || []).includes(id));
}
const listWords = (names) => names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

// "Turning this off also pauses: Tsundere moments and Comforted when she's down."
export function offNote(id) {
  const d = dependents(id).map(f => f.name);
  return d.length ? 'Off, this also pauses ' + listWords(d) + '.' : '';
}
// "Needs How she feels." when something it needs is off. isOn(id) answers for the needed feature
export function needsNote(id, isOn) {
  const f = get(id);
  const off = (f?.needs || []).map(get).filter(n => n && !isOn(n.id));
  return off.length ? 'Paused: needs ' + listWords(off.map(n => '"' + n.name + '"')) + ' on.' : '';
}

const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function textOf(f) {
  return norm([f.name, f.line, ...(f.words || []), f.where || '', reg.sections?.[f.section] || ''].join(' '));
}
// features whose name, line or words have every word of the search
export function search(q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return reg.features.filter(f => { const t = textOf(f); return words.every(w => t.includes(w)); });
}

// ---------------------------------------------------------------
// its own small state

function readState() {
  try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; }
}
function writeState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}
function patch(fn) { const s = readState(); fn(s); writeState(s); return s; }

export const policy = () => (POLICIES.some(([v]) => v === readState().policy) ? readState().policy : 'surprise');
export const setPolicy = (v) => patch(s => { if (POLICIES.some(([p]) => p === v)) s.policy = v; });
export const layer = () => (readState().layer === 'all' ? 'all' : 'simple');
export const setLayer = (v) => patch(s => { s.layer = v === 'all' ? 'all' : 'simple'; });

// the very first time, everything that exists counts as seen: only features from later updates are "new"
export function firstRun() {
  const s = readState();
  if (Array.isArray(s.seen)) return false;
  writeState({ ...s, seen: reg.features.map(f => f.id) });
  return true;
}
export function unseen() {
  const seen = readState().seen;
  if (!Array.isArray(seen)) return [];
  return reg.features.filter(f => !seen.includes(f.id));
}
export function markSeen(ids) {
  patch(s => { s.seen = [...new Set([...(Array.isArray(s.seen) ? s.seen : []), ...ids])]; });
}

// the plain on/off for features whose key is 'feature:<id>'. new ones follow the policy until he decides
export function isOn(id) {
  const s = readState();
  if (s.on && typeof s.on[id] === 'boolean') return s.on[id];
  const f = get(id);
  if (f && f.default === false) return false;
  const isNew = Array.isArray(s.seen) && !s.seen.includes(id);
  return !(isNew && s.policy === 'off');
}
export function setOn(id, on) { patch(s => { s.on = { ...(s.on || {}), [id]: !!on }; }); }

// per-mode overrides: a value for this key in one mode only (desktop / windowed / compact)
export function valueFor(key, base, mode) {
  const m = readState().modes;
  return m && m[mode] && Object.prototype.hasOwnProperty.call(m[mode], key) ? m[mode][key] : base;
}
export function setModeValue(mode, key, value) {
  if (!MODES.includes(mode)) return;
  patch(s => {
    s.modes = s.modes || {};
    s.modes[mode] = { ...(s.modes[mode] || {}) };
    if (value === undefined) delete s.modes[mode][key]; else s.modes[mode][key] = value;
  });
}
