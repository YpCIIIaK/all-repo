// Общие настройки для страницы и всплывающего окна.
var FC_DEFAULTS = {
  enabled: true,
  mode: 'hover',      // hover — свой курсор только над ссылками и кнопками, always — везде
  style: 'hand',      // hand — палец, ring — кольцо с точкой, dot — одна точка, blend — инвертирующий круг
  color: '#7c5cff',
  size: 28,           // диаметр кольца в пикселях
  lag: 0.18,          // плавность следования кольца: 1 — без задержки
  ripple: true,       // волна при клике
  magnetic: true,     // притяжение к кнопкам и ссылкам
  tilt: false         // кнопка наклоняется к курсору (на тяжёлых сайтах тормозит)
};

function fcLoadSettings(cb) {
  chrome.storage.sync.get(FC_DEFAULTS, cb);
}
