// read and write any setting by its registry key ('kind:name', see data/features.json
// "stores"), so resets, presets and the new-features card work the same for every feature,
// wherever it happens to be stored. Settings stay where they always were.

import * as Fx from '../desktop/fx.js?v=11';
import * as F from '../core/features.js?v=3';
import * as Gate from '../core/gate.js?v=3';

const D = window.junDesktop || null;
let desk = null; // the app's last deskInfo (desktop-settings.js passes it on)
export function setDesk(info) { desk = info || null; }
// her window's mirrored controls (js/home/herwin.js passes these in): { open(), get(id), set(id, v) }
let mirror = null;
export function setMirrorIO(io) { mirror = io || null; }

const THEME_KEY = 'desktop.theme';
const UNDO_KEY = 'jun.features.undo';
const readTheme = () => { try { return JSON.parse(localStorage.getItem(THEME_KEY) || '{}') || {}; } catch (e) { return {}; } };

// the value right now, without waiting (undefined = not known here)
export function peek(key) {
  const kind = F.kindOf(key), name = F.nameOfKey(key);
  if (kind === 'fx') return Fx.readFx()[name];
  if (kind === 'desk') return desk ? desk.desk[name] : undefined;
  if (kind === 'app') return desk ? desk[name] : undefined;
  if (kind === 'mirror') return mirror && mirror.open() ? mirror.get(name) : undefined;
  if (kind === 'comfort') return Gate.comfort()[name];
  if (kind === 'feature') return F.isOn(name);
  if (kind === 'theme') return readTheme()[name];
  if (kind === 'local') { try { return localStorage.getItem(name); } catch (e) { return undefined; } }
  return undefined;
}

// the natural default (undefined = nothing to reset to from here)
export function defaultOf(key) {
  const kind = F.kindOf(key), name = F.nameOfKey(key);
  if (kind === 'fx') return Fx.FX_DEFAULTS[name];
  if (kind === 'comfort') return Gate.DEFAULTS[name];
  if (kind === 'feature') return F.get(name)?.default !== false;
  const hit = F.ofKey(key);
  return hit && hit.main && 'default' in hit.f ? hit.f.default : undefined;
}

export function canWrite(key) {
  const kind = F.kindOf(key);
  if (kind === 'desk') return !!(D && D.desk && desk);
  if (kind === 'mirror') return !!(mirror && mirror.open());
  return ['fx', 'comfort', 'feature', 'local'].includes(kind);
}

export async function write(key, value) {
  const kind = F.kindOf(key), name = F.nameOfKey(key);
  if (kind === 'fx') { const f = { ...Fx.readFx(), [name]: value }; Fx.writeFx(f); Fx.applyFx(f); return; }
  if (kind === 'desk') { if (D?.desk) setDesk(await D.desk('set', name, value)); return; }
  if (kind === 'mirror') { mirror?.set(name, value); await new Promise(r => setTimeout(r, 300)); return; }
  if (kind === 'comfort') { await Gate.saveComfort({ [name]: value }); return; }
  if (kind === 'feature') { F.setOn(name, !!value); return; }
  if (kind === 'local') { try { localStorage.setItem(name, String(value)); } catch (e) { /* private mode */ } }
}

// is this feature on right now? (its main key, read plainly; unknown = on)
export function isOn(id) {
  const f = F.get(id);
  if (!f || !f.key) return true;
  const v = peek(f.key);
  return v === undefined ? true : !F.isOffValue(v);
}

// every setting of a section back to how she comes. comfort (what you are to each other,
// ratings) is never reset from here: those are his choices, changed one by one
export async function resetSection(sec) {
  let n = 0;
  for (const f of F.inSection(sec)) {
    for (const key of [f.key, ...(f.more || [])].filter(Boolean)) {
      if (F.kindOf(key) === 'comfort' || !canWrite(key)) continue;
      const d = defaultOf(key);
      if (d === undefined || peek(key) === d) continue;
      await write(key, d);
      n++;
    }
  }
  return n;
}

// a preset: a bundle of values. what it changes is remembered, so one click undoes it
export async function applyPreset(p) {
  const before = {};
  const values = p.id === 'natural' ? naturalValues() : p.values;
  for (const [key, v] of Object.entries(values)) {
    if (!canWrite(key)) continue;
    before[key] = peek(key);
    await write(key, v);
  }
  try { localStorage.setItem(UNDO_KEY, JSON.stringify({ name: p.name, before })); } catch (e) { /* ignore */ }
}
// "The natural her": every key any preset touches, back to its default
function naturalValues() {
  const out = {};
  for (const p of F.presets()) for (const key of Object.keys(p.values)) { const d = defaultOf(key); if (d !== undefined) out[key] = d; }
  return out;
}
export function undoInfo() { try { return JSON.parse(localStorage.getItem(UNDO_KEY) || 'null'); } catch (e) { return null; } }
export async function undoPreset() {
  const u = undoInfo();
  if (!u) return;
  for (const [key, v] of Object.entries(u.before || {})) if (v !== undefined && canWrite(key)) await write(key, v);
  try { localStorage.removeItem(UNDO_KEY); } catch (e) { /* ignore */ }
}
