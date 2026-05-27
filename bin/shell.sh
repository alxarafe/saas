#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Abrir shell interactiva en un contenedor
#  Uso: ./bin/shell.sh <servicio>
#  Ejemplos:
#    ./bin/shell.sh php-api
#    ./bin/shell.sh bruno
#    ./bin/shell.sh postgres
# ============================================================================
set -e

if [ -z "$1" ]; then
  echo "  Uso: ./bin/shell.sh <servicio>"
  echo "  Servicios disponibles:"
  docker ps --format "{{.Names}}" | while read -r name; do
    echo "    - ${name#saas-}"
  done
  exit 1
fi

exec docker compose exec "$1" sh -c "exec \$(command -v bash || command -v sh)"
