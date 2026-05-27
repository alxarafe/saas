# Inicio rápido

## Requisitos

- Docker + Docker Compose

## Levantar todo

```bash
./bin/docker-up.sh
```

Construye las imágenes y levanta todos los servicios (PostgreSQL, 5 APIs, y el contenedor Bruno para tests).

## Verificar que funcionan

```bash
curl localhost:18080/health
curl localhost:18081/health
curl localhost:18082/health
curl localhost:18083/health
curl localhost:18084/health
```

Cada uno debe responder `{"status":"ok"}`.

## Ejecutar tests

### Benchmark completo (Bruno + HTTP directo)

```bash
./bin/test.sh [iteraciones]
```

### Tests rápidos de contrato (solo Bruno)

```bash
./bin/test-simple.sh
./bin/test-simple.sh php go       # solo stacks específicos
```

## Ver logs

```bash
./bin/docker-logs.sh          # todos los servicios
./bin/docker-logs.sh php-api  # solo php
```

## Detener

```bash
./bin/docker-down.sh
```

## Shell en un contenedor

```bash
./bin/shell.sh php-api
./bin/shell.sh bruno
./bin/shell.sh postgres
```
