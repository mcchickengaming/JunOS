// her picture for the desktop settings window's Touch feedback preview,
// taken by whichever of her pages has her loaded (the desktop page and
// her main window both serve it). same origin, so localStorage is shared:
// the settings window writes WANT when it opens the tab, a page with her
// loaded answers with a fresh picture in KEY.
//
// the model's bounds are much bigger than what you see of her (hidden
// parts count too), so the picture is trimmed to her visible pixels, then
// cropped from the top of her head down to her waist. where her face is
// comes from the rig's face drawables (geometry.js faceBox), stored as
// shares of the picture so the preview can put effects on her face.

import { app, model } from '../live2d/state.js?v=75';
import { faceBox } from '../live2d/geometry.js?v=82';

export const KEY = 'desktop.snapshot';
export const WANT = 'desktop.snapshot.want';
const OUT_H = 360;    // the stored picture's height
const SCAN_H = 900;   // the size the trimming works at
const CROP = 0.5;     // the top half of her: head, shoulders, chest

export function take() {
  if (!app || !model) return false;
  try {
    const full = app.renderer.extract.canvas(model);
    if (!full.width || !full.height) return false;
    const b = model.getBounds();
    // work at a sensible size
    const k = Math.min(1, SCAN_H / full.height);
    const sw = Math.max(1, Math.round(full.width * k)), sh = Math.max(1, Math.round(full.height * k));
    const scan = document.createElement('canvas');
    scan.width = sw;
    scan.height = sh;
    const g = scan.getContext('2d', { willReadFrequently: true });
    g.drawImage(full, 0, 0, sw, sh);
    // the box round her visible pixels
    const px = g.getImageData(0, 0, sw, sh).data;
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (px[(y * sw + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return false;
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    // her face, in scan px: from the rig if it can, else a guess from her shape
    const toScan = sw / b.width; // client px -> scan px
    const vr = app.view.getBoundingClientRect();
    const fb = faceBox();
    let face;
    if (fb && fb.right > fb.left) {
      face = {
        x: (((fb.left + fb.right) / 2) - vr.left - b.x) * toScan,
        y: (((fb.top + fb.bottom) / 2) - vr.top - b.y) * toScan,
        w: (fb.right - fb.left) * toScan,
      };
    } else {
      face = { x: x0 + tw / 2, y: y0 + th * 0.1, w: Math.max(tw * 0.3, th * 0.1) };
    }
    // the crop: her top half, at least down past her face, as wide as she is there
    const cy0 = y0;
    const ch = Math.max(th * CROP, (face.y - y0) * 2.6);
    const cropH = Math.min(th, ch);
    let cx0 = sw, cx1 = -1;
    for (let y = Math.floor(cy0); y < Math.min(sh, cy0 + cropH); y++) {
      for (let x = 0; x < sw; x++) {
        if (px[(y * sw + x) * 4 + 3] > 12) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; }
      }
    }
    // a little room round her
    const pad = Math.round(cropH * 0.03);
    cx0 = Math.max(0, cx0 - pad);
    cx1 = Math.min(sw - 1, cx1 + pad);
    const cw = cx1 - cx0 + 1;
    const top = Math.max(0, cy0 - pad);
    const h = Math.min(sh - top, cropH + pad);
    const out = document.createElement('canvas');
    const ok = OUT_H / h;
    out.width = Math.max(1, Math.round(cw * ok));
    out.height = OUT_H;
    out.getContext('2d').drawImage(scan, cx0, top, cw, h, 0, 0, out.width, out.height);
    const snap = {
      v: 2, // trimmed to her visible pixels (older ones had her tiny in a corner)
      img: out.toDataURL('image/webp', 0.9),
      at: Date.now(),
      fx: (face.x - cx0) / cw,          // share of the picture's width
      fy: (face.y - top) / h,           // the rest: shares of its height
      headW: (face.w * 1.25) / h,
      modelW: tw / h,
      modelH: th / h,
    };
    localStorage.setItem(KEY, JSON.stringify(snap));
    return true;
  } catch (e) {
    console.warn('snapshot failed', e);
    return false;
  }
}

// answer the settings window, and keep the picture fresh now and then.
// isReady: whether her model is loaded and dressed
let timer = null;
export function serve(isReady) {
  const soon = (ms = 300) => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (isReady()) take(); }, ms);
  };
  window.addEventListener('storage', (e) => { if (e.key === WANT) soon(); });
  soon(2500);
  setInterval(() => soon(), 15 * 60 * 1000);
  return soon;
}
