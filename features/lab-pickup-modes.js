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
function css(){if(document.querySelector('#pickupLabStyle'))return;const s=document.createElement('style');s.id='pickupLabStyle';s.textContent=`
.pickup-lab{display:grid;gap:14px;padding:18px;overflow:hidden}
.pickup-lab-head strong{display:block;font-size:1.08rem;line-height:1.25}.pickup-lab-head p{margin-top:4px}
.pickup-mode-grid{display:grid;grid-template-columns:1fr;gap:10px}
.pickup-mode{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;align-items:center;padding:14px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-card-subtle)}
.pickup-mode>small:first-child{grid-column:1;font-size:.66rem;font-weight:800;letter-spacing:.08em;color:var(--text-eyebrow)}
.pickup-mode>strong{grid-column:1;font-size:.95rem;line-height:1.2;color:var(--text-main)}
.pickup-mode>small:not(:first-child){grid-column:1/-1;color:var(--text-muted);font-size:.74rem;line-height:1.4}
.pickup-mode .lab-status{grid-column:2;grid-row:1/span 2;justify-self:end;align-self:start;padding:5px 9px;border-radius:var(--radius-full);background:var(--accent-warn-bg);color:var(--accent-warn-text);font-size:.65rem;font-weight:800;white-space:nowrap}
.pickup-mode .lab-start,.pickup-mode .lab-cancel{grid-column:1/-1;width:100%;min-height:44px;margin-top:5px;border-radius:var(--radius-md);font:inherit;font-weight:800;cursor:pointer;transition:transform .15s ease,background-color .15s ease,border-color .15s ease}
.pickup-mode .lab-start{border:1px solid var(--primary);background:var(--primary);color:var(--primary-text);box-shadow:0 5px 12px rgba(2,132,199,.18)}
.pickup-mode .lab-cancel{border:1px solid var(--accent-danger-text);background:transparent;color:var(--accent-danger-text)}
.pickup-mode .lab-start:active,.pickup-mode .lab-cancel:active{transform:scale(.985)}
.pickup-mode .lab-cancel[hidden]{display:none}.gateway-placeholder{grid-column:1/-1;text-align:center;font-size:.66rem;color:var(--text-muted)}
@media(max-width:390px){.pickup-mode{grid-template-columns:1fr}.pickup-mode .lab-status{grid-column:1;grid-row:auto;justify-self:start}}
`;document.head.appendChild(s);}
function stateText(r){if(!r)return'SIN SOLICITUD';return `${r.status}${r.etaMinutes!=null?` · ETA ${r.etaMinutes} min`:''}`;}
function render(){const state=read();for(const m of modes){const card=document.querySelector(`[data-lab-student="${m.studentId}"]`);if(!card)continue;const r=state[m.studentId];card.querySelector('.lab-status').textContent=stateText(r);card.querySelector('.lab-start').hidden=Boolean(r&&r.status!=='CANCELLED');card.querySelector('.lab-cancel').hidden=!r||r.status==='CANCELLED';}}
async function start(m){const state=read();let eta=null;if(m.mode==='ETA_ONCE'){const d=Number(localStorage.getItem('nexusTutorLabDistanceMeters')||document.querySelector('#manualDistanceInput')?.value||0);if(Number.isFinite(d)&&d>0)eta=Math.max(1,Math.round((d/1000)/20*60));}const result=await requestGateway({studentId:m.studentId,mode:m.mode,status:'REQUESTED'});state[m.studentId]={requestId:result.requestId,status:'REQUESTED',mode:m.mode,createdAt:new Date().toISOString(),etaMinutes:eta,gateway:'PENDING'};write(state);render();}
async function cancel(m){const state=read(),r=state[m.studentId];if(!r)return;await cancelGateway(r);r.status='CANCELLED';r.cancelledAt=new Date().toISOString();write(state);render();}
function init(){const section=document.querySelector('#pickupLabModes');if(!section)return;css();for(const m of modes){const c=section.querySelector(`[data-lab-student="${m.studentId}"]`);if(!c)continue;c.querySelector('.lab-start').addEventListener('click',()=>start(m));c.querySelector('.lab-cancel').addEventListener('click',()=>cancel(m));}render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.NEXUS_TUTOR_PICKUP_LAB={requestGateway,cancelGateway};
})();