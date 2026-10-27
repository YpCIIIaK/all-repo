/**
 * Сверка после нагрузочного теста: сравнивает то, что видел k6 (клиенты), с тем, что лежит в базе,
 * в очереди СМС и у заглушки провайдера. Пишет отчёт в Markdown и завершается с кодом 1, если что-то не так.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { config } from './config';
import { SMS_QUEUE, redisConnection } from './sms-queue';

type Metric = Record<string, number | Record<string, boolean>>;
type Summary = { metrics: Record<string, Metric> };

const env = (name: string, fallback = '') => process.env[name] ?? fallback;
const summaryFile = env('SUMMARY_FILE', '/results/summary.json');
const reportFile = env('REPORT_FILE', '/results/report.md');
const timeScale = Number(env('TIME_SCALE', '1'));

function metric(summary: Summary, name: string, field: string): number {
  const value = summary.metrics[name]?.[field];
  return typeof value === 'number' ? value : 0;
}

/** Пороги k6, которые не выполнены. В --summary-export true означает «порог нарушен». */
function failedThresholds(summary: Summary): string[] {
  const failed: string[] = [];
  for (const [name, m] of Object.entries(summary.metrics)) {
    const thresholds = m.thresholds;
    if (thresholds && typeof thresholds === 'object') {
      for (const [expr, crossed] of Object.entries(thresholds)) if (crossed) failed.push(`${name}: ${expr}`);
    }
  }
  return failed;
}

const fmtMs = (ms: number) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)} с` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} с` : `${ms.toFixed(0)} мс`);
const fmtInt = (n: number) => Math.round(n).toLocaleString('ru-RU');

async function waitForQueue(queue: Queue, timeoutMs: number): Promise<{ pending: number; failed: number }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
    const pending = counts.waiting + counts.active + counts.delayed + counts.prioritized;
    if (pending === 0 || Date.now() > deadline) return { pending, failed: counts.failed };
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  const summary = JSON.parse(readFileSync(summaryFile, 'utf8')) as Summary;
  const prisma = new PrismaClient();
  const queue = new Queue(SMS_QUEUE, { connection: redisConnection() });

  const queueState = await waitForQueue(queue, 60_000);
  const [dbTotal] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Vote"`;
  const perCandidate = await prisma.$queryRaw<{ candidateId: number; n: number }[]>`
    SELECT "candidateId", count(*)::int AS n FROM "Vote" GROUP BY "candidateId" ORDER BY "candidateId"`;
  const [unverified] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Vote" v JOIN "Voter" p ON p.id = v."voterId" WHERE p."verifiedAt" IS NULL`;
  const [duplicates] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (SELECT 1 FROM "Vote" GROUP BY "pollId", "voterId" HAVING count(*) > 1) d`;
  const sms = (await fetch(`${config.sms.providerUrl}/stats`)
    .then((r) => r.json())
    .catch(() => ({}))) as Record<string, number>;
  await queue.close();
  await prisma.$disconnect();

  const confirmed = metric(summary, 'votes_confirmed', 'count');
  const unconfirmed = metric(summary, 'votes_unconfirmed', 'count');
  const started = metric(summary, 'voters_started', 'count');
  const dropped = metric(summary, 'dropped_iterations', 'count');
  const succeeded = metric(summary, 'user_success', 'passes');
  const smsTimeouts = metric(summary, 'sms_timeouts', 'count');
  const smsWaitP95 = metric(summary, 'sms_wait', 'p(95)');
  const k6Exit = Number(env('K6_EXIT', '0'));

  type Check = { name: string; ok: boolean; details: string; warnOnly?: boolean };
  const checks: Check[] = [];

  const total = dbTotal.n;
  checks.push({
    name: 'Голоса не потеряны и лишних нет',
    ok: total >= confirmed && total <= confirmed + unconfirmed,
    details: `в базе ${fmtInt(total)}, клиенты получили подтверждение ${fmtInt(confirmed)}, без ответа сервера ${fmtInt(unconfirmed)}`,
  });

  let surplus = 0;
  let perCandidateOk = true;
  const candidateRows: string[] = [];
  for (let c = 1; c <= config.candidates; c++) {
    const db = perCandidate.find((r) => r.candidateId === c)?.n ?? 0;
    const k6 = metric(summary, `votes_confirmed{candidate:${c}}`, 'count');
    if (db < k6) perCandidateOk = false;
    surplus += Math.max(0, db - k6);
    candidateRows.push(`| ${c} | ${fmtInt(k6)} | ${fmtInt(db)} |`);
  }
  checks.push({
    name: 'Голоса засчитаны тем, за кого отданы',
    ok: perCandidateOk && surplus <= unconfirmed,
    details: perCandidateOk ? 'по каждому варианту в базе не меньше подтверждённого клиентам' : 'у какого-то варианта в базе меньше голосов, чем подтверждено клиентам',
  });
  checks.push({ name: 'Нет голосов без подтверждённого номера', ok: unverified.n === 0, details: `${unverified.n}` });
  checks.push({ name: 'Нет двойных голосов в базе', ok: duplicates.n === 0, details: `${duplicates.n}` });
  checks.push({
    name: 'Параллельный двойной голос не прошёл',
    ok: metric(summary, 'double_vote_extra', 'count') === 0,
    details: `лишних засчитанных голосов: ${metric(summary, 'double_vote_extra', 'count')} (попыток: ${metric(summary, 'double_vote_attempts', 'count')})`,
  });
  checks.push({
    name: 'Подбор кода не удался',
    ok: metric(summary, 'bruteforce_success', 'count') === 0,
    details: `успешных подборов: ${metric(summary, 'bruteforce_success', 'count')} (атак: ${metric(summary, 'bruteforce_attempts', 'count')})`,
  });
  checks.push({
    name: 'Повторные запросы кода не дают лишних СМС',
    ok: metric(summary, 'sms_spam_leak', 'count') === 0,
    details: `лишних СМС: ${metric(summary, 'sms_spam_leak', 'count')} (атак: ${metric(summary, 'sms_spam_attempts', 'count')})`,
  });
  checks.push({
    name: 'Очередь СМС разобрана, ничего не потеряно',
    ok: queueState.pending === 0 && queueState.failed === 0,
    details: `в очереди ${queueState.pending}, окончательно не отправлено ${queueState.failed}`,
  });
  checks.push({
    name: 'k6 успевал запускать всех пользователей',
    ok: dropped === 0,
    details: dropped === 0 ? 'пропусков нет' : `не запущено ${fmtInt(dropped)}: все VU были заняты ожидающими пользователями — система не успевала их обслуживать (или мал MAX_VUS)`,
  });
  const thresholds = failedThresholds(summary);
  checks.push({
    name: 'Пороги сценария (задержки, доля успешных, ожидание СМС)',
    ok: thresholds.length === 0 && k6Exit === 0,
    details: thresholds.length ? thresholds.join('; ') : k6Exit === 0 ? 'все выполнены' : `k6 завершился с кодом ${k6Exit}`,
  });

  const ops = ['requestCode', 'verifyCode', 'castVote', 'results'];
  const latencyRows = ops.map((op) => {
    const name = `http_req_duration{op:${op}}`;
    return `| ${op} | ${fmtMs(metric(summary, name, 'med'))} | ${fmtMs(metric(summary, name, 'p(95)'))} | ${fmtMs(metric(summary, name, 'max'))} |`;
  });

  // Стресс: на каждой ступени — держит ли сервер (доля успешных и p95 в пределах порогов).
  const stress = env('MODE') === 'stress';
  const stressLines: string[] = [];
  if (stress) {
    const rates = env('STRESS_RATES').split(',').map(Number);
    const successMin = Number(env('SUCCESS_MIN', '0.99'));
    const p95Max = Number(env('API_P95_MS', '800'));
    const peakNeeded = (Number(env('PEAK_X', '10')) * Number(env('TOTAL_VOTES', '100000'))) / 10_800;
    let capacity = 0;
    let breaksAt: number | null = null;
    stressLines.push('| Ступень, голосов/с | Запросов к API/с | Начали | Успешно | p95 requestCode | p95 verifyCode | p95 castVote | Ошибки 5xx | Держит |');
    stressLines.push('|---|---|---|---|---|---|---|---|---|');
    rates.forEach((rate, i) => {
      const success = metric(summary, `user_success{step:${i}}`, 'value');
      const p95 = ['requestCode', 'verifyCode', 'castVote'].map((op) => metric(summary, `http_req_duration{op:${op},step:${i}}`, 'p(95)'));
      const holds = success >= successMin && p95.every((v) => v < p95Max);
      if (holds && breaksAt === null) capacity = rate;
      else if (!holds && breaksAt === null) breaksAt = rate;
      stressLines.push(
        `| ${rate} | ${rate * 3} | ${fmtInt(metric(summary, `voters_started{step:${i}}`, 'count'))} | ` +
          `${(success * 100).toFixed(1)} % | ${p95.map(fmtMs).join(' | ')} | ${(metric(summary, `api_errors{step:${i}}`, 'value') * 100).toFixed(1)} % | ${holds ? '✅' : '❌'} |`,
      );
    });
    const limit =
      breaksAt === null
        ? `держит все ступени, до ${capacity} голосов/с (≈ ${capacity * 3} запросов/с) и, возможно, больше`
        : capacity === 0
          ? `не держит даже ${breaksAt} голосов/с`
          : `держит ${capacity} голосов/с (≈ ${capacity * 3} запросов/с), на ${breaksAt} уже нет`;
    const verdict =
      capacity >= peakNeeded
        ? `запас не меньше ×${(capacity / peakNeeded).toFixed(1)}`
        : breaksAt !== null && breaksAt <= peakNeeded
          ? `не хватает: предел меньше ${breaksAt}`
          : `запас под вопросом — пик между ступенями ${capacity} и ${breaksAt}, уточните STRESS_RATES`;
    stressLines.unshift(
      `**Сервер ${limit}.** На пике голосования нужно ${peakNeeded.toFixed(0)} голосов/с — ${verdict}.`,
      '',
      `«Держит» — доля успешных не ниже ${(successMin * 100).toFixed(0)} % и p95 каждого запроса меньше ${fmtMs(p95Max)}. ` +
        'Задержки включают имитацию сети сценария.',
      '',
    );
    // В стрессе отказы на верхних ступенях — цель теста, а не ошибка: оцениваем только корректность.
    for (const c of checks) {
      if (c.name.startsWith('k6 успевал') || c.name.startsWith('Пороги сценария')) c.warnOnly = true;
    }
  }

  const ok = checks.every((c) => c.ok || c.warnOnly);
  const scaleNote = timeScale > 1 ? ` (≈ ${fmtMs(smsWaitP95 * timeScale)} в реальном времени при ускорении ×${timeScale})` : '';
  const report = [
    `# ${ok ? '✅ PASS' : '❌ FAIL'} — ${stress ? 'стресс-тест' : 'сценарий'} «${env('SCENARIO', '?')}»`,
    '',
    `Длительность ${env('DURATION', '?')} (ускорение ×${timeScale}), цель ${fmtInt(Number(env('TOTAL_VOTES', '0')))} голосов, ` +
      `сеть: ${env('NET_EMULATION', 'нет данных')}.`,
    '',
    `Ядра: сервер — ${env('SERVER_CPUSET') || 'все (не закреплён)'}, k6 и заглушки — ${env('CLIENT_CPUSET') || 'все'}.`,
    '',
    '## Проверки',
    '',
    '| | Проверка | Детали |',
    '|---|---|---|',
    ...checks.map((c) => `| ${c.ok ? '✅' : c.warnOnly ? '⚠️' : '❌'} | ${c.name} | ${c.details} |`),
    '',
    ...(stress ? ['## Предел сервера (стресс)', '', ...stressLines, ''] : []),
    '## Пользователи',
    '',
    `| Начали голосовать | Проголосовали | Доля | Не дождались СМС | Не запущены k6 |`,
    '|---|---|---|---|---|',
    `| ${fmtInt(started)} | ${fmtInt(succeeded)} | ${started ? ((100 * succeeded) / (started + dropped)).toFixed(2) : '0'} % | ${fmtInt(smsTimeouts)} | ${fmtInt(dropped)} |`,
    '',
    `Где отвалились: ${
      ['requestCode', 'smsTimeout', 'verifyCode:400', 'verifyCode:429', 'verifyCode:503', 'verifyCode:500', 'castVote']
        .map((step) => [step, metric(summary, `voter_failures{reason:${step}}`, 'count')] as const)
        .filter(([, n]) => n > 0)
        .map(([step, n]) => `${step} — ${fmtInt(n)}`)
        .join(', ') || 'нигде'
    }. Не закончили к концу теста: ${fmtInt(Math.max(0, started - succeeded - metric(summary, 'voter_failures', 'count')))}.`,
    '',
    `Ожидание СМС: медиана ${fmtMs(metric(summary, 'sms_wait', 'med'))}, p95 ${fmtMs(smsWaitP95)}${scaleNote}.`,
    '',
    '## Задержки API (через nginx и HTTPS)',
    '',
    '| Операция | Медиана | p95 | Максимум |',
    '|---|---|---|---|',
    ...latencyRows,
    '',
    '## Голоса по вариантам',
    '',
    '| Вариант | Подтверждено клиентам | В базе |',
    '|---|---|---|',
    ...candidateRows,
    '',
    '## СМС-провайдер (заглушка)',
    '',
    `Принято к отправке ${fmtInt(sms.accepted ?? 0)}, доставлено ${fmtInt(sms.delivered ?? 0)}, ` +
      `отказ по лимиту ${fmtInt(sms.rejectedRate ?? 0)}, отказ во время сбоя ${fmtInt(sms.rejectedOutage ?? 0)}, ` +
      `случайных ошибок ${fmtInt(sms.errors ?? 0)}, номеров с двумя и более СМС ${fmtInt(sms.phonesWithRepeats ?? 0)}.`,
    '',
  ].join('\n');

  writeFileSync(reportFile, report);
  console.log(report);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
