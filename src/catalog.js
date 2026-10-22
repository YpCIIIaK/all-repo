/* ==========================================================================
   Ясень · каталог: товары, опции, цены
   ========================================================================== */

import { FABRICS, WOODS, METALS, STONES, CERAMICS, RUGS, FINISH_SETS } from './materials.js';
import { MODELS } from './models.js';

export const CATEGORIES = [
  { id: 'sofas',   name: 'Диваны',          one: 'Диван' },
  { id: 'chairs',  name: 'Кресла и пуфы',   one: 'Кресло' },
  { id: 'dining',  name: 'Стулья',          one: 'Стул' },
  { id: 'tables',  name: 'Столы',           one: 'Стол' },
  { id: 'storage', name: 'Хранение',        one: 'Хранение' },
  { id: 'beds',    name: 'Кровати',         one: 'Кровать' },
  { id: 'light',   name: 'Свет',            one: 'Светильник' },
  { id: 'decor',   name: 'Декор',           one: 'Декор' },
];

const ALL_FABRICS = Object.keys(FABRICS);
const SOFT = ALL_FABRICS.filter((k) => !k.startsWith('leather'));
const LEGS = ['oak', 'walnut', 'ash-black'];

const size = (label, mul, params) => ({ id: label.replace(/\D+/g, '-').replace(/^-|-$/g, ''), label, mul, params });

export const PRODUCTS = [
  {
    id: 'oslo', model: 'oslo', cat: 'sofas', name: 'Осло', kind: 'Диван трёхместный', price: 89900, badge: 'hit',
    text: 'Глубокая посадка, съёмные чехлы и подушки с пухом в оболочке. Диван, на котором удобно и читать, и спать днём.',
    opts: [
      { key: 'size', label: 'Ширина', values: [size('190 см', 1, { w: 1.9 }), size('220 см', 1.12, { w: 2.2 }), size('250 см', 1.24, { w: 2.5 })] },
      { key: 'fabric', label: 'Обивка', values: ALL_FABRICS },
      { key: 'wood', label: 'Ножки', values: LEGS },
    ],
    defaults: { size: '220', fabric: 'linen-sand', wood: 'oak' },
    specs: [['Каркас', 'Массив сосны, фанера'], ['Наполнение сиденья', 'ППУ высокой упругости + пух'], ['Чехлы', 'Съёмные, стирка 30 °C'], ['Высота сиденья', '46 см'], ['Гарантия', '5 лет на каркас']],
  },
  {
    id: 'bergen', model: 'bergen', cat: 'sofas', name: 'Берген', kind: 'Угловой диван', price: 149900, badge: 'new',
    text: 'Низкий модульный диван с оттоманкой. Широкие сиденья, металлические опоры и угол, который ставится слева или справа.',
    opts: [
      { key: 'size', label: 'Размер', values: [size('260 × 165 см', 1, { w: 2.6, d: 1.65 }), size('300 × 180 см', 1.15, { w: 3.0, d: 1.8 })] },
      { key: 'side', label: 'Угол', values: [{ id: 'right', label: 'Справа' }, { id: 'left', label: 'Слева' }] },
      { key: 'fabric', label: 'Обивка', values: SOFT },
      { key: 'metal', label: 'Опоры', values: ['black', 'brass'] },
    ],
    defaults: { size: '260-165', side: 'right', fabric: 'chenille-sky', metal: 'black' },
    specs: [['Каркас', 'Массив берёзы, фанера'], ['Наполнение', 'ППУ, холлофайбер'], ['Механизм', 'Без механизма, модули соединяются'], ['Высота сиденья', '43 см'], ['Гарантия', '5 лет на каркас']],
  },
  {
    id: 'mira', model: 'mira', cat: 'sofas', name: 'Мира', kind: 'Диван полукруглый', price: 124900, badge: 'new',
    text: 'Мягкая дуга и вертикальная стёжка спинки. Красиво смотрится посреди комнаты и любит велюр.',
    opts: [
      { key: 'size', label: 'Ширина', values: [size('190 см', 1, { w: 1.9 }), size('230 см', 1.14, { w: 2.3 })] },
      { key: 'fabric', label: 'Обивка', values: SOFT },
      { key: 'wood', label: 'Цоколь', values: LEGS },
    ],
    defaults: { size: '230', fabric: 'velvet-emerald', wood: 'ash-black' },
    specs: [['Каркас', 'Гнутая фанера, массив'], ['Наполнение', 'ППУ разной плотности'], ['Стёжка', 'Вертикальные каналы'], ['Высота сиденья', '42 см'], ['Гарантия', '5 лет на каркас']],
  },
  {
    id: 'lund', model: 'lund', cat: 'chairs', name: 'Лунд', kind: 'Кресло для отдыха', price: 54900, badge: 'hit',
    text: 'Открытый деревянный каркас с подлокотниками и свободные подушки. Классика середины века в спокойных пропорциях.',
    opts: [
      { key: 'fabric', label: 'Обивка', values: ALL_FABRICS },
      { key: 'wood', label: 'Каркас', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
    ],
    defaults: { fabric: 'leather-cognac', wood: 'oak' },
    specs: [['Каркас', 'Массив дуба или ореха'], ['Подушки', 'ППУ + холлофайбер, съёмные'], ['Высота сиденья', '42 см'], ['Нагрузка', 'до 130 кг'], ['Гарантия', '5 лет']],
  },
  {
    id: 'kokon', model: 'kokon', cat: 'chairs', name: 'Кокон', kind: 'Кресло-бочонок', price: 48900,
    text: 'Круглое кресло, обнимающее со всех сторон. Особенно уютно в букле.',
    opts: [
      { key: 'fabric', label: 'Обивка', values: SOFT },
      { key: 'wood', label: 'Основание', values: LEGS },
    ],
    defaults: { fabric: 'boucle-ivory', wood: 'oak' },
    specs: [['Каркас', 'Фанера, гнутый массив'], ['Наполнение', 'ППУ, синтепух'], ['Высота сиденья', '43 см'], ['Гарантия', '3 года']],
  },
  {
    id: 'cloud', model: 'cloud', cat: 'chairs', name: 'Облако', kind: 'Пуф', price: 14900, old: 17900,
    text: 'Пуф с мягкими рёбрами. Подставка для ног, лишнее место для гостя и просто красивый объект.',
    opts: [{ key: 'fabric', label: 'Обивка', values: SOFT }],
    defaults: { fabric: 'velvet-terra' },
    specs: [['Основа', 'Фанера, ППУ'], ['Высота', '43 см'], ['Гарантия', '2 года']],
  },
  {
    id: 'vena', model: 'vena', cat: 'dining', name: 'Вена', kind: 'Стул обеденный', price: 12900, badge: 'hit',
    text: 'Гнутая спинка, мягкое сиденье и тонкие ножки. Лёгкий стул для кухни и столовой.',
    opts: [
      { key: 'wood', label: 'Дерево', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
      { key: 'fabric', label: 'Сиденье', values: ALL_FABRICS },
    ],
    defaults: { wood: 'walnut', fabric: 'linen-milk' },
    specs: [['Каркас', 'Массив бука'], ['Сиденье', 'ППУ, ткань'], ['Высота сиденья', '47 см'], ['Нагрузка', 'до 120 кг'], ['Гарантия', '3 года']],
  },
  {
    id: 'fjord', model: 'fjord', cat: 'dining', name: 'Фьорд', kind: 'Стул мягкий', price: 18900,
    text: 'Мягкое сиденье и изогнутая спинка на тонких металлических ножках. Удобный стул для долгих ужинов.',
    opts: [
      { key: 'fabric', label: 'Обивка', values: ALL_FABRICS },
      { key: 'metal', label: 'Ножки', values: ['black', 'brass', 'steel'] },
    ],
    defaults: { fabric: 'mat-mustard', metal: 'black' },
    specs: [['Каркас', 'Сталь, гнутая фанера'], ['Наполнение', 'ППУ'], ['Высота сиденья', '48 см'], ['Гарантия', '3 года']],
  },
  {
    id: 'bar', model: 'bar', cat: 'dining', name: 'Ритм', kind: 'Барный стул', price: 15900,
    text: 'Круглое мягкое сиденье, тонкий каркас и кольцо для ног. Две высоты: для стойки и для острова.',
    opts: [
      { key: 'size', label: 'Высота', values: [size('65 см', 1, { h: 0.65 }), size('75 см', 1.05, { h: 0.75 })] },
      { key: 'fabric', label: 'Сиденье', values: ALL_FABRICS },
      { key: 'metal', label: 'Каркас', values: ['black', 'brass', 'steel'] },
    ],
    defaults: { size: '75', fabric: 'leather-black', metal: 'brass' },
    specs: [['Каркас', 'Сталь, порошковая краска или латунное покрытие'], ['Сиденье', 'ППУ'], ['Гарантия', '3 года']],
  },
  {
    id: 'tur', model: 'tur', cat: 'tables', name: 'Тур', kind: 'Обеденный стол', price: 79900, badge: 'hit',
    text: 'Столешница из массива с мягкой фаской на сужающихся ножках. За ним помещается вся семья.',
    opts: [
      { key: 'size', label: 'Размер', values: [size('160 × 90 см', 1, { w: 1.6, d: 0.9 }), size('200 × 95 см', 1.18, { w: 2.0, d: 0.95 }), size('240 × 100 см', 1.36, { w: 2.4, d: 1.0 })] },
      { key: 'wood', label: 'Дерево', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
    ],
    defaults: { size: '200-95', wood: 'oak' },
    specs: [['Материал', 'Массив дуба или ореха, 40 мм'], ['Покрытие', 'Масло с твёрдым воском'], ['Высота', '75 см'], ['Мест', '6–10'], ['Гарантия', '5 лет']],
  },
  {
    id: 'luna', model: 'luna', cat: 'tables', name: 'Луна', kind: 'Журнальный стол', price: 42900,
    text: 'Круглая каменная столешница на точёной деревянной опоре. Камень полируется вручную.',
    opts: [
      { key: 'size', label: 'Диаметр', values: [size('80 см', 1, { r: 0.4 }), size('100 см', 1.25, { r: 0.5 })] },
      { key: 'stone', label: 'Камень', values: Object.keys(STONES) },
      { key: 'wood', label: 'Опора', values: LEGS },
    ],
    defaults: { size: '80', stone: 'travertine', wood: 'oak' },
    specs: [['Столешница', 'Натуральный камень, 32 мм'], ['Опора', 'Точёный массив'], ['Высота', '38 см'], ['Гарантия', '3 года']],
  },
  {
    id: 'plato', model: 'plato', cat: 'tables', name: 'Плато', kind: 'Журнальный стол', price: 32900,
    text: 'Две полки в тонкой стальной раме: на нижнюю отлично ложатся книги и журналы.',
    opts: [
      { key: 'wood', label: 'Полки', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
      { key: 'metal', label: 'Рама', values: ['black', 'brass', 'steel'] },
    ],
    defaults: { wood: 'walnut', metal: 'black' },
    specs: [['Рама', 'Сталь 22 × 22 мм'], ['Полки', 'Шпонированный МДФ'], ['Размер', '110 × 60 × 42 см'], ['Гарантия', '3 года']],
  },
  {
    id: 'drop', model: 'drop', cat: 'tables', name: 'Капля', kind: 'Приставной столик', price: 16900, old: 19900,
    text: 'Небольшой столик на тонкой ножке: для чашки у кресла или лампы у дивана.',
    opts: [
      { key: 'stone', label: 'Камень', values: Object.keys(STONES) },
      { key: 'metal', label: 'Ножка', values: ['black', 'brass', 'steel'] },
    ],
    defaults: { stone: 'carrara', metal: 'brass' },
    specs: [['Столешница', 'Натуральный камень'], ['Высота', '52 см'], ['Диаметр', '45 см'], ['Гарантия', '2 года']],
  },
  {
    id: 'nordic', model: 'nordic', cat: 'storage', name: 'Нордик', kind: 'Комод', price: 49900, badge: 'hit',
    text: 'Ящики на доводчиках, наклонные ножки и круглые ручки. Попробуйте открыть ящики в 3D.',
    opts: [
      { key: 'size', label: 'Ширина', values: [size('80 см', 1, { w: 0.8 }), size('120 см', 1.3, { w: 1.2 })] },
      { key: 'wood', label: 'Корпус', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
      { key: 'metal', label: 'Ручки', values: ['brass', 'black', 'steel'] },
    ],
    defaults: { size: '120', wood: 'oak-white', metal: 'brass' },
    specs: [['Корпус', 'Шпонированный МДФ, массив'], ['Направляющие', 'Скрытые, с доводчиком'], ['Глубина', '45 см'], ['Высота', '84 см'], ['Гарантия', '5 лет']],
  },
  {
    id: 'kadr', model: 'kadr', cat: 'storage', name: 'Кадр', kind: 'ТВ-тумба', price: 64900, badge: 'new',
    text: 'Рифлёные фасады из массива, полка внутри и цоколь в тон. Дверцы открываются нажатием.',
    opts: [
      { key: 'size', label: 'Ширина', values: [size('160 см', 1, { w: 1.6 }), size('200 см', 1.2, { w: 2.0 })] },
      { key: 'wood', label: 'Дерево', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
    ],
    defaults: { size: '200', wood: 'walnut' },
    specs: [['Корпус', 'Шпонированный МДФ'], ['Фасады', 'Рифлёный массив'], ['Открывание', 'Push-to-open'], ['Высота', '56 см'], ['Гарантия', '5 лет']],
  },
  {
    id: 'ritm', model: 'ritm', cat: 'storage', name: 'Ритм', kind: 'Стеллаж', price: 38900,
    text: 'Стальная рама и пять деревянных полок. Подходит и для книг, и как лёгкая перегородка.',
    opts: [
      { key: 'size', label: 'Ширина', values: [size('90 см', 1, { w: 0.9 }), size('120 см', 1.22, { w: 1.2 })] },
      { key: 'wood', label: 'Полки', values: ['oak', 'oak-white', 'walnut', 'ash-black'] },
      { key: 'metal', label: 'Рама', values: ['black', 'brass', 'steel'] },
      { key: 'decor', label: 'В 3D', values: [{ id: 'on', label: 'С книгами' }, { id: 'off', label: 'Пустой' }], cosmetic: true },
    ],
    defaults: { size: '90', wood: 'oak', metal: 'black', decor: 'on' },
    specs: [['Рама', 'Сталь 20 × 20 мм'], ['Полки', 'Массив, 24 мм'], ['Нагрузка на полку', 'до 30 кг'], ['Высота', '180 см'], ['Гарантия', '5 лет']],
  },
  {
    id: 'son', model: 'son', cat: 'beds', name: 'Сон', kind: 'Кровать с мягким изголовьем', price: 94900, badge: 'hit',
    text: 'Высокое стёганое изголовье и мягкая царга. Основание с ламелями и место для хранения под крышкой.',
    opts: [
      { key: 'size', label: 'Спальное место', values: [size('140 × 200', 1, { w: 1.4 }), size('160 × 200', 1.1, { w: 1.6 }), size('180 × 200', 1.2, { w: 1.8 })] },
      { key: 'fabric', label: 'Обивка', values: SOFT },
    ],
    defaults: { size: '160-200', fabric: 'boucle-oat' },
    specs: [['Каркас', 'Массив сосны, фанера'], ['Основание', 'Ортопедические ламели'], ['Хранение', 'Подъёмный механизм'], ['Матрас', 'Не входит в комплект'], ['Гарантия', '5 лет']],
  },
  {
    id: 'kupol', model: 'kupol', cat: 'light', name: 'Купол', kind: 'Торшер-дуга', price: 36900,
    text: 'Высокая дуга выносит свет к центру комнаты. Тяжёлое каменное основание держит её устойчиво. Включите лампу в 3D.',
    opts: [
      { key: 'metal', label: 'Металл', values: ['brass', 'black', 'steel'] },
      { key: 'stone', label: 'Основание', values: Object.keys(STONES) },
    ],
    defaults: { metal: 'brass', stone: 'nero' },
    specs: [['Высота', '210 см'], ['Вынос', '130 см'], ['Цоколь', 'E27, до 60 Вт'], ['Гарантия', '2 года']],
  },
  {
    id: 'grib', model: 'grib', cat: 'light', name: 'Гриб', kind: 'Настольная лампа', price: 9900, badge: 'new',
    text: 'Керамическая ножка и опаловый плафон дают мягкий рассеянный свет. Хороша на тумбочке у кровати.',
    opts: [{ key: 'ceramic', label: 'Керамика', values: Object.keys(CERAMICS) }],
    defaults: { ceramic: 'cer-sage' },
    specs: [['Материал', 'Керамика, опаловое стекло'], ['Высота', '34 см'], ['Цоколь', 'E14, до 25 Вт'], ['Гарантия', '2 года']],
  },
  {
    id: 'dyuna', model: 'dyuna', cat: 'decor', name: 'Дюна', kind: 'Ковёр шерстяной', price: 27900,
    text: 'Шерсть ручного тафтинга, рисунок с волнами в тон основы. Мягкий и плотный.',
    opts: [
      { key: 'size', label: 'Размер', values: [size('160 × 230 см', 1, { w: 2.3, d: 1.6 }), size('200 × 300 см', 1.6, { w: 3.0, d: 2.0 })] },
      { key: 'rug', label: 'Цвет', values: Object.keys(RUGS) },
    ],
    defaults: { size: '200-300', rug: 'rug-sand' },
    specs: [['Состав', '100% шерсть'], ['Высота ворса', '12 мм'], ['Основа', 'Хлопок'], ['Уход', 'Сухая чистка']],
  },
  {
    id: 'olive', model: 'olive', cat: 'decor', name: 'Олива', kind: 'Дерево в кашпо', price: 11900,
    text: 'Искусственная олива ростом 130 см. Неотличима от живой и не требует полива.',
    opts: [{ key: 'ceramic', label: 'Кашпо', values: Object.keys(CERAMICS) }],
    defaults: { ceramic: 'cer-terra' },
    specs: [['Высота', '130 см'], ['Кашпо', 'Керамика, Ø 35 см'], ['Листья', 'Текстиль с пропиткой']],
  },
];

export const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/* ------------------------------ опции и цены ------------------------------ */

export const FINISH_KIND = { fabric: 'fabric', wood: 'wood', metal: 'metal', stone: 'stone', ceramic: 'ceramic', rug: 'rug' };

// Значение опции → объект { id, label, hex?, add?, mul?, params? }
export function optionValues(opt) {
  const set = FINISH_SETS[opt.key];
  return opt.values.map((v) => (typeof v === 'string' ? { id: v, label: set[v].name, hex: set[v].hex, add: set[v].add || 0, type: set[v].type } : v));
}

export function normalizeCfg(p, cfg = {}) {
  const out = {};
  for (const opt of p.opts) {
    const vals = optionValues(opt);
    out[opt.key] = vals.some((v) => v.id === cfg[opt.key]) ? cfg[opt.key] : p.defaults[opt.key] ?? vals[0].id;
  }
  return out;
}

export function priceOf(p, cfg) {
  cfg = normalizeCfg(p, cfg);
  let mul = 1, add = 0;
  for (const opt of p.opts) {
    const v = optionValues(opt).find((x) => x.id === cfg[opt.key]);
    if (v?.mul) mul *= v.mul;
    if (v?.add) add += v.add;
  }
  const raw = p.price * mul * (1 + add);
  const r = Math.round(raw / 1000) * 1000 - 100;
  return Math.max(r, 900);
}

export function oldPriceOf(p, cfg) {
  return p.old ? Math.round((priceOf(p, cfg) * p.old) / p.price / 1000) * 1000 - 100 : 0;
}

// Параметры для генератора модели.
export function modelParams(p, cfg) {
  cfg = normalizeCfg(p, cfg);
  const o = {};
  for (const opt of p.opts) {
    const v = optionValues(opt).find((x) => x.id === cfg[opt.key]);
    if (opt.key === 'size') Object.assign(o, v.params);
    else if (opt.key === 'decor') o.decor = v.id === 'on';
    else o[opt.key] = v.id;
  }
  return o;
}

export function buildModel(p, cfg) {
  const g = MODELS[p.model](modelParams(p, cfg));
  g.userData.productId = p.id;
  return g;
}

export function cfgKey(p, cfg) {
  cfg = normalizeCfg(p, cfg);
  return p.id + ':' + p.opts.map((o) => cfg[o.key]).join(',');
}

// Короткое описание выбранной конфигурации: «220 см · Лён · песок · Дуб натуральный»
export function cfgSummary(p, cfg) {
  cfg = normalizeCfg(p, cfg);
  return p.opts.filter((o) => !o.cosmetic).map((o) => optionValues(o).find((v) => v.id === cfg[o.key]).label).join(' · ');
}

export function swatchesOf(p) {
  const main = p.opts.find((o) => ['fabric', 'rug', 'ceramic', 'stone', 'wood', 'metal'].includes(o.key));
  return main ? optionValues(main).filter((v) => v.hex) : [];
}

export const fmt = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

// Самая доступная конфигурация: для «от … ₽» в карточке.
export function priceRange(p) {
  const lo = {}, hi = {};
  for (const opt of p.opts) {
    const vals = optionValues(opt), w = (v) => (v.mul || 1) * (1 + (v.add || 0));
    lo[opt.key] = vals.reduce((a, b) => (w(b) < w(a) ? b : a)).id;
    hi[opt.key] = vals.reduce((a, b) => (w(b) > w(a) ? b : a)).id;
  }
  return [priceOf(p, lo), priceOf(p, hi)];
}

// С чем сочетается: по комнате, а не по категории.
const RELATED = {
  sofas: ['luna', 'cloud', 'kupol', 'dyuna', 'drop'],
  chairs: ['drop', 'grib', 'olive', 'dyuna', 'kupol'],
  dining: ['tur', 'vena', 'fjord', 'kupol', 'olive'],
  tables: ['oslo', 'vena', 'cloud', 'dyuna', 'kupol'],
  storage: ['ritm', 'grib', 'olive', 'kadr', 'nordic'],
  beds: ['grib', 'nordic', 'dyuna', 'kokon', 'drop'],
  light: ['oslo', 'lund', 'drop', 'grib', 'luna'],
  decor: ['mira', 'luna', 'kupol', 'olive', 'cloud'],
};
export function relatedTo(p) {
  return RELATED[p.cat].filter((id) => id !== p.id).slice(0, 4).map((id) => byId[id]);
}
