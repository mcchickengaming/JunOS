// how she feels about a touch (webapp/js/desktop/moods.js): the right
// feeling per touch, bond, mood and length, so the effects match what
// her body does (body.js). no DOM needed for the rules.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../../../webapp/js/desktop/moods.js');
const f = (kind, how, ms, stage, mood = 'neutral') => M.feelingFor(kind, how, ms, { stage, mood })?.feeling ?? null;

test('touch is earned: shy touches are "not ready" early on', () => {
  for (const k of ['tailgrab', 'thighsquish', 'footrub', 'thigh']) assert.equal(f(k, 'hold', 500, 1), 'notready', k);
  assert.equal(f('tail', 'poke', 0, 2), 'notready');
  assert.equal(f('hug', 'hold', 1000, 1), 'notready');
  assert.equal(f('hug', 'hold', 3000, 1), 'flustered');
});

test('the same touch warms up with the bond', () => {
  assert.equal(f('head', 'hold', 1000, 1), 'flustered');
  assert.equal(f('head', 'hold', 1000, 3), 'likes');
  assert.equal(f('head', 'hold', 1000, 4), 'loves');
  assert.equal(f('thighsquish', 'hold', 1000, 3), 'flustered');
  assert.equal(f('thighsquish', 'hold', 5000, 5), 'loves');
});

test('a change of heart over a long touch, like her body', () => {
  // a friend: giggles at a foot tickle, then has had enough (body.js pulls the foot at ~3 s)
  assert.equal(f('feettickle', 'hold', 1000, 3), 'giggly');
  assert.equal(f('feettickle', 'hold', 2800, 3), 'notready');
  // close: takes a real tickle fight
  assert.equal(f('feettickle', 'hold', 4000, 4), 'giggly');
  // a friend's thigh squish: holds still, flustered, then wants out (wriggle from 3.2 s)
  assert.equal(f('thighsquish', 'hold', 2000, 3), 'flustered');
  assert.equal(f('thighsquish', 'hold', 4000, 3), 'notready');
});

test('a bad mood takes the edge off', () => {
  assert.equal(f('hug', 'hold', 3000, 5, 'upset'), 'likes');
  assert.equal(f('head', 'hold', 1000, 3, 'scared'), 'flustered');
  assert.equal(f('nose', 'poke', 0, 3, 'upset'), 'flustered');
});

test('power grows with the length and the bond, within 0..1', () => {
  const p = (ms, stage) => M.feelingFor('head', 'hold', ms, { stage, mood: 'neutral' }).power;
  assert.ok(p(8000, 3) > p(0, 3));
  assert.ok(p(0, 6) > p(0, 1));
  assert.ok(p(60000, 6) <= 1 && p(0, 1) >= 0.1);
});

test('touches she has no feeling about give nothing', () => {
  assert.equal(M.feelingFor('waveback', 'poke', 0, { stage: 3 }), null);
  assert.equal(M.feelingFor('body', 'hold', 1000, { stage: 3 }), null);
});
