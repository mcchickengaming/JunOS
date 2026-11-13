// EVERY number of the delve framework (#32) lives here, so the lab can show and try each one.
// First guesses from the time-lapse, not from playing: the owner tunes them in the delve lab.

export const DEFAULTS = Object.freeze({
  floor: {
    slot: 7,            // the biggest room, in cells (rooms are odd-sized and sit in the middle of their slot)
    foeChance: 0.7,     // an 'E' in a room really has something waiting
    groupTwo: 0.3,      // … and it brought a friend (+ per floor down)
    groupThree: 0.08,
    groupPerDepth: 0.08,
    campFrom: 2,        // the first floor that can have a camp
    campChance: 0.8,
  },
  walk: {
    sight: 4,           // cells she and you see ahead (the map fills in this far)
    scanBase: 1,        // her scanner maps this far around you …
    scanPerLevels: 25,  // … +1 for every this many Scanning levels
    senseBase: 0.35,    // her chance to notice a hidden door or trap in range (once per thing)
    senseTop: 0.95,     // … at Scanning 99
    searchBase: 0.3,    // your own chance when you search a wall yourself (Scavenging helps)
    searchTop: 0.9,
    trapHurt: 0.15,     // a trap takes this share of your health; never the last of it
    corridorEvery: 9,   // steps between chances for a passing remark
    stepSec: 1.2,       // for the time-lapse: seconds a step takes a real player
    turnSec: 6,         // … and a go in a fight
  },
  unit: {
    hpBase: 30, hpPerLevel: 1.6,
    atkBase: 6, atkPerLevel: 0.3,
    defBase: 1, defPerLevel: 0.12,
    spdBase: 10, spdPerLevel: 0.04,
    accPerPoint: 1,     // a buff's "accuracy" adds this much to hit chance (in %)
    mendPerLevel: 0.12, // Support levels make her fixes bigger
    techPerLevel: 0.6,  // Hacking levels make a hack stick (in %)
    herHp: 0.85,        // she's a little lighter than you by default (kits change who's what)
  },
  foe: {
    follow: 0.8,        // places keep up with your Delving level this much, so no place gets trivial (stand-in until places have fixed levels)
    perLevel: 0.07,     // each level of the place: this much more health and hit
    perDepth: 1,        // each floor down counts as this many levels
    hp: 1, atk: 1.15,   // every creature's health and hit × these
    aloneHp: 0.6, aloneAtk: 0.6, // going alone plays differently, never worse: creatures are this much lighter …
    aloneFewer: 1,      // … and a group is this many smaller (never under one)
  },
  fight: {
    hit: 85,            // % to hit before accuracy and dodging
    hitMin: 40, hitMax: 98,
    spread: 0.15,       // hits vary ± this
    defWorth: 0.6,      // each point of defense takes this much off a hit
    guard: 0.5,         // guarding: hits take this much
    cover: 0.7,         // a hit you stepped in front of takes this much
    hackBase: 70,       // % a hack sticks before Hacking
    meterSec: 3,        // seconds for speed 10 to be ready (timed and real-time)
    timedWait: 0.25,    // timed: while you choose, everyone else's meter runs this slow
    realSpeed: 0.8,     // real-time: meters × this (nothing ever waits for you)
    herDownHp: 0.3,     // she's back on her feet after a fight with this share of her health
    maxActs: 400,       // a fight never runs longer than this many goes (it ends as a draw you walk away from)
  },
  run: {
    campHeal: 1,        // a camp brings you both back to this share
    wakeHp: 0.5,        // patched up in the delve: you go on with this share
    qualityFloor: 0.3,  // a delve that went badly still counts this much (kind danger). 0.5 = a normal session for the progression service
    qCore: 0.4,         // how much the delve itself adds: floors, fights, finds and the map, weighed like this:
    qFloors: 0.4, qFights: 0.25, qFinds: 0.2, qMap: 0.15,
    qVault: 0.1, qNoKo: 0.1, qSecret: 0.1, // the deep chest, never going down, finding something hidden
    aloneBreather: 0.15, // going alone, you catch your breath after a fight you won: this share of your health back
    wishChance: 0.6,    // she stayed home: she asks you to bring something back
  },
  her: {
    courageBase: 0.3,   // "grows with her": where she starts …
    courageSkill: 0.45, // … how much her Delving adds by level 99 …
    courageBond: 0.05,  // … and each bond stage past the first
    timidBelow: 0.4, braveFrom: 0.7,
    moodSwing: 0.35,    // "As she feels": a quiet day she talks this much less, a playful one this much more
    recent: 8,          // she won't say one of her last few lines again
    queueMax: 4,        // moments she keeps for the next safe spot
  },
});

let overrides = {};
export function setOverrides(o) { overrides = o && typeof o === 'object' ? o : {}; }
export function tune(extra) {
  const out = {};
  for (const [g, vals] of Object.entries(DEFAULTS)) out[g] = { ...vals, ...(overrides[g] || {}), ...((extra && extra[g]) || {}) };
  return out;
}
export const TUNE = new Proxy({}, { get: (_, g) => tune()[g] });
