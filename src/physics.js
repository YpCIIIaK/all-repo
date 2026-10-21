/* ==========================================================================
   Физлаб 3D · физика поверх Rapier (WebAssembly)
   Хранит «описание» каждого тела (форма, материал, цвет), чтобы сцену можно
   было сохранить, отменить шаг или пересоздать тело с другими параметрами.
   ========================================================================== */

import RAPIER from '../vendor/rapier/rapier.mjs';
import { randomColor } from './data.js';

export { RAPIER };
export async function initPhysics() { await RAPIER.init(); }

/* ------------------------------ кватернионы ------------------------------ */

export const Q = {
  id: () => ({ x: 0, y: 0, z: 0, w: 1 }),
  mul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  },
  conj: a => ({ x: -a.x, y: -a.y, z: -a.z, w: a.w }),
  rot(q, v) { // повернуть вектор v кватернионом q
    const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
    return { x: v.x + q.w * tx + (q.y * tz - q.z * ty), y: v.y + q.w * ty + (q.z * tx - q.x * tz), z: v.z + q.w * tz + (q.x * ty - q.y * tx) };
  },
  fromEuler(x, y, z) { // порядок XYZ, радианы
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 };
  },
  toEuler(q) { // XYZ
    const m11 = 1 - 2 * (q.y * q.y + q.z * q.z), m12 = 2 * (q.x * q.y - q.w * q.z), m13 = 2 * (q.x * q.z + q.w * q.y);
    const m22 = 1 - 2 * (q.x * q.x + q.z * q.z), m23 = 2 * (q.y * q.z - q.w * q.x), m32 = 2 * (q.y * q.z + q.w * q.x), m33 = 1 - 2 * (q.x * q.x + q.y * q.y);
    const y = Math.asin(Math.max(-1, Math.min(1, m13)));
    if (Math.abs(m13) < 0.9999999) return { x: Math.atan2(-m23, m33), y, z: Math.atan2(-m12, m11) };
    return { x: Math.atan2(m32, m22), y, z: 0 };
  },
  axisAngle(ax, a) { const s = Math.sin(a / 2); return { x: ax.x * s, y: ax.y * s, z: ax.z * s, w: Math.cos(a / 2) }; },
  /** Поворот, переводящий единичный вектор a в единичный вектор b. */
  between(a, b) {
    const d = a.x * b.x + a.y * b.y + a.z * b.z;
    if (d < -0.999999) { const ax = Math.abs(a.x) < 0.9 ? { x: 0, y: -a.z, z: a.y } : { x: a.z, y: 0, z: -a.x }; const l = Math.hypot(ax.x, ax.y, ax.z); return { x: ax.x / l, y: ax.y / l, z: ax.z / l, w: 0 }; }
    const c = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    const q = { x: c.x, y: c.y, z: c.z, w: 1 + d }, l = Math.hypot(q.x, q.y, q.z, q.w);
    return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
  },
  norm(q) { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; },
  same: (a, b) => Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) > 0.99999,
};
const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
  len: a => Math.hypot(a.x, a.y, a.z),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
  copy: a => ({ x: a.x, y: a.y, z: a.z }),
};
export { V };

/* ------------------------------ формы ------------------------------ */

export const SHAPE_NAMES = { box: 'Ящик', ball: 'Шар', cylinder: 'Цилиндр', capsule: 'Капсула', cone: 'Конус' };

export function shapeVolume(kind, s) {
  switch (kind) {
    case 'box': return s.w * s.h * s.d;
    case 'ball': return 4 / 3 * Math.PI * s.r ** 3;
    case 'cylinder': return Math.PI * s.r * s.r * s.h;
    case 'cone': return Math.PI * s.r * s.r * s.h / 3;
    case 'capsule': return Math.PI * s.r * s.r * s.h + 4 / 3 * Math.PI * s.r ** 3;
  }
  return 1;
}
/** Радиус описанной сферы — для подсветки, камеры и взрывов. */
export function shapeBound(kind, s) {
  switch (kind) {
    case 'box': return Math.hypot(s.w, s.h, s.d) / 2;
    case 'ball': return s.r;
    case 'capsule': return s.h / 2 + s.r;
    default: return Math.hypot(s.r, s.h / 2);
  }
}
/** Полувысота формы вдоль оси Y её собственной системы (для установки на поверхность). */
export function shapeHalfY(kind, s) {
  switch (kind) {
    case 'box': return s.h / 2;
    case 'ball': return s.r;
    case 'capsule': return s.h / 2 + s.r;
    default: return s.h / 2;
  }
}

function colliderDesc(kind, s) {
  switch (kind) {
    case 'box': return RAPIER.ColliderDesc.cuboid(s.w / 2, s.h / 2, s.d / 2);
    case 'ball': return RAPIER.ColliderDesc.ball(s.r);
    case 'cylinder': return RAPIER.ColliderDesc.cylinder(s.h / 2, s.r);
    case 'capsule': return RAPIER.ColliderDesc.capsule(s.h / 2, s.r);
    case 'cone': return RAPIER.ColliderDesc.cone(s.h / 2, s.r);
  }
  throw new Error('Неизвестная форма ' + kind);
}

/* ------------------------------ тело ------------------------------ */

let nextId = 1, nextJointId = 1;

export class Obj {
  constructor(o) {
    this.id = o.id || nextId++;
    if (this.id >= nextId) nextId = this.id + 1;
    this.kind = o.kind;
    this.size = { ...o.size };
    this.crot = o.crot ? { ...o.crot } : Q.id();   // поворот формы относительно тела
    this.isStatic = !!o.isStatic;
    this.ground = !!o.ground;                       // пол — рисуется отдельно
    this.glass = !!o.glass;                         // прозрачная стенка
    this.density = o.density ?? 1;
    this.friction = o.friction ?? 0.5;
    this.restitution = o.restitution ?? 0.1;
    this.color = o.color === undefined ? (this.isStatic ? null : randomColor()) : o.color;
    this.label = o.label || '';
    this.trail = !!o.trail;
    this.fixedRotation = !!o.fixedRotation;
    this.gravityScale = o.gravityScale ?? 1;
    this.damping = o.damping || 0;
    this.ccd = !!o.ccd;
    this.rb = null; this.col = null;
    // предыдущее и текущее состояние для интерполяции кадров
    this.p0 = { x: 0, y: 0, z: 0 }; this.q0 = Q.id();
    this.p = { x: o.pos?.x || 0, y: o.pos?.y || 0, z: o.pos?.z || 0 }; this.q = o.rot ? Q.norm(o.rot) : Q.id();
    this.trailBuf = null; this.trailLen = 0;
    this.sleeping = false;
  }
  get volume() { return shapeVolume(this.kind, this.size); }
  get mass() { return this.density * this.volume; }
  get bound() { return shapeBound(this.kind, this.size); }
  get name() { return SHAPE_NAMES[this.kind] || 'Тело'; }
  /** Поворот формы в мире. */
  get shapeRot() { return Q.mul(this.q, this.crot); }
  toLocal(pw) { return Q.rot(Q.conj(this.q), V.sub(pw, this.p)); }
  toWorld(pl) { return V.add(this.p, Q.rot(this.q, pl)); }
  vel() { return this.rb ? this.rb.linvel() : { x: 0, y: 0, z: 0 }; }
  angvel() { return this.rb ? this.rb.angvel() : { x: 0, y: 0, z: 0 }; }
  pushTrail() {
    if (!this.trailBuf) { this.trailBuf = new Float32Array(900); this.trailLen = 0; }
    const b = this.trailBuf, cap = b.length / 3;
    if (this.trailLen === cap) { b.copyWithin(0, 3); this.trailLen--; }
    const i = this.trailLen * 3;
    b[i] = this.p.x; b[i + 1] = this.p.y; b[i + 2] = this.p.z;
    this.trailLen++;
  }
  clearTrail() { this.trailLen = 0; }
}

/* ------------------------------ мир ------------------------------ */

export class Physics {
  constructor() {
    this.world = null;
    this.objs = [];
    this.joints = [];
    this.byHandle = new Map();
    this.gravity = { x: 0, y: -9.81, z: 0 };
    this.iterations = 4;
    this.airDrag = 0.02;
    this.allowSleep = true;
    this.mutualGravity = false;
    this.G = 1;
    this.time = 0;
    this.stepMs = 0;
    this.drive = { fwd: 0, turn: 0 };
    this.killY = -120;
    this.onRemove = null;
    this.reset();
  }

  reset() {
    for (const o of this.objs) { o.rb = null; o.col = null; }
    for (const j of this.joints) j.raw = null;
    if (this.world) this.world.free();
    this.world = new RAPIER.World(this.gravity);
    this.world.timestep = 1 / 60;
    this.world.integrationParameters.numSolverIterations = this.iterations;
    this.groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.objs = []; this.joints = []; this.byHandle.clear();
    this.time = 0;
  }

  setGravity(g) { this.gravity = { ...g }; this.world.gravity = this.gravity; this.wakeAll(); }
  setIterations(n) { this.iterations = Math.max(1, Math.min(32, n | 0)); this.world.integrationParameters.numSolverIterations = this.iterations; }
  setAirDrag(v) { this.airDrag = v; for (const o of this.objs) this._applyDamping(o); }
  _applyDamping(o) {
    if (!o.rb || o.isStatic) return;
    o.rb.setLinearDamping(this.airDrag + o.damping);
    o.rb.setAngularDamping(this.airDrag * 0.5 + o.damping + 0.12);
  }

  /* ---------------------------- тела ---------------------------- */

  add(o, state = {}) {
    const isObj = o instanceof Obj, obj = isObj ? o : new Obj(o);
    this._build(obj, { linvel: (!isObj && o.vel) || state.linvel, angvel: (!isObj && o.angvel) || state.angvel, sleeping: state.sleeping });
    this.objs.push(obj);
    return obj;
  }

  _build(obj, st = {}) {
    const W = this.world;
    const d = obj.isStatic ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
    d.setTranslation(obj.p.x, obj.p.y, obj.p.z).setRotation(obj.q);
    if (!obj.isStatic) {
      if (st.linvel) d.setLinvel(st.linvel.x, st.linvel.y, st.linvel.z);
      if (st.angvel) d.setAngvel(st.angvel);
      d.setGravityScale(obj.gravityScale).setCanSleep(true).setCcdEnabled(obj.ccd);
      if (obj.fixedRotation) d.lockRotations();
    }
    const rb = W.createRigidBody(d);
    const cd = colliderDesc(obj.kind, obj.size)
      .setRotation(obj.crot)
      .setDensity(obj.density).setFriction(obj.friction).setRestitution(obj.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    obj.col = W.createCollider(cd, rb);
    obj.rb = rb;
    this.byHandle.set(rb.handle, obj);
    this._applyDamping(obj);
    if (st.sleeping && !obj.isStatic) rb.sleep();
    obj.p0 = V.copy(obj.p); obj.q0 = { ...obj.q };
  }

  /** Пересоздать тело (новая форма, статичность, фиксация вращения) с сохранением соединений. */
  rebuild(obj, defs, sync = true) {
    if (sync) this._sync(obj);
    if (!defs) defs = this._defsOf(obj);
    const st = obj.rb && !obj.isStatic ? { linvel: obj.rb.linvel(), angvel: obj.rb.angvel() } : {};
    this._destroy(obj);
    this._build(obj, st);
    this._depth = (this._depth || 0) + 1;
    for (const d of defs) this.addJointFromWorld(d, d.id);
    this._depth--;
    this.wakeNear(obj);
  }

  _defsOf(obj) { return this.joints.filter(j => j.a === obj || j.b === obj).map(j => this.jointWorldDef(j)); }

  _destroy(obj) {
    this.joints = this.joints.filter(j => j.a !== obj && j.b !== obj);
    if (obj.rb) { this.byHandle.delete(obj.rb.handle); this.world.removeRigidBody(obj.rb); }
    obj.rb = null; obj.col = null;
  }

  remove(obj) {
    const i = this.objs.indexOf(obj);
    if (i < 0) return;
    this.wakeNear(obj);
    this._destroy(obj);
    this.objs.splice(i, 1);
    if (this.onRemove) this.onRemove(obj);
  }

  updateMaterial(obj) {
    if (!obj.col) return;
    obj.col.setDensity(obj.density);
    obj.col.setFriction(obj.friction);
    obj.col.setRestitution(obj.restitution);
    if (!obj.isStatic) { obj.rb.setGravityScale(obj.gravityScale, true); this._applyDamping(obj); obj.rb.wakeUp(); }
    for (const j of this.joints) if ((j.a === obj || j.b === obj) && j.type === 'spring') this.rebuildJoint(j);
  }

  setPose(obj, p, q) {
    if (p) obj.p = V.copy(p);
    if (q) obj.q = Q.norm(q);
    obj.p0 = V.copy(obj.p); obj.q0 = { ...obj.q };
    obj.rb.setTranslation(obj.p, true);
    obj.rb.setRotation(obj.q, true);
    this.wakeNear(obj);
  }

  setVelocity(obj, v, w) {
    if (obj.isStatic) return;
    if (v) obj.rb.setLinvel(v, true);
    if (w) obj.rb.setAngvel(w, true);
  }

  _sync(obj) {
    if (!obj.rb) return;
    const t = obj.rb.translation(), r = obj.rb.rotation();
    obj.p = { x: t.x, y: t.y, z: t.z }; obj.q = { x: r.x, y: r.y, z: r.z, w: r.w };
  }

  /** Сменить систему координат тела на q, сохранив форму на месте (нужно для осей шарниров). */
  rebase(obj, q) {
    if (Q.same(obj.q, q)) return;
    this._sync(obj);
    const defs = this._defsOf(obj);
    obj.crot = Q.norm(Q.mul(Q.mul(Q.conj(q), obj.q), obj.crot));
    obj.q = Q.norm(q);
    this.rebuild(obj, defs, false);
  }

  wake(obj) { if (obj && obj.rb && !obj.isStatic) obj.rb.wakeUp(); }
  wakeAll() { for (const o of this.objs) this.wake(o); }
  wakeNear(obj, extra = 0.6) {
    const r = obj.bound + extra;
    for (const o of this.objs) {
      if (o.isStatic) continue;
      if (V.len(V.sub(o.p, obj.p)) < r + o.bound) this.wake(o);
    }
  }

  /* --------------------------- соединения --------------------------- */

  /**
   * Создать соединение. Точки и ось — в мировых координатах.
   * type: spring | rope | ball | hinge | weld
   */
  addJointFromWorld(d, id) {
    const a = d.a || null, b = d.b;
    if (!b || (a && !this.objs.includes(a)) || !this.objs.includes(b)) return null;
    if (d.type === 'hinge' && (this._depth || 0) < 24) {
      // ось шарнира в Rapier общая для обоих тел: выравниваем систему координат тела b под a
      const qa = a ? a.q : Q.id();
      if (!Q.same(b.q, qa)) {
        const other = this.joints.some(j => j.type === 'hinge' && (j.a === b || j.b === b));
        if (other && a && !this.joints.some(j => j.type === 'hinge' && (j.a === a || j.b === a))) this.rebase(a, b.q);
        else this.rebase(b, qa);
      }
    }
    const la = a ? a.toLocal(d.pa) : V.copy(d.pa);
    const lb = b.toLocal(d.pb);
    const j = {
      id: id || nextJointId++, type: d.type, a, b, la, lb,
      axis: d.axis ? V.norm(a ? Q.rot(Q.conj(a.q), d.axis) : d.axis) : { x: 0, y: 0, z: 1 },
      length: d.length ?? V.len(V.sub(d.pb, d.pa)),
      hertz: d.hertz ?? 2, damping: d.damping ?? 0.3,
      motor: !!d.motor, speed: d.speed ?? 3, power: d.power ?? 30, drive: d.drive || '', reverse: !!d.reverse,
      limit: !!d.limit, lower: d.lower ?? -Math.PI / 4, upper: d.upper ?? Math.PI / 4,
      contacts: d.contacts ?? (d.type === 'spring' || d.type === 'rope'),
      hidden: !!d.hidden,
      qa: a ? { ...a.q } : Q.id(), qb: { ...b.q }, // ориентации при сварке
      raw: null, _cmd: null,
    };
    if (id && id >= nextJointId) nextJointId = id + 1;
    if (d.qa) j.qa = d.qa;
    if (d.qb) j.qb = d.qb;
    this._makeRaw(j);
    this.joints.push(j);
    return j;
  }

  /** Создать соединение из сохранённых локальных данных (без выравнивания тел). */
  addJointLocal(j) {
    j.id = j.id || nextJointId++;
    if (j.id >= nextJointId) nextJointId = j.id + 1;
    j.raw = null; j._cmd = null;
    this._makeRaw(j);
    this.joints.push(j);
    return j;
  }

  _makeRaw(j) {
    const A = j.a ? j.a.rb : this.groundBody, B = j.b.rb;
    let data;
    switch (j.type) {
      case 'spring': {
        const mA = j.a && !j.a.isStatic ? j.a.mass : 0, mB = j.b.isStatic ? 0 : j.b.mass;
        const m = mA && mB ? mA * mB / (mA + mB) : (mA || mB || 1);
        const w = 2 * Math.PI * j.hertz;
        data = RAPIER.JointData.spring(j.length, m * w * w, 2 * j.damping * m * w, j.la, j.lb);
        break;
      }
      case 'rope': data = RAPIER.JointData.rope(j.length, j.la, j.lb); break;
      case 'ball': data = RAPIER.JointData.spherical(j.la, j.lb); break;
      case 'hinge': data = RAPIER.JointData.revolute(j.la, j.lb, j.axis); break;
      case 'weld': data = RAPIER.JointData.fixed(j.la, Q.conj(j.qa), j.lb, Q.conj(j.qb)); break;
      default: return;
    }
    j.raw = this.world.createImpulseJoint(data, A, B, true);
    j.raw.setContactsEnabled(!!j.contacts);
    if (j.type === 'hinge') {
      if (j.limit) j.raw.setLimits(j.lower, j.upper);
      this._motor(j, true);
    }
  }

  _motor(j, force) {
    if (j.type !== 'hinge' || !j.raw) return;
    let v = 0, f = 0;
    if (j.motor) {
      let k = 1;
      if (j.drive) {
        const d = this.drive;
        k = d.fwd + (j.drive === 'L' ? d.turn : j.drive === 'R' ? -d.turn : 0);
        k = Math.max(-1, Math.min(1, k));
      }
      v = j.speed * k * (j.reverse ? -1 : 1);
      f = j.power;
    }
    const cmd = v + ':' + f;
    if (!force && cmd === j._cmd) return;
    j._cmd = cmd;
    j.raw.configureMotorVelocity(v, f);
    if (j.motor) { this.wake(j.b); this.wake(j.a); }
  }

  rebuildJoint(j) {
    if (j.raw) this.world.removeImpulseJoint(j.raw, true);
    j._cmd = null;
    this._makeRaw(j);
  }

  removeJoint(j) {
    const i = this.joints.indexOf(j);
    if (i < 0) return;
    this.joints.splice(i, 1);
    if (j.raw && j.b.rb) this.world.removeImpulseJoint(j.raw, true);
    this.wake(j.a); this.wake(j.b);
  }

  jointWorldDef(j) {
    const pa = j.a ? j.a.toWorld(j.la) : V.copy(j.la), pb = j.b.toWorld(j.lb);
    const axis = j.a ? Q.rot(j.a.q, j.axis) : V.copy(j.axis);
    const d = { ...j, pa, pb, axis, raw: null };
    delete d.qa; delete d.qb; // сварка запомнит текущую взаимную ориентацию
    return d;
  }

  anchorsWorld(j) {
    return { pa: j.a ? j.a.toWorld(j.la) : V.copy(j.la), pb: j.b.toWorld(j.lb) };
  }

  /* --------------------------- запросы --------------------------- */

  raycast(origin, dir, maxDist = 1000, includeStatic = true) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined, undefined,
      includeStatic ? undefined : (c) => { const o = this.byHandle.get(c.parent()?.handle); return !!o && !o.isStatic; });
    if (!hit) return null;
    const obj = this.byHandle.get(hit.collider.parent()?.handle) || null;
    const t = hit.timeOfImpact;
    return { obj, dist: t, point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t }, normal: { ...hit.normal } };
  }

  /* --------------------------- воздействия --------------------------- */

  explode(p, radius, power) {
    for (const o of this.objs) {
      if (o.isStatic) continue;
      const d = V.sub(o.p, p), dist = V.len(d);
      if (dist > radius + o.bound) continue;
      const fall = Math.max(0, 1 - Math.max(0, dist - o.bound) / radius);
      const n = dist > 1e-4 ? V.scale(d, 1 / dist) : { x: 0, y: 1, z: 0 };
      const area = Math.PI * o.bound * o.bound + 0.05;
      const imp = V.scale(n, power * fall * area * 3);
      o.rb.applyImpulseAtPoint(imp, V.add(o.p, { x: (Math.random() - 0.5) * o.bound * 0.4, y: (Math.random() - 0.5) * o.bound * 0.4, z: (Math.random() - 0.5) * o.bound * 0.4 }), true);
    }
  }

  attract(p, radius, power, dt) {
    for (const o of this.objs) {
      if (o.isStatic) continue;
      const d = V.sub(p, o.p), dist = V.len(d);
      if (dist > radius || dist < 1e-3) continue;
      const m = o.rb.mass(), k = power * (1 - dist / radius) / Math.max(dist, 0.3);
      const v = o.rb.linvel();
      const imp = {
        x: (d.x * k - v.x * 0.6 * Math.abs(power) / 30) * m * dt,
        y: (d.y * k - v.y * 0.6 * Math.abs(power) / 30 - this.gravity.y * 0.0) * m * dt,
        z: (d.z * k - v.z * 0.6 * Math.abs(power) / 30) * m * dt,
      };
      o.rb.applyImpulse(imp, true);
    }
  }

  _mutual(dt) {
    const os = this.objs, n = os.length, G = this.G;
    const f = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = os[i];
      for (let k = i + 1; k < n; k++) {
        const b = os[k];
        if (a.isStatic && b.isStatic) continue;
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
        const r2 = dx * dx + dy * dy + dz * dz + 0.05;
        const s = G * a.mass * b.mass / (r2 * Math.sqrt(r2));
        f[i * 3] += s * dx; f[i * 3 + 1] += s * dy; f[i * 3 + 2] += s * dz;
        f[k * 3] -= s * dx; f[k * 3 + 1] -= s * dy; f[k * 3 + 2] -= s * dz;
      }
    }
    // импульс v += a·dt перед шагом: так орбиты устойчивы при любом числе итераций решателя
    for (let i = 0; i < n; i++) {
      const o = os[i];
      if (o.isStatic) continue;
      const k = o.rb.mass() / Math.max(1e-9, o.mass) * dt;
      o.rb.applyImpulse({ x: f[i * 3] * k, y: f[i * 3 + 1] * k, z: f[i * 3 + 2] * k }, true);
    }
  }

  /* ------------------------------ шаг ------------------------------ */

  step(dt) {
    const t0 = performance.now();
    this.world.timestep = dt;
    if (this.mutualGravity) this._mutual(dt);
    for (const j of this.joints) if (j.motor) this._motor(j, false);
    if (!this.allowSleep || this.mutualGravity) for (const o of this.objs) if (!o.isStatic) o.rb.wakeUp();
    this.world.step();
    this.time += dt;
    const os = this.objs;
    for (let i = os.length - 1; i >= 0; i--) {
      const o = os[i];
      o.p0.x = o.p.x; o.p0.y = o.p.y; o.p0.z = o.p.z;
      o.q0.x = o.q.x; o.q0.y = o.q.y; o.q0.z = o.q.z; o.q0.w = o.q.w;
      if (o.isStatic) continue;
      o.sleeping = o.rb.isSleeping();
      if (o.sleeping) { o.calm = 0; continue; }
      const t = o.rb.translation(), r = o.rb.rotation();
      // дожимаем сон: тело, которое больше секунды почти не движется, засыпает само,
      // даже если где-то в той же куче что-то слегка шевелится
      if (this.allowSleep && !this.mutualGravity) {
        const v = o.rb.linvel(), w = o.rb.angvel();
        const sp = v.x * v.x + v.y * v.y + v.z * v.z, sw = (w.x * w.x + w.y * w.y + w.z * w.z) * o.bound * o.bound;
        if (sp < 0.0225 && sw < 0.0225) { o.calm = (o.calm || 0) + dt; if (o.calm > 1) { o.rb.sleep(); o.calm = 0; } }
        else o.calm = 0;
      }
      o.p.x = t.x; o.p.y = t.y; o.p.z = t.z;
      o.q.x = r.x; o.q.y = r.y; o.q.z = r.z; o.q.w = r.w;
      if (t.y < this.killY) this.remove(o);
    }
    this.stepMs = this.stepMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  energy() {
    let ke = 0, pe = 0;
    const g = this.gravity;
    for (const o of this.objs) {
      if (o.isStatic || !o.rb) continue;
      const m = o.rb.mass(), v = o.rb.linvel();
      ke += 0.5 * m * (v.x * v.x + v.y * v.y + v.z * v.z);
      pe -= m * o.gravityScale * (g.x * o.p.x + g.y * o.p.y + g.z * o.p.z);
    }
    return { ke, pe };
  }
}
