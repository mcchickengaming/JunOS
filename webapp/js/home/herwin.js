// the settings home's sections that used to live in her window's Settings drawer (tidy step 2):
//
//  - mirrors: names, chat, voice and mic rows are her window's OWN controls, shown here live through
//    js/app/home-bridge.js (BroadcastChannel 'jun-settings'). Changing one here changes it there, so all
//    of her window's handlers keep working. With her window closed these show a way to open it.
//  - Her: bond, the gauges, today's / all-time touches, her memories (the same memory map as before,
//    js/app/memory-graph.js) and the timeline (js/app/timeline.js), straight from the server.
//  - Account & advanced: about, privacy, password, game bridge, developer access, rated replies,
//    factory reset, sign out; developer tools open in her own window (they show her live).

import * as Auth from '../core/auth.js?v=1';
import * as Prefs from '../core/prefs.js?v=7';
import { loadTimeline } from '../app/timeline.js?v=3';

const D = window.junDesktop || null;
const $ = (id) => document.getElementById(id);
let onChange = () => {};
export function setOnChange(fn) { onChange = fn || (() => {}); }

// ---------------------------------------------------------------
// mirrors of her window's rows

const chan = 'BroadcastChannel' in window ? new BroadcastChannel('jun-settings') : null;
let rows = null;          // null = her window hasn't answered (closed)
let lastSig = '';
let byeTimer = null;
// which host a mirrored row goes in (home-bridge.js MIRROR groups, idle nudges joins "speaks up")
const HOST_OF = (r) => (r.key === 'devNoIdleChk' ? 'speak' : r.group);

function post(m) { try { chan?.postMessage(m); } catch (e) {} }

function controlEl(c, r) {
  let el;
  if (c.kind === 'check') {
    el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = !!c.value;
    el.addEventListener('change', () => post({ type: 'set', id: c.id, value: el.checked }));
  } else if (c.kind === 'select') {
    el = document.createElement('select');
    el.className = 'btn';
    for (const o of c.options) {
      const op = document.createElement('option');
      op.value = o.v; op.textContent = o.t; op.disabled = !!o.off;
      el.appendChild(op);
    }
    el.value = c.value;
    el.addEventListener('change', () => post({ type: 'set', id: c.id, value: el.value }));
  } else if (c.kind === 'range') {
    const wrap = document.createElement('div');
    wrap.className = 'mirror-range';
    el = document.createElement('input');
    el.type = 'range';
    el.min = String(c.min); el.max = String(c.max); el.step = String(c.step || 1);
    el.value = String(c.value);
    const out = document.createElement('span');
    out.className = 'pct';
    out.textContent = r.out || '';
    // live while dragging (her window turns the volume / shows the number as it goes)
    let t = 0;
    el.addEventListener('input', () => { if (Date.now() - t > 120) { t = Date.now(); post({ type: 'set', id: c.id, value: el.value }); } });
    el.addEventListener('change', () => post({ type: 'set', id: c.id, value: el.value }));
    wrap.append(el, out);
    wrap.dataset.mid = c.id;
    el.dataset.mid = c.id;
    el.disabled = !!c.disabled;
    el.setAttribute('aria-label', c.label || r.title);
    return wrap;
  } else if (c.kind === 'button') {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn';
    el.textContent = c.label || 'Go';
    el.addEventListener('click', () => post({ type: 'set', id: c.id }));
  } else {
    el = document.createElement('input');
    el.type = 'text';
    el.className = 'mirror-text';
    el.value = c.value;
    el.placeholder = c.placeholder || '';
    if (c.maxlength) el.maxLength = c.maxlength;
    el.addEventListener('change', () => post({ type: 'set', id: c.id, value: el.value }));
  }
  el.dataset.mid = c.id;
  el.disabled = !!c.disabled;
  if (c.kind !== 'button') el.setAttribute('aria-label', c.label || r.title);
  return el;
}

function rowEl(r) {
  const row = document.createElement('div');
  // a lone switch or button stays on the line; dropdowns, sliders and boxes may take the next one in a small window
  const wide = r.controls.filter(c => !c.hidden).some(c => c.kind === 'select' || c.kind === 'range' || c.kind === 'text');
  row.className = 'row mirror-row' + (wide ? ' wide' : '') + (r.dim ? ' off' : '');
  row.dataset.key = r.key;
  const what = document.createElement('div');
  what.className = 'what';
  const b = document.createElement('b');
  b.textContent = r.title;
  if (r.state) { const p = document.createElement('em'); p.className = 'pill'; p.textContent = r.state; b.append(' ', p); }
  const s = document.createElement('span');
  s.textContent = r.desc;
  what.append(b, s);
  const box = document.createElement('div');
  box.className = 'mirror-ctl';
  for (const c of r.controls) if (!c.hidden) box.appendChild(controlEl(c, r));
  row.append(what, box);
  return row;
}

// same rows, new values: patch in place so a slider being dragged or a box being typed in isn't reset
function patch() {
  for (const r of rows) {
    const row = document.querySelector(`.mirror-row[data-key="${r.key}"]`);
    if (!row) continue;
    row.classList.toggle('off', !!r.dim);
    const pill = row.querySelector('.pill');
    if (pill) pill.textContent = r.state;
    for (const c of r.controls) {
      const el = row.querySelector(`[data-mid="${c.id}"]:not(div)`);
      if (!el || el === document.activeElement) continue;
      el.disabled = !!c.disabled;
      if (c.kind === 'check') el.checked = !!c.value;
      else if (c.kind !== 'button') el.value = String(c.value);
    }
    const out = row.querySelector('.mirror-range .pct');
    if (out) out.textContent = r.out || '';
  }
}

function drawMirrors() {
  const hosts = [...document.querySelectorAll('[data-mirror]')];
  if (!rows) {
    for (const h of hosts) {
      h.innerHTML = '';
      const r = document.createElement('div');
      r.className = 'row mirror-closed';
      const what = document.createElement('div');
      what.className = 'what';
      what.innerHTML = '<b>Her window is closed</b><span>These live in her window. Open it and they show up here.</span>';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.textContent = 'Open her window';
      b.disabled = !D?.desk;
      b.addEventListener('click', () => D?.desk?.('openWindow'));
      r.append(what, b);
      h.appendChild(r);
    }
    lastSig = '';
    onChange();
    return;
  }
  // structure (which rows, which controls, which options) vs values
  const sig = JSON.stringify(rows.map(r => [r.key, r.hidden, r.title, r.controls.map(c => [c.id, c.kind, c.hidden, c.options && c.options.map(o => o.v + o.t)])]));
  if (sig === lastSig) { patch(); onChange(); return; }
  lastSig = sig;
  const focus = document.activeElement?.dataset?.mid;
  for (const h of hosts) h.innerHTML = '';
  for (const r of rows) {
    if (r.hidden) continue;
    const h = document.querySelector(`[data-mirror="${HOST_OF(r)}"]`);
    if (h) h.appendChild(rowEl(r));
  }
  if (focus) document.querySelector(`[data-mid="${focus}"]:not(div)`)?.focus();
  onChange();
}

if (chan) {
  chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'rows' && Array.isArray(m.rows)) { clearTimeout(byeTimer); rows = m.rows; drawMirrors(); }
    else if (m.type === 'bye') {
      // a reload says bye too, give it a moment to come back
      clearTimeout(byeTimer);
      byeTimer = setTimeout(() => { rows = null; drawMirrors(); post({ type: 'hello' }); }, 2500);
    }
  };
}

export function startMirrors() {
  drawMirrors();
  post({ type: 'hello' });
}
export function hello() { post({ type: 'hello' }); }

// for the Console helpers (stores.js): is her window answering, a mirrored control's value, set one
export const herOpen = () => rows !== null;
export function mirrorValue(id) {
  for (const r of rows || []) for (const c of r.controls || []) if (c.id === id) return c.value;
  return undefined;
}
export function setMirror(id, value) {
  if (rows === null) return false;
  post({ type: 'set', id, value });
  return true;
}

// ask her window (opening it first if it's closed) to open its developer tools
function openHerDrawer(panel) {
  try { localStorage.setItem('jun.home.want', JSON.stringify({ drawer: panel, t: Date.now() })); } catch (e) {}
  if (rows) post({ type: 'drawer', panel });
  D?.desk?.('openWindow');
}

// ---------------------------------------------------------------
// Her: bond, gauges, touches

const tz = () => -new Date().getTimezoneOffset();

function paintGauge(k, v) {
  const row = document.querySelector(`.mood-row--${k}`);
  if (!row) return;
  const t = Math.max(0, Math.min(1, v / 100));
  const gauge = getComputedStyle(row).getPropertyValue('--gauge').trim() || '#e58cd2';
  row.style.setProperty('--fill', t * 100 + '%');
  row.style.setProperty('--fill-color', `color-mix(in srgb, ${gauge} ${Math.round((0.25 + 0.75 * t) * 100)}%, var(--track-empty))`);
  row.querySelector('.mood-val').textContent = String(Math.round(v));
}

async function loadBond() {
  try {
    const r = await fetch('api/relationship.php', { credentials: 'same-origin' });
    if (!r.ok) return;
    const s = await r.json();
    const b = s.bond;
    if (b && typeof b.stage === 'number') {
      $('bondBlock').hidden = false;
      $('bondStage').textContent = b.name;
      $('bondStep').textContent = `${b.stage} / ${b.stages}`;
      const span = b.next_xp === null ? 1 : Math.max(1, b.next_xp - b.stage_xp);
      const pct = b.next_xp === null ? 100 : Math.min(100, Math.round(((b.xp - b.stage_xp) / span) * 100));
      $('bondFill').style.width = pct + '%';
      $('bondNext').textContent = b.next_name ? `Spend time together to reach ${b.next_name}.` : 'As close as two people get.';
    }
    $('gaugeBlock').hidden = false;
    for (const k of ['affection', 'trust', 'tension']) if (typeof s[k] === 'number') paintGauge(k, s[k]);
  } catch (e) {}
}

async function loadTouches() {
  try {
    const r = await fetch('api/touch.php?tz=' + tz(), { credentials: 'same-origin' });
    if (!r.ok) return;
    const t = await r.json();
    $('touchBlock').hidden = false;
    const list = $('touchToday');
    list.textContent = '';
    for (const line of t.items || []) {
      const li = document.createElement('li');
      li.textContent = line + '.';
      list.appendChild(li);
    }
    $('touchEmpty').hidden = (t.items || []).length > 0;
    $('touchForget').hidden = !(t.items || []).length;
    $('touchOff').hidden = t.enabled !== false;
    const all = t.all_time || [];
    $('touchAllWrap').hidden = !all.length;
    const allList = $('touchAll');
    allList.textContent = '';
    for (const row of all) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = row.label;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = Number(row.n).toLocaleString();
      const next = document.createElement('span');
      next.className = 'next';
      next.textContent = row.next ? `next milestone: ${Number(row.next).toLocaleString()}` : '';
      li.append(label, n, next);
      allList.appendChild(li);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------
// Her: memories (the same memory map as her window had)

let MemoryGraph = null;
let isAdmin = false;
async function loadMemories() {
  try {
    if (!MemoryGraph) {
      MemoryGraph = await import('../app/memory-graph.js?v=7');
      const { renderNoteActions } = await import('../app/memory-actions.js?v=3');
      MemoryGraph.onNoteActions((node, body) => renderNoteActions(node, body, { isAdmin, reload: loadMemories }));
      // "open the chat" happens in her window
      MemoryGraph.onOpenChat((conv, messageId) => { post({ type: 'open-chat', conv, messageId }); if (!rows) D?.desk?.('openWindow'); });
    }
    MemoryGraph.setActive(true);
    MemoryGraph.setStatus('Loading…');
    const r = await fetch('api/memory.php', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    $('memoryCount').textContent = Array.isArray(data.notes) ? data.notes.length : 0;
    MemoryGraph.setData(data);
  } catch (e) {
    MemoryGraph?.setStatus('Could not load memories.');
  }
}

async function addMemory() {
  const input = $('memoryAddInput');
  const memory = (input.value || '').trim();
  if (!memory) return;
  try {
    const r = await fetch('api/memory.php', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memory, category: ($('memoryAddCategory').value || '').trim() || 'general' }),
    });
    if (r.ok) input.value = '';
  } catch (e) {}
  loadMemories();
}

// a danger button asks twice instead of a pop-up: "Delete all" → "Sure? Click again"
function twoStep(btn, sure, run) {
  const label = btn.textContent;
  let armed = 0;
  btn.addEventListener('click', async () => {
    if (Date.now() - armed > 4000) {
      armed = Date.now();
      btn.textContent = sure;
      btn.classList.add('armed');
      setTimeout(() => { if (Date.now() - armed >= 4000) { btn.textContent = label; btn.classList.remove('armed'); } }, 4100);
      return;
    }
    armed = 0;
    btn.textContent = label;
    btn.classList.remove('armed');
    btn.disabled = true;
    try { await run(); } finally { btn.disabled = false; }
  });
}

export function loadHer() {
  loadBond();
  loadTouches();
  loadMemories();
  loadTimeline();
}
export function leaveHer() { MemoryGraph?.setActive(false); }

// ---------------------------------------------------------------
// Account & advanced

function showBridge(st) {
  $('bridgeRow').hidden = !st.enabled;
  const paired = !!st.paired_at;
  $('bridgeUnpairBtn').hidden = !paired;
  $('bridgePairBtn').textContent = paired ? 'New token' : 'Pair';
  $('bridgeDesc').textContent = !paired ? 'Not paired. Signing in from the game pairs it.'
    : st.synced_at ? `Last synced ${new Date(st.synced_at * 1000).toLocaleString()}.` : 'Paired, no sync yet.';
}
async function loadBridge() {
  try {
    const r = await fetch('api/bridge-pair.php', { credentials: 'same-origin' });
    if (r.ok) showBridge(await r.json());
  } catch (e) {}
}

function forgetLocal() {
  Prefs.clearLocal();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('draft.')) localStorage.removeItem(k); } catch (e) {}
}

export async function loadAccount() {
  try {
    const u = await Auth.me();
    isAdmin = u?.role === 'admin' || u?.user?.role === 'admin';
  } catch (e) {}
  document.documentElement.classList.toggle('is-admin', isAdmin);
  $('devToolsRow').hidden = !isAdmin;
  $('ratingsRow').hidden = !isAdmin;
  $('memoryClearBtn').hidden = !isAdmin;
  $('devKeyBox').hidden = isAdmin;
  $('promoteBtn').hidden = isAdmin;
  $('devAccessDesc').textContent = isAdmin ? 'Developer access is on for this account.' : "Enter this server's developer key to unlock developer tools.";
  loadBridge();
  onChange();
}

function wireAccount() {
  $('privacyBtn').addEventListener('click', () => {
    const f = $('privacyFrame');
    if (!f.src) f.src = 'privacy.html';
    f.hidden = !f.hidden;
    $('privacyBtn').textContent = f.hidden ? 'Show' : 'Hide';
  });
  $('devToolsBtn').addEventListener('click', () => openHerDrawer('developer'));
  $('ratingsBtn').addEventListener('click', () => { location.href = 'api/ratings.php?action=export'; });
  $('promoteBtn').addEventListener('click', async () => {
    const btn = $('promoteBtn');
    btn.disabled = true;
    try {
      const r = await fetch('api/auth.php?action=promote', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: $('devKeyInput').value || '' }),
      });
      if (r.ok) { post({ type: 'reload' }); await loadAccount(); btn.disabled = false; return; }
      const j = await r.json().catch(() => ({}));
      const msgs = { invalid_dev_key: 'Wrong key.', dev_promotion_disabled: 'Developer access is disabled on this server.', rate_limit_exceeded: 'Too many tries. Wait a bit.' };
      $('devAccessDesc').textContent = msgs[j.error] || (r.status === 429 ? msgs.rate_limit_exceeded : 'Could not unlock developer access.');
    } catch (e) { $('devAccessDesc').textContent = 'Network error.'; }
    btn.disabled = false;
  });
  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc = $('passwordDesc');
    const btn = $('changePasswordBtn');
    const msgs = { invalid_credentials: 'Current password is wrong.', password_too_short: 'New password needs at least 8 characters.', rate_limit_exceeded: 'Too many tries, wait an hour.' };
    btn.disabled = true;
    try {
      const r = await fetch('api/auth.php?action=change_password', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: $('currentPasswordInput').value, password: $('newPasswordInput').value }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { $('passwordForm').reset(); desc.textContent = 'Changed. Other devices are signed out.'; }
      else desc.textContent = msgs[j.error] || 'Could not change the password.';
    } catch (err) { desc.textContent = 'Network error.'; }
    btn.disabled = false;
  });
  $('bridgePairBtn').addEventListener('click', async () => {
    const btn = $('bridgePairBtn');
    btn.disabled = true;
    try {
      const r = await fetch('api/bridge-pair.php', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error('http ' + r.status);
      await loadBridge();
      const tok = $('bridgeTokenInput');
      tok.value = j.token; tok.hidden = false; tok.select();
      $('bridgeDesc').textContent = "Paste it as Token under [Sync] in the mod's UserData/JunBridge.cfg. It only shows once.";
    } catch (e) { $('bridgeDesc').textContent = 'Could not pair.'; }
    btn.disabled = false;
  });
  $('bridgeUnpairBtn').addEventListener('click', async () => {
    try { await fetch('api/bridge-pair.php', { method: 'DELETE', credentials: 'same-origin' }); } catch (e) {}
    $('bridgeTokenInput').hidden = true;
    loadBridge();
  });
  twoStep($('factoryResetBtn'), 'Sure? Click again to erase everything', async () => {
    const r = await fetch('api/auth.php?action=factory_reset', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    if (!r || !r.ok) { $('resetDesc').textContent = 'Factory reset failed. Nothing was erased.'; return; }
    forgetLocal();
    // her inside state (core feel: needs, what she's tired of, her favorites) starts over too
    try { localStorage.removeItem('jun.feel'); } catch (e) {}
    // … and any delve in progress or just finished (#32)
    try { localStorage.removeItem('jun.delve'); } catch (e) {}
    post({ type: 'reload' });
    location.reload();
  });
  twoStep($('signOutBtn'), 'Sure? Click again to sign out', async () => {
    forgetLocal();
    try { await Auth.logout(); } catch (e) {}
    post({ type: 'reload' });
    location.reload();
  });
}

function wireHer() {
  $('touchForget').addEventListener('click', async () => {
    try { await fetch('api/touch.php?tz=' + tz(), { method: 'DELETE', credentials: 'same-origin' }); } catch (e) {}
    loadTouches();
  });
  $('memoryAddBtn').addEventListener('click', addMemory);
  $('memoryAddInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMemory(); });
  twoStep($('memoryClearBtn'), 'Sure? Click again to delete them all', async () => {
    try {
      await fetch('api/memory.php', { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) });
    } catch (e) {}
    loadMemories();
  });
}

export function wire() {
  wireHer();
  wireAccount();
}
