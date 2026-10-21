/* ==========================================================================
   Физлаб 3D · орбитальная камера с плавным доведением
   ========================================================================== */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class OrbitCam {
  constructor(camera) {
    this.camera = camera;
    this.target = { x: 0, y: 1.5, z: 0 };
    this.dist = 22; this.yaw = 0.7; this.pitch = 0.42;
    this.goal = { target: { ...this.target }, dist: this.dist, yaw: this.yaw, pitch: this.pitch };
    this.fov = 50;
  }

  set(o, instant = true) {
    const g = this.goal;
    if (o.target) g.target = { ...o.target };
    if (o.dist !== undefined) g.dist = o.dist;
    if (o.yaw !== undefined) g.yaw = o.yaw;
    if (o.pitch !== undefined) g.pitch = o.pitch;
    if (instant) { this.target = { ...g.target }; this.dist = g.dist; this.yaw = g.yaw; this.pitch = g.pitch; this.apply(); }
  }

  get state() { const g = this.goal; return { target: { ...g.target }, dist: g.dist, yaw: g.yaw, pitch: g.pitch }; }

  orbit(dx, dy) {
    this.goal.yaw -= dx * 0.0055;
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.0045, -0.05, 1.52);
  }

  /** Сдвиг вида: точка под курсором следует за мышью. */
  pan(dx, dy) {
    const g = this.goal;
    const k = g.dist * Math.tan(this.fov * Math.PI / 360) * 2 / Math.max(1, this.camera.userData.h || 800);
    const cy = Math.cos(g.yaw), sy = Math.sin(g.yaw), sp = Math.sin(g.pitch), cp = Math.cos(g.pitch);
    // правый вектор камеры (cos yaw, 0, -sin yaw), верхний (-sin p·sin yaw, cos p, -sin p·cos yaw)
    g.target.x += (-dx * cy - dy * sp * sy) * k;
    g.target.y += dy * cp * k;
    g.target.z += (dx * sy - dy * sp * cy) * k;
  }

  /** Приблизить/отдалить; если задана точка — камера смещается к ней. */
  dolly(f, toward) {
    const g = this.goal;
    const nd = clamp(g.dist * f, 1.2, 600);
    if (toward && f < 1) {
      const k = 1 - nd / g.dist;
      g.target.x += (toward.x - g.target.x) * k;
      g.target.y += (toward.y - g.target.y) * k;
      g.target.z += (toward.z - g.target.z) * k;
    }
    g.dist = nd;
  }

  update(dt) {
    const g = this.goal, k = 1 - Math.exp(-dt * 16);
    this.target.x += (g.target.x - this.target.x) * k;
    this.target.y += (g.target.y - this.target.y) * k;
    this.target.z += (g.target.z - this.target.z) * k;
    this.dist += (g.dist - this.dist) * k;
    this.yaw += (g.yaw - this.yaw) * k;
    this.pitch += (g.pitch - this.pitch) * k;
    this.apply();
  }

  apply() {
    const c = this.camera, t = this.target;
    const cp = Math.cos(this.pitch);
    c.position.set(t.x + this.dist * cp * Math.sin(this.yaw), t.y + this.dist * Math.sin(this.pitch), t.z + this.dist * cp * Math.cos(this.yaw));
    c.lookAt(t.x, t.y, t.z);
    if (c.fov !== this.fov) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }
}
