/* ==========================================================================
   Ясень · 3D-сцена: студийный свет, контактная тень, просмотрщик, миниатюры
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { disposeObject } from './models.js';
import * as M from './materials.js';

export function makeRenderer(canvas, { alpha = true, shadows = false, pixelRatio } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 0.92;
  r.shadowMap.enabled = shadows;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setClearColor(0x000000, 0);
  return r;
}

export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pm.fromScene(room, 0.035).texture;
  room.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  pm.dispose();
  return env;
}

/* ------------------------------ контактная тень ------------------------------ */

const BLUR_FRAG = `
  uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
  void main() {
    vec4 s = vec4(0.0);
    s += texture2D(tDiffuse, vUv - 4.0 * dir) * 0.051;
    s += texture2D(tDiffuse, vUv - 3.0 * dir) * 0.0918;
    s += texture2D(tDiffuse, vUv - 2.0 * dir) * 0.12245;
    s += texture2D(tDiffuse, vUv - 1.0 * dir) * 0.1531;
    s += texture2D(tDiffuse, vUv) * 0.1633;
    s += texture2D(tDiffuse, vUv + 1.0 * dir) * 0.1531;
    s += texture2D(tDiffuse, vUv + 2.0 * dir) * 0.12245;
    s += texture2D(tDiffuse, vUv + 3.0 * dir) * 0.0918;
    s += texture2D(tDiffuse, vUv + 4.0 * dir) * 0.051;
    gl_FragColor = s;
  }`;

export class ContactShadow {
  constructor(res = 512) {
    this.res = res;
    const opt = { type: THREE.HalfFloatType };
    this.rt = new THREE.WebGLRenderTarget(res, res, opt);
    this.rt2 = new THREE.WebGLRenderTarget(res, res, opt);
    this.rt.texture.generateMipmaps = this.rt2.texture.generateMipmaps = false;
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false }),
    );
    this.plane.renderOrder = -1;
    this.plane.position.y = 0.0015;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.depth = new THREE.MeshDepthMaterial();
    this.depth.onBeforeCompile = (sh) => {
      sh.uniforms.darkness = { value: 1.35 };
      sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), clamp(( 1.0 - fragCoordZ ) * darkness, 0.0, 1.0) );',
      );
    };
    this.depth.depthTest = this.depth.depthWrite = false;
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _blur(renderer, amount) {
    const b = this.blurMat;
    b.uniforms.tDiffuse.value = this.rt.texture; b.uniforms.dir.value.set(amount / this.res, 0);
    renderer.setRenderTarget(this.rt2); renderer.render(this.quadScene, this.quadCam);
    b.uniforms.tDiffuse.value = this.rt2.texture; b.uniforms.dir.value.set(0, amount / this.res);
    renderer.setRenderTarget(this.rt); renderer.render(this.quadScene, this.quadCam);
  }

  // Снимок «снизу вверх»: чем ближе деталь к полу, тем темнее пятно.
  update(renderer, scene, box, reach = 0.55) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + 0.8;
    this.plane.scale.set(-size, 1, size); // камера смотрит снизу: зеркалим по x
    this.plane.position.x = cx; this.plane.position.z = cz;
    const c = this.cam;
    c.left = -size / 2; c.right = size / 2; c.top = size / 2; c.bottom = -size / 2;
    c.near = 0; c.far = reach;
    c.position.set(cx, 0, cz);
    c.up.set(0, 0, -1);
    c.lookAt(cx, 1, cz);
    c.updateProjectionMatrix();
    const hidden = [];
    scene.traverse((o) => { if (o.visible && (o.userData.noContact || o === this.plane)) { hidden.push(o); o.visible = false; } });
    const bg = scene.background, ov = scene.overrideMaterial, prevRT = renderer.getRenderTarget();
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    scene.background = null; scene.overrideMaterial = this.depth;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, c);
    scene.overrideMaterial = ov;
    this._blur(renderer, 1.6); this._blur(renderer, 0.7);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(cc, ca);
    scene.background = bg;
    for (const o of hidden) o.visible = true;
  }

  dispose() { this.rt.dispose(); this.rt2.dispose(); this.plane.geometry.dispose(); this.plane.material.dispose(); this.quad.geometry.dispose(); this.blurMat.dispose(); this.depth.dispose(); }
}

/* ------------------------------ базовая сцена ------------------------------ */

const VIEWS = {
  '34':    { az: 0.62, el: 0.36 },
  front:   { az: 0, el: 0.12 },
  side:    { az: Math.PI / 2, el: 0.12 },
  top:     { az: 0.0001, el: 1.5 },
  hero:    { az: 0.5, el: 0.36 },
  card:    { az: 0.58, el: 0.3 },
  card2:   { az: -0.5, el: 0.22 },
};

export class Stage {
  constructor(canvas, { shadows = false, alpha = true, pixelRatio } = {}) {
    this.canvas = canvas;
    this.renderer = makeRenderer(canvas, { alpha, shadows: true, pixelRatio });
    this.scene = new THREE.Scene();
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
    this.target = new THREE.Vector3();
    this.key = new THREE.DirectionalLight('#fff8ef', 1.6);
    this.key.position.set(-2.5, 5, 3.5);
    this.key.castShadow = shadows;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    this.fill = new THREE.HemisphereLight('#fdfbf7', '#cfc6b9', 0.2);
    this.scene.add(this.fill);
    this.contact = new ContactShadow();
    this.scene.add(this.contact.plane);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.model = null;
    this.box = new THREE.Box3();
  }

  setModel(model) {
    if (this.model) { this.root.remove(this.model); disposeObject(this.model); }
    this.model = model;
    if (model) this.root.add(model);
    this.measure();
    this.updateShadow();
  }

  measure() {
    if (!this.model) { this.box.makeEmpty(); return this.box; }
    this.model.updateMatrixWorld(true);
    this.box.makeEmpty();
    this.model.traverse((o) => { if (o.isMesh && o.visible && !o.userData.noBounds) this.box.expandByObject(o, false); });
    return this.box;
  }

  updateShadow() {
    if (!this.model) return;
    const b = this.box, s = this.key.shadow.camera, half = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y) * 0.8 + 1;
    s.left = -half; s.right = half; s.top = half; s.bottom = -half; s.near = 0.1; s.far = 30;
    s.updateProjectionMatrix();
    const c = b.getCenter(new THREE.Vector3());
    this.key.target.position.set(c.x, 0, c.z);
    this.key.position.set(c.x - 3, 7, c.z + 4.2);
    this.contact.update(this.renderer, this.scene, b);
  }

  // Камера так, чтобы модель целиком помещалась в кадр.
  viewFor(name = '34', pad = 1.12) {
    const v = VIEWS[name] || VIEWS['34'], b = this.box;
    const center = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const cam = this.camera, aspect = cam.aspect || 1;
    const dir = new THREE.Vector3(Math.sin(v.az) * Math.cos(v.el), Math.sin(v.el), Math.cos(v.az) * Math.cos(v.el));
    // проекция габаритного бокса на плоскость экрана
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = dir.clone().cross(right).normalize();
    let w = 0, h = 0, depth = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(center);
      w = Math.max(w, Math.abs(p.dot(right))); h = Math.max(h, Math.abs(p.dot(up))); depth = Math.max(depth, p.dot(dir));
    }
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), th = tv * aspect;
    const dist = Math.max(h / tv, w / th) * pad + depth * 0.55;
    return { target: center, position: center.clone().addScaledVector(dir, Math.max(dist, size.length() * 0.6)), dist };
  }

  applyView(v) {
    this.camera.position.copy(v.position);
    this.target.copy(v.target);
    this.camera.lookAt(this.target);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    if (this.model) disposeObject(this.model);
    this.contact.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/* ------------------------------ интерактивный просмотрщик ------------------------------ */

export class Viewer extends Stage {
  constructor(host, { autoRotate = true, interior = false, minPolar = 0.1, pan = false, zoom = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    host.appendChild(canvas);
    super(canvas, { shadows: true });
    this.host = host;
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, zoomSpeed: 0.8,
      enablePan: pan, enableZoom: zoom, minPolarAngle: minPolar, maxPolarAngle: Math.PI / 2 - 0.04,
      autoRotate, autoRotateSpeed: 0.55,
    });
    this.controls.target = this.target;
    this.controls.addEventListener('change', () => this.kick());
    this.controls.addEventListener('start', () => { this.userMoved = true; this.stopTween(); this.host.classList.add('grabbing'); this.onInteract?.(); });
    this.controls.addEventListener('end', () => this.host.classList.remove('grabbing'));
    this.dims = null;
    this.labels = document.createElement('div');
    this.labels.className = 'stage-labels';
    host.appendChild(this.labels);
    this.openState = { t: 0, target: 0 };
    this.tween = null;
    this.visible = true;
    this.raf = 0;
    this.last = 0;
    this.dirty = true;
    this.interior = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; if (this.visible) this.kick(); }, { rootMargin: '80px' });
    this.io.observe(host);
    this.resize();
    if (interior) this.setInterior(true);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.setSize(w, h);
    this.dirty = true;
    this.kick();
  }

  setModel(model, { view = '34', keepView = false, pad = 1.12 } = {}) {
    super.setModel(model);
    this.pad = pad;
    this.openState = { t: 0, target: 0 };
    if (this.interior) this._placeInterior();
    const v = this.viewFor(view, pad);
    this.controls.minDistance = v.dist * 0.35;
    this.controls.maxDistance = v.dist * 2.2;
    if (!keepView) this.applyView(v);
    if (this.dims) this.showDims(true);
    this.dirty = true;
    this.kick();
  }

  // Модель поменялась на месте (например, сменили диван в композиции).
  refresh() {
    this.measure();
    this.updateShadow();
    if (this.interior) this._placeInterior();
    this.dirty = true;
    this.kick();
  }

  // Плавный облёт к заданному ракурсу.
  goTo(view) {
    const v = this.viewFor(view, this.pad);
    const from = { p: this.camera.position.clone(), t: this.target.clone() };
    this.tween = { from, to: { p: v.position, t: v.target }, k: 0 };
    this.controls.autoRotate = false;
    this.kick();
  }
  stopTween() { this.tween = null; }

  setAutoRotate(on) { this.controls.autoRotate = on; this.kick(); }

  toggleOpen() {
    const o = this.model?.userData.open;
    if (!o) return false;
    this.openState.target = this.openState.target ? 0 : 1;
    this.kick();
    return !!this.openState.target;
  }

  toggleLight() {
    const L = this.model?.userData.light;
    if (!L) return false;
    L.set(!L.on);
    this.dirty = true; this.kick();
    return L.on;
  }

  /* ---------- интерьер: пол, стена, плинтус ---------- */
  setInterior(on) {
    if (on && !this.interior) {
      const g = new THREE.Group();
      const floorMat = M.misc.floor('oak-light');
      floorMat.map = floorMat.map.clone(); floorMat.map.repeat.set(0.5, 0.5); floorMat.map.needsUpdate = true;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), floorMat);
      floor.receiveShadow = true;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), M.misc.wall('#e8e1d6'));
      wall.receiveShadow = true;
      const skirting = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.015), M.misc.wall('#f1ece4'));
      skirting.castShadow = skirting.receiveShadow = true;
      g.add(floor, wall, skirting);
      g.traverse((o) => { o.userData.noContact = true; });
      this.interior = { g, floor, wall, skirting };
      this.scene.add(g);
      this.scene.background = new THREE.Color('#ece6dd');
      this.scene.fog = new THREE.Fog('#ece6dd', 9, 16);
      this.key.castShadow = true;
      this.key.intensity = 2.0;
      this.controls.minAzimuthAngle = -1.3; this.controls.maxAzimuthAngle = 1.3;
      this._placeInterior();
    } else if (!on && this.interior) {
      this.scene.remove(this.interior.g);
      this.interior.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      this.interior = null;
      this.scene.background = null; this.scene.fog = null;
      this.key.castShadow = false; this.key.intensity = 1.6;
      this.controls.minAzimuthAngle = -Infinity; this.controls.maxAzimuthAngle = Infinity;
    }
    this.dirty = true; this.kick();
  }

  _placeInterior() {
    const b = this.box, I = this.interior;
    if (b.isEmpty()) return;
    const z = b.min.z - 0.06, cx = (b.min.x + b.max.x) / 2;
    I.wall.position.set(cx, 2, z);
    I.skirting.position.set(cx, 0.04, z + 0.008);
    I.floor.position.set(cx, 0, z + 7);
  }

  /* ---------- размеры ---------- */
  showDims(on) {
    if (this.dims) { this.scene.remove(this.dims.group); this.dims.group.traverse((o) => o.geometry?.dispose()); this.dims = null; }
    this.labels.innerHTML = '';
    if (!on || !this.model) { this.dirty = true; this.kick(); return; }
    const b = this.box, mat = new THREE.LineBasicMaterial({ color: '#2b2722', depthTest: false, transparent: true, opacity: 0.85 });
    const group = new THREE.Group();
    group.renderOrder = 10;
    group.userData.noContact = true;
    const off = 0.12, tick = 0.035, items = [];
    const line = (a, c, axisTick, text) => {
      const pts = [a, c, a.clone().add(axisTick), a.clone().sub(axisTick), c.clone().add(axisTick), c.clone().sub(axisTick)];
      const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]);
      const l = new THREE.LineSegments(g, mat);
      l.renderOrder = 10;
      group.add(l);
      const el = document.createElement('span');
      el.className = 'dim-label'; el.textContent = text;
      this.labels.appendChild(el);
      items.push({ el, at: a.clone().add(c).multiplyScalar(0.5) });
    };
    const cm = (v) => Math.round(v * 100) + ' см';
    const W = b.max.x - b.min.x, D = b.max.z - b.min.z, H = b.max.y - b.min.y;
    line(new THREE.Vector3(b.min.x, 0.004, b.max.z + off), new THREE.Vector3(b.max.x, 0.004, b.max.z + off), new THREE.Vector3(0, 0, tick), cm(W));
    line(new THREE.Vector3(b.max.x + off, 0.004, b.min.z), new THREE.Vector3(b.max.x + off, 0.004, b.max.z), new THREE.Vector3(tick, 0, 0), cm(D));
    line(new THREE.Vector3(b.max.x + off, b.min.y, b.max.z + off), new THREE.Vector3(b.max.x + off, b.max.y, b.max.z + off), new THREE.Vector3(tick, 0, 0), cm(H));
    this.scene.add(group);
    this.dims = { group, items };
    this.dirty = true; this.kick();
  }

  _placeLabels() {
    if (!this.dims) return;
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new THREE.Vector3();
    for (const it of this.dims.items) {
      v.copy(it.at).project(this.camera);
      it.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      it.el.style.opacity = v.z < 1 ? 1 : 0;
    }
  }

  /* ---------- цикл: рисуем только когда что-то меняется ---------- */
  kick() { if (!this.raf && this.visible && !this.disposed) this.raf = requestAnimationFrame(this._frame); }

  _frame = (now) => {
    this.raf = 0;
    if (this.disposed || !this.visible) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    let active = false;
    if (this.tween) {
      const tw = this.tween;
      tw.k = Math.min(1, tw.k + dt / 0.7);
      const e = 1 - Math.pow(1 - tw.k, 3);
      this.camera.position.lerpVectors(tw.from.p, tw.to.p, e);
      this.target.lerpVectors(tw.from.t, tw.to.t, e);
      if (tw.k >= 1) this.tween = null;
      active = true;
    }
    if (this.controls.update(dt)) active = true;
    const os = this.openState;
    if (os.t !== os.target && this.model?.userData.open) {
      os.t += Math.sign(os.target - os.t) * dt / 0.9;
      os.t = Math.min(1, Math.max(0, os.t));
      if (Math.abs(os.t - os.target) < 1e-3) os.t = os.target;
      this.model.userData.open.set(os.t);
      if (os.t === os.target) { this.measure(); this.contact.update(this.renderer, this.scene, this.box); }
      active = true;
    }
    if (active || this.dirty) {
      this.render();
      this._placeLabels();
      this.dirty = false;
    }
    if (active || this.controls.autoRotate) this.kick();
    else this.last = 0;
  };

  snapshot(type = 'image/jpeg') {
    this.render();
    return this.canvas.toDataURL(type, 0.92);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect(); this.io.disconnect();
    this.controls.dispose();
    this.setInterior(false);
    super.dispose();
    this.canvas.remove(); this.labels.remove();
  }
}

/* ------------------------------ миниатюры ------------------------------ */

const THUMB_VER = 'v4';

export class Thumbnailer {
  constructor(w = 640, h = 480) {
    this.w = w; this.h = h;
    this.mem = new Map();
    this.queue = [];
    this.busy = false;
  }

  _stage() {
    if (!this.stage) {
      const c = document.createElement('canvas');
      this.stage = new Stage(c, { pixelRatio: 1, shadows: true });
      this.stage.setSize(this.w, this.h);
    }
    return this.stage;
  }

  /** key — уникальный ключ конфигурации; build() → THREE.Object3D. */
  get(key, build, view = 'card', priority = false) {
    const full = THUMB_VER + ':' + key + ':' + view;
    if (this.mem.has(full)) return this.mem.get(full);
    let stored = null;
    try { stored = localStorage.getItem('yasen.thumb.' + full); } catch { /* недоступно */ }
    if (stored) { const p = Promise.resolve(stored); this.mem.set(full, p); return p; }
    const p = new Promise((resolve) => {
      const job = { full, build, view, resolve };
      priority ? this.queue.unshift(job) : this.queue.push(job);
    });
    this.mem.set(full, p);
    this._pump();
    return p;
  }

  async _pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
      let url = '';
      try {
        const st = this._stage();
        st.setModel(job.build());
        st.applyView(st.viewFor(job.view, 1.08));
        st.render();
        url = st.canvas.toDataURL('image/webp', 0.86);
        if (!url.startsWith('data:image/webp')) url = st.canvas.toDataURL('image/png');
        st.setModel(null);
        try { localStorage.setItem('yasen.thumb.' + job.full, url); } catch { this._trim(); }
      } catch (e) { console.error(e); }
      job.resolve(url);
    }
    this.busy = false;
  }

  // Если хранилище переполнено — убираем старые миниатюры.
  _trim() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('yasen.thumb.')) keys.push(k); }
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
    } catch { /* ничего */ }
  }
}

export const thumbs = new Thumbnailer();
