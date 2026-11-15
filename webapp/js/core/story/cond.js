// conditions for the story-event engine (#34): when may this event, line, choice or effect happen?
// Plain data, so a story is written without code. The story-state part is the SAME language the map
// uses (js/core/world/places.js when(): one set of rules, never two):
//
//   { "flag": "met_jun" }  { "flag": "gift", "is": "ribbon" }
//   { "quest": "act1" }  { "quest": "act1", "step": "harbor" }  { "questDone": "act1" }
//   { "seen": "a1_the_dump" }  { "choice": "a1_no_papers.stop", "is": "honest" }
//   { "all": [ … ] }  { "any": [ … ] }  { "not": … }   (and a bare list means "all of these")
//
// and the engine adds what only it knows (g.x, the game's `events` section, and what the page knows):
//
//   { "flag": "crates", "gte": 2 }              a counted flag: gte / lte
//   { "thread": "stranger", "is": "open" }      a loose end: none / open / closed / closed:<how it ended>
//   { "thread": "excuses", "gte": 3 }           … or how many times it has come up
//   { "since": "stroll_ad", "gte": 2 }          story days since an event last happened (false if never)
//   { "at": "slums" }  { "at": ["slums", "port_buffer"] }  { "spotTag": "town" }
//   { "slot": ["evening", "night"] }  { "weather": "fog" }  { "with": "jun" }
//   { "day": { "gte": 3 } }                     a bare number means "at least"
//   { "bond": { "gte": 3 } }                    her bond stage 1..6 (never on the main story: story-engine.js validate)
//   { "skill": { "who": "jun", "id": "photography", "gte": 20 } }
//   { "rep": { "npc": "al", "gte": 10 } }  { "aff": { "npc": "fisher", "gte": 30 } }
//   { "card": "pl_port_buffer" }  { "difficulty": ["hard", "extreme"] }
//
// test() answers yes or no; why() lists, in plain words, what is still missing (the lab's "why not?").
// g = { s: story state (story-state.js), x: the engine's own part }. No DOM, no storage, no clock.

import { when as stateWhen } from '../world/places.js?v=1';

export const SLOTS = ['morning', 'afternoon', 'evening', 'night'];
const STATE = ['flag', 'questDone', 'quest', 'seen', 'choice'];            // places.js answers these
const OWN = ['thread', 'since', 'at', 'spotTag', 'slot', 'weather', 'with', 'day', 'bond', 'skill', 'rep', 'aff', 'card', 'difficulty'];
export const SUBJECTS = [...STATE, ...OWN];
// what may never sit on the main story (perks help, never gate)
export const GATED = ['bond', 'skill', 'aff', 'rep', 'difficulty', 'weather'];

const list = (v) => (Array.isArray(v) ? v : [v]);
function cmp(have, want) {
  if (typeof want === 'number') return have >= want;
  if (!want || typeof want !== 'object') return !!have;
  if ('is' in want && have !== want.is) return false;
  if ('gte' in want && !(have >= want.gte)) return false;
  if ('lte' in want && !(have <= want.lte)) return false;
  return true;
}
const counted = (c) => 'gte' in c || 'lte' in c;
const cmpWords = (w) => (typeof w === 'number' ? `at least ${w}` : [('is' in w) && `exactly ${w.is}`, ('gte' in w) && `at least ${w.gte}`, ('lte' in w) && `at most ${w.lte}`].filter(Boolean).join(', '));

export const threadIs = (g, id) => { const t = g.x.threads[id]; return !t ? 'none' : t.s === 'open' ? 'open' : 'closed'; };

// one leaf → [ok, words for "what's missing"]
function leaf(c, g, ctx) {
  const s = g.s, x = g.x;
  if ('flag' in c && counted(c)) { const v = s.flags[c.flag]; return [cmp(typeof v === 'number' ? v : (v ? 1 : 0), c), `"${c.flag}" ${cmpWords(c)}`]; }
  const st = STATE.find(k => k in c);
  if (st) {
    const words = st === 'flag' ? `"${c.flag}" ${'is' in c ? 'is ' + c.is : 'has happened'}` : st === 'seen' ? `"${c.seen}" has happened`
      : st === 'choice' ? `you chose ${'is' in c ? '"' + c.is + '" ' : ''}at "${c.choice}"` : st === 'questDone' ? `"${c.questDone}" is finished` : `"${c.quest}" ${'step' in c ? 'is at ' + c.step : 'has begun'}`;
    return [stateWhen(c, s), words];
  }
  if ('thread' in c) {
    const t = x.threads[c.thread], now = threadIs(g, c.thread);
    let ok = true;
    if ('is' in c) { const [want, how] = String(c.is).split(':'); ok = now === want && (!how || (t && t.as === how)); }
    if (ok && counted(c)) ok = cmp(t ? t.n : 0, { ...('gte' in c ? { gte: c.gte } : {}), ...('lte' in c ? { lte: c.lte } : {}) });
    if (!('is' in c) && !counted(c)) ok = now !== 'none';
    return [ok, `the loose end "${c.thread}" ${'is' in c ? 'is ' + c.is : ''}${'gte' in c ? ' came up at least ' + c.gte + '×' : ''}`.trim()];
  }
  if ('since' in c) { const d = x.last[c.since]; return [d !== undefined && cmp(x.day - d, counted(c) ? c : 1), `"${c.since}" was a while ago`]; }
  if ('at' in c) return [list(c.at).includes(x.at), `you're at ${list(c.at).join(' or ')}`];
  if ('spotTag' in c) return [!!(ctx.spotTags || []).includes(c.spotTag), `somewhere that is "${c.spotTag}"`];
  if ('slot' in c) return [list(c.slot).includes(ctx.slotName || SLOTS[x.slot]), `it's ${list(c.slot).join(' or ')}`];
  if ('weather' in c) return [list(c.weather).includes(ctx.weather || 'clear'), `the weather is ${list(c.weather).join(' or ')}`];
  if ('with' in c) return [list(c.with).every(w => (ctx.with || []).includes(w)), `${list(c.with).join(' and ')} came along`];
  if ('day' in c) return [cmp(x.day, c.day), `story day ${cmpWords(c.day)}`];
  if ('bond' in c) return [cmp(Number.isFinite(ctx.stage) ? ctx.stage : 1, c.bond), `your bond with her: stage ${cmpWords(c.bond)}`];
  if ('skill' in c) { const k = c.skill; return [cmp(ctx.levels?.[k.who || 'player']?.[k.id] || 1, k), `${k.who === 'jun' ? 'her' : 'your'} ${k.id} ${cmpWords(k)}`]; }
  if ('rep' in c) return [cmp(x.npc[c.rep.npc]?.rep || 0, c.rep), `${c.rep.npc} thinks well enough of you`];
  if ('aff' in c) return [cmp(x.npc[c.aff.npc]?.aff || 0, c.aff), `you're close enough to ${c.aff.npc}`];
  if ('card' in c) return [x.codex[c.card] !== undefined, `"${c.card}" is in your notebook`];
  if ('difficulty' in c) return [list(c.difficulty).includes(s.difficulty), `the difficulty is ${list(c.difficulty).join(' or ')}`];
  return [false, 'a condition nobody understands'];
}

export function test(c, g, ctx = {}) {
  if (c === undefined || c === null || c === true) return true;
  if (c === false) return false;
  if (Array.isArray(c)) return c.every(k => test(k, g, ctx));
  if (typeof c !== 'object') return false;
  if (Array.isArray(c.all)) return c.all.every(k => test(k, g, ctx));
  if (Array.isArray(c.any)) return c.any.some(k => test(k, g, ctx));
  if ('not' in c) return !test(c.not, g, ctx);
  return leaf(c, g, ctx)[0];
}

// what's still missing, in plain words ([] = nothing)
export function why(c, g, ctx = {}) {
  if (c === undefined || c === null || c === true) return [];
  if (c === false || typeof c !== 'object') return ['never'];
  if (Array.isArray(c)) return c.flatMap(k => why(k, g, ctx));
  if (Array.isArray(c.all)) return c.all.flatMap(k => why(k, g, ctx));
  if (Array.isArray(c.any)) return test(c, g, ctx) ? [] : ['one of: ' + c.any.map(k => why(k, g, ctx).join(' and ') || 'ok').join(' / ')];
  if ('not' in c) return test(c, g, ctx) ? [] : ['not: ' + (describe(c.not) || 'that')];
  const [ok, words] = leaf(c, g, ctx);
  return ok ? [] : [words];
}

const NOBODY = { s: { flags: {}, quests: {}, seen: {}, choices: {}, difficulty: '' }, x: { threads: {}, last: {}, npc: {}, codex: {}, day: 0, slot: 0, at: '' } };
export function describe(c) {
  if (c === undefined || c === null || c === true) return '';
  if (Array.isArray(c)) return c.map(describe).join(' and ');
  if (Array.isArray(c.all)) return c.all.map(describe).join(' and ');
  if (Array.isArray(c.any)) return '(' + c.any.map(describe).join(' or ') + ')';
  if ('not' in c) return 'not ' + describe(c.not);
  return leaf(c, NOBODY, {})[1];
}

// every subject a condition looks at, and every id it names
export function reads(c, out = { subjects: new Set(), flags: [], threads: [], events: [], spots: [], cards: [], npcs: [], bad: [] }) {
  if (c === undefined || c === null || typeof c === 'boolean') return out;
  if (Array.isArray(c)) { c.forEach(k => reads(k, out)); return out; }
  if (typeof c !== 'object') { out.bad.push(String(c)); return out; }
  if (Array.isArray(c.all) || Array.isArray(c.any)) { (c.all || c.any).forEach(k => reads(k, out)); return out; }
  if ('not' in c) return reads(c.not, out);
  const s = SUBJECTS.find(k => k in c);
  if (!s) { out.bad.push(JSON.stringify(c)); return out; }
  out.subjects.add(s);
  if (s === 'flag') out.flags.push(c.flag);
  if (s === 'thread') out.threads.push(c.thread);
  if (s === 'seen' || s === 'since') out.events.push(c[s]);
  if (s === 'choice') out.events.push(String(c.choice).split('.')[0]);
  if (s === 'at') out.spots.push(...list(c.at));
  if (s === 'card') out.cards.push(c.card);
  if (s === 'rep' || s === 'aff') out.npcs.push(c[s].npc);
  return out;
}
