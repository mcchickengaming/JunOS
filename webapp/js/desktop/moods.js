// how she feels about a touch, shown around her: five feelings
// (not ready, flustered, likes it, loves it, giggly), each with its own
// little effects (sweat drops and "!" marks, blush lines and steam,
// sparkles and notes, hearts, "hehe" and bubbles) and a soft glow.
//
// the feeling comes from the touch, the bond, her mood and how long the
// touch has gone on, following the reactions body.js already has (a
// friend's foot tickle starts giggly and turns "not ready" right before
// she pulls her foot away). the effects build up the longer a touch
// lasts and come out bigger at higher bonds.
//
// shared by desktop.html (js/desktop.js) and the settings window's
// Touch feedback tab, which previews with this same code. the owner's
// picks (mAmount 0..100, mGlow) live in desktop.fx (fx.js), the
// colors in the theme: --mood-notready, --mood-flustered, --mood-likes,
// --mood-loves, --mood-giggly.
import * as Often from './often.js?v=2';

import * as Fx from './fx.js?v=11';

export const FEELINGS = [
  ['notready', 'Not ready', '#7cc4ff'],
  ['flustered', 'Flustered', '#ff6fae'],
  ['likes', 'Likes it', '#ffd76a'],
  ['loves', 'Loves it', '#ff3d78'],
  ['giggly', 'Giggly', '#ffa64d'],
  // she loves it but won't admit it (Friend, sometimes Close): hearts leak out while she hides them
  ['secret', 'Secretly loves it', '#ff7aa2'],
  // a warm touch while she's upset or scared
  ['comforted', 'Comforted', '#b79cff'],
];
const COLOR = Object.fromEntries(FEELINGS.map(([k, , c]) => [k, `var(--mood-${k}, ${c})`]));
export const AMOUNTS = [['off', 'Off'], ['some', 'Some'], ['lots', 'Lots']];

// ---------------------------------------------------------------
// what she feels. per touch, per closeness (Stranger/Familiar, Friend,
// Close and up): [from ms, feeling] steps over the length of the touch

const HOLDS = {
  head: [[[0, 'flustered'], [2500, 'likes']], [[0, 'likes'], [6000, 'loves']], [[0, 'loves']]],
  ear: [[[0, 'flustered'], [4000, 'likes']], [[0, 'likes'], [7000, 'loves']], [[0, 'likes'], [2500, 'loves']]],
  side: [[[0, 'giggly'], [2000, 'notready']], [[0, 'giggly'], [4500, 'flustered']], [[0, 'giggly']]],
  feettickle: [[[0, 'notready']], [[0, 'giggly'], [2600, 'notready']], [[0, 'giggly'], [5500, 'flustered']]],
  footrub: [[[0, 'notready']], [[0, 'flustered'], [1200, 'likes']], [[0, 'likes'], [2000, 'loves']]],
  thigh: [[[0, 'notready']], [[0, 'flustered']], [[0, 'flustered'], [3000, 'likes']]],
  thighsquish: [[[0, 'notready']], [[0, 'flustered'], [3200, 'notready']], [[0, 'flustered'], [3500, 'loves']]],
  tail: [[[0, 'flustered']], [[0, 'likes']], [[0, 'likes'], [3000, 'loves']]],
  tailgrab: [[[0, 'notready']], [[0, 'flustered']], [[0, 'flustered'], [2000, 'likes']]],
  hand: [[[0, 'flustered'], [3000, 'likes']], [[0, 'likes'], [5000, 'loves']], [[0, 'loves']]],
  hug: [[[0, 'notready'], [2500, 'flustered']], [[0, 'flustered'], [1500, 'likes'], [8000, 'loves']], [[0, 'likes'], [800, 'loves']]],
};
HOLDS.tailrub = HOLDS.tail;
HOLDS.feet = HOLDS.footrub;
// a quick poke: the same three
const POKES = {
  head: ['flustered', 'likes', 'likes'], cheek: ['flustered', 'flustered', 'giggly'], nose: ['giggly', 'giggly', 'giggly'],
  ear: ['notready', 'flustered', 'giggly'], shoulder: ['flustered', 'likes', 'likes'], tail: ['notready', 'flustered', 'flustered'],
  hand: ['flustered', 'likes', 'loves'], side: ['giggly', 'giggly', 'giggly'], thigh: ['notready', 'flustered', 'flustered'],
  feet: ['notready', 'giggly', 'giggly'],
};

// her bond stage (1 Stranger ... 6 Devoted) and mood (core/mood-tier.js)
let ctx = { stage: 3, mood: 'neutral' };
export function setContext(c) { ctx = { ...ctx, ...c }; if (feel && c.mood) feel.setMood(c.mood); }

// core feel (#27, js/core/feel/feel.js; desktop.js sets it): every touch is told to it (her needs,
// getting tired of things, the session), and every feeling goes through its reaction composer, so
// the same touch never plays out the same twice. No feel (the settings preview, tests) = the
// tables below on their own
let feel = null;
export function setFeel(f) { feel = f || null; }
// The composer's answer also says HOW it plays out (which way her body shows it, which effect
// pieces are likelier, the tempo, her own ripple): tick/burst/puff below and feelbody.js follow it.
// extra: { manner (how the rub is being done), dry (only look), slot }
function composed(kind, how, ms, seed, base, c = ctx, extra = null) {
  if (!base || !feel) return base;
  try { return feel.compose({ kind, how, ms, seed, base, ctx: c, ...(extra || {}) }) || base; } catch (e) { console.warn('composer', e); return base; }
}
const closeOf = (stage) => (stage <= 2 ? 1 : stage === 3 ? 2 : 3);
const STAGE_POWER = [0.2, 0.3, 0.42, 0.55, 0.68, 0.8];

// the touches that can comfort her when she's down
const WARM = new Set(['head', 'hug', 'hand', 'ear', 'tail', 'tailrub']);
// a bad mood takes the edge off: loves -> likes -> flustered. but once
// she's a friend, a warm touch while she's upset or scared comforts her
function byMood(f, close, mood, kind, c = ctx) {
  const down = mood === 'upset' || mood === 'scared';
  if (down && close >= 2 && WARM.has(kind) && (f === 'likes' || f === 'loves') && wants(c, 'mComfort')) return 'comforted';
  if (down) return { loves: 'likes', likes: 'flustered', giggly: 'flustered' }[f] || f;
  if (mood === 'nervous' && close <= 1 && f === 'likes') return 'flustered';
  return f;
}
// the owner's switches (desktop.fx), or the context's own for tests/previews
function wants(c, key) { return c[key] ?? (Fx.currentFx()[key] !== false); }

// her tsundere side. seed: one random number per touch, so a touch keeps
// its mind. at Friend she never openly loves a touch: she hides it (and
// a third of the touches she likes, too). at Close some long touches
// start hidden and she gives up hiding after a few seconds. from
// Partner on, nothing to hide.
const TSUN = { friendLikes: 0.35, closeLoves: 0.4, closeGiveUpMs: 3000 };
function tsundere(f, stage, ms, seed, c) {
  if (!wants(c, 'mTsun')) return f;
  if (stage === 3 && (f === 'loves' || (f === 'likes' && seed < TSUN.friendLikes))) return 'secret';
  if (stage === 4 && f === 'loves' && seed < TSUN.closeLoves && ms < TSUN.closeGiveUpMs) return 'secret';
  return f;
}

// { feeling, power 0..1 } for a touch, or null if it's not one she has
// a feeling about. how: 'poke' or 'hold' (rubs are holds too)
export function feelingFor(kind, how = 'hold', ms = 0, c = ctx, seed = 0.5) {
  const stage = Math.max(1, Math.min(6, Math.round(c.stage || 3)));
  const close = closeOf(stage);
  let f = null;
  if (how === 'poke') f = POKES[kind] ? POKES[kind][close - 1] : null;
  else if (HOLDS[kind]) for (const [from, ff] of HOLDS[kind][close - 1]) if (ms >= from) f = ff;
  if (!f) return null;
  f = byMood(f, close, c.mood, kind, c);
  f = tsundere(f, stage, ms, seed, c);
  let power = STAGE_POWER[stage - 1] + Math.min(0.4, (ms / 10000) * 0.4) + (how === 'poke' ? 0.1 : 0);
  if (c.mood === 'happy') power += 0.08;
  return { feeling: f, power: Math.max(0.1, Math.min(1, power)) };
}

// her pick of ripple for a feeling, now and then (fx.js "let her pick")
export function rippleFor(kind, c = ctx) {
  if (!Fx.currentFx().rHerPick || amount() === 'off') return null;
  const f = feelingFor(kind, 'poke', 0, c);
  if (!f) return null;
  // the composer picks it (how she takes the touch right now, not just the touch's table)
  if (feel) return composed('poke.' + kind, 'poke', 0, Math.random(), f, c, { dry: true }).ripple || null;
  if (Math.random() > 0.25) return null;
  return { notready: { motion: 'shaky' }, flustered: { motion: 'wavy' }, loves: { shape: 'heart' },
    giggly: { shape: 'star', motion: 'burst' }, secret: { shape: 'heart', motion: 'wavy' }, likes: null, comforted: null }[f.feeling];
}

// ---------------------------------------------------------------
// where to draw: her face anchor (live2d geometry, or the settings
// preview's little head) and the element the pieces go in

let anchorFn = () => null;
let host = null;
export function setAnchor(fn, el) { anchorFn = fn || (() => null); host = el || null; }
// how much: 0..100 (often.js MUCH). 0 = off, 50 = the old "some", 85 = the old "lots"
const amountPct = () => Often.pct(Fx.currentFx().mAmount, 50);
const amount = () => (amountPct() === 0 ? 'off' : 'on');
// how busy the effects are: 1 at 50 %, ~1.54 at 85 % (the old "lots": puffs every 0.65×)
const amountK = () => Often.mul(amountPct(), 1.8);

// ---------------------------------------------------------------
// the effects. each piece: what it is, where it goes, how it moves

const SVG = {
  drop: '<path d="M0-11C4-4 7 0 7 4A7 7 0 0 1-7 4C-7 0-4-4 0-11Z"/>',
  blush: '<path d="M-9 4L-5-4M-2 4L2-4M5 4L9-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  steam: '<path d="M-8 4A5 5 0 0 1-6-5A6 6 0 0 1 5-7A5 5 0 0 1 9 3Z"/>',
  swirl: '<path d="M0 0A2 2 0 0 1 3 1A4 4 0 0 1-2 5A6 6 0 0 1-7-2A8 8 0 0 1 4-9A10 10 0 0 1 11 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  shiver: '<path d="M-3-10Q1-7-3-4Q-7-1-3 2Q1 5-3 8M4-8Q8-5 4-2Q0 1 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bubble: '<circle r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="-3" cy="-3" r="1.8"/>',
  // a heart with a black bar over it: censored, nothing to see here
  censor: '<path d="M0 9C-6 4.5-9 1.4-9-2.2A4.6 4.6 0 0 1 0-4.3a4.6 4.6 0 0 1 9 2.1C9 1.4 6 4.5 0 9Z"/><rect x="-11" y="-3.2" width="22" height="5" rx="1" fill="#141018"/>',
  heart: '<path d="M0 9C-6 4.5-9 1.4-9-2.2A4.6 4.6 0 0 1 0-4.3a4.6 4.6 0 0 1 9 2.1C9 1.4 6 4.5 0 9Z"/>',
  glowdot: '<circle r="5"/>',
};
// [piece, weight]; 'ascii' pieces follow the "Robot faces" setting
const PIECES = {
  notready: [['drop', 3], ['bang', 2], ['shiver', 2], ['ascii', 1]],
  flustered: [['blush', 3], ['steam', 2], ['swirl', 2], ['ascii', 1.5]],
  likes: [['sparkle', 3], ['note', 3], ['glowdot', 1], ['ascii', 1]],
  loves: [['heart', 4], ['heartring', 1], ['ascii', 1]],
  giggly: [['hehe', 3], ['bubble', 2], ['star', 2], ['ascii', 1]],
  secret: [['leakheart', 4], ['censor', 2], ['hmph', 2], ['blush', 2], ['ascii', 1.5]],
  comforted: [['tear', 4], ['sigh', 2], ['glowdot', 2], ['ascii', 1]],
};
const ASCII = {
  notready: ['o_O', '[WARN]', '!?', 'D:'],
  flustered: ['>_<', '>///<', '[ERR]', '@_@'],
  likes: ['^_^', ':3', '[OK]', 'c:'],
  loves: ['<3', 'love.exe', '♥‿♥', '[♥♥♥]'],
  giggly: [':P', 'xD', '^o^', 'hehe.wav'],
  secret: ['[DENIED]', '[NOT FOUND]', '<3 [deleted]', 'love.exe [hidden]', 'ERR: not cute'],
  comforted: ['[RESTORED]', 'T_T -> ^_^', '[SYS OK]', ':)'],
};
// her own, dry and shy. the anime ones ("b-baka") only once she's picked
// that habit up from him (lib/quirks.php anime_tsundere), or the owner
// says so (mAnime: auto / on / off)
const HMPH = ['hmph.', 'not like I…', '…', 'whatever.', 'n-no', 'don\'t look', 'it\'s fine.', 'shh.'];
const HMPH_ANIME = ['b-baka', 'baka!', 'it\'s not like I like it!', 'hmph!'];
const ASCII_ANIME = ['[BAKA.exe]', 'tsun_mode.dll'];
function animeTsun() {
  const m = Fx.currentFx().mAnime || 'auto';
  return m === 'on' || (m === 'auto' && !!ctx.animeTsun);
}
const SIGH = ['sniff…', 'thanks…', 'mm…', 'better…', '*sigh*'];
const HEHE = ['hehe', 'ha!', 'haha', 'ehe~', 'hihi', 'pfft', 'kya!'];
const NOTES = ['♪', '♫'];

const CSS = `
.mood-p { position: fixed; z-index: 6; pointer-events: none; left: 0; top: 0; line-height: 1; white-space: nowrap;
  transform: translate(-50%, -50%); opacity: 0; animation-fill-mode: forwards; animation-timing-function: ease-out;
  font: 800 var(--mp-size, 16px) Arial, Helvetica, sans-serif; text-shadow: 0 0 calc(1px * var(--fx-k, 1)) #000a, 0 0 calc(3px * var(--fx-k, 1)) #0007; }
.mood-p svg { display: block; width: var(--mp-size, 16px); height: var(--mp-size, 16px); overflow: visible; fill: currentColor;
  filter: drop-shadow(0 0 calc(1px * var(--fx-k, 1)) #0009) drop-shadow(0 0 calc(2px * var(--fx-k, 1)) #0005); }
.mood-p.ascii { font-family: "Consolas", "Courier New", monospace; font-size: calc(var(--mp-size, 16px) * .8); letter-spacing: -.02em; }
.mood-p.hehe { font-family: var(--label-font, "Comic Sans MS", cursive); font-style: italic; }
@keyframes mp-rise { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.4); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  70% { opacity: .9; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.9) rotate(var(--rot, 0deg)); } }
@keyframes mp-fall { 0% { opacity: 0; transform: translate(-50%, -80%) scale(.6); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% + var(--dy))) scale(.85, 1.1); } }
@keyframes mp-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.2) rotate(var(--rot, 0deg)); } 18% { opacity: 1; transform: translate(-50%, -50%) scale(1.25) rotate(var(--rot, 0deg)); }
  30% { transform: translate(-50%, -50%) scale(1) rotate(var(--rot, 0deg)); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, calc(-50% + var(--dy))) scale(.95) rotate(var(--rot, 0deg)); } }
@keyframes mp-shiver { 0% { opacity: 0; transform: translate(-50%, -50%); } 10% { opacity: 1; } 20% { transform: translate(-62%, -50%); } 30% { transform: translate(-38%, -50%); }
  40% { transform: translate(-60%, -50%); } 50% { transform: translate(-40%, -50%); } 60% { transform: translate(-56%, -50%); } 70% { opacity: 1; transform: translate(-44%, -50%); }
  100% { opacity: 0; transform: translate(-50%, -50%); } }
@keyframes mp-spin { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3) rotate(0); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(160deg); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.8) rotate(620deg); } }
@keyframes mp-twinkle { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(0); } 35% { opacity: 1; transform: translate(-50%, -50%) scale(1.15) rotate(45deg); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% + var(--dy))) scale(0) rotate(90deg); } }
@keyframes mp-bounce { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.4); } 12% { opacity: 1; transform: translate(-50%, -110%) scale(1.1); }
  24% { transform: translate(-50%, -40%) scale(1.1, .85); } 36% { transform: translate(-50%, -85%) scale(1); } 48% { transform: translate(-50%, -50%); }
  80% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))); } }
@keyframes mp-puff { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 20% { opacity: .95; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.7); } }
@keyframes mp-leak { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3); } 25% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  55% { opacity: 1; transform: translate(calc(-50% + var(--dx) * .5), calc(-50% + var(--dy) * .5)) scale(1); }
  70% { opacity: .9; transform: translate(calc(-50% + var(--dx) * .6), calc(-50% + var(--dy) * .6)) scale(1.15, .8); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); } }
@keyframes mp-blush { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.6); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
  40% { transform: translate(-50%, -50%) scale(.95); } 55% { transform: translate(-50%, -50%) scale(1.03); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); } }

/* the glow around her, in the feeling's color (or one color, or a rainbow). the owner shapes it in the
   Touch feedback tab: strength, size, softness, shape, movement, speed, in front or behind, how slowly it fades.
   .mood-aura is the box (place, blur, fade), .ma-shape inside it the shape and its movement */
.mood-aura { position: fixed; z-index: 0; pointer-events: none; left: 0; top: 0; width: 10px; height: 10px;
  transform: translate(-50%, -50%); opacity: 0; transition: opacity var(--ma-fade, .5s) ease, width .4s ease, height .4s ease; }
.mood-aura.front { z-index: 5; }
.mood-aura.on { opacity: var(--ma-o, .3); }
.mood-aura .ma-shape { position: absolute; inset: 0; border-radius: 50%; --c: var(--ma-c, #fff);
  background: radial-gradient(closest-side, color-mix(in srgb, var(--c) 75%, transparent) 0%,
    color-mix(in srgb, var(--c) 42%, transparent) var(--ma-mid, 40%), transparent var(--ma-end, 85%)); }
.mood-aura.s-ring .ma-shape { background: radial-gradient(closest-side, transparent var(--ma-in, 45%),
    color-mix(in srgb, var(--c) 80%, transparent) var(--ma-ring, 70%), transparent var(--ma-end, 92%)); }
.mood-aura.s-heart .ma-shape, .mood-aura.s-star .ma-shape { border-radius: 0; background: color-mix(in srgb, var(--c) 70%, transparent);
  -webkit-mask: var(--ma-mask) center / contain no-repeat; mask: var(--ma-mask) center / contain no-repeat; }
.mood-aura.s-heart { filter: blur(var(--ma-blur, 6px)); --ma-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21.5C5 16.5 1.5 12.8 1.5 8.6A5.4 5.4 0 0 1 12 6.2a5.4 5.4 0 0 1 10.5 2.4c0 4.2-3.5 7.9-10.5 12.9Z'/%3E%3C/svg%3E"); }
.mood-aura.s-star { filter: blur(var(--ma-blur, 6px)); --ma-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 1.5l3 7.2 7.8.6-6 5 1.9 7.7L12 17.9 5.3 22l1.9-7.7-6-5 7.8-.6Z'/%3E%3C/svg%3E"); }
.mood-aura.rainbow .ma-shape { --c: #ff4d6d; }
.mood-aura.rainbow.on { animation: ma-hue calc(4s / var(--ma-speed, 1)) linear infinite; }
@keyframes ma-hue { from { filter: hue-rotate(0deg) blur(var(--ma-blur, 0px)); } to { filter: hue-rotate(360deg) blur(var(--ma-blur, 0px)); } }
/* how it moves: her feeling's own way, or the same for all */
.mood-aura.on.m-notready .ma-shape { animation: ma-shudder calc(.22s / var(--ma-speed, 1)) linear infinite; }
.mood-aura.on.m-flustered .ma-shape { animation: ma-flutter calc(.7s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-likes .ma-shape { animation: ma-breathe calc(2.6s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-loves .ma-shape { animation: ma-breathe calc(1.9s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-giggly .ma-shape { animation: ma-hop calc(.5s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-secret .ma-shape { animation: ma-flutter calc(1.1s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-comforted .ma-shape { animation: ma-breathe calc(3.4s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-breathe .ma-shape { animation: ma-breathe calc(2.6s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-beat .ma-shape { animation: ma-beat calc(1.1s / var(--ma-speed, 1)) ease-in-out infinite; }
.mood-aura.on.m-spin .ma-shape { animation: ma-spin calc(6s / var(--ma-speed, 1)) linear infinite; }
@keyframes ma-shudder { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3%); } 75% { transform: translateX(3%); } }
@keyframes ma-flutter { 0%, 100% { transform: scale(1); } 30% { transform: scale(1.08); } 45% { transform: scale(.97); } 60% { transform: scale(1.06); } }
@keyframes ma-breathe { 0%, 100% { transform: scale(.94); } 50% { transform: scale(1.1); } }
@keyframes ma-hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4%) scale(1.04, .97); } }
@keyframes ma-beat { 0%, 40%, 100% { transform: scale(.95); } 12% { transform: scale(1.12); } 24% { transform: scale(1); } 32% { transform: scale(1.08); } }
@keyframes ma-spin { from { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.06); } to { transform: rotate(360deg) scale(1); } }
`;
export function installCss() {
  Fx.installCss();
  if (document.getElementById('mood-css')) return;
  const st = document.createElement('style');
  st.id = 'mood-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pickW = (list) => {
  let r = Math.random() * list.reduce((s, x) => s + x[1], 0);
  for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; }
  return list[list.length - 1][0];
};
const lastPiece = {};
const lastText = {};
function pickText(list, key) {
  const fresh = list.filter(t => t !== lastText[key]);
  const t = fresh[Math.floor(Math.random() * fresh.length)] || list[0];
  lastText[key] = t;
  return t;
}
// bias: the composer's { piece: × } for this moment (calm = more glow dots, a surprise = more "!")
function choosePiece(feeling, power, bias = null) {
  const asciiW = Often.mul(Fx.currentFx().eAscii);
  let list = PIECES[feeling].map(([p, w]) => [p, (p === 'ascii' ? w * asciiW * 0.5 : w) * (bias?.[p] ?? 1)]).filter(x => x[1] > 0);
  // the big heart ring is for a strong moment
  if (power < 0.6) list = list.filter(x => x[0] !== 'heartring');
  // core feel: the repeat watcher picks, so the pieces she just showed are pushed down
  if (feel?.Repeat && list.length) {
    const got = feel.Repeat.pick('piece', list.map(([p, w]) => ({ id: feeling + '.' + p, w })));
    if (got) return got.slice(feeling.length + 1);
  }
  // never the same piece twice in a row
  const fresh = list.filter(x => x[0] !== lastPiece[feeling]);
  const p = pickW(fresh.length ? fresh : list);
  lastPiece[feeling] = p;
  return p;
}

// one piece on the page
function put({ text, svg, cls = '', x, y, size, anim, ms, dx = 0, dy = 0, rot = 0, color, delay = 0 }) {
  const el = document.createElement('span');
  el.className = 'mood-p ' + cls;
  if (svg) el.innerHTML = `<svg viewBox="-12 -12 24 24" aria-hidden="true">${svg}</svg>`;
  else el.textContent = text;
  el.style.left = x.toFixed(1) + 'px';
  el.style.top = y.toFixed(1) + 'px';
  el.style.color = color;
  el.style.setProperty('--mp-size', size.toFixed(1) + 'px');
  el.style.setProperty('--dx', dx.toFixed(1) + 'px');
  el.style.setProperty('--dy', dy.toFixed(1) + 'px');
  el.style.setProperty('--rot', rot.toFixed(0) + 'deg');
  el.style.animationName = anim;
  el.style.animationDuration = ms + 'ms';
  el.style.animationDelay = delay + 'ms';
  (host || document.body).appendChild(el);
  setTimeout(() => el.remove(), ms + delay + 80);
}

// one puff of a feeling: a piece (or a pair, like the blush on both
// cheeks) around her head, or near the touch for the ones that can be
// anywhere. s = size factor from the power
function puff(feeling, power, at, bias = null) {
  const a = anchorFn();
  if (!a) return;
  const k = Fx.scale();
  const s = 0.85 + power * 0.45;
  const size = 16 * k * s;
  const hw = a.headW;
  const side = Math.random() < 0.5 ? -1 : 1;
  const color = COLOR[feeling];
  const headTop = a.y - a.modelH * 0.07;
  // near the touch if there is one away from her face, else round her head
  const near = at && Math.hypot(at.x - a.x, at.y - a.y) > hw * 0.9 && Math.random() < 0.55
    ? { x: at.x + rnd(-14, 14) * k, y: at.y - rnd(4, 18) * k }
    : { x: a.x + side * hw * rnd(0.35, 0.75), y: a.y - hw * rnd(0.1, 0.55) };
  const p = choosePiece(feeling, power, bias);
  switch (p) {
    case 'drop':
      put({ svg: SVG.drop, x: a.x + side * hw * rnd(0.42, 0.6), y: headTop + hw * rnd(0.05, 0.3), size: size * 0.9, anim: 'mp-fall', ms: 1100, dy: 26 * k, color });
      break;
    case 'bang':
      put({ text: Math.random() < 0.3 ? '!!' : '!', x: a.x + side * hw * rnd(0.2, 0.45), y: headTop - hw * 0.1, size: size * 1.3, anim: 'mp-pop', ms: 900, dy: -8 * k, rot: side * rnd(5, 15), color });
      break;
    case 'shiver':
      put({ svg: SVG.shiver, x: a.x - a.modelW * 0.28, y: a.y + a.modelH * rnd(0.08, 0.2), size: size * 1.1, anim: 'mp-shiver', ms: 800, color });
      put({ svg: SVG.shiver, x: a.x + a.modelW * 0.28, y: a.y + a.modelH * rnd(0.08, 0.2), size: size * 1.1, anim: 'mp-shiver', ms: 800, color, delay: 60 });
      break;
    case 'blush':
      for (const sd of [-1, 1]) put({ svg: SVG.blush, x: a.x + sd * hw * 0.27, y: a.y + hw * 0.14, size: size * (0.8 + power * 0.3), anim: 'mp-blush', ms: 1300, color });
      break;
    case 'steam':
      for (let i = 0; i < 2; i++) {
        put({ svg: SVG.steam, x: a.x + side * hw * rnd(0.15, 0.4), y: headTop, size: size * rnd(0.8, 1.1), anim: 'mp-puff', ms: 1200, dx: side * rnd(8, 20) * k, dy: -rnd(26, 40) * k, color, delay: i * 180 });
      }
      break;
    case 'swirl':
      put({ svg: SVG.swirl, x: a.x + side * hw * rnd(0.3, 0.55), y: headTop - hw * rnd(0.05, 0.2), size: size * 1.1, anim: 'mp-spin', ms: 1200, dx: side * 6 * k, dy: -12 * k, color });
      break;
    case 'sparkle':
      put({ text: Math.random() < 0.5 ? '✦' : '✧', ...near, size: size * rnd(0.7, 1.1), anim: 'mp-twinkle', ms: 900, dy: -10 * k, color });
      break;
    case 'note':
      put({ text: pickText(NOTES, 'note'), ...near, size, anim: 'mp-rise', ms: 1500, dx: side * rnd(10, 26) * k, dy: -rnd(36, 56) * k, rot: side * 15, color });
      break;
    case 'glowdot':
      for (let i = 0; i < 3; i++) put({ svg: SVG.glowdot, x: near.x + rnd(-12, 12) * k, y: near.y + rnd(-8, 8) * k, size: size * rnd(0.4, 0.7), anim: 'mp-rise', ms: 1300, dx: rnd(-8, 8) * k, dy: -rnd(20, 34) * k, color, delay: i * 120 });
      break;
    case 'heart':
      put({ text: '♥', x: a.x + rnd(-0.7, 0.7) * hw, y: a.y + a.modelH * rnd(0.04, 0.12), size: size * rnd(0.9, 1.25), anim: 'mp-rise', ms: 1700, dx: rnd(-22, 22) * k, dy: -rnd(60, 95) * k, rot: rnd(-20, 20), color });
      break;
    case 'heartring': {
      // a ring of hearts bursting out from her face
      const n = 7;
      const turn = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const t = turn + i * 2 * Math.PI / n;
        put({ text: '♥', x: a.x, y: a.y + hw * 0.1, size: size * 0.8, anim: 'mp-rise', ms: 1100, dx: Math.cos(t) * hw * 1.1, dy: Math.sin(t) * hw * 1.1, color, delay: 30 });
      }
      break;
    }
    case 'hehe':
      put({ text: pickText(HEHE, 'hehe'), cls: 'hehe', x: a.x + side * hw * rnd(0.55, 0.9), y: a.y - hw * rnd(0, 0.35), size: size * 0.9, anim: 'mp-bounce', ms: 1200, dx: side * 8 * k, dy: -14 * k, rot: side * rnd(5, 14), color });
      break;
    case 'bubble':
      for (let i = 0; i < 2; i++) put({ svg: SVG.bubble, x: near.x + rnd(-14, 14) * k, y: near.y, size: size * rnd(0.6, 1), anim: 'mp-rise', ms: 1500, dx: rnd(-10, 10) * k, dy: -rnd(40, 60) * k, color, delay: i * 160 });
      break;
    case 'star':
      put({ text: '★', ...near, size: size * 0.9, anim: 'mp-bounce', ms: 1000, dx: side * rnd(10, 22) * k, dy: -rnd(6, 16) * k, rot: rnd(-30, 30), color });
      break;
    case 'leakheart':
      // a little heart slips out, then she shoos it: it shrinks away fast
      put({ text: '♥', x: a.x + side * hw * rnd(0.3, 0.7), y: a.y + hw * rnd(-0.1, 0.3), size: size * rnd(0.7, 0.95), anim: 'mp-leak', ms: 1100,
        dx: side * rnd(6, 14) * k, dy: -rnd(16, 28) * k, color });
      break;
    case 'censor':
      put({ svg: SVG.censor, x: a.x + side * hw * rnd(0.45, 0.75), y: headTop - hw * rnd(-0.05, 0.15), size: size * 1.15, anim: 'mp-pop', ms: 1200, dy: -8 * k, rot: side * rnd(4, 12), color });
      break;
    case 'hmph':
      put({ text: pickText(animeTsun() && Math.random() < 0.45 ? HMPH_ANIME : HMPH, 'hmph'), cls: 'hehe', x: a.x - side * hw * rnd(0.6, 0.9), y: a.y - hw * rnd(0, 0.3), size: size * 0.85, anim: 'mp-pop', ms: 1300, dy: -8 * k, rot: -side * rnd(3, 10), color });
      break;
    case 'tear': {
      // a tear rolls down... and turns into a little heart
      const tx = a.x + side * hw * rnd(0.22, 0.32), ty = a.y + hw * 0.05;
      put({ svg: SVG.drop, x: tx, y: ty, size: size * 0.75, anim: 'mp-fall', ms: 700, dy: 14 * k, color: 'var(--mood-notready, #7cc4ff)' });
      put({ svg: SVG.heart, x: tx, y: ty + 14 * k, size: size * 0.9, anim: 'mp-rise', ms: 1500, dx: side * rnd(4, 12) * k, dy: -rnd(30, 46) * k, color, delay: 560 });
      break;
    }
    case 'sigh':
      put({ text: pickText(SIGH, 'sigh'), cls: 'hehe', x: a.x + side * hw * rnd(0.6, 0.85), y: a.y - hw * rnd(-0.05, 0.25), size: size * 0.8, anim: 'mp-rise', ms: 1700, dx: side * 10 * k, dy: -18 * k, color });
      break;
    case 'ascii':
      put({ text: pickText(feeling === 'secret' && animeTsun() ? [...ASCII.secret, ...ASCII_ANIME] : ASCII[feeling], 'a-' + feeling), cls: 'ascii', x: a.x + side * hw * rnd(0.6, 0.85), y: headTop - hw * rnd(0, 0.15), size, anim: 'mp-pop', ms: 1400, dy: -10 * k, color });
      break;
  }
}

// ---------------------------------------------------------------
// the glow around her

// the owner's glow picks (desktop.fx, defaults in fx.js FX_DEFAULTS)
export const GLOW_SHAPES = [['round', 'Soft circle'], ['ring', 'Ring'], ['body', 'All around her'], ['heart', 'Heart'], ['star', 'Star']];
export const GLOW_MOVES = [['feel', 'Her feeling\'s own way'], ['breathe', 'Slow breathing'], ['beat', 'Heartbeat'], ['spin', 'Slow spin'], ['still', 'Still']];
export const GLOW_LAYERS = [['behind', 'Behind her'], ['front', 'In front of her']];
export const GLOW_COLORS = [['feeling', 'The feeling\'s color'], ['one', 'One color'], ['rainbow', 'Rainbow']];

let auraEl = null;
function aura(feeling, power) {
  const fx = Fx.currentFx();
  const on = !!feeling && amount() !== 'off' && fx.mGlow !== false;
  if (!auraEl && !on) return;
  const box = host || document.body;
  if (!auraEl) {
    auraEl = document.createElement('div');
    auraEl.innerHTML = '<div class="ma-shape"></div>';
  }
  // behind her: first in its box, so she's drawn over it; in front: last
  const front = fx.mGlowLayer === 'front';
  if (auraEl.parentNode !== box || (front ? box.lastChild !== auraEl : box.firstChild !== auraEl)) {
    if (front) box.appendChild(auraEl); else box.insertBefore(auraEl, box.firstChild);
  }
  auraEl.style.setProperty('--ma-fade', Math.max(0.1, Number(fx.mGlowFade ?? 0.5)) + 's');
  const a = on && anchorFn();
  if (!a) { auraEl.classList.remove('on'); return; }
  const shape = fx.mGlowShape || 'round';
  const move = fx.mGlowMove || 'feel';
  const colors = fx.mGlowColor || 'feeling';
  auraEl.className = ['mood-aura', 'on', 's-' + shape, 'm-' + (move === 'feel' ? feeling : move),
    front ? 'front' : '', colors === 'rainbow' ? 'rainbow' : ''].filter(Boolean).join(' ');
  const size = Math.max(0.2, Number(fx.mGlowSize ?? 1));
  const soft = Math.max(0, Math.min(1, Number(fx.mGlowSoft ?? 0.5)));
  let w, h, cy = a.y + a.headW * 0.15;
  if (shape === 'body') {
    // a tall glow round all of her
    w = a.modelW * 1.15 * size * (0.9 + power * 0.2);
    h = a.modelH * 1.05 * size * (0.9 + power * 0.2);
    cy = a.y - a.modelH * 0.09 + a.modelH * 0.5;
  } else {
    // a ring or a shape needs to reach past her head to be seen at all
    const reach = { ring: 1.4, heart: 1.3, star: 1.35 }[shape] || 1.1;
    w = h = a.headW * (2.3 + power * 0.9) * size * reach;
  }
  auraEl.style.left = a.x + 'px';
  auraEl.style.top = cy + 'px';
  auraEl.style.width = w + 'px';
  auraEl.style.height = h + 'px';
  // softness: how far the color reaches before it fades (and the blur of a heart/star)
  auraEl.style.setProperty('--ma-mid', (55 - soft * 40).toFixed(0) + '%');
  auraEl.style.setProperty('--ma-end', (72 + soft * 28).toFixed(0) + '%');
  auraEl.style.setProperty('--ma-in', (55 - soft * 25).toFixed(0) + '%');
  auraEl.style.setProperty('--ma-ring', (72 - soft * 6).toFixed(0) + '%');
  auraEl.style.setProperty('--ma-blur', (shape === 'heart' || shape === 'star' ? (2 + soft * 14) * Fx.scale() : 0).toFixed(1) + 'px');
  auraEl.style.setProperty('--ma-speed', String(Math.max(0.25, Number(fx.mGlowSpeed ?? 1))));
  auraEl.style.setProperty('--ma-c', colors === 'one' ? 'var(--mood-glow, #ffffff)' : COLOR[feeling]);
  const strength = Math.max(0, Number(fx.mGlowStr ?? 1));
  auraEl.style.setProperty('--ma-o', Math.min(1, (0.24 + power * 0.4) * (1 + (amountK() - 1) * 0.55) * strength).toFixed(2));
}

// ---------------------------------------------------------------
// touches going on: one slot per hand ('press', 'rub', 'pin'), each
// with its touch, start time and the point it's at. while any is on,
// a little loop puffs the strongest feeling now and then: faster and
// more at once the stronger it is

const active = new Map();
let loop = null, lastPuff = 0, shown = null, demo = null;
function strongest() {
  if (demo) {
    const t = Date.now() - demo.t0;
    if (t > demo.ms) { demo = null; return null; }
    return { ...(demo.style || {}), feeling: demo.feeling, power: demo.from + (demo.to - demo.from) * Math.min(1, t / demo.ms), at: demo.at || null };
  }
  const unit = feel ? anchorFn()?.modelH : 0;
  let best = null;
  const now = Date.now();
  for (const [slot, s] of active) {
    // a rub is only going on while the mouse keeps moving (it may have
    // left her window, where no more moves arrive)
    if (s.stale && now - s.seen > s.stale) { active.delete(slot); feel?.touchEnd(slot); continue; }
    const ms = Date.now() - s.t0;
    // how it's being done: the hand's speed, steadiness and area (core/feel/manner.js)
    const manner = s.track && unit ? s.track.read(now, unit) : null;
    if (manner) feel.touchManner(slot, manner);
    const f = composed(s.kind, 'hold', ms, s.seed, feelingFor(s.kind, 'hold', ms, ctx, s.seed), ctx, { manner, slot });
    if (f && (!best || f.power > best.power)) best = { ...f, at: s.at };
  }
  return best;
}
// her body showing the feeling (desktop/feelbody.js, set by desktop.js;
// the settings window has no rig, so none there): show() every tick,
// after() once when it ends, with the side his hand was on. both get
// the composer's reaction (which way she shows it: its variant), and
// onset() runs the instant a touch lands: something to see right away
let body = null;
export function setBody(b) { body = b; }
let felt = null; // { feeling, power, at } the body is showing
// where his mouse is now (desktop.js tells us): she leans away from
// where the hand IS when the touch ends, not where it pressed
let pointer = null;
export function setPointer(x, y) { pointer = { x, y }; }
function sideOf(at) {
  const p = pointer || at;
  const a = p && anchorFn();
  return a ? Math.sign(p.x - a.x) || 1 : 0;
}

function tick() {
  const any = strongest();
  // the body follows its own switch, the effects their amount
  if (body) {
    if (any) { body.show(any.feeling, any.power, undefined, any); felt = any; }
    else if (felt) { body.after(felt.feeling, felt.power, sideOf(felt.at), felt); felt = null; }
  }
  const f = amount() === 'off' ? null : any;
  if (!f) {
    aura(null);
    shown = null;
    if (!active.size && !demo) { clearInterval(loop); loop = null; }
    return;
  }
  aura(f.feeling, f.power);
  const now = Date.now();
  // the composer's tempo: calmer when it's slow and gentle or winding down, quicker when lively
  const every = (1150 - f.power * 750) / Math.max(0.15, amountK()) * (f.tempo || 1);
  // a change of heart shows right away (a giggle turning into "enough!")
  const changed = shown && shown !== f.feeling;
  if (now - lastPuff < every && !changed) return;
  lastPuff = now;
  shown = f.feeling;
  const n = 1 + (f.power > 0.55 ? 1 : 0) + (amountPct() >= 70 && f.power > 0.8 ? 1 : 0) + (changed ? 1 : 0);
  for (let i = 0; i < n; i++) setTimeout(() => puff(f.feeling, f.power, f.at, f.pieces), i * 140);
}
function run() { if (!loop) loop = setInterval(tick, 120); tick(); }

// stale: ms without news after which the touch is over (hover rubs)
export function begin(slot, kind, t0 = Date.now(), at = null, stale = 0) {
  if (!HOLDS[kind]) { end(slot); return; }
  const s = active.get(slot);
  // the same hand going on (a rub crossing from her head to an ear):
  // the same touch, it keeps its length
  if (s) { s.kind = kind; s.seen = Date.now(); if (at) { s.at = at; s.track?.add(at.x, at.y, s.seen); } feel?.touchKind(slot, kind); return; }
  const track = feel?.Manner ? feel.Manner.tracker() : null;
  if (track && at) track.add(at.x, at.y, Date.now());
  active.set(slot, { kind, t0, at, stale, seen: Date.now(), seed: Math.random(), track });
  feel?.touchBegin(slot, kind, t0);
  run();
  // the instant it lands: her eyes, an ear, a blink (before any effect or word)
  if (body?.onset && felt) body.onset(sideOf(at), felt);
}
// a hand left in place (desktop.js "two hands") takes its touch along
export function move(from, to) {
  const s = active.get(from);
  if (!s) return;
  active.delete(from);
  s.stale = 0; // the hand left in place keeps going on its own
  active.set(to, s);
  feel?.touchMove(from, to);
}
export function at(slot, x, y) { const s = active.get(slot); if (s) { s.at = { x, y }; s.seen = Date.now(); s.track?.add(x, y, s.seen); } }
export function end(slot) { if (active.delete(slot)) feel?.touchEnd(slot); }
export function endAll() { for (const slot of active.keys()) feel?.touchEnd(slot); active.clear(); demo = null; tick(); }

// a single moment: a poke, a combo, "she wriggled free"
// style: the composer's reaction (pieces, delay, variant), when there is one
export function burst(feeling, power = 0.7, where = null, style = null) {
  if (!COLOR[feeling]) return;
  if (amount() !== 'off') {
    const n = 1 + (power > 0.5 ? 1 : 0) + (amountPct() >= 70 ? 1 : 0);
    for (let i = 0; i < n; i++) setTimeout(() => puff(feeling, power, where, style?.pieces), (style?.delay || 0) + i * 150);
  }
  // a short moment (glow, her body) when nothing longer is going on
  if (!active.size && !demo) {
    demo = { feeling, from: power, to: power, t0: Date.now(), ms: 900, at: where, style };
    run();
    if (body?.onset && felt) body.onset(sideOf(where), felt);
  }
}
export function poke(kind, where = null) {
  const seed = Math.random();
  const f = composed('poke.' + kind, 'poke', 0, seed, feelingFor(kind, 'poke', 0, ctx, seed));
  if (f) burst(f.feeling, f.power, where, f);
  feel?.poke(kind);
  return f;
}
// a combo is a big moment: the feeling it fits, strong
export function combo(id) {
  const close = closeOf(ctx.stage);
  let f = id === 'tickleattack' ? 'giggly' : id === 'tailtease' ? (close <= 1 ? 'notready' : 'flustered')
    : close >= 3 ? 'loves' : close === 2 ? 'likes' : 'flustered';
  f = byMood(f, close, ctx.mood, 'hug');
  f = tsundere(f, ctx.stage, 0, Math.random(), ctx);
  const r = composed('combo.' + id, 'combo', 0, Math.random(), { feeling: f, power: 0.95 });
  burst(r.feeling, r.power, null, r);
  feel?.combo(id);
  return r.feeling;
}

// the settings window's preview: a feeling for a while, its power going
// from -> to (a build-up shows a long touch growing)
export function preview(feeling, ms = 1800, from = 0.7, to = from) {
  demo = { feeling, from, to, t0: Date.now(), ms };
  lastPuff = 0;
  shown = null;
  run();
}
export function current() { const f = strongest(); return f ? f.feeling : null; }
// which hands are on her right now (for tests)
export function slots() { return [...active.entries()].map(([k, s]) => [k, s.kind]); }
