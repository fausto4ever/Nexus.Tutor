import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw new Error(message);}
const [html,ui,css,sw,pkg]=await Promise.all([
  fs.readFile(new URL('../index.html',import.meta.url),'utf8'),
  fs.readFile(new URL('../ui.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../ui.css',import.meta.url),'utf8'),
  fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../package.json',import.meta.url),'utf8')
]);
const checks=[];
const ok=(condition,name)=>{assert(condition,name);checks.push(name);};

ok(html.includes('CONTROL DE ACCESO · v0.1.8'),'Versión visible 0.1.8');
ok(html.includes('href="ui.css"')&&html.includes('src="ui.js"'),'Recursos UI cargados');
ok(['tab-tracking','tab-qr','tab-notifications','tab-temp-qr'].every(id=>html.includes(`id="${id}"`)),'Cuatro pestañas presentes');
ok(['Recorrido','Mi QR','Avisos','QR temporal'].every(label=>html.includes(`<span>${label}</span>`)),'Navegación inferior completa');
ok(html.includes('<option value="day">1 día</option>')&&html.includes('<option value="week">1 semana</option>')&&html.includes('<option value="month">1 mes</option>'),'Vigencias QR temporal preparadas');
ok(html.includes('Generar QR temporal · próximamente')&&html.includes('disabled>Generar QR temporal'),'QR temporal permanece deshabilitado');
ok(ui.includes("const THEME_KEY='nexusTutorThemeV1'")&&ui.includes("prefers-color-scheme: dark")&&ui.includes('localStorage.setItem(THEME_KEY,next)'),'Tema persistente y preferencia del sistema');
ok(ui.includes("const TAB_KEY='nexusTutorTabV1'")&&ui.includes('localStorage.setItem(TAB_KEY,next)'),'Pestaña activa persistente');
ok(css.includes('html[data-theme="dark"]')&&css.includes('.bottom-nav')&&css.includes('.future-card'),'Estilos dark y navegación definidos');
ok(sw.includes("'./ui.css'")&&sw.includes("'./ui.js'")&&sw.includes("nexus-tutor-0.1.8"),'Service worker incluye UI 0.1.8');
ok(JSON.parse(pkg).version==='0.1.8','Package version 0.1.8');
ok(!html.includes('TUTOR-AUTH-ID-')&&!html.includes('TEMP-PASS:'),'Sin QR ficticios incrustados');

console.log(`UI: ${checks.length} comprobaciones correctas.`);
