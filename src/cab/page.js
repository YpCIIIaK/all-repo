/* ==========================================================================
   Ясень · Конструктор корпусной мебели: страницы конструктора и проекта
   ========================================================================== */

import * as THREE from 'three';
import { Viewer, Stage } from '../stage.js';
import { swatchURL } from '../materials.js';
import { fromTemplate, normalize, layout, TEMPLATES, DECORS, ENAMELS, HANDLES, HANDLE_METALS, CELL_KINDS, LIMITS, T, SHEET } from './model.js';
import { buildCabinet } from './build3d.js';
import { partsTable, nest, price, edgeTotals, edgeLabel, partsCSV, materialsOf } from './spec.js';
import { frontSVG, sideSVG, sheetSVG } from './drawings.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const mm = (v) => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ');

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

const swStyle = (kind, d, id) => {
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

  const ui = { step: Store.get('cabStep', 'model'), sec: 0, fronts: true, open: false, dims: false };
  const undo = [], redo = [];
  let L = layout(P);

  app.innerHTML = `
  <section class="cab" id="cabRoot">
    <div class="cab-stage">
      <div class="cab-view" id="cabView"></div>
      <div class="vbar">
        <div class="seg" id="cabViews"><button data-view="34" class="on">3/4</button><button data-view="front">Спереди</button><button data-view="side">Сбоку</button></div>
        <div class="seg icons">
          <button id="cUndo" title="Отменить (Ctrl+Z)" aria-label="Отменить">${icon('rotl')}</button>
          <button id="cRedo" title="Повторить (Ctrl+Y)" aria-label="Повторить">${icon('rotate')}</button>
        </div>
      </div>
      <div class="vfoot">
        <div class="seg">
          <button id="cOpen">${icon('drawer')}<span>Открыть</span></button>
          <button id="cFronts">${icon('eye')}<span>Без фасадов</span></button>
          <button id="cDims">${icon('ruler')}<span>Размеры</span></button>
        </div>
        <span class="vhint" id="cHint">Нажмите на секцию, чтобы изменить наполнение</span>
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
        <div><div class="muted" style="font-size:12.5px">Ориентировочно</div><b id="cPrice"></b></div>
        <a class="btn btn-primary" href="#/constructor/project" id="cProject">${icon('doc')} Проект</a>
      </div>
    </aside>
  </section>`;

  const viewer = new Viewer($('#cabView'), { autoRotate: false });
  viewer.onInteract = () => {};
  let model = null, first = true, raf = 0;

  const rebuild = () => {
    raf = 0;
    model = buildCabinet(L);
    viewer.setModel(model, { keepView: !first, view: '34', pad: 1.05 });
    first = false;
    model.userData.setFronts(ui.fronts);
    if (ui.open) { model.userData.open.set(1); viewer.openState = { t: 1, target: 1 }; }
    highlight();
    viewer.refresh();
  };
  const scheduleRebuild = () => { if (!raf) raf = requestAnimationFrame(rebuild); };

  function highlight() {
    if (!model) return;
    model.children.filter((c) => c.userData.hl).forEach((c) => { model.remove(c); c.geometry.dispose(); c.material.dispose(); });
    const pk = model.userData.pickers[ui.sec];
    if (!pk || ui.step !== 'fill') { viewer.dirty = true; viewer.kick(); return; }
    const geo = pk.geometry.clone();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2f4b3d', transparent: true, opacity: 0.1, depthWrite: false }));
    m.position.copy(pk.position);
    m.userData = { hl: true, noBounds: true, noContact: true };
    m.renderOrder = 3;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#2f4b3d', transparent: true, opacity: 0.8, depthTest: false }));
    e.userData = { hl: true, noBounds: true, noContact: true };
    e.position.copy(pk.position);
    e.renderOrder = 4;
    model.add(m, e);
    viewer.dirty = true; viewer.kick();
  }

  /* ---------- изменения проекта ---------- */
  const save = () => Store.set('cab', P);
  function commit(fn, { panel = true, history = true } = {}) {
    if (history) { undo.push(JSON.stringify(P)); if (undo.length > 80) undo.shift(); redo.length = 0; }
    fn(P);
    normalize(P);
    ui.sec = Math.min(ui.sec, P.sections.length - 1);
    L = layout(P);
    save();
    scheduleRebuild();
    summary();
    if (panel) renderStep();
  }
  function restore(json) { P = normalize(JSON.parse(json)); L = layout(P); save(); scheduleRebuild(); summary(); renderStep(); }
  $('#cUndo').onclick = () => { if (undo.length) { redo.push(JSON.stringify(P)); restore(undo.pop()); } };
  $('#cRedo').onclick = () => { if (redo.length) { undo.push(JSON.stringify(P)); restore(redo.pop()); } };

  function summary() {
    $('#cName').textContent = P.name;
    $('#cDimsLbl').textContent = `${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм · ${P.sections.length} ${P.sections.length === 1 ? 'секция' : P.sections.length < 5 ? 'секции' : 'секций'}`;
    const rows = partsTable(L), pr = price(L, rows);
    $('#cPrice').textContent = fmt(pr.total);
    const bad = L.errors.length;
    $('#cProject').classList.toggle('disabled', !!bad);
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
    body.innerHTML = ({ model: stepModel, size: stepSize, fill: stepFill, finish: stepFinish, order: stepOrder })[ui.step]();
    body.scrollTop = Math.min(body.scrollTop, body.scrollHeight);
    if (ui.step === 'model') for (const img of $$('img[data-tpl]', body)) {
      const id = img.dataset.tpl;
      thumbs.get('cab-tpl-' + id, () => buildCabinet(layout(fromTemplate(id))), 'card').then((u) => { if (u) { img.src = u; img.onload = () => img.classList.add('ready'); } });
    }
    highlight();
  }
  $('#cSteps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { ui.step = b.dataset.step; renderStep(); } });

  const num = (id, label, v, [a, b], step = 10, unit = 'мм') => `
    <div class="num-row"><label for="${id}">${label}</label>
      <div class="num"><button data-nudge="${id}" data-d="-${step}" aria-label="Меньше">${icon('minus')}</button><input id="${id}" type="number" inputmode="numeric" min="${a}" max="${b}" step="${step}" value="${Math.round(v)}"><span>${unit}</span><button data-nudge="${id}" data-d="${step}" aria-label="Больше">${icon('plus')}</button></div>
      <input type="range" data-for="${id}" min="${a}" max="${b}" step="${step}" value="${Math.round(v)}"><small>${mm(a)}–${mm(b)}</small></div>`;

  function stepModel() {
    return `<p class="cab-lead">Выберите основу — дальше её можно изменить как угодно: размеры, секции, полки, ящики и отделку.</p>
      <div class="tpl-grid">${Object.entries(TEMPLATES).map(([id, t]) => `
        <button class="tpl ${P.tpl === id ? 'on' : ''}" data-tpl-pick="${id}"><div class="im"><img data-tpl="${id}" alt=""></div><b>${t.name}</b><span>${t.desc}</span><small>${mm(t.p.W)} × ${mm(t.p.H)} × ${mm(t.p.D)}</small></button>`).join('')}
      </div>`;
  }

  function stepSize() {
    const avail = P.W - 2 * T - (P.sections.length - 1) * T;
    return `${num('fW', 'Ширина', P.W, LIMITS.W)}${num('fH', 'Высота', P.H, LIMITS.H)}${num('fD', 'Глубина корпуса', P.D, LIMITS.D)}
      <div class="opt"><div class="opt-head"><b>Основание</b><span>${P.base === 'legs' ? 'опоры' : 'цоколь'} ${P.baseH} мм</span></div>
        <div class="pills"><button class="pill ${P.base === 'plinth' ? 'on' : ''}" data-set="base" data-v="plinth">Цоколь</button><button class="pill ${P.base === 'legs' ? 'on' : ''}" data-set="base" data-v="legs">Ножки</button>
        ${(P.base === 'legs' ? [100, 120, 150] : [60, 80, 100]).map((h) => `<button class="pill ${P.baseH === h ? 'on' : ''}" data-set="baseH" data-v="${h}">${h} мм</button>`).join('')}</div></div>
      <div class="opt"><div class="opt-head"><b>Двери</b><span>${P.doors === 'sliding' ? 'купе' : 'распашные или без дверей'}</span></div>
        <div class="pills"><button class="pill ${P.doors === 'hinged' ? 'on' : ''}" data-set="doors" data-v="hinged">Распашные</button><button class="pill ${P.doors === 'sliding' ? 'on' : ''}" data-set="doors" data-v="sliding">Купе</button></div>
        ${P.doors === 'hinged' ? '<p class="note">Тип фасада для каждой секции — дверь, стекло или открытая — выбирается на шаге «Наполнение».</p>' : `<p class="note">${L.sliding ? `${L.sliding.n} двери по ${mm(L.sliding.lw)} мм. ` : ''}Ящики за дверями-купе становятся внутренними.</p>`}</div>
      <div class="opt"><div class="opt-head"><b>Секции</b><span>внутри ${mm(avail)} мм</span></div>
        <div class="sec-count"><button class="icon-btn" data-sec="-1" aria-label="Меньше секций">${icon('minus')}</button><b>${P.sections.length}</b><button class="icon-btn" data-sec="1" aria-label="Больше секций">${icon('plus')}</button>
        <button class="chip" data-even>Поровну</button></div>
        <div class="sec-widths">${P.sections.map((s, i) => `<label class="sw-in"><span>${i + 1}</span><input type="number" data-secw="${i}" value="${Math.round(L.secW[i])}" ${s.w === 'auto' ? 'class="auto"' : ''}><button class="mini ${s.w === 'auto' ? 'on' : ''}" data-secauto="${i}">авто</button></label>`).join('')}</div>
        <p class="note">Ширины указаны в свету, между боковинами и перегородками (ЛДСП ${T} мм).</p></div>`;
  }

  function cellsHTML(S, s) {
    const rows = s.cells.map((c, j) => ({ c, j, C: S?.cells[j] })).reverse();
    return rows.map(({ c, j, C }) => `
      <div class="cell-row k-${c.k}" data-j="${j}">
        <span class="cell-ico">${icon(c.k === 'drawer' ? 'drawer' : c.k === 'rail' ? 'hanger' : 'shelf')}</span>
        <select data-cell="kind" aria-label="Тип">${Object.entries(CELL_KINDS).map(([k, v]) => `<option value="${k}" ${k === c.k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        <div class="cell-h"><input type="number" data-cell="h" value="${c.h === 'auto' ? '' : c.h}" placeholder="${C ? Math.round(C.h) : ''}" aria-label="Высота в свету, мм"><button class="mini ${c.h === 'auto' ? 'on' : ''}" data-cell="auto">авто</button></div>
        <div class="cell-tools">
          <button data-cell="up" title="Выше" ${j === s.cells.length - 1 ? 'disabled' : ''}>↑</button><button data-cell="down" title="Ниже" ${j === 0 ? 'disabled' : ''}>↓</button><button data-cell="del" title="Удалить" ${s.cells.length === 1 ? 'disabled' : ''}>${icon('close')}</button>
        </div>
      </div>`).join('');
  }

  function stepFill() {
    const s = P.sections[ui.sec], S = L.secs[ui.sec];
    const doorW = S ? (ui.sec === 0 || ui.sec === P.sections.length - 1 ? S.cw + T * 1.5 : S.cw + T) : 0;
    return `<div class="sec-tabs">${P.sections.map((x, i) => `<button class="chip ${i === ui.sec ? 'on' : ''}" data-pick="${i}">Секция ${i + 1}<span class="n">${Math.round(L.secW[i])}</span></button>`).join('')}</div>
      ${P.doors === 'hinged' ? `<div class="opt"><div class="opt-head"><b>Фасад секции</b><span>${s.front === 'open' ? 'без двери' : doorW > 600 ? '2 створки' : '1 створка'}</span></div>
        <div class="pills">${[['door', 'Дверь'], ['glass', 'Стекло'], ['open', 'Открытая']].map(([v, n]) => `<button class="pill ${s.front === v ? 'on' : ''}" data-front="${v}">${n}</button>`).join('')}</div>
        ${s.front !== 'open' && doorW <= 600 ? `<div class="pills" style="margin-top:8px">${[['auto', 'Петли: авто'], ['left', 'Слева'], ['right', 'Справа']].map(([v, n]) => `<button class="pill sm ${s.hinge === v ? 'on' : ''}" data-hinge="${v}">${n}</button>`).join('')}</div>` : ''}</div>` : ''}
      <div class="opt"><div class="opt-head"><b>Наполнение</b><span>сверху вниз, высоты в свету</span></div>
        <div class="presets">
          <button class="chip" data-preset="shelves">Только полки</button><button class="chip" data-preset="hang">Штанга</button><button class="chip" data-preset="mixed">Ящики и полки</button><button class="chip" data-preset="drawers">Только ящики</button>
        </div>
        <div class="cells">${cellsHTML(S, s)}</div>
        <div class="cell-add"><button class="btn btn-ghost btn-sm" data-add="box">${icon('plus')}Полка</button><button class="btn btn-ghost btn-sm" data-add="drawer">${icon('plus')}Ящик</button><button class="btn btn-ghost btn-sm" data-add="rail">${icon('plus')}Штанга</button></div>
        <p class="note">Между ячейками ставится полка ${T} мм, между соседними ящиками — нет. Ящики внизу секции с дверью получают свои накладные фасады.</p>
      </div>
      ${issues()}`;
  }

  function stepFinish() {
    const sw = (set, kind, cur, attr) => `<div class="sw-row">${Object.entries(set).map(([id, d]) => `<button class="sw ${cur === id ? 'on' : ''}" style="${swStyle(kind, d, id)}" ${attr}="${id}" title="${esc(d.name)}" aria-label="${esc(d.name)}"></button>`).join('')}</div>`;
    const fk = P.front.kind;
    return `<div class="opt"><div class="opt-head"><b>Корпус · ЛДСП ${T} мм</b><span>${DECORS[P.body].name}</span></div>${sw(DECORS, 'decor', P.body, 'data-body')}</div>
      <div class="opt"><div class="opt-head"><b>Фасады</b><span>${fk === 'enamel' ? 'МДФ эмаль · ' + ENAMELS[P.front.id].name : 'ЛДСП · ' + DECORS[P.front.id].name}</span></div>
        <div class="pills" style="margin-bottom:12px"><button class="pill sm ${fk === 'decor' ? 'on' : ''}" data-fkind="decor">ЛДСП в кромке</button><button class="pill sm ${fk === 'enamel' ? 'on' : ''}" data-fkind="enamel">МДФ в эмали</button></div>
        ${fk === 'enamel' ? sw(ENAMELS, 'enamel', P.front.id, 'data-front-id') : sw(DECORS, 'decor', P.front.id, 'data-front-id')}</div>
      <div class="opt"><div class="opt-head"><b>Ручки</b><span>${HANDLES[P.handle].name}</span></div>
        <div class="pills">${Object.entries(HANDLES).map(([id, h]) => `<button class="pill sm ${P.handle === id ? 'on' : ''}" data-handle="${id}">${h.name}</button>`).join('')}</div>
        ${P.handle !== 'push' ? `<div style="margin-top:12px">${sw(HANDLE_METALS, 'metal', P.metal, 'data-metal')}</div>` : ''}</div>
      <div class="opt"><div class="opt-head"><b>Кромка</b><span>ПВХ в цвет декора</span></div><p class="note" style="margin:0">2 мм на видимых торцах корпуса и по периметру фасадов из ЛДСП, 0,4 мм на скрытых торцах ящиков. Эмалированные фасады кромки не требуют.</p></div>`;
  }

  function issues() {
    if (!L.errors.length && !L.warns.length) return '<div class="issue ok">' + icon('check') + '<span>Конструкция в порядке: всё помещается, нагрузки в норме.</span></div>';
    return [...L.errors.map((t) => `<div class="issue err">${icon('close')}<span>${esc(t)}</span></div>`), ...L.warns.map((t) => `<div class="issue">${icon('bulb')}<span>${esc(t)}</span></div>`)].join('');
  }

  function stepOrder() {
    const rows = partsTable(L), maps = nest(rows), pr = price(L, rows, maps), ed = edgeTotals(rows);
    const nParts = rows.reduce((a, r) => a + r.qty, 0);
    const area = rows.reduce((a, r) => a + (r.len * r.wid * r.qty) / 1e6, 0);
    return `${issues()}
      <div class="kpis">
        <div><b>${nParts}</b><span>деталей</span></div><div><b>${pr.sheets}</b><span>${pr.sheets === 1 ? 'лист' : pr.sheets < 5 ? 'листа' : 'листов'} плиты</span></div>
        <div><b>${area.toFixed(1).replace('.', ',')}</b><span>м² панелей</span></div><div><b>${Math.round(ed.e2 + ed.e04)}</b><span>м кромки</span></div>
      </div>
      <div class="opt"><div class="opt-head"><b>Стоимость</b><span>ориентировочно</span></div>
        <dl class="spec cost">${pr.lines.map((l) => `<dt>${esc(l.name)}</dt><dd>${fmt(l.sum)}</dd>`).join('')}<dt class="tot">Итого</dt><dd class="tot">${fmt(pr.total)}</dd></dl></div>
      <div class="opt"><div class="opt-head"><b>Что получит производство</b></div>
        <ul class="deliver"><li>${icon('doc')}Чертежи: фасад, вид без фасадов, разрезы с размерами</li><li>${icon('grid')}Спецификация деталей с кромкой и присадкой под петли</li><li>${icon('tool')}Список фурнитуры и крепежа</li><li>${icon('cube')}Карты раскроя листов ${SHEET.L}×${SHEET.W} мм и CSV для станка</li></ul>
        <a class="btn btn-primary btn-block ${L.errors.length ? 'disabled' : ''}" href="#/constructor/project">${icon('doc')} Открыть проект для производства</a>
        <div class="row-btns"><button class="btn btn-ghost btn-sm" data-share>${icon('copy')}Ссылка на проект</button><button class="btn btn-ghost btn-sm" data-json>Скачать JSON</button><label class="btn btn-ghost btn-sm">Загрузить<input type="file" accept=".json,application/json" data-import hidden></label></div>
      </div>`;
  }

  /* ---------- обработчики панели ---------- */
  const setDim = (id, v) => {
    const key = { fW: 'W', fH: 'H', fD: 'D' }[id];
    commit((p) => { p[key] = +v; }, { panel: false });
    const inp = $('#' + id), rg = $(`[data-for="${id}"]`);
    if (inp && document.activeElement !== inp) inp.value = P[key];
    if (rg) rg.value = P[key];
  };
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[type=range][data-for]')) { $('#' + t.dataset.for).value = t.value; setDim(t.dataset.for, t.value); }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('#fW, #fH, #fD')) { setDim(t.id, t.value); renderStep(); }
    else if (t.matches('[data-secw]')) commit((p) => { p.sections[+t.dataset.secw].w = Math.max(LIMITS.secW, +t.value || LIMITS.secW); });
    else if (t.matches('[data-cell="kind"]')) {
      const j = +t.closest('[data-j]').dataset.j;
      commit((p) => { const c = p.sections[ui.sec].cells[j]; c.k = t.value; if (t.value === 'drawer' && c.h === 'auto') c.h = 180; });
    } else if (t.matches('[data-cell="h"]')) {
      const j = +t.closest('[data-j]').dataset.j;
      commit((p) => { p.sections[ui.sec].cells[j].h = +t.value > 0 ? +t.value : 'auto'; });
    } else if (t.matches('[data-import]')) {
      const f = t.files[0];
      if (f) f.text().then((txt) => { try { const np = normalize(JSON.parse(txt)); commit((p) => Object.assign(p, np)); toast('Проект загружен'); } catch { toast('Не удалось прочитать файл'); } });
    }
  });
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a, label');
    if (!t) return;
    const d = t.dataset;
    if (d.tplPick) {
      const prev = JSON.stringify(P);
      commit((p) => {
        const keep = { body: p.body, front: p.front, handle: p.handle, metal: p.metal }, n = fromTemplate(d.tplPick);
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, n, keep);
      });
      ui.sec = 0;
      toast(`Шаблон «${TEMPLATES[d.tplPick].name}»`, { text: 'Вернуть', onClick: () => restore(prev) });
      first = true; scheduleRebuild();
    } else if (d.nudge) { const inp = $('#' + d.nudge); setDim(d.nudge, +inp.value + +d.d); inp.value = P[{ fW: 'W', fH: 'H', fD: 'D' }[d.nudge]]; }
    else if (d.set) commit((p) => { p[d.set] = d.set === 'baseH' ? +d.v : d.v; if (d.set === 'base') p.baseH = d.v === 'legs' ? 120 : 80; });
    else if (d.sec) commit((p) => {
      if (+d.sec > 0 && p.sections.length < LIMITS.sections[1]) { p.sections.push(clone(p.sections[p.sections.length - 1])); p.sections[p.sections.length - 1].w = 'auto'; }
      if (+d.sec < 0 && p.sections.length > 1) p.sections.pop();
    });
    else if ('even' in d) commit((p) => { for (const s of p.sections) s.w = 'auto'; });
    else if (d.secauto !== undefined) commit((p) => { const s = p.sections[+d.secauto]; s.w = s.w === 'auto' ? Math.round(L.secW[+d.secauto]) : 'auto'; });
    else if (d.pick !== undefined) { ui.sec = +d.pick; renderStep(); }
    else if (d.front) commit((p) => { p.sections[ui.sec].front = d.front; });
    else if (d.hinge) commit((p) => { p.sections[ui.sec].hinge = d.hinge; });
    else if (d.preset) commit((p) => { p.sections[ui.sec].cells = preset(d.preset); });
    else if (d.add) commit((p) => {
      const cs = p.sections[ui.sec].cells;
      if (d.add === 'drawer') { let k = 0; while (k < cs.length && cs[k].k === 'drawer') k++; cs.splice(k, 0, { k: 'drawer', h: 180 }); }
      else if (d.add === 'rail') cs.splice(Math.max(0, cs.length - 1), 0, { k: 'rail', h: 'auto' });
      else cs.push({ k: 'box', h: 'auto' });
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
    else if (d.handle) commit((p) => { p.handle = d.handle; });
    else if (d.metal) commit((p) => { p.metal = d.metal; });
    else if ('share' in d) {
      const url = location.href.split('#')[0] + '#/constructor?p=' + (await encodeProject(P));
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast('Скопируйте ссылку из адресной строки'); history.replaceState(null, '', url.slice(url.indexOf('#'))); }
    } else if ('json' in d) download(`${projectNo(P)}.json`, JSON.stringify(P, null, 2), 'application/json');
  });

  function preset(kind) {
    const S = L.secs[ui.sec], Hin = S ? S.cells.reduce((a, c) => a + c.h, 0) + (S.cells.length - 1) * T : P.H - P.baseH - 2 * T;
    const n = (step) => Math.max(1, Math.min(8, Math.round(Hin / step)));
    if (kind === 'shelves') return Array.from({ length: n(360) }, () => ({ k: 'box', h: 'auto' }));
    if (kind === 'drawers') return Array.from({ length: Math.min(6, n(200)) }, () => ({ k: 'drawer', h: 'auto' }));
    if (kind === 'hang') return Hin > 1500 ? [{ k: 'box', h: 320 }, { k: 'rail', h: 'auto' }, { k: 'box', h: 380 }] : [{ k: 'rail', h: 'auto' }, { k: 'box', h: Math.max(150, Math.round(Hin * 0.2)) }];
    const dr = Hin > 900 ? 3 : Hin > 500 ? 2 : 1;
    const boxes = Math.max(1, Math.round((Hin - dr * 180) / 380));
    return [...Array.from({ length: dr }, () => ({ k: 'drawer', h: Hin > 900 ? 180 : 'auto' })), ...Array.from({ length: boxes }, () => ({ k: 'box', h: 'auto' }))];
  }

  /* ---------- 3D: выбор секции, вид ---------- */
  let down = null;
  viewer.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  viewer.canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !model) return;
    const r = viewer.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), viewer.camera);
    const hit = ray.intersectObjects(model.userData.pickers, false)[0];
    if (hit) { ui.sec = hit.object.userData.sec; ui.step = 'fill'; renderStep(); $('#cHint').textContent = `Секция ${ui.sec + 1}: настройте наполнение справа`; }
  });
  $('#cabViews').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    $$('#cabViews button').forEach((x) => x.classList.toggle('on', x === b));
    viewer.goTo(b.dataset.view);
  });
  $('#cOpen').onclick = (e) => { ui.open = viewer.toggleOpen(); e.currentTarget.classList.toggle('on', ui.open); $('span', e.currentTarget).textContent = ui.open ? 'Закрыть' : 'Открыть'; };
  $('#cFronts').onclick = (e) => { ui.fronts = !ui.fronts; model?.userData.setFronts(ui.fronts); viewer.dirty = true; viewer.kick(); e.currentTarget.classList.toggle('on', !ui.fronts); };
  $('#cDims').onclick = (e) => { ui.dims = !ui.dims; viewer.showDims(ui.dims); e.currentTarget.classList.toggle('on', ui.dims); };

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
  return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); viewer.dispose(); };
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
    st.setModel(m);
    st.applyView(st.viewFor('34', 1.05)); st.render(); shots.push(c.toDataURL('image/jpeg', 0.9));
    m.userData.open.set(1); st.measure(); st.updateShadow();
    st.applyView(st.viewFor('34', 1.05)); st.render(); shots.push(c.toDataURL('image/jpeg', 0.9));
  } finally { st.dispose(); }
  return shots;
}

export function mountProject(app, ctx) {
  const { toast, icon, esc, fmt, Store } = ctx;
  const saved = Store.get('cab', null);
  const P = normalize(saved || fromTemplate('wardrobe'));
  const L = layout(P), rows = partsTable(L), maps = nest(rows), pr = price(L, rows, maps), ed = edgeTotals(rows), mats = materialsOf(P);
  const no = projectNo(P), date = new Date().toLocaleDateString('ru-RU');
  const sheetsTotal = maps.reduce((a, g) => a + g.sheets.length, 0);
  const pages = 5 + sheetsTotal;
  let page = 0;
  const stamp = (title, scale = 'б/м') => { page++; return `<footer class="stamp"><div><b>Ясень · конструктор</b><span>Проект ${no} · ${esc(P.name)}</span></div><div><span>Лист</span><b>${esc(title)}</b></div><div><span>Масштаб</span><b>${scale}</b></div><div><span>Дата</span><b>${date}</b></div><div><span>Лист</span><b>${page} / ${pages}</b></div></footer>`; };
  const hingeSide = (s) => s === 'left' ? 'слева' : 'справа';

  const secRows = L.secs.map((S) => `<tr><td>${S.i + 1}</td><td>${mm(S.cw)}</td><td>${P.doors === 'sliding' ? 'купе' : { door: 'дверь', glass: 'стекло', open: 'открытая' }[S.s.front]}</td><td>${[...S.cells].reverse().map((C) => `${CELL_KINDS[C.k].short} ${mm(C.h)}`).join(' · ')}</td></tr>`).join('');

  app.innerHTML = `
  <div class="doc-bar"><div class="wrap doc-bar-row">
    <a class="link-arrow back" href="#/constructor">${icon('arrow')} В конструктор</a>
    <div class="doc-actions">
      <button class="btn btn-ghost btn-sm" id="dPrint">${icon('doc')}Печать / PDF</button>
      <button class="btn btn-ghost btn-sm" id="dCsv">${icon('grid')}CSV для раскроя</button>
      <button class="btn btn-ghost btn-sm" id="dJson">JSON</button>
      <button class="btn btn-primary btn-sm" id="dSend" ${L.errors.length ? 'disabled' : ''}>${icon('truck')}Отправить на производство</button>
    </div>
  </div></div>
  <div class="doc wrap">
    ${L.errors.length ? `<div class="issue err doc-err">${icon('close')}<span>В проекте есть ошибки: ${L.errors.map(esc).join('; ')}. Исправьте их в конструкторе перед отправкой.</span></div>` : ''}
    <section class="sheet-a4">
      <div class="doc-title"><div><div class="eyebrow">Проект для производства</div><h1>${esc(P.name)}</h1><p>${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм · ${L.secs.length} ${L.secs.length === 1 ? 'секция' : 'секции'} · проект ${no}</p></div><div class="doc-price"><span>Ориентировочная стоимость</span><b>${fmt(pr.total)}</b></div></div>
      <div class="doc-shots" id="dShots"><div class="shot skeleton"></div><div class="shot skeleton"></div></div>
      <div class="doc-cols">
        <div><h3>Параметры</h3><dl class="spec">
          <dt>Габариты (Ш × В × Г)</dt><dd>${mm(P.W)} × ${mm(P.H)} × ${mm(P.D)} мм</dd>
          <dt>Глубина с фасадами</dt><dd>${mm(L.depthTotal)} мм</dd>
          <dt>Основание</dt><dd>${P.base === 'legs' ? 'опоры' : 'цоколь'}, ${P.baseH} мм</dd>
          <dt>Двери</dt><dd>${P.doors === 'sliding' ? `купе, ${L.sliding.n} шт. по ${mm(L.sliding.lw)} мм` : 'распашные, накладные'}</dd>
          <dt>Ручки</dt><dd>${HANDLES[P.handle].name}${P.handle === 'push' ? '' : ', ' + HANDLE_METALS[P.metal].name.toLowerCase()}</dd>
          <dt>Деталей / листов</dt><dd>${rows.reduce((a, r) => a + r.qty, 0)} / ${sheetsTotal}</dd></dl></div>
        <div><h3>Материалы</h3><dl class="spec">
          <dt>Корпус</dt><dd>${mats.body.name}</dd><dt>Фасады</dt><dd>${mats.front.name}</dd><dt>Ящики</dt><dd>${mats.drawer.name}</dd><dt>Задняя стенка, дно ящиков</dt><dd>${mats.hdf.name}</dd>
          <dt>Кромка</dt><dd>ПВХ 2 мм — ${ed.e2.toFixed(1).replace('.', ',')} м; 0,4 мм — ${ed.e04.toFixed(1).replace('.', ',')} м</dd></dl></div>
      </div>
      <h3>Секции</h3>
      <table class="tbl"><thead><tr><th>№</th><th>Ширина в свету, мм</th><th>Фасад</th><th>Наполнение сверху вниз, высоты в свету, мм</th></tr></thead><tbody>${secRows}</tbody></table>
      ${L.notes.length || L.warns.length ? `<h3>Примечания</h3><ul class="notes">${[...L.notes, ...L.warns].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${stamp('Общие данные')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Общий вид</h2>
      <div class="draw-pair"><figure>${frontSVG(L, { fronts: true })}<figcaption>Фасад</figcaption></figure><figure>${frontSVG(L, { fronts: false })}<figcaption>Вид без фасадов, высоты в свету</figcaption></figure></div>
      ${stamp('Общий вид')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Разрезы</h2>
      <div class="draw-row">${L.secs.map((S) => `<figure>${sideSVG(L, S.i)}</figure>`).join('')}</div>
      ${stamp('Разрезы')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Спецификация деталей</h2>
      <table class="tbl parts"><thead><tr><th>№</th><th>Деталь</th><th>Материал</th><th>Длина</th><th>Ширина</th><th>Толщ.</th><th>Кол.</th><th>Кромка</th><th>Примечание</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.no}</td><td>${esc(r.name)}</td><td>${esc(r.mat.name)}</td><td class="n">${r.len}</td><td class="n">${r.wid}</td><td class="n">${r.t}</td><td class="n">${r.qty}</td><td>${edgeLabel(r.e)}</td><td class="note-c">${esc(r.note)}${r.mat.grain ? (r.note ? '; ' : '') + 'текстура вдоль длины' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="fine">Размеры — чистовые, с учётом кромки, в миллиметрах. Длина — вдоль текстуры декора. Д — кромка по длинной стороне, Ш — по короткой. Присадка под петли: чашка Ø35 мм, 22 мм от края фасада.</p>
      ${stamp('Спецификация')}
    </section>
    <section class="sheet-a4">
      <h2 class="sheet-h">Фурнитура и стоимость</h2>
      <div class="doc-cols">
        <div><h3>Фурнитура и крепёж</h3><table class="tbl"><thead><tr><th>Наименование</th><th>Кол.</th><th>Ед.</th></tr></thead><tbody>${L.hw.map((h) => `<tr><td>${esc(h.name)}</td><td class="n">${String(h.qty).replace('.', ',')}</td><td>${h.unit}</td></tr>`).join('')}</tbody></table></div>
        <div><h3>Расчёт стоимости</h3><dl class="spec cost">${pr.lines.map((l) => `<dt>${esc(l.name)}</dt><dd>${fmt(l.sum)}</dd>`).join('')}<dt class="tot">Итого</dt><dd class="tot">${fmt(pr.total)}</dd></dl>
        <p class="fine">Цены условные: это демонстрационный проект.</p>
        <h3>Двери и петли</h3><table class="tbl"><thead><tr><th>Секция</th><th>Размер</th><th>Петли</th></tr></thead><tbody>${L.boxes.filter((b) => b.hingeSide).map((b) => `<tr><td>${+b.grp.split(':')[1] + 1}</td><td>${mm(b.h)} × ${mm(b.w)}</td><td>${hingeSide(b.hingeSide)}${b.role === 'glass' ? ', алюм. профиль' : ''}</td></tr>`).join('') || '<tr><td colspan="3">Распашных дверей нет</td></tr>'}</tbody></table></div>
      </div>
      ${stamp('Фурнитура')}
    </section>
    ${maps.map((g) => g.sheets.map((sh, i) => `<section class="sheet-a4"><h2 class="sheet-h">Карта раскроя</h2>${sheetSVG(sh, g.mat, i + 1, g.sheets.length)}
      <p class="fine">Обрезка кромок листа ${SHEET.trim} мм, пропил ${SHEET.kerf} мм. Номера деталей — по спецификации.${g.mat.grain ? ' Стрелка — направление текстуры.' : ''}${g.over.length ? ` Не поместились на лист: № ${g.over.map((o) => o.no).join(', ')}.` : ''}</p>
      ${stamp('Раскрой', '1:20')}</section>`).join('')).join('')}
  </div>

  <div class="modal" id="sendModal" hidden><div class="modal-card">
    <button class="icon-btn modal-x" data-close aria-label="Закрыть">${icon('close')}</button>
    <div id="sendBody">
      <div class="eyebrow">Проект ${no}</div><h2>Отправить на производство</h2>
      <p class="muted">Производство получит чертежи, спецификацию, карты раскроя и свяжется для замера.</p>
      <form id="sendForm" class="form-grid" novalidate>
        <div class="field"><label for="sName">Имя</label><input class="input" id="sName" required autocomplete="name"></div>
        <div class="field"><label for="sPhone">Телефон</label><input class="input" id="sPhone" type="tel" required autocomplete="tel" placeholder="+7 900 000-00-00"></div>
        <div class="field wide"><label for="sNote">Комментарий</label><textarea class="input" id="sNote" placeholder="Нужен замер, ниша с неровными стенами, удобное время звонка"></textarea></div>
        <button class="btn btn-primary btn-block wide" type="submit">${icon('truck')} Отправить проект</button>
        <div class="demo-note wide">${icon('shield')}<span>Демо: проект никуда не уходит и остаётся только в вашем браузере.</span></div>
      </form>
    </div>
  </div></div>`;

  // снимки модели — после того как страница нарисована
  requestAnimationFrame(() => setTimeout(() => {
    try { const s = renderShots(L); $('#dShots').innerHTML = s.map((u, i) => `<figure class="shot"><img src="${u}" alt=""><figcaption>${i ? 'Фасады открыты' : 'Общий вид'}</figcaption></figure>`).join(''); } catch (e) { console.error(e); }
  }, 30));

  $('#dPrint').onclick = () => window.print();
  $('#dCsv').onclick = () => download(`${no}-raskroy.csv`, partsCSV(rows), 'text/csv;charset=utf-8');
  $('#dJson').onclick = () => download(`${no}.json`, JSON.stringify(P, null, 2), 'application/json');
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
