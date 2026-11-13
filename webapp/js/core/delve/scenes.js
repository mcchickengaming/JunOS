// scene slots (#22, first used by delves #32). Decided Nov 13: ONE SCENE, SEVERAL TIERS, SEAMLESS.
// A moment like "knocked out: she takes care of you" is a SLOT with a variant per tier. The ONE gate
// (js/core/gate.js) picks the highest tier that is switched on AND that her say allows; every slot
// must have an Everyday variant (tested), so a player with rated content off never hits a gap.
//
// Who writes what: Claude builds the slot, the Everyday and Flirty variants and this wiring. 18+
// variants are ALWAYS the owner's, made in the scene maker (#22, not built yet): they arrive through
// setCustom(), never from data/delve.json (a test keeps the shipped "adult" lists empty).

export const TIERS_HIGH_FIRST = ['adult', 'flirty', 'everyday'];

let custom = () => [];
// the scene maker's door: fn(slotId, tier) → [variants]. Variants are data only.
export function setCustom(fn) { custom = typeof fn === 'function' ? fn : () => []; }

export function checkSlots(data) {
  const e = [];
  for (const [id, slot] of Object.entries(data.scenes || {})) {
    const v = slot.variants || {};
    if (!Array.isArray(v.everyday) || !v.everyday.length) e.push(id + ': no Everyday variant');
    for (const tier of Object.keys(v)) if (!TIERS_HIGH_FIRST.includes(tier)) e.push(id + ': unknown tier ' + tier);
    if ((v.adult || []).length) e.push(id + ': 18+ variants are the owner\'s (scene maker), never shipped');
    for (const tier of TIERS_HIGH_FIRST) for (const x of v[tier] || []) {
      if (!x.id || !Array.isArray(x.beats) || !x.beats.length) e.push(`${id}/${tier}: a variant needs an id and beats`);
      if (tier === 'everyday' && (x.minStage || x.flavors)) e.push(`${id}/${x.id}: an Everyday variant can't ask for a bond or a flavor`);
    }
  }
  return e;
}

// which variant plays. where: 'home' | 'camp' | 'alone' (a variant without "where" fits anywhere).
// gateCheck = Gate.check; gateCtx = { comfort, mode, stage, trust, tension, stop, screenShare, lookAdult }
export function pick(data, slotId, { where = 'home', gateCheck, gateCtx = {}, rnd = Math.random } = {}) {
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
    if (!list.length || !gateCheck) { if (list.length) tried.push({ tier, why: 'no gate' }); continue; }
    const ok = list.filter(fits).filter(v => {
      const g = gateCheck({ tier, minStage: v.minStage, minTrust: v.minTrust, flavors: v.flavors }, gateCtx);
      if (!(g.show && g.her === 'yes')) { tried.push({ tier, id: v.id, why: g.words || g.why }); return false; }
      return true;
    });
    if (ok.length) return { slot: slotId, tier, variant: ok[Math.floor(rnd() * ok.length)], tried };
  }
  return null;
}
