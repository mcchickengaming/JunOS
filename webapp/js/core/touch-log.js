// what Anon's hands have been up to, for her server (api/touch.php,
// lib/touch.php). her desktop app and her main window both log here.
// a tap is one touch (a poke, a boop); a begin/end pair is a touch
// that lasts (a headpat, a hand-hold), counted once with how long it
// went on. slots let two hands go at once ('rub', 'hold', 'pin').
// batches ride along with the next chat turn (chat-api.js), or go on
// their own every 20 s, so the reply he's waiting for already knows.
import { apiJson } from './api.js?v=1';

const FLUSH_MS = 20000;
// a mouse that only brushes past her for a moment isn't a touch
const MIN_MS = 350;

let queue = {};
const slots = {};
let last = null;
let timer = null;

function add(kind, n, ms) {
  const q = queue[kind] || (queue[kind] = { kind, n: 0, ms: 0 });
  q.n += n;
  q.ms += Math.round(ms);
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

export function tap(kind) {
  if (!kind) return;
  add(kind, 1, 0);
  last = { kind, at: Date.now() };
}

export function begin(slot, kind) {
  if (!kind) return;
  if (slots[slot]?.kind === kind) return;
  end(slot);
  slots[slot] = { kind, at: Date.now() };
}

export function end(slot) {
  const s = slots[slot];
  if (!s) return;
  delete slots[slot];
  const ms = Date.now() - s.at;
  if (ms < MIN_MS) return;
  add(s.kind, 1, ms);
  last = { kind: s.kind, at: Date.now() };
}

// a hand left in place (Shift / right-click on the desktop) keeps going
export function move(from, to) {
  if (!slots[from]) return;
  end(to);
  slots[to] = slots[from];
  delete slots[from];
}

// what his hands are doing as he sends a message
export function now() {
  const ongoing = [...new Set(Object.values(slots).map(s => s.kind))];
  return { ongoing, last: last?.kind || null, ago: last ? Math.round((Date.now() - last.at) / 1000) : 0 };
}

// everything finished since the last send. touches still going on are
// counted when they end; now() tells her about them meanwhile
export function takeBatch() {
  const out = Object.values(queue);
  queue = {};
  clearTimeout(timer);
  timer = null;
  return out;
}

export function flush(keepalive = false) {
  const touches = takeBatch();
  if (!touches.length) return Promise.resolve();
  return apiJson('touch.php', { touches, tz: -new Date().getTimezoneOffset() }, keepalive ? { keepalive: true } : {})
    .catch(() => {});
}

// closing the window: whatever's in hand still counts
globalThis.window?.addEventListener('pagehide', () => {
  for (const slot of Object.keys(slots)) end(slot);
  flush(true);
});
