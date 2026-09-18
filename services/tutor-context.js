(()=>{
'use strict';
const TUTOR_ID='TUT0001';
const cfg=window.NEXUS_TUTOR_DEFAULTS||{};
const base=String(cfg.gatewayBaseUrl||'').replace(/\/$/,'');
const url=path=>`${base}${path}`;
const getJson=async path=>{const response=await fetch(url(path),{headers:{Accept:'application/json'}});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok){const error=new Error(data?.error||`HTTP_${response.status}`);error.data=data;throw error;}return data;};
const load=async()=>{const [bootstrap,profile]=await Promise.all([getJson('/bootstrap'),getJson(`/api/tutor/me?tutorId=${encodeURIComponent(TUTOR_ID)}`)]);const context={instance:bootstrap.instance||null,gateway:bootstrap.gateway||null,tutor:profile.tutor||null,students:Array.isArray(profile.students)?profile.students:[]};window.dispatchEvent(new CustomEvent('nexus:tutor-context',{detail:context}));return context;};
const studentOptions=(select,students)=>{if(!select)return;select.replaceChildren(...students.map(student=>{const option=document.createElement('option');option.value=String(student.studentId);option.textContent=student.name;return option;}));};
const render=context=>{
 document.querySelectorAll('[data-instance-name]').forEach(node=>node.textContent=context.instance?.name||'Institución');
 document.querySelectorAll('[data-tutor-name]').forEach(node=>node.textContent=context.tutor?.name||context.tutor?.tutorId||TUTOR_ID);
 document.querySelectorAll('[data-student-select]').forEach(select=>studentOptions(select,context.students));
 document.querySelectorAll('[data-context-state]').forEach(node=>{node.textContent=`${context.students.length} alumno${context.students.length===1?'':'s'} autorizado${context.students.length===1?'':'s'}`;node.className='badge badge-ok';});
};
const fail=error=>document.querySelectorAll('[data-context-state]').forEach(node=>{node.textContent=`Gateway: ${error.message}`;node.className='badge badge-warn';});
const start=()=>load().then(context=>{render(context);window.NEXUS_TUTOR_CONTEXT.current=context;return context;}).catch(error=>{fail(error);console.warn('TUTOR_CONTEXT_NOT_AVAILABLE',error);return null;});
window.NEXUS_TUTOR_CONTEXT={TUTOR_ID,current:null,load,start};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();