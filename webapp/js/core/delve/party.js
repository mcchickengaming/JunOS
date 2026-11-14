// her side of a delve (#32). Decided Nov 13: SHE'S IN IT, NEVER IN THE WAY.
//   · During play she shows it in WORDS, FACE and VOICE only: a short line and an expression on her
//     portrait. Nothing here can pause the game, ask for a touch or open a prompt.
//   · Hands-on moments WAIT FOR SAFE SPOTS: what moved her down there is kept in a small queue
//     (run.queue) and comes out at a camp, or rides home with her (the delve's summary → her prompt).
//   · Her COURAGE is tunable (some players want a very brave Jun): it changes her lines and her face,
//     NEVER her usefulness. Nothing in abilities.js or encounter.js reads it (tested).
//   · The bond and the relationship flavor never gate a delve. The bond only picks between a few
//     shyer / warmer wordings; the lines themselves are flavor-neutral (no romance in them).
// Lines are by code from data/delve.json "lines" (her brain can take over a moment later: every
// line has an id, so the repeat watcher and a line pack can replace it one by one).

import { tune as getTune } from './delve-tune.js?v=1';

export const COURAGE = [['grows', 'Grows with her'], ['timid', 'Timid'], ['steady', 'Steady'], ['brave', 'Fearless']];
const FIXED = { timid: 0.15, steady: 0.55, brave: 0.95 };

// 0..1. 'grows' (default): a little scared of the dark at first, braver as her Delving and the bond grow
export function courage({ setting = 'grows', delving = 1, stage = 1, tune } = {}) {
  const t = (tune || getTune()).her;
  if (setting in FIXED) return FIXED[setting];
  return Math.max(0, Math.min(1, t.courageBase + t.courageSkill * (Math.max(1, delving) - 1) / 98 + t.courageBond * (Math.max(1, stage) - 1)));
}
export function band(c, tune) {
  const t = (tune || getTune()).her;
  return c < t.timidBelow ? 'timid' : c >= t.braveFrom ? 'brave' : 'steady';
}

// "As she feels": her mood of the day moves how much she talks (initiative.js DAY_MOODS ids)
const MOOD = { quiet: -1, playful: 1, clingy: 0.5, cuddly: 0, easy: 0 };

// the settings' how-often (0..100; 50 = how she comes) on a line's own chance. Never stays never.
export function talkChance(p, { often = 50, asFeels = true, dayMood = 'easy', tune } = {}) {
  if (often <= 0) return 0;
  const t = (tune || getTune()).her;
  if (often >= 100) return p > 0 ? 1 : 0; // "All the time" means it
  const k = often / 50;
  const mood = asFeels ? 1 + t.moodSwing * (MOOD[dayMood] || 0) : 1;
  return Math.max(0, Math.min(1, p * k * mood));
}

// what she'd say at a moment, or null (most passing moments she says nothing).
// ctx: { courage 0..1, stage 1..6, often, asFeels, dayMood, together }
// mem: { recent: [] } is hers to remember what she just said
export function say(data, moment, ctx = {}, mem = { recent: [] }, rnd = Math.random, tune) {
  const t = tune || getTune();
  if (ctx.together === false) moment = { enter: 'call_start', deeper: 'call_deeper', leave: 'call_back', wish: 'call_wish' }[moment] || null;
  else if (moment === 'wish') return null;
  const M = moment && data.lines[moment];
  if (!M) return null;
  if (rnd() >= talkChance(M.p ?? 0.5, { ...ctx, tune: t })) return null;
  const b = band(ctx.courage ?? 0.5, t);
  const stage = ctx.stage || 1;
  const fits = (l) => (!l.c || l.c.includes(b)) && (!l.near || (l.near === 'shy' ? stage <= 2 : stage >= 4));
  let pool = M.say.filter(fits);
  const fresh = pool.filter(l => !(mem.recent || []).includes(l.id));
  if (fresh.length) pool = fresh;
  if (!pool.length) return null;
  // a wording that fits her bond or her courage exactly is a little likelier than an any-time one
  const w = (l) => 1 + (l.c ? 0.5 : 0) + (l.near ? 1 : 0);
  let r = rnd() * pool.reduce((a, l) => a + w(l), 0);
  let pick = pool[pool.length - 1];
  for (const l of pool) { r -= w(l); if (r <= 0) { pick = l; break; } }
  mem.recent = [...(mem.recent || []), pick.id].slice(-t.her.recent);
  return { id: pick.id, moment, t: pick.t, face: pick.face || 'neutral' };
}

// which of her moments an event in the delve is (run.js events → data "lines" keys)
export function momentFor(ev) {
  switch (ev.type) {
    case 'entered': return 'enter';
    case 'descended': return 'deeper';
    case 'quiet': return 'corridor';
    case 'sensed': return ev.what === 'trap' ? 'trap_warn' : 'sensed';
    case 'secret': return 'secret';
    case 'trap': return 'trap_hit';
    case 'fight': return ev.big ? 'fight_big' : 'fight_start';
    case 'fight_over': return ev.how === 'won' ? (ev.hard ? 'fight_hard' : 'fight_won') : null;
    case 'chest': return 'chest';
    case 'vault': return 'vault';
    case 'terminal': return ev.hacked ? 'terminal' : 'terminal_alone';
    case 'odd': return 'odd';
    case 'camp': return 'camp';
    case 'stairs': return 'stairs';
    case 'empty': return 'empty';
    case 'left': return 'leave';
    case 'wish': return 'wish';
    default: return null;
  }
}
// in a fight (encounter.js events)
export function momentInFight(ev, enc) {
  if (ev.type === 'hit' && ev.to === 'you') { const u = enc.units.find(x => x.id === 'you'); if (u && u.hp > 0 && u.hp / u.max < 0.3) return 'you_low'; }
  if (ev.type === 'hit' && ev.to === 'her') { const u = enc.units.find(x => x.id === 'her'); if (u && u.hp > 0 && u.hp / u.max < 0.3) return 'her_low'; }
  if (ev.type === 'down' && ev.who === 'her') return 'her_down';
  return null;
}

// something moved her; she keeps it for the next safe spot (never acted on mid-corridor or mid-fight)
export function keep(run, kind, tune) {
  const t = (tune || getTune()).her;
  if (!run.together || !['scared', 'worried', 'proud'].includes(kind)) return;
  if (run.queue.includes(kind)) return;
  run.queue.push(kind);
  if (run.queue.length > t.queueMax) run.queue.shift();
}
// which events leave something with her. courage: a timid Jun keeps the scares, a brave one mostly the wins
export function feelFor(ev, run, courageNow, tune) {
  const b = band(courageNow, tune);
  if (ev.type === 'trap') return 'worried';
  if (ev.type === 'fight_over' && ev.how === 'won' && ev.hard) return 'worried';
  if (ev.type === 'fight_over' && ev.how === 'won' && ev.big) return 'proud';
  if (ev.type === 'descended' && b === 'timid') return 'scared';
  if (ev.type === 'fight' && ev.big && b === 'timid') return 'scared';
  if (ev.type === 'vault') return 'proud';
  return null;
}

// a safe spot (a camp; the walk home): the moments she kept come out now, as cards the page shows.
// A card is a line and, when the ONE gate says yes (bond, her say), a small hands-on offer the player
// may take or leave. Leaving it is never a penalty. gateCheck = Gate.check, gateCtx = its ctx.
export function safeSpot(data, run, { gateCheck, gateCtx = {}, rnd = Math.random, mem = { recent: [] } } = {}) {
  const cards = [];
  for (const kind of run.queue.splice(0)) {
    const M = data.moments[kind];
    if (!M) continue;
    const fresh = M.say.filter(l => !(mem.recent || []).includes(l.id));
    const line = (fresh.length ? fresh : M.say)[Math.floor(rnd() * (fresh.length || M.say.length))];
    mem.recent = [...(mem.recent || []), line.id].slice(-8);
    let offer = null;
    if (M.offer && gateCheck) {
      const g = gateCheck({ tier: M.offer.tier, minStage: M.offer.minStage }, gateCtx);
      if (g.show && g.her === 'yes') offer = { ...M.offer };
    }
    cards.push({ kind, id: line.id, t: line.t, face: line.face || 'neutral', offer });
  }
  return cards;
}
