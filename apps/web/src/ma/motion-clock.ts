export type Speed = "slow" | "normal" | "fast";
export const DICE_SETTLE_MS = 900;
const FACTOR: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.5 };
const SPEED_EVENT = "ma-motion-speed";
export function getSpeed(): Speed {
  try {
    const value = localStorage.getItem("ma-speed");
    return value === "slow" || value === "fast" ? value : "normal";
  } catch {
    return "normal";
  }
}
export function setSpeed(speed: Speed) {
  try {
    localStorage.setItem("ma-speed", speed);
  } catch {
    /* Private browsing. */
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SPEED_EVENT));
}
let mediaSource: typeof matchMedia | undefined;
let preference: MediaQueryList | undefined;
let minimal = false;
const preferenceChanged = () => {
  minimal = !!preference?.matches;
};
function motionPreference() {
  if (typeof matchMedia !== "function") return undefined;
  if (mediaSource !== matchMedia) {
    preference?.removeEventListener?.("change", preferenceChanged);
    mediaSource = matchMedia;
    preference = matchMedia("(prefers-reduced-motion: reduce)");
    preferenceChanged();
    preference.addEventListener?.("change", preferenceChanged);
  }
  return preference;
}
export const reduced = () => {
  motionPreference();
  return typeof matchMedia === "function" && minimal;
};
export function motionMs(ms: number, weight = 1) {
  return reduced() ? 0 : ms * weight * FACTOR[getSpeed()];
}

/** CSS and queue use the same local clock; updates do not render React. */
export function installMotionClock(root: HTMLElement) {
  const durations = {
    move: 400,
    step: 480,
    float: 2600,
    link: 2800,
    ring: 900,
    shake: 450,
    hit: 1000,
    knock: 700,
    flow: 500,
    target: 600,
    pulse: 1100,
    spot: 900,
    dice: 750,
    settle: 180,
    stage: 200,
    press: 120,
    "dice-settle": DICE_SETTLE_MS,
    six: 520,
    "podium-jump": 600,
    "podium-third": 600,
    "podium-second": 1200,
    "podium-first": 1900,
  };
  const update = () => {
    const factor = motionMs(1);
    for (const [key, value] of Object.entries(durations))
      root.style.setProperty(`--ma-${key}-ms`, `${value * factor}ms`);
  };
  const query = motionPreference();
  update();
  window.addEventListener(SPEED_EVENT, update);
  window.addEventListener("storage", update);
  query?.addEventListener("change", update);
  return () => {
    window.removeEventListener(SPEED_EVENT, update);
    window.removeEventListener("storage", update);
    query?.removeEventListener("change", update);
  };
}
