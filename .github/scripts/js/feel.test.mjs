// core feel (#27, webapp/js/core/feel/): her needs, getting tired of things + her favorites, the
// repeat watcher, the session phase and the baseline reaction composer. A fake clock, a fake
// localStorage, no DOM.
//
// run: node --test .github/scripts/js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

// the effects off: moods.js draws nothing (no DOM here), the rules still run
mem.set('desktop.fx', JSON.stringify({ mAmount: 0 }));
const Feel = await import('../../../webapp/js/core/feel/feel.js');
const { Store, Needs, Tired, Repeat, Session, Compose, Tune } = Feel;
const Moods = await import('../../../webapp/js/desktop/moods.js');

// noon on a weekday, local time
let t = new Date(2026, 10, 13, 12, 0, 0).getTime();
Store.setClock(() => t);
const later = (min) => { t += min * 60e3; };

beforeEach(() => {
  for (const k of [...mem.keys()]) if (k !== 'desktop.fx') mem.delete(k);
  Store.setStorage(globalThis.localStorage);
  Tune.reset();
  Store.reset({ keepSeed: false });
  Feel.refresh();
});

test('her needs grow by themselves and things together satisfy them', () => {
  const a = Needs.levels();
  later(120);
  const b = Needs.levels();
  for (const k of ['attention', 'affection', 'play', 'stimulation']) assert.ok(b[k] > a[k], k + ' grows');
  Feel.held('hug', 30000);
  const c = Needs.levels();
  assert.ok(c.affection < b.affection, 'a hug gives affection');
  Feel.held('side', 20000);
  assert.ok(Needs.levels().play < c.play, 'tickles are play');
  const d = Needs.levels().attention;
  Feel.message();
  assert.ok(Needs.levels().attention < d, 'talking to her is attention');
});

test('missing him levels off, and she sleeps through the night', () => {
  later(60 * 30);
  const n = Needs.levels();
  assert.ok(n.attention <= 0.9, 'a big hello, never despair: ' + n.attention);
  // late at night, after hours without him, rest goes down (she slept)
  t = new Date(2026, 10, 14, 1, 0, 0).getTime();
  Needs.setLevel('rest', 0.9);
  later(5 * 60);
  assert.ok(Needs.levels().rest < 0.5, 'slept: ' + Needs.levels().rest);
});

test('rest: sleepier at night than at noon', () => {
  t = new Date(2026, 10, 13, 12, 0, 0).getTime();
  Feel.message();
  Needs.setLevel('rest', 0.1);
  later(60); Feel.message();
  const day = Needs.levels().rest;
  t = new Date(2026, 10, 13, 23, 30, 0).getTime();
  Feel.message();
  Needs.setLevel('rest', 0.1);
  later(60); Feel.message();
  assert.ok(Needs.levels().rest > day, 'night ' + Needs.levels().rest + ' > day ' + day);
});

test('words, not numbers', () => {
  assert.equal(Needs.words('play', 0.8), 'really wants to play');
  assert.equal(Needs.words('rest', 0.55), 'is getting sleepy');
  assert.equal(Needs.words('rest', 0.1), null);
  Needs.setLevel('play', 0.9);
  assert.equal(Needs.top(), 'play');
});

test('getting tired of a touch: diminishing returns first, then enough, then fresh again in a few hours', () => {
  Tired.setOptions({ favorites: false });
  assert.equal(Tired.state('head'), 'fresh');
  Feel.held('head', 40000);
  assert.ok(['enjoying', 'fresh'].includes(Tired.state('head')));
  for (let i = 0; i < 6; i++) Feel.held('head', 30000);
  assert.ok(['enough', 'plenty'].includes(Tired.state('head')), Tired.state('head'));
  assert.ok(Tired.factor('head') < 0.8, 'less power: ' + Tired.factor('head'));
  // the ear shares part of it
  assert.ok(Tired.loadOf('ear') > 0, 'related touch shares some');
  assert.ok(Tired.loadOf('ear') < Tired.loadOf('head'));
  later(60);
  assert.ok(Tired.loadOf('head') < Tired.loadOf('head', t - 60 * 60e3), 'fades');
  later(150);
  assert.equal(Tired.state('head'), 'fresh', 'fresh again after ~3.5 h');
});

test('she tells you once per crossing, then again only after she recovered', () => {
  Tired.setOptions({ favorites: false });
  const told = [];
  const off = Feel.onChange((e) => told.push(e.state));
  for (let i = 0; i < 12; i++) Feel.held('side', 15000);
  assert.ok(told.includes('plenty') && told.includes('enough'), told.join());
  const n = told.length;
  Feel.held('side', 15000);
  assert.equal(told.length, n, 'not again while she is still tired of it');
  later(400);
  Feel.held('side', 2000);
  for (let i = 0; i < 12; i++) Feel.held('side', 15000);
  assert.ok(told.length > n, 'again after she recovered');
  off();
});

test('switches: tiring off = never tired; pace 0 % = never; pace 100 % = quicker', () => {
  Tired.setOptions({ favorites: false, tiring: false });
  for (let i = 0; i < 10; i++) Feel.held('side', 20000);
  assert.equal(Tired.state('side'), 'fresh');
  assert.equal(Tired.factor('side'), 1);
  Tired.clear();
  Tired.setOptions({ tiring: true, pace: 0 });
  Feel.held('side', 60000);
  assert.equal(Tired.loadOf('side'), 0);
  Tired.setOptions({ pace: 50 }); Feel.held('hug', 20000); const half = Tired.loadOf('hug');
  Tired.clear();
  Tired.setOptions({ pace: 100 }); Feel.held('hug', 20000);
  assert.ok(Math.abs(Tired.loadOf('hug') - 2 * half) < 1e-6);
  Tired.setOptions({ pace: 50 });
});

test('her own favorites: different per Jun, stable for one, drifting slowly, nudged by her mood', () => {
  const kinds = ['head', 'ear', 'hand', 'hug', 'side', 'tail', 'footrub'];
  const mine = kinds.map(k => Tired.fav(k));
  assert.deepEqual(kinds.map(k => Tired.fav(k)), mine, 'stable');
  for (const v of mine) assert.ok(v > 0.6 && v < 1.6, String(v));
  assert.ok(new Set(mine.map(v => v.toFixed(3))).size > 3, 'not all the same');
  Store.reset({ keepSeed: false });
  const other = kinds.map(k => Tired.fav(k));
  assert.notDeepEqual(other, mine, 'another Jun has her own');
  later(60 * 24 * 21);
  const drifted = kinds.map(k => Tired.fav(k));
  assert.notDeepEqual(drifted, other, 'drifts over weeks');
  for (let i = 0; i < kinds.length; i++) assert.ok(Math.abs(drifted[i] / other[i] - 1) < 0.4, 'gently');
  assert.ok(Tired.fav('hug', { mood: 'upset' }) > Tired.fav('hug', {}), 'a warm touch when she is down');
  Tired.setOptions({ favorites: false });
  assert.equal(Tired.fav('hug'), 1);
  Tired.setOptions({ favorites: true });
});

test('the repeat watcher pushes repeats down, and lets "OK while building up" through', () => {
  const items = ['a', 'b', 'c'];
  let r = 0;
  const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const rand = () => seq[r++ % seq.length];
  const first = Repeat.pick('emote', items, { rand });
  const second = Repeat.pick('emote', items, { rand });
  assert.notEqual(second, first, 'not the same twice');
  assert.ok(Repeat.penalty('emote', first) > 0);
  later(10);
  assert.equal(Repeat.penalty('emote', first), 0, 'forgotten after a while');
  Repeat.note('line', 'kiss me');
  assert.ok(Repeat.penalty('line', 'kiss me') > 0.9);
  const tagged = [{ id: 'kiss me', okBuild: true }, { id: 'hmm', w: 1 }];
  assert.equal(Repeat.pick('line', tagged, { rand: () => 0.5, note: false }), 'hmm', 'pushed down normally');
  Repeat.build('kiss', 5000);
  assert.equal(Repeat.pick('line', tagged, { rand: () => 0.5, note: false }), 'kiss me', 'free while building up');
  later(1);
  assert.equal(Repeat.isBuilding(), false, 'the moment closes by itself');
  Feel.Repeat.setEnabled(false);
  assert.equal(Repeat.penalty('line', 'kiss me'), 0, 'off = no push');
  Feel.Repeat.setEnabled(true);
});

test('session shape: away, greeting, warm-up, peak, wind-down, afterglow', () => {
  assert.equal(Session.phase(), 'away');
  later(120);
  Feel.message();
  assert.equal(Session.phase(), 'greeting');
  later(3);
  Feel.poke('nose');
  assert.equal(Session.phase(), 'warmup');
  for (let i = 0; i < 8; i++) { Feel.message(); later(0.3); }
  assert.equal(Session.phase(), 'peak');
  later(9); Feel.poke('cheek'); later(0.5);
  assert.equal(Session.phase(), 'winddown');
  Feel.held('hug', 30000);
  assert.equal(Session.phase(), 'afterglow');
  later(40);
  assert.equal(Session.phase(), 'away');
});

test('the composer: tiredness and favorites shape the same touch', () => {
  Tired.setOptions({ favorites: false });
  const base = Moods.feelingFor('head', 'hold', 3000, { stage: 5, mood: 'neutral', mTsun: true, mComfort: true }, 0.9);
  const fresh = Compose.compose({ kind: 'head', how: 'hold', ms: 3000, seed: 0.9, base, ctx: { stage: 5 } });
  assert.equal(fresh.feeling, base.feeling);
  for (let i = 0; i < 9; i++) Feel.held('head', 30000);
  const tired = Compose.compose({ kind: 'head', how: 'hold', ms: 3000, seed: 0.9, base, ctx: { stage: 5 } });
  assert.ok(tired.power < fresh.power, 'less power when tired');
  assert.notEqual(tired.feeling, 'loves', 'no longer loves it right now');
  assert.ok(tired.why.some(w => w.startsWith('tired of it')), tired.why.join());
  assert.equal(Compose.compose({ kind: 'head', base: null }), null);
});

test('moods.js goes through the composer and tells feel about touches', () => {
  Moods.setFeel(Feel);
  Moods.setContext({ stage: 4, mood: 'neutral' });
  Moods.begin('press', 'hug', t - 20000);
  assert.deepEqual(Feel.snapshot().going.map(g => g.kind), ['hug']);
  Moods.end('press');
  assert.equal(Feel.snapshot().going.length, 0);
  assert.ok(Store.get().hist.some(h => h[2] === 'hug'), 'the hug is in her history');
  Moods.poke('nose');
  assert.ok(Store.get().hist.some(h => h[2] === 'poke.nose'));
  Moods.setFeel(null);
});

test('forChat: a small summary, honoring the switches', () => {
  Needs.setLevel('play', 0.8);
  const c = Feel.forChat();
  assert.equal(c.needs.play, 0.8);
  assert.ok(Array.isArray(c.tired));
  assert.ok(Session.PHASES.includes(c.phase));
  assert.ok(JSON.stringify(c).length < 400, 'small');
});

test('the tune: lab overrides apply, reach the numbers, and reset', () => {
  assert.equal(Tune.get('tired.halfLifeMin'), 40);
  assert.ok(Tune.set('tired.halfLifeMin', 10));
  assert.equal(Feel.Tune.TUNE.tired.halfLifeMin, 10);
  assert.equal(Tune.set('tired.nope', 3), false);
  assert.equal(Tune.set('tired', 3), false);
  Tune.load();
  assert.equal(Tune.get('tired.halfLifeMin'), 10, 'saved');
  Tune.reset();
  assert.equal(Tune.get('tired.halfLifeMin'), 40);
  assert.ok(Tune.paths().includes('needs.rise.play'));
});
