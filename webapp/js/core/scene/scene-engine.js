// THE SCENE ENGINE (#22). A scene is a moment you stay in for a while: an evening on the couch, cooking together,
// the camp after a close call. It stands ON the pieces built before it, never beside them:
//   which scene plays     the scene SLOTS (../delve/scenes.js): one moment, a variant per tier, the highest tier that
//                         is on AND that she's fine with, always an Everyday one. A variant is either a few lines
//                         (as before) or a FULL scene: that is what this file plays.
//   everything rated      the ONE gate. This file never reads the gate itself: the caller hands it `ctx.ask(item)`,
//                         its own reading of the gate. Game Jun: the story engine's `allowed` (her say is a meter,
//                         themes, a person's own closeness, "agreed beforehand" from story state). Desktop Jun,
//                         later: her live say (trust, tension, her stop signal). THAT is the door for desktop Jun,
//                         together with `mem` below.
//   what it remembers     `ctx.mem` = { day, seen(id), mark(id), get(id), set(id, value) }. Game Jun: story state
//                         (seen counts and flags, so every game save carries it; story-engine.js sceneCtx()).
//                         Desktop Jun, later: her journal. Keys this file writes:
//                           scene.<id>            how often this scene was played to an end (firsts, growth)
//                           scene.<id>.end        how it ended last time (callbacks)
//                           scene.<id>:<action>   an action's first time (only for actions with "first" lines)
//                           album.<id>.<part>     a part of this scene's album you've reached (replayable)
//                           mark.<layer>          the day a mark was left (flour on her cheek): it's still there next time
//
// Everything is DATA (webapp/data/scenes.json; the owner's own entries from the scene maker have the same shape):
//
//   scene = { id, name, line, tier, minStage?, flavors?, themes?, who?, consent?, agreement?, where?,
//             setting, pose, outfit?, outfits?: [ids], meter?: { name, start }, layers?: { id: state }, layerDefs?,
//             opening: [beat], start: phaseId, phases, actions, endings, album?: { name, parts: [{ id, name, line }] },
//             ordinary?: [ids] (which of the always-there things fit here; default all) }
//   phase  = { name, loop, shot?, shots?, tempos?, tier?, minStage?, themes?, fade?: { t, to }, layers?,
//              beats?: [beat], actions?: [ids], react?: { low | mid | high | peak: [beat] }, part?,
//              next?: [{ to, by?: 'pick' | 'her' | 'meter', at?, name? }] }
//   action = { name, icon?, tier?, minStage?, themes?, when?, warm?, once?, say?: [beat] | { band: [beat] },
//              first?: [beat], layer?: { id: state }, to?: phaseId, wish?: 'her words when she asks for it' }
//   ending = { name, kind?: 'story' | 'morning' | 'afterglow' | 'interrupt', tier?, minStage?, when?, beats, part? }
//   beat   = 'words' | { t, face?, who?, when? }
//   when   = { first, seen, band, layer: { id: state }, did, notDid, last, outfit, phase, story: <a story condition> }
//
// A scene = a setting + a pose + layers + phases. A PHASE is a loop she stays in (pouring tea, leaning on you) with
// its shots and her expression by how she feels (the METER: low / mid / high / peak, shown as a word). You do things
// from the WHEEL; she answers; the moment moves on by YOUR pick of the next phase (only what she's fine with is
// offered), by HER say (she moves it on herself, or asks you for something: a wish), or when the meter gets there.
//
// Rules this file keeps (checkScene() + the tests):
// - the ordinary things are ALWAYS on the wheel (talk, hold her hand, just stay like this …) and you can always
//   leave; leaving, not picking up a wish, or picking the quiet thing is never punished. Nobody is ever stuck.
// - anything rated (a phase, an action, a layer's state, an outfit, an ending) asks ctx.ask; what's off simply
//   isn't there. A rated phase the moment would walk into on its own needs a `fade`: one narration line and on.
// - someone the gate must never rate (npcs[who].rated === false, e.g. the android kids) can only ever be in an
//   Everyday scene: in code here, never from a file.
// - shipped data never holds 18+ or "agreed beforehand" entries: those are the owner's, from the scene maker.
// - pure: no DOM, no storage, no clock, no network. The dice ride in the run, so a scene replays exactly.

import { mix, next } from '../delve/rng.js?v=1';
import { tune as getTune } from './scene-tune.js?v=3';

export const TIERS = ['everyday', 'flirty', 'adult'];
export const BANDS = ['low', 'mid', 'high', 'peak'];
export const LAYER_KINDS = ['clothing', 'prop', 'mark'];
export const ENDING_KINDS = ['story', 'morning', 'afterglow', 'interrupt'];
export const NEXT_BY = ['pick', 'her', 'meter'];
export const LEAVE = 'leave';
export const ID_RE = /^[a-z][a-z0-9_]{0,23}$/;
export const TEXT_MAX = 400;
const WHEN_KEYS = ['first', 'seen', 'band', 'layer', 'did', 'notDid', 'last', 'outfit', 'phase', 'story'];

const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const tierOf = (x) => (x && x.tier) || 'everyday';
const asBeat = (b) => (typeof b === 'string' ? { t: b } : b);
export const isFull = (v) => !!v && (typeof v.scene === 'string' || (!!v.phases && typeof v.phases === 'object'));

// ---------------------------------------------------------------
// from a slot's variant to a scene the engine can play

// lib = data/scenes.json. A variant that names a library scene keeps its own gates (where, minStage …) on top.
export function resolve(variant, lib) {
  if (!variant) return null;
  if (typeof variant.scene === 'string') {
    const base = lib?.scenes?.[variant.scene];
    if (!base) return null;
    const over = {};
    for (const k of ['tier', 'minStage', 'flavors', 'themes', 'who', 'consent', 'agreement', 'where']) if (variant[k] !== undefined) over[k] = variant[k];
    return { ...base, ...over, id: variant.scene };
  }
  if (variant.phases) return variant;
  // a few lines: a scene with nothing to do but read
  return { id: variant.id, name: variant.name || variant.id, tier: tierOf(variant), simple: true, opening: variant.beats || [], phases: {}, actions: {}, endings: {} };
}
// the shared slots and the scene library, laid under a system's own slots (the story's, the delve's). Its own win.
// A shared slot may say which systems it's for ("for": ['story', 'delve']); none = all of them.
export function attach(data, lib, who = null) {
  const shared = Object.fromEntries(Object.entries(lib?.slots || {}).filter(([, sl]) => !who || !sl.for || sl.for.includes(who)));
  return { ...data, scenes: { ...shared, ...(data.scenes || {}) }, lib };
}
export const layersOf = (scene, lib) => ({ ...(lib?.layers || {}), ...(scene.layerDefs || {}) });
// a full scene as plain lines, for anything that can only show lines (the delve's care moment, a summary)
export function flat(scene, lib) {
  const out = [...(scene.opening || [])];
  const ph = scene.phases?.[scene.start];
  if (ph) out.push(...(ph.beats || []));
  return out.map(asBeat).filter(b => b && b.t && !b.when).map(b => ({ face: b.face || 'neutral', t: b.t, ...(b.who ? { who: b.who } : {}) }));
}

// ---------------------------------------------------------------
// asking the gate, and the scene's own small conditions

export function ask(item, scene, ctx = {}) {
  const tier = tierOf(item);
  const who = scene.who && scene.who !== 'jun' ? scene.who : null;
  if (tier !== 'everyday' && who) {
    const p = ctx.npcs?.[who];
    if (!p) return { ok: false, why: 'Nobody the story knows.' };
    if (p.rated === false) return { ok: false, why: 'Never part of this.' };
  }
  const consent = item.consent ?? (tier !== 'everyday' ? scene.consent : undefined);
  if (tier === 'everyday' && !item.minStage && !item.themes && !item.flavors && !consent) return { ok: true, why: '' };
  if (typeof ctx.ask !== 'function') return { ok: false, why: 'No gate to ask.' };
  const r = ctx.ask({ tier, minStage: item.minStage, flavors: item.flavors, themes: item.themes, who: who || undefined, consent, agreement: consent ? (item.agreement ?? scene.agreement) : undefined });
  return { ok: !!r.ok, why: r.ok ? '' : (r.why || 'Not now.') };
}

export const bandOf = (meter, t) => (meter >= t.meter.peak ? 'peak' : meter >= t.meter.high ? 'high' : meter >= t.meter.mid ? 'mid' : 'low');
const bandAtLeast = (band, min) => BANDS.indexOf(band) >= BANDS.indexOf(min);

export function fits(when, scene, run, ctx, t) {
  if (!when) return true;
  const mem = ctx.mem;
  if (has(when, 'first') && !!when.first !== !!run.first) return false;
  if (has(when, 'seen') && (run.seen || 0) < when.seen) return false;
  if (has(when, 'band') && !bandAtLeast(bandOf(run.meter, t), when.band)) return false;
  if (has(when, 'layer')) for (const [id, st] of Object.entries(when.layer)) if ((run.layers[id] || 'off') !== st) return false;
  if (has(when, 'did') && !run.did[when.did]) return false;
  if (has(when, 'notDid') && run.did[when.notDid]) return false;
  if (has(when, 'last') && (mem ? mem.get(`scene.${scene.id}.end`) : null) !== when.last) return false;
  if (has(when, 'outfit') && run.outfit !== when.outfit) return false;
  if (has(when, 'phase') && run.phase !== when.phase) return false;
  if (has(when, 'story') && !(typeof ctx.test === 'function' && ctx.test(when.story))) return false;
  return true;
}

// ---------------------------------------------------------------
// playing

const rnd = (run) => next(run.r);
const speaker = (scene) => (scene.who && scene.who !== 'jun' ? scene.who : 'jun');
const words = (ctx, s) => (typeof ctx.fill === 'function' ? ctx.fill(s) : String(s));
function say(scene, run, ctx, t, out, list) {
  for (const raw of list || []) {
    const b = asBeat(raw);
    if (!b || !b.t || !fits(b.when, scene, run, ctx, t)) continue;
    out.push({ type: 'beat', who: b.who || speaker(scene), face: b.face || null, t: words(ctx, b.t) });
  }
}
// one line out of a pool: the ones that fit, never the same one twice running
function sayOne(scene, run, ctx, t, out, pool, key) {
  const ok = (pool || []).map(asBeat).map((b, i) => [b, i]).filter(([b]) => b && b.t && fits(b.when, scene, run, ctx, t));
  if (!ok.length) return false;
  let pickable = ok.filter(([, i]) => i !== run.lines[key]);
  if (!pickable.length) pickable = ok;
  const [b, i] = pickable[Math.floor(rnd(run) * pickable.length)];
  run.lines[key] = i;
  out.push({ type: 'beat', who: b.who || speaker(scene), face: b.face || null, t: words(ctx, b.t) });
  return true;
}
// her line for the band she's in; a missing band falls back to the one below
function byBand(spec, band) {
  if (!spec) return null;
  if (Array.isArray(spec)) return spec;
  for (let i = BANDS.indexOf(band); i >= 0; i--) if (spec[BANDS[i]]?.length) return spec[BANDS[i]];
  return null;
}

function meterMove(scene, lib, run, t, out, add) {
  const before = bandOf(run.meter, t);
  run.meter = Math.max(0, Math.min(100, run.meter + add));
  const band = bandOf(run.meter, t);
  if (band !== before) out.push({ type: 'meter', band, word: lib?.meterWords?.[band] || band, name: scene.meter?.name || lib?.meterName || 'How she feels' });
}

function setLayer(scene, lib, run, ctx, out, id, state) {
  const def = layersOf(scene, lib)[id];
  if (!def) return;
  let to = state;
  // a state can carry its own tier (Everyday: wet hair and a towel; Flirty: the damp shirt). Not allowed = its fallback, or nothing
  const st = def.tiers?.[to];
  if (st && st !== 'everyday' && !ask({ tier: st }, scene, ctx).ok) { to = def.fallback?.[state]; if (to === undefined) return; }
  if ((run.layers[id] || def.states[0]) === to) return;
  run.layers[id] = to;
  out.push({ type: 'layer', id, name: def.name, kind: def.kind, state: to, word: def.words?.[to] || to });
  if (def.kind === 'mark' && ctx.mem) ctx.mem.set('mark.' + id, to === def.states[0] ? null : ctx.mem.day || 1);
}

function unlock(scene, run, ctx, out, partId) {
  const part = (scene.album?.parts || []).find(p => p.id === partId);
  if (!part || run.parts.includes(partId)) return;
  run.parts.push(partId);
  const key = `album.${scene.id}.${partId}`;
  const had = ctx.mem ? !!ctx.mem.get(key) : false;
  if (ctx.mem && !had) ctx.mem.set(key, true);
  out.push({ type: 'album', part: partId, name: part.name, line: words(ctx, part.line || ''), first: !had });
}

function enterPhase(scene, lib, run, ctx, t, out, id, by = 'pick') {
  for (let guard = 0; guard < 12; guard++) {
    if (typeof id === 'string' && id.startsWith('end:')) { finish(scene, lib, run, ctx, t, out, id.slice(4)); return; }
    const ph = scene.phases[id];
    if (!ph) { out.push({ type: 'error', why: 'no such phase: ' + id }); return; }
    const a = ask(ph, scene, ctx);
    if (!a.ok) {
      // the moment would go somewhere that's off or that she isn't up for: one line of narration, and on
      if (!ph.fade) { out.push({ type: 'error', why: `"${ph.name}" can't show and has no fade` }); return; }
      out.push({ type: 'fade', from: id, t: words(ctx, ph.fade.t), why: a.why });
      id = ph.fade.to; by = 'fade';
      continue;
    }
    run.phase = id;
    run.shot = ph.shot || (ph.shots || [])[0] || run.shot || 'wide';
    run.tempo = (ph.tempos || []).includes(run.tempo) ? run.tempo : ((ph.tempos || [])[Math.floor((ph.tempos || []).length / 2)] || null);
    run.seenPhase[id] = (run.seenPhase[id] || 0) + 1;
    out.push({ type: 'phase', id, name: ph.name, loop: ph.loop || '', shot: run.shot, by });
    for (const [lid, st] of Object.entries(ph.layers || {})) setLayer(scene, lib, run, ctx, out, lid, st);
    if (run.seenPhase[id] === 1) say(scene, run, ctx, t, out, ph.beats);
    if (ph.part) unlock(scene, run, ctx, out, ph.part);
    return;
  }
  out.push({ type: 'error', why: 'fades that go in circles' });
}

function finish(scene, lib, run, ctx, t, out, id, extra = {}) {
  const e = id === LEAVE ? (scene.endings?.[LEAVE] || lib?.leave || { name: 'That\'s enough for now', beats: [] }) : scene.endings?.[id];
  if (!e) { out.push({ type: 'error', why: 'no such ending: ' + id }); return; }
  if (id === LEAVE && !scene.endings?.[LEAVE] && speaker(scene) !== 'jun') { if (e.plain) out.push({ type: 'beat', who: 'narrator', face: null, t: words(ctx, e.plain) }); }
  else say(scene, run, ctx, t, out, e.beats);
  if (e.part) unlock(scene, run, ctx, out, e.part);
  if (ctx.mem) { ctx.mem.mark('scene.' + scene.id); ctx.mem.set(`scene.${scene.id}.end`, id); }
  run.over = id;
  out.push({ type: 'end', id, name: e.name, kind: e.kind || 'story', band: bandOf(run.meter, t), first: run.first, did: run.n, parts: [...run.parts], ...extra });
}

// → { run, events }. o: { seed, tune }
export function start(scene, lib, ctx = {}, o = {}) {
  const t = o.tune || getTune(), out = [], mem = ctx.mem;
  const seen = mem ? mem.seen('scene.' + scene.id) : 0;
  const run = {
    v: 1, id: scene.id, phase: null, meter: Math.max(0, Math.min(100, scene.meter?.start ?? t.meter.start)),
    layers: { ...(scene.layers || {}) }, outfit: scene.outfit || null, shot: 'wide', tempo: null,
    n: 0, did: {}, row: { a: null, n: 0 }, wish: null, parts: [], seenPhase: {}, lines: {},
    first: seen === 0, seen, r: { s: mix('scene', o.seed ?? 1, scene.id, seen) }, over: null,
  };
  out.push({ type: 'open', id: scene.id, name: scene.name, tier: tierOf(scene), setting: scene.setting || '', pose: scene.pose || '', first: run.first, seen });
  // marks from another day that are still there (and say so once)
  const defs = layersOf(scene, lib);
  for (const [lid, def] of Object.entries(defs)) {
    if (def.kind !== 'mark' || !mem) continue;
    const day = mem.get('mark.' + lid);
    if (typeof day !== 'number') continue;
    if ((mem.day || 1) - day > (def.persist ?? 0)) { mem.set('mark.' + lid, null); continue; }
    run.layers[lid] = def.states[1];
    out.push({ type: 'layer', id: lid, name: def.name, kind: 'mark', state: def.states[1], word: def.words?.[def.states[1]] || def.states[1], still: true });
    if (def.still) out.push({ type: 'beat', who: speaker(scene), face: def.still.face || null, t: words(ctx, def.still.t) });
  }
  say(scene, run, ctx, t, out, scene.opening);
  if (scene.simple || !scene.start) { if (mem) mem.mark('scene.' + scene.id); run.over = 'done'; out.push({ type: 'end', id: 'done', name: scene.name, kind: 'story', band: 'low', first: run.first, did: 0, parts: [] }); }
  else enterPhase(scene, lib, run, ctx, t, out, scene.start, 'start');
  return { run, events: out };
}

// the ordinary things, under the scene's own (a scene may reword one by defining an action with the same id)
export const actionsOf = (scene, lib) => ({ ...(lib?.ordinary || {}), ...(scene.actions || {}) });
// which ordinary things fit this scene (default: all of them; a scene may name the ones that fit, never none)
export const ordinaryOf = (scene, lib) => { const all = Object.keys(lib?.ordinary || {}); const own = (scene.ordinary || []).filter(id => all.includes(id)); return own.length ? own : all; };

// what's on the two wheels right now, what the moment can move on to, and how it can end.
// Everything comes with ok / why: a page shows only what's ok (the lab shows the rest with its reason).
export function options(scene, lib, run, ctx = {}, tune) {
  const t = tune || getTune();
  if (!run || run.over || !scene.phases[run.phase]) return { actions: [], phases: [], endings: [], outfits: [], shots: [], tempos: [] };
  const ph = scene.phases[run.phase], all = actionsOf(scene, lib), band = bandOf(run.meter, t);
  const ord = ordinaryOf(scene, lib);
  const ids = [...new Set([...(ph.actions || []), ...ord])];
  const actions = [];
  for (const id of ids) {
    const a = all[id];
    if (!a || (a.once && run.did[id]) || !fits(a.when, scene, run, ctx, t)) continue;
    const g = ask(a, scene, ctx);
    actions.push({ id, name: a.name, icon: a.icon || '', tier: tierOf(a), ordinary: ord.includes(id) && !has(scene.actions, id), ok: g.ok, why: g.why, wish: run.wish?.action === id });
  }
  const phases = [];
  for (const n of ph.next || []) {
    if ((n.by || 'pick') !== 'pick' || !scene.phases[n.to]) continue;
    const g = ask(scene.phases[n.to], scene, ctx);
    const ready = !n.at || run.meter >= n.at;
    phases.push({ id: n.to, name: n.name || scene.phases[n.to].name, tier: tierOf(scene.phases[n.to]), ok: g.ok && ready, why: !g.ok ? g.why : ready ? '' : 'Not yet: give it a little longer.' });
  }
  const endings = [];
  for (const [id, e] of Object.entries(scene.endings || {})) {
    if (id === LEAVE) continue;
    const g = ask(e, scene, ctx), ready = fits(e.when, scene, run, ctx, t);
    endings.push({ id, name: e.name, kind: e.kind || 'story', tier: tierOf(e), ok: g.ok && ready, why: !g.ok ? g.why : ready ? '' : 'Not yet.' });
  }
  endings.push({ id: LEAVE, name: (scene.endings?.[LEAVE] || lib?.leave)?.name || 'That\'s enough for now', kind: 'story', tier: 'everyday', ok: true, why: '', leave: true });
  const outfits = (scene.outfits || []).filter(id => lib?.outfits?.[id]).map(id => { const o = lib.outfits[id], g = ask(o, scene, ctx); return { id, name: o.name, tier: tierOf(o), ok: g.ok, why: g.why, on: run.outfit === id }; });
  return { actions, phases, endings, outfits, band, shots: (ph.shots || []).map(s => ({ id: s, on: run.shot === s })), tempos: (ph.tempos || []).map(s => ({ id: s, name: lib?.tempos?.[s]?.name || s, on: run.tempo === s })) };
}

// the player's move: { action } | { phase } | { end } | { outfit } | { shot } | { tempo }. → events
export function act(scene, lib, run, input = {}, ctx = {}, tune) {
  const t = tune || getTune(), out = [];
  if (!run || run.over) return [{ type: 'over' }];
  // desktop Jun's door: her stop signal ends any scene at once, kindly. (The game never passes it.)
  if (ctx.stop) { finish(scene, lib, run, ctx, t, out, LEAVE, { stopped: true }); return out; }
  const op = options(scene, lib, run, ctx, t), ph = scene.phases[run.phase];
  const bad = (why) => [{ type: 'error', why }];

  if (input.end !== undefined) {
    const e = op.endings.find(k => k.id === input.end);
    if (!e || !e.ok) return bad('not a way this can end right now');
    finish(scene, lib, run, ctx, t, out, e.id);
    return out;
  }
  if (input.phase !== undefined) {
    const p = op.phases.find(k => k.id === input.phase);
    if (!p || !p.ok) return bad('not somewhere this can go right now');
    enterPhase(scene, lib, run, ctx, t, out, p.id, 'pick');
    return out;
  }
  if (input.outfit !== undefined) {
    const o = op.outfits.find(k => k.id === input.outfit);
    if (!o || !o.ok) return bad('not an outfit for this');
    if (run.outfit === o.id) return out;
    run.outfit = o.id;
    out.push({ type: 'outfit', id: o.id, name: o.name });
    sayOne(scene, run, ctx, t, out, lib.outfits[o.id].say, 'outfit:' + o.id);
    return out;
  }
  if (input.shot !== undefined) { if (!op.shots.some(k => k.id === input.shot)) return bad('not a shot here'); run.shot = input.shot; return [{ type: 'shot', id: input.shot }]; }
  if (input.tempo !== undefined) { if (!op.tempos.some(k => k.id === input.tempo)) return bad('not a pace here'); run.tempo = input.tempo; return [{ type: 'tempo', id: input.tempo, name: lib?.tempos?.[input.tempo]?.name || input.tempo }]; }
  if (input.action === undefined) return out;

  const o = op.actions.find(k => k.id === input.action);
  if (!o || !o.ok) return bad('not something you can do right now');
  const a = actionsOf(scene, lib)[o.id];
  run.n += 1; run.did[o.id] = (run.did[o.id] || 0) + 1;
  run.row = run.row.a === o.id ? { a: o.id, n: run.row.n + 1 } : { a: o.id, n: 0 };
  out.push({ type: 'did', action: o.id, name: a.name });
  for (const [lid, st] of Object.entries(a.layer || {})) setLayer(scene, lib, run, ctx, out, lid, st);

  // how much it moves her: its own weight, less when it's the same thing again, her pace, what she likes (desktop Jun's door)
  const likes = typeof ctx.likes === 'function' ? ctx.likes(o.id) : 1;
  const pace = run.tempo ? (lib?.tempos?.[run.tempo]?.k ?? 1) : 1;
  let add = (a.warm ?? t.meter.rise) * likes * pace / (1 + t.meter.rowK * run.row.n);
  if ((a.warm ?? t.meter.rise) > 0) add = Math.max(t.meter.min, add);
  const wished = run.wish && run.wish.action === o.id;
  if (wished) add += t.meter.wishBonus;
  const bandBefore = bandOf(run.meter, t);

  // her answer: the first time ever has its own words; then her line for how she feels; then the phase's; then plain
  const firstKey = `scene.${scene.id}:${o.id}`;
  let said = false;
  if (a.first && ctx.mem && ctx.mem.seen(firstKey) === 0) { ctx.mem.mark(firstKey); out.push({ type: 'first', action: o.id, name: a.name }); say(scene, run, ctx, t, out, a.first); said = true; }
  // (the ordinary things' lines are HERS: with someone else in the scene they fall through to the phase's or the plain words)
  if (!said && !(o.ordinary && speaker(scene) !== 'jun')) said = sayOne(scene, run, ctx, t, out, byBand(a.say, bandBefore), 'a:' + o.id);
  if (!said) said = sayOne(scene, run, ctx, t, out, byBand(ph.react, bandBefore), 'p:' + run.phase);
  if (!said && a.plain) out.push({ type: 'beat', who: 'narrator', face: null, t: words(ctx, a.plain) });
  if (wished) { out.push({ type: 'wish_met', action: o.id }); sayOne(scene, run, ctx, t, out, lib?.wishThanks, 'wish'); run.wish = null; }
  else if (run.wish && ++run.wish.age > t.her.wishKeep) run.wish = null;   // dropped quietly; never held against you
  meterMove(scene, lib, run, t, out, add);

  if (a.to) { enterPhase(scene, lib, run, ctx, t, out, a.to, 'action'); return out; }
  // does the moment move on by itself? the meter got there, or she moves it on (her say)
  for (const n of ph.next || []) {
    if (n.by !== 'meter' && n.by !== 'her') continue;
    if (run.meter < (n.at || 0)) continue;
    if (n.by === 'her' && !(rnd(run) < t.her.advance)) continue;
    enterPhase(scene, lib, run, ctx, t, out, n.to, n.by);
    return out;
  }
  // or she asks for something herself (only ever something that's on the wheel and fine)
  if (!run.wish && rnd(run) < t.her.wish) {
    const now = options(scene, lib, run, ctx, t).actions.filter(k => k.ok && k.id !== o.id && actionsOf(scene, lib)[k.id].wish);
    if (now.length) {
      const w = now[Math.floor(rnd(run) * now.length)];
      run.wish = { action: w.id, age: 0 };
      out.push({ type: 'wish', action: w.id, name: w.name });
      out.push({ type: 'beat', who: speaker(scene), face: 'curious', t: words(ctx, actionsOf(scene, lib)[w.id].wish) });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// the rulebook, in plain words (the maker shows these; nothing with a problem can be saved)

export function checkScene(scene, lib, { shipped = false, npcs = null, slotTier = null } = {}) {
  const e = [];
  if (!scene || typeof scene !== 'object') return ['Not a scene.'];
  const w = scene.name || scene.id || 'The scene';
  const txt = (b, where) => { const k = asBeat(b); if (!k || typeof k.t !== 'string' || !k.t.trim()) e.push(`${where}: a line has no words.`); else if (k.t.length > TEXT_MAX) e.push(`${where}: a line is too long (${TEXT_MAX} letters at most).`); else if (k.when) cond(k.when, where); };
  const lines = (list, where, need = false) => { if (list === undefined && !need) return; if (!Array.isArray(list) || (need && !list.length)) { e.push(`${where}: needs at least one line.`); return; } list.forEach(b => txt(b, where)); };
  const pool = (spec, where) => { if (!spec) return; if (Array.isArray(spec)) lines(spec, where); else for (const [b, l] of Object.entries(spec)) { if (!BANDS.includes(b)) e.push(`${where}: "${b}" isn't one of low, mid, high, peak.`); lines(l, where); } };
  const cond = (c, where) => { for (const k of Object.keys(c || {})) if (!WHEN_KEYS.includes(k)) e.push(`${where}: unknown condition "${k}".`); if (c?.band && !BANDS.includes(c.band)) e.push(`${where}: unknown band "${c.band}".`); };
  const rated = (x, where) => {
    const t = tierOf(x);
    if (!TIERS.includes(t)) { e.push(`${where}: unknown rating "${t}".`); return; }
    if (x.minStage !== undefined && !(Number.isInteger(x.minStage) && x.minStage >= 1 && x.minStage <= 6)) e.push(`${where}: the bond it needs is 1 (Stranger) to 6 (Devoted).`);
    if (shipped && t === 'adult') e.push(`${where}: 18+ entries are the owner's (scene maker), never shipped.`);
    if (shipped && (x.consent || x.agreement)) e.push(`${where}: "agreed beforehand" entries are the owner's, never shipped.`);
    if (x.consent && !['live', 'beforehand'].includes(x.consent)) e.push(`${where}: consent is "live" or "beforehand".`);
    if (x.consent === 'beforehand' && !x.agreement) e.push(`${where}: "agreed beforehand" needs the name of the agreement.`);
  };
  if (!ID_RE.test(scene.id || '')) e.push(`${w}: its id needs to be short, lowercase, letters / numbers / _ (it starts with a letter).`);
  if (!scene.name || !String(scene.name).trim()) e.push('The scene needs a name.');
  rated(scene, w);
  if (slotTier && tierOf(scene) !== slotTier) e.push(`${w}: it sits in the ${slotTier} list but is tagged ${tierOf(scene)}.`);
  if (tierOf(scene) === 'everyday' && (scene.minStage || scene.flavors)) e.push(`${w}: an Everyday scene can't ask for a bond or a kind of relationship (it's the one everybody gets).`);
  const who = scene.who && scene.who !== 'jun' ? scene.who : null;
  if (who && npcs) {
    if (!npcs[who]) e.push(`${w}: unknown person "${who}".`);
    else if (npcs[who].rated === false && [scene, ...Object.values(scene.phases || {}), ...Object.values(scene.actions || {}), ...Object.values(scene.endings || {})].some(x => tierOf(x) !== 'everyday'))
      e.push(`${w}: ${npcs[who].name || who} can only ever be in Everyday scenes.`);
  }
  lines(scene.opening, 'The opening', !!scene.simple);
  if (scene.simple) return e;

  const phases = scene.phases || {}, actions = scene.actions || {}, endings = scene.endings || {}, defs = layersOf(scene, lib);
  const gated = (x) => tierOf(x) !== 'everyday' || !!x.minStage || !!x.themes;
  const idOk = (id, what) => { if (!/^[a-z][a-z0-9_]{0,15}$/.test(id)) e.push(`${what} "${id}": ids are short, lowercase, letters / numbers / _.`); };
  if (!has(phases, scene.start)) e.push('The scene needs a first phase to start in.');
  else if (gated(phases[scene.start]) && !phases[scene.start].fade) e.push(`The first phase ("${phases[scene.start].name}") asks for more than the scene itself and has no fade: start somewhere everyone who gets this scene can be.`);
  const layerUse = (map, where) => { for (const [lid, st] of Object.entries(map || {})) { const d = defs[lid]; if (!d) e.push(`${where}: unknown layer "${lid}".`); else if (!d.states.includes(st)) e.push(`${where}: "${d.name}" has no state "${st}".`); } };
  for (const [lid, d] of Object.entries(scene.layerDefs || {})) {
    idOk(lid, 'Layer');
    if (!d.name) e.push(`Layer "${lid}" needs a name.`);
    if (!LAYER_KINDS.includes(d.kind)) e.push(`Layer "${d.name || lid}": it's clothing, a prop or a mark.`);
    if (!Array.isArray(d.states) || d.states.length < 2) e.push(`Layer "${d.name || lid}" needs at least two states (the first is "not there").`);
    for (const [st, tr] of Object.entries(d.tiers || {})) { if (!(d.states || []).includes(st)) e.push(`Layer "${d.name || lid}": no state "${st}".`); rated({ tier: tr }, `Layer "${d.name || lid}" (${st})`); }
  }
  layerUse(scene.layers, 'The scene\'s layers');
  if (scene.ordinary !== undefined && !(Array.isArray(scene.ordinary) && scene.ordinary.some(id => lib?.ordinary?.[id]))) e.push('At least one ordinary thing has to stay on the wheel (talk, just stay like this…).');
  for (const id of scene.outfits || []) if (!lib?.outfits?.[id]) e.push(`Unknown outfit "${id}".`);
  const endOk = (to) => typeof to === 'string' && (has(phases, to) || (to.startsWith('end:') && (to.slice(4) === LEAVE || has(endings, to.slice(4)))));
  const all = actionsOf(scene, lib);
  for (const [pid, ph] of Object.entries(phases)) {
    const pw = `Phase "${ph.name || pid}"`;
    idOk(pid, 'Phase');
    if (!ph.name) e.push(`Phase "${pid}" needs a name.`);
    rated(ph, pw);
    lines(ph.beats, pw); pool(ph.react, pw); layerUse(ph.layers, pw);
    for (const a of ph.actions || []) if (!all[a]) e.push(`${pw}: unknown thing to do "${a}".`);
    if (ph.fade) { if (!ph.fade.t) e.push(`${pw}: its fade needs one line of narration.`); if (!endOk(ph.fade.to)) e.push(`${pw}: its fade has to lead to a phase or an ending.`); }
    if (ph.part && !(scene.album?.parts || []).some(p => p.id === ph.part)) e.push(`${pw}: unknown album part "${ph.part}".`);
    for (const n of ph.next || []) {
      if (!has(phases, n.to)) { e.push(`${pw}: moves on to an unknown phase "${n.to}".`); continue; }
      if (!NEXT_BY.includes(n.by || 'pick')) e.push(`${pw}: a move is by your pick, her say, or the meter.`);
      const to = phases[n.to];
      if ((n.by === 'her' || n.by === 'meter') && (tierOf(to) !== 'everyday' || to.minStage || to.themes) && !to.fade) e.push(`${pw}: it can move on by itself to "${to.name}", which is rated or needs a bond: give "${to.name}" a fade (one line of narration and where to go instead), so nobody hits a gap.`);
    }
  }
  for (const [aid, a] of Object.entries(actions)) {
    const aw = `"${a.name || aid}"`;
    idOk(aid, 'Action');
    if (!a.name) e.push(`Action "${aid}" needs a name.`);
    rated(a, aw); cond(a.when, aw); pool(a.say, aw); lines(a.first, aw); layerUse(a.layer, aw);
    if (a.to && !endOk(a.to)) e.push(`${aw}: leads to an unknown phase.`);
    if (a.to && has(phases, a.to) && (tierOf(phases[a.to]) !== 'everyday' || phases[a.to].minStage) && tierOf(a) === 'everyday' && !a.minStage && !phases[a.to].fade) e.push(`${aw}: it leads into "${phases[a.to].name}", which is rated or needs a bond: tag the action the same way, or give that phase a fade.`);
    if (a.warm !== undefined && !(Number.isFinite(a.warm) && a.warm >= -30 && a.warm <= 40)) e.push(`${aw}: how much it moves her is between -30 and 40.`);
  }
  for (const [eid, en] of Object.entries(endings)) {
    const ew = `Ending "${en.name || eid}"`;
    idOk(eid, 'Ending');
    if (!en.name) e.push(`Ending "${eid}" needs a name.`);
    rated(en, ew); cond(en.when, ew); lines(en.beats, ew);
    if (en.kind && !ENDING_KINDS.includes(en.kind)) e.push(`${ew}: it ends back in the story, the morning after, in an afterglow, or by an interruption.`);
    if (en.part && !(scene.album?.parts || []).some(p => p.id === en.part)) e.push(`${ew}: unknown album part "${en.part}".`);
  }
  for (const p of scene.album?.parts || []) { idOk(p.id, 'Album part'); if (!p.name) e.push(`Album part "${p.id}" needs a name.`); if (p.line && p.line.length > TEXT_MAX) e.push(`Album part "${p.name}": her line is too long.`); }
  // every phase can be reached
  if (has(phases, scene.start)) {
    const reach = new Set([scene.start]);
    const links = (pid) => { const ph = phases[pid], l = []; for (const n of ph.next || []) l.push(n.to); if (ph.fade) l.push(ph.fade.to); for (const a of [...(ph.actions || []), ...ordinaryOf(scene, lib)]) if (all[a]?.to) l.push(all[a].to); return l.filter(x => has(phases, x)); };
    for (const q = [scene.start]; q.length;) for (const l of links(q.pop())) if (!reach.has(l)) { reach.add(l); q.push(l); }
    for (const pid of Object.keys(phases)) if (!reach.has(pid)) e.push(`Phase "${phases[pid].name || pid}": nothing leads here.`);
  }
  return e;
}

// the whole library (data/scenes.json): its scenes, its slots, the ordinary things
export function checkLibrary(lib, { shipped = true, npcs = null } = {}) {
  const e = [];
  if (!lib || typeof lib !== 'object') return ['no scene library'];
  for (const [id, a] of Object.entries(lib.ordinary || {})) {
    if (tierOf(a) !== 'everyday' || a.minStage || a.themes || a.when || a.once) e.push(`ordinary "${id}": the ordinary things are Everyday, for everyone, always there`);
    if (!a.name || !(a.say || a.plain)) e.push(`ordinary "${id}": needs a name and words`);
    if (a.to) e.push(`ordinary "${id}": an ordinary thing never moves the scene on`);
  }
  if (!Object.keys(lib.ordinary || {}).length) e.push('the ordinary things are missing (talk, hold her hand, just stay like this…)');
  if (!lib.leave || !lib.leave.name) e.push('"leave" is missing: the way out of every scene');
  for (const [id, o] of Object.entries(lib.outfits || {})) { if (!o.name) e.push(`outfit ${id}: no name`); if (shipped && tierOf(o) === 'adult') e.push(`outfit ${id}: 18+ entries are the owner's`); }
  for (const [id, d] of Object.entries(lib.layers || {})) {
    if (!LAYER_KINDS.includes(d.kind) || !Array.isArray(d.states) || d.states.length < 2) e.push(`layer ${id}: needs a kind and at least two states`);
    if (shipped && Object.values(d.tiers || {}).includes('adult')) e.push(`layer ${id}: 18+ states are the owner's`);
  }
  for (const [id, sc] of Object.entries(lib.scenes || {})) {
    if (sc.id !== id) e.push(`scene ${id}: its id says "${sc.id}"`);
    e.push(...checkScene(sc, lib, { shipped, npcs }).map(k => `scene ${id}: ${k}`));
  }
  for (const [sid, slot] of Object.entries(lib.slots || {})) {
    for (const tier of TIERS) for (const v of slot.variants?.[tier] || []) {
      if (typeof v.scene !== 'string') continue;
      const sc = lib.scenes?.[v.scene];
      if (!sc) e.push(`slot ${sid}: unknown scene "${v.scene}"`);
      else if (tierOf(sc) !== tier) e.push(`slot ${sid}: "${v.scene}" is tagged ${tierOf(sc)} but sits in the ${tier} list`);
    }
  }
  return e;
}

// ---------------------------------------------------------------
// "a hundred scenes in a moment": a stand-in plays a scene with the real rules

export function playOnce(scene, lib, ctx = {}, o = {}) {
  const t = o.tune || getTune();
  const { run, events } = start(scene, lib, ctx, { seed: o.seed, tune: t });
  const dice = { s: mix('standin', o.seed ?? 1, scene.id) }, r = () => next(dice);
  const stats = { actions: {}, phases: { ...(run.phase ? { [run.phase]: 1 } : {}) }, fades: 0, wishes: 0, wishesMet: 0, herMoves: 0, errors: [], n: 0, end: null, parts: [] };
  const take = (evs) => {
    for (const e of evs) {
      if (e.type === 'error') stats.errors.push(e.why);
      else if (e.type === 'phase') { stats.phases[e.id] = (stats.phases[e.id] || 0) + (e.by === 'start' ? 0 : 1); if (e.by === 'her' || e.by === 'meter') stats.herMoves += 1; }
      else if (e.type === 'fade') stats.fades += 1;
      else if (e.type === 'wish') stats.wishes += 1;
      else if (e.type === 'wish_met') stats.wishesMet += 1;
      else if (e.type === 'did') { stats.actions[e.action] = (stats.actions[e.action] || 0) + 1; stats.n += 1; }
      else if (e.type === 'end') { stats.end = e.id; stats.parts = e.parts; }
    }
  };
  take(events);
  for (let guard = 0; guard < t.sim.max * 3 && !run.over; guard++) {
    const op = options(scene, lib, run, ctx, t);
    const acts = op.actions.filter(k => k.ok), moves = op.phases.filter(k => k.ok), ends = op.endings.filter(k => k.ok);
    if (run.n >= t.sim.max) { take(act(scene, lib, run, { end: LEAVE }, ctx, t)); break; }
    const wish = acts.find(k => k.wish);
    if (wish && r() < t.sim.followWish) { take(act(scene, lib, run, { action: wish.id }, ctx, t)); continue; }
    const endW = Math.max(0, run.n - t.sim.len / 2) / t.sim.len;
    const roll = r();
    if (roll < endW * 0.5 && ends.length) {
      const own = ends.filter(k => !k.leave), from = own.length && r() < 0.8 ? own : ends;
      take(act(scene, lib, run, { end: from[Math.floor(r() * from.length)].id }, ctx, t));
      continue;
    }
    if (roll > 0.8 && moves.length) { take(act(scene, lib, run, { phase: moves[Math.floor(r() * moves.length)].id }, ctx, t)); continue; }
    if (!acts.length) { stats.errors.push('nothing to do in ' + run.phase); take(act(scene, lib, run, { end: LEAVE }, ctx, t)); break; }
    take(act(scene, lib, run, { action: acts[Math.floor(r() * acts.length)].id }, ctx, t));
  }
  if (!run.over) stats.errors.push('a scene that never ends');
  return { run, stats };
}

// n plays, summed up. mem: a function giving each play its memory (default: each starts fresh)
export function many(scene, lib, ctx = {}, n = 100, o = {}) {
  const sum = { n, ends: {}, errors: [], meanDid: 0, phases: {}, actions: {}, fades: 0, wishes: 0, wishesMet: 0, herMoves: 0, parts: {} };
  for (let i = 0; i < n; i++) {
    const c = { ...ctx, mem: o.mem ? o.mem(i) : memory() };
    const { stats } = playOnce(scene, lib, c, { ...o, seed: (o.seed ?? 1) + i });
    sum.ends[stats.end] = (sum.ends[stats.end] || 0) + 1;
    sum.meanDid += stats.n / n;
    for (const k of ['fades', 'wishes', 'wishesMet', 'herMoves']) sum[k] += stats[k];
    for (const [k, v] of Object.entries(stats.phases)) sum.phases[k] = (sum.phases[k] || 0) + (v ? 1 : 0);
    for (const [k, v] of Object.entries(stats.actions)) sum.actions[k] = (sum.actions[k] || 0) + v;
    for (const p of stats.parts) sum.parts[p] = (sum.parts[p] || 0) + 1;
    for (const er of stats.errors) if (sum.errors.length < 10) sum.errors.push(`seed ${(o.seed ?? 1) + i}: ${er}`);
  }
  sum.never = { phases: Object.keys(scene.phases || {}).filter(k => !sum.phases[k] && k !== scene.start), endings: Object.keys(scene.endings || {}).filter(k => !sum.ends[k]) };
  return sum;
}

// a plain memory (the lab's sandbox, the tests; desktop Jun's own store later has the same shape)
export function memory(store = { seen: {}, flags: {} }, day = 1, { readOnly = false } = {}) {
  return {
    store, day,
    seen: (id) => store.seen[id] || 0,
    mark: (id) => { if (!readOnly) store.seen[id] = (store.seen[id] || 0) + 1; },
    get: (id) => (has(store.flags, id) ? store.flags[id] : null),
    set: (id, v) => { if (readOnly) return; if (v === null || v === false || v === undefined) delete store.flags[id]; else store.flags[id] = v; },
  };
}

// the album: what you've reached of each scene that has one. scenes = { id: scene }. → [{ id, name, parts: [{ id, name, line, have }] }]
export function album(scenes, mem) {
  const out = [];
  for (const sc of Object.values(scenes || {})) {
    const parts = (sc.album?.parts || []).map(p => ({ id: p.id, name: p.name, line: p.line || '', have: !!mem.get(`album.${sc.id}.${p.id}`) }));
    if (parts.some(p => p.have)) out.push({ id: sc.id, name: sc.album?.name || sc.name, tier: tierOf(sc), played: mem.seen('scene.' + sc.id), parts });
  }
  return out;
}
