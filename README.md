# SaaS Multi-Stack API Laboratory

Repositorio laboratorio para implementar el mismo contrato API en múltiples lenguajes y runtimes, desplegados con Docker Compose.

Todas las implementaciones deben comportarse de forma idéntica desde la perspectiva del cliente.

## Inicio rápido

```bash
# Levantar todos los servicios
./bin/docker-up.sh

# Ejecutar tests de contrato
./bin/test-simple.sh

# Benchmark completo
./bin/test.sh

# Documentación completa
# → docs/index.md
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `./bin/docker-up.sh` | Construye y levanta servicios |
| `./bin/docker-down.sh` | Detiene servicios |
| `./bin/docker-restart.sh` | Reinicia servicios |
| `./bin/docker-logs.sh` | Muestra logs |
| `./bin/docker-build.sh` | Construye imágenes |
| `./bin/test.sh` | Benchmark completo |
| `./bin/test-simple.sh` | Tests rápidos de contrato |
| `./bin/shell.sh` | Shell en un contenedor |

## Stacks

| Stack | Lenguaje | Puerto host |
|-------|----------|-------------|
| PHP API | PHP 8.4 | `18080` |
| Kotlin API | Kotlin/JVM | `18081` |
| Python API | Python 3.13 | `18082` |
| Node API | Node.js + TypeScript | `18083` |
| Go API | Go 1.24 | `18084` |

## Documentación

La documentación completa está en [`docs/`](docs/index.md).

| Documento | Contenido |
|-----------|-----------|
| [Visión general](docs/01-overview.md) | Stacks, principios, infraestructura |
| [Inicio rápido](docs/02-quickstart.md) | Levantar, testear, detener |
| [Arquitectura](docs/03-architecture.md) | Estructura del repo, contrato API, BD |
| [Testing](docs/04-testing.md) | Contract tests, benchmark, cómo añadir tests |
| [Scripts](docs/05-scripts.md) | Referencia de scripts en `bin/` |
