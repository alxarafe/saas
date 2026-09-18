# SaaS Multi-Stack API Laboratory

![PHP Version](https://img.shields.io/badge/PHP-8.4+-blueviolet?style=flat-square)
![Kotlin Version](https://img.shields.io/badge/Kotlin-2.0.21-orange?style=flat-square)
![JVM Version](https://img.shields.io/badge/JVM-21+-orange?style=flat-square)
![Python Version](https://img.shields.io/badge/Python-3.13-blue?style=flat-square)
![Node Version](https://img.shields.io/badge/Node.js-22-green?style=flat-square)
![TypeScript Version](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square)
![Go Version](https://img.shields.io/badge/Go-1.24-cyan?style=flat-square)
![PostgreSQL Version](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square)
![Docker Compose](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ed?style=flat-square)
[![Contract Testing](https://img.shields.io/badge/Contract%20Testing-Bruno-5C2ED1?style=flat-square)](https://www.usebruno.com)

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
| Kotlin API | Kotlin 2.0.21 / JVM 21 | `18081` |
| Python API | Python 3.13 | `18082` |
| Node API | Node.js 22 + TypeScript 5.7 | `18083` |
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
