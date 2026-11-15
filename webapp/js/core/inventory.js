// Items, currencies and keepsakes (#9 base): the page's door to what the player owns in the game. The rules live on her
// server (api/lib/inventory.php, catalog in data/items.json); this file only asks. A page can check a cost and spend;
// it can never give (things come from the progression service: activities and story grants).
//
//   const v = await Inventory.load();                          // { currencies, kinds, keepsakes }
//   const c = await Inventory.can({ currencies: { credits: 40 } });   // { ok, missing, words }
//   const r = await Inventory.spend({ items: { part_good: 2 } }, 'a harbor plank');

import { api, apiJson } from './api.js?v=1';

export const WORDS = {
  not_enough: 'Not enough yet.',
  keepsake: 'Keepsakes are never spent.',
  bad_cost: 'Something went wrong. Nothing was taken.',
  offline: "Couldn't reach her server. Nothing was taken.",
  failed: 'Something went wrong. Nothing was taken.',
};
export const say = (code) => WORDS[code] || WORDS.failed;

export async function load() {
  try {
    const r = await api('inventory.php');
    if (!r.ok) return { error: 'failed' };
    return (await r.json()).view;
  } catch (e) { return { error: 'offline' }; }
}

async function post(body) {
  try {
    const r = await apiJson('inventory.php', body);
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || 'failed' };
  } catch (e) { return { error: 'offline' }; }
}
export const can = (cost) => post({ action: 'can', cost });
export const spend = (cost, why = '') => post({ action: 'spend', cost, why: String(why).slice(0, 60) });

// "3 Good parts" / "a fish of legend": a count in words for the list (the number only when there's more than one)
export const countWords = (it) => (it.count > 1 ? `${it.count} × ${it.name.replace(/^(a|an) /i, '')}` : it.name);
// the material tier in plain words (caps crafting quality later)
export const TIER_WORDS = ['', 'common', 'good', 'fine', 'rare', 'exceptional', 'legendary'];
export const tierWords = (t) => TIER_WORDS[t] || '';

// filter a view by a few typed words (name, line or kind)
export function filter(view, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return view;
  const hit = (...s) => { const t = s.join(' ').toLowerCase(); return words.every(w => t.includes(w)); };
  return {
    ...view,
    kinds: view.kinds.map(k => ({ ...k, items: k.items.filter(i => hit(i.name, i.line, k.name, tierWords(i.tier))) })).filter(k => k.items.length),
    keepsakes: view.keepsakes.filter(k => hit(k.name, k.line, k.from, 'keepsake')),
    currencies: view.currencies.filter(c => hit(c.name, c.line, 'currency money')),
  };
}
