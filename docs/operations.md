# Operaciones

Guía corta para ejecutar, verificar y reiniciar el entregable. El objetivo es que el evaluador
solo necesite Podman; no hace falta Node, Postgres ni navegadores en el host.

## Requisitos

- Linux con Podman 5.x rootless y el provider `podman-compose` 1.5.
- Puerto libre `8080` (o `FRONTEND_PORT` para el perfil e2e; por defecto usa `8081`).
- Espacio para las imágenes de Node, Postgres, nginx y Playwright.

```bash
podman --version
podman compose version
```

En macOS/Windows se usa `podman machine`; los bind mounts del override de desarrollo requieren
polling (ya configurado).

## Arranque

```bash
podman compose -f compose.yaml up --build
```

- App: http://localhost:8080
- Health: http://localhost:8080/api/health
- Logs: `podman compose -f compose.yaml logs -f backend`

El backend espera el healthcheck de Postgres, aplica migraciones y seed idempotente, y escucha en
el puerto 3000. nginx sirve el frontend y proxya `/api` y `/realtime`; no hay CORS.

Para desarrollo con hot reload:

```bash
podman compose --in-pod=false -f compose.yaml -f compose.dev.yaml up
```

`--in-pod=false` es obligatorio: `podman-compose` crea un pod por defecto y `userns_mode: keep-id`
no puede combinarse con un pod. Vite queda en http://localhost:5173 y la API directa en
http://localhost:3000. El override usa `userns_mode: keep-id`, volúmenes nombrados sobre
`node_modules` y polling. Validado end-to-end: health directo y a través del proxy de Vite.
El flujo evaluado sigue siendo el stack de `compose.yaml`.

## Datos y reinicio

El volumen `db-data` conserva los datos entre reinicios.

```bash
# Detener y borrar datos (seed limpio en el próximo arranque)
podman compose -f compose.yaml down -v

# Solo recrear contenedores conservando datos
podman compose -f compose.yaml down
podman compose -f compose.yaml up -d
```

El seed crea 15 vuelos, 5 rutas y 3 fechas UTC; cada vuelo tiene 30 filas × 6 columnas (180
asientos). Los IDs son UUIDv5 deterministas, así que se pueden referenciar sin consultar.

En `NODE_ENV=test|e2e` existe `POST /api/test/reset` con header `x-test-reset-token`; trunca
bookings, seats y flights y vuelve a sembrar. Está deshabilitado en development/staging/production
y se usa solo desde Playwright.

## Tests

```bash
# Unitarios (sin DB): 24 tests
podman compose -f compose.yaml --profile test run --rm tests npm run test:unit

# Integración (Postgres real, base app_test, serial): 49 tests
podman compose -f compose.yaml --profile test build tests
podman compose -f compose.yaml --profile test run --rm tests

# E2E Playwright (6 tests, proyecto de compose aislado)
make test-e2e
```

El perfil `test` usa `PAYMENT_DELAY_MS=0`, `THROTTLE_ENABLED=false` y `METRICS_BATCH_MS=25`.
La suite de integración corre contra `app_test`, nunca contra la base de desarrollo, y resetea el
seed por archivo.

El perfil `e2e` vive en el proyecto `flight-e2e` con su propio volumen, backend `NODE_ENV=e2e`,
TTL de 5s, `PAYMENT_DELAY_MS=50` y `THROTTLE_ENABLED=false`. Por eso puede correr junto al stack
de desarrollo (publica el frontend en `8081`). Equivale a:

```bash
podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e \
  up --build --force-recreate --abort-on-container-exit --exit-code-from e2e
podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e down -v
```

`--force-recreate` es importante en ejecuciones repetidas: sin él, podman-compose puede reutilizar
un contenedor con la imagen anterior. `make test-e2e` limpia el stack solo si todo pasa; si falla,
lo deja vivo para inspeccionar el trace y el screenshot:

```bash
podman cp flight-e2e_e2e_1:/app/e2e/test-results ./test-results
# y después
podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e down -v
```

## Variables

| Variable                |                         Default del stack |           Test |               E2E | Uso                                           |
| ----------------------- | ----------------------------------------: | -------------: | ----------------: | --------------------------------------------- |
| `DATABASE_URL`          | `postgres://flight:flight@db:5432/flight` | `.../app_test` |      `.../flight` | Conexión                                      |
| `COOKIE_SECRET`         |                               valor local |  valor de test |       valor local | Firma de la cookie; obligatorio en producción |
| `COOKIE_SECURE`         |                                   `false` |        `false` |           `false` | `Secure` solo sobre HTTPS                     |
| `TRUST_PROXY`           |                                       `1` |            `0` |               `1` | IP real detrás de nginx                       |
| `SEAT_HOLD_TTL_SECONDS` |                                     `300` |          `300` |               `5` | TTL del hold                                  |
| `MAX_HOLDS_PER_FLIGHT`  |                                       `4` |            `4` |               `4` | Límite por sesión/vuelo                       |
| `PAYMENT_DELAY_MS`      |                                     `300` |            `0` |              `50` | Pago fake                                     |
| `THROTTLE_ENABLED`      |                                    `true` |        `false` |           `false` | Rate limiting                                 |
| `METRICS_BATCH_MS`      |                                      `75` |           `25` |              `25` | Ventana de `flight.metrics`                   |
| `TEST_RESET_TOKEN`      |                                     vacío |              — | `e2e-reset-token` | Hook de reset                                 |
| `SWAGGER_ENABLED`       |                      `true` fuera de prod |         `true` |            `true` | Swagger UI/OpenAPI                            |
| `FRONTEND_PORT`         |                                    `8080` |              — |            `8081` | Puerto publicado                              |

`.env.example` lista todas las variables; `.env.e2e` contiene los valores del perfil Playwright
(sin secretos reales). El `.env` local está ignorado por git.

## Observabilidad y salud

- Logs JSON de `nestjs-pino` en stdout; `LOG_PRETTY=true` solo en desarrollo.
- `X-Request-Id` se acepta o genera y se devuelve en la respuesta.
- Eventos de auditoría: `seat.hold.*`, `booking.*`, `payment.declined`, `flight.status.changed`,
  `sweeper.tick`.
- Health: `GET /api/health` (ping a la DB y gateway Socket.io inicializado; 503 si falta
  cualquiera). No abre una conexión de socket sintética: la aceptación real se cubre en los tests
  de integración y E2E.
- API docs: Swagger UI en `/api/docs` y OpenAPI JSON en `/api/docs-json`; deshabilitado en
  producción por defecto (`SWAGGER_ENABLED`).
- El dashboard muestra la versión del vuelo, contadores, ocupación y feed de actividad.

## CI

`.github/workflows/ci.yml` instala Podman + `podman-compose==1.5.0` en Ubuntu y ejecuta los mismos
perfiles: `quality`, `integration`, `e2e` y `secrets` (gitleaks). No usa Docker ni service
containers de Docker. La versión de Podman del runner puede ser anterior a 5.x; el stack objetivo
sigue siendo Podman 5.7 + podman-compose 1.5.

## Troubleshooting

| Síntoma                                        | Causa probable                    | Acción                                                                  |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `podman compose up` reutiliza una imagen vieja | Contenedor existente              | `podman compose ... down` o `--force-recreate`                          |
| E2E falla con EACCES en `test-results`         | Imagen sin permisos para `pwuser` | Reconstruir `e2e` sin caché (`podman compose ... build --no-cache e2e`) |
| Chromium se cae en el contenedor               | `/dev/shm` pequeño                | Mantener `shm_size: 1g`; si persiste, `--podman-run-args=--ipc=host`    |
| El puerto 8080 está ocupado                    | Otro stack                        | `FRONTEND_PORT=8082 podman compose ... up`                              |
| El puerto 8081 está ocupado en e2e             | Stack de desarrollo u otro e2e    | Cambiar `FRONTEND_PORT` en `.env.e2e`                                   |
| SELinux bloquea bind mounts                    | Contexto incorrecto               | Los overrides usan `:Z`; verificar que se aplique el override           |
| `podman compose` no existe                     | Provider no instalado             | Instalar `podman-compose==1.5.0` (pipx)                                 |
| WebSocket no conecta detrás de un proxy        | Upgrade no proxificado            | Mantener los headers de `/realtime` como en `frontend/nginx.conf`       |

## Límites operativos

- Una sola instancia de backend; Socket.io no usa adapter.
- Sesión anónima y pago fake; no hay proveedor real ni datos de tarjeta.
- Admin sin autenticación en la demo.
- Sin tracing, Prometheus, outbox ni jobs asíncronos (diseñados y fuera de alcance).
- Los holds de un vuelo cancelado no se liberan al cancelar; expiran por TTL.
