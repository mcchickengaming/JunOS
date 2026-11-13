// the things that can happen to her, as core feel (#27) sees them. A touch's kind is the same
// name moods.js uses for holds and rubs (head, ear, side, ...); a quick click is 'poke.<spot>';
// a combo 'combo.<id>'; other moments have their own names (toss, fetch, carry).
//
// The words go into her prompt (api/lib/feel.php FEEL_KIND_WORDS has the same list; a test
// keeps them equal). Words, never numbers.

export const KINDS = {
  head: { words: 'headpats', warm: true, group: 'head' },
  ear: { words: 'ear rubs', warm: true, group: 'head' },
  side: { words: 'tickles', play: true, group: 'tickle' },
  feettickle: { words: 'foot tickles', play: true, group: 'tickle' },
  footrub: { words: 'foot rubs', warm: true, group: 'feet' },
  feet: { words: 'foot rubs', warm: true, group: 'feet' },
  thigh: { words: 'thigh rubs', group: 'thigh' },
  thighsquish: { words: 'thigh squishes', group: 'thigh' },
  tail: { words: 'tail rubs', warm: true, group: 'tail' },
  tailrub: { words: 'tail rubs', warm: true, group: 'tail' },
  tailgrab: { words: 'tail grabs', play: true, group: 'tail' },
  hand: { words: 'hand-holding', warm: true, group: 'hand' },
  hug: { words: 'hugs', warm: true, group: 'hug' },
  'poke.head': { words: 'pokes on the head', play: true, group: 'poke' },
  'poke.cheek': { words: 'cheek pokes', play: true, group: 'poke' },
  'poke.nose': { words: 'boops', play: true, group: 'poke' },
  'poke.ear': { words: 'ear flicks', play: true, group: 'poke' },
  'poke.shoulder': { words: 'shoulder taps', group: 'poke' },
  'poke.tail': { words: 'tail tugs', play: true, group: 'poke' },
  'poke.hand': { words: 'hand squeezes', warm: true, group: 'poke' },
  'poke.side': { words: 'pokes in the side', play: true, group: 'poke' },
  'poke.thigh': { words: 'thigh pokes', group: 'poke' },
  'poke.feet': { words: 'foot pokes', play: true, group: 'poke' },
  toss: { words: 'being thrown around', play: true, group: 'toss' },
  carry: { words: 'being carried around', group: 'toss' },
  fetch: { words: 'fetch', play: true, group: 'fetch' },
};
export const COMBO = { words: 'the same combo', play: true, group: 'combo' };

export function info(kind) {
  if (KINDS[kind]) return KINDS[kind];
  if (String(kind).startsWith('combo.')) return COMBO;
  return null;
}
export const wordsOf = (kind) => info(kind)?.words || null;
export const isWarm = (kind) => !!info(kind)?.warm;
export const isPlay = (kind) => !!info(kind)?.play;
export const groupOf = (kind) => info(kind)?.group || kind;
// every kind in the same group (for the shared part of being tired of it)
export function sameGroup(kind) {
  const g = groupOf(kind);
  return Object.keys(KINDS).filter(k => k !== kind && KINDS[k].group === g);
}
