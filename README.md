# SaaS Multi-Stack API Laboratory

Comparative backend laboratory for evaluating multiple programming languages and runtimes implementing the exact same API contract.

The objective of this repository is not to compare syntax, but to compare:

- developer experience,
- architecture ergonomics,
- Docker integration,
- authentication implementation,
- testing,
- performance,
- operational consistency,
- maintainability.

Every implementation must behave identically from the client perspective.

---

# Objectives

This repository aims to provide:

- homogeneous API implementations,
- shared contract testing,
- shared authentication strategy,
- reproducible Docker infrastructure,
- comparable developer workflows,
- benchmarking-ready services.

---

# Current Stacks

| Stack | Language | Status |
|---|---|---|
| PHP API | PHP 8.4 | In progress |
| Python API | Python 3.13 | In progress |
| Kotlin API | Kotlin/JVM | In progress |
| Node API | Node.js + TypeScript | In progress |
| Go API | Go 1.24 | In progress |

---

# Infrastructure

| Component | Purpose |
|---|---|
| Docker Compose | Orchestration |
| PostgreSQL | Shared database |
| Bruno | Contract testing |
| GitHub Actions | CI/CD (planned) |

---

# Architectural Principles

## Contract-first

Clients must not know which implementation is behind the API.

Every implementation must expose:

- identical routes,
- identical payloads,
- identical status codes,
- identical authentication semantics,
- identical error formats.

---

## Operational consistency

All containers expose the same internal port:

3000

External host ports are mapped independently.

---

# Port Mapping

| Service | Host Port | Internal Port |
|---|---|---|
| PHP API | 18080 | 3000 |
| Python API | 18081 | 3000 |
| Kotlin API | 18082 | 3000 |
| Node API | 18083 | 3000 |
| Go API | 18084 | 3000 |

---

# Repository Structure

```text
.
├── docker/
│   ├── bruno/
│   ├── go/
│   ├── kotlin/
│   ├── node/
│   ├── php/
│   └── python/
│
├── go-api/
├── kotlin-api/
├── node-api/
├── php-api/
├── python-api/
│
├── tests/
│   └── bruno/
│
├── docker-compose.yml
├── README.md
└── .gitignore

