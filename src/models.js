/* ==========================================================================
   Ясень · процедурные 3D-модели мебели
   Единицы — метры. Начало координат — центр пятна на полу, перед изделия смотрит в +z.
   ========================================================================== */

import * as THREE from 'three';
import * as M from './materials.js';
import { softBox, puff, bend, taper, deform, finalize, merge, lathe, discProfile, rodGeometry } from './geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geom, mat, opt) {
  const m = new THREE.Mesh(finalize(geom, opt), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function put(parent, obj, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz);
  parent.add(obj);
  return obj;
}
// Подушка: мягкая коробка с мелкой сеткой и «надувом».
const cushion = (w, h, d, r, top, side, front) => puff(softBox(w, h, d, r, { step: 0.04, round: 5 }), top, side, front);
const panel = (w, h, d, r = 0.003) => softBox(w, h, d, r, { round: 2 });
const rod = (a, b, r, mat, seg) => mesh(rodGeometry(a, b, r, seg), mat);

function taperedLeg(h, rTop, rBot, mat) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 20);
  g.translate(0, h / 2, 0);
  return mesh(g, mat);
}

/* ================================ ДИВАНЫ ================================ */

function sofaOslo(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wd = M.wood(o.wood);
  const W = o.w, D = 0.95, legH = 0.13, baseH = 0.17, armW = 0.19, backD = 0.2;
  const lx = W / 2 - 0.1, lz = D / 2 - 0.1;
  const legs = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
  if (W > 2.1) legs.push([0, -lz], [0, lz]);
  for (const [x, z] of legs) put(g, taperedLeg(legH + 0.01, 0.022, 0.014, Wd), x, 0, z);
  put(g, mesh(softBox(W, baseH, D, 0.035, { round: 4 }), F), 0, legH + baseH / 2, 0);
  for (const s of [-1, 1]) put(g, mesh(cushion(armW, 0.47, D, 0.07, 0.006, 0.012, 0.004), F), s * (W / 2 - armW / 2), legH + 0.235, 0);
  put(g, mesh(cushion(W - 2 * armW + 0.02, 0.42, backD, 0.05, 0, 0.004, 0.01), F), 0, legH + baseH + 0.2, -D / 2 + backD / 2);
  const n = W < 2.0 ? 2 : 3, inner = W - 2 * armW, cw = inner / n - 0.006, sd = D - backD - 0.015, sh = 0.17;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + (inner / n) * (i + 0.5);
    put(g, mesh(cushion(cw, sh, sd, 0.06, 0.024, 0.012, 0.014), F), x, legH + baseH + sh / 2 - 0.004, D / 2 - sd / 2 - 0.004);
    put(g, mesh(cushion(cw, 0.47, 0.2, 0.075, 0.01, 0.012, 0.04), F), x, legH + baseH + sh + 0.2, -D / 2 + backD + 0.04, -0.17);
  }
  return g;
}

function sofaBergen(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Mt = M.metal(o.metal);
  const W = o.w, Dc = o.d, D = 0.98, cw = 0.92, legH = 0.06, baseH = 0.2, armW = 0.17, backD = 0.21;
  const zBack = -Dc / 2, zMain = zBack + D / 2, top = legH + baseH;
  for (const [x, z] of [[-W / 2 + 0.08, zBack + 0.08], [-W / 2 + 0.08, zBack + D - 0.08], [W / 2 - 0.08, zBack + 0.08], [W / 2 - 0.08, Dc / 2 - 0.08], [W / 2 - cw + 0.08, Dc / 2 - 0.08], [0, zBack + 0.08]])
    put(g, mesh(panel(0.05, legH, 0.05, 0.004), Mt), x, legH / 2, z);
  put(g, mesh(softBox(W - cw, baseH, D, 0.03, { round: 4 }), F), -cw / 2, legH + baseH / 2, zMain);
  put(g, mesh(softBox(cw, baseH, Dc, 0.03, { round: 4 }), F), W / 2 - cw / 2, legH + baseH / 2, 0);
  put(g, mesh(cushion(armW, 0.44, D, 0.06, 0.005, 0.01, 0.004), F), -W / 2 + armW / 2, legH + 0.22, zMain);
  put(g, mesh(cushion(armW, 0.4, Dc, 0.06, 0.005, 0.01, 0.004), F), W / 2 - armW / 2, legH + 0.2, 0);
  put(g, mesh(cushion(W - 2 * armW + 0.02, 0.36, backD, 0.05, 0, 0.004, 0.01), F), 0, top + 0.18, zBack + backD / 2);
  const sd = D - backD - 0.012, sh = 0.15, x0 = -W / 2 + armW, x1 = W / 2 - cw, mw = (x1 - x0) / 2;
  for (let i = 0; i < 2; i++) put(g, mesh(cushion(mw - 0.006, sh, sd, 0.055, 0.02, 0.01, 0.012), F), x0 + mw * (i + 0.5), top + sh / 2 - 0.004, zBack + backD + sd / 2 + 0.004);
  const chW = cw - armW - 0.006, chD = Dc - backD - 0.012;
  put(g, mesh(cushion(chW, sh, chD, 0.055, 0.022, 0.01, 0.01), F), W / 2 - armW - chW / 2 - 0.003, top + sh / 2 - 0.004, zBack + backD + chD / 2 + 0.004);
  const nb = 3, bw = (W - 2 * armW) / nb;
  for (let i = 0; i < nb; i++) put(g, mesh(cushion(bw - 0.006, 0.44, 0.19, 0.07, 0.01, 0.012, 0.04), F), -W / 2 + armW + bw * (i + 0.5), top + sh + 0.18, zBack + backD + 0.035, -0.16);
  if (o.side === 'left') g.scale.x = -1;
  return g;
}

function sofaMira(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wd = M.wood(o.wood);
  const W = o.w, D = 0.92, R = 1.55;
  const add = (geom, mat, x, y, z) => { geom.translate(x, y, z); bend(geom, R); geom.userData.dirty = true; g.add(mesh(geom, mat)); };
  add(softBox(W - 0.3, 0.07, D - 0.3, 0.012, { step: 0.06, round: 2 }), Wd, 0, 0.035, 0);
  add(cushion(W - 0.06, 0.3, D - 0.2, 0.09, 0.022, 0.01, 0.02), F, 0, 0.07 + 0.15, 0.09);
  const span = W + 0.06, n = Math.round(span / 0.15), cw = span / n;
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + cw * (i + 0.5), e = Math.abs(x) / (span / 2);
    const h = 0.74 * (1 - 0.38 * Math.pow(e, 5));
    add(cushion(cw - 0.003, h, 0.24, cw / 2 - 0.004, 0.004, 0.006, 0.02), F, x, 0.06 + h / 2, -D / 2 + 0.12);
  }
  return g;
}

/* ============================== КРЕСЛА И ПУФЫ ============================== */

function chairLund(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wd = M.wood(o.wood), t = 0.045;
  for (const s of [-1, 1]) {
    const x = s * 0.335;
    put(g, mesh(panel(t, 0.58, t), Wd), x, 0.29, 0.3);
    put(g, mesh(panel(t, 0.82, t), Wd), x, 0.405, -0.29, -0.2);
    put(g, mesh(softBox(0.075, 0.032, 0.76, 0.012, { round: 3 }), Wd), x, 0.595, 0.0);
    put(g, mesh(panel(0.03, 0.035, 0.6), Wd), x, 0.12, 0.0);
  }
  put(g, mesh(panel(0.64, 0.06, 0.035), Wd), 0, 0.3, 0.29);
  put(g, mesh(panel(0.64, 0.06, 0.035), Wd), 0, 0.3, -0.27);
  put(g, mesh(panel(0.64, 0.05, 0.03), Wd), 0, 0.72, -0.36, -0.2);
  put(g, mesh(cushion(0.62, 0.13, 0.62, 0.05, 0.022, 0.008, 0.01), F), 0, 0.39, 0.02);
  put(g, mesh(cushion(0.62, 0.5, 0.13, 0.05, 0.006, 0.01, 0.03), F), 0, 0.69, -0.24, -0.26);
  return g;
}

function chairKokon(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wd = M.wood(o.wood);
  put(g, mesh(lathe(discProfile(0.33, 0.035, 0, 0.008), 64), Wd), 0, 0, 0);
  put(g, mesh(lathe([[0, 0.03], [0.37, 0.03], [0.405, 0.05], [0.42, 0.09], [0.42, 0.27], [0.41, 0.3], [0, 0.3]], 72), F, { smooth: true }), 0, 0, 0);
  put(g, mesh(lathe([[0, 0.3], [0.28, 0.3], [0.31, 0.33], [0.315, 0.37], [0.3, 0.41], [0.25, 0.428], [0, 0.432]], 72), F, { smooth: true }), 0, 0, 0);
  const shape = new THREE.Shape(), a0 = Math.PI / 2 - 2.05, a1 = Math.PI / 2 + 2.05, ro = 0.38, ri = 0.345;
  shape.absarc(0, 0, ro, a0, a1, false);
  shape.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
  shape.absarc(0, 0, ri, a1, a0, true);
  shape.closePath();
  const bt = 0.04;
  const back = new THREE.ExtrudeGeometry(shape, { depth: 0.46 - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.04, bevelSegments: 6, curveSegments: 72 });
  back.rotateX(-Math.PI / 2);
  put(g, mesh(back, F, { smooth: true }), 0, 0.27 + bt, 0);
  return g;
}

function poufCloud(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), H = 0.43;
  const geom = lathe([[0, 0], [0.2, 0], [0.255, 0.035], [0.283, 0.11], [0.29, 0.21], [0.282, 0.31], [0.245, 0.39], [0.13, 0.425], [0, H]], 96);
  deform(geom, (v) => {
    const th = Math.atan2(v.z, v.x), s = Math.sin(Math.PI * Math.min(1, Math.max(0, v.y / H)));
    const k = 1 - 0.055 * (0.5 - 0.5 * Math.cos(10 * th)) * s;
    v.x *= k; v.z *= k;
  });
  put(g, mesh(geom, F, { smooth: true }), 0, 0, 0);
  return g;
}

/* ================================ СТУЛЬЯ ================================ */

function chairVena(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wd = M.wood(o.wood);
  for (const s of [-1, 1]) {
    put(g, mesh(taper(panel(0.036, 0.44, 0.036), 0.7), Wd), s * 0.19, 0.22, 0.18);
    put(g, mesh(taper(panel(0.036, 0.88, 0.036), 0.8), Wd), s * 0.19, 0.435, -0.2, -0.1);
    put(g, rod(V(s * 0.19, 0.16, 0.17), V(s * 0.19, 0.16, -0.18), 0.009, Wd), 0, 0, 0);
  }
  put(g, rod(V(-0.18, 0.2, 0.18), V(0.18, 0.2, 0.18), 0.009, Wd), 0, 0, 0);
  put(g, mesh(panel(0.44, 0.035, 0.42, 0.006), Wd), 0, 0.455, 0);
  put(g, mesh(cushion(0.41, 0.05, 0.39, 0.022, 0.012, 0.004, 0.004), F), 0, 0.495, 0.005);
  const rail = softBox(0.42, 0.09, 0.022, 0.008, { step: 0.03, round: 3 });
  bend(rail, 0.45);
  put(g, mesh(rail, Wd, { smooth: true }), 0, 0.8, -0.247, -0.1);
  const slat = softBox(0.38, 0.04, 0.018, 0.006, { step: 0.03, round: 3 });
  bend(slat, 0.45);
  put(g, mesh(slat, Wd, { smooth: true }), 0, 0.63, -0.228, -0.1);
  return g;
}

function chairFjord(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Mt = M.metal(o.metal);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(rod(V(sx * 0.18, 0.415, sz * 0.17), V(sx * 0.225, 0, sz * 0.215), 0.011, Mt, 10));
  for (const s of [-1, 1]) {
    g.add(rod(V(s * 0.18, 0.415, -0.17), V(s * 0.18, 0.415, 0.17), 0.008, Mt, 8));
    g.add(rod(V(-0.18, 0.415, s * 0.17), V(0.18, 0.415, s * 0.17), 0.008, Mt, 8));
  }
  const seat = cushion(0.49, 0.07, 0.47, 0.032, 0.012, 0.004, 0.006);
  put(g, mesh(seat, F), 0, 0.46, 0.01);
  const back = softBox(0.54, 0.36, 0.055, 0.025, { step: 0.03, round: 4 });
  puff(back, 0.004, 0.004, 0.01);
  bend(back, 0.33);
  put(g, mesh(back, F, { smooth: true }), 0, 0.68, -0.225, -0.14);
  return g;
}

function stoolBar(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Mt = M.metal(o.metal), H = o.h;
  const seatY = H - 0.075;
  put(g, mesh(lathe([[0, 0], [0.17, 0], [0.188, 0.012], [0.195, 0.04], [0.185, 0.068], [0.16, 0.08], [0, 0.083]], 64), F, { smooth: true }), 0, seatY, 0);
  put(g, mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.014, 40), Mt), 0, seatY - 0.007, 0);
  const top = 0.11, bot = 0.21, ring = 0.28;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    g.add(rod(V(Math.cos(a) * top, seatY - 0.01, Math.sin(a) * top), V(Math.cos(a) * bot, 0, Math.sin(a) * bot), 0.012, Mt, 10));
  }
  const rr = top + (bot - top) * (1 - ring / (seatY - 0.01));
  const tor = new THREE.TorusGeometry(rr, 0.009, 8, 64);
  tor.rotateX(Math.PI / 2);
  put(g, mesh(tor, Mt), 0, ring, 0);
  return g;
}

/* ================================ СТОЛЫ ================================ */

function tableTur(o) {
  const g = new THREE.Group(), Wd = M.wood(o.wood), L = o.w, D = o.d, H = 0.75;
  put(g, mesh(softBox(L, 0.04, D, 0.008, { round: 3 }), Wd), 0, H - 0.02, 0);
  const lx = L / 2 - 0.12, lz = D / 2 - 0.1;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) put(g, mesh(taper(panel(0.07, H - 0.04, 0.07, 0.006), 0.62), Wd), x, (H - 0.04) / 2, z);
  for (const s of [-1, 1]) {
    put(g, mesh(panel(2 * lx - 0.06, 0.08, 0.024), Wd), 0, H - 0.08, s * lz);
    put(g, mesh(panel(0.024, 0.08, 2 * lz - 0.06), Wd), s * lx, H - 0.08, 0);
  }
  return g;
}

function tableLuna(o) {
  const g = new THREE.Group(), St = M.stone(o.stone), Wd = M.wood(o.wood), R = o.r, H = 0.38, k = R / 0.4;
  put(g, mesh(lathe(discProfile(R, 0.032, H - 0.032, 0.012), 96), St), 0, 0, 0);
  const prof = [[0, 0], [0.22 * k, 0], [0.226 * k, 0.008], [0.2 * k, 0.04], [0.12 * k, 0.14], [0.09 * k, 0.22], [0.105 * k, 0.29], [0.16 * k, 0.336], [0.17 * k, H - 0.032], [0, H - 0.032]];
  put(g, mesh(lathe(prof, 72), Wd, { smooth: true }), 0, 0, 0);
  return g;
}

function tablePlato(o) {
  const g = new THREE.Group(), Wd = M.wood(o.wood), Mt = M.metal(o.metal), L = 1.1, D = 0.6, H = 0.42, t = 0.022;
  const px = L / 2 - t / 2, pz = D / 2 - t / 2;
  for (const [x, z] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz]]) put(g, mesh(panel(t, H, t, 0.002), Mt), x, H / 2, z);
  for (const y of [H - t / 2, 0.09]) for (const s of [-1, 1]) {
    put(g, mesh(panel(L - 2 * t, t, t, 0.002), Mt), 0, y, s * pz);
    put(g, mesh(panel(t, t, D - 2 * t, 0.002), Mt), s * px, y, 0);
  }
  put(g, mesh(panel(L - 2 * t, 0.024, D - 2 * t, 0.003), Wd), 0, H - 0.012, 0);
  put(g, mesh(panel(L - 2 * t, 0.02, D - 2 * t, 0.003), Wd), 0, 0.09 + t / 2 + 0.01, 0);
  return g;
}

function tableDrop(o) {
  const g = new THREE.Group(), St = M.stone(o.stone), Mt = M.metal(o.metal);
  put(g, mesh(lathe(discProfile(0.17, 0.028, 0, 0.01), 72), St), 0, 0, 0);
  put(g, mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.47, 24), Mt), 0, 0.028 + 0.235, 0);
  put(g, mesh(lathe(discProfile(0.225, 0.026, 0.494, 0.01), 96), St), 0, 0, 0);
  return g;
}

/* ================================ ХРАНЕНИЕ ================================ */

function carcass(g, W, H, D, base, t, mat) {
  put(g, mesh(panel(W, t, D, 0.004), mat), 0, H - t / 2, 0);
  put(g, mesh(panel(W - 2 * t, t, D - 0.01), mat), 0, base + t / 2, 0);
  for (const s of [-1, 1]) put(g, mesh(panel(t, H - base - t, D, 0.003), mat), s * (W / 2 - t / 2), base + (H - base - t) / 2, 0);
  put(g, mesh(panel(W - 2 * t, H - base - 2 * t, 0.008), M.misc.interior()), 0, base + (H - base) / 2, -D / 2 + 0.006);
}

function dresserNordic(o) {
  const g = new THREE.Group(), Wd = M.wood(o.wood), Mt = M.metal(o.metal);
  const W = o.w, H = 0.84, D = 0.45, legH = 0.15, t = 0.02;
  carcass(g, W, H, D, legH, t, Wd);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, taperedLeg(legH + 0.01, 0.02, 0.012, Wd), sx * (W / 2 - 0.07), 0, sz * (D / 2 - 0.07), -sz * 0.1, 0, sx * 0.1);
  const cols = W > 1 ? 2 : 1, rows = 3, iw = W - 2 * t, ih = H - legH - 2 * t, gap = 0.004;
  const fw = iw / cols - gap, fh = ih / rows - gap, drawers = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const d = new THREE.Group(), depth = D - 0.06;
    put(d, mesh(panel(fw, fh, 0.02, 0.003), Wd), 0, 0, 0);
    for (const s of [-1, 1]) put(d, mesh(panel(0.012, fh - 0.05, depth), M.misc.interior()), s * (fw / 2 - 0.03), -0.012, -depth / 2 - 0.01);
    put(d, mesh(panel(fw - 0.06, 0.008, depth), M.misc.interior()), 0, -fh / 2 + 0.02, -depth / 2 - 0.01);
    put(d, mesh(panel(fw - 0.06, fh - 0.05, 0.012), M.misc.interior()), 0, -0.012, -depth - 0.01);
    const knob = mesh(lathe([[0, 0], [0.011, 0], [0.011, 0.012], [0.017, 0.018], [0.017, 0.024], [0, 0.026]], 24), Mt, { smooth: true });
    put(d, knob, cols === 1 ? 0 : (c === 0 ? fw / 2 - 0.08 : -fw / 2 + 0.08), 0, 0.01, Math.PI / 2);
    const x = -iw / 2 + (iw / cols) * (c + 0.5), y = legH + t + (ih / rows) * (rows - r - 0.5), z = D / 2 - 0.012;
    put(g, d, x, y, z);
    drawers.push({ obj: d, z, delay: r * 0.12 + c * 0.06 });
  }
  g.userData.open = {
    label: 'Открыть ящики', closeLabel: 'Закрыть ящики',
    set(k) { for (const d of drawers) { const e = Math.min(1, Math.max(0, (k - d.delay) / (1 - 0.3))); d.obj.position.z = d.z + 0.3 * (1 - Math.pow(1 - e, 3)); } },
  };
  return g;
}

function tvKadr(o) {
  const g = new THREE.Group(), Wd = M.wood(o.wood);
  const W = o.w, H = 0.56, D = 0.42, base = 0.1, t = 0.02;
  carcass(g, W, H, D, base, t, Wd);
  put(g, mesh(panel(W - 0.12, base, D - 0.1, 0.004), M.wood('ash-black')), 0, base / 2, -0.02);
  const n = W > 1.9 ? 4 : 3, iw = W - 2 * t;
  for (let k = 1; k < n; k++) put(g, mesh(panel(t, H - base - 2 * t, D - 0.04), Wd), -iw / 2 + (iw / n) * k, base + (H - base) / 2, -0.01);
  put(g, mesh(panel(iw, t, D - 0.04), Wd), 0, base + (H - base) / 2, -0.01);
  const gap = 0.004, dw = iw / n - gap, dh = H - base - 2 * t - gap, doors = [];
  for (let k = 0; k < n; k++) {
    const parts = [finalize(panel(dw, dh, 0.014, 0.002))], m = Math.floor(dw / 0.024), fr = (dw / m) / 2;
    for (let i = 0; i < m; i++) {
      const fl = new THREE.CylinderGeometry(fr, fr, dh - 0.016, 10, 1, true, -Math.PI / 2, Math.PI);
      fl.translate(-dw / 2 + fr * (2 * i + 1), 0, 0.007);
      parts.push(finalize(fl));
    }
    const leftHinge = k < n / 2;
    const door = new THREE.Mesh(merge(parts), Wd);
    door.castShadow = door.receiveShadow = true;
    door.position.x = leftHinge ? dw / 2 : -dw / 2;
    const pivot = new THREE.Group();
    pivot.add(door);
    const x0 = -iw / 2 + (iw / n) * (k + 0.5) + (leftHinge ? -dw / 2 : dw / 2);
    put(g, pivot, x0, base + t + gap / 2 + dh / 2, D / 2 - 0.008);
    doors.push({ obj: pivot, dir: leftHinge ? -1 : 1, delay: k * 0.08 });
  }
  g.userData.open = {
    label: 'Открыть дверцы', closeLabel: 'Закрыть дверцы',
    set(k) { for (const d of doors) { const e = Math.min(1, Math.max(0, (k - d.delay) / 0.76)); d.obj.rotation.y = d.dir * 1.75 * (1 - Math.pow(1 - e, 3)); } },
  };
  return g;
}

const BOOKS = ['#8c5a3c', '#2f4a3d', '#c9b79c', '#a23b2a', '#3d4a5c', '#d8cfc0', '#6b6b5e', '#b98a3e', '#4f3b35', '#e3dccd'];

function decorShelf(g, x0, x1, y, depth, seed) {
  const r = M.rng(seed);
  let x = x0;
  while (x < x1 - 0.06) {
    const pick = r();
    if (pick < 0.62) {
      const n = 3 + Math.floor(r() * 7);
      for (let i = 0; i < n && x < x1 - 0.04; i++) {
        const th = 0.022 + r() * 0.025, h = 0.17 + r() * 0.1, d = 0.14 + r() * 0.06;
        put(g, mesh(panel(th, h, d, 0.002), M.misc.book(BOOKS[Math.floor(r() * BOOKS.length)])), x + th / 2, y + h / 2, -depth / 2 + d / 2 + 0.03);
        x += th + 0.002;
      }
      x += 0.03 + r() * 0.05;
    } else if (pick < 0.8) {
      let yy = y;
      const n = 2 + Math.floor(r() * 3), w = 0.17 + r() * 0.05;
      for (let i = 0; i < n; i++) {
        const th = 0.025 + r() * 0.02;
        put(g, mesh(panel(w - i * 0.008, th, 0.15 + r() * 0.04, 0.002), M.misc.book(BOOKS[Math.floor(r() * BOOKS.length)])), x + w / 2, yy + th / 2, 0, 0, (r() - 0.5) * 0.2);
        yy += th;
      }
      x += w + 0.05;
    } else {
      const h = 0.14 + r() * 0.14, rr = 0.045 + r() * 0.03, cer = Object.keys(M.CERAMICS)[Math.floor(r() * 4)];
      const prof = [[0, 0], [rr * 0.7, 0], [rr, h * 0.35], [rr * 0.75, h * 0.8], [rr * 0.45, h * 0.92], [rr * 0.5, h], [rr * 0.42, h], [rr * 0.38, h * 0.9]];
      put(g, mesh(lathe(prof, 32), M.ceramic(cer), { smooth: true }), x + rr, y, 0);
      x += rr * 2 + 0.06;
    }
  }
}

function shelfRitm(o) {
  const g = new THREE.Group(), Wd = M.wood(o.wood), Mt = M.metal(o.metal), W = o.w, H = 1.8, D = 0.34, t = 0.02;
  const px = W / 2 - t / 2, pz = D / 2 - t / 2;
  for (const [x, z] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz]]) put(g, mesh(panel(t, H, t, 0.002), Mt), x, H / 2, z);
  const ys = [0.05, 0.47, 0.89, 1.31, 1.76];
  ys.forEach((y, i) => {
    put(g, mesh(panel(W - 0.004, 0.024, D - 0.004, 0.003), Wd), 0, y, 0);
    for (const s of [-1, 1]) put(g, mesh(panel(t * 0.6, t * 0.6, D - 2 * t, 0.001), Mt), s * px, y - 0.018, 0);
    if (o.decor && i < ys.length - 1) decorShelf(g, -W / 2 + 0.04, W / 2 - 0.04, y + 0.012, D, 7 + i * 13 + Math.round(W * 10));
  });
  if (o.decor) decorShelf(g, -W / 2 + 0.05, W / 2 - 0.05, ys[4] + 0.012, D, 99);
  return g;
}

/* ================================ КРОВАТИ ================================ */

function bedSon(o) {
  const g = new THREE.Group(), F = M.fabric(o.fabric), Wm = o.w, L = 2.0;
  const Wt = Wm + 0.12, Lb = L + 0.08, hbD = 0.1, Lt = Lb + hbD, zHead = -Lt / 2 + hbD / 2, zBase = -Lt / 2 + hbD + Lb / 2;
  for (const [x, z] of [[-Wt / 2 + 0.1, -Lt / 2 + 0.2], [Wt / 2 - 0.1, -Lt / 2 + 0.2], [-Wt / 2 + 0.1, Lt / 2 - 0.1], [Wt / 2 - 0.1, Lt / 2 - 0.1]])
    put(g, mesh(panel(0.05, 0.06, 0.05), M.misc.rubber()), x, 0.03, z);
  put(g, mesh(softBox(Wt, 0.26, Lb, 0.04, { round: 4 }), F), 0, 0.06 + 0.13, zBase);
  const n = Math.round(Wt / 0.14), cw = Wt / n;
  for (let i = 0; i < n; i++) put(g, mesh(cushion(cw - 0.003, 1.02, hbD, cw / 2 - 0.004, 0.004, 0.006, 0.018), F), -Wt / 2 + cw * (i + 0.5), 0.06 + 0.51, zHead);
  const top = 0.06 + 0.26;
  put(g, mesh(softBox(Wm, 0.2, L, 0.05, { round: 4 }), M.misc.linen()), 0, top + 0.1, zBase);
  const mTop = top + 0.2, dl = L * 0.66, zDuv = zBase + L / 2 - dl / 2 + 0.03;
  const duv = cushion(Wm + 0.42, 0.06, dl, 0.025, 0.02, 0, 0.005);
  deform(duv, (v) => {
    const over = Math.abs(v.x) - Wm / 2;
    if (over > 0) { v.y -= over * 1.15; v.x = Math.sign(v.x) * (Wm / 2 + over * 0.28 + 0.01); }
    const fz = v.z - (dl / 2 - 0.06);
    if (fz > 0) { v.y -= fz * 1.2; v.z = dl / 2 - 0.06 + fz * 0.4; }
  });
  put(g, mesh(duv, M.misc.duvet()), 0, mTop + 0.02, zDuv);
  put(g, mesh(cushion(Wm + 0.06, 0.035, 0.42, 0.015, 0.008, 0, 0.004), M.misc.throw()), 0, mTop + 0.06, zBase + L / 2 - 0.45);
  const np = Wm >= 1.6 ? 2 : 2, pw = Math.min(0.7, Wm / np - 0.06);
  for (let i = 0; i < np; i++) {
    const x = -Wm / 2 + (Wm / np) * (i + 0.5);
    put(g, mesh(cushion(pw, 0.16, 0.42, 0.06, 0.04, 0.01, 0.01), M.misc.linen()), x, mTop + 0.12, zBase - L / 2 + 0.28, -0.75);
  }
  return g;
}

/* ================================ СВЕТ ================================ */

function lightRig(g, mats, pos, power) {
  const light = new THREE.PointLight('#ffd7a3', 0, 6, 2);
  light.position.copy(pos);
  g.add(light);
  g.userData.light = {
    on: false,
    set(on) {
      this.on = on;
      light.intensity = on ? power : 0;
      for (const [m, lo, hi] of mats) m.emissiveIntensity = on ? hi : lo;
    },
  };
}

function lampKupol(o) {
  const g = new THREE.Group(), St = M.stone(o.stone), Mt = M.metal(o.metal);
  put(g, mesh(lathe(discProfile(0.17, 0.05, 0, 0.012), 64), St), 0, 0, 0);
  const curve = new THREE.CubicBezierCurve3(V(0, 0.05, 0), V(0, 1.75, 0), V(0.55, 2.12, 0), V(1.22, 1.86, 0));
  g.add(mesh(new THREE.TubeGeometry(curve, 160, 0.012, 12), Mt));
  const sx = 1.3, sy = 1.78, R = 0.21;
  const dome = []; for (let k = 0; k <= 16; k++) { const a = Math.PI / 2 - (k / 16) * (Math.PI / 2 - 0.08); dome.push([R * Math.sin(a), R * Math.cos(a)]); }
  put(g, mesh(lathe(dome, 64), Mt, { smooth: true }), sx, sy - R * 0.55, 0);
  const inner = M.misc.shadeInner();
  put(g, mesh(lathe(dome.map(([r, y]) => [r * 0.985, y * 0.985]), 64), inner, { smooth: true }), sx, sy - R * 0.55, 0);
  const bulb = M.misc.bulb();
  put(g, mesh(new THREE.SphereGeometry(0.045, 24, 16), bulb), sx, sy - R * 0.45, 0);
  g.add(rod(V(1.22, 1.86, 0), V(sx, sy - R * 0.55 + R, 0), 0.01, Mt));
  lightRig(g, [[inner, 0, 0.9], [bulb, 0.2, 6]], V(sx, sy - R * 0.6, 0), 5);
  return g;
}

function lampGrib(o) {
  const g = new THREE.Group(), Cr = M.ceramic(o.ceramic);
  put(g, mesh(lathe([[0, 0], [0.085, 0], [0.09, 0.01], [0.082, 0.022], [0.035, 0.05], [0.024, 0.11], [0.021, 0.2], [0, 0.21]], 48), Cr, { smooth: true }), 0, 0, 0);
  const opal = M.misc.opal(), R = 0.15, prof = [];
  for (let k = 0; k <= 18; k++) { const a = Math.PI / 2 - (k / 18) * (Math.PI / 2 - 0.02); prof.push([R * Math.sin(a), 0.2 + 0.14 * Math.cos(a)]); }
  put(g, mesh(lathe(prof, 64), opal, { smooth: true }), 0, 0, 0);
  const bulb = M.misc.bulb();
  put(g, mesh(new THREE.SphereGeometry(0.03, 20, 12), bulb), 0, 0.23, 0);
  lightRig(g, [[opal, 0, 1.4], [bulb, 0.2, 5]], V(0, 0.22, 0), 2);
  return g;
}

/* ================================ ДЕКОР ================================ */

function rugDyuna(o) {
  const g = new THREE.Group();
  const m = mesh(softBox(o.w, 0.014, o.d, 0.006, { round: 2 }), M.rug(o.rug), { uv: 'top' });
  m.castShadow = false;
  put(g, m, 0, 0.007, 0);
  g.userData.flat = true;
  return g;
}

function plantOlive(o) {
  const g = new THREE.Group(), Cr = M.ceramic(o.ceramic), r = M.rng(17);
  put(g, mesh(lathe([[0, 0], [0.12, 0], [0.13, 0.01], [0.165, 0.2], [0.175, 0.32], [0.17, 0.335], [0.158, 0.335], [0.155, 0.31], [0.14, 0.12], [0, 0.11]], 56), Cr, { smooth: true }), 0, 0, 0);
  put(g, mesh(new THREE.CylinderGeometry(0.153, 0.153, 0.01, 40), M.misc.soil()), 0, 0.3, 0);
  const bark = M.misc.bark(), tips = [];
  const trunk = new THREE.CatmullRomCurve3([V(0, 0.29, 0), V(0.02, 0.6, 0.01), V(-0.01, 0.85, 0.0), V(0.01, 1.0, 0.02)]);
  g.add(mesh(new THREE.TubeGeometry(trunk, 40, 0.022, 8), bark));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r() * 0.6, y0 = 0.7 + r() * 0.3, len = 0.22 + r() * 0.15;
    const start = trunk.getPoint((y0 - 0.29) / 0.71);
    const tip = V(start.x + Math.cos(a) * len, y0 + 0.2 + r() * 0.3, start.z + Math.sin(a) * len);
    const mid = start.clone().lerp(tip, 0.5); mid.y += 0.05;
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, mid, tip]), 16, 0.009, 6), bark));
    tips.push(tip);
  }
  tips.push(V(0.01, 1.32, 0.02));
  const leafG = new THREE.SphereGeometry(1, 8, 4);
  leafG.scale(0.05, 0.004, 0.011);
  leafG.translate(0.045, 0, 0);
  const count = 420, leaves = new THREE.InstancedMesh(leafG, M.misc.leaf(), count);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = tips[i % tips.length];
    const p = V((r() - 0.5) * 0.34, (r() - 0.5) * 0.3, (r() - 0.5) * 0.34);
    if (p.length() > 0.19) p.multiplyScalar(0.19 / p.length());
    p.add(t);
    e.set((r() - 0.5) * 1.2, r() * Math.PI * 2, -0.3 - r() * 0.8);
    q.setFromEuler(e);
    mtx.compose(p, q, V(1, 1, 1).multiplyScalar(0.8 + r() * 0.5));
    leaves.setMatrixAt(i, mtx);
    leaves.setColorAt(i, c.setHSL(0.2 + r() * 0.05, 0.22 + r() * 0.12, 0.3 + r() * 0.14));
  }
  leaves.castShadow = true; leaves.receiveShadow = true;
  g.add(leaves);
  return g;
}

/* ============================== реестр ============================== */

export const MODELS = {
  oslo: sofaOslo, bergen: sofaBergen, mira: sofaMira,
  lund: chairLund, kokon: chairKokon, cloud: poufCloud,
  vena: chairVena, fjord: chairFjord, bar: stoolBar,
  tur: tableTur, luna: tableLuna, plato: tablePlato, drop: tableDrop,
  nordic: dresserNordic, kadr: tvKadr, ritm: shelfRitm,
  son: bedSon, kupol: lampKupol, grib: lampGrib, dyuna: rugDyuna, olive: plantOlive,
};

export function disposeObject(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
