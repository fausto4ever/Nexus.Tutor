import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw new Error(message);}

const [html,css]=await Promise.all([
  fs.readFile(new URL('../index.html',import.meta.url),'utf8'),
  fs.readFile(new URL('../css/nexus-tutor.css',import.meta.url),'utf8')
]);

const localStyles=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+\.css)["'][^>]*>/gi)]
  .map(match=>match[1])
  .filter(href=>!/^https?:\/\//i.test(href));
const importantCount=(css.match(/!important/g)||[]).length;
const blocks=[...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(match=>match[1].trim());
const selectorCounts=new Map();
for(const selectorGroup of blocks){
  if(selectorGroup.startsWith('@'))continue;
  for(const selector of selectorGroup.split(',').map(value=>value.trim()).filter(Boolean)){
    selectorCounts.set(selector,(selectorCounts.get(selector)||0)+1);
  }
}
const duplicates=[...selectorCounts.entries()].filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]);

console.log(`CSS audit: ${importantCount} !important; ${duplicates.length} selectores repetidos.`);
console.log('Duplicados principales:',duplicates.slice(0,12).map(([selector,count])=>`${selector}×${count}`).join(', ')||'ninguno');

assert(localStyles.length===1&&localStyles[0]==='css/nexus-tutor.css','La app debe cargar un único stylesheet local');
assert(!html.includes('foundation.css')&&!html.includes('application.css'),'No deben reaparecer los CSS legacy');
assert(importantCount<=156,'La deuda de !important aumentó sobre la línea base validada (156)');
assert(duplicates.length<=61,'Los selectores repetidos aumentaron sobre la línea base optimizada (61)');
