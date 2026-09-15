# Nexus.Tutor 0.1.9 — arquitectura de transición

Esta rama parte del commit estable `47b8524` y prioriza separación de responsabilidades antes de reintroducir mejoras de GPS o experiencia.

## Propiedad de cada capa

- `config.js`: defaults y reparación/migración temprana de configuración antes de arrancar la app.
- `core/runtime.js`: utilidades compartidas de storage, eventos internos y acceso DOM.
- `services/location.js`: único propietario del acceso a `navigator.geolocation`; expone `supported`, `watch`, `stop`, `fresh` y la última posición aceptada mediante `current`.
- `features/destinations.js`: único propietario del diálogo de configuración, destinos guardados, selección de destino, coordenadas, umbrales y método de distancia. Publica `config:changed` al guardar.
- `features/journey.js`: controlador del recorrido 0.1.9. Consume configuración ya persistida y eventos `config:changed`; no registra listeners sobre los controles de configuración.
- `ui/shell.js`: navegación inferior y tema Light/Dark.
- `css/foundation.css`: estilos estructurales heredados del 0.1.9 estable.
- `css/application.css`: capa visual compacta aplicada sobre foundation durante la transición.

## Reglas

1. Cuatro pestañas oficiales: Recorrido, Mi QR, Avisos y QR temporal.
2. No añadir una pestaña Lab a esta rama.
3. No interceptar ni reemplazar métodos nativos de `navigator.geolocation`.
4. Ningún feature o controlador debe acceder directamente a `navigator.geolocation`; debe usar `services/location.js`.
5. `features/destinations.js` es el único propietario de guardar/seleccionar destinos y del botón `Guardar cambios`.
6. `features/journey.js` sólo reacciona a cambios de configuración mediante eventos del runtime; no depende del orden capture/bubble de listeners de settings.
7. No reintroducir modo híbrido ni calibración estadística durante la estabilización.
8. Todo cambio estructural debe mantener `scripts/test-startup.mjs` verde.
9. El build final debe ejecutar pruebas contra el orden real de scripts y validar los assets de `dist`.

## Migraciones completadas

- El navegador carga las fuentes por responsabilidad: config → runtime → location → destinations → journey → UI shell.
- Los archivos legacy duplicados `coordinates.js`, `ui.js`, `styles.css` y `ui.css` fueron retirados de esta rama.
- El acceso a `watchPosition` y `getCurrentPosition` está encapsulado en `services/location.js`.
- `features/destinations.js` ya no depende de un listener capture antes de otro guardado ni de un listener bubble posterior. Guardar configuración tiene un único propietario.
- La configuración se comunica al recorrido mediante `RUNTIME.events` (`config:changed`).
- El arranque integrado valida IDs reales del HTML, orden real de scripts y que `Guardar cambios` y `Voy por mi hijo` tengan exactamente un propietario.
- El monolito `app.js` fue retirado de la rama; el recorrido vive exclusivamente en `features/journey.js`.

## Deuda aún deliberadamente conservada

La cascada visual de 0.1.9 sigue dividida en `foundation.css` y `application.css` para no cambiar apariencia al mismo tiempo que la arquitectura. Todavía contienen reglas superpuestas; la siguiente fase es consolidarlas en una cascada única y predecible, manteniendo exactamente la apariencia validada en dispositivo.

`features/journey.js` aún concentra máquina de estados, polling, telemetría y render de Recorrido. Esa concentración es aceptable mientras cada responsabilidad externa (GPS, configuración, shell) permanezca fuera del controlador.
