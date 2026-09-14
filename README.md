# Nexus.Tutor

Nexus.Tutor es el laboratorio móvil del tutor para probar cercanía y el flujo «Voy por mi hijo» antes de conectarlo al Gateway de Control de Acceso.

## Flujo actual

1. Configurar uno o más destinos de prueba y elegir el destino activo.
2. Obtener una medición válida por GPS/ruta o activar el simulador manual.
3. Elegir el método de distancia:
   - Línea recta mediante GPS/Haversine.
   - Ruta en automóvil mediante el servidor público de OSRM, solo para laboratorio.
4. Con destino configurado y una distancia válida se habilita **VOY POR MI HIJO**, sin límite de kilometraje.
5. Al pulsarlo fuera del radio comienza una prueba local en OUTSIDE; al entrar al rango operativo avanza a WAITING. Dentro del rango comienza en WAITING y evalúa READY/AT_GATE.
6. Nexus.Tutor adapta la frecuencia de medición conforme se acerca: OUTSIDE 60 s, WAITING 30 s, READY 10 s y AT_GATE mantiene 10 s.
7. La progresión es monotónica: `OUTSIDE -> WAITING -> READY -> AT_GATE -> COMPLETED`. El GPS no hace retroceder el estado si una lectura posterior fluctúa.
8. OUTSIDE muestra **Aún te encuentras muy lejos del destino. Tu trayecto ya está activo; te avisaremos cuando estés cerca.**
9. WAITING muestra **Ya estás dentro del rango de espera. Seguimos tu llegada.**
10. READY muestra **Ya estás muy cerca del destino. Prepárate para la entrega.**
11. AT_GATE muestra **Has llegado. Esperando la entrega del alumno.**
12. COMPLETED queda preparado para la futura confirmación de Nexus.Access/Gateway y muestra **Solicitud completada. ¡Que tengas un excelente día! Que les vaya muy bien.**
13. Se conserva un historial local de los cambios de estado y de cada medición periódica.

## Destinos de prueba

La configuración conserva una lista de destinos. El destino original se migra automáticamente como `primary` y puede añadirse un segundo destino —o más— sin borrar el anterior.

- El destino guardado se selecciona desde **Configuración**.
- **Añadir destino** abre un borrador limpio y el botón fijo de la parte inferior cambia a **Guardar nuevo destino**.
- Mientras se crea un destino aparece **Cancelar nuevo destino**, que restaura el destino activo sin guardar el borrador.
- La barra de acciones permanece visible al desplazarse dentro de Configuración para evitar que el usuario pierda el botón Guardar.
- Al guardar un destino distinto, pasa a ser el destino activo y la distancia se recalcula contra sus coordenadas.
- La distancia previa se invalida al cambiar de destino para evitar mostrar un metraje correspondiente a otro punto.
- Durante un trayecto activo se bloquea cambiar o editar el destino para evitar modificar el objetivo a mitad del recorrido.
- Cada cambio de destino queda identificado en telemetría con `destinationId` / `destinationName`, lo que permite segmentar el recorrido por destino.

## Privacidad del laboratorio

La prueba funciona localmente en el navegador. Todavía no envía solicitudes de entrega al colegio ni al Gateway.

La telemetría de diagnóstico se conserva en el dispositivo y sólo se exporta cuando el usuario pulsa **Descargar JSON**. El JSON puede incluir coordenadas, precisión, distancia, conectividad, visibilidad de la app, destino activo y eventos GPS para reconstruir una prueba real.

## Estados de cercanía

- **OUTSIDE**: trayecto iniciado fuera del rango operativo; halo rojo y aviso de que todavía se encuentra lejos.
- **WAITING**: dentro del rango WAITING configurado; halo naranja.
- **READY**: dentro del rango READY; halo azul.
- **AT_GATE**: punto de recogida alcanzado; halo verde y espera de la entrega.
- **COMPLETED**: entrega confirmada por la escuela; muestra solicitud completada y finaliza el seguimiento de proximidad.

La progresión de estado es monotónica durante un trayecto activo. La distancia visible, en cambio, siempre representa la medición real o la última conocida.

## Escala de distancia

La barra horizontal es una representación lineal del rango operativo completo: WAITING es el límite máximo y 0 m es el 100% del recorrido visual.

Con los valores por defecto (`WAITING=1000`, `READY=100`, `AT_GATE=20`):

- 1500 m o más: 0% (fuera de la escala operativa).
- 1000 m: 0%.
- 500 m: 50%.
- 300 m: 70%.
- 100 m: 90%.
- 20 m: 98%.
- 0 m: 100%.

Los marcadores WAITING, READY y AT_GATE se colocan matemáticamente sobre esa misma escala. READY y AT_GATE se muestran en renglones distintos y cada etiqueta apunta mediante una guía a su posición exacta para evitar superposición visual.

## GPS al volver a la app

Al pasar la app a segundo plano se detienen los temporizadores periódicos. Al volver:

- se conserva visible la última distancia válida;
- se marca como **Recalculando ubicación…**;
- se solicita una lectura GPS fresca con `maximumAge: 0`;
- una lectura antigua no puede iniciar un nuevo trayecto ni promover estados;
- si falla el GPS, se conserva la última distancia visible como **Última ubicación conocida** y el estado ya alcanzado no retrocede;
- al recuperarse el GPS se recalcula inmediatamente.

## Conectividad

La interfaz muestra un indicador **En línea / Sin internet** mediante los eventos de conectividad del navegador. Este indicador describe disponibilidad de red; no equivale todavía a una comprobación de salud del Gateway.

## Telemetría JSON

Nexus.Tutor mantiene una bitácora local de diagnóstico con hasta 1000 eventos. Entre otros registra:

- inicio, reinicio y finalización del trayecto;
- cambios de destino con `destinationId` / `destinationName`;
- cambios OUTSIDE/WAITING/READY/AT_GATE/COMPLETED;
- distancia, precisión, fuente y estado de frescura de la medición;
- coordenadas cuando están disponibles;
- APP_HIDDEN / APP_RESUME;
- GPS_RECALCULATING / errores / recuperación;
- cambios de conectividad;
- cambios de frecuencia de polling.

La descarga se genera como `nexus-tutor-telemetry-<fecha>.json`.

## Build de producción

El build de producción versiona los assets, minifica y ofusca JavaScript, minifica CSS/HTML y no genera sourcemaps. El workflow ejecuta pruebas, build y validación de `dist` antes de integrar.

Incluye manifest y service worker. La geolocalización del navegador requiere contexto seguro (HTTPS o localhost).

- La distancia directa se calcula localmente mediante Haversine. El navegador obtiene la ubicación del dispositivo, cuya disponibilidad offline depende del dispositivo y su proveedor de ubicación.
- La ruta en auto envía las coordenadas actuales y del destino a OSRM por internet; si falla, se usa distancia directa. No se guarda la ruta ni se envía información al Gateway.
- Volver a la app no reconstruye posiciones del tiempo que estuvo suspendida.

## Versión 0.1.7

- Activación anticipada desde cualquier distancia.
- Halos OUTSIDE rojo, WAITING naranja, READY azul y AT_GATE verde.
- Mensajes progresivos de llegada y cierre de solicitud completada.
- Progresión monotónica y restauración de estado.
- Conservación de última distancia durante recálculo/pérdida de GPS.
- Polling adaptativo 60/30/10 s.
- Escala lineal de proximidad con marcadores proporcionales separados visualmente.
- Indicador de conexión a internet.
- AT_GATE como espera de entrega y soporte preparado para COMPLETED.
- Telemetría local descargable en JSON.
- Múltiples destinos de prueba sin sobrescribir el destino principal.
- Guardado de destino visible y persistente con opción de cancelar borrador.
- Caché del service worker renovada para evitar mezclar recursos de 0.1.6.
- 77 comprobaciones automatizadas de lógica, GPS, DOM, persistencia, polling, conectividad, escala, telemetría y destinos.