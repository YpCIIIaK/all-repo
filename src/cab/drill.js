/* ==========================================================================
   Ясень · Конструктор: присадка (сверление) деталей
   Координаты отверстий — в системе детали: u вдоль длины (от торца L0),
   v вдоль ширины (от кромки W0), в миллиметрах. Пласть A — лицевая для детали:
   внутренняя у корпусных панелей, тыльная у фасадов (туда ставятся петли).
   ========================================================================== */

const r = (v) => Math.round(v * 2) / 2;

// Как деталь лежит в пространстве: какая мировая ось идёт вдоль длины и ширины.
function frame(b) {
  switch (b.role) {
    case 'side': case 'divider': return { u: 'y', v: 'z', n: 'x' };
    case 'top': case 'bottom': case 'shelf': return { u: 'x', v: 'z', n: 'y' };
    case 'plinth': return { u: 'x', v: 'y', n: 'z' };
    case 'front': return b.kind === 'door' ? { u: 'y', v: 'x', n: 'z' } : { u: 'x', v: 'y', n: 'z' };
    case 'dbox': return b.dpart === 'side' ? { u: 'z', v: 'y', n: 'x' } : { u: 'x', v: 'y', n: 'z' };
    default: return null;
  }
}
const ORIGIN = { x: 'x', y: 'y', z: 'z' };

// Пласть A/B по направлению нормали в мире (+1 / −1).
function face(b, dir) {
  if (b.role === 'side') return (b.side === 'left') === (dir > 0) ? 'A' : 'B';
  if (b.role === 'divider') return dir < 0 ? 'A' : 'B';
  if (b.role === 'top') return dir > 0 ? 'B' : 'A';
  if (b.role === 'bottom') return dir > 0 ? 'A' : 'B';
  if (b.role === 'front') return dir < 0 ? 'A' : 'B';
  return dir > 0 ? 'A' : 'B';
}

function local(b, pt) {
  const f = frame(b);
  return { u: pt[f.u] - b[ORIGIN[f.u]], v: pt[f.v] - b[ORIGIN[f.v]] };
}

const confAlong = (depth) => (depth > 450 ? [50, depth / 2, depth - 50] : [50, depth - 50]);

/** Добавляет каждой детали массив holes и возвращает общее число отверстий. */
export function drill(L) {
  const { boxes, p, T } = L;
  const D = p.D;
  const H = (b, h) => { (b.holes ||= []).push({ ...h, u: r(h.u), v: r(h.v) }); };
  for (const b of boxes) b.holes = [];

  /* ---------- конфирматы ---------- */
  for (const j of L.joints) {
    const a = boxes[j.a], b = boxes[j.b];
    if (j.kind === 'side' || j.kind === 'shelf') {
      // сквозное Ø7 в вертикальной панели, Ø5×50 в торце горизонтальной
      const yC = b.y + T / 2;
      const end = a.x < b.x ? 'L0' : 'L1';
      const off = a.role === 'divider' && a.x < b.x ? 30 : 0;   // встречные конфирматы в перегородке разносим
      for (const v of confAlong(b.d)) {
        const z = b.z + v + (off && v > b.d / 2 ? -off : off);
        H(a, { face: face(a, a.x < b.x ? -1 : 1), ...local(a, { y: yC, z }), d: 7, depth: T, kind: 'confirmat', through: true });
        H(b, { face: end, u: end === 'L0' ? 0 : b.w, v: z - b.z, d: 5, depth: 50, kind: 'confirmat' });
      }
    } else if (j.kind === 'plinth') {
      const vs = b.h > 90 ? [b.h / 3, (2 * b.h) / 3] : [b.h / 2];
      const end = a.x < b.x ? 'L0' : 'L1';
      for (const v of vs) {
        H(a, { face: face(a, a.x < b.x ? -1 : 1), ...local(a, { y: b.y + v, z: b.z + T / 2 }), d: 7, depth: T, kind: 'confirmat', through: true });
        H(b, { face: end, u: end === 'L0' ? 0 : b.w, v, d: 5, depth: 50, kind: 'confirmat' });
      }
    } else if (j.kind === 'divider') {
      // крышка/дно держат перегородку: сквозное в горизонтальной панели, торец перегородки
      const xC = b.x + T / 2;
      const end = a.role === 'top' ? 'L1' : 'L0';
      for (const v of confAlong(D)) {
        H(a, { face: face(a, a.role === 'top' ? 1 : -1), ...local(a, { x: xC, z: v }), d: 7, depth: T, kind: 'confirmat', through: true });
        H(b, { face: end, u: end === 'L0' ? 0 : b.h, v, d: 5, depth: 50, kind: 'confirmat' });
      }
    }
  }

  /* ---------- по секциям: полкодержатели, планки петель, направляющие, штанги ---------- */
  for (const S of L.secs) {
    const left = boxes[S.left], right = boxes[S.right];
    const sidesOf = [[left, 1], [right, -1]];
    // полкодержатели System 32: под каждой съёмной полкой и ±32 мм для перестановки
    for (const C of S.cells) {
      if (C.shelf == null) continue;
      const sh = boxes[C.shelf];
      if (sh.fixed) continue;
      for (const [pn, dir] of sidesOf) {
        const fc = face(pn, dir), deep = pn.role === 'divider' ? 10 : 12, shift = pn.role === 'divider' && fc === 'B' ? 16 : 0;
        for (const dy of [-32, 0, 32]) {
          const y = sh.y - 7 + dy;
          if (y < C.y0 + 20 || y > sh.y + 40) continue;
          for (const v of [sh.z + 33 + shift, sh.z + sh.d - 33 - shift]) H(pn, { face: fc, ...local(pn, { y, z: v }), d: 5, depth: deep, kind: dy ? 'support-alt' : 'support' });
        }
      }
    }
    // направляющие ящиков
    for (const C of S.cells) {
      if (!C.drawer) continue;
      const { L: len, by, fz0 } = C.drawer;
      const dists = [...new Set([37, len >= 350 ? 37 + 192 : 0, len - 37].filter((d) => d > 0 && d < len))];
      for (const [pn, dir] of sidesOf) for (const d of dists) H(pn, { face: face(pn, dir), ...local(pn, { y: by + 30, z: fz0 - d }), d: 4, depth: 12, kind: 'slide' });
    }
  }
  for (const rl of L.rails) {
    const S = L.secs[rl.sec];
    for (const [pn, dir] of [[boxes[S.left], 1], [boxes[S.right], -1]]) for (const dz of [-16, 16]) H(pn, { face: face(pn, dir), ...local(pn, { y: rl.y + 8, z: rl.z + dz }), d: 4, depth: 12, kind: 'rail' });
  }

  /* ---------- двери: чашки петель Ø35, ответные планки ---------- */
  for (const b of boxes) {
    if (b.kind !== 'door' || !b.hinges || b.role === 'glass') continue;
    const pn = boxes[b.panel], dir = b.hingeSide === 'left' ? 1 : -1;
    const vCup = b.hingeSide === 'left' ? 22.5 : b.w - 22.5;
    const vDowel = b.hingeSide === 'left' ? vCup + 9.5 : vCup - 9.5;
    for (const hp of b.hinges) {
      H(b, { face: 'A', u: hp, v: vCup, d: 35, depth: 13, kind: 'hinge' });
      H(b, { face: 'A', u: hp - 22.5, v: vDowel, d: 8, depth: 13, kind: 'hinge-dowel' });
      H(b, { face: 'A', u: hp + 22.5, v: vDowel, d: 8, depth: 13, kind: 'hinge-dowel' });
      for (const du of [-16, 16]) H(pn, { face: face(pn, dir), ...local(pn, { y: b.y + hp + du, z: D - 37 }), d: 5, depth: 12, kind: 'plate' });
    }
  }

  /* ---------- ручки ---------- */
  const span = { bar128: 128, bar192: 192, knob: 0 }[p.handle];
  if (span != null) for (const h of L.handles) {
    if (h.y == null) continue;
    const b = boxes.find((x) => x.grp === h.grp && x.front && x.part);
    if (!b) continue;
    const pts = span ? (h.orient === 'v' ? [{ x: h.x, y: h.y - span / 2 }, { x: h.x, y: h.y + span / 2 }] : [{ x: h.x - span / 2, y: h.y }, { x: h.x + span / 2, y: h.y }]) : [{ x: h.x, y: h.y }];
    for (const pt of pts) H(b, { face: 'A', ...local(b, pt), d: 5, depth: b.d, kind: 'handle', through: true });
  }

  /* ---------- короба ящиков ---------- */
  for (const b of boxes) {
    if (b.role !== 'dbox') continue;
    const vs = b.h > 100 ? [b.h / 3, (2 * b.h) / 3] : [b.h / 2];
    if (b.dpart === 'side') for (const u of [T / 2, b.d - T / 2]) for (const v of vs) H(b, { face: 'B', u, v, d: 7, depth: T, kind: 'confirmat', through: true });
    else for (const end of ['L0', 'L1']) for (const v of vs) H(b, { face: end, u: end === 'L0' ? 0 : b.w, v, d: 5, depth: 50, kind: 'confirmat' });
  }

  let total = 0;
  for (const b of boxes) {
    b.holes.sort((a, c) => a.face.localeCompare(c.face) || a.u - c.u || a.v - c.v);
    total += b.holes.length;
  }
  return total;
}

export const HOLE_KINDS = {
  confirmat: 'Конфирмат', support: 'Полкодержатель', 'support-alt': 'Полкодержатель (перестановка)', slide: 'Направляющая ящика',
  rail: 'Штангодержатель', hinge: 'Чашка петли', 'hinge-dowel': 'Крепление петли', plate: 'Ответная планка петли', handle: 'Ручка',
};

export const holeSig = (holes) => holes.map((h) => `${h.face}${h.u},${h.v},${h.d},${h.depth}`).join(';');
