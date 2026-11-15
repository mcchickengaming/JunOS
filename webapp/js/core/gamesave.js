// Game saves (#35 a): the one door every game page uses for the game's own progress. The engine lives on her server
// (api/lib/gamesave.php); this file adds what only a page can do: the parts a page keeps in its own storage, the
// play clock, files, and telling every open window when a different game was loaded.
//
//   const s = await GameSave.section('story');                  // { data, epoch }: one section of the live game
//   await GameSave.put({ story: next });                        // write it back (refused if another game was loaded)
//   await GameSave.autosave('reached the harbor', { force: true });   // a story beat that must be kept
//   GameSave.onChange((e) => { if (e.type === 'loaded') reloadEverything(); });
//   GameSave.startClock();                                      // while the game is on screen
//
// Desktop Jun is never in a save (her chats, memories, feelings, her own skills). A save holds the game's sections,
// the player's side of the progression service, and the page parts registered here (the delve in progress).
// Loading never applies the save's bond unless the player ticked "Use this save's bond"; then a desktop save point
// comes first (in the desktop app), and the before-load save keeps the bond as it was, so Undo puts it back.
// Off switch: JUN_GAMESAVES=off on her server; then every call answers { off: true }.

import { api, apiJson } from './api.js?v=1';

export const AUTOSAVE_KEY = 'jun.game.autosave';     // 'false' = no autosaves (manual saves always work)
export const CLOCK_SEC = 60;
export const FILE_EXT = '.jungame';

let storage = null;
try { storage = globalThis.localStorage || null; } catch (e) { storage = null; }
export function setStorage(s) { storage = s; }

// ---------------------------------------------------------------
// parts a page keeps itself (in this app's storage): { get() → value | null, set(value), clear() }

const PARTS = new Map();
const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
export function part(name, { get, set, clear }) {
  if (!NAME_RE.test(name)) throw new Error('game save part: bad name ' + name);
  PARTS.set(name, { get, set, clear: clear || (() => set(null)) });
}
export const parts = () => [...PARTS.keys()];

// a part that is one field of a JSON object in localStorage (the delve keeps `run` in `jun.delve`, next to `last`,
// which is desktop Jun's memory of the last delve and stays out of a save)
export function localPart(name, key, field) {
  const read = () => { try { return JSON.parse(storage?.getItem(key) || '{}') || {}; } catch (e) { return {}; } };
  const write = (o) => { try { storage?.setItem(key, JSON.stringify(o)); } catch (e) { /* full or private */ } };
  part(name, {
    get: () => read()[field] ?? null,
    set: (v) => { const o = read(); if (v === null || v === undefined) delete o[field]; else o[field] = v; write(o); },
    clear: () => { const o = read(); delete o[field]; write(o); },
  });
}
localPart('delve', 'jun.delve', 'run');

export function collect() {
  const out = {};
  for (const [name, p] of PARTS) {
    try { const v = p.get(); if (v !== null && v !== undefined) out[name] = v; } catch (e) { /* a part's own problem */ }
  }
  return out;
}
// after a load: every registered part takes the save's value, or is cleared if the save had none
export function restore(client) {
  const c = client && typeof client === 'object' ? client : {};
  for (const [name, p] of PARTS) {
    try { if (name in c && c[name] !== null) p.set(c[name]); else p.clear(); } catch (e) { /* keep going */ }
  }
}

// ---------------------------------------------------------------
// every open window hears when another game was loaded (BroadcastChannel; storage events as a fallback)

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function tell(e) { for (const fn of listeners) { try { fn(e); } catch (err) { /* a listener's problem */ } } }
let chan = null;
try { chan = new BroadcastChannel('jun-game'); chan.unref?.(); chan.onmessage = (m) => { if (m?.data?.type) { if (m.data.epoch) epoch = m.data.epoch; tell(m.data); } }; } catch (e) { chan = null; }
function broadcast(e) { tell(e); try { chan?.postMessage(e); } catch (err) { /* closed */ } }

let epoch = null;
let view = null;
export const cachedView = () => view;
export const currentEpoch = () => epoch;

// ---------------------------------------------------------------
// plain words for every answer the server can give

export const WORDS = {
  off: 'Game saves are switched off.',
  offline: "Couldn't reach her server. Nothing was changed.",
  failed: 'Something went wrong. Nothing was changed.',
  gone: 'That save is gone already.',
  damaged: "That save is damaged and can't be loaded.",
  full: 'There are too many saves. Delete one you don\'t need first.',
  too_big: 'That save is too big.',
  not_a_save: "That file isn't a Jun game save.",
  newer: 'That save comes from a newer version of Jun. Update her first, then try again.',
  reloaded: 'A different game was loaded in another window. This one reloads now.',
  nothing_to_undo: 'There is nothing to undo.',
  no_name: 'A save needs a name.',
  bad_name: 'That name can\'t be used.',
  bad_kind: 'That kind of save can\'t be made here.',
  unknown_action: 'Something went wrong. Nothing was changed.',
  too_soon: 'Saved a moment ago already.',
  not_json: "That file isn't a Jun game save.",
};
export const say = (code) => WORDS[code] || WORDS.failed;

async function post(body) {
  try {
    const res = await apiJson('gamesave.php', body);
    const j = await res.json().catch(() => ({}));
    if (j.view) { view = j.view; epoch = j.view.live?.epoch ?? epoch; }
    if (!res.ok) {
      if (j.error === 'reloaded') { epoch = j.epoch ?? epoch; broadcast({ type: 'loaded', why: 'elsewhere', epoch }); }
      return { error: j.error || (res.status === 404 ? 'off' : 'failed'), ...j };
    }
    return { ...(j.result || {}), file: j.file, view: j.view };
  } catch (e) {
    return { error: 'offline' };
  }
}

// ---------------------------------------------------------------
// the live game

// { live: { epoch, played, sections (names → bytes), canUndo, lastLoad }, saves: [...], limits, bond }
export async function load() {
  try {
    const res = await api('gamesave.php');
    if (res.status === 404) return { off: true };
    const j = await res.json();
    view = j; epoch = j.live?.epoch ?? epoch;
    return j;
  } catch (e) { return { error: 'offline' }; }
}

export async function section(name) {
  try {
    const res = await api('gamesave.php?section=' + encodeURIComponent(name));
    if (res.status === 404) return { off: true, data: null };
    const j = await res.json();
    if (!res.ok) return { error: j.error || 'failed', data: null };
    epoch = j.epoch;
    return j;
  } catch (e) { return { error: 'offline', data: null }; }
}

// write sections ({ name: data, gone: null }) with the epoch this page read; a different game loaded meanwhile → 'reloaded'
export const put = (sections, { epoch: ep = epoch } = {}) => post({ action: 'put', sections, ...(ep == null ? {} : { epoch: ep }) });

// ---------------------------------------------------------------
// slots

export const autosaveOn = () => { try { return storage?.getItem(AUTOSAVE_KEY) !== 'false'; } catch (e) { return true; } };

export const save = (name) => post({ action: 'save', kind: 'named', name: String(name || ''), client: collect() });
export const quicksave = () => post({ action: 'save', kind: 'quick', client: collect() });
// an autosave (at most one every half minute, unless forced); off in Settings = nothing happens
export async function autosave(reason = '', { force = false } = {}) {
  if (!autosaveOn()) return { skipped: 'off' };
  return post({ action: 'save', kind: 'auto', name: '', reason: String(reason).slice(0, 80), client: collect(), force });
}

// a desktop save point first (her whole self), when the desktop app is there; never blocks the load if it isn't
async function savePointFirst(name) {
  const D = globalThis.junDesktop;
  if (!D?.saves) return { skipped: 'no desktop app' };
  try { const r = await D.saves('save', name); return r?.ok ? { ok: true } : { error: r?.error || 'failed' }; }
  catch (e) { return { error: 'failed' }; }
}

function afterLoad(r, type) {
  if (r.error) return r;
  restore(r.client);
  if (r.epoch) epoch = r.epoch;
  broadcast({ type, epoch: r.epoch, bond: r.bond ? { stage: r.bond.stage, name: r.bond.name } : null });
  return r;
}

// load a slot. useBond = "Use this save's bond" (off by default)
export async function loadSave(id, { useBond = false } = {}) {
  let point = null;
  if (useBond) {
    point = await savePointFirst("Before a game save's bond");
    if (point.error) return { error: 'savepoint', why: point.error };
  }
  return { ...afterLoad(await post({ action: 'load', id, useBond: !!useBond, client: collect() }), 'loaded'), savePoint: point };
}
export const undo = async () => afterLoad(await post({ action: 'undo', client: collect() }), 'loaded');
export const newGame = async () => afterLoad(await post({ action: 'new', client: collect() }), 'loaded');
export const keep = (id) => post({ action: 'keep', id });
export const rename = (id, name) => post({ action: 'rename', id, name: String(name || '') });
export const remove = (id) => post({ action: 'delete', id });

// ---------------------------------------------------------------
// files

export function fileName(name, when = Date.now()) {
  const base = String(name || 'Jun game save').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Jun game save';
  const d = new Date(when);
  const pad = (n) => String(n).padStart(2, '0');
  return `${base} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${FILE_EXT}`;
}

// → { file, fileName } (the file's content as an object)
export async function exportSave(id) {
  const r = await post({ action: 'export', id });
  if (r.error) return r;
  return { file: r.file, fileName: fileName(r.file?.name, (r.file?.saved || 0) * 1000 || Date.now()) };
}

// save it as a file the browser downloads (the desktop app asks where)
export async function download(id) {
  const r = await exportSave(id);
  if (r.error) return r;
  const blob = new Blob([JSON.stringify(r.file)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = r.fileName;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return { ok: true, fileName: r.fileName };
}

// a File (from a picker or a drop) or its text → a NEW named save; never loaded on its own
export async function importFile(fileOrText) {
  let text = fileOrText;
  if (fileOrText && typeof fileOrText.text === 'function') {
    if (fileOrText.size > 4.5 * 1024 * 1024) return { error: 'too_big' };
    text = await fileOrText.text();
  }
  let file;
  try { file = JSON.parse(String(text)); } catch (e) { return { error: 'not_json' }; }
  return post({ action: 'import', file });
}

// ---------------------------------------------------------------
// the play clock: while a game page is on screen, a tick a minute (her server counts no more than real time)

let clock = null;
let since = 0;
export function startClock(doc = globalThis.document) {
  if (clock) return;
  since = Date.now();
  const tick = () => {
    if (doc && doc.visibilityState === 'hidden') { since = Date.now(); return; }
    const s = Math.round((Date.now() - since) / 1000);
    since = Date.now();
    if (s > 0) post({ action: 'tick', seconds: s });
  };
  clock = setInterval(tick, CLOCK_SEC * 1000);
  try { doc?.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') since = Date.now(); else tick(); }); } catch (e) { /* no document */ }
}
export function stopClock() {
  if (!clock) return;
  clearInterval(clock); clock = null;
  const s = Math.round((Date.now() - since) / 1000);
  if (s > 0) post({ action: 'tick', seconds: s });
}

// ---------------------------------------------------------------
// a save card in words: "Port Buffer · Act 1 · 3 h 20 min played · Friend"

export function playedWords(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 1) return 'just started';
  if (m < 60) return `${m} min played`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min played` : `${h} h played`;
}
export function cardLine(s) {
  const sum = s.summary || {};
  return [sum.place, sum.chapter, sum.difficulty, playedWords(s.played)].filter(Boolean).join(' · ');
}
