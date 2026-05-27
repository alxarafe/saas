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
| `bin/test.sh [iteraciones]` | Benchmark completo (Bruno + HTTP directo) |
| `bin/test-simple.sh [stacks...]` | Tests rápidos de contrato (solo Bruno) |

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

# Benchmark completo
./bin/test.sh 10

# Ver logs de un stack
./bin/docker-logs.sh python-api -f
```
