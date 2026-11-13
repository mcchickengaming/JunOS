// core feel (#27): her inside state, shared by every page of hers (the desktop, her window,
// the settings home, the feel lab). One plain JSON in localStorage 'jun.feel', so it rides
// along in save points (the desktop app's Local Storage) and every window sees the same Jun.
//
// Nothing here ticks: every value is kept with the time it was true and moved forward lazily
// when someone reads it (needs.js, tired.js). So she keeps living while no window is open.
//
// No DOM. Tests swap the storage and the clock (setStorage, setClock).

export const KEY = 'jun.feel';
export const VERSION = 1;

let storage = (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })();
let memory = null; // when there's no localStorage (tests, private mode)
let clock = () => Date.now();

export function setStorage(s) { storage = s; cache = null; memory = null; }
export function setClock(fn) { clock = fn || (() => Date.now()); }
export const now = () => clock();

const fresh = () => ({
  v: VERSION,
  // one random number per install: her own favorites and her own pace (tired.js, needs.js)
  seed: Math.floor(Math.random() * 2 ** 31),
  born: clock(),
  needs: null,     // needs.js
  tired: {},       // tired.js: kind -> { load, at }
  hist: [],        // the last events: [at, type, kind, ms]
  repeat: {},      // repeat.js: channel -> [[id, at]...] (only the channels worth keeping)
  marks: {},       // one-off flags: kind -> the state she last told about (tired.js)
  use: {},         // what he's given her these days: kind -> { n, at } (tired.js, fades over days)
  init: null,      // initiative.js: her wants, what she's learned he likes, what she started lately
});

let cache = null, cacheAt = 0, dirty = false, saveT = null;

function read() {
  try {
    const raw = storage ? storage.getItem(KEY) : memory;
    const s = raw ? JSON.parse(raw) : null;
    if (s && s.v === VERSION) return { ...fresh(), ...s };
  } catch (e) { /* broken: start fresh */ }
  return null;
}

// the state, at most 250 ms old (another window may have changed it)
export function get() {
  const t = clock();
  if (!cache || (!dirty && t - cacheAt > 250)) {
    const r = read();
    if (r) cache = r;
    else { cache = cache || fresh(); save(); } // the first time: write it, so every window shares one seed
    cacheAt = t;
  }
  return cache;
}

// change it; written out soon (several changes in a burst = one write)
export function change(fn) {
  const s = get();
  fn(s);
  dirty = true;
  if (!saveT) saveT = setTimeout(flush, 400);
  return s;
}
export function flush() {
  clearTimeout(saveT); saveT = null;
  if (!cache) return;
  const raw = JSON.stringify(cache);
  try { if (storage) storage.setItem(KEY, raw); else memory = raw; } catch (e) { memory = raw; }
  dirty = false;
  cacheAt = clock();
}
function save() { dirty = true; flush(); }

// for the feel lab: start her inside state over (keeps nothing)
export function reset({ keepSeed = true } = {}) {
  const seed = get().seed;
  cache = fresh();
  if (keepSeed) cache.seed = seed;
  save();
}

// another window changed it: drop the cache (only browsers have this)
try {
  globalThis.addEventListener?.('storage', (e) => { if (e.key === KEY && !dirty) cache = null; });
  globalThis.addEventListener?.('pagehide', () => { if (dirty) flush(); });
} catch (e) { /* not a browser */ }

// a small, stable random number from the seed and some words (her favorites, her pace)
export function hash01(...parts) {
  let h = 2166136261 ^ (get().seed >>> 0);
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}
