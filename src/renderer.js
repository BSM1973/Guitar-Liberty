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
let current='chromatic',playing=false,timer=null,audio,index=0;
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
function stop(){playing=false;clearTimeout(timer);stopAllVoices();document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'))}
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
tempo.oninput=()=>{syncTempo();if(playing){clearTimeout(timer);scheduleNext()}};
document.querySelector('#play').onclick=async()=>{if(playing){stop();return}
 ensureOutput(); if(audio.state==='suspended')await audio.resume();
 await Promise.all([0,1,2,3,4,5].map(loadGuitarSample));
 playing=true;document.querySelector('#play').textContent='■ STOP';tick();scheduleNext()};
render();

const importButton=document.querySelector('#importScore');
const importStatus=document.querySelector('#importStatus');
async function loadWithAlphaTab(file){
 if(!window.alphaTab)throw new Error('Le moteur alphaTab n’est pas chargé dans cette version de Guitar Liberty.');
 stop();
 tab.classList.add('alphatab-score');
 tab.innerHTML='';
 const rawBytes=await window.guitarAudio.readScore(file.filePath);
 const bytes=rawBytes instanceof Uint8Array?rawBytes:new Uint8Array(rawBytes);
 if(!bytes.length)throw new Error('Le fichier Guitar Pro est vide.');
 const api=new window.alphaTab.AlphaTabApi(tab,{
  core:{useWorkers:false,engine:'svg',enableLazyLoading:false},
  display:{layoutMode:'page'},
  notation:{notationMode:'guitarpro'}
 });
 window.guitarLibertyAlphaTab=api;
 let completed=false;
 api.scoreLoaded.on(score=>{
  completed=true;
  document.querySelector('#title').textContent=score.title||file.name.replace(/\.[^.]+$/,'');
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
