#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Ver logs de servicios
#  Uso: ./bin/docker-logs.sh [servicio...] [-f]
#  Ejemplos:
#    ./bin/docker-logs.sh             → logs de todos (follow)
#    ./bin/docker-logs.sh php-api     → logs de php
#    ./bin/docker-logs.sh -f          → follow de todos
# ============================================================================
set -e

exec docker compose logs "$@"
