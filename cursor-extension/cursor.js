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

  function build() {
    root = document.createElement('div');
    root.id = 'fc-root';
    root.className = 'fc-hidden';
    root.setAttribute('aria-hidden', 'true');
    ring = document.createElement('div');
    ring.className = 'fc-ring';
    dot = document.createElement('div');
    dot.className = 'fc-dot';
    root.append(ring, dot);
  }

  function mount() {
    // Некоторые сайты пересобирают документ — возвращаем курсор на место
    if (!root.isConnected) document.documentElement.appendChild(root);
  }

  function applySettings() {
    root.style.setProperty('--fc-color', cfg.color);
    root.style.setProperty('--fc-size', cfg.size + 'px');
    root.classList.remove('fc-style-ring', 'fc-style-dot', 'fc-style-blend');
    root.classList.add('fc-style-' + cfg.style);
    const html = document.documentElement;
    if (cfg.enabled) {
      mount();
      html.classList.toggle('fc-on', seen);
    } else {
      html.classList.remove('fc-on');
      root.remove();
    }
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

  function onOver(e) {
    if (!cfg.enabled) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    const el = t && t.nodeType === 1 ? t : e.target;
    if (isTextField(el)) {
      root.style.setProperty('--fc-text-h', textHeight(el) + 'px');
      root.classList.add('fc-text');
      root.classList.remove('fc-link');
      linkEl = null;
      return;
    }
    root.classList.remove('fc-text');
    linkEl = el.closest ? el.closest(LINK_SEL) : null;
    root.classList.toggle('fc-link', !!linkEl);
  }

  function onMove(e) {
    if (!cfg.enabled || e.pointerType === 'touch') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) {
      seen = true;
      rx = mx; ry = my;
      document.documentElement.classList.add('fc-on');
    }
    root.classList.remove('fc-hidden');
    mount();
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    // Магнит: кольцо слегка тянется к центру кнопки
    tx = 0; ty = 0;
    if (cfg.magnetic && linkEl && !reducedMotion.matches && linkEl.isConnected) {
      const r = linkEl.getBoundingClientRect();
      if (r.width < 400 && r.height < 200) {
        tx = (r.left + r.width / 2 - mx) * 0.3;
        ty = (r.top + r.height / 2 - my) * 0.3;
      }
    }
    const k = reducedMotion.matches ? 1 : cfg.lag;
    const gx = mx + tx, gy = my + ty;
    rx += (gx - rx) * k;
    ry += (gy - ry) * k;
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    // Пока кольцо не догнало мышь, продолжаем анимацию, потом засыпаем
    if (Math.abs(gx - rx) > 0.1 || Math.abs(gy - ry) > 0.1 || linkEl) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function onDown(e) {
    if (!cfg.enabled || e.pointerType === 'touch') return;
    root.classList.add('fc-down');
    if (cfg.ripple && !reducedMotion.matches && !root.classList.contains('fc-text')) {
      const r = document.createElement('div');
      r.className = 'fc-ripple';
      r.style.setProperty('--fc-at', `translate(${e.clientX}px, ${e.clientY}px)`);
      r.addEventListener('animationend', () => r.remove());
      root.appendChild(r);
    }
  }

  function onUp() { root.classList.remove('fc-down'); }

  function onLeave(e) {
    if (!e.relatedTarget) root.classList.add('fc-hidden');
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
    addEventListener('blur', () => root.classList.add('fc-hidden'));
  }

  if (document.documentElement) init();
  else document.addEventListener('readystatechange', init, { once: true });
})();
