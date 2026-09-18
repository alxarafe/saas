#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack Benchmark — entry point desde el host
#  Uso: ./tests/benchmark.sh [iteraciones]
# ============================================================================
set -e

BRUNO_CONTAINER="saas-bruno"
ITERATIONS="${1:-5}"
AUTH_TOKEN="${AUTH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI}"

# Verificar que el contenedor bruno esté corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${BRUNO_CONTAINER}$"; then
  echo "  El contenedor '${BRUNO_CONTAINER}' no está corriendo."
  echo "  Ejecuta primero: docker compose up -d bruno"
  exit 1
fi

# Pre-flight: todos los stacks deben estar sanos antes del benchmark
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

check_health "saas-php-api"    "php"
check_health "saas-python-api" "python"
check_health "saas-kotlin-api" "kotlin"
check_health "saas-node-api"   "node"
check_health "saas-go-api"     "go"

echo "  Ejecutando benchmark en el contenedor '${BRUNO_CONTAINER}'..."
echo "  Iteraciones por stack: ${ITERATIONS}"
echo ""

docker exec -i -e AUTH_TOKEN="${AUTH_TOKEN}" "${BRUNO_CONTAINER}" node /tests/benchmark.mjs "${ITERATIONS}"
