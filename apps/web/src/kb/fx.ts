// 卡里巴湖动效 v2：真实卡牌起飞 → 贝塞尔弧线 → 落水（动物跳一下 + 涟漪 + 计数弹跳）。
// 全部用 Web Animations 挂在 body 上，不进 React 状态，不挡点击。
import type { KBEvent } from "../../../../packages/kariba/src/index.ts";

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Pt = { x: number; y: number };
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const rectOf = (el: Element | null) => el?.getBoundingClientRect() ?? null;
const mid = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const slotEl = (v: number) => q(`[data-testid="kb-slot-${v}"]`);
const seatEl = (s: number) => q(`[data-kb-seat="${s}"]`);

/** 二次贝塞尔采样成关键帧：位置连续、速度由 easing 控制，避免折线感 */
function arcFrames(from: Pt, to: Pt, lift: number, size: { w: number; h: number }, s0: number, s1: number, r0: number, r1: number, o1: number) {
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const N = 14;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * c.x + t * t * to.x;
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * c.y + t * t * to.y;
    // 中途略放大（离开桌面的感觉），到达时缩到目标大小
    const bulge = Math.sin(Math.PI * t) * 0.12;
    const sc = s0 + (s1 - s0) * t + bulge;
    const rot = r0 + (r1 - r0) * t;
    frames.push({
      transform: `translate(${x - size.w / 2}px, ${y - size.h / 2}px) rotate(${rot}deg) scale(${sc})`,
      opacity: t < 0.85 ? 1 : 1 - ((t - 0.85) / 0.15) * (1 - o1),
      offset: t,
    });
  }
  return frames;
}

function cardSprite(v: number, w: number, h: number) {
  const el = document.createElement("div");
  el.className = "kb-flycard kb-cardlike v" + v;
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.innerHTML = `<span class="kb-face"><span class="kb-window"><img class="kb-cimg" src="/assets/kariba/${v}.webp" alt="" draggable="false"></span><i class="kb-pip tl">${v}</i><i class="kb-pip br">${v}</i></span>`;
  document.body.appendChild(el);
  return el;
}

/* ---------- 我自己出牌：点下就从手里抬起来，服务器确认后再飞 ---------- */
type Lifted = { el: HTMLElement; src: HTMLElement; from: DOMRect; v: number };
let lifted: Lifted[] = [];

export function liftFromHand(ids: string[]) {
  dropLifted(false);
  if (reducedMotion()) return;
  lifted = ids.flatMap((id, i) => {
    const src = q(`[data-testid="kb-card-${id}"]`);
    const r = rectOf(src);
    if (!src || !r) return [];
    const v = Number(id[1]);
    const el = cardSprite(v, r.width, r.height);
    el.style.transform = `translate(${r.left}px, ${r.top}px)`;
    el.animate(
      [
        { transform: `translate(${r.left}px, ${r.top}px) rotate(0deg) scale(1)` },
        { transform: `translate(${r.left}px, ${r.top - 26 - i * 3}px) rotate(${(i - (ids.length - 1) / 2) * 5}deg) scale(1.08)` },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "forwards" },
    );
    src.style.visibility = "hidden";
    return [{ el, src, from: r, v }];
  });
}

/** 服务器拒绝：飞回原位 */
export function dropLifted(animateBack = true) {
  for (const l of lifted) {
    if (animateBack && !reducedMotion()) {
      const a = l.el.animate([{ transform: `translate(${l.from.left}px, ${l.from.top}px) rotate(0deg) scale(1)` }], {
        duration: 220,
        easing: "ease-out",
        fill: "forwards",
      });
      a.onfinish = () => {
        l.el.remove();
        l.src.style.visibility = "";
      };
    } else {
      l.el.remove();
      l.src.style.visibility = "";
    }
  }
  lifted = [];
}

/* ---------- 落地反馈 ---------- */
function land(v: number, at: number) {
  const slot = slotEl(v);
  if (!slot) return;
  const ico = slot.querySelector(".kb-ico") as HTMLElement | null;
  const cnt = slot.querySelector(".kb-cnt") as HTMLElement | null;
  ico?.animate(
    [
      { transform: "translateY(0) scale(1,1)" },
      { transform: "translateY(4px) scale(1.12,0.86)", offset: 0.18 },
      { transform: "translateY(-16px) scale(0.94,1.08)", offset: 0.48 },
      { transform: "translateY(0) scale(1.05,0.95)", offset: 0.78 },
      { transform: "translateY(0) scale(1,1)" },
    ],
    { duration: 560, delay: at, easing: "ease-out" },
  );
  cnt?.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.35 }, { transform: "scale(0.92)", offset: 0.7 }, { transform: "scale(1)" }],
    { duration: 480, delay: at + 60, easing: "ease-out" },
  );
  const r = rectOf(slot);
  if (!r) return;
  for (let k = 0; k < 2; k++) {
    const ring = document.createElement("i");
    ring.className = "kb-ripplefx";
    const w = r.width * 0.9;
    ring.style.width = w + "px";
    ring.style.height = w * 0.38 + "px";
    ring.style.left = r.left + r.width / 2 - w / 2 + "px";
    ring.style.top = r.top + r.height * 0.86 - w * 0.19 + "px";
    document.body.appendChild(ring);
    const a = ring.animate(
      [{ transform: "scale(0.35)", opacity: 0.9 }, { transform: "scale(1.5)", opacity: 0 }],
      { duration: 700, delay: at + k * 140, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
    );
    a.onfinish = a.oncancel = () => ring.remove();
  }
}

function pop(text: string, at: Pt, delay: number, cls = "") {
  const el = document.createElement("div");
  el.className = "kb-pop " + cls;
  el.textContent = text;
  document.body.appendChild(el);
  const a = el.animate(
    [
      { transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(0.3)`, opacity: 0 },
      { transform: `translate(${at.x}px, ${at.y - 22}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${at.x}px, ${at.y - 30}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${at.x}px, ${at.y - 50}px) translate(-50%, -50%) scale(0.95)`, opacity: 0 },
    ],
    { duration: 1400, delay, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" },
  );
  a.onfinish = a.oncancel = () => el.remove();
}

/** 播放一次出牌；返回总时长（毫秒） */
export function playFlights(events: KBEvent[], me: number, onChase?: (mine: boolean) => void): number {
  if (reducedMotion()) {
    dropLifted(false);
    return 0;
  }
  let end = 0;
  const play = events.find((e) => e.type === "PLAY");
  const chase = events.find((e) => e.type === "CHASE");
  const slotR = play && play.type === "PLAY" ? rectOf(slotEl(play.value)) : null;

  if (play && play.type === "PLAY" && slotR) {
    const to = { x: slotR.left + slotR.width / 2, y: slotR.top + slotR.height * 0.55 };
    const mine = play.seat === me && lifted.length > 0;
    const sources: { el: HTMLElement; from: Pt; w: number; h: number }[] = [];
    if (mine) {
      for (const l of lifted) {
        // 从抬起后的位置接着飞（先取消抬起动画，固定当前位置）
        const now = l.el.getBoundingClientRect();
        l.el.getAnimations().forEach((a) => a.cancel());
        sources.push({ el: l.el, from: mid(now), w: l.from.width, h: l.from.height });
      }
      lifted = [];
    } else {
      const seat = rectOf(seatEl(play.seat));
      const hand = rectOf(q('[data-testid="kb-hand"] .kb-card'));
      const w = hand?.width ?? 60, h = hand?.height ?? 84;
      const from = seat ? mid(seat) : { x: innerWidth / 2, y: innerHeight };
      for (let i = 0; i < Math.min(play.count, 5); i++) sources.push({ el: cardSprite(play.value, w, h), from, w, h });
    }
    const targetScale = (slotR.width * 0.62) / (sources[0]?.w ?? 60);
    sources.forEach((s, i) => {
      const delay = i * 85;
      const dur = 520 + Math.min(240, Math.hypot(to.x - s.from.x, to.y - s.from.y) * 0.35);
      const spin = (i - (sources.length - 1) / 2) * 7;
      const startScale = mine ? 1.08 : 0.4;
      const a = s.el.animate(arcFrames(s.from, { x: to.x + (i - (sources.length - 1) / 2) * 4, y: to.y }, 70 + i * 6, { w: s.w, h: s.h }, startScale, targetScale, spin, spin * -0.4, 0), {
        duration: dur,
        delay,
        easing: "cubic-bezier(.33,.0,.2,1)",
        fill: "both",
      });
      a.onfinish = a.oncancel = () => {
        s.el.remove();
        if (mine) document.querySelectorAll('[data-testid^="kb-card-"]').forEach((c) => ((c as HTMLElement).style.visibility = ""));
      };
      end = Math.max(end, delay + dur);
    });
    land(play.value, end - 120);
  } else {
    dropLifted(false);
  }

  if (chase && chase.type === "CHASE") {
    const fromR = rectOf(slotEl(chase.target));
    const seatR = rectOf(seatEl(chase.seat));
    if (fromR && seatR) {
      const start = end + 160;
      const from = { x: fromR.left + fromR.width / 2, y: fromR.top + fromR.height * 0.5 };
      const to = mid(seatR);
      // 被赶的动物先慌张一抖
      (slotEl(chase.target)?.querySelector(".kb-ico") as HTMLElement | null)?.animate(
        [{ transform: "rotate(0)" }, { transform: "rotate(-10deg) translateY(-4px)" }, { transform: "rotate(10deg)" }, { transform: "rotate(-6deg) translateY(-2px)" }, { transform: "rotate(0)" }],
        { duration: 360, delay: start - 360 > 0 ? start - 360 : 0 },
      );
      setTimeout(() => onChase?.(chase.seat === me), start);
      const n = Math.min(chase.cards, 8);
      const w = fromR.width * 0.78, h = w;
      let last = start;
      for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        el.className = "kb-fly";
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.innerHTML = `<img src="/assets/kariba/${chase.target}.webp" alt="" draggable="false">`;
        document.body.appendChild(el);
        const delay = start + i * 70;
        const dur = 640 + i * 20;
        const jitter = { x: from.x + (i % 3 - 1) * 10, y: from.y + (i % 2) * 6 };
        const a = el.animate(arcFrames(jitter, to, 110 + (i % 3) * 18, { w, h }, 1, 0.35, 0, (i % 2 ? 1 : -1) * (18 + i * 5), 0.15), {
          duration: dur,
          delay,
          easing: "cubic-bezier(.45,0,.25,1)",
          fill: "both",
        });
        a.onfinish = a.oncancel = () => el.remove();
        last = Math.max(last, delay + dur);
      }
      seatEl(chase.seat)?.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.1)", offset: 0.4 }, { transform: "scale(0.97)", offset: 0.75 }, { transform: "scale(1)" }],
        { duration: 460, delay: last - 160, easing: "ease-out" },
      );
      pop(`+${chase.cards}`, to, last - 220, chase.by === 1 ? "mouse" : "");
      if (chase.by === 1) pop("🐭 吓跑大象！", { x: from.x, y: from.y - 30 }, start, "big");
      end = last + 300;
    }
  }
  return end;
}

/** 终局撒彩纸 */
export function confetti() {
  if (reducedMotion()) return;
  const colors = ["#ff8a3d", "#ffc83d", "#4cd18a", "#59b8ff", "#c38bff", "#f4e6c8"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("i");
    el.className = "kb-confetti";
    el.style.background = colors[i % colors.length];
    el.style.left = Math.random() * 100 + "vw";
    document.body.appendChild(el);
    const a = el.animate(
      [
        { transform: `translateY(-20px) rotate(0)`, opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 160}px, 105vh) rotate(${Math.random() * 720}deg)`, opacity: 0.9 },
      ],
      { duration: 1600 + Math.random() * 1200, delay: Math.random() * 400, easing: "cubic-bezier(.2,.6,.4,1)" },
    );
    a.onfinish = a.oncancel = () => el.remove();
  }
}
