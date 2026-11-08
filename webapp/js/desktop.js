// the desktop app's frameless page (desktop/main.js opens it).
//   ?mode=compact  just her and a chat line, floating on top
//   ?mode=stepout  she's out on the desktop, on the taskbar: walks
//                  around, dozes off when he's away, gets carried
//                  around by the mouse
// talking to her here is the same chat as her window: his lines go
// into the most recent conversation. her reactions to the desktop
// itself (stepping out, going back in, waking up, being dropped)
// are ephemeral turns with an OOC stage direction, like date.js.
//
// window.junDesktop comes from desktop/preload.js. in a plain
// browser it's missing and this is just her, standing there.

import * as Auth from './core/auth.js?v=1';
import { api, apiJson } from './core/api.js?v=1';
import * as ChatAPI from './core/chat-api.js?v=7';
import * as Names from './core/names.js?v=1';
import * as Prefs from './core/prefs.js?v=7';
import { configureTts, say } from './core/speech-card.js?v=19';
import { localTimeString } from './core/util.js?v=1';
import * as Actions from './live2d/actions.js?v=99';
import { fitModel } from './live2d/camera.js?v=78';
import * as Live2D from './live2d/live2d.js?v=90';
import { S } from './live2d/state.js?v=75';
import * as Outfit from './outfit/outfit.js?v=99';

const D = window.junDesktop || null;
const params = new URLSearchParams(location.search);
const MODE = params.get('mode') === 'stepout' ? 'stepout' : 'compact';
const REASON = params.get('reason') || '';
document.documentElement.classList.add('mode-' + MODE);

const stageEl = document.getElementById('stage');
const talk = document.getElementById('talk');
const form = document.getElementById('talkForm');
const input = document.getElementById('talkInput');
const zzz = document.getElementById('zzz');
const note = document.getElementById('note');

const OOC = '(OOC stage direction, not spoken by Anon: ';
const NOTES = {
  stepout: `${OOC}you just climbed out of your app window and are now standing on the taskbar at the bottom of Anon's computer screen, out on his desktop. React out loud to being out here, one short line, in character. No narration.)`,
  inside: `${OOC}you are climbing back into your app window from Anon's desktop. Say one short line out loud as you go, in character. No narration.)`,
  wake: `${OOC}you dozed off on the taskbar while Anon was away from his computer, and he just came back. Wake up and say one short line out loud, in character. No narration.)`,
  dropped: `${OOC}Anon just grabbed you with his mouse cursor, carried you across his screen and dropped you back down on the taskbar. React out loud, one short line, in character. No narration.)`,
};
// only when her brain doesn't answer at all
const FALLBACK = {
  stepout: 'So this is what your desktop looks like. Bigger than I thought.',
  inside: "I'm heading back in. Don't miss me too much.",
  wake: "Mm... oh. You're back.",
  dropped: 'Hey! Warn me first!',
  talk: "Sorry, I zoned out for a second. Say that again?",
};

let ready = false;
let busy = false;
let dozing = false;
let dozeAt = 0;
let walking = false;
let lastReactAt = 0;
let drops = 0;

// ---------------------------------------------------------------
// her chat: the most recent conversation, same as her window

let conversationId = 0;
let history = [];

async function loadConversation() {
  try {
    const list = await api('conversations.php?action=list').then(r => (r.ok ? r.json() : []));
    let id = list.length ? Number(list[0].id) : 0;
    if (!id) {
      const made = await apiJson('conversations.php?action=create', {}).then(r => (r.ok ? r.json() : null));
      id = Number(made?.id) || 0;
    }
    if (id !== conversationId) {
      conversationId = id;
      const rows = id ? await api(`conversations.php?action=messages&id=${id}`).then(r => (r.ok ? r.json() : [])) : [];
      history = rows
        .filter(r => (r.role === 'user' || r.role === 'assistant') && r.content && r.content !== '<audio>')
        .slice(-20)
        .map(r => ({ role: r.role, content: r.content }));
    }
  } catch (e) {}
}

function turn(content, ephemeral) {
  return new Promise((resolve) => {
    if (!conversationId) return resolve('');
    let text = '';
    const messages = [...history, { role: 'user', content }];
    ChatAPI.chat(
      { messages, conversation_id: conversationId, ephemeral: !!ephemeral,
        client_time: localTimeString(), outfit_context: Outfit.describe() },
      {
        onToken: (t) => { text += t; },
        onRestart: () => { text = ''; },
        onDone: () => {
          // an ephemeral line isn't stored, so it stays out of the
          // history the next real message sends too
          if (!ephemeral) {
            history.push({ role: 'user', content });
            if (text.trim()) history.push({ role: 'assistant', content: text });
            history = history.slice(-20);
          }
          resolve(text);
        },
        onError: () => resolve(text),
      }
    );
  });
}

// her tags move her, the rest is what she says
function speak(raw, fallback) {
  for (const a of Actions.parseActions(raw)) Actions.applyAction(a);
  const spoken = Actions.stripActions(raw)
    .replace(/\[\s*A(?:CTIONS?)?\s*:[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ').replace(/^[\s,.;:]+/, '').trim();
  return say(Names.apply(spoken) || fallback);
}

async function ask(content, { ephemeral, fallback }) {
  busy = true;
  talk.classList.add('thinking');
  input.placeholder = '…';
  D?.stopWalk();
  try {
    if (!ephemeral || !conversationId) await loadConversation();
    const raw = await turn(content, ephemeral);
    talk.classList.remove('thinking');
    input.placeholder = 'Say something…';
    await speak(raw, fallback);
  } finally {
    busy = false;
    talk.classList.remove('thinking');
    input.placeholder = 'Say something…';
  }
}

// one short in-character line about what just happened on the
// desktop. never two in a row
async function react(kind) {
  if (!ready || busy) return;
  if (kind !== 'inside' && Date.now() - lastReactAt < 20000) return;
  lastReactAt = Date.now();
  await ask(NOTES[kind], { ephemeral: true, fallback: FALLBACK[kind] });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || !ready) return;
  input.value = '';
  if (dozing) wake(false);
  await ask(Names.canonicalize(text), { fallback: FALLBACK.talk });
  lastReactAt = Date.now();
  if (MODE === 'stepout') closeTalkSoon();
});

// ---------------------------------------------------------------
// the chat line. always there in compact, a tap away in stepout

let talkTimer = null;
function openTalk() {
  if (dozing) wake(true);
  talk.hidden = false;
  D?.stopWalk();
  D?.wantFocus(true);
  setTimeout(() => input.focus(), 30);
  closeTalkSoon();
}
function closeTalk() {
  if (MODE !== 'stepout') return;
  clearTimeout(talkTimer);
  talk.hidden = true;
  input.blur();
}
function closeTalkSoon() {
  clearTimeout(talkTimer);
  talkTimer = setTimeout(() => {
    if (busy || input.value.trim() || document.activeElement === input) { closeTalkSoon(); return; }
    closeTalk();
  }, 45000);
}
input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTalk(); });
window.addEventListener('blur', () => { if (!input.value.trim() && !busy) closeTalk(); });

// ---------------------------------------------------------------
// framing: her whole body, centered, feet at the bottom

function frame() {
  if (!ready && !Live2D.hasModel()) return;
  S.hasUserPos = true;
  S.userZoom = 1;
  S.userOffsetX = 0;
  S.userOffsetY = 0;
  fitModel();
  requestAnimationFrame(reportFeet);
}

function reportFeet() {
  const a = Live2D.faceAnchor();
  if (!a) return;
  const bottom = a.y - a.modelH * 0.09 + a.modelH;
  D?.reportFeet(Math.max(0, window.innerHeight - bottom));
}

window.addEventListener('resize', () => setTimeout(frame, 60));

// ---------------------------------------------------------------
// the pointer. over her: tap to talk, drag to carry her, right
// click for the menu. anywhere else the click goes through to
// whatever is under the window

function overUi(t) {
  return !!(t && t.closest && t.closest('.talk, .tools, .note'));
}
function overHer(x, y) {
  return ready && Live2D.isOverModel(x, y);
}

let through = null;
function setThrough(on) {
  if (on === through) return;
  through = on;
  D?.setClickThrough(on);
}
window.addEventListener('mousemove', (e) => {
  if (press) return;
  setThrough(!(overUi(e.target) || overHer(e.clientX, e.clientY)));
}, true);
document.addEventListener('mouseleave', () => { if (!press) setThrough(true); });

let press = null;
let lastTap = 0;
window.addEventListener('pointerdown', (e) => {
  if (overUi(e.target) || !overHer(e.clientX, e.clientY)) return;
  // ours, not live2d/input.js's: that one drags her around INSIDE
  // the canvas, here a drag carries the whole window
  e.stopPropagation();
  e.preventDefault();
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY, dragging: false, id: e.pointerId };
  try { stageEl.setPointerCapture(e.pointerId); } catch (err) {}
}, true);

window.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  e.stopPropagation();
  if (press.dragging || Math.hypot(e.screenX - press.x, e.screenY - press.y) < 5) return;
  press.dragging = true;
  if (dozing) wake(false);
  D?.dragStart();
  if (MODE === 'stepout') {
    for (const a of Actions.parseActions('[A:shocked]')) Actions.applyAction(a);
  }
}, true);

const endPress = (e) => {
  if (!press || e.pointerId !== press.id) return;
  e.stopPropagation();
  const p = press;
  press = null;
  if (p.dragging) { D?.dragEnd(); return; }
  if (e.type === 'pointercancel') return;
  const now = Date.now();
  if (now - lastTap < 350) {
    lastTap = 0;
    if (MODE === 'stepout') goInside(); else D?.openWindow();
    return;
  }
  lastTap = now;
  if (MODE === 'stepout') {
    if (talk.hidden) openTalk(); else closeTalk();
  } else {
    openTalk();
  }
};
window.addEventListener('pointerup', endPress, true);
window.addEventListener('pointercancel', endPress, true);

window.addEventListener('contextmenu', (e) => {
  if (overUi(e.target)) return;
  e.preventDefault();
  if (overHer(e.clientX, e.clientY)) D?.menu();
}, true);
window.addEventListener('wheel', (e) => {
  if (!overUi(e.target)) e.stopPropagation();
}, { capture: true, passive: true });

document.getElementById('toWindow').addEventListener('click', () => D?.openWindow());
document.getElementById('toStepout').addEventListener('click', () => D?.stepOut());
document.getElementById('toHide').addEventListener('click', () => D?.hide());

// ---------------------------------------------------------------
// out on the desktop: walking, dozing, being carried

function walkPose(dir) {
  // body turned the way she's going, a bounce in her step
  for (const [p, v] of [['ParamHeadX', 0.55 * dir], ['ParamBodyX', 0.5 * dir], ['ParamEyeballLX', 0.7 * dir], ['ParamEyeballRX', 0.7 * dir]]) {
    Live2D.setTarget(p, v);
    Live2D.hold(p, 120000);
  }
  Live2D.startLoop('ParamBodyY', 0.25, 420);
  Live2D.startLoop('ParamLegL', 0.3, 840);
  Live2D.startLoop('ParamLegR', -0.3, 840);
}
function standPose() {
  for (const p of ['ParamBodyY', 'ParamLegL', 'ParamLegR']) Live2D.stopLoop(p);
  Live2D.releaseAll();
}

D?.onWalk(({ state, dir }) => {
  if (state === 'walking') {
    walking = true;
    walkPose(dir || 1);
    return;
  }
  walking = false;
  standPose();
  if (state === 'landed' && MODE === 'stepout') {
    // not every single time he moves her, that gets old
    drops++;
    if (drops === 1 || Math.random() < 0.3) react('dropped');
  }
});

function doze() {
  if (dozing || busy) return;
  dozing = true;
  dozeAt = Date.now();
  D?.stopWalk();
  closeTalk();
  Live2D.setTarget('ParamEyeOpen', -1);
  Live2D.hold('ParamEyeOpen', 1e9);
  Live2D.setTarget('ParamHeadY', -0.6);
  Live2D.hold('ParamHeadY', 1e9);
  Live2D.startLoop('ParamBodyY', 0.2, 5000);
  zzz.hidden = false;
}

function wake(withLine) {
  if (!dozing) return;
  dozing = false;
  zzz.hidden = true;
  Live2D.stopLoop('ParamBodyY');
  Live2D.releaseAll();
  // a nap under a minute isn't worth a line
  if (withLine && Date.now() - dozeAt > 60000) react('wake');
}

D?.onIdle(({ seconds, dozeAfter }) => {
  if (!ready) return;
  if (seconds >= dozeAfter) doze();
  else if (dozing && seconds < 30) wake(true);
});

// a stroll every so often, when she isn't busy with him
function scheduleWander() {
  setTimeout(() => {
    if (MODE === 'stepout' && ready && !busy && !dozing && !walking && !press && talk.hidden) D?.wander();
    scheduleWander();
  }, 25000 + Math.random() * 50000);
}

let leaving = false;
async function goInside() {
  if (leaving) return;
  leaving = true;
  D?.stopWalk();
  closeTalk();
  if (dozing) wake(false);
  await Promise.race([
    react('inside'),
    new Promise(r => setTimeout(r, 12000)),
  ]);
  D?.goInside();
}

D?.onCommand((cmd) => {
  if (cmd === 'go-inside') goInside();
  else if (cmd === 'talk') openTalk();
});

// ---------------------------------------------------------------
// boot

function showNote(text, button, onClick) {
  note.textContent = text;
  if (button) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = button;
    b.addEventListener('click', onClick);
    note.appendChild(document.createElement('br'));
    note.appendChild(b);
  }
  note.hidden = false;
}

async function main() {
  if (MODE === 'compact') talk.hidden = false;
  const me = await Auth.me().catch(() => null);
  if (!me) {
    talk.hidden = true;
    setThrough(false);
    showNote('Sign in to Jun in her window first.', 'Open her window', () => D?.openWindow());
    return;
  }
  await Prefs.pullFromServer().catch(() => {});
  Names.load();
  configureTts();
  try {
    await Actions.load('action_map.json');
    await Live2D.init({ stageEl, ignoreSavedPos: true, onStatus: () => {} });
    await Outfit.load();
    Outfit.applyAll();
    Live2D.startIdle();
  } catch (e) {
    console.error(e);
    showNote('She could not load: ' + e.message);
    return;
  }
  ready = true;
  frame();
  setTimeout(frame, 400);
  await loadConversation();
  scheduleWander();
  if (MODE === 'stepout' && REASON === 'stepout') react('stepout');
}

main();
