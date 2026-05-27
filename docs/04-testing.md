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
| `not_found.bru` | `GET /nonexistent` | status 404 |
