// Effects on a whole rig: the crossfade between the main rig and the
// close-up rig, and her short glitch (design sheet §4, §7). Both are PIXI
// filters on the rig's view, so they cost nothing while they're not running.
/* global PIXI */

const smooth = (t) => t * t * (3 - 2 * t);

// Fades between two rigs that sit in the same place; put b above a on the
// stage. Each one is flattened first and faded as a whole picture, otherwise
// her layers would show through each other halfway. The faded-out rig stops
// updating and drawing.
export class Crossfade {
  constructor(a, b, { ms = 300 } = {}) {
    this.rigs = [a, b];
    this.ms = ms;
    this.mix = 0;         // 0 = all a, 1 = all b
    this.goal = 0;
    this.filters = [new PIXI.filters.AlphaFilter(1), new PIXI.filters.AlphaFilter(0)];
    this._apply();
  }

  // which: 0 or 1 (or the rig itself). now = jump, no fade.
  show(which, now = false) {
    this.goal = typeof which === 'number' ? (which ? 1 : 0) : (which === this.rigs[1] ? 1 : 0);
    if (now) this.mix = this.goal;
    // the incoming rig has to be up to date before its first visible frame
    this.rigs[this.goal].active = true;
    this._apply();
  }

  get busy() { return this.mix !== this.goal; }

  tick(ms) {
    if (this.mix === this.goal) return false;
    const step = this.ms > 0 ? ms / this.ms : 1;
    this.mix = this.goal > this.mix ? Math.min(this.goal, this.mix + step) : Math.max(this.goal, this.mix - step);
    this._apply();
    return true;
  }

  _apply() {
    // b sits on top of a. b fades in first while a is still solid underneath,
    // then a fades away. two plain fades at once would let the background
    // show through her halfway.
    const t = this.mix;
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const alpha = [1 - smooth(clamp((t - 0.4) / 0.6)), smooth(clamp(t / 0.6))];
    this.rigs.forEach((rig, i) => {
      const on = alpha[i] > 0 || this.goal === i;
      rig.active = on;
      // no filter at all when a rig is fully there: nothing extra to pay
      this.filters[i].alpha = alpha[i];
      rig.view.filters = on && alpha[i] < 1 ? [this.filters[i]] : null;
    });
  }
}

const GLITCH_FRAG = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
// highp: Pixi's filter vertex shader declares these highp too, and a
// mismatch makes the program fail to link on some drivers
uniform highp vec4 inputSize;
uniform highp vec4 inputClamp;
uniform float uAmount;
uniform float uSeed;
uniform float uSplit;
uniform float uLines;

float rnd(float x) { return fract(sin(x * 12.9898 + uSeed * 78.233) * 43758.5453); }

vec4 at(vec2 uv) { return texture2D(uSampler, clamp(uv, inputClamp.xy, inputClamp.zw)); }

void main() {
  vec2 uv = vTextureCoord;
  float y = uv.y * inputSize.y;
  // a few rows jump sideways
  float band = floor(y / (6.0 + 22.0 * rnd(floor(y / 37.0))));
  float jump = step(0.86, rnd(band)) * (rnd(band + 3.1) - 0.5) * 2.0;
  uv.x += jump * uAmount * 14.0 * inputSize.z;
  // red and blue slide apart
  float d = uSplit * uAmount * inputSize.z;
  vec4 r = at(uv + vec2(d, 0.0)), g = at(uv), b = at(uv - vec2(d, 0.0));
  vec4 c = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a) * 0.85));
  // scanlines and a flicker
  float line = step(0.5, fract(y / 3.0));
  c.rgb *= 1.0 - uLines * uAmount * line;
  c *= 1.0 - 0.12 * uAmount * rnd(floor(uSeed * 7.0));
  gl_FragColor = c;
}`;

export class GlitchFilter extends PIXI.Filter {
  constructor({ split = 6, lines = 0.35 } = {}) {
    super(undefined, GLITCH_FRAG, { uAmount: 0, uSeed: 0, uSplit: split, uLines: lines });
    this.padding = 24;
  }
}

// A short glitch over one display object (her, never the whole screen).
// ms 150-300 is the design sheet's range. Call the returned tick(ms) every
// frame until it says false; the filter takes itself off when it's done.
export function glitch(target, { ms = 220, strength = 1, split = 6, lines = 0.35, random = Math.random } = {}) {
  const filter = new GlitchFilter({ split, lines });
  target.filters = [...(target.filters || []), filter];
  let t = 0, nextSeed = 0;
  const done = () => {
    target.filters = (target.filters || []).filter((f) => f !== filter);
    if (!target.filters.length) target.filters = null;
  };
  const run = {
    filter,
    running: true,
    tick(dt) {
      if (!run.running) return false;
      t += dt;
      if (t >= ms) { run.running = false; done(); return false; }
      // re-roll the pattern every ~45 ms so it stutters instead of sliding
      if (t >= nextSeed) { filter.uniforms.uSeed = random() * 100; nextSeed = t + 35 + random() * 25; }
      const u = t / ms;
      // quick in, uneven middle, quick out
      const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.2);
      filter.uniforms.uAmount = strength * env * (0.65 + 0.35 * random());
      return true;
    },
    stop() { if (run.running) { run.running = false; done(); } },
  };
  run.tick(0);
  return run;
}
