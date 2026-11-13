// An Inochi2D puppet, in plain JavaScript: the node tree, params and their
// bindings, mesh deforms, mesh groups and the pendulum physics. It works out
// where every vertex is each frame; drawing is somebody else's job
// (inochi-view.js), so this file needs no DOM, no PIXI and runs under node.
//
// Written for Jun OS from the public Inochi2D format. The maths follows the
// Inox2D Rust port (https://github.com/Inochi2D/inox2d) and, for mesh groups
// and the per-part bindings Inox2D doesn't have yet, the Inochi2D reference
// (https://github.com/Inochi2D/inochi2d, v0.8). Both are BSD 2-Clause; their
// notices are in NOTICE.

// ---- 4x4 matrices, column-major like the reference ----

function m4mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// translate * rotate (x then y then z) * scale
function m4trs(out, tx, ty, tz, rx, ry, rz, sx, sy) {
  const cx = Math.cos(rx), sxn = Math.sin(rx), cy = Math.cos(ry), syn = Math.sin(ry), cz = Math.cos(rz), szn = Math.sin(rz);
  out[0] = cy * cz * sx; out[1] = (cx * szn + sxn * syn * cz) * sx; out[2] = (sxn * szn - cx * syn * cz) * sx; out[3] = 0;
  out[4] = -cy * szn * sy; out[5] = (cx * cz - sxn * syn * szn) * sy; out[6] = (sxn * cz + cx * syn * szn) * sy; out[7] = 0;
  out[8] = syn; out[9] = -sxn * cy; out[10] = cx * cy; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

function m4inv(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) { for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0; return out; }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

const SCRATCH_A = new Float64Array(16);
const SCRATCH_B = new Float64Array(16);

// ---- loading ----

const BLEND_MODES = ['Normal', 'Multiply', 'ColorDodge', 'LinearDodge', 'Screen', 'ClipToLower', 'SliceFromLower'];

// what a binding does to its node, by the file's "param_name"
const BIND = {
  'zSort': 1, 'transform.t.x': 2, 'transform.t.y': 3, 'transform.t.z': 4,
  'transform.r.x': 5, 'transform.r.y': 6, 'transform.r.z': 7, 'transform.s.x': 8, 'transform.s.y': 9,
  'deform': 10, 'opacity': 11, 'tint.r': 12, 'tint.g': 13, 'tint.b': 14,
  'screenTint.r': 15, 'screenTint.g': 16, 'screenTint.b': 17, 'alphaThreshold': 18,
};

const vec3 = (v, d) => (Array.isArray(v) ? [+v[0] || 0, +v[1] || 0, +v[2] || 0] : d.slice());

function buildNode(j, parent, puppet) {
  const tr = j.transform || {};
  const n = {
    uuid: j.uuid >>> 0, name: String(j.name ?? ''), type: String(j.type || 'Node'),
    enabled: j.enabled !== false, zsort: +j.zsort || 0, lockToRoot: !!j.lockToRoot,
    parent, children: [],
    t: vec3(tr.trans, [0, 0, 0]), r: vec3(tr.rot, [0, 0, 0]),
    s: Array.isArray(tr.scale) ? [+tr.scale[0] || 0, +tr.scale[1] || 0] : [1, 1],
    // this frame's offsets from the params
    ot: [0, 0, 0], or: [0, 0, 0], os: [1, 1], oz: 0,
    z: 0, abs: new Float64Array(16), drawAbs: null,
    group: null, mesh: null,
    // what the owner's code overrides on top of the rig (tint, hide, swap a texture)
    user: { visible: true, opacity: 1, tint: null, screen: null, texture: null },
  };
  puppet.nodes.push(n);
  puppet.byUuid.set(n.uuid, n);

  const m = j.mesh;
  if (m && Array.isArray(m.verts) && m.verts.length >= 2) {
    const count = m.verts.length >> 1;
    const Index = count > 65535 ? Uint32Array : Uint16Array;
    n.mesh = {
      count,
      verts: Float32Array.from(m.verts),
      uvs: Float32Array.from(Array.isArray(m.uvs) && m.uvs.length === m.verts.length ? m.uvs : new Array(m.verts.length).fill(0)),
      indices: Index.from(Array.isArray(m.indices) ? m.indices : []),
    };
    n.deform = new Float32Array(count * 2);
    n.pos = new Float32Array(count * 2);
  }

  if (n.type === 'Part' || n.type === 'Composite') {
    n.blend = BLEND_MODES.includes(j.blend_mode) ? j.blend_mode : 'Normal';
    n.tint = vec3(j.tint, [1, 1, 1]);
    n.screen = vec3(j.screenTint, [0, 0, 0]);
    n.opacity = j.opacity === undefined ? 1 : +j.opacity;
    n.maskThreshold = j.mask_threshold === undefined ? 0.5 : +j.mask_threshold;
    n.masks = (Array.isArray(j.masks) ? j.masks : []).map((k) => ({ source: k.source >>> 0, dodge: k.mode === 'DodgeMask' }));
    n.oOpacity = 1; n.oTint = [1, 1, 1]; n.oScreen = [0, 0, 0]; n.oThreshold = 0;
  }
  if (n.type === 'Part') {
    const tex = Array.isArray(j.textures) ? j.textures : [];
    n.texture = Number.isInteger(tex[0]) ? tex[0] : -1;
    if (!n.mesh || !n.mesh.indices.length || n.texture < 0) n.type = 'Node';
  }
  if (n.type === 'Composite') { n.sub = []; n.propagateMeshGroup = !!j.propagate_meshgroup; }
  if (n.type === 'MeshGroup') {
    n.dynamic = !!j.dynamic_deformation;
    n.translateChildren = !!j.translate_children;
  }
  if (n.type === 'SimplePhysics') {
    puppet.physics.push({
      node: n, paramUuid: j.param >>> 0, param: null,
      rigid: j.model_type !== 'SpringPendulum',
      map: ['AngleLength', 'LengthAngle', 'XY', 'YX'].includes(j.map_mode) ? j.map_mode : 'AngleLength',
      gravity: j.gravity === undefined ? 1 : +j.gravity, length: +j.length || 1, frequency: j.frequency === undefined ? 1 : +j.frequency,
      angleDamping: j.angle_damping === undefined ? 0.5 : +j.angle_damping,
      lengthDamping: j.length_damping === undefined ? 0.5 : +j.length_damping,
      scale: Array.isArray(j.output_scale) ? [+j.output_scale[0] || 0, +j.output_scale[1] || 0] : [1, 1],
      localOnly: !!j.local_only,
      started: false, bx: 0, by: 0, vx: 0, vy: 0, omega: 0,
    });
  }
  if (!KNOWN_TYPES.has(j.type)) puppet.unsupported.add(`node type "${j.type}"`);

  for (const c of (Array.isArray(j.children) ? j.children : [])) n.children.push(buildNode(c, n, puppet));
  return n;
}

const KNOWN_TYPES = new Set(['Node', 'Part', 'Composite', 'MeshGroup', 'SimplePhysics', 'Camera', 'Tmp']);

function buildParam(j, puppet) {
  const pair = (v, d) => (Array.isArray(v) ? [+v[0] || 0, +v[1] || 0] : d);
  const p = {
    uuid: j.uuid >>> 0, name: String(j.name), isVec2: !!j.is_vec2,
    min: pair(j.min, [0, 0]), max: pair(j.max, [1, 1]), def: pair(j.defaults, [0, 0]),
    axisX: (j.axis_points && j.axis_points[0]) || [0], axisY: (j.axis_points && j.axis_points[1]) || [0],
    bindings: [], driven: false,
  };
  p.value = p.def.slice();
  for (const b of (Array.isArray(j.bindings) ? j.bindings : [])) {
    const node = puppet.byUuid.get(b.node >>> 0);
    const kind = BIND[b.param_name];
    if (!node) continue;
    if (!kind) { puppet.unsupported.add(`binding "${b.param_name}"`); continue; }
    const nx = p.axisX.length, ny = p.axisY.length;
    const src = b.values;
    if (!Array.isArray(src) || src.length < nx || src.some((col) => !Array.isArray(col) || col.length < ny)) continue;
    let values;
    if (kind === 10) {
      if (!node.mesh) continue;
      const len = node.mesh.count * 2;
      values = [];
      let ok = true;
      for (let x = 0; x < nx && ok; x++) {
        for (let y = 0; y < ny; y++) {
          const pts = src[x][y];
          const flat = new Float32Array(len);
          if (Array.isArray(pts)) {
            if (pts.length !== node.mesh.count) { ok = false; break; }
            for (let i = 0; i < pts.length; i++) { flat[i * 2] = +pts[i][0] || 0; flat[i * 2 + 1] = +pts[i][1] || 0; }
          }
          values.push(flat);
        }
      }
      if (!ok) { puppet.unsupported.add(`a deform on "${node.name}" that doesn't match its mesh`); continue; }
    } else {
      values = new Float32Array(nx * ny);
      for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) values[x * ny + y] = +src[x][y] || 0;
    }
    if ((kind >= 11) && node.oTint === undefined) continue;
    const mode = { Linear: 0, Nearest: 1, Cubic: 2 }[b.interpolate_mode];
    if (b.interpolate_mode && mode === undefined) puppet.unsupported.add(`"${b.interpolate_mode}" interpolation (drawn as linear)`);
    p.bindings.push({ node, kind, values, ny, mode: mode || 0 });
  }
  return p;
}

// where v sits between two axis points: [index, next index, 0..1]
function locate(axis, v, out) {
  const last = axis.length - 1;
  if (last <= 0) { out[0] = 0; out[1] = 0; out[2] = 0; return; }
  let i = 0;
  while (i < last - 1 && v >= axis[i + 1]) i++;
  const span = axis[i + 1] - axis[i];
  const t = span > 0 ? (v - axis[i]) / span : 0;
  out[0] = i; out[1] = i + 1; out[2] = t < 0 ? 0 : t > 1 ? 1 : t;
}

// which keypoints along one axis take part, and how much each counts.
// mode 0 = straight line between two, 1 = the nearer one, 2 = a smooth curve
// through four (Catmull-Rom, the reference's "Cubic").
function taps(axis, loc, mode, idx, wt) {
  const i = loc[0], t = loc[2], last = axis.length - 1;
  if (last <= 0) { idx[0] = 0; wt[0] = 1; return 1; }
  if (mode === 1) { idx[0] = t >= 0.5 ? i + 1 : i; wt[0] = 1; return 1; }
  if (mode === 2) {
    const t2 = t * t, t3 = t2 * t;
    idx[0] = i > 0 ? i - 1 : 0; wt[0] = -0.5 * t3 + t2 - 0.5 * t;
    idx[1] = i; wt[1] = 1.5 * t3 - 2.5 * t2 + 1;
    idx[2] = i + 1; wt[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
    idx[3] = i + 2 < last ? i + 2 : last; wt[3] = 0.5 * t3 - 0.5 * t2;
    return 4;
  }
  idx[0] = i; wt[0] = 1 - t; idx[1] = i + 1; wt[1] = t;
  return 2;
}
const LX = [0, 0, 0], LY = [0, 0, 0];
const IX = [0, 0, 0, 0], WX = [0, 0, 0, 0], IY = [0, 0, 0, 0], WY = [0, 0, 0, 0];

// ---- mesh groups ----
// A mesh group is a mesh with no picture. When its points move, everything
// drawn under it bends along: each of its triangles carries the points that
// sat inside it at rest.

function prepareGroup(g) {
  const { verts, indices } = g.mesh;
  const nt = (indices.length / 3) | 0;
  const inv = new Float64Array(nt * 6);
  const box = new Float32Array(nt * 4);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < verts.length; i += 2) {
    if (verts[i] < minX) minX = verts[i]; if (verts[i] > maxX) maxX = verts[i];
    if (verts[i + 1] < minY) minY = verts[i + 1]; if (verts[i + 1] > maxY) maxY = verts[i + 1];
  }
  minX = Math.floor(minX); minY = Math.floor(minY); maxX = Math.ceil(maxX); maxY = Math.ceil(maxY);
  const G = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(nt))));
  const cells = Array.from({ length: G * G }, () => []);
  const cw = (maxX - minX) / G || 1, ch = (maxY - minY) / G || 1;
  for (let t = 0; t < nt; t++) {
    const a = indices[t * 3] * 2, b = indices[t * 3 + 1] * 2, c = indices[t * 3 + 2] * 2;
    const x1 = verts[a], y1 = verts[a + 1], ux = verts[b] - x1, uy = verts[b + 1] - y1, vx = verts[c] - x1, vy = verts[c + 1] - y1;
    const det = ux * vy - vx * uy;
    if (Math.abs(det) < 1e-9) { inv[t * 6] = NaN; continue; }
    // rest point -> (how far along edge 1, how far along edge 2)
    const ia = vy / det, ic = -vx / det, ib = -uy / det, id = ux / det;
    inv[t * 6] = ia; inv[t * 6 + 1] = ib; inv[t * 6 + 2] = ic; inv[t * 6 + 3] = id;
    inv[t * 6 + 4] = -(ia * x1 + ic * y1); inv[t * 6 + 5] = -(ib * x1 + id * y1);
    const x0 = Math.min(x1, verts[b], verts[c]), xN = Math.max(x1, verts[b], verts[c]);
    const y0 = Math.min(y1, verts[b + 1], verts[c + 1]), yN = Math.max(y1, verts[b + 1], verts[c + 1]);
    box[t * 4] = x0; box[t * 4 + 1] = y0; box[t * 4 + 2] = xN; box[t * 4 + 3] = yN;
    const gx0 = Math.max(0, Math.min(G - 1, Math.floor((x0 - minX) / cw))), gx1 = Math.max(0, Math.min(G - 1, Math.floor((xN - minX) / cw)));
    const gy0 = Math.max(0, Math.min(G - 1, Math.floor((y0 - minY) / ch))), gy1 = Math.max(0, Math.min(G - 1, Math.floor((yN - minY) / ch)));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cells[gy * G + gx].push(t);
  }
  g.tris = { nt, inv, cells, G, cw, ch, minX, minY, maxX, maxY, now: new Float64Array(nt * 6), invAbs: new Float64Array(16) };
}

// which rest triangle holds this point (group space), -1 for none. the
// later triangle wins on a shared edge, like the reference's bitmap.
function triAt(tris, x, y) {
  if (!(x >= tris.minX && x < tris.maxX && y >= tris.minY && y < tris.maxY)) return -1;
  const gx = Math.min(tris.G - 1, Math.floor((x - tris.minX) / tris.cw)), gy = Math.min(tris.G - 1, Math.floor((y - tris.minY) / tris.ch));
  const cell = tris.cells[gy * tris.G + gx], inv = tris.inv;
  for (let k = cell.length - 1; k >= 0; k--) {
    const t = cell[k] * 6;
    const u = inv[t] * x + inv[t + 2] * y + inv[t + 4], v = inv[t + 1] * x + inv[t + 3] * y + inv[t + 5];
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return cell[k];
  }
  return -1;
}

// the group's points moved: one small matrix per triangle, rest -> now
function updateGroup(g) {
  const { verts, indices } = g.mesh, d = g.deform, T = g.tris, inv = T.inv, now = T.now;
  for (let t = 0; t < T.nt; t++) {
    const o = t * 6;
    if (inv[o] !== inv[o]) continue;
    const a = indices[t * 3] * 2, b = indices[t * 3 + 1] * 2, c = indices[t * 3 + 2] * 2;
    const x1 = verts[a] + d[a], y1 = verts[a + 1] + d[a + 1];
    const ux = verts[b] + d[b] - x1, uy = verts[b + 1] + d[b + 1] - y1, vx = verts[c] + d[c] - x1, vy = verts[c + 1] + d[c + 1] - y1;
    now[o] = ux * inv[o] + vx * inv[o + 1]; now[o + 1] = uy * inv[o] + vy * inv[o + 1];
    now[o + 2] = ux * inv[o + 2] + vx * inv[o + 3]; now[o + 3] = uy * inv[o + 2] + vy * inv[o + 3];
    now[o + 4] = ux * inv[o + 4] + vx * inv[o + 5] + x1; now[o + 5] = uy * inv[o + 4] + vy * inv[o + 5] + y1;
  }
  m4inv(T.invAbs, g.abs);
}

// bend a drawable's points with the group above it
function filterMesh(g, n) {
  const T = g.tris, now = T.now, inv = T.inv;
  const C = m4mul(SCRATCH_A, T.invAbs, n.abs);
  const a = C[0], b = C[1], c = C[4], d = C[5], tx = C[12], ty = C[13];
  const det = a * d - b * c;
  if (!det) return;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  const verts = n.mesh.verts, def = n.deform, count = n.mesh.count, dyn = g.dynamic;
  // which triangle each point sits in only changes when the part moves
  // against its group, so remember it between frames
  let cache = n.gTri;
  let fresh = !cache || dyn;
  if (!cache) { cache = n.gTri = new Int32Array(count); n.gKey = new Float64Array(6); }
  const key = n.gKey;
  if (!fresh && (key[0] !== a || key[1] !== b || key[2] !== c || key[3] !== d || key[4] !== tx || key[5] !== ty)) fresh = true;
  if (fresh) { key[0] = a; key[1] = b; key[2] = c; key[3] = d; key[4] = tx; key[5] = ty; }
  for (let i = 0; i < count; i++) {
    const vx = verts[i * 2] + (dyn ? def[i * 2] : 0), vy = verts[i * 2 + 1] + (dyn ? def[i * 2 + 1] : 0);
    const cx = a * vx + c * vy + tx, cy = b * vx + d * vy + ty;
    const t = fresh ? (cache[i] = triAt(T, cx, cy)) : cache[i];
    let nx = cx, ny = cy;
    if (t >= 0 && inv[t * 6] === inv[t * 6]) {
      const o = t * 6;
      nx = now[o] * cx + now[o + 2] * cy + now[o + 4];
      ny = now[o + 1] * cx + now[o + 3] * cy + now[o + 5];
    }
    if (dyn) {
      def[i * 2] = nx - verts[i * 2]; def[i * 2 + 1] = ny - verts[i * 2 + 1];
    } else {
      const dx = nx - cx, dy = ny - cy;
      def[i * 2] += ia * dx + ic * dy; def[i * 2 + 1] += ib * dx + id * dy;
    }
  }
  if (dyn) n.drawAbs = g.abs;
}

// a plain node under a group that moves its children: shift where it sits
function filterOrigin(g, n, parentAbs) {
  const T = g.tris;
  const C = m4mul(SCRATCH_A, T.invAbs, parentAbs);
  const a = C[0], b = C[1], c = C[4], d = C[5];
  const det = a * d - b * c;
  if (!det) return;
  const cx = a * n.t[0] + c * n.t[1] + C[12], cy = b * n.t[0] + d * n.t[1] + C[13];
  const t = triAt(T, cx, cy);
  if (t < 0 || T.inv[t * 6] !== T.inv[t * 6]) return;
  const o = t * 6, now = T.now;
  const dx = now[o] * cx + now[o + 2] * cy + now[o + 4] - cx, dy = now[o + 1] * cx + now[o + 3] * cy + now[o + 5] - cy;
  n.ot[0] += (d * dx - c * dy) / det; n.ot[1] += (-b * dx + a * dy) / det;
}

// ---- the puppet ----

export class Puppet {
  // json: the puppet's json block (parseInp(...).json)
  constructor(json) {
    this.meta = json.meta || {};
    this.nodes = [];          // parents always before their children
    this.byUuid = new Map();
    this.physics = [];
    this.unsupported = new Set();
    this.frame = 0;
    const ph = json.physics || {};
    this.pixelsPerMeter = +ph.pixelsPerMeter || 1000;
    this.gravity = ph.gravity === undefined ? 9.8 : +ph.gravity;
    this.physicsOn = true;

    this.root = buildNode(json.nodes || { type: 'Node', uuid: 0 }, null, this);
    this.params = (Array.isArray(json.param) ? json.param : []).map((p) => buildParam(p, this));
    this.paramByName = new Map(this.params.map((p) => [p.name, p]));
    const byUuid = new Map(this.params.map((p) => [p.uuid, p]));
    this.physics = this.physics.filter((s) => { s.param = byUuid.get(s.paramUuid) || null; if (s.param) s.param.driven = true; return !!s.param; });

    // mesh groups claim what they bend, outer ones first
    for (const g of this.nodes) {
      if (g.type !== 'MeshGroup' || !g.mesh || g.mesh.indices.length < 3) continue;
      prepareGroup(g);
      const claim = (n) => {
        const drawable = !!n.mesh && (n.type === 'Part' || n.type === 'MeshGroup');
        n.group = (g.translateChildren || drawable) ? g : null;
        if ((drawable && n.type !== 'MeshGroup') || (n.type === 'Composite' && n.propagateMeshGroup)) n.children.forEach(claim);
      };
      g.children.forEach(claim);
    }

    // what gets drawn, and what each composite draws inside itself
    this.drawables = [];
    const collect = (n, into) => {
      if (n.type === 'Composite') { into.push(n); n.children.forEach((c) => collect(c, n.sub)); return; }
      if (n.type === 'Part') into.push(n);
      n.children.forEach((c) => collect(c, into));
    };
    collect(this.root, this.drawables);
    this.parts = this.nodes.filter((n) => n.type === 'Part');
    this.composites = this.nodes.filter((n) => n.type === 'Composite');
    this.drawList = [];
    this.textureCount = this.parts.reduce((m, n) => Math.max(m, n.texture + 1), 0);
    this.update(0);
  }

  get name() { return this.meta.name || ''; }

  param(name) { return this.paramByName.get(name) || null; }

  // a param's value, kept until it's set again. physics-driven params are
  // written by the physics every frame.
  setParam(name, x, y) {
    const p = this.paramByName.get(name);
    if (!p) return false;
    if (x === x) p.value[0] = x;
    if (y !== undefined && y === y) p.value[1] = y;
    return true;
  }

  resetParams() { for (const p of this.params) { p.value[0] = p.def[0]; p.value[1] = p.def[1]; } }

  _reset() {
    for (const n of this.nodes) {
      n.ot[0] = n.ot[1] = n.ot[2] = 0; n.or[0] = n.or[1] = n.or[2] = 0; n.os[0] = n.os[1] = 1; n.oz = 0;
      if (n.oTint) { n.oOpacity = 1; n.oTint[0] = n.oTint[1] = n.oTint[2] = 1; n.oScreen[0] = n.oScreen[1] = n.oScreen[2] = 0; n.oThreshold = 0; }
    }
  }

  // full = deforms and colours too; the quick pass only places the nodes,
  // which is all the physics needs to find its anchors
  _applyParams(full) {
    if (full) for (const n of this.nodes) if (n.deform) n.deform.fill(0);
    for (const p of this.params) {
      const sx = p.max[0] - p.min[0], sy = p.max[1] - p.min[1];
      let vx = sx ? (p.value[0] - p.min[0]) / sx : 0, vy = sy ? (p.value[1] - p.min[1]) / sy : 0;
      vx = vx < 0 ? 0 : vx > 1 ? 1 : vx; vy = vy < 0 ? 0 : vy > 1 ? 1 : vy;
      if (vx !== vx) vx = 0; if (vy !== vy) vy = 0;
      locate(p.axisX, vx, LX); locate(p.axisY, vy, LY);
      for (const b of p.bindings) {
        if (b.kind >= 10 && !full) continue;
        const nx = taps(p.axisX, LX, b.mode, IX, WX), nyTaps = taps(p.axisY, LY, b.mode, IY, WY);
        const n = b.node, V = b.values;
        if (b.kind === 10) {
          const out = n.deform;
          for (let i = 0; i < nx; i++) {
            for (let j = 0; j < nyTaps; j++) {
              const w = WX[i] * WY[j];
              if (!w) continue;
              const s = V[IX[i] * b.ny + IY[j]];
              for (let k = 0; k < out.length; k++) out[k] += w * s[k];
            }
          }
          continue;
        }
        let v = 0;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nyTaps; j++) v += WX[i] * WY[j] * V[IX[i] * b.ny + IY[j]];
        switch (b.kind) {
          case 1: n.oz += v; break;
          case 2: n.ot[0] += v; break;
          case 3: n.ot[1] += v; break;
          case 4: n.ot[2] += v; break;
          case 5: n.or[0] += v; break;
          case 6: n.or[1] += v; break;
          case 7: n.or[2] += v; break;
          case 8: n.os[0] *= v; break;
          case 9: n.os[1] *= v; break;
          case 11: n.oOpacity *= v; break;
          case 12: n.oTint[0] *= v; break;
          case 13: n.oTint[1] *= v; break;
          case 14: n.oTint[2] *= v; break;
          case 15: n.oScreen[0] += v; break;
          case 16: n.oScreen[1] += v; break;
          case 17: n.oScreen[2] += v; break;
          case 18: n.oThreshold += v; break;
          default: break;
        }
      }
    }
  }

  _place(full) {
    const root = this.root;
    for (const n of this.nodes) {
      const base = n.parent ? (n.lockToRoot ? root : n.parent) : null;
      if (full && n.group && !n.mesh && base) filterOrigin(n.group, n, base.abs);
      const local = m4trs(SCRATCH_B, n.t[0] + n.ot[0], n.t[1] + n.ot[1], n.t[2] + n.ot[2], n.r[0] + n.or[0], n.r[1] + n.or[1], n.r[2] + n.or[2], n.s[0] * n.os[0], n.s[1] * n.os[1]);
      if (base) m4mul(n.abs, base.abs, local); else n.abs.set(local);
      n.z = n.zsort + n.oz + (base ? base.z : 0);
      if (!full || !n.mesh) continue;
      n.drawAbs = n.abs;
      if (n.group) filterMesh(n.group, n);
      if (n.tris) updateGroup(n);
    }
  }

  _stepPhysics(dt) {
    const g0 = this.pixelsPerMeter * this.gravity;
    for (const s of this.physics) {
      const n = s.node;
      const ax = s.localOnly ? n.t[0] + n.ot[0] : n.abs[12], ay = s.localOnly ? n.t[1] + n.ot[1] : n.abs[13];
      if (!s.started) { s.started = true; s.bx = ax; s.by = ay + s.length; s.vx = s.vy = 0; s.omega = 0; }
      const g = s.gravity * g0, r = s.length;
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const h = Math.min(left, 0.01);
        left -= 0.01;
        if (s.rigid) {
          const k = g / r, damp = s.angleDamping * 2 * Math.sqrt(Math.max(0, k));
          const th0 = Math.atan2(-(s.bx - ax), s.by - ay), w0 = s.omega;
          const acc = (th, w) => -k * Math.sin(th) - w * damp;
          const k1t = w0, k1w = acc(th0, w0);
          const k2t = w0 + h * k1w / 2, k2w = acc(th0 + h * k1t / 2, w0 + h * k1w / 2);
          const k3t = w0 + h * k2w / 2, k3w = acc(th0 + h * k2t / 2, w0 + h * k2w / 2);
          const k4t = w0 + h * k3w, k4w = acc(th0 + h * k3t, w0 + h * k3w);
          const th = th0 + h * (k1t + 2 * k2t + 2 * k3t + k4t) / 6, w = w0 + h * (k1w + 2 * k2w + 2 * k3w + k4w) / 6;
          if (Number.isFinite(th) && Number.isFinite(w)) { s.omega = w; s.bx = ax - Math.sin(th) * r; s.by = ay + Math.cos(th) * r; }
        } else {
          const ks = s.frequency * 2 * Math.PI, k = ks * ks, rest = r - g / k;
          const dampA = s.angleDamping * 2 * Math.sqrt(Math.max(0, g / r)), dampL = s.lengthDamping * 2 * ks;
          const acc = (px, py, vx, vy, out) => {
            let ox = px - ax, oy = py - ay;
            const dist = Math.hypot(ox, oy) || 1e-9;
            ox /= dist; oy /= dist;
            const f = (dist - rest) * k;
            // the bob's speed split into "round the anchor" and "along the rod", each with its own damping
            const rx = vx * oy + vy * ox, ry = vy * oy - vx * ox;
            const dx = -rx * dampA, dy = -ry * dampL;
            out[0] = -ox * f + (dx * oy - ry * ox); out[1] = g - oy * f + (dy * oy + rx * ox);
          };
          const A = [0, 0];
          const p0x = s.bx, p0y = s.by, v0x = s.vx, v0y = s.vy;
          acc(p0x, p0y, v0x, v0y, A); const a1x = A[0], a1y = A[1];
          acc(p0x + h * v0x / 2, p0y + h * v0y / 2, v0x + h * a1x / 2, v0y + h * a1y / 2, A); const a2x = A[0], a2y = A[1];
          const v2x = v0x + h * a1x / 2, v2y = v0y + h * a1y / 2;
          acc(p0x + h * v2x / 2, p0y + h * v2y / 2, v0x + h * a2x / 2, v0y + h * a2y / 2, A); const a3x = A[0], a3y = A[1];
          const v3x = v0x + h * a2x / 2, v3y = v0y + h * a2y / 2;
          acc(p0x + h * v3x, p0y + h * v3y, v0x + h * a3x, v0y + h * a3y, A); const a4x = A[0], a4y = A[1];
          const v4x = v0x + h * a3x, v4y = v0y + h * a3y;
          const px = p0x + h * (v0x + 2 * v2x + 2 * v3x + v4x) / 6, py = p0y + h * (v0y + 2 * v2y + 2 * v3y + v4y) / 6;
          const vx = v0x + h * (a1x + 2 * a2x + 2 * a3x + a4x) / 6, vy = v0y + h * (a1y + 2 * a2y + 2 * a3y + a4y) / 6;
          if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(vx) && Number.isFinite(vy)) { s.bx = px; s.by = py; s.vx = vx; s.vy = vy; }
        }
      }
      // the bob, seen from the node, becomes the param's value
      let lx = s.bx, ly = s.by;
      if (!s.localOnly) {
        const I = m4inv(SCRATCH_A, n.abs);
        lx = I[0] * s.bx + I[4] * s.by + I[12]; ly = I[1] * s.bx + I[5] * s.by + I[13];
      }
      const len = Math.hypot(lx, ly) || 1;
      lx /= len; ly /= len;
      const rel = Math.hypot(s.bx - ax, s.by - ay) / r;
      let ox, oy;
      if (s.map === 'XY' || s.map === 'YX') {
        const x = lx * rel, y = -(ly * rel - 1);
        ox = s.map === 'XY' ? x : y; oy = s.map === 'XY' ? y : x;
      } else {
        const ang = Math.atan2(-lx, ly) / Math.PI;
        ox = s.map === 'AngleLength' ? ang : rel; oy = s.map === 'AngleLength' ? rel : ang;
      }
      ox *= s.scale[0]; oy *= s.scale[1];
      if (Number.isFinite(ox) && Number.isFinite(oy)) { s.param.value[0] = ox; s.param.value[1] = oy; }
    }
  }

  // put every physics bob back at rest (after a teleport, a size change...)
  settlePhysics() { for (const s of this.physics) s.started = false; }

  // one frame: params -> transforms -> physics -> deforms -> where every vertex is
  update(dtSeconds = 0) {
    this._reset();
    if (this.physicsOn && this.physics.length && dtSeconds > 0) {
      this._applyParams(false);
      this._place(false);
      this._stepPhysics(dtSeconds);
      this._reset();
    }
    this._applyParams(true);
    this._place(true);

    for (const n of this.parts) {
      const m = n.drawAbs || n.abs, v = n.mesh.verts, d = n.deform, out = n.pos;
      const a = m[0], b = m[1], c = m[4], e = m[5], tx = m[12], ty = m[13];
      for (let i = 0; i < out.length; i += 2) {
        const x = v[i] + d[i], y = v[i + 1] + d[i + 1];
        out[i] = a * x + c * y + tx; out[i + 1] = b * x + e * y + ty;
      }
    }
    // far to near: the biggest zsort is drawn first
    const order = (list) => list.slice().sort((p, q) => q.z - p.z);
    this.drawList = order(this.drawables);
    for (const n of this.composites) n.subList = order(n.sub);
    this.frame++;
  }

  static alive(n) {
    for (let k = n; k; k = k.parent) if (!k.enabled) return false;
    return n.user.visible;
  }

  static opacityOf(n) {
    const o = n.opacity * n.oOpacity * n.user.opacity * (n.groupOpacity ?? 1);
    return o < 0 ? 0 : o > 1 ? 1 : o;
  }

  // the box round everything visible, in puppet units
  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.parts) {
      if (!Puppet.alive(n) || Puppet.opacityOf(n) <= 0) continue;
      const p = n.pos;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
        if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1];
      }
    }
    if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // box round some parts (for touch spots that follow the rig)
  boundsOf(parts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of parts) {
      const p = n.pos;
      if (!p) continue;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
        if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1];
      }
    }
    return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  static inside(n, x, y) {
    const p = n.pos, idx = n.mesh.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 2, b = idx[t + 1] * 2, c = idx[t + 2] * 2;
      const d1 = (x - p[b]) * (p[a + 1] - p[b + 1]) - (p[a] - p[b]) * (y - p[b + 1]);
      const d2 = (x - p[c]) * (p[b + 1] - p[c + 1]) - (p[b] - p[c]) * (y - p[c + 1]);
      const d3 = (x - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (y - p[a + 1]);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  }

  // the front-most part under a point (puppet units), or null.
  // only(part) can narrow it down to some parts.
  partAt(x, y, only) {
    const look = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        if (!Puppet.alive(n) || Puppet.opacityOf(n) <= 0.01) continue;
        if (n.sub) { const hit = look(n.subList || n.sub); if (hit) return hit; continue; }
        if (only && !only(n)) continue;
        if (Puppet.inside(n, x, y)) return n;
      }
      return null;
    };
    return look(this.drawList);
  }

  // parts by name: a string matches anywhere in the name, or pass a RegExp
  find(match) {
    const test = match instanceof RegExp ? (s) => match.test(s) : (s) => s.includes(match);
    return this.parts.filter((n) => test(n.name));
  }
}
