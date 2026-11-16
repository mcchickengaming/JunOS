// EVERY number of the scene engine (#22) lives here, so the scene lab can show and try each one.
// First guesses out of the lab's time-lapse (a hundred scenes in a moment), not out of playing.

export const DEFAULTS = Object.freeze({
  meter: {
    start: 10,       // where her meter starts in a scene that doesn't say (0..100)
    rise: 8,         // what one thing you do adds when the action doesn't say
    rowK: 0.5,       // the same thing again right away adds this much less each time (never stale)
    min: 1,          // … but never less than this
    wishBonus: 6,    // doing what she asked for adds this on top
    mid: 34,         // "mid" from here …
    high: 67,        // … "high" …
    peak: 100,       // … and the top
  },
  her: {
    wish: 0.18,      // after something you do: how often she asks for something herself
    wishKeep: 3,     // a wish you don't pick up is quietly dropped after this many things (never held against you)
    advance: 0.35,   // when the moment is ready to move on by her say: how often she moves it on herself, per thing you do
  },
  sim: {
    len: 10,         // about how many things the stand-in does before it starts thinking of an ending
    max: 40,         // … and it always leaves by then
    followWish: 0.6, // how often the stand-in does what she asked for
  },
});

let overrides = {};
export function setOverrides(o) { overrides = o && typeof o === 'object' ? o : {}; }
export function tune(extra) {
  const out = {};
  for (const [g, vals] of Object.entries(DEFAULTS)) out[g] = { ...vals, ...(overrides[g] || {}), ...((extra && extra[g]) || {}) };
  return out;
}
