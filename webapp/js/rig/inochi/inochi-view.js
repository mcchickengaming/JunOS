// Draws an Inochi2D puppet (inochi-puppet.js) with the PixiJS that Jun already
// ships (v6). One display object per puppet: add it to a stage, call
// update(ms) every frame. Filters, alpha, scale and position work on it like
// on any other PIXI object, and several puppets can be on screen at once.
//
// The blend modes, the mask rules and the part shader follow the Inochi2D
// reference renderer (BSD 2-Clause, see NOTICE).
/* global PIXI */

import { TEX_PNG, TEX_TGA, decodeTga, looksPremultiplied, parseInp, premultiply } from './inochi-format.js?v=1';
import { Puppet } from './inochi-puppet.js?v=1';

const VERT = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
varying vec2 vUv;
void main() {
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aTextureCoord;
}`;

// Meshes often reach a little past their texture (55 of 76 parts on the
// example puppets). Desktop Inochi2D shows transparent there; WebGL has no
// transparent border, so CLAMP would smear the edge pixels out as streaks.
// Outside 0..1 counts as empty (a hard cut: the art is transparent at its
// own edges, so nothing visible is cut).
const OUTSIDE = `
float inside(vec2 uv) {
  vec2 a = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return a.x * a.y;
}`;

// colours are premultiplied from the texture on
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uSampler;
uniform float uOpacity;
uniform vec3 uTint;
uniform vec3 uScreen;
${OUTSIDE}
void main() {
  vec4 c = texture2D(uSampler, vUv) * inside(vUv);
  vec3 lit = vec3(1.0) - ((vec3(1.0) - c.rgb) * (vec3(1.0) - (uScreen * c.a)));
  gl_FragColor = vec4(lit, c.a) * vec4(uTint, 1.0) * uOpacity;
}`;

const FRAG_MASK = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uSampler;
uniform float uThreshold;
${OUTSIDE}
void main() {
  if (texture2D(uSampler, vUv).a * inside(vUv) <= uThreshold) discard;
  gl_FragColor = vec4(1.0);
}`;

// our own blend mode numbers, well clear of PIXI's
const BLEND_BASE = 60;
const BLEND_IDS = { Normal: 0, Multiply: 1, ColorDodge: 2, LinearDodge: 3, Screen: 4, ClipToLower: 5, SliceFromLower: 6 };

function installBlendModes(renderer) {
  const modes = renderer.state.blendModes;
  if (modes[BLEND_BASE]) return;
  const gl = renderer.gl;
  modes[BLEND_BASE + 0] = [gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
  modes[BLEND_BASE + 1] = [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA];
  modes[BLEND_BASE + 2] = [gl.DST_COLOR, gl.ONE];
  modes[BLEND_BASE + 3] = [gl.ONE, gl.ONE];
  modes[BLEND_BASE + 4] = [gl.ONE, gl.ONE_MINUS_SRC_COLOR];
  modes[BLEND_BASE + 5] = [gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA];
  modes[BLEND_BASE + 6] = [gl.ONE_MINUS_DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.FUNC_SUBTRACT, gl.FUNC_SUBTRACT];
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Turn a parsed file's textures into PIXI textures.
// mipmaps: smooth when she's drawn small (the main rig on the desktop).
export async function loadTextures(file, { mipmaps = true, anisotropy = 4 } = {}) {
  const out = [];
  for (const t of file.textures) {
    const opts = {
      mipmap: mipmaps ? PIXI.MIPMAP_MODES.ON : PIXI.MIPMAP_MODES.OFF,
      scaleMode: PIXI.SCALE_MODES.LINEAR, wrapMode: PIXI.WRAP_MODES.CLAMP, anisotropicLevel: mipmaps ? anisotropy : 0,
    };
    let base;
    if (t.encoding === TEX_TGA) {
      const img = decodeTga(t.data);
      if (!looksPremultiplied(img.pixels)) premultiply(img.pixels);
      base = PIXI.BaseTexture.fromBuffer(img.pixels, img.width, img.height, { ...opts, alphaMode: PIXI.ALPHA_MODES.PMA });
    } else if (t.encoding === TEX_PNG) {
      // keep the file's own colours: no colour management, no second premultiply
      const bmp = await createImageBitmap(new Blob([t.data], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      base = new PIXI.BaseTexture(bmp, { ...opts, alphaMode: PIXI.ALPHA_MODES.PMA });
    } else {
      throw new Error('This puppet uses BC7 textures. Export it from Inochi Creator with PNG or TGA textures.');
    }
    out.push(new PIXI.Texture(base));
  }
  return out;
}

// One call from bytes to something you can put on a stage.
export async function loadPuppetView(buffer, options = {}) {
  const file = parseInp(buffer);
  const textures = await loadTextures(file, options);
  return new InochiView(new Puppet(file.json), textures, options);
}

export class InochiView extends PIXI.Container {
  // puppet: a Puppet. textures: PIXI.Texture per texture slot of the file.
  constructor(puppet, textures, { straightAlpha = false } = {}) {
    super();
    this.puppet = puppet;
    this.textures = textures;
    this.active = true;           // false = don't update, don't draw (the rig that's faded out)
    this._drawn = -1;
    this._geo = new Map();
    this._rts = [];
    this._shader = PIXI.Shader.from(VERT, FRAG, { uSampler: PIXI.Texture.EMPTY, uOpacity: 1, uTint: new Float32Array([1, 1, 1]), uScreen: new Float32Array([0, 0, 0]), translationMatrix: new Float32Array(9) });
    this._maskShader = PIXI.Shader.from(VERT, FRAG_MASK, { uSampler: PIXI.Texture.EMPTY, uThreshold: 0.5, translationMatrix: new Float32Array(9) });
    this._states = {};
    this._quad = new PIXI.Geometry()
      .addAttribute('aVertexPosition', new PIXI.Buffer(new Float32Array(8), false), 2)
      .addAttribute('aTextureCoord', new PIXI.Buffer(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), true), 2)
      .addIndex(new PIXI.Buffer(new Uint16Array([0, 1, 2, 0, 2, 3]), true, true));
    for (const n of puppet.parts) {
      const pos = new PIXI.Buffer(n.pos, false);
      const g = new PIXI.Geometry()
        .addAttribute('aVertexPosition', pos, 2)
        .addAttribute('aTextureCoord', new PIXI.Buffer(n.mesh.uvs, true), 2)
        .addIndex(new PIXI.Buffer(n.mesh.indices, true, true));
      this._geo.set(n, { g, pos });
    }
    this._straight = straightAlpha;
  }

  get puppetWidth() { return this.puppet.bounds().width; }
  get puppetHeight() { return this.puppet.bounds().height; }

  // advance the puppet. ms since the last call.
  update(ms = 0) {
    if (!this.active) return;
    this.puppet.update(Math.max(0, ms) / 1000);
  }

  // front-most part under a point given in the stage's coordinates
  partAtGlobal(x, y, only) {
    const p = this.worldTransform.applyInverse({ x, y });
    return this.puppet.partAt(p.x, p.y, only);
  }

  _calculateBounds() {
    const b = this.puppet.bounds();
    if (b.width > 0 && b.height > 0) this._bounds.addFrame(this.transform, b.x, b.y, b.x + b.width, b.y + b.height);
  }

  _state(blend) {
    let s = this._states[blend];
    if (!s) {
      s = this._states[blend] = new PIXI.State();
      s.blend = true; s.depthTest = false; s.culling = false;
      s.blendMode = BLEND_BASE + (BLEND_IDS[blend] || 0);
    }
    return s;
  }

  _textureOf(n) {
    return n.user.texture || this.textures[n.texture] || PIXI.Texture.EMPTY;
  }

  _drawMesh(renderer, n, shader) {
    const geo = this._geo.get(n);
    if (!geo) return;
    if (geo.frame !== this.puppet.frame) { geo.frame = this.puppet.frame; geo.pos.update(); }
    shader.uniforms.uSampler = this._textureOf(n);
    renderer.shader.bind(shader);
    renderer.geometry.bind(geo.g, shader);
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES, n.mesh.indices.length, 0);
  }

  // the shapes of a mask source, into the stencil only
  _drawAsMask(renderer, n, threshold) {
    if (!n || !Puppet.alive(n)) return;
    if (n.sub) { for (const c of (n.subList || n.sub)) this._drawAsMask(renderer, c, threshold); return; }
    if (n.type !== 'Part') return;
    this._maskShader.uniforms.uThreshold = threshold;
    renderer.state.set(this._state('Normal'));
    this._drawMesh(renderer, n, this._maskShader);
  }

  _beginMasks(renderer, n) {
    const gl = renderer.gl;
    renderer.framebuffer.forceStencil();
    const anyMask = n.masks.some((m) => !m.dodge);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    // with a real mask: start hidden and reveal. with only "dodge" masks: start shown and cut holes.
    gl.clearStencil(anyMask ? 0 : 1);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    const threshold = Math.max(0, Math.min(1, n.maskThreshold + n.oThreshold));
    for (const m of n.masks) {
      gl.stencilFunc(gl.ALWAYS, m.dodge ? 0 : 1, 0xff);
      this._drawAsMask(renderer, this.puppet.byUuid.get(m.source), threshold);
    }
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilMask(0x00);
    gl.colorMask(true, true, true, true);
  }

  _endMasks(renderer) {
    const gl = renderer.gl;
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.disable(gl.STENCIL_TEST);
  }

  _setLook(shader, n, alpha) {
    const u = shader.uniforms, t = n.user.tint, s = n.user.screen;
    u.uOpacity = Puppet.opacityOf(n) * alpha;
    u.uTint[0] = n.tint[0] * n.oTint[0] * (t ? t[0] : 1);
    u.uTint[1] = n.tint[1] * n.oTint[1] * (t ? t[1] : 1);
    u.uTint[2] = n.tint[2] * n.oTint[2] * (t ? t[2] : 1);
    u.uScreen[0] = Math.min(1, n.screen[0] + n.oScreen[0] + (s ? s[0] : 0));
    u.uScreen[1] = Math.min(1, n.screen[1] + n.oScreen[1] + (s ? s[1] : 0));
    u.uScreen[2] = Math.min(1, n.screen[2] + n.oScreen[2] + (s ? s[2] : 0));
  }

  _drawNode(renderer, n, alpha, depth) {
    if (!Puppet.alive(n)) return;
    const opacity = Puppet.opacityOf(n);
    if (opacity <= 0) return;
    const masked = n.masks.length > 0;
    if (n.sub) {
      if (!n.sub.length) return;
      this._drawComposite(renderer, n, alpha, depth, masked);
      return;
    }
    if (masked) this._beginMasks(renderer, n);
    this._setLook(this._shader, n, alpha);
    renderer.state.set(this._state(n.blend));
    this._drawMesh(renderer, n, this._shader);
    if (masked) this._endMasks(renderer);
  }

  // a composite draws its parts into a layer of their own, then puts the
  // layer down as one picture (one opacity, one tint, one blend mode)
  _drawComposite(renderer, n, alpha, depth, masked) {
    const rts = renderer.renderTexture;
    const prev = rts.current;
    const src = rts.sourceFrame.clone(), dst = rts.destinationFrame.clone();
    const res = prev ? prev.baseTexture.resolution : renderer.resolution;
    const w = Math.max(1, Math.ceil(src.width)), h = Math.max(1, Math.ceil(src.height));
    let rt = this._rts[depth];
    if (!rt || rt.width !== w || rt.height !== h || rt.baseTexture.resolution !== res) {
      if (rt) rt.destroy(true);
      rt = this._rts[depth] = PIXI.RenderTexture.create({ width: w, height: h, resolution: res });
    }
    rts.bind(rt, src);
    rts.clear([0, 0, 0, 0]);
    for (const c of (n.subList || n.sub)) this._drawNode(renderer, c, 1, depth + 1);
    rts.bind(prev, src, dst);

    if (masked) this._beginMasks(renderer, n);
    const q = this._quad.getBuffer('aVertexPosition');
    q.data[0] = src.x; q.data[1] = src.y; q.data[2] = src.x + w; q.data[3] = src.y;
    q.data[4] = src.x + w; q.data[5] = src.y + h; q.data[6] = src.x; q.data[7] = src.y + h;
    q.update();
    const shader = this._shader;
    this._setLook(shader, n, alpha);
    shader.uniforms.uSampler = rt;
    const keep = shader.uniforms.translationMatrix;
    shader.uniforms.translationMatrix = IDENTITY;
    renderer.state.set(this._state(n.blend));
    renderer.shader.bind(shader);
    renderer.geometry.bind(this._quad, shader);
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES, 6, 0);
    shader.uniforms.translationMatrix = keep;
    if (masked) this._endMasks(renderer);
  }

  _render(renderer) {
    if (!this.active) return;
    renderer.batch.flush();
    installBlendModes(renderer);
    const m = this.worldTransform.toArray(true);
    this._shader.uniforms.translationMatrix.set(m);
    this._maskShader.uniforms.translationMatrix.set(m);
    for (const n of this.puppet.drawList) this._drawNode(renderer, n, this.worldAlpha, 0);
    // hand PIXI back a state it knows
    renderer.state.set(PIXI.State.for2d());
  }

  destroy(options) {
    for (const { g } of this._geo.values()) g.destroy();
    this._geo.clear();
    this._quad.destroy();
    for (const rt of this._rts) if (rt) rt.destroy(true);
    this._rts.length = 0;
    super.destroy(options);
  }
}
