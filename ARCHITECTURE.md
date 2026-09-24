# Nexus.Tutor — arquitectura y flujo maestro

## Objetivo

Mantener el comportamiento funcional validado de Nexus.Tutor mientras reducimos deuda técnica y dejamos límites claros entre almacenamiento, geolocalización, cálculo de distancia, telemetría, destinos, recorrido, presentación y solicitudes de recogida.

## Contexto multi-repositorio

El sistema se desarrolla en repositorios separados. Cada chat de trabajo debe concentrarse en un solo repositorio/proceso y no modificar otro repositorio salvo instrucción explícita.

- **Nexus.Tutor**: aplicación del tutor. Rama de trabajo actual: `refactor/0.1.9-structure`.
- **Nexus.Access**: aplicación del operador escolar. La integración con Gateway se trabaja en su rama `gateway-integration`.
- **Nexus.Display**: pantalla operativa/cola visible. Se trata como repositorio independiente de Access.
- **Gateway**: frontera de servicios compartidos entre clientes y backend. Se trata como repositorio independiente y sus cambios no deben confundirse con Access, Tutor o Display.

### Regla de trabajo

Antes de cualquier escritura confirmar mentalmente: **repositorio → rama → alcance**. `main` no es rama de trabajo de Nexus.Tutor. No mergear, revertir ni publicar en `main` sin autorización explícita del usuario. El trabajo de Tutor continúa únicamente en `refactor/0.1.9-structure` hasta nueva instrucción.

Después de cada publicación de Tutor se debe reportar: **repositorio → rama → versión → commit → URL de Cloudflare/Workers usada para probar esa rama**. No inferir ni inventar URLs de deployment.

## Capas actuales

### `config.js`

Define valores por defecto y conserva la migración inicial de configuraciones/destinos guardados.

### `core/runtime.js`

Infraestructura compartida: acceso seguro a `localStorage`, bus de eventos, utilidades DOM y aislamiento de fallos de listeners.

### `services/location.js`

Única frontera con `navigator.geolocation`: `watchPosition`, lectura fresca, detener watch y conservar última posición aceptada.

### `services/distance.js`

Único propietario del cálculo físico de distancia: validación de coordenadas, Haversine, OSRM para laboratorio, timeout, fallback a Haversine y modo manual.

### `services/telemetry.js`

Propietario del historial y telemetría locales, retención y exportación JSON.

### `features/destinations.js`

Propietario de configuración, destinos, coordenadas, umbrales, método de distancia y publicación de `config:changed`.

### `ui/journey-view.js`

Propietario de la presentación del recorrido. La vista recibe estado calculado y no decide transiciones de negocio.

### `features/journey.js`

Coordinador del recorrido: máquina de estados, inicio/reinicio/finalización, promoción monotónica, polling, GPS, simulación y coordinación entre servicios.

La máquina histórica del recorrido es:

`OUTSIDE → WAITING → READY → AT_GATE → COMPLETED`

El estado sólo avanza; una distancia mayor no degrada un estado alcanzado y `COMPLETED` es terminal.

### `features/lab-pickup-modes.js`

Laboratorio de los tres modos de solicitud de recogida. En la versión actual la frontera con Gateway es un **placeholder**: permite probar la UI y conservar solicitudes locales, pero todavía no realiza POST reales.

## Flujo maestro de solicitud de recogida

### Regla común

Los tres modos comienzan igual:

`VOY POR MI HIJO → crear solicitud → REQUESTED`

`REQUESTED` significa que el colegio sabe que el tutor irá por el alumno. No significa que esté cerca ni que haya llegado.

La solicitud remota confirmada no debe depender de que Tutor continúe conectado. Una vez que Gateway confirme `REQUESTED`, perder Internet, GPS, cerrar la PWA o quedarse sin batería no debe borrar ni retroceder la solicitud.

### Modo 1 — Sin ubicación

Alumno de laboratorio: `1001`.

`REQUESTED → permanece REQUESTED`

Tutor no comparte GPS. La solicitud sí debe existir y ser visible para los operadores: saben que irá por el alumno, aunque no saben cuándo llegará. No se inventa por ahora una transición automática a WAITING/READY/AT_GATE.

### Modo 2 — GPS solo para ETA

Alumno de laboratorio: `1002`.

Al iniciar se toma una lectura de ubicación y se calcula un ETA inicial. Después no se requiere compartir la posición durante todo el trayecto.

Flujo:

`REQUESTED → WAITING → READY`

Las promociones se estiman por el ETA inicial y el tiempo transcurrido. El laboratorio usa una velocidad media inicial de referencia de **20 km/h** cuando simula ETA mediante distancia/Haversine.

Con WAITING equivalente aproximadamente a los últimos 1000 m, a 20 km/h representa aproximadamente **3 minutos**. READY representa llegada inminente. Ejemplo conceptual para ETA inicial de 20 minutos:

- T=00: `REQUESTED`, ETA 20 min.
- Aproximadamente cuando resten 3 min: `WAITING`.
- En la ventana final de llegada estimada: `READY`.
- Al llegar ETA a cero **no se promueve automáticamente a `AT_GATE`**.

La razón es que una lectura tomada al inicio no demuestra presencia real: el tutor pudo detenerse o cambiar su recorrido.

### Modo 3 — GPS durante todo el recorrido / GPS ALL

Alumno de laboratorio: `1003`.

Flujo objetivo:

`REQUESTED → WAITING → READY → AT_GATE`

Mientras está fuera de los umbrales, el recorrido y las mediciones pueden mantenerse localmente. Las fronteras de laboratorio actuales son:

- `WAITING`: 1000 m.
- `READY`: 100 m.
- `AT_GATE`: 20 m.

Aquí `AT_GATE` sí puede alcanzarse por evidencia GPS continua al cruzar la geobarda correspondiente.

## Semántica operativa de estados

- **REQUESTED**: sabemos que el tutor viene.
- **WAITING**: está próximo o, en modo ETA, se estima que está próximo.
- **READY**: llegada inminente; puede ser estimada en modo ETA.
- **AT_GATE**: existe evidencia de presencia/llegada, no sólo una predicción temporal.
- **COMPLETED**: entrega completada.
- **CANCELLED**: solicitud cancelada explícitamente.
- **EXPIRED**: solicitud caducada por proceso de limpieza cuando corresponda.

## Cancelar solicitud

Los tres modos deben ofrecer **Cancelar solicitud** mientras la solicitud permanezca activa.

Flujo objetivo:

`REQUESTED/WAITING/READY/AT_GATE → CANCELLED`

Cancelar una solicitud **no genera un evento de SALIDA**.

Si Tutor solicita cancelar pero Access ya completó la entrega, `COMPLETED` prevalece y la cancelación debe rechazarse/ignorarse como transición inválida. Tutor actualiza entonces al estado autoritativo recibido.

Si no hay conexión al pulsar cancelar, Tutor no debe afirmar que Gateway ya la canceló. Puede conservar una intención de cancelación pendiente y sincronizarla cuando recupere comunicación.

## Resiliencia y sincronización

Principios acordados:

- Silencio o pérdida de comunicación **no significa cancelación**.
- Nunca retroceder el último estado confirmado por Gateway por falta de GPS/Internet.
- Tutor debe conservar localmente el `requestId` cuando Gateway lo proporcione.
- Al recuperar conexión debe continuar sobre la solicitud existente, no crear otra por defecto.
- Si el POST inicial llegó al Gateway pero Tutor perdió la respuesta, una futura protección de duplicados debe permitir recuperar/reconocer la solicitud activa existente.
- La regla de impedir solicitudes activas duplicadas queda pendiente de implementación durante esta etapa de laboratorio; para probar los tres modos se utilizan los alumnos 1001, 1002 y 1003.

## Relación con Nexus.Access y Gateway

### Cierre desde Access

Flujo objetivo acordado:

`Access solicita cerrar request → Gateway confirma → Access genera captura manual/SALIDA → syncRecords → sincronización eventual de la solicitud`

El primer actor que complete/cierre la solicitud gana. Si después llega otro registro cercano, no debe inventarse una segunda solicitud. Los movimientos de asistencia/salida siguen siendo registros auditables y no se pretende eliminar toda duplicidad de movimientos extendiendo artificialmente la ventana de duplicados a 24 horas.

### Offline de Access

Access puede registrar una salida estando offline. La solicitud remota podría seguir abierta hasta que llegue la sincronización. Otro operador podría haberla marcado entregada antes. Cuando `syncRecords` llegue posteriormente, el sistema debe poder reconocer la realidad ya completada en vez de cancelar o recrear innecesariamente la solicitud.

### Caducidad

Se contempla una función de Gateway que, al ejecutarse, tome solicitudes abiertas de fechas anteriores a hoy y las marque `EXPIRED`, sin requerir IDs individuales. Puede ser invocada como mantenimiento oportunista/asíncrono desde otro flujo del Gateway, siempre evitando convertir una llamada crítica en un proceso lento.

## Regla futura de solicitud activa

Objetivo: no permitir dos solicitudes activas simultáneas para el mismo alumno. Si ya existe una, Tutor debería recibir una respuesta del tipo “Juan ya tiene una solicitud de recogida” y reutilizar/mostrar la existente.

Una solicitud completada no impide crear una nueva el mismo día si el alumno volvió a entrar o continúa actividades extracurriculares y posteriormente requiere otra recogida.

Esta validación está **pendiente** y no bloquea el laboratorio actual.

## Presencia y otras fuentes de AT_GATE

`AT_GATE` debe conservar una semántica fuerte de presencia. Además de GPS ALL, el diseño futuro contempla:

- `TUTOR_QR`: QR permanente del tutor escaneado en un punto de control.
- `ACCESS_MANUAL`: operador confirma presencia.
- `TEMPORARY_QR`: tercero autorizado presenta QR temporal.

Si ya existe una solicitud activa, estas fuentes deben reafirmar la llegada y no crear una solicitud duplicada.

El sistema no debe convertir GPS en requisito de entrega.

## Mejoras de Nexus.Tutor registradas

### Datos de la escuela

Tutor tendrá un apartado con datos de contacto de la escuela. Si ya existe una solicitud activa, la interfaz podrá indicar al tutor que el alumno ya tiene solicitud de recogida y ofrecer los datos del colegio para comunicarse si necesita resolver una excepción.

### Aviso de cierre de ventana de recogida

Cuando la ventana de recogida esté próxima a cerrar, Tutor podrá avisar al tutor o tutores correspondientes.

### Solicitud por WhatsApp — futura

Se contempla que Tutor permita iniciar la solicitud mediante WhatsApp vinculado al colegio. Access tendría registrado el teléfono del tutor para identificarlo; el bot podría indicar el colegio, consultar/confirmar hijo(s) asociados y crear la solicitud correspondiente. Queda como mejora futura, no como dependencia del flujo actual.

## Estado actual del laboratorio

La UI dispone de tres pruebas independientes:

- `1001` — Sin ubicación.
- `1002` — GPS solo ETA.
- `1003` — GPS ALL.

Cada una crea localmente una solicitud `REQUESTED` y ofrece cancelación. La llamada real al Gateway todavía está vacía mediante funciones placeholder. El objetivo inmediato es validar primero interfaz y dinámica antes de conectar el contrato real del Gateway.

Versión de Tutor al documentar este flujo: **0.1.13**.

## CSS

La base visual única está en `css/nexus-tutor.css`. No deben reaparecer hojas legacy ni sobrescrituras paralelas. Se mantienen tema claro/oscuro, `:focus-visible`, `prefers-reduced-motion`, `100dvh` y navegación inferior.

## Orden de arranque base

1. `config.js`
2. `core/runtime.js`
3. `services/location.js`
4. `services/distance.js`
5. `services/telemetry.js`
6. `features/destinations.js`
7. `ui/journey-view.js`
8. `features/journey.js`
9. `ui/shell.js`

El laboratorio de solicitudes (`features/lab-pickup-modes.js`) debe cargarse explícitamente desde la página mientras forme parte de esta etapa de pruebas.

## Política de rama

El trabajo de Nexus.Tutor continúa en `refactor/0.1.9-structure`.

No crear ramas nuevas salvo instrucción explícita.

**No mergear, revertir, publicar ni escribir en `main` sin autorización explícita.**
