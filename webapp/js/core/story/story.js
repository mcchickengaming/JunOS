// the story-event engine's door for pages (#34). The engine (story-engine.js) is pure; this is the one place
// that talks to her server. A page only ever does:
//
//   const data = await StoryDoor.loadData();                 // the story, the map, the difficulty presets
//   const game = await StoryDoor.open(data);                 // { g, epoch }: story state + the events section
//   const ctx  = await StoryDoor.context(data, game.g);      // the gate, her bond stage, levels, the preset
//   const evs  = En.arrive(data.story, game.g, 'home', ctx); // … En.trigger / En.step …
//   await StoryDoor.settle(data, game, evs);                 // write both sections, give grants, autosave at beats
//
// What goes where: what the story remembers is STORY STATE (the game's `story` section, story-state.js);
// what only the engine needs is the game's `events` section. Both are written together with the epoch
// they were read at, so a game that was replaced meanwhile (a load in another window) is never written
// over: the answer is 'reloaded' and the page reloads. Things are only ever given by the progression
// service's story grants (by id, once). Autosaves happen at the beats the engine names.

import * as En from './story-engine.js?v=4';
import * as Story from './story-state.js?v=3';
import * as GameSave from '../gamesave.js?v=5';
import * as Progress from '../progress.js?v=2';
import * as Gate from '../gate.js?v=6';
import * as Difficulty from '../difficulty.js?v=2';
import { api } from '../api.js?v=1';
import * as SceneDoor from '../scene/scene-door.js?v=4';

export { En, Story, GameSave, Difficulty, SceneDoor };
export const HEARD_KEY = 'jun.story.heard';   // the kinds of things that happened lately, for the two-Juns link (#36). Desktop Jun's side: never in a game save.
export const HEARD_MAX = 30;

let cache = null;
export async function loadData() {
  if (!cache) {
    const j = (u) => fetch(u, { cache: 'no-cache' }).then(r => r.json());
    // the scene library (#22) is laid under the story's own scene slots, and the owner's own scenes are let in
    cache = Promise.all([j('data/story.json'), j('data/places.json'), Difficulty.loadData(), SceneDoor.loadLib()]).then(([story, places, diff, lib]) => {
      story = En.Sc.attach(story, lib, 'story');
      SceneDoor.install(lib, { npcs: story.npcs });
      return { story, places, diff };
    });
  }
  return cache;
}

// the live game. A game with no story yet starts a fresh one (nothing is written until something happens).
export async function open(data) {
  const ids = Difficulty.ids(data.diff), dflt = Difficulty.defaultId(data.diff);
  const a = await Story.open(GameSave, { difficultyIds: ids, fallbackDifficulty: dflt });
  if (a.off || a.error) return { off: !!a.off, error: a.error || null, g: En.newGame(data.story, 1, dflt), epoch: null };
  const b = await GameSave.section(En.SECTION);
  const fresh = !b.data;
  return { g: { s: a.state, x: En.cleanX(b.data, data.story, Date.now() % 1000000) }, epoch: b.epoch ?? a.epoch, fresh };
}

// write the story back: both sections at once, with the epoch they were read at
export async function commit(data, game) {
  if (game.epoch === null || game.epoch === undefined) return { skipped: 'no game' };
  const name = Difficulty.preset(data.diff, game.g.s.difficulty).name;
  return GameSave.put({ [Story.SECTION]: { ...game.g.s, _summary: Story.summary(game.g.s, name) }, [En.SECTION]: game.g.x }, { epoch: game.epoch });
}

let rel = null;
async function relationship() {
  if (rel) return rel;
  try { const j = await (await api('relationship.php')).json(); rel = { stage: j.bond?.stage || 1 }; } catch (e) { rel = { stage: 1 }; }
  return rel;
}
async function levels() {
  const out = { player: {}, jun: {} };
  try {
    const j = await Progress.load({ peek: true });
    for (const o of ['player', 'jun']) for (const [id, k] of Object.entries(j.state?.owners?.[o]?.skills || {})) out[o][id] = k.level;
  } catch (e) { /* offline: level 1s */ }
  return out;
}
export function names() {
  const get = (k, d) => { try { return (localStorage.getItem(k) || '').trim() || d; } catch (e) { return d; } };
  return { you: get('omega.names.player', 'you'), her: get('omega.names.bot', 'Jun') };
}

// what the engine needs to know from outside the story. over: { stage, together, preset … } (the lab's "what if")
export async function context(data, g, over = {}) {
  const [r, lv] = await Promise.all([relationship(), levels()]);
  try { await Gate.loadComfort(); } catch (e) { /* the cache stands */ }
  return {
    gateCheck: Gate.check, gate: { comfort: Gate.comfort(), mode: 'windowed', screenShare: false },
    stage: r.stage, levels: lv, names: names(),
    preset: Difficulty.preset(data.diff, g.s.difficulty),
    now: Date.now(), salt: Date.now() % 1000000,
    ...over,
  };
}

function hear(kinds) {
  if (!kinds.length) return;
  try {
    const list = JSON.parse(localStorage.getItem(HEARD_KEY) || '[]');
    for (const k of kinds) list.push({ k, at: Date.now() });
    localStorage.setItem(HEARD_KEY, JSON.stringify(list.slice(-HEARD_MAX)));
  } catch (e) { /* private mode: nothing heard */ }
}

// after any engine call: keep what happened. → { reloaded?, grants: [{ id, got }], saved }
export async function settle(data, game, events) {
  const out = { grants: [], saved: false };
  const r = await commit(data, game);
  if (r && r.error === 'reloaded') return { ...out, reloaded: true };
  if (r && r.error) out.error = r.error;
  for (const e of events) {
    if (e.type !== 'grant') continue;
    const got = await Progress.story(e.id);          // once per id on her server: a second ask is a quiet "already given"
    out.grants.push({ id: e.id, got: got && !got.error && !got.off ? got : null, again: got?.error === 'already_given' });
  }
  hear(events.filter(e => e.type === 'tell').map(e => e.kind));
  const beat = events.filter(e => e.type === 'autosave').pop();
  if (beat && !out.error) { const s = await GameSave.autosave(beat.reason, { force: true }); out.saved = !s.error && !s.skipped; }
  return out;
}

// the newest save a game over can go back to (never a before-load safety save)
export async function loadLastSave() {
  const v = await GameSave.load();
  const last = (v.saves || []).find(sv => sv.kind !== 'before_load');
  if (!last) return { error: 'none' };
  return GameSave.loadSave(last.id);
}
