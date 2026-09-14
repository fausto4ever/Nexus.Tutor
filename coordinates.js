(()=>{
  'use strict';
  function normalize(value){return String(value??'').trim().replace(/[−–—]/g,'-');}
  function toggleSign(input){
    if(!input)return;
    const value=normalize(input.value);
    if(!value){input.value='-';}
    else if(value.startsWith('-')){input.value=value.slice(1);}
    else if(value.startsWith('+')){input.value='-'+value.slice(1);}
    else{input.value='-'+value;}
    input.focus();
    try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
  }
  const lat=document.querySelector('#cfgLat');
  const lng=document.querySelector('#cfgLng');
  document.querySelector('#latMinusBtn')?.addEventListener('click',()=>toggleSign(lat));
  document.querySelector('#lngMinusBtn')?.addEventListener('click',()=>toggleSign(lng));
})();
