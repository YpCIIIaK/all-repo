/* ==========================================================================
   Ясень · геометрия: мягкие коробки, подушки, изгиб, сужение, UV в метрах
   ========================================================================== */

import * as THREE from 'three';

/* ---------- скруглённый параллелепипед с сеткой, пригодной для деформаций ---------- */

// Координаты вдоль оси: частые деления на скруглениях, редкие на плоской части.
function axisStops(h, r, m, flat) {
  const out = [];
  for (let k = 0; k < m; k++) out.push(-h + r * (k / m));
  for (let k = 0; k <= flat; k++) out.push(-h + r + (2 * (h - r)) * (k / flat));
  for (let k = m - 1; k >= 0; k--) out.push(h - r * (k / m));
  return out;
}

/**
 * w, h, d — размеры; r — радиус скругления; opt.step — шаг сетки на плоских гранях
 * (нужен мелкий, если геометрию потом деформируют), opt.round — делений на скругление.
 */
export function softBox(w, h, d, r = 0.01, { step = 0, round = 4 } = {}) {
  const half = [w / 2, h / 2, d / 2];
  r = Math.max(0, Math.min(r, Math.min(...half) - 1e-4));
  const m = r > 0 ? round : 0;
  const stops = half.map((hh) => {
    const flat = step ? Math.max(1, Math.ceil((2 * (hh - r)) / step)) : 1;
    return m ? axisStops(hh, r, m, flat) : Array.from({ length: flat + 1 }, (_, k) => -hh + (2 * hh * k) / flat);
  });
  const pos = [], nor = [], idx = [];
  const inner = half.map((hh) => hh - r);
  const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const b = (a + 1) % 3, cc = (a + 2) % 3;
    const B = stops[b], C = stops[cc], base = pos.length / 3;
    for (let j = 0; j < C.length; j++) for (let i = 0; i < B.length; i++) {
      const v = [0, 0, 0];
      v[a] = s * half[a]; v[b] = B[i]; v[cc] = C[j];
      p.set(v[0], v[1], v[2]);
      c.set(
        Math.max(-inner[0], Math.min(inner[0], p.x)),
        Math.max(-inner[1], Math.min(inner[1], p.y)),
        Math.max(-inner[2], Math.min(inner[2], p.z)),
      );
      n.subVectors(p, c);
      if (r > 0 && n.lengthSq() > 1e-12) { n.normalize(); p.copy(c).addScaledVector(n, r); }
      else { n.set(0, 0, 0); n.setComponent(a, s); }
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
    }
    const rowLen = B.length;
    for (let j = 0; j < C.length - 1; j++) for (let i = 0; i < B.length - 1; i++) {
      const q0 = base + j * rowLen + i, q1 = q0 + 1, q2 = q0 + rowLen, q3 = q2 + 1;
      // ось b × ось c = ось a: при s > 0 обход (q0, q1, q3) смотрит наружу
      if (s > 0) idx.push(q0, q1, q3, q0, q3, q2); else idx.push(q0, q3, q1, q0, q2, q3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* ------------------------------ деформации ------------------------------ */

const bbox = (g) => { g.computeBoundingBox(); return g.boundingBox; };

// Подушка: надувает грани к центру. top — по высоте, side — по ширине, front — по глубине.
export function puff(g, top = 0.02, side = 0.01, front = side) {
  const b = bbox(g), P = g.attributes.position;
  const cx = (b.max.x + b.min.x) / 2, cy = (b.max.y + b.min.y) / 2, cz = (b.max.z + b.min.z) / 2;
  const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
  for (let i = 0; i < P.count; i++) {
    const nx = (P.getX(i) - cx) / hx, ny = (P.getY(i) - cy) / hy, nz = (P.getZ(i) - cz) / hz;
    const fx = Math.max(0, 1 - nx * nx), fy = Math.max(0, 1 - ny * ny), fz = Math.max(0, 1 - nz * nz);
    P.setXYZ(i, P.getX(i) + nx * side * fy * fz, P.getY(i) + ny * top * fx * fz, P.getZ(i) + nz * front * fx * fy);
  }
  g.userData.dirty = true;
  return g;
}

// Изгиб вокруг вертикальной оси: центр кривизны в точке z = +R (перед изделия вогнутый).
export function bend(g, R) {
  const P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), th = x / R, rr = R - z;
    P.setXYZ(i, rr * Math.sin(th), P.getY(i), R - rr * Math.cos(th));
    if (N) {
      const nx = N.getX(i), nz = N.getZ(i), c = Math.cos(th), s = Math.sin(th);
      N.setXYZ(i, nx * c - nz * s, N.getY(i), nx * s + nz * c);
    }
  }
  return g;
}

// Сужение к низу по оси y: к нижнему торцу сечение масштабируется в k раз.
export function taper(g, k) {
  const b = bbox(g), P = g.attributes.position, H = b.max.y - b.min.y;
  for (let i = 0; i < P.count; i++) {
    const t = (b.max.y - P.getY(i)) / H, s = 1 + (k - 1) * t;
    P.setX(i, P.getX(i) * s); P.setZ(i, P.getZ(i) * s);
  }
  return g;
}

// Произвольная деформация: fn(v: Vector3) меняет точку на месте.
export function deform(g, fn) {
  const P = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); fn(v); P.setXYZ(i, v.x, v.y, v.z); }
  g.userData.dirty = true;
  return g;
}

/* ------------------------------ нормали и UV ------------------------------ */

// Склейка совпадающих вершин и пересчёт гладких нормалей.
export function smoothNormals(g) {
  const P = g.attributes.position, map = new Map(), out = [], remap = new Uint32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const key = Math.round(x * 2e4) + ',' + Math.round(y * 2e4) + ',' + Math.round(z * 2e4);
    let j = map.get(key);
    if (j === undefined) { j = out.length / 3; map.set(key, j); out.push(x, y, z); }
    remap[i] = j;
  }
  const src = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i);
  const idx = new Array(src.length);
  for (let i = 0; i < src.length; i++) idx[i] = remap[src[i]];
  const s = new THREE.BufferGeometry();
  s.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  s.setIndex(idx);
  s.computeVertexNormals();
  return s;
}

/**
 * Кубическая развёртка в метрах: каждая грань проецируется на плоскость,
 * перпендикулярную её нормали, а волокна (ось v) кладутся вдоль самой длинной оси детали.
 */
export function boxUV(g) {
  const b = bbox(g), size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  const L = size.indexOf(Math.max(...size));
  const P = g.attributes.position, uv = new Float32Array(P.count * 2);
  const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); bb.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    n.subVectors(bb, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const dom = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    let uA = (dom + 1) % 3, vA = (dom + 2) % 3;
    if (uA === L) [uA, vA] = [vA, uA];
    for (let k = 0; k < 3; k++) {
      const vtx = [P.getX(i + k), P.getY(i + k), P.getZ(i + k)];
      uv[(i + k) * 2] = vtx[uA]; uv[(i + k) * 2 + 1] = vtx[vA];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Развёртка 0..1 по прямоугольнику сверху (для ковров).
export function topUV(g) {
  const b = bbox(g), P = g.attributes.position, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    uv[i * 2] = (P.getX(i) - b.min.x) / (b.max.x - b.min.x);
    uv[i * 2 + 1] = 1 - (P.getZ(i) - b.min.z) / (b.max.z - b.min.z);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Готовит геометрию к отрисовке: сглаживание после деформаций, развёртка. */
export function finalize(g, { smooth = g.userData.dirty, uv = 'box' } = {}) {
  if (smooth) g = smoothNormals(g);
  if (uv === 'box') { if (g.index) g = g.toNonIndexed(); boxUV(g); }
  else if (uv === 'top') topUV(g);
  else if (uv === 'keep' && !g.attributes.uv) { if (g.index) g = g.toNonIndexed(); boxUV(g); }
  return g;
}

// Склейка нескольких геометрий (одинаковые атрибуты) в одну.
export function merge(list) {
  list = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv'].filter((n) => list.every((g) => g.attributes[n]));
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].array.length, 0));
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/* ------------------------------ готовые формы ------------------------------ */

// Лейка вращения с профилем [[r, y], ...]; seg — число сегментов по кругу.
export function lathe(profile, seg = 48, start = 0, len = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, start, len);
}

// Профиль диска со скруглённой кромкой: радиус R, толщина t, от y0.
export function discProfile(R, t, y0 = 0, edge = Math.min(t / 2, 0.01)) {
  const pts = [[0, y0]];
  for (let k = 0; k <= 4; k++) { const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2); pts.push([R - edge + Math.cos(a) * edge, y0 + edge + Math.sin(a) * edge]); }
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([R - edge + Math.cos(a) * edge, y0 + t - edge + Math.sin(a) * edge]); }
  pts.push([0, y0 + t]);
  return pts;
}

// Цилиндр между двумя точками.
export function rodGeometry(a, b, r, seg = 12, r2 = r) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
