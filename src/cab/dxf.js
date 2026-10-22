/* ==========================================================================
   Ясень · Конструктор: выгрузка деталей в DXF для станков с ЧПУ
   Формат DXF R12 (AC1009) — его читают AutoCAD, КОМПАС, Базис, bCAD и программы ЧПУ.
   Каждая деталь — контур в своих координатах (0,0 — угол L0/кромка W0), отверстия — окружности
   на слоях по пласти, кромка — отдельный слой, подпись — номер детали по спецификации.
   ========================================================================== */

const LAYERS = [
  ['CONTOUR', 7], ['EDGE_2', 1], ['EDGE_04', 30], ['HOLES_A', 5], ['HOLES_B', 4], ['HOLES_EDGE', 6], ['TEXT', 8],
];

const n = (v) => (Math.round(v * 100) / 100).toString();

function writer() {
  const out = [];
  const pair = (code, value) => out.push(String(code), String(value));
  return {
    pair,
    line(layer, x1, y1, x2, y2) { pair(0, 'LINE'); pair(8, layer); pair(10, n(x1)); pair(20, n(y1)); pair(30, 0); pair(11, n(x2)); pair(21, n(y2)); pair(31, 0); },
    circle(layer, x, y, r) { pair(0, 'CIRCLE'); pair(8, layer); pair(10, n(x)); pair(20, n(y)); pair(30, 0); pair(40, n(r)); },
    text(layer, x, y, h, s) { pair(0, 'TEXT'); pair(8, layer); pair(10, n(x)); pair(20, n(y)); pair(30, 0); pair(40, n(h)); pair(1, s); },
    toString() { return out.join('\r\n') + '\r\n'; },
  };
}

// В DXF R12 строки идут в кодировке системы; транслитерация делает подписи читаемыми везде.
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const translit = (s) => s.replace(/[а-яё]/gi, (c) => { const t = TR[c.toLowerCase()] ?? c; return c === c.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1); }).replace(/[^\x20-\x7e]/g, '');

/**
 * Все строки спецификации, разложенные сеткой. Детали — в чистовых размерах,
 * кромка обозначена линией на слое EDGE_2 / EDGE_04 со смещением 1 мм внутрь.
 */
export function partsDXF(rows, { title = 'Yasen' } = {}) {
  const w = writer();
  w.pair(0, 'SECTION'); w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER'); w.pair(1, 'AC1009');
  w.pair(9, '$INSUNITS'); w.pair(70, 4);
  w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION'); w.pair(2, 'TABLES');
  w.pair(0, 'TABLE'); w.pair(2, 'LAYER'); w.pair(70, LAYERS.length);
  for (const [name, color] of LAYERS) { w.pair(0, 'LAYER'); w.pair(2, name); w.pair(70, 0); w.pair(62, color); w.pair(6, 'CONTINUOUS'); }
  w.pair(0, 'ENDTAB'); w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION'); w.pair(2, 'ENTITIES');
  w.text('TEXT', 0, 120, 40, translit(title));

  const GAP = 160, ROW_W = 6000;
  let x = 0, y = 0, rowH = 0;
  let count = 0;
  for (const r of rows) {
    const L = r.len, Wd = r.wid;
    if (x > 0 && x + L > ROW_W) { x = 0; y -= rowH + GAP; rowH = 0; }
    const ox = x, oy = y - Wd;
    // контур
    w.line('CONTOUR', ox, oy, ox + L, oy); w.line('CONTOUR', ox + L, oy, ox + L, oy + Wd);
    w.line('CONTOUR', ox + L, oy + Wd, ox, oy + Wd); w.line('CONTOUR', ox, oy + Wd, ox, oy);
    // кромка: l1 — сторона v = ширина, l2 — v = 0, w1 — u = 0, w2 — u = длина
    const edge = (t) => (t >= 1 ? 'EDGE_2' : 'EDGE_04');
    if (r.e.l1) w.line(edge(r.e.l1), ox, oy + Wd - 1, ox + L, oy + Wd - 1);
    if (r.e.l2) w.line(edge(r.e.l2), ox, oy + 1, ox + L, oy + 1);
    if (r.e.w1) w.line(edge(r.e.w1), ox + 1, oy, ox + 1, oy + Wd);
    if (r.e.w2) w.line(edge(r.e.w2), ox + L - 1, oy, ox + L - 1, oy + Wd);
    // отверстия
    for (const h of r.holes) {
      if (h.face === 'L0' || h.face === 'L1') {
        const ex = h.face === 'L0' ? ox : ox + L, dir = h.face === 'L0' ? 1 : -1;
        w.line('HOLES_EDGE', ex, oy + h.v, ex + dir * h.depth, oy + h.v);
        continue;
      }
      w.circle(h.face === 'B' ? 'HOLES_B' : 'HOLES_A', ox + h.u, oy + h.v, h.d / 2);
    }
    w.text('TEXT', ox, oy + Wd + 20, Math.min(36, Math.max(14, Wd / 10)), translit(`#${r.no} ${r.name} ${L}x${Wd}x${r.t} - ${r.qty} sht.`));
    count++;
    x += L + GAP;
    rowH = Math.max(rowH, Wd + 60);
  }
  w.pair(0, 'ENDSEC'); w.pair(0, 'EOF');
  return { text: w.toString(), parts: count };
}
