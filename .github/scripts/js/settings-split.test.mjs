// The settings split (Nov 15, owner): Settings is about her; the game has its own world (game-world.html, opened
// from her window) with its own menu (desktop-settings.html?embed=game) whose settings ride in game saves; her
// memories and timeline are her journal, not settings; the labs live in the F12 debug menu.
// Also: her pages allow no inline scripts (the CSP), which is why the house cube never drew. No page may have one.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');
const html = read('webapp/desktop-settings.html');
const section = (id) => { const a = html.indexOf(`<section id="tab-${id}"`); return html.slice(a, html.indexOf('</section>', a)); };
const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));

test('no page has an inline script (her pages\' security rules block them)', () => {
  for (const f of fs.readdirSync(new URL('../../../webapp/', import.meta.url)).filter(f => f.endsWith('.html'))) {
    const inline = read('webapp/' + f).match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [];
    assert.deepEqual(inline, [], `${f} has an inline <script>`);
  }
});

test('her own pages may frame each other, nobody else may', () => {
  for (const f of ['tools/php-router.php', 'docker/nginx/snippets/security-headers.conf']) {
    const s = read(f);
    assert.match(s, /frame-ancestors 'self'/, f);
    assert.match(s, /SAMEORIGIN/, f);
    assert.doesNotMatch(s, /frame-ancestors 'none'/, f);
  }
});

test('Settings is about her: the game and the journal left the sidebar\'s settings', () => {
  assert.doesNotMatch(nav, /data-tab="game"/);
  assert.match(nav, /data-tab="journal"/);
  assert.match(nav, /<span>You two<\/span>/);
  assert.match(nav, /<span>Looks<\/span>/);
  const her = section('her');
  for (const id of ['skillRows', 'delveRows', 'memoryGraph', 'relTimeline']) assert.ok(!her.includes(`id="${id}"`), `${id} still in Her`);
  const game = section('game');
  for (const id of ['diffRows', 'skillRows', 'delveRows', 'gameRows', 'ownBox']) assert.ok(game.includes(`id="${id}"`), `${id} not in the game menu`);
  const journal = section('journal');
  for (const id of ['memoryGraph', 'relTimeline', 'memoryAddInput']) assert.ok(journal.includes(`id="${id}"`), `${id} not in her journal`);
  assert.ok(!html.includes('placeholder="developer key"'), 'the developer key row is gone');
});

test('the labs live in F12, not in Settings', () => {
  const js = read('webapp/js/desktop-settings.js');
  for (const l of ['Open the progress lab', 'Open the delve lab', 'Open the feel lab']) assert.ok(!js.includes(l), l);
  const dbg = read('webapp/js/debug-menu.js');
  for (const u of ['feel-lab.html', 'progress-lab.html', 'delve-lab.html']) assert.ok(dbg.includes(u), u);
});

test('the game world: a plain door in her window, its own menu, back to her', () => {
  assert.match(read('webapp/index.html'), /id="gameWorldBtn"/);
  const door = read('webapp/js/app/game-door.js');
  assert.match(door, /game-world\.html/);
  assert.match(door, /jun:leave-game/);
  const world = read('webapp/js/game-world.js');
  assert.match(world, /desktop-settings\.html\?embed=game/);
  assert.match(world, /Escape/);
  assert.match(world, /jun:leave-game/);
  assert.match(read('webapp/js/desktop-settings.js'), /const EMBED = /);
});

test('the game menu\'s settings ride in game saves', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const G = await import('../../../webapp/js/core/gamesave.js');
  G.setStorage(globalThis.localStorage);
  assert.ok(G.parts().includes('settings'));
  for (const k of ['jun.delve.pace', 'jun.delve.courage', 'jun.delve.notimer']) assert.ok(G.GAME_SETTING_KEYS.includes(k), k);
  mem.set('jun.delve.pace', 'turn'); mem.set('jun.delve.courage', 'brave');
  const saved = G.collect();
  assert.deepEqual(saved.settings, { 'jun.delve.pace': 'turn', 'jun.delve.courage': 'brave' });
  mem.set('jun.delve.pace', 'real'); mem.set('jun.delve.notimer', 'true');
  G.restore(saved);
  assert.equal(mem.get('jun.delve.pace'), 'turn');
  assert.equal(mem.get('jun.delve.courage'), 'brave');
  assert.equal(mem.has('jun.delve.notimer'), false, 'a setting the save didn\'t have goes back to how it comes');
});

test('relationship kinds: lovers, friends with benefits, best friends; siblings retired to best friends', async () => {
  const G = await import('../../../webapp/js/core/gate.js');
  assert.deepEqual(G.FLAVORS.map(f => f[1]), ['Lovers', 'Friends with benefits', 'Best friends']);
  assert.equal(G.clean({ flavor: 'siblings' }).flavor, 'platonic');
  assert.equal(G.clean({ flavor: 'nonsense' }).flavor, 'romantic');
  assert.equal(G.check({ tier: 'flirty' }, { comfort: { flavor: 'siblings', siblingsRated: true }, stage: 6, trust: 100 }).show, false);
});
