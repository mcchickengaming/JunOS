// scene slots (#22, first used by delves #32). Decided Nov 13: ONE SCENE, SEVERAL TIERS, SEAMLESS.
// A moment like "knocked out: she takes care of you" is a SLOT with a variant per tier. The ONE gate
// (js/core/gate.js) picks the highest tier that is switched on AND that her say allows; every slot
// must have an Everyday variant (tested), so a player with rated content off never hits a gap.
//
// Who writes what: Claude builds the slot, the Everyday and Flirty variants and this wiring. 18+
// variants are ALWAYS the owner's, made in the scene maker (#22): they arrive through setCustom()
// (js/core/scene/scene-door.js installs it), never from shipped data (a test keeps the shipped "adult" lists empty).
//
// Since the scene engine (#22, js/core/scene/scene-engine.js) a variant is one of two things:
//   a SIMPLE one   { id, where?, minStage?, beats: [{ face, t }] }: a few lines, as before
//   a FULL scene   { id, …, scene: '<id in data/scenes.json>' } or a whole scene object with `phases`
//                  (setting, pose, layers, phases, the wheel, endings, an album): played by the scene engine.
// This file still only answers WHICH variant plays; isFull() tells the two apart.

export const TIERS_HIGH_FIRST = ['adult', 'flirty', 'everyday'];

let custom = () => [];
// the scene maker's door: fn(slotId, tier) → [variants]. Variants are data only.
export function setCustom(fn) { custom = typeof fn === 'function' ? fn : () => []; }

export const isFull = (v) => !!v && (typeof v.scene === 'string' || (!!v.phases && typeof v.phases === 'object'));
// a variant by its id, wherever it comes from (shipped or the owner's); null if it's gone
export function find(data, slotId, id) {
  const slot = data.scenes?.[slotId];
  for (const tier of TIERS_HIGH_FIRST) for (const v of [...(slot?.variants?.[tier] || []), ...(custom(slotId, tier) || [])]) if (v.id === id) return { tier, variant: v };
  return null;
}

export function checkSlots(data) {
  const e = [];
  for (const [id, slot] of Object.entries(data.scenes || {})) {
    const v = slot.variants || {};
    if (!Array.isArray(v.everyday) || !v.everyday.length) e.push(id + ': no Everyday variant');
    for (const tier of Object.keys(v)) if (!TIERS_HIGH_FIRST.includes(tier)) e.push(id + ': unknown tier ' + tier);
    if ((v.adult || []).length) e.push(id + ': 18+ variants are the owner\'s (scene maker), never shipped');
    for (const tier of TIERS_HIGH_FIRST) for (const x of v[tier] || []) {
      if (!x.id || !(isFull(x) || (Array.isArray(x.beats) && x.beats.length))) e.push(`${id}/${tier}: a variant needs an id and beats (or a full scene)`);
      if (tier === 'everyday' && (x.minStage || x.flavors)) e.push(`${id}/${x.id}: an Everyday variant can't ask for a bond or a flavor`);
    }
  }
  return e;
}

// which variant plays. where: 'home' | 'camp' | 'alone' (a variant without "where" fits anywhere).
// gateCheck = Gate.check; gateCtx = { comfort, mode, stage, trust, tension, stop, screenShare, lookAdult, agreements }
// allow (optional): (item) → { ok, why }: a caller that already reads the one gate its own way (the story engine:
// themes, a person's own closeness, "she'd ask first" as a meter) passes it, and it is asked instead of gateCheck.
export function pick(data, slotId, { where = 'home', gateCheck, gateCtx = {}, allow = null, rnd = Math.random } = {}) {
  const slot = data.scenes?.[slotId];
  if (!slot) return null;
  const fits = (v) => !v.where || v.where === where;
  const tried = [];
  for (const tier of TIERS_HIGH_FIRST) {
    const list = [...(slot.variants[tier] || []), ...(custom(slotId, tier) || [])];
    if (tier === 'everyday') {
      // always there: the right place if there is one, else any
      const pool = list.filter(fits).length ? list.filter(fits) : list;
      const variant = pool[Math.floor(rnd() * pool.length)];
      return { slot: slotId, tier, variant, tried };
    }
    if (!list.length || !(gateCheck || allow)) { if (list.length) tried.push({ tier, why: 'no gate' }); continue; }
    const ok = list.filter(fits).filter(v => {
      const item = { tier, minStage: v.minStage, minTrust: v.minTrust, flavors: v.flavors, themes: v.themes, who: v.who, consent: v.consent, agreement: v.agreement };
      if (allow) { const a = allow(item); if (!a.ok) tried.push({ tier, id: v.id, why: a.why }); return a.ok; }
      const g = gateCheck(item, gateCtx);
      if (!(g.show && g.her === 'yes')) { tried.push({ tier, id: v.id, why: g.words || g.why }); return false; }
      return true;
    });
    if (ok.length) return { slot: slotId, tier, variant: ok[Math.floor(rnd() * ok.length)], tried };
  }
  return null;
}
