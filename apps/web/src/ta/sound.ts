const key="ta-mute";let isMuted=false;try{isMuted=localStorage.getItem(key)==="1"}catch{}
let bgm:HTMLAudioElement|null=null,cur:string|null=null;
const url=(n:string)=>`/assets/menace/audio/${n}.mp3`;
export const muted=()=>isMuted;
export function setMute(m:boolean){isMuted=m;try{localStorage.setItem(key,m?"1":"0")}catch{}if(bgm)bgm.muted=m}
export function sfx(n:string){if(isMuted)return;const a=new Audio(url(n));a.volume=.4;void a.play().catch(()=>{})}
export function music(n:string|null){if(n===cur)return;cur=n;bgm?.pause();bgm=null;if(!n)return;bgm=new Audio(url(n));bgm.loop=true;bgm.volume=.1;bgm.muted=isMuted;const go=()=>void bgm?.play().catch(()=>{});go();addEventListener("pointerdown",go,{once:true})}
