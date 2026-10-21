/* ==========================================================================
   Физлаб 3D · сохранение и загрузка сцен, ссылки, локальное хранилище
   ========================================================================== */

import { Obj } from './physics.js';

const r4 = v => Math.round(v * 1e4) / 1e4;
const vec = v => [r4(v.x), r4(v.y), r4(v.z)];
const quat = q => [r4(q.x), r4(q.y), r4(q.z), r4(q.w)];
const V3 = a => ({ x: a[0], y: a[1], z: a[2] });
const Q4 = a => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
const isId = q => Math.abs(q.w) > 0.99999;

export function objToJSON(o) {
  const j = { id: o.id, k: o.kind, s: Object.fromEntries(Object.entries(o.size).map(([k, v]) => [k, r4(v)])), p: vec(o.p) };
  if (!isId(o.q)) j.q = quat(o.q);
  if (!isId(o.crot)) j.cr = quat(o.crot);
  if (o.isStatic) j.st = 1;
  if (o.ground) j.gnd = 1;
  if (o.glass) j.gl = 1;
  j.d = r4(o.density); j.f = r4(o.friction); j.e = r4(o.restitution);
  if (o.color) j.c = o.color;
  if (o.label) j.lb = o.label;
  if (o.trail) j.tr = 1;
  if (o.fixedRotation) j.fr = 1;
  if (o.gravityScale !== 1) j.gs = r4(o.gravityScale);
  if (o.damping) j.dm = r4(o.damping);
  if (o.ccd) j.ccd = 1;
  if (!o.isStatic && o.rb) {
    const v = o.rb.linvel(), w = o.rb.angvel();
    if (Math.hypot(v.x, v.y, v.z) > 1e-4) j.v = vec(v);
    if (Math.hypot(w.x, w.y, w.z) > 1e-4) j.w = vec(w);
    if (o.rb.isSleeping()) j.sl = 1;
  }
  return j;
}

export function objFromJSON(j) {
  const o = new Obj({
    id: j.id, kind: j.k, size: j.s, pos: V3(j.p), rot: j.q ? Q4(j.q) : undefined, crot: j.cr ? Q4(j.cr) : undefined,
    isStatic: !!j.st, ground: !!j.gnd, glass: !!j.gl, density: j.d ?? 1, friction: j.f ?? 0.5, restitution: j.e ?? 0.1,
    color: j.c || null, label: j.lb || '', trail: !!j.tr, fixedRotation: !!j.fr, gravityScale: j.gs ?? 1, damping: j.dm || 0, ccd: !!j.ccd,
  });
  return { o, state: { linvel: j.v ? V3(j.v) : undefined, angvel: j.w ? V3(j.w) : undefined, sleeping: !!j.sl } };
}

export function jointToJSON(j) {
  const o = { id: j.id, t: j.type, a: j.a ? j.a.id : null, b: j.b.id, la: vec(j.la), lb: vec(j.lb) };
  if (j.type === 'hinge') o.ax = vec(j.axis);
  if (j.type === 'spring' || j.type === 'rope') o.len = r4(j.length);
  if (j.type === 'spring') { o.hz = r4(j.hertz); o.dr = r4(j.damping); }
  if (j.type === 'weld') { o.qa = quat(j.qa); o.qb = quat(j.qb); }
  if (j.motor) { o.mo = 1; o.sp = r4(j.speed); o.pw = r4(j.power); if (j.drive) o.dv = j.drive; if (j.reverse) o.rv = 1; }
  if (j.limit) { o.li = 1; o.lo = r4(j.lower); o.hi = r4(j.upper); }
  o.cc = j.contacts ? 1 : 0;
  if (j.hidden) o.hd = 1;
  return o;
}

export function jointFromJSON(o, byId) {
  const a = o.a == null ? null : byId.get(o.a), b = byId.get(o.b);
  if ((o.a != null && !a) || !b) return null;
  return {
    id: o.id, type: o.t, a, b, la: V3(o.la), lb: V3(o.lb), axis: o.ax ? V3(o.ax) : { x: 0, y: 0, z: 1 },
    length: o.len ?? 1, hertz: o.hz ?? 2, damping: o.dr ?? 0.3,
    qa: o.qa ? Q4(o.qa) : { x: 0, y: 0, z: 0, w: 1 }, qb: o.qb ? Q4(o.qb) : { x: 0, y: 0, z: 0, w: 1 },
    motor: !!o.mo, speed: o.sp ?? 3, power: o.pw ?? 30, drive: o.dv || '', reverse: !!o.rv,
    limit: !!o.li, lower: o.lo ?? -0.785, upper: o.hi ?? 0.785, contacts: !!o.cc, hidden: !!o.hd,
  };
}

export function serializeScene(app, meta = {}) {
  const P = app.physics;
  return {
    format: 'physlab3d', version: 1,
    name: meta.name ?? app.sceneName, description: meta.description ?? app.sceneDesc ?? '',
    world: { g: vec(P.gravity), air: r4(P.airDrag), it: P.iterations, sleep: P.allowSleep ? 1 : 0, mg: P.mutualGravity ? 1 : 0, G: r4(P.G) },
    camera: (() => { const s = app.cam.state; return { t: vec(s.target), d: r4(s.dist), y: r4(s.yaw), p: r4(s.pitch) }; })(),
    follow: app.follow ? app.follow.id : undefined,
    objs: P.objs.map(objToJSON),
    joints: P.joints.map(jointToJSON),
  };
}

export function deserializeScene(app, data, { camera = true } = {}) {
  if (!data || data.format !== 'physlab3d' || !Array.isArray(data.objs)) throw new Error('Это не файл сцены Физлаба 3D');
  const P = app.physics, w = data.world || {};
  P.gravity = w.g ? V3(w.g) : { x: 0, y: -9.81, z: 0 };
  P.airDrag = w.air ?? 0.02; P.iterations = w.it ?? 4;
  P.allowSleep = w.sleep !== 0; P.mutualGravity = !!w.mg; P.G = w.G ?? 1;
  P.reset();
  const byId = new Map();
  for (const j of data.objs) {
    const { o, state } = objFromJSON(j);
    P.add(o, state);
    byId.set(o.id, o);
  }
  for (const jo of data.joints || []) {
    const j = jointFromJSON(jo, byId);
    if (j) P.addJointLocal(j);
  }
  if (camera && data.camera) {
    const c = data.camera;
    app.cam.set({ target: V3(c.t), dist: c.d, yaw: c.y, pitch: c.p });
  }
  app.follow = data.follow ? byId.get(data.follow) || null : null;
  app.sceneName = data.name || 'Без названия';
  app.sceneDesc = data.description || '';
  return { byId };
}

/* ------------------------------ ссылки ------------------------------ */

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encodeShare(data) {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + b64url(new Uint8Array(await new Response(cs).arrayBuffer()));
  }
  return 'j' + b64url(json);
}

export async function decodeShare(str) {
  const bytes = unb64url(str.slice(1));
  let json;
  if (str[0] === 'z') json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  else json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

export const Store = {
  get(key, def) { try { const v = localStorage.getItem('physlab3d.' + key); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(key, val) { try { localStorage.setItem('physlab3d.' + key, JSON.stringify(val)); return true; } catch { return false; } },
};
