// the feel lab (#27): her inside state live (webapp/js/core/feel/), a dry-run "try a touch"
// through the reaction composer, and every number of core feel to tune live. A plain dev panel;
// the diegetic version (her console, #19) comes later and can show the same snapshot().

import * as Feel from './core/feel/feel.js?v=2';
import * as Moods from './desktop/moods.js?v=14';

const { Needs, Tired, Repeat, Session, Tune, Kinds, Store } = Feel;
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
  $('switches').innerHTML = [['needs', 'Her needs'], ['tiring', 'Getting tired'], ['favorites', 'Favorites'], ['repeat', 'Mixes it up']]
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

function draw() {
  const s = Feel.snapshot();
  drawNeeds(s); drawNow(s); drawTired(s); drawFavs(s); drawRepeat(s); drawHist(s);
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
for (const id of ['tKind', 'tMs', 'tStage', 'tMood']) $(id).addEventListener('input', tryIt);
fillTry();

const SEED = 0.5;
function tryIt() {
  const how = $('tHow').value, kind = $('tKind').value;
  const ms = how === 'poke' ? 0 : Number($('tMs').value);
  $('tMsOut').textContent = (ms / 1000).toFixed(1) + ' s';
  const ctx = { stage: Number($('tStage').value), mood: $('tMood').value };
  const base = Moods.feelingFor(kind, how, ms, ctx, SEED);
  const show = (f) => (f ? `<b>${esc(FEEL_NAMES[f.feeling] || f.feeling)}</b>, power ${n2(f.power)}` : 'No feeling about this one.');
  $('rBase').innerHTML = show(base);
  const ck = how === 'poke' ? 'poke.' + kind : kind;
  const comp = base ? Feel.compose({ kind: ck, how, ms, seed: SEED, base, ctx }) : null;
  $('rComp').innerHTML = show(comp) + (comp ? ` · ${esc(Tired.STATE_WORDS[comp.tired])}` : '');
  $('rWhy').innerHTML = (comp?.why?.length ? comp.why : ['nothing changed it']).map(w => `<li>${esc(w)}</li>`).join('');
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
// someone tuned in another window
window.addEventListener('storage', (e) => { if (e.key === Tune.TUNE_KEY) { drawTune(); draw(); } });
