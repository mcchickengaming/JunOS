// the delve lab (#32): the delve framework with stand-in art. A plain dev page like the feel lab and
// the progress lab; every rule it shows lives in js/core/delve/ (run.js, encounter.js, party.js,
// scenes.js, sim.js) and this file only draws and listens.

import * as Delve from './core/delve/delve.js?v=1';
import * as Scenes from './core/delve/scenes.js?v=1';
import * as Sim from './core/delve/sim.js?v=1';
import { createView, drawMap } from './core/delve/view.js?v=1';
import { DEFAULTS, setOverrides, tune as getTune } from './core/delve/delve-tune.js?v=1';
import * as Progress from './core/progress.js?v=2';
import * as F from './core/features.js?v=3';
import { dayMood, dayKey } from './core/feel/initiative.js?v=2';
import * as Store from './core/feel/store.js?v=4';

const { Run, Party, Gate } = Delve;
const { Enc, Ab } = Run;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACES = { neutral: '·_·', uneasy: '·~·', scared: 'O_O', focused: '>_·', proud: '^_^', grin: '^v^', worried: '·_·;', relieved: '-u-', yawn: '-o-', curious: '·o·', pout: '·3·' };
const STAGES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];

let herName = 'She';
try { herName = (localStorage.getItem('omega.names.bot') || '').trim() || 'She'; } catch (e) {}
document.querySelectorAll('.herName').forEach(e => { e.textContent = herName; });

let data = null, view = null, run = null, enc = null, standalone = false;
let rel = { stage: 1, trust: 50, tension: 0 }, levels = { player: {}, jun: {} };
let tuneOver = {};
let activeMs = 0, lastActive = 0, timer = null, target = null, bubbleT = 0, escAt = 0;
const mem = { recent: [] };

const say = (t) => { const el = $('log'); el.textContent = (t + '\n' + el.textContent).slice(0, 4000); };
const opt = (list, v) => list.map(([id, name]) => `<option value="${esc(id)}"${String(id) === String(v) ? ' selected' : ''}>${esc(name)}</option>`).join('');

// ---------------------------------------------------------------
// her words and face: never in the way (nothing here blocks a key or opens a prompt)

function herCtx() {
  let mood = 'easy';
  try { mood = dayMood(Store.hash01('daymood', dayKey(Date.now()))); } catch (e) {}
  return { courage: run ? Delve.herCourage(run) : Party.courage({ setting: $('courage').value, delving: levels.jun.delving || 1, stage: stageNow() }),
    stage: stageNow(), often: Number($('talk').value), asFeels: Delve.asFeels(), dayMood: mood, together: run ? run.together : $('together').value === '1' };
}
function herSay(moment) {
  if (!moment || !run) return;
  const line = Party.say(data, moment, herCtx(), mem);
  if (line) showLine(line);
}
function showLine(line) {
  $('face').textContent = FACES[line.face] || FACES.neutral;
  const b = $('bubble');
  b.textContent = line.t; b.hidden = false;
  clearTimeout(bubbleT);
  bubbleT = setTimeout(() => { b.hidden = true; $('face').textContent = FACES.neutral; }, 2200 + line.t.length * 55);
  say(herName + (run && !run.together ? ' (on the phone)' : '') + ': ' + line.t);
}
const stageNow = () => ($('bond').value === 'now' ? rel.stage : Number($('bond').value)) || 1;

// ---------------------------------------------------------------
// drawing

function scene() {
  const f = Run.floorOf(data, run);
  const thing = (x, y) => {
    const th = Run.thingAt(data, run, x, y);
    if (!th) return null;
    const fo = th.kind === 'foe' ? data.foes[th.foes[0]] : null;
    return { kind: th.kind, state: Run.stateOf(run, th), big: !!th.big, shape: fo?.shape, color: fo?.color };
  };
  return { f, pos: run.pos, colors: data.areas[run.area].colors, cell: (x, y) => Run.cellAt(data, run, x, y), hinted: (x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && Run.isSecretHinted(data, run, x, y), thing };
}
function draw() {
  if (!run) return;
  const s = scene();
  view.draw(s);
  drawMap($('map'), { w: s.f.w, h: s.f.h, pos: run.pos, seen: (x, y) => Run.seenAt(data, run, x, y), cell: s.cell, hinted: s.hinted, thing: s.thing, colors: s.colors });
  const A = data.areas[run.area];
  $('hudL').textContent = `${A.name} · floor ${run.depth} of ${run.floors}`;
  $('hudR').textContent = ['north', 'east', 'south', 'west'][run.pos.d];
  const bar = (name, h) => (h ? `<div class="skill" style="grid-template-columns:90px 1fr 60px"><span>${esc(name)}</span><span class="bar"><i style="width:${Math.round(100 * h.hp / h.max)}%"></i></span><span>${h.hp} / ${h.max}</span></div>` : '');
  $('bars').innerHTML = bar('You', run.hp.you) + bar(herName, run.hp.her);
  const a = Run.ahead(run), th = Run.thingAt(data, run, a.x, a.y), here = Run.thingAt(data, run, run.pos.x, run.pos.y);
  const st = th ? Run.stateOf(run, th) : null;
  $('hint').textContent = run.state !== 'walk' ? ''
    : here?.kind === 'camp' ? 'A camp. Space: rest here.' : here?.kind === 'stairs' ? 'Stairs. Space: go down.' : here?.kind === 'exit' ? 'The way out. Space twice: head home.'
    : th && !st && th.kind === 'chest' ? 'A chest. Space: open it.' : th && !st && th.kind === 'vault' ? 'The deep chest. Space: open it.'
    : th && !st && th.kind === 'terminal' ? 'An old terminal. Space: try it.' : th && th.kind === 'foe' && !st ? 'Something is waiting. Walk into it, or go around.'
    : th && th.kind === 'foe' && st === 'fled' ? 'It lost interest. You can slip past.' : '';
  $('portrait').hidden = false;
  $('portrait').classList.toggle('phone', !run.together);
}

// ---------------------------------------------------------------
// walking

function handle(events) {
  for (const ev of events) {
    const feel = Party.feelFor(ev, run, Delve.herCourage(run));
    if (feel) Party.keep(run, feel);
    herSay(Party.momentFor(ev));
    if (ev.type === 'bump' && ev.what !== 'wall') say(ev.done ? 'Already done.' : 'Something solid. Space uses it.');
    else if (ev.type === 'secret') say('A hidden door swings in.');
    else if (ev.type === 'sensed' && !run.together) say('…');
    else if (ev.type === 'trap') say(`A trap. It stings (${ev.dmg}).`);
    else if (ev.type === 'trap_avoided') say('You step around the trap.');
    else if (ev.type === 'chest') say('You pocket what\'s inside. You\'ll see what it\'s worth back home.');
    else if (ev.type === 'wish_got') say('That\'s the kind of thing she asked for.');
    else if (ev.type === 'vault') say('The deep chest opens. This place is done: head home whenever you like.');
    else if (ev.type === 'terminal') say(ev.hacked ? 'The terminal wakes: the whole floor is on your map, hollow walls and traps too.' : 'A dead screen. Someone who speaks machine could wake it.');
    else if (ev.type === 'nothing') say(ev.maybe ? 'Just wall. …Probably.' : 'Nothing here.');
    else if (ev.type === 'rested') { say('You rest. You\'re both patched up.'); safeSpot(); }
    else if (ev.type === 'descended') say(ev.last ? 'The last floor. Something big is humming.' : 'Down a floor.');
    else if (ev.type === 'fight') { say('It notices you: ' + ev.foes.join(', ') + '.'); openFight(run.enc, false); }
    else if (ev.type === 'ko') careScene();
    else if (ev.type === 'woke') say('You\'re back on your feet at the camp.');
    else if (ev.type === 'left') finish(ev);
  }
  if (run && run.state !== 'over') Delve.save(run);
  draw();
}

function key(k) {
  if (!run || !data) return;
  touchClock();
  if (run.state === 'fight' || standalone) return fightKey(k);
  if (run.state !== 'walk') return;
  const t = getTune();
  if (k === 'w' || k === 'arrowup') handle(Run.step(data, run, 0, t));
  else if (k === 's' || k === 'arrowdown') handle(Run.step(data, run, 2, t));
  else if (k === 'a') handle(Run.step(data, run, 3, t));
  else if (k === 'd') handle(Run.step(data, run, 1, t));
  else if (k === 'q' || k === 'arrowleft') handle(Run.turn(data, run, -1, t));
  else if (k === 'e' || k === 'arrowright') handle(Run.turn(data, run, 1, t));
  else if (k === ' ' || k === 'enter') {
    // the way out is under your feet when you arrive: leaving takes a second press, so a stray Space never ends a delve
    const here = Run.thingAt(data, run, run.pos.x, run.pos.y);
    if (here && here.kind === 'exit' && Date.now() - escAt > 2000) { escAt = Date.now(); say('The way out. Space again to head home.'); return; }
    handle(Run.use(data, run, t));
  }
  else if (k === 'escape') { if (Date.now() - escAt < 1500) goHome(); else { escAt = Date.now(); say('Esc again to head home.'); } }
}
// only time you're actually playing counts (a window left open doesn't farm minutes)
function touchClock() {
  const now = Date.now();
  if (lastActive) activeMs += Math.min(now - lastActive, 30000);
  lastActive = now;
}
function goHome() {
  if (!run || run.state === 'over') return;
  if (run.state === 'fight') { Enc.flee(run.enc); closeFight(); Run.endFight(data, run, getTune()); }
  if (run.state === 'ko') { handle(Run.afterCare(data, run, 'home', getTune())); return; }
  handle(Run.leave(data, run, 'home', getTune()));
}

// a camp is a safe spot: what she kept from down there comes out now. Taking an offer is yours to choose.
function safeSpot() {
  const cards = Party.safeSpot(data, run, { gateCheck: Gate.check, gateCtx: { ...Delve.gateCtx(rel), stage: stageNow() }, mem });
  const host = $('cards');
  host.innerHTML = '';
  for (const c of cards) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<b>${esc(herName)}</b> <span class="tier">at the camp</span><br>${esc(FACES[c.face] || '')} ${esc(c.t)}`;
    if (c.offer) {
      const b = document.createElement('button');
      b.textContent = c.offer.label;
      b.style.marginLeft = '8px';
      b.onclick = () => { b.remove(); showLine({ t: c.offer.then.t, face: c.offer.then.face }); el.insertAdjacentHTML('beforeend', `<br><span class="note">(stand-in: the real hands-on moment comes with touch in her window)</span>`); };
      el.append(b);
    }
    host.append(el);
    say(herName + ', at the camp: ' + c.t);
  }
}

// ---------------------------------------------------------------
// knocked out: the care scene slot, picked by the ONE gate

function playScene(pick, onDone, endLabel) {
  const host = $('scene');
  let i = 0;
  const show = () => {
    const b = pick.variant.beats[i];
    host.innerHTML = `<span class="tier">${esc({ everyday: 'Everyday', flirty: 'Flirty', adult: '18+' }[pick.tier])}</span>
      <div style="font:600 26px ui-monospace,monospace">${esc(FACES[b.face] || FACES.neutral)}</div>
      <div style="max-width:440px;font-size:15px">${esc(b.t)}</div>`;
    const btn = document.createElement('button');
    btn.textContent = i < pick.variant.beats.length - 1 ? 'Next' : endLabel;
    btn.onclick = () => { i++; if (i < pick.variant.beats.length) show(); else { host.hidden = true; onDone(); } };
    host.append(btn);
    btn.focus();
  };
  host.hidden = false;
  show();
}
function careScene() {
  const where = Run.careWhere(data, run);
  const pick = Scenes.pick(data, 'knocked_out', { where, gateCheck: Gate.check, gateCtx: { ...Delve.gateCtx(rel), stage: stageNow() } });
  say('Everything goes dark. Nothing is lost.');
  playScene(pick, () => { handle(Run.afterCare(data, run, where === 'camp' ? 'camp' : 'home', getTune())); $('stage').focus(); }, where === 'camp' ? 'Get up' : 'Rest');
}

// ---------------------------------------------------------------
// fights: one panel for a delve's fight and for "Try a fight"

function openFight(e, alone) {
  enc = e; standalone = alone; target = null;
  $('fight').hidden = false; $('flog').textContent = '';
  clearInterval(timer);
  if (enc.pace !== 'turn') timer = setInterval(() => { if (enc && !enc.over) fightEvents(Enc.advance(data, enc, 50, getTune())); }, 50);
  fightEvents(Enc.advance(data, enc, 0, getTune()));
}
function closeFight() { clearInterval(timer); timer = null; $('fight').hidden = true; enc = null; standalone = false; }

const FWORDS = {
  hit: (e) => `${e.name}: ${e.label}. ${e.toName} takes ${e.dmg}${e.covered ? ' (stepped in front)' : ''}.`,
  miss: (e) => `${e.name}: ${e.label}. Misses ${e.toName}.`,
  guard: (e) => `${e.name} guards.`, cover: (e) => `${e.name} steps in front of ${e.toName}.`, taunt: (e) => `${e.name} draws them in.`,
  heal: (e) => `${e.name}: ${e.label}. ${e.toName} gets ${e.amount} back.`, rally: (e) => `${e.name} backs ${e.toName} up.`,
  expose: (e) => `${e.name}: ${e.label}. A weak spot on ${e.toName}.`, stun: (e) => `${e.name} hacks ${e.toName}: it loses its next go.`,
  skip: (e) => `${e.name} sits there, rebooting.`, down: (e) => (e.who === 'her' ? `${herName} sits down to reboot.` : `${e.name} goes down.`),
};
function fightEvents(events) {
  const lines = [];
  for (const ev of events) {
    if (FWORDS[ev.type]) lines.push(FWORDS[ev.type]({ ...ev, name: ev.who === 'her' ? herName : ev.name, toName: ev.to === 'her' ? herName : ev.to === 'you' ? 'You' : ev.toName }));
    if (run && !standalone) herSay(Party.momentInFight(ev, enc));
  }
  if (lines.length) $('flog').textContent = lines.slice(-4).join('\n');
  drawFight();
  if (enc && enc.over) setTimeout(fightDone, enc.over === 'fled' ? 0 : 700);
}
function drawFight() {
  if (!enc) return;
  const unit = (u, cls) => `<div class="${cls}${u.out ? ' out' : ''}${u.id === target ? ' pick' : ''}" data-u="${u.id}">${u.side === 'them' ? `<i class="shape ${esc(u.shape || 'box')}" style="background:${esc(u.color || '#9aa3b5')}"></i>` : ''}<b>${esc(u.id === 'her' ? herName : u.name)}</b>
    ${u.st.exposed ? ' <span class="tier">weak spot</span>' : ''}${u.st.stun ? ' <span class="tier">rebooting</span>' : ''}${u.st.guard ? ' <span class="tier">guarding</span>' : ''}
    <div class="hp"><i style="width:${Math.round(100 * u.hp / u.max)}%"></i></div>${enc.pace === 'turn' ? '' : `<div class="meter"><i style="width:${Math.round(100 * u.meter)}%"></i></div>`}
    <span class="note">${u.hp} / ${u.max}</span></div>`;
  $('foes').innerHTML = enc.units.filter(u => u.side === 'them').map(u => unit(u, 'foe')).join('');
  $('mates').innerHTML = enc.units.filter(u => u.side === 'us').map(u => unit(u, 'mate')).join('');
  const w = Enc.waitingFor(enc);
  const host = $('acts');
  if (!w) { host.innerHTML = `<span class="note">${enc.over ? '' : enc.pace === 'turn' ? '…' : 'Getting ready…'}</span>`; }
  else {
    const opts = Enc.options(data, enc, w.id);
    host.innerHTML = opts.map((o, i) => `<button data-a="${o.id}" title="${esc(o.line)}"${o.ready && o.targets.length ? '' : ' disabled'}>${i + 1} ${esc(o.name)}${o.cd ? ' (' + o.cd + ')' : ''}</button>`).join('')
      + `<button data-a="__flee" title="Always works. Nothing is lost.">0 Back off</button>`;
  }
}
function doAct(id) {
  if (!enc || enc.over) return;
  if (id === '__flee') { fightEvents(Enc.flee(enc)); return; }
  const w = Enc.waitingFor(enc);
  if (!w) return;
  const o = Enc.options(data, enc, w.id).find(x => x.id === id);
  if (!o || !o.ready || !o.targets.length) return;
  const tg = o.targets.includes(target) ? target : o.targets[0];
  const ev = Enc.act(data, enc, w.id, id, tg, { tune: getTune() });
  fightEvents([...ev, ...(enc.over ? [] : Enc.advance(data, enc, 0, getTune()))]);
}
function fightKey(k) {
  if (!enc) return;
  if (k === '0' || k === 'escape') return doAct('__flee');
  const n = Number(k);
  const w = Enc.waitingFor(enc);
  if (w && n >= 1) { const o = Enc.options(data, enc, w.id)[n - 1]; if (o) doAct(o.id); }
}
function fightDone() {
  if (!enc || !enc.over) return;
  const how = enc.over;
  if (standalone) {
    const r = Enc.result(enc, getTune());
    $('fOut').textContent = { won: 'You won', ko: 'You went down (in a delve: the care scene, nothing lost)', fled: 'You backed off', draw: 'Nobody could finish it' }[how] + `, in ${r.acts} goes. You have ${r.you.hp} of ${r.you.max} left.`;
    closeFight();
    return;
  }
  closeFight();
  say({ won: 'It\'s over. You won.', fled: 'You back off. It loses interest.', draw: 'Neither of you can finish it. You back off.', ko: '' }[how]);
  handle(Run.endFight(data, run, getTune()));
  $('stage').focus();
}

// ---------------------------------------------------------------
// start and finish

function kits() { return { player: [$('kitP1').value, $('kitP2').value].filter(Boolean), jun: [$('kitJ1').value, $('kitJ2').value].filter(Boolean) }; }
function whoIsWhat() {
  const k = kits();
  const you = Ab.build(data, 'player', { levels: levels.player, kits: k.player });
  const her = Ab.build(data, 'jun', { levels: levels.jun, kits: k.jun });
  const list = (u) => u.abilities.filter(a => a !== 'shove').map(a => data.abilities[a].name).join(', ') || 'a shove';
  $('whoIsWhat').textContent = `From what you carry and know: you're ${Ab.roleOf(data, you).words} (${list(you)}). ${herName} is ${Ab.roleOf(data, her).words} (${list(her)}). No classes: swap what you carry and you swap parts.`;
  const A = data.areas[$('area').value];
  const mine = levels.player.delving || 1;
  $('placeNote').textContent = A.level > mine + 3 ? `This place is well above your Delving (${mine}): expect to be carried home.` : '';
}
function setupOptions() {
  return { area: $('area').value, seed: Number($('seed').value) || 0, together: $('together').value === '1', role: $('role').value,
    pace: $('notimer').checked ? 'turn' : ($('pace').value === 'place' ? undefined : $('pace').value), courage: $('courage').value, stage: stageNow(), kits: kits(), levels };
}
async function begin() {
  if (run && run.state !== 'over') await Delve.abandon(run);
  Delve.setSetting('notimer', $('notimer').checked);
  const o = setupOptions();
  const r = await Delve.begin(data, { ...o, real: $('real').checked });
  if (r.off) { $('off').hidden = false; say('Delves are switched off in Settings.'); return; }
  if (r.error) { say('Her server said no: ' + r.error.replace(/_/g, ' ') + '. Untick "count it" to play anyway.'); return; }
  enter(r.run, r.events);
}
function enter(r, events) {
  run = r; activeMs = 0; lastActive = Date.now();
  $('log').textContent = ''; $('cards').innerHTML = ''; $('done').hidden = true; $('scene').hidden = true; $('fight').hidden = true; $('resume').hidden = true;
  say(run.real ? 'Her server is keeping the clock: this one counts.' : 'Not counted: just trying it.');
  handle(events);
  if (run.state === 'fight' && run.enc) openFight(run.enc, false);
  if (run.state === 'ko') careScene();
  $('stage').focus();
}
async function finish(ev) {
  const o = ev.outcome;
  const mine = run;
  clearInterval(timer);
  touchClock();
  const r = await Delve.end(data, mine, activeMs / 60000);
  const how = o.how === 'carried' ? `${mine.together ? herName + ' carried you home' : herName + ' came down and brought you home'}. Nothing was lost.` : o.cleared ? 'You opened the deep chest and walked out.' : 'You headed home.';
  const got = r.got && !r.got.off && !r.got.error ? describe(r.got) : mine.real ? 'Her server didn\'t answer, so nothing was counted.' : 'Not counted.';
  $('done').innerHTML = `<h3 style="margin:0">${esc(how)}</h3>
    <div class="note">${o.floors} of ${o.of} floors · ${o.won} won, ${o.fled} backed off from · ${o.chests} chests${o.secrets ? ' · something hidden found' : ''}${o.wish === 'got' ? ' · you found what she asked for' : ''}</div>
    <div style="white-space:pre-line;font-size:13px">${esc(got)}</div>
    <div class="note">${o.carried.length ? `${esc(herName)} is still carrying something from down there (${esc(o.carried.join(', '))}): it comes up when you talk at home.` : ''}</div>`;
  $('done').hidden = false;
  run = mine; draw();
}
function describe(r) {
  const parts = [];
  const names = (o) => Object.entries(r.xp?.[o] || {}).map(([k, v]) => `+${v} ${k}`).join(', ');
  if (names('player')) parts.push('You: ' + names('player'));
  if (names('jun')) parts.push(herName + ': ' + names('jun'));
  for (const u of r.ups || []) parts.push(`${u.owner === 'jun' ? herName + '\'s' : 'Your'} ${u.skill}: ${u.from} → ${u.level}`);
  if (r.credits) parts.push(`+${r.credits} Credits`);
  if (r.drops?.length) parts.push('Found: ' + r.drops.map(d => (d.name || d.id) + (d.size ? ` (${d.size})` : '')).join(', '));
  return parts.join('\n') || `Counted ${Math.round((r.minutes || 0) * 10) / 10} minutes.`;
}

// ---------------------------------------------------------------
// the side panels

function tryFight(auto) {
  const ids = [$('f1').value, $('f2').value, $('f3').value].filter(Boolean);
  if (!ids.length) return;
  const lv = Number($('fLevel').value) || 1, t = getTune(), k = kits();
  const together = $('together').value === '1';
  const make = (seed, ctl) => {
    const you = Ab.build(data, 'player', { levels: { ...levels.player, delving: lv }, kits: k.player, tune: t });
    if (ctl) you.ctl = ctl;
    const us = [you];
    if (together) us.push(Ab.build(data, 'jun', { levels: { ...levels.jun, delving: Math.max(lv, levels.jun.delving || 1) }, kits: k.jun, tune: t }));
    const level = Ab.placeLevel(data.areas[$('area').value], 1, lv, t);
    return Enc.create(data, { us, them: Ab.foesFor(data, ids, level, { alone: !together, tune: t }), pace: $('notimer').checked ? 'turn' : $('fPace').value, seed, herRole: $('role').value, tune: t });
  };
  if (!auto) { if (run && run.state === 'fight') return; openFight(make(Date.now() % 100000), true); $('stage').focus(); $('stage').scrollIntoView({ block: 'center' }); return; }
  let won = 0, ko = 0, acts = 0, left = 0;
  const N = 300;
  for (let i = 0; i < N; i++) { const e = make(i + 1, 'auto'); Enc.autoplay(data, e, t); const r = Enc.result(e, t); won += r.how === 'won'; ko += r.how === 'ko'; acts += r.acts; left += r.you.hp / r.you.max; }
  $('fOut').textContent = `${N} fights by the stand-ins, ${together ? 'together' : 'alone'}: won ${Math.round(100 * won / N)}%, knocked out ${Math.round(100 * ko / N)}%, ${Math.round(acts / N)} goes each, ${Math.round(100 * left / N)}% of your health left on average.`;
}

function drawSlots() {
  const ctx = { ...Delve.gateCtx(rel), stage: stageNow() };
  $('slots').innerHTML = Object.entries(data.scenes).map(([id, s]) => {
    const rows = ['home', 'camp', 'alone'].map(where => {
      const p = Scenes.pick(data, id, { where, gateCheck: Gate.check, gateCtx: ctx, rnd: () => 0 });
      const why = p.tried.map(x => `${x.tier}: ${x.why}`).join(' · ');
      return `<tr><td>${where === 'alone' ? 'she stayed home' : 'at ' + where}</td><td><b>${esc({ everyday: 'Everyday', flirty: 'Flirty', adult: '18+' }[p.tier])}</b></td><td><button data-slot="${id}" data-where="${where}">Play it</button></td><td class="note">${esc(why)}</td></tr>`;
    }).join('');
    const have = ['everyday', 'flirty', 'adult'].map(t => `${{ everyday: 'Everyday', flirty: 'Flirty', adult: '18+ (yours)' }[t]}: ${(s.variants[t] || []).length}`).join(' · ');
    return `<h3>${esc(s.name)}</h3><p class="note">${esc(s.line)} Versions: ${have}. Right now, at ${STAGES[stageNow() - 1]}:</p><table>${rows}</table>`;
  }).join('');
}

async function runSim() {
  const n = Math.max(5, Math.min(500, Number($('simN').value) || 100)), lv = Math.max(1, Math.min(99, Number($('simLv').value) || 1));
  const t = getTune(), k = kits();
  const L = { player: { delving: lv, scavenging: lv }, jun: { delving: lv, scanning: lv, hacking: lv, support: lv } };
  const rows = [];
  $('simRun').disabled = true;
  for (const area of Object.keys(data.areas)) for (const together of [true, false]) {
    $('simBusy').textContent = `${data.areas[area].name}, ${together ? 'together' : 'alone'}…`;
    await new Promise(r => setTimeout(r, 10));
    const m = Sim.many(data, { area, together, levels: L, kits: k, role: $('role').value, seed: Number($('seed').value) || 1 }, n, t);
    rows.push(`<tr><td>${esc(data.areas[area].name)}</td><td>${together ? 'together' : 'alone'}</td><td class="num">${m.minutes.toFixed(1)}</td><td class="num">${m.minMinutes.toFixed(0)}–${m.maxMinutes.toFixed(0)}</td>
      <td class="num">${Math.round(100 * m.cleared)}%</td><td class="num">${Math.round(100 * m.anyKo)}%</td><td class="num">${m.met.toFixed(1)}</td><td class="num">${m.chests.toFixed(1)}</td><td class="num">${Math.round(100 * m.secrets) / 100}</td><td class="num">${m.quality.toFixed(2)}</td></tr>`);
    $('simOut').innerHTML = `<tr><th>Place</th><th></th><th class="num">Minutes</th><th class="num">shortest–longest</th><th class="num">Deep chest opened</th><th class="num">Knocked out at least once</th><th class="num">Meetings</th><th class="num">Chests</th><th class="num">Hidden doors found</th><th class="num">Quality (0.5 = a normal session)</th></tr>` + rows.join('');
  }
  $('simBusy').textContent = `${n} delves each, Delving ${lv}.`;
  $('simRun').disabled = false;
}

function drawTune() {
  $('tune').innerHTML = Object.entries(DEFAULTS).map(([g, vals]) => `<h3>${esc(g)}</h3><div class="tune">` + Object.entries(vals).map(([k, v]) =>
    `<label>${esc(k)} <input type="number" step="any" data-g="${g}" data-k="${k}" value="${tuneOver[g]?.[k] ?? v}"${tuneOver[g]?.[k] !== undefined ? ' style="border-color:var(--accent)"' : ''}></label>`).join('') + '</div>').join('');
}

// ---------------------------------------------------------------

async function init() {
  await F.load().catch(() => {});
  data = await Delve.loadData();
  $('off').hidden = Delve.isOn();
  try { await Gate.loadComfort(); } catch (e) {}
  try { const j = await (await fetch('api/relationship.php', { credentials: 'same-origin' })).json(); rel = { stage: j.bond?.stage || 1, trust: Number(j.trust) || 0, tension: Number(j.tension) || 0 }; } catch (e) {}
  levels = await Delve.levels();
  $('fLevel').value = $('simLv').value = levels.player.delving || 1;

  $('area').innerHTML = opt(Object.entries(data.areas).map(([id, a]) => [id, `${a.name} (level ${a.level})`]));
  $('role').innerHTML = opt(Object.entries(data.roles).map(([id, r]) => [id, r.name]), Delve.setting('role'));
  $('pace').innerHTML = opt(Delve.PACE_CHOICES, Delve.setting('pace'));
  $('fPace').innerHTML = opt(Enc.PACES);
  $('courage').innerHTML = opt(Party.COURAGE, Delve.setting('courage'));
  $('talk').value = Delve.setting('talk');
  $('notimer').checked = Delve.setting('notimer');
  $('bond').innerHTML = opt([['now', `As it is (${STAGES[rel.stage - 1]})`], ...STAGES.map((s, i) => [i + 1, s])]);
  const kitList = [['', 'nothing'], ...Object.entries(data.kits).map(([id, k]) => [id, `${k.name}: ${k.line}`])];
  for (const [el, v] of [['kitP1', data.defaultKits.player[0]], ['kitP2', data.defaultKits.player[1]], ['kitJ1', data.defaultKits.jun[0]], ['kitJ2', data.defaultKits.jun[1]]]) $(el).innerHTML = opt(kitList, v);
  const foeList = [['', '(nothing)'], ...Object.entries(data.foes).map(([id, f]) => [id, f.name])];
  $('f1').innerHTML = opt(foeList, 'sentry'); $('f2').innerHTML = opt(foeList, 'lantern'); $('f3').innerHTML = opt(foeList, '');
  $('real').checked = Progress.isOn(); $('real').disabled = !Progress.isOn();

  view = createView(globalThis.PIXI, $('view'));
  whoIsWhat(); drawSlots(); drawTune();

  for (const id of ['area', 'kitP1', 'kitP2', 'kitJ1', 'kitJ2']) $(id).onchange = whoIsWhat;
  $('bond').addEventListener('change', drawSlots);
  $('start').onclick = begin;
  $('home').onclick = goHome;
  $('fTry').onclick = () => tryFight(false);
  $('fAuto').onclick = () => tryFight(true);
  $('simRun').onclick = runSim;
  $('tuneReset').onclick = () => { tuneOver = {}; setOverrides({}); drawTune(); };
  $('tune').addEventListener('change', (e) => {
    const { g, k } = e.target.dataset;
    if (!g) return;
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    (tuneOver[g] ||= {})[k] = v;
    if (v === DEFAULTS[g][k]) delete tuneOver[g][k];
    setOverrides(tuneOver); drawTune();
  });
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) && !(e.target.closest('#scene') && e.key === ' ')) return;
    if (!$('scene').hidden || !$('done').hidden) return;
    const k = e.key.toLowerCase();
    if (!run && !standalone) return;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    key(k);
  });
  document.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { key(b.dataset.k); $('stage').focus(); }; });
  $('acts').addEventListener('click', (e) => { const a = e.target.dataset.a; if (a) doAct(a); });
  $('foes').addEventListener('click', (e) => { const u = e.target.closest('[data-u]'); if (u) { target = u.dataset.u; drawFight(); } });
  $('slots').addEventListener('click', (e) => {
    const { slot, where } = e.target.dataset;
    if (!slot || (run && run.state !== 'over' && run.state !== 'walk')) return;
    const pick = Scenes.pick(data, slot, { where, gateCheck: Gate.check, gateCtx: { ...Delve.gateCtx(rel), stage: stageNow() } });
    playScene(pick, () => {}, 'Close');
    $('stage').scrollIntoView({ block: 'center' });
  });
  Gate.onComfort(drawSlots);

  // a delve left open comes back as it was
  const old = Delve.saved();
  if (old && old.state !== 'over' && data.areas[old.area]) {
    $('resume').hidden = false;
    $('resume').onclick = () => enter(old, [{ type: 'resumed' }]);
  }
}

init().catch(e => { say('The lab could not start: ' + (e && e.message)); console.error(e); });
