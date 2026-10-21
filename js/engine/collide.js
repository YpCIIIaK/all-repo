'use strict';
/* ==========================================================================
   Физлаб · движок · обнаружение столкновений (узкая фаза)
   Многоугольник/многоугольник: SAT + отсечение рёбер (до 2 точек контакта).
   Нормаль манифольда направлена от тела A к телу B.
   ========================================================================== */

class ContactPoint {
  constructor() {
    this.rAx = 0; this.rAy = 0; this.rBx = 0; this.rBy = 0; // плечи от центров масс (мировая ориентация)
    this.lAx = 0; this.lAy = 0; this.lBx = 0; this.lBy = 0; // те же плечи в локальных осях тел
    this.sep = 0; this.id = 0;
    this.ni = 0; this.ti = 0;     // накопленные импульсы: нормальный и касательный
    this.nm = 0; this.tm = 0;     // эффективные массы
    this.rv = 0; this.maxNi = 0;  // скорость сближения до решения (для отскока)
  }
}

class Manifold {
  constructor(a, b) {
    this.a = a; this.b = b;
    this.nx = 0; this.ny = 1;
    this.count = 0;
    this.pts = [new ContactPoint(), new ContactPoint()];
    this.stamp = 0;
    this.friction = 0; this.restitution = 0; this.hard = false;
    this.rolling = 0; this.rollMass = 0; this.ri = 0; // сопротивление качению (для кругов)
  }
}

function _setPoint(p, a, b, px, py, sep, id) {
  p.rAx = px - a.x; p.rAy = py - a.y;
  p.rBx = px - b.x; p.rBy = py - b.y;
  p.sep = sep; p.id = id;
}

function collideCircles(a, b, m, spec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ra = a.shape.radius, rb = b.shape.radius;
  const maxD = ra + rb + spec, d2 = dx * dx + dy * dy;
  if (d2 > maxD * maxD) return 0;
  const d = Math.sqrt(d2);
  let nx = 0, ny = 1;
  if (d > 1e-9) { nx = dx / d; ny = dy / d; }
  const sep = d - ra - rb;
  const px = a.x + nx * (ra + sep * 0.5), py = a.y + ny * (ra + sep * 0.5);
  m.nx = nx; m.ny = ny;
  _setPoint(m.pts[0], a, b, px, py, sep, 0);
  return 1;
}

function collidePolyCircle(a, b, m, spec) {
  const v = a.wv, n = a.wn, cnt = a.shape.count, r = b.shape.radius;
  const cx = b.x, cy = b.y;
  let best = -Infinity, bi = 0;
  for (let i = 0; i < cnt; i++) {
    const s = n[2 * i] * (cx - v[2 * i]) + n[2 * i + 1] * (cy - v[2 * i + 1]);
    if (s > best) { best = s; bi = i; }
  }
  if (best > r + spec) return 0;
  const i2 = (bi + 1) % cnt;
  const v1x = v[2 * bi], v1y = v[2 * bi + 1], v2x = v[2 * i2], v2y = v[2 * i2 + 1];
  let nx = n[2 * bi], ny = n[2 * bi + 1], sep = best - r;
  if (best > 1e-9) {
    const u1 = (cx - v1x) * (v2x - v1x) + (cy - v1y) * (v2y - v1y);
    const u2 = (cx - v2x) * (v1x - v2x) + (cy - v2y) * (v1y - v2y);
    if (u1 <= 0 || u2 <= 0) {
      const vx = u1 <= 0 ? v1x : v2x, vy = u1 <= 0 ? v1y : v2y;
      const dx = cx - vx, dy = cy - vy, d = Math.hypot(dx, dy);
      if (d > r + spec) return 0;
      if (d > 1e-9) { nx = dx / d; ny = dy / d; }
      sep = d - r;
    }
  }
  const px = cx - nx * (r + sep * 0.5), py = cy - ny * (r + sep * 0.5);
  m.nx = nx; m.ny = ny;
  _setPoint(m.pts[0], a, b, px, py, sep, 0);
  return 1;
}

let _sepEdge = 0;
function _maxSeparation(A, B) {
  const na = A.shape.count, nb = B.shape.count, va = A.wv, nA = A.wn, vb = B.wv;
  let best = -Infinity, bestI = 0;
  for (let i = 0; i < na; i++) {
    const nx = nA[2 * i], ny = nA[2 * i + 1], vx = va[2 * i], vy = va[2 * i + 1];
    let si = Infinity;
    for (let j = 0; j < nb; j++) {
      const d = nx * (vb[2 * j] - vx) + ny * (vb[2 * j + 1] - vy);
      if (d < si) si = d;
    }
    if (si > best) { best = si; bestI = i; }
  }
  _sepEdge = bestI;
  return best;
}

function collidePolys(a, b, m, spec) {
  const sepA = _maxSeparation(a, b); const edgeA = _sepEdge;
  if (sepA > spec) return 0;
  const sepB = _maxSeparation(b, a); const edgeB = _sepEdge;
  if (sepB > spec) return 0;

  let ref, inc, edge, flip;
  if (sepB > sepA + 0.1 * PHYS.LINEAR_SLOP) { ref = b; inc = a; edge = edgeB; flip = 1; }
  else { ref = a; inc = b; edge = edgeA; flip = 0; }

  const rc = ref.shape.count, rv = ref.wv, rn = ref.wn;
  const i2 = (edge + 1) % rc;
  const v11x = rv[2 * edge], v11y = rv[2 * edge + 1], v12x = rv[2 * i2], v12y = rv[2 * i2 + 1];
  const nx = rn[2 * edge], ny = rn[2 * edge + 1];

  // Ребро «падающего» тела, наиболее противонаправленное опорной нормали
  const ic = inc.shape.count, iv = inc.wv, inn = inc.wn;
  let minDot = Infinity, ie = 0;
  for (let j = 0; j < ic; j++) {
    const d = nx * inn[2 * j] + ny * inn[2 * j + 1];
    if (d < minDot) { minDot = d; ie = j; }
  }
  const j2 = (ie + 1) % ic;
  let ax = iv[2 * ie], ay = iv[2 * ie + 1], bx = iv[2 * j2], by = iv[2 * j2 + 1];

  // Отсечение боковыми плоскостями опорного ребра
  const tl = Math.hypot(v12x - v11x, v12y - v11y) || 1;
  const tx = (v12x - v11x) / tl, ty = (v12y - v11y) / tl;
  let da = tx * (ax - v11x) + ty * (ay - v11y), db = tx * (bx - v11x) + ty * (by - v11y);
  if (da < 0 && db < 0) return 0;
  if (da < 0) { const t = da / (da - db); ax += t * (bx - ax); ay += t * (by - ay); }
  else if (db < 0) { const t = db / (db - da); bx += t * (ax - bx); by += t * (ay - by); }
  da = tx * (ax - v12x) + ty * (ay - v12y); db = tx * (bx - v12x) + ty * (by - v12y);
  if (da > 0 && db > 0) return 0;
  if (da > 0) { const t = da / (da - db); ax += t * (bx - ax); ay += t * (by - ay); }
  else if (db > 0) { const t = db / (db - da); bx += t * (ax - bx); by += t * (ay - by); }

  const baseId = (flip << 12) | (edge << 6) | (ie << 1);
  let count = 0;
  const sa = nx * (ax - v11x) + ny * (ay - v11y);
  if (sa <= spec) {
    _setPoint(m.pts[count++], a, b, ax - nx * sa * 0.5, ay - ny * sa * 0.5, sa, baseId);
  }
  const sb = nx * (bx - v11x) + ny * (by - v11y);
  if (sb <= spec) {
    _setPoint(m.pts[count++], a, b, bx - nx * sb * 0.5, by - ny * sb * 0.5, sb, baseId | 1);
  }
  if (flip) { m.nx = -nx; m.ny = -ny; } else { m.nx = nx; m.ny = ny; }
  return count;
}

/** Обновить манифольд пары тел с сохранением импульсов совпавших точек (warm start). */
function updateManifold(m, spec) {
  const a = m.a, b = m.b, oc = m.count;
  const p0 = m.pts[0], p1 = m.pts[1];
  const id0 = oc > 0 ? p0.id : -1, n0 = p0.ni, t0 = p0.ti;
  const id1 = oc > 1 ? p1.id : -1, n1 = p1.ni, t1 = p1.ti;
  let cnt;
  if (a.shape.type === 'circle') cnt = collideCircles(a, b, m, spec);
  else if (b.shape.type === 'circle') cnt = collidePolyCircle(a, b, m, spec);
  else cnt = collidePolys(a, b, m, spec);
  m.count = cnt;
  for (let k = 0; k < cnt; k++) {
    const p = m.pts[k];
    if (p.id === id0) { p.ni = n0; p.ti = t0; }
    else if (p.id === id1) { p.ni = n1; p.ti = t1; }
    else { p.ni = 0; p.ti = 0; }
  }
  return cnt;
}
