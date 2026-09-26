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
let current='chromatic',playing=false,timer=null,audio,index=0,alphaTabMode=false;
let backingAudio=null,backingEnabled=true,currentBackingUrl=null,currentBackingLeadBeats=0,backingStartTimer=null;
let currentWistiaId=null,currentVideoLeadBeats=0,videoEnabled=false,wistiaPlayer=null,currentPracticeVideoUrl=null,videoPracticeTimer=null;
const sampleCache=new Map();
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
   return null;
 }
}
const tab=document.querySelector('#tab'),progress=document.querySelector('#progress'),tempo=document.querySelector('#tempo');
const loopStart=document.querySelector('#loopStart'),loopEnd=document.querySelector('#loopEnd'),loopToggle=document.querySelector('#loopToggle'),loopRepeats=document.querySelector('#loopRepeats'),autoBpm=document.querySelector('#autoBpm'),targetBpm=document.querySelector('#targetBpm'),countIn=document.querySelector('#countIn'),practiceStatus=document.querySelector('#practiceStatus'),practiceProgress=document.querySelector('#practiceProgress'),sessionTime=document.querySelector('#sessionTime'),sessionSeries=document.querySelector('#sessionSeries'),sessionReps=document.querySelector('#sessionReps'),sessionBestBpm=document.querySelector('#sessionBestBpm'),sessionGain=document.querySelector('#sessionGain'),resetSession=document.querySelector('#resetSession'),historyList=document.querySelector('#historyList'),historyCount=document.querySelector('#historyCount'),clearHistory=document.querySelector('#clearHistory'),historyRecord=document.querySelector('#historyRecord'),historySessions=document.querySelector('#historySessions'),historyTime=document.querySelector('#historyTime'),historyStreak=document.querySelector('#historyStreak'),bpmChart=document.querySelector('#bpmChart'),exerciseProgressTitle=document.querySelector('#exerciseProgressTitle'),exerciseProgressStats=document.querySelector('#exerciseProgressStats'),personalBest=document.querySelector('#personalBest'),recordDelta=document.querySelector('#recordDelta'),masteryLevel=document.querySelector('#masteryLevel'),masteryBar=document.querySelector('#masteryBar'),masteryInfo=document.querySelector('#masteryInfo'),pathList=document.querySelector('#pathList'),pathSummary=document.querySelector('#pathSummary');
let practiceLoop=false,practiceScore=null,practiceTimer=null,practiceIteration=0,lastLoopTick=-1,countInAudio=null,playCursor=null;
let sessionStarted=null,sessionSeriesCount=0,sessionRepCount=0,sessionBest=0,sessionStartBpm=0,sessionClock=null,currentPracticeTitle='Exercice';
const HISTORY_KEY='guitarLibertyPracticeHistory';
const LESSON_KEY='guitarLibertyLessonProgress';
const MEASURE_MASTERY_KEY='guitarLibertyMeasureMasteryV1';
const MUSIC_GOAL_KEY='guitarLibertyMusicGoalV1';
const GUITAR_JOURNAL_KEY='guitarLibertyJournalV1';
const lessonComplete=document.querySelector('#lessonComplete'),lessonObjective=document.querySelector('#lessonObjective'),lessonPrereq=document.querySelector('#lessonPrereq'),lessonDifficulty=document.querySelector('#lessonDifficulty'),lessonKey=document.querySelector('#lessonKey'),lessonTempo=document.querySelector('#lessonTempo');
let currentLessonId='';
function lessonProgress(){try{return JSON.parse(localStorage.getItem(LESSON_KEY)||'{}')}catch{return {}}}
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
 const current=+tempo.value||50,next=Math.max(30,Math.round(current*.85));tempo.value=next;tempo.dispatchEvent(new Event('input',{bubbles:true}));
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
 listening=false;cancelAnimationFrame(listenFrame);listenStream?.getTracks().forEach(t=>t.stop());listenContext?.close();guitarMonitor.pause();guitarMonitor.srcObject=null;listenStream=null;listenContext=null;listenAnalyser=null;listenStart.textContent='DÉMARRER L’ANALYSE';listenStart.classList.remove('active');document.querySelector('#listenStatus').textContent='Analyse arrêtée';
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
document.querySelector('#guidedNext').onclick=()=>{if(guidedStep<4){guidedStep++;paintGuided()}else{clearInterval(guidedTimer);guidedTimer=null;guidedSession.hidden=true;saveCurrentSession();refreshDashboard()}};
document.querySelector('#guidedPrev').onclick=()=>{if(guidedStep>0){guidedStep--;paintGuided()}};
document.querySelector('#guidedClose').onclick=()=>{clearInterval(guidedTimer);guidedTimer=null;guidedSession.hidden=true};
function formatDashTime(sec){sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function refreshDashboard(){
 const buttons=courseButtons(),p=lessonProgress(),done=buttons.filter(b=>p[b.dataset.score]);
 const next=buttons.find((b,i)=>!p[b.dataset.score]&&(i===0||p[buttons[i-1].dataset.score]))||null;
 const history=(typeof practiceHistory!=='undefined'?practiceHistory:[]);
 const total=history.reduce((n,x)=>n+(+x.seconds||0),0),best=history.reduce((n,x)=>Math.max(n,+x.bestBpm||0),0);
 const pct=buttons.length?Math.round(done.length/buttons.length*100):0;
 const q=s=>document.querySelector(s);
 q('#dashProgress').textContent=pct+' %';q('#dashProgressBar').style.width=pct+'%';
 q('#dashCurrent').textContent=next?next.childNodes[0].textContent.trim():(buttons.length?'Parcours terminé':'—');
 const nextIndex=next?buttons.indexOf(next)+1:-1;q('#dashNext').textContent=next&&buttons[nextIndex]?'Prochain : '+buttons[nextIndex].childNodes[0].textContent.trim():'Prochain : —';
 q('#dashTime').textContent=formatDashTime(total);q('#dashBpm').textContent=best?best+' BPM':'—';
 q('#dashValidated').textContent=done.length+' cours validé'+(done.length>1?'s':'');
 q('#todayCourse').textContent=next?'Travaille : '+next.childNodes[0].textContent.trim():'Tous les cours disponibles sont validés.';
 q('#todayGoal').textContent=next?'Objectif : '+(next.dataset.bpm||targetBpm.value)+' BPM • '+(next.dataset.difficulty||'progression régulière'):'Continue à consolider tes acquis.';
 const go=()=>{if(next){next.click();next.scrollIntoView({behavior:'smooth',block:'center'})}};
 q('#continueCourse').onclick=go;q('#todayStart').onclick=()=>{go();startGuided()};
 // Chemin de Liberté: derive a simple, explainable next step from existing
 // course/session data. No opaque scoring and no change to the playback engine.
 const currentName=next?next.childNodes[0].textContent.trim():(buttons.length?'Parcours consolidé':'Premier cours');
 const currentRows=history.filter(x=>!next||x.title===currentName);
 const currentReps=currentRows.reduce((n,x)=>n+(+x.reps||0),0);
 const currentBest=currentRows.reduce((n,x)=>Math.max(n,+x.bestBpm||0),0);
 const suggested=+(next?.dataset.bpm||targetBpm.value||50);
 let stage='learn',state='EN APPRENTISSAGE',recommendation='Découvre '+currentName+'.',reason='Prends le temps de comprendre le geste avant de chercher la vitesse.';
 if(currentRows.length>=1||currentReps>=3){stage='play';state='EN PROGRÈS';recommendation='Consolide '+currentName+' avec quelques répétitions propres.';reason='Tu as déjà commencé ce travail : la régularité compte maintenant davantage que la vitesse.';}
 if(currentRows.length>=2&&currentReps>=6&&currentBest>=suggested){stage='free';state='PRÊT À SE LIBÉRER';recommendation='Joue '+currentName+' avec moins de dépendance à la TAB.';reason='Le passage est suffisamment travaillé pour commencer à transformer l’exercice en musique.';}
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
 if(currentRows.length>=2&&currentBest>=suggested){humanLevel=3;humanState='ACQUIS';humanTitle='Ce passage devient solide.';humanText='Tu peux maintenant chercher davantage de fluidité, de son et de plaisir plutôt que simplement plus de BPM.';}
 if(pct===100&&buttons.length){humanLevel=4;humanState='MAÎTRISÉ';humanTitle='Tu as construit une vraie autonomie.';humanText='La maîtrise n’est pas une fin : utilise maintenant ces acquis pour jouer, créer et te libérer de la TAB.';}
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
function currentLessonStats(){
 const rows=(typeof practiceHistory!=='undefined'?practiceHistory:[]).filter(x=>x.title===currentPracticeTitle);
 return {sessions:rows.length,reps:rows.reduce((n,x)=>n+(+x.reps||0),0),seconds:rows.reduce((n,x)=>n+(+x.seconds||0),0),best:rows.reduce((n,x)=>Math.max(n,+x.bestBpm||0),0)};
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
function writeHistory(items){localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,50)))}
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
 const vals=own.map(x=>+x.best||0),min=Math.max(0,Math.min(...vals)-10),max=Math.max(min+10,Math.max(...vals)+10),pad=24;
 ctx.strokeStyle='#303743';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,8);ctx.lineTo(pad,h-pad);ctx.lineTo(w-8,h-pad);ctx.stroke();
 ctx.strokeStyle='#e9b44c';ctx.lineWidth=2;ctx.beginPath();
 vals.forEach((v,i)=>{const x=pad+(w-pad-12)*(vals.length===1?.5:i/(vals.length-1)),y=8+(h-pad-12)*(1-(v-min)/(max-min));i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
 ctx.stroke();const record=Math.max(...vals);exerciseProgressStats.textContent=own.length+' session'+(own.length>1?'s':'')+' • départ '+own[0].start+' BPM • record '+record+' BPM';personalBest.textContent=record+' BPM';const delta=(+tempo.value||0)-record;recordDelta.textContent=delta>0?'Nouveau record potentiel : +'+delta+' BPM':delta===0?'Tu es au niveau de ton record.':'Encore '+Math.abs(delta)+' BPM pour égaler ton record.';const goal=Math.max(1,+targetBpm.value||120),start=Math.max(1,+own[0].start||40),pct=Math.max(0,Math.min(100,Math.round((record-start)/Math.max(1,goal-start)*100)));masteryBar.style.width=pct+'%';masteryInfo.textContent=pct+' %';masteryLevel.textContent=pct>=100?'Maîtrisé':pct>=75?'Avancé':pct>=50?'Intermédiaire':pct>=25?'En progression':'Débutant';
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
 const chronological=items.slice().reverse(),events=[],seen=new Set();let record=0,totalReps=0;
 chronological.forEach((x,i)=>{
  const name=x.exercise||'Exercice';
  if(!seen.has(name)){seen.add(name);events.push({date:x.date,title:i===0?'Le voyage commence':'Un nouveau chapitre',text:'Première séance sur « '+name+' ».'})}
  const best=+x.best||0;if(best>record){const previous=record;record=best;events.push({date:x.date,title:previous?'Nouveau repère personnel':'Premier tempo de référence',text:'Tu as installé un nouveau repère à '+best+' BPM. Ce nombre raconte une étape, pas ta valeur de musicien.'})}
  const before=totalReps;totalReps+=+x.reps||0;
  [10,25,50,100,250].forEach(m=>{if(before<m&&totalReps>=m)events.push({date:x.date,title:m+' répétitions vécues',text:'Du temps passé avec l’instrument : c’est cette continuité qui construit ton jeu.'})});
 });
 count.textContent=events.length+' SOUVENIR'+(events.length>1?'S':'');
 box.innerHTML=events.slice(-8).reverse().map(e=>'<article class="memory-event"><time>'+e.date+'</time><strong>'+e.title+'</strong><small>'+e.text+'</small></article>').join('');
}
function renderHistory(){
 const items=readHistory();renderGuitarMemory(items);historyCount.textContent=items.length+' session'+(items.length>1?'s':'');historySessions.textContent=items.length;
 const totalSec=items.reduce((sum,x)=>{const p=String(x.duration||'0:0').split(':').map(Number);return sum+(p[0]||0)*60+(p[1]||0)},0);
 historyTime.textContent=String(Math.floor(totalSec/60)).padStart(2,'0')+':'+String(totalSec%60).padStart(2,'0');
 historyRecord.textContent=items.length?Math.max(...items.map(x=>+x.best||0))+' BPM':'—';
 const days=[...new Set(items.map(x=>{const m=String(x.date||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:null}).filter(Boolean))].sort().reverse();
 let streak=0;if(days.length){let d=new Date(days[0]+'T12:00:00');const today=new Date();today.setHours(12,0,0,0);const gap=Math.round((today-d)/86400000);if(gap<=1){streak=1;for(let i=1;i<days.length;i++){const prev=new Date(days[i-1]+'T12:00:00'),cur=new Date(days[i]+'T12:00:00');if(Math.round((prev-cur)/86400000)===1)streak++;else break}}}
 historyStreak.textContent=streak+' jour'+(streak>1?'s':'');
 renderExerciseProgress(items);renderLearningPath(items);if(!items.length){historyList.innerHTML='<p>Aucune session enregistrée.</p>';return}
 historyList.innerHTML=items.map(x=>'<div class="history-row"><b>'+x.date+'</b><span>'+x.duration+'</span><span>'+x.series+' séries</span><span>'+x.reps+' répétitions</span><span>'+x.start+' → '+x.best+' BPM</span><strong>+'+x.gain+' BPM</strong></div>').join('');
}
function saveCurrentSession(){
 if(!sessionStarted||(!sessionRepCount&&!sessionSeriesCount))return;
 const sec=Math.floor((Date.now()-sessionStarted)/1000),items=readHistory();
 items.unshift({exercise:currentPracticeTitle,goal:+targetBpm.value||120,date:new Date().toLocaleString('fr-FR'),duration:String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0'),series:sessionSeriesCount,reps:sessionRepCount,start:sessionStartBpm,best:sessionBest,gain:Math.max(0,sessionBest-sessionStartBpm)});
 writeHistory(items);renderHistory();setTimeout(paintSmartFretboard,0);
 setTimeout(paintLessonMastery,0);
}
clearHistory.onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory()};
renderHistory();
function paintSession(){sessionSeries.textContent=sessionSeriesCount;sessionReps.textContent=sessionRepCount;sessionBestBpm.textContent=sessionBest||0;sessionGain.textContent='+'+Math.max(0,(sessionBest||0)-(sessionStartBpm||0))+' BPM';if(sessionStarted){const sec=Math.floor((Date.now()-sessionStarted)/1000);sessionTime.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');paintSessionInsight()}}
function paintSessionInsight(){
 const q=s=>document.querySelector(s);if(!q('#sessionInsightState'))return;
 const sec=sessionStarted?Math.max(0,Math.floor((Date.now()-sessionStarted)/1000)):0;
 const reps=sessionRepCount||0,start=sessionStartBpm||(+tempo.value||0),best=sessionBest||start,gain=Math.max(0,best-start);
 q('#insightTime').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
 q('#insightReps').textContent=reps;q('#insightTempo').textContent=best?best+' BPM':'—';q('#insightGain').textContent=gain?'+'+gain+' BPM':'STABLE';
 let state='PRÊT POUR UNE SÉANCE',msg='Commence ta séance à ton rythme.',next='À la fin, Guitare Liberty te proposera une seule prochaine étape.';
 if(sessionStarted){state='SÉANCE EN COURS';msg=reps?'Tu es en train de construire de la régularité.':'Installe d’abord le geste et le son, sans chercher à aller vite.';next='Continue tant que ton jeu reste confortable et attentif.';}
 if(reps>=3){state='TRAVAIL INSTALLÉ';msg='Tes répétitions commencent à installer le passage.';next='Refais-le encore proprement avant de décider si le tempo doit évoluer.';}
 if(reps>=6){state='PROGRÈS CONSOLIDÉ';msg='Tu as donné du temps au passage : c’est ce qui construit une progression durable.';next=gain?'Garde ce nouveau tempo seulement s’il reste musical et détendu.':'Tu n’as pas besoin d’accélérer : consolide d’abord cette sensation de contrôle.';}
 q('#sessionInsightState').textContent=state;q('#insightMessage').textContent=msg;q('#insightNext').textContent=next;
}

function startSession(){if(sessionStarted)return;sessionStarted=Date.now();sessionStartBpm=+tempo.value||0;sessionBest=sessionStartBpm;paintSession();sessionClock=setInterval(paintSession,1000)}
function resetTrainingSession(){saveCurrentSession();sessionStarted=null;sessionSeriesCount=0;sessionRepCount=0;sessionBest=0;sessionStartBpm=0;clearInterval(sessionClock);sessionClock=null;sessionTime.textContent='00:00';paintSession()}
resetSession.onclick=resetTrainingSession;
function updatePracticeProgress(done=practiceIteration){const max=Math.max(1,+loopRepeats.value||1);practiceProgress.style.width=(Math.min(max,Math.max(0,done))/max*100)+'%'}
function practiceBars(){return practiceScore?.masterBars||[]}
function syncPracticeRange(){
 const n=practiceBars().length||1;
 loopStart.max=loopEnd.max=n;
 loopStart.value=Math.min(Math.max(1,+loopStart.value||1),n);
 loopEnd.value=Math.min(Math.max(+loopStart.value,+loopEnd.value||Math.min(4,n)),n);
}
function practiceTicks(){
 const bars=practiceBars();syncPracticeRange();
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
function setAlphaTempo(api){
 if(!api||!practiceScore)return;
 const original=practiceScore.tempo||120;
 api.playbackSpeed=Math.max(.25,Math.min(3,+tempo.value/original));
}
let playWithMeActive=false,playWithMePhase='idle',playWithMeRange=null,playWithMeLastTick=-1,playWithMeRoundCount=0,playWithMePhraseRepeat=0,playWithMeAnswerTimer=null,playWithMeCountdownTimer=null;
const playWithMeBar=document.querySelector('#playWithMeBar'),playWithMeLength=document.querySelector('#playWithMeLength'),playWithMeStart=document.querySelector('#playWithMeStart'),playWithMeNext=document.querySelector('#playWithMeNext'),playWithMeStop=document.querySelector('#playWithMeStop'),playWithMeState=document.querySelector('#playWithMeState'),playWithMeText=document.querySelector('#playWithMeText'),playWithMeAnswerMode=document.querySelector('#playWithMeAnswerMode'),playWithMeRepeat=document.querySelector('#playWithMeRepeat'),playWithMeProgress=document.querySelector('#playWithMeProgress'),playWithMeRound=document.querySelector('#playWithMeRound'),playWithMeCountdown=document.querySelector('#playWithMeCountdown');
function playWithMePaint(phase){
 playWithMePhase=phase;
 const listen=document.querySelector('#playWithMeListen'),answer=document.querySelector('#playWithMeAnswer');
 listen?.classList.toggle('active',phase==='listen');answer?.classList.toggle('active',phase==='answer');
 if(phase==='listen'){playWithMeState.textContent='ÉCOUTE';playWithMeText.textContent='Écoute la phrase sans jouer. Mémorise le rythme et le mouvement.'}
 else if(phase==='answer'){playWithMeState.textContent='À TOI';playWithMeText.textContent='La lecture est en pause : rejoue maintenant exactement la même phrase.'}
 else{playWithMeState.textContent='PRÊT';playWithMeText.textContent='Guitare Liberty joue une mesure. À toi de la rejouer juste après.'}
 if(playWithMeProgress)playWithMeProgress.textContent='PHRASE '+Math.max(1,Math.floor(((+playWithMeBar.value||1)-1)/Math.max(1,+playWithMeLength.value||1))+1);
 if(playWithMeRound)playWithMeRound.textContent=playWithMeRoundCount+' RÉPONSE'+(playWithMeRoundCount>1?'S':'');
}
function playWithMeTicks(){
 const bars=practiceBars(),start=Math.max(0,(+playWithMeBar.value||1)-1),len=Math.max(1,+playWithMeLength.value||1),a=bars[start],next=bars[start+len];
 if(!a)return null;const last=bars[Math.min(bars.length-1,start+len-1)],endTick=next?.start??(last.start+(last.calculateDuration?.()||0));
 return {start:a.start||0,end:endTick};
}
function stopPlayWithMe(){
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';
 playWithMeActive=false;playWithMeRange=null;playWithMeLastTick=-1;playWithMePaint('idle');playWithMeStart.disabled=false;if(playWithMeNext)playWithMeNext.disabled=true;playWithMeStop.disabled=true;
 const api=window.guitarLibertyAlphaTab;if(api){try{api.pause()}catch(_){}}
}
function startPlayWithMe(){
 const api=window.guitarLibertyAlphaTab;if(!api||!practiceScore){playWithMeText.textContent='Charge d’abord une tablature Guitar Pro.';return}
 const range=playWithMeTicks();if(!range)return;
 practiceLoop=false;loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');clearPracticeRange(api);
 playWithMeRange=range;playWithMeActive=true;playWithMeLastTick=-1;playWithMeRoundCount=0;playWithMePhraseRepeat=0;playWithMeStart.disabled=true;if(playWithMeNext)playWithMeNext.disabled=true;playWithMeStop.disabled=false;playWithMePaint('listen');
 try{api.tickPosition=range.start;api.play()}catch(e){stopPlayWithMe()}
}
playWithMeStart?.addEventListener('click',startPlayWithMe);
playWithMeNext?.addEventListener('click',()=>{
 if(!playWithMeActive||playWithMePhase!=='answer')return;
 clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=null;clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';
 playWithMeRoundCount++;if(playWithMeRound)playWithMeRound.textContent=playWithMeRoundCount+' RÉPONSE'+(playWithMeRoundCount>1?'S':'');
 const repeatMax=Math.max(1,+playWithMeRepeat?.value||1);
 if(playWithMePhraseRepeat+1<repeatMax){
  playWithMePhraseRepeat++;
  playWithMeRange=playWithMeTicks();playWithMeLastTick=-1;playWithMeNext.disabled=true;playWithMePaint('listen');
  const api=window.guitarLibertyAlphaTab;try{api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
  return;
 }
 playWithMePhraseRepeat=0;
 const bars=practiceBars(),len=Math.max(1,+playWithMeLength.value||1),nextStart=(+playWithMeBar.value||1)+len;
 if(nextStart>bars.length){playWithMeState.textContent='TERMINÉ';playWithMeText.textContent='Bravo. Tu as parcouru toutes les phrases disponibles.';playWithMeNext.disabled=true;return}
 playWithMeBar.value=nextStart;playWithMeRange=playWithMeTicks();playWithMeLastTick=-1;playWithMeNext.disabled=true;playWithMePaint('listen');
 const api=window.guitarLibertyAlphaTab;try{api.tickPosition=playWithMeRange.start;api.play()}catch(_){stopPlayWithMe()}
});
playWithMeStop?.addEventListener('click',stopPlayWithMe);

let alphaPlayedBeat=null,manualScrollUntil=0,autoTabScrolling=false,playbackFollowEnabled=true,manualScrollStartY=0;
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
    if(seen){const nb=bt2.visualBounds||bt2.realBounds||bt2.bounds;if(nb){nextX=nb.x+nb.w/2;break outerNext;}}
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
function metronomeClick(accent=false){
 countInAudio ||= new (window.AudioContext||window.webkitAudioContext)();
 const o=countInAudio.createOscillator(),g=countInAudio.createGain(),now=countInAudio.currentTime;
 o.frequency.value=accent?1200:850;g.gain.setValueAtTime(.18,now);g.gain.exponentialRampToValueAtTime(.0001,now+.055);
 o.connect(g).connect(countInAudio.destination);o.start(now);o.stop(now+.06);
}
let metronomeEnabled=false,metronomeTimer=null,metronomeBeatIndex=0,metronomeNextTime=0,metronomeContext=null;
const metronomeToggle=document.querySelector('#metronomeToggle'),metronomeVolume=document.querySelector('#metronomeVolume'),metronomeVolumeLabel=document.querySelector('#metronomeVolumeLabel'),metronomeSignature=document.querySelector('#metronomeSignature'),metronomeBeatView=document.querySelector('#metronomeBeat');
function metronomeClickAt(time,accent=false){
 if(!metronomeContext)metronomeContext=new (window.AudioContext||window.webkitAudioContext)();
 const osc=metronomeContext.createOscillator(),gain=metronomeContext.createGain(),vol=(+metronomeVolume.value||0)/100;
 osc.frequency.value=accent?1400:950;gain.gain.setValueAtTime(Math.max(.0001,vol*.22),time);gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
 osc.connect(gain).connect(metronomeContext.destination);osc.start(time);osc.stop(time+.05);
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
  const visualBeat=beat;setTimeout(()=>paintMetronomeBeat(visualBeat),Math.max(0,(metronomeNextTime-metronomeContext.currentTime)*1000));
  metronomeBeatIndex++;metronomeNextTime+=step;
 }
 metronomeTimer=setTimeout(metronomeScheduler,25);
}
async function startMetronome(){
 if(!metronomeContext)metronomeContext=new (window.AudioContext||window.webkitAudioContext)();
 if(metronomeContext.state==='suspended')await metronomeContext.resume();
 clearTimeout(metronomeTimer);metronomeBeatIndex=0;metronomeNextTime=metronomeContext.currentTime+.04;metronomeScheduler();
}
function stopMetronome(){clearTimeout(metronomeTimer);metronomeTimer=null;metronomeBeatIndex=0;[...metronomeBeatView.querySelectorAll('i')].forEach(d=>d.classList.remove('active','accent'))}
metronomeToggle.onclick=async()=>{metronomeEnabled=!metronomeEnabled;metronomeToggle.classList.toggle('active',metronomeEnabled);metronomeToggle.textContent=metronomeEnabled?'♩ MÉTRONOME ON':'♩ MÉTRONOME OFF';if(metronomeEnabled)await startMetronome();else stopMetronome()};
metronomeVolume.oninput=()=>metronomeVolumeLabel.textContent=metronomeVolume.value+'%';
metronomeSignature.onchange=()=>{metronomeBeatIndex=0;if(metronomeEnabled){stopMetronome();startMetronome()}};
function countInThenPlay(api,startPlayback=()=>api.play()){
 const bars=Math.max(0,+countIn.value||0);
 const overlay=document.querySelector('#countInOverlay'),number=document.querySelector('#countInNumber');
 if(!bars){if(overlay)overlay.hidden=true;startPlayback();return}
 const beats=practiceScore?.masterBars?.[0]?.timeSignatureNumerator||4,total=bars*beats,beatMs=60000/+tempo.value;
 let beat=0;clearInterval(practiceTimer);practiceStatus.textContent='Compte : '+total;
 if(overlay){overlay.hidden=false;overlay.classList.add('active')}if(number)number.textContent=String(total);
 metronomeClick(true);
 practiceTimer=setInterval(()=>{
  beat++;
  if(beat>=total){
   clearInterval(practiceTimer);practiceTimer=null;practiceStatus.textContent='En cours';
   if(overlay){overlay.classList.remove('active');overlay.hidden=true}startPlayback();return;
  }
  const remaining=total-beat;practiceStatus.textContent='Compte : '+remaining;if(number){number.textContent=String(remaining);number.classList.remove('pulse');void number.offsetWidth;number.classList.add('pulse')}
  metronomeClick(beat%beats===0);
 },beatMs);
}
loopToggle.onclick=()=>{
 practiceLoop=!practiceLoop;practiceIteration=0;lastLoopTick=-1;updatePracticeProgress(0);loopToggle.textContent=practiceLoop?'↻ LOOP ON':'↻ LOOP OFF';loopToggle.classList.toggle('active',practiceLoop);
 const api=window.guitarLibertyAlphaTab;if(api){practiceLoop?setPracticeRange(api):clearPracticeRange(api)}
 practiceStatus.textContent=practiceLoop?'Prêt • boucle '+loopStart.value+'–'+loopEnd.value:'Prêt';
};
targetBpm.onchange=()=>{targetBpm.value=Math.max(+tempo.min,Math.min(+tempo.max,+targetBpm.value||120));renderExerciseProgress()};
loopRepeats.onchange=()=>updatePracticeProgress(0);
[loopStart,loopEnd].forEach(el=>el.onchange=()=>{if(+loopEnd.value<+loopStart.value)loopEnd.value=loopStart.value;const api=window.guitarLibertyAlphaTab;if(api&&practiceLoop)setPracticeRange(api)});

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
    md.events.forEach(ev=>{
      const x=left+width*(ev.onset/md.length);
      if(ev.type==='rest'){
       const whole=Math.abs(ev.duration-md.length)<.02;
       html+='<span class="measure-rest '+(whole?'whole-rest':'timed-rest')+'" style="left:calc('+x+'% + '+(width*(ev.duration/md.length)/2)+'%)">'+(whole?'𝄻':rhythmRestGlyph(ev.duration))+'</span>';return;
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
function playNote(string,fret){
 ensureOutput();
 loadGuitarSample(string).then(buffer=>{
   if(!buffer) return;
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
   // Keep the recorded decay instead of imposing the old synthetic 2.2 s envelope.
   const natural=Math.min(buffer.duration/rate,4.8);
   gain.gain.setValueAtTime(velocity,now+Math.min(.06,natural*.15));
   gain.gain.exponentialRampToValueAtTime(.0001,now+natural);
   source.connect(tone).connect(gain).connect(masterGain);
   activeVoices.set(string,{source,gain});
   source.onended=()=>{if(activeVoices.get(string)?.source===source)activeVoices.delete(string)};
   source.start(now); source.stop(now+natural+.02);
 });
}
function stop(){
 if(alphaTabMode&&window.guitarLibertyAlphaTab?.player){try{window.guitarLibertyAlphaTab.stop()}catch(e){}}
 playing=false;clearTimeout(timer);stopAllVoices();document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'))
}
function noteIntervalMs(){const e=exercises[current],v=e.notes[index],beats=(v&&v[3])||.5;return 60000/+tempo.value*beats}
function scheduleNext(){clearTimeout(timer);if(playing)timer=setTimeout(()=>{tick();scheduleNext()},noteIntervalMs())}
function tick(){
 const e=exercises[current];
 const notes=document.querySelectorAll('.note');
 notes.forEach(n=>n.classList.toggle('active',+n.dataset.i===index));
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
 const [s,f]=e.notes[index];playNote(s,f);
 progress.style.width=((index+1)/e.notes.length*100)+'%';
 index++;if(index>=e.notes.length){index=0;const paper=document.querySelector('.paper');if(paper)paper.scrollTo({top:0,behavior:'smooth'})}
}
document.querySelectorAll('.exercise').forEach(b=>b.onclick=()=>{stop();document.querySelector('.exercise.active').classList.remove('active');b.classList.add('active');current=b.dataset.ex;render()});
tempo.oninput=()=>{syncTempo();if(alphaTabMode&&window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab);else if(playing){clearTimeout(timer);scheduleNext()}if(videoEnabled)syncVideoTempo();if(metronomeEnabled){stopMetronome();startMetronome()}};
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

document.querySelector('#play').onclick=async()=>{
 if(alphaTabMode&&window.guitarLibertyAlphaTab){
  const api=window.guitarLibertyAlphaTab;
  try{
   if(!videoEnabled&&api.playerState===1){api.pause();stopBacking(false);document.querySelector('#play').textContent='▶ PLAY';return;}
   document.querySelector('#play').textContent='■ STOP';
   setAlphaTempo(api); if(practiceLoop)setPracticeRange(api);
   countInThenPlay(api,()=>{
     if(videoEnabled&&practiceVideo&&!practiceVideo.hidden&&practiceVideo.src){
       syncVideoTempo();
       if(practiceVideo.paused){
         practiceVideo.play().catch(e=>console.error('Practice video',e));startSession();document.querySelector('#play').textContent='⏸ PAUSE';
       }else{practiceVideo.pause();document.querySelector('#play').textContent='▶ PLAY';}
       return;
     }else if(videoEnabled&&wistiaPlayer){
       syncVideoTempo();
       try{
         const state=wistiaPlayer.state||'';
         if(state==='playing'){
           wistiaPlayer.pause();
           document.querySelector('#play').textContent='▶ PLAY';
         }else{
           wistiaPlayer.play();startSession();sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();
           document.querySelector('#play').textContent='⏸ PAUSE';
         }
       }catch(e){console.error('Wistia playback',e)}
       return;
     }else if(backingAudio&&backingEnabled){
       const bpm=Math.max(1,+tempo.value||50);
       const rate=Math.max(.5,Math.min(2,bpm/50));
       backingAudio.playbackRate=rate;
       // Musical pickup model:
       // backing starts from its real beginning on beat 3.5 of an imaginary previous 4/4 bar;
       // TAB bar 1 starts 1.5 quarter-note beats later.
       const sourceRate=Math.max(.5,Math.min(2,bpm/50));
       backingAudio.playbackRate=sourceRate;
       backingAudio.currentTime=0;
       const backingPromise=backingAudio.play();
       if(backingPromise?.catch)backingPromise.catch(console.error);
       clearTimeout(backingStartTimer);
       const tabDelayMs=currentBackingLeadBeats*(60000/bpm);
       backingStartTimer=setTimeout(()=>{
         backingStartTimer=null;
         api.play();
       },tabDelayMs);
     }else api.play();
   });
   return;
  }catch(err){console.error('alphaTab playback',err);importStatus.textContent='Lecture alphaTab indisponible : '+(err.message||err);return;}
 }
 if(playing){stop();return}
 ensureOutput(); if(audio.state==='suspended')await audio.resume();
 await Promise.all([0,1,2,3,4,5].map(loadGuitarSample));
 playing=true;document.querySelector('#play').textContent='■ STOP';tick();scheduleNext()
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
function setVideoTrack(id,practiceUrl=null){
 currentPracticeVideoUrl=practiceUrl||null;
 currentWistiaId=id||null;currentVideoLeadBeats=0;videoEnabled=false;wistiaPlayer=null;clearInterval(videoPracticeTimer);videoPracticeTimer=null;
 if(videoStage)videoStage.hidden=true;
 if(practiceVideo){practiceVideo.pause();practiceVideo.currentTime=0;}
 if(wistiaFrame)wistiaFrame.src='';
 if(practiceVideo){practiceVideo.pause();practiceVideo.hidden=true;practiceVideo.removeAttribute('src');practiceVideo.load();}
 if(videoToggle){videoToggle.disabled=!id;videoToggle.classList.remove('active');videoToggle.textContent='🎬 VIDÉO';}
}
function syncVideoTempo(){
 if(!practiceVideo||practiceVideo.hidden)return;
 practiceVideo.playbackRate=Math.max(.5,Math.min(2,(+tempo.value||50)/50));
}
function openVideo(){
 if(!currentWistiaId&&!currentPracticeVideoUrl)return;
 videoEnabled=true;videoStage.hidden=false;
 if(currentPracticeVideoUrl&&practiceVideo){
   wistiaFrame.hidden=true;practiceVideo.hidden=false;practiceVideo.src=encodeURI(currentPracticeVideoUrl);practiceVideo.load();syncVideoTempo();
 }else if(wistiaFrame){
   practiceVideo.hidden=true;wistiaFrame.hidden=false;wistiaFrame.src='https://fast.wistia.net/embed/iframe/'+encodeURIComponent(currentWistiaId)+'?seo=false&videoFoam=true&autoPlay=false&controlsVisibleOnLoad=true';
 }
 videoToggle.classList.add('active');videoToggle.textContent='🎬 VIDÉO ON';
}
function closeVideo(){
 videoEnabled=false;wistiaPlayer=null;
 if(videoStage)videoStage.hidden=true;
 if(wistiaFrame)wistiaFrame.src='';
 if(videoToggle){videoToggle.classList.remove('active');videoToggle.textContent='🎬 VIDÉO';}
}
if(videoToggle)videoToggle.onclick=()=>{if(videoEnabled)closeVideo();else openVideo();};
function stopBacking(reset=true){
 clearTimeout(backingStartTimer);backingStartTimer=null;
 if(!backingAudio)return;
 backingAudio.pause();if(reset)backingAudio.currentTime=0;
}
function setBackingTrack(url){
 stopBacking();currentBackingUrl=url||null;
 backingAudio=url?new Audio(encodeURI(url)):null;
 if(backingAudio){backingAudio.preload='auto';backingAudio.volume=(+backingVolume.value||0)/100;}
 backingToggle.disabled=!url;
 backingToggle.textContent=backingEnabled?'♫ BACKING ON':'♫ BACKING OFF';
 backingToggle.classList.toggle('active',backingEnabled&&!!url);
}
if(backingToggle)backingToggle.onclick=()=>{
 backingEnabled=!backingEnabled;
 backingToggle.textContent=backingEnabled?'♫ BACKING ON':'♫ BACKING OFF';
 backingToggle.classList.toggle('active',backingEnabled&&!!currentBackingUrl);
 if(!backingEnabled)stopBacking(false);
};
if(backingVolume)backingVolume.oninput=()=>{
 backingVolumeLabel.textContent=backingVolume.value+'%';
 if(backingAudio)backingAudio.volume=+backingVolume.value/100;
};
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

async function loadWithAlphaTab(file){
 if(!window.alphaTab)throw new Error('Le moteur alphaTab n’est pas chargé dans cette version de Guitare Liberty.');
 stop();
 alphaTabMode=true;
 tab.classList.add('alphatab-score');
 tab.innerHTML='';
 const rawBytes=file.bytes||await window.guitarAudio.readScore(file.filePath);
 const bytes=rawBytes instanceof Uint8Array?rawBytes:new Uint8Array(rawBytes);
 if(!bytes.length)throw new Error('Le fichier Guitar Pro est vide.');
 const api=new window.alphaTab.AlphaTabApi(tab,{
  core:{useWorkers:false,engine:'svg',enableLazyLoading:false,includeNoteBounds:true,fontDirectory:'../assets/vendor/font/'},
  player:{enablePlayer:true,soundFont:'../assets/vendor/soundfont/sonivox.sf2',scrollMode:'off'},
  display:{layoutMode:'page',barsPerRow:4,justifyLastSystem:true,resources:{effectFontSize:12}} ,
  notation:{notationMode:'guitarpro',fingeringMode:'ScoreDefault',elements:{guitarTuning:false,effectTempo:false,effectFingering:false,effectText:true,effectMarker:true,effectChordNames:true,effectPickStroke:true}}
 });
 window.guitarLibertyAlphaTab=api;
 api.playerReady.on(()=>{importStatus.textContent=file.name+' — tablature prête à jouer';});
 // Clicking the rendered score seeks the player and immediately moves our
 // custom orange cursor. Keep the validated playback/repeat cursor untouched.
 tab.addEventListener('click',ev=>{
  if(!api.boundsLookup?.staffSystems)return;
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
 });
 // playedBeatChanged comes from alphaTab's actual playback sequencer. It follows
 // GP repeats automatically and is not confused by written-score absolute ticks.
 if(api.playedBeatChanged?.on)api.playedBeatChanged.on(beat=>{
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
 api.playerStateChanged.on(e=>{if(e.state===1){playbackFollowEnabled=true;manualScrollUntil=0;manualScrollStartY=window.scrollY}document.querySelector('#play').textContent=e.state===1?'■ STOP':'▶ PLAY';if(e.state===1){startSession();sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession()}if(e.state===1)practiceStatus.textContent=practiceLoop?'En cours • Répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'En cours';else if(!practiceTimer&&practiceStatus.textContent.indexOf('Série terminée')!==0)practiceStatus.textContent='Prêt';});
 api.playerPositionChanged.on(e=>{
  const lockedPageY=!playbackFollowEnabled?window.scrollY:null;
  const lockedPaperY=!playbackFollowEnabled?document.querySelector('.paper')?.scrollTop:null;
  const tick=e.currentTick??e.tick??0;
  updatePlayCursor(api,tick);if(listening)updateExpectedFromTick(api,tick);
  if(playWithMeActive&&playWithMePhase==='listen'&&playWithMeRange){
   if(playWithMeLastTick>=0&&tick>=playWithMeRange.end-1){
    try{api.pause();api.tickPosition=playWithMeRange.start}catch(_){}
    playWithMePaint('answer');if(playWithMeNext)playWithMeNext.disabled=false;
    if(playWithMeAnswerMode?.value==='timed'){
     const ticks=Math.max(1,playWithMeRange.end-playWithMeRange.start),scoreTempo=practiceScore?.tempo||120,currentTempo=Math.max(1,+tempo.value||scoreTempo);
     const ms=Math.max(400,Math.round((ticks/960)*(60000/currentTempo)));
     playWithMeText.textContent='À toi : rejoue la phrase. La phrase suivante partira automatiquement.';
     const answerEnds=performance.now()+ms;
     const paintCountdown=()=>{if(playWithMeCountdown)playWithMeCountdown.textContent='REPRISE '+Math.max(0,(answerEnds-performance.now())/1000).toFixed(1)+' s'};
     clearInterval(playWithMeCountdownTimer);paintCountdown();playWithMeCountdownTimer=setInterval(paintCountdown,100);
     clearTimeout(playWithMeAnswerTimer);playWithMeAnswerTimer=setTimeout(()=>{clearInterval(playWithMeCountdownTimer);playWithMeCountdownTimer=null;if(playWithMeCountdown)playWithMeCountdown.textContent='—';if(playWithMeActive&&playWithMePhase==='answer')playWithMeNext?.click()},ms);
    }
   }
   playWithMeLastTick=tick;
  }
  if(!practiceLoop)return;
  const range=practiceTicks();if(!range)return;
  if(lastLoopTick>=0&&tick<lastLoopTick){
   practiceIteration++;sessionRepCount++;sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession();updatePracticeProgress(practiceIteration);
   const max=Math.max(1,+loopRepeats.value||1);
   if(practiceIteration>=max){
    updatePracticeProgress(max);
    sessionSeriesCount++;paintSession();
    practiceIteration=0;
    const inc=+autoBpm.value||0;
    if(inc){
     const goal=Math.max(+tempo.min,Math.min(+tempo.max,+targetBpm.value||+tempo.max));
     const next=Math.min(goal,+tempo.value+inc);
     tempo.value=next;syncTempo();
     const original=practiceScore?.tempo||120;
     api.playbackSpeed=Math.max(.25,Math.min(3,next/original));if(videoEnabled)syncVideoTempo();
     if(next>=goal){
      api.isLooping=false;
      practiceLoop=false;
      loopToggle.textContent='↻ LOOP OFF';loopToggle.classList.remove('active');
      practiceStatus.textContent='Objectif atteint • '+next+' BPM';saveCurrentSession();
     }else practiceStatus.textContent='Série terminée • nouveau tempo '+next+' BPM';
    }else practiceStatus.textContent='Série terminée';
   }else practiceStatus.textContent='En cours • Répétition '+(practiceIteration+1)+'/'+max;
  }
  lastLoopTick=tick;
  if(!playbackFollowEnabled){
   if(Number.isFinite(lockedPageY)&&Math.abs(window.scrollY-lockedPageY)>1)window.scrollTo(0,lockedPageY);
   const paper=document.querySelector('.paper');if(paper&&Number.isFinite(lockedPaperY)&&Math.abs(paper.scrollTop-lockedPaperY)>1)paper.scrollTop=lockedPaperY;
  }
 });

 let completed=false;
 api.renderFinished.on(()=>{ tab.style.minHeight='420px'; playCursor=null; requestAnimationFrame(()=>{drawLeftHandFingerings(api);paintSmartFretboard()}); importStatus.textContent=file.name+' — tablature affichée'; });
 api.scoreLoaded.on(score=>{
  completed=true;
  practiceScore=score; syncPracticeRange(); if(playWithMeBar){playWithMeBar.max=practiceBars().length||1;playWithMeBar.value=Math.min(+playWithMeBar.value||1,practiceBars().length||1)} tempo.value=score.tempo||tempo.value; syncTempo(); setAlphaTempo(api);
  currentPracticeTitle=score.title||file.name.replace(/\.[^.]+$/,'');document.querySelector('#title').textContent=currentPracticeTitle;renderExerciseProgress();paintMeasureMemory();paintSmartFretboard();
  document.querySelector('#subtitle').textContent='Guitar Pro • rendu alphaTab';
  importStatus.textContent=file.name+' — import réussi';
 });
 api.error.on(err=>{
  completed=true;
  const msg=err?.message||String(err);
  console.error('alphaTab import error',err);
  importStatus.textContent='Erreur Guitar Pro : '+msg;
  alert('Import Guitar Pro impossible : '+msg);
 });
 importStatus.textContent='Chargement de '+file.name+'…';
 const accepted=api.load(bytes);
 if(!accepted)throw new Error('alphaTab a refusé les données du fichier.');
 setTimeout(()=>{if(!completed)importStatus.textContent='Chargement en cours… si rien ne s’affiche, ouvre la console pour le diagnostic.';},3000);
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
 setLessonInfo(button);
 setBackingTrack(button.dataset.backing||null);
 setVideoTrack(button.dataset.wistiaId||null,button.dataset.practiceVideo||null);
 setTutorial(button.dataset.tutorial||null);
 currentBackingLeadBeats=Math.max(0,+button.dataset.backingLeadBeats||0);
 currentVideoLeadBeats=Math.max(0,+button.dataset.videoLeadBeats||0);
 if(button.dataset.bpm){tempo.value=button.dataset.bpm;syncTempo();}
 try{
  stop();document.querySelectorAll('.library-exercise').forEach(b=>b.classList.toggle('active',b===button));
  importStatus.textContent='Chargement de '+button.textContent.trim()+'…';
  const response=await fetch(url);if(!response.ok)throw new Error('fichier intégré introuvable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  await loadWithAlphaTab({name:button.textContent.trim()+'.gp',ext:'.gp',bytes});
 }catch(err){console.error(err);importStatus.textContent='Exercice non installé : '+button.textContent.trim();}
}
document.querySelectorAll('.library-exercise').forEach(b=>b.onclick=()=>{if(!b.classList.contains('course-locked'))loadBundledScore(b)});
refreshCourseProgress();
if(importButton) importButton.onclick=async()=>{
 const file=await window.guitarAudio.importScore();
 if(!file)return;
 if(['.gp','.gp3','.gp4','.gp5','.gpx'].includes(file.ext)){
  try{await loadWithAlphaTab(file);}catch(err){console.error(err);importStatus.textContent='Erreur Guitar Pro : '+err.message;alert('Impossible de charger cette tablature Guitar Pro : '+err.message);}
  return;
 }
 const supported=['.musicxml','.xml','.mxl','.mid','.midi'];
 if(!supported.includes(file.ext)){
  importStatus.textContent='Guitar Pro : export MusicXML requis';
  alert('Pour importer cette tablature Guitar Pro dans Guitare Liberty, exporte-la d’abord en MusicXML depuis Guitar Pro.');
  return;
 }
 try{
  if(!['.musicxml','.xml'].includes(file.ext)){
   importStatus.textContent=file.name+' chargé — lecture visuelle bientôt disponible pour ce format';
   window.pendingImportedScore=file;
   return;
  }
  const xmlText=atob(file.data);
  const doc=new DOMParser().parseFromString(xmlText,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('XML invalide');
  const part=doc.querySelector('part');
  if(!part) throw new Error('Aucune partie musicale trouvée');
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
   const md={repeatStart:false,repeatEnd:false,text:'',beats:currentBeats,beatType:currentBeatType,timeChanged:measureIndex===0||oldBeats!==currentBeats||oldBeatType!==currentBeatType,length:measureLength,events:[]};
   measure.querySelectorAll('barline repeat').forEach(rep=>{if(rep.getAttribute('direction')==='forward')md.repeatStart=true;if(rep.getAttribute('direction')==='backward')md.repeatEnd=true;});
   md.text=[...measure.querySelectorAll(':scope > direction direction-type words')].map(w=>w.textContent.trim()).filter(Boolean).join(' • ');
   let cursor=0,lastOnset=0;
   [...measure.children].forEach(node=>{
    const tag=node.tagName;
    if(tag==='backup'){cursor=Math.max(0,cursor+( -+(node.querySelector('duration')?.textContent||0)/currentDivisions));return;}
    if(tag==='forward'){cursor+=+(node.querySelector('duration')?.textContent||0)/currentDivisions;return;}
    if(tag!=='note')return;
    const duration=Math.max(.125,+(node.querySelector(':scope > duration')?.textContent||currentDivisions)/currentDivisions);
    const typeName=node.querySelector(':scope > type')?.textContent||''; const dots=node.querySelectorAll(':scope > dot').length;
    const chord=!!node.querySelector(':scope > chord'),onset=chord?lastOnset:cursor;
    if(!chord){lastOnset=onset;cursor+=duration;}
    if(node.querySelector(':scope > rest')){const full=!!node.querySelector(':scope > rest[measure="yes"]');md.events.push({type:'rest',onset,duration:full?measureLength:duration,typeName,dots});return;}
    const pitch=node.querySelector(':scope > pitch');if(!pitch)return;
    const step=pitch.querySelector('step')?.textContent||'C',alter=+(pitch.querySelector('alter')?.textContent||0),octave=+(pitch.querySelector('octave')?.textContent||4),midi=(octave+1)*12+stepSemis[step]+alter;
    const tech=node.querySelector('notations technical');let stringNo=+(tech?.querySelector('string')?.textContent||0),fret=+(tech?.querySelector('fret')?.textContent||-1),s=-1;
    if(stringNo>=1&&stringNo<=6&&fret>=0)s=stringNo-1;else for(let candidate=0;candidate<6;candidate++){const f=midi-open[candidate];if(f>=0&&f<=24){s=candidate;fret=f;break;}}
    if(s<0||fret<0)return;
    const finger=+(tech?.querySelector('fingering')?.textContent||0)||Math.min(4,Math.max(1,fret%4||4));
    const pickDown=!!node.querySelector('notations technical down-bow'),pickUp=!!node.querySelector('notations technical up-bow');
    const noteIndex=imported.length; imported.push([s,fret,finger,duration]);
    md.events.push({type:'note',onset,duration,typeName,dots,string:s,fret,finger,noteIndex,pick:pickDown?'∨':pickUp?'∧':''});
   });
   importedMeasures.push(md);
  });
  if(!imported.length) throw new Error('Aucune note de tablature exploitable trouvée');
  const key='imported';
  exercises[key]={title:file.name.replace(/\.(musicxml|xml)$/i,''),subtitle:'Tablature importée • MusicXML',tempo:importedTempo,repeat:1,notes:imported,measures:importedMeasures};
  current=key; stop(); render();
  document.querySelectorAll('.exercise').forEach(b=>b.classList.remove('active'));
  importStatus.textContent=file.name+' — '+imported.length+' notes affichées';
  window.pendingImportedScore=file;
 }catch(err){
  console.error('MusicXML import failed',err);
  importStatus.textContent='Erreur import : '+err.message;
  alert('Impossible d’afficher cette tablature : '+err.message);
 }
};
