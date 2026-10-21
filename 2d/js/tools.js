'use strict';
/* ==========================================================================
   Физлаб · инструменты
   У инструмента есть down / move / up / cancel (координаты — в метрах мира)
   и необязательный preview(renderer, ctx) для подсказки на холсте.
   ========================================================================== */

const TOOL_DEFS = [
  { id: 'select', name: 'Выбор и перетаскивание', key: 'V', icon: 'select',
    hint: 'Тяните тела мышью · пустое место — двигать вид · колесо — масштаб · ПКМ — меню' },
  { id: 'sling', name: 'Пуск', key: 'G', icon: 'sling',
    hint: 'Оттяните от тела и отпустите, чтобы задать ему скорость. Из пустого места — выстрел шаром' },
  { sep: true },
  { id: 'circle', name: 'Круг', key: 'C', icon: 'circle', hint: 'Клик — круг по умолчанию, протяжка — задать радиус' },
  { id: 'box', name: 'Прямоугольник', key: 'B', icon: 'box', hint: 'Протяните от угла к углу · Shift — квадрат' },
  { id: 'polygon', name: 'Многоугольник', key: 'P', icon: 'polygon', hint: 'Протяжка задаёт радиус и поворот · число сторон — в панели «Объект»' },
  { id: 'wall', name: 'Статичная планка', key: 'W', icon: 'wall', hint: 'Протяните линию — получится неподвижная опора · Shift — шаг 15°' },
  { sep: true },
  { id: 'spring', name: 'Пружина', key: 'S', icon: 'spring', hint: 'Протяните от тела к телу или к точке мира' },
  { id: 'rod', name: 'Стержень', key: 'R', icon: 'rod', hint: 'Жёсткая связь постоянной длины между телами или телом и точкой' },
  { id: 'rope', name: 'Верёвка', key: 'L', icon: 'rope', hint: 'Не даёт отойти дальше длины, но может провисать' },
  { id: 'hinge', name: 'Шарнир', key: 'H', icon: 'hinge', hint: 'Клик по двум перекрытым телам — ось между ними; по одному телу — ось к миру' },
  { sep: true },
  { id: 'explode', name: 'Взрыв', key: 'X', icon: 'explode', hint: 'Клик — взрывная волна. Радиус и мощность — в панели «Объект»' },
  { id: 'magnet', name: 'Магнит', key: 'M', icon: 'magnet', hint: 'Удерживайте — притягивает тела · с Shift — отталкивает' },
  { id: 'eraser', name: 'Ластик', key: 'D', icon: 'eraser', hint: 'Клик или протяжка удаляет тела и соединения' },
];

class ToolManager {
  constructor(app) {
    this.app = app;
    this.tools = {};
    for (const d of TOOL_DEFS) if (!d.sep) this.tools[d.id] = makeTool(d.id, app);
    this.currentId = 'select';
    this.current = this.tools.select;
    this.active = false;
  }
  set(id) {
    if (!this.tools[id]) return;
    if (this.active) this.cancel();
    this.currentId = id;
    this.current = this.tools[id];
    this.app.onToolChanged(id);
  }
  down(p, e) { this.active = true; this.current.down(p, e); }
  move(p, e) { if (this.current.move) this.current.move(p, e, this.active); }
  up(p, e) { if (!this.active) return; this.active = false; if (this.current.up) this.current.up(p, e); }
  cancel() { this.active = false; if (this.current.cancel) this.current.cancel(); }
}

function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function _fmt(v, d = 2) { return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d); }

function makeTool(id, app) {
  const W = () => app.world;
  const px = n => n / app.cam.zoom; // экранные пиксели → метры

  /** Точка привязки соединения: тело под курсором (центр — если близко) или точка мира. */
  const pickAnchor = (p) => {
    const b = W().bodyAt(p.x, p.y);
    if (b) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < Math.max(px(10), b.shape.bound * 0.18)) return { body: b, x: b.x, y: b.y };
      return { body: b, x: p.x, y: p.y };
    }
    const q = app.snap(p);
    return { body: null, x: q.x, y: q.y };
  };

  switch (id) {
    case 'select': return {
      cursor: 'default',
      down(p, e) {
        const j = app.jointAt(p.x, p.y);
        if (j) { app.select(j); this.mode = null; return; }
        const b = W().bodyAt(p.x, p.y);
        if (!b) { app.select(null); this.mode = null; app.startPan(e); return; }
        app.select(b);
        app.checkpoint('drag');
        this.body = b;
        if (app.running && !b.isStatic) {
          const l = b.toLocal(p.x, p.y);
          this.mj = W().addJoint(new MouseJoint(W().ground, b, { lbx: l.x, lby: l.y, tx: p.x, ty: p.y }));
          this.mode = 'joint';
        } else {
          this.mode = 'move';
          this.off = { x: b.x - p.x, y: b.y - p.y };
        }
        app.setCursor('grabbing');
      },
      move(p, e, active) {
        if (!active || !this.mode) return;
        const b = this.body;
        if (this.mode === 'joint') { this.mj.tx = p.x; this.mj.ty = p.y; W().wake(b); return; }
        const q = app.snap({ x: p.x + this.off.x, y: p.y + this.off.y });
        const w = W();
        w.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1);
        b.x = q.x; b.y = q.y; b.px = b.x; b.py = b.y;
        if (app.running && !b.isStatic) { b.vx = 0; b.vy = 0; b.w = 0; }
        b.updateWorld();
        w.wake(b);
        w.wakeArea(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1);
        app.ui.liveRefresh();
      },
      up() { this.cancel(); },
      cancel() {
        if (this.mj) { W().removeJoint(this.mj); this.mj = null; }
        this.mode = null; this.body = null;
        app.setCursor(null);
      },
    };

    case 'sling': return {
      cursor: 'crosshair',
      down(p) {
        const b = W().bodyAt(p.x, p.y);
        this.body = b && !b.isStatic ? b : null;
        this.start = this.body ? { x: this.body.x, y: this.body.y } : app.snap(p);
        this.cur = { x: p.x, y: p.y };
      },
      move(p, e, active) { if (active) this.cur = { x: p.x, y: p.y }; },
      _vel() {
        const o = this.body ? { x: this.body.x, y: this.body.y } : this.start;
        const k = app.defaults.slingPower;
        let vx = (o.x - this.cur.x) * k, vy = (o.y - this.cur.y) * k;
        const v = Math.hypot(vx, vy), max = 80;
        if (v > max) { vx *= max / v; vy *= max / v; }
        return { o, vx, vy };
      },
      up() {
        if (!this.start) return;
        const { vx, vy } = this._vel();
        const pulled = Math.hypot(vx, vy) > 0.3;
        if (pulled) {
          app.checkpoint();
          let b = this.body;
          if (!b) b = app.createBody(Shapes.circle(app.defaults.size * 0.3), this.start.x, this.start.y, { isStatic: false });
          b.vx = vx; b.vy = vy; W().wake(b);
          if (!app.running) app.toast('Скорость задана — нажмите ▶, чтобы запустить');
        }
        this.start = null; this.body = null;
      },
      cancel() { this.start = null; this.body = null; },
      preview(r) {
        if (!this.start) return;
        const { o, vx, vy } = this._vel();
        r.ghostLine(o.x, o.y, this.cur.x, this.cur.y, true);
        if (!this.body) r.ghostCircle(o.x, o.y, app.defaults.size * 0.3);
        const w = W(), ctx = r.ctx;
        ctx.fillStyle = app.theme.accent;
        const T = 4, n = 48;
        for (let i = 1; i <= n; i++) {
          const t = T * i / n;
          const x = o.x + vx * t + 0.5 * w.gravityX * t * t, y = o.y + vy * t + 0.5 * w.gravityY * t * t;
          ctx.globalAlpha = 1 - i / n * 0.85;
          ctx.beginPath(); ctx.arc(r.sx(x), r.sy(y), 2.4, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        r.tag(`${_fmt(Math.hypot(vx, vy), 1)} м/с`, this.cur.x, this.cur.y);
      },
    };

    case 'circle': return {
      cursor: 'crosshair',
      down(p) { this.start = app.snap(p); this.r = 0; },
      move(p, e, active) { if (active && this.start) this.r = _dist(this.start, app.snap(p)); },
      up() {
        if (!this.start) return;
        const r = this.r > px(4) ? this.r : app.defaults.size / 2;
        app.checkpoint();
        app.select(app.createBody(Shapes.circle(r), this.start.x, this.start.y));
        this.start = null;
      },
      cancel() { this.start = null; },
      preview(r) {
        if (this.start) {
          const rr = this.r > px(4) ? this.r : app.defaults.size / 2;
          r.ghostCircle(this.start.x, this.start.y, rr);
          r.tag(`r = ${_fmt(rr)} м`, this.start.x + rr, this.start.y);
        } else if (app.pointer.inside) {
          const q = app.snap(app.pointer);
          r.ctx.globalAlpha = 0.5; r.ghostCircle(q.x, q.y, app.defaults.size / 2); r.ctx.globalAlpha = 1;
        }
      },
    };

    case 'box': return {
      cursor: 'crosshair',
      down(p) { this.start = app.snap(p); this.cur = this.start; },
      move(p, e, active) {
        if (!active || !this.start) return;
        const q = app.snap(p);
        if (e.shiftKey) {
          const s = Math.max(Math.abs(q.x - this.start.x), Math.abs(q.y - this.start.y));
          this.cur = { x: this.start.x + Math.sign(q.x - this.start.x || 1) * s, y: this.start.y + Math.sign(q.y - this.start.y || 1) * s };
        } else this.cur = q;
      },
      _rect() {
        const w = Math.abs(this.cur.x - this.start.x), h = Math.abs(this.cur.y - this.start.y);
        if (w < px(5) && h < px(5)) { const s = app.defaults.size; return { x: this.start.x, y: this.start.y, w: s, h: s }; }
        return { x: (this.cur.x + this.start.x) / 2, y: (this.cur.y + this.start.y) / 2, w: Math.max(0.05, w), h: Math.max(0.05, h) };
      },
      up() {
        if (!this.start) return;
        const q = this._rect();
        app.checkpoint();
        app.select(app.createBody(Shapes.box(q.w, q.h), q.x, q.y));
        this.start = null;
      },
      cancel() { this.start = null; },
      preview(r) {
        let q;
        if (this.start) q = this._rect();
        else if (app.pointer.inside) { const c = app.snap(app.pointer), s = app.defaults.size; q = { x: c.x, y: c.y, w: s, h: s }; r.ctx.globalAlpha = 0.5; }
        else return;
        r.ghostPoly([[q.x - q.w / 2, q.y - q.h / 2], [q.x + q.w / 2, q.y - q.h / 2], [q.x + q.w / 2, q.y + q.h / 2], [q.x - q.w / 2, q.y + q.h / 2]]);
        r.ctx.globalAlpha = 1;
        if (this.start) r.tag(`${_fmt(q.w)} × ${_fmt(q.h)} м`, q.x + q.w / 2, q.y + q.h / 2);
      },
    };

    case 'polygon': return {
      cursor: 'crosshair',
      down(p) { this.start = app.snap(p); this.cur = this.start; },
      move(p, e, active) { if (active && this.start) this.cur = p; },
      _geom() {
        const d = _dist(this.start, this.cur);
        if (d < px(5)) return { r: app.defaults.size / 2, a: 0 };
        return { r: d, a: Math.atan2(this.cur.y - this.start.y, this.cur.x - this.start.x) - Math.PI / 2 };
      },
      up() {
        if (!this.start) return;
        const g = this._geom();
        app.checkpoint();
        app.select(app.createBody(Shapes.regular(app.defaults.sides, g.r), this.start.x, this.start.y, { angle: g.a }));
        this.start = null;
      },
      cancel() { this.start = null; },
      preview(r) {
        let c, g;
        if (this.start) { c = this.start; g = this._geom(); }
        else if (app.pointer.inside) { c = app.snap(app.pointer); g = { r: app.defaults.size / 2, a: 0 }; r.ctx.globalAlpha = 0.5; }
        else return;
        const n = app.defaults.sides, pts = [];
        for (let i = 0; i < n; i++) { const a = Math.PI / 2 + g.a + i * TAU / n; pts.push([c.x + Math.cos(a) * g.r, c.y + Math.sin(a) * g.r]); }
        r.ghostPoly(pts);
        r.ctx.globalAlpha = 1;
        if (this.start) r.tag(`${n} стор. · r = ${_fmt(g.r)} м`, this.cur.x, this.cur.y);
      },
    };

    case 'wall': return {
      cursor: 'crosshair',
      down(p) { this.start = app.snap(p); this.cur = this.start; },
      move(p, e, active) {
        if (!active || !this.start) return;
        let q = app.snap(p);
        if (e.shiftKey) {
          const a = Math.round(Math.atan2(q.y - this.start.y, q.x - this.start.x) / (Math.PI / 12)) * (Math.PI / 12), d = _dist(q, this.start);
          q = { x: this.start.x + Math.cos(a) * d, y: this.start.y + Math.sin(a) * d };
        }
        this.cur = q;
      },
      up() {
        if (!this.start) return;
        const len = _dist(this.start, this.cur);
        if (len < 0.05) { app.toast('Протяните линию, чтобы создать планку'); this.start = null; return; }
        app.checkpoint();
        const t = app.defaults.wallThickness;
        app.select(app.createBody(Shapes.box(len, t), (this.start.x + this.cur.x) / 2, (this.start.y + this.cur.y) / 2, {
          isStatic: true, color: null, angle: Math.atan2(this.cur.y - this.start.y, this.cur.x - this.start.x),
        }));
        this.start = null;
      },
      cancel() { this.start = null; },
      preview(r) {
        if (!this.start) { if (app.pointer.inside) { const q = app.snap(app.pointer); r.marker(q.x, q.y, 3); } return; }
        const len = _dist(this.start, this.cur), t = app.defaults.wallThickness;
        const a = Math.atan2(this.cur.y - this.start.y, this.cur.x - this.start.x), c = Math.cos(a), s = Math.sin(a);
        const nx = -s * t / 2, ny = c * t / 2;
        r.ghostPoly([[this.start.x - nx, this.start.y - ny], [this.cur.x - nx, this.cur.y - ny], [this.cur.x + nx, this.cur.y + ny], [this.start.x + nx, this.start.y + ny]]);
        r.tag(`${_fmt(len)} м · ${Math.round(a * 180 / Math.PI)}°`, this.cur.x, this.cur.y);
      },
    };

    case 'spring': case 'rod': case 'rope': return {
      cursor: 'crosshair',
      down(p) { this.a = pickAnchor(p); this.cur = this.a; },
      move(p, e, active) { if (active && this.a) this.cur = pickAnchor(p); },
      up(p) {
        if (!this.a) return;
        let A = this.a, B = pickAnchor(p);
        this.a = null;
        if (_dist(A, B) < px(6) && A.body === B.body) return;
        if (!A.body && !B.body) { app.toast('Соединение должно касаться хотя бы одного тела'); return; }
        if (A.body === B.body) { app.toast('Выберите два разных тела или тело и точку мира'); return; }
        if (!B.body) [A, B] = [B, A];
        if (B.body.isStatic && (!A.body || A.body.isStatic)) { app.toast('Нужно хотя бы одно подвижное тело'); return; }
        app.checkpoint();
        const d = app.defaults;
        const j = W().createDistance(id, A.body, B.body, A.x, A.y, B.x, B.y,
          id === 'spring' ? { hertz: d.springHertz, damping: d.springDamping } : {});
        app.select(j);
      },
      cancel() { this.a = null; },
      preview(r) {
        const hov = this.a ? this.cur : (app.pointer.inside ? pickAnchor(app.pointer) : null);
        if (hov && hov.body) { r.ctx.globalAlpha = 0.7; r.ctx.strokeStyle = app.theme.accent; r.ctx.lineWidth = 2; r.ctx.beginPath(); r.pathBody(hov.body); r.ctx.stroke(); r.ctx.globalAlpha = 1; }
        if (!this.a) { if (hov) r.marker(hov.x, hov.y, 3.5); return; }
        r.marker(this.a.x, this.a.y, 4);
        r.ghostLine(this.a.x, this.a.y, this.cur.x, this.cur.y, id !== 'rod');
        r.marker(this.cur.x, this.cur.y, 4);
        r.tag(`${_fmt(_dist(this.a, this.cur))} м`, this.cur.x, this.cur.y);
      },
    };

    case 'hinge': return {
      cursor: 'crosshair',
      down(p) {
        const list = W().bodiesAt(p.x, p.y);
        if (!list.length) { app.toast('Кликните по телу (или по месту, где перекрываются два тела)'); return; }
        const top = list[0];
        let x = p.x, y = p.y;
        if (Math.hypot(p.x - top.x, p.y - top.y) < Math.max(px(10), top.shape.bound * 0.15)) { x = top.x; y = top.y; }
        let A = null, B = top;
        if (list.length >= 2) A = list[1];
        else if (top.isStatic) { app.toast('Статичному телу ось к миру не нужна'); return; }
        if (B.isStatic && A && !A.isStatic) [A, B] = [B, A];
        if (B.isStatic && (!A || A.isStatic)) { app.toast('Нужно хотя бы одно подвижное тело'); return; }
        app.checkpoint();
        app.select(W().createHinge(A, B, x, y, {}));
      },
      preview(r) {
        if (!app.pointer.inside) return;
        const list = W().bodiesAt(app.pointer.x, app.pointer.y);
        const ctx = r.ctx;
        ctx.strokeStyle = app.theme.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
        for (const b of list.slice(0, 2)) { ctx.beginPath(); r.pathBody(b); ctx.stroke(); }
        ctx.globalAlpha = 1;
        r.marker(app.pointer.x, app.pointer.y, 3.5);
        if (list.length) r.tag(list.length >= 2 ? 'Ось между телами' : 'Ось к миру', app.pointer.x, app.pointer.y);
      },
    };

    case 'explode': return {
      cursor: 'crosshair',
      down(p) {
        const d = app.defaults;
        app.checkpoint('explode');
        W().explode(p.x, p.y, d.blastRadius, d.blastPower);
        app.renderer.addEffect({ x: p.x, y: p.y, r: d.blastRadius, dur: 0.45 });
      },
      preview(r) {
        if (!app.pointer.inside) return;
        const ctx = r.ctx;
        ctx.strokeStyle = '#ffa94d'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(r.sx(app.pointer.x), r.sy(app.pointer.y), app.defaults.blastRadius * app.cam.zoom, 0, TAU); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      },
    };

    case 'magnet': return {
      cursor: 'crosshair',
      down(p, e) { this.on = true; this.repel = !!e.shiftKey; app.magnet = { x: p.x, y: p.y, repel: this.repel }; },
      move(p, e, active) { if (active && this.on) app.magnet = { x: p.x, y: p.y, repel: !!e.shiftKey }; },
      up() { this.on = false; app.magnet = null; },
      cancel() { this.on = false; app.magnet = null; },
      preview(r) {
        if (!app.pointer.inside) return;
        const ctx = r.ctx, R = app.defaults.magnetRadius * app.cam.zoom, X = r.sx(app.pointer.x), Y = r.sy(app.pointer.y);
        const t = performance.now() / 1000;
        ctx.strokeStyle = app.magnet && app.magnet.repel ? '#ff6b6b' : app.theme.accent;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = this.on ? 0.8 : 0.35;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        if (this.on) {
          for (let i = 0; i < 3; i++) {
            let k = ((t * 1.2 + i / 3) % 1);
            if (!app.magnet.repel) k = 1 - k;
            ctx.globalAlpha = 0.5 * (1 - Math.abs(k - 0.5) * 2) + 0.1;
            ctx.beginPath(); ctx.arc(X, Y, R * k, 0, TAU); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    };

    case 'eraser': return {
      cursor: 'cell',
      down(p) { app.checkpoint(); this.on = true; this._erase(p); },
      move(p, e, active) { if (active && this.on) this._erase(p); },
      up() { this.on = false; },
      cancel() { this.on = false; },
      _erase(p) {
        const j = app.jointAt(p.x, p.y);
        if (j) { app.removeObject(j); return; }
        const b = W().bodyAt(p.x, p.y);
        if (b) app.removeObject(b);
      },
      preview(r) {
        if (!app.pointer.inside) return;
        const ctx = r.ctx;
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(r.sx(app.pointer.x), r.sy(app.pointer.y), 7, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        const b = W().bodyAt(app.pointer.x, app.pointer.y);
        if (b) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.beginPath(); r.pathBody(b); ctx.stroke(); }
      },
    };
  }
  return {};
}
