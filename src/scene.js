/* ==========================================================================
   Физлаб 3D · отрисовка на Three.js
   Одинаковые формы рисуются одним InstancedMesh: тысяча ящиков — один вызов
   отрисовки. Размер формы задаётся масштабом экземпляра.
   ========================================================================== */

import * as THREE from 'three';
import { SCENE_THEMES } from './data.js';
import { Q } from './physics.js';

const POOL_KINDS = ['box', 'ball', 'cylinder', 'cone'];

function unitGeometry(kind) {
  switch (kind) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'ball': return new THREE.SphereGeometry(1, 28, 18);
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1, 28);
    case 'cone': return new THREE.ConeGeometry(1, 1, 28);
  }
}
function shapeScale(o, grow = 0) {
  const s = o.size;
  switch (o.kind) {
    case 'box': return [s.w + grow, s.h + grow, s.d + grow];
    case 'ball': return [s.r + grow / 2, s.r + grow / 2, s.r + grow / 2];
    default: return [s.r + grow / 2, s.h + grow, s.r + grow / 2];
  }
}

function gridTexture(th) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = th.ground; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = th.grid; g.lineWidth = 2;
  for (let i = 1; i < 5; i++) { const p = i * 512 / 5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  g.strokeStyle = th.gridMajor; g.lineWidth = 4;
  g.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SceneView {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    // небо — градиентная сфера
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vp; void main(){ float h = clamp(vp.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    // пол
    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    this.groundMeshes = new Map();

    // общие материалы
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    this.pools = {};
    for (const k of POOL_KINDS) this._makePool(k, 256);
    this.capsules = new Map();
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false });
    this.glass = new Map();

    // соединения, векторы, следы
    this.lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(3 * 2 * 20000);
    this.lineCol = new Float32Array(3 * 2 * 20000);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial(), 512);
    this.dots.frustumCulled = false; this.dots.count = 0;
    this.scene.add(this.dots);
    this.trails = new Map();

    // выделение и предпросмотр
    this.outlineMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 1 });
    this.hoverMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0.45 });
    this.outline = new THREE.Mesh(unitGeometry('box'), this.outlineMat);
    this.hoverMesh = new THREE.Mesh(unitGeometry('box'), this.hoverMat);
    this.outline.visible = this.hoverMesh.visible = false;
    this.scene.add(this.outline, this.hoverMesh);
    this.ghostMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.4 });
    this.ghost = new THREE.Mesh(unitGeometry('box'), this.ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.guides = []; // отрезки предпросмотра инструментов
    this.effects = [];
    this.fxGeo = new THREE.SphereGeometry(1, 24, 16);

    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._q2 = new THREE.Quaternion(); this._c = new THREE.Color();
    this._ray = new THREE.Raycaster(); this._ndc = new THREE.Vector2();
    this.labelsEl = document.getElementById('labels');
    this.labelEls = new Map();
    this.W = 1; this.H = 1;
    this.applyTheme();
  }

  _makePool(kind, cap) {
    const old = this.pools[kind];
    const mesh = new THREE.InstancedMesh(old ? old.mesh.geometry : unitGeometry(kind), this.bodyMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    if (old) { this.scene.remove(old.mesh); old.mesh.dispose(); }
    this.scene.add(mesh);
    this.pools[kind] = { mesh, cap, keys: new Array(cap).fill('') };
  }

  applyTheme() {
    const th = this.th = SCENE_THEMES[this.app.themeName] || SCENE_THEMES.dark;
    this.skyMat.uniforms.top.value.set(th.sky).offsetHSL(0, 0, this.app.themeName === 'dark' ? 0.04 : 0.02);
    this.skyMat.uniforms.bottom.value.set(th.fog);
    this.scene.fog = this.app.view.fog ? new THREE.Fog(th.fog, 60, 260) : null;
    this.hemi.color.set(th.hemiSky); this.hemi.groundColor.set(th.hemiGround); this.hemi.intensity = th.hemi;
    this.sun.intensity = th.sun;
    if (this.groundMat.map) this.groundMat.map.dispose();
    this.groundMat.map = gridTexture(th);
    this.groundMat.needsUpdate = true;
    for (const [o, m] of this.groundMeshes) { m.material.map = this.groundMat.map; m.material.needsUpdate = true; void o; }
    this.outlineMat.color.set(th.accent); this.hoverMat.color.set(th.accent);
    this.ghostMat.color.set(th.accent);
    this.dots.material.color.set(th.joint);
    for (const p of Object.values(this.pools)) p.keys.fill('');
  }

  applyQuality() {
    const v = this.app.view;
    const cap = v.quality === 'low' ? 0.75 : v.quality === 'medium' ? 1 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    const shadows = v.shadows && v.quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const size = v.quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.fog = v.fog ? new THREE.Fog(this.th.fog, 60, 260) : null;
    for (const m of [this.bodyMat, this.groundMat, this.glassMat]) m.needsUpdate = true;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width); this.H = Math.max(1, rect.height);
    this.renderer.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.userData.h = this.H;
    this.camera.updateProjectionMatrix();
  }

  /** Луч из точки экрана: { origin, dir }. */
  ray(sx, sy) {
    this._ndc.set(sx / this.W * 2 - 1, -(sy / this.H) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    return { origin: { x: o.x, y: o.y, z: o.z }, dir: { x: d.x, y: d.y, z: d.z } };
  }

  project(p) {
    const v = this._p.set(p.x, p.y, p.z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, behind: v.z > 1 };
  }

  /* ------------------------------ кадр ------------------------------ */

  render(alpha, dt) {
    const app = this.app, objs = app.physics.objs, view = app.view, th = this.th;
    const m = this._m, P = this._p, Qt = this._q, S = this._s, C = this._c;
    const counts = { box: 0, ball: 0, cylinder: 0, cone: 0 };
    const changed = { box: false, ball: false, cylinder: false, cone: false };
    const seenCaps = new Set(), seenGlass = new Set(), seenGround = new Set();
    const smooth = view.smooth && alpha < 1;

    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      let px = o.p.x, py = o.p.y, pz = o.p.z;
      let q = o.q;
      if (smooth && !o.isStatic && !o.sleeping) {
        px = o.p0.x + (o.p.x - o.p0.x) * alpha; py = o.p0.y + (o.p.y - o.p0.y) * alpha; pz = o.p0.z + (o.p.z - o.p0.z) * alpha;
        this._q2.set(o.q0.x, o.q0.y, o.q0.z, o.q0.w).slerp(Qt.set(o.q.x, o.q.y, o.q.z, o.q.w), alpha);
        q = { x: this._q2.x, y: this._q2.y, z: this._q2.z, w: this._q2.w };
      }
      o.rp = { x: px, y: py, z: pz }; o.rq = q;
      const sq = Q.mul(q, o.crot);
      P.set(px, py, pz); Qt.set(sq.x, sq.y, sq.z, sq.w);

      if (o.ground) {
        let g = this.groundMeshes.get(o);
        if (!g) {
          g = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.groundMat.clone());
          g.material.map = this.groundMat.map;
          g.receiveShadow = true;
          this.scene.add(g); this.groundMeshes.set(o, g);
        }
        g.position.copy(P); g.quaternion.copy(Qt);
        g.scale.set(o.size.w, o.size.h, o.size.d);
        const map = g.material.map;
        if (map) { map.repeat.set(o.size.w / 5, o.size.d / 5); }
        seenGround.add(o);
        continue;
      }
      if (o.glass) {
        let g = this.glass.get(o);
        if (!g) { g = new THREE.Mesh(unitGeometry(o.kind === 'box' ? 'box' : o.kind), this.glassMat); this.scene.add(g); this.glass.set(o, g); }
        g.position.copy(P); g.quaternion.copy(Qt); g.scale.set(...shapeScale(o));
        seenGlass.add(o);
        continue;
      }
      let col = o.color || th.static;
      if (view.dimSleeping && o.sleeping) col += '~';
      if (o.kind === 'capsule') {
        let c = this.capsules.get(o);
        const key = o.size.r + ':' + o.size.h;
        if (!c || c.userData.key !== key) {
          if (c) { this.scene.remove(c); c.geometry.dispose(); }
          c = new THREE.Mesh(new THREE.CapsuleGeometry(o.size.r, o.size.h, 8, 20), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
          c.castShadow = c.receiveShadow = true; c.userData.key = key;
          this.scene.add(c); this.capsules.set(o, c);
        }
        if (c.userData.col !== col) { c.material.color.set(col.replace('~', '')); if (col.endsWith('~')) c.material.color.lerp(C.set(th.static), 0.45); c.userData.col = col; }
        c.position.copy(P); c.quaternion.copy(Qt);
        seenCaps.add(o);
        continue;
      }
      const pool = this.pools[o.kind];
      let n = counts[o.kind];
      if (n >= pool.cap) { this._makePool(o.kind, pool.cap * 2); return this.render(alpha, dt); }
      const sc = shapeScale(o);
      S.set(sc[0], sc[1], sc[2]);
      m.compose(P, Qt, S);
      const pm = this.pools[o.kind];
      pm.mesh.setMatrixAt(n, m);
      if (pm.keys[n] !== col) {
        C.set(col.replace('~', ''));
        if (col.endsWith('~')) C.lerp(this._c2 || (this._c2 = new THREE.Color()).set(th.static), 0.45);
        pm.mesh.setColorAt(n, C);
        pm.keys[n] = col;
        changed[o.kind] = true;
      }
      counts[o.kind] = n + 1;
    }
    for (const k of POOL_KINDS) {
      const pm = this.pools[k];
      pm.mesh.count = counts[k];
      pm.mesh.instanceMatrix.needsUpdate = true;
      if (changed[k] && pm.mesh.instanceColor) pm.mesh.instanceColor.needsUpdate = true;
    }
    for (const [o, c] of this.capsules) if (!seenCaps.has(o)) { this.scene.remove(c); c.geometry.dispose(); c.material.dispose(); this.capsules.delete(o); }
    for (const [o, g] of this.glass) if (!seenGlass.has(o)) { this.scene.remove(g); this.glass.delete(o); }
    for (const [o, g] of this.groundMeshes) if (!seenGround.has(o)) { this.scene.remove(g); g.material.dispose(); this.groundMeshes.delete(o); }

    this._drawLines();
    this._drawTrails();
    this._drawHighlight(this.outline, app.selected, 0.07);
    this._drawHighlight(this.hoverMesh, app.hover && app.hover !== app.selected ? app.hover : null, 0.04);
    this._drawEffects(dt);
    this._drawLabels();

    // солнце и тени следуют за камерой
    const t = app.cam.target, d = app.cam.dist;
    const ext = Math.max(12, Math.min(90, d * 0.9));
    this.sun.position.set(t.x + ext * 0.6, t.y + ext * 1.2, t.z + ext * 0.45);
    this.sun.target.position.set(t.x, t.y, t.z);
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = ext * 4; sc.updateProjectionMatrix(); }
    this.sky.position.copy(this.camera.position);

    this.renderer.render(this.scene, this.camera);
  }

  _drawHighlight(mesh, o, grow) {
    if (!o || !o.kind || o.ground) { mesh.visible = false; return; }
    const kind = o.kind === 'capsule' ? 'capsule' : o.kind;
    const key = kind + (kind === 'capsule' ? o.size.r + ':' + o.size.h + ':' + grow : '');
    if (mesh.userData.key !== key) {
      mesh.geometry.dispose();
      mesh.geometry = kind === 'capsule' ? new THREE.CapsuleGeometry(o.size.r + grow / 2, o.size.h, 6, 16) : unitGeometry(kind);
      mesh.userData.key = key;
    }
    const p = o.rp || o.p, q = Q.mul(o.rq || o.q, o.crot);
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);
    if (kind === 'capsule') mesh.scale.set(1, 1, 1); else mesh.scale.set(...shapeScale(o, grow));
    mesh.visible = true;
  }

  /* --------------------------- линии и точки --------------------------- */

  _drawLines() {
    const app = this.app, th = this.th, P = this.linePos, Cc = this.lineCol;
    let n = 0;
    const cj = new THREE.Color(th.joint), ca = new THREE.Color(th.accent), cv = new THREE.Color('#3ddc97');
    const seg = (a, b, c) => {
      if (n >= 40000 - 2) return;
      P[n * 3] = a.x; P[n * 3 + 1] = a.y; P[n * 3 + 2] = a.z; Cc[n * 3] = c.r; Cc[n * 3 + 1] = c.g; Cc[n * 3 + 2] = c.b; n++;
      P[n * 3] = b.x; P[n * 3 + 1] = b.y; P[n * 3 + 2] = b.z; Cc[n * 3] = c.r; Cc[n * 3 + 1] = c.g; Cc[n * 3 + 2] = c.b; n++;
    };
    let dots = 0;
    const dot = (p, r) => {
      if (dots >= 512) return;
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q.identity(), this._s.set(r, r, r));
      this.dots.setMatrixAt(dots++, this._m);
    };
    const tw = (o, l) => { const p = o.rp || o.p, q = o.rq || o.q; const r = Q.rot(q, l); return { x: p.x + r.x, y: p.y + r.y, z: p.z + r.z }; };
    const g = app.physics.gravity, gl = Math.hypot(g.x, g.y, g.z) || 1;
    for (const j of app.physics.joints) {
      const sel = app.selected === j;
      if (j.hidden && !sel) continue;
      const a = j.a ? tw(j.a, j.la) : j.la, b = tw(j.b, j.lb), c = sel ? ca : cj;
      switch (j.type) {
        case 'spring': {
          const ax = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L = Math.hypot(ax.x, ax.y, ax.z) || 1e-6;
          const u = { x: ax.x / L, y: ax.y / L, z: ax.z / L };
          const t = Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
          let e1 = { x: u.y * t.z - u.z * t.y, y: u.z * t.x - u.x * t.z, z: u.x * t.y - u.y * t.x };
          const l1 = Math.hypot(e1.x, e1.y, e1.z); e1 = { x: e1.x / l1, y: e1.y / l1, z: e1.z / l1 };
          const e2 = { x: u.y * e1.z - u.z * e1.y, y: u.z * e1.x - u.x * e1.z, z: u.x * e1.y - u.y * e1.x };
          const R = Math.min(0.14, 0.05 + L * 0.02), coils = 10, steps = coils * 10, lead = Math.min(0.15, L * 0.1);
          let prev = a;
          const s0 = { x: a.x + u.x * lead, y: a.y + u.y * lead, z: a.z + u.z * lead };
          seg(a, s0, c); prev = s0;
          for (let i = 1; i <= steps; i++) {
            const f = i / steps, ang = f * coils * Math.PI * 2, d = lead + (L - 2 * lead) * f, cs = Math.cos(ang) * R, sn = Math.sin(ang) * R;
            const env = Math.min(1, Math.min(f, 1 - f) * 12);
            const p = { x: a.x + u.x * d + (e1.x * cs + e2.x * sn) * env, y: a.y + u.y * d + (e1.y * cs + e2.y * sn) * env, z: a.z + u.z * d + (e1.z * cs + e2.z * sn) * env };
            seg(prev, p, c); prev = p;
          }
          seg(prev, b, c);
          dot(a, 0.05); dot(b, 0.05);
          break;
        }
        case 'rope': {
          const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          if (d < j.length * 0.999) {
            const sag = Math.sqrt(j.length * j.length - d * d) * 0.5 * 1.4;
            const mid = { x: (a.x + b.x) / 2 + g.x / gl * sag, y: (a.y + b.y) / 2 + g.y / gl * sag, z: (a.z + b.z) / 2 + g.z / gl * sag };
            let prev = a;
            for (let i = 1; i <= 16; i++) {
              const t = i / 16, k0 = (1 - t) * (1 - t), k1 = 2 * t * (1 - t), k2 = t * t;
              const p = { x: k0 * a.x + k1 * mid.x + k2 * b.x, y: k0 * a.y + k1 * mid.y + k2 * b.y, z: k0 * a.z + k1 * mid.z + k2 * b.z };
              seg(prev, p, c); prev = p;
            }
          } else seg(a, b, c);
          dot(a, 0.04); dot(b, 0.04);
          break;
        }
        case 'hinge': {
          const axis = j.a ? Q.rot(j.a.rq || j.a.q, j.axis) : j.axis;
          const h = 0.3;
          seg({ x: b.x - axis.x * h, y: b.y - axis.y * h, z: b.z - axis.z * h }, { x: b.x + axis.x * h, y: b.y + axis.y * h, z: b.z + axis.z * h }, sel ? ca : (j.motor ? ca : c));
          dot(b, 0.06);
          break;
        }
        case 'ball': dot(b, 0.07); if (j.a) seg(a, b, c); break;
        case 'weld': dot(b, 0.05); if (j.a) seg(a, b, c); break;
      }
    }
    // перетаскивание
    const grab = app.tools && app.tools.grab;
    if (grab && grab.target && grab.obj.rb) {
      const p = tw(grab.obj, grab.local);
      seg(p, grab.target, ca); dot(grab.target, 0.05);
    }
    if (app.view.velocity) {
      for (const o of app.physics.objs) {
        if (o.isStatic || o.sleeping || !o.rb) continue;
        const v = o.rb.linvel(), sp = Math.hypot(v.x, v.y, v.z);
        if (sp < 0.05) continue;
        const p = o.rp || o.p, e = { x: p.x + v.x * 0.2, y: p.y + v.y * 0.2, z: p.z + v.z * 0.2 };
        seg(p, e, cv);
      }
    }
    for (const gd of this.guides) seg(gd[0], gd[1], gd[2] ? new THREE.Color(gd[2]) : ca);
    for (const gd of this.guides) if (gd[3]) dot(gd[1], gd[3]);
    this.lineGeo.setDrawRange(0, n);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;
    this.dots.count = dots;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  _drawTrails() {
    const objs = this.app.physics.objs, on = this.app.view.trails;
    const seen = new Set();
    if (on) for (const o of objs) {
      if (!o.trail || !o.trailBuf || o.trailLen < 2) continue;
      let t = this.trails.get(o);
      if (!t || t.userData.buf !== o.trailBuf) {
        if (t) { this.scene.remove(t); t.geometry.dispose(); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(o.trailBuf, 3).setUsage(THREE.DynamicDrawUsage));
        t = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: o.color || this.th.accent, transparent: true, opacity: 0.8 }));
        t.frustumCulled = false; t.userData.buf = o.trailBuf;
        this.scene.add(t); this.trails.set(o, t);
      }
      t.geometry.setDrawRange(0, o.trailLen);
      t.geometry.attributes.position.needsUpdate = true;
      t.material.color.set(o.color || this.th.accent);
      seen.add(o);
    }
    for (const [o, t] of this.trails) if (!seen.has(o)) { this.scene.remove(t); t.geometry.dispose(); t.material.dispose(); this.trails.delete(o); }
  }

  _drawLabels() {
    const el = this.labelsEl, seen = new Set();
    if (!el) return;
    for (const o of this.app.physics.objs) {
      if (!o.label) continue;
      const p = o.rp || o.p;
      const s = this.project({ x: p.x, y: p.y + o.bound + 0.25, z: p.z });
      let d = this.labelEls.get(o);
      if (!d) { d = document.createElement('span'); d.className = 'lbl'; el.append(d); this.labelEls.set(o, d); }
      if (d.textContent !== o.label) d.textContent = o.label;
      const vis = !s.behind && s.x > -50 && s.x < this.W + 50 && s.y > -20 && s.y < this.H + 20;
      d.style.display = vis ? '' : 'none';
      if (vis) d.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      seen.add(o);
    }
    for (const [o, d] of this.labelEls) if (!seen.has(o)) { d.remove(); this.labelEls.delete(o); }
  }

  /* ---------------------- предпросмотр инструментов ---------------------- */

  showGhost(kind, size, pos, rot) {
    if (!kind) { this.ghost.visible = false; return; }
    const key = kind + (kind === 'capsule' ? size.r + ':' + size.h : '');
    if (this.ghost.userData.key !== key) {
      this.ghost.geometry.dispose();
      this.ghost.geometry = kind === 'capsule' ? new THREE.CapsuleGeometry(size.r, size.h, 6, 16) : unitGeometry(kind);
      this.ghost.userData.key = key;
    }
    this.ghost.position.set(pos.x, pos.y, pos.z);
    this.ghost.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    if (kind === 'capsule') this.ghost.scale.set(1, 1, 1);
    else this.ghost.scale.set(...shapeScale({ kind, size }));
    this.ghost.visible = true;
  }

  addEffect(p, r, color = '#ffa94d', dur = 0.45) {
    const mesh = new THREE.Mesh(this.fxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
    mesh.position.set(p.x, p.y, p.z);
    this.scene.add(mesh);
    this.effects.push({ mesh, r, t: 0, dur });
  }

  _drawEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1) { this.scene.remove(e.mesh); e.mesh.material.dispose(); this.effects.splice(i, 1); continue; }
      const s = e.r * (0.15 + 0.85 * k);
      e.mesh.scale.set(s, s, s);
      e.mesh.material.opacity = 0.35 * (1 - k);
    }
  }
}
