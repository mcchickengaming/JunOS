// how she greets him when he brings her back from being hidden (#29). Pure: desktop.js plays what this picks.
// The rule that never bends: she is NEVER upset about being hidden (it may have been an emergency, a meeting, a
// game). How long and why only decide how big the hello is. `bond` = her bond stage 1..6 (shyer early on).
//
//   size   none   back within a few seconds (a mistake, a quick check): nothing at all
//          glance back within a couple of minutes: a look and a small ear flick
//          wave   minutes: a little wave
//          happy  an hour or more: a happy hop and a heart
//          missed most of a day or more: she comes over to his cursor, happy, and may say something
//   line   whether she may say something (by chance, never for a fullscreen hide: he was busy, she lets him be)
export const STEPS = [
  [8e3, 'none'], [150e3, 'glance'], [45 * 60e3, 'wave'], [8 * 3600e3, 'happy'], [Infinity, 'missed'],
];
export function welcome(awayMs, why = 'hotkey', { bond = 3, rand = Math.random, talk = 50 } = {}) {
  const ms = Math.max(0, Number(awayMs) || 0);
  let size = STEPS.find(([max]) => ms < max)[1];
  // a fullscreen app ended: he's coming back from a game or a video, a quieter hello
  if (why === 'fullscreen' && size !== 'none') size = size === 'missed' ? 'happy' : 'glance';
  // early on she's shyer: the big hello needs Friend+
  if (bond <= 2 && size === 'missed') size = 'happy';
  const lineChance = { none: 0, glance: 0, wave: 0.15, happy: 0.35, missed: 0.6 }[size] * Math.max(0, Math.min(2, (Number(talk) || 0) / 50));
  const line = why !== 'fullscreen' && rand() < lineChance;
  return { size, line, words: WORDS[size] };
}
// what it looks like, in words (the feel lab, "why did she do that")
export const WORDS = {
  none: 'barely noticed you were gone',
  glance: 'glanced back at you',
  wave: 'gave you a little wave',
  happy: 'was happy to see you',
  missed: 'missed you and came over',
};
// her body for each size: Body.play kinds + an emote + whether she comes over (desktop.js plays it)
export const PLAY = {
  none: { moves: [], emote: null },
  glance: { moves: ['ears'], emote: null },
  wave: { moves: ['smallWave'], emote: 'note' },
  happy: { moves: ['hop', 'wave'], emote: 'heart' },
  missed: { moves: ['hop', 'wave'], emote: 'heart', comeOver: true },
};
