// "a hundred playthroughs in a moment": a stand-in player lives through the story with the real
// rules (story-engine.js, the map's places.js, difficulty.js), so the lab and the tests can see what a writer
// can't see by reading: does the main story always get told, how often does each by-chance event show
// up, do loose ends really come back (and not all at once), does anything repeat, can anyone get stuck.
// Seeded: the same seed and the same kind of player, the same story.
//
// The stand-in has a temperament ("policy"): kind / blunt / joke / random pick choices by their tone;
// "no" turns down whatever can be turned down (a player who only wants the main story). A game over is
// what it is for a player: back to the last autosave (kept here in memory), and try again.

import * as En from './story-engine.js?v=4';
import { tune as getTune } from './story-tune.js?v=1';
import { dice, mix } from '../delve/rng.js?v=1';
import * as Places from '../world/places.js?v=1';

export const POLICIES = [['kind', 'Kind'], ['blunt', 'Blunt'], ['joke', 'Jokes about everything'], ['no', 'Says "not now" to everything'], ['random', 'Different every time']];

function choose(list, policy, rnd) {
  const ok = list.filter(c => c.ok);
  if (!ok.length) return null;
  if (policy === 'no') return (ok.find(c => /not now|keep walking|let it|later|wait/i.test(c.text)) || ok[ok.length - 1]).id;
  if (policy !== 'random') { const fit = ok.filter(c => c.tone === policy); if (fit.length) return rnd.pick(fit).id; }
  return rnd.pick(ok).id;
}

// how a hook went, by the data's own odds ("sim" weights); force = after too many game overs, anything but the danger
function hookResult(data, kind, rnd, force) {
  const h = data.hooks[kind];
  return rnd.weighted(h.outcomes.filter(o => !(force && o === h.danger)).map(o => [o, (h.sim && h.sim[o]) ?? 1]));
}

// one playthrough. o: { seed, policy, days, ctx, places (data/places.json), difficulty, stopAtEnd }. → { g, stats }
export function playthrough(data, o = {}, tune) {
  const t = tune || getTune();
  const seed = o.seed ?? 1, policy = o.policy || 'kind', places = o.places || { places: Object.keys(data.spots).map(id => ({ id, name: id, line: id, show: true, open: true, go: { story: id } })) };
  const rnd = dice(mix('standin', seed, policy));
  let g = En.newGame(data, seed, o.difficulty || o.ctx?.preset?.id || 'easy');
  let salt = 0;
  const ctx = () => ({ ...(o.ctx || {}), now: g.x.day, salt });
  const stats = { fired: {}, order: [], cls: { spine: 0, thread: 0, pool: 0, queue: 0 }, quiet: 0, asked: 0, errors: [], gameovers: 0, saved: 0, cared: 0, tells: {}, cards: 0, grants: [],
    inARow: 1, threads: {}, perDayReturns: 0, finishedDay: null, hooks: {}, scenes: {}, autosaves: 0, placesOpened: 0 };
  let last = null, row = 1, saved = JSON.stringify(g), tries = 0;

  const take = (events) => {
    for (const e of events) {
      if (e.type === 'error') stats.errors.push(e.why);
      else if (e.type === 'began') {
        stats.fired[e.event] = (stats.fired[e.event] || 0) + 1; stats.order.push(e.event); stats.cls[e.cls] = (stats.cls[e.cls] || 0) + 1;
        row = e.event === last ? row + 1 : 1; last = e.event; stats.inARow = Math.max(stats.inARow, row);
        if (e.cls === 'thread') (stats.threads[data.events[e.event].thread.id] ||= { opened: null, closed: null, as: null, returns: 0 }).returns += 1;
      }
      else if (e.type === 'quiet') stats.quiet += 1;
      else if (e.type === 'tell') stats.tells[e.kind] = (stats.tells[e.kind] || 0) + 1;
      else if (e.type === 'card' && e.first) stats.cards += 1;
      else if (e.type === 'grant') stats.grants.push(e.id);
      else if (e.type === 'autosave') { stats.autosaves += 1; saved = JSON.stringify(g); }
      else if (e.type === 'defeat') { if (e.how === 'saved') stats.saved += 1; if (e.how === 'care') stats.cared += 1; }
      else if (e.type === 'gameover') stats.gameovers += 1;
      else if (e.type === 'choices' && !e.list.some(c => c.ok)) stats.errors.push('no choice to take in ' + g.x.play.ev + '/' + g.x.play.node);
      else if (e.type === 'thread') {
        const th = (stats.threads[e.id] ||= { opened: null, closed: null, as: null, returns: 0 });
        if (e.change === 'opened') th.opened = g.x.day;
        if (e.change === 'closed') { th.closed = g.x.day; th.as = e.as; }
      }
    }
  };
  // play whatever is going on to its end
  const drain = () => {
    let guard = 0;
    while ((g.x.play || g.x.over) && guard++ < 400) {
      if (g.x.over) { g = JSON.parse(saved); salt += 1; tries += 1; continue; }   // load the last autosave, like a player would
      if (g.x.play.wait === 'choice') {
        const id = choose(En.choicesFor(data, g, ctx(), t), policy, rnd);
        if (!id) { stats.errors.push('stuck at a choice'); break; }
        take(En.step(data, g, { choice: id }, ctx(), t));
      } else if (g.x.play.wait === 'hook') {
        const kind = data.events[g.x.play.ev].nodes[g.x.play.node].hook.kind;
        const res = hookResult(data, kind, rnd, tries >= 3);
        stats.hooks[kind + ':' + res] = (stats.hooks[kind + ':' + res] || 0) + 1;
        take(En.step(data, g, { result: res }, ctx(), t));
      } else if (g.x.play.wait === 'scene') {
        // a full scene (#22): a stand-in plays it with the real rules, on the story's own memory
        const node = data.events[g.x.play.ev].nodes[g.x.play.node];
        const k = En.pending(data, g, ctx(), t).find(e => e.type === 'scene' && e.play);
        if (!k) continue;   // the scene was gone: pending() already moved the event on
        const r = En.Sc.playOnce(k.play, data.lib, En.sceneCtx(data, g, ctx(), t), { seed: mix(seed, g.x.day, g.x.slot, node.scene) });
        for (const er of r.stats.errors) stats.errors.push(`scene ${k.play.id}: ${er}`);
        stats.scenes[k.play.id + ':' + r.stats.end] = (stats.scenes[k.play.id + ':' + r.stats.end] || 0) + 1;
        take(En.step(data, g, { scene: { end: r.stats.end } }, ctx(), t));
      } else take(En.step(data, g, {}, ctx(), t));
    }
    tries = 0;
    if (guard >= 400) stats.errors.push('an event that never ends: ' + (g.x.play && g.x.play.ev));
  };
  const act = (events) => { take(events); drain(); };
  const open = () => Places.view(places, g.s).filter(p => p.state === 'open' && p.go?.story).map(p => p.go.story);
  const spineLeft = () => Object.entries(data.events).some(([id, ev]) => ev.spine && !En.Story.seenIt(g.s, id));

  act(En.arrive(data, g, data.start.spot, ctx(), t));
  const days = o.days ?? t.sim.days;
  while (g.x.day <= days) {
    const dayNow = g.x.day;
    for (let i = 0; i < t.sim.perDay && g.x.day === dayNow; i++) {
      const sn = En.spineNext(data, g, ctx());
      if (!sn && stats.finishedDay === null) { stats.finishedDay = g.x.day; if (o.stopAtEnd) return { g, stats }; }
      const here = En.triggersHere(data, g).map(k => k.id), roads = open();
      stats.placesOpened = Math.max(stats.placesOpened, roads.length);
      stats.asked += 1;
      if (sn && !sn.missing.length && rnd() < t.sim.followStory) {
        const atPlace = !sn.at.length || sn.at.includes(g.x.at);
        const trig = sn.on.find(k => here.includes(k));
        if (atPlace && trig) act(En.trigger(data, g, trig, ctx(), t));
        else {
          const goal = sn.at.filter(p => roads.includes(p));
          if (goal.length) act(En.arrive(data, g, rnd.pick(goal), ctx(), t));   // an arrival is a trigger too ("enter")
          else if (sn.at.length) stats.errors.push(`the map hasn't opened ${sn.at.join('/')} for ${sn.id}`);
        }
      } else if (here.length && rnd() < 0.6) act(En.trigger(data, g, rnd.pick(here), ctx(), t));
      else act(En.arrive(data, g, rnd.pick(roads), ctx(), t));
      stats.perDayReturns = Math.max(stats.perDayReturns, g.x.today.day === dayNow ? g.x.today.returns : 0);
    }
    if (g.x.day === dayNow) act(En.trigger(data, g, 'sleep', ctx(), t));
  }
  if (!spineLeft() && stats.finishedDay === null) stats.finishedDay = g.x.day;
  return { g, stats };
}

// many playthroughs, summed up. o as above (+ seed = the first seed)
export function many(data, o = {}, n = 100, tune) {
  const ids = Object.keys(data.events);
  const sum = { n, finished: 0, days: [], errors: [], inARow: 1, perDayReturns: 0, gameovers: 0, saved: 0, cared: 0, quiet: 0, asked: 0, cards: 0, autosaves: 0,
    events: Object.fromEntries(ids.map(id => [id, { in: 0, times: 0 }])), threads: {}, tells: {} };
  for (let i = 0; i < n; i++) {
    const { stats } = playthrough(data, { ...o, seed: (o.seed ?? 1) + i }, tune);
    if (stats.finishedDay !== null) { sum.finished += 1; sum.days.push(stats.finishedDay); }
    for (const er of stats.errors) if (sum.errors.length < 12) sum.errors.push(`seed ${(o.seed ?? 1) + i}: ${er}`);
    sum.inARow = Math.max(sum.inARow, stats.inARow);
    sum.perDayReturns = Math.max(sum.perDayReturns, stats.perDayReturns);
    for (const k of ['gameovers', 'saved', 'cared', 'quiet', 'asked', 'cards', 'autosaves']) sum[k] += stats[k];
    for (const [id, c] of Object.entries(stats.fired)) { sum.events[id].in += 1; sum.events[id].times += c; }
    for (const [k, c] of Object.entries(stats.tells)) sum.tells[k] = (sum.tells[k] || 0) + c;
    for (const [id, th] of Object.entries(stats.threads)) {
      const s = (sum.threads[id] ||= { opened: 0, came: 0, closed: 0, wait: [], how: {} });
      if (th.opened !== null) s.opened += 1;
      if (th.returns) s.came += 1;
      if (th.closed !== null) { s.closed += 1; s.how[th.as] = (s.how[th.as] || 0) + 1; if (th.opened !== null) s.wait.push(th.closed - th.opened); }
    }
  }
  const avg = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
  sum.meanDays = avg(sum.days); sum.minDays = sum.days.length ? Math.min(...sum.days) : 0; sum.maxDays = sum.days.length ? Math.max(...sum.days) : 0;
  for (const s of Object.values(sum.threads)) { s.meanWait = avg(s.wait); delete s.wait; }
  sum.never = ids.filter(id => !sum.events[id].in);
  return sum;
}
