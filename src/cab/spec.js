/* ==========================================================================
   Ясень · Конструктор: спецификация деталей, раскрой листов, масса, стоимость
   ========================================================================== */

import { DECORS, ENAMELS, ENAMEL_M2, SHEET, HDF, DENSITY } from './model.js';
import { drill, holeSig, HOLE_KINDS } from './drill.js';

const HDF_SHEET = 1450, CUT_M = 45, EDGE2_M = 58, EDGE04_M = 24, DRILL = 9, ASSEMBLY = 0.12, PACK = 1800;

// Чем является каждый материал в спецификации и раскрое.
export function materialsOf(p) {
  const T = p.th || 16;
  const body = DECORS[p.body];
  const front = p.front.kind === 'enamel' ? ENAMELS[p.front.id] : DECORS[p.front.id];
  const mats = {
    body:   { key: `ldsp${T}:${p.body}`, name: `ЛДСП ${T} мм · ${body.name}`, grain: !!body.wood, sheet: Math.round(body.sheet * (T === 18 ? 1.12 : 1)), hex: body.hex, dens: DENSITY.ldsp, t: T },
    drawer: { key: 'ldsp16:white', name: `ЛДСП 16 мм · ${DECORS.white.name}`, grain: false, sheet: DECORS.white.sheet, hex: DECORS.white.hex, dens: DENSITY.ldsp, t: 16 },
    hdf:    { key: 'hdf', name: `ХДФ ${HDF} мм · ${p.body === 'white' || !DECORS[p.body].wood ? 'белая' : 'в тон корпуса'}`, grain: false, sheet: HDF_SHEET, hex: '#efece6', dens: DENSITY.hdf, t: HDF },
    front:  p.front.kind === 'enamel'
      ? { key: 'mdf19:' + p.front.id, name: `МДФ 19 мм · эмаль «${front.name}»`, grain: false, m2: ENAMEL_M2, hex: front.hex, enamel: true, dens: DENSITY.mdf, t: 19 }
      : { key: `ldsp${T}:${p.front.id}`, name: `ЛДСП ${T} мм · ${front.name}`, grain: !!front.wood, sheet: Math.round(front.sheet * (T === 18 ? 1.12 : 1)), hex: front.hex, dens: DENSITY.ldsp, t: T },
  };
  mats.enamel = mats.front;
  return mats;
}

const edgeKey = (e) => ['l1', 'l2', 'w1', 'w2'].map((k) => e[k] || 0).join('/');

// Пильный размер: чистовой минус толщина кромки 2 мм на соответствующих торцах.
export function cutSize(len, wid, e) {
  const minus = (a, b) => (a >= 1 ? a : 0) + (b >= 1 ? b : 0);
  return { len: len - minus(e.w1, e.w2), wid: wid - minus(e.l1, e.l2) };
}

/**
 * Сводная спецификация: одинаковые детали (по размерам, кромке и присадке) складываются в строку.
 * Каждой детали в L.boxes проставляется номер строки partNo.
 */
export function partsTable(L) {
  if (!L._drilled) { L.holesTotal = drill(L); L._drilled = true; }
  const mats = materialsOf(L.p);
  const rows = [];
  for (const b of L.boxes) {
    if (!b.part) continue;
    const m = mats[b.mat];
    const len = Math.round(b.part.len), wid = Math.round(b.part.wid);
    const holes = b.holes || [];
    const key = [b.part.name, m.key, len, wid, edgeKey(b.part.e), b.part.note || '', holeSig(holes)].join('|');
    let r = rows.find((x) => x.key === key);
    if (r) { r.qty++; r.boxes.push(b.id); }
    else {
      const t = b.part.t || m.t;
      const cut = cutSize(len, wid, b.part.e);
      r = { key, name: b.part.name, mat: m, matKey: m.key, len, wid, t, cut, e: b.part.e, note: b.part.note || '', holes, qty: 1, boxes: [b.id], kg: (len * wid * t * m.dens) / 1e9 };
      rows.push(r);
    }
  }
  const order = (r) => (r.mat.enamel || /^(Двер|Фасад|Вставка|Добор)/.test(r.name) ? 2 : r.matKey === 'hdf' ? 3 : r.name.startsWith('Ящик') ? 1 : 0);
  rows.sort((a, b) => order(a) - order(b) || a.matKey.localeCompare(b.matKey) || b.len * b.wid - a.len * a.wid);
  rows.forEach((r, i) => { r.no = i + 1; for (const id of r.boxes) L.boxes[id].partNo = r.no; });
  return rows;
}

// Кромка: длинные стороны — l1/l2, короткие — w1/w2.
export function edgeTotals(rows) {
  const t = { 2: 0, 0.4: 0 };
  for (const r of rows) {
    for (const k of ['l1', 'l2']) if (r.e[k]) t[r.e[k]] += (r.len * r.qty) / 1000;
    for (const k of ['w1', 'w2']) if (r.e[k]) t[r.e[k]] += (r.wid * r.qty) / 1000;
  }
  return { e2: t[2] * 1.05, e04: t[0.4] * 1.05 };   // +5 % на свесы и торцовку
}

export const edgeLabel = (e) => {
  const l = [e.l1, e.l2].filter(Boolean), w = [e.w1, e.w2].filter(Boolean);
  if (!l.length && !w.length) return '—';
  const s = [];
  if (l.length) s.push(`${l.length === 2 ? '2' : '1'}×Д ${String(l[0]).replace('.', ',')}`);
  if (w.length) s.push(`${w.length === 2 ? '2' : '1'}×Ш ${String(w[0]).replace('.', ',')}`);
  return s.join(', ');
};

/* ------------------------------ масса ------------------------------ */

export function massOf(L, rows = partsTable(L)) {
  const panels = rows.reduce((a, r) => a + r.kg * r.qty, 0);
  let extra = 0;
  for (const b of L.boxes) {
    if (b.role === 'glass') extra += b.mass || 0;
    if (b.mirror) extra += ((b.w - 60) * (b.h - 60) * 4 * DENSITY.mirror) / 1e9;
  }
  const hw = panels * 0.05 + L.hw.filter((h) => /Направляющ|Профиль двери|Брючница|Корзина|Полка для обуви/.test(h.name)).reduce((a, h) => a + h.qty * 1.2, 0);
  return { panels, extra, hw, total: panels + extra + hw };
}

/* ------------------------------ раскрой ------------------------------ */

/**
 * Полосовой (гильотинный) раскрой по пильным размерам: детали укладываются в полосы поперёк листа,
 * полоса выбирается по наименьшему отходу. Для декоров с текстурой дерева деталь кладётся только вдоль волокон.
 */
export function nest(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.matKey)) groups.set(r.matKey, { mat: r.mat, items: [] });
    for (let q = 0; q < r.qty; q++) groups.get(r.matKey).items.push({ no: r.no, len: r.cut.len, wid: r.cut.wid, name: r.name });
  }
  const UL = SHEET.L - 2 * SHEET.trim, UW = SHEET.W - 2 * SHEET.trim, K = SHEET.kerf;
  const result = [];
  for (const { mat, items } of groups.values()) {
    const parts = items.map((it) => {
      let w = it.len, h = it.wid, rot = false;
      if (!mat.grain && h > w) { [w, h] = [h, w]; rot = true; }
      if (w > UL && !mat.grain && w <= UW) { [w, h] = [h, w]; rot = !rot; }
      return { ...it, w, h, rot, over: w > UL || h > UW };
    }).sort((a, b) => b.h - a.h || b.w - a.w);
    const sheets = [], over = [];
    for (const pt of parts) {
      if (pt.over) { over.push(pt); continue; }
      let placed = false;
      for (const sh of sheets) {
        let best = null;
        for (const st of sh.strips) if (st.h >= pt.h && st.used + pt.w <= UL + 0.1 && (!best || st.h - pt.h < best.h - pt.h)) best = st;
        // если деталь поворачивается — пробуем положить её на бок в полосу пониже
        if (!best && !mat.grain) for (const st of sh.strips) if (st.h >= pt.w && st.used + pt.h <= UL + 0.1 && (!best || st.h - pt.w < best.h - pt.w)) best = { ...st, flip: st };
        if (best) {
          const st = best.flip || best, w = best.flip ? pt.h : pt.w, h = best.flip ? pt.w : pt.h;
          st.items.push({ ...pt, w, h, rot: best.flip ? !pt.rot : pt.rot, x: st.used, y: st.y });
          st.used += w + K; placed = true; break;
        }
        if (sh.usedH + pt.h <= UW + 0.1) {
          sh.strips.push({ y: sh.usedH, h: pt.h, used: pt.w + K, items: [{ ...pt, x: 0, y: sh.usedH }] });
          sh.usedH += pt.h + K; placed = true; break;
        }
      }
      if (!placed) sheets.push({ strips: [{ y: 0, h: pt.h, used: pt.w + K, items: [{ ...pt, x: 0, y: 0 }] }], usedH: pt.h + K });
    }
    for (const sh of sheets) {
      sh.items = sh.strips.flatMap((s) => s.items);
      sh.util = sh.items.reduce((a, it) => a + it.w * it.h, 0) / (UL * UW);
      // длина резов: поперечные резы полос + продольные резы деталей
      sh.cutLen = (sh.strips.length * UL + sh.items.reduce((a, it) => a + it.h, 0)) / 1000;
    }
    result.push({ mat, sheets, over, area: items.reduce((a, it) => a + it.len * it.wid, 0) / 1e6 });
  }
  return result;
}

/* ------------------------------ стоимость ------------------------------ */

const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const f1 = (v) => v.toFixed(1).replace('.', ',');

export function price(L, rows = partsTable(L), maps = nest(rows)) {
  const lines = [];
  let sheetsTotal = 0, cut = 0;
  for (const g of maps) {
    cut += g.sheets.reduce((a, s) => a + s.cutLen, 0);
    if (g.mat.m2) continue;
    const n = g.sheets.length + g.over.length;
    sheetsTotal += n;
    lines.push({ name: `${g.mat.name}: ${n} ${plural(n, 'лист', 'листа', 'листов')}`, sum: n * g.mat.sheet, group: 'Материалы' });
  }
  const enamel = rows.filter((r) => r.mat.m2);
  if (enamel.length) {
    const m2 = enamel.reduce((a, r) => a + (r.len * r.wid * r.qty) / 1e6, 0);
    lines.push({ name: `${enamel[0].mat.name}: ${m2.toFixed(2).replace('.', ',')} м²`, sum: Math.round(m2 * enamel[0].mat.m2), group: 'Материалы' });
  }
  lines.push({ name: `Распил: ${f1(cut)} м`, sum: Math.round(cut * CUT_M), group: 'Работы' });
  const ed = edgeTotals(rows);
  lines.push({ name: `Кромка ПВХ 2 мм: ${f1(ed.e2)} м, 0,4 мм: ${f1(ed.e04)} м`, sum: Math.round(ed.e2 * EDGE2_M + ed.e04 * EDGE04_M), group: 'Работы' });
  const holes = L.holesTotal || 0;
  lines.push({ name: `Присадка: ${holes} ${plural(holes, 'отверстие', 'отверстия', 'отверстий')}`, sum: Math.round(holes * DRILL), group: 'Работы' });
  const hwSum = L.hw.reduce((a, h) => a + h.qty * h.price, 0);
  lines.push({ name: `Фурнитура и крепёж: ${L.hw.length} ${plural(L.hw.length, 'позиция', 'позиции', 'позиций')}`, sum: Math.round(hwSum), group: 'Фурнитура' });
  const sub = lines.reduce((a, l) => a + l.sum, 0);
  lines.push({ name: 'Сборка, упаковка, контроль качества', sum: Math.round(sub * ASSEMBLY + PACK), group: 'Работы' });
  const total = Math.ceil(lines.reduce((a, l) => a + l.sum, 0) / 100) * 100;
  return { lines, total, sheets: sheetsTotal, cut };
}

/* ------------------------------ экспорт ------------------------------ */

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const num = (v) => String(v).replace('.', ',');

/** Спецификация для программ раскроя: чистовые и пильные размеры, кромка, текстура. */
export function partsCSV(rows) {
  const head = ['№', 'Деталь', 'Материал', 'Длина чист., мм', 'Ширина чист., мм', 'Длина пил., мм', 'Ширина пил., мм', 'Толщина, мм', 'Кол-во', 'Кромка Д1', 'Кромка Д2', 'Кромка Ш1', 'Кромка Ш2', 'Текстура', 'Отверстий', 'Масса, кг', 'Примечание'];
  const lines = [head.map(q).join(';')];
  for (const r of rows) lines.push([r.no, r.name, r.mat.name, r.len, r.wid, r.cut.len, r.cut.wid, r.t, r.qty, num(r.e.l1 || ''), num(r.e.l2 || ''), num(r.e.w1 || ''), num(r.e.w2 || ''), r.mat.grain ? 'вдоль длины' : 'нет', r.holes.length, num((r.kg).toFixed(2)), r.note].map(q).join(';'));
  return '﻿' + lines.join('\r\n');
}

/** Присадка: каждое отверстие каждой детали. X — от торца L0 вдоль длины, Y — от кромки вдоль ширины. */
export function drillCSV(rows) {
  const head = ['№ детали', 'Деталь', 'Кол-во деталей', 'Пласть/торец', 'X, мм', 'Y, мм', 'Ø, мм', 'Глубина, мм', 'Сквозное', 'Назначение'];
  const lines = [head.map(q).join(';')];
  for (const r of rows) for (const h of r.holes) lines.push([r.no, r.name, r.qty, h.face, num(h.u), num(h.v), h.d, h.through ? r.t : h.depth, h.through ? 'да' : 'нет', HOLE_KINDS[h.kind] || h.kind].map(q).join(';'));
  return '﻿' + lines.join('\r\n');
}
