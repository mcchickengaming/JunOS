// Difficulty presets (#35 b): Easy / Medium / Hard / Extreme, the player's pick, changeable any time, kept with the game
// (story state's `difficulty`, so a save remembers it). Everything is data (data/difficulty.json); this file has the
// rules and no DOM. The delve gets the preset object in Run.start({ difficulty }) and stays pure.
//
//   Easy      the old kind danger: knocked out = her care scene, nothing lost (and the default: the harder ones are
//             "for those who want it", owner Nov 14)
//   harder    knocked out = game over (load a save) unless SHE SAVES YOU: a chance that grows with the bond and her
//             Support skill, lower on harder presets and when she stayed home (she has to come down for you)
//
// The bond giving a little gameplay value here is the owner's call (Nov 14). It never goes the other way: nothing on any
// preset ever lowers the bond or her feelings.

export const ORDER = ['easy', 'medium', 'hard', 'extreme'];
const FALLBACK = {
  version: 1, default: 'easy', order: ORDER,
  presets: { easy: { name: 'Easy', line: '', knockout: 'care', foe: { hp: 1, atk: 1 }, trap: 1, quality: 0, saves: { base: 1, perStage: 0, perSupport: 0, alone: 1, cap: 1 } } },
};

let dataCache = null;
export async function loadData(url = 'data/difficulty.json') {
  if (!dataCache) dataCache = fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : FALLBACK)).catch(() => FALLBACK);
  return dataCache;
}
export function useData(d) { dataCache = Promise.resolve(d); return d; }

export const ids = (data) => (data.order || Object.keys(data.presets)).filter(id => data.presets[id]);
export const choices = (data) => ids(data).map(id => [id, data.presets[id].name]);
export const isId = (data, id) => !!data?.presets?.[id];
export const defaultId = (data) => (isId(data, data.default) ? data.default : ids(data)[0]);

// the preset as the delve uses it (always every field, so a short data entry can't break a fight)
export function preset(data, id) {
  const pid = isId(data, id) ? id : defaultId(data);
  const p = data.presets[pid];
  const s = p.saves || {};
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    id: pid, name: p.name || pid, line: p.line || '',
    knockout: p.knockout === 'gameover' ? 'gameover' : 'care',
    foe: { hp: num(p.foe?.hp, 1), atk: num(p.foe?.atk, 1) },
    trap: num(p.trap, 1),
    quality: Math.max(0, Math.min(0.3, num(p.quality, 0))),
    saves: { base: num(s.base, 1), perStage: num(s.perStage, 0), perSupport: num(s.perSupport, 0), alone: num(s.alone, 1), cap: Math.max(0, Math.min(1, num(s.cap, 1))) },
  };
}

// "Jun saves you": the chance she reaches you in time. stage 1..6 (the bond), support 1..99 (her Support skill),
// together = she came along (she stayed home: she has to come down for you)
export function saveChance(p, { stage = 1, support = 1, together = true } = {}) {
  if (p.knockout !== 'gameover') return 1;
  const s = p.saves;
  const raw = s.base + s.perStage * (Math.max(1, Math.min(6, stage)) - 1) + s.perSupport * (Math.max(1, Math.min(99, support)) / 99);
  return Math.max(0, Math.min(s.cap, raw * (together ? 1 : s.alone)));
}

// in words for Settings: "Today she'd reach you most of the time."
export function chanceWords(c) {
  return c >= 1 ? 'every time' : c >= 0.85 ? 'almost every time' : c >= 0.6 ? 'most of the time' : c >= 0.4 ? 'about half the time'
    : c >= 0.2 ? 'now and then' : c > 0 ? 'rarely' : 'never';
}
