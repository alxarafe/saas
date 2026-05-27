#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Benchmark completo (Bruno + HTTP directo)
#  Uso: ./bin/test.sh [iteraciones]
#  Por defecto: 5 iteraciones por stack
# ============================================================================
set -e

ITERATIONS="${1:-5}"

echo "  Ejecutando benchmark (${ITERATIONS} iteraciones por stack)..."
echo ""

exec ./tests/benchmark.sh "${ITERATIONS}"
