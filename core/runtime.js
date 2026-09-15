(()=>{
  'use strict';
  const listeners=new Map();
  const storage={
    read(key,fallback=null){
      try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}
    },
    write(key,value){
      try{localStorage.setItem(key,JSON.stringify(value));return value;}
      catch(error){console.warn('STORAGE_WRITE_FAILED',key,error);return null;}
    },
    remove(key){
      try{localStorage.removeItem(key);return true;}
      catch(error){console.warn('STORAGE_REMOVE_FAILED',key,error);return false;}
    }
  };
  const events={
    on(name,listener){
      const bucket=listeners.get(name)||new Set();bucket.add(listener);listeners.set(name,bucket);
      return()=>bucket.delete(listener);
    },
    emit(name,payload){
      for(const listener of listeners.get(name)||[]){
        try{listener(payload);}catch(error){console.error('EVENT_LISTENER_FAILED',name,error);}
      }
    }
  };
  const dom={
    one(selector){return document.querySelector(selector);},
    all(selector){return[...document.querySelectorAll(selector)];},
    require(selectors){
      const missing=selectors.filter(selector=>!document.querySelector(selector));
      if(missing.length)throw new Error(`DOM_REQUIRED_MISSING:${missing.join(',')}`);
      return true;
    }
  };
  window.NEXUS_TUTOR_RUNTIME={storage,events,dom};
})();
