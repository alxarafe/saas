#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Construir imágenes sin levantar servicios
#  Uso: ./bin/docker-build.sh [servicio...]
# ============================================================================
set -e

echo "  Construyendo imágenes..."
docker compose build "$@"
echo "  ✓ Imágenes construidas"
