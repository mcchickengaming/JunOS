// the ONE consent + ratings gate (foundations #31 (6)). Every touch, line pack, scene or event
// that could be flirty or 18+ asks here; no feature does its own check. The same rules live in
// api/lib/gate.php for her server, and both are tested on the same cases
// (.github/scripts/gate-cases.json), so they can't drift apart.
//
// check(item, ctx) answers two things:
//   show: may this be offered at all? (the player's switches, what you are to each other, the
//         adult-look check, screen share, which window)
//   her:  'yes' / 'ask' / 'no': her own say right now (her stop signal, bond, trust, mood).
//         'no' is always kind and never a penalty; 'ask' = she wants something first.
// Ratings agreed Nov 10 (claude/ratings-and-rewards-nov10.md): everyday / flirty / adult.
// Flavors agreed Nov 11 (claude/relationship-flavors.md).

export const TIERS = ['everyday', 'flirty', 'adult'];

// [id, name, one line]
export const FLAVORS = [
  ['romantic', 'Romantic', 'Partners, as your bond grows. Everything is open, with her say.'],
  ['friends_open', 'Friends, open to more', 'No romance and no "I love you", but flirty moments are fine with her say.'],
  ['platonic', 'Best friends', 'Hugs, headpats and cuddles as friends. Never flirty.'],
  ['siblings', 'Family: siblings', 'Two adult siblings. Warm teasing and looking out for each other.'],
];
export const FLAVOR_IDS = FLAVORS.map(f => f[0]);

// HARD locks, in code on purpose: never from a file, a profile or a setting.
// (a parent / adult daughter flavor was removed Nov 12, owner's call; if it ever comes back it
// belongs here, never rated: Claude declined a rated version on Nov 11)
export const LOCKED = Object.freeze({ platonic: ['flirty', 'adult'] });
// flavors where rated tiers need their own opt-in (off by default)
export const OPT_IN = Object.freeze({ siblings: ['flirty', 'adult'] });

export const DEFAULTS = Object.freeze({
  flavor: 'romantic', flavorLock: false,
  flirty: true, adult: false, adultConfirmed: false, adultOutside: false, siblingsRated: false,
});

// her say: below these she says no / asks first. tension and trust are her gauges (0..100)
export const TUNE = Object.freeze({ trustNo: 20, tensionAsk: 60, tensionNo: 85 });

// plain words for every reason, for the settings and the makers
export const WHY = Object.freeze({
  ok: '',
  flavor: 'Doesn\'t fit what you are to each other.',
  flavor_lock: 'Not part of this kind of relationship.',
  flavor_optin: 'Turned off for this kind of relationship.',
  flirty_off: 'Flirty moments are off.',
  adult_off: '18+ is off.',
  look: 'Her look reads as a child, so flirty and 18+ are paused until it reads adult again.',
  screen_share: 'Hidden while you share your screen.',
  mode: '18+ stays in her window.',
  stop: 'She asked you to stop.',
  bond: 'Not yet: you two aren\'t that close.',
  trust: 'She doesn\'t trust you enough for that right now.',
  mood: 'Not in the mood right now.',
  ask: 'She wants something first.',
});

const bool = (v, d) => (typeof v === 'boolean' ? v : d);

// any stored/sent settings → a clean set (unknown flavor → romantic, wrong types → defaults)
export function clean(c) {
  c = c && typeof c === 'object' ? c : {};
  return {
    flavor: FLAVOR_IDS.includes(c.flavor) ? c.flavor : DEFAULTS.flavor,
    flavorLock: bool(c.flavorLock, DEFAULTS.flavorLock),
    flirty: bool(c.flirty, DEFAULTS.flirty),
    adult: bool(c.adult, DEFAULTS.adult),
    adultConfirmed: bool(c.adultConfirmed, DEFAULTS.adultConfirmed),
    adultOutside: bool(c.adultOutside, DEFAULTS.adultOutside),
    siblingsRated: bool(c.siblingsRated, DEFAULTS.siblingsRated),
  };
}

const tierOf = (t) => (TIERS.includes(t) ? t : 'adult'); // unknown = the strictest, fail safe

// is this tier possible at all for a flavor (the makers ask this before letting an entry be tagged)
export function canTag(flavor, tier) {
  tier = tierOf(tier);
  if (tier === 'everyday') return true;
  if (!FLAVOR_IDS.includes(flavor)) return false;
  return !(LOCKED[flavor] || []).includes(tier);
}

// item: { tier, flavors?: [ids it fits], minStage?: 1..6, minTrust?: 0..100 }
// ctx:  { comfort, mode: 'desktop'|'windowed'|'compact', screenShare, lookAdult (the adult-look
//         check on her look itself, never a flag in a file), stage 1..6, trust, tension, stop }
export function check(item, ctx = {}) {
  const tier = tierOf(item && item.tier != null ? item.tier : 'everyday');
  const c = clean(ctx.comfort);
  const flavor = c.flavor;
  const out = (show, her, why) => ({ show, her: show ? her : 'no', why, words: WHY[why] || '' });

  if (item && Array.isArray(item.flavors) && item.flavors.length && !item.flavors.includes(flavor)) return out(false, 'no', 'flavor');
  if (tier !== 'everyday') {
    if ((LOCKED[flavor] || []).includes(tier)) return out(false, 'no', 'flavor_lock');
    if ((OPT_IN[flavor] || []).includes(tier) && !c.siblingsRated) return out(false, 'no', 'flavor_optin');
    if (tier === 'flirty' && !c.flirty) return out(false, 'no', 'flirty_off');
    if (tier === 'adult' && !(c.adult && c.adultConfirmed)) return out(false, 'no', 'adult_off');
    if (ctx.lookAdult === false) return out(false, 'no', 'look');
    if (ctx.screenShare) return out(false, 'no', 'screen_share');
    if (tier === 'adult' && (ctx.mode || 'windowed') !== 'windowed' && !c.adultOutside) return out(false, 'no', 'mode');
  }

  // her own say
  const stage = Number.isFinite(ctx.stage) ? ctx.stage : 1;
  const trust = Number.isFinite(ctx.trust) ? ctx.trust : 50;
  const tension = Number.isFinite(ctx.tension) ? ctx.tension : 0;
  const minStage = Number.isFinite(item?.minStage) ? item.minStage : 1;
  const minTrust = Math.max(Number.isFinite(item?.minTrust) ? item.minTrust : 0, tier === 'everyday' ? 0 : TUNE.trustNo);
  if (ctx.stop) return out(true, 'no', 'stop');
  if (stage < minStage) return out(true, 'no', 'bond');
  if (trust < minTrust) return out(true, 'no', 'trust');
  if (tension >= TUNE.tensionNo) return out(true, 'no', 'mood');
  if (tension >= TUNE.tensionAsk || (tier !== 'everyday' && stage === minStage && minStage > 1)) return out(true, 'ask', 'ask');
  return out(true, 'yes', 'ok');
}

// the quick question most features ask: may a tier show here at all?
export const allowed = (tier, ctx) => check({ tier }, ctx).show;

// ---------------------------------------------------------------
// the player's settings: kept on her server (api/comfort.php), cached here so pages can ask
// without waiting. a change in one window reaches the others through the storage event

export const CACHE_KEY = 'jun.comfort';

export function comfort() {
  try { return clean(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')); } catch (e) { return clean({}); }
}
function cache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(clean(c))); } catch (e) { /* private mode */ }
  return clean(c);
}
export async function loadComfort() {
  try {
    const r = await fetch('api/comfort.php', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) return cache(await r.json());
  } catch (e) { /* offline: the cache stands */ }
  return comfort();
}
// patch: any of the DEFAULTS keys. turning 18+ on needs confirmAdult: true (she asks you once)
export async function saveComfort(patch) {
  const r = await fetch('api/comfort.php', {
    method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.error) || 'save_failed');
  return cache(j);
}
export function onComfort(fn) {
  window.addEventListener('storage', (e) => { if (e.key === CACHE_KEY) fn(comfort()); });
}
