import fs from 'node:fs/promises';

const NOW=1700000000000;
function assert(condition,message){if(!condition)throw new Error(message);}

function createHarness(sources,storedJourney=null){
  const storage=new Map(),elements=new Map(),timers=new Map(),windowListeners={},documentListeners={};
  if(storedJourney)storage.set('nexusTutorJourneyV1',JSON.stringify(storedJourney));
  let clock=0,timerId=0,lastPosition=null;

  function element(selector){
    if(!elements.has(selector)){
      elements.set(selector,{
        value:'',disabled:false,checked:false,textContent:'',innerHTML:'',style:{},className:'',
        classList:{add(){},remove(){},toggle(){}},
        setAttribute(name,value){this[name]=String(value);},
        addEventListener(name,fn){this.listeners[name]=fn;},
        listeners:{}
      });
    }
    return elements.get(selector);
  }

  const document={
    visibilityState:'visible',activeElement:null,
    querySelector:selector=>element(selector),addEventListener:(name,fn)=>{documentListeners[name]=fn;},
    body:{appendChild(){}},createElement:()=>({click(){},remove(){}})
  };
  const navigator={
    onLine:true,
    geolocation:{watchPosition(){return 1;},clearWatch(){},getCurrentPosition(){}},
    serviceWorker:{register:async()=>({})}
  };
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const eventBus=new Map();
  const runtime={
    storage:{read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}},write(key,value){localStorage.setItem(key,JSON.stringify(value));return value;},remove:key=>localStorage.removeItem(key)},
    events:{on(name,fn){const bucket=eventBus.get(name)||new Set();bucket.add(fn);eventBus.set(name,bucket);return()=>bucket.delete(fn);},emit(name,payload){for(const fn of eventBus.get(name)||[])fn(payload);}},
    dom:{one:selector=>element(selector),require:()=>true}
  };
  const location={
    supported:()=>true,current:()=>lastPosition,
    watch(){return 1;},
    fresh(){return Promise.reject(new Error('GPS not used in this test'));}
  };
  class TestDate extends Date{
    constructor(...args){super(...(args.length?args:[NOW+clock]));}
    static now(){return NOW+clock;}
  }
  const win={
    NEXUS_TUTOR_DEFAULTS:{version:'0.1.9',school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30},
    NEXUS_TUTOR_RUNTIME:runtime,NEXUS_TUTOR_LOCATION:location,
    addEventListener:(name,fn)=>{windowListeners[name]=fn;}
  };
  const setIntervalStub=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms,next:clock+ms});return id;};
  const clearIntervalStub=id=>timers.delete(id);
  const URLStub={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
  const run=source=>new Function('window','document','navigator','localStorage','setInterval','clearInterval','setTimeout','clearTimeout','Date','console','fetch','Blob','URL',source)(
    win,document,navigator,localStorage,setIntervalStub,clearIntervalStub,()=>0,()=>{},TestDate,{warn(){},error(){}},async()=>{throw new Error('route unavailable');},globalThis.Blob,URLStub
  );
  run(sources.distance);run(sources.telemetry);run(sources.view);run(sources.journey);

  async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();}
  return{
    element,journey:()=>JSON.parse(storage.get('nexusTutorJourneyV1')||'null'),
    telemetry:()=>JSON.parse(storage.get('nexusTutorTelemetryV1')||'[]'),
    async event(selector,name,event={}){element(selector).listeners[name](event);await flush();},
    async advance(ms){
      const end=clock+ms;
      while(true){
        const due=[...timers.entries()].filter(([,timer])=>timer.next<=end).sort((a,b)=>a[1].next-b[1].next||a[0]-b[0])[0];
        if(!due)break;
        const [id,timer]=due;
        clock=timer.next;
        if(timers.has(id))timer.next+=timer.ms;
        await timer.fn();await flush();
      }
      clock=end;
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

const active=createHarness(sources);
await active.event('#manualDistanceToggle','change',{target:{checked:true}});
active.element('#manualDistanceInput').value='20';
await active.event('#manualDistanceInput','change');
await active.event('#pickupBtn','click');
assert(active.journey().status==='AT_GATE','Un recorrido iniciado en puerta debe quedar AT_GATE');
assert(Number.isFinite(Date.parse(active.journey().atGateAt||'')),'AT_GATE debe guardar atGateAt');
await active.advance(179000);
assert(active.journey().status==='AT_GATE','La espera debe mantenerse durante los primeros 2:59');
await active.advance(1000);
assert(active.journey().status==='COMPLETED','La espera debe completarse automáticamente a los 3 minutos');
assert(active.journey().completedAutomatically===true,'La finalización por espera debe marcarse automática');
assert(active.telemetry().some(item=>item.event==='DELIVERY_COMPLETED'&&item.automatic===true&&item.waitSeconds===180),'La finalización automática debe quedar registrada');

const oldAtGateAt=new Date(NOW-4*60*1000).toISOString();
const recovered=createHarness(sources,{
  active:true,id:'journey-gate-recovery',status:'AT_GATE',
  startedAt:new Date(NOW-30*60*1000).toISOString(),atGateAt:oldAtGateAt,
  lastCheckedAt:new Date(NOW-4*60*1000).toISOString(),lastDistance:10,lastSource:'direct',lastAccuracy:8
});
assert(recovered.journey().status==='COMPLETED','Al recuperar AT_GATE vencido debe completarse inmediatamente');
assert(recovered.journey().completedAutomatically===true,'La recuperación vencida debe conservar finalización automática');
assert(recovered.telemetry().some(item=>item.event==='DELIVERY_WAIT_ELAPSED'&&item.reason==='startup'),'La recuperación debe registrar que la espera venció durante el cierre');

const legacy=createHarness(sources,{
  active:true,id:'journey-gate-legacy',status:'AT_GATE',
  startedAt:new Date(NOW-30*60*1000).toISOString(),
  lastCheckedAt:new Date(NOW-60*1000).toISOString(),lastDistance:10,lastSource:'direct',lastAccuracy:8
});
assert(legacy.journey().status==='AT_GATE','Un AT_GATE antiguo sin atGateAt no debe completarse retroactivamente');
assert(Number.isFinite(Date.parse(legacy.journey().atGateAt||'')),'Un AT_GATE legado debe iniciar su espera de 3 minutos al migrar');

console.log('Entrega automática: espera AT_GATE de 3 minutos y recuperación verificadas.');
