#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Reiniciar servicios
#  Uso: ./bin/docker-restart.sh [servicio...]
#  Ejemplos:
#    ./bin/docker-restart.sh              → reinicia todo
#    ./bin/docker-restart.sh php-api      → solo php
# ============================================================================
set -e

echo "  Reiniciando servicios..."
docker compose restart "$@"

echo ""
echo "  Servicios activos:"
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
