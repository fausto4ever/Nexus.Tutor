import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw Error(message);}

function createHarness(source,telemetrySource){
  const stored=new Map(),elements=new Map(),events=new Map(),emitted=[];
  let currentPosition={coords:{latitude:19.77,longitude:-101.21,accuracy:8}};
  const element=selector=>{
    if(!elements.has(selector)){
      const el={value:'',disabled:false,textContent:'',innerHTML:'',open:false,listeners:{},className:'',classList:{add(name){el.className+=(el.className?' ':'')+name;},remove(name){el.className=el.className.split(/\s+/).filter(x=>x&&x!==name).join(' ');},toggle(name,force){const has=el.className.split(/\s+/).includes(name),next=force===undefined?!has:Boolean(force);if(next&&!has)this.add(name);if(!next&&has)this.remove(name);return next;}},focus(){},setSelectionRange(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn,options){(this.listeners[name]??=[]).push({fn,capture:options===true||options?.capture===true});}};
      elements.set(selector,el);
    }
    return elements.get(selector);
  };
  const defaults={version:'0.1.9',school:{name:'Escuela principal',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  const localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
  const runtime={
    storage:{read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}},write(key,value){localStorage.setItem(key,JSON.stringify(value));return value;},remove:key=>localStorage.removeItem(key)},
    events:{on(name,fn){const set=events.get(name)||new Set();set.add(fn);events.set(name,set);},emit(name,payload){emitted.push({name,payload});for(const fn of events.get(name)||[])fn(payload);}},
    dom:{one:selector=>element(selector),require:()=>true}
  };
  const location={current:()=>currentPosition};
  const document={visibilityState:'visible',querySelector:selector=>element(selector),body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
  const navigator={onLine:true};
  const win={NEXUS_TUTOR_DEFAULTS:defaults,NEXUS_TUTOR_RUNTIME:runtime,NEXUS_TUTOR_LOCATION:location};
  new Function('window',telemetrySource)(win);
  new Function('window','document','navigator','localStorage','Date',source)(win,document,navigator,localStorage,Date);

  async function dispatch(selector,name,event={}){
    const listeners=element(selector).listeners[name]||[];
    for(const {fn} of listeners)await fn(event);
  }
  return{
    stored,element,dispatch,emitted,win,
    config:()=>JSON.parse(localStorage.getItem('nexusTutorConfigV1')||'{}'),
    telemetry:()=>JSON.parse(localStorage.getItem('nexusTutorTelemetryV1')||'[]'),
    setJourney(value){localStorage.setItem('nexusTutorJourneyV1',JSON.stringify(value));},
    setCurrentPosition(value){currentPosition=value;}
  };
}

const [source,telemetrySource]=await Promise.all([
  fs.readFile(new URL('../features/destinations.js',import.meta.url),'utf8'),
  fs.readFile(new URL('../services/telemetry.js',import.meta.url),'utf8')
]);
const h=createHarness(source,telemetrySource),checks=[];

let config=h.config();
assert(config.destinations.length===1&&config.destinations[0].id==='primary','Legacy/default destination must migrate to primary');checks.push('Primary migration');
assert(config.destinations[0].name==='Escuela principal'&&config.school.name==='Escuela principal','Primary destination preserves existing school');checks.push('Primary preserved');
assert(h.element('#saveSettingsBtn').listeners.click.length===1&&!h.element('#saveSettingsBtn').listeners.click[0].capture,'Save button must have one non-capture owner');checks.push('Single save owner');

await h.dispatch('#settingsBtn','click');
assert(h.element('#settingsDialog').open,'Settings owner opens dialog');checks.push('Dialog ownership');
assert(h.element('#cfgDestination').value==='primary'&&h.element('#cfgDestination').innerHTML.includes('Escuela principal'),'Settings selector shows primary destination');checks.push('Selector populated');
assert(h.element('#cfgWaiting').value==='1000'&&h.element('#cfgReady').value==='100'&&h.element('#cfgGate').value==='20','Operational settings load with destination');checks.push('Thresholds loaded');

await h.dispatch('#addDestinationBtn','click');
assert(h.element('#cfgSchoolName').value===''&&h.element('#cfgLat').value===''&&h.element('#cfgLng').value==='','New destination starts clean');checks.push('Clean draft');
assert(h.element('#saveSettingsBtn').textContent==='Guardar nuevo destino','New destination exposes explicit save action');checks.push('Draft save label');
h.element('#cfgSchoolName').value='Temporal';h.element('#cfgLat').value='19.4';h.element('#cfgLng').value='-101.4';
await h.dispatch('#cancelDestinationBtn','click');
assert(h.element('#cfgSchoolName').value==='Escuela principal'&&String(h.element('#cfgLat').value)==='19','Cancel restores active destination');checks.push('Cancel draft');
assert(h.config().destinations.length===1,'Cancel does not persist draft destination');checks.push('Cancel no persistence');

await h.dispatch('#addDestinationBtn','click');
h.element('#cfgSchoolName').value='Destino auto';h.element('#cfgLat').value='19.1';h.element('#cfgLng').value='-101.2';h.element('#cfgWaiting').value='1200';h.element('#cfgReady').value='120';h.element('#cfgGate').value='25';h.element('#cfgDistanceMode').value='direct';
await h.dispatch('#saveSettingsBtn','click');
config=h.config();
assert(config.destinations.length===2&&config.destinations.some(item=>item.id==='primary'),'Adding destination preserves previous destination');checks.push('Preserve previous');
const secondId=config.activeDestinationId;
assert(secondId!=='primary'&&config.school.name==='Destino auto','New destination becomes active after save');checks.push('Activate new destination');
assert(config.thresholds.waitingMeters===1200&&config.thresholds.readyMeters===120&&config.thresholds.atGateMeters===25,'Same owner persists operational thresholds');checks.push('Thresholds persisted');
assert(h.telemetry().some(item=>item.event==='DESTINATION_CHANGED'&&item.toDestinationId===secondId),'Destination switch is logged');checks.push('Destination telemetry');
assert(h.emitted.some(item=>item.name==='config:changed'&&item.payload.reason==='settings-saved'),'Save publishes explicit config event');checks.push('Config event');

await h.dispatch('#settingsBtn','click');
h.element('#cfgDestination').value='primary';
await h.dispatch('#cfgDestination','change');
config=h.config();
assert(config.activeDestinationId==='primary'&&config.school.name==='Escuela principal','Selecting a saved destination activates it immediately');checks.push('Immediate destination activation');
assert(h.emitted.some(item=>item.name==='config:changed'&&item.payload.reason==='destination-selected'&&item.payload.config.activeDestinationId==='primary'),'Destination selection publishes config event immediately');checks.push('Immediate config event');
assert(h.element('#cfgSchoolName').value==='Escuela principal'&&String(h.element('#cfgLat').value)==='19','Selecting saved destination restores its fields');checks.push('Restore fields');
await h.dispatch('#saveSettingsBtn','click');
config=h.config();
assert(config.activeDestinationId==='primary'&&config.school.name==='Escuela principal','Saving edits keeps selected destination active');checks.push('Switch active');
assert(config.destinations.some(item=>item.id===secondId&&item.name==='Destino auto'),'Switching back does not delete alternate destination');checks.push('Alternate retained');

h.element('#cfgLat').value='19.25';await h.dispatch('#latMinusBtn','click');assert(h.element('#cfgLat').value==='-19.25','Coordinate sign helper works');checks.push('Coordinate helper');
await h.dispatch('#settingsBtn','click');await h.dispatch('#useCurrentAsSchoolBtn','click');assert(h.element('#cfgLat').value==='19.77'&&h.element('#cfgLng').value==='-101.21','Current location comes from location service');checks.push('Location service reuse');

h.setJourney({active:true,id:'journey-test',status:'WAITING'});await h.dispatch('#settingsBtn','click');
assert(h.element('#cfgDestination').disabled&&h.element('#addDestinationBtn').disabled&&h.element('#cfgLat').disabled&&h.element('#cfgLng').disabled&&h.element('#latMinusBtn').disabled&&h.element('#lngMinusBtn').disabled&&h.element('#cfgWaiting').disabled&&h.element('#cfgDistanceMode').disabled&&h.element('#saveSettingsBtn').disabled,'Destination and operational controls lock during active journey');checks.push('Active journey lock');
const before=JSON.stringify(h.config());h.element('#cfgSchoolName').value='Cambio indebido';await h.dispatch('#saveSettingsBtn','click');
assert(JSON.stringify(h.config())===before&&h.element('#settingsError').textContent.includes('No puedes modificar'),'Single owner blocks saves during active journey');checks.push('Active save blocked');

console.log(`Destinos: ${checks.length} comprobaciones correctas.`);
