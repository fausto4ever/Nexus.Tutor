(()=>{
  'use strict';
  const RUNTIME=window.NEXUS_TUTOR_RUNTIME;
  if(!RUNTIME)throw new Error('RUNTIME_NOT_LOADED');

  const LOG_KEY='nexusTutorLogV1',TELEMETRY_KEY='nexusTutorTelemetryV1';

  function loadLog(){return RUNTIME.storage.read(LOG_KEY,[]);}
  function saveLog(items){RUNTIME.storage.write(LOG_KEY,(items||[]).slice(0,60));}
  function addLog(status,message,distance){
    const items=loadLog();
    items.unshift({at:new Date().toISOString(),status,message,distance:Number.isFinite(distance)?distance:null});
    saveLog(items);
    return items;
  }
  function clearLog(){saveLog([]);return[];}

  function loadTelemetry(){return RUNTIME.storage.read(TELEMETRY_KEY,[]);}
  function saveTelemetry(items){RUNTIME.storage.write(TELEMETRY_KEY,(items||[]).slice(0,1000));}
  function record(event,payload={}){
    const items=loadTelemetry();
    items.unshift({at:new Date().toISOString(),event,...payload});
    saveTelemetry(items);
    return items;
  }

  function download(payload,{prefix='nexus-tutor-telemetry'}={}){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  window.NEXUS_TUTOR_TELEMETRY={loadLog,saveLog,addLog,clearLog,loadTelemetry,saveTelemetry,record,download};
})();