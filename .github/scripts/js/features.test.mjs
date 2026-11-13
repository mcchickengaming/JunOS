// the feature registry (webapp/data/features.json + js/core/features.js) and the one
// consent + ratings gate (js/core/gate.js): the registry is consistent with the code it
// describes, and the js gate passes the same cases as api/lib/gate.php.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const REG = JSON.parse(read('webapp/data/features.json'));
const F = await import('../../../webapp/js/core/features.js');
const G = await import('../../../webapp/js/core/gate.js');
const Fx = await import('../../../webapp/js/desktop/fx.js');
F.use(REG);

// desktop/main.js DEFAULTS.desk, read from the source (it's an electron file)
const deskDefaults = (() => {
  const m = read('desktop/main.js').match(/desk:\s*(\{[^}]*\})/);
  return Function('return ' + m[1])();
})();

test('every entry is complete and unique', () => {
  const ids = new Set();
  for (const f of REG.features) {
    assert.ok(/^[a-z][a-z0-9_]*$/.test(f.id), f.id);
    assert.ok(!ids.has(f.id), 'duplicate ' + f.id);
    ids.add(f.id);
    assert.ok(f.name && f.line, f.id + ' needs a name and a line');
    assert.ok(REG.sections[f.section], f.id + ': section ' + f.section);
    assert.ok(REG.tiers.includes(f.tier), f.id + ': tier');
    assert.ok(Array.isArray(f.modes) && f.modes.length && f.modes.every(m => REG.modes.includes(m)), f.id + ': modes');
    assert.ok(['none', 'pc', 'chats'].includes(f.privacy), f.id + ': privacy');
    assert.equal(typeof f.profile, 'boolean', f.id + ': profile');
    assert.ok(Array.isArray(f.words) && f.words.length, f.id + ': search words');
    assert.ok(/^\d{4}-\d\d-\d\d$/.test(f.since), f.id + ': since');
    if (f.section === 'elsewhere') assert.ok(f.where, f.id + ': where');
    for (const k of [f.key, ...(f.more || [])].filter(Boolean)) assert.ok(REG.stores[k.split(':')[0]], f.id + ': store of ' + k);
  }
});

test('needs point at real features, no loops', () => {
  for (const f of REG.features) for (const n of f.needs || []) assert.ok(F.get(n), f.id + ' needs ' + n);
  const visit = (id, path) => {
    assert.ok(!path.includes(id), 'loop: ' + [...path, id].join(' > '));
    for (const n of F.get(id).needs || []) visit(n, [...path, id]);
  };
  for (const f of REG.features) visit(f.id, []);
});

test('the registry matches the code it describes', () => {
  for (const f of REG.features) {
    for (const k of [f.key, ...(f.more || [])].filter(Boolean)) {
      const [kind, name] = [F.kindOf(k), F.nameOfKey(k)];
      if (kind === 'fx') assert.ok(name in Fx.FX_DEFAULTS, k + ' is in FX_DEFAULTS');
      if (kind === 'desk') assert.ok(name in deskDefaults, k + ' is a desk setting');
      if (kind === 'comfort') assert.ok(name in G.DEFAULTS, k + ' is a comfort setting');
    }
    if (f.key && 'default' in f) {
      const name = F.nameOfKey(f.key);
      if (F.kindOf(f.key) === 'desk') assert.deepEqual(f.default, deskDefaults[name], f.id + ' default');
      if (F.kindOf(f.key) === 'comfort') assert.deepEqual(f.default, G.DEFAULTS[name], f.id + ' default');
      if (F.kindOf(f.key) === 'fx') assert.deepEqual(f.default, Fx.FX_DEFAULTS[name], f.id + ' default');
    }
  }
  assert.equal(F.get('thigh_squish').tier, 'flirty');
  assert.equal(F.get('headpat').tier, 'everyday');
});

test('presets only set things that exist', () => {
  for (const p of REG.presets) {
    assert.ok(p.id && p.name && p.line, 'preset ' + p.id);
    for (const [k, v] of Object.entries(p.values)) {
      const name = F.nameOfKey(k);
      if (F.kindOf(k) === 'desk') { assert.ok(name in deskDefaults, k); assert.equal(typeof v, typeof deskDefaults[name], k); }
      else if (F.kindOf(k) === 'fx') assert.ok(name in Fx.FX_DEFAULTS, k);
      else assert.fail('presets set desk: and fx: keys only (' + k + ')');
    }
  }
});

test('notes in plain words', () => {
  assert.match(F.offNote('feelings'), /^Off, this also pauses .*Tsundere moments.* and /);
  assert.equal(F.offNote('walk'), '');
  assert.equal(F.needsNote('glow', () => false), 'Paused: needs "How she feels" on.');
  assert.equal(F.needsNote('glow', () => true), '');
  assert.ok(F.search('wag').some(f => f.id === 'her_body'));
  assert.ok(F.search('nsfw').some(f => f.id === 'adult'));
  assert.deepEqual(F.ofKey('fx:mGlowStr'), { f: F.get('glow'), main: false });
});

test('new features follow his choice', () => {
  store.clear();
  assert.equal(F.firstRun(), true);
  assert.equal(F.firstRun(), false);
  assert.equal(F.unseen().length, 0, 'everything that ships today is not "new"');
  F.use({ ...REG, features: [...REG.features, { id: 'brand_new', name: 'New', key: 'feature:brand_new' }] });
  assert.deepEqual(F.unseen().map(f => f.id), ['brand_new']);
  assert.equal(F.isOn('brand_new'), true, 'surprise me: on');
  F.setPolicy('off');
  assert.equal(F.isOn('brand_new'), false, 'keep off: off until he decides');
  F.setOn('brand_new', true);
  assert.equal(F.isOn('brand_new'), true, 'his own pick wins');
  F.markSeen(['brand_new']);
  assert.equal(F.unseen().length, 0);
  F.use(REG);
});

test('per-mode values', () => {
  assert.equal(F.valueFor('fx:mAmount', 50, 'compact'), 50);
  F.setModeValue('compact', 'fx:mAmount', 25);
  assert.equal(F.valueFor('fx:mAmount', 50, 'compact'), 25);
  assert.equal(F.valueFor('fx:mAmount', 50, 'desktop'), 50);
  F.setModeValue('compact', 'fx:mAmount', undefined);
  assert.equal(F.valueFor('fx:mAmount', 50, 'compact'), 50);
});

test('the js gate passes every shared case', () => {
  const { cases } = JSON.parse(read('.github/scripts/gate-cases.json'));
  for (const c of cases) {
    const r = G.check(c.item, c.ctx);
    assert.deepEqual([r.show, r.her, r.why], [c.show, c.her, c.why], c.name);
    assert.equal(typeof r.words, 'string');
  }
});

test('hard locks: no file or setting can open them', () => {
  for (const tier of ['flirty', 'adult']) {
    for (const flavor of ['platonic', 'parent_daughter']) {
      const all = { flavor, flirty: true, adult: true, adultConfirmed: true, adultOutside: true, siblingsRated: true };
      assert.equal(G.check({ tier }, { comfort: all, mode: 'windowed', stage: 6, trust: 100 }).show, false, flavor + ' ' + tier);
      assert.equal(G.canTag(flavor, tier), false);
    }
  }
  assert.ok(Object.isFrozen(G.LOCKED));
  assert.equal(G.clean({ flavor: 'boss', flirty: 'yes' }).flavor, 'romantic');
  assert.equal(G.clean({ flirty: 'yes' }).flirty, true, 'wrong types fall back to the default');
});

test('the php gate has the same rules', { skip: (() => { try { execFileSync('php', ['-v']); return false; } catch { return 'no php'; } })() }, () => {
  const php = `require ${JSON.stringify(new URL('webapp/api/lib/gate.php', root).pathname)}; echo json_encode([GATE_FLAVORS, GATE_LOCKED, GATE_OPT_IN, GATE_DEFAULTS, GATE_TUNE]);`;
  const [flavors, locked, optIn, defaults, tune] = JSON.parse(execFileSync('php', ['-r', php], { encoding: 'utf8' }));
  assert.deepEqual(flavors, G.FLAVOR_IDS);
  assert.deepEqual(locked, { ...G.LOCKED });
  assert.deepEqual(optIn, { ...G.OPT_IN });
  assert.deepEqual(defaults, { ...G.DEFAULTS });
  assert.deepEqual(tune, { ...G.TUNE });
});
