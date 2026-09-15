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
- GPS sólo puede avanzar hasta `AT_GATE`;
- `COMPLETED` queda reservado para confirmación futura de Nexus.Access/Gateway;
- el recorrido puede iniciar desde cualquier distancia con una medición utilizable y fresca.

El estado inicial de un recorrido respeta directamente la medición fresca existente (`OUTSIDE`, `WAITING`, `READY` o `AT_GATE`).

El polling evita mediciones periódicas simultáneas y OSRM tiene timeout con fallback a Haversine.

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
