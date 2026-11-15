// Story state (#35 b): the one store the story-event engine (#34) reads and writes. It lives in the game's `story` section
// (game saves, #35 a), so every save remembers where the story stands. This file is pure (no DOM, no storage, no clock:
// `now` is always passed in), so the engine, its lab and the tests use the same rules; the door at the bottom (`open` /
// `commit`) is the only part that talks to her server.
//
//   flags       id → true / a number / a short string        "met_al", "harbor_restored", "al_trust" = 3
//   quests      id → { step, done, at }                      a quest's current step (a word or a number)
//   seen        id → how many times                          a beat, a line, a place: "seen it" for once-only beats
//   choices     id → the option picked                       "spare_the_jester" → "spared"
//   agreements  id → { given, at, revokedAt? }               consent given beforehand (the gate's "agreed beforehand"
//                                                            kind): set by the owner's own dialogue/story flags, can be
//                                                            taken back any time; the gate reads it (agreementsFor)
//   difficulty  'easy' | 'medium' | 'hard' | 'extreme'       the player's pick (data/difficulty.json), any time
//   place / chapter                                          short words for the save card (the `_summary`)
//   log         the last LOG_MAX changes, newest last         what changed and when, for the lab and "why"
//
// Ids: lower case, digits and _ . : - (up to 64), so a beat id like "act1.scrapyard:met_al" works. Values are kept small
// (VALUE_MAX characters) so a story can never bloat a save. Every edit mutates `s` and returns it.

export const V = 1;
export const LOG_MAX = 200;
export const VALUE_MAX = 120;
const ID_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;
export const isId = (id) => typeof id === 'string' && ID_RE.test(id);

export function blank(difficulty = 'easy') {
  return { v: V, flags: {}, quests: {}, seen: {}, choices: {}, agreements: {}, difficulty, place: '', chapter: '', log: [] };
}

const okValue = (v) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= VALUE_MAX);
const clip = (v, n = VALUE_MAX) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

// anything from a section (an old save, an upload) made safe: known keys, valid ids, small values
export function clean(raw, difficultyIds = null, fallbackDifficulty = 'easy') {
  const s = blank(fallbackDifficulty);
  if (!raw || typeof raw !== 'object') return s;
  for (const [k, v] of Object.entries(raw.flags || {})) if (isId(k) && okValue(v)) s.flags[k] = v;
  for (const [k, q] of Object.entries(raw.quests || {})) {
    if (!isId(k) || !q || typeof q !== 'object' || !okValue(q.step)) continue;
    s.quests[k] = { step: q.step, done: !!q.done, at: Number(q.at) || 0 };
  }
  for (const [k, n] of Object.entries(raw.seen || {})) if (isId(k) && Number.isFinite(Number(n)) && Number(n) > 0) s.seen[k] = Math.floor(Number(n));
  for (const [k, v] of Object.entries(raw.choices || {})) if (isId(k) && typeof v === 'string' && isId(v)) s.choices[k] = v;
  for (const [k, a] of Object.entries(raw.agreements || {})) {
    if (!isId(k) || !a || typeof a !== 'object') continue;
    s.agreements[k] = { given: !!a.given, at: Number(a.at) || 0, ...(a.revokedAt ? { revokedAt: Number(a.revokedAt) || 0 } : {}) };
  }
  if (typeof raw.difficulty === 'string' && (!difficultyIds || difficultyIds.includes(raw.difficulty))) s.difficulty = raw.difficulty;
  s.place = clip(raw.place, 60);
  s.chapter = clip(raw.chapter, 60);
  if (Array.isArray(raw.log)) s.log = raw.log.filter(e => e && typeof e === 'object' && isId(e.id)).slice(-LOG_MAX);
  return s;
}

function note(s, kind, id, v, now) {
  s.log.push({ at: now || 0, kind, id, ...(v === undefined ? {} : { v }) });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
  return s;
}
function need(id) { if (!isId(id)) throw new Error('story state: bad id ' + id); }

// ---------------------------------------------------------------
// flags

export const flag = (s, id, dflt = false) => (Object.prototype.hasOwnProperty.call(s.flags, id) ? s.flags[id] : dflt);
export const has = (s, id) => !!flag(s, id);
export function setFlag(s, id, v = true, now = 0) {
  need(id);
  if (!okValue(v)) throw new Error('story state: a flag is true/false, a number or a short string');
  if (s.flags[id] === v) return s;
  s.flags[id] = v;
  return note(s, 'flag', id, v, now);
}
export function clearFlag(s, id, now = 0) {
  if (!(id in s.flags)) return s;
  delete s.flags[id];
  return note(s, 'unflag', id, undefined, now);
}
export function addTo(s, id, n = 1, now = 0) {
  const cur = Number(flag(s, id, 0)) || 0;
  return setFlag(s, id, cur + n, now);
}

// ---------------------------------------------------------------
// quests

export const quest = (s, id) => s.quests[id] || null;
export const questStep = (s, id) => s.quests[id]?.step ?? null;
export const questDone = (s, id) => !!s.quests[id]?.done;
export function setQuest(s, id, step, now = 0, { done = false } = {}) {
  need(id);
  if (!okValue(step)) throw new Error('story state: a quest step is a word or a number');
  const q = s.quests[id];
  if (q && q.step === step && q.done === done) return s;
  s.quests[id] = { step, done: !!done, at: now };
  return note(s, done ? 'quest_done' : 'quest', id, step, now);
}
export const finishQuest = (s, id, now = 0, step = 'done') => setQuest(s, id, step, now, { done: true });

// ---------------------------------------------------------------
// seen (once-only beats, how often a line came up)

export const seenCount = (s, id) => s.seen[id] || 0;
export const seenIt = (s, id) => seenCount(s, id) > 0;
export function markSeen(s, id, now = 0) {
  need(id);
  s.seen[id] = seenCount(s, id) + 1;
  return s.seen[id] === 1 ? note(s, 'seen', id, undefined, now) : s;
}

// ---------------------------------------------------------------
// choices

export const chose = (s, id) => s.choices[id] ?? null;
export function choose(s, id, option, now = 0) {
  need(id); need(option);
  if (s.choices[id] === option) return s;
  s.choices[id] = option;
  return note(s, 'choice', id, option, now);
}

// ---------------------------------------------------------------
// agreements: consent given beforehand (the gate's "agreed beforehand" kind)
// given by the owner's own dialogue line or story flag; taken back any time; the gate reads `agreementsFor`.
// Taking it back always wins and is never a penalty.

export function agree(s, id, now = 0) {
  need(id);
  s.agreements[id] = { given: true, at: now };
  return note(s, 'agreed', id, undefined, now);
}
export function revoke(s, id, now = 0) {
  need(id);
  const a = s.agreements[id];
  if (!a || !a.given) return s;
  s.agreements[id] = { given: false, at: a.at, revokedAt: now };
  return note(s, 'revoked', id, undefined, now);
}
// 'given' | 'revoked' | null (never asked)
export function agreement(s, id) {
  const a = s.agreements[id];
  return !a ? null : a.given ? 'given' : 'revoked';
}
// the shape the gate's ctx takes: { id: 'given' | 'revoked' }
export function agreementsFor(s) {
  const out = {};
  for (const id of Object.keys(s.agreements)) out[id] = agreement(s, id);
  return out;
}

// ---------------------------------------------------------------
// difficulty, place, chapter and the save card

export function setDifficulty(s, id, now = 0) {
  if (typeof id !== 'string' || !id || s.difficulty === id) return s;
  s.difficulty = id;
  return note(s, 'difficulty', 'difficulty', id, now);
}
export function setPlace(s, place, chapter, now = 0) {
  const p = clip(place, 60), c = chapter === undefined ? s.chapter : clip(chapter, 60);
  if (p === s.place && c === s.chapter) return s;
  s.place = p; s.chapter = c;
  return note(s, 'place', 'place', [p, c].filter(Boolean).join(' · '), now);
}
// what a save card shows (gamesave.php reads `_summary` from any section): names, never ids
export function summary(s, difficultyName = '') {
  const out = {};
  if (s.place) out.place = s.place;
  if (s.chapter) out.chapter = s.chapter;
  if (difficultyName) out.difficulty = difficultyName;
  return out;
}

// ---------------------------------------------------------------
// the door: open the live story from the game, commit it back (with the epoch it was read at, so a story from a game
// that was replaced meanwhile is never written over the new one). GameSave is passed in, so this file stays pure.

export const SECTION = 'story';

export async function open(GameSave, { difficultyIds = null, fallbackDifficulty = 'easy' } = {}) {
  const r = await GameSave.section(SECTION);
  if (r.off) return { off: true, state: blank(fallbackDifficulty), epoch: null };
  if (r.error) return { error: r.error, state: blank(fallbackDifficulty), epoch: null };
  return { state: clean(r.data, difficultyIds, fallbackDifficulty), epoch: r.epoch };
}

export async function commit(GameSave, state, epoch, difficultyName = '') {
  const data = { ...state, _summary: summary(state, difficultyName) };
  return GameSave.put({ [SECTION]: data }, { epoch });
}
