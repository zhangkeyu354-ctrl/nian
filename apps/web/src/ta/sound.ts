const key="ta-mute";let isMuted=false;try{isMuted=localStorage.getItem(key)==="1"}catch{}
let bgm:HTMLAudioElement|null=null,cur:string|null=null;
const url=(n:string)=>`/assets/menace/audio/${n}.mp3`;
export const muted=()=>isMuted;
export function setMute(m:boolean){isMuted=m;try{localStorage.setItem(key,m?"1":"0")}catch{}for (const track of [bgm, fadingBgm, endingAudio]) if(track)track.muted=m}
export function sfx(n:string){if(isMuted||endingAudio)return;const a=new Audio(url(n));a.volume=.4;void a.play().catch(()=>{})}
let retry: (() => void) | null = null;

export function music(name: string | null, fadeOut = 0) {
  if (name === cur) return;
  cur = name;
  if (retry) removeEventListener("pointerdown", retry);
  retry = null;
  if (bgm) {
    const previous = bgm;
    if (fadeOut) {
      fadingBgm = previous;
      fadeToSilence(previous, fadeOut, () => {
        if (fadingBgm === previous) fadingBgm = null;
      });
    } else previous.pause();
  }
  bgm = null;
  if (!name) return;
  const track = new Audio(url(name));
  bgm = track;
  track.loop = true;
  track.volume = .1;
  track.muted = isMuted;
  const play = () => {
    void track.play().catch(() => {
      if (bgm === track) addEventListener("pointerdown", play, { once: true });
    });
  };
  retry = play;
  play();
}

let fadingBgm: HTMLAudioElement | null = null;
let endingAudio: HTMLAudioElement | null = null;
let endingFrame = 0;
let retryEnding: (() => void) | null = null;
let stoppingEnding: HTMLAudioElement | null = null;

function fadeToSilence(track: HTMLAudioElement, duration: number, done: () => void) {
  const volume = track.volume;
  const start = performance.now();
  const update = (now: number) => {
    const remaining = Math.max(0, 1 - (now - start) / duration);
    track.volume = volume * remaining;
    if (remaining) requestAnimationFrame(update);
    else {
      track.pause();
      done();
    }
  };
  requestAnimationFrame(update);
}

export function playEnding(track: HTMLAudioElement) {
  if (endingAudio === track) return;
  stopEnding();
  endingAudio = track;
  track.volume = 0;
  track.muted = isMuted;
  const update = () => {
    const fadeIn = Math.min(1, track.currentTime / .8);
    const fadeOut = Number.isFinite(track.duration) ? Math.max(0, Math.min(1, (track.duration - track.currentTime) / 3)) : 1;
    track.volume = .55 * Math.min(fadeIn, fadeOut);
    if (!track.ended) endingFrame = requestAnimationFrame(update);
  };
  const play = () => {
    void track.play().then(() => {
      if (endingAudio === track && stoppingEnding !== track) endingFrame = requestAnimationFrame(update);
    }).catch(() => {
      if (endingAudio === track && stoppingEnding !== track) {
        retryEnding = play;
        addEventListener("pointerdown", play, { once: true });
      }
    });
  };
  play();
}

export function stopEnding() {
  const track = endingAudio;
  if (!track || stoppingEnding === track) return;
  stoppingEnding = track;
  if (retryEnding) removeEventListener("pointerdown", retryEnding);
  retryEnding = null;
  cancelAnimationFrame(endingFrame);
  fadeToSilence(track, 1000, () => {
    if (endingAudio === track) endingAudio = null;
    if (stoppingEnding === track) stoppingEnding = null;
  });
}
