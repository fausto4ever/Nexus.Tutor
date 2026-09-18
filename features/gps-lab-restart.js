(()=>{
'use strict';
const KEY='nexusTutorPickupLabV3';
const TELEMETRY_KEY='nexusTutorGpsTelemetryV1';
const LOG_KEY='nexusTutorGpsLogV1';
const gpsPanel=()=>document.querySelector('#tab-gps');
const gpsButton=()=>gpsPanel()?.querySelector('[data-create-batch]');
function enableRestart(){const button=gpsButton();if(button)button.disabled=false;}
function resetGpsLab(){
  window.NEXUS_TUTOR_LOCATION?.stop?.();
  const state=window.NEXUS_TUTOR_PICKUP_LAB?.read?.()||{};
  state.gps={requests:{}};
  localStorage.setItem(KEY,JSON.stringify(state));
  localStorage.removeItem(TELEMETRY_KEY);
  localStorage.removeItem(LOG_KEY);
}
function bind(){
  const button=gpsButton();
  if(!button)return;
  enableRestart();
  button.addEventListener('click',()=>{
    resetGpsLab();
    setTimeout(enableRestart,0);
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
window.addEventListener('nexus:tutor-students-rendered',event=>{if(event.detail?.mode==='gps')enableRestart();});
window.NEXUS_TUTOR_GPS_RESTART={reset:resetGpsLab};
})();