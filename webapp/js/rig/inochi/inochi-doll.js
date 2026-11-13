// A stand-in puppet made in code: a plain doll, drawn with the canvas, built
// as real Inochi2D data. It's here so the renderer can be tried and tested
// without any art in git, and it uses the pieces Jun's real rig will need:
// a mesh group that turns the head, masks (eyes), a composite (tail), glow
// parts that add light (iris ring, cheek seam), physics (bangs, antenna,
// tail) and params named with Jun's own ids.
//
// buildTestPuppet({ closeup }) gives the data ({ json, atlas }); it needs no
// DOM. paintAtlas(atlas) draws the textures (browser only).
// closeup: just the head, at a much higher resolution, with the same param
// names: the "second rig" of the design sheet's high-res face plan.

const SKIN = '#f1d9c9', SKIN_SHADE = '#c9a4b4', INK = '#2a1838';

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// every painter draws in the part's own units: 0..w across, 0..h down
const PAINT = {
  torso(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#efe6da'); g.addColorStop(1, '#d9cbc4');
    c.fillStyle = g; rr(c, 6, 4, w - 12, h - 8, 46); c.fill();
    c.strokeStyle = '#4b2f6b'; c.lineWidth = 5; rr(c, 6, 4, w - 12, h - 8, 46); c.stroke();
    c.strokeStyle = 'rgba(75,47,107,.5)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w / 2, 20); c.lineTo(w / 2, h - 30); c.stroke();
  },
  legs(c, w, h) {
    c.fillStyle = '#3a2556';
    rr(c, 8, 0, w / 2 - 14, h - 6, 30); c.fill(); rr(c, w / 2 + 6, 0, w / 2 - 14, h - 6, 30); c.fill();
    c.fillStyle = '#b83a66'; c.fillRect(10, 14, w / 2 - 18, 5); c.fillRect(w / 2 + 8, 14, w / 2 - 18, 5);
  },
  arm(c, w, h) {
    c.fillStyle = '#efe6da'; rr(c, 6, 0, w - 12, h * 0.72, 24); c.fill();
    c.strokeStyle = '#4b2f6b'; c.lineWidth = 4; rr(c, 6, 0, w - 12, h * 0.72, 24); c.stroke();
    c.fillStyle = SKIN; rr(c, 14, h * 0.68, w - 28, h * 0.3, 16); c.fill();
  },
  tail(c, w, h) {
    c.strokeStyle = '#3a2556'; c.lineWidth = w * 0.42; c.lineCap = 'round';
    c.beginPath(); c.moveTo(w / 2, w * 0.25); c.lineTo(w / 2, h - w * 0.5); c.stroke();
  },
  tailTip(c, w, h) {
    c.fillStyle = '#7a2244'; c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.42, h * 0.46, 0, 0, 7); c.fill();
  },
  hairBack(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b1a4d'); g.addColorStop(0.6, '#3d1d4f'); g.addColorStop(1, '#6d1f3d');
    c.fillStyle = g; rr(c, 10, 6, w - 20, h - 12, 150); c.fill();
    c.clip();
    // strand lines: fine detail that shimmers when she's small unless the texture has mipmaps
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1.2;
    for (let x = 22; x < w - 20; x += 5) { c.beginPath(); c.moveTo(x, 70 + 30 * Math.sin(x)); c.lineTo(x + 6 * Math.sin(x * 0.3), h - 30); c.stroke(); }
  },
  ear(c, w, h) {
    c.fillStyle = '#2b1a4d'; c.beginPath(); c.moveTo(w / 2, 2); c.quadraticCurveTo(w - 4, h * 0.5, w * 0.82, h - 4); c.lineTo(w * 0.18, h - 4); c.quadraticCurveTo(4, h * 0.5, w / 2, 2); c.fill();
    c.fillStyle = '#f0e2d2'; c.beginPath(); c.moveTo(w / 2, h * 0.22); c.quadraticCurveTo(w * 0.74, h * 0.6, w * 0.66, h - 8); c.lineTo(w * 0.34, h - 8); c.quadraticCurveTo(w * 0.26, h * 0.6, w / 2, h * 0.22); c.fill();
  },
  face(c, w, h) {
    c.fillStyle = SKIN; c.beginPath();
    c.moveTo(w * 0.06, h * 0.3); c.quadraticCurveTo(w * 0.04, 4, w / 2, 4); c.quadraticCurveTo(w * 0.96, 4, w * 0.94, h * 0.3);
    c.quadraticCurveTo(w * 0.93, h * 0.72, w / 2, h - 4); c.quadraticCurveTo(w * 0.07, h * 0.72, w * 0.06, h * 0.3); c.fill();
    c.save(); c.clip();
    c.fillStyle = SKIN_SHADE; c.globalAlpha = 0.35; c.fillRect(0, h * 0.84, w, h);
    // hatching in the shadow under the jaw
    c.globalAlpha = 0.5; c.strokeStyle = INK; c.lineWidth = 0.8;
    for (let x = -h; x < w; x += 4) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h * 0.14, h * 0.86); c.stroke(); }
    c.restore();
    c.strokeStyle = 'rgba(42,24,56,.55)'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(w * 0.5, h * 0.56); c.lineTo(w * 0.48, h * 0.62); c.stroke();
  },
  blush(c, w, h) {
    for (const cx of [w * 0.2, w * 0.8]) {
      const g = c.createRadialGradient(cx, h / 2, 2, cx, h / 2, h * 0.55); g.addColorStop(0, 'rgba(232,96,128,.75)'); g.addColorStop(1, 'rgba(232,96,128,0)');
      c.fillStyle = g; c.fillRect(cx - h * 0.6, 0, h * 1.2, h);
    }
  },
  // painted white on purpose: the code tints it with her light colour
  seam(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 4, w, h - 8);
  },
  eyeWhite(c, w, h) {
    c.fillStyle = '#f4f0f8'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, 7); c.fill();
    const g = c.createLinearGradient(0, 0, 0, h * 0.5); g.addColorStop(0, 'rgba(60,40,90,.45)'); g.addColorStop(1, 'rgba(60,40,90,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, 7); c.fill();
  },
  iris(c, w, h) {
    const r = w / 2 - 2;
    c.fillStyle = '#2d2240'; c.beginPath(); c.arc(w / 2, h / 2, r, 0, 7); c.fill();
    c.fillStyle = '#c7c0b4'; c.beginPath(); c.arc(w / 2, h / 2, r * 0.84, 0, 7); c.fill();
    c.fillStyle = '#f3f0ea'; c.beginPath(); c.arc(w / 2, h / 2, r * 0.5, 0, 7); c.fill();
    c.fillStyle = '#17101f'; c.beginPath(); c.arc(w / 2, h / 2, r * 0.3, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w * 0.36, h * 0.34, r * 0.17, 0, 7); c.fill();
  },
  ring(c, w, h) {
    c.strokeStyle = '#fff'; c.lineWidth = w * 0.09; c.beginPath(); c.arc(w / 2, h / 2, w * 0.36, 0, 7); c.stroke();
    // six shutter notches, so you can see it turn
    c.globalCompositeOperation = 'destination-out'; c.lineWidth = w * 0.05;
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * w * 0.28, h / 2 + Math.sin(a) * w * 0.28); c.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * w * 0.46); c.stroke(); }
  },
  lid(c, w, h) {
    c.fillStyle = SKIN; rr(c, 0, 0, w, h - 4, 18); c.fill();
    c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(4, h - 6); c.quadraticCurveTo(w / 2, h + 2, w - 4, h - 6); c.stroke();
    c.lineWidth = 2.5; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(w - 6 - k * 7, h - 6); c.lineTo(w + 2 - k * 5, h - 16 + k * 2); c.stroke(); }
  },
  mouth(c, w, h) {
    c.fillStyle = '#7a2244'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, 7); c.fill();
    c.fillStyle = '#e88aa0'; c.beginPath(); c.ellipse(w / 2, h * 0.72, w * 0.26, h * 0.2, 0, 0, 7); c.fill();
  },
  bangs(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b1a4d'); g.addColorStop(1, '#4a1c4c');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.7);
    const n = 9;
    for (let k = n; k >= 0; k--) { const x = (k / n) * w; c.lineTo(x + w / n / 2, h * (0.55 + 0.4 * ((k * 7) % 3) / 2)); c.lineTo(x, h * 0.5); }
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.18, h * 0.22); c.quadraticCurveTo(w * 0.5, h * 0.08, w * 0.82, h * 0.22); c.stroke();
  },
  antenna(c, w, h) {
    c.strokeStyle = '#f6f2fa'; c.lineWidth = w * 0.3; c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2, h - 4); c.quadraticCurveTo(w * 0.9, h * 0.45, w * 0.4, 6); c.stroke();
  },
};

let nextId = 1000;

// a flat sheet of points over a box, origin at (ox, oy) inside it
function grid(w, h, nx, ny, ox, oy) {
  const verts = [], cells = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { verts.push((i / nx) * w - ox, (j / ny) * h - oy); cells.push(i / nx, j / ny); }
  const indices = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  return { verts, cells, indices };
}

function node(type, name, at, extra = {}) {
  return {
    uuid: nextId++, name, type, enabled: true, zsort: extra.z || 0, lockToRoot: false,
    transform: { trans: [at[0], at[1], 0], rot: [0, 0, 0], scale: [1, 1] },
    children: [], ...extra.more,
  };
}

export function buildTestPuppet({ closeup = false, density = closeup ? 6 : 1.5, page = closeup ? 4096 : 2048, pad = 8 } = {}) {
  nextId = closeup ? 5000 : 1000;
  const items = [];   // what gets painted where
  const params = [];

  // a textured part. w,h in puppet units; at = where its origin sits in the parent;
  // pivot = where the origin is inside the picture (0..1), default the middle
  const part = (name, paint, w, h, at, o = {}) => {
    const pivot = o.pivot || [0.5, 0.5];
    const g = grid(w, h, o.nx || 1, o.ny || 1, w * pivot[0], h * pivot[1]);
    const n = node('Part', name, at, { z: o.z });
    Object.assign(n, {
      mesh: { verts: g.verts, uvs: [], indices: g.indices, origin: [0, 0] }, textures: [0],
      blend_mode: o.blend || 'Normal', tint: [1, 1, 1], screenTint: [0, 0, 0], opacity: o.opacity === undefined ? 1 : o.opacity,
      mask_threshold: 0.5, masks: (o.masks || []).map((m) => ({ source: m.uuid, mode: 'Mask' })),
    });
    items.push({ node: n, cells: g.cells, paint, w, h, res: o.res || 1 });
    return n;
  };
  const add = (parent, ...kids) => { parent.children.push(...kids); return kids[0]; };

  const param = (name, min, max, def, axis = [0, 1]) => {
    const p = { uuid: nextId++, name, is_vec2: false, min: [min, 0], max: [max, 1], defaults: [def, 0], axis_points: [axis, [0]], bindings: [] };
    params.push(p);
    return p;
  };
  // tie a param to one number on a node: values[i] at axis point i
  const bind = (p, n, what, values) => {
    p.bindings.push({ node: n.uuid, param_name: what, values: values.map((v) => (p.is_vec2 ? v : [v])), isSet: values.map((v) => (p.is_vec2 ? v.map(() => true) : [true])), interpolate_mode: 'Linear' });
  };
  const physics = (name, at, drives, o = {}) => {
    const n = node('SimplePhysics', name, at);
    Object.assign(n, { param: drives.uuid, model_type: o.model || 'Pendulum', map_mode: 'AngleLength', gravity: 1, length: o.length || 80, frequency: o.frequency || 1, angle_damping: o.damping === undefined ? 0.35 : o.damping, length_damping: 0.5, output_scale: [o.scale || 3, 1], local_only: false });
    return n;
  };

  const root = node('Node', 'Root', [0, 0]);
  const HEAD_AT = [0, -170];

  // ---- body (main rig only) ----
  let body = root, headParent = root;
  if (!closeup) {
    body = add(root, node('Node', 'Body', [0, 0]));
    add(body, part('Legs', 'legs', 200, 240, [0, 440], { z: 0.7 }));
    add(body, part('Torso', 'torso', 240, 380, [0, 170], { z: 0.6 }));
    const armL = add(body, part('ArmL', 'arm', 70, 300, [-125, 20], { z: 0.5, pivot: [0.5, 0.06] }));
    const armR = add(body, part('ArmR', 'arm', 70, 300, [125, 20], { z: 0.5, pivot: [0.5, 0.06] }));
    bind(param('ParamArmLRot', -1, 1, 0, [0, 0.5, 1]), armL, 'transform.r.z', [1.1, 0.08, -0.5]);
    bind(param('ParamArmRRot', -1, 1, 0, [0, 0.5, 1]), armR, 'transform.r.z', [0.5, -0.08, -1.1]);
    bind(param('ParamBodyX', -1, 1, 0, [0, 0.5, 1]), body, 'transform.r.z', [-0.07, 0, 0.07]);

    // tail: a pivot that swings, holding a composite (two overlapping pieces
    // that must fade as one picture)
    const pivot = add(body, node('Node', 'TailPivot', [70, 330]));
    const comp = add(pivot, node('Composite', 'Tail', [0, 0], { z: 0.8, more: { blend_mode: 'Normal', tint: [1, 1, 1], screenTint: [0, 0, 0], opacity: 0.85, mask_threshold: 0.5, masks: [], propagate_meshgroup: false } }));
    add(comp, part('TailMain', 'tail', 60, 260, [40, 0], { z: 0.02, pivot: [0.5, 0.05] }));
    add(comp, part('TailTip', 'tailTip', 80, 110, [40, 225], { z: 0.01 }));
    const wiggle = param('ParamTailWiggle', -1, 1, 0, [0, 0.5, 1]);
    bind(wiggle, pivot, 'transform.r.z', [-0.9, -0.5, -0.1]);
    const tailPhys = param('TailPhysics', -1, 1, 0, [0, 0.5, 1]);
    bind(tailPhys, pivot, 'transform.r.z', [0.7, 0, -0.7]);
    add(body, physics('TailPendulum', [70, 330], tailPhys, { length: 220, damping: 0.25 }));
    headParent = body;
  }

  // ---- head ----
  const head = add(headParent, node('Node', 'Head', HEAD_AT));
  // the mesh group: a 4x4 sheet over the head. everything under it bends when the sheet does.
  const G = 4, GW = 440, GH = 500;
  const sheet = grid(GW, GH, G, G, GW / 2, GH / 2 - 20);
  const warp = add(head, node('MeshGroup', 'HeadWarp', [0, 0], { more: { mesh: { verts: sheet.verts, uvs: sheet.cells, indices: sheet.indices, origin: [0, 0] }, dynamic_deformation: false, translate_children: true } }));

  add(warp, part('HairBack', 'hairBack', 400, 460, [0, 30], { z: 0.9, res: 0.5 }));
  add(warp, part('EarL', 'ear', 90, 150, [-120, -185], { z: 0.85 }), part('EarR', 'ear', 90, 150, [120, -185], { z: 0.85 }));
  add(warp, part('Face', 'face', 300, 320, [0, 0], { z: 0.4, nx: 4, ny: 4 }));
  const blush = add(warp, part('Blush', 'blush', 260, 80, [0, 62], { z: 0.35 }));
  const seam = add(warp, part('SeamCheek', 'seam', 14, 110, [96, 64], { z: 0.3, blend: 'LinearDodge' }));
  const mouth = add(warp, part('Mouth', 'mouth', 70, 30, [0, 96], { z: 0.3 }));
  const eyes = {};
  for (const [side, x] of [['L', -70], ['R', 70]]) {
    const white = add(warp, part(`EyeWhite${side}`, 'eyeWhite', 96, 74, [x, -12], { z: 0.3 }));
    const iris = add(warp, part(`Iris${side}`, 'iris', 84, 84, [x, -10], { z: 0.25, masks: [white] }));
    const ring = add(warp, part(`IrisRing${side}`, 'ring', 60, 60, [x, -10], { z: 0.2, blend: 'LinearDodge', masks: [white] }));
    const lid = add(warp, part(`Lid${side}`, 'lid', 104, 84, [x, -54], { z: 0.15, pivot: [0.5, 0] }));
    eyes[side] = { white, iris, ring, lid };
  }
  const bangs = add(warp, part('Bangs', 'bangs', 330, 160, [0, -150], { z: 0.1, nx: 8, ny: 2, pivot: [0.5, 0] }));
  const antenna = add(warp, part('Antenna', 'antenna', 40, 130, [14, -205], { z: 0.05, pivot: [0.5, 1] }));

  // turning the head: the sheet's inner points slide, the rim stays put
  const turn = { uuid: nextId++, name: 'ParamHead', is_vec2: true, min: [-1, -1], max: [1, 1], defaults: [0, 0], axis_points: [[0, 0.5, 1], [0, 0.5, 1]], bindings: [] };
  params.push(turn);
  const shapes = [];
  for (let xi = 0; xi < 3; xi++) {
    const col = [];
    for (let yi = 0; yi < 3; yi++) {
      const kx = xi - 1, ky = yi - 1, pts = [];
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const u = (i / G) * 2 - 1, v = (j / G) * 2 - 1;
        pts.push([kx * 46 * (1 - u * u) * (1 - 0.35 * v * v), ky * 34 * (1 - v * v) * (1 - 0.3 * u * u)]);
      }
      col.push(pts);
    }
    shapes.push(col);
  }
  turn.bindings.push({ node: warp.uuid, param_name: 'deform', values: shapes, isSet: shapes.map((c) => c.map(() => true)), interpolate_mode: 'Linear' });

  // Jun's own ids and ranges, so her code needs no translating
  const eyeOpen = param('ParamEyeOpen', -1, 0, 0);
  const eyeX = param('ParamEyeballLX', -1, 1, 0, [0, 0.5, 1]);
  const glow = param('ParamIrisGlow', 0, 1, 0.25);
  const turnRing = param('ParamApertureRot', -1, 1, 0, [0, 0.5, 1]);
  for (const e of Object.values(eyes)) {
    bind(eyeOpen, e.lid, 'transform.s.y', [1, 0.06]);
    bind(eyeX, e.iris, 'transform.t.x', [-15, 0, 15]);
    bind(eyeX, e.ring, 'transform.t.x', [-15, 0, 15]);
    bind(glow, e.ring, 'opacity', [0, 1]);
    bind(turnRing, e.ring, 'transform.r.z', [-Math.PI / 3, 0, Math.PI / 3]);
  }
  bind(param('ParamBlush', 0, 2, 0, [0, 0.5, 1]), blush, 'opacity', [0, 0.7, 1]);
  bind(param('ParamSeamGlow', 0, 1, 0), seam, 'opacity', [0, 1]);
  bind(param('ParamMouthOpen', -1, 2, 0, [0, 1 / 3, 1]), mouth, 'transform.s.y', [0.35, 0.5, 2.4]);

  const antennaP = param('ParamAntenna', -1, 1, 0, [0, 0.5, 1]);
  bind(antennaP, antenna, 'transform.r.z', [-0.7, 0, 0.7]);
  const antennaPhys = param('AntennaPhysics', -1, 1, 0, [0, 0.5, 1]);
  bind(antennaPhys, antenna, 'transform.r.z', [0.8, 0, -0.8]);
  add(head, physics('AntennaPendulum', [14, -205], antennaPhys, { length: 60, damping: 0.18, scale: 4 }));

  // bangs sway: the physics bends the mesh's lower rows
  const bangsPhys = param('BangsPhysics', -1, 1, 0, [0, 0.5, 1]);
  const sway = (k) => { const pts = []; for (let j = 0; j <= 2; j++) for (let i = 0; i <= 8; i++) pts.push([k * 34 * (j / 2) * (j / 2), 0]); return [pts]; };
  bangsPhys.bindings.push({ node: bangs.uuid, param_name: 'deform', values: [sway(1), sway(0), sway(-1)], isSet: [[true], [true], [true]], interpolate_mode: 'Linear' });
  add(head, physics('BangsPendulum', [0, -150], bangsPhys, { length: 110, damping: 0.3 }));

  // ---- lay the pictures out on texture pages ----
  const pages = [];
  let cur = null;
  const newPage = () => { cur = { x: 0, y: 0, rowH: 0, items: [] }; pages.push(cur); };
  newPage();
  const sorted = items.slice().sort((a, b) => b.h * b.res - a.h * a.res);
  for (const it of sorted) {
    const scale = density * it.res;
    const pw = Math.ceil(it.w * scale) + pad * 2, ph = Math.ceil(it.h * scale) + pad * 2;
    if (pw > page || ph > page) throw new Error(`"${it.node.name}" doesn't fit a ${page} px page`);
    if (cur.x + pw > page) { cur.y += cur.rowH; cur.x = 0; cur.rowH = 0; }
    if (cur.y + ph > page) newPage();
    it.page = pages.length - 1; it.px = cur.x + pad; it.py = cur.y + pad; it.pw = pw - pad * 2; it.ph = ph - pad * 2;
    cur.items.push(it);
    cur.x += pw; cur.rowH = Math.max(cur.rowH, ph);
  }
  for (const it of items) {
    it.node.textures = [it.page];
    const uvs = it.node.mesh.uvs;
    for (let k = 0; k < it.cells.length; k += 2) uvs.push((it.px + it.cells[k] * it.pw) / page, (it.py + it.cells[k + 1] * it.ph) / page);
  }

  const json = {
    meta: { name: closeup ? 'Lab doll (close-up)' : 'Lab doll', version: 'jun-lab-1', rigger: 'Jun OS', artist: 'Jun OS (drawn in code)', copyright: 'Jun OS contributors', licenseURL: 'https://www.apache.org/licenses/LICENSE-2.0', contact: null, reference: null, thumbnailId: 4294967295, preservePixels: false },
    physics: { pixelsPerMeter: 1000, gravity: 9.8 },
    nodes: root, param: params, automation: [],
  };
  return { json, atlas: { page, pages: pages.map((p) => p.items.map((it) => ({ x: it.px, y: it.py, w: it.pw, h: it.ph, uw: it.w, uh: it.h, paint: it.paint }))) } };
}

// draw the texture pages (browser only). -> one canvas per page
export function paintAtlas(atlas) {
  return atlas.pages.map((items) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = atlas.page;
    const c = cv.getContext('2d');
    for (const it of items) {
      c.save();
      c.beginPath(); c.rect(it.x, it.y, it.w, it.h); c.clip();
      c.translate(it.x, it.y); c.scale(it.w / it.uw, it.h / it.uh);
      c.lineJoin = 'round';
      PAINT[it.paint](c, it.uw, it.uh);
      c.restore();
    }
    return cv;
  });
}
