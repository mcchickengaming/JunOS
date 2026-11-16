// the scene engine's door for pages (#22). The engine (scene-engine.js) and the owner's-scenes rules (scene-mine.js)
// are pure; this is the one place that touches storage and the network:
//   const lib = await SceneDoor.loadLib();     // data/scenes.json: shared slots, full scenes, the ordinary things
//   SceneDoor.install(lib, { slots, npcs });   // the owner's own scenes now reach every slot (scenes.js setCustom)
// The story's door (core/story/story.js) and the delve's (core/delve/delve.js) both call these, so a scene the
// owner made shows up wherever its slot is played, through the same gate as everything else.
// His scenes live in localStorage 'jun.scenes.mine' (on his PC only; in save points like every local setting;
// never in a game save: they're content, not progress).

import * as Scenes from '../delve/scenes.js?v=3';
import * as Mine from './scene-mine.js?v=3';
import * as Sc from './scene-engine.js?v=3';

export { Mine, Sc, Scenes };

let libCache = null;
export function loadLib(url = 'data/scenes.json') {
  if (!libCache) libCache = fetch(url, { cache: 'no-cache' }).then(r => r.json());
  return libCache;
}

let known = { lib: null, slots: null, npcs: null }, mineNow = Mine.blank(), droppedNow = [];
function read() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(Mine.KEY) || 'null'); } catch (e) { /* private mode or damaged: none */ }
  const r = Mine.clean(raw, known.lib, { npcs: known.npcs });   // slots aren't checked here: a page only knows its own
  mineNow = r.mine; droppedNow = r.dropped;
}
export const mine = () => mineNow;
export const dropped = () => droppedNow;

// call once the library is loaded. Safe to call again (another door, or after the maker saved).
export function install(lib, { npcs = null } = {}) {
  known = { lib, npcs: npcs || known.npcs };
  read();
  Scenes.setCustom((slotId, tier) => Mine.variantsFor(mineNow, slotId, tier));
  return mineNow;
}
export function saveMine(next) {
  const r = Mine.clean(next, known.lib, { npcs: known.npcs });
  try { localStorage.setItem(Mine.KEY, JSON.stringify(r.mine)); } catch (e) { return { error: 'Your PC wouldn\'t keep it (storage is full or private).' }; }
  mineNow = r.mine; droppedNow = r.dropped;
  return { mine: r.mine, dropped: r.dropped };
}
// another window changed them (the maker is its own window): pick it up
export function watch(fn) {
  window.addEventListener('storage', (e) => { if (e.key === Mine.KEY) { read(); if (fn) fn(mineNow); } });
}
// every full scene there is: ours and his
export const allScenes = (lib) => ({ ...(lib?.scenes || {}), ...Object.fromEntries(Object.entries(Mine.scenesOf(mineNow)).filter(([, sc]) => !sc.simple)) });
