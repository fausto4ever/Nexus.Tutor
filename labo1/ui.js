(()=>{
  'use strict';
  const THEME_KEY='nexusTutorThemeV1';
  const TAB_KEY='nexusTutorTabV1';
  const root=document.documentElement;
  const themeBtn=document.querySelector('#themeToggleBtn');
  const themeIcon=document.querySelector('#themeIcon');
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  const navButtons=[...document.querySelectorAll('.nav-btn')];
  const tabPanels=[...document.querySelectorAll('.tab-content')];

  function systemTheme(){
    try{return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';}catch{return'light';}
  }
  function storedTheme(){
    const value=localStorage.getItem(THEME_KEY);
    return value==='light'||value==='dark'?value:null;
  }
  function applyTheme(theme,{persist=true}={}){
    const next=theme==='dark'?'dark':'light';
    root.dataset.theme=next;
    if(themeMeta)themeMeta.setAttribute('content',next==='dark'?'#090d16':'#f4f7fb');
    if(themeIcon)themeIcon.textContent=next==='dark'?'☀':'☾';
    if(themeBtn){
      themeBtn.setAttribute('aria-label',next==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro');
      themeBtn.setAttribute('title',next==='dark'?'Modo claro':'Modo oscuro');
    }
    if(persist)localStorage.setItem(THEME_KEY,next);
  }
  function toggleTheme(){applyTheme(root.dataset.theme==='dark'?'light':'dark');}

  function availableTab(id){return tabPanels.some(panel=>panel.id===id);}
  function activateTab(id,{persist=true}={}){
    const next=availableTab(id)?id:'tab-tracking';
    for(const panel of tabPanels){
      const active=panel.id===next;
      panel.classList.toggle('active',active);
      panel.hidden=!active;
    }
    for(const button of navButtons){
      const active=button.dataset.tab===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.setAttribute('tabindex',active?'0':'-1');
    }
    if(persist)localStorage.setItem(TAB_KEY,next);
  }

  applyTheme(storedTheme()||systemTheme(),{persist:false});
  const savedTab=localStorage.getItem(TAB_KEY);
  activateTab(savedTab&&availableTab(savedTab)?savedTab:'tab-tracking',{persist:false});
  themeBtn?.addEventListener('click',toggleTheme);
  for(const button of navButtons)button.addEventListener('click',()=>activateTab(button.dataset.tab));

  window.NEXUS_TUTOR_UI={applyTheme,activateTab};
})();
