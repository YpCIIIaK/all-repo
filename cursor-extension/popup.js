const $ = id => document.getElementById(id);

function save(patch) {
  chrome.storage.sync.set(patch);
}

function render(s) {
  $('enabled').checked = s.enabled;
  $('color').value = s.color;
  $('size').value = s.size;
  $('sizeOut').textContent = s.size + ' px';
  $('lag').value = s.lag;
  $('lagOut').textContent = s.lag >= 1 ? 'без задержки' : Math.round((1 - s.lag) * 100) + '%';
  $('ripple').checked = s.ripple;
  $('magnetic').checked = s.magnetic;
  $('tilt').checked = s.tilt;
  for (const b of $('style').children) b.classList.toggle('on', b.dataset.v === s.style);
  for (const b of $('mode').children) b.classList.toggle('on', b.dataset.v === s.mode);
}

let state;
fcLoadSettings(s => { state = s; render(state); });

function set(patch) {
  state = { ...state, ...patch };
  render(state);
  save(patch);
}

$('enabled').addEventListener('change', e => set({ enabled: e.target.checked }));
$('color').addEventListener('input', e => set({ color: e.target.value }));
$('size').addEventListener('input', e => set({ size: +e.target.value }));
$('lag').addEventListener('input', e => set({ lag: +e.target.value }));
$('ripple').addEventListener('change', e => set({ ripple: e.target.checked }));
$('magnetic').addEventListener('change', e => set({ magnetic: e.target.checked }));
$('tilt').addEventListener('change', e => set({ tilt: e.target.checked }));
$('mode').addEventListener('click', e => {
  if (e.target.dataset.v) set({ mode: e.target.dataset.v });
});
$('style').addEventListener('click', e => {
  if (e.target.dataset.v) set({ style: e.target.dataset.v });
});
$('reset').addEventListener('click', () => set({ ...FC_DEFAULTS }));
