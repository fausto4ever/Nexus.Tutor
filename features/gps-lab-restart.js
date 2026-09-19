(()=>{
'use strict';
const KEY='nexusTutorPickupLabV3';
const TELEMETRY_KEY='nexusTutorGpsTelemetryV1';
const LOG_KEY='nexusTutorGpsLogV1';
const panel=()=>document.querySelector('#tab-gps');
function clearLocal(){
  window.NEXUS_TUTOR_LOCATION?.stop?.();
  try{const state=JSON.parse(localStorage.getItem(KEY)||'{}');state.gps={requests:{}};localStorage.setItem(KEY,JSON.stringify(state));}catch{localStorage.setItem(KEY,JSON.stringify({gps:{requests:{}}}));}
  localStorage.removeItem(TELEMETRY_KEY);
  localStorage.removeItem(LOG_KEY);
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
}
function resetLocal(){
  const button=panel()?.querySelector('[data-delete-gps-requests]');
  if(button){button.disabled=true;button.textContent='Borrando…';}
  clearLocal();
  if(button){button.disabled=false;button.textContent='Borrar requests';}
}
function ensureButton(){
  const p=panel();if(!p||p.querySelector('[data-delete-gps-requests]'))return;
  const cancel=p.querySelector('[data-cancel-batch]');
  const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.dataset.deleteGpsRequests='';button.textContent='Borrar requests';button.addEventListener('click',resetLocal);
  if(cancel)cancel.insertAdjacentElement('afterend',button);else p.appendChild(button);
}
function bind(){ensureButton();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
window.addEventListener('nexus:tutor-students-rendered',event=>{if(event.detail?.mode==='gps')ensureButton();});
window.NEXUS_TUTOR_GPS_RESTART={reset:resetLocal,clearLocal};
})();