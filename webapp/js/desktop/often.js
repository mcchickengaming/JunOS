// "how often" and "how much" settings on one 0..100 scale (owner, Nov 9: more steps than
// never/rarely/sometimes/often, or an exact percent, or both). The settings page shows the named
// steps in a dropdown AND a slider; whatever is stored is a number. Old picks ('often', 'rarely',
// 'normal', 'lots'...) still read right, so nothing he set before changes.
//
// 50 % is the old default ("Sometimes" / "Normal"): mul(50) = 1, the same as before.

export const OFTEN = [
  [0, 'Never'], [10, 'Almost never'], [25, 'Rarely'], [40, 'Now and then'],
  [50, 'Sometimes'], [70, 'Often'], [85, 'Very often'], [100, 'All the time'],
];
export const MUCH = [
  [0, 'Not at all'], [10, 'A tiny bit'], [25, 'A little'], [40, 'A bit less'],
  [50, 'Normal'], [70, 'More'], [85, 'A lot'], [100, 'All the way'],
];

// the old named values, as a percent (the old multipliers sat close to these)
const OLD = { never: 0, none: 0, off: 0, rarely: 25, little: 25, sometimes: 50, normal: 50, some: 50, often: 70, lots: 85 };

export function pct(v, fallback = 50) {
  if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === 'string') {
    if (v in OLD) return OLD[v];
    const n = Number(v);
    if (v.trim() !== '' && isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return fallback;
}

// a multiplier for the code: 0 → 0, 50 → 1 (the old default), 100 → top (2.2 unless the caller says)
export function mul(v, top = 2.2) {
  const p = pct(v);
  return p <= 50 ? p / 50 : 1 + (p - 50) / 50 * (top - 1);
}

// the word for a percent: the named step when it's one, else "Your own (37%)"
export function nameOf(p, list = OFTEN) {
  const hit = list.find(([v]) => v === Math.round(p));
  return hit ? hit[1] : 'Your own (' + Math.round(p) + '%)';
}
