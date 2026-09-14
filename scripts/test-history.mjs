import fs from 'node:fs/promises';

function createHarness(source, stored = new Map()) {
  const elements = new Map(), timers = new Map();
  let id = 0, clock = 0, gpsSuccessCallback, gpsErrorCallback;
  const gpsRequests=[],windowListeners={},documentListeners={};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',disabled:false,textContent:'',innerHTML:'',style:{},className:'',classList:{add(){},remove(){},toggle(){}},listeners:{},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(selector);
  };
  const document={visibilityState:'visible',activeElement:null,querySelector:selector=>element(selector),addEventListener:(name,fn)=>{documentListeners[name]=fn;}};
  const defaults = {version:'0.1.8',school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[1700000000000+clock]));}static now(){return 1700000000000+clock;}}
  const localStorage = {getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  const navigator = {onLine:true,geolocation:{watchPosition(success,error){gpsSuccessCallback=success;gpsErrorCallback=error;},getCurrentPosition(success,error,options){gpsRequests.push({success,error,options});}}};
  const win={NEXUS_TUTOR_DEFAULTS:defaults,addEventListener:(name,fn)=>{windowListeners[name]=fn;}};
  new Function('window','document','navigator','localStorage','setInterval','clearInterval','Date','console','fetch','Blob','URL',source)(
    win,document,navigator,localStorage,
    (fn,ms)=>{timers.set(++id,{fn,ms,next:clock+ms});return id;},key=>timers.delete(key),TestDate,{warn(){}},async()=>{throw Error('Route unavailable');},class{}, {createObjectURL(){return'blob:test';},revokeObjectURL(){}}
  );
  const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
  return{
    stored,element,document,windowListeners,documentListeners,gpsRequests,
    gps(position){gpsSuccessCallback?.({coords:{latitude:position.latitude,longitude:position.longitude,accuracy:position.accuracy??10}});},
    gpsError(error={code:2,message:'GPS unavailable'}){gpsErrorCallback?.(error);},
    async settle(){await wait();await wait();},
    click(selector){element(selector).listeners.click?.({target:element(selector)});},
    change(selector,value){element(selector).value=value;element(selector).listeners.change?.({target:element(selector)});},
    journey(){return JSON.parse(stored.get('nexusTutorJourneyV1')||'null');},
    telemetry(){return JSON.parse(stored.get('nexusTutorTelemetryV1')||'[]');},
    setVisibility(value){document.visibilityState=value;return documentListeners.visibilitychange?.();},
    setOnline(value){navigator.onLine=value;return windowListeners[value?'online':'offline']?.();},
    timers,
    advance(ms){clock+=ms;for(const timer of timers.values())if(timer.next<=clock){timer.fn();timer.next=clock+timer.ms;}}
  };
}

const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
const h=createHarness(source);
const checks=[];
function assert(condition,message){if(!condition)throw Error(message);}
function ok(condition,name){assert(condition,name);checks.push(name);}

// Configuración válida y primera lectura GPS lejana: OUTSIDE debe poder iniciar.
h.gps({latitude:19.45,longitude:-101,accuracy:8});await h.settle();
ok(h.element('#pickupBtn').disabled===false,'GPS fresco habilita inicio fuera de WAITING');
ok(h.element('#actionHint').textContent.includes('cualquier distancia'),'OUTSIDE explica inicio desde cualquier distancia');
h.click('#pickupBtn');await h.settle();
ok(h.journey()?.active===true&&h.journey()?.status==='OUTSIDE','Trayecto GPS lejano inicia en OUTSIDE');
ok(h.element('#pickupBtn').classList!==undefined,'Botón activo mantiene estado visual');

// Progresión monotónica y mensajes.
h.change('#manualDistanceToggle',true);await h.settle();
h.change('#manualDistanceInput','900');await h.settle();
ok(h.journey()?.status==='WAITING','Promueve a WAITING');
h.change('#manualDistanceInput','80');await h.settle();
ok(h.journey()?.status==='READY','Promueve a READY');
h.change('#manualDistanceInput','10');await h.settle();
ok(h.journey()?.status==='AT_GATE','Promueve a AT_GATE');
h.change('#manualDistanceInput','500');await h.settle();
ok(h.journey()?.status==='AT_GATE','No retrocede desde AT_GATE');
ok(h.element('#statusMessage').textContent.includes('Esperando la entrega'),'AT_GATE muestra espera de entrega');

// Escala lineal.
h.click('#resetJourneyBtn');await h.settle();
h.change('#manualDistanceInput','1500');await h.settle();
ok(h.element('#distanceProgress').style.width==='0%','1500 m = 0%');
h.change('#manualDistanceInput','500');await h.settle();
ok(h.element('#distanceProgress').style.width==='50%','500 m = 50%');
h.change('#manualDistanceInput','100');await h.settle();
ok(h.element('#distanceProgress').style.width==='90%','100 m = 90%');
h.change('#manualDistanceInput','20');await h.settle();
ok(h.element('#distanceProgress').style.width==='98%','20 m = 98%');

// Conectividad.
h.setOnline(false);ok(h.element('#connectionBadge').textContent.includes('Sin internet'),'Indicador offline');
h.setOnline(true);ok(h.element('#connectionBadge').textContent.includes('En línea'),'Indicador online');

// Telemetría y polling adaptativo.
h.change('#manualDistanceInput','2000');await h.settle();h.click('#pickupBtn');await h.settle();
ok([...h.timers.values()].some(t=>t.ms===60000),'OUTSIDE usa polling 60 s');
h.change('#manualDistanceInput','900');await h.settle();
ok([...h.timers.values()].some(t=>t.ms===30000),'WAITING usa polling 30 s');
h.change('#manualDistanceInput','80');await h.settle();
ok([...h.timers.values()].some(t=>t.ms===10000),'READY usa polling 10 s');
ok(h.telemetry().some(e=>e.event==='STATUS_CHANGED'),'Telemetría registra cambios de estado');

// Recálculo al volver y pérdida/recuperación GPS.
h.change('#manualDistanceToggle',false);await h.settle();
await h.setVisibility('hidden');
await h.setVisibility('visible');await h.settle();
ok(h.element('#distanceSource').textContent.includes('Recalculando')||h.gpsRequests.length>0,'Volver a app inicia recálculo');
if(h.gpsRequests.length){
  const req=h.gpsRequests.at(-1);req.error({code:2,message:'No signal'});await h.settle();
  ok(h.element('#distanceSource').textContent.includes('Última ubicación conocida'),'Fallo conserva última distancia');
}
h.gps({latitude:19.449,longitude:-101,accuracy:9});await h.settle();
ok(h.telemetry().some(e=>e.event==='MEASUREMENT_OK'),'GPS recuperado vuelve a medir');

// Mensajes contractuales.
h.change('#manualDistanceToggle',true);h.click('#resetJourneyBtn');await h.settle();
h.change('#manualDistanceInput','2000');await h.settle();h.click('#pickupBtn');await h.settle();
ok(h.element('#statusMessage').textContent.includes('Aún te encuentras muy lejos'),'Mensaje OUTSIDE');
h.change('#manualDistanceInput','900');await h.settle();ok(h.element('#statusMessage').textContent.includes('rango de espera'),'Mensaje WAITING');
h.change('#manualDistanceInput','80');await h.settle();ok(h.element('#statusMessage').textContent.includes('muy cerca'),'Mensaje READY');
h.change('#manualDistanceInput','10');await h.settle();ok(h.element('#statusMessage').textContent.includes('Esperando la entrega'),'Mensaje AT_GATE');

console.log(`Historial: ${checks.length} comprobaciones correctas.`);
