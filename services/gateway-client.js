(()=>{
  'use strict';

  const cfg=window.NEXUS_TUTOR_DEFAULTS||{};
  const baseUrl=String(cfg.gatewayBaseUrl||'').replace(/\/$/,'');
  const nativeFetch=window.fetch.bind(window);

  const GET_ROUTES={
    health:'/api/version'
  };

  function endpoint(path){
    if(!baseUrl)throw new Error('Gateway no configurado.');
    return baseUrl+path;
  }

  async function parseResponse(response){
    let data;
    try{data=await response.json();}
    catch{throw new Error(`Respuesta inválida del Gateway (${response.status}).`);}
    if(!response.ok||data?.ok===false){
      const err=new Error(data?.detail||data?.error||`Gateway HTTP ${response.status}`);
      err.code=data?.code||data?.error||'';
      err.id=data?.id||'';
      throw err;
    }
    return data;
  }

  async function get(action,params={}){
    const route=GET_ROUTES[action];
    if(!route)throw new Error(`GET action no soportada por Gateway: ${action}`);
    const target=new URL(endpoint(route));
    for(const [key,value] of Object.entries(params)){
      if(value!==''&&value!==undefined&&value!==null)target.searchParams.set(key,String(value));
    }
    return parseResponse(await nativeFetch(target,{cache:'no-store',headers:{Accept:'application/json'}}));
  }

  async function bootstrap(){
    return parseResponse(await nativeFetch(endpoint('/bootstrap'),{cache:'no-store',headers:{Accept:'application/json'}}));
  }

  async function tutor(tutorId){
    const id=String(tutorId||'').trim();
    if(!id)throw new Error('tutorId requerido.');
    return parseResponse(await nativeFetch(endpoint(`/api/tutors/${encodeURIComponent(id)}`),{cache:'no-store',headers:{Accept:'application/json'}}));
  }

  window.GatewayClient=Object.freeze({baseUrl,get,bootstrap,tutor});
})();