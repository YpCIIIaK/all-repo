// Тесты расчётного ядра конструктора: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, fromTemplate, layout, normalize, fitNiche, shelfSag, SHEET, GAP } from '../src/cab/model.js';
import { partsTable, nest, price, massOf, cutSize, partsCSV, drillCSV } from '../src/cab/spec.js';

const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;
const calc = (p) => { const L = layout(p); const rows = partsTable(L); return { L, rows, maps: nest(rows) }; };

for (const id of Object.keys(TEMPLATES)) {
  test(`шаблон «${TEMPLATES[id].name}» собирается без ошибок`, () => {
    const { L, rows } = calc(fromTemplate(id));
    assert.deepEqual(L.errors, []);
    assert.ok(rows.length > 5);
    for (const r of rows) assert.ok(r.len > 0 && r.wid > 0 && r.qty > 0, r.name);
  });
}

test('ширины секций и перегородки дают ровно ширину корпуса', () => {
  for (const id of Object.keys(TEMPLATES)) {
    const { L } = calc(fromTemplate(id));
    const n = L.secs.length;
    const sum = L.secs.reduce((a, s) => a + s.cw, 0) + (n - 1) * L.T + 2 * L.T;
    assert.ok(near(sum, L.p.W), `${id}: ${sum} ≠ ${L.p.W}`);
  }
});

test('высоты ячеек и полок дают внутреннюю высоту секции', () => {
  for (const id of Object.keys(TEMPLATES)) {
    const { L } = calc(fromTemplate(id));
    const inner = L.p.H - L.p.baseH - 2 * L.T;
    for (const S of L.secs) {
      const shelves = S.cells.filter((c) => c.shelf != null).length;
      const sum = S.cells.reduce((a, c) => a + c.h, 0) + shelves * L.T;
      assert.ok(near(sum, inner), `${id}, секция ${S.i + 1}: ${sum} ≠ ${inner}`);
    }
  }
});

test('ячейки с фиксированной высотой не меняются, остаток делится между «авто»', () => {
  const p = fromTemplate('wardrobe');
  const { L } = calc(p);
  const S = L.secs[1];
  assert.ok(near(S.cells[0].h, 320));
  assert.ok(near(S.cells[2].h, 380));
});

test('фасады не выходят за корпус и не перекрываются', () => {
  for (const id of ['wardrobe', 'hallway', 'tv', 'pencil', 'dresser']) {
    const { L } = calc(fromTemplate(id));
    const fr = L.boxes.filter((b) => b.front && b.role !== 'filler' && !b.inner);
    for (const b of fr) assert.ok(b.x >= -0.01 && b.x + b.w <= L.p.W + 0.01 && b.y >= L.p.baseH - 0.01 && b.y + b.h <= L.p.H + 0.01, `${id}: ${b.part?.name}`);
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
      const a = fr[i], b = fr[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(ox < GAP - 0.01 || oy < GAP - 0.01 || ox <= 0 || oy <= 0, `${id}: фасады пересекаются`);
    }
  }
});

test('антресоль делит двери по стационарной полке', () => {
  const { L } = calc(fromTemplate('hallway'));
  const doors = L.boxes.filter((b) => b.kind === 'door' && b.sec === 0);
  assert.equal(new Set(doors.map((d) => d.zone)).size, 2);
  assert.ok(L.boxes.some((b) => b.role === 'shelf' && b.fixed && b.part.name === 'Полка стационарная'));
});

test('петель по высоте и массе двери: не меньше 2, высокая дверь — больше', () => {
  const { L } = calc(fromTemplate('wardrobe'));
  for (const d of L.boxes.filter((b) => b.kind === 'door')) {
    assert.ok(d.hinges.length >= 2);
    if (d.h > 2000) assert.ok(d.hinges.length >= 5);
    assert.ok(d.hinges[0] === 100 && d.hinges.at(-1) === Math.round(d.h - 100));
  }
});

test('ниша: корпус = минимальный замер минус доборы', () => {
  const p = fromTemplate('coupe');
  p.install = 'niche';
  p.niche = { w: [2300, 2296, 2304], h: [2500, 2490, 2502], d: 700, gap: 5, fillers: 'sides', skirting: { h: 60, d: 15 } };
  normalize(p);
  const f = fitNiche(p.niche);
  assert.equal(p.W, 2296 - 100);
  assert.equal(p.H, 2490 - 10);
  assert.equal(f.skewW, 8);
  const { L, rows } = calc(p);
  assert.ok(rows.some((r) => r.name === 'Добор левый'));
  assert.ok(rows.find((r) => r.name === 'Боковина левая').note.includes('плинтус'));
  assert.deepEqual(L.errors, []);
});

test('пильный размер учитывает кромку 2 мм и не учитывает 0,4 мм', () => {
  assert.deepEqual(cutSize(700, 500, { l1: 2, l2: 2, w1: 2, w2: 2 }), { len: 696, wid: 496 });
  assert.deepEqual(cutSize(700, 500, { l1: 2 }), { len: 700, wid: 498 });
  assert.deepEqual(cutSize(700, 500, { l1: 0.4 }), { len: 700, wid: 500 });
});

test('раскрой: детали внутри листа и не пересекаются', () => {
  for (const id of Object.keys(TEMPLATES)) {
    const { maps, rows } = calc(fromTemplate(id));
    const UL = SHEET.L - 2 * SHEET.trim, UW = SHEET.W - 2 * SHEET.trim;
    let placed = 0;
    for (const g of maps) for (const sh of g.sheets) {
      for (const it of sh.items) assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= UL + 0.1 && it.y + it.h <= UW + 0.1, `${id}: № ${it.no}`);
      for (let i = 0; i < sh.items.length; i++) for (let j = i + 1; j < sh.items.length; j++) {
        const a = sh.items[i], b = sh.items[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(ox <= 0.01 || oy <= 0.01, `${id}: № ${a.no} и № ${b.no} пересекаются`);
      }
      placed += sh.items.length;
    }
    placed += maps.reduce((a, g) => a + g.over.length, 0);
    assert.equal(placed, rows.reduce((a, r) => a + r.qty, 0));
  }
});

test('присадка: отверстия лежат на детали, у дверей есть чашки петель', () => {
  const { L, rows } = calc(fromTemplate('wardrobe'));
  for (const r of rows) for (const h of r.holes) {
    if (h.face === 'L0' || h.face === 'L1') { assert.ok(h.v >= 0 && h.v <= r.wid, `${r.name}: торцевое ${h.v}`); continue; }
    assert.ok(h.u >= 0 && h.u <= r.len && h.v >= 0 && h.v <= r.wid, `${r.name}: ${h.u},${h.v}`);
  }
  const door = rows.find((r) => r.name === 'Дверь');
  assert.ok(door.holes.filter((h) => h.d === 35).length >= 2);
  assert.ok(L.holesTotal > 100);
  const side = rows.find((r) => r.name === 'Боковина левая');
  assert.ok(side.holes.some((h) => h.kind === 'confirmat') && side.holes.some((h) => h.kind === 'support'));
});

test('прогиб полки растёт как четвёртая степень пролёта', () => {
  const a = shelfSag(400, 500, 16, 50), b = shelfSag(800, 500, 16, 50);
  assert.ok(near(b.sag / a.sag, 16, 0.01));
  assert.ok(shelfSag(800, 500, 18, 50).sag < b.sag);
});

test('масса и стоимость положительные, CSV формируются', () => {
  const { L, rows, maps } = calc(fromTemplate('wardrobe'));
  const m = massOf(L, rows), pr = price(L, rows, maps);
  assert.ok(m.total > 60 && m.total < 250, `масса ${m.total}`);
  assert.ok(pr.total > 30000);
  assert.ok(partsCSV(rows).split('\n').length === rows.length + 1);
  assert.ok(drillCSV(rows).split('\n').length > 50);
});

test('случайные конфигурации не ломают расчёт', () => {
  const ids = Object.keys(TEMPLATES);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    const p = fromTemplate(ids[k % ids.length]);
    Object.assign(p, { W: 300 + rnd() * 3300, H: 300 + rnd() * 2400, D: 300 + rnd() * 400, th: rnd() < 0.5 ? 16 : 18, doors: rnd() < 0.3 ? 'sliding' : 'hinged', base: rnd() < 0.5 ? 'legs' : 'plinth', mezz: rnd() < 0.3 ? 450 : 0 });
    if (rnd() < 0.2) p.install = 'niche';
    normalize(p);
    const { L, rows } = calc(p);
    price(L, rows);
    for (const b of L.boxes) assert.ok([b.x, b.y, b.z, b.w, b.h, b.d].every(Number.isFinite), 'NaN в геометрии');
  }
});
