// scene.html's script: "Moments together", the album of full scenes (#22) inside the game world. Reads the game's
// story state through the story's door (what you've reached is remembered there, so it rides in game saves), lists
// the scenes with a part reached, and plays one again with the same player as everywhere (js/scene-view.js).
// Playing again is a REPLAY: nothing is remembered, written or saved. What's switched off isn't listed.

import * as Door from './core/story/story.js?v=4';
import { createScenePlayer } from './scene-view.js?v=4';

const { En, GameSave, SceneDoor } = Door;
const Sc = En.Sc;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const timesWords = (n) => (n <= 0 ? 'not yet played to an end' : n === 1 ? 'once' : n === 2 ? 'twice' : n < 6 ? 'a few times' : 'many times');

let data = null, game = null, ctx = null;

function draw() {
  const sctx = En.sceneCtx(data.story, game.g, ctx, undefined, { replay: true });
  const scenes = SceneDoor.allScenes(data.story.lib);
  // only what could show right now: a Flirty moment isn't listed while Flirty is off
  const list = Sc.album(scenes, sctx.mem).filter(a => Sc.ask(scenes[a.id], scenes[a.id], sctx).ok);
  $('play').hidden = true; $('play').textContent = '';
  const host = $('list');
  host.hidden = false; host.textContent = '';
  $('title').textContent = 'Moments together';
  $('note').textContent = list.length ? 'The moments you\'ve stayed in, and what ' + (ctx.names.her || 'she') + ' has to say about them. Playing one again changes nothing.' : 'Nothing here yet. Spend an evening in at Home, once the story has given you a home to spend it in.';
  for (const a of list) {
    const box = el('div', 'moment');
    box.append(el('h2', '', a.name), el('div', 'note', 'Played ' + timesWords(a.played) + '.'));
    const ul = el('ul');
    for (const p of a.parts) {
      const li = el('li', p.have ? '' : 'no');
      if (p.have) { li.append(el('b', '', p.name)); if (p.line) li.append(el('span', '', ` — “${sctx.fill(p.line)}”`)); }
      else li.textContent = '· · ·';
      ul.append(li);
    }
    const again = el('button', '', 'Play it again'); again.type = 'button';
    again.addEventListener('click', () => replay(scenes[a.id]));
    box.append(ul, again);
    host.append(box);
  }
}

function replay(scene) {
  $('list').hidden = true;
  $('title').textContent = scene.name;
  $('note').textContent = 'Playing it again: nothing here is remembered or saved.';
  const host = $('play');
  host.hidden = false; host.textContent = '';
  createScenePlayer(host, { scene, lib: data.story.lib, ctx: En.sceneCtx(data.story, game.g, { ...ctx, now: Date.now() }, undefined, { replay: true }), seed: Date.now() % 1000000,
    names: ctx.names, npcs: data.story.npcs, onEnd: draw });
}

async function init() {
  data = await Door.loadData();
  game = await Door.open(data);
  if (game.off) { $('note').textContent = GameSave.say('off'); return; }
  if (game.error) { $('note').textContent = GameSave.say(game.error); return; }
  ctx = await Door.context(data, game.g);
  GameSave.onChange((e) => { if (e?.type === 'loaded') location.reload(); });
  draw();
}
if (typeof document !== 'undefined') init().catch((e) => { $('note').textContent = 'The album could not open: ' + (e && e.message); console.error(e); });
