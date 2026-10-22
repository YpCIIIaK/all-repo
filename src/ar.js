/* ==========================================================================
   Ясень · примерка в дополненной реальности и экспорт 3D-моделей
   iPhone/iPad — AR Quick Look (USDZ), Android — WebXR с поиском пола,
   компьютер — QR-код, чтобы открыть ту же модель на телефоне. Модули грузятся по требованию.
   ========================================================================== */

import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { merge, finalize } from './geo.js';

export const canQuickLook = () => { try { return document.createElement('a').relList.supports('ar'); } catch { return false; } };
export async function canWebXR() {
  try { return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch { return false; }
}
// Проверяем поддержку заранее, при загрузке модуля: по нажатию кнопки на это уже не будет времени.
let xrSupport = null;
canWebXR().then((v) => { xrSupport = v; });

/* ------------------------------ подготовка модели к экспорту ------------------------------ */

// Копия без служебных объектов; размножаемые листья превращаются в одну обычную геометрию.
function prepare(source, { flattenInstances = false } = {}) {
  const root = source.clone(true);
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const drop = [];
  root.traverse((o) => {
    const u = o.userData || {};
    if (!o.visible || u.hl || u.niche || u.noBounds || o.isLight || o.isLine || o.isLineSegments) drop.push(o);
    else if (o.isMesh && o.material?.transparent && o.material.opacity < 0.2) drop.push(o);
  });
  for (const o of drop) o.parent?.remove(o);
  if (flattenInstances) {
    const inst = [];
    root.traverse((o) => { if (o.isInstancedMesh) inst.push(o); });
    for (const im of inst) {
      // для USDZ (текстовый формат) берём упрощённую копию: октаэдр по габаритам исходной геометрии
      im.geometry.computeBoundingBox();
      const bb = im.geometry.boundingBox, size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
      const base = finalize(new THREE.OctahedronGeometry(0.5, 0).scale(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z), { uv: 'keep' });
      const parts = [], m = new THREE.Matrix4();
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); parts.push(base.clone().applyMatrix4(m)); }
      const mat = im.material.clone();
      if (im.instanceColor) { const c = new THREE.Color(); im.getColorAt(0, c); mat.color.copy(c); }
      const mesh = new THREE.Mesh(merge(parts), mat);
      mesh.position.copy(im.position); mesh.quaternion.copy(im.quaternion); mesh.scale.copy(im.scale);
      im.parent.add(mesh); im.parent.remove(im);
    }
  }
  const scene = new THREE.Scene();
  scene.add(root);
  return scene;
}

export async function exportGLB(object) {
  const { GLTFExporter } = await import('../vendor/three/addons/GLTFExporter.js');
  const data = await new GLTFExporter().parseAsync(prepare(object), { binary: true, onlyVisible: true });
  return new Blob([data], { type: 'model/gltf-binary' });
}

export async function exportUSDZ(object) {
  const { USDZExporter } = await import('../vendor/three/addons/USDZExporter.js');
  const data = await new USDZExporter().parseAsync(prepare(object, { flattenInstances: true }), { quickLookCompatible: true });
  return new Blob([data], { type: 'model/vnd.usdz+zip' });
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------ AR Quick Look ------------------------------ */

async function quickLook(object, title) {
  const url = URL.createObjectURL(await exportUSDZ(object));
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url + '#allowsContentScaling=0&checkoutTitle=' + encodeURIComponent(title);
  a.appendChild(document.createElement('img'));
  a.click();
}

/* ------------------------------ WebXR: пол, прицел, касание — поставить ------------------------------ */

/*
 * Браузер разрешает включить камеру только сразу после касания. Поэтому сессия
 * запрашивается первой, до подготовки модели и сцены.
 */
async function webXR(object, title) {
  const overlay = document.createElement('div');
  overlay.className = 'xr-overlay';
  overlay.innerHTML = `<div class="xr-top"><b>${title}</b><button data-x="close">Закрыть</button></div>
    <div class="xr-hint">Наведите камеру на пол и коснитесь экрана, чтобы поставить</div>
    <div class="xr-bottom"><button data-x="rotl">↺ 45°</button><button data-x="rotr">↻ 45°</button></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('beforexrselect', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
  } catch (e) { overlay.remove(); throw e; }
  try { await runSession(session, overlay, object); }
  catch (e) { try { await session.end(); } catch { /* уже закрыта */ } overlay.remove(); throw e; }
}

async function runSession(session, overlay, object) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.xr.enabled = true;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight('#ffffff', '#bbbbbb', 0.6));
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 40);
  const model = prepare(object).children[0];
  model.visible = false;
  scene.add(model);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  reticle.matrixAutoUpdate = false; reticle.visible = false;
  scene.add(reticle);

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  const hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    model.position.setFromMatrixPosition(reticle.matrix);
    model.visible = true;
    overlay.querySelector('.xr-hint').textContent = 'Касание — переставить, кнопки внизу — повернуть';
  });
  overlay.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'close') session.end();
    if (x === 'rotl') model.rotation.y += Math.PI / 4;
    if (x === 'rotr') model.rotation.y -= Math.PI / 4;
  });
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    hitSource.cancel?.();
    renderer.dispose();
    overlay.remove();
  });
  renderer.setAnimationLoop((t, frame) => {
    if (frame) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) { reticle.visible = true; reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix); }
      else reticle.visible = false;
    }
    renderer.render(scene, camera);
  });
}

/* ------------------------------ окно для компьютера ------------------------------ */

async function qrSVG(text) {
  const { default: qrcode } = await import('../vendor/qrcode/qrcode.mjs');
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

const ARCORE = 'https://play.google.com/store/apps/details?id=com.google.ar.core';
const UA = navigator.userAgent;
const android = /android/i.test(UA);
// у Redmi по умолчанию Mi Browser, у Samsung — свой: WebXR там нет, только в Chrome
const realChrome = /Chrome\/\d/.test(UA) && !/MiuiBrowser|XiaoMi|EdgA|OPR|SamsungBrowser|YaBrowser|Firefox|UCBrowser|HeyTap|; wv\)/i.test(UA);
const inChrome = (u) => `intent://${u.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;

async function fallbackModal(object, { title, url, icon, mobile, reason }) {
  if (typeof url === 'function') url = await url();
  const arUrl = url + (url.includes('?') ? '&' : '?') + 'ar=1';
  const wrap = document.createElement('div');
  wrap.className = 'modal ar-modal';
  wrap.innerHTML = `<div class="modal-card">
    <button class="icon-btn modal-x" data-close aria-label="Закрыть">${icon('close')}</button>
    <div class="eyebrow">Примерка дома</div><h2>Поставьте у себя в комнате</h2>
    ${mobile ? (android ? `<p>Для примерки на Android нужны браузер <b>Chrome</b> и приложение <b>«Сервисы Google Play для AR»</b> (ARCore). Если сайт открыт в другом браузере, откройте его в Chrome.</p>
      ${realChrome ? '' : `<p><a class="btn btn-primary btn-sm" href="${inChrome(arUrl)}">Открыть в Chrome</a></p>`}
      <p><a class="btn ${realChrome ? 'btn-primary' : 'btn-ghost'} btn-sm" href="${ARCORE}" target="_blank" rel="noopener">Установить «Сервисы Google Play для AR»</a></p>
      <p class="muted">Без AR модель всё равно можно скачать и открыть в любом 3D-просмотрщике.</p>` : '<p class="muted">Этот браузер не поддерживает дополненную реальность. Скачайте модель — её откроет приложение «Файлы» или любой 3D-просмотрщик.</p>')
      : `<div class="ar-qr"><div class="qr" id="arQr"></div><div><p>Наведите камеру телефона на код. На iPhone модель откроется в AR Quick Look, на Android — в браузере с камерой: поставьте её на пол в натуральную величину.</p><p class="muted">Модель строится прямо в браузере телефона — ничего устанавливать не нужно.</p></div></div>`}
    <div class="row-btns"><button class="btn btn-ghost btn-sm" data-dl="glb">${icon('cube')} Скачать GLB</button><button class="btn btn-ghost btn-sm" data-dl="usdz">${icon('cube')} Скачать USDZ</button></div>
    <p class="fine">GLB подходит для Blender, SketchUp и веб-просмотрщиков, USDZ — для устройств Apple. Размеры — в метрах, 1:1.</p>
    ${reason ? `<p class="fine">Техническая причина: ${String(reason.name || '')} ${String(reason.message || reason).replace(/[<>&]/g, '')}</p>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  const esc = (e) => { if (e.key === 'Escape') { wrap.remove(); removeEventListener('keydown', esc); } };
  addEventListener('keydown', esc);
  if (!mobile) $q(wrap, '#arQr').innerHTML = await qrSVG(arUrl);
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
    const dl = e.target.closest('[data-dl]')?.dataset.dl;
    if (!dl) return;
    const btn = e.target.closest('button'); btn.disabled = true;
    try { save(dl === 'glb' ? await exportGLB(object) : await exportUSDZ(object), `${slug(title)}.${dl}`); } finally { btn.disabled = false; }
  });
}
const $q = (r, s) => r.querySelector(s);
const slug = (s) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '') || 'model';

/**
 * Главная точка входа: выбирает лучший способ показать модель в комнате.
 * object — THREE.Object3D в метрах, начало координат на полу.
 */
export async function openAR(object, { title = 'Мебель', url = location.href, icon = () => '' } = {}) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  try {
    if (canQuickLook()) return await quickLook(object, title);
    if (xrSupport ?? await canWebXR()) return await webXR(object, title);
  } catch (e) {
    // не вышло — показываем запасной путь и причину, а не просто ошибку
    console.warn('AR:', e);
    return fallbackModal(object, { title, url, icon, mobile, reason: e });
  }
  return fallbackModal(object, { title, url, icon, mobile });
}

// Страница открыта по QR-коду: просим одно касание — без него браузер не откроет AR.
export function arPrompt(run, icon = () => '') {
  const bar = document.createElement('div');
  bar.className = 'ar-prompt';
  bar.innerHTML = `<span>Модель готова к примерке</span><button class="btn btn-primary btn-sm">${icon('ar')} Поставить в комнате</button><button class="icon-btn" aria-label="Закрыть">${icon('close')}</button>`;
  document.body.appendChild(bar);
  bar.querySelector('.btn').onclick = () => { bar.remove(); run(); };
  bar.querySelector('.icon-btn').onclick = () => bar.remove();
  return bar;
}

export { exportGLB as glb, exportUSDZ as usdz, save as saveBlob };
