// game saves, the page side (#35 a, webapp/js/core/gamesave.js): the parts a page keeps (the delve in progress, never
// desktop Jun's memory of the last delve), loading puts them back or clears them, a save point of her comes first only
// when the save's bond is used (and a failed one stops the load), the epoch guard, the play clock, files, words, and
// the registry entries. The engine itself is tested in .github/scripts/gamesave.test.php.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const reg = JSON.parse(readFileSync(new URL('data/features.json', root), 'utf8'));
const php = readFileSync(new URL('api/lib/gamesave.php', root), 'utf8');

// a little localStorage
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.localStorage = storage;

// her server, as far as the page can tell
const calls = [];
let answer = () => ({ status: 200, body: { result: { ok: true }, view: { live: { epoch: 1 } } } });
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), method: init.method || 'GET', body });
  const a = answer(String(url), body);
  return { ok: a.status < 400, status: a.status, json: async () => a.body };
};

const G = await import(new URL('js/core/gamesave.js', root));
G.setStorage(storage);

test('the delve in progress is a part; desktop Jun\'s memory of the last delve never is', () => {
  mem.set('jun.delve', JSON.stringify({ run: { seed: 7, depth: 2 }, last: { area: 'server_farm', carried: true } }));
  assert.deepEqual(G.collect(), { delve: { seed: 7, depth: 2 } });
  assert.ok(G.parts().includes('delve'));
});

test('loading puts a page\'s parts back, and clears the ones the save didn\'t have', () => {
  G.restore({ delve: { seed: 99 } });
  assert.deepEqual(JSON.parse(mem.get('jun.delve')), { run: { seed: 99 }, last: { area: 'server_farm', carried: true } });
  G.restore({});
  assert.deepEqual(JSON.parse(mem.get('jun.delve')), { last: { area: 'server_farm', carried: true } }, 'last stays: it is hers');
  G.restore(null);
  assert.equal(G.collect().delve, undefined);
});

test('a part needs a plain name, like a section', () => {
  assert.throws(() => G.part('Bad Name', { get: () => 1, set: () => {} }));
  assert.throws(() => G.part('../x', { get: () => 1, set: () => {} }));
});

test('a load without the box asks for no save point and sends the page\'s parts', async () => {
  calls.length = 0;
  let pointAsked = false;
  globalThis.junDesktop = { saves: async () => { pointAsked = true; return { ok: true }; } };
  mem.set('jun.delve', JSON.stringify({ run: { seed: 3 } }));
  answer = () => ({ status: 200, body: { result: { ok: true, client: { delve: { seed: 42 } }, epoch: 5, bond: null }, view: { live: { epoch: 5 } } } });
  const r = await G.loadSave(12);
  assert.equal(pointAsked, false);
  assert.deepEqual(calls[0].body, { action: 'load', id: 12, useBond: false, client: { delve: { seed: 3 } } });
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(mem.get('jun.delve')).run, { seed: 42 }, 'the save\'s delve is back');
  assert.equal(G.currentEpoch(), 5);
});

test('with "Use this save\'s bond": a save point of her first, then the load', async () => {
  calls.length = 0;
  const order = [];
  globalThis.junDesktop = { saves: async (a, name) => { order.push('point:' + a + ':' + name); return { ok: true }; } };
  answer = (url, body) => { order.push('load'); return { status: 200, body: { result: { ok: true, client: {}, epoch: 6, bond: { stage: 4, name: 'Close' } }, view: { live: { epoch: 6 } } } }; };
  const r = await G.loadSave(12, { useBond: true });
  assert.deepEqual(order, ["point:save:Before a game save's bond", 'load']);
  assert.equal(calls[0].body.useBond, true);
  assert.equal(r.bond.name, 'Close');
});

test('a save point that fails stops the load: nothing changes', async () => {
  calls.length = 0;
  globalThis.junDesktop = { saves: async () => ({ ok: false, error: 'Jun is busy with saving.' }) };
  const r = await G.loadSave(12, { useBond: true });
  assert.equal(r.error, 'savepoint');
  assert.equal(calls.length, 0, 'never asked her server to load');
});

test('outside the desktop app the bond load still goes (the before-load save keeps the bond for Undo)', async () => {
  delete globalThis.junDesktop;
  calls.length = 0;
  answer = () => ({ status: 200, body: { result: { ok: true, client: {}, epoch: 7 }, view: { live: { epoch: 7 } } } });
  const r = await G.loadSave(1, { useBond: true });
  assert.equal(r.ok, true);
  assert.equal(r.savePoint.skipped, 'no desktop app');
});

test('a page still on the old game is told to reload, and everyone hears it', async () => {
  const heard = [];
  const off = G.onChange((e) => heard.push(e));
  answer = () => ({ status: 409, body: { error: 'reloaded', epoch: 9 } });
  const r = await G.put({ story: { chapter: 3 } }, { epoch: 7 });
  off();
  assert.equal(r.error, 'reloaded');
  assert.equal(G.say(r.error), G.WORDS.reloaded);
  assert.deepEqual(heard.map(e => e.type), ['loaded']);
  assert.equal(G.currentEpoch(), 9);
});

test('a write sends the epoch this page read', async () => {
  calls.length = 0;
  answer = () => ({ status: 200, body: { result: { ok: true, epoch: 9, rev: 2 } } });
  await G.put({ story: { chapter: 1 }, old: null });
  assert.deepEqual(calls[0].body, { action: 'put', sections: { story: { chapter: 1 }, old: null }, epoch: 9 });
});

test('autosaves follow the setting; your own saves always work', async () => {
  calls.length = 0;
  answer = () => ({ status: 200, body: { result: { ok: true, id: 1 }, view: { live: { epoch: 9 } } } });
  mem.set(G.AUTOSAVE_KEY, 'false');
  assert.deepEqual(await G.autosave('a beat'), { skipped: 'off' });
  assert.equal(calls.length, 0);
  await G.save('mine');
  assert.equal(calls[0].body.kind, 'named');
  mem.delete(G.AUTOSAVE_KEY);
  await G.autosave('reached the harbor', { force: true });
  assert.deepEqual([calls[1].body.kind, calls[1].body.force, calls[1].body.reason], ['auto', true, 'reached the harbor']);
});

test('switched off on her server: a calm answer, never a crash', async () => {
  answer = () => ({ status: 404, body: { error: 'off' } });
  assert.deepEqual(await G.load(), { off: true });
  assert.equal((await G.save('x')).error, 'off');
  assert.equal(G.say('off'), 'Game saves are switched off.');
});

test('files: a safe name, and anything that isn\'t one is refused in words', async () => {
  assert.equal(G.fileName('Before: the "harbor"?', Date.UTC(2026, 10, 15, 12)), 'Before the harbor 2026-11-15.jungame');
  assert.equal(G.fileName('', Date.UTC(2026, 0, 2, 12)), 'Jun game save 2026-01-02.jungame');
  assert.equal((await G.importFile('not json')).error, 'not_json');
  assert.equal(G.say('not_json'), G.WORDS.not_a_save);
  calls.length = 0;
  answer = () => ({ status: 200, body: { result: { ok: true, id: 3 }, view: { live: { epoch: 9 } } } });
  await G.importFile(JSON.stringify({ format: 'jungame', v: 1 }));
  assert.equal(calls[0].body.action, 'import');
  assert.equal(calls[0].body.file.format, 'jungame');
});

test('every answer has plain words, the same codes as her server', () => {
  const codes = new Set([...php.matchAll(/'error' => '([a-z_]+)'/g)].map(m => m[1]));
  for (const c of codes) assert.ok(G.WORDS[c], 'words for ' + c);
  assert.equal(G.say('something new'), G.WORDS.failed);
});

test('a save card in words', () => {
  assert.equal(G.playedWords(20), 'just started');
  assert.equal(G.playedWords(45 * 60), '45 min played');
  assert.equal(G.playedWords(3 * 3600 + 20 * 60), '3 h 20 min played');
  assert.equal(G.playedWords(2 * 3600), '2 h played');
  assert.equal(G.cardLine({ played: 3600, summary: { place: 'Port Buffer', chapter: 'Act 1' } }), 'Port Buffer · Act 1 · 1 h played');
});

test('the registry knows game saves, autosaves and the bond by hand (Everything only)', () => {
  const by = Object.fromEntries(reg.features.map(f => [f.id, f]));
  assert.equal(by.game_saves.key, 'env:JUN_GAMESAVES');
  assert.equal(by.game_autosave.key, 'local:' + G.AUTOSAVE_KEY);
  assert.deepEqual(by.game_autosave.needs, ['game_saves']);
  assert.equal(by.bond_by_hand.layer, 'all');
  for (const id of ['game_saves', 'game_autosave', 'bond_by_hand']) assert.equal(by[id].tier, 'everyday', id);
});

test('the server and the page agree on part names and the desktop skill list', () => {
  assert.match(php, /preg_match\('\/\^\[a-z\]\[a-z0-9_\]\{0,31\}\$\/'/);
  assert.match(php, /const GAMESAVE_DESKTOP_SKILLS = \['focus'\]/);
});
