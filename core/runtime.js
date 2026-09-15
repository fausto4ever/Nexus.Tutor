(()=>{
  'use strict';
  const listeners=new Map();
  const storage={
    read(key,fallback=null){
      try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}
    },
    write(key,value){localStorage.setItem(key,JSON.stringify(value));return value;},
    remove(key){localStorage.removeItem(key);}
  };
  const events={
    on(name,listener){
      const bucket=listeners.get(name)||new Set();bucket.add(listener);listeners.set(name,bucket);
      return()=>bucket.delete(listener);
    },
    emit(name,payload){for(const listener of listeners.get(name)||[])listener(payload);}
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
