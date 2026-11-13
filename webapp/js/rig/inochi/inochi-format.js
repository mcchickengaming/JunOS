// Reading and writing Inochi2D puppet files (.inp / .inx).
//
// Written for Jun OS from the public Inochi2D format, with the Inox2D
// (https://github.com/Inochi2D/inox2d) and Inochi2D
// (https://github.com/Inochi2D/inochi2d) sources as the reference. Both are
// BSD 2-Clause; their notices are in NOTICE.
//
// The file:
//   "TRNSRTS\0"  u32be json length  json
//   "TEX_SECT"   u32be count, then per texture: u32be length, u8 encoding
//                (0 png, 1 tga, 2 bc7), bytes
//   "EXT_SECT"   optional vendor data (u32be count; name, payload), ignored here
//
// Nothing in here touches the DOM or PIXI, so it runs under node for tests.

const MAGIC = 'TRNSRTS\0';
const TEX = 'TEX_SECT';
const EXT = 'EXT_SECT';

export const TEX_PNG = 0;
export const TEX_TGA = 1;
export const TEX_BC7 = 2;

function ascii(bytes, at, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[at + i]);
  return s;
}

// -> { json, textures: [{ encoding, data: Uint8Array }], ext: [{ name, data }] }
export function parseInp(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || ascii(bytes, 0, 8) !== MAGIC) throw new Error('Not an Inochi2D puppet (bad header)');
  let at = 8;
  const need = (n, what) => { if (at + n > bytes.length) throw new Error(`Puppet file is cut short (${what})`); };
  const jsonLen = view.getUint32(at); at += 4;
  need(jsonLen, 'json');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + jsonLen)));
  at += jsonLen;

  const textures = [];
  if (at + 8 <= bytes.length && ascii(bytes, at, 8) === TEX) {
    at += 8;
    need(4, 'texture count');
    const count = view.getUint32(at); at += 4;
    for (let i = 0; i < count; i++) {
      need(5, `texture ${i}`);
      const len = view.getUint32(at); at += 4;
      const encoding = bytes[at]; at += 1;
      need(len, `texture ${i}`);
      textures.push({ encoding, data: bytes.subarray(at, at + len) });
      at += len;
    }
  }

  const ext = [];
  if (at + 8 <= bytes.length && ascii(bytes, at, 8) === EXT) {
    at += 8;
    const count = view.getUint32(at); at += 4;
    for (let i = 0; i < count && at + 4 <= bytes.length; i++) {
      const nameLen = view.getUint32(at); at += 4;
      const name = new TextDecoder().decode(bytes.subarray(at, at + nameLen)); at += nameLen;
      const len = view.getUint32(at); at += 4;
      ext.push({ name, data: bytes.subarray(at, at + len) });
      at += len;
    }
  }
  return { json, textures, ext };
}

// the other way round, for tests and for saving a generated puppet
export function encodeInp({ json, textures = [] }) {
  const body = new TextEncoder().encode(JSON.stringify(json));
  let size = 8 + 4 + body.length + 8 + 4;
  for (const t of textures) size += 5 + t.data.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const put = (s) => { for (let i = 0; i < s.length; i++) out[at++] = s.charCodeAt(i); };
  put(MAGIC);
  view.setUint32(at, body.length); at += 4;
  out.set(body, at); at += body.length;
  put(TEX);
  view.setUint32(at, textures.length); at += 4;
  for (const t of textures) {
    view.setUint32(at, t.data.length); at += 4;
    out[at++] = t.encoding;
    out.set(t.data, at); at += t.data.length;
  }
  return out;
}

// TGA as Inochi Creator writes it: true colour (2) or run-length (10),
// 24 or 32 bit, either row order. -> { width, height, pixels: RGBA bytes }
export function decodeTga(data) {
  const idLen = data[0], mapType = data[1], type = data[2];
  const width = data[12] | (data[13] << 8), height = data[14] | (data[15] << 8);
  const bpp = data[16], desc = data[17];
  if (mapType !== 0 || (type !== 2 && type !== 10 && type !== 3 && type !== 11)) throw new Error(`TGA type ${type} isn't supported`);
  const grey = type === 3 || type === 11;
  const bytesPer = bpp >> 3;
  if (!(grey ? bytesPer === 1 || bytesPer === 2 : bytesPer === 3 || bytesPer === 4)) throw new Error(`TGA with ${bpp} bits isn't supported`);
  const n = width * height;
  const pixels = new Uint8Array(n * 4);
  let at = 18 + idLen;
  const put = (i, src) => {
    const o = i * 4;
    if (grey) { pixels[o] = pixels[o + 1] = pixels[o + 2] = data[src]; pixels[o + 3] = bytesPer === 2 ? data[src + 1] : 255; }
    else { pixels[o] = data[src + 2]; pixels[o + 1] = data[src + 1]; pixels[o + 2] = data[src]; pixels[o + 3] = bytesPer === 4 ? data[src + 3] : 255; }
  };
  if (type === 2 || type === 3) {
    if (at + n * bytesPer > data.length) throw new Error('TGA is cut short');
    for (let i = 0; i < n; i++, at += bytesPer) put(i, at);
  } else {
    let i = 0;
    while (i < n) {
      if (at >= data.length) throw new Error('TGA is cut short');
      const head = data[at++];
      const count = (head & 0x7f) + 1;
      if (head & 0x80) {
        for (let k = 0; k < count && i < n; k++) put(i++, at);
        at += bytesPer;
      } else {
        for (let k = 0; k < count && i < n; k++, at += bytesPer) put(i++, at);
      }
    }
  }
  // bit 5 clear = rows run bottom to top
  if (!(desc & 0x20)) {
    const row = width * 4, tmp = new Uint8Array(row);
    for (let y = 0; y < height >> 1; y++) {
      const a = y * row, b = (height - 1 - y) * row;
      tmp.set(pixels.subarray(a, a + row));
      pixels.copyWithin(a, b, b + row);
      pixels.set(tmp, b);
    }
  }
  if (desc & 0x10) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width >> 1; x++) {
        const a = (y * width + x) * 4, b = (y * width + width - 1 - x) * 4;
        for (let k = 0; k < 4; k++) { const t = pixels[a + k]; pixels[a + k] = pixels[b + k]; pixels[b + k] = t; }
      }
    }
  }
  return { width, height, pixels };
}

// Inochi2D stores colours already multiplied by alpha. A straight-alpha
// texture (colour brighter than its alpha) would get a bright fringe, so
// look before trusting the file. Samples, doesn't read every pixel.
export function looksPremultiplied(pixels) {
  const n = pixels.length >> 2;
  const step = Math.max(1, Math.floor(n / 200000));
  let over = 0, soft = 0;
  for (let i = 0; i < n; i += step) {
    const o = i * 4, a = pixels[o + 3];
    if (a === 0 || a === 255) continue;
    soft++;
    if (pixels[o] > a + 2 || pixels[o + 1] > a + 2 || pixels[o + 2] > a + 2) over++;
  }
  return soft === 0 || over / soft < 0.02;
}

export function premultiply(pixels) {
  for (let o = 0; o < pixels.length; o += 4) {
    const a = pixels[o + 3];
    if (a === 255) continue;
    pixels[o] = (pixels[o] * a + 127) / 255 | 0;
    pixels[o + 1] = (pixels[o + 1] * a + 127) / 255 | 0;
    pixels[o + 2] = (pixels[o + 2] * a + 127) / 255 | 0;
  }
  return pixels;
}
