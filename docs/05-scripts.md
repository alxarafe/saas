# Scripts de gestión (`bin/`)

Todos los scripts son auto-contenidos y se ejecutan desde la raíz del repositorio.

## Docker

| Script | Descripción |
|--------|-------------|
| `bin/docker-up.sh [servicio...]` | Construye imágenes y levanta servicios |
| `bin/docker-down.sh` | Detiene todos los servicios |
| `bin/docker-restart.sh [servicio...]` | Reinicia servicios |
| `bin/docker-build.sh [servicio...]` | Construye imágenes sin levantar |
| `bin/docker-logs.sh [servicio...] [-f]` | Muestra logs |

## Testing

| Script | Descripción |
|--------|-------------|
| `bin/test.sh [iteraciones]` | Benchmark completo (Bruno + HTTP directo). Aborta si algún stack no está `healthy` |
| `bin/test-simple.sh [stacks...]` | Tests rápidos de contrato (solo Bruno). Aborta si algún stack no está `healthy` |
| `bin/k6.sh [stacks...]` | k6 Mixed Workload (Fase 3). Ejecuta secuencialmente cada stack con `grafana/k6`. Aborta si algún stack no está `healthy` |

## Utilidades

| Script | Descripción |
|--------|-------------|
| `bin/shell.sh <servicio>` | Shell interactivo en un contenedor |

## Ejemplos de uso

```bash
# Levantar todo y ejecutar tests
./bin/docker-up.sh
./bin/test-simple.sh

# Trabajar solo con PHP y Go
./bin/docker-up.sh php-api go-api
./bin/test-simple.sh php go

# Benchmark completo (Bruno)
./bin/test.sh 10

# Benchmark k6 Mixed Workload (los 5 stacks, 30s cada uno)
./bin/k6.sh
# Configuración: VU=20 DURATION=60s ./bin/k6.sh go php

# Ver logs de un stack
./bin/docker-logs.sh python-api -f
```
