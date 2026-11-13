// the desktop app's settings window (desktop/main.js openSettings).
// colors go to localStorage['desktop.theme'] (css variable -> hex),
// which desktop.html picks up live through the storage event. spots
// live in the app itself, through window.junDesktop.spots().
//
// every color here uses the closet's color picker, so new things that
// get colors later (her rooms, furniture, the chat window) should add
// a row to GROUPS the same way.

import { makeItemColorButton } from './wardrobe/color-picker.js?v=40';
import * as Fx from './desktop/fx.js?v=10';
import * as Moods from './desktop/moods.js?v=12';
import * as Often from './desktop/often.js?v=2';
import * as HerWin from './home/herwin.js?v=7';
import * as F from './core/features.js?v=3';
import * as Gate from './core/gate.js?v=3';
import * as Controls from './home/controls.js?v=8';
import * as Stores from './home/stores.js?v=5';

// the feature registry (data/features.json): search words, layers, notes, resets, what's new
await F.load();

const D = window.junDesktop || null;
const THEME_KEY = 'desktop.theme';

// [label, hint, [slot label, css variable, default]...]
const GROUPS = [
  ['Chat bar', 'The line you type to her in.', [['Background', '--panel', '#191233'], ['Text box', '--field', '#241c46'], ['Accent', '--accent', '#ec0054'], ['Text', '--ink', '#ffffff']]],
  ['Hint text', 'Placeholder text and small icons.', [['Hint', '--muted', '#a79fc9']]],
  ['Speech card', 'Where her lines appear.', [['Name tag', '--card-name', '#15142e'], ['Text box', '--card', '#191233']]],
  ['Thought bubbles', 'The ♪ ? ! ♥ over her head, and her thinking cloud.', [['Bubble', '--bubble', '#191233'], ['Outline', '--bubble-edge', '#ec0054']]],
  ['Touch glow', 'The soft glow where your mouse is on her.', [['Glow', '--glow', '#ec0054']]],
  ['Touch spot outlines', 'The outlines from Touch & feelings > Show touch spots.', [['Outline', '--spot-outline', '#ff78be']]],
];

function readTheme() {
  try { return JSON.parse(localStorage.getItem(THEME_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeTheme(t) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {}
}

// ---------------------------------------------------------------
// the settings home: one section at a time, picked in the sidebar.
// old tab names (openSettings('spots'), #feedback...) still land in the right place

const SECTIONS = ['her', 'talk', 'touch', 'desktop', 'visuals', 'comfort', 'saves', 'account', 'help'];
const OLD_TABS = { colors: ['visuals'], feedback: ['touch'], spots: ['desktop', 'at-spots'], size: ['desktop', 'at-size'] };
const tabs = [...document.querySelectorAll('nav button')];
let current = 'help';
function show(tab, anchor) {
  tab = String(tab || '');
  if (OLD_TABS[tab]) [tab, anchor = anchor] = OLD_TABS[tab];
  if (!SECTIONS.includes(tab)) tab = 'help';
  if (current === 'her' && tab !== 'her') HerWin.leaveHer();
  current = tab;
  for (const b of tabs) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== 'tab-' + tab;
  if (tab === 'desktop') { loadSpots(); setTimeout(loadSize); loadDesk(); } // size after this module has set itself up
  if (tab === 'touch') { previewTheme(); setTimeout(pvAskSnap); loadDesk(); }
  if (tab === 'talk') { loadDesk(); HerWin.hello(); }
  if (tab === 'her') { HerWin.hello(); HerWin.loadHer(); }
  if (tab === 'account') HerWin.loadAccount();
  if (tab === 'saves') setTimeout(loadSaves);
  if (tab === 'comfort') loadComfort();
  soon();
  const el = anchor && document.getElementById(anchor);
  if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60);
  else window.scrollTo(0, 0);
}
tabs.forEach(b => b.addEventListener('click', () => { clearSearch(); show(b.dataset.tab); }));
D?.onSettingsTab?.((tab) => { clearSearch(); show(tab); });
window.addEventListener('hashchange', () => { clearSearch(); show(decodeURIComponent(location.hash.slice(1))); });


// ---------------------------------------------------------------
// colors

// every row is a standard one (js/home/controls.js); the 4th argument is its registry key
const row = Controls.row;
// "how often" / "how much": steps + percent
const oftenControl = Controls.oftenCtl;

// the registry pass over the page (Simple/Everything, More folds, plain-words notes), once
// after a burst of changes
let soonT = 0;
function soon() {
  if (soonT) return;
  soonT = requestAnimationFrame(() => { soonT = 0; Controls.decorate(document.querySelector('main')); });
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
    const fkey = 'theme:' + key;
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
    host.appendChild(row(label, hint, wrap, fkey));
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
  if (!next || !next.img || (next.v || 1) < 3) { snap = null; pvHer.hidden = true; preview.classList.remove('has-her'); return; }
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
  secret: 'Secretly loves it: a long headpat as friends', comforted: 'Comforted: a hug when she\'s upset',
};
const STAGE_NAMES = ['Stranger', 'Familiar', 'Friend', 'Close', 'Partner', 'Devoted'];
const FEEL_NAME = Object.fromEntries(Moods.FEELINGS.map(([k, n]) => [k, n.toLowerCase()]));
let pvMoodTimers = [];
// her feelings' captions are long: centered over the little head
function pvMoodLabel(text) {
  if (Often.pct(Fx.readFx().mAmount) === 0) text = 'Turned off: turn up How much';
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
// "Anime tsundere talk": the owner's pick, and where she is with the habit
// (lib/quirks.php through relationship.php)
const ANIME_PICKS = [['auto', 'When she picks it up'], ['on', 'Always'], ['off', 'Never']];
const ANIME_STATE = {
  learning: 'Not yet: after enough anime together, from friends up.',
  picked: 'She picked it up from your anime time together.',
  asked: 'You asked her to be a tsundere.',
  stopped: 'You asked her to stop.',
};
function animeRow() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:190px';
  const sel = selectOf(ANIME_PICKS, 'mAnime', 'mood');
  const state = document.createElement('span');
  state.className = 'stay';
  state.style.textAlign = 'right';
  box.append(sel, state);
  fetch('api/relationship.php', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { const q = j && j.quirks && j.quirks.anime_tsundere; if (q) state.textContent = ANIME_STATE[q.state] || ''; })
    .catch(() => {});
  return box;
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
  soon();
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
  sel.dataset.fx = key;
  sel.addEventListener('change', () => setFx(key, sel.value, what));
  return sel;
}
function rangeOf(key, min, max, step, what, fmt) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  wrap.dataset.fx = key;
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
  c.dataset.fx = key;
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
// a how-often / how-much fx setting (steps + percent)
function fxOften(key, list, what) {
  const c = oftenControl(Fx.readFx()[key], list, (p) => setFx(key, p, what));
  c.dataset.fx = key;
  return c;
}

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
    row('Color', 'Right-click to go back to her accent color.', colorsOf('Ripple', [['Ripple', '--ripple']], 'ripple'), 'theme:--ripple'),
    row('Let her pick', 'Now and then she changes the ripple to show how she takes a touch: shaky when it\'s one she isn\'t ready for, a burst of hearts for a hug once you\'re close.', checkOf('rHerPick', 'ripple')),
  );
  const mood = document.getElementById('moodRows');
  mood.innerHTML = '';
  mood.append(
    row('How much', 'From none at all to all the way. Normal is how she comes.',
      fxOften('mAmount', Often.MUCH, 'mood')),
    row('Colors', 'One for each feeling. Right-click a color to go back to the default.',
      colorsOf('Feelings', Moods.FEELINGS.map(([k, name]) => [name, '--mood-' + k]), 'mood'), 'theme:--mood-likes'),
    row('Tsundere moments', 'As friends she won\'t admit she loves a touch: the hearts leak out while she hides them. '
      + 'Once you\'re close she sometimes gives up hiding. From partners on, nothing to hide.', checkOf('mTsun', 'mood')),
    row('Comforted when she\'s down', 'A warm touch while she\'s upset or scared comforts her (friends and up).', checkOf('mComfort', 'mood')),
  );
  // a habit she picks up, so it lives with the others in Her > Habits she's picked up
  const habits = document.getElementById('habitRows');
  habits.innerHTML = '';
  habits.append(row('Anime tsundere talk', 'A "b-baka" now and then when she\'s secretly pleased. Not her at first: '
    + 'she picks it up after enough anime together (watching it, talking about it), or if you ask her to be a tsundere.',
    animeRow()));
  // her body showing it: on her on the desktop (the picture here can't move)
  const bodyHead = document.createElement('h3');
  bodyHead.className = 'sub';
  bodyHead.textContent = 'Her body';
  const bodyHint = document.createElement('p');
  bodyHint.className = 'hint';
  bodyHint.textContent = 'Her ears, tail, eyes and blush show it too: a fast wag when she loves it, a stiff tail shooting up when she isn\'t ready, '
    + 'ears twitching when she\'s flustered, the tail low and slow when she likes it. You\'ll see this on her on the desktop.';
  mood.append(
    bodyHead, bodyHint,
    row('Her body shows it', 'Ears, tail, eyes and blush move with how she feels.', checkOf('mBody', 'body')),
    row('How much', 'Subtle to big.', rangeOf('mBodyStr', 0.2, 1.5, 0.05, 'body', (v) => Math.round(v * 100) + '%')),
    row('Ears', 'Flat, twitching, relaxed, perked, bouncing.', checkOf('mBodyEars', 'body')),
    row('Tail', 'Stiff and up, flicks, low and slow, a happy wag, a fast wiggle.', checkOf('mBodyTail', 'body')),
    row('Eyes and blush', 'Wide eyes, looking away, happy eyes, heart eyes now and then.', checkOf('mBodyEyes', 'body')),
    row('Leaning away', 'After a touch she wasn\'t ready for, she leans away from your hand a little, softly.', checkOf('mBodyLean', 'body')),
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
    row('Your color', 'Used when Color is "One color".', colorsOf('Glow', [['Glow', '--mood-glow']], 'glow'), 'theme:--mood-glow'),
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
    row('Colors', 'Box, edge and text. Right-click a color to go back to the default.', colorsOf('Labels', [['Box', '--label'], ['Edge', '--label-edge'], ['Text', '--label-ink']], 'label'), 'theme:--label'),
  );
  const ico = document.getElementById('iconRows');
  ico.innerHTML = '';
  ico.append(
    row('Robot faces', 'Her ASCII faces (^_^ >_< [ERR]): she knows she\'s an android and finds it funny.', fxOften('eAscii', Often.OFTEN, 'icon')),
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
  soon();
}
buildFeedback();
previewTheme();
// the touch section's reset: every touch feedback pick and its colors (the section reset
// button does this plus the touch switches, through the registry)
function resetTouchFeedback() {
  Fx.writeFx({});
  Fx.applyFx({});
  const t = readTheme();
  for (const k of ['--ripple', '--label', '--label-edge', '--label-ink', '--mood-glow', ...Moods.FEELINGS.map(([f]) => '--mood-' + f)]) delete t[k];
  writeTheme(t);
  previewTheme();
  buildFeedback();
}

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

// ---------------------------------------------------------------
// "On the desktop" switches (they used to live only in the tray and Jun menu; the menus still have
// the quick ones). kept in desktop.json by the app, through junDesktop.desk()

let deskState = null;
// these are 0..100 with a slider (the others are plain picks)
const PCT_ROWS = { walk: Often.OFTEN, talk: Often.OFTEN, watch: Often.OFTEN, patFollow: Often.MUCH };
const DESK_ROWS = {
  talkRows: [
    ['quiet', 'Quiet mode on the desktop', 'Out on the desktop she doesn\'t wander or talk on her own. She still answers you.'],
    ['talk', 'Talks about your touches', 'How often she says something about a touch on the desktop.'],
  ],
  touchRows: [
    ['patFollow', 'Headpat: her head follows your hand', 'When you press and hold on her head and move the mouse.'],
    ['hints', 'Touch hints', 'What shows where a click will do something.'],
    ['showSpots', 'Show touch spots', 'A faint outline on every spot on her.'],
    ['calibrate', 'Adjust touch spots', 'Drag the spots onto her, scroll to resize, untick one to switch it off, Ctrl+Z to undo. She holds still while you work.'],
  ],
  actRows: [
    ['walk', 'Walks around', 'How often she wanders along the taskbar by herself.'],
    ['doze', 'Dozes off when you\'re away', 'After how long without your mouse or keyboard.'],
    ['watch', 'Looks at your mouse', 'How often she follows your cursor with her eyes.'],
    ['sounds', 'Little sounds', 'Steps, landing, squeaks.'],
  ],
  windowRows: [
    ['onTop', 'Keep her window on top', 'Her window stays above your other windows.'],
    ['openAtStart', 'Open her window when Jun starts', 'Off: Jun starts in the tray by the clock.'],
    ['startWithWindows', 'Start Jun with Windows', 'Jun wakes up when you turn on your PC.'],
  ],
};
async function deskCall(action, key, value) {
  if (!D?.desk) return;
  deskState = await D.desk(action, key, value);
  Stores.setDesk(deskState);
  drawDesk();
}
function deskControl(key) {
  const st = deskState;
  const off = !st;
  if (key === 'calibrate') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = 'Adjust…'; b.disabled = off;
    b.addEventListener('click', () => deskCall('calibrate'));
    return b;
  }
  const top = ['onTop', 'openAtStart', 'startWithWindows'].includes(key);
  if (PCT_ROWS[key]) return oftenControl(st ? st.desk[key] : 50, PCT_ROWS[key], (p) => deskCall('set', key, p), off);
  const choices = st?.choices?.[key];
  if (choices) {
    const sel = document.createElement('select');
    sel.className = 'btn';
    for (const [v, name] of choices) {
      const o = document.createElement('option');
      o.value = String(v); o.textContent = name;
      sel.appendChild(o);
    }
    sel.value = String(st.desk[key]);
    sel.addEventListener('change', () => deskCall('set', key, sel.value));
    return sel;
  }
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.disabled = off || (key === 'startWithWindows' && !st.canStartWithWindows);
  c.checked = !!(st && (top ? st[key] : st.desk[key]));
  c.addEventListener('change', () => (top ? deskCall(key, null, c.checked) : deskCall('set', key, c.checked)));
  return c;
}
function drawDesk() {
  for (const [host, rows] of Object.entries(DESK_ROWS)) {
    const el = document.getElementById(host);
    if (!el) continue;
    el.innerHTML = '';
    for (const [key, title, hint] of rows) {
      const r = row(title, hint, deskControl(key));
      r.dataset.key = key;
      if (!deskState) r.classList.add('off');
      el.appendChild(r);
    }
  }
  const note = document.getElementById('deskNote');
  if (note) note.hidden = !!deskState;
  drawPresets();
  soon();
  if (searchBox.value.trim()) runSearch();
}
async function loadDesk() {
  deskState = D?.desk ? await D.desk('get').catch(() => null) : null;
  Stores.setDesk(deskState);
  drawDesk();
}
D?.onDeskChanged?.((st) => { deskState = st; Stores.setDesk(st); drawDesk(); });

// ---------------------------------------------------------------
// search over every setting: rows and headings in every section. a hit opens its section and
// scrolls to it, so nothing has to move around to be found

const searchBox = document.getElementById('setSearch');
const NAMES = { her: 'Her', talk: 'Talking & voice', touch: 'Touch & feelings', desktop: 'On the desktop', visuals: 'Visuals', comfort: 'Comfort & ratings', saves: 'Saves & updates', account: 'Account & advanced', help: 'How to play' };
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
function runSearch() {
  const q = norm(searchBox.value);
  const box = document.getElementById('resultRows');
  box.innerHTML = '';
  if (!q) return;
  const words = q.split(' ');
  const hits = [];
  for (const sec of document.querySelectorAll('main > section')) {
    const id = sec.id.replace('tab-', '');
    if (!NAMES[id]) continue;
    // in page order, so each row knows the (sub)heading above it
    let h2 = '', h3 = '';
    for (const el of sec.querySelectorAll('.row, h2, h3')) {
      if (el.tagName === 'H2') { h2 = el.textContent.trim(); h3 = ''; }
      else if (el.tagName === 'H3') h3 = el.textContent.trim();
      if (el.closest('#gallery')) continue;
      const isRow = el.matches('.row');
      const title = (isRow ? el.querySelector('.what b')?.textContent : el.textContent || '').trim();
      if (!title) continue;
      const under = isRow ? [h2, h3].filter(Boolean).join(' › ') : (el.tagName === 'H3' ? h2 : '');
      const text = norm(title + ' ' + (isRow ? el.querySelector('.what span')?.textContent || '' : '') + ' ' + under
        + ' ' + (isRow ? Controls.wordsOfRow(el) : ''));
      if (!words.every(w => text.includes(w))) continue;
      const t = norm(title);
      // a title that says it ranks first, then whole sections/headings, then the rest
      const rank = words.every(w => t.includes(w)) ? (isRow ? 0 : 1) : 2;
      hits.push({ id, el, title, where: NAMES[id] + (under ? ' › ' + under : ''), rank, n: hits.length, feature: isRow ? el.dataset.feature : '' });
    }
  }
  // features with no row of their own here (touches, her window's things): from the registry
  const found = new Set(hits.map(h => h.feature).filter(Boolean));
  for (const f of F.search(q)) {
    if (found.has(f.id)) continue;
    if (f.section !== 'elsewhere' && document.querySelector('#tab-' + f.section + ' .row[data-feature="' + f.id + '"]')) continue;
    const t = norm(f.name);
    hits.push({ id: f.section === 'elsewhere' ? '' : f.section, el: null, title: f.name, line: f.line, anchor: f.anchor,
      where: f.where || (NAMES[f.section] || ''), rank: words.every(w => t.includes(w)) ? 0 : 3, n: hits.length });
  }
  hits.sort((a, b) => a.rank - b.rank || a.n - b.n);
  for (const h of hits.slice(0, 40)) {
    const r = document.createElement('div');
    r.className = 'row res';
    r.tabIndex = 0;
    const what = document.createElement('div');
    what.className = 'what';
    const where = document.createElement('span');
    where.className = 'where';
    where.textContent = h.where;
    const b = document.createElement('b');
    b.textContent = h.title;
    what.append(where, b);
    if (h.line) { const l = document.createElement('span'); l.textContent = h.line; what.appendChild(l); }
    r.appendChild(what);
    const go = () => {
      if (!h.id) return; // somewhere else (her window): the line says where
      clearSearch();
      show(h.id, h.el ? null : h.anchor);
      if (!h.el) return;
      // some sections redraw their rows when they open, so find it again by its title
      setTimeout(() => {
        let el = h.el;
        if (!el.isConnected) el = [...document.querySelectorAll('#tab-' + h.id + ' .row')].find(x => x.querySelector('.what b')?.textContent.trim() === h.title) || null;
        if (!el) return;
        Controls.reveal(el);
        el.scrollIntoView({ block: 'center' });
        if (el.matches('.row')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      }, 150);
    };
    r.addEventListener('click', go);
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    box.appendChild(r);
  }
  document.getElementById('noResults').hidden = hits.length > 0;
  document.getElementById('resultsHead').textContent = hits.length ? 'Found ' + hits.length + (hits.length === 1 ? ' setting' : ' settings') : 'Results';
}
function setSearching(on) {
  for (const s of document.querySelectorAll('main > section')) s.hidden = on ? s.id !== 'tab-results' : s.id !== 'tab-' + current;
  for (const b of tabs) b.classList.toggle('on', !on && b.dataset.tab === current);
}
function clearSearch() {
  if (!searchBox.value) return;
  searchBox.value = '';
  setSearching(false);
}
searchBox.addEventListener('input', () => {
  const on = !!searchBox.value.trim();
  setSearching(on);
  if (on) { loadDesk(); window.scrollTo(0, 0); }
  runSearch();
});
searchBox.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { clearSearch(); searchBox.blur(); }
  if (e.key === 'Enter') document.querySelector('#resultRows .res')?.click();
});
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchBox.focus(); searchBox.select(); }
});

// ---------------------------------------------------------------
// Simple / Everything (the registry's layers): Simple keeps the extras behind "More settings"

const layerPick = document.getElementById('layerPick');
layerPick.value = F.layer();
layerPick.addEventListener('change', () => { F.setLayer(layerPick.value); soon(); });

// ---------------------------------------------------------------
// presets: bundles of settings to start from. one click undoes the last one

function drawPresets() {
  const host = document.getElementById('presetRows');
  if (!host) return;
  host.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'adds';
  for (const p of F.presets()) {
    const b = Controls.buttonCtl(p.name, async () => {
      await Stores.applyPreset(p);
      presetMsg('Now: ' + p.name + '. ' + p.line);
      await loadDesk();
      buildFeedback();
      drawPresets();
    }, { disabled: !deskState });
    b.title = p.line;
    box.appendChild(b);
  }
  host.appendChild(box);
  const u = Stores.undoInfo();
  if (u) host.appendChild(Controls.buttonCtl('Undo "' + u.name + '"', async () => {
    await Stores.undoPreset();
    presetMsg('Back to how you had it.');
    await loadDesk();
    buildFeedback();
    drawPresets();
  }));
}
function presetMsg(t) { const m = document.getElementById('presetMsg'); if (m) m.textContent = t; }

// ---------------------------------------------------------------
// a reset per section: back to how she comes (only the settings this page can change)

for (const b of document.querySelectorAll('[data-reset]')) {
  b.addEventListener('click', async () => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.dataset.text = b.textContent;
      b.textContent = 'Click again to reset';
      setTimeout(() => { b.classList.remove('armed'); b.textContent = b.dataset.text; }, 3000);
      return;
    }
    b.classList.remove('armed');
    b.textContent = b.dataset.text;
    await Stores.resetSection(b.dataset.reset);
    if (b.dataset.reset === 'touch') resetTouchFeedback();
    await loadDesk();
    buildFeedback();
  });
}

// ---------------------------------------------------------------
// Comfort & ratings: what you are to each other, Flirty, 18+. his choices, kept on her server;
// every feature asks the one gate (js/core/gate.js), nothing here does its own check

let comfortMsgT = 0;
function comfortMsg(t, err) {
  const m = document.getElementById('comfortMsg');
  if (!m) return;
  m.textContent = t;
  m.classList.toggle('err', !!err);
  clearTimeout(comfortMsgT);
  comfortMsgT = setTimeout(() => { m.textContent = ''; }, 4000);
}
async function setComfort(patch) {
  try { await Gate.saveComfort(patch); } catch (e) {
    comfortMsg(e.message === 'confirm_adult' ? 'Confirm you\'re 18 or older first.' : 'Couldn\'t save that. Is she running?', true);
  }
  drawComfort();
}
async function loadComfort() {
  drawComfort();
  await Gate.loadComfort();
  drawComfort();
}
Gate.onComfort(() => { if (current === 'comfort') drawComfort(); });

function drawComfort() {
  const c = Gate.comfort();
  const fl = Gate.FLAVORS.find(f => f[0] === c.flavor) || Gate.FLAVORS[0];
  const flavorHost = document.getElementById('flavorRows');
  flavorHost.innerHTML = '';
  flavorHost.append(
    row('What you are to each other', fl[2],
      Controls.choiceCtl(Gate.FLAVORS.map(f => [f[0], f[1]]), c.flavor, (v) => setComfort({ flavor: v })), 'comfort:flavor'),
    row('Keep it where it is', 'She won\'t bring up becoming something more. You can still change it here.',
      Controls.switchCtl(c.flavorLock, (v) => setComfort({ flavorLock: v })), 'comfort:flavorLock'),
  );
  if (c.flavor === 'siblings') {
    flavorHost.append(row('Flirty and 18+ as siblings', 'Off by default. Made by you in the makers; both adults, always.',
      Controls.switchCtl(c.siblingsRated, (v) => setComfort({ siblingsRated: v })), 'comfort:siblingsRated'));
  }

  const host = document.getElementById('ratingRows');
  host.innerHTML = '';
  const locked = (tier) => {
    const r = Gate.check({ tier }, { comfort: { ...c, flirty: true, adult: true, adultConfirmed: true, adultOutside: true }, mode: 'windowed', stage: 6, trust: 100 });
    return r.show ? '' : r.words;
  };
  const flirtyLock = locked('flirty');
  const fr = row('Flirty moments', flirtyLock || 'Teasing, butt swats, thigh rubs. Always with her say, by your bond.',
    Controls.switchCtl(c.flirty && !flirtyLock, (v) => setComfort({ flirty: v }), !!flirtyLock), 'comfort:flirty');
  if (flirtyLock) fr.classList.add('off');
  host.appendChild(fr);

  const adultLock = locked('adult');
  const adultCtl = document.createElement('div');
  adultCtl.className = 'adds';
  if (!c.adult && !c.adultConfirmed && !adultLock) {
    // the first time: he says he's 18 or older, plainly, with one more click
    adultCtl.appendChild(Controls.buttonCtl('Turn on…', (e) => {
      const b = e.currentTarget;
      b.replaceWith(Controls.buttonCtl('I\'m 18 or older, turn it on', () => setComfort({ adult: true, confirmAdult: true }), { accent: true }));
    }));
  } else {
    adultCtl.appendChild(Controls.switchCtl(c.adult && !adultLock, (v) => setComfort({ adult: v }), !!adultLock));
  }
  const ar = row('18+', adultLock || (c.adultConfirmed ? 'Made in the makers, by you or in packs you add.' : 'Made in the makers, by you or in packs you add. Off until you confirm you\'re 18 or older.'), adultCtl, 'comfort:adult');
  if (adultLock) ar.classList.add('off');
  host.appendChild(ar);
  if (c.adult && !adultLock) {
    host.appendChild(row('18+ outside her window', 'Off: 18+ stays in her window, never on the desktop or in compact.',
      Controls.switchCtl(c.adultOutside, (v) => setComfort({ adultOutside: v })), 'comfort:adultOutside'));
  }
  soon();
}

// ---------------------------------------------------------------
// new things after an update: surprise me / ask me / keep them off, and the "what's new" card

function drawNewPolicy() {
  const host = document.getElementById('newFeatRows');
  if (!host) return;
  host.innerHTML = '';
  host.appendChild(row('New things after an update', 'When an update brings something new for her: on as she comes, a short card first, or kept off.',
    Controls.choiceCtl(F.POLICIES, F.policy(), (v) => { F.setPolicy(v); }), 'local:jun.features.policy'));
}
async function whatsNew() {
  F.firstRun();
  const fresh = F.unseen();
  const card = document.getElementById('newCard');
  if (!fresh.length || !card) return;
  const pol = F.policy();
  // keep them off: switch off what can be switched off here, and say so
  if (pol === 'off') for (const f of fresh) if (f.key && Stores.canWrite(f.key)) await Stores.write(f.key, typeof Stores.defaultOf(f.key) === 'number' ? 0 : false);
  card.innerHTML = '';
  const h = document.createElement('b');
  h.textContent = pol === 'off' ? 'New, and kept off for now' : pol === 'ask' ? 'New for her. Want these?' : 'New for her';
  card.appendChild(h);
  for (const f of fresh) {
    const ctl = pol === 'ask' && f.key && Stores.canWrite(f.key) && F.kindOf(f.key) === 'feature'
      ? Controls.switchCtl(Stores.isOn(f.id), (v) => Stores.write(f.key, v)) : null;
    card.appendChild(row(f.name, f.line, ctl));
  }
  card.appendChild(Controls.buttonCtl('Got it', () => { F.markSeen(fresh.map(f => f.id)); card.hidden = true; }, { accent: true }));
  card.hidden = false;
}

// ---------------------------------------------------------------
// Console helpers for the owner's own debugging (F12 > Console): find a setting by its plain
// name and switch it. jun.find('glow')  jun.set('glow', false)  jun.set('walks around', 85)

// a setting by any name he'd use: the feature's name, a row title he sees ("Engine"), or its key.
// needKey: only things jun.set can switch. → { f, key } (key = that exact setting, maybe one of f.more)
function pickSetting(q, needKey) {
  const t = String(q || '').toLowerCase().trim();
  if (!t) return null;
  const all = F.all().filter(f => !needKey || f.key);
  const byName = all.find(f => f.id === t || f.name.toLowerCase() === t || (f.key || '').toLowerCase() === t);
  if (byName) return { f: byName, key: byName.key };
  // a row title on the page ("Engine", "Master volume"): its own key
  for (const r of document.querySelectorAll('main .row[data-feature]:not(.res)')) {
    const title = (r.querySelector('.what b')?.textContent || '').toLowerCase().trim();
    if (title && (title === t || title.startsWith(t))) {
      const f = F.get(r.dataset.feature), key = Controls.keyOfRow(r);
      if (f && (!needKey || key)) return { f, key: key || f.key, row: r };
    }
  }
  const near = all.find(f => f.name.toLowerCase().includes(t)) || F.search(t).find(f => !needKey || f.key);
  return near ? { f: near, key: near.key } : null;
}
const pickFeature = (q) => pickSetting(q, true)?.f || null;
// her window's settings can be read and set from here too, while her window is open
Stores.setMirrorIO({ open: HerWin.herOpen, get: HerWin.mirrorValue, set: HerWin.setMirror });

const STORE_WORDS = {
  fx: 'touch feedback picks (desktop.fx in this app\'s storage)', desk: 'the desktop app (desktop.json)',
  size: 'the desktop app (desktop.json)', app: 'the desktop app (shortcuts / desktop.json)',
  mirror: 'her window\'s own settings', theme: 'your colors (desktop.theme)', comfort: 'her server (Comfort & ratings)',
  local: 'this app\'s storage', feature: 'this app\'s storage (jun.features)', env: 'her .env file (not changed from Settings)',
  server: 'her server (shown, not a setting)',
};
const shown = (v) => (v === undefined ? '(not known here)' : JSON.stringify(v));

window.jun = {
  help() {
    console.log('jun.find("glow")             list settings that match, with their value now');
    console.log('jun.find()                   list every setting');
    console.log('jun.set("glow", false)       switch one off (true = on)');
    console.log('jun.set("walks around", 85)  how-often settings take 0 to 100');
    console.log('jun.why("engine")            why a setting is the way it is (greyed out? paused? stored where?)');
    console.log('jun.changed()                every setting you changed from how she comes');
    console.log('jun.state()                  a quick check-up: what is connected, what is on');
    console.log('jun.reset("touch")           a whole section back to how she comes');
    return 'Names are the ones you see in Settings. Her window\'s settings (voice, mic...) work while her window is open.';
  },
  find(q) {
    const list = (q ? F.search(q) : F.all()).filter(f => f.key);
    console.table(list.map(f => ({ name: f.name, now: Stores.peek(f.key), default: Stores.defaultOf(f.key),
      'can set here': Stores.canWrite(f.key) ? 'yes' : 'no, click it in Settings', section: NAMES[f.section] || f.section })));
    return list.length + ' found';
  },
  async set(q, value) {
    const hit = pickSetting(q, true);
    if (!hit) return 'No setting called "' + q + '". Try jun.find("' + q + '")';
    const f = { ...hit.f, key: hit.key || hit.f.key };
    if (!Stores.canWrite(f.key)) {
      if (F.kindOf(f.key) === 'mirror') return '"' + f.name + '" lives in her window: open her window, then try again.';
      return '"' + f.name + '" can only be changed by clicking it in Settings > ' + (NAMES[f.section] || f.section);
    }
    const before = Stores.peek(f.key);
    try { await Stores.write(f.key, value); } catch (e) { return 'Could not change "' + f.name + '": ' + e.message; }
    await loadDesk();
    buildFeedback();
    if (current === 'comfort') drawComfort();
    soon();
    const label = hit.row ? hit.row.querySelector('.what b')?.textContent || f.name : f.name;
    return '"' + label + '": ' + JSON.stringify(before) + ' -> ' + JSON.stringify(Stores.peek(f.key));
  },
  why(q) {
    const hit = pickSetting(q, false);
    if (!hit) return 'No setting called "' + q + '". Try jun.find("' + q + '")';
    const f = { ...hit.f, key: hit.key || hit.f.key };
    const say = (t) => console.log(t);
    if (hit.row) say('— Row "' + hit.row.querySelector('.what b')?.textContent + '" is part of "' + f.name + '"');
    say('— ' + f.name + ': ' + f.line);
    say('Where: Settings > ' + (NAMES[f.section] || f.where || f.section));
    if (f.key) {
      say('Stored in: ' + (STORE_WORDS[F.kindOf(f.key)] || F.kindOf(f.key)) + '  [' + f.key + ']');
      say('Now: ' + shown(Stores.peek(f.key)) + '   How she comes: ' + shown(Stores.defaultOf(f.key)));
      say('Can jun.set change it right now: ' + (Stores.canWrite(f.key) ? 'yes'
        : F.kindOf(f.key) === 'mirror' ? 'no, open her window first' : F.kindOf(f.key) === 'desk' ? 'no, the desktop app isn\'t connected' : 'no, click it in Settings'));
    } else say('No switch: it is a touch or something she does. Its How to play / where line says how to use it.');
    for (const n of (f.needs || []).map(F.get)) say('Needs "' + n.name + '": ' + (Stores.isOn(n.id) ? 'on, fine' : 'OFF, so this is paused'));
    for (const n of (f.pausedBy || []).map(F.get)) say('Paused while "' + n.name + '" is on: ' + (Stores.isOn(n.id) ? 'it IS on, so this is paused' : 'it is off, fine'));
    if (f.tier !== 'everyday') {
      const g = Gate.check({ tier: f.tier }, { comfort: Gate.comfort(), mode: 'desktop', stage: 6, trust: 100 });
      say('Rating: ' + f.tier + '. ' + (g.show ? 'Allowed by your Comfort & ratings choices.' : 'Blocked: ' + g.words));
    }
    if (f.modes) say('Works in: ' + f.modes.join(', ') + (f.fallback ? '. Elsewhere: ' + f.fallback : ''));
    const rowEls = hit.row ? [hit.row] : [...document.querySelectorAll('.row[data-feature="' + f.id + '"]')];
    for (const r of rowEls) {
      const title = r.querySelector('.what b')?.textContent || '?';
      const bits = [];
      if (r.classList.contains('off')) bits.push(r.classList.contains('mirror-row') ? 'greyed: her window greys it (its main switch is off, or her window is closed)' : 'greyed: not available here');
      if (r.classList.contains('paused')) bits.push('dimmed: paused (see Needs / Paused above)');
      if (r.dataset.more === '1' && document.body.classList.contains('layer-simple') && !r.parentElement?.classList.contains('folds-open')) bits.push('hidden behind "More settings" (Simple view)');
      const dis = r.querySelectorAll('input:disabled, select:disabled, button:disabled').length;
      if (dis) bits.push(dis + ' control(s) locked');
      say('Row "' + title + '": ' + (bits.length ? bits.join('; ') : 'normal'));
    }
    return 'That\'s everything known about "' + f.name + '".';
  },
  changed() {
    const out = [];
    for (const f of F.all()) {
      for (const key of [f.key, ...(f.more || [])].filter(Boolean)) {
        const d = Stores.defaultOf(key), now = Stores.peek(key);
        if (d === undefined || now === undefined || JSON.stringify(now) === JSON.stringify(d)) continue;
        out.push({ name: f.name, setting: key, now, 'how she comes': d });
      }
    }
    if (out.length) console.table(out);
    return out.length ? out.length + ' setting(s) changed from how she comes' : 'Everything is how she comes.';
  },
  state() {
    const c = Gate.comfort();
    console.log('Desktop app connected: ' + (deskState ? 'yes' : 'NO (desktop settings can\'t change)'));
    console.log('Her window open: ' + (HerWin.herOpen() ? 'yes' : 'no (her window\'s settings greyed out here)'));
    console.log('What you are to each other: ' + c.flavor + '. Flirty: ' + (c.flirty ? 'on' : 'off') + '. 18+: ' + (c.adult ? 'on' : 'off'));
    console.log('Settings view: ' + (F.layer() === 'all' ? 'Everything' : 'Simple (extras behind "More settings")'));
    if (deskState?.desk?.quiet) console.log('Quiet mode is ON: she won\'t wander or talk on her own.');
    return window.jun.changed();
  },
  async reset(sec) {
    if (!SECTIONS.includes(sec)) return 'Sections: ' + SECTIONS.join(', ');
    const n = await Stores.resetSection(sec);
    await loadDesk();
    buildFeedback();
    soon();
    return n + ' setting(s) back to default in ' + NAMES[sec];
  },
};
console.info('Jun: type jun.help() for the settings commands.');

// her window's settings (mirrors), her bond and memories, the account: js/home/herwin.js
HerWin.wire();
HerWin.setOnChange(() => { soon(); if (searchBox.value.trim()) runSearch(); });
HerWin.startMirrors();
HerWin.loadAccount();
loadDesk();
drawNewPolicy();
Gate.loadComfort();
whatsNew();
show(decodeURIComponent(location.hash.slice(1)) || 'help');
