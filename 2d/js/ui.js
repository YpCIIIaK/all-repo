'use strict';
/* ==========================================================================
   Физлаб · интерфейс: панели, инспектор, сценарии, меню, уведомления
   ========================================================================== */

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

const fmtNum = (v, d = 2) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(2);
  return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '') || '0';
};
const DEG = 180 / Math.PI;

class UI {
  constructor(app) {
    this.app = app;
    this.tab = Store.get('tab', 'object');
    this.live = [];          // функции обновления «живых» значений
    this.graphData = [];
    this.$ = id => document.getElementById(id);
  }

  /* ------------------------------ сборка ------------------------------ */

  build() {
    const app = this.app;
    // иконки в верхней панели
    document.querySelectorAll('[data-icon]').forEach(n => { n.innerHTML = icon(n.dataset.icon) + n.innerHTML; });
    document.querySelectorAll('[data-act]').forEach(n => n.addEventListener('click', () => this.action(n.dataset.act, n)));

    const speed = this.$('speedSel');
    [0.1, 0.25, 0.5, 1, 1.5, 2, 3].forEach(v => speed.append(el('option', { value: v }, `${v}×`)));
    speed.addEventListener('change', () => app.setTimeScale(parseFloat(speed.value)));

    // панель инструментов
    const tb = this.$('toolbar');
    for (const d of TOOL_DEFS) {
      if (d.sep) { tb.append(el('div', { class: 'tb-sep' })); continue; }
      const b = el('button', { class: 'tool', 'data-tool': d.id, 'aria-label': d.name, html: icon(d.icon) + `<span class="tip">${d.name}<kbd>${d.key}</kbd></span>` });
      b.addEventListener('click', () => app.tools.set(d.id));
      tb.append(b);
    }

    // вкладки
    const tabs = [['object', 'Объект', 'cube'], ['world', 'Мир', 'globe'], ['scenes', 'Сценарии', 'book'], ['view', 'Вид', 'eye']];
    const th = this.$('tabs');
    for (const [id, name, ic] of tabs) {
      const b = el('button', { class: 'tab', 'data-tab': id, html: icon(ic) + `<span>${name}</span>` });
      b.addEventListener('click', () => this.showTab(id));
      th.append(b);
    }
    this.showTab(this.tab);

    this.$('sceneName').addEventListener('click', () => this.showTab('scenes'));
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctxmenu')) this.hideMenu(); }, true);
    this.$('modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) this.closeHelp(); });
    this.$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) app.importFile(f); e.target.value = ''; });
    this.syncTop();
  }

  action(act) {
    const app = this.app;
    switch (act) {
      case 'play': app.setRunning(!app.running); break;
      case 'step': app.stepOnce(); break;
      case 'reset': app.resetToStart(); break;
      case 'undo': app.undo(); break;
      case 'redo': app.redo(); break;
      case 'fit': app.fitView(); break;
      case 'theme': app.setTheme(app.themeName === 'dark' ? 'light' : 'dark'); break;
      case 'help': this.openHelp(); break;
      case 'panel': app.togglePanel(); break;
    }
  }

  syncTop() {
    const app = this.app;
    const play = document.querySelector('[data-act="play"]');
    play.innerHTML = icon(app.running ? 'pause' : 'play');
    play.classList.toggle('paused', !app.running);
    play.title = app.running ? 'Пауза (Пробел)' : 'Пуск (Пробел)';
    document.querySelector('[data-act="theme"]').innerHTML = icon(app.themeName === 'dark' ? 'sun' : 'moon');
    this.$('speedSel').value = String(app.timeScale);
    if (this.$('speedSel').value !== String(app.timeScale)) {
      const o = el('option', { value: app.timeScale }, `${fmtNum(app.timeScale)}×`);
      this.$('speedSel').append(o); this.$('speedSel').value = String(app.timeScale);
    }
    this.$('sceneName').textContent = app.sceneName;
    document.querySelector('[data-act="undo"]').disabled = !app.undoStack.length;
    document.querySelector('[data-act="redo"]').disabled = !app.redoStack.length;
    document.body.classList.toggle('is-paused', !app.running);
  }

  syncTools() {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === this.app.tools.currentId));
    const def = TOOL_DEFS.find(d => d.id === this.app.tools.currentId);
    this.setHint(def ? def.hint : '');
  }

  setHint(text) { this.$('hint').textContent = text; this.$('hint').classList.toggle('empty', !text); }

  showTab(id) {
    this.tab = id;
    Store.set('tab', id);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    this.renderTab();
  }

  refresh() { this.renderTab(); this.syncTop(); }

  renderTab() {
    const body = this.$('panelBody');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    this.live = [];
    const r = { object: () => this.tabObject(), world: () => this.tabWorld(), scenes: () => this.tabScenes(), view: () => this.tabView() }[this.tab];
    if (r) body.append(...[].concat(r()));
    body.scrollTop = scroll;
  }

  /* --------------------------- элементы управления --------------------------- */

  section(title, ...kids) {
    return el('section', { class: 'sec' }, title ? el('h3', null, title) : null, ...kids);
  }

  range(o) {
    const app = this.app;
    const num = el('input', { class: 'num', type: 'text', inputmode: 'decimal', 'aria-label': o.label });
    const rng = el('input', { type: 'range', min: o.min, max: o.max, step: o.step ?? 'any', 'aria-label': o.label });
    const toS = v => o.toSlider ? o.toSlider(v) : v, fromS = v => o.fromSlider ? o.fromSlider(v) : v;
    const show = v => o.fmt ? o.fmt(v) : fmtNum(v, o.digits ?? 2);
    const paint = () => {
      const p = (parseFloat(rng.value) - o.min) / (o.max - o.min) * 100;
      rng.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%');
    };
    const sync = () => {
      const v = o.get();
      rng.value = toS(v);
      if (document.activeElement !== num) num.value = show(v);
      paint();
    };
    const key = o.key || 'ctl:' + o.label;
    rng.addEventListener('input', () => {
      app.checkpoint(key);
      o.set(fromS(parseFloat(rng.value)));
      num.value = show(o.get()); paint();
      if (o.after) o.after();
    });
    const commit = () => {
      let v = parseFloat(String(num.value).replace(',', '.'));
      if (!Number.isFinite(v)) { sync(); return; }
      if (o.hardMin !== undefined) v = Math.max(o.hardMin, v);
      if (o.hardMax !== undefined) v = Math.min(o.hardMax, v);
      app.checkpoint(key);
      o.set(v); sync();
      if (o.after) o.after();
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); num.blur(); } });
    const row = el('div', { class: 'ctl' + (o.disabled ? ' disabled' : ''), title: o.hint || null },
      el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, o.label),
        el('span', { class: 'ctl-val' }, num, o.unit ? el('span', { class: 'unit' }, o.unit) : null)),
      rng);
    sync();
    if (o.live) this.live.push(sync);
    return row;
  }

  toggle(o) {
    const app = this.app;
    const inp = el('input', { type: 'checkbox' });
    inp.checked = !!o.get();
    inp.addEventListener('change', () => { if (!o.noUndo) app.checkpoint(); o.set(inp.checked); if (o.after) o.after(); });
    return el('label', { class: 'tgl', title: o.hint || null }, el('span', null, o.label), inp, el('i'));
  }

  select(o) {
    const app = this.app;
    const s = el('select', { 'aria-label': o.label });
    for (const [v, t] of o.options) s.append(el('option', { value: v }, t));
    s.value = o.get();
    s.addEventListener('change', () => { if (!o.noUndo) app.checkpoint(); o.set(s.value); if (o.after) o.after(); });
    return el('div', { class: 'ctl ctl-row' }, el('span', { class: 'ctl-label' }, o.label), s);
  }

  color(o) {
    const app = this.app;
    const inp = el('input', { type: 'color', value: o.get() || '#888888' });
    inp.addEventListener('input', () => { app.checkpoint('color'); o.set(inp.value); });
    const sw = el('div', { class: 'swatches' });
    for (const c of PALETTE) {
      sw.append(el('button', { class: 'sw', style: `--c:${c}`, title: c, onclick: () => { app.checkpoint(); o.set(c); inp.value = c; } }));
    }
    if (o.allowNone) sw.append(el('button', { class: 'sw none', title: 'Цвет темы', onclick: () => { app.checkpoint(); o.set(null); } }));
    return el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, o.label), inp), sw);
  }

  buttons(list) {
    return el('div', { class: 'btns' }, list.map(b => el('button', {
      class: 'btn' + (b.kind ? ' ' + b.kind : ''), title: b.title || null, onclick: b.onClick,
      html: (b.icon ? icon(b.icon) : '') + `<span>${b.label}</span>`,
    })));
  }

  vec(o) { // пара числовых полей (x, y), обновляется «вживую»
    const app = this.app;
    const mk = (i) => {
      const n = el('input', { class: 'num wide', type: 'text', inputmode: 'decimal', 'aria-label': o.label + (i ? ' y' : ' x') });
      n.addEventListener('change', () => {
        const v = parseFloat(n.value.replace(',', '.'));
        if (Number.isFinite(v)) { app.checkpoint(); const cur = o.get(); cur[i] = v; o.set(cur[0], cur[1]); }
        sync();
      });
      n.addEventListener('keydown', e => { if (e.key === 'Enter') n.blur(); });
      return n;
    };
    const a = mk(0), b = mk(1);
    const sync = () => {
      const v = o.get();
      if (document.activeElement !== a) a.value = fmtNum(v[0], o.digits ?? 2);
      if (document.activeElement !== b) b.value = fmtNum(v[1], o.digits ?? 2);
    };
    sync();
    this.live.push(sync);
    return el('div', { class: 'ctl ctl-row' }, el('span', { class: 'ctl-label' }, o.label),
      el('span', { class: 'vec' }, el('i', null, o.names ? o.names[0] : 'x'), a, el('i', null, o.names ? o.names[1] : 'y'), b,
        o.unit ? el('span', { class: 'unit' }, o.unit) : null));
  }

  readouts(items) {
    const grid = el('div', { class: 'readouts' });
    const cells = items.map(([label]) => { const v = el('b'); grid.append(el('div', null, el('span', null, label), v)); return v; });
    const sync = () => items.forEach(([, f], i) => { cells[i].textContent = f(); });
    sync();
    this.live.push(sync);
    return grid;
  }

  liveRefresh() { for (const f of this.live) f(); }

  /* ------------------------------ вкладка «Объект» ------------------------------ */

  tabObject() {
    const app = this.app, s = app.selected, out = [];
    if (s && s.shape) out.push(...this.inspectBody(s));
    else if (s) out.push(...this.inspectJoint(s));
    else {
      out.push(el('div', { class: 'empty-state' },
        el('div', { class: 'es-ico', html: icon('select') }),
        el('p', null, 'Ничего не выбрано'),
        el('small', null, 'Выберите тело или соединение инструментом «Выбор» (V), чтобы изменить его свойства.')));
    }
    out.push(...this.defaultsPanel());
    return out;
  }

  inspectBody(b) {
    const app = this.app, w = app.world;
    const kindName = { circle: 'Круг', box: 'Прямоугольник', regular: 'Многоугольник', poly: 'Многоугольник' }[b.shape.kind] || 'Тело';
    const head = el('div', { class: 'insp-head' },
      el('span', { class: 'dot', style: `--c:${b.color || app.theme.staticFill}` }),
      el('div', null, el('b', null, `${kindName} #${b.id}`), el('small', null, b.isStatic ? 'статичное' : b.sleeping ? 'спит' : 'подвижное')),
    );
    const re = () => { b.computeMass(); w.wake(b); this.liveRefresh(); };
    const matSel = this.select({
      label: 'Материал', options: [['', '— применить —'], ...Object.entries(MATERIALS).map(([k, m]) => [k, m.title])],
      get: () => '', set: v => { const m = MATERIALS[v]; if (!m) return; b.density = m.density; b.friction = m.friction; b.restitution = m.restitution; if (!b.isStatic) b.setColor(m.color); re(); this.renderTab(); },
    });
    const sizeCtl = [];
    const sh = b.shape;
    const reshape = (shape) => { b.setShape(shape); w.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1); w.wake(b); };
    if (sh.kind === 'circle') sizeCtl.push(this.range({ label: 'Радиус', unit: 'м', min: 0.05, max: 5, step: 0.01, hardMin: 0.02, hardMax: 50, get: () => b.shape.radius, set: v => reshape(Shapes.circle(v)), after: () => this.liveRefresh() }));
    if (sh.kind === 'box') {
      sizeCtl.push(this.range({ label: 'Ширина', unit: 'м', min: 0.05, max: 20, step: 0.01, hardMin: 0.02, hardMax: 500, get: () => b.shape.w, set: v => reshape(Shapes.box(v, b.shape.h)) }));
      sizeCtl.push(this.range({ label: 'Высота', unit: 'м', min: 0.05, max: 20, step: 0.01, hardMin: 0.02, hardMax: 500, get: () => b.shape.h, set: v => reshape(Shapes.box(b.shape.w, v)) }));
    }
    if (sh.kind === 'regular') {
      sizeCtl.push(this.range({ label: 'Радиус', unit: 'м', min: 0.05, max: 5, step: 0.01, hardMin: 0.03, hardMax: 50, get: () => b.shape.r, set: v => reshape(Shapes.regular(b.shape.n, v)) }));
      sizeCtl.push(this.range({ label: 'Стороны', min: 3, max: 12, step: 1, digits: 0, get: () => b.shape.n, set: v => reshape(Shapes.regular(Math.round(v), b.shape.r)) }));
    }

    const phys = [
      this.range({ label: 'Плотность', unit: 'кг/м²', min: 0.05, max: 10, step: 0.01, hardMin: 0.001, hardMax: 1000, get: () => b.density, set: v => { b.density = v; re(); } }),
      this.range({ label: 'Масса', unit: 'кг', min: 0.01, max: Math.max(50, b.mass * 2), step: 0.01, hardMin: 0.0001, get: () => b.mass, set: v => { b.density = v / b.area; re(); }, live: true }),
      this.range({ label: 'Трение', min: 0, max: 1.5, step: 0.01, hardMin: 0, hardMax: 10, get: () => b.friction, set: v => { b.friction = v; } }),
      this.range({ label: 'Упругость', min: 0, max: 1, step: 0.01, hardMin: 0, hardMax: 1.2, hint: 'Коэффициент восстановления: 0 — не отскакивает, 1 — идеально упругий', get: () => b.restitution, set: v => { b.restitution = v; } }),
      this.range({ label: 'Гравитация ×', min: -2, max: 3, step: 0.05, hint: 'Множитель силы тяжести для этого тела', get: () => b.gravityScale, set: v => { b.gravityScale = v; w.wake(b); } }),
      this.range({ label: 'Сопротивление', unit: '1/с', min: 0, max: 5, step: 0.01, hardMin: 0, hint: 'Собственное линейное затухание тела', get: () => b.linearDamping, set: v => { b.linearDamping = v; } }),
    ];
    const flags = [
      this.toggle({ label: 'Статичное (закреплено)', get: () => b.isStatic, set: v => { b.setStatic(v); if (v && !b.color) b.setColor(null); if (!v && !b.color) b.setColor(randomColor()); w.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1); }, after: () => this.renderTab() }),
      this.toggle({ label: 'Без вращения', get: () => b.fixedRotation, set: v => { b.fixedRotation = v; if (v) b.w = 0; re(); } }),
      this.toggle({ label: 'Призрак (без столкновений)', get: () => b.noCollide, set: v => { b.noCollide = v; w.wake(b); } }),
      this.toggle({ label: 'Оставлять след', get: () => b.trail, set: v => { b.trail = v; if (!v) b.clearTrail(); if (v) app.setView('trails', true); } }),
    ];
    const label = el('input', { class: 'txt', type: 'text', value: b.label, placeholder: 'Подпись на сцене', maxlength: 40 });
    label.addEventListener('input', () => { app.checkpoint('label'); b.label = label.value; });

    const state = [
      this.vec({ label: 'Положение', unit: 'м', get: () => [b.x, b.y], set: (x, y) => { b.x = x; b.y = y; b.px = x; b.py = y; b.updateWorld(); w.wake(b); w.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1); } }),
      this.vec({ label: 'Скорость', unit: 'м/с', get: () => [b.vx, b.vy], set: (x, y) => { if (b.isStatic) return; b.vx = x; b.vy = y; w.wake(b); } }),
      this.vec({ label: 'Угол / ω', names: ['°', 'ω'], get: () => [b.angle * DEG, b.w], set: (a, om) => { b.angle = a / DEG; b.pa = b.angle; if (!b.isStatic) b.w = om; b.updateWorld(); w.wake(b); } }),
      this.readouts([
        ['|v|, м/с', () => fmtNum(b.speed)],
        ['Высота, м', () => fmtNum(b.y)],
        ['Eк, Дж', () => fmtNum(b.kinetic)],
        ['Импульс, кг·м/с', () => fmtNum(b.mass * b.speed)],
      ]),
    ];

    return [
      this.section(null, head,
        this.buttons([
          { label: 'Копия', icon: 'copy', title: 'Ctrl+D', onClick: () => app.duplicate(b) },
          { label: app.follow === b ? 'Не следить' : 'Следить', icon: 'target', onClick: () => { app.follow = app.follow === b ? null : b; this.renderTab(); } },
          { label: 'Удалить', icon: 'trash', kind: 'danger', title: 'Delete', onClick: () => { app.checkpoint(); app.removeObject(b); } },
        ])),
      this.section('Форма и материал', matSel, ...sizeCtl, this.color({ label: 'Цвет', allowNone: b.isStatic, get: () => b.color, set: c => { b.setColor(c); } }),
        el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, 'Подпись')), label)),
      this.section('Физика', ...phys),
      this.section('Свойства', ...flags),
      this.section('Состояние', ...state,
        this.buttons([{ label: 'Остановить', icon: 'stop', onClick: () => { app.checkpoint(); b.vx = b.vy = b.w = 0; this.liveRefresh(); } }])),
    ];
  }

  inspectJoint(j) {
    const app = this.app, w = app.world;
    const names = { spring: 'Пружина', rod: 'Стержень', rope: 'Верёвка', hinge: 'Шарнир', mouse: 'Захват' };
    const ends = `${j.a.isGround ? 'мир' : '#' + j.a.id} ↔ #${j.b.id}`;
    const head = el('div', { class: 'insp-head' },
      el('span', { class: 'dot ico-dot', html: icon({ spring: 'spring', rod: 'rod', rope: 'rope', hinge: 'hinge' }[j.type] || 'link') }),
      el('div', null, el('b', null, `${names[j.type]} #${j.id}`), el('small', null, ends)));
    const out = [this.section(null, head, this.buttons([
      { label: 'Удалить', icon: 'trash', kind: 'danger', onClick: () => { app.checkpoint(); app.removeObject(j); } },
    ]))];
    const p = [];
    const wk = () => { w.wake(j.a); w.wake(j.b); };
    if (j.type !== 'hinge') {
      p.push(this.range({ label: j.type === 'rope' ? 'Макс. длина' : 'Длина', unit: 'м', min: 0.05, max: Math.max(10, j.length * 2), step: 0.01, hardMin: 0.01, get: () => j.length, set: v => { j.length = v; wk(); } }));
      p.push(this.buttons([{ label: 'Длина = текущее расстояние', onClick: () => {
        app.checkpoint(); const A = j.worldA({}), B = j.worldB({}); j.length = Math.max(0.01, Math.hypot(B.x - A.x, B.y - A.y)); this.renderTab();
      } }]));
    }
    if (j.type === 'spring') {
      p.push(this.range({ label: 'Жёсткость', unit: 'Гц', min: 0.1, max: 20, step: 0.05, hardMin: 0.01, hardMax: 200, hint: 'Собственная частота колебаний пружины', get: () => j.hertz, set: v => { j.hertz = v; wk(); } }));
      p.push(this.range({ label: 'Демпфирование', min: 0, max: 2, step: 0.01, hardMin: 0, hint: '0 — без затухания, 1 — критическое', get: () => j.damping, set: v => { j.damping = v; wk(); } }));
      p.push(this.toggle({ label: 'Тонкая линия', get: () => j.style === 'line', set: v => { j.style = v ? 'line' : ''; } }));
    }
    if (j.type === 'hinge') {
      p.push(this.toggle({ label: 'Мотор', get: () => j.enableMotor, set: v => { j.enableMotor = v; wk(); }, after: () => this.renderTab() }));
      if (j.enableMotor) {
        p.push(this.range({ label: 'Скорость', unit: 'об/мин', min: -300, max: 300, step: 1, digits: 0, get: () => j.motorSpeed * 60 / TAU, set: v => { j.motorSpeed = v * TAU / 60; wk(); } }));
        p.push(this.range({ label: 'Макс. момент', unit: 'Н·м', min: 1, max: 2000, step: 1, digits: 0, hardMin: 0, get: () => j.maxTorque, set: v => { j.maxTorque = v; wk(); } }));
        p.push(this.toggle({ label: 'Управлять стрелками ← →', get: () => j.motorKeys, set: v => { j.motorKeys = v; wk(); } }));
      }
      p.push(this.toggle({ label: 'Скрыть на сцене', get: () => j.style === 'hidden', set: v => { j.style = v ? 'hidden' : ''; } }));
      p.push(this.toggle({ label: 'Ограничить угол', get: () => j.enableLimit, set: v => { j.enableLimit = v; wk(); }, after: () => this.renderTab() }));
      if (j.enableLimit) {
        p.push(this.range({ label: 'Нижний предел', unit: '°', min: -180, max: 0, step: 1, digits: 0, get: () => j.lower * DEG, set: v => { j.lower = Math.min(v / DEG, j.upper); wk(); } }));
        p.push(this.range({ label: 'Верхний предел', unit: '°', min: 0, max: 180, step: 1, digits: 0, get: () => j.upper * DEG, set: v => { j.upper = Math.max(v / DEG, j.lower); wk(); } }));
      }
    }
    out.push(this.section('Параметры', ...p));
    if (j.type !== 'mouse') {
      out.push(this.section('Прочность',
        this.range({ label: 'Разрыв при', unit: 'Н', min: 0, max: 5000, step: 10, digits: 0, hardMin: 0, hint: '0 — неразрушимо', get: () => j.breakForce, set: v => { j.breakForce = v; } }),
        this.readouts([['Нагрузка, Н', () => fmtNum(j.force, 1)], ['Запас', () => j.breakForce > 0 ? Math.max(0, Math.round((1 - j.force / j.breakForce) * 100)) + '%' : '∞']]),
        j.a.isGround ? null : this.toggle({ label: 'Соединённые тела сталкиваются', get: () => j.collideConnected, set: v => w.setCollideConnected(j, v) }),
      ));
    }
    return out;
  }

  defaultsPanel() {
    const app = this.app, d = app.defaults;
    const save = () => app.saveDefaults();
    const mat = this.select({
      label: 'Материал', noUndo: true,
      options: [...Object.entries(MATERIALS).map(([k, m]) => [k, m.title]), ['custom', 'Свой']],
      get: () => d.material, set: v => {
        d.material = v;
        const m = MATERIALS[v];
        if (m) { d.density = m.density; d.friction = m.friction; d.restitution = m.restitution; }
        save(); this.renderTab();
      },
    });
    const custom = d.material === 'custom';
    const det = el('details', { class: 'sec details', open: Store.get('defaultsOpen', true) || null },
      el('summary', null, 'Новые объекты'),
      el('div', { class: 'details-body' }, mat,
      custom ? this.range({ label: 'Плотность', unit: 'кг/м²', min: 0.05, max: 10, step: 0.01, hardMin: 0.001, key: 'def', get: () => d.density, set: v => { d.density = v; save(); } }) : null,
      custom ? this.range({ label: 'Трение', min: 0, max: 1.5, step: 0.01, hardMin: 0, key: 'def', get: () => d.friction, set: v => { d.friction = v; save(); } }) : null,
      custom ? this.range({ label: 'Упругость', min: 0, max: 1, step: 0.01, hardMin: 0, key: 'def', get: () => d.restitution, set: v => { d.restitution = v; save(); } }) : null,
      this.select({ label: 'Цвет', noUndo: true, options: [['random', 'Случайный'], ['material', 'Как у материала'], ['fixed', 'Выбранный']], get: () => d.colorMode, set: v => { d.colorMode = v; save(); this.renderTab(); } }),
      d.colorMode === 'fixed' ? this.color({ label: 'Цвет новых тел', get: () => d.color, set: c => { d.color = c; save(); } }) : null,
      this.range({ label: 'Размер по умолчанию', unit: 'м', min: 0.1, max: 4, step: 0.05, hardMin: 0.04, key: 'def', get: () => d.size, set: v => { d.size = v; save(); } }),
      this.range({ label: 'Стороны многоугольника', min: 3, max: 12, step: 1, digits: 0, key: 'def', get: () => d.sides, set: v => { d.sides = Math.round(v); save(); } }),
      this.range({ label: 'Толщина планки', unit: 'м', min: 0.05, max: 2, step: 0.01, hardMin: 0.02, key: 'def', get: () => d.wallThickness, set: v => { d.wallThickness = v; save(); } }),
      this.toggle({ label: 'Создавать статичными', noUndo: true, get: () => d.isStatic, set: v => { d.isStatic = v; save(); } }),
      this.toggle({ label: 'Со следом', noUndo: true, get: () => d.trail, set: v => { d.trail = v; save(); } })),
    );
    det.addEventListener('toggle', () => Store.set('defaultsOpen', det.open));
    const det2 = el('details', { class: 'sec details', open: Store.get('toolsOpen', false) || null },
      el('summary', null, 'Инструменты'),
      el('div', { class: 'details-body' }, this.range({ label: 'Пружина: жёсткость', unit: 'Гц', min: 0.2, max: 15, step: 0.1, key: 'def', get: () => d.springHertz, set: v => { d.springHertz = v; save(); } }),
      this.range({ label: 'Пружина: демпфирование', min: 0, max: 2, step: 0.01, key: 'def', get: () => d.springDamping, set: v => { d.springDamping = v; save(); } }),
      this.range({ label: 'Взрыв: радиус', unit: 'м', min: 0.5, max: 15, step: 0.1, key: 'def', get: () => d.blastRadius, set: v => { d.blastRadius = v; save(); } }),
      this.range({ label: 'Взрыв: мощность', min: 1, max: 200, step: 1, digits: 0, key: 'def', get: () => d.blastPower, set: v => { d.blastPower = v; save(); } }),
      this.range({ label: 'Магнит: радиус', unit: 'м', min: 1, max: 20, step: 0.5, key: 'def', get: () => d.magnetRadius, set: v => { d.magnetRadius = v; save(); } }),
      this.range({ label: 'Магнит: сила', min: 5, max: 200, step: 1, digits: 0, key: 'def', get: () => d.magnetPower, set: v => { d.magnetPower = v; save(); } }),
      this.range({ label: 'Пуск: сила', unit: '1/с', min: 1, max: 15, step: 0.5, key: 'def', get: () => d.slingPower, set: v => { d.slingPower = v; save(); } })),
    );
    det2.addEventListener('toggle', () => Store.set('toolsOpen', det2.open));
    return [det, det2];
  }

  /* ------------------------------ вкладка «Мир» ------------------------------ */

  tabWorld() {
    const app = this.app, w = app.world;
    const gMag = () => Math.hypot(w.gravityX, w.gravityY);
    const gDir = () => gMag() < 1e-9 ? 0 : Math.atan2(w.gravityX, -w.gravityY) * DEG;
    const setG = (mag, dir) => { const a = dir / DEG; w.gravityX = mag * Math.sin(a); w.gravityY = -mag * Math.cos(a); w.wakeAll(); };
    const preset = () => { const m = gMag(); const p = GRAVITY_PRESETS.find(p => Math.abs(p.g - m) < 0.005); return p && Math.abs(gDir()) < 0.5 ? p.id : 'custom'; };
    const presetSel = this.select({
      label: 'Планета', options: [...GRAVITY_PRESETS.map(p => [p.id, `${p.label} · ${p.g} м/с²`]), ['custom', 'Своя']],
      get: preset, set: v => { const p = GRAVITY_PRESETS.find(p => p.id === v); if (p) setG(p.g, 0); }, after: () => this.renderTab(),
    });
    const ctlMag = this.range({ label: 'Ускорение g', unit: 'м/с²', min: 0, max: 30, step: 0.01, hardMin: 0, hardMax: 1000, get: gMag, set: v => setG(v, gDir()) });
    const ctlDir = this.range({ label: 'Направление', unit: '°', min: -180, max: 180, step: 1, digits: 0, hint: '0° — вниз, 90° — вправо', get: gDir, set: v => setG(gMag(), v) });

    const out = [
      this.section('Гравитация', presetSel, ctlMag, ctlDir,
        this.toggle({ label: 'Взаимное притяжение тел', hint: 'Каждое тело притягивает каждое (как планеты). Нагружает при большом числе тел', get: () => w.mutualGravity, set: v => { w.mutualGravity = v; w.wakeAll(); }, after: () => this.renderTab() }),
        w.mutualGravity ? this.range({ label: 'Постоянная G', min: 0.01, max: 20, step: 0.01, hardMin: 0, get: () => w.G, set: v => { w.G = v; } }) : null),
      this.section('Среда и время',
        this.range({ label: 'Сопротивление воздуха', unit: '1/с', min: 0, max: 3, step: 0.01, hardMin: 0, hardMax: 100, get: () => w.airDrag, set: v => { w.airDrag = v; } }),
        this.range({
          label: 'Скорость времени', unit: '×', min: -2.3, max: 1.1, step: 0.01, key: 'speed',
          toSlider: v => Math.log(v), fromSlider: v => Math.round(Math.exp(v) * 100) / 100,
          hardMin: 0.01, hardMax: 5, get: () => app.timeScale, set: v => app.setTimeScale(v),
        }),
        this.range({ label: 'Точность (подшаги)', min: 1, max: 16, step: 1, digits: 0, hint: 'Больше — стабильнее стопки и цепи, но тяжелее', get: () => w.substeps, set: v => { w.substeps = Math.round(v); } }),
        this.toggle({ label: 'Сон неподвижных тел', hint: 'Успокоившиеся тела перестают считаться — большая экономия', get: () => w.allowSleep, set: v => w.setAllowSleep(v) }),
      ),
      this.section('Действия', this.buttons([
        { label: 'Остановить все', icon: 'stop', onClick: () => { app.checkpoint(); for (const b of w.bodies) { b.vx = b.vy = b.w = 0; } } },
        { label: 'Разбудить все', icon: 'sun', onClick: () => w.wakeAll() },
        { label: 'Стереть следы', icon: 'eraser', onClick: () => { for (const b of w.bodies) b.clearTrail(); } },
        { label: 'Убрать подвижные', icon: 'trash', onClick: () => app.clearScene(true) },
        { label: 'Очистить всё', icon: 'trash', kind: 'danger', onClick: e => this.confirmClick(e.currentTarget, () => app.clearScene(false)) },
      ])),
      this.section('Статистика', this.readouts([
        ['Тел', () => String(w.bodies.length)],
        ['Спят', () => String(w.bodies.reduce((n, b) => n + (b.sleeping ? 1 : 0), 0))],
        ['Соединений', () => String(w.joints.length)],
        ['Контактов', () => String(w.contacts.length)],
        ['Время, с', () => fmtNum(w.time, 1)],
        ['Шаг физики, мс', () => fmtNum(w.stepMs, 2)],
      ])),
    ];
    return out;
  }

  /* ------------------------------ вкладка «Сценарии» ------------------------------ */

  tabScenes() {
    const app = this.app;
    const name = el('input', { class: 'txt', type: 'text', value: app.sceneName, maxlength: 60, placeholder: 'Название сцены' });
    name.addEventListener('input', () => { app.sceneName = name.value || 'Без названия'; this.$('sceneName').textContent = app.sceneName; });
    const desc = el('textarea', { class: 'txt', rows: 2, maxlength: 400, placeholder: 'Описание (необязательно)' });
    desc.value = app.sceneDesc || '';
    desc.addEventListener('input', () => { app.sceneDesc = desc.value; });

    const cards = el('div', { class: 'cards' }, SCENARIOS.map(s => el('button', {
      class: 'card' + (app.sceneId === s.id ? ' current' : ''), title: s.desc,
      onclick: () => app.loadBuiltin(s.id),
    }, el('span', { class: 'card-ico' }, s.icon), el('b', null, s.name), el('small', null, s.desc))));

    const prefabs = el('div', { class: 'chips' }, Object.entries(PREFABS).map(([id, p]) =>
      el('button', { class: 'chip', onclick: () => app.insertPrefab(id), html: icon('plus') + p.name })));

    const saves = app.listSaves();
    const list = el('div', { class: 'saves' });
    if (!saves.length) list.append(el('p', { class: 'muted' }, 'Пока нет сохранений. Соберите сцену и нажмите «Сохранить».'));
    for (const s of saves) {
      const d = new Date(s.date);
      list.append(el('div', { class: 'save' },
        el('button', { class: 'save-main', onclick: () => app.loadSave(s.id), title: 'Загрузить' },
          el('b', null, s.name), el('small', null, `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)} · ${s.data.bodies.length} тел`)),
        el('button', { class: 'icon-btn', title: 'Перезаписать текущей сценой', html: icon('save'), onclick: () => app.saveLocal(s.name, s.id) }),
        el('button', { class: 'icon-btn danger', title: 'Удалить', html: icon('trash'), onclick: e => this.confirmClick(e.currentTarget, () => app.deleteSave(s.id)) }),
      ));
    }

    return [
      this.section('Текущая сцена', name, desc, this.buttons([
        { label: 'Сохранить', icon: 'save', kind: 'primary', onClick: () => app.saveLocal(app.sceneName) },
        { label: 'Начальное состояние', icon: 'pin', title: 'Запомнить текущее состояние для кнопки «Сброс»', onClick: () => app.markStart() },
      ])),
      this.section('Мои сохранения', list),
      this.section('Файл и ссылка', this.buttons([
        { label: 'Экспорт .json', icon: 'download', onClick: () => app.exportFile() },
        { label: 'Импорт .json', icon: 'upload', onClick: () => this.$('fileInput').click() },
        { label: 'Ссылка на сцену', icon: 'link', onClick: () => app.shareLink() },
      ])),
      this.section('Добавить в сцену', el('p', { class: 'muted' }, 'Шаблон появится в центре экрана.'), prefabs),
      this.section('Встроенные сценарии', cards),
    ];
  }

  /* ------------------------------ вкладка «Вид» ------------------------------ */

  tabView() {
    const app = this.app, v = app.view;
    const t = (key, label, hint) => this.toggle({ label, hint, noUndo: true, get: () => v[key], set: val => app.setView(key, val) });
    return [
      this.section('Слои', t('grid', 'Сетка'), t('snap', 'Привязка к сетке', 'Новые объекты выравниваются по линиям сетки'),
        t('velocity', 'Векторы скорости'), t('contacts', 'Точки контакта'), t('centers', 'Центры масс'),
        t('aabb', 'Габаритные рамки'), t('trails', 'Следы движения'), t('sleeping', 'Затемнять спящие тела'), t('scale', 'Линейка масштаба')),
      this.section('Панели', t('stats', 'Счётчик FPS и тел'), t('graph', 'График энергии')),
      this.section('Оформление',
        this.select({ label: 'Тема', noUndo: true, options: [['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', 'Как в системе']], get: () => app.themePref, set: val => app.setTheme(val) }),
        this.select({ label: 'Чёткость', noUndo: true, options: [['high', 'Высокая (Retina)'], ['medium', 'Средняя'], ['low', 'Экономная']], get: () => v.quality, set: val => app.setView('quality', val) }),
        t('smooth', 'Плавность (интерполяция кадров)', 'Сглаживает движение на мониторах 120+ Гц и в замедленном времени')),
      this.section('Камера', this.buttons([
        { label: 'Показать всё', icon: 'fit', title: 'F', onClick: () => app.fitView() },
        { label: 'Сбросить вид', icon: 'target', onClick: () => { app.follow = null; Object.assign(app.cam, { x: 0, y: 6, zoom: 40 }); } },
      ])),
    ];
  }

  /* ------------------------------ обновления ------------------------------ */

  tick() {
    const app = this.app, w = app.world;
    if (app.view.stats) {
      let sleep = 0;
      for (const b of w.bodies) if (b.sleeping) sleep++;
      this.$('stats').innerHTML =
        `<b>${Math.round(app.fps)}</b> FPS · ${w.bodies.length} тел` + (sleep ? ` <span>(${sleep} спят)</span>` : '') +
        ` · ${w.contacts.length} конт. · физика ${fmtNum(w.stepMs, 1)} мс`;
    }
    this.liveRefresh();
    if (app.view.graph) this.drawGraph();
  }

  pushGraphSample() {
    const e = this.app.world.energy();
    const d = this.graphData;
    d.push([e.ke, e.pe]);
    if (d.length > 300) d.shift();
  }

  drawGraph() {
    const cv = this.$('graph'), ctx = cv.getContext('2d'), th = this.app.theme;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = 260, H = 116;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = this.graphData;
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.fillStyle = th.text; ctx.globalAlpha = 0.8; ctx.fillText('Энергия, Дж', 10, 8); ctx.globalAlpha = 1;
    if (d.length < 2) return;
    let pe0 = Infinity;
    for (const s of d) pe0 = Math.min(pe0, s[1]);
    let max = 1e-6;
    for (const s of d) max = Math.max(max, s[0], s[1] - pe0, s[0] + s[1] - pe0);
    const top = 26, h = H - top - 10, x0 = 10, w = W - 20;
    const series = [[s => s[0], '#3ddc97', 'Eк'], [s => s[1] - pe0, '#4dabf7', 'Eп'], [s => s[0] + s[1] - pe0, '#ffd43b', 'E']];
    series.forEach(([f, c, name], k) => {
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath();
      d.forEach((s, i) => { const X = x0 + i / 299 * w, Y = top + h - f(s) / max * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
      ctx.fillStyle = c; ctx.fillText(`${name} ${fmtNum(f(d[d.length - 1]), 1)}`, 100 + k * 54, 8);
    });
  }

  /* ------------------------------ меню и окна ------------------------------ */

  toast(msg, kind = '') {
    const box = this.$('toasts');
    const t = el('div', { class: 'toast ' + kind }, msg);
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  showMenu(x, y, items) {
    const m = this.$('ctxmenu');
    m.innerHTML = '';
    for (const it of items) {
      if (it === '-') { m.append(el('div', { class: 'mi-sep' })); continue; }
      if (!it) continue;
      m.append(el('button', {
        class: 'mi' + (it.danger ? ' danger' : ''), onclick: () => { this.hideMenu(); it.action(); },
        html: (it.icon ? icon(it.icon) : '<span class="ico"></span>') + `<span>${it.label}</span>` + (it.kbd ? `<kbd>${it.kbd}</kbd>` : ''),
      }));
    }
    m.classList.add('open');
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }
  hideMenu() { this.$('ctxmenu').classList.remove('open'); }

  buildHelp() {
    const keys = [
      ['Пробел', 'Пуск / пауза'], ['N', 'Один шаг'], ['Home', 'Сброс к началу'], ['Ctrl+Z / Ctrl+Y', 'Отменить / повторить'],
      ['Delete', 'Удалить выбранное'], ['Ctrl+D', 'Копия выбранного'], ['Q / E', 'Повернуть выбранное (Shift — точнее)'],
      ['F', 'Показать всю сцену'], ['← →', 'Моторы с управлением'], ['Esc', 'Снять выделение / отмена'], ['Колесо', 'Масштаб'],
      ['Средняя кнопка, пустое место', 'Перемещение вида'],
    ];
    const tools = TOOL_DEFS.filter(d => !d.sep).map(d => [d.key, d.name]);
    const tbl = rows => el('div', { class: 'keys' }, rows.map(([k, v]) => el('div', null, el('kbd', null, k), el('span', null, v))));
    this.$('modalBody').append(
      el('h2', null, 'Физлаб — как пользоваться'),
      el('p', { class: 'muted' }, 'Песочница двумерной физики: твёрдые тела, трение, упругость, пружины, шарниры, моторы, верёвки и взаимное притяжение. Всё считается прямо в браузере.'),
      el('div', { class: 'help-cols' },
        el('div', null, el('h4', null, 'Инструменты'), tbl(tools)),
        el('div', null, el('h4', null, 'Клавиши'), tbl(keys))),
      el('h4', null, 'Советы'),
      el('ul', null,
        el('li', null, 'На паузе тела можно расставлять мышью без физики, а при запуске — тянуть «за верёвочку».'),
        el('li', null, 'Кнопка «Сброс» возвращает сцену к моменту последнего запуска или загрузки.'),
        el('li', null, 'Сохраняйте свои сценарии на вкладке «Сценарии» — в браузере, файлом .json или ссылкой.'),
        el('li', null, 'Шарнир, поставленный на два перекрытых тела, соединяет их. Включите мотор в инспекторе — получится колесо.'),
        el('li', null, 'Если много тел и падает FPS — уменьшите «Точность» или «Чёткость», и включите «Сон неподвижных тел».')),
    );
  }
  openHelp() { this.$('modalBody').innerHTML = ''; this.buildHelp(); this.$('modal').classList.add('open'); }

  /** Двухшаговое подтверждение: первый клик «взводит» кнопку, второй — выполняет. */
  confirmClick(btn, fn) {
    if (btn.classList.contains('armed')) { btn.classList.remove('armed'); fn(); return; }
    btn.classList.add('armed');
    const span = btn.querySelector('span'), old = span ? span.textContent : null;
    if (span) span.textContent = 'Точно?';
    setTimeout(() => { btn.classList.remove('armed'); if (span) span.textContent = old; }, 2500);
  }

  showText(title, note, text) {
    const ta = el('textarea', { class: 'txt', readonly: true, rows: 4 });
    ta.value = text;
    this.$('modalBody').innerHTML = '';
    this.$('modalBody').append(el('div', { class: 'share-box' }, el('h2', null, title), el('p', { class: 'muted' }, note), ta));
    this.$('modal').classList.add('open');
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  }
  closeHelp() { this.$('modal').classList.remove('open'); }
}
