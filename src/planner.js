/* ==========================================================================
   Ясень · планировщик комнаты: расставьте мебель в 3D
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { makeRenderer, makeEnvironment } from './stage.js';
import { disposeObject } from './models.js';
import { byId, buildModel, normalizeCfg } from './catalog.js';
import * as M from './materials.js';

const WALL_H = 2.7, WALL_T = 0.12, SNAP = 0.05;
let uidSeq = 1;

export class Planner {
  constructor(host, { onSelect = () => {}, onChange = () => {} } = {}) {
    this.host = host;
    this.onSelect = onSelect; this.onChange = onChange;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    host.appendChild(this.canvas);
    this.labels = document.createElement('div');
    this.labels.className = 'stage-labels';
    host.appendChild(this.labels);

    const r = this.renderer = makeRenderer(this.canvas, { alpha: false, shadows: true });
    r.setClearColor('#e9e3da', 1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9e3da');
    this.scene.environment = makeEnvironment(r);
    this.scene.environmentIntensity = 0.65;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);

    this.hemi = new THREE.HemisphereLight('#fffaf0', '#cbb9a2', 0.35);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.roomG = new THREE.Group();
    this.itemsG = new THREE.Group();
    this.scene.add(this.roomG, this.itemsG);

    this.sel = null;
    this.selG = new THREE.Group();
    this.scene.add(this.selG);

    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.09, maxPolarAngle: 1.45, minDistance: 1.5, maxDistance: 22,
      rotateSpeed: 0.65, screenSpacePanning: false,
    });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.kick());

    this.state = { room: { w: 5, l: 4, floor: 'oak-light', wall: 'chalk' }, items: [] };
    this.view = '3d';
    this.evening = false;
    this.items = new Map();
    this.raf = 0; this.dirty = true; this.last = 0;
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.drag = null;

    this.canvas.addEventListener('pointerdown', this._down, true);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.buildRoom();
    this.home(true);
  }

  /* ------------------------------ состояние ------------------------------ */

  load(state) {
    for (const it of this.items.values()) { this.itemsG.remove(it.g); disposeObject(it.g); }
    this.items.clear();
    this.state = { room: { ...this.state.room, ...(state?.room || {}) }, items: [] };
    this.buildRoom();
    for (const it of state?.items || []) if (byId[it.id]) this._addItem({ ...it, uid: uidSeq++ });
    this.select(null);
    this.home(true);
    this.kick();
  }

  serialize() {
    return {
      room: { ...this.state.room },
      items: [...this.items.values()].map(({ d }) => ({ id: d.id, cfg: d.cfg, x: +d.x.toFixed(3), z: +d.z.toFixed(3), rot: +d.rot.toFixed(4) })),
    };
  }

  _changed() { this.onChange(this.serialize()); }

  /* ------------------------------ комната ------------------------------ */

  setRoom(patch) {
    Object.assign(this.state.room, patch);
    this.buildRoom();
    for (const it of this.items.values()) this._clamp(it);
    this._refreshSel();
    this._changed();
    this.kick();
  }

  buildRoom() {
    this.roomG.traverse((o) => { o.geometry?.dispose(); if (o.material && !o.material.userData.shared) o.material.dispose?.(); });
    this.roomG.clear();
    const { w, l, floor, wall } = this.state.room;
    const fm = M.misc.floor(floor);
    fm.map = fm.map.clone(); fm.map.repeat.set(w / 2, l / 2); fm.map.needsUpdate = true;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), fm);
    fl.receiveShadow = true;
    const uv = fl.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    this.roomG.add(fl);
    this.floor = fl;

    const wm = M.misc.wall(M.WALLS[wall]?.hex || '#ece7df');
    const sk = M.misc.wall('#f4f0e9');
    this.walls = [];
    const mk = (len, x, z, ry, nx, nz) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(len + 2 * WALL_T, WALL_H, WALL_T), wm);
      body.position.y = WALL_H / 2; body.receiveShadow = true; body.castShadow = true;
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.016), sk);
      base.position.set(0, 0.04, WALL_T / 2 + 0.008); base.receiveShadow = true;
      g.add(body, base);
      g.position.set(x, 0, z); g.rotation.y = ry;
      g.userData.n = new THREE.Vector2(nx, nz);
      g.userData.off = (Math.abs(nx) ? w : l) / 2;
      this.roomG.add(g);
      this.walls.push(g);
      return g;
    };
    const back = mk(w, 0, -l / 2 - WALL_T / 2, 0, 0, -1);
    mk(w, 0, l / 2 + WALL_T / 2, Math.PI, 0, 1);
    const left = mk(l, -w / 2 - WALL_T / 2, 0, Math.PI / 2, -1, 0);
    mk(l, w / 2 + WALL_T / 2, 0, -Math.PI / 2, 1, 0);

    // окно на левой стене и картина на задней — чтобы комната читалась
    const win = new THREE.Group();
    const ww = Math.min(1.6, l * 0.45), wh = 1.5;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ color: '#f6f3ea', toneMapped: false }));
    const fr = M.misc.wall('#f7f5f0');
    const bar = (bw, bh, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), fr); m.position.set(x, y, 0.02); m.castShadow = true; win.add(m); };
    win.add(glass);
    bar(ww + 0.1, 0.06, 0, wh / 2 + 0.03); bar(ww + 0.1, 0.06, 0, -wh / 2 - 0.03); bar(0.06, wh, -ww / 2 - 0.03, 0); bar(0.06, wh, ww / 2 + 0.03, 0); bar(0.04, wh, 0, 0); bar(ww, 0.04, 0, wh * 0.15);
    win.position.set(0, 1.45, WALL_T / 2 + 0.002);
    left.add(win);
    const art = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.03), new THREE.MeshStandardMaterial({ map: artTexture(), roughness: 0.9 }));
    art.position.set(Math.min(0.6, w / 2 - 0.8), 1.55, WALL_T / 2 + 0.02); art.castShadow = true;
    back.add(art);

    // солнце светит «из окна»
    const s = this.sun.shadow.camera, half = Math.max(w, l) * 0.75 + 1;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half; s.near = 0.5; s.far = 30; s.updateProjectionMatrix();
    this.sun.position.set(-w / 2 - 4, 6, 1.5);
    this.sun.target.position.set(0, 0, 0);
    this._applyLighting();
    this.kick();
  }

  /* ------------------------------ предметы ------------------------------ */

  addItem(id, cfg, at) {
    const p = byId[id];
    if (!p) return null;
    const { w, l } = this.state.room;
    const d = { uid: uidSeq++, id, cfg: normalizeCfg(p, cfg), x: at?.x ?? 0, z: at?.z ?? 0, rot: at?.rot ?? 0 };
    const it = this._addItem(d);
    if (!at) {
      // ищем свободное место по спирали от центра
      for (let k = 0; k < 60; k++) {
        const a = k * 2.4, rr = 0.25 * Math.sqrt(k);
        d.x = Math.cos(a) * rr * w / 2.5; d.z = Math.sin(a) * rr * l / 2.5;
        this._clamp(it);
        if (!this._collides(it)) break;
      }
      this._clamp(it);
    }
    this.select(it.d.uid);
    this._changed();
    return it;
  }

  _addItem(d) {
    const p = byId[d.id];
    const model = buildModel(p, d.cfg);
    if (this.evening) model.userData.light?.set(true);
    const box = new THREE.Box3().setFromObject(model);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    model.position.set(-cx, 0, -cz);
    const g = new THREE.Group();
    g.add(model);
    g.userData.uid = d.uid;
    const it = { d, g, model, hx: (box.max.x - box.min.x) / 2, hz: (box.max.z - box.min.z) / 2, h: box.max.y, flat: !!model.userData.flat, p };
    this.items.set(d.uid, it);
    this.itemsG.add(g);
    this._sync(it);
    return it;
  }

  _sync(it) {
    it.g.position.set(it.d.x, it.flat ? 0 : 0.0005, it.d.z);
    it.g.rotation.y = it.d.rot;
    this.kick();
  }

  _ext(it) {
    const c = Math.abs(Math.cos(it.d.rot)), s = Math.abs(Math.sin(it.d.rot));
    return { ex: c * it.hx + s * it.hz, ez: s * it.hx + c * it.hz };
  }

  _clamp(it) {
    const { w, l } = this.state.room, { ex, ez } = this._ext(it);
    it.d.x = ex * 2 > w ? 0 : Math.max(-w / 2 + ex, Math.min(w / 2 - ex, it.d.x));
    it.d.z = ez * 2 > l ? 0 : Math.max(-l / 2 + ez, Math.min(l / 2 - ez, it.d.z));
    this._sync(it);
  }

  // Пересечение повёрнутых прямоугольников (теорема о разделяющей оси).
  _overlap(a, b) {
    const corners = (it) => {
      const c = Math.cos(it.d.rot), s = Math.sin(it.d.rot), pts = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = sx * (it.hx - 0.01), lz = sz * (it.hz - 0.01);
        pts.push([it.d.x + lx * c + lz * s, it.d.z - lx * s + lz * c]);
      }
      return pts;
    };
    const A = corners(a), B = corners(b);
    for (const poly of [A, B]) for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4], nx = z2 - z1, nz = x1 - x2;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, z] of A) { const v = x * nx + z * nz; amin = Math.min(amin, v); amax = Math.max(amax, v); }
      for (const [x, z] of B) { const v = x * nx + z * nz; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
      if (amax <= bmin || bmax <= amin) return false;
    }
    return true;
  }

  _collides(it) {
    if (it.flat) return false;
    for (const o of this.items.values()) if (o !== it && !o.flat && this._overlap(it, o)) return true;
    return false;
  }

  select(uid) {
    this.sel = uid == null ? null : this.items.get(uid) || null;
    this._refreshSel();
    this.onSelect(this.sel ? { ...this.sel.d, product: this.sel.p } : null);
    this.kick();
  }

  removeSelected() {
    const it = this.sel;
    if (!it) return;
    this.itemsG.remove(it.g); disposeObject(it.g);
    this.items.delete(it.d.uid);
    this.select(null);
    this._changed();
  }

  duplicateSelected() {
    const it = this.sel;
    if (!it) return;
    const n = this.addItem(it.d.id, it.d.cfg, { x: it.d.x + 0.3, z: it.d.z + 0.3, rot: it.d.rot });
    this._clamp(n);
    this._refreshSel();
  }

  rotateSelected(deg) {
    const it = this.sel;
    if (!it) return;
    it.d.rot = Math.round((it.d.rot + THREE.MathUtils.degToRad(deg)) / (Math.PI / 72)) * (Math.PI / 72);
    this._clamp(it);
    this._refreshSel();
    this._changed();
  }

  setSelectedCfg(cfg) {
    const it = this.sel;
    if (!it) return;
    const d = { ...it.d, cfg: normalizeCfg(it.p, { ...it.d.cfg, ...cfg }) };
    this.itemsG.remove(it.g); disposeObject(it.g);
    this.items.delete(it.d.uid);
    const n = this._addItem(d);
    this._clamp(n);
    this.select(n.d.uid);
    this._changed();
  }

  /* ------------------------------ выделение ------------------------------ */

  _refreshSel() {
    this.selG.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.selG.clear();
    this.labels.innerHTML = '';
    this.selLabels = [];
    const it = this.sel;
    if (!it) { this.kick(); return; }
    const bad = this._collides(it);
    const col = bad ? '#c2412d' : '#2f4b3d';
    const c = Math.cos(it.d.rot), s = Math.sin(it.d.rot), pts = [];
    const pad = 0.04;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      const lx = sx * (it.hx + pad), lz = sz * (it.hz + pad);
      pts.push(new THREE.Vector3(it.d.x + lx * c + lz * s, 0.012, it.d.z - lx * s + lz * c));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, depthTest: false }));
    line.renderOrder = 5;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry((it.hx + pad) * 2, (it.hz + pad) * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, depthWrite: false }));
    fill.position.set(it.d.x, 0.011, it.d.z); fill.rotation.y = it.d.rot;
    this.selG.add(fill, line);

    // расстояния до ближайших стен по x и z
    const { w, l } = this.state.room, { ex, ez } = this._ext(it);
    const gx = it.d.x >= 0 ? w / 2 - (it.d.x + ex) : (it.d.x - ex) + w / 2;
    const gz = it.d.z >= 0 ? l / 2 - (it.d.z + ez) : (it.d.z - ez) + l / 2;
    const dm = new THREE.LineDashedMaterial({ color: '#6f685f', dashSize: 0.05, gapSize: 0.04, depthTest: false });
    const seg = (a, b, text) => {
      if (a.distanceTo(b) < 0.03) return;
      const l2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), dm);
      l2.computeLineDistances(); l2.renderOrder = 5;
      this.selG.add(l2);
      const el = document.createElement('span');
      el.className = 'dim-label small'; el.textContent = text;
      this.labels.appendChild(el);
      this.selLabels.push({ el, at: a.clone().add(b).multiplyScalar(0.5) });
    };
    const cm = (v) => Math.round(v * 100) + ' см';
    const sx = Math.sign(it.d.x) || 1, sz = Math.sign(it.d.z) || 1;
    seg(new THREE.Vector3(it.d.x + sx * ex, 0.02, it.d.z), new THREE.Vector3(sx * w / 2, 0.02, it.d.z), cm(gx));
    seg(new THREE.Vector3(it.d.x, 0.02, it.d.z + sz * ez), new THREE.Vector3(it.d.x, 0.02, sz * l / 2), cm(gz));
    const head = document.createElement('span');
    head.className = 'dim-label tag' + (bad ? ' bad' : '');
    head.textContent = bad ? 'Пересекается с другим предметом' : `${cm(it.hx * 2)} × ${cm(it.hz * 2)}`;
    this.labels.appendChild(head);
    this.selLabels.push({ el: head, at: new THREE.Vector3(it.d.x, it.h + 0.15, it.d.z) });
    this.kick();
  }

  _placeLabels() {
    if (!this.selLabels) return;
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new THREE.Vector3();
    for (const it of this.selLabels) {
      v.copy(it.at).project(this.camera);
      it.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      it.el.style.opacity = v.z < 1 ? 1 : 0;
    }
  }

  /* ------------------------------ ввод ------------------------------ */

  _pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
  }
  _floorHit() {
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  _down = (e) => {
    if (e.button !== 0) return;
    this._pick(e);
    const hits = this.ray.intersectObjects(this.itemsG.children, true);
    // ковры выбираются, только если сверху ничего нет
    const hit = hits.find((h) => !this._itemOf(h.object)?.flat) || hits[0];
    const it = hit && this._itemOf(hit.object);
    this.downAt = { x: e.clientX, y: e.clientY, it };
    if (it) {
      e.stopImmediatePropagation();
      const f = this._floorHit();
      this.select(it.d.uid);
      this.drag = { it, off: f ? new THREE.Vector2(it.d.x - f.x, it.d.z - f.z) : new THREE.Vector2(), moved: false };
      this.controls.enabled = false;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.host.classList.add('dragging');
    }
  };

  _move = (e) => {
    if (!this.drag) {
      if (e.target === this.canvas && !e.buttons) {
        this._pick(e);
        const hit = this.ray.intersectObjects(this.itemsG.children, true)[0];
        this.host.classList.toggle('can-grab', !!hit);
      }
      return;
    }
    this._pick(e);
    const f = this._floorHit();
    if (!f) return;
    const it = this.drag.it;
    let x = f.x + this.drag.off.x, z = f.z + this.drag.off.y;
    if (this.snap !== false && !e.altKey) { x = Math.round(x / SNAP) * SNAP; z = Math.round(z / SNAP) * SNAP; }
    it.d.x = x; it.d.z = z;
    this._clamp(it);
    this.drag.moved = true;
    this._refreshSel();
  };

  _up = (e) => {
    if (this.drag) {
      const moved = this.drag.moved;
      this.drag = null;
      this.controls.enabled = true;
      this.host.classList.remove('dragging');
      if (moved) this._changed();
    } else if (this.downAt && e.target === this.canvas && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5 && !this.downAt.it) {
      this.select(null);
    }
    this.downAt = null;
  };

  _itemOf(obj) {
    while (obj && obj.userData.uid == null) obj = obj.parent;
    return obj ? this.items.get(obj.userData.uid) : null;
  }

  /* ------------------------------ вид ------------------------------ */

  home(instant) {
    const { w, l } = this.state.room;
    if (this.view === 'top') {
      const d = Math.max(w / this.camera.aspect, l) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15 + WALL_H;
      this._tweenTo(new THREE.Vector3(0, d, 0.001), new THREE.Vector3(0, 0, 0), instant);
    } else {
      const d = Math.max(w, l) * 1.25 + 1.5;
      this._tweenTo(new THREE.Vector3(d * 0.55, d * 0.72, d * 0.8), new THREE.Vector3(0, 0.3, 0), instant);
    }
  }

  setView(v) {
    this.view = v;
    this.controls.enableRotate = v !== 'top';
    this.controls.maxPolarAngle = v === 'top' ? 0.01 : 1.45;
    this.controls.minPolarAngle = 0;
    this.home();
  }

  setEvening(on) {
    this.evening = on;
    for (const it of this.items.values()) it.model.userData.light?.set(on);
    this._applyLighting();
  }

  _applyLighting() {
    const ev = this.evening;
    this.sun.intensity = ev ? 0.25 : 2.2;
    this.sun.color.set(ev ? '#9fb2d6' : '#fff1dc');
    this.hemi.intensity = ev ? 0.08 : 0.35;
    this.scene.environmentIntensity = ev ? 0.14 : 0.65;
    const bg = ev ? '#2b2a2c' : '#e9e3da';
    this.scene.background.set(bg);
    this.kick();
  }

  _tweenTo(pos, target, instant) {
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.kick(); return; }
    this.tween = { fp: this.camera.position.clone(), ft: this.controls.target.clone(), tp: pos, tt: target, k: 0 };
    this.kick();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  kick() { this.dirty = true; if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this._frame); }

  _frame = (now) => {
    this.raf = 0;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    let active = false;
    if (this.tween) {
      const t = this.tween;
      t.k = Math.min(1, t.k + dt / 0.75);
      const e = 1 - Math.pow(1 - t.k, 3);
      this.camera.position.lerpVectors(t.fp, t.tp, e);
      this.controls.target.lerpVectors(t.ft, t.tt, e);
      if (t.k >= 1) this.tween = null;
      active = true;
    }
    if (this.controls.update(dt)) active = true;
    if (active || this.dirty) {
      this._hideWalls();
      this.renderer.render(this.scene, this.camera);
      this._placeLabels();
      this.dirty = false;
    }
    if (active) this.kick(); else this.last = 0;
  };

  // Стены между камерой и комнатой прячем, чтобы было видно мебель.
  _hideWalls() {
    const c = this.camera.position;
    for (const wl of this.walls) {
      const n = wl.userData.n;
      wl.visible = !(c.x * n.x + c.z * n.y > wl.userData.off - 0.05 && c.y < 30);
    }
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    this.controls.dispose();
    for (const it of this.items.values()) disposeObject(it.g);
    this.roomG.traverse((o) => o.geometry?.dispose());
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove(); this.labels.remove();
  }
}

// Абстрактная картина для стены: мягкие цветовые пятна.
let artTex = null;
function artTexture() {
  if (artTex) return artTex;
  const c = document.createElement('canvas'); c.width = 360; c.height = 248;
  const g = c.getContext('2d');
  g.fillStyle = '#f3eee5'; g.fillRect(0, 0, 360, 248);
  g.fillStyle = '#f8f5ef'; g.fillRect(18, 18, 324, 212);
  const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.3, 0, Math.PI * 2); g.fill(); };
  blob(130, 125, 62, '#c67b55'); blob(215, 110, 48, '#2f4b3d'); blob(190, 165, 30, '#d8b26a');
  g.strokeStyle = '#1f1d1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(80, 190); g.bezierCurveTo(150, 140, 220, 210, 290, 150); g.stroke();
  artTex = new THREE.CanvasTexture(c);
  artTex.colorSpace = THREE.SRGBColorSpace;
  return artTex;
}
