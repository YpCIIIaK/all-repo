(() => {
  if (window.__fcLoaded) return;
  window.__fcLoaded = true;

  const LINK_SEL = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
    'summary, label[for], select, input[type="button"], input[type="submit"], input[type="reset"], ' +
    'input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], input[type="file"]';
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let cfg = { ...FC_DEFAULTS };
  let root, dot, ring;
  let mx = -100, my = -100;   // где мышь
  let rx = -100, ry = -100;   // где кольцо
  let tx = 0, ty = 0;         // куда тянет магнит
  let seen = false, running = false;
  let linkEl = null;
  let vx = 0, vy = 0;         // сглаженная скорость — для наклона курсора
  let hand, lastMx = -100;
  let hAng = 0, hVel = 0;     // наклон пальца и его скорость — пружина
  // Картинка стандартной руки; кончик пальца — точка клика
  const HAND_URL = chrome.runtime.getURL('hand.png');
  let hiddenEl = null, hiddenVal = '', hiddenPrio = '';  // элемент, у которого спрятан системный курсор
  let overEl = null;          // самый глубокий элемент под мышью
  let linkRect = null;        // размеры текущей кнопки (кэш, сбрасывается при прокрутке)
  const cls = {};             // текущие классы #fc-root — чтобы не трогать DOM без нужды

  function build() {
    root = document.createElement('div');
    root.id = 'fc-root';
    root.className = 'fc-hidden';
    cls['fc-hidden'] = true;
    root.setAttribute('aria-hidden', 'true');
    ring = document.createElement('div');
    ring.className = 'fc-ring';
    dot = document.createElement('div');
    dot.className = 'fc-dot';
    hand = document.createElement('div');
    hand.className = 'fc-hand';
    const img = document.createElement('img');
    img.src = HAND_URL;
    img.alt = '';
    img.draggable = false;
    hand.appendChild(img);
    root.append(ring, dot, hand);
  }

  function setCls(name, on) {
    if (cls[name] === on) return;
    cls[name] = on;
    root.classList.toggle(name, on);
  }

  // Системный курсор прячем точечно — только у элемента под мышью, а не у всей страницы:
  // правка одного элемента не заставляет браузер пересчитывать стили всего документа
  function hideCursorOn(el) {
    if (hiddenEl === el) return;
    restoreCursor();
    if (!el || !el.style) return;
    hiddenEl = el;
    hiddenVal = el.style.getPropertyValue('cursor');
    hiddenPrio = el.style.getPropertyPriority('cursor');
    el.style.setProperty('cursor', 'none', 'important');
  }

  function restoreCursor() {
    if (!hiddenEl) return;
    if (hiddenVal) hiddenEl.style.setProperty('cursor', hiddenVal, hiddenPrio);
    else hiddenEl.style.removeProperty('cursor');
    hiddenEl = null;
  }

  function mount() {
    // Некоторые сайты пересобирают документ — возвращаем курсор на место
    if (!root.isConnected) document.documentElement.appendChild(root);
  }

  function applySettings() {
    root.style.setProperty('--fc-color', cfg.color);
    root.style.setProperty('--fc-size', cfg.size + 'px');
    for (const s of ['ring', 'dot', 'blend', 'hand']) setCls('fc-style-' + s, cfg.style === s);
    setCls('fc-mode-hover', cfg.mode === 'hover');
    if (cfg.enabled) {
      mount();
      updateActive();
    } else {
      restoreCursor();
      root.remove();
    }
  }

  // В режиме hover системный курсор прячется только над ссылками и кнопками
  function updateActive() {
    const active = cfg.enabled && seen && (cfg.mode !== 'hover' || !!linkEl);
    if (active) hideCursorOn(overEl); else restoreCursor();
    setCls('fc-idle', !active);
  }

  function isTextField(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return !el.disabled;
    if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase()) && !el.disabled;
    return false;
  }

  function textHeight(el) {
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    return Math.round(Math.min(Math.max(fs * 1.25, 14), 48));
  }

  // Элемент, над которым должна быть рука: ссылки и кнопки, а также всё,
  // чему сайт сам поставил cursor: pointer (div-кнопки, карточки и т. п.)
  function pointerTarget(el) {
    if (!el.closest) return null;
    const c = getComputedStyle(el).cursor;   // курсор, который хочет сайт
    if (c === 'pointer') return el.closest(LINK_SEL) || el;
    // У кнопок браузер сам ставит default; другой курсор (запрет, текст, …) — сайт просит явно, не мешаем
    if (c !== 'auto' && c !== 'default') return null;
    return el.closest(LINK_SEL);
  }

  function onOver(e) {
    if (!cfg.enabled) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    const el = t && t.nodeType === 1 ? t : e.target;
    if (el === overEl) return;
    // Сначала возвращаем курсор прежнему элементу, иначе новый унаследует от него cursor: none
    restoreCursor();
    overEl = el;
    if (isTextField(el)) {
      root.style.setProperty('--fc-text-h', textHeight(el) + 'px');
      setCls('fc-text', true);
      setCls('fc-link', false);
      linkEl = linkRect = null;
      updateActive();
      return;
    }
    setCls('fc-text', false);
    const prev = linkEl;
    linkEl = pointerTarget(el);
    // Размеры кнопки нужны только магниту, а он действует только на кольцо
    const needRect = cfg.magnetic && cfg.style !== 'hand';
    if (linkEl !== prev) linkRect = linkEl && needRect ? linkEl.getBoundingClientRect() : null;
    setCls('fc-link', !!linkEl);
    if (linkEl && !prev && cfg.mode === 'hover') { rx = mx; ry = my; vx = vy = 0; }
    updateActive();
    if (linkEl && !running) { running = true; requestAnimationFrame(tick); }
  }

  function onMove(e) {
    if (!cfg.enabled || e.pointerType === 'touch') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) {
      seen = true;
      rx = mx; ry = my; lastMx = mx;
      updateActive();
    }
    setCls('fc-hidden', false);
    mount();
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    // Магнит: кольцо слегка тянется к центру кнопки
    tx = 0; ty = 0;
    if (cfg.magnetic && linkRect && !reducedMotion.matches) {
      const r = linkRect;
      if (r.width < 400 && r.height < 200) {
        tx = (r.left + r.width / 2 - mx) * 0.3;
        ty = (r.top + r.height / 2 - my) * 0.3;
      }
    }
    const k = reducedMotion.matches ? 1 : cfg.lag;
    const gx = mx + tx, gy = my + ty;
    const dx = (gx - rx) * k, dy = (gy - ry) * k;
    rx += dx; ry += dy;
    vx += (dx - vx) * 0.35; vy += (dy - vy) * 0.35;
    // Наклон: кольцо поворачивается по направлению движения и вытягивается от скорости
    const speed = Math.hypot(vx, vy);
    const st = reducedMotion.matches ? 0 : Math.min(speed / 40, 0.45);
    const ang = Math.atan2(vy, vx) * 180 / Math.PI;
    // Двигаем только то, что сейчас видно
    const idle = cls['fc-idle'];
    const isHand = cfg.style === 'hand';
    if (!idle && (!isHand || cls['fc-text'])) dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    if (!idle && !isHand) ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0) rotate(${ang.toFixed(1)}deg) scale(${(1 + st).toFixed(3)}, ${(1 - st * 0.6).toFixed(3)})`;

    // Палец качается как маятник: движение мыши его толкает,
    // дальше он сам раскачивается туда-сюда и постепенно затухает
    const mdx = mx - lastMx; lastMx = mx;
    if (!reducedMotion.matches) hVel += Math.max(-4, Math.min(4, mdx * 0.12));
    hVel = (hVel - hAng * 0.045) * 0.93;
    hAng = Math.max(-20, Math.min(20, hAng + hVel));
    if (reducedMotion.matches) hAng = hVel = 0;
    if (!idle && isHand) hand.style.transform = `translate3d(${mx}px, ${my}px, 0) rotate(${hAng.toFixed(1)}deg)`;

    // Пока всё не успокоилось, продолжаем анимацию, потом засыпаем до следующего движения мыши
    if (Math.abs(gx - rx) > 0.1 || Math.abs(gy - ry) > 0.1 || speed > 0.05 ||
        Math.abs(hAng) > 0.05 || Math.abs(hVel) > 0.05 ) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function onDown(e) {
    if (!cfg.enabled || e.pointerType === 'touch') return;
    root.classList.add('fc-down');
    if (cfg.ripple && !reducedMotion.matches && !root.classList.contains('fc-text') && !root.classList.contains('fc-idle')) {
      const r = document.createElement('div');
      r.className = 'fc-ripple';
      r.style.setProperty('--fc-at', `translate(${e.clientX}px, ${e.clientY}px)`);
      r.addEventListener('animationend', () => r.remove());
      root.appendChild(r);
    }
  }

  function onUp() { root.classList.remove('fc-down'); }

  function onLeave(e) {
    if (!e.relatedTarget) { setCls('fc-hidden', true); restoreCursor(); overEl = null; }
  }

  function init() {
    build();
    fcLoadSettings(s => { cfg = { ...cfg, ...s }; applySettings(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const k in changes) cfg[k] = changes[k].newValue;
      applySettings();
    });
    const opts = { capture: true, passive: true };
    addEventListener('pointermove', onMove, opts);
    addEventListener('pointerdown', onDown, opts);
    addEventListener('pointerup', onUp, opts);
    addEventListener('mouseover', onOver, opts);
    document.addEventListener('mouseout', onLeave, opts);
    addEventListener('blur', () => setCls('fc-hidden', true));
    // При прокрутке и смене размера кнопка сдвигается — пересчитаем её размеры
    const refreshRect = () => { if (linkRect) linkRect = linkEl.getBoundingClientRect(); };
    addEventListener('scroll', refreshRect, opts);
    addEventListener('resize', refreshRect, opts);
  }

  if (document.documentElement) init();
  else document.addEventListener('readystatechange', init, { once: true });
})();
