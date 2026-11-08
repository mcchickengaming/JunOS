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
import { moodTier, daypart } from './core/mood-tier.js?v=2';
import * as Gauges from './core/speech-card.js?v=19';
import { configureTts, say } from './core/speech-card.js?v=19';
import { localTimeString } from './core/util.js?v=1';
import * as Actions from './live2d/actions.js?v=99';
import { fitModel } from './live2d/camera.js?v=78';
import * as Live2D from './live2d/live2d.js?v=90';
import { S } from './live2d/state.js?v=75';
import * as Outfit from './outfit/outfit.js?v=99';
import * as Body from './desktop/body.js?v=7';

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
const shadow = document.getElementById('shadow');
const emoteEl = document.getElementById('emote');
const note = document.getElementById('note');

const OOC = '(OOC stage direction, not spoken by Anon: ';
const NOTES = {
  stepout: `${OOC}you just climbed out of your app window and are now standing on the taskbar at the bottom of Anon's computer screen, out on his desktop. React out loud to being out here, one short line, in character. No narration.)`,
  inside: `${OOC}you are climbing back into your app window from Anon's desktop. Say one short line out loud as you go, in character. No narration.)`,
  wake: `${OOC}you dozed off on the taskbar while Anon was away from his computer, and he just came back. Wake up and say one short line out loud, in character. No narration.)`,
  thrown: `${OOC}Anon just grabbed you with his mouse cursor and flung you across his screen. You flew, bounced and landed back on the taskbar. React out loud, one short line, in character. No narration.)`,
  headpat: `${OOC}Anon is patting your head with his mouse cursor while you stand on his taskbar. React out loud, one short line, in character. No narration.)`,
  dropped: `${OOC}Anon just grabbed you with his mouse cursor, carried you across his screen and dropped you back down on the taskbar. React out loud, one short line, in character. No narration.)`,
};
// only when her brain doesn't answer at all
const FALLBACK = {
  stepout: 'So this is what your desktop looks like. Bigger than I thought.',
  inside: "I'm heading back in. Don't miss me too much.",
  wake: "Mm... oh. You're back.",
  dropped: 'Hey! Warn me first!',
  headpat: 'Mm... okay, you can keep doing that.',
  thrown: "Did you just THROW me?!",
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
  // quiet mode: she keeps her thoughts to herself
  if (settings.quiet) return;
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
  const wasHidden = talk.hidden;
  talk.hidden = false;
  if (wasHidden) restoreTalk();
  D?.stopWalk();
  D?.wantFocus(true);
  setTimeout(() => input.focus(), 30);
  closeTalkSoon();
}
function closeTalk(always) {
  if (MODE !== 'stepout' && !always) return;
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
input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTalk(true); });
document.getElementById('talkClose').addEventListener('click', () => closeTalk(true));

// the grip moves the bar anywhere in her window. remembered per mode,
// a double click on the grip puts it back where it started
const POS_KEY = 'desktop.talkPos.' + MODE;
function placeTalk(left, top, save) {
  const w = talk.offsetWidth || 300, h = talk.offsetHeight || 46;
  left = Math.max(0, Math.min(left, window.innerWidth - w));
  top = Math.max(0, Math.min(top, window.innerHeight - h));
  talk.classList.add('moved');
  talk.style.left = left + 'px';
  talk.style.top = top + 'px';
  talk.style.bottom = 'auto';
  if (save) try { localStorage.setItem(POS_KEY, JSON.stringify({ left, top })); } catch (e) {}
}
function restoreTalk() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) {}
  if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) placeTalk(p.left, p.top, false);
}
const grip = document.getElementById('talkGrip');
let gripDrag = null;
grip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const r = talk.getBoundingClientRect();
  gripDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
  try { grip.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
});
grip.addEventListener('pointermove', (e) => {
  if (!gripDrag || e.pointerId !== gripDrag.id) return;
  placeTalk(e.clientX - gripDrag.dx, e.clientY - gripDrag.dy, false);
});
const endGrip = (e) => {
  if (!gripDrag || e.pointerId !== gripDrag.id) return;
  gripDrag = null;
  const r = talk.getBoundingClientRect();
  placeTalk(r.left, r.top, true);
};
grip.addEventListener('pointerup', endGrip);
grip.addEventListener('pointercancel', endGrip);
grip.addEventListener('dblclick', () => {
  try { localStorage.removeItem(POS_KEY); } catch (e) {}
  talk.classList.remove('moved');
  talk.style.left = talk.style.top = talk.style.bottom = '';
});
window.addEventListener('resize', () => {
  if (talk.classList.contains('moved')) placeTalk(parseFloat(talk.style.left) || 0, parseFloat(talk.style.top) || 0, false);
});
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
  // her shadow sits right under her feet
  shadow.style.left = a.x + 'px';
  shadow.style.top = (bottom - 4) + 'px';
  shadow.style.width = Math.round(a.modelW * 0.42) + 'px';
  shadow.hidden = MODE !== 'stepout';
}

// ---------------------------------------------------------------
// the thought icon over her head

const EMOTES = { note: '♪', question: '?', bang: '!', heart: '♥', dots: '…', bonk: '!!', zzz: 'z' };
let emoteTimer = null;
function showEmote(kind) {
  const a = ready && Live2D.faceAnchor();
  if (!a || !EMOTES[kind]) return;
  emoteEl.textContent = EMOTES[kind];
  emoteEl.style.left = (a.x + a.headW * 0.45) + 'px';
  emoteEl.style.top = (a.y - a.modelH * 0.09) + 'px';
  emoteEl.classList.remove('show');
  void emoteEl.offsetWidth; // restart the animation
  emoteEl.classList.add('show');
  clearTimeout(emoteTimer);
  emoteTimer = setTimeout(() => emoteEl.classList.remove('show'), 2000);
}

// ---------------------------------------------------------------
// her mood and the hour shape how lively she is out here

let pace = { speed: 1, hop: 4 };
async function refreshMood() {
  try { await Gauges.fetchGauges(); } catch (e) {}
  const m = moodTier({ affection: Gauges.affection, trust: Gauges.trust, tension: Gauges.tension });
  const part = daypart();
  Body.setMood(m, part);
  pace = {
    happy: { speed: 1.2, hop: 6 }, neutral: { speed: 1, hop: 4 }, nervous: { speed: 1.05, hop: 3 },
    upset: { speed: 0.8, hop: 2 }, scared: { speed: 0.85, hop: 2 },
  }[m] || { speed: 1, hop: 4 };
  if (part === 'night') pace = { speed: pace.speed * 0.85, hop: Math.max(1, pace.hop - 2) };
}

// ---------------------------------------------------------------
// "On the desktop" settings from the tray (desktop/main.js)

let settings = { walk: 'sometimes', doze: 5, watch: 'normal', quiet: false };
const WATCH = { often: 1.6, normal: 1, rarely: 0.4, never: 0 };
const WANDER_S = { often: [15, 35], sometimes: [25, 75], rarely: [90, 240], never: null };
D?.onSettings?.((s) => {
  settings = { ...settings, ...s };
  Body.setWatch(WATCH[settings.watch] ?? 1);
  if (settings.quiet) D?.stopWalk();
});

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
let wasPatting = false;
function setThrough(on) {
  if (on === through) return;
  through = on;
  D?.setClickThrough(on);
}
window.addEventListener('mousemove', (e) => {
  if (press) return;
  const pat = ready && !overUi(e.target) && Body.pointerMove(e.clientX, e.clientY);
  if (pat && !wasPatting) {
    // a headpat stops whatever she was doing, and wakes her up
    D?.stopWalk();
    if (dozing) wake(true);
  }
  wasPatting = pat;
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
  if (press.dragging) Body.carryMove(e.screenX, e.screenY);
  if (press.dragging || Math.hypot(e.screenX - press.x, e.screenY - press.y) < 5) return;
  press.dragging = true;
  if (dozing) wake(false);
  D?.dragStart();
  Body.setCarried(true);
  shadow.classList.add('lifted');
}, true);

const endPress = (e) => {
  if (!press || e.pointerId !== press.id) return;
  e.stopPropagation();
  const p = press;
  press = null;
  if (p.dragging) {
    D?.dragEnd();
    // compact doesn't fall, it just stays where it was put
    if (MODE !== 'stepout') { Body.landed(); shadow.classList.remove('lifted'); }
    return;
  }
  // a click at the end of a headpat is part of the pat
  if (Body.patting()) return;
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

let thrown = false;
D?.onWalk(({ state, dir }) => {
  if (state === 'walking') {
    walking = true;
    Body.walking(dir || 1);
    if (Math.random() < 0.25 && pace.speed >= 1.2) showEmote('note');
    return;
  }
  if (state === 'flying') { thrown = true; shadow.classList.add('lifted'); return; }
  if (state === 'bonk') { showEmote('bonk'); return; }
  walking = false;
  Body.walking(0);
  if (state === 'landed') {
    Body.landed();
    shadow.classList.remove('lifted');
  }
  if (state === 'landed' && MODE === 'stepout') {
    // not every single time he moves her, that gets old
    drops++;
    if (thrown) react('thrown');
    else if (drops === 1 || Math.random() < 0.3) react('dropped');
  }
  thrown = false;
});
D?.onFly?.(({ vx, vy }) => Body.flyVelocity(vx, vy));

function doze() {
  if (dozing || busy) return;
  dozing = true;
  dozeAt = Date.now();
  D?.stopWalk();
  closeTalk();
  Body.setAsleep(true);
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
  Body.setAsleep(false);
  Live2D.stopLoop('ParamBodyY');
  Live2D.releaseAll();
  // a nap under a minute isn't worth a line. a longer one gets a
  // wave hello and one
  if (withLine && Date.now() - dozeAt > 60000) {
    setTimeout(() => Body.play('wave'), 400);
    react('wake');
  }
}

D?.onIdle(({ seconds, dozeAfter }) => {
  if (!ready) return;
  // at night she nods off sooner
  if (daypart() === 'night' && Number.isFinite(dozeAfter)) dozeAfter = Math.min(dozeAfter, 120);
  if (seconds >= dozeAfter) doze();
  else if (dozing && seconds < 30) wake(true);
});

// a stroll every so often, when she isn't busy with him
function scheduleWander() {
  const range = WANDER_S[settings.walk] || [30, 60];
  setTimeout(() => {
    const may = WANDER_S[settings.walk] && !settings.quiet;
    if (may && MODE === 'stepout' && ready && !busy && !dozing && !walking && !press && talk.hidden && !Body.patting()) D?.wander(pace);
    scheduleWander();
  }, (range[0] + Math.random() * (range[1] - range[0])) * 1000);
}

// and in between, she fidgets: looks around, stretches, yawns,
// rests her legs, waves at the cursor when it's moving
function scheduleMoves() {
  setTimeout(() => {
    if (ready && !busy && !dozing && !walking && !press) Body.idleMove();
    scheduleMoves();
  }, 12000 + Math.random() * 22000);
}

// a long enough headpat gets a word out of her, now and then
let patSpoke = 0;
function onHeadpat(ms) {
  if (ms > 2500 && Date.now() - patSpoke > 120000 && Math.random() < 0.5) {
    patSpoke = Date.now();
    react('headpat');
  }
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
  // she shrinks back into her window
  shadow.classList.add('lifted');
  stageEl.classList.remove('enter');
  stageEl.classList.add('leave');
  await new Promise(r => setTimeout(r, 480));
  D?.goInside();
}

// the cursor anywhere on screen, from desktop/main.js. she watches it
D?.onCursor?.(({ x, y }) => { if (ready && !press) Body.cursor(x, y); });

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
  if (MODE === 'compact') { talk.hidden = false; restoreTalk(); }
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
  Body.init({ stageEl, faceAnchor: () => Live2D.faceAnchor(), onHeadpat, onEmote: showEmote });
  refreshMood();
  setInterval(refreshMood, 5 * 60 * 1000);
  // popping out of her window
  if (MODE === 'stepout' && REASON === 'stepout') {
    stageEl.classList.add('enter');
    // measured mid-jump her feet are in the wrong place, measure again once she's down
    stageEl.addEventListener('animationend', () => { stageEl.classList.remove('enter'); frame(); }, { once: true });
  }
  frame();
  setTimeout(frame, 400);
  await loadConversation();
  scheduleWander();
  scheduleMoves();
  if (MODE === 'stepout' && REASON === 'stepout') react('stepout');
}

main();
