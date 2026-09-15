(()=>{
  'use strict';
  const supported=()=>Boolean(navigator?.geolocation);
  let watchId=null;
  function watch({onPosition,onError,options}={}){
    if(!supported())throw new Error('GPS_NOT_AVAILABLE');
    if(watchId!=null)navigator.geolocation.clearWatch?.(watchId);
    watchId=navigator.geolocation.watchPosition(
      position=>onPosition?.(position),
      error=>onError?.(error),
      options||{enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    );
    return watchId;
  }
  function stop(){if(watchId!=null){navigator.geolocation.clearWatch?.(watchId);watchId=null;}}
  function fresh(options={}){
    if(!supported())return Promise.reject(new Error('GPS_NOT_AVAILABLE'));
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000,...options}));
  }
  window.NEXUS_TUTOR_LOCATION={supported,watch,stop,fresh};
})();
