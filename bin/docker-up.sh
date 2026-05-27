#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Levantar todos los servicios
#  Uso: ./bin/docker-up.sh [servicio...]
#  Ejemplos:
#    ./bin/docker-up.sh                  → levanta todo
#    ./bin/docker-up.sh php-api go-api   → solo php y go
# ============================================================================
set -e

echo "  Construyendo imágenes y levantando servicios..."
docker compose up -d --build "$@"

echo ""
echo "  Servicios activos:"
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
