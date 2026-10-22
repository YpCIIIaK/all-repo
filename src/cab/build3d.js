/* ==========================================================================
   Ясень · Конструктор: 3D-модель шкафа из расчёта конструкции
   ========================================================================== */

import * as THREE from 'three';
import { softBox, finalize, lathe } from '../geo.js';
import * as M from '../materials.js';
import { DECORS, ENAMELS, HANDLE_METALS, T } from './model.js';

const S = 0.001;

function box(w, h, d, mat, r = 1.2) {
  const m = new THREE.Mesh(finalize(softBox(w * S, h * S, d * S, Math.min(r, w / 2 - 0.1, h / 2 - 0.1, d / 2 - 0.1) * S, { round: 2 })), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Собирает THREE.Group по результату layout(). Начало координат — центр пятна на полу.
 * userData.open.set(k) открывает фасады, userData.setFronts(bool) прячет их,
 * userData.pickers — невидимые объёмы секций для выбора мышью.
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
  };
  mats.enamel = mats.front;
  const metal = M.metalHex(HANDLE_METALS[p.metal].hex);
  const alu = M.metalHex('#b9bcbf', 0.38);
  const fronts = [];
  const groups = new Map();

  const groupFor = (key) => {
    if (groups.has(key)) return groups.get(key);
    const a = L.anims[key], grp = new THREE.Group();
    grp.userData.anim = a;
    if (a?.type === 'door') grp.position.set((a.px + ox) * S, 0, (a.pz + oz) * S);
    g.add(grp);
    groups.set(key, grp);
    return grp;
  };
  const place = (obj, b, cx, cy, cz) => {
    const parent = b.grp ? groupFor(b.grp) : g;
    obj.position.set((cx + ox) * S - parent.position.x, cy * S, (cz + oz) * S - parent.position.z);
    parent.add(obj);
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
      const ins = box(b.w - 2 * pv + 8, b.h - 2 * ph + 8, 10, mats[b.mat], 0.8); obj.add(ins);
      for (const [w, h, x, y, d] of [[pv, b.h, -(b.w - pv) / 2, 0, b.d], [pv, b.h, (b.w - pv) / 2, 0, b.d], [b.w - 2 * pv, ph, 0, (b.h - ph) / 2, 18], [b.w - 2 * pv, ph, 0, -(b.h - ph) / 2, 18]]) {
        const bar = box(w, h, d, alu, 2); bar.position.set(x * S, y * S, 0); obj.add(bar);
      }
    } else {
      obj = box(b.w, b.h, b.d, mats[b.mat], b.role === 'front' && !b.inner ? 1.6 : 1);
    }
    place(obj, b, cx, cy, cz);
    if (b.front) fronts.push(obj);
  }

  // ручки
  for (const h of L.handles) {
    if (h.kind === 'push') continue;
    const grp = h.grp ? groupFor(h.grp) : g, hg = new THREE.Group();
    if (h.kind === 'bar128' || h.kind === 'bar192') {
      const span = h.kind === 'bar128' ? 128 : 192;
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
    hg.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    hg.position.set((h.x + ox) * S - grp.position.x, h.y * S, (h.z + oz) * S - grp.position.z);
    grp.add(hg);
    fronts.push(hg);
  }

  // штанги
  for (const r of L.rails) {
    const len = r.x1 - r.x0;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(12 * S, 12 * S, len * S, 20), M.metalHex('#d5d8db', 0.2));
    rail.scale.z = 0.6;
    rail.rotation.z = Math.PI / 2;
    rail.position.set((r.x0 + len / 2 + ox) * S, r.y * S, (r.z + oz) * S);
    rail.castShadow = true;
    g.add(rail);
    for (const x of [r.x0 + 4, r.x1 - 4]) {
      const holder = box(8, 40, 40, M.metalHex('#d5d8db', 0.2), 2);
      holder.position.set((x + ox) * S, (r.y + 8) * S, (r.z + oz) * S);
      g.add(holder);
    }
  }

  // опоры
  for (const l of L.legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(17 * S, 14 * S, l.h * S, 24), metal);
    leg.position.set((l.x + ox) * S, (l.h / 2) * S, (l.z + oz) * S);
    leg.castShadow = true;
    g.add(leg);
  }

  // невидимые объёмы секций — для выбора мышью
  const pickers = L.secs.map((s) => {
    const y0 = s.cells[0]?.y0 ?? p.baseH + T, y1 = s.cells[s.cells.length - 1]?.y1 ?? p.H - T;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.cw * S, (y1 - y0) * S, p.D * S), new THREE.MeshBasicMaterial());
    m.position.set((s.x0 + s.cw / 2 + ox) * S, ((y0 + y1) / 2) * S, (p.D / 2 + oz) * S);
    m.visible = false;
    m.userData.sec = s.i;
    m.userData.noBounds = true;
    g.add(m);
    return m;
  });

  const anims = [...groups.values()].filter((x) => x.userData.anim);
  g.userData.pickers = pickers;
  g.userData.offset = { ox, oz };
  g.userData.open = {
    label: 'Открыть фасады', closeLabel: 'Закрыть фасады',
    set(k) {
      for (const grp of anims) {
        const a = grp.userData.anim, e0 = Math.min(1, Math.max(0, (k - a.delay) / (1 - 0.4)));
        const e = 1 - Math.pow(1 - e0, 3);
        if (a.type === 'door') grp.rotation.y = (a.side === 'left' ? -1 : 1) * 1.7 * e;
        else if (a.type === 'drawer') grp.position.z = a.travel * S * e;
        else if (a.type === 'slide') grp.position.x = a.dx * S * e;
      }
    },
  };
  g.userData.setFronts = (on) => { for (const f of fronts) f.visible = on; };
  return g;
}
