// the story lab (#34; F12 > Labs): the story-event engine in a SANDBOX. A plain dev page like the delve lab: every rule
// it shows lives in js/core/story/ (story-engine.js, cond.js, story-sim.js) and this file only draws and listens. The sandbox game is
// an object on this page: nothing is written to the real game, nothing is granted, no save is made.

import * as Door from './core/story/story.js?v=1';
import * as Sim from './core/story/story-sim.js?v=1';
import * as Places from './core/world/places.js?v=1';
import { DEFAULTS, setOverrides, tune as getTune } from './core/story/story-tune.js?v=1';
import { createView } from './story-view.js?v=2';

const { En, Story, Difficulty } = Door;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (list, v) => list.map(([id, name]) => `<option value="${esc(id)}"${String(id) === String(v) ? ' selected' : ''}>${esc(name)}</option>`).join('');
const KIND = { spine: 'main story', thread: 'loose end', pool: 'by chance' };
const STAGES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];

let data = null, g = null, view = null, base = null, kept = null, tuneOver = {}, salt = 0, known = {};

const ctx = () => ({ ...base, stage: Number($('bond').value) || 1, together: $('together').value === '1', preset: Difficulty.preset(data.diff, g.s.difficulty), now: g.x.day, salt });
const S = () => data.story;

function restart() {
  g = En.newGame(S(), Number($('seed').value) || 1, $('diff').value);
  kept = JSON.stringify(g); salt = 0;
  view.clear();
  act(En.arrive(S(), g, S().start.spot, ctx(), getTune()));
}

// the sandbox's own "autosave": a copy on this page, where a game over goes back to
function act(events) {
  for (const e of events) if (e.type === 'autosave') kept = JSON.stringify(g);
  view.show(events, g.x.play?.wait);
  if (!g.x.play && !g.x.over) {
    const list = En.triggersHere(S(), g);
    if (list.length) view.buttons(list.map(t => [t.name, () => act(En.trigger(S(), g, t.id, ctx(), getTune()))]));
    else view.note('Nothing more to do here. Pick a place on the map.');
  }
  draw();
}

function draw() {
  const c = ctx(), t = getTune();
  $('when').textContent = `Day ${g.x.day}, ${En.SLOTS[g.x.slot]} · at ${S().spots[g.x.at]?.name || g.x.at}` + (g.x.play ? ` · playing "${S().events[g.x.play.ev].name}"` : '');
  // the map, exactly as the game world would draw it from this story state
  $('map').innerHTML = Places.view(data.places, g.s).map(p => `<button data-spot="${esc(p.go?.story || '')}" ${p.state !== 'open' || !p.go?.story || g.x.play || g.x.over ? 'disabled' : ''} title="${esc(p.line)}">${esc(p.name)}${p.state !== 'open' ? ' 🔒' : p.go?.url ? ' (a page)' : ''}</button>`).join('');
  const sn = En.spineNext(S(), g, c);
  $('next').textContent = !sn ? 'The sample\'s main story is told. Everything else keeps going.'
    : `"${sn.name}" at ${sn.at.map(p => S().spots[p]?.name || p).join(' or ') || 'anywhere'}, when you: ${sn.on.map(k => En.triggerName(S(), k)).join(' / ')}` + (sn.missing.length ? ` · still missing: ${sn.missing.join('; ')}` : '');
  $('threads').innerHTML = Object.entries(S().threads).map(([id, th]) => {
    const st = g.x.threads[id];
    return `<span class="chip${st && st.s === 'open' ? ' on' : ''}" title="${esc(th.line)}">${esc(th.name)}: ${st ? (st.s === 'open' ? 'open' : 'closed, ' + esc(st.as)) + (st.n ? ` (came up ${st.n}×)` : '') : 'not yet'}</span>`;
  }).join('');
  // why / why not
  const cf = En.full(S(), g, c);
  $('why').innerHTML = '<tr><th>Event</th><th>Kind</th><th>Happened</th><th>Right now</th></tr>' + Object.entries(S().events).map(([id, ev]) => {
    const k = En.can(S(), g, id, null, cf, t);
    return `<tr><td>${esc(ev.name)}<br><span class="note">${esc(id)} · on ${esc((ev.on || []).join(', '))}</span></td><td>${KIND[En.classOf(ev)]}</td><td class="num">${Story.seenCount(g.s, id) || ''}</td><td class="${k.ok ? 'yes' : 'no'}">${k.ok ? 'could happen' : esc(k.why.join('; '))}</td></tr>`;
  }).join('');
  // memory
  const kv = (o, f = (v) => v) => Object.entries(o).map(([k, v]) => `<span class="chip">${esc(k)}${v === true ? '' : ': ' + esc(f(v))}</span>`).join('') || '<span class="note">nothing yet</span>';
  $('state').innerHTML = `<h3>Flags</h3>${kv(g.s.flags)}<h3>Quests</h3>${kv(g.s.quests, q => q.step + (q.done ? ' (done)' : ''))}<h3>Choices</h3>${kv(g.s.choices)}
    <h3>Seen</h3>${kv(g.s.seen)}<h3>The save card</h3><span class="note">${esc([g.s.place, g.s.chapter, Difficulty.preset(data.diff, g.s.difficulty).name].filter(Boolean).join(' · '))}</span>`;
  const pages = Object.entries(S().codex.pages).map(([pid, p]) => { const all = Object.entries(S().cards).filter(([, k]) => k.page === pid); return `<span class="chip${g.x.pages[pid] ? ' on' : ''}">${esc(p.name)}: ${all.filter(([k]) => g.x.codex[k] !== undefined).length} of ${all.length}</span>`; }).join('');
  $('extras').innerHTML = `<h3>People (a word, never a number)</h3>${Object.keys(g.x.npc).map(id => `<span class="chip" title="reputation ${g.x.npc[id].rep}, affection ${g.x.npc[id].aff} (the lab may look)">${esc(S().npcs[id]?.name || id)}: ${esc(En.standing(g, id, t))}</span>`).join('') || '<span class="note">nobody yet</span>'}
    <h3>Your notebook's pages</h3>${pages}<h3>Set going for later</h3>${g.x.queue.map(q => `<span class="chip">${esc(q.ev)} from day ${q.day}</span>`).join('') || '<span class="note">nothing</span>'}
    <h3>If you lost a fight now</h3><span class="note">${En.defeat ? esc(c.preset.knockout === 'gameover' ? `Game over, unless she reaches you: ${Difficulty.chanceWords(En.defeatChance(g, cf))}.` : 'She takes care of you. Nothing is lost.') : ''}</span>`;
}

async function runSim() {
  const n = Math.max(5, Math.min(500, Number($('simN').value) || 100));
  $('simRun').disabled = true; $('simBusy').textContent = 'Playing…';
  await new Promise(r => setTimeout(r, 10));
  const m = Sim.many(S(), { policy: $('simPolicy').value, ctx: { ...base, stage: Number($('bond').value) || 1, together: $('together').value === '1', preset: Difficulty.preset(data.diff, $('diff').value) },
    places: data.places, days: Number($('simDays').value) || 12, seed: Number($('seed').value) || 1, difficulty: $('diff').value }, n, getTune());
  const pc = (v) => Math.round(100 * v / n) + '%';
  $('simSum').innerHTML = `The main story was told to its end in <b>${pc(m.finished)}</b> of them (by story day ${m.meanDays.toFixed(1)} on average; ${m.minDays} at the soonest, ${m.maxDays} at the latest).
    Nothing happened on ${Math.round(100 * m.quiet / Math.max(1, m.asked))}% of the things tried. The same event at most ${m.inARow}× running; at most ${m.perDayReturns} loose ends back in one day.
    Lost fights: she took care of you ${m.cared}×, reached you in time ${m.saved}×, game over ${m.gameovers}×.` + (m.errors.length ? `<br><span class="warn">Problems: ${esc(m.errors.join(' · '))}</span>` : '') + (m.never.length ? `<br>Never happened: ${esc(m.never.join(', '))}` : '');
  $('simOut').innerHTML = '<tr><th>Event</th><th>Kind</th><th class="num">In how many playthroughs</th><th class="num">Times per playthrough</th></tr>' + Object.entries(m.events).map(([id, e]) =>
    `<tr><td>${esc(S().events[id].name)}</td><td>${KIND[En.classOf(S().events[id])]}</td><td class="num">${pc(e.in)}</td><td class="num">${(e.times / n).toFixed(2)}</td></tr>`).join('');
  $('simThreads').innerHTML = '<tr><th>Loose end</th><th class="num">Opened</th><th class="num">Came back</th><th class="num">Tied off</th><th class="num">Days open before that</th><th>How it ended</th></tr>' + Object.entries(m.threads).map(([id, s]) =>
    `<tr><td>${esc(S().threads[id].name)}${S().threads[id].quiet ? ' <span class="note">(a quiet count)</span>' : ''}</td><td class="num">${pc(s.opened)}</td><td class="num">${pc(s.came)}</td><td class="num">${pc(s.closed)}</td><td class="num">${s.closed ? s.meanWait.toFixed(1) : ''}</td><td>${esc(Object.entries(s.how).map(([k, v]) => `${k} ${pc(v)}`).join(', '))}</td></tr>`).join('');
  $('simBusy').textContent = ''; $('simRun').disabled = false;
}

function drawTune() {
  $('tune').innerHTML = Object.entries(DEFAULTS).map(([grp, vals]) => `<h3>${esc(grp)}</h3><div class="tune">` + Object.entries(vals).map(([k, v]) =>
    `<label>${esc(k)} <input type="number" step="any" data-g="${grp}" data-k="${k}" value="${tuneOver[grp]?.[k] ?? v}"${tuneOver[grp]?.[k] !== undefined ? ' style="border-color:var(--accent)"' : ''}></label>`).join('') + '</div>').join('');
}

async function init() {
  data = await Door.loadData();
  let her = 'She';
  try { her = (localStorage.getItem('omega.names.bot') || '').trim() || 'She'; } catch (e) {}
  document.querySelectorAll('.herName').forEach(e => { e.textContent = her; });
  // what's real: the gate's switches, her bond, levels, names. The story itself is the sandbox's.
  const real = await Door.open(data).catch(() => ({ error: 'offline', g: En.newGame(data.story) }));
  base = await Door.context(data, real.g).catch(() => ({ gateCheck: null, names: Door.names(), stage: 1, levels: { player: {}, jun: {} } }));
  $('bond').innerHTML = opt(STAGES.map((s, i) => [i + 1, s + (i + 1 === base.stage ? ' (as it is)' : '')]), base.stage);
  $('diff').innerHTML = opt(Difficulty.choices(data.diff), real.g.s.difficulty);
  $('simPolicy').innerHTML = opt(Sim.POLICIES);
  $('real').textContent = real.off ? 'Game saves are switched off.' : real.error ? 'Her server didn\'t answer; the sandbox still works.'
    : real.fresh && !Object.keys(real.g.s.flags).length ? 'No story yet in your real game. Enter the game world and go Home to begin.'
    : `Day ${real.g.x.day}, ${En.SLOTS[real.g.x.slot]} · ${[real.g.s.place, real.g.s.chapter].filter(Boolean).join(' · ') || 'not begun'} · ${Object.keys(real.g.s.flags).length} flags, ${Object.keys(real.g.x.threads).length} loose ends.`;
  $('copyReal').disabled = !!(real.off || real.error);
  $('copyReal').onclick = () => { g = JSON.parse(JSON.stringify(real.g)); kept = JSON.stringify(g); $('diff').value = g.s.difficulty; view.clear(); view.note('The sandbox now holds a copy of your real game.'); act(En.pending(S(), g, ctx())); };
  try {
    const [prog, delve] = await Promise.all([fetch('data/progress.json', { cache: 'no-cache' }).then(r => r.json()), fetch('data/delve.json', { cache: 'no-cache' }).then(r => r.json())]);
    known = { grants: Object.keys(prog.story || {}), areas: Object.keys(delve.areas || {}), places: data.places };
  } catch (e) { known = { places: data.places }; }

  view = createView($('scene'), { debug: true, names: base.names, npcs: S().npcs,
    onAnswer: (input) => act(En.step(S(), g, input, ctx(), getTune())),
    onGameOver: () => { g = JSON.parse(kept); salt += 1; view.note('Back to the sandbox\'s last autosave.'); act(En.pending(S(), g, ctx())); } });
  drawTune();
  restart();

  $('restart').onclick = restart;
  $('diff').onchange = () => { Story.setDifficulty(g.s, $('diff').value, g.x.day); draw(); };
  $('bond').onchange = draw; $('together').onchange = draw;
  $('map').addEventListener('click', (e) => { const sp = e.target.dataset?.spot; if (sp && !e.target.disabled) act(En.arrive(S(), g, sp, ctx(), getTune())); });
  $('check').onclick = () => { const bad = [...En.validate(S(), known), ...Places.check(data.places)]; $('checkOut').textContent = bad.length ? bad.join('\n') : 'All good: the story keeps every rule.'; };
  $('simRun').onclick = runSim;
  $('tuneReset').onclick = () => { tuneOver = {}; setOverrides({}); drawTune(); };
  $('tune').addEventListener('change', (e) => {
    const { g: grp, k } = e.target.dataset;
    const v = Number(e.target.value);
    if (!grp || !Number.isFinite(v)) return;
    (tuneOver[grp] ||= {})[k] = v;
    if (v === DEFAULTS[grp][k]) delete tuneOver[grp][k];
    setOverrides(tuneOver); drawTune(); draw();
  });
}
init().catch((e) => { document.querySelector('header p').textContent = 'The lab could not start: ' + (e && e.message); console.error(e); });
