// Tactile feedback for the drawing studios: short synthesized sounds + haptics.
// Sounds are generated with WebAudio (no files), quiet, and can be muted in the menu.
export type Cue =
  | "tap"
  | "select"
  | "submit"
  | "turn"
  | "page"
  | "stamp"
  | "tick"
  | "win"
  | "lose"
  | "pen";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function soundOn() {
  try {
    return localStorage.getItem("dp-sound") !== "0";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem("dp-sound", on ? "1" : "0");
  } catch {}
}

function audio() {
  if (!ctx) {
    const A = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const buzz: Partial<Record<Cue, number | number[]>> = {
  tap: 6,
  select: 10,
  submit: [14, 40, 22],
  turn: [24, 60, 24],
  stamp: 28,
  tick: 5,
  win: [30, 50, 30, 50, 60],
  lose: 60,
  pen: 4,
};

export function feel(
  cue: Cue,
  options?: {
    sound?: boolean;
    vibration?: boolean;
    volume?: number;
    mix?: "normalized";
  },
) {
  try {
    const v = buzz[cue];
    if (options?.vibration !== false && v && "vibrate" in navigator)
      navigator.vibrate(v);
  } catch {}
  if (!(options?.sound ?? soundOn()) || cue === "pen") return;
  try {
    const c = audio();
    if (!c) return;
    let output: AudioNode = master!;
    if (options?.mix === "normalized") {
      normalizedMix ??= createNormalizedMix(c, master!);
      normalizedMix.volume.gain.setValueAtTime(
        Math.max(0, Math.min(1, options.volume ?? 0.7)),
        c.currentTime,
      );
      const gain = c.createGain();
      gain.gain.value = NORMALIZED_CUE_GAIN[cue];
      gain.connect(normalizedMix.input);
      output = gain;
      setTimeout(() => gain.disconnect(), 1200);
    }
    synthesizeCue(c, output, cue);
  } catch {}
}

export function synthesizeCue(
  audioContext: BaseAudioContext,
  output: AudioNode,
  cue: Cue,
  t = audioContext.currentTime + 0.005,
) {
  function tone(
    freq: number,
    at: number,
    dur: number,
    vol: number,
    type: OscillatorType = "sine",
    slideTo?: number,
  ) {
    const c = audioContext,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(output);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  function noise(
    at: number,
    dur: number,
    vol: number,
    from: number,
    to: number,
  ) {
    const c = audioContext,
      len = Math.ceil(c.sampleRate * dur),
      buf = c.createBuffer(1, len, c.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = buf;
    f.type = "bandpass";
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f);
    f.connect(g);
    g.connect(output);
    s.start(at);
  }

  switch (cue) {
    case "tap":
      noise(t, 0.035, 0.35, 2400, 1600);
      tone(880, t, 0.05, 0.05, "triangle", 660);
      break;
    case "select":
      tone(660, t, 0.09, 0.08, "triangle");
      tone(990, t + 0.05, 0.12, 0.07, "triangle");
      break;
    case "submit":
      tone(523, t, 0.12, 0.09, "triangle");
      tone(784, t + 0.08, 0.2, 0.09, "triangle");
      tone(1046, t + 0.16, 0.28, 0.06, "sine");
      break;
    case "turn":
      tone(587, t, 0.14, 0.08, "triangle");
      tone(740, t + 0.1, 0.14, 0.08, "triangle");
      tone(880, t + 0.2, 0.3, 0.09, "triangle");
      break;
    case "page":
      noise(t, 0.22, 0.28, 900, 4200);
      break;
    case "stamp":
      tone(140, t, 0.16, 0.22, "sine", 60);
      noise(t, 0.06, 0.35, 700, 300);
      break;
    case "tick":
      tone(1320, t, 0.04, 0.05, "square");
      break;
    case "win":
      [523, 659, 784, 1046].forEach((f, i) =>
        tone(f, t + i * 0.09, 0.32, 0.08, "triangle"),
      );
      break;
    case "lose":
      tone(392, t, 0.25, 0.08, "triangle", 330);
      tone(311, t + 0.2, 0.4, 0.08, "triangle", 262);
      break;
  }
}

export const NORMALIZED_CUE_GAIN: Record<Cue, number> = {
  tap: 2,
  select: 1.8,
  submit: 1,
  turn: 1.5,
  page: 1.5,
  stamp: 0.5,
  tick: 3,
  win: 1,
  lose: 1.4,
  pen: 0,
};
export function createNormalizedMix(
  c: BaseAudioContext,
  destination: AudioNode,
  initialVolume = 1,
) {
  const input = c.createGain(),
    limiter = c.createWaveShaper(),
    volume = c.createGain();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.max(-0.04, Math.min(0.04, x));
  }
  limiter.curve = curve;
  volume.gain.value = initialVolume;
  input.connect(limiter);
  limiter.connect(volume);
  volume.connect(destination);
  return { input, volume };
}
let normalizedMix: ReturnType<typeof createNormalizedMix> | null = null;
export function setNormalizedVolume(value: number) {
  if (normalizedMix && ctx)
    normalizedMix.volume.gain.setValueAtTime(
      Math.max(0, Math.min(1, value)),
      ctx.currentTime,
    );
}
