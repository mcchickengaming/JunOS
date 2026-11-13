// who can do what in a fight (#32). Decided Nov 13: ROLES COME FROM WHAT YOU HAVE, NOT CLASSES.
// A fighter's abilities are the sum of: what everyone can do (a shove), what their kits give
// (stand-in gear until the economy #9: data "kits"), and what their skills have taught them
// (data abilities with "from": { skill, level }; the levels come from the progression service).
// Either of you can carry any kit, so the two of you can be any mix: two tanks, two healers,
// you hitting while she supports, or the other way round.
//
// HARD RULE (tested): nothing in here reads the bond, the relationship flavor or her courage.
// Those change her words (party.js), never what she can do.

import { tune as getTune } from './tune.js?v=1';

export const WHO = ['player', 'jun'];
export const TAGS = ['front', 'dps', 'support', 'scan', 'hack'];
export const TAG_WORDS = { front: 'front line', dps: 'hitting', support: 'support', scan: 'scanning', hack: 'hacking' };

// levels: { skillId: level } for this owner (missing = 1 for delving, 0 for the rest)
// effects: the progression service's buff effects ({ accuracy: 5, luck: 1, … })
// kits: up to two kit ids
export function build(data, who, { levels = {}, effects = {}, kits, name, tune } = {}) {
  const t = tune || getTune();
  const u = t.unit;
  const lv = Math.max(1, Math.min(99, Math.floor(levels.delving || 1)));
  const k = who === 'jun' ? u.herHp : 1;
  const stats = {
    hp: Math.round((u.hpBase + lv * u.hpPerLevel) * k),
    atk: u.atkBase + lv * u.atkPerLevel,
    def: u.defBase + lv * u.defPerLevel,
    spd: u.spdBase + lv * u.spdPerLevel,
    acc: (effects.accuracy || 0) * u.accPerPoint,
    eva: 0,
    mend: (levels.support || 0) * u.mendPerLevel,
    tech: (levels.hacking || 0) * u.techPerLevel,
  };
  const abilities = ['shove'];
  const worn = (kits || data.defaultKits?.[who] || []).filter(id => data.kits[id]).slice(0, 2);
  for (const id of worn) {
    for (const [s, v] of Object.entries(data.kits[id].stats || {})) stats[s] = (stats[s] || 0) + v;
    for (const a of data.kits[id].abilities || []) if (data.abilities[a] && !abilities.includes(a)) abilities.push(a);
  }
  for (const [id, a] of Object.entries(data.abilities)) {
    if (a.from && (levels[a.from.skill] || 0) >= a.from.level && !abilities.includes(id)) abilities.push(id);
  }
  // a kit that hits replaces the plain shove in the list a player sees (it stays as a fallback)
  return { id: who === 'jun' ? 'her' : 'you', who, side: 'us', name: name || (who === 'jun' ? 'Her' : 'You'), kind: 'person', kits: worn, abilities, ...stats, max: stats.hp };
}

// a creature at a place's level: more health and hit as places get deeper
export function foe(data, id, n, level, tune, alone = false) {
  const t = tune || getTune();
  const f = data.foes[id];
  const k = 1 + Math.max(0, level - 1) * t.foe.perLevel;
  const hp = Math.max(1, Math.round(f.hp * k * t.foe.hp * (alone ? t.foe.aloneHp : 1)));
  return {
    id: 'foe' + n, foe: id, side: 'them', name: f.name, kind: f.kind, big: !!f.big, shape: f.shape, color: f.color,
    hp, max: hp, atk: f.atk * k * t.foe.atk * (alone ? t.foe.aloneAtk : 1), def: f.def * (1 + (k - 1) / 2), spd: f.spd, acc: f.acc || 0, eva: f.eva || 0, mend: 0, tech: 0,
    abilities: f.abilities.map(a => a[0]), weights: Object.fromEntries(f.abilities),
  };
}

// how hard a place is right now: its own level, kept up with your Delving, deeper floors count more
export function placeLevel(area, depth, delving, tune) {
  const t = tune || getTune();
  return Math.max(area.level || 1, Math.floor((delving || 1) * t.foe.follow)) + (depth - 1) * t.foe.perDepth;
}

// what a fighter is, from what they can do: { front, dps, support, scan, hack } shares + words
export function roleOf(data, unit) {
  const share = Object.fromEntries(TAGS.map(tg => [tg, 0]));
  for (const id of unit.abilities) {
    if (id === 'shove') continue;
    for (const tg of data.abilities[id]?.tags || []) share[tg] += 1;
  }
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  for (const tg of TAGS) share[tg] /= total;
  const top = TAGS.filter(tg => share[tg] > 0).sort((a, b) => share[b] - share[a]);
  const words = !top.length ? 'bare hands' : top.length === 1 ? TAG_WORDS[top[0]] : 'mostly ' + TAG_WORDS[top[0]] + ', some ' + TAG_WORDS[top[1]];
  return { share, top: top[0] || 'dps', words };
}

// the creatures for one meeting, at this place's level. Alone, a group is smaller and lighter:
// going without her plays differently, it is never punished (decided Nov 13)
export function foesFor(data, ids, level, { alone = false, tune } = {}) {
  const t = tune || getTune();
  const list = alone && !ids.some(id => data.foes[id]?.big) ? ids.slice(0, Math.max(1, ids.length - t.foe.aloneFewer)) : ids;
  return list.map((id, i) => foe(data, id, i, level, t, alone));
}
