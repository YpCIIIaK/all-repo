/* ==========================================================================
   Ясень · отделки и материалы
   Все текстуры рисуются процедурно на canvas: никаких внешних картинок.
   ========================================================================== */

import * as THREE from 'three';

/* ------------------------------ каталог отделок ------------------------------ */

export const FABRICS = {
  'linen-milk':      { name: 'Лён · молочный',       hex: '#e2d9c8', type: 'linen' },
  'linen-sand':      { name: 'Лён · песок',          hex: '#c7b293', type: 'linen' },
  'linen-graphite':  { name: 'Лён · графит',         hex: '#4a4946', type: 'linen' },
  'boucle-ivory':    { name: 'Букле · айвори',       hex: '#ebe5d8', type: 'boucle', add: 0.08 },
  'boucle-oat':      { name: 'Букле · овсяный',      hex: '#cdbd9f', type: 'boucle', add: 0.08 },
  'chenille-sky':    { name: 'Шенилл · серо-голубой', hex: '#7c8fa0', type: 'weave', add: 0.05 },
  'mat-mustard':     { name: 'Рогожка · горчица',    hex: '#bf8f2a', type: 'weave', add: 0.04 },
  'velvet-emerald':  { name: 'Велюр · изумруд',      hex: '#1c4a3b', type: 'velvet', add: 0.1 },
  'velvet-terra':    { name: 'Велюр · терракота',    hex: '#a2482a', type: 'velvet', add: 0.1 },
  'velvet-powder':   { name: 'Велюр · пудра',        hex: '#c59c95', type: 'velvet', add: 0.1 },
  'velvet-indigo':   { name: 'Велюр · индиго',       hex: '#27324e', type: 'velvet', add: 0.1 },
  'leather-cognac':  { name: 'Кожа · коньяк',        hex: '#8a4720', type: 'leather', add: 0.35 },
  'leather-black':   { name: 'Кожа · чёрная',        hex: '#211f1e', type: 'leather', add: 0.35 },
};

export const FABRIC_TYPES = { linen: 'Лён', boucle: 'Букле', weave: 'Рогожка и шенилл', velvet: 'Велюр', leather: 'Кожа' };

export const WOODS = {
  'oak':        { name: 'Дуб натуральный',   hex: '#c99d69' },
  'oak-white':  { name: 'Дуб белёный',       hex: '#e2cfb2' },
  'walnut':     { name: 'Американский орех', hex: '#73472f', add: 0.12 },
  'ash-black':  { name: 'Ясень · чёрный',    hex: '#2c2723' },
};

export const METALS = {
  'black': { name: 'Чёрный матовый',    hex: '#1d1c1b' },
  'brass': { name: 'Латунь',            hex: '#c9a25b', add: 0.06 },
  'steel': { name: 'Сталь шлифованная', hex: '#c4c6c8' },
};

export const STONES = {
  'carrara':    { name: 'Мрамор Каррара',     hex: '#ebe9e4' },
  'travertine': { name: 'Травертин',          hex: '#d8c5a4' },
  'verde':      { name: 'Мрамор Верде',       hex: '#22382e', add: 0.08 },
  'nero':       { name: 'Мрамор Неро',        hex: '#1f1f21', add: 0.08 },
};

export const CERAMICS = {
  'cer-white': { name: 'Глазурь · белая',     hex: '#f1ede5' },
  'cer-sage':  { name: 'Глазурь · шалфей',    hex: '#9aa88d' },
  'cer-terra': { name: 'Терракота',           hex: '#b8673f', matte: true },
  'cer-black': { name: 'Глазурь · уголь',     hex: '#2a2928' },
};

export const RUGS = {
  'rug-sand':  { name: 'Песок',    hex: '#d6cdbf', line: '#a99a83' },
  'rug-clay':  { name: 'Глина',    hex: '#b9805f', line: '#8e5a3f' },
  'rug-stone': { name: 'Камень',   hex: '#a9a69f', line: '#7e7b74' },
  'rug-moss':  { name: 'Мох',      hex: '#6f7656', line: '#4f5639' },
};

export const FLOORS = {
  'oak-light': { name: 'Светлый дуб',  tint: [0.86, 0.74, 0.57] },
  'oak':       { name: 'Дуб',          tint: [0.72, 0.55, 0.36] },
  'walnut':    { name: 'Орех',         tint: [0.45, 0.31, 0.22] },
  'concrete':  { name: 'Микроцемент',  tint: [0.70, 0.69, 0.66], concrete: true },
};

export const WALLS = {
  'chalk':  { name: 'Мел',       hex: '#ece7df' },
  'sage':   { name: 'Шалфей',    hex: '#c9cfbf' },
  'clay':   { name: 'Глина',     hex: '#dcc3ad' },
  'stone':  { name: 'Графит',    hex: '#6d6b67' },
};

export const FINISH_SETS = { fabric: FABRICS, wood: WOODS, metal: METALS, stone: STONES, ceramic: CERAMICS, rug: RUGS };

/* ------------------------------ шум ------------------------------ */

function hash(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Периодический value-noise: x в долях решётки, px — период.
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// u, v ∈ [0,1); результат бесшовно повторяется.
function fbm(u, v, px, py, oct, seed) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(u * px * f, v * py * f, px * f, py * f, seed + o * 17);
    n += a; f *= 2; a *= 0.5;
  }
  return s / n;
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/* ------------------------------ canvas → текстура ------------------------------ */

function canvasOf(w, h, fill) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  fill(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, { color = true, rx = 1, ry = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.repeat.set(rx, ry);
  return t;
}

// Карта высот → карта нормалей (бесшовно).
function normalFromHeight(hgt, w, h, strength) {
  return canvasOf(w, h, (d) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = hgt[y * w + (x - 1 + w) % w], r = hgt[y * w + (x + 1) % w];
      const u = hgt[((y - 1 + h) % h) * w + x], dn = hgt[((y + 1) % h) * w + x];
      let nx = -(r - l) * strength, ny = (dn - u) * strength, nz = 1;
      const k = 1 / Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx * k * 0.5 + 0.5) * 255; d[i + 1] = (ny * k * 0.5 + 0.5) * 255; d[i + 2] = (nz * k * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
}

const once = (fn) => { let v; return () => v || (v = fn()); };

/* ------------------------------ процедурные текстуры ------------------------------ */

// Волокна дерева идут вдоль v. Повтор: 0.4 м поперёк, 1.2 м вдоль.
const woodTex = once(() => {
  const W = 512, H = 512, hgt = new Float32Array(W * H);
  const color = canvasOf(W, H, (d) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const warp = fbm(u, v, 3, 2, 4, 11);
      const rings = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 16 + warp * 2.6));
      const streak = fbm(u, v, 96, 3, 3, 23);
      const pore = Math.pow(Math.abs(Math.sin(Math.PI * (u * 42 + fbm(u, v, 6, 2, 3, 5) * 3))), 40);
      let g = 0.83 + 0.09 * rings + 0.12 * (streak - 0.5) - 0.10 * pore;
      g = Math.min(1, Math.max(0.55, g));
      hgt[y * W + x] = rings * 0.6 + streak * 0.6 - pore;
      const i = (y * W + x) * 4, c = g * 255;
      d[i] = c; d[i + 1] = c * 0.985; d[i + 2] = c * 0.965; d[i + 3] = 255;
    }
  });
  return { map: tex(color, { rx: 1 / 0.4, ry: 1 / 1.2 }), normal: tex(normalFromHeight(hgt, W, H, 1.2), { color: false, rx: 1 / 0.4, ry: 1 / 1.2 }) };
});

// Полотняное переплетение для льна и рогожки. Повтор 8 см.
const weaveTex = once(() => {
  const W = 256, cells = 24, hgt = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = x / W * cells, cy = y / W * cells;
    const ix = Math.floor(cx), iy = Math.floor(cy);
    const fx = cx - ix, fy = cy - iy;
    const over = (ix + iy) & 1;
    const prof = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
    const slub = fbm(x / W, y / W, over ? 4 : 32, over ? 32 : 4, 2, 7);
    hgt[y * W + x] = prof * 0.8 + slub * 0.5 + fbm(x / W, y / W, 64, 64, 1, 3) * 0.2;
  }
  return tex(normalFromHeight(hgt, W, W, 1.8), { color: false, rx: 1 / 0.08, ry: 1 / 0.08 });
});

// Букле: петельки разного размера. Повтор 10 см.
const boucleTex = once(() => {
  const W = 256, hgt = new Float32Array(W * W), r = rng(42);
  for (let k = 0; k < 900; k++) {
    const cx = r() * W, cy = r() * W, rad = 2 + r() * 4.5, amp = 0.6 + r() * 0.6;
    const x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dd = Math.hypot(x - cx, y - cy) / rad;
      if (dd > 1.2) continue;
      const ring = Math.exp(-Math.pow((dd - 0.75) * 4, 2));
      const ix = ((x % W) + W) % W, iy = ((y % W) + W) % W;
      hgt[iy * W + ix] = Math.max(hgt[iy * W + ix], ring * amp);
    }
  }
  return tex(normalFromHeight(hgt, W, W, 2.4), { color: false, rx: 1 / 0.1, ry: 1 / 0.1 });
});

// Кожа: мелкая неровная фактура. Повтор 15 см.
const leatherTex = once(() => {
  const W = 256, hgt = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / W;
    const a = fbm(u, v, 24, 24, 3, 91), b = fbm(u, v, 48, 48, 2, 13);
    hgt[y * W + x] = Math.pow(Math.abs(a - 0.5) * 2, 0.6) * 0.7 + b * 0.3;
  }
  return tex(normalFromHeight(hgt, W, W, 1.4), { color: false, rx: 1 / 0.15, ry: 1 / 0.15 });
});

// Велюр: едва заметная неоднородность ворса.
const velvetTex = once(() => {
  const W = 256, hgt = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) hgt[y * W + x] = fbm(x / W, y / W, 8, 8, 4, 77);
  return tex(normalFromHeight(hgt, W, W, 3), { color: false, rx: 1 / 0.35, ry: 1 / 0.35 });
});

const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mix = (a, b, t) => a + (b - a) * t;

const STONE_LOOK = {
  carrara:    { base: '#eceae5', vein: '#8d8f94', veins: 3, sharp: 10, amount: 0.65 },
  verde:      { base: '#1f3229', vein: '#c3d0c2', veins: 4, sharp: 16, amount: 0.8 },
  nero:       { base: '#1c1c1e', vein: '#d8d2c6', veins: 3, sharp: 18, amount: 0.85 },
  travertine: { base: '#d9c6a5', vein: '#b49a73', travertine: true },
};

const stoneTexCache = {};
function stoneTex(id) {
  if (stoneTexCache[id]) return stoneTexCache[id];
  const L = STONE_LOOK[id] || STONE_LOOK.carrara, W = 512;
  const base = hexRGB(L.base), vein = hexRGB(L.vein);
  const pits = new Float32Array(W * W);
  if (L.travertine) {
    const r = rng(9);
    for (let k = 0; k < 260; k++) {
      const cx = r() * W, cy = r() * W, rx = 1 + r() * 5, ry = 0.6 + r() * 1.4;
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dd = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (dd < 1) pits[(((y % W) + W) % W) * W + ((x % W) + W) % W] = Math.max(pits[(((y % W) + W) % W) * W + ((x % W) + W) % W], 1 - dd);
      }
    }
  }
  const c = canvasOf(W, W, (d) => {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      let t, cloud = fbm(u, v, 4, 4, 5, 31);
      if (L.travertine) {
        const band = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 9 + fbm(u, v, 2, 6, 4, 3) * 2.2));
        t = 0.35 * band + 0.25 * fbm(u, v, 64, 6, 2, 8) + 0.6 * pits[y * W + x];
      } else {
        const w1 = fbm(u, v, 3, 3, 5, 12) * 4.5;
        const s = Math.abs(Math.sin(Math.PI * (u * L.veins + v * 2 + w1)));
        const fine = Math.abs(Math.sin(Math.PI * (u * 7 - v * 3 + fbm(u, v, 5, 5, 4, 44) * 6)));
        t = Math.pow(1 - s, L.sharp) * L.amount + Math.pow(1 - fine, 30) * 0.35 + (cloud - 0.5) * 0.18;
      }
      t = Math.max(0, Math.min(1, t));
      const i = (y * W + x) * 4, g = 1 + (cloud - 0.5) * 0.06;
      d[i] = mix(base[0], vein[0], t) * g * 255; d[i + 1] = mix(base[1], vein[1], t) * g * 255; d[i + 2] = mix(base[2], vein[2], t) * g * 255; d[i + 3] = 255;
    }
  });
  return (stoneTexCache[id] = tex(c, { rx: 1 / 0.9, ry: 1 / 0.9 }));
}

// Паркетная доска для интерьера и планировщика. Повтор 2 × 2 м, доски вдоль x.
const floorTexCache = {};
export function floorTex(id) {
  if (floorTexCache[id]) return floorTexCache[id];
  const F = FLOORS[id] || FLOORS.oak, W = 1024, rows = 11, rowH = W / rows, r = rng(5);
  const rowsData = [];
  for (let k = 0; k < rows; k++) {
    const cuts = []; let x = -r() * W * 0.5;
    while (x < W) { cuts.push(x); x += W * (0.35 + r() * 0.45); }
    rowsData.push(cuts.map((cx, i) => ({ x: cx, tint: 0.88 + r() * 0.2, seed: (k * 31 + i) | 0 })));
  }
  const c = canvasOf(W, W, (d) => {
    for (let y = 0; y < W; y++) {
      const row = Math.floor(y / rowH), fy = y - row * rowH, planks = rowsData[row];
      for (let x = 0; x < W; x++) {
        let p = planks[0];
        for (const q of planks) if (q.x <= x) p = q;
        if (x < planks[0].x) p = planks[planks.length - 1];
        const u = x / W, v = y / W;
        let g, gap = fy < 1.6 || Math.abs(x - p.x) < 1.2 ? 0.55 : 1;
        if (F.concrete) {
          g = 0.9 + (fbm(u, v, 6, 6, 5, 4) - 0.5) * 0.25 + (fbm(u, v, 64, 64, 2, 9) - 0.5) * 0.06;
          gap = 1;
        } else {
          const grain = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 160 + fbm(u, v, 3, 12, 3, p.seed) * 3));
          g = p.tint * (0.9 + 0.07 * grain + 0.1 * (fbm(u, v, 8, 96, 2, p.seed + 3) - 0.5));
        }
        const i = (y * W + x) * 4;
        d[i] = Math.min(255, F.tint[0] * g * gap * 255); d[i + 1] = Math.min(255, F.tint[1] * g * gap * 255); d[i + 2] = Math.min(255, F.tint[2] * g * gap * 255); d[i + 3] = 255;
      }
    }
  });
  return (floorTexCache[id] = tex(c, { rx: 0.5, ry: 0.5 }));
}

// Ковёр «Дюна»: волнистые линии тон-в-тон, карта на весь ковёр.
const rugTexCache = {};
function rugTex(id) {
  if (rugTexCache[id]) return rugTexCache[id];
  const R = RUGS[id] || RUGS['rug-sand'], W = 512;
  const a = hexRGB(R.hex), b = hexRGB(R.line);
  const c = canvasOf(W, W, (d) => {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      const f = fbm(u, v, 3, 3, 4, 61);
      const lines = Math.pow(Math.abs(Math.sin(Math.PI * (f * 5 + u * 1.2))), 22);
      const wool = (fbm(u, v, 128, 128, 2, 2) - 0.5) * 0.12;
      const border = Math.min(u, 1 - u, v, 1 - v) < 0.035 ? 1 : 0;
      const t = Math.min(1, lines * 1.0 + border * 0.8);
      const i = (y * W + x) * 4;
      d[i] = (mix(a[0], b[0], t) + wool) * 255; d[i + 1] = (mix(a[1], b[1], t) + wool) * 255; d[i + 2] = (mix(a[2], b[2], t) + wool) * 255; d[i + 3] = 255;
    }
  });
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (rugTexCache[id] = t);
}

/* ------------------------------ материалы ------------------------------ */

const cache = new Map();
const memo = (key, make) => cache.get(key) || (cache.set(key, make()), cache.get(key));
const lighten = (hex, t) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t);

export function fabric(id) {
  const F = FABRICS[id] || FABRICS['linen-milk'];
  return memo('fabric:' + id, () => {
    const m = new THREE.MeshPhysicalMaterial({ color: F.hex, roughness: 0.9 });
    if (F.type === 'velvet') {
      Object.assign(m, { roughness: 0.78, sheen: 1, sheenRoughness: 0.35, normalMap: velvetTex() });
      m.sheenColor = lighten(F.hex, 0.55); m.normalScale.set(0.25, 0.25);
    } else if (F.type === 'leather') {
      Object.assign(m, { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.45, normalMap: leatherTex() });
      m.normalScale.set(0.35, 0.35);
    } else if (F.type === 'boucle') {
      Object.assign(m, { roughness: 1, sheen: 0.4, sheenRoughness: 0.9, normalMap: boucleTex() });
      m.sheenColor = lighten(F.hex, 0.25); m.normalScale.set(0.9, 0.9);
    } else {
      Object.assign(m, { roughness: 0.92, sheen: 0.3, sheenRoughness: 0.8, normalMap: weaveTex() });
      m.sheenColor = lighten(F.hex, 0.2); m.normalScale.set(0.55, 0.55);
    }
    return m;
  });
}

export function wood(id) {
  const F = WOODS[id] || WOODS.oak;
  return memo('wood:' + id, () => {
    const t = woodTex();
    const m = new THREE.MeshStandardMaterial({ color: F.hex, map: t.map, normalMap: t.normal, roughness: id === 'ash-black' ? 0.62 : 0.52 });
    m.normalScale.set(0.22, 0.22);
    return m;
  });
}

export function metal(id) {
  const F = METALS[id] || METALS.black;
  return memo('metal:' + id, () => id === 'black'
    ? new THREE.MeshStandardMaterial({ color: F.hex, metalness: 0.55, roughness: 0.48 })
    : new THREE.MeshStandardMaterial({ color: F.hex, metalness: 1, roughness: id === 'brass' ? 0.3 : 0.24 }));
}

export function stone(id) {
  return memo('stone:' + id, () => new THREE.MeshPhysicalMaterial({
    map: stoneTex(id), roughness: id === 'travertine' ? 0.62 : 0.22, clearcoat: id === 'travertine' ? 0 : 0.35, clearcoatRoughness: 0.2,
  }));
}

export function ceramic(id) {
  const F = CERAMICS[id] || CERAMICS['cer-white'];
  return memo('ceramic:' + id, () => new THREE.MeshPhysicalMaterial(F.matte
    ? { color: F.hex, roughness: 0.75 }
    : { color: F.hex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
}

export function rug(id) {
  return memo('rug:' + id, () => {
    const m = new THREE.MeshPhysicalMaterial({ map: rugTex(id), roughness: 1, sheen: 0.6, sheenRoughness: 0.9, normalMap: boucleTex() });
    m.sheenColor = lighten((RUGS[id] || RUGS['rug-sand']).hex, 0.3);
    m.normalScale.set(0.6, 0.6);
    return m;
  });
}

// Служебные материалы, не настраиваемые покупателем.
export const misc = {
  interior: () => memo('m:interior', () => new THREE.MeshStandardMaterial({ color: '#d9c4a4', roughness: 0.8 })),
  linen: () => memo('m:linen', () => { const m = fabric('linen-milk').clone(); m.color.set('#f2eee6'); return m; }),
  duvet: () => memo('m:duvet', () => { const m = fabric('linen-milk').clone(); m.color.set('#d9cdb9'); return m; }),
  throw: () => memo('m:throw', () => { const m = fabric('linen-milk').clone(); m.color.set('#b0623d'); return m; }),
  rubber: () => memo('m:rubber', () => new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.8 })),
  soil: () => memo('m:soil', () => new THREE.MeshStandardMaterial({ color: '#3b2c22', roughness: 1 })),
  bark: () => memo('m:bark', () => new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.95 })),
  leaf: () => memo('m:leaf', () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide })),
  shadeInner: () => new THREE.MeshStandardMaterial({ color: '#f7f1e6', roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffd9a0', emissiveIntensity: 0 }),
  opal: () => new THREE.MeshPhysicalMaterial({ color: '#f5efe4', roughness: 0.35, emissive: '#ffd8a0', emissiveIntensity: 0, side: THREE.DoubleSide }),
  bulb: () => new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: '#ffe2b0', emissiveIntensity: 0.2 }),
  book: (hex) => memo('m:book' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 })),
  pages: () => memo('m:pages', () => new THREE.MeshStandardMaterial({ color: '#efe8d8', roughness: 0.9 })),
  wall: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95 }),
  floor: (id) => new THREE.MeshStandardMaterial({ map: floorTex(id), roughness: id === 'concrete' ? 0.85 : 0.55 }),
};

export function finishMat(kind, id) {
  return { fabric, wood, metal, stone, ceramic, rug }[kind](id);
}

/* ------------------------------ превью отделок для интерфейса ------------------------------ */

const swatchCache = new Map();
// Маленькая картинка фактуры для кружков-образцов (дерево, камень, ковёр).
export function swatchURL(kind, id) {
  const key = kind + ':' + id;
  if (swatchCache.has(key)) return swatchCache.get(key);
  let src = null;
  if (kind === 'wood') src = woodTex().map.image;
  else if (kind === 'stone') src = stoneTex(id).image;
  else if (kind === 'rug') src = rugTex(id).image;
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  if (kind === 'wood') { g.drawImage(src, 0, 0, 200, 512, 0, 0, 160, 160); }
  else if (kind === 'rug') { g.drawImage(src, 40, 40, 220, 220, 0, 0, 160, 160); }
  else g.drawImage(src, 0, 0, 260, 260, 0, 0, 160, 160);
  const url = c.toDataURL('image/jpeg', 0.82);
  swatchCache.set(key, url);
  return url;
}
