/* ==========================================================================
   Ясень · приложение: маршруты, страницы, корзина, избранное
   ========================================================================== */

import * as THREE from 'three';
import {
  PRODUCTS, CATEGORIES, byId, buildModel, normalizeCfg, priceOf, oldPriceOf, priceRange, cfgKey, cfgSummary,
  optionValues, swatchesOf, relatedTo, fmt,
} from './catalog.js';
import { FABRICS, FABRIC_TYPES, WOODS, STONES, METALS, FLOORS, WALLS, swatchURL } from './materials.js';
import { Viewer, thumbs } from './stage.js';
import { disposeObject } from './models.js';

/* ------------------------------ мелочи ------------------------------ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || 'Каталог';
const coarse = matchMedia('(pointer: coarse)').matches;

const Store = {
  get(k, d) { try { const v = localStorage.getItem('yasen.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('yasen.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

const state = {
  cart: Store.get('cart', []).filter((l) => byId[l.id]),
  favs: new Set(Store.get('favs', []).filter((id) => byId[id])),
  planner: Store.get('planner', null),
  pendingAdd: null,
  pendingScroll: null,
};

/* ------------------------------ образцы отделки ------------------------------ */

const KIND_OF = { fabric: 'fabric', wood: 'wood', metal: 'metal', stone: 'stone', ceramic: 'ceramic', rug: 'rug' };

function swatchStyle(kind, v) {
  let st = `--c:${v.hex}`;
  if (kind === 'wood' || kind === 'stone' || kind === 'rug') {
    const url = swatchURL(kind, v.id);
    if (url) st += kind === 'wood'
      ? `;background:url(${url}) center/cover, ${v.hex};background-blend-mode:multiply`
      : `;background:url(${url}) center/cover`;
  }
  if (kind === 'metal') st += `;background:linear-gradient(135deg, color-mix(in srgb, ${v.hex} 55%, #fff) 0%, ${v.hex} 45%, color-mix(in srgb, ${v.hex} 70%, #000) 100%)`;
  return st;
}
const swCls = (kind, v) => `sw t-${v.type || kind}`;

/* ------------------------------ миниатюры ------------------------------ */

function thumbImg(p, cfg, view = 'card', cls = 'main', extra = '') {
  return `<img class="${cls}" data-thumb data-pid="${p.id}" data-cfg="${esc(JSON.stringify(normalizeCfg(p, cfg)))}" data-view="${view}" alt="${esc(p.kind + ' «' + p.name + '»')}" ${extra}>`;
}

function loadThumb(img) {
  if (img.dataset.loading) return;
  img.dataset.loading = '1';
  const p = byId[img.dataset.pid];
  const cfg = JSON.parse(img.dataset.cfg || '{}');
  thumbs.get(cfgKey(p, cfg), () => buildModel(p, cfg), img.dataset.view, !!img.dataset.priority).then((url) => {
    if (!url) return;
    img.onload = () => { img.classList.add('ready'); img.closest('.skeleton')?.classList.remove('skeleton'); };
    img.src = url;
  });
}

const thumbIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { thumbIO.unobserve(e.target); loadThumb(e.target); }
}, { rootMargin: '400px 0px' });

const revealIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
}, { rootMargin: '0px 0px -40px 0px' });

function hydrate(root) {
  for (const img of $$('img[data-thumb]:not([data-lazy])', root)) thumbIO.observe(img);
  $$('.reveal', root).forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`; revealIO.observe(el); });
}

/* ------------------------------ карточка ------------------------------ */

function card(p) {
  const cfg = normalizeCfg(p, p.defaults);
  const [lo, hi] = priceRange(p), old = oldPriceOf(p, cfg), price = priceOf(p, cfg);
  const sws = swatchesOf(p), kind = p.opts.find((o) => KIND_OF[o.key] && optionValues(o)[0].hex)?.key;
  const badge = old ? `<span class="badge sale">−${Math.round((1 - price / old) * 100)}%</span>`
    : p.badge === 'new' ? '<span class="badge new">Новинка</span>' : p.badge === 'hit' ? '<span class="badge">Хит</span>' : '';
  return `<article class="card reveal" data-card="${p.id}">
    <a class="card-media skeleton" href="#/p/${p.id}" aria-label="${esc(p.kind + ' ' + p.name)}">
      ${badge}${thumbImg(p, cfg, 'card', 'main has-alt')}${thumbImg(p, cfg, 'card2', 'alt', 'data-lazy')}
      <span class="badge-3d">${icon('cube')}Смотреть в 3D</span>
    </a>
    <button class="fav-btn ${state.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${icon('heart')}</button>
    <div class="card-body">
      <a class="card-title" href="#/p/${p.id}">${esc(p.name)}</a>
      <div class="card-kind">${esc(p.kind)}</div>
      <div class="card-row">
        <div class="price">${lo < hi ? '<span class="from">от</span>' : ''}${fmt(lo)}${old ? `<s>${fmt(oldPriceOf(p, {}))}</s>` : ''}</div>
        <div class="dots">${sws.slice(0, 5).map((v) => `<i class="${swCls(kind, v)} sw-xs" style="${swatchStyle(kind, v)}"></i>`).join('')}${sws.length > 5 ? `<span class="more">+${sws.length - 5}</span>` : ''}</div>
      </div>
    </div>
  </article>`;
}

// Вторая картинка (другой ракурс) грузится только при наведении.
document.addEventListener('pointerover', (e) => {
  const c = e.target.closest?.('.card');
  if (!c) return;
  const alt = $('img.alt[data-lazy]', c);
  if (alt) { alt.removeAttribute('data-lazy'); loadThumb(alt); }
});

/* ------------------------------ избранное и корзина ------------------------------ */

function toggleFav(id) {
  const on = !state.favs.has(id);
  on ? state.favs.add(id) : state.favs.delete(id);
  Store.set('favs', [...state.favs]);
  $$(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle('on', on));
  renderBadges(true);
  toast(on ? `«${byId[id].name}» в избранном` : 'Убрано из избранного', on ? { href: '#/favorites', text: 'Открыть' } : null);
  if (route.path === '/favorites') route.refresh();
}

function lineKey(id, cfg) { return cfgKey(byId[id], cfg); }

function addToCart(id, cfg, qty = 1) {
  const p = byId[id], key = lineKey(id, cfg);
  const line = state.cart.find((l) => l.key === key);
  if (line) line.qty += qty; else state.cart.push({ key, id, cfg: normalizeCfg(p, cfg), qty });
  saveCart(true);
}
function setQty(key, q) {
  const line = state.cart.find((l) => l.key === key);
  if (!line) return;
  line.qty = Math.max(0, Math.min(20, q));
  if (!line.qty) state.cart = state.cart.filter((l) => l !== line);
  saveCart();
}
function saveCart(bump) { Store.set('cart', state.cart); renderBadges(bump); renderCart(); if (route.path === '/checkout') route.refresh(); }
const cartCount = () => state.cart.reduce((s, l) => s + l.qty, 0);
const cartTotal = () => state.cart.reduce((s, l) => s + priceOf(byId[l.id], l.cfg) * l.qty, 0);
const FREE_FROM = 50000, DELIVERY = 2900;

function renderBadges(bump) {
  const fc = $('#favCount'), cc = $('#cartCount');
  fc.hidden = !state.favs.size; fc.textContent = state.favs.size;
  const n = cartCount();
  cc.hidden = !n; cc.textContent = n;
  if (bump) for (const el of [fc, cc]) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

function lineHTML(l, { controls = true } = {}) {
  const p = byId[l.id];
  return `<div class="line-item" data-line="${esc(l.key)}">
    <a class="li-media" href="#/p/${p.id}?${new URLSearchParams(l.cfg)}">${thumbImg(p, l.cfg, 'card')}</a>
    <div>
      <div class="li-top"><a class="li-name" href="#/p/${p.id}?${new URLSearchParams(l.cfg)}">${esc(p.kind)} «${esc(p.name)}»</a>
        ${controls ? `<button class="li-remove" data-remove aria-label="Удалить">${icon('trash')}</button>` : ''}</div>
      <div class="li-cfg">${esc(cfgSummary(p, l.cfg))}</div>
      <div class="li-bottom">
        ${controls ? `<div class="qty sm"><button data-dec aria-label="Меньше">${icon('minus')}</button><span>${l.qty}</span><button data-inc aria-label="Больше">${icon('plus')}</button></div>` : `<span class="muted">${l.qty} шт.</span>`}
        <b>${fmt(priceOf(p, l.cfg) * l.qty)}</b>
      </div>
    </div>
  </div>`;
}

function renderCart() {
  const body = $('#cartBody'), foot = $('#cartFoot');
  if (!state.cart.length) {
    body.innerHTML = `<div class="drawer-empty">${icon('bag')}<h4>Пока пусто</h4><p>Добавьте что-нибудь из каталога. Каждую вещь можно повернуть в 3D.</p><a class="btn btn-primary btn-sm" href="#/catalog" data-close-drawer>В каталог</a></div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = state.cart.map((l) => lineHTML(l)).join('');
  const total = cartTotal(), left = FREE_FROM - total;
  foot.innerHTML = `
    <div class="sum-row"><span>${left > 0 ? `До бесплатной доставки ${fmt(left)}` : 'Доставка бесплатная'}</span></div>
    <div class="free-bar"><i style="width:${Math.min(100, (total / FREE_FROM) * 100)}%"></i></div>
    <div class="sum-row total"><span>Итого, ${cartCount()} ${plural(cartCount(), 'товар', 'товара', 'товаров')}</span><span>${fmt(total)}</span></div>
    <a class="btn btn-primary btn-block" href="#/checkout" data-close-drawer>Оформить заказ ${icon('arrow')}</a>`;
  for (const img of $$('img[data-thumb]', body)) loadThumb(img);
}

function openCart(open = true) {
  const d = $('#cartDrawer'), s = $('#scrim');
  if (open) { renderCart(); s.hidden = false; requestAnimationFrame(() => { s.classList.add('show'); d.classList.add('open'); }); }
  else { s.classList.remove('show'); d.classList.remove('open'); setTimeout(() => { if (!d.classList.contains('open')) s.hidden = true; }, 300); }
  d.setAttribute('aria-hidden', String(!open));
}

$('#cartDrawer').addEventListener('click', (e) => {
  const line = e.target.closest('[data-line]');
  if (line) {
    const l = state.cart.find((x) => x.key === line.dataset.line);
    if (e.target.closest('[data-inc]')) setQty(l.key, l.qty + 1);
    else if (e.target.closest('[data-dec]')) setQty(l.key, l.qty - 1);
    else if (e.target.closest('[data-remove]')) setQty(l.key, 0);
  }
  if (e.target.closest('[data-close-drawer]') || e.target.closest('a')) openCart(false);
});
$('#scrim').addEventListener('click', () => openCart(false));
$('#cartBtn').addEventListener('click', () => openCart(true));

/* ------------------------------ тосты ------------------------------ */

function toast(text, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(text)}</span>${action ? (action.href ? `<a href="${action.href}">${esc(action.text)}</a>` : `<button>${esc(action.text)}</button>`) : ''}`;
  if (action?.onClick) t.querySelector('button').onclick = action.onClick;
  if (action?.href === '#cart') t.querySelector('a').onclick = (e) => { e.preventDefault(); openCart(true); };
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3200);
}

/* ------------------------------ композиция для главной ------------------------------ */

function livingRoom(fabric = 'linen-sand') {
  const g = new THREE.Group();
  const add = (id, cfg, x, z, ry = 0) => { const m = buildModel(byId[id], cfg); m.position.set(x, 0, z); m.rotation.y = ry; g.add(m); return m; };
  add('dyuna', { size: '200-300', rug: 'rug-sand' }, 0, 0.2);
  const sofa = add('oslo', { size: '220', fabric, wood: 'oak' }, 0, -0.62);
  add('luna', { size: '80', stone: 'travertine', wood: 'oak' }, 0.05, 0.62);
  add('kupol', { metal: 'brass', stone: 'nero' }, -1.72, -0.95, -0.42);
  add('olive', { ceramic: 'cer-terra' }, 1.62, -0.85);
  add('cloud', { fabric: 'velvet-terra' }, 1.15, 0.95);
  return { g, sofa };
}

/* ================================ СТРАНИЦЫ ================================ */

const HERO_FABRICS = ['linen-sand', 'boucle-ivory', 'velvet-emerald', 'velvet-terra', 'chenille-sky', 'mat-mustard', 'velvet-indigo', 'leather-cognac'];

function pageHome(app) {
  const hits = PRODUCTS.filter((p) => p.badge === 'hit' || p.badge === 'new').slice(0, 8);
  const tiles = [['sofas', 'oslo'], ['chairs', 'lund'], ['dining', 'vena'], ['tables', 'tur'], ['storage', 'nordic'], ['beds', 'son'], ['light', 'grib'], ['decor', 'olive']];
  let heroFabric = Store.get('heroFabric', 'linen-sand');
  app.innerHTML = `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <div class="eyebrow">Коллекция осень — зима 2026</div>
        <h1>Мебель, которую можно <em>рассмотреть</em> со всех сторон</h1>
        <p class="lead">Поверните диван, откройте ящики комода, примерьте ткань и расставьте всё в своей комнате, прежде чем заказать.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/catalog">Смотреть каталог ${icon('arrow')}</a>
          <a class="btn btn-ghost" href="#/planner">${icon('cube')} Собрать комнату в 3D</a>
        </div>
        <div class="hero-stats">
          <div><b>${PRODUCTS.length}</b><span>моделей в 3D</span></div>
          <div><b>${Object.keys(FABRICS).length}</b><span>тканей и кож</span></div>
          <div><b>5 лет</b><span>гарантии на каркас</span></div>
        </div>
      </div>
      <div class="hero-stage-wrap">
        <div class="hero-stage" id="heroStage">
          <div class="drag-hint">${icon('rotate')} Потяните, чтобы повернуть</div>
          <a class="hero-chip" id="heroChip" href="#/p/oslo"></a>
        </div>
        <div class="hero-swatches"><span class="label">Обивка дивана:</span><div class="sw-row" id="heroSw">
          ${HERO_FABRICS.map((id) => `<button class="${swCls('fabric', FABRICS[id])} ${id === heroFabric ? 'on' : ''}" style="${swatchStyle('fabric', { ...FABRICS[id], id })}" data-f="${id}" title="${esc(FABRICS[id].name)}" aria-label="${esc(FABRICS[id].name)}"></button>`).join('')}
        </div></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:30px">
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Каталог</div><h2 class="section-title">Для каждой комнаты</h2></div>
        <a class="link-arrow" href="#/catalog">Все товары ${icon('arrow')}</a></div>
      <div class="cat-grid">
        ${tiles.map(([c, pid]) => `<a class="cat-tile reveal" href="#/catalog/${c}"><div class="name">${catName(c)}</div><div class="n">${PRODUCTS.filter((p) => p.cat === c).length} ${plural(PRODUCTS.filter((p) => p.cat === c).length, 'модель', 'модели', 'моделей')}</div>${thumbImg(byId[pid], byId[pid].defaults, 'card')}</a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:10px">
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Выбор покупателей</div><h2 class="section-title">Хиты и новинки</h2>
        <p>Наведите на карточку, чтобы увидеть другой ракурс, или откройте товар и покрутите его в 3D.</p></div>
        <a class="link-arrow" href="#/catalog">Весь каталог ${icon('arrow')}</a></div>
      <div class="grid">${hits.map(card).join('')}</div>
    </div>
  </section>

  <section class="section" style="padding-top:20px">
    <div class="wrap">
      <div class="band reveal">
        <div class="band-text">
          <div class="eyebrow">3D-планировщик</div>
          <h2>Сначала расставьте, потом покупайте</h2>
          <p>Задайте размеры комнаты, добавьте мебель из каталога и подвигайте её мышью. Планировщик подсветит, если что-то не помещается.</p>
          <ul>
            <li>${icon('check')} Точные габариты каждой модели</li>
            <li>${icon('check')} Отступы до стен в сантиметрах</li>
            <li>${icon('check')} Дневной и вечерний свет</li>
          </ul>
          <a class="btn btn-light" href="#/planner">Открыть планировщик ${icon('arrow')}</a>
        </div>
        <div class="band-media"><img id="bandImg" alt="Гостиная, собранная в планировщике"></div>
      </div>
    </div>
  </section>

  <section class="section" id="materials">
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Материалы</div><h2 class="section-title">Ткани, дерево и камень</h2>
        <p>Мягкую мебель шьём в любой из тканей. Образцы бесплатно отправим курьером.</p></div></div>
      <div class="mat-tabs" id="matTabs">
        <button class="chip on" data-m="fabric">Ткани и кожа</button><button class="chip" data-m="wood">Дерево</button><button class="chip" data-m="stone">Камень</button><button class="chip" data-m="metal">Металл</button>
      </div>
      <div class="mat-grid" id="matGrid"></div>
    </div>
  </section>

  <section class="section" id="service" style="padding-top:10px">
    <div class="wrap perks">
      <div class="perk reveal">${icon('truck')}<h3>Доставка и сборка</h3><p>Привезём в удобный день, соберём и заберём упаковку. Бесплатно от ${fmt(FREE_FROM)}.</p></div>
      <div class="perk reveal">${icon('shield')}<h3>Гарантия 5 лет</h3><p>На каркасы мягкой мебели и корпуса. Ткани — 2 года.</p></div>
      <div class="perk reveal">${icon('swatch')}<h3>Образцы тканей</h3><p>До 6 образцов бесплатно, чтобы сравнить цвет при своём освещении.</p></div>
      <div class="perk reveal">${icon('cube')}<h3>Всё в 3D</h3><p>Каждая модель с точными размерами: проверьте, как она встанет у вас.</p></div>
    </div>
  </section>`;

  // 3D-сцена на первом экране
  const stage = $('#heroStage');
  const viewer = new Viewer(stage, { autoRotate: true, zoom: false, minPolar: 0.55 });
  viewer.controls.autoRotateSpeed = 0.4;
  viewer.canvas.style.touchAction = 'pan-y';
  let room = livingRoom(heroFabric);
  viewer.setModel(room.g, { view: 'hero', pad: 0.92 });
  viewer.onInteract = () => { $('.drag-hint', stage).style.opacity = 0; };
  const chip = () => {
    const p = byId.oslo, cfg = { size: '220', fabric: heroFabric, wood: 'oak' };
    $('#heroChip').href = `#/p/oslo?${new URLSearchParams(normalizeCfg(p, cfg))}`;
    $('#heroChip').innerHTML = `<div><div class="t">Диван «Осло» · ${fmt(priceOf(p, cfg))}</div><div class="s">${esc(FABRICS[heroFabric].name)} · 220 см</div></div><span class="go">${icon('arrow')}</span>`;
  };
  chip();
  $('#heroSw').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    heroFabric = b.dataset.f;
    Store.set('heroFabric', heroFabric);
    $$('#heroSw .sw').forEach((x) => x.classList.toggle('on', x === b));
    const old = room.sofa, next = buildModel(byId.oslo, { size: '220', fabric: heroFabric, wood: 'oak' });
    next.position.copy(old.position);
    room.g.remove(old); disposeObject(old);
    room.g.add(next); room.sofa = next;
    viewer.refresh();
    chip();
  });

  // картинка для блока о планировщике
  thumbs.get('band-room', () => { const r = livingRoom('velvet-emerald'); r.g.rotation.y = -0.5; return r.g; }, 'hero').then((url) => { const im = $('#bandImg'); if (im && url) im.src = url; });

  // материалы
  const matGrid = $('#matGrid');
  const showMats = (kind) => {
    const set = { fabric: FABRICS, wood: WOODS, stone: STONES, metal: METALS }[kind];
    matGrid.innerHTML = Object.entries(set).map(([id, v]) => `<div class="mat"><i class="${swCls(kind, v)}" style="${swatchStyle(kind, { ...v, id })}"></i><b>${esc(v.name.split(' · ')[1] || v.name)}</b><span>${esc(kind === 'fabric' ? FABRIC_TYPES[v.type] : v.add ? 'с доплатой' : 'базовая отделка')}</span></div>`).join('');
  };
  showMats('fabric');
  $('#matTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    $$('#matTabs .chip').forEach((x) => x.classList.toggle('on', x === b));
    showMats(b.dataset.m);
  });

  return () => viewer.dispose();
}

/* ------------------------------ каталог ------------------------------ */

const SORTS = { pop: 'Сначала популярные', cheap: 'Сначала дешевле', exp: 'Сначала дороже', new: 'Сначала новинки' };

function pageCatalog(app, cat, query) {
  if (cat && !CATEGORIES.some((c) => c.id === cat)) cat = '';
  const f = { cat: cat || '', sort: SORTS[query.sort] ? query.sort : 'pop', max: +query.max || 0, q: query.q || '', sale: query.sale === '1' };
  const maxAll = Math.ceil(Math.max(...PRODUCTS.map((p) => priceRange(p)[0])) / 10000) * 10000;
  app.innerHTML = `
  <div class="wrap page-head">
    <div class="crumbs"><a href="#/">Главная</a><span class="sep">/</span>${f.cat ? `<a href="#/catalog">Каталог</a><span class="sep">/</span><span>${catName(f.cat)}</span>` : '<span>Каталог</span>'}</div>
    <h1 id="catTitle"></h1>
  </div>
  <div class="wrap">
    <div class="toolbar">
      <div class="chips" id="catChips">
        <a class="chip ${!f.cat ? 'on' : ''}" href="#/catalog">Все <span class="n">${PRODUCTS.length}</span></a>
        ${CATEGORIES.map((c) => `<a class="chip ${f.cat === c.id ? 'on' : ''}" href="#/catalog/${c.id}">${c.name} <span class="n">${PRODUCTS.filter((p) => p.cat === c.id).length}</span></a>`).join('')}
      </div>
      <div class="toolbar-right">
        <label class="price-filter">до <input type="range" id="fMax" min="10000" max="${maxAll}" step="5000" value="${f.max || maxAll}"><output id="fMaxOut"></output></label>
        <button class="chip ${f.sale ? 'on' : ''}" id="fSale">Со скидкой</button>
        <select class="select" id="fSort" aria-label="Сортировка">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === f.sort ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
    </div>
    <div class="grid" id="catGrid"></div>
  </div>`;

  const draw = () => {
    let list = PRODUCTS.filter((p) => (!f.cat || p.cat === f.cat) && (!f.sale || p.old) && (!f.max || priceRange(p)[0] <= f.max));
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter((p) => [p.name, p.kind, catName(p.cat), p.text].join(' ').toLowerCase().includes(q));
    }
    const pop = (p) => (p.badge === 'hit' ? 0 : p.badge === 'new' ? 1 : 2);
    if (f.sort === 'cheap') list.sort((a, b) => priceRange(a)[0] - priceRange(b)[0]);
    else if (f.sort === 'exp') list.sort((a, b) => priceRange(b)[0] - priceRange(a)[0]);
    else if (f.sort === 'new') list.sort((a, b) => (b.badge === 'new') - (a.badge === 'new'));
    else list.sort((a, b) => pop(a) - pop(b));
    $('#catTitle').innerHTML = `${f.q ? `«${esc(f.q)}»` : f.cat ? catName(f.cat) : 'Каталог'}<sup>${list.length}</sup>`;
    $('#fMaxOut').textContent = fmt(f.max || maxAll);
    $('#catGrid').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty" style="grid-column:1/-1"><h3>Ничего не нашлось</h3><p>Попробуйте убрать фильтры или поискать по-другому.</p><a class="btn btn-ghost" href="#/catalog">Сбросить</a></div>`;
    hydrate($('#catGrid'));
    const qs = new URLSearchParams();
    if (f.sort !== 'pop') qs.set('sort', f.sort);
    if (f.max && f.max < maxAll) qs.set('max', f.max);
    if (f.sale) qs.set('sale', '1');
    if (f.q) qs.set('q', f.q);
    history.replaceState(null, '', `#/catalog${f.cat ? '/' + f.cat : ''}${qs.toString() ? '?' + qs : ''}`);
  };
  draw();
  $('#fMax').addEventListener('input', (e) => { f.max = +e.target.value; $('#fMaxOut').textContent = fmt(f.max); });
  $('#fMax').addEventListener('change', draw);
  $('#fSort').addEventListener('change', (e) => { f.sort = e.target.value; draw(); });
  $('#fSale').addEventListener('click', (e) => { f.sale = !f.sale; e.currentTarget.classList.toggle('on', f.sale); draw(); });
}

/* ------------------------------ товар ------------------------------ */

function optionBlock(p, opt, cfg) {
  const vals = optionValues(opt), cur = vals.find((v) => v.id === cfg[opt.key]);
  const kind = KIND_OF[opt.key];
  const base = priceOf(p, cfg);
  const delta = (v) => { const d = priceOf(p, { ...cfg, [opt.key]: v.id }) - base; return d ? `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}` : ''; };
  let body;
  if (kind && vals[0].hex) {
    const btn = (v) => `<button class="${swCls(kind, v)} ${v.id === cur.id ? 'on' : ''}" style="${swatchStyle(kind, v)}" data-opt="${opt.key}" data-val="${v.id}" title="${esc(v.label)}${delta(v) ? ' · ' + delta(v) : ''}" aria-label="${esc(v.label)}"></button>`;
    if (opt.key === 'fabric') {
      const groups = {};
      for (const v of vals) (groups[v.type] ||= []).push(v);
      body = Object.entries(groups).map(([t, vs]) => `<div class="opt-group"><div class="gname">${FABRIC_TYPES[t]}${vs[0].add ? ` · +${Math.round(vs[0].add * 100)}%` : ''}</div><div class="sw-row">${vs.map(btn).join('')}</div></div>`).join('');
    } else body = `<div class="sw-row">${vals.map(btn).join('')}</div>`;
  } else {
    body = `<div class="pills">${vals.map((v) => { const d = opt.cosmetic ? '' : delta(v); return `<button class="pill ${d ? 'two' : ''} ${v.id === cur.id ? 'on' : ''}" data-opt="${opt.key}" data-val="${v.id}">${esc(v.label)}${d ? `<small>${d}</small>` : ''}</button>`; }).join('')}</div>`;
  }
  return `<div class="opt" data-block="${opt.key}"><div class="opt-head"><b>${esc(opt.label)}</b><span>${esc(cur.label)}</span></div>${body}</div>`;
}

function pageProduct(app, id, query) {
  const p = byId[id];
  if (!p) return pageNotFound(app);
  let cfg = normalizeCfg(p, query), qty = 1;
  const rel = relatedTo(p);
  const isSoft = p.opts.some((o) => o.key === 'fabric');
  app.innerHTML = `
  <div class="wrap page-head" style="padding-bottom:0">
    <div class="crumbs"><a href="#/">Главная</a><span class="sep">/</span><a href="#/catalog">Каталог</a><span class="sep">/</span><a href="#/catalog/${p.cat}">${catName(p.cat)}</a><span class="sep">/</span><span>${esc(p.name)}</span></div>
  </div>
  <div class="wrap product">
    <div class="viewer" id="viewer">
      <div class="loading">Собираем модель…</div>
      <div class="vbar">
        <div class="seg" id="views">
          <button data-view="34" class="on">3/4</button><button data-view="front">Спереди</button><button data-view="side">Сбоку</button><button data-view="top">Сверху</button>
        </div>
        <div class="seg icons">
          <button id="tDims" title="Размеры" aria-label="Показать размеры">${icon('ruler')}</button>
          <button id="tRoom" title="В интерьере" aria-label="Показать в интерьере">${icon('room')}</button>
          <button id="tRot" class="on" title="Автовращение" aria-label="Автовращение">${icon('rotate')}</button>
          <button id="tShot" title="Сохранить картинку" aria-label="Сохранить картинку">${icon('camera')}</button>
          <button id="tFull" title="Во весь экран" aria-label="Во весь экран">${icon('full')}</button>
        </div>
      </div>
      <div class="vfoot">
        <span class="vhint">${coarse ? 'Проведите пальцем, чтобы повернуть' : 'Тяните — поворот · колесо — масштаб'}</span>
        <button class="action-pill" id="tAction" hidden></button>
      </div>
    </div>
    <div class="pinfo">
      <div class="eyebrow">${esc(p.kind)}</div>
      <h1>${esc(p.name)}</h1>
      <div class="pprice" id="pPrice"></div>
      <div class="installment" id="pInst"></div>
      <p class="ptext">${esc(p.text)}</p>
      <div id="pOpts"></div>
      <div class="buy">
        <div class="qty"><button id="qDec" aria-label="Меньше">${icon('minus')}</button><span id="qVal">1</span><button id="qInc" aria-label="Больше">${icon('plus')}</button></div>
        <button class="btn btn-primary" id="pBuy">${icon('bag')} В корзину</button>
        <button class="fav-big ${state.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${icon('heart')}</button>
      </div>
      <button class="btn btn-ghost try-room" id="pTry">${icon('cube')} Примерить в комнате</button>
      <div class="facts">
        <div class="fact">${icon('tool')}<div><b>${isSoft ? 'Изготовим за 4–6 недель' : 'В наличии на складе'}</b><span>${isSoft ? 'Шьём в выбранной ткани под заказ' : 'Отгрузка за 1–2 рабочих дня'}</span></div></div>
        <div class="fact">${icon('truck')}<div><b>Доставка и сборка</b><span id="pDeliv"></span></div></div>
      </div>
      <details class="acc" open><summary>Характеристики ${icon('plus')}</summary><div class="acc-body"><dl class="spec" id="pSpec"></dl></div></details>
      <details class="acc"><summary>Уход ${icon('plus')}</summary><div class="acc-body">${isSoft ? 'Чехлы снимаются и стираются при 30 °C в деликатном режиме. Велюр и букле чистите мягкой щёткой по направлению ворса, кожу — раз в полгода кремом без растворителей.' : 'Протирайте сухой или слегка влажной салфеткой без абразивов. Масляное покрытие дерева обновляйте раз в год. Камень — нейтральным средством, без кислот.'}</div></details>
      <details class="acc"><summary>Доставка и возврат ${icon('plus')}</summary><div class="acc-body">Доставляем по городу за 1–3 дня после готовности, по России — транспортной компанией. Подъём и сборка входят в стоимость. Мебель из наличия можно вернуть в течение 14 дней.</div></details>
    </div>
  </div>
  <section class="section" style="padding-top:20px">
    <div class="wrap">
      <div class="section-head"><div><div class="eyebrow">Для той же комнаты</div><h2 class="section-title">С этим сочетается</h2></div></div>
      <div class="grid">${rel.map(card).join('')}</div>
    </div>
  </section>`;
  hydrate(app);

  const vEl = $('#viewer');
  const viewer = new Viewer(vEl, { autoRotate: true });
  if (coarse) viewer.canvas.style.touchAction = 'pan-y';
  viewer.onInteract = () => { $('#tRot').classList.remove('on'); };
  let interior = false;

  const draw = (first) => {
    const price = priceOf(p, cfg), old = oldPriceOf(p, cfg);
    $('#pPrice').innerHTML = `<span class="now">${fmt(price)}</span>${old ? `<s>${fmt(old)}</s><span class="off">−${Math.round((1 - price / old) * 100)}%</span>` : ''}`;
    $('#pInst').textContent = `или ${fmt(Math.ceil(price / 12 / 100) * 100)} в месяц в рассрочку на 12 месяцев`;
    $('#pOpts').innerHTML = p.opts.map((o) => optionBlock(p, o, cfg)).join('');
    $('#pDeliv').textContent = price * qty >= FREE_FROM ? 'Бесплатно для этого заказа' : `${fmt(DELIVERY)}, бесплатно от ${fmt(FREE_FROM)}`;
    const model = buildModel(p, cfg);
    viewer.setModel(model, { keepView: !first, view: '34' });
    $('.loading', vEl)?.remove();
    const b = viewer.box, s = (v) => Math.round(v * 100);
    $('#pSpec').innerHTML = [['Габариты (Ш × Г × В)', `${s(b.max.x - b.min.x)} × ${s(b.max.z - b.min.z)} × ${s(b.max.y - b.min.y)} см`], ...p.opts.filter((o) => !o.cosmetic).map((o) => [o.label, optionValues(o).find((v) => v.id === cfg[o.key]).label]), ...p.specs]
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    const act = $('#tAction'), ud = model.userData;
    if (ud.open) { act.hidden = false; act.innerHTML = `${icon('drawer')} ${ud.open.label}`; act.classList.remove('on'); }
    else if (ud.light) { act.hidden = false; act.innerHTML = `${icon('bulb')} Включить свет`; act.classList.remove('on'); }
    else act.hidden = true;
    if (!first) history.replaceState(null, '', `#/p/${p.id}?${new URLSearchParams(cfg)}`);
  };
  draw(true);

  $('#pOpts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b || cfg[b.dataset.opt] === b.dataset.val) return;
    cfg = { ...cfg, [b.dataset.opt]: b.dataset.val };
    draw(false);
  });
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    $$('#views button').forEach((x) => x.classList.toggle('on', x === b));
    viewer.goTo(b.dataset.view);
    $('#tRot').classList.remove('on');
  });
  $('#tDims').addEventListener('click', (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); viewer.showDims(on); });
  $('#tRoom').addEventListener('click', (e) => { interior = !interior; e.currentTarget.classList.toggle('on', interior); viewer.setInterior(interior); });
  $('#tRot').addEventListener('click', (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); viewer.setAutoRotate(on); });
  $('#tShot').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = viewer.snapshot(interior ? 'image/jpeg' : 'image/png');
    a.download = `yasen-${p.id}.${interior ? 'jpg' : 'png'}`;
    a.click();
  });
  const setFull = (on) => {
    vEl.classList.toggle('fs', on);
    document.body.style.overflow = on ? 'hidden' : '';
    $('#tFull').classList.toggle('on', on);
  };
  $('#tFull').addEventListener('click', () => setFull(!vEl.classList.contains('fs')));
  const onKey = (e) => { if (e.key === 'Escape' && vEl.classList.contains('fs')) setFull(false); };
  document.addEventListener('keydown', onKey);
  $('#tAction').addEventListener('click', (e) => {
    const ud = viewer.model.userData, btn = e.currentTarget;
    if (ud.open) { const on = viewer.toggleOpen(); btn.innerHTML = `${icon('drawer')} ${on ? ud.open.closeLabel : ud.open.label}`; btn.classList.toggle('on', on); }
    else if (ud.light) { const on = viewer.toggleLight(); btn.innerHTML = `${icon('bulb')} ${on ? 'Выключить свет' : 'Включить свет'}`; btn.classList.toggle('on', on); }
  });
  $('#qDec').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
  $('#qInc').addEventListener('click', () => { qty = Math.min(20, qty + 1); $('#qVal').textContent = qty; });
  $('#pBuy').addEventListener('click', (e) => {
    addToCart(p.id, cfg, qty);
    const b = e.currentTarget;
    b.classList.add('done'); b.innerHTML = `${icon('check')} Добавлено`;
    setTimeout(() => { b.classList.remove('done'); b.innerHTML = `${icon('bag')} В корзину`; }, 1600);
    toast(`«${p.name}» в корзине`, { href: '#cart', text: 'Открыть корзину' });
  });
  $('#pTry').addEventListener('click', () => { state.pendingAdd = { id: p.id, cfg }; location.hash = '#/planner'; });

  return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; viewer.dispose(); };
}

/* ------------------------------ избранное ------------------------------ */

function pageFavorites(app) {
  const list = PRODUCTS.filter((p) => state.favs.has(p.id));
  app.innerHTML = `
  <div class="wrap page-head"><div class="crumbs"><a href="#/">Главная</a><span class="sep">/</span><span>Избранное</span></div><h1>Избранное<sup>${list.length}</sup></h1></div>
  <div class="wrap" style="padding-top:20px">
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
      : `<div class="empty"><h3>Здесь пока ничего нет</h3><p>Нажимайте на сердечко в карточках, чтобы сохранить понравившееся.</p><a class="btn btn-primary" href="#/catalog">Перейти в каталог</a></div>`}
  </div>`;
  hydrate(app);
}

/* ------------------------------ оформление ------------------------------ */

function pageCheckout(app) {
  if (!state.cart.length) {
    app.innerHTML = `<div class="wrap"><div class="empty" style="padding:100px 20px"><h3>Корзина пуста</h3><p>Добавьте товары, чтобы оформить заказ.</p><a class="btn btn-primary" href="#/catalog">В каталог</a></div></div>`;
    return;
  }
  const saved = Store.get('contact', {});
  const total = cartTotal();
  app.innerHTML = `
  <div class="wrap page-head"><div class="crumbs"><a href="#/">Главная</a><span class="sep">/</span><span>Оформление заказа</span></div><h1>Оформление</h1></div>
  <div class="wrap checkout">
    <form class="form-card" id="coForm" novalidate>
      <h3>Получатель</h3>
      <div class="form-grid">
        <div class="field"><label for="fName">Имя и фамилия</label><input class="input" id="fName" name="name" autocomplete="name" value="${esc(saved.name || '')}" required></div>
        <div class="field"><label for="fPhone">Телефон</label><input class="input" id="fPhone" name="phone" type="tel" autocomplete="tel" placeholder="+7 900 000-00-00" value="${esc(saved.phone || '')}" required></div>
        <div class="field wide"><label for="fMail">Эл. почта <span class="muted">— необязательно</span></label><input class="input" id="fMail" name="email" type="email" autocomplete="email" value="${esc(saved.email || '')}"></div>
      </div>
      <h3>Получение</h3>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="ship" value="courier" checked><b>Доставка и сборка</b><span>${total >= FREE_FROM ? 'Бесплатно' : fmt(DELIVERY)} · 1–3 дня после готовности</span></label>
        <label class="radio-card"><input type="radio" name="ship" value="pickup"><b>Самовывоз со склада</b><span>Бесплатно · по готовности</span></label>
      </div>
      <div class="form-grid" style="margin-top:14px" id="addrBox">
        <div class="field wide"><label for="fAddr">Адрес</label><input class="input" id="fAddr" name="address" autocomplete="street-address" placeholder="Город, улица, дом, квартира" value="${esc(saved.address || '')}"></div>
        <div class="field"><label for="fDate">Желаемая дата</label><input class="input" id="fDate" name="date" type="date"></div>
        <div class="field"><label for="fFloor">Этаж и лифт</label><select class="select" id="fFloor" name="floor"><option>Есть грузовой лифт</option><option>Есть пассажирский лифт</option><option>Без лифта</option><option>Частный дом</option></select></div>
      </div>
      <div class="field" style="margin-top:14px"><label for="fNote">Комментарий</label><textarea class="input" id="fNote" name="note" placeholder="Код домофона, удобное время звонка"></textarea></div>
      <button class="btn btn-primary btn-block" style="margin-top:22px" type="submit">Подтвердить заказ</button>
      <div class="demo-note">${icon('shield')}<span>Это демонстрационный магазин: заказ никуда не отправляется, данные остаются только в вашем браузере. Оплата не запрашивается.</span></div>
    </form>
    <aside class="summary" id="coSummary"></aside>
  </div>`;
  const ship = () => $('input[name=ship]:checked').value;
  const drawSum = () => {
    const t = cartTotal(), d = ship() === 'pickup' || t >= FREE_FROM ? 0 : DELIVERY;
    $('#coSummary').innerHTML = `<h3>Ваш заказ</h3>${state.cart.map((l) => lineHTML(l, { controls: false })).join('')}
      <div style="margin-top:14px">
        <div class="sum-row"><span>Товары</span><span>${fmt(t)}</span></div>
        <div class="sum-row"><span>${ship() === 'pickup' ? 'Самовывоз' : 'Доставка и сборка'}</span><span>${d ? fmt(d) : 'бесплатно'}</span></div>
        <div class="sum-row total"><span>К оплате при получении</span><span>${fmt(t + d)}</span></div>
      </div>`;
    for (const img of $$('img[data-thumb]', $('#coSummary'))) loadThumb(img);
  };
  drawSum();
  const date = $('#fDate'), min = new Date(Date.now() + 3 * 864e5);
  date.min = min.toISOString().slice(0, 10);
  $$('input[name=ship]').forEach((r) => r.addEventListener('change', () => { $('#addrBox').hidden = ship() === 'pickup'; drawSum(); }));
  $('#coForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fm = e.currentTarget, req = [fm.name, fm.phone, ...(ship() === 'courier' ? [fm.address] : [])];
    let ok = true;
    for (const i of req) { const bad = !i.value.trim() || (i === fm.phone && i.value.replace(/\D/g, '').length < 10); i.classList.toggle('bad', bad); if (bad && ok) { i.focus(); ok = false; } }
    if (!ok) { toast('Заполните отмеченные поля'); return; }
    Store.set('contact', { name: fm.name.value, phone: fm.phone.value, email: fm.email.value, address: fm.address.value });
    const num = String(Math.floor(100000 + Math.random() * 900000));
    const count = cartCount(), sum = cartTotal();
    state.cart = []; Store.set('cart', []); renderBadges(); renderCart();
    app.innerHTML = `<div class="wrap success page-enter"><div class="ok">${icon('check')}</div><div class="eyebrow">Заказ № ${num}</div>
      <h1>Спасибо, ${esc(fm.name.value.split(' ')[0])}!</h1>
      <p>Мы бы позвонили по номеру ${esc(fm.phone.value)}, чтобы подтвердить ${count} ${plural(count, 'товар', 'товара', 'товаров')} на ${fmt(sum)}. Но это демонстрационный магазин, поэтому заказ никуда не ушёл.</p>
      <div class="hero-cta" style="justify-content:center;margin-top:26px"><a class="btn btn-primary" href="#/catalog">Продолжить покупки</a><a class="btn btn-ghost" href="#/planner">${icon('cube')} В планировщик</a></div></div>`;
    window.scrollTo({ top: 0 });
  });
}

/* ------------------------------ планировщик ------------------------------ */

const EXAMPLE_ROOM = {
  room: { w: 5.2, l: 4.2, floor: 'oak-light', wall: 'chalk' },
  items: [
    { id: 'dyuna', cfg: { size: '200-300', rug: 'rug-sand' }, x: 0, z: 0.1, rot: 0 },
    { id: 'oslo', cfg: { size: '220', fabric: 'velvet-emerald', wood: 'oak' }, x: 0, z: -1.5, rot: 0 },
    { id: 'luna', cfg: { size: '80', stone: 'travertine', wood: 'oak' }, x: 0, z: -0.25, rot: 0 },
    { id: 'lund', cfg: { fabric: 'leather-cognac', wood: 'oak' }, x: 1.55, z: 0.25, rot: -1.0472 },
    { id: 'kupol', cfg: { metal: 'brass', stone: 'nero' }, x: -1.75, z: -1.0, rot: 0.3 },
    { id: 'olive', cfg: { ceramic: 'cer-terra' }, x: 2.25, z: -1.75, rot: 0 },
    { id: 'kadr', cfg: { size: '160', wood: 'walnut' }, x: 0, z: 1.85, rot: Math.PI },
    { id: 'cloud', cfg: { fabric: 'velvet-terra' }, x: -1.2, z: 0.6, rot: 0 },
  ],
};

async function pagePlanner(app) {
  document.body.classList.add('planner-page');
  const token = app.dataset.token;
  const { Planner } = await import('./planner.js');
  if (app.dataset.token !== token) return;
  app.innerHTML = `
  <section class="planner" id="plRoot">
    <aside class="pl-side">
      <div class="pl-side-head"><div class="eyebrow">3D-планировщик</div><h1>Соберите комнату</h1>
        <p>Нажмите на товар, чтобы добавить его в комнату. Мебель двигается мышью, камера вращается по пустому месту, правая кнопка — сдвиг.</p></div>
      <div class="chips" id="plCats"><button class="chip on" data-c="">Все</button>${CATEGORIES.map((c) => `<button class="chip" data-c="${c.id}">${c.name}</button>`).join('')}</div>
      <div class="pl-list" id="plList"></div>
    </aside>
    <div class="pl-main">
      <div class="pl-stage" id="plStage"></div>
      <div class="pl-top">
        <div class="seg" id="plView"><button data-v="3d" class="on">${icon('cube')}3D</button><button data-v="top">${icon('grid')}Сверху</button></div>
        <div style="display:flex;gap:8px;align-items:start">
          <div class="seg icons">
            <button id="plEve" title="Вечернее освещение" aria-label="Вечернее освещение">${icon('moon')}</button>
            <button id="plSnap" class="on" title="Привязка к сетке 5 см (Alt — без привязки)" aria-label="Привязка к сетке">${icon('grid')}</button>
            <button id="plHome" title="Показать всю комнату" aria-label="Показать всю комнату">${icon('home')}</button>
            <button id="plShot" title="Сохранить картинку" aria-label="Сохранить картинку">${icon('camera')}</button>
          </div>
          <div class="pl-room">
            <div class="seg"><button id="plRoomBtn">${icon('ruler')}<span id="plRoomLbl"></span></button></div>
            <div class="pl-pop" id="plPop" hidden>
              <h4>Размер комнаты</h4>
              <div class="range-row"><span>Ширина</span><output id="oW"></output><input type="range" id="rW" min="2.5" max="9" step="0.1"></div>
              <div class="range-row"><span>Длина</span><output id="oL"></output><input type="range" id="rL" min="2.5" max="9" step="0.1"></div>
              <h4>Пол</h4>
              <div class="pills" id="plFloor">${Object.entries(FLOORS).map(([id, f]) => `<button class="pill" data-floor="${id}" style="height:36px;padding:0 12px;font-size:13px">${f.name}</button>`).join('')}</div>
              <h4>Стены</h4>
              <div class="sw-row" id="plWall">${Object.entries(WALLS).map(([id, w]) => `<button class="sw" style="--c:${w.hex}" data-wall="${id}" title="${w.name}" aria-label="${w.name}"></button>`).join('')}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="pl-hint" id="plHint" hidden><h3>Комната пока пустая</h3><p>Выберите мебель в списке слева или начните с готовой гостиной.</p><button class="btn btn-primary btn-sm" id="plExample" style="margin-top:16px;pointer-events:auto">Загрузить пример</button></div>
      <div class="pl-sel" id="plSel" hidden></div>
      <div class="pl-sum">
        <div class="t"><span class="lg">В комнате </span><b id="plCount">0</b> <span id="plCountW">предметов</span> · <b id="plTotal">0 ₽</b></div>
        <div class="sp"></div>
        <button class="btn btn-ghost btn-sm" id="plClear" title="Очистить комнату">${icon('trash')}<span>Очистить</span></button>
        <button class="btn btn-primary btn-sm" id="plBuy">${icon('bag')}<span class="lg">Всё </span>в корзину</button>
      </div>
    </div>
  </section>`;

  // список товаров
  const drawList = (c) => {
    $('#plList').innerHTML = PRODUCTS.filter((p) => !c || p.cat === c).map((p) => `<button class="pl-item" data-add="${p.id}" title="Добавить в комнату"><div class="im">${thumbImg(p, p.defaults, 'card')}</div><div class="nm">${esc(p.name)}</div><div class="pr">${esc(p.kind)}</div><span class="add">${icon('plus')}</span></button>`).join('');
    hydrate($('#plList'));
  };
  drawList('');
  $('#plCats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    $$('#plCats .chip').forEach((x) => x.classList.toggle('on', x === b));
    drawList(b.dataset.c);
  });

  const root = $('#plRoot');
  let sel = null;
  const summary = (s) => {
    const n = s.items.length, t = s.items.reduce((a, it) => a + priceOf(byId[it.id], it.cfg), 0);
    $('#plCount').textContent = n;
    $('#plCountW').textContent = plural(n, 'предмет', 'предмета', 'предметов');
    $('#plTotal').textContent = fmt(t);
    $('#plHint').hidden = n > 0;
    $('#plBuy').disabled = !n;
    $('#plRoomLbl').textContent = `${s.room.w.toFixed(1).replace('.', ',')} × ${s.room.l.toFixed(1).replace('.', ',')} м`;
  };
  const drawSel = (d) => {
    sel = d;
    const box = $('#plSel');
    if (!d) { box.hidden = true; return; }
    const p = d.product, main = p.opts.find((o) => KIND_OF[o.key] && optionValues(o)[0].hex);
    const sws = main ? optionValues(main).slice(0, 9) : [];
    box.hidden = false;
    box.innerHTML = `<div class="info"><b>${esc(p.kind)} «${esc(p.name)}»</b><span>${fmt(priceOf(p, d.cfg))}</span></div>
      ${sws.length ? `<div class="vr"></div><div class="sw-row">${sws.map((v) => `<button class="${swCls(KIND_OF[main.key], v)} ${d.cfg[main.key] === v.id ? 'on' : ''}" style="${swatchStyle(KIND_OF[main.key], v)}" data-k="${main.key}" data-v="${v.id}" title="${esc(v.label)}"></button>`).join('')}</div>` : ''}
      <div class="vr"></div>
      <div class="tools">
        <button class="icon-btn" data-t="rotl" title="Повернуть влево (Q)">${icon('rotl')}</button>
        <button class="icon-btn" data-t="rotr" title="Повернуть вправо (E)">${icon('rotate')}</button>
        <button class="icon-btn" data-t="dup" title="Копия (Ctrl+D)">${icon('copy')}</button>
        <a class="icon-btn" href="#/p/${p.id}?${new URLSearchParams(d.cfg)}" title="Открыть товар">${icon('arrow')}</a>
        <button class="icon-btn danger" data-t="del" title="Удалить (Delete)">${icon('trash')}</button>
      </div>`;
  };

  const planner = new Planner($('#plStage'), {
    onSelect: drawSel,
    onChange: (s) => { state.planner = s; Store.set('planner', s); summary(s); if (sel) drawSel(planner.sel ? { ...planner.sel.d, product: planner.sel.p } : null); },
  });
  planner.load(state.planner || { room: EXAMPLE_ROOM.room, items: [] });
  summary(planner.serialize());
  if (state.pendingAdd) {
    const { id, cfg } = state.pendingAdd;
    state.pendingAdd = null;
    planner.addItem(id, cfg);
    toast(`«${byId[id].name}» добавлен в комнату. Перетащите его на место`);
  }

  $('#plList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (b) planner.addItem(b.dataset.add, byId[b.dataset.add].defaults);
  });
  $('#plSel').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]'), s = e.target.closest('[data-k]');
    if (s) planner.setSelectedCfg({ [s.dataset.k]: s.dataset.v });
    if (!t) return;
    ({ rotl: () => planner.rotateSelected(45), rotr: () => planner.rotateSelected(-45), dup: () => planner.duplicateSelected(), del: () => planner.removeSelected() })[t.dataset.t]();
  });
  $('#plView').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    $$('#plView button').forEach((x) => x.classList.toggle('on', x === b));
    planner.setView(b.dataset.v);
  });
  $('#plEve').addEventListener('click', (e) => {
    const on = !planner.evening;
    planner.setEvening(on);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.innerHTML = icon(on ? 'sun' : 'moon');
    root.classList.toggle('evening', on);
  });
  $('#plSnap').addEventListener('click', (e) => { planner.snap = planner.snap === false; e.currentTarget.classList.toggle('on', planner.snap); });
  $('#plHome').addEventListener('click', () => planner.home());
  $('#plShot').addEventListener('click', () => { const a = document.createElement('a'); a.href = planner.snapshot(); a.download = 'yasen-komnata.jpg'; a.click(); });
  $('#plClear').addEventListener('click', (e) => {
    const b = e.currentTarget;
    const label = $('span', b);
    if (!b.dataset.sure) { b.dataset.sure = '1'; label.textContent = 'Точно?'; b.classList.add('warn'); setTimeout(() => { delete b.dataset.sure; label.textContent = 'Очистить'; b.classList.remove('warn'); }, 2500); return; }
    delete b.dataset.sure; label.textContent = 'Очистить'; b.classList.remove('warn');
    planner.load({ room: planner.state.room, items: [] });
    state.planner = planner.serialize(); Store.set('planner', state.planner); summary(state.planner);
  });
  $('#plExample').addEventListener('click', () => { planner.load(EXAMPLE_ROOM); state.planner = planner.serialize(); Store.set('planner', state.planner); summary(state.planner); });
  $('#plBuy').addEventListener('click', () => {
    const s = planner.serialize();
    for (const it of s.items) addToCart(it.id, it.cfg, 1);
    toast(`${s.items.length} ${plural(s.items.length, 'товар', 'товара', 'товаров')} в корзине`, { href: '#cart', text: 'Открыть' });
  });

  // комната
  const pop = $('#plPop');
  const syncRoom = () => {
    const r = planner.state.room;
    $('#rW').value = r.w; $('#rL').value = r.l;
    $('#oW').textContent = r.w.toFixed(1).replace('.', ',') + ' м'; $('#oL').textContent = r.l.toFixed(1).replace('.', ',') + ' м';
    $$('#plFloor .pill').forEach((b) => b.classList.toggle('on', b.dataset.floor === r.floor));
    $$('#plWall .sw').forEach((b) => b.classList.toggle('on', b.dataset.wall === r.wall));
  };
  syncRoom();
  $('#plRoomBtn').addEventListener('click', () => { pop.hidden = !pop.hidden; syncRoom(); });
  for (const [id, key] of [['#rW', 'w'], ['#rL', 'l']]) {
    $(id).addEventListener('input', (e) => { $(key === 'w' ? '#oW' : '#oL').textContent = (+e.target.value).toFixed(1).replace('.', ',') + ' м'; });
    $(id).addEventListener('change', (e) => { planner.setRoom({ [key]: +e.target.value }); planner.home(); });
  }
  $('#plFloor').addEventListener('click', (e) => { const b = e.target.closest('[data-floor]'); if (b) { planner.setRoom({ floor: b.dataset.floor }); syncRoom(); } });
  $('#plWall').addEventListener('click', (e) => { const b = e.target.closest('[data-wall]'); if (b) { planner.setRoom({ wall: b.dataset.wall }); syncRoom(); } });
  const outside = (e) => { if (!pop.hidden && !e.target.closest('.pl-room')) pop.hidden = true; };
  document.addEventListener('pointerdown', outside);

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (!planner.sel) return;
    if (k === 'delete' || k === 'backspace') { planner.removeSelected(); e.preventDefault(); }
    else if (k === 'q' || k === 'й') planner.rotateSelected(e.shiftKey ? 5 : 15);
    else if (k === 'e' || k === 'у') planner.rotateSelected(e.shiftKey ? -5 : -15);
    else if (k === 'r' || k === 'к') planner.rotateSelected(90);
    else if ((e.ctrlKey || e.metaKey) && (k === 'd' || k === 'в')) { planner.duplicateSelected(); e.preventDefault(); }
    else if (k === 'escape') planner.select(null);
    else if (k.startsWith('arrow')) {
      const it = planner.sel, step = e.shiftKey ? 0.2 : 0.05;
      it.d.x += k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
      it.d.z += k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      planner._clamp(it); planner._refreshSel(); planner._changed(); e.preventDefault();
    }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', outside);
    document.body.classList.remove('planner-page');
    planner.dispose();
  };
}

function pageNotFound(app) {
  app.innerHTML = `<div class="wrap"><div class="empty" style="padding:110px 20px"><h3>Такой страницы нет</h3><p>Возможно, товар сняли с продажи или ссылка устарела.</p><a class="btn btn-primary" href="#/catalog">В каталог</a></div></div>`;
}

/* ================================ МАРШРУТЫ ================================ */

const ROUTES = [
  [/^\/$/, pageHome],
  [/^\/catalog(?:\/([\w-]+))?$/, pageCatalog],
  [/^\/p\/([\w-]+)$/, pageProduct],
  [/^\/planner$/, pagePlanner],
  [/^\/favorites$/, pageFavorites],
  [/^\/checkout$/, pageCheckout],
];

const route = {
  path: null, cleanup: null, token: 0,
  async go() {
    const raw = location.hash.slice(1) || '/';
    const [rawPath, qs] = raw.split('?');
    const path = decodeURIComponent(rawPath);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (typeof this.cleanup === 'function') { try { this.cleanup(); } catch (e) { console.error(e); } }
    this.cleanup = null;
    document.body.classList.remove('planner-page');
    const app = $('#app');
    const token = String(++this.token);
    app.dataset.token = token;
    app.innerHTML = '';
    app.classList.remove('page-enter'); void app.offsetWidth; app.classList.add('page-enter');
    this.path = path;
    $$('.main-nav a').forEach((a) => {
      const n = a.dataset.nav;
      a.classList.toggle('active', (n === 'catalog' && path === '/catalog') || path === '/catalog/' + n || (n === 'planner' && path === '/planner'));
    });
    closeMobileNav();
    if ($('#cartDrawer').classList.contains('open')) openCart(false);
    if (!searchLayer.hidden) openSearch(false);
    let fn = pageNotFound, args = [];
    for (const [re, f] of ROUTES) { const m = path.match(re); if (m) { fn = f; args = m.slice(1); break; } }
    const scroll = state.pendingScroll;
    state.pendingScroll = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const res = fn(app, ...args, query);
    const done = res instanceof Promise ? await res : res;
    if (token !== app.dataset.token) { if (typeof done === 'function') done(); return; }
    this.cleanup = done;
    hydrate(app);
    if (scroll) setTimeout(() => document.getElementById(scroll)?.scrollIntoView({ behavior: 'smooth' }), 60);
    document.title = { '/': 'Ясень — мебель в 3D', '/planner': '3D-планировщик · Ясень', '/favorites': 'Избранное · Ясень', '/checkout': 'Оформление · Ясень' }[path]
      || (path.startsWith('/p/') && byId[args[0]] ? `${byId[args[0]].kind} «${byId[args[0]].name}» · Ясень` : path.startsWith('/catalog') ? `${args[0] ? catName(args[0]) : 'Каталог'} · Ясень` : 'Ясень');
  },
  refresh() { this.go(); },
};

window.addEventListener('hashchange', () => route.go());

/* ------------------------------ шапка, поиск, меню ------------------------------ */

document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
  const sc = e.target.closest('[data-scroll]');
  if (sc) {
    e.preventDefault();
    if (route.path === '/') document.getElementById(sc.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
    else { state.pendingScroll = sc.dataset.scroll; location.hash = '#/'; }
  }
});

const header = $('#header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

const searchLayer = $('#searchLayer'), searchInput = $('#searchInput'), searchResults = $('#searchResults');
let hl = 0;
function openSearch(on = true) {
  searchLayer.hidden = !on;
  document.body.style.overflow = on ? 'hidden' : '';
  if (on) { searchInput.value = ''; drawSearch(); setTimeout(() => searchInput.focus(), 30); }
}
function searchList(q) {
  q = q.trim().toLowerCase();
  if (!q) return PRODUCTS.filter((p) => p.badge === 'hit');
  return PRODUCTS.filter((p) => [p.name, p.kind, catName(p.cat), p.text, ...p.opts.flatMap((o) => optionValues(o).map((v) => v.label))].join(' ').toLowerCase().includes(q));
}
function drawSearch() {
  const list = searchList(searchInput.value);
  hl = 0;
  searchResults.innerHTML = (searchInput.value.trim() ? '' : '<div class="search-empty eyebrow">Часто ищут</div>')
    + (list.length ? list.map((p, i) => `<a class="sr ${i === 0 && searchInput.value ? 'hl' : ''}" href="#/p/${p.id}"><div class="li-media">${thumbImg(p, p.defaults, 'card')}</div><div><b>${esc(p.name)}</b><span>${esc(p.kind)} · от ${fmt(priceRange(p)[0])}</span></div></a>`).join('')
      : '<div class="search-empty">Ничего не нашлось. Попробуйте «диван», «орех» или «велюр».</div>');
  for (const img of $$('img[data-thumb]', searchResults)) loadThumb(img);
}
$('#searchBtn').addEventListener('click', () => openSearch(true));
$('#searchClose').addEventListener('click', () => openSearch(false));
searchInput.addEventListener('input', drawSearch);
searchInput.addEventListener('keydown', (e) => {
  const items = $$('.sr', searchResults);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length);
    items.forEach((x, i) => x.classList.toggle('hl', i === hl));
  } else if (e.key === 'Enter') {
    const target = items[hl];
    if (target) { location.hash = target.getAttribute('href'); openSearch(false); }
    else if (searchInput.value.trim()) { location.hash = `#/catalog?q=${encodeURIComponent(searchInput.value.trim())}`; openSearch(false); }
  }
});
searchResults.addEventListener('click', (e) => { if (e.target.closest('a')) openSearch(false); });
searchLayer.addEventListener('click', (e) => { if (e.target === searchLayer) openSearch(false); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!searchLayer.hidden) openSearch(false); if ($('#cartDrawer').classList.contains('open')) openCart(false); }
  if (e.key === '/' && !e.target.closest('input, textarea') && searchLayer.hidden) { e.preventDefault(); openSearch(true); }
});

const mobileNav = $('#mobileNav');
mobileNav.innerHTML = `<a href="#/catalog">Каталог <small>${PRODUCTS.length}</small></a>${CATEGORIES.map((c) => `<a href="#/catalog/${c.id}">${c.name} <small>${PRODUCTS.filter((p) => p.cat === c.id).length}</small></a>`).join('')}<a href="#/planner">3D-планировщик <small>${icon('cube')}</small></a><a href="#/favorites">Избранное</a>`;
function closeMobileNav() { mobileNav.hidden = true; document.body.style.overflow = ''; }
$('#burger').addEventListener('click', () => { mobileNav.hidden = !mobileNav.hidden; document.body.style.overflow = mobileNav.hidden ? '' : 'hidden'; });

/* ------------------------------ старт ------------------------------ */

renderBadges();
renderCart();
route.go();
window.yasen = { state, route, thumbs, addToCart };
