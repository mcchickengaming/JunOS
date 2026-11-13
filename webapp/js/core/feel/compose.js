// the reaction composer (#27). ONE place where everything that shapes a reaction meets:
// touch × how it's done × feeling × mood × bond × what just happened × how much she's had ×
// her needs × her own favorites → one reaction. moods.js calls it for every touch (holds and rubs
// every 120 ms, pokes and combos once), so the same touch never plays out the same twice.
//
// ---------------------------------------------------------------------------------------------
// THE CONTRACT (keep it; everything else plugs into it):
//   compose(input) → reaction
//   input:    { kind, how: 'hold'|'poke'|'combo', ms, seed, base: { feeling, power }, ctx: { stage, mood }, slot }
//             base = what moods.js feelingFor() says on its own (the touch's table, bond, mood, length)
//   reaction: { feeling, power, tired: 'fresh'|'enjoying'|'plenty'|'enough'|'sore', fav, why: [plain words] }
//             feeling is one of moods.js FEELINGS; power 0..1. why: for the feel lab ("tired of it: plenty").
// ---------------------------------------------------------------------------------------------
//
// THIS IS THE BASELINE (Nov 13, on Opus): simple, readable rules so everything around it can be
// built and tested. The full composer (Fable): anticipation (she notices the hand coming), how it's
// done (speed, depth, area), what just happened (a change of touch, a combo, a surprise), the
// session phase, variety in which body reaction / effect / line type plays, and the ~100 ms
// visible reaction before any text. Replace the body of compose(); keep the contract.

import * as Tired from './tired.js?v=2';
import * as Needs from './needs.js?v=2';
import * as K from './kinds.js?v=2';

let needsOn = true;
export function setNeedsOn(on) { needsOn = !!on; }

const DOWN = { loves: 'likes', likes: 'flustered', giggly: 'flustered', secret: 'flustered', comforted: 'likes' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function compose({ kind, how = 'hold', ms = 0, seed = 0.5, base, ctx = {} }) {
  if (!base) return null;
  const why = [];
  const needs = needsOn ? Needs.levels() : {};
  const pending = how === 'hold' ? Tired.loadFor(kind, ms) : 0;
  const tctx = { mood: ctx.mood, needs, pending };
  const fav = Tired.fav(kind, tctx);
  const tired = Tired.state(kind, tctx);
  let { feeling, power } = base;

  // how much she's had already: diminishing returns first, then "that's enough for now"
  const f = Tired.factor(kind, tctx);
  power *= f;
  if (f < 1) why.push('tired of it: ' + Tired.STATE_WORDS[tired].toLowerCase());
  if (tired === 'plenty' && feeling === 'loves') { feeling = 'likes'; why.push('loves → likes'); }
  if (tired === 'enough' && DOWN[feeling]) { why.push(feeling + ' → ' + DOWN[feeling]); feeling = DOWN[feeling]; }
  if (tired === 'sore') { feeling = 'notready'; why.push('sore'); }

  // her own favorites (and the moment's nudge on them)
  power *= 0.85 + 0.15 * fav;
  if (fav >= 1.15) why.push('one of her favorites');
  else if (fav <= 0.85) why.push('not her favorite');
  if (fav >= 1.2 && feeling === 'likes' && (ctx.stage || 3) >= 4 && tired !== 'enough' && seed < (fav - 1.15) * 3) {
    feeling = 'loves'; why.push('likes → loves (favorite)');
  }

  // what she needs right now: a touch that gives it lands better
  if (needsOn) {
    if (K.isWarm(kind) && needs.affection >= 0.5) { power += 0.1 * needs.affection; why.push('she wanted affection'); }
    if (K.isPlay(kind) && needs.play >= 0.5) { power += 0.1 * needs.play; why.push('she wanted to play'); }
    if (K.isPlay(kind) && needs.rest >= 0.75 && feeling === 'giggly') { power *= 0.85; why.push('too sleepy for this'); }
  }
  return { feeling, power: clamp01(Math.max(0.08, power)), tired, fav, why };
}
