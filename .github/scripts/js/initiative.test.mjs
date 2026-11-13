// the initiative engine (#4, webapp/js/core/feel/initiative.js + room.js): her wants, reading the
// room, the ladder, how she takes yes / no / nothing, what she learns, waving both ways, and the
// time-lapse. A fake clock, fake dice, no DOM.
//
// run: node --test .github/scripts/js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const Feel = await import('../../../webapp/js/core/feel/feel.js');
const { Store, Tune, Room, Initiative: I } = Feel;
const T = Tune.TUNE;

let t = new Date(2026, 10, 13, 12, 0, 0).getTime();
Store.setClock(() => t);
beforeEach(() => {
  mem.clear();
  Store.setStorage(globalThis.localStorage);
  Tune.reset();
  Store.reset({ keepSeed: false });
  Feel.configure({ isOn: () => true });
  I.resetTracker();
  t = new Date(2026, 10, 13, 12, 0, 0).getTime();
});

const FREE = { a: 1, cap: 5, why: 'free' };
const wanting = (st, id, v, now = t) => { for (const k of I.IDS) st.wants[k] = { v: k === id ? v : 0, at: now }; };
// dice that always say "yes, now" (0) or never (0.999)
const inp = (over = {}) => ({ now: t, rand: () => 0, needs: { affection: 0.8, attention: 0.8, play: 0.8, stimulation: 0.5 }, mood: 'neutral', stage: 5, day: 'easy', room: FREE, ...over });

test('most thoughts end in nothing; a want has to build first', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 0.1);
  assert.deepEqual(I.step(st, inp()), [], 'a small want stays inside her');
  let n = 0;
  const st2 = I.fresh();
  wanting(st2, 'headpat', 0.6);
  for (let i = 0; i < 3000; i++) { const r = I.step(st2, inp({ rand: Math.random, now: t + i * 4000 })); if (r.length) { n++; break; } }
  assert.equal(n, 1, 'with a real want and a free him she gets to it sooner or later');
});

test('her wants grow over time, faster when her needs fit', () => {
  const a = I.fresh(), b = I.fresh();
  I.step(a, inp({ rand: () => 0.999, needs: { affection: 0.9, attention: 0.9 } }));
  I.step(b, inp({ rand: () => 0.999, needs: { affection: 0.05, attention: 0.05 } }));
  t += 2 * 3600e3;
  I.step(a, inp({ rand: () => 0.999, needs: { affection: 0.9, attention: 0.9 } }));
  I.step(b, inp({ rand: () => 0.999, needs: { affection: 0.05, attention: 0.05 } }));
  assert.ok(a.wants.headpat.v > b.wants.headpat.v + 0.1, `${a.wants.headpat.v} vs ${b.wants.headpat.v}`);
  assert.ok(a.wants.headpat.v <= 1);
});

test('the bond decides how far she goes: a Stranger never asks for a headpat', () => {
  for (const [stage, max] of [[1, 0], [2, 1], [3, 3], [4, 5], [6, 5]]) {
    const st = I.fresh();
    wanting(st, 'headpat', 0.95);
    const r = I.step(st, inp({ stage }));
    if (!max) { assert.deepEqual(r, [], 'stage ' + stage); continue; }
    assert.equal(r[0].id, 'headpat');
    // climb as far as she can: every wait runs out, the dice always say "try harder"
    let top = r[0].rung;
    for (let i = 0; i < 6; i++) { t += 40e3; const n = I.step(st, inp({ stage })); if (n[0]?.do === 'act') top = n[0].rung; }
    assert.ok(top <= max, `stage ${stage}: reached ${top}, cap ${max}`);
  }
});

test('she starts low and never jumps straight to asking', () => {
  for (let i = 0; i < 50; i++) {
    const st = I.fresh();
    wanting(st, 'fetch', 1);
    let k = 0;
    const r = I.step(st, inp({ rand: () => [0, 0, (i % 10) / 10][k++ % 3] }));
    assert.ok(r.length && r[0].rung < 5, 'started at ' + r[0]?.rung);
  }
});

test('the room caps how loud she is', () => {
  const cases = [
    [{ idleSec: 600 }, 0, 'away'], [{ typingMs: 20000 }, 2, 'typing'], [{ idleSec: 60 }, 2, 'still'], [{ busyShare: 0.9 }, 2, 'busy'],
    [{ quietMode: true }, 1, 'quietMode'], [{ quietHours: true }, 1, 'quietHours'], [{ backAgoMs: 5000 }, 3, 'back'], [{}, 5, 'free'],
    [{ senses: { fullscreen: true } }, 1, 'fullscreen'], [{ senses: { call: true } }, 1, 'call'],
  ];
  for (const [input, cap, why] of cases) {
    const r = Room.read({ senses: null, ...input });
    assert.equal(r.cap, cap, why); assert.equal(r.why, why);
    const st = I.fresh();
    wanting(st, 'headpat', 1);
    let top = 0;
    for (let i = 0; i < 8; i++) { t += 40e3; const d = I.step(st, inp({ room: r })); if (d[0]?.do === 'act') top = Math.max(top, d[0].rung); }
    assert.ok(top <= cap, `${why}: reached ${top}`);
  }
  assert.ok(Room.read({ lastOutcome: 'ignored', lastTryAgoMs: 60e3 }).a < Room.read({}).a, 'she holds back right after being ignored');
  assert.equal(Room.inQuietHours(2, 0, 6), true); assert.equal(Room.inQuietHours(7, 0, 6), false);
  assert.equal(Room.inQuietHours(23, 22, 7), true); assert.equal(Room.inQuietHours(12, 22, 7), false); assert.equal(Room.inQuietHours(3, 5, 5), false);
});

test('the tracker tells typing from mousing, and when he comes back', () => {
  const tr = Room.tracker();
  let now = t, r;
  for (let i = 0; i < 5; i++) { now += 4000; r = tr.feed({ now, idleSec: 0, cursorAt: now - 100 }); }
  assert.equal(r.typingMs, 0); assert.ok(r.busyShare > 0.9);
  for (let i = 0; i < 5; i++) { now += 4000; r = tr.feed({ now, idleSec: 1, cursorAt: t }); }
  assert.ok(r.typingMs >= 12000, 'keys without the mouse: ' + r.typingMs);
  for (let i = 0; i < 60; i++) { now += 4000; r = tr.feed({ now, idleSec: (i + 1) * 4, cursorAt: t }); }
  assert.equal(Room.read({ ...r, senses: null }).why, 'away');
  now += 4000; r = tr.feed({ now, idleSec: 0, cursorAt: now });
  const back = Room.read({ ...r, senses: null });
  assert.equal(back.why, 'back'); assert.ok(back.justBack); assert.ok(back.awayMs > 3 * 60e3);
});

test('he takes the hint: she lights up, the want is satisfied, and she learns', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 0.9);
  const [d] = I.step(st, inp());
  assert.equal(d.do, 'act');
  const lit = I.happened(st, 'head', inp());
  assert.equal(lit.do, 'lit'); assert.equal(lit.id, 'headpat'); assert.ok(lit.power > 0.5);
  assert.ok(st.wants.headpat.v < 0.2, 'satisfied');
  assert.equal(st.ep, null);
  assert.ok(I.learned(st, 'headpat', t) > 1, 'a little bolder with it next time');
  assert.equal(st.log.at(-1).out, 'yes');
  assert.deepEqual(I.step(st, inp({ now: t + 60e3 })), [], 'and she leaves him be for a while');
  // a headpat she wasn't asking for just satisfies the want
  const st2 = I.fresh();
  wanting(st2, 'headpat', 0.9);
  assert.equal(I.happened(st2, 'head', inp()), null);
  assert.ok(st2.wants.headpat.v < 0.4);
});

test('ignored: by the dice she tries harder (never past the cap) or lets it go, never a penalty', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 0.9);
  const [d] = I.step(st, inp());
  const seen = [d.rung];
  for (let i = 0; i < 4; i++) { t += 40e3; const n = I.step(st, inp()); if (n[0]?.do === 'act') { assert.equal(n[0].how, 'harder'); seen.push(n[0].rung); } }
  assert.ok(seen.length >= 2 && seen.length <= 1 + T.init.climbMax, 'climbs: ' + seen);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1]);
  assert.equal(st.ep, null, 'in the end she lets it go');
  assert.equal(st.log.at(-1).out, 'ignored');
  // dice that say "let it go" right away
  const st2 = I.fresh();
  wanting(st2, 'fetch', 0.9);
  I.step(st2, inp());
  t += 60e3;
  const [g] = I.step(st2, inp({ rand: () => 0.999 }));
  assert.equal(g.do, 'letgo');
  assert.ok(['fine', 'shrug', 'pout', 'own'].includes(g.how));
  assert.ok(st2.wants.fetch.v > 0.5, 'she still wants it; nothing was taken away');
  assert.ok(I.learned(st2, 'fetch', t) <= 1);
});

test('he is touching or talking to her: she waits instead of counting it as ignored', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 0.9);
  I.step(st, inp());
  for (let i = 0; i < 20; i++) { t += 10e3; assert.deepEqual(I.step(st, inp({ engaged: true })), []); }
  assert.ok(st.ep, 'still hoping');
});

test('told no: a mix of everything when she really wanted it, mostly understanding when she didn\'t', () => {
  const hows = new Set();
  for (let i = 0; i < 200; i++) {
    const st = I.fresh();
    wanting(st, 'headpat', 0.95);
    st.wants.fetch = { v: 0.6, at: t };
    st.ep = { id: 'headpat', rung: 5, from: 3, rungAt: t, t0: t, climbs: 1, why: [], pleaded: false };
    const d = I.answer(st, 'headpat', 'no', inp({ rand: Math.random }));
    assert.equal(d.do, 'toldno');
    hows.add(d.how);
    if (d.how === 'please') { assert.ok(st.ep && st.ep.pleaded && d.text, 'the same ask, once more'); const d2 = I.answer(st, 'headpat', 'no', inp({ rand: Math.random })); assert.notEqual(d2.how, 'please', 'only once'); }
    if (d.how === 'offer') { assert.equal(d.offer, 'fetch'); assert.equal(st.ep.id, 'fetch'); assert.equal(st.ep.rung, 5); assert.ok(d.text); }
    if (d.how === 'later') assert.equal(st.promise.id, 'headpat');
    if (d.how === 'sulk') { assert.ok(st.sulkUntil > t && st.sulkUntil <= t + T.init.sulkMinHi * 60e3, 'a sulk is short'); assert.deepEqual(I.step(st, inp({ now: t + 30e3 })), []); assert.deepEqual(I.happened(st, 'hug', inp({ warm: true })), { do: 'melt' }); assert.equal(st.sulkUntil, 0); }
  }
  for (const h of ['fine', 'pout', 'please', 'sulk', 'tsun', 'later', 'offer']) assert.ok(hows.has(h), 'saw ' + h + ' in ' + [...hows]);
  let fine = 0;
  for (let i = 0; i < 200; i++) {
    const st = I.fresh();
    wanting(st, 'headpat', 0.5);
    st.ep = { id: 'headpat', rung: 5, from: 5, rungAt: t, t0: t, climbs: 0, why: [], pleaded: false };
    const d = I.answer(st, 'headpat', 'no', inp({ rand: Math.random }));
    assert.ok(!['sulk', 'please', 'offer'].includes(d.how), 'a weak want never sulks: ' + d.how);
    if (d.how === 'fine') fine++;
  }
  assert.ok(fine > 100, 'mostly understanding: ' + fine);
  // Steady ("As she feels" off): always takes it well
  const st = I.fresh();
  wanting(st, 'headpat', 1);
  st.ep = { id: 'headpat', rung: 5, from: 5, rungAt: t, t0: t, climbs: 0, why: [], pleaded: false };
  assert.equal(I.answer(st, 'headpat', 'no', inp({ rand: Math.random, opts: { asFeels: false } })).how, 'fine');
});

test('"later, promise?": she remembers, and asks again when he is free', () => {
  const st = I.fresh();
  wanting(st, 'fetch', 0.9);
  st.promise = { id: 'fetch', at: t };
  t += 50 * 60e3;
  const [d] = I.step(st, inp());
  assert.equal(d.how, 'promised'); assert.equal(d.rung, 5); assert.ok(d.why.includes('you said "later"'));
  assert.equal(st.promise, null);
  const st2 = I.fresh();
  st2.promise = { id: 'fetch', at: t };
  I.step(st2, inp({ now: t + (T.init.promiseHours + 1) * 3600e3, rand: () => 0.999 }));
  assert.equal(st2.promise, null, 'forgotten after a while');
});

test('she learns what he likes, a little at a time, and old evidence fades', () => {
  const st = I.fresh();
  for (let i = 0; i < 6; i++) { st.ep = { id: 'fetch', rung: 3, from: 3, rungAt: t, t0: t, climbs: 0, why: [] }; I.answer(st, 'fetch', 'yes', inp()); }
  for (let i = 0; i < 6; i++) { st.ep = { id: 'headpat', rung: 5, from: 5, rungAt: t, t0: t, climbs: 0, why: [], pleaded: true }; I.answer(st, 'headpat', 'no', inp({ opts: { asFeels: false } })); }
  const up = I.learned(st, 'fetch', t), down = I.learned(st, 'headpat', t);
  assert.ok(up > 1.1 && up <= 1 + T.init.learnSpan, 'fetch ' + up);
  assert.ok(down < 0.9 && down >= 1 - T.init.learnSpan, 'headpat ' + down);
  const muchLater = t + 90 * 24 * 3600e3;
  assert.ok(Math.abs(I.learned(st, 'fetch', muchLater) - 1) < 0.05 && Math.abs(I.learned(st, 'headpat', muchLater) - 1) < 0.05, 'he might change too');
});

test('the attention budget: she never nags, however much she wants', () => {
  const st = I.fresh();
  let loud = 0, hourLoud = 0, worst = 0, hourStart = t;
  for (let i = 0; i < 16 * 900; i++) {
    t += 4000;
    if (t - hourStart >= 3600e3) { worst = Math.max(worst, hourLoud); hourLoud = 0; hourStart = t; }
    for (const id of I.IDS) st.wants[id] = { v: 1, at: t };
    const d = I.step(st, inp({ rand: Math.random }));
    if (d[0]?.do === 'act' && d[0].rung >= 3 && d[0].how !== 'harder') { loud++; hourLoud++; }
  }
  assert.ok(worst <= 5, 'at most a handful of visits in any hour, got ' + worst);
  assert.ok(st.day.used <= T.init.budget * 1.2, 'the day\'s budget held: ' + st.day.used);
  assert.ok(loud < 60, 'loud things in 16 hours of wanting everything: ' + loud);
});

test('settings: off is off, kinds at Never never happen, "how bold" caps the ladder', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 1);
  assert.deepEqual(I.step(st, inp({ opts: { on: false } })), []);
  assert.deepEqual(I.step(st, inp({ opts: { often: 0 } })), []);
  assert.deepEqual(I.step(st, inp({ opts: { kinds: { closeness: 0 } } })), []);
  let top = 0;
  for (let i = 0; i < 8; i++) { const d = I.step(st, inp({ opts: { bold: 2 } })); if (d[0]?.do === 'act') top = Math.max(top, d[0].rung); t += 40e3; }
  assert.ok(top >= 1 && top <= 2, 'hints and thoughts only: ' + top);
  const st2 = I.fresh();
  wanting(st2, 'fetch', 1);
  assert.deepEqual(I.step(st2, inp({ can: { fetch: false } })), [], 'no ball here (compact mode)');
  const st3 = I.fresh();
  wanting(st3, 'headpat', 1);
  for (let i = 0; i < 10; i++) { const d = I.step(st3, inp({ opts: { talk: false } })); assert.notEqual(d[0]?.rung, 4, 'quiet her: she never speaks up'); t += 40e3; }
});

test('waving both ways', () => {
  // he's just back: she wants to wave
  const st = I.fresh();
  I.step(st, inp({ rand: () => 0.999, room: { a: 0.9, cap: 3, why: 'back', justBack: true, awayMs: 3600e3 } }));
  assert.ok(st.wants.wave.v >= T.init.backWave);
  const [d] = I.step(st, inp({ room: { a: 0.9, cap: 3, why: 'back', justBack: true }, needs: { attention: 0.9 } }));
  assert.equal(d.id, 'wave'); assert.equal(d.rung, 3);
  // he waves back in time: she lights up. he doesn't: a shrug or a small pout, never more
  assert.equal(I.answer(st, 'wave', 'yes', inp()).do, 'lit');
  const st2 = I.fresh();
  wanting(st2, 'wave', 0.9);
  I.step(st2, inp({ needs: { attention: 0.9 } }));
  t += T.init.waveBackMs + 1000;
  const [g] = I.step(st2, inp({ rand: () => 0.999 }));
  assert.equal(g.do, 'letgo'); assert.ok(['fine', 'shrug', 'pout'].includes(g.how), g.how);
  // he waves at her: she answers, by the bond; not every few seconds; spam gets a laugh, then a look
  const st3 = I.fresh();
  const hows = new Set();
  for (let i = 0; i < 100; i++) { const s = I.fresh(); hows.add(I.hisWave(s, inp({ rand: Math.random, stage: 1 })).how); }
  assert.ok(!hows.has('big'), 'a Stranger keeps it small: ' + [...hows]);
  assert.equal(I.hisWave(st3, inp()).do, 'waveback');
  assert.equal(I.hisWave(st3, inp({ now: t + 2000 })), null, 'not again right away');
  let now = t;
  for (let i = 0; i < 2; i++) { now += T.init.hisWaveEveryMs + 100; I.hisWave(st3, inp({ now })); }
  now += T.init.hisWaveEveryMs + 100;
  assert.equal(I.hisWave(st3, inp({ now })).how, 'amused');
  assert.equal(I.hisWave(st3, inp({ busy: true, now: now + 60e3 })), null);
});

test('fetch: "one more!" while she feels like playing, bored after a while', () => {
  const st = I.fresh();
  let more = 0;
  for (let i = 0; i < 12; i++) { t += 20e3; if (I.oneMore(st, inp({ rand: () => 0.3, needs: { play: 0.9 } })) === 'more') more++; else break; }
  assert.ok(more >= 1 && more < 6, 'rounds: ' + more);
});

test('in plain words: the settings line and "Why did she do that?"', () => {
  const st = I.fresh();
  wanting(st, 'headpat', 0.9);
  I.step(st, inp({ day: 'cuddly' }));
  I.happened(st, 'head', inp());
  const line = I.whyLine(st.log.at(-1));
  assert.match(line, /^She .*headpat|^She glanced at your hand/); assert.match(line, /cuddly today/); assert.match(line, /You took her up on it\./);
  assert.doesNotMatch(line, /\d/, 'words, not numbers');
  assert.equal(I.describe(st, { opts: { on: false } }), 'She waits for you to start things.');
  assert.match(I.describe(st, { opts: I.DEFAULT_OPTS, day: 'playful', room: { why: 'typing', cap: 2, at: t }, now: t }), /^Today she's playful and you're typing, so she's mostly waiting for a break\.$/);
  wanting(st, 'fetch', 0.8);
  assert.match(I.describe(st, { opts: I.DEFAULT_OPTS, day: 'easy', room: { why: 'free', cap: 5, at: t }, now: t, stage: 4 }), /thinking about a game of fetch\.$/);
  for (const id of I.IDS) for (const x of [...(I.ACTIONS[id].ask || []), ...(I.ACTIONS[id].please || [])]) assert.doesNotMatch(x, /Jun\b/, 'never her name hard-coded');
});

test('live: the state rides in jun.feel, a headpat she hoped for reaches the page, the switch turns it off', () => {
  Feel.setStage(5);
  I.setWant('headpat', 0.95);
  let got = null;
  for (let i = 0; i < 400 && !got; i++) { t += 4000; const d = I.tick({ idleSec: 0, cursorAt: t - 2000 * (i % 3), stage: 5 }); if (d.length) got = d[0]; I.setWant('headpat', 0.95); }
  assert.ok(got && got.do === 'act', 'she started something');
  Store.flush();
  assert.ok(JSON.parse(mem.get('jun.feel')).init.ep, 'saved with her state (save points pick it up)');
  const events = [];
  const off = Feel.onChange((e) => events.push(e));
  if (got.id === 'headpat') { Feel.touchBegin('rub', 'head'); assert.equal(events.at(-1)?.type, 'init'); assert.equal(events.at(-1).d.do, 'lit'); }
  off();
  assert.ok(Feel.snapshot().init.wants);
  assert.equal(typeof I.describeLive(), 'string');
  // off
  Feel.configure({ isOn: (id) => id !== 'initiative' });
  I.clearCooldowns(); I.setWant('headpat', 1);
  for (let i = 0; i < 100; i++) { t += 4000; assert.deepEqual(I.tick({ idleSec: 0, cursorAt: t, stage: 5 }), []); }
  assert.equal(Feel.forChat().init, undefined);
  assert.ok(!Feel.idleExtras().includes('nothing'));
});

test('her prompt gets words for what she wants; the ids match lib/feel.php', () => {
  Feel.setStage(5);
  I.setWant('fetch', 0.9);
  assert.equal(Feel.forChat().init.want, 'fetch');
  I.setWant('fetch', 0.2);
  assert.equal(Feel.forChat().init, undefined);
  const php = fs.readFileSync(new URL('../../../webapp/api/lib/feel.php', import.meta.url), 'utf8');
  const names = php.match(/const FEEL_INIT_NAMES = \[(.*?)\];/s)[1];
  assert.deepEqual([...names.matchAll(/'(\w+)' =>/g)].map(m => m[1]).sort(), [...I.IDS].sort());
  for (const id of I.IDS) assert.ok(names.includes(`'${I.ACTIONS[id].name}'`), id + ' has the same words');
});

test('the time-lapse: a day in a moment, the same for the same seed, and the defaults do not nag', () => {
  const a = I.simulate({ seed: 5, him: 'workday', stage: 4 }), b = I.simulate({ seed: 5, him: 'workday', stage: 4 });
  assert.deepEqual(a.counts, b.counts);
  assert.ok(a.events.length > 5 && a.events[0].t && a.events[0].text);
  for (const him of Object.keys(I.HIM)) for (const stage of [1, 3, 4, 6]) {
    let flags = 0, starts = 0;
    for (let seed = 1; seed <= 6; seed++) { const r = I.simulate({ seed, him, stage }); flags += r.flags.filter(f => /nagging/.test(f)).length; starts += r.counts.starts; for (const h of r.perHour) assert.ok(h.loud <= 5, `${him} ${stage}: ${h.loud} visits in an hour`); }
    assert.equal(flags, 0, `${him} at stage ${stage} nags`);
    assert.ok(starts > 6, `${him} at stage ${stage}: she does things (${starts})`);
  }
  const off = I.simulate({ seed: 1, opts: { on: false } });
  assert.equal(off.counts.starts, 0);
  const lots = I.simulate({ seed: 2, him: 'free', opts: { often: 100 } }), few = I.simulate({ seed: 2, him: 'free', opts: { often: 15 } });
  assert.ok(lots.counts.starts > few.counts.starts, `${lots.counts.starts} vs ${few.counts.starts}`);
});

test('his wave: side to side or a circle, at any size of her; a headpat rub or a straight pass is not a wave', async () => {
  const { waveGesture } = await import('../../../webapp/js/core/feel/gesture.js');
  const side = (unit, amp, n = 16) => Array.from({ length: n }, (_, i) => ({ x: 500 + amp * unit * Math.sin(i / (n - 1) * Math.PI * 4.5), y: 300 + (i % 2), t: i * 90 }));
  const circle = (unit, r, turns = 1.1, n = 16) => Array.from({ length: n }, (_, i) => ({ x: 500 + r * unit * Math.cos(i / (n - 1) * 2 * Math.PI * turns), y: 300 + r * unit * Math.sin(i / (n - 1) * 2 * Math.PI * turns), t: i * 90 }));
  for (const unit of [200, 440, 900]) {
    assert.equal(waveGesture(side(unit, 0.08), { unit }), 'side', 'side to side at ' + unit);
    assert.equal(waveGesture(circle(unit, 0.07), { unit }), 'circle', 'a circle at ' + unit);
    assert.equal(waveGesture(side(unit, 0.012), { unit }), null, 'a tiny jitter is not a wave');
  }
  assert.equal(waveGesture(side(440, 0.08), { unit: 440, style: 'circle' }), null, 'only the gesture he picked');
  assert.equal(waveGesture(circle(440, 0.07), { unit: 440, style: 'side' }), null);
  const line = Array.from({ length: 16 }, (_, i) => ({ x: 300 + i * 30, y: 300, t: i * 90 }));
  assert.equal(waveGesture(line, { unit: 440 }), null, 'moving past her is not a wave');
  assert.equal(waveGesture(circle(440, 0.07, 0.5), { unit: 440 }), null, 'half a circle is not one');
  assert.equal(waveGesture(side(440, 0.05), { unit: 440, size: 100 }), null, '"big waves only" needs a big one');
  assert.equal(waveGesture(side(440, 0.05), { unit: 440, size: 20 }), 'side', '"small waves count"');
  const old = side(440, 0.08).map(p => ({ ...p, t: p.t - 5000 }));
  assert.equal(waveGesture([...old, { x: 500, y: 300, t: 1400 }], { unit: 440 }), null, 'an old trail has faded');
});
