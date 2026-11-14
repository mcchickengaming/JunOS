// the last delve, for her prompt (#32): a few plain facts for a day and a half, read straight from
// this app's storage. Kept tiny and apart from the rest of the delve framework on purpose: every
// chat turn asks here (chat-api.js), and a chat page should never have to load a dungeon.
// api/lib/delve.php turns it into words.

import * as F from '../features.js?v=3';

export const KEY = 'jun.delve';
export const HOURS = 36;

export function lastDelve(now = Date.now(), storage) {
  let l = null;
  try { l = (JSON.parse((storage || globalThis.localStorage).getItem(KEY) || '{}') || {}).last || null; } catch (e) { return null; }
  if (!l || !F.isOn('delves') || !Number.isFinite(l.at) || now - l.at > HOURS * 3600 * 1000 || now < l.at) return null;
  return { ago: Math.round((now - l.at) / 60000), area: String(l.area), together: !!l.together, cleared: !!l.cleared, floors: l.floors | 0, of: l.of | 0, ko: l.ko | 0, how: String(l.how || 'home'),
    carried: (Array.isArray(l.carried) ? l.carried : []).slice(0, 4), wish: l.wish || null, secrets: l.secrets ? 1 : 0, courage: l.courage || null };
}
