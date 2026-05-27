# Visión general

Repositorio laboratorio para implementar el mismo contrato API en múltiples lenguajes y runtimes, desplegados con Docker Compose.

## Objetivo

Comparar objetivamente lenguajes y stacks en aspectos operativos reales:

- Experiencia de desarrollo
- Ergonomía de la arquitectura
- Integración con Docker
- Estrategias de autenticación
- Testing y contract testing
- Rendimiento y benchmarks
- Consistencia operativa
- Mantenibilidad

## Principios

- **Contrato primero**: todas las implementaciones exponen las mismas rutas, payloads, códigos de estado y formato de errores.
- **Consistencia operativa**: todos los contenedores exponen el puerto interno `3000`.
- **Testing compartido**: la suite de Bruno se ejecuta contra todos los stacks sin modificaciones.

## Stacks actuales

| Stack | Lenguaje | Puerto host |
|-------|----------|-------------|
| PHP API | PHP 8.4 | `18080` |
| Kotlin API | Kotlin/JVM | `18081` |
| Python API | Python 3.13 | `18082` |
| Node API | Node.js + TypeScript | `18083` |
| Go API | Go 1.24 | `18084` |

## Infraestructura

| Componente | Propósito |
|------------|-----------|
| Docker Compose | Orquestación |
| PostgreSQL | Base de datos compartida |
| Bruno | Contract testing |
| GitHub Actions | CI/CD (planificado) |
