# Bitácora de uso de IA

Documento obligatorio del KATA (§6.1). Se actualiza al final de cada fase, no de memoria.

## Herramientas y modelos

| Fecha      | Herramienta                | Modelo / versión                                     | Uso                                                      |
| ---------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 2026-11-18 | Claude Code (CLI, VS Code) | Modelo reportado por la sesión: `deepseek-flash[1m]` | Planificación, revisión del plan y arranque de la fase 0 |

## Fase 0 — Skeleton, Podman, contratos y seguridad base

### Prompts y casos de uso

1. **Planificación y revisión del plan**
   - Prompt: «fix the syntax en review the PLAN.md», seguido de «apply all fixes», «modifica el plan no usaremos docker usaremos podman» y la revisión de DRY/SOLID/patrones.
   - Resultado: PLAN.md reconstruido como Markdown válido, decisiones de concurrencia, idempotencia, estados de vuelo, aislamiento de tests y Podman; después reducido moviendo defensa/producción a PLAN_APPENDIX.md.
2. **Arranque de implementación**
   - Prompt: «inicia la fase 0».
   - Resultado: monorepo npm workspaces, `@flight/shared` con contratos Zod y build dual, backend NestJS con configuración, sesión firmada, logging pino, rate limiting, migraciones/seed, UnitOfWork por vuelo, holds/release, gateway de socket con handshake y harness Vitest unitario/serial.

### Casos en los que la IA se equivocó y cómo se corrigió

- **Hold en una sola sentencia.** La primera versión resolvía el re-click idempotente y la adquisición en un único `UPDATE`; eso extendía el TTL en cada re-click. Se reemplazó por el flujo de dos pasos (adquirir/retomar expirado y luego comprobar si es mío), con el caso de re-click antes del límite de 4 holds.
- **Falta de serialización por vuelo.** El conteo de holds máximos y el recomputo de `sold_out` podían competir entre sesiones. Se añadió `pg_advisory_xact_lock(hashtext('flight:' || $fid))` en el UnitOfWork, antes de cualquier mutación del vuelo.
- **Lock del sweeper a nivel de sesión.** `pg_try_advisory_lock` podía quedar retenido en una conexión del pool si el proceso fallaba. Se cambió a `pg_try_advisory_xact_lock`, liberado por el commit/rollback.
- **Orden de idempotencia en booking.** La comprobación de idempotencia estaba después de validar el estado del asiento, por lo que un replay tras `BOOKED` fallaba. Se movió antes de la validación y se documentó el re-chequeo posterior al lock.

### Impacto estimado

Pendiente de consolidar al final del challenge. Estimación inicial: ~1.5 h ahorradas en scaffolding (workspaces, tsconfig, contratos Zod, Vitest, Containerfiles) y ~2 h invertidas en corregir los problemas de concurrencia/idempotencia anteriores y en ajustar la configuración de Podman/ESLint.

## Fase 1 — Núcleo de reservas y búsqueda

### Prompts y casos de uso

- **Prompt:** «procede a implementar la phase 1».
- **Resultado:** búsqueda y detalle de vuelos, guard de estado de vuelo, holds con máximo de 4 por sesión/vuelo, release, expiración lazy + sweeper cada segundo, versión por evento y por lote, guards de transición de asiento/estado y la suite §10.1–§10.4, §10.10, §10.20–§10.22.

### Casos en los que la IA se equivocó y cómo se corrigió

- **Versionado pensado solo para un asiento.** `SeatChangeResult` devolvía una única `seatEventVersion`; el sweeper puede liberar N asientos en un vuelo y necesita una versión consecutiva por evento. Se cambió a `seatEventVersions: number[]` y el sweeper asigna una por fila, dejando `flight.updated` con la última.
- **Imports internos entre módulos.** Los use cases importaban puertos de `catalog` por ruta profunda. El test de arquitectura §10.21 lo detectó; se movieron a los `index.ts` públicos y se añadió la comprobación automática de imports.
- **Sweeper fuera del Unit of Work.** Publicar eventos al liberar asientos antes del commit rompía la garantía after-commit. Se añadió `runSweeperTransaction` con lock transaccional `sweeper` y lock por vuelo, reutilizando la cola de eventos post-commit.

### Impacto estimado

Pendiente de consolidar. La implementación de la fase 1 fue directa gracias a que el esquema, el lock por vuelo y los contratos ya existían; el mayor tiempo se fue en los tests de concurrencia/paridad y en ajustar el versionado por lote.

## Fase 2 — Booking, pago fake e idempotencia

### Prompts y casos de uso

- **Prompt:** «procede con la fase 2».
- **Resultado:** `ConfirmBooking` con lock por vuelo, `PaymentPort` + adapter fake (`TEST_OK`/`TEST_DECLINE`, sin PAN), hash canónico SHA-256 de la request, código base32 de 6 caracteres con reintento ante colisión, replay idempotente 200, lookup por código + email y la suite §10.5–§10.7, §10.11, §10.13–§10.15.

### Casos en los que la IA se equivocó y cómo se corrigió

- **Replay antes de validar el asiento.** El primer borrador comprobaba la idempotencia después de validar el estado del asiento, así que un replay después de `BOOKED` podía fallar. Se añadió el fast path por `idempotency_key` antes de abrir la transacción y un segundo chequeo dentro de la transacción, después del lock.
- **Colisión de código dentro de una transacción.** Un `UNIQUE` en `bookings.code` aborta la transacción completa, así que no basta con reintentar el `INSERT`. Se usó un `SAVEPOINT` por intento: `ROLLBACK TO SAVEPOINT` y regeneración del código, con un máximo de 3 intentos.
- **Test de `seatId` ajeno mal planteado.** La primera versión enviaba el `flightId` del otro vuelo, por lo que el test comprobaba un hold inexistente (410) y no el mismatch de contrato. Se corrigió para enviar el `flightId` solicitado con el `seatId` de otro vuelo y exigir 409 `SEAT_UNAVAILABLE`.

### Impacto estimado

Pendiente de consolidar. La fase 2 se apoyó en el esquema y el Unit of Work existentes; el tiempo se concentró en la semántica de idempotencia (fast path + chequeo intra-transacción), el manejo de colisiones de código y los tests concurrentes.
