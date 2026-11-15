// Jun profiles (#18) and "what goes where": webapp/js/core/profile.js + jun-zip.js + data/profile-parts.json.
// A fake io stands in for localStorage, the desktop app, comfort and the bond.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const Zip = await import('../../../webapp/js/core/jun-zip.js');
const P = await import('../../../webapp/js/core/profile.js');
const DATA = JSON.parse(fs.readFileSync(new URL('../../../webapp/data/profile-parts.json', import.meta.url), 'utf8'));
P.use(DATA);

function fakeIO(seed = {}) {
  const ls = new Map(Object.entries(seed.local || {}));
  const st = { desk: seed.desk || { desk: { walk: 50, quiet: false }, size: 0.425 }, spots: seed.spots || { spots: [], stay: null },
    comfort: seed.comfort || { flavor: 'romantic', flavorLock: false, flirty: true, adult: false, adultConfirmed: false, adultOutside: false, siblingsRated: false }, bond: seed.bond || 3, after: null };
  return {
    st, ls,
    local: { get: (k) => (ls.has(k) ? ls.get(k) : null), set: (k, v) => (v == null ? ls.delete(k) : ls.set(k, String(v))), keys: () => [...ls.keys()] },
    desk: { get: async () => st.desk, set: async (d) => { st.desk = d; }, spots: async () => st.spots, setSpots: async (d) => { st.spots = d; } },
    comfort: { get: async () => st.comfort, set: async (p) => { st.comfort = { ...st.comfort, ...p }; } },
    bond: { get: async () => ({ stage: st.bond }), set: async (s) => { st.bond = s; } },
    after: async (ids) => { st.after = ids; },
  };
}
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('the parts data: every piece complete, containers valid, never-pieces say where they live instead', () => {
  const ids = new Set();
  for (const p of DATA.parts) {
    assert.ok(/^[a-z_]+$/.test(p.id) && !ids.has(p.id), p.id);
    ids.add(p.id);
    assert.ok(p.name && p.line, p.id);
    for (const c of P.CONTAINERS) assert.ok(['always', 'on', 'off', 'never'].includes(p.in[c]), `${p.id} ${c}`);
    for (const c of ['profile', 'gamesave']) if (p.in[c] === 'never' && p.store && Object.keys(p.store).length && !p.store.game) assert.ok(true);
    assert.equal(p.in.savepoint, 'always', p.id + ': a save point keeps everything');
  }
  // the privacy promises
  for (const id of ['memories', 'her_skills', 'game_story']) assert.equal(P.defaultIn(id, 'profile'), 'never', id);
  assert.ok(P.part('memories').why.profile && P.part('game_story').why.profile);
  for (const id of ['names', 'comfort', 'bond']) assert.equal(P.defaultIn(id, 'profile'), 'off', id + ' is out unless he puts it in');
  assert.equal(P.defaultIn('bond', 'gamesave'), 'off', 'a save\'s bond only if ticked (Nov 15)');
  // every herWindow part's keys are ones Prefs syncs to her server
  const prefs = fs.readFileSync(new URL('../../../webapp/js/core/prefs.js', import.meta.url), 'utf8');
  for (const p of DATA.parts.filter(x => x.herWindow)) for (const k of p.store.local) assert.ok(prefs.includes(`'${k}'`), k + ' is synced');
});

test('what goes where: the way we made it, his changes, and back again; always / never can\'t move', () => {
  const s = store();
  let c = P.readCarry(s);
  assert.equal(P.isIn('colors', 'profile', c), true);
  assert.equal(P.isIn('bond', 'profile', c), false);
  assert.equal(P.isIn('memories', 'profile', c), false);
  c = P.setIn(s, 'profile', 'colors', false);
  c = P.setIn(s, 'profile', 'bond', true);
  c = P.setIn(s, 'profile', 'memories', true);
  c = P.setIn(s, 'savepoint', 'colors', false);
  assert.equal(P.isIn('colors', 'profile', c), false);
  assert.equal(P.isIn('bond', 'profile', c), true);
  assert.equal(P.isIn('memories', 'profile', c), false, 'never stays never');
  assert.equal(P.isIn('colors', 'savepoint', c), true, 'always stays always');
  assert.deepEqual(P.changedCarry(c).map(x => x.id).sort(), ['bond', 'colors']);
  c = P.setIn(s, 'profile', 'colors', true);
  assert.deepEqual(P.changedCarry(c).map(x => x.id), ['bond'], 'back to the default = not a change');
  // the game-save load options
  assert.deepEqual(P.gameKeep({}), { keep: [], useBond: false }, 'natural: bring the save\'s skills and things, keep your bond');
  P.setIn(s, 'gamesave', 'his_things', false);
  P.setIn(s, 'gamesave', 'bond', true);
  assert.deepEqual(P.gameKeep(P.readCarry(s)), { keep: ['things'], useBond: true });
  assert.deepEqual(P.resetCarry(s), {});
  assert.deepEqual(P.readCarry(s), {});
});

test('the zip: written stored, read back; a deflated one (zipped by hand) opens; damage is caught', async () => {
  const z = Zip.write([{ name: 'a.json', data: '{"x":1}' }, { name: 'b/c.txt', data: new Uint8Array([1, 2, 3]) }]);
  const files = await Zip.read(z);
  assert.deepEqual(files.map(f => f.name), ['a.json', 'b/c.txt']);
  assert.equal(Zip.text(files[0].data), '{"x":1}');
  // a deflated entry, built with CompressionStream
  const raw = new TextEncoder().encode('hello hello hello hello');
  const def = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const z2 = Zip.write([{ name: 'h.txt', data: def }]);
  const v = new DataView(z2.buffer);
  // mark it deflated, with the real size and crc, in both headers
  const crc = Zip.crc32(raw), cd = z2.length - 22 - 46 - 5;
  for (const [off, m, c, us] of [[0, 8, 14, 22], [cd, 10, 16, 24]]) { v.setUint16(off + m, 8, true); v.setUint32(off + c, crc, true); v.setUint32(off + us, raw.length, true); }
  assert.equal(Zip.text((await Zip.read(z2))[0].data), 'hello hello hello hello');
  const bad = z.slice(); bad[37] ^= 0xff;   // a byte of the first file's data
  await assert.rejects(Zip.read(bad), /damaged/);
  await assert.rejects(Zip.read(new Uint8Array([1, 2, 3])), /not_zip/);
});

test('make one, read it back, apply it on another Jun: only the picked parts change', async () => {
  const theme = JSON.stringify({ '--accent': '#ff0000', '--glow': '#00ff00' });
  const a = fakeIO({ local: { 'desktop.theme': theme, 'desktop.fx': '{"rShape":"heart"}', 'jun.init.often': '80', 'jun.init.bold': '30', 'omega.names.bot': 'Juniper', 'jun.feel': '{"secret":1}', 'tts.speed': '1.2' },
    desk: { desk: { walk: 85, quiet: true, hideKey: 'Pause' }, size: 0.3 }, spots: { spots: [{ id: 's1', type: 'cushion', x: 100, y: 900, colors: ['#123456'] }], stay: 's1' }, bond: 6 });
  const m = await P.collect(a, { name: 'Cozy', note: 'for evenings', now: Date.UTC(2026, 10, 15) });
  assert.equal(m.format, 'junprofile');
  assert.deepEqual(Object.keys(m.parts).sort(), ['colors', 'desktop', 'her_spots', 'her_ways', 'touch_feel', 'voice'].sort());
  assert.ok(!JSON.stringify(m).includes('Juniper'), 'names stay out by default');
  assert.ok(!JSON.stringify(m).includes('secret'), 'her inside state (jun.feel) is never in a profile');
  assert.equal(m.parts.her_ways.local['jun.init.often'], '80', 'prefix keys come along');
  const file = await P.toFile(m);
  const back = await P.fromFile(file);
  assert.equal(back.error, undefined);
  assert.deepEqual(back.manifest.parts.colors, m.parts.colors);
  assert.deepEqual(P.swatches(back.manifest), ['#ff0000', '#00ff00']);
  assert.ok(P.summary(back.manifest).find(x => x.id === 'colors').words.startsWith('2 colors'));
  // another Jun, with her own bits that a profile part owns
  const b = fakeIO({ local: { 'jun.init.persist': '10', 'desktop.theme': '{}' } });
  const r = await P.apply(back.manifest, ['colors', 'her_ways', 'desktop', 'her_spots'], b);
  assert.deepEqual(r.applied, ['colors', 'her_ways', 'desktop', 'her_spots']);
  assert.equal(b.ls.get('desktop.theme'), theme);
  assert.equal(b.ls.get('jun.init.often'), '80');
  assert.equal(b.ls.has('jun.init.persist'), false, 'a key of the part the profile doesn\'t have goes back to how she comes');
  assert.equal(b.ls.has('desktop.fx'), false, 'touch feedback wasn\'t picked');
  assert.equal(b.st.desk.desk.walk, 85);
  assert.equal(b.st.spots.stay, 's1');
  assert.deepEqual(b.st.after, r.applied, 'the page is told what changed');
  // without the desktop app, its parts are skipped in words
  const c = fakeIO(); c.desk = null;
  const r2 = await P.apply(back.manifest, ['desktop', 'colors'], c);
  assert.deepEqual(r2.applied, ['colors']);
  assert.match(r2.skipped[0].why, /desktop app/);
});

test('a file can\'t do what a profile may not: 18+, other keys, memories, the game, huge values', async () => {
  const evil = {
    format: 'junprofile', v: 1, name: 'x'.repeat(500),
    parts: {
      comfort: { comfort: { flavor: 'romantic', flirty: true, adult: true, adultConfirmed: true, adultOutside: true } },
      colors: { local: { 'desktop.theme': '{}', 'jun.feel': 'hacked', 'omega.auth': 'x' } },
      memories: { local: { anything: 'x' } },
      game_story: { game: {} },
      her_ways: { local: { 'jun.init.often': 'x'.repeat(600 * 1024), 'jun.init.ok': '1', 'jun.init.<script>': '1' } },
      bond: { bond: { stage: 99 } },
      her_spots: { spots: { spots: [{ id: '../x', type: 'cushion', x: 1, y: 1 }, { id: 'ok', type: 'cushion', x: 'a', y: 2 }, { id: 'ok2', type: 'beanbag', x: 1, y: 2, colors: ['red', '#abcdef'] }], stay: 'nope' } },
      made_up: { local: {} },
    },
  };
  const { manifest, dropped } = P.clean(evil);
  assert.equal(manifest.name.length, P.LIMITS.name);
  assert.deepEqual(manifest.parts.comfort.comfort, { flavor: 'romantic', flirty: true }, '18+ never comes from a file');
  assert.deepEqual(Object.keys(manifest.parts.colors.local), ['desktop.theme']);
  assert.ok(!manifest.parts.memories && !manifest.parts.game_story && !manifest.parts.made_up);
  assert.deepEqual(Object.keys(manifest.parts.her_ways.local), ['jun.init.ok']);
  assert.equal(manifest.parts.bond.bond.stage, 6);
  assert.deepEqual(manifest.parts.her_spots.spots.spots.map(s => s.id), ['ok2']);
  assert.deepEqual(manifest.parts.her_spots.spots.spots[0].colors, ['#abcdef']);
  assert.equal(manifest.parts.her_spots.spots.stay, null);
  for (const w of ['memories', 'game_story', 'made_up', 'colors: jun.feel', 'comfort: adult']) assert.ok(dropped.includes(w), 'named: ' + w);
  // applying the comfort part never sends 18+
  const io = fakeIO();
  await P.apply(manifest, ['comfort'], io);
  assert.equal(io.st.comfort.adult, false);
  // what's ticked at first: not names, comfort or the bond
  assert.ok(!P.defaultPick(manifest).some(id => ['comfort', 'bond', 'names'].includes(id)));
  assert.equal(P.clean({ format: 'junprofile', v: 9, parts: {} }).error, 'newer');
  assert.equal(P.clean({ format: 'jungame', v: 1 }).error, 'not_profile');
  assert.equal((await P.fromFile(new TextEncoder().encode('{"format":"junprofile","v":1,"parts":{}}'))).manifest.parts && true, true, 'a bare json works');
  assert.equal((await P.fromFile(new Uint8Array([9, 9, 9]))).error, 'not_profile');
  for (const code of ['not_profile', 'newer', 'damaged', 'too_big', 'savepoint']) assert.ok(P.WORDS[code]);
  assert.equal(P.fileName('Cozy: <evenings>'), 'Cozy evenings.jun');
});

test('the desktop part only takes keys the app knows (main.js DESK_KEYS) and the settings page offers the load choices', () => {
  const main = fs.readFileSync(new URL('../../../desktop/main.js', import.meta.url), 'utf8');
  assert.match(main, /function deskSetAll\(d\)[\s\S]*?const t = DESK_KEYS\[key\];\s*if \(!t\) continue;/);
  assert.match(main, /profileFile = \(f\) =>/);
  const set = fs.readFileSync(new URL('../../../webapp/js/desktop-settings.js', import.meta.url), 'utf8');
  assert.match(set, /Profile\.gameKeep\(Profile\.readCarry\(localStorage\)\)/);
  assert.match(set, /D\.saves\('save', `Before the profile/, 'a save point before applying');
});
