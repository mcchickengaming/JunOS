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
import * as ChatAPI from './core/chat-api.js?v=11';
import * as Names from './core/names.js?v=1';
import * as Prefs from './core/prefs.js?v=7';
import { moodTier, daypart } from './core/mood-tier.js?v=2';
import * as Gauges from './core/speech-card.js?v=25';
import { configureTts, say } from './core/speech-card.js?v=25';
import { localTimeString } from './core/util.js?v=1';
import * as Actions from './live2d/actions.js?v=104';
import { fitModel } from './live2d/camera.js?v=78';
import * as Live2D from './live2d/live2d.js?v=94';
import { S } from './live2d/state.js?v=75';
import * as Outfit from './outfit/outfit.js?v=104';
import * as Body from './desktop/body.js?v=47';
import * as TouchLog from './core/touch-log.js?v=2';
import * as Fx from './desktop/fx.js?v=12';
import * as Moods from './desktop/moods.js?v=16';
import * as FeelBody from './desktop/feelbody.js?v=6';
import * as Snapshot from './desktop/snapshot.js?v=5';
import * as Often from './desktop/often.js?v=2';
import * as Gate from './core/gate.js?v=3';
import * as Features from './core/features.js?v=3';
import * as Feel from './core/feel/feel.js?v=4';
import { waveGesture } from './core/feel/gesture.js?v=2';

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

// her colors: Settings > Visuals (desktop-settings.html) keeps
// them in localStorage, the same origin as this page, and the storage
// event brings a change over live
const THEME_KEY = 'desktop.theme';
function applyTheme() {
  let t = {};
  try { t = JSON.parse(localStorage.getItem(THEME_KEY) || '{}'); } catch (e) {}
  const root = document.documentElement;
  root.removeAttribute('style');
  for (const [k, v] of Object.entries(t)) if (/^--[a-z-]+$/.test(k)) root.style.setProperty(k, String(v));
  root.classList.toggle('fade-chat', !!t.fadeChat);
}
applyTheme();
window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) applyTheme(); });
// how the ripple, the labels and her thought icons look (desktop
// settings > Touch feedback), live the same way
Fx.installCss();
Fx.applyFx();
window.addEventListener('storage', (e) => { if (e.key === Fx.FX_KEY) Fx.applyFx(); });
// how she feels about each touch, shown around her (desktop/moods.js)
Moods.installCss();
Moods.setAnchor(() => (ready ? Live2D.faceAnchor() : null), document.body);
// ...and in her body: ears, tail, eyes, blush, a soft lean (desktop/feelbody.js)
FeelBody.setPrefs(Fx.currentFx());
Moods.setBody(FeelBody);
// core feel (#27): her needs, getting tired of things, the repeat watcher and the reaction
// composer. Every touch Moods sees goes to it; her idle moves and thought icons ask it too
Feel.configure({ isOn: (id) => Features.isOn(id) });
Moods.setFeel(Feel);
Body.setIdleHook({ extras: () => Feel.idleExtras(), pick: (pool) => Feel.Repeat.pick('idle', pool) });
FeelBody.setOnAway((ms) => Body.busyFor(ms));
// where his hand is, so she leans away from it, not from where it pressed
window.addEventListener('pointermove', (e) => Moods.setPointer(e.clientX, e.clientY), { capture: true, passive: true });
window.addEventListener('mousemove', (e) => Moods.setPointer(e.clientX, e.clientY), { passive: true });
window.addEventListener('storage', (e) => { if (e.key === Fx.FX_KEY) FeelBody.setPrefs(Fx.readFx()); });

const OOC = '(OOC stage direction, not spoken by Anon: ';
const NOTES = {
  stepout: `${OOC}you just climbed out of your app window and are now standing on the taskbar at the bottom of Anon's computer screen, out on his desktop. React out loud to being out here, one short line, in character. No narration.)`,
  inside: `${OOC}you are climbing back into your app window from Anon's desktop. Say one short line out loud as you go, in character. No narration.)`,
  wake: `${OOC}you dozed off on the taskbar while Anon was away from his computer, and he just came back. Wake up and say one short line out loud, in character. No narration.)`,
  poked: `${OOC}Anon keeps poking you with his mouse cursor, over and over. React out loud, one short line, in character. No narration.)`,
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
  poked: 'Okay, okay! Stop poking me!',
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
  const line = Names.apply(spoken) || fallback;
  // the repeat watcher remembers it, so her next desktop line isn't the same one
  if (line) Feel.Repeat.note('line', line.slice(0, 160));
  // a touch reaction with nothing back from her brain: she just doesn't say anything
  return line ? say(line) : Promise.resolve();
}

async function ask(content, { ephemeral, fallback }) {
  busy = true;
  talk.classList.add('thinking');
  input.placeholder = '…';
  thinking(true);
  D?.stopWalk();
  try {
    if (!ephemeral || !conversationId) await loadConversation();
    const raw = await turn(content, ephemeral);
    thinking(false);
    talk.classList.remove('thinking');
    input.placeholder = 'Say something…';
    await speak(raw, fallback);
  } finally {
    busy = false;
    thinking(false);
    talk.classList.remove('thinking');
    input.placeholder = 'Say something…';
  }
}

// one short in-character line about what just happened on the
// desktop. never two in a row
async function react(kind, extraNote = null) {
  if (!ready || busy) return;
  // quiet mode: she keeps her thoughts to herself
  if (settings.quiet) return;
  if (kind !== 'inside' && Date.now() - lastReactAt < 20000) return;
  lastReactAt = Date.now();
  const touch = TOUCH_NOTES[kind] || extraNote;
  let note = touch
    ? `${OOC}${touch}, with his mouse cursor, while you're out on his desktop. React out loud in one short line, in character, the way you honestly feel about him and about this right now. If his touches today show he has been doing this a lot, you can notice that. No narration.)`
    : NOTES[kind];
  // the repeat watcher: her last few lines out here, so this one is new
  // the tone, from how she just took this touch (the reaction composer's line type): a tone,
  // never the words
  const hint = touch && !extraNote ? Feel.lineHint() : null;
  if (hint) note = note.replace(/\)$/, ` Right now you're ${hint.words}.)`);
  const lately = Feel.switches().repeat ? Feel.Repeat.recent('line', 3) : [];
  if (lately.length) note = note.replace(/\)$/, ` Say something different from what you said just now: ${lately.map(l => '"' + l + '"').join(', ')}.)`);
  await ask(note, { ephemeral: true, fallback: touch ? '' : FALLBACK[kind] });
}

// ---------------------------------------------------------------
// core feel: she's had plenty / enough of something. a playful "that's enough for now", never a
// punishment: a look, a pout icon, now and then a line. it wears off by itself (2-3 hours)
Feel.onChange((ev) => {
  if (ev.type !== 'tired' || !ready) return;
  const words = ev.words || 'that';
  if (ev.state === 'plenty') {
    if (Math.random() < 0.4) showEmote(Feel.Repeat.pick('emote', ['dots', 'a_flat', 'sweat']));
    return;
  }
  // enough (or a little sore): she shows it
  Body.play(Feel.Repeat.pick('reaction', ['lookAway', 'ears', 'lookAway']));
  showEmote(Feel.Repeat.pick('emote', ['hmph', 'a_flat', 'dots', 'a_err']));
  Moods.burst('flustered', 0.55);
  if (settings.quiet || Math.random() > 0.45 * Often.mul(settings.talk)) return;
  const what = ev.state === 'sore'
    ? `Anon has given you so many ${words} that you're a little sore now`
    : `Anon has given you so many ${words} that you've had enough of that for now and would like something else for a while`;
  react('tired:' + ev.kind, `${what} (playful, never upset, you'll be fine in a while)`);
});

// ---------------------------------------------------------------
// she says something about a touch now and then, never every time.
// what she says comes from her brain with her current feelings and
// bond stage in it (chat_live_context), so the same hug gets a shy
// line from a Stranger and a warm one from Devoted. how often:
// Settings > Talking & voice > Talks about your touches

const TOUCH_NOTES = {
  hug: 'Anon is hugging you',
  hand: 'Anon is holding your hand',
  squeeze: 'Anon gave your hand a quick squeeze',
  tickle: 'Anon is tickling your side',
  ear: 'Anon is rubbing your ear',
  earflick: 'Anon flicked your ear',
  nose: 'Anon booped your nose',
  cheek: 'Anon poked your cheek',
  shoulder: 'Anon tapped you on the shoulder',
  tail: 'Anon tugged your tail',
  thighpoke: 'Anon poked your thigh',
  thighrub: 'Anon is rubbing your thigh',
  thighsquish: 'Anon is squishing your thigh with his hand and not letting go',
  feetrub: 'Anon is giving you a foot rub',
  feettickle: 'Anon is tickling your feet',
  feet: 'Anon poked your foot and found out it is ticklish',
  waveback: 'you waved at Anon and he waved back',
  hiswave: 'Anon waved at you and you waved back',
  tailgrab: 'Anon grabbed your tail and is holding on to it',
  tailrub: 'Anon is rubbing your tail',
  'combo:melt': 'Anon is holding your tail and giving you headpats at the same time',
  'combo:patboop': 'Anon gave you a headpat and then booped your nose',
  'combo:handhug': 'Anon held your hand and then pulled you into a hug',
  'combo:cozy': 'Anon rubbed your ear and then gave you headpats',
  'combo:tickleattack': 'Anon launched a full tickle attack on you, sides and feet',
  'combo:tailtease': 'Anon rubbed your tail and then grabbed it',
};
// chance per touch at "Sometimes"; a long hug is likelier to get a word
// than a passing poke
const TOUCH_CHANCE = {
  hug: 0.5, hand: 0.45, squeeze: 0.2, tickle: 0.35, thighsquish: 0.35, ear: 0.35, earflick: 0.2, nose: 0.25, cheek: 0.2,
  shoulder: 0.2, tail: 0.3, thighpoke: 0.3, thighrub: 0.5, feetrub: 0.4, feettickle: 0.35, feet: 0.3, waveback: 0.5, hiswave: 0.25,
  tailgrab: 0.45, tailrub: 0.4,
  // combos are rarer and mean more, so they're likelier to get a word
  'combo:melt': 0.8, 'combo:patboop': 0.5, 'combo:handhug': 0.8, 'combo:cozy': 0.6, 'combo:tickleattack': 0.7, 'combo:tailtease': 0.6,
};
const POKE_TALK = { cheek: 'cheek', nose: 'nose', ear: 'earflick', shoulder: 'shoulder', tail: 'tail', hand: 'squeeze',
  side: 'tickle', thigh: 'thighpoke', feet: 'feet' };
const RUB_TALK = { ear: 'ear', side: 'tickle', thigh: 'thighrub', feet: 'feetrub', feettickle: 'feettickle', tail: 'tailrub' };
// what each touch is called in her tally (core/touch-log.js, lib/touch.php TOUCH_KINDS)
const RUB_KIND = { head: 'headpat', ear: 'earrub', side: 'tickle', thigh: 'thighrub', feet: 'footrub', feettickle: 'foottickle', tail: 'tailrub' };
const POKE_KIND = { head: 'headpoke', cheek: 'cheekpoke', nose: 'boop', ear: 'earflick', shoulder: 'shouldertap',
  tail: 'tailtug', hand: 'squeeze', side: 'sidepoke', thigh: 'thighpoke', feet: 'footpoke' };
const lastTouchTalk = {};

// ---------------------------------------------------------------
// combos: touches in a row that mean more together. a list, so a new
// one is one line: the steps in order and how fast they have to come.
// step names: head (headpat), ear (ear rub), nose, cheek, shoulder,
// hand (hold), hug, side (tickle), thigh, feet, tailgrab, tailrub,
// waveback

const COMBOS = [
  { id: 'melt', steps: ['tailgrab', 'head'], within: 6000, label: 'Combo: tail + headpat' },
  { id: 'patboop', steps: ['head', 'nose'], within: 4000, label: 'Combo: pat and boop' },
  { id: 'handhug', steps: ['hand', 'hug'], within: 6000, label: 'Combo: hand, then a hug' },
  { id: 'cozy', steps: ['ear', 'head'], within: 5000, label: 'Combo: ear rub + headpat' },
  { id: 'tickleattack', steps: ['side', 'side', 'feet'], within: 7000, label: 'Combo: tickle attack!' },
  { id: 'tailtease', steps: ['tailrub', 'tailgrab'], within: 5000, label: 'Combo: tail tease' },
  // two hands at once (one left in place, see "two hands" below)
  { id: 'bothhands', steps: ['hand', 'hand'], together: true, label: 'Both hands' },
  { id: 'hugpat', steps: ['hug', 'head'], together: true, label: 'Hug + headpat' },
  { id: 'bothears', steps: ['ear', 'ear'], together: true, label: 'Both ears' },
  { id: 'melt', steps: ['tailgrab', 'head'], together: true, label: 'Tail + headpat' },
];
const touchLog = [];
const comboAt = {};
function touched(kind) {
  const now = Date.now();
  touchLog.push({ kind, t: now });
  while (touchLog.length && now - touchLog[0].t > 10000) touchLog.shift();
  for (const c of COMBOS) {
    if (now - (comboAt[c.id] || 0) < 20000) continue;
    // "together" combos: the other hand is left in place on the first step
    if (c.together) {
      // either hand can come first
      const [x, y] = c.steps;
      if (!pin || !((pin.step === x && kind === y) || (pin.step === y && kind === x))) continue;
      fireCombo(c, now);
      return true;
    }
    // the steps, in order, ending with this touch, inside the time window
    let i = c.steps.length - 1;
    for (let j = touchLog.length - 1; j >= 0 && i >= 0; j--) {
      if (now - touchLog[j].t > c.within) break;
      if (touchLog[j].kind === c.steps[i]) i--;
      else if (i === c.steps.length - 1) break; // the last step has to be this touch
    }
    if (i >= 0) continue;
    fireCombo(c, now);
    return true;
  }
  return false;
}
function fireCombo(c, now) {
  comboAt[c.id] = now;
  touchLog.length = 0;
  const a = Live2D.faceAnchor();
  Body.combo(c.id);
  if (a) actionLabel(c.label, a.x, a.y - a.modelH * 0.12);
  // a combo is a big moment: her pick of ripple, right on her face
  if (a && Fx.currentFx().rHerPick) Fx.ripple(a.x, a.y, closeness() >= 3 ? { shape: 'heart', motion: 'burst' } : { shape: 'sparkle', motion: 'spin', rings: 2 });
  sparkles(5);
  Moods.combo(c.id);
  TouchLog.tap('combo_' + c.id);
  maybeSay('combo:' + c.id);
}

// ---------------------------------------------------------------
// two hands: while holding (hand, hug, tail) or rubbing (head, ear,
// tail, foot, thigh, side), tap Shift or right-click and that hand
// stays where it is, doing what it was doing. the mouse is free for a
// second touch. click the little hand (or Shift / Esc) to lift it

let pin = null;
let lastX = 0, lastY = 0;
const PIN_ICON = { hand: '🤝', hug: '🤗', tailgrab: '✊', head: '✋', ear: '✋', tailrub: '✋', feet: '✋', thigh: '✋', side: '🤏' };
function pinHand() {
  if (pin) { releasePin(); return true; }
  let next = null;
  if (press && press.hold === 'pat') {
    const p = press;
    press = null;
    TouchLog.move('hold', 'pin');
    endHold(p);
    const t0 = Date.now() - 2500;
    next = { type: 'rub', step: 'head', kind: 'head', x: p.cx, y: p.cy };
    next.timer = setInterval(() => {
      const ms = Date.now() - t0;
      Body.rubEffect('head', ms, next.x + Math.sin(ms / 140) * 14);
    }, 120);
  } else if (press && press.hold && press.hold !== 'freed') {
    const p = press;
    const step = p.hold === 'tail' ? 'tailgrab' : p.hold === 'thigh' ? 'thighsquish' : p.hold === 'feet' ? 'footrub' : p.hold;
    next = { type: 'hold', step, p, x: p.cx, y: p.cy };
    // the hold carries on in the pinned hand; its count ends with the pin
    p.pinned = true;
    TouchLog.move('hold', 'pin');
    // the button is still down: this press is over, the hold carries on
    press = null;
  } else if (wasRubbing) {
    const kind = wasRubbing;
    const t0 = Date.now() - 2500;
    next = { type: 'rub', step: kind === 'tail' ? 'tailrub' : kind, kind, x: lastX, y: lastY };
    TouchLog.move('rub', 'pin');
    next.timer = setInterval(() => {
      const ms = Date.now() - t0;
      Body.rubEffect(kind, ms, next.x + Math.sin(ms / 140) * 14);
    }, 120);
  }
  if (!next) return false;
  // her feeling about it goes on with the hand left in place
  if (next.type === 'hold') Moods.move('press', 'pin');
  else if (next.step === 'head' && next.type === 'rub' && !wasRubbing) { Moods.end('press'); Moods.begin('pin', 'head', Date.now() - 2500, { x: next.x, y: next.y }); }
  else { Moods.move('rub', 'pin'); Moods.move('press', 'pin'); }
  pin = next;
  const el = document.createElement('div');
  el.className = 'pin' + (pin.type === 'rub' ? ' rubbing' : '');
  el.textContent = PIN_ICON[pin.step] || '✋';
  el.title = 'Your other hand. Click to lift it.';
  el.style.left = pin.x + 'px';
  el.style.top = pin.y + 'px';
  el.addEventListener('click', (e) => { e.stopPropagation(); releasePin(); });
  document.body.appendChild(el);
  pin.el = el;
  actionLabel('Hand left here, the other one is free', pin.x, pin.y);
  hoverKind = undefined;
  return true;
}
function releasePin() {
  if (!pin) return;
  if (pin.type === 'hold') endHold(pin.p);
  Moods.end('pin');
  TouchLog.end('pin');
  clearInterval(pin.timer);
  if (pin.el) pin.el.remove();
  pin = null;
}
window.addEventListener('keydown', (e) => {
  if (!ready || calibrating || document.activeElement === input) return;
  if (e.key === 'Shift' && !e.repeat) pinHand();
  else if (e.key === 'Escape' && pin) releasePin();
});
function maybeSay(kind) {
  if (!kind || !TOUCH_NOTES[kind] || settings.quiet) return;
  const f = Often.mul(settings.talk);
  const now = Date.now();
  // the same touch twice in a row doesn't get two remarks
  if (now - (lastTouchTalk[kind] || 0) < 90000) return;
  if (Math.random() > (TOUCH_CHANCE[kind] || 0.25) * f) return;
  lastTouchTalk[kind] = now;
  react(kind);
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

// the icons themselves live in desktop/fx.js (EMOTES): symbols, small
// pictures, her robot faces in ascii. 'hearts' is an effect: a burst of
// hearts, then the heart icon. Fx.pickEmote sometimes says the same
// feeling a different way (by bond and mood) and never shows the same
// icon twice in a row
let emoteTimer = null;
function headTop() {
  const a = ready && Live2D.faceAnchor();
  return a ? { a, x: a.x + a.headW * 0.45, y: a.y - a.modelH * 0.09 } : null;
}
function showEmote(kind) {
  if (kind === 'hearts') { floatHearts(4); kind = 'heart'; }
  const t = headTop();
  if (!t || !Fx.EMOTES[kind]) return;
  kind = Fx.pickEmote(kind, { close: closeness(), mood: Body.currentMood() });
  Fx.fillEmote(emoteEl, kind);
  emoteEl.style.left = t.x + 'px';
  emoteEl.style.top = t.y + 'px';
  emoteEl.classList.remove('show');
  void emoteEl.offsetWidth; // restart the animation
  emoteEl.classList.add('show');
  clearTimeout(emoteTimer);
  emoteTimer = setTimeout(() => emoteEl.classList.remove('show'), 2000);
  if (kind === 'sparkle') sparkles(4);
  sound(kind === 'bang' || kind === 'bonk' ? 'squeak' : 'pop');
}

// the thinking cloud while her brain works on a reply
const cloud = document.getElementById('cloud');
function thinking(on) {
  const t = headTop();
  if (on && t) {
    cloud.style.left = t.x + 'px';
    cloud.style.top = t.y + 'px';
  }
  cloud.classList.toggle('on', !!on && !!t);
}

// little particles: hearts drifting up, sparkles, dust at her feet
function particle(text, x, y, cls, dx = 0, dy = -60, ms = 1400) {
  const el = document.createElement('span');
  el.className = 'particle ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  // they drift as far as she is big
  const k = Fx.scale();
  el.style.setProperty('--dx', dx * k + 'px');
  el.style.setProperty('--dy', dy * k + 'px');
  el.style.animationDuration = ms + 'ms';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms + 50);
}
function floatHearts(n) {
  const a = ready && Live2D.faceAnchor();
  if (!a) return;
  for (let i = 0; i < n; i++) {
    setTimeout(() => particle('♥', a.x + (Math.random() - 0.5) * a.headW * 1.4, a.y + a.modelH * 0.1,
      'heart-p', (Math.random() - 0.5) * 40, -70 - Math.random() * 50, 1500 + Math.random() * 500), i * 140);
  }
}
function sparkles(n) {
  const a = ready && Live2D.faceAnchor();
  if (!a) return;
  for (let i = 0; i < n; i++) {
    setTimeout(() => particle('✦', a.x + (Math.random() - 0.5) * a.headW * 1.6, a.y - a.modelH * 0.06 + (Math.random() - 0.5) * a.headW,
      'spark-p', (Math.random() - 0.5) * 20, -20 - Math.random() * 20, 900), i * 110);
  }
}
function dust(strength) {
  const a = ready && Live2D.faceAnchor();
  if (!a || MODE !== 'stepout') return;
  const feet = a.y - a.modelH * 0.09 + a.modelH;
  const n = Math.round(3 + strength * 5);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    particle('●', a.x + side * a.modelW * (0.08 + Math.random() * 0.12), feet - 4, 'dust-p',
      side * (20 + Math.random() * 40 * (1 + strength)), -6 - Math.random() * 14, 600 + Math.random() * 300);
  }
}

// ---------------------------------------------------------------
// sounds: tiny made-up ones, no files. off unless he turns them on

let audio = null;
function sound(kind) {
  if (!settings.sounds) return;
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    const g = audio.createGain();
    g.connect(audio.destination);
    if (kind === 'step' || kind === 'land') {
      // a soft thud: a short burst of low noise
      const len = kind === 'land' ? 0.12 : 0.05;
      const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audio.createBufferSource();
      src.buffer = buf;
      const f = audio.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = kind === 'land' ? 260 : 500;
      src.connect(f);
      f.connect(g);
      g.gain.value = kind === 'land' ? 0.5 : 0.08;
      src.start(t);
    } else {
      const o = audio.createOscillator();
      o.type = 'sine';
      const [f0, f1, dur, vol] = kind === 'squeak' ? [700, 1300, 0.12, 0.12] : [500, 900, 0.07, 0.06];
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.06);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------
// her mood and the hour shape how lively she is out here

let pace = { speed: 1, hop: 4 };

// the consent + ratings gate (js/core/gate.js): rubs with a tier above everyday (features.json:
// thigh_rub) only happen when the gate says so. his settings come from her server, cached, live
const RUB_TIERS = { thigh: 'flirty' };
let comfort = Gate.comfort();
Gate.loadComfort().then(c => { comfort = c; });
Gate.onComfort(c => { comfort = c; });
Body.setRubGate((kind) => !RUB_TIERS[kind] || Gate.allowed(RUB_TIERS[kind], { comfort, mode: 'desktop' }));
// how close they are, for touches she isn't fond of yet (body.js)
const closeness = () => (Gauges.bondStage <= 2 ? 1 : Gauges.bondStage === 3 ? 2 : 3);
async function refreshMood() {
  try { await Gauges.fetchGauges(); } catch (e) {}
  Body.setCloseness(closeness());
  Feel.setStage(Gauges.bondStage);
  const m = moodTier({ affection: Gauges.affection, trust: Gauges.trust, tension: Gauges.tension });
  const part = daypart();
  Body.setMood(m, part);
  Moods.setContext({ stage: Gauges.bondStage, mood: m, animeTsun: !!Gauges.quirks?.anime_tsundere?.active });
  pace = {
    happy: { speed: 1.2, hop: 6 }, neutral: { speed: 1, hop: 4 }, nervous: { speed: 1.05, hop: 3 },
    upset: { speed: 0.8, hop: 2 }, scared: { speed: 0.85, hop: 2 },
  }[m] || { speed: 1, hop: 4 };
  if (part === 'night') pace = { speed: pace.speed * 0.85, hop: Math.max(1, pace.hop - 2) };
}

// ---------------------------------------------------------------
// "On the desktop" settings from the tray (desktop/main.js)

let settings = { walk: 50, doze: 5, watch: 50, quiet: false, sounds: false, hints: 'glow', talk: 50, showSpots: false, patFollow: 50 };
// walk/talk/watch/patFollow are 0..100 (desktop/often.js; old words still read). a stroll every
// 25-75 s at 50 %, quicker above, slower below, never at 0
function wanderRange() {
  const m = Often.mul(settings.walk);
  return m > 0 ? [25 / m, 75 / m] : null;
}
D?.onSettings?.((s) => {
  const before = settings.herPx;
  settings = { ...settings, ...s };
  applySize(before !== settings.herPx);
  Body.setWatch(Often.mul(settings.watch, 1.8));
  Body.setPatFollow(Often.mul(settings.patFollow, 1.8));
  if (settings.quiet) D?.stopWalk();
  showSpots(!!settings.showSpots);
});

// her size on the desktop (desktop/main.js setSize): the room over her
// head, and touch feedback that grows with her unless he switched that off
function applySize(changed) {
  const k = Number(settings.k) || 1;
  // never below 80%: the labels stop being readable
  const fk = settings.growFx === false ? 1 : Math.max(0.8, Math.min(2.2, k));
  if (MODE === 'stepout' && settings.headroom) document.body.style.setProperty('--headroom', settings.headroom + 'px');
  Fx.setScale(fk);
  Body.setCursorScale(fk);
  hoverKind = undefined; // fresh cursor icon on the next move
  if (changed) setTimeout(frame, 30);
}

// "Show touch spots": faint outlines of every spot that's on, while he
// plays with her normally. they follow her (and her tail) around
const spotsView = document.getElementById('spotsView');
let spotsTimer = null;
function showSpots(on) {
  clearInterval(spotsTimer);
  spotsTimer = null;
  spotsView.hidden = !on;
  if (!on) { spotsView.textContent = ''; return; }
  const els = {};
  const draw = () => {
    if (!ready || calibrating) { spotsView.hidden = true; return; }
    spotsView.hidden = false;
    const seen = new Set();
    for (const [kind, c] of Object.entries(Body.touchSpots())) {
      if (c.off) continue;
      for (const side of c.pair ? [1, -1] : [1]) {
        const p = Body.spotCircle(kind, side);
        if (!p) continue;
        const key = kind + side;
        seen.add(key);
        let el = els[key];
        if (!el) {
          el = els[key] = document.createElement('div');
          el.className = 'spot-outline';
          el.textContent = c.label;
          spotsView.appendChild(el);
        }
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
        el.style.width = Math.round(p.rx * 2) + 'px';
        el.style.height = Math.round(p.r * 2) + 'px';
      }
    }
    for (const [key, el] of Object.entries(els)) if (!seen.has(key)) { el.remove(); delete els[key]; }
  };
  draw();
  spotsTimer = setInterval(draw, 120);
}

window.addEventListener('resize', () => setTimeout(frame, 60));

// ---------------------------------------------------------------
// the pointer. over her: tap to talk, drag to carry her, right
// click for the menu. anywhere else the click goes through to
// whatever is under the window

function overUi(t) {
  return !!(t && t.closest && t.closest('.talk, .tools, .note, .help, .calib, .pin, .ask'));
}
function overHer(x, y) {
  return ready && !!Body.regionAt(x, y);
}

let through = null;
let wasRubbing = null;
let rubSince = 0;
function setThrough(on) {
  if (on === through) return;
  through = on;
  D?.setClickThrough(on);
}

// what's under the pointer shows in the cursor and a soft glow, so
// it's clear what a click there will do
const glow = document.getElementById('glow');
let hoverKind = null;
let glowTimer = null;
function showHover(region) {
  const kind = region ? region.kind : null;
  const key = region ? kind + ':' + region.side : null;
  if (key === hoverKind) return;
  hoverKind = key;
  document.body.style.cursor = Body.cursorFor(kind);
  // the glow only once the pointer rests on a spot for a moment, so
  // sweeping across her doesn't light her up everywhere. off entirely
  // with "Touch hints: cursor icon only"
  clearTimeout(glowTimer);
  glow.classList.remove('on');
  const g = settings.hints === 'cursor' || dozing ? null : Body.regionGlow(region);
  if (!g) return;
  glowTimer = setTimeout(() => {
    glow.style.left = g.x + 'px';
    glow.style.top = g.y + 'px';
    glow.style.width = Math.round((g.rx || g.r) * 2) + 'px';
    glow.style.height = Math.round(g.r * 2) + 'px';
    glow.classList.add('on');
    glowTimer = setTimeout(() => glow.classList.remove('on'), 1100);
  }, 280);
}

// waving back: a few quick turns of the pointer near her while she waves
let waveTrail = { dir: 0, flips: [], x: 0 };
function watchWaveBack(x, y) {
  if (!Body.waveBackWindow()) return;
  const a = Live2D.faceAnchor();
  if (!a || Math.hypot(x - a.x, y - a.y) > 320) return;
  const now = Date.now();
  const d = Math.sign(x - waveTrail.x);
  if (d && waveTrail.dir && d !== waveTrail.dir) waveTrail.flips.push(now);
  if (d) waveTrail.dir = d;
  waveTrail.x = x;
  waveTrail.flips = waveTrail.flips.filter(t => now - t < 1500);
  if (waveTrail.flips.length >= 3) {
    waveTrail.flips = [];
    Body.wavedBack();
    Body.setWaveWindow(5000);
    maybeSay('waveback');
    touched('waveback');
    TouchLog.tap('waveback');
    // a wave she started on her own: he answered it (the initiative engine)
    Feel.waved();
    Feel.initAnswer('wave', 'yes');
  }
}

// core feel: she sees his hand coming. when the cursor closes in on one of her spots she notices
// before the touch lands: her eyes go to the hand, then a lean in, a perk of the ears, a small
// flinch, or guarding a spot she's had enough of (core/feel/approach.js decides, by bond, mood,
// her favorites and how much she's had; feelbody.js shows it). only her body, so it's instant
let hand = null; // { x, y, t, dist } the last look at where his hand is
function seeHandComing(x, y) {
  const now = performance.now();
  if (hand && now - hand.t < 40) return;
  const spot = Body.nearestSpot(x, y);
  if (!spot) { hand = null; return; }
  const was = hand;
  hand = { x, y, t: now, dist: spot.dist };
  if (!was || now - was.t > 400 || spot.dist <= 0) return;
  // how fast it's closing in, in her heights a second
  const closing = ((was.dist - spot.dist) / spot.unit) / ((now - was.t) / 1000);
  const side = Math.sign(x - spot.faceX) || 1;
  const a = Feel.approach({
    spot: spot.kind, dist: spot.dist / spot.unit, closing, side, ctx: { stage: Gauges.bondStage },
    busy: dozing || calibrating || !!pin || walking || thrown,
  });
  if (!a) return;
  if (a.type !== 'guard') Body.lookAtPoint(x, y, 900);
  FeelBody.approach(a.type, a.power, a.side);
}

window.addEventListener('mousemove', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;
  if (press) return;
  const onUi = overUi(e.target);
  if (ready && !onUi && !wasRubbing) seeHandComing(e.clientX, e.clientY);
  const region = ready && !onUi ? Body.regionAt(e.clientX, e.clientY) : null;
  if (ready) watchWaveBack(e.clientX, e.clientY);
  const rub = ready && !onUi ? Body.pointerMove(e.clientX, e.clientY) : null;
  if (rub) { rubTrail(e.clientX, e.clientY); rubLabel(rub, region); }
  // how she feels about the rub, as it goes on
  if (rub) Moods.begin('rub', rub, Date.now(), { x: e.clientX, y: e.clientY }, 700);
  else if (wasRubbing) {
    Moods.end('rub');
    // she pulled her foot away from a tickle: had enough
    if (wasRubbing === 'feettickle' && Body.feetPulledAway()) Moods.burst('notready', 0.85, { x: e.clientX, y: e.clientY });
  }
  // the tally: a rub is one touch, however long it goes on
  if (rub !== wasRubbing) {
    if (rub) TouchLog.begin('rub', RUB_KIND[rub]);
    else TouchLog.end('rub');
  }
  if (rub && rub !== wasRubbing) {
    rubSince = Date.now();
    // a foot tickle counts as "feet" for the tickle attack combo
    if (touched(rub === 'tail' ? 'tailrub' : rub === 'feettickle' ? 'feet' : rub)) rubLabel(null);
  }
  // a rub that keeps going for a couple of seconds might get a word
  if (rub && RUB_TALK[rub] && Date.now() - rubSince > 2200) { maybeSay(RUB_TALK[rub]); rubSince = Infinity; }
  if (rub && !wasRubbing) {
    // a rub stops whatever she was doing, and wakes her up
    D?.stopWalk();
    if (dozing) wake(true);
  }
  wasRubbing = rub;
  showHover(region);
  setThrough(!(onUi || region));
}, true);
document.addEventListener('mouseleave', () => { Moods.end('rub'); if (!press) { setThrough(true); showHover(null); } });

// ---------------------------------------------------------------
// feedback at the pointer: a ripple where you click, a ring that
// fills while a hold builds up, a few sparkles while you rub, and a
// short label saying what just happened

const POKE_LABEL = { head: 'Poke!', cheek: 'Cheek poke', nose: 'Boop!', ear: 'Ear flick', shoulder: 'Tap tap',
  tail: 'Tail tug!', hand: 'Squeeze', side: 'Tickle!', thigh: 'Thigh poke', feet: 'Ticklish feet!' };
const RUB_LABEL = { head: 'Headpat', ear: 'Ear rub', side: 'Tickle!', thigh: 'Thigh rub', feet: 'Foot rub', feettickle: 'Foot tickle!', tail: 'Tail rub' };

// the ripple's shape and motion are the owner's picks (desktop/fx.js);
// with "let her pick" on, now and then she changes it to show how she
// takes the touch: shaky when it's a touch she isn't fond of yet, a
// burst of hearts for a hug or a headpat once they're close
function ripple(x, y, region) {
  const mine = region ? Fx.reactionRipple(region.kind, closeness(), Body.currentMood()) || Moods.rippleFor(region.kind) : null;
  Fx.ripple(x, y, mine || {});
}

const ring = document.getElementById('ring');
function holdRing(on, x, y, icon) {
  if (!on) { ring.classList.remove('on'); return; }
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  ring.style.setProperty('--hold', HOLD_MS + 'ms');
  ring.dataset.icon = icon || '';
  ring.classList.remove('on');
  void ring.offsetWidth;
  ring.classList.add('on');
}

let lastTrail = 0;
function rubTrail(x, y) {
  const now = Date.now();
  if (now - lastTrail < 140) return;
  lastTrail = now;
  const k = Fx.scale();
  particle('✦', x + (Math.random() - 0.5) * 14 * k, y + (Math.random() - 0.5) * 10 * k, 'spark-p', (Math.random() - 0.5) * 16, -18, 700);
}

// a rub's label: one steady tag above her head while the rub goes on.
// its words change only once he's settled on a spot (head and ears sit
// close together, a rub crosses between them all the time), it glides
// with her instead of popping up again at the mouse, and fades a moment
// after the rub stops
const rubTag = document.getElementById('rubLabel');
let rubShown = null, rubWant = null, rubWantSince = 0, rubHideTimer = null, rubSide = 1;
const RUB_SETTLE_MS = 450;
let rubQuietUntil = 0;
function rubLabel(kind, region) {
  clearTimeout(rubHideTimer);
  const now = Date.now();
  // a combo's own label is showing: stay out of its way for a moment
  if (!kind) rubQuietUntil = now + 1300;
  if (!kind || now < rubQuietUntil) { rubTag.classList.remove('on'); rubShown = null; return; }
  if (kind !== rubWant) { rubWant = kind; rubWantSince = now; }
  if (!rubShown || (kind !== rubShown && now - rubWantSince >= RUB_SETTLE_MS)) {
    rubShown = kind;
    rubTag.textContent = RUB_LABEL[kind] || '';
    if (region && region.kind === kind) rubSide = region.side === 'left' ? -1 : region.side === 'right' ? 1 : (region.side || 1);
  }
  // just above the spot being rubbed; head and ears share one place, so
  // crossing between them doesn't move it
  const c = Body.spotCircle(rubShown === 'ear' ? 'head' : rubShown, rubSide);
  const k = Fx.scale();
  const x = c ? c.x : lastX, y = c ? c.y - c.r - 8 * k : lastY - 26 * k;
  rubTag.style.left = Math.max(40 * k, Math.min(window.innerWidth - 40 * k, x)) + 'px';
  rubTag.style.top = Math.max(26 * k, y) + 'px';
  rubTag.classList.add('on');
  rubHideTimer = setTimeout(() => { rubTag.classList.remove('on'); rubShown = null; }, 900);
}

let labelTimer = null;
const label = document.getElementById('actionLabel');
function actionLabel(text, x, y) {
  if (!text) return;
  const ms = Fx.labelText(label, text, 1300);
  const k = Fx.scale();
  label.style.left = Math.max(40 * k, Math.min(window.innerWidth - 40 * k, x)) + 'px';
  label.style.top = Math.max(26 * k, y - 26 * k) + 'px';
  label.classList.remove('on');
  void label.offsetWidth;
  label.classList.add('on');
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => label.classList.remove('on'), ms);
}

// ---------------------------------------------------------------
// adjusting the touch spots: a circle per spot over her, drag it
// where it belongs, scroll on it to resize. the pairs (ears, cheeks,
// shoulders, sides, hands) mirror each other. Done saves them

let calibrating = false;
let calibEl = null;
function startCalibrate() {
  if (calibrating || !ready) return;
  calibrating = true;
  // she stays put while he works on her: no walks, no carrying, the
  // circles don't drag her along. she still breathes and fidgets
  D?.hold?.(true);
  D?.stopWalk();
  document.body.classList.add('calibrating');
  closeTalk(true);
  setThrough(false);
  const a = Live2D.faceAnchor();
  const u = a.modelH;
  const spots = JSON.parse(JSON.stringify(Body.touchSpots()));
  calibEl = document.createElement('div');
  calibEl.className = 'calib';
  calibEl.innerHTML = `<div class="calib-bar"><b>Drag each circle onto her.</b> Scroll on a circle to resize it, Shift + scroll to make it wider or narrower.
    Right-click a circle to link or unlink its left and right.
    Untick a spot below to switch it off. Ctrl+Z undoes.
    <span><label><input type="checkbox" data-do="mirror"> Mirror left and right</label>
    <button type="button" data-do="done">Done</button><button type="button" data-do="undo" disabled>Undo</button>
    <button type="button" data-do="reset">Reset</button>
    <button type="button" data-do="cancel">Cancel</button></span>
    <div class="calib-on"></div></div>`;
  document.body.appendChild(calibEl);
  // live2d/input.js drags and scrolls her inside the page on any press
  // or wheel over her; none of that gets past the adjusting layer
  for (const t of ['pointerdown', 'wheel', 'dblclick']) calibEl.addEventListener(t, (e) => e.stopPropagation());
  const mirrorBox = calibEl.querySelector('[data-do=mirror]');
  // undo: a copy of the spots before each change, Ctrl+Z or the button
  // puts the last one back
  const history = [];
  const undoBtn = calibEl.querySelector('[data-do=undo]');
  let lastWheel = 0;
  const remember = () => {
    history.push(JSON.stringify(spots));
    if (history.length > 50) history.shift();
    undoBtn.disabled = false;
  };
  const undo = () => {
    const prev = history.pop();
    undoBtn.disabled = !history.length;
    if (!prev) return;
    const back = JSON.parse(prev);
    // same objects, new contents: the circles hold on to them
    for (const k of Object.keys(spots)) {
      for (const key of Object.keys(spots[k])) delete spots[k][key];
      Object.assign(spots[k], back[k]);
    }
    place();
  };
  calibEl._keys = (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') endCalibrate();
  };
  window.addEventListener('keydown', calibEl._keys, true);
  // which spots are on: a tick per spot, unticked catches nothing
  const onList = calibEl.querySelector('.calib-on');
  for (const [kind, s] of Object.entries(spots)) {
    const lab = document.createElement('label');
    lab.innerHTML = '<input type="checkbox"> ';
    lab.append(s.label);
    const box = lab.querySelector('input');
    box.dataset.kind = kind;
    box.addEventListener('change', () => {
      remember();
      if (box.checked) delete spots[kind].off; else spots[kind].off = true;
      place();
    });
    onList.appendChild(lab);
  }
  const pairs = Object.keys(spots).filter(k => spots[k].pair);
  const syncMirrorBox = () => {
    const linked = pairs.filter(k => !spots[k].left).length;
    mirrorBox.checked = linked === pairs.length;
    mirrorBox.indeterminate = linked > 0 && linked < pairs.length;
  };
  // where a circle is, and how to move it: the right one of a pair (and
  // a linked left) live in dx/dy/r, an unlinked left in .left
  const own = (kind, side) => (side < 0 && spots[kind].left ? spots[kind].left : spots[kind]);
  const unlink = (kind) => {
    const s = spots[kind];
    if (!s.left) s.left = { dx: -s.dx, dy: s.dy, r: s.r, w: s.w || 1 };
  };
  const link = (kind) => { delete spots[kind].left; };
  const circles = [];
  // her tail's spot is the tail itself, it follows her tail around
  const tailAuto = Body.tailFollows();
  const place = () => {
    for (const box of onList.querySelectorAll('input')) box.checked = !spots[box.dataset.kind].off;
    for (const c of circles) {
      const s = spots[c.kind];
      c.el.classList.toggle('off', !!s.off);
      if (c.kind === 'tail' && tailAuto) {
        const t = Body.spotCircle('tail');
        if (!t) continue;
        c.el.style.left = t.x + 'px';
        c.el.style.top = t.y + 'px';
        c.el.style.width = c.el.style.height = Math.round(t.r * 2) + 'px';
        continue;
      }
      const o = own(c.kind, c.side);
      const dx = c.side < 0 && s.left ? o.dx : (s.pair ? c.side : 1) * o.dx;
      c.el.style.left = (a.x + dx * u) + 'px';
      c.el.style.top = (a.y + o.dy * u) + 'px';
      c.el.style.width = Math.round(o.r * (o.w || s.w || 1) * u * 2) + 'px';
      c.el.style.height = Math.round(o.r * u * 2) + 'px';
      c.el.classList.toggle('unlinked', !!(s.pair && s.left));
    }
    syncMirrorBox();
  };
  for (const [kind, s] of Object.entries(spots)) {
    for (const side of s.pair ? [1, -1] : [1]) {
      const el = document.createElement('div');
      el.className = 'calib-spot';
      el.textContent = s.label;
      calibEl.appendChild(el);
      circles.push({ kind, side, el });
      if (kind === 'tail' && tailAuto) {
        el.classList.add('auto');
        el.textContent = 'Tail (follows it)';
        el.title = 'Her tail moves, so this spot is the tail itself. Nothing to place.';
        continue;
      }
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        remember();
        const move = (ev) => {
          const x = (ev.clientX - a.x) / u, y = (ev.clientY - a.y) / u;
          if (side < 0 && spots[kind].left) Object.assign(spots[kind].left, { dx: x, dy: y });
          else Object.assign(spots[kind], { dx: x * (s.pair ? side : 1), dy: y });
          place();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        // one undo step per scroll, not per notch
        if (Date.now() - lastWheel > 500) remember();
        lastWheel = Date.now();
        const o = own(kind, side);
        const k = e.deltaY < 0 ? 1.08 : 0.93;
        // shift + scroll: wider or narrower (an oval), plain scroll: bigger or smaller
        if (e.shiftKey) o.w = Math.max(0.4, Math.min(4, (o.w || s.w || 1) * k));
        else o.r = Math.max(0.008, Math.min(0.15, o.r * k));
        place();
      }, { passive: false });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!s.pair) return;
        remember();
        if (spots[kind].left) link(kind); else unlink(kind);
        place();
      });
    }
  }
  place();
  // the tail swishes while he works, its circle keeps up
  if (tailAuto) calibEl._tailTimer = setInterval(() => { if (calibEl) place(); }, 120);
  mirrorBox.addEventListener('change', () => {
    remember();
    for (const k of pairs) { if (mirrorBox.checked) link(k); else unlink(k); }
    place();
  });
  calibEl.querySelector('.calib-bar').addEventListener('click', (e) => {
    const what = e.target.dataset && e.target.dataset.do;
    if (!what || what === 'mirror') return;
    if (what === 'done') { Body.saveTouchSpots(spots); endCalibrate(); actionLabel('Touch spots saved', a.x, a.y); }
    else if (what === 'cancel') endCalibrate();
    else if (what === 'undo') undo();
    else if (what === 'reset') {
      remember();
      for (const [k, d] of Object.entries(Body.SPOT_DEFAULTS)) {
        Object.assign(spots[k], { dx: d.dx, dy: d.dy, r: d.r, w: d.w || 1 });
        delete spots[k].left;
        delete spots[k].off;
      }
      place();
    }
  });
}
function endCalibrate() {
  calibrating = false;
  D?.hold?.(false);
  document.body.classList.remove('calibrating');
  if (calibEl) {
    clearInterval(calibEl._tailTimer);
    window.removeEventListener('keydown', calibEl._keys, true);
    calibEl.remove();
  }
  calibEl = null;
  hoverKind = undefined;
}

// a press on her: a click (poke or talk), a hold (hand, hug) or a
// drag (pick her up). which one is decided by what the pointer does
// next, never by guessing up front
const HOLD_MS = 450;
let press = null;
let lastTap = 0;
window.addEventListener('pointerdown', (e) => {
  if (overUi(e.target)) return;
  const region = ready ? Body.regionAt(e.clientX, e.clientY) : null;
  if (!region) return;
  // ours, not live2d/input.js's: that one drags her around INSIDE
  // the canvas, here a drag carries the whole window
  e.stopPropagation();
  e.preventDefault();
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY, cx: e.clientX, cy: e.clientY, dragging: false, id: e.pointerId, region, hold: null, holdTimer: null, hugTimer: null };
  const p = press;
  // a press takes over from a hover rub
  Moods.end('rub');
  ripple(e.clientX, e.clientY, region);
  // holds: her hand (hold hands), her torso (a hug), her tail (grab it)
  if (region.kind === 'hand' || region.kind === 'hug' || region.kind === 'tail' || region.kind === 'thigh' || region.kind === 'feet') {
    // a ring fills around the pointer while the hold builds up, so it's
    // clear that keeping the button down does something
    holdRing(true, e.clientX, e.clientY, { hand: '🤝', hug: '🤗', tail: '✊', thigh: '🤏', feet: '✋' }[region.kind]);
    p.holdTimer = setTimeout(() => {
      if (press !== p || p.dragging) return;
      if (dozing) wake(true);
      D?.stopWalk();
      holdRing(false);
      if (region.kind === 'tail') {
        p.hold = 'tail';
        p.holdAt = Date.now();
        TouchLog.begin('hold', 'tailgrab');
        const combo = touched('tailgrab');
        p.talkTimer = setTimeout(() => { if (p.hold === 'tail') maybeSay('tailgrab'); }, 2000);
        Body.tailGrab(true);
        Moods.begin('press', 'tailgrab', p.holdAt, { x: e.clientX, y: e.clientY });
        document.body.style.cursor = Body.cursorFor('tailgrab');
        if (!combo) actionLabel('Tail grab', e.clientX, e.clientY);
        p.hugTimer = setInterval(() => Body.tailGrabTick(Date.now() - p.holdAt), 260);
      } else if (region.kind === 'thigh') {
        // a squish: how she takes it depends on how close they are
        p.hold = 'thigh';
        p.holdAt = Date.now();
        TouchLog.begin('hold', 'thighsquish');
        const combo = touched('thighsquish');
        p.talkTimer = setTimeout(() => { if (p.hold === 'thigh') maybeSay('thighsquish'); }, 1800);
        Body.thighSquish(true, region.side, closeness());
        Moods.begin('press', 'thighsquish', p.holdAt, { x: e.clientX, y: e.clientY });
        document.body.style.cursor = Body.cursorFor('squishing');
        if (!combo) actionLabel('Thigh squish', e.clientX, e.clientY);
        p.hugTimer = setInterval(() => {
          if (!Body.thighSquishTick(Date.now() - p.holdAt)) return;
          // she wriggles free: the hold is over, the button can stay down
          clearInterval(p.hugTimer);
          clearTimeout(p.talkTimer);
          Body.thighSquish(false);
          TouchLog.end('hold');
          Moods.end(p.pinned ? 'pin' : 'press');
          Moods.burst('notready', 0.85, { x: e.clientX, y: e.clientY });
          p.hold = 'freed';
          document.body.style.cursor = '';
          actionLabel('She wriggled free', e.clientX, e.clientY - 22);
        }, 260);
      } else if (region.kind === 'feet') {
        // a foot rub: press and hold. how she takes it depends on the bond
        p.hold = 'feet';
        p.holdAt = Date.now();
        TouchLog.begin('hold', 'footrub');
        const combo = touched('footrub');
        p.talkTimer = setTimeout(() => { if (p.hold === 'feet') maybeSay('feetrub'); }, 2200);
        document.body.style.cursor = Body.cursorFor('feet');
        if (!combo) actionLabel('Foot rub', e.clientX, e.clientY);
        Moods.begin('press', 'footrub', p.holdAt, { x: e.clientX, y: e.clientY });
        p.hugTimer = setInterval(() => {
          Body.feetRub(Date.now() - p.holdAt);
          if (!Body.feetPulledAway()) return;
          // she pulled her foot away: the rub is over
          clearInterval(p.hugTimer);
          clearTimeout(p.talkTimer);
          TouchLog.end('hold');
          Moods.end(p.pinned ? 'pin' : 'press');
          Moods.burst('notready', 0.85, { x: e.clientX, y: e.clientY });
          p.hold = 'freed';
          document.body.style.cursor = '';
          actionLabel('She pulled her foot away', e.clientX, e.clientY - 22);
        }, 260);
      } else if (region.kind === 'hand') {
        TouchLog.begin('hold', 'hand');
        const combo = touched('hand');
        p.hold = 'hand';
        p.talkTimer = setTimeout(() => { if (p.hold === 'hand') maybeSay('hand'); }, 2200);
        Body.handhold(region.side, true);
        Moods.begin('press', 'hand', Date.now(), { x: e.clientX, y: e.clientY });
        document.body.style.cursor = Body.cursorFor('holding');
        if (!combo) actionLabel('Holding hands', e.clientX, e.clientY);
        p.hugTimer = setInterval(() => { if (Math.random() < 0.3) floatHearts(1); }, 700);
      } else {
        TouchLog.begin('hold', 'hug');
        const combo = touched('hug');
        p.hold = 'hug';
        p.talkTimer = setTimeout(() => { if (p.hold === 'hug') maybeSay('hug'); }, 1800);
        Body.hug(true);
        Moods.begin('press', 'hug', Date.now(), { x: e.clientX, y: e.clientY });
        document.body.style.cursor = Body.cursorFor('hugging');
        if (!combo) actionLabel('Hug', e.clientX, e.clientY);
        p.hugTimer = setInterval(() => { Body.hugTick(); floatHearts(1); }, 260);
      }
    }, HOLD_MS);
  }
  // her head: hold-to-pat, like the game. a short hold or the first
  // bit of movement starts it, a quick click stays a poke
  if (region.kind === 'head') p.patTimer = setTimeout(() => startPat(p, e.clientX, e.clientY), PAT_HOLD_MS);
  try { stageEl.setPointerCapture(e.pointerId); } catch (err) {}
}, true);

const PAT_HOLD_MS = 160;
function startPat(p, x, y) {
  clearTimeout(p.patTimer);
  if (press !== p || p.hold || p.dragging) return;
  if (dozing) wake(true);
  D?.stopWalk();
  p.hold = 'pat';
  TouchLog.begin('hold', 'headpat');
  Body.patHoldStart(x, y);
  Moods.begin('press', 'head', Date.now(), { x, y });
  document.body.style.cursor = Body.cursorFor('head');
  if (!touched('head')) rubLabel('head', p.region);
  else rubLabel(null);
}

function endHold(p) {
  clearTimeout(p.holdTimer);
  clearTimeout(p.patTimer);
  if (p.hold === 'pat') Body.patHoldEnd();
  if (!p.pinned) { TouchLog.end('hold'); Moods.end('press'); }
  clearTimeout(p.talkTimer);
  holdRing(false);
  hoverKind = undefined; // the cursor goes back to the spot's icon on the next move
  clearInterval(p.hugTimer);
  if (p.hold === 'hand') Body.handhold(p.region.side, false);
  if (p.hold === 'hug') Body.hug(false);
  if (p.hold === 'tail') Body.tailGrab(false);
  if (p.hold === 'thigh') Body.thighSquish(false);
  const had = p.hold;
  p.hold = null;
  return had;
}

window.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  e.stopPropagation();
  if (press.dragging) Body.carryMove(e.screenX, e.screenY);
  // holding her hand or hugging her: the mouse can wander, she stays.
  // letting go of the button is the only way out of a hold
  if (press.hold === 'pat') {
    // the hand follows the mouse, her head goes with it
    Body.patHoldMove(e.clientX, e.clientY);
    Moods.at('press', e.clientX, e.clientY);
    rubTrail(e.clientX, e.clientY);
    rubLabel('head', press.region);
    return;
  }
  if (press.hold) {
    if (press.hold === 'hand') Body.lookAtPoint(e.clientX, e.clientY, 600);
    return;
  }
  // on her head, moving is patting, not picking her up
  if (press.region.kind === 'head' && !press.dragging) {
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) >= 3) {
      startPat(press, press.cx, press.cy);
      Body.patHoldMove(e.clientX, e.clientY);
    }
    return;
  }
  if (press.dragging || Math.hypot(e.screenX - press.x, e.screenY - press.y) < 6) return;
  // moved before the hold kicked in: that's picking her up
  clearTimeout(press.holdTimer);
  holdRing(false);
  press.dragging = true;
  releasePin();
  if (dozing) wake(false);
  showHover(null);
  D?.dragStart();
  Body.setCarried(true);
  shadow.classList.add('lifted');
}, true);

const endPress = (e) => {
  if (!press || e.pointerId !== press.id) return;
  e.stopPropagation();
  const p = press;
  press = null;
  if (endHold(p)) return;
  if (p.dragging) {
    D?.dragEnd();
    // compact doesn't fall, it just stays where it was put
    if (MODE !== 'stepout') { Body.landed(); shadow.classList.remove('lifted'); }
    return;
  }
  // a click at the end of a rub is part of the rub
  if (Body.rubbing()) return;
  if (e.type === 'pointercancel') return;
  const now = Date.now();
  // the torso and the rest of her body: a tap to talk. everything else a poke
  if (p.region.kind !== 'body' && p.region.kind !== 'hug') {
    // a spot on her: a poke, not a tap to talk
    lastTap = 0;
    if (dozing) wake(true);
    D?.stopWalk();
    actionLabel(POKE_LABEL[p.region.kind] || 'Poke', e.clientX, e.clientY);
    if (Body.poke(p.region)) { actionLabel('Too many pokes!', e.clientX, e.clientY - 22); react('poked'); Moods.burst('notready', 0.95); Feel.poke(p.region.kind); }
    else { maybeSay(POKE_TALK[p.region.kind]); Moods.poke(p.region.kind, { x: e.clientX, y: e.clientY }); }
    touched(p.region.kind);
    TouchLog.tap(POKE_KIND[p.region.kind]);
    return;
  }
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
  // in the middle of a hold or a rub, a right-click leaves that hand there
  if ((press && press.hold) || wasRubbing) { pinHand(); return; }
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
// footstep sounds in time with her stride
let stepTimer = null;
function startSteps() {
  stopSteps();
  if (!settings.sounds) return;
  stepTimer = setInterval(() => sound('step'), Body.TUNE.strideMs / 2);
}
function stopSteps() { clearInterval(stepTimer); stepTimer = null; }
D?.onWalk(({ state, dir, speed, edge, kind }) => {
  if (state === 'walking') {
    walking = true;
    Body.walking(dir || 1);
    shadow.classList.add('walking');
    shadow.style.setProperty('--step', (Body.TUNE.strideMs / 2) + 'ms');
    startSteps();
    if (Math.random() < 0.25 && pace.speed >= 1.2) showEmote('note');
    return;
  }
  if (state === 'flying') { thrown = true; shadow.classList.add('lifted'); return; }
  if (state === 'onspot') {
    // hopped into one of her spots: she settles in, the spot's her floor now
    thrown = false;
    walking = false;
    Body.walking(0);
    Body.landed();
    Body.sit(kind);
    sound('land');
    setTimeout(() => showEmote(kind === 'bed' ? 'zzz' : 'note'), 500);
    return;
  }
  if (state === 'offspot') {
    Body.sit(null);
    shadow.classList.remove('lifted');
    return;
  }
  if (state === 'bonk') { showEmote('bonk'); return; }
  walking = false;
  Body.walking(0);
  shadow.classList.remove('walking');
  stopSteps();
  // she came over to his cursor (the initiative engine): now she does what she came for
  if (arrive) {
    const f = arrive;
    arrive = null;
    if (state === 'stopped' && Date.now() < f.until) setTimeout(f.done, 280);
  }
  if (state === 'landed') {
    Body.landed();
    shadow.classList.remove('lifted');
    // the harder she comes down, the more dust and squash
    const hard = Math.min(1, Math.max(0, ((speed || 0) - 300) / 1500));
    dust(hard);
    sound('land');
    if (hard > 0.4) {
      stageEl.classList.remove('squash');
      void stageEl.offsetWidth;
      stageEl.classList.add('squash');
    }
    // thrown half off the screen: she peeks back in, then walks back
    if (edge) {
      setTimeout(() => { Body.peek(edge); showEmote('question'); }, 700);
      setTimeout(() => D?.wander({ ...pace, back: true }), 2600);
    }
  }
  if (state === 'landed' && MODE === 'stepout') {
    // not every single time he moves her, that gets old
    drops++;
    if (thrown) { Feel.toss(); react('thrown'); }
    else if (drops === 1 || Math.random() < 0.3) react('dropped');
  }
  thrown = false;
});
D?.onFly?.(({ vx, vy }) => Body.flyVelocity(vx, vy));

function doze() {
  if (dozing || busy) return;
  dozing = true;
  dozeAt = Date.now();
  Feel.resting(true);
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
  Feel.resting(false);
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
  idleSeen = { sec: Number(seconds) || 0, at: Date.now() };
  if (!ready) return;
  // at night she nods off sooner
  if (daypart() === 'night' && Number.isFinite(dozeAfter)) dozeAfter = Math.min(dozeAfter, 120);
  // and in her bed sooner still
  if (Body.sittingIn() === 'bed' && Number.isFinite(dozeAfter)) dozeAfter = Math.min(dozeAfter, Math.max(60, dozeAfter / 2));
  if (seconds >= dozeAfter) doze();
  else if (dozing && seconds < 30) wake(true);
});

// a stroll every so often, when she isn't busy with him
function scheduleWander() {
  const range = wanderRange() || [30, 60];
  setTimeout(() => {
    const may = !!wanderRange() && !settings.quiet;
    if (may && !calibrating && MODE === 'stepout' && ready && !busy && !dozing && !walking && !press && talk.hidden && !Body.patting()) D?.wander(pace);
    scheduleWander();
  }, (range[0] + Math.random() * (range[1] - range[0])) * 1000);
}

// and in between, she fidgets: looks around, stretches, yawns,
// rests her legs, waves at the cursor when it's moving
function scheduleMoves() {
  setTimeout(() => {
    if (ready && !calibrating && !busy && !dozing && !walking && !press) {
      // now and then a thought of her own instead of a move
      const part = daypart();
      const mood = Body.currentMood();
      if (Math.random() < 0.18) {
        const close = closeness();
        const hour = new Date().getHours();
        const pool = ['question', 'note', 'dots', 'idea', 'a_load', 'a_binary', 'a_beep', 'gear'];
        if (part === 'morning') pool.push('coffee', 'coffee', 'sun', 'a_ok');
        if (hour >= 11 && hour < 14) pool.push('snack', 'snack');
        if (hour >= 16 && hour < 22) pool.push('game', 'snack');
        if (part === 'night') pool.push('moon', 'moon', 'zzz', 'sleepy', 'a_load');
        // past midnight, her android side: running low
        if (hour >= 0 && hour < 5) pool.push('battery', 'battery');
        if (mood === 'happy') pool.push('note', 'notes', 'flower', 'star', 'hearts', 'a_cat', 'a_happy', 'paw');
        if (mood === 'happy' && close >= 2) pool.push('smug', 'a_owo', 'a_wink');
        if (mood === 'happy' && close >= 3) pool.push('twohearts', 'sparkheart', 'a_heart');
        if (close >= 3 && Math.random() < 0.3) pool.push('a_love');
        if (mood === 'nervous' || mood === 'scared') pool.push('sweat', 'sweat', 'a_fluster', 'a_shock');
        if (mood === 'upset') pool.push('dots', 'anger', 'hmph', 'a_flat', 'a_cry');
        pool.push(...Feel.thoughtExtras());
        showEmote(Fx.pickFromPool(pool, (list) => Feel.Repeat.pick('thought', list)));
      } else {
        Body.idleMove();
      }
    }
    scheduleMoves();
  }, 12000 + Math.random() * 22000);
}

// a long enough headpat gets a word out of her, now and then
let patSpoke = 0;
let lastSparkle = 0;
function onHeadpat(ms) {
  if (ms > 1500 && Date.now() - lastSparkle > 700) {
    lastSparkle = Date.now();
    sparkles(2);
    if (ms > 3000 && Math.random() < 0.4) floatHearts(1);
  }
  if (ms > 2500 && Date.now() - patSpoke > 120000 && Math.random() < 0.5 * Often.mul(settings.talk)) {
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
D?.onCursor?.(({ x, y }) => {
  cur = { x, y, at: Date.now() };
  if (ready && !press) { Body.cursor(x, y); watchHisWave(x, y); }
});

D?.onCommand((cmd) => {
  if (cmd === 'go-inside') goInside();
  else if (cmd === 'calibrate') startCalibrate();
  else if (cmd === 'kick') { Body.kick(); showEmote(Math.random() < 0.5 ? 'star' : 'note'); sound('pop'); }
  else if (cmd === 'talk') openTalk();
  // fetch: he threw the ball (she may have been hoping he would); the round is over
  else if (cmd === 'ball-thrown') Feel.fetch();
  else if (cmd === 'ball-rest') fetchRoundOver();
});

// ---------------------------------------------------------------
// the initiative engine (#4): what she starts on her own. core/feel/initiative.js decides (her
// wants, the room, the ladder, how she takes his answer); this plays it on her. Every few
// seconds she thinks about it, and most of the time nothing comes of it.
//
// a new thing she can start = a row in initiative.js ACTIONS + an entry in INIT_PLAY here

const Init = Feel.Initiative;
const INIT_T = Feel.Tune.TUNE.init;
const askEl = document.getElementById('ask');
const askText = document.getElementById('askText');
let cur = null;                       // his cursor, window px (the app's feed + mousemove)
let idleSeen = { sec: 0, at: 0 };     // seconds without any input, as of when
let arrive = null;                    // { done, until }: she's walking over to his cursor
let askFor = null, askTimer = null;

const initOn = () => Features.isOn('initiative');
const chance = (p) => Math.random() < p;
const talkMul = () => (settings.quiet ? 0 : Often.mul(settings.talk));
const pickNew = (ch, list) => Feel.Repeat.pick(ch, list);
const herUnit = () => Number(settings.herPx) || window.innerHeight * 0.8;
// which side of her his hand is on (-1 left on screen, 1 right)
function handSide() {
  const a = ready && Live2D.faceAnchor();
  return a && cur ? Math.sign(cur.x - a.x) || 1 : 1;
}
function glanceAtHand(ms = 1600) { if (cur) Body.lookAtPoint(cur.x, cur.y, ms); }
// she can't start anything right now / he's with her right now (an open ask waits, it isn't "ignored")
const initBusy = () => !ready || busy || dozing || calibrating || leaving || walking || thrown || !!press || !!arrive;
const initEngaged = () => !!pin || Body.rubbing() || Body.patting() || document.activeElement === input
  || (MODE === 'stepout' && !talk.hidden);
function idleNow() {
  const now = Date.now();
  let s = idleSeen.at ? idleSeen.sec + (now - idleSeen.at) / 1000 : 0;
  const moved = Math.max(cur ? cur.at : 0, lastMoveAt);
  if (moved > idleSeen.at) s = Math.min(s, (now - moved) / 1000);
  return s;
}
function initLive() {
  return { idleSec: idleNow(), cursorAt: Math.max(cur ? cur.at : 0, lastMoveAt), quietMode: !!settings.quiet, stage: Gauges.bondStage,
    can: { fetch: MODE === 'stepout' && !!D?.offerBall && !Body.sittingIn() }, busy: initBusy(), engaged: initEngaged(),
    opts: { talk: talkMul() > 0 } };
}
function initTick() {
  if (!ready || document.hidden) return;
  let out = [];
  try { out = Init.tick(initLive()); } catch (e) { console.warn('initiative', e); }
  for (const d of out) initPlay(d);
}
function initPlay(d) {
  if (!ready || !d) return;
  if (d.do === 'act') { if (d.how === 'harder') tryHarder(d); (INIT_PLAY[d.id] || (() => {}))(d); }
  else if (d.do === 'letgo') initLetGo(d);
  else if (d.do === 'lit') initLit(d);
  else if (d.do === 'toldno') initToldNo(d);
  else if (d.do === 'melt') { hideAsk(); Body.lightUp('shy', 0.6); showEmote(pickNew('emote', ['heart', 'a_blush', 'sparkle'])); Moods.burst('comforted', 0.6); }
}
Feel.onChange((ev) => { if (ev.type === 'init') initPlay(ev.d); });

// one short line of her own about what she wants (step 4 of the ladder, and now and then after
// an answer). her brain writes the words; this only says what's going on
async function initSay(what) {
  if (!ready || busy || talkMul() <= 0) return;
  lastReactAt = Date.now();
  let note = `${OOC}${what} Say one short line out loud, in character, the way you honestly feel about him right now. No narration.)`;
  const lately = Feel.switches().repeat ? Feel.Repeat.recent('line', 3) : [];
  if (lately.length) note = note.replace(/\)$/, ` Say something different from what you said just now: ${lately.map(l => '"' + l + '"').join(', ')}.)`);
  await ask(note, { ephemeral: true, fallback: '' });
}
const whyWords = (d) => (d.why && d.why.length ? ' (' + d.why.join(', ') + ')' : '');

// her question bubble. id = what a Yes / Not now answers; null = just words that fade
function showAsk(text, id, ms = 0) {
  const t = headTop();
  if (!t || !text) return;
  clearTimeout(askTimer);
  askFor = id;
  askText.textContent = text;
  askEl.classList.toggle('plain', !id);
  askEl.classList.remove('bye');
  askEl.hidden = false;
  // over her head, kept inside her window
  const w = askEl.offsetWidth, h = askEl.offsetHeight;
  askEl.style.left = Math.max(w / 2 + 4, Math.min(window.innerWidth - w / 2 - 4, t.a.x)) + 'px';
  askEl.style.top = Math.max(h + 4, t.y - 6 * Fx.scale()) + 'px';
  sound('pop');
  if (ms) askTimer = setTimeout(hideAsk, ms);
}
function hideAsk() {
  clearTimeout(askTimer);
  askFor = null;
  if (askEl.hidden) return;
  askEl.classList.add('bye');
  askTimer = setTimeout(() => { askEl.hidden = true; askEl.classList.remove('bye'); }, 200);
}
document.getElementById('askYes').addEventListener('click', () => {
  const id = askFor;
  hideAsk();
  if (!id) return;
  Feel.initAnswer(id, 'yes');
  // and now the thing itself: she offers her head, or tosses him the ball
  if (id === 'headpat') setTimeout(() => Body.askPat(handSide(), 1), 900);
  if (id === 'fetch') setTimeout(() => D?.offerBall?.('toss'), 700);
});
document.getElementById('askNo').addEventListener('click', () => {
  const id = askFor;
  hideAsk();
  if (id) Feel.initAnswer(id, 'no');
});

// she walks over to his cursor first (out on the desktop, when it's a way off), then done()
function comeOver(done) {
  const a = Live2D.faceAnchor();
  const far = a && cur && Math.abs(cur.x - a.x) > herUnit() * 0.55;
  if (MODE !== 'stepout' || !D?.walkToCursor || !far || Body.sittingIn()) { done(); return; }
  arrive = { done, until: Date.now() + 15000 };
  setTimeout(() => { if (arrive && Date.now() > arrive.until) arrive = null; }, 15500);
  D.walkToCursor(pace);
}
// ignored, and she tries a step harder: a little more insistent, a little cuter
function tryHarder(d) {
  if (d.rung >= 3 && chance(0.6)) Body.play('hop');
  else Body.play('ears');
}

// how each step of the ladder looks, per thing she can start (step 1 a body hint, 2 a thought
// icon, 3 she comes over / does it nearby, 4 says something, 5 asks)
const INIT_PLAY = {
  headpat(d) {
    const side = handSide();
    if (d.rung === 1) {
      glanceAtHand(1800);
      const m = pickNew('hint', ['tilt', 'ears', 'tail', 'sigh']);
      if (m === 'tilt') Body.askPat(side, 0.3, 1900); else Body.play(m);
    } else if (d.rung === 2) {
      glanceAtHand(1400);
      showEmote(d.icon || 'heart');
      Body.askPat(side, 0.35, 2200);
    } else if (d.rung === 3) {
      comeOver(() => { glanceAtHand(2400); Body.askPat(handSide(), 0.8); if (chance(0.5)) setTimeout(() => showEmote(d.icon || 'pat'), 500); });
    } else if (d.rung === 4) {
      Body.askPat(side, 0.6);
      initSay(`You'd really like a headpat from Anon right now${whyWords(d)}. Hint at it or ask for it in your own way; you can be shy about it.`);
    } else {
      comeOver(() => { Body.askPat(handSide(), 0.9, 4200); showAsk(d.text || 'Headpat?', 'headpat'); });
    }
  },
  wave(d) {
    // he has longer to wave back than after one of her passing waves
    Body.setWaveWindow(INIT_T.waveBackMs);
    glanceAtHand(1200);
    Body.play(closeness() === 1 && chance(0.6) ? 'smallWave' : 'wave');
  },
  fetch(d) {
    if (d.rung === 1) Body.play(pickNew('hint', ['lookAround', 'tail', 'hop']));
    else if (d.rung === 2) { glanceAtHand(1400); showEmote(d.icon || 'ball'); }
    else if (d.rung === 3) {
      // she brings the ball over (or throws it his way when she's feeling lively)
      const lively = Body.currentMood() === 'happy' || (Feel.Needs.levels().play || 0) >= 0.75;
      D?.offerBall?.(lively && chance(0.4) ? 'toss' : 'bring');
      setTimeout(() => showEmote(d.icon || 'ball'), 700);
    } else if (d.rung === 4) {
      Body.askPlay(0.7);
      initSay(`You really want to play fetch with Anon right now${whyWords(d)}. Say so in your own way.`);
    } else {
      Body.askPlay(0.9);
      showAsk(d.text || 'Fetch?', 'fetch');
    }
  },
};

// no answer, and she lets it go. never a penalty: at most a shrug or a small pout
function initLetGo(d) {
  hideAsk();
  if (d.id === 'wave') Body.setWaveWindow(5000);
  if (d.rung <= 2 || d.how === 'fine') return;
  const name = Init.ACTIONS[d.id]?.name || 'that';
  if (d.how === 'shrug') { Body.play('shrug'); if (chance(0.4)) showEmote(pickNew('emote', ['dots', 'a_flat', 'note'])); }
  else if (d.how === 'pout') { Body.play('pout'); showEmote(pickNew('emote', ['hmph', 'a_flat', 'dots'])); }
  else if (d.how === 'own') {
    // off to her own thing for a while
    showEmote(pickNew('emote', ['dots', 'note', 'a_load']));
    setTimeout(() => { if (!initBusy() && MODE === 'stepout' && !settings.quiet && wanderRange()) D?.wander(pace); }, 900);
    setTimeout(() => { if (!initBusy()) Body.play(pickNew('idle', ['rest', 'stretch', 'lookAround'])); }, 6000);
  }
  if (chance(0.15 * talkMul())) {
    initSay(`You tried to get ${name} from Anon just now but he was too busy to notice, so you let it go (${d.how === 'pout' ? 'a small pout, nothing more' : 'no hard feelings'}).`);
  }
}
// he took her up on it: she lights up
const LIT_EMOTES = { bright: ['sparkle', 'a_happy', 'heart'], bounce: ['star', 'notes', 'a_owo'], shy: ['a_blush', 'smug', 'dots'], melt: ['heart', 'a_heart', 'twohearts'] };
function initLit(d) {
  hideAsk();
  // a wave back already has its own moment (Body.wavedBack)
  if (d.id !== 'wave') {
    Body.lightUp(d.how, d.power);
    showEmote(pickNew('emote', LIT_EMOTES[d.how] || LIT_EMOTES.bright));
    Moods.burst(d.how === 'shy' && closeness() <= 2 ? 'secret' : d.power > 0.75 ? 'loves' : 'likes', d.power * 0.8);
  }
  if (d.asked && chance(0.4 * talkMul())) {
    initSay(`You asked Anon for ${Init.ACTIONS[d.id]?.name || 'something'} and he said yes. You're ${d.how === 'shy' ? 'pleased and trying not to show it' : 'really happy about it'}.`);
  }
}
// he said no. by how much she wanted it, her mood and the dice (initiative.js): she takes it
// well, pouts, asks once more, sulks a little, pretends she didn't care, says "later then", or
// offers something else. short, and it melts with a kind gesture
const LATER = ['Later, then.', 'Later? Promise?', 'Okay. Later.', 'I\'ll ask again.'];
function initToldNo(d) {
  const name = Init.ACTIONS[d.id]?.name || 'that';
  if (d.how === 'please') {
    if (d.id === 'fetch') Body.askPlay(1); else Body.askPat(handSide(), 1, 4200);
    setTimeout(() => showAsk(d.text || 'Pretty please?', d.id), 350);
    return;
  }
  if (d.how === 'offer' && d.offer) {
    Body.play('ears');
    setTimeout(() => { if (d.offer === 'fetch') Body.askPlay(0.7); else Body.askPat(handSide(), 0.7, 4200); showAsk(d.text || 'Then…?', d.offer); }, 500);
    return;
  }
  hideAsk();
  if (d.how === 'fine') { Body.play('ears'); if (chance(0.5)) showEmote(pickNew('emote', ['note', 'a_ok', 'dots'])); }
  else if (d.how === 'pout') { Body.play('pout'); showEmote(pickNew('emote', ['hmph', 'a_flat', 'a_cry'])); }
  else if (d.how === 'sulk') { Body.play('pout'); showEmote(pickNew('emote', ['hmph', 'a_flat', 'anger'])); Moods.burst('flustered', 0.4); setTimeout(() => { if (!initBusy()) Body.play('lookAway'); }, 3200); }
  else if (d.how === 'tsun') { Body.play('lookAway'); showEmote(pickNew('emote', ['hmph', 'smug', 'a_flat'])); setTimeout(() => { if (!initBusy()) Body.play('tail'); }, 1300); }
  else if (d.how === 'later') { Body.play('ears'); setTimeout(() => showAsk(pickNew('ask', LATER), null, 2600), 300); }
  const feel = { pout: 'a small pout', sulk: 'you\'re sulking a little (it won\'t last)', tsun: 'you act like you never wanted it anyway (you did)',
    fine: 'you take it well', later: 'you\'ll ask again later' }[d.how];
  if (feel && d.how !== 'later' && chance((d.how === 'fine' ? 0.15 : 0.35) * talkMul())) {
    initSay(`You asked Anon for ${name} and he said not now: ${feel}. Never guilt-trip him.`);
  }
}
// fetch: the ball came to rest after she chased it. one more?
function fetchRoundOver() {
  if (!ready || !initOn() || initBusy()) return;
  if (Init.oneMoreLive({ stage: Gauges.bondStage }) === 'more') {
    showEmote(pickNew('emote', ['ball', 'bang', 'a_owo']));
    Body.askPlay(0.8);
    setTimeout(() => { if (!initBusy()) D?.offerBall?.('bring'); }, 900);
  } else if (chance(0.6)) showEmote(pickNew('emote', ['note', 'a_happy', 'star']));
}

// waving both ways (#1d (i)): he waves at her with the cursor, near her, side to side or in a
// circle (his pick, Settings > Her > On her own), and she waves back her own way
let hisTrail = [];
let lastMoveAt = 0;
function watchHisWave(x, y) {
  if (!ready || walking || thrown || dozing || calibrating || press || pin || Body.waveBackWindow()) { hisTrail = []; return; }
  if (!Features.isOn('wave_at_her')) return;
  const a = Live2D.faceAnchor();
  if (!a) return;
  const unit = herUnit(), now = Date.now();
  // near her, and not a rub on one of her spots (that's a touch, not a wave)
  const r = Body.regionAt(x, y);
  if (Math.hypot(x - a.x, y - a.y) > INIT_T.hisWaveNear * unit || Body.rubbing() || (r && r.kind !== 'body' && r.kind !== 'hug')) { hisTrail = []; return; }
  hisTrail.push({ x, y, t: now });
  while (hisTrail.length && now - hisTrail[0].t > INIT_T.hisWaveWindowMs) hisTrail.shift();
  if (!waveGesture(hisTrail, { unit, style: Init.setting('waveStyle'), size: Init.setting('waveSize'), now })) return;
  hisTrail = [];
  const d = Init.hisWaveLive({ ...initLive(), busy: busy || leaving });
  if (!d) return;
  actionLabel('Wave!', x, y);
  Feel.waved();
  glanceAtHand(1500);
  if (d.how === 'wave') { Body.play('wave'); Body.closeWaveWindow(); }
  else if (d.how === 'big') { Body.play('wave'); Body.closeWaveWindow(); setTimeout(() => { Body.lightUp('bounce', 0.8); showEmote(pickNew('emote', ['hearts', 'sparkle', 'a_happy'])); }, 600); }
  else if (d.how === 'shy') { Body.play('smallWave'); Body.closeWaveWindow(); if (chance(0.4)) showEmote(pickNew('emote', ['a_blush', 'dots', 'question'])); }
  else if (d.how === 'amused') { Body.play('ears'); showEmote(pickNew('emote', ['laugh', 'a_tongue', 'smug'])); }
  else if (chance(0.3)) showEmote('question');
  if (d.how !== 'look' && d.how !== 'amused') maybeSay('hiswave');
}
window.addEventListener('mousemove', (e) => { lastMoveAt = Date.now(); cur = { x: e.clientX, y: e.clientY, at: lastMoveAt }; watchHisWave(e.clientX, e.clientY); }, { passive: true });

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
  // her picture for the settings window's preview (desktop/snapshot.js)
  Snapshot.serve(() => ready);
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
  // the initiative engine: she thinks about what she'd like every few seconds
  setInterval(initTick, INIT_T.tickSec * 1000);
  if (MODE === 'stepout' && REASON === 'stepout') react('stepout');
}

main();
