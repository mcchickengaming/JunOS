// the owner's own scenes (#22, the scene maker). Pure: the page door (scene-door.js) does the storage.
// What's kept: { v, on, list: [{ on, slot, scene }] }: `on` (the one switch for all of them), and per entry its own
// switch, the slot it plays in (or null: album and test only) and the scene itself, in the engine's own shape
// (scene-engine.js). They reach every slot through ../delve/scenes.js setCustom(), so the ONE gate still decides
// whether each can show: a scene tagged 18+ needs 18+ on (and confirmed), like anything else.
//
// A file from someone else (.junscenes) is never trusted: every scene is checked by the engine's rulebook, what
// doesn't pass is left out by name, and everything rated arrives SWITCHED OFF (the Nov 10 rule for shared things).

import { checkScene, ID_RE, TIERS } from './scene-engine.js?v=3';

export const KEY = 'jun.scenes.mine';
export const V = 1;
export const MAX = 200;
export const FORMAT = 'junscenes';

export const blank = () => ({ v: V, on: true, list: [] });
const tierOf = (sc) => (sc && sc.tier) || 'everyday';

// anything stored or uploaded → a safe set. slots = the slot ids that exist ({ id: slot }); an entry for a slot
// that's gone stays, without a slot. → { mine, dropped: [{ name, why }] }
export function clean(raw, lib, { slots = null, npcs = null } = {}) {
  const mine = blank(), dropped = [];
  if (!raw || typeof raw !== 'object') return { mine, dropped };
  mine.on = raw.on !== false;
  const ids = new Set();
  for (const en of Array.isArray(raw.list) ? raw.list.slice(0, MAX) : []) {
    const sc = en && en.scene;
    const name = (sc && (sc.name || sc.id)) || 'A scene';
    if (!sc || typeof sc !== 'object' || !ID_RE.test(sc.id || '')) { dropped.push({ name, why: 'It isn\'t a scene.' }); continue; }
    if (ids.has(sc.id) || lib?.scenes?.[sc.id]) { dropped.push({ name, why: 'Another scene already has its id.' }); continue; }
    const slot = typeof en.slot === 'string' && (!slots || slots[en.slot]) ? en.slot : null;
    const bad = checkScene(sc, lib, { npcs });
    if (bad.length) { dropped.push({ name, why: bad[0] }); continue; }
    ids.add(sc.id);
    mine.list.push({ on: en.on !== false, slot, scene: sc });
  }
  return { mine, dropped };
}

// what a slot gets from the owner for one tier: the scenes themselves (a full scene, or a simple one as lines)
export function variantsFor(mine, slotId, tier) {
  if (!mine || !mine.on) return [];
  return mine.list.filter(en => en.on && en.slot === slotId && tierOf(en.scene) === tier)
    .map(en => (en.scene.simple ? { id: en.scene.id, name: en.scene.name, tier, where: en.scene.where, minStage: en.scene.minStage, flavors: en.scene.flavors, themes: en.scene.themes, who: en.scene.who, consent: en.scene.consent, agreement: en.scene.agreement, beats: en.scene.opening } : en.scene));
}
// every scene of the owner's by id (for the album and the maker)
export const scenesOf = (mine) => Object.fromEntries((mine?.list || []).map(en => [en.scene.id, en.scene]));

// a name → an id nobody has yet
export function slug(name, taken = []) {
  let base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 18) || 'scene';
  let id = base, n = 2;
  while (taken.includes(id)) id = base.slice(0, 18 - String(n).length - 1) + '_' + n++;
  return id;
}

export function toFile(mine, { made = 0, pick = null } = {}) {
  return JSON.stringify({ format: FORMAT, v: V, made, list: (mine?.list || []).filter(en => !pick || pick.includes(en.scene.id)).map(en => ({ slot: en.slot, scene: en.scene })) }, null, 1);
}
// → { list: [{ on, slot, scene }], dropped: [{ name, why }], rated: n } or { error }
export function fromFile(text, lib, have = blank(), o = {}) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return { error: 'That isn\'t a scenes file.' }; }
  if (!j || j.format !== FORMAT) return { error: 'That isn\'t a scenes file.' };
  if (!(j.v <= V)) return { error: 'That file was made by a newer version.' };
  const taken = [...have.list.map(en => en.scene.id), ...Object.keys(lib?.scenes || {})];
  const incoming = (Array.isArray(j.list) ? j.list : []).map(en => {
    // an id someone here already has gets a new one: an import never replaces a scene of yours
    if (en && en.scene && taken.includes(en.scene.id)) en = { ...en, scene: { ...en.scene, id: slug(en.scene.name || en.scene.id, taken) } };
    if (en && en.scene) taken.push(en.scene.id);
    return en;
  });
  const { mine, dropped } = clean({ on: true, list: incoming }, lib, o);
  let rated = 0;
  for (const en of mine.list) {
    const sc = en.scene;
    const isRated = [sc, ...Object.values(sc.phases || {}), ...Object.values(sc.actions || {}), ...Object.values(sc.endings || {})].some(x => TIERS.indexOf(tierOf(x)) > 0 || x.consent);
    en.on = !isRated;   // everything rated arrives switched off: you switch it on yourself
    if (isRated) rated += 1;
  }
  return { list: mine.list, dropped, rated };
}
