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
│   ├── php/
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
