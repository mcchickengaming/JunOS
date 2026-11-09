// how touch feedback looks on the desktop: the ripple where you click,
// the little labels ("Boop!", "Headpat"), and her thought icons.
// shared by desktop.html (js/desktop.js) and the settings window's
// "Touch feedback" tab (js/desktop-settings.js), which previews with
// the very same code.
//
// the owner's picks live in localStorage['desktop.fx'] (shape, motion,
// size...); the colors in localStorage['desktop.theme'] like every
// other desktop color (--ripple, --label, --label-edge, --label-ink).
// a change in the settings window reaches her through the storage event.

export const FX_KEY = 'desktop.fx';

export const FX_DEFAULTS = {
  rShape: 'circle', rMotion: 'expand', rSize: 1, rSpeed: 1, rRings: 1, rWidth: 2, rHerPick: true,
  lBox: 'rounded', lFont: 'arial', lSize: 12, lAnim: 'pop', lBorder: 1, lAlpha: 1,
  eAscii: 'sometimes', eAnim: 'mix',
  // how she feels about a touch (desktop/moods.js): off / some / lots, and the glow around her
  mAmount: 'some', mGlow: true, mTsun: true, mComfort: true,
  // anime tsundere lines ("b-baka"): auto = once she's picked the habit up (lib/quirks.php), on, off
  mAnime: 'auto',
  // the glow (moods.js aura): strength and size ×, softness 0..1, shape, movement, speed ×, layer, color, fade s
  mGlowStr: 1, mGlowSize: 1, mGlowSoft: 0.5, mGlowShape: 'round', mGlowMove: 'feel', mGlowSpeed: 1,
  mGlowLayer: 'behind', mGlowColor: 'feeling', mGlowFade: 0.5,
  // her body showing the feeling (feelbody.js): on/off, strength ×, and each part
  mBody: true, mBodyStr: 1, mBodyEars: true, mBodyTail: true, mBodyEyes: true, mBodyLean: true,
};

// [value, plain name] lists for the settings window
export const RIPPLE_SHAPES = [['circle', 'Circle'], ['heart', 'Heart'], ['star', 'Star'], ['sparkle', 'Sparkle'], ['paw', 'Paw print'], ['diamond', 'Diamond']];
export const RIPPLE_MOTIONS = [['expand', 'Expand'], ['pulse', 'Pulse'], ['wavy', 'Wavy'], ['shaky', 'Shaky'], ['burst', 'Burst'], ['spin', 'Spin']];
export const LABEL_BOXES = [['rounded', 'Rounded'], ['pill', 'Pill'], ['square', 'Square'], ['bubble', 'Speech bubble'], ['cloud', 'Cloud'], ['jun', 'Jun style'], ['none', 'No box']];
export const LABEL_FONTS = [
  ['arial', 'Clean', 'Arial, Helvetica, sans-serif'],
  ['round', 'Round', '"Trebuchet MS", "Segoe UI", sans-serif'],
  ['comic', 'Playful', '"Comic Sans MS", "Comic Neue", cursive'],
  ['serif', 'Storybook', 'Georgia, "Times New Roman", serif'],
  ['mono', 'Robot', '"Consolas", "Courier New", monospace'],
  ['bold', 'Loud', 'Impact, "Arial Black", sans-serif'],
  ['script', 'Handwritten', '"Segoe Script", "Segoe Print", cursive'],
];
export const LABEL_ANIMS = [['pop', 'Pop'], ['bounce', 'Bounce'], ['float', 'Float up'], ['wiggle', 'Wiggle'], ['type', 'Typewriter'], ['glitch', 'Glitch'], ['fade', 'Fade']];
export const ICON_ANIMS = [['mix', 'A mix (she picks)'], ['pop', 'Pop'], ['bounce', 'Bounce'], ['wobble', 'Wobble'], ['drop', 'Drop in'], ['spin', 'Spin']];
export const ASCII_AMOUNTS = [['off', 'Never'], ['sometimes', 'Sometimes'], ['often', 'Often']];

export function readFx() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(FX_KEY) || '{}') || {}; } catch (e) {}
  return { ...FX_DEFAULTS, ...s };
}
export function writeFx(next) {
  const out = {};
  for (const k of Object.keys(FX_DEFAULTS)) if (next[k] !== undefined && next[k] !== FX_DEFAULTS[k]) out[k] = next[k];
  try { localStorage.setItem(FX_KEY, JSON.stringify(out)); } catch (e) {}
}

let fx = readFx();
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

// put the picks on the page: classes for the label box and animation,
// variables for font/size/border/see-through. on <body>, because
// js/desktop.js resets <html>'s inline style whenever the colors change
export function applyFx(next) {
  fx = next ? { ...FX_DEFAULTS, ...next } : readFx();
  const b = document.body;
  if (!b) return fx;
  for (const c of [...b.classList]) if (/^(lbl|ico)-/.test(c)) b.classList.remove(c);
  b.classList.add('lbl-box-' + fx.lBox, 'lbl-anim-' + fx.lAnim);
  const font = LABEL_FONTS.find(f => f[0] === fx.lFont) || LABEL_FONTS[0];
  b.style.setProperty('--label-font', font[2]);
  b.style.setProperty('--label-size', num(fx.lSize, 8, 24, 12) + 'px');
  b.style.setProperty('--label-border', num(fx.lBorder, 0, 5, 1) + 'px');
  b.style.setProperty('--label-a', String(num(fx.lAlpha, 0, 1, 1)));
  return fx;
}
export function currentFx() { return fx; }

// her size on the desktop: the ripple, labels and thought bubbles grow
// and shrink with her (1 = her medium size). the css reads --fx-k off
// <body>; the settings window's preview never sets it, so stays at 1
let fxK = 1;
export function setScale(k) {
  fxK = num(k, 0.4, 3, 1);
  if (document.body) document.body.style.setProperty('--fx-k', String(fxK));
}
export function scale() { return fxK; }

// ---------------------------------------------------------------
// the css, injected once. the labels' base look moved here from
// desktop.html so the settings window's preview matches exactly

const CSS = `
.fx-ripple { position: fixed; z-index: 7; pointer-events: none; transform: translate(-50%, -50%) scale(.3); opacity: 0;
  color: var(--ripple, var(--accent, #ec0054)); animation-fill-mode: forwards; animation-timing-function: ease-out; }
.fx-ripple svg { display: block; width: 100%; height: 100%; overflow: visible; }
.fx-ripple svg * { fill: none; stroke: currentColor; stroke-linejoin: round; }
.fx-ripple.piece svg * { fill: currentColor; stroke: none; }
@keyframes fx-expand { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.3); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4); } }
@keyframes fx-pulse { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.4); } 35% { transform: translate(-50%, -50%) scale(1); }
  55% { opacity: .9; transform: translate(-50%, -50%) scale(.8); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.35); } }
@keyframes fx-wavy { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.3) rotate(0); } 25% { transform: translate(-50%, -50%) scale(.65) rotate(14deg); }
  50% { transform: translate(-50%, -50%) scale(.95) rotate(-12deg); } 75% { opacity: .6; transform: translate(-50%, -50%) scale(1.2) rotate(9deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.45) rotate(0); } }
@keyframes fx-shaky { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.3); } 15% { transform: translate(-58%, -46%) scale(.5); }
  30% { transform: translate(-42%, -54%) scale(.7); } 45% { transform: translate(-56%, -52%) scale(.85); } 60% { opacity: .7; transform: translate(-44%, -47%) scale(1); }
  80% { transform: translate(-53%, -53%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.3); } }
@keyframes fx-spin { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.3) rotate(0); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.4) rotate(200deg); } }
@keyframes fx-piece { 0% { opacity: 1; transform: translate(-50%, -50%) scale(.4); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(var(--rot)); } }

/* the labels */
.action-label { position: absolute; z-index: 8; pointer-events: none; padding: calc(3px * var(--fx-k, 1)) calc(9px * var(--fx-k, 1)); white-space: nowrap;
  font: 800 calc(var(--label-size, 12px) * var(--fx-k, 1)) var(--label-font, Arial, Helvetica, sans-serif);
  color: var(--label-ink, var(--ink, #fff)); text-shadow: var(--outline, none);
  background: color-mix(in srgb, var(--label, var(--bubble, #191233)) calc(var(--label-a, 1) * var(--bubble-a, 1) * 100%), transparent);
  border: var(--label-border, calc(1px * var(--fx-k, 1))) solid var(--label-edge, var(--edge, #ec0054)); border-radius: calc(10px * var(--fx-k, 1));
  transform: translate(-50%, -100%) scale(.8); opacity: 0; }
.action-label.on { animation: label-pop 1.25s ease forwards; }
.rub-label { transform: translate(-50%, -100%) scale(.9); transition: opacity .25s ease, transform .25s ease, left .2s ease, top .2s ease; }
.rub-label.on { animation: none !important; opacity: 1; transform: translate(-50%, -100%) scale(1); }
body.lbl-box-pill .action-label { border-radius: calc(999px * var(--fx-k, 1)); padding: calc(3px * var(--fx-k, 1)) calc(12px * var(--fx-k, 1)); }
body.lbl-box-square .action-label { border-radius: calc(3px * var(--fx-k, 1)); }
body.lbl-box-bubble .action-label { margin-top: calc(-7px * var(--fx-k, 1)); }
body.lbl-box-bubble .action-label::after { content: ''; position: absolute; left: 50%; bottom: calc(calc(-6px * var(--fx-k, 1)) - var(--label-border, calc(1px * var(--fx-k, 1)))); width: calc(9px * var(--fx-k, 1)); height: calc(9px * var(--fx-k, 1));
  background: inherit; border-right: inherit; border-bottom: inherit; transform: translateX(-50%) rotate(45deg); }
body.lbl-box-cloud .action-label { border-radius: calc(18px * var(--fx-k, 1)); padding: calc(5px * var(--fx-k, 1)) calc(13px * var(--fx-k, 1)); margin-top: calc(-10px * var(--fx-k, 1)); }
body.lbl-box-cloud .action-label::before, body.lbl-box-cloud .action-label::after { content: ''; position: absolute; border-radius: 50%;
  background: inherit; border: inherit; }
body.lbl-box-cloud .action-label::before { width: calc(8px * var(--fx-k, 1)); height: calc(8px * var(--fx-k, 1)); left: 32%; bottom: calc(-10px * var(--fx-k, 1)); }
body.lbl-box-cloud .action-label::after { width: calc(4px * var(--fx-k, 1)); height: calc(4px * var(--fx-k, 1)); left: 24%; bottom: calc(-16px * var(--fx-k, 1)); }
body.lbl-box-jun .action-label { border-radius: 0; border-width: 0; border-left: calc(var(--label-border, calc(1px * var(--fx-k, 1))) + calc(3px * var(--fx-k, 1))) solid var(--label-edge, var(--edge, #ec0054));
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - calc(7px * var(--fx-k, 1))), calc(100% - calc(7px * var(--fx-k, 1))) 100%, 0 100%); padding: calc(3px * var(--fx-k, 1)) calc(11px * var(--fx-k, 1)) calc(3px * var(--fx-k, 1)) calc(8px * var(--fx-k, 1)); }
body.lbl-box-none .action-label { background: none; border: 0; padding: 0;
  text-shadow: 0 0 calc(2px * var(--fx-k, 1)) #000, 0 0 calc(3px * var(--fx-k, 1)) #000, calc(1px * var(--fx-k, 1)) calc(1px * var(--fx-k, 1)) 0 #000, calc(-1px * var(--fx-k, 1)) calc(-1px * var(--fx-k, 1)) 0 #000, 0 0 calc(8px * var(--fx-k, 1)) var(--label-edge, var(--edge, #ec0054)); }
body.lbl-anim-bounce .action-label.on { animation-name: label-bounce; }
body.lbl-anim-float .action-label.on { animation-name: label-float; animation-duration: 1.4s; }
body.lbl-anim-wiggle .action-label.on { animation-name: label-wiggle; }
body.lbl-anim-fade .action-label.on { animation-name: label-fade; }
body.lbl-anim-type .action-label.on { animation-name: label-fade; animation-duration: var(--type-ms, 1.25s); }
body.lbl-anim-glitch .action-label.on { animation-name: label-glitch; }
@keyframes label-pop { 0% { opacity: 0; transform: translate(-50%, -80%) scale(.8); } 15% { opacity: 1; transform: translate(-50%, -100%) scale(1.05); }
  75% { opacity: 1; transform: translate(-50%, -110%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -130%) scale(1); } }
@keyframes label-bounce { 0% { opacity: 0; transform: translate(-50%, -40%) scale(.6); } 12% { opacity: 1; transform: translate(-50%, -125%) scale(1.08); }
  22% { transform: translate(-50%, -92%) scale(.97); } 32% { transform: translate(-50%, -108%) scale(1.02); } 40% { transform: translate(-50%, -100%) scale(1); }
  80% { opacity: 1; transform: translate(-50%, -100%); } 100% { opacity: 0; transform: translate(-50%, -100%) scale(.9); } }
@keyframes label-float { 0% { opacity: 0; transform: translate(-50%, -70%) scale(1); } 15% { opacity: 1; }
  70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -260%) scale(1); } }
@keyframes label-wiggle { 0% { opacity: 0; transform: translate(-50%, -90%) scale(.8) rotate(0); } 10% { opacity: 1; transform: translate(-50%, -100%) scale(1.05) rotate(-7deg); }
  20% { transform: translate(-50%, -100%) rotate(6deg); } 30% { transform: translate(-50%, -100%) rotate(-4deg); } 40% { transform: translate(-50%, -100%) rotate(2deg); }
  50% { transform: translate(-50%, -100%) rotate(0); } 80% { opacity: 1; transform: translate(-50%, -105%); } 100% { opacity: 0; transform: translate(-50%, -115%); } }
@keyframes label-fade { 0% { opacity: 0; transform: translate(-50%, -100%) scale(1); } 15% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -100%) scale(1); } }
@keyframes label-glitch { 0% { opacity: 0; transform: translate(-50%, -100%); }
  5% { opacity: 1; transform: translate(-56%, -100%) skewX(18deg); text-shadow: calc(2px * var(--fx-k, 1)) 0 #0ff, calc(-2px * var(--fx-k, 1)) 0 #f0a; }
  10% { transform: translate(-46%, -96%) skewX(-12deg); } 15% { opacity: .4; transform: translate(-51%, -103%); }
  20% { opacity: 1; transform: translate(-50%, -100%); text-shadow: var(--outline, none); }
  62% { transform: translate(-50%, -100%); } 64% { transform: translate(-53%, -100%) skewX(10deg); text-shadow: calc(2px * var(--fx-k, 1)) 0 #0ff, calc(-2px * var(--fx-k, 1)) 0 #f0a; }
  67% { transform: translate(-50%, -100%); text-shadow: var(--outline, none); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -100%); } }

/* her thought icons */
.emote { position: absolute; z-index: 5; pointer-events: none; min-width: calc(30px * var(--fx-k, 1)); height: calc(30px * var(--fx-k, 1)); padding: 0 calc(6px * var(--fx-k, 1)); box-sizing: border-box; white-space: nowrap;
  display: flex; align-items: center; justify-content: center; font: 800 calc(18px * var(--fx-k, 1)) Arial, Helvetica, sans-serif; color: var(--ink, #fff); text-shadow: var(--outline, none);
  background: var(--bubble-bg, #191233); border: calc(2px * var(--fx-k, 1)) solid var(--edge, #ec0054); border-radius: calc(15px * var(--fx-k, 1)); transform: translate(-50%, -100%) scale(0); opacity: 0; }
.emote::after { content: ''; position: absolute; left: 50%; bottom: calc(-7px * var(--fx-k, 1)); width: calc(10px * var(--fx-k, 1)); height: calc(10px * var(--fx-k, 1)); background: var(--bubble-bg, #191233);
  border-right: calc(2px * var(--fx-k, 1)) solid var(--edge, #ec0054); border-bottom: calc(2px * var(--fx-k, 1)) solid var(--edge, #ec0054); transform: translateX(-50%) rotate(45deg); }
.emote.show { animation: emote-pop 1.9s ease forwards; }
.emote.pic { font-size: calc(17px * var(--fx-k, 1)); }
@keyframes emote-pop { 0% { opacity: 0; transform: translate(-50%, -80%) scale(0); } 12% { opacity: 1; transform: translate(-50%, -105%) scale(1.15); }
  20% { transform: translate(-50%, -100%) scale(1); } 80% { opacity: 1; transform: translate(-50%, -100%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -120%) scale(.9); } }
/* ascii faces get a little terminal look */
.emote.ascii { font-family: "Consolas", "Courier New", monospace; font-size: calc(15px * var(--fx-k, 1)); letter-spacing: -.02em; padding: 0 calc(7px * var(--fx-k, 1)); }
.emote .caret { display: inline-block; width: calc(6px * var(--fx-k, 1)); height: calc(13px * var(--fx-k, 1)); margin-left: calc(2px * var(--fx-k, 1)); background: currentColor; animation: fx-caret .5s steps(1) infinite; }
@keyframes fx-caret { 50% { opacity: 0; } }
.emote.show.ico-bounce { animation-name: emote-bounce; }
.emote.show.ico-wobble { animation-name: emote-wobble; }
.emote.show.ico-drop { animation-name: emote-drop; }
.emote.show.ico-spin { animation-name: emote-spin; }
@keyframes emote-bounce { 0% { opacity: 0; transform: translate(-50%, -60%) scale(.3); } 10% { opacity: 1; transform: translate(-50%, -135%) scale(1.1); }
  20% { transform: translate(-50%, -92%) scale(1, .9); } 28% { transform: translate(-50%, -112%) scale(1); } 36% { transform: translate(-50%, -100%); }
  80% { opacity: 1; transform: translate(-50%, -100%); } 100% { opacity: 0; transform: translate(-50%, -120%) scale(.9); } }
@keyframes emote-wobble { 0% { opacity: 0; transform: translate(-50%, -90%) scale(0); } 12% { opacity: 1; transform: translate(-50%, -100%) scale(1.1) rotate(-12deg); }
  22% { transform: translate(-50%, -100%) scale(1) rotate(10deg); } 32% { transform: translate(-50%, -100%) rotate(-6deg); } 42% { transform: translate(-50%, -100%) rotate(3deg); }
  52% { transform: translate(-50%, -100%) rotate(0); } 80% { opacity: 1; transform: translate(-50%, -100%); } 100% { opacity: 0; transform: translate(-50%, -120%) scale(.9); } }
@keyframes emote-drop { 0% { opacity: 0; transform: translate(-50%, -260%) scale(1); } 14% { opacity: 1; transform: translate(-50%, -95%) scale(1.1, .85); }
  22% { transform: translate(-50%, -106%) scale(.95, 1.05); } 30% { transform: translate(-50%, -100%) scale(1); }
  80% { opacity: 1; transform: translate(-50%, -100%); } 100% { opacity: 0; transform: translate(-50%, -100%) scale(.6); } }
@keyframes emote-spin { 0% { opacity: 0; transform: translate(-50%, -100%) scale(0) rotate(-360deg); } 18% { opacity: 1; transform: translate(-50%, -100%) scale(1.1) rotate(0); }
  26% { transform: translate(-50%, -100%) scale(1); } 80% { opacity: 1; transform: translate(-50%, -100%); } 100% { opacity: 0; transform: translate(-50%, -120%) scale(.9); } }
`;
export function installCss() {
  if (document.getElementById('fx-css')) return;
  const st = document.createElement('style');
  st.id = 'fx-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

// ---------------------------------------------------------------
// the ripple

function starPath(points, outer, inner) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + i * Math.PI / points;
    d += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
  }
  return d + 'Z';
}
const SHAPES = {
  circle: '<circle r="10"/>',
  heart: '<path d="M0 9.5C-8.5 3.5-11.5-2.5-8-6.8C-5-10.2-1.4-8.6 0-5.4C1.4-8.6 5-10.2 8-6.8C11.5-2.5 8.5 3.5 0 9.5Z"/>',
  star: `<path d="${starPath(5, 11, 4.6)}"/>`,
  sparkle: '<path d="M0-11Q1.6-1.6 11 0Q1.6 1.6 0 11Q-1.6 1.6-11 0Q-1.6-1.6 0-11Z"/>',
  paw: '<ellipse cx="0" cy="4" rx="5.6" ry="4.6"/><circle cx="-7" cy="-2.2" r="2.4"/><circle cx="-2.6" cy="-7" r="2.4"/><circle cx="2.6" cy="-7" r="2.4"/><circle cx="7" cy="-2.2" r="2.4"/>',
  diamond: '<path d="M0-11L8.5 0L0 11L-8.5 0Z"/>',
};
function shapeEl(shape, px, stroke, piece) {
  const el = document.createElement('div');
  el.className = 'fx-ripple' + (piece ? ' piece' : '');
  el.style.width = el.style.height = px + 'px';
  // the svg is 24 units across; keep the line the same width in px
  const sw = (stroke * 24 / px).toFixed(2);
  el.innerHTML = `<svg viewBox="-12 -12 24 24" aria-hidden="true"><g stroke-width="${sw}">${SHAPES[shape] || SHAPES.circle}</g></svg>`;
  return el;
}

// a ripple at (x, y). opts can override the owner's picks for one
// ripple ({ shape, motion, color }): that's how she uses it to react
export function ripple(x, y, opts = {}) {
  const shape = SHAPES[opts.shape] ? opts.shape : fx.rShape;
  const motion = opts.motion || fx.rMotion;
  const size = num(opts.size ?? fx.rSize, 0.4, 3, 1);
  const speed = num(fx.rSpeed, 0.3, 3, 1);
  const rings = Math.round(num(opts.rings ?? fx.rRings, 1, 4, 1));
  const width = num(fx.rWidth, 0.5, 6, 2) * Math.max(0.6, Math.sqrt(fxK));
  const px = Math.round(34 * size * fxK);
  const ms = Math.round((motion === 'pulse' ? 900 : motion === 'wavy' || motion === 'shaky' ? 750 : 550) / speed);
  const gap = Math.round((motion === 'pulse' ? 230 : 140) / speed);
  const made = [];
  const add = (el, delay, anim, dur) => {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (opts.color) el.style.color = opts.color;
    el.style.animationName = anim;
    el.style.animationDuration = dur + 'ms';
    el.style.animationDelay = delay + 'ms';
    document.body.appendChild(el);
    made.push(el);
  };
  if (motion === 'burst') {
    // one ring plus little pieces of the shape flying out
    add(shapeEl(shape, px, width), 0, 'fx-expand', ms);
    const n = 5 + rings * 2;
    const turn = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = turn + i * 2 * Math.PI / n;
      const dist = px * (0.9 + Math.random() * 0.5);
      const p = shapeEl(shape, Math.max(5, Math.round(px * 0.3)), width, true);
      p.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(a) * dist).toFixed(1) + 'px');
      p.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 180) + 'deg');
      add(p, 20, 'fx-piece', Math.round(ms * 1.3));
    }
  } else {
    const anim = { expand: 'fx-expand', pulse: 'fx-pulse', wavy: 'fx-wavy', shaky: 'fx-shaky', spin: 'fx-spin' }[motion] || 'fx-expand';
    for (let i = 0; i < rings; i++) add(shapeEl(shape, px, width), i * gap, anim, ms);
  }
  const total = ms * 1.3 + gap * rings + 80;
  setTimeout(() => made.forEach(el => el.remove()), total);
  return made;
}

// ---------------------------------------------------------------
// the labels: the text, typed out one letter at a time if that's the
// pick. returns how long it needs to stay up

const typing = new WeakMap();
export function labelText(el, text, base = 1300) {
  clearInterval(typing.get(el));
  if (fx.lAnim !== 'type' || el.classList.contains('rub-label')) { el.textContent = text; return base; }
  const chars = [...text];
  const step = 38;
  const ms = base + chars.length * step;
  el.style.setProperty('--type-ms', ms + 'ms');
  let i = 0;
  el.textContent = '';
  const t = setInterval(() => {
    i++;
    el.textContent = chars.slice(0, i).join('') + (i < chars.length ? '▌' : '');
    if (i >= chars.length) clearInterval(t);
  }, step);
  typing.set(el, t);
  return ms;
}

// ---------------------------------------------------------------
// her thought icons

// [symbol, kind of icon]: 'sym' a symbol or word, 'pic' a little picture,
// 'ascii' one of her robot faces (she knows what she is, and finds it
// funny). a few are effects instead (hearts: a burst of hearts)
export const EMOTES = {
  // the first ones
  note: ['♪', 'sym'], question: ['?', 'sym'], bang: ['!', 'sym'], heart: ['♥', 'sym'], dots: ['…', 'sym'], bonk: ['!!', 'sym'], zzz: ['z', 'sym'],
  anger: ['💢', 'pic'], sparkle: ['✨', 'pic'], laugh: ['ha!', 'sym'], sweat: ['💧', 'pic'], coffee: ['☕', 'pic'], moon: ['🌙', 'pic'], star: ['⭐', 'pic'], flower: ['🌸', 'pic'],
  // new pictures and words
  interrobang: ['!?', 'sym'], twohearts: ['💕', 'pic'], sparkheart: ['💖', 'pic'], idea: ['💡', 'pic'], sleepy: ['💤', 'pic'], notes: ['♫', 'sym'],
  game: ['🎮', 'pic'], snack: ['🍙', 'pic'], gear: ['⚙️', 'pic'], battery: ['🔋', 'pic'], processing: ['⏳', 'pic'], paw: ['🐾', 'pic'],
  sun: ['☀️', 'pic'], rain: ['☔', 'pic'], smug: ['ehe~', 'sym'], hmph: ['hmph', 'sym'],
  // her robot faces
  a_happy: ['^_^', 'ascii'], a_cat: [':3', 'ascii'], a_fluster: ['>_<', 'ascii'], a_heart: ['<3', 'ascii'], a_shock: ['o_O', 'ascii'],
  a_flat: ['-_-', 'ascii'], a_cry: ['T_T', 'ascii'], a_dizzy: ['x_x', 'ascii'], a_tongue: [':P', 'ascii'], a_owo: ['OwO', 'ascii'],
  a_mad: ['>:(', 'ascii'], a_wink: [';)', 'ascii'], a_err: ['[ERR]', 'ascii'], a_ok: ['[OK]', 'ascii'], a_beep: ['beep!', 'ascii'],
  a_binary: ['01001', 'ascii'], a_load: ['[...]', 'ascii'], a_love: ['love.exe', 'ascii'], a_blush: ['>///<', 'ascii'],
};
// what the settings window shows in its icon gallery
export const EMOTE_GROUPS = [
  ['Feelings', ['heart', 'twohearts', 'sparkheart', 'note', 'notes', 'sparkle', 'star', 'flower', 'laugh', 'smug']],
  ['Surprised and flustered', ['bang', 'bonk', 'interrobang', 'question', 'sweat', 'dots', 'anger', 'hmph']],
  ['Her day', ['coffee', 'snack', 'game', 'idea', 'moon', 'zzz', 'sleepy', 'sun', 'rain', 'paw']],
  ['Android', ['gear', 'battery', 'processing']],
  ['Robot faces (ASCII)', Object.keys(EMOTES).filter(k => EMOTES[k][1] === 'ascii')],
];

// the same feeling, said a different way now and then. her basic icons
// (the ones body.js and desktop.js ask for) sometimes come out as one of
// these instead, chosen by how close they are (1 = Stranger/Familiar,
// 2 = Friend, 3 = Close and up) and her mood
function variants(kind, close, mood) {
  switch (kind) {
    case 'heart': return close >= 3 ? ['twohearts', 'sparkheart', 'a_heart', 'a_love'] : close === 2 ? ['a_heart', 'a_happy'] : [];
    case 'bang': return close <= 1 ? ['interrobang', 'a_shock'] : ['interrobang', 'a_shock', 'a_blush'];
    case 'sweat': return close <= 1 ? ['a_fluster', 'interrobang'] : ['a_fluster', 'a_blush'];
    case 'laugh': return ['a_happy', 'a_tongue', 'a_cat'];
    case 'anger': return ['hmph', 'a_mad', 'a_flat'];
    case 'question': return ['a_shock', 'processing', 'a_load'];
    case 'note': return mood === 'happy' ? ['notes', 'a_cat', 'a_happy'] : ['notes', 'a_cat'];
    case 'sparkle': return ['a_owo', 'star'];
    case 'dots': return ['a_flat', 'processing', 'a_load'];
    case 'zzz': return ['sleepy'];
    case 'bonk': return ['a_dizzy', 'a_err'];
    default: return [];
  }
}

let lastIcon = null, lastIconAt = 0;
// which icon to really show for the one asked for: sometimes a variant,
// never the same one twice in a row (within a few seconds)
export function pickEmote(kind, ctx = {}) {
  if (!EMOTES[kind]) return kind;
  const asciiW = { off: 0, sometimes: 1, often: 2.2 }[fx.eAscii] ?? 1;
  const alts = variants(kind, ctx.close || 1, ctx.mood).filter(k => EMOTES[k][1] !== 'ascii' || asciiW > 0);
  let pick = kind;
  const chance = 0.3 + (asciiW > 1 ? 0.12 : 0);
  if (alts.length && Math.random() < chance) {
    // weight the robot faces by the setting
    const w = alts.map(k => (EMOTES[k][1] === 'ascii' ? asciiW : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    pick = alts[alts.length - 1];
    for (let i = 0; i < alts.length; i++) { r -= w[i]; if (r <= 0) { pick = alts[i]; break; } }
  }
  const now = Date.now();
  if (pick === lastIcon && now - lastIconAt < 6000) {
    const others = [kind, ...alts].filter(k => k !== lastIcon);
    if (others.length) pick = others[Math.floor(Math.random() * others.length)];
  }
  lastIcon = pick;
  lastIconAt = now;
  return pick;
}
// for her own idle thoughts: pick from a pool, but not the last one
export function pickFromPool(pool) {
  const asciiW = { off: 0, sometimes: 1, often: 2.2 }[fx.eAscii] ?? 1;
  // 'hearts' is the burst-of-hearts effect, not an icon of its own
  let p = pool.filter(k => k === 'hearts' || (EMOTES[k] && (EMOTES[k][1] !== 'ascii' || asciiW > 0)));
  if (asciiW > 1) p = p.concat(p.filter(k => EMOTES[k]?.[1] === 'ascii'));
  const fresh = p.filter(k => k !== lastIcon);
  const from = fresh.length ? fresh : p;
  return from.length ? from[Math.floor(Math.random() * from.length)] : 'dots';
}

const ICON_MIX = ['pop', 'pop', 'bounce', 'wobble', 'drop', 'spin'];
// fill the bubble element with an icon and pick how it pops in
export function fillEmote(el, kind) {
  const [text, type] = EMOTES[kind] || [String(kind), 'sym'];
  el.textContent = text;
  el.classList.toggle('pic', type === 'pic');
  el.classList.toggle('ascii', type === 'ascii');
  if (type === 'ascii') {
    const c = document.createElement('i');
    c.className = 'caret';
    el.appendChild(c);
  }
  for (const c of [...el.classList]) if (c.startsWith('ico-')) el.classList.remove(c);
  let anim = fx.eAnim === 'mix' ? ICON_MIX[Math.floor(Math.random() * ICON_MIX.length)] : fx.eAnim;
  // a dizzy or error face spins in, a sleepy one drops: fits them
  if (fx.eAnim === 'mix' && (kind === 'a_dizzy' || kind === 'a_err') && Math.random() < 0.5) anim = 'spin';
  if (anim !== 'pop') el.classList.add('ico-' + anim);
  return text;
}

// ---------------------------------------------------------------
// her pick: the ripple as part of how she reacts. the owner's own
// shape and motion stay the rule; now and then, when it fits, she
// changes it for one ripple. close: 1 Stranger/Familiar, 2 Friend, 3 Close+
const SHY = new Set(['tail', 'thigh', 'feet', 'side']);
const WARM = new Set(['head', 'hug', 'hand', 'cheek']);
export function reactionRipple(kind, close = 1, mood = 'neutral') {
  if (!fx.rHerPick) return null;
  const r = Math.random();
  if (SHY.has(kind) && close <= 1 && r < 0.6) return { motion: 'shaky' };
  if (mood === 'upset' && r < 0.4) return { motion: 'shaky', size: Math.max(0.6, fx.rSize * 0.8) };
  if (WARM.has(kind) && close >= 3 && r < 0.3) return { shape: 'heart', motion: 'burst' };
  if (WARM.has(kind) && close === 2 && r < 0.15) return { shape: 'heart' };
  if (kind === 'nose' && r < 0.35) return { shape: 'star', motion: 'burst' };
  if (kind === 'tail' && close >= 2 && r < 0.2) return { shape: 'paw' };
  if (mood === 'happy' && r < 0.1) return { shape: 'sparkle', motion: 'spin' };
  return null;
}
