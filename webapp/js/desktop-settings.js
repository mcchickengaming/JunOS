// the desktop app's settings window (desktop/main.js openSettings).
// colors go to localStorage['desktop.theme'] (css variable -> hex),
// which desktop.html picks up live through the storage event. spots
// live in the app itself, through window.junDesktop.spots().
//
// every color here uses the closet's color picker, so new things that
// get colors later (her rooms, furniture, the chat window) should add
// a row to GROUPS the same way.

import { makeItemColorButton } from './wardrobe/color-picker.js?v=33';

const D = window.junDesktop || null;
const THEME_KEY = 'desktop.theme';

// [label, hint, [slot label, css variable, default]...]
const GROUPS = [
  ['Chat bar', 'The line you type to her in.', [['Background', '--panel', '#191233'], ['Text box', '--field', '#241c46'], ['Accent', '--accent', '#ec0054'], ['Text', '--ink', '#ffffff']]],
  ['Hint text', 'Placeholder text and small icons.', [['Hint', '--muted', '#a79fc9']]],
  ['Speech card', 'Where her lines appear.', [['Name tag', '--card-name', '#15142e'], ['Text box', '--card', '#191233']]],
  ['Thought bubbles', 'The ♪ ? ! ♥ over her head, and her thinking cloud.', [['Bubble', '--bubble', '#191233'], ['Outline', '--bubble-edge', '#ec0054']]],
  ['Touch glow', 'The soft glow where your mouse is on her.', [['Glow', '--glow', '#ec0054']]],
];

function readTheme() {
  try { return JSON.parse(localStorage.getItem(THEME_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeTheme(t) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {}
}

// ---------------------------------------------------------------
// tabs

const tabs = [...document.querySelectorAll('nav button')];
function show(tab) {
  if (!document.getElementById('tab-' + tab)) tab = 'help';
  for (const b of tabs) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('section')) s.hidden = s.id !== 'tab-' + tab;
  if (tab === 'spots') loadSpots();
}
tabs.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
show(decodeURIComponent(location.hash.slice(1)) || 'help');
D?.onSettingsTab?.((tab) => show(tab));
window.addEventListener('hashchange', () => show(decodeURIComponent(location.hash.slice(1))));

// ---------------------------------------------------------------
// colors

function row(title, hint, control) {
  const r = document.createElement('div');
  r.className = 'row';
  const what = document.createElement('div');
  what.className = 'what';
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = hint;
  what.append(b, s);
  r.append(what, control);
  return r;
}

function buildColors() {
  const host = document.getElementById('colorRows');
  host.innerHTML = '';
  const theme = readTheme();
  for (const [label, hint, slots] of GROUPS) {
    const values = slots.map(([, v]) => theme[v] || null);
    const btn = makeItemColorButton(label, slots.map(s => s[0]), values, (i, hex) => {
      const t = readTheme();
      if (hex) t[slots[i][1]] = hex; else delete t[slots[i][1]];
      writeTheme(t);
    }, 'ds-swatch');
    host.appendChild(row(label, hint, btn));
  }
  const range = document.getElementById('shadowRange');
  range.value = theme['--shadow-alpha'] ?? 0.42;
}
buildColors();
document.getElementById('shadowRange').addEventListener('input', (e) => {
  const t = readTheme();
  t['--shadow-alpha'] = String(e.target.value);
  writeTheme(t);
});
document.getElementById('resetColors').addEventListener('click', () => {
  writeTheme({});
  buildColors();
});

// ---------------------------------------------------------------
// spots

async function loadSpots(state) {
  state = state || (D?.spots ? await D.spots('list') : null);
  const adds = document.getElementById('spotAdds');
  const rows = document.getElementById('spotRows');
  adds.innerHTML = '';
  rows.innerHTML = '';
  if (!state) {
    document.getElementById('noSpots').textContent = 'Open this from the Jun desktop app to set up her spots.';
    return;
  }
  for (const t of state.types) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = '+ ' + t.label;
    b.addEventListener('click', async () => loadSpots(await D.spots('add', t.type)));
    adds.appendChild(b);
  }
  document.getElementById('noSpots').hidden = state.spots.length > 0;
  const seen = {};
  for (const s of state.spots) {
    seen[s.type] = (seen[s.type] || 0) + 1;
    const many = state.spots.filter(x => x.type === s.type).length > 1;
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';
    const colors = makeItemColorButton(s.label, ['Main', 'Trim'], s.colors, (i, hex) => {
      D.spots('color', s.id, i, hex || s.defaults[i]);
    }, 'ds-swatch');
    const stayBtn = document.createElement('button');
    stayBtn.type = 'button';
    stayBtn.className = 'btn';
    stayBtn.textContent = s.stay ? 'Staying here' : 'Stay here';
    stayBtn.disabled = s.stay;
    stayBtn.addEventListener('click', async () => loadSpots(await D.spots('stay', s.id)));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger';
    del.textContent = 'Remove';
    del.addEventListener('click', async () => loadSpots(await D.spots('remove', s.id)));
    controls.append(colors, stayBtn, del);
    rows.appendChild(row(s.label + (many ? ' ' + seen[s.type] : ''), s.stay ? 'She stays here.' : 'Drop her on it, or press Stay here.', controls));
  }
}
document.getElementById('roam').addEventListener('click', async () => {
  if (D?.spots) loadSpots(await D.spots('stay', null));
});
