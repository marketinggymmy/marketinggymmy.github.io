'use strict';
(() => {
  const toggle=document.getElementById('toggleSidebar');
  const previewHost=document.getElementById('structureWorkspace');
  const more=document.querySelector('details[data-nav-more]');
  const sheet=document.querySelector('[data-tab-sheet]');
  const moreTab=document.querySelector('[data-tab-more]');
  const topbarAddVideo=document.querySelector('[data-topbar-add-video]');
  const topbarTask=document.querySelector('[data-topbar-task]');
  const topbarActions=document.querySelector('[data-topbar-actions]');
  const STUDIO=new Set(['transcribe','subtitles','social']);
  const previewRoutes=new Set(['today','projects','material','review','planning','statistik','team','requests','finance','automations','settings']);
  const start=me=>['pruefer','kunde','gast'].includes(me?.role)?'review':'today';
  const setWorkspace=name=>window.KlartextEditor?.setWorkspace(name);
  const mark=(button,on)=>{button.classList.toggle('isActive',on);if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');};
  // The more sheet: focus goes in when it opens and back to the tab after Escape.
  function setSheet(open,returnFocus=false){
    if(!sheet||!moreTab)return;
    sheet.hidden=!open;moreTab.setAttribute('aria-expanded',String(open));
    if(open)[...sheet.querySelectorAll('button')].find(button=>button.getClientRects().length)?.focus();
    else if(returnFocus)moreTab.focus();
  }
  // Kopfaktionen (spec 4.3, Entscheidung 1 im Plan Block M): the page keeps its button, hidden from 701 px on, and the topbar shows a copy
  // that clicks it. Delegation, rights and focus of the page stay as they are; roles.css hides a copy through its data-source.
  const pageActions={};
  const view=name=>previewHost?.querySelector(`[data-structure-view="${name}"]`);
  const sourceWatch=new MutationObserver(()=>syncActions());
  function setActions(workspace,actions){pageActions[workspace]=actions;if(document.body.dataset.activeWorkspace===workspace)renderActions(workspace);}
  function renderActions(name){
    topbarActions?.querySelectorAll('[data-source]').forEach(copy=>copy.remove());
    sourceWatch.disconnect();
    const root=view(name);
    for(const {label,primary,target} of (root&&pageActions[name])||[]){
      const source=root.querySelector(target);
      if(!source)continue;
      const copy=document.createElement('button');
      copy.type='button';copy.className=primary?'btn isPrimary':'btn';copy.textContent=label;copy.dataset.source=target;
      // A field as target (Abläufe, Anfragen): the copy brings its form into view and stays itself.
      if(source.matches('input,select,textarea'))copy.addEventListener('click',()=>{const fold=source.closest('details');if(fold)fold.open=true;source.focus();});
      else{
        source.classList.add('topbarSource');copy.addEventListener('click',()=>source.click());
        // Pages give the focus back to their own button; while it hides behind the copy, the copy takes it.
        source.focus=options=>HTMLElement.prototype.focus.call(source.getClientRects().length?source:copy,options);
        sourceWatch.observe(source,{attributes:true,attributeFilter:['hidden','disabled']});
      }
      topbarActions.insertBefore(copy,topbarActions.querySelector('[data-role-note]'));
    }
    syncActions();
  }
  // A page that hides or locks its button (no rights, no connection) does the same to the copy.
  function syncActions(){
    const root=view(document.body.dataset.activeWorkspace);
    topbarActions?.querySelectorAll('[data-source]').forEach(copy=>{const source=root?.querySelector(copy.dataset.source);copy.hidden=!source||source.hidden;copy.disabled=!!source?.disabled;});
  }
  window.KlartextShell=Object.freeze({start,STUDIO,setActions});
  // material.js, review.js and planning.js fill a prepared section instead of creating their own.
  for(const route of ['material','review','planning']){
    const section=document.createElement('section');
    section.dataset.structureView=route;section.setAttribute('aria-labelledby',`structure-${route}-title`);section.hidden=true;
    previewHost?.append(section);
  }
  window.KlartextPlanning?.mount(previewHost);
  window.KlartextTasks?.mount(previewHost);
  window.KlartextReview?.mount(previewHost);
  window.KlartextStatistik?.mount(previewHost);
  window.KlartextTeam?.mount(previewHost);
  window.KlartextRequests?.mount(previewHost);
  window.KlartextFinance?.mount(previewHost);
  window.KlartextAutomations?.mount(previewHost);
  window.KlartextToday?.mount(previewHost);
  window.KlartextSettings?.mount(previewHost);
  // The role decides what the menu offers; the server enforces the same rules.
  const roleNotes={pruefer:'Prüfer: du kannst prüfen, kommentieren, freigeben und anfragen.',kunde:'Kundenzugang: Freigaben und Anfragen deiner Firma.',gast:'Gastzugang: Freigaben und Anfragen. Für mehr trägt dich Dominik im Team ein.'};
  fetch('/api/me',{headers:{Accept:'application/json'}}).then(response=>response.ok?response.json():null).then(me=>{
    if(!me)return;
    window.KlartextMe=Object.freeze(me);document.body.dataset.role=me.role;
    const note=document.querySelector('[data-role-note]');
    if(note){note.textContent=note.title=roleNotes[me.role]||'';note.hidden=!roleNotes[me.role];note.addEventListener('click',()=>window.KlartextToast?.show(note.textContent));}
    if(start(me)==='review'){
      if(more)more.open=true;
      if(document.body.dataset.activeWorkspace==='today')setWorkspace('review');
    }
  }).catch(()=>{});
  window.KlartextMaterial?.mount(previewHost);
  // A new page starts at the top. Compared with the body, not the event: planning.js switches back inside the event while a post stays open.
  let shown=document.body.dataset.activeWorkspace;
  function syncWorkspace(name){
    if(document.body.dataset.activeWorkspace!==shown){shown=document.body.dataset.activeWorkspace;window.scrollTo({top:0,behavior:'instant'});}
    const route=STUDIO.has(name)?'studio':name;
    // Only the studio offers the topbar action; app.js shows the task link while a job with a task is open.
    if(topbarAddVideo)topbarAddVideo.hidden=route!=='studio';
    if(topbarTask&&route!=='studio')topbarTask.hidden=true;
    renderActions(name);
    document.querySelectorAll('.tabBar [data-shell-route]').forEach(button=>mark(button,button.dataset.shellRoute===route));
    if(moreTab)mark(moreTab,!!sheet?.querySelector(`[data-shell-route="${route}"]`));
    setSheet(false);
    if(more&&more.querySelector(`[data-workspace="${name}"]`))more.open=true;
    if(previewHost){
      previewHost.hidden=!previewRoutes.has(name);
      previewHost.querySelectorAll('[data-structure-view]').forEach(view=>view.hidden=view.dataset.structureView!==name);
    }
  }
  window.addEventListener('klartext:workspace-change',event=>syncWorkspace(event.detail.name));
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-topbar-add-video]')){window.KlartextAddVideo?.open();return;}
    const link=event.target.closest('[data-shell-route]');
    if(link&&!link.disabled){event.preventDefault();setWorkspace(link.dataset.shellRoute);return;}
    if(event.target.closest('[data-tab-more]')){setSheet(!!sheet?.hidden);return;}
    // A tap beside the open sheet (on the scrim, which belongs to the tab bar) only closes it.
    if(sheet&&!sheet.hidden&&!event.target.closest('[data-tab-sheet]'))setSheet(false);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheet&&!sheet.hidden)setSheet(false,true);});
  function setCollapsed(collapsed){
    document.body.classList.toggle('sidebarCollapsed',collapsed);
    toggle.setAttribute('aria-expanded',String(!collapsed));
    toggle.setAttribute('aria-label',collapsed?'Seitenleiste öffnen':'Seitenleiste einklappen');
    toggle.title=toggle.getAttribute('aria-label');
    try{localStorage.setItem('klartext-sidebar-collapsed',collapsed?'1':'0');}catch{}
    window.dispatchEvent(new Event('resize'));
  }
  try{setCollapsed(localStorage.getItem('klartext-sidebar-collapsed')==='1');}catch{}
  toggle.addEventListener('click',()=>setCollapsed(!document.body.classList.contains('sidebarCollapsed')));
  document.getElementById('sidebarSearch')?.addEventListener('click',()=>document.getElementById('librarySearchInput')?.focus());
  document.getElementById('sidebarHome')?.addEventListener('click',()=>setWorkspace('transcribe'));
  // A direct link #review/<id> lands on Freigaben; review.js opens the overlay itself.
  setWorkspace(location.hash.startsWith('#review/')?'review':'today');
})();
