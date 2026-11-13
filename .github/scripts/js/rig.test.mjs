// the renderer layer (webapp/js/rig/rig.js) and the Inochi2D puppet maths
// (webapp/js/rig/inochi/): file format, params, mesh groups, physics, the
// Cubism-shaped view Jun's code reads, linking two rigs. Uses the code-drawn
// lab doll, so no art is needed. Drawing is tested in the browser
// (rig-lab.html > Run the checks).
//
// run: node --test .github/scripts/js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const F = await import('../../../webapp/js/rig/inochi/inochi-format.js');
const { Puppet } = await import('../../../webapp/js/rig/inochi/inochi-puppet.js');
const { buildTestPuppet } = await import('../../../webapp/js/rig/inochi/inochi-doll.js');
const R = await import('../../../webapp/js/rig/rig.js');

const doll = (closeup = false) => { const p = new Puppet(buildTestPuppet({ closeup }).json); p.update(0); return p; };
const centre = (n) => { let x = 0, y = 0; for (let i = 0; i < n.pos.length; i += 2) { x += n.pos[i]; y += n.pos[i + 1]; } return [x / (n.pos.length / 2), y / (n.pos.length / 2)]; };
const finite = (p) => p.parts.every((n) => n.pos.every(Number.isFinite));

test('file format: a puppet survives encode -> parse', () => {
  const { json } = buildTestPuppet({});
  const bytes = F.encodeInp({ json, textures: [{ encoding: F.TEX_PNG, data: new Uint8Array([1, 2, 3]) }] });
  const back = F.parseInp(bytes.buffer);
  assert.deepEqual(back.json, JSON.parse(JSON.stringify(json)));
  assert.equal(back.textures.length, 1);
  assert.throws(() => F.parseInp(new Uint8Array(16).buffer));
});

test('TGA: run-length, bottom-up rows, as Inochi Creator writes them', () => {
  // 2x2, 32 bit, RLE (type 10), descriptor 8 = bottom row first
  const head = new Uint8Array(18); head[2] = 10; head[12] = 2; head[14] = 2; head[16] = 32; head[17] = 8;
  // bottom row: one run of 2 opaque blue pixels (BGRA). top row: 2 raw pixels, red opaque + green half alpha
  const body = [0x81, 255, 0, 0, 255, 0x01, 0, 0, 255, 255, 0, 255, 0, 128];
  const img = F.decodeTga(new Uint8Array([...head, ...body]));
  assert.equal(img.width, 2); assert.equal(img.height, 2);
  const px = (x, y) => [...img.pixels.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4)];
  assert.deepEqual(px(0, 0), [255, 0, 0, 255]);       // top-left red
  assert.deepEqual(px(1, 1), [0, 0, 255, 255]);       // bottom-right blue
  assert.equal(px(1, 0)[1], 255); assert.equal(px(1, 0)[3], 128);
});

test('params move her, and stay inside their range', () => {
  const p = doll();
  const [face] = p.find('Face');
  const x0 = centre(face)[0];
  p.setParam('ParamHead', 1, 0); p.update(0);
  assert.ok(centre(face)[0] - x0 > 3, 'the head turn moves the face');
  p.setParam('ParamHead', 50, 0); p.update(0);
  const far = centre(face)[0];
  p.setParam('ParamHead', 1, 0); p.update(0);
  assert.ok(Math.abs(far - centre(face)[0]) < 1e-3, 'a value past max acts like max');
  assert.ok(finite(p));
});

test('mesh groups deform the parts inside them', () => {
  const p = doll();
  const group = p.nodes.find((n) => n.type === 'MeshGroup');
  assert.ok(group, 'the doll has a mesh group');
  const inside = p.parts.filter((n) => { for (let k = n.parent; k; k = k.parent) if (k === group) return true; return false; });
  assert.ok(inside.length > 3);
  const before = inside.map((n) => Float32Array.from(n.pos));
  p.setParam('ParamHead', 0.8, 0.6); p.update(0);
  assert.ok(inside.some((n, i) => n.pos.some((v, j) => Math.abs(v - before[i][j]) > 0.5)));
  assert.ok(finite(p));
});

test('physics swings and comes back to rest', () => {
  const p = doll();
  const tail = p.physics.find((s) => s.param.name === 'TailPhysics');
  let peak = 0;
  p.setParam('ParamBodyX', 1);
  for (let i = 0; i < 40; i++) { p.update(1 / 60); peak = Math.max(peak, Math.abs(tail.param.value[0])); }
  p.setParam('ParamBodyX', 0);
  let late = 0;
  for (let i = 0; i < 600; i++) { p.update(1 / 60); if (i >= 540) late = Math.max(late, Math.abs(tail.param.value[0])); }
  assert.ok(peak > 0.02, `swung (${peak})`);
  assert.ok(late < peak * 0.2, `settled (${late})`);
  assert.ok(finite(p));
});

test("the Cubism-shaped view: everything geometry.js and anim.js read", () => {
  const p = doll();
  const box = p.bounds();
  const core = R.inochiCore(p, box);
  core.parameters = R.paramBlock([{ id: 'ParamHeadX', min: -1, max: 1, def: 0 }]);
  const model = { internalModel: { width: box.width, height: box.height, localTransform: { apply() {} } }, update() {}, toModelPosition() {} };
  assert.deepEqual(R.checkRig(model, core), []);
  assert.deepEqual(R.checkRig({}, {}).length > 0, true);
  // y up, like Cubism units: canvas px = (x + OriginX, OriginY - y) lands on the puppet
  const D = core.drawables, i = D.ids.indexOf('Face'), n = D.nodes[i];
  assert.equal(D.vertexPositions[i][1], -n.pos[1]);
  assert.equal(D.vertexPositions[i][0] + core.canvasinfo.CanvasOriginX, n.pos[0] - box.x);
  assert.equal(D.dynamicFlags[i], 1);
  // the front-most drawable has the highest render order
  const front = p.drawList[p.drawList.length - 1];
  if (front.type === 'Part') assert.equal(D.renderOrders[D.nodes.indexOf(front)], Math.max(...D.renderOrders));
  // a group fade reaches the parts inside it
  const g = core.parts.ids.indexOf('Head');
  assert.ok(g >= 0);
  core.parts.opacities[g] = 0.25;
  R.syncCoreIn(core, p); p.update(0); R.syncCoreOut(core, p);
  assert.ok(Math.abs(D.opacities[i] - 0.25) < 1e-6);
  core.parts.opacities[g] = 1;
  R.syncCoreIn(core, p); R.syncCoreOut(core, p);
  assert.equal(D.opacities[i], 1);
});

test("today's Live2D rig: the same param block, nothing copied", () => {
  const core = {
    parameters: { count: 2, ids: ['ParamHeadX', 'ParamEyeOpen'], values: new Float32Array(2), minimumValues: Float32Array.of(-1, -1), maximumValues: Float32Array.of(1, 0), defaultValues: new Float32Array(2) },
    drawables: { ids: ['Face'] },
  };
  let updated = 0;
  const model = { internalModel: { width: 10, height: 20 }, update() { updated++; }, destroy() {} };
  const rig = R.live2dRig(model, core);
  assert.equal(rig.kind, 'live2d');
  assert.equal(rig.params.values, core.parameters.values);
  rig.update(16); assert.equal(updated, 1);
  rig.active = false; rig.update(16); assert.equal(updated, 1);
});

test('two rigs, one set of numbers (main + close-up)', () => {
  // inochiRig needs PIXI for its holder; linkRigs only needs params + update
  const fake = (ids) => ({ params: R.paramBlock(ids.map((id) => ({ id, min: -1, max: 1, def: 0 }))), active: true, got: null, update() { this.got = Array.from(this.params.values); } });
  const main = fake(['ParamHeadX', 'ParamBodyX']), close = fake(['ParamHeadX']);
  const link = R.linkRigs([main, close]);
  link.params.values[link.params.index.get('ParamHeadX')] = 0.5;
  link.params.values[link.params.index.get('ParamBodyX')] = 9;   // clamped per rig
  link.update(16);
  assert.deepEqual(main.got, [0.5, 1]);
  assert.deepEqual(close.got, [0.5]);
  close.active = false; close.got = null; link.update(16);
  assert.equal(close.got, null, 'a faded-out rig is not updated');
});
