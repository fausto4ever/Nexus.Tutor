(()=>{
'use strict';
const KEY='nexusTutorPickupLabV2';
const modes=[
 {studentId:'1001',mode:'SCHEDULED',title:'Sin ubicación',contextMode:'scheduled'},
 {studentId:'1002',mode:'ETA',title:'GPS solo ETA',contextMode:'eta'},
 {studentId:'1003',mode:'GPS',title:'GPS ALL',contextMode:'gps'}
];
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}};
const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
const contextFor=m=>window.NEXUS_TUTOR_CONTEXT?.profiles?.[m.contextMode]||null;
const studentFor=m=>{const context=contextFor(m);return context?.students?.find(s=>String(s.studentId)===String(m.studentId))||context?.students?.[0]||null;};
const requestGateway=async payload=>window.GatewayClient.createPickupRequest(payload);
const cancelGateway=async request=>window.GatewayClient.cancelPickupRequest(request.requestId);
function stateText(r){if(!r)return'SIN SOLICITUD';return `${r.status}${r.etaMinutes!=null?` · ETA ${r.etaMinutes} min`:''}`;}
function render(){const state=read();for(const m of modes){const card=document.querySelector(`[data-lab-student="${m.studentId}"]`);if(!card)continue;const r=state[m.studentId];card.querySelector('.lab-status').textContent=stateText(r);card.querySelector('.lab-start').hidden=Boolean(r&& !['CANCELLED','COMPLETED','EXPIRED'].includes(r.status));card.querySelector('.lab-cancel').hidden=!r||['CANCELLED','COMPLETED','EXPIRED'].includes(r.status);}}
async function start(m){
  const state=read(),context=contextFor(m),student=studentFor(m);
  if(!context||!student)throw new Error('Contexto de tutor/alumno no disponible.');
  let distanceMeters=null,eta=null;
  if(m.mode==='ETA'||m.mode==='GPS'){
    const d=Number(localStorage.getItem('nexusTutorLabDistanceMeters')||document.querySelector('#manualDistanceInput')?.value||0);
    if(Number.isFinite(d)&&d>=0)distanceMeters=d;
    if(m.mode==='ETA'&&distanceMeters>0)eta=Math.max(1,Math.round((distanceMeters/1000)/20*60));
  }
  const payload={tutorId:context.tutor?.tutorId,studentId:student.studentId,mode:m.mode,arrivalMode:m.mode,locationId:student.pickupLocation?.locationId||null};
  if(distanceMeters!==null)payload.distanceMeters=distanceMeters;
  if(eta!==null)payload.etaMinutes=eta;
  const result=await requestGateway(payload);
  const request=result.request||result;
  state[m.studentId]={requestId:request.requestId,status:request.status||'REQUESTED',mode:m.mode,createdAt:request.createdAt||new Date().toISOString(),etaMinutes:request.etaMinutes??eta,gateway:'CONNECTED',created:result.created===true,alreadyExists:result.alreadyExists===true};
  write(state);render();return state[m.studentId];
}
async function cancel(m){const state=read(),r=state[m.studentId];if(!r)return;const result=await cancelGateway(r),request=result.request||result;r.status=request.status||'CANCELLED';r.cancelledAt=new Date().toISOString();write(state);render();return r;}
function init(){const section=document.querySelector('#pickupLabModes');if(!section)return;for(const m of modes){const c=section.querySelector(`[data-lab-student="${m.studentId}"]`);if(!c)continue;c.querySelector('.lab-start').addEventListener('click',()=>start(m).catch(console.error));c.querySelector('.lab-cancel').addEventListener('click',()=>cancel(m).catch(console.error));}render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.NEXUS_TUTOR_PICKUP_LAB={requestGateway,cancelGateway,start,cancel,read};
})();