/* ==========================================================================
   Физлаб 3D · интерфейс: панели, инспектор, сценарии, меню, уведомления
   ========================================================================== */

import { icon, MATERIALS, GRAVITY_PRESETS, PALETTE } from './data.js';
import { TOOL_DEFS } from './tools.js';
import { SCENARIOS, PREFABS } from './scenarios.js';
import { Store } from './serialize.js';
import { Q, SHAPE_NAMES } from './physics.js';

export function el(tag, props, ...kids) {
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

export const fmtNum = (v, d = 2) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e5) return v.toExponential(2);
  return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '') || '0';
};
const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;

export class UI {
  constructor(app) {
    this.app = app;
    this.tab = Store.get('tab', 'object');
    this.live = [];
    this.graphData = [];
    this.$ = id => document.getElementById(id);
  }

  build() {
    const app = this.app;
    document.querySelectorAll('[data-icon]').forEach(n => { n.innerHTML = icon(n.dataset.icon) + n.innerHTML; });
    document.querySelectorAll('[data-act]').forEach(n => n.addEventListener('click', () => this.action(n.dataset.act)));
    const speed = this.$('speedSel');
    [0.1, 0.25, 0.5, 1, 1.5, 2, 3].forEach(v => speed.append(el('option', { value: v }, `${v}×`)));
    speed.addEventListener('change', () => app.setTimeScale(parseFloat(speed.value)));

    const tb = this.$('toolbar');
    for (const d of TOOL_DEFS) {
      if (d.sep) { tb.append(el('div', { class: 'tb-sep' })); continue; }
      const b = el('button', { class: 'tool', 'data-tool': d.id, 'aria-label': d.name, html: icon(d.icon) + `<span class="tip">${d.name}<kbd>${d.key}</kbd></span>` });
      b.addEventListener('click', () => app.tools.set(d.id));
      tb.append(b);
    }
    const tabs = [['object', 'Объект', 'cube'], ['world', 'Мир', 'globe'], ['scenes', 'Сценарии', 'book'], ['view', 'Вид', 'eye']];
    for (const [id, name, ic] of tabs) {
      const b = el('button', { class: 'tab', 'data-tab': id, html: icon(ic) + `<span>${name}</span>` });
      b.addEventListener('click', () => this.showTab(id));
      this.$('tabs').append(b);
    }
    this.showTab(this.tab);
    this.$('sceneName').addEventListener('click', () => { document.body.classList.remove('panel-closed'); this.showTab('scenes'); });
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctxmenu')) this.hideMenu(); }, true);
    this.$('modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) this.closeModal(); });
    this.$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) app.importFile(f); e.target.value = ''; });
    this.syncTop();
  }

  action(act) {
    const app = this.app;
    ({
      play: () => app.setRunning(!app.running), step: () => app.stepOnce(), reset: () => app.resetToStart(),
      undo: () => app.undo(), redo: () => app.redo(), fit: () => app.fitView(),
      theme: () => app.setTheme(app.themeName === 'dark' ? 'light' : 'dark'), help: () => this.openHelp(), panel: () => app.togglePanel(),
    })[act]?.();
  }

  syncTop() {
    const app = this.app, play = document.querySelector('[data-act="play"]');
    play.innerHTML = icon(app.running ? 'pause' : 'play');
    play.classList.toggle('paused', !app.running);
    play.title = app.running ? 'Пауза (Пробел)' : 'Пуск (Пробел)';
    document.querySelector('[data-act="theme"]').innerHTML = icon(app.themeName === 'dark' ? 'sun' : 'moon');
    const sp = this.$('speedSel');
    sp.value = String(app.timeScale);
    if (sp.value !== String(app.timeScale)) { sp.append(el('option', { value: app.timeScale }, `${fmtNum(app.timeScale)}×`)); sp.value = String(app.timeScale); }
    this.$('sceneName').textContent = app.sceneName;
    document.querySelector('[data-act="undo"]').disabled = !app.undoStack.length;
    document.querySelector('[data-act="redo"]').disabled = !app.redoStack.length;
    document.body.classList.toggle('is-paused', !app.running);
  }

  syncTools() {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === this.app.tools.currentId));
    const def = this.app.tools.def;
    this.$('hint').textContent = def ? def.hint : '';
    this.$('hint').classList.toggle('empty', !def);
  }

  showTab(id) {
    this.tab = id; Store.set('tab', id);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    this.renderTab();
  }
  refresh() { this.renderTab(); this.syncTop(); }
  renderTab() {
    const body = this.$('panelBody'), scroll = body.scrollTop;
    body.innerHTML = ''; this.live = [];
    const r = { object: () => this.tabObject(), world: () => this.tabWorld(), scenes: () => this.tabScenes(), view: () => this.tabView() }[this.tab];
    if (r) body.append(...[].concat(r()));
    body.scrollTop = scroll;
  }

  /* ------------------------------ элементы ------------------------------ */

  section(title, ...kids) { return el('section', { class: 'sec' }, title ? el('h3', null, title) : null, ...kids); }

  range(o) {
    const app = this.app;
    const num = el('input', { class: 'num', type: 'text', inputmode: 'decimal', 'aria-label': o.label });
    const rng = el('input', { type: 'range', min: o.min, max: o.max, step: o.step ?? 'any', 'aria-label': o.label });
    const toS = v => o.toSlider ? o.toSlider(v) : v, fromS = v => o.fromSlider ? o.fromSlider(v) : v;
    const show = v => fmtNum(v, o.digits ?? 2);
    const paint = () => rng.style.setProperty('--p', Math.max(0, Math.min(100, (parseFloat(rng.value) - o.min) / (o.max - o.min) * 100)) + '%');
    const sync = () => { const v = o.get(); rng.value = toS(v); if (document.activeElement !== num) num.value = show(v); paint(); };
    const key = o.key || 'ctl:' + o.label;
    rng.addEventListener('input', () => { if (!o.noUndo) app.checkpoint(key); o.set(fromS(parseFloat(rng.value))); num.value = show(o.get()); paint(); o.after?.(); });
    rng.addEventListener('change', () => o.commit?.());
    const commit = () => {
      let v = parseFloat(String(num.value).replace(',', '.'));
      if (!Number.isFinite(v)) { sync(); return; }
      if (o.hardMin !== undefined) v = Math.max(o.hardMin, v);
      if (o.hardMax !== undefined) v = Math.min(o.hardMax, v);
      if (!o.noUndo) app.checkpoint(key);
      o.set(v); sync(); o.after?.(); o.commit?.();
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); num.blur(); } });
    const row = el('div', { class: 'ctl', title: o.hint || null },
      el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, o.label), el('span', { class: 'ctl-val' }, num, o.unit ? el('span', { class: 'unit' }, o.unit) : null)), rng);
    sync();
    if (o.live) this.live.push(sync);
    return row;
  }

  toggle(o) {
    const inp = el('input', { type: 'checkbox' });
    inp.checked = !!o.get();
    inp.addEventListener('change', () => { if (!o.noUndo) this.app.checkpoint(); o.set(inp.checked); o.after?.(); });
    return el('label', { class: 'tgl', title: o.hint || null }, el('span', null, o.label), inp, el('i'));
  }

  select(o) {
    const s = el('select', { 'aria-label': o.label });
    for (const [v, t] of o.options) s.append(el('option', { value: v }, t));
    s.value = o.get();
    s.addEventListener('change', () => { if (!o.noUndo) this.app.checkpoint(); o.set(s.value); o.after?.(); });
    return el('div', { class: 'ctl ctl-row' }, el('span', { class: 'ctl-label' }, o.label), s);
  }

  color(o) {
    const app = this.app;
    const inp = el('input', { type: 'color', value: o.get() || '#888888', 'aria-label': o.label });
    inp.addEventListener('input', () => { app.checkpoint('color'); o.set(inp.value); });
    const sw = el('div', { class: 'swatches' });
    for (const c of PALETTE) sw.append(el('button', { class: 'sw', style: `--c:${c}`, title: c, 'aria-label': c, onclick: () => { app.checkpoint(); o.set(c); inp.value = c; } }));
    if (o.allowNone) sw.append(el('button', { class: 'sw none', title: 'Цвет темы', 'aria-label': 'Цвет темы', onclick: () => { app.checkpoint(); o.set(null); } }));
    return el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, o.label), inp), sw);
  }

  buttons(list) {
    return el('div', { class: 'btns' }, list.filter(Boolean).map(b => el('button', {
      class: 'btn' + (b.kind ? ' ' + b.kind : ''), title: b.title || null, onclick: b.onClick,
      html: (b.icon ? icon(b.icon) : '') + `<span>${b.label}</span>`,
    })));
  }

  vec3(o) {
    const app = this.app, names = o.names || ['x', 'y', 'z'];
    const ins = [0, 1, 2].map(i => {
      const n = el('input', { class: 'num v3', type: 'text', inputmode: 'decimal', 'aria-label': `${o.label} ${names[i]}` });
      n.addEventListener('change', () => {
        const v = parseFloat(n.value.replace(',', '.'));
        if (Number.isFinite(v)) { app.checkpoint(); const cur = o.get(); cur[i] = v; o.set(cur); }
        sync();
      });
      n.addEventListener('keydown', e => { if (e.key === 'Enter') n.blur(); });
      return n;
    });
    const sync = () => { const v = o.get(); ins.forEach((n, i) => { if (document.activeElement !== n) n.value = fmtNum(v[i], o.digits ?? 2); }); };
    sync(); this.live.push(sync);
    return el('div', { class: 'ctl' }, el('div', { class: 'ctl-head' }, el('span', { class: 'ctl-label' }, o.label), o.unit ? el('span', { class: 'unit' }, o.unit) : null),
      el('div', { class: 'vec' }, ins.map((n, i) => el('label', { class: 'vcell' }, el('i', null, names[i]), n))));
  }

  readouts(items) {
    const grid = el('div', { class: 'readouts' });
    const cells = items.map(([label]) => { const v = el('b'); grid.append(el('div', null, el('span', null, label), v)); return v; });
    const sync = () => items.forEach(([, f], i) => { cells[i].textContent = f(); });
    sync(); this.live.push(sync);
    return grid;
  }

  liveRefresh() { for (const f of this.live) f(); }

  confirmClick(btn, fn) {
    if (btn.classList.contains('armed')) { btn.classList.remove('armed'); fn(); return; }
    btn.classList.add('armed');
    const span = btn.querySelector('span'), old = span ? span.textContent : null;
    if (span) span.textContent = 'Точно?';
    setTimeout(() => { btn.classList.remove('armed'); if (span) span.textContent = old; }, 2500);
  }

  /* ------------------------------ «Объект» ------------------------------ */

  tabObject() {
    const s = this.app.selected, out = [];
    if (s && s.kind) out.push(...this.inspectObj(s));
    else if (s) out.push(...this.inspectJoint(s));
    else out.push(el('div', { class: 'empty-state' },
      el('div', { class: 'es-ico', html: icon('select') }), el('p', null, 'Ничего не выбрано'),
      el('small', null, 'Кликните по телу или соединению инструментом «Выбор» (V), чтобы изменить его свойства.')));
    out.push(...this.defaultsPanel());
    return out;
  }

  inspectObj(o) {
    const app = this.app, P = app.physics;
    const reb = () => { P.rebuild(o); this.liveRefresh(); };
    const mat = () => { P.updateMaterial(o); this.liveRefresh(); };
    const head = el('div', { class: 'insp-head' },
      el('span', { class: 'dot', style: `--c:${o.color || 'var(--inset)'}` }),
      el('div', null, el('b', null, `${o.name} #${o.id}`), el('small', null, o.isStatic ? 'статичное' : o.sleeping ? 'спит' : 'подвижное')));
    const s = o.size, size = [];
    const R = (label, key, max) => this.range({ label, unit: 'м', min: 0.05, max, step: 0.01, hardMin: 0.02, hardMax: 500, get: () => o.size[key], set: v => { o.size[key] = v; }, commit: reb });
    if (o.kind === 'box') size.push(R('Ширина', 'w', 20), R('Высота', 'h', 20), R('Глубина', 'd', 20));
    else if (o.kind === 'ball') size.push(R('Радиус', 'r', 5));
    else size.push(R('Радиус', 'r', 5), R(o.kind === 'capsule' ? 'Длина цилиндра' : 'Высота', 'h', 20));
    void s;
    const e = () => Q.toEuler(o.q);
    return [
      this.section(null, head, this.buttons([
        { label: 'Копия', icon: 'copy', title: 'Ctrl+D', onClick: () => app.duplicate(o) },
        o.isStatic ? null : { label: app.follow === o ? 'Не следить' : 'Следить', icon: 'target', onClick: () => { app.follow = app.follow === o ? null : o; this.renderTab(); } },
        { label: 'Удалить', icon: 'trash', kind: 'danger', title: 'Delete', onClick: () => { app.checkpoint(); app.removeObject(o); } },
      ])),
      this.section('Форма и материал',
        this.select({ label: 'Материал', options: [['', '— применить —'], ...Object.entries(MATERIALS).map(([k, m]) => [k, m.title])], get: () => '',
          set: v => { const m = MATERIALS[v]; if (!m) return; o.density = m.density; o.friction = m.friction; o.restitution = m.restitution; if (!o.isStatic) o.color = m.color; mat(); this.renderTab(); } }),
        ...size,
        this.color({ label: 'Цвет', allowNone: o.isStatic, get: () => o.color, set: c => { o.color = c; } }),
        (() => { const t = el('input', { class: 'txt', type: 'text', value: o.label, placeholder: 'Подпись над телом', maxlength: 40, 'aria-label': 'Подпись' }); t.addEventListener('input', () => { app.checkpoint('label'); o.label = t.value; }); return el('div', { class: 'ctl' }, el('span', { class: 'ctl-label' }, 'Подпись'), t); })()),
      this.section('Физика',
        this.range({ label: 'Плотность', unit: 'кг/м³', min: 0.05, max: 12, step: 0.01, hardMin: 0.001, hardMax: 1000, get: () => o.density, set: v => { o.density = v; mat(); } }),
        this.readouts([['Масса, кг', () => fmtNum(o.mass)], ['Объём, м³', () => fmtNum(o.volume, 3)]]),
        this.range({ label: 'Трение', min: 0, max: 1.5, step: 0.01, hardMin: 0, hardMax: 10, get: () => o.friction, set: v => { o.friction = v; mat(); } }),
        this.range({ label: 'Упругость', min: 0, max: 1, step: 0.01, hardMin: 0, hardMax: 1.2, hint: '0 — не отскакивает, 1 — идеально упругий', get: () => o.restitution, set: v => { o.restitution = v; mat(); } }),
        o.isStatic ? null : this.range({ label: 'Гравитация ×', min: -2, max: 3, step: 0.05, get: () => o.gravityScale, set: v => { o.gravityScale = v; mat(); } }),
        o.isStatic ? null : this.range({ label: 'Затухание', unit: '1/с', min: 0, max: 5, step: 0.01, hardMin: 0, get: () => o.damping, set: v => { o.damping = v; mat(); } })),
      this.section('Свойства',
        this.toggle({ label: 'Статичное (закреплено)', get: () => o.isStatic, set: v => { o.isStatic = v; if (!v && !o.color) o.color = PALETTE[o.id % PALETTE.length]; reb(); }, after: () => this.renderTab() }),
        o.isStatic ? null : this.toggle({ label: 'Без вращения', get: () => o.fixedRotation, set: v => { o.fixedRotation = v; reb(); } }),
        o.isStatic ? null : this.toggle({ label: 'Быстрое тело (CCD)', hint: 'Не пролетает сквозь тонкие стенки на большой скорости', get: () => o.ccd, set: v => { o.ccd = v; reb(); } }),
        o.isStatic ? null : this.toggle({ label: 'Оставлять след', get: () => o.trail, set: v => { o.trail = v; if (!v) o.clearTrail(); else app.setView('trails', true); } })),
      this.section('Состояние',
        this.vec3({ label: 'Положение', unit: 'м', get: () => [o.p.x, o.p.y, o.p.z], set: v => P.setPose(o, { x: v[0], y: v[1], z: v[2] }) }),
        this.vec3({ label: 'Поворот', unit: '°', names: ['x', 'y', 'z'], digits: 1, get: () => { const r = e(); return [r.x * DEG, r.y * DEG, r.z * DEG]; }, set: v => P.setPose(o, null, Q.fromEuler(v[0] / DEG, v[1] / DEG, v[2] / DEG)) }),
        o.isStatic ? null : this.vec3({ label: 'Скорость', unit: 'м/с', get: () => { const v = o.vel(); return [v.x, v.y, v.z]; }, set: v => P.setVelocity(o, { x: v[0], y: v[1], z: v[2] }) }),
        o.isStatic ? null : this.readouts([
          ['|v|, м/с', () => { const v = o.vel(); return fmtNum(Math.hypot(v.x, v.y, v.z)); }],
          ['Высота, м', () => fmtNum(o.p.y)],
          ['Eк, Дж', () => { const v = o.vel(); return fmtNum(0.5 * o.mass * (v.x * v.x + v.y * v.y + v.z * v.z)); }],
          ['Импульс, кг·м/с', () => { const v = o.vel(); return fmtNum(o.mass * Math.hypot(v.x, v.y, v.z)); }],
        ]),
        o.isStatic ? null : this.buttons([{ label: 'Остановить', icon: 'stop', onClick: () => { app.checkpoint(); P.setVelocity(o, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }); } }])),
    ];
  }

  inspectJoint(j) {
    const app = this.app, P = app.physics;
    const names = { spring: 'Пружина', rope: 'Верёвка', ball: 'Шаровой шарнир', hinge: 'Ось', weld: 'Сварка' };
    const icons = { spring: 'spring', rope: 'rope', ball: 'ball3', hinge: 'hinge', weld: 'weld' };
    const reb = () => P.rebuildJoint(j);
    const head = el('div', { class: 'insp-head' }, el('span', { class: 'dot ico-dot', html: icon(icons[j.type]) }),
      el('div', null, el('b', null, `${names[j.type]} #${j.id}`), el('small', null, `${j.a ? (j.a.ground ? 'пол' : j.a.name + ' #' + j.a.id) : 'мир'} ↔ ${j.b.name} #${j.b.id}`)));
    const p = [];
    if (j.type === 'spring' || j.type === 'rope') {
      p.push(this.range({ label: j.type === 'rope' ? 'Макс. длина' : 'Длина покоя', unit: 'м', min: 0.05, max: Math.max(10, j.length * 2), step: 0.01, hardMin: 0.01, get: () => j.length, set: v => { j.length = v; }, commit: reb }));
      p.push(this.buttons([{ label: 'Длина = текущее расстояние', onClick: () => { app.checkpoint(); const w = P.anchorsWorld(j); j.length = Math.max(0.01, Math.hypot(w.pb.x - w.pa.x, w.pb.y - w.pa.y, w.pb.z - w.pa.z)); reb(); this.renderTab(); } }]));
    }
    if (j.type === 'spring') {
      p.push(this.range({ label: 'Жёсткость', unit: 'Гц', min: 0.1, max: 15, step: 0.05, hardMin: 0.01, hardMax: 100, hint: 'Собственная частота колебаний груза на пружине', get: () => j.hertz, set: v => { j.hertz = v; }, commit: reb }));
      p.push(this.range({ label: 'Демпфирование', min: 0, max: 2, step: 0.01, hardMin: 0, hint: '0 — без затухания, 1 — критическое', get: () => j.damping, set: v => { j.damping = v; }, commit: reb }));
    }
    if (j.type === 'hinge') {
      p.push(this.toggle({ label: 'Мотор', get: () => j.motor, set: v => { j.motor = v; P._motor(j, true); }, after: () => this.renderTab() }));
      if (j.motor) {
        p.push(this.range({ label: 'Скорость', unit: 'об/мин', min: -300, max: 300, step: 1, digits: 0, get: () => j.speed * 60 / TAU, set: v => { j.speed = v * TAU / 60; P._motor(j, true); } }));
        p.push(this.range({ label: 'Сила мотора', min: 1, max: 10000, step: 1, digits: 0, toSlider: v => Math.log10(v), fromSlider: v => Math.round(10 ** v), get: () => j.power, set: v => { j.power = v; P._motor(j, true); } }));
        p.push(this.select({ label: 'Стрелки ↑↓←→', options: [['', 'Не управлять'], ['B', 'Газ'], ['L', 'Левая сторона'], ['R', 'Правая сторона']], get: () => j.drive, set: v => { j.drive = v; P._motor(j, true); } }));
        p.push(this.toggle({ label: 'Обратное направление', get: () => j.reverse, set: v => { j.reverse = v; P._motor(j, true); } }));
      }
      p.push(this.toggle({ label: 'Ограничить угол', get: () => j.limit, set: v => { j.limit = v; reb(); }, after: () => this.renderTab() }));
      if (j.limit) {
        p.push(this.range({ label: 'Нижний предел', unit: '°', min: -180, max: 0, step: 1, digits: 0, get: () => j.lower * DEG, set: v => { j.lower = v / DEG; }, commit: reb }));
        p.push(this.range({ label: 'Верхний предел', unit: '°', min: 0, max: 180, step: 1, digits: 0, get: () => j.upper * DEG, set: v => { j.upper = v / DEG; }, commit: reb }));
      }
    }
    p.push(this.toggle({ label: 'Соединённые тела сталкиваются', get: () => j.contacts, set: v => { j.contacts = v; j.raw?.setContactsEnabled(v); } }));
    p.push(this.toggle({ label: 'Скрыть на сцене', get: () => j.hidden, set: v => { j.hidden = v; } }));
    return [
      this.section(null, head, this.buttons([{ label: 'Удалить', icon: 'trash', kind: 'danger', onClick: () => { app.checkpoint(); app.removeObject(j); } }])),
      this.section('Параметры', ...p),
    ];
  }

  defaultsPanel() {
    const app = this.app, d = app.defaults, save = () => app.saveDefaults();
    const R = (label, key, min, max, step, unit, digits) => this.range({ label, unit, min, max, step, digits, noUndo: true, get: () => d[key], set: v => { d[key] = v; save(); } });
    const det = el('details', { class: 'sec details', open: Store.get('defaultsOpen', true) || null },
      el('summary', null, 'Новые объекты'),
      el('div', { class: 'details-body' },
        this.select({ label: 'Материал', noUndo: true, options: [...Object.entries(MATERIALS).map(([k, m]) => [k, m.title]), ['custom', 'Свой']], get: () => d.material,
          set: v => { d.material = v; const m = MATERIALS[v]; if (m) { d.density = m.density; d.friction = m.friction; d.restitution = m.restitution; } save(); this.renderTab(); } }),
        d.material === 'custom' ? [R('Плотность', 'density', 0.05, 12, 0.01, 'кг/м³'), R('Трение', 'friction', 0, 1.5, 0.01), R('Упругость', 'restitution', 0, 1, 0.01)] : null,
        this.select({ label: 'Цвет', noUndo: true, options: [['random', 'Случайный'], ['material', 'Как у материала'], ['fixed', 'Выбранный']], get: () => d.colorMode, set: v => { d.colorMode = v; save(); this.renderTab(); } }),
        d.colorMode === 'fixed' ? this.color({ label: 'Цвет новых тел', get: () => d.color, set: c => { d.color = c; save(); } }) : null,
        R('Размер', 'size', 0.1, 4, 0.05, 'м'),
        R('Высота появления', 'dropHeight', 0, 10, 0.1, 'м'),
        R('Высота стены', 'wallHeight', 0.2, 10, 0.1, 'м'),
        R('Толщина стены', 'wallThickness', 0.05, 2, 0.01, 'м'),
      ));
    det.addEventListener('toggle', () => Store.set('defaultsOpen', det.open));
    const det2 = el('details', { class: 'sec details', open: Store.get('toolsOpen', false) || null },
      el('summary', null, 'Инструменты'),
      el('div', { class: 'details-body' },
        R('Пушка: скорость', 'cannonSpeed', 5, 80, 1, 'м/с', 0),
        R('Пушка: диаметр ядра', 'cannonSize', 0.1, 2, 0.05, 'м'),
        R('Пружина: жёсткость', 'springHertz', 0.2, 10, 0.1, 'Гц'),
        R('Пружина: демпфирование', 'springDamping', 0, 2, 0.01),
        R('Взрыв: радиус', 'blastRadius', 0.5, 15, 0.1, 'м'),
        R('Взрыв: мощность', 'blastPower', 1, 200, 1, '', 0),
        R('Магнит: радиус', 'magnetRadius', 1, 25, 0.5, 'м'),
        R('Магнит: сила', 'magnetPower', 5, 200, 1, '', 0),
      ));
    det2.addEventListener('toggle', () => Store.set('toolsOpen', det2.open));
    return [det, det2];
  }

  /* ------------------------------ «Мир» ------------------------------ */

  tabWorld() {
    const app = this.app, P = app.physics;
    const gMag = () => Math.hypot(P.gravity.x, P.gravity.y, P.gravity.z);
    const setG = m => P.setGravity({ x: 0, y: -m, z: 0 });
    const preset = () => { const m = gMag(), p = GRAVITY_PRESETS.find(p => Math.abs(p.g - m) < 0.005); return p ? p.id : 'custom'; };
    return [
      this.section('Гравитация',
        this.select({ label: 'Планета', options: [...GRAVITY_PRESETS.map(p => [p.id, `${p.label} · ${p.g} м/с²`]), ['custom', 'Своя']], get: preset, set: v => { const p = GRAVITY_PRESETS.find(p => p.id === v); if (p) setG(p.g); }, after: () => this.renderTab() }),
        this.range({ label: 'Ускорение g', unit: 'м/с²', min: 0, max: 30, step: 0.01, hardMin: 0, hardMax: 1000, get: gMag, set: setG }),
        this.toggle({ label: 'Взаимное притяжение тел', hint: 'Каждое тело притягивает каждое, как планеты', get: () => P.mutualGravity, set: v => { P.mutualGravity = v; P.wakeAll(); }, after: () => this.renderTab() }),
        P.mutualGravity ? this.range({ label: 'Постоянная G', min: 0.01, max: 20, step: 0.01, hardMin: 0, get: () => P.G, set: v => { P.G = v; } }) : null),
      this.section('Среда и время',
        this.range({ label: 'Сопротивление воздуха', unit: '1/с', min: 0, max: 3, step: 0.01, hardMin: 0, hardMax: 100, get: () => P.airDrag, set: v => P.setAirDrag(v) }),
        this.range({ label: 'Скорость времени', unit: '×', min: -2.3, max: 1.1, step: 0.01, key: 'speed', noUndo: true,
          toSlider: v => Math.log(v), fromSlider: v => Math.round(Math.exp(v) * 100) / 100, hardMin: 0.01, hardMax: 5, get: () => app.timeScale, set: v => app.setTimeScale(v) }),
        this.range({ label: 'Точность решателя', min: 1, max: 16, step: 1, digits: 0, hint: 'Итераций на шаг: больше — устойчивее высокие башни и цепи, но тяжелее', get: () => P.iterations, set: v => P.setIterations(Math.round(v)) }),
        this.toggle({ label: 'Сон неподвижных тел', hint: 'Успокоившиеся тела перестают считаться — большая экономия', get: () => P.allowSleep, set: v => { P.allowSleep = v; } })),
      this.section('Действия', this.buttons([
        { label: 'Остановить все', icon: 'stop', onClick: () => { app.checkpoint(); for (const o of P.objs) P.setVelocity(o, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }); } },
        { label: 'Разбудить все', icon: 'sun', onClick: () => P.wakeAll() },
        { label: 'Стереть следы', icon: 'eraser', onClick: () => { for (const o of P.objs) o.clearTrail(); } },
        { label: 'Убрать подвижные', icon: 'trash', onClick: () => app.clearScene(true) },
        { label: 'Очистить всё', icon: 'trash', kind: 'danger', onClick: e => this.confirmClick(e.currentTarget, () => app.clearScene(false)) },
      ])),
      this.section('Статистика', this.readouts([
        ['Тел', () => String(P.objs.length)],
        ['Спят', () => String(P.objs.reduce((n, o) => n + (o.sleeping ? 1 : 0), 0))],
        ['Соединений', () => String(P.joints.length)],
        ['Время, с', () => fmtNum(P.time, 1)],
        ['Шаг физики, мс', () => fmtNum(P.stepMs, 2)],
        ['Кадр, мс', () => fmtNum(app.frameMs, 2)],
      ])),
    ];
  }

  /* ------------------------------ «Сценарии» ------------------------------ */

  tabScenes() {
    const app = this.app;
    const name = el('input', { class: 'txt', type: 'text', value: app.sceneName, maxlength: 60, placeholder: 'Название сцены', 'aria-label': 'Название сцены' });
    name.addEventListener('input', () => { app.sceneName = name.value || 'Без названия'; this.$('sceneName').textContent = app.sceneName; });
    const desc = el('textarea', { class: 'txt', rows: 2, maxlength: 400, placeholder: 'Описание (необязательно)', 'aria-label': 'Описание сцены' });
    desc.value = app.sceneDesc || '';
    desc.addEventListener('input', () => { app.sceneDesc = desc.value; });
    const saves = app.listSaves(), list = el('div', { class: 'saves' });
    if (!saves.length) list.append(el('p', { class: 'muted' }, 'Пока нет сохранений. Соберите сцену и нажмите «Сохранить».'));
    for (const s of saves) {
      const d = new Date(s.date);
      list.append(el('div', { class: 'save' },
        el('button', { class: 'save-main', onclick: () => app.loadSave(s.id), title: 'Загрузить' },
          el('b', null, s.name), el('small', null, `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)} · ${s.data.objs.length} тел`)),
        el('button', { class: 'icon-btn', title: 'Перезаписать текущей сценой', 'aria-label': 'Перезаписать', html: icon('save'), onclick: () => app.saveLocal(s.name, s.id) }),
        el('button', { class: 'icon-btn danger', title: 'Удалить', 'aria-label': 'Удалить', html: icon('trash'), onclick: e => this.confirmClick(e.currentTarget, () => app.deleteSave(s.id)) })));
    }
    return [
      this.section('Текущая сцена', name, desc, this.buttons([
        { label: 'Сохранить', icon: 'save', kind: 'primary', title: 'Ctrl+S', onClick: () => app.saveLocal(app.sceneName) },
        { label: 'Начальное состояние', icon: 'pin', title: 'Запомнить текущее состояние для кнопки «Сброс»', onClick: () => app.markStart() },
      ])),
      this.section('Мои сохранения', list),
      this.section('Файл и ссылка', this.buttons([
        { label: 'Экспорт .json', icon: 'download', onClick: () => app.exportFile() },
        { label: 'Импорт .json', icon: 'upload', onClick: () => this.$('fileInput').click() },
        { label: 'Ссылка на сцену', icon: 'link', onClick: () => app.shareLink() },
      ])),
      this.section('Добавить в сцену', el('p', { class: 'muted' }, 'Шаблон появится в центре вида.'),
        el('div', { class: 'chips' }, Object.entries(PREFABS).map(([id, p]) => el('button', { class: 'chip', onclick: () => app.insertPrefab(id), html: icon('plus') + p.name })))),
      this.section('Встроенные сценарии', el('div', { class: 'cards' }, SCENARIOS.map(s => el('button', {
        class: 'card' + (app.sceneId === s.id ? ' current' : ''), title: s.desc, onclick: () => app.loadBuiltin(s.id),
      }, el('span', { class: 'card-ico' }, s.icon), el('b', null, s.name), el('small', null, s.desc))))),
      this.section(null, el('a', { class: 'link-2d', href: './2d/' }, 'Открыть 2D-версию Физлаба →')),
    ];
  }

  /* ------------------------------ «Вид» ------------------------------ */

  tabView() {
    const app = this.app, v = app.view;
    const t = (key, label, hint) => this.toggle({ label, hint, noUndo: true, get: () => v[key], set: val => app.setView(key, val) });
    return [
      this.section('Слои', t('shadows', 'Тени'), t('fog', 'Туман вдали'), t('velocity', 'Векторы скорости'), t('trails', 'Следы движения'),
        t('dimSleeping', 'Приглушать спящие тела'), t('snap', 'Привязка к сетке', 'Новые тела ставятся по узлам сетки 0,5 м')),
      this.section('Панели', t('stats', 'Счётчик FPS и тел'), t('graph', 'График энергии')),
      this.section('Оформление',
        this.select({ label: 'Тема', noUndo: true, options: [['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', 'Как в системе']], get: () => app.themePref, set: val => app.setTheme(val) }),
        this.select({ label: 'Качество', noUndo: true, options: [['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Экономное']], get: () => v.quality, set: val => app.setView('quality', val) }),
        t('smooth', 'Плавность (интерполяция кадров)', 'Сглаживает движение на мониторах 120+ Гц и в замедленном времени'),
        this.range({ label: 'Угол обзора', unit: '°', min: 25, max: 90, step: 1, digits: 0, noUndo: true, get: () => app.cam.fov, set: val => { app.cam.fov = val; v.fov = val; app.saveView(); } })),
      this.section('Камера', this.buttons([
        { label: 'Показать всё', icon: 'fit', title: 'F', onClick: () => app.fitView() },
        { label: 'Сбросить вид', icon: 'target', onClick: () => { app.follow = null; app.cam.set({ target: { x: 0, y: 1.5, z: 0 }, dist: 22, yaw: 0.7, pitch: 0.42 }, false); } },
      ])),
    ];
  }

  /* ------------------------------ обновления ------------------------------ */

  tick() {
    const app = this.app, P = app.physics;
    if (app.view.stats) {
      let sleep = 0;
      for (const o of P.objs) if (o.sleeping) sleep++;
      this.$('stats').innerHTML = `<b>${Math.round(app.fps)}</b> FPS · ${P.objs.length} тел` + (sleep ? ` <span>(${sleep} спят)</span>` : '') + ` · физика ${fmtNum(P.stepMs, 1)} мс`;
    }
    this.liveRefresh();
    if (app.view.graph) this.drawGraph();
  }

  pushGraphSample() {
    const e = this.app.physics.energy(), d = this.graphData;
    d.push([e.ke, e.pe]);
    if (d.length > 300) d.shift();
  }

  drawGraph() {
    const cv = this.$('graph'), ctx = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--ink-soft').trim() || '#999';
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = 260, H = 116;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = '600 11px Manrope, system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = ink; ctx.fillText('Энергия, Дж', 10, 8);
    const d = this.graphData;
    if (d.length < 2) return;
    let pe0 = Infinity; for (const s of d) pe0 = Math.min(pe0, s[1]);
    let max = 1e-6; for (const s of d) max = Math.max(max, s[0], s[1] - pe0, s[0] + s[1] - pe0);
    const top = 26, h = H - top - 10, x0 = 10, w = W - 20;
    [[s => s[0], '#3ddc97', 'Eк'], [s => s[1] - pe0, '#4dabf7', 'Eп'], [s => s[0] + s[1] - pe0, '#f5a524', 'E']].forEach(([f, c, nm], k) => {
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath();
      d.forEach((s, i) => { const X = x0 + i / 299 * w, Y = top + h - f(s) / max * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke(); ctx.fillStyle = c; ctx.fillText(`${nm} ${fmtNum(f(d[d.length - 1]), 1)}`, 100 + k * 54, 8);
    });
  }

  toast(msg, kind = '') {
    const box = this.$('toasts'), t = el('div', { class: 'toast ' + kind }, msg);
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
      m.append(el('button', { class: 'mi' + (it.danger ? ' danger' : ''), onclick: () => { this.hideMenu(); it.action(); },
        html: (it.icon ? icon(it.icon) : '<span class="ico"></span>') + `<span>${it.label}</span>` + (it.kbd ? `<kbd>${it.kbd}</kbd>` : '') }));
    }
    m.classList.add('open');
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  }
  hideMenu() { this.$('ctxmenu').classList.remove('open'); }

  openHelp() {
    const keys = [
      ['Пробел', 'Пуск / пауза'], ['N', 'Один шаг'], ['Home', 'Сброс к началу'], ['Ctrl+Z / Ctrl+Y', 'Отменить / повторить'],
      ['Delete', 'Удалить выбранное'], ['Ctrl+D', 'Копия выбранного'], ['Q / E', 'Повернуть выбранное (Shift — точнее)'],
      ['F', 'Показать всю сцену'], ['↑ ↓ ← →', 'Моторы с управлением (машинка)'], ['Tab', 'Панель свойств'], ['Esc', 'Снять выделение'],
      ['ЛКМ по пустому / ПКМ', 'Вращать камеру'], ['Shift + ЛКМ / СКМ', 'Сдвигать камеру'], ['Колесо', 'Масштаб (при захвате — ближе/дальше)'],
    ];
    const tools = TOOL_DEFS.filter(d => !d.sep).map(d => [d.key, d.name]);
    const tbl = rows => el('div', { class: 'keys' }, rows.map(([k, v]) => el('div', null, el('kbd', null, k), el('span', null, v))));
    const b = this.$('modalBody');
    b.innerHTML = '';
    b.append(
      el('h2', null, 'Физлаб 3D — как пользоваться'),
      el('p', { class: 'muted' }, 'Трёхмерная песочница физики: ящики, шары, цилиндры, капсулы и конусы с трением и упругостью, пружины, верёвки, шарниры, оси с моторами и сварка. Расчёт — движок Rapier (WebAssembly), графика — Three.js.'),
      el('div', { class: 'help-cols' }, el('div', null, el('h4', null, 'Инструменты'), tbl(tools)), el('div', null, el('h4', null, 'Управление'), tbl(keys))),
      el('h4', null, 'Советы'),
      el('ul', null,
        el('li', null, 'На паузе тела можно двигать по горизонтали мышью, с Shift — по вертикали. Во время симуляции тело тянется «за пружинку».'),
        el('li', null, 'Новые формы ставятся на ту поверхность, по которой кликнули, — так удобно строить башни.'),
        el('li', null, 'Ось ставится перпендикулярно грани, по которой кликнули: клик по торцу цилиндра даёт колесо.'),
        el('li', null, 'Кнопка «Сброс» возвращает сцену к моменту последнего запуска или загрузки.'),
        el('li', null, 'Если падает FPS, понизьте «Качество» на вкладке «Вид» или выключите тени.')),
    );
    this.$('modal').classList.add('open');
  }

  showText(title, note, text) {
    const ta = el('textarea', { class: 'txt', readonly: true, rows: 4, 'aria-label': title });
    ta.value = text;
    const b = this.$('modalBody');
    b.innerHTML = '';
    b.append(el('div', { class: 'share-box' }, el('h2', null, title), el('p', { class: 'muted' }, note), ta));
    this.$('modal').classList.add('open');
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  }
  closeModal() { this.$('modal').classList.remove('open'); }
}

export { SHAPE_NAMES };
