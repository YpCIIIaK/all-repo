'use strict';
/* ==========================================================================
   Физлаб · движок · соединения
   spring — пружина, rod — жёсткий стержень, rope — верёвка (только максимум длины),
   hinge — шарнир (с мотором и ограничением угла), mouse — перетаскивание курсором.
   Тело a может быть world.ground — неподвижная точка мира.
   ========================================================================== */

let _nextJointId = 1;

class Joint {
  constructor(type, a, b, o = {}) {
    if (o.id) { this.id = o.id; if (o.id >= _nextJointId) _nextJointId = o.id + 1; }
    else this.id = _nextJointId++;
    this.type = type;
    this.a = a; this.b = b;
    this.lax = o.lax || 0; this.lay = o.lay || 0; // якорь в локальных осях a
    this.lbx = o.lbx || 0; this.lby = o.lby || 0; // якорь в локальных осях b
    this.collideConnected = !!o.collideConnected;
    this.breakForce = o.breakForce || 0;           // 0 — неразрушимо
    this.style = o.style || '';
    this.color = o.color || null;
    this.force = 0;                                // последняя оценка нагрузки, Н
    // рабочие поля
    this.rAx = 0; this.rAy = 0; this.rBx = 0; this.rBy = 0;
  }
  _arms() {
    const a = this.a, b = this.b;
    this.rAx = a.c * this.lax - a.s * this.lay; this.rAy = a.s * this.lax + a.c * this.lay;
    this.rBx = b.c * this.lbx - b.s * this.lby; this.rBy = b.s * this.lbx + b.c * this.lby;
  }
  worldA(out) {
    const a = this.a;
    out.x = a.x + a.c * this.lax - a.s * this.lay; out.y = a.y + a.s * this.lax + a.c * this.lay; return out;
  }
  worldB(out) {
    const b = this.b;
    out.x = b.x + b.c * this.lbx - b.s * this.lby; out.y = b.y + b.s * this.lbx + b.c * this.lby; return out;
  }
  prepare() {}
  warmStart() {}
  solve() {}
  get isGroundA() { return !!this.a.isGround; }
}

class DistanceJoint extends Joint {
  constructor(type, a, b, o = {}) {
    super(type, a, b, o);
    this.length = Math.max(0.01, o.length ?? 1);
    this.hertz = o.hertz ?? 2.5;
    this.damping = o.damping ?? 0.3;
    this.impulse = 0;
    this.soft = { biasRate: 0, massScale: 1, impulseScale: 0 };
    this._ux = 0; this._uy = 0; this._len = 0; this._mass = 0;
  }
  prepare(h) {
    if (this.type === 'spring') makeSoft(this.soft, this.hertz, this.damping, h);
  }
  _geom() {
    this._arms();
    const a = this.a, b = this.b;
    const dx = (b.x + this.rBx) - (a.x + this.rAx), dy = (b.y + this.rBy) - (a.y + this.rAy);
    const len = Math.hypot(dx, dy);
    this._len = len;
    if (len < 1e-6) { this._ux = 0; this._uy = 0; this._mass = 0; return false; }
    const ux = dx / len, uy = dy / len;
    this._ux = ux; this._uy = uy;
    const crA = this.rAx * uy - this.rAy * ux, crB = this.rBx * uy - this.rBy * ux;
    const k = a.im + b.im + a.ii * crA * crA + b.ii * crB * crB;
    this._mass = k > 0 ? 1 / k : 0;
    return true;
  }
  _apply(imp) {
    const a = this.a, b = this.b, px = imp * this._ux, py = imp * this._uy;
    a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (this.rAx * py - this.rAy * px);
    b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (this.rBx * py - this.rBy * px);
  }
  warmStart() {
    if (this.impulse === 0) return;
    if (this._geom()) this._apply(this.impulse);
  }
  solve(h, inv_h, useBias, sj) {
    if (!this._geom()) return;
    const a = this.a, b = this.b;
    const vrx = (b.vx - b.w * this.rBy) - (a.vx - a.w * this.rAy);
    const vry = (b.vy + b.w * this.rBx) - (a.vy + a.w * this.rAx);
    const cdot = this._ux * vrx + this._uy * vry;
    const mass = this._mass;
    if (this.type === 'spring') {
      const s = this.soft;
      const C = this._len - this.length;
      const imp = -s.massScale * mass * (cdot + s.biasRate * C) - s.impulseScale * this.impulse;
      this.impulse += imp;
      this._apply(imp);
    } else if (this.type === 'rod') {
      const C = this._len - this.length;
      let bias = 0, ms = 1, is = 0;
      if (useBias) { bias = sj.biasRate * C; ms = sj.massScale; is = sj.impulseScale; }
      const imp = -ms * mass * (cdot + bias) - is * this.impulse;
      this.impulse += imp;
      this._apply(imp);
    } else { // rope: длина ≤ length
      const C = this.length - this._len;
      let bias = 0, ms = 1, is = 0;
      if (C > 0) bias = C * inv_h;
      else if (useBias) { bias = Math.max(sj.biasRate * C, -PHYS.PUSHOUT * 4); ms = sj.massScale; is = sj.impulseScale; }
      const old = -this.impulse;
      let lam = -ms * mass * (-cdot + bias) - is * old;
      const nw = Math.max(0, old + lam);
      lam = nw - old;
      this.impulse = -nw;
      this._apply(-lam);
    }
  }
  reaction(inv_h) { return Math.abs(this.impulse) * inv_h; }
}

class RevoluteJoint extends Joint {
  constructor(a, b, o = {}) {
    super('hinge', a, b, o);
    this.ix = 0; this.iy = 0;
    this.enableMotor = !!o.enableMotor;
    this.motorSpeed = o.motorSpeed || 0;     // рад/с
    this.maxTorque = o.maxTorque ?? 100;     // Н·м
    this.motorKeys = !!o.motorKeys;          // управление стрелками ← →
    this.enableLimit = !!o.enableLimit;
    this.lower = o.lower ?? -Math.PI / 4;
    this.upper = o.upper ?? Math.PI / 4;
    this.refAngle = o.refAngle ?? (b.angle - a.angle);
    this.motorImpulse = 0; this.lowerImpulse = 0; this.upperImpulse = 0;
    this._speed = 0;
  }
  prepare(h, world) {
    this._speed = this.motorKeys ? -this.motorSpeed * world.motorInput : this.motorSpeed;
    if (!this.enableMotor) this.motorImpulse = 0;
    if (!this.enableLimit) { this.lowerImpulse = 0; this.upperImpulse = 0; }
  }
  warmStart() {
    this._arms();
    const a = this.a, b = this.b;
    const axial = this.motorImpulse + this.lowerImpulse - this.upperImpulse;
    const px = this.ix, py = this.iy;
    a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (this.rAx * py - this.rAy * px + axial);
    b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (this.rBx * py - this.rBy * px + axial);
  }
  solve(h, inv_h, useBias, sj) {
    const a = this.a, b = this.b;
    const mA = a.im, mB = b.im, iA = a.ii, iB = b.ii;
    const kA = iA + iB, axialMass = kA > 0 ? 1 / kA : 0;

    if (this.enableMotor && kA > 0) {
      const cdot = b.w - a.w - this._speed;
      let imp = -axialMass * cdot;
      const old = this.motorImpulse, maxImp = this.maxTorque * h;
      this.motorImpulse = Math.max(-maxImp, Math.min(maxImp, old + imp));
      imp = this.motorImpulse - old;
      a.w -= iA * imp; b.w += iB * imp;
    }

    if (this.enableLimit && kA > 0) {
      const ang = b.angle - a.angle - this.refAngle;
      { // нижний предел
        const C = ang - this.lower;
        let bias = 0, ms = 1, is = 0;
        if (C > 0) bias = C * inv_h;
        else if (useBias) { bias = sj.biasRate * C; ms = sj.massScale; is = sj.impulseScale; }
        const cdot = b.w - a.w;
        let imp = -axialMass * ms * (cdot + bias) - is * this.lowerImpulse;
        const nw = Math.max(this.lowerImpulse + imp, 0);
        imp = nw - this.lowerImpulse; this.lowerImpulse = nw;
        a.w -= iA * imp; b.w += iB * imp;
      }
      { // верхний предел
        const C = this.upper - ang;
        let bias = 0, ms = 1, is = 0;
        if (C > 0) bias = C * inv_h;
        else if (useBias) { bias = sj.biasRate * C; ms = sj.massScale; is = sj.impulseScale; }
        const cdot = a.w - b.w;
        let imp = -axialMass * ms * (cdot + bias) - is * this.upperImpulse;
        const nw = Math.max(this.upperImpulse + imp, 0);
        imp = nw - this.upperImpulse; this.upperImpulse = nw;
        a.w += iA * imp; b.w -= iB * imp;
      }
    }

    // точечное ограничение
    this._arms();
    const rAx = this.rAx, rAy = this.rAy, rBx = this.rBx, rBy = this.rBy;
    const cvx = (b.vx - b.w * rBy) - (a.vx - a.w * rAy);
    const cvy = (b.vy + b.w * rBx) - (a.vy + a.w * rAx);
    let bx = 0, by = 0, ms = 1, is = 0;
    if (useBias) {
      bx = sj.biasRate * ((b.x + rBx) - (a.x + rAx));
      by = sj.biasRate * ((b.y + rBy) - (a.y + rAy));
      ms = sj.massScale; is = sj.impulseScale;
    }
    const k11 = mA + mB + rAy * rAy * iA + rBy * rBy * iB;
    const k12 = -rAy * rAx * iA - rBy * rBx * iB;
    const k22 = mA + mB + rAx * rAx * iA + rBx * rBx * iB;
    let det = k11 * k22 - k12 * k12;
    if (det === 0) return;
    det = 1 / det;
    const rx = cvx + bx, ry = cvy + by;
    const sx = det * (k22 * rx - k12 * ry), sy = det * (k11 * ry - k12 * rx);
    const px = -ms * sx - is * this.ix, py = -ms * sy - is * this.iy;
    this.ix += px; this.iy += py;
    a.vx -= mA * px; a.vy -= mA * py; a.w -= iA * (rAx * py - rAy * px);
    b.vx += mB * px; b.vy += mB * py; b.w += iB * (rBx * py - rBy * px);
  }
  reaction(inv_h) { return Math.hypot(this.ix, this.iy) * inv_h; }
  get angleNow() { return this.b.angle - this.a.angle - this.refAngle; }
}

class MouseJoint extends Joint {
  constructor(ground, b, o = {}) {
    super('mouse', ground, b, o);
    this.tx = o.tx || 0; this.ty = o.ty || 0;
    this.hertz = o.hertz ?? 6;
    this.damping = o.damping ?? 0.8;
    this.ix = 0; this.iy = 0;
    this.soft = { biasRate: 0, massScale: 1, impulseScale: 0 };
  }
  prepare(h) {
    makeSoft(this.soft, this.hertz, this.damping, h);
    this.maxForce = 400 * this.b.mass * Math.max(1, Math.sqrt(this.b.mass));
  }
  warmStart() {
    const b = this.b;
    this._arms();
    b.vx += b.im * this.ix; b.vy += b.im * this.iy; b.w += b.ii * (this.rBx * this.iy - this.rBy * this.ix);
  }
  solve(h) {
    const b = this.b, mB = b.im, iB = b.ii;
    if (mB === 0) return;
    this._arms();
    const rBx = this.rBx, rBy = this.rBy, s = this.soft;
    const cvx = b.vx - b.w * rBy, cvy = b.vy + b.w * rBx;
    const bx = s.biasRate * (b.x + rBx - this.tx), by = s.biasRate * (b.y + rBy - this.ty);
    const k11 = mB + rBy * rBy * iB, k12 = -rBy * rBx * iB, k22 = mB + rBx * rBx * iB;
    let det = k11 * k22 - k12 * k12;
    if (det === 0) return;
    det = 1 / det;
    const rx = cvx + bx, ry = cvy + by;
    const sx = det * (k22 * rx - k12 * ry), sy = det * (k11 * ry - k12 * rx);
    let px = -s.massScale * sx - s.impulseScale * this.ix, py = -s.massScale * sy - s.impulseScale * this.iy;
    const ox = this.ix, oy = this.iy;
    let nx = ox + px, ny = oy + py;
    const maxImp = this.maxForce * h, l = Math.hypot(nx, ny);
    if (l > maxImp) { nx *= maxImp / l; ny *= maxImp / l; }
    this.ix = nx; this.iy = ny;
    px = nx - ox; py = ny - oy;
    b.vx += mB * px; b.vy += mB * py; b.w += iB * (rBx * py - rBy * px);
    b.w *= 0.995; // лёгкое гашение вращения при перетаскивании
  }
  reaction() { return 0; }
}
