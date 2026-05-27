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

Cuando un endpoint no exista, todas las implementaciones deben responder exactamente:

Respuesta:

```
404 Not Found
```

```json
{
  "error": {
    "code": "not_found"
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

| HTTP Status | Error Code |
|-------------|------------|
| 400 | `bad_request` |
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 422 | `validation_error` |
| 500 | `internal_error` |

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
