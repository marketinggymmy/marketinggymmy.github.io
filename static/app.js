'use strict';
const $ = id => document.getElementById(id);
const terminal = new Set(['done', 'error', 'cancelled']);
let chosenFile = null, currentJob = null, currentTaskId = null, busy = false, timer = null, uploading = false, loadVersion = 0;
let subtitleUploadActive = false, subtitleUploadJob = null, subtitleUploadTimer = null;
let speakers = [], brands = [], mode = 'edit', media = null, mediaJob = null, activeWord = null, timedNodes = [], waveformPeaks = null;
const sessions = new Map(), generationJobs = new Set();
const hints = {tiny:'Am schnellsten, mit geringerer Genauigkeit. Einmaliger Download: ca. 80 MB.',base:'Für klare, einfache Videos. Einmaliger Download: ca. 150 MB.',small:'Gute Genauigkeit für die meisten Videos. Einmaliger Download: ca. 500 MB.',medium:'Für anspruchsvolle Videos. Benötigt mehr Zeit und Arbeitsspeicher. Download: ca. 1,5 GB.'};
const phases = {uploading:'Datei wird übertragen',loading:'Sprachmodell wird geladen',decoding:'Tonspur wird vorbereitet',transcribing:'Transkription läuft',done:'Transkript fertig',error:'Verarbeitung fehlgeschlagen',cancelled:'Verarbeitung abgebrochen',queued:'Wartet'};
function stored(key) { try {return localStorage.getItem(key);} catch {return null;} }
function store(key, value) { try {if(value === null) localStorage.removeItem(key); else localStorage.setItem(key,value);} catch {toast('Browser-Entwurf konnte nicht gespeichert werden. Speichere den Text, damit nichts verloren geht.','error');} }
function session(id) {
  if (!sessions.has(id)) {
    let captions = null; try {captions = JSON.parse(stored(`klartext-captions-${id}`));} catch {}
    const draft = stored(`klartext-edit-${id}`);
    sessions.set(id,{draft,revision:0,savedRevision: draft === null ? 0 : -1,savePromise:null,captions,captionRevision:0,captionDirty:!!captions,captionLoaded:!!captions});
  }
  return sessions.get(id);
}
function toast(message,tone) {window.KlartextToast?.show(message,{tone});}
async function api(path, options={}) {
  const response=await KlartextRequest.send(path,{...options,headers:{'X-Klartext':'1',...options.headers}});
  let data; try {data=await response.json();} catch {throw new Error(KlartextRequest.failed(options.method,'',response.status));}
  if(!response.ok) throw new Error(typeof data.detail==='string'?data.detail:KlartextRequest.failed(options.method,'',response.status));
  return data;
}
const json = (method, body) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
// busy = the page's own transfer; a job running or waiting on the server no longer locks the form.
const running=()=>!!currentJob&&!terminal.has(currentJob.state);
function setBusy(value) {
  busy=value||subtitleUploadActive;
  for(const id of ['file','language','model','speaker']) $(id).disabled=busy;
  $('dropzone').classList.toggle('disabled',busy); $('start').disabled=busy||!chosenFile;
  $('cancel').hidden=busy||!running(); $('transcript').readOnly=busy||running();
  $('startLabel').textContent=busy?'Wird verarbeitet …':'Transkribieren';
  $('saveTranscript').disabled=busy||running(); $('readMode').disabled=busy||running();
  if($('addSubtitleVideo'))$('addSubtitleVideo').disabled=busy;
  if($('subtitleVideoFile'))$('subtitleVideoFile').disabled=busy;
  updateGenerate();
}
function counts() {const text=$('transcript').value.trim(), n=text?text.split(/\s+/u).length:0; $('wordCount').textContent=`${n.toLocaleString('de-DE')} ${n===1?'Wort':'Wörter'}`; $('copy').disabled=!text; $('download').disabled=!text; updateGenerate();}
function choose(file) {
  if(!file||busy)return;
  if(!/\.(mp3|mp4|wav|m4a|flac|ogg|webm|mov)$/i.test(file.name)){toast('Dieses Dateiformat geht nicht. Wähl eine unterstützte Audio- oder Videodatei.','error');return;}
  if(!file.size){toast('Diese Datei ist leer. Wähl ein anderes Video.','error');return;}
  chosenFile=file; $('fileNote').textContent='Datei bereit. Du kannst starten.'; $('fileTitle').textContent=file.name;
  $('fileInfo').textContent=`${(file.size/1024/1024).toLocaleString('de-DE',{maximumFractionDigits:1})} MB · Klicken zum Ändern`; $('start').disabled=false;
  $('start').hidden=false;$('nextSubtitles').hidden=true;
}
// openProject drops the task when the editor held another video; the switch carries the transcript tab's task over.
$('nextSubtitles').addEventListener('click',async()=>{const editor=window.KlartextEditor;if(!currentJob||!editor)return;const taskId=currentTaskId,task=shownTask;editor.setWorkspace('subtitles');if(await editor.openProject(currentJob.id)){editor.setTask(taskId);editorTask=task;renderTaskButton();}});
// The topbar link to the task of the shown video: the transcript video's task, in the subtitle tab the editor video's task.
const topbarTask=document.querySelector('[data-topbar-task]'),studioTabs=['transcribe','subtitles','social'];let shownTask=null,editorTask=null;
function topbarTaskFor(){const name=document.body.dataset.activeWorkspace;return !studioTabs.includes(name)?null:name==='subtitles'?editorTask:shownTask;}
function renderTaskButton(){if(!topbarTask)return;const task=topbarTaskFor();topbarTask.hidden=!task;topbarTask.textContent=task?`Zur Aufgabe #${task.number}`:'Zur Aufgabe';}
async function applyTask(jobId,taskId){
  const known=window.KlartextLibrary?.taskFor?.(jobId)||null;
  let task=taskId?(known?.id===taskId?known:null):known;
  if(taskId&&!task){try{task=(await api('/api/workspace')).tasks.find(t=>t.id===taskId)||null;}catch{task=null;}if(currentJob?.id!==jobId)return;}
  currentTaskId=taskId||known?.id||null;syncEditorTask(jobId,currentTaskId,task);
  shownTask=task;renderTaskButton();
}
// The editor's task belongs to the video it holds; a different video in the transcript tab leaves it alone.
function syncEditorTask(jobId,taskId,task){const held=$('editorProject').value;if(!held||held===jobId){window.KlartextEditor?.setTask?.(taskId);editorTask=task;}}
topbarTask?.addEventListener('click',()=>{const task=topbarTaskFor();if(task)window.KlartextTasks?.open(task.id);});
window.addEventListener('klartext:workspace-change',renderTaskButton);
// Picking another video in the subtitle tab takes the library's task of that video; editor.js sets its own task the same way.
$('editorProject').addEventListener('change',()=>{editorTask=window.KlartextLibrary?.taskFor?.($('editorProject').value)||null;renderTaskButton();});
$('file').addEventListener('change',e=>choose(e.target.files[0]));
for(const name of ['dragenter','dragover']) $('dropzone').addEventListener(name,e=>{e.preventDefault();if(!busy)$('dropzone').classList.add('isDragging');});
for(const name of ['dragleave','drop']) $('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('isDragging');});
$('dropzone').addEventListener('drop',e=>choose(e.dataTransfer.files[0]));
window.addEventListener('dragover',e=>e.preventDefault()); window.addEventListener('drop',e=>e.preventDefault());
$('model').addEventListener('change',()=>$('modelHint').textContent=hints[$('model').value]);
$('transcript').addEventListener('input',()=>{
  if(currentJob){const s=session(currentJob.id); s.draft=$('transcript').value; s.revision++; store(`klartext-edit-${currentJob.id}`,s.draft);$('saveStatus').textContent='Entwurf im Browser · noch nicht gespeichert';}
  counts();
});
async function saveTranscript(id=currentJob?.id) {
  if(!id)return; const s=session(id);
  if(s.savePromise){await s.savePromise; if(s.revision!==s.savedRevision)return saveTranscript(id); return;}
  if(s.draft===null)return;
  const revision=s.revision, text=s.draft, speaker_id=s.speaker ?? '';
  if(currentJob?.id===id)$('saveStatus').textContent='Wird gespeichert …';
  s.savePromise=api(`/api/jobs/${id}/edit`,json('PUT',{text,speaker_id})).then(job=>{
    s.savedRevision=revision;
    if(s.revision===revision){s.draft=job.text ?? text;store(`klartext-edit-${id}`,null);}
    if(currentJob?.id===id){
      currentJob={...currentJob,...job};
      $('saveStatus').textContent=s.revision===revision?`Gespeichert${job.learned_count ? ` · ${job.learned_count} Korrekturen gelernt` : ''}`:'Neuerer Entwurf noch nicht gespeichert';
      if(s.revision===revision){$('transcript').value=s.draft;renderReader();}
    }
    if(job.learned_count)loadSpeakers();
  }).catch(error=>{if(currentJob?.id===id)$('saveStatus').textContent=`Nicht gespeichert: ${error.message}`;throw error;}).finally(()=>s.savePromise=null);
  return s.savePromise;
}
$('saveTranscript').addEventListener('click',()=>saveTranscript().catch(()=>{}));
function setMode(next) {
  mode=next; $('readMode').setAttribute('aria-pressed',String(next==='read')); $('editMode').setAttribute('aria-pressed',String(next==='edit'));
  $('reader').hidden=next!=='read'; $('transcript').hidden=next!=='edit'||!$('empty').hidden;
  if(next==='read')renderReader();
}
$('editMode').addEventListener('click',()=>setMode('edit'));
$('readMode').addEventListener('click',async()=>{const id=currentJob?.id;try{await saveTranscript(id);if(currentJob?.id===id)setMode('read');}catch{toast('Text nicht gespeichert. Speichere ihn, bevor du zum Mitlesen wechselst.','error');}});
function renderReader() {
  $('reader').replaceChildren(); timedNodes=[]; activeWord=null;
  const text=$('transcript').value, words=currentJob?.words||[];
  let cursor=0;
  for(const word of words){
    const token=String(word.text||'').trim();if(!token)continue;
    const index=text.indexOf(token,cursor);if(index<0)continue;
    $('reader').append(document.createTextNode(text.slice(cursor,index)));
    const valid=typeof word.start==='number'&&typeof word.end==='number'&&Number.isFinite(word.start)&&Number.isFinite(word.end)&&word.start>=0&&word.end>word.start;
    const node=document.createElement(valid&&media?'button':'span'); node.textContent=token;
    if(valid&&media){node.type='button';node.className='word';node.title=`Ab ${word.start.toFixed(1)} Sekunden abspielen`;node.addEventListener('click',()=>{media.currentTime=word.start;media.play().catch(()=>{});});timedNodes.push({node,start:word.start,end:word.end});}
    $('reader').append(node);cursor=index+token.length;
  }
  $('reader').append(document.createTextNode(text.slice(cursor))); syncPlayback();
}
function syncPlayback() {
  const time=media?.currentTime||0, word=timedNodes.find(item=>time>=item.start&&time<item.end);
  if(word?.node!==activeWord){activeWord?.classList.remove('active');activeWord=word?.node||null;activeWord?.classList.add('active');if(activeWord&&mode==='read'&&!media.paused){const box=activeWord.getBoundingClientRect(),container=$('reader').getBoundingClientRect();if(box.top<container.top||box.bottom>container.bottom)$('reader').scrollTop+=box.top-container.top-70;}}
  drawWaveform();
}
let waveformColors=null;
function drawWaveform() {
  if(!waveformPeaks||!media)return;
  // Played part in the accent, the rest in --text-dim; read once from tokens.css.
  waveformColors||=['--accent','--text-dim'].map(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  const canvas=$('waveform'), w=canvas.clientWidth||600,h=90,dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(w*dpr)){canvas.width=Math.round(w*dpr);canvas.height=h*dpr;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const progress=Number.isFinite(media.duration)?media.currentTime/media.duration:0;
  waveformPeaks.forEach((peak,i)=>{ctx.fillStyle=waveformColors[i/waveformPeaks.length<=progress?0:1];const bar=Math.max(2,peak*76);ctx.fillRect(i*w/waveformPeaks.length,(h-bar)/2,Math.max(1,w/waveformPeaks.length-1),bar);});
}
async function loadWaveform(url,id) {
  let context;
  try {
    const response=await fetch(url);if(!response.ok)throw new Error(); const data=await response.arrayBuffer();
    if(mediaJob!==id)return;
    context=new (window.AudioContext||window.webkitAudioContext)(); const buffer=await context.decodeAudioData(data);
    if(mediaJob!==id)return;
    const channel=buffer.getChannelData(0), count=320, step=Math.max(1,Math.floor(channel.length/count)); const peaks=[];
    for(let i=0;i<count;i++){let max=0;for(let j=i*step;j<Math.min((i+1)*step,channel.length);j++)max=Math.max(max,Math.abs(channel[j]));peaks.push(max);}
    const max=Math.max(...peaks,0.01);waveformPeaks=peaks.map(p=>p/max);$('waveform').hidden=false;drawWaveform();
  }catch{if(mediaJob===id)$('mediaHint').textContent='Wellenform nicht verfügbar. Das Video kannst du mit dem Player abspielen.';}
  finally {if(context)context.close().catch(()=>{});}
}
function resetMedia() {media?.pause();if(media){media.removeAttribute('src');media.load();} media=null;mediaJob=null;waveformPeaks=null;$('mediaHost').replaceChildren();$('waveform').hidden=true;}
function showMedia(job) {
  if(mediaJob===job.id)return; resetMedia();mediaJob=job.id;
  $('mediaPanel').hidden=!job.media_url; $('mediaMissing').hidden=!!job.media_url||!terminal.has(job.state);
  if(!job.media_url)return;
  media=document.createElement(job.media_type==='video'?'video':'audio');media.controls=true;media.preload='metadata';media.src=job.media_url;media.setAttribute('aria-label',job.filename);if(job.media_type==='video')media.playsInline=true;
  media.addEventListener('timeupdate',syncPlayback);media.addEventListener('seeked',syncPlayback);media.addEventListener('error',()=>$('mediaHint').textContent='Das Video konnte nicht geladen werden. Prüf die Datei und die Verbindung.');
  media.playbackRate=Number($('playbackRate').value);$('mediaHost').append(media);$('mediaHint').textContent='Klicke im Lesemodus auf ein Wort, um dorthin zu springen.';
  if(job.media_type!=='video')loadWaveform(job.media_url,job.id);
}
$('playbackRate').addEventListener('change',()=>{if(media)media.playbackRate=Number($('playbackRate').value);});
$('waveform').addEventListener('click',e=>{if(media&&Number.isFinite(media.duration)){const rect=e.currentTarget.getBoundingClientRect();media.currentTime=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*media.duration;}});
window.addEventListener('resize',drawWaveform);
function showJob(job) {
  const changed=currentJob?.id!==job.id;currentJob=job;const s=session(job.id);if(s.speaker===undefined)s.speaker=job.speaker_id||'';
  $('status').hidden=false;$('result').hidden=false;store('klartext-job',job.id);
  document.querySelectorAll('.historyItem').forEach(button=>button.setAttribute('aria-current',String(button.dataset.jobId===job.id)));
  window.KlartextLibrary?.setActiveJob(job.id);
  setBusy(false);$('status').classList.toggle('error',job.state==='error');$('phase').textContent=phases[job.state]||job.state;
  // One filled button per view: after Fertig the next step replaces Transkribieren.
  $('nextSubtitles').hidden=job.state!=='done';$('start').hidden=job.state==='done';
  $('message').textContent=job.state==='queued'&&job.queue_position?`Wartet (Position ${job.queue_position})`:job.message||'';
  $('percent').textContent=['transcribing','done'].includes(job.state)?`${job.progress} %`:'';$('progress').hidden=terminal.has(job.state)||job.state==='queued';if(job.state==='transcribing')$('progress').value=job.progress;else $('progress').removeAttribute('value');
  $('transcript').value=s.draft!==null?s.draft:(job.text||'');$('empty').hidden=!!$('transcript').value||job.state==='done';
  $('resultMeta').textContent=job.filename+(job.detected_language?` · ${job.detected_language.toUpperCase()}`:'');
  if(changed){$('speaker').value=s.speaker;renderCorrections();$('saveStatus').textContent=s.draft!==null&&s.savedRevision!==s.revision?'Entwurf wiederhergestellt · noch nicht gespeichert':'';currentTaskId=null;shownTask=null;renderTaskButton();syncEditorTask(job.id,null,null);}
  showMedia(job);setMode(mode);counts();$('captionPanel').hidden=document.body.dataset.activeWorkspace!=='social';
  if(changed){renderCaptions();loadCaptions(job.id);}
}
async function poll(version) {
  if(version!==loadVersion||!currentJob)return;
  try{const job=await api(`/api/jobs/${currentJob.id}`);if(version!==loadVersion)return;showJob(job);if(terminal.has(job.state)){await refreshLibrary();return;}}
  catch{if(version!==loadVersion)return;$('message').textContent='Verbindung unterbrochen. Verbindung wird wiederhergestellt …';}
  timer=setTimeout(()=>poll(version),1500);
}
$('form').addEventListener('submit',async event=>{
  event.preventDefault();if(!chosenFile||busy)return;
  const old=currentJob?.id;if(old&&session(old).draft!==null)saveTranscript(old).catch(()=>{});
  clearTimeout(timer);const version=++loadVersion;uploading=true;currentJob=null;resetMedia();setBusy(true);
  $('status').hidden=false;$('result').hidden=false;$('captionPanel').hidden=true;$('mediaPanel').hidden=true;$('mediaMissing').hidden=true;
  $('phase').textContent='Datei wird übertragen';$('message').textContent='Das Video wird lokal zur Verarbeitung vorbereitet …';$('status').classList.remove('error');$('progress').hidden=false;$('progress').removeAttribute('value');$('percent').textContent='';$('transcript').value='';$('reader').replaceChildren();$('empty').hidden=false;$('transcript').hidden=true;counts();
  const data=new FormData();data.append('file',chosenFile);data.append('model',$('model').value);data.append('language',$('language').value);data.append('speaker_id',$('speaker').value);
  // The sent file is used up: Transkribieren stays locked until a new file is chosen.
  try{const job=await api('/api/jobs',{method:'POST',body:data});uploading=false;if(version!==loadVersion)return;clearFile();showJob(job);poll(version);refreshLibrary();}
  catch(error){uploading=false;setBusy(false);$('status').classList.add('error');$('phase').textContent='Start nicht möglich';$('message').textContent=error.message;$('progress').hidden=true;}
});
function subtitleUploadStatus(message,job=null) {
  if($('subtitleUploadStatus'))$('subtitleUploadStatus').textContent=message;
  const progress=$('subtitleUploadProgress');if(!progress)return;
  progress.hidden=!subtitleUploadActive||!!job&&terminal.has(job.state);
  if(job?.state==='transcribing')progress.value=job.progress;
  else progress.removeAttribute('value');
}
function releaseSubtitleUpload() {
  clearTimeout(subtitleUploadTimer);subtitleUploadTimer=null;subtitleUploadActive=false;subtitleUploadJob=null;uploading=false;
  setBusy(false);
  if($('subtitleUploadProgress'))$('subtitleUploadProgress').hidden=true;
}
async function updateSubtitleUpload(job,version) {
  if(version!==loadVersion||!subtitleUploadActive)return;
  subtitleUploadJob=job;uploading=false;
  const progress=job.state==='transcribing'?` · ${job.progress} %`:'';
  subtitleUploadStatus(`${phases[job.state]||job.state}${progress}${job.message?` · ${job.message}`:''}`,job);
  if(!terminal.has(job.state))return false;
  await refreshLibrary();
  if(version!==loadVersion||!subtitleUploadActive)return true;
  if(job.state==='done'){
    const opened=await window.KlartextEditor?.openProject(job.id);
    if(version!==loadVersion||!subtitleUploadActive)return true;
    if(opened){
      subtitleUploadActive=false;showJob(job);window.KlartextLibrary?.selectFolder(null);await refreshLibrary();
      subtitleUploadStatus('Video hinzugefügt. Die Untertitel sind bereit.',job);
    }else subtitleUploadStatus('Das Video ist fertig. Deine bestehenden Änderungen bleiben geöffnet. Wähle das neue Video in der Bibliothek, sobald sie gespeichert sind.',job);
  }else subtitleUploadStatus(`${job.state==='cancelled'?'Verarbeitung abgebrochen':'Verarbeitung fehlgeschlagen'}${job.message?`: ${job.message}`:''}. Dein bisheriges Video bleibt geöffnet.`,job);
  releaseSubtitleUpload();return true;
}
async function pollSubtitleUpload(version) {
  if(version!==loadVersion||!subtitleUploadActive||!subtitleUploadJob)return;
  try{
    const job=await api(`/api/jobs/${subtitleUploadJob.id}`);
    if(await updateSubtitleUpload(job,version))return;
  }catch{
    if(version!==loadVersion||!subtitleUploadActive)return;
    subtitleUploadStatus('Verbindung unterbrochen. Die Verarbeitung wird weiter geprüft …',subtitleUploadJob);
  }
  if(version===loadVersion&&subtitleUploadActive)subtitleUploadTimer=setTimeout(()=>pollSubtitleUpload(version),1500);
}
async function addSubtitleVideo(file) {
  if(!file)return;
  if(busy||subtitleUploadActive){subtitleUploadStatus('Warte, bis die aktuelle Verarbeitung abgeschlossen ist.');return;}
  if(!/\.(mp4|mov|webm)$/i.test(file.name)){subtitleUploadStatus('Dieses Format geht nicht. Wähl ein Video als MP4, MOV oder WebM.');return;}
  if(!file.size){subtitleUploadStatus('Diese Datei ist leer. Wähl ein anderes Video.');return;}
  if(window.KlartextEditor?.isExporting?.()){subtitleUploadStatus('Der Video-Export läuft noch. Warte, bis er fertig ist.');return;}
  const settings={model:$('model').value,language:$('language').value,speaker_id:$('speaker').value};
  subtitleUploadActive=true;setBusy(true);subtitleUploadStatus('Bestehende Änderungen werden gespeichert …');
  try{
    if(!await window.KlartextEditor?.prepareForUpload?.())throw new Error('Die bestehenden Änderungen konnten nicht gespeichert werden. Speichere sie und füg das Video noch mal hinzu.');
    const old=currentJob?.id;if(old&&session(old).draft!==null&&session(old).revision!==session(old).savedRevision)await saveTranscript(old);
    clearTimeout(timer);const version=++loadVersion;uploading=true;
    subtitleUploadStatus('Datei wird übertragen. Das Video wird lokal vorbereitet …');
    const data=new FormData();data.append('file',file);for(const [name,value] of Object.entries(settings))data.append(name,value);
    const job=await api('/api/jobs',{method:'POST',body:data});
    if(version!==loadVersion)return;
    if(!await updateSubtitleUpload(job,version)){await refreshLibrary();pollSubtitleUpload(version);}
  }catch(error){subtitleUploadStatus(`Video konnte nicht hinzugefügt werden: ${error.message}`);releaseSubtitleUpload();}
}
$('addSubtitleVideo')?.addEventListener('click',()=>{
  if(busy||subtitleUploadActive){subtitleUploadStatus('Warte, bis die aktuelle Verarbeitung abgeschlossen ist.');return;}
  if(window.KlartextEditor?.isExporting?.()){subtitleUploadStatus('Der Video-Export läuft noch. Warte, bis er fertig ist.');return;}
  $('subtitleVideoFile').click();
});
$('subtitleVideoFile')?.addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';addSubtitleVideo(file);});
$('cancel').addEventListener('click',async()=>{if(!currentJob)return;$('cancel').disabled=true;try{const job=await api(`/api/jobs/${currentJob.id}/cancel`,{method:'POST'});clearTimeout(timer);loadVersion++;showJob(job);refreshLibrary();}catch(error){toast(error.message,'error');}finally{$('cancel').disabled=false;}});
async function copyText(text,field){try{await navigator.clipboard.writeText(text);toast('Text kopiert.');}catch{if(field){field.hidden=false;field.focus();field.select();}toast('Mit Strg+C kopieren.');}}
$('copy').addEventListener('click',()=>copyText($('transcript').value,$('transcript')));
$('download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['\uFEFF',$('transcript').value],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=(currentJob?.filename||'Transkript').replace(/\.[^.]+$/,'')+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);});
async function loadJob(id) {
  const old=currentJob?.id;if(old&&old!==id&&session(old).draft!==null)saveTranscript(old).catch(()=>{});
  clearTimeout(timer);const version=++loadVersion;
  try{const job=await api(`/api/jobs/${id}`);if(version!==loadVersion||window.KlartextEditor?.isExporting?.())return false;showJob(job);if(!terminal.has(job.state))poll(version);return true;}catch(error){if(version===loadVersion)toast(error.message,'error');return false;}
}
window.openKlartextJob=async(id,options={})=>{
  if(window.KlartextEditor?.isExporting?.()){toast('Der Video-Export läuft noch. Warte, bis er fertig ist.');return;}
  if(subtitleUploadActive||uploading){toast('Warte, bis die aktuelle Übertragung abgeschlossen ist.');return;}
  if(document.body.dataset.activeWorkspace==='subtitles'&&window.KlartextEditor){
    if(!await window.KlartextEditor.openProject(id))return;
  }
  const loaded=await loadJob(id);
  // A task's brand picks the voice for "Text erstellen"; captions saved earlier for this video keep their own brand.
  if(loaded&&brands.some(brand=>brand.id===options.brand_id))setChoice('brandChoices','brandSelect',options.brand_id);
  if(loaded&&!['transcribe','subtitles','social'].includes(document.body.dataset.activeWorkspace))window.KlartextEditor?.setWorkspace('transcribe');
  if(loaded)await applyTask(id,options.task_id??null);
};
async function refreshLibrary(){await window.KlartextLibrary?.refresh(currentJob?.id);}
function option(value,label){const node=document.createElement('option');node.value=value;node.textContent=label;return node;}
async function loadSpeakers(){try{const selected=currentJob?session(currentJob.id).speaker:$('speaker').value;speakers=await api('/api/speakers');$('speaker').replaceChildren(option('','Ohne Sprecherprofil'),...speakers.map(s=>option(s.id,s.name)));$('speaker').value=selected||'';renderCorrections();}catch(error){$('correctionStatus').textContent=error.message;}}
function correctionRow(c={source:'',target:''}){const row=document.createElement('div');row.className='correctionRow';row.dataset.id=c.id||'';const source=document.createElement('input'),target=document.createElement('input'),remove=document.createElement('button');source.value=c.source;source.placeholder='Erkannter Text';source.setAttribute('aria-label','Erkannter Text');target.value=c.target;target.placeholder='Korrektur';target.setAttribute('aria-label','Korrigierter Text');remove.type='button';remove.className='btn';remove.textContent='Entfernen';remove.addEventListener('click',()=>{row.remove();$('correctionStatus').textContent='Änderungen noch nicht gespeichert.';});for(const input of [source,target])input.addEventListener('input',()=>$('correctionStatus').textContent='Änderungen noch nicht gespeichert.');row.append(source,target,remove);$('correctionRows').append(row);}
function renderCorrections(){const speaker=speakers.find(s=>s.id===$('speaker').value);$('correctionRows').replaceChildren();for(const c of speaker?.corrections||[])correctionRow(c);$('addCorrection').disabled=!speaker;$('saveCorrections').disabled=!speaker;$('correctionStatus').textContent=speaker?(speaker.corrections.length?'':'Noch keine Korrekturen gespeichert.'):'Wähle ein Sprecherprofil aus oder lege ein neues an.';}
$('speaker').addEventListener('change',()=>{if(currentJob){const s=session(currentJob.id);s.speaker=$('speaker').value;s.draft=$('transcript').value;s.revision++;store(`klartext-edit-${currentJob.id}`,s.draft);$('saveStatus').textContent='Sprecher geändert · speichere den Text';}renderCorrections();});
$('addSpeaker').addEventListener('click',async()=>{const name=$('speakerName').value.trim();if(!name){$('speakerName').focus();return;}$('addSpeaker').disabled=true;try{const speaker=await api('/api/speakers',json('POST',{name}));await loadSpeakers();$('speaker').value=speaker.id;$('speaker').dispatchEvent(new Event('change'));$('speakerName').value='';}catch(error){$('correctionStatus').textContent=error.message;}finally{$('addSpeaker').disabled=false;}});
$('addCorrection').addEventListener('click',()=>{correctionRow();$('correctionStatus').textContent='Änderungen noch nicht gespeichert.';});
$('saveCorrections').addEventListener('click',async()=>{const id=$('speaker').value;if(!id)return;const corrections=[...$('correctionRows').children].map(row=>({id:row.dataset.id,source:row.children[0].value.trim(),target:row.children[1].value.trim()}));if(corrections.some(c=>!c.source||!c.target)){$('correctionStatus').textContent='Eine Korrektur ist unvollständig. Füll bei jeder Korrektur beide Textfelder aus.';return;}$('saveCorrections').disabled=true;try{const speaker=await api(`/api/speakers/${id}/corrections`,json('PUT',{corrections}));speakers=speakers.map(s=>s.id===id?speaker:s);if($('speaker').value===id){renderCorrections();$('correctionStatus').textContent='Korrekturen gespeichert.';}}catch(error){$('correctionStatus').textContent=error.message;}finally{$('saveCorrections').disabled=!$('speaker').value;}});
function setChoice(groupId,inputId,value){
  $(inputId).value=value;
  for(const button of $(groupId).querySelectorAll('button')){
    const active=button.dataset.value===value;
    button.setAttribute('aria-pressed',String(active));
  }
  updateGenerate();
}
function bindChoiceGroup(groupId,inputId){
  $(groupId).addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button&&!button.disabled)setChoice(groupId,inputId,button.dataset.value);
  });
}
bindChoiceGroup('brandChoices','brandSelect');
bindChoiceGroup('formatChoices','captionFormat');
bindChoiceGroup('lengthChoices','captionLength');
async function loadBrands(){
  try{
    const selected=$('brandSelect').value;
    brands=await api('/api/brands');
    $('brandChoices').replaceChildren(...brands.map(brand=>{
      const button=document.createElement('button');
      button.type='button';button.className='btn';button.dataset.value=brand.id;button.textContent=brand.name;button.setAttribute('aria-pressed','false');
      return button;
    }));
    const next=brands.some(brand=>brand.id===selected)?selected:(brands.some(brand=>brand.id==='gymstar')?'gymstar':brands[0]?.id||'');
    setChoice('brandChoices','brandSelect',next);
  }catch(error){$('captionStatus').textContent=error.message;}
}
// The Projekte page creates brands too; it refreshes this list without a page reload.
window.KlartextText=Object.freeze({refreshBrands:loadBrands});
$('addBrand').addEventListener('click',async()=>{const name=$('brandName').value.trim(),rules=$('brandRules').value.trim();if(!name){$('brandName').focus();return;}$('addBrand').disabled=true;try{const brand=await api('/api/brands',json('POST',{name,rules}));await loadBrands();setChoice('brandChoices','brandSelect',brand.id);$('brandName').value='';$('brandRules').value='';toast('Firma gespeichert.');}catch(error){toast(error.message,'error');}finally{$('addBrand').disabled=false;}});
function updateGenerate(){$('generate').disabled=!currentJob||busy||running()||!$('transcript').value.trim()||!$('brandSelect').value||generationJobs.has(currentJob?.id);$('generate').textContent=generationJobs.has(currentJob?.id)?'Redaktion läuft lokal …':'3 Varianten generieren';}
async function loadCaptions(id){const s=session(id);if(s.captionLoaded)return;const revision=s.captionRevision;try{const data=await api(`/api/jobs/${id}/captions`);if(s.captionRevision===revision&&!s.captionDirty){s.captions=data;s.captionLoaded=true;if(currentJob?.id===id)renderCaptions();}}catch(error){if(currentJob?.id===id)$('captionStatus').textContent=error.message;}}
function draftCaptions(id){const s=session(id);s.captionRevision++;s.captionDirty=true;store(`klartext-captions-${id}`,JSON.stringify(s.captions));if(currentJob?.id===id)$('captionStatus').textContent='Entwurf im Browser · Varianten noch nicht gespeichert';}
function renderCaptions(){
  $('variants').replaceChildren();const s=currentJob?session(currentJob.id):null,payload=s?.captions;$('saveCaptions').hidden=!payload?.variants?.length;
  $('captionStatus').textContent=generationJobs.has(currentJob?.id)?'Das Transkript wird analysiert, geschrieben und redaktionell geprüft. Das kann einige Minuten dauern.':s?.captionDirty?'Entwurf wiederhergestellt · Varianten noch nicht gespeichert':'';
  if(payload){if(brands.some(b=>b.id===payload.brand_id))setChoice('brandChoices','brandSelect',payload.brand_id);setChoice('formatChoices','captionFormat',payload.format||'reel');setChoice('lengthChoices','captionLength',payload.length==='long'?'long':'short');}
  for(const [index,variant] of (payload?.variants||[]).entries()){
    const article=document.createElement('article');article.className='variant';const head=document.createElement('div');head.className='variantHead';const label=document.createElement('label'),copy=document.createElement('button'),field=document.createElement('textarea');const id=currentJob.id;label.textContent=`Variante ${index+1}`;label.htmlFor=`variant-${index}`;field.id=`variant-${index}`;field.value=variant.text;field.spellcheck=true;copy.type='button';copy.className='btn';copy.textContent='Kopieren';copy.addEventListener('click',async()=>{if(session(id).captionDirty){try{await saveCaptions(id);}catch{return;}}await copyText(field.value,field);});field.addEventListener('input',()=>{variant.text=field.value;draftCaptions(id);});field.addEventListener('blur',()=>{if(session(id).captionDirty)saveCaptions(id).catch(()=>{});});head.append(label,copy);article.append(head,field);$('variants').append(article);
  }
  updateGenerate();
}
async function saveCaptions(id=currentJob?.id){if(!id)return;const s=session(id);if(!s.captions)return;const revision=s.captionRevision,payload=JSON.parse(JSON.stringify(s.captions));try{const saved=await api(`/api/jobs/${id}/captions`,json('PUT',payload));if(s.captionRevision===revision){s.captions=saved;s.captionDirty=false;store(`klartext-captions-${id}`,null);}if(currentJob?.id===id){const learned=saved.learned_count||0;$('captionStatus').textContent=s.captionDirty?'Neuerer Entwurf noch nicht gespeichert.':learned?`${learned} Korrektur${learned===1?'':'en'} für diese Firma gelernt.`:'Varianten gespeichert.';}}catch(error){if(currentJob?.id===id)$('captionStatus').textContent=`Nicht gespeichert: ${error.message}`;throw error;}}
$('saveCaptions').addEventListener('click',()=>saveCaptions().catch(()=>{}));
$('generate').addEventListener('click',async()=>{
  if(!currentJob||generationJobs.has(currentJob.id))return;
  const id=currentJob.id,s=session(id),revision=s.captionRevision;
  const payload={text:$('transcript').value,brand_id:$('brandSelect').value,format:$('captionFormat').value,length:$('captionLength').value};
  generationJobs.add(id);updateGenerate();$('captionStatus').textContent='Das Transkript wird analysiert, geschrieben und redaktionell geprüft. Das kann einige Minuten dauern. Bestehende Varianten bleiben erhalten.';
  try{
    await saveTranscript(id);
    const result=await api(`/api/jobs/${id}/generate`,json('POST',payload));
    if(!Array.isArray(result.variants)||result.variants.length!==3)throw new Error('Das Modell hat keine drei Varianten geliefert. Versuch es noch mal.');
    if(s.captionRevision!==revision){await saveCaptions(id);if(currentJob?.id===id)$('captionStatus').textContent='Deine zwischenzeitlichen Änderungen bleiben erhalten. Zum Ersetzen erneut generieren.';}
    else{s.captions=result;s.captionLoaded=true;s.captionDirty=false;store(`klartext-captions-${id}`,null);if(currentJob?.id===id){renderCaptions();$('captionStatus').textContent='Drei Varianten erstellt, geprüft und gespeichert. Änderungen werden beim Verlassen des Feldes gelernt.';}}
  }catch(error){if(currentJob?.id===id)$('captionStatus').textContent=error.message;}
  finally{generationJobs.delete(id);updateGenerate();}
});
function clearFile(){chosenFile=null;$('file').value='';$('fileTitle').textContent='Audio oder Video hier ablegen';$('fileInfo').textContent='Klicken und Datei auswählen';$('fileNote').textContent='Wähle zuerst eine Datei aus.';}
window.addEventListener('beforeunload',event=>{if(uploading||[...sessions.values()].some(s=>s.savePromise)||generationJobs.size){event.preventDefault();event.returnValue='';}});
async function init(){await Promise.all([loadSpeakers(),loadBrands(),api('/api/ai/status').then(status=>$('aiStatus').textContent=status.message||(status.ready?'Schreibt lokal auf deinem PC.':'Lokales Modell noch nicht bereit.')).catch(error=>$('aiStatus').textContent=error.message)]);try{const health=await api('/api/health'),id=health.active||stored('klartext-job');if(id)await loadJob(id);await refreshLibrary();if(currentJob)await applyTask(currentJob.id,null);}catch{$('status').hidden=false;$('status').classList.add('error');$('phase').textContent='Keine Verbindung';$('message').textContent='Starte Klartext über START.cmd und lade diese Seite neu.';}}
init();
// Die Standard-Qualität kommt aus den Einstellungen; ohne Antwort bleibt der Wert aus dem HTML.
api('/api/settings').then(s=>{if(s?.transcription_model){$('model').value=s.transcription_model;$('model').dispatchEvent(new Event('change'));}}).catch(()=>{});
