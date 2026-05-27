#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack Benchmark — entry point desde el host
#  Uso: ./tests/benchmark.sh [iteraciones]
# ============================================================================
set -e

BRUNO_CONTAINER="saas-bruno"
ITERATIONS="${1:-5}"

# Verificar que el contenedor bruno esté corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${BRUNO_CONTAINER}$"; then
  echo "  El contenedor '${BRUNO_CONTAINER}' no está corriendo."
  echo "  Ejecuta primero: docker compose up -d bruno"
  exit 1
fi

echo "  Ejecutando benchmark en el contenedor '${BRUNO_CONTAINER}'..."
echo "  Iteraciones por stack: ${ITERATIONS}"
echo ""

docker exec -i "${BRUNO_CONTAINER}" node /tests/benchmark.mjs "${ITERATIONS}"
