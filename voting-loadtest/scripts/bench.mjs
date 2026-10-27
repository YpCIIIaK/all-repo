// Скорость одного ядра на работе, похожей на работу API: разбор и сборка JSON, HMAC, строки.
// Запускайте одинаково на ноутбуке и на VPS — отношение результатов и есть пересчётный коэффициент:
//
//   docker run --rm --cpuset-cpus 0 -v "$PWD/scripts":/s:ro node:20-alpine node /s/bench.mjs
//
// Печатает одно число — операций в секунду на одном ядре (медиана пяти секундных замеров).
import { createHmac } from 'node:crypto';

const body = JSON.stringify({
  query: 'mutation($p: String!, $c: String!) { verifyCode(phone: $p, code: $c) { token } }',
  variables: { p: '+79001234567', c: '123456' },
});

function unit(i) {
  const req = JSON.parse(body);
  const token = createHmac('sha256', 'bench').update(`${req.variables.p}:${req.variables.c}:${i}`).digest('base64url');
  return JSON.stringify({ data: { verifyCode: { token } } }).length;
}

function opsDuring(ms) {
  const end = performance.now() + ms;
  let n = 0;
  let sink = 0;
  while (performance.now() < end) {
    for (let k = 0; k < 200; k++) sink += unit(n++);
  }
  if (sink < 0) console.log(sink); // не даём оптимизатору выбросить работу
  return (n * 1000) / ms;
}

opsDuring(1000); // разогрев JIT
const runs = Array.from({ length: 5 }, () => opsDuring(1000)).sort((a, b) => a - b);
console.log(Math.round(runs[2]));
