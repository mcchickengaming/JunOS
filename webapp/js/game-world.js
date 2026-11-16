// game-world.html's script (her pages allow no inline scripts). See the comment at the top of game-world.html.
// The map comes from data/places.json through js/core/world/places.js, read against the game's story state, so the
// story engine (#34) adds and unlocks places by data. window.JunGame is the door for the story engine:
//   JunGame.refresh()            redraw the map (after the story changed a flag)
//   JunGame.open(url, title)     show one of her pages inside the world (a place, a scene page)
//   JunGame.toMap()              back to the map
//   JunGame.startStory = (sceneId, place) => …   set by the story engine; places with go: { story } call it
import * as Places from './core/world/places.js?v=1';
import * as GameSave from './core/gamesave.js?v=5';
import * as Story from './core/story/story-state.js?v=3';
const $ = (id) => document.getElementById(id);
const world = document.querySelector('.world');
let play = null;
const openPlace = (url, title) => {
  if (play) play.remove();
  play = document.createElement('iframe');
  play.className = 'play';
  play.title = title;
  play.src = url;
  world.appendChild(play);
  $('title').textContent = title;
  $('hubBtn').hidden = false;
};
const toHub = () => { if (play) play.remove(); play = null; $('title').textContent = 'The game world'; $('hubBtn').hidden = true; };
$('hubBtn').addEventListener('click', () => { toHub(); drawMap(); });
// "Moments together" (#22): the album of the scenes you've been in (scene.html + js/scene-page.js)
$('momentsBtn').addEventListener('click', () => openPlace('scene.html', 'Moments together'));

// the map
let placesData = null;
async function drawMap() {
  const host = $('places');
  try { placesData = placesData || await (await fetch('data/places.json', { cache: 'no-cache' })).json(); }
  catch (e) { host.textContent = 'The map didn\'t load.'; return; }
  let state = Story.blank();
  try { state = (await Story.open(GameSave)).state; } catch (e) { /* no game yet: a fresh story */ }
  host.innerHTML = '';
  for (const p of Places.view(placesData, state)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'place';
    b.dataset.place = p.id;
    b.disabled = p.state !== 'open';
    const name = document.createElement('b'); name.textContent = p.name;
    const line = document.createElement('span'); line.textContent = p.line;
    b.append(name, line);
    if (p.go) b.addEventListener('click', () => go(p));
    host.appendChild(b);
  }
}
function go(p) {
  $('placeNote').textContent = '';
  if (p.go.url) openPlace(p.go.url, p.name);
  else if (p.go.story) {
    if (typeof window.JunGame.startStory === 'function') window.JunGame.startStory(p.go.story, p);
    else $('placeNote').textContent = 'That one opens once the story engine is in.';
  }
}
// the story-event engine's door (#34): a place with go: { story: <spot> } opens that spot of the story as a scene page
// in the world (story.html + js/story-page.js; the engine is js/core/story/engine.js). The map redraws when you come back.
const startStory = (sceneId, place) => openPlace('story.html?at=' + encodeURIComponent(sceneId), place?.name || 'The story');
window.JunGame = { refresh: drawMap, open: openPlace, toMap: () => { toHub(); drawMap(); }, startStory };
GameSave.onChange((e) => { if (e?.type === 'loaded') { toHub(); drawMap(); } });
drawMap();
// the menu: the game's own settings, loaded fresh each time it opens (a load in there changes everything)
const openMenu = () => { $('menuFrame').src = 'desktop-settings.html?embed=game'; $('menu').hidden = false; };
const closeMenu = () => { $('menu').hidden = true; $('menuFrame').src = 'about:blank'; if (!play) drawMap(); };   // a load in the menu may change the map
const toggleMenu = () => ($('menu').hidden ? openMenu() : closeMenu());
$('menuBtn').addEventListener('click', openMenu);
$('menuClose').addEventListener('click', closeMenu);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); toggleMenu(); } });
addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === 'jun:menu-close') closeMenu();
});
// back to her: the page around us (index.html) closes the world. Opened on its own, it goes to her window.
$('back').addEventListener('click', () => {
  if (parent !== window) parent.postMessage({ type: 'jun:leave-game' }, location.origin);
  else location.href = 'index.html';
});
