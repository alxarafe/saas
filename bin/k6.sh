#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — k6 Mixed Workload benchmark (Fase 3)
#  Uso: ./bin/k6.sh [stacks...]
#  Ejemplos:
#    ./bin/k6.sh                       → los 5 stacks (secuencial)
#    ./bin/k6.sh php go                → solo php y go
#
#  Configuración opcional (env):
#    VU         usuarios virtuales      (default 10)
#    DURATION   duración por stack      (default 30s)
#    THINK_TIME pausa por iteración     (default 0.5)
#    AUTH_TOKEN token estático para /me
#
#  Cada stack se mide por separado (mismas condiciones). Resultados en
#  benchmarks/results/mixed-workload-<stack>.json
# ============================================================================
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
RESULTS_DIR="$ROOT_DIR/benchmarks/results"

VU="${VU:-10}"
DURATION="${DURATION:-30s}"
THINK_TIME="${THINK_TIME:-0.5}"
AUTH_TOKEN="${AUTH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI}"

check_health() {
  local container="$1" label="$2"
  local status
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}started{{end}}' "${container}" 2>/dev/null)
  if [ "$status" != "healthy" ]; then
    echo "  [${label}] NO SANO (estado: ${status})"
    echo "  Ejecuta primero: ./bin/docker-up.sh ${container#saas-}"
    exit 1
  fi
  echo "  [${label}] sano"
}

run_stack() {
  local name="$1" url="$2" container="$3"
  local code

  check_health "${container}" "$name"

  echo ""
  echo "  ─────────────────────────────────────────────────────────"
  echo "  k6 → ${name}  (${url})"
  echo "  VU=${VU} DURATION=${DURATION} THINK_TIME=${THINK_TIME}"
  echo "  ─────────────────────────────────────────────────────────"

  docker compose --profile k6 run --rm \
    -e STACK="${name}" \
    -e TARGET_URL="${url}" \
    -e VU="${VU}" \
    -e DURATION="${DURATION}" \
    -e THINK_TIME="${THINK_TIME}" \
    -e AUTH_TOKEN="${AUTH_TOKEN}" \
    k6 run --out json="/results/raw-${name}.json" /tests/mixed-workload.js
  code=$?

  if [ "$code" -eq 0 ] || [ "$code" -eq 99 ]; then
    python3 "$ROOT_DIR/benchmarks/k6-aggregate.py" \
      "$RESULTS_DIR/raw-${name}.json" "$name" \
      "$RESULTS_DIR/mixed-workload-${name}.json" "$VU" "$DURATION"
    rm -f "$RESULTS_DIR/raw-${name}.json"
  fi

  case "$code" in
    0) ;;
    99)
      echo "  ⚠ [${name}] umbral de fallo superado — revísalo en benchmarks/results/mixed-workload-${name}.json"
      ;;
    *)
      echo "  [${name}] k6 terminó con error (exit ${code})"
      return 1
      ;;
  esac
}

print_comparison() {
  echo ""
  echo "  ╔═══════════════════════════════════════════════════════════════════╗"
  echo "  ║   k6 Mixed Workload — Comparativa por stack                        ║"
  echo "  ╚═══════════════════════════════════════════════════════════════════╝"
  printf "  %-8s %7s %7s %8s %8s %8s %8s\n" STACK REQS RPS "p50 ms" "p95 ms" "p99 ms" "err%"
  for svc in "$@"; do
    local f="$RESULTS_DIR/mixed-workload-$svc.json"
    if [ ! -f "$f" ]; then
      printf "  %-8s %s\n" "$svc" "(sin resultados)"
      continue
    fi
    line=$(jq -r '[.http_reqs, (.throughput_rps|round), (.http_req_duration.p50|round), (.http_req_duration.p95|round), (.http_req_duration.p99|round), (.http_req_failed_rate*100)] | @tsv' "$f")
    read -r reqs rps p50 p95 p99 err <<EOF
$line
EOF
    printf "  %-8s %7s %7s %8s %8s %8s %7.2f%%\n" "$svc" "$reqs" "$rps" "$p50" "$p95" "$p99" "$err"
  done
}

# El contenedor k6 corre como uid 12345 (imagen grafana/k6, no-root): el
# bind-mount de resultados debe ser escribible por "otros".
mkdir -p "$RESULTS_DIR"
chmod 777 "$RESULTS_DIR" 2>/dev/null || true

echo "  k6 Mixed Workload — pre-flight:"
check_health "saas-php-api"    "php"
check_health "saas-python-api" "python"
check_health "saas-kotlin-api" "kotlin"
check_health "saas-node-api"   "node"
check_health "saas-go-api"     "go"

if [ $# -gt 0 ]; then
  SELECTED="$@"
else
  SELECTED="php python kotlin node go"
fi

for svc in $SELECTED; do
  case "$svc" in
    php)    run_stack "php"    "http://php-api:3000"    "saas-php-api" ;;
    python) run_stack "python" "http://python-api:3000" "saas-python-api" ;;
    kotlin) run_stack "kotlin" "http://kotlin-api:3000" "saas-kotlin-api" ;;
    node)   run_stack "node"   "http://node-api:3000"   "saas-node-api" ;;
    go)     run_stack "go"     "http://go-api:3000"     "saas-go-api" ;;
    *)
      echo "  Stack desconocido: $svc"
      echo "  Válidos: php, python, kotlin, node, go"
      ;;
  esac
done

print_comparison $SELECTED

echo ""
echo "  Resultados individuales:"
for svc in $SELECTED; do
  [ -f "$RESULTS_DIR/mixed-workload-$svc.json" ] && echo "    benchmarks/results/mixed-workload-$svc.json"
done