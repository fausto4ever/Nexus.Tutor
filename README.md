# Nexus.Tutor

Nexus.Tutor es la PWA del tutor para el flujo de recogida y seguimiento de llegada del proyecto Control de Acceso.

## Estado actual

La versión de trabajo es `0.1.14` y mantiene cuatro pestañas:

1. Recorrido
2. Mi QR
3. Avisos
4. QR temporal

Las tres últimas siguen preparadas como funciones futuras; el flujo funcional actual está concentrado en Recorrido, Configuración y el laboratorio de solicitudes de recogida.

## Arquitectura

- `config.js`: valores por defecto y migración inicial.
- `core/runtime.js`: storage, eventos internos y utilidades DOM.
- `services/location.js`: única frontera con `navigator.geolocation`.
- `services/distance.js`: Haversine, ruta de laboratorio y fallback.
- `services/telemetry.js`: historial y telemetría local.
- `features/destinations.js`: destinos y configuración.
- `features/journey.js`: coordinación del recorrido, mediciones y estados.
- `features/lab-pickup-modes.js`: laboratorio de solicitudes y frontera placeholder con Gateway.
- `ui/journey-view.js`: presentación del recorrido.
- `ui/shell.js`: navegación y tema.
- `css/nexus-tutor.css`: único stylesheet fuente.

`app.js` ya no participa en el arranque.

## Recorrido

La máquina de estados es monotónica:

`OUTSIDE → WAITING → READY → AT_GATE → COMPLETED`

El usuario puede iniciar el recorrido desde cualquier distancia siempre que exista un destino válido y una medición utilizable y fresca. Una vez alcanzado un estado, una medición posterior más lejana no lo degrada.

`COMPLETED` no se determina por GPS. Queda reservado para confirmación de Nexus.Access/Gateway mediante el hook `window.NEXUS_TUTOR_COMPLETE_JOURNEY`.

## Laboratorio de solicitudes

Las tres modalidades crean primero una solicitud `REQUESTED`:

- `1001 / NO_GPS`: solicitud sin ubicación ni ETA; permanece `REQUESTED` hasta una acción externa.
- `1002 / ETA_ONCE`: una lectura inicial permite calcular ETA; puede evolucionar estimativamente a `WAITING` y `READY`, pero no a `AT_GATE` sólo por tiempo.
- `1003 / GPS_ALL`: seguimiento continuo; puede evolucionar `REQUESTED → WAITING → READY → AT_GATE` según distancia.

Umbrales actuales de laboratorio: `WAITING=1000 m`, `READY=100 m`, `AT_GATE=20 m`.

Los tres modos permiten `Cancelar solicitud`. Cancelar no genera una salida del alumno.

## Contrato requerido a Gateway

La implementación de Tutor mantiene por ahora llamadas placeholder. El Gateway deberá exponer estos cuatro contratos mínimos. Las rutas son el contrato propuesto para coordinar ambos repositorios y pueden ajustarse en Gateway manteniendo la misma semántica.

### 1. Crear solicitud

`POST /api/requests`

Payload mínimo:

```json
{
  "studentId": "1001",
  "mode": "NO_GPS"
}
```

`mode` admite `NO_GPS`, `ETA_ONCE` o `GPS_ALL`.

Para `ETA_ONCE`, Tutor agrega el ETA calculado al iniciar:

```json
{
  "studentId": "1002",
  "mode": "ETA_ONCE",
  "etaMinutes": 20
}
```

Respuesta mínima:

```json
{
  "ok": true,
  "requestId": "REQ-...",
  "status": "REQUESTED"
}
```

La creación debe ser idempotente frente a una solicitud activa del mismo alumno. Si ya existe, Gateway debe devolver/reutilizar la solicitud existente en vez de crear otra:

```json
{
  "ok": true,
  "existing": true,
  "requestId": "REQ-...",
  "status": "REQUESTED"
}
```

Tutor conserva localmente `requestId` para las llamadas posteriores.

### 2. Actualizar estado/proximidad

`POST /api/requests/status`

Payload:

```json
{
  "requestId": "REQ-...",
  "status": "WAITING",
  "distanceMeters": 850
}
```

Tutor puede reportar `WAITING`, `READY` o `AT_GATE`. `distanceMeters` es evidencia opcional y especialmente útil para `GPS_ALL`.

Tutor calcula localmente geobarda/Haversine. No es requisito enviar latitud/longitud ni almacenar la ruta en Gateway.

Gateway debe conservar estados monotónicos y responder con el estado autoritativo de la solicitud.

### 3. Cancelar solicitud

`POST /api/requests/cancel`

```json
{
  "requestId": "REQ-..."
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "requestId": "REQ-...",
  "status": "CANCELLED"
}
```

Si la solicitud ya está `COMPLETED`, ese estado prevalece y Gateway no debe convertirla a `CANCELLED`. Tutor debe adoptar el estado autoritativo recibido.

### 4. Recuperar solicitud activa

`GET /api/requests/active?studentId=1001`

Respuesta esperada cuando existe:

```json
{
  "ok": true,
  "request": {
    "requestId": "REQ-...",
    "studentId": "1001",
    "status": "REQUESTED"
  }
}
```

Esta llamada permite recuperar una solicitud después de pérdida de Internet, cierre de la PWA o pérdida de la respuesta del POST inicial. Recuperar conexión debe continuar sobre la solicitud existente, no crear otra por defecto.

### Reglas del contrato Tutor ↔ Gateway

- Una solicitud confirmada por Gateway sobrevive a la pérdida de GPS/Internet de Tutor.
- Silencio del cliente no significa cancelación.
- Gateway es autoritativo sobre el estado remoto.
- Tutor nunca degrada un estado confirmado por falta de comunicación.
- `AT_GATE` requiere evidencia de presencia; `ETA_ONCE` no llega automáticamente a `AT_GATE`.
- El GPS no es requisito para crear una solicitud.
- Tutor no necesita enviar la ruta ni coordenadas históricas al Gateway.
- `CANCELLED` no crea evento de salida.
- `COMPLETED` prevalece frente a una cancelación tardía.

La caducidad de solicitudes antiguas, el cierre desde Nexus.Access y los procesos de conciliación/sincronización son responsabilidades adicionales de Gateway y se documentan aparte; no forman parte de estos cuatro contratos mínimos requeridos por Tutor.

## Distancia

Modo directo: Haversine entre posición actual y destino.

Modo ruta: OSRM para laboratorio, timeout de red y fallback automático a Haversine.

El polling cambia según el estado y evita ejecutar dos mediciones periódicas al mismo tiempo.

## Destinos

Se pueden conservar varios destinos de prueba. Seleccionar un destino guardado lo activa inmediatamente y publica `config:changed`, por lo que la distancia se recalcula sin exigir Guardar. Durante un recorrido activo la configuración puede consultarse, pero sus controles editables quedan bloqueados.

## CSS

La interfaz utiliza una única hoja fuente: `css/nexus-tutor.css`. No deben reaparecer los estilos legacy `foundation.css`, `application.css`, `styles.css` ni `ui.css`.

La base visual soporta tema claro/oscuro, `prefers-reduced-motion`, `:focus-visible`, safe areas, `100dvh` y layout móvil con ancho máximo de 500 px.

## Desarrollo

```bash
npm install
npm test
npm run build
```

El build genera en `dist/` los JavaScript minificados/ofuscados y `nexus-tutor.min.css` sin sourcemaps. `config.js`, `package.json` y la versión de caché del Service Worker deben mantenerse sincronizados.

## Política de trabajo

El desarrollo actual continúa exclusivamente en `refactor/0.1.9-structure` hasta nueva instrucción.

No crear ramas nuevas salvo instrucción explícita del usuario. No mergear, revertir, publicar ni escribir en `main` sin autorización explícita.
