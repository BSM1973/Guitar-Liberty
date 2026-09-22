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
const SAMPLE_ROOT='../assets/guitar/clean';
const GUITAR_SAMPLES=['E aigue0.aiff','B0.aiff','G0.aiff','D0.aiff','A0.aiff','E0.aiff'];
const openMidi=[64,59,55,50,45,40];

async function loadGuitarSample(string){
 audio ||= new (window.AudioContext||window.webkitAudioContext)();
 if(sampleCache.has(string)) return sampleCache.get(string);
 try{
   const sampleUrl=new URL(`${SAMPLE_ROOT}/${GUITAR_SAMPLES[string]}`,window.location.href);
   const response=await fetch(sampleUrl.href);
   if(!response.ok) throw new Error('sample missing');
   const buffer=await audio.decodeAudioData(await response.arrayBuffer());
   sampleCache.set(string,buffer);
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
 const n=e.notes.length, measures=Math.max(4,Math.ceil(n/4));
 let html='<div class="system"><div class="tab-word">TAB</div><div class="time-signature">4<br>4</div><div class="strings">';
 for(let s=0;s<6;s++)html+=`<div class="string" style="top:${s*22}px"></div>`;
 for(let m=0;m<=measures;m++){const x=m/measures*100;html+=`<div class="measure-line" style="left:${x}%"></div>`;if(m<measures)html+=`<div class="measure-number" style="left:calc(${x}% + 6px)">${m+1}</div>`;}
 e.notes.forEach((v,i)=>{const [s,fingerFret,finger]=v,x=(i+.5)/n*100,y=s*22;html+=`<span class="pick" style="left:${x}%">${i%2?'∨':'∧'}</span><span class="note" data-i="${i}" style="left:${x}%;top:${y}px">${fingerFret}</span><span class="beat-stem" style="left:${x}%;top:${y+7}px;height:${Math.max(15,116-y)}px"></span><span class="finger" style="left:${x}%">${finger}</span>`;});
 html+=`<span class="repeat">${e.repeat}x</span></div></div>`;tab.innerHTML=html;index=0;progress.style.width='0';
}
function syncTempo(){document.querySelector('#bpm').textContent=tempo.value+' BPM';document.querySelector('#scoreTempo').textContent='♩ = '+tempo.value}
function playNote(string,fret){
 audio ||= new (window.AudioContext||window.webkitAudioContext)();
 const now=audio.currentTime;
 loadGuitarSample(string).then(buffer=>{
   if(buffer){
     const source=audio.createBufferSource();
     const gain=audio.createGain();
     const tone=audio.createBiquadFilter();
     source.buffer=buffer;
     source.playbackRate.value=2**(fret/12);
     tone.type='lowpass'; tone.frequency.value=6500; tone.Q.value=.2;
     gain.gain.setValueAtTime(.9,now);
     gain.gain.exponentialRampToValueAtTime(.001,now+2.6);
     source.connect(tone).connect(gain).connect(audio.destination);
     source.start();
     return;
   }
   // Fallback until the six real-guitar WAV samples are installed.
   const freq=440*2**((tuning[string]+fret-69)/12);
   const duration=1.8,sampleRate=audio.sampleRate;
   const burst=audio.createBuffer(1,Math.max(2,Math.floor(sampleRate/freq)),sampleRate);
   const data=burst.getChannelData(0);
   for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length*.35);
   const source=audio.createBufferSource(),delay=audio.createDelay(1),feedback=audio.createGain(),damp=audio.createBiquadFilter(),gain=audio.createGain();
   source.buffer=burst;source.loop=true;delay.delayTime.value=1/freq;feedback.gain.value=.985;damp.type='lowpass';damp.frequency.value=3500;
   gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
   source.connect(delay);delay.connect(damp);damp.connect(feedback);feedback.connect(delay);damp.connect(gain).connect(audio.destination);source.start(now);source.stop(now+.045);
 });
}
function stop(){playing=false;clearInterval(timer);document.querySelector('#play').textContent='▶ PLAY';document.querySelectorAll('.note').forEach(n=>n.classList.remove('active'))}
function tick(){const e=exercises[current];document.querySelectorAll('.note').forEach(n=>n.classList.toggle('active',+n.dataset.i===index));const [s,f]=e.notes[index];playNote(s,f);progress.style.width=((index+1)/e.notes.length*100)+'%';index++;if(index>=e.notes.length){index=0}}
document.querySelectorAll('.exercise').forEach(b=>b.onclick=()=>{stop();document.querySelector('.exercise.active').classList.remove('active');b.classList.add('active');current=b.dataset.ex;render()});
tempo.oninput=()=>{syncTempo();if(playing){clearInterval(timer);timer=setInterval(tick,60000/+tempo.value/2)}};
document.querySelector('#play').onclick=()=>{if(playing){stop();return}playing=true;document.querySelector('#play').textContent='■ STOP';tick();timer=setInterval(tick,60000/+tempo.value/2)};
render();