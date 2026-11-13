// the standard controls of the settings home (foundations #31 (2)). Every settings row is one of
// these, so every feature gets the same look and feel: switch, how-often / how-much (often.js:
// the named steps AND a slider for any percent), choice (with "she decides" where it fits),
// slider, button. Colors use the closet's picker (wardrobe/color-picker.js) directly.
//
// decorate(root) is the registry pass: it finds each row's feature (data/features.json), and
// gives it the Simple/Everything layer ("More" folds), plain-words notes ("Off, this also
// pauses…", "Paused: needs … on.") and its search words. Rows are tagged by data-fkey, or found by
// their control (data-fx), or by data-key (desk switches, mirrored rows).

import * as Often from '../desktop/often.js?v=2';
import * as F from '../core/features.js?v=3';
import * as Stores from './stores.js?v=4';

export function row(title, hint, control, fkey) {
  const r = document.createElement('div');
  r.className = 'row';
  const what = document.createElement('div');
  what.className = 'what';
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = hint || '';
  what.append(b, s);
  r.append(what);
  if (control) r.append(control);
  if (fkey) r.dataset.fkey = fkey;
  return r;
}

export function switchCtl(on, onChange, disabled) {
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = !!on;
  c.disabled = !!disabled;
  c.addEventListener('change', () => onChange(c.checked));
  return c;
}

// list: [[value, name]...]. decide: a name for the "she decides" choice (value 'decide'), or nothing
export function choiceCtl(list, value, onChange, { decide, disabled } = {}) {
  const sel = document.createElement('select');
  sel.className = 'btn';
  const all = decide ? [...list, ['decide', decide]] : list;
  for (const [v, name] of all) {
    const o = document.createElement('option');
    o.value = String(v); o.textContent = name;
    sel.appendChild(o);
  }
  sel.value = String(value);
  sel.disabled = !!disabled;
  sel.addEventListener('change', () => {
    const hit = all.find(([v]) => String(v) === sel.value);
    onChange(hit ? hit[0] : sel.value);
  });
  return sel;
}

// a plain slider with its value beside it. live: onChange while it moves, else when let go
export function sliderCtl(value, { min = 0, max = 1, step = 0.05, fmt = (v) => String(v), live = true, disabled } = {}, onChange) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px';
  const r = document.createElement('input');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
  r.disabled = !!disabled;
  const out = document.createElement('span');
  out.className = 'pct';
  const show = () => { out.textContent = fmt(Number(r.value)); };
  show();
  r.addEventListener('input', () => { show(); if (live) onChange(Number(r.value)); });
  if (!live) r.addEventListener('change', () => onChange(Number(r.value)));
  wrap.append(r, out);
  return wrap;
}

// "how often" / "how much": the named steps in a dropdown AND a slider for any percent.
// onChange(percent) runs when he picks a step or lets go of the slider
export function oftenCtl(value, list, onChange, disabled) {
  const wrap = document.createElement('div');
  wrap.className = 'often';
  const sel = document.createElement('select');
  sel.className = 'btn';
  const own = document.createElement('option');
  own.value = 'own';
  sel.appendChild(own);
  for (const [v, name] of list) {
    const o = document.createElement('option');
    o.value = String(v); o.textContent = name;
    sel.appendChild(o);
  }
  const line = document.createElement('div');
  line.className = 'often-line';
  const r = document.createElement('input');
  r.type = 'range'; r.min = '0'; r.max = '100'; r.step = '1';
  r.setAttribute('aria-label', 'Percent');
  const out = document.createElement('span');
  out.className = 'pct';
  line.append(r, out);
  wrap.append(sel, line);
  const draw = (p) => {
    p = Math.round(Often.pct(p));
    r.value = String(p);
    out.textContent = p + '%';
    const step = list.some(([v]) => v === p);
    own.hidden = step;
    own.textContent = 'Your own (' + p + '%)';
    sel.value = step ? String(p) : 'own';
  };
  draw(value);
  sel.disabled = r.disabled = !!disabled;
  sel.addEventListener('change', () => { if (sel.value === 'own') return; draw(Number(sel.value)); onChange(Number(sel.value)); });
  r.addEventListener('input', () => draw(Number(r.value)));
  r.addEventListener('change', () => onChange(Number(r.value)));
  return wrap;
}

export function buttonCtl(text, onClick, { danger, accent, disabled } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (danger ? ' danger' : '') + (accent ? ' accent' : '');
  b.textContent = text;
  b.disabled = !!disabled;
  b.addEventListener('click', onClick);
  return b;
}

// ---------------------------------------------------------------
// the registry pass

const APP_KEYS = ['onTop', 'openAtStart', 'startWithWindows', 'calibrate'];
export function keyOfRow(r) {
  if (r.dataset.fkey) return r.dataset.fkey;
  const fx = r.querySelector('[data-fx]');
  if (fx) return 'fx:' + fx.dataset.fx;
  if (r.classList.contains('mirror-row') && r.dataset.key) return 'mirror:' + r.dataset.key;
  if (r.dataset.key) return (APP_KEYS.includes(r.dataset.key) ? 'app:' : 'desk:') + r.dataset.key;
  return '';
}

// each feature's search words, for rows the search finds
export function wordsOfRow(r) {
  const f = r.dataset.feature && F.get(r.dataset.feature);
  return f ? (f.words || []).join(' ') : '';
}

export function decorate(root = document) {
  const simple = F.layer() === 'simple';
  const hosts = new Set();
  for (const r of root.querySelectorAll('.row:not(.res)')) {
    const hit = F.ofKey(keyOfRow(r));
    r.querySelector(':scope > .what > .fnote')?.remove();
    if (!hit) { delete r.dataset.feature; delete r.dataset.more; continue; }
    r.dataset.feature = hit.f.id;
    r.dataset.more = hit.main ? '' : '1';
    if (!hit.main) hosts.add(r.parentElement);
    else r.parentElement && hosts.add(r.parentElement);
    // plain words about what depends on what
    let note = '';
    if (hit.main) {
      const needs = F.needsNote(hit.f.id, Stores.isOn);
      if (needs) note = needs;
      else if (!Stores.isOn(hit.f.id)) note = F.offNote(hit.f.id);
      else note = F.onNote(hit.f.id);
    }
    r.classList.toggle('paused', !!(hit.main && F.needsNote(hit.f.id, Stores.isOn)));
    if (note) {
      const n = document.createElement('span');
      n.className = 'fnote';
      n.textContent = note;
      r.querySelector(':scope > .what')?.appendChild(n);
    }
  }
  // "More settings" folds: in Simple, the extra rows of a group wait behind one button
  for (const h of root.querySelectorAll('.more-btn')) if (!hosts.has(h.parentElement)) h.remove();
  for (const host of hosts) {
    if (!host) continue;
    const extras = host.querySelectorAll(':scope > .row[data-more="1"]');
    const n = extras.length;
    // a single extra isn't worth a button: it just shows
    host.classList.toggle('folds-one', n === 1);
    if (n < 2) { host.querySelector(':scope > .more-btn')?.remove(); continue; }
    let btn = host.querySelector(':scope > .more-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn more-btn';
      btn.addEventListener('click', () => { host.classList.toggle('folds-open'); label(); });
    }
    const label = () => { btn.textContent = host.classList.contains('folds-open') ? 'Fewer settings' : 'More settings (' + n + ')'; };
    label();
    host.appendChild(btn); // always last
    btn.hidden = !simple || !n;
  }
  document.body.classList.toggle('layer-simple', simple);
}

// a hidden row he's looking for (search): open its fold
export function reveal(r) {
  if (r && r.dataset.more === '1') r.parentElement?.classList.add('folds-open');
  const btn = r?.parentElement?.querySelector(':scope > .more-btn');
  if (btn) btn.textContent = 'Fewer settings';
}
