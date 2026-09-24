(()=>{
  'use strict';
  const cfg=window.APP_INSTANCE||{};
  const baseUrl=String(cfg.GATEWAY_URL||'').replace(/\/$/,'');
  const nativeFetch=window.fetch.bind(window);
  const GET_ROUTES={health:'/api/version'};
  function endpoint(path){if(!baseUrl)throw new Error('Gateway no configurado.');return baseUrl+path;}
  async function parseResponse(response){let data;try{data=await response.json();}catch{throw new Error(`Respuesta inválida del Gateway (${response.status}).`);}if(!response.ok||data?.ok===false){const err=new Error(data?.detail||data?.error||`Gateway HTTP ${response.status}`);err.code=data?.code||data?.error||'';err.id=data?.id||'';err.expectedRevision=data?.expectedRevision;err.currentRevision=data?.currentRevision;err.data=data;throw err;}return data;}
  async function get(action,params={}){const route=GET_ROUTES[action];if(!route)throw new Error(`GET action no soportada por Gateway: ${action}`);const url=new URL(endpoint(route));for(const [key,value] of Object.entries(params))if(value!==''&&value!==undefined&&value!==null)url.searchParams.set(key,String(value));return parseResponse(await nativeFetch(url,{cache:'no-store'}));}
  async function post(path,body){return parseResponse(await nativeFetch(endpoint(path),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{}),cache:'no-store'}));}
  async function bootstrap(){return parseResponse(await nativeFetch(endpoint('/bootstrap'),{cache:'no-store'}));}
  async function tutor(tutorId){const id=String(tutorId||'').trim();if(!id)throw new Error('tutorId requerido.');return parseResponse(await nativeFetch(endpoint(`/api/tutors/${encodeURIComponent(id)}`),{cache:'no-store'}));}
  async function createPickupRequests(payload){if(!Array.isArray(payload?.studentIds)||!payload.studentIds.length)throw new Error('studentIds[] requerido.');return post('/api/pickup-requests',payload);}
  async function pickupStatus(tutorId,requestIds){if(!Array.isArray(requestIds)||!requestIds.length)throw new Error('requestIds[] requerido.');return post('/api/pickup-requests/status',{tutorId,requestIds});}
  async function updatePickupGps(tutorId,requestIds,distanceMeters){if(!Array.isArray(requestIds)||!requestIds.length)throw new Error('requestIds[] requerido.');return post('/api/pickup-requests/gps',{tutorId,requestIds,distanceMeters});}
  async function cancelPickupRequest(requestId){const id=String(requestId||'').trim();if(!id)throw new Error('requestId requerido.');return post(`/api/pickup-requests/${encodeURIComponent(id)}/cancel`,{});}
  window.GatewayClient=Object.freeze({baseUrl,get,bootstrap,tutor,createPickupRequest:createPickupRequests,createPickupRequests,pickupStatus,updatePickupGps,cancelPickupRequest});
})();