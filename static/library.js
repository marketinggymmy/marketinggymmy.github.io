/* Local video library. Folder membership never moves or deletes media files. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const dataType='application/x-klartext-job';
  const phases={uploading:'Wird hochgeladen',loading:'Modell wird geladen',decoding:'Wird vorbereitet',transcribing:'Wird transkribiert',done:'Fertig',error:'Fehler',cancelled:'Abgebrochen',queued:'Wartet'};
  let snapshot={folders:[],assignments:{},jobs:[]}, selectedFolder=null, activeJob=null, searching=false, query='', refreshVersion=0;
  let menuFolder=null, dialogFolder=null, returnFocus=null, draggingJobs=null, pendingFolderSave=false, pendingMove=false;
  const selectedJobs=new Set();
  let selectionAnchor=null;

  async function request(path, method='GET', body) {
    const response=await KlartextRequest.send(path,{method,headers:{'X-Klartext':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})},'Bibliothek');
    let value;try{value=await response.json();}catch{throw new Error(KlartextRequest.failed(method,'Bibliothek',response.status));}
    if(!response.ok)throw new Error(typeof value.detail==='string'?value.detail:KlartextRequest.failed(method,'Bibliothek',response.status));
    return value;
  }
  function status(message='') {if(el('libraryStatus'))el('libraryStatus').textContent=message;}
  function icon(kind) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',kind==='folder'?'M3 6h6l2 3h10v11H3Z':kind==='more'?'M5 12h.01M12 12h.01M19 12h.01':'M4 5h16v14H4Zm6 4 5 3-5 3Z');
    svg.append(path);return svg;
  }
  function setActiveJob(id) {
    activeJob=id||null;
    for(const node of document.querySelectorAll('.historyItem[data-job-id]'))node.setAttribute('aria-current',String(node.dataset.jobId===activeJob));
  }
  function statusWord(job) {
    if(job.state==='queued')return job.queue_position?`Wartet (${job.queue_position}.)`:'Wartet';
    if(job.state==='done')return job.exported?'Exportiert':job.subtitled?'Untertitelt':'Transkribiert';
    return phases[job.state]||job.state;
  }
  // Nur bei genau einer verknüpften Aufgabe (Spec 4.12 Punkt 11); bei mehreren entscheidet das Aufgabenpanel.
  function taskFor(jobId) {const job=snapshot.jobs.find(job=>job.id===jobId);return job&&(job.task_count??1)===1?job.task||null:null;}
  function visibleJobs() {
    const normalized=query.trim().toLocaleLowerCase('de-DE');
    return snapshot.jobs.filter(job=>searching?String(job.filename||'').toLocaleLowerCase('de-DE').includes(normalized):(snapshot.assignments[job.id]||null)===selectedFolder);
  }
  function renderSelection() {
    let count=0;
    for(const node of document.querySelectorAll('.historyItem[data-job-id]')){
      const selected=selectedJobs.has(node.dataset.jobId);node.classList.toggle('isSelected',selected);node.setAttribute('aria-pressed',String(selected));if(selected)count++;
    }
    if(el('librarySelectionStatus'))el('librarySelectionStatus').textContent=count?`${count} ${count===1?'Video':'Videos'} ausgewählt`:'';
  }
  function clearSelection() {selectedJobs.clear();selectionAnchor=null;}
  function selectJob(id,event) {
    const additive=event.ctrlKey||event.metaKey;
    if(event.shiftKey){
      const ids=visibleJobs().map(job=>job.id),clicked=ids.indexOf(id),anchor=ids.indexOf(selectionAnchor);
      if(!additive)selectedJobs.clear();
      for(const value of ids.slice(Math.min(clicked,anchor<0?clicked:anchor),Math.max(clicked,anchor<0?clicked:anchor)+1))selectedJobs.add(value);
      if(anchor<0)selectionAnchor=id;
    }else{
      if(additive){if(selectedJobs.has(id))selectedJobs.delete(id);else selectedJobs.add(id);}
      else{selectedJobs.clear();selectedJobs.add(id);}
      selectionAnchor=id;
    }
    renderSelection();
    if(!event.shiftKey&&!additive)window.openKlartextJob?.(id);
  }
  function internalDrag(event) {return draggingJobs!==null||Array.from(event.dataTransfer?.types||[]).includes(dataType);}
  function dragIds(event) {
    const raw=event.dataTransfer?.getData(dataType);
    let ids;try{ids=raw?JSON.parse(raw):draggingJobs;}catch{return [];}
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!snapshot.jobs.some(job=>job.id===id)))return [];
    return [...new Set(ids)];
  }
  function bindDrop(node, folderId) {
    node.addEventListener('dragover',event=>{if(!internalDrag(event))return;event.preventDefault();event.dataTransfer.dropEffect='move';node.classList.add('isDragOver');});
    node.addEventListener('dragleave',event=>{if(!node.contains(event.relatedTarget))node.classList.remove('isDragOver');});
    node.addEventListener('drop',event=>{
      node.classList.remove('isDragOver');if(!internalDrag(event))return;
      event.preventDefault();event.stopPropagation();
      const ids=dragIds(event);if(ids.length)assign(ids,folderId);
    });
  }
  async function assign(ids, folderId) {
    if(pendingMove||folderId&&!snapshot.folders.some(folder=>folder.id===folderId))return;
    const jobs=ids.map(id=>snapshot.jobs.find(job=>job.id===id));if(jobs.some(job=>!job))return;
    pendingMove=true;status(`${jobs.length===1?'Video wird':'Videos werden'} verschoben …`);
    try{
      const results=await Promise.allSettled(jobs.map(job=>request(`/api/library/jobs/${encodeURIComponent(job.id)}/folder`,'PUT',{folder_id:folderId})));
      const moved=[],failed=[];
      results.forEach((result,index)=>{
        const job=jobs[index];
        if(result.status==='fulfilled'){moved.push(job.filename||'Video');selectedJobs.delete(job.id);}
        else failed.push(`${job.filename||'Video'} (${result.reason?.message||'Fehler unbekannt'})`);
      });
      const loaded=await refresh(activeJob);
      const messages=[];
      if(moved.length)messages.push(`${folderId?'Verschoben':'Aus dem Projekt genommen'}: ${moved.join(', ')}.`);
      if(failed.length)messages.push(`Nicht verschoben: ${failed.join(', ')}. Versuch es noch mal.`);
      if(!loaded)messages.push('Die Bibliothek konnte nicht aktualisiert werden. Lade die Seite neu.');
      status(messages.join(' '));
    }finally{pendingMove=false;}
  }
  function renderFolders() {
    const host=el('folderList');if(!host)return;host.replaceChildren();
    for(const folder of snapshot.folders) {
      const row=document.createElement('div');row.className='folderRow';row.dataset.folderId=folder.id;row.setAttribute('role','listitem');row.classList.toggle('isSelected',!searching&&selectedFolder===folder.id);
      const select=document.createElement('button');select.type='button';select.className='folderSelect';select.title=folder.name;select.setAttribute('aria-pressed',String(!searching&&selectedFolder===folder.id));
      const glyph=icon('folder');glyph.style.color=folder.color;const label=document.createElement('span');label.textContent=folder.name;
      const count=document.createElement('small');count.className='folderCount';count.textContent=String(Object.values(snapshot.assignments).filter(id=>id===folder.id).length);
      select.append(glyph,label,count);select.addEventListener('click',()=>{selectFolder(folder.id);showList();});
      const more=document.createElement('button');more.type='button';more.className='folderMore';more.title=`${folder.name} verwalten`;more.setAttribute('aria-label',`${folder.name} verwalten`);more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded',String(menuFolder===folder.id&&!el('folderMenu')?.hidden));more.append(icon('more'));more.addEventListener('click',()=>showMenu(folder.id,more));
      row.append(select,more);bindDrop(row,folder.id);host.append(row);
    }
  }
  function renderJobs() {
    const host=el('historyList');if(!host)return;host.replaceChildren();
    const jobs=visibleJobs();
    const folder=snapshot.folders.find(item=>item.id===selectedFolder);
    if(el('libraryListLabel'))el('libraryListLabel').textContent=searching?'Suchergebnisse':folder?.name||'Videos ohne Projekt';
    if(el('historyEmpty')){el('historyEmpty').hidden=jobs.length>0;el('historyEmpty').textContent=searching?'Keine passenden Videos gefunden.':folder?'Dieses Projekt hat noch keine Videos. Zieh eins hinein.':'Neue Videos erscheinen hier. Zieh sie in ein Projekt.';}
    for(const job of jobs) {
      const row=document.createElement('div');row.className='historyRow';
      const button=document.createElement('button');button.type='button';button.className='historyItem';button.dataset.jobId=job.id;button.draggable=true;button.title=job.filename;button.setAttribute('aria-current',String(job.id===activeJob));
      const thumb=document.createElement('span');thumb.className='historyThumbnail';thumb.append(icon('video'));
      const copy=document.createElement('span');copy.className='historyCopy';const name=document.createElement('span');name.className='historyName';name.textContent=job.filename||'Video';
      const details=document.createElement('small');details.className='historyDetails';details.textContent=statusWord(job)+(job.task?` · #${job.task.number}`:'');
      copy.append(name,details);button.append(thumb,copy);
      button.addEventListener('click',event=>selectJob(job.id,event));
      button.addEventListener('dragstart',event=>{
        if(pendingMove){event.preventDefault();return;}
        if(!selectedJobs.has(job.id)){clearSelection();selectedJobs.add(job.id);selectionAnchor=job.id;renderSelection();}
        draggingJobs=visibleJobs().filter(item=>selectedJobs.has(item.id)).map(item=>item.id);
        event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(dataType,JSON.stringify(draggingJobs));
        document.querySelectorAll('.historyItem.isSelected').forEach(node=>node.classList.add('isDragging'));
      });
      button.addEventListener('dragend',()=>{draggingJobs=null;document.querySelectorAll('.isDragging,.isDragOver').forEach(node=>{node.classList.remove('isDragging');node.classList.remove('isDragOver');});});
      row.append(button);
      host.append(row);
    }
    el('sidebarHome')?.setAttribute('aria-pressed',String(!searching&&selectedFolder===null));
    el('sidebarSearch')?.setAttribute('aria-pressed',String(searching));
    renderSelection();
  }
  function render() {renderFolders();renderJobs();}
  async function refresh(id=activeJob) {
    activeJob=id||null;const version=++refreshVersion;
    try{const value=await request('/api/library');if(version!==refreshVersion)return false;snapshot=value;
      for(const id of selectedJobs)if(!snapshot.jobs.some(job=>job.id===id))selectedJobs.delete(id);
      if(selectionAnchor&&!snapshot.jobs.some(job=>job.id===selectionAnchor))selectionAnchor=null;
      if(selectedFolder&&!snapshot.folders.some(folder=>folder.id===selectedFolder)){selectedFolder=null;clearSelection();}
      render();return true;
    }
    catch(error){if(version===refreshVersion)status(error.message);return false;}
  }
  function selectFolder(id) {
    if(searching||selectedFolder!==(id||null))clearSelection();
    selectedFolder=id||null;searching=false;query='';if(el('librarySearchInput'))el('librarySearchInput').value='';if(el('librarySearchPanel'))el('librarySearchPanel').hidden=true;closeMenu();render();
  }
  // Unter 1600 px zeigt der Untertitel-Tab die Bibliothek als Zeile ohne Liste; Filtern führt darum zum Transkript-Tab, der die Liste zeigt.
  // Während eines Exports bleibt der Tab stehen, sonst verschwindet die Bühne und der Export bricht ab.
  function showList(quiet) {if(el('historyList')?.offsetParent!==null)return;if(window.KlartextEditor?.isExporting?.()){if(!quiet)window.KlartextToast?.show('Der Video-Export läuft noch. Warte, bis er fertig ist.');return;}window.KlartextEditor?.setWorkspace('transcribe');}
  function search(value) {const next=String(value||'');if(!searching||query!==next)clearSelection();searching=true;query=next;if(el('librarySearchPanel'))el('librarySearchPanel').hidden=false;render();}
  function closeMenu(focus=false) {
    const button=menuFolder&&document.querySelector(`.folderRow[data-folder-id="${menuFolder}"] .folderMore`);
    if(el('folderMenu'))el('folderMenu').hidden=true;menuFolder=null;button?.setAttribute('aria-expanded','false');if(focus)button?.focus();
  }
  function showMenu(folderId, button) {
    if(menuFolder===folderId&&!el('folderMenu').hidden){closeMenu(true);return;}closeMenu();menuFolder=folderId;
    const menu=el('folderMenu');if(!menu)return;menu.hidden=false;button.setAttribute('aria-expanded','true');
    const box=button.getBoundingClientRect(), width=menu.offsetWidth, height=menu.offsetHeight;
    menu.style.left=`${Math.max(8,Math.min(box.right+8,window.innerWidth-width-8))}px`;menu.style.top=`${Math.max(8,Math.min(box.top,window.innerHeight-height-8))}px`;
    menu.querySelector('button')?.focus();
  }
  function openDialog(folderId=null) {
    dialogFolder=folderId;const folder=snapshot.folders.find(item=>item.id===folderId);returnFocus=document.activeElement;closeMenu();
    if(el('folderDialogTitle'))el('folderDialogTitle').textContent=folder?'Projekt umbenennen':'Neues Projekt';
    el('folderName').value=folder?.name||'';el('folderDialog').hidden=false;
    // Spec 4.3: am Handy kein Autofokus ins Feld, sonst deckt die Tastatur den Dialog zu.
    if(matchMedia('(max-width:700px)').matches)el('folderDialogTitle').focus();else{el('folderName').focus();el('folderName').select();}
  }
  function closeDialog() {el('folderDialog').hidden=true;dialogFolder=null;returnFocus?.focus();}

  el('newFolder')?.addEventListener('click',()=>openDialog());
  el('cancelFolder')?.addEventListener('click',closeDialog);
  el('folderDialog')?.addEventListener('click',event=>{if(event.target===el('folderDialog')&&!pendingFolderSave)closeDialog();});
  el('folderForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(pendingFolderSave)return;const name=el('folderName').value.trim();if(!name){el('folderName').focus();return;}
    const id=dialogFolder;pendingFolderSave=true;el('saveFolder').disabled=true;el('cancelFolder').disabled=true;status('');
    try{await request(id?`/api/library/folders/${id}`:'/api/library/folders',id?'PATCH':'POST',{name});closeDialog();await refresh(activeJob);status(id?'Projekt umbenannt.':'Projekt angelegt. Zieh deine Videos hinein.');}
    catch(error){status(error.message);el('folderName').focus();}
    finally{pendingFolderSave=false;el('saveFolder').disabled=false;el('cancelFolder').disabled=false;}
  });
  el('folderMenu')?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-folder-action]'),id=menuFolder,folder=snapshot.folders.find(item=>item.id===id);if(!button||!folder)return;
    const action=button.dataset.folderAction;
    if(action==='rename'){openDialog(id);return;}
    if(action==='color'){const input=el('folderColorInput');input.dataset.folderId=id;input.value=folder.color;closeMenu();input.click();return;}
    closeMenu(action==='delete');
    if(action==='delete'){
      // A folder is the project of the tasks: deleting it loses briefing and company, so the question counts the tasks (B1).
      let count;
      try{count=(await request('/api/workspace')).tasks.filter(task=>task.project_id===id).length;}catch{status('Projekt nicht gelöscht: Die Aufgaben ließen sich nicht laden. Versuch es noch mal.');return;}
      const text=count?`Briefing und Firma gehen verloren, ${count===1?'1 Aufgabe steht':`${count} Aufgaben stehen`} danach ohne Projekt. Deine Videos bleiben erhalten.`:'Briefing und Firma gehen verloren. Deine Videos bleiben erhalten.';
      const answer=await window.KlartextConfirm.ask({title:`Projekt „${folder.name}“ löschen?`,text,confirm:'Projekt löschen',alt:count?'Archivieren':null});
      try{
        if(answer==='alt'){await request(`/api/library/folders/${id}`,'PATCH',{archived:true});await refresh(activeJob);status('Projekt archiviert. Aufgaben, Briefing und Videos bleiben erhalten.');}
        if(answer==='confirm'){await request(`/api/library/folders/${id}`,'DELETE');if(selectedFolder===id)selectedFolder=null;await refresh(activeJob);status('Projekt gelöscht. Deine Videos bleiben erhalten.');}
      }catch(error){status(error.message);}
    }
    if(action==='share'){
      const link=document.createElement('a');link.href=`/api/library/folders/${id}/archive`;link.download=folder.name+'.zip';document.body.append(link);link.click();link.remove();status('Das Projekt wird als ZIP mit Videos, Texten und Untertiteln heruntergeladen.');
    }
  });
  el('folderColorInput')?.addEventListener('change',async event=>{const id=event.target.dataset.folderId;if(!id)return;try{await request(`/api/library/folders/${id}`,'PATCH',{color:event.target.value});await refresh(activeJob);status('Projektfarbe gespeichert.');}catch(error){status(error.message);}});
  el('sidebarHome')?.addEventListener('click',()=>{selectFolder(null);window.KlartextEditor?.setWorkspace('transcribe');});
  el('sidebarSearch')?.addEventListener('click',()=>{search(query);el('librarySearchInput')?.focus();});
  el('librarySearchInput')?.addEventListener('input',event=>{search(event.target.value);showList(true);});
  if(el('sidebarHome'))bindDrop(el('sidebarHome'),null);
  if(el('historyTitle'))bindDrop(el('historyTitle'),null);
  document.addEventListener('pointerdown',event=>{if(menuFolder&&!el('folderMenu')?.contains(event.target)&&!event.target.closest('.folderMore'))closeMenu();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(menuFolder){event.preventDefault();closeMenu(true);}else if(el('folderDialog')&&!el('folderDialog').hidden&&!pendingFolderSave){event.preventDefault();closeDialog();}else if(searching&&!document.querySelector('dialog:modal')){event.preventDefault();selectFolder(null);el('sidebarSearch')?.focus();}}
    if(event.key==='Tab'&&el('folderDialog')&&!el('folderDialog').hidden){const nodes=[...el('folderDialog').querySelectorAll('input,button')].filter(node=>!node.disabled&&!node.hidden);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&[first,el('folderDialogTitle')].includes(document.activeElement)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    if(menuFolder&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const nodes=[...el('folderMenu').querySelectorAll('button')],index=nodes.indexOf(document.activeElement);event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length;nodes[next]?.focus();}
  });
  window.addEventListener('resize',()=>closeMenu());
  window.KlartextLibrary={refresh,setActiveJob,selectFolder,search,taskFor};
})();
