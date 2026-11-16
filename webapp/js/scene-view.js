// how a full scene shows on screen (#22): ONE small player shared by the story page in the game world, the album
// ("Moments together") and the scene lab. STAND-IN ART on purpose: the setting, her pose and loop, the shot and the
// layers are words in a box, her face is the stand-in ASCII one; the real rigs and paintings come with the art (#5).
// It only draws what the scene engine's events say and sends the player's picks back; no rules here.
//
//   const p = createScenePlayer(host, { scene, lib, ctx, seed, names, npcs, debug, onEnd: (endingId, run) => … });
//   p.run     the run as it stands (plain data)
//
// The two wheels: what you can do (the ordinary things are always there) and her outfits. Under them: where the
// moment can move on to, and how it can end ("That's enough for now" is always there).

import * as Sc from './core/scene/scene-engine.js?v=3';
import { FACES, CSS as STORY_CSS } from './story-view.js?v=4';

const TIER = { everyday: 'Everyday', flirty: 'Flirty', adult: '18+' };
const KIND = { story: '', morning: 'the morning after', afterglow: 'afterglow', interrupt: 'interrupted' };

export const CSS = `
.sc { display: grid; gap: 10px; }
.sc-stage { border: 1px solid var(--sv-edge, #37305a); border-radius: 12px; padding: 10px 12px; background: var(--sc-stage, #141126); display: grid; gap: 6px; }
.sc-top { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--sv-dim, #b9b4d6); }
.sc-top b { color: var(--sv-ink, #fff); font-size: 14px; flex: 1; }
.sc-art { display: flex; gap: 14px; align-items: center; min-height: 64px; }
.sc-art .sc-face { font: 600 26px ui-monospace, monospace; border: 2px solid var(--sv-her, #7ac8ff); border-radius: 14px; padding: 8px 12px; color: var(--sv-ink, #fff); white-space: nowrap; }
.sc-art .sc-loop { color: var(--sv-ink, #fff); }
.sc-art small { display: block; color: var(--sv-dim, #b9b4d6); }
.sc-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.sc-chip { font-size: 11.5px; border: 1px solid var(--sv-edge, #37305a); border-radius: 10px; padding: 1px 8px; color: var(--sv-dim, #b9b4d6); }
.sc-chip.on { border-color: var(--sv-her, #7ac8ff); color: var(--sv-ink, #fff); }
.sc-meter { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; font-size: 12px; color: var(--sv-dim, #b9b4d6); }
.sc-bar { height: 6px; border-radius: 4px; background: var(--sv-edge, #37305a); overflow: hidden; }
.sc-bar i { display: block; height: 100%; background: var(--sv-accent, #ff7aa2); transition: width .5s; }
.sc-log { display: grid; gap: 6px; max-height: 300px; overflow: auto; }
.sc-wheel { border: 1px dashed var(--sv-edge, #37305a); border-radius: 22px; padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.sc-wheel button.wish { border-color: var(--sv-card, #ffd76a); box-shadow: 0 0 0 1px var(--sv-card, #ffd76a); }
.sc-wheel button.on { border-color: var(--sv-her, #7ac8ff); }
.sc-tabs { display: flex; gap: 6px; }
.sc-tabs button { font-size: 12px; padding: 3px 10px; }
.sc-tabs button.on { border-color: var(--sv-accent, #ff7aa2); }
.sc-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--sv-dim, #b9b4d6); }
.sc-end { border: 1px solid var(--sv-card, #ffd76a); border-radius: 12px; padding: 10px 12px; text-align: center; }
.sc button { background: var(--sv-btn, #2f2640); color: var(--sv-ink, #fff); border: 1px solid var(--sv-edge, #37305a); border-radius: 8px; padding: 6px 11px; font: inherit; cursor: pointer; }
.sc button:hover:not(:disabled) { border-color: var(--sv-accent, #ff7aa2); }
.sc button:disabled { opacity: .5; cursor: default; }
.sc .sc-wheel button { border-radius: 18px; }
.sc [hidden] { display: none !important; }
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function createScenePlayer(host, { scene, lib, ctx = {}, seed = 1, tune, names = {}, npcs = {}, debug = false, onEnd } = {}) {
  for (const [id, css] of [['sv-css', STORY_CSS], ['sc-css', CSS]]) if (!document.getElementById(id)) { const st = el('style'); st.id = id; st.textContent = css; document.head.append(st); }
  host.classList.add('sc', 'sv');
  host.textContent = '';
  const whoName = (who) => (who === 'jun' ? (names.her || 'Jun') : who === 'narrator' ? '' : who === 'you' ? 'You' : (npcs[who]?.name || who));
  const defs = Sc.layersOf(scene, lib);
  let wheel = 'actions', face = 'neutral';

  const stage = el('div', 'sc-stage'), top = el('div', 'sc-top'), art = el('div', 'sc-art'), chips = el('div', 'sc-chips'), meter = el('div', 'sc-meter');
  const faceBox = el('div', 'sc-face'), loopBox = el('div', 'sc-loop');
  art.append(faceBox, loopBox);
  stage.append(top, art, chips, meter);
  const log = el('div', 'sc-log');
  const tabs = el('div', 'sc-tabs'), ring = el('div', 'sc-wheel'), move = el('div', 'sc-row'), view = el('div', 'sc-row'), ends = el('div', 'sc-row');
  host.append(stage, log, tabs, ring, move, view, ends);

  const { run, events } = Sc.start(scene, lib, ctx, { seed, tune });
  const say = (node) => { log.append(node); node.scrollIntoView({ block: 'nearest' }); };
  const note = (t, cls = 'sv-note') => say(el('div', cls, t));
  const btn = (label, fn, { off = false, tip = '', cls = '' } = {}) => { const b = el('button', cls, label); b.type = 'button'; b.disabled = off; if (tip) b.title = tip; b.addEventListener('click', fn); return b; };
  const go = (input) => { show(Sc.act(scene, lib, run, input, ctx, tune)); draw(); };

  function show(evs) {
    for (const e of evs) {
      if (e.type === 'beat') {
        const b = el('div', 'sv-beat' + (e.who === 'narrator' ? ' narr' : ''));
        const name = whoName(e.who);
        if (name) { const w = el('div', 'sv-who', name); if (e.who !== 'you') w.append(el('span', 'sv-face', FACES[e.face] || FACES.neutral)); b.append(w); }
        if (e.who !== 'narrator' && e.who !== 'you' && e.face) face = e.face;
        b.append(el('div', '', e.t));
        say(b);
      }
      else if (e.type === 'phase' && e.by !== 'start') note(e.by === 'her' ? `— ${e.name} — (${whoName(scene.who || 'jun')} moved things along)` : `— ${e.name} —`);
      else if (e.type === 'fade') say(el('div', 'sv-beat narr', e.t));
      else if (e.type === 'did') note('› ' + e.name);
      else if (e.type === 'layer' && !e.still) note(`${e.name}: ${e.word}.`);
      else if (e.type === 'outfit') note('› ' + e.name);
      else if (e.type === 'meter') note(`${e.name}: ${e.word}.`);
      else if (e.type === 'first') note('A first.');
      else if (e.type === 'album' && e.first) note(`Kept in your moments: "${e.name}".`);
      else if (e.type === 'end') finish(e);
      else if (e.type === 'error' && debug) note('ERROR: ' + e.why, 'sv-note dbg');
      if (debug && e.type === 'fade') note(`fade instead of "${e.from}": ${e.why}`, 'sv-note dbg');
      if (debug && e.type === 'wish') note(`she asks for: ${e.name}`, 'sv-note dbg');
    }
  }

  function finish(e) {
    const box = el('div', 'sc-end');
    box.append(el('b', '', e.id === 'done' ? scene.name : e.name), el('div', 'sv-note', [KIND[e.kind], e.first ? 'The first time.' : ''].filter(Boolean).join(' · ')));
    for (const pid of e.parts) { const p = (scene.album?.parts || []).find(k => k.id === pid); if (p && p.line) box.append(el('div', 'sv-note', `"${p.name}" — ${whoName(scene.who || 'jun')}: ${ctx.fill ? ctx.fill(p.line) : p.line}`)); }
    const row = el('div', 'sv-acts'); row.style.justifyContent = 'center';
    row.append(btn('Go on', () => { row.remove(); onEnd && onEnd(e.id, run); }));
    box.append(row);
    say(box);
  }

  function draw() {
    const over = !!run.over, ph = scene.phases?.[run.phase];
    top.textContent = '';
    top.append(el('b', '', scene.name), el('span', '', [lib?.settings?.[scene.setting]?.name || scene.setting, lib?.poses?.[scene.pose]?.name || scene.pose, lib?.shots?.[run.shot]?.name || ''].filter(Boolean).join(' · ')));
    if (debug) top.append(el('span', 'sc-chip', TIER[scene.tier || 'everyday']));
    faceBox.textContent = FACES[face] || FACES.neutral;
    loopBox.textContent = '';
    loopBox.append(el('div', '', ph ? ph.loop || ph.name : ''), el('small', '', 'Stand-in art: her pose and loop as words.' + (run.outfit && lib?.outfits?.[run.outfit] ? ' Wearing: ' + lib.outfits[run.outfit].name.toLowerCase() + '.' : '')));
    chips.textContent = '';
    for (const [id, st] of Object.entries(run.layers)) { const d = defs[id]; if (d) chips.append(el('span', 'sc-chip' + (st !== d.states[0] ? ' on' : ''), `${d.name}: ${d.words?.[st] || st}`)); }
    stage.hidden = !!scene.simple;
    const t = tune || undefined, band = over ? null : Sc.options(scene, lib, run, ctx, t).band;
    meter.textContent = '';
    if (!scene.simple) {
      const bar = el('div', 'sc-bar'), fill = el('i'); fill.style.width = Math.round(run.meter) + '%'; bar.append(fill);
      meter.append(el('span', '', `${scene.meter?.name || lib?.meterName || 'How she feels'}: ${lib?.meterWords?.[band || 'low'] || ''}` + (debug ? ` (${Math.round(run.meter)})` : '')), bar);
    }
    for (const box of [tabs, ring, move, view, ends]) { box.textContent = ''; box.hidden = over; }
    if (over) return;
    const op = Sc.options(scene, lib, run, ctx, t);
    const list = (items) => items.filter(k => k.ok || debug);
    if (op.outfits.length) {
      tabs.append(btn('What to do', () => { wheel = 'actions'; draw(); }, { cls: wheel === 'actions' ? 'on' : '' }), btn('Her outfit', () => { wheel = 'outfits'; draw(); }, { cls: wheel === 'outfits' ? 'on' : '' }));
    } else { tabs.hidden = true; wheel = 'actions'; }
    if (wheel === 'actions') for (const a of list(op.actions)) ring.append(btn(`${a.icon ? a.icon + ' ' : ''}${a.name}`, () => go({ action: a.id }), { off: !a.ok, tip: a.ok ? (a.wish ? 'She asked for this.' : '') : a.why, cls: a.wish ? 'wish' : '' }));
    else for (const o of list(op.outfits)) ring.append(btn(o.name, () => go({ outfit: o.id }), { off: !o.ok || o.on, tip: o.ok ? '' : o.why, cls: o.on ? 'on' : '' }));
    const moves = list(op.phases);
    move.hidden = !moves.length;
    if (moves.length) { move.append(el('span', '', 'Move on:')); for (const p of moves) move.append(btn(p.name, () => go({ phase: p.id }), { off: !p.ok, tip: p.why })); }
    view.hidden = op.shots.length < 2 && op.tempos.length < 2;
    if (op.shots.length > 1) { view.append(el('span', '', 'Look:')); for (const s of op.shots) view.append(btn(lib?.shots?.[s.id]?.name || s.id, () => go({ shot: s.id }), { off: s.on, cls: s.on ? 'on' : '' })); }
    if (op.tempos.length > 1) { view.append(el('span', '', 'Pace:')); for (const s of op.tempos) view.append(btn(s.name, () => go({ tempo: s.id }), { off: s.on, cls: s.on ? 'on' : '' })); }
    ends.append(el('span', '', 'End it:'));
    for (const e of list(op.endings)) ends.append(btn(e.name, () => go({ end: e.id }), { off: !e.ok, tip: e.why }));
  }

  show(events);
  draw();
  return { run, redraw: draw };
}
