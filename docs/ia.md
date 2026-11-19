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
