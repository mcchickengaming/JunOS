// THE STORY-EVENT ENGINE (#34; windowed mode = the authored game, decided Nov 14-15). The game's backbone:
// story events, loose ends that come back later ("threads"), choices, the ceremony layer (cards + the
// codex), people's two quiet meters, everything rated through the ONE gate, and hooks out to delves,
// voyages, fights, minigames and the progression service's story grants.
//
// It stands ON the pieces built for it, never beside them:
//   what the story remembers   story state (story-state.js): flags, quests, seen, choices, agreements,
//                              difficulty, place / chapter. Every effect here goes through its functions.
//   what only the engine needs the game's `events` section (g.x below): the story clock, the dice, threads,
//                              people's meters, the codex, what's queued, the event being played.
//   conditions                 the map's own language (world/places.js when()) + the engine's extras (cond.js)
//   losing a fight             difficulty.js: the preset's knockout + saveChance ("she saves you")
//   saving                     the engine only SAYS when ('autosave' events at beats); the page door
//                              (story.js) writes both sections with the epoch it read and calls GameSave.
//   giving things              'grant' events by id; the door asks the progression service. Never from here.
//
// Everything is DATA (webapp/data/story.json): a new event, thread, card or person is one more entry.
// This file is pure: no DOM, no storage, no clock, no network. g = { s: story state, x: the events
// section }; every call returns EVENTS for the page to show, and the dice ride in g.x, so a playthrough
// replays exactly and "a hundred playthroughs in a moment" (story-sim.js) and the tests use the player's rules.
//
// An event = nodes. A node can say something (text, who, face), show a card, run effects ("do"), then:
// offer choices, hand over to another system (a "hook") and branch on how that went, play a scene slot,
// or just go on ("next"). A scene slot may pick a FULL scene (#22, ../scene/scene-engine.js): then the event
// waits ('scene') while the page plays it, and goes on with how it ended: step(…, { scene: { end } }) → the
// node's "on": { <ending id> | else: node } if it has one, else its choices / "next" as usual.
//
// WHICH event happens (pick): the world asks with a trigger ("enter" when you arrive from the map,
// "stroll", "talk:al", "home", "voyage", "sleep"…). In order: something queued for now → the main story's
// next beat (never left to chance, never gated by a perk) → a loose end that is due (a few a day at most,
// never certain) → the by-chance pool (weights, cooldowns, less likely if it happened lately, and
// sometimes nothing at all: "never every time").
//
// Rules this file keeps (validate() + the tests):
// - the main story ("spine") never asks for a bond, a skill, a person's liking, the weather or a
//   difficulty, never rolls a chance, and is Everyday: nothing optional can block it.
// - every choice list has at least one plain Everyday choice: nobody is ever stuck or cornered.
// - everything rated asks the one gate (ctx.gateCheck = Gate.check); rated things that are off simply
//   aren't there. Shipped data never holds 18+ entries: those are the owner's.
// - saying no, another path, or losing is never punished: nothing is ever taken away.
// - the bond is only READ (her stage: the gate, her wording, her reaching you). Nothing here changes it.

import { mix, next } from '../delve/rng.js?v=1';
import { tune as getTune } from './story-tune.js?v=1';
import * as Cond from './cond.js?v=1';
import * as Story from './story-state.js?v=3';
import * as Scenes from '../delve/scenes.js?v=3';
import * as Sc from '../scene/scene-engine.js?v=3';
import { saveChance } from '../difficulty.js?v=2';

export { Cond, Story, Sc };
export const SECTION = 'events';
export const SLOTS = Cond.SLOTS;
export const TIERS = ['everyday', 'flirty', 'adult'];
export const CARD_KINDS = ['chapter', 'person', 'place', 'creature', 'note'];
export const EFFECTS = ['set', 'unset', 'inc', 'quest', 'agree', 'chapter', 'open', 'advance', 'close', 'card', 'grant', 'rep', 'aff', 'tell', 'time', 'queue'];
const NODE_KEYS = ['who', 'face', 'text', 'card', 'do', 'choices', 'hook', 'on', 'scene', 'where', 'next', 'end'];

// ---------------------------------------------------------------
// the engine's own part of the game (the `events` section)

export function blankX(data, seed = 1) {
  return {
    v: 1, seed: seed >>> 0, r: { s: mix('story', seed) },
    day: 1, slot: 0, at: data.start?.spot || '',
    threads: {},   // id → { s: 'open' | 'closed', as, day, touched, n }
    last: {},      // event id → the story day it last happened (how often is story state's `seen`)
    npc: {},       // id → { rep, aff, met: day }
    codex: {},     // card id → day first shown
    pages: {},     // codex page → day it was completed
    queue: [],     // { ev, day }: things set going that come up when their moment fits
    recent: [], lines: {},
    today: { day: 1, returns: 0, pool: 0, lastReturn: -99 },
    play: null,    // the event being played: { ev, node, wait, cls, slots }
    over: null,    // a game over: the player loads a save
  };
}
// anything from a save made safe (an old or odd section never breaks the game: missing parts come back empty)
export function cleanX(raw, data, seed = 1) {
  const b = blankX(data, seed);
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return b;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const x = { ...b, ...raw };
  for (const k of ['threads', 'last', 'npc', 'codex', 'pages', 'lines']) x[k] = obj(raw[k]);
  x.queue = Array.isArray(raw.queue) ? raw.queue.filter(q => q && data.events[q.ev]) : [];
  x.recent = Array.isArray(raw.recent) ? raw.recent.filter(id => data.events[id]) : [];
  x.r = raw.r && Number.isFinite(raw.r.s) ? { s: raw.r.s >>> 0 } : b.r;
  x.day = Math.max(1, raw.day | 0); x.slot = Math.max(0, Math.min(3, raw.slot | 0));
  x.today = { ...b.today, ...obj(raw.today) };
  if (x.play && !(data.events[x.play.ev] && data.events[x.play.ev].nodes[x.play.node])) x.play = null;
  if (x.play && x.play.wait === 'scene' && !data.events[x.play.ev].nodes[x.play.node].scene) x.play = null;
  if (x.at && !data.spots[x.at]) x.at = b.at;
  return x;
}
export const newGame = (data, seed = 1, difficulty = 'easy') => ({ s: Story.blank(difficulty), x: blankX(data, seed) });

const E = (data, id) => data.events[id];
const absSlot = (x) => (x.day - 1) * 4 + x.slot;
const rnd = (g) => next(g.x.r);
const now = (ctx) => Number(ctx.now) || 0;

// what the page knows + what the engine can work out itself
export function full(data, g, ctx = {}) {
  const tags = data.spots[g.x.at]?.tags || [];
  let slotName = SLOTS[g.x.slot];
  // Q13: the game runs on story time; "real" lets home and town follow the player's own clock
  if (ctx.clock === 'real' && Number.isFinite(ctx.hour) && (tags.includes('home') || tags.includes('town'))) {
    slotName = ctx.hour >= 6 && ctx.hour < 12 ? 'morning' : ctx.hour >= 12 && ctx.hour < 18 ? 'afternoon' : ctx.hour >= 18 && ctx.hour < 22 ? 'evening' : 'night';
  }
  // who's along: her, once you've met her in the story, unless the player left her at home
  const along = ctx.with || (Story.has(g.s, data.start?.herFlag || '-') && ctx.together !== false ? ['jun'] : []);
  return { ...ctx, spotTags: tags, slotName, with: along };
}

// ---------------------------------------------------------------
// the one gate, for anything that carries a tier / themes / a person ("who")

export function affStage(g, npc, t) {
  return Math.max(1, Math.min(6, 1 + Math.floor((g.x.npc[npc]?.aff || 0) / t.npc.affStep)));
}

// → { ok, why }. Plain Everyday things always pass. Rated things need the gate to say "show" and "yes"
// (in the game her say is a meter, Q7: "she'd ask first" counts by tune.gate.askCounts). The game never
// passes a stop signal or `awake` (owner, Nov 15); agreements come from story state. item.who = an NPC:
// the same gate, read with that person's own closeness instead of her bond.
function gateCtx(g, ctx, stage) {
  return { ...(ctx.gate || {}), stage, trust: 50, tension: 0, agreements: Story.agreementsFor(g.s) };
}
export function allowed(item, g, ctx, t) {
  const tier = item.tier || 'everyday';
  const off = (item.themes || []).find(k => (ctx.themesOff || []).includes(k));
  if (off) return { ok: false, why: 'A theme you switched off.' };
  if (tier === 'everyday' && !item.minStage && !item.flavors && !item.consent) return { ok: true, why: '' };
  if (!ctx.gateCheck) return { ok: false, why: 'No gate to ask.' };
  const stage = item.who && item.who !== 'jun' ? affStage(g, item.who, t) : (Number.isFinite(ctx.stage) ? ctx.stage : 1);
  const r = ctx.gateCheck({ tier, flavors: item.flavors, minStage: item.minStage, consent: item.consent, agreement: item.agreement }, gateCtx(g, ctx, stage));
  const yes = r.show && (r.her === 'yes' || (r.her === 'ask' && t.gate.askCounts));
  return { ok: !!yes, why: yes ? '' : (r.words || r.why || 'Not now.') };
}
function slot(data, g, id, where, ctx, t) {
  // variants are read the same way as everything else rated here (allowed(): themes, a person's own closeness, agreements)
  return Scenes.pick({ scenes: data.scenes }, id, { where, allow: ctx.gateCheck ? (item) => allowed(item, g, ctx, t) : null, rnd: () => rnd(g) });
}
// what the page gets for a scene slot. A full scene comes as `play` (the scene itself, for scene-engine.js) with its
// first lines as `beats` for anything that can only show lines; a simple one is just its beats, as before.
function sceneEvent(data, g, ctx, k, slotId, extra = {}) {
  const play = Scenes.isFull(k.variant) ? Sc.resolve(k.variant, data.lib) : null;
  const beats = (play ? Sc.flat(play, data.lib) : k.variant.beats || []).map(b => ({ ...b, t: fill(data, g, ctx, b.t) }));
  return { type: 'scene', slot: slotId, tier: k.tier, id: k.variant.id, beats, tried: k.tried || [], ...(play ? { play } : {}), ...extra };
}
// everything a full scene needs from the game (scene-engine.js ctx): the gate as the story reads it, the story's
// conditions and words, and its MEMORY = story state (seen counts + flags), so every game save carries it.
// replay: looking at an album part again changes nothing.
export function sceneCtx(data, g, ctx = {}, tune, { replay = false } = {}) {
  const t = tune || getTune(), c = full(data, g, ctx), at = now(ctx);
  const mem = {
    day: g.x.day,
    seen: (id) => Story.seenCount(g.s, id),
    get: (id) => Story.flag(g.s, id, null),
    mark: (id) => { if (!replay) Story.markSeen(g.s, id, at); },
    set: (id, v) => { if (replay) return; if (v === null || v === false || v === undefined) Story.clearFlag(g.s, id, at); else Story.setFlag(g.s, id, v, at); },
  };
  return { ask: (item) => allowed(item, g, c, t), test: (cond) => Cond.test(cond, g, c), fill: (str) => fill(data, g, c, str), npcs: data.npcs, names: ctx.names, mem };
}

// ---------------------------------------------------------------
// words: variants, the right ones for the moment, never the same one twice running

const fill = (data, g, ctx, str) => String(str).replace(/\{(\w+)\}/g, (m, k) => {
  if (ctx.names && ctx.names[k]) return ctx.names[k];
  if (k === 'you') return 'you';
  if (k === 'her') return 'Jun';
  const v = g.s.flags[k];
  return v === undefined ? m : (data.words?.[v] || String(v));
});

export function say(data, g, text, ctx, key) {
  if (text === undefined || text === null) return '';
  let pool = [];
  if (typeof text === 'string') pool = [text];
  else {
    const plain = [], fitting = [];
    for (const k of text) {
      if (typeof k === 'string') plain.push(k);
      else if (Cond.test(k.when, g, ctx)) (k.when ? fitting : plain).push(...(Array.isArray(k.t) ? k.t : [k.t]));
    }
    pool = fitting.length ? fitting : plain;
  }
  if (!pool.length) return '';
  let i = 0;
  if (pool.length > 1) {
    i = Math.floor(rnd(g) * pool.length);
    if (g.x.lines[key] === i) i = (i + 1) % pool.length;
    g.x.lines[key] = i;
  }
  return fill(data, g, ctx, pool[i]);
}

// ---------------------------------------------------------------
// people: two quiet meters each, shown as a word (Q4), never a number

export function standing(g, npc, t) {
  const n = g.x.npc[npc];
  if (!n || !n.met) return 'Stranger';
  return n.rep >= t.npc.close ? 'Close' : n.rep >= t.npc.friend ? 'Friend' : n.rep >= t.npc.acquaint ? 'Acquaintance' : 'Someone you\'ve met';
}
function person(g, id, t) { return (g.x.npc[id] ||= { rep: t.npc.start, aff: t.npc.start, met: 0 }); }

// ---------------------------------------------------------------
// time: four parts to a story day

function advance(g, n, out) {
  const x = g.x;
  if (!n) return;
  x.slot += n;
  while (x.slot >= 4) { x.slot -= 4; x.day += 1; x.today = { day: x.day, returns: 0, pool: 0, lastReturn: x.today.lastReturn }; out.push({ type: 'day', day: x.day }); }
  out.push({ type: 'time', day: x.day, slot: SLOTS[x.slot] });
}
const spend = (g, slots, out) => advance(g, slots === 'morning' ? 4 - g.x.slot : Number(slots) || 0, out);

// ---------------------------------------------------------------
// effects: what an event leaves behind

function threadOp(data, g, op, id, as, out) {
  const x = g.x, cur = x.threads[id];
  if (op === 'open') {
    if (!cur || (cur.s === 'closed' && data.threads[id]?.again)) { x.threads[id] = { s: 'open', day: x.day, touched: x.day, n: cur ? cur.n : 0 }; out.push({ type: 'thread', id, change: 'opened' }); }
    else if (cur.s === 'open') { cur.n += 1; cur.touched = x.day; out.push({ type: 'thread', id, change: 'advanced', n: cur.n }); }
    return;
  }
  if (!cur || cur.s !== 'open') return; // nothing to move on or tie off: never an error, stories branch
  if (op === 'advance') { cur.n += 1; cur.touched = x.day; out.push({ type: 'thread', id, change: 'advanced', n: cur.n }); }
  if (op === 'close') { cur.s = 'closed'; cur.as = as || 'done'; cur.closed = x.day; out.push({ type: 'thread', id, change: 'closed', as: cur.as }); }
}

// the ceremony layer: the FIRST time is a card (and a place in the codex); after that, a small nod
function showCard(data, g, id, ctx, out) {
  const c = data.cards[id], x = g.x;
  if (!c) return;
  const first = x.codex[id] === undefined;
  if (first) x.codex[id] = x.day;
  out.push({ type: 'card', id, first, kind: c.kind, page: c.page, title: fill(data, g, ctx, c.title), by: c.by || 'jun', text: say(data, g, c.text, ctx, 'card:' + id),
    who: c.who || null, standing: c.who ? standing(g, c.who, getTune()) : null });
  if (!first) return;
  // a finished page of the codex gives its keepsake (a story grant), once
  const page = data.codex?.pages?.[c.page];
  if (page && !x.pages[c.page]) {
    const all = Object.entries(data.cards).filter(([, k]) => k.page === c.page).map(([k]) => k);
    if (all.every(k => x.codex[k] !== undefined)) {
      x.pages[c.page] = x.day;
      out.push({ type: 'codex_page', page: c.page, name: page.name });
      if (page.grant) out.push({ type: 'grant', id: page.grant });
    }
  }
}

function fx(data, g, e, ctx, t, out) {
  if (e.when !== undefined && !Cond.test(e.when, g, ctx)) return;
  const s = g.s, at = now(ctx);
  if ('set' in e) { Story.setFlag(s, e.set, 'to' in e ? e.to : true, at); out.push({ type: 'flag', id: e.set, to: Story.flag(s, e.set) }); }
  else if ('unset' in e) { Story.clearFlag(s, e.unset, at); out.push({ type: 'flag', id: e.unset, to: false }); }
  else if ('inc' in e) { Story.addTo(s, e.inc, e.by ?? 1, at); out.push({ type: 'flag', id: e.inc, to: Story.flag(s, e.inc) }); }
  else if ('quest' in e) { if (e.done) Story.finishQuest(s, e.quest, at, e.step ?? 'done'); else Story.setQuest(s, e.quest, e.step ?? 'begun', at); out.push({ type: 'quest', id: e.quest, step: Story.questStep(s, e.quest), done: Story.questDone(s, e.quest) }); }
  else if ('agree' in e) { Story.agree(s, e.agree, at); out.push({ type: 'agreed', id: e.agree }); }
  else if ('chapter' in e) Story.setPlace(s, s.place, e.chapter, at);
  else if ('open' in e) threadOp(data, g, 'open', e.open, null, out);
  else if ('advance' in e) threadOp(data, g, 'advance', e.advance, null, out);
  else if ('close' in e) threadOp(data, g, 'close', e.close, e.as, out);
  else if ('card' in e) showCard(data, g, e.card, ctx, out);
  else if ('grant' in e) out.push({ type: 'grant', id: e.grant });
  else if ('rep' in e || 'aff' in e) {
    const k = 'rep' in e ? 'rep' : 'aff', p = person(g, e[k], t);
    if (!p.met) p.met = g.x.day;
    p[k] = Math.max(0, Math.min(100, p[k] + (e.by ?? 5)));
    out.push({ type: k, npc: e[k], word: standing(g, e[k], t) });
  }
  else if ('tell' in e) out.push({ type: 'tell', kind: e.tell });
  else if ('time' in e) spend(g, e.time, out);
  else if ('queue' in e) {
    const [lo, hi] = Array.isArray(e.inDays) ? e.inDays : [e.inDays ?? 1, e.inDays ?? 1];
    g.x.queue.push({ ev: e.queue, day: g.x.day + lo + Math.floor(rnd(g) * (hi - lo + 1)) });
    out.push({ type: 'queued', event: e.queue });
  }
}
const run = (data, g, list, ctx, t, out) => { for (const e of list || []) fx(data, g, e, ctx, t, out); };

// ---------------------------------------------------------------
// which event: may it happen now, and why not

// when a loose end's return is due: its own range of days, a fixed roll per (game, thread, how often it came up)
export function dueDay(g, ev) {
  const th = g.x.threads[ev.thread.id];
  if (!th) return Infinity;
  const [lo, hi] = ev.thread.after || [1, 3];
  return th.touched + lo + (mix(g.x.seed, ev.thread.id, th.n, ev.name || '') % (hi - lo + 1));
}

export const classOf = (ev) => (ev.spine ? 'spine' : ev.thread ? 'thread' : 'pool');
const trigBase = (trig) => String(trig).split(':')[0];
export const isDangerous = (data, id) => Object.values(E(data, id)?.nodes || {}).some(n => n.hook && data.hooks[n.hook.kind]?.danger);

// → { ok, why: [plain words] }. trig null = "anywhere, any way" (the lab's "what could happen at all")
export function can(data, g, id, trig, ctx, t) {
  const ev = E(data, id), why = [], x = g.x;
  const n = Story.seenCount(g.s, id), lastDay = x.last[id];
  if (trig && !(ev.on || []).includes(trig)) why.push(`happens on: ${(ev.on || ['(only when called)']).join(', ')}`);
  if (ev.at && ![].concat(ev.at).includes(x.at)) why.push(`happens at: ${[].concat(ev.at).map(p => data.spots[p]?.name || p).join(' or ')}`);
  const once = ev.once ?? !!ev.spine;
  if (n && once) why.push('it already happened');
  if (n && ev.limit && n >= ev.limit) why.push('it has happened as often as it will');
  if (n && !once && lastDay !== undefined && x.day - lastDay < (ev.cooldown ?? 1)) why.push('it happened too recently');
  if (ev.thread) {
    const th = x.threads[ev.thread.id];
    if (!th || th.s !== 'open') why.push(`the loose end "${data.threads[ev.thread.id]?.name || ev.thread.id}" isn't open`);
    else {
      if (ev.thread.gte && th.n < ev.thread.gte) why.push('that loose end hasn\'t come up often enough');
      if (x.day < dueDay(g, ev)) why.push('not yet: it comes back in its own time');
    }
  }
  why.push(...Cond.why(ev.when, g, ctx));
  const a = allowed(ev, g, ctx, t);
  if (!a.ok) why.push(a.why);
  return { ok: !why.length, why };
}

// the main story's next beat: where the player goes to move on. → { id, name, at, on, missing } | null
export function spineNext(data, g, ctx = {}) {
  const c = full(data, g, ctx);
  const left = Object.entries(data.events).filter(([id, ev]) => ev.spine && !Story.seenIt(g.s, id)).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  if (!left.length) return null;
  const [id, ev] = left.find(([, e]) => Cond.test(e.when, g, c)) || left[0];
  return { id, name: ev.name, at: [].concat(ev.at || []), on: ev.on || [], missing: Cond.why(ev.when, g, c) };
}

// THE PICK. → { id | null, cls, why, considered: [{ id, cls, ok, why }] }. Rolls dice: call it once per trigger.
export function pick(data, g, trig, ctx = {}, tune) {
  const t = tune || getTune(), c = full(data, g, ctx), x = g.x;
  const considered = Object.keys(data.events).map(id => ({ id, cls: classOf(E(data, id)), ...can(data, g, id, trig, c, t) }));
  const ok = considered.filter(k => k.ok);
  const done = (id, cls, why) => ({ id, cls, why, considered });

  // 1. something set going earlier whose day has come
  const q = x.queue.find(k => k.day <= x.day && ok.some(o => o.id === k.ev));
  if (q) return done(q.ev, 'queue', 'It was set going earlier, and now is the moment.');

  // 2. the main story: never left to chance
  const spine = ok.filter(k => k.cls === 'spine').sort((a, b) => (E(data, a.id).order || 0) - (E(data, b.id).order || 0))[0];
  if (spine) return done(spine.id, 'spine', 'The main story goes on here.');

  // 3. a loose end that is due: a few a day at most, never two close together, never certain
  if (x.today.returns < t.pick.threadsPerDay && absSlot(x) - x.today.lastReturn >= t.pick.threadGapSlots) {
    const due = ok.filter(k => k.cls === 'thread').filter(k => rnd(g) < t.pick.threadChance * (E(data, k.id).chance ?? 1));
    if (due.length) return done(weighted(g, due, due.map(k => 1 + Math.max(0, x.day - dueDay(g, E(data, k.id))))).id, 'thread', 'A loose end came back.');
  }

  // 4. by chance: sometimes nothing, never the same thing over and over
  const base = data.triggers[trigBase(trig)] || {};
  if (x.today.pool >= t.pick.poolPerDay) return done(null, null, 'Enough has happened today.');
  if (rnd(g) < (base.quiet ?? 0.3) * t.pick.quietK) return done(null, null, 'Nothing this time: not every walk is a story.');
  // … and never the very thing that happened last
  const pool = ok.filter(k => k.cls === 'pool' && k.id !== x.recent[0]).filter(k => rnd(g) < (E(data, k.id).chance ?? 1));
  if (!pool.length) return done(null, null, 'Nothing fits right now.');
  return done(weighted(g, pool, pool.map(k => (E(data, k.id).w ?? 1) * (x.recent.includes(k.id) ? t.pick.recentK : 1))).id, 'pool', 'By chance.');
}
function weighted(g, list, w) {
  let r = rnd(g) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

// ---------------------------------------------------------------
// playing an event

export function begin(data, g, id, ctx = {}, tune, o = {}) {
  const t = tune || getTune(), ev = E(data, id), out = [];
  if (!ev) return [{ type: 'error', why: 'no such event: ' + id }];
  if (g.x.over) return [{ type: 'over' }];
  if (g.x.play) return [{ type: 'busy', event: g.x.play.ev }];
  g.x.play = { ev: id, node: ev.start, wait: null, cls: o.cls || classOf(ev), slots: o.slots || 0 };
  out.push({ type: 'began', event: id, name: ev.name, cls: g.x.play.cls });
  enter(data, g, full(data, g, ctx), t, out);
  return out;
}

export function choicesFor(data, g, ctx, tune) {
  const t = tune || getTune();
  if (!g.x.play) return [];
  const c = full(data, g, ctx), node = E(data, g.x.play.ev).nodes[g.x.play.node];
  const list = [];
  for (const ch of node.choices || []) {
    if (!allowed(ch, g, c, t).ok) continue; // rated or filtered and off: simply not there
    const missing = Cond.why(ch.when, g, c);
    if (missing.length && !ch.tease) continue;
    list.push({ id: ch.id, text: fill(data, g, c, ch.text), tone: ch.tone || null, ok: !missing.length, why: missing.join('; ') });
  }
  return list;
}
const hookEvent = (data, node) => ({ type: 'hook', kind: node.hook.kind, name: data.hooks[node.hook.kind].name, args: { ...node.hook }, outcomes: data.hooks[node.hook.kind].outcomes });

// a node's question, if it has one: choices or a hook. → true = the event now waits for the answer
function asks(data, g, ctx, t, out) {
  const p = g.x.play, ev = E(data, p.ev), node = ev.nodes[p.node];
  if (node.choices) { p.wait = 'choice'; out.push({ type: 'choices', list: choicesFor(data, g, ctx, t) }); return true; }
  if (node.hook) {
    p.wait = 'hook';
    // a beat that must be kept: the moment before anything dangerous (where a game over loads back to)
    if (data.hooks[node.hook.kind].danger) out.push({ type: 'autosave', reason: 'Before: ' + ev.name });
    out.push(hookEvent(data, node));
    return true;
  }
  return false;
}
// after a full scene: its ending may branch ("on"), else the node goes on as any other
function afterScene(data, g, ctx, t, out, end) {
  const p = g.x.play, node = E(data, p.ev).nodes[p.node];
  p.scene = null; p.wait = null;
  const to = node.on?.[end] ?? node.on?.else;
  if (to) { goTo(data, g, to, ctx, t, out); return; }
  if (asks(data, g, ctx, t, out)) return;
  goTo(data, g, node.end ? 'end' : route(node.next, g, ctx), ctx, t, out);
}

function enter(data, g, ctx, t, out) {
  const p = g.x.play;
  for (let guard = 0; guard < 60; guard++) {
    const ev = E(data, p.ev), node = ev.nodes[p.node];
    run(data, g, node.do, ctx, t, out);
    if (node.card) showCard(data, g, node.card, ctx, out);
    if (node.text !== undefined) out.push({ type: 'beat', who: node.who || 'narrator', face: node.face || null, text: say(data, g, node.text, ctx, p.ev + '/' + p.node) });
    if (node.scene) {
      const k = slot(data, g, node.scene, node.where || 'home', ctx, t);
      if (k) {
        const se = sceneEvent(data, g, ctx, k, node.scene);
        out.push(se);
        // a full scene: the page plays it (scene-engine.js) and answers with how it ended
        if (se.play) { p.wait = 'scene'; p.scene = { slot: node.scene, id: k.variant.id }; return; }
      }
    }
    if (asks(data, g, ctx, t, out)) return;
    const to = route(node.next, g, ctx);
    if (node.end || !to || to === 'end') { finish(data, g, ctx, t, out); return; }
    // a node with nothing to show is only plumbing: go straight on
    if (node.text === undefined && !node.card && !node.scene) { p.node = to; continue; }
    p.wait = 'next';
    return;
  }
  finish(data, g, ctx, t, out);
}

// "next": a node id, or [{ when, to }, …, { to }] (the first that fits)
function route(nextSpec, g, ctx) {
  if (!nextSpec) return null;
  if (typeof nextSpec === 'string') return nextSpec;
  const hit = nextSpec.find(k => Cond.test(k.when, g, ctx));
  return hit ? hit.to : null;
}
function goTo(data, g, to, ctx, t, out) {
  if (!to || to === 'end') { finish(data, g, ctx, t, out); return; }
  g.x.play.node = to; g.x.play.wait = null;
  enter(data, g, ctx, t, out);
}

function finish(data, g, ctx, t, out) {
  const x = g.x, id = x.play.ev, ev = E(data, id), cls = x.play.cls, slots = x.play.slots;
  Story.markSeen(g.s, id, now(ctx));
  x.last[id] = x.day;
  x.recent = [id, ...x.recent.filter(k => k !== id)].slice(0, t.pick.recent);
  if (ev.thread) { const th = x.threads[ev.thread.id]; if (th && th.s === 'open') th.touched = x.day; }
  if (cls === 'thread') { x.today.returns += 1; x.today.lastReturn = absSlot(x); }
  if (cls === 'pool') x.today.pool += 1;
  const qi = x.queue.findIndex(k => k.ev === id && k.day <= x.day);
  if (qi >= 0) x.queue.splice(qi, 1);
  if (ev.hears) out.push({ type: 'tell', kind: ev.hears });
  x.play = null;
  out.push({ type: 'ended', event: id, name: ev.name, cls });
  spend(g, slots, out);
  // the main story's beats are always kept; anything else may ask with "save": true
  if (ev.spine || ev.save) out.push({ type: 'autosave', reason: ev.name });
}

// how a lost fight ends: the game's difficulty decides (difficulty.js; ctx.preset = Difficulty.preset(…)).
// Easy: she takes care of you. Harder: she may reach you in time (the bond, her Support, whether she's
// along), or it's a game over and the player loads a save. ctx.salt keeps a second try from rolling the same.
export function defeatChance(g, ctx) {
  const p = ctx.preset;
  if (!p || p.knockout !== 'gameover') return 1;
  return saveChance(p, { stage: Number.isFinite(ctx.stage) ? ctx.stage : 1, support: ctx.levels?.jun?.support || 1, together: (ctx.with || []).includes('jun') });
}
export function defeat(g, ctx) {
  const p = ctx.preset;
  if (!p || p.knockout !== 'gameover') return 'care';
  const roll = mix('saved', g.x.seed, g.x.day, g.x.slot, ctx.salt ?? 0) / 4294967296;
  return roll < defeatChance(g, ctx) ? 'saved' : 'gameover';
}

// the player's answer: {} = go on · { choice: id } · { result: 'cleared' } (how the hook went)
export function step(data, g, input = {}, ctx = {}, tune) {
  const t = tune || getTune(), out = [], x = g.x;
  if (x.over) return [{ type: 'over' }];
  if (!x.play) return out;
  const c = full(data, g, ctx), ev = E(data, x.play.ev), node = ev.nodes[x.play.node];

  if (x.play.wait === 'choice') {
    const ch = (node.choices || []).find(k => k.id === input.choice);
    const offered = choicesFor(data, g, ctx, t).find(k => k.id === input.choice);
    if (!ch || !offered || !offered.ok) return [{ type: 'error', why: 'not a choice you have' }];
    Story.choose(g.s, x.play.ev + '.' + x.play.node, ch.id, now(ctx));
    out.push({ type: 'chose', event: x.play.ev, node: x.play.node, choice: ch.id, text: offered.text });
    run(data, g, ch.do, c, t, out);
    goTo(data, g, route(ch.next ?? node.next, g, c), c, t, out);
    return out;
  }
  if (x.play.wait === 'hook') {
    const hook = data.hooks[node.hook.kind], how = input.result;
    if (!hook.outcomes.includes(how)) return [{ type: 'error', why: `"${how}" isn't a way a ${node.hook.kind} can go` }];
    out.push({ type: 'hooked', kind: node.hook.kind, result: how });
    let to = node.on?.[how];
    if (hook.danger && how === hook.danger) {
      const end = defeat(g, c);
      out.push({ type: 'defeat', how: end, chance: defeatChance(g, c) });
      if (end === 'gameover') { x.over = { ev: x.play.ev, day: x.day }; if (data.tells?.game_over) out.push({ type: 'tell', kind: 'game_over' }); out.push({ type: 'gameover', event: x.play.ev, name: ev.name }); return out; }
      const k = slot(data, g, 'care', c.with.includes('jun') ? 'home' : 'alone', c, t);
      if (k) { const se = sceneEvent(data, g, c, k, 'care', { saved: end === 'saved' }); delete se.play; out.push(se); }   // a care moment is always just read
      to = node.on?.[end] ?? node.on?.care ?? to;
    }
    goTo(data, g, to ?? node.on?.else, c, t, out);
    return out;
  }
  if (x.play.wait === 'scene') {
    const end = input.scene && input.scene.end;
    if (typeof end !== 'string' || !end) return [{ type: 'error', why: 'a scene is playing: say how it ended' }];
    out.push({ type: 'scened', slot: x.play.scene?.slot, id: x.play.scene?.id, end });
    afterScene(data, g, c, t, out, end);
    return out;
  }
  if (x.play.wait === 'next') { goTo(data, g, route(node.next, g, c), c, t, out); return out; }
  return out;
}

// an event left half-way (the window closed, a save loaded): what the page shows to carry on
export function pending(data, g, ctx = {}, tune) {
  const p = g.x.play;
  if (g.x.over) return [{ type: 'gameover', event: g.x.over.ev, name: E(data, g.x.over.ev)?.name }];
  if (!p) return [];
  const ev = E(data, p.ev), node = ev.nodes[p.node];
  const out = [{ type: 'resumed', event: p.ev, name: ev.name }];
  if (p.wait === 'choice') out.push({ type: 'choices', list: choicesFor(data, g, ctx, tune) });
  else if (p.wait === 'hook') out.push(hookEvent(data, node));
  else if (p.wait === 'scene') {
    // the same scene again, from its start (nothing of a half-played scene was kept). If it's gone (one of the
    // owner's, switched off meanwhile), whatever the slot gives now
    const c = full(data, g, ctx), t = tune || getTune();
    const k = (p.scene && Scenes.find({ scenes: data.scenes }, p.scene.slot, p.scene.id)) || slot(data, g, node.scene, node.where || 'home', c, t);
    const se = k ? sceneEvent(data, g, c, k, node.scene) : null;
    if (se) out.push(se);
    if (!se || !se.play) afterScene(data, g, c, t, out, 'leave');
  }
  return out;
}

// ---------------------------------------------------------------
// the world's side: arriving somewhere from the map, what you can do there, "does anything happen?"

export const triggersHere = (data, g) => (data.spots[g.x.at]?.triggers || []).map(id => ({ id, name: triggerName(data, id) }));
export function triggerName(data, trig) {
  const [b, who] = String(trig).split(':');
  const n = data.triggers[b]?.name || b;
  return who ? n.replace('{who}', data.npcs?.[who]?.name || who) : n;
}

// ask the world: → events. Something may begin (then step() until 'ended'), or nothing happens.
export function trigger(data, g, trig, ctx = {}, tune) {
  const t = tune || getTune(), out = [];
  if (g.x.over) return [{ type: 'over' }];
  if (g.x.play) return [{ type: 'busy', event: g.x.play.ev }];
  const base = data.triggers[trigBase(trig)] || {};
  const p = pick(data, g, trig, ctx, t);
  out.push({ type: 'picked', trig, id: p.id, cls: p.cls, why: p.why, considered: p.considered });
  if (p.id) { out.push(...begin(data, g, p.id, ctx, t, { cls: p.cls, slots: base.slots || 0 })); return out; }
  const quiet = say(data, g, base.nothing, full(data, g, ctx), 'quiet:' + trigBase(trig));
  if (quiet) out.push({ type: 'quiet', text: quiet });
  spend(g, base.slots || 0, out);
  return out;
}

// you walk in from the map (places.json go: { story: spot }). The map decides whether the place is open;
// the engine only needs the spot to exist.
export function arrive(data, g, spot, ctx = {}, tune) {
  if (g.x.over) return [{ type: 'over' }];
  if (g.x.play) return [{ type: 'busy', event: g.x.play.ev }];
  const sp = data.spots[spot];
  if (!sp) return [{ type: 'error', why: 'the story doesn\'t know that place: ' + spot }];
  g.x.at = spot;
  Story.setPlace(g.s, ctx.placeName || sp.name, undefined, now(ctx));
  return [{ type: 'arrived', spot, name: ctx.placeName || sp.name }, ...trigger(data, g, 'enter', ctx, tune)];
}

// ---------------------------------------------------------------
// the rulebook: [] = the data keeps every rule.
// known: { grants: [story grant ids], areas: [delve places], places: places.json (the map) }

export function validate(data, known = {}, { shipped = true } = {}) {
  const e = [];
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const id = (v, where) => { if (!Story.isId(v)) e.push(`${where}: "${v}" can't be an id (lower case, digits, _ . : -)`); };
  const trigOk = (tr) => has(data.triggers, trigBase(tr)) && (!String(tr).includes(':') || has(data.npcs, String(tr).split(':')[1]));
  const checkCond = (c, where, spine) => {
    const r = Cond.reads(c);
    for (const b of r.bad) e.push(`${where}: a condition nobody understands: ${b}`);
    for (const k of r.threads) if (!has(data.threads, k)) e.push(`${where}: unknown thread ${k}`);
    for (const k of r.events) if (!has(data.events, k)) e.push(`${where}: unknown event ${k}`);
    for (const k of r.spots) if (!has(data.spots, k)) e.push(`${where}: unknown place ${k}`);
    for (const k of r.cards) if (!has(data.cards, k)) e.push(`${where}: unknown card ${k}`);
    for (const k of r.npcs) if (!has(data.npcs, k)) e.push(`${where}: unknown person ${k}`);
    if (spine) for (const k of r.subjects) if (Cond.GATED.includes(k)) e.push(`${where}: the main story can never wait on "${k}" (perks help, never gate)`);
  };
  const checkTier = (k, where) => {
    const tier = k.tier || 'everyday';
    if (!TIERS.includes(tier)) e.push(`${where}: unknown tier ${tier}`);
    if (shipped && tier === 'adult') e.push(`${where}: 18+ entries are the owner's (the makers), never shipped`);
    if (shipped && k.consent === 'beforehand') e.push(`${where}: "agreed beforehand" entries are the owner's to write, never shipped`);
    if (k.who && k.who !== 'jun' && !has(data.npcs, k.who)) e.push(`${where}: unknown person ${k.who}`);
  };
  const opens = new Set(), moves = new Set();
  const checkFx = (list, where) => {
    for (const f of list || []) {
      const verb = EFFECTS.find(k => k in f);
      if (!verb) { e.push(`${where}: an effect nobody understands: ${JSON.stringify(f)}`); continue; }
      if (f.when !== undefined) checkCond(f.when, where);
      if (['set', 'unset', 'inc', 'quest', 'agree'].includes(verb)) id(f[verb], where);
      if (shipped && verb === 'agree') e.push(`${where}: which line gives an agreement is the owner's to write`);
      if (['open', 'advance', 'close'].includes(verb) && !has(data.threads, f[verb])) e.push(`${where}: unknown thread ${f[verb]}`);
      if (verb === 'open') opens.add(f.open);
      if (verb === 'close' || verb === 'advance') moves.add(f[verb]);
      if (verb === 'card' && !has(data.cards, f.card)) e.push(`${where}: unknown card ${f.card}`);
      if ((verb === 'rep' || verb === 'aff') && !has(data.npcs, f[verb])) e.push(`${where}: unknown person ${f[verb]}`);
      if (verb === 'tell' && !has(data.tells, f.tell)) e.push(`${where}: "${f.tell}" isn't a kind in "tells"`);
      if (verb === 'queue' && !has(data.events, f.queue)) e.push(`${where}: unknown event ${f.queue}`);
      if (verb === 'grant' && known.grants && !known.grants.includes(f.grant)) e.push(`${where}: the progression service has no story grant "${f.grant}"`);
    }
  };
  const textOk = (tx) => (typeof tx === 'string' ? !!tx : Array.isArray(tx) && tx.length > 0 && tx.every(k => (typeof k === 'string' && k) || (k && (typeof k.t === 'string' || (Array.isArray(k.t) && k.t.length)))));

  if (!has(data.spots, data.start?.spot)) e.push('start: the place the story starts in doesn\'t exist');
  if (data.start?.herFlag) id(data.start.herFlag, 'start.herFlag');
  const onMap = known.places ? (known.places.places || []).filter(p => p.go?.story).map(p => p.go.story) : null;
  for (const [sid, sp] of Object.entries(data.spots || {})) {
    id(sid, 'spot ' + sid);
    if (!sp.name) e.push(`spot ${sid}: no name`);
    for (const tr of sp.triggers || []) if (!trigOk(tr)) e.push(`spot ${sid}: unknown thing to do "${tr}"`);
    if (onMap && !onMap.includes(sid)) e.push(`spot ${sid}: no place on the map goes here (data/places.json go: { story: "${sid}" })`);
  }
  if (onMap) for (const k of onMap) if (!has(data.spots, k)) e.push(`the map's place "${k}" has no spot in the story`);
  for (const [hid, h] of Object.entries(data.hooks || {})) {
    if (!Array.isArray(h.outcomes) || !h.outcomes.length) e.push(`hook ${hid}: say how it can go ("outcomes")`);
    if (h.danger && !h.outcomes.includes(h.danger)) e.push(`hook ${hid}: its danger "${h.danger}" isn't one of its outcomes`);
  }
  for (const [cid, c] of Object.entries(data.cards || {})) {
    if (!CARD_KINDS.includes(c.kind)) e.push(`card ${cid}: unknown kind ${c.kind}`);
    if (!has(data.codex?.pages, c.page)) e.push(`card ${cid}: unknown codex page ${c.page}`);
    if (!c.title || !textOk(c.text)) e.push(`card ${cid}: needs a title and words`);
    if (c.who && !has(data.npcs, c.who)) e.push(`card ${cid}: unknown person ${c.who}`);
  }
  for (const [pid, p] of Object.entries(data.codex?.pages || {})) {
    if (!Object.values(data.cards).some(c => c.page === pid)) e.push(`codex page ${pid}: no cards`);
    if (p.grant && known.grants && !known.grants.includes(p.grant)) e.push(`codex page ${pid}: the progression service has no story grant "${p.grant}"`);
  }
  e.push(...Scenes.checkSlots({ scenes: data.scenes || {} }).map(k => 'scene ' + k));
  // full scenes: the library keeps its own rulebook, and a slot may only name a scene that exists, in the right list
  if (data.lib) e.push(...Sc.checkLibrary(data.lib, { shipped, npcs: data.npcs }));
  for (const [sid, sl] of Object.entries(data.scenes || {})) for (const tier of TIERS) for (const v of sl.variants?.[tier] || []) {
    if (typeof v.scene !== 'string') continue;
    const sc = data.lib?.scenes?.[v.scene];
    if (!sc) e.push(`scene ${sid}/${v.id}: unknown full scene "${v.scene}" (data/scenes.json)`);
    else if ((sc.tier || 'everyday') !== tier) e.push(`scene ${sid}/${v.id}: "${v.scene}" is tagged ${sc.tier || 'everyday'} but sits in the ${tier} list`);
  }
  if (!has(data.scenes, 'care')) e.push('scenes: the "care" slot is missing (what a lost fight becomes when she takes care of you)');

  for (const [eid, ev] of Object.entries(data.events || {})) {
    const w = 'event ' + eid;
    id(eid, w);
    if (!ev.name) e.push(`${w}: no name`);
    if (!ev.nodes || !has(ev.nodes, ev.start)) { e.push(`${w}: its start node doesn't exist`); continue; }
    for (const tr of ev.on || []) if (!trigOk(tr)) e.push(`${w}: unknown trigger ${tr}`);
    for (const p of [].concat(ev.at || [])) if (!has(data.spots, p)) e.push(`${w}: unknown place ${p}`);
    if (ev.hears && !has(data.tells, ev.hears)) e.push(`${w}: "${ev.hears}" isn't a kind in "tells"`);
    checkTier(ev, w);
    checkCond(ev.when, w, !!ev.spine);
    if (ev.thread) {
      if (!has(data.threads, ev.thread.id)) e.push(`${w}: unknown thread ${ev.thread.id}`);
      const a = ev.thread.after;
      if (a && !(Array.isArray(a) && a.length === 2 && a[0] >= 0 && a[1] >= a[0])) e.push(`${w}: "after" is [from, to] days`);
      moves.add(ev.thread.id);
    }
    if (ev.spine) {
      if (!Number.isFinite(ev.order)) e.push(`${w}: a main-story beat needs its "order"`);
      if (ev.chance !== undefined) e.push(`${w}: the main story is never left to chance`);
      if ((ev.tier || 'everyday') !== 'everyday' || ev.themes || ev.minStage || ev.thread) e.push(`${w}: the main story is Everyday, for everyone, and never a loose end`);
      if (!(ev.on || []).length) e.push(`${w}: a main-story beat needs a trigger the world can ask with`);
    }
    // nodes: every link lands, everything is reachable, every road ends
    const links = (n) => {
      const out = [];
      const add = (nx) => { if (typeof nx === 'string') out.push(nx); else for (const k of nx || []) out.push(k.to); };
      add(n.next);
      for (const ch of n.choices || []) add(ch.next);
      for (const v of Object.values(n.on || {})) out.push(v);
      return out;
    };
    for (const [nid, n] of Object.entries(ev.nodes)) {
      const nw = `${w}/${nid}`;
      if (!Story.isId(eid + '.' + nid)) e.push(`${nw}: "${eid}.${nid}" is too long or odd to remember a choice by`);
      for (const k of Object.keys(n)) if (!NODE_KEYS.includes(k)) e.push(`${nw}: unknown key "${k}"`);
      if (n.text !== undefined && !textOk(n.text)) e.push(`${nw}: empty words`);
      if (Array.isArray(n.text)) for (const k of n.text) if (k && typeof k === 'object') checkCond(k.when, nw);
      if (n.who && !['narrator', 'jun', 'you'].includes(n.who) && !has(data.npcs, n.who)) e.push(`${nw}: unknown speaker ${n.who}`);
      if (n.card && !has(data.cards, n.card)) e.push(`${nw}: unknown card ${n.card}`);
      if (n.scene && !has(data.scenes, n.scene)) e.push(`${nw}: unknown scene slot ${n.scene}`);
      if (n.choices && n.hook) e.push(`${nw}: choices or a hook, not both`);
      checkFx(n.do, nw);
      for (const l of links(n)) if (l !== 'end' && !has(ev.nodes, l)) e.push(`${nw}: leads to unknown node ${l}`);
      if (Array.isArray(n.next)) { for (const k of n.next) checkCond(k.when, nw); if (n.next[n.next.length - 1].when !== undefined) e.push(`${nw}: the last "next" needs no condition, so the story always goes on`); }
      if (n.choices) {
        const ids = n.choices.map(c => c.id);
        if (new Set(ids).size !== ids.length) e.push(`${nw}: every choice needs its own id`);
        if (!n.choices.some(c => !c.when && (c.tier || 'everyday') === 'everyday' && !c.themes && !c.minStage && !c.who && !c.consent)) e.push(`${nw}: needs at least one plain choice anyone can take`);
        for (const c of n.choices) {
          id(c.id, `${nw}/${c.id}`);
          if (!c.text) e.push(`${nw}/${c.id}: no words`);
          checkTier(c, `${nw}/${c.id}`); checkCond(c.when, `${nw}/${c.id}`); checkFx(c.do, `${nw}/${c.id}`);
          if (Array.isArray(c.next) && c.next[c.next.length - 1].when !== undefined) e.push(`${nw}/${c.id}: the last "next" needs no condition`);
        }
      }
      if (n.hook) {
        const h = data.hooks?.[n.hook.kind];
        if (!h) { e.push(`${nw}: unknown hook ${n.hook.kind}`); continue; }
        const on = n.on || {};
        for (const o of h.outcomes) {
          if (o === h.danger) continue; // a lost fight has its own endings (care / saved), or just ends the event
          if (!has(on, o) && !has(on, 'else')) e.push(`${nw}: what if the ${n.hook.kind} goes "${o}"? (or give it an "else")`);
        }
        for (const k of Object.keys(on)) if (![...h.outcomes, 'else', 'care', 'saved'].includes(k)) e.push(`${nw}: a ${n.hook.kind} never goes "${k}"`);
        if (n.hook.kind === 'delve' && known.areas && !known.areas.includes(n.hook.area)) e.push(`${nw}: unknown delve place ${n.hook.area}`);
      }
    }
    const reach = new Set([ev.start]);
    for (const q = [ev.start]; q.length;) for (const l of links(ev.nodes[q.pop()] || {})) if (l !== 'end' && has(ev.nodes, l) && !reach.has(l)) { reach.add(l); q.push(l); }
    for (const nid of Object.keys(ev.nodes)) if (!reach.has(nid)) e.push(`${w}/${nid}: nothing leads here`);
    const ends = new Set(Object.entries(ev.nodes).filter(([, n]) => n.end || links(n).length === 0 || links(n).includes('end')).map(([k]) => k));
    for (let grew = true; grew;) { grew = false; for (const [nid, n] of Object.entries(ev.nodes)) if (!ends.has(nid) && links(n).some(l => ends.has(l))) { ends.add(nid); grew = true; } }
    for (const nid of reach) if (!ends.has(nid)) e.push(`${w}/${nid}: this road never ends`);
  }
  for (const [tid, th] of Object.entries(data.threads || {})) {
    if (!th.name || !th.line) e.push(`thread ${tid}: needs a name and a line saying what it is`);
    if (!opens.has(tid)) e.push(`thread ${tid}: nothing ever opens it`);
    if (!moves.has(tid) && !th.quiet) e.push(`thread ${tid}: nothing ever comes of it (give it a return, or mark it "quiet")`);
  }
  return e;
}
