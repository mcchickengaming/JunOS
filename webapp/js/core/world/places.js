// The game world's map as data (webapp/data/places.json): which places show, which you can enter, and where they go.
// Pure: no DOM, storage or clock; story state comes in as a plain object (js/core/story/story-state.js shape).
// Tested by .github/scripts/js/places.test.mjs. Built Nov 15 (Opus) so the story engine (#34) adds and unlocks places
// by data: set a flag, finish a quest, and the map follows.
//
//   view(data, state) → [{ id, name, line, go, state: 'open' | 'locked' }] in the data's order; hidden places left out.
//   when(cond, state) → bool. cond: true / false / { flag } / { flag, is } / { quest, step } / { questDone } / { seen } /
//                       { choice, is } / { all: [...] } / { any: [...] } / { not: cond }. Unknown shapes are false (safe).
//   check(data) → [problems] (ids, names, conditions, go), for the test and the lab.

const ID_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

export function when(cond, state) {
  if (cond === true || cond === undefined) return true;
  if (!cond || typeof cond !== 'object') return false;
  const s = state && typeof state === 'object' ? state : {};
  const flags = s.flags || {}, quests = s.quests || {}, seen = s.seen || {}, choices = s.choices || {};
  if (Array.isArray(cond.all)) return cond.all.every(c => when(c, s));
  if (Array.isArray(cond.any)) return cond.any.some(c => when(c, s));
  if (has(cond, 'not')) return !when(cond.not, s);
  if (has(cond, 'flag')) return has(cond, 'is') ? flags[cond.flag] === cond.is : !!flags[cond.flag];
  if (has(cond, 'questDone')) return !!quests[cond.questDone]?.done;
  if (has(cond, 'quest')) return has(cond, 'step') ? quests[cond.quest]?.step === cond.step : has(quests, cond.quest);
  if (has(cond, 'seen')) return (seen[cond.seen] || 0) > 0;
  if (has(cond, 'choice')) return has(cond, 'is') ? choices[cond.choice] === cond.is : has(choices, cond.choice);
  return false;
}

export function view(data, state) {
  const out = [];
  for (const p of data?.places || []) {
    if (!when(p.show ?? true, state)) continue;
    const open = when(p.open ?? false, state) && !!p.go;
    out.push({ id: p.id, name: p.name, line: open ? p.line : (p.lockedLine || p.line), go: open ? p.go : null, state: open ? 'open' : 'locked' });
  }
  return out;
}

function checkCond(c, where, bad) {
  if (c === true || c === false || c === undefined) return;
  if (!c || typeof c !== 'object') { bad.push(`${where}: not a condition`); return; }
  if (Array.isArray(c.all) || Array.isArray(c.any)) { (c.all || c.any).forEach((x, i) => checkCond(x, `${where}[${i}]`, bad)); return; }
  if (has(c, 'not')) { checkCond(c.not, where + '.not', bad); return; }
  const key = ['flag', 'questDone', 'quest', 'seen', 'choice'].find(k => has(c, k));
  if (!key) bad.push(`${where}: unknown condition ${JSON.stringify(c)}`);
  else if (!ID_RE.test(c[key])) bad.push(`${where}: bad id ${c[key]}`);
}

export function check(data) {
  const bad = [], ids = new Set();
  for (const [i, p] of (data?.places || []).entries()) {
    const at = p?.id || `#${i}`;
    if (!ID_RE.test(p?.id || '')) bad.push(`${at}: bad id`);
    if (ids.has(p.id)) bad.push(`${at}: twice`);
    ids.add(p.id);
    if (!p.name || typeof p.name !== 'string') bad.push(`${at}: no name`);
    if (!p.line || typeof p.line !== 'string') bad.push(`${at}: no line`);
    checkCond(p.show, at + '.show', bad);
    checkCond(p.open, at + '.open', bad);
    if (p.go !== undefined) {
      const okUrl = typeof p.go?.url === 'string' && /^[a-z0-9-]+\.html(\?[^#]*)?(#.*)?$/i.test(p.go.url);
      const okStory = typeof p.go?.story === 'string' && ID_RE.test(p.go.story);
      if (!okUrl && !okStory) bad.push(`${at}: go needs a page of hers ({ url: "x.html" }) or { story: id }`);
    }
    if (p.open && p.open !== false && !p.go) bad.push(`${at}: can open but goes nowhere`);
  }
  return bad;
}
