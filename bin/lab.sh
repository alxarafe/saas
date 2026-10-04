#!/usr/bin/env bash
# ============================================================================
#  SaaS Multi-Stack — batería completa del laboratorio
#  Uso: ./bin/lab.sh
#
#  Ejecuta contract tests, benchmark ligero y benchmarks k6. Los parámetros de
#  k6 se pueden reducir para una ejecución rápida mediante variables de entorno.
# ============================================================================
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
RESULTS_DIR="$ROOT_DIR/benchmarks/results"
LAB_NAME="${LAB_NAME:-lab-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
LAB_DIR="$RESULTS_DIR/$LAB_NAME"
BENCH_ITERATIONS="${BENCH_ITERATIONS:-5}"
K6_SCENARIOS="${K6_SCENARIOS:-mixed error}"

mkdir -p "$LAB_DIR"

run_logged() {
  local name="$1"
  shift
  echo
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  $name"
  echo "════════════════════════════════════════════════════════════════════════"
  set +e
  "$@" 2>&1 | tee "$LAB_DIR/$name.log"
  local code=${PIPESTATUS[0]}
  set -e
  if ((code != 0)); then
    echo "La fase '$name' falló (código $code). Log: $LAB_DIR/$name.log" >&2
    exit "$code"
  fi
}

echo "Batería completa del laboratorio: $LAB_NAME"
echo "Resultados: $LAB_DIR"

run_logged up "$ROOT_DIR/bin/docker-up.sh"
run_logged contract "$ROOT_DIR/bin/test-simple.sh"
run_logged latency "$ROOT_DIR/bin/test.sh" "$BENCH_ITERATIONS"

for scenario in $K6_SCENARIOS; do
  case "$scenario" in
    mixed|error) ;;
    *) echo "Escenario k6 desconocido: $scenario (usa mixed o error)" >&2; exit 2 ;;
  esac
  run_name="$LAB_NAME-$scenario"
  run_logged "k6-$scenario" env RUN_NAME="$run_name" SCENARIO="$scenario" "$ROOT_DIR/bin/k6.sh"
done

python3 "$ROOT_DIR/benchmarks/lab-report.py" "$LAB_DIR" \
  --k6-dirs $(for scenario in $K6_SCENARIOS; do printf '%s ' "$RESULTS_DIR/$LAB_NAME-$scenario"; done)

echo
echo "Batería completada. Informe: $LAB_DIR/report.md"
