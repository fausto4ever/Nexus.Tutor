(()=>{
  'use strict';
  const DEFAULTS=window.NEXUS_TUTOR_DEFAULTS||{};
  const CFG_KEY='nexusTutorConfigV1', JOURNEY_KEY='nexusTutorJourneyV1', LOG_KEY='nexusTutorLogV1';
  const STATUS_RANK={OUTSIDE:0,WAITING:1,READY:2,AT_GATE:3};
  const $=s=>document.querySelector(s);
  let config=loadConfig();
  let currentPosition=null;
  let journey=loadJourney();
  let latestDistance=null;
  let latestSource='direct';
  let refreshTimer=null, countdownTimer=null, nextRefreshAt=null;

  const els={
    schoolName:$('#schoolName'),schoolLock:$('#schoolLock'),schoolCoords:$('#schoolCoords'),distanceValue:$('#distanceValue'),distanceUnit:$('#distanceUnit'),accuracyValue:$('#accuracyValue'),distanceSource:$('#distanceSource'),distanceProgress:$('#distanceProgress'),waitingLabel:$('#waitingLabel'),readyLabel:$('#readyLabel'),gateLabel:$('#gateLabel'),statusPill:$('#statusPill'),statusMessage:$('#statusMessage'),countdown:$('#countdown'),lastUpdate:$('#lastUpdate'),pickupBtn:$('#pickupBtn'),pickupBtnText:$('#pickupBtnText'),actionHint:$('#actionHint'),resetJourneyBtn:$('#resetJourneyBtn'),eventLog:$('#eventLog'),settingsDialog:$('#settingsDialog'),settingsBtn:$('#settingsBtn'),cfgSchoolName:$('#cfgSchoolName'),cfgLat:$('#cfgLat'),cfgLng:$('#cfgLng'),cfgWaiting:$('#cfgWaiting'),cfgReady:$('#cfgReady'),cfgGate:$('#cfgGate'),cfgDistanceMode:$('#cfgDistanceMode'),useCurrentAsSchoolBtn:$('#useCurrentAsSchoolBtn'),saveSettingsBtn:$('#saveSettingsBtn'),settingsError:$('#settingsError'),clearLogBtn:$('#clearLogBtn')
  };

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function mergeConfig(base,stored){
    return {
      ...clone(base),...stored,
      school:{...(base.school||{}),...(stored?.school||{})},
      thresholds:{...(base.thresholds||{}),...(stored?.thresholds||{})}
    };
  }
  function loadConfig(){
    try{return mergeConfig(DEFAULTS,JSON.parse(localStorage.getItem(CFG_KEY)||'null')||{});}catch{return clone(DEFAULTS);}
  }
  function saveConfig(){localStorage.setItem(CFG_KEY,JSON.stringify(config));}
  function loadJourney(){
    try{return JSON.parse(localStorage.getItem(JOURNEY_KEY)||'null')||{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null};}
    catch{return{active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null};}
  }
  function saveJourney(){localStorage.setItem(JOURNEY_KEY,JSON.stringify(journey));}
  function loadLog(){try{return JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch{return[];}}
  function saveLog(items){localStorage.setItem(LOG_KEY,JSON.stringify(items.slice(0,60)));}
  function addLog(status,message,distance){
    const items=loadLog();
    items.unshift({at:new Date().toISOString(),status,message,distance:Number.isFinite(distance)?distance:null});
    saveLog(items); renderLog();
  }
  function renderLog(){
    const items=loadLog();
    if(!items.length){els.eventLog.innerHTML='<div class="empty-log">Sin eventos todavía.</div>';return;}
    els.eventLog.innerHTML=items.map(item=>{
      const time=new Date(item.at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const d=item.distance==null?'':` · ${formatDistance(item.distance)}`;
      return `<div class="event-item" data-status="${escapeHtml(item.status)}"><span class="event-dot"></span><span><strong>${escapeHtml(item.status)}</strong> ${escapeHtml(item.message||'')}${escapeHtml(d)}</span><span class="event-time">${time}</span></div>`;
    }).join('');
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function schoolReady(){return Number.isFinite(Number(config.school?.lat))&&Number.isFinite(Number(config.school?.lng));}
  function haversine(lat1,lon1,lat2,lon2){
    const R=6371000,toRad=v=>v*Math.PI/180;
    const p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  async function measureDistance(){
    if(!currentPosition||!schoolReady())throw new Error('GPS_NOT_READY');
    const {latitude,longitude}=currentPosition.coords;
    const direct=haversine(latitude,longitude,Number(config.school.lat),Number(config.school.lng));
    if(config.distanceMode!=='driving')return{meters:direct,source:'direct'};
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${config.school.lng},${config.school.lat}?overview=false&steps=false`;
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error('ROUTE_HTTP_'+r.status);
      const data=await r.json();
      const meters=Number(data?.routes?.[0]?.distance);
      if(!Number.isFinite(meters))throw new Error('ROUTE_DISTANCE_INVALID');
      return{meters,source:'driving'};
    }catch(err){
      console.warn('OSRM no disponible, usando distancia directa',err);
      return{meters:direct,source:'direct-fallback'};
    }
  }
  function candidateStatus(distance){
    const t=config.thresholds;
    if(distance<=Number(t.atGateMeters))return'AT_GATE';
    if(distance<=Number(t.readyMeters))return'READY';
    if(distance<=Number(t.waitingMeters))return'WAITING';
    return'OUTSIDE';
  }
  function promoteStatus(candidate,distance){
    if(!journey.active)return;
    const current=journey.status||'WAITING';
    if((STATUS_RANK[candidate]||0)>(STATUS_RANK[current]||0)){
      journey.status=candidate;saveJourney();
      addLog(candidate,'Avance automático',distance);
    }
  }
  async function refreshMeasurement({allowPromotion=true}={}){
    try{
      const result=await measureDistance();
      latestDistance=result.meters;latestSource=result.source;
      journey.lastCheckedAt=new Date().toISOString();saveJourney();
      if(allowPromotion&&journey.active)promoteStatus(candidateStatus(latestDistance),latestDistance);
      render();
    }catch(err){console.warn(err);render();}
  }
  function formatDistance(m){
    if(!Number.isFinite(Number(m)))return'—';
    m=Number(m); return m>=1000?`${(m/1000).toFixed(m>=10000?0:1)} km`:`${Math.round(m)} m`;
  }
  function render(){
    els.schoolName.textContent=config.school?.name||'Escuela';
    els.waitingLabel.textContent=`${config.thresholds.waitingMeters} m`;
    els.readyLabel.textContent=`${config.thresholds.readyMeters} m`;
    els.gateLabel.textContent=`${config.thresholds.atGateMeters} m`;
    if(schoolReady()){
      els.schoolLock.textContent='Fijada';els.schoolLock.className='badge badge-ok';
      els.schoolCoords.textContent=`${Number(config.school.lat).toFixed(6)}, ${Number(config.school.lng).toFixed(6)}`;
    }else{
      els.schoolLock.textContent='Sin fijar';els.schoolLock.className='badge badge-warn';
      els.schoolCoords.textContent='Configura la ubicación fija de la escuela.';
    }
    if(Number.isFinite(latestDistance)){
      if(latestDistance>=1000){els.distanceValue.textContent=(latestDistance/1000).toFixed(latestDistance>=10000?0:1);els.distanceUnit.textContent='km';}
      else{els.distanceValue.textContent=Math.round(latestDistance);els.distanceUnit.textContent='m';}
      const pct=Math.max(0,Math.min(100,100-(latestDistance/Math.max(1,Number(config.thresholds.waitingMeters))*100)));
      els.distanceProgress.style.width=`${pct}%`;
    }else{els.distanceValue.textContent='—';els.distanceUnit.textContent='m';els.distanceProgress.style.width='0%';}
    els.accuracyValue.textContent=currentPosition?`±${Math.round(currentPosition.coords.accuracy||0)} m`:'—';
    els.distanceSource.textContent=latestSource==='driving'?'Ruta en auto':latestSource==='direct-fallback'?'Ruta no disponible · directa':'Distancia directa';
    const raw=Number.isFinite(latestDistance)?candidateStatus(latestDistance):'OUTSIDE';
    const status=journey.active?journey.status:raw;
    const labels={OUTSIDE:'FUERA DEL UMBRAL',WAITING:'EN CAMINO · WAITING',READY:'PRÓXIMO · READY',AT_GATE:'EN LA PUERTA · AT GATE'};
    const classes={OUTSIDE:'status-outside',WAITING:'status-waiting',READY:'status-ready',AT_GATE:'status-gate'};
    els.statusPill.textContent=labels[status]||status;els.statusPill.className=`status-pill ${classes[status]||'status-outside'}`;
    if(journey.active){
      els.statusMessage.textContent=status==='AT_GATE'?'Llegaste al umbral de puerta.':status==='READY'?'Ya estás dentro del umbral READY.':`Solicitud local activa. Se revisa la distancia cada ${config.refreshSeconds||30} segundos.`;
      els.pickupBtn.disabled=true;els.pickupBtn.classList.add('is-active');els.pickupBtnText.textContent=labels[status];els.resetJourneyBtn.classList.remove('hidden');
      els.actionHint.textContent='Prueba local: ningún estado se envía al Gateway.';
    }else{
      els.pickupBtn.classList.remove('is-active');els.resetJourneyBtn.classList.add('hidden');
      const canStart=schoolReady()&&currentPosition&&Number.isFinite(latestDistance)&&latestDistance<=Number(config.thresholds.waitingMeters);
      els.pickupBtn.disabled=!canStart;els.pickupBtnText.textContent='VOY POR MI HIJO';
      els.actionHint.textContent=!schoolReady()?'Primero fija la ubicación de la escuela.':!currentPosition?'Esperando ubicación GPS…':canStart?'Estás dentro del umbral WAITING. Puedes iniciar.':`Acércate a ${config.thresholds.waitingMeters} m o menos para habilitar el botón.`;
      els.statusMessage.textContent=canStart?'Estás dentro del radio WAITING.':'Acércate al radio WAITING para habilitar la solicitud.';
    }
    els.lastUpdate.textContent=journey.lastCheckedAt?new Date(journey.lastCheckedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  }
  function startJourney(){
    if(els.pickupBtn.disabled||journey.active)return;
    journey={active:true,status:'WAITING',startedAt:new Date().toISOString(),lastCheckedAt:null};saveJourney();
    addLog('WAITING','Inicio de prueba',latestDistance);
    refreshMeasurement({allowPromotion:true}); startRefreshLoop(); render();
  }
  function resetJourney(){
    journey={active:false,status:'OUTSIDE',startedAt:null,lastCheckedAt:null};saveJourney(); stopRefreshLoop();
    if(currentPosition&&schoolReady())refreshMeasurement({allowPromotion:false}); else render();
  }
  function startRefreshLoop(){
    stopRefreshLoop(); const seconds=Math.max(5,Number(config.refreshSeconds)||30);
    nextRefreshAt=Date.now()+seconds*1000;
    refreshTimer=setInterval(async()=>{await refreshMeasurement({allowPromotion:true});nextRefreshAt=Date.now()+seconds*1000;},seconds*1000);
    countdownTimer=setInterval(updateCountdown,1000); updateCountdown();
  }
  function stopRefreshLoop(){clearInterval(refreshTimer);clearInterval(countdownTimer);refreshTimer=countdownTimer=null;nextRefreshAt=null;els.countdown.textContent='—';}
  function updateCountdown(){if(!nextRefreshAt){els.countdown.textContent='—';return;}els.countdown.textContent=`${Math.max(0,Math.ceil((nextRefreshAt-Date.now())/1000))} s`;}
  function openSettings(){
    els.cfgSchoolName.value=config.school?.name||'';els.cfgLat.value=schoolReady()?config.school.lat:'';els.cfgLng.value=schoolReady()?config.school.lng:'';
    els.cfgWaiting.value=config.thresholds.waitingMeters;els.cfgReady.value=config.thresholds.readyMeters;els.cfgGate.value=config.thresholds.atGateMeters;els.cfgDistanceMode.value=config.distanceMode||'direct';
    els.settingsError.classList.add('hidden');els.settingsDialog.showModal();
  }
  function saveSettingsFromForm(){
    const lat=els.cfgLat.value===''?null:Number(els.cfgLat.value),lng=els.cfgLng.value===''?null:Number(els.cfgLng.value),waiting=Number(els.cfgWaiting.value),ready=Number(els.cfgReady.value),gate=Number(els.cfgGate.value);
    const invalidCoord=(lat===null)!=(lng===null)|| (lat!==null&&(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180));
    if(invalidCoord||!Number.isFinite(waiting)||!Number.isFinite(ready)||!Number.isFinite(gate)||waiting<ready||ready<gate||gate<0){
      els.settingsError.textContent='Revisa coordenadas y umbrales: WAITING ≥ READY ≥ AT GATE ≥ 0.';els.settingsError.classList.remove('hidden');return;
    }
    config={...config,school:{name:els.cfgSchoolName.value.trim()||'Escuela',lat,lng},thresholds:{waitingMeters:waiting,readyMeters:ready,atGateMeters:gate},distanceMode:els.cfgDistanceMode.value};saveConfig();
    els.settingsDialog.close(); latestDistance=null; render(); if(currentPosition&&schoolReady())refreshMeasurement({allowPromotion:journey.active});
  }
  function useCurrentAsSchool(){
    if(!currentPosition){els.settingsError.textContent='Todavía no hay una lectura GPS disponible.';els.settingsError.classList.remove('hidden');return;}
    els.cfgLat.value=currentPosition.coords.latitude;els.cfgLng.value=currentPosition.coords.longitude;els.settingsError.classList.add('hidden');
  }
  function watchGps(){
    if(!('geolocation'in navigator)){els.actionHint.textContent='Este navegador no ofrece geolocalización.';return;}
    navigator.geolocation.watchPosition(pos=>{
      currentPosition=pos;render();
      if(schoolReady()&&!journey.active)refreshMeasurement({allowPromotion:false});
    },err=>{console.warn(err);els.actionHint.textContent='No se pudo obtener GPS. Revisa permisos de ubicación.';render();},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }
  function installSw(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);}

  els.settingsBtn.addEventListener('click',openSettings);
  els.saveSettingsBtn.addEventListener('click',saveSettingsFromForm);
  els.useCurrentAsSchoolBtn.addEventListener('click',useCurrentAsSchool);
  els.pickupBtn.addEventListener('click',startJourney);
  els.resetJourneyBtn.addEventListener('click',resetJourney);
  els.clearLogBtn.addEventListener('click',()=>{saveLog([]);renderLog();});
  renderLog();render();watchGps();installSw();if(journey.active)startRefreshLoop();
})();
