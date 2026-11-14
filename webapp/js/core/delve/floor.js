// the floor generator (#32): hand-made rooms (data/delve.json "rooms") stitched into a random
// floor. Rooms sit on a lattice of slots; a random tree of corridors joins every slot (so every
// room can be reached), a few extra corridors make loops, one leaf may hide behind a secret door,
// and rare rooms turn up now and then. The same (area, depth, seed) always gives the same floor,
// so a delve is saved as a seed, never as a map.
//
// No DOM and no storage in here: the page, the time-lapse and the tests all call generate().

import { dice, mix } from './rng.js?v=1';
import { tune as getTune } from './delve-tune.js?v=2';

export const WALL = 0, FLOOR = 1, DOOR = 2, SECRET = 3;
// 0 north, 1 east, 2 south, 3 west
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const SIDES = ['n', 'e', 's', 'w'];

// which sides of a hand-made room may take a door (a '+' in the middle of that side)
export function sidesOf(room) {
  const rows = room.rows, h = rows.length, w = rows[0].length;
  const mx = (w - 1) / 2, my = (h - 1) / 2;
  return { n: rows[0][mx] === '+', e: rows[my][w - 1] === '+', s: rows[h - 1][mx] === '+', w: rows[my][0] === '+' };
}

// rules a hand-made room must keep; the test runs this over every room in the data
export function checkRoom(id, room, slot = 7) {
  const e = [];
  const rows = room.rows || [];
  const h = rows.length, w = (rows[0] || '').length;
  if (!h || !w) return [id + ': empty'];
  if (h % 2 === 0 || w % 2 === 0) e.push(id + ': sides must be odd');
  if (h > slot || w > slot) e.push(id + ': bigger than a slot');
  if (rows.some(r => r.length !== w)) e.push(id + ': ragged rows');
  if (/[^#.+EBCVT^R<>?]/.test(rows.join(''))) e.push(id + ': unknown mark');
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1;
    const mid = (x === (w - 1) / 2 && (y === 0 || y === h - 1)) || (y === (h - 1) / 2 && (x === 0 || x === w - 1));
    if (edge && c !== '#' && !(mid && c === '+')) e.push(`${id}: the edge must be wall or a middle door (${x},${y})`);
    if (!edge && c === '+') e.push(`${id}: a door inside the room (${x},${y})`);
  }));
  if (!Object.values(sidesOf(room)).some(Boolean)) e.push(id + ': no door');
  // everything walkable inside must hang together from its doors, without needing to pass a chest or terminal
  if (!e.length) {
    const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !'#CVT'.includes(rows[y][x]);
    const seen = new Set();
    const stack = [];
    // a hidden room is a dead end with one door, so each of its doors only has to reach its own things
    const leaf = (room.tags || []).includes('secret');
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '+' && (leaf || !stack.length)) stack.push([x, y]); }));
    while (stack.length) {
      const [x, y] = stack.pop();
      const k = x + ',' + y;
      if (seen.has(k) || !open(x, y)) continue;
      seen.add(k);
      for (let d = 0; d < 4; d++) stack.push([x + DX[d], y + DY[d]]);
    }
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (open(x, y) && !seen.has(x + ',' + y)) e.push(`${id}: (${x},${y}) can't be reached from its doors`);
      if ('CVT'.includes(c) && ![0, 1, 2, 3].some(d => seen.has((x + DX[d]) + ',' + (y + DY[d])))) e.push(`${id}: the thing at (${x},${y}) can't be reached`);
    }));
  }
  return e;
}

const has = (room, tag) => (room.tags || []).includes(tag);

// a creature group for one 'E' (or the area's big one for a 'B')
function group(data, area, depth, rnd, t, big) {
  if (big && area.boss && data.foes[area.boss]) return [area.boss];
  const n = 1 + (rnd() < t.floor.groupTwo + (depth - 1) * t.floor.groupPerDepth ? 1 : 0) + (rnd() < t.floor.groupThree + (depth - 1) * t.floor.groupPerDepth / 2 ? 1 : 0);
  return Array.from({ length: n }, () => rnd.weighted(area.foes));
}

export function generate(data, { area: areaId, depth = 1, seed = 1, tune } = {}) {
  const t = tune || getTune();
  const area = data.areas[areaId];
  if (!area) throw new Error('unknown area ' + areaId);
  const rnd = dice(mix('floor', areaId, depth, seed));
  const S = t.floor.slot, P = S + 1, half = (S - 1) / 2;
  const cols = area.cols, rows = area.rows;
  const w = 1 + cols * P, h = 1 + rows * P;
  const cells = new Uint8Array(w * h);
  const last = depth >= area.floors;
  const slot = (c, r) => r * cols + c;
  const N = cols * rows;

  // 1. a random tree over the slots (every slot joined), then a few loops
  const edges = new Set(); // "a|b" with a < b
  const link = (a, b) => edges.add(a < b ? a + '|' + b : b + '|' + a);
  const linked = (a, b) => edges.has(a < b ? a + '|' + b : b + '|' + a);
  const near = (i) => {
    const c = i % cols, r = Math.floor(i / cols), out = [];
    if (r > 0) out.push([slot(c, r - 1), 0]);
    if (c < cols - 1) out.push([slot(c + 1, r), 1]);
    if (r < rows - 1) out.push([slot(c, r + 1), 2]);
    if (c > 0) out.push([slot(c - 1, r), 3]);
    return out;
  };
  const startSlot = rnd.int(N);
  const inTree = new Set([startSlot]);
  const dist = new Map([[startSlot, 0]]);
  const frontier = near(startSlot).map(([j]) => [startSlot, j]);
  while (inTree.size < N) {
    const k = rnd.int(frontier.length);
    const [a, b] = frontier.splice(k, 1)[0];
    if (inTree.has(b)) continue;
    inTree.add(b); link(a, b); dist.set(b, dist.get(a) + 1);
    for (const [j] of near(b)) if (!inTree.has(j)) frontier.push([b, j]);
  }
  const degree = (i) => near(i).filter(([j]) => linked(i, j)).length;

  // 2. who is what: the way in, the way on (stairs, or the deep chest on the last floor) at the far end,
  //    maybe a camp, maybe one hidden room on a leaf
  const far = [...dist.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const role = new Array(N).fill('room');
  role[startSlot] = 'start';
  role[far] = last ? 'vault' : 'stairs';
  const free = () => rnd.shuffle([...Array(N).keys()].filter(i => role[i] === 'room'));
  if (depth >= t.floor.campFrom && rnd() < t.floor.campChance) { const c = free()[0]; if (c !== undefined) role[c] = 'camp'; }
  let secretSlot = -1;
  if (rnd() < (area.secret ?? 0.5)) {
    const leaf = free().find(i => degree(i) === 1);
    if (leaf !== undefined) { role[leaf] = 'secret'; secretSlot = leaf; }
  }
  // loops: extra corridors between neighbours that aren't joined yet (never into the hidden room)
  let loops = area.loops ?? 2;
  for (const i of rnd.shuffle([...Array(N).keys()])) {
    if (loops <= 0) break;
    if (i === secretSlot) continue;
    const cand = near(i).filter(([j]) => !linked(i, j) && j !== secretSlot);
    if (cand.length) { link(i, rnd.pick(cand)[0]); loops--; }
  }

  // 3. a hand-made room for every slot, with doors where its corridors are
  const all = Object.entries(data.rooms).map(([id, r]) => ({ id, ...r, sides: sidesOf(r) }));
  // a rare room: at most one a floor, and only now and then
  const plainSlots = [...Array(N).keys()].filter(i => role[i] === 'room');
  const rareSlot = plainSlots.length && rnd() < (area.rare ?? 0.1) ? rnd.pick(plainSlots) : -1;
  const placed = [];
  const things = [];
  const doorAt = {}; // slot → { side: [x, y] }
  for (let i = 0; i < N; i++) {
    const need = near(i).filter(([j]) => linked(i, j)).map(([, d]) => SIDES[d]);
    const fits = (r) => need.every(s => r.sides[s]);
    let pool = all.filter(r => has(r, role[i]) && fits(r));
    if (role[i] === 'room') {
      const rare = pool.filter(r => r.rare), plain = pool.filter(r => !r.rare);
      pool = rare.length && i === rareSlot ? rare : plain;
    }
    if (!pool.length) pool = all.filter(r => has(r, 'room') && !r.rare && fits(r)); // a plain room always fits
    const room = rnd.weighted(pool);
    const rw = room.rows[0].length, rh = room.rows.length;
    const ox = 1 + (i % cols) * P + (S - rw) / 2, oy = 1 + Math.floor(i / cols) * P + (S - rh) / 2;
    doorAt[i] = {};
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const c = room.rows[y][x], gx = ox + x, gy = oy + y, at = gy * w + gx;
      if (c === '#') continue;
      if (c === '+') {
        const side = y === 0 ? 'n' : y === rh - 1 ? 's' : x === 0 ? 'w' : 'e';
        if (need.includes(side)) { cells[at] = i === secretSlot ? SECRET : DOOR; doorAt[i][side] = [gx, gy]; }
        continue;
      }
      cells[at] = FLOOR;
      const id = `${depth}:${gx},${gy}`;
      if (c === 'E') { if (rnd() < t.floor.foeChance) things.push({ id, kind: 'foe', x: gx, y: gy, foes: group(data, area, depth, rnd, t, false) }); }
      else if (c === 'B') things.push({ id, kind: 'foe', x: gx, y: gy, big: true, foes: group(data, area, depth, rnd, t, true) });
      else if (c === 'C') things.push({ id, kind: 'chest', x: gx, y: gy });
      else if (c === 'V') things.push({ id, kind: 'vault', x: gx, y: gy });
      else if (c === 'T') things.push({ id, kind: 'terminal', x: gx, y: gy });
      else if (c === '^') things.push({ id, kind: 'trap', x: gx, y: gy });
      else if (c === 'R') things.push({ id, kind: 'camp', x: gx, y: gy });
      else if (c === '>') things.push({ id, kind: 'stairs', x: gx, y: gy });
      else if (c === '<') things.push({ id, kind: 'exit', x: gx, y: gy });
      else if (c === '?') things.push({ id, kind: 'odd', x: gx, y: gy });
    }
    placed.push({ slot: i, id: room.id, role: role[i], x: ox, y: oy, w: rw, h: rh, rare: !!room.rare });
  }

  // 4. corridors: straight from door to door (both sit on their slot's middle line)
  for (const e of edges) {
    const [a, b] = e.split('|').map(Number);
    const horizontal = Math.floor(a / cols) === Math.floor(b / cols);
    const [x1, y1] = doorAt[a][horizontal ? 'e' : 's'], [x2, y2] = doorAt[b][horizontal ? 'w' : 'n'];
    if (horizontal) for (let x = x1 + 1; x < x2; x++) cells[y1 * w + x] = FLOOR;
    else for (let y = y1 + 1; y < y2; y++) cells[y * w + x1] = FLOOR;
  }

  const exit = things.find(th => th.kind === 'exit');
  // face a way that isn't a wall
  let dir = 0;
  for (let d = 0; d < 4; d++) if (cells[(exit.y + DY[d]) * w + exit.x + DX[d]] !== WALL) { dir = d; break; }
  const index = new Map(things.map(th => [th.y * w + th.x, th]));
  return { area: areaId, depth, seed, last, w, h, cells, things, index, rooms: placed, start: { x: exit.x, y: exit.y, d: dir }, half };
}

// which cells can be walked to from the start. secrets: also through hidden doors.
// passFoes: creatures don't block (they can be beaten or slipped past after backing off)
export function reach(floor, { secrets = false } = {}) {
  const { w, h, cells } = floor;
  const blocked = new Set(floor.things.filter(t => ['chest', 'vault', 'terminal'].includes(t.kind)).map(t => t.y * w + t.x));
  const seen = new Set();
  const stack = [floor.start.y * w + floor.start.x];
  while (stack.length) {
    const at = stack.pop();
    if (seen.has(at)) continue;
    const c = cells[at];
    if (c === WALL || (c === SECRET && !secrets) || blocked.has(at)) continue;
    seen.add(at);
    const x = at % w, y = (at - x) / w;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx >= 0 && ny >= 0 && nx < w && ny < h) stack.push(ny * w + nx); }
  }
  return seen;
}

// can this thing be used from a cell in `cells` (stood on, or faced from next to it)?
export function usable(floor, thing, cells) {
  const at = thing.y * floor.w + thing.x;
  if (cells.has(at)) return true;
  return [0, 1, 2, 3].some(d => cells.has((thing.y + DY[d]) * floor.w + thing.x + DX[d]));
}

// a floor as text, for the lab's log and for eyeballing in tests
export function ascii(floor, { pos } = {}) {
  const mark = { foe: 'E', chest: 'C', vault: 'V', terminal: 'T', trap: '^', camp: 'R', stairs: '>', exit: '<', odd: '?' };
  const rows = [];
  for (let y = 0; y < floor.h; y++) {
    let r = '';
    for (let x = 0; x < floor.w; x++) {
      const th = floor.things.find(t => t.x === x && t.y === y);
      const c = floor.cells[y * floor.w + x];
      r += pos && pos.x === x && pos.y === y ? '@' : th ? mark[th.kind] : c === WALL ? '#' : c === DOOR ? '+' : c === SECRET ? 'S' : '.';
    }
    rows.push(r);
  }
  return rows.join('\n');
}
