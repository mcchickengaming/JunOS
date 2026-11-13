// she sees his hand coming (#27, the composer's anticipation): before a touch lands, when the
// cursor closes in on one of her spots, she notices. Her eyes go to the hand; then, by bond, mood,
// her favorites, what she needs and how much she's had: a lean in, a small flinch, bracing, or
// guarding the spot she's had enough of. It's only her body (no words, no waiting on her brain),
// so it shows on the very next frame.
//
// No DOM. desktop.js measures (how far the hand is from the nearest spot, how fast it's coming),
// this decides, feelbody.js shows it.

import * as Store from './store.js?v=4';
import { TUNE } from './tune.js?v=5';
import * as Tired from './tired.js?v=4';
import * as Repeat from './repeat.js?v=4';
import * as K from './kinds.js?v=2';

export const TYPES = ['notice', 'leanin', 'perk', 'flinch', 'blink', 'brace', 'guard'];
export const TYPE_WORDS = {
  notice: 'her eyes go to your hand', leanin: 'she leans in', perk: 'her ears perk up', flinch: 'a small flinch',
  blink: 'a blink', brace: 'she braces a little', guard: 'she guards the spot',
};

// the spot's kind as a touch kind (a hand over her side is going to be a tickle)
const AS_KIND = { feet: 'footrub', cheek: 'poke.cheek', nose: 'poke.nose', shoulder: 'poke.shoulder', body: 'hug' };
export const kindOfSpot = (spot) => AS_KIND[spot] || spot;

let lastAt = 0, lastSeen = { at: 0, spot: null };
// did she see a hand coming at this spot within the last ms? (the composer: no surprise then)
export function sawComing(ms = TUNE.moment.sawItComingMs, t = Store.now()) { return t - lastSeen.at <= ms; }
export function forget() { lastAt = 0; lastSeen = { at: 0, spot: null }; }

// decide(input) → null (nothing this time) or { type, power 0..1, side, spot, why: [words] }
//   input: { spot, dist (her heights from the spot's edge, 0 = on it), closing (her heights a second,
//            > 0 = coming closer), side (-1 hand left of her face, 1 right), ctx: { stage, mood },
//            needs, busy (a touch is going on / she's asleep, carried, walking), lastTouchMs, rand, dry }
export function decide({ spot, dist = 0, closing = 0, side = 0, ctx = {}, needs = {}, busy = false, lastTouchMs = Infinity, rand = Math.random, dry = false }) {
  const A = TUNE.approach, t = Store.now();
  if (busy || !spot) return null;
  if (dist > A.near || closing < A.minClosing) return null;
  if (!dry && (t - lastAt < A.everyMs || lastTouchMs < A.afterTouchMs)) return null;
  if (!dry && rand() > A.chance) { lastAt = t - A.everyMs * 0.5; return null; }

  const stage = Math.max(1, Math.min(6, Math.round(ctx.stage || 3)));
  const close = stage <= 2 ? 1 : stage === 3 ? 2 : 3;
  const kind = kindOfSpot(spot);
  const tctx = { mood: ctx.mood, needs };
  const fav = Tired.fav(kind, tctx);
  const tired = Tired.state(kind, tctx);
  const sudden = closing >= A.fast;
  const down = ctx.mood === 'upset' || ctx.mood === 'scared' || ctx.mood === 'nervous';
  const why = [];
  let pool;

  if (tired === 'enough' || tired === 'sore') {
    pool = [{ id: 'guard', w: 3 }, { id: 'notice', w: 1 }];
    why.push('she\'s had enough of that for now');
  } else if (sudden) {
    // a hand coming fast: the less she knows him, the bigger the start
    pool = close === 1 ? [{ id: 'flinch', w: 4 }, { id: 'brace', w: 1 }]
      : close === 2 ? [{ id: 'flinch', w: 2 }, { id: 'blink', w: 2 }, { id: 'perk', w: 1 }]
        : [{ id: 'blink', w: 3 }, { id: 'perk', w: 2 }, { id: 'flinch', w: down ? 2 : 0.5 }];
    why.push('your hand came fast');
  } else if (close === 1) {
    pool = [{ id: 'brace', w: 3 }, { id: 'notice', w: 2 }, { id: 'flinch', w: down ? 2 : 0 }];
    why.push('she doesn\'t know you well yet');
  } else {
    // a hand coming gently, and she knows him: is it welcome?
    const wanted = (K.isWarm(kind) && (needs.affection || 0) >= 0.5) || (K.isPlay(kind) && (needs.play || 0) >= 0.5)
      || (needs.attention || 0) >= 0.6;
    const welcome = (K.isWarm(kind) || fav >= 1.1 || wanted) && !(down && close === 2 && !K.isWarm(kind));
    const lean = welcome ? A.leanInChance * (close === 3 ? 1.2 : 0.7) * Math.min(1.3, fav) * (wanted ? 1.3 : 1) : 0;
    pool = [{ id: 'leanin', w: 4 * lean }, { id: 'perk', w: 1.5 }, { id: 'notice', w: 2 }];
    if (K.isPlay(kind) && !welcome) pool.push({ id: 'brace', w: 2 });
    if (fav >= 1.15) why.push('one of her favorites is coming');
    if (wanted) why.push('she was hoping for this');
    if (tired === 'plenty') { pool = pool.map(x => (x.id === 'leanin' ? { ...x, w: x.w * 0.3 } : x)); why.push('she\'s had plenty of it'); }
  }
  const type = Repeat.pick('approach', pool, { note: !dry, rand });
  if (!type) return null;
  if (!dry) { lastAt = t; lastSeen = { at: t, spot }; }
  // how much: the bond opens her up, a favorite and a want add, speed adds to a start
  let power = 0.35 + 0.08 * stage;
  if (type === 'leanin') power += 0.15 * (fav - 1) + 0.15 * Math.max(needs.affection || 0, needs.attention || 0);
  if (type === 'flinch' || type === 'blink') power = 0.4 + Math.min(0.5, (closing - A.fast) / Math.max(0.1, A.fast) * 0.5) + (close === 1 ? 0.15 : 0);
  why.unshift(TYPE_WORDS[type]);
  return { type, power: Math.max(0.15, Math.min(1, power)), side: Math.sign(side) || 0, spot, kind, why };
}
