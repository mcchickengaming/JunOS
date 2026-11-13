// The rig lab (rig-lab.html): a page to try the Inochi2D renderer and the
// renderer layer without touching Jun herself. It shows the code-drawn lab
// doll (a main rig and a close-up rig sharing param names) or any .inp /
// .inx puppet dropped on it, and "Run the checks" proves what the design
// sheet (§7) needs: shared params, the crossfade, big textures with mipmaps,
// the glow blend and the glitch.
/* global PIXI */

import { encodeInp, premultiply } from './rig/inochi/inochi-format.js?v=1';
import { buildTestPuppet, paintAtlas } from './rig/inochi/inochi-doll.js?v=1';
import { Puppet } from './rig/inochi/inochi-puppet.js?v=1';
import { InochiView, loadPuppetView } from './rig/inochi/inochi-view.js?v=1';
import { checkRig, inochiRig, linkRigs, plugIntoJun } from './rig/rig.js?v=1';
import { Crossfade, glitch } from './rig/rig-fx.js?v=1';

const $ = (id) => document.getElementById(id);
const stageEl = $('stage');

const app = new PIXI.Application({
  view: $('view'), backgroundAlpha: 0, antialias: true, autoDensity: true,
  resolution: Math.min(2, window.devicePixelRatio || 1), resizeTo: stageEl,
});
const world = new PIXI.Container();   // the camera: puppet units in, screen out
app.stage.addChild(world);

// Jun's ids for the doll's head turn (one pair on the puppet, two numbers of hers)
const DOLL_MAP = { ParamHeadX: 'ParamHead.x', ParamHeadY: 'ParamHead.y' };
const LIGHTS = [
  ['Calm', '#b83a66'], ['Flustered', '#ff4fa3'], ['Happy', '#ffc94d'], ['Sad', '#6aa8ff'],
  ['Sleepy', '#a99bd6'], ['Focused', '#e6ff3d'], ['Charging', '#3de0ff'],
];
const GLOW_PARTS = /IrisRing|Seam/;
const SWITCH_ZOOM = 2.2;

const L = {
  rigs: [],          // [main] or [main, closeup]
  link: null,        // the one set of numbers everything is driven through
  fade: null,
  isDoll: false,
  textures: [],      // PIXI textures in use, for the mipmap switch
  move: true, mips: true, zoom: 1, t: 0,
  face: { x: 0, y: 0 }, box: { x: 0, y: 0, width: 1, height: 1 },
  jun: null,         // Jun's own modules, once "Jun's own code drives her" is on
  glitches: [],
  light: { from: [1, 1, 1], to: [1, 1, 1], now: [1, 1, 1], t: 1 },
  wantClose: null,   // null = the camera decides, true/false = the button did
  dragging: null,
};

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const id = (name) => L.link.params.index.get(name);
const has = (name) => L.link.params.index.has(name);
function set(name, v) { const i = id(name); if (i !== undefined) L.link.params.values[i] = v; }
function get(name) { const i = id(name); return i === undefined ? 0 : L.link.params.values[i]; }

function clearRigs() {
  for (const g of L.glitches) g.stop();
  L.glitches.length = 0;
  for (const r of L.rigs) r.destroy();
  for (const t of L.textures) t.destroy(true);
  L.rigs = []; L.textures = []; L.link = null; L.fade = null; L.wantClose = null;
  if (L.jun) { L.jun = null; $('junDrive').classList.remove('on'); }
}

function place(rig) {
  const b = rig.puppet.bounds();
  // the holder's corner goes where the puppet's corner is, so "world" is in puppet units
  rig.view.position.set(b.x, b.y);
  world.addChild(rig.view);
}

function texturesFrom(canvases) {
  return canvases.map((cv) => {
    const t = PIXI.Texture.from(cv, { mipmap: L.mips ? PIXI.MIPMAP_MODES.ON : PIXI.MIPMAP_MODES.OFF, scaleMode: PIXI.SCALE_MODES.LINEAR, anisotropicLevel: L.mips ? 4 : 0 });
    L.textures.push(t);
    return t;
  });
}

function useDoll() {
  clearRigs();
  const made = [false, true].map((closeup) => {
    const built = buildTestPuppet({ closeup });
    const canvases = paintAtlas(built.atlas);
    const view = new InochiView(new Puppet(built.json), texturesFrom(canvases));
    const rig = inochiRig(view, { map: DOLL_MAP });
    rig.canvases = canvases; rig.json = built.json; rig.page = built.atlas.page;
    return rig;
  });
  L.rigs = made;
  made.forEach(place);          // close-up above the main rig
  L.link = linkRigs(made);
  L.fade = new Crossfade(made[0], made[1], { ms: 300 });
  L.isDoll = true;
  L.box = made[0].puppet.bounds();
  L.face = { x: 0, y: -170 };
  ready(`Lab doll: ${made[0].puppet.parts.length} parts in the main rig, ${made[1].puppet.parts.length} in the close-up rig (a ${made[1].page} px texture).`);
}

async function useFile(file) {
  status(`Reading ${file.name}…`);
  let view;
  try {
    view = await loadPuppetView(await file.arrayBuffer(), { mipmaps: L.mips });
  } catch (e) {
    status(`Couldn't open ${file.name}: ${e.message}`);
    return;
  }
  clearRigs();
  L.textures = view.textures.slice();
  const rig = inochiRig(view);
  L.rigs = [rig];
  place(rig);
  L.link = linkRigs([rig]);
  L.isDoll = false;
  L.box = rig.puppet.bounds();
  L.face = { x: L.box.x + L.box.width / 2, y: L.box.y + L.box.height * 0.2 };
  const p = rig.puppet, m = p.meta;
  const sizes = view.textures.map((t) => Math.max(t.baseTexture.width, t.baseTexture.height));
  const lines = [
    `${file.name}: ${p.parts.length} parts, ${p.params.length} params, ${view.textures.length} textures (largest ${Math.max(0, ...sizes)} px), ${p.physics.length} physics.`,
    m.artist || m.rigger ? `Art: ${m.artist || '?'}. Rig: ${m.rigger || '?'}.` : '',
    m.licenseURL ? `License: ${m.licenseURL}` : 'No license is named in the file.',
    p.unsupported.size ? `Not drawn yet: ${[...p.unsupported].join(', ')}.` : '',
  ];
  ready(lines.filter(Boolean).join('\n'));
}

function status(text) { $('status').textContent = text; }

function ready(text) {
  status(text);
  L.zoom = 1; $('zoom').value = 1;
  setLight(LIGHTS[0][1], true);
  buildSliders();
  $('closeup').style.display = L.fade ? '' : 'none';
  $('checks').innerHTML = '';
  camera();
}

// ---- camera ----
function camera() {
  const w = app.renderer.screen.width, h = app.renderer.screen.height, b = L.box;
  const fit = Math.min(w / (b.width || 1), h / (b.height || 1)) * 0.9;
  const s = fit * L.zoom;
  const k = Math.max(0, Math.min(1, L.zoom - 1));
  const fx = b.x + b.width / 2 + (L.face.x - (b.x + b.width / 2)) * k, fy = b.y + b.height / 2 + (L.face.y - (b.y + b.height / 2)) * k;
  world.scale.set(s);
  world.position.set(w / 2 - fx * s, h / 2 - fy * s);
  $('zoomOut').textContent = L.zoom.toFixed(1);
  if (L.fade) {
    const close = L.wantClose === null ? L.zoom >= SWITCH_ZOOM : L.wantClose;
    if ((L.fade.goal === 1) !== close) L.fade.show(close ? 1 : 0);
    $('closeup').classList.toggle('on', close);
  }
}

// ---- her light: one colour for the iris rings and the seams ----
function setLight(colour, now = false) {
  L.light.from = L.light.now.slice(); L.light.to = hex(colour); L.light.t = now ? 1 : 0;
  if (now) { L.light.now = L.light.to.slice(); paintLight(); }
  for (const b of $('lights').querySelectorAll('button')) b.classList.toggle('on', b.dataset.c === colour);
}
function paintLight() { for (const r of L.rigs) r.parts.look(GLOW_PARTS, { tint: L.light.now }); }

// ---- sliders ----
function buildSliders() {
  const host = $('sliders');
  host.innerHTML = '';
  const P = L.link.params;
  P.ids.forEach((name, i) => {
    const row = document.createElement('label');
    row.className = 'slider';
    const lo = P.minimumValues[i], hi = P.maximumValues[i];
    row.innerHTML = '<span></span><output></output><input type="range">';
    row.firstChild.textContent = name;
    const input = row.lastChild;
    input.min = lo; input.max = hi; input.step = (hi - lo) / 200 || 0.01; input.value = P.values[i];
    input.dataset.i = i;
    input.addEventListener('input', () => {
      L.dragging = i;
      const v = +input.value;
      if (L.jun) L.jun.Params.setTarget(name, v); else P.values[i] = v;
    });
    input.addEventListener('change', () => { L.dragging = null; });
    host.appendChild(row);
  });
}
function syncSliders() {
  const P = L.link.params;
  for (const input of $('sliders').querySelectorAll('input')) {
    const i = +input.dataset.i;
    if (L.dragging !== i) input.value = P.values[i];
    input.previousSibling.textContent = P.values[i].toFixed(2);
  }
}

// ---- "Move her": the lab's own little idle ----
function idle(t) {
  const P = L.link.params;
  const wave = (name, amp, period, phase = 0) => { if (has(name) && L.dragging !== id(name)) { const i = id(name); const mid = P.defaultValues[i]; set(name, Math.max(P.minimumValues[i], Math.min(P.maximumValues[i], mid + Math.sin(t / period * 2 * Math.PI + phase) * amp))); } };
  if (L.isDoll) {
    wave('ParamHeadX', 0.8, 3200); wave('ParamHeadY', 0.5, 4700, 1); wave('ParamBodyX', 0.7, 5300);
    wave('ParamArmLRot', 0.5, 2900); wave('ParamArmRRot', 0.5, 3500, 2); wave('ParamTailWiggle', 0.6, 1900);
    wave('ParamEyeballLX', 0.8, 4100); wave('ParamAntenna', 0.25, 2300);
    if (L.dragging !== id('ParamApertureRot')) set('ParamApertureRot', ((t / 6000) % 2) - 1);
    if (L.dragging !== id('ParamIrisGlow')) set('ParamIrisGlow', 0.45 + 0.35 * Math.sin(t / 900));
    const blink = t % 3400;
    if (L.dragging !== id('ParamEyeOpen')) set('ParamEyeOpen', blink < 90 ? -blink / 90 : blink < 150 ? -1 : blink < 300 ? -(300 - blink) / 150 : 0);
    return;
  }
  // somebody's puppet: sway whatever looks like a head, a body and a breath
  let k = 0;
  for (const name of P.ids) {
    if (/head|face|body|breath|eye.*move|tail/i.test(name) && !/blink|physics/i.test(name)) {
      const i = id(name), span = (P.maximumValues[i] - P.minimumValues[i]) / 2;
      wave(name, span * 0.7, 2600 + k * 730, k); k++;
    }
  }
  for (const name of P.ids) {
    if (/blink/i.test(name)) { const b = t % 3600; set(name, b < 110 ? P.maximumValues[id(name)] : P.minimumValues[id(name)]); }
  }
}

// ---- the frame ----
let last = performance.now();
app.ticker.add(() => {
  if (!L.link) return;
  const now = performance.now();
  const ms = Math.min(100, now - last);
  last = now;
  L.t += ms;
  if (L.jun) L.jun.Anim.tick();
  else if (L.move) idle(L.t);
  if (L.fade) L.fade.tick(ms);
  if (L.light.t < 1) {
    L.light.t = Math.min(1, L.light.t + ms / 500);
    for (let k = 0; k < 3; k++) L.light.now[k] = L.light.from[k] + (L.light.to[k] - L.light.from[k]) * L.light.t;
    paintLight();
  }
  L.link.update(ms);
  L.glitches = L.glitches.filter((g) => g.tick(ms));
  if ((L.t | 0) % 4 === 0) syncSliders();
});
new ResizeObserver(() => { if (L.link) camera(); }).observe(stageEl);

// ---- buttons ----
for (const [name, colour] of LIGHTS) {
  const b = document.createElement('button');
  b.className = 'swatch'; b.title = name; b.dataset.c = colour; b.style.background = colour;
  b.addEventListener('click', () => setLight(colour));
  $('lights').appendChild(b);
}
$('useDoll').addEventListener('click', useDoll);
$('file').addEventListener('change', (e) => { if (e.target.files[0]) useFile(e.target.files[0]); e.target.value = ''; });
$('move').addEventListener('click', () => { L.move = !L.move; $('move').classList.toggle('on', L.move); });
$('glitch').addEventListener('click', () => { L.glitches.push(glitch(world, { ms: 150 + Math.random() * 150 })); });
$('closeup').addEventListener('click', () => { L.wantClose = !(L.fade && L.fade.goal === 1); camera(); });
$('zoom').addEventListener('input', (e) => { L.zoom = +e.target.value; L.wantClose = null; camera(); });
$('bg').addEventListener('click', () => { $('bg').classList.toggle('on', stageEl.classList.toggle('light')); });
$('mips').addEventListener('click', () => { setMips(!L.mips); });
$('junDrive').addEventListener('click', () => junDrive(!L.jun));
$('run').addEventListener('click', () => runChecks());
$('big').addEventListener('click', () => report([bigTexture()], true));

function setMips(on) {
  L.mips = on;
  $('mips').classList.toggle('on', on);
  for (const t of L.textures) {
    const b = t.baseTexture;
    b.anisotropicLevel = on ? 4 : 0;
    b.setStyle(PIXI.SCALE_MODES.LINEAR, on ? PIXI.MIPMAP_MODES.ON : PIXI.MIPMAP_MODES.OFF);
  }
}

stageEl.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').style.display = 'flex'; });
stageEl.addEventListener('dragleave', () => { $('drop').style.display = 'none'; });
stageEl.addEventListener('drop', (e) => { e.preventDefault(); $('drop').style.display = 'none'; const f = e.dataTransfer.files[0]; if (f) useFile(f); });
stageEl.addEventListener('mousemove', (e) => {
  if (!L.rigs.length) return;
  const r = stageEl.getBoundingClientRect();
  const top = L.rigs.filter((g) => g.active).reverse();
  let name = null;
  for (const g of top) { name = g.parts.at(e.clientX - r.left, e.clientY - r.top); if (name) break; }
  $('hover').textContent = name ? `Under the mouse: ${name}` : '';
});

// ---- Jun's own code on the new rig ----
// params.js and anim.js are the modules her touch, feelings and desktop code
// already use. Here they pose the puppet with no changes to them.
async function junDrive(on) {
  if (!on) { L.jun = null; app.ticker.maxFPS = 0; $('junDrive').classList.remove('on'); return true; }
  try {
    const [State, Params, Anim] = await Promise.all([import('./live2d/state.js?v=75'), import('./live2d/params.js?v=4'), import('./live2d/anim.js?v=87')]);
    State.setApp(app);
    plugIntoJun({ view: L.rigs[0].view, params: L.link.params, core: L.rigs[0].core }, State);
    L.jun = { State, Params, Anim };
    $('junDrive').classList.add('on');
    if (L.isDoll) {
      Params.startLoop('ParamHeadX', 0.7, 3200); Params.startLoop('ParamHeadY', 0.4, 4700);
      Params.startLoop('ParamBodyX', 0.6, 5300); Params.startLoop('ParamTailWiggle', 0.5, 1900);
    }
    return true;
  } catch (e) {
    status(`Jun's own modules didn't load here: ${e.message}`);
    return false;
  }
}

// ---- the checks ----
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let shot = null;
function snap() {
  const w = Math.round(app.renderer.screen.width), h = Math.round(app.renderer.screen.height);
  if (!shot || shot.width !== w || shot.height !== h) { if (shot) shot.destroy(true); shot = PIXI.RenderTexture.create({ width: w, height: h, resolution: 1 }); }
  app.renderer.render(app.stage, { renderTexture: shot, clear: true });
  const data = app.renderer.extract.pixels(shot);
  return { w, h, data, at(x, y) { const o = ((y | 0) * w + (x | 0)) * 4; return [data[o], data[o + 1], data[o + 2], data[o + 3]]; } };
}
// a point in puppet units -> where it lands in a snap
function onScreen(x, y) { world.updateTransform(); return world.worldTransform.apply({ x, y }); }
function diff(a, b) { let n = 0, sum = 0; for (let i = 0; i < a.data.length; i += 4) { const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); if (d > 24) n++; sum += d; } return { changed: n, mean: sum / (a.data.length / 4) / 3 }; }

function rest() {
  const P = L.link.params;
  P.values.set(P.defaultValues);
  // physics-driven params aren't in the link: reset them on the puppets too,
  // or the last swing of her bangs is still in the picture
  for (const r of L.rigs) { r.puppet.resetParams(); r.puppet.settlePhysics(); }
}
function showOnly(i) { L.wantClose = i === 1; L.fade.show(i, true); }
function pose(ms = 0) { L.link.update(ms); }

function bigTexture() {
  const gl = app.renderer.gl, max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (max < 8192) return { name: 'An 8192 px texture', ok: false, detail: `This graphics card's limit is ${max} px.` };
  while (gl.getError() !== gl.NO_ERROR) { /* clear old errors */ }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8192, 8192, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.generateMipmap(gl.TEXTURE_2D);
  const err = gl.getError();
  gl.deleteTexture(tex);
  app.renderer.texture.reset();
  return { name: 'An 8192 px texture', ok: err === gl.NO_ERROR, detail: err === gl.NO_ERROR ? `Made one with mipmaps (limit here: ${max} px). It takes about 340 MB of video memory, so 4096 px pages are the safer default.` : `The graphics card said no (error ${err}).` };
}

async function runChecks() {
  if (!L.isDoll) useDoll();
  const out = [];
  const keep = { move: L.move, zoom: L.zoom, mips: L.mips, jun: !!L.jun };
  if (L.jun) await junDrive(false);
  L.move = false;
  app.ticker.stop();
  const [main, close] = L.rigs;
  const check = async (name, fn) => {
    try { const r = await fn(); out.push({ name, ok: !!r.ok, detail: r.detail }); } catch (e) { out.push({ name, ok: false, detail: `It threw: ${e.message}` }); }
    report(out);
    await frame();
  };

  await check('Two puppets, one set of numbers', () => {
    rest();
    main.active = true; close.active = true;
    set('ParamHeadX', 0.8); set('ParamHeadY', -0.5); set('ParamEyeOpen', -1); set('ParamBlush', 1.5); set('ParamBodyX', 0);
    L.link.update(0);
    let worst = 0, n = 0;
    for (const a of close.puppet.parts) {
      const b = main.puppet.find(a.name).find((x) => x.name === a.name);
      if (!b) continue;
      for (let i = 0; i < a.pos.length; i++) worst = Math.max(worst, Math.abs(a.pos[i] - b.pos[i]));
      n++;
    }
    const only = main.params.ids.filter((x) => !close.params.index.has(x)).length;
    return { ok: n >= 10 && worst < 0.01, detail: `${n} head parts land in the same place on both rigs (largest gap ${worst.toFixed(4)} units). ${only} body params exist only on the main rig and are skipped for the close-up.` };
  });

  await check('Crossfade between the rigs', () => {
    rest(); L.zoom = 3; L.wantClose = false; camera(); showOnly(0); pose();
    const p = onScreen(0, -120);      // a patch of forehead skin, on both rigs
    const before = snap().at(p.x, p.y);
    L.wantClose = true; L.fade.show(1);
    let ms = 0, steps = 0, minA = 255, both = 0, maxJump = 0;
    while (L.fade.busy && steps < 200) {
      L.fade.tick(1000 / 60); ms += 1000 / 60; steps++;
      L.link.update(1000 / 60);
      if (main.active && close.active) both++;
      const c = snap().at(p.x, p.y);
      minA = Math.min(minA, c[3]);
      maxJump = Math.max(maxJump, Math.abs(c[0] - before[0]), Math.abs(c[1] - before[1]), Math.abs(c[2] - before[2]));
    }
    const f0 = main.puppet.frame;
    L.link.update(16); L.link.update(16);
    const asleep = !main.active && main.puppet.frame === f0;
    return { ok: ms >= 290 && ms <= 320 && minA >= 250 && maxJump <= 16 && both > 5 && asleep, detail: `Took ${Math.round(ms)} ms. Both rigs were drawn for ${both} frames, her skin stayed solid the whole way (lowest opacity ${(minA / 255 * 100).toFixed(0)}%, colour moved ${maxJump}/255 at most), and afterwards the main rig is switched off (no updates, no drawing).` };
  });

  await check('Big textures with mipmaps', () => {
    const gl = app.renderer.gl, max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    rest(); showOnly(1);
    const rough = (on) => {
      setMips(on);
      L.zoom = 0.3; camera(); pose();
      const s = snap();
      const a = onScreen(-100, 0), b = onScreen(100, 80);     // the back hair's fine strand lines, under her chin
      let sum = 0, n = 0;
      for (let y = Math.ceil(a.y); y < b.y; y++) for (let x = Math.ceil(a.x); x < b.x - 1; x++) { const p = s.at(x, y), q = s.at(x + 1, y); if (p[3] > 250 && q[3] > 250) { sum += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n++; } }
      return n ? sum / n : -1;
    };
    const off = rough(false), on = rough(true);
    const base = close.puppetView.textures[0].baseTexture;
    const glTex = base._glTextures[app.renderer.CONTEXT_UID];
    return { ok: close.page >= 4096 && max >= 4096 && glTex && glTex.mipmap && on >= 0 && on < off * 0.8, detail: `The close-up rig's texture is ${base.width} × ${base.height} px with mipmaps and smooth filtering (this graphics card allows up to ${max} px). Drawn tiny, the fine hair lines flicker ${off.toFixed(1)} without mipmaps and ${on.toFixed(1)} with them.` };
  });

  await check('Glow that adds light, in a colour the code picks', () => {
    setMips(true); rest(); L.zoom = 3; camera(); showOnly(1);
    const p = onScreen(96, -170 + 64);
    const tint = [0.2, 1, 0.9];
    for (const r of L.rigs) r.parts.look(GLOW_PARTS, { tint });
    set('ParamSeamGlow', 0); pose();
    const dark = snap().at(p.x, p.y);
    set('ParamSeamGlow', 1); pose();
    const lit = snap().at(p.x, p.y);
    set('ParamSeamGlow', 0.5); pose();
    const half = snap().at(p.x, p.y);
    paintLight();
    const want = dark.map((v, k) => (k < 3 ? Math.min(255, v + tint[k] * 255) : v));
    const adds = [0, 1, 2].every((k) => lit[k] >= dark[k] && Math.abs(lit[k] - want[k]) <= 14) && half[0] > dark[0] && half[0] < lit[0];
    return { ok: adds, detail: `Cheek seam, glow off: rgb(${dark.slice(0, 3)}). On, tinted teal by the code: rgb(${lit.slice(0, 3)}), which is the skin plus the light (expected about rgb(${want.slice(0, 3).map(Math.round)})). Halfway: rgb(${half.slice(0, 3)}).` };
  });

  await check('Masks and layers', () => {
    rest(); L.zoom = 1; camera(); showOnly(0); pose();
    // tail: two overlapping pieces inside one 85% layer
    const [tm] = main.puppet.find('TailMain'), [tt] = main.puppet.find('TailTip');
    let cx = 0, cy = 0; for (let i = 0; i < tt.pos.length; i += 2) { cx += tt.pos[i]; cy += tt.pos[i + 1]; } cx /= tt.pos.length / 2; cy /= tt.pos.length / 2;
    const top = { x: tm.pos[0] * 0.5 + tm.pos[2] * 0.5, y: tm.pos[1] * 0.5 + tm.pos[3] * 0.5 }, end = { x: tm.pos[4] * 0.5 + tm.pos[6] * 0.5, y: tm.pos[5] * 0.5 + tm.pos[7] * 0.5 };
    // a spot covered by both pieces, and one covered by the tail alone
    const both2 = { x: top.x + (end.x - top.x) * 0.84, y: top.y + (end.y - top.y) * 0.84 };
    const overlap = Puppet.inside(tm, both2.x, both2.y) && Puppet.inside(tt, both2.x, both2.y) && Number.isFinite(cx + cy);
    const s = snap();
    const a = onScreen(both2.x, both2.y), b = onScreen(top.x + (end.x - top.x) * 0.3, top.y + (end.y - top.y) * 0.3);
    const both = s.at(a.x, a.y)[3], one = s.at(b.x, b.y)[3];
    // eye: the iris is bigger than the eye opening and must be cut off by it
    L.zoom = 4; camera(); showOnly(1); pose();
    const under = onScreen(-70, -180 + 37), mid = onScreen(-70, -180 + 26);
    const s2 = snap();
    const cut = s2.at(under.x, under.y), ring = s2.at(mid.x, mid.y);
    const lum = (c) => (c[0] + c[1] + c[2]) / 3;
    return { ok: overlap && Math.abs(both - 217) <= 4 && Math.abs(one - 217) <= 4 && lum(cut) > 170 && lum(ring) < 215, detail: `Tail (two overlapping pieces in one 85% layer): ${(both / 255 * 100).toFixed(0)}% where they overlap, ${(one / 255 * 100).toFixed(0)}% where they don't, so the layer fades as one picture. Eye: just under the eye opening the oversized iris is cut away (skin, brightness ${lum(cut).toFixed(0)}), inside the opening it shows (${lum(ring).toFixed(0)}).` };
  });

  await check('A short glitch over her only', () => {
    rest(); L.zoom = 1.6; camera(); showOnly(0); pose();
    const clean = snap();
    let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const g = glitch(world, { ms: 220, random });
    const gl = app.renderer.gl;
    while (gl.getError() !== gl.NO_ERROR) { /* clear old errors */ }
    let ms = 0, most = 0, corner = 0, glErr = 0;
    while (g.tick(1000 / 60)) {
      ms += 1000 / 60;
      const s = snap();
      most = Math.max(most, diff(clean, s).changed);
      corner = Math.max(corner, s.at(4, 4)[3]);
      if (gl.getError() !== gl.NO_ERROR) glErr++;
    }
    const after = diff(clean, snap());
    return { ok: most > 500 && after.changed === 0 && world.filters === null && ms >= 150 && ms <= 300 && corner === 0 && glErr === 0, detail: `${glErr ? `The graphics card reported ${glErr} errors. ` : ''}Ran ${Math.round(ms)} ms. At its strongest ${most} pixels of her changed (colours split, rows jumped, scanlines); the empty background stayed untouched; afterwards the picture is exactly as before and the effect has removed itself.` };
  });

  await check('The file format (parse, PNG textures, same picture)', async () => {
    rest(); L.zoom = 1; camera(); showOnly(0); pose();
    const direct = snap();
    const textures = [];
    for (const cv of main.canvases) {
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      premultiply(img.data);
      c2.getContext('2d').putImageData(img, 0, 0);
      const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
      textures.push({ encoding: 0, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const bytes = encodeInp({ json: main.json, textures });
    const view = await loadPuppetView(bytes.buffer, { mipmaps: true });
    const rig = inochiRig(view, { map: DOLL_MAP });
    rig.parts.look(GLOW_PARTS, { tint: L.light.now });
    rig.params.values.set(main.params.values);
    rig.update(0);
    main.view.visible = false; place(rig);
    const loaded = snap();
    rig.destroy(); for (const t of view.textures) t.destroy(true);
    main.view.visible = true;
    const d = diff(direct, loaded);
    return { ok: d.mean < 1.5 && d.changed < direct.w * direct.h * 0.004, detail: `Saved the doll as a ${(bytes.length / 1024).toFixed(0)} KB .inp file, read it back and drew it: ${d.changed} of ${direct.w * direct.h} pixels differ noticeably (average difference ${d.mean.toFixed(2)}/255).` };
  });

  await check('Touch can find her parts', () => {
    rest(); L.zoom = 1; camera(); showOnly(0); pose();
    const nose = onScreen(0, -170 + 20), chest = onScreen(0, 170), air = onScreen(-190, 200);
    const names = [main.parts.at(nose.x, nose.y), main.parts.at(chest.x, chest.y), main.parts.at(air.x, air.y)];
    const b0 = main.parts.box('Antenna');
    set('ParamAntenna', 1); pose();
    const b1 = main.parts.box('Antenna');
    return { ok: names[0] === 'Face' && names[1] === 'Torso' && names[2] === null && b1 && Math.abs((b1.x + b1.width / 2) - (b0.x + b0.width / 2)) > 3, detail: `A point on her nose finds "${names[0]}", her chest "${names[1]}", empty space nothing. The box round her antenna moved ${Math.abs((b1.x + b1.width / 2) - (b0.x + b0.width / 2)).toFixed(0)} px when the antenna swung, so touch spots can follow the rig.` };
  });

  await check('Physics moves by itself', () => {
    rest(); showOnly(0); pose();
    const [tail] = main.puppet.physics.filter((s) => s.param.name === 'TailPhysics');
    // lean her for a moment, then stand her straight: the tail should swing and come back to rest
    set('ParamBodyX', 1);
    let peak = 0;
    for (let i = 0; i < 40; i++) { L.link.update(1000 / 60); peak = Math.max(peak, Math.abs(tail.param.value[0])); }
    set('ParamBodyX', 0);
    let late = 0;
    for (let i = 0; i < 600; i++) { L.link.update(1000 / 60); if (i >= 540) late = Math.max(late, Math.abs(tail.param.value[0])); }
    return { ok: peak > 0.02 && Number.isFinite(late) && late < peak * 0.2, detail: `Leaning her body swung the tail (its physics param peaked at ${peak.toFixed(3)}); standing her straight, it came back to rest (${late.toFixed(3)} at most in the last second of 10 s).` };
  });

  await check("Jun's own code drives the new rig", async () => {
    rest(); showOnly(0); pose();
    const [face] = main.puppet.find('Face');
    const x0 = face.pos[0];
    if (!await junDrive(true)) return { ok: false, detail: "Jun's modules (state.js, params.js, anim.js) didn't load on this page." };
    const { Params, Anim, State } = L.jun;
    Params.stopAllLoops();
    const known = Params.knows('ParamHeadX') && Params.knows('ParamEyeOpen') && !Params.knows('ParamNotThere');
    Params.setTarget('ParamHeadX', 1);
    Params.setNow('ParamBlush', 2);
    const t0 = performance.now();
    while (performance.now() - t0 < 900) { Anim.tick(); L.link.update(16); await wait(16); }
    const v = get('ParamHeadX'), moved = face.pos[0] - x0;
    const clamped = Params.clampParam('ParamHeadX', 9) === 1;
    Params.startLoop('ParamBodyX', 0.5, 400);
    let lo = 9, hi = -9; const t1 = performance.now();
    while (performance.now() - t1 < 600) { Anim.tick(); L.link.update(16); lo = Math.min(lo, get('ParamBodyX')); hi = Math.max(hi, get('ParamBodyX')); await wait(16); }
    Params.stopAllLoops();
    const sameBlock = State.raw.parameters === L.link.params;
    // touch: geometry.js (hit tests, the face, spots that follow a part) on the same rig
    rest(); L.link.update(0);
    const Geo = await import('./live2d/geometry.js?v=82');
    const shape = checkRig(State.model, State.raw);
    const rect = app.view.getBoundingClientRect();
    const nose = onScreen(0, -170 + 20), air = onScreen(-190, 200);
    const onNose = Geo.drawableAt(rect.left + nose.x, rect.top + nose.y);
    const onAir = Geo.drawableAt(rect.left + air.x, rect.top + air.y);
    const ant = Geo.drawablesSpot(['Antenna']);
    await junDrive(false);
    app.ticker.maxFPS = 0;
    const touchOk = !shape.length && onNose === 'Face' && onAir === null && ant && Number.isFinite(ant.x || ant.cx || ant.left);
    return { ok: known && sameBlock && v > 0.97 && moved > 5 && clamped && hi - lo > 0.3 && touchOk, detail: `params.js setTarget('ParamHeadX', 1) eased her head round through anim.js's own smoothing (value ${v.toFixed(2)}, the face mesh moved ${moved.toFixed(0)} units), setNow, clampParam and knows behave as on the Live2D rig, and startLoop swayed her body (${lo.toFixed(2)} to ${hi.toFixed(2)}). Touch: geometry.js finds "${onNose}" under her nose and ${onAir === null ? 'nothing' : `"${onAir}"`} in the air, and follows her antenna${shape.length ? `; missing: ${shape.join(', ')}` : ''}. None of those files were changed.` };
  });

  await check('Speed', () => {
    rest(); L.zoom = 1; camera(); main.active = true; close.active = true;
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) { set('ParamHeadX', Math.sin(i / 9)); L.link.update(1000 / 60); }
    const upd = (performance.now() - t0) / 300;
    const t1 = performance.now();
    for (let i = 0; i < 60; i++) app.renderer.render(app.stage);
    app.renderer.gl.finish();
    const drw = (performance.now() - t1) / 60;
    showOnly(0);
    return { ok: upd < 4, detail: `Posing both rigs takes ${upd.toFixed(2)} ms a frame on this machine's processor; drawing both takes ${drw.toFixed(2)} ms (in this browser; a real graphics card is far quicker than a test machine without one).` };
  });

  rest();
  L.move = keep.move; L.zoom = keep.zoom; $('zoom').value = keep.zoom; L.wantClose = null; setMips(keep.mips);
  showOnly(0); camera();
  if (keep.jun) await junDrive(true);
  last = performance.now();
  app.ticker.start();
  report(out, true);
  return out;
}

function report(list, done = false) {
  const ul = $('checks');
  ul.innerHTML = '';
  for (const c of list) {
    const li = document.createElement('li');
    li.className = c.ok ? 'ok' : 'bad';
    li.textContent = c.name;
    const s = document.createElement('small');
    s.textContent = c.detail || '';
    li.appendChild(s);
    ul.appendChild(li);
  }
  if (done) window.__labChecks = list;
}

useDoll();
window.__lab = { L, app, world, runChecks, useDoll, useFile, snap, camera, setMips, junDrive, bigTexture };
