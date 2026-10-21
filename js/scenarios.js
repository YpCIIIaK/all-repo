'use strict';
/* ==========================================================================
   Физлаб · встроенные сценарии и шаблоны объектов
   Каждый сценарий строится через «строитель» B и возвращает настройки мира/камеры.
   ========================================================================== */

function makeBuilder(world, ox = 0, oy = 0) {
  const add = (shape, x, y, o = {}) => world.addBody(new Body({ ...o, shape, x: x + ox, y: y + oy }));
  const mat = (name, o = {}) => ({ ...MATERIALS[name], ...o });
  const B = {
    world, mat,
    circle: (x, y, r, o) => add(Shapes.circle(r), x, y, o),
    box: (x, y, w, h, o) => add(Shapes.box(w, h), x, y, o),
    ngon: (x, y, n, r, o) => add(Shapes.regular(n, r), x, y, o),
    /** Многоугольник по точкам (координаты относительно начала строителя). */
    poly: (pts, o) => { const s = Shapes.polygon(pts); return add(s, s.cx, s.cy, o); },
    /** Статичная планка от точки к точке. */
    wall: (x1, y1, x2, y2, t = 0.3, o = {}) => add(Shapes.box(Math.hypot(x2 - x1, y2 - y1), t), (x1 + x2) / 2, (y1 + y2) / 2,
      { isStatic: true, friction: 0.6, ...o, angle: Math.atan2(y2 - y1, x2 - x1) }),
    ground: (w = 160, o = {}) => B.box(0, -1, w, 2, { isStatic: true, friction: 0.7, ...o }),
    hinge: (a, b, x, y, o) => world.createHinge(a, b, x + ox, y + oy, o),
    /** Жёсткая сцепка двух тел (шарнир с нулевым диапазоном угла). */
    weld: (a, b, x, y) => world.createHinge(a, b, x + ox, y + oy, { enableLimit: true, lower: 0, upper: 0, style: 'hidden' }),
    rod: (a, b, ax, ay, bx, by, o) => world.createDistance('rod', a, b, ax + ox, ay + oy, bx + ox, by + oy, o),
    rope: (a, b, ax, ay, bx, by, o) => world.createDistance('rope', a, b, ax + ox, ay + oy, bx + ox, by + oy, o),
    spring: (a, b, ax, ay, bx, by, o) => world.createDistance('spring', a, b, ax + ox, ay + oy, bx + ox, by + oy, o),
    /** Пружина между центрами двух тел. */
    springC: (a, b, o) => world.createDistance('spring', a, b, a.x, a.y, b.x, b.y, o),
  };
  return B;
}

/* -------------------------------- шаблоны -------------------------------- */

const PREFABS = {
  car: {
    name: 'Машинка', hint: 'Стрелки ← → — газ и тормоз',
    build(B, x = 0, y = 0) {
      const body = B.box(x, y + 1.25, 3.2, 0.5, { density: 1.5, color: '#4dabf7', friction: 0.4 });
      const cab = B.poly([[x - 1.2, y + 1.5], [x + 0.8, y + 1.5], [x + 0.4, y + 2.25], [x - 0.9, y + 2.25]], { density: 0.5, color: '#74c0fc' });
      B.weld(body, cab, x - 0.2, y + 1.5);
      const wo = { ...MATERIALS.rubber, color: '#343a40', restitution: 0.1, density: 1.2 };
      const w1 = B.circle(x - 1.1, y + 0.6, 0.55, wo), w2 = B.circle(x + 1.1, y + 0.6, 0.55, wo);
      const m = { enableMotor: true, motorKeys: true, motorSpeed: 24, maxTorque: 45 };
      B.hinge(body, w1, x - 1.1, y + 0.6, m);
      B.hinge(body, w2, x + 1.1, y + 0.6, m);
      return body;
    },
  },
  ragdoll: {
    name: 'Кукла',
    build(B, x = 0, y = 0, color) {
      const c = color || randomColor();
      const o = { density: 1, friction: 0.6, color: c };
      const head = B.circle(x, y + 1.9, 0.32, o);
      const torso = B.box(x, y + 1.05, 0.62, 0.95, o);
      const ua1 = B.box(x - 0.45, y + 1.2, 0.2, 0.55, o), ua2 = B.box(x + 0.45, y + 1.2, 0.2, 0.55, o);
      const la1 = B.box(x - 0.45, y + 0.66, 0.18, 0.5, o), la2 = B.box(x + 0.45, y + 0.66, 0.18, 0.5, o);
      const th1 = B.box(x - 0.17, y + 0.28, 0.24, 0.6, o), th2 = B.box(x + 0.17, y + 0.28, 0.24, 0.6, o);
      const sh1 = B.box(x - 0.17, y - 0.33, 0.22, 0.6, o), sh2 = B.box(x + 0.17, y - 0.33, 0.22, 0.6, o);
      const L = (lo, hi) => ({ enableLimit: true, lower: lo * Math.PI / 180, upper: hi * Math.PI / 180, style: 'hidden' });
      B.hinge(torso, head, x, y + 1.55, L(-40, 40));
      B.hinge(torso, ua1, x - 0.45, y + 1.45, L(-170, 170));
      B.hinge(torso, ua2, x + 0.45, y + 1.45, L(-170, 170));
      B.hinge(ua1, la1, x - 0.45, y + 0.92, L(0, 150));
      B.hinge(ua2, la2, x + 0.45, y + 0.92, L(-150, 0));
      B.hinge(torso, th1, x - 0.17, y + 0.58, L(-110, 40));
      B.hinge(torso, th2, x + 0.17, y + 0.58, L(-40, 110));
      B.hinge(th1, sh1, x - 0.17, y - 0.03, L(-140, 0));
      B.hinge(th2, sh2, x + 0.17, y - 0.03, L(0, 140));
      return torso;
    },
  },
  jelly: {
    name: 'Желе',
    build(B, x = 0, y = 0, color, n = 5, hz = 5) {
      const c = color || randomColor(), sp = 0.42, r = 0.19;
      const g = [];
      for (let i = 0; i < n; i++) {
        g.push([]);
        for (let j = 0; j < n; j++) g[i].push(B.circle(x + (i - (n - 1) / 2) * sp, y + j * sp + r, r, { color: c, friction: 0.6, density: 1 }));
      }
      const o = { hertz: hz, damping: 0.4, style: 'line' };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i + 1 < n) B.springC(g[i][j], g[i + 1][j], o);
        if (j + 1 < n) B.springC(g[i][j], g[i][j + 1], o);
        if (i + 1 < n && j + 1 < n) { B.springC(g[i][j], g[i + 1][j + 1], o); B.springC(g[i + 1][j], g[i][j + 1], o); }
      }
      return g[0][0];
    },
  },
  chain: {
    name: 'Цепь',
    build(B, x = 0, y = 0) {
      const n = 14, l = 0.5;
      let prev = null;
      const c = '#ced4da';
      for (let i = 0; i < n; i++) {
        const b = B.box(x, y - l / 2 - i * l, 0.14, l, { density: 2, color: c });
        B.hinge(prev, b, x, y - i * l);
        prev = b;
      }
      const ball = B.circle(x, y - n * l - 0.45, 0.45, { ...MATERIALS.metal });
      B.hinge(prev, ball, x, y - n * l);
      return ball;
    },
  },
  tower: {
    name: 'Башня',
    build(B, x = 0, y = 0) {
      let first;
      for (let r = 0; r < 10; r++) {
        const b = B.box(x, y + 0.4 + r * 0.8, 0.8, 0.8, { ...MATERIALS.wood, color: r % 2 ? '#e8a46a' : '#d08c5a' });
        first = first || b;
      }
      return first;
    },
  },
  balls: {
    name: 'Горсть шаров',
    build(B, x = 0, y = 0) {
      let first;
      for (let i = 0; i < 40; i++) {
        const b = B.circle(x + (i % 8 - 3.5) * 0.45, y + 0.3 + Math.floor(i / 8) * 0.45, 0.2, { restitution: 0.4 });
        first = first || b;
      }
      return first;
    },
  },
  seesaw: {
    name: 'Качели',
    build(B, x = 0, y = 0) {
      const f = B.poly([[x - 0.6, y], [x + 0.6, y], [x, y + 1]], { isStatic: true });
      const p = B.box(x, y + 1.12, 6, 0.24, { ...MATERIALS.wood });
      B.hinge(f, p, x, y + 1.02);
      return p;
    },
  },
};

/* ------------------------------- сценарии ------------------------------- */

function terrainPoints(x0, x1, step, f) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) pts.push([x, f(x)]);
  return pts;
}
function buildTerrain(B, pts, depth = -6, o = {}) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    B.poly([[x1, y1], [x2, y2], [x2, depth], [x1, depth]], { isStatic: true, friction: 0.9, ...o });
  }
}

const SCENARIOS = [
  {
    id: 'welcome', icon: '✨', name: 'Добро пожаловать',
    desc: 'Небольшая площадка: горка, качели, маятник и ящики. Хватайте мышью всё подряд.',
    build(B) {
      B.ground();
      B.wall(-16, 7, -7, 2.2, 0.35);
      B.circle(-14.5, 8.4, 0.6, { ...MATERIALS.rubber, label: 'Тяни меня' });
      for (let i = 0; i < 4; i++) B.box(-3, 0.5 + i, 1, 1, { ...MATERIALS.wood, color: i % 2 ? '#e8a46a' : '#d08c5a' });
      B.box(-1.6, 0.4, 0.8, 0.8, { color: '#69db7c' });
      PREFABS.seesaw.build(B, 6, 0);
      B.box(8.3, 2.0, 0.8, 0.8, { color: '#ffd43b' });
      B.circle(3.8, 2.1, 0.35, { color: '#4dabf7' });
      const p = B.box(0, 12.5, 0.4, 0.4, { isStatic: true });
      const bob = B.circle(4, 9.5, 0.5, { ...MATERIALS.metal, label: 'Маятник' });
      B.rod(p, bob, 0, 12.5, 4, 9.5);
      B.ngon(12.5, 0.8, 6, 0.8, { color: '#b197fc' });
      B.ngon(14.3, 0.6, 3, 0.7, { color: '#f783ac' });
      return { camera: { x: 0, y: 5.5, zoom: 38 } };
    },
  },
  {
    id: 'empty', icon: '⬜', name: 'Пустой мир',
    desc: 'Только пол. Стройте своё с нуля.',
    build(B) { B.ground(); return { camera: { x: 0, y: 6, zoom: 40 } }; },
  },
  {
    id: 'pyramid', icon: '🔺', name: 'Пирамида',
    desc: '136 ящиков. Проверка устойчивости стопок — попробуйте взрыв (X) или «Пуск» (G).',
    build(B) {
      B.ground();
      const rows = 16;
      for (let r = 0; r < rows; r++) for (let i = 0; i < rows - r; i++) {
        B.box((i - (rows - r - 1) / 2) * 1.02, 0.5 + r * 1.0, 1, 1, { ...MATERIALS.wood, color: (r + i) % 2 ? '#e8a46a' : '#d08c5a' });
      }
      return { camera: { x: 0, y: 8, zoom: 32 } };
    },
  },
  {
    id: 'domino', icon: '🁢', name: 'Домино',
    desc: 'Шар скатывается с горки и запускает цепочку из 30 костяшек.',
    build(B) {
      B.ground();
      B.wall(-26, 8, -16.5, 0.6, 0.3);
      B.circle(-25, 9.2, 0.55, { ...MATERIALS.metal });
      for (let i = 0; i < 30; i++) {
        const s = 1 + i * 0.03;
        B.box(-15 + i * 1.15 * s, 1.0 * s, 0.22 * s, 2.0 * s, { density: 1, friction: 0.5, color: PALETTE[i % PALETTE.length] });
      }
      for (let i = 0; i < 6; i++) B.box(32.5, 0.6 + i * 1.2, 1.2, 1.2, { ...MATERIALS.foam });
      return { camera: { x: 4, y: 6, zoom: 22 } };
    },
  },
  {
    id: 'newton', icon: '⚪', name: 'Колыбель Ньютона',
    desc: 'Упругие удары: импульс передаётся по цепочке шаров. Без сопротивления воздуха.',
    build(B) {
      B.ground();
      B.box(0, 8.3, 7.4, 0.3, { isStatic: true });
      B.box(-3.6, 4.1, 0.25, 8.2, { isStatic: true, noCollide: true });
      B.box(3.6, 4.1, 0.25, 8.2, { isStatic: true, noCollide: true });
      const o = { density: 8, friction: 0, restitution: 1, color: '#c9d1dc' };
      for (let i = 0; i < 5; i++) {
        const px = (i - 2) * 1.002;
        let bx = px, by = 4;
        if (i === 0) { const a = 0.8; bx = px - 4 * Math.sin(a); by = 8 - 4 * Math.cos(a); }
        const b = B.circle(bx, by, 0.5, o);
        B.rod(null, b, px, 8, bx, by);
      }
      return { camera: { x: 0, y: 4.8, zoom: 48 }, world: { airDrag: 0, substeps: 8 } };
    },
  },
  {
    id: 'double', icon: '🌀', name: 'Хаос двойного маятника',
    desc: 'Три двойных маятника, начальные углы отличаются на 0.002 рад. Скоро они разойдутся.',
    build(B) {
      const piv = B.circle(0, 9, 0.12, { isStatic: true, noCollide: true });
      const cols = ['#ff6b6b', '#4dabf7', '#69db7c'];
      for (let k = 0; k < 3; k++) {
        const t = 2.3 + k * 0.002;
        const x1 = 3 * Math.sin(t), y1 = 9 - 3 * Math.cos(t);
        const x2 = x1 + 3 * Math.sin(t), y2 = y1 - 3 * Math.cos(t);
        const o = { density: 4, noCollide: true, color: cols[k] };
        const b1 = B.circle(x1, y1, 0.22, o), b2 = B.circle(x2, y2, 0.22, { ...o, trail: true });
        B.rod(piv, b1, 0, 9, x1, y1);
        B.rod(b1, b2, x1, y1, x2, y2);
      }
      return { camera: { x: 0, y: 8, zoom: 42 }, world: { airDrag: 0, substeps: 8, allowSleep: false, gravity: 9.81 } };
    },
  },
  {
    id: 'galton', icon: '📊', name: 'Доска Гальтона',
    desc: '250 шариков проходят через ряды штырей и складываются в нормальное распределение.',
    build(B) {
      B.ground();
      B.wall(-4.4, 0, -4.4, 17, 0.2); B.wall(4.4, 0, 4.4, 17, 0.2);
      B.wall(-4.3, 14, -0.45, 10.3, 0.15); B.wall(4.3, 14, 0.45, 10.3, 0.15);
      for (let k = 0; k < 12; k++) for (let i = 0; i <= k; i++) {
        B.circle((i - k / 2) * 0.6, 9.4 - k * 0.52, 0.07, { isStatic: true, friction: 0.1 });
      }
      for (let i = 0; i < 12; i++) B.box(-3.3 + i * 0.6, 1.5, 0.06, 3, { isStatic: true, friction: 0.1 });
      for (let r = 0; r < 10; r++) for (let c = 0; c < 25; c++) {
        B.circle(-3.6 + c * 0.3 + (r % 2) * 0.05, 14.7 + r * 0.3, 0.11, { friction: 0.05, restitution: 0.3, color: PALETTE[(r + c) % PALETTE.length] });
      }
      return { camera: { x: 0, y: 8.6, zoom: 36 } };
    },
  },
  {
    id: 'wrecking', icon: '🏗️', name: 'Шар-разрушитель',
    desc: 'Тяжёлый стальной шар на тросе сносит башню из колонн и перекрытий.',
    build(B) {
      B.ground();
      B.box(-15, 8.25, 0.5, 16.5, { isStatic: true });
      B.box(-7.25, 16.5, 16, 0.5, { isStatic: true });
      const ball = B.circle(-0 - 12 * Math.sin(1.22), 16 - 12 * Math.cos(1.22), 1, { ...MATERIALS.metal, density: 12 });
      B.rope(null, ball, 0, 16, ball.x, ball.y);
      for (let f = 0; f < 7; f++) {
        const y = f * 1.95;
        B.box(4.5, y + 0.8, 0.4, 1.6, { ...MATERIALS.stone });
        B.box(8.5, y + 0.8, 0.4, 1.6, { ...MATERIALS.stone });
        B.box(6.5, y + 1.775, 5, 0.35, { ...MATERIALS.wood });
      }
      return { camera: { x: -2, y: 8, zoom: 26 } };
    },
  },
  {
    id: 'bridge', icon: '🌉', name: 'Подвесной мост',
    desc: 'Мост из 16 досок на шарнирах. Ящики он выдержит, а вот стальной шар — нет. Прочность настраивается в инспекторе.',
    build(B) {
      B.ground();
      const L = B.box(-11, 2.5, 10, 5, { isStatic: true }), R = B.box(11, 2.5, 10, 5, { isStatic: true });
      const n = 16, w = 12 / n;
      let prev = L;
      const brk = { breakForce: 1400 };
      for (let i = 0; i < n; i++) {
        const p = B.box(-6 + w / 2 + i * w, 4.9, w, 0.2, { ...MATERIALS.wood, color: i % 2 ? '#e8a46a' : '#d08c5a' });
        B.hinge(prev, p, -6 + i * w, 4.9, brk);
        prev = p;
      }
      B.hinge(prev, R, 6, 4.9, brk);
      for (let i = 0; i < 4; i++) B.box(-4 + i * 2.4, 7 + i * 0.6, 0.9, 0.9, { ...MATERIALS.wood });
      B.circle(1.2, 24, 0.75, { ...MATERIALS.metal, label: 'Сталь' });
      return { camera: { x: 0, y: 6, zoom: 30 } };
    },
  },
  {
    id: 'car', icon: '🚗', name: 'Машинка',
    desc: 'Холмистая трасса. Управление: ← → (мотор и тормоз). Камера следует за машиной.',
    build(B) {
      const f = x => x < 0 ? 0 : 2.4 * Math.sin(x * 0.09) * Math.min(1, x / 20) + 1.1 * Math.sin(x * 0.23) * Math.min(1, x / 30) + x * 0.025;
      buildTerrain(B, terrainPoints(-30, 180, 2.5, f));
      B.wall(-30, 0, -30, 12, 0.5);
      for (let i = 0; i < 5; i++) B.box(18, f(18) + 0.4 + i * 0.8, 0.8, 0.8, { ...MATERIALS.wood });
      for (let i = 0; i < 8; i++) B.circle(55 + i * 0.7, f(55) + 2, 0.3, { restitution: 0.5 });
      const car = PREFABS.car.build(B, -20, 0);
      return { camera: { x: -14, y: 4, zoom: 40 }, follow: car };
    },
  },
  {
    id: 'orbits', icon: '🪐', name: 'Орбиты',
    desc: 'Взаимное притяжение тел без земной гравитации: планеты, луна и комета на вытянутой орбите.',
    build(B) {
      const sun = B.circle(0, 0, 1.6, { isStatic: true, density: 90, color: '#ffd43b' });
      const M = sun.mass;
      const planet = (r, rad, dens, color, phi) => {
        const v = Math.sqrt(M / r);
        return B.circle(r * Math.cos(phi), r * Math.sin(phi), rad, { density: dens, color, trail: true, vx: -Math.sin(phi) * v, vy: Math.cos(phi) * v, friction: 0.2 });
      };
      planet(5, 0.25, 2, '#ff922b', 0.3);
      planet(8.5, 0.4, 3, '#4dabf7', 2.1);
      const p3 = planet(13, 0.5, 12, '#69db7c', 4.0);
      const vm = Math.sqrt(p3.mass / 0.95);
      B.circle(p3.x + 0.95 * Math.cos(4.0), p3.y + 0.95 * Math.sin(4.0), 0.12, {
        density: 1, color: '#dee2e6', trail: true,
        vx: p3.vx - Math.sin(4.0) * vm, vy: p3.vy + Math.cos(4.0) * vm,
      });
      planet(19, 0.7, 2, '#e599f7', 5.3);
      const ra = 24, va = Math.sqrt(M / ra) * 0.5;
      B.circle(-ra, 0, 0.18, { density: 1, color: '#66d9e8', trail: true, vx: 0, vy: -va });
      return { camera: { x: 0, y: 0, zoom: 14 }, world: { gravity: 0, airDrag: 0, mutualGravity: true, G: 1, allowSleep: false, substeps: 8 } };
    },
  },
  {
    id: 'jelly', icon: '🍮', name: 'Желе',
    desc: 'Мягкие тела из шариков и пружин падают на препятствия.',
    build(B) {
      B.ground();
      B.wall(-9, 7, -1, 3.5, 0.3);
      B.circle(4, 0.2, 1.2, { isStatic: true });
      B.wall(9, 0, 13, 3, 0.3);
      PREFABS.jelly.build(B, -6, 9, '#ff8787', 5, 5);
      PREFABS.jelly.build(B, 4, 12, '#69db7c', 4, 8);
      PREFABS.jelly.build(B, 9.5, 8, '#74c0fc', 6, 3);
      return { camera: { x: 1, y: 6, zoom: 38 } };
    },
  },
  {
    id: 'mixer', icon: '🌪️', name: 'Мешалка',
    desc: 'Моторизованный ротор перемешивает 160 тел в контейнере.',
    build(B) {
      B.ground();
      B.wall(-6.2, 0, -6.2, 11, 0.4); B.wall(6.2, 0, 6.2, 11, 0.4);
      const r1 = B.box(0, 5.2, 9.6, 0.35, { ...MATERIALS.metal, density: 3 });
      const r2 = B.box(0, 5.2, 0.35, 9.6, { ...MATERIALS.metal, density: 3 });
      B.hinge(null, r1, 0, 5.2, { enableMotor: true, motorSpeed: 1.3, maxTorque: 20000 });
      B.weld(r1, r2, 0, 5.2);
      for (let i = 0; i < 160; i++) {
        const x = -5.4 + (i % 20) * 0.56, y = 10.5 + Math.floor(i / 20) * 0.6;
        if (i % 4 === 0) B.box(x, y, 0.42, 0.42, {});
        else B.circle(x, y, 0.22, { restitution: 0.3 });
      }
      return { camera: { x: 0, y: 7.5, zoom: 34 } };
    },
  },
  {
    id: 'catapult', icon: '🎯', name: 'Катапульта',
    desc: 'Падающий груз подбрасывает снаряд с рычага прямо в башню.',
    build(B) {
      B.ground();
      const f = B.poly([[-0.8, 0], [0.8, 0], [0, 1.4]], { isStatic: true });
      const p = B.box(0, 1.55, 10, 0.3, { ...MATERIALS.wood, density: 0.5 });
      B.hinge(f, p, 0, 1.45);
      B.circle(-4.5, 2.05, 0.35, { ...MATERIALS.wood, color: '#ff6b6b', label: 'Снаряд' });
      B.box(4.3, 14, 1.1, 1.1, { ...MATERIALS.metal, label: 'Груз' });
      for (let i = 0; i < 7; i++) B.box(-19, 0.4 + i * 0.8, 0.8, 0.8, { ...MATERIALS.foam });
      return { camera: { x: -7, y: 7, zoom: 26 } };
    },
  },
  {
    id: 'ramps', icon: '📐', name: 'Трение на склонах',
    desc: 'Одинаковые склоны в 30°, разные материалы: лёд скользит, дерево сползает, резина стоит, шар катится.',
    build(B) {
      B.ground();
      const a = Math.PI / 6, dx = Math.cos(a), dy = -Math.sin(a), nx = Math.sin(a), ny = Math.cos(a);
      const items = [
        ['ice', 'Лёд'], ['wood', 'Дерево'], ['rubber', 'Резина'], ['ball', 'Шар'],
      ];
      items.forEach(([m, label], k) => {
        const x0 = -17 + k * 9.5, y0 = 5;
        B.wall(x0, y0, x0 + 8 * dx, y0 + 8 * dy, 0.3, { friction: 0.5, color: null });
        const sx = x0 + 1.2 * dx, sy = y0 + 1.2 * dy;
        if (m === 'ball') B.circle(sx + nx * 0.56, sy + ny * 0.56, 0.4, { ...MATERIALS.wood, color: '#ffd43b', label });
        else B.box(sx + nx * 0.42, sy + ny * 0.42, 0.9, 0.52, { ...MATERIALS[m], angle: -a, label });
      });
      return { camera: { x: 0, y: 3, zoom: 30 } };
    },
  },
  {
    id: 'springs', icon: '〰️', name: 'Пружинные маятники',
    desc: 'Грузы на пружинах качаются и колеблются одновременно — следы рисуют сложные фигуры.',
    build(B) {
      B.box(0, 10.3, 20, 0.3, { isStatic: true });
      const cfg = [[-6, 2.5, 1.6, '#ff6b6b'], [0, 1.2, 1.1, '#4dabf7'], [6, -2.2, 2.0, '#69db7c']];
      for (const [x, off, hz, c] of cfg) {
        const m = B.circle(x + off, 6.5, 0.35, { density: 3, color: c, trail: true });
        B.spring(null, m, x, 10.1, m.x, m.y, { length: 3, hertz: hz, damping: 0.01 });
      }
      return { camera: { x: 0, y: 6, zoom: 40 }, world: { airDrag: 0, allowSleep: false } };
    },
  },
  {
    id: 'stairs', icon: '🪜', name: 'Куклы на лестнице',
    desc: 'Тряпичные куклы с ограничениями суставов скатываются по ступеням.',
    build(B) {
      B.ground();
      for (let i = 0; i < 10; i++) {
        const top = 9 - i * 0.9;
        B.box(-10 + i * 1.6, top / 2, 1.6, top, { isStatic: true });
      }
      const cols = ['#ff8787', '#74c0fc', '#ffd43b'];
      const from = B.world.bodies.length;
      for (let k = 0; k < 3; k++) PREFABS.ragdoll.build(B, -9.6 + k * 1.6, 9.9 - k * 0.9 + 1.5, cols[k]);
      for (let i = from; i < B.world.bodies.length; i++) { B.world.bodies[i].vx = 2.5; }
      return { camera: { x: -2, y: 6, zoom: 34 } };
    },
  },
  {
    id: 'stress', icon: '🔥', name: 'Нагрузочный тест',
    desc: '600 тел разных форм в воронке. Следите за FPS в углу — тела засыпают, когда успокаиваются.',
    build(B) {
      B.ground(80);
      B.wall(-15, 0, -15, 30, 0.5); B.wall(15, 0, 15, 30, 0.5);
      B.wall(-15, 6, -1.5, 3, 0.3); B.wall(15, 6, 1.5, 3, 0.3);
      for (let i = 0; i < 600; i++) {
        const x = -13 + (i % 30) * 0.88, y = 9 + Math.floor(i / 30) * 0.9, k = i % 3;
        if (k === 0) B.circle(x, y, 0.18 + (i % 7) * 0.02, { restitution: 0.2 });
        else if (k === 1) B.box(x, y, 0.38 + (i % 5) * 0.03, 0.38, {});
        else B.ngon(x, y, 3 + (i % 4), 0.26, {});
      }
      return { camera: { x: 0, y: 12, zoom: 22 } };
    },
  },
];
