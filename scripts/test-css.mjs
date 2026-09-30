import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw new Error(message);}

const cssDir=new URL('../css/',import.meta.url);
const [html,css,cssFiles]=await Promise.all([
  fs.readFile(new URL('../index.html',import.meta.url),'utf8'),
  fs.readFile(new URL('../css/nexus-tutor.css',import.meta.url),'utf8'),
  fs.readdir(cssDir)
]);

const localStyles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+\.css)["'][^>]*>/gi)]
  .map(match=>match[1])
  .filter(href=>!/^https?:\/\//i.test(href));
const sourceCss=cssFiles.filter(name=>name.endsWith('.css')).sort();
const importantCount=(css.match(/!important/g)||[]).length;

console.log(`CSS audit: ${importantCount} !important; ${sourceCss.length} stylesheet fuente.`);

assert(localStyles.length===1&&localStyles[0]==='css/nexus-tutor.css','La app debe cargar un único stylesheet local');
assert(sourceCss.length===1&&sourceCss[0]==='nexus-tutor.css','Solo debe existir css/nexus-tutor.css como stylesheet fuente');
assert(css.trim().length>0,'La nueva base CSS no puede quedar vacía');
assert(importantCount===0,'La nueva base CSS no debe introducir !important');
assert(!/transition\s*:\s*all\b/i.test(css),'No se permite transition: all en la nueva base');
assert(css.includes('@media (prefers-reduced-motion: reduce)'),'La interfaz debe respetar reduced motion');
assert(css.includes(':focus-visible'),'La interfaz debe definir foco visible');
assert(css.includes('color-scheme: light')&&css.includes('color-scheme: dark'),'Los controles nativos deben acompañar ambos temas');
assert(!html.includes('foundation.css')&&!html.includes('application.css')&&!html.includes('styles.css')&&!html.includes('ui.css'),'No deben reaparecer CSS legacy');
