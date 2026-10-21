'use strict';
/* ==========================================================================
   Физлаб · сохранение и загрузка сцен (JSON), ссылки «поделиться»
   ========================================================================== */

const r4 = v => Math.round(v * 1e4) / 1e4;

function shapeToJSON(s) {
  if (s.type === 'circle') return { t: 'c', r: r4(s.radius) };
  if (s.kind === 'box') return { t: 'b', w: r4(s.w), h: r4(s.h) };
  if (s.kind === 'regular') return { t: 'n', n: s.n, r: r4(s.r) };
  return { t: 'p', v: Array.from(s.verts, r4) };
}

function shapeFromJSON(j) {
  switch (j.t) {
    case 'c': return Shapes.circle(j.r);
    case 'b': return Shapes.box(j.w, j.h);
    case 'n': return Shapes.regular(j.n, j.r);
    default: {
      const pts = [];
      for (let i = 0; i + 1 < j.v.length; i += 2) pts.push([j.v[i], j.v[i + 1]]);
      return Shapes.polygon(pts);
    }
  }
}

function bodyToJSON(b) {
  const o = { id: b.id, s: shapeToJSON(b.shape), x: r4(b.x), y: r4(b.y) };
  if (b.angle) o.a = r4(b.angle);
  if (b.vx) o.vx = r4(b.vx);
  if (b.vy) o.vy = r4(b.vy);
  if (b.w) o.w = r4(b.w);
  if (b.isStatic) o.st = 1;
  o.d = r4(b.density); o.f = r4(b.friction); o.e = r4(b.restitution);
  if (b.color) o.c = b.color;
  if (b.fixedRotation) o.fr = 1;
  if (b.gravityScale !== 1) o.gs = r4(b.gravityScale);
  if (b.linearDamping) o.ld = r4(b.linearDamping);
  if (b.angularDamping) o.ad = r4(b.angularDamping);
  if (b.noCollide) o.nc = 1;
  if (b.trail) o.tr = 1;
  if (b.label) o.lb = b.label;
  if (b.sleeping) o.sl = 1;
  return o;
}

function bodyFromJSON(o) {
  const shape = shapeFromJSON(o.s);
  const b = new Body({
    id: o.id, shape, x: o.x, y: o.y, angle: o.a || 0, vx: o.vx || 0, vy: o.vy || 0, w: o.w || 0,
    isStatic: !!o.st, density: o.d ?? 1, friction: o.f ?? 0.5, restitution: o.e ?? 0.1,
    color: o.c || null, fixedRotation: !!o.fr, gravityScale: o.gs ?? 1,
    linearDamping: o.ld || 0, angularDamping: o.ad || 0, noCollide: !!o.nc, trail: !!o.tr, label: o.lb || '',
  });
  if (o.sl && !b.isStatic) { b.sleeping = true; b.sleepTime = PHYS.TIME_TO_SLEEP; }
  return b;
}

function jointToJSON(j) {
  const o = { id: j.id, t: j.type, a: j.a.isGround ? null : j.a.id, b: j.b.id, la: [r4(j.lax), r4(j.lay)], lb: [r4(j.lbx), r4(j.lby)] };
  if (j.collideConnected) o.cc = 1;
  if (j.breakForce) o.bf = r4(j.breakForce);
  if (j.style) o.sty = j.style;
  if (j.color) o.c = j.color;
  if (j.type === 'hinge') {
    o.ref = r4(j.refAngle);
    if (j.enableMotor) { o.mo = 1; }
    if (j.motorSpeed) o.ms = r4(j.motorSpeed);
    if (j.maxTorque !== 100) o.mt = r4(j.maxTorque);
    if (j.motorKeys) o.mk = 1;
    if (j.enableLimit) { o.li = 1; o.lo = r4(j.lower); o.hi = r4(j.upper); }
  } else {
    o.len = r4(j.length);
    if (j.type === 'spring') { o.hz = r4(j.hertz); o.dr = r4(j.damping); }
  }
  return o;
}

function jointFromJSON(o, byId, world) {
  const a = o.a == null ? world.ground : byId.get(o.a), b = byId.get(o.b);
  if (!a || !b) return null;
  const common = {
    id: o.id, lax: o.la[0], lay: o.la[1], lbx: o.lb[0], lby: o.lb[1],
    collideConnected: !!o.cc, breakForce: o.bf || 0, style: o.sty || '', color: o.c || null,
  };
  if (o.t === 'hinge') {
    return new RevoluteJoint(a, b, {
      ...common, refAngle: o.ref ?? 0, enableMotor: !!o.mo, motorSpeed: o.ms || 0, maxTorque: o.mt ?? 100,
      motorKeys: !!o.mk, enableLimit: !!o.li, lower: o.lo ?? -0.785, upper: o.hi ?? 0.785,
    });
  }
  if (o.t === 'spring' || o.t === 'rod' || o.t === 'rope') {
    return new DistanceJoint(o.t, a, b, { ...common, length: o.len, hertz: o.hz ?? 2.5, damping: o.dr ?? 0.3 });
  }
  return null;
}

/** Снимок сцены: мир + камера + метаданные. */
function serializeScene(app, meta = {}) {
  const w = app.world;
  return {
    format: 'physlab', version: 1,
    name: meta.name ?? app.sceneName, description: meta.description ?? app.sceneDesc ?? '',
    world: {
      gx: r4(w.gravityX), gy: r4(w.gravityY), air: r4(w.airDrag), sub: w.substeps,
      sleep: w.allowSleep ? 1 : 0, mg: w.mutualGravity ? 1 : 0, G: r4(w.G),
    },
    camera: { x: r4(app.cam.x), y: r4(app.cam.y), zoom: r4(app.cam.zoom) },
    follow: app.follow ? app.follow.id : undefined,
    bodies: w.bodies.map(bodyToJSON),
    joints: w.joints.filter(j => j.type !== 'mouse').map(jointToJSON),
  };
}

/** Загрузить снимок в мир. Возвращает { byId, data }. */
function deserializeScene(app, data, { camera = true } = {}) {
  if (!data || data.format !== 'physlab' || !Array.isArray(data.bodies)) throw new Error('Неверный формат файла сцены');
  const w = app.world;
  w.clear();
  const ws = data.world || {};
  w.gravityX = ws.gx ?? 0; w.gravityY = ws.gy ?? -9.81;
  w.airDrag = ws.air ?? 0.02; w.substeps = ws.sub ?? 4;
  w.allowSleep = ws.sleep !== 0; w.mutualGravity = !!ws.mg; w.G = ws.G ?? 1;
  const byId = new Map();
  for (const o of data.bodies) {
    const b = bodyFromJSON(o);
    byId.set(b.id, b);
    w.addBody(b);
  }
  for (const o of data.joints || []) {
    const j = jointFromJSON(o, byId, w);
    if (j) w.addJoint(j);
  }
  for (const o of data.bodies) if (o.sl) { const b = byId.get(o.id); if (b && !b.isStatic) b.sleeping = true; }
  if (camera && data.camera) Object.assign(app.cam, data.camera);
  app.follow = data.follow ? byId.get(data.follow) || null : null;
  app.sceneName = data.name || 'Без названия';
  app.sceneDesc = data.description || '';
  return { byId, data };
}

/* ------------------------- сжатие для ссылок ------------------------- */

function _b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function encodeShare(data) {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    return 'z' + _b64url(buf);
  }
  return 'j' + _b64url(json);
}

async function decodeShare(str) {
  const kind = str[0], bytes = _unb64url(str.slice(1));
  let json;
  if (kind === 'z') {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    json = await new Response(ds).text();
  } else json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

/* ------------------------- локальное хранилище ------------------------- */

const Store = {
  get(key, def) {
    try { const v = localStorage.getItem('physlab.' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('physlab.' + key, JSON.stringify(val)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem('physlab.' + key); } catch { /* недоступно */ } },
};
