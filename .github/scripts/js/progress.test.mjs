// the progression service's page side (#31 item 8): the data file keeps its rules, the registry
// knows the feature, and the client's off switch really asks for nothing.
// The engine itself is tested in .github/scripts/progress.test.php (it lives on her server).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('data/progress.json', root), 'utf8'));
const reg = JSON.parse(readFileSync(new URL('data/features.json', root), 'utf8'));
const php = readFileSync(new URL('api/lib/progress.php', root), 'utf8');

const NEVER = ['touch', 'chat', 'message', 'bond', 'affection', 'trust', 'relationship'];

test('the relationship is never levelled: no skill, source or buff touches it', () => {
  for (const id of Object.keys(data.skills)) assert.ok(!NEVER.includes(id), id);
  for (const [id, a] of Object.entries(data.activities)) assert.ok(a.source && !NEVER.includes(a.source), id + ': source');
  for (const [id, b] of Object.entries(data.buffs)) for (const stat of Object.keys(b.effect)) assert.ok(!NEVER.includes(stat.split('.')[0]), id);
  // the same list as her server's, so neither side can drift
  const m = php.match(/const PROGRESS_NEVER_SOURCES = \[([^\]]+)\]/);
  assert.deepEqual(m[1].split(',').map(s => s.trim().replace(/'/g, '')), NEVER);
});

test('every activity works at any bond and any flavor, and is everyday', () => {
  for (const [id, a] of Object.entries(data.activities)) {
    for (const k of ['minStage', 'minBond', 'stage', 'flavor', 'flavors']) assert.ok(!(k in a), id + ': ' + k);
    assert.equal(a.tier, 'everyday', id);
  }
});

test('his first skills and her paired ones are all there', () => {
  for (const s of ['delving', 'tinkering', 'crafting', 'cooking', 'scavenging', 'fishing', 'focus']) assert.ok(data.skills[s].owners.includes('player'), s);
  for (const s of ['delving', 'scanning', 'hacking', 'support', 'souschef', 'mechanic']) assert.ok(data.skills[s].owners.includes('jun'), s);
  assert.equal(data.skills.focus.optIn, true);
});

test('every activity has finds of every size within reach, shared and its own', () => {
  for (const [id, a] of Object.entries(data.activities)) {
    if (a.away) continue;
    const shared = (a.pools || []).flatMap(p => data.pools[p]);
    for (const size of ['small', 'mid', 'big']) assert.ok(shared.some(r => r.size === size), id + ': no shared ' + size);
    assert.ok(a.signature.length, id + ': no signature finds');
  }
});

test('Focus: opt-in, a daily cap, and no permanent buff anywhere near it', () => {
  const f = data.activities.sample_focus;
  assert.equal(f.needsOpt, 'focus');
  assert.ok(f.dailyCapMin > 0 && f.noPermanent);
  for (const r of f.signature) if (r.kind === 'buff') assert.notEqual(data.buffs[r.id].scope, 'permanent');
  for (const pool of Object.values(data.pools)) for (const r of pool) if (r.kind === 'buff') assert.notEqual(data.buffs[r.id].scope, 'permanent');
});

test('the registry knows it, and it is on by default', () => {
  const f = reg.features.find(x => x.id === 'progress');
  assert.equal(f.key, 'feature:progress');
  assert.equal(f.default, true);
  assert.equal(f.tier, 'everyday');
  assert.ok(reg.features.find(x => x.id === 'progress_lab'));
});

test('switched off, the client asks her server for nothing', async () => {
  const store = new Map([['jun.features', JSON.stringify({ on: { progress: false } })]]);
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (String(url).includes('features.json')) return { ok: true, json: async () => reg };
    return { ok: true, json: async () => ({ result: { ok: true }, state: { owners: {} } }) };
  };
  const F = await import(new URL('js/core/features.js', root));
  if (F.load) await F.load();
  const P = await import(new URL('js/core/progress.js', root));
  const before = calls;
  assert.equal(P.isOn(), false);
  {
    assert.deepEqual(await P.begin('sample_fishing'), { off: true });
    assert.deepEqual(await P.finish(), { off: true });
    assert.deepEqual(await P.load(), { off: true });
    assert.equal(calls, before);
  }
  await P.simulate('sample_fishing', 10);
  assert.equal(calls, before + 1, 'the lab still works');
  assert.equal(P.band(1), 'new at it');
  assert.equal(P.band(95), 'a master');
});
