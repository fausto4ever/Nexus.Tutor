(()=>{
  'use strict';
  const DEFAULTS=window.NEXUS_TUTOR_DEFAULTS||{};
  const RUNTIME=window.NEXUS_TUTOR_RUNTIME;
  const LOCATION=window.NEXUS_TUTOR_LOCATION;
  const DISTANCE=window.NEXUS_TUTOR_DISTANCE;
  const TELEMETRY=window.NEXUS_TUTOR_TELEMETRY;
  const VIEW=window.NEXUS_TUTOR_JOURNEY_VIEW;
  if(!RUNTIME)throw new Error('RUNTIME_NOT_LOADED');
  if(!LOCATION)throw new Error('LOCATION_SERVICE_NOT_LOADED');
  if(!DISTANCE)throw new Error('DISTANCE_SERVICE_NOT_LOADED');
  if(!TELEMETRY)throw new Error('TELEMETRY_SERVICE_NOT_LOADED');
  if(!VIEW)throw new Error('JOURNEY_VIEW_NOT_LOADED');

  const CFG_KEY='nexusTutorConfigV1',JOURNEY_KEY='nexusTutorJourneyV1';
  const JOURNEY_TTL_MS=12*60*60*1000;
  const DELIVERY_WAIT_MS=3*60*1000;
  const STATUS_RANK={OUTSIDE:0,WAITING:1,READY:2,AT_GATE:3,COMPLETED:4};
  const els=VIEW.elements;

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function mergeConfig(base,stored){return{...clone(base),...stored,school:{...(base.school||{}),...(stored?.school||{})},thresholds:{...(base.thresholds||{}),...(stored?.thresholds||{})}};}
  function loadConfig(){return mergeConfig(DEFAULTS,RUNTIME.storage.read(CFG_KEY,{}));}
  function loadJourney(){return RUNTIME.storage.read(JOURNEY_KEY,{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null});}
  function isJourneyExpired(item,now=Date.now()){
    if(!item?.active)return false;
    const startedAt=Date.parse(item.startedAt||'');
    return !Number.isFinite(startedAt)||now-startedAt>=JOURNEY_TTL_MS;
  }

  let config=loadConfig();
  const storedJourney=loadJourney();
  const expiredJourneyAtStartup=isJourneyExpired(storedJourney)?clone(storedJourney):null;
  let journey=expiredJourneyAtStartup?{
    ...storedJourney,active:false,status:'OUTSIDE',startedAt:null,expiredAt:new Date().toISOString()
  }:storedJourney;
  if(expiredJourneyAtStartup)RUNTIME.storage.write(JOURNEY_KEY,journey);
  if(!expiredJourneyAtStartup&&journey.active&&journey.status==='AT_GATE'&&!Number.isFinite(Date.parse(journey.atGateAt||''))){
    journey.atGateAt=new Date().toISOString();
    RUNTIME.storage.write(JOURNEY_KEY,journey);
  }
  const recoveredActiveAtStartup=Boolean(journey.active&&journey.status!=='COMPLETED');
  function saveJourney(){RUNTIME.storage.write(JOURNEY_KEY,journey);}

  let currentPosition=LOCATION.current();
  let latestDistance=Number.isFinite(Number(journey.lastDistance))?Number(journey.lastDistance):null;
  let latestSource=journey.lastSource||'direct';
  let latestAccuracy=Number.isFinite(Number(journey.lastAccuracy))?Number(journey.lastAccuracy):null;
  let measurementState=recoveredActiveAtStartup&&Number.isFinite(latestDistance)?'RECALCULATING':Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';
  let manualDistanceEnabled=false;
  let manualDistance=Math.max(0,Number(config.thresholds?.waitingMeters)||1000);
  let refreshTimer=null,countdownTimer=null,nextRefreshAt=null,refreshInFlight=false;
  let resumeRun=null,lastResumeAt=-Infinity,measurementRevision=0;
  let onlineState=navigator.onLine!==false;

  function schoolReady(){return DISTANCE.isReady(config.school);}
  function pollSecondsForStatus(status=journey.status){
    const base=Math.max(5,Number(config.refreshSeconds)||30);
    if(status==='OUTSIDE')return Math.max(60,base*2);
    if(status==='WAITING')return base;
    if(status==='READY'||status==='AT_GATE')return Math.max(5,Math.min(10,base));
    return null;
  }
  function telemetrySnapshot(){
    const coords=currentPosition?.coords||{};
    return{
      journeyId:journey.id||null,journeyStatus:journey.status||'OUTSIDE',measurementState,
      distanceMeters:Number.isFinite(latestDistance)?latestDistance:null,accuracyMeters:Number.isFinite(latestAccuracy)?latestAccuracy:null,source:latestSource,
      pollIntervalSeconds:journey.active?pollSecondsForStatus():null,visibility:document.visibilityState||'visible',online:onlineState,
      latitude:Number.isFinite(coords.latitude)?coords.latitude:null,longitude:Number.isFinite(coords.longitude)?coords.longitude:null
    };
  }
  function recordTelemetry(event,extra={}){TELEMETRY.record(event,{...telemetrySnapshot(),...extra});}
  function addLog(status,message,distance){VIEW.renderLog(TELEMETRY.addLog(status,message,distance));}
  function renderLog(){VIEW.renderLog(TELEMETRY.loadLog());}

  function candidateStatus(distance){
    const thresholds=config.thresholds;
    if(distance<=Number(thresholds.atGateMeters))return'AT_GATE';
    if(distance<=Number(thresholds.readyMeters))return'READY';
    if(distance<=Number(thresholds.waitingMeters))return'WAITING';
    return'OUTSIDE';
  }
  function render(){
    const rawStatus=Number.isFinite(latestDistance)?candidateStatus(latestDistance):'OUTSIDE';
    const freshEnough=manualDistanceEnabled||measurementState==='FRESH';
    const canStart=schoolReady()&&(manualDistanceEnabled||currentPosition)&&Number.isFinite(latestDistance)&&freshEnough;
    VIEW.render({config,journey,currentPosition,latestDistance,latestSource,latestAccuracy,measurementState,manualDistanceEnabled,manualDistance,onlineState,schoolReady:schoolReady(),rawStatus,canStart});
  }

  function syncManualControls(){VIEW.syncManualControls(manualDistance);}
  function parsedManualInput(){return VIEW.manualInput();}
  function applyManualDistance(value){
    if(!Number.isSafeInteger(value)||value<0)return;
    measurementRevision++;manualDistance=value;els.manualDistanceInput.value=String(value);
    if(!manualDistanceEnabled){syncManualControls();return;}
    latestDistance=value;latestSource='manual';latestAccuracy=null;measurementState='FRESH';journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=value;journey.lastSource='manual';journey.lastAccuracy=null;saveJourney();
    if(journey.active)promoteStatus(candidateStatus(value),value);
    recordTelemetry('MANUAL_DISTANCE_CHANGED',{distanceMeters:value});render();
  }
  function onManualDistanceChange(){const value=parsedManualInput();if(value===null){els.manualDistanceInput.value=String(manualDistance);return;}applyManualDistance(value);}
  function adjustManualDistance(direction){const base=parsedManualInput()??manualDistance;applyManualDistance(Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,base+direction*VIEW.manualStep())));}

  function measureDistance(){
    return DISTANCE.measure({position:currentPosition,school:config.school,mode:config.distanceMode,manualEnabled:manualDistanceEnabled,manualMeters:manualDistance,routeTimeoutMs:8000});
  }
  function ensureAtGateTimestamp(){
    if(!journey.active||journey.status!=='AT_GATE')return false;
    if(Number.isFinite(Date.parse(journey.atGateAt||'')))return true;
    journey.atGateAt=new Date().toISOString();saveJourney();return true;
  }
  function deliveryRemainingMs(now=Date.now()){
    if(!journey.active||journey.status!=='AT_GATE')return null;
    ensureAtGateTimestamp();
    const atGateAt=Date.parse(journey.atGateAt||'');
    return Number.isFinite(atGateAt)?Math.max(0,DELIVERY_WAIT_MS-(now-atGateAt)):DELIVERY_WAIT_MS;
  }
  function promoteStatus(candidate,distance){
    if(!journey.active||journey.status==='COMPLETED')return;
    const current=journey.status||'OUTSIDE';
    if((STATUS_RANK[candidate]||0)>(STATUS_RANK[current]||0)){
      journey.status=candidate;
      if(candidate==='AT_GATE'&&!Number.isFinite(Date.parse(journey.atGateAt||'')))journey.atGateAt=new Date().toISOString();
      saveJourney();addLog(candidate,manualDistanceEnabled?'Avance por simulación manual':'Avance automático',distance);recordTelemetry('STATUS_CHANGED',{fromStatus:current,toStatus:candidate,distanceMeters:distance});
      if(document.visibilityState!=='hidden')startRefreshLoop();
    }
  }
  async function refreshMeasurement({allowPromotion=true,recordMeasurement=false,measurementReason='Medición periódica'}={}){
    const measuredJourney=journey,revision=++measurementRevision;
    try{
      const result=await measureDistance();
      if(journey!==measuredJourney||revision!==measurementRevision)return;
      latestDistance=result.meters;latestSource=result.source;latestAccuracy=result.accuracy;measurementState='FRESH';
      journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=latestDistance;journey.lastSource=latestSource;journey.lastAccuracy=latestAccuracy;saveJourney();
      if(allowPromotion&&journey.active)promoteStatus(candidateStatus(latestDistance),latestDistance);
      if(recordMeasurement&&journey.active){
        const sourceLabel={manual:'simulación manual',direct:'GPS · distancia directa',driving:'ruta en auto','direct-fallback':'ruta no disponible · distancia directa'};
        addLog(journey.status,`${measurementReason} · ${sourceLabel[result.source]||result.source}`,latestDistance);
      }
      recordTelemetry('MEASUREMENT_OK',{reason:measurementReason,distanceMeters:latestDistance,accuracyMeters:latestAccuracy});render();
    }catch(error){
      if(journey!==measuredJourney||revision!==measurementRevision)return;
      console.warn(error);measurementState='UNAVAILABLE';
      if(recordMeasurement&&journey.active)addLog(journey.status,`${measurementReason} no disponible`,null);
      recordTelemetry('MEASUREMENT_ERROR',{reason:measurementReason,error:String(error?.message||error)});render();
    }
  }

  function startJourney(){
    if(els.pickupBtn.disabled||journey.active)return;
    const initialStatus=candidateStatus(latestDistance),startedAt=new Date().toISOString();
    journey={active:true,id:`journey-${Date.now()}`,status:initialStatus,startedAt,atGateAt:initialStatus==='AT_GATE'?startedAt:null,lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();
    addLog(initialStatus,initialStatus==='OUTSIDE'?'Trayecto iniciado · lejos del destino':manualDistanceEnabled?'Inicio de prueba manual':'Inicio de prueba',latestDistance);recordTelemetry('JOURNEY_STARTED',{distanceMeters:latestDistance});refreshMeasurement({allowPromotion:true});startRefreshLoop();render();
  }
  function completeJourney(options={}){
    if(!journey.active||journey.status==='COMPLETED')return;
    const automatic=Boolean(options?.automatic),from=journey.status;
    journey.status='COMPLETED';journey.completedAt=new Date().toISOString();journey.completedAutomatically=automatic;saveJourney();stopRefreshLoop();
    addLog('COMPLETED',automatic?'Solicitud completada automáticamente después de 3 min en puerta':'Solicitud completada',latestDistance);
    recordTelemetry('DELIVERY_COMPLETED',{fromStatus:from,automatic,waitSeconds:automatic?DELIVERY_WAIT_MS/1000:null,atGateAt:journey.atGateAt||null});render();
  }
  function completeDeliveryIfDue(reason='delivery-timeout'){
    if(!journey.active||journey.status!=='AT_GATE')return false;
    const remaining=deliveryRemainingMs();
    if(remaining===null||remaining>0)return false;
    recordTelemetry('DELIVERY_WAIT_ELAPSED',{reason,waitSeconds:DELIVERY_WAIT_MS/1000,atGateAt:journey.atGateAt||null});
    completeJourney({automatic:true});return true;
  }
  function resetJourney(){recordTelemetry('JOURNEY_RESET');journey={active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();stopRefreshLoop();if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:false});else render();}
  function expireJourneyIfNeeded(reason='ttl-check'){
    if(!isJourneyExpired(journey))return false;
    const previous={id:journey.id||null,status:journey.status||'OUTSIDE',startedAt:journey.startedAt||null};
    journey={active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy,expiredAt:new Date().toISOString()};
    saveJourney();measurementRevision++;measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';stopRefreshLoop();
    addLog('OUTSIDE','Recorrido vencido después de 12 horas',latestDistance);
    recordTelemetry('JOURNEY_EXPIRED',{reason,ttlHours:12,previousJourneyId:previous.id,previousStatus:previous.status,previousStartedAt:previous.startedAt});render();
    return true;
  }
  function startRefreshLoop(){
    stopRefreshLoop();if(!journey.active||journey.status==='COMPLETED'||expireJourneyIfNeeded('poll-start')||completeDeliveryIfDue('poll-start'))return;
    const seconds=pollSecondsForStatus();if(!seconds)return;
    nextRefreshAt=Date.now()+seconds*1000;
    refreshTimer=setInterval(async()=>{
      if(expireJourneyIfNeeded('poll-tick')||completeDeliveryIfDue('poll-tick')||refreshInFlight)return;
      refreshInFlight=true;
      try{await refreshMeasurement({allowPromotion:true,recordMeasurement:true});}
      finally{refreshInFlight=false;if(refreshTimer)nextRefreshAt=Date.now()+pollSecondsForStatus()*1000;}
    },seconds*1000);
    countdownTimer=setInterval(updateCountdown,1000);recordTelemetry('POLL_RATE_CHANGED',{pollIntervalSeconds:seconds});updateCountdown();
  }
  function stopRefreshLoop(){clearInterval(refreshTimer);clearInterval(countdownTimer);refreshTimer=countdownTimer=null;nextRefreshAt=null;VIEW.setCountdown('—');}
  function updateCountdown(){
    if(completeDeliveryIfDue('delivery-countdown'))return;
    VIEW.setCountdown(nextRefreshAt?`${Math.max(0,Math.ceil((nextRefreshAt-Date.now())/1000))} s`:'—');
  }
  function setManualDistanceEnabled(enabled){
    measurementRevision++;manualDistanceEnabled=Boolean(enabled);
    if(manualDistanceEnabled){syncManualControls();latestDistance=manualDistance;latestSource='manual';latestAccuracy=null;measurementState='FRESH';journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=latestDistance;journey.lastSource=latestSource;journey.lastAccuracy=null;saveJourney();if(journey.active)promoteStatus(candidateStatus(latestDistance),latestDistance);recordTelemetry('MANUAL_MODE_ON');render();}
    else{measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';latestSource=journey.lastSource||'direct';recordTelemetry('MANUAL_MODE_OFF');render();if(currentPosition&&schoolReady())refreshMeasurement({allowPromotion:journey.active});}
  }

  function watchGps(){
    if(!LOCATION.supported()){measurementState='UNAVAILABLE';VIEW.setActionHint('Este navegador no ofrece geolocalización.');recordTelemetry('GPS_NOT_AVAILABLE');render();return;}
    LOCATION.watch({
      onPosition:position=>{
        const recovering=measurementState==='UNAVAILABLE';currentPosition=position;
        if(!resumeRun&&schoolReady()&&!manualDistanceEnabled&&(!journey.active||recovering))refreshMeasurement({allowPromotion:journey.active,recordMeasurement:journey.active&&recovering,measurementReason:recovering?'GPS recuperado':'Medición GPS'});
      },
      onError:error=>{
        console.warn(error);if(manualDistanceEnabled)return;
        currentPosition=null;measurementState='UNAVAILABLE';measurementRevision++;recordTelemetry('GPS_WATCH_ERROR',{errorCode:error?.code??null,error:String(error?.message||'GPS error')});render();
      },
      options:{enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    });
  }
  async function refreshOnReturn(){
    if(document.visibilityState==='hidden'||resumeRun||Date.now()-lastResumeAt<2000||!schoolReady())return;
    if(expireJourneyIfNeeded('resume')||completeDeliveryIfDue('resume'))return;
    const run={journey,manual:manualDistanceEnabled};resumeRun=run;lastResumeAt=Date.now();measurementRevision++;stopRefreshLoop();recordTelemetry('APP_RESUME');
    const isCurrent=()=>resumeRun===run&&journey===run.journey&&manualDistanceEnabled===run.manual&&document.visibilityState!=='hidden';
    try{
      if(!run.manual){currentPosition=null;measurementState=Number.isFinite(latestDistance)?'RECALCULATING':'UNAVAILABLE';render();recordTelemetry('GPS_RECALCULATING');const position=await LOCATION.fresh({enableHighAccuracy:true,maximumAge:0,timeout:15000});if(!isCurrent())return;currentPosition=position;}
      if(!isCurrent())return;
      await refreshMeasurement({allowPromotion:true,recordMeasurement:journey.active,measurementReason:'Medición al volver a la app'});
    }catch(error){
      if(!isCurrent())return;
      console.warn(error);currentPosition=null;measurementState='UNAVAILABLE';render();recordTelemetry('GPS_RESUME_ERROR',{error:String(error?.message||error)});if(journey.active)addLog(journey.status,'Medición al volver a la app no disponible',null);
    }finally{if(resumeRun===run){resumeRun=null;if(journey.active&&document.visibilityState!=='hidden'&&journey.status!=='COMPLETED')startRefreshLoop();}}
  }
  function onVisibilityChange(){if(document.visibilityState==='hidden'){recordTelemetry('APP_HIDDEN');resumeRun=null;lastResumeAt=-Infinity;measurementRevision++;if(!manualDistanceEnabled&&Number.isFinite(latestDistance))measurementState='STALE';stopRefreshLoop();render();}else return refreshOnReturn();}
  function setOnlineState(value){const next=Boolean(value);if(next===onlineState){VIEW.renderConnection(onlineState);return;}onlineState=next;recordTelemetry(next?'INTERNET_ONLINE':'INTERNET_OFFLINE');render();}
  function onConfigChanged(payload){
    config=mergeConfig(DEFAULTS,payload?.config||RUNTIME.storage.read(CFG_KEY,{}));
    measurementRevision++;measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';render();
    if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:journey.active,measurementReason:'Configuración actualizada'});
  }
  function downloadTelemetry(){
    const payload={schema:'nexus-tutor-telemetry-v1',version:DEFAULTS.version||null,exportedAt:new Date().toISOString(),config,journey,events:TELEMETRY.loadTelemetry().slice().reverse()};
    TELEMETRY.download(payload);
    recordTelemetry('TELEMETRY_EXPORTED');
  }
  function installSw(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);}

  els.pickupBtn.addEventListener('click',startJourney);
  els.resetJourneyBtn.addEventListener('click',resetJourney);
  els.clearLogBtn.addEventListener('click',()=>VIEW.renderLog(TELEMETRY.clearLog()));
  els.downloadTelemetryBtn.addEventListener('click',downloadTelemetry);
  els.manualDistanceToggle.addEventListener('change',event=>setManualDistanceEnabled(event.target.checked));
  els.manualDistanceInput.addEventListener('change',onManualDistanceChange);
  els.manualDistanceMinus.addEventListener('click',()=>adjustManualDistance(-1));
  els.manualDistancePlus.addEventListener('click',()=>adjustManualDistance(1));
  els.manualDistanceStep.addEventListener('change',syncManualControls);
  window.addEventListener('focus',refreshOnReturn);
  window.addEventListener('pageshow',event=>{if(event.persisted)return refreshOnReturn();});
  window.addEventListener('online',()=>setOnlineState(true));
  window.addEventListener('offline',()=>setOnlineState(false));
  document.addEventListener('visibilitychange',onVisibilityChange);
  RUNTIME.events.on('config:changed',onConfigChanged);
  window.NEXUS_TUTOR_COMPLETE_JOURNEY=completeJourney;

  syncManualControls();renderLog();render();
  if(expiredJourneyAtStartup){
    addLog('OUTSIDE','Recorrido vencido después de 12 horas',latestDistance);
    recordTelemetry('JOURNEY_EXPIRED',{reason:'startup',ttlHours:12,previousJourneyId:expiredJourneyAtStartup.id||null,previousStatus:expiredJourneyAtStartup.status||'OUTSIDE',previousStartedAt:expiredJourneyAtStartup.startedAt||null});
  }else if(recoveredActiveAtStartup){
    recordTelemetry('JOURNEY_RECOVERED',{ttlHours:12,startedAt:journey.startedAt||null});
    completeDeliveryIfDue('startup');
  }else recordTelemetry('APP_LOADED');
  watchGps();installSw();
  if(journey.active&&journey.status!=='COMPLETED'&&recoveredActiveAtStartup&&document.visibilityState!=='hidden')refreshOnReturn();
  else if(journey.active&&document.visibilityState!=='hidden'&&journey.status!=='COMPLETED')startRefreshLoop();
})();
