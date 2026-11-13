// core feel (#27, webapp/js/core/feel/): her needs, getting tired of things + her favorites, the
// repeat watcher, the session phase and the reaction composer (how it's done, what just
// happened, how it plays out, seeing his hand coming). A fake clock, a fake
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
  Store.reset(); // a clean history: the same touch twice in a row weighs a little more
  Tired.setOptions({ pace: 100 }); Feel.held('hug', 20000);
  assert.ok(Math.abs(Tired.loadOf('hug') - 2 * half) < 1e-6);
  Tired.setOptions({ pace: 50 });
});

test('her own favorites: different per Jun, stable for one, drifting slowly, nudged by her mood', () => {
  const kinds = ['head', 'ear', 'hand', 'hug', 'side', 'tail', 'footrub'];
  const mine = kinds.map(k => Tired.fav(k));
  assert.deepEqual(kinds.map(k => Tired.fav(k)), mine, 'stable');
  for (const v of mine) assert.ok(v > 0.6 && v < 1.75, String(v));
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

// ---------------------------------------------------------------------------------------------
// the full reaction composer (part 2): how it's done, what just happened, how it plays out,
// the curves, and seeing his hand coming

const { Manner, Approach } = Feel;
const C5 = { stage: 5, mood: 'neutral', mTsun: true, mComfort: true };
const baseOf = (kind, how = 'hold', ms = 3000, ctx = C5, seed = 0.9) => Moods.feelingFor(kind, how, ms, ctx, seed);
const comp = (o) => Compose.compose({ how: 'hold', ms: 3000, seed: 0.9, ctx: C5, dry: true, force: { moment: [], phase: 'warmup' }, ...o, base: o.base || baseOf(o.kind, o.how || 'hold', o.ms ?? 3000, o.ctx || C5, o.seed ?? 0.9) });

test('how it\'s done: the tracker tells slow and gentle from fast and scrubby from a resting hand', () => {
  const unit = 400;
  // slow and steady: 60 px/s side to side
  let tr = Manner.tracker(), now = 1000;
  for (let i = 0; i < 60; i++) { now += 16; tr.add(100 + Math.sin(i / 25) * 30, 100, now); tr.read(now, unit); }
  let m = tr.read(now, unit);
  assert.equal(m.pace, 'gentle', JSON.stringify(m));
  assert.ok(m.gentleFor > 300, 'it has been gentle for a while');
  // fast and scrubby: big quick zigzags
  tr = Manner.tracker(); now = 1000;
  for (let i = 0; i < 80; i++) { now += 16; tr.add(100 + (i % 6 < 3 ? 1 : -1) * 60 + i % 3 * 20, 100 + (i % 2) * 15, now); tr.read(now, unit); }
  m = tr.read(now, unit);
  assert.equal(m.pace, 'rough', JSON.stringify(m));
  assert.ok(m.roughFor > 500 && m.roughShare > 0.5, JSON.stringify(m));
  // the same hand movement on a twice as big Jun is half as fast for her
  tr = Manner.tracker(); now = 1000;
  for (let i = 0; i < 60; i++) { now += 16; tr.add(100 + i * 4, 100, now); }
  assert.ok(Math.abs(tr.read(now, 800).speed * 2 - tr.read(now, 400).speed) < 1e-9);
  // nothing moves: a hand resting on her
  tr = Manner.tracker(); tr.add(5, 5, 1000);
  assert.equal(tr.read(1000, unit), null, 'too early to tell');
  assert.equal(tr.read(3000, unit).pace, 'still');
});

test('how it\'s done: gentle lands better and melts her, rough tickles, too much gets a pout', () => {
  Tired.setOptions({ favorites: false });
  const plain = comp({ kind: 'head' });
  const gentle = comp({ kind: 'head', manner: Manner.named('gentle', 500) });
  assert.ok(gentle.power > plain.power, 'slow and gentle lands better');
  assert.ok(gentle.why.includes('slow and gentle'));
  assert.ok(gentle.tempo > plain.tempo, 'and her effects take their time');
  // an ear rub she only "likes" so far: slow and gentle long enough and she melts
  const c4 = { ...C5, stage: 4 };
  const ear = { kind: 'ear', ms: 1000, ctx: c4 };
  assert.equal(comp(ear).feeling, 'likes');
  const melt = comp({ ...ear, manner: Manner.named('gentle', 4000) });
  assert.equal(melt.feeling, 'loves');
  assert.equal(melt.variant, 'melt');
  assert.ok(melt.moment.includes('melt'));
  assert.equal(comp({ ...ear, manner: Manner.named('gentle', 4000), ctx: { ...C5, stage: 3, mTsun: false } }).moment.includes('melt'), false, 'not yet at Friend');
  // fast and scrubby: it tickles
  const rough = comp({ kind: 'head', manner: Manner.named('rough', 500) });
  assert.equal(rough.feeling, 'giggly');
  assert.ok(rough.tempo < plain.tempo, 'quick and lively');
  // too rough for too long: a pout (flustered, never "not ready" with someone she's close to)
  const much = comp({ kind: 'head', manner: Manner.named('rough', 5000) });
  assert.equal(much.feeling, 'flustered');
  assert.ok(much.moment.includes('toomuch'));
  assert.equal(much.line, 'pout');
  // a stranger isn't ready for that, and sooner
  const c1 = { ...C5, stage: 1 };
  assert.equal(comp({ kind: 'head', ctx: c1, manner: Manner.named('rough', 1600) }).feeling, 'notready');
  // a tickle is meant to be quick
  assert.ok(comp({ kind: 'side', manner: Manner.named('rough', 500) }).power > comp({ kind: 'side' }).power);
  // a hand that isn't moving has no manner
  assert.equal(comp({ kind: 'hug', manner: Manner.named('still') }).power, comp({ kind: 'hug' }).power);
  // the switch
  Compose.setOptions({ manner: false });
  assert.equal(comp({ kind: 'head', manner: Manner.named('rough', 5000) }).feeling, plain.feeling);
  Compose.setOptions({ manner: true });
});

test('a rough rub wears on her quicker', () => {
  Tired.setOptions({ favorites: false });
  Feel.held('ear', 30000, 0);
  const calm = Tired.loadOf('ear');
  Store.reset();
  Feel.held('ear', 30000, 1);
  assert.ok(Tired.loadOf('ear') > calm * 1.3, 'more load when it was all rough');
  // and moods.js passes it on when the touch ends
  Store.reset();
  Feel.touchBegin('rub', 'ear', t - 30000);
  Feel.touchManner('rub', { roughShare: 1 });
  Feel.touchEnd('rub');
  assert.ok(Tired.loadOf('ear') > calm * 1.3);
});

test('what just happened: a change of touch, a combo\'s glow, a surprise, again right after "enough", hello', () => {
  Tired.setOptions({ favorites: false });
  const real = (o) => comp({ force: null, ...o });
  // nothing yet, then a poke out of nowhere
  let r = real({ kind: 'poke.cheek', how: 'poke', ms: 0, base: baseOf('cheek', 'poke', 0) });
  assert.ok(r.moment.includes('surprise'), r.moment.join());
  // ...unless she saw the hand coming
  Approach.forget();
  assert.ok(Approach.decide({ spot: 'cheek', dist: 0.05, closing: 1, ctx: C5, rand: () => 0 }), 'she noticed');
  r = real({ kind: 'poke.cheek', how: 'poke', ms: 0, base: baseOf('cheek', 'poke', 0) });
  assert.equal(r.moment.includes('surprise'), false, 'she saw it coming');
  Approach.forget();
  // a hug right after headpats is a change; more headpats are not
  Feel.held('head', 8000);
  later(0.2);
  const hug = real({ kind: 'hug', ms: 1000 });
  assert.ok(hug.moment.includes('change') && hug.why.includes('a change of touch'));
  assert.equal(real({ kind: 'head', ms: 1000 }).moment.includes('change'), false);
  assert.equal(real({ kind: 'ear', ms: 1000 }).moment.includes('change'), false, 'an ear rub after headpats is the same sort of thing');
  assert.equal(real({ kind: 'hug', ms: 9000 }).moment.includes('change'), false, 'only as it begins');
  // still glowing right after a combo
  Feel.combo('handhug');
  assert.ok(real({ kind: 'hug', ms: 1000 }).moment.includes('combo'));
  later(1);
  assert.equal(real({ kind: 'hug', ms: 1000 }).moment.includes('combo'), false);
  // she said enough, and here it comes again: a pout
  for (let i = 0; i < 14; i++) Feel.held('side', 15000);
  assert.equal(Tired.state('side'), 'enough');
  r = real({ kind: 'side', ms: 800 });
  assert.ok(r.moment.includes('insist'), r.moment.join());
  assert.equal(r.line, 'pout');
  // back after hours away: warm touches land better
  const hello = comp({ kind: 'hug', force: { moment: [], phase: 'greeting' } });
  assert.ok(hello.power > comp({ kind: 'hug' }).power && hello.why.includes('glad you\'re back'));
  assert.ok(comp({ kind: 'hug', force: { moment: [], phase: 'afterglow' } }).tempo > comp({ kind: 'hug' }).tempo, 'afterglow takes its time');
});

test('how it plays out: the same touch doesn\'t look the same every time, but one touch keeps its mind', async () => {
  Tired.setOptions({ favorites: false, tiring: false });
  const base = { feeling: 'loves', power: 0.8 };
  // twenty separate hugs, a few seconds apart
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const seed = (i * 0.6180339887) % 1;
    const first = Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed, base, ctx: C5 });
    // the same touch going on: 30 more ticks, the same way all through
    for (let k = 0; k < 30; k++) assert.equal(Compose.compose({ kind: 'hug', how: 'hold', ms: 600 + k * 120, seed, base, ctx: C5 }).variant, first.variant);
    seen.push(first.variant);
    later(0.1);
  }
  assert.ok(new Set(seen).size >= 3, 'plain, melt and sparkle all show up: ' + seen.join());
  // over many more: the way she just showed it is pushed down (by chance alone it would come
  // back about 36 % of the time)
  let same = 0, prev = null;
  for (let i = 0; i < 500; i++) {
    const v = Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed: Math.random(), base, ctx: C5 }).variant;
    if (v === prev) same++;
    prev = v;
    later(0.1);
  }
  assert.ok(same / 500 < 0.25, 'rarely the same way twice in a row: ' + same / 500);
  // pokes pick fresh every time, pushed off what she just did
  const pokes = [];
  for (let i = 0; i < 12; i++) pokes.push(Compose.compose({ kind: 'poke.nose', how: 'poke', seed: Math.random(), base: { feeling: 'flustered', power: 0.6 }, ctx: C5 }).variant);
  assert.ok(new Set(pokes).size >= 2, pokes.join());
  // every reaction says how it plays out
  const r = Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed: 0.3, base, ctx: C5 });
  assert.ok(Compose.LINE_TYPES.includes(r.line));
  assert.ok(r.tempo > 0.5 && r.tempo < 2);
  assert.ok(Array.isArray(r.moment) && 'ripple' in r && 'pieces' in r && 'delay' in r);
  // "She mixes it up" off: her usual way, every time
  Compose.setOptions({ variety: false });
  for (let i = 0; i < 10; i++) {
    const p = Compose.compose({ kind: 'hug', how: 'poke', seed: Math.random(), base, ctx: C5 });
    assert.equal(p.variant, 'plain'); assert.equal(p.tempo, 1); assert.equal(p.ripple, null);
  }
  Compose.setOptions({ variety: true });
  // her own ripple: now and then, not every time
  let n = 0;
  for (let i = 0; i < 200; i++) if (Compose.compose({ kind: 'hug', how: 'poke', seed: (i + 0.5) / 200, base, ctx: C5, dry: true }).ripple) n++;
  assert.ok(n > 20 && n < 90, 'about a quarter: ' + n);
});

test('a dry look leaves no trace (the feel lab, previews, ripples)', () => {
  const before = JSON.stringify(Store.get().repeat);
  for (let i = 0; i < 5; i++) Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed: Math.random(), base: { feeling: 'loves', power: 0.8 }, ctx: C5, dry: true });
  assert.equal(JSON.stringify(Store.get().repeat), before);
  // and with the same seed it's the same answer
  const a = Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed: 0.42, base: { feeling: 'loves', power: 0.8 }, ctx: C5, dry: true });
  const b = Compose.compose({ kind: 'hug', how: 'hold', ms: 500, seed: 0.42, base: { feeling: 'loves', power: 0.8 }, ctx: C5, dry: true });
  assert.deepEqual(a, b);
});

test('her body and her effects know everything the composer can ask for', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../../webapp/js/desktop/feelbody.js', import.meta.url), 'utf8');
  const known = JSON.parse(src.match(/export const KNOWN_VARIANTS = (\{[\s\S]*?\});/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"').replace(/,\s*\}/, '}'));
  assert.deepEqual(Object.fromEntries(Object.entries(Compose.VARIANTS).map(([f, l]) => [f, l.map(v => v.id)])), known);
  for (const [f, list] of Object.entries(known)) for (const v of list) assert.ok(src.includes(`'${v}'`), f + '.' + v);
  // every feeling of moods.js has variants and line types
  for (const [f] of Moods.FEELINGS) { assert.ok(Compose.VARIANTS[f], f); assert.ok(Compose.lineFor(f), f); }
  // the piece names it biases exist in moods.js
  const msrc = readFileSync(new URL('../../../webapp/js/desktop/moods.js', import.meta.url), 'utf8');
  const csrc = readFileSync(new URL('../../../webapp/js/core/feel/compose.js', import.meta.url), 'utf8');
  for (const m of csrc.matchAll(/bias\(\{([^}]*)\}\)/g)) for (const p of m[1].matchAll(/(\w+):/g)) assert.ok(msrc.includes(`['${p[1]}', `), 'piece ' + p[1]);
});

test('the tone of her next line comes from how she just took the touch, and changes', () => {
  assert.equal(Feel.lineHint(), null, 'nothing just happened');
  Feel.compose({ kind: 'head', how: 'hold', ms: 2000, seed: 0.5, base: { feeling: 'loves', power: 0.8 }, ctx: C5, manner: Manner.named('rough', 5000) });
  const h = Feel.lineHint();
  assert.equal(h.type, 'pout');
  assert.ok(h.words && !/\d/.test(h.words), 'words, not numbers');
  assert.ok(Repeat.recent('linetype').includes('pout'), 'remembered');
  later(1);
  assert.equal(Feel.lineHint(), null, 'only right after');
  // across many touches the tones vary
  const tones = new Set();
  for (let i = 0; i < 30; i++) { Feel.compose({ kind: 'hug', how: 'poke', seed: Math.random(), base: { feeling: 'loves', power: 0.8 }, ctx: C5 }); tones.add(Feel.lineHint().type); }
  assert.ok(tones.size >= 2, [...tones].join());
});

test('the curves: getting into it, then easing down with no cliff, settling far past "enough"', () => {
  const T = Tune.TUNE.tired;
  assert.equal(Tired.factorAt(0), 1);
  assert.ok(Tired.factorAt(T.enjoying) > 1 && Tired.factorAt(T.enjoying) <= 1 + T.warmUp + 1e-9, 'a little more as she gets into it');
  assert.ok(Math.abs(Tired.factorAt(T.enough) - T.floor) < 1e-9);
  let prev = Tired.factorAt(T.enjoying);
  for (let e = T.enjoying; e <= 6; e += 0.01) {
    const f = Tired.factorAt(e);
    assert.ok(f <= prev + 1e-9, 'never back up at ' + e);
    assert.ok(prev - f < 0.02, 'no cliff at ' + e.toFixed(2) + ': ' + (prev - f));
    prev = f;
  }
  assert.ok(prev > T.floorDeep - 1e-9 && prev < T.floorDeep + 0.03, 'settles at the deep floor: ' + prev);
  // the same touch again and again in a row weighs more each time, up to a point
  Tired.setOptions({ favorites: false });
  const steps = [];
  let last = 0;
  for (let i = 0; i < 6; i++) { Feel.poke('nose'); steps.push(Tired.loadOf('poke.nose') - last); last = Tired.loadOf('poke.nose'); }
  assert.ok(steps[1] > steps[0] && steps[2] > steps[1], steps.join());
  assert.ok(Math.abs(steps[5] - steps[4]) < 1e-6, 'then it stops growing');
});

test('no meta: what he gives her a lot of these days she\'s a little less keen on, and it comes back', () => {
  const fresh = Tired.fav('head');
  for (let d = 0; d < 4; d++) { for (let i = 0; i < 8; i++) Feel.held('head', 60000); later(60 * 20); }
  const worn = Tired.fav('head');
  // next to the same moment without this (her weekly drift moves on its own)
  Tune.set('tired.favMiss', 0);
  const plain = Tired.fav('head');
  Tune.set('tired.favMiss', null);
  assert.ok(worn < plain, 'a little less keen: ' + plain + ' → ' + worn);
  assert.ok(worn > plain * 0.9, 'only a little');
  assert.ok(fresh > 0);
  later(60 * 24 * 14);
  // (the weekly drift moves too, so compare the used part itself)
  assert.ok(Tired.usedOf('head') < 0.5, 'two weeks on it has faded');
});

test('she sees his hand coming: by bond, speed, what she wants and how much she\'s had', () => {
  Tired.setOptions({ favorites: false });
  const many = (o, n = 200) => { const c = {}; for (let i = 0; i < n; i++) { const r = Approach.decide({ spot: 'head', dist: 0.1, closing: 0.8, side: 1, ctx: C5, dry: true, ...o }); c[r ? r.type : 'none'] = (c[r ? r.type : 'none'] || 0) + 1; } return c; };
  // not near, or not coming closer: nothing
  assert.equal(Approach.decide({ spot: 'head', dist: 2, closing: 1, ctx: C5, dry: true }), null);
  assert.equal(Approach.decide({ spot: 'head', dist: 0.1, closing: -1, ctx: C5, dry: true }), null);
  assert.equal(Approach.decide({ spot: 'head', dist: 0.1, closing: 1, ctx: C5, dry: true, busy: true }), null);
  // close to him, a gentle hand toward her head: she leans in a good share of the time
  const close = many({});
  assert.ok(close.leanin > 40, JSON.stringify(close));
  assert.ok(!close.flinch && !close.guard, JSON.stringify(close));
  // a stranger braces or just watches; never leans in
  const stranger = many({ ctx: { ...C5, stage: 1 } });
  assert.ok(!stranger.leanin && stranger.brace > 40, JSON.stringify(stranger));
  // a hand coming fast: a stranger flinches, someone close mostly just blinks
  const fastS = many({ closing: 4, ctx: { ...C5, stage: 1 } });
  assert.ok(fastS.flinch > 100, JSON.stringify(fastS));
  const fastC = many({ closing: 4 });
  assert.ok((fastC.blink || 0) + (fastC.perk || 0) > (fastC.flinch || 0), JSON.stringify(fastC));
  // she wanted affection: more leaning in
  assert.ok(many({ needs: { affection: 0.9 } }, 4000).leanin > many({}, 4000).leanin * 1.05);
  // had enough headpats: she guards
  for (let i = 0; i < 12; i++) Feel.held('head', 30000);
  assert.equal(Tired.state('head'), 'enough');
  assert.ok(many({}).guard > 100);
  // for real: one at a time, then quiet for a moment; her side of the hand; the switch
  Store.reset(); Approach.forget();
  const a = Feel.approach({ spot: 'hand', dist: 0.05, closing: 1, side: -1, ctx: { stage: 5 }, rand: () => 0 });
  assert.ok(a && Approach.TYPES.includes(a.type) && a.side === -1 && a.power > 0 && a.power <= 1);
  assert.equal(Feel.approach({ spot: 'hand', dist: 0.05, closing: 1, side: -1, ctx: { stage: 5 }, rand: () => 0 }), null, 'not again right away');
  later(1);
  Feel.touchBegin('press', 'hug');
  assert.equal(Feel.approach({ spot: 'hand', dist: 0.05, closing: 1, ctx: { stage: 5 }, rand: () => 0 }), null, 'not while a touch is going on');
  Feel.touchEnd('press');
  later(1);
  Feel.configure({ isOn: (id) => id !== 'anticipate' });
  assert.equal(Feel.approach({ spot: 'hand', dist: 0.05, closing: 1, ctx: { stage: 5 }, rand: () => 0 }), null, 'switched off');
  Feel.configure({ isOn: () => true });
  later(1);
  assert.ok(Feel.approach({ spot: 'hand', dist: 0.05, closing: 1, ctx: { stage: 5 }, rand: () => 0 }), 'and back on');
});

test('something to see the instant a touch lands: her body gets the reaction at once, with its way', async () => {
  const calls = [];
  Moods.setFeel(Feel);
  Moods.setBody({ show: (f, p, now, style) => calls.push(['show', f, style?.variant, style?.tempo]), after: (f, p, side, style) => calls.push(['after', f, style?.variant]), onset: (side, style) => calls.push(['onset', side, style?.feeling]) });
  Moods.setAnchor(() => ({ x: 200, y: 100, headW: 60, modelW: 200, modelH: 400 }), null);
  Moods.setContext({ stage: 5, mood: 'neutral' });
  Moods.begin('press', 'hug', Date.now(), { x: 260, y: 200 });
  // no waiting on a timer, let alone her brain: it's there before begin() returns
  assert.equal(calls[0][0], 'show');
  assert.ok(typeof calls[0][2] === 'string', 'with the way to show it');
  assert.deepEqual(calls[1].slice(0, 2), ['onset', 1], 'and the first-contact beat, on the hand\'s side');
  Moods.end('press');
  Moods.endAll();
  assert.equal(calls[calls.length - 1][0], 'after');
  // a poke too
  calls.length = 0;
  Moods.poke('nose', { x: 150, y: 100 });
  assert.equal(calls[0][0], 'show');
  assert.ok(calls.some(c => c[0] === 'onset'));
  assert.ok(Store.get().hist.some(h => h[2] === 'poke.nose'));
  // the composer now knows pokes by their real kind, so she can get tired of boops too
  for (let i = 0; i < 30; i++) Feel.poke('nose');
  const p = Moods.poke('nose');
  assert.ok(['plenty', 'enough'].includes(p.tired), p.tired);
  await new Promise(r => setTimeout(r, 1100));
  Moods.endAll();
  Moods.setBody(null); Moods.setFeel(null); Moods.setAnchor(null, null);
});
