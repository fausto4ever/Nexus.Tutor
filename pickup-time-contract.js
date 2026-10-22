(()=>{'use strict';
const C=window.TUTOR_EXPERIENCE_CONFIG||{};
const LIFECYCLE=new Set(['requestedAt','updatedAt','readyAt','atGateAt','arrivalTriggeredAt','endedAt','completedAt']);
const isoZ=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v);
function instanceTimeZone(){return C.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}
function formatUtc(instant,options={dateStyle:'medium',timeStyle:'short'}){if(!instant)return'';if(!isoZ(instant))return String(instant);return new Intl.DateTimeFormat(C.locale||'es-MX',{...options,timeZone:instanceTimeZone()}).format(new Date(instant))}
function validatePickupTimes(value,path='response',issues=[]){if(!value||typeof value!=='object')return issues;for(const[k,v]of Object.entries(value)){const p=`${path}.${k}`;if((LIFECYCLE.has(k)||k==='scheduledAt')&&v!=null&&!isoZ(v))issues.push({path:p,value:v,expected:'UTC ISO-8601 Z'});if(v&&typeof v==='object')validatePickupTimes(v,p,issues)}return issues}
function stripLifecycleTimestamps(value){if(Array.isArray(value))return value.map(stripLifecycleTimestamps);if(!value||typeof value!=='object')return value;const out={};for(const[k,v]of Object.entries(value)){if(LIFECYCLE.has(k))continue;out[k]=stripLifecycleTimestamps(v)}return out}
window.NexusPickupTime={gatewayContract:'0.20.9',formatUtc,validatePickupTimes,stripLifecycleTimestamps,isUtcZ:isoZ,timeZone:instanceTimeZone};
const nativeFetch=window.fetch.bind(window);window.fetch=async(input,opt={})=>{const url=String(input),isPickup=url.includes('/api/pickup-requests');let next=opt;if(isPickup&&opt.body&&typeof opt.body==='string'){try{const body=JSON.parse(opt.body),safe=stripLifecycleTimestamps(body);next={...opt,body:JSON.stringify(safe)}}catch{}}
const response=await nativeFetch(input,next);if(isPickup){try{const data=await response.clone().json(),issues=validatePickupTimes(data);if(issues.length)console.warn('[Nexus.Tutor] Gateway 0.20.9 timestamp contract violation',issues)}catch{}}return response};
})();