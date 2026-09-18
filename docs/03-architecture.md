# Arquitectura

## Estructura del repositorio

```
.
├── bin/                  # Scripts de gestión (docker, tests, shell)
├── docker/               # Dockerfiles por stack
│   ├── bruno/
│   ├── go/
│   ├── kotlin/
│   ├── node/
│   ├── php/              # Dockerfile + Caddyfile (FrankenPHP)
│   └── python/
├── docker-compose.yml    # Orquestación principal
├── docs/                 # Documentación
├── go-api/               # Implementación Go
├── kotlin-api/           # Implementación Kotlin
├── node-api/             # Implementación Node.js
├── php-api/              # Implementación PHP
├── python-api/           # Implementación Python
├── tests/
│   ├── benchmark.sh      # Punto de entrada para benchmark
│   └── bruno/            # Suite de contract testing
│       ├── benchmark.mjs # Script de benchmark (Node)
│       ├── bruno.json    # Configuración de colección
│       ├── stacks.json   # Definición de stacks bajo test
│       └── tests/        # Tests .bru (Bruno)
└── README.md
```

## Contrato API

Todas las implementaciones exponen el mismo conjunto de endpoints:

### `GET /health`

- **Respuesta:** `200 OK`, `{"status":"ok"}`

### `GET /nonexistent`

- **Respuesta:** `404 Not Found`

### Puerto interno

Todos los contenedores escuchan en el puerto `3000`. El mapeo a puertos host es independiente por servicio.

## Runtimes y builds

| Stack | Runtime | Build |
|-------|---------|-------|
| PHP | FrankenPHP (Caddy + PHP) | `docker/php/Dockerfile` + `Caddyfile` (`php_server`) |
| Kotlin | eclipse-temurin:21 (dist) | Gradle multi-stage |
| Python | Uvicorn | bind-mount de código (`./python-api:/app`) |
| Node | `node:22-alpine` | `tsc` multi-stage → `node dist/index.js` |
| Go | `alpine:3.20` | `CGO_ENABLED=0` multi-stage, binario estático |

## Salud y arranque

Todos los servicios definen un `healthcheck`; las APIs sondean `GET /health` y
`postgres` usa `pg_isready`. Las dependencias usan `condition: service_healthy`,
por lo que `docker compose up` no arranca Bruno hasta que las 5 APIs responden.
Los scripts de test abortan antes de ejecutar si un stack no está `healthy`.

## Base de datos

PostgreSQL 17 compartida. Cada implementación se conecta con las mismas credenciales:

| Variable | Valor |
|----------|-------|
| Host | `postgres` |
| Puerto | `5432` |
| Usuario | `saas` |
| Contraseña | `saas` |
| Base de datos | `saas` |

## Contract testing (Bruno)

Bruno se ejecuta en un contenedor independiente (`saas-bruno`) con acceso a las APIs a través de la red interna de Docker. Los tests se montan desde `tests/bruno/` en `/tests/`.

Cada test `.bru` se ejecuta contra cada stack definido en `stacks.json` usando la variable de entorno `base_url` para apuntar al servicio correspondiente.
