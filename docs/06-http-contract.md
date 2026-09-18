# Contrato HTTP

## Objetivo

Este documento define el contrato HTTP común para todos los stacks implementados en el laboratorio `alxarafe/saas`.

El objetivo es garantizar que todas las implementaciones:

- expongan exactamente el mismo comportamiento HTTP,
- respondan con la misma estructura JSON,
- y sean comparables independientemente del lenguaje o framework utilizado.

Los frameworks nunca definen el contrato. El contrato define cómo debe configurarse cada framework.

---

## Principios generales

### 1. JSON como formato único

Todas las respuestas deben retornar:

```
Content-Type: application/json
```

### 2. El código HTTP representa el estado de la operación

No se deben utilizar campos redundantes como:

```json
{ "success": true }
```

o:

```json
{ "status": "fail" }
```

El protocolo HTTP ya expresa correctamente:

- éxito,
- error funcional,
- error técnico,
- autenticación,
- autorización,
- validación,
- etc.

### 3. Los errores utilizan códigos semánticos

Las APIs no deben retornar mensajes humanizados como parte obligatoria del contrato.

Incorrecto:

```json
{
  "error": {
    "message": "Resource not found"
  }
}
```

Correcto:

```json
{
  "error": {
    "code": "not_found"
  }
}
```

La internacionalización (i18n) y los mensajes de usuario pertenecen al frontend o al consumidor de la API.

Se puede incluir un campo `message` opcional como ayuda de depuración. No debe usarse para lógica de negocio ni mostrarse al usuario final.

```json
{
  "error": {
    "code": "not_found",
    "message": "User with id 42 not found"
  }
}
```

### 4. El contrato debe ser idéntico en todos los stacks

Todas las implementaciones deben responder:

- con la misma estructura,
- con los mismos códigos HTTP,
- y con los mismos códigos semánticos.

Las diferencias internas de framework no deben filtrarse al contrato público.

---

## Endpoints

### `GET /health`

Permite verificar el estado operativo del servicio.

Respuesta:

```
200 OK
```

```json
{
  "status": "ok"
}
```

### `GET /nonexistent`

Cuando un endpoint no exista (la ruta no está definida en la API), todas las implementaciones deben responder exactamente:

Respuesta:

```
404 Not Found
```

```json
{
  "error": {
    "code": "endpoint_not_found"
  }
}
```

---

---

## Autenticación

### `POST /auth/login`

Inicia sesión con credenciales fijas y devuelve un JWT.

Request:

```json
{
  "email": "admin@example.com",
  "password": "secret"
}
```

Credenciales válidas:

| Campo | Valor |
|-------|-------|
| email | `admin@example.com` |
| password | `secret` |

Respuesta correcta:

```
200 OK
```

```json
{
  "data": {
    "token": "<jwt>"
  }
}
```

Credenciales inválidas:

```
401 Unauthorized
```

```json
{
  "error": {
    "code": "invalid_credentials"
  }
}
```

Body no parseable como JSON o con `Content-Type` distinto de `application/json`:

```
400 Bad Request
```

```json
{
  "error": {
    "code": "bad_request"
  }
}
```

Faltan campos obligatorios o tienen un tipo inválido:

```
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "validation_error",
    "details": [
      { "field": "email", "code": "required" },
      { "field": "password", "code": "invalid_type" }
    ]
  }
}
```

### JWT

- Algoritmo: `HS256`
- Secret: `secret` (fijo en el laboratorio; en producción vendría de un gestor de secrets)
- TTL: 1 hora (`iat`/`exp` en segundos)
- Payload:

```json
{
  "sub": "1",
  "email": "admin@example.com",
  "iat": 1789736515,
  "exp": 1789740115
}
```

Los verificadores de `/me` aceptan tokens firmados sin `exp` (compat con el
`AUTH_TOKEN` estático usado en los scripts), pero rechazan tokens `exp` en el
pasado.

### `GET /me`

Endpoint protegido que requiere `Authorization: Bearer <jwt>`.

Respuesta correcta:

```
200 OK
```

```json
{
  "data": {
    "id": 1,
    "email": "admin@example.com"
  }
}
```

Token ausente:

```
401 Unauthorized
```

```json
{
  "error": {
    "code": "missing_token"
  }
}
```

Token inválido:

```
401 Unauthorized
```

```json
{
  "error": {
    "code": "invalid_token"
  }
}
```

---

## Fase 2 — Usuarios

### Modelo de datos

Todos los stacks comparten la misma base de datos (`postgres`) y tabla:

```sql
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

El esquema se crea automáticamente (`CREATE TABLE IF NOT EXISTS`) al arrancar cada stack.

### `POST /users/bulk`

Crea varios usuarios de forma transaccional: si cualquier inserción falla, **ninguna** se persiste (rollback total).

Request:

```
201 Created
```

```json
{
  "data": [
    { "email": "a@example.com", "password_hash": "hash-a" },
    { "email": "b@example.com", "password_hash": "hash-b" }
  ]
}
```

Request body:

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `data` | `array` de objetos | sí |
| `data[].email` | `string` | sí |
| `data[].password_hash` | `string` | sí |

Respuesta correcta:

```json
{
  "data": [
    {
      "id": 1,
      "email": "a@example.com",
      "created_at": "2026-09-18T07:42:06Z"
    }
  ]
}
```

`created_at` se devuelve en formato ISO 8601 (cada stack puede variar en la representación exacta de zona horaria; los tests no dependen del formato exacto).

Body no parseable como JSON:

```
400 Bad Request
```

```json
{ "error": { "code": "bad_request" } }
```

Validación (campos obligatorios o tipos incorrectos):

```
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "validation_error",
    "details": [
      { "field": "data[0].password_hash", "code": "required" },
      { "field": "data[0].email", "code": "invalid_type" }
    ]
  }
}
```

Email duplicado (a nivel de tabla o dentro del mismo batch):

```
409 Conflict
```

```json
{ "error": { "code": "conflict" } }
```

En este caso el batch completo se revierte: no quedan filas parciales.

### `GET /users`

Lista usuarios paginados.

Parámetros de consulta:

| Parámetro | Default | Rango | Descripción |
|-----------|---------|-------|-------------|
| `limit` | `20` | `1` a `100` | Número de resultados |
| `offset` | `0` | `>= 0` | Desplazamiento |

Respuesta:

```
200 OK
```

```json
{
  "data": [
    { "id": 1, "email": "a@example.com", "created_at": "2026-09-18T07:42:06Z" }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 125
  }
}
```

Los usuarios se ordenan por `id` de forma ascendente.

`limit` o `offset` inválidos o fuera de rango:

```
422 Unprocessable Entity
```

```json
{
  "error": {
    "code": "validation_error",
    "details": [
      { "field": "limit", "code": "invalid_type" }
    ]
  }
}
```

---

## Respuestas exitosas

### Recurso individual

```json
{
  "data": {
    "id": 1
  }
}
```

### Colecciones

Las colecciones deben incluir metadatos de paginación.

```json
{
  "data": [
    { "id": 1 },
    { "id": 2 }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 125
  }
}
```

### Paginación

Campos soportados:

| Campo | Descripción |
|-------|-------------|
| `limit` | Número máximo de resultados retornados |
| `offset` | Desplazamiento sobre el total de resultados |
| `total` | Número total de elementos disponibles sin paginar |

Parámetros de consulta:

```
GET /users?limit=20&offset=40
```

---

## Respuestas de error

### Estructura general

```json
{
  "error": {
    "code": "not_found"
  }
}
```

Con mensaje opcional de depuración:

```json
{
  "error": {
    "code": "not_found",
    "message": "User with id 42 not found"
  }
}
```

### Endpoint vs recurso no encontrado

El contrato distingue dos tipos de `404`:

- **`endpoint_not_found`** — la ruta solicitada no existe en la API (ej. `GET /xyz`).
- **`not_found`** — la ruta existe pero el recurso solicitado no se encuentra (ej. `GET /products/999`).

El código HTTP es el mismo (`404`), por lo que no hay fuga de información. El cliente puede diferenciar un typo de un recurso legítimamente ausente.

### Errores de validación (422)

Deben incluir un array `details` indicando qué campos fallaron y por qué:

```json
{
  "error": {
    "code": "validation_error",
    "details": [
      { "field": "email", "code": "required" },
      { "field": "age", "code": "min", "params": { "min": 18 } }
    ]
  }
}
```

Cada detalle contiene:

| Campo | Descripción |
|-------|-------------|
| `field` | Ruta del campo que falló (ej. `address.zip`) |
| `code` | Código semántico del error (ej. `required`, `min`, `format`) |
| `params` | Opcional. Parámetros adicionales (ej. valor mínimo esperado) |

### Códigos de error soportados

| HTTP Status | Error Code | Uso |
|-------------|------------|-----|
| 400 | `bad_request` | Petición mal formada |
| 401 | `unauthorized` | Autenticación requerida o inválida |
| 403 | `forbidden` | Sin permisos para el recurso |
| 404 | `endpoint_not_found` | La ruta no existe en la API |
| 404 | `not_found` | El recurso existe pero no se encontró |
| 409 | `conflict` | Conflicto de estado (ej. duplicado) |
| 422 | `validation_error` | Error de validación en los datos |
| — | — | Códigos de `details[]`: `required` (campo ausente o vacío), `invalid_type` (presente con tipo incorrecto), `min`, `format` |
| 500 | `internal_error` | Error interno del servidor |

---

## Compatibilidad entre stacks

Actualmente el laboratorio implementa este contrato en:

- PHP
- Python
- Kotlin
- Node.js
- Go

Todos los stacks deben superar exactamente la misma suite de tests definida en Bruno.

---

## Testing contractual

La colección de Bruno actúa como:

- especificación ejecutable,
- contrato oficial,
- y suite de conformidad multiplataforma.

Cualquier stack que no supere los tests se considera incompatible con el contrato definido.
