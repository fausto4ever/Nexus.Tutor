# Nexus.Tutor 0.1.9 — arquitectura de transición

Esta rama parte del commit estable `47b8524` y prioriza separación de responsabilidades antes de reintroducir mejoras de GPS o experiencia.

## Propiedad de cada capa

- `config.js`: defaults y reparación/migración temprana de configuración antes de arrancar la app.
- `core/runtime.js`: utilidades compartidas de storage, eventos internos y acceso DOM.
- `services/location.js`: único propietario del acceso a `navigator.geolocation`; expone `supported`, `watch`, `stop` y `fresh`.
- `app.js`: controlador del recorrido 0.1.9 durante la migración. Consume `services/location.js` y debe seguir perdiendo responsabilidades, no ganarlas.
- `features/destinations.js`: destinos guardados y su persistencia.
- `ui/shell.js`: navegación inferior y tema Light/Dark.
- `css/foundation.css`: estilos estructurales heredados del 0.1.9 estable.
- `css/application.css`: capa visual compacta aplicada sobre foundation durante la transición.

## Reglas

1. Cuatro pestañas oficiales: Recorrido, Mi QR, Avisos y QR temporal.
2. No añadir una pestaña Lab a esta rama.
3. No interceptar ni reemplazar métodos nativos de `navigator.geolocation`.
4. Ningún feature o controlador debe acceder directamente a `navigator.geolocation`; debe usar `services/location.js`.
5. `features/destinations.js` debe convertirse en el único propietario del modelo de destinos; se eliminará la dependencia capture/bubble con `app.js` antes de considerar estable esta rama.
6. No reintroducir modo híbrido ni calibración estadística durante la estabilización.
7. Todo cambio estructural debe mantener `scripts/test-startup.mjs` verde.
8. El build final debe ejecutar pruebas contra el orden real de scripts y validar los assets de `dist`.

## Migraciones completadas

- El navegador carga las fuentes por responsabilidad: runtime → location → journey controller → destinations → UI shell.
- Los archivos legacy duplicados `coordinates.js`, `ui.js`, `styles.css` y `ui.css` fueron retirados de esta rama.
- `app.js` ya no toca directamente `navigator.geolocation`; `watchPosition` y `getCurrentPosition` están encapsulados en `services/location.js`.
- El arranque integrado valida IDs reales del HTML y el enlace de controles críticos.

## Deuda aún deliberadamente conservada

La primera fase conserva la cascada visual de 0.1.9 como dos archivos para no cambiar apariencia al mismo tiempo que estructura. `foundation.css` y `application.css` todavía contienen reglas superpuestas; deben consolidarse después de asegurar equivalencia funcional.

`app.js` todavía concentra configuración, render, polling, telemetría y máquina de estados. La siguiente separación de alto valor es eliminar la doble propiedad de destinos/configuración entre `app.js` y `features/destinations.js`, y después consolidar la cascada CSS.
