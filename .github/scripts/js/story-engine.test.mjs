// the story-event engine (#34, webapp/js/core/story/story-engine.js + cond.js + story-sim.js, data/story.json): events as data, the
// picker (queued → the main story → loose ends → by chance), choices and effects that land in STORY STATE, threads that
// come back, the ceremony cards, the one gate, a lost fight through difficulty.js, autosaves at beats, and the map opening
// places from the story's flags. The sample story is a stand-in; these rules are not.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const J = (f) => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const En = await import(new URL('js/core/story/story-engine.js', root));
const Cond = await import(new URL('js/core/story/cond.js', root));
const Sim = await import(new URL('js/core/story/story-sim.js', root));
const S = await import(new URL('js/core/story/story-state.js', root));
const P = await import(new URL('js/core/world/places.js', root));
const D = await import(new URL('js/core/difficulty.js', root));
const Gate = await import(new URL('js/core/gate.js', root));
const { tune, DEFAULTS } = await import(new URL('js/core/story/story-tune.js', root));

const data = J('data/story.json'), places = J('data/places.json'), dd = J('data/difficulty.json'), prog = J('data/progress.json'), items = J('data/items.json'), delve = J('data/delve.json');
const known = { places, grants: Object.keys(prog.story), areas: Object.keys(delve.areas) };
const gate = (over = {}) => ({ gateCheck: Gate.check, gate: { comfort: { ...Gate.DEFAULTS, ...over }, mode: 'windowed' } });
const clone = (v) => JSON.parse(JSON.stringify(v));
// play whatever is going on to its end, answering with fn(choices) / hook results from a list
function drain(g, ctx, { choose = (l) => l.find(c => c.ok).id, results = {} } = {}) {
  const all = [];
  for (let i = 0; i < 200 && g.x.play && !g.x.over; i++) {
    const w = g.x.play.wait, node = data.events[g.x.play.ev].nodes[g.x.play.node];
    all.push(...En.step(data, g, w === 'choice' ? { choice: choose(En.choicesFor(data, g, ctx), g.x.play) } : w === 'hook' ? { result: results[node.hook.kind] || data.hooks[node.hook.kind].outcomes[0] } : {}, ctx));
  }
  return all;
}
const play = (g, events, ctx, o) => [...events, ...drain(g, ctx, o)];
// a game played up to a point of the sample's main story
function upTo(eventId, ctx = {}, o) {
  const g = En.newGame(data, 7);
  const order = Object.entries(data.events).filter(([, e]) => e.spine).sort((a, b) => a[1].order - b[1].order);
  for (const [id, ev] of order) {
    if (id === eventId) break;
    g.x.at = [].concat(ev.at)[0];
    play(g, En.begin(data, g, id, ctx), ctx, o);
  }
  return g;
}

test('the shipped story keeps every rule, and so do its map, its grants and its things', () => {
  assert.deepEqual(En.validate(data, known), []);
  assert.deepEqual(P.check(places), []);
  // every grant the story asks for gives things the catalog knows
  for (const [id, gr] of Object.entries(prog.story)) for (const r of gr.give) if (r.kind !== 'currency') assert.ok(items.items[r.id], `${id}: ${r.id}`);
  // stand-in only: nothing 18+, no "agreed beforehand" entries, the 18+ scene lists empty
  assert.equal(/"tier":\s*"adult"/.test(read('data/story.json')), false);
  assert.equal(/"consent"|"agree"/.test(read('data/story.json')), false);
  for (const sl of Object.values(data.scenes)) assert.deepEqual(sl.variants.adult || [], []);
});

test('the rulebook catches mistakes', () => {
  const bad = (edit, re) => { const d = clone(data); edit(d); const e = En.validate(d, known); assert.ok(e.some(m => re.test(m)), String(re) + '\n' + e.join('\n')); };
  bad(d => { d.events.a1_fixed.when = { bond: { gte: 3 } }; }, /main story can never wait on "bond"/);
  bad(d => { d.events.a1_fixed.chance = 0.5; }, /never left to chance/);
  bad(d => { d.events.a1_fixed.tier = 'flirty'; }, /main story is Everyday/);
  bad(d => { d.events.stroll_ad.tier = 'adult'; }, /18\+ entries are the owner's/);
  bad(d => { d.events.home_evening.nodes.in.choices[2].consent = 'beforehand'; }, /agreed beforehand/);
  bad(d => { d.events.stroll_ad.nodes.ad.do = [{ agree: 'anything' }]; }, /owner's to write/);
  bad(d => { d.events.stroll_ad.nodes.ad.next = 'nowhere'; }, /unknown node nowhere/);
  bad(d => { d.events.stroll_ad.nodes.lost = { text: 'x' }; }, /nothing leads here/);
  bad(d => { d.events.stroll_ad.nodes.jun.next = 'ad'; delete d.events.stroll_ad.nodes.jun.end; d.events.stroll_ad.nodes.ad.next = 'jun'; }, /never ends/);
  bad(d => { for (const c of d.events.a1_the_gift.nodes.give.choices) c.when = { flag: 'x' }; }, /at least one plain choice/);
  bad(d => { delete d.events.a1_buried_levels.nodes.down.on.left; }, /what if the delve goes "left"/);
  bad(d => { d.events.a1_buried_levels.nodes.down.hook.area = 'the_moon'; }, /unknown delve place/);
  bad(d => { d.events.stroll_ad.nodes.ad.do = [{ grant: 'free_money' }]; }, /no story grant/);
  bad(d => { d.events.stroll_ad.nodes.ad.do = [{ set: 'Bad Flag' }]; }, /can't be an id/);
  bad(d => { d.events.stroll_ad.when = { mystery: 1 }; }, /nobody understands/);
  bad(d => { d.threads.orphan = { name: 'x', line: 'x' }; }, /nothing ever opens it/);
  bad(d => { d.spots.moon = { name: 'The moon', triggers: [] }; }, /no place on the map goes here/);
  bad(d => { delete d.scenes.care.variants.everyday; }, /no Everyday variant/);
  bad(d => { d.events.stroll_ad.hears = 'his_bank_details'; }, /isn't a kind in "tells"/);
});

test('conditions: the map\'s own language for story state, plus the engine\'s own', () => {
  const g = En.newGame(data, 1);
  S.setFlag(g.s, 'met_al'); S.setFlag(g.s, 'gift', 'ribbon'); S.addTo(g.s, 'crates', 2); S.setQuest(g.s, 'act1', 'harbor'); S.markSeen(g.s, 'stroll_ad'); S.choose(g.s, 'a1_no_papers.stop', 'honest');
  g.x.threads.stranger = { s: 'open', day: 1, touched: 1, n: 2 }; g.x.threads.inspector = { s: 'closed', as: 'warned', day: 1, touched: 2, n: 0 };
  g.x.last.stroll_ad = 1; g.x.day = 4; g.x.at = 'slums'; g.x.npc.al = { rep: 20, aff: 0, met: 1 }; g.x.codex.p_al = 1;
  const ctx = { stage: 3, with: ['jun'], levels: { jun: { photography: 25 } }, spotTags: ['town'] };
  const stateConds = [{ flag: 'met_al' }, { flag: 'gift', is: 'ribbon' }, { quest: 'act1', step: 'harbor' }, { seen: 'stroll_ad' }, { choice: 'a1_no_papers.stop', is: 'honest' }, { not: { flag: 'nope' } }, { any: [{ flag: 'nope' }, { flag: 'met_al' }] }];
  for (const c of stateConds) { assert.equal(Cond.test(c, g, ctx), true, JSON.stringify(c)); assert.equal(Cond.test(c, g, ctx), P.when(c, g.s), 'the same answer as the map: ' + JSON.stringify(c)); }
  const yes = [{ flag: 'crates', gte: 2 }, { thread: 'stranger', is: 'open' }, { thread: 'stranger', gte: 2 }, { thread: 'inspector', is: 'closed:warned' }, { thread: 'wave_sign', is: 'none' },
    { since: 'stroll_ad', gte: 3 }, { at: ['slums', 'home'] }, { spotTag: 'town' }, { with: 'jun' }, { day: 4 }, { bond: { gte: 3 } }, { skill: { who: 'jun', id: 'photography', gte: 20 } },
    { rep: { npc: 'al', gte: 10 } }, { card: 'p_al' }, { difficulty: ['easy'] }, [{ flag: 'met_al' }, { at: 'slums' }], { slot: 'morning' }];
  const no = [{ flag: 'crates', gte: 3 }, { thread: 'stranger', is: 'closed' }, { thread: 'inspector', is: 'closed:joined' }, { since: 'stroll_ad', gte: 4 }, { since: 'sea_fog' }, { at: 'home' }, { with: 'al' },
    { day: { gte: 5 } }, { bond: { gte: 4 } }, { aff: { npc: 'al', gte: 1 } }, { card: 'p_jun' }, { difficulty: ['hard'] }, { weather: 'fog' }, { weird: 1 }, 'nonsense'];
  for (const c of yes) assert.equal(Cond.test(c, g, ctx), true, JSON.stringify(c));
  for (const c of no) assert.equal(Cond.test(c, g, ctx), false, JSON.stringify(c));
  assert.deepEqual(Cond.why({ all: [{ flag: 'met_al' }, { bond: { gte: 5 } }] }, g, ctx), ['your bond with her: stage at least 5']);
  assert.deepEqual(Cond.why({ flag: 'met_al' }, g, ctx), []);
});

test('the story starts from a place on the map and a flag it sets opens another', () => {
  const start = places.places.find(p => p.go?.story === data.start.spot);
  const g = En.newGame(data, 3);
  assert.equal(P.view(places, g.s).find(p => p.id === start.id).state, 'open', 'the first place is open in a fresh game');
  assert.equal(P.view(places, g.s).find(p => p.id === 'scrapyard').state, 'locked');
  const ev = play(g, En.arrive(data, g, 'home', { now: 5 }), { now: 5 });
  assert.equal(ev.find(e => e.type === 'began').event, 'a1_bad_score');
  assert.equal(ev.find(e => e.type === 'picked').cls, 'spine');
  assert.equal(P.view(places, g.s).find(p => p.id === 'scrapyard').state, 'open', 'the story opened the scrapyard');
  // … and it all landed in story state: the flag, the quest, what was seen, the choice, the save card
  assert.equal(S.has(g.s, 'day_started'), true);
  assert.equal(S.questStep(g.s, 'act1'), 'scrapyard');
  assert.equal(S.seenCount(g.s, 'a1_bad_score'), 1);
  assert.ok(S.chose(g.s, 'a1_bad_score.ping'));
  assert.equal(g.s.place, 'Home'); assert.equal(g.s.chapter, 'Act 1 (sample)');
  assert.ok(g.s.log.some(l => l.kind === 'flag' && l.id === 'day_started' && l.at === 5), 'logged with the time the page gave');
  assert.ok(ev.some(e => e.type === 'autosave'), 'a main-story beat is kept');
  // both parts survive a save: plain data, and story state's own cleaner takes it back unchanged
  assert.deepEqual(S.clean(clone(g.s), D.ids(dd)), g.s);
  assert.deepEqual(En.cleanX(clone(g.x), data), g.x);
  assert.deepEqual(En.cleanX({ v: 99 }, data, 4), En.blankX(data, 4), 'an odd section starts clean');
});

test('the picker: queued first, then the main story, then a loose end, then chance; and sometimes nothing', () => {
  const g = upTo('a1_port_buffer');   // the inspector's loose end is open, the harbor is known
  g.x.at = 'slums'; g.x.day = 9;      // days later: his return is due
  const ctx = {};
  assert.equal(En.pick(data, clone(g), 'stroll', ctx, tune({ pick: { threadChance: 1 } })).cls, 'thread');
  // a main-story beat at the same place always wins over it
  const g2 = upTo('a1_no_papers'); g2.x.at = 'slums';
  const p2 = En.pick(data, g2, 'stroll', ctx);
  assert.deepEqual([p2.id, p2.cls], ['a1_no_papers', 'spine']);
  // something set going earlier comes first of all
  const g3 = clone(g2); g3.x.queue.push({ ev: 'stroll_ad', day: 1 });
  assert.equal(En.pick(data, g3, 'stroll', ctx).cls, 'queue');
  // by chance: quiet sometimes, and "why not" is always given in words
  const g4 = upTo('a1_port_buffer'); g4.x.at = 'slums';
  let quiet = 0, fired = new Set();
  for (let i = 0; i < 300; i++) { const k = clone(g4); k.x.r.s = i * 7919; const p = En.pick(data, k, 'stroll', ctx); if (!p.id) quiet++; else fired.add(p.id); }
  assert.ok(quiet > 40 && quiet < 200, 'not every walk is a story: ' + quiet);
  assert.ok(fired.size >= 3, [...fired].join());
  const never = En.pick(data, clone(g4), 'stroll', ctx, tune({ pick: { quietK: 0 } }));
  assert.ok(never.id, 'quietK 0 = something always happens');
  const why = En.can(data, g4, 'a1_first_voyage', 'stroll', En.full(data, g4, ctx), tune());
  assert.equal(why.ok, false);
  assert.ok(why.why.some(w => /happens at: Brandwater Bay/.test(w)) && why.why.some(w => /dinghy_ready/.test(w)), why.why.join('; '));
  // the same seed, the same story
  const a = Sim.playthrough(data, { seed: 11, places }).stats.order, b = Sim.playthrough(data, { seed: 11, places }).stats.order;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Sim.playthrough(data, { seed: 12, places }).stats.order);
});

test('an event: lines, a card the first time only, choices remembered, effects, grants, a hook that branches', () => {
  const g = upTo('a1_the_dump'); g.x.at = 'scrapyard';
  const ctx = { names: { you: 'Sam', her: 'Mira' } };
  const ev = En.begin(data, g, 'a1_the_dump', ctx);
  assert.equal(ev.find(e => e.type === 'began').cls, 'spine');
  assert.equal(g.x.play.wait, 'next');
  const ch = En.step(data, g, {}, ctx).find(e => e.type === 'choices');
  assert.deepEqual(ch.list.map(c => c.id), ['careful', 'check', 'look']);
  assert.deepEqual(En.step(data, g, { choice: 'nope' }, ctx), [{ type: 'error', why: 'not a choice you have' }]);
  const rest = play(g, En.step(data, g, { choice: 'careful' }, ctx), ctx);
  assert.equal(S.chose(g.s, 'a1_the_dump.pile'), 'careful');
  const named = rest.find(e => e.type === 'beat' && /Sam\./.test(e.text));
  assert.match(named.text, /careful with my arm/, 'the line that fits what you chose');
  assert.equal(rest.find(e => e.type === 'card' && e.id === 'p_jun').title, 'Mira', 'her name as the player set it');
  assert.ok(S.has(g.s, 'met_jun') && S.has(g.s, 'needs_al'));
  assert.deepEqual(rest.filter(e => e.type === 'card').map(e => [e.id, e.first]), [['p_jun', true], ['ch1_start', true], ['pl_scrapyard', true]]);
  assert.equal(rest.at(-1).type, 'autosave');
  assert.equal(rest.some(e => e.type === 'tell' && e.kind === 'found_her'), true);
  // the same card again is only a nod
  const g2 = upTo('a1_buried_levels'); g2.x.at = 'scrapyard';
  const b = En.begin(data, g2, 'a1_buried_levels', {});
  // nothing new to show here: no card
  assert.equal(b.some(e => e.type === 'card'), false);
  // a hook hands over and branches on how it went; every way on moves the story (never blocked)
  for (const [res, flagText] of [['cleared', /still in its cradle/], ['left', /It'll do/], ['ko', /wake up at home/]]) {
    const k = clone(g2);
    const evs = play(k, [], {}, { results: { delve: res } });
    assert.ok(evs.some(e => e.type === 'beat' && flagText.test(e.text)), res);
    assert.ok(S.has(k.s, 'has_part'), res);
    assert.deepEqual(evs.filter(e => e.type === 'grant').map(e => e.id), ['story_a1_coil']);
  }
  En.step(data, g2, {}, {});
  assert.equal(En.step(data, g2, { result: 'exploded' }, {})[0].type, 'error');
  // the gift: what you pick is a flag the words read later, and a keepsake by a story grant
  const g3 = upTo('a1_the_gift'); g3.x.at = 'home';
  const gift = play(g3, En.begin(data, g3, 'a1_the_gift', {}), {}, { choose: () => 'bolt' });
  assert.equal(S.flag(g3.s, 'gift'), 'bolt_ring');
  assert.ok(gift.some(e => e.type === 'beat' && /bolt bent into a ring/.test(e.text)));
  assert.deepEqual(gift.filter(e => e.type === 'grant').map(e => e.id), ['story_gift_bolt_ring', 'story_photo_first']);
  // her Photography only changes the words, never what happens
  const g4 = upTo('a1_the_gift'); g4.x.at = 'home';
  const good = play(g4, En.begin(data, g4, 'a1_the_gift', { levels: { jun: { photography: 30 } } }), { levels: { jun: { photography: 30 } } }, { choose: () => 'bolt' });
  assert.ok(good.some(e => e.type === 'beat' && /a keeper/.test(e.text)));
  assert.deepEqual(clone({ ...g4.s, log: 0 }), clone({ ...g3.s, log: 0 }));
});

test('loose ends: they open, wait their own time, come back, and never pile up', () => {
  const g = upTo('a1_port_buffer'); g.x.at = 'slums';
  assert.equal(g.x.threads.inspector.s, 'open');
  const t1 = tune({ pick: { threadChance: 1, quietK: 0 } });
  const due = En.dueDay(g, data.events.inspector_returns);
  assert.ok(due >= g.x.threads.inspector.touched + 2 && due <= g.x.threads.inspector.touched + 4);
  g.x.day = due - 1;
  assert.ok(En.can(data, g, 'inspector_returns', 'stroll', En.full(data, g, {}), t1).why.some(w => /in its own time/.test(w)));
  g.x.day = due; g.x.today = { day: due, returns: 0, pool: 0, lastReturn: -99 };
  // how you treated him earlier decides what he says now
  const honest = clone(g); S.choose(honest.s, 'a1_no_papers.stop', 'honest');
  const evs = play(honest, En.trigger(data, honest, 'stroll', {}, t1), {});
  assert.equal(evs.find(e => e.type === 'began').event, 'inspector_returns');
  assert.match(evs.find(e => e.type === 'beat').text, /straight with me/);
  assert.deepEqual([honest.x.threads.inspector.s, honest.x.threads.inspector.as], ['closed', 'warned']);
  assert.equal(En.can(data, honest, 'inspector_returns', 'stroll', En.full(data, honest, {}), t1).ok, false, 'a tied-off loose end stays tied off');
  // "not now" keeps one open, and it comes back with other words; never two close together, never more than the day's share
  const k = clone(g); k.x.threads.stranger = { s: 'open', day: 1, touched: 1, n: 0 }; k.x.threads.inspector.s = 'closed';
  k.x.day += 5; k.x.today = { day: k.x.day, returns: 0, pool: 0, lastReturn: -99 };
  const first = play(k, En.trigger(data, k, 'stroll', {}, t1), {}, { choose: () => 'later' });
  assert.equal(first.find(e => e.type === 'began').event, 'stranger_again');
  assert.deepEqual([k.x.threads.stranger.s, k.x.threads.stranger.n], ['open', 1]);
  assert.notEqual(En.pick(data, clone(k), 'stroll', {}, t1).cls, 'thread', 'not again right away');
  for (const n of [200, 201]) {
    const m = Sim.many(data, { places, seed: n, days: 14 }, 60);
    assert.ok(m.perDayReturns <= DEFAULTS.pick.threadsPerDay, 'returns in a day: ' + m.perDayReturns);
  }
  // a promise made is a promise kept, later, on the water
  const sea = upTo('a1_broadcast'); sea.x.at = 'brandwater_bay'; sea.x.day += 2; sea.x.today = { day: sea.x.day, returns: 0, pool: 0, lastReturn: -99 };
  const kept = play(sea, En.trigger(data, sea, 'voyage', {}, t1), {});
  assert.equal(kept.find(e => e.type === 'began').event, 'promise_steer_kept');
  assert.equal(sea.x.threads.promise_steer.as, 'kept');
  assert.ok(kept.some(e => e.type === 'grant' && e.id === 'story_photo_steering'));
});

test('the ceremony layer: a card for every first, the codex, a keepsake for a finished page', () => {
  const { g, stats } = Sim.playthrough(data, { seed: 5, places, days: 20 });
  assert.equal(stats.finishedDay !== null, true);
  for (const id of ['ch1_start', 'p_jun', 'p_al', 'pl_scrapyard', 'pl_port_buffer', 'act1_end']) assert.ok(g.x.codex[id] !== undefined, id);
  assert.ok(g.x.pages.places, 'every place card seen: the page is complete');
  assert.equal(stats.grants.filter(k => k === 'story_codex_places').length, 1, 'its keepsake, once');
  // people are a word, never a number
  assert.equal(En.standing(g, 'al', tune()), 'Acquaintance');
  assert.equal(En.standing(g, 'jester', tune()), 'Stranger');
});

test('everything rated asks the one gate; what is off simply isn\'t there; there is always an Everyday way', () => {
  const g = upTo('a1_buried_levels'); g.x.at = 'home';
  const ids = (ctx) => { const k = clone(g); En.begin(data, k, 'home_evening', ctx); return En.choicesFor(data, k, ctx).map(c => c.id); };
  assert.deepEqual(ids({ ...gate(), stage: 5 }), ['talk', 'quiet', 'forehead']);
  assert.deepEqual(ids({ ...gate(), stage: 2 }), ['talk', 'quiet'], 'not that close yet');
  assert.deepEqual(ids({ ...gate({ flirty: false }), stage: 6 }), ['talk', 'quiet'], 'Flirty off');
  assert.deepEqual(ids({ ...gate({ flavor: 'platonic' }), stage: 6 }), ['talk', 'quiet'], 'best friends: never flirty');
  assert.deepEqual(ids({ stage: 6 }), ['talk', 'quiet'], 'no gate to ask = Everyday only');
  // in the game her say is a meter (Q7): the stage she'd "ask first" at counts as a yes, unless tuned otherwise
  assert.deepEqual(ids({ ...gate(), stage: 4 }), ['talk', 'quiet', 'forehead']);
  const strict = clone(g); En.begin(data, strict, 'home_evening', { ...gate(), stage: 4 }, tune({ gate: { askCounts: 0 } }));
  assert.deepEqual(En.choicesFor(data, strict, { ...gate(), stage: 4 }, tune({ gate: { askCounts: 0 } })).map(c => c.id), ['talk', 'quiet']);
  // scene slots: the highest version that is on, always an Everyday one
  const tier = (ctx) => { const k = clone(g); return En.begin(data, k, 'home_evening', ctx).find(e => e.type === 'scene').tier; };
  assert.equal(tier({ ...gate(), stage: 5 }), 'flirty');
  assert.equal(tier({ ...gate({ flirty: false }), stage: 5 }), 'everyday');
  assert.equal(tier({}), 'everyday');
  // a theme the player filtered out is not there either
  const d2 = clone(data); d2.events.home_evening.nodes.in.choices[1].themes = ['quiet_nights'];
  const k = clone(g); En.begin(d2, k, 'home_evening', {});
  assert.deepEqual(En.choicesFor(d2, k, { themesOff: ['quiet_nights'] }).map(c => c.id), ['talk']);
  // "agreed beforehand" goes through the same gate with story state's agreements (the entries are the owner's: built here only as data in the test)
  const d3 = clone(data); Object.assign(d3.events.home_evening.nodes.in.choices[2], { consent: 'beforehand', agreement: 'sample_agreement', minStage: 1 });
  const a = clone(g); En.begin(d3, a, 'home_evening', { ...gate(), stage: 5 });
  assert.equal(En.choicesFor(d3, a, { ...gate(), stage: 5 }).some(c => c.id === 'forehead'), false, 'not agreed: not there');
  S.agree(a.s, 'sample_agreement');
  assert.equal(En.choicesFor(d3, a, { ...gate(), stage: 5 }).some(c => c.id === 'forehead'), true, 'agreed in story state: the gate says yes');
});

test('a lost fight goes by the game\'s difficulty: her care, she reaches you, or a game over to load a save from', () => {
  const base = upTo('a1_no_papers'); base.x.at = 'scrapyard';
  const fight = (diff, ctx = {}, salt = 0) => {
    const g = clone(base); S.setDifficulty(g.s, diff);
    const c = { ...ctx, preset: D.preset(dd, diff), salt };
    const before = [...En.begin(data, g, 'scrap_scuffle', c), ...En.step(data, g, { choice: 'stand' }, c)];
    return { g, before, after: En.step(data, g, { result: 'defeat' }, c), c };
  };
  const easy = fight('easy');
  assert.ok(easy.before.some(e => e.type === 'autosave' && /Before: /.test(e.reason)), 'the moment before a fight is kept');
  assert.equal(easy.after.find(e => e.type === 'defeat').how, 'care');
  assert.equal(easy.after.find(e => e.type === 'scene').slot, 'care');
  assert.equal(easy.g.x.over, null);
  // harder: the chance is difficulty.js's own, and both ends happen
  let saved = 0, over = 0;
  for (let i = 0; i < 300; i++) {
    const r = fight('hard', { stage: 4 }, i);
    const how = r.after.find(e => e.type === 'defeat');
    assert.equal(how.chance, D.saveChance(D.preset(dd, 'hard'), { stage: 4, support: 1, together: true }));
    if (how.how === 'saved') { saved++; assert.equal(r.g.x.over, null); assert.ok(r.after.some(e => e.type === 'beat' && /holding the other end/.test(e.text))); }
    else { over++; assert.ok(r.g.x.over); assert.equal(r.after.at(-1).type, 'gameover'); assert.deepEqual(En.step(data, r.g, {}, r.c), [{ type: 'over' }]); assert.equal(En.pending(data, r.g)[0].type, 'gameover'); }
  }
  const want = D.saveChance(D.preset(dd, 'hard'), { stage: 4, support: 1, together: true });
  assert.ok(Math.abs(saved / 300 - want) < 0.09, `saved ${saved}/300, wanted about ${want}`);
  // she stayed home: less likely (difficulty.js "alone"); closer = more likely; never the other way round
  assert.ok(En.defeatChance(base, { preset: D.preset(dd, 'hard'), stage: 4, with: [] }) < En.defeatChance(base, { preset: D.preset(dd, 'hard'), stage: 4, with: ['jun'] }));
  assert.ok(En.defeatChance(base, { preset: D.preset(dd, 'hard'), stage: 6, with: ['jun'] }) > want);
  // nothing is ever taken away, and winning never needs her to hurt anyone: she "trips"
  const win = clone(base); const c = { preset: D.preset(dd, 'extreme') };
  En.begin(data, win, 'scrap_scuffle', c); En.step(data, win, { choice: 'stand' }, c);
  const won = En.step(data, win, { result: 'won' }, c);
  assert.match(won.find(e => e.type === 'beat').text, /tripped|dropped it/);
  assert.equal(win.x.threads.excuses.s, 'open', 'counted quietly, for later');
  // an event left half-way (a save from before the fight) carries on where it was
  const mid = clone(base); En.begin(data, mid, 'scrap_scuffle', {}); En.step(data, mid, { choice: 'stand' }, {});
  const loaded = { s: S.clean(clone(mid.s)), x: En.cleanX(clone(mid.x), data) };
  assert.deepEqual(En.pending(data, loaded).map(e => e.type), ['resumed', 'hook']);
  assert.equal(En.step(data, loaded, { result: 'backed_off' }, {}).some(e => e.type === 'ended'), true);
});

test('a hundred playthroughs: the main story is always told, whoever plays, at any bond, with everything rated off', () => {
  for (const policy of Sim.POLICIES.map(p => p[0])) for (const [diff, stage, comfort] of [['easy', 1, {}], ['extreme', 1, { flirty: false }], ['hard', 6, {}]]) {
    const m = Sim.many(data, { policy, places, days: 16, seed: 40, difficulty: diff, ctx: { ...gate(comfort), stage, preset: D.preset(dd, diff) } }, 40);
    const tag = `${policy}/${diff}/stage ${stage}`;
    assert.deepEqual(m.errors, [], tag);
    assert.equal(m.finished, 40, tag + ': told to its end every time');
    assert.ok(m.maxDays <= 14, tag + ': latest day ' + m.maxDays);
    assert.ok(m.inARow <= 3, tag + ': the same event ' + m.inARow + '× running');
    for (const [id, ev] of Object.entries(data.events)) if (ev.spine) assert.equal(m.events[id].times, 40, tag + ': ' + id + ' exactly once');
    if (diff === 'easy') assert.equal(m.gameovers, 0, tag);
  }
  // every by-chance event and loose end shows up for someone, none for everyone every time
  const m = Sim.many(data, { places, days: 20, seed: 1, policy: 'random' }, 150);
  assert.deepEqual(m.never, []);
  for (const [id, ev] of Object.entries(data.events)) if (!ev.spine) assert.ok(m.events[id].in > 5 && m.events[id].in < 150, `${id}: in ${m.events[id].in} of 150`);
  assert.ok(m.quiet / m.asked > 0.1, 'sometimes nothing happens');
  assert.ok(m.autosaves >= 150 * 11, 'every main-story beat was kept');
  // a player who says no to everything is never punished: the same main story, the same end
  const no = Sim.many(data, { places, days: 16, seed: 9, policy: 'no' }, 40);
  assert.equal(no.finished, 40);
});

test('the engine is pure and stands on the built pieces; pages follow her rules', () => {
  for (const f of ['story-engine.js', 'cond.js', 'story-sim.js', 'story-tune.js']) {
    const src = read('js/core/story/' + f).replace(/\/\/.*$/gm, '');
    assert.equal(/\b(document|window|localStorage|fetch|Date\.now|Math\.random|setTimeout)\b/.test(src), false, f + ' is pure');
    assert.equal(/bond_|relationship|\bxp\b/.test(src), false, f + ' never touches the bond or xp');
  }
  const en = read('js/core/story/story-engine.js');
  assert.match(en, /from '\.\/story-state\.js/); assert.match(en, /from '\.\.\/difficulty\.js/);
  assert.match(read('js/core/story/cond.js'), /from '\.\.\/world\/places\.js/);
  const door = read('js/core/story/story.js');
  assert.match(door, /GameSave\.put\(/); assert.match(door, /epoch: game\.epoch/); assert.match(door, /GameSave\.autosave\(/); assert.match(door, /Progress\.story\(/);
  // no inline scripts, the lab is in F12 > Labs (not in Settings), and the map's door opens the scene page
  for (const f of ['story.html', 'story-lab.html']) assert.deepEqual(read(f).match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [], [], f);
  assert.match(read('js/debug-menu.js'), /\['story-lab\.html', 'Story lab'/);
  assert.equal(/story-lab/.test(read('js/desktop-settings.js')), false);
  assert.match(read('js/game-world.js'), /startStory = \(sceneId, place\) => openPlace\('story\.html\?at='/);
  // what desktop Jun may hear is kinds only: no names, places or numbers in the vocabulary
  for (const [k, line] of Object.entries(data.tells)) { assert.match(k, /^[a-z_]+$/); assert.equal(/\d|Al\b|Jun\b|Port|scrapyard/i.test(line), false, k); }
});
