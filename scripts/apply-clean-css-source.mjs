import fs from 'node:fs/promises';
import CleanCSS from 'clean-css';

const url=new URL('../css/nexus-tutor.css',import.meta.url);
const marker='/* Nexus.Tutor 0.1.9 - clean-css source v1 */';
const css=await fs.readFile(url,'utf8');
if(css.startsWith(marker)){
  console.log('CSS source ya optimizado; sin cambios.');
  process.exit(0);
}
const result=new CleanCSS({level:2,sourceMap:false,format:'beautify'}).minify(css);
if(result.errors.length)throw new Error(result.errors.join('\n'));
await fs.writeFile(url,`${marker}\n${result.styles}\n`,'utf8');
console.log(`CSS fuente optimizado: ${css.length} -> ${result.styles.length} caracteres.`);
