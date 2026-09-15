(()=>{
  'use strict';
  const DEFAULTS=window.NEXUS_TUTOR_DEFAULTS||{};
  const RUNTIME=window.NEXUS_TUTOR_RUNTIME;
  const LOCATION=window.NEXUS_TUTOR_LOCATION;
  if(!RUNTIME)throw new Error('RUNTIME_NOT_LOADED');
  if(!LOCATION)throw new Error('LOCATION_SERVICE_NOT_LOADED');

  const CFG_KEY='nexusTutorConfigV1',JOURNEY_KEY='nexusTutorJourneyV1',LOG_KEY='nexusTutorLogV1',TELEMETRY_KEY='nexusTutorTelemetryV1';
  const STATUS_RANK={OUTSIDE:0,WAITING:1,READY:2,AT_GATE:3,COMPLETED:4};
  const $=selector=>RUNTIME.dom.one(selector);
  RUNTIME.dom.require([
    '#schoolName','#schoolLock','#schoolCoords','#connectionBadge','#distanceValue','#distanceUnit','#accuracyValue','#distanceSource','#distanceProgress',
    '#waitingMarker','#readyMarker','#gateMarker','#waitingLabel','#readyLabel','#gateLabel','#statusPill','#statusMessage','#countdown','#lastUpdate',
    '#pickupBtn','#pickupBtnText','#actionHint','#resetJourneyBtn','#eventLog','#clearLogBtn','#downloadTelemetryBtn',
    '#manualDistanceToggle','#manualDistanceControls','#manualDistanceInput','#manualDistanceMinus','#manualDistancePlus','#manualDistanceStep'
  ]);

  const els={
    schoolName:$('#schoolName'),schoolLock:$('#schoolLock'),schoolCoords:$('#schoolCoords'),connectionBadge:$('#connectionBadge'),distanceValue:$('#distanceValue'),distanceUnit:$('#distanceUnit'),accuracyValue:$('#accuracyValue'),distanceSource:$('#distanceSource'),distanceProgress:$('#distanceProgress'),waitingMarker:$('#waitingMarker'),readyMarker:$('#readyMarker'),gateMarker:$('#gateMarker'),waitingLabel:$('#waitingLabel'),readyLabel:$('#readyLabel'),gateLabel:$('#gateLabel'),statusPill:$('#statusPill'),statusMessage:$('#statusMessage'),countdown:$('#countdown'),lastUpdate:$('#lastUpdate'),pickupBtn:$('#pickupBtn'),pickupBtnText:$('#pickupBtnText'),actionHint:$('#actionHint'),resetJourneyBtn:$('#resetJourneyBtn'),eventLog:$('#eventLog'),clearLogBtn:$('#clearLogBtn'),downloadTelemetryBtn:$('#downloadTelemetryBtn'),manualDistanceToggle:$('#manualDistanceToggle'),manualDistanceControls:$('#manualDistanceControls'),manualDistanceInput:$('#manualDistanceInput'),manualDistanceMinus:$('#manualDistanceMinus'),manualDistancePlus:$('#manualDistancePlus'),manualDistanceStep:$('#manualDistanceStep')
  };

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function mergeConfig(base,stored){return{...clone(base),...stored,school:{...(base.school||{}),...(stored?.school||{})},thresholds:{...(base.thresholds||{}),...(stored?.thresholds||{})}};}
  function loadConfig(){return mergeConfig(DEFAULTS,RUNTIME.storage.read(CFG_KEY,{}));}
  function loadJourney(){return RUNTIME.storage.read(JOURNEY_KEY,{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null});}
  function saveJourney(){RUNTIME.storage.write(JOURNEY_KEY,journey);}
  function loadLog(){return RUNTIME.storage.read(LOG_KEY,[]);}
  function saveLog(items){RUNTIME.storage.write(LOG_KEY,items.slice(0,60));}
  function loadTelemetry(){return RUNTIME.storage.read(TELEMETRY_KEY,[]);}
  function saveTelemetry(items){RUNTIME.storage.write(TELEMETRY_KEY,items.slice(0,1000));}

  let config=loadConfig();
  let journey=loadJourney();
  let currentPosition=LOCATION.current();
  let latestDistance=Number.isFinite(Number(journey.lastDistance))?Number(journey.lastDistance):null;
  let latestSource=journey.lastSource||'direct';
  let latestAccuracy=Number.isFinite(Number(journey.lastAccuracy))?Number(journey.lastAccuracy):null;
  let measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';
  let manualDistanceEnabled=false;
  let manualDistance=Math.max(0,Number(config.thresholds?.waitingMeters)||1000);
  let refreshTimer=null,countdownTimer=null,nextRefreshAt=null,refreshInFlight=false;
  let resumeRun=null,lastResumeAt=-Infinity,measurementRevision=0;
  let onlineState=navigator.onLine!==false;

  function pollSecondsForStatus(status=journey.status){
    const base=Math.max(5,Number(config.refreshSeconds)||30);
    if(status==='OUTSIDE')return Math.max(60,base*2);
    if(status==='WAITING')return base;
    if(status==='READY'||status==='AT_GATE')return Math.max(5,Math.min(10,base));
    return null;
  }
  function recordTelemetry(event,extra={}){
    const items=loadTelemetry(),coords=currentPosition?.coords||{};
    items.unshift({
      at:new Date().toISOString(),journeyId:journey.id||null,event,journeyStatus:journey.status||'OUTSIDE',measurementState,
      distanceMeters:Number.isFinite(latestDistance)?latestDistance:null,accuracyMeters:Number.isFinite(latestAccuracy)?latestAccuracy:null,source:latestSource,
      pollIntervalSeconds:journey.active?pollSecondsForStatus():null,visibility:document.visibilityState||'visible',online:onlineState,
      latitude:Number.isFinite(coords.latitude)?coords.latitude:null,longitude:Number.isFinite(coords.longitude)?coords.longitude:null,...extra
    });
    saveTelemetry(items);
  }
  function addLog(status,message,distance){
    const items=loadLog();items.unshift({at:new Date().toISOString(),status,message,distance:Number.isFinite(distance)?distance:null});saveLog(items);renderLog();
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function formatDistance(value){if(!Number.isFinite(Number(value)))return'—';const meters=Number(value);return meters>=1000?`${(meters/1000).toFixed(meters>=10000?0:1)} km`:`${Math.round(meters)} m`;}
  function renderLog(){
    const items=loadLog();
    if(!items.length){els.eventLog.innerHTML='<div class="empty-log">Sin eventos todavía.</div>';return;}
    els.eventLog.innerHTML=items.map(item=>{const time=new Date(item.at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});const distance=item.distance==null?'':` · ${formatDistance(item.distance)}`;return `<div class="event-item" data-status="${escapeHtml(item.status)}"><span class="event-dot"></span><span><strong>${escapeHtml(item.status)}</strong> ${escapeHtml(item.message||'')}${escapeHtml(distance)}</span><span class="event-time">${time}</span></div>`;}).join('');
  }
  function schoolReady(){
    const lat=config.school?.lat,lng=config.school?.lng;
    return lat!=null&&lng!=null&&String(lat).trim()!==''&&String(lng).trim()!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;
  }
  function haversine(lat1,lon1,lat2,lon2){
    const R=6371000,toRad=value=>value*Math.PI/180,p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function candidateStatus(distance){
    const thresholds=config.thresholds;
    if(distance<=Number(thresholds.atGateMeters))return'AT_GATE';
    if(distance<=Number(thresholds.readyMeters))return'READY';
    if(distance<=Number(thresholds.waitingMeters))return'WAITING';
    return'OUTSIDE';
  }
  function linearPercent(distance){const max=Math.max(1,Number(config.thresholds.waitingMeters)||1);return Math.max(0,Math.min(100,100-(Number(distance)/max*100)));}
  function positionMarkers(){
    const max=Math.max(1,Number(config.thresholds.waitingMeters)||1);
    const place=(element,distance)=>{const pct=Math.max(0,Math.min(100,100-(Number(distance)/max*100)));element.style.left=`${pct}%`;};
    place(els.waitingMarker,config.thresholds.waitingMeters);place(els.readyMarker,config.thresholds.readyMeters);place(els.gateMarker,config.thresholds.atGateMeters);
  }
  function renderConnection(){
    els.connectionBadge.textContent=onlineState?'● En línea':'● Sin internet';
    els.connectionBadge.className=`badge connection-badge ${onlineState?'badge-ok':'badge-warn'}`;
  }

  function manualStep(){const step=Number(els.manualDistanceStep.value);return[1,10,100,1000].includes(step)?step:10;}
  function syncManualControls(){
    if(document.activeElement!==els.manualDistanceInput)els.manualDistanceInput.value=String(manualDistance);
    const step=manualStep();els.manualDistanceMinus.disabled=manualDistance===0;
    els.manualDistanceMinus.setAttribute('aria-label',`Restar ${step} metros`);els.manualDistancePlus.setAttribute('aria-label',`Sumar ${step} metros`);
  }
  function parsedManualInput(){const raw=els.manualDistanceInput.value.trim(),value=Number(raw);return raw!==''&&Number.isSafeInteger(value)&&value>=0?value:null;}
  function applyManualDistance(value){
    if(!Number.isSafeInteger(value)||value<0)return;
    measurementRevision++;manualDistance=value;els.manualDistanceInput.value=String(value);
    if(!manualDistanceEnabled){syncManualControls();return;}
    latestDistance=value;latestSource='manual';latestAccuracy=null;measurementState='FRESH';journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=value;journey.lastSource='manual';journey.lastAccuracy=null;saveJourney();
    if(journey.active)promoteStatus(candidateStatus(value),value);
    recordTelemetry('MANUAL_DISTANCE_CHANGED',{distanceMeters:value});render();
  }
  function onManualDistanceChange(){const value=parsedManualInput();if(value===null){els.manualDistanceInput.value=String(manualDistance);return;}applyManualDistance(value);}
  function adjustManualDistance(direction){const base=parsedManualInput()??manualDistance;applyManualDistance(Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,base+direction*manualStep())));}

  async function measureDistance(){
    if(!schoolReady())throw new Error('SCHOOL_NOT_READY');
    if(manualDistanceEnabled)return{meters:manualDistance,source:'manual',accuracy:null};
    if(!currentPosition)throw new Error('GPS_NOT_READY');
    const {latitude,longitude,accuracy}=currentPosition.coords;
    const direct=haversine(latitude,longitude,Number(config.school.lat),Number(config.school.lng));
    if(config.distanceMode!=='driving')return{meters:direct,source:'direct',accuracy:Number.isFinite(accuracy)?accuracy:null};
    let timeoutId=null;
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${config.school.lng},${config.school.lat}?overview=false&steps=false`;
      const controller=typeof AbortController==='function'?new AbortController():null;
      if(controller)timeoutId=setTimeout(()=>controller.abort(),8000);
      const response=await fetch(url,{cache:'no-store',...(controller?{signal:controller.signal}:{})});
      if(!response.ok)throw new Error('ROUTE_HTTP_'+response.status);
      const data=await response.json(),meters=Number(data?.routes?.[0]?.distance);if(!Number.isFinite(meters))throw new Error('ROUTE_DISTANCE_INVALID');
      return{meters,source:'driving',accuracy:Number.isFinite(accuracy)?accuracy:null};
    }catch(error){
      console.warn('OSRM no disponible, usando distancia directa',error);
      return{meters:direct,source:'direct-fallback',accuracy:Number.isFinite(accuracy)?accuracy:null};
    }finally{
      if(timeoutId!=null)clearTimeout(timeoutId);
    }
  }
  function promoteStatus(candidate,distance){
    if(!journey.active||journey.status==='COMPLETED')return;
    const current=journey.status||'OUTSIDE';
    if((STATUS_RANK[candidate]||0)>(STATUS_RANK[current]||0)){
      journey.status=candidate;saveJourney();addLog(candidate,manualDistanceEnabled?'Avance por simulación manual':'Avance automático',distance);recordTelemetry('STATUS_CHANGED',{fromStatus:current,toStatus:candidate,distanceMeters:distance});
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

  function render(){
    els.schoolName.textContent=config.school?.name||'Escuela';els.waitingLabel.textContent=`${config.thresholds.waitingMeters} m`;els.readyLabel.textContent=`${config.thresholds.readyMeters} m`;els.gateLabel.textContent=`${config.thresholds.atGateMeters} m`;positionMarkers();renderConnection();
    if(schoolReady()){els.schoolLock.textContent='Fijada';els.schoolLock.className='badge badge-ok';els.schoolCoords.textContent=`${Number(config.school.lat).toFixed(6)}, ${Number(config.school.lng).toFixed(6)}`;}else{els.schoolLock.textContent='Sin fijar';els.schoolLock.className='badge badge-warn';els.schoolCoords.textContent='Configura la ubicación fija de la escuela.';}
    if(Number.isFinite(latestDistance)){
      if(latestDistance>=1000){els.distanceValue.textContent=(latestDistance/1000).toFixed(latestDistance>=10000?0:1);els.distanceUnit.textContent='km';}else{els.distanceValue.textContent=Math.round(latestDistance);els.distanceUnit.textContent='m';}
      els.distanceProgress.style.width=`${linearPercent(latestDistance)}%`;
    }else{els.distanceValue.textContent='—';els.distanceUnit.textContent='m';els.distanceProgress.style.width='0%';}
    if(manualDistanceEnabled)els.accuracyValue.textContent='Simulada';else if(Number.isFinite(latestAccuracy))els.accuracyValue.textContent=`±${Math.round(latestAccuracy)} m${measurementState==='FRESH'?'':' · última'}`;else els.accuracyValue.textContent='—';
    if(measurementState==='RECALCULATING')els.distanceSource.textContent='↻ Recalculando ubicación…';
    else if(measurementState==='UNAVAILABLE'&&Number.isFinite(latestDistance))els.distanceSource.textContent='⚠ Última ubicación conocida';
    else if(measurementState==='STALE'&&Number.isFinite(latestDistance))els.distanceSource.textContent='Última ubicación conocida';
    else els.distanceSource.textContent=latestSource==='manual'?'Distancia manual':latestSource==='driving'?'Ruta en auto':latestSource==='direct-fallback'?'Ruta no disponible · directa':'Distancia directa';
    els.manualDistanceToggle.checked=manualDistanceEnabled;els.manualDistanceControls.classList.toggle('hidden',!manualDistanceEnabled);syncManualControls();

    const raw=Number.isFinite(latestDistance)?candidateStatus(latestDistance):'OUTSIDE',status=journey.active?journey.status:raw;
    const labels={OUTSIDE:'LEJOS · OUTSIDE',WAITING:'EN CAMINO · WAITING',READY:'MUY CERCA · READY',AT_GATE:'EN LA PUERTA · AT GATE',COMPLETED:'SOLICITUD COMPLETADA'};
    const classes={OUTSIDE:'status-outside',WAITING:'status-waiting',READY:'status-ready',AT_GATE:'status-gate',COMPLETED:'status-gate'};
    els.statusPill.textContent=labels[status]||status;els.statusPill.className=`status-pill ${classes[status]||'status-outside'}`;els.pickupBtn.setAttribute('data-state',journey.active?(status==='COMPLETED'?'AT_GATE':status):'IDLE');
    if(journey.active){
      const messages={OUTSIDE:'Aún te encuentras muy lejos del destino. Tu trayecto ya está activo; te avisaremos cuando estés cerca.',WAITING:'Ya estás dentro del rango de espera. Seguimos tu llegada.',READY:'Ya estás muy cerca del destino. Prepárate para la entrega.',AT_GATE:'Has llegado. Esperando la entrega del alumno.',COMPLETED:'Solicitud completada. ¡Que tengas un excelente día! Que les vaya muy bien.'};
      const freshness=measurementState==='RECALCULATING'?' Recalculando ubicación con la última distancia visible.':measurementState==='UNAVAILABLE'?' GPS no disponible; se conserva la última distancia conocida.':'';
      els.statusMessage.textContent=(messages[status]||'Trayecto activo.')+freshness;els.pickupBtn.disabled=true;els.pickupBtn.classList.add('is-active');
      els.pickupBtnText.textContent=status==='OUTSIDE'?'EN CAMINO':status==='AT_GATE'?'ESPERANDO ENTREGA':status==='COMPLETED'?'SOLICITUD COMPLETADA':labels[status];els.resetJourneyBtn.classList.remove('hidden');
      els.actionHint.textContent=status==='COMPLETED'?'Trayecto finalizado.':onlineState?'Prueba local: conexión disponible.':'Prueba local: sin conexión a internet.';
    }else{
      els.pickupBtn.classList.remove('is-active');els.resetJourneyBtn.classList.add('hidden');
      const freshEnough=manualDistanceEnabled||measurementState==='FRESH';
      const canStart=schoolReady()&&(manualDistanceEnabled||currentPosition)&&Number.isFinite(latestDistance)&&freshEnough;
      els.pickupBtn.disabled=!canStart;els.pickupBtnText.textContent='VOY POR MI HIJO';
      els.actionHint.textContent=!schoolReady()?'Primero fija la ubicación de la escuela.':measurementState==='RECALCULATING'?'Recalculando ubicación antes de iniciar…':measurementState==='UNAVAILABLE'&&Number.isFinite(latestDistance)?'GPS no disponible. Se muestra la última distancia, pero no se usará para iniciar.':!canStart?'Esperando una ubicación y distancia válidas…':'Puedes iniciar el trayecto desde cualquier distancia.';
      els.statusMessage.textContent=canStart?(raw==='OUTSIDE'?'Puedes iniciar cuando quieras. Aún estás lejos del destino; al comenzar te avisaremos cuando estés cerca.':'Puedes iniciar el trayecto. Ya estás dentro del rango operativo.'):'Configura la escuela y espera una medición fresca para iniciar.';
    }
    els.lastUpdate.textContent=journey.lastCheckedAt?new Date(journey.lastCheckedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  }

  function startJourney(){
    if(els.pickupBtn.disabled||journey.active)return;
    const initialStatus=candidateStatus(latestDistance);
    journey={active:true,id:`journey-${Date.now()}`,status:initialStatus,startedAt:new Date().toISOString(),lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();
    addLog(initialStatus,initialStatus==='OUTSIDE'?'Trayecto iniciado · lejos del destino':manualDistanceEnabled?'Inicio de prueba manual':'Inicio de prueba',latestDistance);recordTelemetry('JOURNEY_STARTED',{distanceMeters:latestDistance});refreshMeasurement({allowPromotion:true});startRefreshLoop();render();
  }
  function completeJourney(){if(!journey.active||journey.status==='COMPLETED')return;const from=journey.status;journey.status='COMPLETED';journey.completedAt=new Date().toISOString();saveJourney();stopRefreshLoop();addLog('COMPLETED','Solicitud completada',latestDistance);recordTelemetry('DELIVERY_COMPLETED',{fromStatus:from});render();}
  function resetJourney(){recordTelemetry('JOURNEY_RESET');journey={active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();stopRefreshLoop();if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:false});else render();}
  function startRefreshLoop(){
    stopRefreshLoop();if(!journey.active||journey.status==='COMPLETED')return;
    const seconds=pollSecondsForStatus();if(!seconds)return;
    nextRefreshAt=Date.now()+seconds*1000;
    refreshTimer=setInterval(async()=>{
      if(refreshInFlight)return;
      refreshInFlight=true;
      try{await refreshMeasurement({allowPromotion:true,recordMeasurement:true});}
      finally{refreshInFlight=false;if(refreshTimer)nextRefreshAt=Date.now()+pollSecondsForStatus()*1000;}
    },seconds*1000);
    countdownTimer=setInterval(updateCountdown,1000);recordTelemetry('POLL_RATE_CHANGED',{pollIntervalSeconds:seconds});updateCountdown();
  }
  function stopRefreshLoop(){clearInterval(refreshTimer);clearInterval(countdownTimer);refreshTimer=countdownTimer=null;nextRefreshAt=null;els.countdown.textContent='—';}
  function updateCountdown(){els.countdown.textContent=nextRefreshAt?`${Math.max(0,Math.ceil((nextRefreshAt-Date.now())/1000))} s`:'—';}
  function setManualDistanceEnabled(enabled){
    measurementRevision++;manualDistanceEnabled=Boolean(enabled);
    if(manualDistanceEnabled){syncManualControls();latestDistance=manualDistance;latestSource='manual';latestAccuracy=null;measurementState='FRESH';journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=latestDistance;journey.lastSource=latestSource;journey.lastAccuracy=null;saveJourney();if(journey.active)promoteStatus(candidateStatus(latestDistance),latestDistance);recordTelemetry('MANUAL_MODE_ON');render();}
    else{measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';latestSource=journey.lastSource||'direct';recordTelemetry('MANUAL_MODE_OFF');render();if(currentPosition&&schoolReady())refreshMeasurement({allowPromotion:journey.active});}
  }

  function watchGps(){
    if(!LOCATION.supported()){measurementState='UNAVAILABLE';els.actionHint.textContent='Este navegador no ofrece geolocalización.';recordTelemetry('GPS_NOT_AVAILABLE');return;}
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
  function onVisibilityChange(){if(document.visibilityState==='hidden'){recordTelemetry('APP_HIDDEN');resumeRun=null;lastResumeAt=-Infinity;measurementRevision++;if(!manualDistanceEnabled&&Number.isFinite(latestDistance))measurementState='STALE';stopRefreshLoop();}else return refreshOnReturn();}
  function setOnlineState(value){const next=Boolean(value);if(next===onlineState){renderConnection();return;}onlineState=next;recordTelemetry(next?'INTERNET_ONLINE':'INTERNET_OFFLINE');render();}
  function onConfigChanged(payload){
    config=mergeConfig(DEFAULTS,payload?.config||RUNTIME.storage.read(CFG_KEY,{}));
    measurementRevision++;measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';render();
    if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:journey.active,measurementReason:'Configuración actualizada'});
  }
  function downloadTelemetry(){
    const payload={schema:'nexus-tutor-telemetry-v1',version:DEFAULTS.version||null,exportedAt:new Date().toISOString(),config,journey,events:loadTelemetry().slice().reverse()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`nexus-tutor-telemetry-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);recordTelemetry('TELEMETRY_EXPORTED');
  }
  function installSw(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);}

  els.pickupBtn.addEventListener('click',startJourney);els.resetJourneyBtn.addEventListener('click',resetJourney);els.clearLogBtn.addEventListener('click',()=>{saveLog([]);renderLog();});els.downloadTelemetryBtn.addEventListener('click',downloadTelemetry);els.manualDistanceToggle.addEventListener('change',event=>setManualDistanceEnabled(event.target.checked));els.manualDistanceInput.addEventListener('change',onManualDistanceChange);els.manualDistanceMinus.addEventListener('click',()=>adjustManualDistance(-1));els.manualDistancePlus.addEventListener('click',()=>adjustManualDistance(1));els.manualDistanceStep.addEventListener('change',syncManualControls);
  window.addEventListener('focus',refreshOnReturn);window.addEventListener('pageshow',event=>{if(event.persisted)return refreshOnReturn();});window.addEventListener('online',()=>setOnlineState(true));window.addEventListener('offline',()=>setOnlineState(false));document.addEventListener('visibilitychange',onVisibilityChange);RUNTIME.events.on('config:changed',onConfigChanged);
  window.NEXUS_TUTOR_COMPLETE_JOURNEY=completeJourney;
  syncManualControls();renderLog();render();recordTelemetry('APP_LOADED');watchGps();installSw();if(journey.active&&document.visibilityState!=='hidden'&&journey.status!=='COMPLETED')startRefreshLoop();
})();
