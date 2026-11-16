import fs from 'node:fs/promises';

const NOW=1700000000000;
function assert(condition,message){if(!condition)throw new Error(message);}

function storedJourney(hoursAgo){
  return JSON.stringify({
    active:true,id:'journey-recovery',status:'WAITING',
    startedAt:new Date(NOW-hoursAgo*60*60*1000).toISOString(),
    lastCheckedAt:new Date(NOW-hoursAgo*60*60*1000+5*60*1000).toISOString(),
    lastDistance:500,lastSource:'direct',lastAccuracy:9
  });
}

function createHarness(sources,{hoursAgo=null}={}){
  const storage=new Map();
  if(hoursAgo!=null)storage.set('nexusTutorJourneyV1',storedJourney(hoursAgo));
  const elements=new Map(),windowListeners={},documentListeners={},gpsRequests=[];
  let watchSuccess=null,watchError=null,lastPosition=null;

  function element(selector){
    if(!elements.has(selector)){
      const attributes={};
      elements.set(selector,{
        value:'',disabled:false,checked:false,textContent:'',innerHTML:'',style:{},className:'',attributes,
        classList:{add(){},remove(){},toggle(){}},
        setAttribute(name,value){attributes[name]=String(value);this[name]=String(value);},
        addEventListener(){},focus(){}
      });
    }
    return elements.get(selector);
  }

  const document={
    visibilityState:'visible',activeElement:null,
    querySelector:selector=>element(selector),querySelectorAll:()=>[],
    addEventListener:(name,fn)=>{documentListeners[name]=fn;},
    body:{appendChild(){}},createElement:()=>({click(){},remove(){}})
  };
  const navigator={
    onLine:true,
    geolocation:{
      watchPosition(success,error){watchSuccess=success;watchError=error;return 1;},clearWatch(){},
      getCurrentPosition(success,error,options){gpsRequests.push({success,error,options});}
    },
    serviceWorker:{register:async()=>({})}
  };
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const eventBus=new Map();
  const runtime={
    storage:{read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}},write(key,value){localStorage.setItem(key,JSON.stringify(value));return value;},remove:key=>localStorage.removeItem(key)},
    events:{on(name,fn){const bucket=eventBus.get(name)||new Set();bucket.add(fn);eventBus.set(name,bucket);return()=>bucket.delete(fn);},emit(name,payload){for(const fn of eventBus.get(name)||[])fn(payload);}},
    dom:{one:selector=>element(selector),require:()=>true}
  };
  const remember=position=>(lastPosition=position,position);
  const location={
    supported:()=>true,current:()=>lastPosition,
    watch({onPosition,onError,options}={}){return navigator.geolocation.watchPosition(position=>onPosition?.(remember(position)),onError,options);},
    fresh(options={}){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>resolve(remember(position)),reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000,...options}));}
  };
  class TestDate extends Date{
    constructor(...args){super(...(args.length?args:[NOW]));}
    static now(){return NOW;}
  }
  const win={NEXUS_TUTOR_DEFAULTS:{version:'0.1.9',school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30},NEXUS_TUTOR_RUNTIME:runtime,NEXUS_TUTOR_LOCATION:location,addEventListener:(name,fn)=>{windowListeners[name]=fn;}};
  const URLStub={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
  const run=source=>new Function('window','document','navigator','localStorage','setInterval','clearInterval','setTimeout','clearTimeout','Date','console','fetch','Blob','URL',source)(
    win,document,navigator,localStorage,()=>1,()=>{},()=>1,()=>{},TestDate,{warn(){},error(){}},async()=>{throw new Error('route unavailable');},globalThis.Blob,URLStub
  );
  run(sources.distance);run(sources.telemetry);run(sources.view);run(sources.journey);
  return{
    storage,elements,gpsRequests,watchSuccess,watchError,
    journey:()=>JSON.parse(storage.get('nexusTutorJourneyV1')||'null'),
    telemetry:()=>JSON.parse(storage.get('nexusTutorTelemetryV1')||'[]'),
    element,
    async resolveFresh(lat=19,lng=-101.004,accuracy=6){
      const request=gpsRequests.shift();assert(request,'Se esperaba una lectura GPS fresca');
      request.success({coords:{latitude:lat,longitude:lng,accuracy}});
      await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    }
  };
}

const root=new URL('../',import.meta.url);
const sources={
  distance:await fs.readFile(new URL('services/distance.js',root),'utf8'),
  telemetry:await fs.readFile(new URL('services/telemetry.js',root),'utf8'),
  view:await fs.readFile(new URL('ui/journey-view.js',root),'utf8'),
  journey:await fs.readFile(new URL('features/journey.js',root),'utf8')
};

const recovered=createHarness(sources,{hoursAgo:2});
assert(recovered.journey().active===true,'Un recorrido activo menor a 12 horas debe recuperarse automáticamente');
assert(recovered.journey().status==='WAITING','La recuperación debe conservar el estado alcanzado');
assert(recovered.element('#distanceValue').textContent!=='—','La última distancia debe permanecer visible al recuperar');
assert(recovered.element('#gpsBadge').textContent.includes('Recalculando'),'La interfaz debe indicar Recalculando mientras conserva la lectura anterior');
assert(recovered.gpsRequests.length===1&&recovered.gpsRequests[0].options.maximumAge===0,'La recuperación debe pedir una lectura GPS fresca inmediatamente');
await recovered.resolveFresh();
assert(recovered.journey().active===true,'Una nueva lectura no debe cancelar el recorrido recuperado');
assert(recovered.element('#gpsBadge').textContent.includes('GPS Activo'),'La lectura fresca debe cambiar el indicador a Activo');
assert(recovered.telemetry().some(item=>item.event==='JOURNEY_RECOVERED'),'La recuperación debe quedar registrada en telemetría local');

const expired=createHarness(sources,{hoursAgo:13});
assert(expired.journey().active===false,'Un recorrido de más de 12 horas debe caducar');
assert(expired.journey().status==='OUTSIDE','Un recorrido vencido debe volver a estado inactivo');
assert(expired.gpsRequests.length===0,'Un recorrido vencido no debe iniciar una recuperación GPS automática');
assert(expired.element('#distanceValue').textContent!=='—','La última lectura puede permanecer visible aunque el recorrido haya vencido');
assert(expired.element('#gpsBadge').textContent.includes('GPS Inactivo'),'La lectura conservada de un recorrido vencido debe marcarse Inactivo');
assert(expired.telemetry().some(item=>item.event==='JOURNEY_EXPIRED'&&item.ttlHours===12),'La caducidad de 12 horas debe quedar registrada');

console.log('Recuperabilidad: recorrido activo, vigencia 12h y estados GPS verificados.');