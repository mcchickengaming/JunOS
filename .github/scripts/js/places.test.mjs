// The game world's map as data: webapp/data/places.json read by webapp/js/core/world/places.js against story state.
// Built Nov 15 so the story engine (#34) adds and unlocks places by data.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const P = await import('../../../webapp/js/core/world/places.js');
const S = await import('../../../webapp/js/core/story/story-state.js');
const read = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');
const data = JSON.parse(read('webapp/data/places.json'));

test('the shipped map is valid, and every page it opens exists', () => {
  assert.deepEqual(P.check(data), []);
  for (const p of data.places) if (p.go?.url) assert.ok(fs.existsSync(new URL('../../../webapp/' + p.go.url.split(/[?#]/)[0], import.meta.url)), p.go.url);
});

test('a fresh game: Home (where the sample story begins) and the delve are open; the story opens the rest', () => {
  const v = P.view(data, S.blank());
  assert.deepEqual(v.map(p => [p.id, p.state]), [['home', 'open'], ['slums', 'locked'], ['scrapyard', 'locked'], ['under_city', 'open'], ['port_buffer', 'locked']]);
  assert.deepEqual(v[0].go, { story: 'home' });
  assert.equal(v[2].line, 'Coming with the story.');
  assert.equal(v[2].go, null);
  // a flag the story sets opens a place; a hidden one shows once its flag is there
  const s = S.blank();
  S.setFlag(s, 'day_started'); S.setFlag(s, 'needs_al');
  const w = P.view(data, s);
  assert.equal(w.find(p => p.id === 'scrapyard').state, 'open');
  assert.equal(w.find(p => p.id === 'als_workshop').state, 'open');
  assert.equal(w.some(p => p.id === 'brandwater_bay'), false);
});

test('conditions read story state: flags, quests, seen, choices, all / any / not', () => {
  const s = S.blank();
  S.setFlag(s, 'met_al'); S.setQuest(s, 'harbor', 'repair'); S.markSeen(s, 'intro'); S.choose(s, 'path', 'sea'); S.setFlag(s, 'mood', 'calm');
  const yes = [true, { flag: 'met_al' }, { flag: 'mood', is: 'calm' }, { quest: 'harbor' }, { quest: 'harbor', step: 'repair' },
    { seen: 'intro' }, { choice: 'path', is: 'sea' }, { all: [{ flag: 'met_al' }, { seen: 'intro' }] }, { any: [{ flag: 'nope' }, { flag: 'met_al' }] }, { not: { flag: 'nope' } }];
  const no = [false, null, { flag: 'nope' }, { flag: 'mood', is: 'angry' }, { quest: 'harbor', step: 'done' }, { questDone: 'harbor' },
    { seen: 'outro' }, { choice: 'path', is: 'land' }, { all: [{ flag: 'met_al' }, { flag: 'nope' }] }, { weird: 1 }];
  for (const c of yes) assert.equal(P.when(c, s), true, JSON.stringify(c));
  for (const c of no) assert.equal(P.when(c, s), false, JSON.stringify(c));
});

test('the story opens a place by data: a flag shows it, a quest opens it, { story } goes to a scene', () => {
  const d = { places: [
    { id: 'yard', name: 'The yard', line: 'Al is here.', lockedLine: 'Locked.', show: { flag: 'heard_of_yard' }, open: { questDone: 'find_al' }, go: { story: 'meet_al' } },
  ] };
  assert.deepEqual(P.check(d), []);
  const s = S.blank();
  assert.equal(P.view(d, s).length, 0, 'hidden until the flag');
  S.setFlag(s, 'heard_of_yard');
  assert.equal(P.view(d, s)[0].state, 'locked');
  assert.equal(P.view(d, s)[0].line, 'Locked.');
  S.finishQuest(s, 'find_al');
  assert.deepEqual(P.view(d, s)[0], { id: 'yard', name: 'The yard', line: 'Al is here.', go: { story: 'meet_al' }, state: 'open' });
});

test('check() catches mistakes', () => {
  const bad = P.check({ places: [
    { id: 'Bad Id', name: 'x', line: 'x' },
    { id: 'a', name: 'A', line: 'a', open: true },
    { id: 'a', name: 'A', line: 'a' },
    { id: 'b', name: 'B', line: 'b', go: { url: 'https://example.com' } },
    { id: 'c', name: 'C', line: 'c', show: { mystery: 'x' } },
  ] });
  assert.equal(bad.length, 5, bad.join('\n'));
});

test('the game world draws the map from the data and opens a door for the story engine', () => {
  const js = read('webapp/js/game-world.js');
  assert.match(js, /data\/places\.json/);
  assert.match(js, /Places\.view\(/);
  assert.match(js, /startStory/);
  assert.match(js, /window\.JunGame = /);
  assert.doesNotMatch(read('webapp/game-world.html'), /goDelve|class="place"/, 'no places typed into the page');
});
