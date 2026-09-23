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
let backingAudio=null,backingEnabled=true,currentBackingUrl=null,currentBackingPrecountBeats=0,backingStartTimer=null;
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
function renderHistory(){
 const items=readHistory();historyCount.textContent=items.length+' session'+(items.length>1?'s':'');historySessions.textContent=items.length;
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
 writeHistory(items);renderHistory();
}
clearHistory.onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory()};
renderHistory();
function paintSession(){sessionSeries.textContent=sessionSeriesCount;sessionReps.textContent=sessionRepCount;sessionBestBpm.textContent=sessionBest||0;sessionGain.textContent='+'+Math.max(0,(sessionBest||0)-(sessionStartBpm||0))+' BPM';if(sessionStarted){const sec=Math.floor((Date.now()-sessionStarted)/1000);sessionTime.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}}
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
function updatePlayCursor(api,tick){
 const lookup=api.boundsLookup||api.renderer?.boundsLookup;if(!lookup?.staffSystems)return;
 let target=null;
 for(const system of lookup.staffSystems||[])for(const master of system.bars||[])for(const bar of master.bars||[])for(const beat of bar.beats||[]){
  const bt=beat.beat?.absolutePlaybackStart??beat.beat?.absoluteStart??beat.beat?.playbackStart;
  if(bt==null||bt>tick)continue;
  if(!target||bt>=target.tick)target={tick:bt,beat,system};
 }
 if(!target)return;
 const b=target.beat.visualBounds||target.beat.realBounds||target.beat.bounds;
 const sys=target.system.visualBounds||target.system.realBounds||target.system.bounds;
 if(!b||!sys)return;
 if(!playCursor){playCursor=document.createElement('div');playCursor.className='gl-play-cursor';tab.appendChild(playCursor)}
 playCursor.style.left=(b.x+b.w/2)+'px';playCursor.style.top=sys.y+'px';playCursor.style.height=sys.h+'px';playCursor.style.display='block';
}
function metronomeClick(accent=false){
 countInAudio ||= new (window.AudioContext||window.webkitAudioContext)();
 const o=countInAudio.createOscillator(),g=countInAudio.createGain(),now=countInAudio.currentTime;
 o.frequency.value=accent?1200:850;g.gain.setValueAtTime(.18,now);g.gain.exponentialRampToValueAtTime(.0001,now+.055);
 o.connect(g).connect(countInAudio.destination);o.start(now);o.stop(now+.06);
}
function countInThenPlay(api,startPlayback=()=>api.play()){
 const bars=Math.max(0,+countIn.value||0);
 if(!bars){startPlayback();return}
 const beats=practiceScore?.masterBars?.[0]?.timeSignatureNumerator||4,total=bars*beats,beatMs=60000/+tempo.value;
 let beat=0;clearInterval(practiceTimer);practiceStatus.textContent='Compte : '+total;
 metronomeClick(true);
 practiceTimer=setInterval(()=>{beat++;if(beat>=total){clearInterval(practiceTimer);practiceTimer=null;practiceStatus.textContent='En cours';startPlayback();return}practiceStatus.textContent='Compte : '+(total-beat);metronomeClick(beat%beats===0)},beatMs);
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
tempo.oninput=()=>{syncTempo();if(alphaTabMode&&window.guitarLibertyAlphaTab)setAlphaTempo(window.guitarLibertyAlphaTab);else if(playing){clearTimeout(timer);scheduleNext()}};
document.querySelector('#play').onclick=async()=>{
 if(alphaTabMode&&window.guitarLibertyAlphaTab){
  const api=window.guitarLibertyAlphaTab;
  try{
   if(api.playerState===1){api.pause();stopBacking(false);document.querySelector('#play').textContent='▶ PLAY';return;}
   document.querySelector('#play').textContent='■ STOP';
   setAlphaTempo(api); if(practiceLoop)setPracticeRange(api);
   countInThenPlay(api,()=>{
     if(backingAudio&&backingEnabled){
       const bpm=Math.max(1,+tempo.value||50);
       const rate=Math.max(.5,Math.min(2,bpm/50));
       backingAudio.playbackRate=rate;
       // The backing contains an internal 1.5-beat count-in.
       // Start the backing first; start the TAB when that musical count-in ends.
       backingAudio.currentTime=0;
       const backingPromise=backingAudio.play();
       if(backingPromise?.catch)backingPromise.catch(console.error);
       const precountMs=currentBackingPrecountBeats*(60000/bpm);
       clearTimeout(backingStartTimer);
       backingStartTimer=setTimeout(()=>{
         backingStartTimer=null;
         api.play();
       },precountMs);
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
render();

const backingToggle=document.querySelector('#backingToggle');
const backingVolume=document.querySelector('#backingVolume');
const backingVolumeLabel=document.querySelector('#backingVolumeLabel');
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
   if(finger==null||finger===-1||finger===0||!b)continue;
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
 if(!window.alphaTab)throw new Error('Le moteur alphaTab n’est pas chargé dans cette version de Guitar Liberty.');
 stop();
 alphaTabMode=true;
 tab.classList.add('alphatab-score');
 tab.innerHTML='';
 const rawBytes=file.bytes||await window.guitarAudio.readScore(file.filePath);
 const bytes=rawBytes instanceof Uint8Array?rawBytes:new Uint8Array(rawBytes);
 if(!bytes.length)throw new Error('Le fichier Guitar Pro est vide.');
 const api=new window.alphaTab.AlphaTabApi(tab,{
  core:{useWorkers:false,engine:'svg',enableLazyLoading:false,includeNoteBounds:true,fontDirectory:'../assets/vendor/font/'},
  player:{enablePlayer:true,soundFont:'../assets/vendor/soundfont/sonivox.sf2'},
  display:{layoutMode:'page',barsPerRow:4,resources:{effectFontSize:12}} ,
  notation:{notationMode:'guitarpro',fingeringMode:'ScoreDefault',elements:{effectFingering:false,effectText:true,effectMarker:true}}
 });
 window.guitarLibertyAlphaTab=api;
 api.playerReady.on(()=>{importStatus.textContent=file.name+' — tablature prête à jouer';});
 api.playerStateChanged.on(e=>{document.querySelector('#play').textContent=e.state===1?'■ STOP':'▶ PLAY';if(e.state===1){startSession();sessionBest=Math.max(sessionBest,+tempo.value||0);paintSession()}if(e.state===1)practiceStatus.textContent=practiceLoop?'En cours • Répétition '+(practiceIteration+1)+'/'+Math.max(1,+loopRepeats.value||1):'En cours';else if(!practiceTimer&&practiceStatus.textContent.indexOf('Série terminée')!==0)practiceStatus.textContent='Prêt';});
 api.playerPositionChanged.on(e=>{
  const tick=e.currentTick??e.tick??0;
  updatePlayCursor(api,tick);
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
     api.playbackSpeed=Math.max(.25,Math.min(3,next/original));
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
 });

 let completed=false;
 api.renderFinished.on(()=>{ tab.style.minHeight='420px'; playCursor=null; requestAnimationFrame(()=>drawLeftHandFingerings(api)); importStatus.textContent=file.name+' — tablature affichée'; });
 api.scoreLoaded.on(score=>{
  completed=true;
  practiceScore=score; syncPracticeRange(); tempo.value=score.tempo||tempo.value; syncTempo(); setAlphaTempo(api);
  currentPracticeTitle=score.title||file.name.replace(/\.[^.]+$/,'');document.querySelector('#title').textContent=currentPracticeTitle;renderExerciseProgress();
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
async function loadBundledScore(button){
 const url=button.dataset.score;if(!url)return;
 setBackingTrack(button.dataset.backing||null);
 currentBackingPrecountBeats=Math.max(0,+button.dataset.backingPrecountBeats||0);
 if(button.dataset.bpm){tempo.value=button.dataset.bpm;syncTempo();}
 try{
  stop();document.querySelectorAll('.library-exercise').forEach(b=>b.classList.toggle('active',b===button));
  importStatus.textContent='Chargement de '+button.textContent.trim()+'…';
  const response=await fetch(url);if(!response.ok)throw new Error('fichier intégré introuvable');
  const bytes=new Uint8Array(await response.arrayBuffer());
  await loadWithAlphaTab({name:button.textContent.trim()+'.gp',ext:'.gp',bytes});
 }catch(err){console.error(err);importStatus.textContent='Exercice non installé : '+button.textContent.trim();}
}
document.querySelectorAll('.library-exercise').forEach(b=>b.onclick=()=>loadBundledScore(b));
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
  alert('Pour importer cette tablature Guitar Pro dans Guitar Liberty, exporte-la d’abord en MusicXML depuis Guitar Pro.');
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
