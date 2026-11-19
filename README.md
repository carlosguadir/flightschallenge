# Flight Booking

Sistema de reserva de vuelos con holds temporales, booking y actualizaciones en tiempo real. Monolito modular NestJS + React, PostgreSQL 16 y Podman Compose.

> Instalar podman and podman compose para ejecutar este proyecto en su maquina local.

### Rutas del frontend

| Ruta                   | Pantalla                                             |
| ---------------------- | ---------------------------------------------------- |
| `/`                    | Búsqueda con resultados que se actualizan por socket |
| `/flights/:id`         | Seat map, hold/countdown, checkout y release         |
| `/booking/:code`       | Ticket por código + email                            |
| `/dashboard/:flightId` | Contadores, ocupación y feed de eventos en vivo      |

El seat map mantiene un buffer de eventos hasta recibir el ack de `flight.join` y el snapshot REST; luego drena por versión. El checkout reutiliza `Idempotency-Key` entre retries.

### Endpoints disponibles

| Método | Ruta                                      | Descripción                                                 |
| ------ | ----------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/health`                             | Healthcheck de base y gateway realtime                      |
| GET    | `/api/flights?origin=&destination=&date=` | Búsqueda (fecha UTC `YYYY-MM-DD`)                           |
| GET    | `/api/flights/:id`                        | Detalle del vuelo                                           |
| GET    | `/api/flights/:id/seats`                  | Snapshot del seat map + `serverTime` + versión              |
| GET    | `/api/flights/:id/metrics`                | Contadores y ocupación del dashboard                        |
| POST   | `/api/flights/:id/seats/:seatId/hold`     | Hold idempotente (máx. 4 por sesión/vuelo)                  |
| DELETE | `/api/flights/:id/seats/:seatId/hold`     | Release del hold propio                                     |
| POST   | `/api/bookings`                           | Reserva de 1–4 asientos con un código y pago fake           |
| POST   | `/api/bookings/lookup`                    | Ticket por `{code, email}` (rate limited, sin enumeración)  |
| PATCH  | `/api/admin/flights/:id/status`           | Cambiar estado (`SCHEDULED`/`DELAYED`/`CANCELLED`)          |
| POST   | `/api/test/reset`                         | Solo `NODE_ENV=test\|e2e` + `x-test-reset-token`; resiembra |

`POST /api/bookings` acepta `seatIds` (1–4 asientos) y `payment.method` como `TEST_OK` o `TEST_DECLINE`; no recibe datos de tarjeta. Una sola confirmación crea una reserva, un código y un total. La primera confirmación devuelve `201` y los replays idempotentes `200`.

### API docs

- Swagger UI: http://localhost:8080/api/docs
- OpenAPI JSON: http://localhost:8080/api/docs-json
- Habilitado por defecto fuera de producción; `SWAGGER_ENABLED=false` lo desactiva. Los schemas
  se generan desde los contratos Zod de `@flight/shared`.

### Realtime

Socket.io en `/realtime`, autenticado con la misma cookie firmada. Cliente → servidor: `flight.join` (ack), `flight.leave`, `search.join`. Servidor → cliente: `flight.updated`, `seat.held`, `seat.released`, `seat.booked` y `flight.metrics` (batched, `METRICS_BATCH_MS`).

## Stack

- Backend: NestJS 11, Drizzle ORM + SQL explícito, PostgreSQL 16, Socket.io.
- Frontend: React 19 + Vite + TanStack Query.
- Contratos: `@flight/shared` (Zod + tipos, build dual ESM/CJS con tsup).
- Runtime: Podman 5 + podman-compose 1.5, rootless. El evaluador no necesita Node, Postgres ni navegadores.

## Arranque

```bash
podman compose -f compose.yaml up --build
```

- App: http://localhost:8080
- Health: http://localhost:8080/api/health

El backend espera el healthcheck de Postgres, aplica migraciones y seed idempotente, y arranca en el puerto 3000; nginx sirve el frontend y hace proxy de `/api` y `/realtime` al backend.

### Desarrollo con hot reload

```bash
podman compose --in-pod=false -f compose.yaml -f compose.dev.yaml up
```

`--in-pod=false` es necesario: `podman-compose` crea un pod por defecto y `userns_mode: keep-id`
no puede combinarse con un pod.

- Vite: http://localhost:5173
- API directa: http://localhost:3000

### Tests

```bash
# Unitarios (sin DB)
podman compose -f compose.yaml --profile test run --rm tests npm run test:unit

# Integración (Postgres real, base app_test, serial)
podman compose -f compose.yaml --profile test build tests
podman compose -f compose.yaml --profile test run --rm tests

# E2E Playwright (6 tests, contexto aislado, axe incluido)
make test-e2e
```

La imagen `test` incluye dependencias de desarrollo y ejecuta `test:integration` por defecto. El
perfil `e2e` vive en el proyecto `flight-e2e`, usa `NODE_ENV=e2e`, TTL de 5s y publica el frontend
en `8081` para no chocar con el stack de desarrollo. Los comandos completos y el troubleshooting
están en [docs/operations.md](docs/operations.md).

## Smoke test manual del hold

Obtener un vuelo y asiento del seed:

```bash
podman compose -f compose.yaml exec db \
  psql -U flight -d flight -Atc \
  "select f.id || ' ' || s.id from flights f join seats s on s.flight_id = f.id where f.flight_number = 'AV1001' and s.label = '1A'"
```

Con los dos UUIDs:

```bash
curl -c /tmp/flight-cookies.txt -b /tmp/flight-cookies.txt \
  -X POST "http://localhost:8080/api/flights/<FLIGHT_ID>/seats/<SEAT_ID>/hold"

curl -b /tmp/flight-cookies.txt \
  "http://localhost:8080/api/flights/<FLIGHT_ID>/seats"

curl -b /tmp/flight-cookies.txt -X DELETE \
  "http://localhost:8080/api/flights/<FLIGHT_ID>/seats/<SEAT_ID>/hold"
```

## Calidad

```bash
npm ci
npm run lint
npm run typecheck
npm run format:check
npm run test:unit
```

- 24 tests unitarios (10 backend + 14 frontend): reducer versionado, reconnect buffer, countdown, idempotencia —incluido el fallback de UUID fuera de contexto seguro—, guards, UoW y redacción de logs.
- 49 tests de integración en el perfil `test` de Podman, contra Postgres real (`app_test`).
- 6 tests E2E Playwright con dos contextos, reserva multi-asiento, expiración real y axe sin violaciones WCAG 2.1 AA.

- ESLint 9 flat config: `typescript-eslint` type-aware, React Hooks/Refresh y `eslint-plugin-boundaries` (prohíbe que `application` importe `infrastructure`, que `shared`/`frontend` importen backend y que `e2e` importe internals).
- Prettier 3.
- Vitest: unitarios en paralelo; integración serial contra `app_test`; Playwright `workers: 1`, contextos nuevos y reset por test.
- CI (`.github/workflows/ci.yml`): `preflight`, `quality`, `integration`, `e2e` y `secrets` con Podman rootless y `podman-compose==1.5.0`; sin Docker.

## Pendientes para producción

La lista accionable, con criterios de cierre y referencias al código, está en
[DEMO.md §6](DEMO.md#6-todo-y-camino-a-producción). Resumen por prioridad:

- **P0 — Seguridad:** autenticación y roles del back-office; conexiones y permisos de DB
  separados.
- **P1 — Dinero y efectos externos:** pasarela de pago real con máquina de estados y webhooks;
  outbox + worker para email/notificaciones; un pasajero por asiento.
- **P2 — Operación:** health y métricas restringidos a operadores; tracing/Prometheus/SLOs;
  adapter Redis y soporte multi-instancia.
- **P3 — Evolución:** sharding de filas antiguas, `/api/v1` con expand/contract, auditoría/PII/PCI,
  i18n, zonas horarias y pruebas de carga.

## Variables de entorno

Ver [.env.example](.env.example). Las principales: `DATABASE_URL`, `COOKIE_SECRET`, `COOKIE_SECURE`, `TRUST_PROXY`, `SEAT_HOLD_TTL_SECONDS`, `MAX_HOLDS_PER_FLIGHT`, `THROTTLE_ENABLED`, `PG_POOL_MAX`, `LOCK_TIMEOUT_MS`, `STATEMENT_TIMEOUT_MS`, `TEST_RESET_TOKEN` (solo `test|e2e`), `SWAGGER_ENABLED`.

## Documentación

- [DEMO.md](DEMO.md) — diagramas de idempotencia/atomicidad, guion de demo y TODOs de producción.
- [docs/architecture.md](docs/architecture.md) — decisiones, SQL de concurrencia, realtime, testing y modos de fallo.
- [docs/operations.md](docs/operations.md) — arranque, reset, perfiles, variables y troubleshooting.
- [docs/ia.md](docs/ia.md) — bitácora de uso de IA y consolidado de impacto por fase.

## Fases

| Fase | Commit                                                           | Alcance                                |
| ---- | ---------------------------------------------------------------- | -------------------------------------- |
| 0    | `chore: scaffold workspace, podman compose and test harness`     | Workspaces, contratos, Podman, harness |
| 1    | `feat: seat hold lifecycle, search and per-flight serialization` | Holds, sweeper, búsqueda               |
| 2    | `feat: booking, fake payment and idempotency`                    | Booking, pago fake, lookup             |
| 3    | `feat: realtime gateway with join ack and versioned events`      | Socket.io, métricas, admin             |
| 4    | `feat: search, seat map, checkout, ticket and live dashboard`    | Frontend completo                      |
| 5    | `test: playwright e2e, docs and ci`                              | E2E, arquitectura, operaciones, CI     |
