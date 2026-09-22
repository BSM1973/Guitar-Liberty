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
 const n=e.notes.length, notesPerMeasure=4, measures=Math.max(1,Math.ceil(n/notesPerMeasure)), measuresPerSystem=4, systemCount=Math.ceil(measures/measuresPerSystem);
 let html='<div class="score-systems">';
 for(let sys=0;sys<systemCount;sys++){
  const firstMeasure=sys*measuresPerSystem, measureCount=Math.min(measuresPerSystem,measures-firstMeasure), firstNote=firstMeasure*notesPerMeasure, lastNote=Math.min(n,(firstMeasure+measureCount)*notesPerMeasure);
  html+='<div class="system"><div class="tab-word">TAB</div><div class="time-signature">4<br>4</div><div class="strings">';
  for(let s=0;s<6;s++)html+='<div class="string" style="top:'+(s*22)+'px"></div>';
  for(let m=0;m<=measureCount;m++){const x=m/measureCount*100;html+='<div class="measure-line" style="left:'+x+'%"></div>';if(m<measureCount)html+='<div class="measure-number" style="left:calc('+x+'% + 7px)">'+(firstMeasure+m+1)+'</div>';}
  for(let i=firstNote;i<lastNote;i++){const v=e.notes[i],s=v[0],fret=v[1],finger=v[2],local=i-firstNote,slots=measureCount*notesPerMeasure,x=(local+.5)/slots*100,y=s*22;html+='<span class="pick" style="left:'+x+'%">'+(i%2?'∨':'∧')+'</span><span class="note" data-i="'+i+'" style="left:'+x+'%;top:'+y+'px">'+fret+'</span><span class="finger" style="left:'+x+'%">'+finger+'</span>';}
  if(sys===systemCount-1)html+='<span class="repeat">'+e.repeat+'x</span>';
  html+='</div></div>';
 }
 html+='</div>';tab.innerHTML=html;index=0;progress.style.width='0';
}
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
function stop(){playing=false;clearInterval(timer);stopAllVoices();document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'))}
function tick(){const e=exercises[current];document.querySelectorAll('.note').forEach(n=>n.classList.toggle('active',+n.dataset.i===index));const [s,f]=e.notes[index];playNote(s,f);progress.style.width=((index+1)/e.notes.length*100)+'%';index++;if(index>=e.notes.length){index=0}}
document.querySelectorAll('.exercise').forEach(b=>b.onclick=()=>{stop();document.querySelector('.exercise.active').classList.remove('active');b.classList.add('active');current=b.dataset.ex;render()});
tempo.oninput=()=>{syncTempo();if(playing){clearInterval(timer);timer=setInterval(tick,60000/+tempo.value/2)}};
document.querySelector('#play').onclick=async()=>{if(playing){stop();return}
 ensureOutput(); if(audio.state==='suspended')await audio.resume();
 await Promise.all([0,1,2,3,4,5].map(loadGuitarSample));
 playing=true;document.querySelector('#play').textContent='■ STOP';tick();timer=setInterval(tick,60000/+tempo.value/2)};
render();

const importButton=document.querySelector('#importScore');
const importStatus=document.querySelector('#importStatus');
if(importButton) importButton.onclick=async()=>{
 const file=await window.guitarAudio.importScore();
 if(!file)return;
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
  const stepSemis={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const open=[64,59,55,50,45,40];
  let importedTempo=90;
  const soundTempo=doc.querySelector('sound[tempo]');
  if(soundTempo) importedTempo=Math.round(+soundTempo.getAttribute('tempo'))||90;
  part.querySelectorAll('measure').forEach(measure=>{
   measure.querySelectorAll(':scope > note').forEach(note=>{
    if(note.querySelector('rest')) return;
    const pitch=note.querySelector('pitch');
    if(!pitch) return;
    const step=pitch.querySelector('step')?.textContent||'C';
    const alter=+(pitch.querySelector('alter')?.textContent||0);
    const octave=+(pitch.querySelector('octave')?.textContent||4);
    const midi=(octave+1)*12+stepSemis[step]+alter;
    const tech=note.querySelector('notations technical');
    let stringNo=+(tech?.querySelector('string')?.textContent||0);
    let fret=+(tech?.querySelector('fret')?.textContent||-1);
    let s=-1;
    if(stringNo>=1&&stringNo<=6&&fret>=0){s=stringNo-1;}
    else{
     for(let candidate=0;candidate<6;candidate++){
      const f=midi-open[candidate];
      if(f>=0&&f<=24){s=candidate;fret=f;break;}
     }
    }
    if(s<0||fret<0)return;
    const finger=+(tech?.querySelector('fingering')?.textContent||0);
    imported.push([s,fret,finger||Math.min(4,Math.max(1,fret%4||4))]);
   });
  });
  if(!imported.length) throw new Error('Aucune note de tablature exploitable trouvée');
  const key='imported';
  exercises[key]={title:file.name.replace(/\.(musicxml|xml)$/i,''),subtitle:'Tablature importée • MusicXML',tempo:importedTempo,repeat:1,notes:imported};
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
