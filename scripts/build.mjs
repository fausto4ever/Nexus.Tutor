import fs from 'node:fs/promises';
import path from 'node:path';
import { minify as minifyJs } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';

const root=process.cwd();
const dist=path.join(root,'dist');
const JS_ASSETS=[
  ['config.js','config.min.js'],
  ['core/runtime.js','runtime.min.js'],
  ['services/location.js','location.min.js'],
  ['services/distance.js','distance.min.js'],
  ['services/telemetry.js','telemetry.min.js'],
  ['features/destinations.js','destinations.min.js'],
  ['ui/journey-view.js','journey-view.min.js'],
  ['features/journey.js','journey.min.js'],
  ['ui/shell.js','shell.min.js']
];
const CSS_ASSETS=[['css/nexus-tutor.css','nexus-tutor.min.css']];

await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});

const read=name=>fs.readFile(path.join(root,name),'utf8');
const write=(name,content)=>fs.writeFile(path.join(dist,name),content,'utf8');

const {version}=JSON.parse(await read('package.json'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Versión de producción inválida');
const configSource=await read('config.js');
if(!configSource.includes(`version:'${version}'`))throw new Error('La versión de config.js no coincide con package.json');

async function buildJs(input,output){
  const source=await read(input);
  const minified=await minifyJs(source,{compress:{passes:2,drop_console:false},mangle:true,format:{comments:false},sourceMap:false});
  if(!minified.code)throw new Error(`No se pudo minificar ${input}`);
  const obfuscated=JavaScriptObfuscator.obfuscate(minified.code,{
    compact:true,simplify:true,identifierNamesGenerator:'hexadecimal',renameGlobals:false,
    stringArray:true,stringArrayEncoding:['base64'],stringArrayThreshold:0.75,rotateStringArray:true,shuffleStringArray:true,
    splitStrings:true,splitStringsChunkLength:8,transformObjectKeys:false,controlFlowFlattening:false,deadCodeInjection:false,
    selfDefending:false,disableConsoleOutput:false,sourceMap:false
  }).getObfuscatedCode();
  await write(output,obfuscated);
}

async function buildCss(input,output){
  const css=await read(input);
  const result=new CleanCSS({level:2,sourceMap:false}).minify(css);
  if(result.errors.length)throw new Error(result.errors.join('\n'));
  await write(output,result.styles);
}

for(const [input,output] of JS_ASSETS)await buildJs(input,output);
for(const [input,output] of CSS_ASSETS)await buildCss(input,output);

let html=await read('index.html');
if(!html.includes(`CONTROL DE ACCESO · v${version}</div>`))throw new Error('La versión visible no coincide con package.json');
for(const [input,output] of [...CSS_ASSETS,...JS_ASSETS]){
  html=html.replaceAll(`href="${input}"`,`href="${output}"`).replaceAll(`src="${input}"`,`src="${output}"`);
}
html=html.replace(/((?:src|href)=")([^"]+\.(?:js|css))"/g,(_,prefix,asset)=>`${prefix}${asset}?v=${version}"`);
html=await minifyHtml(html,{collapseWhitespace:true,removeComments:true,removeRedundantAttributes:true,removeEmptyAttributes:true,minifyCSS:true,minifyJS:true,sortAttributes:false,sortClassName:false});
await write('index.html',html);

const swSource=await read('sw.js');
if(!swSource.includes(`nexus-tutor-${version}'`))throw new Error('La versión de caché no coincide con package.json');
let swProd=swSource;
for(const [input,output] of [...CSS_ASSETS,...JS_ASSETS])swProd=swProd.replaceAll(`'./${input}'`,`'./${output}'`);
swProd=swProd.replace(/'(\.\/[^']+\.(?:js|css))'/g,(_,asset)=>`'${asset}?v=${version}'`);
const swMinified=await minifyJs(swProd,{compress:{passes:2},mangle:true,format:{comments:false},sourceMap:false});
if(!swMinified.code)throw new Error('No se pudo minificar sw.js');
await write('sw.js',swMinified.code);

await fs.copyFile(path.join(root,'manifest.webmanifest'),path.join(dist,'manifest.webmanifest'));
await fs.copyFile(path.join(root,'icon.svg'),path.join(dist,'icon.svg'));

const files=await fs.readdir(dist);
if(files.some(name=>name.endsWith('.map')))throw new Error('El build contiene sourcemaps');
for(const [,output] of [...JS_ASSETS,...CSS_ASSETS]){
  const versioned=`${output}?v=${version}`;
  if(!files.includes(output))throw new Error(`Falta asset compilado: ${output}`);
  if(!html.includes(versioned)||!swProd.includes(versioned))throw new Error(`Referencia sin versión: ${output}`);
}
if(/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)||/<style\b/i.test(html))throw new Error('El HTML contiene JS/CSS inline');

console.log(`Nexus.Tutor ${version} production build generado en dist/`);
console.log(files.sort().join('\n'));
