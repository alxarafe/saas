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

if ! docker ps --format '{{.Names}}' | grep -q "^${BRUNO_CONTAINER}$"; then
  echo "  El contenedor '${BRUNO_CONTAINER}' no está corriendo."
  echo "  Ejecuta primero: ./bin/docker-up.sh bruno"
  exit 1
fi

run_stack() {
  local name="$1" url_var="$2"
  local url
  url=$(docker inspect "${BRUNO_CONTAINER}" 2>/dev/null |
    sed -n "s/.*${url_var}=\([^\",]*\).*/\1/p")

  if [ -z "$url" ]; then
    echo "  [${name}] SKIP — no se pudo resolver URL"
    return
  fi

  echo "  ─── ${name} ───"
  docker exec "${BRUNO_CONTAINER}" bru run /tests/tests --env-var "base_url=${url}" 2>&1 |
    sed 's/^/    /'
  echo ""
}

if [ $# -gt 0 ]; then
  for stack in "$@"; do
    case "$stack" in
      php)    run_stack "php"    "BASE_URL_PHP" ;;
      python) run_stack "python" "BASE_URL_PYTHON" ;;
      kotlin) run_stack "kotlin" "BASE_URL_KOTLIN" ;;
      node)   run_stack "node"   "BASE_URL_NODE" ;;
      go)     run_stack "go"     "BASE_URL_GO" ;;
      *)
        echo "  Stack desconocido: $stack"
        echo "  Válidos: php, python, kotlin, node, go"
        ;;
    esac
  done
else
  run_stack "php"    "BASE_URL_PHP"
  run_stack "python" "BASE_URL_PYTHON"
  run_stack "kotlin" "BASE_URL_KOTLIN"
  run_stack "node"   "BASE_URL_NODE"
  run_stack "go"     "BASE_URL_GO"
fi
