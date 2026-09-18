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
├── benchmarks/
│   └── results/          # Resultados k6 (por stack, JSON)
├── tests/
│   ├── benchmark.sh      # Punto de entrada para benchmark
│   ├── bruno/            # Suite de contract testing
│   │   ├── benchmark.mjs # Script de benchmark (Node)
│   │   ├── bruno.json    # Configuración de colección
│   │   ├── stacks.json   # Definición de stacks bajo test
│   │   └── tests/        # Tests .bru (Bruno)
│   └── k6/               # Benchmarks de carga (Fase 3)
│       └── mixed-workload.js
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

Los servicios de datos/API tienen límites de recursos (`cpus`/`mem_limit`) para
que los benchmarks de carga sean reproducibles y comparables justos.

## Benchmark de carga (Fase 3 — k6)

El servicio `k6` (`profiles: [k6]`) no arranca con `docker compose up`; se ejecuta
uno-de-una-vez con `bin/k6.sh`, que mide cada stack por separado en la red de
compose (servicios internos: `http://<stack>:3000`).

**Escenario Mixed Workload** (`tests/k6/mixed-workload.js`):
- 75 % lecturas (`GET /health`, `/users`, `/me`)
- 15 % escrituras (`POST /users/bulk`)
- 8 % auth (`POST /auth/login`)
- 2 % errores (`GET /not-found`, `GET /me` sin token)

Configuración: `VU=10 DURATION=30s THINK_TIME=0.5` (variables de entorno).
Cada ejecución genera un JSON resumen en `benchmarks/results/mixed-workload-<stack>.json`.

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
