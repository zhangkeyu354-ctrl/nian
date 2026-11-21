let audio: AudioContext | null = null;

export function tabletopFeedback(type: string, soundOn: boolean) {
  if (!/^(choose|mark|solve|submit_hunt|event_)/.test(type)) return;
  try { navigator.vibrate?.(type === "solve" || type === "submit_hunt" ? 18 : 9); } catch { /* Browser may block haptics. */ }
  if (!soundOn || document.visibilityState !== "visible") return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const start = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(type === "mark" ? 620 : type === "solve" ? 170 : 290, start);
    oscillator.frequency.exponentialRampToValueAtTime(type === "mark" ? 470 : 125, start + .065);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.035, start + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .075);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + .08);
  } catch { /* Audio is optional when a device blocks playback. */ }
}
