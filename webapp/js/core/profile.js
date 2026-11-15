// Jun profiles (#18) and "what goes where". A profile is one .jun file (a plain zip; `jun-profile.json` inside is
// readable JSON) holding how your Jun looks and acts: colors, touch feedback, touch spots, the desktop settings, her
// spots, which features are on, her own ways, voice, outfit (+ names, comfort, the bond only if he puts them in).
// NEVER her memories or chats, never the game (that's game saves), never her skills.
//
// The pieces and which container carries each (profile / game save / save point) are DATA: data/profile-parts.json.
// "The way we made it" = the data's defaults; the player's own picks live in localStorage jun.carry
// ({ profile: { id: true|false }, gamesave: {...} }), and only for pieces the data marks on/off (always/never are fixed).
//
// Everything that touches storage goes through an `io` the page passes in, so this file runs in node tests:
//   io.local   { get(key), set(key, value|null), keys() }
//   io.desk    { get() → { desk, size }, set({ desk, size }), spots() → { spots, stay }, setSpots({ spots, stay }) }  (app only)
//   io.comfort { get(), set(patch) }        io.bond { get() → { stage }, set(stage) }        io.after(partIds) (push prefs…)
// Safety, tested: data only (strings and plain JSON), every key checked against the part's own list, sizes capped,
// 18+ never switched on by a file, a newer format refused, unknown parts dropped and named.

import * as Zip from './jun-zip.js?v=1';

export const FORMAT = 'junprofile', VERSION = 1;
export const FILE = 'jun-profile.json';
export const CARRY_KEY = 'jun.carry';
export const LIMITS = { value: 512 * 1024, total: 4 * 1024 * 1024, name: 60, note: 300, spots: 40 };
// comfort keys a file may carry. 18+ (adult, adultConfirmed, adultOutside) never: that stays his own choice
export const COMFORT_KEYS = ['flavor', 'flavorLock', 'flirty', 'siblingsRated'];
export const CONTAINERS = ['profile', 'gamesave', 'savepoint'];

let PARTS = null;
export function use(data) { PARTS = data; return data; }
export async function loadParts(url = 'data/profile-parts.json') {
  if (PARTS) return PARTS;
  const r = await fetch(url, { cache: 'no-cache' });
  return use(await r.json());
}
export const parts = () => PARTS?.parts || [];
export const part = (id) => parts().find(p => p.id === id) || null;
export const containers = () => PARTS?.containers || {};

// ---------------------------------------------------------------
// what goes where

export function readCarry(storage) {
  try { const c = JSON.parse(storage?.getItem(CARRY_KEY) || '{}'); return c && typeof c === 'object' ? c : {}; } catch (e) { return {}; }
}
export const defaultIn = (p, container) => (typeof p === 'string' ? part(p) : p)?.in?.[container] || 'never';
export const canChange = (p, container) => ['on', 'off'].includes(defaultIn(p, container));
export function isIn(p, container, carry = {}) {
  const v = defaultIn(p, container), id = typeof p === 'string' ? p : p?.id;
  if (v === 'always') return true;
  if (v === 'never') return false;
  const mine = carry?.[container]?.[id];
  return typeof mine === 'boolean' ? mine : v === 'on';
}
export function setIn(storage, container, id, on) {
  if (!canChange(id, container)) return readCarry(storage);
  const c = readCarry(storage);
  c[container] = { ...(c[container] || {}) };
  if (!!on === (defaultIn(id, container) === 'on')) delete c[container][id]; else c[container][id] = !!on;
  if (!Object.keys(c[container]).length) delete c[container];
  try { storage.setItem(CARRY_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
  return c;
}
export function resetCarry(storage) { try { storage.removeItem(CARRY_KEY); } catch (e) { /* ignore */ } return {}; }
// what he changed from the way we made it: [{ container, id, on }]
export function changedCarry(carry = {}) {
  const out = [];
  for (const [c, m] of Object.entries(carry || {})) for (const [id, on] of Object.entries(m || {})) if (canChange(id, c) && on !== (defaultIn(id, c) === 'on')) out.push({ container: c, id, on });
  return out;
}
// the game-save load options from it: which of his parts STAY as they are when he loads a save
export function gameKeep(carry = {}) {
  const keep = [];
  if (!isIn('his_skills', 'gamesave', carry)) keep.push('skills');
  if (!isIn('his_things', 'gamesave', carry)) keep.push('things');
  return { keep, useBond: isIn('bond', 'gamesave', carry) };
}

// ---------------------------------------------------------------
// the keys a part may hold

export function keysOf(p, allKeys = []) {
  const s = p?.store || {};
  const out = new Set(s.local || []);
  for (const pre of s.localPrefix || []) for (const k of allKeys) if (k.startsWith(pre)) out.add(k);
  return [...out];
}
const allowedKey = (p, key) => {
  const s = p?.store || {};
  return (s.local || []).includes(key) || (s.localPrefix || []).some(pre => key.startsWith(pre) && /^[\w.\-]{1,80}$/.test(key));
};
const isPlain = (v, depth = 0) => {
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return typeof v !== 'number' || Number.isFinite(v);
  if (depth > 8) return false;
  if (Array.isArray(v)) return v.length <= 2000 && v.every(x => isPlain(x, depth + 1));
  if (typeof v === 'object') return Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length <= 500 && Object.values(v).every(x => isPlain(x, depth + 1));
  return false;
};

// ---------------------------------------------------------------
// making one

// pick = part ids (default: what goes in a profile, his picks included) → the manifest
export async function collect(io, { name = 'My Jun', note = '', pick = null, carry = {}, now = Date.now() } = {}) {
  const ids = pick || parts().filter(p => isIn(p, 'profile', carry)).map(p => p.id);
  const out = { format: FORMAT, v: VERSION, name: String(name).slice(0, LIMITS.name), note: String(note || '').slice(0, LIMITS.note), made: new Date(now).toISOString(), parts: {} };
  const allKeys = io.local?.keys?.() || [];
  for (const id of ids) {
    const p = part(id);
    if (!p || defaultIn(p, 'profile') === 'never') continue;
    const s = p.store || {};
    const data = {};
    if (s.local || s.localPrefix) {
      const vals = {};
      for (const k of keysOf(p, allKeys)) { const v = io.local.get(k); if (v != null) vals[k] = String(v); }
      if (Object.keys(vals).length) data.local = vals;
    }
    if (s.desk && io.desk?.get) { const d = await io.desk.get(); if (d) data.desk = { desk: d.desk || {}, size: d.size }; }
    if (s.deskSpots && io.desk?.spots) { const d = await io.desk.spots(); if (d) data.spots = { spots: d.spots || [], stay: d.stay || null }; }
    if (s.comfort && io.comfort?.get) { const c = await io.comfort.get(); if (c) data.comfort = Object.fromEntries(COMFORT_KEYS.filter(k => k in c).map(k => [k, c[k]])); }
    if (s.bond && io.bond?.get) { const b = await io.bond.get(); if (b && b.stage) data.bond = { stage: Number(b.stage) }; }
    if (Object.keys(data).length) out.parts[id] = data;
  }
  return out;
}

// ---------------------------------------------------------------
// reading one

// anything from a file → { manifest, dropped: [words], error }
export function clean(m) {
  if (!m || typeof m !== 'object' || m.format !== FORMAT) return { error: 'not_profile' };
  if (!Number.isInteger(m.v) || m.v < 1) return { error: 'not_profile' };
  if (m.v > VERSION) return { error: 'newer' };
  const out = { format: FORMAT, v: VERSION, name: String(m.name || 'A Jun profile').slice(0, LIMITS.name), note: String(m.note || '').slice(0, LIMITS.note),
    made: typeof m.made === 'string' ? m.made.slice(0, 40) : null, parts: {} };
  const dropped = [];
  let total = 0;
  for (const [id, d] of Object.entries(m.parts || {})) {
    const p = part(id);
    if (!p || defaultIn(p, 'profile') === 'never' || !d || typeof d !== 'object') { dropped.push(id); continue; }
    const s = p.store || {}, keep = {};
    if (d.local && typeof d.local === 'object') {
      const vals = {};
      for (const [k, v] of Object.entries(d.local)) {
        if (!allowedKey(p, k) || typeof v !== 'string' || v.length > LIMITS.value) { dropped.push(id + ': ' + k); continue; }
        total += v.length;
        vals[k] = v;
      }
      if (Object.keys(vals).length) keep.local = vals;
    }
    if (s.desk && d.desk && typeof d.desk === 'object' && isPlain(d.desk.desk || {})) {
      keep.desk = { desk: { ...(d.desk.desk || {}) } };
      const n = Number(d.desk.size);
      if (Number.isFinite(n)) keep.desk.size = Math.max(0.05, Math.min(0.9, n));
    }
    if (s.deskSpots && d.spots && Array.isArray(d.spots.spots)) {
      const spots = d.spots.spots.slice(0, LIMITS.spots).filter(x => x && typeof x === 'object' && typeof x.type === 'string' && /^[\w-]{1,40}$/.test(String(x.id || '')) && Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y)))
        .map(x => ({ id: String(x.id), type: x.type.slice(0, 30), x: Math.round(Number(x.x)), y: Math.round(Number(x.y)), colors: Array.isArray(x.colors) ? x.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4) : undefined }));
      keep.spots = { spots, stay: typeof d.spots.stay === 'string' && spots.some(x => x.id === d.spots.stay) ? d.spots.stay : null };
    }
    if (s.comfort && d.comfort && typeof d.comfort === 'object') {
      const c = Object.fromEntries(COMFORT_KEYS.filter(k => k in d.comfort && ['string', 'boolean'].includes(typeof d.comfort[k])).map(k => [k, d.comfort[k]]));
      for (const k of Object.keys(d.comfort)) if (!COMFORT_KEYS.includes(k)) dropped.push(id + ': ' + k);
      if (Object.keys(c).length) keep.comfort = c;
    }
    if (s.bond && d.bond && Number.isInteger(Number(d.bond.stage))) keep.bond = { stage: Math.max(1, Math.min(6, Number(d.bond.stage))) };
    if (Object.keys(keep).length) out.parts[id] = keep; else dropped.push(id);
  }
  if (total > LIMITS.total) return { error: 'too_big' };
  return { manifest: out, dropped };
}

export async function toFile(manifest) { return Zip.write([{ name: FILE, data: JSON.stringify(manifest, null, 2) }]); }
// bytes → { manifest, dropped } or { error }. A bare .json profile works too
export async function fromFile(bytes) {
  let json = null;
  try {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u[0] === 0x7b) json = Zip.text(u);
    else { const files = await Zip.read(u); const f = files.find(x => x.name === FILE || x.name.endsWith('/' + FILE)); if (!f) return { error: 'not_profile' }; json = Zip.text(f.data); }
  } catch (e) { return { error: ['too_big', 'damaged'].includes(e.message) ? e.message : 'not_profile' }; }
  try { return clean(JSON.parse(json)); } catch (e) { return { error: 'damaged' }; }
}
export const fileName = (name) => (String(name || 'My Jun').replace(/[^\w \-()'.]+/g, '').trim().slice(0, 50) || 'My Jun') + '.jun';

// what's in it, in words, for the list and the "Choose parts" panel
export function summary(manifest) {
  const out = [];
  for (const [id, d] of Object.entries(manifest?.parts || {})) {
    const p = part(id);
    if (!p) continue;
    const bits = [];
    if (d.local) {
      if (d.local['desktop.theme']) { try { bits.push(countWords(Object.keys(JSON.parse(d.local['desktop.theme'])).length, 'color')); } catch (e) { /* skip */ } }
      const n = Object.keys(d.local).filter(k => k !== 'desktop.theme').length;
      if (n && !bits.length) bits.push(countWords(n, 'setting'));
    }
    if (d.desk) bits.push(countWords(Object.keys(d.desk.desk || {}).length, 'setting') + (d.desk.size ? ', her size' : ''));
    if (d.spots) bits.push(d.spots.spots.length ? countWords(d.spots.spots.length, 'spot') : 'no spots');
    if (d.comfort) bits.push('what you are to each other' + ('flirty' in d.comfort ? (d.comfort.flirty ? ', Flirty on' : ', Flirty off') : ''));
    if (d.bond) bits.push('a bond to set');
    out.push({ id, name: p.name, line: p.line, words: bits.join('; '), privacy: p.privacy, offByDefault: defaultIn(p, 'profile') === 'off' });
  }
  return out;
}
export const countWords = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
// colors in the file, for a little preview strip
export function swatches(manifest, max = 8) {
  try { return Object.values(JSON.parse(manifest.parts.colors.local['desktop.theme'])).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, max); } catch (e) { return []; }
}
// the parts "Apply" ticks at first: everything in the file except what's out by default (names, comfort, bond)
export const defaultPick = (manifest) => Object.keys(manifest?.parts || {}).filter(id => part(id) && defaultIn(id, 'profile') === 'on');

// ---------------------------------------------------------------
// applying one (the page makes a save point first)

export async function apply(manifest, pick, io) {
  const applied = [], skipped = [];
  const allKeys = io.local?.keys?.() || [];
  for (const id of pick || []) {
    const p = part(id), d = manifest?.parts?.[id];
    if (!p || !d) { skipped.push({ id, why: 'not in this profile' }); continue; }
    try {
      if (d.local) {
        // the part's keys that the file doesn't have go back to how she comes (removed)
        for (const k of keysOf(p, allKeys)) if (!(k in d.local)) io.local.set(k, null);
        for (const [k, v] of Object.entries(d.local)) if (allowedKey(p, k)) io.local.set(k, v);
      }
      if (d.desk) { if (!io.desk?.set) { skipped.push({ id, why: 'needs the desktop app' }); continue; } await io.desk.set(d.desk); }
      if (d.spots) { if (!io.desk?.setSpots) { skipped.push({ id, why: 'needs the desktop app' }); continue; } await io.desk.setSpots(d.spots); }
      if (d.comfort) await io.comfort.set(Object.fromEntries(COMFORT_KEYS.filter(k => k in d.comfort).map(k => [k, d.comfort[k]])));
      if (d.bond) await io.bond.set(d.bond.stage);
      applied.push(id);
    } catch (e) { skipped.push({ id, why: e?.message || 'failed' }); }
  }
  if (io.after) await io.after(applied);
  return { applied, skipped };
}

export const WORDS = {
  not_profile: "That isn't a Jun profile.",
  newer: 'That profile was made by a newer Jun. Update her first.',
  damaged: 'That file is damaged.',
  too_big: 'That profile is too big.',
  savepoint: "Couldn't make a save point first, so nothing was changed.",
};
export const say = (code) => WORDS[code] || 'Something went wrong.';
