// a small seeded dice for the delve framework (#32): the same seed gives the same floor and the
// same fight, so a delve can be saved as a few numbers and a test can replay it.

export function mix(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 124; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// box = { s } so the state can ride inside saved data
export function next(box) {
  let t = (box.s = (box.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function dice(seed) {
  const box = { s: seed >>> 0 };
  const rnd = () => next(box);
  rnd.int = (n) => Math.floor(rnd() * n);
  rnd.pick = (list) => list[rnd.int(list.length)];
  // [[item, weight], …] or items with .w
  rnd.weighted = (list) => {
    const w = (x) => (Array.isArray(x) ? x[1] : x.w ?? 1);
    let r = rnd() * list.reduce((a, x) => a + w(x), 0);
    for (const x of list) { r -= w(x); if (r <= 0) return Array.isArray(x) ? x[0] : x; }
    const last = list[list.length - 1];
    return Array.isArray(last) ? last[0] : last;
  };
  rnd.shuffle = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return rnd;
}
