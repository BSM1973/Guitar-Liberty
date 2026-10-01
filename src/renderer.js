const tuning=[64,59,55,50,45,40];
const exercises={
 chromatic:{title:'Chromatique 1-2-3-4',subtitle:'Indépendance des doigts',tempo:90,repeat:4,notes:[
  [5,1,1],[5,2,2],[5,3,3],[5,4,4],[4,1,1],[4,2,2],[4,3,3],[4,4,4],
  [3,1,1],[3,2,2],[3,3,3],[3,4,4],[2,1,1],[2,2,2],[2,3,3],[2,4,4]
 ]},
 pentatonic:{title:"J'apprends cette Penta : Am Penta Position 2",subtitle:'NIVEAU 0',tempo:50,repeat:4,notes:[
  [5,8,1],[5,10,3],[4,7,1],[4,10,4],[3,7,1],[3,9,3],[2,8,1],[2,10,3],
  [1,8,1],[1,10,3],[0,8,1],[0,10,3],[0,10,3],[0,8,1],[1,10,3],[1,8,1]
 ]}
};
let current='chromatic',playing=false,internalPlaybackPreparing=false,internalPlaybackGeneration=0,internalSchedulerGeneration=0,internalVoiceGeneration=0,internalLoopBoundaryPending=false,internalLoopSeriesComplete=false,internalGracePreviousStates=new Map(),internalGraceForwardStates=new Map(),internalGraceFollowingDebts=new Map(),timer=null,timerStartedAt=0,timerDelayMs=0,timerScheduledBpm=0,timerWallClock=false,nextDelayWallClock=false,audio,index=0,alphaTabMode=false;
function clearInternalTimer({preserveBoundary=false}={}){internalSchedulerGeneration++;if(timer){clearTimeout(timer);timer=null}timerStartedAt=0;timerDelayMs=0;timerScheduledBpm=0;timerWallClock=false;if(!preserveBoundary){nextDelayWallClock=false;internalLoopBoundaryPending=false;internalLoopSeriesComplete=false;internalGracePreviousStates.clear();internalGraceForwardStates.clear();internalGraceFollowingDebts.clear()}}
let backingAudio=null,backingEnabled=true,currentBackingUrl=null,currentBackingLeadBeats=0,backingStartTimer=null,leadInResumePending=false,leadInStartedAt=0,leadInDelayMs=0,leadInRemainingMs=0,mediaStartGeneration=0,alphaTabMediaPreparing=false,pendingBackingRestore=null;
let currentWistiaId=null,currentVideoLeadBeats=0,videoEnabled=false,wistiaPlayer=null,currentPracticeVideoUrl=null,videoPracticeTimer=null,currentVideoSourceBpm=50,wistiaResumeGeneration=0,pendingWistiaResume=null,wistiaLoadGeneration=0,wistiaEndHandler=null,pendingWistiaRestore=null,pendingWistiaReady=null,pendingLocalVideoRestore=null,pendingLocalVideoMetadata=null;
const sampleCache=new Map(),stringAttackGeneration=new Map();
const sampleLoadPromises=new Map();
const activeVoices=new Map();
let masterGain=null,masterComp=null;
function ensureOutput(){
 audio ||= new (window.AudioContext||window.webkitAudioContext)();
 if(masterGain) return;
 masterGain=audio.createGain(); masterGain.gain.value=.72;
 masterComp=audio.createDynamicsCompressor();
 masterComp.threshold.value=-14; masterComp.knee.value=12; masterComp.ratio.value=3;
 masterComp.attack.value=.003; masterComp.release.value=.18;
 masterGain.connect(masterComp).connect(audio.destination);
}
function stopVoice(string,fade=.025){
 const v=activeVoices.get(string); if(!v||!audio)return;
 const now=audio.currentTime;
 try{v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(Math.max(.0001,v.gain.gain.value),now);v.gain.gain.exponentialRampToValueAtTime(.0001,now+fade);v.source.stop(now+fade+.01)}catch(e){}
 activeVoices.delete(string);
}
function stopAllVoices(){[...activeVoices.keys()].forEach(s=>stopVoice(s,.035));}
function retimeActiveVoices(newBpm){
 if(!audio)return;
 const now=audio.currentTime,bpm=Math.max(1,+newBpm||120);
 for(const [string,voice] of activeVoices){
  if(!voice?.holdBeats||!voice.gain)continue;
  const oldBpm=Math.max(1,voice.scheduledBpm||bpm);
  const elapsedBeats=Math.max(0,(now-(voice.startedAt||now))*oldBpm/60);
  const remainingBeats=Math.max(0,voice.holdBeats-elapsedBeats);
  if(remainingBeats<=1e-6){
   // A source may still be alive for its natural sample tail after its musical
   // hold has ended. Never let a later tempo edit revive that finished note.
   try{
    const param=voice.gain.gain,current=Math.max(.0001,param.value);
    param.cancelScheduledValues(now);param.setValueAtTime(current,now);
    param.exponentialRampToValueAtTime(.0001,now+.008);
    voice.source?.stop(now+.012);
   }catch(_){}
   if(activeVoices.get(string)===voice)activeVoices.delete(string);
   continue;
  }
  const remainingSeconds=remainingBeats*60/bpm;
  const naturalRemaining=Math.max(0,(voice.naturalEnd||now)-now);
  if(naturalRemaining<=1e-6){
   // The underlying sample has ended. A later tempo slowdown cannot extend a
   // source beyond its real audio lifetime or revive it through gain automation.
   try{voice.source?.stop()}catch(_){}
   if(activeVoices.get(string)===voice)activeVoices.delete(string);
   continue;
  }
  const releaseIn=Math.min(naturalRemaining,Math.max(.018,Math.min(naturalRemaining,remainingSeconds)));
  try{
   const param=voice.gain.gain,current=Math.max(.0001,param.value);
   param.cancelScheduledValues(now);param.setValueAtTime(current,now);
   param.exponentialRampToValueAtTime(.0001,now+releaseIn);
  }catch(_){}
  voice.startedAt=now;voice.holdBeats=remainingBeats;voice.scheduledBpm=bpm;
 }
}
const SAMPLE_ROOT='../assets/guitar/clean';
const GUITAR_SAMPLES=['E aigue0.aiff','B0.aiff','G0.aiff','D0.aiff','A0.aiff','E0.aiff'];
const openMidi=[64,59,55,50,45,40];

function readAiff80(bytes,offset){
 const expon=((bytes[offset]&0x7f)<<8)|bytes[offset+1];
 let hi=0,lo=0;
 for(let i=0;i<4;i++) hi=hi*256+bytes[offset+2+i];
 for(let i=0;i<4;i++) lo=lo*256+bytes[offset+6+i];
 if(expon===0&&hi===0&&lo===0) return 0;
 const sign=(bytes[offset]&0x80)?-1:1;
 return sign*Math.pow(2,expon-16383)*(hi/Math.pow(2,31)+lo/Math.pow(2,63));
}
function decodeAiffPcm(raw){
 const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const text=(o,n)=>String.fromCharCode(...bytes.subarray(o,o+n));
 if(text(0,4)!=='FORM'||text(8,4)!=='AIFF') throw new Error('Not an uncompressed AIFF file');
 let p=12,channels=0,frames=0,bits=0,sampleRate=0,soundOffset=-1,soundSize=0;
 while(p+8<=bytes.length){
   const id=text(p,4),size=view.getUint32(p+4,false),data=p+8;
   if(id==='COMM'){
     channels=view.getUint16(data,false); frames=view.getUint32(data+2,false);
     bits=view.getUint16(data+6,false); sampleRate=Math.round(readAiff80(bytes,data+8));
   }else if(id==='SSND'){
     const offset=view.getUint32(data,false); soundOffset=data+8+offset; soundSize=size-8-offset;
   }
   p=data+size+(size&1);
 }
 if(!channels||!frames||bits!==16||!sampleRate||soundOffset<0) throw new Error(`Unsupported AIFF: ${channels}ch ${bits}bit ${sampleRate}Hz`);
 const available=Math.floor(soundSize/(channels*2)),count=Math.min(frames,available);
 const buffer=audio.createBuffer(channels,count,sampleRate);
 for(let ch=0;ch<channels;ch++){
   const out=buffer.getChannelData(ch);
   for(let i=0;i<count;i++) out[i]=view.getInt16(soundOffset+(i*channels+ch)*2,false)/32768;
 }
 return buffer;
}
async function loadGuitarSample(string){
 audio ||= new (window.AudioContext||window.webkitAudioContext)();
 if(sampleCache.has(string)) return sampleCache.get(string);
 if(sampleLoadPromises.has(string))return sampleLoadPromises.get(string);
 const loadPromise=(async()=>{
  try{
   if(!window.guitarAudio) throw new Error('Electron audio bridge unavailable');
   const raw=await window.guitarAudio.loadSample(GUITAR_SAMPLES[string]);
   const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw);
   const buffer=decodeAiffPcm(bytes);
   sampleCache.set(string,buffer);
   console.log('Loaded real AIFF guitar sample:',GUITAR_SAMPLES[string],buffer.duration.toFixed(2)+'s');
   return buffer;
  }catch(e){
   console.error('Guitar sample load failed:',GUITAR_SAMPLES[string],e);
   throw e;
  }finally{sampleLoadPromises.delete(string)}
 })();
 sampleLoadPromises.set(string,loadPromise);
 return loadPromise;
}
const tab=document.querySelector('#tab'),progress=document.querySelector('#progress'),tempo=document.querySelector('#tempo');
const loopStart=document.querySelector('#loopStart'),loopEnd=document.querySelector('#loopEnd'),loopToggle=document.querySelector('#loopToggle'),loopRepeats=document.querySelector('#loopRepeats'),autoBpm=document.querySelector('#autoBpm'),targetBpm=document.querySelector('#targetBpm'),countIn=document.querySelector('#countIn'),practiceStatus=document.querySelector('#practiceStatus'),practiceProgress=document.querySelector('#practiceProgress'),sessionTime=document.querySelector('#sessionTime'),sessionSeries=document.querySelector('#sessionSeries'),sessionReps=document.querySelector('#sessionReps'),sessionBestBpm=document.querySelector('#sessionBestBpm'),sessionGain=document.querySelector('#sessionGain'),resetSession=document.querySelector('#resetSession'),historyList=document.querySelector('#historyList'),historyCount=document.querySelector('#historyCount'),clearHistory=document.querySelector('#clearHistory'),historyRecord=document.querySelector('#historyRecord'),historySessions=document.querySelector('#historySessions'),historyTime=document.querySelector('#historyTime'),historyStreak=document.querySelector('#historyStreak'),bpmChart=document.querySelector('#bpmChart'),exerciseProgressTitle=document.querySelector('#exerciseProgressTitle'),exerciseProgressStats=document.querySelector('#exerciseProgressStats'),personalBest=document.querySelector('#personalBest'),recordDelta=document.querySelector('#recordDelta'),masteryLevel=document.querySelector('#masteryLevel'),masteryBar=document.querySelector('#masteryBar'),masteryInfo=document.querySelector('#masteryInfo'),pathList=document.querySelector('#pathList'),pathSummary=document.querySelector('#pathSummary');
let practiceLoop=false,practiceScore=null,practiceTimer=null,practiceIteration=0,lastLoopTick=-1,naturalEndCounted=false,countInAudio=null,playCursor=null;
let sessionStarted=null,sessionFirstPracticeAt=null,sessionPausedAt=null,sessionPausedMs=0,sessionStartHint='',sessionSeriesCount=0,sessionRepCount=0,sessionBest=0,sessionStartBpm=0,sessionClock=null,sessionLowestLibertyLevel=100,sessionHistorySaved=false,currentPracticeTitle='Exercice';
const HISTORY_KEY='guitarLibertyPracticeHistory';
const PLAY_WITH_ME_HISTORY_KEY='guitarLibertyPlayWithMeHistoryV1';
const LESSON_KEY='guitarLibertyLessonProgress';
const MEASURE_MASTERY_KEY='guitarLibertyMeasureMasteryV1';
const MUSIC_GOAL_KEY='guitarLibertyMusicGoalV1';
const GUITAR_JOURNAL_KEY='guitarLibertyJournalV1';
const LAST_SESSION_INSIGHT_KEY='guitarLibertyLastSessionInsightV1';
const EXERCISE_GOAL_KEY='guitarLibertyExerciseGoalsV1';
const EXERCISE_TEMPO_KEY='guitarLibertyExerciseTemposV1';
const lessonComplete=document.querySelector('#lessonComplete'),lessonObjective=document.querySelector('#lessonObjective'),lessonPrereq=document.querySelector('#lessonPrereq'),lessonDifficulty=document.querySelector('#lessonDifficulty'),lessonKey=document.querySelector('#lessonKey'),lessonTempo=document.querySelector('#lessonTempo');
let currentLessonId='';
function lessonProgress(){try{return JSON.parse(localStorage.getItem(LESSON_KEY)||'{}')}catch{return {}}}
function exerciseGoals(){try{return JSON.parse(localStorage.getItem(EXERCISE_GOAL_KEY)||'{}')}catch{return {}}}
function savedExerciseGoal(name){const goals=exerciseGoals(),value=+goals[name];return Number.isFinite(value)&&value>0?value:0}
function saveExerciseGoal(name,value){if(!name||name==='Exercice'||!Number.isFinite(+value)||+value<=0)return;const goals=exerciseGoals();goals[name]=+value;localStorage.setItem(EXERCISE_GOAL_KEY,JSON.stringify(goals))}
function exerciseTempos(){try{return JSON.parse(localStorage.getItem(EXERCISE_TEMPO_KEY)||'{}')}catch{return {}}}
function savedExerciseTempo(name){const tempos=exerciseTempos(),value=+tempos[name];return Number.isFinite(value)&&value>0?value:0}
function saveExerciseTempo(name,value){if(!name||name==='Exercice'||!Number.isFinite(+value)||+value<=0)return;const tempos=exerciseTempos();tempos[name]=+value;localStorage.setItem(EXERCISE_TEMPO_KEY,JSON.stringify(tempos))}
function courseButtons(){return [...document.querySelectorAll('.library-exercise')]}
let listenStream=null,listenContext=null,listenAnalyser=null,listenFrame=0,listening=false,expectedMidi=null,expectedSince=0,expectedMeasure=1,expectedToken=0,expectedResolved=false,lastDetectedMidi=null,lastAttackAt=0,lastSoundingAt=0,analysisHits=0,analysisTotal=0,timingHits=0,currentAnalysisMeasure=1,measurePerformance={},weakMeasure=null,adaptiveMode=false,adaptiveMeasureNo=null,adaptiveBaseline=null,adaptivePasses=0,adaptiveLastTotals={};
const aiListening=document.querySelector('#aiListening'),audioInput=document.querySelector('#audioInput'),audioOutput=document.querySelector('#audioOutput'),guitarMonitor=document.querySelector('#guitarMonitor'),monitorToggle=document.querySelector('#monitorToggle'),monitorVolume=document.querySelector('#monitorVolume'),listenStart=document.querySelector('#listenStart');
async function listAudioInputs(){
 try{
  const devices=await navigator.mediaDevices.enumerateDevices(),old=audioInput.value;
  audioInput.innerHTML='<option value="">Entrée par défaut</option>';
  devices.filter(d=>d.kind==='audioinput').forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||'Entrée audio '+(i+1);audioInput.appendChild(o)});
  if([...audioInput.options].some(o=>o.value===old))audioInput.value=old;
  const oldOut=audioOutput.value;audioOutput.innerHTML='<option value="">Sortie système par défaut</option>';
  devices.filter(d=>d.kind==='audiooutput').forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||'Sortie audio '+(i+1);audioOutput.appendChild(o)});
  if([...audioOutput.options].some(o=>o.value===oldOut))audioOutput.value=oldOut;
 }catch(e){document.querySelector('#listenStatus').textContent='Impossible de lister les entrées audio.'}
}
function autoCorrelate(buf,sr){
 let rms=0;for(let i=0;i<buf.length;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/buf.length);if(rms<.008)return {freq:0,rms};
 let best=-1,bestOff=-1;const min=Math.floor(sr/1200),max=Math.min(Math.floor(sr/70),buf.length/2);
 for(let off=min;off<=max;off++){let corr=0;for(let i=0;i<buf.length-off;i++)corr+=buf[i]*buf[i+off];if(corr>best){best=corr;bestOff=off}}
 return {freq:bestOff>0?sr/bestOff:0,rms};
}
function midiName(midi){const n=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];return n[(midi%12+12)%12]+(Math.floor(midi/12)-1)}
function updateExpectedFromTick(api,tick){
 try{
  let nearest=null,dist=Infinity;
  const lookup=api.renderer?.boundsLookup;
  for(const sys of lookup?.staffSystems||[])for(const master of sys.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[]){
   const bt=beat.beat?.absolutePlaybackStart??beat.beat?.absoluteDisplayStart;
   if(bt==null||!beat.notes?.length)continue;
   const d=Math.abs(bt-tick);if(d<dist){dist=d;nearest=beat}
  }
  const note=nearest?.notes?.[0]?.note;if(!note)return;
  const midi=note.realValue??note.displayValue??note.midiValue;
  const bi=nearest?.beat?.voice?.bar?.index??nearest?.beat?.voice?.bar?.masterBar?.index??nearest?.bar?.index;
  if(Number.isFinite(bi))currentAnalysisMeasure=bi+1;
  if(Number.isFinite(midi)&&midi!==expectedMidi){
   if(Number.isFinite(expectedMidi)&&!expectedResolved&&performance.now()-expectedSince>420)registerMissedNote(expectedMeasure);
   expectedMidi=midi;expectedSince=performance.now();expectedMeasure=currentAnalysisMeasure;expectedResolved=false;expectedToken++;document.querySelector('#expectedNote').textContent=midiName(midi);
   const token=expectedToken;setTimeout(()=>{if(listening&&token===expectedToken&&!expectedResolved)registerMissedNote(expectedMeasure)},430);
  }
 }catch(e){}
}
function performanceBucket(measure){return measurePerformance[measure]||(measurePerformance[measure]={hits:0,total:0,timing:0,wrong:0,early:0,late:0,onTime:0,missed:0,parasite:0})}
function registerMissedNote(measure){
 if(expectedResolved)return;expectedResolved=true;analysisTotal++;const ms=performanceBucket(measure);ms.total++;ms.missed=(ms.missed||0)+1;
 document.querySelector('#noteResult').textContent='○ NOTE MANQUÉE';document.querySelector('#noteResult').dataset.ok='0';refreshPerformanceScores();paintMeasureAnalysis();evaluateAdaptiveTraining();
}
function registerParasiteNote(measure){
 const ms=performanceBucket(measure);ms.parasite=(ms.parasite||0)+1;document.querySelector('#noteResult').textContent='⚠ NOTE PARASITE';document.querySelector('#noteResult').dataset.ok='0';paintMeasureAnalysis();
}
function refreshPerformanceScores(){
 const notePct=analysisTotal?Math.round(analysisHits/analysisTotal*100):0,timePct=analysisTotal?Math.round(timingHits/analysisTotal*100):0,score=Math.round(notePct*.7+timePct*.3);
 document.querySelector('#noteAccuracy').textContent=notePct+' %';document.querySelector('#timingAccuracy').textContent=timePct+' %';document.querySelector('#passageScore').textContent=score+' %';
}
function paintPerformance(playedMidi){
 if(!Number.isFinite(playedMidi)||!Number.isFinite(expectedMidi))return;
 analysisTotal++;const ok=Math.abs(playedMidi-expectedMidi)===0;if(ok)analysisHits++;
 const ms=performanceBucket(currentAnalysisMeasure);ms.total++;if(ok){ms.hits++;expectedResolved=true}else ms.wrong=(ms.wrong||0)+1;
 const dt=performance.now()-expectedSince,timingOk=dt>=0&&dt<=350;if(timingOk){timingHits++;ms.timing++;ms.onTime=(ms.onTime||0)+1}else if(dt<0){ms.early=(ms.early||0)+1}else{ms.late=(ms.late||0)+1;}
 document.querySelector('#playedCompareNote').textContent=midiName(playedMidi);
 const result=document.querySelector('#noteResult');result.textContent=ok?(timingOk?'✓ CORRECT':'✓ NOTE • TIMING À TRAVAILLER'):'✕ MAUVAISE NOTE';result.dataset.ok=ok?'1':'0';
 refreshPerformanceScores();paintMeasureAnalysis();evaluateAdaptiveTraining();
}
function measureMasteryStore(){try{return JSON.parse(localStorage.getItem(MEASURE_MASTERY_KEY)||'{}')}catch{return {}}}
function measureMasteryId(){return currentLessonId||currentPracticeTitle||'Exercice'}
function measureMasteryForCurrent(){return measureMasteryStore()[measureMasteryId()]||{}}
function measureMasteryState(x){return x.bestNotes>=90&&x.bestTiming>=80?'Maîtrisée':x.attempts>=4?'En progression':'À travailler'}
function saveMeasureMastery(measure,v){
 if(!measure||!v||v.total<2)return;
 const store=measureMasteryStore(),id=measureMasteryId(),song=store[id]||{},old=song[measure]||{bestNotes:0,bestTiming:0,attempts:0,masteredBpm:0,history:[]};
 const notes=Math.round(v.hits/v.total*100),timing=Math.round(v.timing/v.total*100),mastered=notes>=90&&timing>=80,bpm=+tempo.value||0,history=Array.isArray(old.history)?old.history.slice(-19):[];
 const last=history[history.length-1];if(!last||last.notes!==notes||last.timing!==timing||last.bpm!==bpm)history.push({notes,timing,bpm,at:Date.now()});
 song[measure]={bestNotes:Math.max(old.bestNotes||0,notes),bestTiming:Math.max(old.bestTiming||0,timing),attempts:Math.max(old.attempts||0,v.total),masteredBpm:mastered?Math.max(old.masteredBpm||0,bpm):old.masteredBpm||0,errors:{wrong:v.wrong||0,early:v.early||0,late:v.late||0,missed:v.missed||0,parasite:v.parasite||0,onTime:v.onTime||0,total:v.total||0},history:history.slice(-20),updatedAt:Date.now()};
 store[id]=song;localStorage.setItem(MEASURE_MASTERY_KEY,JSON.stringify(store));paintMeasureMemory();
}
function scoreMeasureCount(){
 const tracks=practiceScore?.tracks||[],staff=tracks[0]?.staves?.[0],bars=staff?.bars;
 return bars?.length||practiceScore?.masterBars?.length||0;
}
let selectedMemoryMeasure=null;
function openMeasureDetail(measure){
 selectedMemoryMeasure=measure;const box=document.querySelector('#measureDetail'),song=measureMasteryForCurrent(),x=song[measure],title=document.querySelector('#measureDetailTitle'),stats=document.querySelector('#measureDetailStats'),trend=document.querySelector('#measureDetailTrend'),errors=document.querySelector('#measureErrorProfile'),coach=document.querySelector('#measureDetailCoach');
 box.hidden=false;title.textContent='MESURE '+measure;
 if(!x){stats.innerHTML='<span>Pas encore analysée</span>';trend.innerHTML='<span class="measure-empty">Joue cette mesure avec ÉCOUTE IA pour créer son historique.</span>';errors.innerHTML='';coach.textContent='Cette mesure n’a pas encore assez de données pour établir une tendance.';return}
 const history=Array.isArray(x.history)?x.history:[],last=history[history.length-1],first=history[0],delta=first&&last?last.notes-first.notes:0;
 stats.innerHTML='<div><small>MEILLEURES NOTES</small><b>'+x.bestNotes+' %</b></div><div><small>MEILLEUR TIMING</small><b>'+x.bestTiming+' %</b></div><div><small>TENTATIVES</small><b>'+x.attempts+'</b></div><div><small>BPM MAÎTRISE</small><b>'+(x.masteredBpm?x.masteredBpm+' BPM':'—')+'</b></div>';
 trend.innerHTML=history.length?history.map((p,i)=>'<div class="measure-history-point"><i style="height:'+Math.max(6,p.notes)+'%"></i><b>'+p.notes+'%</b><small>'+p.timing+'% timing</small><small>'+p.bpm+' BPM</small></div>').join(''):'<span class="measure-empty">L’historique détaillé commencera à la prochaine analyse.</span>';
 const e=x.errors||{},et=Math.max(1,e.total||0),wrong=Math.round((e.wrong||0)/et*100),early=Math.round((e.early||0)/et*100),late=Math.round((e.late||0)/et*100),missed=Math.round((e.missed||0)/et*100),parasite=Math.round((e.parasite||0)/et*100),types=[['Mauvaises notes',wrong],['Trop tôt',early],['Trop tard',late],['Notes manquées',missed],['Notes parasites',parasite]].sort((a,b)=>b[1]-a[1]),dominant=types[0];
 errors.innerHTML='<div class="error-profile-title"><small>TYPE D’ERREUR DOMINANT</small><strong>'+(dominant[1]?dominant[0]:'Aucune erreur dominante')+'</strong></div><div class="error-profile-bars">'+types.map(t=>'<div><span>'+t[0]+'</span><i><b style="width:'+t[1]+'%"></b></i><em>'+t[1]+' %</em></div>').join('')+'</div>';
 if(dominant[1]>=15){
  if(dominant[0]==='Mauvaises notes')coach.textContent='Erreur dominante : mauvaises notes. Isole cette mesure, ralentis le tempo et stabilise les positions avant de réaccélérer.';
  else if(dominant[0]==='Trop tard')coach.textContent='Erreur dominante : notes en retard. Active le métronome et reviens légèrement sous ton tempo actuel pour replacer les attaques.';
  else if(dominant[0]==='Notes manquées')coach.textContent='Erreur dominante : notes manquées. Ralentis le passage et travaille avec une subdivision claire avant de remonter le BPM.';
  else if(dominant[0]==='Notes parasites')coach.textContent='Erreur dominante : notes parasites. Travaille la propreté des changements de corde et le muting des cordes non jouées.';
  else coach.textContent='Erreur dominante : notes trop tôt. Travaille avec le métronome en laissant respirer chaque temps avant d’augmenter le BPM.';
 }else if(history.length<2)coach.textContent='Continue quelques répétitions pour permettre à Guitare Liberty d’identifier une tendance.';
 else if(delta>=10)coach.textContent='Progression nette : +'+delta+' points de précision sur les performances enregistrées.';
 else if(delta<=-8)coach.textContent='La précision baisse de '+Math.abs(delta)+' points. Vérifie si l’augmentation du tempo déstabilise cette mesure.';
 else if(history.length>=4&&Math.abs(delta)<5)coach.textContent='Progression stable mais faible : cette mesure semble stagner. Ralentis légèrement et privilégie des répétitions propres.';
 else coach.textContent='Progression régulière. Continue à consolider cette mesure avant une nouvelle hausse de tempo.';
}
document.querySelector('#measureDetailPractice').onclick=()=>{if(selectedMemoryMeasure)startAdaptiveTraining(selectedMemoryMeasure)};
function paintMeasureMemory(){
 const host=document.querySelector('#measureMemoryMap'),summary=document.querySelector('#measureMemorySummary'),label=document.querySelector('#songMasteryLabel'),bar=document.querySelector('#songMasteryBar'),trophy=document.querySelector('#songMasteryTrophy');if(!host||!summary)return;
 const song=measureMasteryForCurrent(),saved=Object.entries(song).map(([m,v])=>({m:+m,...v})),scoreCount=scoreMeasureCount(),maxSaved=saved.length?Math.max(...saved.map(x=>x.m)):0,total=Math.max(scoreCount,maxSaved),byMeasure=new Map(saved.map(x=>[x.m,x]));
 if(!total){summary.textContent='Aucune donnée enregistrée';host.innerHTML='<span class="measure-empty">Les résultats de chaque mesure seront conservés automatiquement.</span>';if(label)label.textContent='MAÎTRISE 0 %';if(bar)bar.style.width='0%';if(trophy)trophy.hidden=true;return}
 const rows=Array.from({length:total},(_,i)=>byMeasure.get(i+1)||{m:i+1,unseen:true,bestNotes:0,bestTiming:0,attempts:0,masteredBpm:0});
 const analyzed=rows.filter(x=>!x.unseen),mastered=analyzed.filter(x=>measureMasteryState(x)==='Maîtrisée').length,pct=Math.round(mastered/total*100);
 summary.textContent=mastered+' / '+total+' mesures maîtrisées • '+analyzed.length+' analysées';
 if(label)label.textContent='MAÎTRISE '+pct+' %';if(bar)bar.style.width=pct+'%';if(trophy)trophy.hidden=!(total>0&&mastered===total);
 host.innerHTML=rows.map(x=>{if(x.unseen)return '<button class="measure-memory unseen" data-memory-measure="'+x.m+'"><b>M'+x.m+'</b><strong>Non analysée</strong><small>—</small></button>';const state=measureMasteryState(x),cls=state==='Maîtrisée'?'mastered':state==='En progression'?'progressing':'work';return '<button class="measure-memory '+cls+'" data-memory-measure="'+x.m+'"><b>M'+x.m+'</b><strong>'+state+'</strong><small>Notes '+x.bestNotes+' % • Timing '+x.bestTiming+' %</small><small>'+x.attempts+' tentatives'+(x.masteredBpm?' • '+x.masteredBpm+' BPM':'')+'</small></button>'}).join('');
 host.querySelectorAll('[data-memory-measure]').forEach(b=>b.onclick=()=>openMeasureDetail(+b.dataset.memoryMeasure));
 if(selectedMemoryMeasure&&selectedMemoryMeasure<=total)openMeasureDetail(selectedMemoryMeasure);
}
function resumeStoredPriority(){
 const song=measureMasteryForCurrent(),rows=Object.entries(song).map(([m,v])=>({m:+m,...v,state:measureMasteryState(v)})).filter(x=>x.state!=='Maîtrisée').sort((a,b)=>(a.bestNotes||0)-(b.bestNotes||0)||(a.bestTiming||0)-(b.bestTiming||0));
 return rows[0]||null;
}
function paintMeasureAnalysis(){
 const host=document.querySelector('#measureResults'),entries=Object.entries(measurePerformance).filter(([,v])=>v.total>=2).map(([m,v])=>({m:+m,pct:Math.round(v.hits/v.total*100),timing:Math.round(v.timing/v.total*100),total:v.total})).sort((a,b)=>a.m-b.m);
 if(!entries.length){host.innerHTML='<span class="measure-empty">Joue la TAB pour construire la carte de précision.</span>';return}
 host.innerHTML=entries.map(x=>'<button class="measure-result '+(x.pct<70?'weak':'')+'" data-measure="'+x.m+'"><b>M'+x.m+'</b><strong>'+x.pct+'%</strong><small>Timing '+x.timing+'%</small></button>').join('');
 weakMeasure=[...entries].sort((a,b)=>a.pct-b.pct||b.total-a.total)[0];
 document.querySelector('#weakPassageTitle').textContent='Mesure '+weakMeasure.m+' • '+weakMeasure.pct+' % de précision';
 document.querySelector('#weakPassageAdvice').textContent=weakMeasure.pct>=90?'Très bon passage. Consolide-le encore quelques répétitions.':'Mesure '+weakMeasure.m+' à retravailler : ralentis le tempo et utilise LOOP + AUTO BPM.';
 const b=document.querySelector('#practiceWeakPassage');b.disabled=false;b.textContent='🎯 RETRAVAILLER M'+weakMeasure.m;
 host.querySelectorAll('.measure-result').forEach(btn=>btn.onclick=()=>startAdaptiveTraining(+btn.dataset.measure));
 entries.forEach(x=>saveMeasureMastery(x.m,measurePerformance[x.m]));
}
function adaptivePanel(){
 const panel=document.querySelector('#adaptiveTraining');if(!panel)return;
 panel.hidden=!adaptiveMode;if(!adaptiveMode)return;
 document.querySelector('#adaptiveMeasure').textContent='Mesure '+adaptiveMeasureNo+' • objectif ≥ 90 %';
 document.querySelector('#adaptiveProgress').textContent=adaptivePasses+' / 3 répétitions maîtrisées';
 document.querySelector('#adaptiveBar').style.width=Math.min(100,adaptivePasses/3*100)+'%';
}
function restoreAdaptivePanelState(){
 adaptivePanel();
 if(!adaptiveMode)return;
 const advice=document.querySelector('#weakPassageAdvice');
 if(advice)advice.textContent='Mode adaptatif prêt à reprendre • mesure '+adaptiveMeasureNo+' • '+adaptivePasses+' / 3 répétitions maîtrisées. Relance la lecture quand tu es prêt.';
}
function nextWeakMeasure(exclude){
 const entries=Object.entries(measurePerformance).filter(([m,v])=>+m!==exclude&&v.total>=2).map(([m,v])=>({m:+m,pct:Math.round(v.hits/v.total*100),timing:Math.round(v.timing/v.total*100)}));
 return entries.sort((a,b)=>a.pct-b.pct||a.timing-b.timing)[0]||null;
}
function startAdaptiveTraining(measure){
 adaptiveMode=true;adaptiveMeasureNo=measure;adaptivePasses=0;adaptiveBaseline={...(measurePerformance[measure]||{hits:0,total:0,timing:0})};adaptiveLastTotals={};
 prepareWeakPassage(measure);adaptivePanel();
 document.querySelector('#weakPassageAdvice').textContent='Mode adaptatif actif : Guitare Liberty valide la mesure après 3 répétitions à ≥ 90 % avec un timing ≥ 80 %.';
}
function evaluateAdaptiveTraining(){
 if(!adaptiveMode||currentAnalysisMeasure!==adaptiveMeasureNo)return;
 const v=measurePerformance[adaptiveMeasureNo];if(!v)return;
 const base=adaptiveBaseline||{hits:0,total:0,timing:0},total=v.total-base.total;
 if(total<2)return;
 const marker=Math.floor(total/2);if(adaptiveLastTotals[adaptiveMeasureNo]===marker)return;adaptiveLastTotals[adaptiveMeasureNo]=marker;
 const hits=v.hits-base.hits,timing=v.timing-base.timing,pct=Math.round(hits/total*100),timingPct=Math.round(timing/total*100);
 if(pct>=90&&timingPct>=80)adaptivePasses++;else adaptivePasses=0;
 adaptivePanel();
 if(adaptivePasses>=3){
  const done=adaptiveMeasureNo,next=nextWeakMeasure(done);
  document.querySelector('#weakPassageAdvice').textContent='✓ Mesure '+done+' maîtrisée.'+(next?' Passage automatique à la mesure '+next.m+'.':' Aucun autre passage faible détecté.');
  if(next){adaptiveMeasureNo=next.m;adaptivePasses=0;adaptiveBaseline={...(measurePerformance[next.m]||{hits:0,total:0,timing:0})};adaptiveLastTotals={};prepareWeakPassage(next.m);adaptivePanel();}
  else{adaptiveMode=false;adaptivePanel();}
 }
}
document.querySelector('#adaptiveStop').onclick=()=>{adaptiveMode=false;adaptivePanel();document.querySelector('#weakPassageAdvice').textContent='Mode adaptatif arrêté.'};
function prepareWeakPassage(measure){
 const start=document.querySelector('#practiceStart'),end=document.querySelector('#practiceEnd');
 if(start)start.value=measure;if(end)end.value=measure;
 practiceLoop=true;const loopBtn=document.querySelector('#practiceLoop');if(loopBtn){loopBtn.classList.add('active');loopBtn.textContent='LOOP ON'}
 const current=+tempo.value||50,next=Math.max(30,Math.round(current*.85));preservePreferredTempo=true;tempo.value=next;tempo.dispatchEvent(new Event('input',{bubbles:true}));preservePreferredTempo=false;
 const auto=document.querySelector('#autoBpm');if(auto){auto.value='1';auto.dispatchEvent(new Event('change',{bubbles:true}))}
 document.querySelector('#weakPassageAdvice').textContent='Mesure '+measure+' préparée : LOOP activé, tempo réduit à '+next+' BPM, Auto BPM +1.';
}
document.querySelector('#practiceWeakPassage').onclick=()=>{if(weakMeasure)startAdaptiveTraining(weakMeasure.m)};
function pitchName(freq){
 const midi=Math.round(69+12*Math.log2(freq/440)),names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
 const exact=69+12*Math.log2(freq/440),cents=Math.round((exact-midi)*100);
 return {name:names[(midi%12+12)%12]+(Math.floor(midi/12)-1),cents,midi};
}
function listenLoop(){
 if(!listening||!listenAnalyser)return;
 const data=new Float32Array(listenAnalyser.fftSize);listenAnalyser.getFloatTimeDomainData(data);
 const r=autoCorrelate(data,listenContext.sampleRate),level=Math.min(100,Math.round(r.rms*420));
 document.querySelector('#inputMeterBar').style.width=level+'%';document.querySelector('#inputLevel').textContent=level+'%';
 if(r.freq>=70&&r.freq<=1200){const p=pitchName(r.freq),now=performance.now(),newAttack=lastDetectedMidi!==p.midi||now-lastSoundingAt>180;document.querySelector('#detectedNote').textContent=p.name;document.querySelector('#detectedFreq').textContent=r.freq.toFixed(1)+' Hz';document.querySelector('#detectedCents').textContent=(p.cents>0?'+':'')+p.cents+' cents';
  if(newAttack&&now-lastAttackAt>90){const inWindow=Number.isFinite(expectedMidi)&&Math.abs(now-expectedSince)<=430;if(!inWindow)registerParasiteNote(currentAnalysisMeasure);else paintPerformance(p.midi);lastAttackAt=now}
  const fretPc=((p.midi%12)+12)%12;
  document.querySelectorAll('#smartFretboard .note-dot').forEach(dot=>{const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];dot.classList.toggle('playing',names[fretPc]===dot.textContent)});
  const fs=document.querySelector('#fretboardState');if(fs)fs.textContent='TU JOUES '+p.name;
  lastDetectedMidi=p.midi;lastSoundingAt=now;
 }
 else{document.querySelector('#detectedNote').textContent='—';document.querySelector('#detectedFreq').textContent='— Hz';document.querySelector('#detectedCents').textContent='—';document.querySelectorAll('#smartFretboard .note-dot.playing').forEach(dot=>dot.classList.remove('playing'));}
 listenFrame=requestAnimationFrame(listenLoop);
}
async function startListening(){
 if(listening){stopListening();return}
 try{
  listenStream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:audioInput.value?{exact:audioInput.value}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  listenContext=new (window.AudioContext||window.webkitAudioContext)();const source=listenContext.createMediaStreamSource(listenStream);listenAnalyser=listenContext.createAnalyser();listenAnalyser.fftSize=2048;source.connect(listenAnalyser);
  guitarMonitor.srcObject=listenStream;guitarMonitor.volume=(+monitorVolume.value||0)/100;
  if(audioOutput.value&&typeof guitarMonitor.setSinkId==='function')await guitarMonitor.setSinkId(audioOutput.value);
  if(monitorToggle.checked)await guitarMonitor.play();else guitarMonitor.pause();
  analysisHits=0;analysisTotal=0;timingHits=0;expectedMidi=null;expectedResolved=false;expectedToken=0;lastDetectedMidi=null;lastAttackAt=0;lastSoundingAt=0;measurePerformance={};weakMeasure=null;adaptiveMode=false;adaptiveMeasureNo=null;adaptivePasses=0;adaptivePanel();currentAnalysisMeasure=1;document.querySelector('#measureResults').innerHTML='<span class="measure-empty">Joue la TAB pour construire la carte de précision.</span>';document.querySelector('#weakPassageTitle').textContent='Aucun passage analysé';document.querySelector('#practiceWeakPassage').disabled=true;document.querySelector('#expectedNote').textContent='—';document.querySelector('#playedCompareNote').textContent='—';document.querySelector('#noteResult').textContent='EN ATTENTE';document.querySelector('#noteAccuracy').textContent='—';document.querySelector('#timingAccuracy').textContent='—';document.querySelector('#passageScore').textContent='—';listening=true;listenStart.textContent='ARRÊTER L’ANALYSE';listenStart.classList.add('active');document.querySelector('#listenStatus').textContent='Écoute en cours • joue une note seule';await listAudioInputs();listenLoop();
 }catch(e){console.error(e);document.querySelector('#listenStatus').textContent='Accès audio refusé ou entrée indisponible.'}
}
function stopListening(){
 // Invalidate any delayed expected-note timeout before releasing the audio
 // graph. A score switch must never score a late miss against the old lesson.
 listening=false;expectedToken++;expectedMidi=null;expectedResolved=true;
 cancelAnimationFrame(listenFrame);listenFrame=0;listenStream?.getTracks().forEach(t=>t.stop());listenContext?.close();guitarMonitor.pause();guitarMonitor.srcObject=null;listenStream=null;listenContext=null;listenAnalyser=null;listenStart.textContent='DÉMARRER L’ANALYSE';listenStart.classList.remove('active');document.querySelector('#listenStatus').textContent='Analyse arrêtée';
}
document.querySelector('#aiListen').onclick=()=>{aiListening.hidden=!aiListening.hidden;if(!aiListening.hidden)listAudioInputs()};
document.querySelector('#audioRefresh').onclick=listAudioInputs;listenStart.onclick=startListening;
audioOutput.onchange=async()=>{if(guitarMonitor&&typeof guitarMonitor.setSinkId==='function')try{await guitarMonitor.setSinkId(audioOutput.value)}catch(e){console.error('Audio output',e);document.querySelector('#listenStatus').textContent='Impossible d’utiliser cette sortie audio.'}};
monitorToggle.onchange=()=>{if(!listenStream)return;if(monitorToggle.checked)guitarMonitor.play().catch(console.error);else guitarMonitor.pause()};
monitorVolume.oninput=()=>{guitarMonitor.volume=(+monitorVolume.value||0)/100;document.querySelector('#monitorVolumeLabel').textContent=monitorVolume.value+'%'};

function aiCoachContext(){
 const st=typeof currentLessonStats==='function'?currentLessonStats():{sessions:0,reps:0,seconds:0,best:0};
 return {course:currentPracticeTitle||'Cours Guitare Liberty',tempo:+tempo.value||0,target:+targetBpm.value||0,reps:st.reps||sessionRepCount||0,best:st.best||sessionBest||0,seconds:st.seconds||0,loop:!!practiceLoop};
}
function paintAiCoach(mode='analysis'){
 const x=aiCoachContext(),title=document.querySelector('#aiCoachTitle'),advice=document.querySelector('#aiCoachAdvice');
 if(mode==='tab'){
  title.textContent='Comprendre : '+x.course;
  advice.textContent='Observe d’abord les positions, les doigtés et le rythme. Travaille une mesure à la fois, puis relie les mesures sans accélérer tant que les changements ne sont pas propres.';
  return;
 }
 if(mode==='plan'){
  const start=Math.max(40,Math.min(x.tempo,x.best||x.tempo)),step=Math.max(1,Math.min(5,+autoBpm.value||2));
  title.textContent='Plan de travail personnalisé';
  advice.textContent='Commence à '+start+' BPM. Fais '+Math.max(4,+loopRepeats.value||4)+' répétitions propres du passage difficile, puis augmente de '+step+' BPM. Objectif actuel : '+x.target+' BPM.';
  return;
 }
 title.textContent=x.best?'Analyse de ta progression':'Conseil pour démarrer';
 if(x.best>=x.target&&x.target)advice.textContent='Ton meilleur tempo atteint l’objectif de '+x.target+' BPM. Consolide maintenant la précision avec plusieurs répétitions propres avant de considérer ce cours comme acquis.';
 else if(x.reps>=4)advice.textContent='Tu as déjà '+x.reps+' répétitions enregistrées. Reste à '+x.tempo+' BPM si le passage manque de régularité ; sinon utilise Auto BPM par petits paliers jusqu’à '+x.target+' BPM.';
 else advice.textContent='Travaille d’abord lentement à '+x.tempo+' BPM. Utilise LOOP sur le passage difficile et vise au moins 4 répétitions régulières avant d’augmenter le tempo.';
}
function performanceMeasures(){
 return Object.entries(measurePerformance).filter(([,v])=>v.total>=2).map(([m,v])=>({m:+m,pct:Math.round(v.hits/v.total*100),timing:Math.round(v.timing/v.total*100),samples:v.total})).sort((a,b)=>a.m-b.m);
}
function restoreCoachAfterScoreFailure(){
 const rows=performanceMeasures();
 if(rows.length)coachPerformanceReport();
 else paintAiCoach('analysis');
 paintSessionInsight();
}
function coachPerformanceReport(){
 const rows=performanceMeasures(),box=document.querySelector('#aiPerformanceSummary'),title=document.querySelector('#aiCoachTitle'),advice=document.querySelector('#aiCoachAdvice');
 if(!rows.length){title.textContent='Analyse de jeu en attente';advice.textContent='Active ÉCOUTE IA et joue la TAB pour que le Coach construise un bilan mesure par mesure.';box.hidden=true;return}
 const priority=[...rows].sort((a,b)=>a.pct-b.pct||a.timing-b.timing)[0],mastered=rows.filter(x=>x.pct>=90&&x.timing>=80),noteIssues=rows.filter(x=>x.pct<90).length,timingIssues=rows.filter(x=>x.timing<80).length;
 title.textContent='Bilan réel de ton jeu';
 advice.textContent='Priorité : mesure '+priority.m+' • notes '+priority.pct+' % • timing '+priority.timing+' %. '+(priority.pct<90?'La précision des notes est prioritaire. ':'Les notes sont solides. ')+(priority.timing<80?'Travaille maintenant la régularité rythmique.':'Le timing est stable.');
 box.hidden=false;box.innerHTML='<b>'+rows.length+' mesure'+(rows.length>1?'s':'')+' analysée'+(rows.length>1?'s':'')+'</b><span>'+mastered.length+' maîtrisée'+(mastered.length>1?'s':'')+'</span><span>'+noteIssues+' à corriger côté notes</span><span>'+timingIssues+' à stabiliser côté timing</span>';
}
function coachFixErrors(){
 const rows=performanceMeasures();if(!rows.length){coachPerformanceReport();return}
 const priority=[...rows].sort((a,b)=>a.pct-b.pct||a.timing-b.timing)[0];startAdaptiveTraining(priority.m);
 document.querySelector('#aiCoachTitle').textContent='Correction ciblée • Mesure '+priority.m;
 document.querySelector('#aiCoachAdvice').textContent='Mode adaptatif lancé à partir de ton analyse : '+priority.pct+' % de notes correctes, '+priority.timing+' % de timing. Guitare Liberty va suivre tes nouvelles répétitions.';
}
function coachContinueProgress(){
 const rows=performanceMeasures();if(!rows.length){const stored=resumeStoredPriority();if(stored){startAdaptiveTraining(stored.m);document.querySelector('#aiCoachTitle').textContent='Reprise de progression • Mesure '+stored.m;document.querySelector('#aiCoachAdvice').textContent='Guitare Liberty reprend la priorité mémorisée de ta séance précédente : notes '+stored.bestNotes+' % • timing '+stored.bestTiming+' %.';return}paintAiCoach('plan');return}
 const candidates=rows.filter(x=>x.pct<90||x.timing<80).sort((a,b)=>a.pct-b.pct||a.timing-b.timing);
 if(candidates.length){startAdaptiveTraining(candidates[0].m);document.querySelector('#aiCoachTitle').textContent='Prochaine priorité • Mesure '+candidates[0].m;document.querySelector('#aiCoachAdvice').textContent='Cette mesure est actuellement la prochaine faiblesse mesurée. Le travail adaptatif est prêt.'}
 else{document.querySelector('#aiCoachTitle').textContent='Passage consolidé';document.querySelector('#aiCoachAdvice').textContent='Toutes les mesures suffisamment analysées atteignent actuellement les seuils de maîtrise. Continue au tempo actuel ou augmente progressivement vers '+(+targetBpm.value||+tempo.value)+' BPM.'}
}
function coachSessionReport(){
 paintSessionInsight();
 const panel=document.querySelector('.session-insight');if(panel)panel.scrollIntoView({behavior:'smooth',block:'center'});
 coachPerformanceReport();const rows=performanceMeasures(),advice=document.querySelector('#aiCoachAdvice');if(!rows.length)return;
 const avgN=Math.round(rows.reduce((n,x)=>n+x.pct,0)/rows.length),avgT=Math.round(rows.reduce((n,x)=>n+x.timing,0)/rows.length),st=typeof currentLessonStats==='function'?currentLessonStats():{reps:sessionRepCount||0,best:sessionBest||0};
 advice.textContent='Session : '+rows.length+' mesure'+(rows.length>1?'s':'')+' analysée'+(rows.length>1?'s':'')+' • précision moyenne '+avgN+' % • timing '+avgT+' % • '+(st.reps||sessionRepCount||0)+' répétitions enregistrées • meilleur tempo '+(st.best||sessionBest||+tempo.value)+' BPM.';
}
document.querySelector('#aiFixErrors').onclick=coachFixErrors;
document.querySelector('#aiContinueProgress').onclick=coachContinueProgress;
document.querySelector('#aiSessionReport').onclick=coachSessionReport;
document.querySelector('#aiCoachRefresh').onclick=()=>paintAiCoach('analysis');
document.querySelector('#aiPracticePlan').onclick=()=>paintAiCoach('plan');
document.querySelector('#aiExplainTab').onclick=()=>paintAiCoach('tab');
let guidedStep=0,guidedStartedAt=0,guidedTimer=null,guidedStartBpm=0,guidedStartReps=0;
const guidedSession=document.querySelector('#guidedSession'),guidedStepTitle=document.querySelector('#guidedStepTitle'),guidedInstruction=document.querySelector('#guidedInstruction'),guidedSummary=document.querySelector('#guidedSummary'),guidedClock=document.querySelector('#guidedClock');
function guidedCurrentButton(){const bs=courseButtons(),p=lessonProgress();return bs.find((b,i)=>!p[b.dataset.score]&&(i===0||p[bs[i-1].dataset.score]))||bs[bs.length-1]}
function paintGuided(){
 const b=guidedCurrentButton(),name=b?b.childNodes[0].textContent.trim():'cours actuel';
 const titles=['Échauffement','Révision','Cours actuel','Loop + Auto BPM','Bilan de séance'];
 const instructions=[
  'Joue lentement pendant quelques minutes. Cherche la détente, la précision et un son propre avant la vitesse.',
  'Reprends un exercice déjà travaillé à un tempo confortable. L’objectif est la régularité, pas le record.',
  'Travaille « '+name+' ». Lis la TAB, identifie les passages difficiles puis joue au tempo conseillé.',
  'Active LOOP sur le passage difficile, choisis tes répétitions puis Auto BPM. Augmente seulement lorsque le passage reste propre.',
  'Séance terminée. Consulte ton bilan puis marque le cours terminé uniquement lorsque tu considères son objectif acquis.'
 ];
 guidedStepTitle.textContent=titles[guidedStep];guidedInstruction.textContent=instructions[guidedStep];
 document.querySelectorAll('[data-guide-step]').forEach((x,i)=>{x.classList.toggle('active',i===guidedStep);x.classList.toggle('done',i<guidedStep)});
 document.querySelector('#guidedPrev').disabled=guidedStep===0;document.querySelector('#guidedNext').textContent=guidedStep===4?'TERMINER':'SUIVANT →';
 guidedSummary.hidden=guidedStep!==4;
 if(guidedStep===4){
   const sec=Math.max(0,Math.round((Date.now()-guidedStartedAt)/1000)),gain=Math.max(0,(+tempo.value||0)-guidedStartBpm),reps=Math.max(0,sessionRepCount-guidedStartReps);
   guidedSummary.innerHTML='<b>Temps : '+formatDashTime(sec)+'</b><b>Répétitions : '+reps+'</b><b>BPM : '+guidedStartBpm+' → '+tempo.value+'</b><b>Progression : +'+gain+' BPM</b>';
 }
}
const MUSIC_GOALS={
 impro:{label:'IMPROVISER',title:'Chercher la liberté musicale.',text:'Privilégie les phrases, les respirations et l’utilisation personnelle des notes apprises.'},
 clean:{label:'JOUER PLUS PROPRE',title:'Faire sonner chaque geste.',text:'Privilégie un tempo confortable, la détente et la netteté avant toute accélération.'},
 rhythm:{label:'RYTHME',title:'Habiter la pulsation.',text:'Privilégie le métronome, le placement et plusieurs répétitions régulières au même tempo.'},
 fretboard:{label:'CONNAÎTRE LE MANCHE',title:'Construire tes repères.',text:'Observe les positions, les notes communes et les déplacements plutôt que de mémoriser mécaniquement.'},
 speed:{label:'GAGNER EN AISANCE',title:'Faire évoluer le tempo intelligemment.',text:'Augmente seulement quand le geste reste détendu, précis et musical.'}
};
function currentMusicGoal(){return localStorage.getItem(MUSIC_GOAL_KEY)||''}
function paintMusicGoal(){
 const id=currentMusicGoal(),g=MUSIC_GOALS[id],state=document.querySelector('#musicGoalState'),advice=document.querySelector('#musicGoalAdvice');
 document.querySelectorAll('[data-music-goal]').forEach(b=>b.classList.toggle('active',b.dataset.musicGoal===id));
 if(!state||!advice)return;
 if(!g){state.textContent='CHOISIS TON CAP';advice.innerHTML='<strong>Ton objectif peut changer quand tu veux.</strong><small>Guitare Liberty utilisera ce cap pour orienter ses conseils, sans t’enfermer dans un programme.</small>';return}
 state.textContent=g.label;advice.innerHTML='<strong>'+g.title+'</strong><small>'+g.text+'</small>';
}
document.querySelectorAll('[data-music-goal]').forEach(b=>b.onclick=()=>{localStorage.setItem(MUSIC_GOAL_KEY,b.dataset.musicGoal);paintMusicGoal();refreshDashboard()});
paintMusicGoal();

let guidedMinutes=0;
function selectTimedSession(minutes,button){
 guidedMinutes=minutes;
 document.querySelectorAll('[data-session-minutes]').forEach(b=>b.classList.toggle('active',b===button));
 const choice=document.querySelector('#timeSessionChoice'),plan=document.querySelector('#timeSessionPlan');
 if(!minutes){choice.textContent='LIBERTÉ';plan.innerHTML='<strong>Aujourd’hui, joue simplement.</strong><small>Pas de chronomètre à battre, pas de performance à prouver. Choisis un cours ou un backing et fais de la musique.</small>';return}
 choice.textContent=minutes+' MINUTES POUR TOI';
 const plans={5:['UNE SEULE CHOSE','1 min pour te poser • 3 min sur le passage prioritaire • 1 min pour le rejouer librement.'],15:['COURT ET CIBLÉ','3 min d’échauffement • 4 min de révision • 6 min sur le cours actuel • 2 min de jeu libre.'],30:['CONSTRUIRE ET JOUER','5 min d’échauffement • 5 min de révision • 12 min de travail ciblé • 5 min d’application musicale • 3 min de bilan.']};
 const p=plans[minutes];plan.innerHTML='<strong>'+p[0]+'</strong><small>'+p[1]+'</small>';
 setTimeout(()=>startGuided(minutes),150);
}
document.querySelectorAll('[data-session-minutes]').forEach(b=>b.onclick=()=>selectTimedSession(+b.dataset.sessionMinutes,b));
function startGuided(minutes=guidedMinutes){
 guidedMinutes=minutes||0;
 guidedStep=0;guidedStartedAt=Date.now();guidedStartBpm=+tempo.value||0;guidedStartReps=sessionRepCount||0;guidedSession.hidden=false;paintGuided();
 clearInterval(guidedTimer);guidedTimer=setInterval(()=>{
  const elapsed=(Date.now()-guidedStartedAt)/1000;
  if(guidedMinutes){const left=Math.max(0,guidedMinutes*60-elapsed);guidedClock.textContent='RESTE '+formatDashTime(left);if(left<=0){clearInterval(guidedTimer);guidedTimer=null;guidedClock.textContent='TEMPS LIBRE';}}
  else guidedClock.textContent=formatDashTime(elapsed);
 },1000);
 guidedSession.scrollIntoView({behavior:'smooth',block:'start'});
}
document.querySelector('#guidedNext').onclick=()=>{if(guidedStep<4){guidedStep++;paintGuided()}else{clearInterval(guidedTimer);guidedTimer=null;guidedSession.hidden=true;resetTrainingSession();refreshDashboard();document.querySelector('.session-insight')?.scrollIntoView({behavior:'smooth',block:'center'})}};
document.querySelector('#guidedPrev').onclick=()=>{if(guidedStep>0){guidedStep--;paintGuided()}};
document.querySelector('#guidedClose').onclick=()=>{clearInterval(guidedTimer);guidedTimer=null;guidedSession.hidden=true};
function formatDashTime(sec){sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?h+' h '+String(m).padStart(2,'0')+' min':m?m+' min '+String(s).padStart(2,'0')+' s':s+' s'}
function historyTimestamp(row){if(Number.isFinite(+row?.timestamp))return +row.timestamp;const value=String(row?.date||'').trim(),m=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(m){const t=new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();if(Number.isFinite(t))return t}const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:NaN}
function practiceDayKey(x){const t=historyTimestamp(x);if(!Number.isFinite(t))return null;const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function practiceContinuity(history){
 const days=[...new Set(history.map(practiceDayKey).filter(Boolean))].sort().reverse();if(!days.length)return {count:0,current:false};
 let count=1,previous=new Date(days[0]+'T12:00:00');
 for(let i=1;i<days.length;i++){const current=new Date(days[i]+'T12:00:00'),gap=Math.round((previous-current)/86400000);if(gap!==1)break;count++;previous=current}
 const today=new Date(),todayKey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'),yesterday=new Date(today);yesterday.setDate(today.getDate()-1);const yesterdayKey=yesterday.getFullYear()+'-'+String(yesterday.getMonth()+1).padStart(2,'0')+'-'+String(yesterday.getDate()).padStart(2,'0');
 return {count,current:days[0]===todayKey||days[0]===yesterdayKey};
}
function refreshDashboard(){
 const buttons=courseButtons(),p=lessonProgress(),done=buttons.filter(b=>p[b.dataset.score]);
 const next=buttons.find((b,i)=>!p[b.dataset.score]&&(i===0||p[buttons[i-1].dataset.score]))||null;
 const history=readHistory();
 const total=history.reduce((n,x)=>n+historySeconds(x),0),best=history.reduce((n,x)=>Math.max(n,Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.start)?+x.start:Number.isFinite(+x.bestBpm)?+x.bestBpm:0),0),longest=history.reduce((n,x)=>Math.max(n,historySeconds(x)),0),practiceDays=new Set(history.map(practiceDayKey).filter(Boolean)).size,continuity=practiceContinuity(history);
 const pct=buttons.length?Math.round(done.length/buttons.length*100):0;
 const q=s=>document.querySelector(s);
 q('#dashProgress').textContent=pct+' %';q('#dashProgressBar').style.width=pct+'%';
 q('#dashCurrent').textContent=next?next.childNodes[0].textContent.trim():(buttons.length?'Parcours terminé':'—');
 const nextIndex=next?buttons.indexOf(next)+1:-1;q('#dashNext').textContent=next&&buttons[nextIndex]?'Prochain : '+buttons[nextIndex].childNodes[0].textContent.trim():'Prochain : —';
 q('#dashTime').textContent=formatDashTime(total);q('#dashTime').title=history.length?'Temps cumulé • '+practiceDays+' jour'+(practiceDays>1?'s':'')+' de pratique'+(continuity.count>1?' • '+(continuity.current?'continuité en cours : ':'dernière continuité : ')+continuity.count+' jours':'')+' • plus longue séance : '+formatDashTime(longest):'Temps de pratique cumulé';
 const completedByExercise=new Map();history.forEach(x=>{const name=x.exercise||x.title||'Exercice',v=Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.bestBpm)?+x.bestBpm:0;if(v>0){const a=completedByExercise.get(name)||[];a.push(v);completedByExercise.set(name,a)}});let confirmedBest=0;completedByExercise.forEach(a=>{if(a.length>=2){a.sort((x,y)=>y-x);confirmedBest=Math.max(confirmedBest,a[1])}});
 q('#dashBpm').textContent=best?best+' BPM':'—';q('#dashBpm').title=best?'Record '+best+' BPM'+(confirmedBest?' • meilleur tempo confirmé sur plusieurs séances : '+confirmedBest+' BPM':' • pas encore de tempo confirmé sur plusieurs séances'):'Aucun tempo enregistré';
 const libertyHistory=history.filter(x=>Number.isFinite(+x.libertyLevel)),libertyExercises=new Map(),noTabCounts=new Map();
 libertyHistory.forEach(x=>{const name=x.exercise||x.title||'Exercice',level=+x.libertyLevel;libertyExercises.set(name,Math.min(libertyExercises.has(name)?libertyExercises.get(name):100,level));if(level===0)noTabCounts.set(name,(noTabCounts.get(name)||0)+1)});
 const freeExercises=[...libertyExercises.values()].filter(level=>level===0).length,consolidatedExercises=[...noTabCounts.values()].filter(count=>count>=2).length,startedLiberty=libertyExercises.size;
 const libertySummary=consolidatedExercises?consolidatedExercises+' autonomie'+(consolidatedExercises>1?'s':'')+' consolidée'+(consolidatedExercises>1?'s':''):freeExercises?freeExercises+' exercice'+(freeExercises>1?'s':'')+' sans TAB':startedLiberty?'autonomie en cours':'liberté —';
 q('#dashValidated').textContent=done.length+' cours validé'+(done.length>1?'s':'')+' • '+libertySummary;
 q('#todayCourse').textContent=next?'Travaille : '+next.childNodes[0].textContent.trim():'Tous les cours disponibles sont validés.';
 q('#todayGoal').textContent=next?'Objectif : '+(next.dataset.bpm||targetBpm.value)+' BPM • '+(next.dataset.difficulty||'progression régulière'):'Continue à consolider tes acquis.';
 const go=()=>{if(next){next.click();next.scrollIntoView({behavior:'smooth',block:'center'})}};
 q('#continueCourse').onclick=go;q('#todayStart').onclick=()=>{go();startGuided()};
 // Chemin de Liberté: derive a simple, explainable next step from existing
 // course/session data. No opaque scoring and no change to the playback engine.
 const currentName=next?next.childNodes[0].textContent.trim():(buttons.length?'Parcours consolidé':'Premier cours');
 const currentRows=history.filter(x=>!next||(x.exercise||x.title)===currentName);
 const currentReps=currentRows.reduce((n,x)=>n+(+x.reps||0),0);
 const currentBest=currentRows.reduce((n,x)=>Math.max(n,+x.best||+x.bestBpm||0),0);
 const pathCompletedTempos=currentRows.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.bestBpm)?+x.bestBpm:0).filter(v=>v>0).sort((a,b)=>b-a),currentConfirmedTempo=pathCompletedTempos.length>=2?pathCompletedTempos[1]:0;
 const libertyRows=currentRows.filter(x=>Number.isFinite(+x.libertyLevel));
 const currentLiberty=libertyRows.length?libertyRows.reduce((n,x)=>Math.min(n,+x.libertyLevel),100):100;
 const suggested=+(next?.dataset.bpm||targetBpm.value||50);
 let stage='learn',state='EN APPRENTISSAGE',recommendation='Découvre '+currentName+'.',reason='Prends le temps de comprendre le geste avant de chercher la vitesse.';
 if(currentRows.length>=1||currentReps>=3){stage='play';state='EN PROGRÈS';recommendation='Consolide '+currentName+' avec quelques répétitions propres.';reason='Tu as déjà commencé ce travail : la régularité compte maintenant davantage que la vitesse.';}
 if(currentRows.length>=2&&currentReps>=6&&currentConfirmedTempo>=suggested){stage='free';state='PRÊT À SE LIBÉRER';recommendation='Joue '+currentName+' avec moins de dépendance à la TAB.';reason='Le tempo est confirmé sur plusieurs séances et le passage est suffisamment travaillé pour commencer à transformer l’exercice en musique.';}
 if(currentLiberty<100&&currentRows.length){
  const noTabSessions=currentRows.filter(x=>Number.isFinite(+x.libertyLevel)&&+x.libertyLevel===0).length;
  stage='free';
  if(currentLiberty===0&&noTabSessions>=2){state='AUTONOMIE CONSOLIDÉE';recommendation='Joue '+currentName+' librement, sans chercher à prouver quoi que ce soit.';reason='Tu as retrouvé ce passage sans TAB sur plusieurs séances. L’autonomie devient un repère stable de ton jeu.';}
  else if(currentLiberty===0){state='JOUÉ SANS TAB';recommendation='Retrouve '+currentName+' sans TAB une nouvelle fois, avec le même confort.';reason='Tu as déjà joué ce passage sans TAB. Une nouvelle séance permettra de transformer cette réussite en autonomie reproductible.';}
  else{state='LIBERTÉ EN COURS';recommendation='Retrouve '+currentName+' avec une TAB réduite à '+currentLiberty+' %.';reason='Tu as déjà diminué l’aide visuelle jusqu’à '+currentLiberty+' %. Consolide ce niveau avant de retirer davantage de TAB.';}
 }
 if(!next&&buttons.length){stage='free';state='PARCOURS ACQUIS';recommendation='Rejoue librement un cours que tu aimes.';reason='Tes cours disponibles sont validés : entretiens maintenant le plaisir et la liberté de jeu.';}
 const stages=['learn','play','free'],stageIndex=stages.indexOf(stage);
 document.querySelectorAll('[data-liberty-step]').forEach((el,i)=>{el.classList.toggle('done',i<stageIndex);el.classList.toggle('active',i===stageIndex)});
 const stateEl=q('#libertyPathState'),recEl=q('#libertyRecommendation'),reasonEl=q('#libertyReason');
 const selectedGoal=MUSIC_GOALS[currentMusicGoal()];
 if(selectedGoal)reason=selectedGoal.text;
 if(stateEl)stateEl.textContent=state;if(recEl)recEl.textContent=recommendation;if(reasonEl)reasonEl.textContent=reason;
 // Humanist coach: progress vocabulary is descriptive, never punitive.
 let humanLevel=0,humanState='À DÉCOUVRIR',humanTitle='Chaque séance compte.',humanText='Ici, on mesure les progrès pour mieux t’accompagner, jamais pour te juger.';
 if(currentRows.length||currentReps){humanLevel=1;humanState='EN APPRENTISSAGE';humanTitle='Tu construis tes repères.';humanText='Prends le temps d’installer le geste. La régularité viendra avant la vitesse.';}
 if(currentReps>=3){humanLevel=2;humanState='EN PROGRÈS';humanTitle='Ton travail commence à s’installer.';humanText='Les répétitions portent leurs fruits. Garde un tempo où ton jeu reste confortable et musical.';}
 const completedTempos=currentRows.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0).filter(v=>v>0).sort((a,b)=>b-a),confirmedTempo=completedTempos.length>=2?completedTempos[1]:0;
 if(confirmedTempo>=suggested){humanLevel=3;humanState='TEMPO CONSOLIDÉ';humanTitle='Ce tempo devient un repère stable.';humanText='Tu as terminé plusieurs séances à ce niveau. Garde maintenant la fluidité, le son et le confort plutôt que de chercher automatiquement plus de BPM.';}
 if(currentLiberty<100&&currentRows.length){
  const humanNoTabSessions=currentRows.filter(x=>Number.isFinite(+x.libertyLevel)&&+x.libertyLevel===0).length;
  humanLevel=Math.max(humanLevel,3);
  if(currentLiberty===0&&humanNoTabSessions>=2){humanLevel=Math.max(humanLevel,4);humanState='AUTONOMIE CONSOLIDÉE';humanTitle='Cette liberté devient un repère stable.';humanText='Tu as retrouvé ce passage sans TAB sur plusieurs séances. Continue à le jouer pour la musique, le son et le plaisir plutôt que pour valider un niveau.';}
  else if(currentLiberty===0){humanState='JOUÉ SANS TAB';humanTitle='Tu as déjà joué ce passage sans TAB.';humanText='Garde maintenant cette liberté musicale sans chercher à la prouver : retrouve-la avec confort, écoute et plaisir.';}
  else{humanState='AUTONOMIE EN COURS';humanTitle='Tu prends progressivement le relais sur la TAB.';humanText='Tu as déjà réduit l’aide visuelle jusqu’à '+currentLiberty+' %. Ce repère est là pour t’accompagner, pas pour t’obliger à retirer davantage de TAB.';}
 }
 if(pct===100&&buttons.length){humanLevel=4;humanState='PARCOURS CONSOLIDÉ';humanTitle='Tu as construit une vraie autonomie.';humanText='La maîtrise n’est pas une fin : utilise maintenant ces acquis pour jouer, créer et te libérer de la TAB.';}
 const hs=q('#humanCoachState'),ht=q('#humanCoachTitle'),hx=q('#humanCoachText');
 if(hs)hs.textContent=humanState;if(ht)ht.textContent=humanTitle;if(hx)hx.textContent=humanText;
 document.querySelectorAll('[data-human-level]').forEach((el,i)=>{el.classList.toggle('done',i<humanLevel);el.classList.toggle('active',i===humanLevel)});

 const goLiberty=q('#libertyGo');if(goLiberty)goLiberty.onclick=()=>{go();if(stage!=='learn')startGuided()};

}
function refreshCourseProgress(){
 const buttons=courseButtons(),p=lessonProgress();let completed=0;
 buttons.forEach((b,i)=>{
   const id=b.dataset.score,done=!!p[id],unlocked=i===0||!!p[buttons[i-1].dataset.score];
   b.classList.toggle('course-complete',done);b.classList.toggle('course-locked',!unlocked);
   b.disabled=!unlocked;b.setAttribute('aria-disabled',String(!unlocked));
   let badge=b.querySelector('.course-state');
   if(!badge){badge=document.createElement('em');badge.className='course-state';b.appendChild(badge)}
   badge.textContent=done?'✓ TERMINÉ':unlocked?'EN COURS':'🔒 VERROUILLÉ';
   if(done)completed++;
 });
 const t=document.querySelector('#courseProgressText'),bar=document.querySelector('#courseProgressBar');
 if(t)t.textContent=completed+' / '+buttons.length+' terminé'+(completed>1?'s':'');
 if(bar)bar.style.width=(buttons.length?completed/buttons.length*100:0)+'%';
 refreshDashboard();
}
const lessonLearningState=document.querySelector('#lessonLearningState'),lessonMasteryBar=document.querySelector('#lessonMasteryBar'),lessonMasteryText=document.querySelector('#lessonMasteryText');
function historySeconds(x){
 if(Number.isFinite(+x?.seconds)&&+x.seconds>=0)return +x.seconds;
 const p=String(x?.duration||'0:0').split(':').map(Number);
 if(p.length>=3)return (p[p.length-3]||0)*3600+(p[p.length-2]||0)*60+(p[p.length-1]||0);
 return (p[0]||0)*60+(p[1]||0);
}
function formatSessionDuration(sec){
 sec=Math.max(0,Math.floor(+sec||0));
 const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
 return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function currentLessonStats(){
 const rows=readHistory().filter(x=>(x.exercise||x.title)===currentPracticeTitle);
 return {sessions:rows.length,reps:rows.reduce((n,x)=>n+(+x.reps||0),0),seconds:rows.reduce((n,x)=>n+historySeconds(x),0),best:rows.reduce((n,x)=>Math.max(n,+x.best||+x.bestBpm||0),0)};
}
function paintLessonMastery(){
 if(!currentLessonId)return;
 const st=currentLessonStats(),goal=Math.max(1,+targetBpm.value||120);
 const bpmPct=Math.min(1,st.best/goal),repPct=Math.min(1,st.reps/12),timePct=Math.min(1,st.seconds/900);
 const score=Math.round((bpmPct*.55+repPct*.25+timePct*.20)*100);
 let state='À DÉCOUVRIR',mastery='Découverte';
 if(st.sessions||st.reps||st.seconds){state='EN APPRENTISSAGE';mastery=score>=70?'En progression':'Découverte';}
 if(st.best>=goal&&st.reps>=4){state='VALIDÉ';mastery='Maîtrisé';}
 if(lessonProgress()[currentLessonId]){state='VALIDÉ';mastery=score>=70?'Maîtrisé':'Validé manuellement';}
 lessonLearningState.textContent=state;lessonLearningState.dataset.state=state;
 lessonMasteryText.textContent=mastery+' • '+score+' %';lessonMasteryBar.style.width=score+'%';
}
function paintLessonComplete(){
 const done=!!lessonProgress()[currentLessonId];
 lessonComplete.classList.toggle('complete',done);
 lessonComplete.textContent=done?'✓ COURS TERMINÉ':'✓ MARQUER TERMINÉ';
 refreshCourseProgress();
 paintLessonMastery();
}
function setLessonInfo(button){
 currentLessonId=button?.dataset.score||currentPracticeTitle;
 setTimeout(()=>{paintAiCoach('analysis');paintMeasureMemory()},0);
 lessonObjective.textContent=button?.dataset.objective||'Travailler la tablature proprement au tempo indiqué.';
 lessonPrereq.textContent=button?.dataset.prereq||'Accordage standard • lecture de TAB';
 lessonDifficulty.textContent=button?.dataset.difficulty||'Débutant';
 lessonKey.textContent=button?.dataset.key||'—';setTimeout(paintSmartFretboard,0);
 lessonTempo.textContent=(button?.dataset.bpm?button.dataset.bpm+' BPM':'—');
 paintLessonComplete();
 paintLessonMastery();
}
lessonComplete.onclick=()=>{
 if(!currentLessonId)return;
 const p=lessonProgress();p[currentLessonId]=!p[currentLessonId];localStorage.setItem(LESSON_KEY,JSON.stringify(p));paintLessonComplete();
 renderLearningPath();
};
function readHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return []}}
const HISTORY_LIMIT=200;
function writeHistory(items){localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,HISTORY_LIMIT)))}
function masteryFor(items){
 if(!items.length)return {pct:0,label:'Nouveau',record:0};
 const chronological=items.slice().reverse(),record=Math.max(...items.map(x=>+x.best||0)),start=Math.max(1,+chronological[0].start||40);
 const savedGoals=items.map(x=>+x.goal||0).filter(Boolean),goal=Math.max(start+1,savedGoals.length?savedGoals[savedGoals.length-1]:120);
 const pct=Math.max(0,Math.min(100,Math.round((record-start)/Math.max(1,goal-start)*100)));
 return {pct,label:pct>=100?'Maîtrisé':pct>=75?'Avancé':pct>=50?'Intermédiaire':pct>=25?'En progression':'Débutant',record};
}
function renderLearningPath(items=readHistory()){
 const groups={};items.forEach(x=>{if(x.exercise)(groups[x.exercise]??=[]).push(x)});
 const names=Object.keys(groups);pathSummary.textContent=names.length+' exercice'+(names.length>1?'s':'')+' suivi'+(names.length>1?'s':'');
 if(!names.length){pathList.innerHTML='<p>Entraîne-toi sur une tablature pour démarrer ton parcours.</p>';return}
 pathList.innerHTML=names.map(name=>{const m=masteryFor(groups[name]);return '<div class="path-item"><div><b>'+name+'</b><span>'+m.label+' • record '+m.record+' BPM</span></div><div class="path-meter"><i style="width:'+m.pct+'%"></i></div><strong>'+m.pct+' %</strong></div>'}).join('');
}
function renderExerciseProgress(items=readHistory()){
 const own=items.filter(x=>x.exercise===currentPracticeTitle).slice().reverse(),ctx=bpmChart.getContext('2d'),w=bpmChart.width,h=bpmChart.height;
 ctx.clearRect(0,0,w,h);exerciseProgressTitle.textContent=currentPracticeTitle;
 if(!own.length){exerciseProgressStats.textContent='Aucune donnée pour cette tablature.';personalBest.textContent='—';recordDelta.textContent='Commence une session pour établir ton record.';masteryLevel.textContent='Nouveau';masteryBar.style.width='0%';masteryInfo.textContent='0 %';return}
 const vals=own.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.start)?+x.start:0),recordVals=own.map(x=>Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.start)?+x.start:0),min=Math.max(0,Math.min(...vals,...recordVals)-10),max=Math.max(min+10,Math.max(...vals,...recordVals)+10),pad=24;
 ctx.strokeStyle='#303743';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,8);ctx.lineTo(pad,h-pad);ctx.lineTo(w-8,h-pad);ctx.stroke();
 ctx.strokeStyle='#e9b44c';ctx.lineWidth=2;ctx.beginPath();
 vals.forEach((v,i)=>{const x=pad+(w-pad-12)*(vals.length===1?.5:i/(vals.length-1)),y=8+(h-pad-12)*(1-(v-min)/(max-min));i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
 ctx.stroke();const record=Math.max(...recordVals),latest=own[own.length-1],lastTempo=latest?(+latest.end||+latest.best||+latest.start||0):0,libertyRows=own.filter(x=>Number.isFinite(+x.libertyLevel)),bestLiberty=libertyRows.length?libertyRows.reduce((n,x)=>Math.min(n,+x.libertyLevel),100):null,noTabSessions=libertyRows.filter(x=>+x.libertyLevel===0).length,libertySummary=bestLiberty===0?(noTabSessions>=2?' • autonomie consolidée':' • sans TAB'):bestLiberty!==null&&bestLiberty<100?' • TAB '+bestLiberty+' %':bestLiberty===100?' • TAB complète':'';exerciseProgressStats.textContent=own.length+' session'+(own.length>1?'s':'')+' • départ '+own[0].start+' BPM'+(lastTempo?' • dernier '+lastTempo+' BPM':'')+' • record '+record+' BPM'+libertySummary;personalBest.textContent=record+' BPM';const currentTempo=+tempo.value||0,delta=currentTempo-record,lastDelta=lastTempo?currentTempo-lastTempo:0;recordDelta.textContent=delta>0?'Nouveau record potentiel : +'+delta+' BPM':delta===0?'Tu es au niveau de ton record.':lastTempo&&currentTempo===lastTempo?'Tu reprends à ton dernier tempo travaillé • record '+record+' BPM.':lastTempo&&lastDelta<0?'Reprise confortable : '+Math.abs(lastDelta)+' BPM sous ton dernier travail • record '+record+' BPM.':lastTempo&&lastDelta>0?'Tu travailles '+lastDelta+' BPM au-dessus de ta dernière séance • record '+record+' BPM.':'Record personnel : '+record+' BPM.';const goal=Math.max(1,+targetBpm.value||120),start=Math.max(1,+own[0].start||40),sortedCompleted=vals.filter(v=>v>0).sort((a,b)=>b-a),bestCompleted=sortedCompleted[0]||start,consolidatedTempo=sortedCompleted.length>=2?Math.max(start,sortedCompleted[1]):start,tempoPct=Math.max(0,Math.min(100,Math.round((consolidatedTempo-start)/Math.max(1,goal-start)*100))),autonomyConsolidated=noTabSessions>=2,pct=tempoPct>=100&&!autonomyConsolidated?95:tempoPct;masteryBar.style.width=pct+'%';masteryInfo.textContent=pct+' %';masteryInfo.title=sortedCompleted.length>=2?'Tempo confirmé sur au moins deux séances : '+consolidatedTempo+' BPM • meilleur terminé '+bestCompleted+' BPM • record '+record+' BPM':'Une deuxième séance confirmera la maîtrise • meilleur terminé '+bestCompleted+' BPM • record '+record+' BPM';if(tempoPct>=100&&!autonomyConsolidated){masteryLevel.textContent=bestLiberty===0?'Tempo maîtrisé • autonomie à confirmer':'Tempo maîtrisé • autonomie en cours';masteryInfo.title+=' • maîtrise complète après consolidation sans TAB';}else if(tempoPct<100&&autonomyConsolidated){masteryLevel.textContent='Autonomie consolidée • tempo en progression';masteryInfo.title+=' • autonomie sans TAB consolidée, poursuis le tempo sans forcer';}else masteryLevel.textContent=tempoPct>=100?'Maîtrisé':tempoPct>=75?'Avancé':tempoPct>=50?'Intermédiaire':tempoPct>=25?'En progression':'Débutant';
}
function smartFretboardNotes(){
 const used=new Set(),roots=new Set(),score=practiceScore;
 try{
  for(const track of score?.tracks||[])for(const staff of track.staves||[])for(const bar of staff.bars||[])for(const voice of bar.voices||[])for(const beat of voice.beats||[])for(const note of beat.notes||[]){
   const midi=note.realValue??note.realValueWithoutHarmonic??note.midiValue;
   if(Number.isFinite(midi))used.add(((midi%12)+12)%12);
  }
 }catch(_){}
 const keyText=(lessonKey?.textContent||'').toUpperCase(),map={C:0,'C#':1,DB:1,D:2,'D#':3,EB:3,E:4,F:5,'F#':6,GB:6,G:7,'G#':8,AB:8,A:9,'A#':10,BB:10,B:11};
 const match=keyText.match(/[A-G](?:#|B)?/);if(match&&map[match[0]]!==undefined)roots.add(map[match[0]]);
 return {used,roots};
}
function paintSmartFretboard(){
 const host=document.querySelector('#smartFretboard'),state=document.querySelector('#fretboardState'),title=document.querySelector('#fretboardCoachTitle'),text=document.querySelector('#fretboardCoachText');if(!host)return;
 const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],strings=[['E',64],['B',59],['G',55],['D',50],['A',45],['E',40]],data=smartFretboardNotes();
 let out='<div class="fretboard-grid"><div class="fret-cell fret-corner"></div>'+Array.from({length:13},(_,f)=>'<div class="fret-cell fret-number">'+f+'</div>').join('');
 strings.forEach(([name,midi],row)=>{out+='<div class="fret-cell string-name">'+name+'</div>';for(let fret=0;fret<=12;fret++){const pc=(midi+fret)%12,isRoot=data.roots.has(pc),cls=isRoot?'root':'available';out+='<div class="fret-cell"><span class="note-dot '+cls+'" data-string="'+row+'" data-fret="'+fret+'" data-midi="'+(midi+fret)+'">'+names[pc]+'</span></div>'}});
 host.innerHTML=out+'</div>';
 host.querySelectorAll('.note-dot').forEach(dot=>dot.dataset.baseClass=dot.className);
 if(!practiceScore){state.textContent='EN ATTENTE';return}
 state.textContent='PRÊT À SUIVRE LA TAB';
 if(currentMusicGoal()==='fretboard'){title.textContent='Ton objectif est de connaître le manche.';text.textContent='Commence par retrouver les notes mises en évidence sur plusieurs cordes. Cherche les mêmes sons ailleurs plutôt que de mémoriser une seule forme.'}
 else if(currentMusicGoal()==='impro'){title.textContent='Transforme la position en territoire musical.';text.textContent='Pendant la lecture, observe la position active sur le manche puis essaie progressivement de t’en détacher.'}
 else{title.textContent='Relie ce que tu lis à ce que tu touches.';text.textContent='Pendant la lecture, le manche suit la note jouée par la tablature et montre sa position réelle.'}
}

let journalFeeling='';
function readGuitarJournal(){try{return JSON.parse(localStorage.getItem(GUITAR_JOURNAL_KEY)||'[]')}catch{return []}}
function renderGuitarJournal(){
 const items=readGuitarJournal(),box=document.querySelector('#journalEntries'),count=document.querySelector('#journalCount');if(!box||!count)return;
 count.textContent=items.length+' NOTE'+(items.length>1?'S':'');
 if(!items.length){box.innerHTML='<p>Aucune note pour le moment.</p>';return}
 const labels={fluide:'FLUIDE',concentre:'CONCENTRÉ',detendu:'DÉTENDU',difficile:'EXIGEANT',inspire:'INSPIRÉ'};
 box.innerHTML=items.slice(0,5).map(x=>'<article class="journal-note"><div><time>'+x.date+'</time><b>'+(labels[x.feeling]||'RESSENTI LIBRE')+'</b></div><p>'+String(x.text||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</p></article>').join('');
}
document.querySelectorAll('[data-journal-feeling]').forEach(b=>b.onclick=()=>{journalFeeling=b.dataset.journalFeeling;document.querySelectorAll('[data-journal-feeling]').forEach(x=>x.classList.toggle('active',x===b))});
document.querySelector('#journalSave').onclick=()=>{
 const input=document.querySelector('#journalText'),text=input.value.trim();if(!text&&!journalFeeling)return;
 const items=readGuitarJournal();items.unshift({date:new Date().toLocaleString('fr-FR'),feeling:journalFeeling,text:text||'Une séance vécue sans mots.'});
 localStorage.setItem(GUITAR_JOURNAL_KEY,JSON.stringify(items.slice(0,100)));input.value='';journalFeeling='';document.querySelectorAll('[data-journal-feeling]').forEach(x=>x.classList.remove('active'));renderGuitarJournal();
};
document.querySelector('#journalText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();document.querySelector('#journalSave').click()}});
renderGuitarJournal();

function renderGuitarMemory(items){
 const box=document.querySelector('#memoryTimeline'),count=document.querySelector('#memoryCount');if(!box||!count)return;
 if(!items.length){count.textContent='AUCUN SOUVENIR';box.innerHTML='<p>Ta première séance écrira ici le début de ton histoire.</p>';return}
 const chronological=items.slice().map((row,index)=>({row,index,time:historyTimestamp(row)})).sort((a,b)=>{const at=Number.isFinite(a.time)?a.time:null,bt=Number.isFinite(b.time)?b.time:null;if(at!==null&&bt!==null)return at-bt;if(at!==null)return -1;if(bt!==null)return 1;return b.index-a.index}).map(x=>x.row),events=[],seen=new Set(),noTabByExercise=new Map(),consolidatedFreedom=new Set(),tempoByExercise=new Map(),consolidatedTempoByExercise=new Map(),continuityMilestones=new Set();let record=0,totalReps=0,firstReducedTab=false,firstNoTab=false,lastPracticeDay=null,continuityDays=0;
 chronological.forEach((x,i)=>{
  const name=x.exercise||'Exercice';
  const day=practiceDayKey(x);
  if(day&&day!==lastPracticeDay){
   if(lastPracticeDay){const previous=new Date(lastPracticeDay+'T12:00:00'),current=new Date(day+'T12:00:00'),gap=Math.round((current-previous)/86400000);continuityDays=gap===1?continuityDays+1:1}else continuityDays=1;
   lastPracticeDay=day;
   [3,7,14,30].forEach(m=>{if(continuityDays>=m&&!continuityMilestones.has(m)){continuityMilestones.add(m);events.push({date:x.date,title:m+' jours à retrouver la guitare',text:'Tu es revenu vers ton instrument plusieurs jours de suite. Ce souvenir marque une présence régulière, pas une obligation à ne jamais faire de pause.'})}});
  }
  if(!seen.has(name)){seen.add(name);events.push({date:x.date,title:i===0?'Le voyage commence':'Un nouveau chapitre',text:'Première séance sur « '+name+' ».'})}
  const best=+x.best||0;if(best>record){const previous=record;record=best;events.push({date:x.date,title:previous?'Nouveau repère personnel':'Premier tempo de référence',text:'Tu as installé un nouveau repère à '+best+' BPM. Ce nombre raconte une étape, pas ta valeur de musicien.'})}
  const completed=Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0;if(completed>0){const tempos=tempoByExercise.get(name)||[];tempos.push(completed);tempoByExercise.set(name,tempos);const confirmed=tempos.length>=2?tempos.slice().sort((a,b)=>b-a)[1]:0,previousConfirmed=consolidatedTempoByExercise.get(name)||0;if(confirmed>previousConfirmed){consolidatedTempoByExercise.set(name,confirmed);events.push({date:x.date,title:'Tempo confirmé',text:'Tu as retrouvé « '+name+' » à '+confirmed+' BPM sur plusieurs séances. Ce tempo devient un repère reproductible, pas seulement un pic.'})}}
  const freedom=Number.isFinite(+x.libertyLevel)?+x.libertyLevel:null;
  if(freedom!==null&&freedom<100&&!firstReducedTab){firstReducedTab=true;events.push({date:x.date,title:'La TAB commence à s’effacer',text:'Pour la première fois, tu as laissé davantage de place à ta mémoire et à ton écoute sur « '+name+' ».'})}
  if(freedom===0&&!firstNoTab){firstNoTab=true;events.push({date:x.date,title:'Premier passage sans TAB',text:'Tu as joué « '+name+' » sans dépendre de la tablature. Une étape de liberté, à retrouver naturellement plutôt qu’à prouver.'})}
  if(freedom===0){
   const count=(noTabByExercise.get(name)||0)+1;noTabByExercise.set(name,count);
   if(count>=2&&!consolidatedFreedom.has(name)){consolidatedFreedom.add(name);events.push({date:x.date,title:'Une liberté qui revient',text:'Tu as retrouvé « '+name+' » sans TAB sur plusieurs séances. Ce passage commence à vivre dans ton jeu, pas seulement sur l’écran.'})}
  }
  const before=totalReps;totalReps+=+x.reps||0;
  [10,25,50,100,250].forEach(m=>{if(before<m&&totalReps>=m)events.push({date:x.date,title:m+' répétitions vécues',text:'Du temps passé avec l’instrument : c’est cette continuité qui construit ton jeu.'})});
 });
 count.textContent=events.length+' SOUVENIR'+(events.length>1?'S':'');
 box.innerHTML=events.slice(-8).reverse().map(e=>'<article class="memory-event"><time>'+e.date+'</time><strong>'+e.title+'</strong><small>'+e.text+'</small></article>').join('');
}
function renderHistory(){
 const items=readHistory();renderGuitarMemory(items);historyCount.textContent=items.length+' session'+(items.length>1?'s':'');historySessions.textContent=items.length;
 const totalSec=items.reduce((sum,x)=>sum+historySeconds(x),0);
 historyTime.textContent=formatSessionDuration(totalSec);
 const historyBest=items.reduce((best,x)=>Math.max(best,Number.isFinite(+x.best)?+x.best:Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.start)?+x.start:0),0),historyCompletedByExercise=new Map();
 items.forEach(x=>{const name=x.exercise||x.title||'Exercice',v=Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0;if(v>0){const a=historyCompletedByExercise.get(name)||[];a.push(v);historyCompletedByExercise.set(name,a)}});
 let historyConfirmedBest=0;historyCompletedByExercise.forEach(a=>{if(a.length>=2){a.sort((x,y)=>y-x);historyConfirmedBest=Math.max(historyConfirmedBest,a[1])}});
 historyRecord.textContent=historyBest?historyBest+' BPM':'—';
 historyRecord.title=historyBest?'Record '+historyBest+' BPM'+(historyConfirmedBest?' • meilleur tempo confirmé sur plusieurs séances : '+historyConfirmedBest+' BPM':' • pas encore de tempo confirmé sur plusieurs séances'):'Aucun tempo enregistré';
 const continuity=practiceContinuity(items),streak=continuity.current?continuity.count:0;
 historyStreak.textContent=streak+' jour'+(streak>1?'s':'');
 historyStreak.title=continuity.count>1?(continuity.current?'Continuité de pratique en cours':'Dernière continuité : '+continuity.count+' jours'):'Continuité de pratique';
 renderExerciseProgress(items);renderLearningPath(items);if(!items.length){historyList.innerHTML='<p>Aucune session enregistrée.</p>';return}
 historyList.innerHTML=items.map(x=>{const freedom=Number.isFinite(+x.libertyLevel)?+x.libertyLevel:null,libertyText=freedom===0?'SANS TAB':freedom!==null&&freedom<100?'TAB '+freedom+' %':freedom===100?'TAB COMPLÈTE':'LIBERTÉ —',series=Math.max(0,+x.series||0),reps=Math.max(0,+x.reps||0),end=+x.end||+x.best||+x.start||0,best=+x.best||end,start=+x.start||end;return '<div class="history-row"><b>'+x.date+'</b><span>'+x.duration+'</span><span>'+series+' série'+(series>1?'s':'')+'</span><span>'+reps+' répétition'+(reps>1?'s':'')+'</span><span>'+start+' → '+end+' BPM'+(best!==end?' • record '+best:'')+'</span><span>'+libertyText+'</span><strong>+'+(+x.gain||0)+' BPM</strong></div>'}).join('');
}
function saveCurrentSession(savedAt=Date.now()){
 if(sessionHistorySaved||!sessionStarted||(!sessionFirstPracticeAt&&!sessionRepCount&&!sessionSeriesCount))return;
 const sec=sessionFirstPracticeAt?activePracticeSeconds(savedAt):Math.floor((savedAt-sessionStarted)/1000),items=readHistory();
 items.unshift({exercise:currentPracticeTitle,goal:+targetBpm.value||120,date:new Date(savedAt).toLocaleString('fr-FR'),timestamp:savedAt,duration:formatSessionDuration(sec),seconds:sec,series:sessionSeriesCount,reps:sessionRepCount,start:sessionStartBpm,end:+tempo.value||sessionStartBpm,best:sessionBest,gain:Math.max(0,sessionBest-sessionStartBpm),libertyLevel:sessionLowestLibertyLevel});
 writeHistory(items);sessionHistorySaved=true;renderHistory();refreshDashboard();setTimeout(paintSmartFretboard,0);
 setTimeout(paintLessonMastery,0);
}
clearHistory.onclick=()=>{localStorage.removeItem(HISTORY_KEY);localStorage.removeItem(LAST_SESSION_INSIGHT_KEY);lastSessionInsight=null;renderHistory();refreshDashboard();paintSessionInsight()};
renderHistory();
function beginPracticePassage(at=Date.now()){
 startSession();
 if(!sessionFirstPracticeAt){sessionFirstPracticeAt=at;sessionStartHint=''}
 resumePracticeClock(at);
 paintSession();
}
function activePracticeSeconds(at=Date.now()){if(!sessionFirstPracticeAt)return 0;const paused=sessionPausedMs+(sessionPausedAt?Math.max(0,at-sessionPausedAt):0);return Math.max(0,Math.floor((at-sessionFirstPracticeAt-paused)/1000))}
function pausePracticeClock(at=Date.now()){if(sessionStarted&&sessionFirstPracticeAt&&!sessionPausedAt)sessionPausedAt=at}
function resumePracticeClock(at=Date.now()){if(!sessionPausedAt)return;sessionPausedMs+=Math.max(0,at-sessionPausedAt);sessionPausedAt=null}
function paintSession(){sessionSeries.textContent=sessionSeriesCount;sessionReps.textContent=sessionRepCount;sessionBestBpm.textContent=sessionBest||0;sessionGain.textContent='+'+Math.max(0,(sessionBest||0)-(sessionStartBpm||0))+' BPM';if(sessionStarted){sessionTime.textContent=formatSessionDuration(activePracticeSeconds());paintSessionInsight()}}
function readLastSessionInsight(){try{return JSON.parse(localStorage.getItem(LAST_SESSION_INSIGHT_KEY)||'null')}catch{return null}}
function writeLastSessionInsight(data){try{localStorage.setItem(LAST_SESSION_INSIGHT_KEY,JSON.stringify(data))}catch{}}
let lastSessionInsight=readLastSessionInsight();
function sessionInsightData(capturedAt=Date.now()){
 const sec=sessionStarted?(sessionFirstPracticeAt?activePracticeSeconds(capturedAt):0):0;
 const reps=sessionRepCount||0,series=sessionSeriesCount||0,start=sessionStartBpm||(+tempo.value||0),current=+tempo.value||start,best=sessionBest||start,gain=Math.max(0,best-start);
 return {sec,reps,series,start,current,best,gain,libertyLevel:sessionLowestLibertyLevel,exercise:currentPracticeTitle,date:new Date(capturedAt).toLocaleString('fr-FR'),timestamp:capturedAt};
}
function paintSessionInsight(data=null,finished=false){
 const q=s=>document.querySelector(s);if(!q('#sessionInsightState'))return;
 const x=data||(sessionStarted?sessionInsightData():lastSessionInsight)||{sec:0,reps:0,start:+tempo.value||0,best:0,gain:0};
 q('#insightTime').textContent=formatSessionDuration(x.sec);
 q('#insightReps').textContent=x.reps;
 q('#insightReps').title=(x.series||0)+' série'+((x.series||0)>1?'s':'')+' terminée'+((x.series||0)>1?'s':'')+' • '+(x.reps||0)+' répétition'+((x.reps||0)>1?'s':'')+' cumulée'+((x.reps||0)>1?'s':'');
 const displayedTempo=sessionStarted?(x.current||x.best):x.best;
 q('#insightTempo').textContent=displayedTempo?displayedTempo+' BPM':'—';
 q('#insightTempo').title=sessionStarted&&x.best&&x.best!==displayedTempo?'Meilleur tempo de la séance : '+x.best+' BPM':'Tempo de la séance';
 q('#insightGain').textContent=x.gain?'+'+x.gain+' BPM':'STABLE';
 let state='PRÊT POUR UNE SÉANCE',msg='Commence ta séance à ton rythme.',next='À la fin, Guitare Liberty te proposera une seule prochaine étape.';
 if(lastSessionInsight&&!sessionStarted){state='DERNIÈRE SÉANCE';const exercise=x.exercise?' sur « '+x.exercise+' »':'',when=x.date?' • '+x.date:'',series=+x.series||0,seriesText=series?' en '+series+' série'+(series>1?'s':''):'';state+=''+when;msg=x.reps?'Tu as construit '+x.reps+' répétition'+(x.reps>1?'s':'')+' attentive'+(x.reps>1?'s':'')+seriesText+exercise+'.':'Tu as pris du temps avec ton instrument'+exercise+'.';const rows=readHistory().filter(h=>(h.exercise||h.title)===(x.exercise||currentPracticeTitle)),completed=rows.map(h=>Number.isFinite(+h.end)?+h.end:Number.isFinite(+h.best)?+h.best:0).filter(v=>v>0).sort((a,b)=>b-a),confirmed=completed.length>=2?completed[1]:0;next=x.gain?'Ton repère atteint est '+x.best+' BPM.'+(confirmed?' Ton tempo confirmé sur plusieurs séances est '+confirmed+' BPM.':' Retrouve ce tempo une prochaine fois pour le consolider.'):'Reprends au même tempo : consolider est aussi progresser.';}
 if(!sessionStarted&&currentPracticeTitle&&currentPracticeTitle!=='Exercice'){
  const exerciseRows=readHistory().filter(h=>(h.exercise||h.title)===currentPracticeTitle&&Number.isFinite(+h.libertyLevel));
  if(exerciseRows.length){
   const bestFreedom=exerciseRows.reduce((n,h)=>Math.min(n,+h.libertyLevel),100),noTabSessions=exerciseRows.filter(h=>+h.libertyLevel===0).length,allExerciseRows=readHistory().filter(h=>(h.exercise||h.title)===currentPracticeTitle),lastExercise=latestExerciseSession(allExerciseRows),recordBpm=allExerciseRows.reduce((n,h)=>Math.max(n,+h.best||0),0),lastTempo=lastExercise?(+lastExercise.end||+lastExercise.best||0):0,completedTempos=allExerciseRows.map(h=>Number.isFinite(+h.end)?+h.end:Number.isFinite(+h.best)?+h.best:0).filter(v=>v>0).sort((a,b)=>b-a),confirmedTempo=completedTempos.length>=2?completedTempos[1]:0,tempoHint=lastTempo?' Dernier tempo travaillé : '+lastTempo+' BPM'+(confirmedTempo?' • confirmé '+confirmedTempo+' BPM':'')+(recordBpm&&recordBpm!==lastTempo?' • record '+recordBpm+' BPM':'')+'.':'';
   if(bestFreedom===0&&noTabSessions>=2){state='AUTONOMIE CONSOLIDÉE';msg='Tu as déjà retrouvé « '+currentPracticeTitle+' » sans TAB sur plusieurs séances.';next='Repars librement : la TAB reste disponible, mais elle n’est plus ton point de départ.'+tempoHint;}
   else if(bestFreedom===0){state='DÉJÀ JOUÉ SANS TAB';msg='Tu as déjà joué « '+currentPracticeTitle+' » sans TAB.';next='Essaie de retrouver cette liberté avec le même confort, sans forcer le résultat.'+tempoHint;}
   else if(bestFreedom<100){state='AUTONOMIE À RETROUVER';msg='Sur « '+currentPracticeTitle+' », tu as déjà réduit la TAB jusqu’à '+bestFreedom+' %.';next='Tu peux repartir avec la TAB complète, puis retrouver progressivement ce niveau.'+tempoHint;}
  }
 }
 if(sessionStarted&&!sessionFirstPracticeAt){state='SÉANCE PRÊTE';msg='Tout est prêt. Le temps de pratique commencera à ta première répétition.';next=sessionStartHint||'Prends ton instrument, installe ton geste et démarre quand tu le souhaites.';}
 if(sessionStarted&&sessionFirstPracticeAt&&!sessionPausedAt){state='SÉANCE EN COURS';msg=x.reps?'Tu es en train de construire de la régularité.':'Installe d’abord le geste et le son, sans chercher à aller vite.';next='Continue tant que ton jeu reste confortable et attentif.';}
 if(sessionStarted&&sessionFirstPracticeAt&&sessionPausedAt){state='SÉANCE EN PAUSE';msg=x.reps?'Tu as déjà construit '+x.reps+' répétition'+(x.reps>1?'s':'')+'. Le temps de pratique est suspendu.':'Le temps de pratique est suspendu.';next='Reprends quand tu es prêt : rien n’est perdu pendant cette pause.';}
 if(sessionStarted&&!sessionPausedAt&&x.reps>=3){state='TRAVAIL INSTALLÉ';msg='Tes répétitions commencent à installer le passage.';next='Refais-le encore proprement avant de décider si le tempo doit évoluer.';}
 if(sessionStarted&&!sessionPausedAt&&x.reps>=6){state='PROGRÈS CONSOLIDÉ';msg='Tu as donné du temps au passage : c’est ce qui construit une progression durable.';next=x.gain?'Garde ce nouveau tempo seulement s’il reste musical et détendu.':'Tu n’as pas besoin d’accélérer : consolide d’abord cette sensation de contrôle.';}
 if(sessionStarted&&!sessionPausedAt&&Number.isFinite(+x.libertyLevel)&&+x.libertyLevel<100){
  const freedom=+x.libertyLevel;
  state=freedom===0?'JEU SANS TAB':'AUTONOMIE EN COURS';
  msg=freedom===0?'Tu joues actuellement sans TAB. Reste concentré sur le son, le geste et la continuité.':'Tu as déjà réduit la TAB jusqu’à '+freedom+' % pendant cette séance.';
  next=freedom===0?'Ne cherche rien de plus pour l’instant : rends simplement ce jeu confortable.':'Consolide ce niveau avant de laisser la TAB s’effacer davantage.';
 }
 if(finished){
  const freedom=Number.isFinite(+x.libertyLevel)?+x.libertyLevel:100;
  state=freedom===0?'SÉANCE LIBRE':freedom<100?'AUTONOMIE EN PROGRÈS':'SÉANCE TERMINÉE';
  msg=freedom===0?'Tu as joué sans dépendre de la TAB : c’est une vraie étape vers ta liberté musicale.':freedom<100?'Tu as réduit la TAB jusqu’à '+freedom+' % pendant cette séance. Ton jeu commence à prendre le relais sur l’aide visuelle.':x.reps?'Tu viens de construire '+x.reps+' répétition'+(x.reps>1?'s':'')+' sur ce passage.':'Cette séance compte dans ton parcours.';
  next=freedom===0?'À la prochaine séance, cherche d’abord la même aisance avant d’augmenter le tempo.':freedom<100?'Repars avec la TAB complète si nécessaire, puis essaie de retrouver ce niveau de liberté.':x.gain?'Tu es passé de '+x.start+' à '+x.best+' BPM. Consolide ce repère à la prochaine séance.':'À la prochaine séance, repars de ce tempo avant de décider d’accélérer.';
 }
 q('#sessionInsightState').textContent=state;q('#insightMessage').textContent=msg;q('#insightNext').textContent=next;
}

function previousLibertyLevel(){
 const rows=readHistory().filter(x=>(x.exercise||x.title)===currentPracticeTitle&&Number.isFinite(+x.libertyLevel));
 return rows.length?rows.reduce((n,x)=>Math.min(n,+x.libertyLevel),100):null;
}
function latestExerciseSession(rows){
 if(!rows.length)return null;
 const dated=rows.map((row,index)=>({row,index,time:historyTimestamp(row)})).filter(x=>Number.isFinite(x.time));
 if(dated.length)return dated.reduce((latest,x)=>x.time>latest.time?x:latest).row;
 return rows[0]||null;
}
function startSession(){
 if(sessionStarted)return;
 const previousFreedom=previousLibertyLevel(),previousRows=readHistory().filter(x=>(x.exercise||x.title)===currentPracticeTitle),previousSession=latestExerciseSession(previousRows),previousTempo=previousSession?(+previousSession.end||+previousSession.best||null):null,previousRecord=previousRows.reduce((n,x)=>Math.max(n,+x.best||0),0),previousCompleted=previousRows.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0).filter(v=>v>0).sort((a,b)=>b-a),previousConfirmed=previousCompleted.length>=2?previousCompleted[1]:0;
 if(libertyAuto?.value==='auto'&&libertyLevel&&+libertyLevel.value!==100){libertyLevel.value='100';applyLibertyMode();}
 sessionStarted=Date.now();sessionHistorySaved=false;sessionStartBpm=+tempo.value||0;sessionBest=sessionStartBpm;sessionLowestLibertyLevel=Math.max(0,Math.min(100,+libertyLevel?.value||100));sessionStartHint='';
 if((previousFreedom!==null&&previousFreedom<100)||previousTempo){
  const tempoRef=previousTempo?' Dernier tempo travaillé : '+previousTempo+' BPM'+(previousConfirmed?' • confirmé '+previousConfirmed+' BPM':'')+(previousRecord&&previousRecord!==previousTempo?' • record '+previousRecord+' BPM':'')+'.':'';
  sessionStartHint=(previousFreedom===0?'Repère précédent : tu as déjà joué cet exercice sans TAB. Retrouve cette liberté seulement quand tu te sens prêt.':previousFreedom!==null&&previousFreedom<100?'Repère précédent : tu avais réduit la TAB jusqu’à '+previousFreedom+' %. Tu peux viser ce niveau à nouveau, sans obligation de commencer directement avec moins de TAB.':'Reprends d’abord tes sensations sur cet exercice.')+tempoRef;
 }
 paintSession();paintSessionInsight();
 sessionClock=setInterval(paintSession,1000)
}
function resetTrainingSession(){
 const finishedAt=Date.now(),hasPractice=!!(sessionFirstPracticeAt||sessionRepCount||sessionSeriesCount),finished=sessionStarted?sessionInsightData(finishedAt):null;
 const previousFreedom=finished&&hasPractice?previousLibertyLevel():null;
 saveCurrentSession(finishedAt);
 if(finished&&hasPractice){lastSessionInsight=finished;writeLastSessionInsight(finished);}
 sessionStarted=null;sessionFirstPracticeAt=null;sessionPausedAt=null;sessionPausedMs=0;sessionStartHint='';sessionSeriesCount=0;sessionRepCount=0;sessionBest=0;sessionStartBpm=0;sessionHistorySaved=false;clearInterval(sessionClock);sessionClock=null;sessionTime.textContent='00:00';paintSession();
 if(finished&&libertyAuto?.value==='auto'&&libertyLevel&&+libertyLevel.value!==100){libertyLevel.value='100';applyLibertyMode();}
 if(finished&&hasPractice){
  paintSessionInsight(finished,true);
  const freedom=Number.isFinite(+finished.libertyLevel)?+finished.libertyLevel:100,next=document.querySelector('#insightNext');
  if(next&&freedom<100&&(previousFreedom===null||freedom<previousFreedom))next.textContent=freedom===0?'Nouveau repère d’autonomie : tu as joué ce passage sans TAB pour la première fois. Laisse maintenant cette liberté devenir naturelle.':'Nouveau repère d’autonomie : tu as réduit la TAB jusqu’à '+freedom+' %. Consolide ce niveau avant de chercher à retirer davantage d’aide.';
 }else if(finished){paintSessionInsight();}
}
resetSession.onclick=resetTrainingSession;
if(lastSessionInsight)paintSessionInsight(lastSessionInsight,true);
function updatePracticeProgress(done=practiceIteration){const max=Math.max(1,+loopRepeats.value||1);practiceProgress.style.width=(Math.min(max,Math.max(0,done))/max*100)+'%'}
function practiceBars(){
 if(practiceScore?.masterBars?.length)return practiceScore.masterBars;
 const internalMeasures=exercises[current]?.measures;
 return Array.isArray(internalMeasures)?internalMeasures:[];
}
function syncPracticeRange(){
 const n=practiceBars().length||1;
 loopStart.max=loopEnd.max=n;
 loopStart.value=Math.min(Math.max(1,+loopStart.value||1),n);
 loopEnd.value=Math.min(Math.max(+loopStart.value,+loopEnd.value||Math.min(4,n)),n);
}
function practiceTicks(){
 // Tick ranges only exist in alphaTab. Internal MusicXML measures are exposed
 // through practiceBars() for LOOP controls, but must never be treated as
 // alphaTab master bars.
 if(!practiceScore?.masterBars?.length)return null;
 const bars=practiceScore.masterBars;syncPracticeRange();
 const a=bars[(+loopStart.value||1)-1],b=bars[(+loopEnd.value||1)-1];
 if(!a||!b)return null;
 const start=a.start||0;
 const next=bars[(+loopEnd.value||1)];
 const end=next?.start ?? (b.start+(b.calculateDuration?.()||0));
 return end>start?{start,end}:null;
}
function setPracticeRange(api){
 const range=practiceTicks(); if(!api||!range)return;
 api.playbackRange={startTick:range.start,endTick:range.end};
 api.isLooping=true;
}
function clearPracticeRange(api){if(api){api.isLooping=false;api.playbackRange=null}}
function scoreEndTick(){
 const bars=practiceScore?.masterBars;
 if(!bars?.length)return 0;
 const last=bars[bars.length-1];
 return Math.max(0,(last.start||0)+(last.calculateDuration?.()||0));
}
function setAlphaTempo(api){
 if(!api||!practiceScore)return;
 const original=practiceScore.tempo||120;
 api.playbackSpeed=Math.max(.25,Math.min(3,+tempo.value/original));
}
function restoreAlphaTick(api,tick){
 if(!api||!(tick>0))return;
 try{api.tickPosition=tick}catch(_){return}
 requestAnimationFrame(()=>{if(window.guitarLibertyAlphaTab===api)updatePlayCursor(api,tick)});
}
const libertyLevel=document.querySelector('#libertyLevel'),libertyState=document.querySelector('#libertyState'),libertyText=document.querySelector('#libertyText'),libertyReset=document.querySelector('#libertyReset'),libertyAuto=document.querySelector('#libertyAuto'),libertyCycle=document.querySelector('#libertyCycle'),libertyStartFade=document.querySelector('#libertyStartFade'),libertyStage=document.querySelector('#libertyStage');
function applyLibertyMode(){
 const level=Math.max(0,Math.min(100,+libertyLevel?.value||0)),tabHost=document.querySelector('#tab');
 if(sessionStarted){
  const previousSessionFreedom=sessionLowestLibertyLevel;
  sessionLowestLibertyLevel=Math.min(sessionLowestLibertyLevel,level);
  if(sessionLowestLibertyLevel<previousSessionFreedom)paintSessionInsight();
 }
 if(libertyState)libertyState.textContent=level?'TAB '+level+'%':'SANS TAB';
 if(libertyText)libertyText.textContent=level===100?'La tablature est complète : observe, écoute et mémorise.':level===0?'La tablature disparaît. Continue à jouer avec l’audio, le tempo et les repères déjà appris.':'L’aide visuelle diminue. Joue davantage de mémoire sans interrompre la musique.';
 if(tabHost){tabHost.style.opacity=String(level/100);tabHost.style.visibility=level===0?'hidden':'visible';}
 if(libertyStage){const stage=level>=75?0:level>=25?1:2;libertyStage.dataset.stage=String(stage);const fill=libertyStage.querySelector('i');if(fill)fill.style.width=(stage===0?'16.7%':stage===1?'50%':'100%');libertyStage.querySelectorAll('span').forEach((el,i)=>el.classList.toggle('active',i===stage));}
 if(libertyStage){
  const stage=level>=75?0:level>=25?1:2;
  libertyStage.dataset.stage=String(stage);
  const fill=libertyStage.querySelector('i');if(fill)fill.style.width=(stage===0?'16.7%':stage===1?'50%':'100%');
  libertyStage.querySelectorAll('span').forEach((el,i)=>el.classList.toggle('active',i===stage));
 }
}
libertyLevel?.addEventListener('change',applyLibertyMode);
libertyReset?.addEventListener('click',()=>{if(libertyLevel)libertyLevel.value='100';applyLibertyMode()});
function updateAutomaticLiberty(api,tick){
 if(libertyAuto?.value!=='auto'||!practiceScore||!libertyLevel)return;
 let level=100;
 if(libertyCycle?.value==='repetition'&&practiceLoop){
  const hold=Math.max(1,+libertyStartFade?.value||1),step=Math.max(0,Math.min(4,practiceIteration-hold+1));level=[100,75,50,25,0][step];
 }else{
  const bars=practiceBars();if(!bars.length)return;
  const end=bars[bars.length-1].start+(bars[bars.length-1].calculateDuration?.()||0);if(!end)return;
  const pct=Math.max(0,Math.min(1,tick/end));
  if(pct>=.8)level=0;else if(pct>=.6)level=25;else if(pct>=.4)level=50;else if(pct>=.2)level=75;
 }
 if(+libertyLevel.value!==level){libertyLevel.value=String(level);applyLibertyMode();}
}
libertyAuto?.addEventListener('change',()=>{if(libertyAuto.value==='auto'&&libertyLevel){libertyLevel.value='100';applyLibertyMode()}});
libertyCycle?.addEventListener('change',()=>{if(libertyAuto?.value==='auto'&&libertyLevel){libertyLevel.value='100';applyLibertyMode()}});
libertyStartFade?.addEventListener('change',()=>{if(libertyAuto?.value==='auto'&&libertyLevel){libertyLevel.value='100';applyLibertyMode()}});

applyLibertyMode();
let playWithMeActive=false,playWithMePhase='idle',playWithMeRange=null,playWithMeLastTick=-1,playWithMeRoundCount=0,playWithMePhraseRepeat=0,playWithMeAnswerTimer=null,playWithMeCountdownTimer=null,playWithMeStartedAt=0,playWithMeElapsedTimer=null;
const playWithMeBar=document.querySelector('#playWithMeBar'),playWithMeLength=document.querySelector('#playWithMeLength'),playWithMeStart=document.querySelector('#playWithMeStart'),playWithMeReplay=document.querySelector('#playWithMeReplay'),playWithMeRestart=document.querySelector('#playWithMeRestart'),playWithMeResume=document.querySelector('#playWithMeResume'),playWithMeNext=document.querySelector('#playWithMeNext'),playWithMeStop=document.querySelector('#playWithMeStop'),playWithMeState=document.querySelector('#playWithMeState'),playWithMeText=document.querySelector('#playWithMeText'),playWithMeAnswerMode=document.querySelector('#playWithMeAnswerMode'),playWithMeRepeat=document.querySelector('#playWithMeRepeat'),playWithMeLead=document.querySelector('#playWithMeLead'),playWithMeSessionLength=document.querySelector('#playWithMeSessionLength'),playWithMeProgress=document.querySelector('#playWithMeProgress'),playWithMeRound=document.querySelector('#playWithMeRound'),playWithMeCountdown=document.querySelector('#playWithMeCountdown'),playWithMeRepeatState=document.querySelector('#playWithMeRepeatState'),playWithMeSessionProgress=document.querySelector('#playWithMeSessionProgress'),playWithMeElapsed=document.querySelector('#playWithMeElapsed');
function playWithMePaint(phase){
 playWithMePhase=phase;
 const listen=document.querySelector('#playWithMeListen'),answer=document.querySelector('#playWithMeAnswer');
 listen?.classList.toggle('active',phase==='listen');answer?.classList.toggle('active',phase==='answer');
 if(phase==='listen'){playWithMeState.textContent='ÉCOUTE';playWithMeText.textContent='Écoute la phrase sans jouer. Mémorise le rythme et le mouvement.'}
 else if(phase==='answer'){playWithMeState.textContent='À TOI';playWithMeText.textContent='La lecture est en pause : rejoue maintenant exactement la même phrase.'}
 else{playWithMeState.textContent='PRÊT';playWithMeText.textContent='Guitare Liberty joue une mesure. À toi de la rejouer juste après.'}
 if(playWithMeProgress)playWithMeProgress.textContent='PHRASE '+Math.max(1,Math.floor(((+playWithMeBar.value||1)-1)/Math.max(1,+playWithMeLength.value||1))+1);
 if(playWithMeRound)playWithMeRound.textContent=playWithMeRoundCount+' RÉPONSE'+(playWithMeRoundCount>1?'S':'');
 if(playWithMeRepeatState){const repeatMax=Math.max(1,+playWithMeRepeat?.value||1);playWithMeRepeatState.textContent='PASSAGE '+Math.min(repeatMax,playWithMePhraseRepeat+1)+'/'+repeatMax;}
 if(playWithMeSessionProgress){const bars=practiceBars(),len=Math.max(1,+playWithMeLength.value||1),available=Math.max(1,Math.ceil((bars.length-Math.max(0,(+playWithMeBar.value||1)-1))/len)),limit=playWithMeSessionLength?.value==='all'?available:Math.min(available,Math.max(1,+playWithMeSessionLength?.value||available)),current=Math.max(1,playWithMeRoundCount+1);playWithMeSessionProgress.textContent=Math.max(0,Math.min(100,Math.round(((current-1)/limit)*100)))+'%';}
}
function renderPlayWithMeHistory(){
 const list=document.querySelector('#playWithMeHistoryList'),count=document.querySelector('#playWithMeHistoryCount'),summary=document.querySelector('#playWithMeHistorySummary');if(!list||!count)return;
 let items=[];try{items=JSON.parse(localStorage.getItem(PLAY_WITH_ME_HISTORY_KEY)||'[]')}catch(_){}
 count.textContent=items.length+' session'+(items.length>1?'s':'');
 if(!items.length){if(summary)summary.textContent='Aucune progression enregistrée.';const trend=document.querySelector('#playWithMeTrend');if(trend)trend.textContent='TENDANCE • —';const ex=document.querySelector('#playWithMeExerciseSummary');if(ex)ex.textContent='Aucun bilan pour cet exercice.';const ng=document.querySelector('#playWithMeNextGoal');if(ng)ng.textContent='PROCHAINE ÉTAPE • TERMINE UNE SESSION POUR OBTENIR UN REPÈRE';list.innerHTML='<p>Aucune session terminée.</p>';return}
 const totalSeconds=items.reduce((n,x)=>n+(+x.seconds||0),0),totalResponses=items.reduce((n,x)=>n+(+x.responses||0),0),bestBpm=Math.max(...items.map(x=>+x.bpm||0));
 if(summary)summary.textContent=items.length+' SESSIONS • '+String(Math.floor(totalSeconds/60)).padStart(2,'0')+':'+String(totalSeconds%60).padStart(2,'0')+' DE JEU • '+totalResponses+' RÉPONSES • RECORD '+bestBpm+' BPM';
 const exerciseSummary=document.querySelector('#playWithMeExerciseSummary'),own=items.filter(x=>x.exercise===currentPracticeTitle);if(exerciseSummary){if(!own.length)exerciseSummary.textContent='Aucun bilan pour « '+currentPracticeTitle+' ».';else{const secs=own.reduce((n,x)=>n+(+x.seconds||0),0),responses=own.reduce((n,x)=>n+(+x.responses||0),0),record=Math.max(...own.map(x=>+x.bpm||0));exerciseSummary.textContent=currentPracticeTitle+' • '+own.length+' SESSION'+(own.length>1?'S':'')+' • '+responses+' RÉPONSES • '+String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')+' • RECORD '+record+' BPM';}}
 const trend=document.querySelector('#playWithMeTrend');if(trend){if(own.length<2)trend.textContent='TENDANCE • EN CONSTRUCTION';else{const recent=own.slice(0,3),older=own.slice(3,6),avg=a=>a.reduce((n,x)=>n+(+x.bpm||0),0)/Math.max(1,a.length),rAvg=avg(recent),oAvg=older.length?avg(older):(+own[own.length-1].bpm||0),delta=Math.round(rAvg-oAvg);trend.textContent=delta>0?'TENDANCE • +'+delta+' BPM SUR LES SESSIONS RÉCENTES':delta<0?'TENDANCE • '+delta+' BPM SUR LES SESSIONS RÉCENTES':'TENDANCE • TEMPO STABLE';}}
 const nextGoal=document.querySelector('#playWithMeNextGoal');if(nextGoal){if(!own.length)nextGoal.textContent='PROCHAINE ÉTAPE • TERMINE UNE SESSION POUR OBTENIR UN REPÈRE';else{const last=own[0],sessions=own.length;if(sessions<3)nextGoal.textContent='PROCHAINE ÉTAPE • CONSOLIDE ENCORE '+(3-sessions)+' SESSION'+(3-sessions>1?'S':'')+' À '+last.bpm+' BPM';else if((+last.repeat||1)<2)nextGoal.textContent='PROCHAINE ÉTAPE • GARDE '+last.bpm+' BPM ET PASSE À 2× PAR PHRASE';else if(last.mode!=='timed')nextGoal.textContent='PROCHAINE ÉTAPE • ESSAIE MÊME DURÉE À '+last.bpm+' BPM';else nextGoal.textContent='PROCHAINE ÉTAPE • REFAIS UNE SESSION PROPRE À '+last.bpm+' BPM AVANT D’ACCÉLÉRER';}}
 list.innerHTML=items.slice(0,8).map(x=>'<div class="history-row"><b>'+x.date+'</b><span>'+x.exercise+'</span><span>'+String(Math.floor((x.seconds||0)/60)).padStart(2,'0')+':'+String((x.seconds||0)%60).padStart(2,'0')+'</span><span>'+x.responses+' réponses</span><span>'+x.bpm+' BPM</span><strong>'+(x.mode==='timed'?'MÊME DURÉE':'LIBRE')+'</strong></div>').join('');
}
function savePlayWithMeSession(){
 const sec=Math.max(0,Math.floor((Date.now()-playWithMeStartedAt)/1000));
 let items=[];try{items=JSON.parse(localStorage.getItem(PLAY_WITH_ME_HISTORY_KEY)||'[]')}catch(_){}
 items.unshift({exercise:currentPracticeTitle,date:new Date().toLocaleString('fr-FR'),seconds:sec,responses:playWithMeRoundCount,format:+playWithMeLength.value||1,mode:playWithMeAnswerMode?.value||'manual',repeat:+playWithMeRepeat?.value||1,bpm:+tempo.value||0});
 localStorage.setItem(PLAY_WITH_ME_HISTORY_KEY,JSON.stringify(items.slice(0,50)));renderPlayWithMeHistory();
}
const playWithMeHistoryClear=document.querySelector('#playWithMeHistoryClear');
playWithMeHistoryClear?.addEventListener('click',()=>{localStorage.removeItem(PLAY_WITH_ME_HISTORY_KEY);renderPlayWithMeHistory()});
renderPlayWithMeHistory();
function playWithMeTicks(){
 const bars=practiceBars(),start=Math.max(0,(+playWithMeBar.value||1)-1),len=Math.max(1,+playWithMeLength.value||1),a=bars[start],next=bars[start+len];
 if(!a)return null;const last=bars[Math.min(bars.length-1,start+len-1)],endTick=next?.start??(last.start+(last.calculateDuration?.()||0));
 return {start:a.start||0,end:endTick};
}
function stopPlayWithMe(){
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';clearInterval(playWithMeElapsedTimer);playWithMeElapsedTimer=null;
 playWithMeActive=false;playWithMeRange=null;playWithMeLastTick=-1;playWithMePaint('idle');playWithMeStart.disabled=false;if(playWithMeReplay)playWithMeReplay.disabled=true;if(playWithMeRestart)playWithMeRestart.disabled=true;if(playWithMeResume)playWithMeResume.disabled=true;if(playWithMeNext)playWithMeNext.disabled=true;playWithMeStop.disabled=true;
 const api=window.guitarLibertyAlphaTab;if(api){try{api.pause()}catch(_){}}
}
function startPlayWithMe(){
 const api=window.guitarLibertyAlphaTab;if(!api||!practiceScore){playWithMeText.textContent='Charge d’abord une tablature Guitar Pro.';return}
 const range=playWithMeTicks();if(!range)return;
 practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');clearPracticeRange(api);
 playWithMeRange=range;playWithMeActive=true;playWithMeLastTick=-1;playWithMeRoundCount=0;playWithMePhraseRepeat=0;playWithMeStartedAt=Date.now();clearInterval(playWithMeElapsedTimer);const paintElapsed=()=>{const s=Math.max(0,Math.floor((Date.now()-playWithMeStartedAt)/1000));if(playWithMeElapsed)playWithMeElapsed.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};paintElapsed();playWithMeElapsedTimer=setInterval(paintElapsed,1000);playWithMeStart.disabled=true;if(playWithMeReplay)playWithMeReplay.disabled=true;if(playWithMeRestart)playWithMeRestart.disabled=false;if(playWithMeResume)playWithMeResume.disabled=true;if(playWithMeNext)playWithMeNext.disabled=true;playWithMeStop.disabled=false;playWithMePaint('listen');
 try{api.tickPosition=range.start;api.play()}catch(e){stopPlayWithMe()}
}
function startPlayWithMeTimedAnswer(){
 if(!playWithMeActive||playWithMePhase!=='answer'||!playWithMeRange)return;
 const ticks=Math.max(1,playWithMeRange.end-playWithMeRange.start),scoreTempo=practiceScore?.tempo||120,currentTempo=Math.max(1,+tempo.value||scoreTempo);
 const ms=Math.max(400,Math.round((ticks/960)*(60000/currentTempo))),answerEnds=performance.now()+ms;
 const paintCountdown=()=>{if(playWithMeCountdown)playWithMeCountdown.textContent='REPRISE '+Math.max(0,(answerEnds-performance.now())/1000).toFixed(1)+' s'};
 clearInterval(playWithMeCountdownTimer);paintCountdown();playWithMeCountdownTimer=setInterval(paintCountdown,100);
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=setTimeout(()=>{clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';if(playWithMeActive&&playWithMePhase==='answer')playWithMeNext?.click()},ms);
}
playWithMeRepeat?.addEventListener('change',()=>{if(playWithMeRepeatState){const max=Math.max(1,+playWithMeRepeat.value||1);playWithMeRepeatState.textContent='PASSAGE '+Math.min(max,playWithMePhraseRepeat+1)+'/'+max;}});
playWithMeStart?.addEventListener('click',startPlayWithMe);
playWithMeResume?.addEventListener('click',()=>{
 if(playWithMeActive)return;
 startPlayWithMe();
});
playWithMeRestart?.addEventListener('click',()=>{
 if(!playWithMeActive)return;
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';
 playWithMeBar.value=1;playWithMeRoundCount=0;playWithMePhraseRepeat=0;playWithMeRange=playWithMeTicks();playWithMeLastTick=-1;
 if(playWithMeReplay)playWithMeReplay.disabled=true;if(playWithMeNext)playWithMeNext.disabled=true;playWithMePaint('listen');
 const api=window.guitarLibertyAlphaTab;try{api.pause();api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
});

playWithMeReplay?.addEventListener('click',()=>{
 if(!playWithMeActive||playWithMePhase!=='answer'||!playWithMeRange)return;
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';
 playWithMeReplay.disabled=true;if(playWithMeNext)playWithMeNext.disabled=true;playWithMeLastTick=-1;playWithMePaint('listen');
 const api=window.guitarLibertyAlphaTab;try{api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
});

playWithMeNext?.addEventListener('click',()=>{
 if(!playWithMeActive||playWithMePhase!=='answer')return;
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';if(playWithMeReplay)playWithMeReplay.disabled=true;
 playWithMeRoundCount++;if(playWithMeRound)playWithMeRound.textContent=playWithMeRoundCount+' RÉPONSE'+(playWithMeRoundCount>1?'S':'');
 const repeatMax=Math.max(1,+playWithMeRepeat?.value||1);
 if(playWithMePhraseRepeat+1<repeatMax){
  playWithMePhraseRepeat++;
  playWithMeRange=playWithMeTicks();playWithMeLastTick=-1;playWithMeNext.disabled=true;playWithMePaint('listen');
  const api=window.guitarLibertyAlphaTab;try{api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
  return;
 }
 playWithMePhraseRepeat=0;
 const bars=practiceBars(),len=Math.max(1,+playWithMeLength.value||1),nextStart=(+playWithMeBar.value||1)+len;const sessionLimit=playWithMeSessionLength?.value==='all'?Infinity:Math.max(1,+playWithMeSessionLength?.value||Infinity);
 if(nextStart>bars.length||playWithMeRoundCount>=sessionLimit){playWithMeActive=false;clearInterval(playWithMeElapsedTimer);playWithMeElapsedTimer=null;savePlayWithMeSession();if(playWithMeSessionProgress)playWithMeSessionProgress.textContent='100%';playWithMeState.textContent='TERMINÉ';playWithMeText.textContent='Session terminée • '+playWithMeRoundCount+' réponse'+(playWithMeRoundCount>1?'s':'')+'. Tu peux refaire la session avec les mêmes réglages.';playWithMeNext.disabled=true;if(playWithMeReplay)playWithMeReplay.disabled=true;if(playWithMeRestart)playWithMeRestart.disabled=true;if(playWithMeResume)playWithMeResume.disabled=false;playWithMeStart.disabled=false;playWithMeStop.disabled=true;return}
 playWithMeBar.value=nextStart;playWithMeRange=playWithMeTicks();playWithMeLastTick=-1;playWithMeNext.disabled=true;playWithMePaint('listen');
 const api=window.guitarLibertyAlphaTab;try{api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
});
playWithMeStop?.addEventListener('click',stopPlayWithMe);

let alphaPlayedBeat=null,manualScrollUntil=0,autoTabScrolling=false,playbackFollowEnabled=true,manualScrollStartY=0;
let alphaTabLoadGeneration=0,libraryLoadGeneration=0,alphaTabClickHandler=null,alphaTabPendingResolve=null,currentAlphaTabSource=null;
function invalidateAlphaTabLoad(){
 alphaTabLoadGeneration++;
 if(alphaTabPendingResolve){alphaTabPendingResolve(false);alphaTabPendingResolve=null;}
}
window.addEventListener('wheel',()=>{if(!autoTabScrolling){manualScrollUntil=Infinity;playbackFollowEnabled=false}},{passive:true});
window.addEventListener('scroll',()=>{if(!autoTabScrolling&&Math.abs(window.scrollY-manualScrollStartY)>12){manualScrollUntil=Infinity;playbackFollowEnabled=false}},{passive:true});
window.addEventListener('touchmove',()=>{if(!autoTabScrolling){manualScrollUntil=Infinity;playbackFollowEnabled=false}},{passive:true});
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)){manualScrollUntil=Infinity;playbackFollowEnabled=false}});
function updatePlayCursor(api,tick){
 const lookup=api.boundsLookup||api.renderer?.boundsLookup;if(!lookup?.staffSystems)return;
 let modelBeat=alphaPlayedBeat;
 // Query the playback tick cache on EVERY position event. playedBeatChanged is
 // perfect for repeats, but alphaTab can intentionally keep the same played
 // beat across a tie. tickCache still advances through the metrical destination
 // beat, so it takes priority whenever it returns a beat.
 if(api.tickCache?.findBeat){
  try{
   const tracks=new Set();
   const scoreTracks=api.score?.tracks||[];
   for(let i=0;i<scoreTracks.length;i++)tracks.add(i);
   if(!tracks.size)tracks.add(0);
   const timedBeat=api.tickCache.findBeat(tracks,tick)?.currentBeat;
   if(timedBeat)modelBeat=timedBeat;
  }catch(_){}
 }
 let target=null;
 if(modelBeat){
  outer:for(const system of lookup.staffSystems||[])for(const master of system.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[]){
   if(beat.beat===modelBeat){target={beat,system};break outer;}
  }
 }
 // Never let a lookup failure make the orange cursor disappear.
 if(!target){
  for(const system of lookup.staffSystems||[])for(const master of system.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[]){
   const bt=beat.beat?.absolutePlaybackStart??beat.beat?.absoluteStart??beat.beat?.playbackStart;
   if(bt==null||bt>tick)continue;
   if(!target||bt>=target.tick)target={tick:bt,beat,system};
  }
 }
 if(!target)return;
 const b=target.beat.visualBounds||target.beat.realBounds||target.beat.bounds;
 const sys=target.system.visualBounds||target.system.realBounds||target.system.bounds;
 if(!b||!sys)return;
 let cursorX=b.x+b.w/2;
 // A playback beat can span several metrical beats (e.g. a half note starting
 // on beat 3). There is no new alphaTab beat event on beat 4, so derive the
 // quarter-beat boundary from tick time while keeping the repeat-aware beat.
 const beatModel=target.beat.beat;
 const beatStart=beatModel?.absolutePlaybackStart??beatModel?.absoluteStart??beatModel?.playbackStart;
 const beatDuration=beatModel?.playbackDuration??beatModel?.duration;
 const quarterTicks=api.score?.masterBars?.[beatModel?.voice?.bar?.masterBar?.index]?.timeSignatureDenominator
   ? 960*4/api.score.masterBars[beatModel.voice.bar.masterBar.index].timeSignatureDenominator
   : 960;
 if(Number.isFinite(beatStart)&&Number.isFinite(beatDuration)&&beatDuration>quarterTicks&&Number.isFinite(tick)){
  const elapsed=Math.max(0,tick-beatStart);
  const metricalStep=Math.floor(elapsed/quarterTicks);
  if(metricalStep>0){
   // Find the next visible beat position; if none exists because the note is
   // sustained, use the following bar boundary as the visual destination.
   let nextX=null;
   let seen=false;
   outerNext:for(const s2 of lookup.staffSystems||[])for(const m2 of s2.bars||[])for(const bar2 of m2.bars||[])for(const bt2 of bar2.beats||[]){
    if(seen){
     // A new staff line restarts X near the left edge. Interpolating toward it
     // while keeping the old system Y made the cursor visibly run backwards.
     if(s2!==target.system)break outerNext;
     const nb=bt2.visualBounds||bt2.realBounds||bt2.bounds;if(nb){nextX=nb.x+nb.w/2;break outerNext;}
    }
    if(bt2===target.beat)seen=true;
   }
   if(Number.isFinite(nextX)){
    const steps=Math.max(1,Math.ceil(beatDuration/quarterTicks));
    cursorX=(b.x+b.w/2)+(nextX-(b.x+b.w/2))*Math.min(metricalStep/steps,.75);
   }
  }
 }
 if(!playCursor){playCursor=document.createElement('div');playCursor.className='gl-play-cursor';tab.appendChild(playCursor)}
 playCursor.style.left=cursorX+'px';playCursor.style.top=sys.y+'px';playCursor.style.height=sys.h+'px';playCursor.style.display='block';
 // Viewport is deliberately never moved by playback. The orange cursor continues independently.
}
async function metronomeClick(accent=false,generation=countInGeneration){
 countInAudio ||= new (window.AudioContext||window.webkitAudioContext)();
 if(countInAudio.state==='suspended'){
  try{await countInAudio.resume()}catch(e){console.error('Count-in audio resume',e);return}
 }
 if(generation!==countInGeneration||!countInActive)return;
 const o=countInAudio.createOscillator(),g=countInAudio.createGain(),now=countInAudio.currentTime;
 const vol=(+metronomeVolume?.value||0)/100;
 o.frequency.value=accent?1200:850;g.gain.setValueAtTime(Math.max(.0001,vol*.22),now);g.gain.exponentialRampToValueAtTime(.0001,now+.055);
 o.connect(g).connect(countInAudio.destination);o.start(now);o.stop(now+.06);
}
let metronomeEnabled=false,metronomeTimer=null,metronomeBeatIndex=0,metronomeNextTime=0,metronomeContext=null,metronomeGeneration=0,metronomeScheduledSources=new Set(),countInMetronomeSuspended=false,countInGeneration=0,countInActive=false;
let alphaTabResumePending=false;
const metronomeToggle=document.querySelector('#metronomeToggle'),metronomeVolume=document.querySelector('#metronomeVolume'),metronomeVolumeLabel=document.querySelector('#metronomeVolumeLabel'),metronomeSignature=document.querySelector('#metronomeSignature'),metronomeBeatView=document.querySelector('#metronomeBeat');
function metronomeClickAt(time,accent=false){
 if(!metronomeContext)metronomeContext=new (window.AudioContext||window.webkitAudioContext)();
 const osc=metronomeContext.createOscillator(),gain=metronomeContext.createGain(),vol=(+metronomeVolume.value||0)/100;
 osc.frequency.value=accent?1400:950;gain.gain.setValueAtTime(Math.max(.0001,vol*.22),time);gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
 osc.connect(gain).connect(metronomeContext.destination);metronomeScheduledSources.add(osc);osc.onended=()=>metronomeScheduledSources.delete(osc);osc.start(time);osc.stop(time+.05);
}
function paintMetronomeBeat(beat){
 const dots=[...metronomeBeatView.querySelectorAll('i')],beats=+metronomeSignature.value||4;
 dots.forEach((d,i)=>{d.hidden=i>=Math.min(4,beats);d.classList.toggle('active',i===beat%Math.min(4,beats));d.classList.toggle('accent',i===0&&i===beat%Math.min(4,beats))});
}
function metronomeScheduler(){
 if(!metronomeEnabled||!metronomeContext)return;
 const bpm=Math.max(20,+tempo.value||120),step=60/bpm,beats=+metronomeSignature.value||4;
 while(metronomeNextTime<metronomeContext.currentTime+.12){
  const beat=metronomeBeatIndex%beats;metronomeClickAt(metronomeNextTime,beat===0);
  const visualBeat=beat,visualGeneration=metronomeGeneration;setTimeout(()=>{if(visualGeneration===metronomeGeneration&&metronomeEnabled)paintMetronomeBeat(visualBeat)},Math.max(0,(metronomeNextTime-metronomeContext.currentTime)*1000));
  metronomeBeatIndex++;metronomeNextTime+=step;
 }
 metronomeTimer=setTimeout(metronomeScheduler,25);
}
async function startMetronome({afterScheduled=false}={}){
 const generation=metronomeGeneration;
 if(!metronomeContext)metronomeContext=new (window.AudioContext||window.webkitAudioContext)();
 if(metronomeContext.state==='suspended')await metronomeContext.resume();
 if(generation!==metronomeGeneration||!metronomeEnabled||countInActive)return;
 const now=metronomeContext.currentTime;
 const safeStart=afterScheduled&&metronomeNextTime>now?metronomeNextTime:now+.04;
 clearTimeout(metronomeTimer);metronomeBeatIndex=0;metronomeNextTime=safeStart;metronomeScheduler();
}
function stopMetronome(){metronomeGeneration++;clearTimeout(metronomeTimer);metronomeTimer=null;metronomeBeatIndex=0;for(const source of metronomeScheduledSources){try{source.stop()}catch(_){}}metronomeScheduledSources.clear();[...metronomeBeatView.querySelectorAll('i')].forEach(d=>d.classList.remove('active','accent'))}
metronomeToggle.onclick=async()=>{
 metronomeEnabled=!metronomeEnabled;metronomeToggle.classList.toggle('active',metronomeEnabled);metronomeToggle.textContent=metronomeEnabled?'♩ MÉTRONOME ON':'♩ MÉTRONOME OFF';
 // During count-in its own clock owns the clicks. Changing the metronome here
 // only changes whether the free-running metronome resumes with playback.
 if(countInActive){
  countInMetronomeSuspended=metronomeEnabled;
  if(!metronomeEnabled)stopMetronome();
  return;
 }
 if(metronomeEnabled)await startMetronome();else stopMetronome();
};
metronomeVolume.oninput=()=>metronomeVolumeLabel.textContent=metronomeVolume.value+'%';
metronomeSignature.onchange=()=>{
 metronomeBeatIndex=0;
 // The signature can define the fallback count-in plan when the score has no
 // usable meter metadata. Do not let an already armed count finish with the
 // previous signature while the UI displays the new one.
 if(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
  return;
 }
 if(metronomeEnabled){stopMetronome();startMetronome()}
};
function cancelPendingWistiaResume(){
 wistiaResumeGeneration++;
 if(!pendingWistiaResume)return;
 const {player,handler}=pendingWistiaResume;pendingWistiaResume=null;
 try{player?.unbind('play',handler)}catch(_){}
}
function cancelPracticeTransition({stopBackingAudio=false,stopVideo=false}={}){
 alphaTabResumePending=false;leadInResumePending=false;leadInRemainingMs=0;alphaTabMediaPreparing=false;mediaStartGeneration++;cancelPendingWistiaResume();cancelPendingWistiaReady();
 internalPlaybackPreparing=false;internalPlaybackGeneration++;
 countInGeneration++;countInActive=false;
 if(practiceTimer){clearTimeout(practiceTimer);practiceTimer=null;}
 const overlay=document.querySelector('#countInOverlay');if(overlay){overlay.classList.remove('active');overlay.hidden=true;}
 if(countInMetronomeSuspended){
  countInMetronomeSuspended=false;
  if(metronomeEnabled)startMetronome();
 }
 cancelDelayedPlayback();
 if(stopBackingAudio)stopBacking(false);
 if(stopVideo){
  if(practiceVideo&&!practiceVideo.paused)practiceVideo.pause();
  if(videoEnabled&&wistiaPlayer)pauseWistiaPracticeVideo();
 }
}
function countInThenPlay(api,startPlayback=()=>api.play()){
 const bars=Math.max(0,+countIn.value||0);
 const overlay=document.querySelector('#countInOverlay'),number=document.querySelector('#countInNumber');
 if(!bars){if(overlay)overlay.hidden=true;startPlayback();return}
 const loopBarIndex=practiceLoop?Math.max(0,(+loopStart.value||1)-1):0;
 const scoreBars=practiceScore?.masterBars?.length?practiceScore.masterBars:null,internalBars=!scoreBars?practiceBars():null;
 const fallbackBeats=Math.max(1,+metronomeSignature?.value||4),countPlan=[];
 // Build the preparation measure by measure. This keeps both its length and
 // downbeat accents correct when the score changes time signature near LOOP.
 for(let barOffset=0;barOffset<bars;barOffset++){
  const sourceBar=scoreBars?.[loopBarIndex+barOffset]??internalBars?.[loopBarIndex+barOffset];
  const barBeats=Math.max(1,+(sourceBar?.timeSignatureNumerator??sourceBar?.beats??fallbackBeats)||fallbackBeats);
  const beatUnit=Math.max(1,+(sourceBar?.timeSignatureDenominator??sourceBar?.beatType??4)||4);
  // Compound x/8 meters are felt in dotted-quarter pulses: 6/8 -> 2,
  // 9/8 -> 3, 12/8 -> 4. Keep simple meters on their written beat unit.
  const compound=beatUnit===8&&barBeats>=6&&barBeats%3===0;
  const pulseCount=compound?barBeats/3:barBeats,pulseQuarterLength=compound?1.5:(4/beatUnit);
  for(let b=0;b<pulseCount;b++)countPlan.push({accent:b===0,pulseQuarterLength});
 }
 const total=countPlan.length;
 let beat=0;clearTimeout(practiceTimer);practiceTimer=null;practiceStatus.textContent='Compte : '+total;
 if(overlay){overlay.hidden=false;overlay.classList.add('active')}if(number)number.textContent=String(total);
 // The count-in owns its clicks. Pause the free-running metronome so both
 // clocks cannot sound on top of each other, then restore it for playback.
 const generation=++countInGeneration;
 countInActive=true;
 countInMetronomeSuspended=metronomeEnabled;
 if(countInMetronomeSuspended)stopMetronome();
 const finishCountIn=()=>{
  countInActive=false;
  const restoreMetronome=countInMetronomeSuspended;
  countInMetronomeSuspended=false;
  if(restoreMetronome&&metronomeEnabled)startMetronome();
  startPlayback();
 };
 const scheduleCountBeat=()=>{
  // Re-read tempo before every beat so a manual tempo edit during count-in
  // immediately changes the remaining count instead of finishing at stale BPM.
  const pulseQuarterLength=Math.max(.125,+countPlan[beat]?.pulseQuarterLength||1);
  // Tempo is quarter-note based in Guitar Liberty. Simple meters scale from
  // their denominator; compound x/8 meters use one dotted-quarter pulse.
  const beatMs=(60000/Math.max(1,+tempo.value||120))*pulseQuarterLength;
  practiceTimer=setTimeout(()=>{
   practiceTimer=null;
   if(generation!==countInGeneration||!countInActive)return;
   beat++;
   if(beat>=total){
    practiceStatus.textContent='En cours';
    if(overlay){overlay.classList.remove('active');overlay.hidden=true}finishCountIn();return;
   }
   const remaining=total-beat;practiceStatus.textContent='Compte : '+remaining;if(number){number.textContent=String(remaining);number.classList.remove('pulse');void number.offsetWidth;number.classList.add('pulse')}
   metronomeClick(!!countPlan[beat]?.accent,generation);
   scheduleCountBeat();
  },beatMs);
 };
 // AudioContext.resume() is asynchronous on some systems. Do not start the
 // visual/timing countdown until its first audible click is ready, and ignore
 // completion if STOP or another transition cancelled this generation.
 Promise.resolve(metronomeClick(true,generation)).then(()=>{
  if(generation!==countInGeneration)return;
  scheduleCountBeat();
 });
}
countIn.onchange=()=>{
 // The count-in duration is part of the armed start contract. If it changes
 // while counting or waiting for accompaniment lead-in, discard that old start
 // and require an explicit PLAY so the new OFF/1/2-measure setting is honored.
 if(practiceLoop&&(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  const bars=Math.max(0,+countIn.value||0);
  practiceStatus.textContent=bars?'Prêt • pré-compte '+bars+' mesure'+(bars>1?'s':''):'Prêt • pré-compte OFF';
 }
};
loopToggle.onclick=()=>{
 const restartingSavedSession=!practiceLoop&&sessionHistorySaved&&sessionStarted;
 if(restartingSavedSession){resetTrainingSession();practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);}
 const completedSeries=!practiceLoop&&sessionStarted&&sessionFirstPracticeAt&&sessionPausedAt&&sessionSeriesCount&&practiceStatus.textContent.indexOf('Série terminée')===0;
 const internalTransportWasPlaying=!alphaTabMode&&playing;
 const internalTransportWasPreparing=!alphaTabMode&&internalPlaybackPreparing;
 // A normal internal playback interrupted to arm LOOP is a new loop series,
 // never a continuation of repetition progress from an older paused session.
 const resumingPausedSession=!practiceLoop&&!internalTransportWasPlaying&&!internalTransportWasPreparing&&sessionStarted&&sessionFirstPracticeAt&&sessionPausedAt&&sessionRepCount&&!completedSeries;
 const wasLooping=practiceLoop;
 if(internalTransportWasPreparing){
  internalPlaybackPreparing=false;internalPlaybackGeneration++;
  clearInternalTimer();stopAllVoices();
  document.querySelector('#play').textContent='▶ PLAY';
 }
 if(internalTransportWasPlaying){
  playing=false;clearInternalTimer();stopAllVoices();
  document.querySelector('#play').textContent='▶ PLAY';
  document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));
 }
 if(completedSeries){practiceIteration=0;updatePracticeProgress(0)}
 if(!practiceLoop&&!resumingPausedSession&&(+autoBpm.value||0)>0&&(+tempo.value||0)>=(+targetBpm.value||0)){
  practiceStatus.textContent='Objectif déjà atteint • '+(+tempo.value||0)+' BPM • augmente la cible pour continuer';
  loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');updatePracticeProgress(0);
  return;
 }
 practiceLoop=!practiceLoop;
 if(!resumingPausedSession)practiceIteration=0;
 if(practiceLoop&&!alphaTabMode){
  const range=internalLoopBounds(exercises[current]);
  if(range)index=range.start;
 }
 lastLoopTick=-1;updatePracticeProgress(resumingPausedSession?practiceIteration:0);loopToggle.textContent=practiceLoop?'↻ LOOP ON':'↻ LOOP OFF';loopToggle.classList.toggle('active',practiceLoop);
 if(!practiceLoop&&wasLooping)cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
 if(!practiceLoop&&wasLooping&&sessionStarted&&sessionFirstPracticeAt){
  pausePracticeClock();
  if(!sessionRepCount&&!sessionSeriesCount)resetTrainingSession();
 }
 const api=window.guitarLibertyAlphaTab;if(api){practiceLoop?setPracticeRange(api):clearPracticeRange(api)}
 if(!alphaTabMode&&internalTransportWasPlaying){
  if(practiceLoop){const range=internalLoopBounds(exercises[current]);if(range)index=range.start}
  else index=0;
  pausePracticeClock();
 }
 if(practiceLoop&&completedSeries){
  pausePracticeClock();
  practiceStatus.textContent='Nouvelle série prête • répétition 1/'+Math.max(1,+loopRepeats.value||1);
 }else if(practiceLoop&&sessionStarted&&sessionFirstPracticeAt&&sessionPausedAt&&sessionRepCount){
  practiceStatus.textContent='Prêt à reprendre • répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1);
 }else practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 paintSession();
};
autoBpm.onchange=()=>{
 autoBpm.value=Math.max(0,+autoBpm.value||0);
 if(practiceLoop&&(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Prêt • Auto BPM '+(+autoBpm.value>0?'+'+autoBpm.value:'désactivé');
 }
 if(sessionStarted&&sessionFirstPracticeAt){
  if(+autoBpm.value>0&&(+tempo.value||0)>=(+targetBpm.value||0)){
   practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
   pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
   const api=window.guitarLibertyAlphaTab;if(api){api.isLooping=false;try{api.pause()}catch(_){}}
   practiceStatus.textContent='Objectif atteint • '+(+tempo.value||0)+' BPM';
   if(sessionRepCount||sessionSeriesCount)saveCurrentSession();
  }else if(+autoBpm.value>0){
   practiceStatus.textContent=sessionPausedAt?'Prêt à reprendre • Auto BPM +'+autoBpm.value:'En cours • Auto BPM +'+autoBpm.value;
  }else{
   practiceStatus.textContent=sessionPausedAt?'Prêt à reprendre • Auto BPM désactivé':'En cours • Auto BPM désactivé';
  }
  updatePracticeProgress(practiceIteration);
  paintSession();
 }
};
targetBpm.onchange=()=>{
 targetBpm.value=Math.max(+tempo.min,Math.min(+tempo.max,+targetBpm.value||120));
 saveExerciseGoal(currentPracticeTitle,+targetBpm.value);
 if(practiceLoop&&(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Prêt • objectif '+targetBpm.value+' BPM';
 }
 const currentTempo=+tempo.value||0,target=+targetBpm.value||0,autoStep=+autoBpm.value||0;
 if(sessionStarted&&sessionFirstPracticeAt&&autoStep>0&&target<=currentTempo){
  practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
  pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const api=window.guitarLibertyAlphaTab;if(api){api.isLooping=false;try{api.pause()}catch(_){}}
  practiceStatus.textContent='Objectif atteint • '+currentTempo+' BPM';
  paintSession();
  if(sessionRepCount||sessionSeriesCount)saveCurrentSession();
 }else if(!practiceLoop&&practiceStatus.textContent.indexOf('Objectif déjà atteint')===0){
  practiceStatus.textContent=target>currentTempo?'Prêt • nouvel objectif '+target+' BPM':'Objectif déjà atteint • '+currentTempo+' BPM • augmente la cible pour continuer';
 }
 renderExerciseProgress();
};
loopRepeats.onchange=()=>{
 loopRepeats.value=Math.max(1,+loopRepeats.value||1);
 const target=+loopRepeats.value;
 // Changing the repetition target while a count-in/lead-in is armed changes the
 // series contract. Cancel the old transition so it cannot start under the new
 // target without an explicit PLAY from the user.
 if(practiceLoop&&(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Prêt • répétition '+(practiceIteration+1)+'/'+target;
 }
 if(!practiceLoop&&sessionHistorySaved&&sessionStarted){
  // The previous result is already in history. Changing the repetition target
  // prepares a genuinely new series instead of leaving the UI attached to the
  // completed/saved session.
  resetTrainingSession();practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);
  practiceStatus.textContent='Nouvelle série prête • 0/'+target+' répétitions';
  paintSession();
  return;
 }
 if(practiceLoop&&sessionStarted&&sessionFirstPracticeAt&&practiceIteration>=target){
  // Lowering the repetition target below already completed work completes the
  // current series; never rewrite history by moving the counter backwards.
  updatePracticeProgress(target);sessionSeriesCount++;practiceIteration=0;
  pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});playing=false;clearInternalTimer();stopAllVoices();
  const activeApi=window.guitarLibertyAlphaTab;
  if(activeApi){try{activeApi.pause()}catch(_){}}
  document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));
  const autoStep=advanceAutoBpm();
  if(autoStep){
   const {next,reached}=autoStep;
   if(reached){
    practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
    practiceStatus.textContent='Objectif atteint • '+next+' BPM';
    if(sessionRepCount||sessionSeriesCount)saveCurrentSession();
   }else{
    const nextRange=practiceTicks();
    if(activeApi&&nextRange){try{activeApi.tickPosition=nextRange.start}catch(_){}}
    if(!alphaTabMode){
     const internalRange=internalLoopBounds(exercises[current]);
     if(internalRange)index=internalRange.start;
    }
    lastLoopTick=-1;
    updatePracticeProgress(0);
    practiceStatus.textContent='Série terminée • nouveau tempo '+next+' BPM';
    if(alphaTabMode&&activeApi){
     countInThenPlay(activeApi,()=>{
      if(!practiceLoop||window.guitarLibertyAlphaTab!==activeApi)return;
      startAlphaPracticePlayback(activeApi,{restartAccompaniment:true});
     });
    }else{
     countInThenPlay(null,()=>{
      if(!practiceLoop||alphaTabMode)return;
      beginPracticePassage();
      playing=true;document.querySelector('#play').textContent='■ STOP';
      const loopLeadIn=internalLoopLeadInMs(exercises[current],internalRange);
      if(loopLeadIn>0)scheduleNext(loopLeadIn);else scheduleNext(tick());
     });
    }
   }
  }else{
   practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
   practiceStatus.textContent='Série terminée • '+target+' répétitions';
   if(sessionRepCount||sessionSeriesCount)saveCurrentSession();
  }
  paintSession();
  return;
 }
 updatePracticeProgress(practiceIteration);
 if(practiceLoop){
  if(sessionStarted&&sessionFirstPracticeAt){
   practiceStatus.textContent=(sessionPausedAt?'Prêt à reprendre':'En cours')+' • Répétition '+(practiceIteration+1)+'/'+target;
  }else{
   practiceStatus.textContent='Prêt • répétition '+(practiceIteration+1)+'/'+target;
  }
 }
};
[loopStart,loopEnd].forEach(el=>el.onchange=()=>{
 if(+loopEnd.value<+loopStart.value)loopEnd.value=loopStart.value;
 // A range edit defines a new practice task. Cancel any count-in/backing pickup
 // armed for the previous range before resetting counters or alphaTab bounds.
 const alphaApi=window.guitarLibertyAlphaTab;
 const rangePlaybackActive=practiceLoop&&(countInActive||backingStartTimer||playing||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing))||(alphaTabMode&&alphaApi?.playerState===1)||(practiceVideo&&!practiceVideo.paused)||isWistiaPlaying());
 if(rangePlaybackActive){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  if(alphaTabMode&&alphaApi){try{alphaApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
 }
 if(practiceLoop&&!alphaTabMode&&playing){
  playing=false;clearInternalTimer();stopAllVoices();
  document.querySelector('#play').textContent='▶ PLAY';
  document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));
  const range=internalLoopBounds(exercises[current]);if(range)index=range.start;
 }
 if(sessionStarted&&sessionFirstPracticeAt&&practiceLoop){
  // Changing the practiced measures defines a new training task, even if the
  // first repetition of the previous range had not finished yet.
  pausePracticeClock();
  resetTrainingSession();
  practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);
  practiceStatus.textContent='Nouvelle boucle • prêt';
 }else if(practiceLoop&&!alphaTabMode){
  pausePracticeClock();
  practiceStatus.textContent='Nouvelle boucle • prêt';
  paintSession();
 }
 const api=window.guitarLibertyAlphaTab;if(api&&practiceLoop)setPracticeRange(api)
});

function render(){
 const e=exercises[current];document.querySelector('#title').textContent=e.title;document.querySelector('#subtitle').textContent=e.subtitle;
 tempo.value=e.tempo;syncTempo();
 if(e.measures?.length){
  const measuresPerSystem=4,systemCount=Math.ceil(e.measures.length/measuresPerSystem);
  let html='<div class="score-systems">';
  for(let sys=0;sys<systemCount;sys++){
   const first=sys*measuresPerSystem,count=Math.min(measuresPerSystem,e.measures.length-first);
   html+='<div class="system"><div class="tab-word">TAB</div><div class="strings">';
   for(let s=0;s<6;s++)html+='<div class="string" style="top:'+(s*22)+'px"></div>';
   for(let m=0;m<count;m++){
    const md=e.measures[first+m],left=m/count*100,right=(m+1)/count*100,width=100/count;
    html+='<div class="measure-line" style="left:'+left+'%"></div><div class="measure-number" style="left:calc('+left+'% + 7px)">'+(first+m+1)+'</div>';
    if((sys===0&&m===0)||md.timeChanged)html+='<div class="time-signature measure-time" style="left:calc('+left+'% + 10px)">'+md.beats+'<br>'+md.beatType+'</div>';
    if(md.repeatStart)html+='<div class="repeat-mark repeat-start-mark" style="left:calc('+left+'% + 2px)"><b></b><i>:</i></div>';
    if(md.repeatEnd)html+='<div class="repeat-mark repeat-end-mark" style="left:calc('+right+'% - 10px)"><i>:</i><b></b></div>';
    if(md.text)html+='<div class="score-text" style="left:calc('+left+'% + 20px)">'+md.text+'</div>';
    const visualMeasureLength=Math.max(.001,+md.length||0);
    md.events.forEach(ev=>{
      const x=left+width*(ev.onset/visualMeasureLength);
      if(ev.type==='rest'){
       const whole=md.length>0&&Math.abs(ev.duration-md.length)<.02;
       html+='<span class="measure-rest '+(whole?'whole-rest':'timed-rest')+'" style="left:calc('+x+'% + '+(width*(ev.duration/visualMeasureLength)/2)+'%)">'+(whole?'𝄻':rhythmRestGlyph(ev.duration))+'</span>';return;
      }
      const y=ev.string*22,rg=rhythmGlyph(ev.duration,ev.typeName,ev.dots);
      html+='<span class="rhythm-glyph '+rg.cls+'" style="left:'+x+'%">'+rg.symbol+'</span><span class="pick" style="left:'+x+'%">'+(ev.pick||'')+'</span><span class="note" data-i="'+ev.noteIndex+'" style="left:'+x+'%;top:'+y+'px">'+ev.fret+'</span><span class="finger" style="left:'+x+'%">'+ev.finger+'</span>';
    });
   }
   html+='<div class="measure-line" style="left:100%"></div></div></div>';
  }
  html+='</div>';tab.innerHTML=html;
 }else{
  const n=e.notes.length,notesPerMeasure=4,measures=Math.max(1,Math.ceil(n/notesPerMeasure)),measuresPerSystem=4,systemCount=Math.ceil(measures/measuresPerSystem);
  let html='<div class="score-systems">';
  for(let sys=0;sys<systemCount;sys++){const fm=sys*measuresPerSystem,mc=Math.min(measuresPerSystem,measures-fm),fn=fm*4,ln=Math.min(n,(fm+mc)*4);html+='<div class="system"><div class="tab-word">TAB</div><div class="time-signature">4<br>4</div><div class="strings">';for(let s=0;s<6;s++)html+='<div class="string" style="top:'+(s*22)+'px"></div>';for(let m=0;m<=mc;m++){const x=m/mc*100;html+='<div class="measure-line" style="left:'+x+'%"></div>';}for(let i=fn;i<ln;i++){const v=e.notes[i],x=((i-fn)+.5)/(mc*4)*100,y=v[0]*22;html+='<span class="note" data-i="'+i+'" style="left:'+x+'%;top:'+y+'px">'+v[1]+'</span>';}html+='</div></div>';}html+='</div>';tab.innerHTML=html;
 }
 index=0;progress.style.width='0';
}
function rhythmGlyph(duration,typeName,dots=0){
 const type=typeName|| (duration>=4?'whole':duration>=2?'half':duration>=1?'quarter':duration>=.5?'eighth':duration>=.25?'16th':duration>=.125?'32nd':'64th');
 const map={whole:['𝅝','whole'],half:['𝅗𝅥','half'],quarter:['♩','quarter'],eighth:['♪','eighth'],'16th':['𝅘𝅥𝅯','sixteenth'],'32nd':['𝅘𝅥𝅰','thirtysecond'],'64th':['𝅘𝅥𝅱','sixtyfourth']};
 const v=map[type]||map.quarter; return {symbol:v[0]+('·'.repeat(dots)),cls:v[1]};
}
function rhythmRestGlyph(duration){if(duration>=2)return '𝄼';if(duration>=1)return '𝄽';if(duration>=.5)return '𝄾';if(duration>=.25)return '𝄿';return '𝅀'}
function syncTempo(){document.querySelector('#bpm').textContent=tempo.value+' BPM';document.querySelector('#scoreTempo').textContent='♩ = '+tempo.value}
function advanceAutoBpm({deferMetronome=false}={}){
 const inc=+autoBpm.value||0;if(!inc)return null;
 const goal=Math.max(+tempo.min,Math.min(+tempo.max,+targetBpm.value||+tempo.max));
 const next=Math.min(goal,(+tempo.value||0)+inc);
 tempo.value=next;syncTempo();
 if(videoEnabled)syncVideoTempo();
 const reached=next>=goal;
 if(metronomeEnabled){
  const scheduledThrough=metronomeNextTime;
  stopMetronome();metronomeNextTime=scheduledThrough;
  // Defer only when another Auto BPM series will actually follow. At the goal
  // there is no count-in to restore the clock, so keep the metronome alive.
  if(!deferMetronome||reached)startMetronome({afterScheduled:true});
 }
 return {next,reached};
}
function playNote(string,fret,holdBeats=null){
 ensureOutput();
 const voiceGeneration=internalVoiceGeneration;
 const attackGeneration=(stringAttackGeneration.get(string)||0)+1;
 stringAttackGeneration.set(string,attackGeneration);
 loadGuitarSample(string).then(buffer=>{
   // Sample loading is asynchronous on first use. A STOP/score transition that
   // happened while it was loading owns the newer generation and must not let
   // this stale attack create a ghost note afterwards.
   if(!buffer||voiceGeneration!==internalVoiceGeneration||stringAttackGeneration.get(string)!==attackGeneration||!playing)return;
   stopVoice(string,.018);
   const now=audio.currentTime,rate=2**(fret/12);
   const source=audio.createBufferSource(),gain=audio.createGain(),tone=audio.createBiquadFilter();
   source.buffer=buffer; source.playbackRate.value=rate;
   tone.type='lowpass';
   // Compensate some of the unnatural brightness caused by pitching an open string upward.
   tone.frequency.value=Math.max(4200,10500-fret*420); tone.Q.value=.12;
   const velocity=.72+(Math.random()*.10-.05);
   gain.gain.setValueAtTime(.0001,now);
   gain.gain.linearRampToValueAtTime(velocity,now+.004);
   // Ordinary notes keep the compact recorded decay, but an explicit tied hold
   // may use the full pitched sample lifetime instead of being cut at 4.8 s.
   const sourceLifetime=buffer.duration/rate,natural=Math.min(sourceLifetime,4.8),hasExplicitHold=Number.isFinite(+holdBeats),requestedHold=hasExplicitHold?Math.max(0,+holdBeats)*60000/Math.max(1,+tempo.value)/1000:null,releaseAt=Math.min(sourceLifetime,Math.max(.08,hasExplicitHold?requestedHold:natural));
   gain.gain.setValueAtTime(velocity,now+Math.min(.06,releaseAt*.15));
   gain.gain.exponentialRampToValueAtTime(.0001,now+releaseAt);
   source.connect(tone).connect(gain).connect(masterGain);
   activeVoices.set(string,{source,gain,startedAt:now,holdBeats:hasExplicitHold?Math.max(0,+holdBeats):0,scheduledBpm:Math.max(1,+tempo.value||120),naturalEnd:now+sourceLifetime});
   source.onended=()=>{if(activeVoices.get(string)?.source===source)activeVoices.delete(string)};
   source.start(now);
   // Keep the source available for its real lifetime. The gain envelope owns
   // the musical release, so a live tempo slowdown can extend a tied note as
   // far as the underlying sample actually allows.
   source.stop(now+sourceLifetime+.02);
 }).catch(err=>console.error('Guitar note playback unavailable:',GUITAR_SAMPLES[string],err));
}
function stop(){
 alphaTabResumePending=false;
 if(alphaTabMode&&window.guitarLibertyAlphaTab?.player){try{window.guitarLibertyAlphaTab.stop()}catch(e){}}
 cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
 internalVoiceGeneration++;
 stringAttackGeneration.clear();
 internalLoopBoundaryPending=false;internalLoopSeriesComplete=false;
 playing=false;clearInternalTimer();stopAllVoices();
 if(!alphaTabMode){
  const range=internalLoopBounds(exercises[current]);
  index=range?range.start:0;
 }
 document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'))
}
function musicXmlGracePercent(value){
 const percent=+value;
 return Number.isFinite(percent)&&percent>0?Math.min(100,percent):null;
}
function internalGraceStateKey(voice,staff,beat){return String(staff||'1')+'|'+String(voice||'1')+'|'+Number(beat).toPrecision(15)}
function internalGracePreviousQueue(key){
 const value=internalGracePreviousStates.get(key);
 return Array.isArray(value)?value:(value?[value]:[]);
}
function internalGracePreviousState(key,sourceIndex=null){
 const queue=internalGracePreviousQueue(key);
 if(sourceIndex!==null){
  const owned=queue.find(state=>state.sourceIndex===sourceIndex&&state.remainingEvents>0);
  if(owned)return owned;
 }
 return queue.find(state=>state.started&&state.remainingEvents>0)||null;
}
function internalConsumeGracePreviousState(key,state){
 state.started=true;
 state.remainingEvents=Math.max(0,(+state.remainingEvents||1)-1);
 if(state.remainingEvents>0)return;
 const queue=internalGracePreviousQueue(key).filter(item=>item!==state&&item.remainingEvents>0);
 if(queue.length)internalGracePreviousStates.set(key,queue);else internalGracePreviousStates.delete(key);
}
function internalResetGracePreviousBefore(key,sourceIndex){
 const queue=internalGracePreviousQueue(key).filter(state=>state.remainingEvents>0&&state.sourceIndex>sourceIndex);
 if(queue.length)internalGracePreviousStates.set(key,queue);else internalGracePreviousStates.delete(key);
}
function internalGraceGroup(e,at,onsetStart,onsetLimit,measureOffsets,beat){
 const anchor=e.notes[at],voice=String(anchor?.[9]||'1'),staff=String(anchor?.[10]||'1');
 let start=at;
 while(start>onsetStart){
  const previous=e.notes[start-1];
  const previousBeat=(measureOffsets[(+previous[4]||1)-1]||0)+(+previous[5]||0);
  if(Math.abs(previousBeat-beat)>1e-9||!previous[11])break;
  start--;
 }
 let end=start,events=0;
 while(end<onsetLimit){
  const note=e.notes[end];
  const noteBeat=(measureOffsets[(+note[4]||1)-1]||0)+(+note[5]||0);
  if(Math.abs(noteBeat-beat)>1e-9||!note[11])break;
  if(String(note[9]||'1')===voice&&String(note[10]||'1')===staff&&!note[12])events++;
  end++;
 }
 return {start,end,events:Math.max(1,events),voice,staff};
}
function internalPreviousVoiceNote(e,before,onsetStart,voice,staff){
 for(let i=before-1;i>=onsetStart;i--){
  const note=e.notes[i];
  if(note[11])continue;
  if(String(note[9]||'1')===voice&&String(note[10]||'1')===staff)return {note,index:i};
 }
 return null;
}
function internalGraceTiming(e,group,at=group.start,localOnly=false){
 const first=Math.max(group.start,at),limit=localOnly?Math.min(group.end,first+1):group.end;
 for(let graceIndex=first;graceIndex<limit;graceIndex++){
  const note=e.notes[graceIndex];
  if(note[12]||String(note[9]||'1')!==group.voice||String(note[10]||'1')!==group.staff)continue;
  const makeTime=+note[14],makeTimeDivisions=+note[18],
        stealPrevious=musicXmlGracePercent(note[15]),
        stealFollowing=musicXmlGracePercent(note[16]);
  if(Number.isFinite(makeTime)&&makeTime>0&&Number.isFinite(makeTimeDivisions)&&makeTimeDivisions>0)
   return {makeTime,makeTimeDivisions,stealPrevious:null,stealFollowing:null,sourceIndex:graceIndex};
  if(stealPrevious!==null||stealFollowing!==null)
   return {makeTime:null,makeTimeDivisions:null,stealPrevious,stealFollowing,sourceIndex:graceIndex};
 }
 return {makeTime:null,makeTimeDivisions:null,stealPrevious:null,stealFollowing:null,sourceIndex:null};
}
function internalGraceTimingEvents(e,group,timing){
 if(timing.sourceIndex===null)return group.events;
 let events=0;
 for(let i=timing.sourceIndex;i<group.end;i++){
  const note=e.notes[i];
  if(String(note[9]||'1')!==group.voice||String(note[10]||'1')!==group.staff||note[12])continue;
  if(i>timing.sourceIndex){
   const localTiming=internalGraceTiming(e,group,i,true);
   if(localTiming.sourceIndex===i)break;
  }
  events++;
 }
 return Math.max(1,events);
}
function internalGracePreviousWindow(e,group,timing,onsetStart,measureOffsets,beat){
 if(timing.stealPrevious===null)return null;
 const previous=internalPreviousVoiceNote(e,group.start,onsetStart,group.voice,group.staff);
 if(!previous)return null;
 const note=previous.note;
 const previousBeat=(measureOffsets[(+note[4]||1)-1]||0)+(+note[5]||0);
 const intervalBeats=Math.max(0,beat-previousBeat);
 // steal-time-previous is anchored to the immediately preceding musical
 // interval on this voice/staff. A tie-stop may be only the final segment of
 // a longer sounding tie, but the grace can steal only from the time actually
 // available between that segment's onset and this grace onset. Using that
 // real interval also prevents nominal MusicXML duration from crossing gaps.
 const availableBeats=Math.min(intervalBeats,Math.max(0,+note[3]||0));
 if(availableBeats<=0)return null;
 const stolenBeats=availableBeats*timing.stealPrevious/100;
 if(stolenBeats<=0)return null;
 return {previousIndex:previous.index,beats:stolenBeats};
}
function wallClockGraceDelay(ms){nextDelayWallClock=true;return ms}
function noteIntervalMs(){
 nextDelayWallClock=false;
 const e=exercises[current],v=e.notes[index];
 let beats=v?Math.max(.001,Number.isFinite(+v[6])?+v[6]:(Number.isFinite(+v[3])?+v[3]:0)):.5,eventEnd=index+1;
 if(v){
  const onsetRange=practiceLoop?internalLoopBounds(e):null,onsetLimit=onsetRange?onsetRange.end:e.notes.length;
  while(eventEnd<onsetLimit&&sameInternalOnset(v,e.notes[eventEnd]))eventEnd++;
  const next=eventEnd<onsetLimit?e.notes[eventEnd]:null;
  if(next){
   const measureOffsets=[];let total=0;
   e.measures?.forEach((md,i)=>{measureOffsets[i]=total;total+=+md.length||0});
   const here=(measureOffsets[(+v[4]||1)-1]||0)+(+v[5]||0),there=(measureOffsets[(+next[4]||1)-1]||0)+(+next[5]||0);
   // Grace notes do not consume MusicXML cursor time. Give a sequential grace
   // attack a short audible scheduler window without rewriting score duration.
   if(v[11]&&Math.abs(there-here)<1e-9){
    const parallelGracePaths=new Set();
    let parallelGraceDelay=0,parallelGraceWallClock=false;
    if(eventEnd>index+1){
     for(let graceIndex=index;graceIndex<eventEnd;graceIndex++){
      const graceNote=e.notes[graceIndex];
      if(!graceNote[11]||graceNote[12])continue;
      const pathKey=internalGraceStateKey(String(graceNote[9]||'1'),String(graceNote[10]||'1'),here);
      if(parallelGracePaths.has(pathKey))continue;
      parallelGracePaths.add(pathKey);
      const group=internalGraceGroup(e,graceIndex,onsetRange?onsetRange.start:0,onsetLimit,measureOffsets,here);
      const timing=internalGraceTiming(e,group,graceIndex,true);
      const hasLocalTiming=timing.sourceIndex===graceIndex;
      const previous=internalGracePreviousState(pathKey,hasLocalTiming?graceIndex:null);
      const ownsPreviousState=hasLocalTiming&&timing.stealPrevious!==null&&previous?.sourceIndex===graceIndex;
      if(hasLocalTiming){
       internalGraceForwardStates.delete(pathKey);
       if(!ownsPreviousState)internalResetGracePreviousBefore(pathKey,graceIndex);
       internalGraceFollowingDebts.delete(pathKey);
      }
      const forward=internalGraceForwardStates.get(pathKey);
      let branchMs=60,branchWallClock=true;
      if(!hasLocalTiming&&forward&&forward.voice===group.voice&&forward.staff===group.staff&&Math.abs(forward.beat-here)<1e-9){
       branchMs=Math.max(forward.minMs,Math.min(250,60000/Math.max(1,+tempo.value||120)*forward.perGraceBeats));
       forward.remainingEvents=Math.max(0,(+forward.remainingEvents||1)-1);
       if(forward.remainingEvents<=0)internalGraceForwardStates.delete(pathKey);
      }else if((!hasLocalTiming||ownsPreviousState)&&previous&&previous.voice===group.voice&&previous.staff===group.staff&&Math.abs(previous.beat-here)<1e-9){
       branchMs=60000/Math.max(1,+tempo.value||120)*previous.perGraceBeats;
       branchWallClock=false;
       internalConsumeGracePreviousState(pathKey,previous);
      }else if(timing.makeTime!==null){
       const graceEvents=internalGraceTimingEvents(e,group,timing);
       const perGraceBeats=(timing.makeTime/timing.makeTimeDivisions)/graceEvents;
       const currentBpm=Math.max(1,+tempo.value||120);
       branchMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
       const scheduledPerGraceBeats=branchMs*currentBpm/60000;
       internalGracePreviousStates.delete(pathKey);
       internalGraceFollowingDebts.delete(pathKey);
       if(graceEvents>1)internalGraceForwardStates.set(pathKey,{perGraceBeats:scheduledPerGraceBeats,remainingEvents:graceEvents-1,voice:group.voice,staff:group.staff,beat:here,minMs:20});else internalGraceForwardStates.delete(pathKey);
      }else if(timing.stealFollowing!==null){
       const graceEvents=internalGraceTimingEvents(e,group,timing);
       let principal=null;
       for(let principalIndex=group.end;principalIndex<onsetLimit;principalIndex++){
        const candidate=e.notes[principalIndex];
        const candidateBeat=(measureOffsets[(+candidate[4]||1)-1]||0)+(+candidate[5]||0);
        if(Math.abs(candidateBeat-here)>1e-9)break;
        if(candidate[11])continue;
        if(String(candidate[9]||'1')===group.voice&&String(candidate[10]||'1')===group.staff){principal=candidate;break}
       }
       if(principal&&graceEvents>0){
        const principalDuration=Math.max(0,+principal[3]||0);
        if(principalDuration>0){
         const ornamentBeats=principalDuration*timing.stealFollowing/100;
         const perGraceBeats=ornamentBeats/graceEvents;
         const currentBpm=Math.max(1,+tempo.value||120);
         branchMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
         const scheduledPerGraceBeats=branchMs*currentBpm/60000;
         const scheduledOrnamentBeats=scheduledPerGraceBeats*graceEvents;
         internalGracePreviousStates.delete(pathKey);
         const existingFollowingDebt=internalGraceFollowingDebts.get(pathKey);
         internalGraceFollowingDebts.set(pathKey,{beats:Math.min(principalDuration,(existingFollowingDebt?.beats||0)+scheduledOrnamentBeats),voice:group.voice,staff:group.staff,beat:here});
         if(graceEvents>1)internalGraceForwardStates.set(pathKey,{perGraceBeats:scheduledPerGraceBeats,remainingEvents:graceEvents-1,voice:group.voice,staff:group.staff,beat:here,minMs:20});else internalGraceForwardStates.delete(pathKey);
        }
       }
      }
      if(branchMs>parallelGraceDelay||branchMs===parallelGraceDelay&&branchWallClock){parallelGraceDelay=branchMs;parallelGraceWallClock=branchWallClock;}
     }
     if(parallelGracePaths.size>1)return parallelGraceWallClock?wallClockGraceDelay(parallelGraceDelay):parallelGraceDelay;
    }
    const graceGroup=internalGraceGroup(e,index,onsetRange?onsetRange.start:0,onsetLimit,measureOffsets,here);
    // Resolve grace timing once for the whole voice/staff group. This keeps
    // make-time and both steal-time attributes on the same source-order rule.
    const graceTiming=internalGraceTiming(e,graceGroup,index,true);
    const hasLocalTiming=graceTiming.sourceIndex===index;
    const graceStateKey=internalGraceStateKey(graceGroup.voice,graceGroup.staff,here);
    const previousState=internalGracePreviousState(graceStateKey,hasLocalTiming?index:null);
    const ownsPreviousState=hasLocalTiming&&graceTiming.stealPrevious!==null&&previousState?.sourceIndex===index;
    if(hasLocalTiming){
     internalGraceForwardStates.delete(graceStateKey);
     if(!ownsPreviousState)internalResetGracePreviousBefore(graceStateKey,index);
     internalGraceFollowingDebts.delete(graceStateKey);
    }
    const forwardState=internalGraceForwardStates.get(graceStateKey);
    if(!hasLocalTiming&&forwardState&&forwardState.voice===graceGroup.voice&&forwardState.staff===graceGroup.staff&&Math.abs(forwardState.beat-here)<1e-9){
     const forwardMs=Math.max(forwardState.minMs,Math.min(250,60000/Math.max(1,+tempo.value||120)*forwardState.perGraceBeats));
     forwardState.remainingEvents=Math.max(0,(+forwardState.remainingEvents||1)-1);
     if(forwardState.remainingEvents<=0)internalGraceForwardStates.delete(graceStateKey);
     return wallClockGraceDelay(forwardMs);
    }
    if((!hasLocalTiming||ownsPreviousState)&&previousState&&
       previousState.voice===graceGroup.voice&&previousState.staff===graceGroup.staff&&
       Math.abs(previousState.beat-here)<1e-9){
     const previousMs=60000/Math.max(1,+tempo.value||120)*previousState.perGraceBeats;
     internalConsumeGracePreviousState(graceStateKey,previousState);
     return previousMs;
    }
    if(graceTiming.makeTime!==null){
     const graceEvents=internalGraceTimingEvents(e,graceGroup,graceTiming);
     const perGraceBeats=(graceTiming.makeTime/graceTiming.makeTimeDivisions)/graceEvents;
     const currentBpm=Math.max(1,+tempo.value||120);
     const scheduledPerGraceMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
     const scheduledPerGraceBeats=scheduledPerGraceMs*currentBpm/60000;
     internalGracePreviousStates.delete(graceStateKey);
     // A local make-time segment owns this path's grace timing. Do not let a
     // steal-time-following debt armed by an earlier segment shorten the
     // principal after make-time has taken priority at the same onset.
     internalGraceFollowingDebts.delete(graceStateKey);
     if(graceEvents>1)internalGraceForwardStates.set(graceStateKey,{perGraceBeats:scheduledPerGraceBeats,remainingEvents:graceEvents-1,voice:graceGroup.voice,staff:graceGroup.staff,beat:here,minMs:20});else internalGraceForwardStates.delete(graceStateKey);
     return wallClockGraceDelay(scheduledPerGraceMs);
    }
    // MusicXML steal-time-following is a percentage of the following
    // principal note. Treat it as one ornament window shared by all
    // sequential grace attacks at this same score onset.
    const stealFollowing=graceTiming.stealFollowing;
    const graceEvents=internalGraceTimingEvents(e,graceGroup,graceTiming);
    // In polyphonic MusicXML the first note after the grace cluster can belong
    // to another staff/voice. Bind steal-time-following to the principal note
    // of the same musical path as the grace anchor.
    const graceVoice=String(v[9]||'1'),graceStaff=String(v[10]||'1');
    let principal=null;
    for(let principalIndex=graceGroup.end;principalIndex<onsetLimit;principalIndex++){
     const candidate=e.notes[principalIndex];
     const candidateBeat=(measureOffsets[(+candidate[4]||1)-1]||0)+(+candidate[5]||0);
     if(Math.abs(candidateBeat-here)>1e-9)break;
     if(candidate[11])continue;
     if(String(candidate[9]||'1')===graceVoice&&String(candidate[10]||'1')===graceStaff){principal=candidate;break}
    }
    if(principal&&stealFollowing!==null&&graceEvents>0){
     const principalBeat=(measureOffsets[(+principal[4]||1)-1]||0)+(+principal[5]||0);
     if(Math.abs(principalBeat-here)<1e-9){
      const principalDuration=Math.max(0,+principal[3]||0);
      if(principalDuration>0){
       const ornamentBeats=principalDuration*stealFollowing/100;
       // Keep metadata-driven grace timing audible but bounded. Store the
       // effective scheduled window as the sustain debt too, so the 250 ms
       // scheduler cap cannot shorten the principal by more time than the
       // grace attacks actually consumed.
       const perGraceBeats=ornamentBeats/graceEvents;
       const currentBpm=Math.max(1,+tempo.value||120);
       const scheduledPerGraceMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
       const scheduledOrnamentBeats=scheduledPerGraceMs*currentBpm/60000*graceEvents;
       internalGracePreviousStates.delete(graceStateKey);
       const existingFollowingDebt=internalGraceFollowingDebts.get(graceStateKey);
       internalGraceFollowingDebts.set(graceStateKey,{
        beats:Math.min(principalDuration,(existingFollowingDebt?.beats||0)+scheduledOrnamentBeats),
        voice:graceGroup.voice,
        staff:graceGroup.staff,
        beat:here
       });
       if(graceEvents>1)internalGraceForwardStates.set(graceStateKey,{perGraceBeats:scheduledOrnamentBeats/graceEvents,remainingEvents:graceEvents-1,voice:graceGroup.voice,staff:graceGroup.staff,beat:here,minMs:20});else internalGraceForwardStates.delete(graceStateKey);
       return wallClockGraceDelay(scheduledPerGraceMs);
      }
     }
    }
    return wallClockGraceDelay(60);
   }
   beats=Math.max(.001,there-here);
   // Several voices may own independent grace groups at this same onset.
   // Arm each eligible steal-time-previous path, but advance the single
   // scheduler only by the largest requested window rather than summing them.
   if(!v[11]&&next[11]){
    const graceBlock=internalGraceGroup(e,eventEnd,onsetRange?onsetRange.start:0,onsetLimit,measureOffsets,there);
    const pendingPreviousStates=[];
    const previousBeatsByPath=new Map();
    let sharedPreRollBeats=0;
    for(let graceIndex=graceBlock.start;graceIndex<graceBlock.end;graceIndex++){
     const graceNote=e.notes[graceIndex];
     if(!graceNote[11]||graceNote[12])continue;
     const graceVoice=String(graceNote[9]||'1'),graceStaff=String(graceNote[10]||'1');
     const pathKey=internalGraceStateKey(graceVoice,graceStaff,there);
     const nextGroup=internalGraceGroup(e,graceIndex,onsetRange?onsetRange.start:0,onsetLimit,measureOffsets,there);
     const nextTiming=internalGraceTiming(e,nextGroup,graceIndex,true);
     if(nextTiming.sourceIndex!==graceIndex||nextTiming.stealPrevious===null)continue;
     const previousWindow=internalGracePreviousWindow(e,nextGroup,nextTiming,onsetRange?onsetRange.start:0,measureOffsets,there);
     if(!previousWindow||previousWindow.previousIndex<index||previousWindow.previousIndex>=eventEnd)continue;
     const requestedBeats=Math.min(previousWindow.beats,Math.max(0,beats-.001));
     if(requestedBeats<=0)continue;
     const graceEvents=internalGraceTimingEvents(e,nextGroup,nextTiming);
     pendingPreviousStates.push({key:pathKey,beats:requestedBeats,graceEvents,voice:nextGroup.voice,staff:nextGroup.staff,sourceIndex:nextTiming.sourceIndex});
     previousBeatsByPath.set(pathKey,(previousBeatsByPath.get(pathKey)||0)+requestedBeats);
    }
    previousBeatsByPath.forEach(pathBeats=>{sharedPreRollBeats=Math.max(sharedPreRollBeats,Math.min(pathBeats,Math.max(0,beats-.001)))});
    if(sharedPreRollBeats>0){
     const queues=new Map();
     pendingPreviousStates.forEach(state=>{
      const pathTotal=previousBeatsByPath.get(state.key)||state.beats;
      const pathBudget=Math.min(pathTotal,Math.max(0,beats-.001));
      const scaledBeats=pathTotal>0?state.beats*pathBudget/pathTotal:0;
      if(scaledBeats<=0)return;
      const queue=queues.get(state.key)||[];
      queue.push({perGraceBeats:scaledBeats/state.graceEvents,remainingEvents:state.graceEvents,voice:state.voice,staff:state.staff,beat:there,sourceIndex:state.sourceIndex,started:false});
      queues.set(state.key,queue);
     });
     queues.forEach((queue,key)=>internalGracePreviousStates.set(key,queue.sort((a,b)=>a.sourceIndex-b.sourceIndex)));
     beats-=sharedPreRollBeats;
    }
   }
  }
 }
 if(e?.measures?.length&&v){
  const range=practiceLoop?internalLoopBounds(e):null;
  const atLoopEnd=!!(range&&eventEnd>=range.end);
  const atScoreEnd=!practiceLoop&&eventEnd>=e.notes.length;
  if(atLoopEnd||atScoreEnd){
   const measureOffsets=[];let total=0;
   e.measures.forEach((md,i)=>{measureOffsets[i]=total;total+=+md.length||0});
   const endBeat=atLoopEnd
    ?(measureOffsets[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]||0)+(+e.measures[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]?.length||0)
    :total;
   const noteBeat=(measureOffsets[(+v[4]||1)-1]||0)+(+v[5]||0);
   const remaining=Math.max(0,endBeat-noteBeat);
   if(v[11]&&remaining<1e-9){
    // Terminal grace attacks from different voice/staff paths are parallel.
    // Resolve each path independently, then let the shared scheduler wait for
    // the longest branch instead of letting array order choose the boundary.
    let terminalGraceDelay=0,terminalGraceWallClock=false;
    const terminalGracePaths=new Set();
    const terminalLimit=range?range.end:e.notes.length;
    for(let graceIndex=index;graceIndex<terminalLimit;graceIndex++){
     const graceNote=e.notes[graceIndex];
     const graceBeat=(measureOffsets[(+graceNote[4]||1)-1]||0)+(+graceNote[5]||0);
     if(Math.abs(graceBeat-noteBeat)>1e-9)break;
     if(!graceNote[11]||graceNote[12])continue;
     const pathKey=internalGraceStateKey(String(graceNote[9]||'1'),String(graceNote[10]||'1'),noteBeat);
     if(terminalGracePaths.has(pathKey))continue;
     terminalGracePaths.add(pathKey);
     const group=internalGraceGroup(e,graceIndex,range?range.start:0,terminalLimit,measureOffsets,noteBeat);
     const timing=internalGraceTiming(e,group,graceIndex,true);
     const hasLocalTiming=timing.sourceIndex===graceIndex;
     const previous=internalGracePreviousState(pathKey,hasLocalTiming?graceIndex:null);
     const ownsPreviousState=hasLocalTiming&&timing.stealPrevious!==null&&previous?.sourceIndex===graceIndex;
      if(hasLocalTiming){
       internalGraceForwardStates.delete(pathKey);
       if(!ownsPreviousState)internalResetGracePreviousBefore(pathKey,graceIndex);
       internalGraceFollowingDebts.delete(pathKey);
      }
     const forward=internalGraceForwardStates.get(pathKey);
     let branchMs=60,branchWallClock=true;
     if(!hasLocalTiming&&forward&&forward.voice===group.voice&&forward.staff===group.staff&&Math.abs(forward.beat-noteBeat)<1e-9){
      branchMs=Math.max(forward.minMs,Math.min(250,60000/Math.max(1,+tempo.value||120)*forward.perGraceBeats));
      forward.remainingEvents=Math.max(0,(+forward.remainingEvents||1)-1);
      if(forward.remainingEvents<=0)internalGraceForwardStates.delete(pathKey);
     }else if((!hasLocalTiming||ownsPreviousState)&&previous&&previous.voice===group.voice&&previous.staff===group.staff&&Math.abs(previous.beat-noteBeat)<1e-9){
      branchMs=60000/Math.max(1,+tempo.value||120)*previous.perGraceBeats;
      branchWallClock=false;
      internalConsumeGracePreviousState(pathKey,previous);
     }else if(timing.makeTime!==null){
      const graceEvents=internalGraceTimingEvents(e,group,timing);
      const perGraceBeats=(timing.makeTime/timing.makeTimeDivisions)/graceEvents;
      const currentBpm=Math.max(1,+tempo.value||120);
      branchMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
      const scheduledPerGraceBeats=branchMs*currentBpm/60000;
      internalGracePreviousStates.delete(pathKey);
      internalGraceFollowingDebts.delete(pathKey);
      if(graceEvents>1)internalGraceForwardStates.set(pathKey,{perGraceBeats:scheduledPerGraceBeats,remainingEvents:graceEvents-1,voice:group.voice,staff:group.staff,beat:noteBeat,minMs:20});else internalGraceForwardStates.delete(pathKey);
     }
     if(branchMs>terminalGraceDelay||branchMs===terminalGraceDelay&&branchWallClock){terminalGraceDelay=branchMs;terminalGraceWallClock=branchWallClock;}
    }
    if(terminalGracePaths.size>1)return terminalGraceWallClock?wallClockGraceDelay(terminalGraceDelay):terminalGraceDelay;
    const graceGroup=internalGraceGroup(e,index,range?range.start:0,range?range.end:e.notes.length,measureOffsets,noteBeat);
    const graceTiming=internalGraceTiming(e,graceGroup,index,true);
    const hasLocalTiming=graceTiming.sourceIndex===index;
    const graceStateKey=internalGraceStateKey(graceGroup.voice,graceGroup.staff,noteBeat);
    const previousState=internalGracePreviousState(graceStateKey,hasLocalTiming?index:null);
    const ownsPreviousState=hasLocalTiming&&graceTiming.stealPrevious!==null&&previousState?.sourceIndex===index;
    if(hasLocalTiming){
     internalGraceForwardStates.delete(graceStateKey);
     if(!ownsPreviousState)internalResetGracePreviousBefore(graceStateKey,index);
     internalGraceFollowingDebts.delete(graceStateKey);
    }
    const forwardState=internalGraceForwardStates.get(graceStateKey);
    if(!hasLocalTiming&&forwardState&&
       forwardState.voice===graceGroup.voice&&forwardState.staff===graceGroup.staff&&
       Math.abs(forwardState.beat-noteBeat)<1e-9){
     const forwardMs=Math.max(forwardState.minMs,Math.min(250,60000/Math.max(1,+tempo.value||120)*forwardState.perGraceBeats));
     forwardState.remainingEvents=Math.max(0,(+forwardState.remainingEvents||1)-1);
     if(forwardState.remainingEvents<=0)internalGraceForwardStates.delete(graceStateKey);
     return wallClockGraceDelay(forwardMs);
    }
    if((!hasLocalTiming||ownsPreviousState)&&previousState&&
       previousState.voice===graceGroup.voice&&previousState.staff===graceGroup.staff&&
       Math.abs(previousState.beat-noteBeat)<1e-9){
     const previousMs=60000/Math.max(1,+tempo.value||120)*previousState.perGraceBeats;
     internalConsumeGracePreviousState(graceStateKey,previousState);
     return previousMs;
    }
    if(graceTiming.makeTime!==null){
     const graceEvents=internalGraceTimingEvents(e,graceGroup,graceTiming);
     const perGraceBeats=(graceTiming.makeTime/graceTiming.makeTimeDivisions)/graceEvents;
     const currentBpm=Math.max(1,+tempo.value||120);
     const scheduledPerGraceMs=Math.max(20,Math.min(250,60000/currentBpm*perGraceBeats));
     const scheduledPerGraceBeats=scheduledPerGraceMs*currentBpm/60000;
     internalGracePreviousStates.delete(graceStateKey);
     // A local make-time segment owns this path's grace timing. Do not let a
     // steal-time-following debt armed by an earlier segment shorten the
     // principal after make-time has taken priority at the same onset.
     internalGraceFollowingDebts.delete(graceStateKey);
     if(graceEvents>1)internalGraceForwardStates.set(graceStateKey,{perGraceBeats:scheduledPerGraceBeats,remainingEvents:graceEvents-1,voice:graceGroup.voice,staff:graceGroup.staff,beat:noteBeat,minMs:20});else internalGraceForwardStates.delete(graceStateKey);
     return wallClockGraceDelay(scheduledPerGraceMs);
    }
    return wallClockGraceDelay(60);
   }
   beats=Math.max(.001,remaining);
  }
 }
 return 60000/+tempo.value*beats
}
function scheduleNext(delayMs){
 const wallClock=nextDelayWallClock;
 nextDelayWallClock=false;
 clearInternalTimer({preserveBoundary:true});
 if(playing&&Number.isFinite(delayMs)){
  const schedulerGeneration=internalSchedulerGeneration;
  timerStartedAt=performance.now();timerDelayMs=Math.max(0,delayMs);timerScheduledBpm=Math.max(1,+tempo.value||120);timerWallClock=wallClock;
  timer=setTimeout(()=>{
   timer=null;timerStartedAt=0;timerDelayMs=0;timerScheduledBpm=0;timerWallClock=false;
   if(!playing||schedulerGeneration!==internalSchedulerGeneration)return;
   const nextDelay=tick();
   // tick() can take ownership of scheduling (notably an Auto BPM restart
   // with count-in OFF). Do not clear that newly armed timer afterwards.
   if(Number.isFinite(nextDelay))scheduleNext(nextDelay);
  },timerDelayMs)
 }
}
function internalLoopBounds(e){
 if(!practiceLoop||!e?.measures?.length)return null;
 syncPracticeRange();
 const startMeasure=+loopStart.value||1,endMeasure=+loopEnd.value||startMeasure;
 const start=e.notes.findIndex(n=>(+n[4]||1)>=startMeasure&&(+n[4]||1)<=endMeasure);
 if(start<0)return null;
 let end=e.notes.findIndex((n,i)=>i>=start&&(+n[4]||1)>endMeasure);
 if(end<0)end=e.notes.length;
 return {start,end};
}
function internalLoopLeadInMs(e,range){
 if(!range||!e?.measures?.length)return 0;
 const first=e.notes[range.start];if(!first)return 0;
 const startMeasure=Math.max(1,+loopStart.value||1),firstMeasure=Math.max(startMeasure,+first[4]||startMeasure);
 let beats=0;
 for(let m=startMeasure;m<firstMeasure;m++)beats+=+e.measures[m-1]?.length||0;
 beats+=+first[5]||0;
 return Math.max(0,60000/Math.max(1,+tempo.value||120)*beats);
}
function internalScoreLeadInMs(e){
 if(!e?.notes?.length||!e?.measures?.length)return 0;
 const first=e.notes[0],firstMeasure=Math.max(1,+first[4]||1);
 let beats=0;
 for(let m=1;m<firstMeasure;m++)beats+=+e.measures[m-1]?.length||0;
 beats+=+first[5]||0;
 return Math.max(0,60000/Math.max(1,+tempo.value||120)*beats);
}
function sameInternalOnset(a,b,e=exercises[current]){
 if(!a||!b)return false;
 // Consecutive grace notes on one voice/staff are sequential. Grace notes on
 // different paths may form a parallel layer when import assigned the same
 // per-path grace rank in slot 19.
 if(a[11]||b[11]){
  if(!(a[11]&&b[11]))return false;
  const differentPath=String(a[9]||'1')!==String(b[9]||'1')||String(a[10]||'1')!==String(b[10]||'1');
  const sameGraceLayer=differentPath&&Number.isFinite(+a[19])&&Number.isFinite(+b[19])&&+a[19]===+b[19];
  if(!b[12]&&!sameGraceLayer)return false;
 }
 if(e?.measures?.length){
  let aBeat=+a[5]||0,bBeat=+b[5]||0;
  for(let m=1;m<(+a[4]||1);m++)aBeat+=+e.measures[m-1]?.length||0;
  for(let m=1;m<(+b[4]||1);m++)bBeat+=+e.measures[m-1]?.length||0;
  return Math.abs(aBeat-bBeat)<1e-9;
 }
 return (+a[4]||1)===(+b[4]||1)&&Math.abs((+a[5]||0)-(+b[5]||0))<1e-9;
}
function tick(){
 const e=exercises[current];
 if(internalLoopBoundaryPending){
  // We have now reached the musical loop boundary. End any sustain and any
  // grace pre-roll debt from the previous pass before the next pass attacks.
  internalLoopBoundaryPending=false;
  internalGracePreviousStates.clear();
  internalGraceForwardStates.clear();
  internalGraceFollowingDebts.clear();
  stopAllVoices();
  if(internalLoopSeriesComplete){
   internalLoopSeriesComplete=false;
   const max=Math.max(1,+loopRepeats.value||1);
   updatePracticeProgress(max);sessionSeriesCount++;paintSession();practiceIteration=0;
   const autoStep=advanceAutoBpm({deferMetronome:Math.max(0,+countIn.value||0)>0});
   if(autoStep){
    const {next,reached}=autoStep;
    if(reached){practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');pausePracticeClock();playing=false;clearInternalTimer();document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));practiceStatus.textContent='Objectif atteint • '+next+' BPM';if(sessionRepCount||sessionSeriesCount)saveCurrentSession();return}
    playing=false;clearInternalTimer();index=internalLoopBounds(e)?.start??index;
    countInThenPlay(null,()=>{
     if(!practiceLoop)return;
     beginPracticePassage();playing=true;document.querySelector('#play').textContent='■ STOP';
     const range=internalLoopBounds(exercises[current]);
     const loopLeadIn=internalLoopLeadInMs(exercises[current],range);
     if(loopLeadIn>0)scheduleNext(loopLeadIn);else scheduleNext(tick());
    });
    return;
   }
   practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');pausePracticeClock();playing=false;clearInternalTimer();document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));practiceStatus.textContent='Série terminée • '+max+' répétitions';if(sessionRepCount||sessionSeriesCount)saveCurrentSession();return;
  }
 }
 if(!practiceLoop&&index>=e.notes.length){
  index=0;playing=false;clearInternalTimer();stopAllVoices();
  document.querySelector('#play').textContent='▶ PLAY';
  document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'));
  const paper=document.querySelector('.paper');if(paper)paper.scrollTo({top:0,behavior:'smooth'});
  return;
 }
 const internalRange=internalLoopBounds(e);
 if(internalRange&&(index<internalRange.start||index>=internalRange.end))index=internalRange.start;
 // The delay belongs to the event that will actually be played. Normalize the
 // loop cursor first so a stale/out-of-range index cannot donate its timing to
 // the first event of the selected loop.
 const eventDelay=noteIntervalMs();
 const eventStart=index,eventNotes=[e.notes[eventStart]];
 // Once the first non-grace event is reached, the anticipated window has
 // been fully consumed and must not leak into later ornaments.
 // Polyphonic grace state is cleared per principal path after this event.
 let eventEnd=eventStart+1;
 while(eventEnd<e.notes.length&&(!internalRange||eventEnd<internalRange.end)&&sameInternalOnset(e.notes[eventStart],e.notes[eventEnd])){eventNotes.push(e.notes[eventEnd]);eventEnd++}
 const notes=document.querySelectorAll('.note');
 notes.forEach(n=>n.classList.toggle('active',+n.dataset.i>=eventStart&&+n.dataset.i<eventEnd));
 const active=document.querySelector('.note.active');
 if(active){
  const paper=document.querySelector('.paper'),system=active.closest('.system');
  if(paper&&system){
   const paperRect=paper.getBoundingClientRect(),systemRect=system.getBoundingClientRect();
   const visibleTop=paperRect.top+28, visibleBottom=paperRect.bottom-28;
   if(systemRect.top<visibleTop || systemRect.bottom>visibleBottom){
    const target=Math.max(0,paper.scrollTop+(systemRect.top-paperRect.top)-28);
    paper.scrollTo({top:target,behavior:'smooth'});
   }
  }
 }
 eventNotes.forEach((v,eventOffset)=>{
  // A tie-stop normally has no new attack. At the first event of an isolated
  // LOOP, however, its original attack may live before loopStart; retrigger it
  // so every repetition can be heard independently.
  const loopBoundaryAttack=!!(practiceLoop&&internalRange&&eventStart===internalRange.start);
  if(v[7]&&!loopBoundaryAttack)return;
  const [s,f]=v;let holdBeats=+v[3]||0;
  const measureOffsets=[];let total=0;
  if(e?.measures?.length)e.measures.forEach((md,i)=>{measureOffsets[i]=total;total+=+md.length||0});
  const absoluteBeat=n=>(measureOffsets[(+n[4]||1)-1]||0)+(+n[5]||0);
  if(v[8]){
   // Use the exact score position rather than Array.indexOf(): polyphonic
   // chords may contain equivalent note arrays and every string must extend
   // its own tie chain from the note that actually sounded.
   let tieIndex=eventStart+eventOffset+1;
   const tieLimit=internalRange?internalRange.end:e.notes.length;
   const tieBoundaryBeat=internalRange
    ?(measureOffsets[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]||0)+(+e.measures[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]?.length||0)
    :total;
   let expectedTieBeat=absoluteBeat(v)+(+v[3]||0);
   while(tieIndex<tieLimit){
    const tied=e.notes[tieIndex];
    if(absoluteBeat(tied)>tieBoundaryBeat+1e-9)break;
    if((+tied[0]||0)!==+s){tieIndex++;continue}
    // Other polyphonic voices/staves are independent paths, even when they use
    // the same physical string. Ignore them while looking for this tie's continuation.
    if(String(tied[9]||'1')!==String(v[9]||'1')||String(tied[10]||'1')!==String(v[10]||'1')){tieIndex++;continue}
    // A valid tie continuation must begin where the preceding segment ends.
    // Never sustain across a rest/gap just because a later note has tie-stop.
    if((+tied[1]||0)!==+f||!tied[7]||Math.abs(absoluteBeat(tied)-expectedTieBeat)>.02)break;
    holdBeats+=+tied[3]||0;
    expectedTieBeat=absoluteBeat(tied)+(+tied[3]||0);
    if(!tied[8])break;
    tieIndex++;
   }
  }
  if(e?.measures?.length){
   // Imported MusicXML can contain irregular nominal durations. Never let a
   // tied sustain outlive the real score/LOOP boundary derived from positions.
   const attackBeat=absoluteBeat(v);
   const boundaryBeat=internalRange
    ?(measureOffsets[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]||0)+(+e.measures[Math.max(+loopStart.value||1,+loopEnd.value||1)-1]?.length||0)
    :total;
   holdBeats=Math.min(holdBeats,Math.max(0,boundaryBeat-attackBeat));
  }
  const principalGraceKey=internalGraceStateKey(String(v[9]||'1'),String(v[10]||'1'),absoluteBeat(v));
  const followingDebt=internalGraceFollowingDebts.get(principalGraceKey);
  if(!v[11]&&followingDebt&&Math.abs(absoluteBeat(v)-followingDebt.beat)<1e-9)
   holdBeats=Math.max(0,holdBeats-followingDebt.beats);
  playNote(s,f,holdBeats);
 });
 if(!e.notes[eventStart]?.[11]){
  const clearedGraceKeys=new Set();
  eventNotes.forEach(v=>{
   const key=internalGraceStateKey(String(v[9]||'1'),String(v[10]||'1'),absoluteBeat(v));
   if(clearedGraceKeys.has(key))return;
   clearedGraceKeys.add(key);
   internalGracePreviousStates.delete(key);
   internalGraceForwardStates.delete(key);
   internalGraceFollowingDebts.delete(key);
  });
 }
 progress.style.width=(eventEnd/e.notes.length*100)+'%';
 index=eventEnd;
 if(internalRange&&index>=internalRange.end){
  // The boundary is reached only after eventDelay has elapsed. Defer voice
  // cleanup until then so the final event keeps its notated duration.
  internalLoopBoundaryPending=true;
  index=internalRange.start;
  practiceIteration++;
  if(!sessionFirstPracticeAt){sessionFirstPracticeAt=Date.now();sessionStartHint=''}
  sessionRepCount++;sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();updatePracticeProgress(practiceIteration);
  const max=Math.max(1,+loopRepeats.value||1);
  if(practiceIteration>=max){
   // The series completes at the musical boundary, not at the final attack.
   // Let eventDelay elapse before changing tempo, starting count-in or stopping.
   internalLoopSeriesComplete=true;
  }
 }else if(index>=e.notes.length){
  // The last attack is not necessarily the musical end of the score. Keep the
  // transport alive through the remaining duration/rests, then settle to idle.
  index=e.notes.length;
  return eventDelay;
 }
 // When another pass of the same internal loop follows, append its leading
 // silence after the current pass's trailing silence. This keeps every
 // repetition aligned to the selected measure boundary, not just the first.
 if(internalRange&&playing&&practiceLoop&&index===internalRange.start&&!internalLoopSeriesComplete){
  return eventDelay+internalLoopLeadInMs(e,internalRange);
 }
 return eventDelay;
}
document.querySelectorAll('.exercise').forEach(b=>b.onclick=()=>{stop();document.querySelector('.exercise.active').classList.remove('active');b.classList.add('active');current=b.dataset.ex;render()});
let preservePreferredTempo=false;
tempo.oninput=()=>{
 if(!preservePreferredTempo)saveExerciseTempo(currentPracticeTitle,+tempo.value);
 syncTempo();
 // A manual tempo edit changes the timing contract of an armed count-in/lead-in.
 // Cancel that pending start instead of letting old delays launch the new tempo
 // out of sync. Live playback can still change tempo in place below.
 if(practiceLoop&&(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)))){
  cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
  const activeApi=window.guitarLibertyAlphaTab;
  if(alphaTabMode&&activeApi){try{activeApi.pause()}catch(_){}}
  pausePracticeClock();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Prêt • '+tempo.value+' BPM';
 }
 if(alphaTabMode&&window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab);else if(playing){
  retimeActiveVoices(+tempo.value);
  const elapsed=timerStartedAt?Math.max(0,performance.now()-timerStartedAt):0;
  const remainingMs=timerDelayMs>0?Math.max(0,timerDelayMs-elapsed):0;
  const wallClock=timerWallClock;
  const scheduledBpm=Math.max(1,timerScheduledBpm||+tempo.value||120);
  const remainingBeats=remainingMs*scheduledBpm/60000;
  nextDelayWallClock=wallClock;
  scheduleNext(wallClock?remainingMs:remainingBeats*60000/Math.max(1,+tempo.value||120));
 }
 if(videoEnabled)syncVideoTempo();
 if(metronomeEnabled&&!countInActive){stopMetronome();startMetronome()}
 if(sessionStarted&&sessionFirstPracticeAt&&practiceLoop){
  sessionBest=Math.max(sessionBest,+tempo.value||0);
  paintSession();
 }
};
function isEditableShortcutTarget(target){
 if(!target)return false;
 const tag=(target.tagName||'').toLowerCase();
 return target.isContentEditable||tag==='input'||tag==='textarea'||tag==='select';
}
document.addEventListener('keydown',e=>{
 if((e.code!=='Space'&&e.key!==' ')||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
 if(isEditableShortcutTarget(e.target))return;
 e.preventDefault();
 e.stopPropagation();
 const playButton=document.querySelector('#play');
 if(playButton)playButton.click();
},{capture:true});

function isWistiaPlaying(){
 if(!videoEnabled||!wistiaPlayer)return false;
 try{return typeof wistiaPlayer.state==='function'?wistiaPlayer.state()==='playing':wistiaPlayer.state==='playing'}catch(_){return false}
}
function pauseWistiaPracticeVideo(){
 // A pause is also a cancellation barrier for any Wistia start/resume whose
 // asynchronous "play" event has not arrived yet. Otherwise a late event could
 // resume alphaTab or arm its lead-in after the user already paused/stopped.
 cancelPendingWistiaResume();
 if(!wistiaPlayer)return;
 try{wistiaPlayer.pause()}catch(e){console.error('Wistia pause',e)}
}
function pauseLocalPracticeVideo(){
 mediaStartGeneration++;
 if(practiceVideo&&!practiceVideo.paused)practiceVideo.pause();
}
function pauseAlphaPracticeAccompaniment(){
 stopBacking(false);
 pauseLocalPracticeVideo();
 if(videoEnabled&&wistiaPlayer){
  pauseWistiaPracticeVideo()
 }
}
function startAlphaPracticePlayback(api,{restartAccompaniment=false,resumeAccompaniment=false}={}){
 const failStart=(label,error)=>{
  alphaTabMediaPreparing=false;
  mediaStartGeneration++;cancelPendingWistiaResume();cancelDelayedPlayback();stopBacking(false);pauseLocalPracticeVideo();pauseWistiaPracticeVideo();try{api.pause()}catch(_){}
  alphaTabResumePending=resumeAccompaniment;leadInResumePending=false;leadInRemainingMs=0;pausePracticeClock();
  document.querySelector('#play').textContent=resumeAccompaniment?'▶ REPRENDRE':'▶ PLAY';
  practiceStatus.textContent=label+' indisponible • '+(resumeAccompaniment?'prêt à reprendre':'prêt à relancer');
  if(error)console.error(label+' playback',error);
 };
 if(videoEnabled&&practiceVideo&&!practiceVideo.hidden&&practiceVideo.src){
  syncVideoTempo();
  if(practiceVideo.paused){
   alphaTabMediaPreparing=true;
   practiceVideo.currentTime=0;
   const bpm=Math.max(1,+tempo.value||currentVideoSourceBpm||50),startGeneration=++mediaStartGeneration;
   const startVideoSrc=practiceVideo.currentSrc||practiceVideo.src;
   practiceVideo.play().then(()=>{
    if(startGeneration!==mediaStartGeneration||!videoEnabled||practiceVideo.paused||(practiceVideo.currentSrc||practiceVideo.src)!==startVideoSrc)return;
    alphaTabMediaPreparing=false;startSession();document.querySelector('#play').textContent='⏸ PAUSE';
    scheduleLeadInStart(()=>{
     if(startGeneration!==mediaStartGeneration||!videoEnabled||practiceVideo.paused||(practiceVideo.currentSrc||practiceVideo.src)!==startVideoSrc||window.guitarLibertyAlphaTab!==api)return;
     beginPracticePassage();api.play();
    },currentVideoLeadBeats*(60000/bpm));
   }).catch(e=>{if(startGeneration===mediaStartGeneration)failStart('Vidéo',e)});
  }
  return;
 }
 if(videoEnabled&&currentWistiaId&&!wistiaPlayer){
  practiceStatus.textContent='Vidéo en cours de chargement…';
  document.querySelector('#play').textContent='▶ PLAY';
  return;
 }
 if(videoEnabled&&wistiaPlayer){
  syncVideoTempo();
  alphaTabMediaPreparing=true;
  try{
   cancelPendingWistiaResume();
   const startGeneration=wistiaResumeGeneration;
   const startPlayer=wistiaPlayer;
   let started=false;
   if(restartAccompaniment||!resumeAccompaniment){
    if(typeof startPlayer.time==='function')startPlayer.time(0);
    else if(typeof startPlayer.currentTime==='function')startPlayer.currentTime(0);
   }
   const startWistiaPractice=()=>{
    if(started||startGeneration!==wistiaResumeGeneration||!videoEnabled||wistiaPlayer!==startPlayer||window.guitarLibertyAlphaTab!==api)return;
    started=true;alphaTabMediaPreparing=false;pendingWistiaResume=null;
    try{startPlayer.unbind('play',startWistiaPractice)}catch(_){}
    startSession();sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();document.querySelector('#play').textContent='⏸ PAUSE';
    const bpm=Math.max(1,+tempo.value||currentVideoSourceBpm||50);
    scheduleLeadInStart(()=>{
     if(startGeneration!==wistiaResumeGeneration||!videoEnabled||wistiaPlayer!==startPlayer||!isWistiaPlaying()||window.guitarLibertyAlphaTab!==api)return;
     beginPracticePassage();api.play();
    },currentVideoLeadBeats*(60000/bpm));
   };
   pendingWistiaResume={player:startPlayer,handler:startWistiaPractice};
   try{startPlayer.bind('play',startWistiaPractice)}catch(e){pendingWistiaResume=null;failStart('Wistia',e);return}
   startPlayer.play();
   if(isWistiaPlaying())startWistiaPractice();
  }catch(e){failStart('Wistia',e)}
  return;
 }
 if(backingAudio&&backingEnabled){
  const bpm=Math.max(1,+tempo.value||50),sourceRate=Math.max(.5,Math.min(2,bpm/50));
  backingAudio.playbackRate=sourceRate;
  if(resumeAccompaniment){
   alphaTabMediaPreparing=true;
   const startGeneration=++mediaStartGeneration,startBacking=backingAudio;
   applyPendingBackingRestore(startBacking).then(()=>{
    if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||window.guitarLibertyAlphaTab!==api)return;
    const backingPromise=startBacking.play();
    if(backingPromise?.then)backingPromise.then(()=>{if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||startBacking.paused||window.guitarLibertyAlphaTab!==api)return;alphaTabMediaPreparing=false;beginPracticePassage();api.play()}).catch(e=>{if(startGeneration===mediaStartGeneration&&backingAudio===startBacking)failStart('Backing',e)});
    else if(startGeneration===mediaStartGeneration&&backingAudio===startBacking&&!startBacking.paused&&window.guitarLibertyAlphaTab===api){beginPracticePassage();api.play()}
   }).catch(e=>{if(startGeneration===mediaStartGeneration&&backingAudio===startBacking)failStart('Backing',e)})
   return;
  }
  alphaTabMediaPreparing=true;
  backingAudio.currentTime=0;delete backingAudio._guitarLibertyRestoreTime;
  const startGeneration=++mediaStartGeneration,startBacking=backingAudio;
  const startBackingLeadIn=()=>{if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking)return;alphaTabMediaPreparing=false;scheduleLeadInStart(()=>{if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||startBacking.paused||window.guitarLibertyAlphaTab!==api)return;beginPracticePassage();api.play();},currentBackingLeadBeats*(60000/bpm))};
  const backingPromise=startBacking.play();
  if(backingPromise?.then)backingPromise.then(startBackingLeadIn).catch(e=>{if(startGeneration===mediaStartGeneration&&backingAudio===startBacking)failStart('Backing',e)});
  else if(startGeneration===mediaStartGeneration&&backingAudio===startBacking&&!startBacking.paused)startBackingLeadIn();
  return;
 }
 alphaTabMediaPreparing=false;beginPracticePassage();api.play();
}
document.querySelector('#play').onclick=async()=>{
 if(document.querySelector('#play').textContent.includes('REPRENDRE')){
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 }
 if(alphaTabMode&&window.guitarLibertyAlphaTab){
  const api=window.guitarLibertyAlphaTab;
  try{
   if(alphaTabMediaPreparing){
    cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});try{api.pause()}catch(_){}pausePracticeClock();
    practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
    document.querySelector('#play').textContent='▶ PLAY';return;
   }
   if(countInActive){
    cancelPracticeTransition();
    practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
    document.querySelector('#play').textContent='▶ PLAY';
    return;
   }
   if(backingStartTimer){
    leadInRemainingMs=Math.max(0,leadInDelayMs-(performance.now()-leadInStartedAt));
    leadInResumePending=true;
    cancelDelayedPlayback();pauseAlphaPracticeAccompaniment();
    if(sessionStarted&&sessionFirstPracticeAt)pausePracticeClock();
    practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
    document.querySelector('#play').textContent='▶ REPRENDRE';
    paintSession();
    return;
   }
   if(videoEnabled&&practiceVideo&&!practiceVideo.hidden&&practiceVideo.src&&!practiceVideo.paused){
    pauseLocalPracticeVideo();try{api.pause()}catch(_){}alphaTabResumePending=true;
    if(sessionStarted&&sessionFirstPracticeAt)pausePracticeClock();
    document.querySelector('#play').textContent='▶ PLAY';return;
   }
   if(videoEnabled&&wistiaPlayer){
    if(isWistiaPlaying()){
     pauseWistiaPracticeVideo()
     try{api.pause()}catch(_){}
     alphaTabResumePending=true;
     if(sessionStarted&&sessionFirstPracticeAt)pausePracticeClock();
     document.querySelector('#play').textContent='▶ PLAY';return;
    }
   }
   if(!videoEnabled&&api.playerState===1){api.pause();stopBacking(false);alphaTabResumePending=true;document.querySelector('#play').textContent='▶ PLAY';return;}
   const resumeLeadIn=leadInResumePending;
   const remainingLeadIn=resumeLeadIn?leadInRemainingMs:0;
   leadInResumePending=false;
   const resumeFromPause=alphaTabResumePending;
   alphaTabResumePending=false;
   document.querySelector('#play').textContent='■ STOP';
   setAlphaTempo(api);
   if(practiceLoop){
    setPracticeRange(api);
    if(!resumeFromPause){
     const range=practiceTicks();
     if(range){try{api.tickPosition=range.start}catch(_){}}
     lastLoopTick=-1;
    }
   }
   const failAccompanimentResume=(label,error)=>{
    alphaTabMediaPreparing=false;mediaStartGeneration++;cancelPendingWistiaResume();cancelDelayedPlayback();stopBacking(false);pauseLocalPracticeVideo();pauseWistiaPracticeVideo();try{api.pause()}catch(_){}
    alphaTabResumePending=resumeFromPause;leadInResumePending=resumeLeadIn;leadInRemainingMs=resumeLeadIn?remainingLeadIn:0;pausePracticeClock();
    document.querySelector('#play').textContent=(resumeFromPause||resumeLeadIn)?'▶ REPRENDRE':'▶ PLAY';
    practiceStatus.textContent=label+' indisponible • '+((resumeFromPause||resumeLeadIn)?'prêt à reprendre':'prêt à relancer');
    if(error)console.error(label+' resume',error);
   };
   if(resumeLeadIn){
    const resumeLeadInPlayback=()=>{if(window.guitarLibertyAlphaTab!==api)return;beginPracticePassage();api.play();};
    if(videoEnabled&&practiceVideo&&!practiceVideo.hidden&&practiceVideo.src){
     syncVideoTempo();
     alphaTabMediaPreparing=true;
     const startGeneration=++mediaStartGeneration;
     const resumeVideoSrc=practiceVideo.currentSrc||practiceVideo.src;
     applyPendingLocalVideoRestore(practiceVideo,normalizeMediaUrl(currentPracticeVideoUrl)).then(()=>{
      if(startGeneration!==mediaStartGeneration||!videoEnabled||(practiceVideo.currentSrc||practiceVideo.src)!==resumeVideoSrc||window.guitarLibertyAlphaTab!==api)return;
      return practiceVideo.play();
     }).then(()=>{
      if(startGeneration!==mediaStartGeneration||!videoEnabled||practiceVideo.paused||(practiceVideo.currentSrc||practiceVideo.src)!==resumeVideoSrc||window.guitarLibertyAlphaTab!==api)return;
      alphaTabMediaPreparing=false;document.querySelector('#play').textContent='⏸ PAUSE';
      scheduleLeadInStart(()=>{
       if(startGeneration!==mediaStartGeneration||!videoEnabled||practiceVideo.paused||(practiceVideo.currentSrc||practiceVideo.src)!==resumeVideoSrc||window.guitarLibertyAlphaTab!==api)return;
       resumeLeadInPlayback();
      },remainingLeadIn);
     }).catch(e=>{if(startGeneration===mediaStartGeneration)failAccompanimentResume('Vidéo',e)});
    }else if(videoEnabled&&currentWistiaId&&!currentPracticeVideoUrl){
     alphaTabMediaPreparing=true;
     const requestedWistiaId=currentWistiaId;
     const readyPlayer=await waitForWistiaReady(requestedWistiaId);
     if(!readyPlayer||!videoEnabled||currentWistiaId!==requestedWistiaId||window.guitarLibertyAlphaTab!==api){if(!readyPlayer&&videoEnabled&&currentWistiaId===requestedWistiaId&&window.guitarLibertyAlphaTab===api)failAccompanimentResume('Wistia',new Error('Délai de chargement dépassé'));else alphaTabMediaPreparing=false;return}
     syncVideoTempo();
     try{
      let resumed=false;
      cancelPendingWistiaResume();
      const resumeGeneration=wistiaResumeGeneration;
      const resumePlayer=wistiaPlayer;
      const resumeWistiaLeadIn=()=>{
       if(resumed||resumeGeneration!==wistiaResumeGeneration||!videoEnabled||wistiaPlayer!==resumePlayer||window.guitarLibertyAlphaTab!==api)return;
       resumed=true;alphaTabMediaPreparing=false;pendingWistiaResume=null;
       try{resumePlayer.unbind('play',resumeWistiaLeadIn)}catch(_){}
       alphaTabMediaPreparing=false;document.querySelector('#play').textContent='⏸ PAUSE';
       scheduleLeadInStart(()=>{if(resumeGeneration!==wistiaResumeGeneration||!videoEnabled||wistiaPlayer!==resumePlayer||!isWistiaPlaying())return;resumeLeadInPlayback()},remainingLeadIn);
      };
      pendingWistiaResume={player:resumePlayer,handler:resumeWistiaLeadIn};
      try{resumePlayer.bind('play',resumeWistiaLeadIn)}catch(e){pendingWistiaResume=null;failAccompanimentResume('Wistia',e);return}
      resumePlayer.play();
      if(isWistiaPlaying())resumeWistiaLeadIn();
     }catch(e){failAccompanimentResume('Wistia',e)}
    }else if(backingAudio&&backingEnabled){
     alphaTabMediaPreparing=true;
     const startGeneration=++mediaStartGeneration,startBacking=backingAudio;
     const resumeBackingLeadIn=()=>{
      if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||startBacking.paused||window.guitarLibertyAlphaTab!==api)return;
      alphaTabMediaPreparing=false;scheduleLeadInStart(()=>{if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||startBacking.paused||window.guitarLibertyAlphaTab!==api)return;resumeLeadInPlayback()},remainingLeadIn);
     };
     applyPendingBackingRestore(startBacking).then(()=>{
      if(startGeneration!==mediaStartGeneration||backingAudio!==startBacking||window.guitarLibertyAlphaTab!==api)return;
      const backingPromise=startBacking.play();
      if(backingPromise?.then)backingPromise.then(resumeBackingLeadIn).catch(e=>{if(startGeneration===mediaStartGeneration&&backingAudio===startBacking)failAccompanimentResume('Backing',e)});
      else resumeBackingLeadIn();
     }).catch(e=>{if(startGeneration===mediaStartGeneration&&backingAudio===startBacking)failAccompanimentResume('Backing',e)});
    }else scheduleLeadInStart(resumeLeadInPlayback,remainingLeadIn);
   }else if(resumeFromPause){
    if(videoEnabled&&practiceVideo&&!practiceVideo.hidden&&practiceVideo.src){
     syncVideoTempo();
     alphaTabMediaPreparing=true;
     const startGeneration=++mediaStartGeneration;
     const resumeVideoSrc=practiceVideo.currentSrc||practiceVideo.src;
     applyPendingLocalVideoRestore(practiceVideo,normalizeMediaUrl(currentPracticeVideoUrl)).then(()=>{
      if(startGeneration!==mediaStartGeneration||!videoEnabled||(practiceVideo.currentSrc||practiceVideo.src)!==resumeVideoSrc||window.guitarLibertyAlphaTab!==api)return;
      return practiceVideo.play();
     }).then(()=>{
      if(startGeneration!==mediaStartGeneration||!videoEnabled||practiceVideo.paused||(practiceVideo.currentSrc||practiceVideo.src)!==resumeVideoSrc||window.guitarLibertyAlphaTab!==api)return;
      beginPracticePassage();api.play();alphaTabMediaPreparing=false;document.querySelector('#play').textContent='⏸ PAUSE';
     }).catch(e=>{if(startGeneration===mediaStartGeneration)failAccompanimentResume('Vidéo',e)});
    }else if(videoEnabled&&currentWistiaId&&!currentPracticeVideoUrl){
     alphaTabMediaPreparing=true;
     const requestedWistiaId=currentWistiaId;
     const readyPlayer=await waitForWistiaReady(requestedWistiaId);
     if(!readyPlayer||!videoEnabled||currentWistiaId!==requestedWistiaId||window.guitarLibertyAlphaTab!==api){if(!readyPlayer&&videoEnabled&&currentWistiaId===requestedWistiaId&&window.guitarLibertyAlphaTab===api)failAccompanimentResume('Wistia',new Error('Délai de chargement dépassé'));else alphaTabMediaPreparing=false;return}
     syncVideoTempo();
     try{
      let resumed=false;
      cancelPendingWistiaResume();
      const resumeGeneration=wistiaResumeGeneration;
      const resumePlayer=wistiaPlayer;
      const resumeAlphaTab=()=>{
       if(resumed||resumeGeneration!==wistiaResumeGeneration||!videoEnabled||wistiaPlayer!==resumePlayer||window.guitarLibertyAlphaTab!==api)return;
       resumed=true;alphaTabMediaPreparing=false;pendingWistiaResume=null;
       try{resumePlayer.unbind('play',resumeAlphaTab)}catch(_){}
       beginPracticePassage();api.play();alphaTabMediaPreparing=false;document.querySelector('#play').textContent='⏸ PAUSE';
      };
      pendingWistiaResume={player:resumePlayer,handler:resumeAlphaTab};
      try{resumePlayer.bind('play',resumeAlphaTab)}catch(e){pendingWistiaResume=null;failAccompanimentResume('Wistia',e);return}
      resumePlayer.play();
      if(isWistiaPlaying())resumeAlphaTab();
     }catch(e){failAccompanimentResume('Wistia',e)}
    }else startAlphaPracticePlayback(api,{resumeAccompaniment:true});
   }else countInThenPlay(api,()=>startAlphaPracticePlayback(api));
   return;
  }catch(err){console.error('alphaTab playback',err);importStatus.textContent='Lecture alphaTab indisponible : '+(err.message||err);return;}
 }
 if(playing){stop();return}
 if(internalPlaybackPreparing){
  internalPlaybackPreparing=false;internalPlaybackGeneration++;
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
  return;
 }
 // During an internal Auto BPM transition the transport is intentionally idle
 // while the next series counts in. Treat PLAY/STOP as a cancellation here;
 // otherwise a click could start playback immediately and the pending count-in
 // callback would start it a second time.
 if(countInActive){
  cancelPracticeTransition();
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
  document.querySelector('#play').textContent='▶ PLAY';
  return;
 }
 internalPlaybackPreparing=true;
 const playbackGeneration=++internalPlaybackGeneration;
 document.querySelector('#play').textContent='■ STOP';
 try{
  ensureOutput();
  if(audio.state==='suspended')await audio.resume();
  if(!internalPlaybackPreparing||playbackGeneration!==internalPlaybackGeneration)return;
  await Promise.all([0,1,2,3,4,5].map(loadGuitarSample));
 }catch(err){
  if(playbackGeneration!==internalPlaybackGeneration)return;
  internalPlaybackPreparing=false;
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Audio guitare indisponible';
  console.error('Internal playback preparation',err);
  return;
 }
 if(!internalPlaybackPreparing||playbackGeneration!==internalPlaybackGeneration)return;
 internalPlaybackPreparing=false;
 const internalExercise=exercises[current];
 if(!internalExercise?.notes?.length){
  playing=false;clearInternalTimer();stopAllVoices();
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent='Aucune note à lire';
  return;
 }
 if(practiceLoop){
  const range=internalLoopBounds(exercises[current]);
  if(!range){practiceStatus.textContent='Boucle vide • aucune note dans les mesures '+loopStart.value+'–'+loopEnd.value;document.querySelector('#play').textContent='▶ PLAY';return;}
  index=range.start;
  document.querySelector('#play').textContent='■ STOP';
  countInThenPlay(null,()=>{
   if(!practiceLoop)return;
   beginPracticePassage();playing=true;
   const loopLeadIn=internalLoopLeadInMs(exercises[current],range);
   if(loopLeadIn>0)scheduleNext(loopLeadIn);else scheduleNext(tick());
  });
  return;
 }
 document.querySelector('#play').textContent='■ STOP';
 countInThenPlay(null,()=>{
  beginPracticePassage();playing=true;
  const scoreLeadIn=internalScoreLeadInMs(internalExercise);
  if(scoreLeadIn>0)scheduleNext(scoreLeadIn);else scheduleNext(tick());
 });
};
// L'application démarre désormais sur l'accueil, sans charger l'ancien exercice de démonstration.
const homePage=document.querySelector('#homePage'),appWorkspace=document.querySelector('#appWorkspace');
function openWorkspace(target){
 homePage.hidden=true;appWorkspace.hidden=false;
 let back=document.querySelector('#homeBack');
 if(!back){back=document.createElement('button');back.id='homeBack';back.className='home-back';back.textContent='⌂ ACCUEIL';document.body.appendChild(back);back.onclick=showHome;}
 back.hidden=false;
 requestAnimationFrame(()=>{
  if(target==='dashboard')document.querySelector('.student-dashboard')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(target==='courses')document.querySelector('.course-nav')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(target==='coach')document.querySelector('.ai-coach')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(target==='listen')document.querySelector('.ai-listening')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
}
function showHome(){stop();appWorkspace.hidden=true;homePage.hidden=false;const back=document.querySelector('#homeBack');if(back)back.hidden=true;window.scrollTo({top:0,behavior:'smooth'});}
document.querySelector('#homeStart')?.addEventListener('click',()=>openWorkspace('dashboard'));
document.querySelector('#homeLibrary')?.addEventListener('click',()=>openWorkspace('courses'));
document.querySelector('#homeImport')?.addEventListener('click',()=>{openWorkspace('courses');setTimeout(()=>document.querySelector('#importScore')?.click(),120)});
document.querySelectorAll('[data-home-target]').forEach(b=>b.addEventListener('click',()=>openWorkspace(b.dataset.homeTarget)));

const backingToggle=document.querySelector('#backingToggle');
const backingVolume=document.querySelector('#backingVolume');
const backingVolumeLabel=document.querySelector('#backingVolumeLabel');
const videoToggle=document.querySelector('#videoToggle');
const tutorialToggle=document.querySelector('#tutorialToggle'),tutorialNotice=document.querySelector('#tutorialNotice'),tutorialNoticeText=document.querySelector('#tutorialNoticeText');
let currentTutorialUrl=null;
const videoStage=document.querySelector('#videoStage');
const wistiaFrame=document.querySelector('#wistiaFrame');
const practiceVideo=document.querySelector('#practiceVideo');
function finishPracticeVideoPlayback(){
 if(!videoEnabled)return;
 const api=window.guitarLibertyAlphaTab;
 // During loop practice alphaTab owns repetition/series completion. A backing
 // video ending a little early must never stop the current repetition or Auto BPM
 // series; it simply remains ended until the next explicit accompaniment restart.
 if(practiceLoop&&alphaTabMode&&api&&!backingStartTimer&&!leadInResumePending&&!alphaTabMediaPreparing)return;
 cancelPracticeTransition({stopBackingAudio:true});
 if(alphaTabMode&&api){if(!practiceLoop){naturalEndCounted=true;lastLoopTick=-1;try{api.tickPosition=0}catch(_){}}try{api.pause()}catch(_){}}
 pausePracticeClock();
 alphaTabResumePending=false;
 document.querySelector('#play').textContent='▶ PLAY';
 practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 paintSession();
}
if(practiceVideo)practiceVideo.addEventListener('ended',finishPracticeVideoPlayback);
function detachWistiaPracticeHandlers(){
 if(!wistiaPlayer||!wistiaEndHandler){wistiaEndHandler=null;return}
 try{wistiaPlayer.unbind('end',wistiaEndHandler)}catch(_){}
 wistiaEndHandler=null;
}
function cancelPendingWistiaReady(){
 if(!pendingWistiaReady)return;
 const {resolve,timer}=pendingWistiaReady;pendingWistiaReady=null;
 if(timer)clearTimeout(timer);
 resolve(null);
}
function waitForWistiaReady(id){
 if(!id||!videoEnabled||currentWistiaId!==id)return Promise.resolve(null);
 if(wistiaPlayer)return Promise.resolve(wistiaPlayer);
 cancelPendingWistiaReady();
 return new Promise(resolve=>{
  const generation=wistiaLoadGeneration;
  const timer=setTimeout(()=>{
   if(pendingWistiaReady?.id!==id||pendingWistiaReady.generation!==generation)return;
   pendingWistiaReady=null;resolve(null);
  },8000);
  pendingWistiaReady={id,generation,resolve,timer};
 });
}
function getWistiaTime(){
 if(!wistiaPlayer)return 0;
 try{
  const value=typeof wistiaPlayer.time==='function'?wistiaPlayer.time():typeof wistiaPlayer.currentTime==='function'?wistiaPlayer.currentTime():0;
  return Math.max(0,+value||0);
 }catch(_){return 0}
}
function restoreWistiaTime(time){const target=Math.max(0,+time||0);pendingWistiaRestore=target>0&&currentWistiaId?{id:currentWistiaId,time:target}:null}
function cancelPendingLocalVideoMetadata(){
 if(!pendingLocalVideoMetadata)return;
 const {video,onMetadata,onError,resolve,timer}=pendingLocalVideoMetadata;pendingLocalVideoMetadata=null;
 video.removeEventListener('loadedmetadata',onMetadata);video.removeEventListener('error',onError);
 if(timer)clearTimeout(timer);
 if(resolve)resolve();
}
function normalizeMediaUrl(url){
 const value=String(url||'');
 try{return encodeURI(decodeURI(value))}catch(_){return encodeURI(value)}
}
function restoreLocalVideoTime(time){
 cancelPendingLocalVideoMetadata();
 const target=Math.max(0,+time||0);
 pendingLocalVideoRestore=target>0&&currentPracticeVideoUrl?{url:normalizeMediaUrl(currentPracticeVideoUrl),time:target}:null;
}
function applyPendingLocalVideoRestore(video,requestedVideo){
 cancelPendingLocalVideoMetadata();
 if(!video||pendingLocalVideoRestore?.url!==requestedVideo)return Promise.resolve();
 const target=pendingLocalVideoRestore.time;
 const seek=()=>{
  if(practiceVideo!==video||pendingLocalVideoRestore?.url!==requestedVideo||(video.getAttribute('src')||'')!==requestedVideo)return;
  try{const max=Number.isFinite(video.duration)&&video.duration>0?Math.max(0,video.duration-.05):target;video.currentTime=Math.min(target,max);pendingLocalVideoRestore=null}catch(_){}
 };
 if(video.readyState>=1){seek();return Promise.resolve()}
 return new Promise((resolve,reject)=>{
  const wait={video,onMetadata:null,onError:null,resolve,timer:null};
  const finish=()=>{
   if(pendingLocalVideoMetadata===wait)pendingLocalVideoMetadata=null;
   video.removeEventListener('loadedmetadata',wait.onMetadata);video.removeEventListener('error',wait.onError);
   clearTimeout(wait.timer);
  };
  wait.onMetadata=()=>{finish();seek();resolve()};
  wait.onError=()=>{finish();reject(video.error||new Error('Vidéo indisponible'))};
  wait.timer=setTimeout(()=>{finish();reject(new Error('Délai de chargement vidéo dépassé'))},8000);
  pendingLocalVideoMetadata=wait;
  video.addEventListener('loadedmetadata',wait.onMetadata,{once:true});
  video.addEventListener('error',wait.onError,{once:true});
 });
}
function setVideoTrack(id,practiceUrl=null){
 pendingWistiaRestore=null;cancelPendingWistiaReady();pendingLocalVideoRestore=null;cancelPendingLocalVideoMetadata();
 currentPracticeVideoUrl=practiceUrl||null;
 wistiaLoadGeneration++;pauseWistiaPracticeVideo();detachWistiaPracticeHandlers();
 currentWistiaId=id||null;currentVideoLeadBeats=0;currentVideoSourceBpm=50;videoEnabled=false;wistiaPlayer=null;clearInterval(videoPracticeTimer);videoPracticeTimer=null;
 if(videoStage)videoStage.hidden=true;
 if(practiceVideo){
  pauseLocalPracticeVideo();practiceVideo.currentTime=0;practiceVideo.hidden=true;
  practiceVideo.removeAttribute('src');practiceVideo.load();
 }
 if(wistiaFrame)wistiaFrame.src='';
 if(videoToggle){videoToggle.disabled=!(id||practiceUrl);videoToggle.classList.remove('active');videoToggle.textContent='🎬 VIDÉO';}
}
function syncVideoTempo(){
 const sourceBpm=Math.max(1,+currentVideoSourceBpm||50);
 const rate=Math.max(.5,Math.min(2,(+tempo.value||sourceBpm)/sourceBpm));
 if(practiceVideo&&!practiceVideo.hidden)practiceVideo.playbackRate=rate;
 if(videoEnabled&&wistiaPlayer){
  try{
   if(typeof wistiaPlayer.playbackRate==='function')wistiaPlayer.playbackRate(rate);
   else if(typeof wistiaPlayer.playbackRate!=='undefined')wistiaPlayer.playbackRate=rate;
  }catch(e){console.error('Wistia tempo sync',e)}
 }
}
function openVideo(){
 if(!currentWistiaId&&!currentPracticeVideoUrl)return;
 const armedVideoStart=!!(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)));
 // Enabling video also changes the media configuration of an armed start.
 // Cancel it so the next PLAY begins with one coherent accompaniment setup.
 if(armedVideoStart)cancelPracticeTransition({stopBackingAudio:true});
 videoEnabled=true;videoStage.hidden=false;
 if(currentPracticeVideoUrl&&practiceVideo){
   wistiaFrame.hidden=true;practiceVideo.hidden=false;
   const requestedVideo=normalizeMediaUrl(currentPracticeVideoUrl);
   const loadedVideo=practiceVideo.getAttribute('src')||'';
   if(loadedVideo!==requestedVideo){
    practiceVideo.src=requestedVideo;
    practiceVideo.load();
   }
   applyPendingLocalVideoRestore(practiceVideo,requestedVideo);
   syncVideoTempo();
 }else if(wistiaFrame){
   practiceVideo.hidden=true;wistiaFrame.hidden=false;
   const requestedWistiaId=currentWistiaId;
   const loadGeneration=++wistiaLoadGeneration;
   window._wq=window._wq||[];
   window._wq.push({id:requestedWistiaId,onReady:video=>{
    if(loadGeneration!==wistiaLoadGeneration||!videoEnabled||currentWistiaId!==requestedWistiaId){
     // Wistia can resolve after this load was superseded. Do not let that stale
     // player survive independently of the current video lifecycle.
     try{video.unbind('end',finishPracticeVideoPlayback)}catch(_){}
     try{video.pause()}catch(_){}
     return;
    }
    wistiaPlayer=video;
    if(pendingWistiaRestore?.id===requestedWistiaId){
     const restoreTime=pendingWistiaRestore.time;pendingWistiaRestore=null;
     try{
      if(typeof video.time==='function')video.time(restoreTime);
      else if(typeof video.currentTime==='function')video.currentTime(restoreTime);
     }catch(e){console.error('Wistia position restore',e)}
    }
    // Apply position and tempo before releasing a transport resume that was
    // waiting for this player. "Ready" therefore means fully synchronized.
    syncVideoTempo();
    if(pendingWistiaReady?.id===requestedWistiaId&&pendingWistiaReady.generation===loadGeneration){
     const {resolve,timer}=pendingWistiaReady;pendingWistiaReady=null;if(timer)clearTimeout(timer);resolve(video);
    }
    const readyGeneration=loadGeneration;
    wistiaEndHandler=()=>{
     if(readyGeneration!==wistiaLoadGeneration||!videoEnabled||wistiaPlayer!==video||currentWistiaId!==requestedWistiaId)return;
     finishPracticeVideoPlayback();
    };
    try{video.bind('end',wistiaEndHandler)}catch(e){wistiaEndHandler=null;console.error('Wistia end binding',e)}
   }});
   wistiaFrame.src='https://fast.wistia.net/embed/iframe/'+encodeURIComponent(requestedWistiaId)+'?seo=false&videoFoam=true&autoPlay=false&controlsVisibleOnLoad=true';
 }
 videoToggle.classList.add('active');videoToggle.textContent='🎬 VIDÉO ON';
 if(armedVideoStart){
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 }
}
function closeVideo(){
 pendingWistiaRestore=null;cancelPendingWistiaReady();pendingLocalVideoRestore=null;cancelPendingLocalVideoMetadata();
 const armedVideoStart=!!(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)));
 // Closing the practice video invalidates any start/count-in that was armed
 // around that video. Otherwise a delayed callback can still start the score
 // after the user explicitly switched the video off.
 if(armedVideoStart)cancelPracticeTransition();
 wistiaLoadGeneration++;
 pauseLocalPracticeVideo();
 if(videoPracticeTimer){clearInterval(videoPracticeTimer);videoPracticeTimer=null;}
 alphaTabResumePending=false;pauseWistiaPracticeVideo();detachWistiaPracticeHandlers();
 videoEnabled=false;wistiaPlayer=null;
 if(videoStage)videoStage.hidden=true;
 if(wistiaFrame)wistiaFrame.src='';
 if(videoToggle){videoToggle.classList.remove('active');videoToggle.textContent='🎬 VIDÉO';}
 if(armedVideoStart){
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 }
}
if(videoToggle)videoToggle.onclick=()=>{if(videoEnabled)closeVideo();else openVideo();};
function cancelDelayedPlayback(){
 clearTimeout(backingStartTimer);backingStartTimer=null;leadInStartedAt=0;leadInDelayMs=0;
}
function scheduleLeadInStart(callback,delayMs){
 cancelDelayedPlayback();
 leadInDelayMs=Math.max(0,delayMs||0);leadInStartedAt=performance.now();
 backingStartTimer=setTimeout(()=>{backingStartTimer=null;leadInStartedAt=0;leadInDelayMs=0;leadInRemainingMs=0;callback()},leadInDelayMs);
}
function cancelPendingBackingRestore(){
 if(!pendingBackingRestore)return;
 const {track,onMetadata,onError,resolve,timer}=pendingBackingRestore;pendingBackingRestore=null;
 track.removeEventListener('loadedmetadata',onMetadata);track.removeEventListener('error',onError);if(timer)clearTimeout(timer);resolve();
}
function stopBacking(reset=true){
 mediaStartGeneration++;
 cancelDelayedPlayback();cancelPendingBackingRestore();
 if(!backingAudio)return;
 backingAudio.pause();if(reset){backingAudio.currentTime=0;delete backingAudio._guitarLibertyRestoreTime}
}
function syncBackingVolume(){
 const volume=Math.max(0,Math.min(100,+backingVolume?.value||0));
 if(backingVolumeLabel)backingVolumeLabel.textContent=volume+'%';
 if(backingAudio)backingAudio.volume=volume/100;
}
function restoreBackingTime(time){
 const track=backingAudio,target=Math.max(0,+time||0);
 if(!track||!(target>0))return;
 track._guitarLibertyRestoreTime=target;
 if(track.readyState>=1){
  try{const max=Number.isFinite(track.duration)&&track.duration>0?Math.max(0,track.duration-.05):target;track.currentTime=Math.min(target,max);delete track._guitarLibertyRestoreTime}catch(_){}
 }
}
function applyPendingBackingRestore(track){
 if(!track||backingAudio!==track)return Promise.resolve();
 const target=+track._guitarLibertyRestoreTime||0;
 if(!(target>0))return Promise.resolve();
 const seek=()=>{
  if(backingAudio!==track||+track._guitarLibertyRestoreTime!==target)return;
  try{const max=Number.isFinite(track.duration)&&track.duration>0?Math.max(0,track.duration-.05):target;track.currentTime=Math.min(target,max);delete track._guitarLibertyRestoreTime}catch(_){}
 };
 if(track.readyState>=1){seek();return Promise.resolve()}
 return new Promise((resolve,reject)=>{
  const wait={track,onMetadata:null,onError:null,resolve,timer:null};
  const finish=()=>{
   if(pendingBackingRestore===wait)pendingBackingRestore=null;
   track.removeEventListener('loadedmetadata',wait.onMetadata);track.removeEventListener('error',wait.onError);
   if(wait.timer)clearTimeout(wait.timer);
  };
  wait.onMetadata=()=>{finish();seek();resolve()};
  wait.onError=()=>{finish();reject(track.error||new Error('Backing indisponible'))};
  wait.timer=setTimeout(()=>{finish();reject(new Error('Délai de chargement backing dépassé'))},8000);
  pendingBackingRestore=wait;
  track.addEventListener('loadedmetadata',wait.onMetadata,{once:true});
  track.addEventListener('error',wait.onError,{once:true});
 });
}
function setBackingTrack(url){
 stopBacking();currentBackingUrl=url||null;
 backingAudio=url?new Audio(encodeURI(url)):null;
 if(backingAudio){
  const track=backingAudio;
  track.preload='auto';
  track.addEventListener('ended',()=>{
   if(backingAudio!==track)return;
   const api=window.guitarLibertyAlphaTab;
   // In loop practice alphaTab owns repetition/series completion. Outside loop,
   // an ended backing closes the synchronized passage just like practice video.
   if(practiceLoop&&alphaTabMode&&api&&!backingStartTimer&&!leadInResumePending&&!alphaTabMediaPreparing)return;
   cancelPracticeTransition({stopBackingAudio:true});
   if(alphaTabMode&&api){if(!practiceLoop){naturalEndCounted=true;lastLoopTick=-1;try{api.tickPosition=0}catch(_){}}try{api.pause()}catch(_){}}
   pausePracticeClock();
   alphaTabResumePending=false;
   document.querySelector('#play').textContent='▶ PLAY';
   practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
   paintSession();
  });
 }
 syncBackingVolume();
 backingToggle.disabled=!url;
 const backingActive=backingEnabled&&!!url;
 backingToggle.textContent=backingActive?'♫ BACKING ON':'♫ BACKING OFF';
 backingToggle.classList.toggle('active',backingActive);
}
if(backingToggle)backingToggle.onclick=()=>{
 if(!currentBackingUrl){
  backingToggle.textContent='♫ BACKING OFF';backingToggle.classList.remove('active');
  return;
 }
 const armedBackingStart=!!(countInActive||backingStartTimer||leadInResumePending||((!alphaTabMode&&internalPlaybackPreparing)||(alphaTabMode&&alphaTabMediaPreparing)));
 if(armedBackingStart)cancelPracticeTransition({stopBackingAudio:true});
 backingEnabled=!backingEnabled;
 const backingActive=backingEnabled&&!!currentBackingUrl;
 backingToggle.textContent=backingActive?'♫ BACKING ON':'♫ BACKING OFF';
 backingToggle.classList.toggle('active',backingActive);
 if(!backingEnabled)stopBacking(false);
 if(armedBackingStart){
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 }
};
if(backingVolume)backingVolume.oninput=syncBackingVolume;
syncBackingVolume();
const importButton=document.querySelector('#importScore');
const importStatus=document.querySelector('#importStatus');
function drawLeftHandFingerings(api){
 tab.querySelectorAll('.gl-fingering-layer').forEach(e=>e.remove());
 const lookup=api.boundsLookup||api.renderer?.boundsLookup;
 if(!lookup?.staffSystems)return;
 const layer=document.createElement('div');
 layer.className='gl-fingering-layer';
 layer.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:20;';
 let count=0;
 for(const system of lookup.staffSystems||[]){
  const sys=system.visualBounds||system.realBounds||system.bounds;
  const systemBottom=sys ? sys.y+sys.h : null;
  const pending=[];
  for(const master of system.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[])for(const nb of beat.notes||[]){
   const note=nb.note,finger=note?.leftHandFinger,b=nb.noteHeadBounds;
   if(finger==null||finger<=0||!b)continue;
   pending.push({finger,b});
  }
  if(!pending.length)continue;
  // One dedicated fingering baseline per system, always below the complete TAB/rhythm area.
  const maxNoteBottom=Math.max(...pending.map(x=>x.b.y+x.b.h));
  const baseline=Math.max(maxNoteBottom+26,systemBottom!=null?systemBottom+8:maxNoteBottom+26);
  for(const {finger,b} of pending){
   const el=document.createElement('span');
   el.className='gl-left-finger';
   el.textContent=String(finger);
   el.style.left=(b.x+b.w/2)+'px';
   el.style.top=baseline+'px';
   layer.appendChild(el);count++;
  }
 }
 if(count){tab.style.position='relative';tab.appendChild(layer);}
}

async function loadWithAlphaTab(file,{restoring=false}={}){
 if(!window.alphaTab)throw new Error('Le moteur alphaTab n’est pas chargé dans cette version de Guitare Liberty.');
 invalidateAlphaTabLoad();
 const loadGeneration=alphaTabLoadGeneration;
 const isCurrentGeneration=()=>loadGeneration===alphaTabLoadGeneration;
 const previousApi=window.guitarLibertyAlphaTab;
 stop();
 // A score switch is a hard playback boundary: no delayed callback from the
 // previous exercise may start audio or mutate practice UI after the new load.
 cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
 if(playWithMeActive||playWithMeAnswerTimer||playWithMeCountdownTimer||playWithMeElapsedTimer)stopPlayWithMe();
 if(previousApi){try{previousApi.destroy()}catch(_){try{previousApi.stop()}catch(__){}}if(window.guitarLibertyAlphaTab===previousApi)window.guitarLibertyAlphaTab=null;}
 index=0;playing=false;clearInternalTimer();stopAllVoices();
 practiceScore=null;playCursor=null;alphaPlayedBeat=null;lastLoopTick=-1;practiceIteration=0;updatePracticeProgress(0);
 if(alphaTabClickHandler){tab.removeEventListener('click',alphaTabClickHandler);alphaTabClickHandler=null;}
 tab.classList.remove('alphatab-score');tab.innerHTML='';
 alphaTabMode=true;
 tab.classList.add('alphatab-score');
 let rawBytes;
 try{
  rawBytes=file.bytes||await window.guitarAudio.readScore(file.filePath);
 }catch(err){
  // Ignore failures from a read that was superseded by a newer score request.
  // The active load owns the UI and is the only one allowed to surface errors.
  if(!isCurrentGeneration())return false;
  throw err;
 }
 // Another score may have been requested while the file bytes were being read.
 // In that case this load is obsolete and must never create a new alphaTab API.
 if(!isCurrentGeneration())return false;
 const bytes=rawBytes instanceof Uint8Array?rawBytes:new Uint8Array(rawBytes);
 if(!bytes.length)throw new Error('Le fichier Guitar Pro est vide.');
 if(!isCurrentGeneration())return false;
 const api=new window.alphaTab.AlphaTabApi(tab,{
  core:{useWorkers:false,engine:'svg',enableLazyLoading:false,includeNoteBounds:true,fontDirectory:'../assets/vendor/font/'},
  player:{enablePlayer:true,soundFont:'../assets/vendor/soundfont/sonivox.sf2',scrollMode:'off'},
  display:{layoutMode:'page',barsPerRow:4,justifyLastSystem:true,resources:{effectFontSize:12}} ,
  notation:{notationMode:'guitarpro',fingeringMode:'ScoreDefault',elements:{guitarTuning:false,effectTempo:false,effectFingering:false,effectText:true,effectMarker:true,effectChordNames:true,effectPickStroke:true}}
 });
 window.guitarLibertyAlphaTab=api;
 const isActiveLoad=()=>isCurrentGeneration()&&window.guitarLibertyAlphaTab===api;
 api.playerReady.on(()=>{if(!isActiveLoad())return;importStatus.textContent=file.name+' — tablature prête à jouer';});
 // Clicking the rendered score seeks the player and immediately moves our
 // custom orange cursor. Keep the validated playback/repeat cursor untouched.
 alphaTabClickHandler=ev=>{
  if(!isActiveLoad()||!api.boundsLookup?.staffSystems)return;
  const rect=tab.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
  let hit=null,best=Infinity;
  for(const system of api.boundsLookup.staffSystems||[])for(const master of system.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[]){
   const b=beat.visualBounds||beat.realBounds||beat.bounds;if(!b)continue;
   const cx=b.x+b.w/2,cy=b.y+b.h/2;
   const d=Math.abs(cx-x)+Math.abs(cy-y)*1.5;
   if(d<best){best=d;hit=beat;}
  }
  if(!hit?.beat)return;
  const bt=hit.beat.absolutePlaybackStart??hit.beat.absoluteStart??hit.beat.playbackStart;
  if(!Number.isFinite(bt))return;
  try{api.tickPosition=bt;}catch(_){}
  alphaPlayedBeat=hit.beat;
  updatePlayCursor(api,bt);
 };
 tab.addEventListener('click',alphaTabClickHandler);
 // playedBeatChanged comes from alphaTab's actual playback sequencer. It follows
 // GP repeats automatically and is not confused by written-score absolute ticks.
 if(api.playedBeatChanged?.on)api.playedBeatChanged.on(beat=>{
  if(!isActiveLoad())return;
  alphaPlayedBeat=beat||null;updatePlayCursor(api,api.tickPosition||0);
  const host=document.querySelector('#smartFretboard'),state=document.querySelector('#fretboardState');
  if(host){
   host.querySelectorAll('.note-dot.tab-playing').forEach(d=>d.classList.remove('tab-playing'));
   const notes=beat?.notes||[];
   let firstName='';
   notes.forEach(n=>{
    const fret=n.fret,sourceString=n.string;
    // alphaTab/Guitar Pro string 1 = high E, 6 = low E; our rows use the same visual order.
    if(Number.isFinite(fret)&&Number.isFinite(sourceString)){
     const dot=host.querySelector('.note-dot[data-string="'+(sourceString-1)+'"][data-fret="'+fret+'"]');
     if(dot){dot.classList.add('tab-playing');if(!firstName)firstName=dot.textContent}
    }
   });
   if(state&&firstName)state.textContent='TAB • '+firstName;
  }
 });
 api.playerStateChanged.on(e=>{if(!isActiveLoad())return;if(e.state===1){naturalEndCounted=false;playbackFollowEnabled=true;manualScrollUntil=0;manualScrollStartY=window.scrollY}if(sessionStarted&&sessionFirstPracticeAt){const stateAt=Date.now();if(e.state===1&&practiceLoop)resumePracticeClock(stateAt);else pausePracticeClock(stateAt)}if(!videoEnabled)document.querySelector('#play').textContent=e.state===1?'■ STOP':'▶ PLAY';if(e.state===1){startSession();sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession()}if(e.state===1)practiceStatus.textContent=practiceLoop?'En cours • Répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'En cours';else{const endTick=scoreEndTick(),stoppedTick=Math.max(lastLoopTick,+api.tickPosition||0),naturalEnd=!practiceLoop&&!naturalEndCounted&&endTick>0&&stoppedTick>=endTick-1;if(naturalEnd){naturalEndCounted=true;sessionRepCount++;sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();stopBacking(false);pauseLocalPracticeVideo();pauseWistiaPracticeVideo();alphaTabResumePending=false;leadInResumePending=false;leadInRemainingMs=0;try{api.tickPosition=0}catch(_){}lastLoopTick=-1;document.querySelector('#play').textContent='▶ PLAY';}if(!practiceTimer&&practiceStatus.textContent.indexOf('Série terminée')!==0)practiceStatus.textContent='Prêt';}});
 api.playerPositionChanged.on(e=>{
  if(!isActiveLoad())return;
  const lockedPageY=!playbackFollowEnabled?window.scrollY:null;
  const lockedPaperY=!playbackFollowEnabled?document.querySelector('.paper')?.scrollTop:null;
  const tick=e.currentTick??e.tick??0;
  updatePlayCursor(api,tick);updateAutomaticLiberty(api,tick);if(listening)updateExpectedFromTick(api,tick);
  if(playWithMeActive&&playWithMePhase==='listen'&&playWithMeRange){
   if(playWithMeLastTick>=0&&tick>=playWithMeRange.end-1){
    try{api.pause();api.tickPosition=playWithMeRange.start}catch(_){}
    playWithMePaint('answer');if(playWithMeReplay)playWithMeReplay.disabled=false;if(playWithMeNext)playWithMeNext.disabled=false;
    const leadBeats=Math.max(0,+playWithMeLead?.value||0);
    if(leadBeats){
     const currentTempo=Math.max(1,+tempo.value||practiceScore?.tempo||120),leadMs=Math.round(leadBeats*(60000/currentTempo));
     playWithMeText.textContent='Prépare-toi… à toi dans '+leadBeats+' temps.';
     if(playWithMeNext)playWithMeNext.disabled=true;
     clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=setTimeout(()=>{
      if(!playWithMeActive||playWithMePhase!=='answer')return;
      if(playWithMeNext)playWithMeNext.disabled=false;
      playWithMeText.textContent=playWithMeAnswerMode?.value==='timed'?'À toi : rejoue la phrase. La phrase suivante partira automatiquement.':'À toi : rejoue maintenant exactement la même phrase.';
      if(playWithMeAnswerMode?.value==='timed')startPlayWithMeTimedAnswer();
     },leadMs);
     return;
    }
    if(playWithMeAnswerMode?.value==='timed'){
     playWithMeText.textContent='À toi : rejoue la phrase. La phrase suivante partira automatiquement.';
     startPlayWithMeTimedAnswer();
    }
   }
   playWithMeLastTick=tick;
  }
  if(!practiceLoop){lastLoopTick=tick;return;}
  const range=practiceTicks();if(!range)return;
  if(lastLoopTick>=0&&tick<lastLoopTick){
   practiceIteration++;if(!sessionFirstPracticeAt){sessionFirstPracticeAt=Date.now();sessionStartHint=''}sessionRepCount++;sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();updatePracticeProgress(practiceIteration);
   const max=Math.max(1,+loopRepeats.value||1);
   if(practiceIteration>=max){
    updatePracticeProgress(max);
    sessionSeriesCount++;paintSession();
    practiceIteration=0;
    const autoStep=advanceAutoBpm();
    if(autoStep){
     const {next,reached}=autoStep;
     const original=practiceScore?.tempo||120;
     api.playbackSpeed=Math.max(.25,Math.min(3,next/original));
     if(reached){
      api.isLooping=false;
      practiceLoop=false;
      loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
      pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});try{api.pause()}catch(_){}
      practiceStatus.textContent='Objectif atteint • '+next+' BPM';
      if(sessionRepCount||sessionSeriesCount)saveCurrentSession();
     }else{
      // Auto BPM starts a genuinely new series. alphaTab has already wrapped
      // to the loop start when we detect the completed repetition, so pause it
      // there and run the configured count-in before allowing the next series.
      try{api.pause();api.tickPosition=range.start}catch(_){}
      pauseAlphaPracticeAccompaniment();
      lastLoopTick=-1;
      countInThenPlay(api,()=>{
       // The next Auto BPM series belongs to this exact alphaTab instance.
       // A score/transport replacement during count-in must not restart media
       // or playback through the stale API that completed the previous series.
       if(!practiceLoop||window.guitarLibertyAlphaTab!==api)return;
       startAlphaPracticePlayback(api,{restartAccompaniment:true});
      });
     }
    }else{
     api.isLooping=false;practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
     pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});try{api.pause()}catch(_){}
     practiceStatus.textContent='Série terminée • prêt à reprendre';
     paintSession();
    }
   }else practiceStatus.textContent='En cours • Répétition '+(practiceIteration+1)+'/'+max;
  }
  lastLoopTick=tick;
  if(!playbackFollowEnabled){
   if(Number.isFinite(lockedPageY)&&Math.abs(window.scrollY-lockedPageY)>1)window.scrollTo(0,lockedPageY);
   const paper=document.querySelector('.paper');if(paper&&Number.isFinite(lockedPaperY)&&Math.abs(paper.scrollTop-lockedPaperY)>1)paper.scrollTop=lockedPaperY;
  }
 });

 let completed=false,resolveLoad,rejectLoad;
 const loadResult=new Promise((resolve,reject)=>{resolveLoad=resolve;rejectLoad=reject;alphaTabPendingResolve=resolve;});
 const cleanupFailedAlphaLoad=()=>{
  if(alphaTabPendingResolve===resolveLoad)alphaTabPendingResolve=null;
  const ownsActiveScore=window.guitarLibertyAlphaTab===api;
  if(ownsActiveScore)window.guitarLibertyAlphaTab=null;
  try{api.destroy()}catch(_){try{api.stop()}catch(__){}}
  // A superseded API may fail after a newer score already owns the shared TAB
  // container. Only the active API is allowed to clear shared renderer state.
  if(!ownsActiveScore)return;
  alphaTabMode=false;practiceScore=null;playCursor=null;alphaPlayedBeat=null;
  if(alphaTabClickHandler){tab.removeEventListener('click',alphaTabClickHandler);alphaTabClickHandler=null;}
  tab.classList.remove('alphatab-score');tab.innerHTML='';
  document.querySelector('#play').textContent='▶ PLAY';
 };
 api.renderFinished.on(()=>{ if(!isActiveLoad())return; tab.style.minHeight='420px'; playCursor=null; requestAnimationFrame(()=>{if(!isActiveLoad())return;drawLeftHandFingerings(api);paintSmartFretboard()}); importStatus.textContent=file.name+' — tablature affichée'; });
 api.scoreLoaded.on(score=>{
  if(!isActiveLoad()||completed)return;
  try{
   completed=true;
  const loadedTitle=score.title||file.name.replace(/\.[^.]+$/,'');
  if(!restoring&&sessionStarted&&currentPracticeTitle!==loadedTitle){pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');try{api.pause()}catch(_){}resetTrainingSession();practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);}
  if(!restoring)document.querySelector('#play').textContent='▶ PLAY';
  // A successfully parsed Guitar Pro score supersedes any unresolved MXL/MIDI
  // selection left by the placeholder import path.
  window.pendingImportedScore=null;
  practiceScore=score; syncPracticeRange(); if(playWithMeBar){playWithMeBar.max=practiceBars().length||1;playWithMeBar.value=Math.min(+playWithMeBar.value||1,practiceBars().length||1)}
  currentPracticeTitle=loadedTitle;
  // Manual imports may expose an internal Guitar Pro title different from the
  // filename. Keep lesson completion/mastery keyed to the same exercise identity
  // used by history, preferred tempo and BPM goals.
  if(currentLessonId?.startsWith('import:')){
   currentLessonId='import:'+currentPracticeTitle;
   paintLessonComplete();
   paintLessonMastery();
  }
  const previousRows=readHistory().filter(x=>(x.exercise||x.title)===currentPracticeTitle),previousSession=latestExerciseSession(previousRows),lastWorkedTempo=previousSession?(+previousSession.end||+previousSession.best||0):0,completedTempos=previousRows.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0).filter(v=>v>0).sort((a,b)=>b-a),confirmedTempo=completedTempos.length>=2?completedTempos[1]:0,savedTempo=savedExerciseTempo(currentPracticeTitle),resumeTempo=savedTempo||confirmedTempo||lastWorkedTempo,previousGoal=savedExerciseGoal(currentPracticeTitle)||(previousSession&&Number.isFinite(+previousSession.goal)?+previousSession.goal:0);
  tempo.value=resumeTempo||score.tempo||tempo.value;
  targetBpm.value=Math.max(previousGoal,+tempo.value||0);
  syncTempo();setAlphaTempo(api);
  document.querySelector('#title').textContent=currentPracticeTitle;renderPlayWithMeHistory();renderExerciseProgress();paintMeasureMemory();paintSmartFretboard();refreshDashboard();if(!sessionStarted)paintSessionInsight();
  document.querySelector('#subtitle').textContent='Guitar Pro • rendu alphaTab';
  importStatus.textContent=file.name+' — import réussi';
   // Publish the restoration source only after the score and all dependent
   // practice UI state have initialized successfully. A partially initialized
   // score must never become the fallback for a later failed import.
   currentAlphaTabSource={name:file.name,ext:file.ext||'.gp',bytes:new Uint8Array(bytes)};
   if(alphaTabPendingResolve===resolveLoad)alphaTabPendingResolve=null;
   resolveLoad(true);
  }catch(err){
   if(!isActiveLoad())return;
   completed=true;
   console.error('alphaTab score initialization error',err);
   importStatus.textContent='Erreur initialisation Guitar Pro : '+(err?.message||String(err));
   cleanupFailedAlphaLoad();
   rejectLoad(err instanceof Error?err:new Error(String(err)));
  }
 });
 api.error.on(err=>{
  if(!isActiveLoad()||completed)return;
  completed=true;
  const msg=err?.message||String(err);
  console.error('alphaTab import error',err);
  importStatus.textContent='Erreur Guitar Pro : '+msg;
  cleanupFailedAlphaLoad();
  rejectLoad(err instanceof Error?err:new Error(msg));
 });
 importStatus.textContent='Chargement de '+file.name+'…';
 let accepted;
 try{
  accepted=api.load(bytes);
 }catch(err){
  // Some malformed/unsupported inputs can fail synchronously before alphaTab's
  // error event owns the rejection path. Release this load's shared resolver
  // and renderer state immediately instead of leaving a ghost active API.
  cleanupFailedAlphaLoad();
  throw err;
 }
 if(!accepted){cleanupFailedAlphaLoad();throw new Error('alphaTab a refusé les données du fichier.');}
 setTimeout(()=>{if(isActiveLoad()&&!completed)importStatus.textContent='Chargement en cours… si rien ne s’affiche, ouvre la console pour le diagnostic.';},3000);
 return await loadResult;
}
function setTutorial(url){
 currentTutorialUrl=url||null;
 if(tutorialNotice)tutorialNotice.hidden=true;
 if(tutorialToggle){tutorialToggle.classList.remove('active');tutorialToggle.textContent=currentTutorialUrl?'▶ TUTORIEL':'▶ TUTORIEL • À VENIR';}
}
if(tutorialToggle)tutorialToggle.onclick=()=>{
 if(currentTutorialUrl){
   window.open(currentTutorialUrl,'_blank');
 }else{
   tutorialNotice.hidden=!tutorialNotice.hidden;
   tutorialNoticeText.textContent='Le tutoriel vidéo de « '+currentPracticeTitle+' » sera disponible prochainement.';
   tutorialToggle.classList.toggle('active',!tutorialNotice.hidden);
 }
};
async function loadBundledScore(button){
 const url=button.dataset.score;if(!url)return;
 const previousAlphaTabApi=alphaTabMode?window.guitarLibertyAlphaTab:null;
 const previousAlphaTabWasPlaying=!!(previousAlphaTabApi?.playerState===1);
 const previousAlphaTabTickPosition=previousAlphaTabApi?Math.max(0,+previousAlphaTabApi.tickPosition||0):0;
 const previousBackingTime=backingAudio?Math.max(0,+backingAudio.currentTime||0):0;
 const previousLocalVideoTime=practiceVideo&&!practiceVideo.hidden?Math.max(0,+practiceVideo.currentTime||0):0;
 const previousWistiaTime=getWistiaTime();
 // A library selection immediately invalidates the previous transport and any
 // alphaTab load still in flight. Do this before the library fetch so an older
 // import cannot finish and publish its score while the new lesson is downloading.
 invalidateAlphaTabLoad();
 stop();
 // Listening is tied to the score being analysed. Stop it before another
 // library score can become authoritative; audio device preferences remain.
 if(listening)stopListening();
 // Switching exercises is not active practice time. Stop counting as soon as
 // the user commits to the new library exercise, before fetch/parsing begins.
 pausePracticeClock();
 const previousLibraryButton=document.querySelector('.library-exercise.active');
 const previousLibraryState={
  lessonId:currentLessonId,objective:lessonObjective.textContent,prereq:lessonPrereq.textContent,
  difficulty:lessonDifficulty.textContent,key:lessonKey.textContent,lessonTempo:lessonTempo.textContent,
  backingUrl:currentBackingUrl,backingLeadBeats:currentBackingLeadBeats,backingTime:previousBackingTime,localVideoTime:previousLocalVideoTime,wistiaTime:previousWistiaTime,
  wistiaId:currentWistiaId,practiceVideoUrl:currentPracticeVideoUrl,videoLeadBeats:currentVideoLeadBeats,videoSourceBpm:currentVideoSourceBpm,videoEnabledValue:videoEnabled,
  tutorialUrl:currentTutorialUrl,practiceTitle:currentPracticeTitle,
  workingTempo:+tempo.value||0,targetTempo:+targetBpm.value||0,autoBpmValue:+autoBpm.value||0,
  practiceLoop,practiceIteration,lastLoopTick,
  loopStartValue:+loopStart.value||1,loopEndValue:+loopEnd.value||1,loopRepeatsValue:+loopRepeats.value||1,
  practiceStatusText:practiceStatus.textContent,
  libertyLevelValue:libertyLevel?.value??'100',libertyAutoValue:libertyAuto?.value??'manual',
  libertyCycleValue:libertyCycle?.value??'',libertyStartFadeValue:libertyStartFade?.value??'1',
  sessionLowestLibertyLevel,
  playWithMeBarValue:+playWithMeBar?.value||1,playWithMeLengthValue:+playWithMeLength?.value||1,
  playWithMeRepeatValue:+playWithMeRepeat?.value||1,playWithMeAnswerModeValue:playWithMeAnswerMode?.value??'manual',
  playWithMeSessionLengthValue:playWithMeSessionLength?.value??'all',playWithMeLeadValue:playWithMeLead?.value??'0',
  playWithMeRoundCountValue:playWithMeRoundCount,playWithMePhraseRepeatValue:playWithMePhraseRepeat,
  analysisHitsValue:analysisHits,analysisTotalValue:analysisTotal,timingHitsValue:timingHits,
  currentAnalysisMeasureValue:currentAnalysisMeasure,
  measurePerformanceValue:JSON.parse(JSON.stringify(measurePerformance||{})),
  weakMeasureValue:weakMeasure,
  adaptiveModeValue:adaptiveMode,adaptiveMeasureNoValue:adaptiveMeasureNo,
  adaptiveBaselineValue:adaptiveBaseline?JSON.parse(JSON.stringify(adaptiveBaseline)):null,
  adaptivePassesValue:adaptivePasses,
  adaptiveLastTotalsValue:JSON.parse(JSON.stringify(adaptiveLastTotals||{})),
  sessionSeriesCount,sessionRepCount,sessionBest,
  pendingImportedScore:window.pendingImportedScore||null,
  alphaWasPlaying:previousAlphaTabWasPlaying&&!!currentAlphaTabSource,
  alphaTickPosition:previousAlphaTabTickPosition,
  alphaSource:alphaTabMode&&currentAlphaTabSource?{name:currentAlphaTabSource.name,ext:currentAlphaTabSource.ext,bytes:new Uint8Array(currentAlphaTabSource.bytes)}:null,
  internalExerciseKey:!alphaTabMode&&exercises[current]?current:null
 };
 const libraryGeneration=++libraryLoadGeneration;
 const isCurrentLibraryLoad=()=>libraryGeneration===libraryLoadGeneration;
 // From this point on, only this generation may stage the next lesson UI.
 // This keeps rapid A → B library clicks from letting A repaint context after B owns the request.
 if(!isCurrentLibraryLoad())return;
 setLessonInfo(button);
 if(!isCurrentLibraryLoad())return;
 setBackingTrack(button.dataset.backing||null);
 setVideoTrack(button.dataset.wistiaId||null,button.dataset.practiceVideo||null);
 setTutorial(button.dataset.tutorial||null);
 currentBackingLeadBeats=Math.max(0,+button.dataset.backingLeadBeats||0);
 currentVideoLeadBeats=Math.max(0,+button.dataset.videoLeadBeats||0);
 const libraryDefaultBpm=+button.dataset.bpm||0;
 currentVideoSourceBpm=libraryDefaultBpm||50;
 if(libraryDefaultBpm){tempo.value=libraryDefaultBpm;syncTempo();}
 if(!isCurrentLibraryLoad())return;
 try{
  stop();if(!isCurrentLibraryLoad())return;document.querySelectorAll('.library-exercise').forEach(b=>b.classList.toggle('active',b===button));
  importStatus.textContent='Chargement de '+button.textContent.trim()+'…';
  const response=await fetch(url);if(!isCurrentLibraryLoad())return;if(!response.ok)throw new Error('fichier intégré introuvable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!isCurrentLibraryLoad())return;
  const loaded=await loadWithAlphaTab({name:button.textContent.trim()+'.gp',ext:'.gp',bytes});
  if(!loaded)return;
  if(currentPracticeTitle&&savedExerciseTempo(currentPracticeTitle)){tempo.value=savedExerciseTempo(currentPracticeTitle);syncTempo();if(window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab)}
 }catch(err){
  if(!isCurrentLibraryLoad())return;
  console.error(err);
  if(previousLibraryState.alphaSource){
   try{await loadWithAlphaTab(previousLibraryState.alphaSource,{restoring:true})}catch(restoreErr){console.error('Unable to restore previous library score',restoreErr)}
   // A newer library click may have taken ownership while the old score was
   // being rebuilt. Never let this stale recovery repaint that newer lesson.
   if(!isCurrentLibraryLoad())return;
  }else if(previousLibraryState.internalExerciseKey&&exercises[previousLibraryState.internalExerciseKey]){
   invalidateAlphaTabLoad();
   const failedApi=window.guitarLibertyAlphaTab;
   if(failedApi){try{failedApi.destroy()}catch(_){try{failedApi.stop()}catch(__){}}}
   window.guitarLibertyAlphaTab=null;alphaTabMode=false;practiceScore=null;playCursor=null;alphaPlayedBeat=null;
   tab.classList.remove('alphatab-score');
   current=previousLibraryState.internalExerciseKey;render();
  }
  // Restore unresolved MXL/MIDI only after the active score has been rebuilt,
  // because alphaTab success intentionally clears pending imports.
  window.pendingImportedScore=previousLibraryState.pendingImportedScore;
  currentLessonId=previousLibraryState.lessonId;
  lessonObjective.textContent=previousLibraryState.objective;lessonPrereq.textContent=previousLibraryState.prereq;
  lessonDifficulty.textContent=previousLibraryState.difficulty;lessonKey.textContent=previousLibraryState.key;lessonTempo.textContent=previousLibraryState.lessonTempo;
  setBackingTrack(previousLibraryState.backingUrl);currentBackingLeadBeats=previousLibraryState.backingLeadBeats;restoreBackingTime(previousLibraryState.backingTime);
  setVideoTrack(previousLibraryState.wistiaId,previousLibraryState.practiceVideoUrl);currentVideoLeadBeats=previousLibraryState.videoLeadBeats;currentVideoSourceBpm=previousLibraryState.videoSourceBpm||50;restoreLocalVideoTime(previousLibraryState.localVideoTime);restoreWistiaTime(previousLibraryState.wistiaTime);
  setTutorial(previousLibraryState.tutorialUrl);
  currentPracticeTitle=previousLibraryState.practiceTitle;
  document.querySelector('#title').textContent=currentPracticeTitle;
  if(previousLibraryState.workingTempo)tempo.value=previousLibraryState.workingTempo;
  if(previousLibraryState.targetTempo)targetBpm.value=previousLibraryState.targetTempo;
  autoBpm.value=previousLibraryState.autoBpmValue;
  syncTempo();if(window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab);if(previousLibraryState.videoEnabledValue)openVideo();
  practiceLoop=previousLibraryState.practiceLoop;
  practiceIteration=previousLibraryState.practiceIteration;
  // A failed library switch rebuilds the previous score in a new alphaTab
  // player. Re-arm loop-wrap detection instead of carrying a tick from the
  // destroyed player into the restored instance.
  lastLoopTick=-1;
  loopStart.value=previousLibraryState.loopStartValue;
  loopEnd.value=previousLibraryState.loopEndValue;
  loopRepeats.value=previousLibraryState.loopRepeatsValue;
  syncPracticeRange();
  if(window.guitarLibertyAlphaTab){practiceLoop?setPracticeRange(window.guitarLibertyAlphaTab):clearPracticeRange(window.guitarLibertyAlphaTab)}
  restoreAlphaTick(window.guitarLibertyAlphaTab,previousLibraryState.alphaTickPosition);
  sessionSeriesCount=previousLibraryState.sessionSeriesCount;
  sessionRepCount=previousLibraryState.sessionRepCount;
  sessionBest=previousLibraryState.sessionBest;
  sessionLowestLibertyLevel=previousLibraryState.sessionLowestLibertyLevel;
  if(playWithMeBar)playWithMeBar.value=previousLibraryState.playWithMeBarValue;
  if(playWithMeLength)playWithMeLength.value=previousLibraryState.playWithMeLengthValue;
  if(playWithMeRepeat)playWithMeRepeat.value=previousLibraryState.playWithMeRepeatValue;
  if(playWithMeAnswerMode)playWithMeAnswerMode.value=previousLibraryState.playWithMeAnswerModeValue;
  if(playWithMeSessionLength)playWithMeSessionLength.value=previousLibraryState.playWithMeSessionLengthValue;
  if(playWithMeLead)playWithMeLead.value=previousLibraryState.playWithMeLeadValue;
  playWithMeRoundCount=previousLibraryState.playWithMeRoundCountValue;
  playWithMePhraseRepeat=previousLibraryState.playWithMePhraseRepeatValue;
  playWithMeActive=false;playWithMeRange=null;playWithMeLastTick=-1;
  playWithMePaint('idle');
  if(playWithMeStart)playWithMeStart.disabled=false;
  if(playWithMeReplay)playWithMeReplay.disabled=true;
  if(playWithMeRestart)playWithMeRestart.disabled=true;
  if(playWithMeResume)playWithMeResume.disabled=false;
  if(playWithMeNext)playWithMeNext.disabled=true;
  if(playWithMeStop)playWithMeStop.disabled=true;
  analysisHits=previousLibraryState.analysisHitsValue;
  analysisTotal=previousLibraryState.analysisTotalValue;
  timingHits=previousLibraryState.timingHitsValue;
  currentAnalysisMeasure=previousLibraryState.currentAnalysisMeasureValue;
  measurePerformance=JSON.parse(JSON.stringify(previousLibraryState.measurePerformanceValue||{}));
  weakMeasure=previousLibraryState.weakMeasureValue;
  adaptiveMode=previousLibraryState.adaptiveModeValue;
  adaptiveMeasureNo=previousLibraryState.adaptiveMeasureNoValue;
  adaptiveBaseline=previousLibraryState.adaptiveBaselineValue?JSON.parse(JSON.stringify(previousLibraryState.adaptiveBaselineValue)):null;
  adaptivePasses=previousLibraryState.adaptivePassesValue;
  adaptiveLastTotals=JSON.parse(JSON.stringify(previousLibraryState.adaptiveLastTotalsValue||{}));
  refreshPerformanceScores();paintMeasureAnalysis();restoreAdaptivePanelState();restoreCoachAfterScoreFailure();
  if(libertyAuto)libertyAuto.value=previousLibraryState.libertyAutoValue;
  if(libertyCycle)libertyCycle.value=previousLibraryState.libertyCycleValue;
  if(libertyStartFade)libertyStartFade.value=previousLibraryState.libertyStartFadeValue;
  if(libertyLevel)libertyLevel.value=previousLibraryState.libertyLevelValue;
  applyLibertyMode();
  sessionLowestLibertyLevel=previousLibraryState.sessionLowestLibertyLevel;
  loopToggle.textContent=practiceLoop?'↻ LOOP ON':'↻ LOOP OFF';
  loopToggle.classList.toggle('active',practiceLoop);
  updatePracticeProgress(practiceIteration);
  if(previousLibraryState.alphaWasPlaying&&window.guitarLibertyAlphaTab){
   alphaTabResumePending=true;
   document.querySelector('#play').textContent='▶ REPRENDRE';
   practiceStatus.textContent=practiceLoop?'Prêt à reprendre • répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'Prêt à reprendre';
  }else{
   practiceStatus.textContent=/^(En cours|Compte\s*:)/.test(previousLibraryState.practiceStatusText||'')?'Prêt à reprendre':previousLibraryState.practiceStatusText;
  }
  paintSession();
  document.querySelectorAll('.library-exercise').forEach(b=>b.classList.toggle('active',b===previousLibraryButton));
  paintLessonComplete();paintLessonMastery();
  renderPlayWithMeHistory();renderExerciseProgress();paintMeasureMemory();paintSmartFretboard();refreshDashboard();if(!sessionStarted)paintSessionInsight();
  importStatus.textContent='Exercice non installé : '+button.textContent.trim();
 }
}
document.querySelectorAll('.library-exercise').forEach(b=>b.onclick=()=>{if(!b.classList.contains('course-locked'))loadBundledScore(b)});
refreshCourseProgress();
if(importButton) importButton.onclick=async()=>{
 // A manual import becomes the newest score request immediately. Invalidate
 // any library fetch still in flight so it cannot take over afterwards.
 const importLibraryGeneration=++libraryLoadGeneration;
 // libraryLoadGeneration is the ownership guard while the native picker is
 // open. Do not invalidate alphaTab here: the currently authoritative score
 // may still be finishing its initial render, and cancelling the picker must
 // leave that score intact. A stale library request is already prevented from
 // publishing lesson state by its generation checks.
 // Opening the file picker interrupts active practice too. Pause before the
 // native dialog opens so time spent browsing files is never counted.
 const wasPracticeClockRunning=!!(sessionStarted&&sessionFirstPracticeAt&&!sessionPausedAt);
 const previousImportAlphaTabApi=alphaTabMode?window.guitarLibertyAlphaTab:null;
 const previousImportAlphaTickPosition=previousImportAlphaTabApi?Math.max(0,+previousImportAlphaTabApi.tickPosition||0):0;
 const previousImportBackingTime=backingAudio?Math.max(0,+backingAudio.currentTime||0):0;
 const previousImportLocalVideoTime=practiceVideo&&!practiceVideo.hidden?Math.max(0,+practiceVideo.currentTime||0):0;
 const previousImportWistiaTime=getWistiaTime();
 const previousImportAlphaWasPlaying=!!(previousImportAlphaTabApi&&previousImportAlphaTabApi.playerState===1);
 const importInterruptedPreparation=!!(internalPlaybackPreparing||alphaTabMediaPreparing||countInActive);
 const importInterruptedPlayback=!!(backingStartTimer||leadInResumePending||playing||(alphaTabMode&&window.guitarLibertyAlphaTab?.playerState===1)||(practiceVideo&&!practiceVideo.paused)||isWistiaPlaying());
 pausePracticeClock();
 cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});
 if(alphaTabMode&&window.guitarLibertyAlphaTab){try{window.guitarLibertyAlphaTab.pause()}catch(_){}}
 if(playing){playing=false;clearInternalTimer();stopAllVoices();}
 if(practiceVideo&&!practiceVideo.paused)practiceVideo.pause();
 if(isWistiaPlaying())pauseWistiaPracticeVideo();
 if(importInterruptedPlayback){
  alphaTabResumePending=alphaTabMode;
  document.querySelector('#play').textContent='▶ REPRENDRE';
  practiceStatus.textContent=practiceLoop?'Prêt à reprendre • répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'Prêt à reprendre';
  paintSession();
 }else if(importInterruptedPreparation){
  document.querySelector('#play').textContent='▶ PLAY';
  practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
 }
 const resumeUnchangedPracticeClock=()=>{
  // The score is unchanged, but transport remains intentionally paused.
  // Practice time resumes only on the next real played passage.
  if(importInterruptedPlayback)return;
  if(wasPracticeClockRunning&&importLibraryGeneration===libraryLoadGeneration)resumePracticeClock();
 };
 const file=await window.guitarAudio.importScore();
 // A newer library/import request owns the practice clock now. A stale picker
 // must not resume or otherwise mutate the session it no longer belongs to.
 if(importLibraryGeneration!==libraryLoadGeneration)return;
 if(!file){
  // Cancelling the still-current picker changes no exercise. Resume only if
  // practice was actually running before the dialog opened.
  resumeUnchangedPracticeClock();
  return;
 }
 const previousAlphaTabSource=alphaTabMode&&currentAlphaTabSource?{name:currentAlphaTabSource.name,ext:currentAlphaTabSource.ext,bytes:new Uint8Array(currentAlphaTabSource.bytes)}:null;
 const previousInternalExerciseKey=!alphaTabMode&&exercises[current]?current:null;
 const previousLessonContext={
  id:currentLessonId,
  objective:lessonObjective.textContent,prereq:lessonPrereq.textContent,
  difficulty:lessonDifficulty.textContent,key:lessonKey.textContent,tempo:lessonTempo.textContent,
  backingUrl:currentBackingUrl,backingLeadBeats:currentBackingLeadBeats,backingTime:previousImportBackingTime,localVideoTime:previousImportLocalVideoTime,wistiaTime:previousImportWistiaTime,
  wistiaId:currentWistiaId,practiceVideoUrl:currentPracticeVideoUrl,videoLeadBeats:currentVideoLeadBeats,videoSourceBpm:currentVideoSourceBpm,videoEnabledValue:videoEnabled,
  tutorialUrl:currentTutorialUrl,
  practiceTitle:currentPracticeTitle,
  workingTempo:+tempo.value||0,targetTempo:+targetBpm.value||0,autoBpmValue:+autoBpm.value||0,
  practiceLoop,practiceIteration,lastLoopTick,
  loopStartValue:+loopStart.value||1,loopEndValue:+loopEnd.value||1,loopRepeatsValue:+loopRepeats.value||1,
  practiceStatusText:practiceStatus.textContent,
  libertyLevelValue:libertyLevel?.value??'100',libertyAutoValue:libertyAuto?.value??'manual',
  libertyCycleValue:libertyCycle?.value??'',libertyStartFadeValue:libertyStartFade?.value??'1',
  sessionLowestLibertyLevel,
  playWithMeBarValue:+playWithMeBar?.value||1,playWithMeLengthValue:+playWithMeLength?.value||1,
  playWithMeRepeatValue:+playWithMeRepeat?.value||1,playWithMeAnswerModeValue:playWithMeAnswerMode?.value??'manual',
  playWithMeSessionLengthValue:playWithMeSessionLength?.value??'all',playWithMeLeadValue:playWithMeLead?.value??'0',
  playWithMeRoundCountValue:playWithMeRoundCount,playWithMePhraseRepeatValue:playWithMePhraseRepeat,
  analysisHitsValue:analysisHits,analysisTotalValue:analysisTotal,timingHitsValue:timingHits,
  currentAnalysisMeasureValue:currentAnalysisMeasure,
  measurePerformanceValue:JSON.parse(JSON.stringify(measurePerformance||{})),
  weakMeasureValue:weakMeasure,
  adaptiveModeValue:adaptiveMode,adaptiveMeasureNoValue:adaptiveMeasureNo,
  adaptiveBaselineValue:adaptiveBaseline?JSON.parse(JSON.stringify(adaptiveBaseline)):null,
  adaptivePassesValue:adaptivePasses,
  adaptiveLastTotalsValue:JSON.parse(JSON.stringify(adaptiveLastTotals||{})),
  sessionSeriesCount,sessionRepCount,sessionBest,
  pendingImportedScore:window.pendingImportedScore||null,
  alphaWasPlaying:previousImportAlphaWasPlaying&&!!previousAlphaTabSource,
  alphaTickPosition:previousImportAlphaTickPosition,
  activeLibraryScore:document.querySelector('.library-exercise.active')?.dataset.score||null
 };
 const importStillCurrent=()=>importLibraryGeneration===libraryLoadGeneration;
 const restorePreviousLessonContext=()=>{
  if(!importStillCurrent())return false;
  currentLessonId=previousLessonContext.id;
  lessonObjective.textContent=previousLessonContext.objective;
  lessonPrereq.textContent=previousLessonContext.prereq;
  lessonDifficulty.textContent=previousLessonContext.difficulty;
  lessonKey.textContent=previousLessonContext.key;
  lessonTempo.textContent=previousLessonContext.tempo;
  setBackingTrack(previousLessonContext.backingUrl);
  currentBackingLeadBeats=previousLessonContext.backingLeadBeats;
  restoreBackingTime(previousLessonContext.backingTime);
  setVideoTrack(previousLessonContext.wistiaId,previousLessonContext.practiceVideoUrl);
  restoreLocalVideoTime(previousLessonContext.localVideoTime);
  restoreWistiaTime(previousLessonContext.wistiaTime);
  currentVideoLeadBeats=previousLessonContext.videoLeadBeats;
  currentVideoSourceBpm=previousLessonContext.videoSourceBpm||50;
  setTutorial(previousLessonContext.tutorialUrl);
  currentPracticeTitle=previousLessonContext.practiceTitle;
  if(previousLessonContext.workingTempo)tempo.value=previousLessonContext.workingTempo;
  if(previousLessonContext.targetTempo)targetBpm.value=previousLessonContext.targetTempo;
  autoBpm.value=previousLessonContext.autoBpmValue;
  syncTempo();
  if(window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab);
  if(previousLessonContext.videoEnabledValue)openVideo();
  practiceLoop=previousLessonContext.practiceLoop;
  practiceIteration=previousLessonContext.practiceIteration;
  // The restored score uses a new alphaTab player instance. The previous
  // lastLoopTick belongs to the destroyed player and could make the first
  // position event look like a loop wrap. Re-arm wrap detection from the
  // first tick emitted by the restored instance instead.
  lastLoopTick=-1;
  loopStart.value=previousLessonContext.loopStartValue;
  loopEnd.value=previousLessonContext.loopEndValue;
  loopRepeats.value=previousLessonContext.loopRepeatsValue;
  syncPracticeRange();
  if(window.guitarLibertyAlphaTab){practiceLoop?setPracticeRange(window.guitarLibertyAlphaTab):clearPracticeRange(window.guitarLibertyAlphaTab)}
  restoreAlphaTick(window.guitarLibertyAlphaTab,previousLessonContext.alphaTickPosition);
  sessionSeriesCount=previousLessonContext.sessionSeriesCount;
  sessionRepCount=previousLessonContext.sessionRepCount;
  sessionBest=previousLessonContext.sessionBest;
  sessionLowestLibertyLevel=previousLessonContext.sessionLowestLibertyLevel;
  if(playWithMeBar)playWithMeBar.value=previousLessonContext.playWithMeBarValue;
  if(playWithMeLength)playWithMeLength.value=previousLessonContext.playWithMeLengthValue;
  if(playWithMeRepeat)playWithMeRepeat.value=previousLessonContext.playWithMeRepeatValue;
  if(playWithMeAnswerMode)playWithMeAnswerMode.value=previousLessonContext.playWithMeAnswerModeValue;
  if(playWithMeSessionLength)playWithMeSessionLength.value=previousLessonContext.playWithMeSessionLengthValue;
  if(playWithMeLead)playWithMeLead.value=previousLessonContext.playWithMeLeadValue;
  playWithMeRoundCount=previousLessonContext.playWithMeRoundCountValue;
  playWithMePhraseRepeat=previousLessonContext.playWithMePhraseRepeatValue;
  playWithMeActive=false;playWithMeRange=null;playWithMeLastTick=-1;
  playWithMePaint('idle');
  if(playWithMeStart)playWithMeStart.disabled=false;
  if(playWithMeReplay)playWithMeReplay.disabled=true;
  if(playWithMeRestart)playWithMeRestart.disabled=true;
  if(playWithMeResume)playWithMeResume.disabled=false;
  if(playWithMeNext)playWithMeNext.disabled=true;
  if(playWithMeStop)playWithMeStop.disabled=true;
  analysisHits=previousLessonContext.analysisHitsValue;
  analysisTotal=previousLessonContext.analysisTotalValue;
  timingHits=previousLessonContext.timingHitsValue;
  currentAnalysisMeasure=previousLessonContext.currentAnalysisMeasureValue;
  measurePerformance=JSON.parse(JSON.stringify(previousLessonContext.measurePerformanceValue||{}));
  weakMeasure=previousLessonContext.weakMeasureValue;
  adaptiveMode=previousLessonContext.adaptiveModeValue;
  adaptiveMeasureNo=previousLessonContext.adaptiveMeasureNoValue;
  adaptiveBaseline=previousLessonContext.adaptiveBaselineValue?JSON.parse(JSON.stringify(previousLessonContext.adaptiveBaselineValue)):null;
  adaptivePasses=previousLessonContext.adaptivePassesValue;
  adaptiveLastTotals=JSON.parse(JSON.stringify(previousLessonContext.adaptiveLastTotalsValue||{}));
  refreshPerformanceScores();paintMeasureAnalysis();restoreAdaptivePanelState();restoreCoachAfterScoreFailure();
  if(libertyAuto)libertyAuto.value=previousLessonContext.libertyAutoValue;
  if(libertyCycle)libertyCycle.value=previousLessonContext.libertyCycleValue;
  if(libertyStartFade)libertyStartFade.value=previousLessonContext.libertyStartFadeValue;
  if(libertyLevel)libertyLevel.value=previousLessonContext.libertyLevelValue;
  applyLibertyMode();
  sessionLowestLibertyLevel=previousLessonContext.sessionLowestLibertyLevel;
  window.pendingImportedScore=previousLessonContext.pendingImportedScore;
  loopToggle.textContent=practiceLoop?'↻ LOOP ON':'↻ LOOP OFF';
  loopToggle.classList.toggle('active',practiceLoop);
  updatePracticeProgress(practiceIteration);
  if(previousLessonContext.alphaWasPlaying&&window.guitarLibertyAlphaTab){
   alphaTabResumePending=true;
   document.querySelector('#play').textContent='▶ REPRENDRE';
   practiceStatus.textContent=practiceLoop?'Prêt à reprendre • répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'Prêt à reprendre';
  }else{
   practiceStatus.textContent=/^(En cours|Compte\s*:)/.test(previousLessonContext.practiceStatusText||'')?'Prêt à reprendre':previousLessonContext.practiceStatusText;
  }
  paintSession();
  document.querySelector('#title').textContent=currentPracticeTitle;
  document.querySelectorAll('.library-exercise').forEach(b=>b.classList.toggle('active',!!previousLessonContext.activeLibraryScore&&b.dataset.score===previousLessonContext.activeLibraryScore));
  paintLessonComplete();paintLessonMastery();
  renderPlayWithMeHistory();renderExerciseProgress();paintMeasureMemory();paintSmartFretboard();refreshDashboard();if(!sessionStarted)paintSessionInsight();
  return true;
 };
 const restorePreviousScore=async()=>{
  if(!importStillCurrent())return false;
  if(previousAlphaTabSource){
   try{
    const restored=await loadWithAlphaTab(previousAlphaTabSource,{restoring:true});
    if(!importStillCurrent())return false;
    restorePreviousLessonContext();
    return !!restored;
   }catch(restoreErr){
    if(!importStillCurrent())return false;
    console.error('Unable to restore previous alphaTab score',restoreErr);
   }
  }
  if(!importStillCurrent())return false;
  if(previousInternalExerciseKey&&exercises[previousInternalExerciseKey]){
   invalidateAlphaTabLoad();
   const failedApi=window.guitarLibertyAlphaTab;
   if(failedApi){
    try{failedApi.destroy()}catch(_){try{failedApi.stop()}catch(__){}}
   }
   window.guitarLibertyAlphaTab=null;
   alphaTabMode=false;
   practiceScore=null;
   playCursor=null;
   alphaPlayedBeat=null;
   currentAlphaTabSource=null;
   tab.classList.remove('alphatab-score');
   current=previousInternalExerciseKey;
   render();
   if(!importStillCurrent())return false;
   restorePreviousLessonContext();
   return true;
  }
  if(!importStillCurrent())return false;
  restorePreviousLessonContext();
  return false;
 };
 const prepareManualImportContext=()=>{
  // Only a validated, displayable manual import replaces the current score.
  // At that moment ÉCOUTE IA must release the old score and pending note.
  if(listening)stopListening();
  setBackingTrack(null);
  setVideoTrack(null,null);
  setTutorial(null);
  currentBackingLeadBeats=0;
  currentVideoLeadBeats=0;
  document.querySelectorAll('.library-exercise').forEach(b=>b.classList.remove('active'));
  const importedLessonTitle=(file.name||'Tablature importée').replace(/\.(gp|gp3|gp4|gp5|gpx|musicxml|xml|mxl|mid|midi)$/i,'');
  currentLessonId='import:'+importedLessonTitle;
  lessonObjective.textContent='Travailler cette tablature personnelle proprement, à ton rythme.';
  lessonPrereq.textContent='Selon la tablature importée';
  lessonDifficulty.textContent='Personnel';
  lessonKey.textContent='—';
  lessonTempo.textContent='—';
  // Do not calculate mastery against the previous exercise while the imported
  // score title is still unknown. The definitive paint happens once the GP
  // internal title or MusicXML title becomes currentPracticeTitle.
  lessonComplete.classList.remove('complete');
  lessonComplete.textContent='✓ MARQUER TERMINÉ';
  lessonLearningState.textContent='À DÉCOUVRIR';
  lessonLearningState.dataset.state='À DÉCOUVRIR';
  lessonMasteryText.textContent='Chargement de la progression…';
  lessonMasteryBar.style.width='0%';
 
 };
 if(['.gp','.gp3','.gp4','.gp5','.gpx'].includes(file.ext)){
  try{
   // Read and validate the file before replacing the active lesson. Passing the
   // bytes onward also prevents loadWithAlphaTab from performing a second read.
   const rawBytes=file.bytes||await window.guitarAudio.readScore(file.filePath);
   if(importLibraryGeneration!==libraryLoadGeneration)return;
   const bytes=rawBytes instanceof Uint8Array?rawBytes:new Uint8Array(rawBytes);
   if(!bytes.length)throw new Error('Le fichier Guitar Pro est vide.');
   prepareManualImportContext();
   const loaded=await loadWithAlphaTab({...file,bytes});
   if(importLibraryGeneration!==libraryLoadGeneration)return;
   if(!loaded){await restorePreviousScore();if(importLibraryGeneration!==libraryLoadGeneration)return;}
  }catch(err){
   if(importLibraryGeneration!==libraryLoadGeneration)return;
   const scoreReplacementStarted=currentLessonId!==previousLessonContext.id||currentPracticeTitle!==previousLessonContext.practiceTitle;
   await restorePreviousScore();
   if(importLibraryGeneration!==libraryLoadGeneration)return;
   if(!scoreReplacementStarted)resumeUnchangedPracticeClock();
   console.error(err);importStatus.textContent='Erreur Guitar Pro : '+err.message;alert('Impossible de charger cette tablature Guitar Pro : '+err.message);
  }
  return;
 }
 const supported=['.musicxml','.xml','.mxl','.mid','.midi'];
 if(!supported.includes(file.ext)){
  resumeUnchangedPracticeClock();
  importStatus.textContent='Guitar Pro : export MusicXML requis';
  alert('Pour importer cette tablature Guitar Pro dans Guitare Liberty, exporte-la d’abord en MusicXML depuis Guitar Pro.');
  return;
 }
 try{
  if(!['.musicxml','.xml'].includes(file.ext)){
   // MXL/MIDI do not have a visual playback engine yet. Keep the current
   // exercise completely intact instead of pretending the pending file has
   // replaced it. The file remains available for the future importer.
   window.pendingImportedScore=file;
   resumeUnchangedPracticeClock();
   importStatus.textContent=file.name+' sélectionné — ce format n’est pas encore affichable';
   return;
  }
  // Validate MusicXML before replacing the currently active lesson context.
  // A malformed file must leave the existing exercise, media and lesson intact.
  const xmlText=atob(file.data);
  const doc=new DOMParser().parseFromString(xmlText,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('XML invalide');
  const part=doc.querySelector('part');
  if(!part) throw new Error('Aucune partie musicale trouvée');
  prepareManualImportContext();
  const imported=[];
  const importedMeasures=[];
  const stepSemis={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const open=[64,59,55,50,45,40];
  let importedTempo=90,currentDivisions=1,currentBeats=4,currentBeatType=4;
  const soundTempo=doc.querySelector('sound[tempo]');
  if(soundTempo) importedTempo=Math.round(+soundTempo.getAttribute('tempo'))||90;
  part.querySelectorAll('measure').forEach((measure,measureIndex)=>{
   const attr=measure.querySelector(':scope > attributes');
   const newDiv=+(attr?.querySelector('divisions')?.textContent||currentDivisions); if(newDiv)currentDivisions=newDiv;
   const time=attr?.querySelector('time'),oldBeats=currentBeats,oldBeatType=currentBeatType;
   if(time){currentBeats=+(time.querySelector('beats')?.textContent||currentBeats);currentBeatType=+(time.querySelector('beat-type')?.textContent||currentBeatType);}
   const measureLength=currentBeats*(4/currentBeatType);
   const implicitMeasure=measure.getAttribute('implicit')==='yes',nonControllingMeasure=measure.getAttribute('non-controlling')==='yes';
   const md={repeatStart:false,repeatEnd:false,text:'',beats:currentBeats,beatType:currentBeatType,timeChanged:measureIndex===0||oldBeats!==currentBeats||oldBeatType!==currentBeatType,length:measureLength,events:[]};
   measure.querySelectorAll('barline repeat').forEach(rep=>{if(rep.getAttribute('direction')==='forward')md.repeatStart=true;if(rep.getAttribute('direction')==='backward')md.repeatEnd=true;});
   md.text=[...measure.querySelectorAll(':scope > direction direction-type words')].map(w=>w.textContent.trim()).filter(Boolean).join(' • ');
   let cursor=0,maxCursor=0;const lastOnsetByVoice=new Map(),lastPlayableOnsetByVoice=new Map();
   [...measure.children].forEach(node=>{
    const tag=node.tagName;
    if(tag==='backup'){cursor=Math.max(0,cursor+( -+(node.querySelector('duration')?.textContent||0)/currentDivisions));return;}
    if(tag==='forward'){cursor+=+(node.querySelector('duration')?.textContent||0)/currentDivisions;maxCursor=Math.max(maxCursor,cursor);return;}
    if(tag!=='note')return;
    // Preserve the exact MusicXML duration, including very short notes and
    // tuplets. The scheduler can guard zero-length events separately.
    const duration=Math.max(0,+(node.querySelector(':scope > duration')?.textContent||0)/currentDivisions);
    const graceNode=node.querySelector(':scope > grace'),grace=!!graceNode;
    const graceMakeTime=graceNode?.getAttribute('make-time')??null,
          graceStealPrevious=graceNode?.getAttribute('steal-time-previous')??null,
          graceStealFollowing=graceNode?.getAttribute('steal-time-following')??null,
          graceSlash=graceNode?.getAttribute('slash')??null;
    const typeName=node.querySelector(':scope > type')?.textContent||''; const dots=node.querySelectorAll(':scope > dot').length;
    const voice=node.querySelector(':scope > voice')?.textContent?.trim()||'1',staff=node.querySelector(':scope > staff')?.textContent?.trim()||'1',voiceKey=staff+':'+voice;
    const chord=!!node.querySelector(':scope > chord'),onset=chord?(lastPlayableOnsetByVoice.get(voiceKey)??lastOnsetByVoice.get(voiceKey)??cursor):cursor;
    if(chord)maxCursor=Math.max(maxCursor,onset+duration);
    if(!chord){
     // A new primary note always starts a new chord context. Only a playable
     // guitar note below is allowed to establish the next chord anchor.
     lastPlayableOnsetByVoice.delete(voiceKey);
     lastOnsetByVoice.set(voiceKey,onset);cursor+=duration;maxCursor=Math.max(maxCursor,cursor);
    }
    if(node.querySelector(':scope > rest')){const full=!!node.querySelector(':scope > rest[measure="yes"]'),restDuration=full&&!implicitMeasure&&!nonControllingMeasure?measureLength:duration;md.events.push({type:'rest',onset,duration:restDuration,typeName,dots});return;}
    const pitch=node.querySelector(':scope > pitch');if(!pitch)return;
    const step=pitch.querySelector('step')?.textContent||'C',alter=+(pitch.querySelector('alter')?.textContent||0),octave=+(pitch.querySelector('octave')?.textContent||4),midi=(octave+1)*12+stepSemis[step]+alter;
    const tech=node.querySelector('notations technical');let stringNo=+(tech?.querySelector('string')?.textContent||0),fret=+(tech?.querySelector('fret')?.textContent||-1),s=-1;
    if(stringNo>=1&&stringNo<=6&&fret>=0)s=stringNo-1;else for(let candidate=0;candidate<6;candidate++){const f=midi-open[candidate];if(f>=0&&f<=24){s=candidate;fret=f;break;}}
    if(s<0||fret<0)return;
    if(!chord)lastPlayableOnsetByVoice.set(voiceKey,onset);
    const finger=+(tech?.querySelector('fingering')?.textContent||0)||Math.min(4,Math.max(1,fret%4||4));
    const pickDown=!!node.querySelector('notations technical down-bow'),pickUp=!!node.querySelector('notations technical up-bow');
    const tieStart=!!node.querySelector(':scope > tie[type="start"], :scope > notations tied[type="start"]'),tieStop=!!node.querySelector(':scope > tie[type="stop"], :scope > notations tied[type="stop"]');
    const noteIndex=imported.length; imported.push([s,fret,finger,duration,measureIndex+1,onset,null,tieStop,tieStart,voice,staff,grace,chord,noteIndex,graceMakeTime,graceStealPrevious,graceStealFollowing,graceSlash,currentDivisions]);
    md.events.push({type:'note',onset,duration,typeName,dots,string:s,fret,finger,noteIndex,pick:pickDown?'∨':pickUp?'∧':'',tieStart,tieStop,voice,staff,grace,graceMakeTime,graceStealPrevious,graceStealFollowing,graceSlash});
   });
   // Pickup/implicit measures are allowed to be shorter than the current time
   // signature. Use their actual rhythmic extent so playback and tie positions
   // do not acquire a silent remainder that is not present in the score.
   if(implicitMeasure||nonControllingMeasure){
    // MusicXML explicitly marks implicit and non-controlling measures as able
    // to diverge from the nominal time-signature length. Do not guess this for
    // ordinary measures: an omitted final rest can still mean full duration.
    const eventEnd=md.events.reduce((max,ev)=>Math.max(max,(+ev.onset||0)+(+ev.duration||0)),0);
    md.length=Math.max(0,eventEnd,cursor,maxCursor);
   }
   importedMeasures.push(md);
  });
  if(!imported.length) throw new Error('Aucune note de tablature exploitable trouvée');
  // MusicXML voices can rewind the cursor with <backup>. Give every grace
  // attack a rank inside its own voice/staff at this score onset. Sorting by
  // that rank creates parallel layers (A1+B1, A2+B2, ...) without collapsing
  // sequential ornaments on one path into a chord.
  const graceRanks=new Map();
  imported.forEach(note=>{
   if(!note[11])return;
   const key=[+note[4]||1,+note[5]||0,String(note[10]||'1'),String(note[9]||'1')].join(':');
   if(note[12]){
    note[19]=Math.max(0,(graceRanks.get(key)||1)-1);
   }else{
    const rank=graceRanks.get(key)||0;
    note[19]=rank;
    graceRanks.set(key,rank+1);
   }
  });
  // Normalize playback order by musical position and grace layer, then repair
  // each rendered event's noteIndex.
  imported.sort((a,b)=>(+a[4]||1)-(+b[4]||1)||(+a[5]||0)-(+b[5]||0)||(a[11]===b[11]?0:(a[11]?-1:1))||((a[11]&&b[11])?((+a[19]||0)-(+b[19]||0)):0)||String(a[10]||'1').localeCompare(String(b[10]||'1'),undefined,{numeric:true})||String(a[9]||'1').localeCompare(String(b[9]||'1'),undefined,{numeric:true})||((+a[13]||0)-(+b[13]||0)));
  const noteQueues=new Map();
  imported.forEach((note,i)=>{
   const key=[+note[4]||1,+note[5]||0,+note[0]||0,+note[1]||0,String(note[9]||'1'),String(note[10]||'1')].join(':');
   if(!noteQueues.has(key))noteQueues.set(key,[]);
   noteQueues.get(key).push(i);
  });
  importedMeasures.forEach((md,measureIndex)=>md.events.forEach(ev=>{
   if(ev.type!=='note')return;
   const key=[measureIndex+1,+ev.onset||0,+ev.string||0,+ev.fret||0,String(ev.voice||'1'),String(ev.staff||'1')].join(':');
   const queue=noteQueues.get(key);
   if(queue?.length)ev.noteIndex=queue.shift();
  }));
  // Preserve MusicXML rhythmic spacing in the lightweight internal player.
  // Slot 6 stores the real beat distance to the next playable note, including
  // rests, forwards and silent measure tails.
  const measureOffsets=[];let accumulatedBeats=0;
  importedMeasures.forEach((md,i)=>{measureOffsets[i]=accumulatedBeats;accumulatedBeats+=+md.length||0});
  imported.forEach((note,i)=>{
   const absoluteOnset=(measureOffsets[(+note[4]||1)-1]||0)+(+note[5]||0);
   let nextIndex=i+1;
   while(nextIndex<imported.length&&sameInternalOnset(note,imported[nextIndex],{measures:importedMeasures}))nextIndex++;
   const next=imported[nextIndex];
   const nextOnset=next?(measureOffsets[(+next[4]||1)-1]||0)+(+next[5]||0):accumulatedBeats;
   note[6]=Math.max(0,nextOnset-absoluteOnset);
  });
  const key='imported';
  const importedTitle=file.name.replace(/\.(musicxml|xml)$/i,''),historyRows=readHistory().filter(x=>(x.exercise||x.title)===importedTitle),historySession=latestExerciseSession(historyRows),historyLastTempo=historySession?(+historySession.end||+historySession.best||0):0,historyCompleted=historyRows.map(x=>Number.isFinite(+x.end)?+x.end:Number.isFinite(+x.best)?+x.best:0).filter(v=>v>0).sort((a,b)=>b-a),historyConfirmedTempo=historyCompleted.length>=2?historyCompleted[1]:0,rememberedTempo=savedExerciseTempo(importedTitle)||historyConfirmedTempo||historyLastTempo,rememberedGoal=savedExerciseGoal(importedTitle)||(historySession&&Number.isFinite(+historySession.goal)?+historySession.goal:0);
  if(sessionStarted&&currentPracticeTitle!==importedTitle){pausePracticeClock();cancelPracticeTransition({stopBackingAudio:true,stopVideo:true});practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');const api=window.guitarLibertyAlphaTab;if(api){api.isLooping=false;try{api.pause()}catch(_){}}resetTrainingSession();practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);}
  exercises[key]={title:importedTitle,subtitle:'Tablature importée • MusicXML',tempo:rememberedTempo||importedTempo,repeat:1,notes:imported,measures:importedMeasures};
  currentPracticeTitle=importedTitle;
  if(currentLessonId?.startsWith('import:')){
   currentLessonId='import:'+currentPracticeTitle;
   paintLessonComplete();
   paintLessonMastery();
  }
  // Invalidate every alphaTab load still in flight before switching renderers.
  // This prevents a late Guitar Pro callback from taking the UI back after MusicXML is active.
  invalidateAlphaTabLoad();
  const previousApi=window.guitarLibertyAlphaTab;
  stop();
  if(alphaTabClickHandler){tab.removeEventListener('click',alphaTabClickHandler);alphaTabClickHandler=null;}
  if(previousApi){try{previousApi.destroy()}catch(_){try{previousApi.stop()}catch(__){}}}
  alphaPlayedBeat=null;playCursor=null;
  // A renderer switch starts a fresh repetition cursor even when no timed
  // training session was active. Never inherit alphaTab's previous loop pass
  // into the newly imported internal MusicXML score.
  practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);
  alphaTabMode=false;practiceScore=null;if(window.guitarLibertyAlphaTab===previousApi)window.guitarLibertyAlphaTab=null;tab.classList.remove('alphatab-score');
  // MusicXML is now the authoritative score. Never let a later recovery path
  // resurrect a Guitar Pro score that belonged to an older exercise.
  currentAlphaTabSource=null;
  document.querySelector('#play').textContent='▶ PLAY';
  current=key; render();
  // Clamp LOOP controls immediately to the imported score. Waiting until the
  // first internal playback would leave stale bounds from the previous score
  // visible and could describe measures that do not exist in this MusicXML.
  syncPracticeRange();
  if(rememberedTempo){tempo.value=rememberedTempo;syncTempo()}
  targetBpm.value=Math.max(rememberedGoal,+tempo.value||importedTempo);
  renderHistory();refreshDashboard();paintMeasureMemory();if(!sessionStarted)paintSessionInsight();
  document.querySelectorAll('.exercise').forEach(b=>b.classList.remove('active'));
  importStatus.textContent=file.name+' — '+imported.length+' notes affichées';
  // This score is fully active, so there is no longer an unresolved import.
  window.pendingImportedScore=null;
 }catch(err){
  // Parsing can still fail after the validated XML has started replacing the
  // current lesson. Recover the last authoritative score just like a failed GP
  // import, rather than leaving a half-switched MusicXML context on screen.
  if(importLibraryGeneration!==libraryLoadGeneration)return;
  const scoreReplacementStarted=currentLessonId!==previousLessonContext.id||currentPracticeTitle!==previousLessonContext.practiceTitle;
  await restorePreviousScore();
  if(importLibraryGeneration!==libraryLoadGeneration)return;
  if(!scoreReplacementStarted)resumeUnchangedPracticeClock();
  console.error('MusicXML import failed',err);
  importStatus.textContent='Erreur import : '+err.message;
  alert('Impossible d’afficher cette tablature : '+err.message);
 }
};
