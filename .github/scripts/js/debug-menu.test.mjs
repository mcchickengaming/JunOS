// the debug menu (F12): its tools, the spawn list built from the catalog (a new item in data/items.json shows up by
// itself), "how many you have", every server answer in words, and the desktop app's F12 wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const M = await import(new URL('js/debug-menu.js', root));
const items = JSON.parse(readFileSync(new URL('data/items.json', root), 'utf8'));
const php = readFileSync(new URL('api/lib/debug.php', root), 'utf8') + readFileSync(new URL('api/debug.php', root), 'utf8');
const main = readFileSync(new URL('../desktop/main.js', root), 'utf8');
const preload = readFileSync(new URL('../desktop/preload.js', root), 'utf8');

// the catalog the way api/debug.php hands it out
const catalog = [
  ...Object.entries(items.currencies).map(([id, c]) => ({ id, kind: 'currency', group: 'Currencies', name: c.name, line: c.line })),
  ...Object.entries(items.items).map(([id, it]) => ({ id, kind: it.kind === 'keepsake' ? 'keepsake' : 'item', group: items.kinds[it.kind].name, order: items.kinds[it.kind].order, name: it.name, line: it.line })),
];

test('the tools: spawn first, then console, labs, settings', () => {
  assert.deepEqual(M.toolIds(), ['spawn', 'console', 'labs', 'jump']);
});

test('the spawn list: currencies first, keepsakes last, everything in the catalog', () => {
  const g = M.groupCatalog(catalog);
  assert.equal(g[0][0], 'Currencies');
  assert.equal(g.at(-1)[0], 'Keepsakes');
  assert.equal(g.reduce((n, [, e]) => n + e.length, 0), catalog.length);
});

test('a new item in the catalog shows up by itself', () => {
  const more = [...catalog, { id: 'brand_new_thing', kind: 'item', group: 'Gear', order: 6, name: 'A brand new thing', line: '' }];
  assert.ok(M.groupCatalog(more, 'brand new').some(([, e]) => e.some(x => x.id === 'brand_new_thing')));
});

test('find by name, id, line or kind', () => {
  assert.deepEqual(M.groupCatalog(catalog, 'whispers').map(([g]) => g), ['Currencies']);
  assert.ok(M.groupCatalog(catalog, 'keepsake').every(([g]) => g === 'Keepsakes'));
  assert.deepEqual(M.groupCatalog(catalog, 'zzzz nothing'), []);
});

test('how many you have, from the inventory view', () => {
  const view = { currencies: [{ id: 'credits', amount: 40 }], kinds: [{ kind: 'part', items: [{ id: 'part_rare', count: 3 }] }], keepsakes: [{ id: 'generals_medal' }] };
  assert.equal(M.haveOf(view, { id: 'credits', kind: 'currency' }), 40);
  assert.equal(M.haveOf(view, { id: 'part_rare', kind: 'item' }), 3);
  assert.equal(M.haveOf(view, { id: 'generals_medal', kind: 'keepsake' }), 1);
  assert.equal(M.haveOf(view, { id: 'nope', kind: 'item' }), 0);
  assert.equal(M.haveOf(null, { id: 'x', kind: 'item' }), 0);
});

test('every answer the server can give has words', () => {
  const codes = new Set([...php.matchAll(/'error' => '([a-z_]+)'/g)].map(m => m[1]));
  for (const c of codes) assert.ok(M.SAY[c], 'words for ' + c);
});

test('the desktop app: F12 opens the menu, Ctrl+Shift+I still opens the console, the menu has its door', () => {
  assert.match(main, /if \(k === 'f12'\)[\s\S]{0,200}openDebugMenu\(wc\)/);
  assert.match(main, /input\.control && input\.shift && k === 'i'\) \{ ev\.preventDefault\(\); toggleDevTools\(wc\)/);
  assert.match(main, /ipcMain\.handle\('jun:debug'/);
  assert.match(main, /e\.sender !== debugWin\.webContents\) return null/, 'only the debug menu may ask');
  assert.match(preload, /debug: \(action, which\) => ipcRenderer\.invoke\('jun:debug'/);
});
