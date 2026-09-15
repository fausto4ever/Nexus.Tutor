# Nexus.Tutor 0.1.9 — arquitectura de trabajo

## Objetivo

Mantener el comportamiento funcional validado de Nexus.Tutor mientras reducimos deuda técnica y dejamos límites claros entre almacenamiento, geolocalización, destinos, recorrido y presentación.

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

### `features/journey.js`

Actualmente coordina:

- máquina de estados del recorrido;
- cálculo de distancia;
- polling;
- GPS y reanudación;
- simulación manual;
- render de la pantalla de recorrido;
- historial y telemetría;
- conectividad;
- finalización del recorrido.

Este archivo sigue siendo el siguiente candidato a división por responsabilidades. Esa división se hará después de estabilizar esta base, sin cambiar comportamiento.

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
- `features/destinations.js → destinations.min.js`
- `features/journey.js → journey.min.js`
- `ui/shell.js → shell.min.js`
- `css/nexus-tutor.css → nexus-tutor.min.css`

El build de producción no genera sourcemaps.

## Pruebas

- `test-startup.mjs`: orden real de scripts y propietarios únicos de acciones principales.
- `test-history.mjs`: recorrido, estados, polling, GPS, historial y telemetría.
- `test-destinations.mjs`: destinos, configuración, selección inmediata y bloqueo durante recorrido.
- `test-ui.mjs`: estructura de cuatro pestañas, tema, stylesheet único y componentes visuales base.
- `test-css.mjs`: exige un único CSS fuente, 0 `!important`, ausencia de CSS legacy, foco visible y reduced motion.

## Política de rama

El trabajo continúa en la rama existente `refactor/0.1.9-structure`.

No crear ramas nuevas salvo instrucción explícita del usuario.

No mergear ni publicar en `main` sin autorización explícita.
