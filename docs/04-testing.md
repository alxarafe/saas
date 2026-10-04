# Testing

## Stack de testing

- **Bruno CLI** (`@usebruno/cli`) para contract testing
- **Benchmark** personalizado en Node.js que mide tiempos con y sin overhead de Bruno
- **k6** (`grafana/k6`) para benchmark de carga mixta (Fase 3)
- **Scripts en `bin/`** como puntos de entrada unificados

## Tipos de tests

### Batería completa del laboratorio

Para ejecutar en una sola operación la suite contractual, el benchmark ligero y
los escenarios k6 (`mixed` y `error`), usar:

```bash
./bin/lab.sh
```

Genera un directorio `benchmarks/results/<id>/` con los logs de cada fase y un
`report.md` comparativo. La ejecución completa puede tardar bastante; para una
prueba corta:

```bash
RATES="20 50" REPEATS=2 DURATION=30s ./bin/lab.sh
```

Se pueden seleccionar escenarios con `K6_SCENARIOS=mixed` o
`K6_SCENARIOS="mixed error"`.

### Contract tests (Bruno)

Archivos `.bru` en `tests/bruno/tests/`. Verifican que cada implementación cumpla el contrato API.

```bash
# Todos los stacks
./bin/test-simple.sh

# Stacks específicos
./bin/test-simple.sh php go node
```

Antes de ejecutar, los scripts hacen un **pre-flight de salud**: si algún stack
no está `healthy` (sondeo de `/health` vía healthcheck de Docker), abortan y
indican cómo levantarlo (`./bin/docker-up.sh <servicio>`).

Los tests usan el bloque `tests` con sintaxis JavaScript:

```bru
meta {
  name: Health
  type: http
}

get {
  url: {{base_url}}/health
}

tests {
  test("Status is 200", function() {
    expect(res.getStatus()).to.eql(200);
  });
}
```

### Benchmark

Mide el rendimiento de cada stack combinando:

1. **Suite Bruno**: ejecuta los contract tests con aserciones y mide el tiempo total
2. **HTTP directo**: usa `fetch()` nativo de Node para medir latencia sin overhead

```bash
./bin/test.sh [iteraciones]

# Ejemplo: 10 iteraciones
./bin/test.sh 10
```

### Benchmark de carga (k6, Fase 3)

`bin/k6.sh` ejecuta el escenario **Mixed Workload** con una tasa de llegada fija.
Usa el proyecto Compose `saas-benchmark`, con una base de datos y un volumen
exclusivos. No borra ni restaura datos del proyecto Compose habitual. Antes y
después del calentamiento restablece `users` a `SEED_ROWS` filas; el calentamiento
no entra en los resultados. Ejecuta las rondas en orden rotativo y comprueba el
contrato con Bruno, incluido el rollback mediante una consulta directa a la BD.
Distribución aproximada por request:

| Categoría | % | Endpoints |
|-----------|---|-----------|
| Lecturas | 75 % | `GET /health`, `GET /users`, `GET /me` |
| Escrituras | 15 % | `POST /users/bulk` |
| Auth | 8 % | `POST /auth/login` |
| Errores | 2 % | `GET /not-found`, `GET /me` sin token |

Configuración: `RATES="20 50 100 200"`, `REPEATS=5`, `WARMUP=30s`,
`DURATION=3m`, `SEED_ROWS=10000`, `PRE_VUS=50`, `MAX_VUS=500`. Ejemplo corto:

```bash
RATES="20 50" REPEATS=2 DURATION=1m ./bin/k6.sh php go
```

También existe un escenario **Error Storm**, centrado en validaciones, auth y
conflictos transaccionales:

```bash
SCENARIO=error RATES="20 50" REPEATS=2 DURATION=30s ./bin/k6.sh
```

Para lanzar estas pruebas desde una interfaz local y ver el log y las métricas
al terminar:

```bash
./bin/dashboard.sh
# abrir http://localhost:8090
```

El cliente necesita Node.js en el host y acceso a Docker; los servicios, la
base de datos y k6 se ejecutan en contenedores. Para reproducirlo desde cero:

```bash
docker compose build
./bin/dashboard.sh
```

El dashboard es una herramienta de laboratorio: ejecuta los runners como el
usuario local y requiere que Docker esté disponible para ese usuario. Además
del benchmark general, permite ejecutar la comparativa editorial secuencial.
En el navegador se pueden elegir perfiles, tasas, repeticiones, filas iniciales
y VUs; los resultados aparecen en una tabla con RPS, p95, fallos, descartes y
estado `APTO`/`NO APTO`. Los resultados generales siguen siendo artefactos
ignorados por Git en `benchmarks/results/`.

Cada ejecución crea su propio directorio en `benchmarks/results/`. Cada ronda
conserva NDJSON crudo, un resumen `mixed-<stack>-r<tasa>-n<ronda>.json`
con latencias por endpoint, y muestras de `docker stats` en CSV. La tasa de fallo
excluye los `401/404` previstos y distingue incumplimientos del contrato, `5xx`
y errores de red. `dropped_iterations` indica si k6 no pudo ofrecer la tasa.
La carga superada no borra el resumen. `benchmarks/compare.py` compara las rondas
completas con límites configurables (`P95_TARGET_MS`, `MAX_FAILURE_RATE`,
`MIN_COMPLETION_RATIO`); el criterio por defecto es p95 ≤ 100 ms, fallos ≤ 1 %,
al menos 99 % de la tasa ofrecida y cero iteraciones descartadas. Es un criterio
de laboratorio, no un SLA de producto. El proyecto aislado puede pararse con
`docker compose -p saas-benchmark -f benchmarks/docker-compose.yml down`;
el volumen de datos queda disponible para inspección.

### Comparativa editorial del blog

Para los gráficos y resultados de la entrada del blog existe un runner separado
en `private/blog-benchmark-2026-10-02/run.sh`. Ejecuta tres perfiles explícitos
sobre una base de datos aislada:

```bash
PROFILES="read balanced write" RATES="50 200 500" REPEATS=3 \
WARMUP=10s DURATION=60s SEED_ROWS=100000 \
./private/blog-benchmark-2026-10-02/run.sh
```

Los perfiles representan lecturas, una mezcla equilibrada y escrituras
intensivas. Son hipótesis de tráfico del laboratorio. `/auth/login` no forma
parte de esta comparativa porque actualmente usa una contraseña sin hashing
real; medirlo como si fuera un login de producción sería engañoso.

El runner rota el orden de los stacks, restaura el fixture entre rondas y recoge
latencias por endpoint, errores, iteraciones descartadas y `docker stats`. Una
tasa solo se considera sostenible si completa al menos el 99 % de la oferta,
mantiene p95 ≤ 100 ms, tiene ≤ 1 % de fallos reales y cero iteraciones
descartadas. Es un criterio editorial del laboratorio, no un SLA.

Después de una ejecución, generar las imágenes con:

```bash
python3 private/blog-benchmark-2026-10-02/figures.py \
  private/blog-benchmark-2026-10-02/runs/<ejecución> --repeats 3
```

Al terminar la primera pasada se puede hacer una revisión provisional sin
sobrescribir las imágenes definitivas:

```bash
python3 private/blog-benchmark-2026-10-02/figures.py \
  private/blog-benchmark-2026-10-02/runs/<ejecución> --repeats 1 \
  --out-dir private/blog-benchmark-2026-10-02/images/pass-1
```

Una sola pasada sirve para detectar errores y tendencias gruesas; las
conclusiones finales deben basarse en las tres rondas y sus medianas.

El benchmark no cubre todavía soak prolongado, agotamiento configurable del
pool ni hashing real. Son líneas de trabajo posteriores y no bloquean esta
comparativa si sus límites se explican en el artículo.

## Añadir un nuevo test

1. Crear `tests/bruno/tests/<nombre>.bru`
2. Definir meta, request y tests (ver ejemplos existentes)
3. Ejecutar `./bin/test-simple.sh` para verificar

## Añadir un nuevo stack

1. Crear su directorio `<lenguaje>-api/` y Dockerfile en `docker/<lenguaje>/`
2. Añadir el servicio en `docker-compose.yml`
3. Añadir entrada en `tests/bruno/stacks.json`
4. Añadir variable `BASE_URL_<LENGUAJE>` en las variables de entorno del contenedor `bruno`

## Tests existentes

| Archivo | Endpoint | Verifica |
|---------|----------|----------|
| `health.bru` | `GET /health` | status 200, body.status == "ok" |
| `not_found.bru` | `GET /nonexistent` | status 404, code == "endpoint_not_found" |
| `auth/login-success.bru` | `POST /auth/login` | status 200, token is string |
| `auth/login-invalid-credentials.bru` | `POST /auth/login` | status 401, code == "invalid_credentials" |
| `auth/login-bad-json.bru` | `POST /auth/login` | status 400, code == "bad_request" |
| `auth/login-missing-fields.bru` | `POST /auth/login` | status 422, details incluyen email y password |
| `auth/login-wrong-types.bru` | `POST /auth/login` | status 422, details incluyen invalid_type |
| `auth/me-success.bru` | `GET /me` | status 200, id=1, email="admin@example.com" |
| `auth/me-missing-token.bru` | `GET /me` | status 401, code == "missing_token" |
| `auth/me-invalid-token.bru` | `GET /me` | status 401, code == "invalid_token" |
| `users/bulk-success.bru` | `POST /users/bulk` | status 201, data array, sin password_hash |
| `users/bulk-rollback.bru` | `POST /users/bulk` | status 409 + rollback (email duplicado en el batch) |
| `users/bulk-bad-json.bru` | `POST /users/bulk` | status 400, code == "bad_request" |
| `users/bulk-missing-fields.bru` | `POST /users/bulk` | status 422, detail data[0].password_hash required |
| `users/bulk-wrong-types.bru` | `POST /users/bulk` | status 422, detail data[0].email invalid_type |
| `users/bulk-data-not-array.bru` | `POST /users/bulk` | status 422, detail data invalid_type |
| `users/bulk-empty.bru` | `POST /users/bulk` | status 422, validation_error |
| `users/list-default.bru` | `GET /users` | status 200, limit=20, offset=0, sin password_hash, el probe de rollback nunca aparece |
| `users/list-paginated.bru` | `GET /users?limit=1&offset=0` | status 200, limit=1, ≤1 resultado |
| `users/list-invalid.bru` | `GET /users?limit=abc` | status 422, detail limit invalid_type |

**Total: 20 requests / 52 tests por stack.**
