#!/usr/bin/env bash
# Нагрузочный тест голосования.
#
#   ./run.sh plan [сценарий ...]          расчёт без запуска (очередь СМС, пики, сколько нужно VU)
#   ./run.sh <сценарий> [длительность]    прогон: optimistic | realistic | pessimistic, длительность 3h, 30m, 10m, 90s
#   ./run.sh all [длительность]           три сценария по очереди
#   ./run.sh stress <сценарий>            предел сервера: поток растёт ступенями до отказа (~9 минут)
#   ./run.sh soak <сценарий> [длительность]  ровная средняя нагрузка: утечки памяти, замедление с ростом базы
#   ./run.sh bench                        скорость одного ядра — запустите и на VPS, чтобы пересчитать результаты
#
# Любой параметр сценария можно переопределить переменной окружения:
#   TOTAL_VOTES=2000 ./run.sh realistic 3m
#   KEEP=1 ./run.sh realistic 10m          не останавливать стенд после теста
#   SEED_VOTES=1000000 ./run.sh stress realistic   перед тестом залить в базу миллион голосов
set -uo pipefail
cd "$(dirname "$0")"

REAL_DURATION_SEC=${REAL_DURATION_SEC:-10800} # реальное голосование — 3 часа

die() { echo "Ошибка: $*" >&2; exit 2; }

to_sec() {
  case "$1" in
    *h) echo $(( ${1%h} * 3600 )) ;;
    *m) echo $(( ${1%m} * 60 )) ;;
    *s) echo "${1%s}" ;;
    *[!0-9]*|'') die "длительность «$1»: ожидается 3h, 30m, 90s" ;;
    *) echo "$1" ;;
  esac
}

# Переменные из .env, если они не заданы снаружи.
load_scenario() {
  local file="scenarios/$1.env"
  [ -f "$file" ] || die "нет сценария $file (есть: $(ls scenarios | sed 's/\.env//' | tr '\n' ' '))"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z0-9_]+$ ]] || continue
    value="${value%%#*}"; value="${value%"${value##*[![:space:]]}"}"
    [ -z "${!key+x}" ] && export "$key=$value"
  done < "$file"
}

plan() {
  local files=()
  if [ $# -eq 0 ]; then files=(scenarios/*.env); else for s in "$@"; do files+=("scenarios/$s.env"); done; fi
  if command -v node >/dev/null; then
    node scripts/plan.mjs "${files[@]}"
  else
    docker run --rm -v "$PWD":/w -w /w node:20-alpine node scripts/plan.mjs "${files[@]}"
  fi
}

# Загрузка контейнеров раз в несколько секунд: время;контейнер;CPU в % от одного ядра;память.
sample_stats() {
  local project="$1" out="$2"
  while :; do
    docker stats --no-stream --format '{{.Name}};{{.CPUPerc}};{{.MemUsage}}' \
      $(docker ps -q --filter "label=com.docker.compose.project=$project") 2>/dev/null \
      | awk -v t="$(date +%s)" '{ print t ";" $0 }' >> "$out"
    sleep 3
  done
}

# Скорость одного ядра (scripts/bench.mjs). Отношение результатов на VPS и здесь — коэффициент пересчёта.
bench() {
  docker run --rm --cpuset-cpus "${1:-0}" -v "$PWD/scripts":/s:ro node:20-alpine node /s/bench.mjs
}

# Перед тестом — SEED_VOTES подтверждённых избирателей с голосами (номера +7800…), как в конце большого дня.
seed() {
  local project="$1" n="${SEED_VOTES:-0}"
  [ "$n" -gt 0 ] 2>/dev/null || return 0
  echo "Заливаю в базу $n избирателей с голосами…"
  local started=$SECONDS
  docker compose -p "$project" exec -T db psql -q -v ON_ERROR_STOP=1 -U vote -d vote <<SQL || die "не удалось заполнить базу"
INSERT INTO "Voter" ("phone", "verifiedAt") SELECT '+7800' || lpad(g::text, 8, '0'), now() FROM generate_series(1, $n) g;
INSERT INTO "OtpCode" ("voterId", "codeHash", "sentAt", "usedAt") SELECT id, 'seed', now(), now() FROM "Voter" WHERE "phone" LIKE '+7800%';
INSERT INTO "Vote" ("pollId", "voterId", "candidateId") SELECT 1, id, 1 + id % 5 FROM "Voter" WHERE "phone" LIKE '+7800%';
VACUUM ANALYZE;
SQL
  echo "Готово за $(( SECONDS - started )) с."
}

# CHAOS="worker@0.5,db@0.97": на такой доле длительности теста убить службу (kill -9, как при падении)
# и сразу запустить снова.
chaos() {
  local project="$1" log="$2" event service at delay
  IFS=',' read -ra events <<< "${CHAOS:-}"
  for event in "${events[@]}"; do
    [ -n "$event" ] || continue
    service="${event%@*}"; at="${event#*@}"
    delay=$(awk "BEGIN { printf \"%d\", $at * $DURATION_SEC }")
    ( sleep "$delay"
      echo "$(date +%T) kill -9 $service (через ${delay} с после старта)" >> "$log"
      docker compose -p "$project" kill -s SIGKILL "$service" >/dev/null 2>&1
      docker compose -p "$project" start "$service" >/dev/null 2>&1
      echo "$(date +%T) $service снова запущен" >> "$log" ) &
  done
}

# Ядра: сервер (имитация VPS) — первые SERVER_CPUS ядер Docker, k6, прокси сети и заглушка СМС — остальные.
# Если ядер мало, сервер получает сколько можно, но генератору нагрузки остаётся хотя бы одно.
split_cpus() {
  if [ -n "${SERVER_CPUSET:-}" ]; then
    # Число ядер в наборе вида 0-3,6
    export SERVER_CORES; SERVER_CORES=$(echo "$SERVER_CPUSET" | tr ',' '\n' | awk -F- '{ n += ($2 == "" ? 1 : $2 - $1 + 1) } END { print n }')
    return
  fi
  local n want; n=$(docker info --format '{{.NCPU}}' 2>/dev/null || echo 0); want="${SERVER_CPUS:-2}"
  if [ "$n" -lt 2 ]; then
    echo "Внимание: Docker видит $n ядро — сервер и k6 будут делить его, цифры будут занижены." >&2
    return
  fi
  if [ "$want" -gt $(( n - 1 )) ]; then
    echo "Внимание: сценарий просит $want ядер под сервер, а Docker видит $n — даю $(( n - 1 )), одно остаётся k6." >&2
    want=$(( n - 1 ))
  fi
  export SERVER_CORES="$want"
  local server="0-$(( want - 1 ))" client="$want-$(( n - 1 ))"
  [ "$want" -eq 1 ] && server=0
  [ "$want" -eq $(( n - 1 )) ] && client=$want
  export SERVER_CPUSET="$server" CLIENT_CPUSET="$client"
}

run_one() {
  local scenario="$1" duration="${2:-30m}"
  ( # подоболочка: переменные сценария не протекают в следующий прогон «all»
  load_scenario "$scenario"
  export SCENARIO="$scenario" DURATION="$duration"
  export DURATION_SEC; DURATION_SEC=$(to_sec "$duration")
  export TIME_SCALE; TIME_SCALE=$(awk "BEGIN { printf \"%.6g\", $REAL_DURATION_SEC / $DURATION_SEC }")
  local project="${PROJECT:-vote-$scenario}"
  export RESULTS_DIR; RESULTS_DIR="$PWD/results/$scenario-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$RESULTS_DIR" && chmod 777 "$RESULTS_DIR"
  split_cpus
  local dc=(docker compose -p "$project" --profile tools)
  export PROJECT_NAME="$project"

  echo "== Сценарий $scenario: $duration (ускорение ×$TIME_SCALE), результаты: $RESULTS_DIR"
  "${dc[@]}" down -v --remove-orphans >/dev/null 2>&1
  "${dc[@]}" build -q || die "сборка образов не удалась"
  export BENCH_SCORE; BENCH_SCORE=$(bench "${SERVER_CPUSET%%[-,]*}")
  echo "Скорость ядра здесь: $BENCH_SCORE (./run.sh bench)."
  docker compose -p "$project" up -d --wait || { "${dc[@]}" logs --no-color > "$RESULTS_DIR/logs.txt"; die "стенд не поднялся, логи в $RESULTS_DIR/logs.txt"; }
  seed "$project"

  echo "Сервер на ядрах ${SERVER_CPUSET:-любых}, k6 и заглушка СМС на ядрах ${CLIENT_CPUSET:-любых}."
  echo "Тест идёт $duration, окончание около $(date -d "+$DURATION_SEC sec" +%H:%M 2>/dev/null || date -v+"$DURATION_SEC"S +%H:%M)."
  sample_stats "$project" "$RESULTS_DIR/stats.csv" & local sampler=$!
  chaos "$project" "$RESULTS_DIR/chaos.log"

  "${dc[@]}" run --rm k6
  export K6_EXIT=$?
  export NET_EMULATION; NET_EMULATION="$(cat "$RESULTS_DIR/net-emulation.txt" 2>/dev/null || echo 'нет данных')"

  "${dc[@]}" run --rm verify
  local verdict=$?

  kill "$sampler" 2>/dev/null; jobs -p | xargs -r kill 2>/dev/null
  wait 2>/dev/null
  {
    echo
    echo "## Пиковая загрузка контейнеров"
    echo
    echo "CPU — в процентах от одного ядра. Контейнеры сервера делят ядра ${SERVER_CPUSET:-машины}: если на пике их сумма"
    echo "близка к 100 % × число ядер, сервер упёрся в процессор. Пики контейнеров могут приходиться на разное время."
    echo
    echo "| Контейнер | CPU, пик | Память, пик |"
    echo "|---|---|---|"
    awk -F';' -v p="$project-" '
      function mib(s,  v) { v = s + 0; if (s ~ /GiB/) v *= 1024; else if (s ~ /KiB/) v /= 1024; else if (s ~ /^[0-9.]+B/) v /= 1048576; return v }
      { name=$2; sub(p, "", name); cpu=$3; sub(/%/, "", cpu); split($4, m, " / ");
        if (cpu+0 > maxcpu[name]) maxcpu[name]=cpu+0; if (mib(m[1]) > mem[name]) mem[name]=mib(m[1]) }
      END { for (n in maxcpu) printf "| %s | %.0f %% | %.0f МБ |\n", n, maxcpu[n], mem[n] }' "$RESULTS_DIR/stats.csv" | sort
    if [ -s "$RESULTS_DIR/chaos.log" ]; then echo; echo "## Сбои во время теста"; echo; sed 's/^/    /' "$RESULTS_DIR/chaos.log"; fi
  } >> "$RESULTS_DIR/report.md"
  "${dc[@]}" logs --no-color > "$RESULTS_DIR/logs.txt" 2>&1

  if [ "${KEEP:-0}" != "1" ]; then "${dc[@]}" down -v --remove-orphans >/dev/null 2>&1; fi
  echo
  echo "Отчёт: $RESULTS_DIR/report.md"
  exit "$verdict"
  )
}

# Стресс: ресурсы и сеть из сценария, а поток — ступенями от ¼ до ×4 пика этого сценария, каждая
# ступень примерно на треть выше предыдущей. Лимит СМС-провайдера снят, сбоев нет: ищем предел именно
# сервера. Внешнее время ускорено ×10 — СМС «доходят» быстрее, поэтому k6 нужно меньше VU.
run_stress() {
  local scenario="$1"
  ( load_scenario "$scenario"
    local peak; peak=$(awk "BEGIN { print ${PEAK_X} * ${TOTAL_VOTES} / $REAL_DURATION_SEC }")
    export MODE=stress CHAOS= SMS_RATE=100000 SMS_OUTAGE_SEC=0
    export STRESS_STEPS="${STRESS_STEPS:-10}" STRESS_STEP_SEC="${STRESS_STEP_SEC:-45}"
    local from="${STRESS_FROM:-$(awk "BEGIN { print ($peak / 4 > 5 ? $peak / 4 : 5) }")}"
    local to="${STRESS_TO:-$(awk "BEGIN { print $peak * 4 }")}"
    export STRESS_RATES; STRESS_RATES=$(awk -v a="$from" -v b="$to" -v n="$STRESS_STEPS" \
      'BEGIN { for (i = 0; i < n; i++) printf "%s%d", (i ? "," : ""), a * (b / a) ^ (n > 1 ? i / (n - 1) : 0) + 0.5 }')
    local total=$(( STRESS_STEPS * (STRESS_STEP_SEC + 5) ))
    export REAL_DURATION_SEC=$(( total * 10 ))
    run_one "$scenario" "${total}s" )
}

# Длительный прогон: ровный средний поток (по умолчанию TOTAL_VOTES / 3 ч) в реальном времени, без сбоев.
# Ищем то, что копится со временем: рост памяти, замедление по мере роста базы.
run_soak() {
  local scenario="$1" duration="${2:-30m}"
  ( load_scenario "$scenario"
    export MODE=soak CHAOS= SMS_OUTAGE_SEC=0
    export SOAK_RATE="${SOAK_RATE:-$(awk "BEGIN { print ${TOTAL_VOTES} / 10800 }")}"
    export REAL_DURATION_SEC; REAL_DURATION_SEC=$(to_sec "$duration")
    run_one "$scenario" "$duration" )
}

# Всё в функции: bash разбирает её целиком до запуска, поэтому правка run.sh во время теста ничего не сломает.
main() {
case "${1:-}" in
  plan) shift; plan "$@" ;;
  stress) [ -n "${2:-}" ] || die "укажите сценарий: ./run.sh stress realistic"; run_stress "$2" ;;
  soak) [ -n "${2:-}" ] || die "укажите сценарий: ./run.sh soak realistic 30m"; run_soak "$2" "${3:-30m}" ;;
  bench) echo "Скорость одного ядра: $(bench 0) (больше — быстрее). Запустите то же на VPS и сравните." ;;
  all)
    status=0
    for s in optimistic realistic pessimistic; do run_one "$s" "${2:-30m}" || status=1; done
    exit $status ;;
  ''|-h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) run_one "$1" "${2:-30m}" ;;
esac
}

main "$@"; exit $?
