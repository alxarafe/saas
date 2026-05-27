#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Detener todos los servicios
#  Uso: ./bin/docker-down.sh
# ============================================================================
set -e

echo "  Deteniendo servicios..."
docker compose down
echo "  ✓ Servicios detenidos"
