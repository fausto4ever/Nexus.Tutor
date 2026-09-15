import fs from 'node:fs/promises';

function assert(condition,message){if(!condition)throw Error(message);}

function createHarness(source){
  const stored=new Map(),elements=new Map();
  let appSaveCount=0;
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{value:'',disabled:false,textContent:'',innerHTML:'',listeners:{},classList:{add(){},remove(){}},focus(){},setSelectionRange(){},addEventListener(name,fn,options){(this.listeners[name]??=[]).push({fn,capture:options===true||options?.capture===true});}});
    return elements.get(selector);
  };
  const localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const defaults={version:'0.1.8',school:{name:'Escuela principal',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  const document={visibilityState:'visible',querySelector:selector=>element(selector)};
  const navigator={onLine:true};
  const win={NEXUS_TUTOR_DEFAULTS:defaults};

  // Simula los listeners que app.js registra antes del feature de destinos.
  element('#settingsBtn').addEventListener('click',()=>{
    const config=JSON.parse(localStorage.getItem('nexusTutorConfigV1')||'{}');
    const school={...defaults.school,...(config.school||{})};
    element('#cfgSchoolName').value=school.name||'';
    element('#cfgLat').value=school.lat??'';
    element('#cfgLng').value=school.lng??'';
  });
  element('#saveSettingsBtn').addEventListener('click',()=>{
    appSaveCount++;
    const config=JSON.parse(localStorage.getItem('nexusTutorConfigV1')||'{}');
    localStorage.setItem('nexusTutorConfigV1',JSON.stringify({...config,school:{name:element('#cfgSchoolName').value||'Destino',lat:Number(element('#cfgLat').value),lng:Number(element('#cfgLng').value)}}));
  });

  new Function('window','document','navigator','localStorage','Date',source)(win,document,navigator,localStorage,Date);

  async function dispatch(selector,name){
    const listeners=element(selector).listeners[name]||[];
    const event={defaultPrevented:false,immediateStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediateStopped=true;}};
    for(const {fn} of listeners.filter(item=>item.capture)){fn(event);if(event.immediateStopped)return event;}
    for(const {fn} of listeners.filter(item=>!item.capture)){fn(event);if(event.immediateStopped)return event;}
    return event;
  }
  return{
    stored,element,dispatch,
    config:()=>JSON.parse(localStorage.getItem('nexusTutorConfigV1')||'{}'),
    telemetry:()=>JSON.parse(localStorage.getItem('nexusTutorTelemetryV1')||'[]'),
    setJourney(value){localStorage.setItem('nexusTutorJourneyV1',JSON.stringify(value));},
    appSaveCount:()=>appSaveCount
  };
}

const source=await fs.readFile(new URL('../features/destinations.js',import.meta.url),'utf8');
const h=createHarness(source);
const checks=[];

let config=h.config();
assert(config.destinations.length===1&&config.destinations[0].id==='primary','Legacy/default destination must migrate to primary');checks.push('Primary migration');
assert(config.destinations[0].name==='Escuela principal'&&config.school.name==='Escuela principal','Primary destination preserves existing school');checks.push('Primary preserved');

await h.dispatch('#settingsBtn','click');
assert(h.element('#cfgDestination').value==='primary'&&h.element('#cfgDestination').innerHTML.includes('Escuela principal'),'Settings selector shows primary destination');checks.push('Selector populated');
assert(h.element('#saveSettingsBtn').textContent==='Guardar cambios','Default settings action is explicit');checks.push('Default save label');

await h.dispatch('#addDestinationBtn','click');
assert(h.element('#cfgSchoolName').value===''&&h.element('#cfgLat').value===''&&h.element('#cfgLng').value==='','New destination starts clean');checks.push('Clean draft');
assert(h.element('#saveSettingsBtn').textContent==='Guardar nuevo destino','New destination exposes explicit save action');checks.push('Draft save label');
h.element('#cfgSchoolName').value='Temporal';h.element('#cfgLat').value='19.4';h.element('#cfgLng').value='-101.4';
await h.dispatch('#cancelDestinationBtn','click');
assert(h.element('#cfgSchoolName').value==='Escuela principal'&&String(h.element('#cfgLat').value)==='19'&&h.element('#saveSettingsBtn').textContent==='Guardar cambios','Cancel restores active destination and normal action');checks.push('Cancel draft');
assert(h.config().destinations.length===1,'Cancel does not persist draft destination');checks.push('Cancel no persistence');

await h.dispatch('#addDestinationBtn','click');
h.element('#cfgSchoolName').value='Destino auto';h.element('#cfgLat').value='19.1';h.element('#cfgLng').value='-101.2';
await h.dispatch('#saveSettingsBtn','click');
config=h.config();
assert(config.destinations.length===2,'Adding destination must keep previous destination');checks.push('Preserve previous');
assert(config.destinations.some(item=>item.id==='primary'&&item.name==='Escuela principal'),'Primary destination remains untouched');checks.push('Primary retained');
const secondId=config.activeDestinationId;
assert(secondId!=='primary'&&config.school.name==='Destino auto','New destination becomes active only after save');checks.push('Activate new destination');
assert(h.element('#saveSettingsBtn').textContent==='Guardar cambios','Successful save returns normal settings action');checks.push('Save label restored');
assert(h.telemetry().some(item=>item.event==='DESTINATION_CHANGED'&&item.fromDestinationId==='primary'&&item.toDestinationId===secondId&&item.toDestinationName==='Destino auto'),'Destination switch is logged in telemetry');checks.push('Destination telemetry');

await h.dispatch('#settingsBtn','click');
h.element('#cfgDestination').value='primary';await h.dispatch('#cfgDestination','change');
assert(h.element('#cfgSchoolName').value==='Escuela principal'&&String(h.element('#cfgLat').value)==='19','Selecting saved destination restores its fields');checks.push('Restore fields');
await h.dispatch('#saveSettingsBtn','click');
config=h.config();
assert(config.activeDestinationId==='primary'&&config.school.name==='Escuela principal','Saving selection switches active destination');checks.push('Switch active');
assert(config.destinations.some(item=>item.id===secondId&&item.name==='Destino auto'),'Switching back does not delete alternate destination');checks.push('Alternate retained');

h.element('#cfgLat').value='19.25';await h.dispatch('#latMinusBtn','click');
assert(h.element('#cfgLat').value==='-19.25','Coordinate sign helper still works');checks.push('Coordinate helper');

h.setJourney({active:true,id:'journey-test',status:'WAITING'});await h.dispatch('#settingsBtn','click');
assert(h.element('#cfgDestination').disabled&&h.element('#addDestinationBtn').disabled&&h.element('#cfgLat').disabled&&h.element('#cfgLng').disabled,'Destination controls lock during active journey');checks.push('Active journey lock');
const savesBefore=h.appSaveCount();h.element('#cfgSchoolName').value='Cambio indebido';await h.dispatch('#saveSettingsBtn','click');
assert(h.appSaveCount()===savesBefore&&h.config().school.name==='Escuela principal','Capture guard blocks destination edits during active journey');checks.push('Active save blocked');

console.log(`Destinos: ${checks.length} comprobaciones correctas.`);
