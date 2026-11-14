// the delve framework (#32, webapp/js/core/delve/ + data/delve.json): floors that can always be
// finished, kind danger, one encounter engine at three paces, roles from what you carry and know,
// her words that never get in the way or change her usefulness, and scene slots that always have an
// Everyday version.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const data = JSON.parse(read('webapp/data/delve.json'));
const REG = JSON.parse(read('webapp/data/features.json'));
const PROGRESS = JSON.parse(read('webapp/data/progress.json'));
const F = await import('../../../webapp/js/core/features.js');
F.use(REG);
const Gate = await import('../../../webapp/js/core/gate.js');
const Floor = await import('../../../webapp/js/core/delve/floor.js');
const Run = await import('../../../webapp/js/core/delve/run.js');
const Enc = await import('../../../webapp/js/core/delve/encounter.js');
const Ab = await import('../../../webapp/js/core/delve/abilities.js');
const Party = await import('../../../webapp/js/core/delve/party.js');
const Scenes = await import('../../../webapp/js/core/delve/scenes.js');
const Sim = await import('../../../webapp/js/core/delve/sim.js');
const { tune, DEFAULTS } = await import('../../../webapp/js/core/delve/delve-tune.js');
const { lastDelve } = await import('../../../webapp/js/core/delve/last.js');
const Delve = await import('../../../webapp/js/core/delve/delve.js');

const L = (lv) => ({ player: { delving: lv, scavenging: lv }, jun: { delving: lv, scanning: lv, hacking: lv, support: lv } });
const seq = (list) => { let i = 0; return () => list[i++ % list.length]; };

test('the data keeps its rules', () => {
  for (const [id, r] of Object.entries(data.rooms)) assert.deepEqual(Floor.checkRoom(id, r, DEFAULTS.floor.slot), [], id);
  const tags = (t) => Object.values(data.rooms).filter(r => r.tags.includes(t));
  // a room of each special kind, and a plain one, that can take a door on every side: a floor can always be laid out
  for (const t of ['start', 'stairs', 'camp', 'vault', 'secret', 'room']) {
    assert.ok(tags(t).some(r => !r.rare && Object.values(Floor.sidesOf(r)).every(Boolean)), t + ': one with four doors');
  }
  for (const [id, a] of Object.entries(data.areas)) {
    assert.ok(a.floors >= 1 && a.cols >= 2 && a.rows >= 2, id);
    for (const [f] of a.foes) assert.ok(data.foes[f], id + ': ' + f);
    assert.ok(data.foes[a.boss], id + ': boss');
    assert.ok(Enc.PACE_IDS.includes(a.pace), id + ': pace');
    for (const c of ['wall', 'wallDark', 'floor', 'ceil', 'door', 'fog', 'trim']) assert.match(a.colors[c], /^#[0-9a-f]{6}$/i, id + ': ' + c);
  }
  // machines, drones and odd creatures, never people
  for (const [id, f] of Object.entries(data.foes)) {
    assert.ok(['machine', 'creature'].includes(f.kind), id);
    for (const [a] of f.abilities) assert.ok(data.abilities[a], id + ': ' + a);
  }
  for (const [id, k] of Object.entries(data.kits)) for (const a of k.abilities) assert.ok(data.abilities[a], id + ': ' + a);
  for (const who of ['player', 'jun']) for (const k of data.defaultKits[who]) assert.ok(data.kits[k], k);
  for (const [id, a] of Object.entries(data.abilities)) {
    assert.ok(['hit', 'guard', 'cover', 'taunt', 'heal', 'rally', 'expose', 'stun'].includes(a.kind), id);
    for (const t of a.tags) assert.ok(Ab.TAGS.includes(t), id + ': ' + t);
    if (a.from) assert.ok(PROGRESS.skills[a.from.skill], id + ': a real skill');
  }
  for (const [id, m] of Object.entries(data.lines)) for (const l of m.say) {
    assert.ok(l.id && l.t, id);
    assert.ok(data.faces.includes(l.face), id + ': face ' + l.face);
    for (const c of l.c || []) assert.ok(['timid', 'steady', 'brave'].includes(c), l.id);
    assert.ok(!/b-?baka/i.test(l.t), l.id + ': not her own voice');
  }
  const ids = Object.values(data.lines).flatMap(m => m.say.map(l => l.id));
  assert.equal(new Set(ids).size, ids.length, 'line ids are unique');
});

test('every path stands on its own: nothing to PLAY asks for a bond or a flavor', () => {
  const deny = ['minStage', 'minBond', 'stage', 'flavor', 'flavors', 'minTrust'];
  for (const part of ['areas', 'rooms', 'foes', 'abilities', 'kits', 'roles']) {
    for (const [id, x] of Object.entries(data[part])) for (const k of deny) assert.ok(!(k in x), `${part}.${id}: ${k}`);
  }
  // the delve is a real activity of the progression service now, everyday, with no bond in it
  const a = PROGRESS.activities.delve;
  assert.ok(a && !a.sample && a.source === 'delve' && a.tier === 'everyday' && a.together === true);
  assert.equal(Delve.ACTIVITY, 'delve');
  // who can do what never reads the bond, the flavor or her courage (comments aside)
  for (const f of ['abilities.js', 'encounter.js']) {
    const code = read('webapp/js/core/delve/' + f).replace(/\/\/.*$/gm, '');
    assert.ok(!/courage|stage|flavor|bond|comfort/i.test(code), f);
  }
});

test('floors: the same seed is the same floor, and every floor can be finished', () => {
  const a = Floor.generate(data, { area: 'server_farm', depth: 2, seed: 7 });
  const b = Floor.generate(data, { area: 'server_farm', depth: 2, seed: 7 });
  assert.equal(Floor.ascii(a), Floor.ascii(b));
  assert.notEqual(Floor.ascii(a), Floor.ascii(Floor.generate(data, { area: 'server_farm', depth: 2, seed: 8 })));
  let rare = 0, secret = 0, n = 0;
  for (const [id, A] of Object.entries(data.areas)) for (let d = 1; d <= A.floors; d++) for (let s = 1; s <= 120; s++) {
    const f = Floor.generate(data, { area: id, depth: d, seed: s });
    const open = Floor.reach(f), all = Floor.reach(f, { secrets: true });
    const goal = f.things.filter(t => t.kind === (f.last ? 'vault' : 'stairs'));
    assert.equal(goal.length, 1, `${id} ${d} ${s}: one way on`);
    assert.ok(Floor.usable(f, goal[0], open), `${id} ${d} ${s}: the way on can be reached without any secret`);
    assert.equal(f.things.filter(t => t.kind === 'stairs').length, f.last ? 0 : 1);
    assert.equal(f.things.filter(t => t.kind === 'exit').length, 1);
    for (const t of f.things) assert.ok(Floor.usable(f, t, all), `${id} ${d} ${s}: ${t.kind} at ${t.x},${t.y}`);
    // hidden rooms really are hidden
    const hid = f.rooms.find(r => r.role === 'secret');
    if (hid) { secret++; assert.ok(!open.has((hid.y + (hid.h - 1) / 2) * f.w + hid.x + (hid.w - 1) / 2) || data.rooms[hid.id].rows[(hid.h - 1) / 2][(hid.w - 1) / 2] !== '.', 'behind a hidden door'); }
    if (f.rooms.some(r => r.rare)) rare++;
    if (d < DEFAULTS.floor.campFrom) assert.ok(!f.rooms.some(r => r.role === 'camp'));
    n++;
  }
  assert.ok(rare / n < 0.25 && rare > 0, 'rare rooms are rare: ' + rare / n);
  assert.ok(secret / n > 0.3, 'hidden rooms turn up');
});

test('walking: bumping, the map filling in, her scanner, a hidden door', () => {
  const { run, events } = Run.start(data, { area: 'server_farm', seed: 5, levels: L(1) });
  assert.equal(events[0].type, 'entered');
  const f = Run.floorOf(data, run);
  assert.ok(Run.seenAt(data, run, run.pos.x, run.pos.y));
  const before = run.seen[1].reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) Run.turn(data, run, 1);
  assert.ok(run.seen[1].reduce((a, b) => a + b, 0) > before, 'looking around fills the map');
  // a wall is a wall
  let bumped = false;
  for (let i = 0; i < 12 && !bumped; i++) bumped = Run.step(data, run, 0).some(e => e.type === 'bump');
  assert.ok(bumped);
  // a hidden door: a wall until found; a hint from her opens it when you lean on it
  const at = [...f.cells.keys()].find(i => f.cells[i] === Floor.SECRET);
  if (at !== undefined) {
    const x = at % f.w, y = (at - x) / f.w;
    assert.equal(Run.cellAt(data, run, x, y), Floor.WALL);
    run.hint['1:' + at] = 1;
    assert.ok(Run.isSecretHinted(data, run, x, y));
  }
  // alone, nothing is sensed for you
  const alone = Run.start(data, { area: 'server_farm', seed: 5, together: false, levels: L(50) }).run;
  for (let i = 0; i < 4; i++) assert.ok(!Run.turn(data, alone, 1).some(e => e.type === 'sensed'));
  assert.equal(alone.hp.her, null);
});

test('kind danger: leave any time, traps never finish you, backing off always works, going down loses nothing', () => {
  const t = tune();
  // leaving on the very first step still counts for something
  const a = Run.start(data, { area: 'server_farm', seed: 3, levels: L(1) }).run;
  const left = Run.leave(data, a, 'home', t);
  assert.equal(a.state, 'over');
  assert.ok(left[0].outcome.quality >= t.run.qualityFloor && left[0].outcome.quality <= 1);
  // a trap never takes the last of your health
  for (let s = 1; s < 40; s++) {
    const { run } = Run.start(data, { area: 'server_farm', seed: s, together: false, levels: L(1) });
    const f = Run.floorOf(data, run);
    const trap = f.things.find(th => th.kind === 'trap');
    if (!trap) continue;
    run.hp.you.hp = 2;
    run.pos = { x: trap.x - 1, y: trap.y, d: 1 };
    if (Run.cellAt(data, run, trap.x - 1, trap.y) === Floor.WALL) { run.pos = { x: trap.x, y: trap.y - 1, d: 2 }; }
    const ev = Run.step(data, run, 0, t);
    assert.ok(ev.some(e => e.type === 'trap'));
    assert.ok(run.hp.you.hp >= 1);
    break;
  }
  // meet something, back off: it always works, and afterwards you can slip past
  const find = () => { for (let s = 1; s < 60; s++) { const r = Run.start(data, { area: 'server_farm', seed: s, levels: L(1) }).run; const th = Run.floorOf(data, r).things.find(x => x.kind === 'foe' && !x.big); if (th) return [r, th]; } };
  const [run, foe] = find();
  run.pos = { x: foe.x, y: foe.y - 1, d: 2 };
  if (Run.cellAt(data, run, foe.x, foe.y - 1) === Floor.WALL) run.pos = { x: foe.x - 1, y: foe.y, d: 1 };
  assert.ok(Run.step(data, run, 0, t).some(e => e.type === 'fight'));
  assert.equal(run.state, 'fight');
  assert.deepEqual(Run.step(data, run, 0, t), [], 'no walking mid-fight');
  Enc.flee(run.enc);
  assert.equal(Run.endFight(data, run, t)[0].how, 'fled');
  assert.equal(run.state, 'walk');
  assert.ok(Run.step(data, run, 0, t).some(e => e.type === 'moved'), 'slip past');
  // going down: the care scene, then home, with everything you had
  const [r2, foe2] = find();
  r2.stats.chests = 2;
  r2.pos = { x: foe2.x, y: foe2.y - 1, d: 2 };
  if (Run.cellAt(data, r2, foe2.x, foe2.y - 1) === Floor.WALL) r2.pos = { x: foe2.x - 1, y: foe2.y, d: 1 };
  Run.step(data, r2, 0, t);
  const you = r2.enc.units.find(u => u.id === 'you');
  you.hp = 0; you.out = true; r2.enc.over = 'ko';
  assert.ok(Run.endFight(data, r2, t).some(e => e.type === 'ko'));
  assert.equal(r2.state, 'ko');
  assert.equal(Run.careWhere(data, r2), 'home');
  const home = Run.afterCare(data, r2, 'home', t);
  assert.equal(home[0].how, 'carried');
  assert.equal(home[0].outcome.chests, 2, 'nothing is lost');
  assert.ok(home[0].outcome.quality >= t.run.qualityFloor);
  assert.ok(r2.hp.you.hp >= 1);
});

test('one encounter engine, three paces', () => {
  const t = tune();
  const make = (pace, seed, ctl = 'auto') => {
    const you = Ab.build(data, 'player', { levels: L(5).player }); you.ctl = ctl;
    return Enc.create(data, { us: [you, Ab.build(data, 'jun', { levels: L(5).jun })], them: Ab.foesFor(data, ['sentry', 'lantern'], 3), pace, seed });
  };
  for (const pace of Enc.PACE_IDS) {
    const a = make(pace, 11), b = make(pace, 11);
    Enc.autoplay(data, a, t); Enc.autoplay(data, b, t);
    assert.ok(['won', 'ko'].includes(a.over), pace + ' ends');
    assert.deepEqual(Enc.result(a, t), Enc.result(b, t), pace + ': the same seed, the same fight');
  }
  // turn-based waits for you as long as you like; timed and real-time keep moving
  const turn = make('turn', 3, 'you');
  Enc.advance(data, turn, 0, t);
  assert.equal(Enc.waitingFor(turn).id, 'you');
  const snap = JSON.stringify(turn.units.map(u => [u.hp, u.meter]));
  Enc.advance(data, turn, 60000, t);
  assert.equal(JSON.stringify(turn.units.map(u => [u.hp, u.meter])), snap, 'nothing moves while it waits');
  const real = make('real', 3, 'you');
  for (let i = 0; i < 400 && !real.over; i++) Enc.advance(data, real, 50, t);
  assert.ok(real.units.some(u => u.hp < u.max) || real.over, 'real-time goes on without you');
  // a go that can't be done changes nothing
  assert.equal(Enc.act(data, turn, 'you', 'nope', 'foe0')[0].type, 'no');
  assert.equal(Enc.act(data, turn, 'her', 'shove', 'foe0')[0].why, 'not_ready');
  // her going down never ends it; you going down does
  const e = make('turn', 5, 'you');
  Enc.advance(data, e, 0, t);
  const her = e.units.find(u => u.id === 'her');
  her.hp = 1;
  const foe = e.units.find(u => u.side === 'them');
  foe.meter = 1; foe.atk = 999;
  const pick = { ability: foe.abilities[0], target: 'her' };
  Enc.act(data, e, foe.id, pick.ability, 'her', { tune: { ...t, fight: { ...t.fight, hit: 1000, hitMax: 100 } } });
  if (her.out) { assert.equal(e.over, null); assert.ok(Enc.result(e, t).her.hp >= 1, 'she is back on her feet afterwards'); }
  assert.equal(Enc.flee(e)[0].how, 'fled');
  // "no timers" is turn-based everywhere, whatever the place or the pick
  Delve.setStorage(globalThis.localStorage);
  assert.equal(Delve.paceFor(data, 'scrapyard'), 'real');
  Delve.setSetting('pace', 'timed');
  assert.equal(Delve.paceFor(data, 'server_farm'), 'timed');
  Delve.setSetting('notimer', true);
  assert.equal(Delve.paceFor(data, 'scrapyard'), 'turn');
  store.clear();
});

test('roles come from what you carry and know, not from classes', () => {
  const tank = Ab.build(data, 'player', { kits: ['plate'] }), healer = Ab.build(data, 'player', { kits: ['patchkit'] });
  assert.equal(Ab.roleOf(data, tank).top, 'front');
  assert.equal(Ab.roleOf(data, healer).top, 'support');
  // she can carry exactly what you can: either of you can be anything
  const herTank = Ab.build(data, 'jun', { kits: ['plate', 'wrench'] });
  for (const a of ['guard', 'taunt', 'cover', 'strike', 'heavy']) assert.ok(herTank.abilities.includes(a), a);
  // skills teach abilities to whoever has them
  assert.ok(!Ab.build(data, 'jun', { levels: {} }).abilities.includes('scan'));
  assert.ok(Ab.build(data, 'jun', { levels: { scanning: 1 } }).abilities.includes('scan'));
  assert.ok(Ab.build(data, 'player', { levels: { scanning: 20 } }).abilities.includes('ping'), 'if he ever learns it, he has it too');
  assert.ok(Ab.build(data, 'player', { levels: { delving: 5 } }).abilities.includes('second_wind'));
  // a buff from the progression service counts ("Consistent Focus": +accuracy)
  assert.equal(Ab.build(data, 'player', { effects: { accuracy: 5 } }).acc - Ab.build(data, 'player', {}).acc, 5 * DEFAULTS.unit.accPerPoint);
  // going alone is lighter, never heavier
  const pair = Ab.foesFor(data, ['sentry', 'lantern', 'sweeper'], 4), solo = Ab.foesFor(data, ['sentry', 'lantern', 'sweeper'], 4, { alone: true });
  assert.ok(solo.length < pair.length && solo[0].hp < pair[0].hp && solo[0].atk < pair[0].atk);
  assert.equal(Ab.foesFor(data, ['warden'], 4, { alone: true }).length, 1);
});

test('her courage and your bond change her words, never her usefulness', () => {
  const base = { area: 'server_farm', seed: 9, levels: L(10) };
  const stats = (o) => { const r = Run.start(data, { ...base, ...o }).run; return JSON.stringify(Run.fighters(data, r, tune())); };
  const want = stats({ courage: 'grows', stage: 1 });
  for (const courage of ['timid', 'steady', 'brave']) for (const stage of [1, 3, 6]) assert.equal(stats({ courage, stage }), want, courage + ' ' + stage);
  // 'grows': a little scared at first, braver with her Delving and the bond
  assert.equal(Party.band(Party.courage({ delving: 1, stage: 1 })), 'timid');
  assert.ok(Party.courage({ delving: 40, stage: 3 }) > Party.courage({ delving: 1, stage: 1 }));
  assert.equal(Party.band(Party.courage({ delving: 99, stage: 6 })), 'brave');
  assert.equal(Party.band(Party.courage({ setting: 'brave', delving: 1, stage: 1 })), 'brave', 'fearless from day one if he wants');
  // the same moment, different words
  const always = { often: 100, asFeels: false, stage: 3, together: true };
  const timid = Party.say(data, 'enter', { ...always, courage: 0.1 }, { recent: [] }, seq([0, 0.01]));
  const brave = Party.say(data, 'enter', { ...always, courage: 0.95 }, { recent: [] }, seq([0, 0.01]));
  assert.ok(timid && brave && timid.id !== brave.id);
  assert.ok(data.lines.enter.say.find(l => l.id === timid.id).c.includes('timid'));
  // a Stranger gets the shy wording, never the warm one (and the other way round)
  for (let i = 0; i < 60; i++) {
    const shy = Party.say(data, 'corridor', { ...always, courage: 0.5, stage: 1 }, { recent: [] }, Math.random);
    const warm = Party.say(data, 'corridor', { ...always, courage: 0.5, stage: 5 }, { recent: [] }, Math.random);
    assert.notEqual(data.lines.corridor.say.find(l => l.id === shy.id).near, 'warm');
    assert.notEqual(data.lines.corridor.say.find(l => l.id === warm.id).near, 'shy');
  }
});

test('she is in it, never in the way', () => {
  const ctx = { often: 50, asFeels: false, stage: 3, courage: 0.5, together: true };
  // Never stays never; and she doesn't repeat herself
  for (const m of Object.keys(data.lines)) assert.equal(Party.say(data, m, { ...ctx, often: 0 }, { recent: [] }, () => 0), null, m);
  const mem = { recent: [] };
  const a = Party.say(data, 'chest', { ...ctx, often: 100 }, mem, () => 0), b = Party.say(data, 'chest', { ...ctx, often: 100 }, mem, () => 0);
  assert.notEqual(a.id, b.id);
  // every event she can react to has lines
  const evs = [{ type: 'entered' }, { type: 'descended' }, { type: 'quiet' }, { type: 'sensed', what: 'secret' }, { type: 'sensed', what: 'trap' }, { type: 'secret' }, { type: 'trap' },
    { type: 'fight' }, { type: 'fight', big: true }, { type: 'fight_over', how: 'won' }, { type: 'fight_over', how: 'won', hard: true }, { type: 'chest' }, { type: 'vault' },
    { type: 'terminal', hacked: true }, { type: 'terminal', hacked: false }, { type: 'odd' }, { type: 'camp' }, { type: 'stairs' }, { type: 'empty' }, { type: 'left' }];
  for (const ev of evs) assert.ok(data.lines[Party.momentFor(ev)], JSON.stringify(ev));
  assert.equal(Party.momentFor({ type: 'moved' }), null);
  // she stayed home: only the phone, and never a remark about a corridor she isn't in
  const home = { ...ctx, often: 100, together: false };
  assert.match(Party.say(data, 'enter', home, { recent: [] }, () => 0).id, /^cs/);
  assert.equal(Party.say(data, 'corridor', home, { recent: [] }, () => 0), null);
  assert.equal(Party.say(data, 'fight_start', home, { recent: [] }, () => 0), null);
  // nothing in a delve waits for her: the rules never read what she says or the queue
  const code = read('webapp/js/core/delve/run.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/Party\.(say|safeSpot)/.test(code), 'run.js never calls her lines');
  // what moved her is kept for a safe spot, and comes out there, through the gate
  const run = Run.start(data, { area: 'server_farm', seed: 2, levels: L(1) }).run;
  Party.keep(run, 'scared'); Party.keep(run, 'scared'); Party.keep(run, 'proud'); Party.keep(run, 'nonsense');
  assert.deepEqual(run.queue, ['scared', 'proud']);
  const gctx = (stage) => ({ comfort: Gate.DEFAULTS, mode: 'windowed', stage, trust: 60, tension: 0 });
  const copy = () => ({ ...run, queue: run.queue.slice() });
  const stranger = Party.safeSpot(data, copy(), { gateCheck: Gate.check, gateCtx: gctx(1), rnd: () => 0 });
  assert.equal(stranger.length, 2);
  assert.equal(stranger[0].offer, null, 'a Stranger gets her words, not her hand: touch is earned');
  const friend = copy();
  const cards = Party.safeSpot(data, friend, { gateCheck: Gate.check, gateCtx: gctx(3), rnd: () => 0 });
  assert.equal(cards[0].offer.id, 'reach_hand');
  assert.deepEqual(friend.queue, [], 'said once');
  // alone, nothing is kept
  const alone = Run.start(data, { area: 'server_farm', seed: 2, together: false, levels: L(1) }).run;
  Party.keep(alone, 'scared');
  assert.deepEqual(alone.queue, []);
  // every offer is everyday (no rated touch hides in a delve)
  for (const m of Object.values(data.moments)) assert.equal(m.offer.tier, 'everyday');
});

test('scene slots: one moment, a version per rating, always an Everyday one', () => {
  assert.deepEqual(Scenes.checkSlots(data), []);
  for (const s of Object.values(data.scenes)) assert.deepEqual(s.variants.adult, [], '18+ versions are the owner\'s, never shipped');
  const bad = JSON.parse(JSON.stringify(data));
  bad.scenes.knocked_out.variants.everyday = [];
  assert.ok(Scenes.checkSlots(bad).length);
  const ctx = (comfort, stage = 5, mode = 'windowed') => ({ comfort: { ...Gate.DEFAULTS, ...comfort }, mode, stage, trust: 70, tension: 0 });
  const pick = (c, where = 'home') => Scenes.pick(data, 'knocked_out', { where, gateCheck: Gate.check, gateCtx: c, rnd: () => 0 });
  assert.equal(pick(ctx({ flirty: false })).tier, 'everyday');
  assert.equal(pick(ctx({ flirty: true })).tier, 'flirty');
  assert.equal(pick(ctx({ flirty: true }, 2)).tier, 'everyday', 'not that close yet: her say');
  assert.equal(pick(ctx({ flirty: true, flavor: 'platonic' })).tier, 'everyday', 'never flirty for best friends');
  assert.equal(pick({ ...ctx({ flirty: true }), tension: 90 }).tier, 'everyday', 'not in the mood: still cared for');
  // each place has its own Everyday version
  assert.equal(pick(ctx({ flirty: false }), 'camp').variant.where, 'camp');
  assert.equal(pick(ctx({ flirty: false }), 'alone').variant.where, 'alone');
  assert.equal(pick(ctx({ flirty: true }), 'camp').tier, 'everyday', 'no flirty version at the camp yet: falls through seamlessly');
  // the owner's own 18+ version (from the scene maker) plays only when 18+ is on and confirmed
  Scenes.setCustom((slot, tier) => (tier === 'adult' ? [{ id: 'his_own', beats: [{ face: 'neutral', t: '(the owner\'s)' }] }] : []));
  assert.equal(pick(ctx({ flirty: true })).tier, 'flirty');
  assert.equal(pick(ctx({ flirty: true, adult: true, adultConfirmed: true })).variant.id, 'his_own');
  assert.equal(pick(ctx({ flirty: true, adult: true, adultConfirmed: true }, 5, 'desktop')).tier, 'flirty', '18+ stays in her window');
  Scenes.setCustom(null);
  assert.equal(Scenes.pick(data, 'no_such_slot', {}), null);
});

test('a hundred delves in a moment: they end, they are fair, the same seed tells the same story', () => {
  const t = tune();
  const one = Sim.delve(data, { area: 'server_farm', seed: 4, levels: L(1) }, t), again = Sim.delve(data, { area: 'server_farm', seed: 4, levels: L(1) }, t);
  assert.deepEqual(one.outcome, again.outcome);
  assert.equal(one.run.state, 'over');
  const pair = Sim.many(data, { area: 'server_farm', levels: L(1) }, 30, t), solo = Sim.many(data, { area: 'server_farm', together: false, levels: L(1) }, 30, t);
  for (const m of [pair, solo]) {
    assert.ok(m.cleared >= 0.6, 'most delves in the first place reach the deep chest: ' + m.cleared);
    assert.ok(m.minutes > 6 && m.minutes < 40, 'a delve is a sitting, not an evening: ' + m.minutes);
    assert.ok(m.quality >= t.run.qualityFloor && m.quality <= 1);
    assert.ok(m.anyKo < 0.4, 'going down is the exception: ' + m.anyKo);
  }
  assert.ok(solo.cleared >= pair.cleared - 0.25, 'alone plays differently, it is never punished');
  assert.ok(pair.secrets > solo.secrets, 'her scanner finds what you would walk past');
});

test('the registry, the settings and her prompt hook', () => {
  const f = REG.features.find(x => x.id === 'delves');
  assert.ok(f && f.key === 'feature:delves' && f.default === true && f.tier === 'everyday');
  for (const [name, key] of Object.entries(Delve.KEYS)) {
    const e = REG.features.find(x => x.key === 'local:' + key);
    assert.ok(e, key);
    assert.equal(e.default, Delve.SETTING_DEFAULTS[name], key + ': the registry and the code agree on how she comes');
    assert.ok(e.needs.includes('delves'));
  }
  assert.equal(Delve.setting('talk'), 50); assert.equal(Delve.setting('courage'), 'grows'); assert.equal(Delve.setting('notimer'), false);
  assert.ok(Delve.isOn());
  // the last delve reaches her prompt for a day and a half, then it's old news
  const now = 1e12;
  store.set('jun.delve', JSON.stringify({ last: { at: now - 3600e3, area: 'server_farm', together: true, cleared: true, floors: 3, of: 3, ko: 0, how: 'home', carried: ['scared'], secrets: 1 } }));
  assert.deepEqual(lastDelve(now).carried, ['scared']);
  assert.equal(lastDelve(now).ago, 60);
  assert.equal(lastDelve(now + 40 * 3600e3), null);
  F.setOn('delves', false);
  assert.equal(lastDelve(now), null, 'switched off: she doesn\'t bring it up');
  F.setOn('delves', true);
  // the words her server uses for what she carried home match the data
  const php = read('webapp/api/lib/delve.php');
  const carried = [...php.match(/const DELVE_CARRIED = \[([\s\S]*?)\];/)[1].matchAll(/'(\w+)' =>/g)].map(m => m[1]);
  assert.deepEqual(carried.sort(), Object.keys(data.moments).sort());
  const places = [...php.match(/const DELVE_PLACES = \[([\s\S]*?)\];/)[1].matchAll(/'(\w+)' =>/g)].map(m => m[1]);
  assert.deepEqual(places.sort(), Object.keys(data.areas).sort());
  store.clear();
});
