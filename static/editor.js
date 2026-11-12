'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const {tokenizeCaptionText, layoutCaptionWords, snapPosition, clampPosition} = window.KlartextGeometry;
  // task_id: the task the Studio was opened from; the export becomes its next version (Spec 4.12 point 11).
  const state = {job:null, project:null, task_id:null, selected:null, selectedWord:null, displayedPhrase:null, undo:[], redo:[], dirty:false, saveTimer:null, templates:[], fonts:{Arial:{weights:[400,700],styles:['normal','italic']}}};
  const setTask = id => {state.task_id = id || null;};
  const proofreader={issues:new Map(),timer:null,run:0,controller:null,key:''};
  const api = async (path, options={}) => {
    const response = await KlartextRequest.send(path,{...options,headers:{'X-Klartext':'1',...options.headers}},'Untertitel');
    if(!response.ok){let message=KlartextRequest.failed(options.method,'Untertitel',response.status);try{message=(await response.json()).detail||message;}catch{}throw new Error(message);}
    return response.headers.get('content-type')?.includes('json')?response.json():response;
  };
  const status = message => byId('editorStatus').textContent=message||'';
  const fmt = seconds => {seconds=Math.max(0,Number(seconds)||0);const m=Math.floor(seconds/60),s=(seconds%60).toFixed(1).padStart(4,'0');return `${String(m).padStart(2,'0')}:${s}`;};
  const currentPhrase = () => state.project?.phrases.find(p=>p.id===state.selected)||null;
  const highlightDefaults={highlight_keywords:false,keyword_color:'#FFD166',highlight_effect:'color',highlight_font_family:'Arial',highlight_font_weight:700,highlight_font_style:'normal',highlight_background_color:'#FFD166',word_reveal:true,highlight_glow:false,highlight_glow_strength:12};
  const defaultCaptionGeometry=()=>({position:{x:50,y:78},box:{width:78,scale:1}});
  function effectiveCaptionGeometry(project,phrase){
    const source=phrase?.individual_geometry?phrase:(project.caption_geometry||defaultCaptionGeometry());
    const fit=phrase?.box?.fit??source.box?.fit;
    return {position:{x:Number(source.position?.x??50),y:Number(source.position?.y??78)},box:{width:Number(source.box?.width??78),scale:Number(source.box?.scale??1),...(fit==null?{}:{fit:Number(fit)})}};
  }
  function captionGeometryTarget(project,phrase){
    if(phrase?.individual_geometry){phrase.position=phrase.position||{x:50,y:78};phrase.box=phrase.box||{width:78,scale:1};return phrase;}
    project.caption_geometry=project.caption_geometry||defaultCaptionGeometry();return project.caption_geometry;
  }
  function highlightedIndices(phrase){return Array.isArray(phrase?.highlighted_words)?phrase.highlighted_words:[];}
  function automaticHighlightIndices(text){const words=tokenizeCaptionText(text);if(words.length<4)return [];const result=[];for(let index=2;index<words.length;index+=5){if(words[index].replace(/[^\p{L}\p{N}]/gu,'').length>2)result.push(index);}return result;}
  function toggleHighlightedWord(phrase,index){const current=new Set(highlightedIndices(phrase));if(current.has(index))current.delete(index);else current.add(index);phrase.highlighted_words=[...current].sort((a,b)=>a-b);}
  const phraseTokens=phrase=>tokenizeCaptionText(phrase?.text);
  function timedPhraseWords(phrase){
    if(window.KlartextCaptionTiming)return window.KlartextCaptionTiming.timedWords(phrase);
    // Legacy embedded editor consumers can still load geometry and editor alone.
    const tokens=phraseTokens(phrase),step=(phrase.end-phrase.start)/Math.max(1,tokens.length);
    return tokens.map((text,index)=>({text,start:phrase.start+index*step,end:index===tokens.length-1?phrase.end:phrase.start+(index+1)*step}));
  }
  const enlargedIndices=phrase=>Array.isArray(phrase?.enlarged_words)?phrase.enlarged_words:[];
  function highlightStar(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('highlightStar');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M11.1 3.2Q12 1.4 12.9 3.2L15.5 8.5L20.8 11.1Q22.6 12 20.8 12.9L15.5 15.5L12.9 20.8Q12 22.6 11.1 20.8L8.5 15.5L3.2 12.9Q1.4 12 3.2 11.1L8.5 8.5Z');svg.append(path);return svg;}
  function applyHighlightVariables(element){const s={...highlightDefaults,...state.project.style};element.style.setProperty('--highlight-font-family',`"${s.highlight_font_family}",sans-serif`);element.style.setProperty('--highlight-font-weight',s.highlight_font_weight);element.style.setProperty('--highlight-font-style',s.highlight_font_style);element.style.setProperty('--highlight-text-color',s.keyword_color);element.style.setProperty('--highlight-background-color',s.highlight_background_color);}
  function languageIssue(phrase,index){const result=proofreader.issues.get(phrase.id);return result?.text===phrase.text?result.issues.find(issue=>issue.token_index===index&&issue.original===phraseTokens(phrase)[index]):null;}
  function replacePhraseWord(phrase,index,value){
    const words=phraseTokens(phrase),replacement=tokenizeCaptionText(value);if(!words[index]||!replacement.length)return false;
    const next=[...words.slice(0,index),...replacement,...words.slice(index+1)];if(next.join(' ').length>500){status('Die Phrase darf höchstens 500 Zeichen enthalten.');return false;}
    for(const field of ['highlighted_words','enlarged_words'])phrase[field]=(phrase[field]||[]).flatMap(i=>i<index?[i]:i>index?[i+replacement.length-1]:replacement.map((_,offset)=>index+offset));
    phrase.text=next.join(' ');proofreader.issues.delete(phrase.id);return true;
  }
  window.effectiveCaptionGeometry=effectiveCaptionGeometry;
  window.captionGeometryTarget=captionGeometryTarget;
  window.toggleHighlightedWord=toggleHighlightedWord;
  const inspectorTabs=[...document.querySelectorAll('[data-inspector]')];
  function activateInspector(name,focus=false){
    const selected=inspectorTabs.find(tab=>tab.dataset.inspector===name);
    if(!selected)return;
    inspectorTabs.forEach(tab=>{
      const active=tab===selected;
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      tab.classList.toggle('isActive',active);
      byId(tab.getAttribute('aria-controls')).hidden=!active;
    });
    if(focus)selected.focus();
  }
  window.activateInspector=activateInspector;
  inspectorTabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>activateInspector(tab.dataset.inspector));
    tab.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        event.preventDefault();
        const next=inspectorTabs[(index+(event.key==='ArrowRight'?1:-1)+inspectorTabs.length)%inspectorTabs.length];
        inspectorTabs.forEach(item=>item.tabIndex=item===next?0:-1);next.focus();
      }else if(event.key==='Enter'||event.key===' '){event.preventDefault();activateInspector(tab.dataset.inspector,true);}
    });
  });
  // Tool placeholders are transient and never enter the subtitle project/export schema.
  const toolState={active:null,files:{},addedAudioVolume:1,textLayers:[]};
  const toolTriggers=[...document.querySelectorAll('[data-editor-tool]')];
  function closeToolPanel(returnFocus=false){
    const previous=toolTriggers.find(button=>button.dataset.editorTool===toolState.active);
    toolState.active=null;
    toolTriggers.forEach(button=>button.setAttribute('aria-expanded','false'));
    document.querySelectorAll('[data-editor-tool-panel]').forEach(panel=>panel.hidden=true);
    if(returnFocus)previous?.focus();
  }
  function openToolPanel(name){
    const trigger=toolTriggers.find(button=>button.dataset.editorTool===name);
    if(!trigger)return;
    closeToolPanel();
    toolState.active=name;
    trigger.setAttribute('aria-expanded','true');
    const panel=byId(trigger.getAttribute('aria-controls'));
    panel.hidden=false;
    panel.querySelector('input, #addEditorTextLayer')?.focus();
  }
  window.openToolPanel=openToolPanel;
  toolTriggers.forEach(button=>button.addEventListener('click',()=>{
    if(toolState.active===button.dataset.editorTool)closeToolPanel();
    else openToolPanel(button.dataset.editorTool);
  }));
  document.querySelectorAll('[data-close-editor-tool]').forEach(button=>button.addEventListener('click',()=>closeToolPanel(true)));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&toolState.active&&!document.querySelector('dialog:modal')){event.preventDefault();closeToolPanel(true);}
  });
  const toolFiles=[['image','editorImageFile','editorImageStatus','image/','Noch kein Bild ausgewählt.'],['music','editorMusicFile','editorMusicFileStatus','audio/','Noch keine Musikspur ausgewählt.'],['voiceover','editorVoiceoverFile','editorVoiceoverFileStatus','audio/','Noch keine Sprachaufnahme ausgewählt.']];
  toolFiles.forEach(([name,id,statusId,type,empty])=>byId(id).addEventListener('change',event=>{
    const file=event.target.files[0];
    if(file?.type&&!file.type.startsWith(type)){byId(statusId).textContent=type==='image/'?'Das ist kein Bild. Wähl ein Bild aus.':'Das ist keine Audiodatei. Wähl eine Audiodatei aus.';return;}
    toolState.files[name]=file||null;
    byId(statusId).textContent=file?`${file.name} · Lokal vorgemerkt`:empty;
  }));
  byId('editorVideoVolume').addEventListener('input',event=>{
    byId('editorVideo').volume=Number(event.target.value)/100;
    byId('editorVideoVolumeValue').textContent=`${event.target.value} %`;
  });
  byId('editorAddedAudioVolume').addEventListener('input',event=>{
    toolState.addedAudioVolume=Number(event.target.value)/100;
    byId('editorAddedAudioVolumeValue').textContent=`${event.target.value} %`;
  });
  byId('addEditorTextLayer').addEventListener('click',()=>{
    const layer={text:'Neuer Text'};
    toolState.textLayers.push(layer);
    const chip=document.createElement('div');
    chip.className='editorTextLayerChip';chip.contentEditable='true';chip.setAttribute('role','textbox');
    chip.setAttribute('aria-label',`Textebene ${toolState.textLayers.length} bearbeiten`);
    chip.setAttribute('aria-multiline','false');chip.textContent=layer.text;
    chip.addEventListener('input',()=>layer.text=chip.textContent);
    chip.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
    byId('editorTextLayers').append(chip);chip.focus();
  });
  function resetEditorTools(){
    closeToolPanel();toolState.files={};toolState.textLayers=[];toolState.addedAudioVolume=1;
    toolFiles.forEach(([,id,statusId,,empty])=>{byId(id).value='';byId(statusId).textContent=empty;});
    byId('editorTextLayers').replaceChildren();
    for(const id of ['editorVideoVolume','editorAddedAudioVolume']){byId(id).value='100';byId(id+'Value').textContent='100 %';}
    byId('editorVideo').volume=1;
  }
  const STUDIO=new Set(['transcribe','subtitles','social']);let studioTab='transcribe';
  function setWorkspace(name){
    const titles={transcribe:'Studio',subtitles:'Studio',social:'Studio',today:'Heute',projects:'Aufgaben',material:'Material',review:'Freigaben',planning:'Kalender',statistik:'Statistik',team:'Team',requests:'Anfragen',finance:'Finanzen',automations:'Abläufe',settings:'Einstellungen'};
    if(name==='studio')name=studioTab;
    if(!Object.hasOwn(titles,name))name='transcribe';
    if(STUDIO.has(name))studioTab=name;
    document.body.dataset.activeWorkspace=name;
    document.querySelectorAll('[data-workspace]').forEach(button=>{const active=button.dataset.workspace===name||(button.dataset.workspace==='studio'&&STUDIO.has(name));button.classList.toggle('isActive',active);button.setAttribute('aria-pressed',String(active));});
    byId('subtitleWorkspace').hidden=name!=='subtitles';
    byId('captionPanel').hidden=name!=='social';
    document.querySelector('.topbarTitle strong').textContent=titles[name];
    window.dispatchEvent(new CustomEvent('klartext:workspace-change',{detail:{name}}));
    if(name==='subtitles') loadJobs();
  }
  document.querySelectorAll('[data-workspace]').forEach(button=>button.addEventListener('click',()=>setWorkspace(button.dataset.workspace)));

  const weightNames={100:'Dünn',200:'Extraleicht',300:'Leicht',400:'Normal',500:'Mittel',600:'Halbfett',700:'Fett',800:'Extrafett',900:'Ultrafett'};
  const weightLabel=(family,weight)=>family==='Aeonik'&&weight===200?'Air':weightNames[weight]||String(weight);
  function fontChoice(value){return value==='Instrument Serif Italic'?{family:'Instrument Serif',style:'italic'}:{family:value,style:value==='Instrument Serif'?'normal':null};}
  function fontOptionValue(family,style){return family==='Instrument Serif'&&style==='italic'?'Instrument Serif Italic':family;}
  function renderFontControls(){
    const chosen=fontChoice(byId('styleFont').value),family=state.project?.style.font_family||chosen.family||'Arial',variants=state.fonts[family]||state.fonts.Arial;
    const currentWeight=Number(state.project?.style.font_weight||400),currentStyle=state.project?.style.font_style||'normal';
    byId('styleFont').value=fontOptionValue(family,currentStyle);
    byId('styleWeight').replaceChildren(...variants.weights.map(weight=>{const option=document.createElement('option');option.value=weight;option.textContent=weightLabel(family,weight);return option;}));
    byId('styleWeight').value=String(variants.weights.includes(currentWeight)?currentWeight:variants.weights.reduce((a,b)=>Math.abs(b-currentWeight)<Math.abs(a-currentWeight)?b:a));
    byId('styleSlant').replaceChildren(...variants.styles.map(style=>{const option=document.createElement('option');option.value=style;option.textContent=style==='italic'?'Kursiv':'Normal';return option;}));
    byId('styleSlant').value=variants.styles.includes(currentStyle)?currentStyle:variants.styles[0];
    byId('fontVariantHint').textContent=`${variants.weights.length} Stärke${variants.weights.length===1?'':'n'} · ${variants.styles.length===2?'Normal und Kursiv':variants.styles[0]==='italic'?'Nur Kursiv':'Nur Normal'}`;
  }
  function renderHighlightFontControls(){
    const chosen=fontChoice(byId('highlightFont').value),family=state.project?.style.highlight_font_family||chosen.family||'Arial',variants=state.fonts[family]||state.fonts.Arial;
    const weight=Number(state.project?.style.highlight_font_weight||700),slant=state.project?.style.highlight_font_style||'normal';
    byId('highlightFont').value=fontOptionValue(family,slant);
    byId('highlightWeight').replaceChildren(...variants.weights.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=weightLabel(family,value);return option;}));
    byId('highlightWeight').value=String(variants.weights.includes(weight)?weight:variants.weights[0]);
    byId('highlightSlant').replaceChildren(...variants.styles.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value==='italic'?'Kursiv':'Normal';return option;}));
    byId('highlightSlant').value=variants.styles.includes(slant)?slant:variants.styles[0];
  }
  async function loadFonts(){
    try{
      state.fonts={...state.fonts,...await api('/api/fonts')};
      const names=Object.keys(state.fonts).flatMap(name=>name==='Instrument Serif'&&state.fonts[name].styles.includes('italic')?[name,'Instrument Serif Italic']:[name]);
      for(const id of ['styleFont','highlightFont']){
        byId(id).replaceChildren(...names.map(name=>{const chosen=fontChoice(name),option=document.createElement('option');option.value=name;option.textContent=name;option.style.fontFamily=`"${chosen.family}"`;option.style.fontStyle=chosen.style||'normal';return option;}));
      }
      renderFontControls();renderHighlightFontControls();
    }catch(error){status(error.message);}
  }
  let projectLoadVersion=0,jobsLoadVersion=0;
  async function loadJobs(){
    const version=++jobsLoadVersion;
    try{
      let jobs;
      try{jobs=(await api('/api/library')).jobs;if(!Array.isArray(jobs))throw new Error('Ungültige Bibliothek.');}
      catch{jobs=await api('/api/jobs');}
      if(version!==jobsLoadVersion)return;
      const select=byId('editorProject'),previous=state.job?.id||select.value;
      select.innerHTML='<option value="">Video auswählen …</option>';
      jobs.filter(j=>j.state==='done').forEach(job=>{const option=document.createElement('option');option.value=job.id;option.textContent=job.filename;select.append(option);});
      if(state.job&&!Array.from(select.options).some(option=>option.value===state.job.id))select.add(new Option(state.job.filename||'Video',state.job.id));
      if([...select.options].some(o=>o.value===previous))select.value=previous;
    }catch(error){if(version===jobsLoadVersion)status(error.message);}
  }
  async function openProject(id){
    const select=byId('editorProject');
    if(exportingVideo){select.value=state.job?.id||'';status('Der Video-Export läuft noch. Warte, bis er fertig ist.');return false;}
    const version=++projectLoadVersion;
    clearTimeout(state.saveTimer);
    const preserveDraft=async()=>{
      const saved=(!pendingSave&&!state.dirty)||await save();
      if(version!==projectLoadVersion||exportingVideo)return false;
      if(!saved){select.value=state.job?.id||'';status('Die Änderungen konnten nicht gespeichert werden. Das bisherige Video bleibt geöffnet.');return false;}
      clearTimeout(state.saveTimer);return true;
    };
    if(!await preserveDraft())return false;
    byId('exportHint').hidden=true;
    if(!id){resetEditorTools();state.job=state.project=null;state.task_id=null;select.value='';byId('editorEmpty').hidden=false;byId('editorStudio').hidden=true;return true;}
    status('Video wird geladen …');
    try{
      const [job,project]=await Promise.all([api(`/api/jobs/${id}`),api(`/api/jobs/${id}/subtitle-project`)]);
      if(version!==projectLoadVersion||!await preserveDraft())return false;
      resetEditorTools();
      project.style={...highlightDefaults,...project.style};
      proofreader.controller?.abort();clearTimeout(proofreader.timer);proofreader.run++;proofreader.issues.clear();proofreader.key='';
      // Another video takes the library's task of that video; openKlartextJob sets a more specific one right after.
      if(state.job?.id!==id)state.task_id=window.KlartextLibrary?.taskFor?.(id)?.id||null;
      state.job=job;state.project=project;state.selected=project.phrases[0]?.id||null;state.selectedWord=null;state.undo=[];state.redo=[];state.dirty=false;
      if(!Array.from(select.options).some(option=>option.value===id))select.add(new Option(job.filename||'Video',id));
      select.value=id;
      byId('editorVideo').src=job.media_url;byId('editorEmpty').hidden=true;byId('editorStudio').hidden=false;byId('saveSubtitleProject').disabled=false;
      hydrateControls();normalizeCaptionGeometry();render();if(!state.dirty)byId('editorSaveStatus').textContent='Video geladen';status('Video bereit.');scheduleProofreading();
      return true;
    }catch(error){if(version===projectLoadVersion){select.value=state.job?.id||'';status(error.message);}return false;}
  }
  byId('editorProject').addEventListener('change',event=>openProject(event.target.value));
  function remember(){if(!state.project)return;state.undo.push(clone(state.project));if(state.undo.length>80)state.undo.shift();state.redo=[];updateHistory();}
  function mutate(callback){if(!state.project)return;const before=JSON.stringify(state.project.phrases.map(({id,text})=>({id,text})));remember();callback(state.project);normalizeCaptionGeometry();state.dirty=true;byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';render();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,900);if(before!==JSON.stringify(state.project.phrases.map(({id,text})=>({id,text}))))scheduleProofreading();}
  function updateHistory(){byId('undoEditor').disabled=!state.undo.length;byId('redoEditor').disabled=!state.redo.length;}
  function travel(from,to){if(!from.length||!state.project)return;to.push(clone(state.project));state.project=from.pop();if(!state.project.phrases.some(p=>p.id===state.selected))state.selected=state.project.phrases[0]?.id||null;state.selectedWord=null;state.dirty=true;byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';hydrateControls();normalizeCaptionGeometry();render();updateHistory();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,900);scheduleProofreading();}
  byId('undoEditor').addEventListener('click',()=>travel(state.undo,state.redo));byId('redoEditor').addEventListener('click',()=>travel(state.redo,state.undo));
  let pendingSave=null;
  async function save(){
    if(pendingSave){await pendingSave;return save();}
    if(!state.project)return false;
    normalizeCaptionGeometry();if(!state.dirty)return true;
    const source=state.project,jobId=state.job.id,snapshot=JSON.stringify(source);
    byId('editorSaveStatus').textContent='Speichert …';
    const operation=(async()=>{
      try{
        const saved=await api(`/api/jobs/${jobId}/subtitle-project`,{method:'PUT',headers:{'Content-Type':'application/json'},body:snapshot});
        if(state.project!==source)return false;
        if(JSON.stringify(source)===snapshot){source.updated_at=saved.updated_at;state.dirty=false;byId('editorSaveStatus').textContent='Automatisch gespeichert';return true;}
        byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,600);return false;
      }catch(error){byId('editorSaveStatus').textContent='Speichern fehlgeschlagen';status(error.message);return false;}
    })();
    pendingSave=operation;
    try{return await operation;}finally{if(pendingSave===operation)pendingSave=null;}
  }
  byId('saveSubtitleProject').addEventListener('click',save);
  async function prepareForUpload(){
    if(exportingVideo){status('Der Video-Export läuft noch. Warte, bis er fertig ist.');return false;}
    clearTimeout(state.saveTimer);
    const saved=(!pendingSave&&!state.dirty)||await save();
    if(exportingVideo)return false;
    if(!saved){status('Die Änderungen konnten nicht gespeichert werden. Das bisherige Video bleibt geöffnet.');return false;}
    clearTimeout(state.saveTimer);return true;
  }
  function hydrateStyleNumber(id,value){const input=byId(id);if(document.activeElement!==input)input.value=value;}
  function hydrateControls(){if(!state.project)return;const s={...highlightDefaults,...state.project.style},phrase=currentPhrase();byId('aspectRatio').value=state.project.aspect_ratio;byId('styleFont').value=s.font_family;renderFontControls();byId('styleWeight').value=String(s.font_weight);byId('styleSlant').value=s.font_style;hydrateStyleNumber('styleSize',s.font_size);byId('styleTextColor').value=s.text_color;byId('styleActiveColor').value=s.active_color;byId('highlightActiveColor').value=s.active_color;byId('styleOutline').value=s.outline_width;byId('styleShadow').value=s.shadow_blur;byId('styleBackground').checked=s.background_opacity>0;hydrateStyleNumber('wordsPerLine',s.words_per_line);hydrateStyleNumber('maxLines',s.max_lines);byId('styleTransition').value=s.transition;byId('activeWord').checked=s.active_word;byId('highlightKeywords').checked=s.highlight_keywords;byId('keywordColor').value=s.keyword_color;byId('highlightEffect').value=s.highlight_effect;byId('highlightFont').value=s.highlight_font_family;renderHighlightFontControls();byId('highlightWeight').value=String(s.highlight_font_weight);byId('highlightSlant').value=s.highlight_font_style;byId('highlightTextColor').value=s.keyword_color;byId('highlightBackgroundColor').value=s.highlight_background_color;byId('individualGeometry').checked=!!phrase?.individual_geometry;document.querySelectorAll('#styleAlignment button').forEach(b=>{const active=b.dataset.value===s.alignment;b.classList.toggle('isActive',active);b.setAttribute('aria-pressed',String(active));});}
  function hydrateGlowControls(){
    if(!state.project)return;
    const s={...highlightDefaults,...state.project.style},button=byId('highlightGlow'),strength=byId('highlightGlowStrength');
    button?.setAttribute('aria-pressed',String(!!s.highlight_glow));button?.classList.toggle('isActive',!!s.highlight_glow);
    if(button)button.textContent=s.highlight_glow?'Leuchten ausschalten':'Leuchten einschalten';
    if(strength){hydrateStyleNumber('highlightGlowStrength',s.highlight_glow_strength);strength.disabled=!s.highlight_glow;}
    if(byId('highlightGlowValue'))byId('highlightGlowValue').textContent=`${s.highlight_glow_strength} px`;
  }
  function selectPhrase(id,seek=true){state.selected=id;state.selectedWord=null;const phrase=currentPhrase();if(seek&&phrase)byId('editorVideo').currentTime=phrase.start;activateInspector('phrase');render();byId('phraseList').querySelector('.isActive')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  function positionPreset(phrase,axis,name){
    return axis==='x'?{left:7+(phrase.box?.width||78)/2,center:50,right:93-(phrase.box?.width||78)/2}[name]:{top:15,middle:50,bottom:85}[name];
  }
  function renderPhrasePosition(){
    const phrase=currentPhrase();
    const geometry=phrase&&state.project?effectiveCaptionGeometry(state.project,phrase):null;
    for(const axis of ['x','y']){
      const input=byId(axis==='x'?'phraseX':'phraseY');
      if(document.activeElement!==input)input.value=geometry?Number(geometry.position[axis].toFixed(3)):'';
      input.disabled=!phrase;
      document.querySelectorAll(`[data-phrase-${axis}]`).forEach(button=>{
        const active=!!phrase&&Math.abs(geometry.position[axis]-positionPreset({...phrase,box:geometry.box},axis,button.dataset[axis==='x'?'phraseX':'phraseY']))<.01;
        button.disabled=!phrase;button.classList.toggle('isActive',active);button.setAttribute('aria-pressed',String(active));
      });
    }
  }
  function renderPhraseRail(){if(!state.project)return;byId('phraseCount').textContent=state.project.phrases.length;byId('phraseList').replaceChildren(...state.project.phrases.map((p,index)=>{
    const button=document.createElement('button');button.type='button';button.dataset.phraseId=p.id;button.className='phraseCard'+(p.id===state.selected?' isActive':'');applyHighlightVariables(button);
    const time=document.createElement('time');time.textContent=fmt(p.start);const text=document.createElement('span');text.className='phraseRailText';
    phraseTokens(p).forEach((word,wordIndex)=>{const token=document.createElement('span'),highlighted=highlightedIndices(p).includes(wordIndex),issue=languageIssue(p,wordIndex);token.className='phraseRailWord'+(highlighted?' isHighlighted':'')+(issue?' hasLanguageIssue':'');if(highlighted)token.append(highlightStar());token.append(document.createTextNode(word));if(issue)token.title=issue.message+(issue.suggestions?.length?` · Vorschlag: ${issue.suggestions.join(', ')}`:'');text.append(token,document.createTextNode(' '));});
    button.append(time,text);button.addEventListener('click',()=>selectPhrase(p.id));button.title=`Phrase ${index+1}`;return button;
  }));}
  function render(){if(!state.project)return;const phrase=currentPhrase();renderPhraseRail();
    if(phrase){byId('phraseText').value=phrase.text;for(const [id,key] of [['phraseStart','start'],['phraseEnd','end']]){if(document.activeElement!==byId(id))byId(id).value=phrase[key].toFixed(2);}}else{byId('phraseText').value='';byId('phraseStart').value='';byId('phraseEnd').value='';}
    renderPreview();renderPhrasePosition();renderHighlightWordControls();renderTimeline();renderTemplates();hydrateControls();hydrateGlowControls();
  }
  function escapeHtml(text){const span=document.createElement('span');span.textContent=text;return span.innerHTML;}
  function activeAt(time){return state.project?.phrases.find(p=>time>=p.start&&time<p.end)||null;}
  function normalizeCaptionGeometry(){if(!state.project)return;state.project.caption_geometry=state.project.caption_geometry||defaultCaptionGeometry();state.project.phrases.forEach(phrase=>{phrase.position=phrase.position||clone(state.project.caption_geometry.position);phrase.box=phrase.box||clone(state.project.caption_geometry.box);phrase.individual_geometry=!!phrase.individual_geometry;if(!Array.isArray(phrase.highlighted_words))phrase.highlighted_words=automaticHighlightIndices(phrase.text);if(!Array.isArray(phrase.enlarged_words))phrase.enlarged_words=[];});renderPreview();}
  function renderHighlightWordControls(){
    const wrap=byId('phraseWordHighlights');if(!wrap)return;const phrase=currentPhrase();wrap.replaceChildren();if(!phrase){renderSelectedWord();return;}applyHighlightVariables(wrap);
    phraseTokens(phrase).forEach((word,index)=>{const chip=document.createElement('button'),issue=languageIssue(phrase,index);chip.type='button';chip.dataset.wordIndex=index;chip.className='phraseWordChip'+(highlightedIndices(phrase).includes(index)?' isHighlighted':'')+(enlargedIndices(phrase).includes(index)?' isEnlarged':'')+(state.selectedWord===index?' isSelected':'')+(issue?' hasLanguageIssue':'');if(highlightedIndices(phrase).includes(index))chip.append(highlightStar());chip.append(document.createTextNode(word));chip.setAttribute('aria-pressed',String(state.selectedWord===index));chip.title=issue?.message||'Anklicken für Optionen · Doppelklick zum Bearbeiten';chip.addEventListener('click',()=>selectWord(index));chip.addEventListener('dblclick',()=>beginWordEdit(index));chip.addEventListener('keydown',event=>{if(event.key==='F2'){event.preventDefault();beginWordEdit(index);}});wrap.append(chip);});renderSelectedWord();
  }
  function selectWord(index){state.selectedWord=index;byId('phraseWordHighlights').querySelectorAll('.phraseWordChip').forEach(chip=>{const selected=Number(chip.dataset.wordIndex)===index;chip.classList.toggle('isSelected',selected);chip.setAttribute('aria-pressed',String(selected));});renderSelectedWord();}
  function renderSelectedWord(){
    const phrase=currentPhrase(),index=state.selectedWord,word=index==null?null:phraseTokens(phrase)[index],panel=byId('selectedWordOptions');panel.hidden=!word;if(!word)return;
    byId('selectedWordLabel').textContent=word;byId('selectedWordHighlight').checked=highlightedIndices(phrase).includes(index);byId('selectedWordEnlarged').checked=enlargedIndices(phrase).includes(index);
    const suggestions=byId('wordSuggestions'),issue=languageIssue(phrase,index);suggestions.replaceChildren();if(!issue)return;
    const message=document.createElement('p');message.textContent=issue.message;suggestions.append(message);for(const value of issue.suggestions||[]){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=`„${value}“ übernehmen`;button.addEventListener('click',()=>{if(languageIssue(phrase,index)!==issue)return;mutate(()=>replacePhraseWord(phrase,index,value));scheduleProofreading();});suggestions.append(button);}
  }
  function beginWordEdit(index){
    const phrase=currentPhrase(),chip=byId('phraseWordHighlights').querySelector(`[data-word-index="${index}"]`);if(!phrase||!chip)return;state.selectedWord=index;renderSelectedWord();
    const input=document.createElement('input');input.className='phraseWordInput';input.dataset.wordIndex=index;input.value=phraseTokens(phrase)[index];input.setAttribute('aria-label','Wort korrigieren');input.lang='de';input.spellcheck=true;input.maxLength=100;chip.replaceWith(input);let finished=false;
    function finish(commit){if(finished)return;finished=true;const value=input.value.trim();if(commit&&value&&value!==phraseTokens(phrase)[index]){mutate(()=>replacePhraseWord(phrase,index,value));scheduleProofreading();}else renderHighlightWordControls();}
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}else if(event.key==='Escape'){event.preventDefault();finish(false);}});input.addEventListener('blur',()=>finish(true));input.focus();input.select();
  }
  // Committing an inline edit rebuilds these buttons. Preserve the intended action
  // before blur removes its original pointer target and swallows the following click.
  document.addEventListener('pointerdown',event=>{
    const input=byId('phraseWordHighlights').querySelector('.phraseWordInput'),target=event.target.closest('.phraseCard,.timelineClip,.phraseWordChip');if(!input||!target)return;
    const phraseId=target.dataset.phraseId,wordIndex=target.dataset.wordIndex,edge=event.target.closest('.timelineTrimHandle')?.dataset.edge;
    const phrase=currentPhrase(),wordCount=phraseTokens(phrase).length,editedIndex=Number(input.dataset.wordIndex);
    event.preventDefault();event.stopPropagation();input.blur();
    if(phraseId){selectPhrase(phraseId);if(edge){const handle=byId('timelineCaptionTrack').querySelector(`[data-phrase-id="${phraseId}"] [data-edge="${edge}"]`);if(handle)beginTimelineTrim({pointerId:event.pointerId,clientX:event.clientX,currentTarget:handle,preventDefault(){},stopPropagation(){}},phraseId,edge);}}
    else if(wordIndex!=null)selectWord(Number(wordIndex)+(Number(wordIndex)>editedIndex?phraseTokens(phrase).length-wordCount:0));
  },true);
  byId('editSelectedWord').addEventListener('click',()=>{if(state.selectedWord!=null)beginWordEdit(state.selectedWord);});
  for(const [id,field] of [['selectedWordHighlight','highlighted_words'],['selectedWordEnlarged','enlarged_words']])byId(id).addEventListener('change',event=>{const phrase=currentPhrase(),index=state.selectedWord;if(!phrase||index==null)return;mutate(()=>{const selected=new Set(phrase[field]||[]);event.target.checked?selected.add(index):selected.delete(index);phrase[field]=[...selected].sort((a,b)=>a-b);});});
  function scheduleProofreading(){clearTimeout(proofreader.timer);proofreader.controller?.abort();proofreader.run++;proofreader.key='';byId('proofreadSubtitles').disabled=false;byId('proofreadingStatus').textContent='Sprachprüfung wird aktualisiert …';proofreader.timer=setTimeout(()=>void checkSubtitleLanguage(),1200);}
  async function checkSubtitleLanguage(force=false){
    if(!state.project||!state.job)return;const phrases=state.project.phrases.map(({id,text})=>({id,text})),key=JSON.stringify([state.job.id,phrases]);if(!force&&key===proofreader.key){byId('proofreadingStatus').textContent='Geprüft · Deutsch und englische Wörter';return;}
    proofreader.controller?.abort();const controller=new AbortController(),run=++proofreader.run;proofreader.controller=controller;const label=byId('proofreadingStatus');label.textContent='Rechtschreibung und Grammatik werden lokal geprüft …';byId('proofreadSubtitles').disabled=true;
    try{const result=await api(`/api/jobs/${state.job.id}/subtitle-proofread`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phrases}),signal:controller.signal});if(run!==proofreader.run)return;
      if(result.status!=='ready'){label.textContent=result.error||'Sprachprüfung derzeit nicht verfügbar. Erneut prüfen.';return;}
      proofreader.key=key;proofreader.issues=new Map(result.phrases.map(p=>[p.id,p]));const count=result.phrases.reduce((sum,p)=>sum+p.issues.length,0);label.textContent=count?`${count} mögliche Sprachfehler · Vorschläge beim Wort`:'Geprüft · Deutsch und englische Wörter';renderPhraseRail();if(!byId('phraseWordHighlights').querySelector('.phraseWordInput'))renderHighlightWordControls();
    }catch(error){if(error.name!=='AbortError'&&run===proofreader.run)label.textContent=`Sprachprüfung: ${error.message}`;}finally{if(run===proofreader.run)byId('proofreadSubtitles').disabled=false;}
  }
  byId('proofreadSubtitles').addEventListener('click',()=>void checkSubtitleLanguage(true));
  function appendCaptionWords(overlay,phrase,s,time){
      const lines=layoutCaptionWords(phrase.text,s.words_per_line,s.max_lines),timing=timedPhraseWords(phrase);
      const normalizeKeyword=word=>String(word).toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
      const keywords=new Set((state.project.highlight_rules||[]).flatMap(tokenizeCaptionText).map(normalizeKeyword).filter(Boolean));
      lines.forEach((line,lineIndex)=>{
        const row=document.createElement('div');row.className='captionLine';
        line.forEach((word,wordIndex)=>{
          const index=lines.slice(0,lineIndex).reduce((sum,item)=>sum+item.length,0)+wordIndex,span=document.createElement('span'),{start,end}=timing[index];
          span.textContent=word+(wordIndex<line.length-1?' ':'');
          const persistent=highlightedIndices(phrase).includes(index),keyword=s.highlight_keywords&&keywords.has(normalizeKeyword(word));
          // Permanent marks keep their configured color before, during and after word timing.
          const active=s.active_word&&!persistent&&!keyword&&time>=start&&time<end;
          const pending=s.word_reveal&&time<start;
          span.className=['captionWord',persistent?'isHighlighted':'',enlargedIndices(phrase).includes(index)?'isEnlarged':'',keyword?'isKeyword':'',active?'isActive':'',pending?'isPending':''].filter(Boolean).join(' ');span.dataset.wordIndex=String(index);span.setAttribute('role','button');span.tabIndex=pending?-1:0;span.setAttribute('aria-hidden',String(!!pending));span.setAttribute('aria-label',`${word} · Hervorhebung ${persistent?'aktiv':'inaktiv'}`);span.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();mutate(()=>toggleHighlightedWord(phrase,index));}});
          row.append(span);
        });overlay.append(row);
      });
  }
  function measuredCaptionFit(overlay,stage){
    const fit=Math.min(1,overlay.clientWidth&&overlay.scrollWidth?overlay.clientWidth/overlay.scrollWidth:1,stage.height&&overlay.scrollHeight?Math.max(1,stage.height-4)/overlay.scrollHeight:1);
    return Math.max(.000001,fit<1?fit*.99:1);
  }
  async function prepareCaptionExportFits(){
    const s={...highlightDefaults,...state.project.style};
    await Promise.all([[s.font_family,s.font_weight,s.font_style],[s.highlight_font_family,s.highlight_font_weight,s.highlight_font_style]].map(([family,weight,style])=>document.fonts.load(`${style} ${weight} 72px "${family}"`)));
    const stageElement=byId('videoStage'),stage=stageElement.getBoundingClientRect(),logicalWidth=state.project.aspect_ratio==='16:9'?1920:1080;
    if(!stage.width||!stage.height)throw new Error('Die Videovorschau ist nicht sichtbar. Exportier noch mal.');
    const frame=byId('captionSelection').cloneNode(false),overlay=byId('captionOverlay').cloneNode(false);
    frame.removeAttribute('id');overlay.removeAttribute('id');frame.hidden=false;frame.inert=true;
    frame.style.visibility='hidden';frame.style.left='-100000px';frame.style.top='0';frame.style.transform='none';
    overlay.dataset.transition='none';frame.append(overlay);stageElement.append(frame);
    try{
      for(const phrase of state.project.phrases){
        const geometry=effectiveCaptionGeometry(state.project,phrase);
        frame.style.width=`${geometry.box.width}%`;
        overlay.replaceChildren();overlay.style.fontSize=`${s.font_size*geometry.box.scale*stage.width/logicalWidth}px`;
        appendCaptionWords(overlay,phrase,s,phrase.start);
        const fit=measuredCaptionFit(overlay,stage);
        phrase.box=phrase.box||{width:geometry.box.width,scale:geometry.box.scale};
        if(phrase.box.fit!==fit){phrase.box.fit=fit;state.dirty=true;}
      }
    }finally{frame.remove();}
    return stage.width;
  }
  function renderPreview(){if(!state.project)return;const stageElement=byId('videoStage');stageElement.className=`videoStage aspect-${state.project.aspect_ratio.replace(':','-')}`;const stage=stageElement.getBoundingClientRect();if(!stage.width||!stage.height)return;const time=byId('editorVideo').currentTime||0,phrase=activeAt(time),overlay=byId('captionOverlay'),selection=byId('captionSelection'),s={...highlightDefaults,...state.project.style},geometry=phrase?effectiveCaptionGeometry(state.project,phrase):null;overlay.replaceChildren();selection.hidden=!phrase;state.displayedPhrase=phrase?.id||null;
    overlay.style.setProperty('--active-word-color',s.active_color);
    overlay.style.setProperty('--keyword-color',s.keyword_color||highlightDefaults.keyword_color);
    overlay.dataset.highlightEffect=s.highlight_effect||highlightDefaults.highlight_effect;
    overlay.dataset.highlightGlow=String(!!s.highlight_glow&&Number(s.highlight_glow_strength)>0);
    if(phrase){
      phrase.box=phrase.box||{width:78,scale:1};phrase.position=phrase.position||{x:50,y:78};
      appendCaptionWords(overlay,phrase,s,time);
      selection.style.left=`${geometry.position.x}%`;selection.style.top=`${geometry.position.y}%`;selection.style.width=`${geometry.box.width}%`;selection.style.setProperty('--caption-scale',geometry.box.scale);
    }
    // Match the logical ASS canvas selected by server.py, independent of source resolution.
    const logicalWidth=state.project.aspect_ratio==='16:9'?1920:1080;
    overlay.style.setProperty('--highlight-glow-blur',`${Math.max(0,Math.min(40,Number(s.highlight_glow_strength)||0))*stage.width/logicalWidth}px`);
    overlay.style.setProperty('--caption-shadow',`${s.shadow_x}px ${s.shadow_y}px ${s.shadow_blur}px ${s.shadow_color}`);
    const scale=geometry?.box.scale||1;overlay.style.fontFamily=`"${s.font_family}",sans-serif`;overlay.style.fontWeight=s.font_weight;overlay.style.fontStyle=s.font_style;overlay.style.setProperty('--highlight-font-family',`"${s.highlight_font_family}",sans-serif`);overlay.style.setProperty('--highlight-font-weight',s.highlight_font_weight);overlay.style.setProperty('--highlight-font-style',s.highlight_font_style);overlay.style.setProperty('--highlight-text-color',s.keyword_color);overlay.style.setProperty('--highlight-background-color',s.highlight_background_color);const stageWidth=stage.width;overlay.style.fontSize=`${s.font_size*scale*stageWidth/logicalWidth}px`;overlay.style.color=s.text_color;overlay.style.textAlign=s.alignment;overlay.style.webkitTextStroke=`${s.outline_width}px ${s.outline_color}`;overlay.style.textShadow=`${s.shadow_x}px ${s.shadow_y}px ${s.shadow_blur}px ${s.shadow_color}`;overlay.style.background=s.background_opacity?`${s.background_color}${Math.round(s.background_opacity*2.55).toString(16).padStart(2,'0')}`:'transparent';overlay.dataset.transition=s.transition;
    if(phrase){
      const effectiveFit=measuredCaptionFit(overlay,stage),target=captionGeometryTarget(state.project,phrase);
      overlay.style.fontSize=`${parseFloat(overlay.style.fontSize)*effectiveFit}px`;
      const height=stage.height?selection.getBoundingClientRect().height/stage.height*100:0,targetPosition=clampPosition(target.position,target.box.width,height);
      selection.style.left=`${targetPosition.x}%`;selection.style.top=`${targetPosition.y}%`;
      // Rendering only shows: the fit never reaches the project (the export measures its own in prepareCaptionExportFits),
      // and the kept-in-frame position only rides along with a change the user is making. Opening never saves (Spec 4.10).
      if(state.dirty&&document.body.dataset.videoExpanded!=='true')target.position=targetPosition;
    }
  }
  const filmstripRuns=new WeakMap();
  const thumbnailCount=container=>Math.max(1,Math.min(60,Math.ceil(container.clientWidth/120)));
  async function renderFilmstrip(video,container,duration){
    filmstripRuns.get(container)?.controller.abort();
    const run={controller:new AbortController()},signal=run.controller.signal;
    filmstripRuns.set(container,run);
    const count=thumbnailCount(container),validDuration=Number.isFinite(duration)&&duration>0?duration:1;
    const cells=Array.from({length:count},(_,index)=>{
      const cell=document.createElement('div');cell.className='filmstripCell';cell.dataset.time=String((index+.5)*validDuration/count);
      cell.style.left=`${index/count*100}%`;cell.style.width=`${100/count}%`;return cell;
    });
    container.replaceChildren(...cells);
    const source=video.currentSrc||video.src;
    if(!source)return;
    const detached=document.createElement('video');detached.preload='auto';detached.muted=true;detached.playsInline=true;
    detached.crossOrigin=video.crossOrigin||'anonymous';
    // Register before changing src/currentTime; media failures and stuck seeks are bounded.
    function waitForMedia(event,action){return new Promise((resolve,reject)=>{
      let timer;
      const finish=error=>{clearTimeout(timer);detached.removeEventListener(event,ready);detached.removeEventListener('error',failed);signal.removeEventListener('abort',cancelled);error?reject(error):resolve();};
      const ready=()=>finish(),failed=()=>finish(new Error('Video nicht verfügbar')),cancelled=()=>finish(new Error('Vorschau ersetzt'));
      if(signal.aborted){cancelled();return;}
      detached.addEventListener(event,ready,{once:true});detached.addEventListener('error',failed,{once:true});signal.addEventListener('abort',cancelled,{once:true});
      timer=setTimeout(()=>finish(new Error('Videovorschau nicht verfügbar')),4000);
      try{action();}catch(error){finish(error);}
    });}
    try{
      await waitForMedia('loadeddata',()=>{detached.src=source;detached.load();});
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(1,Math.round(160*(detached.videoHeight||90)/(detached.videoWidth||160)));
      const context=canvas.getContext('2d');if(!context)return;
      for(const cell of cells){
        if(signal.aborted)return;
        const timestamp=Number(cell.dataset.time);
        if(Number.isFinite(detached.duration)&&timestamp>=detached.duration)continue;
        await waitForMedia('seeked',()=>detached.currentTime=timestamp);
        if(signal.aborted)return;
        context.drawImage(detached,0,0,canvas.width,canvas.height);
        const image=document.createElement('img');image.alt='';image.draggable=false;image.src=canvas.toDataURL('image/jpeg',.75);cell.append(image);
      }
    }catch{
      // Keep the neutral cells usable even when decoding, seeking, or canvas capture fails.
    }finally{
      try{detached.removeAttribute('src');detached.load();}catch{
        // Teardown failures must not escape the optional thumbnail task either.
      }
    }
  }
  window.renderFilmstrip=renderFilmstrip;
  let timelineScale={duration:1,width:1},filmstripKey='';
  function updateTimelinePlayhead(){
    const video=byId('editorVideo'),viewport=byId('timelineTrack').parentElement;
    const position=Math.min(timelineScale.duration,Math.max(0,video.currentTime||0))/timelineScale.duration*timelineScale.width;
    // Keep the two-pixel line inside the last frame as well as during playback.
    byId('timelinePlayhead').style.left=`${Math.min(position,Math.max(0,timelineScale.width-2))}px`;
    if(video.paused||!viewport.clientWidth)return;
    const margin=Math.min(24,viewport.clientWidth/4),left=viewport.scrollLeft,right=left+viewport.clientWidth;
    if(position<left+margin||position>right-margin){
      viewport.scrollLeft=Math.max(0,Math.min(viewport.scrollWidth-viewport.clientWidth,position-viewport.clientWidth/2));
    }
  }
  function renderTimeline(){
    if(!state.project)return;
    if(timelineTrimGesture)finishTimelineTrim({pointerId:timelineTrimGesture.pointerId},false);
    if(timelineMoveGesture)finishTimelineMove({pointerId:timelineMoveGesture.pointerId},false);
    const track=byId('timelineTrack'),video=byId('editorVideo'),mediaDuration=Number.isFinite(video.duration)?video.duration:0;
    const duration=Math.max(mediaDuration,...state.project.phrases.map(p=>p.end),1),zoom=Number(byId('timelineZoom').value)||1,width=Math.max(track.parentElement.clientWidth,duration*80*zoom),pixelsPerSecond=width/duration;
    timelineScale={duration,width};track.style.width=`${width}px`;
    const ruler=byId('timelineRuler'),captionTrack=byId('timelineCaptionTrack'),filmstrip=byId('timelineFilmstrip');
    const steps=[.1,.25,.5,1,2,5,10,15,30,60,120,300,600,1800,3600],step=steps.find(value=>value*pixelsPerSecond>=70)||Math.ceil(70/pixelsPerSecond);
    ruler.replaceChildren(...Array.from({length:Math.floor(duration/step)+1},(_,index)=>{
      const tick=document.createElement('span'),time=index*step;tick.className='timelineTick';tick.dataset.time=String(time);tick.style.left=`${time*pixelsPerSecond}px`;tick.textContent=fmt(time);return tick;
    }));
    const focusedId=document.activeElement?.dataset.phraseId;
    captionTrack.replaceChildren(...state.project.phrases.map(p=>{
      const button=document.createElement('button');button.type='button';button.dataset.phraseId=p.id;button.className='timelineClip'+(p.id===state.selected?' isActive':'');button.setAttribute('aria-pressed',String(p.id===state.selected));
      button.style.left=`${p.start*pixelsPerSecond}px`;button.style.width=`${(p.end-p.start)*pixelsPerSecond}px`;button.title=`${fmt(p.start)} · ${p.text}`;button.setAttribute('aria-label',button.title);
      const startHandle=document.createElement('span'),endHandle=document.createElement('span');startHandle.className='timelineTrimHandle is-start';endHandle.className='timelineTrimHandle is-end';startHandle.dataset.edge='start';endHandle.dataset.edge='end';
      [startHandle,endHandle].forEach(handle=>{const edge=handle.dataset.edge,bounds=timelineBounds(p,state.project.phrases.indexOf(p),duration);handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-label',`${edge==='start'?'Startzeit':'Endzeit'} von Phrase ${state.project.phrases.indexOf(p)+1} ziehen`);handle.setAttribute('aria-valuenow',p[edge]);handle.setAttribute('aria-valuemin',edge==='start'?bounds.minimumStart:p.start+.1);handle.setAttribute('aria-valuemax',edge==='start'?p.end-.1:bounds.maximumEnd);handle.setAttribute('aria-valuetext',`${p[edge].toFixed(2)} Sekunden`);handle.title='Ziehen oder mit Pfeiltasten anpassen';handle.addEventListener('pointerdown',event=>beginTimelineTrim(event,p.id,edge));handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();state.selected=p.id;activateInspector('phrase');mutate(()=>{const step=timelineStep()*(event.shiftKey?10:1),value=roundTimelineTime(p[edge]+(event.key==='ArrowLeft'?-step:step));p[edge]=edge==='start'?Math.min(p.end-.1,Math.max(bounds.minimumStart,value)):Math.max(p.start+.1,Math.min(bounds.maximumEnd,value));});byId('timelineCaptionTrack').querySelector(`[data-phrase-id="${p.id}"] [data-edge="${edge}"]`)?.focus({preventScroll:true});});});
      const time=document.createElement('time'),label=document.createElement('span');time.textContent=fmt(p.start);label.textContent=p.text;button.append(startHandle,time,label,endHandle);
      button.addEventListener('pointerdown',event=>{if(!event.target.closest('.timelineTrimHandle'))beginTimelineMove(event,p.id);});
      button.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('.timelineTrimHandle')||consumeTimelineDragClick())return;selectPhrase(p.id);});
      button.addEventListener('keydown',event=>{
        if(event.target.closest('.timelineTrimHandle')||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();state.selected=p.id;state.selectedWord=null;activateInspector('phrase');
        mutate(()=>movePhraseTo(p,roundTimelineTime(p.start+(event.key==='ArrowLeft'?-1:1)*timelineStep()*(event.shiftKey?10:1))));
        byId('timelineCaptionTrack').querySelector(`[data-phrase-id="${p.id}"]`)?.focus({preventScroll:true});
      });return button;
    }));
    if(focusedId)[...captionTrack.children].find(button=>button.dataset.phraseId===focusedId)?.focus({preventScroll:true});
    updateTimelinePlayhead();
    const key=JSON.stringify([video.currentSrc||video.src,duration,thumbnailCount(filmstrip)]);
    if(key!==filmstripKey){filmstripKey=key;void renderFilmstrip(video,filmstrip,duration);}
  }
  let timelineTrimGesture=null,timelineMoveGesture=null,timelineDragClickUntil=0;
  function consumeTimelineDragClick(){if(Date.now()>timelineDragClickUntil)return false;timelineDragClickUntil=0;return true;}
  byId('timelineTrack').addEventListener('click',event=>{
    if(!state.project||consumeTimelineDragClick()||event.target.closest('.timelineClip,.timelineTrimHandle'))return;
    const rect=byId('timelineTrack').getBoundingClientRect();
    if(!rect.width)return;
    byId('editorVideo').currentTime=Math.max(0,Math.min(timelineScale.duration,(event.clientX-rect.left)/rect.width*timelineScale.duration));
    syncPlayback();
  });
  function timelineStep(){return Number(byId('timelinePrecision')?.value)||.05;}
  function roundTimelineTime(value){const step=timelineStep();return Number((Math.round(Math.max(0,value)/step)*step).toFixed(6));}
  function timelineBounds(phrase,index,duration){return {minimumStart:state.project.phrases[index-1]?.end??0,maximumEnd:state.project.phrases[index+1]?.start??duration};}
  function movePhraseTo(phrase,start,source={start:phrase.start,end:phrase.end,words:clone(phrase.words||[])}){
    const index=state.project.phrases.indexOf(phrase),videoDuration=byId('editorVideo').duration;
    const limit=Number.isFinite(videoDuration)?videoDuration:timelineScale.duration,bounds=timelineBounds(phrase,index,limit),duration=source.end-source.start;
    const nextStart=Number(Math.max(bounds.minimumStart,Math.min(bounds.maximumEnd-duration,limit-duration,start)).toFixed(6)),delta=nextStart-source.start;
    phrase.start=nextStart;phrase.end=Number((nextStart+duration).toFixed(6));
    phrase.words=source.words.map(word=>{
      const next={...word};
      for(const edge of ['start','end'])if(word[edge]!=null&&Number.isFinite(Number(word[edge])))next[edge]=Number((Number(word[edge])+delta).toFixed(6));
      return next;
    });
  }
  function beginTimelineMove(event,phraseId){
    if(event.button!=null&&event.button!==0||timelineTrimGesture||timelineMoveGesture)return;
    const phrase=state.project?.phrases.find(p=>p.id===phraseId);if(!phrase)return;
    event.preventDefault();event.stopPropagation();state.selected=phraseId;state.selectedWord=null;activateInspector('phrase');
    renderPhraseRail();renderHighlightWordControls();hydrateControls();renderPhrasePosition();byId('phraseText').value=phrase.text;
    byId('phraseStart').value=phrase.start.toFixed(2);byId('phraseEnd').value=phrase.end.toFixed(2);
    byId('timelineCaptionTrack').querySelectorAll('.timelineClip').forEach(clip=>{const selected=clip.dataset.phraseId===phraseId;clip.classList.toggle('isActive',selected);clip.setAttribute('aria-pressed',String(selected));});
    timelineMoveGesture={phraseId,pointerId:event.pointerId,handle:event.currentTarget,startX:event.clientX,scrollLeft:byId('timelineTrack').parentElement.scrollLeft,source:{start:phrase.start,end:phrase.end,words:clone(phrase.words||[])},dragged:false};
    event.currentTarget.focus?.({preventScroll:true});event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.addEventListener('pointermove',moveTimelinePhrase);event.currentTarget.addEventListener('pointerup',finishTimelineMove);event.currentTarget.addEventListener('pointercancel',finishTimelineMove);event.currentTarget.addEventListener('lostpointercapture',finishTimelineMove);
  }
  function moveTimelinePhrase(event){
    if(!timelineMoveGesture||event.pointerId!==timelineMoveGesture.pointerId)return;
    const gesture=timelineMoveGesture,phrase=state.project?.phrases.find(p=>p.id===gesture.phraseId);if(!phrase)return;
    const pixels=event.clientX-gesture.startX+(byId('timelineTrack').parentElement.scrollLeft-gesture.scrollLeft);
    if(!gesture.dragged&&Math.abs(pixels)<3)return;
    if(!gesture.dragged){remember();gesture.dragged=true;gesture.handle.classList.add('isMoving');}
    movePhraseTo(phrase,roundTimelineTime(gesture.source.start+pixels/timelineScale.width*timelineScale.duration),gesture.source);
    state.dirty=true;byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';
    gesture.handle.style.left=`${phrase.start/timelineScale.duration*timelineScale.width}px`;gesture.handle.querySelector('time').textContent=fmt(phrase.start);
    byId('phraseStart').value=phrase.start.toFixed(2);byId('phraseEnd').value=phrase.end.toFixed(2);renderPreview();
  }
  function finishTimelineMove(event,rerender=true){
    if(!timelineMoveGesture||event.pointerId!==timelineMoveGesture.pointerId)return;
    const gesture=timelineMoveGesture,handle=gesture.handle;timelineMoveGesture=null;
    handle.removeEventListener('pointermove',moveTimelinePhrase);handle.removeEventListener('pointerup',finishTimelineMove);handle.removeEventListener('pointercancel',finishTimelineMove);handle.removeEventListener('lostpointercapture',finishTimelineMove);handle.classList.remove('isMoving');
    if(handle.hasPointerCapture?.(event.pointerId))handle.releasePointerCapture(event.pointerId);
    if(!gesture.dragged)return;
    timelineDragClickUntil=Date.now()+350;clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,600);
    if(rerender)render();
  }
  function beginTimelineTrim(event,phraseId,edge){event.preventDefault();event.stopPropagation();if(timelineTrimGesture)return;const phrase=state.project?.phrases.find(p=>p.id===phraseId),index=state.project?.phrases.indexOf(phrase);if(!phrase||index<0)return;remember();state.selected=phraseId;state.selectedWord=null;activateInspector('phrase');renderHighlightWordControls();hydrateControls();byId('phraseText').value=phrase.text;timelineTrimGesture={phraseId,edge,pointerId:event.pointerId,handle:event.currentTarget,startX:event.clientX,startStart:phrase.start,startEnd:phrase.end,index};event.currentTarget.setPointerCapture?.(event.pointerId);event.currentTarget.addEventListener('pointermove',moveTimelineTrim);event.currentTarget.addEventListener('pointerup',finishTimelineTrim);event.currentTarget.addEventListener('pointercancel',finishTimelineTrim);event.currentTarget.addEventListener('lostpointercapture',finishTimelineTrim);}
  function moveTimelineTrim(event){if(!timelineTrimGesture||event.pointerId!==timelineTrimGesture.pointerId)return;const gesture=timelineTrimGesture,phrase=state.project?.phrases.find(p=>p.id===gesture.phraseId);if(!phrase||!timelineScale.width)return;const delta=(event.clientX-gesture.startX)/timelineScale.width*timelineScale.duration,duration=timelineScale.duration,bounds=timelineBounds(phrase,gesture.index,duration);if(gesture.edge==='start')phrase.start=Math.min(gesture.startEnd-.1,Math.max(bounds.minimumStart,roundTimelineTime(gesture.startStart+delta)));else phrase.end=Math.max(gesture.startStart+.1,Math.min(bounds.maximumEnd,roundTimelineTime(gesture.startEnd+delta)));state.dirty=true;byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';const clip=byId('timelineCaptionTrack').querySelector(`[data-phrase-id="${phrase.id}"]`);if(clip){clip.style.left=`${phrase.start/timelineScale.duration*timelineScale.width}px`;clip.style.width=`${(phrase.end-phrase.start)/timelineScale.duration*timelineScale.width}px`;clip.querySelector('time').textContent=fmt(phrase.start);clip.title=`${fmt(phrase.start)} · ${phrase.text}`;clip.setAttribute('aria-label',clip.title);}renderPreview();}
  function finishTimelineTrim(event,rerender=true){if(!timelineTrimGesture||event.pointerId!==timelineTrimGesture.pointerId)return;const handle=timelineTrimGesture.handle;timelineTrimGesture=null;handle.removeEventListener('pointermove',moveTimelineTrim);handle.removeEventListener('pointerup',finishTimelineTrim);handle.removeEventListener('pointercancel',finishTimelineTrim);handle.removeEventListener('lostpointercapture',finishTimelineTrim);if(handle.hasPointerCapture?.(event.pointerId))handle.releasePointerCapture(event.pointerId);clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,600);if(rerender)render();}
  window.roundTimelineTime=roundTimelineTime;
  window.timelineBounds=timelineBounds;
  const styleBindings={styleWeight:['font_weight',Number],styleSlant:['font_style',String],styleSize:['font_size',Number],styleTextColor:['text_color',String],styleActiveColor:['active_color',String],highlightActiveColor:['active_color',String],styleOutline:['outline_width',Number],styleShadow:['shadow_blur',Number],wordsPerLine:['words_per_line',Number],maxLines:['max_lines',Number],styleTransition:['transition',String],activeWord:['active_word',v=>v],highlightKeywords:['highlight_keywords',v=>v],keywordColor:['keyword_color',String],highlightTextColor:['keyword_color',String],highlightBackgroundColor:['highlight_background_color',String],highlightEffect:['highlight_effect',String],highlightWeight:['highlight_font_weight',Number],highlightSlant:['highlight_font_style',String]};
  Object.entries(styleBindings).forEach(([id,[key,convert]])=>{
    const element=byId(id),apply=()=>{
      if(element.type==='number'&&element.value==='')return;
      if(element.checkValidity&&!element.checkValidity())return;
      const value=convert(element.type==='checkbox'?element.checked:element.value);
      if(!state.project||state.project.style[key]===value)return;
      mutate(p=>p.style[key]=value);hydrateControls();
    };
    element.addEventListener('input',apply);
    element.addEventListener('change',()=>{apply();if(element.type==='number'&&state.project)element.value=state.project.style[key];});
  });
  byId('highlightGlow')?.addEventListener('click',()=>mutate(project=>project.style.highlight_glow=!project.style.highlight_glow));
  const glowStrength=byId('highlightGlowStrength');
  const updateGlowStrength=()=>{if(state.project&&glowStrength.value!==''&&glowStrength.checkValidity()){const value=Math.max(0,Math.min(40,Number(glowStrength.value)));if(state.project.style.highlight_glow_strength!==value)mutate(project=>project.style.highlight_glow_strength=value);}};
  glowStrength?.addEventListener('input',updateGlowStrength);glowStrength?.addEventListener('change',updateGlowStrength);
  byId('styleFont').addEventListener('change',event=>mutate(project=>{const chosen=fontChoice(event.target.value),variants=state.fonts[chosen.family];project.style.font_family=chosen.family;project.style.font_weight=variants.weights.includes(project.style.font_weight)?project.style.font_weight:variants.weights[0];project.style.font_style=chosen.style||(variants.styles.includes(project.style.font_style)?project.style.font_style:variants.styles[0]);renderFontControls();}));
  byId('highlightFont').addEventListener('change',event=>mutate(project=>{const chosen=fontChoice(event.target.value),variants=state.fonts[chosen.family];project.style.highlight_font_family=chosen.family;project.style.highlight_font_weight=variants.weights.includes(project.style.highlight_font_weight)?project.style.highlight_font_weight:variants.weights[0];project.style.highlight_font_style=chosen.style||(variants.styles.includes(project.style.highlight_font_style)?project.style.highlight_font_style:variants.styles[0]);renderHighlightFontControls();}));
  byId('styleBackground').addEventListener('change',event=>mutate(p=>p.style.background_opacity=event.target.checked?72:0));document.querySelectorAll('#styleAlignment button').forEach(button=>button.addEventListener('click',()=>{mutate(p=>p.style.alignment=button.dataset.value);hydrateControls();}));
  byId('aspectRatio').addEventListener('change',event=>mutate(p=>p.aspect_ratio=event.target.value));
  byId('phraseText').addEventListener('focus',()=>{if(state.project)remember();},{once:false});
  byId('phraseText').addEventListener('input',event=>{const phrase=currentPhrase();if(!phrase)return;phrase.text=event.target.value;const count=phraseTokens(phrase).length;phrase.highlighted_words=highlightedIndices(phrase).filter(index=>index<count);phrase.enlarged_words=enlargedIndices(phrase).filter(index=>index<count);proofreader.issues.delete(phrase.id);state.dirty=true;byId('editorSaveStatus').textContent='Änderungen nicht gespeichert';renderPreview();renderPhraseRail();renderTimeline();renderHighlightWordControls();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,900);scheduleProofreading();});
  byId('phraseText').addEventListener('change',render);
  byId('individualGeometry').addEventListener('change',event=>{const phrase=currentPhrase();if(!phrase)return;mutate(project=>{if(event.target.checked){const geometry=effectiveCaptionGeometry(project,phrase);phrase.position=clone(geometry.position);phrase.box=clone(geometry.box);phrase.individual_geometry=true;}else phrase.individual_geometry=false;});});
  for(const [id,key] of [['phraseStart','start'],['phraseEnd','end']]){
    const input=byId(id);
    input.addEventListener('input',()=>{
      const phrase=currentPhrase();if(!phrase||input.value===''||!input.checkValidity())return;
      const value=Number(input.value),index=state.project.phrases.indexOf(phrase);
      const start=key==='start'?value:phrase.start,end=key==='end'?value:phrase.end;
      if(end<=start||start<(state.project.phrases[index-1]?.end||0)||end>(state.project.phrases[index+1]?.start??Infinity))return;
      mutate(()=>phrase[key]=value);
    });
    input.addEventListener('change',()=>{const phrase=currentPhrase();if(phrase)input.value=phrase[key].toFixed(2);});
  }
  for(const axis of ['x','y']){
    const input=byId(axis==='x'?'phraseX':'phraseY');
    input.addEventListener('input',()=>{
      const phrase=currentPhrase();if(!phrase||input.value===''||!input.checkValidity())return;
      mutate(project=>captionGeometryTarget(project,phrase).position[axis]=Number(input.value));
    });
    input.addEventListener('change',()=>{const phrase=currentPhrase(),geometry=phrase&&effectiveCaptionGeometry(state.project,phrase);if(geometry)input.value=Number(geometry.position[axis].toFixed(3));});
    document.querySelectorAll(`[data-phrase-${axis}]`).forEach(button=>button.addEventListener('click',()=>{
      const phrase=currentPhrase();if(!phrase)return;
      mutate(project=>{const target=captionGeometryTarget(project,phrase);target.position[axis]=positionPreset({...phrase,box:target.box},axis,button.dataset[axis==='x'?'phraseX':'phraseY']);});
    }));
  }
  function editableWords(phrase){return timedPhraseWords(phrase).map(word=>({...word}));}
  byId('splitPhrase').addEventListener('click',()=>{const phrase=currentPhrase(),words=phrase&&editableWords(phrase);if(!phrase||words.length<2)return;mutate(p=>{const i=p.phrases.indexOf(phrase),at=Math.ceil(words.length/2),left=words.slice(0,at),right=words.slice(at),boundary=right[0].start>phrase.start&&right[0].start<phrase.end?right[0].start:phrase.start+(phrase.end-phrase.start)*at/words.length,make=(words,start,end)=>({id:`p-${crypto.randomUUID()}`,start,end,text:words.map(w=>w.text).join(' '),words,position:clone(phrase.position),box:clone(phrase.box||{width:78,scale:1}),individual_geometry:!!phrase.individual_geometry,highlighted_words:[],enlarged_words:[],style_override:clone(phrase.style_override||{})});const leftPhrase=make(left,phrase.start,boundary),rightPhrase=make(right,boundary,phrase.end);for(const field of ['highlighted_words','enlarged_words']){leftPhrase[field]=(phrase[field]||[]).filter(index=>index<at);rightPhrase[field]=(phrase[field]||[]).filter(index=>index>=at).map(index=>index-at);}p.phrases.splice(i,1,leftPhrase,rightPhrase);state.selected=leftPhrase.id;state.selectedWord=null;});scheduleProofreading();});
  byId('mergePhrase').addEventListener('click',()=>{const phrase=currentPhrase();if(!phrase)return;mutate(p=>{const i=p.phrases.indexOf(phrase),next=p.phrases[i+1];if(!next)return;const offset=phraseTokens(phrase).length;phrase.words=[...editableWords(phrase),...editableWords(next)];phrase.end=next.end;phrase.text=`${phrase.text} ${next.text}`.trim();for(const field of ['highlighted_words','enlarged_words'])phrase[field]=[...new Set([...(phrase[field]||[]),...(next[field]||[]).map(index=>index+offset)])].sort((a,b)=>a-b);p.phrases.splice(i+1,1);});scheduleProofreading();});
  function deleteSelectedPhrase(focusTimeline=false){
    const phrase=currentPhrase();if(!phrase)return;
    mutate(p=>{
      const i=p.phrases.indexOf(phrase);p.phrases.splice(i,1);
      state.selected=p.phrases[Math.min(i,p.phrases.length-1)]?.id||null;state.selectedWord=null;
    });
    if(focusTimeline){
      const next=[...byId('timelineCaptionTrack').children].find(clip=>clip.dataset.phraseId===state.selected);
      (next||byId('timelineTrack').parentElement).focus({preventScroll:true});
    }
  }
  byId('deletePhrase').addEventListener('click',()=>deleteSelectedPhrase());
  byId('addPhrase').addEventListener('click',()=>{
    if(!state.project)return;
    const video=byId('editorVideo'),start=Math.max(0,video.currentTime||0);
    if(!Number.isFinite(video.duration)||video.duration<=0){status('Das Video wird noch geladen. Warte kurz und versuch es noch mal.');return;}
    if(activeAt(start)){status('An der weißen Linie liegt bereits eine Phrase. Wähle eine freie Stelle in der Zeitleiste.');return;}
    const index=state.project.phrases.findIndex(phrase=>phrase.start>=start),following=state.project.phrases[index];
    const end=Math.min(start+1,following?.start??video.duration,video.duration);
    if(end-start<.1-1e-6){status('An der weißen Linie ist zu wenig Platz. Wähle eine freie Stelle mit mindestens 0,1 Sekunden Abstand.');return;}
    mutate(p=>{
      const next={id:`p-${crypto.randomUUID()}`,start,end,text:'Neue Phrase',words:[],position:clone(p.caption_geometry?.position||{x:50,y:78}),box:clone(p.caption_geometry?.box||{width:78,scale:1}),individual_geometry:false,highlighted_words:[],enlarged_words:[],style_override:{}};
      p.phrases.splice(index<0?p.phrases.length:index,0,next);state.selected=next.id;state.selectedWord=null;activateInspector('phrase');
    });
    status('Phrase an der weißen Linie hinzugefügt.');
  });
  const video=byId('editorVideo');let playbackFrame=null;
  function syncPlayback(){byId('editorScrubber').value=video.currentTime;byId('editorCurrentTime').textContent=fmt(video.currentTime);renderPreview();updateTimelinePlayhead();}
  function followPlayback(){syncPlayback();if(!video.paused)playbackFrame=requestAnimationFrame(followPlayback);else playbackFrame=null;}
  const toggleVideoPlayback=()=>{if(video.paused)video.play().catch(error=>status(error.message));else video.pause();};
  video.addEventListener('loadedmetadata',()=>{normalizeCaptionGeometry();byId('editorScrubber').max=video.duration;byId('editorDuration').textContent=fmt(video.duration);renderTimeline();});video.addEventListener('timeupdate',syncPlayback);video.addEventListener('seeked',syncPlayback);video.addEventListener('play',()=>{byId('editorPlay').textContent='❚❚';syncPlayback();if(playbackFrame==null)playbackFrame=requestAnimationFrame(followPlayback);});video.addEventListener('pause',()=>{byId('editorPlay').textContent='▶';if(playbackFrame!=null)cancelAnimationFrame(playbackFrame);playbackFrame=null;syncPlayback();});byId('editorPlay').addEventListener('click',toggleVideoPlayback);byId('editorScrubber').addEventListener('input',event=>{video.currentTime=Number(event.target.value);syncPlayback();});byId('timelineZoom').addEventListener('input',renderTimeline);
  const editorShortcutsActive=()=>!!state.project&&document.body.dataset.activeWorkspace==='subtitles'&&!byId('subtitleWorkspace').hidden&&!byId('editorStudio').hidden;
  function isTextEntry(target){
    if(target?.isContentEditable||target?.closest?.('textarea'))return true;
    const input=target?.closest?.('input');
    return !!input&&!['button','submit','reset','checkbox','radio','range','color','file','image','hidden'].includes(input.type);
  }
  let playbackSpaceHeld=false;
  // Capture before individual controls or native button activation can consume Space.
  document.addEventListener('keydown',event=>{
    const target=event.target instanceof Element?event.target:document.activeElement;
    if(!editorShortcutsActive()||isTextEntry(target)||event.isComposing)return;
    if(event.code==='Space'||event.key===' '){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.repeat||playbackSpaceHeld)return;
      playbackSpaceHeld=true;toggleVideoPlayback();
    }else if(event.key==='Delete'&&target?.closest?.('.timelineViewport')){
      const clip=target.closest('.timelineClip');
      if(clip&&clip.dataset.phraseId!==state.selected)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat&&!timelineMoveGesture&&!timelineTrimGesture)deleteSelectedPhrase(true);
    }else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
      event.preventDefault();event.stopImmediatePropagation();
      event.shiftKey?travel(state.redo,state.undo):travel(state.undo,state.redo);
    }
  },true);
  document.addEventListener('keyup',event=>{
    if(event.code!=='Space'&&event.key!==' ')return;
    const consumed=playbackSpaceHeld;playbackSpaceHeld=false;
    if(consumed||editorShortcutsActive()&&!isTextEntry(event.target)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener('blur',()=>playbackSpaceHeld=false);
  const expandedVideo={active:false,returnFocus:null,panelAttributes:null,selectionInert:false};
  function setExpandedVideo(expanded){
    if(expanded===expandedVideo.active||expanded&&!state.project)return;
    const panel=document.querySelector('.previewPanel'),toggle=byId('expandVideo'),close=byId('closeExpandedVideo'),selection=byId('captionSelection');
    if(expanded){
      expandedVideo.returnFocus=document.activeElement;
      expandedVideo.panelAttributes=['role','aria-modal','aria-label'].map(name=>[name,panel.getAttribute(name)]);
      expandedVideo.selectionInert=selection.inert;
      closeToolPanel();
      document.body.dataset.videoExpanded='true';
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Vergrößerte Videovorschau');
      selection.inert=true;
    }else{
      delete document.body.dataset.videoExpanded;
      expandedVideo.panelAttributes.forEach(([name,value])=>value===null?panel.removeAttribute(name):panel.setAttribute(name,value));
      selection.inert=expandedVideo.selectionInert;
    }
    expandedVideo.active=expanded;
    close.hidden=!expanded;
    toggle.setAttribute('aria-pressed',String(expanded));
    toggle.setAttribute('aria-label',expanded?'Videovorschau verkleinern':'Videovorschau vergrößern');
    toggle.title=expanded?'Videovorschau verkleinern · Esc':'Videovorschau vergrößern';
    renderPreview();
    if(expanded)close.focus();
    else (expandedVideo.returnFocus?.isConnected?expandedVideo.returnFocus:toggle).focus({preventScroll:true});
  }
  byId('expandVideo')?.addEventListener('click',()=>setExpandedVideo(!expandedVideo.active));
  byId('closeExpandedVideo')?.addEventListener('click',()=>setExpandedVideo(false));
  video.addEventListener('click',()=>{if(expandedVideo.active)toggleVideoPlayback();});
  document.addEventListener('keydown',event=>{
    if(!expandedVideo.active)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setExpandedVideo(false);}
    else if(event.key==='Tab'){
      event.preventDefault();event.stopImmediatePropagation();
      const controls=[byId('closeExpandedVideo'),byId('expandVideo')],index=controls.indexOf(document.activeElement);
      controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();
    }
  });
  let captionGesture=null;const captionSelection=byId('captionSelection');
  function showCaptionGuides(guides={x:null,y:null}){for(const axis of ['x','y']){const guide=byId(axis==='x'?'captionGuideX':'captionGuideY');guide.hidden=guides[axis]==null;if(!guide.hidden)guide.style[axis==='x'?'left':'top']=`${guides[axis]}%`;}}
  captionSelection.addEventListener('pointerdown',event=>{const phrase=state.project?.phrases.find(p=>p.id===state.displayedPhrase);if(!phrase||captionGesture)return;event.preventDefault();state.selected=phrase.id;remember();const target=captionGeometryTarget(state.project,phrase),rect=byId('videoStage').getBoundingClientRect(),height=rect.height?captionSelection.getBoundingClientRect().height/rect.height*100:0;target.position=clampPosition(target.position,target.box.width,height);const handle=event.target.dataset.resizeHandle||'',word=event.target.closest('.captionWord');captionGesture={phraseId:phrase.id,wordIndex:word?Number(word.dataset.wordIndex):null,dragged:false,pointerId:event.pointerId,mode:handle?'resize':'move',direction:handle.includes('w')?-1:1,startX:event.clientX,startY:event.clientY,startWidth:target.box.width,startScale:target.box.scale,startPosition:clone(target.position),snap:null};showCaptionGuides();captionSelection.setPointerCapture(event.pointerId);});
  captionSelection.addEventListener('pointermove',event=>{if(!captionGesture||captionGesture.pointerId!==event.pointerId)return;if(!captionGesture.dragged&&Math.hypot(event.clientX-captionGesture.startX,event.clientY-captionGesture.startY)<3)return;captionGesture.dragged=true;const rect=byId('videoStage').getBoundingClientRect(),phrase=state.project?.phrases.find(p=>p.id===captionGesture.phraseId);if(!phrase||!rect.width||!rect.height)return;const target=captionGeometryTarget(state.project,phrase);let snapped=null;if(captionGesture.mode==='move'){const position={x:captionGesture.startPosition.x+(event.clientX-captionGesture.startX)/rect.width*100,y:captionGesture.startPosition.y+(event.clientY-captionGesture.startY)/rect.height*100};snapped=snapPosition(position,captionGesture.snap,1,2,target.box);target.position=snapped.position;}else{const delta=(event.clientX-captionGesture.startX)*captionGesture.direction/rect.width*100,newWidth=Math.max(20,Math.min(95,captionGesture.startWidth+delta)),ratio=newWidth/captionGesture.startWidth;target.box.width=newWidth;target.box.scale=Math.max(.35,Math.min(3,captionGesture.startScale*ratio));}state.dirty=true;renderPreview();const height=captionSelection.getBoundingClientRect().height/rect.height*100;target.position=clampPosition(target.position,target.box.width,height);if(snapped){for(const axis of ['x','y'])if(target.position[axis]!==snapped.position[axis])snapped.snap[axis]=snapped.guides[axis]=null;captionGesture.snap=snapped.snap;showCaptionGuides(snapped.guides);}renderPreview();});
  function finishCaptionGesture(event){if(!captionGesture||captionGesture.pointerId!==event.pointerId)return;const gesture=captionGesture,phrase=state.project.phrases.find(p=>p.id===gesture.phraseId);captionGesture=null;if(event.type==='pointerup'&&!gesture.dragged&&gesture.wordIndex!=null&&phrase){toggleHighlightedWord(phrase,gesture.wordIndex);state.dirty=true;}showCaptionGuides();if(captionSelection.hasPointerCapture(event.pointerId))captionSelection.releasePointerCapture(event.pointerId);render();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,600);}captionSelection.addEventListener('pointerup',finishCaptionGesture);captionSelection.addEventListener('pointercancel',finishCaptionGesture);captionSelection.addEventListener('lostpointercapture',finishCaptionGesture);
  byId('toggleSafeArea').addEventListener('click',event=>{const hidden=byId('safeArea').hidden=!byId('safeArea').hidden;event.currentTarget.setAttribute('aria-pressed',String(!hidden));});
  function loadTemplates(){try{state.templates=JSON.parse(localStorage.getItem('klartext-subtitle-templates')||'[]');}catch{state.templates=[];}}
  function renderTemplates(){byId('templateList').replaceChildren(...state.templates.map((t,index)=>{const row=document.createElement('div');row.className='templateChip';const apply=document.createElement('button');apply.type='button';apply.className='btn isQuiet';apply.textContent=t.name;apply.addEventListener('click',()=>mutate(p=>p.style=clone(t.style)));const remove=document.createElement('button');remove.type='button';remove.className='btn isQuiet isIcon';remove.textContent='×';remove.setAttribute('aria-label',`${t.name} löschen`);remove.addEventListener('click',()=>{state.templates.splice(index,1);storeTemplates();renderTemplates();});row.append(apply,remove);return row;}));}
  function storeTemplates(){localStorage.setItem('klartext-subtitle-templates',JSON.stringify(state.templates));}
  byId('saveTemplate').addEventListener('click',()=>{const name=byId('templateName').value.trim();if(!name||!state.project)return;state.templates.push({name,style:clone(state.project.style)});storeTemplates();byId('templateName').value='';renderTemplates();});
  function download(ext){if(!state.job)return;window.location.href=`/api/jobs/${state.job.id}/subtitles.${ext}`;}
  byId('exportSrt').addEventListener('click',()=>download('srt'));
  byId('exportVtt').addEventListener('click',()=>download('vtt'));
  let exportingVideo=false;
  function showExportHint(result){
    const version=result?.version||null,button=byId('exportHint').querySelector('[data-export-task]');
    byId('exportHint').querySelector('[data-export-hint]').textContent=version?`V${version.number} angelegt`:result?.reason==='ambiguous'?'Export fertig. Als Version übernehmen im Aufgabenpanel.':'Export fertig.';
    button.hidden=!version;button.dataset.taskId=version?.task_id||'';byId('exportHint').hidden=false;
    // The server resolved which task got the version; a stale task context ends here.
    setTask(version?.task_id||null);
    if(version)window.dispatchEvent(new CustomEvent('klartext:tasks-changed'));
  }
  byId('exportHint')?.querySelector('[data-export-task]')?.addEventListener('click',event=>{if(event.currentTarget.dataset.taskId)window.KlartextTasks?.open(event.currentTarget.dataset.taskId);});
  byId('exportVideo').addEventListener('click',async()=>{
    if(!state.job||!state.project||exportingVideo)return;
    exportingVideo=true;
    const jobId=state.job.id,task_id=state.task_id,project=state.project,button=byId('exportVideo'),picker=byId('editorProject');
    const filename=(state.job.filename||'klartext').replace(/\.[^.]+$/,'')+'-untertitel.mp4';
    const fps=Number(byId('exportFps').querySelector('input:checked').value);
    let preview_width;
    let fileHandle=null,destination=null,writable=null;
    button.disabled=true;picker.disabled=true;
    document.querySelector('.exportMenu').open=false;
    status('Speicherort für das Video auswählen …');
    try{
      // Request the browser picker immediately, while this click still grants user activation.
      if(typeof window.showSaveFilePicker==='function'){
        try{
          fileHandle=await window.showSaveFilePicker({suggestedName:filename,excludeAcceptAllOption:true,types:[{description:'Video mit Untertiteln (MP4)',accept:{'video/mp4':['.mp4']}}]});
        }catch(error){if(error.name!=='SecurityError'&&error.name!=='NotSupportedError')throw error;}
      }
      // The native Save As window only appears on the PC itself, so browsers on Tailscale devices download instead.
      const remoteDevice=location.hostname.endsWith('.ts.net');
      if(!fileHandle&&!remoteDevice){
        destination=await api(`/api/jobs/${jobId}/export-video/destination`,{method:'POST'});
        if(destination.cancelled){status('Export abgebrochen.');return;}
      }
      clearTimeout(state.saveTimer);
      preview_width=await prepareCaptionExportFits();
      if(state.project!==project||state.job?.id!==jobId||!await save()||state.project!==project||state.job?.id!==jobId)throw new Error('Die aktuellen Untertitel konnten nicht gespeichert werden. Exportier noch mal.');
      status('Video mit Untertiteln wird lokal gerendert …');
      const render=body=>api(`/api/jobs/${jobId}/export-video`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fps,preview_width,task_id,...body})});
      if(fileHandle){
        // The server answers with the version first; the finished file then arrives by link.
        const result=await render({link:true});
        const file=await api(result.download);
        writable=await fileHandle.createWritable();
        await writable.write(await file.blob());
        await writable.close();writable=null;
        status(`Video mit Untertiteln gespeichert: ${fileHandle.name}`);
        showExportHint(result);
      }else if(!destination){
        const result=await render({link:true});
        location.href=result.download;
        status(`Video mit Untertiteln fertig, Download startet: ${filename}`);
        showExportHint(result);
      }else{
        const result=await render({destination_token:destination.destination_token});
        status(`Video mit Untertiteln gespeichert: ${result.path}`);
        showExportHint(result);
      }
    }catch(error){
      if(writable)try{await writable.abort();}catch{}
      status(error.name==='AbortError'?'Export abgebrochen.':`Export fehlgeschlagen: ${error.message}`);
    }finally{
      exportingVideo=false;button.disabled=false;picker.disabled=false;
      if(state.dirty){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,900);}
    }
  });
  document.addEventListener('keydown',event=>{if(!editorShortcutsActive()||document.activeElement.isContentEditable||document.activeElement.closest('button,[role="button"],.timelineViewport'))return;if(event.key==='ArrowLeft'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){video.currentTime=Math.max(0,video.currentTime-.1);}else if(event.key==='ArrowRight'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){video.currentTime=Math.min(video.duration||0,video.currentTime+.1);}});
  window.KlartextEditor={openProject,prepareForUpload,setWorkspace,isExporting:()=>exportingVideo,setTask,taskId:()=>state.task_id};
  window.addEventListener('resize',()=>{normalizeCaptionGeometry();renderTimeline();});window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});loadTemplates();loadFonts();setWorkspace('transcribe');
})();
