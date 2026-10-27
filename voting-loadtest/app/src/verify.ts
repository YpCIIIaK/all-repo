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
const SEED_PREFIX = '+7800';

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

/**
 * Тренд памяти по stats.csv (время;контейнер;CPU;память). Первые 20 % времени — разогрев (куча Node
 * выходит на рабочий размер), не учитываются. Дальше: средняя память в середине и в конце и наклон прямой
 * по методу наименьших квадратов, МБ в час.
 */
type Trend = { name: string; middleMb: number; endMb: number; mbPerHour: number; minutes: number };
function memoryTrends(file: string, project: string): Trend[] {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const mib = (s: string) => {
    const v = parseFloat(s);
    return /GiB/.test(s) ? v * 1024 : /KiB/.test(s) ? v / 1024 : /^[\d.]+B/.test(s) ? v / 1048576 : v;
  };
  const series = new Map<string, { t: number; mb: number }[]>();
  for (const line of text.split('\n')) {
    const [t, rawName, , mem] = line.split(';');
    if (!mem || rawName.includes('-run-')) continue;
    const name = rawName.replace(`${project}-`, '');
    const list = series.get(name) ?? [];
    list.push({ t: Number(t), mb: mib(mem.split(' / ')[0]) });
    series.set(name, list);
  }
  const out: Trend[] = [];
  for (const [name, all] of series) {
    if (all.length < 10) continue;
    const t0 = all[0].t;
    const span = all[all.length - 1].t - t0;
    const pts = all.filter((p) => p.t - t0 >= span * 0.2);
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.t, 0) / n;
    const my = pts.reduce((a, p) => a + p.mb, 0) / n;
    const slope = pts.reduce((a, p) => a + (p.t - mx) * (p.mb - my), 0) / Math.max(1e-9, pts.reduce((a, p) => a + (p.t - mx) ** 2, 0));
    const avg = (arr: typeof pts) => arr.reduce((a, p) => a + p.mb, 0) / Math.max(1, arr.length);
    const half = Math.max(1, Math.floor(n / 2));
    out.push({ name, middleMb: avg(pts.slice(0, half)), endMb: avg(pts.slice(half)), mbPerHour: slope * 3600, minutes: span / 60 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

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
  // Заранее залитые голоса (SEED_VOTES, номера +7800…) в сверку с клиентами не входят.
  const [dbTotal] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Vote" v JOIN "Voter" p ON p.id = v."voterId" WHERE p.phone NOT LIKE ${SEED_PREFIX + '%'}`;
  const perCandidate = await prisma.$queryRaw<{ candidateId: number; n: number }[]>`
    SELECT "candidateId", count(*)::int AS n FROM "Vote" v JOIN "Voter" p ON p.id = v."voterId"
    WHERE p.phone NOT LIKE ${SEED_PREFIX + '%'} GROUP BY "candidateId" ORDER BY "candidateId"`;
  const [allVotes] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Vote"`;
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
    // Пересчёт на VPS: предел ∝ число ядер × скорость ядра (сервер упирается в процессор).
    const bench = Number(env('BENCH_SCORE', '0'));
    const cores = Number(env('SERVER_CORES', '0'));
    const vpsBench = Number(env('VPS_BENCH', '0'));
    const vpsCpus = Number(env('VPS_CPUS', '0'));
    const perCoreUnit = bench && cores ? capacity / cores / bench : 0; // голосов/с на ядро на единицу скорости
    const vpsLines: string[] = [];
    if (perCoreUnit) {
      vpsLines.push(
        `Здесь: ${cores} ядр${cores === 1 ? 'о' : 'а'} со скоростью ${fmtInt(bench)} (\`./run.sh bench\`) — ` +
          `${(capacity / cores).toFixed(0)} голосов/с на ядро.`,
      );
      if (vpsBench && vpsCpus) {
        const vps = perCoreUnit * vpsBench * vpsCpus;
        vpsLines.push(
          `**На VPS (${vpsCpus} ядр${vpsCpus === 1 ? 'о' : 'а'}, скорость ${fmtInt(vpsBench)}): ≈ ${vps.toFixed(0)} голосов/с — ` +
            (vps >= peakNeeded * 1.5 ? `запас ×${(vps / peakNeeded).toFixed(1)}, достаточно.**` : vps >= peakNeeded ? `запас ×${(vps / peakNeeded).toFixed(1)}, меньше рекомендуемых ×1,5.**` : `не хватает в ${(peakNeeded / vps).toFixed(1)} раза.**`),
        );
      } else {
        vpsLines.push(
          `Чтобы пересчитать на свой VPS, запустите там \`./run.sh bench\` и передайте результат: ` +
            `\`VPS_BENCH=<число> VPS_CPUS=<ядер>\`. Оценка: голосов/с ≈ ${perCoreUnit.toExponential(3)} × скорость × ядер.`,
        );
      }
    }
    stressLines.unshift(
      `**Сервер ${limit}.** На пике голосования нужно ${peakNeeded.toFixed(0)} голосов/с — ${verdict}.`,
      '',
      ...vpsLines.flatMap((l) => [l, '']),
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

  // Длительный прогон: задержки в начале, середине и конце + тренд памяти.
  const soak = env('MODE') === 'soak';
  const soakLines: string[] = [];
  if (soak) {
    const phases: [string, string][] = [['start', 'Первая треть'], ['middle', 'Середина'], ['end', 'Последняя треть']];
    soakLines.push('| Время | p95 requestCode | p95 verifyCode | p95 castVote | p95 results |', '|---|---|---|---|---|');
    for (const [phase, label] of phases) {
      const p95 = ['requestCode', 'verifyCode', 'castVote', 'results'].map((op) => metric(summary, `http_req_duration{op:${op},phase:${phase}}`, 'p(95)'));
      soakLines.push(`| ${label} | ${p95.map(fmtMs).join(' | ')} |`);
    }
    const first = metric(summary, 'http_req_duration{op:castVote,phase:start}', 'p(95)');
    const last = metric(summary, 'http_req_duration{op:castVote,phase:end}', 'p(95)');
    const slowdown = first > 0 ? last / first : 1;
    checks.push({
      name: 'Сервер не замедляется к концу',
      ok: slowdown < 1.5,
      details: `p95 castVote: ${fmtMs(first)} в начале → ${fmtMs(last)} в конце (×${slowdown.toFixed(2)})`,
    });

    const trends = memoryTrends('/results/stats.csv', env('PROJECT_NAME'));
    soakLines.push(
      '',
      'Память после разогрева (первые 20 % времени не учитываются): средняя в первой и второй половине, наклон.',
      '',
      '| Контейнер | Первая половина | Вторая половина | Тренд |',
      '|---|---|---|---|',
    );
    const leaks: string[] = [];
    for (const t of trends) {
      soakLines.push(`| ${t.name} | ${t.middleMb.toFixed(0)} МБ | ${t.endMb.toFixed(0)} МБ | ${t.mbPerHour >= 0 ? '+' : ''}${t.mbPerHour.toFixed(0)} МБ/ч |`);
      // Утечка у процессов приложения: вторая половина заметно больше первой (≥ 10 МБ и ≥ 10 %) и наклон > 20 МБ/ч.
      // База и Redis не проверяются: их память растёт вместе с данными, это нормально.
      const growth = t.endMb - t.middleMb;
      if (/^(api|worker|nginx)-/.test(t.name) && growth > Math.max(10, 0.1 * t.middleMb) && t.mbPerHour > 20) leaks.push(t.name);
    }
    const minutes = trends[0]?.minutes ?? 0;
    checks.push({
      name: 'Нет утечек памяти в API, воркере и nginx',
      ok: leaks.length === 0,
      warnOnly: minutes < 15,
      details:
        (leaks.length ? `растёт память: ${leaks.join(', ')}` : 'память после разогрева ровная') +
        (minutes < 15 ? ` (прогон ${minutes.toFixed(0)} мин — для вывода об утечках нужно от 15–30 минут)` : ''),
    });
  }

  const ok = checks.every((c) => c.ok || c.warnOnly);
  const scaleNote = timeScale > 1 ? ` (≈ ${fmtMs(smsWaitP95 * timeScale)} в реальном времени при ускорении ×${timeScale})` : '';
  const report = [
    `# ${ok ? '✅ PASS' : '❌ FAIL'} — ${stress ? 'стресс-тест' : soak ? 'длительный прогон' : 'сценарий'} «${env('SCENARIO', '?')}»`,
    '',
    `Длительность ${env('DURATION', '?')} (ускорение ×${timeScale}), цель ${fmtInt(Number(env('TOTAL_VOTES', '0')))} голосов, ` +
      `сеть: ${env('NET_EMULATION', 'нет данных')}.`,
    '',
    `В базе к концу теста ${fmtInt(allVotes.n)} голосов` +
      (allVotes.n > total ? `, из них ${fmtInt(allVotes.n - total)} залиты заранее (SEED_VOTES), в сверку с клиентами не входят.` : '.'),
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
    ...(soak ? ['## Длительный прогон: задержки и память во времени', '', ...soakLines, ''] : []),
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
