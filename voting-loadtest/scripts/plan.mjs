// Расчёт до запуска: какая нагрузка придёт на сервер, выдержит ли СМС-провайдер,
// сколько виртуальных пользователей понадобится k6 при ускорении.
//
//   node scripts/plan.mjs scenarios/realistic.env [scenarios/pessimistic.env ...]
//
// Очередь СМС считается «жидкостной» моделью с шагом 1 с: люди приходят по профилю,
// провайдер пропускает SMS_RATE·(1 − SMS_ERROR_RATE) в секунду (ошибки уходят на повтор), во время сбоя — 0.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { REAL_DURATION_SEC, buildProfile, rateAt } from '../k6/profile.js';

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=([^#]*)/);
    if (m) env[m[1]] = m[2].trim();
  }
  return { ...env, ...pick(process.env, Object.keys(env)) };
}
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const rangeAvg = (s) => {
  const [a, b = a] = String(s).split('-').map(Number);
  return (a + b) / 2;
};

/** FIFO-очередь СМС в реальном времени. Возвращает задержки отправки (с) по когортам пользователей. */
function simulateSms({ profile, ratePerSec, errorRate, outageAtSec, outageSec }) {
  const capacity = ratePerSec * (1 - errorRate);
  const arrived = [0];
  const served = [0];
  let queue = 0;
  let maxQueue = 0;
  for (let t = 0; ; t++) {
    const a = t < profile.durationSec ? rateAt(profile, t + 0.5) : 0;
    const out = outageSec > 0 && t >= outageAtSec && t < outageAtSec + outageSec;
    queue += a;
    const s = Math.min(queue, out ? 0 : capacity);
    queue -= s;
    maxQueue = Math.max(maxQueue, queue);
    arrived.push(arrived[t] + a);
    served.push(served[t] + s);
    if (t >= profile.durationSec && queue < 1e-6) break;
    if (t > profile.durationSec * 20) break; // провайдер не справляется вообще
  }
  // Для каждой секунды прихода — через сколько очередь дойдёт до этих людей.
  const cohorts = [];
  let j = 0;
  for (let t = 1; t <= profile.durationSec; t++) {
    while (j < served.length - 1 && served[j] + 1e-9 < arrived[t]) j++;
    cohorts.push({ users: arrived[t] - arrived[t - 1], lag: Math.max(0, j - t) });
  }
  const drainSec = served.length - 1 - profile.durationSec;
  return { cohorts, maxQueue, drainSec };
}

function percentile(cohorts, key, p) {
  const sorted = [...cohorts].sort((a, b) => a[key] - b[key]);
  const total = sorted.reduce((s, c) => s + c.users, 0);
  let acc = 0;
  for (const c of sorted) {
    acc += c.users;
    if (acc >= total * p) return c[key];
  }
  return sorted.length ? sorted[sorted.length - 1][key] : 0;
}

function smsOutcome(env, profile, ratePerSec) {
  const delivery = rangeAvg(env.SMS_DELIVERY_MS ?? '2000-10000') / 1000;
  const sim = simulateSms({
    profile,
    ratePerSec,
    errorRate: Number(env.SMS_ERROR_RATE ?? 0),
    outageAtSec: Number(env.SMS_OUTAGE_AT ?? 0) * profile.durationSec,
    outageSec: Number(env.SMS_OUTAGE_SEC ?? 0),
  });
  const cohorts = sim.cohorts.map((c) => ({ ...c, wait: c.lag + delivery }));
  const patience = Number(env.SMS_PATIENCE_SEC ?? 180);
  const total = cohorts.reduce((s, c) => s + c.users, 0);
  const late = cohorts.filter((c) => c.wait > patience).reduce((s, c) => s + c.users, 0);
  return {
    ...sim,
    p95Wait: percentile(cohorts, 'wait', 0.95),
    maxWait: Math.max(...cohorts.map((c) => c.wait)),
    lateShare: total ? late / total : 0,
  };
}

/** Минимальный лимит провайдера, при котором p95 ожидания СМС укладывается в порог. */
function minSmsRate(env, profile) {
  const limit = Number(env.SMS_WAIT_P95_SEC ?? 120);
  let lo = 0.5;
  let hi = 2000;
  if (smsOutcome(env, profile, hi).p95Wait > limit) return null;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (smsOutcome(env, profile, mid).p95Wait <= limit) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

const fmt = (n, d = 1) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });
const fmtSec = (s) => (s >= 120 ? `${fmt(s / 60)} мин` : `${fmt(s, 0)} с`);

function report(file) {
  const env = readEnv(file);
  const name = basename(file, '.env');
  const totalVotes = Number(env.TOTAL_VOTES ?? 100000);
  const profileArgs = {
    totalVotes,
    peakX: Number(env.PEAK_X ?? 10),
    spikeFrac: Number(env.SPIKE_FRAC ?? 0.02),
    rampFrac: Number(env.RAMP_FRAC ?? 0.01),
  };
  const real = buildProfile({ ...profileArgs, durationSec: REAL_DURATION_SEC });
  const smsRate = Number(env.SMS_RATE ?? 20);
  const sms = smsOutcome(env, real, smsRate);
  const needRate = minSmsRate(env, real);
  const viewers = Number(env.VIEWERS_PER_SEC ?? 5);
  // На одного избирателя 3 запроса к API: requestCode, verifyCode, castVote.
  const peakRps = real.peak * 3 + viewers;
  const spikeSec = profileArgs.spikeFrac * REAL_DURATION_SEC;

  const lines = [];
  lines.push(`\n## ${name}\n`);
  lines.push(`Поток: в среднем ${fmt(real.avg, 2)} голосов/с, в середине дня ${fmt(real.base, 2)}, на пиках ${fmt(real.peak, 1)} ` +
    `(пики по ${fmtSec(spikeSec)} в начале и в конце).`);
  lines.push(`API на пике: ≈ ${fmt(peakRps, 0)} запросов/с (3 на голос + ${viewers}/с просмотров результатов).\n`);
  lines.push(`СМС при лимите провайдера ${smsRate}/с и ${fmt(Number(env.SMS_ERROR_RATE ?? 0) * 100)} % ошибок` +
    (Number(env.SMS_OUTAGE_SEC) ? `, сбой ${fmtSec(Number(env.SMS_OUTAGE_SEC))}` : '') + ':');
  lines.push(`- наибольшая очередь: ${fmt(sms.maxQueue, 0)} СМС;`);
  lines.push(`- ожидание СМС: p95 ${fmtSec(sms.p95Wait)}, худшее ${fmtSec(sms.maxWait)} (порог сценария ${fmtSec(Number(env.SMS_WAIT_P95_SEC ?? 120))});`);
  lines.push(`- не дождутся за ${fmtSec(Number(env.SMS_PATIENCE_SEC ?? 180))}: ${fmt(sms.lateShare * 100, 1)} % людей;`);
  lines.push(`- очередь опустеет через ${fmtSec(Math.max(0, sms.drainSec))} после закрытия;`);
  lines.push(`- нужен лимит провайдера не меньше ${needRate === null ? '— (порог недостижим из-за сбоя)' : `${needRate} СМС/с`}.\n`);

  lines.push('| Лимит провайдера, СМС/с | 20 | 30 | 50 | 70 | 100 | 150 | 200 |');
  lines.push('|---|---|---|---|---|---|---|---|');
  const rates = [20, 30, 50, 70, 100, 150, 200].map((r) => smsOutcome(env, real, r));
  lines.push(`| Ожидание СМС, p95 | ${rates.map((o) => fmtSec(o.p95Wait)).join(' | ')} |`);
  lines.push(`| Не дождутся | ${rates.map((o) => `${fmt(o.lateShare * 100, 1)} %`).join(' | ')} |\n`);

  lines.push('| Длительность теста | Ускорение | Пик голосов/с | Пик запросов к API/с | VU для k6 (оценка) |');
  lines.push('|---|---|---|---|---|');
  const net = Number(env.NET_DELAY_MS ?? 0) / 1000;
  const apiTime = 5 * (net + 0.05); // 4 запроса + TLS-рукопожатие, без ускорения
  for (const [label, sec] of [['3 ч', 10800], ['1 ч', 3600], ['30 мин', 1800], ['15 мин', 900], ['10 мин', 600]]) {
    const k = REAL_DURATION_SEC / sec;
    // Закон Литтла: VU = поток × время в системе. Ожидание СМС ускоряется вместе с потоком (их произведение
    // не зависит от k), а запросы к API — нет. Дольше двух «терпений» никто не ждёт: после этого уходит.
    const wait = Math.min(sms.p95Wait, 2 * Number(env.SMS_PATIENCE_SEC ?? 180));
    const vus = real.peak * (wait + k * apiTime);
    const max = Number(env.MAX_VUS ?? 4000);
    lines.push(`| ${label} | ×${fmt(k, 1)} | ${fmt(real.peak * k, 0)} | ${fmt(peakRps * k, 0)} | ${fmt(vus, 0)}${vus > max ? ` ⚠️ больше MAX_VUS=${max}` : ''} |`);
  }
  return lines.join('\n');
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Использование: node scripts/plan.mjs scenarios/<имя>.env [...]');
  process.exit(1);
}
console.log('# Расчёт нагрузки (реальное время голосования — 3 часа)');
for (const f of files) console.log(report(f));
