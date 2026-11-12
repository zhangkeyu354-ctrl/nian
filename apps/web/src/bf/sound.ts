// 魔王试炼音效与配乐（素材：Kenney / OpenGameArt CC0 等，见交接说明）
export type Sfx =
  | "tap" | "select" | "play" | "draw" | "hit-melee" | "hit-ranged" | "hit-magic" | "shield-break"
  | "boss-attack" | "hurt" | "heal" | "protect" | "curse" | "status" | "slime" | "turn"
  | "boss-down" | "win" | "lose" | "coins";

const A = "/assets/bf";
const VOL: Partial<Record<Sfx, number>> = { tap: 0.35, select: 0.35, turn: 0.5, "boss-attack": 0.55, status: 0.5 };

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 隐私模式：只在本次有效 */
    }
  },
};

let muted = store.get("bf-mute") === "1";
let musicOn = store.get("bf-music") !== "0";
const cache = new Map<Sfx, HTMLAudioElement>();
const last = new Map<Sfx, number>();

export const isMuted = () => muted;
export const isMusicOn = () => musicOn;

export function sfx(name: Sfx) {
  if (muted || typeof Audio === "undefined") return;
  const now = performance.now();
  if (now - (last.get(name) ?? 0) < 70) return; // 同一音效连续触发时合并
  last.set(name, now);
  let base = cache.get(name);
  if (!base) {
    base = new Audio(`${A}/sfx/${name}.mp3`);
    base.preload = "auto";
    cache.set(name, base);
  }
  const a = base.cloneNode(true) as HTMLAudioElement;
  a.volume = VOL[name] ?? 0.7;
  void a.play().catch(() => {});
}

export function preloadSfx(names: Sfx[]) {
  if (typeof Audio === "undefined") return;
  for (const n of names) if (!cache.has(n)) {
    const a = new Audio(`${A}/sfx/${n}.mp3`);
    a.preload = "auto";
    cache.set(n, a);
  }
}

// ———— 配乐：同一时间只放一首，循环 ————
let bgm: HTMLAudioElement | null = null;
let want: string | null = null;

export function setMusic(track: "battle" | "hard" | "dark" | null) {
  want = track;
  if (typeof Audio === "undefined") return;
  if (!track || !musicOn || muted) {
    bgm?.pause();
    return;
  }
  const src = `${A}/bgm/${track}.mp3`;
  if (bgm && bgm.src.endsWith(src)) {
    if (bgm.paused) void bgm.play().catch(() => {});
    return;
  }
  bgm?.pause();
  bgm = new Audio(src);
  bgm.loop = true;
  bgm.volume = 0.32;
  void bgm.play().catch(() => {
    // 浏览器要求先有点击：第一次点击后再开始
    const go = () => {
      document.removeEventListener("pointerdown", go);
      if (want === track) void bgm?.play().catch(() => {});
    };
    document.addEventListener("pointerdown", go, { once: true });
  });
}

export function toggleMute() {
  muted = !muted;
  store.set("bf-mute", muted ? "1" : "0");
  setMusic(want as never);
  return muted;
}

export function toggleMusic() {
  musicOn = !musicOn;
  store.set("bf-music", musicOn ? "1" : "0");
  setMusic(want as never);
  return musicOn;
}

/** 每关配乐：前期普通战斗曲，后期强敌曲，灵魂猎手与巫毒天后用阴森曲 */
export function trackFor(bossId: string | null): "battle" | "hard" | "dark" {
  if (!bossId) return "dark";
  if (bossId === "soulHuntress" || bossId === "madameVoodoo") return "dark";
  if (["magmaros", "bombossa", "jelly", "ogre"].includes(bossId)) return "hard";
  return "battle";
}
