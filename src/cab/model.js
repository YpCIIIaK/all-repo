/* ==========================================================================
   Ясень · Конструктор корпусной мебели: модель и правила конструкции
   Все размеры — в миллиметрах. Ось x — вправо, y — вверх, z — к зрителю;
   задняя плоскость корпуса z = 0, передняя кромка z = D.
   Модуль не зависит от браузера и Three.js: его можно запускать в Node и тестировать.
   ========================================================================== */

export const T = 16;          // толщина ЛДСП по умолчанию
export const HDF = 3;         // задняя стенка и дно ящиков
export const GAP = 3;         // зазор между фасадами
export const SHEET = { L: 2800, W: 2070, trim: 10, kerf: 4 };
export const FILLER = 50;     // видимая ширина добора
export const SCRIBE = 20;     // запас добора на подгонку по стене

export const LIMITS = { W: [300, 3600], H: [300, 2700], D: [300, 700], sections: [1, 6], secW: 200 };
export const SLIDES = [250, 300, 350, 400, 450, 500, 550];
export const THICKNESS = [16, 18];

// Плотность, кг/м³, и модуль упругости ЛДСП с учётом ползучести, Н/мм².
export const DENSITY = { ldsp: 650, mdf: 760, hdf: 850, mirror: 2500, glass: 2500 };
export const E_LDSP = 1800;
export const LOADS = {
  clothes: { name: 'Лёгкая: одежда, бельё', kgm2: 50 },
  books:   { name: 'Тяжёлая: книги, посуда', kgm2: 120 },
};

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
export const MIRROR_M2 = 3900;

export const HANDLES = {
  bar128: { name: 'Скоба 128 мм', price: 390, span: 128 },
  bar192: { name: 'Скоба 192 мм', price: 520, span: 192 },
  knob:   { name: 'Кнопка',       price: 290, span: 0 },
  edge:   { name: 'Торцевой профиль', price: 640, span: 0 },
  push:   { name: 'Без ручек (push-to-open)', price: 560, span: 0 },
};
export const HANDLE_METALS = {
  black: { name: 'Чёрный матовый', hex: '#1d1c1b' },
  brass: { name: 'Латунь',         hex: '#c9a25b' },
  steel: { name: 'Сталь',          hex: '#c4c6c8' },
};

export const CELL_KINDS = {
  box:    { name: 'Полка',      short: 'Полка',     min: 120, icon: 'shelf' },
  rail:   { name: 'Штанга',     short: 'Штанга',    min: 800, icon: 'hanger' },
  drawer: { name: 'Ящик',       short: 'Ящик',      min: 110, max: 400, icon: 'drawer' },
  shoes:  { name: 'Обувница',   short: 'Обувница',  min: 320, icon: 'shoe' },
  pants:  { name: 'Брючница',   short: 'Брючница',  min: 650, icon: 'pants' },
  basket: { name: 'Корзина',    short: 'Корзина',   min: 160, max: 320, icon: 'basket' },
};

export const FRONT_KINDS = { door: 'Дверь', glass: 'Стекло', mirror: 'Зеркало', open: 'Открытая' };

/* ------------------------------ шаблоны ------------------------------ */

const cells = (spec) => spec.map((c) => (typeof c === 'string' ? { k: c, h: 'auto' } : { k: c[0], h: c[1] }));
const sec = (front, spec, extra = {}) => ({ w: 'auto', front, hinge: 'auto', cells: cells(spec), ...extra });

export const TEMPLATES = {
  wardrobe: {
    name: 'Шкаф распашной', desc: 'Двери, штанга, полки и ящики',
    p: { W: 1600, H: 2400, D: 580, base: 'plinth', baseH: 80, doors: 'hinged', mezz: 0, load: 'clothes',
      sections: [sec('door', ['box', 'box', 'box', 'box', 'box']), sec('door', [['box', 320], 'rail', ['box', 380]]), sec('door', [['drawer', 180], ['drawer', 180], ['drawer', 180], 'box', 'box', ['box', 380]])] },
  },
  coupe: {
    name: 'Шкаф-купе', desc: 'Раздвижные двери и внутренние ящики',
    p: { W: 2200, H: 2400, D: 600, base: 'plinth', baseH: 80, doors: 'sliding', mezz: 0, load: 'clothes', slideFill: ['panel', 'mirror', 'panel'],
      sections: [sec('door', [['shoes', 360], 'box', 'box', 'box', 'box', ['box', 420]]), sec('door', [['box', 320], 'rail', ['box', 420]]), sec('door', [['drawer', 200], ['drawer', 200], 'rail', ['box', 420]])] },
  },
  hallway: {
    name: 'Шкаф с антресолью', desc: 'Распашной, с верхними дверцами',
    p: { W: 1800, H: 2500, D: 600, base: 'plinth', baseH: 80, doors: 'hinged', mezz: 450, load: 'clothes',
      sections: [sec('door', [['basket', 220], ['basket', 220], 'box', 'box', 'box', ['box', 434]]), sec('mirror', [['pants', 900], 'rail', ['box', 434]]), sec('door', [['drawer', 180], ['drawer', 180], 'rail', ['box', 434]])] },
  },
  rack: {
    name: 'Стеллаж', desc: 'Открытые полки для книг и декора',
    p: { W: 1200, H: 2000, D: 350, base: 'plinth', baseH: 60, doors: 'hinged', mezz: 0, load: 'books',
      sections: [sec('open', ['box', 'box', 'box', 'box', 'box']), sec('open', [['box', 420], 'box', 'box', 'box']), sec('open', ['box', 'box', 'box', 'box', 'box'])] },
  },
  dresser: {
    name: 'Комод', desc: 'Ящики полного выдвижения на ножках',
    p: { W: 1000, H: 880, D: 450, base: 'legs', baseH: 120, doors: 'hinged', mezz: 0, load: 'clothes',
      sections: [sec('open', ['drawer', 'drawer', 'drawer']), sec('open', ['drawer', 'drawer', 'drawer'])] },
  },
  tv: {
    name: 'Тумба под ТВ', desc: 'Двери, ящик и открытая ниша',
    p: { W: 1800, H: 520, D: 420, base: 'legs', baseH: 120, doors: 'hinged', mezz: 0, load: 'clothes',
      sections: [sec('door', ['box', 'box']), sec('open', [['drawer', 170], 'box']), sec('door', ['box', 'box'])] },
  },
  pencil: {
    name: 'Пенал', desc: 'Узкий шкаф для ванной или прихожей',
    p: { W: 500, H: 2100, D: 400, base: 'plinth', baseH: 80, doors: 'hinged', mezz: 0, load: 'clothes',
      sections: [sec('door', [['drawer', 170], ['drawer', 170], 'box', 'box', 'box', 'box'])] },
  },
};

export function fromTemplate(id) {
  const t = TEMPLATES[id];
  return normalize({
    v: 2, tpl: id, name: t.name, th: 16, install: 'free', niche: defaultNiche(t.p),
    body: 'white', front: { kind: 'enamel', id: 'sage' }, handle: 'bar128', metal: 'black',
    ...JSON.parse(JSON.stringify(t.p)),
  });
}

export function defaultNiche(p) {
  const w = (p.W || 1600) + 2 * FILLER, h = (p.H || 2400) + 30;
  return { w: [w, w + 4, w - 3], h: [h, h - 2, h + 3], d: (p.D || 580) + 70, gap: 5, fillers: 'sides', skirting: { h: 0, d: 0 } };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);

/**
 * Приводит проект к допустимому виду. Для установки в нишу пересчитывает
 * габариты корпуса из замеров: по минимальным значениям, за вычетом зазоров и доборов.
 */
export function normalize(p) {
  p.v = 2;
  p.th = THICKNESS.includes(+p.th) ? +p.th : 16;
  p.install = p.install === 'niche' ? 'niche' : 'free';
  const n = p.niche || defaultNiche(p);
  p.niche = {
    w: [0, 1, 2].map((k) => Math.round(clamp(num(n.w?.[k], 1700), 400, 4000))),
    h: [0, 1, 2].map((k) => Math.round(clamp(num(n.h?.[k], 2450), 400, 3200))),
    d: Math.round(clamp(num(n.d, 650), 300, 1200)),
    gap: Math.round(clamp(num(n.gap, 5), 0, 30)),
    fillers: ['none', 'sides', 'all'].includes(n.fillers) ? n.fillers : 'sides',
    skirting: { h: Math.round(clamp(num(n.skirting?.h, 0), 0, 150)), d: Math.round(clamp(num(n.skirting?.d, 0), 0, 40)) },
  };
  if (p.install === 'niche') {
    const f = fitNiche(p.niche);
    p.W = f.W; p.H = f.H;
  }
  p.W = clamp(Math.round(num(p.W, 1000)), ...LIMITS.W);
  p.H = clamp(Math.round(num(p.H, 1000)), ...LIMITS.H);
  p.D = clamp(Math.round(num(p.D, 450)), ...LIMITS.D);
  p.base = p.base === 'legs' ? 'legs' : 'plinth';
  p.baseH = clamp(Math.round(num(p.baseH, 80)), 40, 200);
  p.doors = ['hinged', 'sliding'].includes(p.doors) ? p.doors : 'hinged';
  p.mezz = p.doors === 'hinged' ? clamp(Math.round(num(p.mezz, 0)), 0, 900) : 0;
  if (!LOADS[p.load]) p.load = 'clothes';
  if (!DECORS[p.body]) p.body = 'white';
  if (!p.front || !(p.front.kind === 'enamel' ? ENAMELS : DECORS)[p.front.id]) p.front = { kind: 'decor', id: p.body };
  if (!HANDLES[p.handle]) p.handle = 'bar128';
  if (!HANDLE_METALS[p.metal]) p.metal = 'black';
  p.sections = (p.sections || []).slice(0, LIMITS.sections[1]);
  if (!p.sections.length) p.sections = [sec('door', ['box', 'box', 'box'])];
  for (const s of p.sections) {
    s.w = s.w === 'auto' || !(+s.w > 0) ? 'auto' : Math.round(+s.w);
    if (!FRONT_KINDS[s.front]) s.front = 'door';
    if (!['auto', 'left', 'right'].includes(s.hinge)) s.hinge = 'auto';
    s.cells = (s.cells || []).filter((c) => CELL_KINDS[c.k]).map((c) => ({ k: c.k, h: c.h === 'auto' || !(+c.h > 0) ? 'auto' : Math.round(+c.h) }));
    if (!s.cells.length) s.cells = [{ k: 'box', h: 'auto' }];
  }
  const nd = slidingCount(p.W);
  p.slideFill = Array.from({ length: nd }, (_, k) => (p.slideFill?.[k] === 'mirror' ? 'mirror' : 'panel'));
  return p;
}

export const slidingCount = (W) => Math.max(2, Math.ceil(W / 1000));

/** Габариты корпуса по замерам ниши. */
export function fitNiche(n) {
  const minW = Math.min(...n.w), maxW = Math.max(...n.w), minH = Math.min(...n.h), maxH = Math.max(...n.h);
  const side = n.fillers === 'none' ? n.gap : FILLER;
  const top = n.fillers === 'all' ? FILLER : n.gap * 2;
  return { W: minW - 2 * side, H: minH - top, minW, maxW, minH, maxH, side, top, skewW: maxW - minW, skewH: maxH - minH };
}

/* ------------------------------ расчёт конструкции ------------------------------ */

const hingesByHeight = (h) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5);
const r1 = (v) => Math.round(v * 10) / 10;
const kgPanel = (w, h, t, dens) => (w * h * t * dens) / 1e9;

// Прогиб полки на двух опорах под равномерной нагрузкой: 5qL⁴ / (384EI).
export function shelfSag(span, depth, t, kgm2) {
  const q = kgm2 * (depth / 1000) * 9.81 / 1000;       // Н/мм
  const I = (depth * t ** 3) / 12;
  const sag = (5 * q * span ** 4) / (384 * E_LDSP * I);
  return { sag, limit: span / 250, load: kgm2 * (span / 1000) * (depth / 1000) };
}

/**
 * Возвращает всё, что нужно для 3D, чертежей и спецификации:
 * boxes — панели с положением и свойствами детали, hw — фурнитура,
 * secs — геометрия секций и ячеек, anims — что открывается, warns/errors — проверки.
 */
export function layout(p) {
  const { W, H, D } = p;
  const T = p.th;
  const legs = p.base === 'legs', bh = p.baseH;
  const sliding = p.doors === 'sliding';
  const frontMat = p.front.kind === 'enamel' ? 'enamel' : 'front';
  const FT = p.front.kind === 'enamel' ? 19 : T;
  const frontDens = p.front.kind === 'enamel' ? DENSITY.mdf : DENSITY.ldsp;
  const out = { p, T, FT, boxes: [], hw: [], anims: {}, handles: [], rails: [], legs: [], secs: [], acc: [], shelves: [], joints: [], warns: [], errors: [], notes: [] };
  const hw = (name, qty, price, unit = 'шт.', kind = '') => {
    if (qty <= 0) return;
    const ex = out.hw.find((h) => h.name === name);
    if (ex) ex.qty = +(ex.qty + qty).toFixed(2); else out.hw.push({ name, qty, price, unit, kind });
  };
  const add = (b) => { b.id = out.boxes.length; out.boxes.push(b); return b; };
  const y0 = legs ? bh : 0;
  const conf = D > 450 ? 3 : 2;
  const skirt = p.install === 'niche' && p.niche.skirting.h > 0 && !legs ? p.niche.skirting : null;

  /* ---------- корпус ---------- */
  const sideNote = skirt ? `вырез под плинтус ${skirt.h}×${skirt.d} мм сзади снизу` : '';
  const sideL = add({ role: 'side', side: 'left', mat: 'body', x: 0, y: y0, z: 0, w: T, h: H - y0, d: D, part: { name: 'Боковина левая', len: H - y0, wid: D, e: { l1: 2 }, note: sideNote } });
  const sideR = add({ role: 'side', side: 'right', mat: 'body', x: W - T, y: y0, z: 0, w: T, h: H - y0, d: D, part: { name: 'Боковина правая', len: H - y0, wid: D, e: { l1: 2 }, note: sideNote } });
  const top = add({ role: 'top', mat: 'body', x: T, y: H - T, z: 0, w: W - 2 * T, h: T, d: D, part: { name: 'Крышка', len: W - 2 * T, wid: D, e: { l1: 2 } } });
  const bottom = add({ role: 'bottom', mat: 'body', x: T, y: bh, z: 0, w: W - 2 * T, h: T, d: D, part: { name: 'Дно', len: W - 2 * T, wid: D, e: { l1: 2 } } });
  for (const s of [sideL, sideR]) for (const hz of [top, bottom]) out.joints.push({ a: s.id, b: hz.id, kind: 'side' });
  if (!legs) {
    const back = 30 + (skirt ? skirt.d : 0);
    const pf = add({ role: 'plinth', mat: 'body', x: T, y: 0, z: D - 40 - T, w: W - 2 * T, h: bh, d: T, part: { name: 'Цоколь передний', len: W - 2 * T, wid: bh, e: { l1: 0.4 } } });
    const pb = add({ role: 'plinth', mat: 'body', x: T, y: 0, z: back, w: W - 2 * T, h: Math.min(bh, skirt ? bh : bh), d: T, part: { name: 'Цоколь задний', len: W - 2 * T, wid: bh, e: {} } });
    for (const s of [sideL, sideR]) for (const pl of [pf, pb]) out.joints.push({ a: s.id, b: pl.id, kind: 'plinth' });
    if (skirt && skirt.h > bh) out.warns.push(`Плинтус ${skirt.h} мм выше цоколя — в боковинах будет вырез ${skirt.h}×${skirt.d} мм`);
  }

  // задняя стенка ХДФ, при необходимости — из нескольких частей
  const bw = W - 4, bhh = H - bh - 4;
  const nx = Math.ceil(bw / (SHEET.L - 20)), ny = Math.ceil(bhh / (SHEET.W - 20));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const pw = bw / nx, ph = bhh / ny;
    add({ role: 'back', mat: 'hdf', x: 2 + i * pw, y: bh + 2 + j * ph, z: -HDF, w: pw, h: ph, d: HDF, part: { name: 'Задняя стенка', len: Math.round(Math.max(pw, ph)), wid: Math.round(Math.min(pw, ph)), e: {} } });
  }
  if (nx * ny > 1) out.notes.push(`Задняя стенка из ${nx * ny} частей, стык на соединительном профиле`);
  hw('Саморез 3,5×16 для ХДФ', Math.ceil((2 * (bw + bhh)) / 150) + (nx * ny - 1) * 6, 2, 'шт.', 'fix');
  if (nx * ny > 1) hw('Профиль соединительный для ХДФ', nx * ny - 1, 180);

  /* ---------- секции ---------- */
  const n = p.sections.length;
  const avail = W - 2 * T - (n - 1) * T;
  const fixed = p.sections.reduce((s, x) => s + (x.w === 'auto' ? 0 : x.w), 0);
  const autos = p.sections.filter((x) => x.w === 'auto').length;
  const rest = avail - fixed;
  // без «авто»-секций разницу забирает последняя
  if (autos === 0 && Math.abs(rest) > 0.5) p.sections[n - 1]._dw = rest;
  const autoW = autos ? rest / autos : 0;
  if (autos && autoW < LIMITS.secW) out.errors.push(`Секциям не хватает ширины: на каждую «авто» остаётся ${Math.round(autoW)} мм`);
  const yi0 = bh + T, yi1 = H - T, Hin = yi1 - yi0;
  if (Hin < 120) out.errors.push('Слишком низкий корпус для выбранного основания');
  let x = T;
  const panels = [sideL];      // панели слева от каждой секции и справа от последней
  p.sections.forEach((s, i) => {
    const cw = s.w === 'auto' ? autoW : s.w + (s._dw || 0);
    delete s._dw;
    const S = { i, x0: x, x1: x + cw, cw, cells: [], s };
    out.secs.push(S);
    if (cw < LIMITS.secW) out.errors.push(`Секция ${i + 1}: ширина ${Math.round(cw)} мм меньше ${LIMITS.secW} мм`);
    x += cw;
    if (i < n - 1) {
      const dv = add({ role: 'divider', div: i, mat: 'body', x, y: yi0, z: 0, w: T, h: Hin, d: D, part: { name: 'Перегородка', len: Hin, wid: D, e: { l1: 2 } } });
      out.joints.push({ a: top.id, b: dv.id, kind: 'divider' }, { a: bottom.id, b: dv.id, kind: 'divider' });
      panels.push(dv);
      x += T;
    }
  });
  panels.push(sideR);
  out.secs.forEach((S, i) => { S.left = panels[i].id; S.right = panels[i + 1].id; });
  out.secW = out.secs.map((s) => s.cw);

  const shelfD = D - 20;
  const slideFor = (depth) => SLIDES.filter((l) => l <= depth).pop() || 0;
  const load = LOADS[p.load];

  for (const S of out.secs) {
    const { s, cw, x0, x1, i } = S;
    const cs = s.cells;
    // разделители между ячейками: полки везде, кроме стыка ящик-ящик
    const sep = cs.slice(0, -1).map((c, j) => !(c.k === 'drawer' && cs[j + 1].k === 'drawer'));
    const fixedH = cs.reduce((a, c) => a + (c.h === 'auto' ? 0 : c.h), 0) + sep.filter(Boolean).length * T;
    const nAuto = cs.filter((c) => c.h === 'auto').length;
    const free = Hin - fixedH;
    if (free < (nAuto ? nAuto * 60 : -1)) out.errors.push(`Секция ${i + 1}: ячейки не помещаются по высоте (не хватает ${Math.round(-free + nAuto * 60)} мм)`);
    const autoH = nAuto ? free / nAuto : 0;
    let y = yi0;
    cs.forEach((c, j) => {
      // без «авто»-ячеек разницу по высоте забирает верхняя
      const h = c.h === 'auto' ? autoH : c.h + (!nAuto && j === cs.length - 1 ? free : 0);
      const C = { j, k: c.k, y0: y, y1: y + h, h, auto: c.h === 'auto' };
      S.cells.push(C);
      const K = CELL_KINDS[c.k];
      if (h < K.min - 0.5) out.warns.push(`Секция ${i + 1}: ${K.name.toLowerCase()} высотой ${Math.round(h)} мм — меньше рекомендуемых ${K.min} мм`);
      if (K.max && h > K.max + 0.5) out.warns.push(`Секция ${i + 1}: ${K.name.toLowerCase()} высотой ${Math.round(h)} мм — больше ${K.max} мм, лучше разделить`);
      y += h;
      if (j < cs.length - 1 && sep[j]) {
        const sh = add({ role: 'shelf', sec: i, cell: j, mat: 'body', x: x0 + 1, y, z: 4, w: cw - 2, h: T, d: shelfD, part: { name: 'Полка', len: cw - 2, wid: shelfD, e: { l1: 2 } } });
        C.shelf = sh.id;
        const sg = shelfSag(cw, shelfD, T, load.kgm2);
        out.shelves.push({ sec: i, cell: j, id: sh.id, span: cw, depth: shelfD, ...sg, ok: sg.sag <= sg.limit });
        y += T;
      }
    });
    const worst = out.shelves.filter((q) => q.sec === i && !q.ok).sort((a, b) => b.sag - a.sag)[0];
    if (worst) out.warns.push(`Секция ${i + 1}: полка ${Math.round(worst.span)} мм прогнётся на ${r1(worst.sag).toString().replace('.', ',')} мм под ${Math.round(worst.load)} кг (допустимо ${r1(worst.limit).toString().replace('.', ',')} мм) — сузьте секцию или возьмите плиту 18 мм`);

    /* ---------- аксессуары и штанги ---------- */
    S.cells.forEach((C) => {
      if (C.k === 'rail') {
        out.rails.push({ x0: x0 + 2, x1: x1 - 2, y: C.y1 - 60, z: D / 2, sec: i, cell: C.j });
        hw('Штанга овальная хромированная', r1((cw - 2) / 1000), 650, 'м');
        hw('Штангодержатель', 2, 90);
        if (C.h < 900) out.warns.push(`Секция ${i + 1}: под штангой ${Math.round(C.h)} мм — подойдёт только для коротких вещей`);
      }
      if (C.k === 'shoes') {
        const rows = Math.max(1, Math.min(3, Math.floor((C.h - 40) / 170)));
        out.acc.push({ kind: 'shoes', sec: i, cell: C.j, x0, x1, y0: C.y0, y1: C.y1, rows });
        hw(`Полка для обуви выдвижная наклонная, ${Math.round(cw)} мм`, rows, 2400);
      }
      if (C.k === 'pants') {
        out.acc.push({ kind: 'pants', sec: i, cell: C.j, x0, x1, y0: C.y0, y1: C.y1 });
        hw('Брючница выдвижная с доводчиком', 1, 5600);
        if (cw < 400 || cw > 900) out.warns.push(`Секция ${i + 1}: брючницы выпускаются для секций 400–900 мм`);
        if (D < 450) out.warns.push(`Секция ${i + 1}: для брючницы нужна глубина от 450 мм`);
      }
      if (C.k === 'basket') {
        out.acc.push({ kind: 'basket', sec: i, cell: C.j, x0, x1, y0: C.y0, y1: C.y1 });
        hw(`Корзина сетчатая выдвижная, ${Math.round(cw)} мм`, 1, 2100);
        if (cw < 400 || cw > 900) out.warns.push(`Секция ${i + 1}: сетчатые корзины выпускаются для секций 400–900 мм`);
      }
    });

    /* ---------- фасады ---------- */
    const ox0 = i === 0 ? 0 : x0 - T / 2, ox1 = i === n - 1 ? W : x1 + T / 2;
    const fw = ox1 - ox0 - GAP;
    // ящики снизу подряд — накладные; остальные за дверью — внутренние
    let block = 0;
    while (block < S.cells.length && S.cells[block].k === 'drawer') block++;
    const doorSec = !sliding && s.front !== 'open';
    let doorFrom = bh;
    S.cells.forEach((C, j) => {
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
        add({ role: 'front', kind: 'drawer', sec: i, cell: j, mat: frontMat, x: fx0, y: fy0, z: fz0, w: fx1 - fx0, h: fh, d: FT, grp: key, front: true, part: { name: 'Фасад ящика', len: fx1 - fx0, wid: fh, e: frontMat === 'front' ? { l1: 2, l2: 2, w1: 2, w2: 2 } : {}, t: FT } });
        handleFor(out, p, key, fx0, fx1, fy0, fy1, D + FT, 'drawer');
      } else {
        // внутренний ящик: фасад из ЛДСП корпуса внутри секции
        const setback = sliding ? 0 : 22;
        fx0 = x0 + 2; fx1 = x1 - 2; fy0 = C.y0 + 2; fy1 = C.y1 - 2; fz0 = D - setback - T;
        depth = D - setback - T - 10;
        add({ role: 'front', kind: 'drawer', inner: true, sec: i, cell: j, mat: 'body', x: fx0, y: fy0, z: fz0, w: fx1 - fx0, h: fy1 - fy0, d: T, grp: key, part: { name: 'Фасад внутреннего ящика', len: fx1 - fx0, wid: fy1 - fy0, e: { l1: 2, l2: 2, w1: 2, w2: 2 } } });
        hw('Ручка врезная для внутреннего ящика', 1, 260);
      }
      const L = slideFor(depth - 10);
      if (!L) { out.errors.push(`Секция ${i + 1}: слишком мелкий корпус для ящика`); return; }
      const bw2 = cw - 26, hb = Math.max(70, Math.min(250, Math.floor((C.h - 40) / 10) * 10));
      const bz1 = fz0 - 2, bz0 = bz1 - L, by = C.y0 + 15;
      const dPart = (name, len, wid, e) => ({ name, len, wid, e });
      add({ role: 'dbox', dpart: 'side', sec: i, cell: j, mat: 'drawer', x: x0 + 13, y: by, z: bz0, w: T, h: hb, d: L, grp: key, part: dPart('Ящик: боковина', L, hb, { l1: 0.4 }) });
      add({ role: 'dbox', dpart: 'side', sec: i, cell: j, mat: 'drawer', x: x1 - 13 - T, y: by, z: bz0, w: T, h: hb, d: L, grp: key, part: dPart('Ящик: боковина', L, hb, { l1: 0.4 }) });
      add({ role: 'dbox', dpart: 'wall', sec: i, cell: j, mat: 'drawer', x: x0 + 13 + T, y: by, z: bz1 - T, w: bw2 - 2 * T, h: hb, d: T, grp: key, part: dPart('Ящик: передняя и задняя стенки', bw2 - 2 * T, hb, { l1: 0.4 }) });
      add({ role: 'dbox', dpart: 'wall', sec: i, cell: j, mat: 'drawer', x: x0 + 13 + T, y: by, z: bz0, w: bw2 - 2 * T, h: hb, d: T, grp: key, part: dPart('Ящик: передняя и задняя стенки', bw2 - 2 * T, hb, { l1: 0.4 }) });
      add({ role: 'dbottom', sec: i, cell: j, mat: 'hdf', x: x0 + 14, y: by - HDF, z: bz0 + 1, w: bw2 - 2, h: HDF, d: L - 2, grp: key, part: dPart('Ящик: дно', L - 2, bw2 - 2, {}) });
      out.anims[key] = { type: 'drawer', travel: L * 0.85, delay: (i * 0.05 + j * 0.07) % 0.4 };
      C.drawer = { L, by, hb, fz0, overlay };
      hw(`Направляющие полного выдвижения с доводчиком ${L} мм, пара`, 1, 1650);
      hw('Конфирмат 7×50', hb > 100 ? 8 : 4, 6, 'шт.', 'fix');
    });

    /* ---------- двери секции ---------- */
    if (doorSec) {
      const dy0 = doorFrom === bh ? bh + GAP / 2 : doorFrom, dy1 = H - GAP / 2;
      // антресоль: деление дверей по полке, ближайшей к заданной высоте
      let zones = [[dy0, dy1]];
      if (p.mezz > 0) {
        const target = H - T - p.mezz;
        const cand = S.cells.filter((C) => C.shelf != null).map((C) => out.boxes[C.shelf]).sort((a, b) => Math.abs(a.y - target) - Math.abs(b.y - target))[0];
        if (cand && Math.abs(cand.y - target) < 220 && cand.y > dy0 + 300) {
          const mid = cand.y + T / 2;
          zones = [[dy0, mid - GAP / 2], [mid + GAP / 2, dy1]];
          cand.fixed = true;
          cand.part.name = 'Полка стационарная';
          out.joints.push({ a: S.left, b: cand.id, kind: 'shelf' }, { a: S.right, b: cand.id, kind: 'shelf' });
        } else out.warns.push(`Секция ${i + 1}: нет полки рядом с высотой антресоли — двери не разделены`);
      }
      zones.forEach(([zy0, zy1], z) => {
        const dh = zy1 - zy0;
        if (dh < 150) return;
        const leaves = fw > 600 ? 2 : 1;
        const lw = (fw - (leaves - 1) * GAP) / leaves;
        if (lw > 600) out.warns.push(`Секция ${i + 1}: створка шириной ${Math.round(lw)} мм — тяжёлая, лучше сузить секцию`);
        for (let k = 0; k < leaves; k++) {
          const lx0 = ox0 + GAP / 2 + k * (lw + GAP);
          // авто: створки открываются парами, ручки сходятся к середине пары
          const auto = n === 1 ? 'left' : i % 2 === 0 && !(i === n - 1) ? 'left' : 'right';
          const side = leaves === 2 ? (k === 0 ? 'left' : 'right') : s.hinge !== 'auto' ? s.hinge : auto;
          const key = `door:${i}:${z}${k}`;
          const glass = s.front === 'glass', mirror = s.front === 'mirror';
          const mass = glass ? kgPanel(lw, dh, 4, DENSITY.glass) + (2 * (lw + dh) * 0.9) / 1000 : kgPanel(lw, dh, FT, frontDens) + (mirror ? kgPanel(lw - 60, dh - 60, 4, DENSITY.mirror) : 0);
          const hc = Math.max(hingesByHeight(dh), Math.ceil(mass / 6));
          const hinges = Array.from({ length: hc }, (_, m) => Math.round(m === 0 ? 100 : m === hc - 1 ? dh - 100 : 100 + ((dh - 200) * m) / (hc - 1)));
          add({ role: glass ? 'glass' : 'front', kind: 'door', sec: i, zone: z, mat: glass ? 'glass' : frontMat, mirror, x: lx0, y: zy0, z: D, w: lw, h: dh, d: glass ? 20 : FT, grp: key, front: true, hingeSide: side, hinges, mass, panel: side === 'left' ? S.left : S.right,
            part: glass ? null : { name: mirror ? 'Дверь под зеркало' : 'Дверь', len: dh, wid: lw, e: frontMat === 'front' ? { l1: 2, l2: 2, w1: 2, w2: 2 } : {}, t: FT, note: `петли ${side === 'left' ? 'слева' : 'справа'}: ${hinges.join(' / ')} мм от низа` } });
          if (glass) hw(`Фасад в алюминиевом профиле со стеклом ${Math.round(dh)}×${Math.round(lw)}`, 1, Math.round((dh * lw) / 1e6 * 9800 + 2400));
          if (mirror) hw(`Зеркало 4 мм с плёнкой ${Math.round(dh - 60)}×${Math.round(lw - 60)}`, 1, Math.round(((dh - 60) * (lw - 60)) / 1e6 * MIRROR_M2 + 400));
          out.anims[key] = { type: 'door', side, px: side === 'left' ? lx0 : lx0 + lw, pz: D, delay: i * 0.06 + k * 0.04 + z * 0.1 };
          hw(glass ? 'Петля для алюминиевого профиля с доводчиком' : 'Петля накладная 110° с доводчиком', hc, glass ? 520 : 340);
          handleFor(out, p, key, lx0, lx0 + lw, zy0, zy1, D + (glass ? 20 : FT), 'door', side, z === 1);
        }
      });
    }
  }

  /* ---------- двери-купе ---------- */
  if (sliding) {
    const nd = slidingCount(W), ov = 30;
    const lw = (W + (nd - 1) * ov) / nd, dy0 = bh + 12, dh = H - bh - 40;
    if (lw < 500 || lw > 1100) out.warns.push(`Ширина двери-купе ${Math.round(lw)} мм — вне рекомендуемых 500–1100 мм`);
    for (let k = 0; k < nd; k++) {
      const key = `slide:${k}`, track = k % 2, mirror = p.slideFill[k] === 'mirror';
      add({ role: 'sliding', kind: 'slide', mat: frontMat, mirror, x: k * (lw - ov), y: dy0, z: D + 12 + track * 40, w: lw, h: dh, d: 26, grp: key, front: true,
        part: mirror ? null : { name: 'Вставка двери-купе', len: Math.round(dh - 40), wid: Math.round(lw - 40), e: {}, t: frontMat === 'enamel' ? 19 : 10 } });
      if (mirror) hw(`Зеркало 4 мм в профиль купе ${Math.round(dh - 40)}×${Math.round(lw - 40)}`, 1, Math.round(((dh - 40) * (lw - 40)) / 1e6 * MIRROR_M2 + 600));
      out.anims[key] = { type: 'slide', dx: track ? -(lw - ov) : 0, delay: 0 };
      hw('Профиль двери-купе, комплект на дверь', 1, 4200);
      hw('Ролики двери-купе, комплект', 1, 1300);
    }
    hw('Направляющая купе верхняя', r1(W / 1000), 950, 'м');
    hw('Направляющая купе нижняя', r1(W / 1000), 520, 'м');
    out.sliding = { n: nd, lw, dy0, dh };
    if (D < 450) out.warns.push('Для штанги и купе глубина корпуса обычно не меньше 450 мм');
  }

  /* ---------- установка в нишу: доборы ---------- */
  if (p.install === 'niche') {
    const f = fitNiche(p.niche);
    out.niche = { ...p.niche, ...f };
    const fz = sliding ? D + 12 : D, fd = sliding ? 66 : FT;
    if (p.niche.fillers !== 'none') {
      for (const [xx, nm] of [[-FILLER, 'левый'], [W, 'правый']]) {
        add({ role: 'filler', mat: frontMat, x: xx, y: 0, z: fz, w: FILLER, h: H, d: Math.min(fd, FT), front: true,
          part: { name: `Добор ${nm}`, len: H, wid: FILLER + SCRIBE, e: frontMat === 'front' ? { l1: 2 } : {}, t: FT, note: `ширина с запасом ${SCRIBE} мм на подгонку по стене` } });
      }
      hw('Уголок крепёжный для добора', 6, 25);
    }
    if (p.niche.fillers === 'all') {
      add({ role: 'filler', mat: frontMat, x: -FILLER, y: H, z: fz, w: W + 2 * FILLER, h: FILLER, d: Math.min(fd, FT), front: true,
        part: { name: 'Добор верхний', len: W + 2 * FILLER, wid: FILLER + SCRIBE, e: frontMat === 'front' ? { l1: 2 } : {}, t: FT, note: `ширина с запасом ${SCRIBE} мм на подгонку по потолку` } });
      hw('Уголок крепёжный для добора', 4, 25);
    }
    if (f.skewW > 15) out.warns.push(`Ниша сужается на ${f.skewW} мм — доборы подрезаются по месту`);
    if (f.skewH > 15) out.warns.push(`Перепад высоты ниши ${f.skewH} мм — проверьте уровень пола`);
    if (p.niche.fillers === 'none' && (f.skewW > 10 || f.skewH > 10)) out.warns.push('Ниша неровная — рекомендуем доборы, чтобы закрыть щели');
    const needD = D + (sliding ? 90 : FT + 5);
    if (needD > p.niche.d) out.warns.push(`Глубина ниши ${p.niche.d} мм, а шкаф с фасадами — ${Math.round(needD)} мм: он будет выступать`);
  }

  /* ---------- опоры и крепёж ---------- */
  if (legs) {
    const xs = [70, ...out.secs.slice(0, -1).map((S) => S.x1 + T / 2), W - 70];
    const used = W > 1200 ? xs : [70, W - 70];
    for (const lx of used) for (const lz of [70, D - 70]) out.legs.push({ x: lx, z: lz, h: bh });
    hw(`Опора мебельная h=${bh} мм`, out.legs.length, 320);
    hw('Монтажная планка для опор', out.legs.length, 40);
    hw('Саморез 4×16', out.legs.length * 4, 2, 'шт.', 'fix');
  } else {
    hw('Регулируемая опора под цоколь', W > 1200 ? 6 : 4, 60);
  }
  const shelfSupports = out.boxes.filter((b) => b.role === 'shelf' && !b.fixed).length * 4;
  hw('Полкодержатель с фиксатором', shelfSupports, 12);
  const jc = out.joints.reduce((a, j) => a + (j.kind === 'plinth' ? (bh > 90 ? 2 : 1) : conf), 0);
  hw('Конфирмат 7×50', jc, 6, 'шт.', 'fix');
  hw('Заглушка для конфирмата', out.joints.filter((j) => j.kind === 'side' || j.kind === 'shelf').length * conf, 3);
  if (H > 1600) { hw('Крепление к стене', 2, 140); out.notes.push('Корпус выше 1600 мм обязательно крепится к стене'); }
  const handles = out.handles.length;
  if (p.handle === 'push') hw('Толкатель push-to-open', handles, HANDLES.push.price);
  else hw(`Ручка «${HANDLES[p.handle].name}», ${HANDLE_METALS[p.metal].name.toLowerCase()}`, handles, HANDLES[p.handle].price);
  hw('Винт М4 для ручки', p.handle === 'push' ? 0 : out.handles.reduce((a, h) => a + (HANDLES[p.handle].span ? 2 : 1), 0), 4, 'шт.', 'fix');

  if (H > 2700) out.errors.push('Высота больше 2700 мм');
  if (H - y0 > SHEET.L - 2 * SHEET.trim) out.errors.push('Боковина длиннее листа ЛДСП 2780 мм');
  out.depthTotal = D + HDF + (sliding ? 90 : FT + (p.handle === 'push' || p.handle === 'edge' ? 0 : 28));
  return out;
}

function handleFor(out, p, key, x0, x1, y0, y1, z, kind, side, upper) {
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
    const cy = upper ? y0 + Math.min(110, h / 2) : low ? y1 - 90 : Math.min(y0 + 1000, (y0 + y1) / 2 + (y1 - y0 > 1400 ? -100 : 0));
    if (p.handle === 'edge') out.handles.push({ grp: key, kind: 'edge', x: side === 'left' ? x1 : x0, y: (y0 + y1) / 2, z, orient: 'v', len: Math.min(h - 100, 400) });
    else out.handles.push({ grp: key, kind: p.handle, x: cx, y: cy, z, orient: 'v' });
  }
}
