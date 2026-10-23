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
  let tiltEl = null, tiltOrig = '';
  let hand, lastMx = -100;
  let hAng = 0, hVel = 0;     // наклон пальца и его скорость — пружина
  // Рука-указатель; кончик пальца (точка клика) — в (13.5, 2) из 32×32
  const HAND_SVG = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M11 15V4.5a2.5 2.5 0 0 1 5 0V12a2.5 2.5 0 0 1 5 0v1a2.5 2.5 0 0 1 5 0v1.5a2.3 2.3 0 0 1 4 1.5V21' +
    'c0 6-4 10-9.5 10H18c-4 0-6-1.8-8.2-5L5.3 19.6a2.3 2.3 0 0 1 3.6-2.9L11 19Z" ' +
    'fill="var(--fc-color)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M16 12v6M21 13v5M26 14.5v3.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></svg>';

  function build() {
    root = document.createElement('div');
    root.id = 'fc-root';
    root.className = 'fc-hidden';
    root.setAttribute('aria-hidden', 'true');
    ring = document.createElement('div');
    ring.className = 'fc-ring';
    dot = document.createElement('div');
    dot.className = 'fc-dot';
    hand = document.createElement('div');
    hand.className = 'fc-hand';
    hand.innerHTML = HAND_SVG;
    root.append(ring, dot, hand);
  }

  function mount() {
    // Некоторые сайты пересобирают документ — возвращаем курсор на место
    if (!root.isConnected) document.documentElement.appendChild(root);
  }

  function applySettings() {
    root.style.setProperty('--fc-color', cfg.color);
    root.style.setProperty('--fc-size', cfg.size + 'px');
    root.classList.remove('fc-style-ring', 'fc-style-dot', 'fc-style-blend', 'fc-style-hand');
    root.classList.add('fc-style-' + cfg.style);
    root.classList.toggle('fc-mode-hover', cfg.mode === 'hover');
    if (!cfg.tilt) untilt();
    if (cfg.enabled) {
      mount();
      updateActive();
    } else {
      document.documentElement.classList.remove('fc-on');
      untilt();
      root.remove();
    }
  }

  // В режиме hover системный курсор прячется только над ссылками и кнопками
  function updateActive() {
    const active = cfg.enabled && seen && (cfg.mode !== 'hover' || !!linkEl);
    document.documentElement.classList.toggle('fc-on', active);
    root.classList.toggle('fc-idle', !active);
  }

  function untilt() {
    if (!tiltEl) return;
    const el = tiltEl;
    el.style.transform = tiltOrig;
    setTimeout(() => { if (el !== tiltEl) el.style.transition = el.__fcTr || ''; }, 250);
    tiltEl = null;
  }

  function applyTilt() {
    if (!cfg.tilt || !linkEl || reducedMotion.matches) return untilt();
    const r = linkEl.getBoundingClientRect();
    if (r.width > 400 || r.height > 200) return untilt();
    if (tiltEl !== linkEl) {
      untilt();
      tiltEl = linkEl;
      tiltOrig = linkEl.style.transform;
      linkEl.__fcTr = linkEl.style.transition;
      linkEl.style.transition = 'transform .15s ease-out';
    }
    const px = (mx - r.left) / r.width - 0.5;   // -0.5…0.5
    const py = (my - r.top) / r.height - 0.5;
    const base = tiltOrig && tiltOrig !== 'none' ? tiltOrig + ' ' : '';
    linkEl.style.transform = `${base}perspective(500px) rotateX(${(-py * 18).toFixed(2)}deg) rotateY(${(px * 18).toFixed(2)}deg) scale(1.04)`;
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
      untilt();
      updateActive();
      return;
    }
    root.classList.remove('fc-text');
    const prev = linkEl;
    linkEl = el.closest ? el.closest(LINK_SEL) : null;
    root.classList.toggle('fc-link', !!linkEl);
    if (linkEl && !prev && cfg.mode === 'hover') { rx = mx; ry = my; vx = vy = 0; }
    if (!linkEl) untilt();
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
    const dx = (gx - rx) * k, dy = (gy - ry) * k;
    rx += dx; ry += dy;
    vx += (dx - vx) * 0.35; vy += (dy - vy) * 0.35;
    // Наклон: кольцо поворачивается по направлению движения и вытягивается от скорости
    const speed = Math.hypot(vx, vy);
    const st = reducedMotion.matches ? 0 : Math.min(speed / 40, 0.45);
    const ang = Math.atan2(vy, vx) * 180 / Math.PI;
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) rotate(${ang.toFixed(1)}deg) scale(${(1 + st).toFixed(3)}, ${(1 - st * 0.6).toFixed(3)})`;
    if (linkEl) applyTilt();

    // Палец: наклоняется в сторону движения и качается на пружине
    const mdx = mx - lastMx; lastMx = mx;
    const target = reducedMotion.matches ? 0 : Math.max(-35, Math.min(35, mdx * 2.2));
    hVel = (hVel + (target - hAng) * 0.2) * 0.72;
    hAng += hVel;
    hand.style.transform = `translate3d(${mx}px, ${my}px, 0) rotate(${hAng.toFixed(2)}deg)`;

    // Пока кольцо не догнало мышь, продолжаем анимацию, потом засыпаем
    if (Math.abs(gx - rx) > 0.1 || Math.abs(gy - ry) > 0.1 || speed > 0.05 || linkEl ||
        Math.abs(hAng) > 0.05 || Math.abs(hVel) > 0.05) {
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
    if (!e.relatedTarget) { root.classList.add('fc-hidden'); untilt(); }
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
