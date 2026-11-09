// her window's side of the settings home (webapp/desktop-settings.html, tidy step 2).
//
// Her chat and voice settings stay HERE, wired exactly as before (wire-tts, wire-voice, settings.js):
// the home shows live mirrors of these rows and asks this window to change them, so every handler
// (engine → languages → voices, pushing prefs to the server...) keeps doing its job. Talk is a
// BroadcastChannel ('jun-settings'), same origin, any window of hers.
//
//   home → here: { type: 'hello' }                    → we answer with { type: 'rows', rows }
//                { type: 'set', id, value }           → set that control, fire its events, answer rows
//                { type: 'open-chat', conv, messageId } (a memory's "open the chat")
//                { type: 'reload' }                    (after sign out / factory reset in the home)
//                { type: 'drawer', panel }            (her developer tools stay in her own drawer)
//   here → home: { type: 'rows', rows } whenever something changes, { type: 'bye' } on pagehide
//
// In the desktop app her gear and user chip open the home; a plain browser / the phone keeps the drawer.

import * as ui from '../core/ui.js?v=1';
import { loadConversation, setSidebarOpen } from './sidebar.js?v=133';

const D = window.junDesktop || null;
// the rows the home mirrors, by section there. a row is found by its control's id
const MIRROR = {
  her: ['playerNameInput', 'botNameInput'],
  talk: ['modelSelect', 'reasoningSelect', 'thinkChk', 'reloadPromptBtn', 'devNoIdleChk', 'awayNotifyChk'],
  voice: ['siteVolume', 'ttsChk', 'ttsEngineSelect', 'ttsLangSelect', 'ttsVoiceSelect', 'ttsSpeed'],
  mic: ['voiceChk', 'voiceBargeChk', 'voiceHearAllChk', 'voiceSilence'],
};

let chan = null;

function rowOf(id) {
  const el = document.getElementById(id);
  return el ? el.closest('.set-row') : null;
}

function textOf(el) {
  if (!el) return '';
  const c = el.cloneNode(true);
  c.querySelectorAll('.voice-pill, [hidden]').forEach(n => n.remove());
  return c.textContent.replace(/\s+/g, ' ').trim();
}

function describeControl(el) {
  const base = { id: el.id, disabled: !!el.disabled, hidden: !!el.hidden, label: el.getAttribute('aria-label') || el.textContent.trim() };
  if (el.tagName === 'SELECT') {
    return { ...base, kind: 'select', value: el.value,
      options: [...el.options].map(o => ({ v: o.value, t: o.textContent, off: o.disabled })) };
  }
  if (el.tagName === 'BUTTON' || el.tagName === 'A') return { ...base, kind: 'button' };
  if (el.type === 'checkbox') return { ...base, kind: 'check', value: el.checked };
  if (el.type === 'range') return { ...base, kind: 'range', value: Number(el.value), min: Number(el.min || 0), max: Number(el.max || 100), step: el.step || '1' };
  return { ...base, kind: 'text', value: el.value, placeholder: el.placeholder || '', maxlength: el.maxLength > 0 ? el.maxLength : null };
}

function describe() {
  const rows = [];
  for (const [group, ids] of Object.entries(MIRROR)) {
    for (const id of ids) {
      const row = rowOf(id);
      if (!row) continue;
      const controlBox = row.querySelector('.set-row-control') || row;
      // every control in the row (a voice select + its Play button), plus the value label of a slider
      const controls = [...controlBox.querySelectorAll('input, select, button')].filter(c => c.id).map(describeControl);
      const out = controlBox.querySelector('output, .range-val, [id$="Val"]');
      rows.push({
        key: id, group,
        title: textOf(row.querySelector('.set-row-title')),
        desc: textOf(row.querySelector('.set-row-desc')),
        state: textOf(row.querySelector('.voice-pill')),
        hidden: row.hidden,
        dim: row.classList.contains('disabled'),
        out: out ? out.textContent.trim() : '',
        controls,
      });
    }
  }
  return rows;
}

let sendTimer = null;
function sendRows(delay = 60) {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => { try { chan?.postMessage({ type: 'rows', rows: describe() }); } catch (e) {} }, delay);
}

function setControl(id, value) {
  const el = document.getElementById(id);
  if (!el || el.disabled) return;
  const fire = (t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  if (el.tagName === 'BUTTON') { el.click(); }
  else if (el.type === 'checkbox') { if (el.checked !== !!value) { el.checked = !!value; fire('input'); fire('change'); } }
  else if (el.tagName === 'SELECT') { el.value = String(value); fire('input'); fire('change'); }
  else { el.value = String(value); fire('input'); fire('change'); }
  sendRows();
  sendRows(400); // some answers fill in a moment later (a new engine's voices)
}

function openDrawerAt(panel) {
  setSidebarOpen(false);
  ui.toggleDrawer(true);
  document.querySelector(`.settings-navitem[data-panel="${panel}"]`)?.click();
}

export function wire() {
  if (!('BroadcastChannel' in window)) return;
  chan = new BroadcastChannel('jun-settings');
  chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'hello') sendRows(0);
    else if (m.type === 'set') setControl(String(m.id || ''), m.value);
    else if (m.type === 'open-chat' && m.conv != null) { setSidebarOpen(false); loadConversation(m.conv, m.messageId ? { messageId: m.messageId } : null); }
    else if (m.type === 'reload') location.reload();
    else if (m.type === 'drawer' && m.panel) openDrawerAt(String(m.panel));
  };
  // anything that changes here (typing, the voice list filling in, a row greying out) reaches the home
  const watched = new Set();
  for (const ids of Object.values(MIRROR)) for (const id of ids) { const r = rowOf(id); if (r) watched.add(r); }
  const mo = new MutationObserver(() => sendRows(120));
  for (const r of watched) {
    mo.observe(r, { attributes: true, childList: true, subtree: true, characterData: true, attributeFilter: ['hidden', 'class', 'disabled'] });
    r.addEventListener('change', () => sendRows());
    r.addEventListener('input', () => sendRows(150));
  }
  window.addEventListener('pagehide', () => { try { chan.postMessage({ type: 'bye' }); } catch (e) {} });
  sendRows(0);

  // a request left for us while this window was still loading (the home opened her window to get here)
  try {
    const want = JSON.parse(localStorage.getItem('jun.home.want') || 'null');
    if (want && Date.now() - want.t < 30000) {
      localStorage.removeItem('jun.home.want');
      if (want.drawer) setTimeout(() => openDrawerAt(want.drawer), 800);
    }
  } catch (e) {}

  // in the desktop app the gear and the user chip open the settings home (one place for everything)
  if (D?.openSettings) {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#openSettingsBtn, #userChipBtn')) return;
      e.preventDefault();
      e.stopPropagation();
      setSidebarOpen(false);
      D.openSettings('her');
    }, true);
  }
}
