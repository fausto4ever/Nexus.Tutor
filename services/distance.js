(()=>{
  'use strict';

  function isReady(school){
    const lat=school?.lat,lng=school?.lng;
    return lat!=null&&lng!=null&&String(lat).trim()!==''&&String(lng).trim()!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180;
  }

  function haversine(lat1,lon1,lat2,lon2){
    const R=6371000,toRad=value=>value*Math.PI/180,p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  async function measure({position,school,mode='direct',manualEnabled=false,manualMeters=null,routeTimeoutMs=8000}={}){
    if(!isReady(school))throw new Error('SCHOOL_NOT_READY');
    if(manualEnabled){
      const meters=Number(manualMeters);
      if(!Number.isFinite(meters)||meters<0)throw new Error('MANUAL_DISTANCE_INVALID');
      return{meters,source:'manual',accuracy:null};
    }
    if(!position?.coords)throw new Error('GPS_NOT_READY');

    const {latitude,longitude,accuracy}=position.coords;
    const direct=haversine(latitude,longitude,Number(school.lat),Number(school.lng));
    const normalizedAccuracy=Number.isFinite(accuracy)?accuracy:null;
    if(mode!=='driving')return{meters:direct,source:'direct',accuracy:normalizedAccuracy};

    let timeoutId=null;
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${school.lng},${school.lat}?overview=false&steps=false`;
      const controller=typeof AbortController==='function'?new AbortController():null;
      if(controller)timeoutId=setTimeout(()=>controller.abort(),routeTimeoutMs);
      const response=await fetch(url,{cache:'no-store',...(controller?{signal:controller.signal}:{})});
      if(!response.ok)throw new Error('ROUTE_HTTP_'+response.status);
      const data=await response.json(),meters=Number(data?.routes?.[0]?.distance);
      if(!Number.isFinite(meters))throw new Error('ROUTE_DISTANCE_INVALID');
      return{meters,source:'driving',accuracy:normalizedAccuracy};
    }catch(error){
      console.warn('OSRM no disponible, usando distancia directa',error);
      return{meters:direct,source:'direct-fallback',accuracy:normalizedAccuracy};
    }finally{
      if(timeoutId!=null)clearTimeout(timeoutId);
    }
  }

  window.NEXUS_TUTOR_DISTANCE={isReady,haversine,measure};
})();