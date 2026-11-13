// The renderer layer. Jun's touch, feelings and desktop code pose her by
// setting numbers ("ParamHeadX = 0.4"); this file is the one place that
// knows what those numbers are plugged into. Today that's the Live2D model,
// next it's an Inochi2D puppet (js/rig/inochi/), and the code above can't
// tell the difference.
//
// A rig, whatever is behind it:
//   kind      'live2d' | 'inochi'
//   view      a PIXI display object to put on a stage. it has update(ms) and
//             internalModel.width/height, which is all camera.js and anim.js
//             ask of the Live2D model today
//   params    { count, ids, values, minimumValues, maximumValues, defaultValues }
//             the same shape as the Cubism core's parameter block, so
//             state.js setRaw({ parameters: rig.params }) just works.
//             write into values, then call update
//   update(ms)  push the values into the rig and move it on by ms
//   parts     what the rig is drawn from: ids, at(x, y), box(ids), look(id, {...})
//   active    false = skip update and drawing (the rig that's faded out)
//   core      (Inochi) the rest of the Cubism-core shape Jun's code reads:
//             drawables (geometry.js hit tests, face anchor, tail spot),
//             parts.opacities (anim.js forcedPartOpacity) and canvasinfo.
//             plugIntoJun hands it to state.js as `raw`.
/* global PIXI */

export function paramBlock(entries) {
  const n = entries.length;
  const block = {
    count: n,
    ids: entries.map((e) => e.id),
    values: new Float32Array(n),
    minimumValues: new Float32Array(n),
    maximumValues: new Float32Array(n),
    defaultValues: new Float32Array(n),
    index: new Map(),
  };
  entries.forEach((e, i) => {
    block.minimumValues[i] = e.min; block.maximumValues[i] = e.max;
    block.defaultValues[i] = e.def; block.values[i] = e.def;
    block.index.set(e.id, i);
  });
  return block;
}

// ---- Inochi2D ----
//
// map: Jun's ids -> the puppet's params, for names that differ or where one
// number of hers drives several of the puppet's.
//   ParamHeadX: 'ParamHead.x'                      a vec2 param, one axis
//   ParamEyeOpen: { range: [-1, 0], def: 0, drives: [
//     { param: 'Eye:: Left:: Blink', out: [1, 0] },      -1 -> 1 (shut), 0 -> 0 (open)
//     { param: 'Eye:: Right:: Blink', out: [1, 0] } ] }
// A puppet param that isn't in the map shows up under its own name
// ("Name" for one number, "Name.x" and "Name.y" for a pair), so a rig built
// with Jun's ids as param names needs no map at all. Params the physics
// drives are left out: nobody should set those by hand.
export function inochiRig(view, { map = {} } = {}) {
  const puppet = view.puppet;
  const entries = [];
  const taken = new Set();
  const target = (spec) => {
    let name = spec.param, axis = spec.axis || 0;
    if (name.endsWith('.x') && !puppet.param(name)) { name = name.slice(0, -2); axis = 0; }
    else if (name.endsWith('.y') && !puppet.param(name)) { name = name.slice(0, -2); axis = 1; }
    const p = puppet.param(name);
    return p ? { p, axis, out: spec.out || null } : null;
  };
  for (const [id, raw] of Object.entries(map)) {
    const spec = typeof raw === 'string' ? { drives: [{ param: raw }] } : raw;
    const drives = (spec.drives || [{ param: spec.param, axis: spec.axis, out: spec.out }]).map(target).filter(Boolean);
    if (!drives.length) continue;
    const first = drives[0];
    const range = spec.range || [first.p.min[first.axis], first.p.max[first.axis]];
    const def = spec.def !== undefined ? spec.def : (spec.range ? range[0] : first.p.def[first.axis]);
    for (const d of drives) { taken.add(`${d.p.name}/${d.axis}`); if (!d.out && spec.range) d.out = [d.p.min[d.axis], d.p.max[d.axis]]; }
    entries.push({ id, min: Math.min(range[0], range[1]), max: Math.max(range[0], range[1]), def, range, drives });
  }
  for (const p of puppet.params) {
    if (p.driven) continue;
    for (let axis = 0; axis < (p.isVec2 ? 2 : 1); axis++) {
      if (taken.has(`${p.name}/${axis}`)) continue;
      const id = p.isVec2 ? `${p.name}.${axis ? 'y' : 'x'}` : p.name;
      entries.push({ id, min: p.min[axis], max: p.max[axis], def: p.def[axis], range: null, drives: [{ p, axis, out: null }] });
    }
  }
  const params = paramBlock(entries);

  // the puppet's own middle is 0,0. Live2D models (and camera.js) put 0,0 at
  // the top left, so sit the puppet in a holder that does the same.
  const box = puppet.bounds();
  const holder = new PIXI.Container();
  view.position.set(-box.x, -box.y);
  holder.addChild(view);
  holder.internalModel = { width: box.width, height: box.height, localTransform: new PIXI.Matrix() };
  // like Live2DModel.toModelPosition: stage px -> model canvas px
  holder.toModelPosition = (point, out = new PIXI.Point()) => holder.worldTransform.applyInverse(point, out);
  const core = inochiCore(puppet, box);
  core.parameters = params;

  const rig = {
    kind: 'inochi', view: holder, puppetView: view, puppet, params, core,
    width: box.width, height: box.height,
    get active() { return view.active; },
    set active(on) { view.active = !!on; holder.renderable = !!on; },
    update(ms = 0) {
      if (!view.active) return;
      const v = params.values;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        for (const d of e.drives) {
          let x = v[i];
          if (d.out) {
            const span = e.range[1] - e.range[0];
            x = d.out[0] + (span ? (x - e.range[0]) / span : 0) * (d.out[1] - d.out[0]);
          }
          d.p.value[d.axis] = x;
        }
      }
      syncCoreIn(core, puppet);
      view.update(ms);
      syncCoreOut(core, puppet);
    },
    parts: {
      get ids() { return puppet.parts.map((n) => n.name); },
      // the front-most part under a point given in stage coordinates
      at(x, y, only) { const n = view.partAtGlobal(x, y, only); return n ? n.name : null; },
      // box round the named parts, in stage coordinates (for touch spots that follow the rig)
      box(match) {
        const b = puppet.boundsOf(puppet.find(match));
        if (!b) return null;
        const a = view.worldTransform.apply({ x: b.x, y: b.y }), c = view.worldTransform.apply({ x: b.x + b.width, y: b.y + b.height });
        return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) };
      },
      // recolour, fade, hide or re-skin parts: look('Seam', { tint: [1, .2, .5], opacity: .8, visible: true, texture })
      look(match, { tint, screen, opacity, visible, texture } = {}) {
        const hit = puppet.find(match);
        for (const n of hit) {
          if (tint !== undefined) n.user.tint = tint;
          if (screen !== undefined) n.user.screen = screen;
          if (opacity !== undefined) n.user.opacity = opacity;
          if (visible !== undefined) n.user.visible = visible;
          if (texture !== undefined) n.user.texture = texture;
        }
        return hit.length;
      },
    },
    destroy() { holder.destroy({ children: true }); },
  };
  holder.update = (ms) => rig.update(ms);
  return rig;
}

// ---- the Cubism-core shape for an Inochi puppet (no PIXI: node tests use it) ----
// Model units like Live2D's: 1 unit = 1 puppet px, y up, so
// canvas px = x + CanvasOriginX, CanvasOriginY - y (geometry.js's maths).
// parts = the puppet's groups (composites and nodes with children), so a
// fade on raw.parts.opacities fades everything inside.
export function inochiCore(puppet, box = puppet.bounds()) {
  const parts = puppet.parts;
  const groups = puppet.nodes.filter((n) => n.parent && (n.type === 'Composite' || (n.type === 'Node' && n.children.length)));
  const seen = new Map();
  const uniq = (name) => { const k = (seen.get(name) || 0) + 1; seen.set(name, k); return k > 1 ? `${name}#${k}` : name; };
  const core = {
    parts: { count: groups.length, ids: groups.map((n) => uniq(n.name)), opacities: new Float32Array(groups.length).fill(1), nodes: groups },
    drawables: {
      count: parts.length,
      ids: (seen.clear(), parts.map((n) => uniq(n.name))),
      nodes: parts,
      vertexPositions: parts.map((n) => new Float32Array(n.pos.length)),
      vertexUvs: parts.map((n) => Float32Array.from(n.mesh.uvs)),
      indices: parts.map((n) => Uint16Array.from(n.mesh.indices)),
      opacities: new Float32Array(parts.length),
      dynamicFlags: new Uint8Array(parts.length),
      renderOrders: new Int32Array(parts.length),
      textureIndices: Int32Array.from(parts.map((n) => n.texture)),
    },
    canvasinfo: { CanvasWidth: box.width, CanvasHeight: box.height, CanvasOriginX: -box.x, CanvasOriginY: -box.y, PixelsPerUnit: 1 },
  };
  syncCoreOut(core, puppet);
  return core;
}

// raw.parts.opacities -> the parts inside each group
export function syncCoreIn(core, puppet) {
  const P = core.parts;
  for (const n of puppet.parts) n.groupOpacity = 1;
  for (let i = 0; i < P.count; i++) {
    const op = P.opacities[i];
    if (op === 1) continue;
    const stack = [P.nodes[i]];
    while (stack.length) { const n = stack.pop(); if (n.type === 'Part') n.groupOpacity *= op; stack.push(...n.children); }
  }
}

// the puppet's pose -> raw.drawables
export function syncCoreOut(core, puppet) {
  const D = core.drawables;
  const order = new Map();
  let k = 0;
  const walk = (list) => { for (const n of list) { order.set(n, k++); if (n.sub) walk(n.subList || n.sub); } };
  walk(puppet.drawList || []);
  for (let i = 0; i < D.count; i++) {
    const n = D.nodes[i], src = n.pos, out = D.vertexPositions[i];
    for (let j = 0; j < src.length; j += 2) { out[j] = src[j]; out[j + 1] = -src[j + 1]; }
    const on = puppet.constructor.alive(n), op = on ? puppet.constructor.opacityOf(n) : 0;
    D.opacities[i] = op;
    D.dynamicFlags[i] = on && op > 0 ? 1 : 0;
    let m = n; while (m && !order.has(m)) m = m.parent;
    D.renderOrders[i] = m ? order.get(m) : -1;
  }
}

// does a model + raw pair have everything Jun's code reads? -> problems ([] = ok)
export function checkRig(model, raw) {
  const bad = [];
  const need = (ok, what) => { if (!ok) bad.push(what); };
  const im = model && model.internalModel;
  need(im && im.width > 0 && im.height > 0, 'model.internalModel.width/height');
  need(im && im.localTransform && typeof im.localTransform.apply === 'function', 'model.internalModel.localTransform');
  need(model && typeof model.update === 'function', 'model.update(ms)');
  need(model && typeof model.toModelPosition === 'function', 'model.toModelPosition');
  const P = raw && raw.parameters;
  need(P && P.ids.length === P.count && P.values.length === P.count && P.minimumValues.length === P.count
    && P.maximumValues.length === P.count && P.defaultValues.length === P.count, 'raw.parameters');
  const D = raw && raw.drawables;
  need(D && D.ids.length === D.count, 'raw.drawables.ids');
  for (const key of ['vertexPositions', 'vertexUvs', 'indices', 'opacities', 'dynamicFlags', 'renderOrders']) {
    need(D && D[key] && D[key].length === D.count, `raw.drawables.${key}`);
  }
  need(raw && raw.parts && raw.parts.ids.length === raw.parts.count && raw.parts.opacities.length === raw.parts.count, 'raw.parts');
  const C = raw && raw.canvasinfo;
  need(C && ['CanvasWidth', 'CanvasHeight', 'CanvasOriginX', 'CanvasOriginY', 'PixelsPerUnit'].every((key) => Number.isFinite(C[key])), 'raw.canvasinfo');
  return bad;
}

// ---- Live2D (today's rig) ----
// model: the pixi-live2d-display model. core: its Cubism core model (what
// live2d.js calls "raw"). Nothing is copied: params IS the core's own block,
// so everything that writes raw.parameters.values today keeps working.
export function live2dRig(model, core) {
  const P = core.parameters;
  const params = {
    count: P.count, ids: Array.from(P.ids), values: P.values,
    minimumValues: P.minimumValues, maximumValues: P.maximumValues, defaultValues: P.defaultValues,
    index: new Map(Array.from(P.ids, (id, i) => [id, i])),
  };
  let active = true;
  return {
    kind: 'live2d', view: model, core, params,
    width: model.internalModel.width, height: model.internalModel.height,
    get active() { return active; },
    set active(on) { active = !!on; model.renderable = active; },
    update(ms = 0) { if (active) model.update(ms); },
    parts: {
      get ids() { return Array.from(core.drawables.ids); },
      at() { return null; },      // geometry.js does this for Live2D today
      box() { return null; },
      look() { return 0; },       // textures.js / renderer.js do this for Live2D today
    },
    destroy() { model.destroy(); },
  };
}

// ---- several rigs, one set of numbers ----
// The main rig and the close-up rig share param names; this hands the same
// values to whichever of them is on. Ids one rig lacks are simply skipped
// for that rig.
export function linkRigs(rigs) {
  const seen = new Map();
  for (const r of rigs) {
    r.params.ids.forEach((id, i) => {
      if (!seen.has(id)) seen.set(id, { id, min: r.params.minimumValues[i], max: r.params.maximumValues[i], def: r.params.defaultValues[i] });
    });
  }
  const params = paramBlock([...seen.values()]);
  const wires = rigs.map((r) => r.params.ids.map((id) => params.index.get(id)));
  return {
    kind: 'linked', rigs, params,
    update(ms = 0) {
      rigs.forEach((r, k) => {
        if (!r.active) return;
        const from = wires[k], to = r.params.values, lo = r.params.minimumValues, hi = r.params.maximumValues;
        for (let i = 0; i < from.length; i++) { const v = params.values[from[i]]; to[i] = v < lo[i] ? lo[i] : v > hi[i] ? hi[i] : v; }
        r.update(ms);
      });
    },
  };
}

// ---- plug a rig into Jun's existing code ----
// state: the js/live2d/state.js module. After this, params.js (setTarget,
// startLoop...) and anim.js (tick: smoothing, idles, blinks, tail) drive the
// rig exactly as they drive the Live2D model today. Call rig.update(ms)
// (or let renderIfDirty call view.update) after tick.
export function plugIntoJun(rig, state) {
  const index = new Map(), min = new Map(), max = new Map(), def = new Map();
  rig.params.ids.forEach((id, i) => {
    index.set(id, i);
    min.set(id, rig.params.minimumValues[i]); max.set(id, rig.params.maximumValues[i]); def.set(id, rig.params.defaultValues[i]);
  });
  state.setModel(rig.view);
  state.setRaw(rig.core ? { ...rig.core, parameters: rig.params } : { parameters: rig.params });
  if (state.S) state.S.drawableIndexById = null;   // geometry.js caches drawable ids per rig
  state.setParamRanges(index, min, max, def);
  state.targetParams.clear(); state.velocities.clear(); state.holds.clear(); state.loops.clear();
  state.pendingSequences.length = 0;
  state.currentValues.clear();
  rig.params.ids.forEach((id, i) => state.currentValues.set(id, rig.params.defaultValues[i]));
  state.markDirty();
  return rig;
}
