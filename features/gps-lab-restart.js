(()=>{
'use strict';
const KEY='nexusTutorPickupLabV3';
const TELEMETRY_KEY='nexusTutorGpsTelemetryV1';
const LOG_KEY='nexusTutorGpsLogV1';
const panel=()=>document.querySelector('#tab-gps');
function clearVisuals(){
  const p=panel();if(!p)return;
  p.querySelectorAll('[data-request-summary]').forEach(n=>n.textContent='Sin solicitudes');
  const status=p.querySelector('[data-gps-status]');if(status){status.textContent='SIN SOLICITUD';status.className='status-pill status-outside';}
  const distance=p.querySelector('[data-gps-distance]');if(distance)distance.textContent='—';
  const progress=p.querySelector('[data-gps-progress]');if(progress)progress.style.width='0%';
  p.querySelectorAll('[data-gps-marker]').forEach(n=>n.classList.remove('active'));
  const next=p.querySelector('[data-gps-next-poll]');if(next)next.textContent='—';
  const last=p.querySelector('[data-gps-last-event]');if(last)last.textContent='—';
  const done=p.querySelector('[data-gps-complete-message]');if(done)done.hidden=true;
  const telemetry=p.querySelector('[data-gps-telemetry]');if(telemetry)telemetry.innerHTML='<div class="empty-log">Sin telemetría GPS todavía.</div>';
  const log=p.querySelector('[data-gps-log]');if(log)log.innerHTML='<div class="empty-log">Sin eventos de seguimiento.</div>';
  p.querySelectorAll('[data-refresh-batch],[data-cancel-batch],[data-gps-batch]').forEach(b=>b.disabled=true);
  const create=p.querySelector('[data-create-batch]');if(create)create.disabled=false;
  const reset=p.querySelector('[data-delete-gps-requests]');if(reset){reset.disabled=false;reset.textContent='Reiniciar recorrido';}
}
function resetJourney(){
  const lab=window.NEXUS_TUTOR_PICKUP_LAB;
  lab?.stopGpsWatch?.();
  try{
    const state=JSON.parse(localStorage.getItem(KEY)||'{}')||{};
    state.gps={requests:{}};
    localStorage.setItem(KEY,JSON.stringify(state));
  }catch{
    localStorage.setItem(KEY,JSON.stringify({gps:{requests:{}}}));
  }
  localStorage.removeItem(TELEMETRY_KEY);
  localStorage.removeItem(LOG_KEY);
  lab?.scheduleGpsPoll?.();
  clearVisuals();
}
function bindButton(){
  const button=panel()?.querySelector('[data-delete-gps-requests]');
  if(!button)return;
  button.disabled=false;
  button.textContent='Reiniciar recorrido';
  if(button.dataset.resetBound==='1')return;
  button.dataset.resetBound='1';
  button.addEventListener('click',resetJourney);
}
function keepEnabled(){const button=panel()?.querySelector('[data-delete-gps-requests]');if(button)button.disabled=false;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindButton,{once:true});else bindButton();
window.addEventListener('nexus:tutor-students-rendered',event=>{if(event.detail?.mode==='gps'){bindButton();keepEnabled();}});
setInterval(keepEnabled,1000);
window.NEXUS_TUTOR_GPS_RESTART={reset:resetJourney,clearLocal:resetJourney};
})();