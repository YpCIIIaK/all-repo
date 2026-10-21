/* ==========================================================================
   Физлаб 3D · приложение: цикл, ввод, история, сохранения
   ========================================================================== */

import { initPhysics, Physics, Obj, Q, V } from './physics.js';
import { SceneView } from './scene.js';
import { OrbitCam } from './camera.js';
import { ToolManager, TOOL_DEFS } from './tools.js';
import { UI } from './ui.js';
import { SCENARIOS, PREFABS, makeBuilder } from './scenarios.js';
import { serializeScene, deserializeScene, encodeShare, decodeShare, objToJSON, objFromJSON, Store } from './serialize.js';
import { MATERIALS, randomColor } from './data.js';

const DEFAULT_VIEW = {
  shadows: true, fog: true, velocity: false, trails: true, dimSleeping: false, snap: false,
  stats: true, graph: false, quality: 'high', smooth: true, fov: 50,
};
const DEFAULT_DEFAULTS = {
  material: 'wood', density: 0.7, friction: 0.6, restitution: 0.15, colorMode: 'random', color: '#4dabf7',
  size: 1, dropHeight: 0, wallHeight: 2, wallThickness: 0.3,
  cannonSpeed: 30, cannonSize: 0.5, springHertz: 2, springDamping: 0.3,
  blastRadius: 5, blastPower: 40, magnetRadius: 8, magnetPower: 40,
};

class App {
  constructor() {
    this.running = true; this.timeScale = 1; this.fixedDt = 1 / 60; this.acc = 0;
    this.selected = null; this.hover = null; this.follow = null;
    this.pointer = { sx: 0, sy: 0, inside: false };
    this.view = { ...DEFAULT_VIEW, ...Store.get('view', {}) };
    this.defaults = { ...DEFAULT_DEFAULTS, ...Store.get('defaults', {}) };
    this.undoStack = []; this.redoStack = []; this.startState = null; this.dirty = false;
    this._ckKey = ''; this._ckTime = 0;
    this.sceneName = 'Без названия'; this.sceneDesc = ''; this.sceneId = null;
    this.themePref = Store.get('theme', 'auto');
    this.fps = 60; this.frameMs = 0; this.lastT = 0; this.stepCount = 0;
    this._uiT = 0; this._graphT = 0; this._saveT = 0;
    this.keys = new Set(); this.pointers = new Map(); this.camDrag = null; this.pinch = null;
  }

  async init() {
    this._resolveTheme();
    await initPhysics();
    this.physics = new Physics();
    this.physics.onRemove = o => {
      if (this.selected === o) this.select(null);
      if (this.follow === o) this.follow = null;
      if (this.hover === o) this.hover = null;
      if (this.tools.grab && this.tools.grab.obj === o) this.tools.grab = null;
    };
    this.canvas = document.getElementById('view');
    this.view3d = new SceneView(this, this.canvas);
    this.cam = new OrbitCam(this.view3d.camera);
    this.cam.fov = this.view.fov;
    this.tools = new ToolManager(this);
    this.ui = new UI(this);
    this._applyTheme();
    this.ui.build();
    this._applyViewClasses();
    if (window.innerWidth < 760) document.body.classList.add('panel-closed');
    this.view3d.applyQuality();
    this._bindInput();
    await this._loadInitial();
    this.ui.refresh();
    this.tools.set('select');
    document.getElementById('loading').hidden = true;
    requestAnimationFrame(t => { this.lastT = t; this._frame(t); });
    const save = () => this._autosave();
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
  }

  async _loadInitial() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (m) {
      try {
        this.restore(await decodeShare(m[1]), true);
        this.markStart(true);
        history.replaceState(null, '', location.pathname + location.search);
        this.toast(`Загружена сцена «${this.sceneName}» по ссылке`);
        return;
      } catch { this.toast('Не удалось открыть ссылку на сцену', 'err'); }
    }
    const auto = Store.get('autosave', null);
    if (auto) {
      try {
        this.restore(auto, true);
        this.sceneId = auto.sceneId || null;
        this.startState = Store.get('autosaveStart', null) || serializeScene(this);
        this.toast('Продолжаем с того же места');
        return;
      } catch { /* повреждённое автосохранение */ }
    }
    this.applyScenario(SCENARIOS[0]);
  }

  _autosave() {
    if (!this.physics) return;
    const d = serializeScene(this);
    d.sceneId = this.sceneId;
    if (d.objs.length > 1500) return;
    Store.set('autosave', d);
    if (this.startState) Store.set('autosaveStart', this.startState);
  }

  /* --------------------------------- цикл --------------------------------- */

  _frame(t) {
    const dt = Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (dt > 0) this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
    const t0 = performance.now();
    if (this.running) {
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= this.fixedDt && n < 4) { this._physicsStep(); this.acc -= this.fixedDt; n++; }
      if (n === 4 && this.acc > this.fixedDt) this.acc = 0;
    }
    if (this.follow) {
      const g = this.cam.goal.target, k = Math.min(1, dt * 5), p = this.follow.p;
      g.x += (p.x - g.x) * k; g.y += (p.y + 0.5 - g.y) * k; g.z += (p.z - g.z) * k;
    }
    this.cam.update(dt);
    const alpha = this.running && this.view.smooth ? this.acc / this.fixedDt : 1;
    this.view3d.render(alpha, dt);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    this._uiT += dt;
    if (this._uiT > 0.1) { this._uiT = 0; this.ui.tick(); }
    this._saveT += dt;
    if (this._saveT > 20) { this._saveT = 0; this._autosave(); }
    requestAnimationFrame(tt => this._frame(tt));
  }

  _physicsStep() {
    const P = this.physics, dt = this.fixedDt;
    P.drive.fwd = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    P.drive.turn = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    this.tools.applyGrab(dt);
    const mg = this.tools.magnet;
    if (mg) P.attract(mg.p, this.defaults.magnetRadius, mg.repel ? -this.defaults.magnetPower : this.defaults.magnetPower, dt);
    P.step(dt);
    this.stepCount++;
    if (this.view.trails && (this.stepCount & 1) === 0) for (const o of P.objs) if (o.trail && !o.sleeping) o.pushTrail();
    this._graphT += dt;
    if (this._graphT >= 0.1) { this._graphT = 0; if (this.view.graph) this.ui.pushGraphSample(); }
  }

  setRunning(v) {
    v = !!v;
    if (v && !this.running && (this.dirty || !this.startState)) { this.startState = serializeScene(this); this.dirty = false; }
    this.running = v; this.acc = 0;
    if (this.tools.grab) this.tools.grab.mode = v && !this.tools.grab.obj.isStatic ? 'force' : 'move';
    this.ui.syncTop();
  }
  stepOnce() { if (this.running) this.setRunning(false); this._physicsStep(); this.ui.liveRefresh(); }
  setTimeScale(v) { this.timeScale = Math.max(0.01, Math.min(5, v)); this.ui.syncTop(); }

  /* -------------------------------- история -------------------------------- */

  checkpoint(key) {
    const now = performance.now();
    if (key && key === this._ckKey && now - this._ckTime < 1200) { this._ckTime = now; return; }
    this._ckKey = key || ''; this._ckTime = now;
    this.undoStack.push(serializeScene(this));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
    if (!this.running) this.dirty = true;
    this.ui.syncTop();
  }
  undo() {
    if (!this.undoStack.length) { this.toast('Нечего отменять'); return; }
    this.redoStack.push(serializeScene(this));
    this.restore(this.undoStack.pop(), false);
    this._ckKey = ''; this.ui.refresh();
  }
  redo() {
    if (!this.redoStack.length) { this.toast('Нечего повторять'); return; }
    this.undoStack.push(serializeScene(this));
    this.restore(this.redoStack.pop(), false);
    this._ckKey = ''; this.ui.refresh();
  }
  restore(data, camera) {
    this.tools.cancel();
    const sel = this.selected, selId = sel ? sel.id : null, selJoint = sel && !sel.kind, fol = this.follow ? this.follow.id : null;
    const { byId } = deserializeScene(this, data, { camera });
    if (!camera && fol) this.follow = byId.get(fol) || null;
    this.selected = null; this.hover = null;
    if (selId != null) this.selected = selJoint ? this.physics.joints.find(j => j.id === selId) || null : byId.get(selId) || null;
    this.acc = 0;
    this.ui.renderTab();
  }
  resetToStart() {
    if (!this.startState) { this.toast('Начальное состояние ещё не запомнено'); return; }
    this.checkpoint();
    this.restore(this.startState, false);
    this.dirty = false;
    this.ui.graphData.length = 0;
    this.ui.refresh();
    this.toast('Сцена сброшена к началу');
  }
  markStart(silent) {
    this.startState = serializeScene(this); this.dirty = false;
    if (!silent) this.toast('Текущее состояние запомнено как начальное');
  }

  /* --------------------------------- сцены --------------------------------- */

  applyScenario(def) {
    const P = this.physics;
    this.tools.cancel();
    P.gravity = { x: 0, y: -9.81, z: 0 }; P.airDrag = 0.02; P.iterations = 4; P.allowSleep = true; P.mutualGravity = false; P.G = 1;
    P.reset();
    this.follow = null; this.selected = null; this.hover = null;
    const cfg = def.build(makeBuilder(P)) || {};
    const ws = cfg.world || {};
    if (ws.gravity !== undefined) P.setGravity({ x: 0, y: -ws.gravity, z: 0 });
    if (ws.airDrag !== undefined) P.setAirDrag(ws.airDrag);
    if (ws.iterations !== undefined) P.setIterations(ws.iterations);
    if (ws.allowSleep !== undefined) P.allowSleep = ws.allowSleep;
    if (ws.mutualGravity !== undefined) P.mutualGravity = ws.mutualGravity;
    if (ws.G !== undefined) P.G = ws.G;
    if (cfg.camera) this.cam.set(cfg.camera); else this.fitView(true);
    this.follow = cfg.follow || null;
    this.sceneName = def.name; this.sceneDesc = def.desc || ''; this.sceneId = def.id;
    this.ui.graphData.length = 0;
    this.acc = 0;
    this.markStart(true);
    if (!this.running) this.setRunning(true);
  }

  loadBuiltin(id) {
    const def = SCENARIOS.find(s => s.id === id);
    if (!def) return;
    this.checkpoint();
    this.applyScenario(def);
    this.ui.refresh();
    this.toast(`${def.icon} ${def.name}`);
  }

  insertPrefab(id) {
    const p = PREFABS[id];
    if (!p) return;
    this.checkpoint();
    const t = this.cam.goal.target;
    const res = p.build(makeBuilder(this.physics, Math.round(t.x * 2) / 2, 0, Math.round(t.z * 2) / 2));
    if (res) this.select(res);
    if (p.hint) this.toast(p.hint);
  }

  clearScene(keepStatic) {
    this.checkpoint();
    const P = this.physics;
    for (let i = P.objs.length - 1; i >= 0; i--) { const o = P.objs[i]; if (!o.ground && (!keepStatic || !o.isStatic)) P.remove(o); }
    this.select(null);
    this.toast(keepStatic ? 'Подвижные тела удалены' : 'Сцена очищена');
  }

  listSaves() { return Store.get('saves', []); }
  saveLocal(name, replaceId) {
    const saves = this.listSaves();
    const entry = { id: replaceId || Date.now().toString(36), name: name || 'Без названия', date: Date.now(), data: serializeScene(this, { name }) };
    const i = saves.findIndex(s => s.id === entry.id);
    if (i >= 0) saves[i] = entry; else saves.unshift(entry);
    if (Store.set('saves', saves)) this.toast(`Сохранено: «${entry.name}»`);
    else this.toast('Не удалось сохранить: хранилище браузера переполнено', 'err');
    if (this.ui.tab === 'scenes') this.ui.renderTab();
  }
  loadSave(id) {
    const s = this.listSaves().find(x => x.id === id);
    if (!s) return;
    this.checkpoint();
    this.restore(s.data, true);
    this.sceneId = null; this.markStart(true); this.ui.refresh();
    this.toast(`Загружено: «${s.name}»`);
  }
  deleteSave(id) {
    const saves = this.listSaves(), s = saves.find(x => x.id === id);
    if (!s) return;
    Store.set('saves', saves.filter(x => x.id !== id));
    this.ui.renderTab();
    this.toast(`Сохранение «${s.name}» удалено`);
  }
  exportFile() {
    const blob = new Blob([JSON.stringify(serializeScene(this))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this.sceneName || 'scene').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.physlab3d.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Файл сцены сохранён');
  }
  async importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      this.checkpoint();
      this.restore(data, true);
      this.sceneId = null; this.markStart(true); this.ui.refresh();
      this.toast(`Импортировано: «${this.sceneName}»`);
    } catch (e) { this.toast('Не удалось прочитать файл: ' + e.message, 'err'); }
  }
  async shareLink() {
    try {
      const url = location.href.split('#')[0] + '#s=' + await encodeShare(serializeScene(this));
      if (url.length > 120000) this.toast('Сцена очень большая — ссылка может не открыться в некоторых мессенджерах');
      try { await navigator.clipboard.writeText(url); this.toast('Ссылка на сцену скопирована'); }
      catch { this.ui.showText('Ссылка на сцену', 'Скопируйте ссылку и отправьте её — по ней откроется эта сцена.', url); }
    } catch { this.toast('Не удалось создать ссылку', 'err'); }
  }

  /* -------------------------------- объекты -------------------------------- */

  materialProps(name) {
    const m = MATERIALS[name];
    return m ? { density: m.density, friction: m.friction, restitution: m.restitution, color: m.color } : {};
  }

  createObj(kind, size, pos, rot, extra = {}) {
    const d = this.defaults, m = MATERIALS[d.material];
    let color = d.colorMode === 'fixed' ? d.color : d.colorMode === 'material' && m ? m.color : randomColor();
    if (extra.isStatic && d.colorMode === 'random') color = null;
    const o = new Obj({ kind, size, pos, rot, density: d.density, friction: d.friction, restitution: d.restitution, color, ...extra });
    this.physics.add(o, { linvel: extra.vel });
    this.physics.wakeNear(o);
    if (o.trail) this.setView('trails', true);
    return o;
  }

  removeObject(o) {
    if (!o) return;
    if (o.kind) this.physics.remove(o); else this.physics.removeJoint(o);
    if (this.selected === o) this.select(null);
    if (this.hover === o) this.hover = null;
  }

  duplicate(o) {
    if (!o || !o.kind || o.ground) return;
    this.checkpoint();
    const j = objToJSON(o);
    delete j.id; delete j.sl;
    j.p[0] += o.bound * 2 + 0.2;
    const { o: c, state } = objFromJSON(j);
    this.physics.add(c, state);
    this.select(c);
  }

  select(o) {
    this.selected = o || null;
    if (o && this.ui.tab !== 'object') this.ui.showTab('object'); else if (this.ui.tab === 'object') this.ui.renderTab();
  }

  rotateSelected(deg) {
    const o = this.selected;
    if (!o || !o.kind || o.ground) return;
    this.checkpoint('rotate');
    this.physics.setPose(o, null, Q.mul(Q.axisAngle({ x: 0, y: 1, z: 0 }, deg * Math.PI / 180), o.q));
    this.ui.liveRefresh();
  }

  /* ----------------------------- лучи и точки ----------------------------- */

  pick(sx, sy) {
    const r = this.view3d.ray(sx, sy);
    const hit = this.physics.raycast(r.origin, r.dir, 2000);
    if (hit) return { ...hit, sx, sy, hitSomething: true };
    let point;
    if (r.dir.y < -1e-4) { const t = -r.origin.y / r.dir.y; point = V.add(r.origin, V.scale(r.dir, t)); }
    else point = V.add(r.origin, V.scale(r.dir, 25));
    return { obj: null, point, normal: { x: 0, y: 1, z: 0 }, sx, sy, hitSomething: false };
  }
  pickPlane(sx, sy, y) {
    const r = this.view3d.ray(sx, sy);
    if (Math.abs(r.dir.y) < 1e-5) return null;
    const t = (y - r.origin.y) / r.dir.y;
    if (t < 0 || t > 3000) return null;
    return V.add(r.origin, V.scale(r.dir, t));
  }
  camForward() {
    const d = this.view3d.camera.getWorldDirection(this.view3d._p.clone());
    return { x: d.x, y: d.y, z: d.z };
  }
  pointAtDepth(sx, sy, ref) {
    const c = this.view3d.camera.position, f = this.camForward(), r = this.view3d.ray(sx, sy);
    const depth = V.dot(V.sub(ref, { x: c.x, y: c.y, z: c.z }), f);
    return V.add(r.origin, V.scale(r.dir, depth / Math.max(0.05, V.dot(r.dir, f))));
  }
  jointAtScreen(sx, sy) {
    let best = null, bd = 12;
    for (const j of this.physics.joints) {
      if (j.hidden && this.selected !== j) continue;
      const w = this.physics.anchorsWorld(j);
      const pts = [w.pb];
      if (j.type === 'spring' || j.type === 'rope') pts.push({ x: (w.pa.x + w.pb.x) / 2, y: (w.pa.y + w.pb.y) / 2, z: (w.pa.z + w.pb.z) / 2 });
      for (const p of pts) {
        const s = this.view3d.project(p);
        if (s.behind) continue;
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < bd) { bd = d; best = j; }
      }
    }
    return best;
  }
  snap(p) {
    if (!this.view.snap) return p;
    return { x: Math.round(p.x * 2) / 2, y: p.y, z: Math.round(p.z * 2) / 2 };
  }

  /* --------------------------------- вид --------------------------------- */

  fitView(instant) {
    const os = this.physics.objs.filter(o => !o.ground);
    if (!os.length) { this.cam.set({ target: { x: 0, y: 1.5, z: 0 }, dist: 22 }, !!instant); return; }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const o of os) {
      const b = o.bound;
      x0 = Math.min(x0, o.p.x - b); y0 = Math.min(y0, o.p.y - b); z0 = Math.min(z0, o.p.z - b);
      x1 = Math.max(x1, o.p.x + b); y1 = Math.max(y1, o.p.y + b); z1 = Math.max(z1, o.p.z + b);
    }
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    this.follow = null;
    this.cam.set({ target: { x: (x0 + x1) / 2, y: Math.max(0.5, (y0 + y1) / 2), z: (z0 + z1) / 2 }, dist: Math.max(5, Math.min(400, r / Math.tan(this.cam.fov * Math.PI / 360) * 1.15)) }, !!instant);
  }

  setView(key, val) {
    this.view[key] = val;
    this.saveView();
    if (['quality', 'shadows', 'fog'].includes(key)) this.view3d.applyQuality();
    if (key === 'graph' && val) this.ui.graphData.length = 0;
    if (key === 'dimSleeping') for (const p of Object.values(this.view3d.pools)) p.keys.fill('');
    this._applyViewClasses();
    if (this.ui.tab === 'view') this.ui.renderTab();
  }
  saveView() { Store.set('view', this.view); }
  saveDefaults() { Store.set('defaults', this.defaults); }
  _applyViewClasses() {
    document.body.classList.toggle('no-stats', !this.view.stats);
    document.body.classList.toggle('no-graph', !this.view.graph);
  }

  setTheme(pref) {
    this.themePref = pref; Store.set('theme', pref);
    this._applyTheme(); this.ui.syncTop();
    if (this.ui.tab === 'view') this.ui.renderTab();
  }
  _resolveTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    this.themeName = this.themePref === 'auto' ? (mq.matches ? 'light' : 'dark') : this.themePref;
    document.documentElement.dataset.theme = this.themeName;
    if (!this._mq) { this._mq = mq; mq.addEventListener('change', () => { if (this.themePref === 'auto') { this._applyTheme(); this.ui.syncTop(); } }); }
  }
  _applyTheme() { this._resolveTheme(); if (this.view3d) this.view3d.applyTheme(); }

  togglePanel() { document.body.classList.toggle('panel-closed'); }

  onToolChanged() { this.ui.syncTools(); this.setCursor(null); }
  setCursor(c) {
    const def = { select: 'default', eraser: 'cell' }[this.tools.currentId] || 'crosshair';
    this.canvas.style.cursor = c || def;
  }
  toast(m, k) { this.ui.toast(m, k); }

  /* --------------------------------- ввод --------------------------------- */

  startCameraDrag(e, mode) {
    this.follow = mode === 'pan' ? null : this.follow;
    this.camDrag = { id: e.pointerId, mode, x: e.clientX, y: e.clientY, moved: false, button: e.button };
    this.setCursor(mode === 'pan' ? 'move' : 'grabbing');
  }

  _bindInput() {
    const cv = this.canvas;
    window.addEventListener('resize', () => this.view3d.resize());
    const local = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.ui.hideMenu();
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      const l = local(e);
      this.pointers.set(e.pointerId, l);
      Object.assign(this.pointer, l, { inside: true });
      if (this.pointers.size === 2) {
        this.tools.cancel(); this.camDrag = null;
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
        return;
      }
      if (this.pointers.size > 2) return;
      if (e.button === 1) { e.preventDefault(); this.startCameraDrag(e, 'pan'); return; }
      if (e.button === 2) { this.startCameraDrag(e, e.shiftKey ? 'pan' : 'orbit'); return; }
      if (e.button !== 0) return;
      this.tools.down(l.sx, l.sy, e);
    });

    cv.addEventListener('pointermove', e => {
      const l = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, l);
      Object.assign(this.pointer, l, { inside: true });
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        this.cam.dolly(this.pinch.d / Math.max(1, d));
        this.cam.pan(mx - this.pinch.mx, my - this.pinch.my);
        this.pinch = { d, mx, my };
        return;
      }
      const cd = this.camDrag;
      if (cd && cd.id === e.pointerId) {
        const dx = e.clientX - cd.x, dy = e.clientY - cd.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) cd.moved = true;
        cd.x = e.clientX; cd.y = e.clientY;
        if (cd.mode === 'pan') this.cam.pan(dx, dy); else this.cam.orbit(dx, dy);
        return;
      }
      this.tools.move(l.sx, l.sy, e);
    });

    const end = e => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
      const cd = this.camDrag;
      if (cd && cd.id === e.pointerId) {
        this.camDrag = null; this.setCursor(null);
        if (cd.button === 2 && !cd.moved) { const l = local(e); this._contextMenu(e.clientX, e.clientY, l.sx, l.sy); }
        return;
      }
      const l = local(e);
      this.tools.up(l.sx, l.sy, e);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.pinch = null; this.camDrag = null; this.tools.cancel(); });
    cv.addEventListener('pointerleave', () => { this.pointer.inside = false; if (!this.tools.active) { this.hover = null; this.view3d.showGhost(null); } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012) * (e.deltaMode === 1 ? 30 : 1));
      if (this.tools.wheel(f)) { const l = local(e); this.tools.move(l.sx, l.sy, e); return; }
      const l = local(e), hit = this.pick(l.sx, l.sy);
      this.cam.dolly(f, hit.hitSomething || hit.point ? hit.point : null);
    }, { passive: false });

    window.addEventListener('keydown', e => this._keyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _contextMenu(x, y, sx, sy) {
    const j = this.jointAtScreen(sx, sy), hit = j ? null : this.pick(sx, sy);
    const o = hit && hit.obj && !hit.obj.ground ? hit.obj : null, P = this.physics, items = [];
    const openPanel = () => { document.body.classList.remove('panel-closed'); this.ui.showTab('object'); };
    if (o) {
      this.select(o);
      items.push(
        { label: 'Свойства', icon: 'sliders', action: openPanel },
        { label: 'Копия', icon: 'copy', kbd: 'Ctrl+D', action: () => this.duplicate(o) },
        { label: o.isStatic ? 'Открепить' : 'Закрепить', icon: 'pin', action: () => { this.checkpoint(); o.isStatic = !o.isStatic; if (!o.isStatic && !o.color) o.color = randomColor(); P.rebuild(o); this.ui.renderTab(); } },
        o.isStatic ? null : { label: o.trail ? 'Убрать след' : 'Оставлять след', icon: 'rope', action: () => { this.checkpoint(); o.trail = !o.trail; if (o.trail) this.setView('trails', true); else o.clearTrail(); this.ui.renderTab(); } },
        o.isStatic ? null : { label: this.follow === o ? 'Не следить камерой' : 'Следить камерой', icon: 'target', action: () => { this.follow = this.follow === o ? null : o; } },
        o.isStatic ? null : { label: 'Остановить', icon: 'stop', action: () => { this.checkpoint(); P.setVelocity(o, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }); } },
        '-',
        { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, action: () => { this.checkpoint(); this.removeObject(o); } },
      );
    } else if (j) {
      this.select(j);
      items.push({ label: 'Свойства', icon: 'sliders', action: openPanel }, '-', { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, action: () => { this.checkpoint(); this.removeObject(j); } });
    } else {
      const s = this.defaults.size, p = hit.point;
      items.push(
        { label: 'Ящик здесь', icon: 'cube', action: () => { this.checkpoint(); this.select(this.createObj('box', { w: s, h: s, d: s }, { x: p.x, y: p.y + s / 2 + 0.01, z: p.z }, Q.id())); } },
        { label: 'Шар здесь', icon: 'ball', action: () => { this.checkpoint(); this.select(this.createObj('ball', { r: s / 2 }, { x: p.x, y: p.y + s / 2 + 0.01, z: p.z }, Q.id())); } },
        { label: 'Взрыв здесь', icon: 'explode', action: () => { this.checkpoint(); P.explode(p, this.defaults.blastRadius, this.defaults.blastPower); this.view3d.addEffect(p, this.defaults.blastRadius); } },
        '-',
        { label: this.running ? 'Пауза' : 'Пуск', icon: this.running ? 'pause' : 'play', kbd: 'Пробел', action: () => this.setRunning(!this.running) },
        { label: 'Показать всё', icon: 'fit', kbd: 'F', action: () => this.fitView() },
      );
    }
    this.ui.showMenu(x, y, items);
  }

  _keyDown(e) {
    const t = e.target;
    const typing = t && ((t.tagName === 'INPUT' && !['checkbox', 'range', 'color'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key === 'Escape') {
      if (document.getElementById('modal').classList.contains('open')) { this.ui.closeModal(); return; }
      this.ui.hideMenu();
      if (typing) { t.blur(); return; }
      if (this.tools.active || this.tools.grab) this.tools.cancel(); else this.select(null);
      return;
    }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (mod && e.code === 'KeyD') { e.preventDefault(); if (this.selected && this.selected.kind) this.duplicate(this.selected); return; }
    if (mod && e.code === 'KeyS') { e.preventDefault(); this.saveLocal(this.sceneName); return; }
    if (mod || e.altKey) return;
    if (e.code.startsWith('Arrow')) { e.preventDefault(); this.keys.add(e.code); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.setRunning(!this.running); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { if (this.selected && !this.selected.ground) { e.preventDefault(); this.checkpoint(); this.removeObject(this.selected); } return; }
    if (e.code === 'KeyQ') { this.rotateSelected(e.shiftKey ? 1 : 15); return; }
    if (e.code === 'KeyE') { this.rotateSelected(e.shiftKey ? -1 : -15); return; }
    if (e.code === 'KeyF') { this.fitView(); return; }
    if (e.code === 'KeyN') { this.stepOnce(); return; }
    if (e.code === 'Home') { this.resetToStart(); return; }
    if (e.code === 'Slash' || e.code === 'F1') { e.preventDefault(); this.ui.openHelp(); return; }
    if (e.code === 'Tab') { e.preventDefault(); this.togglePanel(); return; }
    const tool = TOOL_DEFS.find(d => !d.sep && 'Key' + d.key === e.code);
    if (tool) this.tools.set(tool.id);
  }
}

const app = new App();
window.app = app;
app.init().catch(err => {
  console.error(err);
  const l = document.getElementById('loading');
  l.hidden = false;
  l.querySelector('p').textContent = 'Не удалось запустить физику: ' + (err && err.message ? err.message : err) + '. Обновите страницу или откройте её в свежем Chrome, Firefox или Safari.';
});
