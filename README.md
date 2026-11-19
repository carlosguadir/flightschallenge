# Flight Booking Challenge

Sistema de reserva de vuelos con holds temporales, booking y actualizaciones en tiempo real. Monolito modular NestJS + React, PostgreSQL 16 y Podman Compose.

**Estado actual: fase 2 (booking y pago fake).** Ya funcionan búsqueda/detalle de vuelos, snapshot del seat map, holds idempotentes con máximo 4 por sesión y vuelo, release, expiración por sweeper + lazy expiry, guards de estado y el flujo completo de booking con pago simulado, idempotencia y lookup. Realtime completo, dashboard y UI llegan en las fases 3–5.

### Endpoints disponibles

| Método | Ruta                                      | Descripción                                                |
| ------ | ----------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/health`                             | Healthcheck con ping a la base                             |
| GET    | `/api/flights?origin=&destination=&date=` | Búsqueda (fecha UTC `YYYY-MM-DD`)                          |
| GET    | `/api/flights/:id`                        | Detalle del vuelo                                          |
| GET    | `/api/flights/:id/seats`                  | Snapshot del seat map + `serverTime` + versión             |
| POST   | `/api/flights/:id/seats/:seatId/hold`     | Hold idempotente (máx. 4 por sesión/vuelo)                 |
| DELETE | `/api/flights/:id/seats/:seatId/hold`     | Release del hold propio                                    |
| POST   | `/api/bookings`                           | Booking con `Idempotency-Key` y pago fake                  |
| POST   | `/api/bookings/lookup`                    | Ticket por `{code, email}` (rate limited, sin enumeración) |

`POST /api/bookings` acepta `payment.method` como `TEST_OK` o `TEST_DECLINE`; no recibe datos de tarjeta. La primera confirmación devuelve `201` y los replays idempotentes `200`.

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

El backend espera el healthcheck de Postgres, aplica migraciones y seed idempotente, y arranca en el puerto 3000; nginx sirve el frontend y hace proxy de `/api` y `/socket.io` al backend.

### Desarrollo con hot reload

```bash
podman compose -f compose.yaml -f compose.dev.yaml up
```

- Vite: http://localhost:5173
- API directa: http://localhost:3000

### Tests

```bash
# Unitarios (sin DB)
podman compose -f compose.yaml --profile test run --rm tests npm run test:unit

# Integración (Postgres real, base app_test, serial)
podman compose -f compose.yaml --profile test run --rm tests
```

La imagen `test` incluye dependencias de desarrollo y ejecuta `test:integration` por defecto.

## Smoke test del hold (fase 0)

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

- ESLint 9 flat config: `typescript-eslint` type-aware, React Hooks/Refresh y `eslint-plugin-boundaries` (prohíbe que `application` importe `infrastructure` y que `shared`/`frontend` importen backend).
- Prettier 3.
- Vitest: unitarios en paralelo; integración serial contra `app_test`.

## Variables de entorno

Ver [.env.example](.env.example). Las principales: `DATABASE_URL`, `COOKIE_SECRET`, `COOKIE_SECURE`, `TRUST_PROXY`, `SEAT_HOLD_TTL_SECONDS`, `MAX_HOLDS_PER_FLIGHT`, `THROTTLE_ENABLED`, `PG_POOL_MAX`, `LOCK_TIMEOUT_MS`, `STATEMENT_TIMEOUT_MS`.

## Documentación

- [PLAN.md](PLAN.md) — plan y arquitectura.
- [PLAN_APPENDIX.md](PLAN_APPENDIX.md) — defensa, producción y guías de docs.
- [docs/ia.md](docs/ia.md) — bitácora de uso de IA (se actualiza por fase).
