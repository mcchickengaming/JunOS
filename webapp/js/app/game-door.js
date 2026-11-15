// her window's door into the game world (Nov 15, the settings split): the sidebar's "Enter the game world" opens
// game-world.html over her window; its "Back to her" closes it. A plain button for now.
const btn = document.getElementById('gameWorldBtn');
let frame = null;
const close = () => { if (frame) frame.remove(); frame = null; };
btn?.addEventListener('click', () => {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.id = 'gameWorld';
  frame.title = 'The game world';
  frame.src = 'game-world.html';
  document.body.appendChild(frame);
  frame.focus();
});
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'jun:leave-game') close();
});
