// Запасная имитация сети, если в ядре нет модуля netem: TCP-прокси k6 → netdelay → nginx.
// Каждый кусок данных задерживается на NET_DELAY_MS/2 ± NET_JITTER_MS/2 в каждую сторону (итого +NET_DELAY_MS к RTT,
// как у netem). Потерю пакетов на уровне TCP не воспроизвести, поэтому она приближается так, как её видит
// приложение: с вероятностью NET_LOSS_PCT кусок приходит позже на время повторной передачи (200 мс + RTT).
// TLS проходит насквозь, рукопожатие тоже получает задержку — как в жизни.
import cluster from 'node:cluster';
import net from 'node:net';
import { availableParallelism } from 'node:os';

const delay = Number(process.env.NET_DELAY_MS || 0) / 2;
const jitter = Number(process.env.NET_JITTER_MS || 0) / 2;
const loss = Number(process.env.NET_LOSS_PCT || 0) / 100;
const [host, port] = (process.env.TARGET || 'nginx:443').split(':');

// Нормальное распределение (Бокс — Мюллер), как distribution normal у netem.
function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
function chunkDelay() {
  let d = Math.max(0, delay + jitter * gaussian());
  if (Math.random() < loss) d += 200 + 2 * delay;
  return d;
}

/**
 * Пересылает from → to с задержкой. Одна очередь и один таймер на направление: порядок байтов
 * сохраняется всегда (иначе TLS ломается), а «потерянный» кусок задерживает и следующие — как в TCP.
 */
function pipeDelayed(from, to) {
  const queue = [];
  let timer = null;
  let lastAt = 0;
  let ended = false;
  const flush = () => {
    timer = null;
    const now = Date.now();
    while (queue.length && queue[0].at <= now) {
      const { chunk } = queue.shift();
      if (to.writable) to.write(chunk);
    }
    if (queue.length) timer = setTimeout(flush, queue[0].at - now);
    else if (ended) to.end();
  };
  from.on('data', (chunk) => {
    lastAt = Math.max(Date.now() + chunkDelay(), lastAt);
    queue.push({ at: lastAt, chunk });
    if (!timer) timer = setTimeout(flush, Math.max(0, queue[0].at - Date.now()));
  });
  from.on('end', () => {
    ended = true;
    if (!timer && !queue.length) to.end();
  });
}

if (cluster.isPrimary) {
  const workers = Math.max(1, Math.min(4, availableParallelism()));
  for (let i = 0; i < workers; i++) cluster.fork();
  console.log(`netdelay: :443 → ${host}:${port}, +${delay * 2}±${jitter * 2} мс к RTT, «потери» ${loss * 100} %, процессов ${workers}`);
} else {
  net
    // allowHalfOpen: пока задержанные данные в пути, сокет не должен закрываться сам по FIN от другой стороны.
    .createServer({ allowHalfOpen: true }, (client) => {
      const upstream = net.connect({ port: Number(port), host, allowHalfOpen: true });
      for (const s of [client, upstream]) {
        s.setNoDelay(true);
        s.on('error', () => (client.destroy(), upstream.destroy()));
      }
      pipeDelayed(client, upstream);
      pipeDelayed(upstream, client);
    })
    .listen(Number(process.env.LISTEN_PORT || 443));
}
