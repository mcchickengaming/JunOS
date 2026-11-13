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
//             optional: manner (manner.js read(): how the rub is being done), dry (true = only
//             look: nothing is remembered; the feel lab, previews), force ({ moment: [...], phase }
//             instead of working them out: the feel lab's "what if")
//   reaction: { feeling, power, tired: 'fresh'|'enjoying'|'plenty'|'enough'|'sore', fav, why: [plain words] }
//             feeling is one of moods.js FEELINGS; power 0..1. why: for the feel lab ("tired of it: plenty").
//             plus HOW IT PLAYS OUT (all optional for whoever reads it; without them moods.js and
//             feelbody.js do what they always did):
//               manner   'gentle'|'even'|'rough'|'still'|null
//               moment   tags of what just happened: change, combo, surprise, insist, toomuch, melt,
//                        and the session phase (greeting, peak, winddown, afterglow)
//               variant  which way her body shows the feeling (VARIANTS below; feelbody.js plays it)
//               line     the kind of thing she'd say: tease|shy|comfort|excited|pout|curious
//               pieces   { piece: weight × } which effect pieces are likelier (moods.js PIECES)
//               ripple   { shape?, motion? } or null: her own ripple this time ("let her pick")
//               tempo    × on the time between her effects (over 1 = calmer, under 1 = quicker)
//               delay    ms before a poke's effects (a shy beat)
// ---------------------------------------------------------------------------------------------
//
// How it's built: small layers, in this order, each adding its reason to `why`:
//   1 had       how much she's had already (tired.js): diminishing returns, then "enough for now"
//   2 favorite  her own favorites, and the moment's nudge on them
//   3 needs     what she wants right now: a touch that gives it lands better
//   4 manner    how it's done: slow and gentle melts her, fast and scrubby tickles, too much = a pout
//   5 moment    what just happened: a change of touch, a combo's glow, a surprise, doing it again
//               right after "enough", and where the time together is (greeting, peak, afterglow)
//   6 variety   how it plays out: body variant, line type, effect pieces, ripple, timing, picked
//               with the repeat watcher so the same reaction doesn't come twice in a row
// Every number is in tune.js (needs / tired / manner / moment / variety).

import * as Store from './store.js?v=4';
import { TUNE } from './tune.js?v=5';
import * as Tired from './tired.js?v=4';
import * as Needs from './needs.js?v=4';
import * as Repeat from './repeat.js?v=4';
import * as Session from './shape.js?v=4';
import * as Approach from './approach.js?v=3';
import * as K from './kinds.js?v=2';

let opts = { needs: true, manner: true, variety: true };
export function setOptions(o) { opts = { ...opts, ...o }; }
export function setNeedsOn(on) { opts.needs = !!on; }
export const options = () => ({ ...opts });

export const LINE_TYPES = ['tease', 'shy', 'comfort', 'excited', 'pout', 'curious'];
// for her prompt: the tone of her next line about a touch (a tone, never the words)
export const LINE_WORDS = {
  tease: 'a little teasing', shy: 'shy about it', comfort: 'soft and at ease', excited: 'bright and happy',
  pout: 'a playful pout', curious: 'curious about him',
};

// the ways her body can show each feeling. 'plain' is the one she always had; feelbody.js plays
// the others (a test checks it knows every id). w = how likely next to the other ways; tags =
// what makes it likelier (see variety())
export const VARIANTS = {
  notready: [{ id: 'shrink', w: 1, tags: ['lowbond', 'toomuch'] }, { id: 'freeze', w: 1, tags: ['surprise'] }],
  flustered: [{ id: 'down', w: 1, tags: ['insist', 'toomuch', 'calm'] }, { id: 'peek', w: 1, tags: ['bright', 'surprise'] }],
  likes: [{ id: 'drowsy', w: 1, tags: ['calm'] }, { id: 'bright', w: 1, tags: ['bright'] }],
  loves: [{ id: 'melt', w: 1.2, tags: ['calm'] }, { id: 'sparkle', w: 1, tags: ['bright'] }],
  giggly: [{ id: 'squirm', w: 1, tags: ['bright', 'rough'] }],
  secret: [{ id: 'pout', w: 1, tags: ['insist', 'rough'] }, { id: 'slip', w: 1, tags: ['calm', 'bright'] }],
  comforted: [{ id: 'nuzzle', w: 1, tags: ['calm'] }],
};
// what she'd say, by feeling: [type, weight]
const LINES = {
  notready: [['pout', 2], ['shy', 3]],
  flustered: [['shy', 3], ['pout', 1.5], ['curious', 1]],
  likes: [['curious', 2], ['tease', 2], ['shy', 1], ['comfort', 1]],
  loves: [['excited', 3], ['tease', 2], ['comfort', 1.5]],
  giggly: [['tease', 3], ['excited', 2]],
  secret: [['pout', 3], ['shy', 2], ['tease', 1]],
  comforted: [['comfort', 4], ['shy', 1]],
};
// her ripple for a feeling, when she picks her own
const RIPPLES = {
  notready: [{ motion: 'shaky' }], flustered: [{ motion: 'wavy' }, { motion: 'pulse' }],
  likes: [{ shape: 'sparkle' }], loves: [{ shape: 'heart' }, { shape: 'heart', motion: 'burst' }],
  giggly: [{ shape: 'star', motion: 'burst' }, { shape: 'star', motion: 'spin' }],
  secret: [{ shape: 'heart', motion: 'wavy' }], comforted: [{ shape: 'heart', motion: 'pulse' }],
};

const DOWN = { loves: 'likes', likes: 'flustered', giggly: 'flustered', secret: 'flustered', comforted: 'likes' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const closeOf = (stage) => (stage <= 2 ? 1 : stage === 3 ? 2 : 3);
// a steady random number from a touch's seed and a word, so a touch keeps its mind
function seeded(seed, salt) {
  let h = 2166136261 ^ Math.floor((seed || 0) * 4294967295);
  for (const ch of String(salt)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function seededRand(seed, salt) { let i = 0; return () => seeded(seed, salt + ':' + (i++)); }

// ---------------------------------------------------------------------------------------------
// what just happened (from her history, store.js hist; a touch still going on isn't in it yet)

export function whatJustHappened(kind, how = 'hold', ms = 0, force = null) {
  const M = TUNE.moment, t = Store.now();
  const phase = force?.phase || Session.phase(t);
  if (force?.moment) return { tags: new Set(force.moment), phase, awayMs: force.awayMs ?? 3 * 3600e3 };
  const s = Store.get(), hist = s.hist, tags = new Set();
  let last = null, lastCombo = null, lastSame = null, lastAny = null;
  for (let i = hist.length - 1; i >= 0; i--) {
    const [at, type, k] = hist[i];
    if (t - at > 30 * 60e3) break;
    if (!lastAny && (type === 'touch' || type === 'combo' || type === 'toss')) lastAny = hist[i];
    if (!last && type === 'touch') last = hist[i];
    if (!lastCombo && type === 'combo') lastCombo = hist[i];
    if (!lastSame && k === kind) lastSame = hist[i];
    if (last && lastCombo && lastSame) break;
  }
  // a change of touch: something else just before, and this one only just began
  if (how !== 'combo' && last && t - last[0] <= M.changeWithinSec * 1000 && K.groupOf(last[2]) !== K.groupOf(kind) && ms < 6000) tags.add('change');
  if (how !== 'combo' && lastCombo && t - lastCombo[0] <= M.comboGlowSec * 1000) tags.add('combo');
  // out of nowhere: nothing for a while, then a sudden touch she didn't see coming
  const quiet = !lastAny || t - lastAny[0] >= M.surpriseAfterMin * 60e3;
  if (quiet && (how === 'poke' || (how === 'hold' && ms < 700)) && !Approach.sawComing(M.sawItComingMs, t)) tags.add('surprise');
  // she said "enough", and here it is again
  const mark = (s.marks || {})[kind];
  if ((mark === 'enough' || mark === 'sore') && lastSame && t - lastSame[0] <= M.insistSec * 1000) tags.add('insist');
  return { tags, phase, awayMs: phase === 'greeting' ? Session.start(t).awayMs : 0 };
}

// ---------------------------------------------------------------------------------------------
// a touch keeps its mind: what was picked for it (its body variant, its tempo) stays for as long
// as it goes on, and only changes when the situation does (she melts, it gets too much)

const plans = new Map(); // seed -> { at, key, picks }
function planFor(seed) {
  const t = Store.now();
  for (const [k, p] of plans) if (t - p.at > 60e3 || t < p.at) plans.delete(k);
  let p = plans.get(seed);
  if (!p) { p = { at: t, picks: {} }; plans.set(seed, p); }
  p.at = t;
  return p;
}
export function forgetPlans() { plans.clear(); }

// ---------------------------------------------------------------------------------------------

export function compose({ kind, how = 'hold', ms = 0, seed = 0.5, base, ctx = {}, manner = null, dry = false, force = null }) {
  if (!base) return null;
  const why = [];
  const N = TUNE.moment, MN = TUNE.manner;
  const stage = Math.max(1, Math.min(6, Math.round(ctx.stage || 3)));
  const close = closeOf(stage);
  const needs = opts.needs ? Needs.levels() : {};
  const how_ = opts.manner && how === 'hold' && manner && manner.pace && manner.pace !== 'still' ? manner : null;
  const pending = how === 'hold' ? Tired.loadFor(kind, ms, how_ ? how_.roughShare : 0) : 0;
  const tctx = { mood: ctx.mood, needs, pending };
  const fav = Tired.fav(kind, tctx);
  const tired = Tired.state(kind, tctx);
  const warm = K.isWarm(kind), play = K.isPlay(kind);
  const { tags, phase, awayMs } = whatJustHappened(kind, how, ms, force);
  let { feeling, power } = base;
  let tempo = 1;

  // 1. how much she's had already: a little more as she gets into it, then diminishing returns,
  //    then "that's enough for now"
  const f = Tired.factor(kind, tctx);
  power *= f;
  if (f > 1.005) why.push('getting into it');
  if (f < 0.995) why.push('tired of it: ' + Tired.STATE_WORDS[tired].toLowerCase());
  if (tired === 'plenty' && feeling === 'loves') { feeling = 'likes'; why.push('loves → likes'); }
  if (tired === 'enough' && DOWN[feeling]) { why.push(feeling + ' → ' + DOWN[feeling]); feeling = DOWN[feeling]; }
  if (tired === 'sore') { feeling = 'notready'; why.push('sore'); }
  const hadEnough = tired === 'enough' || tired === 'sore';

  // 2. her own favorites (and the moment's nudge on them)
  power *= 0.85 + 0.15 * fav;
  if (fav >= 1.15) why.push('one of her favorites');
  else if (fav <= 0.85) why.push('not her favorite');
  if (fav >= N.favLovesAt && feeling === 'likes' && stage >= 4 && !hadEnough && tired !== 'plenty' && seed < (fav - (N.favLovesAt - 0.05)) * 3) {
    feeling = 'loves'; why.push('likes → loves (favorite)');
  }

  // 3. what she needs right now: a touch that gives it lands better
  if (opts.needs) {
    if (warm && needs.affection >= 0.5) { power += N.wantedPower * needs.affection; why.push('she wanted affection'); }
    if (play && needs.play >= 0.5) { power += N.wantedPower * needs.play; why.push('she wanted to play'); }
    if (play && needs.rest >= 0.75 && feeling === 'giggly') { power *= N.sleepyPlay; why.push('too sleepy for this'); }
  }

  // 4. how it's done
  if (how_) {
    if (how_.pace === 'gentle') {
      if (!play) { power += MN.gentlePower * (0.5 + 0.5 * how_.steady); why.push('slow and gentle'); }
      tempo *= 1.2;
      if (!play && how_.gentleFor >= MN.meltAfterMs && close >= 3 && !hadEnough && tired !== 'plenty' && (feeling === 'likes' || feeling === 'loves')) {
        if (feeling === 'likes') why.push('likes → loves (she melts)'); else why.push('she melts');
        feeling = 'loves';
        tags.add('melt');
      }
    } else if (how_.pace === 'rough') {
      tempo *= 0.8;
      if (play) { power += MN.roughPlayPower; why.push('a proper tickle'); }
      else if (how_.roughFor >= (close === 1 ? MN.tooMuchLowBondMs : MN.tooMuchMs)) {
        // too much: a pout she means only a little; someone she barely knows isn't ready for it
        const to = close === 1 ? 'notready' : 'flustered';
        if (feeling !== to) why.push(feeling + ' → ' + to);
        feeling = to;
        power = Math.min(power, MN.tooMuchPower);
        tags.add('toomuch');
        why.push('too rough for too long: a pout');
      } else if (feeling === 'likes' || feeling === 'loves') {
        feeling = close === 1 ? 'flustered' : 'giggly';
        why.push('fast and scrubby: ' + (close === 1 ? 'a bit much' : 'it tickles'));
      } else if (feeling === 'comforted') {
        feeling = 'flustered'; why.push('fast and scrubby while she\'s down: not now');
      } else why.push('fast and scrubby');
      tags.add('rough');
    }
  }

  // 5. what just happened
  if (tags.has('insist')) {
    // she said enough and here it is again: a pout (playful: blush, steam, a look away)
    power *= 0.9;
    if (feeling === 'likes' || feeling === 'giggly') { why.push(feeling + ' → flustered'); feeling = 'flustered'; }
    why.push('again, right after she said enough');
  }
  if (tags.has('change') && !hadEnough) {
    power += N.changePower * Math.max(0, 1 - ms / 6000);
    why.push('a change of touch');
  }
  if (tags.has('combo')) { power += N.comboPower; why.push('still glowing from the combo'); }
  if (tags.has('surprise')) {
    power += N.surprisePower;
    if (feeling === 'likes' && close <= 2) { feeling = 'flustered'; why.push('likes → flustered'); }
    why.push('out of nowhere');
  }
  if (phase === 'greeting' && (warm || how === 'combo')) {
    power += N.greetingPower * clamp01(awayMs / (Math.max(0.1, N.greetingFullAwayH) * 3600e3));
    why.push('glad you\'re back');
    tags.add('greeting');
  } else if (phase === 'peak') {
    power += N.peakPower; why.push('you two are really into it'); tags.add('peak');
  } else if (phase === 'winddown') {
    tempo *= N.windDownTempo; why.push('winding down'); tags.add('winddown');
  } else if (phase === 'afterglow' && warm && !hadEnough) {
    tempo *= N.afterglowTempo; power += N.afterglowPower; why.push('still warm from before'); tags.add('afterglow');
  }

  power = clamp01(Math.max(0.08, power));
  const out = { feeling, power, tired, fav, why, manner: manner?.pace || null, moment: [...tags] };

  // 6. how it plays out
  Object.assign(out, variety({ kind, how, seed, feeling, power, close, ctx, needs, tags, tempo, dry, hadEnough }));
  if (out.variant !== 'plain') why.push('her body: ' + out.variant);
  if (opts.variety && Math.abs(out.tempo - 1) >= 0.08) why.push(out.tempo > 1 ? 'taking her time' : 'quick and lively');
  return out;
}

// which way it plays out. A hold keeps its picks while it goes on (planFor); a poke or a combo
// picks fresh every time. Everything goes through the repeat watcher
function variety({ kind, how, seed, feeling, power, close, ctx, needs, tags, tempo, dry, hadEnough }) {
  const V = TUNE.variety;
  if (!opts.variety) return { variant: 'plain', line: lineFor(feeling, { tags, close, needs, hadEnough, seed, dry: true }), pieces: null, ripple: null, tempo: 1, delay: 0 };
  // what the moment leans toward
  const lean = new Set(tags);
  const sleepy = (needs.rest || 0) >= 0.6;
  if (tags.has('melt') || tags.has('afterglow') || tags.has('winddown') || sleepy || ctx.mood === 'upset') lean.add('calm');
  if (tags.has('peak') || tags.has('greeting') || tags.has('combo') || ctx.mood === 'happy' || (needs.play || 0) >= 0.6) lean.add('bright');
  if (close === 1) lean.add('lowbond');

  // the body variant
  const key = feeling + (tags.has('melt') ? '+melt' : '') + (tags.has('toomuch') ? '+toomuch' : '') + (tags.has('rough') ? '+rough' : '');
  const pickVariant = (rand, note) => {
    const others = (VARIANTS[feeling] || []).map(v => ({ id: feeling + '.' + v.id, w: v.w * (v.tags.some(tg => lean.has(tg)) ? 3 : 1) }));
    const sum = others.reduce((a, b) => a + b.w, 0);
    // her usual way keeps its share next to all the others together
    const plainW = sum > 0 ? sum * V.plainChance / Math.max(0.01, 1 - V.plainChance) : 1;
    const got = Repeat.pick('variant', [{ id: feeling + '.plain', w: plainW }, ...others], { note, rand });
    return got ? got.slice(feeling.length + 1) : 'plain';
  };
  let variant;
  if (dry) variant = pickVariant(seededRand(seed, 'variant:' + key), false);
  else if (how === 'hold') {
    const plan = planFor(seed);
    if (!plan.picks[key]) plan.picks[key] = pickVariant(Math.random, true);
    variant = plan.picks[key];
  } else variant = pickVariant(Math.random, true);
  // she melts = she melts
  if (tags.has('melt') && feeling === 'loves') variant = 'melt';

  // the pieces round her: which are likelier this time
  const pieces = {};
  const bias = (map) => { for (const [p, k] of Object.entries(map)) pieces[p] = (pieces[p] || 1) * k; };
  if (lean.has('calm')) bias({ glowdot: 1.7, note: 1.3, sigh: 1.5, heartring: 0.5, bang: 0.6, star: 0.7 });
  if (lean.has('bright')) bias({ sparkle: 1.4, star: 1.5, hehe: 1.3, heartring: 1.5, heart: 1.2 });
  if (tags.has('rough')) bias({ steam: 1.6, swirl: 1.4, bang: 1.4, bubble: 1.3 });
  if (tags.has('surprise')) bias({ bang: 2.2, ascii: 1.4, drop: 0.7 });
  if (tags.has('insist') || tags.has('toomuch')) bias({ steam: 1.6, hmph: 1.8, drop: 1.3, ascii: 1.3 });

  // her own ripple, now and then
  const list = RIPPLES[feeling] || [];
  const ripple = list.length && seeded(seed, 'ripple?') < V.rippleChance ? list[Math.floor(seeded(seed, 'ripple') * list.length)] : null;

  // each touch runs a little quicker or calmer than the last
  const t = tempo * (1 + V.tempoSpread * (2 * seeded(seed, 'tempo') - 1));
  // a shy beat before a poke's effects; none when it made her jump
  const shy = feeling === 'flustered' || feeling === 'secret' || feeling === 'notready';
  const delay = how === 'poke' && shy && !tags.has('surprise') ? Math.round(V.pokeDelayMs * seeded(seed, 'delay')) : 0;
  return {
    variant, pieces: Object.keys(pieces).length ? pieces : null, ripple,
    line: lineFor(feeling, { tags, close, needs, hadEnough, seed, dry: true }),
    tempo: Math.max(0.6, Math.min(1.6, t)), delay,
  };
}

// the kind of thing she'd say about it. dry: only look (her line may never be spoken; feel.js
// notes the type when a line really goes out)
export function lineFor(feeling, { tags = new Set(), close = 2, needs = {}, hadEnough = false, seed = 0.5, dry = true } = {}) {
  let list = (LINES[feeling] || [['shy', 1]]).map(([id, w]) => ({ id, w }));
  const up = (id, k) => { const x = list.find(l => l.id === id); if (x) x.w *= k; else if (k > 1) list.push({ id, w: k * 0.5 }); };
  if (close === 1) { list = list.filter(l => l.id !== 'tease'); up('shy', 2); }
  // too much, or again right after "enough": that's a pout, no two ways about it
  if (tags.has('insist') || tags.has('toomuch')) return 'pout';
  if (hadEnough) up('pout', 4);
  if (tags.has('surprise')) { up('curious', 2.5); up('shy', 1.5); }
  if (tags.has('greeting')) up('excited', 3);
  if (tags.has('melt') || tags.has('afterglow') || (needs.rest || 0) >= 0.6) up('comfort', 3);
  if (tags.has('peak') || tags.has('combo')) { up('excited', 2); up('tease', 1.5); }
  if (tags.has('change')) up('curious', 1.8);
  return Repeat.pick('linetype', list, { note: !dry, rand: seededRand(seed, 'line:' + feeling) }) || 'shy';
}
