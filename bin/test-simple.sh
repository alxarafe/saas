#!/usr/bin/env sh
# ============================================================================
#  SaaS Multi-Stack — Tests rápidos de contrato (solo Bruno, sin benchmark)
#  Uso: ./bin/test-simple.sh [stacks...]
#  Ejemplos:
#    ./bin/test-simple.sh                  → todos los stacks
#    ./bin/test-simple.sh php go           → solo php y go
# ============================================================================
set -e

BRUNO_CONTAINER="saas-bruno"
AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI"

if ! docker ps --format '{{.Names}}' | grep -q "^${BRUNO_CONTAINER}$"; then
  echo "  El contenedor '${BRUNO_CONTAINER}' no está corriendo."
  echo "  Ejecuta primero: ./bin/docker-up.sh bruno"
  exit 1
fi

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

run_stack() {
  local name="$1" url_var="$2" container="$3"
  local url
  check_health "${container}" "$name"
  url=$(docker inspect "${BRUNO_CONTAINER}" 2>/dev/null |
    sed -n "s/.*${url_var}=\([^\",]*\).*/\1/p")

  if [ -z "$url" ]; then
    echo "  [${name}] SKIP — no se pudo resolver URL"
    return
  fi

  echo "  ─── ${name} ───"
  docker exec "${BRUNO_CONTAINER}" bru run -r /tests/tests --env-var "base_url=${url}" --env-var "auth_token=${AUTH_TOKEN}" 2>&1 |
    sed 's/^/    /'
  echo ""
}

if [ $# -gt 0 ]; then
  for stack in "$@"; do
    case "$stack" in
      php)    run_stack "php"    "BASE_URL_PHP"    "saas-php-api" ;;
      python) run_stack "python" "BASE_URL_PYTHON" "saas-python-api" ;;
      kotlin) run_stack "kotlin" "BASE_URL_KOTLIN" "saas-kotlin-api" ;;
      node)   run_stack "node"   "BASE_URL_NODE"   "saas-node-api" ;;
      go)     run_stack "go"     "BASE_URL_GO"     "saas-go-api" ;;
      *)
        echo "  Stack desconocido: $stack"
        echo "  Válidos: php, python, kotlin, node, go"
        ;;
    esac
  done
else
  run_stack "php"    "BASE_URL_PHP"    "saas-php-api"
  run_stack "python" "BASE_URL_PYTHON" "saas-python-api"
  run_stack "kotlin" "BASE_URL_KOTLIN" "saas-kotlin-api"
  run_stack "node"   "BASE_URL_NODE"   "saas-node-api"
  run_stack "go"     "BASE_URL_GO"     "saas-go-api"
fi
