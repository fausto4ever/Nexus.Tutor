(()=>{
  'use strict';
  const RUNTIME=window.NEXUS_TUTOR_RUNTIME;
  const LOCATION=window.NEXUS_TUTOR_LOCATION;
  if(!RUNTIME)throw new Error('RUNTIME_NOT_LOADED');
  if(!LOCATION)throw new Error('LOCATION_SERVICE_NOT_LOADED');

  const CFG_KEY='nexusTutorConfigV1',JOURNEY_KEY='nexusTutorJourneyV1',TELEMETRY_KEY='nexusTutorTelemetryV1';
  const defaults=window.NEXUS_TUTOR_DEFAULTS||{};
  const $=selector=>RUNTIME.dom.one(selector);
  RUNTIME.dom.require([
    '#settingsDialog','#settingsBtn','#cfgDestination','#addDestinationBtn','#cancelDestinationBtn','#cfgSchoolName','#cfgLat','#cfgLng',
    '#latMinusBtn','#lngMinusBtn','#useCurrentAsSchoolBtn','#cfgWaiting','#cfgReady','#cfgGate','#cfgDistanceMode','#saveSettingsBtn','#settingsError'
  ]);

  const els={
    dialog:$('#settingsDialog'),settingsBtn:$('#settingsBtn'),destinationSelect:$('#cfgDestination'),addDestinationBtn:$('#addDestinationBtn'),cancelDestinationBtn:$('#cancelDestinationBtn'),
    nameInput:$('#cfgSchoolName'),lat:$('#cfgLat'),lng:$('#cfgLng'),latMinusBtn:$('#latMinusBtn'),lngMinusBtn:$('#lngMinusBtn'),useCurrentBtn:$('#useCurrentAsSchoolBtn'),
    waiting:$('#cfgWaiting'),ready:$('#cfgReady'),gate:$('#cfgGate'),distanceMode:$('#cfgDistanceMode'),saveSettingsBtn:$('#saveSettingsBtn'),settingsError:$('#settingsError')
  };

  let draftId=null;

  function readJson(key,fallback){return RUNTIME.storage.read(key,fallback);}
  function writeConfig(config){return RUNTIME.storage.write(CFG_KEY,config);}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function mergedConfig(stored={}){
    return{
      ...clone(defaults),...stored,
      school:{...(defaults.school||{}),...(stored.school||{})},
      thresholds:{...(defaults.thresholds||{}),...(stored.thresholds||{})}
    };
  }
  function normalize(value){return String(value??'').trim().replace(/[−–—]/g,'-');}
  function parseCoordinate(raw){
    const normalized=normalize(raw).replace(',','.');
    if(normalized==='')return null;
    const value=Number(normalized);
    return Number.isFinite(value)?value:NaN;
  }
  function toggleSign(input){
    const value=normalize(input.value);
    if(!value)input.value='-';
    else if(value.startsWith('-'))input.value=value.slice(1);
    else if(value.startsWith('+'))input.value='-'+value.slice(1);
    else input.value='-'+value;
    input.focus();
    try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
  }
  function currentSchool(config){return{...(defaults.school||{}),...(config.school||{})};}
  function cleanDestination(item,index){return{id:String(item?.id||`dest-${index+1}`),name:String(item?.name||`Destino ${index+1}`),lat:item?.lat??null,lng:item?.lng??null};}
  function hasValidCoordinates(item){
    if(!item)return false;
    const latitude=Number(item.lat),longitude=Number(item.lng);
    return item.lat!=null&&item.lng!=null&&String(item.lat).trim()!==''&&String(item.lng).trim()!==''&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
  }
  function recoverDestinationFromTelemetry(destination){
    if(hasValidCoordinates(destination))return destination;
    const telemetry=readJson(TELEMETRY_KEY,[]);
    const match=telemetry.find(item=>item?.destinationId===destination?.id&&Number.isFinite(Number(item?.destinationLatitude))&&Number.isFinite(Number(item?.destinationLongitude)));
    if(!match)return destination;
    return{...destination,lat:Number(match.destinationLatitude),lng:Number(match.destinationLongitude),name:destination.name||match.destinationName||'Destino'};
  }
  function getModel({persist=false}={}){
    const config=mergedConfig(readJson(CFG_KEY,{})),school=currentSchool(config);
    let destinations=Array.isArray(config.destinations)&&config.destinations.length?config.destinations.map(cleanDestination):[{id:'primary',name:school.name||'Escuela',lat:school.lat??null,lng:school.lng??null}];
    const seen=new Set();
    destinations=destinations.map((item,index)=>{let id=item.id;if(seen.has(id))id=`${id}-${index+1}`;seen.add(id);return{...item,id};});
    let activeDestinationId=String(config.activeDestinationId||destinations[0].id);
    if(!destinations.some(item=>item.id===activeDestinationId))activeDestinationId=destinations[0].id;
    const activeIndex=destinations.findIndex(item=>item.id===activeDestinationId);
    let active=destinations[activeIndex]||destinations[0];

    if(!hasValidCoordinates(active)&&hasValidCoordinates(school)){
      active={...active,name:active.name||school.name||'Destino',lat:Number(school.lat),lng:Number(school.lng)};
      destinations[activeIndex]=active;
    }else if(!hasValidCoordinates(active)){
      const recovered=recoverDestinationFromTelemetry(active);
      if(hasValidCoordinates(recovered)){active=recovered;destinations[activeIndex]=active;}
    }

    const normalized={...config,destinations,activeDestinationId,school:{name:active.name,lat:active.lat,lng:active.lng}};
    if(persist)writeConfig(normalized);
    return{config:normalized,destinations,activeDestinationId,active};
  }
  function journeyActive(){return Boolean(readJson(JOURNEY_KEY,{})?.active);}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function renderOptions(model,selectedId=model.activeDestinationId){
    els.destinationSelect.innerHTML=model.destinations.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    els.destinationSelect.value=selectedId;
  }
  function fillDestination(destination){
    if(!destination)return;
    els.nameInput.value=destination.name||'';
    els.lat.value=destination.lat==null?'':String(destination.lat);
    els.lng.value=destination.lng==null?'':String(destination.lng);
  }
  function fillOperationalSettings(config){
    els.waiting.value=String(config.thresholds?.waitingMeters??1000);
    els.ready.value=String(config.thresholds?.readyMeters??100);
    els.gate.value=String(config.thresholds?.atGateMeters??20);
    els.distanceMode.value=config.distanceMode||'direct';
  }
  function setDestinationLock(locked){
    for(const element of [els.destinationSelect,els.addDestinationBtn,els.nameInput,els.lat,els.lng,els.useCurrentBtn])element.disabled=locked;
  }
  function setDraftUi(active){
    els.saveSettingsBtn.textContent=active?'Guardar nuevo destino':'Guardar cambios';
    els.addDestinationBtn.classList.toggle('hidden',active);
    els.cancelDestinationBtn.classList.toggle('hidden',!active);
  }
  function showError(message){els.settingsError.textContent=message;els.settingsError.classList.remove('hidden');}
  function clearError(){els.settingsError.textContent='';els.settingsError.classList.add('hidden');}
  function appendTelemetry(event,extra={}){
    const items=readJson(TELEMETRY_KEY,[]),journey=readJson(JOURNEY_KEY,{}),model=getModel();
    items.unshift({at:new Date().toISOString(),journeyId:journey.id||null,event,journeyStatus:journey.status||'OUTSIDE',measurementState:'UNKNOWN',destinationId:model.activeDestinationId,destinationName:model.active.name||null,online:navigator.onLine!==false,visibility:document.visibilityState||'visible',...extra});
    RUNTIME.storage.write(TELEMETRY_KEY,items.slice(0,1000));
  }
  function emitConfig(config,reason){RUNTIME.events.emit('config:changed',{config,reason});}

  function openSettings(){
    const model=getModel({persist:true});
    draftId=null;
    renderOptions(model);
    fillDestination(model.active);
    fillOperationalSettings(model.config);
    setDestinationLock(journeyActive());
    setDraftUi(false);
    clearError();
    els.dialog.showModal();
  }
  function onDestinationChange(){
    if(journeyActive())return;
    const model=getModel(),destination=model.destinations.find(item=>item.id===els.destinationSelect.value);
    draftId=null;
    fillDestination(destination);
    setDraftUi(false);
    clearError();
  }
  function addDestination(){
    if(journeyActive()){showError('Reinicia o completa el trayecto antes de cambiar de destino.');return;}
    const model=getModel();
    draftId=`dest-${Date.now()}`;
    renderOptions(model,model.activeDestinationId);
    els.destinationSelect.innerHTML+=`<option value="${escapeHtml(draftId)}">Nuevo destino</option>`;
    els.destinationSelect.value=draftId;
    els.nameInput.value='';els.lat.value='';els.lng.value='';
    setDraftUi(true);clearError();els.nameInput.focus();
  }
  function cancelDestination(){
    if(!draftId)return;
    const model=getModel();
    draftId=null;renderOptions(model);fillDestination(model.active);setDraftUi(false);clearError();
  }
  function validateForm(){
    const latitude=parseCoordinate(els.lat.value),longitude=parseCoordinate(els.lng.value);
    const waiting=Number(els.waiting.value),ready=Number(els.ready.value),gate=Number(els.gate.value);
    const invalidCoord=(latitude===null)!=(longitude===null)||(latitude!==null&&(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180));
    if(invalidCoord||!Number.isFinite(waiting)||!Number.isFinite(ready)||!Number.isFinite(gate)||waiting<ready||ready<gate||gate<0){
      showError('Revisa coordenadas y umbrales: WAITING ≥ READY ≥ AT GATE ≥ 0.');return null;
    }
    return{latitude,longitude,waiting,ready,gate};
  }
  function saveSettings(){
    if(journeyActive()){showError('No puedes modificar el destino durante un trayecto activo. Reinícialo o complétalo primero.');return;}
    const values=validateForm();if(!values)return;
    const model=getModel(),targetId=draftId||els.destinationSelect.value||model.activeDestinationId;
    const previousId=model.activeDestinationId,previousName=model.active.name;
    const destination={id:targetId,name:els.nameInput.value.trim()||'Escuela',lat:values.latitude,lng:values.longitude};
    const destinations=model.destinations.map(item=>({...item}));
    const index=destinations.findIndex(item=>item.id===targetId);
    if(index>=0)destinations[index]=destination;else destinations.push(destination);
    const next={
      ...model.config,
      destinations,
      activeDestinationId:targetId,
      school:{name:destination.name,lat:destination.lat,lng:destination.lng},
      thresholds:{waitingMeters:values.waiting,readyMeters:values.ready,atGateMeters:values.gate},
      distanceMode:els.distanceMode.value||'direct'
    };
    writeConfig(next);
    if(previousId!==targetId)appendTelemetry('DESTINATION_CHANGED',{fromDestinationId:previousId,fromDestinationName:previousName,toDestinationId:targetId,toDestinationName:destination.name,destinationLatitude:destination.lat,destinationLongitude:destination.lng});
    draftId=null;renderOptions(getModel(),targetId);setDraftUi(false);clearError();els.dialog.close();emitConfig(next,'settings-saved');
  }
  function useCurrentAsSchool(){
    const position=LOCATION.current();
    if(!position?.coords){showError('Todavía no hay una lectura GPS disponible.');return;}
    els.lat.value=String(position.coords.latitude);
    els.lng.value=String(position.coords.longitude);
    clearError();
  }

  els.latMinusBtn.addEventListener('click',()=>toggleSign(els.lat));
  els.lngMinusBtn.addEventListener('click',()=>toggleSign(els.lng));
  els.settingsBtn.addEventListener('click',openSettings);
  els.destinationSelect.addEventListener('change',onDestinationChange);
  els.addDestinationBtn.addEventListener('click',addDestination);
  els.cancelDestinationBtn.addEventListener('click',cancelDestination);
  els.saveSettingsBtn.addEventListener('click',saveSettings);
  els.useCurrentBtn.addEventListener('click',useCurrentAsSchool);

  const initial=getModel({persist:true});
  setDraftUi(false);
  emitConfig(initial.config,'destinations-initialized');
  window.NEXUS_TUTOR_DESTINATIONS={getModel};
})();
