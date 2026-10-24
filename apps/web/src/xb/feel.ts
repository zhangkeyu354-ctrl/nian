/** XB唯一反馈入口。复用绘画音频底层，偏好不写dp全局设置。 */
import {
  feel as audioFeel,
  setNormalizedVolume,
  type Cue,
} from "../drawing/feel.ts";
let volume = 0.7;
export function setFeedbackVolume(value: number) {
  volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.7));
  setNormalizedVolume(volume);
}
const audible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";
const playCue = (cue: Cue, sound: boolean) => {
  if (audible())
    audioFeel(cue, { sound, vibration: false, mix: "normalized", volume });
};
export type Feedback =
  | "tap"
  | "confirm"
  | "reveal"
  | "score"
  | "hit"
  | "tick"
  | "turn"
  | "transition"
  | "opening";
export const feedbackPattern = (cue: Feedback): number | number[] | null =>
  cue === "confirm"
    ? 10
    : cue === "hit"
      ? [30, 40, 30]
      : cue === "turn"
        ? [24, 60, 24]
        : cue === "score"
          ? [16, 35, 25]
          : null;
export const motionPolicy = (saved: boolean, reduced: boolean) => ({
  powerSave: saved || reduced,
  particles: !saved && !reduced,
});
export function revealTimeline(elapsed: number, players: number) {
  const scoreAt = 1200 + players * 800;
  return {
    visible: Math.min(
      players,
      Math.max(0, Math.floor((elapsed - 1600) / 800) + 1),
    ),
    settlementIndex:
      elapsed < scoreAt + 400
        ? -1
        : elapsed < scoreAt + 1000
          ? 0
          : elapsed < scoreAt + 1600
            ? 1
            : 2,
    scores: elapsed >= scoreAt + 1600,
    done: elapsed >= Math.max(6000, scoreAt + 2800),
    duration: Math.max(6000, scoreAt + 2800),
    warmup: elapsed < 1200,
    spotlight: elapsed >= scoreAt + 1800,
  };
}
const sounds: Record<Feedback, Cue> = {
  tap: "tap",
  confirm: "stamp",
  reveal: "page",
  score: "win",
  hit: "stamp",
  tick: "tick",
  turn: "turn",
  transition: "page",
  opening: "win",
};
export function feedback(
  cue: Feedback,
  prefs: { sound: boolean; vibration: boolean },
  recipient = true,
) {
  if (!audible()) return;
  playCue(sounds[cue], prefs.sound);
  if (cue === "opening" && prefs.sound) {
    for (const [delay, tone] of [
      [400, "turn"],
      [950, "win"],
    ] as const) {
      const deadline = Date.now() + delay;
      setTimeout(() => {
        if (Date.now() - deadline < 150) playCue(tone, true);
      }, delay);
    }
  }
  const pattern = feedbackPattern(cue);
  if (
    prefs.vibration &&
    recipient &&
    pattern &&
    typeof navigator !== "undefined"
  )
    try {
      navigator.vibrate?.(pattern);
    } catch {}
}
export const tap = (p: Parameters<typeof feedback>[1]) => feedback("tap", p);
export const confirm = (p: Parameters<typeof feedback>[1]) =>
  feedback("confirm", p);
export function reveal(
  p: Parameters<typeof feedback>[1],
  role?: string | null,
  card?: Element | null,
) {
  const play = () => {
    playCue("page", p.sound);
    if (role === "truth" || role === "bluffer")
      playCue(role === "truth" ? "stamp" : "lose", p.sound);
  };
  if (card && typeof requestAnimationFrame !== "undefined") {
    let id = 0,
      cancelled = false;
    const check = () => {
      if (cancelled) return;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(card!).transform);
      if (matrix.m11 <= 0) play();
      else id = requestAnimationFrame(check);
    };
    id = requestAnimationFrame(check);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }
  const timer = setTimeout(play, 400);
  return () => clearTimeout(timer);
}
export const score = (p: Parameters<typeof feedback>[1]) =>
  feedback("score", p);
export const hit = (p: Parameters<typeof feedback>[1], recipient: boolean) =>
  feedback("hit", p, recipient);
export const tick = (p: Parameters<typeof feedback>[1]) => feedback("tick", p);
