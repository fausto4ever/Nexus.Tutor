import fs from 'node:fs/promises';
import vm from 'node:vm';

function assert(condition,message){if(!condition)throw new Error(message);}
const root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('index.html',root),'utf8');
const scriptOrder=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
const expected=['config.js','core/runtime.js','services/location.js','features/destinations.js','features/journey.js','ui/shell.js'];
assert(JSON.stringify(scriptOrder)===JSON.stringify(expected),`Orden de arranque inesperado: ${scriptOrder.join(' -> ')}`);

const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const navTabs=[...html.matchAll(/<button[^>]*class="[^"]*nav-btn[^"]*"[^>]*data-tab="([^"]+)"[^>]*>/g)].map(match=>match[1]);
const panelIds=[...html.matchAll(/<section\s+id="([^"]+)"\s+class="[^"]*tab-content[^"]*"/g)].map(match=>match[1]);
assert(navTabs.length===4&&panelIds.length===4,'La prueba de arranque espera exactamente cuatro pestañas');

function makeClassList(owner){
  const values=new Set(String(owner.className||'').split(/\s+/).filter(Boolean));
  const sync=()=>{owner.className=[...values].join(' ');};
  return{add(...items){items.forEach(item=>values.add(item));sync();},remove(...items){items.forEach(item=>values.delete(item));sync();},toggle(item,force){const next=force===undefined?!values.has(item):Boolean(force);if(next)values.add(item);else values.delete(item);sync();return next;},contains(item){return values.has(item);}};
}
function makeElement({id='',className='',dataset={}}={}){
  const listeners={};
  const el={id,className,dataset:{...dataset},value:'',disabled:false,checked:false,hidden:false,textContent:'',innerHTML:'',style:{},attributes:{},listeners,
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='tabindex')this.tabIndex=String(value);},getAttribute(name){return this.attributes[name]??null;},
    addEventListener(name,fn,options){(listeners[name]??=[]).push({fn,capture:options===true||options?.capture===true});},
    focus(){document.activeElement=this;},setSelectionRange(){},showModal(){this.open=true;},close(){this.open=false;},appendChild(){},remove(){},click(){}}
  el.classList=makeClassList(el);return el;
}

const elements=new Map([...ids].map(id=>[id,makeElement({id})]));
const navButtons=navTabs.map(tab=>makeElement({className:'nav-btn',dataset:{tab}}));
const tabPanels=panelIds.map(id=>{const el=elements.get(id)||makeElement({id});el.className='tab-content';el.classList=makeClassList(el);elements.set(id,el);return el;});
const meta=makeElement();
const documentListeners={};
const document={visibilityState:'visible',activeElement:null,documentElement:{dataset:{theme:'light'}},body:{appendChild(){}},querySelector(selector){if(selector.startsWith('#'))return elements.get(selector.slice(1))||null;if(selector==='meta[name="theme-color"]')return meta;return null;},querySelectorAll(selector){if(selector==='.nav-btn')return navButtons;if(selector==='.tab-content')return tabPanels;return[];},addEventListener(name,fn){documentListeners[name]=fn;},createElement(){return makeElement();}};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
let watchSuccess=null,watchError=null;
const navigator={onLine:true,geolocation:{watchPosition(success,error){watchSuccess=success;watchError=error;return 1;},clearWatch(){},getCurrentPosition(){}},serviceWorker:{register:async()=>({})}};
const windowListeners={};
const URLStub={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
const context={console:{log(){},warn(){},error(){}},document,navigator,localStorage,setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},fetch:async()=>({ok:false,status:503,json:async()=>({})}),Blob:globalThis.Blob,URL:URLStub,Date,Math,JSON,Number,String,Boolean,Array,Object,Set,Map,Promise,Error,matchMedia:()=>({matches:false}),addEventListener(name,fn){windowListeners[name]=fn;}};
context.window=context;context.globalThis=context;context.window.matchMedia=context.matchMedia;
vm.createContext(context);
for(const src of scriptOrder){
  const source=await fs.readFile(new URL(src,root),'utf8');
  try{new vm.Script(source,{filename:src}).runInContext(context);}catch(error){throw new Error(`ARRANQUE_FALLÓ en ${src}: ${error.stack||error}`);}
}
assert(context.NEXUS_TUTOR_DEFAULTS?.version==='0.1.9','config.js no inicializó la versión');
assert(context.NEXUS_TUTOR_RUNTIME,'runtime compartido no inicializó');
assert(context.NEXUS_TUTOR_LOCATION,'servicio de ubicación no inicializó');
assert(context.NEXUS_TUTOR_DESTINATIONS,'feature de destinos no inicializó');
assert(context.NEXUS_TUTOR_UI,'shell UI no inicializó');
assert(typeof context.NEXUS_TUTOR_COMPLETE_JOURNEY==='function','controlador del recorrido no inicializó');
assert(typeof watchSuccess==='function'&&typeof watchError==='function','journey.js no registró watchPosition');
assert(elements.get('pickupBtn')?.listeners?.click?.length===1,'Botón Voy por mi hijo no quedó enlazado exactamente una vez');
assert(elements.get('saveSettingsBtn')?.listeners?.click?.length===1&&!elements.get('saveSettingsBtn').listeners.click[0].capture,'Guardar cambios debe tener exactamente un propietario sin capture');
assert(elements.get('settingsBtn')?.listeners?.click?.length===1,'Configuración debe tener exactamente un propietario');
assert(navButtons.every(button=>button.listeners.click?.length===1),'Navegación inferior no quedó enlazada');
console.log(`Startup: ${scriptOrder.length} scripts cargados, ${ids.size} IDs reales, configuración y 4 pestañas enlazadas.`);
