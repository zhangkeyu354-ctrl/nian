// 音效：优先播放 CC0 采样（/assets/cc0/sfx，Kenney），加载失败时退回合成音。不读私密状态、不发命令。
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
const SFX = "/assets/cc0/sfx/";
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(name: string) {
  if (!context) return Promise.resolve(null);
  let p = buffers.get(name);
  if (!p) {
    const ctx = context;
    p = fetch(SFX + name + ".mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}
/** 每种提示音对应的采样（多个时随机挑一个，听起来不重复） */
const SAMPLES: Record<string, string[]> = {
  dice: ["casino_diceThrow1", "casino_diceThrow2", "casino_dieThrow1"],
  success: ["jingle_steel03"],
  great_success: ["jingle_steel00"],
  failure: ["digital_lowDown"],
  injury: ["knifeSlice", "knifeSlice2"],
  sting_hit: ["sting_hit"],
  danger: ["digital_lowThreeTone"],
  turn: ["ui_switch2"],
  // 棋盘动作
  slash: ["drawKnife2"],
  lift: ["cloth3", "clothBelt"],
  hook: ["sting_hit"],
  sacrifice: ["sting_sacrifice"],
  rescue: ["metalClick"],
  pallet: ["chop", "bookPlace1"],
  break: ["chop", "creak3"],
  chest: ["handleCoins", "doorOpen_1"],
  repair: ["metalClick", "metalPot1"],
  sparks: ["metalClick"],
  complete: ["jingle_steel00", "digital_powerUp2"],
  heal: ["cloth1", "handleSmallLeather"],
  healed: ["jingle_steel05"],
  cleanse: ["digital_phaseJump1"],
  totem: ["digital_phaseJump1"],
  hide: ["doorClose_2", "doorClose_4"],
  search: ["creak1", "creak2"],
  exit: ["doorOpen_2", "creak3"],
  sabotage: ["metalPot3"],
  reveal: ["casino_cardPlace1", "casino_cardSlide1"],
  trap: ["metalLatch"],
  escape: ["jingle_steel08"],
  power: ["digital_zap1"],
  teleport: ["digital_phaseJump1"],
  item: ["handleSmallLeather2"],
  crow: ["cloth4"],
  step: ["footstep00", "footstep03", "footstep06"],
  click: ["ui_click1"],
};
function playSample(kind: string, volume = 0.7) {
  const list = SAMPLES[kind];
  if (!list || !context || context.state !== "running") return false;
  const ctx = context;
  void load(list[Math.floor(Math.random() * list.length)]).then((buf) => {
    if (!buf) return;
    const src = ctx.createBufferSource(),
      gain = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  });
  return true;
}
let uiSound = true;
export const setUiSound = (on: boolean) => {
  uiSound = on;
};
if (typeof document !== "undefined")
  document.addEventListener("pointerup", (e) => {
    const b = (e.target as Element | null)?.closest?.("button");
    if (uiSound && b && !(b as HTMLButtonElement).disabled) setTimeout(() => playSample("click", 0.35), 0);
  });
/** 棋盘特效配套音效（所有人都能看到的公开动作） */
export function playFxSound(kind: string, sound: boolean) {
  if (sound) playSample(kind, kind === "step" || kind === "reveal" ? 0.45 : 0.75);
}
export function playCue(kind: string, sound: boolean, vibration: boolean) {
  if (vibration && navigator.userActivation?.hasBeenActive) {
    try {
      navigator.vibrate?.(
        kind === "danger" ? [50, 70, 50] : kind === "injury" ? 100 : 35,
      );
    } catch {}
  }
  if (!sound || context?.state !== "running") return;
  if (playSample(kind)) return;
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

/* ---------- 背景音乐（CC0：Sami Hiltunen 免费合集，见 assets/cc0/README.md） ---------- */
const MUSIC = "/assets/cc0/music/";
let musicOn = true;
let current: { name: string; el: HTMLAudioElement } | null = null;
let ambience: HTMLAudioElement | null = null;
let wanted: { name: string | null; amb: boolean } = { name: null, amb: false };
const VOL = 0.22;
function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}
function apply() {
  const name = musicOn ? wanted.name : null;
  if (current?.name !== name) {
    const old = current;
    if (old) fade(old.el, 0, 1200, () => old.el.pause());
    current = null;
    if (name) {
      const el = new Audio(MUSIC + name + ".mp3");
      el.loop = true;
      el.volume = 0;
      current = { name, el };
      void el.play().then(() => fade(el, VOL, 1500)).catch(() => {});
    }
  }
  const amb = musicOn && wanted.amb;
  if (amb && !ambience) {
    ambience = new Audio(MUSIC + "amb_hallway.mp3");
    ambience.loop = true;
    ambience.volume = 0;
    void ambience.play().then(() => ambience && fade(ambience, 0.12, 2000)).catch(() => {});
  } else if (!amb && ambience) {
    const a = ambience;
    ambience = null;
    fade(a, 0, 1000, () => a.pause());
  }
}
/** 选择当前背景音乐（null = 静音）；浏览器要求先有一次点按才能出声，之后自动开始 */
export function setMusic(name: string | null, withAmbience = false) {
  wanted = { name, amb: withAmbience };
  apply();
}
export function setMusicEnabled(on: boolean) {
  musicOn = on;
  apply();
}
if (typeof window !== "undefined")
  window.addEventListener("pointerup", () => {
    if (current && current.el.paused) void current.el.play().then(() => current && fade(current.el, VOL, 1500)).catch(() => {});
    if (ambience && ambience.paused) void ambience.play().catch(() => {});
  });
