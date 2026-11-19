# Bitácora de uso de IA

Este documento es obligatorio para el KATA (§6.1). Explica de forma simple qué se le pidió a la IA en cada fase, qué se obtuvo, qué errores aparecieron y cuánto tiempo se ahorró o se invirtió. Incluye los prompts que dirigieron la implementación y un resumen de los direccionamientos más importantes del ingeniero.

## Palabras clave

- **Hold:** reserva temporal de un asiento. Si no se confirma, se libera automáticamente.
- **Idempotencia:** repetir la misma petición sin crear duplicados ni cambiar el resultado.
- **Bloqueo (lock):** turno que evita que dos procesos cambien el mismo dato al mismo tiempo.
- **Transacción y commit:** conjunto de cambios que se guarda completo o no se guarda.
- **Sweeper:** proceso que libera los holds vencidos.
- **Versión:** número que indica el orden de los cambios.
- **Reducer:** función que actualiza el estado de una pantalla con los eventos que recibe.
- **WebSocket / gateway:** canal abierto entre el navegador y el servidor para enviar cambios en vivo.
- **TTL:** tiempo de vida de un hold antes de expirar.
- **CDP:** forma de controlar Chrome desde un programa para navegar y leer la página.
- **E2E:** prueba que usa la aplicación como lo haría una persona.
- **CI:** revisión automática que se ejecuta al subir cambios.

## Herramientas y modelos

| Fecha      | Herramienta                | Modelo / versión                                     | Uso                                                      |
| ---------- | -------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 2026-11-18 | Claude Code (CLI, VS Code) | Modelo reportado por la sesión: `deepseek-flash[1m]` | Planificación, revisión del plan y arranque de la fase 0 |

## Direccionamientos importantes del ingeniero

Estas son las decisiones que más marcaron el proyecto. No son todas las preguntas, sino las que cambiaron el alcance, la arquitectura o la forma de trabajar.

- **Podman, no Docker.** La ejecución local y el CI debían usar Podman. Esto obligó a ajustar contenedores, compose y documentación.
- **No modificar ni reactivar vuelos.** La cancelación operativa sí existe, pero `CANCELLED` es terminal. No se implementó edición, reactivación ni cancelación de una reserva ya comprada.
- **Respetar el alcance del reto.** El máximo de 4 holds por sesión y vuelo era un requisito, no un detalle negociable.
- **Una reserva, un código, hasta 4 asientos.** La primera implementación reservaba un asiento por operación. El ingeniero corrigió el rumbo y exigió un solo código para todo el grupo.
- **Diseño antes de codificar.** DRY, SOLID, patrones, ESLint y revisión de arquitectura se pidieron antes y durante la implementación.
- **Validar antes de confirmar.** Los cambios debían probarse antes de hacer commit; «valida primero luego confirma cambios» quedó como regla.
- **La interfaz solo debía cambiar de color.** El rediseño inspirado en Latam no debía alterar comportamiento, rutas ni estructura.
- **El healthcheck debía mirar el sistema completo.** No bastaba con la base de datos: también debía comprobar que el canal de tiempo real acepta conexiones.
- **La ruta de tiempo real sería `/realtime`.** No se aceptó conservar la ruta por defecto de Socket.io.
- **Seguridad y limpieza.** Se pidió revisar CORS, CSRF y rate limiting, y eliminar módulos o piezas que no aportaran valor.
- **Documentación de la API.** Swagger/OpenAPI se agregó como parte del entregable.
- **Un pasajero por asiento quedó como TODO.** La reserva actual comparte el pasajero del grupo; el código deja explícito el trabajo futuro.
- **Commits por fase o grupo lógico.** Formato `(feat|chore|style|refactor|test): descripción`, sin trailers.
- **SPA estática con proxy same-origin.** Se evaluó Next.js y se descartó: React + Vite + nginx cubre el alcance sin costo extra.

## Registro de prompts de implementación

Esta lista reconstruye, en orden, los mensajes que dirigieron la implementación. Se conserva el texto tal como se escribió, incluidas sus abreviaturas. Se excluyen los pedidos puramente operativos, como confirmar cambios o limpiar el historial, que no cambiaron el comportamiento del sistema.

### Planificación y arquitectura

- «Before running any code let's plan and define architecture… generate a MD» → se creó el plan y el modelo de arquitectura.
- «considerar PostgreSQL en Docker, Docker por defecto, Vitest y Playwright» → elección inicial del stack; después Docker se reemplazó por Podman.
- «fix the sintax en review the PLAN.md» → revisión y corrección del plan.
- «apply all fixes» → se aplicaron los hallazgos de la revisión.
- «modifica el plan no usaremos docker usaremos podman» → cambio transversal a Podman.
- «El plan parece estar listo, hay algo que se deba considerar antes de pasar a la fase de implementación ?» → revisión previa a implementar.
- «Explicame mas sobre el punto 1, no lo entiendo bien» y «Procede y muestrame detalles del numero 2» → aclaración y aplicación de los primeros puntos.
- «que hay de los puntos 3-10, hablame del 3» y «aplica el punto 3» → revisión y aplicación de los puntos pendientes.
- «procede con las acciones sugeridas para los puntos 4-10» → cierre de las mejoras del plan.
- «No that plan is ready what about DRY/SOLID, Patterns ?» → revisión de principios de diseño.
- «okay ahora revisa si el plan contiene texto no necesario para la implementación requiero reducir su tamaño» → el material no implementable se movió a un apéndice.
- «el plan contempla la opción de cancelar vuelo o modificar vuelo ?» → se separó la cancelación operativa de la edición de vuelos.
- «ignora el requerimiento no lo vamos a contemplar» → se excluyó modificar o reactivar vuelos.
- «la comunicación entre front y back como se haría hay un proxy para servirse en un mismo puerto ?» → nginx mismo origen, proxy para API y tiempo real, y cookie de sesión.
- «que rutas disponibles tiene la aplicación de react ?» → se fijaron las cuatro rutas del frontend.
- «algunos de estas rutas de react valdría la pena desde una perspectiva de ingeniería de software tenerlos con nextjs ? la compilación estática es suficiente ?» → se decidió mantener una SPA estática con Vite.
- «La convensión de git debe ser que cada fase se hace commit agrupando cambios con la siguiente estructura de mensajes "(feat|chore|style|refactor|test) {message_changes}".» → un commit por fase o grupo lógico, sin trailers.
- «eslint esta contemplado en las herramientas del codigo ?» → se incorporó ESLint al control de calidad.
- «agregar pipelines y Terraform», «seguridad, logs y tracing» y «¿Drizzle o Prisma?» → se documentaron como ruta de producción; no se implementaron en el entregable.
- «¿qué otro aspecto podría estar olvidando?» y «¿por qué monolito modular, y qué alternativas hay?» → análisis de brechas y decisión de arquitectura.
- Preguntas sobre Redis y el hold → se documentó el ciclo de vida del hold; Redis no era necesario para el alcance.

### Implementación por fases

- «inicia la fase 0» → base del proyecto, contratos, sesión, migraciones, bloqueo por vuelo y holds.
- «valida primero luego confirma cambios» → la validación se volvió requisito antes de confirmar.
- «procede a implementar la phase 1» → búsqueda, holds, liberación y expiración.
- «procede con la fase 2» → reserva, pago falso, idempotencia y consulta de ticket.
- «procede con la fase 3» → tiempo real, métricas y administración de estados.
- «procede con la fase 4» → búsqueda, mapa de asientos, checkout, ticket y dashboard.
- «what are you doing what is striggling to complete the task just tell me the symptom» → se pidió un diagnóstico claro antes de seguir.
- «comprendo continua» → continuación de la fase 4.
- «proceed with next phase» → Playwright, documentación y CI.

### Revisiones y ajustes posteriores

- «Let's change style in UI frontend. Add a clear colors like Latam Airlines. Just the color do no change something else» → solo se cambiaron colores y estilos visuales.
- «can this health check also review the socket live accepting connections ?» → el healthcheck pasó a comprobar base de datos y gateway.
- «why this module exist, it implements nothing» → se eliminó un módulo vacío.
- «what is a suggested path for this route ? I do not want preserve the default one» → se evaluó una ruta propia.
- «apply /realtime for back and frontend» → gateway y cliente quedaron en `/realtime`.
- «is this necessary ? looks none is using ?» → se eliminó una pieza sin uso.
- «does this test module add value could we consider remove ?» → se revisó el valor del módulo de pruebas.
- «does this factory cors config only for allowed frontend ?» → CORS quedó limitado al frontend permitido.
- «CSRF and rate limit is included ?» → se revisaron CSRF y límite de peticiones.
- «add swagger is a feature that I would like have here, too much on add it ?» → se agregó Swagger/OpenAPI.
- «explain this code ? what is it doing ¡» y «should this be haved in mind ? It does not check flight status. A cancelled flight’s seats are still valid seat-shape rows.» → se revisó la validación del estado del vuelo antes de reservar.
- «When I bookd 4 seats what i'm seeing in frontend is that lock the 4 sets but once user confirm book only book one seat not the 4 seats. I was expecting tha at selecting 4 seats and click on confirm the app should reserve the 4 is this doable ?» → se detectó que la reserva solo guardaba un asiento.
- «do not run implementations» → no se implementó nada hasta aclarar el requisito.
- «it's doable in 15 minutes, do you understand well the requirements and it's changes ?» → se alineó el alcance antes de tocar código.
- «the 4 seats max was part of requirements of challengue» → se confirmó que el límite de 4 era parte del reto.
- «one reservation with one code for four seats this is what i want» → una cabecera de reserva y varias líneas de asiento, con un solo código.
- «let's add a TODO in module where this should be done in future one ticket one passenger» → se dejó documentado el trabajo de un pasajero por asiento.

### Consultas de comportamiento

- «el sistema permite cancelar un vuelo ?» → se confirmó la cancelación operativa y sus límites.
- «dame un CURL para cancelar un vuelo» → se documentó la llamada al endpoint administrativo.
- «o existeuna UI para cancelar vuelo ?» → se confirmó que no hay UI de administración.
- «si llamo al endpoint con CURL que pasaría en el front de ese vuelo ?» → se documentó el efecto en búsqueda, mapa, checkout y dashboard.

## Fase 0 — Base del proyecto, Podman, contratos y seguridad

### Planificación inicial

1. Definir el plan y la arquitectura
   - Prompt: «Before running any code let's plan and define architecture… generate a MD», luego «considerar PostgreSQL en Docker, Docker por defecto, Vitest y Playwright».
   - Resultado: el documento de planificación con monolito modular, NestJS + React, Socket.io, Postgres, bloqueo atómico de asientos con expiración, contrato en tiempo real, API y estrategia de pruebas.
2. Afinar concurrencia y caché
   - Prompt: preguntas sobre dónde usar Redis, la estrategia del hold y cómo funciona el bloqueo de 5-10 minutos.
   - Resultado: se documentó dónde sí y dónde no usar Redis, y se agregó el ciclo de vida del hold con su diagrama de estados.
3. Producción, seguridad y observabilidad
   - Prompt: «agregar pipelines y Terraform» (Kubernetes + Helm, AWS, GitHub Actions, Postgres administrado, dominio como TODO), luego «seguridad, logs y tracing» y «¿Drizzle o Prisma?».
   - Resultado: se documentaron como ruta de producción fuera del alcance, junto con seguridad, logs estructurados, OpenTelemetry y la justificación de Drizzle frente a Prisma.
4. Revisar huecos y arquitectura
   - Prompt: «¿qué otro aspecto podría estar olvidando?» y «¿por qué monolito modular, y qué alternativas hay?».
   - Resultado: análisis de brechas con alcance por ítem, y un ADR con reglas de desacoplamiento, orden de extracción a servicios y alternativas.

### Errores de la planificación

- Los módulos `seats`, `bookings` y `metrics` compartían tablas y transacción, así que no eran extraíbles. Se reagruparon por contexto (`reservations`, `catalog`, etc.) con reglas de dependencia verificadas en CI.
- En la planificación se propusieron una tabla `payments` y un outbox. Se descartaron para el alcance final: se usó un pago falso y la publicación de eventos después del commit.
- El `sessionId` lo elegía el cliente en localStorage. Se cambió por una cookie firmada y `HttpOnly` emitida por el servidor.

### Impacto de la planificación

Pendiente de consolidar al final. Estimación inicial: ~3 h ahorradas en investigación y redacción del plan, y ~1 h invertida en cuestionar y corregir las propuestas de la IA. La tabla final reemplaza esta estimación inicial.

### Implementación de la fase 0

1. **Revisar y corregir el plan**
   - Prompt: «fix the syntax en review the PLAN.md», seguido de «apply all fixes», «modifica el plan no usaremos docker usaremos podman» y una revisión de DRY/SOLID/patrones.
   - Resultado: se corrigió el documento de planificación y se tomaron decisiones sobre concurrencia, idempotencia, estados de vuelo, aislamiento de las pruebas y Podman. Las partes de defensa y producción se movieron a un apéndice para dejar el plan centrado en la implementación.
2. **Iniciar la fase 0**
   - Prompt: «inicia la fase 0».
   - Resultado: se creó la base del proyecto: un repositorio con varios paquetes, contratos de datos compartidos validados con Zod, backend NestJS, cookie de sesión firmada, logs, límite de peticiones, migraciones y datos de prueba, bloqueo por vuelo, holds y sus pruebas.

### Errores de la IA y correcciones

- **El hold se resolvía con un solo `UPDATE`.** Cada vez que la persona volvía a hacer clic, el tiempo del hold se renovaba sin querer. Se dividió en dos pasos: primero se toma o se retoma un hold vencido y después se comprueba si pertenece a la sesión. Así también se respeta el límite de 4 holds.
- **Faltaba un turno de acceso por vuelo.** Dos sesiones podían contar los holds al mismo tiempo y superar el máximo, o calcular mal si el vuelo estaba agotado. Se agregó un bloqueo por vuelo (un “lock”) antes de cualquier cambio.
- **El proceso que libera holds vencidos retenía un bloqueo de sesión.** Si el proceso fallaba, el bloqueo podía quedar tomado. Se cambió por un bloqueo de transacción, que se libera al confirmar o deshacer los cambios.
- **La idempotencia se revisaba demasiado tarde.** La comprobación estaba después de validar el asiento, así que un reintento después de reservar podía fallar. Se revisa primero la clave de idempotencia y se vuelve a comprobar dentro de la transacción, después del bloqueo.

### Impacto estimado

Pendiente de consolidar al final del challenge. Estimación inicial: ~1.5 h ahorradas en la base del proyecto (paquetes, configuración, contratos, pruebas y contenedores) y ~2 h invertidas en corregir los problemas de concurrencia e idempotencia y en ajustar Podman y ESLint.

## Fase 1 — Núcleo de reservas y búsqueda

### Qué se pidió y qué se hizo

- **Prompt:** «procede a implementar la phase 1».
- **Resultado:** se agregaron búsqueda y detalle de vuelos, una validación que impide operar sobre vuelos cancelados, holds de hasta 4 asientos por sesión y vuelo, liberación manual, expiración automática (al consultar y con un proceso que revisa cada segundo) y versiones para ordenar los eventos. También se agregaron las pruebas de esta fase.

### Errores de la IA y correcciones

- **El versionado solo pensaba en un asiento.** El proceso de expiración puede liberar varios asientos a la vez y necesita una versión distinta para cada uno. Se cambió a una lista de versiones, una por asiento, y el evento final del vuelo usa la última.
- **Los casos de uso importaban archivos internos de otro módulo.** Esto rompía la separación entre módulos. Se movieron los imports a la API pública de cada módulo y se agregó una prueba automática que lo controla.
- **El proceso de expiración publicaba eventos antes de guardar los cambios.** Eso podía avisar al frontend de algo que después no se confirmaba. Se movió a una transacción con bloqueo y se usó la cola de eventos que se publica después del commit.

### Impacto estimado

Pendiente de consolidar. La fase fue directa porque el esquema, el bloqueo por vuelo y los contratos ya existían. El mayor tiempo se fue en las pruebas de concurrencia y en ajustar el versionado por lote.

## Fase 2 — Reserva, pago falso e idempotencia

### Qué se pidió y qué se hizo

- **Prompt:** «procede con la fase 2».
- **Resultado:** se agregó la confirmación de reserva con bloqueo por vuelo, un pago falso que solo acepta `TEST_OK` o `TEST_DECLINE` y no recibe datos de tarjeta, una huella SHA-256 de la petición para detectar cambios, un código de reserva de 6 caracteres con reintento si choca, repetición segura de la misma petición, consulta por código y email, y sus pruebas.

### Errores de la IA y correcciones

- **La repetición segura se revisaba después de validar el asiento.** Un reintento después de completar la reserva podía fallar. Se revisa primero por la clave de idempotencia, antes de abrir la transacción, y se vuelve a revisar dentro de la transacción, después del bloqueo.
- **Un código de reserva repetido cancelaba toda la transacción.** Un `UNIQUE` en la base de datos aborta la operación completa, así que no bastaba con reintentar el `INSERT`. Se usó un punto de retorno (`SAVEPOINT`) por intento: se deshace solo ese intento y se genera otro código, con un máximo de 3 intentos.
- **Una prueba de asiento ajeno estaba mal planteada.** Enviaba el vuelo equivocado, así que comprobaba un hold inexistente en vez del caso real. Se corrigió para enviar el vuelo solicitado con un asiento de otro vuelo y exigir `409 SEAT_UNAVAILABLE`.

### Impacto estimado

Pendiente de consolidar. La fase se apoyó en el esquema y el bloqueo por vuelo que ya existían. El tiempo se concentró en la idempotencia (revisión rápida y revisión dentro de la transacción), en los choques de código y en las pruebas concurrentes.

## Fase 3 — Tiempo real, métricas y administración

### Qué se pidió y qué se hizo

- **Prompt:** «procede con la fase 3».
- **Resultado:** se agregó comunicación en tiempo real con Socket.io. Cada pantalla entra a una sala por vuelo o a la sala de búsqueda, recibe cambios de asientos y del vuelo, y el dashboard recibe métricas agrupadas. También se agregaron el endpoint de métricas y el cambio de estado administrativo con validación de transiciones.

### Errores de la IA y correcciones

- **Un módulo no importaba sus dependencias.** El módulo de catálogo registró el caso de uso que cambia el estado del vuelo, pero no importaba el módulo que provee el bloqueo y el publicador de eventos; Nest no podía crear el servicio. Se agregó el import y la prueba de integración lo detectó de inmediato.
- **El agrupamiento de métricas no evitaba duplicados.** Programar un temporizador por cada evento de asiento habría enviado varias métricas en la misma ventana. Se deduplicó por vuelo: la primera señal abre la ventana y los eventos siguientes se agrupan en un solo `flight.metrics`.
- **La prueba de dos clientes estaba incompleta.** La primera versión solo revisaba al receptor B. Se agregó el receptor A y se comprobó que ambos reciben la misma versión, para demostrar que el evento se transmite igual y que la versión siempre avanza.

### Impacto estimado

Pendiente de consolidar. La fase fue corta porque los eventos ya se publicaban después del commit y el contrato de versiones existía. El mayor esfuerzo fue el orden de inicialización del gateway y del publicador, y la ventana de agrupamiento.

## Fase 4 — Frontend completo

### Qué se pidió y qué se hizo

- **Prompt:** «procede con la fase 4», seguido de la corrección de alcance «valida primero luego confirma cambios».
- **Resultado:** se completaron las cuatro pantallas: búsqueda, mapa de asientos, ticket y dashboard. El mapa se sincroniza por versiones, guarda eventos mientras se reconecta, muestra la cuenta regresiva del hold y permite navegar con teclado. El checkout es idempotente, el ticket se consulta por código y email, y el dashboard muestra un feed de eventos. Se agregaron pruebas unitarias del frontend.

### Errores de la IA y correcciones

- **La selección se mantenía después de expirar.** El estado de la pantalla conservaba el asiento seleccionado aunque ya no fuera del usuario o estuviera reservado. Se corrigió para mantenerlo solo si sigue disponible o si es un hold propio.
- **El selector de asiento era ambiguo.** El script de dos pestañas usaba `.seat-available`, que también coincidía con el ejemplo de la leyenda, así que el clic no hacía nada. Se cambió a `button.seat-available`.
- **Chrome `--dump-dom` se quedaba colgado.** La aplicación mantiene un WebSocket abierto y ese modo de Chrome no terminaba. Se reemplazó por el protocolo de DevTools de Chrome (CDP) para navegar, leer el DOM y tomar capturas.
- **La instalación de axe por npm se quedaba colgada.** Se descargó `axe.min.js` desde una CDN y se inyectó con CDP. Resultado: 0 violaciones WCAG 2.1 AA en las cuatro rutas.

### Impacto estimado

Pendiente de consolidar. La fase concentró la mayor cantidad de código de interfaz. El reducer y las pruebas puras permitieron validar la sincronización sin depender de un navegador, y la prueba rápida manual con CDP cubrió dos pestañas, una reserva y un ticket reales.

## Fase 5 — Playwright, documentación y CI

### Qué se pidió y qué se hizo

- **Prompt:** «proceed with next phase».
- **Resultado:** se agregó Playwright y axe-core para probar la aplicación en un navegador real, un endpoint de reinicio de datos limitado a `test|e2e` y protegido con token, un perfil de contenedores aislado para E2E, documentación de arquitectura y operaciones, y CI con los pasos `preflight`, `quality`, `integration`, `e2e` y `secrets`.

### Errores de la IA y correcciones

- **`crypto.randomUUID` no existía en el origen del contenedor.** La prueba E2E-2 falló porque el checkout generaba la clave de idempotencia con `crypto.randomUUID()`, que solo está disponible en contextos seguros. En el contenedor el origen es `http://frontend`, no `localhost`, así que la función no existía y el envío lanzaba `TypeError`. Se agregó un generador de UUIDv4 con `crypto.getRandomValues` como respaldo (y `Math.random` como último recurso), más una prueba unitaria que fuerza ese camino. Es un error que el smoke manual en `localhost` no detecta.
- **La imagen de Playwright no podía escribir `test-results`.** El `COPY` creaba `/app/e2e` como root antes del `COPY --chown`, y el usuario del runner no podía crear la carpeta. Se agregó `mkdir` y `chown -R pwuser:pwuser /app/e2e` después del copy.
- **podman-compose reutilizaba un contenedor viejo.** Después de reconstruir la imagen, `up` usaba el contenedor anterior y el error de permisos seguía apareciendo. Se agregó `--force-recreate` al objetivo `make test-e2e` y al job de CI.
- **El TTL corto no era la causa del fallo.** El perfil E2E usa 5 segundos para probar la expiración. La primera ejecución de reserva no cabía en esa ventana por el error de `randomUUID`, no por el TTL. Se mantuvo el valor y se corrigió la causa real.
- **CI no garantizaba Podman 5.x.** El runner de Ubuntu trae una versión anterior. Se fijó `podman-compose==1.5.0` y se agregó una comprobación explícita con `podman info` y `podman compose version`, dejando claro que el runtime objetivo sigue siendo Podman 5.7.
- **El modo de desarrollo fallaba con pod y `keep-id`.** `podman-compose` crea un pod por defecto y Podman no permite combinar `--userns` con `--pod`. Se agregó `--in-pod=false` al objetivo `make dev`, al README y a la guía de operaciones, y se validó el arranque con el healthcheck y el proxy de Vite.

### Impacto consolidado

Estimaciones aproximadas por área, sin cronómetro; el KATA premia la honestidad sobre la cifra:

| Área                                                                        | Ahorro estimado | Tiempo invertido en corregir/ajustar | Comentario                                                                                       |
| --------------------------------------------------------------------------- | --------------: | -----------------------------------: | ------------------------------------------------------------------------------------------------ |
| Planificación, revisión del plan y decisiones de arquitectura               |           1.5 h |                                1.0 h | Corrección del Markdown, Podman, alcance de la cancelación y recorte del apéndice                |
| Base del proyecto (paquetes, Nest, Vite, Zod, pruebas y contenedores)       |           2.5 h |                                0.5 h | El código base salió casi directo; ajustes de `tsconfig`, `LOG_PRETTY`, Vitest 3 y `tsup`        |
| Núcleo de consistencia (holds, bloqueos, expiración, reserva, idempotencia) |           1.0 h |                                1.5 h | Errores de hold en una sentencia, bloqueo faltante, orden de idempotencia y punto de retorno     |
| Tiempo real (canal en vivo, salas, versiones, métricas)                     |           1.0 h |                                0.5 h | Inicialización del publicador y el gateway, agrupamiento y prueba de dos clientes                |
| Interfaz (rutas, reducer, checkout, accesibilidad)                          |           1.5 h |                                1.0 h | Selección tras expiración, selector ambiguo y `randomUUID` fuera de contexto seguro              |
| Pruebas (integración, E2E, CI)                                              |           1.5 h |                                1.5 h | Imagen de Playwright, contenedores cacheados, puertos y dependencias                             |
| Documentación (README, arquitectura, operaciones, bitácora)                 |           1.0 h |                                0.5 h | El contenido se estructuró rápido; la consolidación exigió releer las fases                      |
| **Total**                                                                   |    **≈ 10.0 h** |                          **≈ 6.5 h** | **Ahorro neto ≈ 3.5 h**, con la mayor parte del costo en concurrencia, contenedores y validación |

Conclusión honesta: la IA aceleró sobre todo la base del proyecto, los contratos, las pruebas puras y la documentación. El tiempo se fue en los detalles que definen si el sistema funciona bien: concurrencia, idempotencia, orden de los eventos y diferencias entre la máquina local y el contenedor. El caso de `crypto.randomUUID` muestra por qué las pruebas E2E y las pruebas contra Postgres real no son un adorno: encontraron un error que la prueba rápida manual en `localhost` no reproducía.
