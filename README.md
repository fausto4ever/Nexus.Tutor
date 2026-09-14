# Nexus.Tutor

Nexus.Tutor es el laboratorio móvil del tutor para probar cercanía y el flujo «Voy por mi hijo» antes de conectarlo al Gateway de Control de Acceso.

## Flujo actual

1. Configurar uno o más destinos de prueba y elegir el destino activo.
2. Obtener una medición válida por GPS/ruta o activar el simulador manual.
3. Elegir el método de distancia: línea recta mediante GPS/Haversine o ruta en automóvil mediante OSRM para laboratorio.
4. Con destino configurado y una medición fresca válida se habilita **VOY POR MI HIJO**, sin límite de kilometraje.
5. Fuera del radio comienza en OUTSIDE; al acercarse avanza de forma monotónica a WAITING, READY y AT_GATE.
6. OUTSIDE usa halo rojo y avisa que todavía se encuentra lejos; WAITING naranja; READY azul; AT_GATE verde.
7. AT_GATE muestra **Has llegado. Esperando la entrega del alumno.**
8. COMPLETED queda reservado para la futura confirmación de Nexus.Access/Gateway y muestra **Solicitud completada. ¡Que tengas un excelente día! Que les vaya muy bien.**
9. El polling se adapta por cercanía: OUTSIDE 60 s, WAITING 30 s, READY 10 s y AT_GATE 10 s.

## Interfaz 0.1.8

La aplicación conserva cuatro pestañas como estructura oficial:

- **Recorrido**: geolocalización, distancia, estados, simulador y telemetría.
- **Mi QR**: reservada para la futura credencial QR real del tutor. No genera identificadores ficticios.
- **Avisos**: reservada para notificaciones push de entrada/salida del alumno y mensajes operativos de la escuela.
- **QR temporal**: preparada para autorizaciones temporales de 1 día, 1 semana o 1 mes; la generación real permanece deshabilitada hasta definir su lógica y seguridad.

La interfaz admite **modo claro y modo oscuro**. Si el usuario todavía no eligió uno, se respeta `prefers-color-scheme`; después se conserva la selección localmente. La pestaña activa también se recuerda en el dispositivo.

## Destinos de prueba

La configuración conserva varios destinos sin sobrescribir el principal.

- **Añadir destino** abre un borrador limpio.
- El botón inferior cambia a **Guardar nuevo destino** y permanece visible al desplazar la configuración.
- **Cancelar nuevo destino** restaura el destino anterior sin guardar el borrador.
- Durante un trayecto activo se bloquea cambiar o editar el destino.
- Los cambios quedan identificados en la telemetría JSON mediante `destinationId` y `destinationName`.

## Escala de distancia

La barra horizontal representa linealmente el rango operativo: WAITING es el límite máximo y 0 m representa 100%.

Con `WAITING=1000`, `READY=100`, `AT_GATE=20`:

- 1500 m o más: 0%.
- 1000 m: 0%.
- 500 m: 50%.
- 300 m: 70%.
- 100 m: 90%.
- 20 m: 98%.
- 0 m: 100%.

READY y AT_GATE conservan su posición matemática, pero sus etiquetas se separan visualmente y apuntan a la posición exacta para evitar superposición.

## GPS al volver a la app

Al volver del segundo plano:

- se conserva visible la última distancia válida;
- se muestra **Recalculando ubicación…**;
- se solicita una lectura fresca con `maximumAge: 0`;
- una lectura stale/recalculating no puede iniciar ni promover estados;
- si falla GPS, se conserva la última distancia como **Última ubicación conocida**;
- el estado alcanzado no retrocede.

## Conectividad y telemetría

La interfaz muestra **En línea / Sin internet**. Es disponibilidad de red, no todavía un health check del Gateway.

La telemetría permanece local hasta que el usuario pulsa **Descargar JSON**. Registra recorrido, destino, distancia, precisión, fuente, frescura GPS, coordenadas cuando existen, visibilidad, conectividad, cambios de estado, polling y errores/recuperación GPS.

## Build de producción

El build minifica y ofusca JavaScript, minifica CSS/HTML, versiona recursos y no genera sourcemaps. El service worker usa una caché distinta por versión para evitar mezclar recursos anteriores.

## Versión 0.1.8

- Activación anticipada desde cualquier distancia con medición fresca.
- OUTSIDE → WAITING → READY → AT_GATE → COMPLETED.
- Halos y mensajes por estado.
- Conservación de última distancia y recálculo al volver a la app.
- Polling adaptativo 60/30/10 s.
- Barra lineal y marcadores proporcionales.
- Indicador de conexión.
- Telemetría JSON local.
- Múltiples destinos y flujo explícito de guardar/cancelar.
- Selector Light/Dark persistente.
- Navegación inferior con Recorrido, Mi QR, Avisos y QR temporal.
- QR temporal preparado para 1 día / 1 semana / 1 mes, sin generación ficticia.
- Pruebas automatizadas para lógica, destinos e interfaz.
