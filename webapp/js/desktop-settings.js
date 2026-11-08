// the desktop app's settings window (desktop/main.js openSettings).
// colors go to localStorage['desktop.theme'] (css variable -> hex),
// which desktop.html picks up live through the storage event. spots
// live in the app itself, through window.junDesktop.spots().
//
// every color here uses the closet's color picker, so new things that
// get colors later (her rooms, furniture, the chat window) should add
// a row to GROUPS the same way.

import { makeItemColorButton } from './wardrobe/color-picker.js?v=37';
import * as Fx from './desktop/fx.js?v=2';

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
  if (tab === 'feedback') previewTheme();
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
  buildFeedback();
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

// ---------------------------------------------------------------
// touch feedback: the ripple, the labels, her thought icons. the picks
// go to localStorage['desktop.fx'] (desktop/fx.js), the colors to the
// theme like every other color. the preview runs the same code she does

Fx.installCss();
Fx.applyFx();
const preview = document.getElementById('preview');
const pvLabel = document.getElementById('pvLabel');
const pvEmote = document.getElementById('pvEmote');
const SAMPLE_LABELS = ['Boop!', 'Headpat', 'Cheek poke', 'Hug', 'Tail tug!', 'Holding hands', 'Ticklish feet!', 'Ear flick'];

// the theme's colors and see-through, on the preview box
function previewTheme() {
  const box = document.getElementById('preview');
  const t = readTheme();
  box.removeAttribute('style');
  for (const [k, v] of Object.entries(t)) if (/^--[a-z-]+$/.test(k)) box.style.setProperty(k, String(v));
  // the ripple goes on the page itself, not in the box
  document.body.style.setProperty('--ripple', t['--ripple'] || t['--accent'] || '#ec0054');
}
window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) previewTheme(); });

let pvLabelTimer = null;
function pvShowLabel(text, x, y) {
  const r = preview.getBoundingClientRect();
  // off to the side of her head, so it doesn't cover the icon over it
  x = x ?? r.width / 2 - 110;
  y = y ?? r.height * 0.55;
  const ms = Fx.labelText(pvLabel, text || SAMPLE_LABELS[Math.floor(Math.random() * SAMPLE_LABELS.length)], 1300);
  pvLabel.style.left = Math.max(50, Math.min(r.width - 50, x)) + 'px';
  pvLabel.style.top = Math.max(30, y - 20) + 'px';
  pvLabel.classList.remove('on');
  void pvLabel.offsetWidth;
  pvLabel.classList.add('on');
  clearTimeout(pvLabelTimer);
  pvLabelTimer = setTimeout(() => pvLabel.classList.remove('on'), ms);
}
let pvEmoteTimer = null;
function pvShowIcon(kind) {
  kind = kind || Fx.pickFromPool(Object.keys(Fx.EMOTES));
  Fx.fillEmote(pvEmote, kind);
  // just above the little head, wherever it sits in the box
  const head = preview.querySelector('.pv-head');
  pvEmote.style.left = '50%';
  pvEmote.style.top = (head.offsetTop - 14) + 'px';
  pvEmote.classList.remove('show');
  void pvEmote.offsetWidth;
  pvEmote.classList.add('show');
  clearTimeout(pvEmoteTimer);
  pvEmoteTimer = setTimeout(() => pvEmote.classList.remove('show'), 2000);
}
function pvCenter() {
  const r = preview.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
}
preview.addEventListener('pointerdown', (e) => {
  Fx.ripple(e.clientX, e.clientY);
  const r = preview.getBoundingClientRect();
  pvShowLabel(null, e.clientX - r.left, e.clientY - r.top);
});
document.getElementById('pvLabelBtn').addEventListener('click', () => pvShowLabel());
document.getElementById('pvIconBtn').addEventListener('click', () => pvShowIcon());
// a few of the ripples she picks herself when "let her pick" is on
const HER_PICKS = [
  ['A hug, once you\'re close', { shape: 'heart', motion: 'burst' }],
  ['A tail grab she isn\'t ready for', { motion: 'shaky' }],
  ['A boop', { shape: 'star', motion: 'burst' }],
  ['Her tail, as friends', { shape: 'paw' }],
  ['A combo', { shape: 'sparkle', motion: 'spin', rings: 2 }],
];
let herPick = 0;
document.getElementById('pvHerBtn').addEventListener('click', () => {
  const [text, opts] = HER_PICKS[herPick++ % HER_PICKS.length];
  const c = pvCenter();
  Fx.ripple(c.x, c.y, opts);
  pvShowLabel(text);
});

// a change shows itself in the preview, once the slider stops moving
let pvSoon = null;
function changed(what) {
  clearTimeout(pvSoon);
  pvSoon = setTimeout(() => {
    if (what === 'ripple') { const c = pvCenter(); Fx.ripple(c.x, c.y); }
    if (what === 'label') pvShowLabel();
    if (what === 'icon') pvShowIcon();
  }, 160);
}
function setFx(key, value, what) {
  const f = { ...Fx.readFx(), [key]: value };
  Fx.writeFx(f);
  Fx.applyFx(f);
  changed(what);
}

function selectOf(list, key, what) {
  const sel = document.createElement('select');
  sel.className = 'btn';
  for (const [v, name] of list) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = name;
    sel.appendChild(o);
  }
  sel.value = Fx.readFx()[key];
  sel.addEventListener('change', () => setFx(key, sel.value, what));
  return sel;
}
function rangeOf(key, min, max, step, what, fmt) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  const r = document.createElement('input');
  r.type = 'range';
  r.min = String(min);
  r.max = String(max);
  r.step = String(step);
  r.value = String(Fx.readFx()[key]);
  const out = document.createElement('span');
  out.className = 'pct';
  const show = () => { out.textContent = fmt(Number(r.value)); };
  show();
  r.addEventListener('input', () => { show(); setFx(key, Number(r.value), what); });
  wrap.append(r, out);
  return wrap;
}
function checkOf(key, what) {
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = !!Fx.readFx()[key];
  c.addEventListener('change', () => setFx(key, c.checked, what));
  return c;
}
function colorsOf(label, slots, what) {
  const theme = readTheme();
  return makeItemColorButton(label, slots.map(s => s[0]), slots.map(([, v]) => theme[v] || null), (i, hex) => {
    const t = readTheme();
    if (hex) t[slots[i][1]] = hex; else delete t[slots[i][1]];
    writeTheme(t);
    previewTheme();
    changed(what);
  }, 'ds-swatch');
}
const times = (v) => '×' + v.toFixed(1);

function buildFeedback() {
  const rip = document.getElementById('rippleRows');
  rip.innerHTML = '';
  rip.append(
    row('Shape', 'What the ripple looks like.', selectOf(Fx.RIPPLE_SHAPES, 'rShape', 'ripple')),
    row('Motion', 'How it moves: grows, beats, wobbles, shakes, bursts apart or spins.', selectOf(Fx.RIPPLE_MOTIONS, 'rMotion', 'ripple')),
    row('Size', 'How big it gets.', rangeOf('rSize', 0.5, 2.5, 0.1, 'ripple', times)),
    row('Speed', 'Higher is quicker.', rangeOf('rSpeed', 0.4, 2.5, 0.1, 'ripple', times)),
    row('Rings', 'How many go out, one after another (for a burst: more pieces).', rangeOf('rRings', 1, 4, 1, 'ripple', (v) => String(v))),
    row('Line', 'How thick the line is.', rangeOf('rWidth', 1, 5, 0.5, 'ripple', (v) => v + 'px')),
    row('Color', 'Right-click to go back to her accent color.', colorsOf('Ripple', [['Ripple', '--ripple']], 'ripple')),
    row('Let her pick', 'Now and then she changes the ripple to show how she takes a touch: shaky when it\'s one she isn\'t ready for, a burst of hearts for a hug once you\'re close.', checkOf('rHerPick', 'ripple')),
  );
  const lab = document.getElementById('labelRows');
  lab.innerHTML = '';
  lab.append(
    row('Box', 'The shape around the words.', selectOf(Fx.LABEL_BOXES, 'lBox', 'label')),
    row('Font', 'The letters.', selectOf(Fx.LABEL_FONTS.map(f => [f[0], f[1]]), 'lFont', 'label')),
    row('Text size', '', rangeOf('lSize', 9, 20, 1, 'label', (v) => v + 'px')),
    row('Animation', 'How a quick label shows up.', selectOf(Fx.LABEL_ANIMS, 'lAnim', 'label')),
    row('Border', 'How thick the edge is. 0 for none.', rangeOf('lBorder', 0, 4, 1, 'label', (v) => v + 'px')),
    row('See-through', 'How solid the box is.', rangeOf('lAlpha', 0, 1, 0.05, 'label', (v) => Math.round(v * 100) + '%')),
    row('Colors', 'Box, edge and text. Right-click a color to go back to the default.', colorsOf('Labels', [['Box', '--label'], ['Edge', '--label-edge'], ['Text', '--label-ink']], 'label')),
  );
  const ico = document.getElementById('iconRows');
  ico.innerHTML = '';
  ico.append(
    row('Robot faces', 'Her ASCII faces (^_^ >_< [ERR]): she knows she\'s an android and finds it funny.', selectOf(Fx.ASCII_AMOUNTS, 'eAscii', 'icon')),
    row('How they appear', 'Pop, bounce, wobble, drop in or spin. A mix keeps her from moving the same way every time.', selectOf(Fx.ICON_ANIMS, 'eAnim', 'icon')),
  );
  const gal = document.getElementById('gallery');
  gal.innerHTML = '';
  for (const [name, kinds] of Fx.EMOTE_GROUPS) {
    const h = document.createElement('div');
    h.className = 'gal-name';
    h.textContent = name;
    const g = document.createElement('div');
    g.className = 'gallery';
    for (const k of kinds) {
      const [text, type] = Fx.EMOTES[k];
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      if (type === 'ascii') b.className = 'ascii';
      b.addEventListener('click', () => pvShowIcon(k));
      g.appendChild(b);
    }
    gal.append(h, g);
  }
}
buildFeedback();
previewTheme();
document.getElementById('resetFx').addEventListener('click', () => {
  Fx.writeFx({});
  Fx.applyFx({});
  const t = readTheme();
  for (const k of ['--ripple', '--label', '--label-edge', '--label-ink']) delete t[k];
  writeTheme(t);
  previewTheme();
  buildFeedback();
});
