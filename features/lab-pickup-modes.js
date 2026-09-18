(()=>{
'use strict';
const KEY='nexusTutorPickupLabV3';
const MODES={scheduled:'SCHEDULED',eta:'ETA',gps:'GPS'};
const TERMINAL=new Set(['CANCELLED','COMPLETED','EXPIRED']);
const POLL_MS={OUTSIDE:60000,REQUESTED:60000,WAITING:30000,READY:10000,AT_GATE:5000};
let pollTimer=null,pollRunning=false;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}};
const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
const contextFor=mode=>window.NEXUS_TUTOR_CONTEXT?.profiles?.[mode]||null;
const panelFor=mode=>document.querySelector(`#tab-${mode}`);
const selectedIds=mode=>window.NEXUS_TUTOR_CONTEXT?.selectedStudentIds(panelFor(mode))||[];
const tutorIdFor=mode=>contextFor(mode)?.tutor?.tutorId||window.NEXUS_TUTOR_CONTEXT?.LAB_TUTORS?.[mode];
const requestIdsFor=mode=>Object.values(read()[mode]?.requests||{}).filter(r=>r.requestId&&!TERMINAL.has(r.status)).map(r=>r.requestId);
function paint(mode){const panel=panelFor(mode),bucket=read()[mode]||{},requests=bucket.requests||{};if(!panel)return;panel.querySelectorAll('[data-request-summary]').forEach(node=>{const items=Object.values(requests);node.textContent=items.length?items.map(r=>`${r.studentName||r.studentId}: ${r.status||r.result}`).join(' · '):'Sin solicitudes';});const active=Object.values(requests).some(r=>r.requestId&&!TERMINAL.has(r.status));panel.querySelectorAll('[data-create-batch]').forEach(b=>b.disabled=active);panel.querySelectorAll('[data-refresh-batch]').forEach(b=>b.disabled=!active);panel.querySelectorAll('[data-cancel-batch]').forEach(b=>b.disabled=!active);panel.querySelectorAll('[data-gps-batch]').forEach(b=>b.disabled=!active);}
function distance(){const value=Number(localStorage.getItem('nexusTutorLabDistanceMeters')||document.querySelector('#manualDistanceInput')?.value||0);return Number.isFinite(value)&&value>=0?value:0;}
function mergeResult(mode,result){const state=read(),bucket=state[mode]||{requests:{}};for(const item of result?.requests||result?.results||[]){const entry=Object.values(bucket.requests||{}).find(r=>r.requestId===item.requestId);if(entry)entry.status=item.status||entry.status;}state[mode]=bucket;write(state);paint(mode);return bucket;}
async function create(mode){const context=contextFor(mode),studentIds=selectedIds(mode),tutorId=tutorIdFor(mode);if(!context)throw new Error('Contexto de tutor no disponible.');if(!studentIds.length)throw new Error('Selecciona al menos un alumno.');const payload={tutorId,studentIds,mode:MODES[mode]};if(mode==='gps')payload.distanceMeters=distance();if(mode==='eta')payload.etaMinutes=Math.max(1,Math.round((distance()/1000)/20*60));if(mode==='scheduled')payload.scheduledAt=new Date(Date.now()+20*60000).toISOString();const result=await window.GatewayClient.createPickupRequests(payload);const state=read(),bucket=state[mode]||{requests:{}};bucket.requests=bucket.requests||{};for(const item of result.results||[]){const student=context.students.find(s=>String(s.studentId)===String(item.studentId));const request=item.request||{};bucket.requests[item.studentId]={studentId:String(item.studentId),studentName:student?.name||String(item.studentId),result:item.result||item.code||'UNKNOWN',requestId:request.requestId||item.requestId||null,status:request.status||item.status||(item.result==='CREATED'?'REQUESTED':item.result),mode:MODES[mode]};}state[mode]=bucket;write(state);paint(mode);if(mode==='gps')scheduleGpsPoll(0);return result;}
async function refresh(mode){const ids=requestIdsFor(mode);if(!ids.length)return null;const result=await window.GatewayClient.pickupStatus(tutorIdFor(mode),ids);mergeResult(mode,result);return result;}
async function gps(mode='gps'){const ids=requestIdsFor(mode);if(!ids.length)return null;const result=await window.GatewayClient.updatePickupGps(tutorIdFor(mode),ids,distance());mergeResult(mode,result);return result;}
async function cancel(mode){const state=read(),bucket=state[mode]||{requests:{}};for(const entry of Object.values(bucket.requests||{})){if(!entry.requestId||TERMINAL.has(entry.status))continue;const result=await window.GatewayClient.cancelPickupRequest(entry.requestId);entry.status=result.request?.status||result.status||'CANCELLED';}state[mode]=bucket;write(state);paint(mode);if(mode==='gps')scheduleGpsPoll(0);}
function gpsStatuses(){return Object.values(read().gps?.requests||{}).filter(r=>r.requestId&&!TERMINAL.has(r.status)).map(r=>String(r.status||'REQUESTED').toUpperCase());}
function nextGpsDelay(){const statuses=gpsStatuses();if(!statuses.length)return null;return Math.min(...statuses.map(status=>POLL_MS[status]||60000));}
function scheduleGpsPoll(delay){if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}const next=delay??nextGpsDelay();if(next===null)return;pollTimer=setTimeout(runGpsPoll,next);}
async function refreshOtherTutorsAtGate(){await Promise.allSettled(['scheduled','eta'].map(mode=>refresh(mode)));}
async function runGpsPoll(){if(pollRunning)return;pollRunning=true;try{const before=gpsStatuses();if(!before.length)return;await refresh('gps');const after=gpsStatuses();if(after.includes('AT_GATE'))await refreshOtherTutorsAtGate();}catch(error){console.error('GPS_STATUS_POLL_FAILED',error);}finally{pollRunning=false;scheduleGpsPoll();}}
function bind(mode){const panel=panelFor(mode);if(!panel)return;panel.querySelector('[data-create-batch]')?.addEventListener('click',()=>create(mode).catch(console.error));panel.querySelector('[data-refresh-batch]')?.addEventListener('click',()=>refresh(mode).catch(console.error));panel.querySelector('[data-cancel-batch]')?.addEventListener('click',()=>cancel(mode).catch(console.error));panel.querySelector('[data-gps-batch]')?.addEventListener('click',()=>gps(mode).then(()=>scheduleGpsPoll()).catch(console.error));paint(mode);}
function init(){Object.keys(MODES).forEach(bind);if(requestIdsFor('gps').length)scheduleGpsPoll(0);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('nexus:tutor-students-rendered',event=>paint(event.detail.mode));
window.NEXUS_TUTOR_PICKUP_LAB={create,refresh,gps,cancel,read,scheduleGpsPoll};
})();