# Testing

## Stack de testing

- **Bruno CLI** (`@usebruno/cli`) para contract testing
- **Benchmark** personalizado en Node.js que mide tiempos con y sin overhead de Bruno
- **Scripts en `bin/`** como puntos de entrada unificados

## Tipos de tests

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
