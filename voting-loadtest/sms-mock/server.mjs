// Заглушка СМС-провайдера. Без зависимостей: node server.mjs.
//
// POST /send {phone, text}  — «отправить СМС»: задержка ответа, лимит в секунду (429),
//                             случайные ошибки (500), окно полного сбоя (503).
// GET  /inbox?phone=&after=&timeout= — «телефон»: long-poll до доставки СМС, новее after (мс).
// POST /control/start       — отметка начала теста, от неё отсчитывается окно сбоя.
// GET  /stats               — счётчики для сверки.
//
// Все длительности задаются в реальном времени и делятся на TIME_SCALE, лимит умножается на него.
import http from 'node:http';

const num = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
const range = (name, fallback) => {
  const [a, b = a] = (process.env[name] || fallback).split('-').map(Number);
  return [a, b];
};

const scale = num('TIME_SCALE', 1);
const rate = num('SMS_RATE', 20) * scale;
const [apiMin, apiMax] = range('SMS_API_LATENCY_MS', '50-300').map((ms) => ms / scale);
const [deliveryMin, deliveryMax] = range('SMS_DELIVERY_MS', '2000-10000').map((ms) => ms / scale);
const errorRate = num('SMS_ERROR_RATE', 0.02);
const durationSec = num('DURATION_SEC', 10800);
const outageAt = num('SMS_OUTAGE_AT', 0) * durationSec * 1000;
const outageFor = (num('SMS_OUTAGE_SEC', 0) * 1000) / scale;

let startedAt = Date.now();
const stats = { received: 0, accepted: 0, rejectedRate: 0, rejectedOutage: 0, errors: 0, delivered: 0 };
const smsPerPhone = new Map();
const inbox = new Map(); // phone → { code, deliveredAt }
const waiters = new Map(); // phone → Set<{ after, finish }>

// Лимит провайдера: «ведро токенов», не больше rate отправок в секунду.
let tokens = rate;
let refilledAt = Date.now();
function takeToken() {
  const now = Date.now();
  tokens = Math.min(rate, tokens + ((now - refilledAt) / 1000) * rate);
  refilledAt = now;
  if (tokens < 1) return false;
  tokens -= 1;
  return true;
}

const between = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deliver(phone, text) {
  const code = (text.match(/\d{6}/) || [''])[0];
  const msg = { code, deliveredAt: Date.now() };
  inbox.set(phone, msg);
  stats.delivered++;
  for (const w of waiters.get(phone) ?? []) if (msg.deliveredAt > w.after) w.finish(msg);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

async function send(req, res) {
  const { phone, text } = await readBody(req);
  stats.received++;
  await sleep(between(apiMin, apiMax));
  const t = Date.now() - startedAt;
  if (outageFor > 0 && t >= outageAt && t < outageAt + outageFor) {
    stats.rejectedOutage++;
    return json(res, 503, { error: 'provider outage' });
  }
  if (!takeToken()) {
    stats.rejectedRate++;
    return json(res, 429, { error: 'rate limit' });
  }
  if (Math.random() < errorRate) {
    stats.errors++;
    return json(res, 500, { error: 'random provider error' });
  }
  stats.accepted++;
  smsPerPhone.set(phone, (smsPerPhone.get(phone) ?? 0) + 1);
  setTimeout(() => deliver(phone, text), between(deliveryMin, deliveryMax));
  json(res, 200, { id: stats.accepted });
}

function waitInbox(url, req, res) {
  const phone = url.searchParams.get('phone');
  const after = Number(url.searchParams.get('after') || 0);
  const timeout = Number(url.searchParams.get('timeout') || 30_000);
  const ready = inbox.get(phone);
  if (ready && ready.deliveredAt > after) return json(res, 200, ready);

  const set = waiters.get(phone) ?? new Set();
  waiters.set(phone, set);
  const waiter = {
    after,
    finish(msg) {
      clearTimeout(timer);
      set.delete(waiter);
      if (set.size === 0) waiters.delete(phone);
      if (msg) json(res, 200, msg);
      else json(res, 204);
    },
  };
  const timer = setTimeout(() => waiter.finish(null), timeout);
  req.on('close', () => set.has(waiter) && (clearTimeout(timer), set.delete(waiter)));
  set.add(waiter);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://sms');
  if (req.method === 'POST' && url.pathname === '/send') {
    return send(req, res).catch((e) => json(res, 400, { error: String(e) }));
  }
  if (req.method === 'GET' && url.pathname === '/inbox') return waitInbox(url, req, res);
  if (req.method === 'POST' && url.pathname === '/control/start') {
    startedAt = Date.now();
    return json(res, 200, { startedAt });
  }
  if (req.method === 'GET' && url.pathname === '/stats') {
    let phonesWithRepeats = 0;
    for (const n of smsPerPhone.values()) if (n > 1) phonesWithRepeats++;
    return json(res, 200, { ...stats, phones: smsPerPhone.size, phonesWithRepeats });
  }
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  json(res, 404, { error: 'not found' });
});
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0;
server.listen(num('PORT', 8080), () =>
  console.log(
    `Заглушка СМС: ${rate.toFixed(1)} СМС/с, ошибки ${(errorRate * 100).toFixed(1)} %, ` +
      `доставка ${deliveryMin.toFixed(0)}–${deliveryMax.toFixed(0)} мс` +
      (outageFor ? `, сбой ${(outageFor / 1000).toFixed(0)} с через ${(outageAt / 1000).toFixed(0)} с после старта` : ''),
  ),
);
