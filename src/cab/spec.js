/* ==========================================================================
   Ясень · Конструктор: спецификация деталей, раскрой листов, стоимость
   ========================================================================== */

import { DECORS, ENAMELS, ENAMEL_M2, SHEET, T, HDF } from './model.js';

const HDF_SHEET = 1450, CUT_M = 45, EDGE2_M = 58, EDGE04_M = 24, ASSEMBLY = 0.14, PACK = 1800;

// Чем является каждый материал в спецификации и раскрое.
export function materialsOf(p) {
  const body = DECORS[p.body];
  const front = p.front.kind === 'enamel' ? ENAMELS[p.front.id] : DECORS[p.front.id];
  const mats = {
    body:   { key: 'ldsp:' + p.body, name: `ЛДСП ${T} мм · ${body.name}`, grain: !!body.wood, sheet: body.sheet, hex: body.hex },
    drawer: { key: 'ldsp:white', name: `ЛДСП ${T} мм · ${DECORS.white.name}`, grain: false, sheet: DECORS.white.sheet, hex: DECORS.white.hex },
    hdf:    { key: 'hdf', name: `ХДФ ${HDF} мм · ${p.body === 'white' || !DECORS[p.body].wood ? 'белая' : 'в тон корпуса'}`, grain: false, sheet: HDF_SHEET, hex: '#efece6' },
    front:  p.front.kind === 'enamel'
      ? { key: 'mdf:' + p.front.id, name: `МДФ 19 мм · эмаль «${front.name}»`, grain: false, m2: ENAMEL_M2, hex: front.hex, enamel: true }
      : { key: 'ldsp:' + p.front.id, name: `ЛДСП ${T} мм · ${front.name}`, grain: !!front.wood, sheet: front.sheet, hex: front.hex },
  };
  mats.enamel = mats.front;
  return mats;
}

const edgeKey = (e) => ['l1', 'l2', 'w1', 'w2'].map((k) => e[k] || 0).join('/');

/** Сводная спецификация: одинаковые детали складываются в одну строку. */
export function partsTable(L) {
  const mats = materialsOf(L.p);
  const rows = [];
  for (const b of L.boxes) {
    if (!b.part) continue;
    const m = mats[b.mat];
    const len = Math.round(b.part.len), wid = Math.round(b.part.wid);
    const key = [b.part.name, m.key, len, wid, edgeKey(b.part.e), b.part.note || ''].join('|');
    const r = rows.find((x) => x.key === key);
    if (r) r.qty++;
    else rows.push({ key, name: b.part.name, mat: m, matKey: m.key, len, wid, t: b.part.t || (b.mat === 'hdf' ? HDF : T), e: b.part.e, note: b.part.note || '', qty: 1 });
  }
  const order = (r) => (r.mat.enamel || r.name.startsWith('Двер') || r.name.startsWith('Фасад') || r.name.startsWith('Вставка') ? 2 : r.matKey === 'hdf' ? 3 : r.name.startsWith('Ящик') ? 1 : 0);
  rows.sort((a, b) => order(a) - order(b) || a.matKey.localeCompare(b.matKey) || b.len * b.wid - a.len * a.wid);
  rows.forEach((r, i) => { r.no = i + 1; });
  return rows;
}

// Кромка: длинные стороны — l1/l2, короткие — w1/w2.
export function edgeTotals(rows) {
  const t = { 2: 0, 0.4: 0 };
  for (const r of rows) {
    for (const k of ['l1', 'l2']) if (r.e[k]) t[r.e[k]] += (r.len * r.qty) / 1000;
    for (const k of ['w1', 'w2']) if (r.e[k]) t[r.e[k]] += (r.wid * r.qty) / 1000;
  }
  return { e2: t[2], e04: t[0.4] };
}

export const edgeLabel = (e) => {
  const l = [e.l1, e.l2].filter(Boolean), w = [e.w1, e.w2].filter(Boolean);
  if (!l.length && !w.length) return '—';
  const s = [];
  if (l.length) s.push(`${l.length === 2 ? '2' : '1'}×Д ${l[0]}`);
  if (w.length) s.push(`${w.length === 2 ? '2' : '1'}×Ш ${w[0]}`);
  return s.join(', ');
};

/* ------------------------------ раскрой ------------------------------ */

/**
 * Полосовой (гильотинный) раскрой: детали укладываются в полосы поперёк листа.
 * Для декоров с текстурой дерева деталь кладётся только вдоль волокон.
 */
export function nest(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.matKey)) groups.set(r.matKey, { mat: r.mat, items: [] });
    for (let q = 0; q < r.qty; q++) groups.get(r.matKey).items.push({ no: r.no, len: r.len, wid: r.wid, name: r.name });
  }
  const UL = SHEET.L - 2 * SHEET.trim, UW = SHEET.W - 2 * SHEET.trim, K = SHEET.kerf;
  const result = [];
  for (const { mat, items } of groups.values()) {
    const parts = items.map((it) => {
      let w = it.len, h = it.wid, rot = false;
      if (!mat.grain && h > w) { [w, h] = [h, w]; rot = true; }
      if (w > UL && h <= UL && w <= UW && !mat.grain) { [w, h] = [h, w]; rot = !rot; }
      return { ...it, w, h, rot, over: w > UL || h > UW };
    }).sort((a, b) => b.h - a.h || b.w - a.w);
    const sheets = [];
    const over = [];
    for (const pt of parts) {
      if (pt.over) { over.push(pt); continue; }
      let placed = false;
      for (const sh of sheets) {
        // лучшая подходящая полоса: минимальный лишний зазор по высоте
        let best = null;
        for (const st of sh.strips) if (st.h >= pt.h && st.used + pt.w <= UL + 0.1 && (!best || st.h - pt.h < best.h - pt.h)) best = st;
        if (best) { best.items.push({ ...pt, x: best.used, y: best.y }); best.used += pt.w + K; placed = true; break; }
        if (sh.usedH + pt.h <= UW + 0.1) {
          const st = { y: sh.usedH, h: pt.h, used: pt.w + K, items: [{ ...pt, x: 0, y: sh.usedH }] };
          sh.strips.push(st); sh.usedH += pt.h + K; placed = true; break;
        }
      }
      if (!placed) sheets.push({ strips: [{ y: 0, h: pt.h, used: pt.w + K, items: [{ ...pt, x: 0, y: 0 }] }], usedH: pt.h + K });
    }
    for (const sh of sheets) {
      sh.items = sh.strips.flatMap((s) => s.items);
      const area = sh.items.reduce((a, it) => a + it.w * it.h, 0);
      sh.util = area / (UL * UW);
      sh.cutLen = sh.items.reduce((a, it) => a + it.w + it.h, 0) / 1000;
    }
    result.push({ mat, sheets, over, area: items.reduce((a, it) => a + it.len * it.wid, 0) / 1e6 });
  }
  return result;
}

/* ------------------------------ стоимость ------------------------------ */

export function price(L, rows = partsTable(L), maps = nest(rows)) {
  const lines = [];
  let sheetsTotal = 0, cut = 0;
  for (const g of maps) {
    if (g.mat.m2) continue;
    const n = g.sheets.length + g.over.length;
    sheetsTotal += n;
    lines.push({ name: `${g.mat.name}: ${n} ${n === 1 ? 'лист' : n < 5 ? 'листа' : 'листов'}`, sum: n * g.mat.sheet });
    cut += g.sheets.reduce((a, s) => a + s.cutLen, 0);
  }
  const enamel = rows.filter((r) => r.mat.m2);
  if (enamel.length) {
    const m2 = enamel.reduce((a, r) => a + (r.len * r.wid * r.qty) / 1e6, 0);
    lines.push({ name: `${enamel[0].mat.name}: ${m2.toFixed(2).replace('.', ',')} м²`, sum: Math.round(m2 * enamel[0].mat.m2) });
  }
  lines.push({ name: `Распил: ${cut.toFixed(1).replace('.', ',')} м`, sum: Math.round(cut * CUT_M) });
  const ed = edgeTotals(rows);
  lines.push({ name: `Кромка ПВХ 2 мм: ${ed.e2.toFixed(1).replace('.', ',')} м, 0,4 мм: ${ed.e04.toFixed(1).replace('.', ',')} м`, sum: Math.round(ed.e2 * EDGE2_M + ed.e04 * EDGE04_M) });
  const hwSum = L.hw.reduce((a, h) => a + h.qty * h.price, 0);
  lines.push({ name: `Фурнитура: ${L.hw.length} позиций`, sum: Math.round(hwSum) });
  const sub = lines.reduce((a, l) => a + l.sum, 0);
  lines.push({ name: 'Присадка, сборка и упаковка', sum: Math.round(sub * ASSEMBLY + PACK) });
  const total = Math.ceil(lines.reduce((a, l) => a + l.sum, 0) / 100) * 100;
  return { lines, total, sheets: sheetsTotal };
}

/* ------------------------------ экспорт ------------------------------ */

export function partsCSV(rows) {
  const head = ['№', 'Деталь', 'Материал', 'Длина, мм', 'Ширина, мм', 'Толщина, мм', 'Кол-во', 'Кромка Д1', 'Кромка Д2', 'Кромка Ш1', 'Кромка Ш2', 'Текстура', 'Примечание'];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(';')];
  for (const r of rows) lines.push([r.no, r.name, r.mat.name, r.len, r.wid, r.t, r.qty, r.e.l1 || '', r.e.l2 || '', r.e.w1 || '', r.e.w2 || '', r.mat.grain ? 'вдоль длины' : 'нет', r.note].map(q).join(';'));
  return '﻿' + lines.join('\r\n');
}
