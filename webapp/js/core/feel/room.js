// reading the room (#4, interjection etiquette): how free he looks right now, 0..1, and how loud
// she may be (the highest step of the ladder in initiative.js). She never jumps in while he's
// busy: typing gets hints only, quiet hours and quiet mode get her body only, and when nobody is
// there she doesn't perform for an empty room.
//
// Until her senses exist (#3) she can't see games, videos or calls. She goes by what she can
// tell: how long since any input, whether it's the mouse or the keys, and how her last try went.
// setSenses() is the door her senses will use.
//
// No DOM. The desktop page feeds a tracker every few seconds; read() is pure.

import { TUNE } from './tune.js?v=5';

export const WHY = {
  away: 'you\'re away', quietMode: 'quiet mode is on', quietHours: 'it\'s your quiet hours',
  fullscreen: 'you\'re in something fullscreen', call: 'you\'re in a call', video: 'you\'re watching something',
  typing: 'you\'re typing', still: 'you\'ve gone quiet', busy: 'you look busy', back: 'you just got back',
  free: 'you look free',
};

// what her senses know (#3): { fullscreen, call, video }. Nothing yet
let senses = null;
export function setSenses(s) { senses = s || null; }
export const sensesNow = () => senses;

// is this hour inside his quiet hours? from === to means none
export function inQuietHours(hour, from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

// keeps what a single look can't tell: for how long it's been keys without the mouse, how much the
// mouse has been moving, and when he came back. feed({ now, idleSec, cursorAt }) every few seconds
export function tracker() {
  let typingSince = 0, awaySince = 0, backAt = 0, awayMs = 0, last = 0;
  const moves = []; // [at, moved]
  return {
    feed({ now, idleSec = 0, cursorAt = 0 }) {
      const R = TUNE.room;
      const step = last ? Math.min(30000, now - last) : 4000;
      last = now;
      const input = idleSec * 1000 < step + 1500;       // something was pressed or moved just now
      const mouse = now - cursorAt < step + 1500;       // ...and it was the mouse
      if (input && !mouse) { if (!typingSince) typingSince = now; } else if (mouse || idleSec > 6) typingSince = 0;
      moves.push([now, mouse ? 1 : 0]);
      while (moves.length && now - moves[0][0] > 30000) moves.shift();
      if (idleSec >= R.awaySec) { if (!awaySince) awaySince = now - idleSec * 1000; }
      else if (awaySince) { backAt = now; awayMs = now - awaySince; awaySince = 0; }
      return this.now(now, idleSec);
    },
    now(now, idleSec = 0) {
      return {
        idleSec,
        typingMs: typingSince ? now - typingSince : 0,
        busyShare: moves.length >= 4 ? moves.reduce((a, m) => a + m[1], 0) / moves.length : 0,
        backAgoMs: backAt ? now - backAt : Infinity,
        awayMs,
      };
    },
  };
}

// read(input) → { a (0..1, how free he is), cap (highest ladder step, 0 = nothing at all), why
//   (a key of WHY), away, justBack, awayMs }
//   input: { idleSec, typingMs, busyShare, backAgoMs, awayMs, quietMode, quietHours,
//            lastTryAgoMs, lastOutcome, senses }
export function read(inp = {}) {
  const R = TUNE.room;
  const s = inp.senses === undefined ? senses : inp.senses;
  const out = (a, cap, why, extra = {}) => ({ a: Math.max(0, Math.min(1, a)), cap, why, away: false, justBack: false, awayMs: inp.awayMs || 0, ...extra });
  if ((inp.idleSec || 0) >= R.awaySec) return out(0, 0, 'away', { away: true });
  // never during these: her body only, silent
  if (s?.fullscreen) return out(0.1, 1, 'fullscreen');
  if (s?.call) return out(0.1, 1, 'call');
  if (s?.video) return out(0.15, 1, 'video');
  if (inp.quietMode) return out(0.15, 1, 'quietMode');
  if (inp.quietHours) return out(0.15, 1, 'quietHours');
  let r;
  if ((inp.backAgoMs ?? Infinity) < R.backSec * 1000) r = out(0.9, 3, 'back', { justBack: true });
  else if ((inp.typingMs || 0) >= R.typingMs) r = out(0.3, 2, 'typing');
  else if ((inp.idleSec || 0) >= R.stillSec) r = out(0.4, 2, 'still');
  else if ((inp.busyShare || 0) >= R.busyShare) r = out(0.4, 2, 'busy');
  else r = out(1, 5, 'free');
  // how her last try went: ignored = she holds back for a while; a warm answer = a little bolder
  if (inp.lastOutcome === 'ignored' && (inp.lastTryAgoMs ?? Infinity) < R.afterIgnoredMin * 60e3) r.a *= R.afterIgnored;
  return r;
}
