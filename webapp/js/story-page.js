// story.html's script: one place of the story, inside the game world (#34). The map sent us here
// (places.json go: { story: <spot> } → game-world.js → story.html?at=<spot>). Everything that happens is
// the engine's (js/core/story/story-engine.js); keeping it is the door's (js/core/story/story.js); drawing it is
// story-view.js. Leaving is the game world's own "Back to the map".

import * as Door from './core/story/story.js?v=5';
import { createView } from './story-view.js?v=4';
import { createScenePlayer } from './scene-view.js?v=5';

const { En, GameSave } = Door;
const $ = (id) => document.getElementById(id);
const spot = new URLSearchParams(location.search).get('at') || '';
let data = null, game = null, ctx = null, view = null, busy = false;

const whenWords = () => `Day ${game.g.x.day}, ${En.SLOTS[game.g.x.slot]}` + (game.g.s.chapter ? ' · ' + game.g.s.chapter : '');

function drawHere() {
  $('when').textContent = whenWords();
  const idle = !game.g.x.play && !game.g.x.over;
  const list = idle ? En.triggersHere(data.story, game.g) : [];
  $('here').hidden = !idle || list.length > 0;
  if (!idle) return;
  if (list.length) view.buttons(list.map(t => [t.name, () => act(En.trigger(data.story, game.g, t.id, ctx))]));
  $('todo').textContent = 'Nothing more to do here for now. The map is behind you.';
  const sn = En.spineNext(data.story, game.g, ctx);
  $('note').textContent = sn && sn.at.length && !sn.at.includes(game.g.x.at) && !sn.missing.length
    ? 'The story goes on at: ' + sn.at.map(p => data.story.spots[p]?.name || p).join(' or ') + '.' : '';
}

// show what the engine said, keep it, then offer what's next
async function act(events) {
  if (busy) return;
  busy = true;
  view.show(events, game.g.x.play?.wait);
  const kept = await Door.settle(data, game, events);
  busy = false;
  if (kept.reloaded) { location.reload(); return; }
  if (kept.error) $('note').textContent = GameSave.say(kept.error);
  for (const gr of kept.grants) if (gr.got) view.note('You got something. (The game\'s menu > Everything you own.)');
  ctx = await Door.context(data, game.g, { placeName: undefined });
  if (!game.g.x.play) drawHere(); else $('here').hidden = true;
  $('when').textContent = whenWords();
}
const answer = (input) => act(En.step(data.story, game.g, input, ctx));

// a full scene (#22): played right here by the scene engine, remembering through the story's own state; it is
// kept (with the rest of the story) when it ends and the event goes on
// Coming back to one left half-way (owner, Nov 16): Start it again / Skip opening / Skip scene. Nothing of the
// half-played one was kept; skipping the scene writes nothing about it and the event simply goes on.
let resuming = false;
function playScene(e, box) {
  $('here').hidden = true;
  const start = (skipOpening) => {
    box.textContent = '';
    createScenePlayer(box, { scene: e.play, lib: data.story.lib, ctx: En.sceneCtx(data.story, game.g, { ...ctx, now: Date.now() }), seed: Date.now() % 1000000,
      names: ctx.names, npcs: data.story.npcs, skipOpening, onEnd: (end) => answer({ scene: { end } }) });
  };
  if (!resuming) { start(false); return; }
  resuming = false;
  const ask = document.createElement('div');
  ask.className = 'sv-beat narr';
  ask.textContent = `You left in the middle of “${e.play.name}”.`;
  const row = document.createElement('div');
  row.className = 'sv-acts';
  for (const [label, fn] of [['Start it again', () => start(false)], ['Skip opening', () => start(true)], ['Skip scene', () => { box.textContent = ''; answer({ scene: { end: 'skip' } }); }]]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); row.append(b);
  }
  box.append(ask, row);
}

async function gameOver(box) {
  const r = await Door.loadLastSave();
  // a load reloads this page (GameSave.onChange below) with the story that save put back
  if (r.error) { const p = document.createElement('div'); p.className = 'sv-note'; p.textContent = r.error === 'none' ? 'There\'s no game save yet. Start a new game from the menu (Esc).' : GameSave.say(r.error); box.append(p); }
}

async function init() {
  data = await Door.loadData();
  const sp = data.story.spots[spot];
  if (!sp) { $('place').textContent = 'Nowhere'; $('note').textContent = 'The story doesn\'t know this place.'; return; }
  const onMap = data.places.places.find(p => p.go?.story === spot);
  $('place').textContent = onMap?.name || sp.name;
  game = await Door.open(data);
  if (game.off) { $('note').textContent = GameSave.say('off'); return; }
  if (game.error) { $('note').textContent = GameSave.say(game.error); return; }
  ctx = await Door.context(data, game.g);
  view = createView($('scene'), { onAnswer: answer, onGameOver: gameOver, onScene: playScene, names: ctx.names, npcs: data.story.npcs });
  GameSave.startClock();
  GameSave.onChange((e) => { if (e?.type === 'loaded') location.reload(); });
  // something was left half-way (the window closed mid-event, or a save from before a fight): carry on
  if (game.g.x.play || game.g.x.over) { resuming = game.g.x.play?.wait === 'scene'; view.show(En.pending(data.story, game.g, ctx), game.g.x.play?.wait); $('when').textContent = whenWords(); return; }
  await act(En.arrive(data.story, game.g, spot, { ...ctx, placeName: onMap?.name }));
}
init().catch((e) => { $('note').textContent = 'The story could not start: ' + (e && e.message); console.error(e); });
