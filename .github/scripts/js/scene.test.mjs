// the scene engine + the scene maker's rules (#22): webapp/js/core/scene/ (scene-engine.js, scene-mine.js), the slots
// it stands on (js/core/delve/scenes.js), the story engine's `scene` nodes, and the stand-in library data/scenes.json.
// The shipped scenes are stand-ins; these rules are not.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const J = (f) => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const Sc = await import(new URL('js/core/scene/scene-engine.js', root));
const Mine = await import(new URL('js/core/scene/scene-mine.js', root));
const Scenes = await import(new URL('js/core/delve/scenes.js', root));
const En = await import(new URL('js/core/story/story-engine.js', root));
const Gate = await import(new URL('js/core/gate.js', root));
const { tune } = await import(new URL('js/core/scene/scene-tune.js', root));

const lib = J('data/scenes.json');
const story = Sc.attach(J('data/story.json'), lib, 'story');
const clone = (v) => JSON.parse(JSON.stringify(v));
// the gate as the game reads it ("she'd ask first" counts as yes), at a bond, with the player's switches
const ask = (stage, comfort = {}, o = {}) => (item) => {
  const r = Gate.check(item, { comfort: { ...Gate.DEFAULTS, ...comfort }, mode: 'windowed', stage, ...o });
  return { ok: r.show && (r.her === 'yes' || r.her === 'ask'), why: r.words };
};
const ctxAt = (stage, comfort, store) => ({ ask: ask(stage, comfort), mem: Sc.memory(store) });
const types = (evs) => evs.map(e => e.type);
const tea = lib.scenes.evening_tea, close = lib.scenes.evening_close, pot = lib.scenes.kitchen_flour;
// never any luck: she never asks, never moves things on by herself (so a test says exactly what happens)
const calm = tune({ her: { wish: 0, advance: 0 } });

test('the shipped scene library keeps every rule; nothing 18+ and nothing "agreed beforehand" ships', () => {
  assert.deepEqual(Sc.checkLibrary(lib, { shipped: true, npcs: story.npcs }), []);
  assert.deepEqual(Scenes.checkSlots({ scenes: lib.slots }), []);
  const raw = read('data/scenes.json');
  assert.equal(/"tier":\s*"adult"/.test(raw), false);
  assert.equal(/"consent"|"agreement"/.test(raw), false);
  for (const sl of Object.values(lib.slots)) assert.deepEqual(sl.variants.adult || [], []);
  assert.ok(Object.keys(lib.scenes).length >= 3 && lib.sample === true);
  // the ordinary things and the way out exist, and are for everyone
  for (const id of ['talk', 'hand', 'stay']) assert.ok(lib.ordinary[id]);
  assert.ok(lib.leave.name);
});

test('the rulebook catches mistakes, in plain words', () => {
  const bad = (fn, re, o = { shipped: true, npcs: story.npcs }) => { const s = clone(tea); fn(s); const e = Sc.checkScene(s, lib, o); assert.ok(e.some(k => re.test(k)), `${re}: ${e.join(' | ')}`); };
  bad(s => { s.tier = 'adult'; }, /18\+ entries are the owner's/);
  bad(s => { s.actions.lean.consent = 'beforehand'; s.actions.lean.agreement = 'x'; }, /agreed beforehand/);
  bad(s => { s.minStage = 3; }, /Everyday scene can't ask for a bond/);
  bad(s => { s.phases.table.next[0].to = 'roof'; }, /unknown phase/);
  bad(s => { s.start = 'nowhere'; }, /first phase/);
  bad(s => { s.phases.table.actions.push('juggle'); }, /unknown thing to do/);
  bad(s => { s.phases.attic = { name: 'The attic' }; }, /nothing leads here/);
  bad(s => { s.actions.blanket.layer = { blanket: 'on_fire' }; }, /no state/);
  bad(s => { s.ordinary = []; }, /ordinary thing has to stay/);
  bad(s => { s.endings.asleep.kind = 'explosion'; }, /ends back in the story/);
  bad(s => { s.name = ''; }, /needs a name/);
  bad(s => { s.id = 'Bad Id'; }, /its id/);
  // a rated phase the moment can walk into by itself needs a fade, so nobody ever hits a gap
  bad(s => { s.phases.quiet.tier = 'flirty'; }, /give "Winding down" a fade/, { npcs: story.npcs });
  bad(s => { s.phases.table.minStage = 4; }, /start somewhere everyone/, { npcs: story.npcs });
  // someone the gate must never rate can only ever be in Everyday scenes: in code, whatever a file says
  const kid = { ...story.npcs, bolt: { name: 'Bolt', rated: false } };
  bad(s => { s.who = 'bolt'; s.actions.lean.tier = 'flirty'; }, /only ever be in Everyday/, { npcs: kid });
  bad(s => { s.who = 'nobody'; }, /unknown person/);
  // the owner's own may be 18+ (the gate decides if it shows); the same scene is fine unshipped
  const mine = clone(tea); mine.tier = 'adult';
  assert.deepEqual(Sc.checkScene(mine, lib, { npcs: story.npcs }), []);
});

test('a scene opens from something ordinary, and the wheel always has the ordinary things and a way out', () => {
  const c = ctxAt(1);
  const { run, events } = Sc.start(tea, lib, c, { seed: 1, tune: calm });
  assert.equal(events[0].type, 'open');
  assert.ok(events.some(e => e.type === 'beat' && e.who === 'narrator'));
  assert.equal(run.phase, 'table');
  for (const phase of Object.keys(tea.phases)) {
    run.phase = phase;
    const op = Sc.options(tea, lib, run, c, calm);
    for (const id of Object.keys(lib.ordinary)) assert.ok(op.actions.find(a => a.id === id && a.ok && a.ordinary), `${phase}: ${id}`);
    assert.ok(op.endings.find(e => e.id === 'leave' && e.ok));
  }
  // a scene may say which ordinary things fit, never none
  assert.deepEqual(Sc.ordinaryOf(pot, lib), ['talk', 'stay']);
  assert.deepEqual(Sc.ordinaryOf({ ordinary: ['nonsense'] }, lib), Object.keys(lib.ordinary));
  // leaving is always possible and nothing is taken for it
  const out = Sc.act(tea, lib, run, { end: 'leave' }, c, calm);
  assert.equal(out.at(-1).type, 'end');
  assert.equal(run.over, 'leave');
  assert.deepEqual(Sc.act(tea, lib, run, { action: 'talk' }, c, calm), [{ type: 'over' }]);
});

test('what you do moves how she feels; the same thing again right away moves her less (never stale)', () => {
  const c = ctxAt(1), t = calm;
  const { run } = Sc.start(tea, lib, c, { tune: t });
  const before = run.meter;
  Sc.act(tea, lib, run, { action: 'ask_day' }, c, t);
  const first = run.meter - before;
  assert.equal(first, tea.actions.ask_day.warm);
  Sc.act(tea, lib, run, { action: 'ask_day' }, c, t);
  const second = run.meter - before - first;
  assert.ok(second < first && second >= t.meter.min);
  // her band is a word, and a change of band is told
  const evs = [];
  for (let i = 0; i < 12 && Sc.bandOf(run.meter, t) === 'low'; i++) evs.push(...Sc.act(tea, lib, run, { action: i % 2 ? 'talk' : 'hand' }, c, t));
  const m = evs.find(e => e.type === 'meter');
  assert.ok(m && m.band === 'mid' && m.word === lib.meterWords.mid && m.name === 'Cozy');
  // "once" things leave the wheel once done; something that isn't on the wheel can't be done
  Sc.act(tea, lib, run, { action: 'good_tea' }, c, t);
  assert.equal(Sc.options(tea, lib, run, c, t).actions.some(a => a.id === 'good_tea'), false);
  assert.equal(Sc.act(tea, lib, run, { action: 'good_tea' }, c, t)[0].type, 'error');
  assert.equal(Sc.act(tea, lib, run, { phase: 'quiet' }, c, t)[0].type, 'error');
});

test('everything rated asks the gate: what is off or too soon simply isn\'t there', () => {
  const t = calm;
  const offered = (scene, stage, comfort, phase) => { const c = ctxAt(stage, comfort); const { run } = Sc.start(scene, lib, c, { tune: t }); if (phase) { run.phase = phase; run.meter = 100; } return Sc.options(scene, lib, run, c, t); };
  // inside an Everyday scene: an Everyday thing that needs a bond, and a Flirty thing
  assert.equal(offered(tea, 2, {}, 'couch').actions.find(a => a.id === 'lean').ok, false);
  assert.equal(offered(tea, 3, {}, 'couch').actions.find(a => a.id === 'lean').ok, true);
  assert.equal(offered(pot, 5, {}, 'inspect').actions.find(a => a.id === 'cheek_kiss').ok, true);
  assert.equal(offered(pot, 5, { flirty: false }, 'inspect').actions.find(a => a.id === 'cheek_kiss').ok, false);
  // a phase you pick: only offered when she's fine with it
  assert.equal(offered(close, 4, {}, 'lap').phases.find(p => p.id === 'kiss').ok, false);
  assert.equal(offered(close, 5, {}, 'lap').phases.find(p => p.id === 'kiss').ok, true);
  // an outfit with a rating
  assert.equal(offered(close, 5, {}).outfits.find(o => o.id === 'shirt').ok, true);
  assert.equal(offered(close, 5, { flirty: false }).outfits.find(o => o.id === 'shirt').ok, false);
  // best friends: never Flirty, whatever the bond (the gate's hard lock reaches into scenes)
  assert.equal(offered(pot, 6, { flavor: 'platonic' }, 'inspect').actions.find(a => a.id === 'cheek_kiss').ok, false);
  // no gate to ask = nothing rated, ever; plain Everyday things need no gate
  const none = { mem: Sc.memory() };
  const { run } = Sc.start(pot, lib, none, { tune: t });
  run.phase = 'inspect';
  const op = Sc.options(pot, lib, run, none, t);
  assert.equal(op.actions.find(a => a.id === 'cheek_kiss').ok, false);
  assert.equal(op.actions.find(a => a.id === 'talk').ok, true);
  // someone the gate must never rate: even a gate that says yes to everything can't
  const yes = { ask: () => ({ ok: true }), npcs: { bolt: { name: 'Bolt', rated: false }, al: { name: 'Al' } } };
  assert.equal(Sc.ask({ tier: 'flirty' }, { who: 'bolt' }, yes).ok, false);
  assert.equal(Sc.ask({ tier: 'flirty' }, { who: 'stranger' }, yes).ok, false);
  assert.equal(Sc.ask({ tier: 'flirty' }, { who: 'al' }, yes).ok, true);
  assert.equal(Sc.ask({ tier: 'everyday' }, { who: 'bolt' }, yes).ok, true);
});

test('a rated phase the moment walks into by itself: with it off, one line of narration stands in', () => {
  const t = calm;
  const walk = (stage, comfort) => {
    const c = ctxAt(stage, comfort);
    const { run } = Sc.start(pot, lib, c, { tune: t });
    Sc.act(pot, lib, run, { phase: 'stir' }, c, t);
    const all = [];
    for (let i = 0; i < 40 && run.phase === 'stir'; i++) all.push(...Sc.act(pot, lib, run, { action: i % 2 ? 'stir_with' : 'steal_taste' }, c, t));
    return { run, all };
  };
  const on = walk(5);
  assert.equal(on.run.phase, 'inspect');
  assert.equal(on.all.some(e => e.type === 'fade'), false);
  for (const [stage, comfort] of [[2, {}], [5, { flirty: false }]]) {
    const off = walk(stage, comfort);
    assert.equal(off.run.phase, 'taste');
    const f = off.all.find(e => e.type === 'fade');
    assert.ok(f && f.t === pot.phases.inspect.fade.t && f.why);
  }
});

test('it remembers: firsts, growth between scenes, marks that stay a day, an album; a replay changes nothing', () => {
  const t = calm, store = { seen: {}, flags: {} };
  const c = ctxAt(4, {}, store);
  const texts = (evs) => evs.filter(e => e.type === 'beat').map(e => e.t);
  const a = Sc.start(tea, lib, c, { tune: t });
  assert.ok(a.run.first && texts(a.events).includes(tea.opening[1].t) && !texts(a.events).includes(tea.opening[2].t));
  // an action's first time ever has its own words, once
  const f1 = Sc.act(tea, lib, a.run, { action: 'ask_day' }, c, t);
  assert.ok(types(f1).includes('first') && texts(f1).includes(tea.actions.ask_day.first[0].t));
  const f2 = Sc.act(tea, lib, a.run, { action: 'ask_day' }, c, t);
  assert.equal(types(f2).includes('first'), false);
  assert.ok(tea.actions.ask_day.say.some(b => texts(f2).includes(b.t)));
  // album parts are kept as you reach them
  assert.equal(store.flags['album.evening_tea.tea'], true);
  Sc.act(tea, lib, a.run, { phase: 'couch' }, c, t);
  const end = Sc.act(tea, lib, a.run, { end: 'goodnight' }, c, t).at(-1);
  assert.deepEqual([end.type, end.id, end.first, end.kind], ['end', 'goodnight', true, 'story']);
  assert.equal(store.seen['scene.evening_tea'], 1);
  assert.equal(store.flags['scene.evening_tea.end'], 'goodnight');
  const al = Sc.album(lib.scenes, c.mem);
  assert.deepEqual(al.map(x => x.id), ['evening_tea']);
  assert.deepEqual(al[0].parts.map(p => p.have), [true, true, false, false]);
  // the second time: the other opening line, and the first-time words don't come back
  const b = Sc.start(tea, lib, c, { tune: t });
  assert.ok(!b.run.first && texts(b.events).includes(tea.opening[2].t) && !texts(b.events).includes(tea.opening[1].t));
  assert.equal(types(Sc.act(tea, lib, b.run, { action: 'ask_day' }, c, t)).includes('first'), false);
  // a callback to how it ended last time
  store.flags['scene.evening_tea.end'] = 'asleep';
  assert.ok(texts(Sc.start(tea, lib, c, { tune: t }).events).includes(tea.opening[3].t));

  // a mark: flour today is still there tomorrow (and she says so), gone the day after
  const k = Sc.start(pot, lib, c, { tune: t });
  const fl = Sc.act(pot, lib, k.run, { action: 'flour_flick' }, c, t);
  assert.ok(fl.some(e => e.type === 'layer' && e.id === 'flour' && e.state === 'on'));
  assert.equal(store.flags['mark.flour'], 1);
  const next = { ...c, mem: Sc.memory(store, 2) };
  const k2 = Sc.start(pot, lib, next, { tune: t });
  assert.equal(k2.run.layers.flour, 'on');
  assert.ok(k2.events.some(e => e.type === 'layer' && e.still) && texts(k2.events).includes(lib.layers.flour.still.t));
  // … and wiping it off cleans the memory of it too
  Sc.act(pot, lib, k2.run, { phase: 'stir' }, next, t);
  assert.ok(Sc.options(pot, lib, k2.run, next, t).actions.find(x => x.id === 'wipe'));
  Sc.act(pot, lib, k2.run, { action: 'wipe' }, next, t);
  assert.equal(store.flags['mark.flour'], undefined);
  store.flags['mark.flour'] = 1;
  const later = { ...c, mem: Sc.memory(store, 5) };
  assert.equal(Sc.start(pot, lib, later, { tune: t }).run.layers.flour, 'off');
  assert.equal(store.flags['mark.flour'], undefined);

  // playing one again from the album: read-only memory, nothing changes
  const before = JSON.stringify(store);
  const ro = { ...c, mem: Sc.memory(store, 2, { readOnly: true }) };
  const r = Sc.start(tea, lib, ro, { tune: t });
  Sc.act(tea, lib, r.run, { action: 'headpat' }, ro, t); Sc.act(tea, lib, r.run, { phase: 'couch' }, ro, t); Sc.act(tea, lib, r.run, { end: 'leave' }, ro, t);
  assert.equal(JSON.stringify(store), before);
});

test('her say: she asks for things, moves the moment on herself, and (desktop Jun\'s door) can say stop', () => {
  // a wish is only ever for something on the wheel that's fine; doing it moves her more; ignoring it costs nothing
  const eager = tune({ her: { wish: 1, advance: 0 } }), c = ctxAt(4);
  const { run } = Sc.start(tea, lib, c, { tune: eager });
  const evs = Sc.act(tea, lib, run, { action: 'talk' }, c, eager);
  const w = evs.find(e => e.type === 'wish');
  assert.ok(w && run.wish.action === w.action && w.action !== 'talk');
  assert.ok(Sc.options(tea, lib, run, c, eager).actions.find(a => a.id === w.action && a.ok && a.wish));
  const base = Sc.actionsOf(tea, lib)[w.action].warm, at = run.meter;
  const met = Sc.act(tea, lib, run, { action: w.action }, c, eager);
  assert.ok(types(met).includes('wish_met'));
  assert.equal(run.meter - at, base + eager.meter.wishBonus);
  // not picked up: quietly dropped, the meter never goes down for it
  const quiet = tune({ her: { wish: 0, advance: 0 } });
  run.wish = { action: 'hand', age: 0 };
  let low = run.meter;
  for (let i = 0; i < quiet.her.wishKeep + 1; i++) { Sc.act(tea, lib, run, { action: 'talk' }, c, quiet); assert.ok(run.meter >= low); low = run.meter; }
  assert.equal(run.wish, null);
  // by her say: once it's ready she moves it on herself
  const sure = tune({ her: { wish: 0, advance: 1 } });
  const k = Sc.start(tea, lib, c, { tune: sure });
  let moved = null;
  for (let i = 0; i < 12 && !moved; i++) moved = Sc.act(tea, lib, k.run, { action: i % 2 ? 'talk' : 'hand' }, c, sure).find(e => e.type === 'phase' && e.by === 'her');
  assert.ok(moved && moved.id === 'couch' && k.run.meter >= 45);
  // desktop Jun's stop signal ends any scene at once, kindly; the scene still counts as played, nothing is lost
  const d = { ...ctxAt(5), stop: true };
  const s = Sc.start(close, lib, { ...d, stop: false }, { tune: calm });
  const out = Sc.act(close, lib, s.run, { action: 'hair' }, d, calm);
  assert.deepEqual([out.at(-1).type, out.at(-1).id, out.at(-1).stopped], ['end', 'leave', true]);
});

test('every shipped scene ends for everyone: any bond, Flirty on or off, and at Devoted everything is reached', () => {
  for (const scene of Object.values(lib.scenes)) for (const stage of [1, 3, 4, 6]) for (const flirty of [true, false]) {
    const m = Sc.many(scene, lib, { ask: ask(stage, { flirty }) }, 60, { seed: stage * 10 });
    assert.deepEqual(m.errors, [], `${scene.id} at ${stage}`);
    assert.equal(Object.values(m.ends).reduce((a, b) => a + b, 0), 60);
    if (stage === 6 && flirty) assert.deepEqual(m.never, { phases: [], endings: [] }, scene.id);
    if (!flirty) for (const [id, a] of Object.entries(scene.actions)) if (a.tier === 'flirty') assert.equal(m.actions[id] || 0, 0, `${scene.id}/${id}`);
  }
  // seeded: the same seed, the same play
  const one = (seed) => JSON.stringify(Sc.playOnce(tea, lib, ctxAt(4), { seed }).stats);
  assert.equal(one(7), one(7));
  assert.notEqual(one(7), one(8));
});

test('the slots pick full scenes like any variant, and the owner\'s own scenes arrive through the same door', () => {
  const data = { scenes: lib.slots };
  const pick = (stage, comfort, slot = 'evening_together') => Scenes.pick(data, slot, { where: 'home', allow: ask(stage, comfort), rnd: () => 0 });
  assert.equal(pick(2).variant.id, 'evening_tea');
  assert.equal(pick(4).variant.id, 'evening_close');
  assert.equal(pick(6, { flirty: false }).variant.id, 'evening_tea');
  assert.ok(Scenes.isFull(pick(2).variant) && !Scenes.isFull(lib.slots.camp_night.variants.everyday[0]));
  assert.equal(Sc.resolve(pick(4).variant, lib).id, 'evening_close');
  assert.equal(Sc.resolve({ id: 'x', scene: 'gone' }, lib), null);
  // a few lines → a scene with nothing to do but read
  const simple = Sc.resolve(lib.slots.camp_night.variants.everyday[0], lib);
  const s = Sc.start(simple, lib, ctxAt(1));
  assert.equal(s.run.over, 'done');
  assert.equal(s.events.filter(e => e.type === 'beat').length, 2);
  // a full scene as plain lines, for anything that can only show lines
  assert.ok(Sc.flat(tea, lib).length >= 1 && Sc.flat(tea, lib).every(b => b.t && !b.when));
  // shared slots are laid under a system's own, only where they're meant for
  assert.ok(Sc.attach({ scenes: {} }, lib, 'delve').scenes.camp_night && !Sc.attach({ scenes: {} }, lib, 'delve').scenes.evening_together);
  assert.equal(Sc.attach({ scenes: { camp_night: 'mine' } }, lib).scenes.camp_night, 'mine');

  // the owner's: an 18+ entry (a made-up one: the words are irrelevant here) and an Everyday few-lines one
  const adult = { ...clone(tea), id: 'my_night', name: 'Mine', tier: 'adult', minStage: 4 };
  const lines = { id: 'my_boots', name: 'Boots', tier: 'everyday', simple: true, opening: [{ face: 'pout', t: 'Boots off.' }], phases: {}, actions: {}, endings: {} };
  const { mine, dropped } = Mine.clean({ on: true, list: [{ on: true, slot: 'evening_together', scene: adult }, { on: true, slot: 'camp_night', scene: lines }, { slot: 'x', scene: { id: 'broken' } }, { scene: clone(adult) }] }, lib);
  assert.equal(mine.list.length, 2);
  assert.equal(dropped.length, 2);
  try {
    Scenes.setCustom((slot, tier) => Mine.variantsFor(mine, slot, tier));
    // 18+ off (the default): his scene is passed over, with the reason
    const off = pick(6);
    assert.equal(off.variant.id, 'evening_close');
    assert.ok(off.tried.some(k => k.id === 'my_night' && /18\+ is off/.test(k.why)));
    // on and confirmed, in her window, close enough: it plays, as a full scene
    const on = pick(6, { adult: true, adultConfirmed: true });
    assert.deepEqual([on.tier, on.variant.id, Scenes.isFull(on.variant)], ['adult', 'my_night', true]);
    assert.equal(pick(2, { adult: true, adultConfirmed: true }).variant.id, 'evening_tea');           // not close enough: Everyday
    assert.equal(pick(6, { adult: true, adultConfirmed: false }).variant.id, 'evening_close');        // not confirmed
    assert.equal(pick(6, { adult: true, adultConfirmed: true, flavor: 'platonic' }).variant.id, 'evening_tea');
    assert.equal(Scenes.find(data, 'evening_together', 'my_night').tier, 'adult');
    // his few lines join the Everyday pool as plain beats
    assert.ok(Mine.variantsFor(mine, 'camp_night', 'everyday')[0].beats[0].t === 'Boots off.');
    // one switch for all of them, and one each
    assert.deepEqual(Mine.variantsFor({ ...mine, on: false }, 'evening_together', 'adult'), []);
    mine.list[0].on = false;
    assert.equal(pick(6, { adult: true, adultConfirmed: true }).variant.id, 'evening_close');
  } finally { Scenes.setCustom(null); }
  assert.equal(Scenes.find(data, 'evening_together', 'my_night'), null);
});

test('someone else\'s scenes (in a Jun profile) are checked, added to yours, never replace one, and arrive switched on', () => {
  const flirty = { ...clone(pot), id: 'kitchen_two', name: 'Kitchen two' };
  const plain = { ...clone(tea), id: 'tea_two', name: 'Tea two' };
  delete plain.actions.lean.minStage;
  const have = Mine.clean({ list: [{ on: false, slot: null, scene: { ...clone(plain), id: 'tea_two', name: 'Mine, off' } }] }, lib).mine;
  const list = [{ slot: 'cooking_together', scene: flirty }, { slot: null, scene: plain },
    { slot: null, scene: { id: 'evening_tea', name: 'A clash with ours', tier: 'everyday', simple: true, opening: [{ t: 'Hi.' }], phases: {}, actions: {}, endings: {} } },
    { scene: { id: 'bad', name: 'Bad', tier: 'everyday', start: 'nope', phases: {}, actions: {}, endings: {}, opening: [] } }, 'junk', null];
  const r = Mine.merge(have, list, lib);
  assert.equal(r.added, 3);
  assert.equal(r.rated, 1);
  assert.deepEqual(r.dropped.map(d => d.name), ['Bad', 'A scene', 'A scene']);
  const byName = Object.fromEntries(r.mine.list.map(en => [en.scene.name, en]));
  // yours stays exactly as it was (even switched off); theirs all arrive ON, the rated one too (owner, Nov 16)
  assert.equal(byName['Mine, off'].on, false);
  assert.equal(byName['Mine, off'].scene.id, 'tea_two');
  assert.equal(byName['Kitchen two'].on, true);
  assert.equal(byName['Tea two'].on, true);
  assert.notEqual(byName['Tea two'].scene.id, 'tea_two');
  assert.notEqual(byName['A clash with ours'].scene.id, 'evening_tea');
  assert.equal(byName['Kitchen two'].slot, 'cooking_together');
  // the same file twice: added again under new ids, never replacing
  const again = Mine.merge(r.mine, list, lib);
  assert.equal(again.mine.list.length, r.mine.list.length + 3);
  assert.equal(new Set(again.mine.list.map(en => en.scene.id)).size, again.mine.list.length);
  // full: the rest is left out by name
  const full = { on: true, list: Array.from({ length: Mine.MAX }, (_, k) => ({ slot: null, scene: { id: 's' + k, name: 'S' + k, tier: 'everyday', simple: true, opening: [{ t: 'Hi.' }], phases: {}, actions: {}, endings: {} } })) };
  const over = Mine.merge(full, [{ slot: null, scene: plain }], lib);
  assert.equal(over.added, 0);
  assert.match(over.dropped[0].why, /room/);
  assert.equal(Mine.slug('Rain on the Roof!', []), 'rain_on_the_roof');
  assert.equal(Mine.slug('Rain on the Roof!', ['rain_on_the_roof']), 'rain_on_the_roof_2');
  assert.match(Mine.slug('A very long name for a scene indeed', ['a_very_long_name_f']), Sc.ID_RE);
  assert.equal(Mine.slug('   ', []), 'scene');
  assert.match(Mine.slug('123 go', []), Sc.ID_RE);
});

test('"Your scenes" is a Jun profile piece: carried, shape-checked, and ADDED on apply; 18+ switch never from a file', async () => {
  const P = await import(new URL('js/core/profile.js', root));
  P.use(J('data/profile-parts.json'));
  assert.deepEqual([P.defaultIn('scenes', 'profile'), P.defaultIn('scenes', 'gamesave'), P.defaultIn('scenes', 'savepoint')], ['on', 'never', 'always']);
  assert.ok(P.part('scenes').why.gamesave);
  let mine = Mine.clean({ list: [{ slot: 'evening_together', scene: { ...clone(tea), id: 'my_tea', name: 'My tea' } }] }, lib).mine;
  const io = {
    local: { get: () => null, set: () => {}, keys: () => [] },
    scenes: { get: async () => mine, add: async (list) => { const r = Mine.merge(mine, list, lib); mine = r.mine; return r; } },
  };
  const m = await P.collect(io, { pick: ['scenes'] });
  assert.equal(m.parts.scenes.scenes.list[0].scene.id, 'my_tea');
  // a file with odd bits: only the shape is kept here; the scene rulebook runs in add()
  const fromFile = P.clean({ ...m, parts: { scenes: { scenes: { list: [...m.parts.scenes.scenes.list, 'junk', { scene: [] }, { slot: 5, scene: { id: 'x' } }] } }, comfort: { comfort: { adult: true, adultConfirmed: true, flirty: true } } } });
  assert.equal(fromFile.manifest.parts.scenes.scenes.list.length, 2);
  assert.equal(fromFile.manifest.parts.scenes.scenes.list[1].slot, null);
  assert.deepEqual(fromFile.manifest.parts.comfort.comfort, { flirty: true });   // a file never switches 18+ on
  assert.ok(P.defaultPick(fromFile.manifest).includes('scenes'));
  assert.match(P.summary(fromFile.manifest).find(x => x.id === 'scenes').words, /2 scenes, added to yours/);
  const res = await P.apply(fromFile.manifest, ['scenes'], io);
  assert.deepEqual(res.applied, ['scenes']);
  assert.match(res.notes[0], /^1 scene added; left out: x/);
  assert.deepEqual(mine.list.map(en => en.scene.name), ['My tea', 'My tea']);
  assert.notEqual(mine.list[0].scene.id, mine.list[1].scene.id);
  // without the scene maker's door, it's skipped (never half-applied)
  const res2 = await P.apply(fromFile.manifest, ['scenes'], { local: io.local });
  assert.deepEqual(res2.skipped.map(k => k.id), ['scenes']);
});

test('the story engine: an event with a full scene waits for it, goes on with how it ended, and story state remembers it', () => {
  const gate = { gateCheck: Gate.check, gate: { comfort: Gate.DEFAULTS, mode: 'windowed' } };
  const begin = (stage) => { const g = En.newGame(story, 3); g.x.at = 'home'; const ctx = { ...gate, stage }; return { g, ctx, evs: En.begin(story, g, 'evening_together', ctx) }; };
  const a = begin(2);
  const se = a.evs.find(e => e.type === 'scene');
  assert.deepEqual([se.slot, se.tier, se.id, se.play.id], ['evening_together', 'everyday', 'evening_tea', 'evening_tea']);
  assert.ok(se.beats.length >= 1);
  assert.equal(a.g.x.play.wait, 'scene');
  assert.equal(En.step(story, a.g, {}, a.ctx)[0].type, 'error');            // it waits for the scene's ending, nothing else
  // the page plays it on the story's own memory …
  const sctx = En.sceneCtx(story, a.g, a.ctx);
  const s = Sc.start(se.play, story.lib, sctx, { tune: calm });
  Sc.act(se.play, story.lib, s.run, { action: 'ask_day' }, sctx, calm);
  Sc.act(se.play, story.lib, s.run, { end: 'goodnight' }, sctx, calm);
  // … so story state (what game saves keep) has it
  assert.equal(En.Story.seenCount(a.g.s, 'scene.evening_tea'), 1);
  assert.equal(En.Story.flag(a.g.s, 'album.evening_tea.tea'), true);
  assert.equal(En.Story.flag(a.g.s, 'scene.evening_tea.end'), 'goodnight');
  assert.deepEqual(En.Story.clean(clone(a.g.s)).flags, a.g.s.flags);          // and it survives a save's cleaning
  // goodnight → the "after" node; then the event ends
  const day = a.g.x.day;
  const after = En.step(story, a.g, { scene: { end: 'goodnight' } }, a.ctx);
  assert.ok(after.some(e => e.type === 'scened' && e.end === 'goodnight') && after.some(e => e.type === 'beat' && e.who === 'jun'));
  for (let i = 0; i < 5 && a.g.x.play; i++) En.step(story, a.g, {}, a.ctx);
  assert.equal(a.g.x.play, null);
  assert.equal(a.g.x.day, day);
  // "the morning after": the ending's own branch moves the story clock to the next morning
  const b = begin(2);
  En.step(story, b.g, { scene: { end: 'asleep' } }, b.ctx);
  for (let i = 0; i < 5 && b.g.x.play; i++) En.step(story, b.g, {}, b.ctx);
  assert.deepEqual([b.g.x.day, b.g.x.slot], [2, 0]);
  // at Close the slot gives the Flirty scene; with Flirty off, the Everyday one
  assert.equal(begin(4).evs.find(e => e.type === 'scene').id, 'evening_close');
  const off = En.newGame(story, 3); off.x.at = 'home';
  assert.equal(En.begin(story, off, 'evening_together', { gateCheck: Gate.check, gate: { comfort: { ...Gate.DEFAULTS, flirty: false } }, stage: 6 }).find(e => e.type === 'scene').id, 'evening_tea');
  // a window closed mid-scene: the same scene again, from its start
  const c = begin(4);
  const again = En.pending(story, c.g, c.ctx);
  assert.deepEqual([again[0].type, again[1].type, again[1].id, !!again[1].play], ['resumed', 'scene', 'evening_close', true]);
  // … and if that scene is gone meanwhile (one of the owner's, switched off), the event simply goes on
  const d = begin(2);
  d.g.x.play.scene.id = 'something_of_his';
  const moved = En.pending(story, d.g, d.ctx);
  assert.ok(moved.some(e => e.type === 'scene'));
  assert.equal(d.g.x.play.wait, 'scene');   // the slot still has a full scene to give: that one plays
  // "Skip scene" (coming back to a half-played one): the event goes on its own way, never taking an ending's branch,
  // and nothing about the scene is remembered
  const sk = begin(2);
  const skipped = En.step(story, sk.g, { scene: { end: 'skip' } }, sk.ctx);
  assert.ok(skipped.some(e => e.type === 'scened' && e.end === 'skip'));
  assert.equal(sk.g.x.play, null);
  assert.equal(En.Story.seenCount(sk.g.s, 'scene.evening_tea'), 0);
  // a slot that gives a few lines still just shows them (no waiting), as before
  const e = En.newGame(story, 3); e.x.at = 'home';
  const ev = En.begin(story, e, 'home_evening', { ...gate, stage: 1 });
  assert.ok(ev.find(k => k.type === 'scene' && !k.play) && e.x.play.wait === 'choice');
  // a scene that names a missing library scene is caught by the story's rulebook
  const bad = clone(story); bad.scenes.evening_together.variants.everyday[0].scene = 'nowhere';
  assert.ok(En.validate(bad, {}).some(k => /unknown full scene/.test(k)));
  // a save from before this node had a scene can't leave the event stuck
  const x = En.cleanX({ ...clone(c.g.x), play: { ev: 'home_evening', node: 'day', wait: 'scene' } }, story);
  assert.equal(x.play, null);
});

test('the scene engine is pure, stands on the built pieces, and the lab is in F12 > Labs', () => {
  for (const f of ['scene-engine.js', 'scene-mine.js', 'scene-tune.js']) {
    const s = read('js/core/scene/' + f).replace(/\/\/.*$/gm, '');
    for (const re of [/\bdocument\b/, /\bwindow\b/, /localStorage/, /\bfetch\(/, /Date\.now/, /Math\.random/, /new Date/]) assert.equal(re.test(s), false, `${f}: ${re}`);
    // it never reads the gate itself, and never touches the bond or xp
    assert.equal(/import[^;]*(gate\.js|bond|progress|relationship|gamesave)/.test(s), false, f);
  }
  // storage and the network only in the door
  assert.match(read('js/core/scene/scene-door.js'), /localStorage/);
  // ONE slot picker, ONE story memory: no second copies
  assert.match(read('js/core/story/story-engine.js'), /Scenes\.pick\(/);
  assert.equal(/TIERS_HIGH_FIRST\s*=/.test(read('js/core/scene/scene-engine.js')), false);
  assert.match(read('js/core/story/story.js'), /SceneDoor\.install/);
  assert.match(read('js/core/delve/delve.js'), /SceneDoor\.install/);
  // the lab: F12 > Labs, the app's allow-list, the registry; the album in the game world
  assert.match(read('js/debug-menu.js'), /scene-lab\.html/);
  assert.match(readFileSync(new URL('../../../desktop/main.js', import.meta.url), 'utf8'), /\/scene-lab\.html/);
  const reg = J('data/features.json').features;
  for (const id of ['scenes', 'scene_maker']) assert.ok(reg.find(f => f.id === id), id);
  assert.match(read('game-world.html'), /id="momentsBtn"/);
  assert.match(read('js/game-world.js'), /scene\.html/);
  // nothing lists the lab or the maker in the player's Settings (tuning tools live in F12)
  assert.equal(/scene-lab/.test(read('desktop-settings.html') + read('js/desktop-settings.js')), false);
});
