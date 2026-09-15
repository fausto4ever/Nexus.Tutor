import fs from 'node:fs/promises';

function createHarness(source, stored = new Map()) {
  const elements = new Map(), timers = new Map(), eventBus=new Map();
  let id = 0, clock = 0, gpsSuccessCallback, gpsErrorCallback, lastPosition=null;
  const gpsRequests=[],windowListeners={},documentListeners={};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',disabled:false,textContent:'',innerHTML:'',style:{},className:'',classList:{add(){},remove(){},toggle(){}},listeners:{},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(selector);
  };
  const document={visibilityState:'visible',activeElement:null,querySelector:selector=>element(selector),addEventListener:(name,fn)=>{documentListeners[name]=fn;},body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
  const defaults = {version:'0.1.9',school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[1700000000000+clock]));}static now(){return 1700000000000+clock;}}
  const localStorage = {getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  const navigator = {onLine:true,geolocation:{watchPosition(success,error){gpsSuccessCallback=success;gpsErrorCallback=error;return 1;},clearWatch(){},getCurrentPosition(success,error,options){gpsRequests.push({success,error,options});}},serviceWorker:{register:async()=>({})}};
  const runtime={
    storage:{read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}},write(key,value){localStorage.setItem(key,JSON.stringify(value));return value;},remove:key=>localStorage.removeItem(key)},
    events:{on(name,fn){const set=eventBus.get(name)||new Set();set.add(fn);eventBus.set(name,set);return()=>set.delete(fn);},emit(name,payload){for(const fn of eventBus.get(name)||[])fn(payload);}},
    dom:{one:selector=>element(selector),require:()=>true}
  };
  const remember=position=>(lastPosition=position,position);
  const location={
    supported:()=>Boolean(navigator.geolocation),current:()=>lastPosition,
    watch({onPosition,onError,options}={}){return navigator.geolocation.watchPosition(position=>onPosition?.(remember(position)),onError,options);},
    fresh(options={}){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>resolve(remember(position)),reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000,...options}));}
  };
  const win={NEXUS_TUTOR_DEFAULTS:defaults,NEXUS_TUTOR_RUNTIME:runtime,NEXUS_TUTOR_LOCATION:location,addEventListener:(name,fn)=>{windowListeners[name]=fn;}};
  const URLStub={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
  new Function('window','document','navigator','localStorage','setInterval','clearInterval','Date','console','fetch','Blob','URL',source)(
    win,document,navigator,localStorage,
    (fn,ms)=>{timers.set(++id,{fn,ms,next:clock+ms});return id;},key=>timers.delete(key),TestDate,{warn(){}},async()=>{throw Error('Route unavailable');},globalThis.Blob,URLStub
  );
  const flush = async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  return {
    stored,timers,element,gpsRequests,win,navigator,runtime,
    focus:()=>windowListeners.focus?.(),
    visibility(state){document.visibilityState=state;return documentListeners.visibilitychange?.();},
    pageshow:()=>windowListeners.pageshow?.({persisted:true}),
    online(){navigator.onLine=true;return windowListeners.online?.();},
    offline(){navigator.onLine=false;return windowListeners.offline?.();},
    logs:()=>JSON.parse(stored.get('nexusTutorLogV1')||'[]'),
    telemetry:()=>JSON.parse(stored.get('nexusTutorTelemetryV1')||'[]'),
    journey:()=>JSON.parse(stored.get('nexusTutorJourneyV1')||'null'),
    measurementTimerMs:()=>[...timers.values()].filter(t=>t.ms!==1000).map(t=>t.ms).sort((a,b)=>a-b)[0]??null,
    async event(selector,name,event={}){element(selector).listeners[name](event);await flush();},
    async gps(lat=19,lng=-101.005,accuracy=5){gpsSuccessCallback({coords:{latitude:lat,longitude:lng,accuracy}});await flush();},
    async gpsError(code=1,message='Permission denied'){gpsErrorCallback({code,message});await flush();},
    async advance(ms){const end=clock+ms;while(true){const due=[...timers.entries()].filter(([,t])=>t.next<=end).sort((a,b)=>a[1].next-b[1].next)[0];if(!due)break;clock=due[1].next;due[1].next+=due[1].ms;await due[1].fn();await flush();}clock=end;},
    async pendingReset(){const timer=[...timers.values()].find(t=>t.ms!==1000);if(!timer)return;element('#resetJourneyBtn').listeners.click();await flush();}
  };
}
function assert(condition,message){if(!condition)throw Error(message);}

async function testHistory(source){
  const h=createHarness(source);
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  await h.event('#pickupBtn','click');
  assert(h.logs().length===1,'Start must record exactly one event');
  await h.advance(29000);assert(h.logs().length===1,'Must not sample before 30s in WAITING');
  await h.advance(1000);assert(h.logs().length===2,'Must record at 30s in WAITING');
  assert(h.logs()[0].distance===1000&&h.logs()[0].message.includes('manual'),'Must preserve manual distance/source');
  h.element('#manualDistanceInput').value='50';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='READY','Distance edit promotes immediately');
  assert(h.measurementTimerMs()===10000,'READY increases polling rate to 10s');
  await h.advance(10000);assert(h.logs()[0].status==='READY'&&h.logs()[0].distance===50,'READY periodic record');
  h.element('#manualDistanceInput').value='10';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='AT_GATE','AT_GATE promotes immediately');
  assert(h.measurementTimerMs()===10000,'AT_GATE does not increase polling beyond READY');
  await h.advance(10000);assert(h.logs()[0].status==='AT_GATE','AT_GATE keeps periodic telemetry/history');
  const reloaded=createHarness(source,h.stored);assert(reloaded.journey().status==='AT_GATE','Log/journey persist on reload');
  assert(reloaded.element('#distanceValue').textContent!=='—','Last known distance restores on reload');
  const before=h.logs().length;await h.pendingReset();assert(!h.journey().active,'Reset ends journey');
  await h.advance(60000);assert(h.logs().length===before,'Reset stops timer logging');
  return ['Start log','WAITING cadence','WAITING periodic','Manual source','Immediate READY','READY 10s cadence','READY record','Immediate AT_GATE','AT_GATE cadence cap','AT_GATE record','Reload status','Reload last distance','Reset inactive','Reset stops logging'];
}

async function testLinearProgress(source){
  const h=createHarness(source);
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  const set=async meters=>{h.element('#manualDistanceInput').value=String(meters);await h.event('#manualDistanceInput','change');};
  await set(1500);assert(h.element('#distanceProgress').style.width==='0%','1500m stays at zero outside 1000m scale');
  await set(1000);assert(h.element('#distanceProgress').style.width==='0%','WAITING boundary is zero percent');
  await set(500);assert(h.element('#distanceProgress').style.width==='50%','500m is halfway on linear scale');
  await set(300);assert(h.element('#distanceProgress').style.width==='70%','300m maps to 70 percent progress');
  await set(100);assert(h.element('#distanceProgress').style.width==='90%','READY 100m maps to 90 percent');
  await set(20);assert(h.element('#distanceProgress').style.width==='98%','AT_GATE 20m maps to 98 percent');
  await set(0);assert(h.element('#distanceProgress').style.width==='100%','Zero meters maps to 100 percent');
  assert(h.element('#waitingMarker').style.left==='0%','WAITING marker is mathematically positioned');
  assert(h.element('#readyMarker').style.left==='90%','READY marker is mathematically positioned');
  assert(h.element('#gateMarker').style.left==='98%','AT_GATE marker is mathematically positioned');
  return ['Outside scale clamp','WAITING marker start','Halfway linear','300m linear','READY linear','AT_GATE linear','Zero 100%','WAITING marker','READY marker','AT_GATE marker'];
}

async function testEarlyActivationAndPolling(source){
  const h=createHarness(source);
  assert(h.element('#pickupBtn').disabled,'Fresh measurement required before activating');
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  h.element('#manualDistanceInput').value='50000';await h.event('#manualDistanceInput','change');
  assert(!h.element('#pickupBtn').disabled,'Can activate from 50 km');
  await h.event('#pickupBtn','click');
  assert(h.journey().status==='OUTSIDE'&&h.element('#pickupBtn')['data-state']==='OUTSIDE'&&h.element('#statusMessage').textContent.includes('te avisaremos cuando estés cerca'),'Outside activation has red state and far-away guidance');
  assert(h.measurementTimerMs()===60000,'OUTSIDE polls every 60s');
  h.element('#manualDistanceInput').value='1000';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='WAITING'&&h.measurementTimerMs()===30000&&h.element('#statusMessage').textContent.includes('rango de espera'),'WAITING changes polling and guidance');
  h.element('#manualDistanceInput').value='100';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='READY'&&h.measurementTimerMs()===10000&&h.element('#statusMessage').textContent.includes('muy cerca'),'READY changes polling and guidance');
  h.element('#manualDistanceInput').value='20';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='AT_GATE'&&h.measurementTimerMs()===10000,'AT_GATE keeps 10s cadence');
  assert(h.element('#pickupBtnText').textContent==='ESPERANDO ENTREGA'&&h.element('#statusMessage').textContent.includes('Has llegado')&&h.element('#statusMessage').textContent.includes('Esperando la entrega'),'AT_GATE shows waiting for delivery');
  h.element('#manualDistanceInput').value='75000';await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='AT_GATE','Distance increase never regresses attained state');
  h.win.NEXUS_TUTOR_COMPLETE_JOURNEY();await Promise.resolve();
  assert(h.journey().status==='COMPLETED'&&h.element('#pickupBtnText').textContent==='SOLICITUD COMPLETADA'&&h.element('#statusMessage').textContent.includes('Solicitud completada')&&h.element('#statusMessage').textContent.includes('excelente día')&&h.element('#statusMessage').textContent.includes('Que les vaya muy bien'),'Completion shows final request status and greeting');
  assert(h.logs()[0].status==='COMPLETED'&&h.logs()[0].message==='Solicitud completada','Completion is recorded as request completed');
  assert(h.measurementTimerMs()===null,'Completion stops proximity polling');
  return ['Fresh required','50km activation','OUTSIDE state','OUTSIDE cadence','WAITING cadence','READY cadence','AT_GATE cadence cap','Waiting delivery UI','Monotonic after gate','Completed greeting','Completion stops polling'];
}

async function testResumeAndGpsLoss(source){
  const h=createHarness(source);
  await h.gps(19,-101.05);
  const before=h.element('#distanceValue').textContent;
  assert(before!=='—'&&!h.element('#pickupBtn').disabled,'Initial GPS produces fresh usable distance');
  h.visibility('hidden');const pending=h.visibility('visible');h.focus();
  assert(h.gpsRequests.length===1,'Visibility and focus deduplicate fresh GPS request');
  assert(h.gpsRequests[0].options.maximumAge===0,'Resume requires fresh GPS');
  assert(h.element('#distanceValue').textContent===before,'Resume preserves last known metrage');
  assert(h.element('#distanceSource').textContent.includes('Recalculando'),'Resume visibly indicates recalculation');
  assert(h.element('#pickupBtn').disabled,'Stale/recalculating measurement cannot start a new journey');
  h.gpsRequests[0].success({coords:{latitude:19,longitude:-101.005,accuracy:7}});await pending;
  assert(h.element('#distanceSource').textContent==='Distancia directa'&&!h.element('#pickupBtn').disabled,'Fresh resume replaces stale measurement and reenables start');

  await h.gpsError();
  assert(h.element('#distanceValue').textContent!=='—','watchPosition error preserves last distance');
  assert(h.element('#distanceSource').textContent.includes('Última ubicación'),'watchPosition error labels distance as last known');
  assert(h.element('#pickupBtn').disabled,'watchPosition error invalidates distance for new start');

  await h.gps(19,-101.005);
  assert(!h.element('#pickupBtn').disabled,'GPS recovery refreshes and allows start again');
  await h.event('#pickupBtn','click');
  const attained=h.journey().status;
  h.visibility('hidden');const failed=h.visibility('visible');
  const visibleBeforeFail=h.element('#distanceValue').textContent;
  h.gpsRequests[1].error({code:1,message:'Permission denied'});await failed;
  assert(h.journey().status===attained,'Resume GPS failure preserves attained journey status');
  assert(h.element('#distanceValue').textContent===visibleBeforeFail,'Resume failure preserves last known metrage');
  assert(h.element('#distanceSource').textContent.includes('Última ubicación'),'Resume failure marks last-known measurement');
  return ['Initial GPS','Return dedup','Fresh GPS maximumAge','Keep metrage while recalculating','Recalculating indicator','No stale start','Fresh resume','Watch error keeps distance','Watch error label','Watch error blocks start','GPS recovery','Active status preserved on failure','Active metrage preserved','Active failure label'];
}

async function testConnectivityAndTelemetry(source){
  const h=createHarness(source);
  assert(h.element('#connectionBadge').textContent.includes('En línea'),'Starts with online indicator');
  h.offline();assert(h.element('#connectionBadge').textContent.includes('Sin internet'),'Offline event updates indicator');
  h.online();assert(h.element('#connectionBadge').textContent.includes('En línea'),'Online event restores indicator');
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  await h.event('#pickupBtn','click');
  h.element('#manualDistanceInput').value='100';await h.event('#manualDistanceInput','change');
  const events=h.telemetry();
  assert(events.length>0,'Telemetry is stored locally');
  assert(events.some(e=>e.event==='INTERNET_OFFLINE')&&events.some(e=>e.event==='INTERNET_ONLINE'),'Connectivity changes are in telemetry');
  assert(events.some(e=>e.event==='JOURNEY_STARTED'),'Journey start is in telemetry');
  assert(events.some(e=>e.event==='STATUS_CHANGED'&&e.toStatus==='READY'),'Status transitions are in telemetry');
  assert(events.every(e=>Object.hasOwn(e,'online')&&Object.hasOwn(e,'measurementState')),'Telemetry contains connectivity and measurement freshness');
  assert(typeof h.element('#downloadTelemetryBtn').listeners.click==='function','JSON telemetry download control is wired');
  return ['Online indicator','Offline indicator','Online recovery','Telemetry stored','Connectivity telemetry','Journey telemetry','Status telemetry','Telemetry fields','Download JSON control'];
}

const source=await fs.readFile(new URL('../features/journey.js',import.meta.url),'utf8');
const checks=[...await testHistory(source),...await testLinearProgress(source),...await testEarlyActivationAndPolling(source),...await testResumeAndGpsLoss(source),...await testConnectivityAndTelemetry(source)];
console.log(`Historial: ${checks.length} comprobaciones correctas.`);
