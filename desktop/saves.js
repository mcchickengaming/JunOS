// save points: everything that makes her HER, in one file.
//
//   runtime\state     her database (chats, bond, touch tally, moods,
//                     memories' index) and her memory files
//   runtime\desktop   the desktop app's settings and its storage
//                     (touch spots, colors, touch feedback, her size)
//   .env              kept in the save for reference only. going back
//                     leaves the current .env alone, so an old save
//                     can never point her at a model or port that
//                     isn't there any more
//
// game art and model files are NOT saved: they come back from his
// game copy / a download. a save is a plain .zip with a .junsave
// name (jun-save.json inside says what it is), written as .part and
// renamed at the end, so a half-written save never shows up.
//
// no electron in here (main.js does the windows and dialogs), so the
// whole thing runs under plain node: .github/scripts/js/saves.test.mjs

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');

const EXT = '.junsave';
const KINDS = ['named', 'daily', 'before-restore', 'before-update'];
// how many of the automatic ones stay. named saves are never deleted
// on their own; daily is his setting
const KEEP_AUTO = { 'before-restore': 5, 'before-update': 5 };
const KEEP_CHOICES = [3, 7, 14, 30];
const KEEP_DEFAULT = 7;

// in runtime\state, things that are rebuilt or are only caches
const STATE_SKIP_DIRS = new Set(['rl', 'consolidating']);
const STATE_SKIP_FILE = /^(omega\.sqlite(-wal|-shm|-journal)?|openrouter_models\.json|.*\.stamp|.*\.tmp)$/i;
// in runtime\desktop only her things, not chromium's caches
const DESKTOP_PARTS = ['desktop.json', 'Local Storage', 'IndexedDB'];

const paths = (home) => {
  const rt = path.join(home, 'runtime');
  return {
    runtime: rt,
    state: path.join(rt, 'state'),
    desktop: path.join(rt, 'desktop'),
    env: path.join(home, '.env'),
    settings: path.join(rt, 'saves.json'),
    defaultDir: path.join(rt, 'saves'),
    pending: path.join(rt, 'desktop-pending'),
    note: path.join(rt, 'jun-restart-note.json'),
  };
};

// ---------------------------------------------------------------
// settings: where saves go and how many daily ones stay. kept in
// runtime\saves.json, outside everything a restore swaps

function loadSettings(home) {
  const p = paths(home);
  let s = {};
  try { s = JSON.parse(fs.readFileSync(p.settings, 'utf8')) || {}; } catch (e) {}
  const keep = KEEP_CHOICES.includes(Number(s.keep)) ? Number(s.keep) : KEEP_DEFAULT;
  const dir = typeof s.dir === 'string' && s.dir ? s.dir : '';
  return { dir: dir || p.defaultDir, custom: !!dir, keep, lastDaily: s.lastDaily || '' };
}

function writeSettings(home, patch) {
  const p = paths(home);
  let s = {};
  try { s = JSON.parse(fs.readFileSync(p.settings, 'utf8')) || {}; } catch (e) {}
  Object.assign(s, patch);
  fs.mkdirSync(path.dirname(p.settings), { recursive: true });
  fs.writeFileSync(p.settings, JSON.stringify(s, null, 2));
  return loadSettings(home);
}

const inside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
};

// a folder he picked: never somewhere a restore swaps out, and never
// inside her folder outside runtime\ (git would see the saves there)
function checkDir(home, dir) {
  const p = paths(home);
  if (!dir || !path.isAbsolute(dir)) return 'Pick a folder.';
  if (inside(dir, p.state) || inside(dir, p.desktop) || inside(dir, p.pending)) return "That folder is part of Jun herself. Pick another one.";
  if (inside(dir, home) && !inside(dir, p.runtime)) return "That's inside Jun's own folder. Pick a folder somewhere else (another drive is best), or use the default.";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.jun-write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (e) {
    return "Jun can't write to that folder. Pick another one.";
  }
  return '';
}

// ---------------------------------------------------------------
// zip, the small part of it we need: deflate, utf-8 names, < 4 GB

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const deflate = (b) => new Promise((res, rej) => zlib.deflateRaw(b, { level: 6 }, (e, out) => (e ? rej(e) : res(out))));
const inflate = (b) => new Promise((res, rej) => zlib.inflateRaw(b, (e, out) => (e ? rej(e) : res(out))));

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class ZipWriter {
  constructor(file) { this.file = file; this.fd = null; this.pos = 0; this.entries = []; }
  async open() { this.fd = await fsp.open(this.file, 'w'); }
  async write(buf) { await this.fd.write(buf, 0, buf.length, this.pos); this.pos += buf.length; }
  async add(name, data, mtime = new Date()) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    let body = data, method = 0;
    if (data.length > 64) {
      const z = await deflate(data);
      if (z.length < data.length) { body = z; method = 8; }
    }
    const { time, date } = dosTime(mtime);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    const offset = this.pos;
    await this.write(h); await this.write(nameBuf); await this.write(body);
    this.entries.push({ nameBuf, crc, method, time, date, csize: body.length, usize: data.length, offset });
  }
  async close() {
    const start = this.pos;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10); c.writeUInt16LE(e.time, 12); c.writeUInt16LE(e.date, 14); c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.usize, 24); c.writeUInt16LE(e.nameBuf.length, 28);
      c.writeUInt32LE(e.offset, 42);
      await this.write(c); await this.write(e.nameBuf);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8); end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.pos - start, 12); end.writeUInt32LE(start, 16);
    await this.write(end);
    await this.fd.close();
    this.fd = null;
  }
  async abort() { try { if (this.fd) await this.fd.close(); } catch (e) {} this.fd = null; try { await fsp.unlink(this.file); } catch (e) {} }
}

async function readZipIndex(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const tail = Math.min(size, 22 + 65535);
    const buf = Buffer.alloc(tail);
    await fh.read(buf, 0, tail, size - tail);
    let at = -1;
    for (let i = tail - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { at = i; break; }
    if (at < 0) throw new Error('not a save file');
    const count = buf.readUInt16LE(at + 10), cdSize = buf.readUInt32LE(at + 12), cdOff = buf.readUInt32LE(at + 16);
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('broken save file');
      const method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16);
      const csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nl);
      entries.push({ name, method, crc, csize, usize, offset });
      p += 46 + nl + xl + cl;
    }
    return entries;
  } finally { await fh.close(); }
}

async function readEntry(file, e) {
  const fh = await fsp.open(file, 'r');
  try {
    const h = Buffer.alloc(30);
    await fh.read(h, 0, 30, e.offset);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('broken save file');
    const skip = 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    const body = Buffer.alloc(e.csize);
    await fh.read(body, 0, e.csize, e.offset + skip);
    const data = e.method === 8 ? await inflate(body) : e.method === 0 ? body : null;
    if (!data) throw new Error('unknown packing in save file');
    if (data.length !== e.usize || crc32(data) !== e.crc) throw new Error('damaged save file (' + e.name + ')');
    return data;
  } finally { await fh.close(); }
}

// a name from inside a zip, as a path under `root`, or null if it
// tries to climb out
function safeJoin(root, name) {
  if (!name || name.includes('\0') || /^[\\/]/.test(name) || /^[a-z]:/i.test(name)) return null;
  const parts = name.split(/[\\/]+/).filter(Boolean);
  if (parts.some(x => x === '..' || x === '.')) return null;
  const full = path.join(root, ...parts);
  return inside(full, root) ? full : null;
}

// ---------------------------------------------------------------
// making a save

function phpExe(home) {
  const exe = path.join(home, 'runtime', 'php', 'php.exe');
  return fs.existsSync(exe) ? exe : 'php';
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: opts.timeout || 120000, maxBuffer: 4 << 20, cwd: opts.cwd, env: opts.env },
      (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

async function dbTool(home, args) {
  const script = path.join(home, 'tools', 'jun-save-db.php');
  const r = await run(phpExe(home), [script, ...args], { timeout: 10 * 60 * 1000 });
  if (r.err && r.err.code === 'ENOENT') return { ok: false, error: "PHP wasn't found (runtime\\php)." };
  try { return JSON.parse(r.stdout.trim().split(/\r?\n/).pop()); } catch (e) {
    return { ok: false, error: (r.stderr || r.stdout || 'the database copy failed').trim().slice(0, 300) };
  }
}

async function walk(root, rel = '', skip = () => false, out = []) {
  let list;
  try { list = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch (e) { return out; }
  for (const d of list) {
    const r = rel ? rel + '/' + d.name : d.name;
    if (skip(r, d)) continue;
    if (d.isDirectory()) await walk(root, r, skip, out);
    else if (d.isFile()) out.push(r);
  }
  return out;
}

function slug(name) {
  return String(name || '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'save';
}
function stamp(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
const localDay = (d = new Date()) => stamp(d).slice(0, 10);

// opts: { home, dir, name, kind, gitHead, now }
// -> { ok, file, manifest } or { ok: false, error }
async function makeSave(opts) {
  const home = opts.home;
  const p = paths(home);
  const kind = KINDS.includes(opts.kind) ? opts.kind : 'named';
  const now = opts.now || new Date();
  const name = String(opts.name || '').trim().slice(0, 80) || defaultName(kind, now);
  const dir = opts.dir || loadSettings(home).dir;
  try { await fsp.mkdir(dir, { recursive: true }); } catch (e) { return { ok: false, error: "Couldn't make the saves folder: " + dir }; }

  let base = `${stamp(now)}_${kind}_${slug(name)}`;
  let n = 2;
  while (fs.existsSync(path.join(dir, base + EXT))) base = `${stamp(now)}_${kind}_${slug(name)}-${n++}`;
  const file = path.join(dir, base + EXT);
  const part = file + '.part';
  const tmpDb = path.join(os.tmpdir(), `jun-save-${process.pid}-${Date.now()}.sqlite`);
  const zip = new ZipWriter(part);
  const warnings = [];
  try {
    const dbFile = path.join(p.state, 'omega.sqlite');
    let schema = 0;
    let hasDb = false;
    if (fs.existsSync(dbFile)) {
      const r = await dbTool(home, ['copy', dbFile, tmpDb]);
      if (!r.ok) return { ok: false, error: "Couldn't copy her database: " + (r.error || 'unknown') };
      schema = r.schema || 0;
      hasDb = true;
    }
    const manifest = {
      app: 'jun-save', v: 1, name, kind, created: now.toISOString(), day: localDay(now),
      gitHead: opts.gitHead || '', schema, hasDb, parts: [], warnings,
    };
    await zip.open();
    // the manifest goes first and again at the end: listing reads the
    // last copy (it has the warnings); the first is for people who
    // open the zip by hand
    await zip.add('jun-save.json', Buffer.from(JSON.stringify(manifest, null, 2)), now);
    if (hasDb) { await zip.add('state/omega.sqlite', await fsp.readFile(tmpDb), now); manifest.parts.push('database'); }

    const stateFiles = await walk(p.state, '', (r, d) => (d.isDirectory() ? !r.includes('/') && STATE_SKIP_DIRS.has(d.name) : !r.includes('/') && STATE_SKIP_FILE.test(d.name)));
    for (const r of stateFiles) {
      try {
        const full = path.join(p.state, ...r.split('/'));
        await zip.add('state/' + r, await fsp.readFile(full), (await fsp.stat(full)).mtime);
      } catch (e) { warnings.push('skipped state/' + r); }
    }
    if (stateFiles.some(r => r.startsWith('memory/'))) manifest.parts.push('memories');

    let desk = 0;
    for (const part0 of DESKTOP_PARTS) {
      const full0 = path.join(p.desktop, part0);
      let st;
      try { st = await fsp.stat(full0); } catch (e) { continue; }
      const files = st.isDirectory() ? (await walk(full0)).map(r => part0 + '/' + r) : [part0];
      for (const r of files) {
        // leveldb's LOCK is held by the running app and means nothing in a copy
        if (/(^|\/)LOCK$/.test(r)) continue;
        try {
          const full = path.join(p.desktop, ...r.split('/'));
          await zip.add('desktop/' + r, await fsp.readFile(full), (await fsp.stat(full)).mtime);
          desk++;
        } catch (e) { warnings.push('skipped desktop/' + r); }
      }
    }
    if (desk) manifest.parts.push('desktop');
    try { await zip.add('env/.env', await fsp.readFile(p.env), now); manifest.parts.push('env'); } catch (e) {}

    await zip.add('jun-save.json', Buffer.from(JSON.stringify(manifest, null, 2)), now);
    await zip.close();
    await fsp.rename(part, file);
    const size = (await fsp.stat(file)).size;
    return { ok: true, file, manifest: { ...manifest, file, size } };
  } catch (e) {
    await zip.abort();
    return { ok: false, error: e.message || String(e) };
  } finally {
    try { await fsp.unlink(tmpDb); } catch (e) {}
  }
}

function defaultName(kind, now) {
  const when = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { daily: 'Daily save ' + when, 'before-restore': 'Before going back', 'before-update': 'Before an update' }[kind] || 'Save ' + when;
}

async function readManifest(file) {
  const entries = await readZipIndex(file);
  const m = entries.filter(e => e.name === 'jun-save.json').pop();
  if (!m) throw new Error('not a Jun save');
  const man = JSON.parse((await readEntry(file, m)).toString('utf8'));
  if (man.app !== 'jun-save') throw new Error('not a Jun save');
  return { man, entries };
}

// newest first. a damaged file still shows up (so he can delete it)
async function listSaves(dir) {
  let names;
  try { names = await fsp.readdir(dir); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    if (!n.toLowerCase().endsWith(EXT)) continue;
    const file = path.join(dir, n);
    let size = 0, mtime = new Date(0);
    try { const st = await fsp.stat(file); size = st.size; mtime = st.mtime; } catch (e) { continue; }
    try {
      const { man } = await readManifest(file);
      out.push({ file, size, name: man.name, kind: man.kind, created: man.created, day: man.day, parts: man.parts || [], schema: man.schema || 0, gitHead: man.gitHead || '' });
    } catch (e) {
      out.push({ file, size, name: n, kind: 'broken', created: mtime.toISOString(), day: '', parts: [], broken: true });
    }
  }
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

// keep the newest `keep` of a kind
async function prune(dir, kind, keep) {
  if (kind === 'named' || !(keep >= 1)) return [];
  const gone = [];
  for (const s of (await listSaves(dir)).filter(x => x.kind === kind).slice(keep)) {
    try { await fsp.unlink(s.file); gone.push(s.file); } catch (e) {}
  }
  return gone;
}

async function removeSave(dir, file) {
  if (!inside(file, dir) || !file.toLowerCase().endsWith(EXT)) return false;
  try { await fsp.unlink(file); return true; } catch (e) { return false; }
}

// ---------------------------------------------------------------
// going back to a save

// before anything is stopped: is this file whole, and is it hers?
async function checkSave(home, file) {
  let man, entries;
  try { ({ man, entries } = await readManifest(file)); } catch (e) { return { ok: false, error: "That file isn't a Jun save, or it's damaged." }; }
  const db = entries.find(e => e.name === 'state/omega.sqlite');
  if (!db) return { ok: false, error: "That save has no database in it." };
  const tmp = path.join(os.tmpdir(), `jun-check-${process.pid}-${Date.now()}.sqlite`);
  try {
    await fsp.writeFile(tmp, await readEntry(file, db));
    const r = await dbTool(home, ['check', tmp]);
    if (!r.ok) return { ok: false, error: "That save's database is damaged: " + (r.error || '') };
    // every other entry must unpack too
    for (const e of entries) if (e.name !== db.name) await readEntry(file, e);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  } finally { try { await fsp.unlink(tmp); } catch (e) {} }
  return { ok: true, manifest: man };
}

async function rmrf(p) { await fsp.rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

// her server MUST be stopped. swaps runtime\state for the save's
// (the old one stays as runtime\state.previous until the next time),
// and unpacks the desktop part into runtime\desktop-pending, which
// applyPendingDesktop() moves in once the desktop app is closed
// (relaunch.js). any failure puts the old state back.
async function restoreSave(home, file) {
  const p = paths(home);
  const { man, entries } = await readManifest(file);
  const restoring = p.state + '.restoring';
  const previous = p.state + '.previous';
  await rmrf(restoring);
  await rmrf(p.pending);
  await fsp.mkdir(restoring, { recursive: true });
  let deskCount = 0;
  for (const e of entries) {
    let target = null;
    if (e.name.startsWith('state/')) target = safeJoin(restoring, e.name.slice(6));
    else if (e.name.startsWith('desktop/')) {
      const rel = e.name.slice(8);
      if (DESKTOP_PARTS.includes(rel.split('/')[0])) target = safeJoin(p.pending, rel);
      if (target) deskCount++;
    }
    if (!target) continue;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, await readEntry(file, e));
  }
  if (!fs.existsSync(path.join(restoring, 'omega.sqlite'))) { await rmrf(restoring); throw new Error('the save has no database'); }
  // caches (rl, consolidating) aren't in a save, they start fresh
  await rmrf(previous);
  let moved = false;
  try {
    if (fs.existsSync(p.state)) { await fsp.rename(p.state, previous); moved = true; }
    await fsp.rename(restoring, p.state);
  } catch (e) {
    if (moved && !fs.existsSync(p.state)) { try { await fsp.rename(previous, p.state); } catch (e2) {} }
    throw e;
  }
  if (deskCount) await fsp.writeFile(path.join(p.pending, '.ready'), man.name || 'save');
  else await rmrf(p.pending);
  return { ok: true, manifest: man, desktop: deskCount > 0 };
}

// with the desktop app closed: her desktop storage from the save
function applyPendingDesktop(home) {
  const p = paths(home);
  if (!fs.existsSync(path.join(p.pending, '.ready'))) {
    // a restore that died halfway: leave the current desktop alone
    if (fs.existsSync(p.pending)) try { fs.rmSync(p.pending, { recursive: true, force: true }); } catch (e) {}
    return false;
  }
  fs.mkdirSync(p.desktop, { recursive: true });
  for (const part of DESKTOP_PARTS) {
    const from = path.join(p.pending, part);
    if (!fs.existsSync(from)) continue;
    const to = path.join(p.desktop, part);
    fs.rmSync(to, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    fs.renameSync(from, to);
  }
  fs.rmSync(p.pending, { recursive: true, force: true });
  return true;
}

// a line for the next start of the app ("she's back to your save")
function writeNote(home, note) {
  try { fs.writeFileSync(paths(home).note, JSON.stringify({ ...note, at: Date.now() })); } catch (e) {}
}
function takeNote(home) {
  const f = paths(home).note;
  try {
    const n = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.unlinkSync(f);
    // only a fresh one: a note from a restart a day ago is stale
    return n && Date.now() - (n.at || 0) < 30 * 60 * 1000 ? n : null;
  } catch (e) { return null; }
}

module.exports = {
  EXT, KINDS, KEEP_AUTO, KEEP_CHOICES, KEEP_DEFAULT, DESKTOP_PARTS,
  paths, loadSettings, writeSettings, checkDir, inside, localDay,
  makeSave, listSaves, prune, removeSave, readManifest, checkSave, restoreSave, applyPendingDesktop,
  writeNote, takeNote, run,
  // for the tests
  _zip: { ZipWriter, readZipIndex, readEntry, crc32, safeJoin },
};
