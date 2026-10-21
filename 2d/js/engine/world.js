'use strict';
/* ==========================================================================
   Физлаб · движок · мир
   Шаг: широкая фаза (sweep-and-prune) → узкая фаза → N подшагов
   (интегрирование скоростей, warm start, решение с мягкими ограничениями,
   интегрирование положений, «релакс») → отскок → сон островов.
   ========================================================================== */

class World {
  constructor() {
    this.bodies = [];
    this.joints = [];
    this.gravityX = 0; this.gravityY = -9.81;
    this.substeps = 4;
    this.airDrag = 0.02;
    this.allowSleep = true;
    this.mutualGravity = false;
    this.G = 1;
    this.killY = -400;
    this.motorInput = 0;
    this.time = 0;
    this.stepMs = 0;
    this.ground = {
      isGround: true, id: 0, x: 0, y: 0, angle: 0, c: 1, s: 0, vx: 0, vy: 0, w: 0,
      im: 0, ii: 0, invMass: 0, invI: 0, mass: 0, isStatic: true, sleeping: false, awake: false,
    };
    this.contactMap = new Map();
    this.contacts = [];
    this.noCollidePairs = new Map();
    this.stamp = 0;
    this._sap = [];
    this._awake = [];
    this._dyn = [];
    this._parent = new Int32Array(256);
    this._minSleep = new Float64Array(256);
    this._softC = { biasRate: 0, massScale: 1, impulseScale: 0 };
    this._softS = { biasRate: 0, massScale: 1, impulseScale: 0 };
    this._softJ = { biasRate: 0, massScale: 1, impulseScale: 0 };
    this.onBodyRemoved = null;
    this.onJointBroken = null;
  }

  /* --------------------------- состав мира --------------------------- */

  addBody(b) {
    this.bodies.push(b);
    this._sap.push(b);
    b.px = b.x; b.py = b.y; b.pa = b.angle;
    b.updateWorld();
    return b;
  }

  removeBody(b) {
    const i = this.bodies.indexOf(b);
    if (i < 0) return;
    this.bodies.splice(i, 1);
    const k = this._sap.indexOf(b);
    if (k >= 0) this._sap.splice(k, 1);
    for (let j = this.joints.length - 1; j >= 0; j--) {
      const jt = this.joints[j];
      if (jt.a === b || jt.b === b) this.removeJoint(jt);
    }
    for (const [key, m] of this.contactMap) {
      if (m.a === b || m.b === b) {
        this.wake(m.a === b ? m.b : m.a);
        this.contactMap.delete(key);
      }
    }
    this.contacts = this.contacts.filter(m => m.a !== b && m.b !== b);
    if (this.onBodyRemoved) this.onBodyRemoved(b);
  }

  clear() {
    this.bodies.length = 0; this.joints.length = 0; this._sap.length = 0;
    this.contactMap.clear(); this.contacts.length = 0; this.noCollidePairs.clear();
    this.time = 0;
  }

  static pairKey(a, b) { return a.id < b.id ? a.id * 2097152 + b.id : b.id * 2097152 + a.id; }

  addJoint(j) {
    this.joints.push(j);
    if (!j.collideConnected && !j.a.isGround && j.type !== 'mouse') {
      const key = World.pairKey(j.a, j.b);
      this.noCollidePairs.set(key, (this.noCollidePairs.get(key) || 0) + 1);
      const m = this.contactMap.get(key);
      if (m) { this.contactMap.delete(key); this.contacts = this.contacts.filter(c => c !== m); }
    }
    this.wake(j.a); this.wake(j.b);
    return j;
  }

  removeJoint(j) {
    const i = this.joints.indexOf(j);
    if (i < 0) return;
    this.joints.splice(i, 1);
    if (!j.collideConnected && !j.a.isGround && j.type !== 'mouse') {
      const key = World.pairKey(j.a, j.b);
      const n = (this.noCollidePairs.get(key) || 0) - 1;
      if (n > 0) this.noCollidePairs.set(key, n); else this.noCollidePairs.delete(key);
    }
    this.wake(j.a); this.wake(j.b);
  }

  /** Переключить «соединённые тела сталкиваются» с учётом таблицы исключений. */
  setCollideConnected(j, v) {
    if (j.collideConnected === !!v) return;
    this.removeJoint(j);
    j.collideConnected = !!v;
    this.addJoint(j);
  }

  createDistance(type, a, b, ax, ay, bx, by, o = {}) {
    a = a || this.ground;
    const la = a.isGround ? { x: ax, y: ay } : a.toLocal(ax, ay);
    const lb = b.toLocal(bx, by);
    const len = o.length ?? Math.hypot(bx - ax, by - ay);
    return this.addJoint(new DistanceJoint(type, a, b, { ...o, lax: la.x, lay: la.y, lbx: lb.x, lby: lb.y, length: len }));
  }

  createHinge(a, b, px, py, o = {}) {
    a = a || this.ground;
    const la = a.isGround ? { x: px, y: py } : a.toLocal(px, py);
    const lb = b.toLocal(px, py);
    return this.addJoint(new RevoluteJoint(a, b, { ...o, lax: la.x, lay: la.y, lbx: lb.x, lby: lb.y }));
  }

  /* ----------------------------- сон ----------------------------- */

  wake(b) {
    if (!b || b.isGround || b.isStatic) return;
    b.sleeping = false; b.sleepTime = 0;
    b.svx = 1; b.svy = 0; b.sw = 0;
  }
  wakeAll() { for (const b of this.bodies) this.wake(b); }
  wakeArea(x0, y0, x1, y1) {
    for (const b of this.bodies) {
      if (b.maxX >= x0 && b.minX <= x1 && b.maxY >= y0 && b.minY <= y1) this.wake(b);
    }
  }
  setAllowSleep(v) { this.allowSleep = !!v; if (!v) this.wakeAll(); }

  /* --------------------------- запросы --------------------------- */

  bodyAt(x, y) {
    let stat = null;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.containsPoint(x, y)) { if (!b.isStatic) return b; if (!stat) stat = b; }
    }
    return stat;
  }
  bodiesAt(x, y) {
    const out = [];
    for (let i = this.bodies.length - 1; i >= 0; i--) if (this.bodies[i].containsPoint(x, y)) out.push(this.bodies[i]);
    out.sort((p, q) => (p.isStatic - q.isStatic));
    return out;
  }

  /* ---------------------------- воздействия ---------------------------- */

  explode(x, y, radius, strength) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d > radius + b.shape.bound) continue;
      const fall = Math.max(0, 1 - Math.max(0, d - b.shape.bound) / radius);
      const imp = strength * fall * (b.shape.bound * 2 + 0.2);
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
      this.wake(b);
      b.vx += nx * imp * b.invMass; b.vy += ny * imp * b.invMass;
      b.w += (Math.random() - 0.5) * imp * b.invI * b.shape.bound * 0.3;
    }
  }

  /** Поле притяжения (или отталкивания при strength < 0) к точке. */
  attract(x, y, radius, strength) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
      if (d > radius || d < 1e-4) continue;
      const k = strength * (1 - d / radius) * b.mass / Math.max(d, 0.3);
      this.wake(b);
      b.fx += dx * k; b.fy += dy * k;
      // гасим «орбитальное» кружение для приятного управления
      b.fx -= b.vx * b.mass * 0.8 * Math.abs(strength) / 40;
      b.fy -= b.vy * b.mass * 0.8 * Math.abs(strength) / 40;
    }
  }

  _mutualGravity() {
    const bs = this.bodies, n = bs.length, G = this.G;
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      if (!a.isStatic) a.sleeping = false;
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        if (a.isStatic && b.isStatic) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const r2 = dx * dx + dy * dy + 0.05;
        const f = G * a.mass * b.mass / (r2 * Math.sqrt(r2));
        a.fx += f * dx; a.fy += f * dy;
        b.fx -= f * dx; b.fy -= f * dy;
      }
    }
  }

  /* ------------------------------- шаг ------------------------------- */

  step(dt) {
    const t0 = performance.now();
    const bodies = this.bodies, awake = this._awake;
    awake.length = 0;
    this.stamp++;
    if (this.mutualGravity) this._mutualGravity();

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.px = b.x; b.py = b.y; b.pa = b.angle;
      if (!b.isStatic && !b.sleeping) {
        b.awake = true; b.im = b.invMass; b.ii = b.invI;
        awake.push(b);
        const mx = b.vx * dt, my = b.vy * dt, m = PHYS.AABB_MARGIN;
        b.bx0 = b.minX - m + (mx < 0 ? mx : 0); b.bx1 = b.maxX + m + (mx > 0 ? mx : 0);
        b.by0 = b.minY - m + (my < 0 ? my : 0); b.by1 = b.maxY + m + (my > 0 ? my : 0);
      } else { b.awake = false; b.im = 0; b.ii = 0; }
    }

    this._collide(dt);

    // Будим спящие тела, которых коснулись бодрствующие (до решения — без «каменного» удара)
    const contacts = this.contacts;
    for (let i = 0; i < contacts.length; i++) {
      const m = contacts[i];
      if (m.a.sleeping && m.b.awake) this._wakeNow(m.a);
      else if (m.b.sleeping && m.a.awake) this._wakeNow(m.b);
    }
    const joints = this.joints;
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (j.a.sleeping && j.b.awake) this._wakeNow(j.a);
      else if (j.b.sleeping && j.a.awake) this._wakeNow(j.b);
    }

    const sub = Math.max(1, this.substeps | 0), h = dt / sub, inv_h = 1 / h;
    const contactHertz = Math.min(30, 0.25 * sub / dt);
    makeSoft(this._softC, contactHertz, 10, h);
    makeSoft(this._softS, 2 * contactHertz, 10, h);
    makeSoft(this._softJ, 2 * contactHertz, 2, h);

    this._prepareContacts();
    for (let i = 0; i < joints.length; i++) joints[i].prepare(h, this);

    const gx = this.gravityX, gy = this.gravityY, air = this.airDrag;
    for (let s = 0; s < sub; s++) {
      // скорости
      for (let i = 0; i < awake.length; i++) {
        const b = awake[i];
        const lin = 1 / (1 + h * (air + b.linearDamping)), ang = 1 / (1 + h * (air * 0.5 + b.angularDamping));
        b.vx = (b.vx + h * (gx * b.gravityScale + b.fx * b.invMass)) * lin;
        b.vy = (b.vy + h * (gy * b.gravityScale + b.fy * b.invMass)) * lin;
        b.w = (b.w + h * b.invI * b.torque) * ang;
      }
      for (let i = 0; i < joints.length; i++) joints[i].warmStart();
      this._warmStartContacts();
      for (let i = 0; i < joints.length; i++) joints[i].solve(h, inv_h, true, this._softJ);
      this._solveContacts(inv_h, true);
      // положения
      const maxV = PHYS.MAX_SPEED;
      for (let i = 0; i < awake.length; i++) {
        const b = awake[i];
        const v2 = b.vx * b.vx + b.vy * b.vy;
        if (v2 > maxV * maxV) { const k = maxV / Math.sqrt(v2); b.vx *= k; b.vy *= k; }
        b.x += h * b.vx; b.y += h * b.vy;
        if (b.w !== 0) { b.angle += h * b.w; b.c = Math.cos(b.angle); b.s = Math.sin(b.angle); }
      }
      for (let i = 0; i < joints.length; i++) joints[i].solve(h, inv_h, false, this._softJ);
      this._solveContacts(inv_h, false);
    }
    this._restitution();

    // разрушение соединений
    for (let i = joints.length - 1; i >= 0; i--) {
      const j = joints[i];
      j.force = j.reaction(inv_h);
      if (j.breakForce > 0 && j.force > j.breakForce) {
        this.removeJoint(j);
        if (this.onJointBroken) this.onJointBroken(j);
      }
    }

    // завершение
    for (let i = 0; i < awake.length; i++) {
      const b = awake[i];
      b.fx = 0; b.fy = 0; b.torque = 0;
      b.updateWorld();
      // сглаженная скорость: дрожание с переменным знаком гасится, настоящее движение — нет
      b.svx += (b.vx - b.svx) * 0.2; b.svy += (b.vy - b.svy) * 0.2; b.sw += (b.w - b.sw) * 0.2;
      const sp = Math.sqrt(b.svx * b.svx + b.svy * b.svy) + b.shape.bound * Math.abs(b.sw);
      const raw = b.vx * b.vx + b.vy * b.vy;
      if (sp > PHYS.SLEEP_SPEED || raw > 0.25) b.sleepTime = 0; else b.sleepTime += dt;
    }
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (j.type === 'mouse' || (j.enableMotor && j._speed !== 0)) {
        j.b.sleepTime = 0; if (!j.a.isGround) j.a.sleepTime = 0;
      }
    }
    if (this.allowSleep && !this.mutualGravity) this._updateIslands();

    for (let i = bodies.length - 1; i >= 0; i--) {
      if (bodies[i].y < this.killY) this.removeBody(bodies[i]);
    }

    this.time += dt;
    const ms = performance.now() - t0;
    this.stepMs = this.stepMs * 0.9 + ms * 0.1;
  }

  _wakeNow(b) {
    if (b.isGround || b.isStatic) return;
    b.sleeping = false;
    if (!b.awake) { b.awake = true; b.im = b.invMass; b.ii = b.invI; this._awake.push(b); }
  }

  _collide(dt) {
    const list = this._sap, n = list.length;
    // сортировка вставками по левой границе (почти отсортировано между кадрами)
    for (let i = 1; i < n; i++) {
      const b = list[i], v = b.bx0;
      let j = i - 1;
      while (j >= 0 && list[j].bx0 > v) { list[j + 1] = list[j]; j--; }
      list[j + 1] = b;
    }
    const map = this.contactMap, stamp = this.stamp, contacts = this.contacts, ncp = this.noCollidePairs;
    contacts.length = 0;
    for (let i = 0; i < n; i++) {
      const A = list[i];
      if (A.noCollide) continue;
      const maxX = A.bx1, aw = A.awake;
      for (let j = i + 1; j < n; j++) {
        const B = list[j];
        if (B.bx0 > maxX) break;
        if (!aw && !B.awake) continue;
        if (A.by0 > B.by1 || B.by0 > A.by1 || B.noCollide) continue;
        let a = A, b = B;
        if (a.shape.type === 'circle' ? b.shape.type === 'poly' || a.id > b.id : b.shape.type === 'poly' && a.id > b.id) { a = B; b = A; }
        const key = a.id * 2097152 + b.id;
        const keyN = a.id < b.id ? key : b.id * 2097152 + a.id;
        if (ncp.size && ncp.has(keyN)) continue;
        let m = map.get(key);
        if (!m) { m = new Manifold(a, b); map.set(key, m); }
        m.stamp = stamp;
        const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
        const spec = PHYS.SPECULATIVE + Math.min(3, (Math.hypot(rvx, rvy) + Math.abs(a.w) * a.shape.bound + Math.abs(b.w) * b.shape.bound) * dt);
        if (updateManifold(m, spec) > 0) contacts.push(m);
      }
    }
    if (map.size > contacts.length) {
      for (const [k, m] of map) if (m.stamp !== stamp) map.delete(k);
    }
  }

  _prepareContacts() {
    const cs = this.contacts;
    for (let i = 0; i < cs.length; i++) {
      const m = cs[i], a = m.a, b = m.b;
      const mA = a.im, iA = a.ii, mB = b.im, iB = b.ii;
      m.friction = Math.sqrt(a.friction * b.friction);
      m.restitution = Math.max(a.restitution, b.restitution);
      m.hard = (mA === 0 && iA === 0) || (mB === 0 && iB === 0);
      const ra = a.shape.type === 'circle' ? a.shape.radius : 0, rb = b.shape.type === 'circle' ? b.shape.radius : 0;
      m.rolling = (ra || rb) ? PHYS.ROLLING * Math.max(ra, rb) : 0;
      m.rollMass = iA + iB > 0 ? 1 / (iA + iB) : 0;
      m.ri = 0;
      const nx = m.nx, ny = m.ny, tx = ny, ty = -nx;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const rnA = p.rAx * ny - p.rAy * nx, rnB = p.rBx * ny - p.rBy * nx;
        const kn = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        p.nm = kn > 0 ? 1 / kn : 0;
        const rtA = p.rAx * ty - p.rAy * tx, rtB = p.rBx * ty - p.rBy * tx;
        const kt = mA + mB + iA * rtA * rtA + iB * rtB * rtB;
        p.tm = kt > 0 ? 1 / kt : 0;
        const dvx = (b.vx - b.w * p.rBy) - (a.vx - a.w * p.rAy);
        const dvy = (b.vy + b.w * p.rBx) - (a.vy + a.w * p.rAx);
        p.rv = dvx * nx + dvy * ny;
        p.maxNi = 0;
        p.lAx = a.c * p.rAx + a.s * p.rAy; p.lAy = -a.s * p.rAx + a.c * p.rAy;
        p.lBx = b.c * p.rBx + b.s * p.rBy; p.lBy = -b.s * p.rBx + b.c * p.rBy;
      }
    }
  }

  _warmStartContacts() {
    const cs = this.contacts;
    for (let i = 0; i < cs.length; i++) {
      const m = cs[i], a = m.a, b = m.b;
      const mA = a.im, iA = a.ii, mB = b.im, iB = b.ii, nx = m.nx, ny = m.ny;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const px = p.ni * nx + p.ti * ny, py = p.ni * ny - p.ti * nx;
        a.vx -= mA * px; a.vy -= mA * py; a.w -= iA * (p.rAx * py - p.rAy * px);
        b.vx += mB * px; b.vy += mB * py; b.w += iB * (p.rBx * py - p.rBy * px);
      }
    }
  }

  _solveContacts(inv_h, useBias) {
    const cs = this.contacts, softC = this._softC, softS = this._softS;
    for (let i = 0; i < cs.length; i++) {
      const m = cs[i], a = m.a, b = m.b;
      const mA = a.im, iA = a.ii, mB = b.im, iB = b.ii;
      const soft = m.hard ? softS : softC;
      const nx = m.nx, ny = m.ny, tx = ny, ty = -nx;
      let vAx = a.vx, vAy = a.vy, wA = a.w, vBx = b.vx, vBy = b.vy, wB = b.w;
      const ac = a.c, as = a.s, bc = b.c, bs = b.s;
      const cnt = m.count;
      for (let k = 0; k < cnt; k++) {
        const p = m.pts[k];
        // текущее разделение по повёрнутым якорям
        const cAx = ac * p.lAx - as * p.lAy, cAy = as * p.lAx + ac * p.lAy;
        const cBx = bc * p.lBx - bs * p.lBy, cBy = bs * p.lBx + bc * p.lBy;
        const s = ((b.x + cBx) - (a.x + cAx)) * nx + ((b.y + cBy) - (a.y + cAy)) * ny + p.sep;
        let bias = 0, ms = 1, is = 0;
        if (s > 0) bias = s * inv_h;
        else if (useBias) {
          bias = Math.max(soft.biasRate * s, -PHYS.PUSHOUT);
          ms = soft.massScale; is = soft.impulseScale;
        }
        const dvx = (vBx - wB * p.rBy) - (vAx - wA * p.rAy);
        const dvy = (vBy + wB * p.rBx) - (vAy + wA * p.rAx);
        const vn = dvx * nx + dvy * ny;
        let imp = -p.nm * ms * (vn + bias) - is * p.ni;
        const nw = Math.max(p.ni + imp, 0);
        imp = nw - p.ni; p.ni = nw;
        if (imp > p.maxNi) p.maxNi = imp;
        const px = imp * nx, py = imp * ny;
        vAx -= mA * px; vAy -= mA * py; wA -= iA * (p.rAx * py - p.rAy * px);
        vBx += mB * px; vBy += mB * py; wB += iB * (p.rBx * py - p.rBy * px);
      }
      const fr = m.friction;
      for (let k = 0; k < cnt; k++) {
        const p = m.pts[k];
        const dvx = (vBx - wB * p.rBy) - (vAx - wA * p.rAy);
        const dvy = (vBy + wB * p.rBx) - (vAy + wA * p.rAx);
        const vt = dvx * tx + dvy * ty;
        let imp = -p.tm * vt;
        const maxF = fr * p.ni;
        const nw = Math.max(-maxF, Math.min(maxF, p.ti + imp));
        imp = nw - p.ti; p.ti = nw;
        const px = imp * tx, py = imp * ty;
        vAx -= mA * px; vAy -= mA * py; wA -= iA * (p.rAx * py - p.rAy * px);
        vBx += mB * px; vBy += mB * py; wB += iB * (p.rBx * py - p.rBy * px);
      }
      if (m.rolling > 0) {
        let tot = 0;
        for (let k = 0; k < cnt; k++) tot += m.pts[k].ni;
        const maxL = m.rolling * tot, old = m.ri;
        m.ri = Math.max(-maxL, Math.min(maxL, old - m.rollMass * (wB - wA)));
        const d = m.ri - old;
        wA -= iA * d; wB += iB * d;
      }
      if (mA !== 0 || iA !== 0) { a.vx = vAx; a.vy = vAy; a.w = wA; }
      if (mB !== 0 || iB !== 0) { b.vx = vBx; b.vy = vBy; b.w = wB; }
    }
  }

  _restitution() {
    const cs = this.contacts, thr = PHYS.RESTITUTION_THRESHOLD;
    for (let i = 0; i < cs.length; i++) {
      const m = cs[i];
      if (m.restitution === 0) continue;
      const a = m.a, b = m.b, mA = a.im, iA = a.ii, mB = b.im, iB = b.ii, nx = m.nx, ny = m.ny, e = m.restitution;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        if (p.rv > -thr || p.maxNi === 0) continue;
        const dvx = (b.vx - b.w * p.rBy) - (a.vx - a.w * p.rAy);
        const dvy = (b.vy + b.w * p.rBx) - (a.vy + a.w * p.rAx);
        const vn = dvx * nx + dvy * ny;
        let imp = -p.nm * (vn + e * p.rv);
        const nw = Math.max(p.ni + imp, 0);
        imp = nw - p.ni; p.ni = nw;
        const px = imp * nx, py = imp * ny;
        a.vx -= mA * px; a.vy -= mA * py; a.w -= iA * (p.rAx * py - p.rAy * px);
        b.vx += mB * px; b.vy += mB * py; b.w += iB * (p.rBx * py - p.rBy * px);
      }
    }
  }

  _updateIslands() {
    const dyn = this._dyn; dyn.length = 0;
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.isStatic) { b._ui = dyn.length; dyn.push(b); }
    }
    const n = dyn.length;
    if (this._parent.length < n) {
      this._parent = new Int32Array(n * 2);
      this._minSleep = new Float64Array(n * 2);
    }
    const parent = this._parent, minS = this._minSleep;
    for (let i = 0; i < n; i++) { parent[i] = i; minS[i] = Infinity; }
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (x, y) => { x = find(x); y = find(y); if (x !== y) parent[x] = y; };
    const cs = this.contacts;
    for (let i = 0; i < cs.length; i++) {
      const m = cs[i];
      if (!m.a.isStatic && !m.b.isStatic) union(m.a._ui, m.b._ui);
    }
    const js = this.joints;
    for (let i = 0; i < js.length; i++) {
      const j = js[i];
      if (!j.a.isGround && !j.a.isStatic && !j.b.isStatic) union(j.a._ui, j.b._ui);
    }
    for (let i = 0; i < n; i++) { const r = find(i); if (dyn[i].sleepTime < minS[r]) minS[r] = dyn[i].sleepTime; }
    for (let i = 0; i < n; i++) {
      const b = dyn[i], sleep = minS[find(i)] >= PHYS.TIME_TO_SLEEP;
      if (sleep && !b.sleeping) { b.sleeping = true; b.vx = 0; b.vy = 0; b.w = 0; }
      else if (!sleep && b.sleeping) b.sleeping = false;
    }
  }

  /* ---------------------------- статистика ---------------------------- */

  energy() {
    let ke = 0, pe = 0;
    const gx = this.gravityX, gy = this.gravityY;
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      ke += b.kinetic;
      pe -= b.mass * b.gravityScale * (gx * b.x + gy * b.y);
    }
    return { ke, pe };
  }
}
