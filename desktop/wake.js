// How long the desktop app waits for her server to wake up, and what the splash says meanwhile.
// NO electron in here: main.js passes in what it sees, so .github/scripts/js/wake.test.mjs runs it in plain node.
//
// Why (Nov 15, the owner's "Jun didn't wake up" after an update): start.ps1 may take up to 30 minutes on its
// own (it waits that long for the model to load, e.g. when a new model or drafter downloads). The app used to
// give up after 4 minutes no matter what, and its "Keep waiting" button quit anyway. Now:
//   - while her start is still working, the app keeps waiting (up to WAIT.maxMs), and the splash says what
//     she's doing in plain words;
//   - it gives up early only when her start clearly stopped: it printed an error and went quiet, or it said
//     "ready" and her server still isn't answering after a while, or it printed nothing at all for a long time;
//   - "Keep waiting" really waits another round, and the server is checked again after every dialog.
'use strict';

const WAIT = {
  maxMs: 35 * 60 * 1000,     // start.ps1's own model deadline is 30 min, plus the rest of the start
  quietMs: 6 * 60 * 1000,    // her start printed nothing new for this long (and isn't loading the model)
  loadQuietMs: 32 * 60 * 1000, // ... while loading the model: start.ps1 prints nothing during its 30 min wait
  readyMs: 2 * 60 * 1000,    // it said "ready" but her server doesn't answer
  errQuietMs: 90 * 1000,     // it printed an error and then nothing more
  askEveryMs: 10 * 60 * 1000, // after an update: how long before offering the version before (then every round)
};

const strip = (t) => String(t || '').replace(/\x1b\[[0-9;]*m/g, '');
const linesOf = (t) => strip(t).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// the step her start is on, from its output (start.ps1 prints "▸ <step>" for each)
function stepOf(out) {
  const lines = linesOf(out);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (/^▸\s*ready\b/i.test(l)) return 'ready';
    if (/^▸/.test(l)) {
      if (/llama|model|ollama/i.test(l)) return 'brain';
      if (/tts|voice/i.test(l)) return 'voice';
      if (/web server|caddy|php/i.test(l)) return 'room';
      return 'other';
    }
  }
  return lines.length ? 'other' : 'none';
}

// a real error: start.ps1's throw lands in the .err log, its Fail_ lines (✗) in the output after the last step;
// warnings (⚠) and notes (ℹ) are not errors
function errorOf(err, out) {
  const lines = linesOf(err).filter(l => !/^(WARNING|VERBOSE)\b/i.test(l));
  if (lines.length) return lines.slice(-3).join('\n');
  const o = linesOf(out);
  let last = -1;
  o.forEach((l, i) => { if (/^▸/.test(l)) last = i; });
  const fails = o.slice(last + 1).filter(l => /^✗/.test(l));
  return fails.length ? fails.slice(-3).join('\n') : '';
}

// the splash line while she wakes
function words(step, elapsedMs, note) {
  const slow = elapsedMs > 90 * 1000;
  const base = note && note.kind === 'update' ? 'Waking Jun up with her update' :
    note && note.kind === 'restore' ? `Waking Jun up, back at “${note.name}”` : 'Waking Jun up';
  const what = {
    brain: slow ? 'Loading her mind… a new model can take a while to download.' : 'Loading her mind…',
    voice: 'Warming up her voice…',
    room: 'Opening her room…',
    ready: 'Almost there…',
  }[step];
  return what ? `${base}. ${what}` : `${base}…`;
}

// wait or give up? s = { elapsedMs, out, err, quietMs (since her start log last changed), readyForMs (since it said ready) }
function verdict(s) {
  const step = stepOf(s.out);
  const error = errorOf(s.err, s.out);
  if (s.elapsedMs > WAIT.maxMs) return { give: true, why: 'too long', step, error };
  if (error && s.quietMs > WAIT.errQuietMs) return { give: true, why: 'error', step, error };
  if (step === 'ready' && (s.readyForMs || 0) > WAIT.readyMs) return { give: true, why: 'ready but not answering', step, error };
  const quietLimit = step === 'brain' ? WAIT.loadQuietMs : WAIT.quietMs;
  if (s.quietMs > quietLimit) return { give: true, why: 'quiet', step, error };
  return { give: false, step, error };
}

module.exports = { WAIT, stepOf, errorOf, words, verdict };
