const exercises={
chromatic:{title:'Chromatique 1-2-3-4',strings:[['e',1,2,3,4],['B',1,2,3,4],['G',1,2,3,4],['D',1,2,3,4],['A',1,2,3,4],['E',1,2,3,4]]},
pentatonic:{title:'Pentatonique Am',strings:[['e',5,8],['B',5,8],['G',5,7],['D',5,7],['A',5,7],['E',5,8]]}
};
let current='chromatic',playing=false,timer=null,audio;
const tab=document.querySelector('#tab'),progress=document.querySelector('#progress');
function render(){
 const e=exercises[current]; document.querySelector('#title').textContent=e.title;
 tab.textContent=e.strings.map(s=>s[0]+'|--'+s.slice(1).join('--')+'--|').join('\n');
}
function tone(freq=.01){
 audio ||= new (window.AudioContext||window.webkitAudioContext)();
 const o=audio.createOscillator(),g=audio.createGain();
 o.type='triangle';o.frequency.value=110*2**(freq/12);g.gain.setValueAtTime(.08,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.35);
 o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.36);
}
document.querySelectorAll('.exercise').forEach(b=>b.onclick=()=>{document.querySelector('.active').classList.remove('active');b.classList.add('active');current=b.dataset.ex;render()});
document.querySelector('#tempo').oninput=e=>document.querySelector('#bpm').textContent=e.target.value+' BPM';
document.querySelector('#play').onclick=()=>{
 playing=!playing;document.querySelector('#play').textContent=playing?'■ STOP':'▶ PLAY';clearInterval(timer);
 if(!playing){progress.style.width='0';return}
 let i=0;const tick=()=>{tone(i%12);progress.style.width=((i%24+1)/24*100)+'%';i++};
 tick();timer=setInterval(tick,60000/+document.querySelector('#tempo').value);
};
render();