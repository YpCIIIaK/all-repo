// Нагрузочный тест голосования. Одновременно работают несколько сценариев:
//   voters      — честные избиратели: запросить код → дождаться СМС → подтвердить → проголосовать;
//   viewers     — смотрят результаты;
//   bruteforce  — подбирают чужой код (10 параллельных попыток), должно не получиться;
//   sms_spam    — 5 параллельных запросов кода на один номер, СМС должна уйти одна.
//
// Все параметры приходят из переменных окружения (scenarios/*.env через run.sh).
// Длительности в .env — реальные; при ускорении (TIME_SCALE > 1) внешний мир ускоряется:
// поток людей ×TIME_SCALE, а ожидание СМС, терпение людей и паузы ÷TIME_SCALE.
import http from 'k6/http';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { buildProfile, k6Stages } from './profile.js';

const E = (name, fallback) => (__ENV[name] === undefined || __ENV[name] === '' ? fallback : __ENV[name]);
const N = (name, fallback) => Number(E(name, fallback));

const API = E('API_URL', 'https://nginx');
const SMS = E('SMS_URL', 'http://sms-mock:8080');
const SCALE = N('TIME_SCALE', 1);
const DURATION_SEC = N('DURATION_SEC', 10800);
const CANDIDATES = N('CANDIDATES', 5);
const scaled = (realSec, min = 0.05) => Math.max(min, realSec / SCALE);

const profile = buildProfile({
  totalVotes: N('TOTAL_VOTES', 100000),
  durationSec: DURATION_SEC,
  peakX: N('PEAK_X', 10),
  spikeFrac: N('SPIKE_FRAC', 0.02),
  rampFrac: N('RAMP_FRAC', 0.01),
});
const plan = k6Stages(profile);

// Стресс-режим (MODE=stress): вместо профиля дня — ступени нарастающего потока, чтобы найти предел сервера.
const MODE = E('MODE', 'profile');
// Скорости ступеней (голосов/с) считает run.sh: от ¼ до ×4 пика сценария, каждая ~на треть выше.
const stressRates = E('STRESS_RATES', '25,50,100,200').split(',').map(Number);
const STRESS_STEPS = stressRates.length;
const STRESS_STEP_SEC = N('STRESS_STEP_SEC', 45);
const STRESS_RAMP_SEC = 5;

const PATIENCE_SEC = scaled(N('SMS_PATIENCE_SEC', 180), 2);
const RETRY_WINDOW_SEC = scaled(N('RETRY_WINDOW_SEC', 60), 5);
const MAX_VUS = N('MAX_VUS', 4000);
// VU создаются заранее: пока k6 создаёт их на ходу, он пропускает запуски пользователей на пиках.
const DELIVERY_MAX_SEC = Number(E('SMS_DELIVERY_MS', '2000-10000').split('-').pop()) / 1000;
// Длительный прогон (MODE=soak): ровный поток SOAK_RATE голосов/с весь тест — ищем то, что копится со временем.
const SOAK_RATE = N('SOAK_RATE', 10);
const PHASES = ['start', 'middle', 'end'];
const PEAK_RATE = MODE === 'stress' ? stressRates[stressRates.length - 1] : MODE === 'soak' ? SOAK_RATE : profile.peak;
const PREALLOCATED_VUS = Math.min(MAX_VUS, Math.ceil(PEAK_RATE * (DELIVERY_MAX_SEC / SCALE + 3)));

// --- метрики ---
const votersStarted = new Counter('voters_started');
const userSuccess = new Rate('user_success');
const votesConfirmed = new Counter('votes_confirmed');
const votesUnconfirmed = new Counter('votes_unconfirmed');
const smsWait = new Trend('sms_wait', true);
const smsTimeouts = new Counter('sms_timeouts');
const voterFailures = new Counter('voter_failures');
const flowTime = new Trend('voter_flow', true);
const apiErrors = new Rate('api_errors');
const doubleVoteAttempts = new Counter('double_vote_attempts');
const doubleVoteExtra = new Counter('double_vote_extra');
const bruteforceAttempts = new Counter('bruteforce_attempts');
const bruteforceSuccess = new Counter('bruteforce_success');
const spamAttempts = new Counter('sms_spam_attempts');
const spamLeak = new Counter('sms_spam_leak');

const thresholds = {
  user_success: [`rate>=${N('SUCCESS_MIN', 0.99)}`],
  sms_wait: [`p(95)<${Math.round(scaled(N('SMS_WAIT_P95_SEC', 120)) * 1000)}`],
  bruteforce_success: ['count==0'],
  sms_spam_leak: ['count==0'],
  double_vote_extra: ['count==0'],
};
for (const op of ['requestCode', 'verifyCode', 'castVote', 'results']) {
  thresholds[`http_req_duration{op:${op}}`] = [`p(95)<${N('API_P95_MS', 800)}`];
}
// Пороги-заглушки нужны, чтобы k6 вывел в сводку счётчики по каждому варианту — по ним идёт сверка с базой.
for (let c = 1; c <= CANDIDATES; c++) thresholds[`votes_confirmed{candidate:${c}}`] = ['count>=0'];
for (const step of ['requestCode', 'smsTimeout', 'verifyCode:400', 'verifyCode:429', 'verifyCode:503', 'verifyCode:500', 'castVote']) {
  thresholds[`voter_failures{reason:${step}}`] = ['count>=0'];
}

// В стресс-режиме пороги по ступеням только выводят цифры в сводку, решение принимает verify.
if (MODE === 'stress') {
  for (let i = 0; i < STRESS_STEPS; i++) {
    thresholds[`user_success{step:${i}}`] = ['rate>=0'];
    thresholds[`voters_started{step:${i}}`] = ['count>=0'];
    thresholds[`api_errors{step:${i}}`] = ['rate>=0'];
    for (const op of ['requestCode', 'verifyCode', 'castVote']) thresholds[`http_req_duration{op:${op},step:${i}}`] = ['p(95)>=0'];
  }
}

// В длительном прогоне сравниваем треть начала, середины и конца: не замедляется ли сервер по мере роста базы.
if (MODE === 'soak') {
  for (const phase of PHASES) {
    for (const op of ['requestCode', 'verifyCode', 'castVote', 'results']) {
      thresholds[`http_req_duration{op:${op},phase:${phase}}`] = ['p(95)>=0'];
    }
  }
}

const perMinute = (realPerMin) => Math.max(1, Math.round(realPerMin * SCALE));

const stressScenarios = {
  voters: {
    executor: 'ramping-arrival-rate',
    exec: 'voter',
    startRate: 0,
    timeUnit: '1m',
    stages: stressRates.flatMap((r) => [
      { target: Math.round(r * 60), duration: `${STRESS_RAMP_SEC}s` },
      { target: Math.round(r * 60), duration: `${STRESS_STEP_SEC}s` },
    ]),
    preAllocatedVUs: PREALLOCATED_VUS,
    maxVUs: MAX_VUS,
    gracefulStop: `${Math.ceil(PATIENCE_SEC * 2 + RETRY_WINDOW_SEC * 3)}s`,
  },
};

const soakVoters = {
  executor: 'constant-arrival-rate',
  exec: 'voter',
  rate: Math.max(1, Math.round(SOAK_RATE * 60)),
  timeUnit: '1m',
  duration: `${DURATION_SEC}s`,
  preAllocatedVUs: PREALLOCATED_VUS,
  maxVUs: MAX_VUS,
  gracefulStop: `${Math.ceil(PATIENCE_SEC * 2 + RETRY_WINDOW_SEC * 3)}s`,
};

export const options = {
  insecureSkipTLSVerify: true, // самоподписанный сертификат тестового nginx
  noVUConnectionReuse: true, // каждый избиратель — новое соединение и TLS-рукопожатие, как в жизни
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  setupTimeout: '2m',
  thresholds,
  scenarios: MODE === 'stress' ? stressScenarios : {
    voters: MODE === 'soak' ? soakVoters : {
      executor: 'ramping-arrival-rate',
      exec: 'voter',
      startRate: 0,
      timeUnit: '1m',
      stages: plan.stages,
      preAllocatedVUs: PREALLOCATED_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: `${Math.ceil(PATIENCE_SEC * 2 + RETRY_WINDOW_SEC * 3)}s`,
    },
    viewers: {
      executor: 'constant-arrival-rate',
      exec: 'viewer',
      rate: perMinute(N('VIEWERS_PER_SEC', 5) * 60),
      timeUnit: '1m',
      duration: `${DURATION_SEC}s`,
      preAllocatedVUs: 20,
      maxVUs: 500,
    },
    bruteforce: {
      executor: 'constant-arrival-rate',
      exec: 'bruteforce',
      rate: perMinute(N('BRUTEFORCE_PER_MIN', 2)),
      timeUnit: '1m',
      duration: `${DURATION_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 200,
    },
    sms_spam: {
      executor: 'constant-arrival-rate',
      exec: 'smsSpam',
      rate: perMinute(N('SPAM_PER_MIN', 2)),
      timeUnit: '1m',
      duration: `${DURATION_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 200,
    },
  },
};

// --- запросы ---
const REQUEST_CODE = 'mutation($p: String!) { requestCode(phone: $p) { ok resendAfterSec } }';
const VERIFY_CODE = 'mutation($p: String!, $c: String!) { verifyCode(phone: $p, code: $c) { token } }';
const CAST_VOTE = 'mutation($c: Int!) { castVote(candidateId: $c) { accepted alreadyVoted } }';
const RESULTS = '{ results { total updatedAt candidates { candidateId votes } } }';

function gqlRequest(op, query, variables, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    method: 'POST',
    url: `${API}/graphql`,
    body: JSON.stringify({ query, variables }),
    params: { headers, tags: { op }, timeout: '30s' },
  };
}

/** Разбор ответа GraphQL: { data, code } — code: 0 успех, иначе HTTP-статус или extensions.code. */
function parse(res) {
  let body = null;
  try {
    body = res.json();
  } catch (_) {
    /* не JSON: обрыв, 502 от nginx */
  }
  const err = body && body.errors && body.errors[0];
  const code = res.status !== 200 ? res.status || 599 : err ? Number(err.extensions && err.extensions.code) || 500 : 0;
  apiErrors.add(code >= 500);
  return { data: body && body.data, code };
}

function gql(op, query, variables, token) {
  const r = gqlRequest(op, query, variables, token);
  return parse(http.request(r.method, r.url, r.body, r.params));
}

const retryable = (code) => code >= 500;

/** Как живой человек: при сбое сервера жмёт кнопку ещё раз, пока не кончится терпение. */
function withRetry(fn) {
  const deadline = Date.now() + RETRY_WINDOW_SEC * 1000;
  let pause = scaled(1);
  for (;;) {
    const r = fn();
    if (!retryable(r.code) || Date.now() + pause * 1000 > deadline) return r;
    sleep(pause);
    pause = Math.min(pause * 2, scaled(15));
  }
}

/** «Телефон»: ждём СМС новее since. Возвращает код или null. */
function waitSms(phone, since) {
  const res = http.get(`${SMS}/inbox?phone=${encodeURIComponent(phone)}&after=${since}&timeout=${Math.round(PATIENCE_SEC * 1000)}`, {
    tags: { op: 'smsInbox', name: 'sms-inbox' }, // name: иначе каждый номер в URL — отдельный ряд метрик
    timeout: `${Math.ceil(PATIENCE_SEC + 10)}s`,
  });
  return res.status === 200 ? res.json('code') : null;
}

const pad = (n, len) => String(n).padStart(len, '0');

/** Тег трети теста (начало, середина, конец) — для сравнения задержек в длительном прогоне. */
function tagPhase() {
  if (MODE !== 'soak') return;
  const third = Math.floor((exec.instance.currentTestRunDuration / 1000 / DURATION_SEC) * 3);
  exec.vu.metrics.tags.phase = PHASES[Math.min(2, Math.max(0, third))];
}

/** Неудача избирателя с причиной: на каком шаге он отвалился. */
function fail(reason) {
  voterFailures.add(1, { reason });
  userSuccess.add(false);
}
const randomCandidate = () => 1 + Math.floor(Math.random() * CANDIDATES);

export function setup() {
  http.post(`${SMS}/control/start`);
  if (MODE === 'stress') {
    console.log(`Стресс: ${stressRates.map((r) => r.toFixed(0)).join(' → ')} голосов/с, по ${STRESS_STEP_SEC} с на ступень.`);
    return;
  }
  console.log(
    `Профиль: средняя ${profile.avg.toFixed(2)} голосов/с, база ${profile.base.toFixed(2)}, пик ${profile.peak.toFixed(2)}; ` +
      `ожидается ${plan.expected} голосов за ${DURATION_SEC} с (ускорение ×${SCALE}). Терпение ${PATIENCE_SEC.toFixed(1)} с, VU заранее ${PREALLOCATED_VUS}, максимум ${MAX_VUS}.`,
  );
}

export function voter() {
  if (MODE === 'stress') {
    // Номер ступени по времени старта — тег на все метрики этого избирателя.
    const step = Math.floor(exec.instance.currentTestRunDuration / 1000 / (STRESS_RAMP_SEC + STRESS_STEP_SEC));
    exec.vu.metrics.tags.step = String(Math.min(step, STRESS_STEPS - 1));
  }
  tagPhase();
  const phone = `+7900${pad(exec.scenario.iterationInTest, 7)}`;
  const started = Date.now();
  votersStarted.add(1);

  // 1. Запросить код. Если СМС не пришла за время терпения — «отправить ещё раз», один раз.
  let code = null;
  for (let attempt = 0; attempt < 2 && !code; attempt++) {
    const since = Date.now() - 1;
    const r = withRetry(() => gql('requestCode', REQUEST_CODE, { p: phone }));
    // 429 «код уже отправлен» — нормально после повтора, запрос до сервера дошёл.
    if (r.code !== 0 && r.code !== 429) return fail('requestCode');
    code = waitSms(phone, since);
    if (code) smsWait.add(Date.now() - since);
  }
  if (!code) {
    smsTimeouts.add(1);
    return fail('smsTimeout');
  }

  // 2. Подтвердить номер.
  const v = withRetry(() => gql('verifyCode', VERIFY_CODE, { p: phone, c: code }));
  if (v.code !== 0) return fail(`verifyCode:${v.code}`);
  const token = v.data.verifyCode.token;

  // 3. Проголосовать. Часть людей жмёт кнопку несколько раз подряд — засчитаться должен один голос.
  const candidate = randomCandidate();
  let confirmedFor = null;
  if (Math.random() < N('DOUBLE_VOTE_SHARE', 0.01)) {
    doubleVoteAttempts.add(1);
    const batch = [0, 1, 2].map(() => {
      const r = gqlRequest('castVote', CAST_VOTE, { c: candidate }, token);
      return [r.method, r.url, r.body, r.params];
    });
    const results = http.batch(batch).map(parse);
    const fresh = results.filter((r) => r.code === 0 && !r.data.castVote.alreadyVoted).length;
    if (fresh > 1) doubleVoteExtra.add(fresh - 1);
    if (results.some((r) => r.code === 0)) confirmedFor = candidate;
  } else {
    const r = withRetry(() => gql('castVote', CAST_VOTE, { c: candidate }, token));
    if (r.code === 0) confirmedFor = candidate;
  }

  if (confirmedFor === null) {
    votesUnconfirmed.add(1);
    return fail('castVote');
  }
  votesConfirmed.add(1, { candidate: String(confirmedFor) });
  flowTime.add(Date.now() - started);
  userSuccess.add(true);
}

export function viewer() {
  tagPhase();
  gql('results', RESULTS, {});
}

export function bruteforce() {
  const phone = `+7910${pad(exec.scenario.iterationInTest, 7)}`;
  bruteforceAttempts.add(1);
  const since = Date.now() - 1;
  if (gql('requestCode', REQUEST_CODE, { p: phone }).code !== 0) return;
  const real = waitSms(phone, since);
  // 10 неверных кодов параллельно: лимит в 5 попыток не должен обходиться гонкой запросов.
  const guesses = [];
  while (guesses.length < 10) {
    const g = pad(Math.floor(Math.random() * 1e6), 6);
    if (g !== real) guesses.push(g);
  }
  const batch = guesses.map((g) => {
    const r = gqlRequest('verifyCode', VERIFY_CODE, { p: phone, c: g });
    return [r.method, r.url, r.body, r.params];
  });
  const wins = http.batch(batch).map(parse).filter((r) => r.code === 0).length;
  // После серии неверных попыток даже верный код должен быть отклонён.
  const afterLock = real ? gql('verifyCode', VERIFY_CODE, { p: phone, c: real }).code === 0 : false;
  bruteforceSuccess.add(wins + (afterLock ? 1 : 0));
}

export function smsSpam() {
  const phone = `+7920${pad(exec.scenario.iterationInTest, 7)}`;
  spamAttempts.add(1);
  const batch = [0, 1, 2, 3, 4].map(() => {
    const r = gqlRequest('requestCode', REQUEST_CODE, { p: phone });
    return [r.method, r.url, r.body, r.params];
  });
  const accepted = http.batch(batch).map(parse).filter((r) => r.code === 0).length;
  if (accepted > 1) spamLeak.add(accepted - 1);
}
