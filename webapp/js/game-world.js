// game-world.html's script (her pages allow no inline scripts). See the comment at the top of game-world.html.
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
$('goDelve').addEventListener('click', () => openPlace('delve-lab.html', 'Under the city'));
$('hubBtn').addEventListener('click', toHub);
// the menu: the game's own settings, loaded fresh each time it opens (a load in there changes everything)
const openMenu = () => { $('menuFrame').src = 'desktop-settings.html?embed=game'; $('menu').hidden = false; };
const closeMenu = () => { $('menu').hidden = true; $('menuFrame').src = 'about:blank'; };
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
