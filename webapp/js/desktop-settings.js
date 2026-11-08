// the desktop app's settings window (desktop/main.js openSettings).
// colors go to localStorage['desktop.theme'] (css variable -> hex),
// which desktop.html picks up live through the storage event. spots
// live in the app itself, through window.junDesktop.spots().
//
// every color here uses the closet's color picker, so new things that
// get colors later (her rooms, furniture, the chat window) should add
// a row to GROUPS the same way.

import { makeItemColorButton } from './wardrobe/color-picker.js?v=37';

const D = window.junDesktop || null;
const THEME_KEY = 'desktop.theme';

// [label, hint, [slot label, css variable, default]...]
const GROUPS = [
  ['Chat bar', 'The line you type to her in.', [['Background', '--panel', '#191233'], ['Text box', '--field', '#241c46'], ['Accent', '--accent', '#ec0054'], ['Text', '--ink', '#ffffff']]],
  ['Hint text', 'Placeholder text and small icons.', [['Hint', '--muted', '#a79fc9']]],
  ['Speech card', 'Where her lines appear.', [['Name tag', '--card-name', '#15142e'], ['Text box', '--card', '#191233']]],
  ['Thought bubbles', 'The ♪ ? ! ♥ over her head, and her thinking cloud.', [['Bubble', '--bubble', '#191233'], ['Outline', '--bubble-edge', '#ec0054']]],
  ['Touch glow', 'The soft glow where your mouse is on her.', [['Glow', '--glow', '#ec0054']]],
  ['Touch spot outlines', 'The outlines from Jun menu > On the desktop > Show touch spots.', [['Outline', '--spot-outline', '#ff78be']]],
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

// ---------------------------------------------------------------
// see-through: how solid each background is, a text outline, and
// fading the chat bar while it isn't used

const ALPHAS = [
  ['Chat bar background', 'The line you type in.', '--panel-a'],
  ['Speech card background', 'Behind her lines.', '--card-a'],
  ['Bubble and label background', 'Thought icons, the thinking cloud, the action labels.', '--bubble-a'],
  ['Outlines and accents', 'The colored edges and borders.', '--edge-a'],
];
const OUTLINES = {
  none: 'none',
  soft: '0 1px 2px rgba(0, 0, 0, .9), 0 0 3px rgba(0, 0, 0, .8)',
  strong: '0 0 2px #000, 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
};
const PRESETS = {
  solid: { '--panel-a': 1, '--card-a': 1, '--bubble-a': 1, '--edge-a': 1, outline: 'none' },
  glass: { '--panel-a': 0.45, '--card-a': 0.45, '--bubble-a': 0.5, '--edge-a': 0.8, outline: 'soft' },
  clear: { '--panel-a': 0, '--card-a': 0, '--bubble-a': 0, '--edge-a': 0, outline: 'soft' },
};

function buildAlphas() {
  const host = document.getElementById('alphaRows');
  host.innerHTML = '';
  const theme = readTheme();
  for (const [label, hint, key] of ALPHAS) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.05';
    range.value = theme[key] ?? 1;
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = Math.round(range.value * 100) + '%';
    range.addEventListener('input', () => {
      const t = readTheme();
      t[key] = String(range.value);
      writeTheme(t);
      pct.textContent = Math.round(range.value * 100) + '%';
    });
    wrap.append(range, pct);
    host.appendChild(row(label, hint, wrap));
  }
  const outline = document.getElementById('outline');
  outline.value = theme.outline || 'none';
  document.getElementById('fadeChat').checked = !!theme.fadeChat;
}
buildAlphas();
document.getElementById('outline').addEventListener('change', (e) => {
  const t = readTheme();
  t.outline = e.target.value;
  t['--outline'] = OUTLINES[e.target.value] || 'none';
  writeTheme(t);
});
document.getElementById('fadeChat').addEventListener('change', (e) => {
  const t = readTheme();
  t.fadeChat = e.target.checked;
  writeTheme(t);
});
for (const [id, name] of [['presetSolid', 'solid'], ['presetGlass', 'glass'], ['presetClear', 'clear']]) {
  document.getElementById(id).addEventListener('click', () => {
    const t = readTheme();
    const p = PRESETS[name];
    for (const [k, v] of Object.entries(p)) if (k.startsWith('--')) t[k] = String(v);
    t.outline = p.outline;
    t['--outline'] = OUTLINES[p.outline];
    writeTheme(t);
    buildAlphas();
  });
}

document.getElementById('shadowRange').addEventListener('input', (e) => {
  const t = readTheme();
  t['--shadow-alpha'] = String(e.target.value);
  writeTheme(t);
});
document.getElementById('resetColors').addEventListener('click', () => {
  writeTheme({});
  buildColors();
  buildAlphas();
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
