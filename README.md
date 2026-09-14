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
8. Se conserva un historial local de los cambios de estado y las distancias observadas.

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
