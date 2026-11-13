// the repeat watcher (#27): she remembers what she just did, said and showed, per kind of thing
// (channel: line, emote, idle, piece, reaction, thought), and pushes down anything repeated, so
// after hundreds of hours she still doesn't feel like a loop. Shared by every window (store.js).
//
// The exception (owner, Nov 11): some repeats are natural inside one moment, like building
// intensity or teasing ("kiss me, kiss me"). Items tagged okBuild ("OK to repeat while building
// up") pass freely while that moment is open: build(id, ms) opens it, it closes by itself.

import * as Store from './store.js?v=4';
import { TUNE } from './tune.js?v=5';

let enabled = true;
export function setEnabled(on) { enabled = !!on; }

let building = null; // { id, until }
export function build(id, ms = 8000) { building = { id, until: Store.now() + ms }; }
export function endBuild(id) { if (!id || building?.id === id) building = null; }
export function isBuilding() { return !!building && Store.now() < building.until; }

const forgetMs = (ch) => (TUNE.repeat.forget[ch] ?? 300) * 1000;
const idOf = (x) => (x && typeof x === 'object' ? x.id : x);

// she did / said / showed it
export function note(ch, id) {
  if (id == null || id === '') return;
  const t = Store.now();
  Store.change(s => {
    const list = (s.repeat[ch] || []).filter(([, at]) => t - at < forgetMs(ch));
    list.push([String(id), t]);
    s.repeat[ch] = list.slice(-Math.max(1, TUNE.repeat.keep));
  });
}

// how much of a repeat it would be: 0 (fresh) .. 1 (just did exactly that)
export function penalty(ch, id) {
  if (!enabled || id == null) return 0;
  const t = Store.now();
  const list = Store.get().repeat[ch] || [];
  const key = String(id);
  let p = 0;
  for (let i = list.length - 1, pos = 0; i >= 0; i--, pos++) {
    const [lid, at] = list[i];
    const age = t - at;
    if (age >= forgetMs(ch)) continue;
    if (lid !== key) continue;
    // the most recent one counts most; older ones and older positions fade
    const byTime = 1 - age / forgetMs(ch);
    const byPos = 1 / (1 + pos * 0.5);
    p = Math.max(p, byTime * byPos);
  }
  return p;
}

// pick one, pushing repeats down. items: ids, or { id, w, okBuild }. Notes the pick.
// opts: { note: false } to only look, { rand } for tests
export function pick(ch, items, { note: doNote = true, rand = Math.random } = {}) {
  const list = (items || []).map(x => (typeof x === 'object' && x ? { w: 1, ...x } : { id: x, w: 1 })).filter(x => x.w > 0);
  if (!list.length) return null;
  const free = isBuilding();
  const ws = list.map(x => {
    if (free && x.okBuild) return x.w;
    return x.w * (1 - TUNE.repeat.strength * penalty(ch, x.id));
  });
  let total = ws.reduce((a, b) => a + b, 0);
  let i = 0;
  if (total <= 1e-9) {
    // everything is a repeat: take the oldest one
    i = list.map((x, j) => [penalty(ch, x.id), j]).sort((a, b) => a[0] - b[0])[0][1];
  } else {
    let r = rand() * total;
    for (i = 0; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
  }
  const got = list[i];
  if (doNote) note(ch, got.id);
  return idOf(got);
}

// what she's done lately on a channel (newest last), for the lab and her prompt
export function recent(ch, n = 8) {
  const t = Store.now();
  return (Store.get().repeat[ch] || []).filter(([, at]) => t - at < forgetMs(ch)).slice(-n).map(([id]) => id);
}
export function channels() { return Object.keys(Store.get().repeat); }
export function clear() { Store.change(s => { s.repeat = {}; }); building = null; }
