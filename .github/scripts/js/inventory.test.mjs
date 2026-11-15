// items, currencies and keepsakes, the page side (#9 base, webapp/js/core/inventory.js): the catalog's shape the
// page relies on, words for every server answer, counts and tiers in words, and the filter. The rules are tested in
// .github/scripts/inventory.test.php.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const I = await import(new URL('js/core/inventory.js', root));
const items = JSON.parse(readFileSync(new URL('data/items.json', root), 'utf8'));
const php = readFileSync(new URL('api/lib/inventory.php', root), 'utf8') + readFileSync(new URL('api/inventory.php', root), 'utf8');
const reg = JSON.parse(readFileSync(new URL('data/features.json', root), 'utf8'));

test('five currencies, every item a known kind, keepsakes never for sale', () => {
  assert.deepEqual(Object.keys(items.currencies), ['credits', 'materials', 'salvage_sigils', 'whispers', 'citizen_pass']);
  for (const [id, it] of Object.entries(items.items)) {
    assert.ok(items.kinds[it.kind], id + ': kind');
    if (it.kind === 'keepsake') assert.ok(!it.sell, id + ': never sold');
    if (it.tier !== undefined) assert.ok(I.tierWords(it.tier), id + ': tier in words');
  }
});

test('every answer the server can give has plain words', () => {
  const codes = new Set([...php.matchAll(/'error' => '([a-z_]+)'/g)].map(m => m[1]));
  for (const c of codes) assert.ok(I.WORDS[c], 'words for ' + c);
});

test('counts and tiers in words', () => {
  assert.equal(I.countWords({ name: 'Good parts', count: 3 }), '3 × Good parts');
  assert.equal(I.countWords({ name: 'A fish of legend', count: 1 }), 'A fish of legend');
  assert.equal(I.tierWords(4), 'rare');
  assert.equal(I.tierWords(null), '');
});

test('the filter finds by name, line, kind or tier, keepsakes and money too', () => {
  const v = {
    currencies: [{ id: 'credits', name: 'Credits', line: 'money', amount: 5 }],
    kinds: [{ kind: 'part', name: 'Parts', items: [{ name: 'A rare part', line: 'old', tier: 4, count: 1 }, { name: 'Loose parts', line: 'screws', tier: 1, count: 3 }] },
      { kind: 'catch', name: 'Catches', items: [{ name: 'A fish of legend', line: 'nobody believes you', tier: 5, count: 1 }] }],
    keepsakes: [{ name: "The general's medal", line: 'pinned on you', from: 'A dinner' }],
  };
  assert.deepEqual(I.filter(v, 'rare').kinds.map(k => k.items.map(i => i.name)), [['A rare part']]);
  assert.deepEqual(I.filter(v, 'exceptional').kinds.map(k => k.kind), ['catch'], 'by tier word');
  assert.equal(I.filter(v, 'medal').keepsakes.length, 1);
  assert.equal(I.filter(v, 'money').currencies.length, 1);
  assert.equal(I.filter(v, '').kinds.length, 2, 'no words, everything');
});

test('the registry knows it', () => {
  const f = reg.features.find(x => x.id === 'owned');
  assert.equal(f.section, 'game');
  assert.equal(f.anchor, 'at-owned');
});

test('more than one drops the "a"/"an"', () => {
  assert.equal(I.countWords({ name: 'An old servo', count: 2 }), '2 × old servo');
  assert.equal(I.countWords({ name: 'An old servo', count: 1 }), 'An old servo');
});
