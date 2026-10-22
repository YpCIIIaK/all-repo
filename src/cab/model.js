/* ==========================================================================
   Ясень · Конструктор корпусной мебели: модель и правила конструкции
   Все размеры — в миллиметрах. Ось x — вправо, y — вверх, z — к зрителю;
   задняя плоскость корпуса z = 0, передняя кромка z = D.
   ========================================================================== */

export const T = 16;          // ЛДСП корпуса
export const HDF = 3;         // задняя стенка
export const GAP = 3;         // зазор между фасадами
export const SHEET = { L: 2800, W: 2070, trim: 10, kerf: 4 };

export const LIMITS = { W: [300, 3600], H: [300, 2700], D: [300, 700], sections: [1, 6], secW: 200 };
export const SLIDES = [250, 300, 350, 400, 450, 500, 550];

/* ------------------------------ отделки ------------------------------ */

export const DECORS = {
  white:    { name: 'Белый премиум',  hex: '#f1efe9', sheet: 5200 },
  cashmere: { name: 'Кашемир',        hex: '#d9d0c3', sheet: 6100 },
  sonoma:   { name: 'Дуб сонома',     hex: '#d4b48a', sheet: 6400, wood: true },
  halifax:  { name: 'Дуб галифакс',   hex: '#a57b53', sheet: 7200, wood: true },
  walnut:   { name: 'Орех тиара',     hex: '#6f4b36', sheet: 7200, wood: true },
  graphite: { name: 'Графит',         hex: '#3d3e40', sheet: 6100 },
  concrete: { name: 'Бетон чикаго',   hex: '#9e9a93', sheet: 6800, concrete: true },
};

export const ENAMELS = {
  milk:  { name: 'Молочный',        hex: '#eee8dc' },
  sage:  { name: 'Шалфей',          hex: '#a7b199' },
  terra: { name: 'Терракота',       hex: '#b4694a' },
  navy:  { name: 'Тёмно-синий',     hex: '#2c3a51' },
  black: { name: 'Чёрный матовый',  hex: '#252526' },
};
export const ENAMEL_M2 = 8900;

export const HANDLES = {
  bar128: { name: 'Скоба 128 мм', price: 390 },
  bar192: { name: 'Скоба 192 мм', price: 520 },
  knob:   { name: 'Кнопка',       price: 290 },
  edge:   { name: 'Торцевой профиль', price: 640 },
  push:   { name: 'Без ручек (push-to-open)', price: 560 },
};
export const HANDLE_METALS = {
  black: { name: 'Чёрный матовый', hex: '#1d1c1b' },
  brass: { name: 'Латунь',         hex: '#c9a25b' },
  steel: { name: 'Сталь',          hex: '#c4c6c8' },
};

export const CELL_KINDS = {
  box:    { name: 'Полка',   short: 'Полка',  min: 120 },
  rail:   { name: 'Штанга',  short: 'Штанга', min: 800 },
  drawer: { name: 'Ящик',    short: 'Ящик',   min: 110, max: 400 },
};

/* ------------------------------ шаблоны ------------------------------ */

const cells = (spec) => spec.map((c) => (typeof c === 'string' ? { k: c, h: 'auto' } : { k: c[0], h: c[1] }));
const sec = (front, spec, extra = {}) => ({ w: 'auto', front, hinge: 'auto', cells: cells(spec), ...extra });

export const TEMPLATES = {
  wardrobe: {
    name: 'Шкаф распашной', desc: 'Двери, штанга, полки и ящики',
    p: { W: 1600, H: 2400, D: 580, base: 'plinth', baseH: 80, doors: 'hinged',
      sections: [sec('door', ['box', 'box', 'box', 'box', 'box']), sec('door', [['box', 320], 'rail', ['box', 380]]), sec('door', [['drawer', 180], ['drawer', 180], ['drawer', 180], 'box', 'box', ['box', 380]])] },
  },
  coupe: {
    name: 'Шкаф-купе', desc: 'Раздвижные двери и внутренние ящики',
    p: { W: 2200, H: 2400, D: 600, base: 'plinth', baseH: 80, doors: 'sliding',
      sections: [sec('door', ['box', 'box', 'box', 'box', 'box', 'box']), sec('door', [['box', 320], 'rail', ['box', 420]]), sec('door', [['drawer', 200], ['drawer', 200], 'rail', ['box', 420]])] },
  },
  rack: {
    name: 'Стеллаж', desc: 'Открытые полки для книг и декора',
    p: { W: 1200, H: 2000, D: 350, base: 'plinth', baseH: 60, doors: 'hinged',
      sections: [sec('open', ['box', 'box', 'box', 'box', 'box']), sec('open', [['box', 420], 'box', 'box', 'box']), sec('open', ['box', 'box', 'box', 'box', 'box'])] },
  },
  dresser: {
    name: 'Комод', desc: 'Ящики полного выдвижения на ножках',
    p: { W: 1000, H: 880, D: 450, base: 'legs', baseH: 120, doors: 'hinged',
      sections: [sec('open', ['drawer', 'drawer', 'drawer']), sec('open', ['drawer', 'drawer', 'drawer'])] },
  },
  tv: {
    name: 'Тумба под ТВ', desc: 'Двери, ящик и открытая ниша',
    p: { W: 1800, H: 520, D: 420, base: 'legs', baseH: 120, doors: 'hinged',
      sections: [sec('door', ['box', 'box']), sec('open', [['drawer', 170], 'box']), sec('door', ['box', 'box'])] },
  },
  pencil: {
    name: 'Пенал', desc: 'Узкий шкаф для ванной или прихожей',
    p: { W: 500, H: 2100, D: 400, base: 'plinth', baseH: 80, doors: 'hinged',
      sections: [sec('door', [['drawer', 170], ['drawer', 170], 'box', 'box', 'box', 'box'])] },
  },
};

export function fromTemplate(id) {
  const t = TEMPLATES[id];
  return normalize({ v: 1, tpl: id, name: t.name, body: 'white', front: { kind: 'enamel', id: 'sage' }, handle: 'bar128', metal: 'black', ...JSON.parse(JSON.stringify(t.p)) });
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function normalize(p) {
  p.W = clamp(Math.round(+p.W || 1000), ...LIMITS.W);
  p.H = clamp(Math.round(+p.H || 1000), ...LIMITS.H);
  p.D = clamp(Math.round(+p.D || 450), ...LIMITS.D);
  p.base = p.base === 'legs' ? 'legs' : 'plinth';
  p.baseH = clamp(Math.round(+p.baseH || 80), 40, 200);
  p.doors = ['hinged', 'sliding'].includes(p.doors) ? p.doors : 'hinged';
  if (!DECORS[p.body]) p.body = 'white';
  if (!p.front || !(p.front.kind === 'enamel' ? ENAMELS : DECORS)[p.front.id]) p.front = { kind: 'decor', id: p.body };
  if (!HANDLES[p.handle]) p.handle = 'bar128';
  if (!HANDLE_METALS[p.metal]) p.metal = 'black';
  p.sections = (p.sections || []).slice(0, LIMITS.sections[1]);
  if (!p.sections.length) p.sections = [sec('door', ['box', 'box', 'box'])];
  for (const s of p.sections) {
    s.w = s.w === 'auto' || !(+s.w > 0) ? 'auto' : Math.round(+s.w);
    if (!['door', 'glass', 'open'].includes(s.front)) s.front = 'door';
    if (!['auto', 'left', 'right'].includes(s.hinge)) s.hinge = 'auto';
    s.cells = (s.cells || []).filter((c) => CELL_KINDS[c.k]).map((c) => ({ k: c.k, h: c.h === 'auto' || !(+c.h > 0) ? 'auto' : Math.round(+c.h) }));
    if (!s.cells.length) s.cells = [{ k: 'box', h: 'auto' }];
  }
  return p;
}

/* ------------------------------ расчёт конструкции ------------------------------ */

const hingeCount = (h) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5);
const r1 = (v) => Math.round(v * 10) / 10;
const fmtMm = (v) => String(Math.round(v));

/**
 * Возвращает всё, что нужно для 3D, чертежей и спецификации:
 * boxes — панели с положением и свойствами детали, hardware — фурнитура,
 * secs — геометрия секций и ячеек, anims — что открывается, warns/errors — проверки.
 */
export function layout(p) {
  const { W, H, D } = p;
  const legs = p.base === 'legs', bh = p.baseH;
  const sliding = p.doors === 'sliding';
  const frontMat = p.front.kind === 'enamel' ? 'enamel' : 'front';
  const FT = p.front.kind === 'enamel' ? 19 : 16;
  const out = { p, boxes: [], hw: [], anims: {}, handles: [], rails: [], legs: [], secs: [], warns: [], errors: [], FT, notes: [] };
  const hw = (name, qty, price, unit = 'шт.') => {
    if (qty <= 0) return;
    const ex = out.hw.find((h) => h.name === name);
    if (ex) ex.qty += qty; else out.hw.push({ name, qty, price, unit });
  };
  // part: name, mat, len (вдоль волокон), wid, edges {l1,l2,w1,w2}, note
  const add = (b) => { out.boxes.push(b); return b; };
  const y0 = legs ? bh : 0;
  const joints = { n: 0 };
  const conf = D > 450 ? 3 : 2;

  /* ---------- корпус ---------- */
  for (const [x, nm] of [[0, 'левая'], [W - T, 'правая']]) {
    add({ role: 'side', mat: 'body', x, y: y0, z: 0, w: T, h: H - y0, d: D, part: { name: 'Боковина', len: H - y0, wid: D, e: { l1: 2 } } });
  }
  add({ role: 'top', mat: 'body', x: T, y: H - T, z: 0, w: W - 2 * T, h: T, d: D, part: { name: 'Крышка', len: W - 2 * T, wid: D, e: { l1: 2 } } });
  add({ role: 'bottom', mat: 'body', x: T, y: bh, z: 0, w: W - 2 * T, h: T, d: D, part: { name: 'Дно', len: W - 2 * T, wid: D, e: { l1: 2 } } });
  joints.n += 4;
  if (!legs) {
    add({ role: 'plinth', mat: 'body', x: T, y: 0, z: D - 40 - T, w: W - 2 * T, h: bh, d: T, part: { name: 'Цоколь передний', len: W - 2 * T, wid: bh, e: { l1: 0.4 } } });
    add({ role: 'plinth', mat: 'body', x: T, y: 0, z: 30, w: W - 2 * T, h: bh, d: T, part: { name: 'Цоколь задний', len: W - 2 * T, wid: bh, e: {} } });
    joints.n += 4;
  }

  // задняя стенка ХДФ, при необходимости — из нескольких частей
  const bw = W - 4, bhh = H - bh - 4;
  const nx = Math.ceil(bw / (SHEET.L - 20)), ny = Math.ceil(bhh / (SHEET.W - 20));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const pw = bw / nx, ph = bhh / ny;
    add({ role: 'back', mat: 'hdf', x: 2 + i * pw, y: bh + 2 + j * ph, z: -HDF, w: pw, h: ph, d: HDF, part: { name: 'Задняя стенка', len: Math.round(Math.max(pw, ph)), wid: Math.round(Math.min(pw, ph)), e: {} } });
  }
  if (nx * ny > 1) out.notes.push(`Задняя стенка из ${nx * ny} частей, стык на соединительном профиле`);
  hw('Саморез для ХДФ 3,5×16', Math.ceil((2 * (bw + bhh)) / 150) + (nx * ny - 1) * 6, 2);
  if (nx * ny > 1) hw('Профиль соединительный для ХДФ', nx * ny - 1, 180);

  /* ---------- секции ---------- */
  const n = p.sections.length;
  const avail = W - 2 * T - (n - 1) * T;
  const fixed = p.sections.reduce((s, x) => s + (x.w === 'auto' ? 0 : x.w), 0);
  const autos = p.sections.filter((x) => x.w === 'auto').length;
  let rest = avail - fixed;
  if (autos === 0 && Math.abs(rest) > 0.5) out.errors.push(`Сумма ширин секций ${fixed} мм, а внутри корпуса ${avail} мм`);
  const autoW = autos ? rest / autos : 0;
  if (autos && autoW < LIMITS.secW) out.errors.push(`Секциям не хватает ширины: на каждую «авто» остаётся ${Math.round(autoW)} мм`);
  const yi0 = bh + T, yi1 = H - T, Hin = yi1 - yi0;
  if (Hin < 120) out.errors.push('Слишком низкий корпус для выбранного основания');
  let x = T;
  p.sections.forEach((s, i) => {
    const cw = s.w === 'auto' ? autoW : s.w;
    const S = { i, x0: x, x1: x + cw, cw, cells: [], s };
    out.secs.push(S);
    if (cw < LIMITS.secW) out.errors.push(`Секция ${i + 1}: ширина ${Math.round(cw)} мм меньше ${LIMITS.secW} мм`);
    x += cw;
    if (i < n - 1) {
      add({ role: 'divider', mat: 'body', x, y: yi0, z: 0, w: T, h: Hin, d: D, part: { name: 'Перегородка', len: Hin, wid: D, e: { l1: 2 } } });
      joints.n += 2;
      x += T;
    }
  });
  out.secW = out.secs.map((s) => s.cw);

  const shelfD = D - 20;
  const slideFor = (depth) => SLIDES.filter((l) => l <= depth).pop() || 0;

  for (const S of out.secs) {
    const { s, cw, x0, x1, i } = S;
    const cs = s.cells;
    // разделители между ячейками: полки везде, кроме стыка ящик-ящик
    const sep = cs.slice(0, -1).map((c, j) => !(c.k === 'drawer' && cs[j + 1].k === 'drawer'));
    const fixedH = cs.reduce((a, c) => a + (c.h === 'auto' ? 0 : c.h), 0) + sep.filter(Boolean).length * T;
    const nAuto = cs.filter((c) => c.h === 'auto').length;
    let free = Hin - fixedH;
    if (!nAuto && Math.abs(free) > 1) {
      // нет «авто»-ячеек: растягиваем верхнюю
      cs[cs.length - 1]._stretch = free;
    }
    if (free < (nAuto ? nAuto * 60 : -1)) out.errors.push(`Секция ${i + 1}: ячейки не помещаются по высоте (не хватает ${Math.round(-free + nAuto * 60)} мм)`);
    const autoH = nAuto ? free / nAuto : 0;
    let y = yi0;
    cs.forEach((c, j) => {
      let h = c.h === 'auto' ? autoH : c.h + (c._stretch || 0);
      delete c._stretch;
      const C = { j, k: c.k, y0: y, y1: y + h, h };
      S.cells.push(C);
      const min = CELL_KINDS[c.k].min;
      if (h < min - 0.5) out.warns.push(`Секция ${i + 1}: ${CELL_KINDS[c.k].name.toLowerCase()} высотой ${Math.round(h)} мм — меньше рекомендуемых ${min} мм`);
      if (c.k === 'drawer' && h > CELL_KINDS.drawer.max) out.warns.push(`Секция ${i + 1}: ящик высотой ${Math.round(h)} мм — слишком высокий, лучше разделить на два`);
      y += h;
      if (j < cs.length - 1 && sep[j]) {
        add({ role: 'shelf', mat: 'body', x: x0 + 1, y, z: 4, w: cw - 2, h: T, d: shelfD, sec: i, part: { name: 'Полка', len: cw - 2, wid: shelfD, e: { l1: 2 } } });
        hw('Полкодержатель', 4, 12);
        C.shelfAbove = true;
        y += T;
      }
    });
    if (cw > 900 && cs.length > 1) out.warns.push(`Секция ${i + 1}: полки шире 900 мм могут прогибаться — добавьте перегородку`);

    /* ---------- фасады ---------- */
    const ox0 = i === 0 ? 0 : x0 - T / 2, ox1 = i === n - 1 ? W : x1 + T / 2;
    const fw = ox1 - ox0 - GAP;
    // ящики снизу подряд — накладные; остальные за дверью — внутренние
    let block = 0;
    while (block < S.cells.length && S.cells[block].k === 'drawer') block++;
    const doorSec = !sliding && s.front !== 'open';
    let doorFrom = bh;
    S.cells.forEach((C, j) => {
      if (C.k === 'rail') {
        out.rails.push({ x0: x0 + 2, x1: x1 - 2, y: C.y1 - 60, z: D / 2, sec: i });
        hw('Штанга овальная хромированная', +(r1((cw - 2) / 1000)).toFixed(2), 650, 'м');
        hw('Штангодержатель', 2, 90);
        if (C.h < 900) out.warns.push(`Секция ${i + 1}: под штангой ${Math.round(C.h)} мм — подойдёт только для коротких вещей`);
      }
      if (C.k !== 'drawer') return;
      const overlay = !sliding && (!doorSec || j < block);
      const key = `drawer:${i}:${j}`;
      let fy0, fy1, fx0, fx1, fz0, depth;
      if (overlay) {
        const prev = S.cells[j - 1], next = S.cells[j + 1];
        fy0 = j === 0 ? bh : prev?.k === 'drawer' ? C.y0 : C.y0 - T / 2;
        fy1 = !next ? H : next.k === 'drawer' ? C.y1 : C.y1 + T / 2;
        fy0 += GAP / 2; fy1 -= GAP / 2;
        fx0 = ox0 + GAP / 2; fx1 = ox1 - GAP / 2; fz0 = D;
        depth = D - 10;
        if (doorSec && j === block - 1) doorFrom = fy1 + GAP / 2;
        const fh = fy1 - fy0;
        add({ role: 'front', mat: frontMat, x: fx0, y: fy0, z: fz0, w: fx1 - fx0, h: fh, d: FT, grp: key, front: true, part: { name: 'Фасад ящика', len: fx1 - fx0, wid: fh, e: frontMat === 'front' ? { l1: 2, l2: 2, w1: 2, w2: 2 } : {}, t: FT } });
        handleFor(out, p, key, fx0, fx1, fy0, fy1, D + FT, 'drawer');
      } else {
        // внутренний ящик: фасад из ЛДСП корпуса внутри секции
        const setback = sliding ? 0 : 22;
        fx0 = x0 + 2; fx1 = x1 - 2; fy0 = C.y0 + 2; fy1 = C.y1 - 2; fz0 = D - setback - T;
        depth = D - setback - T - 10;
        add({ role: 'front', mat: 'body', x: fx0, y: fy0, z: fz0, w: fx1 - fx0, h: fy1 - fy0, d: T, grp: key, inner: true, part: { name: 'Фасад внутреннего ящика', len: fx1 - fx0, wid: fy1 - fy0, e: { l1: 2, l2: 2, w1: 2, w2: 2 } } });
        hw('Ручка врезная для внутреннего ящика', 1, 260);
      }
      const L = slideFor(depth - 10);
      if (!L) { out.errors.push(`Секция ${i + 1}: слишком мелкий корпус для ящика`); return; }
      const bw2 = cw - 26, hb = Math.max(70, Math.min(250, Math.floor((C.h - 40) / 10) * 10));
      const bz1 = fz0 - 2, bz0 = bz1 - L, by = C.y0 + 15;
      add({ role: 'dbox', mat: 'drawer', x: x0 + 13, y: by, z: bz0, w: T, h: hb, d: L, grp: key, part: { name: 'Ящик: боковина', len: L, wid: hb, e: { l1: 0.4 } } });
      add({ role: 'dbox', mat: 'drawer', x: x1 - 13 - T, y: by, z: bz0, w: T, h: hb, d: L, grp: key, part: { name: 'Ящик: боковина', len: L, wid: hb, e: { l1: 0.4 } } });
      add({ role: 'dbox', mat: 'drawer', x: x0 + 13 + T, y: by, z: bz1 - T, w: bw2 - 2 * T, h: hb, d: T, grp: key, part: { name: 'Ящик: передняя и задняя стенки', len: bw2 - 2 * T, wid: hb, e: { l1: 0.4 } } });
      add({ role: 'dbox', mat: 'drawer', x: x0 + 13 + T, y: by, z: bz0, w: bw2 - 2 * T, h: hb, d: T, grp: key, part: { name: 'Ящик: передняя и задняя стенки', len: bw2 - 2 * T, wid: hb, e: { l1: 0.4 } } });
      add({ role: 'dbottom', mat: 'hdf', x: x0 + 14, y: by - HDF, z: bz0 + 1, w: bw2 - 2, h: HDF, d: L - 2, grp: key, part: { name: 'Ящик: дно', len: L - 2, wid: bw2 - 2, e: {} } });
      out.anims[key] = { type: 'drawer', travel: L * 0.85, delay: (i * 0.05 + j * 0.07) % 0.4 };
      hw(`Направляющие полного выдвижения с доводчиком ${L} мм, пара`, 1, 1650);
      hw('Конфирмат 7×50', 8, 6);
    });

    /* ---------- двери секции ---------- */
    if (doorSec) {
      const dy0 = doorFrom === bh ? bh + GAP / 2 : doorFrom, dy1 = H - GAP / 2;
      const dh = dy1 - dy0;
      if (dh >= 150) {
        const leaves = fw > 600 ? 2 : 1;
        const lw = (fw - (leaves - 1) * GAP) / leaves;
        if (lw > 600) out.warns.push(`Секция ${i + 1}: створка шириной ${Math.round(lw)} мм — тяжёлая, лучше сузить секцию`);
        for (let k = 0; k < leaves; k++) {
          const lx0 = ox0 + GAP / 2 + k * (lw + GAP);
          // авто: створки открываются парами, ручки сходятся к середине пары
          const auto = n === 1 ? 'left' : i % 2 === 0 && !(i === n - 1) ? 'left' : 'right';
          const side = leaves === 2 ? (k === 0 ? 'left' : 'right') : s.hinge !== 'auto' ? s.hinge : auto;
          const key = `door:${i}:${k}`;
          const glass = s.front === 'glass';
          const hc = hingeCount(dh);
          const holes = Array.from({ length: hc }, (_, m) => Math.round(m === 0 ? 100 : m === hc - 1 ? dh - 100 : 100 + ((dh - 200) * m) / (hc - 1)));
          add({ role: glass ? 'glass' : 'front', mat: glass ? 'glass' : frontMat, x: lx0, y: dy0, z: D, w: lw, h: dh, d: glass ? 20 : FT, grp: key, front: true, hingeSide: side,
            part: glass ? null : { name: 'Дверь', len: dh, wid: lw, e: frontMat === 'front' ? { l1: 2, l2: 2, w1: 2, w2: 2 } : {}, t: FT, note: `петли ${side === 'left' ? 'слева' : 'справа'}: ${holes.join(' / ')} мм от низа` } });
          if (glass) hw(`Фасад в алюминиевом профиле со стеклом ${fmtMm(dh)}×${fmtMm(lw)}`, 1, Math.round((dh * lw) / 1e6 * 9800 + 2400));
          out.anims[key] = { type: 'door', side, px: side === 'left' ? lx0 : lx0 + lw, pz: D, delay: i * 0.06 + k * 0.04 };
          hw(glass ? 'Петля для алюминиевого профиля с доводчиком' : 'Петля накладная с доводчиком', hc, glass ? 520 : 340);
          handleFor(out, p, key, lx0, lx0 + lw, dy0, dy1, D + (glass ? 20 : FT), 'door', side);
        }
      }
    }
  }

  /* ---------- двери-купе ---------- */
  if (sliding) {
    const nd = Math.max(2, Math.ceil(W / 1000)), ov = 30;
    const lw = (W + (nd - 1) * ov) / nd, dy0 = bh + 12, dh = H - bh - 40;
    if (lw < 500 || lw > 1100) out.warns.push(`Ширина двери-купе ${Math.round(lw)} мм — вне рекомендуемых 500–1100 мм`);
    for (let k = 0; k < nd; k++) {
      const key = `slide:${k}`, track = k % 2;
      add({ role: 'sliding', mat: frontMat, x: k * (lw - ov), y: dy0, z: D + 12 + track * 40, w: lw, h: dh, d: 26, grp: key, front: true,
        part: { name: 'Вставка двери-купе', len: Math.round(dh - 40), wid: Math.round(lw - 40), e: {}, t: frontMat === 'enamel' ? 19 : 10, noCarcass: true } });
      // при открытии двери на переднем треке заезжают на соседние слева
      out.anims[key] = { type: 'slide', dx: track ? -(lw - ov) : 0, delay: 0 };
      hw('Профиль двери-купе, комплект на дверь', 1, 4200);
      hw('Ролики двери-купе, комплект', 1, 1300);
    }
    hw('Направляющая купе верхняя', +(W / 1000).toFixed(2), 950, 'м');
    hw('Направляющая купе нижняя', +(W / 1000).toFixed(2), 520, 'м');
    out.sliding = { n: nd, lw, dy0, dh };
    if (D < 450) out.warns.push('Для штанги и купе глубина корпуса обычно не меньше 450 мм');
  }

  /* ---------- опоры и крепёж ---------- */
  if (legs) {
    const xs = [70, ...out.secs.slice(0, -1).map((S) => S.x1 + T / 2), W - 70];
    const used = W > 1200 ? xs : [70, W - 70];
    for (const lx of used) for (const lz of [70, D - 70]) out.legs.push({ x: lx, z: lz, h: bh });
    hw(`Опора мебельная h=${bh} мм`, out.legs.length, 320);
    hw('Монтажная планка для опор', out.legs.length, 40);
  } else {
    hw('Регулируемая опора под цоколь', W > 1200 ? 6 : 4, 60);
  }
  hw('Конфирмат 7×50', joints.n * conf, 6);
  hw('Заглушка для конфирмата', joints.n * conf, 3);
  if (H > 1600) { hw('Крепление к стене', 2, 140); out.notes.push('Корпус выше 1600 мм обязательно крепится к стене'); }
  const handles = out.handles.length;
  if (p.handle === 'push') hw('Толкатель push-to-open', handles, HANDLES.push.price);
  else hw(`Ручка «${HANDLES[p.handle].name}», ${HANDLE_METALS[p.metal].name.toLowerCase()}`, handles, HANDLES[p.handle].price);

  if (H > 2700) out.errors.push('Высота больше 2700 мм');
  out.depthTotal = D + HDF + (sliding ? 90 : FT + (p.handle === 'push' || p.handle === 'edge' ? 0 : 28));
  return out;
}

function handleFor(out, p, key, x0, x1, y0, y1, z, kind, side) {
  if (p.handle === 'push') { out.handles.push({ grp: key, kind: 'push' }); return; }
  const w = x1 - x0, h = y1 - y0;
  if (kind === 'drawer') {
    const count = w > 800 && p.handle !== 'edge' ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const cx = count === 1 ? (x0 + x1) / 2 : x0 + (w * (c + 1)) / 3;
      out.handles.push({ grp: key, kind: p.handle, x: cx, y: p.handle === 'edge' ? y1 : y0 + h * (h > 250 ? 0.78 : 0.5), z, orient: 'h' });
    }
  } else {
    const cx = side === 'left' ? x1 - 45 : x0 + 45;
    const low = y0 < 400 && y1 < 1300;
    const cy = p.handle === 'edge' ? null : low ? y1 - 90 : Math.min(y0 + 1000, (y0 + y1) / 2 + (y1 - y0 > 1400 ? -100 : 0));
    if (p.handle === 'edge') out.handles.push({ grp: key, kind: 'edge', x: side === 'left' ? x1 : x0, y: (y0 + y1) / 2, z, orient: 'v', len: Math.min(h - 100, 400) });
    else out.handles.push({ grp: key, kind: p.handle, x: cx, y: cy, z, orient: 'v' });
  }
}
