(()=>{
  'use strict';
  const RUNTIME=window.NEXUS_TUTOR_RUNTIME;
  if(!RUNTIME)throw new Error('RUNTIME_NOT_LOADED');
  const $=selector=>RUNTIME.dom.one(selector);

  RUNTIME.dom.require([
    '#schoolName','#schoolLock','#schoolCoords','#connectionBadge','#distanceValue','#distanceUnit','#accuracyValue','#distanceSource','#distanceProgress',
    '#waitingMarker','#readyMarker','#gateMarker','#waitingLabel','#readyLabel','#gateLabel','#statusPill','#statusMessage','#countdown','#lastUpdate',
    '#pickupBtn','#pickupBtnText','#actionHint','#resetJourneyBtn','#eventLog','#clearLogBtn','#downloadTelemetryBtn',
    '#manualDistanceToggle','#manualDistanceControls','#manualDistanceInput','#manualDistanceMinus','#manualDistancePlus','#manualDistanceStep'
  ]);

  const elements={
    schoolName:$('#schoolName'),schoolLock:$('#schoolLock'),schoolCoords:$('#schoolCoords'),connectionBadge:$('#connectionBadge'),distanceValue:$('#distanceValue'),distanceUnit:$('#distanceUnit'),accuracyValue:$('#accuracyValue'),distanceSource:$('#distanceSource'),distanceProgress:$('#distanceProgress'),waitingMarker:$('#waitingMarker'),readyMarker:$('#readyMarker'),gateMarker:$('#gateMarker'),waitingLabel:$('#waitingLabel'),readyLabel:$('#readyLabel'),gateLabel:$('#gateLabel'),statusPill:$('#statusPill'),statusMessage:$('#statusMessage'),countdown:$('#countdown'),lastUpdate:$('#lastUpdate'),pickupBtn:$('#pickupBtn'),pickupBtnText:$('#pickupBtnText'),actionHint:$('#actionHint'),resetJourneyBtn:$('#resetJourneyBtn'),eventLog:$('#eventLog'),clearLogBtn:$('#clearLogBtn'),downloadTelemetryBtn:$('#downloadTelemetryBtn'),manualDistanceToggle:$('#manualDistanceToggle'),manualDistanceControls:$('#manualDistanceControls'),manualDistanceInput:$('#manualDistanceInput'),manualDistanceMinus:$('#manualDistanceMinus'),manualDistancePlus:$('#manualDistancePlus'),manualDistanceStep:$('#manualDistanceStep')
  };

  function escapeHtml(value){return String(value??'').replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function formatDistance(value){
    if(!Number.isFinite(Number(value)))return'—';
    const meters=Number(value);
    return meters>=1000?`${(meters/1000).toFixed(meters>=10000?0:1)} km`:`${Math.round(meters)} m`;
  }
  function progressPercent(distance,waitingMeters){
    const max=Math.max(1,Number(waitingMeters)||1);
    return Math.max(0,Math.min(100,100-(Number(distance)/max*100)));
  }
  function positionMarkers(thresholds){
    const max=Math.max(1,Number(thresholds.waitingMeters)||1);
    const place=(element,distance)=>{const pct=Math.max(0,Math.min(100,100-(Number(distance)/max*100)));element.style.left=`${pct}%`;};
    place(elements.waitingMarker,thresholds.waitingMeters);
    place(elements.readyMarker,thresholds.readyMeters);
    place(elements.gateMarker,thresholds.atGateMeters);
  }
  function renderConnection(online){
    elements.connectionBadge.textContent=online?'● En línea':'● Sin internet';
    elements.connectionBadge.className=`badge connection-badge ${online?'badge-ok':'badge-warn'}`;
  }
  function renderLog(items){
    if(!items.length){elements.eventLog.innerHTML='<div class="empty-log">Sin eventos todavía.</div>';return;}
    elements.eventLog.innerHTML=items.map(item=>{
      const time=new Date(item.at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const distance=item.distance==null?'':` · ${formatDistance(item.distance)}`;
      return `<div class="event-item" data-status="${escapeHtml(item.status)}"><span class="event-dot"></span><span><strong>${escapeHtml(item.status)}</strong> ${escapeHtml(item.message||'')}${escapeHtml(distance)}</span><span class="event-time">${time}</span></div>`;
    }).join('');
  }
  function manualStep(){const step=Number(elements.manualDistanceStep.value);return[1,10,100,1000].includes(step)?step:10;}
  function manualInput(){
    const raw=elements.manualDistanceInput.value.trim(),value=Number(raw);
    return raw!==''&&Number.isSafeInteger(value)&&value>=0?value:null;
  }
  function syncManualControls(manualDistance){
    if(document.activeElement!==elements.manualDistanceInput)elements.manualDistanceInput.value=String(manualDistance);
    const step=manualStep();
    elements.manualDistanceMinus.disabled=manualDistance===0;
    elements.manualDistanceMinus.setAttribute('aria-label',`Restar ${step} metros`);
    elements.manualDistancePlus.setAttribute('aria-label',`Sumar ${step} metros`);
  }
  function setCountdown(value){elements.countdown.textContent=value;}
  function setActionHint(value){elements.actionHint.textContent=value;}

  function renderLocationState({measurementState,manualDistanceEnabled,latestDistance,latestSource}){
    if(measurementState==='RECALCULATING'){
      elements.distanceSource.textContent='Recalculando ubicación…';
      elements.distanceSource.dataset.state='recalculating';
      elements.distanceSource.setAttribute('aria-label','Recalculando ubicación. Se conserva la última lectura mientras llega una nueva.');
      return;
    }
    if(manualDistanceEnabled||measurementState==='FRESH'){
      const source=latestSource==='manual'?'Distancia manual':latestSource==='driving'?'Ruta en auto':latestSource==='direct-fallback'?'Ruta no disponible · directa':'Distancia directa';
      elements.distanceSource.textContent=source;
      elements.distanceSource.dataset.state='active';
      elements.distanceSource.setAttribute('aria-label',`Activo. ${source}`);
      return;
    }
    elements.distanceSource.textContent=Number.isFinite(latestDistance)?'Última ubicación conocida':'Esperando ubicación';
    elements.distanceSource.dataset.state='inactive';
    elements.distanceSource.setAttribute('aria-label',Number.isFinite(latestDistance)?'Inactivo. Se muestra la última ubicación conocida.':'Inactivo. Esperando ubicación.');
  }

  function render(model){
    const {config,journey,currentPosition,latestDistance,latestSource,latestAccuracy,measurementState,manualDistanceEnabled,manualDistance,onlineState,schoolReady,rawStatus,canStart}=model;
    const thresholds=config.thresholds;
    elements.schoolName.textContent=config.school?.name||'Escuela';
    elements.waitingLabel.textContent=`${thresholds.waitingMeters} m`;
    elements.readyLabel.textContent=`${thresholds.readyMeters} m`;
    elements.gateLabel.textContent=`${thresholds.atGateMeters} m`;
    positionMarkers(thresholds);
    renderConnection(onlineState);

    if(schoolReady){
      elements.schoolLock.textContent='Fijada';elements.schoolLock.className='badge badge-ok';
      elements.schoolCoords.textContent=`${Number(config.school.lat).toFixed(6)}, ${Number(config.school.lng).toFixed(6)}`;
    }else{
      elements.schoolLock.textContent='Sin fijar';elements.schoolLock.className='badge badge-warn';
      elements.schoolCoords.textContent='Configura la ubicación fija de la escuela.';
    }

    if(Number.isFinite(latestDistance)){
      if(latestDistance>=1000){elements.distanceValue.textContent=(latestDistance/1000).toFixed(latestDistance>=10000?0:1);elements.distanceUnit.textContent='km';}
      else{elements.distanceValue.textContent=Math.round(latestDistance);elements.distanceUnit.textContent='m';}
      elements.distanceProgress.style.width=`${progressPercent(latestDistance,thresholds.waitingMeters)}%`;
    }else{
      elements.distanceValue.textContent='—';elements.distanceUnit.textContent='m';elements.distanceProgress.style.width='0%';
    }

    if(manualDistanceEnabled)elements.accuracyValue.textContent='Simulada · ● Activo';
    else if(Number.isFinite(latestAccuracy)){
      const stateLabel=measurementState==='RECALCULATING'?'↻ Recalculando':measurementState==='FRESH'?'● Activo':'○ Inactivo';
      elements.accuracyValue.textContent=`±${Math.round(latestAccuracy)} m · ${stateLabel}`;
    }else elements.accuracyValue.textContent=measurementState==='RECALCULATING'?'↻ Recalculando':measurementState==='FRESH'?'● Activo':'○ Inactivo';

    renderLocationState({measurementState,manualDistanceEnabled,latestDistance,latestSource});

    elements.manualDistanceToggle.checked=manualDistanceEnabled;
    elements.manualDistanceControls.classList.toggle('hidden',!manualDistanceEnabled);
    syncManualControls(manualDistance);

    const status=journey.active?journey.status:rawStatus;
    const labels={OUTSIDE:'LEJOS · OUTSIDE',WAITING:'EN CAMINO · WAITING',READY:'MUY CERCA · READY',AT_GATE:'EN LA PUERTA · AT GATE',COMPLETED:'SOLICITUD COMPLETADA'};
    const classes={OUTSIDE:'status-outside',WAITING:'status-waiting',READY:'status-ready',AT_GATE:'status-gate',COMPLETED:'status-gate'};
    elements.statusPill.textContent=labels[status]||status;
    elements.statusPill.className=`status-pill ${classes[status]||'status-outside'}`;
    elements.pickupBtn.setAttribute('data-state',journey.active?(status==='COMPLETED'?'AT_GATE':status):'IDLE');

    if(journey.active){
      const messages={OUTSIDE:'Aún te encuentras muy lejos del destino. Tu trayecto ya está activo; te avisaremos cuando estés cerca.',WAITING:'Ya estás dentro del rango de espera. Seguimos tu llegada.',READY:'Ya estás muy cerca del destino. Prepárate para la entrega.',AT_GATE:'Has llegado. Esperando la entrega del alumno.',COMPLETED:'Solicitud completada. ¡Que tengas un excelente día! Que les vaya muy bien.'};
      const freshness=measurementState==='RECALCULATING'?' Recalculando ubicación con la última distancia visible.':measurementState==='UNAVAILABLE'?' GPS no disponible; se conserva la última distancia conocida.':'';
      elements.statusMessage.textContent=(messages[status]||'Trayecto activo.')+freshness;
      elements.pickupBtn.disabled=true;elements.pickupBtn.classList.add('is-active');
      elements.pickupBtnText.textContent=status==='OUTSIDE'?'EN CAMINO':status==='AT_GATE'?'ESPERANDO ENTREGA':status==='COMPLETED'?'SOLICITUD COMPLETADA':labels[status];
      elements.resetJourneyBtn.classList.remove('hidden');
      elements.actionHint.textContent=status==='COMPLETED'?'Trayecto finalizado.':onlineState?'Prueba local: conexión disponible.':'Prueba local: sin conexión a internet.';
    }else{
      elements.pickupBtn.classList.remove('is-active');elements.resetJourneyBtn.classList.add('hidden');
      elements.pickupBtn.disabled=!canStart;elements.pickupBtnText.textContent='VOY POR MI HIJO';
      elements.actionHint.textContent=!schoolReady?'Primero fija la ubicación de la escuela.':measurementState==='RECALCULATING'?'Recalculando ubicación antes de iniciar…':measurementState==='UNAVAILABLE'&&Number.isFinite(latestDistance)?'GPS no disponible. Se muestra la última distancia, pero no se usará para iniciar.':!canStart?'Esperando una ubicación y distancia válidas…':'Puedes iniciar el trayecto desde cualquier distancia.';
      elements.statusMessage.textContent=canStart?(rawStatus==='OUTSIDE'?'Puedes iniciar cuando quieras. Aún estás lejos del destino; al comenzar te avisaremos cuando estés cerca.':'Puedes iniciar el trayecto. Ya estás dentro del rango operativo.'):'Configura la escuela y espera una medición fresca para iniciar.';
    }
    elements.lastUpdate.textContent=journey.lastCheckedAt?new Date(journey.lastCheckedAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  }

  window.NEXUS_TUTOR_JOURNEY_VIEW={elements,render,renderLog,renderConnection,manualStep,manualInput,syncManualControls,setCountdown,setActionHint,formatDistance};
})();