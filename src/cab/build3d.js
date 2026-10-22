/* ==========================================================================
   Ясень · Конструктор: 3D-модель шкафа из расчёта конструкции
   ========================================================================== */

import * as THREE from 'three';
import { softBox, finalize, lathe, rodGeometry } from '../geo.js';
import * as M from '../materials.js';
import { DECORS, ENAMELS, HANDLE_METALS, HANDLES } from './model.js';

const S = 0.001;

/*
 * Кэш геометрии панелей: при перетаскивании полки меняются 2–3 детали, остальные
 * берутся готовыми. Геометрии общие (userData.shared), вытесняются по старшинству.
 */
const geoCache = new Map();
const GEO_LIMIT = 800;
export const geoStats = { hit: 0, miss: 0 };
function panelGeometry(w, h, d, r) {
  const key = `${w.toFixed(1)}|${h.toFixed(1)}|${d.toFixed(1)}|${r.toFixed(2)}`;
  let g = geoCache.get(key);
  if (g) { geoStats.hit++; geoCache.delete(key); geoCache.set(key, g); return g; }
  geoStats.miss++;
  g = finalize(softBox(w * S, h * S, d * S, r * S, { round: 2 }));
  g.userData.shared = true;
  geoCache.set(key, g);
  if (geoCache.size > GEO_LIMIT) { const [k0, g0] = geoCache.entries().next().value; geoCache.delete(k0); g0.dispose(); }
  return g;
}

function box(w, h, d, mat, r = 1.2) {
  const m = new THREE.Mesh(panelGeometry(w, h, d, Math.max(0.2, Math.min(r, w / 2 - 0.1, h / 2 - 0.1, d / 2 - 0.1))), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const tag = (obj, data) => { obj.traverse((o) => { if (o.isMesh) Object.assign(o.userData, data); }); return obj; };

// Куда разлетается деталь на схеме сборки (мм).
function explodeVec(b) {
  switch (b.role) {
    case 'side': return [b.side === 'left' ? -320 : 320, 0, 0];
    case 'top': return [0, 320, 0];
    case 'bottom': return [0, -60, 0];
    case 'plinth': return [0, -200, b.z > 100 ? 220 : -220];
    case 'back': return [0, 0, -420];
    case 'divider': return [0, 0, -140];
    case 'shelf': return [0, 0, 260];
    case 'filler': return [b.x < 0 ? -520 : b.y > 100 ? 0 : 520, b.y > 100 && b.x < 0 && b.w > 200 ? 420 : 0, 120];
    default: return [0, 0, 0];
  }
}

/**
 * Собирает THREE.Group по результату layout(). Начало координат — центр пятна на полу.
 * userData: open.set(k) — открыть фасады, explode.set(k) — разнести детали,
 * setFronts(bool) — спрятать фасады, pickers — объёмы секций, niche — стены ниши.
 */
export function buildCabinet(L) {
  const p = L.p, g = new THREE.Group();
  const ox = -p.W / 2, oz = -p.D / 2;
  const frontDecor = p.front.kind === 'enamel' ? null : DECORS[p.front.id];
  const mats = {
    body: M.board(DECORS[p.body]),
    drawer: M.board(DECORS.white),
    hdf: M.board({ hex: DECORS[p.body].wood || p.body === 'concrete' ? DECORS[p.body].hex : '#ebe8e2' }),
    front: frontDecor ? M.board(frontDecor) : M.enamel(ENAMELS[p.front.id].hex),
    glass: M.glass(),
    mirror: M.mirror(),
  };
  mats.enamel = mats.front;
  const metal = M.metalHex(HANDLE_METALS[p.metal].hex);
  const alu = M.metalHex('#b9bcbf', 0.38);
  const chrome = M.metalHex('#d5d8db', 0.2);
  const fronts = [];
  const groups = new Map();
  const tops = [];   // объекты верхнего уровня для «разнесённого» вида

  const groupFor = (key, b) => {
    if (groups.has(key)) return groups.get(key);
    const a = L.anims[key], grp = new THREE.Group();
    grp.userData.anim = a;
    if (a?.type === 'door') grp.position.set((a.px + ox) * S, 0, (a.pz + oz) * S);
    grp.userData.ex = b?.kind === 'door' || b?.kind === 'slide' ? [0, 0, 480] : [0, 0, 340];
    g.add(grp);
    groups.set(key, grp);
    tops.push(grp);
    return grp;
  };
  const place = (obj, b, cx, cy, cz) => {
    const parent = b.grp ? groupFor(b.grp, b) : g;
    obj.position.set((cx + ox) * S - parent.position.x, cy * S, (cz + oz) * S - parent.position.z);
    parent.add(obj);
    if (parent === g) { obj.userData.ex = explodeVec(b); tops.push(obj); }
    return obj;
  };

  for (const b of L.boxes) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, cz = b.z + b.d / 2;
    let obj;
    if (b.role === 'glass') {
      obj = new THREE.Group();
      const f = 20;
      for (const [w, h, x, y] of [[b.w, f, 0, (b.h - f) / 2], [b.w, f, 0, -(b.h - f) / 2], [f, b.h - 2 * f, -(b.w - f) / 2, 0], [f, b.h - 2 * f, (b.w - f) / 2, 0]]) {
        const bar = box(w, h, b.d, alu, 1.5); bar.position.set(x * S, y * S, 0); obj.add(bar);
      }
      const gl = new THREE.Mesh(new THREE.PlaneGeometry((b.w - 2 * f + 4) * S, (b.h - 2 * f + 4) * S), mats.glass);
      gl.renderOrder = 2;
      obj.add(gl);
    } else if (b.role === 'sliding') {
      obj = new THREE.Group();
      const pv = 24, ph = 34;
      const ins = box(b.w - 2 * pv + 8, b.h - 2 * ph + 8, b.mirror ? 6 : 10, b.mirror ? mats.mirror : mats[b.mat], 0.8); obj.add(ins);
      for (const [w, h, x, y, d] of [[pv, b.h, -(b.w - pv) / 2, 0, b.d], [pv, b.h, (b.w - pv) / 2, 0, b.d], [b.w - 2 * pv, ph, 0, (b.h - ph) / 2, 18], [b.w - 2 * pv, ph, 0, -(b.h - ph) / 2, 18]]) {
        const bar = box(w, h, d, alu, 2); bar.position.set(x * S, y * S, 0); obj.add(bar);
      }
    } else {
      obj = box(b.w, b.h, b.d, mats[b.mat], b.role === 'front' && !b.inner ? 1.6 : 1);
      if (b.mirror) {
        const mr = box(b.w - 60, b.h - 60, 4, mats.mirror, 0.6);
        mr.position.z = (b.d / 2 + 2) * S;
        const o = new THREE.Group(); o.add(obj, mr); obj = o;
      }
    }
    tag(obj, { boxId: b.id, role: b.role, sec: b.sec, cell: b.cell, div: b.div, side: b.side });
    place(obj, b, cx, cy, cz);
    if (b.front) fronts.push(obj);
  }

  // ручки
  for (const h of L.handles) {
    if (h.kind === 'push') continue;
    const grp = h.grp ? groupFor(h.grp) : g, hg = new THREE.Group();
    if (h.kind === 'bar128' || h.kind === 'bar192') {
      const span = HANDLES[h.kind].span;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(6 * S, 6 * S, (span + 26) * S, 16), metal);
      bar.position.z = 30 * S;
      for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(4.5 * S, 4.5 * S, 30 * S, 12), metal); post.rotation.x = Math.PI / 2; post.position.set(0, (s * span) / 2 * S, 15 * S); hg.add(post); }
      hg.add(bar);
      if (h.orient === 'h') hg.rotation.z = Math.PI / 2;
    } else if (h.kind === 'knob') {
      const k = new THREE.Mesh(finalize(lathe([[0, 0], [6, 0], [6, 12], [14, 18], [15, 24], [11, 28], [0, 28.5]].map(([r, y]) => [r * S, y * S]), 24), { smooth: true }), metal);
      k.rotation.x = Math.PI / 2;
      hg.add(k);
    } else if (h.kind === 'edge') {
      const len = h.len || 220;
      const prof = h.orient === 'v' ? box(14, len, 24, metal, 2) : box(len, 14, 24, metal, 2);
      prof.position.set(0, 0, -6 * S);
      hg.add(prof);
    }
    hg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    hg.position.set((h.x + ox) * S - grp.position.x, h.y * S, (h.z + oz) * S - grp.position.z);
    grp.add(hg);
    fronts.push(hg);
  }

  // штанги
  for (const r of L.rails) {
    const len = r.x1 - r.x0, grp = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(12 * S, 12 * S, len * S, 20), chrome);
    rail.scale.z = 0.6; rail.rotation.z = Math.PI / 2; rail.castShadow = true;
    grp.add(rail);
    for (const x of [-len / 2 + 4, len / 2 - 4]) { const hd = box(8, 40, 40, chrome, 2); hd.position.set(x * S, 8 * S, 0); grp.add(hd); }
    grp.position.set((r.x0 + len / 2 + ox) * S, r.y * S, (r.z + oz) * S);
    grp.userData.ex = [0, 0, 160];
    tag(grp, { role: 'rail', sec: r.sec, cell: r.cell });
    g.add(grp); tops.push(grp);
  }

  // аксессуары: обувницы, брючницы, корзины — выдвигаются вместе с фасадами
  const accAnims = [];
  for (const a of L.acc) {
    const grp = new THREE.Group(), w = a.x1 - a.x0 - 30, d = p.D - 60;
    if (a.kind === 'shoes') {
      const step = (a.y1 - a.y0) / a.rows;
      for (let k = 0; k < a.rows; k++) {
        const yb = a.y0 + step * k + 30, rise = 110;
        for (const s of [-1, 1]) grp.add(new THREE.Mesh(rodGeometry(new THREE.Vector3((s * w / 2) * S, yb * S, (-d / 2) * S), new THREE.Vector3((s * w / 2) * S, (yb + rise) * S, (d / 2 - 40) * S), 5 * S, 8), chrome));
        for (const t of [0.15, 0.5, 0.85]) {
          const z = -d / 2 + t * (d - 40), y = yb + rise * t;
          grp.add(new THREE.Mesh(rodGeometry(new THREE.Vector3((-w / 2) * S, y * S, z * S), new THREE.Vector3((w / 2) * S, y * S, z * S), 4 * S, 8), chrome));
        }
        const lip = new THREE.Mesh(rodGeometry(new THREE.Vector3((-w / 2) * S, (yb + rise + 25) * S, (d / 2 - 30) * S), new THREE.Vector3((w / 2) * S, (yb + rise + 25) * S, (d / 2 - 30) * S), 5 * S, 8), chrome);
        grp.add(lip);
      }
    } else if (a.kind === 'pants') {
      const top = a.y1 - 70;
      grp.add(box(w, 30, d, alu, 3).translateY(top * S));
      for (let k = 0; k < Math.floor(d / 45); k++) {
        const z = -d / 2 + 30 + k * 45;
        grp.add(new THREE.Mesh(rodGeometry(new THREE.Vector3((-w / 2 + 20) * S, (top - 20) * S, z * S), new THREE.Vector3((w / 2 - 60) * S, (top - 20) * S, z * S), 5 * S, 8), chrome));
      }
    } else if (a.kind === 'basket') {
      const h = Math.min(a.y1 - a.y0 - 30, 220), yb = a.y0 + 10;
      const wire = new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0.55 });
      const bx = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), wire);
      bx.position.y = (yb + h / 2) * S;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bx.geometry), new THREE.LineBasicMaterial({ color: '#8d9297' }));
      edges.position.copy(bx.position);
      grp.add(bx, edges);
    }
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp.position.set(((a.x0 + a.x1) / 2 + ox) * S, 0, (p.D / 2 + oz) * S);
    grp.userData.base = grp.position.clone();
    grp.userData.ex = [0, 0, 300];
    tag(grp, { role: 'acc', sec: a.sec, cell: a.cell });
    g.add(grp); tops.push(grp);
    accAnims.push({ grp, travel: (p.D - 80) * 0.75 });
  }

  // опоры
  for (const l of L.legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(17 * S, 14 * S, l.h * S, 24), metal);
    leg.position.set((l.x + ox) * S, (l.h / 2) * S, (l.z + oz) * S);
    leg.castShadow = true;
    leg.userData.ex = [0, -180, 0];
    g.add(leg); tops.push(leg);
  }

  // стены ниши — полупрозрачные, чтобы видеть, как шкаф встаёт на место
  if (L.niche) {
    const n = L.niche, wallMat = new THREE.MeshStandardMaterial({ color: '#e7e1d8', roughness: 0.95, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const wg = new THREE.Group();
    const half = n.minW / 2, depth = n.d, hh = n.minH;
    const addWall = (w, h, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * S, h * S), wallMat); m.position.set(x * S, y * S, z * S); m.rotation.set(rx, ry, 0); wg.add(m); };
    const zb = oz - 6;
    addWall(n.minW + 300, hh + 150, 0, (hh + 150) / 2, zb);
    addWall(depth, hh + 150, -half, (hh + 150) / 2, zb + depth / 2, Math.PI / 2);
    addWall(depth, hh + 150, half, (hh + 150) / 2, zb + depth / 2, Math.PI / 2);
    addWall(n.minW + 300, depth, 0, hh, zb + depth / 2, 0, Math.PI / 2);
    if (n.skirting.h) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(n.minW * S, n.skirting.h * S, n.skirting.d * S), new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.7 }));
      sk.position.set(0, (n.skirting.h / 2) * S, (zb + n.skirting.d / 2) * S);
      wg.add(sk);
    }
    wg.traverse((o) => { o.userData.noBounds = true; o.userData.noContact = true; });
    wg.userData.niche = true;
    g.add(wg);
    g.userData.niche = wg;
  }

  // невидимые объёмы секций — для выбора мышью
  const pickers = L.secs.map((s) => {
    const y0 = s.cells[0]?.y0 ?? p.baseH + L.T, y1 = s.cells[s.cells.length - 1]?.y1 ?? p.H - L.T;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.cw * S, (y1 - y0) * S, p.D * S), new THREE.MeshBasicMaterial());
    m.position.set((s.x0 + s.cw / 2 + ox) * S, ((y0 + y1) / 2) * S, (p.D / 2 + oz) * S);
    m.visible = false;
    m.userData.sec = s.i;
    m.userData.noBounds = true;
    g.add(m);
    return m;
  });

  for (const o of tops) o.userData.base = o.position.clone();
  const anims = [...groups.values()].filter((x) => x.userData.anim);
  const state = { open: 0, explode: 0 };
  const apply = () => {
    const e = 1 - Math.pow(1 - state.explode, 3);
    for (const o of tops) {
      const ex = o.userData.ex || [0, 0, 0];
      o.position.set(o.userData.base.x + ex[0] * S * e, o.userData.base.y + ex[1] * S * e, o.userData.base.z + ex[2] * S * e);
    }
    for (const grp of anims) {
      const a = grp.userData.anim, e0 = Math.min(1, Math.max(0, (state.open - a.delay) / (1 - 0.4)));
      const k = 1 - Math.pow(1 - e0, 3);
      if (a.type === 'door') grp.rotation.y = (a.side === 'left' ? -1 : 1) * 1.7 * k;
      else if (a.type === 'drawer') grp.position.z += a.travel * S * k;
      else if (a.type === 'slide') grp.position.x += a.dx * S * k;
    }
    const ka = 1 - Math.pow(1 - Math.min(1, state.open * 1.2), 3);
    for (const a of accAnims) a.grp.position.z += a.travel * S * ka * 0.6;
  };
  g.userData.pickers = pickers;
  g.userData.offset = { ox, oz };
  g.userData.open = { label: 'Открыть фасады', closeLabel: 'Закрыть фасады', set(k) { state.open = k; apply(); } };
  g.userData.explode = { set(k) { state.explode = k; apply(); } };
  g.userData.setFronts = (on) => { for (const f of fronts) f.visible = on; };
  return g;
}
