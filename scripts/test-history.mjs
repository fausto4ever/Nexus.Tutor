import fs from 'node:fs/promises';

function createHarness(source, stored = new Map()) {
  const elements = new Map(), timers = new Map();
  let id = 0, clock = 0, gpsCallback;
  const defaults = {school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',disabled:false,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){},toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(selector);
  };
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[1700000000000+clock]));}static now(){return 1700000000000+clock;}}
  const localStorage = {getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  const navigator = {geolocation:{watchPosition(fn){gpsCallback=fn;}}};
  new Function('window','document','navigator','localStorage','setInterval','clearInterval','Date','console','fetch',source)(
    {NEXUS_TUTOR_DEFAULTS:defaults},{querySelector:element},navigator,localStorage,
    (fn,ms)=>{timers.set(++id,{fn,ms,next:clock+ms});return id;},key=>timers.delete(key),TestDate,{warn(){}},async()=>{throw Error('Route unavailable');}
  );
  const flush = async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  return {
    stored, timers, element,
    logs:()=>JSON.parse(stored.get('nexusTutorLogV1')||'[]'),
    journey:()=>JSON.parse(stored.get('nexusTutorJourneyV1')||'null'),
    async event(selector,name,event={}){element(selector).listeners[name](event);await flush();},
    async gps(lat=19,lng=-101.005){gpsCallback({coords:{latitude:lat,longitude:lng,accuracy:5}});await flush();},
    async advance(ms){const end=clock+ms;while(true){const due=[...timers.entries()].filter(([,t])=>t.next<=end).sort((a,b)=>a[1].next-b[1].next)[0];if(!due)break;clock=due[1].next;due[1].next+=due[1].ms;await due[1].fn();await flush();}clock=end;},
    async pendingReset(){const timer=[...timers.values()].find(t=>t.ms===30000);const pending=timer.fn();element('#resetJourneyBtn').listeners.click();await pending;await flush();}
  };
}
function assert(condition,message){if(!condition)throw Error(message);}
async function testHistory(source){
  const h=createHarness(source);
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  await h.event('#pickupBtn','click');
  assert(h.logs().length===1,'Start must record exactly one event');
  await h.advance(29000);
  assert(h.logs().length===1,'Must not sample before 30s');
  await h.advance(1000);
  assert(h.logs().length===2,'Must record at 30s with unchanged WAITING');
  assert(h.logs()[0].distance===1000&&h.logs()[0].message.includes('manual'),'Must preserve manual distance/source');
  await h.advance(30000);
  assert(h.logs().length===3,'Must record again at 60s');
  h.element('#manualDistanceSlider').value='50';
  await h.event('#manualDistanceSlider','input');
  assert(h.journey().status==='READY','Slider must still promote immediately');
  await h.advance(30000);
  assert(h.logs()[0].status==='READY'&&h.logs()[0].distance===50,'READY periodic record');
  h.element('#manualDistanceSlider').value='10';
  await h.event('#manualDistanceSlider','input');
  await h.advance(30000);
  assert(h.logs()[0].status==='AT_GATE'&&h.logs()[0].message.includes('periódica'),'AT_GATE must keep recording');
  const reloaded=createHarness(source,h.stored);
  assert(reloaded.logs().length===h.logs().length,'Log persists on reload');
  await reloaded.advance(30000);
  assert(reloaded.logs()[0].distance===null&&reloaded.logs()[0].message.includes('no disponible'),'Missing GPS must record failure without stale distance');
  const before=h.logs().length;
  await h.pendingReset();
  assert(h.logs().length===before,'Pending previous measurement must not record after reset');
  await h.advance(60000);
  assert(h.logs().length===before,'Reset stops timer');
  const gps=createHarness(source);
  await gps.gps();
  await gps.event('#pickupBtn','click');
  await gps.advance(30000);
  assert(gps.logs().length===2&&gps.logs()[0].message.includes('GPS'),'GPS periodic record');
  await gps.advance(60*30000);
  assert(gps.logs().length===60,'Existing 60-event retention preserved');
  return ['30s / 60s with unchanged WAITING','Manual distance and source','Immediate READY and AT_GATE transitions','Periodic AT_GATE','localStorage reload','Missing GPS recorded without stale distance','Reset ignores in-flight measurement and stops logging','GPS mode','60-event retention'];
}

const checks=await testHistory(await fs.readFile(new URL('../app.js',import.meta.url),'utf8'));
console.log(`Historial: ${checks.length} comprobaciones correctas.`);
