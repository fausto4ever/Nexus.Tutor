import fs from 'node:fs/promises';

function createHarness(source, stored = new Map()) {
  const elements = new Map(), timers = new Map();
  let id = 0, clock = 0, gpsCallback;
  const gpsRequests=[],windowListeners={},documentListeners={};
  const document={visibilityState:'visible',querySelector:selector=>element(selector),addEventListener:(name,fn)=>{documentListeners[name]=fn;}};
  const defaults = {school:{name:'Escuela',lat:19,lng:-101},thresholds:{waitingMeters:1000,readyMeters:100,atGateMeters:20},distanceMode:'direct',refreshSeconds:30};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',disabled:false,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){},toggle(){}},listeners:{},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(selector);
  };
  class TestDate extends Date {constructor(...args){super(...(args.length?args:[1700000000000+clock]));}static now(){return 1700000000000+clock;}}
  const localStorage = {getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  const navigator = {geolocation:{watchPosition(fn){gpsCallback=fn;},getCurrentPosition(success,error,options){gpsRequests.push({success,error,options});}}};
  new Function('window','document','navigator','localStorage','setInterval','clearInterval','Date','console','fetch',source)(
    {NEXUS_TUTOR_DEFAULTS:defaults,addEventListener:(name,fn)=>{windowListeners[name]=fn;}},document,navigator,localStorage,
    (fn,ms)=>{timers.set(++id,{fn,ms,next:clock+ms});return id;},key=>timers.delete(key),TestDate,{warn(){}},async()=>{throw Error('Route unavailable');}
  );
  const flush = async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  return {
    stored, timers, element, gpsRequests,
    focus:()=>windowListeners.focus(),
    visibility(state){document.visibilityState=state;return documentListeners.visibilitychange();},
    pageshow:()=>windowListeners.pageshow({persisted:true}),
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
  h.element('#manualDistanceInput').value='50';
  await h.event('#manualDistanceInput','change');
  assert(h.journey().status==='READY','Distance edit must still promote immediately');
  await h.advance(30000);
  assert(h.logs()[0].status==='READY'&&h.logs()[0].distance===50,'READY periodic record');
  h.element('#manualDistanceInput').value='10';
  await h.event('#manualDistanceInput','change');
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


async function testDistanceControls(source){
  const h=createHarness(source);
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  await h.event('#manualDistancePlus','click');
  assert(h.element('#manualDistanceInput').value==='1010'&&!h.element('#pickupBtn').disabled,'Plus can move outside WAITING and still allow starting');
  await h.event('#manualDistanceMinus','click');
  assert(h.element('#manualDistanceInput').value==='1000'&&!h.element('#pickupBtn').disabled,'Minus enables start at WAITING boundary');
  await h.event('#pickupBtn','click');
  h.element('#manualDistanceInput').value='110';
  await h.event('#manualDistanceInput','change');
  await h.event('#manualDistanceMinus','click');
  assert(h.journey().status==='READY'&&h.element('#statusPill').textContent.includes('READY')&&h.logs()[0].status==='READY'&&h.logs()[0].distance===100,'READY boundary updates UI, storage and history immediately');
  const readyCount=h.logs().length;
  h.element('#manualDistanceStep').value='1000';
  await h.event('#manualDistanceStep','change');
  await h.event('#manualDistancePlus','click');
  assert(h.journey().status==='READY'&&h.element('#manualDistanceInput').value==='1100'&&h.logs().length===readyCount,'Alternative route beyond WAITING preserves READY without false transition');
  await h.advance(30000);
  assert(h.logs()[0].distance===1100&&h.logs()[0].status==='READY','Periodic log contains increased distance and retained READY');
  h.element('#manualDistanceInput').value='21';
  await h.event('#manualDistanceInput','change');
  h.element('#manualDistanceStep').value='1';
  await h.event('#manualDistanceStep','change');
  await h.event('#manualDistanceMinus','click');
  assert(h.journey().status==='AT_GATE'&&h.element('#statusPill').textContent.includes('AT GATE')&&h.logs()[0].distance===20&&h.logs()[0].status==='AT_GATE','AT_GATE boundary updates UI and history immediately');
  h.element('#manualDistanceStep').value='1000';
  await h.event('#manualDistanceStep','change');
  await h.event('#manualDistancePlus','click');
  await h.event('#manualDistancePlus','click');
  await h.advance(30000);
  assert(h.journey().status==='AT_GATE'&&h.logs()[0].distance===2020&&h.logs()[0].status==='AT_GATE','AT_GATE remains at 2020 m and records actual distance');
  const reloaded=createHarness(source,h.stored);
  assert(reloaded.journey().status==='AT_GATE','Reload retains furthest status');
  for(const invalid of ['', '-1', '1.5', 'Infinity', 'not-a-number']){
    h.element('#manualDistanceInput').value=invalid;
    await h.event('#manualDistanceInput','change');
    assert(h.element('#manualDistanceInput').value==='2020','Reject invalid manual distances');
  }
  h.element('#manualDistanceInput').value='5';
  await h.event('#manualDistanceInput','change');
  await h.event('#manualDistanceMinus','click');
  assert(h.element('#manualDistanceInput').value==='0'&&h.element('#manualDistanceMinus').disabled,'Decrement clamps at zero');
  h.element('#manualDistanceStep').value='100';
  await h.event('#manualDistanceStep','change');
  await h.event('#manualDistancePlus','click');
  assert(h.element('#manualDistanceInput').value==='100','100 m increment');
  await h.event('#resetJourneyBtn','click');
  h.element('#manualDistanceInput').value='500';
  await h.event('#manualDistanceInput','change');
  await h.event('#pickupBtn','click');
  assert(h.journey().status==='WAITING','Only reset allows a new WAITING journey');

  const gps=createHarness(source);
  await gps.gps();
  await gps.event('#pickupBtn','click');
  await gps.gps(19,-101.0005);
  await gps.advance(30000);
  assert(gps.journey().status==='READY','GPS enters READY');
  await gps.gps(19,-101.05);
  await gps.advance(30000);
  assert(gps.journey().status==='READY'&&gps.logs()[0].distance>1000,'GPS increase also preserves READY');
  return ['+/- WAITING boundary','Immediate READY UI and history','Alternative route retains READY','Periodic larger distance','Immediate AT_GATE UI and history','AT_GATE retained outside WAITING','Reload retains status','Invalid values rejected','Zero lower bound','Selectable step sizes','Reset allows WAITING again','GPS monotonic state'];
}


async function testReturnRefresh(source){
  const h=createHarness(source);
  await h.gps();
  await h.event('#pickupBtn','click');
  const count=h.logs().length;
  h.visibility('hidden');
  assert(h.timers.size===0,'Hidden page pauses intervals');
  const pending=h.visibility('visible');
  h.focus();
  assert(h.gpsRequests.length===1,'Visibility and focus share one GPS request');
  assert(h.gpsRequests[0].options.maximumAge===0&&h.gpsRequests[0].options.enableHighAccuracy===true,'Return requests fresh high-accuracy GPS');
  assert(h.logs().length===count,'No stale reading is logged before GPS resolves');
  h.gpsRequests[0].success({coords:{latitude:19,longitude:-101.0005,accuracy:5}});
  await pending;
  assert(h.journey().status==='READY'&&h.logs()[0].message.includes('volver'),'Fresh GPS promotes and logs immediately');
  assert(h.timers.size===2,'Resume restores one measurement timer and countdown');
  const resumedCount=h.logs().length;
  await h.advance(29000);
  assert(h.logs().length===resumedCount,'Next periodic check waits 30s after resume');
  await h.advance(1000);
  assert(h.logs().length===resumedCount+1,'Periodic logging resumes');

  h.visibility('hidden');
  const failed=h.visibility('visible');
  h.gpsRequests[1].error({code:1,message:'Permission denied'});
  await failed;
  assert(h.logs()[0].distance===null&&h.logs()[0].message.includes('no disponible')&&h.journey().status==='READY','Failure records no distance and retains state');
  assert(h.element('#distanceValue').textContent==='—','Failure does not display old distance as current');
  h.visibility('hidden');
  const obsolete=h.visibility('visible');
  h.visibility('hidden');
  const latest=h.visibility('visible');
  h.gpsRequests[2].success({coords:{latitude:19,longitude:-101,accuracy:5}});
  await obsolete;
  assert(h.journey().status==='READY','Discard callback from a previous return');
  h.gpsRequests[3].success({coords:{latitude:19,longitude:-101.05,accuracy:5}});
  await latest;
  assert(h.journey().status==='READY'&&h.logs()[0].distance>1000,'Current return respects monotonic status');

  h.visibility('hidden');
  const resetPending=h.visibility('visible');
  await h.event('#resetJourneyBtn','click');
  const resetCount=h.logs().length;
  h.gpsRequests[4].success({coords:{latitude:19,longitude:-101,accuracy:5}});
  await resetPending;
  assert(!h.journey().active&&h.logs().length===resetCount&&h.timers.size===0,'Reset discards pending GPS and does not restart timer');

  const manual=createHarness(source);
  await manual.event('#manualDistanceToggle','change',{target:{checked:true}});
  await manual.event('#pickupBtn','click');
  manual.visibility('hidden');
  await manual.visibility('visible');
  await manual.focus();
  assert(manual.gpsRequests.length===0&&manual.logs().length===2&&manual.logs()[0].distance===1000,'Manual resume recalculates once without GPS');
  await manual.advance(3000);
  await manual.pageshow();
  assert(manual.logs().length===3,'Back-forward cache restoration refreshes');
  return ['Hidden pauses timers','Focus/visibility deduplication','Fresh GPS required','Immediate resume transition/log','30s cadence restored','GPS failure without stale distance','Old callback ignored','Monotonic resume status','Reset during resume','Manual resume without GPS','pageshow restoration'];
}


async function testEarlyActivation(source){
  const h=createHarness(source);
  assert(h.element('#pickupBtn').disabled,'GPS measurement required before activating');
  await h.event('#manualDistanceToggle','change',{target:{checked:true}});
  h.element('#manualDistanceInput').value='50000';
  await h.event('#manualDistanceInput','change');
  assert(!h.element('#pickupBtn').disabled,'Can activate from 50 km');
  assert(h.element('#pickupBtn')['data-state']==='IDLE','No active halo before start');
  await h.event('#pickupBtn','click');
  assert(h.journey().active&&h.journey().status==='OUTSIDE'&&h.element('#pickupBtn')['data-state']==='OUTSIDE','Outside activation has red state');
  assert(h.logs()[0].status==='OUTSIDE'&&h.logs()[0].distance===50000,'Initial OUTSIDE history');
  await h.advance(30000);
  assert(h.logs()[0].status==='OUTSIDE'&&h.logs()[0].distance===50000&&h.logs().length===2,'Outside periodic history');
  const restored=createHarness(source,h.stored);
  assert(restored.journey().status==='OUTSIDE'&&restored.element('#pickupBtn')['data-state']==='OUTSIDE','Restore outside active halo');
  const move=async meters=>{h.element('#manualDistanceInput').value=String(meters);await h.event('#manualDistanceInput','change');};
  for(const [distance,status] of [[1000,'WAITING'],[100,'READY'],[20,'AT_GATE']]){
    await move(distance);
    assert(h.journey().status===status&&h.element('#pickupBtn')['data-state']===status&&h.logs()[0].status===status&&h.logs()[0].distance===distance,'State, halo and history transition together at '+status);
    const count=h.logs().length;
    await move(75000);
    assert(h.journey().status===status&&h.element('#pickupBtn')['data-state']===status&&h.logs().length===count,'Distance increase preserves '+status+' without false transition');
    await h.advance(30000);
    assert(h.logs()[0].distance===75000&&h.logs()[0].status===status,'Periodic actual distance preserves '+status);
  }
  await h.event('#resetJourneyBtn','click');
  assert(!h.journey().active&&h.element('#pickupBtn')['data-state']==='IDLE'&&!h.element('#pickupBtn').disabled,'Reset removes halo and allows distant restart');
  await h.event('#pickupBtn','click');
  assert(h.journey().status==='OUTSIDE','Restart far away returns OUTSIDE');
  const invalidStore=new Map([['nexusTutorConfigV1',JSON.stringify({school:{lat:null,lng:null}})]]);
  const noSchool=createHarness(source,invalidStore);
  await noSchool.event('#manualDistanceToggle','change',{target:{checked:true}});
  assert(noSchool.element('#pickupBtn').disabled,'Unset school does not become 0,0');

  const gps=createHarness(source);
  await gps.gps(19,-101.05);
  await gps.event('#pickupBtn','click');
  assert(gps.journey().status==='OUTSIDE','GPS can start outside');
  gps.visibility('hidden');
  const resume=gps.visibility('visible');
  gps.gpsRequests[0].success({coords:{latitude:19,longitude:-101.005,accuracy:5}});
  await resume;
  assert(gps.journey().status==='WAITING'&&gps.element('#pickupBtn')['data-state']==='WAITING','Resume from outside enters WAITING and updates halo');
  const loss=gps.visibility('hidden');
  const fail=gps.visibility('visible');
  gps.gpsRequests[1].error({code:1});
  await fail;
  assert(gps.journey().status==='WAITING'&&gps.element('#pickupBtn')['data-state']==='WAITING'&&gps.logs()[0].distance===null,'GPS failure preserves attained halo and records no distance');
  return ['Fresh measurement required','50 km activation','Idle halo','Active OUTSIDE and initial log','OUTSIDE 30s log','OUTSIDE reload','All threshold halos and immediate logs','All states retained at 75 km','Periodic actual distance','Reset halo and distant restart','School coordinates required','GPS outside activation','Resume enters range','GPS loss distinct from range'];
}

const source=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
const checks=[...await testHistory(source),...await testDistanceControls(source),...await testReturnRefresh(source),...await testEarlyActivation(source)];
console.log(`Historial: ${checks.length} comprobaciones correctas.`);
