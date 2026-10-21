// Synthesized original tones only. Never reads private state or sends game commands.
let context: AudioContext | null = null;
function unlock() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {}
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerup", unlock);
  window.addEventListener("keydown", unlock);
}
const tones: Record<string, number[]> = {
  dice: [170, 260, 190, 330],
  success: [440, 660],
  failure: [240, 130],
  great_success: [440, 660, 880],
  injury: [120, 74],
  turn: [620, 420],
  danger: [92, 92, 130],
};
export function playCue(kind: string, sound: boolean, vibration: boolean) {
  if (vibration && navigator.userActivation?.hasBeenActive) {
    try {
      navigator.vibrate?.(
        kind === "danger" ? [50, 70, 50] : kind === "injury" ? 100 : 35,
      );
    } catch {}
  }
  if (!sound || context?.state !== "running") return;
  const ctx = context;
  const notes = tones[kind] ?? tones.success;
  notes.forEach((hz, i) => {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    const at = ctx.currentTime + i * 0.085;
    osc.type = kind === "danger" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.045, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.15);
  });
}
