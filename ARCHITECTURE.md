# Nexus.Tutor 0.1.9 — arquitectura de trabajo

## Objetivo

Mantener el comportamiento funcional validado de Nexus.Tutor mientras reducimos deuda técnica y dejamos límites claros entre almacenamiento, geolocalización, cálculo de distancia, telemetría, destinos, recorrido y presentación.

## Capas actuales

### `config.js`

Define los valores por defecto de Nexus.Tutor y conserva la migración inicial de configuraciones/destinos guardados.

### `core/runtime.js`

Infraestructura compartida:

- acceso seguro a `localStorage`;
- bus de eventos interno;
- utilidades DOM;
- aislamiento de fallos de listeners para que un consumidor no interrumpa a los demás.

### `services/location.js`

Única frontera con `navigator.geolocation`.

Responsabilidades:

- `watchPosition`;
- lectura fresca con `getCurrentPosition`;
- detener el watch;
- conservar la última posición aceptada.

Ningún otro módulo debe monkey-patchear `navigator.geolocation` ni simular eventos de foco.

### `services/distance.js`

Único propietario del cálculo físico de distancia.

Responsabilidades:

- validación de coordenadas del destino;
- Haversine para distancia directa;
- consulta OSRM para ruta en auto;
- timeout de OSRM;
- fallback automático a Haversine;
- modo manual para laboratorio.

`features/journey.js` no contiene Haversine ni conoce la URL de OSRM.

### `services/telemetry.js`

Propietario del almacenamiento de historial y telemetría.

Responsabilidades:

- historial local del recorrido;
- telemetría local;
- límites de retención;
- exportación JSON.

`features/journey.js` y `features/destinations.js` producen eventos, pero no administran directamente las claves de historial/telemetría.

### `features/destinations.js`

Único propietario de:

- diálogo de configuración;
- destinos guardados;
- destino activo;
- coordenadas;
- umbrales;
- método de distancia;
- selección inmediata de destino;
- publicación de `config:changed`.

Durante un recorrido activo, los controles editables del diálogo quedan bloqueados. El diálogo puede abrirse para consultar la configuración, pero no modificarla.

### `ui/journey-view.js`

Propietario de la presentación del recorrido.

Responsabilidades:

- referencias DOM de la pantalla Recorrido;
- distancia, precisión y fuente;
- barra de progreso y marcadores;
- estado y mensajes visibles;
- botón principal y reinicio;
- simulador visual;
- historial visible;
- indicador de conectividad;
- cuenta regresiva.

La vista recibe estado ya calculado y no decide transiciones de negocio.

### `features/journey.js`

Queda como coordinador del caso de uso del recorrido.

Responsabilidades:

- máquina de estados;
- inicio, reinicio y finalización;
- promoción monotónica de estado;
- polling;
- ciclo de GPS y reanudación;
- simulación manual como fuente de medición;
- coordinación entre `location`, `distance`, `telemetry` y `journey-view`;
- reacción a `config:changed`;
- hook futuro `window.NEXUS_TUTOR_COMPLETE_JOURNEY`.

Reglas de estado:

`OUTSIDE → WAITING → READY → AT_GATE → COMPLETED`

- el estado sólo puede avanzar;
- una distancia mayor nunca degrada un estado ya alcanzado;
- `COMPLETED` es terminal;
- GPS puede avanzar hasta `AT_GATE`;
- el recorrido puede iniciar desde cualquier distancia con una medición utilizable y fresca;
- mientras no exista confirmación real desde Nexus.Access/Gateway, la implementación de laboratorio completa automáticamente después de 3 minutos en `AT_GATE`;
- cuando Nexus.Access/Gateway quede integrado, la confirmación real de entrega sustituirá ese cierre temporal.

El estado inicial de un recorrido respeta directamente la medición fresca existente (`OUTSIDE`, `WAITING`, `READY` o `AT_GATE`).

El polling evita mediciones periódicas simultáneas y OSRM tiene timeout con fallback a Haversine.

## Principio funcional de entrega y `AT_GATE`

La prioridad de Nexus.Tutor no es el trayecto en automóvil. La prioridad es que el tutor se presente en la escuela, solicite al alumno y se complete la entrega de forma controlada.

Por lo tanto, `AT_GATE` se define como un **evento de presencia en el punto de control de recogida**. No significa exclusivamente “el GPS reportó 20 metros”. El GPS es sólo una de varias maneras de confirmar esa presencia.

### Regla principal

`AT_GATE → solicitud de entrega → cola de Nexus.Access → entrega → COMPLETED`

La solicitud de entrega debe nacer o reafirmarse cuando existe un evento `AT_GATE` válido.

### Fuentes de `AT_GATE`

Se contemplan las siguientes fuentes:

- `GPS`: Nexus.Tutor detecta que el tutor llegó al rango configurado. Es una ayuda opcional; el sistema no debe depender de que el tutor tenga GPS disponible o suficientemente preciso.
- `TUTOR_QR`: el QR permanente de “Mi QR” se escanea en un punto de control configurado para recogida.
- `ACCESS_MANUAL`: un operador de Nexus.Access confirma manualmente que el tutor está presente y solicita al alumno.
- `TEMPORARY_QR`: un tercero autorizado presenta un QR temporal vigente para recoger al alumno.

El origen deberá conservarse en la solicitud para diagnóstico y auditoría funcional, por ejemplo `GPS`, `TUTOR_QR`, `ACCESS_MANUAL` o `TEMPORARY_QR`.

### Comportamiento de “Mi QR”

“Mi QR” es la credencial permanente del tutor.

Cuando se escanea en un punto de control de recogida:

- si no existe una solicitud activa para esa entrega, el escaneo confirma `AT_GATE` y crea la solicitud de entrega;
- si el tutor ya venía con un recorrido activo o ya existe una solicitud, el escaneo **reafirma `AT_GATE`** y no debe crear una solicitud duplicada;
- el escaneo prevalece como confirmación presencial aunque el vehículo continúe moviéndose o la lectura GPS no sea suficientemente precisa.

Esto permite que el tutor use GPS durante el trayecto si lo desea, pero garantiza que pueda completar el flujo únicamente presentándose en el punto de control.

### Nexus.Access como término medio

Si el tutor no usa GPS y tampoco presenta un QR, el operador puede crear o confirmar manualmente la solicitud desde Nexus.Access.

Esta captura manual representa la misma realidad funcional: **el tutor ya está presente en el punto de control**. Por lo tanto, debe producir el mismo resultado lógico que las demás fuentes de `AT_GATE`.

### Solicitudes anticipadas — mejora futura

Nexus.Tutor podrá permitir avisos anticipados como:

- “Hoy voy por mi hijo a las 14:30”.
- “Esta semana voy por mi hijo a las 14:30”.
- posteriormente, reglas recurrentes como determinados días de la semana.

Una solicitud anticipada **no equivale a `AT_GATE`** y no debe sacar al alumno por sí sola. Sirve para avisar o preparar la operación. La presencia real seguirá confirmándose mediante GPS, QR, QR temporal o captura manual en Nexus.Access.

Si la hora solicitada corresponde a una salida anticipada respecto de la política del alumno, una evolución futura podrá enviarla a autorización de dirección antes de habilitar la entrega.

### Estado de implementación

Este apartado define el principio funcional objetivo.

En la versión de laboratorio actual:

- `AT_GATE` por GPS ya existe;
- el cierre temporal de 3 minutos después de `AT_GATE` ya existe;
- `TUTOR_QR`, `ACCESS_MANUAL`, `TEMPORARY_QR` y la creación real de solicitudes en Nexus.Access/Gateway todavía deben implementarse;
- las solicitudes anticipadas y la autorización de salida temprana quedan como mejoras futuras.

### Principio de diseño

El sistema no debe convertir el GPS en requisito de entrega.

**GPS ayuda al trayecto; el punto de control confirma la presencia; `AT_GATE` desencadena la solicitud de entrega.**

### `ui/shell.js`

Propietario de:

- navegación entre las cuatro pestañas;
- tema claro/oscuro;
- persistencia de pestaña y tema;
- seguimiento de `prefers-color-scheme` mientras el usuario no haya elegido un tema manualmente.

## Orden de arranque

1. `config.js`
2. `core/runtime.js`
3. `services/location.js`
4. `services/distance.js`
5. `services/telemetry.js`
6. `features/destinations.js`
7. `ui/journey-view.js`
8. `features/journey.js`
9. `ui/shell.js`

## CSS

La cascada histórica fue retirada y se reconstruyó una única base visual en:

`css/nexus-tutor.css`

Reglas actuales:

- un solo stylesheet fuente;
- sin `!important`;
- sin `transition: all`;
- variables para tema claro/oscuro;
- `color-scheme` para controles nativos;
- `:focus-visible`;
- `prefers-reduced-motion`;
- soporte `100dvh` con fallback;
- navegación inferior, tarjetas, recorrido, historial, pantallas futuras y diálogo de configuración definidos en la misma hoja;
- los marcadores WAITING/READY/AT_GATE usan anclajes CSS para no desbordarse en los extremos.

No deben reaparecer `foundation.css`, `application.css`, `styles.css` ni `ui.css`.

## Build

`scripts/build.mjs` compila:

- `config.js → config.min.js`
- `core/runtime.js → runtime.min.js`
- `services/location.js → location.min.js`
- `services/distance.js → distance.min.js`
- `services/telemetry.js → telemetry.min.js`
- `features/destinations.js → destinations.min.js`
- `ui/journey-view.js → journey-view.min.js`
- `features/journey.js → journey.min.js`
- `ui/shell.js → shell.min.js`
- `css/nexus-tutor.css → nexus-tutor.min.css`

El build de producción no genera sourcemaps.

## Pruebas

- `test-startup.mjs`: orden real de los nueve scripts y propietarios únicos de acciones principales.
- `test-history.mjs`: ejecuta los módulos reales de distancia, telemetría, vista y recorrido para validar estados, polling, GPS, historial y telemetría.
- `test-destinations.mjs`: destinos, configuración, selección inmediata, telemetría compartida y bloqueo durante recorrido.
- `test-ui.mjs`: estructura de cuatro pestañas, tema, stylesheet único y fronteras de responsabilidad del recorrido.
- `test-css.mjs`: exige un único CSS fuente, 0 `!important`, ausencia de CSS legacy, foco visible y reduced motion.

## Política de rama

El trabajo continúa en la rama existente `refactor/0.1.9-structure`.

No crear ramas nuevas salvo instrucción explícita del usuario.

No mergear ni publicar en `main` sin autorización explícita.
