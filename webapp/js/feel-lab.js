// the feel lab (#27): her inside state live (webapp/js/core/feel/), a dry-run "try a touch"
// through the reaction composer, and every number of core feel to tune live. A plain dev panel;
// the diegetic version (her console, #19) comes later and can show the same snapshot().

import * as Feel from './core/feel/feel.js?v=4';
import * as Moods from './desktop/moods.js?v=16';

const { Needs, Tired, Repeat, Session, Tune, Kinds, Store, Initiative: Init, Room } = Feel;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const ago = (at) => { const s = Math.round((Date.now() - at) / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; };

if (!/Electron/i.test(navigator.userAgent)) $('where').hidden = false;

const STAGES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];
const MOODS = ['neutral', 'happy', 'nervous', 'upset', 'scared'];
const FEEL_NAMES = Object.fromEntries(Moods.FEELINGS.map(([k, name]) => [k, name]));
// the touches you can try: holds/rubs by their moods.js name, pokes by their spot
const HOLDS = ['head', 'ear', 'side', 'feettickle', 'footrub', 'thigh', 'thighsquish', 'tail', 'tailgrab', 'hand', 'hug'];
const POKES = ['head', 'cheek', 'nose', 'ear', 'shoulder', 'tail', 'hand', 'side', 'thigh', 'feet'];

// ---------------------------------------------------------------------------------------------
// live state

function drawNeeds(s) {
  const host = $('needs');
  if (!host.children.length) {
    for (const k of Needs.NEEDS) {
      const r = document.createElement('div');
      r.className = 'need';
      r.innerHTML = `<span>${esc(Needs.NAMES[k])}</span><span class="bar"><i></i></span><input type="number" min="0" max="1" step="0.05" aria-label="${esc(Needs.NAMES[k])}"><small></small>`;
      const inp = r.querySelector('input');
      inp.addEventListener('change', () => { Needs.setLevel(k, Number(inp.value)); Store.flush(); draw(); });
      r.dataset.need = k;
      host.appendChild(r);
    }
  }
  for (const r of host.children) {
    const k = r.dataset.need, v = s.needs[k];
    r.querySelector('i').style.width = Math.round(v * 100) + '%';
    const inp = r.querySelector('input');
    if (document.activeElement !== inp) inp.value = n2(v);
    r.querySelector('small').textContent = Needs.words(k, v) ? 'She ' + Needs.words(k, v) + '.' : 'Content.';
  }
}

function drawNow(s) {
  $('phase').textContent = Session.PHASE_WORDS[s.phase] || s.phase;
  const rows = [
    ['Strongest want', s.top ? Needs.NAMES[s.top] : 'none, she\'s content'],
    ['Mood (from her gauges)', s.mood],
    ['Going on together', n2(s.engagement) + ' (peak at ' + Tune.get('session.peakAt') + ')'],
    ['This session since', s.session.at ? ago(s.session.at) + ' ago' : '—'],
    ['Away before it', s.session.awayMs ? Math.round(s.session.awayMs / 60000) + ' min' : '—'],
    ['Hands on her now', s.going.length ? s.going.map(g => g.kind + ' ' + Math.round(g.ms / 1000) + ' s').join(', ') : 'none'],
    ['Building-up moment', s.building ? 'open' : 'no'],
  ];
  $('now').innerHTML = rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('');
  const sw = s.switches;
  $('switches').innerHTML = [['needs', 'Her needs'], ['tiring', 'Getting tired'], ['favorites', 'Favorites'], ['repeat', 'Mixes it up'],
    ['manner', 'Gentle or rough'], ['anticipate', 'Sees your hand'], ['initiative', 'Starts things']]
    .map(([k, name]) => `<span class="chip">${esc(name)}: ${sw[k] ? 'on' : 'off'}</span>`).join('')
    + `<span class="chip">How quickly she's had enough: ${sw.pace}%</span>`;
}

function drawTired(s) {
  $('tired').innerHTML = s.tired.map(x => `<tr><td>${esc(Kinds.wordsOf(x.kind) || x.kind)}</td>`
    + `<td class="st-${x.state}">${esc(Tired.STATE_WORDS[x.state])}</td><td class="num">${n2(x.load)}</td>`
    + `<td class="num">${n2(x.fav)}</td><td class="num">${Math.round(x.factor * 100)}%</td></tr>`).join('');
  $('tiredNone').hidden = s.tired.length > 0;
}

function drawFavs(s) {
  const ctx = { mood: s.mood, needs: s.needs };
  const list = HOLDS.map(k => [k, Tired.fav(k, ctx)]).sort((a, b) => b[1] - a[1]);
  $('favs').innerHTML = list.map(([k, v]) => `<tr><td>${esc(Kinds.wordsOf(k))}</td><td class="num">${n2(v)}</td>`
    + `<td>${v >= 1.15 ? 'a favorite' : v <= 0.85 ? 'not her favorite' : ''}</td></tr>`).join('');
}

function drawRepeat(s) {
  const ch = Object.entries(s.repeat).filter(([, l]) => l.length);
  $('repeat').innerHTML = ch.length
    ? ch.map(([c, l]) => `<p class="note"><b>${esc(c)}</b></p><div class="chips">${l.map(id => `<span class="chip">${esc(id)}</span>`).join('')}</div>`).join('')
    : '<p class="note">Nothing remembered right now.</p>';
}

function drawHist(s) {
  $('hist').innerHTML = s.hist.length
    ? '<table>' + s.hist.slice().reverse().map(([at, type, kind, ms]) => `<tr><td>${ago(at)}</td><td>${esc(type)}</td>`
      + `<td>${esc(kind ? Kinds.wordsOf(kind) || kind : '')}</td><td class="num">${ms ? Math.round(ms / 1000) + ' s' : ''}</td></tr>`).join('') + '</table>'
    : '<p class="note">Nothing yet.</p>';
}

// what she starts on her own (initiative.js): her wants, the room as she reads it, what she did
const iBuilt = {};
function drawInit(s) {
  const i = s.init;
  $('iLine').textContent = Init.describeLive();
  for (const id of Init.IDS) {
    if (!iBuilt[id]) {
      const r = document.createElement('div');
      r.className = 'need';
      r.innerHTML = `<span>${esc(Init.ACTIONS[id].name)}</span><div class="bar"><i></i></div><input type="number" min="0" max="1" step="0.05" aria-label="${esc(Init.ACTIONS[id].name)}"><small></small>`;
      r.querySelector('input').addEventListener('change', (e) => { Init.setWant(id, Number(e.target.value)); draw(); });
      $('iWants').append(r);
      iBuilt[id] = r;
    }
    const r = iBuilt[id], v = i.wants[id] || 0;
    r.querySelector('i').style.width = Math.round(v * 100) + '%';
    const inp = r.querySelector('input');
    if (document.activeElement !== inp) inp.value = n2(v);
    const cap = Init.ACTIONS[id].cap[i.stage || s.stage] || 0;
    r.querySelector('small').textContent = (cap ? 'At this bond she goes as far as: ' + Init.RUNG_WORDS[cap] : 'Not at this bond yet')
      + (i.cool[id] > 0 ? ' · not again for ' + Math.ceil(i.cool[id] / 60000) + ' min' : '')
      + (Math.abs(i.learned[id] - 1) > 0.02 ? ' · learned ×' + n2(i.learned[id]) : '');
  }
  const room = i.room;
  const rows = [
    ['Her mood of the day', i.opts.asFeels ? Init.DAY_MOODS[i.day].words : 'steady ("As she feels" is off)'],
    ['The room', room ? (Room.WHY[room.why] || room.why) + ' → at most: ' + Init.RUNG_WORDS[room.cap] + (room.at ? ' (' + ago(room.at) + ' ago)' : '') : 'not read yet (she isn\'t out on the desktop)'],
    ['Bond stage', i.stage ? STAGES[i.stage - 1] : 'not known yet (she isn\'t out on the desktop)'],
    ['Right now', i.ep ? 'waiting for an answer: ' + Init.ACTIONS[i.ep.id].name + ' (' + Init.RUNG_WORDS[i.ep.rung] + ')' : i.sulking ? 'sulking a little' : 'nothing open'],
    ['Today\'s attention budget', n2(i.used) + ' of ' + n2(i.budget) + ' used'],
    ['Promise', i.promise ? '"later": ' + Init.ACTIONS[i.promise.id].name : 'none'],
  ];
  $('iRoom').innerHTML = rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('');
  const log = i.log.slice().reverse();
  $('iLog').innerHTML = log.length ? log.map(e => `<li>${ago(e.at)} ago: ${esc(Init.whyLine(e))}</li>`).join('') : '<li>Nothing yet.</li>';
}
$('iClear').addEventListener('click', () => { Init.clearCooldowns(); draw(); });

// the time-lapse: a day of her decisions with a made-up him (initiative.js simulate)
for (const [id, h] of Object.entries(Init.HIM)) $('lHim').add(new Option(h.name, id));
STAGES.forEach((name, i) => $('lStage').add(new Option(name, String(i + 1), i === 3, i === 3)));
for (const [id, m] of Object.entries(Init.DAY_MOODS)) $('lDay').add(new Option(m.words, id));
const lYes = () => Number($('lYes').value) / 100;
const lShowYes = () => { $('lYesOut').textContent = Math.round(lYes() * 100) + '% of the times you notice'; };
$('lYes').addEventListener('input', lShowYes);
lShowYes();
let lSeed = Math.floor(Math.random() * 1e6);
const lOpts = (seed) => ({ seed, him: $('lHim').value, stage: Number($('lStage').value), day: $('lDay').value || null, opts: Init.opts(), yes: lYes(), no: Math.max(0.05, (1 - lYes()) * 0.45) });
function lFlags(flags) {
  $('lFlags').innerHTML = flags.length ? flags.map(f => `<p class="warn">⚠ ${esc(f)}</p>`).join('') : '<p class="note">Nothing stood out: no nagging, no dead stretch, no repeats.</p>';
}
$('lRun').addEventListener('click', () => {
  const r = Init.simulate(lOpts(lSeed++));
  lFlags(r.flags);
  const c = r.counts;
  $('lSum').innerHTML = [
    ['Her mood that day', Init.DAY_MOODS[r.day].words],
    ['Things she started', c.starts + ' (' + Object.entries(c.byAction).map(([k, v]) => v + ' × ' + Init.ACTIONS[k].name).join(', ') + ')'],
    ['How loud', Init.RUNG_WORDS.map((w, i) => (i && c.byRung[i] ? c.byRung[i] + ' × ' + w : '')).filter(Boolean).join(', ') || '—'],
    ['Your answers', c.yes + ' yes, ' + c.no + ' no, ' + c.ignored + ' unnoticed'],
    ['Attention budget', r.used + ' of ' + n2(r.budget * Math.max(0.2, Init.mul(Init.opts().often, 2)))],
  ].map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('');
  const max = Math.max(1, ...r.perHour.map(h => h.n));
  $('lHours').innerHTML = r.perHour.map(h => `<div title="${esc(h.h)}: ${h.n} things, ${h.loud} of them loud" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">`
    + `<div style="height:${Math.round(h.n / max * 100)}%;background:var(--bar);border-radius:3px 3px 0 0;min-height:${h.n ? 3 : 0}px"></div>`
    + `<small style="font-size:9px;color:var(--dim);text-align:center">${esc(h.h.slice(0, 2))}</small></div>`).join('');
  $('lEvents').innerHTML = '<table>' + r.events.map(e => `<tr><td class="num">${esc(e.t)}</td><td>${esc(e.text)}</td></tr>`).join('') + '</table>';
});
$('lMany').addEventListener('click', () => {
  const N = 30, sum = { starts: 0, yes: 0, no: 0, ignored: 0, loud: 0, asks: 0 }, flags = {};
  for (let i = 0; i < N; i++) {
    const r = Init.simulate(lOpts(lSeed++));
    sum.starts += r.counts.starts; sum.yes += r.counts.yes; sum.no += r.counts.no; sum.ignored += r.counts.ignored;
    sum.loud += r.perHour.reduce((a, h) => a + h.loud, 0); sum.asks += r.counts.byRung[5];
    for (const f of r.flags) { const k = f.replace(/\d+:\d+|\d+/g, '…'); flags[k] = (flags[k] || 0) + 1; }
  }
  const per = (v) => (v / N).toFixed(1);
  lFlags(Object.entries(flags).map(([k, n]) => `On ${n} of ${N} days: ${k}`));
  $('lSum').innerHTML = [
    ['On an average day she starts', per(sum.starts) + ' things'],
    ['...of which she comes over, speaks up or asks', per(sum.loud) + ' times'],
    ['...and asks you outright', per(sum.asks) + ' times'],
    ['Your answers', per(sum.yes) + ' yes, ' + per(sum.no) + ' no, ' + per(sum.ignored) + ' unnoticed'],
  ].map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('');
  $('lHours').innerHTML = '';
  $('lEvents').innerHTML = '';
});

function draw() {
  const s = Feel.snapshot();
  drawNeeds(s); drawNow(s); drawTired(s); drawFavs(s); drawRepeat(s); drawHist(s); drawInit(s);
  tryIt();
}

// ---------------------------------------------------------------------------------------------
// try a touch (a dry run: nothing changes in her unless "Do it for real")

function fillTry() {
  const kind = $('tKind');
  const how = $('tHow').value;
  const list = how === 'poke' ? POKES : HOLDS;
  const was = kind.value;
  kind.innerHTML = list.map(k => `<option value="${k}">${esc(Kinds.wordsOf(how === 'poke' ? 'poke.' + k : k) || k)}</option>`).join('');
  if (list.includes(was)) kind.value = was;
  $('tMs').disabled = how === 'poke';
}
$('tStage').innerHTML = STAGES.map((n, i) => `<option value="${i + 1}"${i === 3 ? ' selected' : ''}>${n}</option>`).join('');
$('tMood').innerHTML = MOODS.map(m => `<option>${m}</option>`).join('');
$('tHow').addEventListener('change', () => { fillTry(); tryIt(); });
$('tPhase').innerHTML += Session.PHASES.filter(p => p !== 'away').map(p => `<option value="${p}">${esc(Session.PHASE_WORDS[p])}</option>`).join('');
for (const id of ['tKind', 'tMs', 'tStage', 'tMood', 'tManner', 'tMannerMs', 'tMoment', 'tPhase', 'aSpeed']) $(id).addEventListener('input', tryIt);
fillTry();

let SEED = 0.5;
$('reroll').addEventListener('click', () => { SEED = Math.random(); tryIt(); });
const SPOT_OF = { footrub: 'feet', feettickle: 'feet', thighsquish: 'thigh', tailrub: 'tail', tailgrab: 'tail', hug: 'body' };
function tryIt() {
  const how = $('tHow').value, kind = $('tKind').value;
  const ms = how === 'poke' ? 0 : Number($('tMs').value);
  $('tMsOut').textContent = (ms / 1000).toFixed(1) + ' s';
  const ctx = { stage: Number($('tStage').value), mood: $('tMood').value };
  const base = Moods.feelingFor(kind, how, ms, ctx, SEED);
  const show = (f) => (f ? `<b>${esc(FEEL_NAMES[f.feeling] || f.feeling)}</b>, power ${n2(f.power)}` : 'No feeling about this one.');
  $('rBase').innerHTML = show(base);
  const ck = how === 'poke' ? 'poke.' + kind : kind;
  // how it's done, and what just happened: "what if", or as it really is
  const pace = $('tManner').value, forMs = Number($('tMannerMs').value);
  $('tManner').disabled = $('tMannerMs').disabled = how === 'poke';
  $('tMannerOut').textContent = (forMs / 1000).toFixed(1) + ' s';
  const manner = how === 'poke' ? null : Feel.Manner.named(pace, forMs);
  const mom = $('tMoment').value, ph = $('tPhase').value;
  const force = mom || ph ? { ...(mom ? { moment: mom === 'none' ? [] : [mom] } : {}), ...(ph ? { phase: ph } : {}) } : null;
  // dry: only look. nothing here is remembered or counts toward her state
  const comp = base ? Feel.compose({ kind: ck, how, ms, seed: SEED, base, ctx, manner, force, dry: true }) : null;
  $('rComp').innerHTML = show(comp) + (comp ? ` · ${esc(Tired.STATE_WORDS[comp.tired])}` : '');
  $('rWhy').innerHTML = (comp?.why?.length ? comp.why : ['nothing changed it']).map(w => `<li>${esc(w)}</li>`).join('');
  const pieces = comp?.pieces ? Object.entries(comp.pieces).map(([p, k]) => `${esc(p)} ×${n2(k)}`).join(', ') : 'as usual';
  $('rStyle').innerHTML = comp ? [
    ['Her body shows it', comp.variant === 'plain' ? 'her usual way' : comp.variant],
    ['If she says something', Feel.Compose.LINE_WORDS[comp.line] || comp.line],
    ['Tempo of her effects', comp.tempo > 1.05 ? `calmer (×${n2(comp.tempo)})` : comp.tempo < 0.95 ? `quicker (×${n2(comp.tempo)})` : 'as usual'],
    ['Effect pieces', pieces],
    ['Her own ripple', comp.ripple ? Object.values(comp.ripple).join(' + ') : 'yours, this time'],
    ['Moment', comp.moment.length ? comp.moment.join(', ') : 'nothing special'],
  ].map(([k, v]) => `<div><span class="note">${esc(k)}:</span> <b>${esc(v)}</b></div>`).join('') : '';
  // the hand coming at this spot (dry: the cooldown and her "not every time" are left out)
  const fast = $('aSpeed').value === 'fast';
  const ap = Feel.Approach.decide({
    spot: SPOT_OF[kind] || kind, dist: 0.1, closing: fast ? Feel.Tune.TUNE.approach.fast * 1.3 : Feel.Tune.TUNE.approach.minClosing * 2, side: 1,
    ctx, needs: Feel.switches().needs ? Feel.Needs.levels() : {}, dry: true, rand: () => (SEED * 7.31) % 1,
  });
  $('rApproach').innerHTML = !Feel.switches().anticipate ? 'Switched off.' : ap ? `<b>${esc(Feel.Approach.TYPE_WORDS[ap.type])}</b>, power ${n2(ap.power)}` : 'Nothing this time.';
  $('rApproachWhy').innerHTML = (ap?.why || []).slice(1).map(w => `<li>${esc(w)}</li>`).join('');
}
$('doIt').addEventListener('click', () => {
  const how = $('tHow').value, kind = $('tKind').value;
  if (how === 'poke') Feel.poke(kind); else Feel.held(kind, Number($('tMs').value));
  Store.flush();
  draw();
});

// ---------------------------------------------------------------------------------------------
// tune

function drawTune() {
  const f = $('tuneFilter').value.trim().toLowerCase();
  const changed = Tune.changed();
  const rows = Tune.paths().filter(p => !f || p.toLowerCase().includes(f));
  $('tune').innerHTML = '<table><thead><tr><th>Number</th><th>Now</th><th>How she comes</th><th></th></tr></thead><tbody>'
    + rows.map(p => `<tr class="${p in changed ? 'changed' : ''}" data-p="${esc(p)}"><td>${esc(p)}</td>`
      + `<td><input type="number" step="any" value="${Tune.get(p)}"></td><td class="num">${Tune.defaultOf(p)}</td>`
      + `<td>${p in changed ? '<button type="button" data-undo>Undo</button>' : ''}</td></tr>`).join('') + '</tbody></table>';
}
$('tune').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-p]');
  if (!tr || e.target.tagName !== 'INPUT') return;
  const v = Number(e.target.value);
  if (Number.isFinite(v)) Tune.set(tr.dataset.p, v);
  drawTune(); draw();
});
$('tune').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-p]');
  if (!tr || !e.target.matches('[data-undo]')) return;
  Tune.set(tr.dataset.p, null);
  drawTune(); draw();
});
$('tuneFilter').addEventListener('input', drawTune);
$('tuneReset').addEventListener('click', () => { Tune.reset(); drawTune(); draw(); });

// ---------------------------------------------------------------------------------------------
// buttons

$('content').addEventListener('click', () => { for (const k of Needs.NEEDS) Needs.setLevel(k, 0); Store.flush(); draw(); });
$('rested').addEventListener('click', () => { Tired.clear(); Store.flush(); draw(); });
$('forget').addEventListener('click', () => { Repeat.clear(); Store.flush(); draw(); });
let sure = 0;
$('startOver').addEventListener('click', (e) => {
  if (Date.now() - sure > 4000) { sure = Date.now(); e.target.textContent = 'Sure? Click again: new favorites, needs and history'; return; }
  Store.reset({ keepSeed: false });
  e.target.textContent = 'Start her inside over (new favorites)…';
  sure = 0;
  draw();
});

drawTune();
draw();
setInterval(draw, 1000);
if (location.hash) { try { document.querySelector(location.hash)?.scrollIntoView(); } catch (e) { /* not an id */ } }
// someone tuned in another window
window.addEventListener('storage', (e) => { if (e.key === Tune.TUNE_KEY) { drawTune(); draw(); } });
