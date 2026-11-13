// the progress lab (#31 item 8): where both of them stand, the curve, and the time-lapse. A plain
// dev panel like the feel lab; every answer comes from her server's one engine (api/lib/progress.php).

import * as Progress from './core/progress.js?v=2';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v) => Number(v).toLocaleString('en-US');

let data = null;      // names of skills, activities, story grants
let realTune = null;  // the real numbers
let tune = {};        // what the lab is trying (only the changed ones)

try { const name = localStorage.getItem('omega.names.bot'); if (name) document.querySelectorAll('.herName').forEach(e => { e.textContent = name; }); } catch (e) {}

function say(msg) { $('out').textContent = msg; }

function describe(r) {
  if (!r) return '';
  if (r.off) return 'Skills are switched off.';
  if (r.error) return 'Not this time: ' + r.error.replace(/_/g, ' ') + '.';
  const parts = [];
  for (const [owner, skills] of Object.entries(r.xp || {})) {
    parts.push((owner === 'jun' ? 'She' : 'You') + ': ' + Object.entries(skills).map(([k, v]) => '+' + n(v) + ' ' + (data.skills[k]?.name || k)).join(', '));
  }
  for (const u of r.ups || []) parts.push((u.owner === 'jun' ? 'Her ' : 'Your ') + (data.skills[u.skill]?.name || u.skill) + ': ' + u.from + ' → ' + u.level);
  if (r.credits) parts.push('+' + n(r.credits) + ' Credits');
  if (r.drops?.length) parts.push('Found: ' + r.drops.map(d => (d.name || d.id) + (d.size ? ' (' + d.size + (d.signature ? ', signature' : '') + (d.instead ? ', paid out as ' + d.instead + ' Credits' : '') + ')' : '')).join(', '));
  if (r.minutes !== undefined && !parts.length) parts.push('Nothing gained (' + r.minutes + ' min counted).');
  if (r.job) parts.push('On its way. Back in ' + Math.round(r.job.minutes) + ' min; it is collected when you refresh.');
  return parts.join('\n') || 'Done.';
}

function drawState(s) {
  if (!s) return;
  for (const [owner, host, tot] of [['player', 'skPlayer', 'totPlayer'], ['jun', 'skJun', 'totJun']]) {
    const o = s.owners[owner];
    $(tot).textContent = o.total;
    $(host).innerHTML = Object.entries(o.skills).map(([id, k]) => `<div class="skill" title="${esc(data?.skills[id]?.line || '')}">
      <span>${esc(k.name)}${k.marks ? ' ' + '★'.repeat(k.marks) : ''}</span><b>${k.level}</b>
      <span class="bar"><i style="width:${k.next ? Math.round(100 * k.into / k.next) : 100}%"></i></span>
      <span>${k.next ? '' : `<button data-master="${owner}:${id}" title="Mastery: start it over for a mark">↺</button>`}</span></div>`).join('');
  }
  $('credits').textContent = n(s.credits);
  $('buffs').innerHTML = s.buffs.map(b => `<span class="chip" title="where it came from: ${esc(b.from)}">${esc(b.name)}${b.uses ? ' ×' + b.uses : ''}</span>`).join('');
  $('jobs').innerHTML = s.jobs.map(j => `<span class="chip">${esc(data?.activities[j.activity]?.name || j.activity)}: back in ${Math.max(0, Math.round((j.ends - s.now) / 60))} min</span>`).join('');
  const items = Object.entries(s.items || {}).map(([k, v]) => k + ' ×' + v);
  $('things').textContent = (items.length ? 'Things (ids only until the shop exists): ' + items.join(', ') + '. ' : '')
    + (s.keepsakes.length ? 'Keepsakes: ' + s.keepsakes.map(k => k.id + ' (' + k.from + ')').join(', ') + '.' : '');
  $('optFocus').checked = !!s.opt.focus;
  $('running').textContent = s.session ? 'Running: ' + (data?.activities[s.session.activity]?.name || s.session.activity) + ', ' + Math.round((s.now - s.session.at) / 60) + ' min so far' : '';
  $('realFinish').disabled = $('realCancel').disabled = !s.session;
}

async function load() {
  const j = await Progress.load({ peek: !Progress.isOn() });
  $('off').hidden = !j.off;
  if (j.error) { say('Her server did not answer. Is she running?'); return; }
  data = j.data; realTune = j.tune;
  drawState(j.state);
  const extra = [];
  if (j.away) extra.push('While you were gone she practiced: ' + describe(j.away));
  for (const c of j.collected || []) extra.push('Back from: ' + (data.activities[c.activity]?.name || c.activity) + '\n' + describe(c));
  if (extra.length) say(extra.join('\n'));
  fillPicks(); drawTune(); drawCurve();
}

let picksDone = false;
function fillPicks() {
  if (picksDone || !data) return;
  picksDone = true;
  const acts = Object.entries(data.activities);
  $('realAct').innerHTML = acts.filter(([, a]) => !a.setGoing && !a.away).map(([id, a]) => `<option value="${esc(id)}">${esc(a.name)}</option>`).join('');
  $('simAct').innerHTML = acts.map(([id, a]) => `<option value="${esc(id)}">${esc(a.name)}</option>`).join('');
}

async function drawCurve() {
  const r = await Progress.curve(tune);
  if (!r.curve) return;
  const show = new Set([1, 2, 3, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, r.curve.length]);
  $('curve').innerHTML = '<tr><th>Level</th><th class="num">xp to the next</th><th class="num">hours to get here</th><th class="num">rewards ×</th></tr>'
    + r.curve.filter(c => show.has(c.level)).map(c => `<tr><td>${c.level}</td><td class="num">${c.next ? n(c.next) : 'top'}</td><td class="num">${c.hours}</td><td class="num">${c.rewards}</td></tr>`).join('');
}

function drawChart(timeline, cap) {
  if (!timeline?.length) { $('simChart').innerHTML = ''; return; }
  const maxH = timeline[timeline.length - 1].hour || 1;
  const pts = [[0, 1], ...timeline.map(p => [p.hour, p.level])].map(([h, l]) => (4 + 392 * h / maxH).toFixed(1) + ',' + (116 - 112 * (l - 1) / (cap - 1)).toFixed(1)).join(' ');
  $('simChart').innerHTML = `<polyline points="${pts}" fill="none" stroke="#ff7aa2" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
}

async function runSim() {
  $('simOut').textContent = 'Playing…';
  const r = await Progress.simulate($('simAct').value, +$('simHours').value || 100, { together: $('simTogether').checked, seed: +$('simSeed').value || 1, tune });
  if (r.error) { $('simOut').textContent = 'Not this time: ' + r.error; return; }
  const all = r.drops.small + r.drops.mid + r.drops.big;
  const lv = (o) => Object.entries(r.skills[o]).filter(([, l]) => l > 1).map(([k, l]) => (data.skills[k]?.name || k) + ' ' + l).join(', ') || 'nothing yet';
  $('simOut').innerHTML = `<div class="big">${esc(data.skills[r.skill]?.name || '')} ${r.level}</div>
    After ${r.hours} h (${n(r.sessions)} sessions). You: ${esc(lv('player'))}. Her: ${esc(lv('jun'))}.<br>
    ${n(r.credits)} Credits · ${n(all)} finds: ${n(r.drops.small)} small, ${n(r.drops.mid)} mid, <b>${n(r.drops.big)} big</b> (${all ? (100 * r.drops.big / all).toFixed(1) : 0}%) · ${n(r.signature)} signature<br>
    Value a minute: <b>${r.valuePerMin}</b>${r.big.length ? '<br>First big moments: ' + r.big.slice(0, 6).map(b => esc(b.id) + ' at ' + b.hour + ' h').join(', ') : ''}`;
  drawChart(r.timeline, (tune.cap ?? realTune?.cap) || 99);
}

async function runFair() {
  const hours = +$('fairHours').value || 300;
  $('fair').innerHTML = '<tr><td>Playing every activity…</td></tr>';
  const rows = [];
  let seed = 1;
  for (const [id, a] of Object.entries(data.activities)) {
    if (a.away) continue;
    const r = await Progress.simulate(id, hours, { seed: seed++, tune });
    if (!r.error) rows.push(r);
  }
  const vals = rows.filter(r => !data.activities[r.activity].setGoing).map(r => r.valuePerMin);
  const spread = vals.length ? Math.round(100 * (Math.max(...vals) / Math.min(...vals) - 1)) : 0;
  $('fair').innerHTML = '<tr><th>Activity</th><th class="num">level reached</th><th class="num">Credits</th><th class="num">small</th><th class="num">mid</th><th class="num">big</th><th class="num">signature</th><th class="num">value a minute</th></tr>'
    + rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.level}</td><td class="num">${n(r.credits)}</td><td class="num">${n(r.drops.small)}</td><td class="num">${n(r.drops.mid)}</td><td class="num">${n(r.drops.big)}</td><td class="num">${n(r.signature)}</td><td class="num">${r.valuePerMin}</td></tr>`).join('')
    + `<tr><td colspan="8" class="note">Furthest apart: ${spread}% (things you set going pay half on purpose: you weren't there).</td></tr>`;
}

const TUNE_WORDS = {
  cap: 'Top level', curveBase: 'Curve: base xp a level', curveMul: 'Curve: how much steeper', curvePow: 'Curve: the bend', xpPerMin: 'xp a minute',
  qualityLo: 'xp × on a rough session', qualityHi: 'xp × on a great session', together: 'xp × together', markXp: 'xp + per Mastery mark', markMax: 'Most Mastery marks',
  valuePerMin: 'Reward value a minute', growth: 'Rewards grow by (at the top)', variance: 'Ups and downs (±)', creditShare: 'Share paid as Credits',
  sigShare: 'Chance a find is a signature one', maxMin: 'Longest session (min)', awayRate: 'Her xp × practicing alone', awayCapH: 'Away counts up to (hours)',
  awayMinH: 'Away starts counting at (hours)', goingRate: 'xp × for things set going', permCap: 'Most a permanent buff adds', recentH: 'She "noticed lately" for (hours)',
  'mix.small': 'How often: small finds', 'mix.mid': 'How often: mid finds', 'mix.big': 'How often: big finds',
  'value.small': 'Worth: a small find', 'value.mid': 'Worth: a mid find', 'value.big': 'Worth: a big find',
};

function drawTune() {
  if (!realTune) return;
  const host = $('tune');
  host.innerHTML = '';
  const add = (key, val, set) => {
    const l = document.createElement('label');
    const i = document.createElement('input');
    i.type = 'number'; i.step = 'any'; i.value = val;
    i.addEventListener('change', () => { if (i.value !== '' && isFinite(+i.value)) { set(+i.value); drawCurve(); } });
    l.append(TUNE_WORDS[key] || key, i);
    host.append(l);
  };
  for (const [k, v] of Object.entries(realTune)) {
    if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) add(k + '.' + kk, tune[k]?.[kk] ?? vv, (x) => { tune[k] = { ...(tune[k] || {}), [kk]: x }; });
    else add(k, tune[k] ?? v, (x) => { tune[k] = x; });
  }
}

const act = (fn) => async () => { const r = await fn(); say(describe(r)); if (Progress.cached()) drawState(Progress.cached()); };
$('realBegin').addEventListener('click', act(() => Progress.begin($('realAct').value, { together: $('realTogether').checked }).then(r => (r.session ? { started: true, xp: {} } : r))));
$('realFinish').addEventListener('click', act(() => Progress.finish()));
$('realCancel').addEventListener('click', act(() => Progress.cancel()));
$('drone').addEventListener('click', act(() => Progress.setGoing('sample_expedition')));
$('story').addEventListener('click', act(() => Progress.story('sample_generals_gift')));
$('optFocus').addEventListener('change', act(() => Progress.opt({ focus: $('optFocus').checked })));
$('reload').addEventListener('click', load);
$('simRun').addEventListener('click', runSim);
$('fairRun').addEventListener('click', runFair);
$('tuneReset').addEventListener('click', () => { tune = {}; drawTune(); drawCurve(); });
document.addEventListener('click', (e) => {
  const m = e.target.closest?.('[data-master]');
  if (!m) return;
  const [owner, skill] = m.dataset.master.split(':');
  act(() => Progress.master(owner, skill))();
});

load();
