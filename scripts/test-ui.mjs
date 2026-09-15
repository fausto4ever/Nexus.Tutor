import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw new Error(message);}
const [html,ui,css,sw,pkg,journey,distance,telemetry,journeyView]=await Promise.all([
  fs.readFile(new URL('../index.html',import.meta.url),'utf8'),
  fs.readFile(new URL('../ui/shell.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../css/nexus-tutor.css',import.meta.url),'utf8'),
  fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../package.json',import.meta.url),'utf8'),
  fs.readFile(new URL('../features/journey.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../services/distance.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../services/telemetry.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../ui/journey-view.js',import.meta.url),'utf8')
]);
const checks=[];
const ok=(condition,name)=>{assert(condition,name);checks.push(name);};

ok(html.includes('CONTROL DE ACCESO · v0.1.10'),'Versión visible 0.1.10');
const localStyles=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map(match=>match[1]).filter(href=>!href.startsWith('http'));
ok(localStyles.length===1&&localStyles[0]==='css/nexus-tutor.css','Un solo stylesheet local es dueño de la interfaz');
ok(css.trim().length>0,'Nueva base CSS cargada');
ok(!css.includes('!important'),'Nueva base CSS sin !important');
ok(css.includes('max-width: 500px')&&css.includes('width: 160px'),'Diseño móvil base de 500px y acción principal definida');
ok(css.includes('[data-theme="dark"]')&&css.includes('.bottom-nav')&&css.includes('.future-card'),'Tema oscuro y componentes principales definidos');
ok(css.includes('@media (prefers-reduced-motion: reduce)')&&css.includes(':focus-visible'),'Accesibilidad visual y movimiento reducido definidos');
ok(!html.includes('css/foundation.css')&&!html.includes('css/application.css')&&!html.includes('styles.css')&&!html.includes('ui.css'),'CSS legacy ya no participa en la interfaz');
ok(!sw.includes('foundation.css')&&!sw.includes('application.css')&&!sw.includes('styles.css')&&!sw.includes('ui.css'),'Service worker no conserva CSS legacy');
ok(html.includes('src="ui/shell.js"'),'Shell UI modular cargado');
ok(html.includes('src="core/runtime.js"')&&html.includes('src="services/location.js"')&&html.includes('src="services/distance.js"')&&html.includes('src="services/telemetry.js"')&&html.includes('src="features/destinations.js"')&&html.includes('src="ui/journey-view.js"')&&html.includes('src="features/journey.js"'),'Capas runtime, servicios, vista y features cargadas');
ok(!html.includes('src="app.js"'),'app.js monolítico ya no participa en el arranque');
ok(['tab-tracking','tab-qr','tab-notifications','tab-temp-qr'].every(id=>html.includes(`id="${id}"`)),'Cuatro pestañas presentes');
ok(['Recorrido','Mi QR','Avisos','QR temporal'].every(label=>html.includes(`<span>${label}</span>`)),'Navegación inferior completa');
ok(html.includes('id="connectionBadge"')&&html.indexOf('id="connectionBadge"')<html.indexOf('id="schoolLock"'),'Conectividad separada del estado del destino');
ok(html.includes('Reiniciar recorrido')&&!html.includes('id="resetJourneyBtn" class="secondary-btn hidden"'),'Control de reinicio visible en estructura');
ok(['<option value="day">1 día</option>','<option value="week">1 semana</option>','<option value="month">1 mes</option>'].every(value=>html.includes(value)),'Vigencias QR temporal preparadas');
ok(html.includes('Generar QR temporal · próximamente')&&html.includes('disabled>Generar QR temporal'),'QR temporal permanece deshabilitado');
ok(ui.includes("const THEME_KEY='nexusTutorThemeV1'")&&ui.includes("prefers-color-scheme: dark")&&ui.includes('localStorage.setItem(THEME_KEY,next)'),'Tema persistente y preferencia del sistema');
ok(ui.includes("addEventListener?.('change'")&&ui.includes('if(!storedTheme())'),'Tema del sistema se sigue mientras no exista preferencia manual');
ok(ui.includes("const TAB_KEY='nexusTutorTabV1'")&&ui.includes('localStorage.setItem(TAB_KEY,next)'),'Pestaña activa persistente');
ok(sw.includes("'./css/nexus-tutor.css'")&&sw.includes("'./services/distance.js'")&&sw.includes("'./services/telemetry.js'")&&sw.includes("'./ui/journey-view.js'")&&sw.includes("'./features/journey.js'")&&sw.includes("nexus-tutor-0.1.10"),'Service worker incluye módulos del recorrido');
ok(distance.includes('function haversine')&&distance.includes('router.project-osrm.org'),'Cálculo de distancia pertenece al servicio dedicado');
ok(telemetry.includes("const LOG_KEY='nexusTutorLogV1'")&&telemetry.includes('function record('),'Historial y telemetría pertenecen al servicio dedicado');
ok(journeyView.includes('function render(model)')&&journeyView.includes('function renderLog(items)'),'Render del recorrido pertenece a su vista');
ok(!journey.includes('function haversine')&&!journey.includes('router.project-osrm.org')&&!journey.includes('eventLog.innerHTML'),'Journey coordina sin reabsorber distancia ni render del historial');
ok(JSON.parse(pkg).version==='0.1.10','Package version 0.1.10');
ok(!html.includes('TUTOR-AUTH-ID-')&&!html.includes('TEMP-PASS:'),'Sin QR ficticios incrustados');

console.log(`UI: ${checks.length} comprobaciones correctas.`);