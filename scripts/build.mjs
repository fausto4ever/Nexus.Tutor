import fs from 'node:fs/promises';
import path from 'node:path';
import { minify as minifyJs } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';

const root=process.cwd();
const dist=path.join(root,'dist');

await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});

const read=name=>fs.readFile(path.join(root,name),'utf8');
const write=(name,content)=>fs.writeFile(path.join(dist,name),content,'utf8');

async function buildJs(input,output){
  const source=await read(input);
  const minified=await minifyJs(source,{
    compress:{passes:2,drop_console:false},
    mangle:true,
    format:{comments:false},
    sourceMap:false
  });
  if(!minified.code)throw new Error(`No se pudo minificar ${input}`);
  const obfuscated=JavaScriptObfuscator.obfuscate(minified.code,{
    compact:true,
    simplify:true,
    identifierNamesGenerator:'hexadecimal',
    renameGlobals:false,
    stringArray:true,
    stringArrayEncoding:['base64'],
    stringArrayThreshold:0.75,
    rotateStringArray:true,
    shuffleStringArray:true,
    splitStrings:true,
    splitStringsChunkLength:8,
    transformObjectKeys:false,
    controlFlowFlattening:false,
    deadCodeInjection:false,
    selfDefending:false,
    disableConsoleOutput:false,
    sourceMap:false
  }).getObfuscatedCode();
  await write(output,obfuscated);
}

await buildJs('config.js','config.min.js');
await buildJs('app.js','app.min.js');

const css=await read('styles.css');
const cssOut=new CleanCSS({level:2,sourceMap:false}).minify(css);
if(cssOut.errors.length)throw new Error(cssOut.errors.join('\n'));
await write('styles.min.css',cssOut.styles);

let html=await read('index.html');
html=html
  .replace('href="styles.css"','href="styles.min.css"')
  .replace('src="config.js"','src="config.min.js"')
  .replace('src="app.js"','src="app.min.js"');
html=await minifyHtml(html,{
  collapseWhitespace:true,
  removeComments:true,
  removeRedundantAttributes:true,
  removeEmptyAttributes:true,
  minifyCSS:true,
  minifyJS:true,
  sortAttributes:false,
  sortClassName:false
});
await write('index.html',html);

const swSource=await read('sw.js');
const swProd=swSource
  .replace("'./styles.css'","'./styles.min.css'")
  .replace("'./config.js'","'./config.min.js'")
  .replace("'./app.js'","'./app.min.js'");
const swMinified=await minifyJs(swProd,{
  compress:{passes:2},
  mangle:true,
  format:{comments:false},
  sourceMap:false
});
if(!swMinified.code)throw new Error('No se pudo minificar sw.js');
await write('sw.js',swMinified.code);

await fs.copyFile(path.join(root,'manifest.webmanifest'),path.join(dist,'manifest.webmanifest'));
await fs.copyFile(path.join(root,'icon.svg'),path.join(dist,'icon.svg'));

const files=await fs.readdir(dist);
if(files.some(name=>name.endsWith('.map')))throw new Error('El build contiene sourcemaps');
if(files.some(name=>['app.js','config.js','styles.css'].includes(name)))throw new Error('El build contiene archivos fuente sin minificar');

console.log('Nexus.Tutor production build generado en dist/');
console.log(files.sort().join('\n'));
