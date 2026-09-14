(()=>{
  'use strict';
  const DEFAULTS=window.NEXUS_TUTOR_DEFAULTS||{};
  const CFG_KEY='nexusTutorConfigV1', JOURNEY_KEY='nexusTutorJourneyV1', LOG_KEY='nexusTutorLogV1', TELEMETRY_KEY='nexusTutorTelemetryV1';
  const STATUS_RANK={OUTSIDE:0,WAITING:1,READY:2,AT_GATE:3,COMPLETED:4};
  const $=s=>document.querySelector(s);
  let config=loadConfig();
  let journey=loadJourney();
  let currentPosition=null;
  let latestDistance=Number.isFinite(Number(journey.lastDistance))?Number(journey.lastDistance):null;
  let latestSource=journey.lastSource||'direct';
  let latestAccuracy=Number.isFinite(Number(journey.lastAccuracy))?Number(journey.lastAccuracy):null;
  let measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';
  let manualDistanceEnabled=false;
  let manualDistance=Math.max(0,Number(config.thresholds?.waitingMeters)||1000);
  let refreshTimer=null,countdownTimer=null,nextRefreshAt=null,currentPollSeconds=null;
  let resumeRun=null,lastResumeAt=-Infinity,measurementRevision=0;
  let onlineState=navigator.onLine!==false;

  const els={
    schoolName:$('#schoolName'),schoolLock:$('#schoolLock'),schoolCoords:$('#schoolCoords'),connectionBadge:$('#connectionBadge'),distanceValue:$('#distanceValue'),distanceUnit:$('#distanceUnit'),accuracyValue:$('#accuracyValue'),distanceSource:$('#distanceSource'),distanceProgress:$('#distanceProgress'),waitingMarker:$('#waitingMarker'),readyMarker:$('#readyMarker'),gateMarker:$('#gateMarker'),waitingLabel:$('#waitingLabel'),readyLabel:$('#readyLabel'),gateLabel:$('#gateLabel'),statusPill:$('#statusPill'),statusMessage:$('#statusMessage'),countdown:$('#countdown'),lastUpdate:$('#lastUpdate'),pickupBtn:$('#pickupBtn'),pickupBtnText:$('#pickupBtnText'),actionHint:$('#actionHint'),resetJourneyBtn:$('#resetJourneyBtn'),eventLog:$('#eventLog'),settingsDialog:$('#settingsDialog'),settingsBtn:$('#settingsBtn'),cfgSchoolName:$('#cfgSchoolName'),cfgLat:$('#cfgLat'),cfgLng:$('#cfgLng'),cfgWaiting:$('#cfgWaiting'),cfgReady:$('#cfgReady'),cfgGate:$('#cfgGate'),cfgDistanceMode:$('#cfgDistanceMode'),useCurrentAsSchoolBtn:$('#useCurrentAsSchoolBtn'),saveSettingsBtn:$('#saveSettingsBtn'),settingsError:$('#settingsError'),clearLogBtn:$('#clearLogBtn'),downloadTelemetryBtn:$('#downloadTelemetryBtn'),manualDistanceToggle:$('#manualDistanceToggle'),manualDistanceControls:$('#manualDistanceControls'),manualDistanceInput:$('#manualDistanceInput'),manualDistanceMinus:$('#manualDistanceMinus'),manualDistancePlus:$('#manualDistancePlus'),manualDistanceStep:$('#manualDistanceStep')
  };

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function mergeConfig(base,stored){return {...clone(base),...stored,school:{...(base.school||{}),...(stored?.school||{})},thresholds:{...(base.thresholds||{}),...(stored?.thresholds||{})}};}
  function loadConfig(){try{return mergeConfig(DEFAULTS,JSON.parse(localStorage.getItem(CFG_KEY)||'null')||{});}catch{return clone(DEFAULTS);}}
  function saveConfig(){localStorage.setItem(CFG_KEY,JSON.stringify(config));}
  function loadJourney(){try{return JSON.parse(localStorage.getItem(JOURNEY_KEY)||'null')||{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null};}catch{return{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null};}}
  function saveJourney(){localStorage.setItem(JOURNEY_KEY,JSON.stringify(journey));}
  function loadLog(){try{return JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch{return[];}}
  function saveLog(items){localStorage.setItem(LOG_KEY,JSON.stringify(items.slice(0,60)));}
  function loadTelemetry(){try{return JSON.parse(localStorage.getItem(TELEMETRY_KEY)||'[]');}catch{return[];}}
  function saveTelemetry(items){localStorage.setItem(TELEMETRY_KEY,JSON.stringify(items.slice(0,1000)));}
  function pollSecondsForStatus(status=journey.status){
    const base=Math.max(5,Number(config.refreshSeconds)||30);
    if(status==='OUTSIDE')return Math.max(60,base*2);
    if(status==='WAITING')return base;
    if(status==='READY'||status==='AT_GATE')return Math.max(5,Math.min(10,base));
    return null;
  }
  function recordTelemetry(event,extra={}){
    const items=loadTelemetry();
    const coords=currentPosition?.coords||{};
    items.unshift({
      at:new Date().toISOString(),journeyId:journey.id||null,event,journeyStatus:journey.status||'OUTSIDE',measurementState,
      distanceMeters:Number.isFinite(latestDistance)?latestDistance:null,accuracyMeters:Number.isFinite(latestAccuracy)?latestAccuracy:null,source:latestSource,
      pollIntervalSeconds:journey.active?pollSecondsForStatus():null,visibility:document.visibilityState||'visible',online:onlineState,
      latitude:Number.isFinite(coords.latitude)?coords.latitude:null,longitude:Number.isFinite(coords.longitude)?coords.longitude:null,...extra
    });
    saveTelemetry(items);
  }
  function addLog(status,message,distance){const items=loadLog();items.unshift({at:new Date().toISOString(),status,message,distance:Number.isFinite(distance)?distance:null});saveLog(items);renderLog();}
  function renderLog(){
    const items=loadLog();
    if(!items.length){els.eventLog.innerHTML='<div class="empty-log">Sin eventos todavía.</div>';return;}
    els.eventLog.innerHTML=items.map(item=>{const time=new Date(item.at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});const d=item.distance==null?'':` · ${formatDistance(item.distance)}`;return `<div class="event-item" data-status="${escapeHtml(item.status)}"><span class="event-dot"></span><span><strong>${escapeHtml(item.status)}</strong> ${escapeHtml(item.message||'')}${escapeHtml(d)}</span><span class="event-time">${time}</span></div>`;}).join('');
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));}
  function schoolReady(){const lat=config.school?.lat,lng=config.school?.lng;return lat!=null&&lng!=null&&String(lat).trim()!==''&&String(lng).trim()!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;}
  function haversine(lat1,lon1,lat2,lon2){const R=6371000,toRad=v=>v*Math.PI/180;const p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  function manualStep(){const step=Number(els.manualDistanceStep.value);return[1,10,100,1000].includes(step)?step:10;}
  function syncManualControls(){
    if(document.activeElement!==els.manualDistanceInput)els.manualDistanceInput.value=String(manualDistance);
    const step=manualStep();
    els.manualDistanceMinus.disabled=manualDistance===0;
    els.manualDistanceMinus.setAttribute('aria-label',`Restar ${step} metros`);
    els.manualDistancePlus.setAttribute('aria-label',`Sumar ${step} metros`);
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
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${config.school.lng},${config.school.lat}?overview=false&steps=false`;
      const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('ROUTE_HTTP_'+r.status);
      const data=await r.json();const meters=Number(data?.routes?.[0]?.distance);if(!Number.isFinite(meters))throw new Error('ROUTE_DISTANCE_INVALID');return{meters,source:'driving',accuracy:Number.isFinite(accuracy)?accuracy:null};
    }catch(err){console.warn('OSRM no disponible, usando distancia directa',err);return{meters:direct,source:'direct-fallback',accuracy:Number.isFinite(accuracy)?accuracy:null};}
  }
  function candidateStatus(distance){const t=config.thresholds;if(distance<=Number(t.atGateMeters))return'AT_GATE';if(distance<=Number(t.readyMeters))return'READY';if(distance<=Number(t.waitingMeters))return'WAITING';return'OUTSIDE';}
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
    }catch(err){
      if(journey!==measuredJourney||revision!==measurementRevision)return;
      console.warn(err);measurementState='UNAVAILABLE';
      if(recordMeasurement&&journey.active)addLog(journey.status,`${measurementReason} no disponible`,null);
      recordTelemetry('MEASUREMENT_ERROR',{reason:measurementReason,error:String(err?.message||err)});render();
    }
  }
  function formatDistance(m){if(!Number.isFinite(Number(m)))return'—';m=Number(m);return m>=1000?`${(m/1000).toFixed(m>=10000?0:1)} km`:`${Math.round(m)} m`;}
  function linearPercent(distance){const max=Math.max(1,Number(config.thresholds.waitingMeters)||1);return Math.max(0,Math.min(100,100-(Number(distance)/max*100)));}
  function positionMarkers(){
    const max=Math.max(1,Number(config.thresholds.waitingMeters)||1);
    const place=(el,distance,edge=false)=>{if(!el)return;const pct=Math.max(0,Math.min(100,100-(Number(distance)/max*100)));el.style.left=`${pct}%`;el.style.transform=edge?'translateX(0)':'translateX(-50%)';};
    place(els.waitingMarker,config.thresholds.waitingMeters,true);place(els.readyMarker,config.thresholds.readyMeters);place(els.gateMarker,config.thresholds.atGateMeters);
  }
  function renderConnection(){if(!els.connectionBadge)return;els.connectionBadge.textContent=onlineState?'● En línea':'● Sin internet';els.connectionBadge.className=`badge ${onlineState?'badge-ok':'badge-warn'}`;}
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
    const raw=Number.isFinite(latestDistance)?candidateStatus(latestDistance):'OUTSIDE';const status=journey.active?journey.status:raw;
    const labels={OUTSIDE:'FUERA DEL UMBRAL',WAITING:'EN CAMINO · WAITING',READY:'PRÓXIMO · READY',AT_GATE:'EN LA PUERTA · AT GATE',COMPLETED:'COMPLETADO'};const classes={OUTSIDE:'status-outside',WAITING:'status-waiting',READY:'status-ready',AT_GATE:'status-gate',COMPLETED:'status-gate'};
    els.statusPill.textContent=labels[status]||status;els.statusPill.className=`status-pill ${classes[status]||'status-outside'}`;
    els.pickupBtn.setAttribute('data-state',journey.active?(status==='COMPLETED'?'AT_GATE':status):'IDLE');
    if(journey.active){
      const messages={
        OUTSIDE:`Trayecto iniciado. Aún estás fuera del rango operativo. Próxima revisión en ${pollSecondsForStatus('OUTSIDE')} s.`,
        WAITING:`Entraste al rango operativo. Seguimiento cada ${pollSecondsForStatus('WAITING')} s.`,
        READY:`Estás cerca. Seguimiento cada ${pollSecondsForStatus('READY')} s.`,
        AT_GATE:'Has llegado. Esperando la entrega del alumno.',
        COMPLETED:'Entrega completada. ¡Que tengas un gran día!'
      };
      const freshness=measurementState==='RECALCULATING'?' Recalculando ubicación con la última distancia visible.':measurementState==='UNAVAILABLE'?' GPS no disponible; se conserva la última distancia conocida.':'';
      els.statusMessage.textContent=(messages[status]||'Trayecto activo.')+freshness;
      els.pickupBtn.disabled=true;els.pickupBtn.classList.add('is-active');
      els.pickupBtnText.textContent=status==='OUTSIDE'?'TRAYECTO INICIADO':status==='AT_GATE'?'ESPERANDO ENTREGA':status==='COMPLETED'?'COMPLETADO':labels[status];
      if(status==='OUTSIDE')els.statusPill.textContent='ESPERANDO RANGO · OUTSIDE';
      els.resetJourneyBtn.classList.remove('hidden');
      els.actionHint.textContent=status==='COMPLETED'?'Trayecto finalizado.':onlineState?'Prueba local: conexión disponible.':'Prueba local: sin conexión a internet.';
    }else{
      els.pickupBtn.classList.remove('is-active');els.resetJourneyBtn.classList.add('hidden');
      const freshEnough=manualDistanceEnabled||measurementState==='FRESH';
      const canStart=schoolReady()&&(manualDistanceEnabled||currentPosition)&&Number.isFinite(latestDistance)&&freshEnough;
      els.pickupBtn.disabled=!canStart;els.pickupBtnText.textContent='VOY POR MI HIJO';
      els.actionHint.textContent=!schoolReady()?'Primero fija la ubicación de la escuela.':measurementState==='RECALCULATING'?'Recalculando ubicación antes de iniciar…':measurementState==='UNAVAILABLE'&&Number.isFinite(latestDistance)?'GPS no disponible. Se muestra la última distancia, pero no se usará para iniciar.':!canStart?'Esperando una ubicación y distancia válidas…':'Puedes iniciar el trayecto desde cualquier distancia.';
      els.statusMessage.textContent=canStart?(raw==='OUTSIDE'?'Puedes activar el seguimiento ahora. WAITING comenzará al entrar al rango operativo.':'Puedes iniciar el trayecto. Ya estás dentro del rango operativo.'):'Configura la escuela y espera una medición fresca para iniciar.';
    }
    els.lastUpdate.textContent=journey.lastCheckedAt?new Date(journey.lastCheckedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  }
  function startJourney(){
    if(els.pickupBtn.disabled||journey.active)return;
    const initialStatus=candidateStatus(latestDistance)==='OUTSIDE'?'OUTSIDE':'WAITING';
    journey={active:true,id:`journey-${Date.now()}`,status:initialStatus,startedAt:new Date().toISOString(),lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();
    addLog(initialStatus,initialStatus==='OUTSIDE'?'Trayecto iniciado · esperando rango operativo':manualDistanceEnabled?'Inicio de prueba manual':'Inicio de prueba',latestDistance);recordTelemetry('JOURNEY_STARTED',{distanceMeters:latestDistance});refreshMeasurement({allowPromotion:true});startRefreshLoop();render();
  }
  function completeJourney(){if(!journey.active||journey.status==='COMPLETED')return;const from=journey.status;journey.status='COMPLETED';journey.completedAt=new Date().toISOString();saveJourney();stopRefreshLoop();addLog('COMPLETED','Entrega completada',latestDistance);recordTelemetry('DELIVERY_COMPLETED',{fromStatus:from});render();}
  function resetJourney(){recordTelemetry('JOURNEY_RESET');journey={active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:journey.lastCheckedAt||null,lastDistance:latestDistance,lastSource:latestSource,lastAccuracy:latestAccuracy};saveJourney();stopRefreshLoop();if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:false});else render();}
  function startRefreshLoop(){
    stopRefreshLoop();if(!journey.active||journey.status==='COMPLETED')return;
    const seconds=pollSecondsForStatus();currentPollSeconds=seconds;if(!seconds)return;
    nextRefreshAt=Date.now()+seconds*1000;
    refreshTimer=setInterval(async()=>{await refreshMeasurement({allowPromotion:true,recordMeasurement:true});if(refreshTimer)nextRefreshAt=Date.now()+pollSecondsForStatus()*1000;},seconds*1000);
    countdownTimer=setInterval(updateCountdown,1000);recordTelemetry('POLL_RATE_CHANGED',{pollIntervalSeconds:seconds});updateCountdown();
  }
  function stopRefreshLoop(){clearInterval(refreshTimer);clearInterval(countdownTimer);refreshTimer=countdownTimer=null;nextRefreshAt=null;currentPollSeconds=null;els.countdown.textContent='—';}
  function updateCountdown(){if(!nextRefreshAt){els.countdown.textContent='—';return;}els.countdown.textContent=`${Math.max(0,Math.ceil((nextRefreshAt-Date.now())/1000))} s`;}
  function openSettings(){els.cfgSchoolName.value=config.school?.name||'';els.cfgLat.value=schoolReady()?config.school.lat:'';els.cfgLng.value=schoolReady()?config.school.lng:'';els.cfgWaiting.value=config.thresholds.waitingMeters;els.cfgReady.value=config.thresholds.readyMeters;els.cfgGate.value=config.thresholds.atGateMeters;els.cfgDistanceMode.value=config.distanceMode||'direct';els.settingsError.classList.add('hidden');els.settingsDialog.showModal();}
  function parseCoordinate(raw){const normalized=String(raw??'').trim().replace(/[−–—]/g,'-').replace(',','.');if(normalized==='')return null;const value=Number(normalized);return Number.isFinite(value)?value:NaN;}
  function saveSettingsFromForm(){
    const lat=parseCoordinate(els.cfgLat.value),lng=parseCoordinate(els.cfgLng.value),waiting=Number(els.cfgWaiting.value),ready=Number(els.cfgReady.value),gate=Number(els.cfgGate.value);
    const invalidCoord=(lat===null)!=(lng===null)||(lat!==null&&(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180));
    if(invalidCoord||!Number.isFinite(waiting)||!Number.isFinite(ready)||!Number.isFinite(gate)||waiting<ready||ready<gate||gate<0){els.settingsError.textContent='Revisa coordenadas y umbrales: WAITING ≥ READY ≥ AT GATE ≥ 0.';els.settingsError.classList.remove('hidden');return;}
    config={...config,school:{name:els.cfgSchoolName.value.trim()||'Escuela',lat,lng},thresholds:{waitingMeters:waiting,readyMeters:ready,atGateMeters:gate},distanceMode:els.cfgDistanceMode.value};saveConfig();els.settingsDialog.close();measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';render();if((currentPosition||manualDistanceEnabled)&&schoolReady())refreshMeasurement({allowPromotion:journey.active});
  }
  function useCurrentAsSchool(){if(!currentPosition){els.settingsError.textContent='Todavía no hay una lectura GPS disponible.';els.settingsError.classList.remove('hidden');return;}els.cfgLat.value=currentPosition.coords.latitude;els.cfgLng.value=currentPosition.coords.longitude;els.settingsError.classList.add('hidden');}
  function setManualDistanceEnabled(enabled){
    measurementRevision++;manualDistanceEnabled=Boolean(enabled);
    if(manualDistanceEnabled){syncManualControls();latestDistance=manualDistance;latestSource='manual';latestAccuracy=null;measurementState='FRESH';journey.lastCheckedAt=new Date().toISOString();journey.lastDistance=latestDistance;journey.lastSource=latestSource;journey.lastAccuracy=null;saveJourney();if(journey.active)promoteStatus(candidateStatus(latestDistance),latestDistance);recordTelemetry('MANUAL_MODE_ON');render();}
    else{measurementState=Number.isFinite(latestDistance)?'STALE':'UNAVAILABLE';latestSource=journey.lastSource||'direct';recordTelemetry('MANUAL_MODE_OFF');render();if(currentPosition&&schoolReady())refreshMeasurement({allowPromotion:journey.active});}
  }
  function watchGps(){
    if(!('geolocation'in navigator)){measurementState='UNAVAILABLE';els.actionHint.textContent='Este navegador no ofrece geolocalización.';recordTelemetry('GPS_NOT_AVAILABLE');return;}
    navigator.geolocation.watchPosition(pos=>{
      const recovering=measurementState==='UNAVAILABLE';currentPosition=pos;
      if(!resumeRun&&schoolReady()&&!manualDistanceEnabled){
        if(!journey.active||recovering)refreshMeasurement({allowPromotion:journey.active,recordMeasurement:journey.active&&recovering,measurementReason:recovering?'GPS recuperado':'Medición GPS'});
      }
    },err=>{
      console.warn(err);if(manualDistanceEnabled)return;
      currentPosition=null;measurementState='UNAVAILABLE';measurementRevision++;recordTelemetry('GPS_WATCH_ERROR',{errorCode:err?.code??null,error:String(err?.message||'GPS error')});render();
    },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }
  async function refreshOnReturn(){
    if(document.visibilityState==='hidden'||resumeRun||Date.now()-lastResumeAt<2000||!schoolReady())return;
    const run={journey,manual:manualDistanceEnabled};
    resumeRun=run;lastResumeAt=Date.now();measurementRevision++;stopRefreshLoop();recordTelemetry('APP_RESUME');
    const isCurrent=()=>resumeRun===run&&journey===run.journey&&manualDistanceEnabled===run.manual&&document.visibilityState!=='hidden';
    try{
      if(!run.manual){
        currentPosition=null;measurementState=Number.isFinite(latestDistance)?'RECALCULATING':'UNAVAILABLE';render();recordTelemetry('GPS_RECALCULATING');
        if(!('geolocation'in navigator))throw new Error('GPS_NOT_AVAILABLE');
        const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
        if(!isCurrent())return;currentPosition=pos;
      }
      if(!isCurrent())return;
      await refreshMeasurement({allowPromotion:true,recordMeasurement:journey.active,measurementReason:'Medición al volver a la app'});
    }catch(err){
      if(!isCurrent())return;
      console.warn(err);currentPosition=null;measurementState='UNAVAILABLE';render();recordTelemetry('GPS_RESUME_ERROR',{error:String(err?.message||err)});
      if(journey.active)addLog(journey.status,'Medición al volver a la app no disponible',null);
    }finally{
      if(resumeRun===run){resumeRun=null;if(journey.active&&document.visibilityState!=='hidden'&&journey.status!=='COMPLETED')startRefreshLoop();}
    }
  }
  function onVisibilityChange(){
    if(document.visibilityState==='hidden'){
      recordTelemetry('APP_HIDDEN');resumeRun=null;lastResumeAt=-Infinity;measurementRevision++;if(!manualDistanceEnabled&&Number.isFinite(latestDistance))measurementState='STALE';stopRefreshLoop();
    }else return refreshOnReturn();
  }
  function setOnlineState(value){const next=Boolean(value);if(next===onlineState){renderConnection();return;}onlineState=next;recordTelemetry(next?'INTERNET_ONLINE':'INTERNET_OFFLINE');render();}
  function downloadTelemetry(){
    const payload={schema:'nexus-tutor-telemetry-v1',version:DEFAULTS.version||null,exportedAt:new Date().toISOString(),config,journey,events:loadTelemetry().slice().reverse()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`nexus-tutor-telemetry-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);recordTelemetry('TELEMETRY_EXPORTED');
  }
  function installSw(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);}

  els.settingsBtn.addEventListener('click',openSettings);els.saveSettingsBtn.addEventListener('click',saveSettingsFromForm);els.useCurrentAsSchoolBtn.addEventListener('click',useCurrentAsSchool);els.pickupBtn.addEventListener('click',startJourney);els.resetJourneyBtn.addEventListener('click',resetJourney);els.clearLogBtn.addEventListener('click',()=>{saveLog([]);renderLog();});if(els.downloadTelemetryBtn)els.downloadTelemetryBtn.addEventListener('click',downloadTelemetry);els.manualDistanceToggle.addEventListener('change',e=>setManualDistanceEnabled(e.target.checked));els.manualDistanceInput.addEventListener('change',onManualDistanceChange);els.manualDistanceMinus.addEventListener('click',()=>adjustManualDistance(-1));els.manualDistancePlus.addEventListener('click',()=>adjustManualDistance(1));els.manualDistanceStep.addEventListener('change',syncManualControls);
  window.addEventListener('focus',refreshOnReturn);window.addEventListener('pageshow',event=>{if(event.persisted)return refreshOnReturn();});window.addEventListener('online',()=>setOnlineState(true));window.addEventListener('offline',()=>setOnlineState(false));document.addEventListener('visibilitychange',onVisibilityChange);
  window.NEXUS_TUTOR_COMPLETE_JOURNEY=completeJourney;
  syncManualControls();renderLog();render();recordTelemetry('APP_LOADED');watchGps();installSw();if(journey.active&&document.visibilityState!=='hidden'&&journey.status!=='COMPLETED')startRefreshLoop();
})();
