# Nexus.Tutor

Nexus.Tutor es la PWA del tutor para el flujo de recogida y seguimiento de llegada del proyecto Control de Acceso.

## Estado actual

La versión de trabajo es `0.1.9` y mantiene cuatro pestañas:

1. Recorrido
2. Mi QR
3. Avisos
4. QR temporal

Las tres últimas siguen preparadas como funciones futuras; el flujo funcional actual está concentrado en Recorrido y Configuración.

## Arquitectura

- `config.js`: valores por defecto y migración inicial.
- `core/runtime.js`: storage, eventos internos y utilidades DOM.
- `services/location.js`: única frontera con `navigator.geolocation`.
- `features/destinations.js`: destinos y configuración.
- `features/journey.js`: coordinación del recorrido, mediciones, estados, historial y telemetría.
- `ui/shell.js`: navegación y tema.
- `css/nexus-tutor.css`: único stylesheet fuente.

`app.js` ya no participa en el arranque.

## Recorrido

La máquina de estados es monotónica:

`OUTSIDE → WAITING → READY → AT_GATE → COMPLETED`

El usuario puede iniciar el recorrido desde cualquier distancia siempre que exista un destino válido y una medición utilizable y fresca.

Una vez alcanzado un estado, una medición posterior más lejana no lo degrada.

`COMPLETED` no se determina por GPS. Queda reservado para la confirmación futura de Nexus.Access/Gateway mediante el hook:

`window.NEXUS_TUTOR_COMPLETE_JOURNEY`

## Distancia

Modo directo:

- Haversine entre posición actual y destino.

Modo ruta:

- OSRM para laboratorio;
- timeout de red;
- fallback automático a Haversine.

El polling cambia según el estado y evita ejecutar dos mediciones periódicas al mismo tiempo.

## Destinos

Se pueden conservar varios destinos de prueba.

Seleccionar un destino guardado lo activa inmediatamente y publica `config:changed`, por lo que la distancia se recalcula sin exigir Guardar.

Durante un recorrido activo la configuración puede consultarse, pero sus controles editables quedan bloqueados.

## CSS

La interfaz fue reconstruida desde cero sobre una única hoja:

`css/nexus-tutor.css`

La nueva base:

- no usa `!important`;
- no usa `transition: all`;
- soporta tema claro/oscuro;
- respeta `prefers-reduced-motion`;
- define `:focus-visible`;
- utiliza `color-scheme` para controles nativos;
- conserva layout móvil con ancho máximo de 500 px;
- contempla safe areas y `100dvh`.

No deben reaparecer los estilos legacy `foundation.css`, `application.css`, `styles.css` ni `ui.css`.

## Desarrollo

Instalar dependencias:

```bash
npm install
```

Ejecutar pruebas:

```bash
npm test
```

Generar producción:

```bash
npm run build
```

El build genera en `dist/` los JavaScript minificados/ofuscados y `nexus-tutor.min.css` sin sourcemaps.

## Política de trabajo

El desarrollo actual continúa en la rama existente:

`refactor/0.1.9-structure`

No crear ramas nuevas salvo instrucción explícita del usuario.

No mergear ni publicar en `main` sin autorización explícita.
