// waking her server from the desktop app: desktop/wake.js (the rules main.js `waitForHer` follows). No electron.
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../../../desktop/wake.js');
const read = (f) => fs.readFileSync(new URL('../../../' + f, import.meta.url), 'utf8');
const MIN = 60 * 1000;

// what start.ps1 printed on the owner's PC on Nov 15 (colors included)
const C = (t) => `\x1b[38;2;96;205;255m${t}\x1b[0m`;
const LOADING = `  ${C('▸')} \x1b[1mstart llama-server (efficiencyx/Jun-LoRA-E4B-GGUF:Q4_K_M)\x1b[0m\n    ℹ first run downloads the model\n`;
const READY = LOADING + '    ✓ llama-server ready\n  ▸ start TTS sidecar\n    ℹ first run downloads voice models\n' +
  '  ▸ start web server on https://127.0.0.1:8080\n\n  ▸ ready - open https://127.0.0.1:8080\n    ℹ stop with: ./start.ps1 stop\n';

test('the step her start is on', () => {
  assert.equal(W.stepOf(''), 'none');
  assert.equal(W.stepOf(LOADING), 'brain');
  assert.equal(W.stepOf(LOADING + '    ✓ llama-server ready\n  ▸ start TTS sidecar\n'), 'voice');
  assert.equal(W.stepOf(READY.split('\n\n')[0]), 'room');
  assert.equal(W.stepOf(READY), 'ready');
});

test('a slow model load is NOT a failure (the Nov 15 update: 16 minutes)', () => {
  for (const min of [4, 10, 16, 25, 31]) {
    const v = W.verdict({ elapsedMs: min * MIN, out: LOADING, err: '', quietMs: min * MIN });
    assert.equal(v.give, false, `gave up at ${min} min`);
  }
  // start.ps1's own deadline is 30 min, then it moves on; past that plus the rest, the app gives up
  assert.equal(W.verdict({ elapsedMs: 36 * MIN, out: LOADING, err: '', quietMs: 36 * MIN }).give, true);
});

test('gives up early only when her start clearly stopped', () => {
  // an error, then quiet
  const err = 'llama-server is not installed. Run install.ps1 first';
  assert.equal(W.verdict({ elapsedMs: 30 * 1000, out: LOADING, err, quietMs: 30 * 1000 }).give, false);
  const v = W.verdict({ elapsedMs: 3 * MIN, out: LOADING, err, quietMs: 2 * MIN });
  assert.equal(v.give, true); assert.equal(v.why, 'error'); assert.match(v.error, /not installed/);
  // a ✗ line after the last step counts; one before a later step doesn't
  assert.equal(W.errorOf('', LOADING + '    ✗ something broke\n'), '✗ something broke');
  assert.equal(W.errorOf('', LOADING + '    ✗ old\n  ▸ start TTS sidecar\n'), '');
  // warnings are not errors
  assert.equal(W.errorOf('WARNING: slow disk', LOADING + '    ⚠ still isn\'t loaded\n'), '');
  // said ready, server silent
  assert.equal(W.verdict({ elapsedMs: 5 * MIN, out: READY, err: '', quietMs: 1 * MIN, readyForMs: 1 * MIN }).give, false);
  assert.equal(W.verdict({ elapsedMs: 5 * MIN, out: READY, err: '', quietMs: 3 * MIN, readyForMs: 3 * MIN }).give, true);
  // nothing new for a long time, outside the model load
  assert.equal(W.verdict({ elapsedMs: 8 * MIN, out: '', err: '', quietMs: 7 * MIN }).give, true);
  assert.equal(W.verdict({ elapsedMs: 3 * MIN, out: '', err: '', quietMs: 3 * MIN }).give, false);
});

test('the splash says what she is doing, in words', () => {
  assert.match(W.words('brain', 10 * 1000, { kind: 'update' }), /with her update\. Loading her mind…$/);
  assert.match(W.words('brain', 5 * MIN, null), /can take a while/);
  assert.match(W.words('voice', 0, { kind: 'restore', name: 'Sunday' }), /back at “Sunday”\. Warming up her voice/);
  assert.equal(W.words('none', 0, null), 'Waking Jun up…');
});

test('main.js waits with these rules and "Keep waiting" keeps waiting', () => {
  const main = read('desktop/main.js');
  assert.match(main, /require\('\.\/wake'\)/);
  assert.match(main, /async function waitForHer/);
  assert.doesNotMatch(main, /4 \* 60 \* 1000/, 'the old fixed 4-minute limit is gone');
  // after any dialog the server is asked again before giving up
  const body = main.slice(main.indexOf('async function waitForHer'), main.indexOf('function readText'));
  assert.ok((body.match(/await serverUp\(\)/g) || []).length >= 4);
  assert.match(body, /Keep waiting/);
});
