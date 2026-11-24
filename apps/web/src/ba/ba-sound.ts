type Event='select'|'play'|'trick'|'shuffle'|'return'|'blackA'|'mixed'|'pure'|'bomb'|'double'|'result';
const base='/assets/black-a-510k/audio/';
const files:Partial<Record<Event,string>>={select:'contact1.wav',play:'contact2.wav',trick:'cut.wav',shuffle:'shuffle.wav',return:'contact2.wav',blackA:'contact2.wav',mixed:'contact2.wav',pure:'contact2.wav',bomb:'cut.wav',double:'cut.wav',result:'shuffleandbridge.wav'};
const volume:Record<Event,number>={select:.25,play:.48,trick:.54,shuffle:.4,return:.42,blackA:.55,mixed:.5,pure:.55,bomb:.62,double:.65,result:.48};
let unlocked=false,context:AudioContext|null=null;
let active=0;
export function soundEnabled(){try{return localStorage.getItem('ba-sound')!=='0'}catch{return true}}
export function setSoundEnabled(value:boolean){try{localStorage.setItem('ba-sound',value?'1':'0')}catch{}}
export function unlockSound(){unlocked=true;try{context??=new AudioContext();void context.resume()}catch{}}
function accent(kind:Event){
  if(!context||!['blackA','mixed','pure','bomb','double','result'].includes(kind))return;
  const pitches:Partial<Record<Event,number[]>>={blackA:[220],mixed:[330,392,494],pure:[392,494,587],bomb:[110],double:[220,330],result:[392,523]};
  const notes=pitches[kind]??[];
  notes.forEach((frequency,index)=>{
    const at=context!.currentTime+index*.065;
    const osc=context!.createOscillator(),gain=context!.createGain();
    osc.type=kind==='bomb'?'triangle':'sine';osc.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(kind==='bomb'?.045:.025,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+.15);
    osc.connect(gain).connect(context!.destination);osc.start(at);osc.stop(at+.16);
  });
}
export function playSound(kind:Event){
  if(!unlocked||!soundEnabled()||document.hidden||active>=3)return;
  const file=files[kind];if(file){const audio=new Audio(base+file);audio.volume=volume[kind];active++;const done=()=>active=Math.max(0,active-1);audio.onended=done;audio.onerror=done;void audio.play().catch(done)}
  accent(kind);
}
