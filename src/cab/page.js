/* ==========================================================================
   Ясень · Конструктор корпусной мебели: страницы конструктора и проекта
   ========================================================================== */

import * as THREE from 'three';
import { Viewer, Stage } from '../stage.js';
import { swatchURL } from '../materials.js';
import {
  fromTemplate, normalize, layout, fitNiche, TEMPLATES, PRESETS, DECORS, ENAMELS, HANDLES, HANDLE_METALS, CELL_KINDS, FRONT_KINDS,
  LIMITS, LOADS, SHEET, FILLER, SCRIBE, THICKNESS,
} from './model.js';
import { buildCabinet } from './build3d.js';
import { partsTable, nest, price, edgeTotals, edgeLabel, partsCSV, drillCSV, materialsOf, massOf } from './spec.js';
import { frontSVG, sideSVG, sheetSVG, partSVG, holeSummary, nicheSVG } from './drawings.js';
import { partsDXF } from './dxf.js';

// Манекен 175 см рядом со шкафом — чтобы сразу чувствовать масштаб.
function mannequin() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: '#d9d0c4', roughness: 0.85 });
  const part = (geo, x, y, z = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); };
  part(new THREE.SphereGeometry(0.105, 24, 16), 0, 1.64);
  part(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 16), 0, 1.51);
  part(new THREE.CapsuleGeometry(0.15, 0.42, 6, 16).scale(1, 1, 0.62), 0, 1.2);
  for (const s of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.058, 0.78, 6, 12), s * 0.085, 0.47);
    part(new THREE.CapsuleGeometry(0.045, 0.62, 6, 12), s * 0.215, 1.08, 0, s * 0.08);
  }
  g.traverse((o) => { o.userData.noBounds = true; o.userData.human = true; });
  return g;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const mm = (v) => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ');
const f1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const S = 0.001;
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

/* ------------------------------ расчёт целиком ------------------------------ */

export function calc(P) {
  const L = layout(P), rows = partsTable(L), maps = nest(rows), pr = price(L, rows, maps), mass = massOf(L, rows);
  return { L, rows, maps, pr, mass };
}

export function cabTitle(P) {
  return `${P.name} ${mm(P.W)}×${mm(P.H)}×${mm(P.D)}`;
}
export function cabSummary(P) {
  const front = P.front.kind === 'enamel' ? 'МДФ эмаль ' + ENAMELS[P.front.id].name.toLowerCase() : DECORS[P.front.id].name;
  return `Корпус ${DECORS[P.body].name} · фасады ${front} · ${P.sections.length} ${plural(P.sections.length, 'секция', 'секции', 'секций')}${P.install === 'niche' ? ' · в нишу' : ''}`;
}

/* ------------------------------ ссылки и номер проекта ------------------------------ */

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function encodeProject(p) {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'function') return 'j' + b64url(json);
  const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64url(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function decodeProject(str) {
  const bytes = unb64url(str.slice(1));
  const json = str[0] === 'z' ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(bytes);
  return normalize(JSON.parse(json));
}
export function projectNo(p) {
  const s = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return 'ЯС-' + String((h >>> 0) % 1000000).padStart(6, '0');
}

function download(name, data, type) {
  const url = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  if (!url.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const swStyle = (kind, d) => {
  if (kind === 'decor' && d.wood) return `--c:${d.hex};background:url(${swatchURL('wood', 'x')}) center/cover, ${d.hex};background-blend-mode:multiply`;
  if (kind === 'decor' && d.concrete) return `--c:${d.hex};background:radial-gradient(circle at 30% 30%, #b7b3ac, #8f8b84)`;
  return `--c:${d.hex}`;
};

/* ================================ КОНСТРУКТОР ================================ */

const STEPS = [['model', 'Модель'], ['size', 'Размеры'], ['fill', 'Наполнение'], ['finish', 'Отделка'], ['order', 'Проект']];

export async function mountConstructor(app, ctx, query) {
  const { toast, icon, esc, fmt, Store, thumbs } = ctx;
  let P = null;
  if (query.p) {
    try { P = await decodeProject(query.p); toast('Проект открыт по ссылке'); } catch { toast('Ссылка на проект повреждена'); }
    history.replaceState(null, '', '#/constructor');
  }
  if (!P) { const saved = Store.get('cab', null); try { P = saved ? normalize(saved) : null; } catch { P = null; } }
  if (!P) P = fromTemplate('wardrobe');

  const ui = { step: Store.get('cabStep', 'model'), sec: 0, fronts: true, open: false, dims: false, explode: 0, walls: true, human: false };
  const undo = [], redo = [];
  let C = calc(P), L = C.L;

  app.innerHTML = `
  <section class="cab" id="cabRoot">
    <div class="cab-stage" id="cabStage">
      <div class="cab-view" id="cabView"></div>
      <div class="cab-labels" id="cabLabels"></div>
      <div class="cab-tip" id="cabTip" hidden></div>
      <div class="vbar">
        <div class="seg" id="cabViews"><button data-view="34" class="on">3/4</button><button data-view="front">Спереди</button><button data-view="side">Сбоку</button><button data-view="top">Сверху</button></div>
        <div class="seg icons">
          <button id="cUndo" title="Отменить (Ctrl+Z)" aria-label="Отменить">${icon('rotl')}</button>
          <button id="cRedo" title="Повторить (Ctrl+Y)" aria-label="Повторить">${icon('rotate')}</button>
        </div>
      </div>
      <div class="vfoot">
        <div class="seg" id="cTools">
          <button id="cOpen" title="Открыть двери и ящики">${icon('drawer')}<span>Открыть</span></button>
          <button id="cFronts" title="Скрыть фасады, чтобы двигать полки">${icon('eye')}<span>Без фасадов</span></button>
          <button id="cDims" title="Размеры секций и ячеек">${icon('ruler')}<span>Размеры</span></button>
          <button id="cExplode" title="Разнесённый вид — схема сборки">${icon('explode')}<span>Сборка</span></button>
          <button id="cWalls" title="Стены ниши" hidden>${icon('wall')}<span>Ниша</span></button>
          <button id="cHuman" title="Человек ростом 175 см для масштаба">${icon('person')}<span>Рост</span></button>
          <button id="cAR" title="Примерить у себя дома в дополненной реальности">${icon('ar')}<span>AR</span></button>
        </div>
        <span class="vhint" id="cHint">${icon('move')} Тяните полки, перегородки и стенки мышью</span>
      </div>
    </div>
    <aside class="cab-panel">
      <div class="cab-head">
        <div class="eyebrow">Конструктор корпусной мебели</div>
        <h1 id="cName"></h1>
        <div class="cab-dims" id="cDimsLbl"></div>
      </div>
      <nav class="cab-steps" id="cSteps">${STEPS.map(([id, n], i) => `<button data-step="${id}"><i>${i + 1}</i>${n}</button>`).join('')}</nav>
      <div class="cab-body" id="cBody"></div>
      <div class="cab-foot">
        <div><div class="muted" style="font-size:12.5px">Под ключ, с доставкой</div><b id="cPrice"></b></div>
        <div class="cab-foot-btns">
          <button class="btn btn-ghost" id="cCart" title="Добавить в корзину">${icon('bag')}</button>
          <a class="btn btn-primary" href="#/constructor/project" id="cProject">${icon('doc')} Проект</a>
        </div>
      </div>
    </aside>
  </section>`;

  const viewer = new Viewer($('#cabView'), { autoRotate: false, pan: true });
  let model = null, first = true, raf = 0;

  const rebuild = () => {
    raf = 0;
    model = buildCabinet(L);
    viewer.setModel(model, { keepView: !first, view: '34', pad: 1.08 });
    first = false;
    model.userData.setFronts(ui.fronts);
    if (model.userData.niche) model.userData.niche.visible = ui.walls;
    if (ui.human) { const h = mannequin(); h.position.set(-(P.W / 2 + (L.niche ? 120 : 0) + 480) * S, 0, 0); model.add(h); }
    if (ui.explode) model.userData.explode.set(ui.explode);
    if (ui.open) { model.userData.open.set(1); viewer.openState = { t: 1, target: 1 }; }
    highlight();
    buildDimLabels();
    viewer.refresh();
    $('#cWalls').hidden = !L.niche;
  };
  const scheduleRebuild = () => { if (!raf) raf = requestAnimationFrame(rebuild); };

  function highlight() {
    if (!model) return;
    model.children.filter((c) => c.userData.hl).forEach((c) => { model.remove(c); c.geometry.dispose(); c.material.dispose(); });
    const pk = model.userData.pickers[ui.sec];
    if (!pk || ui.step !== 'fill' || drag) { viewer.invalidate(); return; }
    const geo = pk.geometry.clone();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2f4b3d', transparent: true, opacity: 0.08, depthWrite: false }));
    m.position.copy(pk.position);
    m.userData = { hl: true, noBounds: true, noContact: true };
    m.renderOrder = 3;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#2f4b3d', transparent: true, opacity: 0.8, depthTest: false }));
    e.userData = { hl: true, noBounds: true, noContact: true };
    e.position.copy(pk.position);
    e.renderOrder = 4;
    model.add(m, e);
    viewer.invalidate();
  }

  /* ---------- размеры в 3D: ширины секций и высоты ячеек ---------- */
  const labelsEl = $('#cabLabels');
  let dimItems = [];
  function buildDimLabels() {
    labelsEl.innerHTML = '';
    dimItems = [];
    if (!ui.dims || !model) return;
    const { ox, oz } = model.userData.offset;
    const at = (x, y, z) => new THREE.Vector3((x + ox) * S, y * S, (z + oz) * S);
    const lab = (text, pos, cls = '') => { const el = document.createElement('span'); el.className = 'dim-label ' + cls; el.textContent = text; labelsEl.appendChild(el); dimItems.push({ el, pos }); };
    const zf = P.D + (ui.fronts && !ui.open ? L.FT + 4 : 2);
    for (const Sx of L.secs) {
      lab(`${mm(Sx.cw)}`, at(Sx.x0 + Sx.cw / 2, P.H + 50, P.D / 2), 'w');
      if (ui.fronts && !ui.open && !ui.explode) continue;
      for (const c of Sx.cells) lab(`${mm(c.h)}`, at(Sx.x0 + Sx.cw / 2, (c.y0 + c.y1) / 2, zf), 'h small');
    }
    lab(`${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)}`, at(P.W / 2, -60, P.D + 60), 'tot');
    placeDimLabels();
  }
  function placeDimLabels() {
    if (!dimItems.length) return;
    const w = labelsEl.clientWidth, h = labelsEl.clientHeight, v = new THREE.Vector3();
    for (const it of dimItems) {
      v.copy(it.pos).project(viewer.camera);
      it.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    }
  }
  viewer.onRender = placeDimLabels;

  /* ---------- изменения проекта ---------- */
  const save = () => Store.set('cab', P);
  function recompute() { C = calc(P); L = C.L; }
  function commit(fn, { panel = true, history = true } = {}) {
    if (history) { undo.push(JSON.stringify(P)); if (undo.length > 100) undo.shift(); redo.length = 0; }
    fn(P);
    normalize(P);
    ui.sec = Math.min(ui.sec, P.sections.length - 1);
    recompute();
    save();
    scheduleRebuild();
    summary();
    if (panel) renderStep();
  }
  function restore(json) { P = normalize(JSON.parse(json)); recompute(); save(); scheduleRebuild(); summary(); renderStep(); }
  $('#cUndo').onclick = () => { if (undo.length) { redo.push(JSON.stringify(P)); restore(undo.pop()); } };
  $('#cRedo').onclick = () => { if (redo.length) { undo.push(JSON.stringify(P)); restore(redo.pop()); } };

  function summary() {
    $('#cName').textContent = P.name;
    $('#cDimsLbl').textContent = `${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм · ${P.sections.length} ${plural(P.sections.length, 'секция', 'секции', 'секций')} · ≈ ${Math.round(C.mass.total)} кг`;
    $('#cPrice').textContent = fmt(C.pr.total);
    const bad = L.errors.length;
    $('#cProject').classList.toggle('disabled', !!bad);
    $('#cCart').disabled = !!bad;
    $$('#cSteps button').forEach((b) => {
      b.classList.toggle('on', b.dataset.step === ui.step);
      b.classList.toggle('warn', b.dataset.step === 'order' && (bad || L.warns.length) > 0);
    });
    $('#cUndo').disabled = !undo.length; $('#cRedo').disabled = !redo.length;
  }

  /* ---------- шаги ---------- */
  const body = $('#cBody');
  function renderStep() {
    Store.set('cabStep', ui.step);
    $$('#cSteps button').forEach((b) => b.classList.toggle('on', b.dataset.step === ui.step));
    const keep = body.scrollTop;
    body.innerHTML = ({ model: stepModel, size: stepSize, fill: stepFill, finish: stepFinish, order: stepOrder })[ui.step]();
    body.scrollTop = keep;
    if (ui.step === 'model') for (const img of $$('img[data-tpl]', body)) {
      const id = img.dataset.tpl;
      const make = id.startsWith('preset:') ? () => PRESETS[id.slice(7)].make() : () => fromTemplate(id);
      thumbs.get('cab3-tpl-' + id, () => { const g = buildCabinet(layout(make())); g.userData.niche && (g.userData.niche.visible = false); return g; }, 'card').then((u) => { if (u) { img.src = u; img.onload = () => img.classList.add('ready'); } });
    }
    highlight();
  }
  $('#cSteps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { ui.step = b.dataset.step; body.scrollTop = 0; renderStep(); } });

  const numRow = (id, label, v, [a, b], step = 10, unit = 'мм', disabled = false) => `
    <div class="num-row ${disabled ? 'dis' : ''}"><label for="${id}">${label}</label>
      <div class="num"><button data-nudge="${id}" data-d="-${step}" aria-label="Меньше" ${disabled ? 'disabled' : ''}>${icon('minus')}</button><input id="${id}" type="number" inputmode="numeric" min="${a}" max="${b}" step="${step}" value="${Math.round(v)}" ${disabled ? 'disabled' : ''}><span>${unit}</span><button data-nudge="${id}" data-d="${step}" aria-label="Больше" ${disabled ? 'disabled' : ''}>${icon('plus')}</button></div>
      ${disabled ? '<small>рассчитано по замеру ниши</small>' : `<input type="range" data-for="${id}" min="${a}" max="${b}" step="${step}" value="${Math.round(v)}"><small>${mm(a)}–${mm(b)}</small>`}</div>`;
  const pills = (attr, cur, list, cls = '') => `<div class="pills">${list.map(([v, n]) => `<button class="pill ${cls} ${String(cur) === String(v) ? 'on' : ''}" data-${attr}="${v}">${n}</button>`).join('')}</div>`;
  const opt = (title, right, inner) => `<div class="opt"><div class="opt-head"><b>${title}</b><span>${right}</span></div>${inner}</div>`;

  function stepModel() {
    return `<h3 class="cab-h3">Готовые решения</h3>
      <div class="tpl-grid presets-grid">${Object.entries(PRESETS).map(([id, t]) => `
        <button class="tpl" data-preset-pick="${id}"><div class="im"><img data-tpl="preset:${id}" alt=""></div><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
      <h3 class="cab-h3">Или начните с основы</h3>
      <p class="cab-lead">Дальше всё меняется: размеры, секции, полки, ящики, аксессуары и отделка.</p>
      <div class="tpl-grid">${Object.entries(TEMPLATES).map(([id, t]) => `
        <button class="tpl ${P.tpl === id ? 'on' : ''}" data-tpl-pick="${id}"><div class="im"><img data-tpl="${id}" alt=""></div><b>${t.name}</b><span>${t.desc}</span><small>${mm(t.p.W)} × ${mm(t.p.H)} × ${mm(t.p.D)}</small></button>`).join('')}
      </div>`;
  }

  function nicheForm() {
    const n = P.niche, f = fitNiche(n);
    const inp = (key, k, label) => `<label class="ni"><span>${label}</span><input type="number" data-niche="${key}" data-k="${k ?? ''}" value="${k == null ? n[key] : n[key][k]}"></label>`;
    return `<div class="niche">
      <div class="niche-pic">${nicheMini(n, f)}</div>
      <div class="niche-in">
        <div class="ng"><b>Ширина ниши</b>${inp('w', 0, 'вверху')}${inp('w', 1, 'в середине')}${inp('w', 2, 'внизу')}</div>
        <div class="ng"><b>Высота ниши</b>${inp('h', 0, 'слева')}${inp('h', 1, 'в центре')}${inp('h', 2, 'справа')}</div>
        <div class="ng"><b>Глубина и плинтус</b>${inp('d', null, 'глубина')}<label class="ni"><span>плинтус, высота</span><input type="number" data-niche="sk" data-k="h" value="${n.skirting.h}"></label><label class="ni"><span>плинтус, толщина</span><input type="number" data-niche="sk" data-k="d" value="${n.skirting.d}"></label></div>
      </div>
    </div>
    <div class="opt-sub">Доборы ${pills('fillers', n.fillers, [['none', 'Без доборов'], ['sides', 'По бокам'], ['all', 'Бока и верх']], 'sm')}</div>
    <div class="fit"><div><span>Корпус</span><b>${mm(P.W)} × ${mm(P.H)} мм</b></div><div><span>Зазор / добор</span><b>${n.fillers === 'none' ? `${n.gap} мм с каждой стороны` : `${FILLER} мм + ${SCRIBE} мм на подгонку`}</b></div><div><span>Перекос</span><b>${f.skewW} мм по ширине, ${f.skewH} мм по высоте</b></div></div>
    <p class="note">Замер — в трёх точках: ниши редко бывают ровными. Корпус считается по наименьшему размеру, щели закрывают доборы, которые подрезаются по стене на месте.</p>`;
  }
  function nicheMini(n, f) {
    const W = 220, Hh = 150, sx = W / f.maxW, sy = Hh / f.maxH, cx = W / 2;
    const [wt, wm, wb] = n.w, [hl, hm, hr] = n.h;
    const pts = [[cx - wb / 2 * sx, Hh], [cx + wb / 2 * sx, Hh], [cx + wm / 2 * sx, Hh / 2], [cx + wt / 2 * sx, Hh - hr * sy], [cx, Hh - hm * sy], [cx - wt / 2 * sx, Hh - hl * sy], [cx - wm / 2 * sx, Hh / 2]];
    const cw = P.W * sx, ch = P.H * sy;
    return `<svg viewBox="-10 -10 ${W + 20} ${Hh + 20}"><polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="#f2ede4" stroke="#1f1c19" stroke-width="1.4"/><rect x="${cx - cw / 2}" y="${Hh - ch}" width="${cw}" height="${ch}" fill="#2f4b3d1c" stroke="#2f4b3d" stroke-width="1.4" stroke-dasharray="4 3"/></svg>`;
  }

  function stepSize() {
    const avail = P.W - 2 * L.T - (P.sections.length - 1) * L.T;
    const niche = P.install === 'niche';
    return `${opt('Установка', niche ? 'в нишу по замеру' : 'отдельностоящий', pills('set-install', P.install, [['free', 'Отдельностоящий'], ['niche', 'В нишу']]))}
      ${niche ? nicheForm() : ''}
      ${numRow('fW', 'Ширина', P.W, LIMITS.W, 10, 'мм', niche)}${numRow('fH', 'Высота', P.H, LIMITS.H, 10, 'мм', niche)}${numRow('fD', 'Глубина корпуса', P.D, LIMITS.D)}
      ${opt('Плита корпуса', `ЛДСП ${P.th} мм`, pills('th', P.th, THICKNESS.map((t) => [t, `${t} мм`])))}
      ${opt('Основание', `${P.base === 'legs' ? 'опоры' : 'цоколь'} ${P.baseH} мм`, `<div class="pills"><button class="pill ${P.base === 'plinth' ? 'on' : ''}" data-set="base" data-v="plinth">Цоколь</button><button class="pill ${P.base === 'legs' ? 'on' : ''}" data-set="base" data-v="legs">Ножки</button>
        ${(P.base === 'legs' ? [100, 120, 150] : [60, 80, 100]).map((h) => `<button class="pill ${P.baseH === h ? 'on' : ''}" data-set="baseH" data-v="${h}">${h} мм</button>`).join('')}</div>`)}
      ${opt('Двери', P.doors === 'sliding' ? `купе, ${L.sliding?.n || 2} шт.` : 'распашные', pills('set-doors', P.doors, [['hinged', 'Распашные'], ['sliding', 'Купе']]) +
        (P.doors === 'hinged' && P.H >= 1700 ? `<div class="opt-sub">Антресоль ${pills('mezz', P.mezz, [[0, 'Нет'], [350, '350'], [450, '450'], [550, '550 мм']], 'sm')}</div>` : '') +
        `<p class="note">${P.doors === 'sliding' ? 'Ящики за дверями-купе становятся внутренними. Заполнение дверей — на шаге «Отделка».' : 'Тип фасада для каждой секции — дверь, стекло, зеркало или открытая — выбирается на шаге «Наполнение».'}</p>`)}
      ${opt('Секции', `внутри ${mm(avail)} мм`, `<div class="sec-count"><button class="icon-btn" data-sec="-1" aria-label="Меньше секций">${icon('minus')}</button><b>${P.sections.length}</b><button class="icon-btn" data-sec="1" aria-label="Больше секций">${icon('plus')}</button>
        <button class="chip" data-even>Поровну</button></div>
        <div class="sec-widths">${P.sections.map((s, i) => `<label class="sw-in"><span>${i + 1}</span><input type="number" data-secw="${i}" value="${Math.round(L.secW[i])}" ${s.w === 'auto' ? 'class="auto"' : ''}><button class="mini ${s.w === 'auto' ? 'on' : ''}" data-secauto="${i}">авто</button></label>`).join('')}</div>
        <p class="note">Ширины в свету, между боковинами и перегородками (ЛДСП ${L.T} мм). Перегородки можно тянуть мышью прямо в 3D.</p>`)}`;
  }

  function cellsHTML(Sx, s) {
    const rows = s.cells.map((c, j) => ({ c, j, Cc: Sx?.cells[j] })).reverse();
    return rows.map(({ c, j, Cc }) => `
      <div class="cell-row k-${c.k}" data-j="${j}">
        <span class="cell-ico">${icon(CELL_KINDS[c.k].icon)}</span>
        <select data-cell="kind" aria-label="Тип">${Object.entries(CELL_KINDS).map(([k, v]) => `<option value="${k}" ${k === c.k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        <div class="cell-h"><input type="number" data-cell="h" value="${c.h === 'auto' ? '' : c.h}" placeholder="${Cc ? Math.round(Cc.h) : ''}" aria-label="Высота в свету, мм"><button class="mini ${c.h === 'auto' ? 'on' : ''}" data-cell="auto">авто</button></div>
        <div class="cell-tools">
          <button data-cell="up" title="Выше" ${j === s.cells.length - 1 ? 'disabled' : ''}>↑</button><button data-cell="down" title="Ниже" ${j === 0 ? 'disabled' : ''}>↓</button><button data-cell="del" title="Удалить" ${s.cells.length === 1 ? 'disabled' : ''}>${icon('close')}</button>
        </div>
      </div>`).join('');
  }

  function stepFill() {
    const s = P.sections[ui.sec], Sx = L.secs[ui.sec];
    const doorW = Sx ? (ui.sec === 0 || ui.sec === P.sections.length - 1 ? Sx.cw + L.T * 1.5 : Sx.cw + L.T) : 0;
    const shelves = L.shelves.filter((q) => q.sec === ui.sec);
    const worst = shelves.sort((a, b) => b.sag - a.sag)[0];
    return `<div class="sec-tabs">${P.sections.map((x, i) => `<button class="chip ${i === ui.sec ? 'on' : ''}" data-pick="${i}">Секция ${i + 1}<span class="n">${Math.round(L.secW[i])}</span></button>`).join('')}</div>
      ${P.doors === 'hinged' ? opt('Фасад секции', s.front === 'open' ? 'без двери' : doorW > 600 ? '2 створки' : '1 створка',
        pills('front', s.front, Object.entries(FRONT_KINDS)) +
        (s.front !== 'open' && doorW <= 600 ? `<div class="opt-sub">${pills('hinge', s.hinge, [['auto', 'Петли: авто'], ['left', 'Слева'], ['right', 'Справа']], 'sm')}</div>` : '')) : ''}
      ${opt('Наполнение', 'сверху вниз, высоты в свету', `<div class="presets">
          <button class="chip" data-preset="shelves">Только полки</button><button class="chip" data-preset="hang">Штанга</button><button class="chip" data-preset="mixed">Ящики и полки</button><button class="chip" data-preset="drawers">Только ящики</button><button class="chip" data-preset="hall">Прихожая</button>
        </div>
        <div class="cells">${cellsHTML(Sx, s)}</div>
        <div class="cell-add">${Object.entries(CELL_KINDS).map(([k, v]) => `<button class="btn btn-ghost btn-sm" data-add="${k}">${icon('plus')}${v.name}</button>`).join('')}</div>
        <p class="note">Между ячейками ставится полка ${L.T} мм, между соседними ящиками — нет. Высоту можно ввести числом или потянуть полку мышью в 3D (с фасадами, скрытыми кнопкой «Без фасадов»).</p>`)}
      ${opt('Нагрузка на полки', LOADS[P.load].name, pills('load', P.load, Object.entries(LOADS).map(([k, v]) => [k, v.name.split(':')[0]]), 'sm') +
        (worst ? `<div class="sag ${worst.ok ? 'ok' : 'bad'}"><div class="sag-bar"><i style="width:${Math.min(100, (worst.sag / worst.limit) * 100)}%"></i></div><span>Прогиб полки ${mm(worst.span)} мм: <b>${f1(worst.sag)} мм</b> под ${Math.round(worst.load)} кг, допустимо ${f1(worst.limit)} мм</span></div>` : '<p class="note">В этой секции нет полок.</p>'))}
      ${issues()}`;
  }

  function stepFinish() {
    const sw = (set, kind, cur, attr) => `<div class="sw-row">${Object.entries(set).map(([id, d]) => `<button class="sw ${cur === id ? 'on' : ''}" style="${swStyle(kind, d)}" ${attr}="${id}" title="${esc(d.name)}" aria-label="${esc(d.name)}"></button>`).join('')}</div>`;
    const fk = P.front.kind;
    return `${opt(`Корпус · ЛДСП ${P.th} мм`, DECORS[P.body].name, sw(DECORS, 'decor', P.body, 'data-body'))}
      ${opt('Фасады', fk === 'enamel' ? 'МДФ эмаль · ' + ENAMELS[P.front.id].name : 'ЛДСП · ' + DECORS[P.front.id].name,
        `<div class="pills" style="margin-bottom:12px"><button class="pill sm ${fk === 'decor' ? 'on' : ''}" data-fkind="decor">ЛДСП в кромке</button><button class="pill sm ${fk === 'enamel' ? 'on' : ''}" data-fkind="enamel">МДФ в эмали</button></div>
        ${fk === 'enamel' ? sw(ENAMELS, 'enamel', P.front.id, 'data-front-id') : sw(DECORS, 'decor', P.front.id, 'data-front-id')}`)}
      ${P.doors === 'sliding' ? opt('Заполнение дверей-купе', `${P.slideFill.filter((x) => x === 'mirror').length} с зеркалом`, `<div class="slide-fills">${P.slideFill.map((f, k) => `<div><span>Дверь ${k + 1}</span>${pills('sfill', f, [['panel', 'Плита'], ['mirror', 'Зеркало']], 'sm').replace(/data-sfill=/g, `data-door="${k}" data-sfill=`)}</div>`).join('')}</div>`) : ''}
      ${opt('Ручки', HANDLES[P.handle].name, `<div class="pills">${Object.entries(HANDLES).map(([id, h]) => `<button class="pill sm ${P.handle === id ? 'on' : ''}" data-handle="${id}">${h.name}</button>`).join('')}</div>
        ${P.handle !== 'push' ? `<div style="margin-top:12px">${sw(HANDLE_METALS, 'metal', P.metal, 'data-metal')}</div>` : ''}`)}
      ${opt('Кромка', 'ПВХ в цвет декора', '<p class="note" style="margin:0">2 мм на видимых торцах корпуса и по периметру фасадов из ЛДСП, 0,4 мм на скрытых торцах ящиков. Эмалированные фасады кромки не требуют.</p>')}`;
  }

  function issues() {
    if (!L.errors.length && !L.warns.length) return '<div class="issue ok">' + icon('check') + '<span>Конструкция в порядке: всё помещается, прогиб полок в норме.</span></div>';
    return [...L.errors.map((t) => `<div class="issue err">${icon('close')}<span>${esc(t)}</span></div>`), ...L.warns.map((t) => `<div class="issue">${icon('bulb')}<span>${esc(t)}</span></div>`)].join('');
  }

  function stepOrder() {
    const { rows, pr, mass } = C, ed = edgeTotals(rows);
    const nParts = rows.reduce((a, r) => a + r.qty, 0);
    const groups = {};
    for (const l of pr.lines) (groups[l.group] ||= []).push(l);
    return `${issues()}
      <div class="kpis">
        <div><b>${nParts}</b><span>${plural(nParts, 'деталь', 'детали', 'деталей')} · ${rows.length} поз.</span></div><div><b>${pr.sheets}</b><span>${plural(pr.sheets, 'лист', 'листа', 'листов')} плиты</span></div>
        <div><b>${L.holesTotal}</b><span>отверстий присадки</span></div><div><b>${Math.round(mass.total)}</b><span>кг, ${Math.round(ed.e2 + ed.e04)} м кромки</span></div>
      </div>
      ${opt('Стоимость', 'расчёт по себестоимости', `<dl class="spec cost">${Object.entries(groups).map(([g, ls]) => `<dt class="grp">${g}</dt><dd class="grp"></dd>${ls.map((l) => `<dt>${esc(l.name)}</dt><dd>${fmt(l.sum)}</dd>`).join('')}`).join('')}<dt class="tot">Итого</dt><dd class="tot">${fmt(pr.total)}</dd></dl>`)}
      ${opt('Для производства', '', `<ul class="deliver"><li>${icon('doc')}Чертежи: фасад, вид без фасадов, разрезы${L.niche ? ', замер ниши' : ''}</li><li>${icon('grid')}Спецификация: чистовые и пильные размеры, кромка, масса</li><li>${icon('tool')}Деталировка с присадкой: ${L.holesTotal} отверстий с координатами</li><li>${icon('explode')}Схема сборки и порядок монтажа</li><li>${icon('cube')}Карты раскроя листов ${SHEET.L}×${SHEET.W} мм, CSV для станка</li></ul>
        <a class="btn btn-primary btn-block ${L.errors.length ? 'disabled' : ''}" href="#/constructor/project">${icon('doc')} Открыть проект для производства</a>
        <button class="btn btn-ghost btn-block" data-cart style="margin-top:8px" ${L.errors.length ? 'disabled' : ''}>${icon('bag')} Добавить в корзину</button>
        <button class="btn btn-ghost btn-block" data-room style="margin-top:8px" ${L.errors.length ? 'disabled' : ''}>${icon('room')} Поставить в 3D-планировщик комнаты</button>
        <div class="row-btns"><button class="btn btn-ghost btn-sm" data-dxf>${icon('grid')}DXF для ЧПУ</button><button class="btn btn-ghost btn-sm" data-share>${icon('copy')}Ссылка на проект</button><button class="btn btn-ghost btn-sm" data-json>Скачать JSON</button><label class="btn btn-ghost btn-sm">Загрузить<input type="file" accept=".json,application/json" data-import hidden></label></div>`)}`;
  }

  /* ---------- обработчики панели ---------- */
  const DIM = { fW: 'W', fH: 'H', fD: 'D' };
  const setDim = (id, v) => {
    commit((p) => { p[DIM[id]] = +v; }, { panel: false });
    const inp = $('#' + id), rg = $(`[data-for="${id}"]`);
    if (inp && document.activeElement !== inp) inp.value = P[DIM[id]];
    if (rg) rg.value = P[DIM[id]];
  };
  let rangeHist = false;
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[type=range][data-for]')) {
      $('#' + t.dataset.for).value = t.value;
      commit((p) => { p[DIM[t.dataset.for]] = +t.value; }, { panel: false, history: !rangeHist });
      rangeHist = true;
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=range]')) { rangeHist = false; renderStep(); return; }
    if (t.matches('#fW, #fH, #fD')) { setDim(t.id, t.value); renderStep(); }
    else if (t.matches('[data-secw]')) commit((p) => { p.sections[+t.dataset.secw].w = Math.max(LIMITS.secW, +t.value || LIMITS.secW); });
    else if (t.matches('[data-niche]')) commit((p) => {
      const { niche: key, k } = t.dataset, v = +t.value;
      if (key === 'sk') p.niche.skirting[k] = v; else if (k === '') p.niche[key] = v; else p.niche[key][+k] = v;
    });
    else if (t.matches('[data-cell="kind"]')) {
      const j = +t.closest('[data-j]').dataset.j;
      commit((p) => { const c = p.sections[ui.sec].cells[j]; c.k = t.value; if (c.h === 'auto' && CELL_KINDS[t.value].max) c.h = Math.min(CELL_KINDS[t.value].max, Math.max(CELL_KINDS[t.value].min, 180)); });
    } else if (t.matches('[data-cell="h"]')) {
      const j = +t.closest('[data-j]').dataset.j;
      commit((p) => { p.sections[ui.sec].cells[j].h = +t.value > 0 ? +t.value : 'auto'; });
    } else if (t.matches('[data-import]')) {
      const f = t.files[0];
      if (f) f.text().then((txt) => { try { const np = normalize(JSON.parse(txt)); commit((p) => { for (const k of Object.keys(p)) delete p[k]; Object.assign(p, np); }); toast('Проект загружен'); } catch { toast('Не удалось прочитать файл'); } });
    }
  });
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a, label');
    if (!t) return;
    const d = t.dataset;
    if (d.tplPick) {
      const prev = JSON.stringify(P);
      commit((p) => {
        const keep = { body: p.body, front: p.front, handle: p.handle, metal: p.metal, th: p.th }, n = fromTemplate(d.tplPick);
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, n, keep);
      });
      ui.sec = 0;
      toast(`Шаблон «${TEMPLATES[d.tplPick].name}»`, { text: 'Вернуть', onClick: () => restore(prev) });
      first = true; scheduleRebuild();
    } else if (d.presetPick) {
      const prev = JSON.stringify(P);
      commit((p) => { const n = PRESETS[d.presetPick].make(); for (const k of Object.keys(p)) delete p[k]; Object.assign(p, n); });
      ui.sec = 0;
      toast(`Готовое решение «${PRESETS[d.presetPick].name}»`, { text: 'Вернуть', onClick: () => restore(prev) });
      first = true; scheduleRebuild();
    } else if (d.nudge) { const inp = $('#' + d.nudge); setDim(d.nudge, +inp.value + +d.d); inp.value = P[DIM[d.nudge]]; }
    else if (d.setInstall) commit((p) => { p.install = d.setInstall; if (d.setInstall === 'niche') { const n = p.niche; if (Math.min(...n.w) < 400) Object.assign(n, { w: [p.W + 100, p.W + 104, p.W + 97] }); } });
    else if (d.setDoors) commit((p) => { p.doors = d.setDoors; });
    else if (d.fillers) commit((p) => { p.niche.fillers = d.fillers; });
    else if (d.th) commit((p) => { p.th = +d.th; });
    else if (d.mezz !== undefined) commit((p) => { p.mezz = +d.mezz; });
    else if (d.load) commit((p) => { p.load = d.load; });
    else if (d.set) commit((p) => { p[d.set] = d.set === 'baseH' ? +d.v : d.v; if (d.set === 'base') p.baseH = d.v === 'legs' ? 120 : 80; });
    else if (d.sec) commit((p) => {
      if (+d.sec > 0 && p.sections.length < LIMITS.sections[1]) { p.sections.push(clone(p.sections[p.sections.length - 1])); p.sections[p.sections.length - 1].w = 'auto'; }
      if (+d.sec < 0 && p.sections.length > 1) p.sections.pop();
    });
    else if ('even' in d) commit((p) => { for (const s of p.sections) s.w = 'auto'; });
    else if (d.secauto !== undefined) commit((p) => { const s = p.sections[+d.secauto]; s.w = s.w === 'auto' ? Math.round(L.secW[+d.secauto]) : 'auto'; });
    else if (d.pick !== undefined) { ui.sec = +d.pick; renderStep(); focusSection(ui.sec); }
    else if (d.front) commit((p) => { p.sections[ui.sec].front = d.front; });
    else if (d.hinge) commit((p) => { p.sections[ui.sec].hinge = d.hinge; });
    else if (d.preset) commit((p) => { p.sections[ui.sec].cells = preset(d.preset); });
    else if (d.add) commit((p) => {
      const cs = p.sections[ui.sec].cells, K = CELL_KINDS[d.add];
      if (d.add === 'drawer') { let k = 0; while (k < cs.length && cs[k].k === 'drawer') k++; cs.splice(k, 0, { k: 'drawer', h: 180 }); }
      else if (d.add === 'rail' || d.add === 'pants') cs.splice(Math.max(0, cs.length - 1), 0, { k: d.add, h: 'auto' });
      else if (d.add === 'box') cs.push({ k: 'box', h: 'auto' });
      else cs.unshift({ k: d.add, h: K.max ? Math.min(K.max, 220) : K.min + 20 });
    });
    else if (d.cell) {
      const j = +t.closest('[data-j]').dataset.j;
      if (d.cell === 'auto') commit((p) => { const c = p.sections[ui.sec].cells[j]; c.h = c.h === 'auto' ? Math.round(L.secs[ui.sec].cells[j].h) : 'auto'; });
      if (d.cell === 'del') commit((p) => { p.sections[ui.sec].cells.splice(j, 1); });
      if (d.cell === 'up' || d.cell === 'down') commit((p) => { const cs = p.sections[ui.sec].cells, k = d.cell === 'up' ? j + 1 : j - 1; [cs[j], cs[k]] = [cs[k], cs[j]]; });
    }
    else if (d.body) commit((p) => { if (p.front.kind === 'decor' && p.front.id === p.body) p.front.id = d.body; p.body = d.body; });
    else if (d.fkind) commit((p) => { p.front = d.fkind === 'enamel' ? { kind: 'enamel', id: 'sage' } : { kind: 'decor', id: p.body }; });
    else if (d.frontId) commit((p) => { p.front.id = d.frontId; });
    else if (d.sfill) commit((p) => { p.slideFill[+d.door] = d.sfill; });
    else if (d.handle) commit((p) => { p.handle = d.handle; });
    else if (d.metal) commit((p) => { p.metal = d.metal; });
    else if ('cart' in d) addToCart();
    else if ('room' in d) ctx.toPlanner(clone(P));
    else if ('dxf' in d) download(`${projectNo(P)}-cnc.dxf`, partsDXF(C.rows, { title: `${P.name} ${projectNo(P)}` }).text, 'application/dxf');
    else if ('share' in d) {
      const url = location.href.split('#')[0] + '#/constructor?p=' + (await encodeProject(P));
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast('Скопируйте ссылку из адресной строки'); history.replaceState(null, '', url.slice(url.indexOf('#'))); }
    } else if ('json' in d) download(`${projectNo(P)}.json`, JSON.stringify(P, null, 2), 'application/json');
  });

  function preset(kind) {
    const Sx = L.secs[ui.sec], T = L.T;
    const Hin = Sx ? Sx.cells.reduce((a, c) => a + c.h, 0) + Sx.cells.filter((c) => c.shelf != null).length * T : P.H - P.baseH - 2 * T;
    const n = (step) => Math.max(1, Math.min(8, Math.round(Hin / step)));
    if (kind === 'shelves') return Array.from({ length: n(360) }, () => ({ k: 'box', h: 'auto' }));
    if (kind === 'drawers') return Array.from({ length: Math.min(6, n(200)) }, () => ({ k: 'drawer', h: 'auto' }));
    if (kind === 'hang') return Hin > 1500 ? [{ k: 'box', h: 320 }, { k: 'rail', h: 'auto' }, { k: 'box', h: 380 }] : [{ k: 'rail', h: 'auto' }, { k: 'box', h: Math.max(150, Math.round(Hin * 0.2)) }];
    if (kind === 'hall') return Hin > 1500 ? [{ k: 'shoes', h: 360 }, { k: 'rail', h: 'auto' }, { k: 'box', h: 380 }] : [{ k: 'shoes', h: Math.max(320, Math.round(Hin * 0.5)) }, { k: 'box', h: 'auto' }];
    const dr = Hin > 900 ? 3 : Hin > 500 ? 2 : 1;
    const boxes = Math.max(1, Math.round((Hin - dr * 180) / 380));
    return [...Array.from({ length: dr }, () => ({ k: 'drawer', h: Hin > 900 ? 180 : 'auto' })), ...Array.from({ length: boxes }, () => ({ k: 'box', h: 'auto' }))];
  }

  function addToCart() {
    if (L.errors.length) { toast('Сначала исправьте ошибки в проекте'); return; }
    ctx.addCustom({ kind: 'cab', p: clone(P), price: C.pr.total, title: cabTitle(P), summary: cabSummary(P), no: projectNo(P) });
  }
  $('#cCart').onclick = addToCart;

  /* ---------- 3D: подсказки, выбор секции, перетаскивание ---------- */
  const stage = $('#cabStage'), tip = $('#cabTip');
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const visibleChain = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  function hitAt(e) {
    if (!model) return null;
    const r = viewer.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, viewer.camera);
    return ray.intersectObject(model, true).find((h) => h.object.userData.role && !h.object.userData.hl && visibleChain(h.object)) || null;
  }
  const draggable = (u) => !ui.explode && ((u.role === 'shelf') || (u.role === 'divider') || ((u.role === 'side' || u.role === 'top') && P.install === 'free'));

  function tipFor(hit) {
    const u = hit.object.userData, b = u.boxId != null ? L.boxes[u.boxId] : null;
    if (u.role === 'rail') return `<b>Штанга</b><span>${mm(L.rails.find((r) => r.sec === u.sec)?.x1 - L.rails.find((r) => r.sec === u.sec)?.x0 || 0)} мм, овальная, хром</span>`;
    if (u.role === 'acc') return `<b>${CELL_KINDS[P.sections[u.sec].cells[u.cell]?.k]?.name || 'Аксессуар'}</b><span>секция ${u.sec + 1}</span>`;
    if (!b) return '';
    const row = C.rows.find((r) => r.no === b.partNo);
    const hint = draggable(u) ? `<em>${u.role === 'shelf' ? '↕ тяните, чтобы сдвинуть полку' : u.role === 'divider' ? '↔ тяните, чтобы изменить ширину секций' : u.role === 'top' ? '↕ тяните, чтобы изменить высоту' : '↔ тяните, чтобы изменить ширину'}</em>` : '';
    if (!row) return `<b>${b.role === 'glass' ? 'Стеклянная дверь' : b.mirror ? 'Дверь-купе с зеркалом' : 'Деталь'}</b><span>${mm(b.h)} × ${mm(b.w)} мм</span>`;
    return `<b>№ ${row.no} · ${esc(row.name)}</b><span>${row.len} × ${row.wid} × ${row.t} мм · ${esc(row.mat.name)}</span><span>Кромка: ${edgeLabel(row.e)} · отверстий: ${row.holes.length}${row.qty > 1 ? ` · таких ${row.qty}` : ''}</span>${hint}`;
  }

  let drag = null, down = null, hoverRaf = 0, lastMove = null;
  const dragPlane = (point) => {
    const dir = new THREE.Vector3();
    viewer.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(dir.normalize().negate(), point);
  };
  const planePoint = (e, plane) => {
    const r = viewer.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, viewer.camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };

  viewer.canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    if (e.button !== 0) return;
    const hit = hitAt(e);
    if (!hit || !draggable(hit.object.userData)) return;
    e.stopImmediatePropagation();
    const u = hit.object.userData, plane = dragPlane(hit.point);
    drag = { u, plane, start: hit.point.clone(), orig: clone(P), origL: L, id: e.pointerId };
    undo.push(JSON.stringify(P)); redo.length = 0;
    viewer.canvas.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
    viewer.interacting(true);
    tip.hidden = true;
  }, true);

  function applyDrag(e) {
    const pt = planePoint(e, drag.plane);
    if (!pt) return;
    const snap = e.shiftKey ? 1 : 5;
    const { u, orig, origL } = drag;
    const vertical = u.role === 'shelf' || u.role === 'top';
    let delta = (vertical ? pt.y - drag.start.y : pt.x - drag.start.x) / S;
    delta = Math.round(delta / snap) * snap;
    const p = clone(orig);
    let label = '';
    if (u.role === 'shelf') {
      const Sx = origL.secs[u.sec], a = Sx.cells[u.cell], b = Sx.cells[u.cell + 1];
      const total = a.h + b.h;
      const lo = Math.max(60, CELL_KINDS[a.k].min * 0.5), hi = total - Math.max(60, CELL_KINDS[b.k].min * 0.5);
      const ha = Math.round(Math.max(lo, Math.min(hi, a.h + delta)));
      p.sections[u.sec].cells[u.cell].h = ha;
      p.sections[u.sec].cells[u.cell + 1].h = Math.round(total - ha);
      label = `${mm(total - ha)} ↑<br>${mm(ha)} ↓`;
    } else if (u.role === 'divider') {
      const i = u.div, a = origL.secs[i].cw, b = origL.secs[i + 1].cw, total = a + b;
      const wa = Math.round(Math.max(LIMITS.secW, Math.min(total - LIMITS.secW, a + delta)));
      p.sections[i].w = wa; p.sections[i + 1].w = Math.round(total - wa);
      label = `${mm(wa)} ← | → ${mm(total - wa)}`;
    } else if (u.role === 'side') {
      p.W = Math.round(Math.max(LIMITS.W[0], Math.min(LIMITS.W[1], orig.W + (u.side === 'right' ? delta : -delta))));
      label = `Ширина ${mm(p.W)}`;
    } else if (u.role === 'top') {
      p.H = Math.round(Math.max(LIMITS.H[0], Math.min(LIMITS.H[1], orig.H + delta)));
      label = `Высота ${mm(p.H)}`;
    }
    P = normalize(p);
    recompute();
    scheduleRebuild();
    summary();
    tip.hidden = false;
    tip.className = 'cab-tip drag';
    tip.innerHTML = `<b>${label}</b>`;
    placeTip(e);
  }

  function placeTip(e) {
    const r = stage.getBoundingClientRect();
    const x = Math.min(e.clientX - r.left + 16, r.width - tip.offsetWidth - 8), y = Math.min(e.clientY - r.top + 16, r.height - tip.offsetHeight - 8);
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }

  const onMove = (e) => {
    if (drag) { applyDrag(e); return; }
    if (e.target !== viewer.canvas || e.buttons) { if (!tip.hidden && !e.buttons) tip.hidden = true; return; }
    lastMove = e;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const ev = lastMove, hit = hitAt(ev);
      const html = hit ? tipFor(hit) : '';
      stage.classList.toggle('can-drag-v', !!hit && draggable(hit.object.userData) && ['shelf', 'top'].includes(hit.object.userData.role));
      stage.classList.toggle('can-drag-h', !!hit && draggable(hit.object.userData) && ['divider', 'side'].includes(hit.object.userData.role));
      if (!html) { tip.hidden = true; return; }
      tip.className = 'cab-tip';
      tip.innerHTML = html;
      tip.hidden = false;
      placeTip(ev);
    });
  };
  const onUp = (e) => {
    if (drag) {
      drag = null;
      stage.classList.remove('dragging');
      viewer.interacting(false);
      tip.hidden = true;
      save();
      renderStep();
      summary();
      return;
    }
    if (!down || e.target !== viewer.canvas || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !model) return;
    const r = viewer.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, viewer.camera);
    const hit = hitAt(e);
    let sec = hit?.object.userData.sec;
    if (sec == null) sec = ray.intersectObjects(model.userData.pickers, false)[0]?.object.userData.sec;
    if (sec != null) { const changed = sec !== ui.sec || ui.step !== 'fill'; ui.sec = sec; ui.step = 'fill'; renderStep(); if (changed) focusSection(sec); $('#cHint').innerHTML = `${icon('move')} Секция ${sec + 1}: настройте наполнение справа`; }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  viewer.canvas.addEventListener('pointerleave', () => { if (!drag) tip.hidden = true; });

  /* ---------- 3D: вид и режимы ---------- */
  $('#cabViews').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    $$('#cabViews button').forEach((x) => x.classList.toggle('on', x === b));
    viewer.goTo(b.dataset.view);
  });
  $('#cOpen').onclick = (e) => { ui.open = viewer.toggleOpen(); e.currentTarget.classList.toggle('on', ui.open); $('span', e.currentTarget).textContent = ui.open ? 'Закрыть' : 'Открыть'; setTimeout(buildDimLabels, 950); };
  $('#cFronts').onclick = (e) => { ui.fronts = !ui.fronts; model?.userData.setFronts(ui.fronts); viewer.invalidate(); e.currentTarget.classList.toggle('on', !ui.fronts); buildDimLabels(); };
  $('#cDims').onclick = (e) => { ui.dims = !ui.dims; e.currentTarget.classList.toggle('on', ui.dims); buildDimLabels(); viewer.invalidate(); };
  $('#cWalls').onclick = (e) => { ui.walls = !ui.walls; if (model?.userData.niche) model.userData.niche.visible = ui.walls; e.currentTarget.classList.toggle('on', ui.walls); viewer.invalidate(); };
  $('#cWalls').classList.add('on');
  $('#cHuman').onclick = (e) => { ui.human = !ui.human; e.currentTarget.classList.toggle('on', ui.human); scheduleRebuild(); };
  // подлёт камеры к выбранной секции
  function focusSection(i) {
    const Sx = L.secs[i];
    if (!Sx || !model) return;
    const { ox, oz } = model.userData.offset;
    const c = new THREE.Vector3((Sx.x0 + Sx.cw / 2 + ox) * S, (P.H / 2) * S, (P.D / 2 + oz) * S);
    const tv = Math.tan(THREE.MathUtils.degToRad(viewer.camera.fov) / 2);
    viewer.focus(c, Math.max(1.6, ((P.H / 1000) * 0.62) / tv));
  }
  let exRaf = 0;
  $('#cExplode').onclick = (e) => {
    const target = ui.explode > 0.5 ? 0 : 1;
    e.currentTarget.classList.toggle('on', !!target);
    cancelAnimationFrame(exRaf);
    const from = ui.explode, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 700);
      ui.explode = from + (target - from) * k;
      model?.userData.explode.set(ui.explode);
      viewer.invalidate();
      if (k < 1) exRaf = requestAnimationFrame(step); else { viewer.refresh(); buildDimLabels(); }
    };
    exRaf = requestAnimationFrame(step);
  };

  if (query.ar) import('../ar.js').then(({ arPrompt }) => arPrompt(() => $('#cAR').click(), icon));
  const arMod = import('../ar.js');   // заранее: по касанию модуль должен быть готов
  $('#cAR').onclick = async () => {
    const { openAR } = await arMod;
    const fresh = buildCabinet(layout(clone(P)));
    const snap = clone(P);
    openAR(fresh, { title: cabTitle(P), url: async () => location.href.split('#')[0] + '#/constructor?p=' + (await encodeProject(snap)), icon }).catch((e) => { console.error(e); toast('Не удалось запустить примерку'); });
  };

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) { e.preventDefault(); (e.shiftKey ? $('#cRedo') : $('#cUndo')).click(); }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'н')) { e.preventDefault(); $('#cRedo').click(); }
  };
  document.addEventListener('keydown', onKey);

  summary();
  renderStep();
  rebuild();
  return () => {
    cancelAnimationFrame(raf); cancelAnimationFrame(exRaf);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    viewer.dispose();
  };
}

/* ================================ ПРОЕКТ ДЛЯ ПРОИЗВОДСТВА ================================ */

function renderShots(L) {
  const c = document.createElement('canvas');
  const st = new Stage(c, { pixelRatio: 1, shadows: true });
  st.setSize(1200, 900);
  st.renderer.setClearColor('#f1ebe2', 1);
  const shots = [];
  try {
    const m = buildCabinet(L);
    if (m.userData.niche) m.userData.niche.visible = false;
    st.setModel(m);
    st.applyView(st.viewFor('34', 1.05)); st.render(); shots.push(c.toDataURL('image/jpeg', 0.9));
    m.userData.open.set(1); st.measure(); st.updateShadow();
    st.applyView(st.viewFor('34', 1.05)); st.render(); shots.push(c.toDataURL('image/jpeg', 0.9));
    m.userData.open.set(0); m.userData.explode.set(1); st.measure(); st.updateShadow();
    st.applyView(st.viewFor('34', 1.0)); st.render(); shots.push(c.toDataURL('image/jpeg', 0.9));
  } finally { st.dispose(); }
  return shots;
}

function assemblySteps(L, rows) {
  const p = L.p, hwq = (re) => L.hw.filter((h) => re.test(h.name)).reduce((a, h) => a + h.qty, 0);
  const nDiv = L.boxes.filter((b) => b.role === 'divider').length, nShelf = L.boxes.filter((b) => b.role === 'shelf').length;
  const diag = Math.round(Math.hypot(p.W, p.H - p.baseH));
  const drawers = Object.values(L.anims).filter((a) => a.type === 'drawer').length;
  const doors = L.boxes.filter((b) => b.kind === 'door').length;
  const steps = [
    ['Проверьте комплектность', `${rows.reduce((a, r) => a + r.qty, 0)} деталей по спецификации и ${L.hw.length} позиций фурнитуры. Детали подписаны номерами из спецификации.`],
    ['Соберите короб', `Боковины, дно и крышку соедините конфирматами 7×50 через отверстия Ø7 в боковинах. Собирайте на ровном полу, лицевой стороной вверх.`],
  ];
  if (nDiv) steps.push(['Установите перегородки', `${nDiv} ${plural(nDiv, 'перегородка', 'перегородки', 'перегородок')} крепятся через крышку и дно в торцы перегородок.`]);
  steps.push(p.base === 'legs' ? ['Установите опоры', `${L.legs.length} опор на монтажных планках к дну.`] : ['Установите цоколь', 'Передний и задний цоколь — на конфирматы к боковинам, затем выставьте регулируемые опоры.']);
  steps.push(['Прибейте заднюю стенку', `Перед креплением ХДФ выровняйте короб по диагоналям: обе должны быть ${mm(diag)} ± 2 мм. Шаг саморезов — 150 мм.`]);
  steps.push(['Поставьте шкаф на место', p.install === 'niche' ? 'Задвиньте корпус в нишу, выставьте по уровню опорами, закрепите к стене. Доборы подрежьте по стене и закрепите уголками к боковинам.' : p.H > 1600 ? 'Выставьте по уровню и обязательно закрепите к стене двумя креплениями.' : 'Выставьте по уровню.']);
  if (nShelf) steps.push(['Полки и штанги', `${hwq(/Полкодержатель/)} полкодержателей вставьте в отверстия System 32 под каждой полкой; соседние ряды позволяют переставить полку на 32 мм. Штанги — на штангодержатели.`]);
  if (drawers) steps.push(['Ящики', `Соберите ${drawers} ${plural(drawers, 'короб', 'короба', 'коробов')} ящиков, закрепите направляющие по разметке присадки, прикрутите фасады и выставьте зазоры 3 мм.`]);
  if (doors) steps.push(['Двери', `Навесьте ${doors} ${plural(doors, 'дверь', 'двери', 'дверей')} на ответные планки, отрегулируйте петли так, чтобы зазоры были 3 мм. Установите ручки.`]);
  if (L.sliding) steps.push(['Двери-купе', 'Закрепите верхнюю и нижнюю направляющие, установите двери на ролики, отрегулируйте их по вертикали.']);
  return steps;
}

export function mountProject(app, ctx) {
  const { toast, icon, esc, fmt, Store } = ctx;
  const saved = Store.get('cab', null);
  const P = normalize(saved || fromTemplate('wardrobe'));
  const { L, rows, maps, pr, mass } = calc(P), ed = edgeTotals(rows), mats = materialsOf(P);
  const no = projectNo(P), date = new Date().toLocaleDateString('ru-RU');
  const drillRows = rows.filter((r) => r.holes.length);
  const detailPages = [];
  for (let i = 0; i < drillRows.length; i += 4) detailPages.push(drillRows.slice(i, i + 4));
  const sheetsTotal = maps.reduce((a, g) => a + g.sheets.length, 0);
  const specPages = [];
  for (let i = 0; i < rows.length; i += 20) specPages.push(rows.slice(i, i + 20));
  const pages = 6 + specPages.length + (L.niche ? 1 : 0) + detailPages.length + sheetsTotal;
  let page = 0;
  const stamp = (title, scale = 'б/м') => { page++; return `<footer class="stamp"><div><b>Ясень · конструктор</b><span>Проект ${no} · ${esc(P.name)}</span></div><div><span>Лист</span><b>${esc(title)}</b></div><div><span>Масштаб</span><b>${scale}</b></div><div><span>Дата</span><b>${date}</b></div><div><span>Лист</span><b>${page} / ${pages}</b></div></footer>`; };
  const nParts = rows.reduce((a, r) => a + r.qty, 0);

  const secRows = L.secs.map((Sx) => `<tr><td>${Sx.i + 1}</td><td>${mm(Sx.cw)}</td><td>${P.doors === 'sliding' ? 'купе' : FRONT_KINDS[Sx.s.front].toLowerCase()}</td><td>${[...Sx.cells].reverse().map((c) => `${CELL_KINDS[c.k].short} ${mm(c.h)}`).join(' · ')}</td></tr>`).join('');
  const groups = {};
  for (const l of pr.lines) (groups[l.group] ||= []).push(l);

  app.innerHTML = `
  <div class="doc-bar"><div class="wrap doc-bar-row">
    <a class="link-arrow back" href="#/constructor">${icon('arrow')} В конструктор</a>
    <div class="doc-actions">
      <button class="btn btn-ghost btn-sm" id="dPrint">${icon('doc')}Печать / PDF</button>
      <button class="btn btn-ghost btn-sm" id="dCsv">${icon('grid')}CSV раскроя</button>
      <button class="btn btn-ghost btn-sm" id="dDrill">${icon('tool')}CSV присадки</button>
      <button class="btn btn-ghost btn-sm" id="dDxf" title="Контуры деталей и отверстия для ЧПУ">${icon('grid')}DXF для ЧПУ</button>
      <button class="btn btn-ghost btn-sm" id="dJson">JSON</button>
      <button class="btn btn-ghost btn-sm" id="dCart" ${L.errors.length ? 'disabled' : ''}>${icon('bag')}В корзину</button>
      <button class="btn btn-primary btn-sm" id="dSend" ${L.errors.length ? 'disabled' : ''}>${icon('truck')}На производство</button>
    </div>
  </div></div>
  <div class="doc wrap">
    ${L.errors.length ? `<div class="issue err doc-err">${icon('close')}<span>В проекте есть ошибки: ${L.errors.map(esc).join('; ')}. Исправьте их в конструкторе перед отправкой.</span></div>` : ''}
    <section class="sheet-a4">
      <div class="doc-title"><div><div class="eyebrow">Проект для производства</div><h1>${esc(P.name)}</h1><p>${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм · ${L.secs.length} ${plural(L.secs.length, 'секция', 'секции', 'секций')} · проект ${no}</p></div><div class="doc-price"><span>Стоимость под ключ</span><b>${fmt(pr.total)}</b></div></div>
      <div class="doc-shots three" id="dShots"><div class="shot skeleton"></div><div class="shot skeleton"></div><div class="shot skeleton"></div></div>
      <div class="doc-cols">
        <div><h3>Параметры</h3><dl class="spec">
          <dt>Габариты (Ш × В × Г)</dt><dd>${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм</dd>
          <dt>Глубина с фасадами</dt><dd>${mm(L.depthTotal)} мм</dd>
          <dt>Установка</dt><dd>${P.install === 'niche' ? `в нишу ${mm(L.niche.minW)} × ${mm(L.niche.minH)} мм, доборы: ${{ none: 'нет', sides: 'по бокам', all: 'бока и верх' }[L.niche.fillers]}` : 'отдельностоящий'}</dd>
          <dt>Основание</dt><dd>${P.base === 'legs' ? 'опоры' : 'цоколь'}, ${P.baseH} мм</dd>
          <dt>Двери</dt><dd>${P.doors === 'sliding' ? `купе, ${L.sliding.n} шт. по ${mm(L.sliding.lw)} мм` : 'распашные, накладные' + (P.mezz ? `, антресоль ${P.mezz} мм` : '')}</dd>
          <dt>Ручки</dt><dd>${HANDLES[P.handle].name}${P.handle === 'push' ? '' : ', ' + HANDLE_METALS[P.metal].name.toLowerCase()}</dd>
          <dt>Деталей / листов / отверстий</dt><dd>${nParts} / ${sheetsTotal} / ${L.holesTotal}</dd>
          <dt>Масса изделия</dt><dd>≈ ${Math.round(mass.total)} кг</dd></dl></div>
        <div><h3>Материалы</h3><dl class="spec">
          <dt>Корпус</dt><dd>${mats.body.name}</dd><dt>Фасады</dt><dd>${mats.front.name}</dd><dt>Ящики</dt><dd>${mats.drawer.name}</dd><dt>Задняя стенка, дно ящиков</dt><dd>${mats.hdf.name}</dd>
          <dt>Кромка</dt><dd>ПВХ 2 мм — ${f1(ed.e2)} м; 0,4 мм — ${f1(ed.e04)} м</dd><dt>Нагрузка на полки</dt><dd>${LOADS[P.load].name}, ${LOADS[P.load].kgm2} кг/м²</dd></dl></div>
      </div>
      <h3>Секции</h3>
      <table class="tbl"><thead><tr><th>№</th><th>Ширина в свету, мм</th><th>Фасад</th><th>Наполнение сверху вниз, высоты в свету, мм</th></tr></thead><tbody>${secRows}</tbody></table>
      ${L.notes.length || L.warns.length ? `<h3>Примечания</h3><ul class="notes">${[...L.notes, ...L.warns].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${stamp('Общие данные')}
    </section>
    ${L.niche ? `<section class="sheet-a4"><h2 class="sheet-h">Замер ниши</h2><div class="draw-pair one"><figure>${nicheSVG(L)}<figcaption>Контур ниши по замерам и корпус ${mm(P.W)} × ${mm(P.H)} мм${L.niche.fillers !== 'none' ? ' с доборами' : ''}</figcaption></figure>
      <div><dl class="spec"><dt>Ширина вверху / в середине / внизу</dt><dd>${L.niche.w.join(' / ')} мм</dd><dt>Высота слева / в центре / справа</dt><dd>${L.niche.h.join(' / ')} мм</dd><dt>Глубина</dt><dd>${L.niche.d} мм</dd><dt>Перекос</dt><dd>${L.niche.skewW} мм по ширине, ${L.niche.skewH} мм по высоте</dd><dt>Плинтус</dt><dd>${L.niche.skirting.h ? `${L.niche.skirting.h} × ${L.niche.skirting.d} мм, вырез в боковинах` : 'нет'}</dd><dt>Доборы</dt><dd>${L.niche.fillers === 'none' ? `нет, зазор ${L.niche.gap} мм` : `${FILLER} мм + ${SCRIBE} мм на подгонку`}</dd></dl>
      <p class="fine">Корпус рассчитан по наименьшим замерам. Доборы изготавливаются с запасом и подрезаются по стене при монтаже.</p></div></div>${stamp('Замер ниши')}</section>` : ''}
    <section class="sheet-a4">
      <h2 class="sheet-h">Общий вид</h2>
      <div class="draw-pair"><figure>${frontSVG(L, { fronts: true })}<figcaption>Фасад</figcaption></figure><figure>${frontSVG(L, { fronts: false })}<figcaption>Вид без фасадов, высоты в свету</figcaption></figure></div>
      ${stamp('Общий вид')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Разрезы</h2>
      <div class="draw-row">${L.secs.map((Sx) => `<figure>${sideSVG(L, Sx.i)}</figure>`).join('')}</div>
      ${stamp('Разрезы')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Схема сборки</h2>
      <div class="assembly"><figure class="shot big" id="dExplode"><div class="skeleton" style="position:absolute;inset:0"></div></figure>
        <ol class="steps">${assemblySteps(L, rows).map(([t, d]) => `<li><b>${t}</b><span>${esc(d)}</span></li>`).join('')}</ol></div>
      ${stamp('Сборка')}
    </section>
    ${specPages.map((chunk, ci) => `<section class="sheet-a4">
      <h2 class="sheet-h">Спецификация деталей${specPages.length > 1 ? ` · ${ci + 1} из ${specPages.length}` : ''}</h2>
      <table class="tbl parts"><thead><tr><th>№</th><th>Деталь</th><th>Материал</th><th>Чистовой, мм</th><th>Пильный, мм</th><th>Толщ.</th><th>Кол.</th><th>Кромка</th><th>Отв.</th><th>Масса</th><th>Примечание</th></tr></thead>
      <tbody>${chunk.map((r) => `<tr><td>${r.no}</td><td>${esc(r.name)}</td><td>${esc(r.mat.name)}</td><td class="n">${r.len} × ${r.wid}</td><td class="n">${r.cut.len} × ${r.cut.wid}</td><td class="n">${r.t}</td><td class="n">${r.qty}</td><td>${edgeLabel(r.e)}</td><td class="n">${r.holes.length || '—'}</td><td class="n">${f1(r.kg * r.qty)}</td><td class="note-c">${esc(r.note)}${r.mat.grain ? (r.note ? '; ' : '') + 'текстура вдоль длины' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="fine">Чистовой размер — с кромкой; пильный — для распила, за вычетом кромки 2 мм. Длина — вдоль текстуры декора. Д — кромка по длинной стороне, Ш — по короткой. Масса — на все детали строки.</p>
      ${stamp('Спецификация')}
    </section>`).join('')}
    <section class="sheet-a4">
      <h2 class="sheet-h">Фурнитура и стоимость</h2>
      <div class="doc-cols">
        <div><h3>Фурнитура и крепёж</h3><table class="tbl"><thead><tr><th>Наименование</th><th>Кол.</th><th>Ед.</th></tr></thead><tbody>${L.hw.map((h) => `<tr><td>${esc(h.name)}</td><td class="n">${String(h.qty).replace('.', ',')}</td><td>${h.unit}</td></tr>`).join('')}</tbody></table></div>
        <div><h3>Стоимость</h3><dl class="spec cost">${Object.entries(groups).map(([g, ls]) => `<dt class="grp">${g}</dt><dd class="grp"></dd>${ls.map((l) => `<dt>${esc(l.name)}</dt><dd>${fmt(l.sum)}</dd>`).join('')}`).join('')}<dt class="tot">Итого</dt><dd class="tot">${fmt(pr.total)}</dd></dl>
        <p class="fine">Цены условные: это демонстрационный проект.</p></div>
      </div>
      ${stamp('Фурнитура')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Прочность и масса</h2>
      <div class="doc-cols">
        <div><h3>Прогиб полок</h3><table class="tbl"><thead><tr><th>Секция</th><th>Пролёт × глубина</th><th>Нагрузка</th><th>Прогиб / допуск</th></tr></thead><tbody>${[...new Map(L.shelves.map((q) => [q.sec, q])).values()].map((q) => `<tr><td>${q.sec + 1}</td><td>${mm(q.span)} × ${mm(q.depth)}</td><td class="n">${Math.round(q.load)} кг</td><td class="n ${q.ok ? '' : 'bad'}">${f1(q.sag)} / ${f1(q.limit)} мм</td></tr>`).join('') || '<tr><td colspan="4">Полок нет</td></tr>'}</tbody></table>
        <h3>Масса</h3><dl class="spec"><dt>Плитные детали</dt><dd>${f1(mass.panels)} кг</dd><dt>Стекло и зеркала</dt><dd>${f1(mass.extra)} кг</dd><dt>Фурнитура</dt><dd>${f1(mass.hw)} кг</dd><dt class="tot">Изделие</dt><dd class="tot">≈ ${Math.round(mass.total)} кг</dd></dl></div>
        <div><h3>Двери и петли</h3><table class="tbl"><thead><tr><th>Секция</th><th>Размер</th><th>Масса</th><th>Петли</th></tr></thead><tbody>${L.boxes.filter((b) => b.hingeSide).map((b) => `<tr><td>${b.sec + 1}${b.zone ? ' (верх)' : ''}</td><td>${mm(b.h)} × ${mm(b.w)}</td><td class="n">${f1(b.mass)} кг</td><td>${b.hinges.length} ${b.hingeSide === 'left' ? 'слева' : 'справа'}</td></tr>`).join('') || '<tr><td colspan="4">Распашных дверей нет</td></tr>'}</tbody></table></div>
      </div>
      <p class="fine">Прогиб считается для полки на двух опорах под равномерной нагрузкой с учётом ползучести ЛДСП (E = 1800 Н/мм²), допуск — 1/250 пролёта. Число петель — по высоте двери и не меньше одной петли на 6 кг.</p>
      ${stamp('Прочность')}
    </section>
    ${detailPages.map((list) => `<section class="sheet-a4"><h2 class="sheet-h">Деталировка и присадка</h2><div class="parts-grid">${list.map((r) => `
      <figure class="part-card"><figcaption><b>№ ${r.no} · ${esc(r.name)}</b><span>${r.len} × ${r.wid} × ${r.t} мм · ${r.qty} шт. · ${esc(r.mat.name)} · кромка ${edgeLabel(r.e)}</span></figcaption>${partSVG(r)}
      <table class="tbl mini"><tbody>${holeSummary(r).map((h) => `<tr><td>${esc(h.name)}</td><td>Ø${h.d}×${h.depth}</td><td>${h.face}</td><td class="n">${h.n}</td></tr>`).join('')}</tbody></table></figure>`).join('')}</div>
      <p class="fine">Вид на пласть A (внутреннюю у корпусных деталей, тыльную у фасадов). Сплошные круги — пласть A, пунктир — пласть B, залитые — сквозные. Прямоугольники у торцов — отверстия в торец. Цифры у кромок — толщина кромки. Координаты всех отверстий — в CSV присадки.</p>
      ${stamp('Деталировка')}</section>`).join('')}
    ${maps.map((g) => g.sheets.map((sh, i) => `<section class="sheet-a4"><h2 class="sheet-h">Карта раскроя</h2>${sheetSVG(sh, g.mat, i + 1, g.sheets.length)}
      <p class="fine">Размеры — пильные. Обрезка кромок листа ${SHEET.trim} мм, пропил ${SHEET.kerf} мм. Номера деталей — по спецификации.${g.mat.grain ? ' Стрелка — направление текстуры.' : ''}${g.over.length ? ` Не поместились на лист: № ${g.over.map((o) => o.no).join(', ')}.` : ''}</p>
      ${stamp('Раскрой', '1:20')}</section>`).join('')).join('')}
  </div>

  <div class="modal" id="sendModal" hidden><div class="modal-card">
    <button class="icon-btn modal-x" data-close aria-label="Закрыть">${icon('close')}</button>
    <div id="sendBody">
      <div class="eyebrow">Проект ${no}</div><h2>Отправить на производство</h2>
      <p class="muted">Производство получит чертежи, спецификацию, присадку и карты раскроя и свяжется для замера.</p>
      <form id="sendForm" class="form-grid" novalidate>
        <div class="field"><label for="sName">Имя</label><input class="input" id="sName" required autocomplete="name"></div>
        <div class="field"><label for="sPhone">Телефон</label><input class="input" id="sPhone" type="tel" required autocomplete="tel" placeholder="+7 900 000-00-00"></div>
        <div class="field wide"><label for="sNote">Комментарий</label><textarea class="input" id="sNote" placeholder="Нужен контрольный замер, удобное время звонка"></textarea></div>
        <button class="btn btn-primary btn-block wide" type="submit">${icon('truck')} Отправить проект</button>
        <div class="demo-note wide">${icon('shield')}<span>Демо: проект никуда не уходит и остаётся только в вашем браузере.</span></div>
      </form>
    </div>
  </div></div>`;

  // снимки модели — после того как страница нарисована
  requestAnimationFrame(() => setTimeout(() => {
    try {
      const s = renderShots(L);
      $('#dShots').innerHTML = s.slice(0, 2).map((u, i) => `<figure class="shot"><img src="${u}" alt=""><figcaption>${i ? 'Фасады открыты' : 'Общий вид'}</figcaption></figure>`).join('') + `<figure class="shot"><img src="${s[2]}" alt=""><figcaption>Разнесённый вид</figcaption></figure>`;
      $('#dExplode').innerHTML = `<img src="${s[2]}" alt="Разнесённый вид">`;
    } catch (e) { console.error(e); }
  }, 30));

  $('#dPrint').onclick = () => window.print();
  $('#dCsv').onclick = () => download(`${no}-raskroy.csv`, partsCSV(rows), 'text/csv;charset=utf-8');
  $('#dDrill').onclick = () => download(`${no}-prisadka.csv`, drillCSV(rows), 'text/csv;charset=utf-8');
  $('#dDxf').onclick = () => download(`${no}-cnc.dxf`, partsDXF(rows, { title: `${P.name} ${no}` }).text, 'application/dxf');
  $('#dJson').onclick = () => download(`${no}.json`, JSON.stringify(P, null, 2), 'application/json');
  $('#dCart').onclick = () => ctx.addCustom({ kind: 'cab', p: clone(P), price: pr.total, title: cabTitle(P), summary: cabSummary(P), no });
  const modal = $('#sendModal');
  $('#dSend').onclick = () => { modal.hidden = false; setTimeout(() => $('#sName').focus(), 30); };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });
  $('#sendForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('#sName'), ph = $('#sPhone');
    let ok = true;
    for (const i of [n, ph]) { const bad = !i.value.trim() || (i === ph && i.value.replace(/\D/g, '').length < 10); i.classList.toggle('bad', bad); if (bad && ok) { i.focus(); ok = false; } }
    if (!ok) return;
    const orders = Store.get('cabOrders', []);
    orders.push({ no, date, total: pr.total, name: P.name });
    Store.set('cabOrders', orders.slice(-20));
    $('#sendBody').innerHTML = `<div class="success" style="padding:20px 0 6px"><div class="ok">${icon('check')}</div><div class="eyebrow">Проект ${no}</div><h2>Передано на производство</h2>
      <p>Спасибо, ${esc(n.value.trim().split(' ')[0])}! В настоящем магазине технолог проверил бы чертежи и позвонил по номеру ${esc(ph.value)}. Это демо, поэтому проект остался у вас — его можно распечатать или скачать.</p>
      <button class="btn btn-primary" data-close style="margin-top:18px">Хорошо</button></div>`;
  });
  const onKey = (e) => { if (e.key === 'Escape') modal.hidden = true; };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
