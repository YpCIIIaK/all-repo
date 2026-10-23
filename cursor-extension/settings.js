// Общие настройки для страницы и всплывающего окна.
var FC_DEFAULTS = {
  enabled: true,
  style: 'ring',      // ring — кольцо с точкой, dot — одна точка, blend — инвертирующий круг
  color: '#7c5cff',
  size: 28,           // диаметр кольца в пикселях
  lag: 0.18,          // плавность следования кольца: 1 — без задержки
  ripple: true,       // волна при клике
  magnetic: true      // притяжение к кнопкам и ссылкам
};

function fcLoadSettings(cb) {
  chrome.storage.sync.get(FC_DEFAULTS, cb);
}
