const key="ta-mute";let isMuted=false;try{isMuted=localStorage.getItem(key)==="1"}catch{}
let bgm:HTMLAudioElement|null=null,cur:string|null=null;
const url=(n:string)=>`/assets/menace/audio/${n}.mp3`;
export const muted=()=>isMuted;
export function setMute(m:boolean){isMuted=m;try{localStorage.setItem(key,m?"1":"0")}catch{}if(bgm)bgm.muted=m}
export function sfx(n:string){if(isMuted)return;const a=new Audio(url(n));a.volume=.4;void a.play().catch(()=>{})}
let retry: (() => void) | null = null;

export function music(name: string | null, loop = true) {
  if (name === cur) return;
  cur = name;
  if (retry) removeEventListener("pointerdown", retry);
  retry = null;
  bgm?.pause();
  bgm = null;
  if (!name) return;
  const track = new Audio(url(name));
  bgm = track;
  track.loop = loop;
  track.volume = loop ? .1 : .3;
  track.muted = isMuted;
  const play = () => {
    void track.play().catch(() => {
      if (bgm === track) addEventListener("pointerdown", play, { once: true });
    });
  };
  retry = play;
  play();
}
