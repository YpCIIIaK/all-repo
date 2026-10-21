/* ==========================================================================
   Физлаб 3D · инструменты
   Каждый инструмент получает экранные координаты; точку в мире он берёт
   лучом из камеры (app.pick).
   ========================================================================== */

import { Q, V, shapeHalfY } from './physics.js';

export const TOOL_DEFS = [
  { id: 'select', name: 'Выбор и перетаскивание', key: 'V', icon: 'select',
    hint: 'Тяните тела мышью · пустое место или ПКМ — вращать вид · Shift или колесо зажато — сдвиг · колесо — масштаб' },
  { id: 'cannon', name: 'Пушка', key: 'G', icon: 'cannon', hint: 'Клик — выстрел шаром из камеры в точку под курсором' },
  { sep: true },
  { id: 'box', name: 'Ящик', key: 'B', icon: 'cube', hint: 'Клик по поверхности — поставить · тяните вверх/вниз, чтобы изменить размер · Shift — статичный' },
  { id: 'ball', name: 'Шар', key: 'C', icon: 'ball', hint: 'Клик по поверхности — поставить · тяните вверх/вниз, чтобы изменить размер' },
  { id: 'cylinder', name: 'Цилиндр', key: 'Y', icon: 'cylinder', hint: 'Клик по поверхности — поставить · тяните, чтобы изменить размер' },
  { id: 'capsule', name: 'Капсула', key: 'K', icon: 'capsule', hint: 'Клик по поверхности — поставить · тяните, чтобы изменить размер' },
  { id: 'cone', name: 'Конус', key: 'O', icon: 'cone', hint: 'Клик по поверхности — поставить · тяните, чтобы изменить размер' },
  { id: 'wall', name: 'Стена', key: 'W', icon: 'wall', hint: 'Протяните по полу — получится неподвижная стена · высота и толщина — в панели «Объект»' },
  { sep: true },
  { id: 'spring', name: 'Пружина', key: 'S', icon: 'spring', hint: 'Протяните от тела к другому телу или к точке' },
  { id: 'rope', name: 'Верёвка', key: 'L', icon: 'rope', hint: 'Протяните от тела к телу или к точке — верёвка не даст разойтись дальше длины' },
  { id: 'ball3', name: 'Шаровой шарнир', key: 'R', icon: 'ball3', hint: 'Клик по телу — подвесить за эту точку · протяжка к другому телу — соединить их' },
  { id: 'hinge', name: 'Ось', key: 'H', icon: 'hinge', hint: 'Клик по грани — ось вращения перпендикулярно грани · протяжка к другому телу — ось между ними' },
  { id: 'weld', name: 'Сварка', key: 'J', icon: 'weld', hint: 'Протяните от тела к телу — они станут одним целым · клик — закрепить в воздухе' },
  { sep: true },
  { id: 'explode', name: 'Взрыв', key: 'X', icon: 'explode', hint: 'Клик — взрывная волна в точке' },
  { id: 'magnet', name: 'Магнит', key: 'M', icon: 'magnet', hint: 'Удерживайте — тела стягиваются к точке · с Shift — отталкиваются' },
  { id: 'eraser', name: 'Ластик', key: 'D', icon: 'eraser', hint: 'Клик или протяжка удаляет тела и соединения' },
];

export const SHAPE_TOOLS = ['box', 'ball', 'cylinder', 'capsule', 'cone'];

export function defaultSize(kind, s) {
  switch (kind) {
    case 'box': return { w: s, h: s, d: s };
    case 'ball': return { r: s / 2 };
    case 'cylinder': return { r: s / 2, h: s };
    case 'capsule': return { r: s * 0.3, h: s * 0.6 };
    case 'cone': return { r: s / 2, h: s };
  }
}

export class ToolManager {
  constructor(app) {
    this.app = app;
    this.currentId = 'select';
    this.active = false;
    this.grab = null;      // перетаскиваемое тело (используется и в шаге физики)
    this.magnet = null;
    this.state = {};
  }
  get def() { return TOOL_DEFS.find(d => d.id === this.currentId); }
  set(id) {
    if (!TOOL_DEFS.some(d => d.id === id)) return;
    this.cancel();
    this.currentId = id;
    this.app.view3d.showGhost(null);
    this.app.onToolChanged(id);
  }

  cancel() {
    this.active = false;
    this.grab = null; this.magnet = null; this.state = {};
    const v = this.app.view3d;
    v.guides.length = 0;
    v.showGhost(null);
  }

  /* ---------------------------- события ---------------------------- */

  down(sx, sy, e) {
    const app = this.app, id = this.currentId;
    this.active = true;
    this.state = { sx, sy, moved: false };
    if (id === 'select') return this._selectDown(sx, sy, e);
    if (id === 'cannon') { this._fire(sx, sy); this.active = false; return; }
    if (SHAPE_TOOLS.includes(id)) {
      const hit = app.pick(sx, sy);
      this.state.hit = hit; this.state.scale = 1; this.state.static = e.shiftKey;
      this._ghostShape(hit, 1);
      return;
    }
    if (id === 'wall') { const hit = app.pick(sx, sy); this.state.a = hit.point; this.state.b = hit.point; return; }
    if (['spring', 'rope', 'ball3', 'hinge', 'weld'].includes(id)) {
      const hit = app.pick(sx, sy);
      this.state.a = hit; this.state.cur = hit;
      if (!hit.obj || hit.obj.ground) { if (id === 'hinge' || id === 'ball3' || id === 'weld') { app.toast('Начните с тела'); this.active = false; return; } }
      return;
    }
    if (id === 'explode') {
      const hit = app.pick(sx, sy), d = app.defaults;
      app.checkpoint('explode');
      app.physics.explode(hit.point, d.blastRadius, d.blastPower);
      app.view3d.addEffect(hit.point, d.blastRadius);
      this.active = false;
      return;
    }
    if (id === 'magnet') { this._magnetAt(sx, sy, e); return; }
    if (id === 'eraser') { app.checkpoint(); this._erase(sx, sy); return; }
  }

  move(sx, sy, e) {
    const app = this.app, id = this.currentId, st = this.state;
    if (this.active && (Math.abs(sx - st.sx) > 3 || Math.abs(sy - st.sy) > 3)) st.moved = true;
    if (!this.active) { this._hover(sx, sy); return; }
    if (id === 'select') return this._selectMove(sx, sy, e);
    if (SHAPE_TOOLS.includes(id)) {
      st.scale = Math.max(0.15, Math.min(12, Math.exp(-(sy - st.sy) / 120)));
      this._ghostShape(st.hit, st.scale);
      return;
    }
    if (id === 'wall') {
      st.b = app.pickPlane(sx, sy, st.a.y) || st.b;
      this._wallPreview();
      return;
    }
    if (['spring', 'rope', 'ball3', 'hinge', 'weld'].includes(id)) {
      st.cur = app.pick(sx, sy);
      const v = app.view3d;
      v.guides.length = 0;
      v.guides.push([st.a.point, st.cur.point, null, 0.05]);
      return;
    }
    if (id === 'magnet') { this._magnetAt(sx, sy, e); return; }
    if (id === 'eraser') { this._erase(sx, sy); }
  }

  up(sx, sy, e) {
    if (!this.active) return;
    const app = this.app, id = this.currentId, st = this.state;
    this.active = false;
    const v = app.view3d;
    if (id === 'select') { this.grab = null; v.guides.length = 0; app.setCursor(null); if (!st.moved && st.clickObj === undefined) app.select(null); return; }
    if (SHAPE_TOOLS.includes(id)) { this._placeShape(st.hit, st.scale, st.static || e.shiftKey); this._hover(sx, sy); return; }
    if (id === 'wall') { this._placeWall(); v.guides.length = 0; return; }
    if (['spring', 'rope', 'ball3', 'hinge', 'weld'].includes(id)) {
      v.guides.length = 0;
      this._makeJoint(id, st.a, app.pick(sx, sy), st.moved);
      return;
    }
    if (id === 'magnet') { this.magnet = null; return; }
  }

  wheel(f) {
    if (this.grab) { this.grab.depth = Math.max(0.5, this.grab.depth * f); return true; }
    return false;
  }

  /* ---------------------------- выбор ---------------------------- */

  _selectDown(sx, sy, e) {
    const app = this.app;
    const j = app.jointAtScreen(sx, sy);
    if (j) { app.select(j); this.state.clickObj = j; this.active = false; return; }
    const hit = app.pick(sx, sy);
    const o = hit.obj && !hit.obj.ground ? hit.obj : null;
    this.state.clickObj = o;
    if (!o) { this.active = false; app.select(null); app.startCameraDrag(e, e.shiftKey ? 'pan' : 'orbit'); return; }
    app.select(o);
    app.checkpoint('drag');
    const cam = app.view3d.camera.position;
    const fwd = app.camForward();
    const depth = V.dot(V.sub(hit.point, { x: cam.x, y: cam.y, z: cam.z }), fwd);
    this.grab = {
      obj: o, local: o.toLocal(hit.point), depth, target: { ...hit.point },
      mode: app.running && !o.isStatic ? 'force' : 'move',
      planeY: hit.point.y, offset: V.sub(o.p, hit.point),
    };
    app.setCursor('grabbing');
  }

  _selectMove(sx, sy, e) {
    const g = this.grab, app = this.app;
    if (!g) return;
    if (!g.obj.rb) { this.grab = null; return; }
    const r = app.view3d.ray(sx, sy), fwd = app.camForward();
    let target;
    if (g.mode === 'move' && !e.shiftKey) {
      target = app.pickPlane(sx, sy, g.planeY);
      if (!target) return;
    } else {
      const t = g.depth / Math.max(0.05, V.dot(r.dir, fwd));
      target = V.add(r.origin, V.scale(r.dir, t));
    }
    g.target = target;
    if (g.mode === 'move') {
      const np = V.add(target, g.offset);
      if (np.y < g.obj.bound * 0.2 - 50) return;
      app.physics.setPose(g.obj, app.snap(np));
      if (!g.obj.isStatic) app.physics.setVelocity(g.obj, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      app.ui.liveRefresh();
    }
  }

  /** Пружинка захвата — вызывается перед каждым шагом физики. */
  applyGrab(dt) {
    const g = this.grab;
    if (!g || g.mode !== 'force' || !g.obj.rb) return;
    const o = g.obj, rb = o.rb;
    const anchor = o.toWorld(g.local), r = V.sub(anchor, o.p);
    const v = rb.linvel(), w = rb.angvel();
    const va = { x: v.x + w.y * r.z - w.z * r.y, y: v.y + w.z * r.x - w.x * r.z, z: v.z + w.x * r.y - w.y * r.x };
    const om = 2 * Math.PI * 3, k = om * om, c = 2 * 0.9 * om;
    let ax = k * (g.target.x - anchor.x) - c * va.x, ay = k * (g.target.y - anchor.y) - c * va.y, az = k * (g.target.z - anchor.z) - c * va.z;
    const al = Math.hypot(ax, ay, az), maxA = 250;
    if (al > maxA) { ax *= maxA / al; ay *= maxA / al; az *= maxA / al; }
    const m = rb.mass(), grav = this.app.physics.gravity;
    rb.applyImpulseAtPoint({ x: (ax - grav.x * o.gravityScale) * m * dt, y: (ay - grav.y * o.gravityScale) * m * dt, z: (az - grav.z * o.gravityScale) * m * dt }, anchor, true);
    rb.setAngvel({ x: w.x * 0.96, y: w.y * 0.96, z: w.z * 0.96 }, true);
  }

  _hover(sx, sy) {
    const app = this.app, id = this.currentId;
    if (!app.pointer.inside) { app.view3d.showGhost(null); app.hover = null; return; }
    if (id === 'select' || id === 'eraser') {
      const j = app.jointAtScreen(sx, sy);
      const hit = j ? null : app.pick(sx, sy);
      app.hover = j ? null : hit && hit.obj && !hit.obj.ground ? hit.obj : null;
      if (id === 'select') app.setCursor(j || app.hover ? 'grab' : null);
      return;
    }
    app.hover = null;
    if (SHAPE_TOOLS.includes(id)) this._ghostShape(app.pick(sx, sy), 1);
    if (['spring', 'rope', 'ball3', 'hinge', 'weld'].includes(id)) {
      const hit = app.pick(sx, sy);
      app.hover = hit.obj && !hit.obj.ground ? hit.obj : null;
    }
  }

  /* ---------------------------- фигуры ---------------------------- */

  _shapePose(hit, scale) {
    const app = this.app, kind = this.currentId;
    const size = defaultSize(kind, app.defaults.size * scale);
    const hy = shapeHalfY(kind, size);
    const n = hit.normal || { x: 0, y: 1, z: 0 };
    // вертикальная форма ставится на поверхность, на боковой грани — отступает по нормали
    const off = n.y > 0.5 ? hy : (kind === 'box' ? size.w / 2 : (size.r || hy));
    const p = app.snap(V.add(hit.point, V.scale(n.y > 0.5 ? { x: 0, y: 1, z: 0 } : n, off + 0.005 + app.defaults.dropHeight)));
    const yaw = Math.round(app.cam.yaw / (Math.PI / 2)) * (Math.PI / 2);
    return { kind, size, p, q: Q.axisAngle({ x: 0, y: 1, z: 0 }, yaw) };
  }

  _ghostShape(hit, scale) {
    const s = this._shapePose(hit, scale);
    this.app.view3d.showGhost(s.kind, s.size, s.p, s.q);
  }

  _placeShape(hit, scale, isStatic) {
    const app = this.app, s = this._shapePose(hit, scale);
    app.checkpoint();
    const o = app.createObj(s.kind, s.size, s.p, s.q, isStatic ? { isStatic: true } : {});
    app.select(o);
  }

  _fire(sx, sy) {
    const app = this.app, d = app.defaults, r = app.view3d.ray(sx, sy);
    app.checkpoint('cannon');
    const p = V.add(r.origin, V.scale(r.dir, 1.2));
    const o = app.createObj('ball', { r: d.cannonSize / 2 }, p, Q.id(), { ccd: true, vel: V.scale(r.dir, d.cannonSpeed), ...app.materialProps('metal') });
    if (!app.running) app.toast('Снаряд готов — нажмите ▶, чтобы он полетел');
    return o;
  }

  _wallPreview() {
    const st = this.state, d = this.app.defaults, v = this.app.view3d;
    const a = st.a, b = st.b, len = Math.hypot(b.x - a.x, b.z - a.z);
    v.guides.length = 0;
    if (len < 0.05) { v.showGhost(null); return; }
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    v.showGhost('box', { w: len, h: d.wallHeight, d: d.wallThickness }, { x: (a.x + b.x) / 2, y: a.y + d.wallHeight / 2, z: (a.z + b.z) / 2 }, Q.axisAngle({ x: 0, y: 1, z: 0 }, yaw));
  }

  _placeWall() {
    const app = this.app, st = this.state, d = app.defaults, a = st.a, b = st.b;
    app.view3d.showGhost(null);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.1) { app.toast('Протяните линию по полу, чтобы поставить стену'); return; }
    app.checkpoint();
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    app.select(app.createObj('box', { w: len, h: d.wallHeight, d: d.wallThickness }, { x: (a.x + b.x) / 2, y: a.y + d.wallHeight / 2, z: (a.z + b.z) / 2 },
      Q.axisAngle({ x: 0, y: 1, z: 0 }, yaw), { isStatic: true, color: null }));
  }

  /* --------------------------- соединения --------------------------- */

  _makeJoint(type, A, B, dragged) {
    const app = this.app, P = app.physics, d = app.defaults;
    const body = h => (h && h.obj && !h.obj.ground ? h.obj : null);
    let a = body(A), b = body(B);
    if (!dragged || b === a) b = null;
    const pa = A.point;
    let pb = B.point;
    if (!a && !b) { app.toast('Соединение должно касаться хотя бы одного тела'); return; }
    const isDyn = o => o && !o.isStatic;
    if (type === 'spring' || type === 'rope') {
      if (!dragged) { app.toast('Протяните от тела к другому телу или к точке'); return; }
      if (!B.obj && !B.hitSomething) {
        // отпустили «в воздухе» — точка на глубине начала
        pb = app.pointAtDepth(B.sx, B.sy, A.point);
      }
      let ja = a, jb = b, qa = pa, qb = pb;
      if (!isDyn(jb)) { [ja, jb] = [jb, ja]; [qa, qb] = [qb, qa]; }
      if (!isDyn(jb)) { app.toast('Нужно хотя бы одно подвижное тело'); return; }
      app.checkpoint();
      const j = P.addJointFromWorld({ type, a: ja, b: jb, pa: qa, pb: qb, hertz: d.springHertz, damping: d.springDamping });
      app.select(j);
      return;
    }
    // ball3 / hinge / weld: точка соединения — там, где начали
    const piv = pa;
    let ja = b, jb = a; // тело, с которого начали, — подвижная сторона
    if (!isDyn(jb)) { [ja, jb] = [jb, ja]; }
    if (!isDyn(jb)) { app.toast('Нужно хотя бы одно подвижное тело'); return; }
    if (ja && ja.ground) ja = null;
    app.checkpoint();
    const map = { ball3: 'ball', hinge: 'hinge', weld: 'weld' };
    const axis = V.norm(A.normal || { x: 0, y: 0, z: 1 });
    const j = P.addJointFromWorld({ type: map[type], a: ja, b: jb, pa: piv, pb: piv, axis });
    app.select(j);
    app.toast(type === 'hinge' ? (ja ? 'Ось между телами создана' : 'Тело закреплено на оси') : type === 'weld' ? (ja ? 'Тела сварены' : 'Тело закреплено в воздухе') : (ja ? 'Шарнир создан' : 'Тело подвешено'));
  }

  /* ---------------------------- прочее ---------------------------- */

  _magnetAt(sx, sy, e) {
    const hit = this.app.pick(sx, sy);
    const n = hit.normal || { x: 0, y: 1, z: 0 };
    this.magnet = { p: V.add(hit.point, V.scale(n, 1.2)), repel: !!e.shiftKey };
  }

  _erase(sx, sy) {
    const app = this.app;
    const j = app.jointAtScreen(sx, sy);
    if (j) { app.removeObject(j); return; }
    const hit = app.pick(sx, sy);
    if (hit.obj && !hit.obj.ground) app.removeObject(hit.obj);
  }
}
