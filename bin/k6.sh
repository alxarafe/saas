#!/usr/bin/env bash
# Reproducible load sweep in an isolated Compose project and database volume.
# RATES="20 50 100 200" REPEATS=5 WARMUP=30s DURATION=3m ./bin/k6.sh [stacks...]
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILE="$ROOT_DIR/benchmarks/docker-compose.yml"
RESULTS_DIR="$ROOT_DIR/benchmarks/results"
RUN_NAME="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RUN_DIR="$RESULTS_DIR/$RUN_NAME"
COMPOSE=(docker compose --project-name saas-benchmark -f "$COMPOSE_FILE")
RATES=${RATES:-"20 50 100 200"}
REPEATS=${REPEATS:-5}
WARMUP=${WARMUP:-30s}
DURATION=${DURATION:-3m}
SEED_ROWS=${SEED_ROWS:-10000}
PRE_VUS=${PRE_VUS:-50}
MAX_VUS=${MAX_VUS:-500}
P95_TARGET_MS=${P95_TARGET_MS:-100}
MAX_FAILURE_RATE=${MAX_FAILURE_RATE:-0.01}
MIN_COMPLETION_RATIO=${MIN_COMPLETION_RATIO:-0.99}
AUTH_TOKEN=${AUTH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI}
# Static token without exp is intentional for this lab; unsafe in production.

if (($#)); then STACKS=("$@"); else STACKS=(php python kotlin node go); fi
for stack in "${STACKS[@]}"; do
  case "$stack" in php|python|kotlin|node|go) ;; *) echo "Stack desconocido: $stack" >&2; exit 2;; esac
done
[[ $REPEATS =~ ^[1-9][0-9]*$ && $SEED_ROWS =~ ^[0-9]+$ ]] || {
  echo 'REPEATS y SEED_ROWS deben ser enteros válidos' >&2; exit 2;
}
for rate in $RATES; do
  [[ $rate =~ ^[1-9][0-9]*$ ]] || { echo "Tasa inválida: $rate" >&2; exit 2; }
done

mkdir -p "$RUN_DIR"
jq -n --arg created_at "$(date -u +%FT%TZ)" --arg rates "$RATES" \
  --arg stacks "${STACKS[*]}" --arg duration "$DURATION" --arg warmup "$WARMUP" \
  --argjson repeats "$REPEATS" --argjson seed_rows "$SEED_ROWS" \
  '{created_at:$created_at, rates:$rates, stacks:$stacks, duration:$duration,
    warmup:$warmup, repeats:$repeats, seed_rows:$seed_rows}' > "$RUN_DIR/manifest.json"

reset_fixture() {
  # Only the dedicated saas-benchmark PostgreSQL volume is touched.
  "${COMPOSE[@]}" exec -T postgres psql -U saas -d saas -v ON_ERROR_STOP=1 \
    -c 'TRUNCATE TABLE users RESTART IDENTITY' \
    -c "INSERT INTO users (email, password_hash) SELECT 'seed-' || n || '@example.com', 'seed-hash' FROM generate_series(1, $SEED_ROWS) AS n" >/dev/null
  local rows
  rows=$("${COMPOSE[@]}" exec -T postgres psql -U saas -d saas -Atc 'SELECT COUNT(*) FROM users')
  [[ $rows == "$SEED_ROWS" ]] || { echo "Fixture incorrecto: $rows filas" >&2; exit 1; }
}

contract_test() {
  local stack=$1
  echo "Contrato Bruno: $stack"
  "${COMPOSE[@]}" --profile contract run --rm --no-deps bruno \
    bru run -r /tests/tests --env-var "base_url=http://$stack-api:3000" \
    --env-var "auth_token=$AUTH_TOKEN"
  local partial_rows
  partial_rows=$("${COMPOSE[@]}" exec -T postgres psql -U saas -d saas -Atc \
    "SELECT COUNT(*) FROM users WHERE email = 'rollback-probe@example.com'")
  [[ $partial_rows == 0 ]] || {
    echo "Rollback incumplido: $partial_rows filas parciales" >&2; exit 1;
  }
}

monitor_stats() {
  local output=$1
  printf 'utc,container,cpu_percent,memory,network_io\n' > "$output"
  while :; do
    local ids
    ids=$(docker ps --filter label=com.docker.compose.project=saas-benchmark --format '{{.ID}}')
    if [[ -n $ids ]]; then
      docker stats --no-stream --format "$(date -u +%FT%TZ),{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}" $ids >> "$output" 2>/dev/null || true
    fi
    sleep 5
  done
}

run_load() {
  local stack=$1 rate=$2 duration=$3 round=$4 phase=$5 raw=$6
  local run_id="${stack}-${rate}-${round}-${phase}"
  local args=(--rm --no-deps --user "$(id -u):$(id -g)"
    -e "STACK=$stack" -e "TARGET_URL=http://$stack-api:3000"
    -e "RATE=$rate" -e "DURATION=$duration" -e "PRE_VUS=$PRE_VUS"
    -e "MAX_VUS=$MAX_VUS" -e "RUN_ID=$run_id" -e "AUTH_TOKEN=$AUTH_TOKEN")
  if [[ -n $raw ]]; then
    "${COMPOSE[@]}" --profile load run "${args[@]}" k6 \
      run --out "json=/results/$raw" /tests/mixed-workload.js
  else
    "${COMPOSE[@]}" --profile load run "${args[@]}" k6 \
      run /tests/mixed-workload.js
  fi
}

echo 'Preparando proyecto Docker aislado saas-benchmark'
"${COMPOSE[@]}" up -d --wait postgres
"${COMPOSE[@]}" build bruno "${STACKS[@]/%/-api}"

for ((round=1; round<=REPEATS; round++)); do
  for rate in $RATES; do
    for ((step=0; step<${#STACKS[@]}; step++)); do
      index=$(((step + round - 1) % ${#STACKS[@]}))
      stack=${STACKS[index]}
      service="$stack-api"
      raw="raw-${stack}-r${rate}-n${round}.json"
      summary="mixed-${stack}-r${rate}-n${round}.json"
      metrics="resources-${stack}-r${rate}-n${round}.csv"

      echo "Ronda $round/$REPEATS: $stack a $rate RPS"
      "${COMPOSE[@]}" up -d --wait "$service"
      if ((round == 1)); then contract_test "$stack"; fi
      reset_fixture
      set +e
      run_load "$stack" "$rate" "$WARMUP" "$round" warmup ''
      warmup_code=$?
      set -e
      if ((warmup_code != 0 && warmup_code != 99)); then
        echo "Calentamiento falló con código $warmup_code" >&2
        exit "$warmup_code"
      fi
      # Warm-up writes are excluded from the measured database state.
      reset_fixture

      monitor_stats "$RUN_DIR/$metrics" &
      monitor_pid=$!
      set +e
      run_load "$stack" "$rate" "$DURATION" "$round" measure "$RUN_NAME/$raw"
      code=$?
      set -e
      kill "$monitor_pid" 2>/dev/null || true
      wait "$monitor_pid" 2>/dev/null || true
      if ((code != 0 && code != 99)); then
        echo "k6 falló con código $code; datos crudos conservados en $raw" >&2
        exit "$code"
      fi
      python3 "$ROOT_DIR/benchmarks/k6-aggregate.py" \
        "$RUN_DIR/$raw" "$stack" "$RUN_DIR/$summary" "$rate" "$DURATION" "$round"
      jq -r '"  completadas=\(.completed_rps) RPS p95=\(.latency_ms.p95) ms fallos=\(.failure_rate) descartadas=\(.dropped_iterations)"' \
        "$RUN_DIR/$summary"
      if ((code == 99)); then echo '  Umbral de carga superado; resumen conservado.'; fi
      if ((round == REPEATS)); then contract_test "$stack"; fi
      "${COMPOSE[@]}" stop "$service" >/dev/null
    done
  done
done

echo "Resultados: $RUN_DIR"
python3 "$ROOT_DIR/benchmarks/compare.py" "$RUN_DIR" --repeats "$REPEATS" \
  --p95-ms "$P95_TARGET_MS" --max-failure-rate "$MAX_FAILURE_RATE" \
  --min-completion-ratio "$MIN_COMPLETION_RATIO"
