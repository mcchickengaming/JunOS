// EVERY number of the story-event engine lives here, so the story lab can show and try each one.
// First guesses from the time-lapse ("a hundred playthroughs in a moment"), not from playing.

export const DEFAULTS = Object.freeze({
  pick: {
    recent: 6,          // she and the world remember the last few events …
    recentK: 0.25,      // … and one of those is this much less likely to be picked again
    quietK: 1,          // × every trigger's own "nothing happens this time" share (0 = something always happens)
    threadsPerDay: 2,   // at most this many loose ends come back in one story day, so they never pile up
    threadGapSlots: 2,  // … and never two closer together than this (a day has four parts)
    threadChance: 0.7,  // a loose end that is due and fits still only comes back this often per try
    poolPerDay: 6,      // by-chance events in one story day (the main story and loose ends don't count)
  },
  npc: {
    start: 0,           // where a new person's two background meters start (0..100)
    acquaint: 10,       // reputation: "Acquaintance" from here …
    friend: 35,         // … "Friend" …
    close: 70,          // … "Close"
    affStep: 18,        // affection per "stage" the one gate reads for that person (1..6)
  },
  gate: {
    askCounts: 1,       // in the game her say is a simple meter: "she'd ask first" counts as a yes (0 = it counts as not yet)
  },
  sim: {
    days: 12,           // how long a stand-in plays one playthrough
    followStory: 0.6,   // how often the stand-in heads for the next main-story beat instead of wandering
    perDay: 5,          // things the stand-in tries in one story day
  },
});

let overrides = {};
export function setOverrides(o) { overrides = o && typeof o === 'object' ? o : {}; }
export function tune(extra) {
  const out = {};
  for (const [g, vals] of Object.entries(DEFAULTS)) out[g] = { ...vals, ...(overrides[g] || {}), ...((extra && extra[g]) || {}) };
  return out;
}
