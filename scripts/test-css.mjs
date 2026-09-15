import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw new Error(message);}

const [html,css]=await Promise.all([
  fs.readFile(new URL('../index.html',import.meta.url),'utf8'),
  fs.readFile(new URL('../css/nexus-tutor.css',import.meta.url),'utf8')
]);

const localStyles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+\.css)["'][^>]*>/gi)]
  .map(match=>match[1])
  .filter(href=>!/^https?:\/\//i.test(href));

assert(localStyles.length===1&&localStyles[0]==='css/nexus-tutor.css','La app debe conservar únicamente css/nexus-tutor.css como stylesheet local');
assert(css.trim()==='','css/nexus-tutor.css debe permanecer vacío hasta reconstruir el diseño desde cero');
assert(!html.includes('foundation.css')&&!html.includes('application.css')&&!html.includes('styles.css')&&!html.includes('ui.css'),'No deben reaparecer CSS legacy');

console.log('CSS reset: archivo fuente vacío y sin referencias legacy.');
