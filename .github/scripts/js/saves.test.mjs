// save points (desktop/saves.js): a save of a fake install, listing,
// pruning, a damaged file, going back, and the desktop part applied
// once the app is closed. needs php with pdo_sqlite for the database
// copy (tools/jun-save-db.php); without it those cases are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const Saves = require(path.join(repo, 'desktop/saves.js'));

let hasPhp = false;
try { execFileSync('php', ['-r', 'new PDO("sqlite::memory:");'], { stdio: 'ignore' }); hasPhp = true; } catch (e) {}

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jun-home-'));
  const st = path.join(home, 'runtime', 'state');
  fs.mkdirSync(path.join(home, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'tools/jun-save-db.php'), path.join(home, 'tools/jun-save-db.php'));
  fs.mkdirSync(path.join(st, 'memory', 'u1'), { recursive: true });
  fs.mkdirSync(path.join(st, 'rl'), { recursive: true });
  fs.writeFileSync(path.join(st, 'memory', 'u1', 'note.md'), 'v1:sealed-memory');
  fs.writeFileSync(path.join(st, 'rl', 'x'), 'rate limit, not saved');
  fs.writeFileSync(path.join(st, 'ollama-refit.stamp'), 'not saved');
  if (hasPhp) {
    execFileSync('php', ['-r', `$d=new PDO("sqlite:${path.join(st, 'omega.sqlite')}");$d->exec("PRAGMA journal_mode=WAL;CREATE TABLE schema_version(v INT);INSERT INTO schema_version VALUES (30);CREATE TABLE bond(xp INT);INSERT INTO bond VALUES (1234);");`]);
  }
  const dk = path.join(home, 'runtime', 'desktop');
  fs.mkdirSync(path.join(dk, 'Local Storage', 'leveldb'), { recursive: true });
  fs.mkdirSync(path.join(dk, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(dk, 'desktop.json'), '{"size":0.5}');
  fs.writeFileSync(path.join(dk, 'Local Storage', 'leveldb', '000003.log'), 'touch spots v1');
  fs.writeFileSync(path.join(dk, 'Local Storage', 'leveldb', 'LOCK'), '');
  fs.writeFileSync(path.join(dk, 'Cache', 'big'), 'chromium cache, not saved');
  fs.writeFileSync(path.join(home, '.env'), 'JUN_DESKTOP=on\n');
  return home;
}

const bondXp = (file) => execFileSync('php', ['-r', `$d=new PDO("sqlite:${file}");echo $d->query("SELECT xp FROM bond")->fetchColumn();`]).toString();

test('zip writer and reader agree, and python can read it too', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jun-zip-'));
  const f = path.join(dir, 'a.zip');
  const z = new Saves._zip.ZipWriter(f);
  await z.open();
  await z.add('a.txt', Buffer.from('hello hello hello hello hello hello hello hello hello hello hello hello'));
  await z.add('dir/ü.bin', Buffer.from([0, 1, 2, 3]));
  await z.close();
  const idx = await Saves._zip.readZipIndex(f);
  assert.deepEqual(idx.map(e => e.name), ['a.txt', 'dir/ü.bin']);
  assert.equal((await Saves._zip.readEntry(f, idx[0])).toString(), 'hello hello hello hello hello hello hello hello hello hello hello hello');
  try {
    const out = execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(z.namelist()))', f]).toString().trim();
    assert.equal(out, 'a.txt,dir/ü.bin');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
});

test('names from a zip never climb out', () => {
  const root = path.join(os.tmpdir(), 'r');
  for (const bad of ['../x', '/etc/passwd', 'a/../../x', 'C:/x', '\\x', '']) assert.equal(Saves._zip.safeJoin(root, bad), null, bad);
  assert.equal(Saves._zip.safeJoin(root, 'memory/u1/n.md'), path.join(root, 'memory', 'u1', 'n.md'));
});

test('folders he may pick', () => {
  const home = fakeHome();
  assert.match(Saves.checkDir(home, path.join(home, 'webapp')), /inside Jun's own folder/);
  assert.match(Saves.checkDir(home, path.join(home, 'runtime', 'state', 'x')), /part of Jun/);
  assert.equal(Saves.checkDir(home, path.join(home, 'runtime', 'saves')), '');
  assert.equal(Saves.checkDir(home, fs.mkdtempSync(path.join(os.tmpdir(), 'elsewhere-'))), '');
  assert.equal(Saves.checkDir(home, 'relative/path'), 'Pick a folder.');
});

test('settings default and keep choices', () => {
  const home = fakeHome();
  let s = Saves.loadSettings(home);
  assert.equal(s.keep, 7);
  assert.equal(s.dir, path.join(home, 'runtime', 'saves'));
  s = Saves.writeSettings(home, { keep: 14, dir: '/tmp/x' });
  assert.equal(s.keep, 14); assert.equal(s.dir, '/tmp/x'); assert.ok(s.custom);
  s = Saves.writeSettings(home, { keep: 999, dir: '' });
  assert.equal(s.keep, 7); assert.ok(!s.custom);
});

test('save, list, go back, desktop part applied after', { skip: !hasPhp && 'no php' }, async () => {
  const home = fakeHome();
  const dir = path.join(home, 'runtime', 'saves');
  const st = path.join(home, 'runtime', 'state');
  const r = await Saves.makeSave({ home, dir, name: 'Before our date', kind: 'named', gitHead: 'abc123' });
  assert.ok(r.ok, r.error);
  assert.ok(r.file.endsWith('.junsave'));
  assert.ok(!fs.existsSync(r.file + '.part'));
  const { entries } = await Saves.readManifest(r.file);
  const names = entries.map(e => e.name);
  assert.ok(names.includes('state/omega.sqlite'));
  assert.ok(names.includes('state/memory/u1/note.md'));
  assert.ok(names.includes('desktop/desktop.json'));
  assert.ok(names.includes('desktop/Local Storage/leveldb/000003.log'));
  assert.ok(names.includes('env/.env'));
  for (const n of names) assert.ok(!/rl\/|\.stamp|Cache\/|LOCK$|-wal|-shm/.test(n), 'should not be saved: ' + n);

  const list = await Saves.listSaves(dir);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Before our date');
  assert.equal(list[0].schema, 30);
  assert.deepEqual(list[0].parts, ['database', 'memories', 'desktop', 'env']);
  assert.ok((await Saves.checkSave(home, r.file)).ok);

  // she changes after the save
  execFileSync('php', ['-r', `$d=new PDO("sqlite:${path.join(st, 'omega.sqlite')}");$d->exec("UPDATE bond SET xp=9999");`]);
  fs.writeFileSync(path.join(st, 'memory', 'u1', 'note.md'), 'v1:newer');
  fs.writeFileSync(path.join(st, 'memory', 'u1', 'later.md'), 'v1:made later');
  fs.writeFileSync(path.join(home, 'runtime', 'desktop', 'desktop.json'), '{"size":0.2}');
  fs.writeFileSync(path.join(home, '.env'), 'JUN_DESKTOP=off\n');
  assert.equal(bondXp(path.join(st, 'omega.sqlite')), '9999');

  const back = await Saves.restoreSave(home, r.file);
  assert.ok(back.ok && back.desktop);
  assert.equal(bondXp(path.join(st, 'omega.sqlite')), '1234');
  assert.equal(fs.readFileSync(path.join(st, 'memory', 'u1', 'note.md'), 'utf8'), 'v1:sealed-memory');
  assert.ok(!fs.existsSync(path.join(st, 'memory', 'u1', 'later.md')));
  assert.ok(fs.existsSync(path.join(st + '.previous', 'memory', 'u1', 'later.md')), 'the old state stays next to it');
  // .env is never put back
  assert.equal(fs.readFileSync(path.join(home, '.env'), 'utf8'), 'JUN_DESKTOP=off\n');
  // desktop waits for the app to close
  assert.equal(fs.readFileSync(path.join(home, 'runtime', 'desktop', 'desktop.json'), 'utf8'), '{"size":0.2}');
  assert.ok(Saves.applyPendingDesktop(home));
  assert.equal(fs.readFileSync(path.join(home, 'runtime', 'desktop', 'desktop.json'), 'utf8'), '{"size":0.5}');
  assert.ok(fs.existsSync(path.join(home, 'runtime', 'desktop', 'Cache', 'big')), 'caches are left alone');
  assert.ok(!fs.existsSync(path.join(home, 'runtime', 'desktop-pending')));
  assert.equal(Saves.applyPendingDesktop(home), false);
});

test('daily saves are pruned, named ones never', { skip: !hasPhp && 'no php' }, async () => {
  const home = fakeHome();
  const dir = path.join(home, 'runtime', 'saves');
  const day = (n) => new Date(2026, 10, n, 12, 0, 0);
  await Saves.makeSave({ home, dir, name: 'Mine', kind: 'named', now: day(1) });
  for (let n = 2; n <= 6; n++) await Saves.makeSave({ home, dir, kind: 'daily', now: day(n) });
  const gone = await Saves.prune(dir, 'daily', 3);
  assert.equal(gone.length, 2);
  const left = await Saves.listSaves(dir);
  assert.deepEqual(left.map(s => s.kind), ['daily', 'daily', 'daily', 'named']);
  assert.equal(left[0].day, '2026-11-06');
  assert.deepEqual(await Saves.prune(dir, 'named', 1), []);
});

test('a damaged save shows up but is refused', { skip: !hasPhp && 'no php' }, async () => {
  const home = fakeHome();
  const dir = path.join(home, 'runtime', 'saves');
  const r = await Saves.makeSave({ home, dir, name: 'ok', kind: 'named' });
  const buf = fs.readFileSync(r.file);
  // a flipped byte inside the database's packed data
  const db = (await Saves._zip.readZipIndex(r.file)).find(e => e.name === 'state/omega.sqlite');
  buf[db.offset + 30 + 'state/omega.sqlite'.length + Math.floor(db.csize / 2)] ^= 0xff;
  const bad = path.join(dir, 'bad.junsave');
  fs.writeFileSync(bad, buf);
  fs.writeFileSync(path.join(dir, 'junk.junsave'), 'not a zip');
  const list = await Saves.listSaves(dir);
  assert.equal(list.length, 3);
  assert.ok(list.find(s => s.file.endsWith('junk.junsave')).broken);
  assert.equal((await Saves.checkSave(home, bad)).ok, false);
  assert.equal((await Saves.checkSave(home, path.join(dir, 'junk.junsave'))).ok, false);
  assert.ok(await Saves.removeSave(dir, bad));
  assert.equal(await Saves.removeSave(dir, path.join(home, '.env')), false);
});

test('a restart note is read once', () => {
  const home = fakeHome();
  Saves.writeNote(home, { kind: 'restore', name: 'x' });
  assert.equal(Saves.takeNote(home).name, 'x');
  assert.equal(Saves.takeNote(home), null);
});
