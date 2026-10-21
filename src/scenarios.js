/* ==========================================================================
   Физлаб 3D · встроенные сценарии и шаблоны
   ========================================================================== */

import { Obj, Q } from './physics.js';
import { MATERIALS, PALETTE, randomColor } from './data.js';

const AXIS_ROT = {
  x: Q.axisAngle({ x: 0, y: 0, z: 1 }, -Math.PI / 2), // ось формы Y → X
  z: Q.axisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2),  // ось формы Y → Z
};

export function makeBuilder(physics, ox = 0, oy = 0, oz = 0) {
  const add = (kind, size, x, y, z, o = {}) => {
    const m = o.mat ? MATERIALS[o.mat] : null;
    const rot = o.rot ? (Array.isArray(o.rot) ? Q.fromEuler(o.rot[0], o.rot[1], o.rot[2]) : o.rot) : Q.id();
    const obj = new Obj({
      ...(m ? { density: m.density, friction: m.friction, restitution: m.restitution, color: m.color } : {}),
      ...o, kind, size, pos: { x: x + ox, y: y + oy, z: z + oz }, rot,
      crot: o.axis ? AXIS_ROT[o.axis] : undefined,
    });
    return physics.add(obj, { linvel: o.vel, angvel: o.angvel });
  };
  const at = p => ({ x: p[0] + ox, y: p[1] + oy, z: p[2] + oz });
  const B = {
    physics,
    box: (x, y, z, w, h, d, o) => add('box', { w, h, d }, x, y, z, o),
    ball: (x, y, z, r, o) => add('ball', { r }, x, y, z, o),
    cyl: (x, y, z, r, h, o) => add('cylinder', { r, h }, x, y, z, o),
    capsule: (x, y, z, r, h, o) => add('capsule', { r, h }, x, y, z, o),
    cone: (x, y, z, r, h, o) => add('cone', { r, h }, x, y, z, o),
    ground: (size = 240) => add('box', { w: size, h: 1, d: size }, -ox, -0.5 - oy, -oz, { isStatic: true, ground: true, friction: 0.8, color: null }),
    solid: (x, y, z, w, h, d, o = {}) => add('box', { w, h, d }, x, y, z, { isStatic: true, color: null, friction: 0.7, ...o }),
    glassWall: (x, y, z, w, h, d) => add('box', { w, h, d }, x, y, z, { isStatic: true, glass: true, friction: 0.2, color: null }),
    hinge: (a, b, p, axis, o = {}) => physics.addJointFromWorld({ type: 'hinge', a, b, pa: at(p), pb: at(p), axis, ...o }),
    ball3: (a, b, p, o = {}) => physics.addJointFromWorld({ type: 'ball', a, b, pa: at(p), pb: at(p), ...o }),
    weld: (a, b, p, o = {}) => physics.addJointFromWorld({ type: 'weld', a, b, pa: at(p), pb: at(p), hidden: true, ...o }),
    rope: (a, b, pa, pb, o = {}) => physics.addJointFromWorld({ type: 'rope', a, b, pa: at(pa), pb: at(pb), ...o }),
    spring: (a, b, pa, pb, o = {}) => physics.addJointFromWorld({ type: 'spring', a, b, pa: at(pa), pb: at(pb), ...o }),
  };
  return B;
}

const yaw = a => Q.axisAngle({ x: 0, y: 1, z: 0 }, a);

/* -------------------------------- шаблоны -------------------------------- */

export const PREFABS = {
  car: {
    name: 'Машинка', hint: 'Управление: ↑ ↓ — газ и задний ход, ← → — повороты',
    build(B) {
      const body = B.box(0, 0.9, 0, 1.6, 0.4, 3, { density: 1.2, color: '#4dabf7', friction: 0.4 });
      const cab = B.box(0, 1.35, -0.25, 1.3, 0.5, 1.5, { density: 0.4, color: '#a5d8ff' });
      B.weld(body, cab, [0, 1.1, -0.25]);
      const wo = { mat: 'rubber', color: '#343a40', restitution: 0.05, density: 1.3, axis: 'x' };
      for (const [x, z] of [[0.95, 1.05], [-0.95, 1.05], [0.95, -1.05], [-0.95, -1.05]]) {
        const w = B.cyl(x, 0.45, z, 0.45, 0.32, wo);
        B.hinge(body, w, [x, 0.45, z], { x: 1, y: 0, z: 0 }, { motor: true, speed: 16, power: 45, drive: x > 0 ? 'L' : 'R', hidden: true });
      }
      return body;
    },
  },
  jenga: {
    name: 'Дженга',
    build(B) {
      let first;
      for (let l = 0; l < 12; l++) for (let i = -1; i <= 1; i++) {
        const y = 0.15 + l * 0.3, o = { mat: 'wood', color: (l + i) % 2 ? '#e8a46a' : '#d08c5a', friction: 0.5 };
        const b = l % 2 ? B.box(0, y, i * 0.5, 1.5, 0.3, 0.48, o) : B.box(i * 0.5, y, 0, 0.48, 0.3, 1.5, o);
        first = first || b;
      }
      return first;
    },
  },
  pyramid: {
    name: 'Пирамидка',
    build(B) {
      let first;
      for (let l = 0; l < 4; l++) for (let i = 0; i < 4 - l; i++) for (let k = 0; k < 4 - l; k++) {
        const b = B.box((i - (3 - l) / 2) * 1.02, 0.5 + l, (k - (3 - l) / 2) * 1.02, 1, 1, 1, { mat: 'wood', color: (i + k + l) % 2 ? '#e8a46a' : '#d08c5a' });
        first = first || b;
      }
      return first;
    },
  },
  balls: {
    name: 'Горсть шаров',
    build(B) {
      let first;
      for (let i = 0; i < 64; i++) {
        const b = B.ball((i % 4 - 1.5) * 0.55, 3 + Math.floor(i / 16) * 0.55, (Math.floor(i / 4) % 4 - 1.5) * 0.55, 0.25, { restitution: 0.4 });
        first = first || b;
      }
      return first;
    },
  },
  chain: {
    name: 'Цепь',
    build(B) {
      const n = 12, l = 0.42, top = 7;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const c = B.capsule(0, top - l / 2 - i * l, 0, 0.07, l - 0.14, { mat: 'metal', density: 2 });
        B.ball3(prev, c, [0, top - i * l, 0], { hidden: false });
        prev = c;
      }
      const ball = B.ball(0, top - n * l - 0.45, 0, 0.45, { mat: 'metal' });
      B.ball3(prev, ball, [0, top - n * l, 0]);
      return ball;
    },
  },
  domino: {
    name: 'Ряд домино',
    build(B) {
      let first;
      for (let i = 0; i < 16; i++) {
        const b = B.box(0, 0.6, -i * 0.6, 0.6, 1.2, 0.14, { color: PALETTE[i % PALETTE.length], friction: 0.5 });
        first = first || b;
      }
      return first;
    },
  },
};

/* -------------------------------- сценарии -------------------------------- */

export const SCENARIOS = [
  {
    id: 'welcome', icon: '✨', name: 'Добро пожаловать',
    desc: 'Площадка с горкой, маятником, башней и разными формами. Хватайте мышью всё подряд.',
    build(B) {
      B.ground();
      B.solid(-8, 1.6, 0, 9, 0.4, 3, { rot: [0, 0, -0.33] });
      B.ball(-11.3, 3.6, 0, 0.55, { mat: 'rubber', label: 'Тяни меня' });
      for (let i = 0; i < 5; i++) B.box(1.5, 0.5 + i, -1, 1, 1, 1, { mat: 'wood', color: i % 2 ? '#e8a46a' : '#d08c5a' });
      B.cyl(3.5, 0.6, 1.5, 0.5, 1.2, { color: '#69db7c' });
      B.cone(0.5, 0.6, 2.5, 0.5, 1.2, { color: '#ffd43b' });
      B.capsule(-1.5, 0.75, 2, 0.35, 0.8, { color: '#b197fc' });
      B.ball(4.5, 0.4, -2.5, 0.4, { mat: 'bouncy' });
      const arm = B.solid(7.5, 7, 0, 3, 0.3, 0.3);
      B.solid(6.15, 3.5, 0, 0.3, 7, 0.3);
      const bob = B.ball(11.5, 4, 0, 0.6, { mat: 'metal', label: 'Маятник' });
      B.rope(arm, bob, [8.8, 6.85, 0], [11.5, 4, 0]);
      for (let i = 0; i < 9; i++) B.box(-4 + i * 0.7, 0.6, 5, 0.6, 1.2, 0.14, { color: PALETTE[i % PALETTE.length], rot: [0, 0, 0] });
      B.box(-4.9, 0.6, 5, 0.14, 1.2, 0.6, { color: '#ff6b6b', label: 'Толкни', rot: [0, 0, 0.0] });
      return { camera: { target: { x: 0, y: 2, z: 0 }, dist: 24, yaw: 0.35, pitch: 0.4 } };
    },
  },
  {
    id: 'empty', icon: '⬜', name: 'Пустой мир',
    desc: 'Только пол. Стройте своё с нуля.',
    build(B) { B.ground(); return { camera: { target: { x: 0, y: 1, z: 0 }, dist: 20, yaw: 0.6, pitch: 0.45 } }; },
  },
  {
    id: 'pyramid', icon: '🔺', name: 'Пирамида',
    desc: '204 ящика в квадратной пирамиде. Попробуйте пушку (G) или взрыв (X).',
    build(B) {
      B.ground();
      const n = 8;
      for (let l = 0; l < n; l++) for (let i = 0; i < n - l; i++) for (let k = 0; k < n - l; k++) {
        B.box((i - (n - l - 1) / 2) * 1.02, 0.5 + l, (k - (n - l - 1) / 2) * 1.02, 1, 1, 1, { mat: 'wood', color: (i + k + l) % 2 ? '#e8a46a' : '#d08c5a' });
      }
      return { camera: { target: { x: 0, y: 3, z: 0 }, dist: 24, yaw: 0.7, pitch: 0.35 } };
    },
  },
  {
    id: 'jenga', icon: '🧱', name: 'Дженга',
    desc: 'Башня из 48 брусков. Аккуратно вытаскивайте их мышью — кто уронит?',
    build(B) {
      B.ground();
      for (let l = 0; l < 16; l++) for (let i = -1; i <= 1; i++) {
        const y = 0.15 + l * 0.3, o = { mat: 'wood', color: (l + i) % 2 ? '#e8a46a' : '#d08c5a', friction: 0.45 };
        if (l % 2) B.box(0, y, i * 0.5, 1.5, 0.3, 0.48, o); else B.box(i * 0.5, y, 0, 0.48, 0.3, 1.5, o);
      }
      return { camera: { target: { x: 0, y: 2.4, z: 0 }, dist: 9, yaw: 0.6, pitch: 0.3 } };
    },
  },
  {
    id: 'domino', icon: '🁢', name: 'Спираль домино',
    desc: 'Шар скатывается с горки и запускает спираль из двух сотен костяшек.',
    build(B) {
      B.ground();
      let th = 0, r = 9, i = 0;
      while (r > 2.2) {
        const x = r * Math.cos(th), z = r * Math.sin(th);
        const tx = -Math.sin(th), tz = Math.cos(th);
        B.box(x, 0.6, z, 0.6, 1.2, 0.15, { rot: yaw(Math.atan2(tx, tz)), color: PALETTE[Math.floor(i / 6) % PALETTE.length], friction: 0.5, density: 1 });
        th += 0.55 / r; r = 9 - 0.3 * th; i++;
      }
      B.solid(9, 1.1, -3.9, 1.4, 0.2, 5, { rot: [0.38, 0, 0] });
      B.ball(9, 2.6, -5.8, 0.3, { mat: 'metal' });
      return { camera: { target: { x: 0, y: 0, z: 0 }, dist: 26, yaw: 0.5, pitch: 0.75 } };
    },
  },
  {
    id: 'bowling', icon: '🎳', name: 'Боулинг',
    desc: 'Тяжёлый шар катится по дорожке к десяти кеглям. Перезапуск — кнопка «Сброс».',
    build(B) {
      B.ground();
      B.solid(0, 0.05, -2, 2.4, 0.1, 24, { friction: 0.15, color: '#c9a27a' });
      for (let k = 0; k < 4; k++) for (let i = 0; i <= k; i++) {
        B.capsule((i - k / 2) * 0.32, 0.1 + 0.32, -11 - k * 0.28, 0.1, 0.42, { density: 0.6, color: '#f1f3f5', friction: 0.4, restitution: 0.3 });
      }
      B.ball(0.12, 0.33, 7, 0.22, { mat: 'metal', density: 5, color: '#e03131', vel: { x: -0.25, y: 0, z: -13 } });
      return { camera: { target: { x: 0, y: 0.6, z: 2 }, dist: 10, yaw: 0, pitch: 0.22 } };
    },
  },
  {
    id: 'newton', icon: '⚪', name: 'Колыбель Ньютона',
    desc: 'Пять шаров на парных нитях: упругий удар передаёт импульс по цепочке.',
    build(B) {
      B.ground();
      const s = 0.802, L = 3.5;
      B.solid(0, 6, 1, 5.2, 0.15, 0.15); B.solid(0, 6, -1, 5.2, 0.15, 0.15);
      for (const x of [-2.6, 2.6]) for (const z of [-1, 1]) B.solid(x, 3, z, 0.15, 6, 0.15);
      const o = { mat: 'metal', color: '#c9d1dc', friction: 0, restitution: 1, density: 7 };
      for (let i = 0; i < 5; i++) {
        const x0 = (i - 2) * s;
        let x = x0, y = 6 - L;
        if (i === 0) { const t = 0.75; x = x0 - L * Math.sin(t); y = 6 - L * Math.cos(t); }
        const b = B.ball(x, y, 0, 0.4, o);
        B.rope(null, b, [x0, 6, 1], [x, y, 0]);
        B.rope(null, b, [x0, 6, -1], [x, y, 0]);
      }
      return { camera: { target: { x: 0, y: 3.2, z: 0 }, dist: 11, yaw: 0.25, pitch: 0.18 }, world: { airDrag: 0, iterations: 8 } };
    },
  },
  {
    id: 'wrecking', icon: '🏗️', name: 'Шар-разрушитель',
    desc: 'Стальной шар на тросе сносит кирпичную стену из 80 блоков.',
    build(B) {
      B.ground();
      for (let r = 0; r < 10; r++) for (let i = 0; i < 8; i++) {
        const off = r % 2 ? 0.4 : 0;
        B.box(-3.2 + i * 0.82 + off, 0.2 + r * 0.4, 0, 0.8, 0.4, 0.4, { mat: 'stone', color: (r + i) % 3 ? '#c0705a' : '#a85f4c' });
      }
      B.solid(-3, 6.65, 3, 0.4, 13.3, 0.4); B.solid(3, 6.65, 3, 0.4, 13.3, 0.4); B.solid(0, 13.3, 3, 6.4, 0.4, 0.4);
      const L = 10.8, a = 1.2;
      const ball = B.ball(0, 13 - L * Math.cos(a), 3 + L * Math.sin(a), 0.9, { mat: 'metal', density: 10 });
      B.rope(null, ball, [0, 13, 3], [ball.p.x, ball.p.y, ball.p.z]);
      return { camera: { target: { x: 0, y: 4, z: 3 }, dist: 26, yaw: 1.2, pitch: 0.25 } };
    },
  },
  {
    id: 'bridge', icon: '🌉', name: 'Подвесной мост',
    desc: 'Мост из 14 досок на осях между двумя скалами. Сверху падают ящики и стальной шар.',
    build(B) {
      B.ground();
      const L = B.solid(0, 2, -8, 5, 4, 6), R = B.solid(0, 2, 8, 5, 4, 6);
      const n = 14, w = 10 / n;
      let prev = L;
      for (let i = 0; i < n; i++) {
        const p = B.box(0, 3.92, -5 + w / 2 + i * w, 2.4, 0.15, w - 0.02, { mat: 'wood', color: i % 2 ? '#e8a46a' : '#d08c5a' });
        B.hinge(prev, p, [0, 3.92, -5 + i * w], { x: 1, y: 0, z: 0 }, { hidden: true });
        prev = p;
      }
      B.hinge(prev, R, [0, 3.92, 5], { x: 1, y: 0, z: 0 }, { hidden: true });
      for (let i = 0; i < 4; i++) B.box(-0.4 + (i % 2) * 0.8, 6 + i * 1.2, -3 + i * 1.8, 0.8, 0.8, 0.8, { mat: 'wood' });
      B.ball(0, 18, 0.5, 0.7, { mat: 'metal', label: 'Сталь' });
      return { camera: { target: { x: 0, y: 3, z: 0 }, dist: 22, yaw: 1.25, pitch: 0.3 } };
    },
  },
  {
    id: 'car', icon: '🚗', name: 'Машинка',
    desc: 'Машинка с четырьмя моторами: ↑ ↓ — газ, ← → — повороты. Трамплин, кочки и кегли.',
    build(B) {
      B.ground(400);
      const car = PREFABS.car.build(B);
      for (let i = 0; i < 3; i++) B.cyl(0, 0, 12 + i * 2.2, 0.35, 5, { isStatic: true, axis: 'x', color: null });
      B.solid(0, 0.75, 26, 5, 0.3, 7, { rot: [-0.24, 0, 0] });
      for (let i = 0; i < 10; i++) B.cone(-4 + (i % 5) * 2, 0.45, 42 + Math.floor(i / 5) * 3, 0.3, 0.9, { color: '#ff922b', density: 0.3 });
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) B.box(-2.5 + i * 1, 0.5 + r, 56, 0.95, 0.95, 0.95, { mat: 'foam' });
      for (let i = 0; i < 6; i++) B.solid(10 + (i % 2) * 6, 0.5 * (i + 1), 10 + i * 6, 5, 1 * (i + 1), 5);
      return { camera: { target: { x: 0, y: 1, z: 0 }, dist: 11, yaw: Math.PI + 0.25, pitch: 0.35 }, follow: car };
    },
  },
  {
    id: 'orbits', icon: '🪐', name: 'Орбиты',
    desc: 'Без земной гравитации: тела притягивают друг друга. Планеты, луна и комета на вытянутой орбите.',
    build(B) {
      const sun = B.ball(0, 0, 0, 1.5, { isStatic: true, density: 50, color: '#ffd43b' });
      const M = sun.mass;
      const planet = (r, rad, dens, color, ph, inc = 0) => {
        const v = Math.sqrt(M / r);
        return B.ball(r * Math.cos(ph), 0, r * Math.sin(ph), rad, {
          density: dens, color, trail: true, friction: 0.2,
          vel: { x: -Math.sin(ph) * v, y: v * inc, z: Math.cos(ph) * v },
        });
      };
      planet(5, 0.25, 2, '#ff922b', 0.3, 0.05);
      planet(8.5, 0.4, 3, '#4dabf7', 2.1, -0.04);
      const p3 = planet(13, 0.5, 12, '#69db7c', 4.0, 0.02);
      const vm = Math.sqrt(p3.mass / 1.0), pv = p3.rb.linvel();
      B.ball(p3.p.x, p3.p.y + 1.0, p3.p.z, 0.12, { color: '#dee2e6', trail: true, vel: { x: pv.x + vm, y: pv.y, z: pv.z } });
      planet(19, 0.7, 2, '#e599f7', 5.3, 0.06);
      const ra = 26, va = Math.sqrt(M / ra) * 0.5;
      B.ball(-ra, 3, 0, 0.18, { color: '#66d9e8', trail: true, vel: { x: 0, y: 0, z: -va } });
      return { camera: { target: { x: 0, y: 0, z: 0 }, dist: 60, yaw: 0.4, pitch: 0.85 }, world: { gravity: 0, airDrag: 0, mutualGravity: true, G: 1, allowSleep: false, iterations: 4 } };
    },
  },
  {
    id: 'mixer', icon: '🌪️', name: 'Мешалка',
    desc: 'Лопасть на моторе перемешивает 300 тел за прозрачными стенками.',
    build(B) {
      B.ground();
      B.glassWall(0, 1.5, 4.1, 8.4, 3, 0.2); B.glassWall(0, 1.5, -4.1, 8.4, 3, 0.2);
      B.glassWall(4.1, 1.5, 0, 0.2, 3, 8.4); B.glassWall(-4.1, 1.5, 0, 0.2, 3, 8.4);
      const pad = B.box(0, 0.5, 0, 7.4, 0.7, 0.3, { mat: 'metal', density: 4 });
      B.hinge(null, pad, [0, 0.5, 0], { x: 0, y: 1, z: 0 }, { motor: true, speed: 1.6, power: 8000 });
      for (let i = 0; i < 300; i++) {
        const x = -3.2 + (i % 8) * 0.9, z = -3.2 + (Math.floor(i / 8) % 8) * 0.9, y = 1.6 + Math.floor(i / 64) * 0.8;
        if (i % 5 === 0) B.box(x, y, z, 0.5, 0.5, 0.5, {}); else B.ball(x, y, z, 0.26, { restitution: 0.3 });
      }
      return { camera: { target: { x: 0, y: 1, z: 0 }, dist: 17, yaw: 0.5, pitch: 0.7 } };
    },
  },
  {
    id: 'galton', icon: '📊', name: 'Доска Гальтона',
    desc: '300 шариков между стёклами проходят ряды штырей и складываются в колокол.',
    build(B) {
      B.ground();
      B.glassWall(0, 9, 0.4, 10, 18, 0.1); B.glassWall(0, 9, -0.4, 10, 18, 0.1);
      B.solid(-4.9, 9, 0, 0.2, 18, 0.7); B.solid(4.9, 9, 0, 0.2, 18, 0.7);
      B.solid(-2.45, 12.2, 0, 4.6, 0.15, 0.7, { rot: [0, 0, -0.62] });
      B.solid(2.45, 12.2, 0, 4.6, 0.15, 0.7, { rot: [0, 0, 0.62] });
      for (let k = 0; k < 12; k++) for (let i = 0; i <= k; i++) B.cyl((i - k / 2) * 0.62, 10.2 - k * 0.55, 0, 0.07, 0.7, { isStatic: true, axis: 'z', color: null, friction: 0.1 });
      for (let i = 0; i < 13; i++) B.solid(-3.72 + i * 0.62, 1.6, 0, 0.05, 3.2, 0.7, { friction: 0.1 });
      for (let i = 0; i < 300; i++) B.ball(-3.8 + (i % 26) * 0.3, 14.5 + Math.floor(i / 26) * 0.3, (i % 2) * 0.06 - 0.03, 0.11, { friction: 0.05, restitution: 0.3, color: PALETTE[i % PALETTE.length] });
      return { camera: { target: { x: 0, y: 8, z: 0 }, dist: 22, yaw: 0.12, pitch: 0.06 } };
    },
  },
  {
    id: 'chain', icon: '⛓️', name: 'Маятник-цепь',
    desc: 'Цепь из 18 звеньев с тяжёлым шаром отпущена горизонтально и сносит пирамидку.',
    build(B) {
      B.ground();
      B.solid(0, 6.5, 0, 0.4, 13, 0.4);
      const n = 18, l = 0.45, top = 12.5;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const c = B.capsule(0.3 + l / 2 + i * l, top, 0, 0.07, l - 0.14, { mat: 'metal', density: 2, axis: 'x', color: '#ced4da' });
        B.ball3(prev, c, [0.3 + i * l, top, 0]);
        prev = c;
      }
      const ball = B.ball(0.3 + n * l + 0.6, top, 0, 0.6, { mat: 'metal', density: 9 });
      B.ball3(prev, ball, [0.3 + n * l, top, 0]);
      for (let lv = 0; lv < 5; lv++) for (let i = 0; i < 5 - lv; i++) B.box(-2 + i * 1.02 - (4 - lv) * 0.51 + 2, 0.5 + lv, -0.5 + 0.5, 1, 1, 1, { mat: 'foam', color: (i + lv) % 2 ? '#fff3bf' : '#ffe066' });
      return { camera: { target: { x: 0, y: 5, z: 0 }, dist: 26, yaw: 0.9, pitch: 0.25 } };
    },
  },
  {
    id: 'catapult', icon: '🎯', name: 'Катапульта',
    desc: 'Падающий груз бьёт по рычагу и подбрасывает снаряд в башню.',
    build(B) {
      B.ground();
      const f = B.solid(0, 0.55, 0, 0.6, 1.1, 1.2);
      const p = B.box(0, 1.2, 0, 8, 0.2, 1, { mat: 'wood', density: 0.5 });
      B.hinge(f, p, [0, 1.1, 0], { x: 0, y: 0, z: 1 }, { hidden: true });
      B.ball(-3.7, 1.6, 0, 0.3, { mat: 'wood', color: '#ff6b6b', label: 'Снаряд' });
      B.box(3.5, 10, 0, 1, 1, 1, { mat: 'metal', label: 'Груз' });
      for (let i = 0; i < 8; i++) B.box(-15, 0.4 + i * 0.8, 0, 0.8, 0.8, 0.8, { mat: 'foam' });
      return { camera: { target: { x: -6, y: 3, z: 0 }, dist: 24, yaw: 0.25, pitch: 0.2 } };
    },
  },
  {
    id: 'stress', icon: '🔥', name: 'Нагрузочный тест',
    desc: '1000 тел падают в чашу. Следите за FPS внизу слева — успокоившиеся тела засыпают.',
    build(B) {
      B.ground();
      B.glassWall(0, 3.5, 7.1, 14.4, 7, 0.2); B.glassWall(0, 3.5, -7.1, 14.4, 7, 0.2);
      B.glassWall(7.1, 3.5, 0, 0.2, 7, 14.4); B.glassWall(-7.1, 3.5, 0, 0.2, 7, 14.4);
      for (let i = 0; i < 1000; i++) {
        const x = -5.4 + (i % 10) * 1.2, z = -5.4 + (Math.floor(i / 10) % 10) * 1.2, y = 3 + Math.floor(i / 100) * 1.1;
        const k = i % 4, c = randomColor();
        if (k === 0) B.box(x, y, z, 0.6, 0.6, 0.6, { color: c });
        else if (k === 1) B.ball(x, y, z, 0.32, { color: c });
        else if (k === 2) B.cyl(x, y, z, 0.3, 0.6, { color: c });
        else B.capsule(x, y, z, 0.22, 0.4, { color: c });
      }
      return { camera: { target: { x: 0, y: 3, z: 0 }, dist: 30, yaw: 0.6, pitch: 0.55 } };
    },
  },
];
