(()=>{
'use strict';
const KEY='nexusTutorPickupLabV1';
const modes=[
 {studentId:'1001',mode:'NO_GPS',title:'Sin ubicación'},
 {studentId:'1002',mode:'ETA_ONCE',title:'GPS solo ETA'},
 {studentId:'1003',mode:'GPS_ALL',title:'GPS ALL'}
];
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}};
const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
const requestGateway=async payload=>({ok:true,placeholder:true,requestId:`LAB-${payload.studentId}-${Date.now()}`,status:'REQUESTED'});
const cancelGateway=async request=>({ok:true,placeholder:true,requestId:request.requestId,status:'CANCELLED'});
function css(){if(document.querySelector('#pickupLabStyle'))return;const s=document.createElement('style');s.id='pickupLabStyle';s.textContent=`.pickup-lab{display:grid;gap:12px}.pickup-lab-head{display:flex;justify-content:space-between;gap:12px;align-items:end}.pickup-lab-head p{margin:3px 0 0}.pickup-mode-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pickup-mode{border:1px solid var(--line);border-radius:16px;padding:14px;display:grid;gap:9px;background:var(--card)}.pickup-mode strong{font-size:.9rem}.pickup-mode small{color:var(--muted);line-height:1.35}.pickup-mode .lab-status{font-size:.72rem;font-weight:800}.pickup-mode button{width:100%;border-radius:12px;padding:11px;font:inherit;font-weight:800;cursor:pointer}.pickup-mode .lab-start{border:0;background:var(--accent);color:white}.pickup-mode .lab-cancel{background:transparent;color:var(--danger);border:1px solid currentColor}.pickup-mode .lab-cancel[hidden]{display:none}.gateway-placeholder{font-size:.7rem;color:var(--muted)}@media(max-width:620px){.pickup-mode-grid{grid-template-columns:1fr}}`;document.head.appendChild(s);}
function stateText(r){if(!r)return'SIN SOLICITUD';return `${r.status}${r.etaMinutes!=null?` · ETA ${r.etaMinutes} min`:''}`;}
function render(){const state=read();for(const m of modes){const card=document.querySelector(`[data-lab-student="${m.studentId}"]`);if(!card)continue;const r=state[m.studentId];card.querySelector('.lab-status').textContent=stateText(r);card.querySelector('.lab-start').hidden=Boolean(r&&r.status!=='CANCELLED');card.querySelector('.lab-cancel').hidden=!r||r.status==='CANCELLED';}}
async function start(m){const state=read();let eta=null;if(m.mode==='ETA_ONCE'){const d=Number(localStorage.getItem('nexusTutorLabDistanceMeters')||document.querySelector('#manualDistanceInput')?.value||0);if(Number.isFinite(d)&&d>0)eta=Math.max(1,Math.round((d/1000)/20*60));}const result=await requestGateway({studentId:m.studentId,mode:m.mode,status:'REQUESTED'});state[m.studentId]={requestId:result.requestId,status:'REQUESTED',mode:m.mode,createdAt:new Date().toISOString(),etaMinutes:eta,gateway:'PENDING'};write(state);render();}
async function cancel(m){const state=read(),r=state[m.studentId];if(!r)return;await cancelGateway(r);r.status='CANCELLED';r.cancelledAt=new Date().toISOString();write(state);render();}
function init(){const section=document.querySelector('#pickupLabModes');if(!section)return;css();for(const m of modes){const c=section.querySelector(`[data-lab-student="${m.studentId}"]`);if(!c)continue;c.querySelector('.lab-start').addEventListener('click',()=>start(m));c.querySelector('.lab-cancel').addEventListener('click',()=>cancel(m));}render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.NEXUS_TUTOR_PICKUP_LAB={requestGateway,cancelGateway};
})();