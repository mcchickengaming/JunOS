// house-cube.html's own script (in a file: her pages' security rules allow no inline scripts, which is why the
// cube and house never showed on Windows, owner Nov 15). It only draws; main.js sends the plan and closes the window.
import * as House from './house-cube.js?v=1';
const c = document.getElementById('c');
const fit = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; c.getContext('2d').setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
fit();
addEventListener('resize', fit);
const D = window.junDesktop;
// ?demo=in|out plays it with a made-up plan (for a quick look in a browser)
const demo = new URLSearchParams(location.search).get('demo');
let player = null;
// a frame on time even if the window's animation frames are held back (a click-through window on Windows)
const raf = (f) => { let ran = false; const go = () => { if (!ran) { ran = true; f(); } }; requestAnimationFrame(go); setTimeout(go, 40); };
const run = (msg) => { player = House.play(c, msg, { loadLook: House.lookLoader(), raf }); player.done.then(() => D?.houseDone?.()); };
if (D?.onHouse) D.onHouse((m) => { if (m?.type === 'resume') player?.resume(); else if (m?.type === 'play') run(m); });
else if (demo) {
  const herPx = 440, floor = innerHeight - 10;
  const house = { x: 360, y: floor - herPx, width: herPx * 1.15, height: herPx };
  const plan = { house, door: { x: house.x + house.width / 2 - house.width * 0.1, y: floor - herPx * 0.42, width: house.width * 0.2, height: herPx * 0.42 }, hand: { x: 220, y: floor - herPx * 0.55 }, side: 1 };
  const beats = demo === 'out' ? ['shrink', 'build', 'open', 'out', 'close', 'pack', 'catch'] : ['toss', 'bounce', 'light', 'holo', 'build', 'open', 'enter', 'grow', 'fade'];
  const ms = { toss: 650, bounce: 700, light: 450, holo: 900, build: 1100, open: 450, enter: 500, grow: 520, fade: 450, shrink: 520, out: 500, close: 450, pack: 880, catch: 650 };
  let t = 0; const timeline = { beats: beats.map(id => { const b = { id, at: t, ms: ms[id] }; t += ms[id]; return b; }) };   // no waits in the demo
  timeline.total = t;
  run({ dir: demo, plan, timeline, herPx });
}
