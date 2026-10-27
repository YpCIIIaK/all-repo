#!/bin/sh
# Имитация сети между пользователями и сервером (NETWORK_MODE):
#   auto     — netem, а если его нет в ядре — TCP-прокси netdelay (по умолчанию);
#   netem    — задержка, разброс и потери пакетов на исходящем трафике k6 (нужны NET_ADMIN и модуль sch_netem);
#   proxy    — TCP-прокси с задержкой, работает везде, потери приближаются задержкой повторной передачи;
#   off      — без имитации.
API_URL=https://nginx
mode="${NETWORK_MODE:-auto}"
if [ "${NET_DELAY_MS:-0}" = "0" ] && [ "${NET_LOSS_PCT:-0}" = "0" ]; then mode=off; fi
params="задержка +${NET_DELAY_MS:-0}±${NET_JITTER_MS:-0} мс, потери ${NET_LOSS_PCT:-0} %"

case "$mode" in
  off) NET_EMULATION="выключена" ;;
  auto|netem)
    if tc qdisc add dev eth0 root netem delay "${NET_DELAY_MS:-0}ms" "${NET_JITTER_MS:-0}ms" distribution normal \
         loss "${NET_LOSS_PCT:-0}%" 2>/tmp/tc.err; then
      NET_EMULATION="netem: $params"
    elif [ "$mode" = auto ]; then
      API_URL=https://netdelay
      NET_EMULATION="прокси netdelay (netem недоступен: $(cat /tmp/tc.err)): $params"
    else
      echo "netem не включился: $(cat /tmp/tc.err)" >&2; exit 2
    fi ;;
  proxy) API_URL=https://netdelay; NET_EMULATION="прокси netdelay: $params" ;;
  *) echo "NETWORK_MODE=$mode: ожидается auto, netem, proxy или off" >&2; exit 2 ;;
esac
echo "Сеть: $NET_EMULATION"
echo "$NET_EMULATION" > /results/net-emulation.txt

k6 run --quiet --summary-export=/results/summary.json -e API_URL="$API_URL" "$@" /scripts/vote.js
code=$?
# k6 работает от root (нужен для tc) — открываем результаты на запись остальным.
chmod -R a+rwX /results 2>/dev/null
exit $code
