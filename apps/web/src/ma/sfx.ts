/**
 * 魔法运动员的音效与震动：全部用 Web Audio 现场合成，不需要下载音频文件。
 * 手机浏览器要求「用户点过一次屏幕」之后才能出声，所以第一次点击时解锁。
 * 静音开关存在本机（localStorage），默认有声音。
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const KEY = "ma-muted";

function readMuted() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

export const sfxMuted = () => muted;
export function setSfxMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {
    /* 隐私模式等：忽略 */
  }
  listeners.forEach((f) => f(m));
  syncMusic();
}
export function onMutedChange(f: (m: boolean) => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

// ---------------------------------------------------------------- 真实录音音效 + 背景音乐
// 素材：Kenney 音效包与 OwlishMedia《Happy Clappy Loop》，均为 CC0（见 assets/.../audio/CREDITS.txt）。
// 录音还没加载好或加载失败时，自动退回下面的合成音，不会没声音。
const AUDIO = "/assets/magical-athlete/audio/";
const SAMPLE_NAMES = [
  "tap", "your-turn", "shake", "roll-1", "roll-2", "land-1", "land-2", "land-3", "step",
  "power", "finish", "count", "go", "fanfare", "fanfare-big", "oops",
] as const;
type SampleName = (typeof SAMPLE_NAMES)[number];
const buffers = new Map<string, AudioBuffer>();
let loading = false;
function loadSamples(c: AudioContext) {
  if (loading) return;
  loading = true;
  for (const name of [...SAMPLE_NAMES, "music"]) {
    fetch(AUDIO + name + ".mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        buffers.set(name, buf);
        if (name === "music") syncMusic();
      })
      .catch(() => {
        /* 网络不好就继续用合成音 */
      });
  }
}
/** 播放一段录音；没加载好返回 false，调用方改用合成音 */
function sample(name: SampleName | SampleName[], vol = 0.8, at = 0): boolean {
  const c = ac();
  if (!c || !master) return false;
  const pick = Array.isArray(name) ? name[Math.floor(Math.random() * name.length)] : name;
  const buf = buffers.get(pick);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start(c.currentTime + at);
  return true;
}

// 背景音乐：单独开关（存本机），默认开、音量小；总静音时也一起停
const MUSIC_KEY = "ma-music-off";
let musicOff = (() => {
  try {
    return localStorage.getItem(MUSIC_KEY) === "1";
  } catch {
    return false;
  }
})();
let musicWanted = false;
let musicNode: { src: AudioBufferSourceNode; g: GainNode } | null = null;
const musicListeners = new Set<(off: boolean) => void>();
export const musicIsOff = () => musicOff;
export function setMusicOff(off: boolean) {
  musicOff = off;
  try {
    localStorage.setItem(MUSIC_KEY, off ? "1" : "0");
  } catch {
    /* 忽略 */
  }
  musicListeners.forEach((f) => f(off));
  syncMusic();
}
export function onMusicChange(f: (off: boolean) => void) {
  musicListeners.add(f);
  return () => {
    musicListeners.delete(f);
  };
}
/** 进入游戏时调用 true，离开时调用 false */
export function wantMusic(on: boolean) {
  musicWanted = on;
  syncMusic();
}
function loopBounds(buf: AudioBuffer) {
  // 去掉 mp3 编码在首尾留下的静音，循环才不会有空拍
  const d = buf.getChannelData(0);
  let a = 0,
    b = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < 0.002) a++;
  while (b > a && Math.abs(d[b]) < 0.002) b--;
  return [a / buf.sampleRate, (b + 1) / buf.sampleRate];
}
function syncMusic() {
  const play = musicWanted && !musicOff && !muted;
  if (!play) {
    if (musicNode) {
      const { src, g } = musicNode;
      musicNode = null;
      try {
        g.gain.setTargetAtTime(0.0001, g.context.currentTime, 0.15);
        src.stop(g.context.currentTime + 0.6);
      } catch {
        /* 已停止 */
      }
    }
    return;
  }
  if (musicNode) return;
  const c = ac();
  const buf = buffers.get("music");
  if (!c || !master || !buf) return;
  const [start, end] = loopBounds(buf);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = start;
  src.loopEnd = end;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 1.2);
  src.connect(g).connect(master);
  src.start(c.currentTime, start);
  musicNode = { src, g };
}

/** 在第一次点击 / 触摸时解锁声音（之后自动生效） */
export function installAudioUnlock() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const c = ac();
    if (c) loadSamples(c);
    if (c && c.state === "running") {
      syncMusic();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

export function vibrate(pattern: number | number[]) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 不支持就算了（iPhone 没有震动接口） */
  }
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = "triangle", vol = 0.25, slideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(at: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = "bandpass") {
  const c = ac();
  if (!c || !master) return null;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
  return { g, t0 };
}

/** 按钮按下：短促的「嗒」 */
export function sfxTap() {
  if (!sample("tap", 0.5)) tone(880, 0, 0.05, "square", 0.06, 660);
  vibrate(8);
}
/** 骰子在手里哗啦啦 */
export function sfxRoll() {
  if (!sample(["roll-1", "roll-2"], 0.9))
    for (let i = 0; i < 7; i++) noise(i * 0.09 + Math.random() * 0.03, 0.05, 0.22, 2400 + Math.random() * 1600, 3);
  vibrate([12, 40, 12, 40, 12]);
}
/** 骰子落定：咚 */
export function sfxLand(value?: number) {
  if (!sample(["land-1", "land-2", "land-3"], 0.9)) {
    tone(160, 0, 0.18, "sine", 0.4, 70);
    noise(0, 0.08, 0.25, 900, 1.2);
  }
  if (value === 6) tone(1320, 0.08, 0.25, "triangle", 0.12);
  vibrate(30);
}
/** 每走一格：轻轻的脚步 */
let stepAlt = false;
export function sfxStep() {
  stepAlt = !stepAlt;
  if (!sample("step", 0.35)) tone(stepAlt ? 520 : 440, 0, 0.07, "triangle", 0.12, stepAlt ? 600 : 500);
}
/** 技能发动：魔法闪光 */
export function sfxPower() {
  if (!sample("power", 0.7)) {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.28, "sine", 0.13));
    noise(0, 0.35, 0.05, 6000, 0.8, "highpass");
  }
  vibrate([15, 30, 25]);
}
/** 摔倒 / 淘汰：往下滑的「哎呀」 */
export function sfxOops() {
  sample("oops", 0.7);
  tone(500, 0, 0.35, "sawtooth", 0.08, 140);
  vibrate(60);
}
/** 冲线：叮叮 */
export function sfxFinish() {
  if (!sample("finish", 0.75)) {
    tone(1047, 0, 0.18, "triangle", 0.2);
    tone(1568, 0.12, 0.35, "triangle", 0.2);
  }
  vibrate([20, 40, 60]);
}
/** 轮到你了 */
export function sfxYourTurn() {
  if (!sample("your-turn", 0.75)) {
    tone(660, 0, 0.12, "sine", 0.22);
    tone(990, 0.11, 0.22, "sine", 0.22);
  }
  vibrate([40, 60, 40]);
}
/** 颁奖号角：小号般的上行琶音 */
export function sfxFanfare(big = false) {
  if (sample(big ? "fanfare-big" : "fanfare", 0.8)) return;
  const notes = big ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784, 1047];
  const step = 0.13;
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone(f, i * step, last ? 0.9 : 0.16, "sawtooth", 0.09);
    tone(f * 2, i * step, last ? 0.9 : 0.16, "triangle", 0.05);
  });
}
/** 观众欢呼 + 掌声（总冠军时更长更响） */
export function sfxCheer(seconds = 2.5) {
  const c = ac();
  if (!c) return;
  // 人群「哇——」：几层带通噪声，起伏变化
  for (const [f, v] of [
    [700, 0.16],
    [1300, 0.12],
    [2200, 0.08],
  ] as const) {
    const n = noise(0, seconds, v, f, 1.4);
    if (n) {
      for (let t = 0.3; t < seconds - 0.3; t += 0.35)
        n.g.gain.setValueAtTime(v * (0.6 + Math.random() * 0.6), n.t0 + t);
      n.g.gain.exponentialRampToValueAtTime(0.0001, n.t0 + seconds);
    }
  }
  // 掌声：大量随机的短噪声
  const claps = Math.round(seconds * 26);
  for (let i = 0; i < claps; i++) noise(Math.random() * (seconds - 0.2), 0.03, 0.12 + Math.random() * 0.1, 1500 + Math.random() * 2500, 2);
  // 几声口哨
  for (let i = 0; i < Math.max(1, Math.round(seconds / 1.5)); i++) {
    const at = 0.2 + Math.random() * (seconds - 0.8);
    tone(1800 + Math.random() * 600, at, 0.45, "sine", 0.05, 2600 + Math.random() * 500);
  }
}

/** 倒计时「嘀」，最后一下「开跑」更高更长 */
export function sfxCount(final = false) {
  if (final) {
    if (!sample("go", 0.8)) {
      tone(880, 0, 0.5, "square", 0.12);
      tone(1320, 0, 0.5, "triangle", 0.1);
    }
    vibrate([40, 30, 80]);
  } else {
    if (!sample("count", 0.7)) tone(587, 0, 0.16, "square", 0.1);
    vibrate(20);
  }
}
/** 按住掷骰按钮时骰子在手里晃：一下「咔啦」 */
let lastShake = 0;
export function sfxShake() {
  // 按住时每 110ms 调一次；录音约 1.4 秒，播一次就够，间隔内不重复叠加
  const now = Date.now();
  if (!buffers.has("shake")) noise(0, 0.04, 0.16, 2600 + Math.random() * 1400, 3);
  else if (now - lastShake > 1300 && sample("shake", 0.6)) lastShake = now;
  vibrate(6);
}
