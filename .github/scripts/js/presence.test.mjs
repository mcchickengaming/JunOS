// hide / unhide (#29) and her house cube: desktop/presence.js (the rules main.js follows), webapp/js/desktop/welcome-back.js
// (how she greets him) and webapp/js/desktop/house-cube.js (the drawing's pure parts). No electron, no DOM.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../../../desktop/presence.js');
const W = await import('../../../webapp/js/desktop/welcome-back.js');
const H = await import('../../../webapp/js/desktop/house-cube.js');
const read = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');

test('the hide key toggles; hiding twice changes nothing; coming back says how long and why', () => {
  let t = 1000;
  const s = P.create({ now: () => t });
  assert.equal(s.isHidden(), false);
  assert.equal(s.hide('hotkey', 'stepout'), true);
  assert.equal(s.hide('tray'), false, 'already hidden');
  assert.equal(s.words(), P.WHY.hotkey);
  t += 90e3;
  const back = s.unhide('hotkey');
  assert.deepEqual(back, { awayMs: 90e3, why: 'hotkey', by: 'hotkey' });
  assert.equal(s.unhide('hotkey'), null, 'not hidden any more');
  assert.equal(s.hide('nonsense'), true);
  assert.equal(s.hidden.why, 'menu', 'unknown reasons count as a menu hide');
});

test('fullscreen: hides on the desktop and in compact only, comes back by itself, never against his wishes', () => {
  const s = P.create();
  const on = { autoOn: true };
  assert.equal(s.autoDecide({ ...on, fullscreen: true, mode: 'window' }), null, 'her window (the game) never auto-hides');
  assert.equal(s.autoDecide({ fullscreen: true, mode: 'stepout', autoOn: false }), null, 'switched off');
  assert.equal(s.autoDecide({ ...on, fullscreen: true, mode: 'stepout' }), 'hide');
  s.hide('fullscreen', 'stepout');
  assert.equal(s.autoDecide({ ...on, fullscreen: true, mode: 'stepout' }), null, 'stays hidden while it lasts');
  assert.equal(s.autoDecide({ ...on, fullscreen: false, mode: 'stepout' }), 'show', 'back when it ends');
  s.unhide('fullscreen');
  // he hid her himself: the end of a fullscreen app doesn't bring her back
  s.hide('hotkey', 'stepout');
  assert.equal(s.autoDecide({ ...on, fullscreen: false, mode: 'stepout' }), null);
  s.unhide('hotkey');
  // hidden by fullscreen, then he hid her on purpose: still his call
  s.hide('fullscreen', 'compact');
  s.hide('hotkey');
  assert.equal(s.hidden.why, 'hotkey');
  assert.equal(s.autoDecide({ ...on, fullscreen: false, mode: 'compact' }), null);
  s.unhide('hotkey');
  // he brought her back DURING the fullscreen app: no auto-hide again until it ends
  s.hide('fullscreen', 'stepout');
  s.unhide('hotkey', { fullscreen: true });
  assert.equal(s.autoDecide({ ...on, fullscreen: true, mode: 'stepout' }), null, 'his override holds');
  assert.equal(s.autoDecide({ ...on, fullscreen: false, mode: 'stepout' }), null);
  assert.equal(s.autoDecide({ ...on, fullscreen: true, mode: 'stepout' }), 'hide', 'the next fullscreen app hides her again');
  // switching auto-hide off while she's hidden by it brings her back
  s.hide('fullscreen', 'stepout');
  assert.equal(s.autoDecide({ fullscreen: true, mode: 'stepout', autoOn: false }), 'show');
});

test('the watcher line: Windows states, a window covering its monitor, and never her own windows', () => {
  assert.deepEqual(P.readWatchLine('1 0 500', []).fullscreen, false);
  for (const st of [2, 3, 4]) assert.equal(P.readWatchLine(`${st} 0 500`).fullscreen, true, 'state ' + st);
  assert.equal(P.readWatchLine('1 1 500').fullscreen, true, 'a borderless fullscreen game');
  assert.equal(P.readWatchLine('2 1 42', [42, 43]).fullscreen, false, 'her own window');
  assert.equal(P.readWatchLine('garbage'), null);
  assert.equal(P.readWatchLine(''), null);
  // the script asks for sizes and states only: no window titles, no pixels
  const ps = P.WATCH_PS(1234);
  assert.ok(!/GetWindowText|CopyFromScreen|BitBlt|PrintWindow/.test(ps), 'never titles or the screen');
  assert.ok(ps.includes('Get-Process -Id 1234'), 'quits with the app');
});

test('hotkeys: the polite one is the same key with Shift; the choices are in the main process', () => {
  assert.equal(P.politeKey('Ctrl+Alt+J'), 'Ctrl+Alt+Shift+J');
  assert.equal(P.politeKey('Pause'), 'Shift+Pause');
  assert.equal(P.politeKey('off'), null);
  assert.ok(P.HIDE_KEYS.some(([k]) => k === 'off'), 'he can have no hotkey');
  const main = read('desktop/main.js');
  assert.match(main, /hideKey: 'Ctrl\+Alt\+J', autoHide: true, shareHide: true, insideWay: 'house'/, 'the defaults (on, per the owner)');
  assert.match(main, /hideKey: Presence\.HIDE_KEYS/);
});

test('the house: beside her on the side with room, the door a short walk away, none at a cramped edge', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1040 };
  for (const herPx of [200, 440, 800]) {
    const herW = Math.round(herPx * 0.7);
    for (const x of [100, 800, 1500]) {
      const her = { x, y: wa.height - herPx - 100, width: herW, height: herPx + 100 };
      const p = P.housePlan({ her, herPx, wa });
      if (!p) { assert.ok(herPx >= 800, `no room for ${herPx}px at ${x}`); continue; }
      assert.ok(p.house.x >= wa.x - 1 && p.house.x + p.house.width <= wa.x + wa.width + 1, `the house stays on screen (${herPx} at ${x})`);
      assert.equal(p.house.y + p.house.height, wa.y + wa.height, 'it stands on the taskbar');
      assert.ok(p.door.x >= p.house.x && p.door.x + p.door.width <= p.house.x + p.house.width, 'the door is in the house');
      const walk = Math.abs(p.standX - her.x);
      assert.ok(walk < herPx * 0.7, `a short walk (${walk}px for ${herPx}px)`);
      for (const r of [p.house, { x: her.x, y: her.y, width: her.width, height: her.height }])
        assert.ok(r.x >= p.overlay.x && r.x + r.width <= p.overlay.x + p.overlay.width, 'the overlay covers her and the house');
    }
  }
  // squeezed into a corner on a tiny screen: she just goes in
  assert.equal(P.housePlan({ her: { x: 0, y: 0, width: 300, height: 500 }, herPx: 440, wa: { x: 0, y: 0, width: 600, height: 600 } }), null);
});

test('the timeline: beats in order, speed scales them but not her walk, and the drawing waits for her window', () => {
  const a = P.houseTimeline('in', 1, 1200), q = P.houseTimeline('in', 1.6, 1200);
  assert.deepEqual(a.beats.map(b => b.id), ['toss', 'bounce', 'light', 'holo', 'build', 'open', 'walk', 'enter', 'grow', 'fade']);
  for (let i = 1; i < a.beats.length; i++) assert.equal(a.beats[i].at, a.beats[i - 1].at + a.beats[i - 1].ms);
  assert.ok(q.total < a.total, 'quick is quicker');
  assert.equal(q.beats.find(b => b.id === 'walk').ms, 1200, 'her walk keeps her own pace');
  assert.ok(a.beats.find(b => b.id === 'enter').wait, 'waits for her window at the door');
  const o = P.houseTimeline('out');
  assert.deepEqual(o.beats.map(b => b.id), ['shrink', 'build', 'open', 'out', 'close', 'pack', 'catch']);
  assert.ok(o.beats.find(b => b.id === 'out').wait);
  // growing out of the door: starts at the door, ends at the window, eased
  const from = { x: 10, y: 20, width: 30, height: 40 }, to = { x: 100, y: 50, width: 900, height: 700 };
  assert.deepEqual(P.growBounds(from, to, 0), from);
  assert.deepEqual(P.growBounds(from, to, 1), to);
  assert.ok(P.growBounds(from, to, 0.5).width > (30 + 900) / 2, 'fast first, settling in');
});

test('the drawing: the beat at any time, the hold, the label only goes up, colors and see-through are the player\'s', () => {
  const tl = P.houseTimeline('in', 1, 800);
  assert.equal(H.beatAt(tl, 0).id, 'toss');
  assert.equal(H.beatAt(tl, 700).id, 'bounce');
  assert.equal(H.beatAt(tl, tl.total + 1).done, true);
  assert.ok(H.passed(tl, 'toss', 700) && !H.passed(tl, 'build', 700));
  let last = -1;
  for (let f = 0; f <= 1; f += 0.05) { const n = Number(H.label('in', f, 1).match(/(\d+)%/)[1]); assert.ok(n >= last); last = n; }
  assert.match(H.label('in', 1, 2), /100%$/);
  const store = (o) => ({ getItem: (k) => (k in o ? JSON.stringify(o[k]) : null) });
  assert.equal(H.readTheme(store({}))['--house-glow'], H.COLORS['--house-glow']);
  assert.equal(H.readTheme(store({ 'desktop.theme': { '--house-glow': '#123456', '--house-wall': 'red' } }))['--house-glow'], '#123456');
  assert.equal(H.readTheme(store({ 'desktop.theme': { '--house-wall': 'red' } }))['--house-wall'], H.COLORS['--house-wall'], 'only real colors');
  assert.equal(H.readFx(store({ 'desktop.fx': { hAlpha: 0.05 } })).alpha, 0.2, 'never invisible');
  assert.equal(H.readFx(store({})).label, 'auto');
  // the colors are on the Visuals page, the fx defaults in fx.js
  const set = read('webapp/js/desktop-settings.js');
  for (const k of Object.keys(H.COLORS)) assert.ok(set.includes(`'${k}'`), k + ' has a color row');
  assert.match(read('webapp/js/desktop/fx.js'), /hAlpha: 1, hLabel: 'auto'/);
});

test('the play loop holds at a wait beat until main.js says resume', async () => {
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} closePath() {} rect() {} };
  let t = 0;
  const frames = [];
  const raf = (f) => frames.push(f);
  const canvas = { width: 100, height: 100, getContext: () => new Proxy({}, { get: (o, k) => (k === 'canvas' ? canvas : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true }) };
  const tl = P.houseTimeline('in', 1, 0);
  const msg = { dir: 'in', timeline: tl, herPx: 100, plan: { house: { x: 0, y: 0, width: 100, height: 100 }, door: { x: 40, y: 50, width: 20, height: 50 }, hand: { x: 0, y: 50 }, side: 1 } };
  const pl = H.play(canvas, msg, { storage: { getItem: () => null }, now: () => t, raf });
  let finished = false;
  pl.done.then(() => { finished = true; });
  const run = () => { const f = frames.shift(); if (f) f(); };
  t = tl.total + 5000; run();
  await new Promise(r => setImmediate(r));
  assert.equal(finished, false, 'held at the door');
  pl.resume();
  t += tl.total; run();
  await new Promise(r => setImmediate(r));
  assert.equal(finished, true, 'goes on once resumed');
});

test('welcome back: never upset, bigger the longer he was gone, quiet after a fullscreen app', () => {
  const never = () => 0.999, always = () => 0;
  assert.equal(W.welcome(3000, 'hotkey', { rand: always }).size, 'none');
  assert.equal(W.welcome(60e3, 'hotkey').size, 'glance');
  assert.equal(W.welcome(20 * 60e3, 'hotkey').size, 'wave');
  assert.equal(W.welcome(3 * 3600e3, 'hotkey').size, 'happy');
  assert.equal(W.welcome(20 * 3600e3, 'hotkey', { bond: 4 }).size, 'missed');
  assert.equal(W.welcome(20 * 3600e3, 'hotkey', { bond: 1 }).size, 'happy', 'shyer early on');
  assert.equal(W.welcome(3 * 3600e3, 'fullscreen', { rand: always }).size, 'glance');
  assert.equal(W.welcome(3 * 3600e3, 'fullscreen', { rand: always }).line, false, 'he was busy: no line');
  assert.equal(W.welcome(20 * 3600e3, 'hotkey', { rand: always, talk: 0 }).line, false, 'quiet: no line');
  assert.equal(W.welcome(20 * 3600e3, 'hotkey', { rand: never }).line, false);
  for (const [, size] of W.STEPS) { assert.ok(W.PLAY[size] && W.WORDS[size], size); assert.ok(!/upset|sulk|angry|hurt|mad/.test(W.WORDS[size])); }
  // the moves exist on her body
  const body = read('webapp/js/desktop/body.js');
  for (const k of new Set(Object.values(W.PLAY).flatMap(p => p.moves).concat(['toss', 'catch'])))
    assert.ok(body.includes(`${k}:`) || body.includes(`'${k}'`), 'Body.play knows ' + k);
});
