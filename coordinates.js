(()=>{
  'use strict';
  const CFG_KEY='nexusTutorConfigV1',JOURNEY_KEY='nexusTutorJourneyV1',TELEMETRY_KEY='nexusTutorTelemetryV1';
  const defaults=window.NEXUS_TUTOR_DEFAULTS||{};
  const lat=document.querySelector('#cfgLat');
  const lng=document.querySelector('#cfgLng');
  const nameInput=document.querySelector('#cfgSchoolName');
  const destinationSelect=document.querySelector('#cfgDestination');
  const addDestinationBtn=document.querySelector('#addDestinationBtn');
  const settingsBtn=document.querySelector('#settingsBtn');
  const saveSettingsBtn=document.querySelector('#saveSettingsBtn');
  const useCurrentBtn=document.querySelector('#useCurrentAsSchoolBtn');
  const settingsError=document.querySelector('#settingsError');
  let draftId=null,pendingSave=null;

  function normalize(value){return String(value??'').trim().replace(/[−–—]/g,'-');}
  function toggleSign(input){
    if(!input)return;
    const value=normalize(input.value);
    if(!value){input.value='-';}
    else if(value.startsWith('-')){input.value=value.slice(1);}
    else if(value.startsWith('+')){input.value='-'+value.slice(1);}
    else{input.value='-'+value;}
    input.focus();
    try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
  }
  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
  function writeConfig(config){localStorage.setItem(CFG_KEY,JSON.stringify(config));}
  function currentSchool(config){return{...(defaults.school||{}),...(config.school||{})};}
  function cleanDestination(item,index){return{id:String(item?.id||`dest-${index+1}`),name:String(item?.name||`Destino ${index+1}`),lat:item?.lat??null,lng:item?.lng??null};}
  function getModel({persist=false}={}){
    const config=readJson(CFG_KEY,{}),school=currentSchool(config);
    let destinations=Array.isArray(config.destinations)&&config.destinations.length?config.destinations.map(cleanDestination):[{id:'primary',name:school.name||'Escuela',lat:school.lat??null,lng:school.lng??null}];
    const seen=new Set();destinations=destinations.map((item,index)=>{let id=item.id;if(seen.has(id))id=`${id}-${index+1}`;seen.add(id);return{...item,id};});
    let activeDestinationId=String(config.activeDestinationId||destinations[0].id);
    if(!destinations.some(item=>item.id===activeDestinationId))activeDestinationId=destinations[0].id;
    const active=destinations.find(item=>item.id===activeDestinationId)||destinations[0];
    if(persist)writeConfig({...config,destinations,activeDestinationId,school:{name:active.name,lat:active.lat,lng:active.lng}});
    return{config,destinations,activeDestinationId,active};
  }
  function journeyActive(){return Boolean(readJson(JOURNEY_KEY,{})?.active);}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function renderOptions(model,selectedId=model.activeDestinationId){
    if(!destinationSelect)return;
    destinationSelect.innerHTML=model.destinations.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    destinationSelect.value=selectedId;
  }
  function fillDestination(destination){
    if(!destination)return;
    if(nameInput)nameInput.value=destination.name||'';
    if(lat)lat.value=destination.lat==null?'':String(destination.lat);
    if(lng)lng.value=destination.lng==null?'':String(destination.lng);
  }
  function setDestinationLock(locked){
    for(const element of [destinationSelect,addDestinationBtn,nameInput,lat,lng,useCurrentBtn])if(element)element.disabled=locked;
  }
  function showError(message){if(!settingsError)return;settingsError.textContent=message;settingsError.classList.remove('hidden');}
  function clearError(){settingsError?.classList.add('hidden');}
  function appendTelemetry(event,extra={}){
    const items=readJson(TELEMETRY_KEY,[]),journey=readJson(JOURNEY_KEY,{}),model=getModel();
    items.unshift({at:new Date().toISOString(),journeyId:journey.id||null,event,journeyStatus:journey.status||'OUTSIDE',measurementState:'UNKNOWN',destinationId:model.activeDestinationId,destinationName:model.active.name||null,online:navigator.onLine!==false,visibility:document.visibilityState||'visible',...extra});
    localStorage.setItem(TELEMETRY_KEY,JSON.stringify(items.slice(0,1000)));
  }
  function onSettingsOpen(){
    const model=getModel({persist:true});draftId=null;pendingSave=null;renderOptions(model);destinationSelect.value=model.activeDestinationId;setDestinationLock(journeyActive());clearError();
  }
  function onDestinationChange(){
    if(journeyActive())return;
    const model=getModel(),destination=model.destinations.find(item=>item.id===destinationSelect.value);draftId=null;fillDestination(destination);clearError();
  }
  function addDestination(){
    if(journeyActive()){showError('Reinicia o completa el trayecto antes de cambiar de destino.');return;}
    const model=getModel();draftId=`dest-${Date.now()}`;renderOptions(model,model.activeDestinationId);
    destinationSelect.innerHTML+=`<option value="${escapeHtml(draftId)}">Nuevo destino</option>`;destinationSelect.value=draftId;
    if(nameInput)nameInput.value='';if(lat)lat.value='';if(lng)lng.value='';clearError();nameInput?.focus();
  }
  function beforeSave(event){
    if(journeyActive()){
      event.preventDefault?.();event.stopImmediatePropagation?.();showError('No puedes modificar el destino durante un trayecto activo. Reinícialo o complétalo primero.');return;
    }
    const model=getModel();pendingSave={destinations:model.destinations.map(item=>({...item})),previousId:model.activeDestinationId,previousName:model.active.name,targetId:draftId||destinationSelect?.value||model.activeDestinationId};
  }
  function afterSave(){
    if(!pendingSave)return;
    const saved=readJson(CFG_KEY,{}),school=currentSchool(saved),targetId=pendingSave.targetId;
    const destination={id:targetId,name:school.name||'Destino',lat:school.lat??null,lng:school.lng??null};
    const destinations=pendingSave.destinations.slice(),index=destinations.findIndex(item=>item.id===targetId);
    if(index>=0)destinations[index]=destination;else destinations.push(destination);
    writeConfig({...saved,destinations,activeDestinationId:targetId,school:{name:destination.name,lat:destination.lat,lng:destination.lng}});
    if(pendingSave.previousId!==targetId)appendTelemetry('DESTINATION_CHANGED',{fromDestinationId:pendingSave.previousId,fromDestinationName:pendingSave.previousName,toDestinationId:targetId,toDestinationName:destination.name,destinationLatitude:destination.lat,destinationLongitude:destination.lng});
    draftId=null;pendingSave=null;const model=getModel();renderOptions(model);clearError();
  }

  document.querySelector('#latMinusBtn')?.addEventListener('click',()=>toggleSign(lat));
  document.querySelector('#lngMinusBtn')?.addEventListener('click',()=>toggleSign(lng));
  settingsBtn?.addEventListener('click',onSettingsOpen);
  destinationSelect?.addEventListener('change',onDestinationChange);
  addDestinationBtn?.addEventListener('click',addDestination);
  saveSettingsBtn?.addEventListener('click',beforeSave,true);
  saveSettingsBtn?.addEventListener('click',afterSave);
  getModel({persist:true});
})();
