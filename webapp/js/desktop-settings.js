// the desktop app's settings window (desktop/main.js openSettings).
// colors go to localStorage['desktop.theme'] (css variable -> hex),
// which desktop.html picks up live through the storage event. spots
// live in the app itself, through window.junDesktop.spots().
//
// every color here uses the closet's color picker, so new things that
// get colors later (her rooms, furniture, the chat window) should add
// a row to GROUPS the same way.

import { makeItemColorButton } from './wardrobe/color-picker.js?v=38';
import * as Fx from './desktop/fx.js?v=5';
import * as Moods from './desktop/moods.js?v=6';

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
  if (tab === 'feedback') { previewTheme(); setTimeout(pvAskSnap); }
  if (tab === 'size') setTimeout(loadSize); // after this module has set itself up
  if (tab === 'saves') setTimeout(loadSaves);
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
  // and so do her feelings
  for (const k of [...Moods.FEELINGS.map(([f]) => f), 'glow']) {
    const v = t['--mood-' + k];
    if (v) document.body.style.setProperty('--mood-' + k, v); else document.body.style.removeProperty('--mood-' + k);
  }
}
window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) previewTheme(); });

// her picture (from the desktop page, desktop.js takeSnapshot) instead of
// the little stand-in head, when there is one
const SNAP_KEY = 'desktop.snapshot';
const pvHer = document.getElementById('pvHer');
let snap = null;
function pvLoadSnap() {
  let next = null;
  try { next = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch { next = null; }
  if (!next || !next.img || (next.v || 1) < 2) { snap = null; pvHer.hidden = true; preview.classList.remove('has-her'); return; }
  pvHer.onload = () => {
    snap = next;
    const fx = Number.isFinite(next.fx) ? Math.max(0.1, Math.min(0.9, next.fx)) : 0.5;
    pvHer.style.setProperty('--pv-fx', String(fx));
    pvHer.hidden = false;
    preview.classList.add('has-her');
  };
  pvHer.onerror = () => { snap = null; pvHer.hidden = true; preview.classList.remove('has-her'); };
  pvHer.src = next.img;
}
// ask her for a fresh one (her outfit may have changed)
function pvAskSnap() { try { localStorage.setItem('desktop.snapshot.want', String(Date.now())); } catch { /* ignore */ } }
window.addEventListener('storage', (e) => { if (e.key === SNAP_KEY) pvLoadSnap(); });
pvLoadSnap();
pvAskSnap();
// where her face is in the preview, the same shape as live2d faceAnchor()
function pvFace() {
  if (snap && !pvHer.hidden) {
    const r = pvHer.getBoundingClientRect();
    const h = r.height;
    // a bad number in the picture's note must never put her face outside the picture
    const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    return { x: r.left + r.width * num(snap.fx, 0.1, 0.9, 0.5), y: r.top + h * num(snap.fy, 0.03, 0.7, 0.22),
      headW: h * num(snap.headW, 0.08, 0.6, 0.25), modelW: h * num(snap.modelW, 0.2, 3, 0.7),
      modelH: h * num(snap.modelH, 0.5, 4, 2), top: r.top };
  }
  const head = preview.querySelector('.pv-head');
  const r = head.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.45, headW: r.width, modelW: r.width * 2.4, modelH: r.width * 1.6, top: r.top };
}

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
  // just above her head, wherever it sits in the box
  const a = pvFace();
  const box = preview.getBoundingClientRect();
  // always inside the box, whatever the picture says
  pvEmote.style.left = Math.max(40, Math.min(box.width - 40, a.x - box.left)) + 'px';
  pvEmote.style.top = Math.max(38, Math.min(box.height - 10, a.top - box.top - (snap ? 0 : 14))) + 'px';
  pvEmote.classList.remove('show');
  void pvEmote.offsetWidth;
  pvEmote.classList.add('show');
  clearTimeout(pvEmoteTimer);
  pvEmoteTimer = setTimeout(() => pvEmote.classList.remove('show'), 2000);
}
function pvCenter() {
  const a = pvFace();
  return { x: a.x, y: a.y };
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

// how she feels: the same effects as on the desktop, around the little
// head in the preview
Moods.installCss();
Moods.setAnchor(() => {
  if (preview.closest('section').hidden) return null;
  return pvFace();
}, preview);
const FEEL_SAMPLES = {
  notready: 'Not ready: a tail grab too early', flustered: 'Flustered: a thigh squish as friends', likes: 'Likes it: a headpat as friends',
  loves: 'Loves it: a hug once you\'re close', giggly: 'Giggly: a boop, or a tickle',
};
const STAGE_NAMES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];
const FEEL_NAME = Object.fromEntries(Moods.FEELINGS.map(([k, n]) => [k, n.toLowerCase()]));
let pvMoodTimers = [];
// her feelings' captions are long: centered over the little head
function pvMoodLabel(text) {
  if (Fx.readFx().mAmount === 'off') text = 'Turned off: pick Some or Lots under How much';
  pvShowLabel(text, preview.getBoundingClientRect().width / 2, 44);
}
function pvMoodStop() { pvMoodTimers.forEach(clearTimeout); pvMoodTimers = []; Moods.endAll(); }
function pvFeel(f) {
  pvMoodStop();
  Moods.preview(f, 2200, 0.75);
  pvMoodLabel(FEEL_SAMPLES[f]);
}
// the glow on its own for a few seconds, a different feeling each time
let pvGlowNext = 0;
function pvGlow() {
  pvMoodStop();
  const fx = Fx.readFx();
  const [f, name] = Moods.FEELINGS[pvGlowNext++ % Moods.FEELINGS.length];
  if (fx.mGlow === false) { pvMoodLabel('The glow is switched off (Glow around her)'); return; }
  Moods.preview(f, 3500, 0.8);
  pvMoodLabel('The glow: ' + (fx.mGlowColor === 'feeling' ? name.toLowerCase() : 'your pick'));
}
function buildMoodBtns() {
  const box = document.getElementById('moodBtns');
  box.innerHTML = '';
  const add = (text, fn, color) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = text;
    if (color) b.style.borderColor = color;
    b.addEventListener('click', fn);
    box.appendChild(b);
  };
  const theme = readTheme();
  for (const [k, name, def] of Moods.FEELINGS) add(name, () => pvFeel(k), theme['--mood-' + k] || def);
  // a long hug: it grows the longer it goes on
  add('A long hug (builds up)', () => {
    pvMoodStop();
    Moods.preview('loves', 7000, 0.15, 1);
    pvMoodLabel('A long hug, building up');
  });
  // a friend's foot tickle: giggly, then "enough!" (the real rules)
  add('A foot tickle as friends', () => {
    pvMoodStop();
    Moods.setContext({ stage: 3, mood: 'neutral' });
    Moods.begin('pv', 'feettickle');
    pvMoodLabel('Foot tickle as friends: giggly, then enough!');
    pvMoodTimers.push(setTimeout(() => Moods.end('pv'), 4200));
  });
  // the same headpat at every bond
  add('A headpat at every bond', () => {
    pvMoodStop();
    STAGE_NAMES.forEach((name, i) => pvMoodTimers.push(setTimeout(() => {
      const f = Moods.feelingFor('head', 'hold', 1200, { stage: i + 1, mood: 'neutral' });
      Moods.preview(f.feeling, 1500, f.power);
      pvMoodLabel('A headpat. ' + name + ': ' + FEEL_NAME[f.feeling]);
    }, i * 1700)));
  });
}

// a change shows itself in the preview, once the slider stops moving
let pvSoon = null;
function changed(what) {
  clearTimeout(pvSoon);
  pvSoon = setTimeout(() => {
    if (what === 'ripple') { const c = pvCenter(); Fx.ripple(c.x, c.y); }
    if (what === 'label') pvShowLabel();
    if (what === 'icon') pvShowIcon();
    if (what === 'glow') pvGlow();
    if (what === 'mood') { buildMoodBtns(); const f = Moods.FEELINGS[Math.floor(Math.random() * Moods.FEELINGS.length)][0]; pvFeel(f); }
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
  const mood = document.getElementById('moodRows');
  mood.innerHTML = '';
  mood.append(
    row('How much', 'Off, some, or lots of little effects.', selectOf(Moods.AMOUNTS, 'mAmount', 'mood')),
    row('Colors', 'One for each feeling. Right-click a color to go back to the default.',
      colorsOf('Feelings', Moods.FEELINGS.map(([k, name]) => [name, '--mood-' + k]), 'mood')),
  );
  // the glow: every part of it is his to shape
  const glowHead = document.createElement('h3');
  glowHead.className = 'sub';
  glowHead.textContent = 'The glow';
  const glowBtns = document.createElement('div');
  glowBtns.className = 'preview-btns';
  const gb = document.createElement('button');
  gb.type = 'button';
  gb.className = 'btn';
  gb.textContent = 'Show the glow';
  gb.addEventListener('click', () => pvGlow());
  glowBtns.appendChild(gb);
  const pctOf = (v) => Math.round(v * 100) + '%';
  mood.append(
    glowHead,
    row('Glow around her', 'A soft glow while a touch goes on.', checkOf('mGlow', 'glow')),
    row('Strength', 'How bright it is.', rangeOf('mGlowStr', 0.2, 2.5, 0.1, 'glow', times)),
    row('Size', 'How far round her it reaches.', rangeOf('mGlowSize', 0.4, 2.5, 0.1, 'glow', times)),
    row('Softness', 'Low: a clear shape. High: a soft haze.', rangeOf('mGlowSoft', 0, 1, 0.05, 'glow', pctOf)),
    row('Shape', 'Round her head, or all round her.', selectOf(Moods.GLOW_SHAPES, 'mGlowShape', 'glow')),
    row('Movement', 'Her feeling\'s own way: a shiver when she isn\'t ready, a flutter when flustered, a hop when giggly.',
      selectOf(Moods.GLOW_MOVES, 'mGlowMove', 'glow')),
    row('Speed', 'How fast it moves.', rangeOf('mGlowSpeed', 0.25, 3, 0.05, 'glow', times)),
    row('Color', 'Each feeling\'s color (above), one color of your own, or a rainbow.', selectOf(Moods.GLOW_COLORS, 'mGlowColor', 'glow')),
    row('Your color', 'Used when Color is "One color".', colorsOf('Glow', [['Glow', '--mood-glow']], 'glow')),
    row('In front or behind', 'Behind her it glows round her; in front it tints her too.', selectOf(Moods.GLOW_LAYERS, 'mGlowLayer', 'glow')),
    row('Fade out', 'How slowly it fades after a touch.', rangeOf('mGlowFade', 0.1, 3, 0.1, 'glow', (v) => v.toFixed(1) + ' s')),
    glowBtns,
  );
  buildMoodBtns();
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
  for (const k of ['--ripple', '--label', '--label-edge', '--label-ink', '--mood-glow', ...Moods.FEELINGS.map(([f]) => '--mood-' + f)]) delete t[k];
  writeTheme(t);
  previewTheme();
  buildFeedback();
});

// ---------------------------------------------------------------
// her size: a share of the screen's height (desktop/main.js setSize).
// she grows and shrinks live while the slider moves

const sizeRange = document.getElementById('sizeRange');
const growFx = document.getElementById('growFx');
let sizeState = null;
const QUICK_NAMES = { small: 'Small', medium: 'Medium', large: 'Large' };
function sizeWords(share) {
  if (share < 0.12) return 'Pocket-sized';
  if (share < 0.22) return 'Tiny';
  if (share < 0.36) return 'Small';
  if (share < 0.48) return 'Medium';
  if (share < 0.6) return 'Large';
  if (share < 0.75) return 'Huge';
  return 'Giant';
}
function drawSize(share) {
  const st = sizeState;
  document.getElementById('sizeWords').textContent = sizeWords(share) + ' (' + Math.round(share * 100) + '% of the screen)';
  // the little screen is 65 px tall above its taskbar
  document.getElementById('sizeJun').style.height = Math.round(share * 65) + 'px';
  const px = st ? Math.round(share * st.screenPx) : null;
  document.getElementById('sizePx').textContent = px ? 'About ' + px + ' px tall on this screen.' : '';
  for (const b of document.querySelectorAll('#sizeQuick .btn')) b.classList.toggle('on', Math.abs(Number(b.dataset.v) - share) < 0.012);
}
async function loadSize() {
  const note = document.getElementById('sizeNote');
  sizeState = D?.size ? await D.size('get') : null;
  const quick = document.getElementById('sizeQuick');
  quick.innerHTML = '';
  if (!sizeState) {
    sizeRange.disabled = growFx.disabled = true;
    note.textContent = 'Open this from the Jun desktop app to change her size.';
    drawSize(0.425);
    return;
  }
  sizeRange.disabled = growFx.disabled = false;
  sizeRange.min = String(Math.round(sizeState.min * 100));
  sizeRange.max = String(Math.round(sizeState.max * 100));
  sizeRange.value = String(Math.round(sizeState.size * 100));
  growFx.checked = !!sizeState.growFx;
  for (const [k, v] of Object.entries(sizeState.quick)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.dataset.v = String(v);
    b.textContent = QUICK_NAMES[k] || k;
    b.addEventListener('click', async () => {
      sizeState = await D.size('done', v);
      sizeRange.value = String(Math.round(v * 100));
      drawSize(v);
    });
    quick.appendChild(b);
  }
  note.textContent = sizeState.outside ? '' : "You'll see it when she's out on the desktop (Ctrl+Shift+S, or Jun menu > Step out).";
  drawSize(sizeState.size);
}
let sizeBusy = false, sizeNext = null;
async function pushSize(v, done) {
  // one call at a time: the slider fires faster than her window resizes
  if (sizeBusy && !done) { sizeNext = v; return; }
  sizeBusy = true;
  try { sizeState = (await D.size(done ? 'done' : 'set', v)) || sizeState; } finally { sizeBusy = false; }
  if (sizeNext != null && !done) { const n = sizeNext; sizeNext = null; pushSize(n, false); }
}
sizeRange.addEventListener('input', () => {
  const v = Number(sizeRange.value) / 100;
  drawSize(v);
  if (D?.size) pushSize(v, false);
});
sizeRange.addEventListener('change', () => {
  const v = Number(sizeRange.value) / 100;
  sizeNext = null;
  if (D?.size) pushSize(v, true);
});
growFx.addEventListener('change', async () => {
  if (D?.size) sizeState = await D.size('growFx', growFx.checked);
});

// ---------------------------------------------------------------
// saves & updates (desktop/main.js 'jun:saves', desktop/saves.js).
// a save is one .junsave file; going back and updating restart her,
// main.js asks first and shows the progress itself

const $ = (id) => document.getElementById(id);
const KIND_WORDS = { named: 'Yours', daily: 'Daily', 'before-restore': 'Before going back', 'before-update': 'Before an update', broken: "Can't be read" };
let savesBusy = false;

function sizeText(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + '\u00a0GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1) + '\u00a0MB';
  return Math.max(1, Math.round(n / 1024)) + '\u00a0KB';
}
function whenText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return 'Today, ' + time;
  if (d.toDateString() === yest.toDateString()) return 'Yesterday, ' + time;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' }) + ', ' + time;
}
function saveMsg(text, err) {
  const m = $('saveMsg');
  m.textContent = text || '';
  m.classList.toggle('err', !!err);
  if (err) m.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function drawSaves(info) {
  const rows = $('saveRows');
  rows.textContent = '';
  const busy = !!info.busy || savesBusy;
  $('noSaves').hidden = info.saves.length > 0;
  for (const s of info.saves) {
    const row = document.createElement('div');
    row.className = 'row save-row';
    const what = document.createElement('div');
    what.className = 'what';
    const b = document.createElement('b');
    b.textContent = s.name;
    b.title = s.name;
    const sub = document.createElement('span');
    const kind = document.createElement('span');
    kind.className = 'save-kind ' + s.kind;
    kind.textContent = KIND_WORDS[s.kind] || s.kind;
    sub.append(kind, document.createTextNode([whenText(s.created), sizeText(s.size)].filter(Boolean).join(' · ')));
    what.append(b, sub);
    const acts = document.createElement('div');
    acts.className = 'acts';
    if (!s.broken) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn';
      back.textContent = 'Go back to this';
      back.disabled = busy;
      back.addEventListener('click', async () => {
        saveMsg('');
        const r = await D.saves('restore', s.file);
        if (r && !r.ok && r.error) saveMsg(r.error, true);
      });
      acts.append(back);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.disabled = busy;
    del.addEventListener('click', async () => {
      const r = await D.saves('delete', s.file);
      if (r?.info) drawSaves(r.info);
      else if (r && r.error) saveMsg(r.error, true);
    });
    acts.append(del);
    row.append(what, acts);
    rows.append(row);
  }
  $('saveDirWhat').textContent = info.custom ? 'In a folder you picked' : "In Jun's folder (the default)";
  $('saveDir').textContent = info.dir;
  $('saveDefault').disabled = !info.custom;
  const keep = $('saveKeep');
  keep.textContent = '';
  for (const n of info.keepChoices) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `Keep the last ${n}`;
    keep.append(o);
  }
  keep.value = String(info.keep);
  $('saveNow').disabled = busy;
  $('updateNow').disabled = busy;
  $('updateNow').textContent = info.busy === 'checking for an update' ? 'Checking…' : 'Check now';
  if (info.busy) saveMsg('Jun is ' + info.busy + '…');
}

async function loadSaves() {
  const note = $('saveNote');
  if (!D?.saves) {
    for (const id of ['saveNow', 'saveName', 'savePick', 'saveDefault', 'saveOpen', 'saveKeep', 'updateNow']) $(id).disabled = true;
    note.textContent = 'Open this from the Jun desktop app (tray icon > Saves & updates) to save her or update.';
    return;
  }
  note.textContent = '';
  const r = await D.saves('get');
  if (r?.info) drawSaves(r.info);
}

async function savesCall(action, a) {
  const r = await D.saves(action, a);
  if (r?.info) drawSaves(r.info);
  if (r && !r.ok && r.error) saveMsg(r.error, true);
  return r;
}

$('saveNow').addEventListener('click', async () => {
  if (!D?.saves || savesBusy) return;
  savesBusy = true;
  $('saveNow').disabled = true;
  saveMsg('Saving…');
  try {
    const r = await D.saves('save', $('saveName').value.trim());
    if (r?.ok) {
      $('saveName').value = '';
      saveMsg(`Saved “${r.saved.name}” (${sizeText(r.saved.size)}).`);
    } else saveMsg((r && r.error) || "Jun couldn't save.", true);
    savesBusy = false;
    if (r?.info) drawSaves(r.info); else loadSaves();
  } finally { savesBusy = false; $('saveNow').disabled = false; }
});
$('saveName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('saveNow').click(); });
$('savePick').addEventListener('click', () => D?.saves && savesCall('pickDir').then(r => { if (r?.ok) saveMsg('Saves go to the new folder from now on. The old saves stay where they were.'); }));
$('saveDefault').addEventListener('click', () => D?.saves && savesCall('resetDir'));
$('saveOpen').addEventListener('click', () => D?.saves && savesCall('openDir'));
$('saveKeep').addEventListener('change', () => D?.saves && savesCall('keep', $('saveKeep').value));
$('updateNow').addEventListener('click', () => D?.saves && savesCall('update'));
D?.onSavesChanged?.(() => { if (!$('tab-saves').hidden) loadSaves(); });
