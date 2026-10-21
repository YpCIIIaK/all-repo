'use strict';
/* ==========================================================================
   Физлаб · движок · ядро
   Единицы: метры, килограммы, секунды. Ось Y направлена вверх.
   ========================================================================== */

const PHYS = {
  LINEAR_SLOP: 0.005,          // допустимое взаимопроникновение, м
  SPECULATIVE: 0.02,           // базовая дистанция «упреждающих» контактов, м
  AABB_MARGIN: 0.04,           // запас габаритных рамок, м
  MAX_SPEED: 150,              // ограничение скорости, м/с
  SLEEP_SPEED: 0.05,           // порог «покоя», м/с
  TIME_TO_SLEEP: 0.5,          // сколько секунд покоя до засыпания
  PUSHOUT: 3,                  // макс. скорость выталкивания при проникновении, м/с
  RESTITUTION_THRESHOLD: 1,    // ниже этой скорости удара отскока нет, м/с
  MAX_POLY_VERTS: 16,
  ROLLING: 0.04,               // коэффициент сопротивления качению кругов
};

/** Параметры мягкого ограничения (Box2D v3 «soft step»). Пишет в out без аллокаций. */
function makeSoft(out, hertz, zeta, h) {
  if (hertz <= 0) { out.biasRate = 0; out.massScale = 1; out.impulseScale = 0; return out; }
  const omega = 2 * Math.PI * hertz;
  const a1 = 2 * zeta + h * omega;
  const a2 = h * omega * a1;
  const a3 = 1 / (1 + a2);
  out.biasRate = omega / a1;
  out.massScale = a2 * a3;
  out.impulseScale = a3;
  return out;
}

const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#66d9e8'];
function randomColor() { return PALETTE[(Math.random() * PALETTE.length) | 0]; }

/** Осветлить (f > 0) или затемнить (f < 0) цвет #rrggbb. */
function shadeColor(hex, f) {
  let c = String(hex).replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const n = parseInt(c, 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return '#' + ((1 << 24) | ((r | 0) << 16) | ((g | 0) << 8) | (b | 0)).toString(16).slice(1);
}

/* ---------------------------------- Формы --------------------------------- */

function convexHull(points) {
  const p = points.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-10) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-10) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper); // против часовой стрелки
}

const Shapes = {
  circle(r) {
    r = Math.max(0.02, r);
    return { type: 'circle', kind: 'circle', radius: r, bound: r, area: Math.PI * r * r, unitI: 0.5 * Math.PI * r * r * r * r };
  },

  /**
   * Выпуклый многоугольник по произвольным точкам (берётся выпуклая оболочка).
   * Вершины сдвигаются так, чтобы центр масс был в (0,0); сдвиг — в shape.cx/cy.
   */
  polygon(points, meta) {
    let hull = convexHull(points);
    if (hull.length > PHYS.MAX_POLY_VERTS) {
      const step = hull.length / PHYS.MAX_POLY_VERTS;
      hull = Array.from({ length: PHYS.MAX_POLY_VERTS }, (_, i) => hull[Math.floor(i * step)]);
    }
    if (hull.length < 3) return Shapes.box(0.2, 0.2);
    const n = hull.length;
    const ox = hull[0][0], oy = hull[0][1];
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = hull[i][0] - ox, y1 = hull[i][1] - oy, x2 = hull[j][0] - ox, y2 = hull[j][1] - oy;
      const cr = x1 * y2 - x2 * y1;
      area += cr * 0.5;
      cx += (x1 + x2) * cr / 6;
      cy += (y1 + y2) * cr / 6;
    }
    if (area < 1e-6) return Shapes.box(0.2, 0.2);
    cx = cx / area + ox; cy = cy / area + oy;
    const verts = new Float64Array(n * 2), normals = new Float64Array(n * 2);
    let bound = 0, I = 0;
    for (let i = 0; i < n; i++) {
      verts[2 * i] = hull[i][0] - cx;
      verts[2 * i + 1] = hull[i][1] - cy;
      bound = Math.max(bound, Math.hypot(verts[2 * i], verts[2 * i + 1]));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = verts[2 * i], y1 = verts[2 * i + 1], x2 = verts[2 * j], y2 = verts[2 * j + 1];
      const ex = x2 - x1, ey = y2 - y1, el = Math.hypot(ex, ey) || 1;
      normals[2 * i] = ey / el;
      normals[2 * i + 1] = -ex / el;
      const cr = x1 * y2 - x2 * y1;
      I += cr * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2) / 12;
    }
    const shape = { type: 'poly', kind: 'poly', count: n, verts, normals, bound, area, unitI: I, cx, cy };
    if (meta) Object.assign(shape, meta);
    return shape;
  },

  box(w, h) {
    w = Math.max(0.02, w); h = Math.max(0.02, h);
    const s = Shapes.polygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { kind: 'box', w, h });
    s.cx = 0; s.cy = 0;
    return s;
  },

  regular(n, r) {
    n = Math.max(3, Math.min(PHYS.MAX_POLY_VERTS, n | 0)); r = Math.max(0.03, r);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + i * 2 * Math.PI / n;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const s = Shapes.polygon(pts, { kind: 'regular', n, r });
    s.cx = 0; s.cy = 0;
    return s;
  },
};

/* ---------------------------------- Тела ---------------------------------- */

let _nextBodyId = 1;

class Body {
  constructor(o) {
    if (o.id) { this.id = o.id; if (o.id >= _nextBodyId) _nextBodyId = o.id + 1; }
    else this.id = _nextBodyId++;
    this.x = o.x || 0; this.y = o.y || 0; this.angle = o.angle || 0;
    this.vx = o.vx || 0; this.vy = o.vy || 0; this.w = o.w || 0;
    this.c = 1; this.s = 0;
    this.px = this.x; this.py = this.y; this.pa = this.angle; // для интерполяции кадров
    this.fx = 0; this.fy = 0; this.torque = 0;
    this.isStatic = !!o.isStatic;
    this.density = o.density ?? 1;
    this.friction = o.friction ?? 0.5;
    this.restitution = o.restitution ?? 0.1;
    this.fixedRotation = !!o.fixedRotation;
    this.gravityScale = o.gravityScale ?? 1;
    this.linearDamping = o.linearDamping || 0;
    this.angularDamping = o.angularDamping || 0;
    this.noCollide = !!o.noCollide;
    this.trail = !!o.trail;
    this.label = o.label || '';
    this.sleeping = false; this.sleepTime = 0;
    this.svx = 0; this.svy = 0; this.sw = 0; // сглаженные скорости для засыпания
    this.im = 0; this.ii = 0; this.awake = false; this._ui = 0; // данные решателя
    this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0; // точная рамка
    this.bx0 = 0; this.by0 = 0; this.bx1 = 0; this.by1 = 0;     // «толстая» рамка
    this.trailBuf = null; this.trailHead = 0; this.trailLen = 0;
    this.setColor(o.color === undefined ? (this.isStatic ? null : randomColor()) : o.color);
    this.setShape(o.shape);
  }

  setShape(shape) {
    this.shape = shape;
    if (shape.type === 'poly') {
      this.wv = new Float64Array(shape.count * 2);
      this.wn = new Float64Array(shape.count * 2);
    } else { this.wv = null; this.wn = null; }
    this.computeMass();
    this.updateWorld();
  }

  computeMass() {
    const s = this.shape;
    this.area = s.area;
    this.mass = this.density * s.area;
    this.inertia = this.density * s.unitI;
    if (this.isStatic || this.mass <= 0) { this.invMass = 0; this.invI = 0; }
    else {
      this.invMass = 1 / this.mass;
      this.invI = this.fixedRotation || this.inertia <= 0 ? 0 : 1 / this.inertia;
    }
  }

  setStatic(v) {
    this.isStatic = !!v;
    if (this.isStatic) { this.vx = this.vy = this.w = 0; this.sleeping = false; }
    this.computeMass();
  }

  setColor(c) {
    this.color = c || null;
    this.stroke = c ? shadeColor(c, -0.38) : null;
  }

  updateWorld() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    this.c = c; this.s = s;
    const sh = this.shape, x = this.x, y = this.y;
    if (sh.type === 'circle') {
      const r = sh.radius;
      this.minX = x - r; this.maxX = x + r; this.minY = y - r; this.maxY = y + r;
    } else {
      const v = sh.verts, nn = sh.normals, wv = this.wv, wn = this.wn;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0, n = sh.count * 2; i < n; i += 2) {
        const lx = v[i], ly = v[i + 1];
        const wx = x + c * lx - s * ly, wy = y + s * lx + c * ly;
        wv[i] = wx; wv[i + 1] = wy;
        wn[i] = c * nn[i] - s * nn[i + 1]; wn[i + 1] = s * nn[i] + c * nn[i + 1];
        if (wx < x0) x0 = wx; if (wx > x1) x1 = wx;
        if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
      }
      this.minX = x0; this.minY = y0; this.maxX = x1; this.maxY = y1;
    }
    const m = PHYS.AABB_MARGIN;
    this.bx0 = this.minX - m; this.by0 = this.minY - m; this.bx1 = this.maxX + m; this.by1 = this.maxY + m;
  }

  /** Мировые координаты → локальные координаты тела. */
  toLocal(wx, wy) {
    const dx = wx - this.x, dy = wy - this.y;
    return { x: this.c * dx + this.s * dy, y: -this.s * dx + this.c * dy };
  }

  containsPoint(px, py) {
    if (px < this.minX || px > this.maxX || py < this.minY || py > this.maxY) return false;
    const sh = this.shape;
    if (sh.type === 'circle') {
      const dx = px - this.x, dy = py - this.y;
      return dx * dx + dy * dy <= sh.radius * sh.radius;
    }
    const v = this.wv, n = this.wn;
    for (let i = 0, k = sh.count * 2; i < k; i += 2) {
      if (n[i] * (px - v[i]) + n[i + 1] * (py - v[i + 1]) > 0) return false;
    }
    return true;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get kinetic() { return this.isStatic ? 0 : 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy) + 0.5 * this.inertia * this.w * this.w; }

  pushTrail() {
    if (!this.trailBuf) { this.trailBuf = new Float32Array(600); this.trailHead = 0; this.trailLen = 0; }
    const buf = this.trailBuf, cap = buf.length >> 1;
    buf[this.trailHead * 2] = this.x; buf[this.trailHead * 2 + 1] = this.y;
    this.trailHead = (this.trailHead + 1) % cap;
    if (this.trailLen < cap) this.trailLen++;
  }
  clearTrail() { this.trailLen = 0; this.trailHead = 0; }
}
