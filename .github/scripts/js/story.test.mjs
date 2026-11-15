// story state + difficulty (#35 b): the store the story-event engine sits on (flags, quests, seen, choices, agreements,
// difficulty, the save card), cleaning anything from a save, the door through game saves (epoch included); the presets
// (Easy = the old kind danger, exactly), "she saves you" (the bond and her Support skill, never a penalty), the delve on
// every preset (game over or her care, traps never the last of your health, backing off still works); and the gate's
// "agreed beforehand" kind fed from story state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../webapp/', import.meta.url);
const S = await import(new URL('js/core/story/story-state.js', root));
const D = await import(new URL('js/core/difficulty.js', root));
const Gate = await import(new URL('js/core/gate.js', root));
const Run = await import(new URL('js/core/delve/run.js', root));
const Sim = await import(new URL('js/core/delve/sim.js', root));
const Enc = await import(new URL('js/core/delve/encounter.js', root));
const dd = JSON.parse(readFileSync(new URL('data/difficulty.json', root), 'utf8'));
const delve = JSON.parse(readFileSync(new URL('data/delve.json', root), 'utf8'));
const reg = JSON.parse(readFileSync(new URL('data/features.json', root), 'utf8'));

// ---------------------------------------------------------------- story state

test('flags, counters, quests, seen and choices, each change logged', () => {
  const s = S.blank();
  S.setFlag(s, 'met_al', true, 10);
  S.addTo(s, 'al_trust', 2, 11); S.addTo(s, 'al_trust', 1, 12);
  S.setQuest(s, 'act1.harbor', 'find_wood', 13);
  S.finishQuest(s, 'act1.scrapyard', 14);
  S.markSeen(s, 'act1:intro', 15); S.markSeen(s, 'act1:intro', 16);
  S.choose(s, 'jester_fate', 'spared', 17);
  assert.equal(S.has(s, 'met_al'), true);
  assert.equal(S.flag(s, 'al_trust'), 3);
  assert.equal(S.flag(s, 'nope', 'dflt'), 'dflt');
  assert.equal(S.questStep(s, 'act1.harbor'), 'find_wood');
  assert.equal(S.questDone(s, 'act1.scrapyard'), true);
  assert.equal(S.seenCount(s, 'act1:intro'), 2);
  assert.equal(S.chose(s, 'jester_fate'), 'spared');
  assert.deepEqual(s.log.map(e => e.kind), ['flag', 'flag', 'flag', 'quest', 'quest_done', 'seen', 'choice'], 'seeing it twice logs once');
  S.setFlag(s, 'met_al', true, 20);
  assert.equal(s.log.length, 7, 'the same value again changes nothing');
  S.clearFlag(s, 'met_al', 21);
  assert.equal(S.has(s, 'met_al'), false);
});

test('ids and values stay small and plain', () => {
  const s = S.blank();
  assert.throws(() => S.setFlag(s, 'Met Al', true));
  assert.throws(() => S.setFlag(s, '../x', true));
  assert.throws(() => S.setFlag(s, 'x', { deep: 1 }));
  assert.throws(() => S.setFlag(s, 'x', 'y'.repeat(S.VALUE_MAX + 1)));
  assert.throws(() => S.choose(s, 'x', 'Not An Id'));
  assert.ok(S.isId('act1.scrapyard:met_al-2'));
});

test('the log keeps only the last few hundred changes', () => {
  const s = S.blank();
  for (let i = 0; i < S.LOG_MAX + 50; i++) S.setFlag(s, 'n', i, i);
  assert.equal(s.log.length, S.LOG_MAX);
  assert.equal(s.log.at(-1).v, S.LOG_MAX + 49);
});

test('anything from a save or an upload is cleaned', () => {
  const s = S.clean({
    flags: { ok: true, 'Bad Id': 1, big: 'x'.repeat(500), obj: { a: 1 }, n: 3 },
    quests: { q: { step: 2, done: 1, at: 5 }, bad: 'no' },
    seen: { a: 2, b: -1, c: 'x' },
    choices: { c: 'spared', d: 'Not ok' },
    agreements: { cuddles: { given: true, at: 9 }, old: { given: false, at: 1, revokedAt: 2 } },
    difficulty: 'nightmare', place: 'Port\nBuffer', chapter: 'Act 1', log: [{ id: 'x', kind: 'flag' }, 'junk'],
    sneaky: 'dropped',
  }, D.ids(dd), 'easy');
  assert.deepEqual(s.flags, { ok: true, n: 3 });
  assert.deepEqual(s.quests, { q: { step: 2, done: true, at: 5 } });
  assert.deepEqual(s.seen, { a: 2 });
  assert.deepEqual(s.choices, { c: 'spared' });
  assert.equal(S.agreement(s, 'cuddles'), 'given');
  assert.equal(S.agreement(s, 'old'), 'revoked');
  assert.equal(s.difficulty, 'easy', 'an unknown difficulty falls back');
  assert.equal(s.place, 'Port Buffer');
  assert.equal(s.log.length, 1);
  assert.ok(!('sneaky' in s));
  assert.deepEqual(S.clean(null).flags, {});
});

test('the save card in words: place, chapter, difficulty', () => {
  const s = S.blank('hard');
  S.setPlace(s, 'Port Buffer', 'Act 1', 5);
  assert.deepEqual(S.summary(s, 'Hard'), { place: 'Port Buffer', chapter: 'Act 1', difficulty: 'Hard' });
  S.setPlace(s, 'The scrapyard');
  assert.equal(s.chapter, 'Act 1', 'the chapter stays when only the place moves');
});

test('the door: open reads the story section, commit writes it back with the epoch it read + the card', async () => {
  const sent = [];
  const fake = {
    section: async (name) => ({ data: name === 'story' ? { flags: { met_al: true }, difficulty: 'medium' } : null, epoch: 4 }),
    put: async (sections, o) => { sent.push({ sections, o }); return { ok: true }; },
  };
  const st = await S.open(fake, { difficultyIds: D.ids(dd) });
  assert.equal(st.epoch, 4);
  assert.equal(S.has(st.state, 'met_al'), true);
  assert.equal(st.state.difficulty, 'medium');
  S.setPlace(st.state, 'The scrapyard', 'Act 1');
  await S.commit(fake, st.state, st.epoch, 'Medium');
  assert.equal(sent[0].o.epoch, 4);
  assert.deepEqual(sent[0].sections.story._summary, { place: 'The scrapyard', chapter: 'Act 1', difficulty: 'Medium' });
  const off = await S.open({ section: async () => ({ off: true, data: null }) });
  assert.equal(off.off, true);
  assert.deepEqual(off.state.flags, {});
});

// ---------------------------------------------------------------- difficulty

test('four presets, Easy by default (the harder ones are for those who want it)', () => {
  assert.deepEqual(D.ids(dd), ['easy', 'medium', 'hard', 'extreme']);
  assert.equal(D.defaultId(dd), 'easy');
  for (const id of D.ids(dd)) {
    const p = D.preset(dd, id);
    assert.ok(p.name && p.line, id + ' has words');
    assert.ok(['care', 'gameover'].includes(p.knockout));
  }
  assert.equal(D.preset(dd, 'nope').id, 'easy', 'an unknown preset is the default');
});

test('Easy is the old kind danger, exactly: the same creatures, the care scene, she always reaches you', () => {
  const e = D.preset(dd, 'easy');
  assert.deepEqual([e.knockout, e.foe.hp, e.foe.atk, e.trap, e.quality], ['care', 1, 1, 1, 0]);
  assert.equal(D.saveChance(e, { stage: 1, support: 1, together: false }), 1);
  const o = { area: 'server_farm', together: true, levels: { player: { delving: 1 }, jun: { delving: 1 } } };
  const a = Sim.many(delve, o, 25), b = Sim.many(delve, { ...o, difficulty: e }, 25);
  assert.deepEqual(a, b, 'a delve on Easy plays exactly like one with no preset');
});

test('harder presets are harder, step by step', () => {
  const ps = D.ids(dd).map(id => D.preset(dd, id));
  for (let i = 1; i < ps.length; i++) {
    assert.ok(ps[i].foe.hp >= ps[i - 1].foe.hp && ps[i].foe.atk >= ps[i - 1].foe.atk && ps[i].trap >= ps[i - 1].trap, ps[i].id);
    assert.ok(ps[i].saves.cap <= ps[i - 1].saves.cap, ps[i].id + ': she reaches you less often');
    assert.ok(ps[i].quality >= ps[i - 1].quality, ps[i].id + ': and it counts a little more');
  }
  for (const p of ps.slice(1)) assert.equal(p.knockout, 'gameover');
});

test('she saves you: more with the bond and her Support skill, less when she stayed home, never above the cap', () => {
  for (const id of ['medium', 'hard', 'extreme']) {
    const p = D.preset(dd, id);
    const at = (stage, support, together = true) => D.saveChance(p, { stage, support, together });
    assert.ok(at(6, 1) > at(1, 1), id + ': the bond helps');
    assert.ok(at(1, 99) > at(1, 1), id + ': her Support skill helps');
    assert.ok(at(3, 30, false) < at(3, 30, true), id + ': less from home');
    assert.ok(at(6, 99) <= p.saves.cap);
    assert.ok(at(1, 1) >= 0);
  }
  assert.equal(D.chanceWords(1), 'every time');
  assert.equal(D.chanceWords(0.5), 'about half the time');
  assert.equal(D.chanceWords(0), 'never');
});

// ---------------------------------------------------------------- the delve on every preset

test('a knock-out on Easy is her care scene, as always', () => {
  const { run } = Run.start(delve, { area: 'server_farm', seed: 1, difficulty: D.preset(dd, 'easy') });
  const evs = endWithKo(run);
  assert.deepEqual(evs.map(e => e.type), ['fight_over', 'ko']);
  assert.equal(run.state, 'ko');
});

// Run.endFight reads Enc.result(run.enc); a tiny finished fight where you went down
function endWithKo(run) {
  run.enc = Enc.create(delve, { us: Run.fighters(delve, run), them: [], pace: 'turn', seed: run.seed });
  for (const u of run.enc.units) if (u.ctl === 'you') { u.hp = 0; u.out = true; }
  run.enc.over = 'ko';
  run.state = 'fight'; run.fightAt = 'x';
  return Run.endFight(delve, run);
}

test('on a harder preset a knock-out is a game over unless she reaches you; both happen, by her chance', () => {
  const p = D.preset(dd, 'hard');
  let over = 0, saved = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { run } = Run.start(delve, { area: 'server_farm', seed, stage: 4, levels: { player: { delving: 1 }, jun: { delving: 1, support: 20 } }, difficulty: p });
    const evs = endWithKo(run);
    const types = evs.map(e => e.type);
    if (types.includes('gameover')) {
      over++;
      assert.equal(run.state, 'over');
      assert.equal(run.outcome.how, 'gameover');
      assert.equal(run.outcome.gameOver, true);
      assert.ok(types.includes('left'), 'a game over ends the delve like heading home (the time still counts)');
    } else {
      saved++;
      assert.equal(run.state, 'ko');
      assert.equal(evs.find(e => e.type === 'ko').saved, true);
    }
  }
  const want = D.saveChance(p, { stage: 4, support: 20 });
  assert.ok(over > 0 && saved > 0, 'both happen');
  assert.ok(Math.abs(saved / 80 - want) < 0.2, `she saves you about ${Math.round(want * 100)}% of the time (got ${saved}/80)`);
});

test('the same seed, the same fate (a delve replays)', () => {
  const p = D.preset(dd, 'extreme');
  const fate = () => { const { run } = Run.start(delve, { area: 'server_farm', seed: 42, difficulty: p }); return endWithKo(run).map(e => e.type).join(); };
  assert.equal(fate(), fate());
});

test('on every preset a trap never takes the last of your health', () => {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  let tried = 0;
  for (const id of D.ids(dd)) for (let seed = 1; seed < 60 && tried < 12; seed++) {
    const { run } = Run.start(delve, { area: 'server_farm', seed, together: false, difficulty: D.preset(dd, id), mobs: false });
    const trap = Run.floorOf(delve, run).things.find(t => t.kind === 'trap');
    if (!trap) continue;
    // stand next to it, facing it, with very little health left
    for (let d = 0; d < 4; d++) {
      const x = trap.x - DX[d], y = trap.y - DY[d];
      if (Run.cellAt(delve, run, x, y) === Run.WALL || Run.thingAt(delve, run, x, y)) continue;
      run.pos = { x, y, d }; run.hp.you.hp = 2; delete run.done[trap.id];
      const evs = Run.step(delve, run, 0);
      if (!evs.some(e => e.type === 'trap')) continue;
      assert.ok(run.hp.you.hp >= 1, id + ': never the last of it');
      tried++;
      break;
    }
  }
  assert.ok(tried >= 4, 'found traps to step on');
});

test('backing off still works on Extreme', () => {
  const { run } = Run.start(delve, { area: 'server_farm', seed: 9, difficulty: D.preset(dd, 'extreme') });
  run.enc = Enc.create(delve, { us: Run.fighters(delve, run), them: [], pace: 'turn', seed: 9 });
  run.enc.over = 'fled'; run.state = 'fight'; run.fightAt = 'x';
  Run.endFight(delve, run);
  assert.equal(run.state, 'walk');
  assert.equal(run.done.x, 'fled');
});

test('creatures are tougher on harder presets', () => {
  const at = (id) => { const { run } = Run.start(delve, { area: 'server_farm', seed: 1, difficulty: D.preset(dd, id) }); return run; };
  const easy = at('easy'), hard = at('hard');
  assert.equal(easy.setup.diff.foe.hp, 1);
  assert.ok(hard.setup.diff.foe.hp > 1 && hard.setup.diff.trap > 1);
});

test('the time-lapse counts saves and game overs', () => {
  const m = Sim.many(delve, { area: 'flooded_factory', together: true, levels: { player: { delving: 1 }, jun: { delving: 1, support: 1 } }, difficulty: D.preset(dd, 'medium') }, 20);
  assert.ok('gameOver' in m && 'saved' in m);
  assert.ok(m.gameOver + m.saved > 0, 'a hard place at level 1 knocks you out sometimes');
});

// ---------------------------------------------------------------- the gate's "agreed beforehand", from story state

test('agreed beforehand in the game: story state feeds the gate; once agreed it stays agreed', () => {
  const s = S.blank();
  const item = { tier: 'flirty', consent: 'beforehand', agreement: 'asleep_cuddles' };
  const ctx = (extra) => ({ comfort: {}, stage: 4, trust: 60, agreements: S.agreementsFor(s), ...extra });   // the game passes no awake / stop
  assert.equal(Gate.check(item, ctx()).her, 'no', 'never asked');
  S.agree(s, 'asleep_cuddles', 100);
  S.agree(s, 'asleep_cuddles', 200);
  assert.equal(s.agreements.asleep_cuddles.at, 100, 'agreeing again changes nothing');
  assert.deepEqual([Gate.check(item, ctx()).her, Gate.check(item, ctx()).why], ['yes', 'agreed']);
  assert.equal(typeof S.revoke, 'undefined', 'no taking back in the game');
  assert.equal(Gate.check(item, ctx({ comfort: { flirty: false } })).show, false, 'the Flirty switch still decides');
  const old = S.clean({ agreements: { x: { given: false, at: 1, revokedAt: 2 } } });
  assert.equal(S.agreement(old, 'x'), 'revoked', 'an old save that says revoked is read as revoked');
});

// ---------------------------------------------------------------- the registry

test('the registry: The game section, difficulty, and the game saves moved into it', () => {
  assert.match(reg.sections.game, /^The game/);   // since Nov 15: the game's own menu, inside the game world
  const by = Object.fromEntries(reg.features.map(f => [f.id, f]));
  assert.equal(by.difficulty.section, 'game');
  assert.equal(by.difficulty.default, dd.default);
  assert.equal(by.game_saves.section, 'game');
  assert.equal(by.game_autosave.section, 'game');
});
