// the scene lab (#22; F12 > Labs): the scene engine in a SANDBOX, and the SCENE MAKER. A plain dev page like the
// story lab: every rule it shows lives in js/core/scene/ (scene-engine.js, scene-mine.js) and js/core/delve/scenes.js
// (the slots); this file only draws and listens. The sandbox is a pretend game on this page (the story engine's own,
// so the scene remembers through story state exactly as in the real game): nothing is written to the real game.
// The one thing here that IS real: the owner's own scenes (localStorage jun.scenes.mine, through scene-door.js).

import * as Door from './core/story/story.js?v=4';
import * as Gate from './core/gate.js?v=6';
import { DEFAULTS, setOverrides, tune as getTune } from './core/scene/scene-tune.js?v=3';
import { tune as storyTune } from './core/story/story-tune.js?v=1';
import { createScenePlayer } from './scene-view.js?v=4';
import { FACES } from './story-view.js?v=4';

const { En, SceneDoor } = Door;
const { Sc, Mine, Scenes } = SceneDoor;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAGES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];
const TIER = { everyday: 'Everyday', flirty: 'Flirty', adult: '18+' };
const clone = (v) => JSON.parse(JSON.stringify(v));

let data = null, lib = null, slots = {}, g = null, base = null, tuneOver = {}, stopped = false, player = null;
let draft = null, draftAt = -1, mineSet = null, liveCtx = null;

// ---------------------------------------------------------------
// the sandbox: who's asking the gate, and what it remembers

const S = () => data.story;
function gateCtx() {
  const comfort = { ...Gate.comfort() };
  if ($('flirty').value) comfort.flirty = $('flirty').value === 'on';
  return { ...base, gateCheck: Gate.check, gate: { comfort, mode: 'windowed', screenShare: false }, stage: Number($('bond').value) || 1, now: Date.now() };
}
// the scene's ctx. Game Jun: the story engine's own reading (her say is a meter: "she'd ask first" counts as yes).
// Desktop Jun: her live say ("ask" is not a yes) and her stop signal. Same engine, another `ask`: that's the door.
function sceneCtx(replay = false) {
  const desktop = $('whose').value === 'desktop';
  const c = En.sceneCtx(S(), g, gateCtx(), storyTune({ gate: { askCounts: desktop ? 0 : 1 } }), { replay });
  if (desktop && stopped) c.stop = true;
  return c;
}
const everyScene = () => SceneDoor.allScenes(lib);

function drawWhat() {
  const keep = $('what').value;
  const opt = (v, n) => `<option value="${esc(v)}">${esc(n)}</option>`;
  $('what').innerHTML = '<optgroup label="A slot (the gate picks the version)">' + Object.entries(slots).map(([id, s]) => opt('slot:' + id, s.name)).join('') + '</optgroup>'
    + '<optgroup label="One of ours, directly">' + Object.values(lib.scenes).map(sc => opt('scene:' + sc.id, `${sc.name} (${TIER[sc.tier || 'everyday']})`)).join('') + '</optgroup>'
    + (mineSet.list.length ? '<optgroup label="One of yours, directly">' + mineSet.list.map(en => opt('mine:' + en.scene.id, `${en.scene.name} (${TIER[en.scene.tier || 'everyday']})`)).join('') + '</optgroup>' : '');
  if ([...$('what').options].some(o => o.value === keep)) $('what').value = keep;
  $('copyFrom').innerHTML = Object.values(lib.scenes).map(sc => opt(sc.id, sc.name)).join('');
}

// → { scene, note } for what's picked above
function pickScene() {
  const [kind, id] = $('what').value.split(':'), c = sceneCtx();
  if (kind === 'slot') {
    const k = Scenes.pick({ scenes: slots }, id, { where: $('where').value, allow: c.ask });
    if (!k || !k.variant) return { scene: null, note: 'This slot has nothing to play.' };
    const passed = k.tried.length ? ' Passed over: ' + k.tried.map(x => `${x.id || x.tier} (${x.why})`).join(', ') + '.' : '';
    return { scene: Sc.resolve(k.variant, lib), note: `The ${TIER[k.tier]} version "${k.variant.id}" plays.` + passed };
  }
  const scene = kind === 'mine' ? Mine.scenesOf(mineSet)[id] : lib.scenes[id];
  if (!scene) return { scene: null, note: 'That scene is gone.' };
  const a = Sc.ask(scene, scene, c);
  return { scene, note: a.ok ? 'Played directly (not through a slot).' : `Played directly. Through a slot it would NOT show right now: ${a.why}` };
}

function play(scene, note) {
  stopped = false;
  $('picked').textContent = note || '';
  $('stopBtn').hidden = $('whose').value !== 'desktop';
  if (!scene) { $('player').textContent = ''; return; }
  // the ctx is built once per scene, like in the game; "She says stop" sets it for the next thing you do
  liveCtx = sceneCtx();
  player = createScenePlayer($('player'), { scene, lib, ctx: liveCtx, seed: Number($('seed').value) || 1, tune: getTune(), names: base.names, npcs: S().npcs, debug: true,
    onEnd: () => { drawMem(); } });
  drawMem();
}

function drawMem() {
  const kv = (o) => Object.entries(o).map(([k, v]) => `<span class="chip">${esc(k)}${v === true ? '' : ': ' + esc(v)}</span>`).join('') || '<span class="note">nothing yet</span>';
  const mine = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => /^(scene|album|mark)\./.test(k)));
  $('mem').innerHTML = `<h4>Played / firsts</h4>${kv(mine(g.s.seen))}<h4>Marks, album parts, how it last ended</h4>${kv(mine(g.s.flags))}`;
  const al = Sc.album(everyScene(), sceneCtx(true).mem);
  $('album').innerHTML = al.map(a => `<div><b>${esc(a.name)}</b>: ${a.parts.map(p => (p.have ? esc(p.name) : '· · ·')).join(' / ')}</div>`).join('') || 'Nothing reached yet.';
}

function drawSlots() {
  const c = sceneCtx();
  $('slots').innerHTML = '<tr><th>Slot</th><th>Where</th><th>Plays</th><th>Versions</th><th>Passed over</th></tr>' + Object.entries(slots).map(([id, s]) => ['home', 'camp', 'alone'].map((where, i) => {
    const k = Scenes.pick({ scenes: slots }, id, { where, allow: c.ask, rnd: () => 0 });
    const have = Scenes.TIERS_HIGH_FIRST.slice().reverse().map(t => { const own = Mine.variantsFor(mineSet, id, t).length; return `${TIER[t]}: ${(s.variants[t] || []).length}${own ? ' + ' + own + ' of yours' : ''}`; }).join(' · ');
    return `<tr>${i ? '' : `<td rowspan="3"><b>${esc(s.name)}</b><br><span class="note">${esc(id)}</span></td>`}<td>${where === 'alone' ? 'she stayed home' : 'at ' + where}</td><td>${k && k.variant ? `<b>${TIER[k.tier]}</b> · ${esc(k.variant.id)}${Scenes.isFull(k.variant) ? ' (a full scene)' : ''}` : 'nothing'}</td>${i ? '' : `<td rowspan="3" class="note">${have}</td>`}<td class="note">${esc((k?.tried || []).map(x => `${x.id || x.tier}: ${x.why}`).join(' · '))}</td></tr>`;
  }).join('')).join('');
}

// ---------------------------------------------------------------
// the scene maker. `draft` = { on, slot, scene } being edited (a copy; nothing is kept until Save)

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'class') e.className = v; else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
const again = () => drawEditor();
const text = (obj, key, ph = '', o = {}) => el('input', { type: 'text', placeholder: ph, value: obj[key] ?? '', maxlength: o.max || 400, on: { input: (e) => { const v = e.target.value; if (v === '' && !o.keep) delete obj[key]; else obj[key] = v; if (o.then) o.then(); } } });
function pickOne(obj, key, options, o = {}) {
  const cur = obj[key] ?? o.dflt ?? '';
  const s = el('select', { on: { change: (e) => { let v = e.target.value; if (o.num) v = v === '' ? undefined : Number(v); if (v === '' || v === undefined || v === o.dflt) delete obj[key]; else obj[key] = v; (o.then || again)(); } } },
    options.map(([v, n]) => el('option', { value: v, selected: String(v) === String(cur) }, n)));
  return s;
}
const lab = (label, control, cls = '') => el('label', { class: cls }, label, control);
const check = (label, on, fn) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!on, on: { change: (e) => fn(e.target.checked) } }), label);
const TIERS = [['everyday', 'Everyday'], ['flirty', 'Flirty'], ['adult', '18+']];
const BONDS = [['', 'any bond'], ...STAGES.map((s, i) => [i + 1, 'from ' + s])];
const FACE_OPTS = Object.keys(FACES).map(f => [f, `${f}  ${FACES[f]}`]);
const who = () => [['', 'her'], ['narrator', 'narration']];
const freeId = (prefix, taken) => { for (let i = 1; ; i++) if (!taken.includes(prefix + i)) return prefix + i; };

// a list of lines: [who][face][when][words][✕] + "Add a line". o.first: a line can be for the first time only / for
// later times only; o.band: a line can be for how she feels (kept as the engine's by-feeling pools, see tidy())
const FIRST_OPTS = [['', 'every time'], ['first', 'first time only'], ['again', 'later times only']];
const BAND_OPTS = [['', 'however she feels'], ['low', 'settling in'], ['mid', 'warming up'], ['high', 'glowing'], ['peak', 'at the top']];
function linesEd(owner, key, label, o = {}) {
  const list = (owner[key] ||= []);
  for (let i = 0; i < list.length; i++) if (typeof list[i] === 'string') list[i] = { t: list[i] };
  const box = el('div', { class: 'lines' });
  const firstSel = (b) => el('select', { on: { change: (e) => { const v = e.target.value; b.when = { ...(b.when || {}) }; delete b.when.first; if (v) b.when.first = v === 'first'; if (!Object.keys(b.when).length) delete b.when; } } },
    FIRST_OPTS.map(([v, n]) => el('option', { value: v, selected: v === (b.when?.first === true ? 'first' : b.when?.first === false ? 'again' : '') }, n)));
  list.forEach((b, i) => box.append(el('div', { class: 'ln' }, pickOne(b, 'who', who(), { then: () => {} }), pickOne(b, 'face', FACE_OPTS, { dflt: 'neutral', then: () => {} }),
    o.first && firstSel(b), o.band && pickOne(b, '_b', BAND_OPTS, { then: () => {} }), text(b, 't', 'what is said', { keep: true }),
    el('button', { type: 'button', title: 'Remove this line', on: { click: () => { list.splice(i, 1); if (!list.length && key !== 'opening' && key !== 'beats') delete owner[key]; again(); } } }, '✕'))));
  box.append(el('div', {}, el('button', { type: 'button', on: { click: () => { list.push({ face: 'neutral', t: '' }); again(); } } }, '+ ' + label)));
  return box;
}
const rating = (x) => [lab('Rating', pickOne(x, 'tier', TIERS, { dflt: 'everyday' })), lab('Her bond', pickOne(x, 'minStage', BONDS, { num: true }))];
const sc = () => draft.scene;
const phaseOpts = () => Object.entries(sc().phases).map(([id, p]) => [id, p.name || id]);
const endOpts = () => [...Object.entries(sc().endings).map(([id, e]) => ['end:' + id, 'ends: ' + (e.name || id)]), ['end:leave', 'ends: that\'s enough for now']];
const partOpts = () => [['', 'no album part'], ...(sc().album?.parts || []).map(p => [p.id, p.name || p.id])];
const layerDefs = () => Sc.layersOf(sc(), lib);

function forget(kind, id) {   // remove something and every pointer to it, so the scene stays whole
  const s = sc();
  if (kind === 'action') { delete s.actions[id]; for (const p of Object.values(s.phases)) p.actions = (p.actions || []).filter(a => a !== id); }
  if (kind === 'phase') {
    delete s.phases[id];
    for (const p of Object.values(s.phases)) { p.next = (p.next || []).filter(n => n.to !== id); if (p.fade?.to === id) delete p.fade; }
    for (const a of Object.values(s.actions)) if (a.to === id) delete a.to;
    for (const e of Object.values(s.endings)) if (e.when?.phase === id) { delete e.when.phase; if (!Object.keys(e.when).length) delete e.when; }
    if (s.start === id) s.start = Object.keys(s.phases)[0] || '';
  }
  if (kind === 'ending') { delete s.endings[id]; for (const p of Object.values(s.phases)) if (p.fade?.to === 'end:' + id) delete p.fade; }
  if (kind === 'part') { s.album.parts = s.album.parts.filter(p => p.id !== id); for (const x of [...Object.values(s.phases), ...Object.values(s.endings)]) if (x.part === id) delete x.part; }
  if (kind === 'layer') { delete s.layerDefs[id]; for (const x of [s, ...Object.values(s.phases)]) if (x.layers) delete x.layers[id]; for (const a of Object.values(s.actions)) if (a.layer) { delete a.layer[id]; if (!Object.keys(a.layer).length) delete a.layer; } }
  again();
}
const card = (kind, id, obj, ph, ...body) => el('div', { class: 'card' }, el('div', { class: 'head' }, text(obj, 'name', ph, { keep: true, max: 60 }),
  el('button', { type: 'button', title: 'Remove', on: { click: () => forget(kind, id) } }, '✕')), ...body);

function drawEditor() {
  const host = $('editor');
  host.textContent = '';
  if (!draft) { host.append(el('p', { class: 'note' }, 'Pick one of your scenes, or start a new one.')); return; }
  const s = sc(), full = !s.simple, rated = (s.tier || 'everyday') !== 'everyday';
  const slotOpts = [['', 'no slot yet (test and album only)'], ...Object.entries(slots).map(([id, sl]) => [id, sl.name])];
  host.append(el('h3', {}, draftAt < 0 ? 'A new scene' : 'Editing: ' + (s.name || s.id)),
    el('div', { class: 'f' },
      lab('Name', text(s, 'name', 'e.g. Rain on the roof', { keep: true, max: 60 })),
      lab('Plays in', pickOne(draft, 'slot', slotOpts, { then: again })),
      lab('Where', pickOne(s, 'where', [['', 'anywhere'], ['home', 'at home'], ['camp', 'at a camp'], ['alone', 'when she stayed home']])),
      lab('Rating (what\'s on screen decides)', pickOne(s, 'tier', TIERS, { dflt: 'everyday', then: () => { if ((s.tier || 'everyday') === 'everyday') { delete s.minStage; delete s.consent; delete s.agreement; } again(); } })),
      rated && lab('Her bond', pickOne(s, 'minStage', BONDS, { num: true })),
      lab('Who it\'s with', pickOne(s, 'who', [['', 'her'], ...Object.entries(S().npcs).map(([id, n]) => [id, n.name])])),
      rated && lab('Her say', pickOne(s, 'consent', [['', 'in the moment'], ['beforehand', 'agreed beforehand']], { then: () => { if (!s.consent) delete s.agreement; again(); } })),
      rated && s.consent === 'beforehand' && lab('The agreement\'s name (a story flag of yours gives it)', text(s, 'agreement', 'e.g. my_agreement', { max: 40 }))),
    lab('What it is, in a line', text(s, 'line', 'for your own list', { max: 200 }), 'blk'),
    el('h4', {}, full ? 'The opening (something ordinary to start from)' : 'The lines'), linesEd(s, 'opening', 'Add a line', { first: full }));

  if (full) {
    const acts = Object.entries(s.actions), allActs = Sc.actionsOf(s, lib), ord = Object.keys(lib.ordinary);
    host.append(
      el('h4', {}, 'The look (stand-in art: these are words for now)'),
      el('div', { class: 'f' },
        lab('Setting', pickOne(s, 'setting', [['', '—'], ...Object.entries(lib.settings).map(([id, v]) => [id, v.name])])),
        lab('Her pose', pickOne(s, 'pose', [['', '—'], ...Object.entries(lib.poses).map(([id, v]) => [id, v.name])])),
        lab('What her meter is called', text((s.meter ||= {}), 'name', 'e.g. Cozy', { max: 30 }))),
      el('div', {}, el('span', { class: 'note' }, 'Outfits on the outfit wheel: '), ...Object.entries(lib.outfits).map(([id, o]) => check(o.name, (s.outfits || []).includes(id), (on) => { s.outfits = (s.outfits || []).filter(k => k !== id); if (on) s.outfits.push(id); if (!s.outfits.length) delete s.outfits; }))),
      el('div', {}, el('span', { class: 'note' }, 'Ordinary things that fit here (at least one always stays): '), ...ord.map(id => check(lib.ordinary[id].name, !s.ordinary || s.ordinary.includes(id), (on) => { const cur = (s.ordinary || ord).filter(k => k !== id); if (on) cur.push(id); if (cur.length === ord.length) delete s.ordinary; else s.ordinary = cur; again(); }))),

      el('h4', {}, 'Layers of its own (clothing, props, marks)'),
      ...Object.entries(s.layerDefs || {}).map(([id, d]) => card('layer', id, d, 'e.g. Her scarf',
        el('div', { class: 'f' }, lab('It is', pickOne(d, 'kind', [['clothing', 'clothing'], ['prop', 'a prop'], ['mark', 'a mark (it can stay for days)']])),
          lab('Its states, the first is "not there"', el('input', { type: 'text', value: d.states.join(', '), on: { change: (e) => { d.states = e.target.value.split(',').map(x => x.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')).filter(Boolean); again(); } } })),
          d.kind === 'mark' && lab('Stays for how many days', pickOne(d, 'persist', [['', 'only this scene'], [1, 'a day'], [2, 'two days'], [7, 'a week']], { num: true }))),
        el('div', { class: 'f' }, ...d.states.slice(1).map(st => lab(`Rating of "${st}"`, pickOne((d.tiers ||= {}), st, TIERS, { dflt: 'everyday' })))))),
      el('div', {}, el('button', { type: 'button', on: { click: () => { (s.layerDefs ||= {})[freeId('layer', Object.keys(layerDefs()))] = { name: '', kind: 'prop', states: ['off', 'on'] }; again(); } } }, '+ Add a layer')),

      el('h4', {}, 'Things to do (the wheel)'),
      ...acts.map(([id, a]) => {
        const lay = Object.entries(a.layer || {})[0] || ['', ''];
        return card('action', id, a, 'e.g. Brush her hair',
          el('div', { class: 'f' }, ...rating(a),
            lab('How much it moves her', pickOne(a, 'warm', [['', 'some'], [0, 'not at all'], [4, 'a little'], [14, 'a lot'], ...([undefined, 0, 4, 14].includes(a.warm) ? [] : [[a.warm, 'as it is']])], { num: true })),
            lab('Then the scene goes to', pickOne(a, 'to', [['', 'stays where it is'], ...phaseOpts(), ...endOpts()])),
            lab('Changes a layer', el('select', { on: { change: (e) => { const lid = e.target.value; if (!lid) delete a.layer; else a.layer = { [lid]: layerDefs()[lid].states[1] }; again(); } } }, [['', 'no'], ...Object.entries(layerDefs()).map(([lid, d]) => [lid, d.name || lid])].map(([v, n]) => el('option', { value: v, selected: v === lay[0] }, n)))),
            lay[0] && lab('… to', el('select', { on: { change: (e) => { a.layer = { [lay[0]]: e.target.value }; } } }, (layerDefs()[lay[0]]?.states || []).map(st => el('option', { value: st, selected: st === lay[1] }, st))))),
          el('div', {}, check('Only once per scene', a.once, (on) => { if (on) a.once = true; else delete a.once; })),
          el('span', { class: 'note' }, 'What she says (one of these each time):'), linesEd(a, 'say', 'Add a line', { band: true }),
          el('span', { class: 'note' }, 'The very first time, instead (optional):'), linesEd(a, 'first', 'Add a first-time line'),
          lab('Her words when she asks for it herself (optional)', text(a, 'wish', 'leave empty and she never asks'), 'blk'));
      }),
      el('div', {}, el('button', { type: 'button', on: { click: () => { s.actions[freeId('act', Object.keys(allActs))] = { name: '', say: [{ face: 'neutral', t: '' }] }; again(); } } }, '+ Add something to do')),

      el('h4', {}, 'Phases (a loop she stays in)'),
      ...Object.entries(s.phases).map(([id, p]) => {
        const gated = (p.tier || 'everyday') !== 'everyday' || p.minStage;
        return card('phase', id, p, 'e.g. On the roof',
          el('div', {}, check('The scene starts here', s.start === id, () => { s.start = id; again(); })),
          el('div', { class: 'f' }, lab('Her loop (what she\'s doing)', text(p, 'loop', 'e.g. She watches the rain, chin on her knees')), ...rating(p), lab('Album part reached here', pickOne(p, 'part', partOpts()))),
          gated && el('div', { class: 'f' }, lab('If this can\'t show: one line of narration', text((p.fade ||= { t: '', to: 'end:leave' }), 't', 'e.g. The rain keeps its own time.', { keep: true })), lab('… and then', pickOne(p.fade, 'to', [...phaseOpts().filter(([k]) => k !== id), ...endOpts()], { then: () => {} }))),
          el('span', { class: 'note' }, 'Said on entering:'), linesEd(p, 'beats', 'Add a line', { first: true }),
          el('div', {}, el('span', { class: 'note' }, 'On the wheel here: '), ...acts.map(([aid, a]) => check(a.name || aid, (p.actions || []).includes(aid), (on) => { p.actions = (p.actions || []).filter(k => k !== aid); if (on) p.actions.push(aid); }))),
          el('span', { class: 'note' }, 'It can move on to:'),
          el('div', { class: 'lines' }, ...(p.next || []).map((n, i) => el('div', { class: 'ln mv' },
            pickOne(n, 'to', phaseOpts().filter(([k]) => k !== id), { then: () => {} }),
            pickOne(n, 'by', [['pick', 'by your pick'], ['her', 'by her say'], ['meter', 'when she feels it']], { dflt: 'pick' }),
            pickOne(n, 'at', [['', 'any time'], [34, 'once she\'s warming up'], [67, 'once she\'s glowing'], [92, 'near the top']], { num: true, then: () => {} }),
            (n.by || 'pick') === 'pick' ? text(n, 'name', 'what the button says', { max: 40 }) : el('span', {}),
            el('button', { type: 'button', on: { click: () => { p.next.splice(i, 1); again(); } } }, '✕'))),
            el('div', {}, el('button', { type: 'button', disabled: Object.keys(s.phases).length < 2, on: { click: () => { (p.next ||= []).push({ to: Object.keys(s.phases).find(k => k !== id) }); again(); } } }, '+ Add a way on'))));
      }),
      el('div', {}, el('button', { type: 'button', on: { click: () => { const id = freeId('p', Object.keys(s.phases)); s.phases[id] = { name: '', loop: '', actions: [] }; if (!s.start) s.start = id; again(); } } }, '+ Add a phase')),

      el('h4', {}, 'Endings ("That\'s enough for now" is always there)'),
      ...Object.entries(s.endings).map(([id, e]) => card('ending', id, e, 'e.g. Say goodnight',
        el('div', { class: 'f' }, lab('It ends', pickOne(e, 'kind', [['story', 'back in the story'], ['morning', 'the morning after'], ['afterglow', 'in an afterglow'], ['interrupt', 'interrupted by the story']], { dflt: 'story', then: () => {} })), ...rating(e),
          lab('Only once she feels', pickOne((e.when ||= {}), 'band', [['', 'any time'], ['mid', 'warming up'], ['high', 'glowing'], ['peak', 'at the top']], { then: () => {} })),
          lab('Only in', pickOne(e.when, 'phase', [['', 'any phase'], ...phaseOpts()], { then: () => {} })),
          lab('Album part', pickOne(e, 'part', partOpts(), { then: () => {} }))),
        linesEd(e, 'beats', 'Add a line'))),
      el('div', {}, el('button', { type: 'button', on: { click: () => { s.endings[freeId('end', Object.keys(s.endings))] = { name: '', beats: [{ face: 'neutral', t: '' }] }; again(); } } }, '+ Add an ending')),

      el('h4', {}, 'The album (parts you can look at again, each with a line from her)'),
      el('div', { class: 'lines' }, ...(s.album?.parts || []).map(p => el('div', { class: 'ln two' }, text(p, 'name', 'the part\'s name', { keep: true, max: 60 }), text(p, 'line', 'her line about it'),
        el('button', { type: 'button', on: { click: () => forget('part', p.id) } }, '✕')))),
      el('div', {}, el('button', { type: 'button', on: { click: () => { ((s.album ||= { parts: [] }).parts ||= []).push({ id: freeId('part', (s.album.parts || []).map(p => p.id)), name: '', line: '' }); again(); } } }, '+ Add an album part')));
  }
  const probs = el('div', { class: 'probs', id: 'probs' });
  host.append(probs, el('div', { class: 'btns' },
    el('button', { type: 'button', on: { click: () => { const bad = problems(); probs.className = bad.length ? 'probs' : 'good'; probs.textContent = bad.length ? bad.join('\n') : ['No problems: it can be saved.', ...heads()].join('\n'); } } }, 'Check it'),
    el('button', { type: 'button', on: { click: testDraft } }, 'Test it'),
    el('button', { type: 'button', on: { click: saveDraft } }, 'Save'),
    el('button', { type: 'button', on: { click: () => { draft = null; draftAt = -1; drawMine(); drawEditor(); } } }, 'Close without saving')));
}

// the draft as it would be kept (empty optional bits tidied away), and what's wrong with it
function tidy() {
  const s = clone(sc());
  const strip = (x) => { for (const k of ['say', 'first', 'beats']) if (Array.isArray(x[k])) { x[k] = x[k].filter(b => b && b.t && b.t.trim()); if (!x[k].length && k !== 'beats') delete x[k]; } if (x.when && !Object.keys(x.when).length) delete x.when; if (x.fade && (x.tier || 'everyday') === 'everyday' && !x.minStage) delete x.fade; };
  s.opening = (s.opening || []).filter(b => b && b.t && b.t.trim());
  if (s.simple) { for (const k of ['phases', 'actions', 'endings']) s[k] = {}; for (const k of ['start', 'album', 'layers', 'layerDefs', 'outfits', 'meter', 'setting', 'pose', 'ordinary']) delete s[k]; }
  else {
    for (const x of [...Object.values(s.phases), ...Object.values(s.actions), ...Object.values(s.endings)]) strip(x);
    for (const a of Object.values(s.actions)) {
      if (!Array.isArray(a.say)) continue;
      if (a.say.some(b => b._b)) { const by = {}; for (const b of a.say) { const band = b._b || 'low'; delete b._b; (by[band] ||= []).push(b); } a.say = by; }
    }
    if (s.meter && !s.meter.name) delete s.meter;
    if (s.album && !(s.album.parts || []).length) delete s.album;
    if (s.layerDefs && !Object.keys(s.layerDefs).length) delete s.layerDefs;
    const defs = Sc.layersOf(s, lib);
    s.layers = { ...Object.fromEntries(Object.entries(s.layers || {}).filter(([id, st]) => defs[id] && defs[id].states.includes(st))), ...Object.fromEntries(Object.entries(s.layerDefs || {}).map(([id, d]) => [id, d.states[0]])) };
    if (!Object.keys(s.layers).length) delete s.layers;
  }
  if (!s.id) s.id = Mine.slug(s.name, [...mineSet.list.map(en => en.scene.id), ...Object.keys(lib.scenes)]);
  return s;
}
function problems() {
  const s = tidy(), sl = draft.slot ? slots[draft.slot] : null;
  const bad = Sc.checkScene(s, lib, { npcs: S().npcs });
  if (draft.slot && !sl) bad.push('The slot it plays in doesn\'t exist any more.');
  return bad;
}
// not a problem, but worth knowing before he wonders why it never plays
function heads() {
  const s = sc(), out = [];
  if (!Gate.canTag(Gate.comfort().flavor, s.tier || 'everyday')) out.push(`With "${(Gate.FLAVORS.find(f => f[0] === Gate.comfort().flavor) || [])[1]}" as what you are to each other, a ${TIER[s.tier]} scene never shows.`);
  if (!draft.slot) out.push('It has no slot yet, so the game never plays it by itself (test and album only).');
  if (!mineSet.on) out.push('"Use my scenes" is off, so none of your scenes plays in the game right now.');
  return out;
}
function testDraft() {
  const bad = problems();
  const probs = $('probs');
  if (bad.length) { probs.className = 'probs'; probs.textContent = 'Fix these first:\n' + bad.join('\n'); return; }
  const s = tidy(), a = Sc.ask(s, s, sceneCtx());
  play(s, a.ok ? 'Testing your scene (the sandbox\'s memory, the real gate).' : `Testing your scene. In the game it would NOT show right now: ${a.why}`);
  $('player').scrollIntoView({ block: 'center' });
}
function saveDraft() {
  const bad = problems();
  const probs = $('probs');
  if (bad.length) { probs.className = 'probs'; probs.textContent = 'It can\'t be saved yet:\n' + bad.join('\n'); return; }
  const entry = { on: draft.on !== false, slot: draft.slot || null, scene: tidy() };
  const next = clone(mineSet);
  if (draftAt >= 0) next.list[draftAt] = entry; else next.list.push(entry);
  if (keep(next, [`Saved "${entry.scene.name}".`, ...heads()].join(' '))) { draftAt = mineSet.list.findIndex(en => en.scene.id === entry.scene.id); draft = clone(mineSet.list[draftAt]); unband(draft.scene); drawEditor(); }
}
// keep the set on this PC (the door checks it once more) and redraw everything that shows it
function keep(next, said) {
  const r = SceneDoor.saveMine(next);
  if (r.error) { $('mineNote').textContent = r.error; return false; }
  mineSet = r.mine;
  $('mineNote').textContent = said + (r.dropped.length ? ' Left out: ' + r.dropped.map(d => `${d.name} (${d.why})`).join('; ') : '');
  drawMine(); drawWhat(); drawSlots();
  return true;
}

function drawMine() {
  $('mineOn').checked = mineSet.on;
  const host = $('mineList');
  host.textContent = '';
  if (!mineSet.list.length) host.append(el('p', { class: 'note' }, 'None yet.'));
  mineSet.list.forEach((en, i) => {
    const s = en.scene, del = el('button', { type: 'button' }, 'Delete');
    del.addEventListener('click', () => { if (del.dataset.sure) { const next = clone(mineSet); next.list.splice(i, 1); if (draftAt === i) { draft = null; draftAt = -1; drawEditor(); } else if (draftAt > i) draftAt -= 1; keep(next, `Deleted "${s.name}".`); } else { del.dataset.sure = '1'; del.textContent = 'Sure? Click again'; } });
    host.append(el('div', { class: 'entry' + (i === draftAt ? ' cur' : '') },
      el('b', {}, s.name, el('span', { class: 'tierb ' + (s.tier || 'everyday') }, TIER[s.tier || 'everyday'])),
      el('span', { class: 'note' }, `${s.simple ? 'A few lines' : 'A full scene'} · ${en.slot ? 'plays in: ' + (slots[en.slot]?.name || en.slot) : 'no slot yet'}`),
      el('div', { class: 'btns' }, check('On', en.on, (on) => { const next = clone(mineSet); next.list[i].on = on; keep(next, on ? `"${s.name}" is on.` : `"${s.name}" is off.`); }),
        el('button', { type: 'button', on: { click: () => { draftAt = i; draft = clone(en); unband(draft.scene); drawMine(); drawEditor(); } } }, 'Edit'),
        el('button', { type: 'button', on: { click: () => { $('what').value = 'mine:' + s.id; const p = pickScene(); play(p.scene, p.note); $('player').scrollIntoView({ block: 'center' }); } } }, 'Play'), del)));
  });
}
// her by-feeling pools ({ low: [...], high: [...] }) become one list with a "when she's …" pick per line while editing
function unband(scene) {
  for (const a of Object.values(scene.actions || {})) if (a.say && !Array.isArray(a.say)) a.say = Object.entries(a.say).flatMap(([band, l]) => (l || []).map(b => ({ ...(typeof b === 'string' ? { t: b } : b), _b: band })));
  return scene;
}
function newDraft(scene, slot = null) { draftAt = -1; draft = { on: true, slot, scene: unband(scene) }; drawMine(); drawEditor(); $('editor').scrollIntoView({ block: 'nearest' }); }

// ---------------------------------------------------------------

function runSim() {
  const { scene } = pickScene();
  if (!scene || scene.simple) { $('simOut').textContent = 'Pick a full scene above (a few lines have nothing to play).'; return; }
  const n = Math.max(5, Math.min(1000, Number($('simN').value) || 100)), c = sceneCtx();
  const m = Sc.many(scene, lib, { ...c, mem: undefined }, n, { seed: Number($('seed').value) || 1, tune: getTune() });
  const pc = (v) => Math.round(100 * (v || 0) / n) + '%';
  const nm = (o, id) => o?.[id]?.name || id;
  $('simOut').innerHTML = `<b>${esc(scene.name)}</b>, ${n} plays, each a first time. About ${m.meanDid.toFixed(1)} things done per play.
    <br>How it ended: ${Object.entries(m.ends).map(([id, v]) => `${esc(id === 'leave' ? 'that\'s enough for now' : nm(scene.endings, id))} ${pc(v)}`).join(' · ')}.
    <br>Phases reached: ${Object.keys(scene.phases).map(id => `${esc(nm(scene.phases, id))} ${id === scene.start ? '100%' : pc(m.phases[id])}`).join(' · ')}.
    <br>She moved things along herself ${(m.herMoves / n).toFixed(1)}× a play, asked for something ${(m.wishes / n).toFixed(1)}× (got it ${Math.round(100 * m.wishesMet / Math.max(1, m.wishes))}% of the time); a fade stood in ${(m.fades / n).toFixed(2)}× a play.
    <br>Most done: ${Object.entries(m.actions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => `${esc(nm(Sc.actionsOf(scene, lib), id))} ${(v / n).toFixed(1)}`).join(' · ')}.`
    + (m.never.phases.length || m.never.endings.length ? `<br><span class="warn">Never reached with this bond and these switches: ${esc([...m.never.phases.map(id => nm(scene.phases, id)), ...m.never.endings.map(id => nm(scene.endings, id))].join(', '))}</span>` : '')
    + (m.errors.length ? `<br><span class="warn">Problems: ${esc(m.errors.join(' · '))}</span>` : '');
}
function drawTune() {
  $('tune').innerHTML = Object.entries(DEFAULTS).map(([grp, vals]) => `<h3>${esc(grp)}</h3><div class="tune">` + Object.entries(vals).map(([k, v]) =>
    `<label>${esc(k)} <input type="number" step="any" data-g="${grp}" data-k="${k}" value="${tuneOver[grp]?.[k] ?? v}"${tuneOver[grp]?.[k] !== undefined ? ' style="border-color:var(--accent)"' : ''}></label>`).join('') + '</div>').join('');
}

async function init() {
  data = await Door.loadData();
  lib = S().lib;
  let delveSlots = {};
  try { delveSlots = (await fetch('data/delve.json', { cache: 'no-cache' }).then(r => r.json())).scenes || {}; } catch (e) { /* the story's and the shared ones still show */ }
  slots = { ...lib.slots, ...delveSlots, ...S().scenes };
  mineSet = SceneDoor.mine();
  let her = 'she';
  try { her = (localStorage.getItem('omega.names.bot') || '').trim() || 'she'; } catch (e) {}
  document.querySelectorAll('.herName').forEach(e => { e.textContent = her; });
  g = En.newGame(S(), 1);
  // what's real: the gate's switches, her bond, names. The memory is the sandbox's.
  base = await Door.context(data, g).catch(() => ({ names: Door.names(), stage: 1, levels: { player: {}, jun: {} } }));
  $('bond').innerHTML = STAGES.map((s, i) => `<option value="${i + 1}"${i + 1 === base.stage ? ' selected' : ''}>${s}${i + 1 === base.stage ? ' (as it is)' : ''}</option>`).join('');
  drawWhat(); drawSlots(); drawMine(); drawEditor(); drawTune(); drawMem();
  if (SceneDoor.dropped().length) $('mineNote').textContent = 'Left out of your scenes: ' + SceneDoor.dropped().map(d => `${d.name} (${d.why})`).join('; ');

  $('playBtn').onclick = () => { const p = pickScene(); play(p.scene, p.note); };
  $('stopBtn').onclick = () => { stopped = true; if (liveCtx) liveCtx.stop = true; $('picked').textContent = 'She said stop: the next thing you do ends the scene, kindly. (Desktop Jun only; the game never passes a stop signal.)'; };
  $('forget').onclick = () => { g = En.newGame(S(), 1); $('player').textContent = ''; $('picked').textContent = 'The sandbox remembers nothing again.'; drawMem(); };
  for (const id of ['bond', 'flirty', 'whose']) $(id).onchange = drawSlots;   // a scene already playing keeps the gate it started with: press Play again
  Gate.onComfort(drawSlots);
  SceneDoor.watch((m) => { mineSet = m; drawMine(); drawWhat(); drawSlots(); });

  $('mineOn').onchange = (e) => keep({ ...clone(mineSet), on: e.target.checked }, e.target.checked ? 'Your scenes are on.' : 'Your scenes are off: none of them plays anywhere.');
  $('newSimple').onclick = () => newDraft({ name: '', tier: 'everyday', simple: true, opening: [{ face: 'neutral', t: '' }], phases: {}, actions: {}, endings: {} }, 'coming_home' in slots ? 'coming_home' : null);
  $('newFull').onclick = () => newDraft({ name: '', tier: 'everyday', setting: 'home_evening', pose: 'couch', opening: [{ who: 'narrator', t: '' }], start: 'p1',
    phases: { p1: { name: '', loop: '', actions: ['act1'] } }, actions: { act1: { name: '', say: [{ face: 'neutral', t: '' }] } }, endings: { end1: { name: 'Say goodnight', beats: [{ face: 'neutral', t: '' }] } } }, 'evening_together' in slots ? 'evening_together' : null);
  $('copyBtn').onclick = () => { const src = clone(lib.scenes[$('copyFrom').value]); delete src.id; src.name = 'My ' + src.name[0].toLowerCase() + src.name.slice(1); const from = Object.entries(lib.slots).find(([, sl]) => Object.values(sl.variants).flat().some(v => v.scene === $('copyFrom').value)); newDraft(src, from ? from[0] : null); };
  $('download').onclick = () => { const a = el('a', { href: URL.createObjectURL(new Blob([Mine.toFile(mineSet, { made: Date.now() })], { type: 'application/json' })), download: 'my-scenes.junscenes' }); document.body.append(a); a.click(); a.remove(); };
  $('upload').onclick = () => $('uploadFile').click();
  $('uploadFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = Mine.fromFile(await f.text(), lib, mineSet, { npcs: S().npcs });
    if (r.error) { $('mineNote').textContent = r.error; return; }
    const next = clone(mineSet); next.list.push(...r.list.map(en => ({ ...en, slot: en.slot && slots[en.slot] ? en.slot : null })));
    keep(next, `Added ${r.list.length} scene${r.list.length === 1 ? '' : 's'}.` + (r.rated ? ` ${r.rated} rated one${r.rated === 1 ? '' : 's'} arrived switched off: look ${r.rated === 1 ? 'it' : 'them'} over, then switch ${r.rated === 1 ? 'it' : 'them'} on.` : '') + (r.dropped.length ? ' Left out: ' + r.dropped.map(d => `${d.name} (${d.why})`).join('; ') : ''));
  };
  $('check').onclick = () => {
    const bad = [...Sc.checkLibrary(lib, { shipped: true, npcs: S().npcs }), ...Scenes.checkSlots({ scenes: slots }),
      ...mineSet.list.flatMap(en => Sc.checkScene(en.scene, lib, { npcs: S().npcs }).map(k => `yours, "${en.scene.name}": ${k}`)), ...SceneDoor.dropped().map(d => `yours, left out: ${d.name} (${d.why})`)];
    $('checkOut').textContent = bad.length ? bad.join('\n') : `All good: ${Object.keys(lib.scenes).length} full scenes, ${Object.keys(slots).length} slots and ${mineSet.list.length} of your own keep every rule.`;
  };
  $('simRun').onclick = runSim;
  $('tuneReset').onclick = () => { tuneOver = {}; setOverrides({}); drawTune(); };
  $('tune').addEventListener('change', (e) => {
    const { g: grp, k } = e.target.dataset, v = Number(e.target.value);
    if (!grp || !Number.isFinite(v)) return;
    (tuneOver[grp] ||= {})[k] = v;
    if (v === DEFAULTS[grp][k]) delete tuneOver[grp][k];
    setOverrides(tuneOver); drawTune();
  });
}
init().catch((e) => { document.querySelector('header p').textContent = 'The lab could not start: ' + (e && e.message); console.error(e); });
