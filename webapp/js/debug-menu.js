// The debug menu (owner, Nov 15): F12 in any of her windows opens it (desktop/main.js). A small framework: every tool
// is one entry in TOOLS ({ id, name, build(host) }), shown as a tab; a new tool later is one more entry here.
//
//   console  open the console of the window F12 was pressed in (or this menu's own); the Settings window's console
//            has the owner's helpers (jun.help())
//   spawn    anything in the catalog (data/items.json): currencies, items, keepsakes, with an amount. Needs TEST MODE
//            (api/debug.php, per account). Every spawn is logged; "Clear my things" empties the game's money and things.
//            A new item in data/items.json shows up here by itself.
//   labs     the feel lab, progress lab, delve lab and rig lab
//   jump     straight to a Settings section
// Outside the desktop app (a plain browser) it still works: the console is the browser's own F12.

import { api, apiJson } from './core/api.js?v=1';

const D = globalThis.junDesktop || null;
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};
const section = (title, ...kids) => el('section', {}, el('h2', {}, title), ...kids);

// ---------------------------------------------------------------- the tools

const TOOLS = [
  { id: 'spawn', name: 'Spawn', build: buildSpawn },
  { id: 'console', name: 'Console', build: buildConsole },
  { id: 'labs', name: 'Labs', build: buildLabs },
  { id: 'jump', name: 'Settings', build: buildJump },
];
export const toolIds = () => TOOLS.map(t => t.id);

function show(id) {
  const t = TOOLS.find(x => x.id === id) || TOOLS[0];
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tool === t.id);
  const host = $('tool');
  host.textContent = '';
  t.build(host);
  try { localStorage.setItem('jun.debug.tool', t.id); } catch (e) { /* private */ }
}

function buildConsole(host) {
  host.append(section('Console',
    el('p', { class: 'note' }, 'The console shows errors and lets you type commands. Nothing in there changes her unless you type it on purpose.'),
    el('div', { class: 'btns' },
      D?.debug ? el('button', { on: { click: () => D.debug('devtools', 'source') } }, 'Open the console of the window you pressed F12 in') : null,
      D?.debug ? el('button', { on: { click: () => D.debug('devtools', 'self') } }, "Open this menu's console") : el('span', { class: 'note' }, 'In a browser: press F12 for its console.'),
    ),
  ), section('Settings helpers',
    el('p', { class: 'note' }, 'The Settings window\'s console knows every setting by its plain name: jun.help(), jun.find("glow"), jun.why("difficulty"), jun.changed().'),
    el('div', { class: 'btns' }, el('button', { on: { click: () => openSettings('help', true) } }, 'Open Settings and its console')),
  ));
}

const LABS = [
  ['feel-lab.html', 'Feel lab', 'How she is inside: needs, tiredness, favorites, the reaction composer, what she starts on her own.'],
  ['progress-lab.html', 'Progress lab', 'Skills, xp, the reward roller, "is it fair?"'],
  ['delve-lab.html', 'Delve lab', 'A whole delve, fights at any pace, difficulty, a hundred delves in a moment.'],
  ['rig-lab.html', 'Rig lab', 'The Inochi2D renderer and its checks.'],
];
function buildLabs(host) {
  host.append(section('Labs', ...LABS.map(([url, name, line]) => el('div', { class: 'btns' },
    el('button', { on: { click: () => window.open(url, '_blank') } }, name), el('span', { class: 'note' }, line)))));
}

const JUMPS = [['game', 'The game'], ['her', 'Her'], ['touch', 'Touch & feelings'], ['desktop', 'On the desktop'], ['comfort', 'Comfort & ratings'], ['saves', 'Saves & updates'], ['help', 'How to play']];
function openSettings(tab, consoleToo = false) {
  if (D?.openSettings) { D.openSettings(tab); if (consoleToo && D.debug) setTimeout(() => D.debug('devtools', 'settings'), 900); }
  else window.open('desktop-settings.html#' + tab, '_blank');
}
function buildJump(host) {
  host.append(section('Settings', el('div', { class: 'btns' }, ...JUMPS.map(([t, n]) => el('button', { on: { click: () => openSettings(t) } }, n)))));
}

// ---------------------------------------------------------------- spawn

let spawnState = null;     // { test, catalog, recent, view }
let clearArmed = false;

async function loadSpawn() {
  try {
    const r = await api('debug.php');
    if (!r.ok) return { error: r.status === 401 ? 'Sign in to her first.' : "Couldn't reach her server." };
    return await r.json();
  } catch (e) { return { error: "Couldn't reach her server." }; }
}
async function post(body) {
  try {
    const r = await apiJson('debug.php', body);
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || 'failed' };
  } catch (e) { return { error: 'offline' }; }
}
export const SAY = {
  test_off: 'Turn test mode on first.',
  unknown: "That isn't in the catalog (data/items.json).",
  offline: "Couldn't reach her server.",
  failed: 'Something went wrong.',
  unknown_action: 'Something went wrong.',
};

// how many you have of something now (from the inventory view)
export function haveOf(view, entry) {
  if (!view) return 0;
  if (entry.kind === 'currency') return view.currencies.find(c => c.id === entry.id)?.amount || 0;
  if (entry.kind === 'keepsake') return view.keepsakes.some(k => k.id === entry.id) ? 1 : 0;
  for (const k of view.kinds) { const it = k.items.find(i => i.id === entry.id); if (it) return it.count; }
  return 0;
}
// the catalog grouped and filtered by a few typed words
export function groupCatalog(catalog, q = '') {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (e) => words.every(w => [e.id, e.name, e.line, e.group, e.kind].join(' ').toLowerCase().includes(w));
  const groups = new Map();
  for (const e of catalog.filter(hit)) {
    const g = e.kind === 'currency' ? 'Currencies' : e.kind === 'keepsake' ? 'Keepsakes' : e.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  const order = (g) => (g === 'Currencies' ? -1 : g === 'Keepsakes' ? 999 : (catalog.find(e => e.group === g)?.order ?? 99));
  return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
}

function buildSpawn(host) {
  const msg = el('div', { id: 'msg', role: 'status' });
  const say = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };
  const box = el('div');
  host.append(section('Spawn',
    el('p', { class: 'note' }, 'Anything in the catalog, for testing. Add an item to data/items.json and it shows up here. Spawned things live in the game like anything else (game saves carry them).'),
    box, msg));
  const draw = () => {
    box.textContent = '';
    const s = spawnState;
    if (!s || s.error) { box.append(el('p', { class: 'empty' }, s?.error || 'Loading…')); return; }
    const testRow = el('div', { class: 'test' + (s.test ? ' on' : '') },
      el('b', {}, s.test ? 'Test mode is on: you can spawn.' : 'Test mode is off.'),
      el('button', { on: { click: async () => {
        const r = await post({ action: 'test', on: !s.test });
        if (r.error) say(SAY[r.error] || SAY.failed, true); else { spawnState = r; say(r.test ? 'Test mode on.' : 'Test mode off. What you spawned stays.'); draw(); }
      } } }, s.test ? 'Turn it off' : 'Turn test mode on'));
    const find = el('input', { type: 'search', placeholder: 'Find something: "part", "rare", "keepsake", "whispers"…', 'aria-label': 'Find in the catalog' });
    find.value = box.dataset.q || '';
    const list = el('div');
    const drawList = () => {
      box.dataset.q = find.value;
      list.textContent = '';
      const now = spawnState;   // the latest answer (a spawn replaces it), not the one this list was first drawn from
      const groups = groupCatalog(now.catalog, find.value);
      if (!groups.length) list.append(el('p', { class: 'empty' }, find.value ? 'Nothing like that in the catalog.' : 'The catalog is empty: add items to data/items.json.'));
      for (const [g, entries] of groups) {
        list.append(el('div', { class: 'grp' }, g));
        for (const e of entries) {
          const amt = el('input', { class: 'amt', type: 'number', min: '1', max: '1000000', value: e.kind === 'currency' ? '100' : '1', 'aria-label': 'How many', disabled: e.kind === 'keepsake' });
          list.append(el('div', { class: 'spawn' },
            el('div', { class: 'nm' }, el('b', {}, e.name), e.sample ? el('span', { class: 'tag' }, 'stand-in') : null, el('span', {}, e.id + (e.line ? ' · ' + e.line : ''))),
            el('div', { class: 'have', title: 'You have' }, 'have ' + haveOf(now.view, e)),
            amt,
            el('button', { disabled: !now.test, on: { click: async () => {
              const r = await post({ action: 'spawn', id: e.id, amount: Number(amt.value) || 1 });
              if (r.error) say(SAY[r.error] || SAY.failed, true);
              else { spawnState = r; say(`Spawned ${e.kind === 'currency' ? (Number(amt.value) || 1) + ' ' : e.kind === 'keepsake' ? '' : (Number(amt.value) || 1) + ' × '}${e.name}.`); drawList(); drawRecent(); }
            } } }, 'Spawn'),
          ));
        }
      }
    };
    find.addEventListener('input', drawList);
    const recent = el('div');
    const drawRecent = () => {
      recent.textContent = '';
      if (!spawnState.recent?.length) return;
      recent.append(el('div', { class: 'grp' }, 'Lately'), el('ul', { class: 'recent' }, ...spawnState.recent.map(r => el('li', {},
        new Date(r.at * 1000).toLocaleTimeString() + '  ' + (r.type === 'spawned' ? `spawned ${r.amount} × ${r.id}` : r.type === 'cleared' ? 'cleared everything' : r.type === 'test_on' ? 'test mode on' : 'test mode off')))));
    };
    const clear = el('button', { class: 'warn', disabled: !s.test, on: { click: async (ev) => {
      if (!clearArmed) { clearArmed = true; ev.target.textContent = 'Sure? Click again'; setTimeout(() => { clearArmed = false; if (ev.target.isConnected) ev.target.textContent = 'Clear my things'; }, 4000); return; }
      clearArmed = false;
      const r = await post({ action: 'clear' });
      if (r.error) say(SAY[r.error] || SAY.failed, true); else { spawnState = r; say("Cleared the game's money and things. Her, her skills and your bond are untouched."); draw(); }
    } } }, 'Clear my things');
    box.append(testRow, find, list, el('div', { class: 'btns' }, clear, el('span', { class: 'note' }, "Empties the game's money and things (test mode only).")), recent);
    drawList(); drawRecent();
  };
  draw();
  loadSpawn().then((s) => { spawnState = s; draw(); });
}

// ---------------------------------------------------------------- start

if (typeof document !== 'undefined' && $('tabs')) {
  for (const t of TOOLS) $('tabs').append(el('button', { 'data-tool': t.id, on: { click: () => show(t.id) } }, t.name));
  let first = 'spawn';
  try { first = new URLSearchParams(location.search).get('tool') || localStorage.getItem('jun.debug.tool') || 'spawn'; } catch (e) { /* private */ }
  show(first);
}
