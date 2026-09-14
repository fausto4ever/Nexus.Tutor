# Nexus.Tutor

PWA de laboratorio para probar físicamente la lógica de distancia de recogida antes de conectarla al Gateway.

## Versión inicial 0.1.0

La aplicación funciona completamente en el navegador y **no escribe nada en Control de Acceso Gateway**.

### Flujo

1. Fijar la ubicación de la escuela desde Configuración. Puede introducirse latitud/longitud manualmente o utilizar la posición GPS actual como punto fijo.
2. Configurar los tres umbrales locales:
   - WAITING
   - READY
   - AT GATE
3. Elegir el método de distancia:
   - Línea recta mediante GPS/Haversine.
   - Ruta en automóvil mediante el servidor público de OSRM, solo para laboratorio.
4. Al entrar al radio WAITING se habilita el botón circular **VOY POR MI HIJO**.
5. Al pulsarlo se inicia una prueba local en estado WAITING.
6. Nexus.Tutor vuelve a medir cada 30 segundos.
7. La progresión es monotónica: `WAITING -> READY -> AT_GATE`. El GPS no hace retroceder el estado si una lectura posterior fluctúa.
8. Se conserva un historial local de los cambios de estado y de cada medición periódica, aunque el estado o la distancia no cambien.

## Privacidad del laboratorio

- No se guarda una ruta histórica.
- No se envían coordenadas ni estados al Gateway.
- Configuración, prueba actual e historial se almacenan en `localStorage` del dispositivo.
- La ubicación GPS se utiliza en el navegador para calcular distancia.

## Distancia por ruta

El modo de ruta en auto usa `router.project-osrm.org` como servicio de prueba. No debe considerarse infraestructura de producción. Si la consulta falla, la PWA vuelve automáticamente a distancia directa y lo indica en pantalla.

Para producción se deberá elegir un proveedor y arquitectura definitivos. Google Routes requiere credenciales/facturación y una API key no debe quedar expuesta sin control en un repositorio público. Waze pertenece a Google, pero no ofrece un endpoint público general equivalente pensado para calcular libremente distancia de ruta desde una PWA.

## PWA

Incluye manifest y service worker. La geolocalización del navegador requiere contexto seguro (`https://` o localhost). Para las pruebas físicas debe publicarse el repositorio en un origen HTTPS, por ejemplo GitHub Pages o Cloudflare Pages.

## Pendiente después de las pruebas

- Fijar coordenadas definitivas de la escuela.
- Ajustar umbrales a partir de las mediciones reales.
- Comparar distancia directa contra distancia por ruta.
- Evaluar fluctuación/precisión GPS junto con cada lectura.
- Decidir proveedor de ruteo para producción, si realmente aporta valor frente a distancia directa.
- Conectar posteriormente Nexus.Tutor con Gateway para crear solicitudes reales y recibir estados canonicos.

## Corrección 0.1.3: historial periódico

- Durante una prueba activa, cada ciclo de 30 segundos agrega una medición al historial con hora, estado, distancia y método usado, también en el simulador manual.
- Los cambios de estado siguen registrándose inmediatamente como eventos separados. El registro periódico continúa en AT_GATE hasta reiniciar la prueba.
- Si no se puede medir, el ciclo registra “Medición periódica no disponible”, sin reutilizar una distancia anterior como si fuera nueva.
- Reiniciar detiene el registro periódico. Se descartan las mediciones pendientes de una prueba anterior.
- Se conserva el límite existente de los últimos 60 eventos en localStorage.
- La prueba debe mantenerse abierta en primer plano; no se reconstruyen mediciones de intervalos suspendidos por el navegador.
- CSS y JavaScript permanecen en archivos externos cargados mediante link y script src.

## Versionado de producción

- package.json, config.js, la versión visible y la caché del service worker deben coincidir; el build falla si detecta diferencias.
- El build agrega la versión de package.json a las referencias externas de JS y CSS, por ejemplo app.min.js?v=0.1.3.
- El service worker precarga esas mismas URLs versionadas.
- Se mantiene el build minificado y ofuscado, sin sourcemaps ni JS/CSS inline.
- El workflow valida pruebas y build en pull requests; al publicar en main también actualiza dist/.

## Preparado 0.1.4: simulación con + y −

- El slider se sustituye por botones + y − y un campo editable de distancia en metros enteros.
- Cada pulsación cambia 10 m de forma predeterminada. Se puede elegir 1 m, 10 m, 100 m o 1 km.
- La distancia puede superar el umbral WAITING para simular una ruta alterna; no se permite una distancia negativa.
- Los cambios válidos se aplican al pulsar un botón o confirmar/salir del campo. No se evalúan números incompletos mientras se escribe.
- Durante una prueba activa el estado solo avanza: WAITING → READY → AT_GATE. Al cruzar un umbral se actualizan la vista y el historial inmediatamente.
- Aumentar la distancia conserva el estado alcanzado, incluso fuera de WAITING. Los registros periódicos siguen guardando cada 30 s el estado conservado y la distancia actual.
- Antes de iniciar una prueba, la vista muestra la proximidad actual y el botón solo se habilita dentro de WAITING. Reiniciar permite comenzar una prueba nueva.

## Preparado 0.1.5: recálculo al volver a la aplicación

- Al recuperar focus, volver a estar visible o restaurarse desde la caché de navegación, se recalcula sin esperar el siguiente intervalo.
- En modo GPS se pide una posición nueva con getCurrentPosition, alta precisión, maximumAge: 0 y timeout de 15 s. En modo manual se usa la distancia simulada.
- Se agrupan eventos de regreso próximos para evitar mediciones duplicadas; al ocultarse se pausa el temporizador local.
- Las pruebas activas registran “Medición al volver a la app”, además de cualquier avance de estado, y después reinician el ciclo de 30 s.
- Si falla la ubicación, se registra la falta de medición sin promover estados ni usar una distancia vieja. Se descartan respuestas de una prueba, modo o regreso anterior.
- La distancia directa se calcula localmente mediante Haversine. El navegador obtiene la ubicación del dispositivo, cuya disponibilidad offline depende del dispositivo y su proveedor de ubicación.
- La ruta en auto envía las coordenadas actuales y del destino a OSRM por internet; si falla, se usa distancia directa. No se guarda la ruta ni se envía información al Gateway.
- Volver a la app no reconstruye posiciones del tiempo que estuvo suspendida.
