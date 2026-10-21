'use strict';
/* ==========================================================================
   Физлаб · приложение: игровой цикл, ввод, история, сохранения
   ========================================================================== */

const DEFAULT_VIEW = {
  grid: true, snap: false, velocity: false, contacts: false, centers: false, aabb: false,
  trails: true, sleeping: true, scale: true, stats: true, graph: false, quality: 'high', smooth: true,
};
const DEFAULT_DEFAULTS = {
  material: 'wood', density: 0.7, friction: 0.6, restitution: 0.15, colorMode: 'random', color: '#4dabf7',
  size: 1, sides: 6, wallThickness: 0.3, isStatic: false, trail: false,
  springHertz: 3, springDamping: 0.3, blastRadius: 4, blastPower: 40, magnetRadius: 6, magnetPower: 40, slingPower: 5,
};

class App {
  constructor() {
    this.world = new World();
    this.cam = { x: 0, y: 6, zoom: 40 };
    this.running = true;
    this.timeScale = 1;
    this.fixedDt = 1 / 60;
    this.acc = 0;
    this.selected = null; this.hover = null; this.follow = null; this.magnet = null;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false };
    this.view = { ...DEFAULT_VIEW, ...Store.get('view', {}) };
    this.defaults = { ...DEFAULT_DEFAULTS, ...Store.get('defaults', {}) };
    this.undoStack = []; this.redoStack = [];
    this.startState = null; this.dirty = false;
    this._ckKey = ''; this._ckTime = 0;
    this.sceneName = 'Без названия'; this.sceneDesc = ''; this.sceneId = null;
    this.themePref = Store.get('theme', 'auto');
    this.fps = 60; this.lastT = 0; this.stepCount = 0;
    this._uiT = 0; this._graphT = 0; this._saveT = 0;
    this.keys = new Set();
    this.pointers = new Map(); this.pinch = null; this.panning = null;
  }

  /* --------------------------------- запуск --------------------------------- */

  init() {
    this.canvas = document.getElementById('view');
    this.renderer = new Renderer(this, this.canvas);
    this.tools = new ToolManager(this);
    this.ui = new UI(this);
    this._applyTheme();
    this.ui.build();
    this._applyViewClasses();
    if (window.innerWidth < 760) document.body.classList.add('panel-closed');
    this.renderer.resize();
    this._bindInput();

    this.world.onBodyRemoved = b => {
      if (this.selected === b) this.select(null);
      if (this.follow === b) this.follow = null;
      if (this.hover === b) this.hover = null;
    };
    this.world.onJointBroken = j => {
      if (this.selected === j) this.select(null);
      const p = j.worldB({});
      this.renderer.addEffect({ x: p.x, y: p.y, r: 0.6, dur: 0.35, color: '#ff6b6b' });
    };

    this._loadInitial().then(() => {
      this.ui.refresh();
      this.tools.set('select');
    });
    requestAnimationFrame(t => { this.lastT = t; this._frame(t); });

    const save = () => this._autosave();
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
  }

  async _loadInitial() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (m) {
      try {
        const data = await decodeShare(m[1]);
        this.restore(data, true);
        this.markStart(true);
        history.replaceState(null, '', location.pathname + location.search);
        this.toast(`Загружена сцена «${this.sceneName}» по ссылке`);
        return;
      } catch (e) { this.toast('Не удалось открыть ссылку на сцену', 'err'); }
    }
    const auto = Store.get('autosave', null);
    if (auto) {
      try {
        this.restore(auto, true);
        this.sceneId = auto.sceneId || null;
        this.startState = Store.get('autosaveStart', null) || serializeScene(this);
        this.toast('Продолжаем с того же места');
        return;
      } catch (e) { /* повреждённое автосохранение — грузим приветствие */ }
    }
    this.applyScenario(SCENARIOS[0]);
  }

  _autosave() {
    const data = serializeScene(this);
    data.sceneId = this.sceneId;
    Store.set('autosave', data);
    if (this.startState) Store.set('autosaveStart', this.startState);
  }

  /* --------------------------------- цикл --------------------------------- */

  _frame(t) {
    const dt = Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    if (dt > 0) this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
    if (this.running) {
      this.acc += dt * this.timeScale;
      let n = 0;
      const maxSteps = 4;
      while (this.acc >= this.fixedDt && n < maxSteps) {
        this._physicsStep();
        this.acc -= this.fixedDt;
        n++;
      }
      if (n === maxSteps && this.acc > this.fixedDt) this.acc = 0; // не копим отставание
    }
    if (this.follow) {
      const k = Math.min(1, dt * 6);
      this.cam.x += (this.follow.x - this.cam.x) * k;
      this.cam.y += (this.follow.y - this.cam.y) * k;
    }
    const alpha = this.running && this.view.smooth ? this.acc / this.fixedDt : 1;
    this.renderer.draw(alpha, dt);

    this._uiT += dt;
    if (this._uiT > 0.1) { this._uiT = 0; this.ui.tick(); }
    this._saveT += dt;
    if (this._saveT > 20) { this._saveT = 0; this._autosave(); }
    requestAnimationFrame(tt => this._frame(tt));
  }

  _physicsStep() {
    const w = this.world;
    w.motorInput = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    if (w.motorInput) for (const j of w.joints) if (j.motorKeys) { w.wake(j.a); w.wake(j.b); }
    if (this.magnet) {
      const d = this.defaults;
      w.attract(this.magnet.x, this.magnet.y, d.magnetRadius, this.magnet.repel ? -d.magnetPower : d.magnetPower);
    }
    w.step(this.fixedDt);
    this.stepCount++;
    if (this.view.trails && (this.stepCount & 1) === 0) {
      for (const b of w.bodies) if (b.trail && !b.sleeping && !b.isStatic) b.pushTrail();
    }
    this._graphT += this.fixedDt;
    if (this._graphT >= 0.1) { this._graphT = 0; if (this.view.graph) this.ui.pushGraphSample(); }
  }

  setRunning(v) {
    v = !!v;
    if (v && !this.running && (this.dirty || !this.startState)) { this.startState = serializeScene(this); this.dirty = false; }
    this.running = v;
    this.acc = 0;
    if (this.tools.active) this.tools.cancel();
    this.ui.syncTop();
  }

  stepOnce() {
    if (this.running) this.setRunning(false);
    this._physicsStep();
    this.ui.liveRefresh();
  }

  setTimeScale(v) { this.timeScale = Math.max(0.01, Math.min(5, v)); this.ui.syncTop(); }

  /* -------------------------------- история -------------------------------- */

  /** Запомнить состояние перед изменением. key — объединяет серию правок (слайдер) в один шаг. */
  checkpoint(key) {
    const now = performance.now();
    if (key && key === this._ckKey && now - this._ckTime < 1200) { this._ckTime = now; return; }
    this._ckKey = key || ''; this._ckTime = now;
    this.undoStack.push(serializeScene(this));
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack.length = 0;
    if (!this.running) this.dirty = true;
    this.ui.syncTop();
  }

  undo() {
    if (!this.undoStack.length) { this.toast('Нечего отменять'); return; }
    this.redoStack.push(serializeScene(this));
    this.restore(this.undoStack.pop(), false);
    this._ckKey = '';
    this.ui.refresh();
  }
  redo() {
    if (!this.redoStack.length) { this.toast('Нечего повторять'); return; }
    this.undoStack.push(serializeScene(this));
    this.restore(this.redoStack.pop(), false);
    this._ckKey = '';
    this.ui.refresh();
  }

  restore(data, camera) {
    if (this.tools && this.tools.active) this.tools.cancel();
    const selId = this.selected ? this.selected.id : null, selJoint = this.selected && !this.selected.shape;
    const follow = this.follow;
    const { byId } = deserializeScene(this, data, { camera });
    if (!camera && follow) this.follow = byId.get(follow.id) || null;
    this.selected = null; this.hover = null;
    if (selId != null) {
      this.selected = selJoint ? this.world.joints.find(j => j.id === selId) || null : byId.get(selId) || null;
    }
    this.acc = 0;
  }

  resetToStart() {
    if (!this.startState) { this.toast('Начальное состояние ещё не запомнено'); return; }
    this.checkpoint();
    this.restore(this.startState, false);
    this.dirty = false;
    for (const b of this.world.bodies) b.clearTrail();
    this.ui.graphData.length = 0;
    this.ui.refresh();
    this.toast('Сцена сброшена к началу');
  }

  markStart(silent) {
    this.startState = serializeScene(this);
    this.dirty = false;
    if (!silent) this.toast('Текущее состояние запомнено как начальное');
  }

  /* --------------------------------- сцены --------------------------------- */

  applyScenario(def) {
    const w = this.world;
    if (this.tools.active) this.tools.cancel();
    w.clear();
    w.gravityX = 0; w.gravityY = -9.81; w.airDrag = 0.02; w.substeps = 4;
    w.allowSleep = true; w.mutualGravity = false; w.G = 1;
    this.follow = null; this.selected = null; this.hover = null;
    const cfg = def.build(makeBuilder(w)) || {};
    const ws = cfg.world || {};
    if (ws.gravity !== undefined) { w.gravityX = 0; w.gravityY = -ws.gravity; }
    if (ws.airDrag !== undefined) w.airDrag = ws.airDrag;
    if (ws.substeps !== undefined) w.substeps = ws.substeps;
    if (ws.allowSleep !== undefined) w.allowSleep = ws.allowSleep;
    if (ws.mutualGravity !== undefined) w.mutualGravity = ws.mutualGravity;
    if (ws.G !== undefined) w.G = ws.G;
    if (cfg.camera) Object.assign(this.cam, cfg.camera); else this.fitView();
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
    const from = this.world.bodies.length;
    const res = p.build(makeBuilder(this.world, Math.round(this.cam.x * 2) / 2, Math.round(this.cam.y * 2) / 2 - 1), 0, 0);
    if (res && res.shape) this.select(res); else if (this.world.bodies.length > from) this.select(this.world.bodies[from]);
    if (p.hint) this.toast(p.hint);
  }

  clearScene(keepStatic) {
    this.checkpoint();
    const w = this.world;
    for (let i = w.bodies.length - 1; i >= 0; i--) {
      const b = w.bodies[i];
      if (!keepStatic || !b.isStatic) w.removeBody(b);
    }
    this.select(null);
    this.toast(keepStatic ? 'Подвижные тела удалены' : 'Сцена очищена');
  }

  listSaves() { return Store.get('saves', []); }

  saveLocal(name, replaceId) {
    const saves = this.listSaves();
    const data = serializeScene(this, { name });
    const entry = { id: replaceId || Date.now().toString(36), name: name || 'Без названия', date: Date.now(), data };
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
    this.sceneId = null;
    this.markStart(true);
    this.ui.refresh();
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
    const data = serializeScene(this);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this.sceneName || 'scene').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.physlab.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Файл сцены сохранён');
  }

  async importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      this.checkpoint();
      this.restore(data, true);
      this.sceneId = null;
      this.markStart(true);
      this.ui.refresh();
      this.toast(`Импортировано: «${this.sceneName}»`);
    } catch (e) { this.toast('Не удалось прочитать файл: ' + e.message, 'err'); }
  }

  async shareLink() {
    try {
      const code = await encodeShare(serializeScene(this));
      const url = location.href.split('#')[0] + '#s=' + code;
      if (url.length > 120000) this.toast('Сцена очень большая — ссылка может не открыться в некоторых мессенджерах');
      try { await navigator.clipboard.writeText(url); this.toast('Ссылка на сцену скопирована'); }
      catch { this.ui.showText('Ссылка на сцену', 'Скопируйте ссылку и отправьте её — по ней откроется эта сцена.', url); }
    } catch (e) { this.toast('Не удалось создать ссылку', 'err'); }
  }

  /* -------------------------------- объекты -------------------------------- */

  createBody(shape, x, y, extra = {}) {
    const d = this.defaults, m = MATERIALS[d.material];
    let color = d.colorMode === 'fixed' ? d.color : d.colorMode === 'material' && m ? m.color : randomColor();
    const isStatic = extra.isStatic ?? d.isStatic;
    if (isStatic && d.colorMode === 'random') color = null;
    const b = new Body({
      shape, x, y, density: d.density, friction: d.friction, restitution: d.restitution,
      color, trail: d.trail, ...extra, isStatic,
    });
    if (extra.color === null) b.setColor(null);
    this.world.addBody(b);
    this.world.wakeArea(b.minX - 0.5, b.minY - 0.5, b.maxX + 0.5, b.maxY + 0.5);
    if (b.trail) this.setView('trails', true);
    return b;
  }

  removeObject(o) {
    if (!o) return;
    if (o.shape) this.world.removeBody(o); else this.world.removeJoint(o);
    if (this.selected === o) this.select(null);
    if (this.hover === o) this.hover = null;
  }

  duplicate(b) {
    if (!b || !b.shape) return;
    this.checkpoint();
    const o = bodyToJSON(b);
    delete o.id; delete o.sl;
    o.x += b.shape.bound + 0.3; o.y += 0.3;
    const c = bodyFromJSON(o);
    this.world.addBody(c);
    this.select(c);
  }

  select(o) {
    this.selected = o || null;
    if (o && this.ui.tab !== 'object') this.ui.showTab('object');
    else if (this.ui.tab === 'object') this.ui.renderTab();
  }

  jointAt(x, y) {
    const tol = 8 / this.cam.zoom;
    let best = null, bd = tol;
    const A = {}, B = {};
    for (const j of this.world.joints) {
      if (j.type === 'mouse') continue;
      j.worldA(A); j.worldB(B);
      let d;
      if (j.type === 'hinge') d = Math.hypot(x - B.x, y - B.y);
      else {
        const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / l2)) : 0;
        d = Math.hypot(x - (A.x + t * dx), y - (A.y + t * dy));
      }
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  }

  gridStep() {
    const target = 34 / this.cam.zoom, p = Math.pow(10, Math.floor(Math.log10(target)));
    return target <= p ? p : target <= 2 * p ? 2 * p : target <= 5 * p ? 5 * p : 10 * p;
  }

  snap(p) {
    if (!this.view.snap) return { x: p.x, y: p.y };
    const s = this.gridStep() / 2;
    return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
  }

  rotateSelected(deg) {
    const b = this.selected;
    if (!b || !b.shape) return;
    this.checkpoint('rotate');
    b.angle += deg / DEG; b.pa = b.angle;
    b.updateWorld();
    this.world.wake(b);
    this.world.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1);
    this.ui.liveRefresh();
  }

  /* -------------------------------- вид -------------------------------- */

  fitView() {
    const bs = this.world.bodies;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const use = bs.filter(b => !b.isStatic || (b.maxX - b.minX < 60));
    for (const b of use.length ? use : bs) {
      x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY); x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY);
    }
    if (!Number.isFinite(x0)) { Object.assign(this.cam, { x: 0, y: 6, zoom: 40 }); return; }
    const r = this.renderer, panel = document.body.classList.contains('panel-closed') ? 0 : 340;
    const W = Math.max(200, r.W - panel - 80), H = Math.max(200, r.H - 140);
    const zoom = Math.max(3, Math.min(300, Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0))));
    this.follow = null;
    Object.assign(this.cam, { x: (x0 + x1) / 2 + panel / 2 / zoom, y: (y0 + y1) / 2, zoom });
  }

  zoomAt(sx, sy, factor) {
    const c = this.cam, before = this.renderer.toWorld(sx, sy);
    c.zoom = Math.max(2, Math.min(1200, c.zoom * factor));
    const after = this.renderer.toWorld(sx, sy);
    c.x += before.x - after.x; c.y += before.y - after.y;
  }

  setView(key, val) {
    this.view[key] = val;
    Store.set('view', this.view);
    if (key === 'quality') this.renderer.resize();
    if (key === 'graph' && val) this.ui.graphData.length = 0;
    this._applyViewClasses();
    if (this.ui.tab === 'view') this.ui.renderTab();
  }

  _applyViewClasses() {
    document.body.classList.toggle('no-stats', !this.view.stats);
    document.body.classList.toggle('no-graph', !this.view.graph);
  }

  setTheme(pref) {
    this.themePref = pref;
    Store.set('theme', pref);
    this._applyTheme();
    this.ui.syncTop();
    if (this.ui.tab === 'view') this.ui.renderTab();
  }

  _applyTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (!this._mqBound) { mq.addEventListener('change', () => { if (this.themePref === 'auto') { this._applyTheme(); this.ui.syncTop(); } }); this._mqBound = true; }
    this.themeName = this.themePref === 'auto' ? (mq.matches ? 'light' : 'dark') : this.themePref;
    this.theme = THEMES[this.themeName];
    document.documentElement.dataset.theme = this.themeName;
    if (this.renderer) this.renderer._bgKey = '';
  }

  togglePanel() {
    document.body.classList.toggle('panel-closed');
    setTimeout(() => this.renderer.resize(), 0);
  }

  onToolChanged(id) {
    this.ui.syncTools();
    this.setCursor(null);
    if (id !== 'magnet') this.magnet = null;
  }

  setCursor(c) {
    this.canvas.style.cursor = c || (this.tools.current && this.tools.current.cursor) || 'default';
  }

  toast(msg, kind) { this.ui.toast(msg, kind); }

  /* -------------------------------- ввод -------------------------------- */

  _bindInput() {
    const cv = this.canvas;
    window.addEventListener('resize', () => this.renderer.resize());

    const local = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
    const updPointer = e => {
      const { sx, sy } = local(e), w = this.renderer.toWorld(sx, sy);
      Object.assign(this.pointer, { sx, sy, x: w.x, y: w.y, inside: true });
      return this.pointer;
    };

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.ui.hideMenu();
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 2) {
        this.tools.cancel(); this.panning = null;
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, zoom: this.cam.zoom };
        return;
      }
      if (this.pointers.size > 2) return;
      const p = updPointer(e);
      if (e.button === 1 || (e.button === 0 && e.altKey && this.tools.currentId === 'select')) { e.preventDefault(); this.startPan(e); return; }
      if (e.button !== 0) return;
      this.tools.down({ x: p.x, y: p.y }, e);
    });

    cv.addEventListener('pointermove', e => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, local(e));
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        const before = this.renderer.toWorld(this.pinch.mx, this.pinch.my);
        this.cam.zoom = Math.max(2, Math.min(1200, this.pinch.zoom * d / Math.max(1, this.pinch.d)));
        const after = this.renderer.toWorld(mx, my);
        this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
        this.pinch.mx = mx; this.pinch.my = my; this.pinch.d = d; this.pinch.zoom = this.cam.zoom;
        this.follow = null;
        return;
      }
      const p = updPointer(e);
      if (this.panning && this.panning.id === e.pointerId) {
        const c = this.cam, pn = this.panning;
        c.x = pn.cx - (e.clientX - pn.sx) / c.zoom;
        c.y = pn.cy + (e.clientY - pn.sy) / c.zoom;
        return;
      }
      this.tools.move({ x: p.x, y: p.y }, e);
      if (!this.tools.active) {
        if (this.tools.currentId === 'select') {
          const j = this.jointAt(p.x, p.y);
          this.hover = j ? null : this.world.bodyAt(p.x, p.y);
          this.setCursor(j || this.hover ? 'grab' : null);
        } else this.hover = null;
      }
    });

    const end = e => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
      if (this.panning && this.panning.id === e.pointerId) { this.panning = null; this.setCursor(null); return; }
      const p = updPointer(e);
      this.tools.up({ x: p.x, y: p.y }, e);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.pinch = null; this.panning = null; this.tools.cancel(); });
    cv.addEventListener('pointerleave', () => { this.pointer.inside = false; this.hover = null; });
    cv.addEventListener('pointerenter', () => { this.pointer.inside = true; });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const { sx, sy } = local(e);
      const k = e.ctrlKey ? 0.01 : 0.0015;
      this.zoomAt(sx, sy, Math.exp(-e.deltaY * k * (e.deltaMode === 1 ? 30 : 1)));
    }, { passive: false });

    cv.addEventListener('contextmenu', e => {
      e.preventDefault();
      const p = updPointer(e);
      this._contextMenu(e.clientX, e.clientY, p);
    });

    window.addEventListener('keydown', e => this._keyDown(e));
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  startPan(e) {
    this.follow = null;
    this.panning = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y };
    this.setCursor('grabbing');
  }

  _contextMenu(x, y, p) {
    const j = this.jointAt(p.x, p.y), b = j ? null : this.world.bodyAt(p.x, p.y);
    const items = [];
    if (b) {
      this.select(b);
      items.push(
        { label: 'Свойства', icon: 'sliders', action: () => { document.body.classList.remove('panel-closed'); this.ui.showTab('object'); } },
        { label: 'Копия', icon: 'copy', kbd: 'Ctrl+D', action: () => this.duplicate(b) },
        { label: b.isStatic ? 'Открепить' : 'Закрепить', icon: 'pin', action: () => { this.checkpoint(); b.setStatic(!b.isStatic); if (b.isStatic && !b.color) b.setColor(null); if (!b.isStatic && !b.color) b.setColor(randomColor()); this.world.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1); this.ui.renderTab(); } },
        { label: b.trail ? 'Убрать след' : 'Оставлять след', icon: 'rope', action: () => { this.checkpoint(); b.trail = !b.trail; if (b.trail) this.setView('trails', true); else b.clearTrail(); this.ui.renderTab(); } },
        { label: this.follow === b ? 'Не следить камерой' : 'Следить камерой', icon: 'target', action: () => { this.follow = this.follow === b ? null : b; } },
        b.isStatic ? null : { label: 'Остановить', icon: 'stop', action: () => { this.checkpoint(); b.vx = b.vy = b.w = 0; } },
        '-',
        { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, action: () => { this.checkpoint(); this.removeObject(b); } },
      );
    } else if (j) {
      this.select(j);
      items.push(
        { label: 'Свойства', icon: 'sliders', action: () => { document.body.classList.remove('panel-closed'); this.ui.showTab('object'); } },
        '-',
        { label: 'Удалить', icon: 'trash', kbd: 'Del', danger: true, action: () => { this.checkpoint(); this.removeObject(j); } },
      );
    } else {
      const s = this.defaults.size;
      items.push(
        { label: 'Круг здесь', icon: 'circle', action: () => { this.checkpoint(); this.select(this.createBody(Shapes.circle(s / 2), p.x, p.y)); } },
        { label: 'Ящик здесь', icon: 'box', action: () => { this.checkpoint(); this.select(this.createBody(Shapes.box(s, s), p.x, p.y)); } },
        { label: 'Взрыв здесь', icon: 'explode', action: () => { this.checkpoint(); this.world.explode(p.x, p.y, this.defaults.blastRadius, this.defaults.blastPower); this.renderer.addEffect({ x: p.x, y: p.y, r: this.defaults.blastRadius }); } },
        '-',
        { label: this.running ? 'Пауза' : 'Пуск', icon: this.running ? 'pause' : 'play', kbd: 'Пробел', action: () => this.setRunning(!this.running) },
        { label: 'Показать всё', icon: 'fit', kbd: 'F', action: () => this.fitView() },
      );
    }
    this.ui.showMenu(x, y, items);
  }

  _keyDown(e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' && !['checkbox', 'range', 'color'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key === 'Escape') {
      if (document.getElementById('modal').classList.contains('open')) { this.ui.closeHelp(); return; }
      this.ui.hideMenu();
      if (typing) { t.blur(); return; }
      if (this.tools.active) this.tools.cancel(); else this.select(null);
      return;
    }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (mod && e.code === 'KeyD') { e.preventDefault(); if (this.selected && this.selected.shape) this.duplicate(this.selected); return; }
    if (mod && e.code === 'KeyS') { e.preventDefault(); this.saveLocal(this.sceneName); return; }
    if (mod || e.altKey) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); this.keys.add(e.code); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.setRunning(!this.running); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.selected) { e.preventDefault(); this.checkpoint(); this.removeObject(this.selected); }
      return;
    }
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

  saveDefaults() { Store.set('defaults', this.defaults); }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => app.init());
