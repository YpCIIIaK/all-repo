'use strict';
/* Физлаб · справочные данные: материалы, гравитация, темы, иконки */

const MATERIALS = {
  wood:   { title: 'Дерево',    density: 0.7,  friction: 0.6,  restitution: 0.15, color: '#d08c5a' },
  metal:  { title: 'Металл',    density: 7.8,  friction: 0.4,  restitution: 0.1,  color: '#a7b1bf' },
  stone:  { title: 'Камень',    density: 2.5,  friction: 0.8,  restitution: 0.05, color: '#8d96a3' },
  rubber: { title: 'Резина',    density: 1.2,  friction: 0.95, restitution: 0.75, color: '#ff6b6b' },
  ice:    { title: 'Лёд',       density: 0.9,  friction: 0.02, restitution: 0.05, color: '#a5d8ff' },
  bouncy: { title: 'Супермяч',  density: 1,    friction: 0.6,  restitution: 0.95, color: '#da77f2' },
  foam:   { title: 'Пенопласт', density: 0.05, friction: 0.7,  restitution: 0.2,  color: '#fff3bf' },
  glass:  { title: 'Стекло',    density: 2.6,  friction: 0.3,  restitution: 0.4,  color: '#96f2d7' },
};

const GRAVITY_PRESETS = [
  { id: 'earth',   label: 'Земля',      g: 9.81 },
  { id: 'moon',    label: 'Луна',       g: 1.62 },
  { id: 'mars',    label: 'Марс',       g: 3.71 },
  { id: 'jupiter', label: 'Юпитер',     g: 24.79 },
  { id: 'zero',    label: 'Невесомость', g: 0 },
];

const THEMES = {
  dark: {
    bg0: '#0b1020', bg1: '#141b2e', grid: 'rgba(160,180,255,0.045)', gridMajor: 'rgba(160,180,255,0.09)',
    axis: 'rgba(245,165,36,0.12)', staticFill: '#2b3450', staticStroke: '#4a567a',
    joint: '#e8ecf6', jointDim: 'rgba(232,236,246,0.55)', text: '#c7cfe2', accent: '#f5a524',
    contact: '#ff5c7a', vel: '#3ddc97', select: '#ffffff', ghost: 'rgba(245,165,36,0.18)', ghostStroke: '#f5a524',
    label: 'rgba(230,235,250,0.9)',
  },
  light: {
    bg0: '#eef2fb', bg1: '#f8faff', grid: 'rgba(40,60,120,0.06)', gridMajor: 'rgba(40,60,120,0.12)',
    axis: 'rgba(198,106,0,0.14)', staticFill: '#9aa6bf', staticStroke: '#6f7c98',
    joint: '#2a3248', jointDim: 'rgba(42,50,72,0.55)', text: '#2a3248', accent: '#c66a00',
    contact: '#e03131', vel: '#0ca678', select: '#1c2340', ghost: 'rgba(198,106,0,0.14)', ghostStroke: '#c66a00',
    label: 'rgba(30,36,60,0.9)',
  },
};

/* Иконки 24×24, обводка currentColor */
const ICONS = {
  play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.4-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  step: '<path d="M5 5.5v13l9-6.5z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  select: '<path d="M5 3.5 18.5 11l-6 1.6L9.6 19z" stroke-linejoin="round"/>',
  sling: '<circle cx="7" cy="17" r="3"/><path d="M9.2 14.8 19 5"/><path d="M13.5 5H19v5.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/><path d="M12 12h8"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="1.5"/>',
  polygon: '<path d="M12 3.5 19.6 8v8L12 20.5 4.4 16V8z" stroke-linejoin="round"/>',
  wall: '<path d="M3 17 21 8" stroke-width="3.2"/><path d="M5 20l2-2M9 18l2-2M13 16l2-2M17 14l2-2" stroke-width="1.3"/>',
  spring: '<path d="M3 12h3l1.5-5 3 10 3-10 3 10 1.5-5h3"/>',
  rod: '<circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="5.5" r="2.2"/><path d="M7.2 16.8 16.8 7.2" stroke-width="2.4"/>',
  rope: '<circle cx="5" cy="5" r="1.8"/><path d="M6.4 6.4c3 4 0 7 3 10s7 1 9.6 3.6"/>',
  hinge: '<circle cx="12" cy="12" r="3.2"/><path d="M4 20l5.8-5.8M20 4l-5.8 5.8"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  explode: '<path d="m12 2.5 1.9 5.3 5.1-2.4-2.3 5.1 5.3 1.9-5.3 1.9 2.3 5.1-5.1-2.4-1.9 5.3-1.9-5.3-5.1 2.4 2.3-5.1-5.3-1.9 5.3-1.9L5 5.4l5.1 2.4z" stroke-linejoin="round"/>',
  magnet: '<path d="M6 4h4v8a2 2 0 0 0 4 0V4h4v8a6 6 0 0 1-12 0z" stroke-linejoin="round"/><path d="M6 8h4M14 8h4"/>',
  eraser: '<path d="M8 20h12"/><path d="m4.6 14.6 8.8-8.8a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L11 17.8H7.8l-3.2-3.2z" stroke-linejoin="round"/><path d="m9 10 5 5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  pin: '<path d="M12 21v-6M7 15h10l-1.5-4V5h1V3h-9v2h1v6z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 1h13v-3"/>',
};

function icon(name, cls) {
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
