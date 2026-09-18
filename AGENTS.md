# AGENTS.md — Guía para agentes de IA

## Propósito del repositorio

**`alxarafe/saas` es un laboratorio de pruebas**, no una aplicación de producción.

Su objetivo es comparar el mismo contrato HTTP implementado en 5 stacks (PHP,
Kotlin, Python, Node y Go) desplegados con Docker Compose. Todo el código sirve
para medir, probar y comparar runtimes. Cualquier recomendación de seguridad o de
arquitectura "de producción" debe evaluarse con esta premisa.

## Regla de oro

- **No exigir** los estándares de seguridad de una app en producción (secrets
  estáticos, credenciales fijas, JWT sin TTL, hashes triviales, etc. son
  Aceptados a propósito aquí).
- **Sí anotar** cualquier práctica que supondría un fallo de seguridad en
  producción, dejando claro que aquí se acepta por ser una herramienta de
  pruebas. Correcciones de bajo coste que no cambian el contrato pueden hacerse
  sin permiso (p. ej. añadir `exp`/`iat` al JWT); cambios de arquitectura que
  afecten al benchmark deben consultarse.

## Implícits de seguridad aceptados (anotar al tocarlos)

Incumplimientos deliberados para simplificar el laboratorio. NO "arreglar" sin
consultar; si se tocan, mantener el contrato.

| Práctica | Dónde | Por qué se acepta aquí |
|----------|-------|------------------------|
| JWT secret estático `"secret"` y credenciales `admin@example.com`/`secret` | Los 5 stacks, tests Bruno | No hay datos reales; simplifica tests y comparación |
| Tokens emitidos con `iat`/`exp` (TTL 1 h) pero verificadores que aceptan tokens sin `exp` | Los 5 stacks | Los tests usan un `AUTH_TOKEN` estático pre-generado sin expiración |
| `AUTH_TOKEN` estático fijo en scripts (`bin/*.sh`, `tests/bruno/benchmark.mjs`) | Scripts | Permite testear `/me` sin encadenar login |
| Passwords/hashes triviales (`password_hash: "hash-a"`, `"secret"`) | Tests y seed | Laboratorio de contrato, no de seguridad |
| Sin TLS (HTTP plano) | Todos los servicios | Red interna de Docker de pruebas |
| Login sin hashing real | Los 5 stacks | Fase "Login Storm" de k6 podrá introducir bcrypt/argon2 como prueba |
| `restart: unless-stopped` con `cpus`/`mem_limit` (desde P1 #4→Fase 3) | compose | Facilitar iteración; k6 exige límites para comparar justo |

## Operativa / verificación

Contratos y comportamiento en `docs/06-http-contract.md`. La suite de Bruno es la
especificación ejecutable (`tests/bruno/tests/`).

Comandos de referencia:

- Validar compose: `docker compose config -q`
- Tests de contrato (todos o por stack): `./bin/test-simple.sh [php python kotlin node go]`
- Benchmark k6 (Fase 3): `./bin/k6.sh [php python kotlin node go]` (`VU=... DURATION=...`)
- Construir y levantar: `./bin/docker-up.sh [servicio...]`
- Estado de salud: `docker inspect -f '{{.Name}} → {{.State.Health.Status}}' saas-<stack>-api`
- Los servicios fuera de un container `healthy` abortan los scripts de test
  (pre-flight en `bin/test-simple.sh` y `tests/benchmark.sh`).

Estado/hoja de ruta: `private/analisis/06-pendientes.md` (actualizar cuando una
fase se cierre).

## Stack × runtime/build (a partir de P1 #4)

| Stack | Runtime | Build |
|-------|---------|-------|
| PHP | FrankenPHP (Caddy + PHP), `php_server` | `docker/php/Dockerfile`, Caddyfile |
| Kotlin | eclipse-temurin:21 (dist) | Gradle multi-stage |
| Python | Uvicorn en imagen slim | bind-mount de código (`./python-api:/app`) |
| Node | `node:22-alpine`, `node dist/index.js` | `tsc` multi-stage |
| Go | `alpine:3.20`, binario estático | `CGO_ENABLED=0 go build` multi-stage |