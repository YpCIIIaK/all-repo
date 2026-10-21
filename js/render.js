'use strict';
/* ==========================================================================
   Физлаб · отрисовка на Canvas 2D
   Тела группируются по цвету: одна заливка и одна обводка на группу —
   так тысяча тел рисуется за доли миллисекунды.
   ========================================================================== */

const TAU = Math.PI * 2;

class Renderer {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 1; this.H = 1; this.dpr = 1;
    this.bucketsS = new Map();
    this.bucketsD = new Map();
    this.effects = [];
    this._bg = null; this._bgKey = '';
    this._a = { x: 0, y: 0 }; this._b = { x: 0, y: 0 };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const q = this.app.view.quality;
    const cap = q === 'low' ? 0.75 : q === 'medium' ? 1 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.W = Math.max(1, rect.width); this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this._bgKey = '';
  }

  sx(x) { const c = this.app.cam; return (x - c.x) * c.zoom + this.W * 0.5; }
  sy(y) { const c = this.app.cam; return this.H * 0.5 - (y - c.y) * c.zoom; }
  toWorld(sx, sy) {
    const c = this.app.cam;
    return { x: (sx - this.W * 0.5) / c.zoom + c.x, y: (this.H * 0.5 - sy) / c.zoom + c.y };
  }

  addEffect(e) { this.effects.push({ t: 0, dur: 0.5, ...e }); }

  /* ------------------------------ кадр ------------------------------ */

  draw(alpha, dt) {
    const app = this.app, ctx = this.ctx, th = app.theme, view = app.view, world = app.world;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // фон
    const key = th.bg0 + this.H;
    if (key !== this._bgKey) {
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg0);
      this._bg = g; this._bgKey = key;
    }
    ctx.fillStyle = this._bg;
    ctx.fillRect(0, 0, this.W, this.H);
    if (view.grid) this.drawGrid();

    // положения для отрисовки (с интерполяцией между шагами физики)
    const bodies = world.bodies;
    const g = world.ground; g.rx = 0; g.ry = 0; g.rc = 1; g.rs = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (alpha < 1 && (b.px !== b.x || b.py !== b.y || b.pa !== b.angle)) {
        b.rx = b.px + (b.x - b.px) * alpha; b.ry = b.py + (b.y - b.py) * alpha;
        const ra = b.pa + (b.angle - b.pa) * alpha;
        b.rc = Math.cos(ra); b.rs = Math.sin(ra);
      } else { b.rx = b.x; b.ry = b.y; b.rc = b.c; b.rs = b.s; }
    }

    if (view.trails) this.drawTrails(bodies);
    this.drawBodies(bodies, true);
    this.drawBodies(bodies, false);
    this.drawJoints();
    if (view.velocity) this.drawVelocities(bodies);
    if (view.contacts) this.drawContacts();
    if (view.centers) this.drawCenters(bodies);
    if (view.aabb) this.drawAABB(bodies);
    this.drawLabels(bodies);
    this.drawSelection();
    const tool = app.tools && app.tools.current;
    if (tool && tool.preview) { ctx.save(); tool.preview(this, ctx); ctx.restore(); }
    this.drawEffects(dt);
    if (view.scale) this.drawScaleBar();
  }

  drawGrid() {
    const ctx = this.ctx, th = this.app.theme, z = this.app.cam.zoom;
    const target = 34 / z;
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    const step = target <= p ? p : target <= 2 * p ? 2 * p : target <= 5 * p ? 5 * p : 10 * p;
    const tl = this.toWorld(0, 0), br = this.toWorld(this.W, this.H);
    const x0 = Math.floor(tl.x / step), x1 = Math.ceil(br.x / step);
    const y0 = Math.floor(br.y / step), y1 = Math.ceil(tl.y / step);
    if ((x1 - x0) + (y1 - y0) > 600) return;
    const minor = new Path2D(), major = new Path2D();
    for (let i = x0; i <= x1; i++) {
      const X = Math.round(this.sx(i * step)) + 0.5, path = i % 5 === 0 ? major : minor;
      path.moveTo(X, 0); path.lineTo(X, this.H);
    }
    for (let i = y0; i <= y1; i++) {
      const Y = Math.round(this.sy(i * step)) + 0.5, path = i % 5 === 0 ? major : minor;
      path.moveTo(0, Y); path.lineTo(this.W, Y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid; ctx.stroke(minor);
    ctx.strokeStyle = th.gridMajor; ctx.stroke(major);
    ctx.strokeStyle = th.axis;
    ctx.beginPath();
    const X0 = Math.round(this.sx(0)) + 0.5, Y0 = Math.round(this.sy(0)) + 0.5;
    ctx.moveTo(X0, 0); ctx.lineTo(X0, this.H); ctx.moveTo(0, Y0); ctx.lineTo(this.W, Y0);
    ctx.stroke();
  }

  pathBody(b) {
    const ctx = this.ctx, z = this.app.cam.zoom, X = this.sx(b.rx), Y = this.sy(b.ry), sh = b.shape;
    if (sh.type === 'circle') {
      const r = sh.radius * z;
      ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, TAU);
    } else {
      const v = sh.verts, c = b.rc * z, s = b.rs * z;
      ctx.moveTo(X + c * v[0] - s * v[1], Y - (s * v[0] + c * v[1]));
      for (let i = 2, n = sh.count * 2; i < n; i += 2) ctx.lineTo(X + c * v[i] - s * v[i + 1], Y - (s * v[i] + c * v[i + 1]));
      ctx.closePath();
    }
  }

  _visible(b) {
    const z = this.app.cam.zoom, R = b.shape.bound * z + 4, X = this.sx(b.rx), Y = this.sy(b.ry);
    return X + R >= 0 && X - R <= this.W && Y + R >= 0 && Y - R <= this.H;
  }

  drawBodies(bodies, statics) {
    const ctx = this.ctx, th = this.app.theme, z = this.app.cam.zoom;
    const buckets = statics ? this.bucketsS : this.bucketsD;
    for (const bk of buckets.values()) bk.list.length = 0;
    const dimSleep = this.app.view.sleeping;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.isStatic !== statics || !this._visible(b)) continue;
      const dim = !statics && dimSleep && b.sleeping;
      const key = (b.color || '') + (dim ? '~' : '') + (b.noCollide ? '!' : '');
      let bk = buckets.get(key);
      if (!bk) {
        bk = {
          fill: b.color, stroke: b.stroke, list: [],
          alpha: (dim ? 0.55 : 1) * (b.noCollide ? 0.5 : 1),
        };
        buckets.set(key, bk);
      }
      bk.list.push(b);
    }
    ctx.lineWidth = 1.5;
    for (const bk of buckets.values()) {
      const list = bk.list;
      if (!list.length) continue;
      ctx.globalAlpha = bk.alpha;
      ctx.fillStyle = bk.fill || th.staticFill;
      ctx.strokeStyle = bk.stroke || th.staticStroke;
      ctx.beginPath();
      for (let i = 0; i < list.length; i++) this.pathBody(list[i]);
      ctx.fill();
      ctx.stroke();
      if (!statics) {
        // метка поворота у кругов
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.shape.type !== 'circle') continue;
          const r = b.shape.radius * z;
          if (r < 5) continue;
          const X = this.sx(b.rx), Y = this.sy(b.ry);
          ctx.moveTo(X + b.rc * r * 0.25, Y - b.rs * r * 0.25);
          ctx.lineTo(X + b.rc * r * 0.92, Y - b.rs * r * 0.92);
          any = true;
        }
        if (any) ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTrails(bodies) {
    const ctx = this.ctx;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.75;
    for (const b of bodies) {
      if (!b.trail || !b.trailBuf || b.trailLen < 2) continue;
      const buf = b.trailBuf, cap = buf.length >> 1, n = b.trailLen;
      let k = (b.trailHead - n + cap) % cap;
      ctx.beginPath();
      ctx.moveTo(this.sx(buf[2 * k]), this.sy(buf[2 * k + 1]));
      for (let i = 1; i < n; i++) {
        k = (k + 1) % cap;
        ctx.lineTo(this.sx(buf[2 * k]), this.sy(buf[2 * k + 1]));
      }
      ctx.lineTo(this.sx(b.rx), this.sy(b.ry));
      ctx.strokeStyle = b.color || this.app.theme.accent;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _anchor(body, lx, ly, out) {
    out.x = body.rx + body.rc * lx - body.rs * ly;
    out.y = body.ry + body.rs * lx + body.rc * ly;
    return out;
  }

  drawJoints() {
    const ctx = this.ctx, app = this.app, th = app.theme, z = app.cam.zoom, world = app.world;
    const A = this._a, B = this._b, sel = app.selected;
    for (const j of world.joints) {
      this._anchor(j.a, j.lax, j.lay, A);
      this._anchor(j.b, j.lbx, j.lby, B);
      const ax = this.sx(A.x), ay = this.sy(A.y), bx = this.sx(B.x), by = this.sy(B.y);
      let col = j.color || th.joint;
      if (j.breakForce > 0 && j.force > 0) {
        const k = Math.min(1, j.force / j.breakForce);
        if (k > 0.35) col = k > 0.8 ? '#ff4d4f' : k > 0.6 ? '#ff922b' : '#ffd43b';
      }
      const isSel = sel === j;
      if (j.style === 'hidden' && !isSel) continue;
      ctx.strokeStyle = isSel ? th.accent : col;
      ctx.fillStyle = isSel ? th.accent : col;
      switch (j.type) {
        case 'spring': {
          if (j.style === 'line') {
            ctx.globalAlpha = isSel ? 1 : 0.45; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            ctx.globalAlpha = 1;
            break;
          }
          const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
          if (len < 1) break;
          const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
          const amp = Math.max(3, Math.min(9, 0.13 * z)), coils = 12, lead = Math.min(8, len * 0.1);
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(ax, ay);
          ctx.lineTo(ax + ux * lead, ay + uy * lead);
          const span = len - 2 * lead;
          for (let i = 0; i < coils; i++) {
            const t = lead + span * (i + 0.5) / coils, side = i % 2 ? -1 : 1;
            ctx.lineTo(ax + ux * t + nx * amp * side, ay + uy * t + ny * amp * side);
          }
          ctx.lineTo(bx - ux * lead, by - uy * lead); ctx.lineTo(bx, by);
          ctx.stroke();
          this._dot(ax, ay, 2.6); this._dot(bx, by, 2.6);
          break;
        }
        case 'rod':
          ctx.lineWidth = Math.max(2, Math.min(5, 0.07 * z));
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          this._dot(ax, ay, 3.2); this._dot(bx, by, 3.2);
          break;
        case 'rope': {
          const d = Math.hypot(B.x - A.x, B.y - A.y), L = j.length;
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(ax, ay);
          if (d < L * 0.999) {
            const sag = Math.sqrt(L * L - d * d) * 0.5;
            let gx = world.gravityX, gy = world.gravityY;
            const gl = Math.hypot(gx, gy);
            if (gl < 1e-6) { gx = 0; gy = -1; } else { gx /= gl; gy /= gl; }
            const mx = (A.x + B.x) / 2 + gx * sag * 1.6, my = (A.y + B.y) / 2 + gy * sag * 1.6;
            ctx.quadraticCurveTo(this.sx(mx), this.sy(my), bx, by);
          } else ctx.lineTo(bx, by);
          ctx.stroke();
          this._dot(ax, ay, 2.4); this._dot(bx, by, 2.4);
          break;
        }
        case 'hinge': {
          const r = Math.max(3.5, Math.min(7, 0.09 * z));
          ctx.lineWidth = 1.8;
          ctx.fillStyle = th.bg0;
          ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = isSel ? th.accent : col;
          this._dot(bx, by, 1.4);
          if (j.enableMotor) {
            const dir = (j.motorKeys ? -world.motorInput * j.motorSpeed : j.motorSpeed) >= 0 ? 1 : -1;
            ctx.beginPath(); ctx.arc(bx, by, r + 4, -0.3, -0.3 - dir * 4.2, dir > 0); ctx.stroke();
          }
          break;
        }
        case 'mouse': {
          ctx.lineWidth = 1.5; ctx.strokeStyle = th.accent; ctx.fillStyle = th.accent;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(this.sx(j.tx), this.sy(j.ty)); ctx.stroke();
          ctx.setLineDash([]);
          this._dot(bx, by, 3); this._dot(this.sx(j.tx), this.sy(j.ty), 2);
          break;
        }
      }
    }
  }

  _dot(x, y, r) { const ctx = this.ctx; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  drawVelocities(bodies) {
    const ctx = this.ctx, th = this.app.theme;
    ctx.strokeStyle = th.vel; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      const v = Math.hypot(b.vx, b.vy);
      if (v < 0.05) continue;
      const X = this.sx(b.rx), Y = this.sy(b.ry);
      const ex = this.sx(b.rx + b.vx * 0.25), ey = this.sy(b.ry + b.vy * 0.25);
      ctx.moveTo(X, Y); ctx.lineTo(ex, ey);
      const ang = Math.atan2(ey - Y, ex - X), h = Math.min(8, Math.hypot(ex - X, ey - Y) * 0.4);
      ctx.moveTo(ex, ey); ctx.lineTo(ex - h * Math.cos(ang - 0.45), ey - h * Math.sin(ang - 0.45));
      ctx.moveTo(ex, ey); ctx.lineTo(ex - h * Math.cos(ang + 0.45), ey - h * Math.sin(ang + 0.45));
    }
    ctx.stroke();
  }

  drawContacts() {
    const ctx = this.ctx, th = this.app.theme;
    ctx.fillStyle = th.contact; ctx.strokeStyle = th.contact; ctx.lineWidth = 1;
    const lines = new Path2D();
    for (const m of this.app.world.contacts) {
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const X = this.sx(m.a.x + p.rAx), Y = this.sy(m.a.y + p.rAy);
        ctx.fillRect(X - 2, Y - 2, 4, 4);
        lines.moveTo(X, Y); lines.lineTo(X + m.nx * 10, Y - m.ny * 10);
      }
    }
    ctx.stroke(lines);
  }

  drawCenters(bodies) {
    const ctx = this.ctx, th = this.app.theme;
    ctx.strokeStyle = th.text; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const b of bodies) {
      if (b.isStatic) continue;
      const X = this.sx(b.rx), Y = this.sy(b.ry);
      ctx.moveTo(X - 4, Y); ctx.lineTo(X + 4, Y); ctx.moveTo(X, Y - 4); ctx.lineTo(X, Y + 4);
    }
    ctx.stroke();
  }

  drawAABB(bodies) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,212,59,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const b of bodies) {
      const x0 = this.sx(b.minX), y0 = this.sy(b.maxY);
      ctx.rect(x0, y0, this.sx(b.maxX) - x0, this.sy(b.minY) - y0);
    }
    ctx.stroke();
  }

  drawLabels(bodies) {
    const ctx = this.ctx, th = this.app.theme, z = this.app.cam.zoom;
    let set = false;
    for (const b of bodies) {
      if (!b.label || !this._visible(b)) continue;
      if (!set) { ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; set = true; }
      const X = this.sx(b.rx), Y = this.sy(b.ry) - b.shape.bound * z - 6;
      ctx.fillStyle = th.label;
      ctx.fillText(b.label, X, Y);
    }
  }

  drawSelection() {
    const app = this.app, ctx = this.ctx, th = app.theme;
    const hov = app.hover;
    if (hov && hov !== app.selected && hov.shape) {
      ctx.globalAlpha = 0.6; ctx.strokeStyle = th.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); this.pathBody(hov); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const s = app.selected;
    if (s && s.shape) {
      ctx.strokeStyle = th.select; ctx.lineWidth = 2.5;
      ctx.shadowColor = th.accent; ctx.shadowBlur = 12;
      ctx.beginPath(); this.pathBody(s); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = th.accent; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      const z = app.cam.zoom, R = s.shape.bound * z + 6;
      ctx.beginPath(); ctx.arc(this.sx(s.rx), this.sy(s.ry), R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawEffects(dt) {
    const ctx = this.ctx, th = this.app.theme, fx = this.effects;
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1) { fx.splice(i, 1); continue; }
      const X = this.sx(e.x), Y = this.sy(e.y), R = e.r * this.app.cam.zoom * (0.2 + 0.8 * k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = e.color || '#ffa94d'; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.stroke();
      ctx.fillStyle = e.color || '#ffa94d'; ctx.globalAlpha = (1 - k) * 0.15;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    void th;
  }

  drawScaleBar() {
    const ctx = this.ctx, th = this.app.theme, z = this.app.cam.zoom;
    const target = 110 / z, p = Math.pow(10, Math.floor(Math.log10(target)));
    const len = target >= 5 * p ? 5 * p : target >= 2 * p ? 2 * p : p;
    const px = len * z, x = 18, y = this.H - 44;
    ctx.strokeStyle = th.text; ctx.fillStyle = th.text; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5); ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(len >= 1 ? `${len} м` : `${Math.round(len * 100)} см`, x + 4, y - 3);
    ctx.globalAlpha = 1;
  }

  /* ------------------- помощники для предпросмотра инструментов ------------------- */

  ghostCircle(x, y, r) {
    const ctx = this.ctx, th = this.app.theme;
    ctx.fillStyle = th.ghost; ctx.strokeStyle = th.ghostStroke; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), Math.max(1, r * this.app.cam.zoom), 0, TAU);
    ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  ghostPoly(pts) {
    const ctx = this.ctx, th = this.app.theme;
    ctx.fillStyle = th.ghost; ctx.strokeStyle = th.ghostStroke; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(this.sx(p[0]), this.sy(p[1])) : ctx.moveTo(this.sx(p[0]), this.sy(p[1])));
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  ghostLine(x1, y1, x2, y2, dashed = true, color) {
    const ctx = this.ctx, th = this.app.theme;
    ctx.strokeStyle = color || th.ghostStroke; ctx.lineWidth = 2; if (dashed) ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(this.sx(x1), this.sy(y1)); ctx.lineTo(this.sx(x2), this.sy(y2)); ctx.stroke();
    ctx.setLineDash([]);
  }
  marker(x, y, r = 4, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color || this.app.theme.ghostStroke;
    ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), r, 0, TAU); ctx.fill();
  }
  tag(text, x, y) {
    const ctx = this.ctx, th = this.app.theme;
    const X = this.sx(x) + 14, Y = this.sy(y) - 14;
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = th.bg1; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X - 6, Y - 10, w, 20, 6) : ctx.rect(X - 6, Y - 10, w, 20); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = th.text;
    ctx.fillText(text, X, Y);
  }
}
